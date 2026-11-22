const STREAK_SIZE = 64;
const STREAK_HEIGHT = 16;

function createStreak() {
  const sprite = document.createElement('canvas');
  sprite.width = STREAK_SIZE;
  sprite.height = STREAK_HEIGHT;
  const context = sprite.getContext('2d');
  const trail = context.createLinearGradient(0, 0, 60, 0);
  trail.addColorStop(0, 'rgba(171, 153, 219, 0)');
  trail.addColorStop(.52, 'rgba(192, 176, 234, .22)');
  trail.addColorStop(.9, 'rgba(225, 213, 251, .64)');
  trail.addColorStop(1, '#f5eeff');
  context.fillStyle = trail;
  context.beginPath();
  context.moveTo(0, 8);
  context.quadraticCurveTo(35, 6, 57, 3);
  context.bezierCurveTo(63, 2, 64, 14, 57, 13);
  context.quadraticCurveTo(35, 10, 0, 8);
  context.fill();
  return sprite;
}

function resetParticle(particle) {
  particle.edge = Math.random();
  particle.targetX = Math.random() - .5;
  particle.targetY = Math.random() - .5;
  particle.duration = .48 + Math.random() * .72;
  // Most particles are pinpoints. A few pass close enough to leave wide trails.
  const depth = Math.random() ** 4;
  particle.thickness = 1.1 + 3.3 * depth;
  particle.exposure = .002 + .048 * depth;
  particle.opacity = .23 + .49 * Math.random();
  particle.progress = 0;
}

function drawStreak(context, sprite, particle, width, height, artX, artY, artWidth, artHeight, scale) {
  // Pick a point along the viewport perimeter, weighted by each edge's length.
  const edge = particle.edge * 2 * (width + height);
  let startX;
  let startY;
  if (edge < width) {
    startX = edge;
    startY = 0;
  } else if (edge < width + height) {
    startX = width;
    startY = edge - width;
  } else if (edge < 2 * width + height) {
    startX = 2 * width + height - edge;
    startY = height;
  } else {
    startX = 0;
    startY = 2 * (width + height) - edge;
  }

  const targetX = artX + particle.targetX * artWidth * .42;
  const targetY = artY + particle.targetY * artHeight * .42;
  const dx = (targetX - startX) * 1.17;
  const dy = (targetY - startY) * 1.17;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;

  // Travel faster in the foreground and lose speed as the cover takes over.
  const remaining = 1 - particle.progress;
  const radius = remaining * (.62 + .38 * remaining);
  const x = targetX - dx * radius;
  const y = targetY - dy * radius;
  const directionX = dx / distance * scale;
  const directionY = dy / distance * scale;
  const thickness = particle.thickness * (.55 + .45 * remaining);
  const length = thickness + particle.exposure * distance * (.62 + .76 * remaining) / particle.duration;

  context.globalAlpha = particle.opacity * Math.min(1, particle.progress * 18, remaining * 12);
  context.setTransform(directionX, directionY, -directionY, directionX, x * scale, y * scale);
  context.drawImage(sprite, -length, -thickness, length + thickness * .5, thickness * 2);
}

export function startFullscreenParticles(room) {
  const art = room.querySelector('.listening-art');
  const layer = document.createElement('div');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!art || !context) return;

  layer.className = 'fullscreen-particle-layer';
  layer.setAttribute('aria-hidden', 'true');
  canvas.className = 'fullscreen-particles';
  layer.append(canvas);

  const sprite = createStreak();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const particles = [];
  let frame;
  let previousTime;

  function draw(time) {
    const delta = Math.min(.05, (time - (previousTime ?? time)) / 1000);
    previousTime = time;
    const width = layer.clientWidth;
    const height = room.clientHeight;
    const origin = layer.getBoundingClientRect();
    const cover = art.getBoundingClientRect();
    const artX = cover.left - origin.left + cover.width / 2;
    const artY = cover.top - origin.top + cover.height / 2;

    if (width && height && cover.width && cover.height) {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2300000 / (width * height)));
      const pixelWidth = Math.ceil(width * scale);
      const pixelHeight = Math.ceil(height * scale);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const cssHeight = `${height}px`;
      if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;

      const count = Math.min(720, Math.max(250, Math.round(width * height / 1750)));
      if (particles.length > count) particles.length = count;
      while (particles.length < count) {
        const particle = {};
        resetParticle(particle);
        particle.progress = Math.random();
        particles.push(particle);
      }

      context.resetTransform();
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      for (const particle of particles) {
        particle.progress += delta / particle.duration;
        if (particle.progress >= 1) resetParticle(particle);
        drawStreak(context, sprite, particle, width, height, artX, artY, cover.width, cover.height, scale);
      }
    }
    frame = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(frame);
    previousTime = undefined;
    layer.remove();
  }

  function syncMotion() {
    if (motion.matches) stop();
    else if (!layer.isConnected) {
      room.prepend(layer);
      frame = requestAnimationFrame(draw);
    }
  }

  motion.addEventListener('change', syncMotion);
  syncMotion();
  return () => {
    motion.removeEventListener('change', syncMotion);
    stop();
  };
}
