import React from 'react';
import { COLORS, FONT_FAMILY } from '../../../utils/constants';
import { fadeIn, popScale, slideUp } from '../../../utils/animations';

// ─── Small helper: card with gradient header ───
export const FeatureCard: React.FC<{
  icon: string; title: string; value: string; gradient: string; delay: number; frame: number; fps: number;
}> = ({ icon, title, value, gradient, delay, frame, fps }) => {
  const s = popScale(frame, fps, delay);
  const o = fadeIn(frame, delay, 5);
  const y = slideUp(frame, fps, delay);
  return (
    <div style={{
      width: 220, borderRadius: 16, overflow: 'hidden', background: COLORS.white,
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)', transform: `translateY(${y}px) scale(${s})`, opacity: o,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ height: 6, background: gradient }} />
      <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 28 }}>{icon}</span>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>{title}</span>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 500, color: COLORS.textSecondary }}>{value}</span>
      </div>
    </div>
  );
};
