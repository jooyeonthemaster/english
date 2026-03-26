import { interpolate, spring, Easing } from 'remotion';

// ─── FAST animations for rapid montage style ───

// Quick fade (5 frames = 0.17s)
export function fadeIn(frame: number, delay = 0, duration = 5) {
  return interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

export function fadeOut(frame: number, startFrame: number, duration = 5) {
  return interpolate(frame, [startFrame, startFrame + duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// Beat visibility: shows content during a specific beat window
// beatIndex = which beat (0-based), beatDuration = frames per beat
export function beatOpacity(
  frame: number,
  beatIndex: number,
  beatDuration = 90,
  fadeFrames = 4,
) {
  const start = beatIndex * beatDuration;
  const end = start + beatDuration;
  const fadeInEnd = start + fadeFrames;
  const fadeOutStart = end - fadeFrames;

  if (frame < start || frame > end) return 0;
  if (frame < fadeInEnd) {
    return interpolate(frame, [start, fadeInEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  }
  if (frame > fadeOutStart) {
    return interpolate(frame, [fadeOutStart, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  }
  return 1;
}

// Quick slide from bottom (snappy spring)
export function slideUp(frame: number, fps: number, delay = 0) {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 200, mass: 0.6 },
  });
  return interpolate(progress, [0, 1], [40, 0]);
}

// Quick slide from left
export function slideLeft(frame: number, fps: number, delay = 0) {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 200, mass: 0.6 },
  });
  return interpolate(progress, [0, 1], [-50, 0]);
}

// Quick slide from right
export function slideRight(frame: number, fps: number, delay = 0) {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 200, mass: 0.6 },
  });
  return interpolate(progress, [0, 1], [50, 0]);
}

// Pop scale (quick bounce)
export function popScale(frame: number, fps: number, delay = 0) {
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.5 },
  });
}

// Count up animation (faster)
export function countUp(frame: number, target: number, delay = 0, duration = 20) {
  const progress = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return Math.round(target * progress);
}

// Fast stagger (2 frames apart)
export function stagger(index: number, baseDelay = 0, interval = 2) {
  return baseDelay + index * interval;
}

// Typewriter (faster: 1 char per frame)
export function typewriter(text: string, frame: number, delay = 0, speed = 1) {
  const charsToShow = Math.floor(Math.max(0, (frame - delay) / speed));
  return text.substring(0, Math.min(charsToShow, text.length));
}

// Progress bar (faster)
export function progressBar(frame: number, target: number, delay = 0, duration = 25) {
  return interpolate(frame, [delay, delay + duration], [0, target], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

// Pulse glow
export function pulseGlow(frame: number, fps: number) {
  const cycle = Math.sin((frame / fps) * Math.PI * 2 * 0.8);
  return interpolate(cycle, [-1, 1], [0.4, 1]);
}

// Zoom in effect
export function zoomIn(frame: number, fps: number, delay = 0, from = 0.85) {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 180, mass: 0.5 },
  });
  return interpolate(progress, [0, 1], [from, 1]);
}

// Hook text animation (big text that pops in then settles)
export function hookScale(frame: number, fps: number, delay = 0) {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 8, stiffness: 150, mass: 0.8 },
  });
  return interpolate(progress, [0, 1], [1.3, 1]);
}

// Line draw animation (for charts)
export function drawLine(frame: number, delay = 0, duration = 30) {
  return interpolate(frame, [delay, delay + duration], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

// Wipe transition
export function wipeIn(frame: number, duration = 10) {
  return interpolate(frame, [0, duration], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
}

// Multi-beat helper: returns which beat is active + progress within that beat
export function getBeatInfo(frame: number, beatDuration = 90) {
  const currentBeat = Math.floor(frame / beatDuration);
  const beatProgress = (frame % beatDuration) / beatDuration;
  const beatFrame = frame % beatDuration; // frame within the current beat
  return { currentBeat, beatProgress, beatFrame };
}

// Smooth transition between beats
export function crossfade(frame: number, transitionStart: number, duration = 6) {
  return interpolate(frame, [transitionStart, transitionStart + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
