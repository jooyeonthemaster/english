import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, progressBar, pulseGlow } from '../../../utils/animations';
import { Background } from '../../../components/Background';

// ─── BEAT 5: AI Generation Progress ───
export const Beat5Progress: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 5);
  const bf = frame - BEAT * 5;
  const glow = pulseGlow(frame, fps);
  const steps = [
    '지문 분석', '핵심 포인트 추출', '문제 구조 생성', '선택지 생성', '해설 작성',
  ];
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Background variant="gradient" />
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
      }}>
        {/* Spinning sparkle */}
        <div style={{
          fontSize: 64, transform: `rotate(${bf * 4}deg)`,
          filter: `drop-shadow(0 0 ${20 + 10 * glow}px rgba(59,130,246,0.5))`,
        }}>✨</div>
        <div style={{
          fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 800, color: COLORS.textPrimary,
        }}>AI 문제 생성 중...</div>
        {/* Progress steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 400 }}>
          {steps.map((step, i) => {
            const stepDone = bf > 10 + i * 12;
            const stepActive = bf > 10 + i * 12 - 12 && !stepDone;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: fadeIn(frame, BEAT * 5 + 5 + i * 4, 4),
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: stepDone ? COLORS.emerald : stepActive ? COLORS.primary : COLORS.bg,
                  color: stepDone || stepActive ? COLORS.white : COLORS.textMuted,
                  fontSize: 14, fontWeight: 700, fontFamily: FONT_FAMILY,
                  boxShadow: stepActive ? `0 0 12px rgba(59,130,246,0.4)` : 'none',
                }}>
                  {stepDone ? '✓' : i + 1}
                </div>
                <span style={{
                  fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: stepDone ? 600 : 400,
                  color: stepDone ? COLORS.emerald : stepActive ? COLORS.primary : COLORS.textSecondary,
                }}>{step}</span>
                {stepActive && (
                  <div style={{
                    width: 60, height: 4, borderRadius: 2, background: COLORS.bg, marginLeft: 'auto',
                  }}>
                    <div style={{
                      width: `${progressBar(frame, 100, BEAT * 5 + 10 + i * 12, 12)}%`,
                      height: '100%', borderRadius: 2, background: COLORS.primary,
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
