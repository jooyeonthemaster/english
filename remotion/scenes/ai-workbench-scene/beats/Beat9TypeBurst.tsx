import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY, QUESTION_TYPES } from '../../../utils/constants';
import { beatOpacity, fadeIn, popScale } from '../../../utils/animations';
import { Background } from '../../../components/Background';

// ─── BEAT 9: 19 type tags burst ───
export const Beat9TypeBurst: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 9);
  const bf = frame - BEAT * 9;
  const catColors: Record<string, { bg: string; text: string }> = {
    '객관식': { bg: 'rgba(59,130,246,0.12)', text: COLORS.primary },
    '서술형': { bg: 'rgba(139,92,246,0.12)', text: COLORS.purple },
    '어휘': { bg: 'rgba(16,185,129,0.12)', text: COLORS.emerald },
  };
  // Arrange in rows: start scattered, settle into rows
  const settle = interpolate(bf, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Background variant="brand" />
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        display: 'flex', flexWrap: 'wrap', gap: 10, width: 700, justifyContent: 'center',
      }}>
        {QUESTION_TYPES.map((qt, i) => {
          const angle = (i / 19) * Math.PI * 2;
          const scatterX = Math.cos(angle) * 300 * (1 - settle);
          const scatterY = Math.sin(angle) * 200 * (1 - settle);
          const s = popScale(frame, fps, BEAT * 9 + i * 2);
          const cc = catColors[qt.category] || catColors['객관식'];
          return (
            <div key={i} style={{
              fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600,
              padding: '10px 18px', borderRadius: 12,
              background: cc.bg, color: cc.text,
              transform: `translate(${scatterX}px, ${scatterY}px) scale(${s})`,
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              whiteSpace: 'nowrap',
            }}>{qt.name}</div>
          );
        })}
      </div>
      {/* Category legend */}
      <div style={{
        position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 32, opacity: fadeIn(frame, BEAT * 9 + 40, 8),
      }}>
        {[
          { label: '객관식 10종', color: COLORS.primary },
          { label: '서술형 6종', color: COLORS.purple },
          { label: '어휘 3종', color: COLORS.emerald },
        ].map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
            <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{c.label}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
