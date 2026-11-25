// Artist identities come from catalog metadata, never from song titles.
export const artistKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export const artistBrowseId = value => /^UC[A-Za-z0-9_-]{22}$/.test(value || '') ? value : null;

export function artistCredits(item) {
  const names = item?.artists?.length ? item.artists : [item?.artist];
  const legacyId = names.length === 1 ? artistBrowseId(item?.artist_browse_id) : null;
  const credits = item?.artist_credits?.length ? item.artist_credits : names.flatMap(name =>
    (names.length === 1 && !legacyId ? (name || '').split(/,\s+/) : [name])
      .map(name => ({name, browse_id: legacyId}))
  );
  const artists = new Map();
  for (const credit of credits) {
    const name = credit.name?.trim();
    if (!name) continue;
    const browse_id = artistBrowseId(credit.browse_id);
    const key = browse_id || artistKey(name);
    if (!artists.has(key)) artists.set(key, {name, ...(browse_id ? {browse_id} : {})});
  }
  return [...artists.values()];
}

export const artistLabel = item => artistCredits(item).map(credit => credit.name).join(', ');

export function artistProfile(name, tracks, albums = [], {browseId = null, allowEmpty = false} = {}) {
  const nameKey = artistKey(name);
  if (!nameKey) return null;
  const matches = tracks.flatMap(track => {
    const credits = artistCredits(track);
    const credit = (browseId && credits.find(credit => credit.browse_id === browseId)) ||
      credits.find(credit => artistKey(credit.name) === nameKey && (!browseId || !credit.browse_id));
    return credit ? [{track, credit}] : [];
  });
  if (!matches.length && !allowEmpty) return null;
  const songs = matches.map(match => match.track);
  const ids = new Set(matches.map(match => match.credit.browse_id).filter(Boolean));
  const local = songs.find(track => !track.video_id);
  return {
    key: browseId || nameKey,
    name: matches[0]?.credit.name || name.trim(),
    cover: local ? `./assets/${local.art}` : (songs[0]?.cover || './assets/hero.png'),
    browseId: browseId || (ids.size === 1 ? [...ids][0] : null),
    genre: local?.genre || '',
    local: !!local,
    tracks: songs.map(track => track.id),
    collections: local ? albums.filter(album => album.tracks.some(id => songs.some(song => song.id === id))).map(album => album.id) : []
  };
}

export function catalogArtists(tracks, albums) {
  return [...new Set(tracks.filter(track => !track.video_id).flatMap(track => artistCredits(track).map(credit => artistKey(credit.name))))]
    .map(name => artistProfile(name, tracks, albums)).filter(Boolean);
}
