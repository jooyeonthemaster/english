import React from 'react';
import { COLORS, FONT_FAMILY } from '../../../utils/constants';
import { fadeIn, fadeOut, zoomIn } from '../../../utils/animations';

// ─── Quick montage question card ───
export const QuestionTypeCard: React.FC<{
  type: string; layout: 'mc' | 'order' | 'writing' | 'vocab'; frame: number; fps: number; delay: number;
}> = ({ type, layout, frame, fps, delay }) => {
  const o = fadeIn(frame, delay, 3) * (frame > delay + 16 ? fadeOut(frame, delay + 16, 3) : 1);
  const s = zoomIn(frame, fps, delay, 0.9);
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', opacity: o, transform: `scale(${s})`,
    }}>
      <div style={{
        background: COLORS.white, borderRadius: 20, padding: '32px 40px', width: 500,
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      }}>
        <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.primary, marginBottom: 8 }}>
          AI 생성 문제
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 16 }}>
          {type}
        </div>
        {layout === 'mc' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['다음 문장의 어법상 틀린 것은?', '① was → were', '② which → that', '③ having → have ✓', '④ to be → being'].map((t, i) => (
              <div key={i} style={{
                fontFamily: FONT_FAMILY, fontSize: 13, padding: '6px 12px', borderRadius: 8,
                background: i === 3 ? 'rgba(16,185,129,0.1)' : 'transparent',
                color: i === 3 ? COLORS.emerald : COLORS.textSecondary, fontWeight: i === 3 ? 600 : 400,
              }}>{t}</div>
            ))}
          </div>
        )}
        {layout === 'order' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['(A) However,', '(B) This means that', '(C) In contrast,', '(D) As a result,'].map((t, i) => (
              <div key={i} style={{
                fontFamily: FONT_FAMILY, fontSize: 13, padding: '8px 14px', borderRadius: 10,
                background: COLORS.primaryBg, color: COLORS.primary, fontWeight: 600,
              }}>{t}</div>
            ))}
          </div>
        )}
        {layout === 'writing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>
              [조건] 관계대명사 who를 사용하여 아래 두 문장을 한 문장으로 결합하시오.
            </div>
            <div style={{
              fontFamily: FONT_FAMILY, fontSize: 13, padding: 12, borderRadius: 10,
              background: COLORS.bg, color: COLORS.textMuted, border: `1px dashed ${COLORS.border}`,
            }}>답안 작성 영역...</div>
          </div>
        )}
        {layout === 'vocab' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>
              다음 밑줄 친 단어의 문맥 속 의미와 가장 가까운 것은?
            </div>
            {['① 포기하다', '② 극복하다 ✓', '③ 회피하다', '④ 축소하다'].map((t, i) => (
              <div key={i} style={{
                fontFamily: FONT_FAMILY, fontSize: 13, padding: '5px 12px', borderRadius: 8,
                background: i === 1 ? 'rgba(16,185,129,0.08)' : 'transparent',
                color: i === 1 ? COLORS.emerald : COLORS.textSecondary, fontWeight: i === 1 ? 600 : 400,
              }}>{t}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
