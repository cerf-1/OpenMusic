// A single lightweight canvas, alive only while the listening room is open.
export function createCoverWave(canvas, readState) {
  const ctx=canvas.getContext('2d');
  if(!ctx)return {destroy(){}};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let bins=new Uint8Array(512);
  let frame=0,last=0,energy=0,size=0,disposed=false;
  const resize=new ResizeObserver(()=>{size=canvas.clientWidth;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=size*dpr;canvas.height=size*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw(0,true);});
  function draw(now,force=false) {
    if(disposed)return;
    if(!force)frame=requestAnimationFrame(draw);
    if(!force&&now-last<33)return;
    last=now;
    if(document.hidden||!size)return;
    const state=readState();
    let target=0;
    if(state.playing&&!motion.matches){
      if(state.analyser){if(bins.length!==state.analyser.frequencyBinCount)bins=new Uint8Array(state.analyser.frequencyBinCount);state.analyser.getByteFrequencyData(bins);target=bins.slice(1,14).reduce((a,b)=>a+b,0)/(13*255);}

    }
    energy+=(target-energy)*.18;
    ctx.clearRect(0,0,size,size);
    const center=size/2,radius=size*.414;
    const phase=motion.matches||!state.analyser?0:state.time;
    for(let layer=0;layer<3;layer++){
      ctx.beginPath();
      for(let i=0;i<=240;i++){
        const a=i/240*Math.PI*2;
        const ripple=Math.sin(a*7+phase*1.3+layer*.8)*.5+Math.cos(a*11-phase*.9)*.3+Math.sin(a*3+phase*.5)*.2;
        const r=radius+layer*size*.014+ripple*(size*.004+energy*size*.048);
        const x=center+Math.cos(a)*r,y=center+Math.sin(a)*r;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.strokeStyle=['rgba(209,187,248,.64)','rgba(183,162,232,.28)','rgba(183,162,232,.13)'][layer];ctx.lineWidth=layer===0?1.4:1;ctx.stroke();
    }
    // Small radial lights give the ring texture without a dense equalizer cage.
    for(let i=0;i<96;i++){
      const a=i/96*Math.PI*2;
      const band=state.playing&&!motion.matches&&state.analyser?bins[i%32]/255:energy;
      const r=radius+size*.052;
      const length=size*(.002+band*.016)*(1+.5*Math.sin(a*9+phase));
      ctx.beginPath();ctx.moveTo(center+Math.cos(a)*r,center+Math.sin(a)*r);ctx.lineTo(center+Math.cos(a)*(r+length),center+Math.sin(a)*(r+length));ctx.strokeStyle=`rgba(205,183,244,${.15+energy*.3})`;ctx.lineWidth=1.3;ctx.stroke();
    }
  }
  resize.observe(canvas);frame=requestAnimationFrame(draw);
  return {destroy(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();}};
}
