"use client";

import { spring } from "remotion";
import { C, FONT, LEFT, RESTORE_TUT_FPS, type Rect } from "./restore-tutorial-video-constants";
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
          strokeLinejoin="round"
          strokeWidth={1.6}
        />
      </svg>
    </div>
  );
}

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
  const t = spring({
    frame: frame - since,
    fps: RESTORE_TUT_FPS,
    config: { damping: 200, mass: 0.6 },
  });
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
          color: C.white,
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
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: C.slate900,
            letterSpacing: 0,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: C.slate500,
            marginTop: 1,
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

export function TextLines({
  x,
  y,
  w,
  lines,
  gap = 13,
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
      {lines.map((line, index) =>
        typeof line === "string" ? (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: y + index * gap,
              width: w,
              fontFamily: FONT,
              fontSize: 9,
              lineHeight: 1.25,
              color,
            }}
          >
            {line}
          </div>
        ) : (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: y + index * gap + 4,
              width: w * line,
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
  tone = "plain",
  children,
}: {
  rect: Rect;
  tone?: "plain" | "question";
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        border: `1px solid ${tone === "question" ? C.blue200 : C.slate300}`,
        borderRadius: 5,
        background: tone === "question" ? C.blue50 : C.white,
        boxSizing: "border-box",
        overflow: "hidden",
        fontFamily: FONT,
      }}
    >
      {children}
    </div>
  );
}

export function CropBox({
  rect,
  progress,
  done,
}: {
  rect: Rect;
  progress: number;
  done: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w * progress,
        height: rect.h * progress,
        border: `2px ${done ? "solid" : "dashed"} ${done ? C.emerald : C.blue}`,
        borderRadius: 6,
        background: done ? "rgba(5,150,105,0.08)" : "rgba(37,99,235,0.08)",
        boxShadow: "0 0 0 2000px rgba(15,23,42,0.10)",
        opacity: progress > 0 ? 1 : 0,
        zIndex: 20,
      }}
    >
      {progress > 0.25 ? (
        <span
          style={{
            position: "absolute",
            left: -2,
            top: -2,
            background: done ? C.emerald : C.blue,
            color: C.white,
            fontFamily: FONT,
            fontSize: 9.5,
            fontWeight: 900,
            padding: "2px 7px",
            borderRadius: "4px 0 4px 0",
          }}
        >
          문제·선지 포함
        </span>
      ) : null}
    </div>
  );
}

export function PanelChrome({
  count,
  stage,
}: {
  count: number;
  stage: number;
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
          추출될 지문 {count}개
        </span>
        <span style={{ fontFamily: FONT, fontSize: 10, color: C.slate400 }}>
          AI 원문 복원
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
          {stage >= 4 ? (
            <b style={{ color: C.emerald }}>정답과 순서가 원문으로 복원됐어요</b>
          ) : stage >= 3 ? (
            <b style={{ color: C.blue }}>AI가 문제와 선지를 함께 읽는 중</b>
          ) : (
            <>
              빈칸·순서 문제는 <b style={{ color: C.slate700 }}>문제와 선지까지</b>
            </>
          )}
        </span>
        <span
          style={{
            width: 96,
            height: 30,
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 900,
            color: C.white,
            background: stage >= 4 ? C.emerald : C.blue,
            borderRadius: 8,
            whiteSpace: "nowrap",
          }}
        >
          AI 복원
        </span>
      </div>
    </>
  );
}

export function MiniLine({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 10.5,
        lineHeight: 1.55,
        color: muted ? C.slate400 : C.slate700,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

export function StatusChip({
  label,
  done,
  active,
  pulse = 0,
}: {
  label: string;
  done: boolean;
  active?: boolean;
  pulse?: number;
}) {
  return (
    <div
      style={{
        height: 30,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: done ? C.blue50 : C.white,
        border: `1px solid ${done ? C.blue100 : C.slate200}`,
        color: done ? C.blue700 : C.slate400,
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 900,
        boxShadow: active
          ? `0 0 0 ${3 + 3 * pulse}px rgba(37,99,235,${0.12 + 0.12 * pulse})`
          : "none",
      }}
    >
      <span>{done ? "✓" : "•"}</span>
      <span>{label}</span>
    </div>
  );
}
