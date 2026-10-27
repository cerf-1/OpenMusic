// All motion is finite and compositor-driven; nothing runs while the glass is idle.
export function createPlayerMaterial(player) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)');
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
      // Reach the farthest corner, including when the transport sits at the right on mobile.
      const radius = Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y));
      effects.style.setProperty('--wave-x', `${x}px`);
      effects.style.setProperty('--wave-y', `${y}px`);
      const duration = playing ? 1250 : 1050;
      for (const [index, ring] of [wave, echo].entries()) {
        Object.assign(ring.style, {left: `${x}px`, top: `${y}px`, width: `${radius * 2}px`, height: `${radius * 2}px`});
        const animation = ring.animate([
          {transform: 'translate(-50%, -50%) scale(.025)', opacity: 0},
          {opacity: playing ? .65 : .42, offset: .12},
          {opacity: .25, offset: .6},
          {transform: 'translate(-50%, -50%) scale(1.04)', opacity: 0}
        ], {duration, delay: index * 140, easing: 'cubic-bezier(.16,.55,.28,1)', fill: 'none'});
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
