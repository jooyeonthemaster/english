import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT, NAV_ITEMS } from '../utils/constants';
import {
  fadeIn,
  fadeOut,
  popScale,
  hookScale,
  slideUp,
  slideLeft,
  slideRight,
  stagger,
  countUp,
  zoomIn,
} from '../utils/animations';
import { Background } from '../components/Background';

const PORTALS = [
  { icon: '👔', label: '원장 포털', desc: '경영 대시보드 & 전체 관리', color: COLORS.primary },
  { icon: '📚', label: '강사 포털', desc: 'AI 문제 제작 & 수업 운영', color: COLORS.emerald },
  { icon: '🎓', label: '학생 앱', desc: '모바일 학습 & 게이미피케이션', color: COLORS.purple },
  { icon: '👨‍👩‍👧', label: '학부모 앱', desc: '학습 현황 & 수납 확인', color: COLORS.amber },
];

const MINI_SCREENS = [
  { label: '대시보드', color: COLORS.primary, icon: '📊' },
  { label: '학생 관리', color: COLORS.emerald, icon: '👥' },
  { label: 'AI 워크벤치', color: COLORS.purple, icon: '✨' },
  { label: '시험 관리', color: COLORS.rose, icon: '🎓' },
  { label: '학생 앱', color: COLORS.cyan, icon: '📱' },
  { label: '학부모 앱', color: COLORS.amber, icon: '👨‍👩‍👧' },
];

const OverviewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const beatIndex = Math.floor(frame / BEAT);

  // ─── BEAT 0: Hook text ───
  const beat0Active = beatIndex === 0;
  const beat0Opacity = beat0Active ? fadeIn(frame, 0, 5) * (frame >= BEAT - 5 ? fadeOut(frame, BEAT - 5, 5) : 1) : 0;
  const hookS = hookScale(frame, fps, 0);
  const subOpacity = fadeIn(frame, 12, 8);

  // ─── BEAT 1: Split screen ───
  const beat1Active = beatIndex === 1;
  const beat1Opacity = beat1Active ? fadeIn(frame, BEAT, 5) * (frame >= BEAT * 2 - 5 ? fadeOut(frame, BEAT * 2 - 5, 5) : 1) : 0;

  // ─── BEAT 2: Nav highlight ───
  const beat2Active = beatIndex === 2;
  const beat2Opacity = beat2Active ? fadeIn(frame, BEAT * 2, 5) * (frame >= BEAT * 3 - 5 ? fadeOut(frame, BEAT * 3 - 5, 5) : 1) : 0;
  const highlightIndex = beat2Active ? Math.floor((frame - BEAT * 2) / 5) : -1;
  const menuCount = beat2Active ? countUp(frame, 15, BEAT * 2 + 10, 30) : 0;

  // ─── BEAT 3: Center diagram ───
  const beat3Active = beatIndex === 3;
  const beat3Opacity = beat3Active ? fadeIn(frame, BEAT * 3, 5) * (frame >= BEAT * 4 - 5 ? fadeOut(frame, BEAT * 4 - 5, 5) : 1) : 0;
  const orbitAngle = beat3Active ? interpolate(frame, [BEAT * 3, BEAT * 4], [0, Math.PI * 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;

  // ─── BEAT 4: Montage collage ───
  const beat4Active = beatIndex >= 4;
  const beat4Opacity = beat4Active ? fadeIn(frame, BEAT * 4, 5) * (frame >= 480 - 10 ? fadeOut(frame, 480 - 10, 10) : 1) : 0;

  return (
    <AbsoluteFill>
      <Background variant="gradient" />

      {/* ─── BEAT 0: Hook ─── */}
      {beat0Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: beat0Opacity,
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 96,
              fontWeight: 900,
              color: COLORS.textPrimary,
              letterSpacing: '-0.04em',
              transform: `scale(${hookS})`,
            }}
          >
            하나의 플랫폼
          </div>
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 32,
              fontWeight: 400,
              color: COLORS.textSecondary,
              marginTop: 20,
              opacity: subOpacity,
            }}
          >
            모든 학원 운영을 하나로
          </div>
          {/* Accent line */}
          <div
            style={{
              width: interpolate(frame, [8, 30], [0, 200], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              height: 4,
              borderRadius: 2,
              background: COLORS.primary,
              marginTop: 24,
            }}
          />
        </div>
      )}

      {/* ─── BEAT 1: Split screen - Sidebar + Portal cards ─── */}
      {beat1Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            opacity: beat1Opacity,
          }}
        >
          {/* Left: Mini sidebar */}
          <div
            style={{
              width: 280,
              height: '100%',
              background: 'rgba(255,255,255,0.9)',
              borderRight: `1px solid ${COLORS.border}`,
              padding: '32px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              transform: `translateX(${slideLeft(frame, fps, BEAT)}px)`,
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 22,
                fontWeight: 800,
                color: COLORS.textPrimary,
                padding: '0 12px 20px',
              }}
            >
              NARA <span style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 3 }}>ERP</span>
            </div>
            {NAV_ITEMS.slice(0, 10).map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontFamily: FONT_FAMILY,
                  fontWeight: i === 0 ? 600 : 400,
                  color: i === 0 ? COLORS.primary : COLORS.textSecondary,
                  background: i === 0 ? 'rgba(59,130,246,0.08)' : 'transparent',
                  opacity: fadeIn(frame, BEAT + 3, 5),
                }}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Right: Portal cards 2x2 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 60,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 24,
                transform: `scale(${popScale(frame, fps, BEAT + 2)})`,
              }}
            >
              {PORTALS.map((portal, i) => (
                <div
                  key={i}
                  style={{
                    width: 320,
                    padding: '32px 28px',
                    borderRadius: 20,
                    background: COLORS.white,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                    border: `1px solid ${COLORS.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: `${portal.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                    }}
                  >
                    {portal.icon}
                  </div>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 700, color: COLORS.textPrimary }}>
                    {portal.label}
                  </span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 400, color: COLORS.textSecondary }}>
                    {portal.desc}
                  </span>
                  <div style={{ width: 40, height: 3, borderRadius: 2, background: portal.color }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── BEAT 2: Nav highlight rapid scan ─── */}
      {beat2Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: beat2Opacity,
          }}
        >
          <div
            style={{
              width: 400,
              background: COLORS.white,
              borderRadius: 24,
              padding: '24px 20px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.textMuted,
                letterSpacing: 2,
                padding: '0 12px 12px',
              }}
            >
              NAVIGATION
            </div>
            {NAV_ITEMS.map((item, i) => {
              const isHighlighted = i <= highlightIndex;
              const isActive = i === highlightIndex;
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '9px 14px',
                    borderRadius: 12,
                    fontSize: 15,
                    fontFamily: FONT_FAMILY,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? COLORS.primary : isHighlighted ? COLORS.textPrimary : COLORS.textMuted,
                    background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
                    transform: isActive ? 'scale(1.03)' : 'scale(1)',
                    transition: 'none',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && (
                    <div
                      style={{
                        marginLeft: 'auto',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: COLORS.primary,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {/* Count label */}
          <div
            style={{
              position: 'absolute',
              bottom: 180,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 48,
                fontWeight: 900,
                color: COLORS.primary,
              }}
            >
              {menuCount}개
            </span>
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 22,
                fontWeight: 500,
                color: COLORS.textSecondary,
              }}
            >
              메뉴
            </span>
          </div>
        </div>
      )}

      {/* ─── BEAT 3: Center diagram with orbiting portals ─── */}
      {beat3Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: beat3Opacity,
          }}
        >
          {/* Center NARA logo */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 30,
              background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 60px rgba(59,130,246,0.3)',
              zIndex: 10,
              transform: `scale(${popScale(frame, fps, BEAT * 3)})`,
            }}
          >
            <span style={{ fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 900, color: COLORS.white }}>
              NARA
            </span>
          </div>

          {/* Orbiting portals */}
          {PORTALS.map((portal, i) => {
            const baseAngle = (i * Math.PI * 2) / 4 + orbitAngle;
            const radius = 260;
            const x = Math.cos(baseAngle) * radius;
            const y = Math.sin(baseAngle) * radius * 0.7;
            const lineOpacity = fadeIn(frame, BEAT * 3 + 10, 10);
            const nodeScale = popScale(frame, fps, BEAT * 3 + 5);

            return (
              <React.Fragment key={i}>
                {/* Connection line */}
                <svg
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 800,
                    height: 600,
                    overflow: 'visible',
                    opacity: lineOpacity,
                    zIndex: 1,
                  }}
                >
                  <line
                    x1={400}
                    y1={300}
                    x2={400 + x}
                    y2={300 + y}
                    stroke={portal.color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    opacity={0.5}
                  />
                  {/* Arrow head */}
                  <circle cx={400 + x * 0.5} cy={300 + y * 0.5} r={4} fill={portal.color} opacity={0.7} />
                </svg>

                {/* Portal node */}
                <div
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: `translate(-50%, -50%) scale(${nodeScale})`,
                    width: 150,
                    padding: '18px 14px',
                    borderRadius: 18,
                    background: COLORS.white,
                    boxShadow: `0 4px 20px ${portal.color}20`,
                    border: `2px solid ${portal.color}30`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    zIndex: 5,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{portal.icon}</span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                    {portal.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}

          {/* Data flow label */}
          <div
            style={{
              position: 'absolute',
              bottom: 120,
              left: '50%',
              transform: 'translateX(-50%)',
              fontFamily: FONT_FAMILY,
              fontSize: 18,
              fontWeight: 500,
              color: COLORS.textSecondary,
              opacity: fadeIn(frame, BEAT * 3 + 20, 10),
            }}
          >
            실시간 데이터 동기화
          </div>
        </div>
      )}

      {/* ─── BEAT 4: Montage collage ─── */}
      {beat4Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: beat4Opacity,
          }}
        >
          {MINI_SCREENS.map((screen, i) => {
            const delay = BEAT * 4 + i * 9; // ~0.3s apart
            const screenScale = popScale(frame, fps, delay);
            const screenOpacity = fadeIn(frame, delay, 5);
            // Fan layout: 3 top, 3 bottom
            const row = i < 3 ? 0 : 1;
            const col = i % 3;
            const xPos = (col - 1) * 360;
            const yPos = (row - 0.5) * 300;
            // Slight rotation for fan effect
            const rotation = interpolate(i, [0, 5], [-6, 6]);

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${xPos}px)`,
                  top: `calc(50% + ${yPos}px)`,
                  transform: `translate(-50%, -50%) scale(${screenScale}) rotate(${rotation}deg)`,
                  opacity: screenOpacity,
                  width: 320,
                  height: 220,
                  borderRadius: 16,
                  background: COLORS.white,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                  border: `1px solid ${COLORS.border}`,
                  overflow: 'hidden',
                  zIndex: i,
                }}
              >
                {/* Title bar */}
                <div
                  style={{
                    height: 40,
                    background: screen.color,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{screen.icon}</span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.white }}>
                    {screen.label}
                  </span>
                </div>
                {/* Mock content lines */}
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[0.85, 0.6, 0.75, 0.5].map((w, j) => (
                    <div
                      key={j}
                      style={{
                        width: `${w * 100}%`,
                        height: j === 0 ? 14 : 10,
                        borderRadius: 5,
                        background: j === 0 ? `${screen.color}20` : COLORS.bg,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

export default OverviewScene;
