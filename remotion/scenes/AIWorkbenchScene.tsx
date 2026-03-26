import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT, QUESTION_TYPES } from '../utils/constants';
import {
  fadeIn, fadeOut, beatOpacity, slideUp, slideLeft, slideRight,
  popScale, countUp, stagger, typewriter, progressBar, pulseGlow,
  zoomIn, hookScale, drawLine, wipeIn, getBeatInfo, crossfade,
} from '../utils/animations';
import { AppShell, Badge } from '../components/MockUI';
import { Background } from '../components/Background';

// ─── Sparkle particles for hook ───
const Sparkle: React.FC<{ x: number; y: number; delay: number; frame: number; fps: number }> = ({
  x, y, delay, frame, fps,
}) => {
  const s = popScale(frame, fps, delay);
  const drift = Math.sin((frame - delay) / 8) * 6;
  const opacity = fadeIn(frame, delay, 4) * (frame > delay + 50 ? fadeOut(frame, delay + 50, 10) : 1);
  return (
    <div
      style={{
        position: 'absolute',
        left: x + drift,
        top: y - (frame - delay) * 0.5,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: COLORS.primaryLight,
        boxShadow: `0 0 12px ${COLORS.primary}, 0 0 24px rgba(59,130,246,0.4)`,
        transform: `scale(${s})`,
        opacity,
      }}
    />
  );
};

// ─── Small helper: card with gradient header ───
const FeatureCard: React.FC<{
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

// ─── Quick montage question card ───
const QuestionTypeCard: React.FC<{
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

const AIWorkbenchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { currentBeat, beatFrame } = getBeatInfo(frame, BEAT);

  // ─── BEAT 0: HOOK - "19가지 AI 문제 유형" ───
  const renderBeat0 = () => {
    const numScale = hookScale(frame, fps, 5);
    const numOpacity = fadeIn(frame, 0, 4);
    const glow = pulseGlow(frame, fps);
    const textOpacity = fadeIn(frame, 20, 6);
    const textY = slideUp(frame, fps, 20);
    const exitOpacity = frame > 78 ? fadeOut(frame, 78, 10) : 1;

    const sparkles = [
      { x: 860, y: 380, delay: 8 }, { x: 1060, y: 360, delay: 12 },
      { x: 900, y: 480, delay: 16 }, { x: 1020, y: 500, delay: 10 },
      { x: 840, y: 440, delay: 20 }, { x: 1080, y: 420, delay: 14 },
      { x: 920, y: 340, delay: 22 }, { x: 1000, y: 540, delay: 18 },
    ];

    return (
      <AbsoluteFill style={{ opacity: exitOpacity }}>
        <Background variant="brand" />
        {sparkles.map((sp, i) => (
          <Sparkle key={i} x={sp.x} y={sp.y} delay={sp.delay} frame={frame} fps={fps} />
        ))}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 160, fontWeight: 900, color: COLORS.white,
            letterSpacing: '-0.04em', transform: `scale(${numScale})`, opacity: numOpacity,
            textShadow: `0 0 60px rgba(59,130,246,${0.6 * glow}), 0 0 120px rgba(59,130,246,${0.3 * glow})`,
          }}>
            19
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 36, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
            letterSpacing: '0.05em', opacity: textOpacity, transform: `translateY(${textY}px)`,
          }}>
            가지 AI 문제 유형
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 1: Workbench hub with 3 feature cards ───
  const renderBeat1 = () => {
    const o = beatOpacity(frame, 1);
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 24, fontWeight: 800, color: COLORS.textPrimary }}>
              AI 워크벤치
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <FeatureCard icon="📄" title="지문 관리" value="156개 보유" gradient="linear-gradient(135deg, #3B82F6, #06B6D4)" delay={BEAT + 5} frame={frame} fps={fps} />
              <FeatureCard icon="🤖" title="문제 생성" value="AI 자동 생성" gradient="linear-gradient(135deg, #8B5CF6, #EC4899)" delay={BEAT + 8} frame={frame} fps={fps} />
              <FeatureCard icon="📋" title="시험 출제" value="원클릭 제작" gradient="linear-gradient(135deg, #10B981, #3B82F6)" delay={BEAT + 11} frame={frame} fps={fps} />
            </div>
            {/* Recent activity */}
            <div style={{
              background: COLORS.white, borderRadius: 16, padding: 20, border: `1px solid ${COLORS.border}`,
              opacity: fadeIn(frame, BEAT + 15, 8),
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 12 }}>
                최근 활동
              </div>
              {['고1 3월 모의고사 지문 5개 추가', 'AI 문제 32개 생성 완료', '중2 단원평가 시험지 제작'].map((t, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary, padding: '6px 0',
                  borderBottom: i < 2 ? `1px solid ${COLORS.border}` : 'none',
                  opacity: fadeIn(frame, BEAT + 18 + i * 3, 5),
                }}>
                  <span style={{ color: COLORS.primary, marginRight: 8 }}>●</span>{t}
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 2: Passage import with typewriter ───
  const renderBeat2 = () => {
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

  // ─── BEAT 3: AI Analysis ───
  const renderBeat3 = () => {
    const o = beatOpacity(frame, 3);
    const bf = frame - BEAT * 3;
    const glowBorder = pulseGlow(frame, fps);
    const analysisCards = [
      { icon: '📝', label: '핵심 어휘', value: '12개 추출', color: COLORS.primary },
      { icon: '📊', label: '난이도', value: 'B2 중급', color: COLORS.amber },
      { icon: '🔤', label: '문법 포인트', value: '5개 감지', color: COLORS.purple },
      { icon: '📐', label: '지문 구조', value: '도입-전개-결론', color: COLORS.emerald },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', gap: 20, height: '100%' }}>
            {/* Passage with glow */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
              border: `2px solid rgba(59,130,246,${0.3 + 0.3 * glowBorder})`,
              boxShadow: `0 0 20px rgba(59,130,246,${0.15 * glowBorder}), 0 0 40px rgba(59,130,246,${0.08 * glowBorder})`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>✨</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.primary }}>AI 분석 중...</span>
              </div>
              <div style={{ fontFamily: '"Georgia", serif', fontSize: 14, lineHeight: 1.8, color: COLORS.textPrimary }}>
                <span style={{ background: bf > 10 ? 'rgba(59,130,246,0.12)' : 'transparent', padding: '2px 0', transition: 'all 0.2s' }}>
                  The concept of emotional intelligence,
                </span>{' '}
                <span style={{ background: bf > 20 ? 'rgba(139,92,246,0.12)' : 'transparent', padding: '2px 0' }}>
                  first proposed by Salovey and Mayer in 1990,
                </span>{' '}
                <span style={{ background: bf > 30 ? 'rgba(16,185,129,0.12)' : 'transparent', padding: '2px 0' }}>
                  has fundamentally changed how we understand human cognition.
                </span>{' '}
                <span style={{ background: bf > 40 ? 'rgba(245,158,11,0.12)' : 'transparent', padding: '2px 0' }}>
                  Unlike traditional measures of intelligence, emotional intelligence encompasses the ability to recognize, understand, and manage our own emotions.
                </span>
              </div>
            </div>
            {/* Analysis cards */}
            <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {analysisCards.map((card, i) => (
                <div key={i} style={{
                  background: COLORS.white, borderRadius: 14, padding: '14px 16px',
                  border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12,
                  opacity: fadeIn(frame, BEAT * 3 + 8 + i * 5, 5),
                  transform: `translateX(${slideRight(frame, fps, BEAT * 3 + 8 + i * 5)}px)`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 18, background: `${card.color}15`,
                  }}>{card.icon}</div>
                  <div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{card.label}</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: card.color }}>{card.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 4: Question type selector (19 types in 3 columns) ───
  const renderBeat4 = () => {
    const o = beatOpacity(frame, 4);
    const bf = frame - BEAT * 4;
    const categories = [
      { label: '객관식 (10)', color: COLORS.primary, types: QUESTION_TYPES.filter(q => q.category === '객관식') },
      { label: '서술형 (6)', color: COLORS.purple, types: QUESTION_TYPES.filter(q => q.category === '서술형') },
      { label: '어휘 (3)', color: COLORS.emerald, types: QUESTION_TYPES.filter(q => q.category === '어휘') },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', gap: 20, height: '100%' }}>
            {/* Passage (mini) */}
            <div style={{
              width: 380, background: COLORS.white, borderRadius: 16, padding: 20,
              border: `1px solid ${COLORS.border}`, overflow: 'hidden',
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                선택된 지문
              </div>
              <div style={{ fontFamily: '"Georgia", serif', fontSize: 12, lineHeight: 1.7, color: COLORS.textSecondary }}>
                The concept of emotional intelligence, first proposed by Salovey and Mayer in 1990, has fundamentally changed how we understand human cognition...
              </div>
            </div>
            {/* Type selector */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
                문제 유형 선택
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {categories.map((cat, ci) => (
                  <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{
                      fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700, color: cat.color,
                      padding: '6px 12px', background: `${cat.color}12`, borderRadius: 8,
                      opacity: fadeIn(frame, BEAT * 4 + 3 + ci * 3, 4),
                    }}>{cat.label}</div>
                    {cat.types.map((qt, qi) => {
                      const isSelected = qt.name === '빈칸 추론';
                      const d = BEAT * 4 + 8 + ci * 2 + qi * 2;
                      return (
                        <div key={qi} style={{
                          fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: isSelected ? 700 : 500,
                          padding: '7px 12px', borderRadius: 8,
                          background: isSelected ? `${COLORS.primary}15` : COLORS.white,
                          border: isSelected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                          color: isSelected ? COLORS.primary : COLORS.textSecondary,
                          opacity: fadeIn(frame, d, 3),
                          transform: isSelected && bf > 40 ? `scale(${1 + Math.sin(bf / 6) * 0.02})` : 'none',
                        }}>{qt.name}</div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 5: AI Generation Progress ───
  const renderBeat5 = () => {
    const o = beatOpacity(frame, 5);
    const bf = frame - BEAT * 5;
    const glow = pulseGlow(frame, fps);
    const steps = [
      '지문 분석', '핵심 포인트 추출', '문제 구조 생성', '선택지 생성', '해설 작성',
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <Background variant="gradient" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
        }}>
          {/* Spinning sparkle */}
          <div style={{
            fontSize: 64, transform: `rotate(${bf * 4}deg)`,
            filter: `drop-shadow(0 0 ${20 + 10 * glow}px rgba(59,130,246,0.5))`,
          }}>✨</div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 800, color: COLORS.textPrimary,
          }}>AI 문제 생성 중...</div>
          {/* Progress steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 400 }}>
            {steps.map((step, i) => {
              const stepDone = bf > 10 + i * 12;
              const stepActive = bf > 10 + i * 12 - 12 && !stepDone;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  opacity: fadeIn(frame, BEAT * 5 + 5 + i * 4, 4),
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: stepDone ? COLORS.emerald : stepActive ? COLORS.primary : COLORS.bg,
                    color: stepDone || stepActive ? COLORS.white : COLORS.textMuted,
                    fontSize: 14, fontWeight: 700, fontFamily: FONT_FAMILY,
                    boxShadow: stepActive ? `0 0 12px rgba(59,130,246,0.4)` : 'none',
                  }}>
                    {stepDone ? '✓' : i + 1}
                  </div>
                  <span style={{
                    fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: stepDone ? 600 : 400,
                    color: stepDone ? COLORS.emerald : stepActive ? COLORS.primary : COLORS.textSecondary,
                  }}>{step}</span>
                  {stepActive && (
                    <div style={{
                      width: 60, height: 4, borderRadius: 2, background: COLORS.bg, marginLeft: 'auto',
                    }}>
                      <div style={{
                        width: `${progressBar(frame, 100, BEAT * 5 + 10 + i * 12, 12)}%`,
                        height: '100%', borderRadius: 2, background: COLORS.primary,
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 6: Generated question (MC) ───
  const renderBeat6 = () => {
    const o = beatOpacity(frame, 6);
    const bf = frame - BEAT * 6;
    const options = [
      { num: '①', text: 'the ability to control others\' emotions', correct: false },
      { num: '②', text: 'a measurement of traditional IQ', correct: false },
      { num: '③', text: 'understanding and managing emotions', correct: true },
      { num: '④', text: 'the suppression of emotional responses', correct: false },
      { num: '⑤', text: 'academic performance in school', correct: false },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', gap: 20, height: '100%' }}>
            {/* Question */}
            <div style={{ flex: 1, background: COLORS.white, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Badge text="빈칸 추론" color={COLORS.primary} bg={COLORS.primaryBg} />
                <Badge text="중급" color={COLORS.amber} bg={COLORS.amberBg} />
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 600, color: COLORS.textPrimary, lineHeight: 1.7, marginBottom: 20 }}>
                다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.
              </div>
              <div style={{
                fontFamily: '"Georgia", serif', fontSize: 14, lineHeight: 1.8, color: COLORS.textSecondary,
                padding: 16, background: COLORS.bg, borderRadius: 12, marginBottom: 20,
              }}>
                The concept of emotional intelligence encompasses __________, which goes beyond what traditional IQ tests can measure.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {options.map((opt, i) => (
                  <div key={i} style={{
                    fontFamily: FONT_FAMILY, fontSize: 14, padding: '10px 16px', borderRadius: 10,
                    background: opt.correct && bf > 30 ? 'rgba(16,185,129,0.1)' : 'transparent',
                    border: opt.correct && bf > 30 ? `2px solid ${COLORS.emerald}` : `1px solid ${COLORS.border}`,
                    color: opt.correct && bf > 30 ? COLORS.emerald : COLORS.textPrimary,
                    fontWeight: opt.correct && bf > 30 ? 700 : 400,
                    opacity: fadeIn(frame, BEAT * 6 + 8 + i * 3, 4),
                  }}>
                    <span style={{ marginRight: 8, fontWeight: 700 }}>{opt.num}</span>{opt.text}
                  </div>
                ))}
              </div>
            </div>
            {/* Explanation panel */}
            <div style={{
              width: 280, background: COLORS.white, borderRadius: 16, padding: 20,
              border: `1px solid ${COLORS.border}`,
              transform: `translateX(${slideRight(frame, fps, BEAT * 6 + 30)}px)`,
              opacity: fadeIn(frame, BEAT * 6 + 30, 6),
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.emerald, marginBottom: 12 }}>
                ✓ 정답: ③
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, lineHeight: 1.6, color: COLORS.textSecondary }}>
                지문에서 emotional intelligence가 감정을 인식하고 관리하는 능력이라고 설명하고 있으므로...
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 7: AI Explanation detail ───
  const renderBeat7 = () => {
    const o = beatOpacity(frame, 7);
    const bf = frame - BEAT * 7;
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', gap: 20 }}>
            {/* 정답 해설 */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
              border: `1px solid ${COLORS.border}`,
              opacity: fadeIn(frame, BEAT * 7 + 3, 5),
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.emerald }}>정답 해설</span>
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, lineHeight: 1.8, color: COLORS.textSecondary, marginBottom: 20 }}>
                {typewriter(
                  '정답은 ③번입니다. 지문의 핵심 내용은 emotional intelligence가 자신의 감정을 인식(recognize), 이해(understand), 관리(manage)하는 능력이라는 것입니다. 이는 전통적인 IQ 측정과 구별되는 개념으로, 빈칸에는 이 정의에 해당하는 표현이 들어가야 합니다.',
                  frame, BEAT * 7 + 8, 0.5
                )}
              </div>
              {/* 핵심 포인트 */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.primary, marginBottom: 10 }}>
                핵심 포인트
              </div>
              {['빈칸 전후 문맥 파악이 중요', 'encompasses 뒤에 오는 명사구 구조 이해', '지문 내 정의(definition) 패턴 인식'].map((point, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, padding: '4px 0',
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: fadeIn(frame, BEAT * 7 + 30 + i * 5, 5),
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.primary, flexShrink: 0 }} />
                  {point}
                </div>
              ))}
            </div>
            {/* 오답 분석 */}
            <div style={{
              width: 320, background: COLORS.white, borderRadius: 16, padding: 24,
              border: `1px solid ${COLORS.border}`,
              opacity: fadeIn(frame, BEAT * 7 + 15, 6),
              transform: `translateX(${slideRight(frame, fps, BEAT * 7 + 15)}px)`,
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.rose, marginBottom: 14 }}>
                오답 분석
              </div>
              {[
                { num: '①', reason: '타인의 감정 통제 - 지문에서 언급하지 않음' },
                { num: '②', reason: '전통적 IQ 측정 - 지문에서 이와 구별된다고 설명' },
                { num: '④', reason: '감정 억제 - manage와는 다른 개념' },
                { num: '⑤', reason: '학업 성취도 - 지문의 주제와 무관' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, padding: '8px 0',
                  borderBottom: i < 3 ? `1px solid ${COLORS.border}` : 'none',
                  opacity: fadeIn(frame, BEAT * 7 + 20 + i * 4, 4),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.rose }}>{item.num}</span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>{item.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 8: Rapid montage of 4 question types ───
  const renderBeat8 = () => {
    const o = beatOpacity(frame, 8);
    const bf = frame - BEAT * 8;
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <Background variant="gradient" />
        <QuestionTypeCard type="어법 판단" layout="mc" frame={frame} fps={fps} delay={BEAT * 8} />
        <QuestionTypeCard type="순서 배열" layout="order" frame={frame} fps={fps} delay={BEAT * 8 + 22} />
        <QuestionTypeCard type="조건부 영작" layout="writing" frame={frame} fps={fps} delay={BEAT * 8 + 44} />
        <QuestionTypeCard type="문맥 속 의미" layout="vocab" frame={frame} fps={fps} delay={BEAT * 8 + 66} />
      </AbsoluteFill>
    );
  };

  // ─── BEAT 9: 19 type tags burst ───
  const renderBeat9 = () => {
    const o = beatOpacity(frame, 9);
    const bf = frame - BEAT * 9;
    const catColors: Record<string, { bg: string; text: string }> = {
      '객관식': { bg: 'rgba(59,130,246,0.12)', text: COLORS.primary },
      '서술형': { bg: 'rgba(139,92,246,0.12)', text: COLORS.purple },
      '어휘': { bg: 'rgba(16,185,129,0.12)', text: COLORS.emerald },
    };
    // Arrange in rows: start scattered, settle into rows
    const settle = interpolate(bf, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <Background variant="brand" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexWrap: 'wrap', gap: 10, width: 700, justifyContent: 'center',
        }}>
          {QUESTION_TYPES.map((qt, i) => {
            const angle = (i / 19) * Math.PI * 2;
            const scatterX = Math.cos(angle) * 300 * (1 - settle);
            const scatterY = Math.sin(angle) * 200 * (1 - settle);
            const s = popScale(frame, fps, BEAT * 9 + i * 2);
            const cc = catColors[qt.category] || catColors['객관식'];
            return (
              <div key={i} style={{
                fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600,
                padding: '10px 18px', borderRadius: 12,
                background: cc.bg, color: cc.text,
                transform: `translate(${scatterX}px, ${scatterY}px) scale(${s})`,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
                whiteSpace: 'nowrap',
              }}>{qt.name}</div>
            );
          })}
        </div>
        {/* Category legend */}
        <div style={{
          position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 32, opacity: fadeIn(frame, BEAT * 9 + 40, 8),
        }}>
          {[
            { label: '객관식 10종', color: COLORS.primary },
            { label: '서술형 6종', color: COLORS.purple },
            { label: '어휘 3종', color: COLORS.emerald },
          ].map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{c.label}</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 10: Difficulty showcase ───
  const renderBeat10 = () => {
    const o = beatOpacity(frame, 10);
    const levels = [
      { label: '기본', pct: '60%', color: COLORS.emerald, bg: COLORS.emeraldBg, desc: '교과서 수준 기본 문제', example: '주제/요지 파악' },
      { label: '중급', pct: '30%', color: COLORS.primary, bg: COLORS.primaryBg, desc: '수능 3-4등급 수준', example: '빈칸 추론' },
      { label: '킬러', pct: '10%', color: COLORS.rose, bg: COLORS.roseBg, desc: '수능 1등급 변별력', example: '복합 문장 삽입' },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
              난이도 설정
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              {levels.map((lv, i) => (
                <div key={i} style={{
                  flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
                  border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 12,
                  opacity: fadeIn(frame, BEAT * 10 + 5 + i * 5, 5),
                  transform: `translateY(${slideUp(frame, fps, BEAT * 10 + 5 + i * 5)}px)`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge text={lv.label} color={lv.color} bg={lv.bg} />
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 900, color: lv.color }}>{lv.pct}</span>
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>{lv.desc}</div>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted, padding: '8px 12px',
                    background: COLORS.bg, borderRadius: 8,
                  }}>예: {lv.example}</div>
                  {/* Progress bar */}
                  <div style={{ height: 6, borderRadius: 3, background: COLORS.bg }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: lv.color,
                      width: `${progressBar(frame, parseInt(lv.pct), BEAT * 10 + 10 + i * 5, 20)}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 11: Batch generation ───
  const renderBeat11 = () => {
    const o = beatOpacity(frame, 11);
    const bf = frame - BEAT * 11;
    const totalGenerated = Math.min(20, Math.floor(bf / 3));
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
                20문제 한번에 생성
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.primary }}>
                {totalGenerated}/20 완료
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height: 8, borderRadius: 4, background: COLORS.bg }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.purple})`,
                width: `${progressBar(frame, 100, BEAT * 11 + 3, 55)}%`,
              }} />
            </div>
            {/* Question cards cascade */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, overflow: 'hidden', maxHeight: 340 }}>
              {Array.from({ length: 20 }).map((_, i) => {
                const visible = bf > i * 3;
                return (
                  <div key={i} style={{
                    width: 120, height: 70, borderRadius: 12, background: COLORS.white,
                    border: `1px solid ${COLORS.border}`, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    opacity: visible ? fadeIn(frame, BEAT * 11 + i * 3, 3) : 0,
                    transform: `scale(${visible ? popScale(frame, fps, BEAT * 11 + i * 3) : 0})`,
                  }}>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.primary }}>
                      Q{i + 1}
                    </div>
                    <div style={{
                      fontFamily: FONT_FAMILY, fontSize: 9, color: COLORS.textMuted,
                    }}>
                      {QUESTION_TYPES[i % QUESTION_TYPES.length].name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 12: Teacher custom prompt ───
  const renderBeat12 = () => {
    const o = beatOpacity(frame, 12);
    const bf = frame - BEAT * 12;
    const promptText = '조건: 문법 관계대명사 중점, 서술형 50% 이상, 난이도 중급-킬러 혼합, 객관식 5지선다';
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
              커스텀 출제 설정
            </div>
            {/* Teacher info */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: fadeIn(frame, BEAT * 12 + 3, 5),
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: COLORS.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: COLORS.white, fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800,
              }}>박</div>
              <div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>박선생</div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>강동고등학교 담당</div>
              </div>
              <Badge text="강동고" color={COLORS.primary} bg={COLORS.primaryBg} />
            </div>
            {/* Prompt input */}
            <div style={{
              background: COLORS.white, borderRadius: 16, padding: 20,
              border: `2px solid ${COLORS.primary}20`,
              opacity: fadeIn(frame, BEAT * 12 + 8, 5),
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8 }}>
                AI 출제 프롬프트
              </div>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 1.7, color: COLORS.textPrimary,
                padding: 16, background: COLORS.bg, borderRadius: 12, minHeight: 80,
              }}>
                {typewriter(promptText, frame, BEAT * 12 + 12, 0.7)}
                <span style={{ opacity: Math.sin(frame / 4) > 0 ? 1 : 0, color: COLORS.primary }}>|</span>
              </div>
            </div>
            {/* Generate button */}
            <div style={{
              opacity: fadeIn(frame, BEAT * 12 + 50, 5),
              transform: `scale(${popScale(frame, fps, BEAT * 12 + 50)})`,
            }}>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.white,
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.purple})`,
                padding: '14px 32px', borderRadius: 14, textAlign: 'center',
                boxShadow: `0 4px 20px rgba(59,130,246,${0.3 + 0.2 * pulseGlow(frame, fps)})`,
              }}>
                ✨ 이 설정으로 문제 생성
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 13: Generated exam preview ───
  const renderBeat13 = () => {
    const o = beatOpacity(frame, 13);
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={5}>
          <div style={{ display: 'flex', gap: 20, height: '100%' }}>
            {/* Exam paper */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: 28,
              border: `1px solid ${COLORS.border}`, overflow: 'hidden',
              opacity: fadeIn(frame, BEAT * 13 + 3, 6),
            }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: `2px solid ${COLORS.textPrimary}` }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
                  2026학년도 1학기
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 900, color: COLORS.textPrimary }}>
                  중간고사 영어 시험지
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                  고1 | 50분 | 100점 만점
                </div>
              </div>
              {/* Questions preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    opacity: fadeIn(frame, BEAT * 13 + 8 + i * 3, 4),
                  }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, minWidth: 24 }}>
                      {i + 1}.
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        height: 8, borderRadius: 4, background: COLORS.bg, width: `${70 + (i * 13) % 30}%`, marginBottom: 4,
                      }} />
                      {i < 5 && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                          {['①', '②', '③', '④', '⑤'].map((n, j) => (
                            <div key={j} style={{
                              height: 6, borderRadius: 3, background: COLORS.bg, width: 40,
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Exam info panel */}
            <div style={{
              width: 250, display: 'flex', flexDirection: 'column', gap: 12,
              opacity: fadeIn(frame, BEAT * 13 + 20, 6),
            }}>
              {[
                { label: '총 문제수', value: '20문제' },
                { label: '객관식', value: '14문제' },
                { label: '서술형', value: '6문제' },
                { label: '배점', value: '각 5점' },
                { label: '소요시간', value: '50분' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: COLORS.white, borderRadius: 12, padding: '12px 16px',
                  border: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between',
                  opacity: fadeIn(frame, BEAT * 13 + 22 + i * 3, 4),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>{item.label}</span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 14: DOCX Export ───
  const renderBeat14 = () => {
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

  // ─── BEAT 15: Recap flow diagram ───
  const renderBeat15 = () => {
    const o = beatOpacity(frame, 15);
    const bf = frame - BEAT * 15;
    const nodes = [
      { icon: '📄', label: '지문' },
      { icon: '🔍', label: 'AI 분석' },
      { icon: '🤖', label: '문제 생성' },
      { icon: '📋', label: '시험 출제' },
      { icon: '📥', label: '내보내기' },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <Background variant="brand" />
        <div style={{
          position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', alignItems: 'center', gap: 0,
        }}>
          {nodes.map((node, i) => {
            const d = BEAT * 15 + i * 6;
            const nodeOpacity = fadeIn(frame, d, 5);
            const s = popScale(frame, fps, d);
            return (
              <React.Fragment key={i}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  opacity: nodeOpacity, transform: `scale(${s})`,
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 20,
                    background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                  }}>{node.icon}</div>
                  <span style={{
                    fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
                  }}>{node.label}</span>
                </div>
                {i < nodes.length - 1 && (
                  <div style={{
                    width: 60, height: 2, background: `linear-gradient(90deg, transparent, ${COLORS.primary}, transparent)`,
                    margin: '0 8px', marginBottom: 30,
                    opacity: fadeIn(frame, d + 4, 4),
                    transform: `scaleX(${interpolate(bf, [i * 6 + 4, i * 6 + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Powered by badge */}
        <div style={{
          position: 'absolute', bottom: 140, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10,
          opacity: fadeIn(frame, BEAT * 15 + 40, 8),
        }}>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600,
            color: 'rgba(255,255,255,0.5)', letterSpacing: 1,
          }}>Powered by</div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800,
            color: COLORS.primaryLight,
            background: 'rgba(59,130,246,0.15)',
            padding: '6px 16px', borderRadius: 10,
          }}>Gemini 3.0 Flash</div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── Render by beat ───
  return (
    <AbsoluteFill>
      {currentBeat === 0 && renderBeat0()}
      {currentBeat === 1 && renderBeat1()}
      {currentBeat === 2 && renderBeat2()}
      {currentBeat === 3 && renderBeat3()}
      {currentBeat === 4 && renderBeat4()}
      {currentBeat === 5 && renderBeat5()}
      {currentBeat === 6 && renderBeat6()}
      {currentBeat === 7 && renderBeat7()}
      {currentBeat === 8 && renderBeat8()}
      {currentBeat === 9 && renderBeat9()}
      {currentBeat === 10 && renderBeat10()}
      {currentBeat === 11 && renderBeat11()}
      {currentBeat === 12 && renderBeat12()}
      {currentBeat === 13 && renderBeat13()}
      {currentBeat === 14 && renderBeat14()}
      {currentBeat === 15 && renderBeat15()}
    </AbsoluteFill>
  );
};

export default AIWorkbenchScene;
