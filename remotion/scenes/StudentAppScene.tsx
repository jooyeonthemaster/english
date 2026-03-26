import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT } from '../utils/constants';
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
  progressBar,
  pulseGlow,
  zoomIn,
} from '../utils/animations';
import { Background } from '../components/Background';

// Phone frame inline (to avoid import issues with slideInFromBottom)
const Phone: React.FC<{ children: React.ReactNode; opacity?: number; scale?: number }> = ({ children, opacity = 1, scale = 1 }) => (
  <div style={{
    width: 375, height: 740, borderRadius: 40, background: '#000', padding: 8,
    boxShadow: '0 25px 50px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)',
    opacity, transform: `scale(${scale})`, position: 'relative',
  }}>
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 140, height: 28, background: '#000', borderRadius: '0 0 18px 18px', zIndex: 10 }} />
    <div style={{ width: '100%', height: '100%', borderRadius: 32, background: COLORS.white, overflow: 'hidden', position: 'relative' }}>
      {children}
    </div>
  </div>
);

const PhoneStatusBar: React.FC = () => (
  <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 20px 4px', background: 'transparent' }}>
    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>9:41</span>
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textPrimary }}>●●●●</span>
    </div>
  </div>
);

const VOCAB_LISTS = [
  { title: '중2 교과 Unit 3', words: 40, score: 85, color: COLORS.primary },
  { title: '중2 교과 Unit 4', words: 35, score: 72, color: COLORS.amber },
  { title: '수능 필수 Day 1', words: 50, score: 90, color: COLORS.emerald },
  { title: '중2 문법 어휘', words: 30, score: null, color: COLORS.purple },
];

const WRONG_VOCAB = [
  { en: 'resilient', ko: '회복력 있는', miss: 3 },
  { en: 'elaborate', ko: '정교한', miss: 2 },
  { en: 'subsequent', ko: '그 다음의', miss: 2 },
];

const WRONG_QUESTIONS = [
  { q: 'The author implies that...', correct: '③ 기술 발전이 사회에 미치는 영향' },
  { q: 'Which best describes...', correct: '② 변화에 적응하는 과정' },
];

const ACHIEVEMENTS = [
  { icon: '🔥', label: '연속 출석 7일', unlocked: true },
  { icon: '⭐', label: '첫 만점', unlocked: true },
  { icon: '📚', label: '단어 500개', unlocked: true },
  { icon: '🏆', label: '월간 1등', unlocked: false },
  { icon: '💎', label: '올킬 달성', unlocked: false },
];

const StudentAppScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beatIndex = Math.floor(frame / BEAT);

  const bv = (b: number) => {
    if (beatIndex !== b) return 0;
    return fadeIn(frame, b * BEAT, 4) * (frame >= (b + 1) * BEAT - 4 ? fadeOut(frame, (b + 1) * BEAT - 4, 4) : 1);
  };

  // Last beat extends to end
  const bvLast = (b: number, endFrame: number) => {
    if (beatIndex < b) return 0;
    return fadeIn(frame, b * BEAT, 4) * (frame >= endFrame - 8 ? fadeOut(frame, endFrame - 8, 8) : 1);
  };

  return (
    <AbsoluteFill>
      <Background variant="gradient" />

      {/* ═══ BEAT 0: HOOK ═══ */}
      {beatIndex === 0 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(0) }}>
          <Background variant="brand" />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 80, marginBottom: 16, transform: `scale(${popScale(frame, fps, 0)})` }}>🚀</span>
            <div style={{
              fontFamily: FONT_FAMILY, fontSize: 80, fontWeight: 900, color: COLORS.white,
              letterSpacing: '-0.04em', transform: `scale(${hookScale(frame, fps, 2)})`,
              textShadow: '0 0 40px rgba(59,130,246,0.4)',
            }}>
              게이미피케이션으로
            </div>
            <div style={{
              fontFamily: FONT_FAMILY, fontSize: 80, fontWeight: 900,
              background: 'linear-gradient(90deg, #3B82F6, #10B981)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.04em', transform: `scale(${hookScale(frame, fps, 5)})`,
            }}>
              학습 동기 UP
            </div>
          </div>
        </div>
      )}

      {/* ═══ BEAT 1: Login Screen ═══ */}
      {beatIndex === 1 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(1),
        }}>
          <Phone opacity={1} scale={popScale(frame, fps, BEAT)}>
            <PhoneStatusBar />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', padding: 32 }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 900, color: COLORS.primary, marginBottom: 4 }}>NARA</div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginBottom: 40, letterSpacing: 3 }}>STUDENT</div>
              <div style={{ width: '100%', marginBottom: 12 }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>학생 코드</div>
                <div style={{
                  height: 44, borderRadius: 12, border: `1.5px solid ${COLORS.primary}`, background: COLORS.primaryBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 700, color: COLORS.primary, letterSpacing: 6 }}>ABCD12</span>
                </div>
              </div>
              <div style={{
                width: '100%', height: 44, borderRadius: 12, background: COLORS.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8,
                opacity: fadeIn(frame, BEAT + 15, 5),
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.white }}>로그인</span>
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 2: Student Home Dashboard ═══ */}
      {beatIndex === 2 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(2),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px', overflow: 'hidden' }}>
              {/* Welcome */}
              <div style={{ marginBottom: 16, opacity: fadeIn(frame, 2 * BEAT + 3, 5) }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
                  김민서 학생, 안녕! 🔥
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>오늘도 화이팅!</div>
              </div>
              {/* Level & XP */}
              <div style={{
                background: 'linear-gradient(135deg, #1E3A5F 0%, #0F172A 100%)', borderRadius: 16, padding: 18, marginBottom: 14,
                opacity: fadeIn(frame, 2 * BEAT + 6, 5),
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      padding: '4px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.3)',
                      fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 800, color: COLORS.primaryLight,
                    }}>
                      Lv.12
                    </div>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>영어 마스터</span>
                  </div>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>2450/2600 XP</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${progressBar(frame, 94, 2 * BEAT + 8, 20)}%`,
                    height: '100%', borderRadius: 4,
                    background: 'linear-gradient(90deg, #3B82F6, #10B981)',
                  }} />
                </div>
              </div>
              {/* Quick stats */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, opacity: fadeIn(frame, 2 * BEAT + 12, 5) }}>
                {[
                  { icon: '🔥', label: '연속 출석', value: '12일' },
                  { icon: '📝', label: '이번 주', value: '5회' },
                ].map((s, i) => (
                  <div key={i} style={{
                    flex: 1, background: COLORS.bg, borderRadius: 12, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{s.label}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>{s.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 3: Quick Actions ═══ */}
      {beatIndex === 3 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(3),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14 }}>빠른 학습</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { icon: '📖', label: '단어 시험', color: COLORS.primary, bg: COLORS.primaryBg },
                  { icon: '📝', label: '시험 보기', color: COLORS.emerald, bg: COLORS.emeraldBg },
                  { icon: '❌', label: '오답 노트', color: COLORS.rose, bg: COLORS.roseBg },
                  { icon: '📊', label: '내 성적', color: COLORS.purple, bg: COLORS.purpleBg },
                ].map((action, i) => {
                  const d = stagger(i, 3 * BEAT + 3, 3);
                  return (
                    <div key={i} style={{
                      background: action.bg, borderRadius: 14, padding: '18px 16px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      opacity: fadeIn(frame, d, 4), transform: `scale(${popScale(frame, fps, d)})`,
                    }}>
                      <span style={{ fontSize: 28 }}>{action.icon}</span>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: action.color }}>{action.label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Upcoming */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 10, opacity: fadeIn(frame, 3 * BEAT + 15, 5) }}>다가오는 일정</div>
              {[
                { title: '중2 Unit 3 단어시험', due: '오늘', color: COLORS.rose },
                { title: '3월 모의고사', due: '3/28', color: COLORS.primary },
                { title: 'Unit 4 과제', due: '3/30', color: COLORS.amber },
              ].map((item, i) => {
                const d = stagger(i, 3 * BEAT + 18, 3);
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 10, background: COLORS.bg, marginBottom: 6,
                    opacity: fadeIn(frame, d, 4),
                  }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.title}</span>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: item.color }}>{item.due}</span>
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 4: Vocab Lists ═══ */}
      {beatIndex === 4 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(4),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 12 }}>📖 단어장</div>
              {/* Grade tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {['전체', '1학년', '2학년', '3학년'].map((tab, i) => (
                  <div key={i} style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600, fontFamily: FONT_FAMILY,
                    background: i === 2 ? COLORS.primary : COLORS.bg,
                    color: i === 2 ? COLORS.white : COLORS.textSecondary,
                    opacity: fadeIn(frame, stagger(i, 4 * BEAT + 3, 2), 4),
                  }}>
                    {tab}
                  </div>
                ))}
              </div>
              {/* Vocab cards */}
              {VOCAB_LISTS.map((vl, i) => {
                const d = stagger(i, 4 * BEAT + 8, 4);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    borderRadius: 12, background: i === 0 ? 'rgba(59,130,246,0.06)' : COLORS.bg,
                    border: i === 0 ? `1.5px solid ${COLORS.primaryLight}` : `1px solid ${COLORS.border}`,
                    marginBottom: 8, opacity: fadeIn(frame, d, 4),
                    transform: `translateX(${slideLeft(frame, fps, d)}px)`,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, background: `${vl.color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 800, color: vl.color,
                    }}>
                      {vl.words}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{vl.title}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{vl.words}단어</div>
                    </div>
                    {vl.score !== null && (
                      <div style={{
                        padding: '4px 10px', borderRadius: 8,
                        background: vl.score >= 80 ? COLORS.emeraldBg : COLORS.amberBg,
                        fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 700,
                        color: vl.score >= 80 ? COLORS.emerald : COLORS.amber,
                      }}>
                        {vl.score}점
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 5: Vocab Test ═══ */}
      {beatIndex === 5 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(5),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              {/* Progress & Timer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted }}>12/20</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.amber }}>⏱ 2:45</span>
              </div>
              <div style={{ height: 4, background: COLORS.bg, borderRadius: 2, marginBottom: 24, overflow: 'hidden' }}>
                <div style={{ width: `${progressBar(frame, 60, 5 * BEAT + 3, 15)}%`, height: '100%', background: COLORS.primary, borderRadius: 2 }} />
              </div>
              {/* Word */}
              <div style={{
                textAlign: 'center', marginBottom: 32, opacity: fadeIn(frame, 5 * BEAT + 3, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 36, fontWeight: 900, color: COLORS.textPrimary, marginBottom: 8 }}>
                  resilient
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted }}>형용사 (adjective)</div>
              </div>
              {/* Choices */}
              {[
                { text: '탄력 있는', correct: false },
                { text: '회복력 있는', correct: true },
                { text: '저항하는', correct: false },
                { text: '유연한', correct: false },
              ].map((choice, i) => {
                const d = stagger(i, 5 * BEAT + 8, 3);
                const isSelected = choice.correct && frame > 5 * BEAT + 50;
                return (
                  <div key={i} style={{
                    padding: '14px 18px', borderRadius: 12, marginBottom: 8,
                    background: isSelected ? COLORS.emeraldBg : COLORS.bg,
                    border: `1.5px solid ${isSelected ? COLORS.emerald : COLORS.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    opacity: fadeIn(frame, d, 4), transform: `translateY(${slideUp(frame, fps, d)}px)`,
                  }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 500, color: isSelected ? COLORS.emerald : COLORS.textPrimary }}>
                      {choice.text}
                    </span>
                    {isSelected && (
                      <span style={{ fontSize: 18, opacity: fadeIn(frame, 5 * BEAT + 52, 3) }}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 6: Test Results ═══ */}
      {beatIndex === 6 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(6),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 20 }}>시험 결과</div>
              {/* Score */}
              <div style={{
                width: 100, height: 100, borderRadius: 50, background: COLORS.primaryBg,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', transform: `scale(${popScale(frame, fps, 6 * BEAT + 3)})`,
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 32, fontWeight: 900, color: COLORS.primary }}>
                  {countUp(frame, 85, 6 * BEAT + 3, 20)}%
                </span>
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, color: COLORS.textSecondary, marginBottom: 20, opacity: fadeIn(frame, 6 * BEAT + 10, 5) }}>
                17/20 정답
              </div>
              {/* Result breakdown */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginBottom: 24,
                opacity: fadeIn(frame, 6 * BEAT + 12, 5),
              }}>
                {Array.from({ length: 20 }, (_, i) => {
                  const wrong = [3, 11, 15].includes(i);
                  return (
                    <div key={i} style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: wrong ? COLORS.roseBg : COLORS.emeraldBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: 700,
                      color: wrong ? COLORS.rose : COLORS.emerald,
                    }}>
                      {wrong ? '✕' : '✓'}
                    </div>
                  );
                })}
              </div>
              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10, opacity: fadeIn(frame, 6 * BEAT + 20, 5) }}>
                <div style={{ flex: 1, padding: '12px 0', borderRadius: 12, background: COLORS.bg, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, textAlign: 'center' }}>다시 풀기</div>
                <div style={{ flex: 1, padding: '12px 0', borderRadius: 12, background: COLORS.primary, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.white, textAlign: 'center' }}>오답 확인</div>
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 7: Exam Taking ═══ */}
      {beatIndex === 7 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(7),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.primary }}>7 / 20</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.amber }}>⏱ 18:32</span>
              </div>
              <div style={{ height: 3, background: COLORS.bg, borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{ width: '35%', height: '100%', background: COLORS.primary, borderRadius: 2 }} />
              </div>
              {/* Passage */}
              <div style={{
                background: COLORS.bg, borderRadius: 10, padding: 14, marginBottom: 14,
                opacity: fadeIn(frame, 7 * BEAT + 3, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 500, color: COLORS.textPrimary, lineHeight: 1.7 }}>
                  The concept of resilience has gained significant attention in recent years. Researchers have found that individuals who demonstrate resilience tend to...
                </div>
              </div>
              {/* Question */}
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary,
                marginBottom: 12, opacity: fadeIn(frame, 7 * BEAT + 6, 5),
              }}>
                7. What is the main idea of the passage?
              </div>
              {/* Options */}
              {[
                '① 회복력의 정의와 유래',
                '② 회복력이 성공에 미치는 영향',
                '③ 스트레스 관리의 중요성',
                '④ 심리학 연구의 발전',
                '⑤ 교육에서의 회복력 훈련',
              ].map((opt, i) => {
                const d = stagger(i, 7 * BEAT + 8, 2);
                const isSelected = i === 1;
                return (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 6,
                    background: isSelected && frame > 7 * BEAT + 50 ? COLORS.primaryBg : 'transparent',
                    border: `1.5px solid ${isSelected && frame > 7 * BEAT + 50 ? COLORS.primary : COLORS.border}`,
                    opacity: fadeIn(frame, d, 4),
                  }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: isSelected && frame > 7 * BEAT + 50 ? COLORS.primary : COLORS.textPrimary, fontWeight: isSelected ? 600 : 400 }}>{opt}</span>
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 8: Exam Result + Radar ═══ */}
      {beatIndex === 8 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(8),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>시험 결과</div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16,
                transform: `scale(${popScale(frame, fps, 8 * BEAT + 3)})`,
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 48, fontWeight: 900, color: COLORS.emerald }}>92</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 600, color: COLORS.textMuted }}>점</span>
                <div style={{ padding: '4px 12px', borderRadius: 8, background: COLORS.emeraldBg, fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.emerald }}>A</div>
              </div>
              {/* Radar chart (simplified as 4 bars) */}
              <div style={{
                background: COLORS.bg, borderRadius: 14, padding: 18, marginBottom: 16,
                opacity: fadeIn(frame, 8 * BEAT + 8, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 12 }}>영역별 분석</div>
                {[
                  { label: '어법', score: 95, color: COLORS.primary },
                  { label: '어휘', score: 88, color: COLORS.emerald },
                  { label: '독해', score: 92, color: COLORS.purple },
                  { label: '작문', score: 85, color: COLORS.amber },
                ].map((area, i) => {
                  const d = stagger(i, 8 * BEAT + 10, 3);
                  const barW = progressBar(frame, area.score, d, 15);
                  return (
                    <div key={i} style={{ marginBottom: 10, opacity: fadeIn(frame, d, 4) }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 500, color: COLORS.textSecondary }}>{area.label}</span>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 700, color: area.color }}>{area.score}%</span>
                      </div>
                      <div style={{ height: 6, background: COLORS.white, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${barW}%`, height: '100%', background: area.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                padding: '12px 0', borderRadius: 12, background: COLORS.primary,
                fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.white,
                opacity: fadeIn(frame, 8 * BEAT + 25, 5),
              }}>
                AI 해설 보기
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 9: Wrong Answers Notebook ═══ */}
      {beatIndex === 9 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(9),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 12 }}>❌ 오답 노트</div>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {['어휘', '문제'].map((tab, i) => (
                  <div key={i} style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: FONT_FAMILY,
                    background: i === 0 ? COLORS.primary : COLORS.bg,
                    color: i === 0 ? COLORS.white : COLORS.textSecondary,
                  }}>
                    {tab}
                  </div>
                ))}
              </div>
              {/* Wrong vocab */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, opacity: fadeIn(frame, 9 * BEAT + 5, 5) }}>
                틀린 어휘 ({WRONG_VOCAB.length})
              </div>
              {WRONG_VOCAB.map((w, i) => {
                const d = stagger(i, 9 * BEAT + 6, 4);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 10,
                    background: COLORS.roseBg, marginBottom: 6, opacity: fadeIn(frame, d, 4),
                  }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>{w.en}</span>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, marginLeft: 8 }}>{w.ko}</span>
                    </div>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: 600, color: COLORS.rose }}>x{w.miss}</span>
                  </div>
                );
              })}
              {/* Wrong questions */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, marginTop: 14, opacity: fadeIn(frame, 9 * BEAT + 22, 5) }}>
                틀린 문제 ({WRONG_QUESTIONS.length})
              </div>
              {WRONG_QUESTIONS.map((q, i) => {
                const d = stagger(i, 9 * BEAT + 24, 4);
                return (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: 10, background: COLORS.bg, marginBottom: 6,
                    border: `1px solid ${COLORS.border}`, opacity: fadeIn(frame, d, 4),
                  }}>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 500, color: COLORS.textPrimary, marginBottom: 4 }}>{q.q}</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.emerald, fontWeight: 600 }}>정답: {q.correct}</div>
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 10: Progress Charts ═══ */}
      {beatIndex === 10 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(10),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14 }}>📊 학습 현황</div>
              {/* Vocab score trend */}
              <div style={{ background: COLORS.bg, borderRadius: 12, padding: 14, marginBottom: 12, opacity: fadeIn(frame, 10 * BEAT + 3, 5) }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8 }}>단어 시험 추이</div>
                <svg width="100%" height="60" viewBox="0 0 300 60">
                  {[65, 70, 72, 78, 82, 85, 88].map((v, i) => {
                    const x = i * 44 + 10;
                    const y = 55 - (v / 100) * 50;
                    const p = progressBar(frame, 1, 10 * BEAT + 5 + i * 2, 12);
                    return (
                      <React.Fragment key={i}>
                        {i > 0 && (
                          <line x1={(i - 1) * 44 + 10} y1={55 - ([65, 70, 72, 78, 82, 85, 88][i - 1] / 100) * 50}
                            x2={x} y2={y} stroke={COLORS.primary} strokeWidth={2} strokeDasharray={60} strokeDashoffset={60 - p * 60} />
                        )}
                        <circle cx={x} cy={y} r={3} fill={COLORS.primary} opacity={p} />
                      </React.Fragment>
                    );
                  })}
                </svg>
              </div>
              {/* Exam score trend */}
              <div style={{ background: COLORS.bg, borderRadius: 12, padding: 14, marginBottom: 12, opacity: fadeIn(frame, 10 * BEAT + 12, 5) }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8 }}>시험 성적 추이</div>
                <svg width="100%" height="60" viewBox="0 0 300 60">
                  {[78, 82, 88, 85, 92].map((v, i) => {
                    const x = i * 65 + 20;
                    const y = 55 - (v / 100) * 50;
                    const p = progressBar(frame, 1, 10 * BEAT + 15 + i * 2, 12);
                    return (
                      <React.Fragment key={i}>
                        {i > 0 && (
                          <line x1={(i - 1) * 65 + 20} y1={55 - ([78, 82, 88, 85, 92][i - 1] / 100) * 50}
                            x2={x} y2={y} stroke={COLORS.emerald} strokeWidth={2} strokeDasharray={80} strokeDashoffset={80 - p * 80} />
                        )}
                        <circle cx={x} cy={y} r={3} fill={COLORS.emerald} opacity={p} />
                      </React.Fragment>
                    );
                  })}
                </svg>
              </div>
              {/* Activity */}
              <div style={{ background: COLORS.bg, borderRadius: 12, padding: 14, opacity: fadeIn(frame, 10 * BEAT + 22, 5) }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8 }}>일일 학습량</div>
                <svg width="100%" height="50" viewBox="0 0 300 50">
                  {[20, 35, 25, 40, 45, 30, 50].map((v, i) => {
                    const x = i * 44 + 10;
                    const barH = (v / 50) * 40;
                    const p = progressBar(frame, 1, 10 * BEAT + 24 + i, 10);
                    return (
                      <rect key={i} x={x - 8} y={45 - barH * p} width={16} height={barH * p}
                        fill={COLORS.emerald} opacity={0.6} rx={3} />
                    );
                  })}
                </svg>
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 11: MyPage / Profile ═══ */}
      {beatIndex >= 11 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bvLast(11, 1050),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              {/* Profile card */}
              <div style={{
                background: 'linear-gradient(135deg, #1E3A5F 0%, #0F172A 100%)', borderRadius: 16, padding: 20, marginBottom: 16,
                opacity: fadeIn(frame, 11 * BEAT + 3, 5),
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, background: 'rgba(59,130,246,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.primaryLight,
                  }}>
                    김
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.white }}>김민서</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>중2 · 강동중 · 중등 심화반</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700, color: COLORS.primaryLight }}>Lv.12</span>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>2450 XP</span>
                  </div>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${progressBar(frame, 94, 11 * BEAT + 5, 15)}%`, height: '100%', background: 'linear-gradient(90deg, #3B82F6, #10B981)', borderRadius: 3 }} />
                </div>
              </div>
              {/* Achievements */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 10, opacity: fadeIn(frame, 11 * BEAT + 10, 5) }}>
                업적 배지
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {ACHIEVEMENTS.map((ach, i) => {
                  const d = stagger(i, 11 * BEAT + 12, 3);
                  return (
                    <div key={i} style={{
                      width: 60, height: 70, borderRadius: 12, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 4,
                      background: ach.unlocked ? COLORS.amberBg : COLORS.bg,
                      border: `1px solid ${ach.unlocked ? '#FCD34D' : COLORS.border}`,
                      opacity: ach.unlocked ? fadeIn(frame, d, 4) : 0.4,
                      transform: `scale(${popScale(frame, fps, d)})`,
                      filter: ach.unlocked ? 'none' : 'grayscale(1)',
                    }}>
                      <span style={{ fontSize: 20 }}>{ach.icon}</span>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 8, fontWeight: 600, color: COLORS.textSecondary, textAlign: 'center' }}>{ach.label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Achievement notification */}
              <div style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', borderRadius: 14, padding: 14,
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: fadeIn(frame, 11 * BEAT + 30, 5),
                transform: `scale(${popScale(frame, fps, 11 * BEAT + 30)})`,
              }}>
                <span style={{ fontSize: 28 }}>🎉</span>
                <div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.white }}>연속 출석 달성!</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>12일 연속 출석 +50 XP</div>
                </div>
              </div>
            </div>
          </Phone>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default StudentAppScene;
