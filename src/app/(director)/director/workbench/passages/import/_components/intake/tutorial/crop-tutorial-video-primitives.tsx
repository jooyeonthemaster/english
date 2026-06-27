"use client";

import { spring } from "remotion";
import { BOXA, BOXB, C, FONT, LEFT, type Rect, TUT_FPS } from "./crop-tutorial-video-constants";
// ── 마우스 커서 ────────────────────────────────────────────────────────────
export function Cursor({
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
export function TextLines({
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

export function PassageBlock({
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

// ── 캔버스 위 크롭 박스 ────────────────────────────────────────────────────
export function CropBox({
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
export function MiniPassage({ lines }: { lines: (number | string)[] }) {
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

// ── 캡션(상단 단계 안내) ───────────────────────────────────────────────────
export function Caption({
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
export function PanelChrome({
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

// 나뉜 지문 연결 화살표 + "사실 한 지문!" 라벨.
// 박스(CropBox)는 LEFT 컨테이너 기준 (BOXA.x, BOXA.y) 좌표에 놓이므로, svg도 컨테이너를
// 그대로 덮고(inset:0) 같은 좌표계를 쓴다.
export function SplitConnector({ opacity, pulse }: { opacity: number; pulse: number }) {
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
