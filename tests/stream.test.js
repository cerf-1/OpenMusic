import { strict as assert } from 'node:assert';
import { test } from 'node:test';

class FakeAudio extends EventTarget {
  constructor() { super(); this.currentTime=0; this.duration=300; this.volume=1; this.plays=0; this.paused=true; this.ended=false; }
  play() { this.plays++; this.paused=false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused=true; this.dispatchEvent(new Event('pause')); }
  load() {}
}
globalThis.Audio = FakeAudio;
const {AudioEngine} = await import('../dist/stream.js');

test('refreshes once by video id and restores position', async () => {
  let requests=0, message='';
  globalThis.fetch=async (url, options) => {
    requests++;
    assert.deepEqual(JSON.parse(options.body), {video_id:'VALID_ID_11'});
    return {ok:true,json:async()=>({stream_url:'https://fresh.example/audio'})};
  };
  const engine=new AudioEngine(()=>{}, text=>{message=text;});
  const track={video_id:'VALID_ID_11',stream_url:'https://old.example/audio'};
  await engine.play(track,0);
  engine.audio.currentTime=42;
  engine.audio.dispatchEvent(new Event('error'));
  await new Promise(resolve=>setImmediate(resolve));
  engine.audio.currentTime=0;
  engine.audio.dispatchEvent(new Event('loadedmetadata'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(engine.audio.currentTime,42);
  assert.equal(engine.audio.src,'https://fresh.example/audio');
  assert.equal(engine.audio.plays,2);
  engine.audio.dispatchEvent(new Event('error'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1);
  assert.match(message,/could not be loaded/i);
});

test('an obsolete refresh does not replace the new track', async () => {
  let finish;
  globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
  const engine=new AudioEngine(()=>{},()=>{});
  await engine.play({video_id:'VALID_ID_11',stream_url:'old'},0);
  engine.audio.dispatchEvent(new Event('error'));
  await engine.play({video_id:'OTHER_ID_11',stream_url:'new'},0);
  finish({ok:true,json:async()=>({stream_url:'stale'})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(engine.audio.src,'new');
});

test('search metadata resolves audio only when a track is played', async () => {
  const calls=[];
  globalThis.fetch=async (url, options)=>{
    calls.push(JSON.parse(options.body));
    return {ok:true,json:async()=>({stream_url:'https://fresh.example/audio',duration_seconds:200,cover_link:'cover'})};
  };
  const engine=new AudioEngine(()=>{},()=>{});
  const track={video_id:'VALID_ID_11'};
  assert.equal(calls.length,0);
  await engine.play(track,0);
  assert.deepEqual(calls,[{video_id:'VALID_ID_11'}]);
  assert.equal(engine.audio.src,'https://fresh.example/audio');
  assert.equal(track.duration,200);
});

test('a pending first resolve cannot start audio after pause or track change', async () => {
  let finish;
  globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
  const engine=new AudioEngine(()=>{},()=>{});
  const pending=engine.play({video_id:'VALID_ID_11'},0);
  engine.pause();
  finish({ok:true,json:async()=>({stream_url:'stale'})});
  await pending;
  assert.equal(engine.audio.plays,0);
  const other=engine.play({video_id:'OTHER_ID_11'},0);
  await engine.play({video_id:'THIRD_ID_11',stream_url:'new'},0);
  finish({ok:true,json:async()=>({stream_url:'stale'})});
  await other;
  assert.equal(engine.audio.src,'new');
  assert.equal(engine.audio.plays,1);
});

test('warming the first result shares its request with Play and never starts audio', async () => {
  let finish, requests=0;
  globalThis.fetch=()=>{requests++;return new Promise(resolve=>finish=resolve);};
  const engine=new AudioEngine(()=>{},()=>{});
  const track={video_id:'VALID_ID_11',cover:'existing-cover'};
  const warm=engine.prepare(track);
  assert.equal(engine.audio.plays,0);
  const play=engine.play(track,0);
  assert.equal(requests,1);
  finish({ok:true,json:async()=>({stream_url:'https://fresh.example/audio',duration_seconds:200,artist:'Artist'})});
  await Promise.all([warm,play]);
  assert.equal(engine.audio.plays,1);
  assert.equal(track.cover,'existing-cover');
  assert.equal(track.artist,'Artist');
});

test('a failed warmup is released so Play can retry', async () => {
  let requests=0;
  globalThis.fetch=async()=>{requests++;if(requests===1)throw new Error('offline');return {ok:true,json:async()=>({stream_url:'https://fresh.example/audio'})};};
  const engine=new AudioEngine(()=>{},()=>{});
  const track={video_id:'VALID_ID_11'};
  await assert.rejects(engine.prepare(track));
  await engine.play(track,0);
  assert.equal(requests,2);
  assert.equal(engine.audio.plays,1);
});


test('external pause and resume synchronize actual playback', async () => {
  let playing=0, paused=0;
  const engine=new AudioEngine(()=>{},()=>{},()=>playing++,()=>paused++);
  await engine.play({video_id:'VALID_ID_11',stream_url:'audio'},0);
  assert.equal(engine.isPlaying,true);
  engine.audio.pause(); // Headset/OS pause, outside engine.pause().
  assert.equal(engine.desiredPlaying,false);
  assert.equal(engine.isPlaying,false);
  assert.equal(paused,1);
  await engine.audio.play();
  assert.equal(engine.desiredPlaying,true);
  assert.equal(playing,2);
  engine.pause();
  assert.equal(paused,1); // Intentional pause is already handled by the caller.
});

test('queued pause from the previous track cannot stop the new source', async () => {
  let paused=0;
  const engine=new AudioEngine(()=>{},()=>{},()=>{},()=>paused++);
  await engine.play({video_id:'VALID_ID_11',stream_url:'old'},0);
  await engine.play({video_id:'OTHER_ID_11',stream_url:'new'},0);
  engine.audio.dispatchEvent(new Event('pause'));
  assert.equal(engine.isPlaying,true);
  assert.equal(engine.desiredPlaying,true);
  assert.equal(paused,0);
});

test('an earlier Play on the same track cannot complete a later resume', async () => {
  let finish;
  globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
  const engine=new AudioEngine(()=>{},()=>{});
  const track={video_id:'VALID_ID_11'};
  const first=engine.play(track,0);
  engine.pause();
  const resumed=engine.play(track,20);
  finish({ok:true,json:async()=>({stream_url:'audio'})});
  await Promise.all([first,resumed]);
  assert.equal(engine.audio.plays,1);
  assert.equal(engine.audio.currentTime,20);
});

test('relay audio uses one CORS graph, preserves controls and isolates legacy direct audio', async()=>{
  const OriginalContext=globalThis.AudioContext;
  let sources=0,contexts=0;
  class Context {
    constructor(){contexts++;this.state='suspended';this.destination={};}
    createAnalyser(){return {fftSize:0,smoothingTimeConstant:0,connect(){}};}
    createMediaElementSource(audio){sources++;assert.equal(audio.crossOrigin,'anonymous');return {connect(){}};}
    resume(){this.state='running';return Promise.resolve();}
  }
  globalThis.AudioContext=Context;
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({stream_url:'https://direct.example/audio',audio_path:'/api/v1/audio/opaque_handle'})});
    let paused=0;
    const engine=new AudioEngine(()=>{},()=>{},()=>{},()=>{paused++;});
    const track={video_id:'VALID_ID_11'};
    await engine.play(track,0);
    const analysed=engine.audio;
    assert.equal(analysed.src,'http://127.0.0.1:8000/api/v1/audio/opaque_handle');
    assert.ok(engine.getAnalyser());
    engine.pause();await engine.play(track,9);engine.setVolume(.3);
    assert.equal(engine.audio.currentTime,9);assert.equal(engine.audio.volume,.3);
    assert.equal(contexts,1);assert.equal(sources,1);
    await engine.play({video_id:'OTHER_ID_11',stream_url:'legacy'},0);
    assert.notEqual(engine.audio,analysed);assert.equal(engine.audio.crossOrigin,undefined);
    assert.equal(engine.getAnalyser(),null);
    analysed.dispatchEvent(new Event('pause'));assert.equal(paused,0);
    await engine.play(track,10);assert.equal(engine.audio,analysed);assert.equal(sources,1);
  }finally{globalThis.AudioContext=OriginalContext;}
});

test('an untrusted audio_path cannot replace the resolved stream',async()=>{
 globalThis.fetch=async()=>({ok:true,json:async()=>({stream_url:'safe',audio_path:'//evil.example/audio'})});
 const engine=new AudioEngine(()=>{},()=>{});
 const track={video_id:'VALID_ID_11'};await engine.play(track,0);
 assert.equal(engine.audio.src,'safe');assert.equal(track.audio_path,null);
});
