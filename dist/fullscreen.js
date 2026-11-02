// Fullscreen uses the exact same contour, signal analysis and lifecycle as the mini player.
import { createArtworkWave } from './artwork-wave.js?v=5';

export function createCoverWave(canvas, readState) {
  return createArtworkWave(canvas, readState, {
    isVisible: () => document.body.classList.contains('has-fullscreen')
  });
}
