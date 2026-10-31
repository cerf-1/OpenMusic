import { strict as assert } from 'node:assert';
import { test } from 'node:test';

class FakeAudio extends EventTarget {
  constructor() { super(); this.currentTime=0; this.duration=300; this.volume=1; this.plays=0; }
  play() { this.plays++; return Promise.resolve(); }
  pause() {}
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
