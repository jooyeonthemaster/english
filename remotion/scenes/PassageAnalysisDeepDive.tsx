import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import {
  MousePointer2,
  BookOpen,
  PenTool,
  Braces,
  MessageSquare,
  Target,
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle2,
  Bookmark,
  Wand2,
  Save,
  Zap,
  ChevronDown,
  ArrowRightLeft,
} from 'lucide-react';

const FONT_FAMILY =
  '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const MONO =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

// ─── PIXEL-PRECISE LAYOUT (do not edit without recomputing all coords) ───
// Canvas: 1080 × 1920
// Header:    y 0-220
// Title row: y 240-300
// Card:      y 320-1600  (1280 tall)
//   stripe   y 320-325
//   legend   y 325-385   (60 tall)
//   passage  y 420 onward
// Action bar: y 1700-1800
const CARD_LEFT = 40;
const CARD_TOP = 320;
const CARD_W = 1000;
const CARD_H = 1280;
const LEGEND_H = 60;
const PASS_LEFT = 80;
const PASS_TOP = 420; // = CARD_TOP + 5 stripe + 60 legend + 35 gap
const LINE_H = 54;
const CHAR_W = 18; // monospace 30px ≈ 18px char width

// ─── Passage (verified char counts) ───────────────────────────────────────
const URBAN_LINES = [
  'In cities around the world, a quiet',          // 0  (35)
  'revolution is taking place on rooftops',        // 1  (38)
  'and in abandoned buildings. Urban farming',     // 2  (41)
  'has grown rapidly as people seek fresh,',       // 3  (39)
  'locally grown food. Unlike traditional',        // 4  (38)
  'agriculture, urban farms use innovative',       // 5  (39)
  'techniques such as vertical farming and',       // 6  (39)
  'hydroponics to grow crops in limited',          // 7  (36)
  'spaces. These methods use significantly',       // 8  (39)
  'less water and no soil at all. Beyond',         // 9  (37)
  'providing food, urban farms create green',      // 10 (40)
  'spaces that reduce air pollution and',          // 11 (36)
  'lower temperatures in crowded',                 // 12 (29)
  'neighborhoods. Community gardens also',         // 13 (37)
  'bring people together, fostering social',       // 14 (39)
  'connections in areas where neighbors',          // 15 (36)
  'rarely interact.',                              // 16 (16)
];

const colX = (col: number) => PASS_LEFT + col * CHAR_W;
const lineY = (line: number) => PASS_TOP + line * LINE_H;
const lineCenterY = (line: number) => lineY(line) + LINE_H / 2;

type AnnoType = 'vocab' | 'grammar' | 'syntax' | 'sentence' | 'examPoint';

type AnnoSpec = {
  line: number;
  cs: number;
  ce: number;
  type: AnnoType;
  memo: string;
  buttonIdx: number; // 0=어휘 1=문법 2=구문 3=문장 4=출제
};

// Manual annotation walkthrough (3 saved notes).
const ANNOS: AnnoSpec[] = [
  // 1. EXAM (yellow) — line 6 col 19-39 = "vertical farming and"
  { line: 6, cs: 19, ce: 39, type: 'examPoint', memo: '수직농법: 핵심 개념', buttonIdx: 4 },
  // 2. VOCAB (blue) — line 7 col 0-11 = "hydroponics"
  { line: 7, cs: 0, ce: 11, type: 'vocab', memo: '수경재배 (핵심어휘)', buttonIdx: 0 },
  // 3. GRAMMAR (purple) — line 14 col 23-32 = "fostering"
  { line: 14, cs: 23, ce: 32, type: 'grammar', memo: '분사구문 (~하면서)', buttonIdx: 1 },
];

// AI mass annotations — every (line, cs, ce) verified against URBAN_LINES.
// ce is exclusive (substring length = ce - cs)
const MASS: AnnoSpec[] = [
  { line: 0,  cs: 3,  ce: 9,  type: 'vocab',     memo: '', buttonIdx: 0 }, // "cities"
  { line: 0,  cs: 21, ce: 26, type: 'examPoint', memo: '', buttonIdx: 4 }, // "world"
  { line: 1,  cs: 0,  ce: 10, type: 'vocab',     memo: '', buttonIdx: 0 }, // "revolution"
  { line: 2,  cs: 28, ce: 41, type: 'examPoint', memo: '', buttonIdx: 4 }, // "Urban farming"
  { line: 4,  cs: 20, ce: 26, type: 'syntax',    memo: '', buttonIdx: 2 }, // "Unlike"
  { line: 5,  cs: 29, ce: 39, type: 'vocab',     memo: '', buttonIdx: 0 }, // "innovative"
  { line: 6,  cs: 11, ce: 18, type: 'grammar',   memo: '', buttonIdx: 1 }, // "such as"
  { line: 6,  cs: 19, ce: 39, type: 'examPoint', memo: '', buttonIdx: 4 }, // "vertical farming and"
  { line: 7,  cs: 0,  ce: 11, type: 'vocab',     memo: '', buttonIdx: 0 }, // "hydroponics"
  { line: 8,  cs: 26, ce: 39, type: 'grammar',   memo: '', buttonIdx: 1 }, // "significantly"
  { line: 10, cs: 28, ce: 40, type: 'sentence',  memo: '', buttonIdx: 3 }, // "create green"
  { line: 11, cs: 22, ce: 31, type: 'vocab',     memo: '', buttonIdx: 0 }, // "pollution"
  { line: 13, cs: 15, ce: 32, type: 'sentence',  memo: '', buttonIdx: 3 }, // "Community gardens"
  { line: 14, cs: 23, ce: 32, type: 'grammar',   memo: '', buttonIdx: 1 }, // "fostering"
  { line: 15, cs: 27, ce: 36, type: 'vocab',     memo: '', buttonIdx: 0 }, // "neighbors"
];

const ANN_COLORS = {
  vocab:     { mark: '#3b82f6', bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8' },
  grammar:   { mark: '#8b5cf6', bg: '#ede9fe', border: '#8b5cf6', text: '#7c3aed' },
  syntax:    { mark: '#06b6d4', bg: '#cffafe', border: '#0891b2', text: '#0891b2' },
  sentence:  { mark: '#22c55e', bg: '#f0fdf4', border: '#22c55e', text: '#16a34a' },
  examPoint: { mark: '#eab308', bg: '#fef9c3', border: '#eab308', text: '#ca8a04' },
};

const ANN_TYPES = ['vocab', 'grammar', 'syntax', 'sentence', 'examPoint'] as const;
const ANN_LABELS: Record<AnnoType, string> = {
  vocab: '어휘',
  grammar: '문법',
  syntax: '구문',
  sentence: '문장',
  examPoint: '출제',
};
const ANN_ICONS: Record<AnnoType, React.ComponentType<{ width?: number; height?: number; color?: string; strokeWidth?: number }>> = {
  vocab: BookOpen,
  grammar: PenTool,
  syntax: Braces,
  sentence: MessageSquare,
  examPoint: Target,
};

// ─── Stage timing ─────────────────────────────────────────────────────────
const STAGE = {
  intro:    { from: 0,    dur: 60 },
  load:     { from: 60,   dur: 90 },
  type:     { from: 150,  dur: 60 },
  ann1:     { from: 210,  dur: 130 },
  ann2:     { from: 340,  dur: 100 },
  ann3:     { from: 440,  dur: 100 },
  info:     { from: 540,  dur: 110 },
  knowhow:  { from: 650,  dur: 130 },
  submit:   { from: 780,  dur: 90 },
  bridge:   { from: 870,  dur: 50 },
  ai:       { from: 920,  dur: 180 },
  analysis: { from: 1100, dur: 200 },
  outro:    { from: 1300, dur: 100 },
};
export const PASSAGE_DEEP_DIVE_TOTAL = 1400;

// ─── Helpers ──────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── Background ───────────────────────────────────────────────────────────
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.3) % 32;
  return (
    <AbsoluteFill style={{ background: '#f6f8fc' }}>
      <div
        style={{
          position: 'absolute',
          inset: -50,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(59,130,246,0.13) 1px, transparent 0)',
          backgroundSize: '32px 32px',
          backgroundPosition: `${drift}px ${drift}px`,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 800px 600px at 30% 0%, rgba(219,234,254,0.55), transparent 60%), radial-gradient(ellipse 700px 500px at 80% 100%, rgba(191,219,254,0.35), transparent 60%)',
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Page header ──────────────────────────────────────────────────────────
const PageHeader: React.FC<{ analyzing: number; done: number }> = ({ analyzing, done }) => {
  const frame = useCurrentFrame();
  const spin = (frame * 12) % 360;
  return (
    <>
      {/* Status bar */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: 60,
          right: 60,
          display: 'flex',
          justifyContent: 'space-between',
          color: '#0f172a',
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        <span>9:41</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 22 }}>
          <span
            style={{
              display: 'inline-block',
              width: 22,
              height: 22,
              border: '2px solid #0f172a',
              borderRadius: 4,
            }}
          />
          100%
        </span>
      </div>

      {/* Header bar — y 90 to 220 */}
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 0,
          right: 0,
          height: 130,
          background: 'white',
          borderBottom: '1.5px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          padding: '0 36px',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft width={28} height={28} color="#475569" />
        </div>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: '#eff6ff',
            border: '1.5px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FileText width={28} height={28} color="#2563eb" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
            지문 등록
          </div>
          <div style={{ fontSize: 18, color: '#64748b', fontWeight: 600 }}>
            지문을 연속으로 등록하고, 백그라운드에서 AI 분석
          </div>
        </div>
        {analyzing > 0 && (
          <div
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              color: '#1d4ed8',
              fontSize: 18,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Loader2 width={18} height={18} style={{ transform: `rotate(${spin}deg)` }} />
            분석 {analyzing}
          </div>
        )}
        {done > 0 && (
          <div
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: '#ecfdf5',
              border: '1.5px solid #a7f3d0',
              color: '#047857',
              fontSize: 18,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CheckCircle2 width={18} height={18} /> 완료 {done}
          </div>
        )}
      </div>
    </>
  );
};

// ─── Title row (dropdown OR loaded title pill) — y 240-300 ────────────────
const TitleRow: React.FC<{
  open: boolean;
  selectedTitle: string;
  hoverIdx: number | null;
}> = ({ open, selectedTitle, hoverIdx }) => {
  const titles = [
    'The Science of Sleep',
    'Urban Farming Revolution',
    'The Digital Divide',
  ];
  return (
    <>
      {/* Pill (always visible) */}
      <div
        style={{
          position: 'absolute',
          left: 40,
          top: 240,
          width: 540,
          height: 56,
          background: selectedTitle ? 'white' : 'transparent',
          border: selectedTitle ? '1.5px solid #bfdbfe' : '2px dashed #cbd5e1',
          borderRadius: 14,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: selectedTitle ? '#0f172a' : '#94a3b8',
          fontSize: 20,
          fontWeight: 700,
          zIndex: 6,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {selectedTitle && <FileText width={20} height={20} color="#2563eb" />}
          {selectedTitle || '테스트 지문 불러오기...'}
        </span>
        <ChevronDown width={22} height={22} color="#94a3b8" />
      </div>

      {/* Right meta */}
      {selectedTitle && (
        <div
          style={{
            position: 'absolute',
            right: 40,
            top: 240,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 18px',
            borderRadius: 14,
            background: '#f1f5f9',
            color: '#475569',
            fontSize: 18,
            fontWeight: 700,
            zIndex: 6,
          }}
        >
          93 words · expository
        </div>
      )}

      {/* Open dropdown overlay — appears at z-index 60 ABOVE card */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 304,
            left: 40,
            width: 540,
            background: 'white',
            border: '1.5px solid #e2e8f0',
            borderRadius: 14,
            boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
            padding: 8,
            zIndex: 60,
          }}
        >
          {titles.map((t, i) => (
            <div
              key={t}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: hoverIdx === i ? '#eff6ff' : 'transparent',
                color: hoverIdx === i ? '#1d4ed8' : '#0f172a',
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ─── Cursor ───────────────────────────────────────────────────────────────
const Cursor: React.FC<{ x: number; y: number; pressed: boolean; aiMode?: boolean }> = ({
  x,
  y,
  pressed,
  aiMode,
}) => {
  const frame = useCurrentFrame();
  const ringScale = pressed ? 1 + Math.sin(frame / 4) * 0.15 : 1;
  const color = aiMode ? '#a855f7' : '#0f172a';
  const glowColor = aiMode ? 'rgba(168,85,247,0.45)' : 'rgba(59,130,246,0.28)';

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
          background: `radial-gradient(circle, ${glowColor} 0%, rgba(0,0,0,0) 70%)`,
          mixBlendMode: 'multiply',
          zIndex: 99,
          pointerEvents: 'none',
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
            border: `4px solid ${aiMode ? '#a855f7' : '#3b82f6'}`,
            background: aiMode ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)',
            transform: `scale(${ringScale})`,
            zIndex: 100,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: x - 9,
          top: y - 5,
          filter: 'drop-shadow(0 6px 14px rgba(15,23,42,0.4))',
          zIndex: 101,
        }}
      >
        <MousePointer2 width={56} height={56} fill="white" color={color} strokeWidth={1.6} />
      </div>
    </>
  );
};

// ─── Annotation toolbar (appears below selection) ──────────────────────────
const AnnoToolbar: React.FC<{
  centerX: number;
  topY: number;
  scale: number;
  highlightedIdx: number | null;
}> = ({ centerX, topY, scale, highlightedIdx }) => {
  const TOOL_W = 700;
  const BTN_W = 130;
  const left = clamp(centerX - TOOL_W / 2, 20, 1080 - TOOL_W - 20);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: topY,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        zIndex: 70,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: clamp(centerX - left - 10, 20, TOOL_W - 30),
          width: 20,
          height: 20,
          background: '#1e3a5f',
          transform: 'rotate(45deg)',
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: 10,
          borderRadius: 22,
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          boxShadow:
            '0 18px 40px rgba(37,99,235,0.42), inset 0 0 0 1.5px rgba(255,255,255,0.12)',
          width: TOOL_W,
        }}
      >
        {ANN_TYPES.map((t, i) => {
          const Icon = ANN_ICONS[t];
          const hot = highlightedIdx === i;
          return (
            <div
              key={t}
              style={{
                width: BTN_W,
                height: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 14,
                background: hot ? 'rgba(255,255,255,0.25)' : 'transparent',
                color: 'white',
                fontWeight: 800,
                fontSize: 22,
                transform: hot ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <Icon width={26} height={26} />
              {ANN_LABELS[t]}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Computed: position of a particular toolbar button on screen
const toolbarButtonX = (centerX: number, buttonIdx: number) => {
  const TOOL_W = 700;
  const BTN_W = 130;
  const left = clamp(centerX - TOOL_W / 2, 20, 1080 - TOOL_W - 20);
  return left + 10 + BTN_W * buttonIdx + BTN_W / 2;
};

// ─── Memo popup ───────────────────────────────────────────────────────────
const MemoPopup: React.FC<{
  centerX: number;
  topY: number;
  scale: number;
  type: AnnoType;
  text: string;
  caret: boolean;
  showSavedHint?: boolean;
}> = ({ centerX, topY, scale, type, text, caret, showSavedHint }) => {
  const W = 620;
  const left = clamp(centerX - W / 2, 20, 1080 - W - 20);
  const Icon = ANN_ICONS[type];
  const c = ANN_COLORS[type];

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: topY,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        width: W,
        background: 'white',
        border: '1.5px solid #e2e8f0',
        borderRadius: 18,
        boxShadow: '0 22px 50px rgba(15,23,42,0.2)',
        padding: 18,
        zIndex: 70,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: clamp(centerX - left - 8, 20, W - 24),
          width: 16,
          height: 16,
          background: 'white',
          border: '1.5px solid #e2e8f0',
          borderBottom: 'none',
          borderRight: 'none',
          transform: 'rotate(45deg)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon width={20} height={20} color={c.text} />
        <span style={{ fontSize: 20, fontWeight: 900, color: c.text }}>
          {ANN_LABELS[type]}
        </span>
        <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 700 }}>마킹 완료</span>
        {showSavedHint && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 16,
              color: '#10b981',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <CheckCircle2 width={16} height={16} /> 저장됨
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            height: 56,
            background: '#f8fafc',
            border: '1.5px solid #cbd5e1',
            borderRadius: 12,
            padding: '0 18px',
            fontSize: 22,
            display: 'flex',
            alignItems: 'center',
            color: '#0f172a',
            fontWeight: 600,
          }}
        >
          {text || (
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>
              메모 (Enter 저장, Esc 건너뛰기)
            </span>
          )}
          {caret && (
            <span
              style={{
                display: 'inline-block',
                width: 3,
                height: 26,
                background: '#3b82f6',
                marginLeft: 2,
              }}
            />
          )}
        </div>
        <div
          style={{
            height: 56,
            padding: '0 22px',
            background: '#2563eb',
            color: 'white',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          저장
        </div>
      </div>
    </div>
  );
};

// Position of memo's 저장 button (for cursor click target)
const memoSaveCenter = (centerX: number, topY: number) => {
  const W = 620;
  const left = clamp(centerX - W / 2, 20, 1080 - W - 20);
  return { x: left + W - 18 - 50, y: topY + 18 + 28 };
};

// ─── Annotation mark (saved highlight on passage) ─────────────────────────
const AnnoMark: React.FC<{ a: AnnoSpec; revealT: number }> = ({ a, revealT }) => {
  const c = ANN_COLORS[a.type];
  const x = colX(a.cs);
  const fullW = (a.ce - a.cs) * CHAR_W;
  const w = fullW * revealT;
  const y = lineY(a.line);

  const styleByType: Record<AnnoType, React.CSSProperties> = {
    vocab: {
      background: `linear-gradient(to top, ${c.bg} 35%, transparent 35%)`,
      borderBottom: `3px solid ${c.mark}`,
    },
    grammar: {
      backgroundImage: `repeating-linear-gradient(to right, ${c.mark} 0 5px, transparent 5px 10px)`,
      backgroundSize: '100% 4px',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'bottom',
    },
    syntax: {
      borderBottom: `3px dashed ${c.border}`,
    },
    sentence: {
      background: c.bg,
      borderLeft: `4px solid ${c.mark}`,
    },
    examPoint: {
      background: `linear-gradient(to top, ${c.bg} 45%, transparent 45%)`,
    },
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + 4,
        width: w,
        height: LINE_H - 8,
        ...styleByType[a.type],
        borderRadius: 2,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
};

// ─── Live drag selection (transient) ──────────────────────────────────────
const DragSelection: React.FC<{ a: AnnoSpec; t: number }> = ({ a, t }) => {
  if (t <= 0) return null;
  const x = colX(a.cs);
  const w = (a.ce - a.cs) * CHAR_W * t;
  const y = lineY(a.line);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + 4,
        width: w,
        height: LINE_H - 8,
        background: 'rgba(59,130,246,0.28)',
        border: '1.5px solid rgba(59,130,246,0.6)',
        borderRadius: 4,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
};

// ─── Editor card (composes legend + passage + marks + drag) ───────────────
const EditorCard: React.FC<{
  charsShown: number;
  marks: AnnoSpec[];
  liveDrag: { a: AnnoSpec; t: number } | null;
  showLegend: boolean;
}> = ({ charsShown, marks, liveDrag, showLegend }) => {
  const counts = ANN_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: marks.filter((m) => m.type === t).length }),
    {} as Record<AnnoType, number>,
  );
  const hasAnyMark = marks.length > 0;

  // Typewriter: how many chars to render per line
  let remaining = charsShown;
  const renderedLines = URBAN_LINES.map((line) => {
    if (remaining <= 0) return '';
    const take = Math.min(line.length, remaining);
    remaining -= take;
    if (remaining > 0) remaining -= 1;
    return line.slice(0, take);
  });

  return (
    <>
      {/* Card body */}
      <div
        style={{
          position: 'absolute',
          left: CARD_LEFT,
          top: CARD_TOP,
          width: CARD_W,
          height: CARD_H,
          background: 'white',
          borderRadius: 22,
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 20px 50px rgba(15,23,42,0.10)',
          overflow: 'hidden',
        }}
      >
        {/* top accent stripe */}
        <div
          style={{
            height: 5,
            background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 50%, #22c55e 100%)',
          }}
        />
        {/* Legend bar (only shows after passage loads) */}
        {showLegend && (
          <div
            style={{
              height: LEGEND_H,
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              padding: '0 36px',
              borderBottom: '1px solid #f1f5f9',
              background: '#fafbfc',
            }}
          >
            {ANN_TYPES.map((t) => {
              const Icon = ANN_ICONS[t];
              const c = ANN_COLORS[t];
              const n = counts[t];
              return (
                <div
                  key={t}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: n > 0 ? c.text : '#94a3b8',
                    opacity: hasAnyMark ? 1 : 0.5,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: n > 0 ? c.mark : '#cbd5e1',
                    }}
                  />
                  <Icon width={18} height={18} />
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{ANN_LABELS[t]}</span>
                  {n > 0 && (
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{n}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Passage content rendered in absolute screen coords (above card) */}
      {/* Annotation marks first (lower z-index than text) */}
      {marks.map((m, i) => (
        <AnnoMark key={`m-${i}`} a={m} revealT={1} />
      ))}
      {liveDrag && <DragSelection a={liveDrag.a} t={liveDrag.t} />}

      {URBAN_LINES.map((_, i) => {
        const visible = renderedLines[i].length > 0;
        return (
          <React.Fragment key={`l-${i}`}>
            {/* Line number — separate, sits LEFT of passage. Does not affect text layout. */}
            <div
              style={{
                position: 'absolute',
                top: lineY(i) + 6,
                left: PASS_LEFT - 38,
                fontFamily: MONO,
                fontSize: 16,
                lineHeight: `${LINE_H}px`,
                color: '#cbd5e1',
                fontWeight: 700,
                zIndex: 3,
                opacity: visible ? 1 : 0,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </div>
            {/* Text content — starts EXACTLY at PASS_LEFT so colX(0) aligns. */}
            <div
              style={{
                position: 'absolute',
                top: lineY(i),
                left: PASS_LEFT,
                fontFamily: MONO,
                fontSize: 30,
                lineHeight: `${LINE_H}px`,
                color: '#1e293b',
                whiteSpace: 'pre',
                zIndex: 3,
                opacity: visible ? 1 : 0,
              }}
            >
              {renderedLines[i]}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

// ─── 지문 정보 sheet ───────────────────────────────────────────────────────
type InfoState = {
  school?: string;
  grade?: string;
  semester?: string;
  unit?: string;
  source?: string;
  publisher?: string;
  tags?: string[];
};

const Field: React.FC<{
  label: string;
  value?: string;
  placeholder: string;
  w: string | number;
}> = ({ label, value, placeholder, w }) => (
  <div style={{ width: w }}>
    <div style={{ fontSize: 16, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>{label}</div>
    <div
      style={{
        height: 52,
        border: '1.5px solid #e2e8f0',
        borderRadius: 12,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        fontSize: 20,
        fontWeight: 700,
        color: value ? '#0f172a' : '#94a3b8',
        background: value ? '#f8fafc' : 'white',
      }}
    >
      {value || placeholder}
    </div>
  </div>
);

const InfoSheet: React.FC<{
  visible: boolean;
  enterT: number;
  exitT: number;
  state: InfoState;
}> = ({ visible, enterT, exitT, state }) => {
  if (!visible) return null;
  const slide = (1 - enterT) * 1080 + exitT * -1080;
  return (
    <div
      style={{
        position: 'absolute',
        left: CARD_LEFT,
        top: CARD_TOP,
        width: CARD_W,
        height: CARD_H,
        transform: `translateX(${slide}px)`,
        background: 'white',
        borderRadius: 22,
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 20px 50px rgba(15,23,42,0.10)',
        padding: 36,
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: '#eff6ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FileText width={28} height={28} color="#2563eb" />
        </div>
        <div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a' }}>지문 정보</div>
          <div style={{ fontSize: 18, color: '#64748b', fontWeight: 600 }}>
            출처와 메타데이터를 추가하세요
          </div>
        </div>
      </div>

      <Field label="학교" value={state.school} placeholder="학교 선택" w={'100%'} />
      <div style={{ display: 'flex', gap: 18, marginTop: 18 }}>
        <Field label="학년" value={state.grade} placeholder="학년" w="48%" />
        <Field label="학기" value={state.semester} placeholder="학기" w="48%" />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 18 }}>
        <Field label="단원" value={state.unit} placeholder="Lesson 5" w="48%" />
        <Field label="출처" value={state.source} placeholder="2025 중간" w="48%" />
      </div>
      <div style={{ marginTop: 18 }}>
        <Field label="출판사" value={state.publisher} placeholder="출판사" w={'100%'} />
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 16, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>태그</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(state.tags || []).map((tg) => (
            <div
              key={tg}
              style={{
                padding: '8px 16px',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: 18,
                fontWeight: 700,
                borderRadius: 999,
                border: '1.5px solid #bfdbfe',
              }}
            >
              #{tg}
            </div>
          ))}
          <div
            style={{
              flex: 1,
              minWidth: 200,
              height: 48,
              border: '1.5px solid #e2e8f0',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              fontSize: 18,
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            입력 후 Enter
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 28,
          padding: '20px 22px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, #eff6ff 0%, #ecfeff 100%)',
          border: '1.5px solid #bfdbfe',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Zap width={32} height={32} color="#2563eb" fill="#2563eb" />
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#1e3a8a' }}>
            AI 분석 정확도 +35%
          </div>
          <div style={{ fontSize: 18, color: '#475569', fontWeight: 600 }}>
            출처와 학년 정보가 분석 품질을 끌어올립니다
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── 노하우 sheet ──────────────────────────────────────────────────────────
const KnowhowSheet: React.FC<{
  visible: boolean;
  enterT: number;
  exitT: number;
  text: string;
  caret: boolean;
}> = ({ visible, enterT, exitT, text, caret }) => {
  if (!visible) return null;
  const slide = (1 - enterT) * 1080 + exitT * -1080;
  return (
    <div
      style={{
        position: 'absolute',
        left: CARD_LEFT,
        top: CARD_TOP,
        width: CARD_W,
        height: CARD_H,
        transform: `translateX(${slide}px)`,
        background: 'linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)',
        borderRadius: 22,
        border: '1.5px solid #bfdbfe',
        boxShadow: '0 20px 50px rgba(59,130,246,0.18)',
        padding: 36,
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 18px rgba(59,130,246,0.4)',
          }}
        >
          <PenTool width={28} height={28} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 30,
              fontWeight: 900,
              color: '#0f172a',
            }}
          >
            선생님의 노하우
            <span
              style={{
                padding: '4px 12px',
                background: '#2563eb',
                color: 'white',
                fontSize: 16,
                fontWeight: 800,
                borderRadius: 999,
              }}
            >
              AI 반영
            </span>
          </div>
          <div style={{ fontSize: 18, color: '#475569', fontWeight: 600 }}>
            노하우를 적으면 AI가 출제 의도까지 반영합니다
          </div>
        </div>
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1.5px solid #bfdbfe',
            background: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#2563eb',
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          <Bookmark width={18} height={18} /> 저장된 노트
        </div>
      </div>

      <div
        style={{
          background: 'white',
          border: '1.5px solid #bfdbfe',
          borderRadius: 16,
          padding: 24,
          height: 580,
          fontSize: 22,
          lineHeight: 1.75,
          color: '#0f172a',
          whiteSpace: 'pre-wrap',
          fontWeight: 500,
        }}
      >
        {text}
        {caret && (
          <span
            style={{
              display: 'inline-block',
              width: 3,
              height: 26,
              background: '#3b82f6',
              marginLeft: 2,
              verticalAlign: 'middle',
            }}
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 24 }}>
        {[
          { label: '출제 의도 반영', icon: Target, color: '#eab308' },
          { label: '학교별 빈출 패턴', icon: Zap, color: '#2563eb' },
        ].map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              style={{
                background: 'white',
                border: '1.5px solid #e0e7ff',
                borderRadius: 14,
                padding: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Icon width={26} height={26} color={c.color} />
              <span style={{ fontSize: 20, fontWeight: 800, color: '#1e3a8a' }}>{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Action button bar ────────────────────────────────────────────────────
const ActionBar: React.FC<{ saving: boolean; clickAt: number; localFrame: number }> = ({
  saving,
  clickAt,
  localFrame,
}) => {
  const pressed = localFrame >= clickAt && localFrame < clickAt + 8;
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        top: 1700,
        height: 88,
        display: 'flex',
        gap: 14,
        zIndex: 30,
      }}
    >
      <div
        style={{
          width: 220,
          height: 88,
          borderRadius: 18,
          border: '1.5px solid #cbd5e1',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontSize: 22,
          fontWeight: 800,
          color: '#475569',
        }}
      >
        <Save width={22} height={22} /> 저장만
      </div>
      <div
        style={{
          flex: 1,
          height: 88,
          borderRadius: 18,
          background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontSize: 26,
          fontWeight: 900,
          color: 'white',
          boxShadow: pressed
            ? '0 4px 12px rgba(37,99,235,0.4)'
            : '0 16px 38px rgba(37,99,235,0.5)',
          transform: pressed ? 'scale(0.97)' : 'scale(1)',
        }}
      >
        {saving ? (
          <>
            <Loader2
              width={28}
              height={28}
              style={{ transform: `rotate(${localFrame * 14}deg)` }}
            />
            등록 중...
          </>
        ) : (
          <>
            <Wand2 width={28} height={28} /> 등록 + AI 분석 실행
          </>
        )}
        {!saving && (
          <span
            style={{
              padding: '4px 12px',
              background: 'rgba(255,255,255,0.22)',
              borderRadius: 999,
              fontSize: 18,
              fontWeight: 800,
              marginLeft: 6,
            }}
          >
            5 크레딧
          </span>
        )}
      </div>
    </div>
  );
};

// CTA center for cursor click
const CTA_CENTER = { x: 40 + 220 + 14 + (1080 - 80 - 220 - 14) / 2, y: 1700 + 44 };

// ─── Toast ────────────────────────────────────────────────────────────────
const Toast: React.FC<{ visible: boolean; localFrame: number }> = ({ visible, localFrame }) => {
  if (!visible) return null;
  const enter = spring({ frame: localFrame, fps: 30, config: { damping: 11 } });
  const y = interpolate(enter, [0, 1], [120, 0]);
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        bottom: 200,
        background: '#0f172a',
        color: 'white',
        borderRadius: 18,
        padding: '22px 26px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 20px 50px rgba(15,23,42,0.55)',
        transform: `translateY(${y}px)`,
        zIndex: 80,
      }}
    >
      <CheckCircle2 width={32} height={32} color="#34d399" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>지문이 등록되었습니다</div>
        <div style={{ fontSize: 18, color: '#cbd5e1', fontWeight: 600 }}>
          백그라운드에서 AI 분석을 시작합니다
        </div>
      </div>
    </div>
  );
};

// ─── Bridge banner ────────────────────────────────────────────────────────
const BridgeBanner: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const enter = spring({ frame: localFrame, fps: 30, config: { damping: 10 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const scale = interpolate(enter, [0, 1], [0.85, 1]);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        background: 'linear-gradient(135deg, #0f172a 0%, #312e81 100%)',
        padding: '36px 56px',
        borderRadius: 28,
        textAlign: 'center',
        boxShadow: '0 30px 80px rgba(15,23,42,0.65)',
        zIndex: 95,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: '#a5b4fc', marginBottom: 14 }}>
        메모하기 귀찮다면?
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 900,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          background: 'linear-gradient(135deg, #c4b5fd 0%, #67e8f9 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        AI가 전부 자동으로
      </div>
    </div>
  );
};

// ─── AI auto annotation overlay ───────────────────────────────────────────
const AIAutoOverlay: React.FC<{
  marks: AnnoSpec[];
  localFrame: number;
}> = ({ marks, localFrame }) => {
  const counts = ANN_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: marks.filter((m) => m.type === t).length }),
    {} as Record<AnnoType, number>,
  );
  const total = marks.length;
  const seconds = (localFrame / 30).toFixed(1);

  return (
    <>
      {/* Top mode banner — replaces title row */}
      <div
        style={{
          position: 'absolute',
          left: 40,
          top: 240,
          right: 40,
          height: 56,
          background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 22px',
          color: 'white',
          fontSize: 20,
          fontWeight: 800,
          boxShadow: '0 12px 32px rgba(124,58,237,0.4)',
          zIndex: 30,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wand2 width={22} height={22} />
          AI 자동 분석 모드 — 메모 없이도 OK
        </span>
        <span
          style={{
            padding: '6px 14px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 999,
            fontSize: 18,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Loader2
            width={16}
            height={16}
            style={{ transform: `rotate(${localFrame * 16}deg)` }}
          />
          {seconds}s · {total} 마킹
        </span>
      </div>

      {/* Stats panel — replaces action bar */}
      <div
        style={{
          position: 'absolute',
          left: 40,
          right: 40,
          top: 1620,
          background: 'rgba(15,23,42,0.95)',
          backdropFilter: 'blur(16px)',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 24px 60px rgba(15,23,42,0.45)',
          zIndex: 30,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <div style={{ color: 'white', fontSize: 22, fontWeight: 900 }}>
            실시간 분석 현황
          </div>
          <div
            style={{
              fontSize: 20,
              color: '#a5b4fc',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Gemini · 평균 0.18s/항목
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 14,
          }}
        >
          {ANN_TYPES.map((t) => {
            const Icon = ANN_ICONS[t];
            const c = ANN_COLORS[t];
            const n = counts[t];
            return (
              <div
                key={t}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: `1.5px solid ${c.mark}40`,
                  borderRadius: 14,
                  padding: '16px 12px',
                  textAlign: 'center',
                }}
              >
                <Icon
                  width={24}
                  height={24}
                  color={c.mark}
                  strokeWidth={2}
                />
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 16,
                    color: '#cbd5e1',
                    fontWeight: 700,
                  }}
                >
                  {ANN_LABELS[t]}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    color: c.mark,
                    fontVariantNumeric: 'tabular-nums',
                    marginTop: 2,
                  }}
                >
                  {n}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ─── Analysis modal view (after AI completes) ─────────────────────────────
type AnalyzedSentence = {
  num: number;
  english: string;
  korean: string;
  topic?: boolean;
  syntaxTag?: boolean;
};

const ANALYZED_PASSAGE: AnalyzedSentence[] = [
  {
    num: 1,
    english: 'In cities around the world, a quiet revolution is taking place on rooftops and in abandoned buildings.',
    korean: '세계 여러 도시의 옥상과 버려진 건물에서 조용한 혁명이 일어나고 있다.',
  },
  {
    num: 2,
    english: 'Urban farming has grown rapidly as people seek fresh, locally grown food.',
    korean: '사람들이 신선한 현지 농산물을 찾으면서 도시 농업이 빠르게 성장했다.',
    syntaxTag: true,
  },
  {
    num: 3,
    english: 'Unlike traditional agriculture, urban farms use innovative techniques such as vertical farming and hydroponics to grow crops in limited spaces.',
    korean: '전통 농업과 달리 도시 농장은 좁은 공간에서 작물을 기르기 위해 수직농법과 수경재배 같은 혁신 기술을 사용한다.',
    topic: true,
  },
  {
    num: 4,
    english: 'Beyond providing food, urban farms create green spaces that reduce air pollution and lower temperatures.',
    korean: '음식 제공을 넘어 도시 농장은 대기 오염을 줄이고 기온을 낮추는 녹지 공간을 만든다.',
  },
];

const AnalysisModal: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const enter = spring({ frame: localFrame, fps: 30, config: { damping: 14 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const ty = interpolate(enter, [0, 1], [120, 0]);

  // Cards reveal stagger
  const card1Enter = spring({ frame: localFrame - 30, fps: 30, config: { damping: 12 } });
  const card2Enter = spring({ frame: localFrame - 60, fps: 30, config: { damping: 12 } });
  const card3Enter = spring({ frame: localFrame - 90, fps: 30, config: { damping: 12 } });

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        top: 100,
        bottom: 80,
        background: 'white',
        borderRadius: 28,
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 30px 80px rgba(15,23,42,0.25)',
        opacity,
        transform: `translateY(${ty}px)`,
        zIndex: 90,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Modal header */}
      <div
        style={{
          padding: '20px 28px',
          borderBottom: '1.5px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'linear-gradient(90deg, #eff6ff 0%, white 50%)',
        }}
      >
        <Wand2 width={26} height={26} color="#2563eb" />
        <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>
          AI 지문 분석 결과
        </div>
        <span
          style={{
            padding: '4px 12px',
            background: '#dcfce7',
            color: '#15803d',
            fontSize: 16,
            fontWeight: 800,
            borderRadius: 999,
          }}
        >
          완료 · 6.4s
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {[
            { label: '어휘', n: 9, color: '#3b82f6' },
            { label: '문법', n: 4, color: '#8b5cf6' },
            { label: '구문', n: 2, color: '#06b6d4' },
            { label: '핵심문장', n: 1, color: '#22c55e' },
            { label: '출제포인트', n: 5, color: '#eab308' },
          ].map((t, i) => (
            <div
              key={i}
              style={{
                padding: '6px 10px',
                background: 'white',
                border: `1.5px solid ${t.color}66`,
                borderRadius: 8,
                color: t.color,
                fontSize: 15,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{ width: 7, height: 7, borderRadius: 999, background: t.color }}
              />
              {t.label} {t.n}
            </div>
          ))}
        </div>
      </div>

      {/* Body — passage + side cards */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: annotated passage */}
        <div
          style={{
            flex: 1,
            padding: '24px 28px',
            borderRight: '1.5px solid #f1f5f9',
            overflow: 'hidden',
          }}
        >
          {ANALYZED_PASSAGE.map((s) => (
            <div
              key={s.num}
              style={{
                marginBottom: 14,
                paddingLeft: s.topic ? 8 : 0,
                borderLeft: s.topic ? '4px solid #22c55e' : 'none',
                background: s.topic ? 'rgba(240,253,244,0.5)' : 'transparent',
                borderRadius: s.topic ? 6 : 0,
                padding: s.topic ? '4px 8px' : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color: '#94a3b8',
                    marginTop: 6,
                  }}
                >
                  {s.num}
                </span>
                {s.topic && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color: '#16a34a',
                      background: '#dcfce7',
                      padding: '2px 6px',
                      borderRadius: 4,
                      marginTop: 6,
                    }}
                  >
                    주제문
                  </span>
                )}
                {s.syntaxTag && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color: '#0891b2',
                      background: '#cffafe',
                      padding: '2px 6px',
                      borderRadius: 4,
                      marginTop: 6,
                    }}
                  >
                    구문
                  </span>
                )}
                <AnnotatedSentence sentence={s} />
              </div>
              <div
                style={{
                  fontSize: 16,
                  color: '#94a3b8',
                  marginTop: 4,
                  paddingLeft: 22,
                  fontWeight: 500,
                  lineHeight: 1.55,
                }}
              >
                {s.korean}
              </div>
            </div>
          ))}
        </div>

        {/* Right: insight cards */}
        <div
          style={{
            width: 460,
            padding: '24px 28px',
            background: '#fafbfc',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Card 1: 분석 요약 */}
          <div
            style={{
              opacity: card1Enter,
              transform: `translateY(${interpolate(card1Enter, [0, 1], [20, 0])}px)`,
              background: 'white',
              border: '1.5px solid #e2e8f0',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: '#0f172a',
                marginBottom: 10,
              }}
            >
              분석 요약
            </div>
            <div
              style={{
                background: '#f8fafc',
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>
                주제
              </div>
              <div style={{ fontSize: 15, color: '#0f172a', fontWeight: 600 }}>
                도시 농업의 혁신 기술과 환경적 이점
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>
              논리 흐름
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['도입', '대조', '예시', '확장', '결론'].map((step, i) => (
                <React.Fragment key={i}>
                  <span
                    style={{
                      padding: '4px 10px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: 14,
                      fontWeight: 800,
                      borderRadius: 6,
                    }}
                  >
                    {step}
                  </span>
                  {i < 4 && <span style={{ color: '#cbd5e1', fontSize: 14 }}>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Card 2: 출제 포인트 */}
          <div
            style={{
              opacity: card2Enter,
              transform: `translateY(${interpolate(card2Enter, [0, 1], [20, 0])}px)`,
              background: 'linear-gradient(180deg, #fefce8 0%, white 100%)',
              border: '1.5px solid #fde68a',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Target width={18} height={18} color="#ca8a04" />
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>출제 포인트</div>
              <span
                style={{
                  padding: '2px 8px',
                  background: '#ede9fe',
                  color: '#7c3aed',
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 999,
                }}
              >
                서술형/변형
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  background: '#f1f5f9',
                  color: '#475569',
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 999,
                }}
              >
                중급
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 14,
                lineHeight: 1.6,
                background: 'linear-gradient(to top, #fef9c3 35%, white 35%)',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #fde68a',
                marginBottom: 8,
              }}
            >
              ...urban farms use innovative techniques such as{' '}
              <span style={{ background: '#fde68a', padding: '0 2px' }}>
                vertical farming and hydroponics
              </span>
              ...
            </div>
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <span style={{ color: '#a16207', fontWeight: 800 }}>출제 이유: </span>
              <span style={{ color: '#0f172a' }}>
                패러프레이즈 가능한 핵심 명사구 + 정의 구조 결합 → 빈칸/요약 출제
              </span>
            </div>
            <div
              style={{
                background: '#f1f5f9',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 13,
                color: '#0f172a',
                fontStyle: 'italic',
                fontWeight: 600,
              }}
            >
              예상 문항: vertical farming의 정의를 본문에서 찾아 한 문장으로 영작하시오.
            </div>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: '#7c3aed',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              <ArrowRightLeft width={14} height={14} />
              구조 변형: 동격 → 관계대명사
            </div>
            <div
              style={{
                marginTop: 6,
                background: '#ede9fe',
                color: '#5b21b6',
                fontFamily: MONO,
                fontSize: 12,
                padding: '8px 10px',
                borderRadius: 8,
                lineHeight: 1.5,
              }}
            >
              → ...techniques, which include vertical farming and hydroponics, to grow crops...
            </div>
          </div>

          {/* Card 3: 어법 포인트 */}
          <div
            style={{
              opacity: card3Enter,
              transform: `translateY(${interpolate(card3Enter, [0, 1], [20, 0])}px)`,
              background: 'linear-gradient(180deg, #faf5ff 0%, white 100%)',
              border: '1.5px solid #e9d5ff',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <PenTool width={18} height={18} color="#7c3aed" />
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>어법 포인트</div>
              <span
                style={{
                  padding: '2px 8px',
                  background: '#dbeafe',
                  color: '#1d4ed8',
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 999,
                }}
              >
                4지선다
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 14,
                lineHeight: 1.7,
                padding: 10,
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              ...bring people together,{' '}
              <span
                style={{
                  textDecoration: 'underline wavy #8b5cf6',
                  textUnderlineOffset: 3,
                }}
              >
                fostering
              </span>{' '}
              social connections...
            </div>
            <div
              style={{
                marginTop: 8,
                background: '#f5f3ff',
                color: '#5b21b6',
                fontSize: 13,
                padding: '8px 10px',
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              <strong>분사구문</strong>: 부대상황 (= and they foster ~)
            </div>
            <div
              style={{
                marginTop: 6,
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                color: '#475569',
                fontWeight: 600,
              }}
            >
              ① fostered &nbsp; ② foster &nbsp; ③ <span style={{ color: '#7c3aed', fontWeight: 900 }}>fostering</span> &nbsp; ④ to foster
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AnnotatedSentence: React.FC<{ sentence: AnalyzedSentence }> = ({ sentence }) => {
  // Render the english text with inline annotation styles applied to specific tokens.
  const text = sentence.english;
  // Define token-level marks per sentence (very lightweight)
  const marks: { word: string; type: AnnoType }[] = [];
  if (sentence.num === 1) {
    marks.push({ word: 'cities', type: 'vocab' });
    marks.push({ word: 'revolution', type: 'examPoint' });
  } else if (sentence.num === 2) {
    marks.push({ word: 'rapidly', type: 'vocab' });
    marks.push({ word: 'as', type: 'syntax' });
  } else if (sentence.num === 3) {
    marks.push({ word: 'Unlike', type: 'syntax' });
    marks.push({ word: 'innovative', type: 'vocab' });
    marks.push({ word: 'vertical farming and hydroponics', type: 'examPoint' });
  } else if (sentence.num === 4) {
    marks.push({ word: 'Beyond', type: 'grammar' });
    marks.push({ word: 'create green spaces', type: 'sentence' });
    marks.push({ word: 'pollution', type: 'vocab' });
  }

  // Build segments
  const segments: { text: string; type?: AnnoType }[] = [];
  let remaining = text;
  while (remaining.length) {
    let earliestIdx = -1;
    let earliestMark: { word: string; type: AnnoType } | null = null;
    for (const m of marks) {
      const idx = remaining.indexOf(m.word);
      if (idx >= 0 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
        earliestMark = m;
      }
    }
    if (earliestMark && earliestIdx >= 0) {
      if (earliestIdx > 0) segments.push({ text: remaining.slice(0, earliestIdx) });
      segments.push({ text: earliestMark.word, type: earliestMark.type });
      remaining = remaining.slice(earliestIdx + earliestMark.word.length);
    } else {
      segments.push({ text: remaining });
      remaining = '';
    }
  }

  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 15,
        lineHeight: 1.85,
        color: '#1e293b',
      }}
    >
      {segments.map((seg, i) => {
        if (!seg.type) return <span key={i}>{seg.text}</span>;
        const c = ANN_COLORS[seg.type];
        const styleByType: Record<AnnoType, React.CSSProperties> = {
          vocab: {
            background: `linear-gradient(to top, ${c.bg} 35%, transparent 35%)`,
            borderBottom: `2px solid ${c.mark}`,
          },
          grammar: {
            textDecoration: `underline wavy ${c.mark}`,
            textUnderlineOffset: 3,
          },
          syntax: {
            borderBottom: `2px dashed ${c.border}`,
          },
          sentence: {
            background: c.bg,
            borderLeft: `3px solid ${c.mark}`,
            paddingLeft: 4,
          },
          examPoint: {
            background: `linear-gradient(to top, ${c.bg} 45%, transparent 45%)`,
          },
        };
        return (
          <span key={i} style={styleByType[seg.type]}>
            {seg.text}
          </span>
        );
      })}
    </span>
  );
};

// ─── Outro ────────────────────────────────────────────────────────────────
const OutroOverlay: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const enter = spring({ frame: localFrame, fps: 30, config: { damping: 12 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const scale = interpolate(enter, [0, 1], [0.85, 1]);
  return (
    <AbsoluteFill
      style={{
        opacity,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(10px)',
        zIndex: 95,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            margin: '0 auto 30px',
            borderRadius: 28,
            background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 24px 60px rgba(37,99,235,0.5)',
          }}
        >
          <Wand2 width={64} height={64} color="white" />
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: '#0f172a',
            letterSpacing: '-0.03em',
            lineHeight: 1.18,
          }}
        >
          AI의 분석에
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            선생님의 노하우 한 스푼
          </span>
          <br />을 더하다.
        </div>
        <div style={{ marginTop: 28, fontSize: 26, fontWeight: 700, color: '#475569' }}>
          NARA · AI 지문 분석
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── MAIN ─────────────────────────────────────────────────────────────────
const PassageAnalysisDeepDive: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // ── Phase calculations per annotation ──
  // ann1: dur=130. phase boundaries 18 / 46 / 61 / 69 / 119 (memo-end) / end
  // ann2/3: dur=100. phase boundaries 12 / 32 / 47 / 55 / 95 / end
  const annoStarts = [STAGE.ann1.from, STAGE.ann2.from, STAGE.ann3.from];
  const annoDurs = [STAGE.ann1.dur, STAGE.ann2.dur, STAGE.ann3.dur];
  const phaseBoundsByIdx = [
    { p1: 18, p2: 46, p3: 61, p4: 69, p5: 119 }, // ann1
    { p1: 12, p2: 32, p3: 47, p4: 55, p5: 95 }, // ann2
    { p1: 12, p2: 32, p3: 47, p4: 55, p5: 95 }, // ann3
  ];

  let currentAnno: { spec: AnnoSpec; phase: number; idx: number; local: number; bounds: typeof phaseBoundsByIdx[0] } | null = null;
  for (let i = 0; i < ANNOS.length; i++) {
    const local = frame - annoStarts[i];
    if (local >= 0 && local < annoDurs[i]) {
      const b = phaseBoundsByIdx[i];
      let phase = 0;
      if (local >= b.p5) phase = 5;
      else if (local >= b.p4) phase = 4;
      else if (local >= b.p3) phase = 3;
      else if (local >= b.p2) phase = 2;
      else if (local >= b.p1) phase = 1;
      currentAnno = { spec: ANNOS[i], phase, idx: i, local, bounds: b };
      break;
    }
  }

  // ── Mark accumulation ──
  // A mark is "saved" once memo phase completes (phase >= 5)
  const marks: AnnoSpec[] = [];
  for (let i = 0; i < ANNOS.length; i++) {
    const b = phaseBoundsByIdx[i];
    if (frame >= annoStarts[i] + b.p5) marks.push(ANNOS[i]);
  }

  // ── Charsshown for typewriter ──
  let charsShown = 0;
  if (frame >= STAGE.type.from) {
    const totalChars = URBAN_LINES.join('\n').length;
    const t = Math.min(1, (frame - STAGE.type.from) / 50);
    charsShown = Math.floor(t * totalChars);
  }

  // ── Cursor coordinates ──
  let cx = width + 200;
  let cy = height + 200;
  let pressed = false;
  let cursorVisible = false;

  // Stage 1: cursor flies in to dropdown
  if (frame >= 30 && frame < 60) {
    cursorVisible = true;
    const t = (frame - 30) / 30;
    cx = interpolate(t, [0, 1], [width + 100, 470]);
    cy = interpolate(t, [0, 1], [height + 100, 268], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
  }

  // Stage 2: open + select dropdown
  let ddOpen = false;
  let ddHover: number | null = null;
  let selectedTitle = '';
  if (frame >= 60 && frame < 150) {
    cursorVisible = true;
    const lf = frame - 60;
    if (lf < 8) {
      cx = 470; cy = 268; pressed = lf > 4;
    } else if (lf < 50) {
      ddOpen = true;
      const t = (lf - 8) / 42;
      cx = interpolate(t, [0, 1], [470, 270], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
      // dropdown menu top=304, items at 304+8=312, 312+48=360, 312+96=408
      // Urban Farming = item 1 at center y = 312 + 48 + 24 = 384
      cy = interpolate(t, [0, 1], [268, 384]);
      ddHover = 1;
    } else if (lf < 70) {
      ddOpen = true;
      ddHover = 1;
      cx = 270; cy = 384;
      pressed = lf > 60;
    } else {
      selectedTitle = 'Urban Farming Revolution';
      cx = 270; cy = 384;
    }
  }
  if (frame >= 130) selectedTitle = 'Urban Farming Revolution';

  // Stage 3: typing
  if (frame >= 150 && frame < 210) {
    cursorVisible = true;
    cx = 950; cy = 280;
  }

  // Stage 4-6: annotations
  if (currentAnno) {
    cursorVisible = true;
    const a = currentAnno.spec;
    const startX = colX(a.cs);
    const endX = colX(a.ce);
    const targetY = lineCenterY(a.line);
    const selCenterX = (startX + endX) / 2;
    const toolbarTopY = lineY(a.line) + LINE_H + 14;
    const buttonX = toolbarButtonX(selCenterX, a.buttonIdx);
    const buttonY = toolbarTopY + 40;
    const memoTopY = toolbarTopY;
    const saveCenter = memoSaveCenter(selCenterX, memoTopY);
    const local = currentAnno.local;
    const b = currentAnno.bounds;

    if (currentAnno.phase === 0) {
      const prevX =
        currentAnno.idx === 0 ? 270 : colX(ANNOS[currentAnno.idx - 1].ce);
      const prevY =
        currentAnno.idx === 0 ? 384 : lineCenterY(ANNOS[currentAnno.idx - 1].line);
      const t = local / b.p1;
      cx = interpolate(t, [0, 1], [prevX, startX], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
      cy = interpolate(t, [0, 1], [prevY, targetY], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
    } else if (currentAnno.phase === 1) {
      pressed = true;
      const t = (local - b.p1) / (b.p2 - b.p1);
      cx = interpolate(t, [0, 1], [startX, endX], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
      cy = targetY;
    } else if (currentAnno.phase === 2) {
      const t = (local - b.p2) / (b.p3 - b.p2);
      cx = interpolate(t, [0, 1], [endX, buttonX], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
      cy = interpolate(t, [0, 1], [targetY, buttonY], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
    } else if (currentAnno.phase === 3) {
      cx = buttonX; cy = buttonY; pressed = true;
    } else if (currentAnno.phase === 4) {
      // memo input typing — cursor parks near input, then to 저장 right before save
      const t = (local - b.p4) / (b.p5 - b.p4);
      if (t < 0.85) {
        cx = saveCenter.x - 280; // parks over input area
        cy = saveCenter.y;
      } else {
        const t2 = (t - 0.85) / 0.15;
        cx = interpolate(t2, [0, 1], [saveCenter.x - 280, saveCenter.x]);
        cy = saveCenter.y;
      }
    } else if (currentAnno.phase === 5) {
      cx = saveCenter.x; cy = saveCenter.y;
    }
  }

  // Stage 9: submit cursor
  if (frame >= STAGE.submit.from && frame < STAGE.submit.from + STAGE.submit.dur) {
    cursorVisible = true;
    const lf = frame - STAGE.submit.from;
    if (lf < 28) {
      const t = lf / 28;
      cx = interpolate(t, [0, 1], [800, CTA_CENTER.x], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
      cy = interpolate(t, [0, 1], [1100, CTA_CENTER.y], { easing: Easing.bezier(0.4, 0, 0.2, 1) });
    } else if (lf < 36) {
      cx = CTA_CENTER.x; cy = CTA_CENTER.y; pressed = true;
    } else {
      cx = CTA_CENTER.x; cy = CTA_CENTER.y;
    }
  }

  // ── Live drag selection ──
  let liveDrag: { a: AnnoSpec; t: number } | null = null;
  if (currentAnno && (currentAnno.phase === 1 || currentAnno.phase === 2 || currentAnno.phase === 3 || currentAnno.phase === 4)) {
    const b = currentAnno.bounds;
    const t = currentAnno.phase === 1 ? Math.min(1, (currentAnno.local - b.p1) / (b.p2 - b.p1)) : 1;
    liveDrag = { a: currentAnno.spec, t };
  }

  // ── Toolbar / memo visibility ──
  let toolbarSpec: { spec: AnnoSpec; scale: number; highlightedIdx: number | null } | null = null;
  let memoSpec: {
    spec: AnnoSpec;
    scale: number;
    text: string;
    caret: boolean;
    showSaved: boolean;
  } | null = null;

  if (currentAnno) {
    const a = currentAnno.spec;
    const b = currentAnno.bounds;
    if (currentAnno.phase === 2 || currentAnno.phase === 3) {
      const since = currentAnno.local - b.p2;
      const sc = spring({ frame: since, fps, config: { damping: 12 } });
      const hi = currentAnno.phase === 3 ? a.buttonIdx : null;
      toolbarSpec = { spec: a, scale: sc, highlightedIdx: hi };
    } else if (currentAnno.phase === 4 || currentAnno.phase === 5) {
      const since = currentAnno.local - b.p4;
      const sc = currentAnno.phase === 4 ? spring({ frame: since, fps, config: { damping: 11 } }) : 1;
      const typeProg = Math.min(1, since / (b.p5 - b.p4 - 4));
      const charCount = Math.floor(typeProg * a.memo.length);
      memoSpec = {
        spec: a,
        scale: sc,
        text: a.memo.slice(0, charCount),
        caret: since % 8 < 4,
        showSaved: currentAnno.phase === 5,
      };
    }
  }

  // ── 지문 정보 state ──
  const infoState: InfoState = {};
  const infoLocal = frame - STAGE.info.from;
  if (infoLocal >= 14) infoState.school = '강동중학교';
  if (infoLocal >= 30) infoState.grade = '2학년';
  if (infoLocal >= 38) infoState.semester = '2학기';
  if (infoLocal >= 50) infoState.unit = 'Lesson 5';
  if (infoLocal >= 60) infoState.source = '2025 중간';
  if (infoLocal >= 75) infoState.publisher = '능률(김)';
  if (infoLocal >= 88) infoState.tags = ['환경'];
  if (infoLocal >= 96) infoState.tags = ['환경', '도시농업'];
  if (infoLocal >= 104) infoState.tags = ['환경', '도시농업', '지속가능성'];

  const infoVisible = frame >= STAGE.info.from && frame < STAGE.knowhow.from + 4;
  const infoEnterT = clamp((frame - STAGE.info.from) / 14, 0, 1);
  const infoExitT = clamp((frame - STAGE.knowhow.from) / 14, 0, 1);

  // ── 노하우 state ──
  const knowhowText = `• 핵심 단어: hydroponics, sustainability
• 문법 포인트: 분사구문, such as 예시
• 주요 문장: vertical farming 정의 부분
• 출제 의도: 도시 농업의 환경적 이점
• 학교 빈출 패턴: 비교/대조 구문 변형`;
  const khLocal = frame - STAGE.knowhow.from;
  const khRevealT = clamp((khLocal - 14) / 90, 0, 1);
  const khShown = knowhowText.slice(0, Math.floor(khRevealT * knowhowText.length));
  const khCaret = khLocal % 8 < 4;
  const khVisible = frame >= STAGE.knowhow.from && frame < STAGE.submit.from + 4;
  const khEnterT = clamp((frame - STAGE.knowhow.from) / 14, 0, 1);
  const khExitT = clamp((frame - STAGE.submit.from) / 14, 0, 1);

  // ── Submit ──
  const subLocal = frame - STAGE.submit.from;
  const saving = subLocal >= 36 && subLocal < 70;
  const showToast = subLocal >= 48 && subLocal < 90;

  // ── Bridge ──
  const showBridge = frame >= STAGE.bridge.from && frame < STAGE.ai.from + 30;

  // ── AI mode ──
  const aiActive = frame >= STAGE.ai.from && frame < STAGE.analysis.from;
  const analysisActive = frame >= STAGE.analysis.from && frame < STAGE.outro.from;
  const outroActive = frame >= STAGE.outro.from;

  // AI marks reveal — every 10 frames
  const aiMarks: AnnoSpec[] = [];
  if (frame >= STAGE.ai.from) {
    const aiLocal = frame - STAGE.ai.from;
    const REVEAL_INTERVAL = 10;
    const reveal = Math.floor(aiLocal / REVEAL_INTERVAL);
    for (let i = 0; i < Math.min(MASS.length, reveal); i++) {
      aiMarks.push(MASS[i]);
    }
  }

  // AI cursor — moves to next-to-be-revealed mark, presses, mark appears
  if (aiActive) {
    cursorVisible = true;
    const aiLocal = frame - STAGE.ai.from;
    const REVEAL_INTERVAL = 10;
    const phase = aiLocal % REVEAL_INTERVAL;
    const targetIdx = Math.floor(aiLocal / REVEAL_INTERVAL);
    if (targetIdx < MASS.length) {
      const m = MASS[targetIdx];
      const targetX = (colX(m.cs) + colX(m.ce)) / 2;
      const targetY = lineCenterY(m.line);
      const prev =
        targetIdx === 0
          ? { x: width / 2, y: 600 }
          : {
              x: (colX(MASS[targetIdx - 1].cs) + colX(MASS[targetIdx - 1].ce)) / 2,
              y: lineCenterY(MASS[targetIdx - 1].line),
            };
      const t = phase / REVEAL_INTERVAL;
      cx = interpolate(t, [0, 0.7, 1], [prev.x, targetX, targetX], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      cy = interpolate(t, [0, 0.7, 1], [prev.y, targetY, targetY], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      pressed = phase >= 6 && phase <= 8;
    } else {
      // hold near last
      const last = MASS[MASS.length - 1];
      cx = (colX(last.cs) + colX(last.ce)) / 2;
      cy = lineCenterY(last.line);
    }
  }

  if (analysisActive || outroActive) cursorVisible = false;

  // ── Compose ──
  return (
    <AbsoluteFill style={{ background: '#f6f8fc', overflow: 'hidden', fontFamily: FONT_FAMILY }}>
      <Background />

      {/* Page header (visible until analysis modal) */}
      {!analysisActive && !outroActive && (
        <PageHeader
          analyzing={saving ? 1 : 0}
          done={frame >= STAGE.submit.from + 75 && !aiActive ? 1 : 0}
        />
      )}

      {/* Title row OR AI banner */}
      {!aiActive && !analysisActive && !outroActive && (
        <TitleRow open={ddOpen} selectedTitle={selectedTitle} hoverIdx={ddHover} />
      )}

      {/* Editor card (visible until AI mode finishes? actually keep visible during AI) */}
      {!analysisActive && !outroActive && (
        <EditorCard
          charsShown={aiActive ? URBAN_LINES.join('\n').length : charsShown}
          marks={aiActive ? aiMarks : marks}
          liveDrag={liveDrag}
          showLegend={!aiActive && (frame >= STAGE.type.from + 30 && marks.length > 0)}
        />
      )}

      {/* Toolbar / memo */}
      {toolbarSpec && (
        <AnnoToolbar
          centerX={(colX(toolbarSpec.spec.cs) + colX(toolbarSpec.spec.ce)) / 2}
          topY={lineY(toolbarSpec.spec.line) + LINE_H + 14}
          scale={toolbarSpec.scale}
          highlightedIdx={toolbarSpec.highlightedIdx}
        />
      )}
      {memoSpec && (
        <MemoPopup
          centerX={(colX(memoSpec.spec.cs) + colX(memoSpec.spec.ce)) / 2}
          topY={lineY(memoSpec.spec.line) + LINE_H + 14}
          scale={memoSpec.scale}
          type={memoSpec.spec.type}
          text={memoSpec.text}
          caret={memoSpec.caret}
          showSavedHint={memoSpec.showSaved}
        />
      )}

      {/* Sheets */}
      <InfoSheet visible={infoVisible} enterT={infoEnterT} exitT={infoExitT} state={infoState} />
      <KnowhowSheet
        visible={khVisible}
        enterT={khEnterT}
        exitT={khExitT}
        text={khShown}
        caret={khCaret}
      />

      {/* Action bar */}
      {!aiActive && !analysisActive && !outroActive && frame < STAGE.bridge.from && (
        <ActionBar
          saving={saving}
          clickAt={36}
          localFrame={frame - STAGE.submit.from}
        />
      )}

      {/* Toast */}
      <Toast visible={showToast} localFrame={subLocal - 48} />

      {/* Bridge */}
      {showBridge && <BridgeBanner localFrame={frame - STAGE.bridge.from} />}

      {/* AI overlay */}
      {aiActive && <AIAutoOverlay marks={aiMarks} localFrame={frame - STAGE.ai.from} />}

      {/* Analysis modal */}
      {analysisActive && <AnalysisModal localFrame={frame - STAGE.analysis.from} />}

      {/* Outro */}
      {outroActive && <OutroOverlay localFrame={frame - STAGE.outro.from} />}

      {/* Cursor */}
      {cursorVisible && <Cursor x={cx} y={cy} pressed={pressed} aiMode={aiActive} />}
    </AbsoluteFill>
  );
};

export default PassageAnalysisDeepDive;
