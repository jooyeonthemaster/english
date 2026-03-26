import React from 'react';
import { useCurrentFrame } from 'remotion';
import { COLORS, VIDEO_WIDTH, VIDEO_HEIGHT } from '../utils/constants';

export const Background: React.FC<{
  variant?: 'light' | 'dark' | 'gradient' | 'brand';
}> = ({ variant = 'light' }) => {
  const frame = useCurrentFrame();

  const bgMap = {
    light: COLORS.bg,
    dark: '#0F172A',
    gradient: '',
    brand: '',
  };

  if (variant === 'gradient' || variant === 'brand') {
    return (
      <div
        style={{
          position: 'absolute',
          width: VIDEO_WIDTH,
          height: VIDEO_HEIGHT,
          background:
            variant === 'brand'
              ? 'linear-gradient(135deg, #1E3A5F 0%, #0F172A 40%, #1E293B 100%)'
              : 'linear-gradient(160deg, #F8FAFC 0%, #EFF6FF 40%, #F0F9FF 100%)',
        }}
      >
        {/* Animated orbs */}
        <div
          style={{
            position: 'absolute',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background:
              variant === 'brand'
                ? 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
            top: -100 + Math.sin(frame / 60) * 20,
            right: -100 + Math.cos(frame / 80) * 15,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background:
              variant === 'brand'
                ? 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)',
            bottom: -50 + Math.cos(frame / 70) * 15,
            left: -50 + Math.sin(frame / 90) * 20,
          }}
        />
        {/* Grid pattern */}
        {variant === 'brand' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        background: bgMap[variant],
      }}
    />
  );
};
