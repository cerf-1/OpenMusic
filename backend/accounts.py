"""Telegram OIDC, opaque server sessions and user-scoped favorites."""
import base64
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode, urlsplit

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from database import database
import settings

router = APIRouter(prefix='/api/v1')
DEMO_TRACKS = frozenset(('weightless', 'ocean-drive', 'midnight-city', 'in-bloom', 'slow-motion',
                         'somewhere-else', 'first-light', 'saltwater', 'neon-memories', 'golden',
                         'warm-sand', 'between-the-trees'))
DEMO_ALBUMS = frozenset(('afterglow', 'blue-hours', 'night-people', 'soft-focus', 'dune', 'evergreen'))


def digest(token):
    return hashlib.sha256(token.encode()).digest()


def expiry(seconds):
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=seconds)


def set_cookie(response, name, value, seconds):
    response.set_cookie(name, value, max_age=seconds, httponly=True, secure=settings.PRODUCTION,
                        samesite='lax', path='/')


def session(request: Request):
    token = request.cookies.get(settings.SESSION_COOKIE, '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        raise HTTPException(401, 'Войдите через Telegram')
    with database() as cursor:
        cursor.execute('SELECT u.id, u.name, u.username, u.avatar, s.csrf_token FROM sessions s '
                       'JOIN users u ON u.id=s.user_id WHERE s.token_hash=%s AND s.expires_at>UTC_TIMESTAMP(6)',
                       (digest(token),))
        user = cursor.fetchone()
    if not user:
        raise HTTPException(401, 'Сессия истекла. Войдите снова')
    return user


def mutation(request: Request, user=Depends(session)):
    origin = request.headers.get('origin')
    if origin not in [settings.PUBLIC_ORIGIN, *settings.ALLOWED_ORIGINS] or not secrets.compare_digest(
            request.headers.get('x-csrf-token', ''), user['csrf_token']):
        raise HTTPException(403, 'Обновите страницу и повторите действие')
    return user


@router.get('/auth/telegram/start')
def start():
    if not settings.CLIENT_ID or not settings.CLIENT_SECRET:
        raise HTTPException(503, 'Вход через Telegram ещё не настроен')
    state, browser, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    with database() as cursor:
        cursor.execute('DELETE FROM oauth_states WHERE expires_at<=UTC_TIMESTAMP(6)')
        cursor.execute('DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP(6)')
        cursor.execute('INSERT INTO oauth_states (state_hash,browser_hash,verifier,expires_at) VALUES (%s,%s,%s,%s)',
                       (digest(state), digest(browser), verifier, expiry(600)))
    challenge = base64.urlsafe_b64encode(digest(verifier)).decode().rstrip('=')
    response = RedirectResponse(settings.ISSUER + '/auth?' + urlencode({
        'client_id': settings.CLIENT_ID, 'redirect_uri': settings.CALLBACK_URL,
        'response_type': 'code', 'scope': 'openid profile', 'state': state,
        'code_challenge': challenge, 'code_challenge_method': 'S256'}), status_code=302)
    set_cookie(response, settings.STATE_COOKIE, browser, 600)
    return response


def verify_token(token):
    """Only Telegram's fixed JWKS endpoint and RS256 keys are trusted."""
    try:
        # Fetch with bounded timeout and without redirects; never follow token-supplied key URLs.
        response = httpx.get(settings.ISSUER + '/.well-known/jwks.json', timeout=8)
        response.raise_for_status()
        keys = jwt.PyJWKSet.from_dict(response.json())
        header = jwt.get_unverified_header(token)
        key = next((key for key in keys.keys if key.key_id == header.get('kid')
                    and key.algorithm_name == 'RS256'), None)
        if key is None:
            raise jwt.InvalidTokenError('Unknown key')
        claims = jwt.decode(token, key.key, algorithms=['RS256'], audience=settings.CLIENT_ID,
                            issuer=settings.ISSUER, options={'require': ['iss', 'sub', 'aud', 'exp', 'iat']})
        if (not isinstance(claims['sub'], str) or not re.fullmatch(r'[\x21-\x7e]{1,191}', claims['sub'])
                or not isinstance(claims.get('name', ''), str)
                or len(claims.get('name', '')) > 256):
            raise jwt.InvalidTokenError('Invalid profile')
        for key, limit in [('preferred_username', 128), ('picture', 2048)]:
            if claims.get(key) is not None and (not isinstance(claims[key], str) or len(claims[key]) > limit):
                raise jwt.InvalidTokenError('Invalid profile')
        if claims.get('picture') and urlsplit(claims['picture']).scheme != 'https':
            raise jwt.InvalidTokenError('Invalid picture')
        return claims
    except httpx.HTTPError:
        raise HTTPException(502, 'Telegram временно недоступен') from None
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        raise HTTPException(401, 'Недействительный токен Telegram') from None


@router.get('/auth/telegram/callback')
def callback(request: Request, state: str = Query(max_length=128),
             code: str | None = Query(default=None, max_length=4096)):
    browser = request.cookies.get(settings.STATE_COOKIE, '')
    # Consume under a row lock before code exchange. Replays fail across workers and restarts.
    with database() as cursor:
        cursor.execute('SELECT browser_hash,verifier FROM oauth_states WHERE state_hash=%s '
                       'AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE', (digest(state),))
        pending = cursor.fetchone()
        if not pending or not secrets.compare_digest(pending['browser_hash'], digest(browser)):
            raise HTTPException(401, 'Недействительный или использованный state')
        cursor.execute('DELETE FROM oauth_states WHERE state_hash=%s', (digest(state),))
    if not code:
        raise HTTPException(401, 'Вход отменён')
    try:
        response = httpx.post(settings.ISSUER + '/token', data={
            'grant_type': 'authorization_code', 'code': code, 'redirect_uri': settings.CALLBACK_URL,
            'client_id': settings.CLIENT_ID, 'code_verifier': pending['verifier']},
            auth=(settings.CLIENT_ID, settings.CLIENT_SECRET), timeout=8)
        if response.status_code in (400, 401):
            raise HTTPException(401, 'Код Telegram недействителен')
        response.raise_for_status()
        claims = verify_token(response.json()['id_token'])
    except httpx.HTTPError:
        raise HTTPException(502, 'Telegram временно недоступен') from None
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, 'Некорректный ответ Telegram') from None
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with database() as cursor:
        cursor.execute('INSERT INTO users (telegram_issuer,telegram_subject,name,username,avatar) '
                       'VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE '
                       'name=VALUES(name),username=VALUES(username),avatar=VALUES(avatar)',
                       (claims['iss'], claims['sub'], claims.get('name') or 'Telegram user',
                        claims.get('preferred_username'), claims.get('picture')))
        cursor.execute('SELECT id FROM users WHERE telegram_issuer=%s AND telegram_subject=%s',
                       (claims['iss'], claims['sub']))
        user_id = cursor.fetchone()['id']
        cursor.execute('DELETE FROM sessions WHERE token_hash=%s',
                       (digest(request.cookies.get(settings.SESSION_COOKIE, '')),))
        cursor.execute('INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES (%s,%s,%s,%s)',
                       (digest(token), user_id, csrf, expiry(settings.SESSION_SECONDS)))
    response = RedirectResponse(settings.FRONTEND_URL, status_code=302)
    set_cookie(response, settings.SESSION_COOKIE, token, settings.SESSION_SECONDS)
    response.delete_cookie(settings.STATE_COOKIE, path='/', secure=settings.PRODUCTION, httponly=True, samesite='lax')
    return response


@router.get('/auth/me')
def me(user=Depends(session)):
    return {'user': {key: user[key] for key in ('id', 'name', 'username', 'avatar')}, 'csrf_token': user['csrf_token']}


@router.post('/auth/logout')
def logout(request: Request, user=Depends(mutation)):
    with database() as cursor:
        cursor.execute('DELETE FROM sessions WHERE token_hash=%s', (digest(request.cookies[settings.SESSION_COOKIE]),))
    response = Response(status_code=204)
    response.delete_cookie(settings.SESSION_COOKIE, path='/', secure=settings.PRODUCTION, httponly=True, samesite='lax')
    return response


class Metadata(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    title: str = Field(min_length=1, max_length=300)
    artist: str = Field(max_length=300)
    cover: str | None = Field(default=None, max_length=2048)
    duration_seconds: int | None = Field(default=None, ge=0, le=604800)

    @field_validator('title')
    @classmethod
    def title_not_blank(cls, value):
        if not value.strip():
            raise ValueError('Empty title')
        return value

    @field_validator('cover')
    @classmethod
    def safe_cover(cls, value):
        if value is not None and not (re.fullmatch(r'\./assets/[a-z0-9-]+\.(jpg|png)', value)
                                      or (urlsplit(value).scheme == 'https' and urlsplit(value).hostname
                                          and not urlsplit(value).username and not any(c.isspace() for c in value))):
            raise ValueError('Invalid cover')
        return value


def identity(kind, source, source_id):
    valid = (kind == 'track' and source == 'youtube' and re.fullmatch(r'[A-Za-z0-9_-]{11}', source_id)
             or source == 'demo' and source_id in (DEMO_TRACKS if kind == 'track' else DEMO_ALBUMS))
    if not valid:
        raise HTTPException(422, 'Неизвестный тип, источник или ID')


@router.get('/likes')
def likes(type: Literal['track', 'album'], limit: int = Query(default=50, ge=1, le=100),
          offset: int = Query(default=0, ge=0, le=2147483647), user=Depends(session)):
    with database() as cursor:
        cursor.execute('SELECT id,type,source,source_id,title,artist,cover,duration_seconds,created_at '
                       'FROM likes WHERE user_id=%s AND type=%s ORDER BY created_at DESC,id DESC LIMIT %s OFFSET %s',
                       (user['id'], type, limit + 1, offset))
        rows = cursor.fetchall()
    return {'items': rows[:limit], 'has_more': len(rows) > limit}


@router.put('/likes/{type}/{source}/{source_id}')
def put_like(type: Literal['track', 'album'], source: str, source_id: str,
             body: Metadata, user=Depends(mutation)):
    identity(type, source, source_id)
    with database() as cursor:
        cursor.execute('INSERT INTO likes (user_id,type,source,source_id,title,artist,cover,duration_seconds) '
                       'VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE '
                       'title=VALUES(title),artist=VALUES(artist),cover=VALUES(cover),duration_seconds=VALUES(duration_seconds)',
                       (user['id'], type, source, source_id, body.title, body.artist, body.cover, body.duration_seconds))
    return {'saved': True}


@router.delete('/likes/{type}/{source}/{source_id}', status_code=204)
def delete_like(type: Literal['track', 'album'], source: str, source_id: str, user=Depends(mutation)):
    identity(type, source, source_id)
    with database() as cursor:
        cursor.execute('DELETE FROM likes WHERE user_id=%s AND type=%s AND source=%s AND source_id=%s',
                       (user['id'], type, source, source_id))
