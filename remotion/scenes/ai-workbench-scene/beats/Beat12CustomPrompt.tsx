import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, popScale, pulseGlow, typewriter } from '../../../utils/animations';
import { AppShell, Badge } from '../../../components/MockUI';

// ─── BEAT 12: Teacher custom prompt ───
export const Beat12CustomPrompt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 12);
  const bf = frame - BEAT * 12;
  const promptText = '조건: 문법 관계대명사 중점, 서술형 50% 이상, 난이도 중급-킬러 혼합, 객관식 5지선다';
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
            커스텀 출제 설정
          </div>
          {/* Teacher info */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            opacity: fadeIn(frame, BEAT * 12 + 3, 5),
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: COLORS.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: COLORS.white, fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800,
            }}>박</div>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>박선생</div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>강동고등학교 담당</div>
            </div>
            <Badge text="강동고" color={COLORS.primary} bg={COLORS.primaryBg} />
          </div>
          {/* Prompt input */}
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: 20,
            border: `2px solid ${COLORS.primary}20`,
            opacity: fadeIn(frame, BEAT * 12 + 8, 5),
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8 }}>
              AI 출제 프롬프트
            </div>
            <div style={{
              fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 1.7, color: COLORS.textPrimary,
              padding: 16, background: COLORS.bg, borderRadius: 12, minHeight: 80,
            }}>
              {typewriter(promptText, frame, BEAT * 12 + 12, 0.7)}
              <span style={{ opacity: Math.sin(frame / 4) > 0 ? 1 : 0, color: COLORS.primary }}>|</span>
            </div>
          </div>
          {/* Generate button */}
          <div style={{
            opacity: fadeIn(frame, BEAT * 12 + 50, 5),
            transform: `scale(${popScale(frame, fps, BEAT * 12 + 50)})`,
          }}>
            <div style={{
              fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.white,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.purple})`,
              padding: '14px 32px', borderRadius: 14, textAlign: 'center',
              boxShadow: `0 4px 20px rgba(59,130,246,${0.3 + 0.2 * pulseGlow(frame, fps)})`,
            }}>
              ✨ 이 설정으로 문제 생성
            </div>
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
