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
  progressBar,
  getBeatInfo,
  pulseGlow,
} from '../utils/animations';
import { Background } from '../components/Background';
import { Badge } from '../components/MockUI';

const NOTICES = [
  { title: '3월 시간표 변경 안내', scope: '전체', date: '3/20', reads: 85, total: 100, pinned: true },
  { title: '중등 심화반 보강 안내', scope: '반별', date: '3/18', reads: 10, total: 12, pinned: false },
  { title: '4월 학부모 상담 일정', scope: '학부모', date: '3/15', reads: 62, total: 80, pinned: false },
];

const SCOPE_COLORS: Record<string, { color: string; bg: string }> = {
  '전체': { color: COLORS.primary, bg: COLORS.primaryBg },
  '반별': { color: COLORS.emerald, bg: COLORS.emeraldBg },
  '학부모': { color: COLORS.amber, bg: COLORS.amberBg },
};

const CONVERSATIONS = [
  { name: '김민서 학부모', preview: '다음 주 상담 가능할까요?', time: '2분 전', unread: 2 },
  { name: '이서준 학부모', preview: '시험 결과 확인했습니다', time: '1시간 전', unread: 0 },
  { name: '박하은 학부모', preview: '감사합니다 선생님', time: '어제', unread: 0 },
];

const CHAT_MSGS = [
  { sent: false, text: '선생님 안녕하세요, 민서 시험 성적이 많이 올랐네요!' },
  { sent: true, text: '네 어머니, 민서가 요즘 정말 열심히 하고 있어요 😊' },
  { sent: false, text: '다음 주 상담 가능할까요? 진도 상담 하고 싶어요' },
  { sent: true, text: '네, 화요일 4시 어떠세요?' },
];

const CONSULTATIONS = [
  { student: '김민서', type: '학부모 상담', date: '3/22', status: '완료', badge: COLORS.emerald },
  { student: '정우진', type: '학생 상담', date: '3/21', status: '후속 필요', badge: COLORS.amber },
  { student: '새학생A', type: '신규 문의', date: '3/20', status: '대기', badge: COLORS.primary },
  { student: '최예린', type: '학부모 상담', date: '3/19', status: '완료', badge: COLORS.emerald },
];

const CALENDAR_EVENTS = [
  { icon: '📝', title: '중등 모의고사', time: '10:00', color: COLORS.primary },
  { icon: '💬', title: '학부모 상담', time: '14:00', color: COLORS.amber },
  { icon: '📢', title: '강사 회의', time: '16:00', color: COLORS.purple },
  { icon: '🎉', title: '이벤트 수업', time: '18:00', color: COLORS.emerald },
];

// Reusable mini sidebar
const MiniSidebar: React.FC<{ activeNav: number }> = ({ activeNav }) => {
  const NAV = [
    { icon: '📊', label: '대시보드' }, { icon: '👥', label: '학생 관리' }, { icon: '📖', label: '반 관리' },
    { icon: '✅', label: '출결 관리' }, { icon: '📝', label: '과제 관리' }, { icon: '✨', label: 'AI 워크벤치' },
    { icon: '🎓', label: '시험 관리' }, { icon: '🗄️', label: '문제 은행' }, { icon: '💳', label: '수납 관리' },
    { icon: '📈', label: '재무 관리' }, { icon: '👛', label: '급여 관리' }, { icon: '📢', label: '공지사항' },
    { icon: '✉️', label: '메시지' }, { icon: '💬', label: '상담 관리' }, { icon: '📅', label: '일정 관리' },
  ];
  return (
    <div style={{ width: 200, height: '100%', background: 'rgba(255,255,255,0.65)', borderRight: `1px solid ${COLORS.border}`, padding: '16px 8px', flexShrink: 0 }}>
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
          <span style={{ fontSize: 12 }}>{item.icon}</span><span>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const TopBarMini: React.FC = () => (
  <div style={{
    height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', borderBottom: `1px solid ${COLORS.border}`, background: 'rgba(244,246,249,0.75)', flexShrink: 0,
  }}>
    <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>다른영어학원</span>
    <div style={{ width: 24, height: 24, borderRadius: 6, background: COLORS.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'white', fontSize: 9, fontWeight: 700, fontFamily: FONT_FAMILY }}>JY</span>
    </div>
  </div>
);

const AppLayout: React.FC<{ activeNav: number; children: React.ReactNode; opacity: number }> = ({ activeNav, children, opacity }) => (
  <div style={{ display: 'flex', width: '100%', height: '100%', background: COLORS.bg, overflow: 'hidden', opacity }}>
    <MiniSidebar activeNav={activeNav} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <TopBarMini />
      <div style={{ flex: 1, padding: 24, overflow: 'hidden' }}>{children}</div>
    </div>
  </div>
);

const CommunicationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beatIndex = Math.floor(frame / BEAT);

  const bv = (b: number) => {
    if (beatIndex !== b) return 0;
    return fadeIn(frame, b * BEAT, 4) * (frame >= (b + 1) * BEAT - 4 ? fadeOut(frame, (b + 1) * BEAT - 4, 4) : 1);
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
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {['💬', '📢', '📅'].map((icon, i) => (
              <span key={i} style={{ fontSize: 60, transform: `scale(${popScale(frame, fps, i * 3)})` }}>{icon}</span>
            ))}
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 88, fontWeight: 900, color: COLORS.textPrimary,
            letterSpacing: '-0.04em', transform: `scale(${hookScale(frame, fps, 0)})`,
          }}>
            학원 소통을 하나로
          </div>
          <div style={{
            fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: 400, color: COLORS.textSecondary,
            marginTop: 16, opacity: fadeIn(frame, 12, 8),
          }}>
            공지 · 메시지 · 상담 · 일정
          </div>
        </div>
      )}

      {/* ═══ BEAT 1: 공지사항 ═══ */}
      {beatIndex === 1 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(1) }}>
          <AppLayout activeNav={11} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                📢 공지사항
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {NOTICES.map((notice, i) => {
                  const d = stagger(i, BEAT + 3, 4);
                  const sc = SCOPE_COLORS[notice.scope] || { color: COLORS.textSecondary, bg: COLORS.bg };
                  const readPct = progressBar(frame, (notice.reads / notice.total) * 100, d + 10, 20);
                  return (
                    <div key={i} style={{
                      background: COLORS.white, borderRadius: 14, padding: '18px 22px',
                      border: `1px solid ${notice.pinned ? COLORS.primaryLight : COLORS.border}`,
                      boxShadow: notice.pinned ? '0 2px 12px rgba(59,130,246,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                      opacity: fadeIn(frame, d, 5), transform: `translateY(${slideUp(frame, fps, d)}px)`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        {notice.pinned && <span style={{ fontSize: 14 }}>📌</span>}
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>{notice.title}</span>
                        <Badge text={notice.scope} color={sc.color} bg={sc.bg} />
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>{notice.date}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 6, background: COLORS.bg, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${readPct}%`, height: '100%', background: sc.color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>{notice.reads}/{notice.total}명 읽음</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 2: 메시지 ═══ */}
      {beatIndex === 2 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(2) }}>
          <AppLayout activeNav={12} opacity={1}>
            <div style={{ display: 'flex', gap: 16, height: '100%' }}>
              {/* Left: conversation list */}
              <div style={{ width: 280, background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>✉️ 메시지</span>
                </div>
                {CONVERSATIONS.map((conv, i) => {
                  const d = stagger(i, 2 * BEAT + 3, 3);
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                      borderBottom: `1px solid ${COLORS.border}`,
                      background: i === 0 ? 'rgba(59,130,246,0.04)' : 'transparent',
                      opacity: fadeIn(frame, d, 5),
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, background: COLORS.primaryBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 700, color: COLORS.primary,
                      }}>
                        {conv.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>{conv.name}</span>
                          <span style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{conv.time}</span>
                        </div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.preview}</div>
                      </div>
                      {conv.unread > 0 && (
                        <div style={{
                          width: 18, height: 18, borderRadius: 9, background: COLORS.rose,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: 700, color: COLORS.white,
                        }}>
                          {conv.unread}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Right: chat view */}
              <div style={{ flex: 1, background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 18px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: COLORS.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 700, color: COLORS.primary }}>김</div>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>김민서 학부모</span>
                </div>
                <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'flex-end' }}>
                  {CHAT_MSGS.map((msg, i) => {
                    const d = stagger(i, 2 * BEAT + 8, 5);
                    return (
                      <div key={i} style={{
                        display: 'flex', justifyContent: msg.sent ? 'flex-end' : 'flex-start',
                        opacity: fadeIn(frame, d, 5),
                      }}>
                        <div style={{
                          maxWidth: '70%', padding: '10px 14px', borderRadius: 14,
                          background: msg.sent ? COLORS.primary : COLORS.bg,
                          fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 400,
                          color: msg.sent ? COLORS.white : COLORS.textPrimary,
                          lineHeight: 1.5,
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Input bar */}
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, opacity: fadeIn(frame, 2 * BEAT + 30, 5) }}>
                  <div style={{ flex: 1, height: 36, borderRadius: 10, background: COLORS.bg, border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>메시지를 입력하세요...</span>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: COLORS.white, fontSize: 14 }}>↑</span>
                  </div>
                </div>
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 3: 상담 관리 List ═══ */}
      {beatIndex === 3 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(3) }}>
          <AppLayout activeNav={13} opacity={1}>
            <div>
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                💬 상담 관리
              </div>
              <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
                <div style={{ display: 'flex', padding: '10px 16px', background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
                  {['학생', '상담 유형', '날짜', '상태'].map((h, i) => (
                    <span key={i} style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>{h}</span>
                  ))}
                </div>
                {CONSULTATIONS.map((c, i) => {
                  const d = stagger(i, 3 * BEAT + 3, 3);
                  const typeBadge: Record<string, { color: string; bg: string }> = {
                    '신규 문의': { color: COLORS.primary, bg: COLORS.primaryBg },
                    '학생 상담': { color: COLORS.purple, bg: COLORS.purpleBg },
                    '학부모 상담': { color: COLORS.amber, bg: COLORS.amberBg },
                  };
                  const tb = typeBadge[c.type] || { color: COLORS.textSecondary, bg: COLORS.bg };
                  const statusColor = c.status === '완료' ? COLORS.emerald : c.status === '후속 필요' ? COLORS.amber : COLORS.primary;
                  const statusBg = c.status === '완료' ? COLORS.emeraldBg : c.status === '후속 필요' ? COLORS.amberBg : COLORS.primaryBg;
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}`,
                      opacity: fadeIn(frame, d, 5), transform: `translateX(${slideLeft(frame, fps, d)}px)`,
                      background: c.status === '후속 필요' ? 'rgba(245,158,11,0.03)' : 'transparent',
                    }}>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{c.student}</span>
                      <span style={{ flex: 1 }}><Badge text={c.type} color={tb.color} bg={tb.bg} /></span>
                      <span style={{ flex: 1, fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted }}>{c.date}</span>
                      <span style={{ flex: 1 }}><Badge text={c.status} color={statusColor} bg={statusBg} /></span>
                    </div>
                  );
                })}
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 4: Consultation Detail ═══ */}
      {beatIndex === 4 && (
        <div style={{ position: 'absolute', inset: 0, opacity: bv(4) }}>
          <AppLayout activeNav={13} opacity={1}>
            <div style={{ display: 'flex', gap: 20 }}>
              {/* Detail Card */}
              <div style={{
                flex: 2, background: COLORS.white, borderRadius: 16, padding: 28,
                border: `1px solid ${COLORS.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                opacity: fadeIn(frame, 4 * BEAT + 2, 5), transform: `translateX(${slideLeft(frame, fps, 4 * BEAT + 2)}px)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: COLORS.amberBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>💬</div>
                  <div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary }}>정우진 학생 상담</div>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted }}>2026.03.21 · 학생 상담</div>
                  </div>
                  <Badge text="후속 필요" color={COLORS.amber} bg={COLORS.amberBg} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>상담 내용</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.7, background: COLORS.bg, padding: 16, borderRadius: 10 }}>
                    최근 성적 하락 원인 파악. 학교 시험 기간과 겹쳐 학원 과제 수행률이 낮아짐. 학습 스케줄 재조정 필요.
                  </div>
                </div>
                <div style={{ marginBottom: 16, opacity: fadeIn(frame, 4 * BEAT + 12, 5) }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>후속 조치</div>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.amber, background: COLORS.amberBg, padding: 12, borderRadius: 10, fontWeight: 500 }}>
                    📅 다음 상담: 3/28 (토) · 학부모 동반 상담 예정
                  </div>
                </div>
              </div>
              {/* Timeline */}
              <div style={{
                flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
                border: `1px solid ${COLORS.border}`, opacity: fadeIn(frame, 4 * BEAT + 8, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>상담 이력</div>
                {[
                  { date: '3/21', type: '학생 상담', status: '후속 필요' },
                  { date: '2/15', type: '학부모 상담', status: '완료' },
                  { date: '1/10', type: '학생 상담', status: '완료' },
                ].map((item, i) => {
                  const d = stagger(i, 4 * BEAT + 12, 4);
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 12, marginBottom: 16, opacity: fadeIn(frame, d, 5),
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 10, height: 10, borderRadius: 5, background: i === 0 ? COLORS.amber : COLORS.emerald }} />
                        {i < 2 && <div style={{ width: 2, height: 30, background: COLORS.border }} />}
                      </div>
                      <div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>{item.date} · {item.type}</div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: item.status === '완료' ? COLORS.emerald : COLORS.amber }}>{item.status}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AppLayout>
        </div>
      )}

      {/* ═══ BEAT 5: 일정 관리 - Calendar ═══ */}
      {beatIndex >= 5 && (
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(frame, 5 * BEAT, 4) * (frame >= 540 - 8 ? fadeOut(frame, 540 - 8, 8) : 1) }}>
          <AppLayout activeNav={14} opacity={1}>
            <div style={{ display: 'flex', gap: 20, height: '100%' }}>
              {/* Calendar */}
              <div style={{
                flex: 2, background: COLORS.white, borderRadius: 16, padding: 24,
                border: `1px solid ${COLORS.border}`,
                opacity: fadeIn(frame, 5 * BEAT + 2, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                  📅 2026년 3월
                </div>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
                  {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: 600, color: i === 0 ? COLORS.rose : i === 6 ? COLORS.primary : COLORS.textMuted, padding: 4 }}>{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {/* Empty cells for March 2026 (starts on Sunday) */}
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                    const isToday = day === 24;
                    const hasEvent = [3, 5, 10, 12, 15, 18, 20, 22, 24, 25, 28].includes(day);
                    const eventColors = [COLORS.primary, COLORS.emerald, COLORS.amber, COLORS.purple];
                    const dotColor = eventColors[day % 4];
                    const d = stagger(day, 5 * BEAT + 5, 0.5);
                    return (
                      <div key={day} style={{
                        textAlign: 'center', padding: '6px 4px', borderRadius: 8, position: 'relative',
                        background: isToday ? COLORS.primary : 'transparent',
                        opacity: fadeIn(frame, d, 3),
                      }}>
                        <span style={{
                          fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: isToday ? 700 : 400,
                          color: isToday ? COLORS.white : COLORS.textPrimary,
                        }}>
                          {day}
                        </span>
                        {hasEvent && (
                          <div style={{
                            position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                            width: 5, height: 5, borderRadius: '50%',
                            background: isToday ? COLORS.white : dotColor,
                          }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Sidebar: upcoming events */}
              <div style={{
                flex: 1, background: COLORS.white, borderRadius: 16, padding: 24,
                border: `1px solid ${COLORS.border}`,
                opacity: fadeIn(frame, 5 * BEAT + 8, 5),
              }}>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
                  오늘의 일정
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.primary, fontWeight: 600, marginBottom: 16 }}>
                  3월 24일 (화)
                </div>
                {CALENDAR_EVENTS.map((ev, i) => {
                  const d = stagger(i, 5 * BEAT + 12, 4);
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 10, background: COLORS.bg, marginBottom: 8,
                      borderLeft: `3px solid ${ev.color}`,
                      opacity: fadeIn(frame, d, 5), transform: `translateX(${slideRight(frame, fps, d)}px)`,
                    }}>
                      <span style={{ fontSize: 18 }}>{ev.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>{ev.title}</div>
                        <div style={{ fontFamily: FONT_FAMILY, fontSize: 10, color: COLORS.textMuted }}>{ev.time}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AppLayout>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default CommunicationScene;
