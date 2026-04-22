import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn } from '../../../utils/animations';
import { AppShell } from '../../../components/MockUI';

// ─── BEAT 13: Generated exam preview ───
export const Beat13ExamPreview: React.FC = () => {
  const frame = useCurrentFrame();
  const o = beatOpacity(frame, 13);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', gap: 20, height: '100%' }}>
          {/* Exam paper */}
          <div style={{
            flex: 1, background: COLORS.white, borderRadius: 16, padding: 28,
            border: `1px solid ${COLORS.border}`, overflow: 'hidden',
            opacity: fadeIn(frame, BEAT * 13 + 3, 6),
          }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: `2px solid ${COLORS.textPrimary}` }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
                2026학년도 1학기
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 900, color: COLORS.textPrimary }}>
                중간고사 영어 시험지
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                고1 | 50분 | 100점 만점
              </div>
            </div>
            {/* Questions preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  opacity: fadeIn(frame, BEAT * 13 + 8 + i * 3, 4),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, minWidth: 24 }}>
                    {i + 1}.
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      height: 8, borderRadius: 4, background: COLORS.bg, width: `${70 + (i * 13) % 30}%`, marginBottom: 4,
                    }} />
                    {i < 5 && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                        {['①', '②', '③', '④', '⑤'].map((n, j) => (
                          <div key={j} style={{
                            height: 6, borderRadius: 3, background: COLORS.bg, width: 40,
                          }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Exam info panel */}
          <div style={{
            width: 250, display: 'flex', flexDirection: 'column', gap: 12,
            opacity: fadeIn(frame, BEAT * 13 + 20, 6),
          }}>
            {[
              { label: '총 문제수', value: '20문제' },
              { label: '객관식', value: '14문제' },
              { label: '서술형', value: '6문제' },
              { label: '배점', value: '각 5점' },
              { label: '소요시간', value: '50분' },
            ].map((item, i) => (
              <div key={i} style={{
                background: COLORS.white, borderRadius: 12, padding: '12px 16px',
                border: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between',
                opacity: fadeIn(frame, BEAT * 13 + 22 + i * 3, 4),
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>{item.label}</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
