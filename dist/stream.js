import { DemoAudioEngine } from './audio.js';
import { API_BASE } from './config.js';

export async function resolveTrack(body, signal) {
  const response = await fetch(`${API_BASE}/api/v1/resolve`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Could not find this track.');
  return data;
}

export class AudioEngine {
  constructor(onEnded, onError, onPlaying = () => {}) {
    this.demo = new DemoAudioEngine();
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = .65;
    this.track = null;
    this.generation = 0;
    this.refreshed = false;
    this.desiredPlaying = false;
    this.onError = onError;
    this.audio.addEventListener('playing', () => { if (this.track?.video_id) onPlaying(); });
    this.audio.addEventListener('ended', () => { if (this.track?.video_id) onEnded(); });
    this.audio.addEventListener('error', () => this.refresh());
  }
  async play(track, position) {
    this.desiredPlaying = true;
    if (this.track !== track) {
      ++this.generation;
      this.demo.pause(); this.audio.pause();
      this.track = track; this.refreshed = false;
      if (track.video_id) this.audio.src = track.stream_url;
    }
    if (!track.video_id) return this.demo.play(track.engine, position);
    if (Number.isFinite(position) && Math.abs(this.audio.currentTime-position) > 1) {
      try { this.audio.currentTime = position; } catch {}
    }
    return this.audio.play();
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
