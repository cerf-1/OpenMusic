// Artist identities come from catalog metadata, never from song titles.
export const artistKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function artistProfile(name, tracks, albums = []) {
  const key = artistKey(name);
  if (!key) return null;
  const songs = tracks.filter(track => [track.artist, ...(track.artists || [])].some(artist => artistKey(artist) === key));
  if (!songs.length) return null;
  const local = songs.find(track => !track.video_id);
  return {
    key,
    name: [songs[0].artist, ...(songs[0].artists || [])].find(artist => artistKey(artist) === key).trim(),
    cover: local ? `./assets/${local.art}` : (songs[0].cover || './assets/hero.png'),
    browseId: songs.find(track => /^UC[A-Za-z0-9_-]{22}$/.test(track.artist_browse_id || ''))?.artist_browse_id || null,
    genre: local?.genre || '',
    local: !!local,
    tracks: songs.map(track => track.id),
    collections: local ? albums.filter(album => album.tracks.some(id => songs.some(song => song.id === id))).map(album => album.id) : []
  };
}

export function catalogArtists(tracks, albums) {
  return [...new Set(tracks.filter(track => !track.video_id).map(track => artistKey(track.artist)))]
    .map(name => artistProfile(name, tracks, albums)).filter(Boolean);
}
