import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONT_FAMILY } from '../utils/constants';
import { fadeIn, slideUp, popScale } from '../utils/animations';

export const SectionTitle: React.FC<{
  title: string;
  subtitle?: string;
  icon?: string;
  accent?: string;
  align?: 'left' | 'center';
}> = ({ title, subtitle, icon, accent = COLORS.primary, align = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = fadeIn(frame, 0, 12);
  const y = slideUp(frame, fps, 0);
  const iconScale = popScale(frame, fps, 5);
  const subtitleOpacity = fadeIn(frame, 8, 15);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: 12,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      {/* Accent line + icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {icon && (
          <div
            style={{
              fontSize: 40,
              transform: `scale(${iconScale})`,
              filter: 'drop-shadow(0 2px 8px rgba(59,130,246,0.3))',
            }}
          >
            {icon}
          </div>
        )}
        <div
          style={{
            width: 48,
            height: 4,
            borderRadius: 2,
            background: accent,
          }}
        />
      </div>

      {/* Title */}
      <h2
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 52,
          fontWeight: 800,
          color: COLORS.textPrimary,
          margin: 0,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>

      {/* Subtitle */}
      {subtitle && (
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 22,
            fontWeight: 400,
            color: COLORS.textSecondary,
            margin: 0,
            opacity: subtitleOpacity,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};
