# OpenMusic handoff

## 2026-11-03 — Fullscreen redesign

### Request and constraints

Rebuild fullscreen around the supplied Spotify reference: a large centered cover, title and artist beneath it, a quiet background, and minimal chrome. Preserve the existing bottom player. Move its audio wave to the fullscreen cover while fullscreen is open.

### Implemented

- Replaced the old two-column listening room, rotated cover, circular visualizer, slogans, and duplicate playback/volume/timeline controls with one centered artwork stage.
- Kept only the collection/search source, queue shortcut, and exit button in the fullscreen header.
- Title wraps to at most two lines; artist truncates to one line. Full text remains in the DOM and native title tooltip. Both sit below the cover, outside the wave's bounds. Very short viewports can scroll the artwork area.
- The original bottom player's markup, material, controls, dimensions, padding, colors and placement remain intact. Fullscreen only keeps it visible and above the artwork stage. A scoped stable scrollbar gutter prevents its width from jumping when page scrolling is locked.
- `createFullscreenLayout` measures the real player footprint with ResizeObserver and window resize, including the existing mobile bottom offset. The fullscreen panel ends 12px above it.
- Reused `createArtworkWave` for the large cover, with the existing relative FFT/waveform response, silence gate, volume compensation and reduced-motion handling. The small wave is hidden and stops rendering in fullscreen; it resumes when fullscreen closes. The old synthetic circular visualizer was removed.
- Playback, volume and track changes wake the fullscreen wave and update metadata. Closing/replacing the overlay destroys its wave and layout observers.
- Background navigation is inert while fullscreen is open; keyboard focus includes the persistent bottom player. Escape, the exit control, and the player artwork/fullscreen action close fullscreen and restore focus.
- Updated module/style cache versions in `dist/index.html` and `dist/app.js`.

### Files

- `dist/app.js`: fullscreen structure, metadata sync, overlay cleanup, wave wakeups, keyboard scope and fullscreen toggle.
- `dist/fullscreen.css`: fullscreen-only layout and visibility rules; retain the small pre-existing player entry-point rules at the top.
- `dist/fullscreen.js`: player clearance and background inert lifecycle.
- `dist/artwork-wave.js`: allow the shared renderer to operate on the fullscreen canvas.
- `dist/index.html`: cache versions only; player markup unchanged.

### Validation

- Syntax checks for app, fullscreen and artwork wave modules; existing package syntax checks.
- Existing `tests/artwork-wave.test.js` and `tests/stream.test.js` pass.
- Browser checks at desktop 1440×1000, mobile 390×844 and 320×568: artwork/details remain above the player; no horizontal overflow at the narrowest size.
- Compared player DOM and computed styling before/after opening fullscreen: styling and markup match. After preserving the scrollbar gutter, its bounding rectangle also matches exactly.
- Exercised playback/pause, next track with synchronized title/artist, queue opening, Escape and repeated fullscreen action. No browser console errors in the final interaction checks.
- Observed live fullscreen wave measurements while the small wave remained stopped.
- Preview images in the parent workspace: `openmusic-fullscreen-clean-desktop.png`, `openmusic-fullscreen-clean-mobile.png`.

### Repository state

Work is in the nested `openmusic` Git repository. `tests/audio-analysis.browser.html` was already staged before this task and is deliberately excluded from the fullscreen commit. No deployment was requested or performed.
