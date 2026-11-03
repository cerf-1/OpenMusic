// Reserve the actual player footprint, including its mobile bottom offset.
// The player itself keeps its existing size, position, DOM and controls.
export function createFullscreenLayout(room, player) {
  const background = [...document.querySelectorAll('.sidebar,.main-shell,.mobile-nav')];
  const previousInert = background.map(element => element.inert);
  background.forEach(element => { element.inert = true; });
  function resize() {
    const clearance = Math.max(0, window.innerHeight - player.getBoundingClientRect().top) + 12;
    room.style.setProperty('--player-clearance', `${clearance}px`);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(player);
  window.addEventListener('resize', resize);
  resize();
  return {
    destroy() {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
    }
  };
}
