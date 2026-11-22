import { artistKey, artistProfile } from './artists.js';
import { API_BASE } from './config.js';
import { FavoritesClient, favoriteIdentity, favoriteMetadata } from './favorites.js?v=1';
import { createArtworkWave } from './artwork-wave.js?v=6';
import { AudioEngine, searchTracks, recommendTracks } from './stream.js?v=9';
import { createFullscreenLayout } from './fullscreen.js?v=8';
import { createPlayerMaterial } from './liquid-glass.js?v=2';

let coverWave = null;
let fullscreenLayout = null;
let miniWave = null;
const playerMaterial = createPlayerMaterial(document.querySelector('.player'));

const paths = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  library:'<path d="M4 4v16M8 4v16M13 5l4-1 4 15-4 1-4-15Z"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  chevrons:'<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  play:'<path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M8 5h3v14H8zm6 0h3v14h-3z" fill="currentColor" stroke="none"/>',
  previous:'<path d="M17 6.5 9 12l8 5.5Z" fill="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M5 6v12" stroke-width="2.5"/>',
  next:'<path d="m7 6.5 8 5.5-8 5.5Z" fill="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M19 6v12" stroke-width="2.5"/>',
  shuffle:'<path d="M3 6h2c5 0 8 12 13 12h3m-4-4 4 4-4 4M3 18h2c1.7 0 3.4-1.5 5-4M14 9c1.3-2 2.6-3 4-3h3m-4-4 4 4-4 4"/>',
  repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-3v4a3 3 0 0 1-3 3H3"/>',
  volume:'<path d="m10 5-5 4H2v6h3l5 4V5Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted:'<path d="m10 5-5 4H2v6h3l5 4V5Zm5 4 6 6m0-6-6 6"/>',
  queue:'<path d="M4 5h16M4 10h16M4 15h7m4-1 6 4-6 4v-8Z"/>',
  expand:'<path d="M14 4h6v6m0-6-6 6M10 20H4v-6m0 6 6-6"/>',
  left:'<path d="m14 5-7 7 7 7"/>',
  right:'<path d="m10 5 7 7-7 7"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  telegram:'<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M22 3.2 2.3 10.8c-1.3.5-1.3 1.3-.3 1.7l5.1 1.6 1.9 5.8c.2.6.5.8.9.8.5 0 .8-.2 1.1-.5l2.5-2.4 5 3.7c.9.5 1.6.2 1.8-.9l3.2-15.8c.3-1.3-.5-2-1.5-1.6ZM8 13.7l11.5-7.2c.5-.3 1-.1.6.2l-9.4 8.5-.4 3.8L8 13.7Z"/>',
  headphones:'<path d="M3 13v-1a9 9 0 0 1 18 0v1M3 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 1-2Zm18 0h-3v8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-1-2Z"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  down:'<path d="m5 9 7 7 7-7"/>',
  dots:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  music:'<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  arrowup:'<path d="M7 17 17 7M7 7h10v10"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.music}</svg>`;
function hydrateIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon)); }
const esc = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tracks = [];
const albums = [];
const placeholderArt = './assets/hero.png';
let queueRecommendations = null;
let discoveryRequest = null;
let discoverySeed = null;
let discovery = {tracks:[], artists:[], albums:[]};

const engine = new AudioEngine(() => { if(state.repeat){seek(0);engine.play(tracks[state.current],0).catch(()=>toast('Tap Play to resume audio.'));}else if(state.queuePosition+1<state.queue.length)nextTrack();else {cancelQueueRecommendations();state.playing=false;state.position=tracks[state.current]?.duration || 0;updatePlayback();} }, message => {state.loading=false;state.playing=false;updatePlayback();toast(message);}, () => {state.loading=false;state.playing=true;updatePlayback();}, () => {++state.sessionPlay;state.position=engine.getCurrentTime();state.loading=false;state.playing=false;updatePlayback();});
let searchRequest = 0;
function readSaved(key, fallback) { try { const result=JSON.parse(localStorage.getItem(key)); return result ?? fallback; } catch { return fallback; } }
const savedLists=readSaved('openmusic-playlists',[]);
const state = {view:'home',current:null,loading:false,playing:false,position:0,volume:.65,previousVolume:.65,shuffle:false,repeat:false,queue:[],queuePosition:-1,manualQueue:new Set(),recommendedQueue:false,likes:new Set(),user:null,authError:'',favoriteErrors:new Map(),favoritesBusy:false,authEpoch:0,playlists:[],overlay:null,returnFocus:null,sessionPlay:0};
state.playlists=Array.isArray(savedLists)?savedLists.filter(p=>typeof p?.name==='string'&&Array.isArray(p.tracks)).map(p=>({
  name:p.name,
  tracks:p.tracks.filter(t=>/^[A-Za-z0-9_-]{11}$/.test(t?.video_id || '')&&typeof t.title==='string').map(registerTrack)
})):[];
const content=document.querySelector('#content');
const overlayRoot=document.querySelector('#overlay-root');
const formatTime = n => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
function persist() {
  const playlists=state.playlists.map(p=>({name:p.name,tracks:p.tracks.map(id=>({
    video_id:tracks[id].video_id, ...favoriteMetadata(tracks[id])
  }))}));
  try { localStorage.setItem('openmusic-playlists',JSON.stringify(playlists)); } catch {}
}
function toast() {} // No floating notifications anywhere in the interface.
function albumIsCurrent(id) { const ids=albums[id].tracks;return state.queue.length===ids.length && ids.every((track,i)=>state.queue[i]===track); }
const playbackGlyph = document.querySelector('.main-play').innerHTML;
function albumCard(id) {
  const a=albums[id];
  return `<article class="album-card"><div class="album-art"><img src="${esc(a.cover)}" alt="" loading="lazy" /><button class="album-open" data-action="open-album" data-id="${id}" aria-label="Open ${esc(a.title)}"></button><button class="card-play album-play" data-playing="${state.playing && albumIsCurrent(id)}" data-action="play-album" data-id="${id}" aria-label="Play ${esc(a.title)}">${playbackGlyph}</button></div><button class="album-name" data-action="open-album" data-id="${id}">${esc(a.title)}</button><button class="artist-link album-artist" data-action="open-artist" data-artist="${esc(a.artist)}">${esc(a.artist)}</button></article>`;
}
function trackRow(id,index,{table=false,queue=false,queuePosition=null}={}) { const t=tracks[id], liked=state.likes.has(id),current=state.current===id; return `<div class="track-row ${current?'current':''}" data-track="${id}" data-action="play-track" data-id="${id}"${Number.isInteger(queuePosition)?` data-queue-position="${queuePosition}"`:""}><span class="track-number">${current&&state.playing?'<span class="equalizer"><i></i><i></i><i></i></span>':String(index+1).padStart(2,'0')}</span><button class="track-thumb" style="padding:0" data-action="play-track" data-id="${id}" aria-label="Play ${esc(t.title)}"><img class="track-thumb" src="${esc(t.cover || placeholderArt)}" alt="" loading="lazy" /></button><div class="track-details"><button class="track-text" data-action="play-track" data-id="${id}"><span class="track-title">${esc(t.title)}</span></button><button class="track-artist artist-link" data-action="open-artist" data-id="${id}" ${t.artist?'':'disabled'}>${esc(t.artist)}</button></div>${table?`<span class="track-album">${esc(t.album)}</span>`:''}<button class="icon-button ${liked?'liked':''}" data-action="like" data-id="${id}" aria-label="${liked?'Remove from Liked Songs':'Add to Liked Songs'}: ${esc(t.title)}" aria-pressed="${liked}">${icon('heart')}</button><time class="track-duration">${t.duration>0?formatTime(t.duration):'—:—'}</time><button class="icon-button" data-action="${queue?'remove-queue':'track-menu'}" data-id="${id}" aria-label="${queue?'Remove from queue':'Track options'} ${esc(t.title)}">${icon(queue?'close':'dots')}</button></div>`; }
function homeContent() {
  return `<section class="section recent-section"><div class="section-heading"><h2>On repeat</h2></div><div class="recent-tracks">${discovery.tracks.map((id,i)=>trackRow(id,i)).join('')}</div></section>
    <section class="section artists-section"><div class="section-heading"><h2>Artists to explore</h2></div><div class="artist-grid">${discovery.artists.map(a=>`<button class="artist-card" data-action="open-artist" data-artist="${esc(a.name)}"><img src="${esc(a.cover)}" alt="" loading="lazy" /><strong>${esc(a.name)}</strong><span>Artist</span></button>`).join('')}</div></section>
    <section class="section"><div class="section-heading"><h2>Made for you</h2></div><div class="album-grid">${discovery.albums.map(id=>albumCard(id)).join('')}</div></section>`;
}
function discoverContent() {
  return `<section class="section"><div class="section-heading"><h2>Made to discover</h2></div>${discovery.tracks.map((id,i)=>trackRow(id,i)).join('')}</section>`;
}
function searchContent() { return `<section class="search-page"><h1 class="page-title">Search</h1><form id="resolve-form" class="large-search">${icon('search')}<input id="search-input" type="search" placeholder="Songs or artists" autocomplete="off" aria-label="Search music" /><button class="icon-button" data-action="clear-search" aria-label="Clear search" type="button">${icon('close')}</button><button class="text-button" type="submit">Search</button></form><div id="search-results" aria-live="polite">${discoverContent()}</div></section>`; }
function libraryContent() { return `<section class="library-page"><h1 class="page-title">Your Library</h1><div class="library-actions"><button class="tab active" data-action="navigate" data-view="liked">Liked Songs · ${state.likes.size}</button><button class="secondary-button" data-action="new-playlist">${icon('plus')}Create playlist</button></div><div class="section-heading"><h2>Playlists</h2></div>${state.playlists.map((p,i)=>`<button class="collection-item" data-action="custom-playlist" data-id="${i}"><span class="collection-cover">${icon('music')}</span><span>${esc(p.name)}<small>${p.tracks.length} ${trackWord(p.tracks.length)}</small></span>${icon('right')}</button>`).join('')}</section>`; }
function likedContent() { const ids=[...state.likes]; return `<section class="library-page"><div class="collection-heading"><div class="large-heart">${icon('heart')}</div><div><p class="modal-eyebrow">YOUR COLLECTION</p><h1>Liked Songs</h1><p>${ids.length} ${trackWord(ids.length)}${state.user?' · Saved for you':''}</p></div></div>${ids.length?`<div class="library-actions"><button class="pill-button primary" data-action="play-liked">${icon('play')}Play liked songs</button></div>${trackTable(ids)}`:`<div class="empty-state"><span>${icon('heart')}</span><h2>Your favorites live here.</h2><p>Like a track to keep it close.</p><button class="pill-button primary" data-action="navigate" data-view="home">Explore music ${icon('arrow')}</button></div>`}</section>`; }
function trackWord(n) { return n===1?'track':'tracks'; }
function trackTable(ids) { return `<div class="track-table"><div class="table-labels"><span>#</span><span>TITLE</span><span>TIME</span></div>${ids.map((id,i)=>trackRow(id,i,{table:true})).join('')}</div>`; }
function navigate(view,focusSearch=true) { cancelArtistLoad();artistHistory=[];closeQuickSearch();cancelSearch();closeOverlay(false);state.view=view;const templates={home:homeContent,search:searchContent,library:libraryContent,liked:likedContent}; content.innerHTML=(templates[view]||homeContent)();document.querySelectorAll('.nav-item,.mobile-nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===(view==='liked'?'library':view)));const labels={home:'FOR YOU',search:'SEARCH',library:'LIBRARY',liked:'LIKED SONGS'};document.querySelector('#breadcrumb').innerHTML=`${labels[view]||'FOR YOU'}`;window.scrollTo({top:0,behavior:'instant'});refreshFavoriteButtons();if(view==='search')updateSearchButton();if(view==='search'&&focusSearch)setTimeout(()=>document.querySelector('#search-input')?.focus(),80); }
function updateSidebar() { document.querySelector('#liked-count').textContent=`${state.likes.size} ${trackWord(state.likes.size)}`;document.querySelector('#custom-playlists').innerHTML=state.playlists.map((p,i)=>`<button class="collection-item" data-action="custom-playlist" data-id="${i}"><span class="collection-cover">${icon('music')}</span><span>${esc(p.name)}<small>${p.tracks.length} ${trackWord(p.tracks.length)}</small></span></button>`).join(''); }
let artistHistory=[], artistController=null, artistHeaderController=null;
const artistHeaders=new Map();
const artistPages=new Map();
function currentArtist() { return artistProfile(state.artist,tracks); }
function cancelArtistLoad() { artistController?.abort();artistController=null;artistHeaderController?.abort();artistHeaderController=null; }
function artistIsCurrent(a) { return state.queue.length===a.tracks.length && a.tracks.every((id,i)=>state.queue[i]===id); }
function artistHeaderMarkup(a) {
  const profile=artistHeaders.get(a.key);
  const image=profile?.data?.header_image;
  const message=profile?.status==='error'?profile.message:profile?.data&&!image?'No YouTube Music banner is available for this artist.':profile?.status==='loaded'?'':'Loading YouTube Music profile…';
  return `${image?`<img class="artist-header-image" src="${esc(image)}" alt="" referrerpolicy="no-referrer" />`:''}<div class="artist-hero-shade"></div><button class="icon-button artist-back" data-action="artist-back" aria-label="Back">${icon('left')}</button><div class="artist-heading"><p class="hero-tag">ARTIST</p><h1 id="artist-title">${esc(profile?.data?.name || a.name)}</h1><p id="artist-track-count">${a.tracks.length} ${trackWord(a.tracks.length)} available</p><div class="artist-profile-status" role="status"><span>${esc(message)}</span>${profile?.status==='error'?'<button class="text-button" data-action="artist-header-retry">Retry</button>':''}</div></div>`;
}
async function loadArtistHeader() {
  const a=currentArtist();if(!a||artistHeaderController)return;
  if(artistHeaders.get(a.key)?.status==='loaded')return;
  const controller=new AbortController();artistHeaderController=controller;
  artistHeaders.set(a.key,{status:'loading'});
  document.querySelector('.artist-hero').innerHTML=artistHeaderMarkup(a);
  try {
    const response=await fetch(`${API_BASE}/api/v1/artist`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:a.name,...(a.browseId?{browse_id:a.browseId}:{})}),signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error?.message || 'Could not load the artist profile.');
    if(controller.signal.aborted)return;
    artistHeaders.set(a.key,{status:'loaded',data});
  } catch(error) {
    if(controller.signal.aborted)return;
    artistHeaders.set(a.key,{status:'error',message:error.message || 'Could not load the artist profile.'});
  } finally {
    if(artistHeaderController===controller){
      artistHeaderController=null;
      if(state.view==='artist'&&artistKey(state.artist)===a.key)document.querySelector('.artist-hero').innerHTML=artistHeaderMarkup(currentArtist());
    }
  }
}
function artistContent() {
  const a=currentArtist();if(!a)return '';
  const page=artistPages.get(a.key);
  return `<article class="artist-page" aria-labelledby="artist-title"><header class="artist-hero">${artistHeaderMarkup(a)}</header><div class="artist-actions"><button class="album-play artist-play" data-action="play-artist" data-playing="${state.playing&&artistIsCurrent(a)}" aria-label="Play ${esc(a.name)}">${playbackGlyph}</button><button class="icon-button" data-action="shuffle-artist" aria-label="Shuffle artist tracks" aria-pressed="${state.shuffle}">${icon('shuffle')}</button><button class="icon-button" data-action="queue-artist" aria-label="Add artist tracks to queue">${icon('plus')}</button><span class="artist-action-label">Listen to ${esc(a.name)}</span></div><div class="artist-columns"><section class="artist-tracks"><div class="section-heading"><h2>Tracks</h2></div><div id="artist-track-list">${a.tracks.map((id,i)=>trackRow(id,i)).join('')}</div><div class="artist-load"><p id="artist-status" role="status">${page?.done?'All available tracks are shown.':'Explore more tracks by this artist.'}</p><button class="text-button" data-action="artist-more" ${page?.done?'hidden':''}>Load more ${icon('right')}</button></div></section></div></article>`;
}
function openArtist(name) {
  const a=artistProfile(name,tracks);if(!a)return;
  if(state.view==='artist'&&artistKey(state.artist)===a.key){closeOverlay();return;}
  cancelArtistLoad();cancelSearch();closeQuickSearch();
  artistHistory.push({view:state.view,artist:state.artist,html:content.innerHTML,scroll:window.scrollY,breadcrumb:document.querySelector('#breadcrumb').textContent,query:document.querySelector('#search-input')?.value,shownSearch});
  closeOverlay(false);state.view='artist';state.artist=a.name;
  content.innerHTML=artistContent();document.querySelector('#breadcrumb').textContent='ARTIST';
  document.querySelectorAll('.nav-item,.mobile-nav button').forEach(el=>el.classList.remove('active'));
  window.scrollTo({top:0,behavior:'instant'});content.focus({preventScroll:true});updatePlayback();
  loadArtistHeader();
  if(!artistPages.has(a.key))loadArtistTracks();
}
function backFromArtist() {
  cancelArtistLoad();const previous=artistHistory.pop();if(!previous){navigate('home');return;}
  closeOverlay(false);state.view=previous.view;state.artist=previous.artist;shownSearch=previous.shownSearch;
  const templates={home:homeContent,library:libraryContent,liked:likedContent,artist:artistContent};
  content.innerHTML=templates[state.view]?templates[state.view]():previous.html;
  const input=document.querySelector('#search-input');if(input){input.value=previous.query || '';if(!input.value.trim())document.querySelector('#search-results').innerHTML=discoverContent();}
  document.querySelector('#breadcrumb').textContent=previous.breadcrumb;
  document.querySelectorAll('.nav-item,.mobile-nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===(state.view==='liked'?'library':state.view)));
  updatePlayback();if(state.view==='search'){document.querySelector('#search-results')?.removeAttribute('aria-busy');updateSearchButton();}
  window.scrollTo({top:previous.scroll,behavior:'instant'});content.focus({preventScroll:true});
  if(state.view==='artist')loadArtistHeader();
}
function syncArtistPlayback() {
  const a=state.view==='artist'?currentArtist():null;if(!a)return;
  const button=document.querySelector('.artist-play');if(!button)return;
  const active=artistIsCurrent(a);button.dataset.playing=String(active&&state.playing);
  button.setAttribute('aria-label',`${active&&state.playing?'Pause':'Play'} ${a.name}`);
  button.setAttribute('aria-busy',String(active&&state.loading));
  const shuffle=document.querySelector('[data-action="shuffle-artist"]');shuffle?.classList.toggle('active',state.shuffle);shuffle?.setAttribute('aria-pressed',String(state.shuffle));
}
async function loadArtistTracks() {
  const a=currentArtist();if(!a||artistController)return;
  const entry=artistPages.get(a.key);if(entry?.done)return;
  const controller=new AbortController();artistController=controller;
  const status=document.querySelector('#artist-status'),button=document.querySelector('[data-action="artist-more"]');
  status.textContent='Loading tracks…';button.disabled=true;
  try {
    const page=(entry?.page || 0)+1;
    const data=await loadSearchResults(a.name,page,controller.signal);
    if(controller.signal.aborted||state.view!=='artist'||artistKey(state.artist)!==a.key)return;
    artistPages.set(a.key,{page,done:!data.has_more});
    document.querySelector('#artist-track-list').innerHTML=currentArtist().tracks.map((id,i)=>trackRow(id,i)).join('');
    document.querySelector('#artist-track-count').textContent=`${currentArtist().tracks.length} ${trackWord(currentArtist().tracks.length)} available`;
    status.textContent=data.has_more?'More results available.':'All available tracks are shown.';button.hidden=!data.has_more;updatePlayback();
  } catch(error) {if(!controller.signal.aborted){status.textContent=error.message || 'Couldn’t load tracks. Try again.';button.innerHTML=`Try again ${icon('right')}`;}}
  finally {if(artistController===controller){artistController=null;button.disabled=false;}}
}
const searchCache = new Map();
const queryKey = query => query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
let searchController = null, searchBusy = false, shownSearch = null;
function updateSearchButton() {
  const input=document.querySelector('#search-input'), button=document.querySelector('#resolve-form [type="submit"]');
  if(button) button.disabled=searchBusy || !queryKey(input.value) || !!searchCache.get(queryKey(input.value))?.has(1);
}
function searchCover(url) {
  return url?.replace(/^(https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/)hqdefault\.jpg$/, '$1mqdefault.jpg');
}
function registerTrack(item) {
  let track=tracks.find(t=>t.video_id===item.video_id);
  if(!track){
    track={id:tracks.length,video_id:item.video_id,title:item.title,artist:item.artist || '',
      album:'YouTube',cover:searchCover(item.cover_link || item.cover) || `https://i.ytimg.com/vi/${encodeURIComponent(item.video_id)}/mqdefault.jpg`,
      duration:item.duration_seconds || 0};
    tracks.push(track);
  }
  if(item.artist_browse_id)track.artist_browse_id=item.artist_browse_id;
  if(item.artists?.length)track.artists=item.artists;
  if(item.album)track.album=item.album.title;
  return track.id;
}
function renderDiscovery() {
  if(state.view==='home')content.innerHTML=homeContent();
  if(state.view==='search'&&!document.querySelector('#search-input').value.trim()){
    document.querySelector('#search-results').innerHTML=discoverContent();
  }
  updatePlayback();
}
function resetDiscovery() {
  discoveryRequest?.abort();
  discoveryRequest=null;
  discoverySeed=null;
  discovery={tracks:[],artists:[],albums:[]};
}
async function refreshDiscovery() {
  const id=state.user ? state.likes.values().next().value : undefined;
  if(id===discoverySeed)return;
  resetDiscovery();
  renderDiscovery();
  const seed=tracks[id];
  if(!seed?.artist)return;
  discoverySeed=id;
  const request=new AbortController();
  discoveryRequest=request;
  const items=await recommendTracks(seed,request.signal);
  if(request.signal.aborted)return;
  discoveryRequest=null;
  const artists=new Map(), releases=new Map();
  discovery.tracks=items.map(item=>{
    const trackId=registerTrack(item), track=tracks[trackId];
    for(const name of item.artists || [item.artist]){
      const key=artistKey(name);
      if(key&&!artists.has(key))artists.set(key,{name,cover:track.cover});
    }
    if(item.album){
      const {id:key,title}=item.album;
      if(!releases.has(key))releases.set(key,{title,artist:item.artist,cover:track.cover,tracks:[]});
      releases.get(key).tracks.push(trackId);
    }
    return trackId;
  });
  discovery.artists=[...artists.values()];
  discovery.albums=[...releases].map(([key,release])=>{
    let id=albums.findIndex(a=>a.key===key);
    if(id===-1){id=albums.length;albums.push({id,key,...release});}
    else albums[id].tracks=[...new Set([...albums[id].tracks,...release.tracks])];
    return id;
  });
  renderDiscovery();
}
async function loadSearchResults(query, page, signal) {
  const key=queryKey(query);
  const cached=searchCache.get(key)?.get(page);
  if(cached)return cached;
  const data=await searchTracks({query,page},signal);
  if(signal.aborted)throw signal.reason;
  const ids=data.items.map(registerTrack);
  if(!searchCache.has(key))searchCache.set(key,new Map());
  const entry={ids,has_more:data.has_more};
  searchCache.get(key).set(page,entry);
  return entry;
}
function renderSearchPage(query, page, data) {
  shownSearch={query,page};
  const result=document.querySelector('#search-results');
  result.innerHTML=`<p class="search-meta">${data.ids.length ? `Page ${page}` : 'No results'}</p>${data.ids.length?trackTable(data.ids):'<p>Try another song or artist.</p>'}<nav class="search-pagination" aria-label="Search result pages"><button class="text-button" data-action="search-page" data-page="${page-1}" ${page===1?'disabled':''}>${icon('left')}Previous</button><span>Page ${page}</span><button class="text-button" data-action="search-page" data-page="${page+1}" ${data.has_more?'':'disabled'}>Next${icon('right')}</button></nav>`;
}
function cancelSearch() { ++searchRequest; searchController?.abort(); searchBusy=false; }
async function resolveSearch(page=1, pagination=false) {
  const input=document.querySelector('#search-input'), result=document.querySelector('#search-results');
  const query=pagination?shownSearch?.query:input.value.trim(), key=queryKey(query || '');
  if(!key || searchBusy || (!pagination && searchCache.get(key)?.has(1)))return;
  const cached=searchCache.get(key)?.get(page);
  if(cached){renderSearchPage(query,page,cached);return;}
  const request=++searchRequest;
  searchController?.abort(); searchController=new AbortController(); searchBusy=true; updateSearchButton();
  result.setAttribute('aria-busy','true');
  result.querySelectorAll('.search-pagination button').forEach(button=>button.disabled=true);
  if(page===1)result.textContent='Searching…';
  try {
    const entry=await loadSearchResults(query,page,searchController.signal);
    if(request!==searchRequest || state.view!=='search' || !result.isConnected)return;
    renderSearchPage(query,page,entry);
    // Warm only the first result, without delaying the page or starting audio.
    if(entry.ids.length)engine.prepare(tracks[entry.ids[0]]).then(()=>updatePlayback()).catch(()=>{});
  } catch(error) {
    if(request===searchRequest && result.isConnected){
      if(shownSearch && page>1)renderSearchPage(shownSearch.query,shownSearch.page,searchCache.get(key).get(shownSearch.page));
      else result.textContent='';
      const message=document.createElement('p');message.className='search-meta';message.textContent=error.message || 'Search failed. Try again.';result.append(message);
    }
  } finally {if(request===searchRequest){searchBusy=false;result.removeAttribute('aria-busy');updateSearchButton();}}
}

const quickPanel=document.querySelector('#quick-search');
const quickForm=document.querySelector('#quick-search-form');
const quickInput=document.querySelector('#quick-search-input');
const quickClear=document.querySelector('#quick-search-clear');
const quickStatus=document.querySelector('#quick-search-status');
const quickResults=document.querySelector('#quick-search-results');
let quickRequest=null, quickIds=[], quickPage=1;

function cancelQuickSearch() {
  quickRequest?.abort();
  quickRequest=null;
  quickResults.removeAttribute('aria-busy');
}
function closeQuickSearch(restoreFocus=false) {
  if(quickPanel.hidden)return;
  cancelQuickSearch();
  quickPanel.hidden=true;
  if(restoreFocus)quickInput.focus({preventScroll:true});
}
function openQuickSearch() {
  if(state.overlay)return;
  quickInput.focus({preventScroll:true});
}
function renderQuickResults(ids, message, page=1, hasMore=false) {
  quickIds=ids;
  quickPage=page;
  quickStatus.textContent=message;
  quickResults.innerHTML=ids.map(id=>{
    const t=tracks[id];
    return `<button type="button" class="quick-search-track" data-quick-track="${id}" aria-label="Play ${esc(t.title)} by ${esc(t.artist || 'YouTube')}"><img src="${esc(t.cover || placeholderArt)}" alt="" loading="lazy" /><span><strong>${esc(t.title)}</strong><small>${esc(t.artist || 'YouTube')}</small></span>${icon('play')}</button>`;
  }).join('')+(page>1 || hasMore ? `<nav class="quick-search-pages" aria-label="Quick search result pages"><button type="button" data-quick-page="${page-1}" ${page===1?'disabled':''}>← Previous</button><button type="button" data-quick-page="${page+1}" ${hasMore?'':'disabled'}>Next →</button></nav>`:'');
  quickResults.scrollTop=0;
}
function showQuickCatalog(entry, page) {
  renderQuickResults(entry.ids,entry.ids.length ? `YouTube results · Page ${page}` : 'No tracks found. Try another song or artist.',page,entry.has_more);
}
function refreshQuickSearch() {
  closeQuickSearch();
  quickClear.hidden=!quickInput.value;
}
async function runQuickSearch(page) {
  const query=quickInput.value.trim();
  if(!query || quickRequest)return;
  const controller=new AbortController();
  quickRequest=controller;
  if(document.activeElement!==quickInput)quickInput.focus({preventScroll:true});
  quickPanel.hidden=false;
  quickResults.setAttribute('aria-busy','true');
  if(page===1)renderQuickResults([],'Searching…');
  else quickStatus.textContent='Searching…';
  try {
    const entry=await loadSearchResults(query,page,controller.signal);
    if(quickRequest!==controller)return;
    showQuickCatalog(entry,page);
  } catch {
    if(quickRequest!==controller)return;
    quickStatus.textContent='Couldn’t reach YouTube. Try again.';
  } finally {
    if(quickRequest===controller){
      quickRequest=null;
      quickResults.removeAttribute('aria-busy');
    }
  }
}
quickForm.querySelector('kbd').textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';
quickForm.addEventListener('click',event=>{
  if(!event.target.closest('button'))openQuickSearch();
});
quickInput.addEventListener('input',refreshQuickSearch);
quickClear.addEventListener('click',()=>{
  quickInput.value='';
  quickInput.focus();
  refreshQuickSearch();
});
quickForm.addEventListener('submit',event=>{event.preventDefault();runQuickSearch(1);});
quickResults.addEventListener('click',event=>{
  const track=event.target.closest('[data-quick-track]');
  const page=Number(event.target.closest('[data-quick-page]')?.dataset.quickPage);
  if(track){closeQuickSearch(true);playRecommended(Number(track.dataset.quickTrack));}
  else if(page>0 && Math.abs(page-quickPage)===1)runQuickSearch(page);
});
function outsideQuickSearch(target) {return !quickPanel.contains(target) && !quickForm.contains(target);}
document.addEventListener('pointerdown',event=>{if(outsideQuickSearch(event.target))closeQuickSearch();});
document.addEventListener('focusin',event=>{if(outsideQuickSearch(event.target))closeQuickSearch();});
function updatePlayback() { miniWave?.wake();coverWave?.wake();syncFullscreen(); if('mediaSession' in navigator)navigator.mediaSession.playbackState=state.playing?'playing':'paused'; document.querySelectorAll('.album-play[data-action="play-album"]').forEach(el=>{const active=state.playing && albumIsCurrent(Number(el.dataset.id));el.dataset.playing=String(active);el.setAttribute('aria-label',`${active?'Pause':'Play'} ${albums[Number(el.dataset.id)].title}`);}); syncArtistPlayback(); const t=tracks[state.current];document.querySelectorAll('.player [data-action=fullscreen], .player [data-action=like-current], .player [data-action=toggle-play]').forEach(el=>el.disabled=!t);playerMaterial.setTint('#b7a2e8');document.querySelector('#player-art').src=t?.cover || placeholderArt;document.querySelector('#player-title').textContent=t?.title || 'No track selected';document.querySelector('#player-artist').textContent=t?.artist || '';document.querySelector('#player-artist').disabled=!t?.artist;document.querySelector('#duration').textContent=t?.duration>0?formatTime(t.duration):'—:—';document.querySelectorAll('[data-action="toggle-play"]').forEach(el=>{if(el.classList.contains('main-play'))el.dataset.playing=String(state.playing);else el.innerHTML=icon(state.playing?'pause':'play');el.setAttribute('aria-busy',String(state.loading));el.setAttribute('aria-label',state.loading?'Cancel loading':state.playing?'Pause':'Play');});document.querySelectorAll('[data-action="shuffle"]').forEach(el=>{el.classList.toggle('active',state.shuffle);el.setAttribute('aria-pressed',String(state.shuffle));});document.querySelectorAll('[data-action="repeat"]').forEach(el=>{el.classList.toggle('active',state.repeat);el.setAttribute('aria-pressed',String(state.repeat));});document.querySelectorAll('[data-action="like-current"]').forEach(el=>{el.classList.toggle('liked',state.likes.has(state.current));el.setAttribute('aria-pressed',String(state.likes.has(state.current)));el.setAttribute('aria-label',state.likes.has(state.current)?'Remove current track from Liked Songs':'Add current track to Liked Songs');});document.body.classList.toggle('is-playing',state.playing);document.querySelectorAll('.track-row').forEach(row=>{const current=Number(row.dataset.track)===state.current;row.classList.toggle('current',current);row.setAttribute('aria-busy',String(current&&state.loading));const rowTrack=tracks[Number(row.dataset.track)];row.querySelector('img').src=rowTrack.cover || placeholderArt;row.querySelector('.track-artist').textContent=rowTrack.artist || '';row.querySelector('.track-duration').textContent=rowTrack.duration>0?formatTime(rowTrack.duration):'—:—';const num=row.querySelector('.track-number');if(!num.dataset.number)num.dataset.number=num.textContent||'01';num.innerHTML=current&&state.playing?'<span class="equalizer"><i></i><i></i><i></i></span>':num.dataset.number;});refreshFavoriteButtons();updatePosition(); }
function updatePosition() { const t=tracks[state.current] || {duration:0};const position=Math.min(state.position,t.duration);const elapsed=formatTime(position);const remaining=t.duration>0?`−${formatTime(t.duration-position)}`:'—:—';for(const id of ['progress','full-progress']){const el=document.getElementById(id);if(el){if(Number(el.max)!==t.duration)el.max=t.duration || 1;el.disabled=t.duration<=0;el.value=position;el.style.setProperty('--fill',`${t.duration>0?position/t.duration*100:0}%`);const ariaText=`${elapsed} of ${formatTime(t.duration)}`;if(el.getAttribute('aria-valuetext')!==ariaText)el.setAttribute('aria-valuetext',ariaText);}}const miniElapsed=document.querySelector('#elapsed');if(miniElapsed.textContent!==elapsed)miniElapsed.textContent=elapsed;const fullElapsed=document.querySelector('#full-elapsed');if(fullElapsed&&fullElapsed.textContent!==elapsed)fullElapsed.textContent=elapsed;const fullRemaining=document.querySelector('#full-remaining');if(fullRemaining&&fullRemaining.textContent!==remaining)fullRemaining.textContent=remaining; }
function cancelQueueRecommendations() {
  queueRecommendations?.abort();
  queueRecommendations=null;
}
async function playRecommended(id) {
  if(!tracks[id])return;
  const manual=[...state.manualQueue].filter(track=>track!==id);
  playTrack(id,[id,...manual]);
  state.recommendedQueue=true;
  state.manualQueue=new Set(manual);
  const request=new AbortController();
  queueRecommendations=request;
  const items=await recommendTracks(tracks[id],request.signal);
  if(request.signal.aborted)return;
  queueRecommendations=null;
  const present=new Set(state.queue);
  for(const item of items){
    const next=registerTrack(item);
    if(!present.has(next)){state.queue.push(next);present.add(next);}
  }
  if(state.overlay?.type==='queue')renderQueue();
}
async function playTrack(id,queue=null,queuePosition=null) {
  if(!tracks[id])return;
  cancelQueueRecommendations();
  if(queue){
    state.queue=[...queue];
    state.manualQueue.clear();
    state.recommendedQueue=false;
  }
  const request=++state.sessionPlay;
  state.current=id;
  state.position=0;
  if(state.queue[queuePosition]!==id)queuePosition=state.queue.indexOf(id);
  if(queuePosition<0)queuePosition=state.queue.push(id)-1;
  state.queuePosition=queuePosition;
  for(const played of state.queue.slice(0,queuePosition+1))state.manualQueue.delete(played);
  state.loading=true;
  state.playing=false;
  updatePlayback();
  if(state.overlay?.type==='queue')renderQueue();
  try {
    await engine.play(tracks[id],0);
    if(request===state.sessionPlay)state.playing=engine.isPlaying;
  } catch {
    if(request===state.sessionPlay)state.playing=false;
  } finally {
    if(request===state.sessionPlay){
      state.loading=false;
      updatePlayback();
      if(state.overlay?.type==='queue')renderQueue();
    }
  }
}
async function togglePlay() {
  if(state.current===null)return;
  const wasPlaying=state.playing;
  if(state.playing || state.loading){
    ++state.sessionPlay;if(!state.loading)state.position=engine.getCurrentTime();else cancelQueueRecommendations();engine.pause();state.loading=false;state.playing=false;
  } else {
    const request=++state.sessionPlay;
    state.loading=true;updatePlayback();
    try {await engine.play(tracks[state.current],engine.audio.ended?0:state.position);if(request!==state.sessionPlay)return;state.playing=engine.isPlaying;}
    catch {state.playing=false;}
    if(request!==state.sessionPlay)return;state.loading=false;
  }
  updatePlayback();if(state.playing!==wasPlaying)playerMaterial.ripple(state.playing);
}
function seek(seconds) {if(!tracks[state.current]?.duration)return;state.position=Math.max(0,Math.min(seconds,tracks[state.current].duration-.05));engine.seek(state.position);updatePosition();}
function nextTrack(direction=1) {
  if(direction<0&&state.position>3){seek(0);return;}
  let position=state.queuePosition+direction;
  if(direction>0&&state.manualQueue.size){
    const manualPosition=state.queue.findIndex((id,i)=>i>state.queuePosition&&state.manualQueue.has(id));
    if(manualPosition!==-1)position=manualPosition;
  }else if(direction>0&&state.shuffle&&!state.recommendedQueue&&position<state.queue.length){
    position+=Math.floor(Math.random()*(state.queue.length-position));
  }
  if(state.queue[position]!==undefined)playTrack(state.queue[position],null,position);
}
function enqueue(ids, first=false) {
  const current=state.queue.slice(0,state.queuePosition+1);
  const upcoming=state.queue.slice(state.queuePosition+1);
  const additions=[...new Set(ids)].filter(id=>tracks[id]&&state.current!==id);
  const manual=[...state.manualQueue].filter(id=>!additions.includes(id));
  state.manualQueue=new Set(first?[...additions,...manual]:[...manual,...additions]);
  state.queue=[...current,...state.manualQueue,...upcoming.filter(id=>!state.manualQueue.has(id))];
}
function showOverlay(html,{type,id}={}) {closeQuickSearch();coverWave?.destroy();coverWave=null;fullscreenLayout?.destroy();fullscreenLayout=null;if(!state.overlay)state.returnFocus=document.activeElement;state.overlay={type,id};overlayRoot.innerHTML=html;document.body.classList.toggle('has-fullscreen',type==='fullscreen');document.body.style.overflow='hidden';hydrateIcons(overlayRoot);setTimeout(()=>overlayRoot.querySelector('input, .modal-close, button')?.focus(),50);}
function closeOverlay(restoreFocus=true) {coverWave?.destroy();coverWave=null;fullscreenLayout?.destroy();fullscreenLayout=null;if(!state.overlay)return;overlayRoot.innerHTML='';state.overlay=null;document.body.classList.remove('has-fullscreen');document.body.style.overflow='';document.querySelector('.queue-button').setAttribute('aria-expanded','false');if(restoreFocus)state.returnFocus?.focus?.();}
const closeButton = `<button class="icon-button modal-close" data-action="close-overlay" aria-label="Close">${icon('close')}</button>`;
function openAlbum(id) {
  const a=albums[id];
  if(!a)return;
  showOverlay(`<div class="overlay-backdrop" data-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="album-dialog-title">${closeButton}<div class="modal-hero"><div class="modal-cover"><img src="${esc(a.cover)}" alt="" /></div><div><span class="modal-eyebrow">ALBUM</span><h2 id="album-dialog-title">${esc(a.title)}</h2><button class="artist-link" data-action="open-artist" data-artist="${esc(a.artist)}">${esc(a.artist)}</button></div></div><div class="modal-body"><div class="modal-actions"><button class="album-play" data-action="play-album" data-id="${id}" aria-label="Play ${esc(a.title)}">${playbackGlyph}</button><button class="icon-button" data-action="queue-album" data-id="${id}" aria-label="Add album tracks to queue">${icon('plus')}</button></div>${a.tracks.map((id,i)=>trackRow(id,i)).join('')}</div></section></div>`,{type:'album',id});
}
function renderQueue() {const current=tracks[state.current],upNext=state.queue.slice(state.queuePosition+1);showOverlay(`<div class="overlay-backdrop queue-backdrop" data-backdrop><section class="queue-panel" role="dialog" aria-modal="true" aria-labelledby="queue-heading">${closeButton}<h2 id="queue-heading">Queue</h2>${current?`<h3>Now playing</h3>${trackRow(current.id,0,{queuePosition:state.queuePosition})}`:''}<h3>Up next · ${upNext.length} tracks</h3><p class="queue-description">Your next tracks.</p>${upNext.length?upNext.map((id,i)=>trackRow(id,i,{queue:true,queuePosition:state.queuePosition+1+i})).join(''):'<p class="queue-empty">Your queue is empty.</p>'}</section></div>`,{type:'queue'});document.querySelector('.queue-button').setAttribute('aria-expanded','true');}
function syncFullscreen() {
  const root=document.querySelector('.listening-room');if(!root)return;
  const t=tracks[state.current],art=t.cover || placeholderArt;
  root.setAttribute('aria-label',`Now playing ${t.title}`);
  for(const img of root.querySelectorAll('[data-full-art]'))if(img.getAttribute('src')!==art)img.src=art;
  root.querySelector('#full-title').textContent=t.title;
  const artistButton=root.querySelector('#full-artist');
  artistButton.textContent=t.artist || 'YouTube';
  artistButton.disabled=!t.artist;
  root.querySelector('#full-title').title=t.title;
  artistButton.title=artistButton.textContent;
  root.querySelector('#full-context').textContent=t.album || 'YouTube';
  root.querySelector('.fullscreen-menu').dataset.id=String(state.current);

}
function renderFullscreen() {
  if(state.current===null)return;
  if(state.overlay?.type==='fullscreen'){closeOverlay();return;}
  showOverlay(`<section class="fullscreen-player listening-room" role="dialog" aria-labelledby="full-title">
    <img class="fullscreen-bg" data-full-art alt="" />
    <header class="fullscreen-header"><button class="icon-button fullscreen-back" data-action="close-overlay" aria-label="Back" title="Back">${icon('down')}</button><div class="fullscreen-context"><span>NOW PLAYING</span><strong id="full-context"></strong></div><button class="icon-button fullscreen-menu" data-action="track-menu" aria-label="Current track options">${icon('dots')}</button></header>
    <div class="listening-layout"><div class="listening-art-stage"><canvas class="cover-wave" aria-hidden="true"></canvas><img class="listening-art" data-full-art alt="Current track artwork" /></div>
    <div class="listening-details"><div class="listening-track-copy"><h2 id="full-title"></h2><p><button type="button" id="full-artist" class="artist-link" data-action="open-artist"></button></p></div></div><div class="listening-controls"></div><div class="listening-actions"></div></div>
  </section>`,{type:'fullscreen'});
  fullscreenLayout=createFullscreenLayout(document.querySelector('.listening-room'),document.querySelector('.player'));
  updatePlayback();
  coverWave=createArtworkWave(document.querySelector('.cover-wave'),()=>({playing:state.playing,analyser:engine.getAnalyser(),track:state.current,volume:state.volume}));
}
function smallModal(title,body,type='info') {showOverlay(`<div class="overlay-backdrop" data-backdrop><section class="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="small-title">${closeButton}<h2 id="small-title">${title}</h2>${body}</section></div>`,{type});}
function newPlaylist() {smallModal('New playlist','<p>Name your playlist. The current track will be added.</p><form id="playlist-form"><input id="playlist-name" name="name" placeholder="Playlist name" required maxlength="50" autocomplete="off" aria-label="Playlist name" /><button type="submit" class="pill-button primary">Create playlist '+icon('plus')+'</button></form>','new-playlist');setTimeout(()=>document.querySelector('#playlist-name')?.focus(),60);}
function customPlaylist(id) {const p=state.playlists[id];if(!p)return;showOverlay(`<div class="overlay-backdrop" data-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="custom-title">${closeButton}<div class="modal-hero"><div class="large-heart collection-cover" style="height:130px;width:130px;border-radius:18px;background:var(--accent)">${icon('music')}</div><div><p class="modal-eyebrow">MADE BY YOU</p><h2 id="custom-title">${esc(p.name)}</h2><p>${p.tracks.length} ${trackWord(p.tracks.length)}</p></div></div><div class="modal-body"><div class="modal-actions"><button class="pill-button" data-action="play-custom" data-id="${id}">${icon('play')}Play</button><button class="secondary-button" data-action="add-current-custom" data-id="${id}">${icon('plus')}Current track</button></div>${p.tracks.map((id,i)=>trackRow(id,i)).join('')}</div></section></div>`,{type:'custom',id});}
function trackMenu(id) {const t=tracks[id];smallModal(esc(t.title),`<p>${esc(t.artist)} · ${esc(t.album)}</p><div style="display:grid;gap:10px;margin-top:25px"><button class="secondary-button" data-action="open-artist" data-id="${id}" ${t.artist?'':'disabled'}>${icon('music')}Go to artist</button><button class="secondary-button" data-action="queue-track" data-id="${id}">${icon('queue')}Play next</button><button class="secondary-button" data-action="like" data-id="${id}">${icon('heart')}${state.likes.has(id)?'Remove from Liked Songs':'Add to Liked Songs'}</button>${state.playlists.map((p,i)=>`<button class="secondary-button" data-action="add-track-custom" data-id="${i}" data-track="${id}">${icon('plus')}${esc(p.name)}</button>`).join('')}</div>`,'track-menu');}
function addToCustom(index,id) {if(!tracks[id])return;const p=state.playlists[index];if(p.tracks.includes(id)){toast('Already in this playlist');return;}p.tracks.push(id);persist();updateSidebar();toast(`Added to “${p.name}”`);if(state.overlay?.type==='custom')customPlaylist(index);}
const actions={
  'open-artist':el=>openArtist(el.dataset.artist || tracks[Number(el.dataset.id ?? state.current)]?.artist),
  'artist-back':backFromArtist,
  'artist-header-retry':()=>loadArtistHeader(),
  'artist-more':()=>loadArtistTracks(),
  'play-artist':()=>{const a=currentArtist();if(a?.tracks.length){if(artistIsCurrent(a))togglePlay();else playTrack(a.tracks[0],a.tracks);}},
  'shuffle-artist':()=>{const a=currentArtist();if(!a?.tracks.length)return;state.shuffle=!state.shuffle;if(state.shuffle)playTrack(a.tracks[Math.floor(Math.random()*a.tracks.length)],a.tracks);else updatePlayback();},
  'queue-artist':()=>{const a=currentArtist();if(a){enqueue(a.tracks);const button=document.querySelector('[data-action="queue-artist"]');if(button){button.innerHTML=icon('check');button.setAttribute('aria-label','Artist tracks added to queue');button.disabled=true;}}},
  fullscreen:renderFullscreen,
  navigate: el=>navigate(el.dataset.view),
  'open-album':el=>openAlbum(Number(el.dataset.id)),
  'play-album':el=>{const a=albums[Number(el.dataset.id)];if(albumIsCurrent(Number(el.dataset.id)))togglePlay();else playTrack(a.tracks[0],a.tracks);},
  'play-track':el=>{
    const id=Number(el.dataset.id), row=el.closest('[data-queue-position]');
    if(row){playTrack(id,null,Number(row.dataset.queuePosition));return;}
    if(!state.overlay&&['liked','search'].includes(state.view)){playRecommended(id);return;}
    let queue=null;
    if(state.overlay?.type==='album')queue=albums[state.overlay.id].tracks;
    else if(state.overlay?.type==='custom')queue=state.playlists[state.overlay.id].tracks;
    else if(!state.overlay&&state.view==='artist')queue=currentArtist()?.tracks;
    playTrack(id,queue);
  },
  'toggle-play':togglePlay,
  next:()=>nextTrack(),previous:()=>nextTrack(-1),
  shuffle:()=>{state.shuffle=!state.shuffle;updatePlayback();},
  repeat:()=>{state.repeat=!state.repeat;updatePlayback();},
  like:el=>changeFavorite(Number(el.dataset.id)),
  'like-current':()=>changeFavorite(state.current),
  mute:()=>{if(state.volume>0){state.previousVolume=state.volume;state.volume=0;}else state.volume=state.previousVolume||.65;setVolume(state.volume);},
  queue:()=>state.overlay?.type==='queue'?closeOverlay():renderQueue(),
  'close-overlay':()=>closeOverlay(),
  'search-page':el=>resolveSearch(Number(el.dataset.page),true),
  'clear-search':()=>{cancelSearch();shownSearch=null;const input=document.querySelector('#search-input');input.value='';document.querySelector('#search-results').innerHTML=discoverContent();updateSearchButton();input.focus();},
  'play-liked':()=>playRecommended(state.likes.values().next().value),
  'remove-queue':el=>{const id=Number(el.dataset.id);const rowPosition=Number(el.closest('[data-queue-position]')?.dataset.queuePosition);const index=Number.isInteger(rowPosition)&&rowPosition>state.queuePosition&&state.queue[rowPosition]===id?rowPosition:state.queue.indexOf(id,state.queuePosition+1);if(index>=0){state.queue.splice(index,1);state.manualQueue.delete(id);}renderQueue();},
  'queue-track':el=>{enqueue([Number(el.dataset.id)],true);closeOverlay();},
  'queue-album':el=>enqueue(albums[Number(el.dataset.id)].tracks),
  'track-menu':el=>trackMenu(Number(el.dataset.id)),
  'new-playlist':newPlaylist,
  'custom-playlist':el=>customPlaylist(Number(el.dataset.id)),
  'play-custom':el=>{const ids=state.playlists[Number(el.dataset.id)].tracks;if(ids.length)playTrack(ids[0],ids);},
  'add-current-custom':el=>addToCustom(Number(el.dataset.id),state.current),
  'add-track-custom':el=>addToCustom(Number(el.dataset.id),Number(el.dataset.track)),
  profile:showProfile,
  login:()=>{window.location.href=`${API_BASE}/api/v1/auth/telegram/start`;},
  logout:logoutAccount,
  'retry-account':loadAccount,
  about:()=>smallModal('About OpenMusic',`<p>Search YouTube Music, save liked songs to your Telegram account, and create playlists on this device.</p>`)
};
function setVolume(value) {state.volume=value;engine.setVolume(value);for(const input of document.querySelectorAll('#volume,#full-volume')){input.value=value;input.style.setProperty('--fill',`${value*100}%`);}const button=document.querySelector('.volume-button');button.innerHTML=icon(value===0?'muted':'volume');button.setAttribute('aria-label',value===0?'Unmute':'Mute');miniWave?.wake();coverWave?.wake();syncFullscreen();}
document.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el){const action=actions[el.dataset.action];if(action)action(el);}else if(event.target.hasAttribute('data-backdrop'))closeOverlay();});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='search-input'){cancelSearch();const result=document.querySelector('#search-results');result?.removeAttribute('aria-busy');const cached=searchCache.get(queryKey(el.value))?.get(1);if(cached)renderSearchPage(el.value.trim(),1,cached);else {shownSearch=null;result.innerHTML=el.value.trim()?'Press Search to find tracks.':discoverContent();}updateSearchButton();}if(el.id==='progress'||el.id==='full-progress')seek(Number(el.value));if(el.id==='volume'||el.id==='full-volume')setVolume(Number(el.value));});
document.addEventListener('submit',event=>{if(event.target.id==='resolve-form'){event.preventDefault();resolveSearch();return;}if(event.target.id!=='playlist-form')return;event.preventDefault();const input=document.querySelector('#playlist-name');const name=input.value.trim();if(!name){input.focus();return;}state.playlists.push({name,tracks:state.current===null?[]:[state.current]});persist();updateSidebar();if(state.view==='library')content.innerHTML=libraryContent();customPlaylist(state.playlists.length-1);toast(`“${name}” created`);});
document.addEventListener('keydown',event=>{const editable=['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName);if(event.key==='Escape'){if(!quickPanel.hidden || quickForm.contains(event.target)){event.preventDefault();closeQuickSearch(true);return;}if(state.overlay)closeOverlay();else if(state.view==='search')navigate('home');else if(state.view==='artist')backFromArtist();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){if(!state.overlay){event.preventDefault();openQuickSearch();}return;}if(event.code==='Space'&&!editable&&!['BUTTON','A'].includes(event.target.tagName)){event.preventDefault();togglePlay();}if(event.altKey&&!editable&&event.key==='ArrowRight'){event.preventDefault();nextTrack();}if(event.altKey&&!editable&&event.key==='ArrowLeft'){event.preventDefault();nextTrack(-1);}if(event.key==='Tab'&&state.overlay){const scope=state.overlay.type==='fullscreen'?document:overlayRoot;const els=[...scope.querySelectorAll(state.overlay.type==='fullscreen'?'.listening-room button,.listening-room input,.player button,.player input':'button,input,a,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');if(!els.length)return;const first=els[0],last=els[els.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
setInterval(()=>{if(state.playing){state.position=engine.getCurrentTime();updatePosition();}},250);
window.addEventListener('pagehide',()=>{++state.sessionPlay;state.loading=false;if(state.playing)state.position=engine.getCurrentTime();engine.pause();state.playing=false;updatePlayback();});
miniWave=createArtworkWave(document.querySelector('.mini-art-wave'),()=>({playing:state.playing,analyser:engine.getAnalyser(),track:state.current,volume:state.volume}));
hydrateIcons();navigate('home',false);updateSidebar();updatePlayback();setVolume(.65);

// Route headset/OS commands through the same state transitions as the visible controls.
if ('mediaSession' in navigator) {
  const handlers = {
    play: () => { if (!state.playing && !state.loading) togglePlay(); },
    pause: () => { if (state.playing || state.loading) togglePlay(); },
    stop: () => { if (state.playing || state.loading) togglePlay(); },
    previoustrack: () => nextTrack(-1),
    nexttrack: () => nextTrack(),
    seekto: details => { if (Number.isFinite(details.seekTime)) seek(details.seekTime); }
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  }
}

// Music CDN artwork can be unavailable even when supplied by search.
document.addEventListener('error', event => {
  const image=event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if(image.classList.contains('artist-header-image')){
    image.remove();const a=currentArtist();
    if(a){artistHeaders.set(a.key,{status:'error',message:'Could not load the artist profile image.'});document.querySelector('.artist-hero').innerHTML=artistHeaderMarkup(a);}
    return;
  }
  const row=image.closest('.track-row');
  const quickRow=image.closest('[data-quick-track]');
  const track=row ? tracks[Number(row.dataset.track)] : quickRow ? tracks[Number(quickRow.dataset.quickTrack)] : (image.id==='player-art'||image.hasAttribute('data-full-art')) ? tracks[state.current] : null;
  if (!track?.video_id) return;
  const fallback=`https://i.ytimg.com/vi/${encodeURIComponent(track.video_id)}/mqdefault.jpg`;
  if(image.src.endsWith('/assets/hero.png'))return;
  track.cover=image.src===fallback?placeholderArt:fallback;
  image.src=track.cover;
  document.querySelectorAll(`.track-row[data-track="${track.id}"] img`).forEach(img=>{
    if(img.getAttribute('src')!==track.cover)img.src=track.cover;
  });
  if(state.current===track.id){document.querySelector('#player-art').src=track.cover;syncFullscreen();}
}, true);

// Account state never comes from localStorage. Each async read is scoped to a login epoch.
const favorites = new FavoritesClient(clearAccount);
function clearAccount() {
  const hadAccount=!!state.user;
  ++state.authEpoch;
  if(hadAccount){
    cancelArtistLoad();artistPages.clear();artistHeaders.clear();artistHistory=[];
    cancelSearch();cancelQuickSearch();closeQuickSearch();searchCache.clear();shownSearch=null;
    quickResults.replaceChildren();quickStatus.textContent='';quickInput.value='';quickIds=[];quickPage=1;
    cancelQueueRecommendations();
    ++state.sessionPlay;
    engine.clearRemote();
    state.current=null;state.position=0;state.loading=false;state.playing=false;
    state.queue=[];state.queuePosition=-1;state.manualQueue.clear();state.recommendedQueue=false;
    if(state.view==='artist')navigate('home');
    if(state.view==='search')content.innerHTML=searchContent();
  }
  state.user=null;state.authError='';state.likes.clear();resetDiscovery();state.favoriteErrors.clear();
  favorites.csrf='';
  if(hadAccount||state.overlay?.type!=='sign-in')closeOverlay(false);
  renderAccount();refreshFavoritesView();renderDiscovery();
}
function renderAccount() {
  const name=state.user?.name || 'Guest';
  document.querySelector('.user-profile').innerHTML=`<span class="avatar" aria-hidden="true">${esc(name[0])}</span><span>${esc(name)}</span>${icon('chevrons')}`;
  const mobile=document.querySelector('.mobile-avatar');
  mobile.textContent=state.user?name[0]:name;mobile.setAttribute('aria-label',name);
  let status=document.querySelector('#account-status');
  if(!status){status=document.createElement('div');status.id='account-status';status.setAttribute('role','status');content.before(status);}
  status.textContent=state.authError;
}
function refreshFavoritesView() {
  updateSidebar();updatePlayback();
  if(state.view==='liked')content.innerHTML=likedContent();
  if(state.view==='library')content.innerHTML=libraryContent();
  refreshFavoriteButtons();
}
function refreshFavoriteButtons() {
  document.querySelectorAll('[data-action="like"],[data-action="like-current"]').forEach(button=>{
    const type='track';
    const id=button.dataset.action==='like-current'?state.current:Number(button.dataset.id);
    const liked=state.likes.has(id);
    button.classList.toggle('liked',liked);button.setAttribute('aria-pressed',String(liked));
    button.disabled=state.favoritesBusy || id===null;
    button.setAttribute('aria-label',`${liked?'Unlike':'Like'} ${type}`);
    const old=button.nextElementSibling;
    if(old?.classList.contains('favorite-error'))old.remove();
    const message=state.favoriteErrors.get(`${type}:${id}`);
    if(message){const error=document.createElement('span');error.className='favorite-error';error.setAttribute('role','alert');error.textContent=message;button.after(error);}
  });
}
async function readFavorites(epoch) {
  const songs=await favorites.list('track');
  if(epoch!==state.authEpoch)return;
  state.likes=new Set(songs.filter(item=>item.source==='youtube').map(item=>registerTrack({
    ...item,video_id:item.source_id
  })));
  refreshFavoritesView();
  void refreshDiscovery();
}
async function loadAccount() {
  if(state.favoritesBusy)return;
  state.favoritesBusy=true;refreshFavoriteButtons();
  const epoch=++state.authEpoch;
  try {
    const user=await favorites.me();
    if(epoch!==state.authEpoch)return;
    state.user=user;state.authError='';renderAccount();
    if(state.overlay?.type==='sign-in')showProfile();
    await readFavorites(epoch);
    if(epoch!==state.authEpoch)return;
    if(state.overlay?.type==='profile')showProfile();
  } catch(error) {
    // An absent/expired session has already cleared account state in the client.
    if(epoch!==state.authEpoch)return;
    state.authError=error.message;renderAccount();
  } finally {state.favoritesBusy=false;refreshFavoriteButtons();}
}
function showProfile() {
  if(!state.user){
    showOverlay(`<div class="overlay-backdrop sign-in-backdrop" data-backdrop>
      <section class="modal sign-in-modal" role="dialog" aria-modal="true" aria-label="Sign in">
        ${closeButton}
        <button type="button" class="pill-button telegram-sign-in" data-action="login">${icon('telegram')}Sign in with Telegram</button>
      </section>
    </div>`,{type:'sign-in'});
    return;
  }
  smallModal(esc(state.user.name),`<p>${state.user.username?'@'+esc(state.user.username):'Telegram'}</p><p>${state.likes.size} liked ${state.likes.size===1?'song':'songs'}</p><div class="account-actions"><button class="secondary-button" data-action="retry-account">Refresh likes</button><button class="secondary-button" data-action="logout">Sign out</button></div><p id="profile-error" role="alert"></p>`,'profile');
}
async function logoutAccount() {
  if(state.favoritesBusy)return;
  state.favoritesBusy=true;refreshFavoriteButtons();
  try {await favorites.logout();clearAccount();state.authError='';renderAccount();}
  catch(error){const target=document.querySelector('#profile-error');if(target)target.textContent=error.message;}
  finally{state.favoritesBusy=false;refreshFavoriteButtons();}
}
async function changeFavorite(id) {
  const type='track';
  if(!state.user){showProfile();return;}
  if(state.favoritesBusy)return;
  const item=tracks[id];if(!item)return;
  const set=state.likes;
  const [source,key]=favoriteIdentity(item),epoch=state.authEpoch;
  state.favoritesBusy=true;state.favoriteErrors.delete(`${type}:${id}`);refreshFavoriteButtons();
  try {
    if(set.has(id))await favorites.remove(type,source,key);
    else await favorites.save(type,source,key,favoriteMetadata(item));
    await readFavorites(epoch);
  } catch(error) {
    if(epoch===state.authEpoch)state.favoriteErrors.set(`${type}:${id}`,error.message);
  } finally {state.favoritesBusy=false;refreshFavoriteButtons();}
}

loadAccount();
