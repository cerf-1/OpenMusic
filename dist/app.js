import { AudioEngine, searchTracks } from './stream.js?v=4';
import { createPlayerMaterial } from './liquid-glass.js?v=2';

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
const tracks = [
  {id:0,title:'Weightless',artist:'Sora',album:'Afterglow',art:'hero.png',duration:218,genre:'Ambient',engine:0},
  {id:1,title:'Ocean Drive',artist:'Noa & The Waves',album:'Blue Hours',art:'cover-coast.jpg',duration:246,genre:'Chill',engine:1},
  {id:2,title:'Midnight City',artist:'Lunar Echo',album:'Night People',art:'cover-night.jpg',duration:203,genre:'Electronic',engine:2},
  {id:3,title:'In Bloom',artist:'June Sol',album:'Soft Focus',art:'cover-bloom.jpg',duration:192,genre:'Indie',engine:3},
  {id:4,title:'Slow Motion',artist:'Milo Fields',album:'Dune',art:'cover-dunes.jpg',duration:231,genre:'Downtempo',engine:4},
  {id:5,title:'Somewhere, Else',artist:'Aether',album:'Evergreen',art:'cover-forest.jpg',duration:264,genre:'Ambient',engine:5},
  {id:6,title:'First Light',artist:'Sora',album:'Afterglow',art:'hero.png',duration:187,genre:'Ambient',engine:0},
  {id:7,title:'Saltwater',artist:'Noa & The Waves',album:'Blue Hours',art:'cover-coast.jpg',duration:225,genre:'Chill',engine:1},
  {id:8,title:'Neon Memories',artist:'Lunar Echo',album:'Night People',art:'cover-night.jpg',duration:211,genre:'Electronic',engine:2},
  {id:9,title:'Golden',artist:'June Sol',album:'Soft Focus',art:'cover-bloom.jpg',duration:198,genre:'Indie',engine:3},
  {id:10,title:'Warm Sand',artist:'Milo Fields',album:'Dune',art:'cover-dunes.jpg',duration:208,genre:'Downtempo',engine:4},
  {id:11,title:'Between The Trees',artist:'Aether',album:'Evergreen',art:'cover-forest.jpg',duration:239,genre:'Ambient',engine:5}
];
const albums = [
  {id:0,title:'Afterglow',subtitle:'Soft electronics, warm light',art:'hero.png',cover:'AFTER<br>GLOW',artist:'Sora',tag:'OPENMUSIC SELECT',type:'Featured playlist',tracks:[0,6,4,1,5,3],tone:'#edc29c'},
  {id:1,title:'Blue Hours',subtitle:'Chill · Open air',art:'cover-coast.jpg',cover:'blue<br>hours.',artist:'Noa & The Waves',tag:'SOUNDS LIKE SUMMER',type:'Made for you',tracks:[1,7,5,4,0],tone:'#b7a2e8'},
  {id:2,title:'Night People',subtitle:'Electronic · After dark',art:'cover-night.jpg',cover:'NIGHT<br>PEOPLE',artist:'Lunar Echo',tag:'AFTER HOURS CLUB',type:'Made for you',tracks:[2,8,4,10,0],tone:'#959cb1'},
  {id:3,title:'Soft Focus',subtitle:'Indie · A little sunlight',art:'cover-bloom.jpg',cover:'soft<br>focus',artist:'June Sol',tag:'A LITTLE MORE FEELING',type:'Made for you',tracks:[3,9,1,7,6],tone:'#e1b7a3'},
  {id:4,title:'Dune',subtitle:'Downtempo · Take it slow',art:'cover-dunes.jpg',cover:'DUNE',artist:'Milo Fields',tag:'TAKE YOUR TIME',type:'Made for you',tracks:[4,10,0,6,5],tone:'#e3c5bb'},
  {id:5,title:'Evergreen',subtitle:'Ambient · Into the green',art:'cover-forest.jpg',cover:'Ever<br>green',artist:'Aether',tag:'ROOM TO BREATHE',type:'Made for you',tracks:[5,11,0,6,1],tone:'#b7a2e8'}
];
const heroSlides = [
  {album:0,title:'Stay a little<br>longer.',description:'A softer sound for the space between moments.',tag:'FEATURED PLAYLIST',meta:'OPENMUSIC SELECT'},
  {album:1,title:'Drift into<br>blue hours.',description:'Easy rhythms for wherever you are.',tag:'BLUE HOURS',meta:'SOUNDS LIKE SUMMER'},
  {album:2,title:'After dark,<br>come alive.',description:'A late-night pulse for the city.',tag:'NIGHT PEOPLE',meta:'AFTER HOURS'}
];
const engine = new AudioEngine(() => { if(state.repeat){seek(0);engine.play(tracks[state.current],0).catch(()=>toast('Tap Play to resume audio.'));}else if(state.queuePosition+1<state.queue.length)nextTrack();else {state.playing=false;state.position=tracks[state.current].duration;updatePlayback();} }, message => {state.loading=false;state.playing=false;updatePlayback();toast(message);}, () => {state.loading=false;state.playing=true;updatePlayback();}, () => {++state.sessionPlay;state.position=engine.getCurrentTime();state.loading=false;state.playing=false;updatePlayback();});
let searchRequest = 0;
function readSaved(key, fallback) { try { const result=JSON.parse(localStorage.getItem(key)); return result ?? fallback; } catch { return fallback; } }
const savedLikes=readSaved('openmusic-likes',[]);
const savedLists=readSaved('openmusic-playlists',[]);
const state = {view:'home',tab:'foryou',hero:0,current:0,loading:false,playing:false,position:0,volume:.65,previousVolume:.65,shuffle:false,repeat:false,queue:[0,1,2,3,4,5,6,7,8,9,10,11],queuePosition:0,likes:new Set(Array.isArray(savedLikes)?savedLikes.filter(id=>tracks[id]):[]),playlists:Array.isArray(savedLists)?savedLists.filter(p=>typeof p.name==='string'&&Array.isArray(p.tracks)):[],overlay:null,returnFocus:null,sessionPlay:0};
const content=document.querySelector('#content');
const overlayRoot=document.querySelector('#overlay-root');
const formatTime = n => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
function persist() { try { localStorage.setItem('openmusic-likes',JSON.stringify([...state.likes])); localStorage.setItem('openmusic-playlists',JSON.stringify(state.playlists)); } catch {} }
function toast() {} // No floating notifications anywhere in the interface.
function coverContent(album) { return `<div class="cover-text"><span class="cover-top">${album.tag}</span><div class="cover-bottom"><div class="cover-title">${album.cover}</div><small>VOL. 0${album.id+1}</small></div></div>`; }
function albumIsCurrent(id) { const ids=albums[id].tracks;return state.queue.length===ids.length && ids.every((track,i)=>state.queue[i]===track); }
const playbackGlyph = document.querySelector('.main-play').innerHTML;
function albumCard(id, badge=false) { const a=albums[id]; return `<article class="album-card"><div class="album-art"><img src="./assets/${a.art}" alt="${esc(a.title)} artwork" loading="lazy" />${coverContent(a)}${badge?'<span class="mix-tag">FOR YOU</span>':''}<button class="album-open" data-action="open-album" data-id="${id}" aria-label="Open ${esc(a.title)}"></button><button class="card-play album-play" data-playing="${state.playing && albumIsCurrent(id)}" data-action="play-album" data-id="${id}" aria-label="${state.playing && albumIsCurrent(id)?'Pause':'Play'} ${esc(a.title)}">${playbackGlyph}</button></div><button class="album-name" data-action="open-album" data-id="${id}">${a.title}</button><p class="album-subtitle">${a.subtitle}</p></article>`; }
function trackRow(id,index,{table=false,queue=false,queuePosition=null}={}) { const t=tracks[id], liked=state.likes.has(id),current=state.current===id; return `<div class="track-row ${current?'current':''}" data-track="${id}"${Number.isInteger(queuePosition)?` data-queue-position="${queuePosition}"`:""}><span class="track-number">${current&&state.playing?'<span class="equalizer"><i></i><i></i><i></i></span>':String(index+1).padStart(2,'0')}</span><button class="track-thumb" style="padding:0" data-action="play-track" data-id="${id}" aria-label="Play ${esc(t.title)}"><img class="track-thumb" src="${esc(t.cover || `./assets/${t.art}`)}" alt="" loading="lazy" /></button><button class="track-text" data-action="play-track" data-id="${id}"><span class="track-title">${esc(t.title)}</span><span class="track-artist">${esc(t.artist)}</span></button>${table?`<span class="track-album">${t.album}</span>`:''}<button class="icon-button ${liked?'liked':''}" data-action="like" data-id="${id}" aria-label="${liked?'Remove from Liked Songs':'Add to Liked Songs'}: ${esc(t.title)}" aria-pressed="${liked}">${icon('heart')}</button><time class="track-duration">${t.duration>0?formatTime(t.duration):'—:—'}</time><button class="icon-button" data-action="${queue?'remove-queue':'track-menu'}" data-id="${id}" aria-label="${queue?'Remove from queue':'Track options'} ${esc(t.title)}">${icon(queue?'close':'dots')}</button></div>`; }
function heroMarkup() { const s=heroSlides[state.hero],a=albums[s.album]; return `<section class="hero" aria-label="${s.tag}"><img class="hero-image" src="./assets/${a.art}" alt="${state.hero===0?'Sunset over mountain ridges':a.title}" /><div class="hero-content"><div class="hero-tag">${s.tag}</div><h2>${s.title}</h2><p class="hero-description">${s.description}</p><div class="hero-actions"><button class="pill-button primary" data-action="play-album" data-id="${s.album}">${icon('play')}Play</button><button class="icon-button hero-save ${state.likes.has(a.tracks[0])?'liked':''}" data-action="like" data-id="${a.tracks[0]}" aria-label="Like the first track">${icon('heart')}</button></div></div><div class="hero-meta">${icon('headphones')}${s.meta}</div><div class="hero-dots">${heroSlides.map((_,i)=>`<i class="${i===state.hero?'active':''}"></i>`).join('')}</div><div class="hero-pagination"><span><strong>0${state.hero+1}</strong> / 03</span><button class="icon-button" data-action="hero-prev" aria-label="Previous collection">${icon('left')}</button><button class="icon-button" data-action="hero-next" aria-label="Next collection">${icon('right')}</button></div></section>`; }
function sectionHead(title,action='all-albums',label='Show all') { return `<div class="section-heading"><h2>${title}</h2><button class="text-button" data-action="${action}">${label}${icon('right')}</button></div>`; }
function homeContent() { const titles={foryou:'Made for you',new:'Fresh finds',moods:'Pick a mood'}; return `<div class="intro"><h1>Listen your way<span>.</span></h1></div><nav class="view-tabs" aria-label="Discover music"><button class="tab ${state.tab==='foryou'?'active':''}" data-action="tab" data-tab="foryou">For you</button><button class="tab ${state.tab==='new'?'active':''}" data-action="tab" data-tab="new">New</button><button class="tab ${state.tab==='moods'?'active':''}" data-action="tab" data-tab="moods">Moods</button></nav>${heroMarkup()}<section class="section">${sectionHead(titles[state.tab])}${state.tab==='moods'?moodGrid():`<div class="album-grid">${(state.tab==='new'?[3,2,5,1,4]:[1,2,3,4,5]).map(id=>albumCard(id)).join('')}</div>`}</section><section class="section recent-section">${sectionHead('On repeat','show-repeat','See all')}<div class="recent-tracks">${[0,1,4,6].map((id,i)=>trackRow(id,i)).join('')}</div></section>`; }
function moodGrid() { const labels=['Unwind','Find a beat','Feel it','Slow down','Get lost','Daydream']; return `<div class="mood-grid">${[1,2,3,4,5,0].map((id,i)=>`<button class="mood-card" data-action="open-album" data-id="${id}"><img src="./assets/${albums[id].art}" alt="" /><strong>${labels[i]}</strong><span>${icon('arrowup')}</span></button>`).join('')}</div>`; }
function searchContent() { return `<section class="search-page"><h1 class="page-title">Search</h1><form id="resolve-form" class="large-search">${icon('search')}<input id="search-input" type="search" placeholder="Songs, artists, or moods" autocomplete="off" aria-label="Search music" /><button class="icon-button" data-action="clear-search" aria-label="Clear search" type="button">${icon('close')}</button><button class="text-button" type="submit">Search</button></form><div id="search-results" aria-live="polite"><p class="search-meta">Browse by mood</p>${moodGrid()}<section class="section">${sectionHead('Made to discover','show-discover','See all')}${[0,3,2].map((id,i)=>trackRow(id,i)).join('')}</section></div></section>`; }
function libraryContent() { return `<section class="library-page"><h1 class="page-title">Your Library</h1><div class="library-actions"><button class="tab active" data-action="navigate" data-view="liked">Liked Songs · ${state.likes.size}</button><button class="secondary-button" data-action="new-playlist">${icon('plus')}Create playlist</button></div><div class="section-heading"><h2>Playlists</h2><span class="eyebrow">${6+state.playlists.length} playlists</span></div><div class="album-grid">${albums.map(a=>albumCard(a.id)).join('')}</div>${state.playlists.length?`<section class="section"><div class="section-heading"><h2>Made by you</h2></div>${state.playlists.map((p,i)=>`<button class="collection-item" data-action="custom-playlist" data-id="${i}"><span class="collection-cover">${icon('music')}</span><span>${esc(p.name)}<small>${p.tracks.length} ${trackWord(p.tracks.length)}</small></span>${icon('right')}</button>`).join('')}</section>`:''}</section>`; }
function likedContent() { const ids=[...state.likes]; return `<section class="library-page"><div class="collection-heading"><div class="large-heart">${icon('heart')}</div><div><p class="modal-eyebrow">YOUR COLLECTION</p><h1>Liked Songs</h1><p>${ids.length} ${trackWord(ids.length)} · Saved for you</p></div></div>${ids.length?`<div class="library-actions"><button class="pill-button primary" data-action="play-liked">${icon('play')}Play liked songs</button></div>${trackTable(ids)}`:`<div class="empty-state"><span>${icon('heart')}</span><h2>Your favorites live here.</h2><p>Like a track to keep it close.</p><button class="pill-button primary" data-action="navigate" data-view="home">Explore music ${icon('arrow')}</button></div>`}</section>`; }
function trackWord(n) { return n===1?'track':'tracks'; }
function trackTable(ids) { return `<div class="track-table"><div class="table-labels"><span>#</span><span>TITLE</span><span>TIME</span></div>${ids.map((id,i)=>trackRow(id,i,{table:true})).join('')}</div>`; }
function navigate(view,focusSearch=true) { cancelSearch();closeOverlay(false);state.view=view;const templates={home:homeContent,search:searchContent,library:libraryContent,liked:likedContent}; content.innerHTML=(templates[view]||homeContent)();document.querySelectorAll('.nav-item,.mobile-nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===(view==='liked'?'library':view)));const labels={home:'FOR YOU',search:'SEARCH',library:'LIBRARY',liked:'LIKED SONGS'};document.querySelector('#breadcrumb').innerHTML=`${labels[view]||'FOR YOU'}`;window.scrollTo({top:0,behavior:'instant'});if(view==='search')updateSearchButton();if(view==='search'&&focusSearch)setTimeout(()=>document.querySelector('#search-input')?.focus(),80); }
function updateSidebar() { document.querySelector('#liked-count').textContent=`${state.likes.size} ${trackWord(state.likes.size)}`;document.querySelector('#custom-playlists').innerHTML=state.playlists.map((p,i)=>`<button class="collection-item" data-action="custom-playlist" data-id="${i}"><span class="collection-cover">${icon('music')}</span><span>${esc(p.name)}<small>${p.tracks.length} ${trackWord(p.tracks.length)}</small></span></button>`).join(''); }
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
    const data=await searchTracks({query,page},searchController.signal);
    if(request!==searchRequest || state.view!=='search' || !result.isConnected)return;
    const ids=data.items.map(item=>{
      let track=tracks.find(track=>track.video_id===item.video_id);
      if(!track){const id=tracks.length; track={id,title:item.title,artist:item.artist || '',album:'YouTube',art:'hero.png',cover:searchCover(item.cover_link) || `https://i.ytimg.com/vi/${encodeURIComponent(item.video_id)}/mqdefault.jpg`,duration:item.duration_seconds || 0,genre:'',engine:0,video_id:item.video_id};tracks.push(track);}
      return track.id;
    });
    if(!searchCache.has(key))searchCache.set(key,new Map());
    const entry={ids,has_more:data.has_more}; searchCache.get(key).set(page,entry);
    renderSearchPage(query,page,entry);
    // Warm only the first result, without delaying the page or starting audio.
    if(ids.length)engine.prepare(tracks[ids[0]]).then(()=>updatePlayback()).catch(()=>{});
  } catch(error) {
    if(request===searchRequest && result.isConnected){
      if(shownSearch && page>1)renderSearchPage(shownSearch.query,shownSearch.page,searchCache.get(key).get(shownSearch.page));
      else result.textContent='';
      const message=document.createElement('p');message.className='search-meta';message.textContent=error.message || 'Search failed. Try again.';result.append(message);
    }
  } finally {if(request===searchRequest){searchBusy=false;result.removeAttribute('aria-busy');updateSearchButton();}}
}
function search(query) { const q=query.trim().toLocaleLowerCase();const result=document.querySelector('#search-results');if(!q){result.innerHTML=`<p class="search-meta">Browse by mood</p>${moodGrid()}`;return;}const matches=tracks.filter(t=>`${t.title} ${t.artist} ${t.album} ${t.genre} ${albums[t.engine].title} ${albums[t.engine].subtitle}`.toLocaleLowerCase().includes(q));result.innerHTML=`<p class="search-meta">${matches.length?`Found: ${matches.length} ${trackWord(matches.length)}`:'No results'}</p>${matches.length?trackTable(matches.map(t=>t.id)):`<div class="empty-state"><span>${icon('search')}</span><h2>Nothing found.</h2><p>Try Sora, Ocean, Ambient, or a mood below.</p></div>${moodGrid()}`}`; }
function updatePlayback() { if('mediaSession' in navigator)navigator.mediaSession.playbackState=state.playing?'playing':'paused'; document.querySelectorAll('.album-play').forEach(el=>{const active=state.playing && albumIsCurrent(Number(el.dataset.id));el.dataset.playing=String(active);el.setAttribute('aria-label',`${active?'Pause':'Play'} ${albums[Number(el.dataset.id)].title}`);}); const t=tracks[state.current];playerMaterial.setTint('#b7a2e8');document.querySelector('#player-art').src=t.cover || `./assets/${t.art}`;document.querySelector('#player-title').textContent=t.title;document.querySelector('#player-artist').textContent=t.video_id ? (t.artist || 'YouTube') : `${t.artist} · ${t.album}`;document.querySelector('#duration').textContent=t.duration>0?formatTime(t.duration):'—:—';document.querySelector('#progress').max=t.duration;document.querySelectorAll('[data-action="toggle-play"]').forEach(el=>{if(el.classList.contains('main-play'))el.dataset.playing=String(state.playing);else el.innerHTML=icon(state.playing?'pause':'play');el.setAttribute('aria-busy',String(state.loading));el.setAttribute('aria-label',state.loading?'Cancel loading':state.playing?'Pause':'Play');});document.querySelectorAll('[data-action="shuffle"]').forEach(el=>{el.classList.toggle('active',state.shuffle);el.setAttribute('aria-pressed',String(state.shuffle));});document.querySelectorAll('[data-action="repeat"]').forEach(el=>{el.classList.toggle('active',state.repeat);el.setAttribute('aria-pressed',String(state.repeat));});document.querySelectorAll('[data-action="like-current"]').forEach(el=>{el.classList.toggle('liked',state.likes.has(state.current));el.setAttribute('aria-pressed',String(state.likes.has(state.current)));el.setAttribute('aria-label',state.likes.has(state.current)?'Remove current track from Liked Songs':'Add current track to Liked Songs');});document.body.classList.toggle('is-playing',state.playing);document.querySelectorAll('.track-row').forEach(row=>{const current=Number(row.dataset.track)===state.current;row.classList.toggle('current',current);row.setAttribute('aria-busy',String(current&&state.loading));const rowTrack=tracks[Number(row.dataset.track)];row.querySelector('img').src=rowTrack.cover || `./assets/${rowTrack.art}`;row.querySelector('.track-artist').textContent=rowTrack.artist || '';row.querySelector('.track-duration').textContent=rowTrack.duration>0?formatTime(rowTrack.duration):'—:—';const num=row.querySelector('.track-number');if(!num.dataset.number)num.dataset.number=num.textContent||'01';num.innerHTML=current&&state.playing?'<span class="equalizer"><i></i><i></i><i></i></span>':num.dataset.number;});updatePosition(); }
function updatePosition() { const t=tracks[state.current];const position=Math.min(state.position,t.duration);const elapsed=formatTime(position);const remaining=`−${formatTime(t.duration-position)}`;for(const id of ['progress','full-progress']){const el=document.getElementById(id);if(el){if(Number(el.max)!==t.duration)el.max=t.duration || 1;el.disabled=t.duration<=0;el.value=position;el.style.setProperty('--fill',`${t.duration>0?position/t.duration*100:0}%`);const ariaText=`${elapsed} of ${formatTime(t.duration)}`;if(el.getAttribute('aria-valuetext')!==ariaText)el.setAttribute('aria-valuetext',ariaText);}}const miniElapsed=document.querySelector('#elapsed');if(miniElapsed.textContent!==elapsed)miniElapsed.textContent=elapsed;const fullElapsed=document.querySelector('#full-elapsed');if(fullElapsed&&fullElapsed.textContent!==elapsed)fullElapsed.textContent=elapsed;const fullRemaining=document.querySelector('#full-remaining');if(fullRemaining&&fullRemaining.textContent!==remaining)fullRemaining.textContent=remaining; }
async function playTrack(id,queue=null,queuePosition=null) { if(!tracks[id] || (state.loading && state.current===id))return;const request=++state.sessionPlay;state.current=id;state.position=0;if(queue)state.queue=[...queue];if(Number.isInteger(queuePosition)&&state.queue[queuePosition]===id){state.queuePosition=queuePosition;}else{const qi=state.queue.indexOf(id);if(qi>=0)state.queuePosition=qi;else{state.queue.push(id);state.queuePosition=state.queue.length-1;}}state.loading=true;state.playing=false;updatePlayback();try { await engine.play(tracks[id],0);if(request!==state.sessionPlay)return;state.loading=false;state.playing=engine.isPlaying;updatePlayback();if(state.overlay?.type==='fullscreen')renderFullscreen();if(state.overlay?.type==='queue')renderQueue(); } catch(e) {if(request!==state.sessionPlay)return;state.loading=false;state.playing=false;updatePlayback();toast('Tap Play to start audio.');} }
async function togglePlay() {
  const wasPlaying=state.playing;
  if(state.playing || state.loading){
    ++state.sessionPlay;state.position=engine.getCurrentTime();engine.pause();state.loading=false;state.playing=false;
  } else {
    const request=++state.sessionPlay;
    state.loading=true;updatePlayback();
    try {await engine.play(tracks[state.current],state.position);if(request!==state.sessionPlay)return;state.playing=engine.isPlaying;}
    catch {state.playing=false;}
    if(request!==state.sessionPlay)return;state.loading=false;
  }
  updatePlayback();if(state.playing!==wasPlaying)playerMaterial.ripple(state.playing);
}
function seek(seconds) {if(tracks[state.current].duration<=0)return;state.position=Math.max(0,Math.min(seconds,tracks[state.current].duration-.05));engine.seek(state.position);updatePosition();}
function nextTrack(direction=1) {if(direction<0&&state.position>3){seek(0);return;}let position=state.queuePosition+direction;if(state.shuffle&&direction>0&&state.queue.length>1){do{position=Math.floor(Math.random()*state.queue.length);}while(position===state.queuePosition);}position=(position+state.queue.length)%state.queue.length;const id=state.queue[position]??(state.current+direction+tracks.length)%tracks.length;playTrack(id,null,position);}
function toggleLike(id) {if(tracks[id]?.video_id){toast('Search results are not saved to your library yet.');return;}const liked=state.likes.has(id);if(liked)state.likes.delete(id);else state.likes.add(id);persist();updateSidebar();document.querySelectorAll(`[data-action="like"][data-id="${id}"]`).forEach(el=>{el.classList.toggle('liked',!liked);el.setAttribute('aria-pressed',String(!liked));el.setAttribute('aria-label',liked?'Add to Liked Songs':'Remove from Liked Songs');});updatePlayback();if(state.view==='liked')content.innerHTML=likedContent();toast(liked?'Removed from Liked Songs':'Added to Liked Songs');}
function showOverlay(html,{type,id}={}) {if(!state.overlay)state.returnFocus=document.activeElement;state.overlay={type,id};overlayRoot.innerHTML=html;document.body.classList.toggle('has-fullscreen',type==='fullscreen');document.body.style.overflow='hidden';hydrateIcons(overlayRoot);setTimeout(()=>overlayRoot.querySelector('input, .modal-close, button')?.focus(),50);}
function closeOverlay(restoreFocus=true) {if(!state.overlay)return;overlayRoot.innerHTML='';state.overlay=null;document.body.classList.remove('has-fullscreen');document.body.style.overflow='';document.querySelector('.queue-button').setAttribute('aria-expanded','false');if(restoreFocus)state.returnFocus?.focus?.();}
const closeButton = `<button class="icon-button modal-close" data-action="close-overlay" aria-label="Close">${icon('close')}</button>`;
function openAlbum(id) {const a=albums[id];showOverlay(`<div class="overlay-backdrop" data-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="album-dialog-title">${closeButton}<div class="modal-hero" style="background:linear-gradient(145deg,${a.tone}80,#f8f9f6)"><div class="modal-cover"><img src="./assets/${a.art}" alt="${esc(a.title)}" />${coverContent(a)}</div><div><span class="modal-eyebrow">${a.type.toUpperCase()}</span><h2 id="album-dialog-title">${a.title}</h2><p>${a.subtitle}<br>OpenMusic · ${a.tracks.length} tracks · ${Math.round(a.tracks.reduce((s,id)=>s+tracks[id].duration,0)/60)} min</p></div></div><div class="modal-body"><div class="modal-actions"><button class="album-play" data-action="play-album" data-id="${id}" data-playing="${state.playing && albumIsCurrent(id)}" aria-label="${state.playing && albumIsCurrent(id)?'Pause':'Play'} ${esc(a.title)}">${playbackGlyph}</button><button class="icon-button" data-action="queue-album" data-id="${id}" aria-label="Add playlist to queue">${icon('plus')}</button><small>OPENMUSIC SELECT</small></div>${a.tracks.map((id,i)=>trackRow(id,i)).join('')}<p class="modal-note">Original sounds made for OpenMusic.</p></div></section></div>`,{type:'album',id});}
function renderQueue() {const current=tracks[state.current],upNext=state.queue.slice(state.queuePosition+1);showOverlay(`<div class="overlay-backdrop queue-backdrop" data-backdrop><section class="queue-panel" role="dialog" aria-modal="true" aria-labelledby="queue-heading">${closeButton}<h2 id="queue-heading">Queue</h2><h3>Now playing</h3>${trackRow(current.id,0,{queuePosition:state.queuePosition})}<h3>Up next · ${upNext.length} tracks</h3><p class="queue-description">Your next tracks.</p>${upNext.length?upNext.map((id,i)=>trackRow(id,i,{queue:true,queuePosition:state.queuePosition+1+i})).join(''):'<p class="queue-empty">Your queue is empty.</p>'}<button class="secondary-button" data-action="reset-queue">${icon('shuffle')}Refresh queue</button></section></div>`,{type:'queue'});document.querySelector('.queue-button').setAttribute('aria-expanded','true');}
function renderFullscreen() {const t=tracks[state.current],a=albums[t.engine];showOverlay(`<section class="fullscreen-player" role="dialog" aria-modal="true" aria-label="Now playing ${esc(t.title)}"><img class="fullscreen-bg" src="${esc(t.cover || `./assets/${t.art}`)}" alt="" /><header class="fullscreen-header"><button class="icon-button" data-action="close-overlay" aria-label="Close player">${icon('down')}</button><div class="fullscreen-label">NOW PLAYING<strong>${a.title}</strong></div><button class="icon-button" data-action="queue" aria-label="Open queue">${icon('queue')}</button></header><div class="fullscreen-inner"><div class="fullscreen-cover"><img src="${esc(t.cover || `./assets/${t.art}`)}" alt="Artwork for ${esc(t.album)}" />${coverContent(a)}</div><div class="fullscreen-track"><div><h2>${t.title}</h2><p>${t.artist}</p></div><button class="icon-button ${state.likes.has(t.id)?'liked':''}" data-action="like-current" aria-label="Add to Liked Songs">${icon('heart')}</button></div><div class="fullscreen-timeline"><input id="full-progress" type="range" min="0" max="${t.duration}" value="${state.position}" step=".1" aria-label="Playback position" /><div class="fullscreen-times"><time id="full-elapsed">${formatTime(state.position)}</time><time id="full-remaining">−${formatTime(t.duration-state.position)}</time></div></div><div class="fullscreen-transport"><button class="icon-button ${state.shuffle?'active':''}" data-action="shuffle" aria-label="Shuffle">${icon('shuffle')}</button><button class="icon-button" data-action="previous" aria-label="Previous track">${icon('previous')}</button><button class="play-button" data-action="toggle-play" aria-label="${state.playing?'Pause':'Play'}">${icon(state.playing?'pause':'play')}</button><button class="icon-button" data-action="next" aria-label="Next track">${icon('next')}</button><button class="icon-button ${state.repeat?'active':''}" data-action="repeat" aria-label="Repeat track">${icon('repeat')}</button></div><div class="fullscreen-volume-row">${icon('volume')}<input id="full-volume" type="range" min="0" max="1" step="0.01" value="${state.volume}" style="--fill:${state.volume*100}%" aria-label="Volume" /></div><button class="fullscreen-queue-link" data-action="queue">${icon('queue')}Up next</button></div></section>`,{type:'fullscreen'});updatePosition();}
function smallModal(title,body,type='info') {showOverlay(`<div class="overlay-backdrop" data-backdrop><section class="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="small-title">${closeButton}<h2 id="small-title">${title}</h2>${body}</section></div>`,{type});}
function newPlaylist() {smallModal('New playlist','<p>Name your playlist. The current track will be added.</p><form id="playlist-form"><input id="playlist-name" name="name" placeholder="Playlist name" required maxlength="50" autocomplete="off" aria-label="Playlist name" /><button type="submit" class="pill-button primary">Create playlist '+icon('plus')+'</button></form>','new-playlist');setTimeout(()=>document.querySelector('#playlist-name')?.focus(),60);}
function customPlaylist(id) {const p=state.playlists[id];if(!p)return;showOverlay(`<div class="overlay-backdrop" data-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="custom-title">${closeButton}<div class="modal-hero"><div class="large-heart collection-cover" style="height:130px;width:130px;border-radius:18px;background:var(--accent)">${icon('music')}</div><div><p class="modal-eyebrow">MADE BY YOU</p><h2 id="custom-title">${esc(p.name)}</h2><p>${p.tracks.length} ${trackWord(p.tracks.length)}</p></div></div><div class="modal-body"><div class="modal-actions"><button class="pill-button" data-action="play-custom" data-id="${id}">${icon('play')}Play</button><button class="secondary-button" data-action="add-current-custom" data-id="${id}">${icon('plus')}Current track</button></div>${p.tracks.map((id,i)=>trackRow(id,i)).join('')}</div></section></div>`,{type:'custom',id});}
function trackMenu(id) {const t=tracks[id];smallModal(esc(t.title),`<p>${esc(t.artist)} · ${esc(t.album)}</p><div style="display:grid;gap:10px;margin-top:25px"><button class="secondary-button" data-action="queue-track" data-id="${id}">${icon('queue')}Play next</button><button class="secondary-button" data-action="like" data-id="${id}">${icon('heart')}${state.likes.has(id)?'Remove from Liked Songs':'Add to Liked Songs'}</button>${state.playlists.map((p,i)=>`<button class="secondary-button" data-action="add-track-custom" data-id="${i}" data-track="${id}">${icon('plus')}${esc(p.name)}</button>`).join('')}<button class="secondary-button" data-action="open-album" data-id="${t.engine}">${icon('library')}Open playlist</button></div>`,'track-menu');}
function showAllTracks(title,ids) {showOverlay(`<div class="overlay-backdrop" data-backdrop><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">${closeButton}<div style="padding:35px 30px 30px"><h2 style="font-size:28px;letter-spacing:-1px;margin:8px 0 25px">${title}</h2>${ids.map((id,i)=>trackRow(id,i)).join('')}</div></section></div>`,{type:'tracks'});}
function addToCustom(index,id) {if(tracks[id]?.video_id){toast('Search results are not saved to your library yet.');return;}const p=state.playlists[index];if(p.tracks.includes(id)){toast('Already in this playlist');return;}p.tracks.push(id);persist();updateSidebar();toast(`Added to “${p.name}”`);if(state.overlay?.type==='custom')customPlaylist(index);}
const actions={
  navigate: el=>navigate(el.dataset.view),
  tab:el=>{state.tab=el.dataset.tab;content.innerHTML=homeContent();},
  'hero-next':()=>{state.hero=(state.hero+1)%heroSlides.length;document.querySelector('.hero').outerHTML=heroMarkup();},
  'hero-prev':()=>{state.hero=(state.hero+heroSlides.length-1)%heroSlides.length;document.querySelector('.hero').outerHTML=heroMarkup();},
  'open-album':el=>openAlbum(Number(el.dataset.id)),
  'play-album':el=>{const a=albums[Number(el.dataset.id)];if(albumIsCurrent(Number(el.dataset.id)))togglePlay();else playTrack(a.tracks[0],a.tracks);},
  'play-track':el=>{const id=Number(el.dataset.id);const row=el.closest('[data-queue-position]');if(row){playTrack(id,null,Number(row.dataset.queuePosition));return;}let queue=null;if(state.overlay?.type==='album')queue=albums[state.overlay.id].tracks;else if(state.overlay?.type==='custom')queue=state.playlists[state.overlay.id].tracks;else if(!state.overlay&&state.view==='liked')queue=[...state.likes];else if(!state.overlay&&state.view==='search'&&shownSearch)queue=searchCache.get(queryKey(shownSearch.query))?.get(shownSearch.page)?.ids;playTrack(id,queue);},
  'toggle-play':togglePlay,
  next:()=>nextTrack(),previous:()=>nextTrack(-1),
  shuffle:()=>{state.shuffle=!state.shuffle;updatePlayback();},
  repeat:()=>{state.repeat=!state.repeat;updatePlayback();},
  like:el=>toggleLike(Number(el.dataset.id)),
  'like-current':()=>toggleLike(state.current),
  mute:()=>{if(state.volume>0){state.previousVolume=state.volume;state.volume=0;}else state.volume=state.previousVolume||.65;setVolume(state.volume);},
  queue:()=>state.overlay?.type==='queue'?closeOverlay():renderQueue(),
  'close-overlay':()=>closeOverlay(),
  'all-albums':()=>navigate('library'),
  'start-wave':()=>{state.shuffle=true;const ids=[...Array(12).keys()].sort(()=>Math.random()-.5);playTrack(ids[0],ids);toast('Mix started');},
  'show-repeat':()=>showAllTracks('On repeat',[0,1,4,6,7,10]),
  'show-discover':()=>showAllTracks('Discover more',[3,2,5,9,8,11]),
  'search-page':el=>resolveSearch(Number(el.dataset.page),true),
  'clear-search':()=>{cancelSearch();shownSearch=null;const input=document.querySelector('#search-input');input.value='';search('');updateSearchButton();input.focus();},
  'play-liked':()=>{const ids=[...state.likes];if(ids.length)playTrack(ids[0],ids);},
  'remove-queue':el=>{const id=Number(el.dataset.id);const rowPosition=Number(el.closest('[data-queue-position]')?.dataset.queuePosition);const index=Number.isInteger(rowPosition)&&rowPosition>state.queuePosition&&state.queue[rowPosition]===id?rowPosition:state.queue.indexOf(id,state.queuePosition+1);if(index>=0)state.queue.splice(index,1);renderQueue();},
  'reset-queue':()=>{state.queue=[state.current,...tracks.filter(t=>t.id!==state.current).map(t=>t.id).sort(()=>Math.random()-.5)];state.queuePosition=0;renderQueue();toast('Queue refreshed');},
  'queue-track':el=>{const id=Number(el.dataset.id);state.queue=state.queue.filter((t,i)=>t!==id||i<=state.queuePosition);state.queue.splice(state.queuePosition+1,0,id);toast('Up next');closeOverlay();},
  'queue-album':el=>{const ids=albums[Number(el.dataset.id)].tracks;const additions=ids.filter(id=>!state.queue.slice(state.queuePosition).includes(id));state.queue.push(...additions);toast(additions.length?'Added to queue':'Already in queue');},
  'track-menu':el=>trackMenu(Number(el.dataset.id)),
  'new-playlist':newPlaylist,
  'custom-playlist':el=>customPlaylist(Number(el.dataset.id)),
  'play-custom':el=>{const ids=state.playlists[Number(el.dataset.id)].tracks;if(ids.length)playTrack(ids[0],ids);},
  'add-current-custom':el=>addToCustom(Number(el.dataset.id),state.current),
  'add-track-custom':el=>addToCustom(Number(el.dataset.id),Number(el.dataset.track)),
  profile:()=>smallModal('Hi, Alex.',`<p>A space for the music you love.</p><div class="profile-stats"><div><strong>${state.likes.size}</strong><span>liked tracks</span></div><div><strong>${state.playlists.length}</strong><span>playlists</span></div></div><button class="pill-button primary" data-action="navigate" data-view="library">Open library ${icon('arrow')}</button>`),
  notifications:()=>smallModal('What’s new',`<div class="notice-item"><strong>Discover something new.</strong><p>Explore six original sounds.</p><small>OPENMUSIC</small></div><button class="pill-button primary" data-action="navigate" data-view="library">Listen ${icon('arrow')}</button>`),
  about:()=>smallModal('More music. Less noise.',`<p>OpenMusic is an interactive music player concept. Listen, search, save favorites, and make playlists.</p><p style="margin-top:15px">Tracks and artists are fictional. Six original demo arrangements are synthesized in your browser. Your library is saved on this device.</p><p style="margin-top:15px">Photography: Unsplash. Featured artwork created with AI.</p>`)
};
function setVolume(value) {state.volume=value;engine.setVolume(value);for(const input of document.querySelectorAll('#volume,#full-volume')){input.value=value;input.style.setProperty('--fill',`${value*100}%`);}const button=document.querySelector('.volume-button');button.innerHTML=icon(value===0?'muted':'volume');button.setAttribute('aria-label',value===0?'Unmute':'Mute');}
document.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el){const action=actions[el.dataset.action];if(action)action(el);}else if(event.target.hasAttribute('data-backdrop'))closeOverlay();});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='search-input'){cancelSearch();const result=document.querySelector('#search-results');result?.removeAttribute('aria-busy');const cached=searchCache.get(queryKey(el.value))?.get(1);if(cached)renderSearchPage(el.value.trim(),1,cached);else {shownSearch=null;result.textContent=el.value.trim()?'Press Search to find tracks.':'';}updateSearchButton();}if(el.id==='progress'||el.id==='full-progress')seek(Number(el.value));if(el.id==='volume'||el.id==='full-volume')setVolume(Number(el.value));});
document.addEventListener('submit',event=>{if(event.target.id==='resolve-form'){event.preventDefault();resolveSearch();return;}if(event.target.id!=='playlist-form')return;event.preventDefault();const input=document.querySelector('#playlist-name');const name=input.value.trim();if(!name){input.focus();return;}state.playlists.push({name,tracks:tracks[state.current].video_id?[]:[state.current]});persist();updateSidebar();if(state.view==='library')content.innerHTML=libraryContent();customPlaylist(state.playlists.length-1);toast(`“${name}” created`);});
document.addEventListener('keydown',event=>{const editable=['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName);if(event.key==='Escape'){if(state.overlay)closeOverlay();else if(state.view==='search')navigate('home');}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();navigate('search');}if(event.code==='Space'&&!editable&&!['BUTTON','A'].includes(event.target.tagName)){event.preventDefault();togglePlay();}if(event.altKey&&!editable&&event.key==='ArrowRight'){event.preventDefault();nextTrack();}if(event.altKey&&!editable&&event.key==='ArrowLeft'){event.preventDefault();nextTrack(-1);}if(event.key==='Tab'&&state.overlay){const els=[...overlayRoot.querySelectorAll('button,input,a,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);if(!els.length)return;const first=els[0],last=els[els.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
setInterval(()=>{if(!state.playing)return;state.position=engine.getCurrentTime();if(!tracks[state.current].video_id && state.position>=tracks[state.current].duration){if(state.repeat){seek(0);}else nextTrack();}updatePosition();},250);
window.addEventListener('pagehide',()=>{++state.sessionPlay;state.loading=false;if(state.playing)state.position=engine.getCurrentTime();engine.pause();state.playing=false;updatePlayback();});
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
  const row=image.closest('.track-row');
  const track=row ? tracks[Number(row.dataset.track)] : image.id==='player-art' ? tracks[state.current] : null;
  if (!track?.video_id) return;
  const fallback=`https://i.ytimg.com/vi/${encodeURIComponent(track.video_id)}/mqdefault.jpg`;
  if (image.src===fallback) return;
  track.cover=fallback;
  document.querySelectorAll(`.track-row[data-track="${track.id}"] img`).forEach(img=>{if(img.src!==fallback)img.src=fallback;});
  if(state.current===track.id)document.querySelector('#player-art').src=fallback;
}, true);
