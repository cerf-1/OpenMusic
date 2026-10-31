"""Resolve a YouTube Music search to validated direct media URLs."""
import math
import re
from urllib.parse import quote, urlsplit

ID = re.compile(r'^[A-Za-z0-9_-]{11}$')


class ResolveError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(message)


def valid_url(value, cover=False):
    try:
        u = urlsplit(value)
        host = u.hostname or ''
        return (u.scheme == 'https' and not u.username and not u.password
                and u.port in (None, 443)
                and (host in ('i.ytimg.com', 'yt3.googleusercontent.com', 'lh3.googleusercontent.com', 'lh3.ggpht.com') if cover else host.endswith('.googlevideo.com') and u.path == '/videoplayback'))
    except (ValueError, TypeError):
        return False


def choose_stream(formats):
    candidates = []
    for f in formats or []:
        if not isinstance(f, dict) or f.get('vcodec') != 'none' or not f.get('acodec') or f['acodec'] == 'none':
            continue
        if f.get('fragments') or f.get('protocol', 'https') not in ('https', 'http') or not valid_url(f.get('url')):
            continue
        ext, codec = f.get('ext', '').lower(), f['acodec'].lower()
        group = 2 if ext == 'm4a' and (codec.startswith('mp4a') or codec.startswith('aac')) else 1 if ext == 'webm' and codec.startswith('opus') else 0
        if group:
            abr = f.get('abr')
            abr = abr if isinstance(abr, (int, float)) and math.isfinite(abr) else 0
            candidates.append((group, abr, f['url']))
    if not candidates:
        raise ResolveError('STREAM_UNAVAILABLE', 'Аудиопоток недоступен')
    return max(candidates, key=lambda c: (c[0], c[1]))[2]


def choose_cover(info):
    images = [t for t in (info.get('thumbnails') or []) if isinstance(t, dict) and valid_url(t.get('url'), True)]
    if images:
        def area(t):
            w, h = t.get('width'), t.get('height')
            return w * h if isinstance(w, (int, float)) and isinstance(h, (int, float)) and w > 0 and h > 0 else 0
        return max(images, key=area)['url']
    if valid_url(info.get('thumbnail'), True):
        return info['thumbnail']
    raise ResolveError('COVER_UNAVAILABLE', 'Обложка недоступна')


class SafeLogger:
    def debug(self, message):
        pass

    def warning(self, message):
        pass

    def error(self, message):
        pass


def resolve(query=None, video_id=None):
    import yt_dlp
    from yt_dlp.utils import DownloadError
    options = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'socket_timeout': 10, 'logger': SafeLogger()}
    try:
        if query is not None:
            with yt_dlp.YoutubeDL({**options, 'extract_flat': 'in_playlist', 'playlistend': 5}) as ydl:
                result = ydl.extract_info('https://music.youtube.com/search?q=' + quote(query, safe='') + '#songs', download=False)
            entries = (result or {}).get('entries') or []
            video_id = next((e['id'] for e in entries if isinstance(e, dict) and isinstance(e.get('id'), str) and ID.fullmatch(e['id'])), None)
            if not video_id:
                raise ResolveError('TRACK_NOT_FOUND', 'Трек не найден')
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info('https://www.youtube.com/watch?v=' + video_id, download=False)
    except DownloadError as exc:
        # Only clear unavailability signals are classified as not found; never log signed URLs.
        msg = str(exc).lower()
        if any(s in msg for s in ('video unavailable', 'video is unavailable', 'private video', 'has been removed')):
            raise ResolveError('TRACK_NOT_FOUND', 'Трек не найден') from None
        raise ResolveError('RESOLVE_FAILED', 'Не удалось получить данные трека') from None
    if not isinstance(info, dict) or info.get('id') != video_id:
        raise ResolveError('RESOLVE_FAILED', 'Не удалось получить данные трека')
    title = info.get('track') or info.get('title')
    duration = info.get('duration')
    if not isinstance(title, str) or not title.strip() or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ResolveError('RESOLVE_FAILED', 'Недостаточно данных о треке')
    return {'video_id': video_id, 'title': title, 'artist': info.get('artist') or info.get('uploader') or None,
            'duration_seconds': duration, 'stream_url': choose_stream(info.get('formats')), 'cover_link': choose_cover(info)}


def music_search_metadata(renderer):
    """Keep artwork and artists already present in the music search response.

    yt-dlp 2026.10.26 drops these fields when building flat music entries.
    This adapter does not fetch individual videos or resolve their streams.
    """
    columns = renderer.get('flexColumns') or []
    artists, duration = [], None
    for column in columns[1:]:
        runs = column.get('musicResponsiveListItemFlexColumnRenderer', {}).get('text', {}).get('runs') or []
        for run in runs:
            browse = run.get('navigationEndpoint', {}).get('browseEndpoint', {})
            page_type = browse.get('browseEndpointContextSupportedConfigs', {}).get('browseEndpointContextMusicConfig', {}).get('pageType')
            text = run.get('text', '').strip()
            if text and page_type == 'MUSIC_PAGE_TYPE_ARTIST' and text not in artists:
                artists.append(text)
            if re.fullmatch(r'\d+(?::\d{2}){1,2}', text):
                duration = 0
                for part in text.split(':'):
                    duration = duration * 60 + int(part)
    if not artists and len(columns) > 1:
        runs = columns[1].get('musicResponsiveListItemFlexColumnRenderer', {}).get('text', {}).get('runs') or []
        # Some artists have no browse link; the first metadata segment is still their name.
        artist_text = ''.join(run.get('text', '') for run in runs).split(' • ', 1)[0].strip()
        if artist_text and not re.fullmatch(r'\d+(?::\d{2}){1,2}', artist_text):
            artists.append(artist_text)
    thumbnails = renderer.get('thumbnail', {}).get('musicThumbnailRenderer', {}).get('thumbnail', {}).get('thumbnails') or []
    return {'artist': ', '.join(artists) or None, 'duration': duration, 'thumbnails': thumbnails}


def register_music_search(ydl):
    from yt_dlp.extractor.youtube import YoutubeMusicSearchURLIE

    class MusicSearchWithMetadata(YoutubeMusicSearchURLIE):
        @classmethod
        def ie_key(cls):
            # Replace this one extractor within this YoutubeDL instance only.
            return YoutubeMusicSearchURLIE.ie_key()

        def _music_reponsive_list_entry(self, renderer):
            entry = super()._music_reponsive_list_entry(renderer)
            if entry and ID.fullmatch(str(entry.get('id', ''))):
                entry.update({k: v for k, v in music_search_metadata(renderer).items() if v})
            return entry

    ydl.add_info_extractor(MusicSearchWithMetadata())


PAGE_SIZE = 10


def search(query, page=1):
    """Fetch only a bounded flat metadata window, never resolve audio here.

    yt-dlp may traverse preceding upstream pages for an offset; it stops after
    this window plus one lookahead item, rather than enumerating all results.
    """
    import yt_dlp
    from yt_dlp.utils import DownloadError
    start = (page - 1) * PAGE_SIZE + 1
    options = {'quiet': True, 'no_warnings': True, 'skip_download': True,
               'socket_timeout': 10, 'logger': SafeLogger(),
               'extract_flat': 'in_playlist', 'lazy_playlist': True,
               'playliststart': start, 'playlistend': start + PAGE_SIZE}
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            register_music_search(ydl)
            result = ydl.extract_info('https://music.youtube.com/search?q=' + quote(query, safe='') + '#songs', download=False)
            entries = list((result or {}).get('entries') or [])
    except DownloadError:
        raise ResolveError('SEARCH_FAILED', 'Не удалось выполнить поиск. Попробуйте ещё раз.') from None
    items = []
    for entry in entries[:PAGE_SIZE]:
        if not isinstance(entry, dict) or not ID.fullmatch(str(entry.get('id', ''))):
            continue
        title = entry.get('track') or entry.get('title')
        if not isinstance(title, str) or not title.strip():
            continue
        duration = entry.get('duration')
        duration = duration if isinstance(duration, (int, float)) and math.isfinite(duration) and duration > 0 else None
        try:
            cover = choose_cover(entry)
        except ResolveError:
            cover = f"https://i.ytimg.com/vi/{entry['id']}/mqdefault.jpg"
        items.append({'video_id': entry['id'], 'title': title,
                      'artist': entry.get('artist') or entry.get('uploader') or entry.get('channel') or None,
                      'duration_seconds': duration, 'cover_link': cover})
    return {'items': items, 'page': page, 'has_more': page < 100 and len(entries) > PAGE_SIZE}
