import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, progressBar, slideUp } from '../../../utils/animations';
import { AppShell, Badge } from '../../../components/MockUI';

// ─── BEAT 10: Difficulty showcase ───
export const Beat10Difficulty: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 10);
  const levels = [
    { label: '기본', pct: '60%', color: COLORS.emerald, bg: COLORS.emeraldBg, desc: '교과서 수준 기본 문제', example: '주제/요지 파악' },
    { label: '중급', pct: '30%', color: COLORS.primary, bg: COLORS.primaryBg, desc: '수능 3-4등급 수준', example: '빈칸 추론' },
    { label: '킬러', pct: '10%', color: COLORS.rose, bg: COLORS.roseBg, desc: '수능 1등급 변별력', example: '복합 문장 삽입' },
  ];
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
            난이도 설정
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {levels.map((lv, i) => (
              <div key={i} style={{
                flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
                border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 12,
                opacity: fadeIn(frame, BEAT * 10 + 5 + i * 5, 5),
                transform: `translateY(${slideUp(frame, fps, BEAT * 10 + 5 + i * 5)}px)`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge text={lv.label} color={lv.color} bg={lv.bg} />
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 900, color: lv.color }}>{lv.pct}</span>
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>{lv.desc}</div>
                <div style={{
                  fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted, padding: '8px 12px',
                  background: COLORS.bg, borderRadius: 8,
                }}>예: {lv.example}</div>
                {/* Progress bar */}
                <div style={{ height: 6, borderRadius: 3, background: COLORS.bg }}>
                  <div style={{
                    height: '100%', borderRadius: 3, background: lv.color,
                    width: `${progressBar(frame, parseInt(lv.pct), BEAT * 10 + 10 + i * 5, 20)}%`,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
