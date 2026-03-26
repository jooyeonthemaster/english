import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONT_FAMILY, NAV_ITEMS } from '../utils/constants';
import { fadeIn, slideLeft, slideUp, popScale, stagger } from '../utils/animations';

// ─── Sidebar ───
export const Sidebar: React.FC<{ activeIndex?: number }> = ({ activeIndex = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sidebarX = slideLeft(frame, fps, 0);
  const opacity = fadeIn(frame, 0, 10);

  let currentSection = '';

  return (
    <div
      style={{
        width: 240,
        height: '100%',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(40px)',
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 12px',
        opacity,
        transform: `translateX(${sidebarX}px)`,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', marginBottom: 24 }}>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
          NARA
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color: COLORS.textMuted, letterSpacing: 2 }}>
          ERP
        </span>
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map((item, i) => {
        const showSection = item.section && item.section !== currentSection;
        if (item.section) currentSection = item.section;
        const isActive = i === activeIndex;
        const itemOpacity = fadeIn(frame, stagger(i, 5, 2), 8);

        return (
          <React.Fragment key={i}>
            {showSection && (
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: COLORS.textMuted,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  padding: '16px 12px 6px',
                  fontFamily: FONT_FAMILY,
                  opacity: itemOpacity,
                }}
              >
                {item.section}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                fontFamily: FONT_FAMILY,
                color: isActive ? COLORS.primary : COLORS.textSecondary,
                background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                opacity: itemOpacity,
                marginBottom: 1,
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── TopBar ───
export const TopBar: React.FC<{ academyName?: string }> = ({ academyName = '다른영어학원' }) => {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, 5, 10);

  return (
    <div
      style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: 'rgba(244,246,249,0.75)',
        backdropFilter: 'blur(20px)',
        opacity,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
          {academyName}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.primary,
            background: 'rgba(59,130,246,0.08)',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          원장
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: COLORS.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontSize: 11, fontWeight: 700, fontFamily: FONT_FAMILY }}>JY</span>
        </div>
      </div>
    </div>
  );
};

// ─── KPI Card ───
export const KPICard: React.FC<{
  label: string;
  value: string | number;
  delta?: string;
  color?: string;
  delay?: number;
}> = ({ label, value, delta, color = COLORS.primary, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeIn(frame, delay, 12);
  const y = slideUp(frame, fps, delay);
  const scale = popScale(frame, fps, delay);

  return (
    <div
      style={{
        background: COLORS.white,
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)',
        border: `1px solid ${COLORS.border}`,
        opacity,
        transform: `translateY(${y}px) scale(${0.9 + scale * 0.1})`,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 500, color: COLORS.textMuted, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 30, fontWeight: 800, color: COLORS.textPrimary }}>
          {value}
        </span>
        {delta && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: delta.startsWith('+') || delta.startsWith('↑') ? COLORS.emerald : COLORS.rose,
            }}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Mini Chart ───
export const MiniChart: React.FC<{
  data: { label: string; value: number }[];
  color?: string;
  delay?: number;
  height?: number;
}> = ({ data, color = COLORS.primary, delay = 0, height = 160 }) => {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, delay, 15);
  const maxVal = Math.max(...data.map((d) => d.value));

  return (
    <div
      style={{
        background: COLORS.white,
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        border: `1px solid ${COLORS.border}`,
        opacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          height,
          padding: '0 8px',
        }}
      >
        {data.map((d, i) => {
          const barProgress = fadeIn(frame, delay + i * 4, 20);
          const barHeight = (d.value / maxVal) * height * 0.85 * barProgress;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textSecondary }}>
                {d.value}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 36,
                  height: barHeight,
                  background: `linear-gradient(180deg, ${color} 0%, ${color}88 100%)`,
                  borderRadius: 6,
                  transition: 'height 0.3s',
                }}
              />
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Table Row ───
export const TableRow: React.FC<{
  cells: string[];
  isHeader?: boolean;
  delay?: number;
  highlight?: boolean;
}> = ({ cells, isHeader = false, delay = 0, highlight = false }) => {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, delay, 10);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: isHeader ? '10px 16px' : '12px 16px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: isHeader ? COLORS.bg : highlight ? 'rgba(59,130,246,0.03)' : COLORS.white,
        opacity,
        gap: 0,
      }}
    >
      {cells.map((cell, i) => (
        <span
          key={i}
          style={{
            flex: i === 0 ? 1.5 : 1,
            fontFamily: FONT_FAMILY,
            fontSize: isHeader ? 11 : 13,
            fontWeight: isHeader ? 600 : 400,
            color: isHeader ? COLORS.textMuted : COLORS.textPrimary,
            textTransform: isHeader ? 'uppercase' : 'none',
            letterSpacing: isHeader ? 0.5 : 0,
          }}
        >
          {cell}
        </span>
      ))}
    </div>
  );
};

// ─── Badge ───
export const Badge: React.FC<{
  text: string;
  color?: string;
  bg?: string;
}> = ({ text, color = COLORS.primary, bg = COLORS.primaryBg }) => (
  <span
    style={{
      fontFamily: FONT_FAMILY,
      fontSize: 11,
      fontWeight: 600,
      color,
      background: bg,
      padding: '3px 10px',
      borderRadius: 6,
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </span>
);

// ─── App Layout Shell (Sidebar + TopBar + Content) ───
export const AppShell: React.FC<{
  children: React.ReactNode;
  activeNav?: number;
}> = ({ children, activeNav = 0 }) => {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        overflow: 'hidden',
      }}
    >
      <Sidebar activeIndex={activeNav} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar />
        <div style={{ flex: 1, padding: 28, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ─── Phone Frame (for mobile app demos) ───
export const PhoneFrame: React.FC<{
  children: React.ReactNode;
  delay?: number;
}> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeIn(frame, delay, 15);
  const y = slideUp(frame, fps, delay);

  return (
    <div
      style={{
        width: 375,
        height: 740,
        borderRadius: 40,
        background: '#000',
        padding: 8,
        boxShadow: '0 25px 50px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)',
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      {/* Notch */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 140,
          height: 28,
          background: '#000',
          borderRadius: '0 0 18px 18px',
          zIndex: 10,
        }}
      />
      {/* Screen */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 32,
          background: COLORS.white,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {children}
      </div>
    </div>
  );
};
