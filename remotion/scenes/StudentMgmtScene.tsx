import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT, MOCK_STUDENTS, STATUS_COLORS } from '../utils/constants';
import {
  fadeIn, fadeOut, popScale, countUp, stagger, slideUp, hookScale,
  slideRight, progressBar, getBeatInfo,
} from '../utils/animations';
import { AppShell, Badge } from '../components/MockUI';
import { Background } from '../components/Background';

const StudentMgmtScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { currentBeat, beatFrame } = getBeatInfo(frame, BEAT);

  // ─── BEAT 0: HOOK ───
  const renderBeat0 = () => {
    const numVal = countUp(frame, 187, 5, 25);
    const titleScale = hookScale(frame, fps, 8);
    const titleOp = fadeIn(frame, 0, 5);
    const subOp = fadeIn(frame, 20, 8);
    const exitOp = frame > BEAT - 8 ? fadeOut(frame, BEAT - 8, 8) : 1;

    return (
      <AbsoluteFill style={{ opacity: exitOp }}>
        <Background variant="gradient" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', textAlign: 'center', opacity: titleOp,
        }}>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 120, fontWeight: 900,
            color: COLORS.primary, letterSpacing: '-0.04em',
            transform: `scale(${titleScale})`, lineHeight: 1,
          }}>
            {numVal}
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 42, fontWeight: 800,
            color: COLORS.textPrimary, marginTop: 12, letterSpacing: '-0.02em',
          }}>
            명의 원생, 체계적으로
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 400,
            color: COLORS.textSecondary, marginTop: 12, opacity: subOp,
          }}>
            학생 프로필부터 성적 추이까지 한 곳에서
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 1: Student table ───
  const renderBeat1 = () => {
    const bf = frame - BEAT;
    const enterOp = fadeIn(frame, BEAT, 5);
    const headers = ['이름', '학년', '학교', '상태', '평균점수', 'XP', '레벨'];

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={1}>
          {/* Search bar */}
          <div style={{
            display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center',
          }}>
            <div style={{
              flex: 1, height: 40, borderRadius: 10, background: COLORS.white,
              border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center',
              padding: '0 16px', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>🔍</span>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted }}>
                학생 검색...
              </span>
            </div>
            {['상태', '학교', '학년'].map((f, i) => (
              <div key={i} style={{
                height: 40, borderRadius: 10, background: COLORS.white,
                border: `1px solid ${COLORS.border}`, padding: '0 14px',
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary,
              }}>
                {f} <span style={{ fontSize: 10 }}>▼</span>
              </div>
            ))}
          </div>
          {/* Table */}
          <div style={{
            background: COLORS.white, borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${COLORS.border}`,
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', padding: '10px 20px', background: COLORS.bg,
              borderBottom: `1px solid ${COLORS.border}`,
            }}>
              {headers.map((h, i) => (
                <span key={i} style={{
                  flex: i === 0 ? 1.2 : 1, fontFamily: FONT_FAMILY,
                  fontSize: 11, fontWeight: 600, color: COLORS.textMuted, letterSpacing: 0.5,
                }}>{h}</span>
              ))}
            </div>
            {/* Rows */}
            {MOCK_STUDENTS.map((s, i) => {
              const rowOp = fadeIn(frame, BEAT + stagger(i, 5, 2), 5);
              const statusStyle = STATUS_COLORS[s.status] || { color: COLORS.textMuted, bg: COLORS.bg };
              return (
                <div key={i} style={{
                  display: 'flex', padding: '11px 20px', alignItems: 'center',
                  borderBottom: `1px solid ${COLORS.border}`, opacity: rowOp,
                }}>
                  <span style={{ flex: 1.2, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                    {s.name}
                  </span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>{s.grade}</span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>{s.school}</span>
                  <span style={{ flex: 1 }}>
                    <Badge text={s.status} color={statusStyle.color} bg={statusStyle.bg} />
                  </span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{s.score}점</span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.purple, fontWeight: 600 }}>{s.xp.toLocaleString()}</span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>Lv.{s.level}</span>
                </div>
              );
            })}
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 2: Filter animation ───
  const renderBeat2 = () => {
    const bf = frame - BEAT * 2;
    const enterOp = fadeIn(frame, BEAT * 2, 5);
    const dropdownScale = popScale(frame, fps, BEAT * 2 + 5);
    const filterOptions = [
      { label: '재원', color: COLORS.emerald, bg: COLORS.emeraldBg },
      { label: '휴원', color: COLORS.amber, bg: COLORS.amberBg },
      { label: '퇴원', color: COLORS.rose, bg: COLORS.roseBg },
      { label: '대기', color: COLORS.primary, bg: COLORS.primaryBg },
    ];
    const selectFrame = 35;
    const selected = bf >= selectFrame;
    const filteredStudents = selected
      ? MOCK_STUDENTS.filter(s => s.status === '재원')
      : MOCK_STUDENTS;

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={1}>
          {/* Search + filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', position: 'relative' }}>
            <div style={{
              flex: 1, height: 40, borderRadius: 10, background: COLORS.white,
              border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center',
              padding: '0 16px', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>🔍</span>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted }}>학생 검색...</span>
            </div>
            {/* Status filter with dropdown */}
            <div style={{ position: 'relative' }}>
              <div style={{
                height: 40, borderRadius: 10,
                background: selected ? COLORS.emeraldBg : COLORS.white,
                border: `1px solid ${selected ? COLORS.emerald : COLORS.primary}`,
                padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: FONT_FAMILY, fontSize: 12,
                color: selected ? COLORS.emerald : COLORS.primary, fontWeight: 600,
              }}>
                상태{selected ? ': 재원' : ''} <span style={{ fontSize: 10 }}>▼</span>
              </div>
              {/* Dropdown */}
              {!selected && (
                <div style={{
                  position: 'absolute', top: 44, left: 0, width: 140,
                  background: COLORS.white, borderRadius: 10, overflow: 'hidden',
                  border: `1px solid ${COLORS.border}`,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  transform: `scale(${dropdownScale})`, transformOrigin: 'top left',
                }}>
                  {filterOptions.map((opt, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                      background: i === 0 && bf > 25 ? 'rgba(16,185,129,0.06)' : 'transparent',
                      opacity: fadeIn(frame, BEAT * 2 + stagger(i, 8, 2), 4),
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: opt.color,
                      }} />
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textPrimary }}>
                        {opt.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{
              height: 40, borderRadius: 10, background: COLORS.white,
              border: `1px solid ${COLORS.border}`, padding: '0 14px',
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary,
            }}>학교 <span style={{ fontSize: 10 }}>▼</span></div>
          </div>
          {/* Filtered table */}
          <div style={{
            background: COLORS.white, borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ display: 'flex', padding: '10px 20px', background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
              {['이름', '학년', '학교', '상태', '점수'].map((h, i) => (
                <span key={i} style={{
                  flex: i === 0 ? 1.2 : 1, fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
                }}>{h}</span>
              ))}
            </div>
            {filteredStudents.map((s, i) => {
              const statusStyle = STATUS_COLORS[s.status] || { color: COLORS.textMuted, bg: COLORS.bg };
              return (
                <div key={i} style={{
                  display: 'flex', padding: '11px 20px', alignItems: 'center',
                  borderBottom: `1px solid ${COLORS.border}`,
                  opacity: fadeIn(frame, BEAT * 2 + (selected ? 38 : 0) + stagger(i, 3, 2), 5),
                }}>
                  <span style={{ flex: 1.2, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{s.name}</span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>{s.grade}</span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>{s.school}</span>
                  <span style={{ flex: 1 }}><Badge text={s.status} color={statusStyle.color} bg={statusStyle.bg} /></span>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600 }}>{s.score}점</span>
                </div>
              );
            })}
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 3: Student detail card ───
  const renderBeat3 = () => {
    const bf = frame - BEAT * 3;
    const enterOp = fadeIn(frame, BEAT * 3, 5);
    const panelX = slideRight(frame, fps, BEAT * 3 + 3);
    const student = MOCK_STUDENTS[0]; // 김민서

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={1}>
          {/* Dim table behind */}
          <div style={{ opacity: 0.3, pointerEvents: 'none' }}>
            <div style={{
              background: COLORS.white, borderRadius: 14, height: 400,
              border: `1px solid ${COLORS.border}`,
            }} />
          </div>
        </AppShell>
        {/* Slide-in detail panel */}
        <div style={{
          position: 'absolute', right: 0, top: 0, width: 480, height: '100%',
          background: COLORS.white, boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
          transform: `translateX(${panelX}px)`,
          padding: '32px 28px', display: 'flex', flexDirection: 'column',
          borderLeft: `1px solid ${COLORS.border}`,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, background: COLORS.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 700, fontFamily: FONT_FAMILY, color: COLORS.primary,
            }}>
              {student.name[0]}
            </div>
            <div>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 800, color: COLORS.textPrimary,
              }}>{student.name}</div>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 14, color: COLORS.textSecondary, marginTop: 4,
              }}>
                {student.grade} · {student.school}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Badge text={student.status}
                color={STATUS_COLORS[student.status]?.color} bg={STATUS_COLORS[student.status]?.bg} />
            </div>
          </div>
          {/* Info chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
            {[
              { label: '등록일', value: '2024.09.01' },
              { label: '담당', value: '김선생' },
              { label: '반', value: '중등 심화반' },
            ].map((info, i) => (
              <div key={i} style={{
                padding: '8px 14px', borderRadius: 8, background: COLORS.bg,
                fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary,
                opacity: fadeIn(frame, BEAT * 3 + stagger(i, 10, 3), 5),
              }}>
                <span style={{ fontWeight: 600, color: COLORS.textPrimary }}>{info.label}:</span> {info.value}
              </div>
            ))}
          </div>
          {/* Contact */}
          <div style={{
            padding: '16px', borderRadius: 12, background: COLORS.bg, marginBottom: 20,
            opacity: fadeIn(frame, BEAT * 3 + 18, 5),
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>
              연락처
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary }}>
              학부모: 010-1234-5678 (김OO)
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
              이메일: parent@example.com
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 4: Student stats grid ───
  const renderBeat4 = () => {
    const bf = frame - BEAT * 4;
    const enterOp = fadeIn(frame, BEAT * 4, 5);
    const student = MOCK_STUDENTS[0];
    const stats = [
      { label: '평균 점수', value: countUp(bf, student.score, 3, 18), unit: '점', color: COLORS.primary, icon: '📝' },
      { label: '출석률', value: (countUp(bf, 985, 5, 18) / 10).toFixed(1), unit: '%', color: COLORS.emerald, icon: '✅' },
      { label: 'XP', value: countUp(bf, student.xp, 7, 18).toLocaleString(), unit: '', color: COLORS.purple, icon: '⭐' },
      { label: '레벨', value: `Lv.${countUp(bf, student.level, 9, 18)}`, unit: '', color: COLORS.amber, icon: '🏆' },
    ];

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={1}>
          <div style={{ opacity: 0.15, pointerEvents: 'none' }}>
            <div style={{ background: COLORS.white, borderRadius: 14, height: 400, border: `1px solid ${COLORS.border}` }} />
          </div>
        </AppShell>
        {/* Detail panel */}
        <div style={{
          position: 'absolute', right: 0, top: 0, width: 480, height: '100%',
          background: COLORS.white, boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
          padding: '32px 28px', display: 'flex', flexDirection: 'column',
          borderLeft: `1px solid ${COLORS.border}`,
        }}>
          {/* Mini header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, background: COLORS.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, fontFamily: FONT_FAMILY, color: COLORS.primary,
            }}>김</div>
            <div>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
                김민서
              </span>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted, marginLeft: 8 }}>
                중2 · 강동중
              </span>
            </div>
          </div>
          {/* 4 stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {stats.map((stat, i) => {
              const s = popScale(frame, fps, BEAT * 4 + stagger(i, 3, 2));
              return (
                <div key={i} style={{
                  padding: '18px', borderRadius: 14, background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`, transform: `scale(${s})`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 500, color: COLORS.textMuted }}>
                      {stat.label}
                    </span>
                    <span style={{ fontSize: 18 }}>{stat.icon}</span>
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 26, fontWeight: 800, color: stat.color }}>
                    {stat.value}{stat.unit}
                  </div>
                  {stat.label === 'XP' && (
                    <div style={{ width: '100%', height: 4, background: COLORS.border, borderRadius: 2, marginTop: 10 }}>
                      <div style={{
                        width: `${progressBar(bf, 75, 8, 20)}%`,
                        height: '100%', background: stat.color, borderRadius: 2,
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

  // ─── BEAT 5: Exam results ───
  const renderBeat5 = () => {
    const bf = frame - BEAT * 5;
    const enterOp = fadeIn(frame, BEAT * 5, 5);
    const exams = [
      { name: '3월 모의고사', score: 92, color: COLORS.emerald },
      { name: '2월 단원평가', score: 88, color: COLORS.primary },
      { name: '1월 모의고사', score: 95, color: COLORS.emerald },
      { name: '12월 기말고사', score: 85, color: COLORS.amber },
    ];

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={1}>
          <div style={{ opacity: 0.15, pointerEvents: 'none' }}>
            <div style={{ background: COLORS.white, borderRadius: 14, height: 400, border: `1px solid ${COLORS.border}` }} />
          </div>
        </AppShell>
        <div style={{
          position: 'absolute', right: 0, top: 0, width: 480, height: '100%',
          background: COLORS.white, padding: '32px 28px',
          borderLeft: `1px solid ${COLORS.border}`,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, background: COLORS.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, fontFamily: FONT_FAMILY, color: COLORS.primary,
            }}>김</div>
            <span style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              김민서
            </span>
          </div>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
            📊 최근 시험 성적
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {exams.map((exam, i) => {
              const barWidth = progressBar(bf, exam.score, stagger(i, 5, 3), 20);
              const op = fadeIn(frame, BEAT * 5 + stagger(i, 3, 3), 5);
              return (
                <div key={i} style={{ opacity: op }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 500, color: COLORS.textSecondary }}>
                      {exam.name}
                    </span>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: exam.color }}>
                      {Math.round(barWidth)}점
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 10, background: COLORS.bg, borderRadius: 5 }}>
                    <div style={{
                      width: `${barWidth}%`, height: '100%',
                      background: exam.color, borderRadius: 5,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Average */}
          <div style={{
            marginTop: 20, padding: '14px 18px', borderRadius: 12,
            background: COLORS.primaryBg, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
            opacity: fadeIn(frame, BEAT * 5 + 25, 8),
          }}>
            <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.primary }}>
              평균 점수
            </span>
            <span style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.primary }}>
              {countUp(bf, 90, 20, 15)}점
            </span>
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 6: Class enrollment timeline ───
  const renderBeat6 = () => {
    const bf = frame - BEAT * 6;
    const enterOp = fadeIn(frame, BEAT * 6, 5);
    const exitOp = bf > 40 ? fadeOut(frame, BEAT * 6 + 40, 20) : 1;
    const timeline = [
      { date: '2024.09', event: '중등 기초반 등록', type: 'join' },
      { date: '2024.12', event: '중등 심화반으로 반 변경', type: 'change' },
      { date: '2025.03', event: '고등 내신반 추가 등록', type: 'add' },
    ];

    return (
      <AbsoluteFill style={{ opacity: enterOp * exitOp }}>
        <AppShell activeNav={1}>
          <div style={{ opacity: 0.15, pointerEvents: 'none' }}>
            <div style={{ background: COLORS.white, borderRadius: 14, height: 400, border: `1px solid ${COLORS.border}` }} />
          </div>
        </AppShell>
        <div style={{
          position: 'absolute', right: 0, top: 0, width: 480, height: '100%',
          background: COLORS.white, padding: '32px 28px',
          borderLeft: `1px solid ${COLORS.border}`,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, background: COLORS.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, fontFamily: FONT_FAMILY, color: COLORS.primary,
            }}>김</div>
            <span style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              김민서
            </span>
          </div>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 20 }}>
            📋 수강 이력
          </div>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            {/* Timeline line */}
            <div style={{
              position: 'absolute', left: 7, top: 4, bottom: 4, width: 2,
              background: COLORS.border,
            }} />
            {timeline.map((item, i) => {
              const op = fadeIn(frame, BEAT * 6 + stagger(i, 5, 4), 6);
              const y = slideUp(frame, fps, BEAT * 6 + stagger(i, 5, 4));
              const dotColors: Record<string, string> = { join: COLORS.emerald, change: COLORS.primary, add: COLORS.purple };
              return (
                <div key={i} style={{
                  marginBottom: 28, opacity: op, transform: `translateY(${y}px)`, position: 'relative',
                }}>
                  {/* Dot */}
                  <div style={{
                    position: 'absolute', left: -21, top: 4, width: 12, height: 12,
                    borderRadius: '50%', background: dotColors[item.type] || COLORS.primary,
                    border: `2px solid ${COLORS.white}`,
                  }} />
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>
                    {item.date}
                  </div>
                  <div style={{
                    padding: '12px 16px', borderRadius: 10, background: COLORS.bg,
                    fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary,
                  }}>
                    {item.event}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
      {currentBeat >= 6 && renderBeat6()}
    </AbsoluteFill>
  );
};

export default StudentMgmtScene;
