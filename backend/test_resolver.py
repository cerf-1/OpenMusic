import pytest
from fastapi.testclient import TestClient
import app
from resolver import choose_stream, choose_cover, valid_url, ResolveError

URL = 'https://rr1.googlevideo.com/videoplayback?signature=abc'

def fmt(ext, codec, abr, **extra):
    return {'url': URL, 'vcodec': 'none', 'acodec': codec, 'ext': ext, 'abr': abr, **extra}

def test_stream_selection():
    assert choose_stream([fmt('webm', 'opus', 256), fmt('m4a', 'mp4a.40.2', 64), fmt('m4a', 'mp4a.40.2', 128, url=URL+'2')]) == URL+'2'
    with pytest.raises(ResolveError, match='Аудиопоток'):
        choose_stream([fmt('m4a', 'mp4a', 128, fragments=[{}]), fmt('m4a', 'mp4a', 128, protocol='m3u8_native')])

def test_urls_and_cover():
    assert valid_url(URL)
    for url in ['https://googlevideo.com/videoplayback', 'https://evilgooglevideo.com/videoplayback', 'https://x.googlevideo.com.evil/videoplayback', 'http://x.googlevideo.com/videoplayback', 'https://x.googlevideo.com/other']:
        assert not valid_url(url)
    small = 'https://i.ytimg.com/vi/id/small.jpg'
    large = 'https://i.ytimg.com/vi/id/large.jpg'
    assert choose_cover({'thumbnails': [{'url': small, 'width': 10, 'height': 10}, {'url': large, 'width': 20, 'height': 20}]}) == large
    with pytest.raises(ResolveError):
        choose_cover({'thumbnail': 'https://i.ytimg.com.evil/a'})

def test_validation_and_errors(monkeypatch):
    client = TestClient(app.app)
    for data in [{}, {'query': '  '}, {'query': 'ok', 'video_id': 'abcdefghijk'}, {'video_id': 'bad'}, {'query': 123}, {'query': None, 'video_id': 'abcdefghijk'}, {'query': 'x', 'extra': 1}]:
        response = client.post('/api/v1/resolve', json=data)
        assert response.status_code == 422 and response.json()['error']['code'] == 'INVALID_REQUEST'
    assert client.post('/api/v1/resolve', content='{', headers={'content-type':'application/json'}).json()['error']['code'] == 'INVALID_REQUEST'
    for code, status in [('TRACK_NOT_FOUND', 404), ('STREAM_UNAVAILABLE', 502), ('COVER_UNAVAILABLE', 502), ('RESOLVE_FAILED', 502), ('RESOLVE_TIMEOUT', 504)]:
        monkeypatch.setattr(app, 'run_resolve', lambda *args: ('error', (code, 'message')))
        response = client.post('/api/v1/resolve', json={'query':' test '})
        assert response.status_code == status and response.json()['error']['code'] == code
        assert response.headers['cache-control'] == 'no-store'
    response = client.options('/api/v1/resolve', headers={'Origin':'http://localhost:4173', 'Access-Control-Request-Method':'POST', 'Access-Control-Request-Headers':'content-type'})
    assert response.status_code == 200
