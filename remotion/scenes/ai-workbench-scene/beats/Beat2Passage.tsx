import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, typewriter } from '../../../utils/animations';
import { AppShell } from '../../../components/MockUI';

// ─── BEAT 2: Passage import with typewriter ───
export const Beat2Passage: React.FC = () => {
  const frame = useCurrentFrame();
  const o = beatOpacity(frame, 2);
  const passageText = "The concept of emotional intelligence, first proposed by Salovey and Mayer in 1990, has fundamentally changed how we understand human cognition. Unlike traditional measures of intelligence, emotional intelligence encompasses the ability to recognize, understand, and manage our own emotions while also being attuned to the emotions of others.";
  const typedText = typewriter(passageText, frame, BEAT * 2 + 5, 0.5);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AppShell activeNav={5}>
        <div style={{ display: 'flex', gap: 20, height: '100%' }}>
          {/* Passage area */}
          <div style={{ flex: 1, background: COLORS.white, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
              지문 입력
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>
              영어 지문을 붙여넣기 하세요
            </div>
            <div style={{
              fontFamily: '"Georgia", serif', fontSize: 15, lineHeight: 1.8, color: COLORS.textPrimary,
              padding: 16, background: COLORS.bg, borderRadius: 12, minHeight: 200,
            }}>
              {typedText}
              <span style={{ opacity: Math.sin(frame / 4) > 0 ? 1 : 0, color: COLORS.primary }}>|</span>
            </div>
          </div>
          {/* Metadata sidebar */}
          <div style={{
            width: 220, display: 'flex', flexDirection: 'column', gap: 12,
            opacity: fadeIn(frame, BEAT * 2 + 10, 8),
          }}>
            {[
              { label: '학교', value: '강동고등학교' },
              { label: '학년', value: '고등학교 1학년' },
              { label: '단원', value: 'Unit 3. Emotions' },
              { label: '교과서', value: '능률 (김성곤)' },
            ].map((item, i) => (
              <div key={i} style={{
                background: COLORS.white, borderRadius: 12, padding: '12px 16px',
                border: `1px solid ${COLORS.border}`,
                opacity: fadeIn(frame, BEAT * 2 + 12 + i * 3, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    </AbsoluteFill>
  );
};
