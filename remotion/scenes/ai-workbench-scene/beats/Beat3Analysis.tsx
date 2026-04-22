import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, pulseGlow, slideRight } from '../../../utils/animations';
import { AppShell } from '../../../components/MockUI';

// ─── BEAT 3: AI Analysis ───
export const Beat3Analysis: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 3);
  const bf = frame - BEAT * 3;
  const glowBorder = pulseGlow(frame, fps);
  const analysisCards = [
    { icon: '📝', label: '핵심 어휘', value: '12개 추출', color: COLORS.primary },
    { icon: '📊', label: '난이도', value: 'B2 중급', color: COLORS.amber },
    { icon: '🔤', label: '문법 포인트', value: '5개 감지', color: COLORS.purple },
    { icon: '📐', label: '지문 구조', value: '도입-전개-결론', color: COLORS.emerald },
  ];
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', gap: 20, height: '100%' }}>
          {/* Passage with glow */}
          <div style={{
            flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
            border: `2px solid rgba(59,130,246,${0.3 + 0.3 * glowBorder})`,
            boxShadow: `0 0 20px rgba(59,130,246,${0.15 * glowBorder}), 0 0 40px rgba(59,130,246,${0.08 * glowBorder})`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>✨</span>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.primary }}>AI 분석 중...</span>
            </div>
            <div style={{ fontFamily: '"Georgia", serif', fontSize: 14, lineHeight: 1.8, color: COLORS.textPrimary }}>
              <span style={{ background: bf > 10 ? 'rgba(59,130,246,0.12)' : 'transparent', padding: '2px 0', transition: 'all 0.2s' }}>
                The concept of emotional intelligence,
              </span>{' '}
              <span style={{ background: bf > 20 ? 'rgba(139,92,246,0.12)' : 'transparent', padding: '2px 0' }}>
                first proposed by Salovey and Mayer in 1990,
              </span>{' '}
              <span style={{ background: bf > 30 ? 'rgba(16,185,129,0.12)' : 'transparent', padding: '2px 0' }}>
                has fundamentally changed how we understand human cognition.
              </span>{' '}
              <span style={{ background: bf > 40 ? 'rgba(245,158,11,0.12)' : 'transparent', padding: '2px 0' }}>
                Unlike traditional measures of intelligence, emotional intelligence encompasses the ability to recognize, understand, and manage our own emotions.
              </span>
            </div>
          </div>
          {/* Analysis cards */}
          <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {analysisCards.map((card, i) => (
              <div key={i} style={{
                background: COLORS.white, borderRadius: 14, padding: '14px 16px',
                border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12,
                opacity: fadeIn(frame, BEAT * 3 + 8 + i * 5, 5),
                transform: `translateX(${slideRight(frame, fps, BEAT * 3 + 8 + i * 5)}px)`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18, background: `${card.color}15`,
                }}>{card.icon}</div>
                <div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{card.label}</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: card.color }}>{card.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
