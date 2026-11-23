import { startFullscreenParticles } from './fullscreen-particles.js?v=3';

// Reuse the live controls on mobile and restore their exact positions on exit.
export function createFullscreenLayout(room, player) {
  const background = [...document.querySelectorAll('.sidebar,.main-shell,.mobile-nav')];
  const previousInert = background.map(element => element.inert);
  background.forEach(element => { element.inert = true; });
  const mobile = window.matchMedia('(max-width: 720px)');
  const controls = room.querySelector('.listening-controls');
  const actions = room.querySelector('.listening-actions');
  const details = room.querySelector('.listening-details');
  const moved = ['.playback', '.player-like', '.player-tools'].map(selector => {
    const element = player.querySelector(selector);
    const marker = document.createComment('fullscreen control position');
    element.before(marker);
    return { element, marker };
  });
  function restore() {
    moved.forEach(({ element, marker }) => marker.after(element));
  }
  function adapt() {
    if (mobile.matches) {
      moved.forEach(({ element }, index) => [controls, details, actions][index].append(element));
    } else restore();
    resize();
  }
  function resize() {
    if (mobile.matches) return;
    const clearance = Math.max(0, window.innerHeight - player.getBoundingClientRect().top) + 12;
    room.style.setProperty('--player-clearance', `${clearance}px`);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(player);
  window.addEventListener('resize', resize);
  mobile.addEventListener('change', adapt);
  adapt();
  const stopParticles = startFullscreenParticles(room);
  return {
    destroy() {
      stopParticles?.();
      restore();
      moved.forEach(({ marker }) => marker.remove());
      mobile.removeEventListener('change', adapt);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
    }
  };
}
