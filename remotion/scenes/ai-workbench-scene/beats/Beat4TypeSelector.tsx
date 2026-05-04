import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY, QUESTION_TYPES } from '../../../utils/constants';
import { beatOpacity, fadeIn } from '../../../utils/animations';
import { AppShell } from '../../../components/MockUI';

// ─── BEAT 4: Question type selector (19 types in 3 columns) ───
export const Beat4TypeSelector: React.FC = () => {
  const frame = useCurrentFrame();
  const o = beatOpacity(frame, 4);
  const bf = frame - BEAT * 4;
  const categories = [
    { label: '객관식 (10)', color: COLORS.primary, types: QUESTION_TYPES.filter(q => q.category === '객관식') },
    { label: '서술형 (6)', color: COLORS.purple, types: QUESTION_TYPES.filter(q => q.category === '서술형') },
    { label: '어휘 (3)', color: COLORS.emerald, types: QUESTION_TYPES.filter(q => q.category === '어휘') },
  ];
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', gap: 20, height: '100%' }}>
          {/* Passage (mini) */}
          <div style={{
            width: 380, background: COLORS.white, borderRadius: 16, padding: 20,
            border: `1px solid ${COLORS.border}`, overflow: 'hidden',
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
              선택된 지문
            </div>
            <div style={{ fontFamily: '"Georgia", serif', fontSize: 12, lineHeight: 1.7, color: COLORS.textSecondary }}>
              The concept of emotional intelligence, first proposed by Salovey and Mayer in 1990, has fundamentally changed how we understand human cognition...
            </div>
          </div>
          {/* Type selector */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              문제 유형 선택
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {categories.map((cat, ci) => (
                <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700, color: cat.color,
                    padding: '6px 12px', background: `${cat.color}12`, borderRadius: 8,
                    opacity: fadeIn(frame, BEAT * 4 + 3 + ci * 3, 4),
                  }}>{cat.label}</div>
                  {cat.types.map((qt, qi) => {
                    const isSelected = qt.name === '빈칸 추론';
                    const d = BEAT * 4 + 8 + ci * 2 + qi * 2;
                    return (
                      <div key={qi} style={{
                        fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: isSelected ? 700 : 500,
                        padding: '7px 12px', borderRadius: 8,
                        background: isSelected ? `${COLORS.primary}15` : COLORS.white,
                        border: isSelected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                        color: isSelected ? COLORS.primary : COLORS.textSecondary,
                        opacity: fadeIn(frame, d, 3),
                        transform: isSelected && bf > 40 ? `scale(${1 + Math.sin(bf / 6) * 0.02})` : 'none',
                      }}>{qt.name}</div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
