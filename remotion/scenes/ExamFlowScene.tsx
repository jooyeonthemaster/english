import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT } from '../utils/constants';
import {
  fadeIn, fadeOut, beatOpacity, slideUp, slideRight,
  popScale, countUp, stagger, progressBar, pulseGlow,
  hookScale, getBeatInfo,
} from '../utils/animations';
import { AppShell, Badge } from '../components/MockUI';
import { Background } from '../components/Background';

const ExamFlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { currentBeat, beatFrame } = getBeatInfo(frame, BEAT);

  // ─── BEAT 0: HOOK ───
  const renderBeat0 = () => {
    const o = beatOpacity(frame, 0);
    const scale = hookScale(frame, fps, 5);
    const textO = fadeIn(frame, 15, 6);
    const textY = slideUp(frame, fps, 15);
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <Background variant="brand" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        }}>
          <div style={{ fontSize: 72, transform: `scale(${scale})` }}>🎓</div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 48, fontWeight: 900, color: COLORS.white,
            letterSpacing: '-0.02em', textAlign: 'center', transform: `scale(${scale})`,
            textShadow: '0 0 40px rgba(59,130,246,0.4)',
          }}>
            시험 출제에서 채점까지
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 24, fontWeight: 500, color: 'rgba(255,255,255,0.7)',
            opacity: textO, transform: `translateY(${textY}px)`,
          }}>원스톱</div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 1: Exam list ───
  const renderBeat1 = () => {
    const o = beatOpacity(frame, 1);
    const tabs = ['전체', '중간고사', '기말고사', '단원평가', '모의고사'];
    const exams = [
      { title: '중간고사 영어', date: '2026.04.15', class: '고1 내신반', questions: 20, rate: 85 },
      { title: '3월 단원평가', date: '2026.03.20', class: '중2 심화반', questions: 15, rate: 100 },
      { title: '모의고사 6회', date: '2026.03.10', class: '고2 수능반', questions: 45, rate: 72 },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={6}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>
              시험 관리
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, opacity: fadeIn(frame, BEAT + 3, 5) }}>
              {tabs.map((tab, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: i === 0 ? 700 : 500,
                  padding: '8px 18px', borderRadius: 10,
                  background: i === 0 ? COLORS.primary : 'transparent',
                  color: i === 0 ? COLORS.white : COLORS.textSecondary,
                }}>{tab}</div>
              ))}
            </div>
            {/* Exam cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {exams.map((exam, i) => (
                <div key={i} style={{
                  background: COLORS.white, borderRadius: 16, padding: '18px 22px',
                  border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 20,
                  opacity: fadeIn(frame, BEAT + 8 + i * 4, 5),
                  transform: `translateY(${slideUp(frame, fps, BEAT + 8 + i * 4)}px)`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>{exam.title}</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                      {exam.date} | {exam.class} | {exam.questions}문제
                    </div>
                  </div>
                  <div style={{ width: 140 }}>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>
                      제출률 {exam.rate}%
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: COLORS.bg }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: exam.rate === 100 ? COLORS.emerald : COLORS.primary,
                        width: `${progressBar(frame, exam.rate, BEAT + 12 + i * 4, 20)}%`,
                      }} />
                    </div>
                  </div>
                  <Badge text={exam.rate === 100 ? '완료' : '진행중'}
                    color={exam.rate === 100 ? COLORS.emerald : COLORS.primary}
                    bg={exam.rate === 100 ? COLORS.emeraldBg : COLORS.primaryBg} />
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 2: Create exam wizard - Step 1 ───
  const renderBeat2 = () => {
    const o = beatOpacity(frame, 2);
    const fields = [
      { label: '시험명', value: '2026 1학기 중간고사', type: 'text' },
      { label: '시험 유형', value: '중간고사', type: 'dropdown' },
      { label: '대상 반', value: '고1 내신반', type: 'dropdown' },
      { label: '시험 일시', value: '2026.04.15 (화)', type: 'date' },
      { label: '제한 시간', value: '50분', type: 'text' },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={6}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: fadeIn(frame, BEAT * 2 + 3, 5) }}>
              {['기본 정보', '문제 배정', '설정'].map((step, i) => (
                <React.Fragment key={i}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i === 0 ? COLORS.primary : COLORS.bg,
                    color: i === 0 ? COLORS.white : COLORS.textMuted,
                    fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700,
                  }}>{i + 1}</div>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? COLORS.primary : COLORS.textMuted }}>{step}</span>
                  {i < 2 && <div style={{ flex: 1, height: 1, background: COLORS.border }} />}
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
              Step 1: 기본 정보
            </div>
            {/* Form fields */}
            <div style={{
              background: COLORS.white, borderRadius: 16, padding: 24,
              border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {fields.map((field, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  opacity: fadeIn(frame, BEAT * 2 + 8 + i * 4, 4),
                }}>
                  <label style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted }}>
                    {field.label}
                  </label>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 500, color: COLORS.textPrimary,
                    padding: '10px 14px', borderRadius: 10, background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span>{field.value}</span>
                    {field.type === 'dropdown' && <span style={{ color: COLORS.textMuted }}>▾</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 3: Step 2 - Question assignment ───
  const renderBeat3 = () => {
    const o = beatOpacity(frame, 3);
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={6}>
          <div style={{ display: 'flex', gap: 16, height: '100%' }}>
            {/* Left: question bank browser */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: 20,
              border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 10,
              opacity: fadeIn(frame, BEAT * 3 + 3, 5),
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                문제 은행
              </div>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 12, padding: '8px 14px', borderRadius: 10,
                background: COLORS.bg, color: COLORS.textMuted,
              }}>🔍 문제 검색...</div>
              {['빈칸 추론 - B2 중급', '어법 판단 - B1 기본', '주제/요지 - B2 중급', '조건부 영작 - C1 상급',
                '문장 삽입 - B2 중급', '어휘 적절성 - B1 기본'].map((q, i) => (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 12, padding: '10px 14px', borderRadius: 10,
                  background: i < 3 ? `${COLORS.primary}08` : COLORS.white,
                  border: `1px solid ${i < 3 ? COLORS.primary + '30' : COLORS.border}`,
                  color: COLORS.textPrimary, display: 'flex', justifyContent: 'space-between',
                  opacity: fadeIn(frame, BEAT * 3 + 6 + i * 3, 3),
                }}>
                  <span>{q}</span>
                  <span style={{ color: i < 3 ? COLORS.emerald : COLORS.primary, fontWeight: 700 }}>
                    {i < 3 ? '✓ 추가됨' : '+ 추가'}
                  </span>
                </div>
              ))}
            </div>
            {/* Right: selected questions */}
            <div style={{
              width: 320, background: COLORS.white, borderRadius: 16, padding: 20,
              border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 10,
              opacity: fadeIn(frame, BEAT * 3 + 8, 5),
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>선택된 문제</span>
                <Badge text="24문제 추가됨" color={COLORS.primary} bg={COLORS.primaryBg} />
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 10, background: COLORS.bg,
                  opacity: fadeIn(frame, BEAT * 3 + 12 + i * 3, 3),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>≡</span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textPrimary, flex: 1 }}>
                    Q{i + 1}. {['빈칸 추론', '어법 판단', '주제/요지', '조건부 영작', '문장 삽입', '어휘 적절성'][i]}
                  </span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>5점</span>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 4: Step 3 - Settings ───
  const renderBeat4 = () => {
    const o = beatOpacity(frame, 4);
    const toggles = [
      { label: '문제 셔플', on: true },
      { label: '선택지 셔플', on: true },
      { label: '시간제한 60분', on: true },
      { label: '자동채점', on: true },
      { label: '학생별 성적 알림', on: false },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={6}>
          <div style={{ display: 'flex', gap: 20 }}>
            {/* Settings */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
              border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 14,
              opacity: fadeIn(frame, BEAT * 4 + 3, 5),
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 4 }}>
                시험 설정
              </div>
              {toggles.map((toggle, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: i < toggles.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                  opacity: fadeIn(frame, BEAT * 4 + 6 + i * 3, 4),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, color: COLORS.textPrimary }}>{toggle.label}</span>
                  <div style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: toggle.on ? COLORS.primary : COLORS.bg,
                    position: 'relative',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', background: COLORS.white,
                      position: 'absolute', top: 2, left: toggle.on ? 22 : 2,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>
              ))}
            </div>
            {/* Preview */}
            <div style={{
              width: 300, background: COLORS.white, borderRadius: 16, padding: 20,
              border: `1px solid ${COLORS.border}`,
              opacity: fadeIn(frame, BEAT * 4 + 15, 6),
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textMuted, marginBottom: 12 }}>
                학생 화면 미리보기
              </div>
              <div style={{
                background: COLORS.bg, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>Q1. 빈칸 추론</div>
                <div style={{ height: 4, borderRadius: 2, background: COLORS.border, width: '90%' }} />
                <div style={{ height: 4, borderRadius: 2, background: COLORS.border, width: '70%' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {['A', 'B', 'C', 'D', 'E'].map((l, j) => (
                    <div key={j} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', borderRadius: 6,
                      background: j === 2 ? `${COLORS.primary}10` : 'transparent',
                    }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        border: `2px solid ${j === 2 ? COLORS.primary : COLORS.border}`,
                        background: j === 2 ? COLORS.primary : 'transparent',
                      }} />
                      <div style={{ height: 3, borderRadius: 2, background: COLORS.border, width: 60 + j * 10 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 5: Student taking exam ───
  const renderBeat5 = () => {
    const o = beatOpacity(frame, 5);
    const bf = frame - BEAT * 5;
    const timerSeconds = Math.max(0, 2847 - Math.floor(bf * 2));
    const timerMin = Math.floor(timerSeconds / 60);
    const timerSec = timerSeconds % 60;
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <Background variant="gradient" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 700, background: COLORS.white, borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 24px', background: COLORS.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
              중간고사 영어
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.primary }}>
                7 / 20
              </span>
              <span style={{
                fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700,
                color: timerMin < 10 ? COLORS.rose : COLORS.textSecondary,
              }}>
                ⏱ {timerMin}:{String(timerSec).padStart(2, '0')}
              </span>
            </div>
          </div>
          {/* Question */}
          <div style={{ padding: 28 }}>
            <div style={{
              fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 600, color: COLORS.textPrimary,
              lineHeight: 1.7, marginBottom: 20,
              opacity: fadeIn(frame, BEAT * 5 + 5, 5),
            }}>
              7. 다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?
            </div>
            <div style={{
              fontFamily: '"Georgia", serif', fontSize: 13, lineHeight: 1.8, color: COLORS.textSecondary,
              padding: 16, background: COLORS.bg, borderRadius: 12, marginBottom: 20,
              opacity: fadeIn(frame, BEAT * 5 + 8, 5),
            }}>
              Research suggests that creativity is not a fixed trait but rather a skill that can be __________ through deliberate practice and exposure to diverse experiences.
            </div>
            {/* Options */}
            {['A. diminished', 'B. measured', 'C. cultivated', 'D. inherited', 'E. simplified'].map((opt, i) => {
              const isSelected = i === 2 && bf > 40;
              return (
                <div key={i} style={{
                  fontFamily: FONT_FAMILY, fontSize: 14, padding: '12px 16px', borderRadius: 12,
                  marginBottom: 8,
                  background: isSelected ? `${COLORS.primary}10` : COLORS.white,
                  border: isSelected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                  color: isSelected ? COLORS.primary : COLORS.textPrimary,
                  fontWeight: isSelected ? 700 : 400,
                  opacity: fadeIn(frame, BEAT * 5 + 12 + i * 2, 4),
                }}>{opt}</div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 6: Grading dashboard ───
  const renderBeat6 = () => {
    const o = beatOpacity(frame, 6);
    const students = [
      { name: '김민서', score: 92, grade: 'A', time: '42분' },
      { name: '이서준', score: 88, grade: 'B+', time: '48분' },
      { name: '박하은', score: 95, grade: 'S', time: '38분' },
      { name: '정우진', score: 72, grade: 'C', time: '50분' },
      { name: '최예린', score: 84, grade: 'B', time: '45분' },
      { name: '강지호', score: 90, grade: 'A', time: '41분' },
      { name: '윤수빈', score: 76, grade: 'C+', time: '49분' },
      { name: '한소율', score: 86, grade: 'B+', time: '44분' },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={6}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
                채점 결과
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: '평균', value: '82점', color: COLORS.primary },
                  { label: '최고', value: '95점', color: COLORS.emerald },
                  { label: '응시', value: '8/8명', color: COLORS.textPrimary },
                ].map((stat, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: fadeIn(frame, BEAT * 6 + 3 + i * 3, 4),
                  }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>{stat.label}</span>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Table */}
            <div style={{
              background: COLORS.white, borderRadius: 16, overflow: 'hidden',
              border: `1px solid ${COLORS.border}`,
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', padding: '10px 20px', background: COLORS.bg,
                borderBottom: `1px solid ${COLORS.border}`,
              }}>
                {['이름', '점수', '등급', '소요시간'].map((h, i) => (
                  <span key={i} style={{
                    flex: i === 0 ? 1.5 : 1, fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600,
                    color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>{h}</span>
                ))}
              </div>
              {/* Rows */}
              {students.map((s, i) => {
                const gradeColor = s.grade === 'S' ? COLORS.purple : s.grade.startsWith('A') ? COLORS.emerald :
                  s.grade.startsWith('B') ? COLORS.primary : COLORS.amber;
                return (
                  <div key={i} style={{
                    display: 'flex', padding: '12px 20px', alignItems: 'center',
                    borderBottom: i < students.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                    background: i % 2 === 0 ? COLORS.white : 'rgba(244,246,249,0.5)',
                    opacity: fadeIn(frame, BEAT * 6 + 6 + i * 2, 3),
                  }}>
                    <span style={{ flex: 1.5, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{s.name}</span>
                    <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 800, color: s.score >= 90 ? COLORS.emerald : s.score >= 80 ? COLORS.primary : COLORS.amber }}>
                      {countUp(frame, s.score, BEAT * 6 + 6 + i * 2, 15)}점
                    </span>
                    <span style={{ flex: 1 }}>
                      <Badge text={s.grade} color={gradeColor} bg={`${gradeColor}15`} />
                    </span>
                    <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>{s.time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 7: Score distribution chart ───
  const renderBeat7 = () => {
    const o = beatOpacity(frame, 7);
    const distribution = [
      { range: '60-69', count: 1, pct: 12.5 },
      { range: '70-79', count: 2, pct: 25 },
      { range: '80-89', count: 3, pct: 37.5 },
      { range: '90-100', count: 2, pct: 25 },
    ];
    const maxCount = 3;
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={6}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
              점수 분포
            </div>
            <div style={{
              background: COLORS.white, borderRadius: 16, padding: 28,
              border: `1px solid ${COLORS.border}`,
            }}>
              {/* Chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 260, paddingBottom: 40 }}>
                {distribution.map((d, i) => {
                  const barH = (d.count / maxCount) * 200;
                  const animH = progressBar(frame, barH, BEAT * 7 + 5 + i * 4, 20);
                  const barColor = d.range === '90-100' ? COLORS.emerald : d.range === '80-89' ? COLORS.primary :
                    d.range === '70-79' ? COLORS.amber : COLORS.rose;
                  return (
                    <div key={i} style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
                        {d.count}명
                      </span>
                      <div style={{
                        width: '100%', maxWidth: 80, height: animH, borderRadius: 10,
                        background: `linear-gradient(180deg, ${barColor} 0%, ${barColor}88 100%)`,
                      }} />
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>{d.range}</span>
                    </div>
                  );
                })}
              </div>
              {/* Average line indicator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
                opacity: fadeIn(frame, BEAT * 7 + 30, 6),
              }}>
                <div style={{ width: 20, height: 2, background: COLORS.rose }} />
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>
                  평균: 85.4점
                </span>
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 8: Individual result card ───
  const renderBeat8 = () => {
    const o = beatOpacity(frame, 8);
    const answers = ['✓','✓','✓','✕','✓','✓','✕','✓','✓','✓','✓','✕','✓','✓','✓','✓','✓','✓','✓','✓'];
    const categories = [
      { label: '어법', pct: 100, color: COLORS.emerald },
      { label: '어휘', pct: 80, color: COLORS.primary },
      { label: '독해', pct: 90, color: COLORS.purple },
      { label: '서술형', pct: 83, color: COLORS.amber },
    ];
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <AppShell activeNav={6}>
          <div style={{ display: 'flex', gap: 20 }}>
            {/* Student card */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
              border: `1px solid ${COLORS.border}`,
              opacity: fadeIn(frame, BEAT * 8 + 3, 5),
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>김민서</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>고1 내신반 | 강동고등학교</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 48, fontWeight: 900, color: COLORS.emerald }}>
                    {countUp(frame, 92, BEAT * 8 + 5, 20)}
                  </span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 600, color: COLORS.textMuted }}>점</span>
                  <Badge text="A" color={COLORS.emerald} bg={COLORS.emeraldBg} />
                </div>
              </div>
              {/* Per-question breakdown */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 10 }}>
                문항별 결과
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {answers.map((a, i) => (
                  <div key={i} style={{
                    width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: a === '✓' ? COLORS.emeraldBg : COLORS.roseBg,
                    color: a === '✓' ? COLORS.emerald : COLORS.rose,
                    fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700,
                    opacity: fadeIn(frame, BEAT * 8 + 10 + i, 2),
                  }}>{a}</div>
                ))}
              </div>
              {/* Category performance */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 10 }}>
                영역별 성취도
              </div>
              {categories.map((cat, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
                  opacity: fadeIn(frame, BEAT * 8 + 35 + i * 4, 4),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, width: 50 }}>{cat.label}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLORS.bg }}>
                    <div style={{
                      height: '100%', borderRadius: 4, background: cat.color,
                      width: `${progressBar(frame, cat.pct, BEAT * 8 + 35 + i * 4, 18)}%`,
                    }} />
                  </div>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700, color: cat.color, width: 36 }}>{cat.pct}%</span>
                </div>
              ))}
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
      {currentBeat === 5 && renderBeat5()}
      {currentBeat === 6 && renderBeat6()}
      {currentBeat === 7 && renderBeat7()}
      {currentBeat >= 8 && renderBeat8()}
    </AbsoluteFill>
  );
};

export default ExamFlowScene;
