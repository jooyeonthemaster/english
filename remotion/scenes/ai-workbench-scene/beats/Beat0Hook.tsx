import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONT_FAMILY } from '../../../utils/constants';
import { fadeIn, fadeOut, hookScale, pulseGlow, slideUp } from '../../../utils/animations';
import { Background } from '../../../components/Background';
import { Sparkle } from '../components/Sparkle';

// ─── BEAT 0: HOOK - "19가지 AI 문제 유형" ───
export const Beat0Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numScale = hookScale(frame, fps, 5);
  const numOpacity = fadeIn(frame, 0, 4);
  const glow = pulseGlow(frame, fps);
  const textOpacity = fadeIn(frame, 20, 6);
  const textY = slideUp(frame, fps, 20);
  const exitOpacity = frame > 78 ? fadeOut(frame, 78, 10) : 1;

  const sparkles = [
    { x: 860, y: 380, delay: 8 }, { x: 1060, y: 360, delay: 12 },
    { x: 900, y: 480, delay: 16 }, { x: 1020, y: 500, delay: 10 },
    { x: 840, y: 440, delay: 20 }, { x: 1080, y: 420, delay: 14 },
    { x: 920, y: 340, delay: 22 }, { x: 1000, y: 540, delay: 18 },
  ];

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      <Background variant="brand" />
      {sparkles.map((sp, i) => (
        <Sparkle key={i} x={sp.x} y={sp.y} delay={sp.delay} frame={frame} fps={fps} />
      ))}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY, fontSize: 160, fontWeight: 900, color: COLORS.white,
          letterSpacing: '-0.04em', transform: `scale(${numScale})`, opacity: numOpacity,
          textShadow: `0 0 60px rgba(59,130,246,${0.6 * glow}), 0 0 120px rgba(59,130,246,${0.3 * glow})`,
        }}>
          19
        </div>
        <div style={{
          fontFamily: FONT_FAMILY, fontSize: 36, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
          letterSpacing: '0.05em', opacity: textOpacity, transform: `translateY(${textY}px)`,
        }}>
          가지 AI 문제 유형
        </div>
      </div>
    </AbsoluteFill>
  );
};
