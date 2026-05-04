import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY, QUESTION_TYPES } from '../../../utils/constants';
import { beatOpacity, fadeIn, popScale, progressBar } from '../../../utils/animations';
import { AppShell } from '../../../components/MockUI';

// ─── BEAT 11: Batch generation ───
export const Beat11BatchGen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 11);
  const bf = frame - BEAT * 11;
  const totalGenerated = Math.min(20, Math.floor(bf / 3));
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
              20문제 한번에 생성
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.primary }}>
              {totalGenerated}/20 완료
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 8, borderRadius: 4, background: COLORS.bg }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.purple})`,
              width: `${progressBar(frame, 100, BEAT * 11 + 3, 55)}%`,
            }} />
          </div>
          {/* Question cards cascade */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, overflow: 'hidden', maxHeight: 340 }}>
            {Array.from({ length: 20 }).map((_, i) => {
              const visible = bf > i * 3;
              return (
                <div key={i} style={{
                  width: 120, height: 70, borderRadius: 12, background: COLORS.white,
                  border: `1px solid ${COLORS.border}`, padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  opacity: visible ? fadeIn(frame, BEAT * 11 + i * 3, 3) : 0,
                  transform: `scale(${visible ? popScale(frame, fps, BEAT * 11 + i * 3) : 0})`,
                }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.primary }}>
                    Q{i + 1}
                  </div>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 9, color: COLORS.textMuted,
                  }}>
                    {QUESTION_TYPES[i % QUESTION_TYPES.length].name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
