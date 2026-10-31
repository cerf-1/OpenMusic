import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {measureSignal} from '../dist/artwork-wave.js';

test('silence has no loudness, bass or invented beat',()=>{
 const value=measureSignal(new Uint8Array(1024).fill(128),new Uint8Array(512),48000);
 assert.deepEqual(value,{level:0,bass:0,attack:0});
});
test('louder samples increase level, bass attacks decay on a held note',()=>{
 const quiet=Uint8Array.from({length:1024},(_,i)=>128+Math.round(Math.sin(i*.1)*5));
 const loud=Uint8Array.from({length:1024},(_,i)=>128+Math.round(Math.sin(i*.1)*45));
 const spectrum=new Uint8Array(512);spectrum.fill(220,1,5);
 const a=measureSignal(quiet,spectrum,48000);
 const b=measureSignal(loud,spectrum,48000);
 assert.ok(b.level>a.level*5);assert.ok(b.bass>.7);assert.ok(b.attack>.5);
 assert.equal(measureSignal(loud,spectrum,48000,b.bass).attack,0);
});
test('treble alone does not masquerade as a bass hit',()=>{
 const spectrum=new Uint8Array(512);spectrum.fill(255,70,150);
 const value=measureSignal(new Uint8Array(1024).fill(140),spectrum,48000);
 assert.ok(value.level>0);assert.equal(value.bass,0);assert.equal(value.attack,0);
});
