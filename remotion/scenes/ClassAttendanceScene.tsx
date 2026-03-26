import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT, MOCK_CLASSES, MOCK_STUDENTS, ATTENDANCE_STATUSES } from '../utils/constants';
import {
  fadeIn, fadeOut, popScale, countUp, stagger, slideUp, hookScale,
  progressBar, getBeatInfo, slideRight, drawLine,
} from '../utils/animations';
import { AppShell, Badge } from '../components/MockUI';
import { Background } from '../components/Background';

// ─── Circular progress ring ───
function CircleProgress({ progress, size, strokeWidth, color }: {
  progress: number; size: number; strokeWidth: number; color: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={COLORS.border} strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" />
    </svg>
  );
}

const ClassAttendanceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { currentBeat, beatFrame } = getBeatInfo(frame, BEAT);

  // ─── BEAT 0: HOOK ───
  const renderBeat0 = () => {
    const titleScale = hookScale(frame, fps, 5);
    const titleOp = fadeIn(frame, 0, 5);
    const exitOp = frame > BEAT - 8 ? fadeOut(frame, BEAT - 8, 8) : 1;
    // Merge animation: two icons start apart, come together
    const mergeOffset = interpolate(frame, [10, 30], [60, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const mergeOp = fadeIn(frame, 8, 6);

    return (
      <AbsoluteFill style={{ opacity: exitOp }}>
        <Background variant="gradient" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(-50%, -50%) scale(${titleScale})`,
          textAlign: 'center', opacity: titleOp,
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16, opacity: mergeOp }}>
            <span style={{ fontSize: 56, transform: `translateX(-${mergeOffset}px)` }}>📖</span>
            <span style={{ fontSize: 56, transform: `translateX(${mergeOffset}px)` }}>✅</span>
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 52, fontWeight: 900,
            color: COLORS.textPrimary, letterSpacing: '-0.02em',
          }}>
            반 편성부터 출결까지
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 400,
            color: COLORS.textSecondary, marginTop: 12,
            opacity: fadeIn(frame, 18, 8),
          }}>
            체계적인 수업 관리와 실시간 출결 추적
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 1: Class grid ───
  const renderBeat1 = () => {
    const bf = frame - BEAT;
    const enterOp = fadeIn(frame, BEAT, 5);
    const classColors = [COLORS.primary, COLORS.emerald, COLORS.amber, COLORS.purple, COLORS.rose];

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={2}>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 16 }}>
            반 관리
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
          }}>
            {MOCK_CLASSES.map((cls, i) => {
              const s = popScale(frame, fps, BEAT + stagger(i, 3, 2));
              const fillPct = (cls.students / cls.capacity) * 100;
              return (
                <div key={i} style={{
                  background: COLORS.white, borderRadius: 14, overflow: 'hidden',
                  border: `1px solid ${COLORS.border}`, transform: `scale(${s})`,
                }}>
                  {/* Accent bar */}
                  <div style={{ height: 4, background: classColors[i % classColors.length] }} />
                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
                      {cls.name}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                      fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary,
                    }}>
                      <span>🕐</span> {cls.schedule}
                    </div>
                    <div style={{
                      fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, marginTop: 4,
                    }}>
                      👨‍🏫 {cls.teacher}
                    </div>
                    {/* Capacity progress */}
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>정원</span>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textPrimary }}>
                          {cls.students}/{cls.capacity}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 5, background: COLORS.bg, borderRadius: 3 }}>
                        <div style={{
                          width: `${progressBar(bf, fillPct, stagger(i, 5, 2), 18)}%`,
                          height: '100%', background: classColors[i % classColors.length],
                          borderRadius: 3,
                        }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 2: Class detail modal ───
  const renderBeat2 = () => {
    const bf = frame - BEAT * 2;
    const enterOp = fadeIn(frame, BEAT * 2, 5);
    const modalScale = popScale(frame, fps, BEAT * 2 + 3);
    const cls = MOCK_CLASSES[1]; // 중등 심화반
    const enrolledStudents = MOCK_STUDENTS.slice(0, 5);
    const days = ['월', '화', '수', '목', '금', '토', '일'];
    const activeDays = [1, 3]; // 화, 목

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={2}>
          <div style={{ opacity: 0.2, pointerEvents: 'none' }}>
            <div style={{ height: 400, background: COLORS.bg, borderRadius: 14 }} />
          </div>
        </AppShell>
        {/* Modal overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 700, background: COLORS.white, borderRadius: 20,
            padding: '28px 32px', transform: `scale(${modalScale})`,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 6, height: 32, borderRadius: 3, background: COLORS.emerald,
              }} />
              <div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>
                  {cls.name}
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                  {cls.teacher} · {cls.schedule}
                </div>
              </div>
            </div>
            {/* Weekly schedule */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textMuted, marginBottom: 10 }}>
                주간 스케줄
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {days.map((d, i) => {
                  const isActive = activeDays.includes(i);
                  return (
                    <div key={i} style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, textAlign: 'center',
                      background: isActive ? COLORS.emeraldBg : COLORS.bg,
                      border: `1px solid ${isActive ? COLORS.emerald : COLORS.border}`,
                      fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: isActive ? 700 : 400,
                      color: isActive ? COLORS.emerald : COLORS.textMuted,
                    }}>
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Enrolled students */}
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textMuted, marginBottom: 10 }}>
                수강생 ({cls.students}명)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {enrolledStudents.map((s, i) => {
                  const op = fadeIn(frame, BEAT * 2 + stagger(i, 10, 2), 5);
                  const attRate = 85 + Math.round(Math.random() * 15);
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                      borderRadius: 8, background: COLORS.bg, opacity: op,
                    }}>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, flex: 1 }}>
                        {s.name}
                      </span>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, width: 40 }}>
                        {s.grade}
                      </span>
                      <div style={{ width: 80, height: 5, background: COLORS.border, borderRadius: 3 }}>
                        <div style={{
                          width: `${progressBar(bf, attRate, stagger(i, 10, 2), 15)}%`,
                          height: '100%', background: COLORS.emerald, borderRadius: 3,
                        }} />
                      </div>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.emerald, width: 36 }}>
                        {attRate}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 3: Kiosk mode ───
  const renderBeat3 = () => {
    const bf = frame - BEAT * 3;
    const enterOp = fadeIn(frame, BEAT * 3, 5);
    const codeOp = fadeIn(bf, 5, 8);
    const checkDelay = 35;
    const checkScale = bf >= checkDelay ? popScale(frame, fps, BEAT * 3 + checkDelay) : 0;
    const nameOp = fadeIn(bf, checkDelay + 5, 6);

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={3}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%',
          }}>
            <div style={{
              width: 420, padding: '40px', borderRadius: 24, background: COLORS.white,
              border: `1px solid ${COLORS.border}`, textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                키오스크 모드
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted, marginBottom: 24 }}>
                학생 코드를 입력하세요
              </div>
              {/* Code input */}
              <div style={{
                display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 28, opacity: codeOp,
              }}>
                {'ABCD12'.split('').map((char, i) => {
                  const charOp = fadeIn(bf, 8 + i * 3, 3);
                  return (
                    <div key={i} style={{
                      width: 52, height: 64, borderRadius: 12, background: COLORS.bg,
                      border: `2px solid ${charOp > 0.5 ? COLORS.primary : COLORS.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 800,
                      color: COLORS.primary, opacity: charOp,
                    }}>
                      {char}
                    </div>
                  );
                })}
              </div>
              {/* Check animation */}
              {bf >= checkDelay && (
                <div style={{ transform: `scale(${checkScale})` }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: COLORS.emeraldBg, border: `3px solid ${COLORS.emerald}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <span style={{ fontSize: 36, color: COLORS.emerald }}>✓</span>
                  </div>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 800,
                    color: COLORS.emerald, opacity: nameOp,
                  }}>
                    김민서 출석 확인!
                  </div>
                  <div style={{
                    fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted,
                    marginTop: 6, opacity: nameOp,
                  }}>
                    중등 심화반 · 16:00 수업
                  </div>
                </div>
              )}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 4: Attendance grid ───
  const renderBeat4 = () => {
    const bf = frame - BEAT * 4;
    const enterOp = fadeIn(frame, BEAT * 4, 5);
    const students = MOCK_STUDENTS.slice(0, 6);
    const daysOfWeek = ['월', '화', '수', '목', '금'];
    // Predefined attendance pattern
    const pattern = [
      ['✓', '✓', '✓', '✓', '✓'],
      ['✓', '✓', '✕', '✓', '✓'],
      ['✓', '✓', '✓', '✓', '✓'],
      ['✓', '△', '✓', '✓', '✓'],
      ['✓', '✓', '✓', '✕', '✓'],
      ['✓', '✓', '✓', '✓', '△'],
    ];
    const symbolColors: Record<string, string> = {
      '✓': COLORS.emerald, '✕': COLORS.rose, '△': COLORS.amber,
    };

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={3}>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 16 }}>
            출석부 - 중등 심화반
          </div>
          <div style={{
            background: COLORS.white, borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${COLORS.border}`,
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{
                width: 100, padding: '10px 16px', fontFamily: FONT_FAMILY,
                fontSize: 12, fontWeight: 600, color: COLORS.textMuted,
              }}>이름</div>
              {daysOfWeek.map((d, i) => (
                <div key={i} style={{
                  flex: 1, padding: '10px', textAlign: 'center',
                  fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted,
                }}>{d}</div>
              ))}
            </div>
            {/* Student rows */}
            {students.map((s, ri) => (
              <div key={ri} style={{
                display: 'flex', borderBottom: `1px solid ${COLORS.border}`,
                alignItems: 'center',
              }}>
                <div style={{
                  width: 100, padding: '12px 16px', fontFamily: FONT_FAMILY,
                  fontSize: 13, fontWeight: 600, color: COLORS.textPrimary,
                }}>{s.name}</div>
                {daysOfWeek.map((_, ci) => {
                  const sym = pattern[ri]?.[ci] || '✓';
                  const s2 = popScale(frame, fps, BEAT * 4 + stagger(ri * 5 + ci, 5, 1));
                  return (
                    <div key={ci} style={{
                      flex: 1, padding: '12px', textAlign: 'center',
                      fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700,
                      color: symbolColors[sym] || COLORS.textMuted,
                      transform: `scale(${s2})`,
                    }}>
                      {sym}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginTop: 12, justifyContent: 'center' }}>
            {ATTENDANCE_STATUSES.slice(0, 3).map((status, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, color: status.color, fontWeight: 700 }}>{status.icon}</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary }}>{status.label}</span>
              </div>
            ))}
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 5: Analytics panel ───
  const renderBeat5 = () => {
    const bf = frame - BEAT * 5;
    const enterOp = fadeIn(frame, BEAT * 5, 5);
    const stats = [
      { label: '오늘 출석', value: countUp(bf, 45, 3, 15), unit: '명', icon: '✅', color: COLORS.emerald },
      { label: '지각', value: countUp(bf, 3, 5, 12), unit: '명', icon: '⏰', color: COLORS.amber },
      { label: '결석', value: countUp(bf, 2, 7, 12), unit: '명', icon: '❌', color: COLORS.rose },
    ];
    const ringProgress = progressBar(bf, 96.8, 10, 25);

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={3}>
          <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 16 }}>
            출결 분석
          </div>
          {/* 3 stat cards */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
            {stats.map((stat, i) => {
              const s = popScale(frame, fps, BEAT * 5 + stagger(i, 3, 2));
              return (
                <div key={i} style={{
                  flex: 1, background: COLORS.white, borderRadius: 14,
                  padding: '18px 20px', border: `1px solid ${COLORS.border}`,
                  transform: `scale(${s})`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>{stat.label}</span>
                    <span style={{ fontSize: 18 }}>{stat.icon}</span>
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 32, fontWeight: 800, color: stat.color }}>
                    {stat.value}<span style={{ fontSize: 16, fontWeight: 500 }}>{stat.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Monthly rate with ring */}
          <div style={{
            background: COLORS.white, borderRadius: 14, padding: '24px',
            border: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 32,
          }}>
            <div style={{ position: 'relative', width: 140, height: 140 }}>
              <CircleProgress progress={ringProgress} size={140} strokeWidth={12} color={COLORS.emerald} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%) rotate(0deg)',
                textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 800,
                  color: COLORS.textPrimary,
                }}>
                  {ringProgress.toFixed(1)}%
                </div>
                <div style={{
                  fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted,
                }}>이번달</div>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                월간 출석률
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 }}>
                전월 대비
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 8, background: COLORS.emeraldBg,
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.emerald }}>
                  +1.2%
                </span>
                <span style={{ fontSize: 12 }}>📈</span>
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 6: Absent notification panel ───
  const renderBeat6 = () => {
    const bf = frame - BEAT * 6;
    const enterOp = fadeIn(frame, BEAT * 6, 5);
    // This beat spans 120 frames (540-659)
    const exitOp = bf > 90 ? fadeOut(frame, BEAT * 6 + 90, 30) : 1;
    const absentees = [
      { name: '이서준', grade: '중3', cls: '중등 심화반', parent: '010-2345-6789', contacted: true },
      { name: '최예린', grade: '중1', cls: '중등 기초반', parent: '010-3456-7890', contacted: false },
    ];

    return (
      <AbsoluteFill style={{ opacity: enterOp * exitOp }}>
        <AppShell activeNav={3}>
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: '24px',
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
                결석 알림
              </span>
              <div style={{
                marginLeft: 'auto', padding: '4px 12px', borderRadius: 8,
                background: COLORS.roseBg, fontFamily: FONT_FAMILY,
                fontSize: 12, fontWeight: 600, color: COLORS.rose,
              }}>
                2명 결석
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {absentees.map((s, i) => {
                const y = slideUp(frame, fps, BEAT * 6 + stagger(i, 5, 4));
                const op = fadeIn(frame, BEAT * 6 + stagger(i, 5, 4), 6);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '16px 20px', borderRadius: 14, background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    opacity: op, transform: `translateY(${y}px)`,
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 14,
                      background: COLORS.roseBg, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 700, fontFamily: FONT_FAMILY, color: COLORS.rose,
                    }}>
                      {s.name[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                          {s.name}
                        </span>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>
                          {s.grade} · {s.cls}
                        </span>
                      </div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
                        학부모: {s.parent}
                      </div>
                    </div>
                    {/* Contact status */}
                    <div style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: s.contacted ? COLORS.emeraldBg : COLORS.roseBg,
                      fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600,
                      color: s.contacted ? COLORS.emerald : COLORS.rose,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {s.contacted ? '✓ 연락완료' : '⚠ 미연락'}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Quick action buttons */}
            <div style={{
              display: 'flex', gap: 10, marginTop: 16,
              opacity: fadeIn(frame, BEAT * 6 + 20, 8),
            }}>
              <div style={{
                flex: 1, padding: '10px', borderRadius: 10, background: COLORS.primaryBg,
                textAlign: 'center', fontFamily: FONT_FAMILY, fontSize: 13,
                fontWeight: 600, color: COLORS.primary,
              }}>
                📱 일괄 알림 발송
              </div>
              <div style={{
                flex: 1, padding: '10px', borderRadius: 10, background: COLORS.bg,
                textAlign: 'center', fontFamily: FONT_FAMILY, fontSize: 13,
                fontWeight: 600, color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`,
              }}>
                📊 출결 리포트
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
      {currentBeat === 5 && renderBeat5()}
      {currentBeat >= 6 && renderBeat6()}
    </AbsoluteFill>
  );
};

export default ClassAttendanceScene;
