import React from 'react';
import { COLORS } from '../../../utils/constants';
import { fadeIn, fadeOut, popScale } from '../../../utils/animations';

// ─── Sparkle particles for hook ───
export const Sparkle: React.FC<{ x: number; y: number; delay: number; frame: number; fps: number }> = ({
  x, y, delay, frame, fps,
}) => {
  const s = popScale(frame, fps, delay);
  const drift = Math.sin((frame - delay) / 8) * 6;
  const opacity = fadeIn(frame, delay, 4) * (frame > delay + 50 ? fadeOut(frame, delay + 50, 10) : 1);
  return (
    <div
      style={{
        position: 'absolute',
        left: x + drift,
        top: y - (frame - delay) * 0.5,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: COLORS.primaryLight,
        boxShadow: `0 0 12px ${COLORS.primary}, 0 0 24px rgba(59,130,246,0.4)`,
        transform: `scale(${s})`,
        opacity,
      }}
    />
  );
};
