"""Real MariaDB integration tests. TEST_DB_NAME must name a disposable *_test database."""
import base64
import hashlib
import json
import os
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pymysql
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

import accounts
import app
import settings
from database import database
from migrate import migrate


@pytest.fixture(scope='module', autouse=True)
def maria():
    name = os.getenv('TEST_DB_NAME')
    if not name:
        pytest.skip('Set TEST_DB_NAME to run against a real MariaDB')
    if not name.endswith('_test'):
        pytest.fail('Refusing to erase a database whose name does not end in _test')
    old = os.environ.get('DB_NAME')
    os.environ['DB_NAME'] = name
    migrate()
    migrate()  # Applying twice is safe.
    yield
    if old is None:
        os.environ.pop('DB_NAME', None)
    else:
        os.environ['DB_NAME'] = old


@pytest.fixture(autouse=True)
def clean():
    with database() as cursor:
        for table in ['likes', 'sessions', 'users', 'oauth_states']:
            cursor.execute(f'DELETE FROM {table}')


@pytest.fixture
def oidc(monkeypatch):
    monkeypatch.setattr(settings, 'CLIENT_ID', '12345')
    monkeypatch.setattr(settings, 'CLIENT_SECRET', 'test-secret')
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    public.update(kid='telegram-test', alg='RS256', use='sig')
    claims = {'iss': settings.ISSUER, 'sub': '123456789', 'aud': settings.CLIENT_ID,
              'iat': int(time.time()), 'exp': int(time.time()) + 600, 'name': 'Listener',
              'preferred_username': 'listener'}
    calls = []

    def exchange(url, **kwargs):
        calls.append(kwargs)
        assert url == settings.ISSUER + '/token'
        return httpx.Response(200, json={'id_token': jwt.encode(claims, key, algorithm='RS256', headers={'kid': 'telegram-test'})}, request=httpx.Request('POST', url))

    monkeypatch.setattr(accounts.httpx, 'post', exchange)
    monkeypatch.setattr(accounts.httpx, 'get', lambda url, **kw: httpx.Response(
        200, json={'keys': [public]}, request=httpx.Request('GET', url)))
    return claims, calls, key


def begin(client):
    response = client.get('/api/v1/auth/telegram/start', follow_redirects=False)
    assert response.status_code == 302
    params = parse_qs(urlsplit(response.headers['location']).query)
    assert params['scope'] == ['openid profile']
    assert params['code_challenge_method'] == ['S256']
    assert 'httponly' in response.headers['set-cookie'].lower()
    return params


def login(oidc, subject='123456789'):
    oidc[0]['sub'] = subject
    client = TestClient(app.app)
    params = begin(client)
    response = client.get('/api/v1/auth/telegram/callback', params={'state': params['state'][0], 'code': 'code'}, follow_redirects=False)
    assert response.status_code == 302, response.text
    user = client.get('/api/v1/auth/me').json()
    client.headers.update({'Origin': settings.PUBLIC_ORIGIN, 'X-CSRF-Token': user['csrf_token']})
    return client, user


BODY = {'title': 'Weightless', 'artist': 'Sora', 'cover': './assets/hero.png', 'duration_seconds': 218}
TRACK = '/api/v1/likes/track/demo/weightless'


def test_login_pkce_replay_and_identity(oidc):
    client, user = login(oidc)
    call = oidc[1][0]
    assert call['auth'] == ('12345', 'test-secret')
    assert call['data']['grant_type'] == 'authorization_code'
    assert len(call['data']['code_verifier']) == 43
    params = begin(client)
    verifier = None
    with database() as cursor:
        cursor.execute('SELECT verifier FROM oauth_states WHERE state_hash=%s', (accounts.digest(params['state'][0]),))
        verifier = cursor.fetchone()['verifier']
    assert params['code_challenge'][0] == base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    args = {'state': params['state'][0], 'code': 'new-code'}
    assert client.get('/api/v1/auth/telegram/callback', params=args, follow_redirects=False).status_code == 302
    assert client.get('/api/v1/auth/telegram/callback', params=args, follow_redirects=False).status_code == 401
    assert client.get('/api/v1/auth/me').json()['user']['id'] == user['user']['id']
    with database() as cursor:
        cursor.execute('SELECT token_hash,expires_at FROM sessions')
        rows = cursor.fetchall()
    assert len(rows) == 1 and len(rows[0]['token_hash']) == 32
    assert rows[0]['token_hash'] != client.cookies.get(settings.SESSION_COOKIE).encode()
    assert 29 <= (rows[0]['expires_at'] - accounts.expiry(0)).days <= 30


@pytest.mark.parametrize('change', [
    {'iss': 'https://evil.example'}, {'aud': 'another-app'}, {'exp': 1}, {'sub': ''},
])
def test_invalid_claims(oidc, change):
    client = TestClient(app.app)
    params = begin(client)
    oidc[0].update(change)
    args = {'state': params['state'][0], 'code': 'code'}
    assert client.get('/api/v1/auth/telegram/callback', params=args, follow_redirects=False).status_code == 401
    assert client.get('/api/v1/auth/telegram/callback', params=args, follow_redirects=False).status_code == 401
    with database() as cursor:
        cursor.execute('SELECT COUNT(*) n FROM users')
        assert cursor.fetchone()['n'] == 0


def test_liked_collaboration_keeps_each_credit(oidc):
    client, _ = login(oidc)
    url = '/api/v1/likes/track/youtube/abcdefghijk'
    metadata = {**BODY, 'artist': 'VILLIAN, madk1d'}
    credits = [{'name': 'VILLIAN', 'browse_id': 'UC' + 'a' * 22}, {'name': 'madk1d'}]
    assert client.put(url, json={**metadata, 'artist_credits': credits}).status_code == 200
    assert client.put(url, json=metadata).status_code == 200
    item = client.get('/api/v1/likes?type=track').json()['items'][0]
    assert item['artist_credits'] == credits


def test_forged_token_and_wrong_browser(oidc, monkeypatch):
    client = TestClient(app.app)
    params = begin(client)
    args = {'state': params['state'][0], 'code': 'code'}
    stranger = TestClient(app.app)
    assert stranger.get('/api/v1/auth/telegram/callback', params=args).status_code == 401
    assert client.get('/api/v1/auth/telegram/callback', params={'state': 'wrong', 'code': 'code'}).status_code == 401
    evil_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(oidc[0], evil_key, algorithm='RS256', headers={'kid': 'telegram-test'})
    monkeypatch.setattr(accounts.httpx, 'post', lambda url, **kw: httpx.Response(200, json={'id_token': forged}, request=httpx.Request('POST', url)))
    assert client.get('/api/v1/auth/telegram/callback', params=args).status_code == 401


def test_expired_state(oidc):
    client = TestClient(app.app)
    params = begin(client)
    with database() as cursor:
        cursor.execute('UPDATE oauth_states SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND')
    assert client.get('/api/v1/auth/telegram/callback', params={'state':params['state'][0], 'code':'code'}).status_code == 401


def test_likes_isolation_idempotency_and_sessions(oidc):
    first, user = login(oidc)
    second, _ = login(oidc, 'second-user')
    guest = TestClient(app.app)
    for path in ['/api/v1/likes?type=track', '/api/v1/auth/me']:
        assert guest.get(path).status_code == 401
    assert guest.put(TRACK, json=BODY).status_code == 401
    assert guest.delete(TRACK).status_code == 401
    assert first.put(TRACK, json=BODY).status_code == 200
    before = first.get('/api/v1/likes?type=track').json()['items'][0]
    assert first.put(TRACK, json=BODY).status_code == 200
    assert first.get('/api/v1/likes?type=track').json()['items'][0]['created_at'] == before['created_at']
    assert second.get('/api/v1/likes?type=track').json()['items'] == []
    assert second.delete(TRACK).status_code == 204
    assert len(first.get('/api/v1/likes?type=track').json()['items']) == 1
    assert first.put('/api/v1/likes/album/demo/afterglow', json=BODY).status_code == 200
    assert len(first.get('/api/v1/likes?type=track').json()['items']) == 1
    assert len(first.get('/api/v1/likes?type=album').json()['items']) == 1
    # A second device/session for the same identity sees persisted favorites.
    other_device, same = login(oidc)
    assert same['user']['id'] == user['user']['id']
    assert len(other_device.get('/api/v1/likes?type=track').json()['items']) == 1
    old_token = first.cookies.get(settings.SESSION_COOKIE)
    assert first.post('/api/v1/auth/logout').status_code == 204
    assert first.get('/api/v1/auth/me').status_code == 401
    first.cookies.set(settings.SESSION_COOKIE, old_token)
    assert first.get('/api/v1/likes?type=track').status_code == 401
    with database() as cursor:
        cursor.execute('UPDATE sessions SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND')
    assert other_device.get('/api/v1/auth/me').status_code == 401


def test_concurrent_case_sensitive_pagination_and_delete(oidc):
    client, _ = login(oidc)
    def put(_):
        with TestClient(app.app) as parallel:
            parallel.cookies.update(client.cookies)
            parallel.headers.update(client.headers)
            return parallel.put(TRACK, json=BODY).status_code
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert list(pool.map(put, range(16))) == [200]*16
    assert len(client.get('/api/v1/likes?type=track').json()['items']) == 1
    for video in ['abcdefghijk', 'Abcdefghijk']:
        assert client.put('/api/v1/likes/track/youtube/'+video, json=BODY).status_code == 200
    page = client.get('/api/v1/likes?type=track&limit=2').json()
    assert page['has_more'] and [item['source_id'] for item in page['items']] == ['Abcdefghijk','abcdefghijk']
    tail = client.get('/api/v1/likes?type=track&limit=2&offset=2').json()
    assert not tail['has_more'] and tail['items'][0]['source_id'] == 'weightless'
    assert client.delete(TRACK).status_code == client.delete(TRACK).status_code == 204


def test_csrf_validation_and_cookie_flags(oidc, monkeypatch):
    client, _ = login(oidc)
    for origin, csrf in [('https://evil.example', client.headers['X-CSRF-Token']), (settings.PUBLIC_ORIGIN, 'wrong'), ('', '')]:
        assert client.put(TRACK, json=BODY, headers={'Origin':origin,'X-CSRF-Token':csrf}).status_code == 403
        assert client.post('/api/v1/auth/logout', headers={'Origin':origin,'X-CSRF-Token':csrf}).status_code == 403
    for path, body in [(TRACK, {**BODY,'user_id':99}), (TRACK, {**BODY,'stream_url':'https://audio'}),
                       (TRACK, {**BODY,'duration_seconds': True}), (TRACK, {**BODY,'title':'x'*301}),
                       (TRACK, {**BODY,'cover':'javascript:alert(1)'}),
                       ('/api/v1/likes/album/youtube/abcdefghijk',BODY),
                       ('/api/v1/likes/track/demo/0',BODY), ('/api/v1/likes/track/youtube/bad',BODY)]:
        assert client.put(path, json=body).status_code == 422
    assert client.get('/api/v1/likes?type=track&limit=101').status_code == 422
    assert client.get('/api/v1/likes?type=track&offset=-1').status_code == 422
    assert client.get('/api/v1/auth/me').headers['cache-control'] == 'no-store'
    monkeypatch.setattr(settings, 'PRODUCTION', True)
    response = client.get('/api/v1/auth/telegram/start', follow_redirects=False)
    assert 'Secure' in response.headers['set-cookie'] and 'SameSite=lax' in response.headers['set-cookie']


def test_database_outage_does_not_break_music(oidc, monkeypatch):
    client, _ = login(oidc)
    def unavailable():
        raise pymysql.OperationalError(2003, 'unavailable')
    monkeypatch.setattr(accounts, 'database', unavailable)
    for method, path in [('get','/api/v1/auth/me'), ('get','/api/v1/auth/telegram/start'),
                         ('get','/api/v1/auth/telegram/callback?state=x&code=y'),
                         ('get','/api/v1/likes?type=track'), ('delete',TRACK),
                         ('post','/api/v1/auth/logout')]:
        response = getattr(client, method)(path)
        assert response.status_code == 503 and response.json()['error']['code'] == 'DATABASE_UNAVAILABLE'
    assert client.put(TRACK, json=BODY).status_code == 503
    monkeypatch.setattr(app, 'run_resolve', lambda *a, **kw: ('ok', {'items':[], 'page':1, 'has_more':False}))
    assert client.post('/api/v1/search', json={'query':'music'}).status_code == 200
    assert client.get('/').status_code == 200


def test_concurrent_callback_is_consumed_once(oidc):
    client = TestClient(app.app)
    params = begin(client)
    def exchange(_):
        with TestClient(app.app) as parallel:
            parallel.cookies.update(client.cookies)
            return parallel.get('/api/v1/auth/telegram/callback', params={
                'state':params['state'][0], 'code':'one-code'}, follow_redirects=False).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(exchange, range(2))) == [302, 401]
    assert len(oidc[1]) == 1


def test_callback_query_not_logged():
    import logging
    record = logging.LogRecord('uvicorn.access', logging.INFO, '', 0, '%s - "%s %s HTTP/%s" %d',
                               ('127.0.0.1', 'GET', '/api/v1/auth/telegram/callback?code=secret&state=private', '1.1', 302), None)
    app.RedactOAuthQuery().filter(record)
    assert 'secret' not in record.getMessage() and 'private' not in record.getMessage()


def test_account_survives_new_backend_process(oidc):
    import subprocess
    import sys
    from pathlib import Path
    client, _ = login(oidc)
    assert client.put(TRACK, json=BODY).status_code == 200
    probe = '''
import json, sys
from fastapi.testclient import TestClient
from app import app
import settings
client = TestClient(app)
client.cookies.set(settings.SESSION_COOKIE, sys.stdin.read())
assert client.get('/api/v1/auth/me').status_code == 200
items = client.get('/api/v1/likes?type=track').json()['items']
assert items[0]['source_id'] == 'weightless'
print('fresh backend process: persisted account and favorite OK')
'''
    result = subprocess.run([sys.executable, '-c', probe], input=client.cookies.get(settings.SESSION_COOKIE),
                            text=True, capture_output=True, cwd=Path(__file__).parent, timeout=20)
    assert result.returncode == 0, result.stderr


def test_real_connection_failure_returns_503(oidc, monkeypatch):
    client, _ = login(oidc)
    monkeypatch.setenv('DB_PORT', '1')
    response = client.get('/api/v1/likes?type=track')
    assert response.status_code == 503 and response.json()['error']['code'] == 'DATABASE_UNAVAILABLE'
