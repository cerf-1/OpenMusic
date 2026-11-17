import pytest
from fastapi.testclient import TestClient
import app
from artists import parse_artist, select_artist, get_artist
from resolver import ResolveError, music_search_metadata

BROWSE_ID = 'UCfRoOGGP0qMFHK7sYiL34_g'
IMAGE = 'https://lh3.googleusercontent.com/real-artist-header=w2880-h1200'


def renderer(name, browse_id=BROWSE_ID):
    return {'musicResponsiveListItemRenderer': {
        'flexColumns': [{'musicResponsiveListItemFlexColumnRenderer': {'text': {'runs': [{'text': name}]}}}],
        'navigationEndpoint': {'browseEndpoint': {'browseId': browse_id}}}}


def test_exact_artist_identity():
    response = {'items': [renderer('Монеточка каверы'), renderer('Монеточка')]}
    assert select_artist(response, ' МОНЕТОЧКА ') == BROWSE_ID
    with pytest.raises(ResolveError):
        select_artist({'items': [renderer('Someone else')]}, 'Монеточка')
    with pytest.raises(ResolveError):
        select_artist({'items': [renderer('Монеточка', 'https://example.com')]}, 'Монеточка')


def test_only_profile_header_images_are_used():
    for key in ('musicImmersiveHeaderRenderer', 'musicVisualHeaderRenderer', 'musicResponsiveHeaderRenderer'):
        response = {'header': {key: {'title': {'runs': [{'text': 'Монеточка'}]},
            'thumbnail': {'musicThumbnailRenderer': {'thumbnail': {'thumbnails': [
                {'url': IMAGE, 'width': 2880, 'height': 1200},
                {'url': 'https://lh3.googleusercontent.com/small', 'width': 120, 'height': 50}]}}}}},
            'contents': {'thumbnail': {'url': 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg'}}}
        result = parse_artist(response, BROWSE_ID)
        assert result['header_image'] == IMAGE
        assert result['name'] == 'Монеточка'
        response['header'][key]['thumbnail'] = {'thumbnails': [{'url': 'https://lh3.googleusercontent.com.evil/test'}]}
        assert parse_artist(response, BROWSE_ID)['header_image'] is None
    with pytest.raises(ResolveError):
        parse_artist({'contents': {}}, BROWSE_ID)


def test_browse_id_skips_name_search(monkeypatch):
    import yt_dlp
    calls = []
    class FakeExtractor:
        def _extract_response(self, item_id, query, **kwargs):
            calls.append((item_id, query, kwargs))
            return {'header': {'musicImmersiveHeaderRenderer': {'title': {'simpleText': 'Монеточка'}}}}
    class FakeYDL:
        def __init__(self, options): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get_info_extractor(self, name): return FakeExtractor()
    monkeypatch.setattr(yt_dlp, 'YoutubeDL', FakeYDL)
    assert get_artist('Монеточка', BROWSE_ID)['header_image'] is None
    assert len(calls) == 1
    assert calls[0][1] == {'browseId': BROWSE_ID}
    assert calls[0][2]['default_client'] == 'web_music'


def test_search_preserves_artist_browse_identity():
    browse = {'browseId': BROWSE_ID, 'browseEndpointContextSupportedConfigs': {'browseEndpointContextMusicConfig': {'pageType': 'MUSIC_PAGE_TYPE_ARTIST'}}}
    metadata = music_search_metadata({'flexColumns': [{}, {'musicResponsiveListItemFlexColumnRenderer': {'text': {'runs': [{'text': 'Монеточка', 'navigationEndpoint': {'browseEndpoint': browse}}]}}}]})
    assert metadata['artist_browse_id'] == BROWSE_ID


def test_profile_api_validation_and_errors(monkeypatch):
    client = TestClient(app.app)
    for body in ({}, {'name': ' '}, {'name': 1}, {'name': 'x', 'browse_id': 'https://example.com'}, {'name': 'x', 'extra': 1}):
        assert client.post('/api/v1/artist', json=body).status_code == 422
    calls = []
    def fake(*args, **kwargs):
        calls.append(kwargs)
        return 'ok', {'name': 'Монеточка', 'header_image': IMAGE}
    monkeypatch.setattr(app, 'run_resolve', fake)
    result = client.post('/api/v1/artist', json={'name': ' Монеточка ', 'browse_id': BROWSE_ID})
    assert result.status_code == 200
    assert result.json()['header_image'] == IMAGE
    assert calls[0]['artist_request'] == {'name': 'Монеточка', 'browse_id': BROWSE_ID}
    for code, status in [('ARTIST_NOT_FOUND', 404), ('ARTIST_UNAVAILABLE', 502), ('RESOLVE_TIMEOUT', 504)]:
        monkeypatch.setattr(app, 'run_resolve', lambda *a, **kw: ('error', (code, 'message')))
        assert client.post('/api/v1/artist', json={'name': 'Test'}).status_code == status
