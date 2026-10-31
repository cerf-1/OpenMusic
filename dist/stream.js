import { DemoAudioEngine } from './audio.js?v=2';
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
    this.audio.preload = 'metadata';
    this.audio.volume = .65;
    this.track = null;
    this.pending = new Map();
    this.generation = 0;
    this.refreshed = false;
    this.desiredPlaying = false;
    this.onError = onError;
    this.audio.addEventListener('playing', () => {
      if (this.track?.video_id && this.audio.src === this.track.stream_url && !this.audio.paused) {
        this.desiredPlaying = true;
        onPlaying();
      }
    });
    this.audio.addEventListener('pause', () => {
      // Ignore queued events from a previous source or an intentional engine pause.
      if (this.track?.video_id && this.audio.src === this.track.stream_url && this.audio.paused && this.desiredPlaying && !this.audio.ended) {
        this.desiredPlaying = false;
        onPaused();
      }
    });
    this.audio.addEventListener('ended', () => { if (this.track?.video_id) onEnded(); });
    this.audio.addEventListener('error', () => this.refresh());
  }
  get isPlaying() { return this.track?.video_id ? !this.audio.paused && !this.audio.ended : this.demo.isPlaying; }
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
    track.stream_url=data.stream_url;
    if(data.duration_seconds>0)track.duration=data.duration_seconds;
    if(data.cover_link)track.cover=data.cover_link;
    if(data.artist)track.artist=data.artist;
    return track;
  }
  pause() { this.desiredPlaying = false; this.demo.pause(); this.audio.pause(); }
  seek(seconds) { if (this.track?.video_id) { try { this.audio.currentTime = seconds; } catch {} } else this.demo.seek(seconds); }
  setVolume(value) { this.demo.setVolume(value); this.audio.volume = value; }
  getCurrentTime() { return this.track?.video_id ? this.audio.currentTime || 0 : this.demo.getCurrentTime(); }
  async refresh() {
    if (!this.track?.video_id) return;
    if (this.refreshed) { this.desiredPlaying = false; this.onError('Audio could not be loaded. Please search again.'); return; }
    this.refreshed = true;
    const track = this.track, generation = this.generation, position = this.getCurrentTime();
    try {
      const result = await resolveTrack({video_id:track.video_id});
      if (generation !== this.generation || this.track !== track) return;
      track.stream_url = result.stream_url;
      this.audio.src = result.stream_url;
      this.audio.addEventListener('loadedmetadata', async () => {
        if (generation !== this.generation || this.track !== track) return;
        try { this.audio.currentTime = Math.min(position, this.audio.duration || position); } catch {}
        if (this.desiredPlaying) { try { await this.audio.play(); } catch { this.onError('Tap Play to resume audio.'); } }
      }, {once:true});
      this.audio.load();
    } catch { if (generation === this.generation) { this.desiredPlaying = false; this.onError('Could not refresh audio. Please search again.'); } }
  }
}
