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


def test_search_window_is_flat_and_bounded(monkeypatch):
    import sys
    import types
    from resolver import search
    calls = []
    monkeypatch.setattr('resolver.register_music_search', lambda ydl: None)
    class FakeYDL:
        def __init__(self, options):
            self.options = options
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def extract_info(self, url, download=False):
            calls.append((url, self.options))
            return {'entries': [{'id': f'{i:011d}', 'title': f'Song {i}', 'duration': 120} for i in range(11)]}
    monkeypatch.setitem(sys.modules, 'yt_dlp', types.SimpleNamespace(YoutubeDL=FakeYDL))
    monkeypatch.setitem(sys.modules, 'yt_dlp.utils', types.SimpleNamespace(DownloadError=RuntimeError))
    result = search('song & artist', 2)
    assert len(result['items']) == 10 and result['has_more'] is True
    assert result['items'][0]['cover_link'] == 'https://i.ytimg.com/vi/00000000000/mqdefault.jpg'
    assert len(calls) == 1  # No per-track requests or stream extraction.
    url, options = calls[0]
    assert 'song%20%26%20artist' in url
    assert options['playliststart'] == 11 and options['playlistend'] == 21
    assert options['lazy_playlist'] and options['extract_flat'] == 'in_playlist'


def test_search_api_validation_and_empty_page(monkeypatch):
    client = TestClient(app.app)
    for data in [{}, {'query':' '}, {'query':'song','page':0}, {'query':'song','page':101}, {'query':'song','page':True}, {'query':'song','page':'2'}, {'query':'song','extra':1}]:
        assert client.post('/api/v1/search', json=data).status_code == 422
    calls = []
    def fake(query, video_id, **kwargs):
        calls.append((query, video_id, kwargs))
        return 'ok', {'items': [], 'page': 3, 'has_more': False}
    monkeypatch.setattr(app, 'run_resolve', fake)
    response = client.post('/api/v1/search', json={'query':' song ', 'page':3})
    assert response.json() == {'items': [], 'page': 3, 'has_more': False}
    assert calls == [('song', None, {'page':3})]


def test_music_search_preserves_artists_and_square_cover():
    from resolver import music_search_metadata
    def artist(text):
        return {'text': text, 'navigationEndpoint': {'browseEndpoint': {
            'browseEndpointContextSupportedConfigs': {'browseEndpointContextMusicConfig': {'pageType': 'MUSIC_PAGE_TYPE_ARTIST'}}}}}
    image = 'https://yt3.googleusercontent.com/album=w120-h120-l90-rj'
    renderer = {'flexColumns': [{}, {'musicResponsiveListItemFlexColumnRenderer': {'text': {
        'runs': [artist('Daft Punk'), {'text': ' & '}, artist('Julian Casablancas'),
                 {'text': ' • '}, {'text': 'Random Access Memories'}, {'text': '5:38'}]}}}],
        'thumbnail': {'musicThumbnailRenderer': {'thumbnail': {'thumbnails': [{'url': image, 'width': 120, 'height': 120}]}}}}
    metadata = music_search_metadata(renderer)
    assert metadata['artist'] == 'Daft Punk, Julian Casablancas'
    assert metadata['duration'] == 338
    assert choose_cover(metadata) == image
    assert music_search_metadata({}) == {'artist': None, 'duration': None, 'thumbnails': []}
    assert not valid_url('https://yt3.googleusercontent.com.evil/album', cover=True)


def test_music_search_artist_without_profile_link():
    from resolver import music_search_metadata
    renderer = {'flexColumns': [{}, {'musicResponsiveListItemFlexColumnRenderer': {'text': {'runs': [
        {'text': 'Ruben Dunn'}, {'text': ' • '}, {'text': 'Instant Crush'}, {'text': ' • '}, {'text': '2:48'}]}}}]}
    assert music_search_metadata(renderer)['artist'] == 'Ruben Dunn'
