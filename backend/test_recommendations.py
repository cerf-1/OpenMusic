import asyncio
import sys
from types import SimpleNamespace

import recommendations
from app import RecommendationRequest, recommendations_endpoint
from resolver import music_search_metadata


def test_confirmed_matches_keep_matcher_order_and_skip_seed_duplicates_and_failures(monkeypatch):
    async def parser(artist, title, **options):
        assert (artist, title) == ('Seed', 'Original')
        assert options == {'limit': 12, 'timeout': 18, 'headless': True}
        return [
            ('Seed', 'Original'), ('One', 'First'), ('Two', 'Missing'),
            ('Two', 'Unavailable'), ('THREE', 'Second'), ('ONE', 'FIRST'),
            ('Four', 'Repeated ID'), ('Five', 'Seed ID'),
        ]

    monkeypatch.setitem(sys.modules, 'music_matcher', SimpleNamespace(find_similar_tracks=parser))

    def search(query):
        if query == 'Two Unavailable':
            raise TimeoutError()
        wrong = {'artist': 'Cover Band', 'title': 'First', 'video_id': 'wrong'}
        matches = {
            'One First': [wrong, {'artist': 'One', 'title': 'First', 'video_id': 'first'}],
            'Two Missing': [wrong],
            'THREE Second': [{'artist': 'Three, Other', 'artists': ['Three', 'Other'],
                              'title': 'Second', 'video_id': 'second',
                              'album': {'id': 'MPREb_release', 'title': 'Second Album'}}],
            'ONE FIRST': [{'artist': 'One', 'title': 'First', 'video_id': 'alt'}],
            'Four Repeated ID': [{'artist': 'Four', 'title': 'Repeated ID', 'video_id': 'second'}],
            'Five Seed ID': [{'artist': 'Five', 'title': 'Seed ID', 'video_id': 'seed'}],
        }
        return {'items': matches[query]}

    monkeypatch.setattr(recommendations, 'search', search)
    items = recommendations.get_recommendations('Seed', 'Original', 'seed')['items']
    assert [item['video_id'] for item in items] == ['first', 'second']
    assert items[1]['album']['title'] == 'Second Album'


def test_parser_failure_and_empty_result_do_not_run_search(monkeypatch):
    async def timeout(*args, **kwargs):
        raise TimeoutError()

    async def empty(*args, **kwargs):
        return []

    def unexpected_search(query):
        raise AssertionError(query)

    monkeypatch.setattr(recommendations, 'search', unexpected_search)
    for parser in [timeout, empty]:
        monkeypatch.setitem(sys.modules, 'music_matcher', SimpleNamespace(find_similar_tracks=parser))
        assert recommendations.get_recommendations('Seed', 'Original', 'seed') == {'items': []}


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
        RecommendationRequest(artist='Seed', title='Original', video_id='Abcdefghijk')
    ))
    assert response.status_code == 200
    assert response.body == b'{"items":[]}'
