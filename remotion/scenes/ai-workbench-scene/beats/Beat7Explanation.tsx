import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, slideRight, typewriter } from '../../../utils/animations';
import { AppShell } from '../../../components/MockUI';

// ─── BEAT 7: AI Explanation detail ───
export const Beat7Explanation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 7);
  const bf = frame - BEAT * 7;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', gap: 20 }}>
          {/* 정답 해설 */}
          <div style={{
            flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
            border: `1px solid ${COLORS.border}`,
            opacity: fadeIn(frame, BEAT * 7 + 3, 5),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>✨</span>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.emerald }}>정답 해설</span>
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, lineHeight: 1.8, color: COLORS.textSecondary, marginBottom: 20 }}>
              {typewriter(
                '정답은 ③번입니다. 지문의 핵심 내용은 emotional intelligence가 자신의 감정을 인식(recognize), 이해(understand), 관리(manage)하는 능력이라는 것입니다. 이는 전통적인 IQ 측정과 구별되는 개념으로, 빈칸에는 이 정의에 해당하는 표현이 들어가야 합니다.',
                frame, BEAT * 7 + 8, 0.5
              )}
            </div>
            {/* 핵심 포인트 */}
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.primary, marginBottom: 10 }}>
              핵심 포인트
            </div>
            {['빈칸 전후 문맥 파악이 중요', 'encompasses 뒤에 오는 명사구 구조 이해', '지문 내 정의(definition) 패턴 인식'].map((point, i) => (
              <div key={i} style={{
                fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, padding: '4px 0',
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: fadeIn(frame, BEAT * 7 + 30 + i * 5, 5),
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.primary, flexShrink: 0 }} />
                {point}
              </div>
            ))}
          </div>
          {/* 오답 분석 */}
          <div style={{
            width: 320, background: COLORS.white, borderRadius: 16, padding: 24,
            border: `1px solid ${COLORS.border}`,
            opacity: fadeIn(frame, BEAT * 7 + 15, 6),
            transform: `translateX(${slideRight(frame, fps, BEAT * 7 + 15)}px)`,
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.rose, marginBottom: 14 }}>
              오답 분석
            </div>
            {[
              { num: '①', reason: '타인의 감정 통제 - 지문에서 언급하지 않음' },
              { num: '②', reason: '전통적 IQ 측정 - 지문에서 이와 구별된다고 설명' },
              { num: '④', reason: '감정 억제 - manage와는 다른 개념' },
              { num: '⑤', reason: '학업 성취도 - 지문의 주제와 무관' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, padding: '8px 0',
                borderBottom: i < 3 ? `1px solid ${COLORS.border}` : 'none',
                opacity: fadeIn(frame, BEAT * 7 + 20 + i * 4, 4),
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.rose }}>{item.num}</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>{item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
