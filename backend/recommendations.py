"""Match Music Matcher pairs to verified YouTube Music search results."""
import asyncio
import logging
import unicodedata
from concurrent.futures import ThreadPoolExecutor, wait

from resolver import search

log = logging.getLogger(__name__)


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value or '').casefold() if c.isalnum())


def match_track(artist, title):
    for item in search(f'{artist} {title}')['items']:
        if normalize(item['title']) != normalize(title):
            continue
        artists = item.get('artists') or [item.get('artist')]
        if normalize(artist) in {normalize(name) for name in [item.get('artist'), *artists]}:
            return item
    return None


def get_recommendations(artist, title, video_id):
    from music_matcher import find_similar_tracks

    try:
        pairs = asyncio.run(find_similar_tracks(artist, title, limit=12, timeout=18, headless=True))
    except Exception as exc:
        log.warning('Music Matcher unavailable: %s', type(exc).__name__)
        return {'items': []}
    seed = normalize(artist), normalize(title)
    pairs = [pair for pair in pairs if tuple(map(normalize, pair)) != seed]
    if not pairs:
        return {'items': []}

    pool = ThreadPoolExecutor(max_workers=4)
    futures = [pool.submit(match_track, *pair) for pair in pairs]
    done, _ = wait(futures, timeout=12)
    pool.shutdown(wait=False, cancel_futures=True)
    items, seen_ids, seen_pairs = [], {video_id}, {seed}
    for pair, future in zip(pairs, futures):
        if future not in done:
            continue
        try:
            item = future.result()
        except Exception as exc:
            log.warning('Recommendation search unavailable: %s', type(exc).__name__)
            continue
        key = tuple(map(normalize, pair))
        if item and item['video_id'] not in seen_ids and key not in seen_pairs:
            seen_ids.add(item['video_id'])
            seen_pairs.add(key)
            items.append(item)
    return {'items': items}
