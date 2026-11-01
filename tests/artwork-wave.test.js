import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createRelativeSignal} from '../dist/artwork-wave.js';

function floatSignal(amplitude,volume=1,bassScale=1){
 const time=Float32Array.from({length:1024},(_,i)=>Math.sin(i*.1)*amplitude*volume);
 const frequency=new Float32Array(512).fill(-Infinity);
 for(let i=1;i<55;i++)frequency[i]=20*Math.log10(amplitude*volume*(i<5?bassScale:.2));
 return {time,frequency};
}
function readRelative(meter,amplitude,volume=1,bass=1){
 const {time,frequency}=floatSignal(amplitude,volume,bass);
 return meter.measure(time,frequency,48000,volume);
}
test('relative dynamics and detail are invariant across recording and listening gains',()=>{
 const a=createRelativeSignal(),b=createRelativeSignal();
 for(let i=0;i<180;i++){
  const amplitude=.12*(1+.5*Math.sin(i*.17));
  const x=readRelative(a,amplitude,1);
  const y=readRelative(b,amplitude*.04,.08);
  for(const key of ['level','bass','attack'])assert.ok(Math.abs(x[key]-y[key])<.00001,key);
  x.bands.forEach((value,index)=>assert.ok(Math.abs(value-y.bands[index])<.00001));
 }
});
test('changing player volume does not create a musical attack or alter level',()=>{
 const meter=createRelativeSignal();
 let initial;
 for(let i=0;i<90;i++)initial=readRelative(meter,.12,.65);
 for(const volume of [.1,1,.02,.8]){
  const next=readRelative(meter,.12,volume);
  assert.ok(Math.abs(next.level-initial.level)<.00001);
  assert.ok(Math.abs(next.bass-initial.bass)<.00001);
  assert.equal(next.attack,0);
 }
});
test('a relative rise and bass attack still react, a sustained note settles',()=>{
 const meter=createRelativeSignal();
 let steady;
 for(let i=0;i<90;i++)steady=readRelative(meter,.05);
 const hit=readRelative(meter,.09,1,1.5);
 assert.ok(hit.level>steady.level*1.5);assert.ok(hit.attack>.5);
 let held;for(let i=0;i<240;i++)held=readRelative(meter,.09,1,1.5);
 assert.equal(held.attack,0);assert.ok(held.level<hit.level);
});
test('silence and reset do not retain the previous track dynamics',()=>{
 const meter=createRelativeSignal();readRelative(meter,.2);
 const quiet=meter.measure(new Float32Array(1024),new Float32Array(512).fill(-Infinity),48000,.1);
 assert.equal(quiet.level+quiet.bass+quiet.attack,0);assert.ok(quiet.bands.every(v=>v===0));
 meter.reset();
 const fresh=readRelative(createRelativeSignal(),.004,.1);
 const next=readRelative(meter,.004,.1);
 assert.deepEqual(next,fresh);
});

test('treble alone and the first steady frame do not invent bass attacks',()=>{
 const meter=createRelativeSignal();
 const {time,frequency}=floatSignal(.1);
 assert.equal(meter.measure(time,frequency,48000,1).attack,0);
 frequency.fill(-Infinity);frequency.fill(-20,70,150);
 const value=meter.measure(time,frequency,48000,1);
 assert.ok(value.level>0);assert.equal(value.bass,0);assert.equal(value.attack,0);
});

test('typical track level sits at the middle with visible spectral movement',()=>{
 const meter=createRelativeSignal();let typical;
 for(let i=0;i<300;i++)typical=readRelative(meter,.1);
 assert.ok(Math.abs(typical.level-.55)<.001);
 assert.ok(Math.abs(typical.bass-.5)<.001);
 const detail=typical.bands.reduce((sum,value)=>sum+value,0)/typical.bands.length;
 assert.ok(detail>.4,'normal music must retain substantial detail instead of double attenuation');
});
test('a quiet bridge stays smaller and a loud section larger than the track average',()=>{
 const meter=createRelativeSignal();
 for(let i=0;i<1800;i++)readRelative(meter,.1);
 let quiet;for(let i=0;i<600;i++)quiet=readRelative(meter,.035);
 assert.ok(quiet.level<.2,'20 seconds of quiet must not become the new midpoint');
 let loud;for(let i=0;i<600;i++)loud=readRelative(meter,.2);
 assert.ok(loud.level>.8,'a loud section must retain its lift relative to the song');
});
