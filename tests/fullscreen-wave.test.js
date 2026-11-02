import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createArtworkWave} from '../dist/artwork-wave.js';
import {createCoverWave} from '../dist/fullscreen.js';

test('only the visible player renders, and fullscreen cleans up its animation and observers',()=>{
  const names=['document','window','matchMedia','ResizeObserver','MutationObserver','devicePixelRatio','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'];
  const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  let fullscreen=false,id=0,disconnected=0;
  const pending=new Map(),mutations=[];
  const context=new Proxy({},{get:()=>()=>{},set:()=>true});
  const makeCanvas=()=>({dataset:{},getContext:()=>context,getBoundingClientRect:()=>({width:96,height:96}),parentElement:{querySelector:()=>({clientWidth:64})}});
  try{
    globalThis.document={hidden:false,body:{classList:{contains:()=>fullscreen}},addEventListener(){},removeEventListener(){}};
    globalThis.window={addEventListener(){},removeEventListener(){}};
    globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){this.fn();}disconnect(){disconnected++;}};
    globalThis.MutationObserver=class{constructor(fn){mutations.push(fn);}observe(){}disconnect(){disconnected++;}};
    globalThis.devicePixelRatio=1;globalThis.getComputedStyle=()=>({borderRadius:'12px'});
    globalThis.requestAnimationFrame=fn=>{pending.set(++id,fn);return id;};
    globalThis.cancelAnimationFrame=key=>pending.delete(key);
    const read=()=>({playing:false,volume:.65,track:1,analyser:null});
    const mini=createArtworkWave(makeCanvas(),read);
    assert.equal(pending.size,1,'mini is initially visible');
    fullscreen=true;mutations.forEach(fn=>fn());
    assert.equal(pending.size,0,'hidden mini stops rendering');
    const fullCanvas=makeCanvas(),full=createCoverWave(fullCanvas,read);
    assert.equal(pending.size,1,'fullscreen renderer is allowed to start');
    const [key,paint]=pending.entries().next().value;pending.delete(key);paint(100);
    assert.equal(fullCanvas.dataset.level,'0.000');
    assert.equal(pending.size,0,'paused fullscreen does not keep an animation loop alive');
    full.wake();assert.equal(pending.size,1,'playback changes can wake fullscreen');
    full.destroy();assert.equal(pending.size,0);
    fullscreen=false;mutations[0]();assert.equal(pending.size,1,'mini resumes on return');
    mini.destroy();assert.equal(pending.size,0);assert.equal(disconnected,4);
  }finally{for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
