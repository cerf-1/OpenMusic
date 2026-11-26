import asyncio

from fastapi.testclient import TestClient

import recommendations
from app import RecommendationRequest, app, recommendations_endpoint
from resolver import music_search_metadata


def test_radio_preserves_order_filters_entries_and_normalizes_metadata(monkeypatch):
    seed = 'A1234567890'
    first = {
        'videoId': 'B1234567890', 'title': ' First ', 'length': '1:02:03',
        'artists': [{'name': ' Artist ', 'id': 'UC' + 'x' * 22}, {'name': 'Guest'}],
        'thumbnail': [{'url': 'https://lh3.googleusercontent.com/cover', 'width': 100, 'height': 100}],
        'album': {'id': 'MPREb_release', 'name': 'Release'},
    }
    second = {'videoId': 'C1234567890', 'title': 'Second'}
    more = [{'videoId': f'D{i:010}', 'title': str(i)} for i in range(20)]

    class Radio:
        def __init__(self, requests_session):
            assert requests_session.request.keywords['timeout'] == 5

        def get_watch_playlist(self, **options):
            assert options == {'videoId': seed, 'radio': True, 'limit': 13}
            return {'tracks': [None, {'videoId': seed, 'title': 'Seed'},
                               {'videoId': 'bad', 'title': 'Invalid'},
                               {'videoId': 'C1234567890', 'title': ' '},
                               first, first, second, *more]}

    monkeypatch.setattr(recommendations, 'YTMusic', Radio)
    items = recommendations.get_recommendations(seed)['items']
    assert [item['video_id'] for item in items] == ['B1234567890', 'C1234567890'] + [
        track['videoId'] for track in more[:10]
    ]
    assert items[0] == {
        'video_id': 'B1234567890', 'title': 'First', 'artist': 'Artist, Guest',
        'artists': ['Artist', 'Guest'],
        'artist_credits': [{'name': 'Artist', 'browse_id': 'UC' + 'x' * 22}, {'name': 'Guest'}],
        'duration_seconds': 3723, 'cover_link': 'https://lh3.googleusercontent.com/cover',
        'album': {'id': 'MPREb_release', 'title': 'Release'},
    }
    assert items[1] == {
        'video_id': 'C1234567890', 'title': 'Second', 'artist': None, 'duration_seconds': None,
        'cover_link': 'https://i.ytimg.com/vi/C1234567890/mqdefault.jpg',
    }


def test_radio_failure_and_empty_result(monkeypatch):
    class Radio:
        def __init__(self, requests_session):
            pass

        def get_watch_playlist(self, **options):
            if options['videoId'] == 'A1234567890':
                raise TimeoutError()
            return {'tracks': []}

    monkeypatch.setattr(recommendations, 'YTMusic', Radio)
    for seed in ('A1234567890', 'B1234567890'):
        assert recommendations.get_recommendations(seed) == {'items': []}


def test_api_accepts_only_video_id(monkeypatch):
    def run(query, video_id, *, timeout, recommendation_request):
        assert timeout == 8
        assert recommendation_request == {'video_id': 'A1234567890'}
        return 'ok', {'items': []}

    monkeypatch.setattr('app.run_resolve', run)
    with TestClient(app) as client:
        response = client.post('/api/v1/recommendations', json={'video_id': 'A1234567890'})
        assert response.status_code == 200
        assert response.json() == {'items': []}
        assert response.headers['cache-control'] == 'no-store'
        assert client.post('/api/v1/recommendations', json={'video_id': 'invalid'}).status_code == 422


def test_only_linked_album_metadata_is_returned():
    metadata_column = 'musicResponsiveListItemFlexColumnRenderer'

    def album_run(page_type, browse_id):
        return {'text': 'An album', 'navigationEndpoint': {'browseEndpoint': {
            'browseId': browse_id, 'browseEndpointContextSupportedConfigs': {
                'browseEndpointContextMusicConfig': {'pageType': page_type}
            },
        }}}

    def metadata(run):
        renderer = {'flexColumns': [{}, {metadata_column: {'text': {'runs': [run]}}}]}
        return music_search_metadata(renderer)

    assert metadata(album_run('MUSIC_PAGE_TYPE_ALBUM', 'MPREb_release'))['album'] == {
        'id': 'MPREb_release', 'title': 'An album'
    }
    assert 'album' not in metadata(album_run('MUSIC_PAGE_TYPE_PLAYLIST', 'MPREb_release'))
    assert 'album' not in metadata(album_run('MUSIC_PAGE_TYPE_ALBUM', 'https://example.org'))


def test_worker_timeout_returns_empty_items(monkeypatch):
    monkeypatch.setattr('app.run_resolve', lambda *args, **kwargs: ('error', ('RESOLVE_TIMEOUT', 'timeout')))
    response = asyncio.run(recommendations_endpoint(
        RecommendationRequest(video_id='Abcdefghijk')
    ))
    assert response.status_code == 200
    assert response.body == b'{"items":[]}'
