import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from 'remotion';
import {
  MousePointer2,
  BookOpen,
  PenTool,
  Braces,
  MessageSquare,
  Target,
  Sparkles,
  Loader2,
  CheckCircle2,
  FileText,
  Plus,
  Minus,
  Activity,
  ListChecks,
} from 'lucide-react';

const FONT_FAMILY =
  '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const MONO_FAMILY =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

// Mirrors the real annotation editor (passage-annotation-editor.tsx:47-53)
const ANNOTATION_CONFIG = {
  vocab:     { label: '핵심 어휘',  short: '어휘', icon: BookOpen,        color: '#2563eb', dot: '#3b82f6' },
  grammar:   { label: '문법/어법', short: '문법', icon: PenTool,         color: '#7c3aed', dot: '#8b5cf6' },
  syntax:    { label: '구문 분석', short: '구문', icon: Braces,          color: '#0891b2', dot: '#06b6d4' },
  sentence:  { label: '핵심 문장', short: '문장', icon: MessageSquare,   color: '#16a34a', dot: '#22c55e' },
  examPoint: { label: '출제 포인트', short: '출제', icon: Target,        color: '#ca8a04', dot: '#eab308' },
} as const;
type AnnoType = keyof typeof ANNOTATION_CONFIG;

// Real question type groups (generate-questions-dialog.tsx:37-72)
const EXAM_TYPE_GROUPS = [
  {
    group: '수능/모의고사 객관식',
    items: [
      { id: 'BLANK_INFERENCE', label: '빈칸 추론' },
      { id: 'GRAMMAR_ERROR', label: '어법 판단' },
      { id: 'VOCAB_CHOICE', label: '어휘 적절성' },
      { id: 'SENTENCE_ORDER', label: '글의 순서' },
      { id: 'SENTENCE_INSERT', label: '문장 삽입' },
      { id: 'TOPIC_MAIN_IDEA', label: '주제/요지' },
      { id: 'TITLE', label: '제목 추론' },
      { id: 'REFERENCE', label: '지칭 추론' },
      { id: 'CONTENT_MATCH', label: '내용 일치' },
      { id: 'IRRELEVANT', label: '무관한 문장' },
    ],
  },
  {
    group: '내신 서술형',
    items: [
      { id: 'CONDITIONAL_WRITING', label: '조건부 영작' },
      { id: 'SENTENCE_TRANSFORM', label: '문장 전환' },
      { id: 'FILL_BLANK_KEY', label: '핵심 표현 빈칸' },
      { id: 'SUMMARY_COMPLETE', label: '요약문 완성' },
      { id: 'WORD_ORDER', label: '배열 영작' },
      { id: 'GRAMMAR_CORRECTION', label: '문법 오류 수정' },
    ],
  },
  {
    group: '어휘',
    items: [
      { id: 'CONTEXT_MEANING', label: '문맥 속 의미' },
      { id: 'SYNONYM', label: '동의어' },
      { id: 'ANTONYM', label: '반의어' },
    ],
  },
];

// ─── Pixel-perfect passage layout ─────────────────────────────────────────
// Mobile canvas: 1080 × 1920
// Card outer: x=40, y=320, w=1000
// Card padding: 50 → inner left=90, inner top=320+150 (after header)=470
// Monospace 36px → character width = 21.6px (Consolas/Menlo)
// Line height = 70px
const CARD_X = 40;
const CARD_Y = 360;
const CARD_W = 1000;
const CARD_PAD = 50;
const PASS_LEFT = CARD_X + CARD_PAD; // 90
const PASS_TOP = CARD_Y + 200; // 560 — after header rows
const CHAR_W = 21.6;
const LINE_H = 70;

const PASSAGE_LINES = [
  'Sleep is one of the most',
  'important activities for',
  'the human body. During sleep,',
  'the brain actively',
  'removes harmful waste from neurons',
  'during deep, restorative phases.',
  'Scientists have discovered',
  'that consistent sleep loss',
  'leads to serious problems.',
];

// Drag target: line index 4, columns 8 → 33 = "harmful waste from neurons"
const TARGET_LINE = 4;
const TARGET_COL_START = 8;
const TARGET_COL_END = 34;
const TARGET_X_START = PASS_LEFT + TARGET_COL_START * CHAR_W; // 262.8
const TARGET_X_END = PASS_LEFT + TARGET_COL_END * CHAR_W; // 824.4
const TARGET_Y_TOP = PASS_TOP + TARGET_LINE * LINE_H; // 840
const TARGET_Y_CENTER = TARGET_Y_TOP + LINE_H / 2; // 875

// ─── Stage 4 deterministic grid ────────────────────────────────────────
// Card: left=40, top=280, w=1000, padding=36 → content x_start=76
// 4 fixed columns × 220px wide, 8px gap
const T4_COL_W = 220;
const T4_ROW_H = 64; // item h=56 + row gap=8
const T4_COLS_X = [76, 76 + 220 + 8, 76 + (220 + 8) * 2, 76 + (220 + 8) * 3]; // [76, 304, 532, 760]

// Group y starts (within absolute screen coords)
// passage summary 60h + 24mb → ends at 400
// G1 header 28 → items at 428, 3 rows
// G2 header at 612+18=630 → items at 658, 2 rows
// G3 header at 778+18=796 → items at 824, 1 row
const T4_G1_Y0 = 428;
const T4_G2_Y0 = 658;
const T4_G3_Y0 = 824;

// Plus-button center for an item at given column / row / group_y
// item_w=220, paddingRight=4, plus-icon w=28 → center = right - 4 - 14 = right - 18
const plusCenter = (groupY0: number, row: number, col: number) => ({
  x: T4_COLS_X[col] + T4_COL_W - 18,
  y: groupY0 + row * T4_ROW_H + 28,
});

const T4_TARGETS = [
  plusCenter(T4_G1_Y0, 0, 0), // 빈칸 추론
  plusCenter(T4_G1_Y0, 0, 3), // 글의 순서
  plusCenter(T4_G1_Y0, 1, 1), // 주제/요지
  plusCenter(T4_G2_Y0, 0, 3), // 요약문 완성
];
// CTA "4문제 생성" button center
const T4_CTA_CENTER = { x: 701, y: 1800 };

// ─── Master cursor path ─────────────────────────────────────────────────
const useCursorPath = (frame: number, _fps: number, width: number, height: number) => {
  let x = width + 200;
  let y = height + 200;
  let pressed = false;
  let visible = false;
  let dragT = 0;

  // Stage 2 drag: frames 110 — 320
  // Stage 4 type-select clicks: 540 — 760
  if (frame >= 90 && frame < 320) {
    visible = true;
    if (frame < 130) {
      // fly in
      const t = (frame - 90) / 40;
      x = interpolate(t, [0, 1], [width + 100, TARGET_X_START - 30]);
      y = interpolate(t, [0, 1], [height + 100, TARGET_Y_CENTER + 20], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
    } else if (frame < 145) {
      // settle
      x = TARGET_X_START - 4;
      y = TARGET_Y_CENTER;
    } else if (frame < 215) {
      // press + drag right (over 70 frames)
      const t = (frame - 145) / 70;
      pressed = true;
      dragT = t;
      x = interpolate(t, [0, 1], [TARGET_X_START - 4, TARGET_X_END - 8], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      y = TARGET_Y_CENTER;
    } else if (frame < 240) {
      // release & hold (toolbar shows)
      pressed = false;
      dragT = 1;
      x = TARGET_X_END - 8;
      y = TARGET_Y_CENTER;
    } else if (frame < 280) {
      // move down to "출제" button on toolbar
      const t = (frame - 240) / 40;
      pressed = false;
      dragT = 1;
      x = interpolate(t, [0, 1], [TARGET_X_END - 8, TARGET_X_END - 60], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      y = interpolate(t, [0, 1], [TARGET_Y_CENTER, TARGET_Y_TOP + LINE_H + 70]);
    } else if (frame < 295) {
      // click 출제
      x = TARGET_X_END - 60;
      y = TARGET_Y_TOP + LINE_H + 70;
      pressed = true;
      dragT = 1;
    } else {
      // exit down
      const t = (frame - 295) / 25;
      x = TARGET_X_END - 60;
      y = interpolate(t, [0, 1], [TARGET_Y_TOP + LINE_H + 70, height + 200]);
      dragT = 1;
    }
  }

  // STAGE 4 (type select): cursor moves to the EXACT + button positions
  // Frames 560 — 760: 4 clicks @ 40f each = 160f, then 40f move to CTA
  if (frame >= 560 && frame < 760) {
    visible = true;
    const lf = frame - 560;
    const PER = 40; // frames per click cycle
    const segment = Math.floor(lf / PER);
    const within = (lf % PER) / PER;

    if (segment >= T4_TARGETS.length) {
      // move to CTA "생성" button
      const t = Math.min(1, (lf - T4_TARGETS.length * PER) / 40);
      const last = T4_TARGETS[T4_TARGETS.length - 1];
      x = interpolate(t, [0, 1], [last.x, T4_CTA_CENTER.x], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      y = interpolate(t, [0, 1], [last.y, T4_CTA_CENTER.y], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      pressed = t > 0.85;
    } else {
      const prev =
        segment === 0
          ? { x: -100, y: 200 } // off-screen top-left start
          : T4_TARGETS[segment - 1];
      const cur = T4_TARGETS[segment];
      // ease into position by 0.7, hover 0.7-0.85, press 0.85-1
      x = interpolate(within, [0, 0.7, 1], [prev.x, cur.x, cur.x], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      y = interpolate(within, [0, 0.7, 1], [prev.y, cur.y, cur.y], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      pressed = within > 0.85 && within < 0.97;
    }
  }

  return { x, y, pressed, visible, dragT };
};

// ─── Components ───────────────────────────────────────────────────────────

const PhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const dotPattern = `radial-gradient(circle at 1px 1px, rgba(59,130,246,0.18) 1px, transparent 0)`;
  const drift = (frame * 0.3) % 32;

  return (
    <AbsoluteFill style={{ background: '#f8fafc', overflow: 'hidden', fontFamily: FONT_FAMILY }}>
      {/* subtle blue dotted grid */}
      <div
        style={{
          position: 'absolute',
          inset: -50,
          backgroundImage: dotPattern,
          backgroundSize: '32px 32px',
          backgroundPosition: `${drift}px ${drift}px`,
          opacity: 0.7,
        }}
      />
      {/* soft light-blue radial wash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 800px 600px at 30% 0%, rgba(219,234,254,0.55), transparent 60%), radial-gradient(ellipse 700px 500px at 80% 100%, rgba(191,219,254,0.45), transparent 60%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

const StatusBar: React.FC<{ stepNum: number; stepLabel: string }> = ({ stepNum, stepLabel }) => (
  <>
    {/* iOS-style status bar */}
    <div
      style={{
        position: 'absolute',
        top: 50,
        left: 60,
        right: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#0f172a',
        fontSize: 30,
        fontWeight: 700,
      }}
    >
      <span>9:41</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24 }}>
        <span style={{ display: 'inline-block', width: 22, height: 22, border: '2px solid #0f172a', borderRadius: 4 }} />
        100%
      </span>
    </div>

    {/* Step pill */}
    <div
      style={{
        position: 'absolute',
        top: 130,
        left: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'white',
        border: '1.5px solid #dbeafe',
        borderRadius: 999,
        padding: '12px 24px',
        boxShadow: '0 4px 16px rgba(59,130,246,0.10)',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9999,
          background: '#3b82f6',
          color: 'white',
          fontSize: 18,
          fontWeight: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {stepNum}
      </div>
      <span style={{ color: '#1e40af', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
        {stepLabel}
      </span>
    </div>

    {/* Brand top-right */}
    <div
      style={{
        position: 'absolute',
        top: 130,
        right: 60,
        padding: '12px 22px',
        borderRadius: 999,
        background: '#eff6ff',
        border: '1.5px solid #bfdbfe',
        color: '#1d4ed8',
        fontSize: 22,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#3b82f6' }} />
      NARA AI
    </div>
  </>
);

// ─── Trailing cursor ──────────────────────────────────────────────────────
const TrailingCursor: React.FC<{ x: number; y: number; pressed: boolean }> = ({
  x,
  y,
  pressed,
}) => {
  const frame = useCurrentFrame();
  const ringScale = pressed ? 1 + Math.sin(frame / 4) * 0.15 : 1;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 50,
          top: y - 50,
          width: 100,
          height: 100,
          borderRadius: 9999,
          background: 'radial-gradient(circle, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0) 70%)',
          pointerEvents: 'none',
          mixBlendMode: 'multiply',
        }}
      />
      {pressed && (
        <div
          style={{
            position: 'absolute',
            left: x - 26,
            top: y - 26,
            width: 52,
            height: 52,
            borderRadius: 9999,
            border: '4px solid #3b82f6',
            background: 'rgba(59,130,246,0.15)',
            transform: `scale(${ringScale})`,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* MousePointer2 tip is at ≈ (9, 5) within a 56x56 render — offset so tip lands at (x, y) */}
      <div
        style={{
          position: 'absolute',
          left: x - 9,
          top: y - 5,
          filter: 'drop-shadow(0 6px 14px rgba(15,23,42,0.35))',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        <MousePointer2 width={56} height={56} fill="white" color="#0f172a" strokeWidth={1.6} />
      </div>
    </>
  );
};

// ─── STAGE 1: Passage card with English passage ──────────────────────────
const Stage1: React.FC<{ localFrame: number; highlightT: number; markedYellow: boolean }> = ({
  localFrame,
  highlightT,
  markedYellow,
}) => {
  const { fps } = useVideoConfig();
  const cardEnter = spring({ frame: localFrame, fps, config: { damping: 14, mass: 0.8 } });
  const cardOpacity = interpolate(cardEnter, [0, 1], [0, 1]);
  const cardY = interpolate(cardEnter, [0, 1], [60, 0]);

  // typewriter — reveal lines progressively
  const linesShown = Math.floor((localFrame - 8) / 7);

  const highlightW = (TARGET_X_END - TARGET_X_START) * highlightT;

  return (
    <AbsoluteFill style={{ opacity: cardOpacity, transform: `translateY(${cardY}px)` }}>
      <StatusBar stepNum={1} stepLabel="지문 분석 · 핵심 마킹" />

      {/* Passage card */}
      <div
        style={{
          position: 'absolute',
          left: CARD_X,
          top: CARD_Y,
          width: CARD_W,
          background: 'white',
          borderRadius: 36,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 20px 60px rgba(15,23,42,0.10), 0 4px 12px rgba(15,23,42,0.04)',
          paddingBottom: 60,
          overflow: 'hidden',
        }}
      >
        {/* Card top accent */}
        <div
          style={{
            height: 6,
            background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 50%, #22c55e 100%)',
          }}
        />

        {/* Card header */}
        <div style={{ padding: '36px 50px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText width={28} height={28} color="#2563eb" />
          </div>
          <div>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
              English Reading
            </div>
            <div style={{ fontSize: 20, color: '#64748b', fontWeight: 600 }}>
              고2 · 모의고사 변형 · 248 words
            </div>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              padding: '6px 14px',
              background: '#f1f5f9',
              borderRadius: 999,
              fontSize: 18,
              fontWeight: 700,
              color: '#475569',
            }}
          >
            P.12
          </div>
        </div>

        {/* annotation legend bar (real component pattern) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '14px 50px',
            borderTop: '1px solid #f1f5f9',
            borderBottom: '1px solid #f1f5f9',
            background: '#fafbfc',
          }}
        >
          {(Object.entries(ANNOTATION_CONFIG) as [AnnoType, typeof ANNOTATION_CONFIG.vocab][]).map(
            ([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: cfg.color }}>
                  <Icon width={18} height={18} />
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{cfg.short}</span>
                  <span
                    style={{
                      fontSize: 16,
                      color: '#94a3b8',
                      fontWeight: 700,
                      minWidth: 14,
                      textAlign: 'right',
                    }}
                  >
                    {markedYellow && key === 'examPoint' ? 1 : 0}
                  </span>
                </div>
              );
            },
          )}
        </div>

        {/* Passage body — pixel-perfect monospace lines */}
        <div
          style={{
            position: 'relative',
            margin: '40px 50px 0',
            minHeight: PASSAGE_LINES.length * LINE_H + 30,
          }}
        >
          {/* yellow exam-point highlight (after marking) */}
          {markedYellow && (
            <div
              style={{
                position: 'absolute',
                left: TARGET_COL_START * CHAR_W,
                top: TARGET_LINE * LINE_H + 10,
                width: (TARGET_COL_END - TARGET_COL_START) * CHAR_W,
                height: LINE_H - 20,
                background: 'linear-gradient(to top, #fef08a 40%, transparent 40%)',
                borderRadius: 1,
                zIndex: 0,
              }}
            />
          )}

          {/* live drag selection */}
          {!markedYellow && highlightT > 0 && (
            <div
              style={{
                position: 'absolute',
                left: TARGET_COL_START * CHAR_W,
                top: TARGET_LINE * LINE_H + 6,
                width: highlightW,
                height: LINE_H - 12,
                background: 'rgba(59,130,246,0.25)',
                border: '1.5px solid rgba(59,130,246,0.55)',
                borderRadius: 4,
                zIndex: 0,
              }}
            />
          )}

          {PASSAGE_LINES.map((line, i) => {
            const visible = i <= linesShown;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: i * LINE_H,
                  left: 0,
                  fontFamily: MONO_FAMILY,
                  fontSize: 36,
                  lineHeight: `${LINE_H}px`,
                  color: '#1e293b',
                  whiteSpace: 'pre',
                  zIndex: 1,
                  opacity: visible ? 1 : 0,
                  transform: `translateY(${visible ? 0 : 12}px)`,
                  transition: 'none',
                }}
              >
                <span style={{ color: '#94a3b8', fontSize: 18, marginRight: 12 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Annotation toolbar (the dark blue gradient pill from real component) ──
const AnnotationToolbar: React.FC<{
  centerX: number;
  topY: number;
  scale: number;
  hoverIdx: number | null;
}> = ({ centerX, topY, scale, hoverIdx }) => {
  const types: AnnoType[] = ['vocab', 'grammar', 'syntax', 'sentence', 'examPoint'];
  return (
    <div
      style={{
        position: 'absolute',
        left: centerX,
        top: topY,
        transform: `translate(-50%, 0) scale(${scale})`,
        transformOrigin: 'top center',
      }}
    >
      {/* arrow */}
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: 16,
          height: 16,
          background: '#1e3a5f',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 8,
          borderRadius: 18,
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          boxShadow: '0 12px 40px rgba(37,99,235,0.35), 0 0 0 1px rgba(255,255,255,0.1) inset',
        }}
      >
        {types.map((t, i) => {
          const cfg = ANNOTATION_CONFIG[t];
          const Icon = cfg.icon;
          const hovered = hoverIdx === i;
          return (
            <div
              key={t}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '12px 14px',
                borderRadius: 12,
                background: hovered ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: 'white',
                fontWeight: 700,
                fontSize: 22,
              }}
            >
              <Icon width={22} height={22} />
              <span>{cfg.short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── STAGE 2: Drag selection + toolbar (overlaid on Stage 1) ──────────────
const Stage2Overlay: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  // Toolbar appears at frame 95 (after release in master timing → 215+)
  // localFrame is offset from stage start (110), so release at localFrame=105
  const showToolbar = localFrame >= 105 && localFrame < 200;
  const toolbarSpring = spring({
    frame: localFrame - 105,
    fps: 30,
    config: { damping: 10 },
  });
  const toolbarScale = showToolbar ? toolbarSpring : 0;

  // After cursor moves to "출제" button — index 4 — highlight it
  // Master frames 240-280 → localFrame 130-170
  const hoverIdx = localFrame >= 130 && localFrame < 200 ? 4 : null;

  // Center of selection
  const centerX = (TARGET_X_START + TARGET_X_END) / 2;
  const topY = TARGET_Y_TOP + LINE_H + 14;

  return (
    <>
      {showToolbar && (
        <AnnotationToolbar centerX={centerX} topY={topY} scale={toolbarScale} hoverIdx={hoverIdx} />
      )}
    </>
  );
};

// ─── STAGE 3: AI Analysis panel slides up over the card ───────────────────
const Stage3Analysis: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: localFrame, fps, config: { damping: 14 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const slideY = interpolate(enter, [0, 1], [200, 0]);

  // analysis tags appear with stagger
  const insights = [
    { icon: Target, label: '주제', value: 'Sleep & Cognition', color: '#2563eb', delay: 14 },
    { icon: BookOpen, label: '핵심어', value: 'waste · neurons', color: '#7c3aed', delay: 24 },
    { icon: Activity, label: '톤', value: 'Expository', color: '#0891b2', delay: 34 },
    { icon: ListChecks, label: '난이도', value: '★★★☆☆ (수능 3등급)', color: '#16a34a', delay: 44 },
  ];

  // sentence-by-sentence parse bar
  const parseProgress = Math.min(1, localFrame / 90);

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: CARD_X,
          right: CARD_X,
          bottom: 60,
          background: 'white',
          borderRadius: 36,
          border: '1.5px solid #bfdbfe',
          boxShadow: '0 -20px 60px rgba(59,130,246,0.20), 0 8px 24px rgba(15,23,42,0.08)',
          padding: '40px 44px',
          transform: `translateY(${slideY}px)`,
        }}
      >
        {/* Drag-handle */}
        <div
          style={{
            width: 60,
            height: 6,
            borderRadius: 999,
            background: '#cbd5e1',
            margin: '0 auto 24px',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(59,130,246,0.35)',
            }}
          >
            <Sparkles width={28} height={28} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
              AI 의미 분석 완료
            </div>
            <div style={{ fontSize: 18, color: '#64748b', fontWeight: 600 }}>
              Gemini · 0.8s · 9 sentences parsed
            </div>
          </div>
        </div>

        {/* parse progress */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, marginBottom: 8 }}>
            <span style={{ color: '#475569', fontWeight: 700 }}>지문 파싱</span>
            <span style={{ color: '#2563eb', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {Math.floor(parseProgress * 9)}/9 문장
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: '#eff6ff',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${parseProgress * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)',
                boxShadow: '0 0 12px rgba(59,130,246,0.6)',
              }}
            />
          </div>
        </div>

        {/* insight tags grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {insights.map((it, i) => {
            const tagSpring = spring({
              frame: localFrame - it.delay,
              fps,
              config: { damping: 11 },
            });
            const Icon = it.icon;
            return (
              <div
                key={i}
                style={{
                  background: '#f8fafc',
                  border: `1.5px solid ${it.color}33`,
                  borderRadius: 18,
                  padding: '18px 20px',
                  transform: `scale(${tagSpring}) translateY(${interpolate(tagSpring, [0, 1], [16, 0])}px)`,
                  opacity: tagSpring,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Icon width={20} height={20} color={it.color} />
                  <span style={{ color: it.color, fontSize: 18, fontWeight: 800, letterSpacing: '0.02em' }}>
                    {it.label}
                  </span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{it.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Single type button positioned at absolute (x, y, w=220, h=56) ───────
const TypeButton: React.FC<{
  item: { id: string; label: string };
  x: number;
  y: number;
  count: number;
}> = ({ item, x, y, count }) => {
  const active = count > 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: T4_COL_W,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 14,
        border: `1.5px solid ${active ? '#93c5fd' : '#e2e8f0'}`,
        background: active ? '#eff6ff' : 'white',
        boxShadow: active ? '0 4px 12px rgba(59,130,246,0.15)' : 'none',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          flex: 1,
          paddingLeft: 16,
          fontSize: 20,
          fontWeight: 700,
          color: active ? '#1d4ed8' : '#64748b',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.label}
      </span>
      {active ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            paddingLeft: 4,
            paddingRight: 4,
            borderLeft: '1.5px solid #bfdbfe',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa',
            }}
          >
            <Minus width={18} height={18} />
          </div>
          <span
            style={{
              width: 18,
              textAlign: 'center',
              fontSize: 20,
              fontWeight: 900,
              color: '#1d4ed8',
            }}
          >
            {count}
          </span>
          <div
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa',
            }}
          >
            <Plus width={18} height={18} />
          </div>
        </div>
      ) : (
        <div style={{ width: 18 }} />
      )}
    </div>
  );
};

// ─── STAGE 4: Real question type selector (counters, +/-) ─────────────────
const Stage4TypeSelect: React.FC<{ localFrame: number; counts: Record<string, number> }> = ({
  localFrame,
  counts,
}) => {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: localFrame, fps, config: { damping: 14 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const slideY = interpolate(enter, [0, 1], [120, 0]);

  const totalQuestions = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${slideY}px)` }}>
      <StatusBar stepNum={2} stepLabel="문제 유형 선택" />

      {/* Card outer — uses absolute positioning so children align with cursor targets */}
      <div
        style={{
          position: 'absolute',
          left: CARD_X,
          top: 280,
          right: CARD_X,
          background: 'white',
          borderRadius: 36,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 20px 60px rgba(15,23,42,0.10)',
          height: 720,
          overflow: 'hidden',
        }}
      >
        {/* Selected passage summary — y 316 to 376 (36 padding + 60 box) */}
        <div
          style={{
            position: 'absolute',
            left: 36,
            right: 36,
            top: 36,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 20px',
            background: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: 18,
          }}
        >
          <FileText width={22} height={22} color="#94a3b8" />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#334155', flex: 1 }}>
            Sleep & Cognition · 248w
          </span>
          <span style={{ fontSize: 18, color: '#3b82f6', fontWeight: 700 }}>변경</span>
        </div>
      </div>

      {/* Group 1 header — absolute screen y=400 (matches T4 grid math) */}
      <div
        style={{
          position: 'absolute',
          left: 76,
          top: 400,
          fontSize: 16,
          fontWeight: 800,
          color: '#94a3b8',
          letterSpacing: '0.08em',
        }}
      >
        수능/모의고사 객관식
      </div>

      {/* Group 1 items — 4 cols × 3 rows starting at y=428 */}
      {EXAM_TYPE_GROUPS[0].items.map((item, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const x = T4_COLS_X[col];
        const y = T4_G1_Y0 + row * T4_ROW_H;
        return (
          <TypeButton key={item.id} item={item} x={x} y={y} count={counts[item.id] || 0} />
        );
      })}

      {/* Group 2 header — y=630 */}
      <div
        style={{
          position: 'absolute',
          left: 76,
          top: 630,
          fontSize: 16,
          fontWeight: 800,
          color: '#94a3b8',
          letterSpacing: '0.08em',
        }}
      >
        내신 서술형
      </div>

      {/* Group 2 items — 4 cols × 2 rows starting at y=658 */}
      {EXAM_TYPE_GROUPS[1].items.map((item, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const x = T4_COLS_X[col];
        const y = T4_G2_Y0 + row * T4_ROW_H;
        return (
          <TypeButton key={item.id} item={item} x={x} y={y} count={counts[item.id] || 0} />
        );
      })}

      {/* Group 3 header — y=796 */}
      <div
        style={{
          position: 'absolute',
          left: 76,
          top: 796,
          fontSize: 16,
          fontWeight: 800,
          color: '#94a3b8',
          letterSpacing: '0.08em',
        }}
      >
        어휘
      </div>

      {/* Group 3 items — 4 cols × 1 row starting at y=824 */}
      {EXAM_TYPE_GROUPS[2].items.map((item, i) => {
        const x = T4_COLS_X[i];
        const y = T4_G3_Y0;
        return (
          <TypeButton key={item.id} item={item} x={x} y={y} count={counts[item.id] || 0} />
        );
      })}

      {/* Total count bar — y=898 */}
      {totalQuestions > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 76,
            right: 76,
            top: 898,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            borderRadius: 14,
            background: '#eff6ff',
            border: '1.5px solid #bfdbfe',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700, color: '#1e40af' }}>
            총 <strong style={{ fontSize: 26, color: '#1d4ed8' }}>{totalQuestions}</strong>문제
            · <span style={{ color: '#475569', fontWeight: 600 }}>병렬 생성 예정</span>
          </span>
        </div>
      )}

      {/* Bottom CTA bar */}
      {totalQuestions > 0 && (
        <div
          style={{
            position: 'absolute',
            left: CARD_X,
            right: CARD_X,
            bottom: 80,
            display: 'flex',
            gap: 14,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 80,
              borderRadius: 20,
              border: '1.5px solid #e2e8f0',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
              color: '#475569',
            }}
          >
            이전
          </div>
          <div
            style={{
              flex: 2.2,
              height: 80,
              borderRadius: 20,
              background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              fontSize: 26,
              fontWeight: 900,
              color: 'white',
              boxShadow: '0 12px 30px rgba(37,99,235,0.45)',
            }}
          >
            <Sparkles width={26} height={26} />
            {totalQuestions}문제 생성
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── STAGE 5: PARALLEL bulk generation ────────────────────────────────────
const Stage5Parallel: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: localFrame, fps, config: { damping: 14 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  // 4 jobs running in parallel, completing at different frames
  const jobs = [
    { id: 'BLANK_INFERENCE', label: '빈칸 추론', count: 1, doneAt: 70, color: '#3b82f6' },
    { id: 'SENTENCE_ORDER', label: '글의 순서', count: 1, doneAt: 95, color: '#06b6d4' },
    { id: 'TOPIC_MAIN_IDEA', label: '주제/요지', count: 1, doneAt: 85, color: '#8b5cf6' },
    { id: 'SUMMARY_COMPLETE', label: '요약문 완성', count: 1, doneAt: 110, color: '#16a34a' },
  ];

  // overall progress
  const doneCount = jobs.filter((j) => localFrame >= j.doneAt).length;
  const overallProgress = doneCount / jobs.length;

  return (
    <AbsoluteFill style={{ opacity }}>
      <StatusBar stepNum={3} stepLabel="병렬 문제 생성 중" />

      {/* status pill row (matches generate-questions-dialog progress UI) */}
      <div
        style={{
          position: 'absolute',
          top: 280,
          left: CARD_X,
          right: CARD_X,
          background: 'white',
          borderRadius: 24,
          border: '1.5px solid #e2e8f0',
          padding: '24px 28px',
          boxShadow: '0 12px 40px rgba(15,23,42,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#475569' }}>생성 진행 상황</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>
            {doneCount} / {jobs.length}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {jobs.map((j) => {
            const done = localFrame >= j.doneAt;
            const pulse = !done ? 0.6 + Math.sin(localFrame / 5) * 0.4 : 1;
            return (
              <div
                key={j.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: `1.5px solid ${done ? '#a7f3d0' : '#bfdbfe'}`,
                  background: done ? '#ecfdf5' : '#eff6ff',
                  color: done ? '#047857' : '#1d4ed8',
                  fontSize: 19,
                  fontWeight: 700,
                  opacity: done ? 1 : pulse,
                }}
              >
                {j.label} ×{j.count}
                {done ? (
                  <CheckCircle2 width={20} height={20} color="#10b981" />
                ) : (
                  <Loader2
                    width={20}
                    height={20}
                    color="#3b82f6"
                    style={{ transform: `rotate(${localFrame * 12}deg)` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* overall progress bar */}
        <div style={{ marginTop: 18, height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${overallProgress * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 50%, #22c55e 100%)',
              boxShadow: '0 0 14px rgba(59,130,246,0.6)',
            }}
          />
        </div>
      </div>

      {/* 2×2 generation cards — each shows live token streaming */}
      <div
        style={{
          position: 'absolute',
          top: 600,
          left: CARD_X,
          right: CARD_X,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
        }}
      >
        {jobs.map((j, i) => {
          const startAt = 8 + i * 4;
          const progress = Math.min(
            1,
            Math.max(0, (localFrame - startAt) / (j.doneAt - startAt)),
          );
          const done = localFrame >= j.doneAt;
          const cardSpring = spring({ frame: localFrame - i * 5, fps, config: { damping: 12 } });

          // streaming token text (fake)
          const streamLines = [
            '01 · 지문 의미 분석…',
            '02 · 정답 후보 추출…',
            '03 · 오답 선지 생성…',
            '04 · 패러프레이즈 검증…',
            '05 · 해설 작성…',
          ];
          const lineIdx = Math.min(streamLines.length - 1, Math.floor(progress * streamLines.length));
          const blink = Math.floor(localFrame / 4) % 2 === 0;

          return (
            <div
              key={j.id}
              style={{
                background: 'white',
                borderRadius: 24,
                border: `1.5px solid ${done ? '#a7f3d0' : '#dbeafe'}`,
                padding: 24,
                boxShadow: done
                  ? '0 8px 24px rgba(16,185,129,0.18)'
                  : '0 8px 24px rgba(59,130,246,0.15)',
                transform: `scale(${cardSpring})`,
                opacity: cardSpring,
                position: 'relative',
                overflow: 'hidden',
                minHeight: 360,
              }}
            >
              {/* top accent stripe */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: done ? '#10b981' : j.color,
                }}
              />

              {/* header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    background: done ? '#ecfdf5' : `${j.color}1a`,
                    color: done ? '#047857' : j.color,
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  {j.label}
                </span>
                {done ? (
                  <CheckCircle2 width={28} height={28} color="#10b981" />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9999,
                      border: `3px solid ${j.color}33`,
                      borderTopColor: j.color,
                      transform: `rotate(${localFrame * 14}deg)`,
                    }}
                  />
                )}
              </div>

              {/* progress bar */}
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: '#f1f5f9',
                  overflow: 'hidden',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: `${progress * 100}%`,
                    height: '100%',
                    background: done
                      ? 'linear-gradient(90deg, #10b981, #34d399)'
                      : `linear-gradient(90deg, ${j.color}, ${j.color}aa)`,
                  }}
                />
              </div>

              {/* token stream */}
              <div
                style={{
                  fontFamily: MONO_FAMILY,
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: '#475569',
                }}
              >
                {streamLines.slice(0, lineIdx + 1).map((s, li) => (
                  <div
                    key={li}
                    style={{
                      color: li < lineIdx ? '#10b981' : '#1e293b',
                      fontWeight: li === lineIdx ? 700 : 500,
                    }}
                  >
                    {li < lineIdx ? '✓ ' : '› '}
                    {s}
                    {li === lineIdx && !done && blink && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 16,
                          background: j.color,
                          marginLeft: 4,
                          verticalAlign: 'middle',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {done && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '10px 14px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: 12,
                    fontSize: 17,
                    fontWeight: 700,
                    color: '#047857',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Sparkles width={18} height={18} /> 1문항 생성 완료 · 4.2초
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer status */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 60,
          textAlign: 'center',
          color: '#475569',
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        <span style={{ color: '#3b82f6' }}>● </span>
        4개 워커가 병렬로 동시 처리 중 · Gemini 2.5 Flash
      </div>
    </AbsoluteFill>
  );
};

// ─── STAGE 6: Final result preview ────────────────────────────────────────
const Stage6Result: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: localFrame, fps, config: { damping: 13 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const cardY = interpolate(enter, [0, 1], [240, 0]);

  return (
    <AbsoluteFill style={{ opacity }}>
      <StatusBar stepNum={4} stepLabel="문제 은행 저장 준비" />

      <div
        style={{
          position: 'absolute',
          left: CARD_X,
          top: 280,
          right: CARD_X,
          transform: `translateY(${cardY}px)`,
        }}
      >
        {/* success banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1.5px solid #a7f3d0',
            borderRadius: 24,
            padding: '24px 28px',
            marginBottom: 22,
            boxShadow: '0 12px 32px rgba(16,185,129,0.18)',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(16,185,129,0.4)',
            }}
          >
            <CheckCircle2 width={32} height={32} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#064e3b', letterSpacing: '-0.02em' }}>
              4개 문제 생성 완료
            </div>
            <div style={{ fontSize: 18, color: '#047857', fontWeight: 600 }}>
              총 8.4초 · 평균 정답률 76% 예상
            </div>
          </div>
          <div
            style={{
              padding: '12px 22px',
              borderRadius: 14,
              background: '#10b981',
              color: 'white',
              fontSize: 20,
              fontWeight: 800,
              boxShadow: '0 8px 18px rgba(16,185,129,0.35)',
            }}
          >
            저장
          </div>
        </div>

        {/* sample question card */}
        <div
          style={{
            background: 'white',
            borderRadius: 28,
            border: '1.5px solid #e2e8f0',
            padding: 32,
            boxShadow: '0 16px 40px rgba(15,23,42,0.08)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 5,
              background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, marginTop: 8 }}>
            <span
              style={{
                padding: '6px 16px',
                borderRadius: 999,
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              빈칸 추론
            </span>
            <span
              style={{
                padding: '6px 16px',
                borderRadius: 999,
                background: '#f1f5f9',
                color: '#475569',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              ★★★☆☆
            </span>
            <span
              style={{
                marginLeft: 'auto',
                padding: '6px 14px',
                borderRadius: 8,
                border: '2px solid #3b82f6',
                color: '#1d4ed8',
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: '0.08em',
              }}
            >
              AI GENERATED
            </span>
          </div>

          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 18, letterSpacing: '-0.01em' }}>
            1. 다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?
          </div>

          <div
            style={{
              fontFamily: MONO_FAMILY,
              fontSize: 20,
              lineHeight: 1.85,
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: 16,
              padding: 22,
              color: '#1e293b',
              marginBottom: 20,
            }}
          >
            During deep sleep, the brain actively{' '}
            <span
              style={{
                display: 'inline-block',
                minWidth: 140,
                borderBottom: '3px solid #3b82f6',
                textAlign: 'center',
                fontWeight: 900,
                color: '#3b82f6',
                margin: '0 4px',
              }}
            >
              ③
            </span>
            , which scientists now believe is critical for long-term memory.
          </div>

          {/* options */}
          {[
            'consolidates emotional patterns',
            'reduces metabolic activity',
            'removes harmful waste from neurons',
            'strengthens muscular tissue',
            'accelerates hormonal balance',
          ].map((opt, i) => {
            const isCorrect = i === 2;
            const enter = spring({ frame: localFrame - 30 - i * 5, fps, config: { damping: 12 } });
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderRadius: 14,
                  border: `1.5px solid ${isCorrect ? '#3b82f6' : '#e2e8f0'}`,
                  background: isCorrect ? '#eff6ff' : 'white',
                  marginBottom: 10,
                  transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
                  opacity: enter,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9999,
                    background: isCorrect ? '#3b82f6' : '#f1f5f9',
                    color: isCorrect ? 'white' : '#64748b',
                    fontSize: 18,
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {['①', '②', '③', '④', '⑤'][i]}
                </div>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: isCorrect ? 800 : 600,
                    color: isCorrect ? '#1e3a8a' : '#475569',
                    flex: 1,
                  }}
                >
                  {opt}
                </span>
                {isCorrect && <CheckCircle2 width={24} height={24} color="#3b82f6" />}
              </div>
            );
          })}

          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1.5px dashed #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 17,
              color: '#64748b',
              fontWeight: 700,
            }}
          >
            <span>예상 정답률 78%</span>
            <span>+ 3개 더 보기</span>
            <span>Gemini 2.5</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── MAIN ─────────────────────────────────────────────────────────────────

const STAGE = {
  passage: { from: 0, dur: 110 },
  drag:    { from: 110, dur: 210 }, // overlay on passage
  analysis:{ from: 320, dur: 200 },
  type:    { from: 520, dur: 240 },
  parallel:{ from: 760, dur: 180 },
  result:  { from: 940, dur: 200 },
};
export const AI_FLOW_PROMO_TOTAL_FRAMES = 1140;

const AIFlowMobilePromo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const cursor = useCursorPath(frame, fps, width, height);

  // drag highlight progress within Stage 1+2
  let highlightT = 0;
  if (frame >= 145 && frame < 215) highlightT = (frame - 145) / 70;
  else if (frame >= 215) highlightT = 1;

  const markedYellow = frame >= 295;

  // Stage 4 — counts increment exactly when cursor presses each + button
  // 4 clicks × 40f starting at frame 560: press at within=0.85 → frame_offset=34
  const counts: Record<string, number> = {};
  if (frame >= 594) counts['BLANK_INFERENCE'] = 1;     // click 1 press
  if (frame >= 634) counts['SENTENCE_ORDER'] = 1;      // click 2 press
  if (frame >= 674) counts['TOPIC_MAIN_IDEA'] = 1;     // click 3 press
  if (frame >= 714) counts['SUMMARY_COMPLETE'] = 1;    // click 4 press

  // White-flash transition between stages
  const flash = (start: number) => {
    if (frame < start - 6 || frame > start + 6) return 0;
    const t = (frame - (start - 6)) / 12;
    return Math.sin(t * Math.PI) * 0.85;
  };
  const flashOpacity = Math.max(
    flash(STAGE.drag.from + STAGE.drag.dur),
    flash(STAGE.analysis.from + STAGE.analysis.dur),
    flash(STAGE.type.from + STAGE.type.dur),
    flash(STAGE.parallel.from + STAGE.parallel.dur),
  );

  return (
    <PhoneFrame>
      {/* STAGE 1 stays mounted through STAGE 2 (drag overlay) and STAGE 3 (analysis sheet over it) */}
      <Sequence
        from={STAGE.passage.from}
        durationInFrames={STAGE.passage.dur + STAGE.drag.dur + STAGE.analysis.dur}
      >
        <Stage1
          localFrame={frame - STAGE.passage.from}
          highlightT={highlightT}
          markedYellow={markedYellow}
        />
      </Sequence>

      <Sequence from={STAGE.drag.from} durationInFrames={STAGE.drag.dur}>
        <Stage2Overlay localFrame={frame - STAGE.drag.from} />
      </Sequence>

      <Sequence from={STAGE.analysis.from} durationInFrames={STAGE.analysis.dur}>
        <Stage3Analysis localFrame={frame - STAGE.analysis.from} />
      </Sequence>

      <Sequence from={STAGE.type.from} durationInFrames={STAGE.type.dur}>
        <Stage4TypeSelect localFrame={frame - STAGE.type.from} counts={counts} />
      </Sequence>

      <Sequence from={STAGE.parallel.from} durationInFrames={STAGE.parallel.dur}>
        <Stage5Parallel localFrame={frame - STAGE.parallel.from} />
      </Sequence>

      <Sequence from={STAGE.result.from} durationInFrames={STAGE.result.dur}>
        <Stage6Result localFrame={frame - STAGE.result.from} />
      </Sequence>

      {/* White flash transitions */}
      {flashOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'white',
            opacity: flashOpacity,
            zIndex: 200,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Cursor — drawn last so it's always on top */}
      {cursor.visible && (
        <TrailingCursor x={cursor.x} y={cursor.y} pressed={cursor.pressed} />
      )}
    </PhoneFrame>
  );
};

export default AIFlowMobilePromo;
