// All displacement comes from the signal. No clock-driven or simulated beat.
const clamp = value => Math.max(0, Math.min(1, value));
export function measureSignal(time, frequency, sampleRate, previousBass=0) {
  let sum=0;
  for(const byte of time){const sample=(byte-128)/128;sum+=sample*sample;}
  const rms=Math.sqrt(sum/time.length);
  const binHz=sampleRate/(frequency.length*2);
  const low=Math.max(1,Math.floor(40/binHz)),high=Math.min(frequency.length-1,Math.ceil(180/binHz));
  let bass=0;
  for(let i=low;i<=high;i++)bass+=(frequency[i]/255)**2;
  bass=Math.sqrt(bass/Math.max(1,high-low+1));
  // Positive low-frequency flux catches attacks; a held bass note doesn't retrigger.
  return {level:clamp(rms*3.8),bass,attack:clamp((bass-previousBass-.035)*4)};
}

export function createArtworkWave(canvas, readState) {
  const ctx=canvas?.getContext('2d');
  if(!ctx)return {wake(){},destroy(){}};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,last=0,disposed=false,analyser=null,time,frequency,previousTrack;
  let level=0,bass=0,hit=0,averageBass=0;
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
  function visible(){return !document.hidden&&!document.body.classList.contains('has-fullscreen');}
  function outline(expansion,detail){
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
    if(state.track!==previousTrack){previousTrack=state.track;averageBass=0;level=0;bass=0;hit=0;bands.fill(0);}
    const source=state.playing&&!reduced.matches&&state.volume>0?state.analyser:null;
    let targetLevel=0,targetBass=0,attack=0;
    if(source){
      if(source!==analyser){analyser=source;time=new Uint8Array(source.fftSize);frequency=new Uint8Array(source.frequencyBinCount);averageBass=0;}
      source.getByteTimeDomainData(time);source.getByteFrequencyData(frequency);
      const signal=measureSignal(time,frequency,source.context.sampleRate,averageBass);
      targetLevel=signal.level;targetBass=signal.bass;attack=signal.attack;
      averageBass+=(targetBass-averageBass)*(1-Math.exp(-dt*5));
    }
    const approach=(current,target)=>current+(target-current)*(1-Math.exp(-dt*(target>current?22:7)));
    level=approach(level,targetLevel);bass=approach(bass,targetBass);
    hit=Math.max(attack,hit*Math.exp(-dt*9));
    for(let i=0;i<96;i++){
      // Mirror spectral detail on both sides; quiet samples make no lobes.
      const index=source?Math.min(frequency.length-1,2+Math.round((1-Math.cos(i/96*Math.PI*2))*25)):0;
      const sample=source?Math.abs((time[Math.floor(i/96*time.length)]-128)/128):0;
      const value=source?clamp((frequency[index]/255)**2*.7+sample*1.6)*targetLevel:0;
      bands[i]=approach(bands[i],value);
    }
    if(width){
      ctx.clearRect(0,0,width,height);
      const energy=clamp(level*.65+bass*.2+hit*.35);
      const expansion=Math.min(pad-7,level*3+bass*2+hit*3);
      // Very small, bounded canvas: glow never repaints the whole player.
      ctx.shadowColor=`rgba(193,164,240,${energy*.55})`;ctx.shadowBlur=energy*6;
      outline(expansion+2,energy*3);
      ctx.strokeStyle=`rgba(183,162,232,${.05+energy*.22})`;ctx.lineWidth=2;ctx.stroke();
      ctx.shadowBlur=0;
      outline(expansion,Math.min(8,pad*.5)*(.4+level+hit*.35));
      ctx.fillStyle=`rgba(183,162,232,${energy*.07})`;ctx.fill();
      ctx.strokeStyle=`rgba(223,204,250,${.07+energy*.76})`;ctx.lineWidth=1.3+hit*.65;ctx.stroke();
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
