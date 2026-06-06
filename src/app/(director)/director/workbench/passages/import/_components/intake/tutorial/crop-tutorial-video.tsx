"use client";

// ============================================================================
// CropTutorialVideo — 자료 추출 사용법을 보여주는 Remotion 컴포지션(브라우저에서
// @remotion/player로 재생). 실제 UI(좌: 시험지 캔버스 / 우: "추출될 지문" 패널)를
// 그대로 흉내 내며, 핵심 흐름을 단계별로 가르친다:
//   ① 시험지 이미지·PDF 올리기
//   ② 지문 부분을 드래그해 한 지문으로 자르기
//   ③ 한 지문이 칸/다음 페이지로 나뉘면 각각 따로 자르기
//   ④ 두 조각을 골라 "한 지문으로 합치기" → 하나의 완성된 지문
//   ⑤ 추출 시작(백그라운드 처리)
// 톤: blue-600 + slate. 주황/Sparkles 금지. 인라인 스타일(컴포지션 자체완결).
// ============================================================================

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

import { TutorialTaskQueue } from "./tutorial-task-queue";

export const TUT_W = 1280;
export const TUT_H = 720;
export const TUT_FPS = 30;
export const TUT_TOTAL = 860;

const C = {
  blue: "#2563EB",
  blueHover: "#1d4ed8",
  blue50: "#EFF6FF",
  blue100: "#DBEAFE",
  blue200: "#BFDBFE",
  blue300: "#93C5FD",
  blue700: "#1D4ED8",
  slate950: "#020617",
  slate900: "#0F172A",
  slate800: "#1E293B",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748B",
  slate400: "#94A3B8",
  slate300: "#CBD5E1",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  white: "#FFFFFF",
  emerald: "#059669",
  emerald50: "#ECFDF5",
  emerald100: "#D1FAE5",
  red: "#DC2626",
};
const FONT = '"Pretendard", -apple-system, system-ui, sans-serif';

// ── 장면 프레임 구간 ────────────────────────────────────────────────────────
const S = {
  add: [0, 96],
  crop1: [96, 248],
  split: [248, 470],
  merge: [470, 690],
  start: [690, 860],
};

// 서브 타이밍(절대 프레임)
const T = {
  // crop1
  c1Approach: [108, 126],
  c1Draw: [126, 162],
  c1Card: [162, 196],
  // split A
  aApproach: [260, 278],
  aDraw: [278, 312],
  aCard: [312, 344],
  // split B
  bApproach: [350, 368],
  bDraw: [368, 402],
  bCard: [402, 434],
  // merge
  check2: [486, 512],
  check3: [512, 538],
  btnGlow: [538, 566],
  btnClick: [566, 588],
  mergeAnim: [588, 648],
  // start
  startApproach: [702, 740],
  startClick: [740, 760],
  toast: [760, 860],
};

// ── 레이아웃 좌표 (1280×720) ───────────────────────────────────────────────
const LEFT = { x: 28, y: 96, w: 720, h: 560 }; // 시험지 캔버스
const RIGHT = { x: 764, y: 96, w: 488, h: 560 }; // 추출될 지문 패널
const PAPER = { x: 52, y: 116, w: 668, h: 520 }; // 시험지 종이
// 지문 박스 타깃(캔버스 절대 좌표)
const BOX1 = { x: 70, y: 196, w: 300, h: 150 }; // 지문 1 (단순)
const BOXA = { x: 70, y: 384, w: 300, h: 116 }; // 지문 2 (나뉜 앞)
const BOXB = { x: 392, y: 168, w: 300, h: 132 }; // 지문 3 (나뉜 뒤)

// ── 우측 패널 내부 레이아웃 (렌더와 커서 좌표가 같은 상수를 공유한다) ─────────
// 커서가 "체크박스/합치기 버튼/추출 버튼" 정확히 그 위에 떨어지도록, 패널 헤더·머지
// 바·카드에 고정 높이를 주고 그 수치로 클릭 타깃 좌표를 역산한다. 손으로 짐작한
// 오프셋(과거 +210/+380/+120)이 실제 렌더 위치와 어긋나 커서가 빈 공간을 누르던
// 문제를 제거하기 위함. CARD_CB_OFFSET_Y/CB_X 는 보더·패딩까지 반영한 실측치.
const PANEL_CHROME_H = 80; // 헤더(38) + 머지바(42)
const PANEL_PAD = 12; // 카드 그리드 패딩
const CARD_GAP = 10;
const CARD_H = 110; // 단일 조각 카드 고정 높이
const CARD_CB_OFFSET_Y = 18; // 카드 top → 체크박스 세로 중앙(카드보더1 + 헤더34/2)
const CB_X = RIGHT.x + PANEL_PAD + 11 + 9; // 그리드패딩 + (카드보더1+헤더좌패딩10) + 체크박스반9 = 796
const PANEL_CONTENT_TOP = RIGHT.y + PANEL_CHROME_H + PANEL_PAD; // 첫 카드 top
function cardTopY(i: number) {
  return PANEL_CONTENT_TOP + i * (CARD_H + CARD_GAP);
}
function cbCenter(i: number) {
  return { x: CB_X, y: cardTopY(i) + CARD_CB_OFFSET_Y };
}
// 머지바 "한 지문으로 합치기" 버튼 중앙: 우측 정렬(우패딩14) + 버튼폭110/2
const MERGE_BTN = { x: RIGHT.x + RIGHT.w - 14 - 55, y: RIGHT.y + 38 + 21 };
// 푸터 "추출 시작" 버튼 중앙
const START_BTN = { x: RIGHT.x + RIGHT.w / 2, y: 664 + 22 };
// svg 포인터 꼭짓점이 (cx,cy)에 정확히 닿도록 커서 div를 좌상으로 보정
const CURSOR_TIP = { dx: 4, dy: 3 };

type Rect = { x: number; y: number; w: number; h: number };

function clampInterp(
  frame: number,
  range: [number, number],
  out: [number, number],
  easing?: (n: number) => number,
) {
  return interpolate(frame, range, out, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

// ── 마우스 커서 ────────────────────────────────────────────────────────────
function Cursor({
  x,
  y,
  pressed,
  opacity = 1,
}: {
  x: number;
  y: number;
  pressed: boolean;
  opacity?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        transform: `scale(${pressed ? 0.86 : 1})`,
        transformOrigin: "top left",
        zIndex: 50,
        filter: "drop-shadow(0 3px 6px rgba(15,23,42,0.35))",
        transition: "none",
      }}
    >
      {pressed ? (
        <div
          style={{
            position: "absolute",
            left: -14,
            top: -14,
            width: 40,
            height: 40,
            borderRadius: 999,
            background: "rgba(37,99,235,0.18)",
            border: `2px solid ${C.blue300}`,
          }}
        />
      ) : null}
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 3l14 7-5.5 1.8L11 18 5 3z"
          fill="#fff"
          stroke={C.slate900}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── 시험지(영어 모의고사 양식) ─────────────────────────────────────────────
function TextLines({
  x,
  y,
  w,
  lines,
  gap = 12,
  color = C.slate700,
}: {
  x: number;
  y: number;
  w: number;
  lines: (number | string)[];
  gap?: number;
  color?: string;
}) {
  return (
    <>
      {lines.map((ln, i) =>
        typeof ln === "string" ? (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y + i * gap,
              width: w,
              fontFamily: FONT,
              fontSize: 8.5,
              lineHeight: 1.25,
              color,
            }}
          >
            {ln}
          </div>
        ) : (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y + i * gap + 3,
              width: w * ln,
              height: 3.5,
              borderRadius: 2,
              background: C.slate200,
            }}
          />
        ),
      )}
    </>
  );
}

function PassageBlock({
  rect,
  title,
  lines,
  hint,
  hintSide,
}: {
  rect: Rect;
  title?: string;
  lines: (number | string)[];
  hint?: string;
  hintSide?: "tr" | "bl";
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        border: `1px solid ${C.slate300}`,
        borderRadius: 3,
        background: C.white,
        padding: 8,
        boxSizing: "border-box",
      }}
    >
      {title ? (
        <div
          style={{
            fontFamily: FONT,
            fontSize: 8,
            fontWeight: 700,
            color: C.slate500,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
      ) : null}
      <TextLines x={8} y={title ? 22 : 8} w={rect.w - 16} lines={lines} />
      {hint ? (
        <div
          style={{
            position: "absolute",
            ...(hintSide === "tr"
              ? { right: 6, top: 6 }
              : { left: 6, bottom: 6 }),
            fontFamily: FONT,
            fontSize: 7.5,
            fontWeight: 800,
            color: C.blue,
            background: C.blue50,
            border: `1px solid ${C.blue200}`,
            borderRadius: 4,
            padding: "1px 5px",
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ExamPaper() {
  return (
    <div
      style={{
        position: "absolute",
        left: PAPER.x,
        top: PAPER.y,
        width: PAPER.w,
        height: PAPER.h,
        background: C.white,
        borderRadius: 6,
        border: `1px solid ${C.slate200}`,
        boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
        overflow: "hidden",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 10,
          textAlign: "center",
          fontFamily: FONT,
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "2px 18px",
            border: `1.4px solid ${C.slate700}`,
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: 8,
            color: C.slate900,
          }}
        >
          영 어
        </span>
        <div
          style={{
            marginTop: 5,
            fontSize: 11,
            fontWeight: 800,
            color: C.slate800,
          }}
        >
          2026학년도 제3학년 제1학기 중간고사 문제지 NO.5
        </div>
      </div>
      {/* 가운데 세로 구분선 */}
      <div
        style={{
          position: "absolute",
          left: PAPER.w / 2,
          top: 56,
          bottom: 10,
          width: 1,
          background: C.slate200,
        }}
      />

      {/* 좌측 칼럼: 문항 + 지문1 / 지문2(앞부분) */}
      <div
        style={{
          position: "absolute",
          left: 18,
          top: 64,
          fontFamily: FONT,
          fontSize: 8.5,
          fontWeight: 700,
          color: C.slate600,
        }}
      >
        12. Which one best summarizes the passage?
      </div>
      {/* 지문1 (BOX1 위치에 맞춤) */}
      <PassageBlock
        rect={{ x: BOX1.x - PAPER.x, y: BOX1.y - PAPER.y, w: BOX1.w, h: BOX1.h }}
        lines={[
          "We are taught from an early age that",
          '"sharing is caring." We tell our children',
          "to share their toys. The sharing economy",
          "sounds like a good thing. Thanks to apps,",
          "users can share their cars, rooms, tools,",
          "and even their own time and talents.",
          0.7,
          0.9,
          0.5,
        ]}
      />
      <div
        style={{
          position: "absolute",
          left: 18,
          top: BOXA.y - PAPER.y - 22,
          fontFamily: FONT,
          fontSize: 8.5,
          fontWeight: 700,
          color: C.slate600,
        }}
      >
        13. Read the passage below and answer.
      </div>
      {/* 지문2 앞부분 (BOXA) — 이어짐 */}
      <PassageBlock
        rect={{ x: BOXA.x - PAPER.x, y: BOXA.y - PAPER.y, w: BOXA.w, h: BOXA.h }}
        lines={[
          "Former U.S. Secretary of Labor Robert",
          "Reich calls this the “share-the-scraps”",
          "economy. He argues that only software",
          "companies earn real money; gig workers",
          "have to make do with the scraps.",
        ]}
        hint="이어짐 →"
        hintSide="bl"
      />

      {/* 우측 칼럼: 지문2 뒷부분(이어서) + 문항 */}
      <PassageBlock
        rect={{ x: BOXB.x - PAPER.x, y: BOXB.y - PAPER.y, w: BOXB.w, h: BOXB.h }}
        lines={[
          "The gig economy promised extra income,",
          "an opportunity to “monetize their own",
          "downtime,” Sundararajan claimed. Reich",
          "points out that this downtime might be",
          "your family time. In return, gig workers",
          "earn low wages without any guarantee.",
        ]}
        hint="← 이어서"
        hintSide="tr"
      />
      <div
        style={{
          position: "absolute",
          left: PAPER.w / 2 + 14,
          top: BOXB.y - PAPER.y + BOXB.h + 14,
          fontFamily: FONT,
          fontSize: 8.5,
          fontWeight: 700,
          color: C.slate600,
        }}
      >
        14. Where is the best place to insert?
      </div>
      <TextLines
        x={PAPER.w / 2 + 14}
        y={BOXB.y - PAPER.y + BOXB.h + 30}
        w={PAPER.w / 2 - 34}
        lines={[0.95, 0.85, 0.9, 0.6, 0.8, 0.5]}
      />
    </div>
  );
}

// ── 캔버스 위 크롭 박스 ────────────────────────────────────────────────────
function CropBox({
  rect,
  progress,
  label,
  tone = "active",
  opacity = 1,
}: {
  rect: Rect;
  progress: number; // 0..1 그려지는 정도
  label: string;
  tone?: "active" | "done";
  opacity?: number;
}) {
  const w = rect.w * progress;
  const h = rect.h * progress;
  const border =
    tone === "done" ? `2px solid ${C.blue}` : `2px dashed ${C.blue}`;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: w,
        height: h,
        border,
        borderRadius: 4,
        background: "rgba(37,99,235,0.07)",
        boxShadow: "0 0 0 2000px rgba(15,23,42,0.10)",
        opacity,
        zIndex: 20,
      }}
    >
      {progress > 0.25 ? (
        <span
          style={{
            position: "absolute",
            left: -2,
            top: -2,
            background: C.blue,
            color: "#fff",
            fontFamily: FONT,
            fontSize: 9.5,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: "4px 0 4px 0",
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

// ── 미니 지문 미리보기(잘린 모습) ──────────────────────────────────────────
function MiniPassage({ lines }: { lines: (number | string)[] }) {
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 4,
        border: `1px solid ${C.slate200}`,
        background: C.white,
        padding: 8,
        boxSizing: "border-box",
        position: "relative",
        minHeight: 56,
      }}
    >
      {lines.map((ln, i) =>
        typeof ln === "string" ? (
          <div
            key={i}
            style={{
              fontFamily: FONT,
              fontSize: 8,
              lineHeight: 1.4,
              color: C.slate700,
            }}
          >
            {ln}
          </div>
        ) : (
          <div
            key={i}
            style={{
              height: 3.5,
              margin: "4px 0",
              width: `${(ln as number) * 100}%`,
              borderRadius: 2,
              background: C.slate200,
            }}
          />
        ),
      )}
    </div>
  );
}

// ── 추출될 지문 카드 ───────────────────────────────────────────────────────
function PassageCard({
  rank,
  subtitle,
  pieces,
  checked,
  pop,
  h,
}: {
  rank: number;
  subtitle: string;
  pieces: (number | string)[][];
  checked: boolean;
  pop: number; // 0..1 등장
  /** 고정 높이(단일 조각 카드=CARD_H). 미전달 시 내용에 맞춰 늘어남(합쳐진 카드). */
  h?: number;
}) {
  return (
    <div
      style={{
        opacity: pop,
        transform: `translateY(${(1 - pop) * 14}px)`,
        height: h,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        borderRadius: 10,
        border: `1px solid ${checked ? C.blue : C.slate200}`,
        outline: checked ? `2px solid ${C.blue300}` : "none",
        background: C.white,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 34,
          flexShrink: 0,
          boxSizing: "border-box",
          padding: "0 10px",
          borderBottom: `1px solid ${C.slate100}`,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            border: `1px solid ${checked ? C.blue : C.slate300}`,
            background: checked ? C.blue : C.white,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? "✓" : ""}
        </span>
        <span
          style={{
            background: C.blue,
            color: "#fff",
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 800,
            padding: "2px 9px",
            borderRadius: 5,
          }}
        >
          지문 {rank}
        </span>
        <span
          style={{
            flex: 1,
            fontFamily: FONT,
            fontSize: 10,
            color: C.slate500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subtitle}
        </span>
        {pieces.length > 1 ? (
          <span
            style={{
              fontFamily: FONT,
              fontSize: 9,
              fontWeight: 700,
              color: C.slate600,
              border: `1px solid ${C.slate200}`,
              borderRadius: 5,
              padding: "1px 6px",
            }}
          >
            ✂ 분리
          </span>
        ) : null}
      </div>
      <div
        style={{
          flex: h ? 1 : undefined,
          background: C.slate100,
          padding: 8,
          display: "grid",
          gap: 6,
          alignContent: h ? "center" : "start",
          overflow: "hidden",
        }}
      >
        {pieces.map((p, i) => (
          <MiniPassage key={i} lines={p} />
        ))}
      </div>
    </div>
  );
}

// ── 캡션(상단 단계 안내) ───────────────────────────────────────────────────
function Caption({
  step,
  title,
  sub,
  frame,
  since,
}: {
  step: number;
  title: string;
  sub: string;
  frame: number;
  since: number;
}) {
  const t = spring({ frame: frame - since, fps: TUT_FPS, config: { damping: 200, mass: 0.6 } });
  return (
    <div
      style={{
        position: "absolute",
        left: LEFT.x,
        top: 24,
        right: 28,
        height: 56,
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: t,
        transform: `translateY(${(1 - t) * -8}px)`,
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: C.blue,
          color: "#fff",
          fontSize: 15,
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {step}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.slate900, letterSpacing: -0.4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.slate500, marginTop: 1 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

// ── 패널 헤더/합치기 바 ────────────────────────────────────────────────────
function PanelChrome({
  count,
  selected,
  glow,
}: {
  count: number;
  selected: number;
  glow: number;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 38,
          boxSizing: "border-box",
          padding: "0 14px",
          borderBottom: `1px solid ${C.slate100}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 800,
            color: C.slate900,
          }}
        >
          📑 추출될 지문 {count}개
        </span>
        <span style={{ fontFamily: FONT, fontSize: 10, color: C.slate400 }}>
          영역 {count}개
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          height: 42,
          boxSizing: "border-box",
          padding: "0 14px",
          borderBottom: `1px solid ${C.slate100}`,
          background: C.slate50,
        }}
      >
        <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.slate500 }}>
          {selected >= 2 ? (
            <b style={{ color: C.blue }}>선택한 {selected}개를 이어붙여 한 지문으로</b>
          ) : (
            <>
              여러 장·조각에 걸치면 <b style={{ color: C.slate700 }}>카드 ☑를 2개 이상</b>
            </>
          )}
        </span>
        <span
          style={{
            width: 110,
            height: 30,
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 800,
            color: "#fff",
            background: selected >= 2 ? C.blue : C.blue300,
            borderRadius: 8,
            whiteSpace: "nowrap",
            boxShadow:
              glow > 0
                ? `0 0 0 ${4 * glow}px rgba(37,99,235,${0.35 * glow})`
                : "none",
          }}
        >
          한 지문으로 합치기
        </span>
      </div>
    </>
  );
}

// ── 메인 컴포지션 ──────────────────────────────────────────────────────────
export const CropTutorialVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 현재 장면 + 캡션
  let cap = { step: 1, title: "시험지 이미지·PDF를 올려요", sub: "여러 장을 한 번에 올릴 수 있어요", since: S.add[0] };
  if (frame >= S.crop1[0] && frame < S.crop1[1])
    cap = { step: 2, title: "지문 부분을 드래그하면 한 지문!", sub: "잘라낸 영역만 글자로 읽어 정리돼요", since: S.crop1[0] };
  else if (frame >= S.split[0] && frame < S.split[1])
    cap = { step: 3, title: "칸·페이지로 나뉜 지문은 각각 잘라요", sub: "왼→오 칸, 또는 다음 페이지로 이어진 한 지문", since: S.split[0] };
  else if (frame >= S.merge[0] && frame < S.merge[1])
    cap = { step: 4, title: "두 조각을 골라 '한 지문으로 합치기'", sub: "나뉜 조각이 하나의 완성된 지문이 돼요", since: S.merge[0] };
  else if (frame >= S.start[0])
    cap = { step: 5, title: "추출 시작 — 백그라운드로 처리!", sub: "기다릴 필요 없이 바로 다음 작업 가능", since: S.start[0] };

  // ── 진행도 계산 ──
  const box1P = clampInterp(frame, [T.c1Draw[0], T.c1Draw[1]], [0, 1], EASE);
  const card1Pop = clampInterp(frame, [T.c1Card[0], T.c1Card[1]], [0, 1], EASE);
  const boxAP = clampInterp(frame, [T.aDraw[0], T.aDraw[1]], [0, 1], EASE);
  const cardAPop = clampInterp(frame, [T.aCard[0], T.aCard[1]], [0, 1], EASE);
  const boxBP = clampInterp(frame, [T.bDraw[0], T.bDraw[1]], [0, 1], EASE);
  const cardBPop = clampInterp(frame, [T.bCard[0], T.bCard[1]], [0, 1], EASE);
  const check2 = frame >= T.check2[1];
  const check3 = frame >= T.check3[1];
  const glow = clampInterp(frame, [T.btnGlow[0], T.btnGlow[1]], [0, 1]) *
    (1 - clampInterp(frame, [T.btnClick[0], T.btnClick[1]], [0, 1]));
  const mergeP = clampInterp(frame, [T.mergeAnim[0], T.mergeAnim[1]], [0, 1], EASE);
  const merged = frame >= T.mergeAnim[0] + 6;

  // 패널에 보이는 지문 수
  const visible1 = frame >= T.c1Card[0];
  const visibleA = frame >= T.aCard[0] && !merged;
  const visibleB = frame >= T.bCard[0] && !merged;
  const panelCount =
    (visible1 ? 1 : 0) + (visibleA ? 1 : 0) + (visibleB ? 1 : 0) + (merged ? 1 : 0);
  const selected = (check2 && !merged ? 1 : 0) + (check3 && !merged ? 1 : 0);

  // ── 커서 위치 choreography ──
  let cx = 360;
  let cy = 300;
  let pressed = false;
  // crop1: 박스1 그리기
  if (frame >= T.c1Approach[0] && frame < T.c1Card[0]) {
    const dp = clampInterp(frame, [T.c1Draw[0], T.c1Draw[1]], [0, 1], EASE);
    const ap = clampInterp(frame, [T.c1Approach[0], T.c1Approach[1]], [0, 1], EASE);
    const sx = interpolate(ap, [0, 1], [200, BOX1.x], { extrapolateRight: "clamp" });
    const sy = interpolate(ap, [0, 1], [180, BOX1.y], { extrapolateRight: "clamp" });
    cx = frame < T.c1Draw[0] ? sx : BOX1.x + BOX1.w * dp;
    cy = frame < T.c1Draw[0] ? sy : BOX1.y + BOX1.h * dp;
    pressed = frame >= T.c1Draw[0] && frame < T.c1Draw[1];
  } else if (frame >= T.aApproach[0] && frame < T.aCard[0]) {
    const dp = boxAP;
    const ap = clampInterp(frame, [T.aApproach[0], T.aApproach[1]], [0, 1], EASE);
    const sx = interpolate(ap, [0, 1], [BOX1.x + 80, BOXA.x], { extrapolateRight: "clamp" });
    const sy = interpolate(ap, [0, 1], [BOX1.y + 60, BOXA.y], { extrapolateRight: "clamp" });
    cx = frame < T.aDraw[0] ? sx : BOXA.x + BOXA.w * dp;
    cy = frame < T.aDraw[0] ? sy : BOXA.y + BOXA.h * dp;
    pressed = frame >= T.aDraw[0] && frame < T.aDraw[1];
  } else if (frame >= T.bApproach[0] && frame < T.bCard[0]) {
    const dp = boxBP;
    const ap = clampInterp(frame, [T.bApproach[0], T.bApproach[1]], [0, 1], EASE);
    const sx = interpolate(ap, [0, 1], [BOXA.x + 100, BOXB.x], { extrapolateRight: "clamp" });
    const sy = interpolate(ap, [0, 1], [BOXA.y - 80, BOXB.y], { extrapolateRight: "clamp" });
    cx = frame < T.bDraw[0] ? sx : BOXB.x + BOXB.w * dp;
    cy = frame < T.bDraw[0] ? sy : BOXB.y + BOXB.h * dp;
    pressed = frame >= T.bDraw[0] && frame < T.bDraw[1];
  } else if (frame >= S.merge[0] && frame < S.start[0]) {
    // 지문2 체크박스 → 지문3 체크박스 → "한 지문으로 합치기" 버튼.
    // 타깃은 실제 렌더 좌표(cbCenter/MERGE_BTN). 커서 꼬리표가 정확히 그 위에 떨어진다.
    const cb2 = cbCenter(1); // 두 번째 카드(지문 2)
    const cb3 = cbCenter(2); // 세 번째 카드(지문 3)
    if (frame < T.check2[1]) {
      const p = clampInterp(frame, [S.merge[0], T.check2[1]], [0, 1], EASE);
      cx = interpolate(p, [0, 1], [BOXB.x + 120, cb2.x]);
      cy = interpolate(p, [0, 1], [BOXB.y, cb2.y]);
      pressed = frame >= T.check2[1] - 7;
    } else if (frame < T.check3[1]) {
      const p = clampInterp(frame, [T.check2[1], T.check3[1]], [0, 1], EASE);
      cx = interpolate(p, [0, 1], [cb2.x, cb3.x]);
      cy = interpolate(p, [0, 1], [cb2.y, cb3.y]);
      pressed = frame >= T.check3[1] - 7;
    } else {
      const p = clampInterp(frame, [T.check3[1], T.btnClick[0]], [0, 1], EASE);
      cx = interpolate(p, [0, 1], [cb3.x, MERGE_BTN.x]);
      cy = interpolate(p, [0, 1], [cb3.y, MERGE_BTN.y]);
      pressed = frame >= T.btnClick[0] && frame < T.btnClick[1];
    }
  } else if (frame >= S.start[0]) {
    const p = clampInterp(frame, [T.startApproach[0], T.startApproach[1]], [0, 1], EASE);
    cx = interpolate(p, [0, 1], [MERGE_BTN.x, START_BTN.x]);
    cy = interpolate(p, [0, 1], [MERGE_BTN.y, START_BTN.y]);
    pressed = frame >= T.startClick[0] && frame < T.startClick[1];
  }

  // 드롭존(장면1) → 보드 전환
  const boardReveal = clampInterp(frame, [S.add[1] - 22, S.add[1]], [0, 1], EASE);

  return (
    <AbsoluteFill style={{ background: C.white, fontFamily: FONT }}>
      <Caption step={cap.step} title={cap.title} sub={cap.sub} frame={frame} since={cap.since} />

      {/* 장면 1: 드롭존 + 떨어지는 파일 (보드로 크로스페이드) */}
      {frame < S.add[1] ? (
        <AbsoluteFill style={{ opacity: 1 - boardReveal }}>
          <AddScene frame={frame} fps={fps} />
        </AbsoluteFill>
      ) : null}

      {/* 보드 (장면 2~) */}
      <div style={{ opacity: boardReveal }}>
        {/* 좌: 시험지 캔버스 */}
        <div
          style={{
            position: "absolute",
            left: LEFT.x,
            top: LEFT.y,
            width: LEFT.w,
            height: LEFT.h,
            background: C.slate100,
            borderRadius: 12,
            border: `1px solid ${C.slate200}`,
            overflow: "hidden",
          }}
        >
          <ExamPaper />
          {/* 크롭 박스들 */}
          {frame >= T.c1Draw[0] ? (
            <CropBox rect={BOX1} progress={box1P} label="지문 1" tone={frame >= T.c1Draw[1] ? "done" : "active"} />
          ) : null}
          {frame >= T.aDraw[0] ? (
            <CropBox rect={BOXA} progress={boxAP} label={merged ? "지문 2" : "지문 2"} tone={frame >= T.aDraw[1] ? "done" : "active"} />
          ) : null}
          {frame >= T.bDraw[0] ? (
            <CropBox rect={BOXB} progress={boxBP} label={merged ? "지문 2" : "지문 3"} tone={frame >= T.bDraw[1] ? "done" : "active"} />
          ) : null}
          {/* 나뉜 지문 연결 안내 (split 장면) */}
          {frame >= T.bCard[0] && frame < S.merge[1] ? (
            <SplitConnector opacity={clampInterp(frame, [T.bCard[0], T.bCard[1]], [0, 1])} pulse={frame} />
          ) : null}
        </div>

        {/* 우: 추출될 지문 패널 */}
        <div
          style={{
            position: "absolute",
            left: RIGHT.x,
            top: RIGHT.y,
            width: RIGHT.w,
            height: RIGHT.h,
            background: C.white,
            borderRadius: 12,
            border: `1px solid ${C.slate200}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <PanelChrome count={panelCount} selected={selected} glow={glow} />
          <div style={{ flex: 1, padding: 12, display: "grid", gap: 10, alignContent: "start", background: "rgba(248,250,252,0.5)" }}>
            {!visible1 && !visibleA && !visibleB && !merged ? (
              <div style={{ textAlign: "center", color: C.slate400, fontSize: 11, padding: "40px 10px", lineHeight: 1.6 }}>
                왼쪽 이미지에서 영역을 그리면
                <br />
                추출될 지문이 여기에 표시됩니다.
              </div>
            ) : null}
            {visible1 ? (
              <PassageCard
                rank={1}
                subtitle="1장에서 자른 지문"
                pieces={[["We are taught from an early age that", '"sharing is caring." The sharing economy', "sounds like a good thing.", 0.7, 0.5]]}
                checked={false}
                pop={card1Pop}
                h={CARD_H}
              />
            ) : null}
            {visibleA ? (
              <PassageCard
                rank={2}
                subtitle="1장에서 자른 지문"
                pieces={[["Former U.S. Secretary of Labor Robert", "Reich calls this the share-the-scraps", "economy.", 0.6]]}
                checked={check2}
                pop={cardAPop}
                h={CARD_H}
              />
            ) : null}
            {visibleB ? (
              <PassageCard
                rank={3}
                subtitle="1장에서 자른 지문"
                pieces={[["The gig economy promised extra income,", "an opportunity to monetize downtime,", "Reich points out.", 0.5]]}
                checked={check3}
                pop={cardBPop}
                h={CARD_H}
              />
            ) : null}
            {merged ? (
              <PassageCard
                rank={2}
                subtitle="2개 영역을 이어붙인 지문"
                pieces={[
                  ["Former U.S. Secretary of Labor Robert", "Reich calls this the share-the-scraps", "economy.", 0.6],
                  ["The gig economy promised extra income,", "an opportunity to monetize downtime,", "Reich points out.", 0.5],
                ]}
                checked={false}
                pop={mergeP}
              />
            ) : null}
          </div>
        </div>

        {/* 푸터: 추출 시작 버튼 */}
        <div
          style={{
            position: "absolute",
            left: RIGHT.x,
            top: 664,
            width: RIGHT.w,
            height: 44,
          }}
        >
          <div
            style={{
              width: "100%",
              height: 44,
              borderRadius: 10,
              background: panelCount > 0 ? C.blue : C.blue300,
              color: "#fff",
              fontFamily: FONT,
              fontSize: 14,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow:
                frame >= T.startApproach[1] && frame < T.toast[0]
                  ? `0 0 0 5px rgba(37,99,235,0.30)`
                  : "0 6px 16px rgba(37,99,235,0.25)",
              transform: `scale(${frame >= T.startClick[0] && frame < T.startClick[1] ? 0.97 : 1})`,
            }}
          >
            ▶ 추출 시작 {panelCount > 0 ? `(지문 ${panelCount}개)` : ""}
          </div>
        </div>
        {/* 좌측 푸터: 더 추가 */}
        <div
          style={{
            position: "absolute",
            left: LEFT.x + 8,
            top: 664,
            width: LEFT.w - 16,
            height: 44,
            borderRadius: 10,
            border: `2px solid ${C.blue}`,
            background: C.white,
            color: C.blue,
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          ＋ 이미지·PDF 더 추가
        </div>
      </div>

      <TutorialTaskQueue
        frame={frame}
        startFrame={T.toast[0]}
        fps={TUT_FPS}
        taskTitle="지문 2개 추출"
        taskMeta="백그라운드 OCR 처리 대기"
      />

      {/* 커서 — svg 꼭짓점이 타깃(cx,cy)에 정확히 닿도록 좌상으로 보정 */}
      {frame >= T.c1Approach[0] ? (
        <Cursor x={cx - CURSOR_TIP.dx} y={cy - CURSOR_TIP.dy} pressed={pressed} />
      ) : null}
    </AbsoluteFill>
  );
};

// 나뉜 지문 연결 화살표 + "사실 한 지문!" 라벨.
// 박스(CropBox)는 LEFT 컨테이너 기준 (BOXA.x, BOXA.y) 좌표에 놓이므로, svg도 컨테이너를
// 그대로 덮고(inset:0) 같은 좌표계를 쓴다.
function SplitConnector({ opacity, pulse }: { opacity: number; pulse: number }) {
  const breathe = 0.5 + 0.5 * Math.sin(pulse / 6);
  const ax = BOXA.x + BOXA.w; // 지문2(앞) 오른쪽 중앙
  const ay = BOXA.y + BOXA.h / 2;
  const bx = BOXB.x; // 지문3(뒤) 왼쪽 중앙
  const by = BOXB.y + BOXB.h / 2;
  const midX = (BOXA.x + BOXA.w / 2 + BOXB.x + BOXB.w / 2) / 2;
  const midY = (BOXA.y + BOXB.y + BOXB.h) / 2;
  return (
    <div style={{ position: "absolute", inset: 0, opacity, zIndex: 30, pointerEvents: "none" }}>
      <svg width={LEFT.w} height={LEFT.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <marker id="arrh" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={C.blue} />
          </marker>
        </defs>
        <path
          d={`M ${ax} ${ay} C ${ax + 70} ${ay - 30}, ${bx - 70} ${by + 30}, ${bx} ${by}`}
          fill="none"
          stroke={C.blue}
          strokeWidth={2.5}
          strokeDasharray="6 5"
          markerEnd="url(#arrh)"
          opacity={0.65 + 0.35 * breathe}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: midX - 46,
          top: midY - 14,
          fontFamily: FONT,
          fontSize: 11.5,
          fontWeight: 900,
          color: "#fff",
          background: C.blue,
          padding: "4px 12px",
          borderRadius: 999,
          boxShadow: "0 6px 14px rgba(37,99,235,0.4)",
          whiteSpace: "nowrap",
        }}
      >
        사실 한 지문!
      </div>
    </div>
  );
}

// 장면 1: 드롭존 + 떨어지는 시험지 파일
function AddScene({ frame, fps }: { frame: number; fps: number }) {
  const files = [
    { x: 470, label: "NO.5", delay: 8 },
    { x: 600, label: "NO.6", delay: 20 },
  ];
  const dzPulse = 0.5 + 0.5 * Math.sin(frame / 8);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: LEFT.x,
          top: LEFT.y,
          right: 28,
          height: 560,
          borderRadius: 14,
          border: `2.5px dashed ${C.blue200}`,
          background: `rgba(239,246,255,${0.3 + 0.25 * dzPulse})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            background: C.blue50,
            border: `1px solid ${C.blue100}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.blue,
            fontSize: 30,
          }}
        >
          ⬆
        </div>
        <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 900, color: C.slate900 }}>
          파일을 끌어놓거나 클릭해서 추가
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.slate500 }}>
          여러 이미지·PDF를 한 번에 올릴 수 있어요
        </div>
      </div>

      {files.map((f, i) => {
        const fr = frame - f.delay;
        const drop = spring({ frame: fr, fps, config: { damping: 16, mass: 0.7 } });
        const y = interpolate(drop, [0, 1], [-120, 250 + i * 8], { extrapolateLeft: "clamp" });
        const op = interpolate(fr, [0, 8, 70, 84], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: f.x,
              top: 96 + y,
              width: 150,
              height: 200,
              borderRadius: 8,
              background: C.white,
              border: `1px solid ${C.slate200}`,
              boxShadow: "0 14px 34px rgba(15,23,42,0.18)",
              opacity: op,
              transform: `rotate(${i === 0 ? -4 : 5}deg)`,
              padding: 10,
              boxSizing: "border-box",
              fontFamily: FONT,
            }}
          >
            <div style={{ textAlign: "center", fontSize: 9, fontWeight: 900, letterSpacing: 4, color: C.slate800, border: `1px solid ${C.slate400}`, borderRadius: 999, padding: "1px 0", marginBottom: 4 }}>
              영 어
            </div>
            <div style={{ textAlign: "center", fontSize: 7.5, fontWeight: 800, color: C.slate600, marginBottom: 6 }}>
              중간고사 {f.label}
            </div>
            {[0.95, 0.8, 0.9, 0.6, 0.85, 0.7, 0.95, 0.5, 0.88, 0.75, 0.6, 0.9].map((w, j) => (
              <div key={j} style={{ height: 3, margin: "5px 0", width: `${w * 100}%`, background: C.slate200, borderRadius: 2 }} />
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

export default CropTutorialVideo;
