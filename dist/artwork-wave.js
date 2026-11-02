// All displacement comes from the signal. No clock-driven or simulated beat.
const clamp = value => Math.max(0, Math.min(1, value));
// Float FFT stores dB, so convert back to amplitude before normalizing.
// Undo the player's gain before tracking the music's own recent loudness.
export function createRelativeSignal() {
  let logLevel=0,logBass=0,elapsed=0,previousBass=null;
  const spectrum=new Float32Array(96);
  return {
    reset(){logLevel=0;logBass=0;elapsed=0;previousBass=null;spectrum.fill(0);},
    measure(time,frequency,sampleRate,volume,dt=1/30){
      const gain=Math.max(volume,.00001);
      let sum=0;
      for(const sample of time)sum+=(sample/gain)**2;
      const rms=Math.sqrt(sum/time.length);
      const binHz=sampleRate/(frequency.length*2);
      const low=Math.max(1,Math.floor(40/binHz)),high=Math.min(frequency.length-1,Math.ceil(180/binHz));
      let bass=0;
      for(let i=low;i<=high;i++)bass+=(10**(frequency[i]/20)/gain)**2;
      bass=Math.sqrt(bass/Math.max(1,high-low+1));
      // A real silence gate, independent of the listening volume. Never amplify noise.
      if(rms<.0001){previousBass=null;spectrum.fill(0);return {level:0,bass:0,attack:0,bands:spectrum};}
      // Accumulate the track's typical loudness in log space. A quiet bridge
      // stays quiet relative to the song instead of becoming the new normal
      // after a second. Only audible, actually observed music enters the mean.
      const duration=Math.max(.001,Math.min(dt,.1));
      elapsed+=duration;
      const weight=duration/elapsed;
      logLevel+=(Math.log(rms)-logLevel)*weight;
      logBass+=(Math.log(Math.max(bass,rms*.05))-logBass)*weight;
      const reference=Math.exp(logLevel),bassReference=Math.exp(logBass);
      const relative=rms/reference;
      const relativeBass=bass/bassReference;
      const attack=previousBass===null?0:clamp((relativeBass-previousBass-.08)*.9);
      previousBass=relativeBass;
      // Typical music sits halfway out; +/-6dB is a visible contraction/lift.
      const level=clamp(.55+.38*Math.log2(relative));
      for(let i=0;i<96;i++){
        const index=Math.min(frequency.length-1,2+Math.round((1-Math.cos(i/96*Math.PI*2))*25));
        const spectral=10**(frequency[index]/20)/gain/Math.max(reference,.0001);
        const sample=Math.abs(time[Math.floor(i/96*time.length)])/gain/Math.max(reference,.0001);
        spectrum[i]=clamp(spectral*.85+sample*.48)*(.55+level*.45);
      }
      return {level,bass:relativeBass>0?clamp(.5+.3*Math.log2(relativeBass)):0,attack,bands:spectrum};
    }
  };
}

export function createArtworkWave(canvas, readState, {isVisible=()=>!document.body.classList.contains('has-fullscreen')}={}) {
  const ctx=canvas?.getContext('2d');
  if(!ctx)return {wake(){},destroy(){}};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,last=0,disposed=false,analyser=null,time,frequency,previousTrack;
  let level=0,bass=0,hit=0;
  const relativeSignal=createRelativeSignal();
  let width=0,height=0,pad=0,radius=14;
  const bands=new Float32Array(96);
  const points=new Float32Array(192);
  const observer=new ResizeObserver(()=>{
    const bounds=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    width=bounds.width;height=bounds.height;
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const image=canvas.parentElement.querySelector('img');
    pad=(width-image.clientWidth)/2;
    radius=parseFloat(getComputedStyle(image).borderRadius)||12;
    wake();
  });
  function visible(){return !document.hidden&&isVisible();}
  function outline(expansion,detail){
    expansion*=.75;detail*=.75;
    const half=(width-2*pad)/2+2+expansion;
    // A true rounded rectangle follows the cover, including its corner radius.
    const corner=Math.min(half,radius+expansion+2),edge=half-corner;
    const straight=edge*2,arc=Math.PI*corner/2,quarter=straight+arc;
    for(let i=0;i<96;i++){
      const distance=i/96*quarter*4,side=Math.floor(distance/quarter),local=distance-side*quarter;
      let x,y,nx,ny;
      if(local<straight){x=-edge+local;y=-half;nx=0;ny=-1;}
      else{const angle=-Math.PI/2+(local-straight)/corner;nx=Math.cos(angle);ny=Math.sin(angle);x=edge+corner*nx;y=-edge+corner*ny;}
      const turn=side*Math.PI/2,c=Math.cos(turn),s=Math.sin(turn),offset=bands[i]*detail;
      points[i*2]=width/2+(x+nx*offset)*c-(y+ny*offset)*s;
      points[i*2+1]=height/2+(x+nx*offset)*s+(y+ny*offset)*c;
    }
    ctx.beginPath();
    ctx.moveTo((points[190]+points[0])/2,(points[191]+points[1])/2);
    for(let i=0;i<96;i++){
      const next=(i+1)%96;ctx.quadraticCurveTo(points[i*2],points[i*2+1],(points[i*2]+points[next*2])/2,(points[i*2+1]+points[next*2+1])/2);
    }
    ctx.closePath();
  }
  function paint(now){
    frame=0;if(disposed)return;
    const state=readState();
    if(!visible()){last=0;return;}
    if(now-last<1000/30){frame=requestAnimationFrame(paint);return;}
    const dt=last?Math.min((now-last)/1000,.1):1/30;last=now;
    if(state.track!==previousTrack){previousTrack=state.track;relativeSignal.reset();level=0;bass=0;hit=0;bands.fill(0);}
    const source=state.playing&&!reduced.matches&&state.volume>0?state.analyser:null;
    let targetLevel=0,targetBass=0,attack=0,signal;
    if(source){
      if(source!==analyser){analyser=source;time=new Float32Array(source.fftSize);frequency=new Float32Array(source.frequencyBinCount);relativeSignal.reset();}
      source.getFloatTimeDomainData(time);source.getFloatFrequencyData(frequency);
      signal=relativeSignal.measure(time,frequency,source.context.sampleRate,state.volume,dt);
      targetLevel=signal.level;targetBass=signal.bass;attack=signal.attack;
    }
    const approach=(current,target)=>current+(target-current)*(1-Math.exp(-dt*(target>current?22:7)));
    level=approach(level,targetLevel);bass=approach(bass,targetBass);
    hit=Math.max(attack,hit*Math.exp(-dt*9));
    for(let i=0;i<96;i++){
      // Relative spectral and waveform detail, mirrored around the cover.
      const value=signal?signal.bands[i]:0;
      bands[i]=approach(bands[i],value);
    }
    if(width){
      ctx.clearRect(0,0,width,height);
      const energy=clamp(level*.8+bass*.25+hit*.3);
      const expansion=Math.min(pad-6,(pad-7)*(level*.82+bass*.18)+hit*2);
      const detail=Math.min(Math.max(0,pad-4-expansion),Math.min(8,pad*.5)*(.85+level*.65+hit*.35));
      // The fill fades inward: an erased, feathered rounded rectangle keeps
      // a clear 1.5px breathing space around the cover, even at a strong hit.
      outline(expansion,detail);
      ctx.fillStyle=`rgba(183,162,232,${energy*.26})`;ctx.fill();
      ctx.globalCompositeOperation='destination-out';
      ctx.shadowColor='#000';ctx.shadowBlur=5;
      ctx.fillStyle='#000';
      ctx.beginPath();ctx.roundRect(pad-1.5,pad-1.5,width-pad*2+3,height-pad*2+3,radius+1.5);ctx.fill();
      ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
      // Very small, bounded canvas: glow never repaints the whole player.
      ctx.shadowColor=`rgba(193,164,240,${energy*.55})`;ctx.shadowBlur=energy*6;
      outline(expansion+2,Math.min(Math.max(0,pad-6-expansion),energy*3));
      ctx.strokeStyle=`rgba(183,162,232,${.05+energy*.22})`;ctx.lineWidth=2;ctx.stroke();
      ctx.shadowBlur=0;
      outline(expansion,detail);
      ctx.strokeStyle=`rgba(223,204,250,${.07+energy*.76})`;ctx.lineWidth=1.3+hit*.65;ctx.stroke();
      // Clip even the contour's glow out of the cover's breathing space.
      ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';
      ctx.beginPath();ctx.roundRect(pad-1.5,pad-1.5,width-pad*2+3,height-pad*2+3,radius+1.5);ctx.fill();
      ctx.globalCompositeOperation='source-over';
      // Expose actual measured values for diagnostics without retaining audio.
      canvas.dataset.level=level.toFixed(3);canvas.dataset.bass=bass.toFixed(3);canvas.dataset.beat=hit.toFixed(3);
    }
    if((state.playing&&!reduced.matches&&state.analyser&&state.volume>0)||level+bass+hit>.005)frame=requestAnimationFrame(paint);
    else last=0;
  }
  function wake(){if(!disposed&&!frame&&visible())frame=requestAnimationFrame(paint);}
  function visibility(){if(!visible()){cancelAnimationFrame(frame);frame=0;last=0;}else wake();}
  observer.observe(canvas);reduced.addEventListener('change',wake);
  document.addEventListener('visibilitychange',visibility);
  const bodyObserver=new MutationObserver(visibility);bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pageshow',wake);
  function destroy(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();bodyObserver.disconnect();reduced.removeEventListener('change',wake);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',wake);}
  return {wake,destroy};
}
