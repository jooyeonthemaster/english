import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT, MOCK_KPIS, MOCK_STUDENT_TREND, MOCK_REVENUE_TREND, MOCK_CLASSES } from '../utils/constants';
import {
  fadeIn, fadeOut, popScale, countUp, stagger, slideUp, hookScale,
  drawLine, getBeatInfo, pulseGlow, progressBar, slideLeft, slideRight,
} from '../utils/animations';
import { AppShell, Badge } from '../components/MockUI';
import { Background } from '../components/Background';

// ─── Helper: format Korean currency ───
const formatKRW = (n: number) => '₩' + n.toLocaleString();

// ─── Donut arc path ───
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { currentBeat, beatFrame } = getBeatInfo(frame, BEAT);

  // ─── BEAT 0: HOOK ───
  const renderBeat0 = () => {
    const titleScale = hookScale(frame, fps, 5);
    const titleOp = fadeIn(frame, 0, 5);
    const subtitleOp = fadeIn(frame, 15, 8);
    const exitOp = frame > BEAT - 8 ? fadeOut(frame, BEAT - 8, 8) : 1;

    return (
      <AbsoluteFill style={{ opacity: exitOp }}>
        <Background variant="gradient" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(-50%, -50%) scale(${titleScale})`,
          textAlign: 'center', opacity: titleOp,
        }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>📊</div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 56, fontWeight: 900,
            color: COLORS.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.3,
          }}>
            실시간 학원 현황을<br />한눈에
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 400,
            color: COLORS.textSecondary, marginTop: 16, opacity: subtitleOp,
          }}>
            대시보드 하나로 모든 경영 지표를 확인하세요
          </div>
        </div>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 1: KPI Cards ───
  const renderBeat1 = () => {
    const bf = frame - BEAT;
    const enterOp = fadeIn(frame, BEAT, 5);
    const kpis = [
      { label: '전체 원생', value: countUp(bf, 187, 3, 20), unit: '명', delta: '+12', color: COLORS.primary },
      { label: '수납률', value: countUp(bf, 942, 5, 20) / 10, unit: '%', delta: '↑2.1%', color: COLORS.emerald },
      { label: '출석률', value: countUp(bf, 968, 7, 20) / 10, unit: '%', delta: '', color: COLORS.cyan },
      { label: '이번달 매출', value: formatKRW(countUp(bf, 24500000, 9, 25)), unit: '', delta: '', color: COLORS.amber },
    ];

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={0}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {kpis.map((kpi, i) => {
              const s = popScale(frame, fps, BEAT + stagger(i, 3, 2));
              return (
                <div key={i} style={{
                  flex: 1, background: COLORS.white, borderRadius: 16,
                  padding: '20px 22px', border: `1px solid ${COLORS.border}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transform: `scale(${s})`,
                }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 500, color: COLORS.textMuted, marginBottom: 8 }}>
                    {kpi.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 800, color: COLORS.textPrimary }}>
                      {kpi.label === '이번달 매출' ? kpi.value : `${kpi.value}${kpi.unit}`}
                    </span>
                    {kpi.delta && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.emerald, marginLeft: 6 }}>
                        {kpi.delta}
                      </span>
                    )}
                  </div>
                  <div style={{ width: '100%', height: 3, background: COLORS.border, borderRadius: 2, marginTop: 12 }}>
                    <div style={{
                      width: `${progressBar(bf, 100, stagger(i, 5, 3), 25)}%`,
                      height: '100%', background: kpi.color, borderRadius: 2,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 2: Student trend line chart ───
  const renderBeat2 = () => {
    const bf = frame - BEAT * 2;
    const enterOp = fadeIn(frame, BEAT * 2, 5);
    const data = MOCK_STUDENT_TREND;
    const maxV = 200;
    const minV = 150;
    const chartW = 900;
    const chartH = 200;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * chartW;
      const y = chartH - ((d.count - minV) / (maxV - minV)) * chartH;
      return `${x},${y}`;
    }).join(' ');
    const lineLen = drawLine(bf, 3, 40);

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={0}>
          {/* Mini KPIs at top */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, transform: 'scale(0.65)', transformOrigin: 'top left' }}>
            {['전체 원생: 187명', '수납률: 94.2%', '출석률: 96.8%', '매출: ₩24,500,000'].map((t, i) => (
              <div key={i} style={{
                background: COLORS.white, borderRadius: 10, padding: '10px 18px',
                fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary,
                border: `1px solid ${COLORS.border}`,
              }}>{t}</div>
            ))}
          </div>
          {/* Chart card */}
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: '24px 28px',
            border: `1px solid ${COLORS.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
              원생 추이 (최근 6개월)
            </div>
            <svg width={chartW} height={chartH + 40} viewBox={`0 0 ${chartW} ${chartH + 40}`}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                <line key={i} x1={0} y1={chartH * p} x2={chartW} y2={chartH * p}
                  stroke={COLORS.border} strokeWidth={1} />
              ))}
              {/* Line */}
              <polyline
                points={points} fill="none" stroke={COLORS.primary} strokeWidth={3}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={1200} strokeDashoffset={1200 - (lineLen / 100) * 1200}
              />
              {/* Area fill */}
              <polygon
                points={`0,${chartH} ${points} ${chartW},${chartH}`}
                fill={`${COLORS.primary}15`}
                opacity={fadeIn(bf, 20, 15)}
              />
              {/* Data points */}
              {data.map((d, i) => {
                const x = (i / (data.length - 1)) * chartW;
                const y = chartH - ((d.count - minV) / (maxV - minV)) * chartH;
                const dotOp = fadeIn(bf, 15 + i * 4, 5);
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={5} fill={COLORS.primary} opacity={dotOp} />
                    <text x={x} y={y - 12} textAnchor="middle"
                      fill={COLORS.textPrimary} fontSize={12} fontWeight={700} fontFamily={FONT_FAMILY}
                      opacity={dotOp}>{d.count}</text>
                    <text x={x} y={chartH + 20} textAnchor="middle"
                      fill={COLORS.textMuted} fontSize={11} fontFamily={FONT_FAMILY}>{d.month}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 3: Revenue bar chart ───
  const renderBeat3 = () => {
    const bf = frame - BEAT * 3;
    const enterOp = fadeIn(frame, BEAT * 3, 5);
    const data = MOCK_REVENUE_TREND;
    const maxV = 28;
    const chartH = 200;
    const barW = 36;

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={0}>
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: '24px 28px',
            border: `1px solid ${COLORS.border}`, marginTop: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
                매출 vs 지출 (최근 6개월, 단위: 백만원)
              </span>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.primary }} />
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textSecondary }}>매출</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.rose }} />
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textSecondary }}>지출</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32, height: chartH, paddingTop: 20 }}>
              {data.map((d, i) => {
                const revH = progressBar(bf, (d.revenue / maxV) * chartH, stagger(i, 3, 3), 20);
                const expH = progressBar(bf, (d.expense / maxV) * chartH, stagger(i, 5, 3), 20);
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: chartH }}>
                      <div style={{
                        width: barW, height: revH, background: COLORS.primary,
                        borderRadius: '4px 4px 0 0',
                      }} />
                      <div style={{
                        width: barW, height: expH, background: COLORS.rose,
                        borderRadius: '4px 4px 0 0', opacity: 0.7,
                      }} />
                    </div>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
                      {d.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 4: Donut + Today's classes ───
  const renderBeat4 = () => {
    const bf = frame - BEAT * 4;
    const enterOp = fadeIn(frame, BEAT * 4, 5);
    const donutData = [
      { label: '완납', pct: 72, color: COLORS.emerald },
      { label: '미납', pct: 18, color: COLORS.amber },
      { label: '연체', pct: 10, color: COLORS.rose },
    ];
    const donutProgress = progressBar(bf, 1, 3, 25);
    let cumAngle = 0;

    const todayClasses = MOCK_CLASSES.slice(0, 3);

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={0}>
          <div style={{ display: 'flex', gap: 20 }}>
            {/* Donut */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: '24px',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                수납 현황
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                <svg width={160} height={160} viewBox="0 0 160 160">
                  {donutData.map((d, i) => {
                    const start = cumAngle;
                    const sweep = (d.pct / 100) * 360 * donutProgress;
                    cumAngle += sweep;
                    return (
                      <path key={i} d={arcPath(80, 80, 60, start, start + Math.max(sweep - 2, 0))}
                        fill="none" stroke={d.color} strokeWidth={20} strokeLinecap="round" />
                    );
                  })}
                  <text x={80} y={76} textAnchor="middle" fill={COLORS.textPrimary}
                    fontSize={24} fontWeight={800} fontFamily={FONT_FAMILY}>
                    {Math.round(72 * donutProgress)}%
                  </text>
                  <text x={80} y={96} textAnchor="middle" fill={COLORS.textMuted}
                    fontSize={11} fontFamily={FONT_FAMILY}>완납률</text>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {donutData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }} />
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textSecondary }}>
                        {d.label} {d.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Today's classes */}
            <div style={{
              flex: 1, background: COLORS.white, borderRadius: 16, padding: '24px',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                오늘의 수업
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {todayClasses.map((cls, i) => {
                  const y = slideUp(frame, fps, BEAT * 4 + stagger(i, 5, 3));
                  const op = fadeIn(frame, BEAT * 4 + stagger(i, 5, 3), 5);
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', borderRadius: 10, background: COLORS.bg,
                      opacity: op, transform: `translateY(${y}px)`,
                    }}>
                      <div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                          {cls.name}
                        </div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                          {cls.schedule} · {cls.teacher}
                        </div>
                      </div>
                      <Badge text={i === 0 ? '진행중' : '예정'}
                        color={i === 0 ? COLORS.emerald : COLORS.primary}
                        bg={i === 0 ? COLORS.emeraldBg : COLORS.primaryBg} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 5: Today's classes detail ───
  const renderBeat5 = () => {
    const bf = frame - BEAT * 5;
    const enterOp = fadeIn(frame, BEAT * 5, 5);
    const classes = [
      { time: '14:00~15:30', name: '중등 기초반', teacher: '박선생', room: 'A201', status: '종료', statusColor: COLORS.textMuted },
      { time: '16:00~17:30', name: '중등 심화반', teacher: '김선생', room: 'A202', status: '진행중', statusColor: COLORS.emerald },
      { time: '18:00~19:30', name: '고등 내신반', teacher: '이선생', room: 'B101', status: '예정', statusColor: COLORS.primary },
      { time: '18:00~20:00', name: '고등 수능반', teacher: '박선생', room: 'B102', status: '예정', statusColor: COLORS.primary },
    ];

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={0}>
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: '24px',
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 20 }}>
              📅 오늘의 수업 상세
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {classes.map((cls, i) => {
                const s = popScale(frame, fps, BEAT * 5 + stagger(i, 3, 2));
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 20px', borderRadius: 12, background: COLORS.bg,
                    transform: `scale(${s})`,
                  }}>
                    <div style={{
                      fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700,
                      color: COLORS.primary, minWidth: 110,
                    }}>{cls.time}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
                        {cls.name}
                      </div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                        {cls.teacher} · {cls.room}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: cls.statusColor }} />
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: cls.statusColor }}>
                        {cls.status}
                      </span>
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

  // ─── BEAT 6: Overdue payments ───
  const renderBeat6 = () => {
    const bf = frame - BEAT * 6;
    const enterOp = fadeIn(frame, BEAT * 6, 5);
    const overdues = [
      { name: '정우진', amount: 280000, days: 27 },
      { name: '이서준', amount: 280000, days: 23 },
      { name: '최예린', amount: 125000, days: 12 },
    ];
    const totalOwed = countUp(bf, 685000, 8, 20);

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={0}>
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: '24px',
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🚨</span>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.rose }}>
                  미수납 현황
                </span>
              </div>
              <div style={{
                fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 800, color: COLORS.rose,
              }}>
                {formatKRW(totalOwed)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {overdues.map((item, i) => {
                const x = slideLeft(frame, fps, BEAT * 6 + stagger(i, 3, 3));
                const op = fadeIn(frame, BEAT * 6 + stagger(i, 3, 3), 5);
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 20px', borderRadius: 12, background: COLORS.roseBg,
                    border: `1px solid rgba(244,63,94,0.15)`,
                    opacity: op, transform: `translateX(${x}px)`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, background: COLORS.rose,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700,
                      }}>{item.name[0]}</div>
                      <div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
                          {item.name}
                        </div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.rose }}>
                          {item.days}일 경과
                        </div>
                      </div>
                    </div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.rose }}>
                      {formatKRW(item.amount)}
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

  // ─── BEAT 7: Weekly alerts ───
  const renderBeat7 = () => {
    const bf = frame - BEAT * 7;
    const enterOp = fadeIn(frame, BEAT * 7, 5);
    const alerts = [
      { icon: '🎉', text: '신규 등록: 이하율 (예비중, 강일초6)', time: '10분 전', color: COLORS.emerald },
      { icon: '💬', text: '상담 요청: 김민서 학부모 (성적 상담)', time: '1시간 전', color: COLORS.primary },
      { icon: '⚠️', text: '수납 연체: 정우진 (27일 경과)', time: '오늘', color: COLORS.rose },
    ];

    return (
      <AbsoluteFill style={{ opacity: enterOp }}>
        <AppShell activeNav={0}>
          <div style={{
            background: COLORS.white, borderRadius: 16, padding: '24px',
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 20 }}>
              🔔 이번 주 알림
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {alerts.map((alert, i) => {
                const s = popScale(frame, fps, BEAT * 7 + stagger(i, 3, 3));
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px', borderRadius: 12, background: COLORS.bg,
                    transform: `scale(${s})`,
                  }}>
                    <span style={{ fontSize: 24 }}>{alert.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                        {alert.text}
                      </div>
                    </div>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>
                      {alert.time}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </AppShell>
      </AbsoluteFill>
    );
  };

  // ─── BEAT 8: Zoom out + pulse sweep ───
  const renderBeat8 = () => {
    const bf = frame - BEAT * 8;
    const enterOp = fadeIn(frame, BEAT * 8, 5);
    const zoomScale = interpolate(bf, [0, 30], [1, 0.82], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const sweepX = interpolate(bf, [15, 60], [-200, 2000], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const exitOp = bf > 90 ? fadeOut(frame, BEAT * 8 + 90, 30) : 1;

    return (
      <AbsoluteFill style={{ opacity: enterOp * exitOp }}>
        <div style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center', width: '100%', height: '100%' }}>
          <AppShell activeNav={0}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              {['전체 원생: 187명', '수납률: 94.2%', '출석률: 96.8%', '매출: ₩24,500,000'].map((t, i) => (
                <div key={i} style={{
                  flex: 1, background: COLORS.white, borderRadius: 12, padding: '14px 18px',
                  fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.border}`,
                }}>{t}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 2, height: 180, background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}` }} />
              <div style={{ flex: 1, height: 180, background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}` }} />
            </div>
          </AppShell>
          {/* Blue sweep highlight */}
          <div style={{
            position: 'absolute', top: 0, left: sweepX, width: 120, height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.12), transparent)',
            pointerEvents: 'none',
          }} />
        </div>
      </AbsoluteFill>
    );
  };

  // ─── Render current beat ───
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

export default DashboardScene;
