"""Artist header metadata from YouTube Music, separate from song artwork."""
import re
from urllib.parse import urlsplit
from resolver import ResolveError, SafeLogger

BROWSE_ID = re.compile(r'^UC[A-Za-z0-9_-]{22}$')


def artist_key(name):
    return ' '.join(str(name or '').split()).casefold()


def nodes(value, key):
    if isinstance(value, dict):
        for name, child in value.items():
            if name == key and isinstance(child, dict):
                yield child
            else:
                yield from nodes(child, key)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child, key)


def text(value):
    if not isinstance(value, dict):
        return ''
    return value.get('simpleText') or ''.join(run.get('text', '') for run in value.get('runs', []))


def artist_image(header):
    # Only images inside the artist header. Never search the page's song/release thumbnails.
    images = []
    def collect(value):
        if isinstance(value, dict):
            if isinstance(value.get('url'), str):
                try:
                    url = urlsplit(value['url'])
                    if (url.scheme == 'https' and not url.username and not url.password
                            and url.port in (None, 443) and url.hostname in (
                                'yt3.googleusercontent.com', 'yt3.ggpht.com',
                                'lh3.googleusercontent.com', 'lh3.ggpht.com')):
                        images.append(value)
                except ValueError:
                    pass
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)
    collect(header.get('thumbnail') or header.get('foregroundThumbnail') or {})
    def area(image):
        w, h = image.get('width'), image.get('height')
        return w*h if isinstance(w, (int, float)) and isinstance(h, (int, float)) and w > 0 and h > 0 else 0
    return max(images, key=area)['url'] if images else None


def select_artist(response, name):
    for item in nodes(response, 'musicResponsiveListItemRenderer'):
        columns = item.get('flexColumns') or []
        title = text(columns[0].get('musicResponsiveListItemFlexColumnRenderer', {}).get('text')) if columns else ''
        endpoint = item.get('navigationEndpoint', {}).get('browseEndpoint', {})
        browse_id = endpoint.get('browseId', '')
        if artist_key(title) == artist_key(name) and BROWSE_ID.fullmatch(browse_id):
            return browse_id
    raise ResolveError('ARTIST_NOT_FOUND', 'Artist profile not found on YouTube Music.')


def parse_artist(response, browse_id):
    header = response.get('header') or {}
    renderer = next((header[key] for key in (
        'musicImmersiveHeaderRenderer', 'musicVisualHeaderRenderer', 'musicHeaderRenderer',
        'musicResponsiveHeaderRenderer') if isinstance(header.get(key), dict)), None)
    if not renderer:
        raise ResolveError('ARTIST_UNAVAILABLE', 'Could not load the artist profile')
    return {'browse_id': browse_id, 'name': text(renderer.get('title')),
            'header_image': artist_image(renderer),
            'source_url': 'https://music.youtube.com/channel/' + browse_id}


def get_artist(name, browse_id=None):
    import yt_dlp
    from yt_dlp.extractor.youtube import YoutubeMusicSearchURLIE
    from yt_dlp.utils import DownloadError, ExtractorError
    options = {'quiet': True, 'no_warnings': True, 'skip_download': True,
               'socket_timeout': 10, 'extractor_retries': 0, 'logger': SafeLogger()}
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            # Reuse the pinned yt-dlp client's current YouTube Music context.
            ie = ydl.get_info_extractor('YoutubeTab')
            if not browse_id:
                response = ie._extract_response(name, {'query': name, 'params': YoutubeMusicSearchURLIE._SECTIONS['artists']},
                                                ep='search', default_client='web_music', check_get_keys=('contents',))
                browse_id = select_artist(response or {}, name)
            response = ie._extract_response(browse_id, {'browseId': browse_id},
                                            default_client='web_music', check_get_keys=('header',))
            return parse_artist(response or {}, browse_id)
    except (DownloadError, ExtractorError):
        raise ResolveError('ARTIST_UNAVAILABLE', 'Could not load the artist profile. Try again.') from None
