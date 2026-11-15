"""Local API. Each resolve runs in a disposable process with a hard deadline."""
import asyncio
import logging
import multiprocessing
import os
import signal
import re
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi import HTTPException
from pathlib import Path
import pymysql
import settings
from accounts import router as accounts_router
from pydantic import BaseModel, ConfigDict, model_validator, Field
from resolver import resolve, search, ResolveError
from audio_relay import register_audio, relay_audio

class RedactOAuthQuery(logging.Filter):
    def filter(self, record):
        # Uvicorn logs request targets including query strings by default.
        if isinstance(record.args, tuple) and len(record.args) == 5:
            args = list(record.args)
            if isinstance(args[2], str) and args[2].startswith('/api/v1/auth/telegram/callback'):
                args[2] = args[2].split('?', 1)[0]
                record.args = tuple(args)
        return True


logging.getLogger('uvicorn.access').addFilter(RedactOAuthQuery())
log = logging.getLogger('openmusic')
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=settings.ALLOWED_ORIGINS, allow_credentials=True, allow_methods=['POST', 'GET', 'PUT', 'DELETE'], allow_headers=['Content-Type', 'Range', 'X-CSRF-Token'], expose_headers=['Content-Length', 'Content-Range', 'Accept-Ranges'])
app.include_router(accounts_router)


@app.middleware('http')
async def private_responses(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(('/api/v1/auth', '/api/v1/likes')):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
    return response


@app.exception_handler(pymysql.MySQLError)
async def database_unavailable(request: Request, exc):
    return error('DATABASE_UNAVAILABLE', 'База данных временно недоступна. Повторите позже', 503)


@app.exception_handler(HTTPException)
async def account_error(request: Request, exc):
    return error('AUTH_REQUIRED' if exc.status_code == 401 else 'REQUEST_FAILED', exc.detail, exc.status_code)


class ResolveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    query: str | None = None
    video_id: str | None = None

    @model_validator(mode='after')
    def validate_request(self):
        if len(self.model_fields_set) != 1 or (self.query is None) == (self.video_id is None):
            raise ValueError('exactly one field required')
        if self.query is not None:
            self.query = self.query.strip()
            if not 1 <= len(self.query) <= 300:
                raise ValueError('invalid query')
        if self.video_id is not None and not re.fullmatch(r'[A-Za-z0-9_-]{11}', self.video_id):
            raise ValueError('invalid video id')
        return self


def error(code, message, status):
    return JSONResponse({'error': {'code': code, 'message': message}}, status_code=status, headers={'Cache-Control': 'no-store'})


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    return error('INVALID_REQUEST', 'Некорректный запрос', 422)


def worker(conn, query, video_id, page=None):
    if os.name == 'posix':
        os.setsid()
    try:
        conn.send(('ok', search(query, page) if page is not None else resolve(query, video_id)))
    except ResolveError as exc:
        log.warning('Resolve failed: %s', exc.code)
        conn.send(('error', (exc.code, exc.message)))
    except Exception as exc:
        log.warning('Resolve failed: %s', type(exc).__name__)
        conn.send(('error', ('RESOLVE_FAILED', 'Не удалось получить данные трека')))
    finally:
        conn.close()


def run_resolve(query, video_id, timeout=30, page=None):
    ctx = multiprocessing.get_context('spawn')
    parent, child = ctx.Pipe(duplex=False)
    process = ctx.Process(target=worker, args=(child, query, video_id, page))
    start = time.monotonic()
    try:
        process.start()
        child.close()
        if parent.poll(max(0, timeout - (time.monotonic() - start))):
            try:
                return parent.recv()
            except EOFError:
                return ('error', ('RESOLVE_FAILED', 'Не удалось получить данные трека'))
        log.warning('Resolve timed out')
        return ('error', ('RESOLVE_TIMEOUT', 'Превышено время ожидания'))
    finally:
        parent.close()
        child.close()
        if process.pid is not None:
            if process.is_alive():
                if os.name == 'posix':
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        process.terminate()
                else:
                    process.terminate()
            process.join(timeout=1)
            if process.is_alive():
                process.kill()
                process.join()


@app.post('/api/v1/resolve')
async def resolve_endpoint(body: ResolveRequest):
    kind, result = await asyncio.to_thread(run_resolve, body.query, body.video_id)
    if kind == 'ok':
        result['audio_path'] = register_audio(result['stream_url'])
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})
    code, message = result
    return error(code, message, 404 if code == 'TRACK_NOT_FOUND' else 504 if code == 'RESOLVE_TIMEOUT' else 502)


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    query: str
    page: int = Field(default=1, ge=1, le=100)

    @model_validator(mode='after')
    def validate_query(self):
        self.query = self.query.strip()
        if not 1 <= len(self.query) <= 300:
            raise ValueError('invalid query')
        return self


@app.post('/api/v1/search')
async def search_endpoint(body: SearchRequest):
    kind, result = await asyncio.to_thread(run_resolve, body.query, None, page=body.page)
    if kind == 'ok':
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})
    code, message = result
    return error(code, message, 504 if code == 'RESOLVE_TIMEOUT' else 502)


@app.get('/api/v1/audio/{token}')
async def audio_endpoint(token: str, request: Request):
    return await relay_audio(token, request)


# One origin for production and the default local setup; API routes take precedence.
app.mount('/', StaticFiles(directory=Path(__file__).resolve().parent.parent / 'dist', html=True), name='frontend')
