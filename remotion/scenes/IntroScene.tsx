import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT } from '../utils/constants';
import { fadeIn, fadeOut, popScale, pulseGlow, slideUp, hookScale } from '../utils/animations';
import { Background } from '../components/Background';

const ROLES = [
  { icon: '👔', label: '원장', desc: '학원 경영 전체 관리', color: COLORS.primary, bg: 'rgba(59,130,246,0.1)' },
  { icon: '📚', label: '강사', desc: 'AI 문제 제작 & 수업', color: COLORS.emerald, bg: 'rgba(16,185,129,0.1)' },
  { icon: '🎓', label: '학생', desc: '모바일 학습 & 성장', color: COLORS.purple, bg: 'rgba(139,92,246,0.1)' },
  { icon: '👨‍👩‍👧', label: '학부모', desc: '실시간 학습 현황', color: COLORS.amber, bg: 'rgba(245,158,11,0.1)' },
];

const STATS = [
  { value: '30+', label: '기능' },
  { value: '4개', label: '포털' },
  { value: 'AI', label: '엔진' },
];

const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Beat boundaries
  const beat0 = frame < BEAT;
  const beat1 = frame >= BEAT && frame < BEAT * 2;
  const beat2 = frame >= BEAT * 2;

  // ─── BEAT 0: Logo burst + tagline ───
  const logoScale0 = beat0
    ? spring({ frame, fps, config: { damping: 8, stiffness: 180, mass: 0.6 } })
    : 1;
  const glowIntensity = pulseGlow(frame, fps);
  const taglineOpacity = fadeIn(frame, 10, 8);

  // Logo transition: shrink to top-left in beat 1
  const logoScale1 = beat1
    ? interpolate(frame, [BEAT, BEAT + 15], [1, 0.4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : beat2 ? 0.4 : 1;
  const logoX = beat1 || beat2
    ? interpolate(frame, [BEAT, BEAT + 15], [0, -740], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;
  const logoY = beat1 || beat2
    ? interpolate(frame, [BEAT, BEAT + 15], [0, -400], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  // Beat 0 content fade out at transition
  const beat0Fade = frame >= BEAT - 6 ? fadeOut(frame, BEAT - 6, 6) : 1;

  // ─── BEAT 1: Role cards ───
  const cardsOpacity = beat1 ? fadeIn(frame, BEAT, 5) : beat2 ? 1 : 0;
  const cardsScale = beat1
    ? spring({ frame: frame - BEAT, fps, config: { damping: 12, stiffness: 200, mass: 0.5 } })
    : beat2 ? 1 : 0;
  const beat1Fade = frame >= BEAT * 2 - 6 ? fadeOut(frame, BEAT * 2 - 6, 6) : 1;

  // ─── BEAT 2: Stats pop ───
  const beat2Opacity = beat2 ? fadeIn(frame, BEAT * 2, 5) : 0;
  const finalFade = frame >= 240 - 15 ? fadeOut(frame, 240 - 15, 15) : 1;

  // Background transition: dark -> white at end
  const bgBrightness = beat2
    ? interpolate(frame, [BEAT * 2, 240 - 15, 240], [0, 0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  return (
    <AbsoluteFill>
      <Background variant="brand" />

      {/* White overlay for fade-to-white */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: COLORS.white,
          opacity: bgBrightness,
          zIndex: 100,
        }}
      />

      {/* ─── Logo (persists across beats, moves in beat 1) ─── */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${logoX}px, ${logoY}px) scale(${beat0 ? logoScale0 : logoScale1})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          zIndex: 10,
        }}
      >
        {/* Glow ring */}
        <div
          style={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(59,130,246,${0.3 * glowIntensity}) 0%, transparent 70%)`,
            top: -60,
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: beat0 ? 1 : 0,
          }}
        />
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 80,
            fontWeight: 900,
            color: COLORS.white,
            letterSpacing: '-0.03em',
            textShadow: `0 0 40px rgba(59,130,246,${0.5 * glowIntensity}), 0 0 80px rgba(59,130,246,${0.25 * glowIntensity})`,
          }}
        >
          NARA
        </span>
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.primaryLight,
            letterSpacing: 12,
            opacity: fadeIn(frame, 5, 6),
          }}
        >
          ERP
        </span>
      </div>

      {/* ─── BEAT 0: Tagline ─── */}
      {beat0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 260,
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: taglineOpacity * beat0Fade,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 28,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
            }}
          >
            AI 기반 영어학원 통합 관리 플랫폼
          </div>
        </div>
      )}

      {/* ─── BEAT 1: 4 Role Cards ─── */}
      {(beat1 || beat2) && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${cardsScale})`,
            display: 'flex',
            gap: 24,
            opacity: cardsOpacity * (beat1 ? beat1Fade : 0),
          }}
        >
          {ROLES.map((role, i) => (
            <div
              key={i}
              style={{
                width: 210,
                padding: '28px 20px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.07)',
                backdropFilter: 'blur(20px)',
                border: `1px solid rgba(255,255,255,0.1)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                transform: `scale(${popScale(frame, fps, BEAT + 2)})`,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: role.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                {role.icon}
              </div>
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 22,
                  fontWeight: 800,
                  color: role.color,
                }}
              >
                {role.label}
              </span>
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 14,
                  fontWeight: 400,
                  color: 'rgba(255,255,255,0.6)',
                  textAlign: 'center',
                }}
              >
                {role.desc}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ─── BEAT 2: Three big stats ─── */}
      {beat2 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            gap: 80,
            opacity: beat2Opacity * finalFade,
          }}
        >
          {STATS.map((stat, i) => {
            const s = popScale(frame, fps, BEAT * 2 + i * 3);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  transform: `scale(${s})`,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: 72,
                    fontWeight: 900,
                    color: COLORS.white,
                    letterSpacing: '-0.03em',
                    textShadow: '0 0 30px rgba(59,130,246,0.4)',
                  }}
                >
                  {stat.value}
                </span>
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: 22,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.7)',
                    letterSpacing: '0.1em',
                  }}
                >
                  {stat.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

export default IntroScene;
