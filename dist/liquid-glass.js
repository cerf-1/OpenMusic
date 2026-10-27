// Motion is finite and uses transform/opacity; compositing still depends on the engine.
export function createPlayerMaterial(player) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)');
  // CSS owns the rendering policy. Gecko uses bounded wave fronts instead of
  // rasterizing two panel-width circles inside a short, clipped control bar.
  const sweep = getComputedStyle(player).getPropertyValue('--glass-ripple').trim() === 'sweep';
  const effects = document.createElement('div');
  effects.className = 'player-glass-fx';
  effects.setAttribute('aria-hidden', 'true');
  effects.innerHTML = '<i class="glass-caustic"></i><i class="glass-wave"></i><i class="glass-wave glass-wave-echo"></i>';
  player.prepend(effects);
  const [light, wave, echo] = effects.children;
  let tint;
  let animations = [];

  function stop() {
    animations.forEach(animation => animation.cancel());
    animations = [];
  }
  function respectPreferences() {
    if (reducedMotion.matches || reducedTransparency.matches) stop();
  }
  reducedMotion.addEventListener('change', respectPreferences);
  reducedTransparency.addEventListener('change', respectPreferences);
  window.addEventListener('pagehide', stop);

  return {
    setTint(value) {
      if (value === tint) return;
      tint = value;
      player.style.setProperty('--glass-tint', value);
    },
    ripple(playing) {
      stop();
      if (reducedMotion.matches || reducedTransparency.matches || !player.animate) return;
      const bounds = player.getBoundingClientRect();
      const button = player.querySelector('.main-play').getBoundingClientRect();
      const x = button.left + button.width / 2 - bounds.left;
      const y = button.top + button.height / 2 - bounds.top;
      effects.style.setProperty('--wave-x', `${x}px`);
      effects.style.setProperty('--wave-y', `${y}px`);
      const duration = playing ? 1250 : 1050;
      // Keep the existing circular treatment on Blink/WebKit. The Gecko path
      // paints only two narrow strips, regardless of viewport width or DPR.
      const radius = sweep ? 0 : Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y));
      for (const [index, ring] of [wave, echo].entries()) {
        Object.assign(ring.style, {
          left: `${x}px`, top: sweep ? '0px' : `${y}px`,
          width: sweep ? '96px' : `${radius * 2}px`,
          height: sweep ? `${bounds.height}px` : `${radius * 2}px`
        });
        const start = sweep ? 'translateX(-50%) scaleX(.15)' : 'translate(-50%, -50%) scale(.025)';
        const end = sweep
          ? `translateX(${index === 0 ? -x - 96 : bounds.width - x + 96}px) scaleX(1)`
          : 'translate(-50%, -50%) scale(1.04)';
        const animation = ring.animate([
          {transform: start, opacity: 0},
          {opacity: playing ? .65 : .42, offset: .12},
          {opacity: .25, offset: .6},
          {transform: end, opacity: 0}
        ], {duration, delay: sweep ? 0 : index * 140, easing: 'cubic-bezier(.16,.55,.28,1)', fill: 'none'});
        animations.push(animation);
      }
      animations.push(light.animate([
        {opacity: 0}, {opacity: playing ? .8 : .5, offset: .15}, {opacity: 0}
      ], {duration: duration * .85, easing: 'ease-out', fill: 'none'}));
      const current = animations;
      // Release finished animation objects without a timer or an unhandled cancel rejection.
      Promise.allSettled(current.map(animation => animation.finished)).then(() => {
        if (animations === current) animations = [];
      });
    }
  };
}
