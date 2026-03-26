import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS, FONT_FAMILY, BEAT, MOCK_INVOICES, MOCK_EXPENSES, MOCK_REVENUE_TREND } from '../utils/constants';
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
  getBeatInfo,
} from '../utils/animations';
import { Background } from '../components/Background';
import { Badge } from '../components/MockUI';

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  '완납': { color: COLORS.emerald, bg: COLORS.emeraldBg },
  '미납': { color: COLORS.amber, bg: COLORS.amberBg },
  '연체': { color: COLORS.rose, bg: COLORS.roseBg },
  '부분납': { color: COLORS.primary, bg: COLORS.primaryBg },
};

const PAY_METHODS = ['카드', '계좌이체', '현금', '카카오페이', '네이버페이', '토스'];

const SALARY_DATA = [
  { name: '박선생', role: '수석강사', base: 2800000, bonus: 300000, deduction: 280000, net: 2820000 },
  { name: '김선생', role: '강사', base: 2400000, bonus: 200000, deduction: 240000, net: 2360000 },
  { name: '이선생', role: '강사', base: 2400000, bonus: 250000, deduction: 240000, net: 2410000 },
  { name: '최선생', role: '보조강사', base: 1800000, bonus: 100000, deduction: 180000, net: 1720000 },
  { name: '정선생', role: '행정', base: 2200000, bonus: 150000, deduction: 220000, net: 2130000 },
];

// Shared mini sidebar
const MiniSidebar: React.FC<{ activeNav: number; opacity: number }> = ({ activeNav, opacity }) => {
  const NAV = [
    { icon: '📊', label: '대시보드' },
    { icon: '👥', label: '학생 관리' },
    { icon: '📖', label: '반 관리' },
    { icon: '✅', label: '출결 관리' },
    { icon: '📝', label: '과제 관리' },
    { icon: '✨', label: 'AI 워크벤치' },
    { icon: '🎓', label: '시험 관리' },
    { icon: '🗄️', label: '문제 은행' },
    { icon: '💳', label: '수납 관리' },
    { icon: '📈', label: '재무 관리' },
    { icon: '👛', label: '급여 관리' },
    { icon: '📢', label: '공지사항' },
    { icon: '✉️', label: '메시지' },
    { icon: '💬', label: '상담 관리' },
    { icon: '📅', label: '일정 관리' },
  ];
  return (
    <div style={{ width: 200, height: '100%', background: 'rgba(255,255,255,0.65)', borderRight: `1px solid ${COLORS.border}`, padding: '16px 8px', opacity, flexShrink: 0 }}>
      <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, padding: '0 12px', marginBottom: 16 }}>
        NARA <span style={{ fontSize: 8, color: COLORS.textMuted, letterSpacing: 2 }}>ERP</span>
      </div>
      {NAV.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 8, fontSize: 11,
          fontWeight: i === activeNav ? 600 : 400, fontFamily: FONT_FAMILY,
          color: i === activeNav ? COLORS.primary : COLORS.textSecondary,
          background: i === activeNav ? 'rgba(59,130,246,0.08)' : 'transparent', marginBottom: 1,
        }}>
          <span style={{ fontSize: 12 }}>{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const TopBarMini: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div style={{
    height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', borderBottom: `1px solid ${COLORS.border}`, background: 'rgba(244,246,249,0.75)', opacity, flexShrink: 0,
  }}>
    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>다른영어학원</span>
    <div style={{ width: 24, height: 24, borderRadius: 6, background: COLORS.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'white', fontSize: 9, fontWeight: 700, fontFamily: FONT_FAMILY }}>JY</span>
    </div>
  </div>
);

const AppLayout: React.FC<{ activeNav: number; children: React.ReactNode; opacity: number }> = ({ activeNav, children, opacity }) => (
  <div style={{ display: 'flex', width: '100%', height: '100%', background: COLORS.bg, overflow: 'hidden', opacity }}>
    <MiniSidebar activeNav={activeNav} opacity={1} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <TopBarMini opacity={1} />
      <div style={{ flex: 1, padding: 24, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  </div>
);

const fmt = (n: number) => '₩' + n.toLocaleString();

const BusinessScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beatIndex = Math.floor(frame / BEAT);
  const bf = frame % BEAT; // frame within beat

  // Beat visibility helper
  const bv = (b: number) => {
    if (beatIndex !== b) return 0;
    const fi = fadeIn(frame, b * BEAT, 4);
    const fo = frame >= (b + 1) * BEAT - 4 ? fadeOut(frame, (b + 1) * BEAT - 4, 4) : 1;
    return fi * fo;
  };

  // Multi-beat visibility (from beat bStart to bEnd inclusive)
  const mbv = (bStart: number, bEnd: number) => {
    if (beatIndex < bStart || beatIndex > bEnd) return 0;
    const fi = fadeIn(frame, bStart * BEAT, 4);
    const fo = frame >= (bEnd + 1) * BEAT - 4 ? fadeOut(frame, (bEnd + 1) * BEAT - 4, 4) : 1;
    return fi * fo;
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
          <div style={{ fontSize: 80, marginBottom: 16, transform: `scale(${popScale(frame, fps, 0)})` }}>💰</div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 88, fontWeight: 900, color: COLORS.textPrimary,
            letterSpacing: '-0.04em', transform: `scale(${hookScale(frame, fps, 0)})`,
          }}>
            학원 경영의 모든 숫자
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 400, color: COLORS.textSecondary,
            marginTop: 16, opacity: fadeIn(frame, 12, 8),
          }}>
            수납 · 재무 · 급여를 한 화면에서
          </div>
        </div>
      )}

      {/* ═══ BEAT 1: 수납 관리 - KPI Cards ═══ */}
      {beatIndex === 1 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(1) }}>
          <AppLayout activeNav={8} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 20, opacity: fadeIn(frame, BEAT, 5) }}>
                💳 수납 관리
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: '이번달 청구', value: 8420000, color: COLORS.primary },
                  { label: '수납완료', value: 7230000, color: COLORS.emerald },
                  { label: '미수납', value: 1190000, color: COLORS.rose },
                  { label: '수납률', value: 85.9, color: COLORS.amber, suffix: '%', isPercent: true },
                ].map((kpi, i) => {
                  const d = stagger(i, BEAT + 3, 3);
                  const val = kpi.isPercent ? countUp(frame, kpi.value * 10, d, 20) / 10 : countUp(frame, kpi.value, d, 20);
                  const display = kpi.isPercent ? `${val.toFixed(1)}%` : fmt(val);
                  return (
                    <div key={i} style={{
                      flex: 1, background: COLORS.white, borderRadius: 14, padding: '18px 20px',
                      border: `1px solid ${COLORS.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      opacity: fadeIn(frame, d, 5), transform: `translateY(${slideUp(frame, fps, d)}px)`,
                    }}>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginBottom: 8 }}>{kpi.label}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 26, fontWeight: 800, color: kpi.color }}>{display}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 2: Invoice Table ═══ */}
      {beatIndex === 2 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(2) }}>
          <AppLayout activeNav={8} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14 }}>
                청구서 목록
              </div>
              <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', padding: '10px 16px', background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
                  {['학생명', '금액', '상태', '날짜'].map((h, i) => (
                    <span key={i} style={{ flex: i === 0 ? 1.5 : 1, fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, letterSpacing: 0.5 }}>{h}</span>
                  ))}
                </div>
                {/* Rows */}
                {MOCK_INVOICES.map((inv, i) => {
                  const d = stagger(i, 2 * BEAT + 3, 3);
                  const sc = STATUS_BADGE[inv.status] || { color: COLORS.textSecondary, bg: COLORS.bg };
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}`,
                      opacity: fadeIn(frame, d, 5), transform: `translateX(${slideLeft(frame, fps, d)}px)`,
                    }}>
                      <span style={{ flex: 1.5, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 500, color: COLORS.textPrimary }}>{inv.student}</span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textPrimary }}>{fmt(inv.amount)}</span>
                      <span style={{ flex: 1 }}><Badge text={inv.status} color={sc.color} bg={sc.bg} /></span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted }}>{inv.date}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 3: Payment Dialog ═══ */}
      {beatIndex === 3 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(3) }}>
          <AppLayout activeNav={8} opacity={1}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <div style={{
                width: 480, background: COLORS.white, borderRadius: 20, padding: 32,
                boxShadow: '0 20px 60px rgba(0,0,0,0.12)', border: `1px solid ${COLORS.border}`,
                opacity: fadeIn(frame, 3 * BEAT, 5), transform: `scale(${popScale(frame, fps, 3 * BEAT)})`,
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 24 }}>
                  💳 결제 등록
                </div>
                {/* Student selector */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>학생 선택</div>
                  <div style={{ height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textPrimary }}>김민서 (중2)</span>
                  </div>
                </div>
                {/* Amount */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>결제 금액</div>
                  <div style={{ height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.primary }}>₩320,000</span>
                  </div>
                </div>
                {/* Payment methods */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8 }}>결제 수단</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {PAY_METHODS.map((m, i) => {
                      const d = stagger(i, 3 * BEAT + 8, 2);
                      const isSelected = i === 0;
                      return (
                        <div key={i} style={{
                          padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: FONT_FAMILY,
                          background: isSelected ? COLORS.primary : COLORS.bg,
                          color: isSelected ? COLORS.white : COLORS.textSecondary,
                          border: `1px solid ${isSelected ? COLORS.primary : COLORS.border}`,
                          opacity: fadeIn(frame, d, 4), transform: `scale(${popScale(frame, fps, d)})`,
                        }}>
                          {m}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Button */}
                <div style={{
                  height: 44, borderRadius: 12, background: COLORS.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: fadeIn(frame, 3 * BEAT + 20, 5),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.white }}>결제 등록</span>
                </div>
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 4: Revenue vs Expense Chart ═══ */}
      {beatIndex === 4 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(4) }}>
          <AppLayout activeNav={9} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 20 }}>
                📈 재무 관리
              </div>
              <div style={{ background: COLORS.white, borderRadius: 14, padding: 24, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 16 }}>
                  수입 vs 지출 (단위: 백만원)
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, height: 280, padding: '0 10px' }}>
                  {MOCK_REVENUE_TREND.map((d, i) => {
                    const delay = stagger(i, 4 * BEAT + 5, 4);
                    const barGrow = progressBar(frame, 1, delay, 20);
                    const maxVal = 26;
                    const revH = (d.revenue / maxVal) * 240 * barGrow;
                    const expH = (d.expense / maxVal) * 240 * barGrow;
                    const netProfit = d.revenue - d.expense;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, fontWeight: 600, color: COLORS.emerald, opacity: fadeIn(frame, delay + 15, 5) }}>
                          +{netProfit.toFixed(1)}
                        </span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 240 }}>
                          <div style={{ width: 28, height: revH, background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.primaryLight} 100%)`, borderRadius: '4px 4px 0 0' }} />
                          <div style={{ width: 28, height: expH, background: `linear-gradient(180deg, ${COLORS.rose} 0%, #FDA4AF 100%)`, borderRadius: '4px 4px 0 0' }} />
                        </div>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>{d.month}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 24, marginTop: 12, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.primary }} />
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textSecondary }}>수입</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.rose }} />
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textSecondary }}>지출</span>
                  </div>
                </div>
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 5: Expense Breakdown ═══ */}
      {beatIndex === 5 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(5) }}>
          <AppLayout activeNav={9} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                지출 항목별 분석
              </div>
              <div style={{ background: COLORS.white, borderRadius: 14, padding: 24, border: `1px solid ${COLORS.border}` }}>
                {MOCK_EXPENSES.map((exp, i) => {
                  const d = stagger(i, 5 * BEAT + 3, 3);
                  const barW = progressBar(frame, exp.percent, d, 20);
                  const barColors = [COLORS.primary, COLORS.emerald, COLORS.amber, COLORS.purple, COLORS.cyan, COLORS.rose];
                  return (
                    <div key={i} style={{ marginBottom: 16, opacity: fadeIn(frame, d, 5) }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{exp.category}</span>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary }}>{fmt(exp.amount)}</span>
                          <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700, color: barColors[i] }}>{exp.percent}%</span>
                        </div>
                      </div>
                      <div style={{ height: 8, background: COLORS.bg, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${barW}%`, height: '100%', background: barColors[i], borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{
                  marginTop: 8, paddingTop: 16, borderTop: `1px solid ${COLORS.border}`,
                  display: 'flex', justifyContent: 'space-between', opacity: fadeIn(frame, 5 * BEAT + 25, 5),
                }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>총 지출</span>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 800, color: COLORS.rose }}>₩16,100,000</span>
                </div>
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 6: Financial Summary ═══ */}
      {beatIndex === 6 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(6) }}>
          <AppLayout activeNav={9} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 20 }}>
                이달 재무 요약
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: '순이익', value: '₩8,400,000', color: COLORS.emerald, bg: COLORS.emeraldBg, icon: '📈' },
                  { label: '마진율', value: '34.3%', color: COLORS.primary, bg: COLORS.primaryBg, icon: '📊' },
                  { label: '전월대비', value: '+5.2%', color: COLORS.emerald, bg: COLORS.emeraldBg, icon: '🔺' },
                ].map((stat, i) => {
                  const d = stagger(i, 6 * BEAT + 3, 4);
                  return (
                    <div key={i} style={{
                      flex: 1, background: COLORS.white, borderRadius: 16, padding: '28px 24px',
                      border: `1px solid ${COLORS.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      opacity: fadeIn(frame, d, 5), transform: `translateY(${slideUp(frame, fps, d)}px) scale(${popScale(frame, fps, d)})`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 24 }}>{stat.icon}</span>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 500, color: COLORS.textMuted }}>{stat.label}</span>
                      </div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 36, fontWeight: 900, color: stat.color }}>{stat.value}</div>
                    </div>
                  );
                })}
              </div>
              {/* Mini profit trend */}
              <div style={{
                marginTop: 20, background: COLORS.white, borderRadius: 14, padding: '16px 24px',
                border: `1px solid ${COLORS.border}`, opacity: fadeIn(frame, 6 * BEAT + 18, 8),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 12 }}>월별 순이익 추이</div>
                <svg width="100%" height="60" viewBox="0 0 600 60">
                  {[6.4, 7.0, 7.2, 8.3, 8.1, 8.4].map((v, i) => {
                    const x = i * 110 + 30;
                    const y = 55 - (v / 9) * 50;
                    const progress = progressBar(frame, 1, 6 * BEAT + 20 + i * 2, 15);
                    return (
                      <React.Fragment key={i}>
                        {i > 0 && (
                          <line
                            x1={(i - 1) * 110 + 30} y1={55 - ([6.4, 7.0, 7.2, 8.3, 8.1, 8.4][i - 1] / 9) * 50}
                            x2={x} y2={y} stroke={COLORS.emerald} strokeWidth={2.5}
                            strokeDasharray={100} strokeDashoffset={100 - progress * 100}
                          />
                        )}
                        <circle cx={x} cy={y} r={4} fill={COLORS.emerald} opacity={progress} />
                      </React.Fragment>
                    );
                  })}
                </svg>
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 7: Salary Table ═══ */}
      {beatIndex === 7 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(7) }}>
          <AppLayout activeNav={10} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                👛 급여 관리 — 2026년 3월
              </div>
              <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', padding: '10px 16px', background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
                  {['이름', '직급', '기본급', '수당', '공제', '실지급'].map((h, i) => (
                    <span key={i} style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{h}</span>
                  ))}
                </div>
                {SALARY_DATA.map((s, i) => {
                  const d = stagger(i, 7 * BEAT + 3, 3);
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: `1px solid ${COLORS.border}`,
                      opacity: fadeIn(frame, d, 5), transform: `translateX(${slideLeft(frame, fps, d)}px)`,
                    }}>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{s.name}</span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textSecondary }}>{s.role}</span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textPrimary }}>{fmt(s.base)}</span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.emerald }}>+{fmt(s.bonus)}</span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.rose }}>-{fmt(s.deduction)}</span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.primary }}>{fmt(s.net)}</span>
                    </div>
                  );
                })}
                {/* Total */}
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'rgba(59,130,246,0.04)',
                  opacity: fadeIn(frame, 7 * BEAT + 20, 5),
                }}>
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>합계</span>
                  <span style={{ flex: 1 }} /><span style={{ flex: 1 }} /><span style={{ flex: 1 }} /><span style={{ flex: 1 }} />
                  <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 800, color: COLORS.primary }}>₩11,440,000</span>
                </div>
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 8: Monthly Salary Summary ═══ */}
      {beatIndex >= 8 && (
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(frame, 8 * BEAT, 4) * (frame >= 780 - 8 ? fadeOut(frame, 780 - 8, 8) : 1) }}>
          <AppLayout activeNav={10} opacity={1}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <div style={{
                width: 520, background: COLORS.white, borderRadius: 20, padding: 36,
                boxShadow: '0 20px 60px rgba(0,0,0,0.08)', border: `1px solid ${COLORS.border}`,
                transform: `scale(${popScale(frame, fps, 8 * BEAT)})`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, background: COLORS.emeraldBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                  }}>
                    ✅
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: 700, color: COLORS.textPrimary }}>3월 급여 지급완료</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>2026.03.25 처리</div>
                  </div>
                </div>
                <div style={{
                  background: COLORS.bg, borderRadius: 14, padding: 24, marginBottom: 20,
                  opacity: fadeIn(frame, 8 * BEAT + 8, 5),
                }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted, marginBottom: 8 }}>총 급여 지급액</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 40, fontWeight: 900, color: COLORS.primary }}>
                    ₩{countUp(frame, 4200000, 8 * BEAT + 5, 25).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, opacity: fadeIn(frame, 8 * BEAT + 15, 5) }}>
                  {[
                    { label: '지급 인원', value: '5명' },
                    { label: '이체 완료', value: '5/5' },
                    { label: '처리 상태', value: '완료', color: COLORS.emerald },
                  ].map((item, i) => (
                    <div key={i} style={{
                      flex: 1, background: COLORS.bg, borderRadius: 10, padding: '12px 16px', textAlign: 'center',
                    }}>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: 700, color: item.color || COLORS.textPrimary }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AppLayout>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default BusinessScene;
