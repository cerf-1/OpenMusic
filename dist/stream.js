import { DemoAudioEngine } from './audio.js?v=3';
import { API_BASE } from './config.js';

export async function resolveTrack(body, signal) {
  const response = await fetch(`${API_BASE}/api/v1/resolve`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Could not find this track.');
  return data;
}

export async function searchTracks(body, signal) {
  const response = await fetch(`${API_BASE}/api/v1/search`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Search failed. Try again.');
  return data;
}

export class AudioEngine {
  constructor(onEnded, onError, onPlaying = () => {}, onPaused = () => {}) {
    this.demo = new DemoAudioEngine();
    this.audio = new Audio();
    this._streamContext = null;
    this._streamAnalyser = null;
    this._directAudio = this.audio;
    this._analysisAudio = null;
    this.audio.preload = 'metadata';
    this.audio.volume = .65;
    this.track = null;
    this.pending = new Map();
    this.generation = 0;
    this.refreshed = false;
    this.desiredPlaying = false;
    this.onError = onError;
    this._bindAudio = audio => {
    audio.addEventListener('playing', () => {
      if (audio === this.audio && this.track?.video_id && this.audio.src === this.track.stream_url && !this.audio.paused) {
        this.desiredPlaying = true;
        onPlaying();
      }
    });
    audio.addEventListener('pause', () => {
      // Ignore queued events from a previous source or an intentional engine pause.
      if (audio === this.audio && this.track?.video_id && this.audio.src === this.track.stream_url && this.audio.paused && this.desiredPlaying && !this.audio.ended) {
        this.desiredPlaying = false;
        onPaused();
      }
    });
    audio.addEventListener('ended', () => { if (audio === this.audio && this.track?.video_id) onEnded(); });
    audio.addEventListener('error', () => {if(audio === this.audio)this.refresh();});
    };
    this._bindAudio(this.audio);
  }
  get isPlaying() { return this.track?.video_id ? !this.audio.paused && !this.audio.ended : this.demo.isPlaying; }
  getAnalyser() { return this.track?.video_id ? (this.track.audio_path && this.audio===this._analysisAudio ? this._streamAnalyser : null) : this.demo._analyser || null; }
  _initializeStreamAnalysis(track) {
    const Context=globalThis.AudioContext || globalThis.webkitAudioContext;
    if(!Context || !track.audio_path){
      if(this.audio!==this._directAudio){this.audio.pause();this.audio=this._directAudio;}
      return;
    }
    if(!this._streamContext){
      const context=new Context({latencyHint:'interactive'});
      const analyser=context.createAnalyser();
      analyser.fftSize=1024;analyser.smoothingTimeConstant=.65;
      // CORS is set before src. A media element has exactly one source node.
      this._analysisAudio=new Audio();
      this._analysisAudio.preload='metadata';
      this._analysisAudio.volume=this._directAudio.volume;
      this._analysisAudio.crossOrigin='anonymous';
      this._bindAudio(this._analysisAudio);
      this.audio.pause();this.audio=this._analysisAudio;
      this._streamSource=context.createMediaElementSource(this.audio);
      this._streamSource.connect(analyser);analyser.connect(context.destination);
      this._streamContext=context;this._streamAnalyser=analyser;
    }
    if(this.audio!==this._analysisAudio){this.audio.pause();this.audio=this._analysisAudio;}
    if(this._streamContext.state==='suspended')this._streamContext.resume().catch(()=>{});
  }
  async play(track, position) {
    ++this.generation;
    if (this.track !== track) {
      this.desiredPlaying = false;
      this.demo.pause(); this.audio.pause();
      this.track = track; this.refreshed = false;
    }
    if (!track.video_id) { this.desiredPlaying = true; return this.demo.play(track.engine, position); }
    this.desiredPlaying = true;
    const generation=this.generation;
    await this.prepare(track);
    if(generation!==this.generation || this.track!==track)return;
    if(!this.desiredPlaying)return;
    this._initializeStreamAnalysis(track);
    if(this.audio.src!==track.stream_url)this.audio.src=track.stream_url;
    if (Number.isFinite(position) && Math.abs(this.audio.currentTime-position) > 1) {
      try { this.audio.currentTime = position; } catch {}
    }
    return this.audio.play();
  }
  async prepare(track) {
    if (!track.video_id || track.stream_url) return track;
    let pending=this.pending.get(track.video_id);
    if (!pending) {
      pending=resolveTrack({video_id:track.video_id});
      this.pending.set(track.video_id,pending);
      pending.finally(()=>{if(this.pending.get(track.video_id)===pending)this.pending.delete(track.video_id);}).catch(()=>{});
    }
    const data=await pending;
    track.audio_path=typeof data.audio_path==='string' && /^\/api\/v1\/audio\/[A-Za-z0-9_-]+$/.test(data.audio_path) ? data.audio_path : null;
    track.stream_url=track.audio_path ? `${API_BASE}${track.audio_path}` : data.stream_url;
    if(data.duration_seconds>0)track.duration=data.duration_seconds;
    if(data.cover_link)track.cover=data.cover_link;
    if(data.artist)track.artist=data.artist;
    return track;
  }
  pause() { this.desiredPlaying = false; this.demo.pause(); this.audio.pause(); }
  seek(seconds) { if (this.track?.video_id) { try { this.audio.currentTime = seconds; } catch {} } else this.demo.seek(seconds); }
  setVolume(value) { this.demo.setVolume(value); this._directAudio.volume = value;if(this._analysisAudio)this._analysisAudio.volume=value; }
  getCurrentTime() { return this.track?.video_id ? this.audio.currentTime || 0 : this.demo.getCurrentTime(); }
  async refresh() {
    if (!this.track?.video_id) return;
    if (this.refreshed) { this.desiredPlaying = false; this.onError('Audio could not be loaded. Please search again.'); return; }
    this.refreshed = true;
    const track = this.track, generation = this.generation, position = this.getCurrentTime();
    try {
      const result = await resolveTrack({video_id:track.video_id});
      if (generation !== this.generation || this.track !== track) return;
      track.audio_path=typeof result.audio_path==='string' && /^\/api\/v1\/audio\/[A-Za-z0-9_-]+$/.test(result.audio_path) ? result.audio_path : null;
      track.stream_url = track.audio_path ? `${API_BASE}${track.audio_path}` : result.stream_url;
      this._initializeStreamAnalysis(track);
      this.audio.src = track.stream_url;
      this.audio.addEventListener('loadedmetadata', async () => {
        if (generation !== this.generation || this.track !== track) return;
        try { this.audio.currentTime = Math.min(position, this.audio.duration || position); } catch {}
        if (this.desiredPlaying) { try { await this.audio.play(); } catch { this.onError('Tap Play to resume audio.'); } }
      }, {once:true});
      this.audio.load();
    } catch { if (generation === this.generation) { this.desiredPlaying = false; this.onError('Could not refresh audio. Please search again.'); } }
  }
}
