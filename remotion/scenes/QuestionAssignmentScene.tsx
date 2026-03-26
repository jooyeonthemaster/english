import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT } from '../utils/constants';
import {
  fadeIn, fadeOut, beatOpacity, slideUp, slideRight,
  popScale, countUp, stagger, typewriter, progressBar, pulseGlow,
  hookScale, getBeatInfo,
} from '../utils/animations';
import { AppShell, Badge } from '../components/MockUI';
import { Background } from '../components/Background';

const QuestionAssignmentScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { currentBeat, beatFrame } = getBeatInfo(frame, BEAT);

  // ─── BEAT 0: HOOK ───
  const renderBeat0 = () => {
    const o = beatOpacity(frame, 0);
    const scale = hookScale(frame, fps, 5);
    const textO = fadeIn(frame, 18, 6);
    const textY = slideUp(frame, fps, 18);
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <Background variant="brand" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        }}>
          <div style={{ fontSize: 72, transform: `scale(${scale})` }}>🗄️</div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 44, fontWeight: 900, color: COLORS.white,
            textAlign: 'center', transform: `scale(${scale})`,
            textShadow: '0 0 40px rgba(59,130,246,0.4)',
          }}>
            체계적 문제 관리 & 과제 운영
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.65)',
            opacity: textO, transform: `translateY(${textY}px)`,
          }}>문제 은행에서 과제 배포까지</div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 1: Question bank browser ───
  const renderBeat1 = () => {
    const o = beatOpacity(frame, 1);
    const questions = [
      { type: '빈칸 추론', difficulty: '중급', preview: 'The concept of emotional intelligence...', school: '강동고' },
      { type: '어법 판단', difficulty: '기본', preview: 'Despite having studied for hours...', school: '명일중' },
      { type: '주제/요지', difficulty: '중급', preview: 'Research on neuroplasticity has shown...', school: '강동고' },
      { type: '조건부 영작', difficulty: '상급', preview: '다음 조건에 맞게 영작하시오...', school: '배재고' },
      { type: '문장 삽입', difficulty: '중급', preview: 'The history of urban development...', school: '강동고' },
      { type: '동의어', difficulty: '기본', preview: 'The word "ubiquitous" in line 3...', school: '명일중' },
    ];
    const typeColors: Record<string, string> = {
      '빈칸 추론': COLORS.primary, '어법 판단': COLORS.primary, '주제/요지': COLORS.primary,
      '조건부 영작': COLORS.purple, '문장 삽입': COLORS.primary, '동의어': COLORS.emerald,
    };
    const diffColors: Record<string, { color: string; bg: string }> = {
      '기본': { color: COLORS.emerald, bg: COLORS.emeraldBg },
      '중급': { color: COLORS.amber, bg: COLORS.amberBg },
      '상급': { color: COLORS.rose, bg: COLORS.roseBg },
    };
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={7}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>
              문제 은행
            </div>
            {/* Filter bar */}
            <div style={{
              display: 'flex', gap: 10, opacity: fadeIn(frame, BEAT + 3, 5),
            }}>
              {['유형 ▾', '난이도 ▾', '학교 ▾'].map((f, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 500, padding: '8px 16px',
                  borderRadius: 10, background: COLORS.white, border: `1px solid ${COLORS.border}`,
                  color: COLORS.textSecondary,
                }}>{f}</div>
              ))}
              <div style={{
                flex: 1, fontFamily: FONT_FAMILY, fontSize: 12, padding: '8px 16px',
                borderRadius: 10, background: COLORS.white, border: `1px solid ${COLORS.border}`,
                color: COLORS.textMuted,
              }}>🔍 문제 검색...</div>
            </div>
            {/* Question cards grid */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {questions.map((q, i) => (
                <div key={i} style={{
                  width: 'calc(50% - 6px)', background: COLORS.white, borderRadius: 14, padding: '16px 18px',
                  border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 8,
                  opacity: fadeIn(frame, BEAT + 6 + i * 3, 4),
                  transform: `translateY(${slideUp(frame, fps, BEAT + 6 + i * 3)}px)`,
                }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge text={q.type} color={typeColors[q.type] || COLORS.primary} bg={`${typeColors[q.type] || COLORS.primary}15`} />
                    <Badge text={q.difficulty} color={diffColors[q.difficulty]?.color || COLORS.textMuted} bg={diffColors[q.difficulty]?.bg || COLORS.bg} />
                  </div>
                  <div style={{
                    fontFamily: '"Georgia", serif', fontSize: 12, color: COLORS.textSecondary,
                    lineHeight: 1.5, overflow: 'hidden', maxHeight: 36,
                  }}>{q.preview}</div>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted,
                  }}>📍 {q.school}</div>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 2: Question detail view ───
  const renderBeat2 = () => {
    const o = beatOpacity(frame, 2);
    const options = [
      { num: '①', text: 'acquired through formal education only', correct: false },
      { num: '②', text: 'determined by genetic factors', correct: false },
      { num: '③', text: 'cultivated through practice and experience', correct: true },
      { num: '④', text: 'limited to artistic expression', correct: false },
      { num: '⑤', text: 'measurable by standardized tests', correct: false },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={7}>
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: 28,
            border: `1px solid ${COLORS.border}`, maxWidth: 700,
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, opacity: fadeIn(frame, BEAT * 2 + 3, 4) }}>
              <Badge text="빈칸 추론" color={COLORS.primary} bg={COLORS.primaryBg} />
              <Badge text="B2 중급" color={COLORS.amber} bg={COLORS.amberBg} />
              <Badge text="강동고" color={COLORS.textSecondary} bg={COLORS.bg} />
            </div>
            <div style={{
              fontFamily: '"Georgia", serif', fontSize: 14, lineHeight: 1.8, color: COLORS.textSecondary,
              padding: 16, background: COLORS.bg, borderRadius: 12, marginBottom: 20,
              opacity: fadeIn(frame, BEAT * 2 + 5, 5),
            }}>
              Research suggests that creativity is not a fixed trait but rather a skill that can be __________ through deliberate practice and exposure to diverse experiences. This finding challenges the long-held notion that creative ability is solely innate.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((opt, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 14, padding: '10px 16px', borderRadius: 10,
                  background: opt.correct ? 'rgba(16,185,129,0.1)' : 'transparent',
                  border: opt.correct ? `2px solid ${COLORS.emerald}` : `1px solid ${COLORS.border}`,
                  color: opt.correct ? COLORS.emerald : COLORS.textPrimary,
                  fontWeight: opt.correct ? 700 : 400,
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: fadeIn(frame, BEAT * 2 + 10 + i * 3, 4),
                }}>
                  <span style={{ fontWeight: 700 }}>{opt.num}</span>
                  <span>{opt.text}</span>
                  {opt.correct && <span style={{ marginLeft: 'auto', fontSize: 16 }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 3: AI Explanation panel ───
  const renderBeat3 = () => {
    const o = beatOpacity(frame, 3);
    const bf = frame - BEAT * 3;
    const explanationText = '정답은 ③번 "cultivated through practice and experience"입니다. 지문에서 creativity가 fixed trait이 아닌 skill이라고 했으므로, 연습과 경험을 통해 "길러질 수 있는(cultivated)" 것이 빈칸에 적합합니다.';
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={7}>
          <div style={{ display: 'flex', gap: 20 }}>
            {/* AI Explanation */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
              border: `1px solid ${COLORS.border}`,
              opacity: fadeIn(frame, BEAT * 3 + 3, 5),
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.primary }}>AI 해설</span>
              </div>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 1.8, color: COLORS.textSecondary,
                marginBottom: 20,
              }}>
                {typewriter(explanationText, frame, BEAT * 3 + 8, 0.6)}
              </div>
              {/* Key points */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 10 }}>
                핵심 포인트
              </div>
              {[
                '"not A but B" 구문으로 대비 관계 파악',
                'fixed trait vs. skill 대립 구조 활용',
                'cultivate = 기르다, 발전시키다 (긍정적 의미)',
              ].map((point, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                  opacity: fadeIn(frame, BEAT * 3 + 40 + i * 5, 5),
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.primary, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary }}>{point}</span>
                </div>
              ))}
            </div>
            {/* Stats panel */}
            <div style={{
              width: 220, display: 'flex', flexDirection: 'column', gap: 12,
              opacity: fadeIn(frame, BEAT * 3 + 20, 6),
            }}>
              {[
                { icon: '🎯', label: '정답률', value: '68%', color: COLORS.primary },
                { icon: '⏱', label: '평균 풀이시간', value: '45초', color: COLORS.amber },
                { icon: '📊', label: '풀이 횟수', value: '47회', color: COLORS.emerald },
              ].map((stat, i) => (
                <div key={i} style={{
                  background: COLORS.white, borderRadius: 14, padding: '16px 18px',
                  border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12,
                  opacity: fadeIn(frame, BEAT * 3 + 22 + i * 5, 4),
                  transform: `translateX(${slideRight(frame, fps, BEAT * 3 + 22 + i * 5)}px)`,
                }}>
                  <span style={{ fontSize: 22 }}>{stat.icon}</span>
                  <div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: 600, color: COLORS.textMuted }}>{stat.label}</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 4: Assignment list ───
  const renderBeat4 = () => {
    const o = beatOpacity(frame, 4);
    const assignments = [
      { title: 'Unit 3 복습 과제', due: '3/25 (화)', class: '고1 내신반', pct: 67, status: '진행중' },
      { title: '3월 모의고사 오답', due: '3/20 (목)', class: '고2 수능반', pct: 100, status: '완료' },
      { title: '어휘 테스트 #12', due: '3/28 (금)', class: '중2 기초반', pct: 45, status: '진행중' },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={4}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>
              과제 관리
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, opacity: fadeIn(frame, BEAT * 4 + 3, 5) }}>
              {['진행중', '완료'].map((tab, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: i === 0 ? 700 : 500,
                  padding: '8px 20px', borderRadius: 10,
                  background: i === 0 ? COLORS.primary : 'transparent',
                  color: i === 0 ? COLORS.white : COLORS.textSecondary,
                }}>{tab}</div>
              ))}
            </div>
            {/* Assignment cards */}
            {assignments.map((a, i) => (
              <div key={i} style={{
                background: COLORS.white, borderRadius: 16, padding: '18px 22px',
                border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 20,
                opacity: fadeIn(frame, BEAT * 4 + 6 + i * 4, 5),
                transform: `translateY(${slideUp(frame, fps, BEAT * 4 + 6 + i * 4)}px)`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>{a.title}</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                    마감: {a.due} | {a.class}
                  </div>
                </div>
                <div style={{ width: 160 }}>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600,
                    color: a.pct === 100 ? COLORS.emerald : COLORS.primary, marginBottom: 4,
                  }}>제출률 {a.pct}%</div>
                  <div style={{ height: 6, borderRadius: 3, background: COLORS.bg }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: a.pct === 100 ? COLORS.emerald : a.pct > 60 ? COLORS.primary : COLORS.amber,
                      width: `${progressBar(frame, a.pct, BEAT * 4 + 10 + i * 4, 20)}%`,
                    }} />
                  </div>
                </div>
                <Badge text={a.status}
                  color={a.status === '완료' ? COLORS.emerald : COLORS.primary}
                  bg={a.status === '완료' ? COLORS.emeraldBg : COLORS.primaryBg} />
              </div>
            ))}
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 5: Assignment detail - submissions ───
  const renderBeat5 = () => {
    const o = beatOpacity(frame, 5);
    const students = [
      { name: '김민서', status: true }, { name: '이서준', status: true },
      { name: '박하은', status: true }, { name: '정우진', status: false },
      { name: '최예린', status: true }, { name: '강지호', status: true },
      { name: '윤수빈', status: false }, { name: '한소율', status: true },
      { name: '조현우', status: false }, { name: '이하린', status: true },
      { name: '백승현', status: false }, { name: '송유진', status: true },
    ];
    const submitted = students.filter(s => s.status).length;
    const total = students.length;
    const pct = Math.round((submitted / total) * 100);
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={4}>
          <div style={{ display: 'flex', gap: 20 }}>
            {/* Submission table */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, overflow: 'hidden',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{
                padding: '16px 20px', borderBottom: `1px solid ${COLORS.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
                    Unit 3 복습 과제
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>
                    마감: 3/25 (화) | 고1 내신반
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.amber,
                    background: COLORS.amberBg, padding: '6px 14px', borderRadius: 8,
                  }}>독촉 알림</div>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.primary,
                    background: COLORS.primaryBg, padding: '6px 14px', borderRadius: 8,
                  }}>성적 내보내기</div>
                </div>
              </div>
              {/* Header row */}
              <div style={{
                display: 'flex', padding: '10px 20px', background: COLORS.bg,
                borderBottom: `1px solid ${COLORS.border}`,
              }}>
                {['이름', '제출 상태', '제출 시간'].map((h, i) => (
                  <span key={i} style={{
                    flex: 1, fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600,
                    color: COLORS.textMuted, letterSpacing: 0.5,
                  }}>{h}</span>
                ))}
              </div>
              {/* Student rows */}
              {students.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', padding: '10px 20px', alignItems: 'center',
                  borderBottom: i < students.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                  opacity: fadeIn(frame, BEAT * 5 + 5 + i * 2, 3),
                }}>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 500, color: COLORS.textPrimary }}>
                    {s.name}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{
                      fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700,
                      color: s.status ? COLORS.emerald : COLORS.rose,
                    }}>
                      {s.status ? '✓ 제출' : '✕ 미제출'}
                    </span>
                  </span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>
                    {s.status ? `3/${20 + i} ${14 + i}:${String(i * 7 % 60).padStart(2, '0')}` : '-'}
                  </span>
                </div>
              ))}
            </div>
            {/* Circular progress */}
            <div style={{
              width: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              opacity: fadeIn(frame, BEAT * 5 + 15, 6),
            }}>
              <div style={{
                width: 120, height: 120, borderRadius: '50%', position: 'relative',
                background: `conic-gradient(${COLORS.primary} ${progressBar(frame, pct * 3.6, BEAT * 5 + 15, 25)}deg, ${COLORS.bg} 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 96, height: 96, borderRadius: '50%', background: COLORS.white,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 900, color: COLORS.primary }}>
                    {countUp(frame, pct, BEAT * 5 + 15, 20)}%
                  </span>
                </div>
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
                {submitted}/{total}명 제출
              </div>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
              }}>
                미제출 {total - submitted}명
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  return (
    <AbsoluteFill>
      {currentBeat === 0 && renderBeat0()}
      {currentBeat === 1 && renderBeat1()}
      {currentBeat === 2 && renderBeat2()}
      {currentBeat === 3 && renderBeat3()}
      {currentBeat === 4 && renderBeat4()}
      {currentBeat >= 5 && renderBeat5()}
    </AbsoluteFill>
  );
};

export default QuestionAssignmentScene;
