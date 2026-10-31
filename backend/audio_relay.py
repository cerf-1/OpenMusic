"""Bounded in-memory handles for resolved audio; never accepts a caller URL."""
import asyncio
import logging
import re
import secrets
import time
from urllib.parse import urljoin
from collections import OrderedDict

import anyio
import httpx
from starlette.background import BackgroundTask
from fastapi.responses import JSONResponse, StreamingResponse
from resolver import valid_url

log = logging.getLogger('openmusic')
_handles = OrderedDict()
_slots = asyncio.Semaphore(6)
TTL = 3600
MAX_HANDLES = 64


def register_audio(url):
    if not valid_url(url):
        raise ValueError('Invalid resolved audio host')
    now = time.monotonic()
    for token, (_, expiry) in list(_handles.items()):
        if expiry <= now:
            del _handles[token]
    token = secrets.token_urlsafe(24)
    _handles[token] = (url, now + TTL)
    while len(_handles) > MAX_HANDLES:
        _handles.popitem(last=False)
    return f'/api/v1/audio/{token}'


def failure(status):
    return JSONResponse({'error': {'code': 'AUDIO_UNAVAILABLE', 'message': 'Please play this track again.'}}, status_code=status, headers={'Cache-Control': 'no-store'})


async def relay_audio(token, request):
    entry = _handles.get(token)
    if not entry or entry[1] <= time.monotonic():
        _handles.pop(token, None)
        return failure(410)
    byte_range = request.headers.get('range')
    if byte_range and not re.fullmatch(r'bytes=(?:\d+-\d*|-\d+)', byte_range):
        return failure(416)
    try:
        await asyncio.wait_for(_slots.acquire(), timeout=2)
    except TimeoutError:
        return failure(429)
    # Follow only manually validated media redirects; never forward caller credentials.
    client = httpx.AsyncClient(timeout=httpx.Timeout(20, connect=10), follow_redirects=False)
    response = None
    try:
        headers = {'Accept-Encoding': 'identity'}
        if byte_range:
            headers['Range'] = byte_range
        url = entry[0]
        for hop in range(4):
            response = await client.send(client.build_request('GET', url, headers=headers), stream=True)
            if response.status_code not in (301, 302, 303, 307, 308):
                break
            target = urljoin(url, response.headers.get('location', ''))
            # Google may redirect to another regional media host. Revalidate every hop.
            if hop == 3 or not valid_url(target) or target == url:
                break
            await response.aclose()
            url = target

        if response.status_code not in (200, 206):
            log.warning('Audio upstream status: %d', response.status_code)
            await response.aclose()
            await client.aclose()
            _slots.release()
            return failure(416 if response.status_code == 416 else 502)
    except BaseException as exc:
        if response:
            await response.aclose()
        await client.aclose()
        _slots.release()
        if isinstance(exc, asyncio.CancelledError):
            raise
        log.warning('Audio transport failed: %s', type(exc).__name__)
        if not isinstance(exc, httpx.HTTPError):
            raise
        return failure(502)

    closed = False
    async def cleanup():
        nonlocal closed
        if closed:
            return
        closed = True
        # Browser disconnects cancel the body task; still close the upstream socket.
        with anyio.CancelScope(shield=True):
            try:
                await response.aclose()
                await client.aclose()
            finally:
                _slots.release()

    async def chunks():
        try:
            async for chunk in response.aiter_raw(chunk_size=32768):
                yield chunk
        finally:
            await cleanup()

    output_headers = {key: response.headers[key] for key in ('content-type', 'content-length', 'content-range', 'accept-ranges') if key in response.headers}
    output_headers['Cache-Control'] = 'no-store'
    output_headers['X-Content-Type-Options'] = 'nosniff'
    return StreamingResponse(chunks(), status_code=response.status_code, headers=output_headers, background=BackgroundTask(cleanup))
