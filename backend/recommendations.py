"""Build a playback queue from YouTube Music Radio."""
import logging
import re
from functools import partial

from requests import Session
from ytmusicapi import YTMusic

from resolver import ID, ResolveError, choose_cover

log = logging.getLogger(__name__)
LIMIT = 12


def queue_item(track, video_id, title):
    credits = []
    artists = track.get('artists')
    thumbnails = track.get('thumbnail')
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
    duration = 0
    if isinstance(length, str) and re.fullmatch(r'[0-9]{1,4}(?::[0-5][0-9]){1,2}', length):
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
        if (isinstance(album_id, str) and re.fullmatch(r'MP[A-Za-z0-9_-]{3,100}', album_id)
                and isinstance(name, str) and name.strip()):
            item['album'] = {'id': album_id, 'title': name.strip()}
    return item


def get_recommendations(video_id):
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
    for track in tracks:
        if not isinstance(track, dict):
            continue
        candidate, title = track.get('videoId'), track.get('title')
        if not isinstance(candidate, str) or not ID.fullmatch(candidate) or candidate in seen:
            continue
        if not isinstance(title, str) or not title.strip():
            continue
        items.append(queue_item(track, candidate, title.strip()))
        seen.add(candidate)
        if len(items) == LIMIT:
            break
    return {'items': items}
