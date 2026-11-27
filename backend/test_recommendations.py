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
    second = {'videoId': 'C1234567890', 'title': 'Second', 'artists': 1, 'thumbnail': 2}
    more = [{'videoId': f'D{i:010}', 'title': str(i)} for i in range(20)]

    class Radio:
        def __init__(self, requests_session):
            self.timeout = requests_session.request.keywords['timeout']

        def get_watch_playlist(self, **options):
            assert self.timeout == 5
            assert options == {'videoId': seed, 'radio': True, 'limit': 13}
            return {'tracks': [None, {'videoId': seed, 'title': 'Seed'},
                               {'videoId': 'bad', 'title': 'Invalid'},
                               {'videoId': 'C1234567890', 'title': ' '},
                               first, first, second, *more]}

        def get_album(self, album_id):
            assert self.timeout == 2
            assert album_id == first['album']['id']
            return {'type': 'Album', 'title': 'Release', 'artists': first['artists'],
                    'thumbnails': first['thumbnail'], 'tracks': [
                        {'videoId': 'Z1234567890', 'title': 'Album opener', 'duration_seconds': 180},
                        {'videoId': 'Y1234567890', 'title': 'Unavailable', 'isAvailable': False},
                        first,
                    ]}

    monkeypatch.setattr(recommendations, 'YTMusic', Radio)
    result = recommendations.get_recommendations(seed)
    items = result['items']
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
    discovery = recommendations.get_discovery([], [first['album']['id']])
    album, = discovery['albums']
    assert album['id'] == first['album']['id']
    assert album['title'] == 'Release'
    assert album['cover_link'] == items[0]['cover_link']
    assert album['artist_credits'] == items[0]['artist_credits']
    assert [item['title'] for item in album['tracks']] == ['Album opener', 'First']
    assert album['tracks'][0]['duration_seconds'] == 180


def test_discovery_expands_album_choices_and_uses_artist_profile_images(monkeypatch):
    toxicity = {'videoId': 'B1234567890', 'title': 'Toxicity',
                'album': {'id': 'MPREb_single', 'name': 'Toxicity'}}
    other = {'videoId': 'C1234567890', 'title': 'Another song',
             'album': {'id': 'MPREb_unavailable', 'name': 'An unavailable release'}}
    primary_id, guest_id = 'UC' + 'x' * 22, 'UC' + 'y' * 22
    primary = {'name': 'Primary', 'browse_id': primary_id}
    guest = {'name': 'Guest'}
    primary_image = 'https://yt3.googleusercontent.com/primary'
    guest_image = 'https://yt3.googleusercontent.com/guest'
    primary_album_ids = ['MPREb_primary_one', 'MPREb_primary_two']
    guest_album_id = 'MPREb_guest_one'

    class Radio:
        def __init__(self, requests_session):
            pass

        def get_watch_playlist(self, **options):
            return {'tracks': [toxicity, other]}

        def search(self, query, **options):
            assert query == 'Guest' and options['filter'] == 'artists'
            return [{'artist': 'Guest Covers', 'browseId': primary_id},
                    {'artist': 'Guest', 'browseId': guest_id}]

        def get_artist(self, browse_id):
            image, album_ids = ((primary_image, primary_album_ids) if browse_id == primary_id
                                else (guest_image, [guest_album_id]))
            return {'thumbnails': [{'url': image}],
                    'albums': {'results': [{'browseId': album_id} for album_id in album_ids]},
                    'singles': {'results': [{'browseId': 'MPREb_skip'}]}}

        def get_album(self, album_id):
            if album_id == 'MPREb_unavailable':
                raise TimeoutError()
            if album_id == 'MPREb_single':
                return {'type': 'Single', 'title': 'Toxicity', 'tracks': [toxicity]}
            assert album_id in [*primary_album_ids, guest_album_id]
            return {'type': 'Album', 'title': album_id, 'tracks': [other]}

    monkeypatch.setattr(recommendations, 'YTMusic', Radio)
    result = recommendations.get_recommendations('A1234567890')
    assert [item['title'] for item in result['items']] == ['Toxicity', 'Another song']
    discovery = recommendations.get_discovery(
        [primary, guest], [item['album']['id'] for item in result['items']]
    )
    assert discovery['artists'] == [
        {**primary, 'header_image': primary_image},
        {**guest, 'browse_id': guest_id, 'header_image': guest_image},
    ]
    assert [album['id'] for album in discovery['albums']] == [
        primary_album_ids[0], guest_album_id, primary_album_ids[1],
    ]


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


def test_discovery_api_validates_album_references(monkeypatch):
    response = {'artists': [], 'albums': []}

    def run(query, video_id, *, timeout, discovery_request):
        assert discovery_request == {'artists': [{'name': 'Artist', 'browse_id': None}],
                                     'album_ids': ['MPREb_release']}
        return 'ok', response

    monkeypatch.setattr('app.run_resolve', run)
    with TestClient(app) as client:
        request = {'artists': [{'name': 'Artist'}], 'album_ids': ['MPREb_release']}
        assert client.post('/api/v1/discovery', json=request).json() == response
        request['album_ids'] = ['https://example.org']
        assert client.post('/api/v1/discovery', json=request).status_code == 422


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
