"""Build a playback queue from YouTube Music Radio."""
import logging
import re
from concurrent.futures import ThreadPoolExecutor, wait
from functools import partial
from time import monotonic

from requests import Session
from ytmusicapi import YTMusic

from resolver import ID, ResolveError, choose_cover

log = logging.getLogger(__name__)
LIMIT = 12
ALBUM_ID = re.compile(r'MPRE[A-Za-z0-9_-]{3,100}')


def queue_item(track, video_id, title):
    credits = []
    artists = track.get('artists')
    thumbnails = track.get('thumbnail') or track.get('thumbnails')
    for artist in artists if isinstance(artists, list) else []:
        if not isinstance(artist, dict) or not isinstance(artist.get('name'), str):
            continue
        name = artist['name'].strip()
        if not name:
            continue
        credit = {'name': name}
        browse_id = artist.get('id')
        if isinstance(browse_id, str) and re.fullmatch(r'UC[A-Za-z0-9_-]{22}', browse_id):
            credit['browse_id'] = browse_id
        credits.append(credit)

    length = track.get('length')
    duration = track.get('duration_seconds')
    if type(duration) is not int or duration <= 0:
        duration = 0
    if not duration and isinstance(length, str) and re.fullmatch(r'[0-9]{1,4}(?::[0-5][0-9]){1,2}', length):
        for part in length.split(':'):
            duration = duration * 60 + int(part)

    try:
        cover = choose_cover({'thumbnails': thumbnails if isinstance(thumbnails, list) else []})
    except ResolveError:
        cover = f'https://i.ytimg.com/vi/{video_id}/mqdefault.jpg'

    names = [credit['name'] for credit in credits]
    item = {
        'video_id': video_id, 'title': title, 'artist': ', '.join(names) or None,
        'duration_seconds': duration or None, 'cover_link': cover,
    }
    if credits:
        item.update(artists=names, artist_credits=credits)
    album = track.get('album')
    if isinstance(album, dict):
        album_id, name = album.get('id'), album.get('name')
        if (isinstance(album_id, str) and ALBUM_ID.fullmatch(album_id)
                and isinstance(name, str) and name.strip()):
            item['album'] = {'id': album_id, 'title': name.strip()}
    return item


def playable_tracks(tracks):
    for track in tracks:
        if not isinstance(track, dict) or track.get('isAvailable') is False:
            continue
        candidate, title = track.get('videoId'), track.get('title')
        if not isinstance(candidate, str) or not ID.fullmatch(candidate):
            continue
        if not isinstance(title, str) or not title.strip():
            continue
        yield track, candidate, title.strip()


def load_album(album_id):
    try:
        with Session() as session:
            session.request = partial(session.request, timeout=2)
            release = YTMusic(requests_session=session).get_album(album_id)
    except Exception as exc:
        log.warning('YouTube Music album unavailable: %s', type(exc).__name__)
        return None

    if not isinstance(release, dict) or release.get('type') != 'Album':
        return None
    title, tracks = release.get('title'), release.get('tracks')
    if not isinstance(title, str) or not title.strip() or not isinstance(tracks, list):
        return None

    items = []
    for track, video_id, track_title in playable_tracks(tracks):
        item = queue_item({
            **track,
            'artists': track.get('artists') or release.get('artists'),
            'thumbnails': track.get('thumbnails') or release.get('thumbnails'),
            'album': {'id': album_id, 'name': title},
        }, video_id, track_title)
        items.append(item)
    if not items:
        return None

    metadata = queue_item(release, items[0]['video_id'], title.strip())
    return {
        'id': album_id, 'title': metadata['title'], 'cover_link': metadata['cover_link'],
        'artist_credits': metadata.get('artist_credits') or items[0].get('artist_credits', []),
        'tracks': items,
    }


def recommended_albums(items, timeout):
    album_ids = dict.fromkeys(item['album']['id'] for item in items if 'album' in item)
    if not album_ids or timeout <= 0:
        return []

    pool = ThreadPoolExecutor(max_workers=4)
    try:
        futures = [pool.submit(load_album, album_id) for album_id in album_ids]
        completed, _ = wait(futures, timeout=timeout)
        return [album for future in futures if future in completed and (album := future.result())]
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def get_recommendations(video_id):
    deadline = monotonic() + 6
    try:
        with Session() as session:
            session.request = partial(session.request, timeout=5)
            radio = YTMusic(requests_session=session)
            tracks = radio.get_watch_playlist(videoId=video_id, radio=True, limit=LIMIT + 1)['tracks']
    except Exception as exc:
        log.warning('YouTube Music Radio unavailable: %s', type(exc).__name__)
        return {'items': []}

    if not isinstance(tracks, list):
        return {'items': []}

    items, seen = [], {video_id}
    for track, candidate, title in playable_tracks(tracks):
        if candidate in seen:
            continue
        items.append(queue_item(track, candidate, title))
        seen.add(candidate)
        if len(items) == LIMIT:
            break
    # Leave time to return the radio queue before the worker's hard timeout.
    albums = recommended_albums(items, min(2.5, deadline - monotonic()))
    return {'items': items, 'albums': albums} if albums else {'items': items}
