/**
 * Original, locally synthesized demo music. Nothing is downloaded or autoplayed.
 *
 * import { DemoAudioEngine } from './audio.js';
 * const audio = new DemoAudioEngine();
 * await audio.play(trackIndex, offsetSeconds); // 6 arrangements; indices wrap
 * audio.pause(); audio.seek(seconds); audio.setVolume(0.7);
 * audio.getCurrentTime(); audio.isPlaying; audio.destroy();
 *
 * play() and seek() return promises and reject if browser audio is unavailable.
 * Track time is unbounded: the caller owns the displayed duration/end behavior.
 */

const ARRANGEMENTS = [
  { bpm: 94, root: 45, chords: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]], melody: [0, null, 2, null, 3, null, 2, 1, null, 2, null, 4, 3, null, 1, null], tone: 1850, air: .22, groove: 0 },
  { bpm: 108, root: 48, chords: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], melody: [2, null, 1, 0, null, 2, null, 3, 2, null, 4, null, 3, 2, null, 1], tone: 2400, air: .17, groove: 1 },
  { bpm: 78, root: 46, chords: [[0, 3, 7, 10], [8, 12, 15, 19], [3, 7, 10, 14], [5, 8, 12, 15]], melody: [0, null, null, 2, null, null, 1, null, 3, null, null, 2, null, 1, null, null], tone: 1350, air: .31, groove: 2 },
  { bpm: 116, root: 43, chords: [[0, 3, 7, 10], [3, 7, 10, 14], [8, 12, 15, 19], [5, 8, 12, 15]], melody: [0, null, 2, 1, 3, null, 2, null, 4, 3, null, 2, 1, null, 2, null], tone: 2150, air: .16, groove: 3 },
  { bpm: 86, root: 50, chords: [[0, 4, 7, 11], [7, 11, 14, 18], [9, 12, 16, 19], [5, 9, 12, 16]], melody: [2, null, null, 1, 0, null, 2, null, 3, null, 4, null, 2, null, 1, null], tone: 1650, air: .27, groove: 4 },
  { bpm: 102, root: 47, chords: [[0, 3, 7, 10], [5, 8, 12, 15], [8, 12, 15, 19], [3, 7, 10, 14]], melody: [0, 2, null, 3, null, 2, 1, null, 2, null, 4, 3, null, 1, null, 2], tone: 2000, air: .23, groove: 5 },
];

const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
const clamp = (number, low, high) => Math.min(high, Math.max(low, number));
const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export class DemoAudioEngine {
  constructor() {
    this.context = null;
    this._volume = .65;
    this._track = 0;
    this._position = 0;
    this._playing = false;
    this._token = 0;
    this._timer = null;
    this._session = null;
    this._origin = 0;
    this._nextStep = 0;
  }

  get isPlaying() { return this._playing; }

  async _initialize() {
    if (this.context && this.context.state !== 'closed') return;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Audio playback is not supported by this browser.');
    this.context = new AudioContextClass({ latencyHint: 'interactive' });
    const context = this.context;
    this._master = context.createGain();
    this._master.gain.value = this._volume * .85;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -17;
    compressor.knee.value = 22;
    compressor.ratio.value = 2.4;
    compressor.attack.value = .012;
    compressor.release.value = .24;
    compressor.connect(this._master);
    this._master.connect(context.destination);
    this._compressor = compressor;

    // A deterministic noise buffer doubles as percussion material and reverb.
    let seed = 1731;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
    this._noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noise = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = random();
    this._impulse = context.createBuffer(2, Math.floor(context.sampleRate * 2.6), context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = this._impulse.getChannelData(channel);
      let softened = 0;
      for (let i = 0; i < data.length; i++) {
        softened = softened * .45 + random() * .55;
        data[i] = softened * Math.pow(1 - i / data.length, 3.1);
      }
    }
  }

  _createSession(config) {
    const context = this.context;
    const input = context.createGain();
    const output = context.createGain();
    output.gain.setValueAtTime(0, context.currentTime);
    output.gain.linearRampToValueAtTime(.8, context.currentTime + .07);
    output.connect(this._compressor);
    input.connect(output);

    const reverbSend = context.createGain();
    reverbSend.gain.value = config.air;
    const reverb = context.createConvolver();
    reverb.buffer = this._impulse;
    input.connect(reverbSend);
    reverbSend.connect(reverb);
    reverb.connect(output);

    const delaySend = context.createGain();
    delaySend.gain.value = .12;
    const delay = context.createDelay(2);
    delay.delayTime.value = 60 / config.bpm * .75;
    const feedback = context.createGain();
    feedback.gain.value = .25;
    const delayFilter = context.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2300;
    input.connect(delaySend);
    delaySend.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(feedback);
    feedback.connect(delay);
    delayFilter.connect(output);
    return { input, output, sources: new Set(), nodes: [input, output, reverbSend, reverb, delaySend, delay, feedback, delayFilter] };
  }

  async play(trackIndex = this._track, offsetSeconds = 0) {
    const token = ++this._token;
    this._stopSession();
    this._playing = false;
    this._position = nonnegative(offsetSeconds);
    this._track = ((Math.floor(Number(trackIndex) || 0) % ARRANGEMENTS.length) + ARRANGEMENTS.length) % ARRANGEMENTS.length;
    await this._initialize();
    if (token !== this._token) return;
    const context = this.context;
    if (context.state !== 'running') {
      try { await context.resume(); }
      catch (error) { if (token === this._token) throw error; else return; }
    }
    if (token !== this._token) return;
    if (this.context.state !== 'running') throw new Error('Tap play to enable audio playback.');

    const config = ARRANGEMENTS[this._track];
    this._session = this._createSession(config);
    this._origin = this.context.currentTime + .035 - this._position;
    const stepDuration = 60 / config.bpm / 4;
    this._nextStep = Math.ceil(this._position / stepDuration);
    this._playing = true;
    // Restore the chord when seeking into the middle of a measure.
    if (this._nextStep % 16 !== 0) {
      const bar = Math.floor(this._position / (stepDuration * 16));
      this._pad(bar, this.context.currentTime + .035, Math.max(.25, stepDuration * 16 - this._position % (stepDuration * 16)));
    }
    this._schedule();
    this._timer = setInterval(() => this._schedule(), 35);
  }

  pause() {
    ++this._token;
    this._position = this.getCurrentTime();
    this._playing = false;
    this._stopSession();
  }

  async seek(seconds) {
    const target = nonnegative(seconds);
    if (this._playing) return this.play(this._track, target);
    this._position = target;
  }

  setVolume(volume) {
    this._volume = Number.isFinite(Number(volume)) ? clamp(Number(volume), 0, 1) : this._volume;
    if (this._master && this.context?.state !== 'closed') {
      this._master.gain.setTargetAtTime(this._volume * .85, this.context.currentTime, .025);
    }
  }

  getCurrentTime() {
    return this._playing && this.context ? Math.max(this._position, this.context.currentTime - this._origin) : this._position;
  }

  _stopSession() {
    clearInterval(this._timer);
    this._timer = null;
    const session = this._session;
    this._session = null;
    if (!session || !this.context || this.context.state === 'closed') return;
    const now = this.context.currentTime;
    session.output.gain.cancelScheduledValues(now);
    session.output.gain.setTargetAtTime(0, now, .012);
    for (const source of session.sources) {
      try { source.stop(now + .055); } catch { /* A completed source is already silent. */ }
    }
    setTimeout(() => {
      for (const node of session.nodes) { try { node.disconnect(); } catch {} }
      session.sources.clear();
    }, 100);
  }

  _schedule() {
    if (!this._playing || !this._session) return;
    const config = ARRANGEMENTS[this._track];
    const stepDuration = 60 / config.bpm / 4;
    const now = this.context.currentTime;
    // Background tabs may throttle JS. Skip missed beats without a burst.
    if (this._origin + this._nextStep * stepDuration < now - .08) {
      this._nextStep = Math.ceil((now - this._origin) / stepDuration);
    }
    while (this._origin + this._nextStep * stepDuration < now + .24) {
      const when = this._origin + this._nextStep * stepDuration;
      if (when >= now - .015) this._step(this._nextStep, Math.max(now, when), config);
      this._nextStep++;
    }
  }

  _step(step, when, config) {
    const beat = 60 / config.bpm;
    const bar = Math.floor(step / 16);
    const tick = step % 16;
    const chord = config.chords[bar % config.chords.length];
    const root = config.root + chord[0];
    const swing = tick % 2 ? beat * .025 : 0;
    when += swing;

    if (tick === 0) this._pad(bar, when, beat * 4.4);
    if (tick === 0 || tick === 8 || (config.groove % 2 === 1 && tick === 14)) {
      this._tone(root - 12 + (tick === 14 ? 7 : 0), when, beat * (tick === 14 ? .45 : 1.4), .12, 'sine', 450, .015, 0);
    }

    const melodyIndex = config.melody[(tick + (bar % 4 === 3 ? 4 : 0)) % 16];
    if (melodyIndex !== null) {
      const note = config.root + chord[melodyIndex % chord.length] + 12 + (melodyIndex >= 4 ? 12 : 0);
      const velocity = .044 + ((step * 17) % 5) * .004;
      this._tone(note, when, beat * .85, velocity, 'triangle', config.tone * 1.6, .008, Math.sin(step * 1.3) * .35, true);
      this._tone(note + 12, when, beat * .62, velocity * .19, 'sine', 4500, .006, -.2, true);
    }

    // A restrained electronic rhythm leaves the melody in front.
    if (tick === 0 || tick === 8 || (config.groove === 3 && tick % 4 === 0) || (tick === 11 && config.groove === 1)) {
      this._kick(when, tick === 0 ? .27 : .21);
    }
    if (tick === 4 || tick === 12) {
      this._noise(when, .15, .062, 1700, 'bandpass', -.08);
      this._tone(52, when, .11, .045, 'sine', 400, .001, 0);
    }
    if (tick % 2 === 0 && !(config.groove === 2 && tick % 4 === 0)) {
      this._noise(when, tick === 14 ? .11 : .035, tick % 4 === 0 ? .022 : .035, 6800, 'highpass', tick % 4 ? .32 : -.3);
    }
    if (config.groove % 2 === 1 && tick === 15 && bar % 2 === 1) this._noise(when, .025, .016, 7200, 'highpass', .4);
  }

  _pad(bar, when, duration) {
    const config = ARRANGEMENTS[this._track];
    const chord = config.chords[bar % config.chords.length];
    chord.forEach((interval, index) => {
      const note = config.root + interval + (index === 0 ? 12 : 0);
      const pan = (index - 1.5) * .32;
      this._tone(note, when, duration, .030, 'triangle', config.tone, .38, pan, false, -4);
      this._tone(note, when, duration, .023, 'sine', config.tone, .5, -pan, false, 4);
    });
  }

  _tone(midi, when, duration, volume, shape, cutoff, attack, pan, pluck = false, detune = 0) {
    const context = this.context;
    const session = this._session;
    if (!session) return;
    const oscillator = context.createOscillator();
    oscillator.type = shape;
    oscillator.frequency.value = frequency(midi);
    oscillator.detune.value = detune;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = .5;
    filter.frequency.setValueAtTime(cutoff, when);
    if (pluck) filter.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * .23), when + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, when);
    envelope.gain.exponentialRampToValueAtTime(volume, when + Math.min(attack, duration * .3));
    if (pluck) {
      envelope.gain.exponentialRampToValueAtTime(.0001, when + duration + .13);
    } else {
      envelope.gain.setValueAtTime(volume * .82, when + Math.max(attack, duration * .6));
      envelope.gain.exponentialRampToValueAtTime(.0001, when + duration + .35);
    }
    const panner = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
    if (panner.pan) panner.pan.value = pan;
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(session.input);
    this._register(oscillator, session, [filter, envelope, panner]);
    oscillator.start(when);
    oscillator.stop(when + duration + .4);
  }

  _kick(when, volume) {
    const context = this.context;
    const session = this._session;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(115, when);
    oscillator.frequency.exponentialRampToValueAtTime(43, when + .11);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, when);
    envelope.gain.exponentialRampToValueAtTime(volume, when + .003);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + .36);
    oscillator.connect(envelope);
    envelope.connect(session.input);
    this._register(oscillator, session, [envelope]);
    oscillator.start(when);
    oscillator.stop(when + .4);
  }

  _noise(when, duration, volume, cutoff, type, pan) {
    const context = this.context;
    const session = this._session;
    const source = context.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = type === 'bandpass' ? .7 : .4;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, when);
    envelope.gain.exponentialRampToValueAtTime(volume, when + .002);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    const panner = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
    if (panner.pan) panner.pan.value = pan;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(session.input);
    this._register(source, session, [filter, envelope, panner]);
    source.start(when, (Math.abs(when * .713) % 1));
    source.stop(when + duration + .03);
  }

  _register(source, session, nodes) {
    session.sources.add(source);
    source.onended = () => {
      session.sources.delete(source);
      source.disconnect();
      nodes.forEach(node => node.disconnect());
    };
  }

  destroy() {
    this.pause();
    const context = this.context;
    this.context = null;
    this._master = null;
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }
}
