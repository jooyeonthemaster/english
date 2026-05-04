import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn } from '../../../utils/animations';
import { AppShell } from '../../../components/MockUI';
import { FeatureCard } from '../components/FeatureCard';

// ─── BEAT 1: Workbench hub with 3 feature cards ───
export const Beat1Workbench: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 1);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 24, fontWeight: 800, color: COLORS.textPrimary }}>
            AI 워크벤치
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <FeatureCard icon="📄" title="지문 관리" value="156개 보유" gradient="linear-gradient(135deg, #3B82F6, #06B6D4)" delay={BEAT + 5} frame={frame} fps={fps} />
            <FeatureCard icon="🤖" title="문제 생성" value="AI 자동 생성" gradient="linear-gradient(135deg, #8B5CF6, #EC4899)" delay={BEAT + 8} frame={frame} fps={fps} />
            <FeatureCard icon="📋" title="시험 출제" value="원클릭 제작" gradient="linear-gradient(135deg, #10B981, #3B82F6)" delay={BEAT + 11} frame={frame} fps={fps} />
          </div>
          {/* Recent activity */}
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: 20, border: `1px solid ${COLORS.border}`,
            opacity: fadeIn(frame, BEAT + 15, 8),
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 12 }}>
              최근 활동
            </div>
            {['고1 3월 모의고사 지문 5개 추가', 'AI 문제 32개 생성 완료', '중2 단원평가 시험지 제작'].map((t, i) => (
              <div key={i} style={{
                fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary, padding: '6px 0',
                borderBottom: i < 2 ? `1px solid ${COLORS.border}` : 'none',
                opacity: fadeIn(frame, BEAT + 18 + i * 3, 5),
              }}>
                <span style={{ color: COLORS.primary, marginRight: 8 }}>●</span>{t}
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
