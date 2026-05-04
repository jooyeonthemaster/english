import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, COLORS, FONT_FAMILY } from '../../../utils/constants';
import { beatOpacity, fadeIn, popScale, zoomIn } from '../../../utils/animations';
import { Background } from '../../../components/Background';

// ─── BEAT 14: DOCX Export ───
export const Beat14Docx: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = beatOpacity(frame, 14);
  const bf = frame - BEAT * 14;
  const buttonClicked = bf > 20;
  const docAppears = bf > 35;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Background variant="gradient" />
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        display: 'flex', alignItems: 'center', gap: 60,
      }}>
        {/* Export button */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          opacity: fadeIn(frame, BEAT * 14 + 3, 5),
        }}>
          <div style={{
            width: 100, height: 100, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: buttonClicked ? COLORS.emerald : `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`,
            boxShadow: buttonClicked ? `0 0 30px rgba(16,185,129,0.4)` : `0 8px 30px rgba(59,130,246,0.3)`,
            fontSize: 44, transition: 'all 0.3s',
            transform: `scale(${buttonClicked ? popScale(frame, fps, BEAT * 14 + 20) : 1})`,
          }}>
            {buttonClicked ? '✓' : '📥'}
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700,
            color: buttonClicked ? COLORS.emerald : COLORS.textPrimary,
          }}>
            {buttonClicked ? '내보내기 완료!' : 'DOCX 내보내기'}
          </div>
        </div>
        {/* Arrow */}
        {buttonClicked && (
          <div style={{
            fontSize: 32, color: COLORS.textMuted,
            opacity: fadeIn(frame, BEAT * 14 + 25, 5),
          }}>→</div>
        )}
        {/* Document preview */}
        {docAppears && (
          <div style={{
            width: 340, background: COLORS.white, borderRadius: 16, padding: 24,
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: `1px solid ${COLORS.border}`,
            opacity: fadeIn(frame, BEAT * 14 + 35, 6),
            transform: `scale(${zoomIn(frame, fps, BEAT * 14 + 35, 0.9)})`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 24 }}>📄</div>
              <div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                  중간고사_영어_고1.docx
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>245 KB</div>
              </div>
            </div>
            {/* Mini doc preview */}
            <div style={{ background: COLORS.bg, borderRadius: 10, padding: 14 }}>
              <div style={{ height: 6, borderRadius: 3, background: COLORS.border, width: '80%', marginBottom: 8 }} />
              <div style={{ height: 4, borderRadius: 2, background: COLORS.border, width: '60%', marginBottom: 6 }} />
              <div style={{ height: 4, borderRadius: 2, background: COLORS.border, width: '90%', marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {['①', '②', '③', '④', '⑤'].map((n, j) => (
                  <div key={j} style={{ height: 4, borderRadius: 2, background: COLORS.border, width: 30 }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
