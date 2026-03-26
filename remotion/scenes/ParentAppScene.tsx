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
  zoomIn,
} from '../utils/animations';
import { Background } from '../components/Background';
import { Badge } from '../components/MockUI';

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
  <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 20px 4px' }}>
    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>9:41</span>
    <div style={{ display: 'flex', gap: 4 }}>
      <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textPrimary }}>●●●●</span>
    </div>
  </div>
);

const INVOICES_PARENT = [
  { month: '3월 수업료 (심화반)', amount: 320000, status: '완납', date: '3/05' },
  { month: '3월 교재비', amount: 35000, status: '완납', date: '3/05' },
  { month: '4월 수업료 (심화반)', amount: 320000, status: '미납', date: '4/01' },
];

const PARENT_CHAT = [
  { sent: true, text: '선생님, 4월 시험 일정이 어떻게 되나요?' },
  { sent: false, text: '안녕하세요 어머니! 4월 첫째 주 수요일에 중간고사 대비 모의고사가 있고, 셋째 주에 정기 시험이 있습니다.' },
  { sent: true, text: '감사합니다! 민서가 잘 준비할 수 있게 도와주세요 🙏' },
];

const ParentAppScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beatIndex = Math.floor(frame / BEAT);

  const bv = (b: number) => {
    if (beatIndex !== b) return 0;
    return fadeIn(frame, b * BEAT, 4) * (frame >= (b + 1) * BEAT - 4 ? fadeOut(frame, (b + 1) * BEAT - 4, 4) : 1);
  };

  const bvLast = (b: number, endFrame: number) => {
    if (beatIndex < b) return 0;
    return fadeIn(frame, b * BEAT, 4) * (frame >= endFrame - 8 ? fadeOut(frame, endFrame - 8, 8) : 1);
  };

  return (
    <AbsoluteFill>
      <Background variant="gradient" />

      {/* ═══ BEAT 0: HOOK ═══ */}
      {beatIndex === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', opacity: bv(0),
        }}>
          <span style={{ fontSize: 80, marginBottom: 16, transform: `scale(${popScale(frame, fps, 0)})` }}>👨‍👩‍👧</span>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 84, fontWeight: 900, color: COLORS.textPrimary,
            letterSpacing: '-0.04em', transform: `scale(${hookScale(frame, fps, 2)})`,
          }}>
            학부모가 원하는
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 84, fontWeight: 900, color: COLORS.primary,
            letterSpacing: '-0.04em', transform: `scale(${hookScale(frame, fps, 5)})`,
          }}>
            모든 정보
          </div>
        </div>
      )}

      {/* ═══ BEAT 1: Parent Login + Dashboard ═══ */}
      {beatIndex === 1 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(1),
        }}>
          <Phone opacity={1} scale={popScale(frame, fps, BEAT)}>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, opacity: fadeIn(frame, BEAT + 3, 5) }}>NARA 학부모</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>김민서 어머니</div>
                </div>
              </div>
              {/* Child tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, opacity: fadeIn(frame, BEAT + 6, 5) }}>
                {['김민서', '김서연'].map((name, i) => (
                  <div key={i} style={{
                    padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: FONT_FAMILY,
                    background: i === 0 ? COLORS.primary : COLORS.bg,
                    color: i === 0 ? COLORS.white : COLORS.textSecondary,
                  }}>
                    {name}
                  </div>
                ))}
              </div>
              {/* Today summary */}
              <div style={{
                background: COLORS.bg, borderRadius: 14, padding: 16, marginBottom: 14,
                opacity: fadeIn(frame, BEAT + 10, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 10 }}>오늘 요약</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { icon: '✅', label: '출석', value: '확인', color: COLORS.emerald },
                    { icon: '📝', label: '과제', value: '1건', color: COLORS.amber },
                    { icon: '📋', label: '시험', value: '예정', color: COLORS.primary },
                  ].map((item, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{item.label}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 2: Dashboard Actions + Activity Feed ═══ */}
      {beatIndex === 2 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(2),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              {/* Quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                {[
                  { icon: '📊', label: '성적 확인', color: COLORS.primary, bg: COLORS.primaryBg },
                  { icon: '💳', label: '수납 내역', color: COLORS.emerald, bg: COLORS.emeraldBg },
                  { icon: '📋', label: '주간 리포트', color: COLORS.purple, bg: COLORS.purpleBg },
                  { icon: '✉️', label: '메시지', color: COLORS.amber, bg: COLORS.amberBg },
                ].map((action, i) => {
                  const d = stagger(i, 2 * BEAT + 3, 3);
                  return (
                    <div key={i} style={{
                      background: action.bg, borderRadius: 14, padding: '16px 14px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      opacity: fadeIn(frame, d, 4), transform: `scale(${popScale(frame, fps, d)})`,
                    }}>
                      <span style={{ fontSize: 22 }}>{action.icon}</span>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: action.color }}>{action.label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Recent activity */}
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 10, opacity: fadeIn(frame, 2 * BEAT + 15, 5) }}>
                최근 활동
              </div>
              {[
                { icon: '🎓', text: '3월 모의고사 92점 달성', time: '2시간 전', color: COLORS.emerald },
                { icon: '📝', text: 'Unit 3 과제 제출 완료', time: '오늘 15:30', color: COLORS.primary },
                { icon: '✅', text: '오늘 출석 확인', time: '오늘 13:55', color: COLORS.emerald },
              ].map((item, i) => {
                const d = stagger(i, 2 * BEAT + 18, 4);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 10, background: COLORS.bg, marginBottom: 6,
                    opacity: fadeIn(frame, d, 4), transform: `translateX(${slideLeft(frame, fps, d)}px)`,
                  }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 500, color: COLORS.textPrimary }}>{item.text}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{item.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 3: 성적 확인 ═══ */}
      {beatIndex === 3 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(3),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14 }}>📊 성적 확인</div>
              {/* Exam cards */}
              {[
                { name: '3월 모의고사', score: 92, avg: 78, rank: 3, total: 15, date: '3/20' },
                { name: '2월 정기시험', score: 88, avg: 75, rank: 4, total: 15, date: '2/28' },
              ].map((exam, i) => {
                const d = stagger(i, 3 * BEAT + 3, 5);
                return (
                  <div key={i} style={{
                    background: COLORS.bg, borderRadius: 14, padding: 16, marginBottom: 12,
                    opacity: fadeIn(frame, d, 5), transform: `translateY(${slideUp(frame, fps, d)}px)`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{exam.name}</div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{exam.date}</div>
                      </div>
                      <div style={{
                        padding: '4px 12px', borderRadius: 8, background: exam.score >= 90 ? COLORS.emeraldBg : COLORS.primaryBg,
                        fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800,
                        color: exam.score >= 90 ? COLORS.emerald : COLORS.primary,
                      }}>
                        {countUp(frame, exam.score, d + 5, 15)}점
                      </div>
                    </div>
                    {/* Comparison bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>학생</span>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>반 평균</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1, height: 8, background: COLORS.border, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${progressBar(frame, exam.score, d + 5, 15)}%`, height: '100%', background: COLORS.primary, borderRadius: 4 }} />
                        </div>
                        <div style={{ flex: 1, height: 8, background: COLORS.border, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${progressBar(frame, exam.avg, d + 8, 15)}%`, height: '100%', background: COLORS.textMuted, borderRadius: 4 }} />
                        </div>
                      </div>
                    </div>
                    <div style={{
                      display: 'inline-flex', padding: '3px 10px', borderRadius: 6, background: COLORS.primaryBg,
                      fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.primary,
                    }}>
                      {exam.rank}/{exam.total}위
                    </div>
                  </div>
                );
              })}
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 4: Score Trend ═══ */}
      {beatIndex === 4 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(4),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14 }}>📈 성적 추이</div>
              <div style={{ background: COLORS.bg, borderRadius: 14, padding: 18, marginBottom: 16 }}>
                <svg width="100%" height="180" viewBox="0 0 300 180">
                  {/* Grid lines */}
                  {[60, 70, 80, 90, 100].map((v, i) => {
                    const y = 160 - ((v - 50) / 55) * 150;
                    return (
                      <React.Fragment key={i}>
                        <line x1={20} y1={y} x2={280} y2={y} stroke={COLORS.border} strokeWidth={1} />
                        <text x={8} y={y + 4} fill={COLORS.textMuted} fontSize={8} fontFamily={FONT_FAMILY}>{v}</text>
                      </React.Fragment>
                    );
                  })}
                  {/* Data points and area fill */}
                  {(() => {
                    const scores = [78, 82, 88, 85, 92];
                    const labels = ['11월', '12월', '1월', '2월', '3월'];
                    const points = scores.map((s, i) => ({
                      x: i * 60 + 40,
                      y: 160 - ((s - 50) / 55) * 150,
                    }));
                    const areaPath = `M${points[0].x},160 ${points.map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},160 Z`;
                    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                    return (
                      <>
                        <path d={areaPath} fill={`${COLORS.emerald}15`} opacity={fadeIn(frame, 4 * BEAT + 8, 10)} />
                        <path d={linePath} fill="none" stroke={COLORS.emerald} strokeWidth={2.5}
                          strokeDasharray={500} strokeDashoffset={500 - progressBar(frame, 500, 4 * BEAT + 5, 25)} />
                        {points.map((p, i) => (
                          <React.Fragment key={i}>
                            <circle cx={p.x} cy={p.y} r={5} fill={COLORS.white} stroke={COLORS.emerald} strokeWidth={2.5}
                              opacity={fadeIn(frame, 4 * BEAT + 8 + i * 3, 5)} />
                            <text x={p.x} y={p.y - 12} textAnchor="middle" fill={COLORS.emerald} fontSize={10} fontWeight={700} fontFamily={FONT_FAMILY}
                              opacity={fadeIn(frame, 4 * BEAT + 10 + i * 3, 5)}>
                              {scores[i]}
                            </text>
                            <text x={p.x} y={172} textAnchor="middle" fill={COLORS.textMuted} fontSize={9} fontFamily={FONT_FAMILY}>
                              {labels[i]}
                            </text>
                          </React.Fragment>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              {/* Trend badge */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: fadeIn(frame, 4 * BEAT + 25, 5),
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.emerald }}>📈 +14점 상승</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>최근 5회 시험 기준</span>
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 5: 수납 내역 ═══ */}
      {beatIndex === 5 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(5),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14 }}>💳 수납 내역</div>
              {INVOICES_PARENT.map((inv, i) => {
                const d = stagger(i, 5 * BEAT + 3, 4);
                const statusColor = inv.status === '완납' ? COLORS.emerald : COLORS.amber;
                const statusBg = inv.status === '완납' ? COLORS.emeraldBg : COLORS.amberBg;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', padding: '14px 16px', borderRadius: 12,
                    background: COLORS.bg, marginBottom: 8, border: `1px solid ${inv.status === '미납' ? COLORS.amber + '40' : COLORS.border}`,
                    opacity: fadeIn(frame, d, 4), transform: `translateY(${slideUp(frame, fps, d)}px)`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{inv.month}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{inv.date}</div>
                    </div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginRight: 12 }}>
                      ₩{inv.amount.toLocaleString()}
                    </div>
                    <Badge text={inv.status} color={statusColor} bg={statusBg} />
                  </div>
                );
              })}
              {/* Outstanding */}
              <div style={{
                marginTop: 12, padding: '14px 18px', borderRadius: 12,
                background: COLORS.amberBg, border: `1px solid ${COLORS.amber}40`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                opacity: fadeIn(frame, 5 * BEAT + 20, 5),
              }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.amber }}>총 미납</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.amber }}>
                  ₩{countUp(frame, 320000, 5 * BEAT + 20, 15).toLocaleString()}
                </span>
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 6: 주간 리포트 ═══ */}
      {beatIndex === 6 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bv(6),
        }}>
          <Phone>
            <PhoneStatusBar />
            <div style={{ padding: '8px 20px' }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>📋 주간 리포트</div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginBottom: 14 }}>3월 3주차 (3/18 ~ 3/24)</div>
              {/* Stats */}
              {[
                { label: '출석률', value: 100, unit: '%', color: COLORS.emerald },
                { label: '과제 수행', value: 100, unit: '%', color: COLORS.primary },
                { label: '시험 성적', value: 92, unit: '점', color: COLORS.purple },
              ].map((stat, i) => {
                const d = stagger(i, 6 * BEAT + 3, 4);
                const barW = progressBar(frame, stat.value, d, 15);
                return (
                  <div key={i} style={{ marginBottom: 14, opacity: fadeIn(frame, d, 4) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{stat.label}</span>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 800, color: stat.color }}>{stat.value}{stat.unit}</span>
                    </div>
                    <div style={{ height: 8, background: COLORS.bg, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${barW}%`, height: '100%', background: stat.color, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
              {/* Teacher comment */}
              <div style={{
                background: COLORS.primaryBg, borderRadius: 12, padding: 16, marginTop: 8,
                borderLeft: `3px solid ${COLORS.primary}`,
                opacity: fadeIn(frame, 6 * BEAT + 18, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.primary, marginBottom: 6 }}>담당 선생님 코멘트</div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.7 }}>
                  김민서 학생은 이번 주 꾸준히 성실하게 학습에 참여했습니다. 특히 어법 영역에서 큰 성장을 보이고 있으며, 독해 속도도 눈에 띄게 향상되었습니다.
                </div>
              </div>
            </div>
          </Phone>
        </div>
      )}

      {/* ═══ BEAT 7: Message to Teacher + Final Collage ═══ */}
      {beatIndex >= 7 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: bvLast(7, 750),
        }}>
          {/* Main phone with chat */}
          {frame < 7 * BEAT + 60 && (
            <Phone>
              <PhoneStatusBar />
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 44px)' }}>
                {/* Chat header */}
                <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: COLORS.emeraldBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 700, color: COLORS.emerald }}>박</div>
                  <div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>박선생님</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.emerald }}>온라인</div>
                  </div>
                </div>
                {/* Messages */}
                <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'flex-end' }}>
                  {PARENT_CHAT.map((msg, i) => {
                    const d = stagger(i, 7 * BEAT + 3, 6);
                    return (
                      <div key={i} style={{
                        display: 'flex', justifyContent: msg.sent ? 'flex-end' : 'flex-start',
                        opacity: fadeIn(frame, d, 5),
                      }}>
                        <div style={{
                          maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                          background: msg.sent ? COLORS.primary : COLORS.bg,
                          fontFamily: FONT_FAMILY, fontSize: 12, lineHeight: 1.6,
                          color: msg.sent ? COLORS.white : COLORS.textPrimary,
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Input */}
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, opacity: fadeIn(frame, 7 * BEAT + 22, 5) }}>
                  <div style={{ flex: 1, height: 36, borderRadius: 10, background: COLORS.bg, border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>메시지 입력...</span>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: COLORS.white, fontSize: 14 }}>↑</span>
                  </div>
                </div>
              </div>
            </Phone>
          )}

          {/* Collage transition */}
          {frame >= 7 * BEAT + 60 && (
            <div style={{
              display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center',
              opacity: fadeIn(frame, 7 * BEAT + 60, 8),
              transform: `scale(${interpolate(frame, [7 * BEAT + 60, 7 * BEAT + 70], [0.8, 0.65], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
            }}>
              {/* Mini phone screens showing key features */}
              {[
                { title: '대시보드', icon: '📊', color: COLORS.primary },
                { title: '성적 확인', icon: '📈', color: COLORS.emerald },
                { title: '수납 내역', icon: '💳', color: COLORS.amber },
                { title: '주간 리포트', icon: '📋', color: COLORS.purple },
                { title: '메시지', icon: '✉️', color: COLORS.primary },
              ].map((screen, i) => {
                const d = stagger(i, 7 * BEAT + 62, 3);
                return (
                  <div key={i} style={{
                    width: 160, height: 280, borderRadius: 20, background: '#000', padding: 4,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                    opacity: fadeIn(frame, d, 5), transform: `scale(${popScale(frame, fps, d)})`,
                  }}>
                    <div style={{
                      width: '100%', height: '100%', borderRadius: 16, background: COLORS.white,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 32 }}>{screen.icon}</span>
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 700, color: screen.color }}>{screen.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};

export default ParentAppScene;
