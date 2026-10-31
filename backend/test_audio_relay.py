import asyncio
import time
import httpx
import pytest
from fastapi.testclient import TestClient
import app
import audio_relay as relay

URL = 'https://rr1.googlevideo.com/videoplayback?signature=example'


def test_handles_are_bounded_expire_and_do_not_accept_caller_urls(monkeypatch):
    monkeypatch.setattr(relay, '_handles', relay.OrderedDict())
    with pytest.raises(ValueError):
        relay.register_audio('http://127.0.0.1/internal')
    first = relay.register_audio(URL).rsplit('/', 1)[1]
    for _ in range(relay.MAX_HANDLES):
        relay.register_audio(URL)
    assert len(relay._handles) == relay.MAX_HANDLES and first not in relay._handles
    client = TestClient(app.app)
    assert client.get('/api/v1/audio/unknown').status_code == 410
    token = next(iter(relay._handles))
    relay._handles[token] = (URL, time.monotonic()-1)
    assert client.get(f'/api/v1/audio/{token}').status_code == 410


def test_resolve_registers_audio_and_range_relay_preserves_bytes(monkeypatch):
    monkeypatch.setattr(relay, '_handles', relay.OrderedDict())
    monkeypatch.setattr(relay, '_slots', asyncio.Semaphore(6))
    monkeypatch.setattr(app, 'run_resolve', lambda *args: ('ok', {'stream_url':URL}))
    original_client = httpx.AsyncClient
    calls = []
    class Bytes(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'abc'
    def handler(request):
        calls.append(request)
        return httpx.Response(206, headers={'Content-Type':'audio/mp4', 'Content-Range':'bytes 3-5/10', 'Content-Length':'3'}, stream=Bytes())
    monkeypatch.setattr(relay.httpx, 'AsyncClient', lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))
    client = TestClient(app.app)
    path = client.post('/api/v1/resolve', json={'video_id':'abcdefghijk'}).json()['audio_path']
    response = client.get(path, headers={'Range':'bytes=3-5', 'Origin':'http://localhost:4173'})
    assert response.status_code == 206 and response.content == b'abc'
    assert response.headers['content-range'] == 'bytes 3-5/10'
    assert response.headers['access-control-allow-origin'] == 'http://localhost:4173'
    assert calls[0].headers['range'] == 'bytes=3-5' and str(calls[0].url) == URL
    assert client.get(path, headers={'Range':'bytes=0-1,2-3'}).status_code == 416
    assert len(calls) == 1
    assert relay._slots._value == 6


def test_redirect_and_transport_failure_are_closed_without_exposing_upstream(monkeypatch):
    monkeypatch.setattr(relay, '_slots', asyncio.Semaphore(6))
    original_client = httpx.AsyncClient
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(302, headers={'Location':'http://127.0.0.1/internal'})
    monkeypatch.setattr(relay.httpx, 'AsyncClient', lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))
    client = TestClient(app.app)
    response = client.get(relay.register_audio(URL))
    assert response.status_code == 502 and 'googlevideo' not in response.text
    assert len(calls) == 1 and relay._slots._value == 6


def test_regional_googlevideo_redirect_preserves_range(monkeypatch):
    monkeypatch.setattr(relay, '_slots', asyncio.Semaphore(6))
    original_client = httpx.AsyncClient
    calls = []
    class Bytes(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'a'
    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(302, headers={'Location':'https://rr2.googlevideo.com/videoplayback?regional=1'})
        return httpx.Response(206, headers={'Content-Type':'audio/mp4', 'Content-Range':'bytes 1-1/10'}, stream=Bytes())
    monkeypatch.setattr(relay.httpx, 'AsyncClient', lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))
    response = TestClient(app.app).get(relay.register_audio(URL), headers={'Range':'bytes=1-1'})
    assert response.content == b'a' and response.status_code == 206
    assert len(calls) == 2 and all(r.headers['range'] == 'bytes=1-1' for r in calls)
    assert relay._slots._value == 6


def test_transport_failure_releases_stream_slot(monkeypatch):
    monkeypatch.setattr(relay, '_slots', asyncio.Semaphore(6))
    original_client = httpx.AsyncClient
    def handler(request):
        raise httpx.ConnectError('upstream unavailable', request=request)
    monkeypatch.setattr(relay.httpx, 'AsyncClient', lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))
    response = TestClient(app.app).get(relay.register_audio(URL))
    assert response.status_code == 502 and relay._slots._value == 6
