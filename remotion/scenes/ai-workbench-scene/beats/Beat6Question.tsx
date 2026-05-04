import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, slideRight } from '../../../utils/animations';
import { AppShell, Badge } from '../../../components/MockUI';

// ─── BEAT 6: Generated question (MC) ───
export const Beat6Question: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 6);
  const bf = frame - BEAT * 6;
  const options = [
    { num: '①', text: 'the ability to control others\' emotions', correct: false },
    { num: '②', text: 'a measurement of traditional IQ', correct: false },
    { num: '③', text: 'understanding and managing emotions', correct: true },
    { num: '④', text: 'the suppression of emotional responses', correct: false },
    { num: '⑤', text: 'academic performance in school', correct: false },
  ];
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', gap: 20, height: '100%' }}>
          {/* Question */}
          <div style={{ flex: 1, background: COLORS.white, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Badge text="빈칸 추론" color={COLORS.primary} bg={COLORS.primaryBg} />
              <Badge text="중급" color={COLORS.amber} bg={COLORS.amberBg} />
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 600, color: COLORS.textPrimary, lineHeight: 1.7, marginBottom: 20 }}>
              다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.
            </div>
            <div style={{
              fontFamily: '"Georgia", serif', fontSize: 14, lineHeight: 1.8, color: COLORS.textSecondary,
              padding: 16, background: COLORS.bg, borderRadius: 12, marginBottom: 20,
            }}>
              The concept of emotional intelligence encompasses __________, which goes beyond what traditional IQ tests can measure.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((opt, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 14, padding: '10px 16px', borderRadius: 10,
                  background: opt.correct && bf > 30 ? 'rgba(16,185,129,0.1)' : 'transparent',
                  border: opt.correct && bf > 30 ? `2px solid ${COLORS.emerald}` : `1px solid ${COLORS.border}`,
                  color: opt.correct && bf > 30 ? COLORS.emerald : COLORS.textPrimary,
                  fontWeight: opt.correct && bf > 30 ? 700 : 400,
                  opacity: fadeIn(frame, BEAT * 6 + 8 + i * 3, 4),
                }}>
                  <span style={{ marginRight: 8, fontWeight: 700 }}>{opt.num}</span>{opt.text}
                </div>
              ))}
            </div>
          </div>
          {/* Explanation panel */}
          <div style={{
            width: 280, background: COLORS.white, borderRadius: 16, padding: 20,
            border: `1px solid ${COLORS.border}`,
            transform: `translateX(${slideRight(frame, fps, BEAT * 6 + 30)}px)`,
            opacity: fadeIn(frame, BEAT * 6 + 30, 6),
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.emerald, marginBottom: 12 }}>
              ✓ 정답: ③
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, lineHeight: 1.6, color: COLORS.textSecondary }}>
              지문에서 emotional intelligence가 감정을 인식하고 관리하는 능력이라고 설명하고 있으므로...
            </div>
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
