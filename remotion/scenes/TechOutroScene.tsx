import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, TECH_STACK } from '../utils/constants';
import { fadeIn, fadeOut, popScale, pulseGlow, slideLeft, slideRight, slideUp } from '../utils/animations';
import { Background } from '../components/Background';

const STATS = [
  { value: '37+', label: '데이터 모델', direction: 'left' as const },
  { value: '19가지', label: 'AI 문제 유형', direction: 'right' as const },
  { value: '4개', label: '사용자 포털', direction: 'top' as const },
  { value: '실시간', label: '학습 분석', direction: 'bottom' as const },
];

// Floating particles
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  x: (i * 137.5) % 100, // golden ratio spread
  y: (i * 73.3) % 100,
  size: 2 + (i % 3) * 1.5,
  speed: 0.3 + (i % 4) * 0.15,
  delay: i * 3,
}));

const TechOutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Beat boundaries (custom: 100 frames each for 10s = 300 frames)
  const BLEN = 100;
  const beatIndex = Math.floor(frame / BLEN);

  // ─── BEAT 0: Tech stack badges ───
  const beat0Active = beatIndex === 0;
  const beat0Opacity = beat0Active
    ? fadeIn(frame, 0, 5) * (frame >= BLEN - 6 ? fadeOut(frame, BLEN - 6, 6) : 1)
    : 0;

  // ─── BEAT 1: Stats diamond ───
  const beat1Active = beatIndex === 1;
  const beat1Opacity = beat1Active
    ? fadeIn(frame, BLEN, 5) * (frame >= BLEN * 2 - 6 ? fadeOut(frame, BLEN * 2 - 6, 6) : 1)
    : 0;

  // ─── BEAT 2: Logo + tagline + fade to black ───
  const beat2Active = beatIndex >= 2;
  const beat2Opacity = beat2Active ? fadeIn(frame, BLEN * 2, 8) : 0;
  const finalFade = frame >= 300 - 15 ? fadeOut(frame, 300 - 15, 15) : 1;
  const glowIntensity = pulseGlow(frame, fps);

  return (
    <AbsoluteFill>
      <Background variant="brand" />

      {/* ─── BEAT 0: Tech stack badges in two rows ─── */}
      {beat0Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            opacity: beat0Opacity,
          }}
        >
          {/* Title */}
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 18,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: 6,
              textTransform: 'uppercase',
              marginBottom: 20,
              opacity: fadeIn(frame, 3, 5),
            }}
          >
            TECH STACK
          </div>

          {/* Row 1 */}
          <div style={{ display: 'flex', gap: 16 }}>
            {TECH_STACK.slice(0, 4).map((tech, i) => {
              const s = popScale(frame, fps, 5 + i * 2);
              return (
                <div
                  key={i}
                  style={{
                    padding: '16px 28px',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderLeft: `3px solid ${tech.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transform: `scale(${s})`,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: tech.color,
                      boxShadow: `0 0 12px ${tech.color}60`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONT_FAMILY,
                      fontSize: 18,
                      fontWeight: 600,
                      color: COLORS.white,
                    }}
                  >
                    {tech.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Row 2 */}
          <div style={{ display: 'flex', gap: 16 }}>
            {TECH_STACK.slice(4).map((tech, i) => {
              const s = popScale(frame, fps, 10 + i * 2);
              return (
                <div
                  key={i}
                  style={{
                    padding: '16px 28px',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderLeft: `3px solid ${tech.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transform: `scale(${s})`,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: tech.color,
                      boxShadow: `0 0 12px ${tech.color}60`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONT_FAMILY,
                      fontSize: 18,
                      fontWeight: 600,
                      color: COLORS.white,
                    }}
                  >
                    {tech.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Decorative line */}
          <div
            style={{
              width: interpolate(frame, [15, 40], [0, 600], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.3), transparent)',
              marginTop: 20,
            }}
          />
        </div>
      )}

      {/* ─── BEAT 1: Stats flying in from edges, diamond layout ─── */}
      {beat1Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: beat1Opacity,
          }}
        >
          {/* Center glow */}
          <div
            style={{
              position: 'absolute',
              width: 300,
              height: 300,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
              opacity: fadeIn(frame, BLEN + 15, 10),
            }}
          />

          {STATS.map((stat, i) => {
            const delay = BLEN + 3;
            // Diamond positions: left, right, top, bottom
            const positions = [
              { x: -340, y: 0 },   // left
              { x: 340, y: 0 },    // right
              { x: 0, y: -220 },   // top
              { x: 0, y: 220 },    // bottom
            ];
            const pos = positions[i];

            // Fly in from further out
            const flyProgress = spring({
              frame: frame - delay,
              fps,
              config: { damping: 14, stiffness: 160, mass: 0.7 },
            });
            const startMultiplier = 3;
            const currentX = interpolate(flyProgress, [0, 1], [pos.x * startMultiplier, pos.x]);
            const currentY = interpolate(flyProgress, [0, 1], [pos.y * startMultiplier, pos.y]);
            const itemOpacity = fadeIn(frame, delay, 8);

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${currentX}px)`,
                  top: `calc(50% + ${currentY}px)`,
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  opacity: itemOpacity,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: 48,
                    fontWeight: 900,
                    color: COLORS.white,
                    textShadow: '0 0 20px rgba(59,130,246,0.3)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {stat.value}
                </span>
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: 18,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  {stat.label}
                </span>
              </div>
            );
          })}

          {/* Connecting lines between stats */}
          <svg
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              opacity: fadeIn(frame, BLEN + 20, 15) * 0.2,
            }}
          >
            {/* Diamond outline */}
            <polygon
              points="960,320 1300,540 960,760 620,540"
              fill="none"
              stroke={COLORS.primaryLight}
              strokeWidth={1}
              strokeDasharray="8 6"
            />
          </svg>
        </div>
      )}

      {/* ─── BEAT 2: Final logo + tagline ─── */}
      {beat2Active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: beat2Opacity * finalFade,
          }}
        >
          {/* Floating particles */}
          {PARTICLES.map((p, i) => {
            const particleOpacity = fadeIn(frame, BLEN * 2 + p.delay, 10) * 0.4;
            const yOffset = Math.sin((frame + p.delay) * p.speed * 0.05) * 20;
            const xOffset = Math.cos((frame + p.delay * 2) * p.speed * 0.03) * 15;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.size,
                  borderRadius: '50%',
                  background: COLORS.primaryLight,
                  opacity: particleOpacity,
                  transform: `translate(${xOffset}px, ${yOffset}px)`,
                }}
              />
            );
          })}

          {/* Blue glow behind logo */}
          <div
            style={{
              position: 'absolute',
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(59,130,246,${0.2 * glowIntensity}) 0%, rgba(59,130,246,${0.05 * glowIntensity}) 50%, transparent 70%)`,
            }}
          />

          {/* NARA logo large */}
          <div
            style={{
              transform: `scale(${popScale(frame, fps, BLEN * 2 + 5)})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 120,
                fontWeight: 900,
                color: COLORS.white,
                letterSpacing: '-0.03em',
                textShadow: `0 0 60px rgba(59,130,246,${0.5 * glowIntensity}), 0 0 120px rgba(59,130,246,${0.2 * glowIntensity})`,
              }}
            >
              NARA
            </span>
            <div
              style={{
                width: interpolate(frame, [BLEN * 2 + 10, BLEN * 2 + 30], [0, 160], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                height: 2,
                background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.6), transparent)',
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              marginTop: 32,
              opacity: fadeIn(frame, BLEN * 2 + 20, 12),
              transform: `translateY(${interpolate(
                frame,
                [BLEN * 2 + 20, BLEN * 2 + 35],
                [15, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              )}px)`,
            }}
          >
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 30,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.7)',
                letterSpacing: '0.08em',
              }}
            >
              학원 운영의 미래를 경험하세요
            </span>
          </div>

          {/* Subtle ERP badge */}
          <div
            style={{
              marginTop: 24,
              padding: '6px 20px',
              borderRadius: 20,
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.2)',
              opacity: fadeIn(frame, BLEN * 2 + 30, 10),
            }}
          >
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.primaryLight,
                letterSpacing: 4,
              }}
            >
              AI-POWERED ERP
            </span>
          </div>
        </div>
      )}

      {/* Fade to black overlay at the very end */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: frame >= 285 ? interpolate(frame, [285, 300], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0,
          zIndex: 100,
        }}
      />
    </AbsoluteFill>
  );
};

export default TechOutroScene;
