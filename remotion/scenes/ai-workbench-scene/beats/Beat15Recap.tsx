import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, popScale } from '../../../utils/animations';
import { Background } from '../../../components/Background';

// ─── BEAT 15: Recap flow diagram ───
export const Beat15Recap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 15);
  const bf = frame - BEAT * 15;
  const nodes = [
    { icon: '📄', label: '지문' },
    { icon: '🔍', label: 'AI 분석' },
    { icon: '🤖', label: '문제 생성' },
    { icon: '📋', label: '시험 출제' },
    { icon: '📥', label: '내보내기' },
  ];
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Background variant="brand" />
      <div style={{
        position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)',
        display: 'flex', alignItems: 'center', gap: 0,
      }}>
        {nodes.map((node, i) => {
          const d = BEAT * 15 + i * 6;
          const nodeOpacity = fadeIn(frame, d, 5);
          const s = popScale(frame, fps, d);
          return (
            <React.Fragment key={i}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                opacity: nodeOpacity, transform: `scale(${s})`,
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                }}>{node.icon}</div>
                <span style={{
                  fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
                }}>{node.label}</span>
              </div>
              {i < nodes.length - 1 && (
                <div style={{
                  width: 60, height: 2, background: `linear-gradient(90deg, transparent, ${COLORS.primary}, transparent)`,
                  margin: '0 8px', marginBottom: 30,
                  opacity: fadeIn(frame, d + 4, 4),
                  transform: `scaleX(${interpolate(bf, [i * 6 + 4, i * 6 + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {/* Powered by badge */}
      <div style={{
        position: 'absolute', bottom: 140, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
        opacity: fadeIn(frame, BEAT * 15 + 40, 8),
      }}>
        <div style={{
          fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600,
          color: 'rgba(255,255,255,0.5)', letterSpacing: 1,
        }}>Powered by</div>
        <div style={{
          fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800,
          color: COLORS.primaryLight,
          background: 'rgba(59,130,246,0.15)',
          padding: '6px 16px', borderRadius: 10,
        }}>Gemini 3.0 Flash</div>
      </div>
    </AbsoluteFill>
  );
};
