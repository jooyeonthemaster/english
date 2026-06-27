"use client";

import { AbsoluteFill } from "remotion";
import type { ReactNode } from "react";
import { C, FONT } from "./generate-tour-video-constants";
export function Cursor({
  x,
  y,
  pressed = false,
  opacity = 1,
}: {
  x: number;
  y: number;
  pressed?: boolean;
  opacity?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        transform: `scale(${pressed ? 0.88 : 1})`,
        transformOrigin: "top left",
        zIndex: 30,
        filter: "drop-shadow(0 5px 10px rgba(15,23,42,0.28))",
      }}
    >
      {pressed ? (
        <div
          style={{
            position: "absolute",
            left: -16,
            top: -16,
            width: 42,
            height: 42,
            borderRadius: 999,
            background: "rgba(37,99,235,0.16)",
            border: `2px solid ${C.blue300}`,
          }}
        />
      ) : null}
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 3l14 7-5.6 1.9L11 18 5 3z"
          fill="#fff"
          stroke={C.slate900}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function MiniLine({
  w,
  color = C.slate200,
  h = 7,
}: {
  w: number;
  color?: string;
  h?: number;
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 999,
        background: color,
      }}
    />
  );
}

export function Segment({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        height: 34,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 800,
        color: active ? C.blue700 : C.slate500,
        background: active ? C.white : "transparent",
        boxShadow: active ? "0 1px 4px rgba(15,23,42,0.12)" : "none",
      }}
    >
      {label}
    </div>
  );
}

export function PassageCard({
  x,
  y,
  selected = false,
  workspace = false,
  title = "지문 1",
}: {
  x: number;
  y: number;
  selected?: boolean;
  workspace?: boolean;
  title?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 174,
        height: 134,
        borderRadius: 12,
        background: C.white,
        border: `2px solid ${selected ? C.blue : C.slate200}`,
        boxShadow: selected
          ? "0 0 0 5px rgba(37,99,235,0.12)"
          : "0 8px 20px rgba(15,23,42,0.06)",
        overflow: "hidden",
      }}
    >
      {workspace ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 5,
            background: C.violet,
          }}
        />
      ) : null}
      <div style={{ padding: "14px 14px 10px 16px" }}>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              background: selected ? C.blue : C.white,
              border: `2px solid ${selected ? C.blue : C.slate300}`,
            }}
          />
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: C.slate800,
            }}
          >
            {title}
          </div>
        </div>
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <MiniLine w={126} />
          <MiniLine w={136} />
          <MiniLine w={104} />
        </div>
        <div style={{ marginTop: 13, display: "flex", gap: 5 }}>
          <MiniLine w={38} h={14} color={C.slate100} />
          <MiniLine w={34} h={14} color={C.slate100} />
          <MiniLine w={46} h={14} color={C.slate100} />
        </div>
      </div>
    </div>
  );
}

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        background: C.slate950,
        fontFamily: FONT,
        padding: 18,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 18,
          overflow: "hidden",
          background: C.slate50,
          boxShadow: "0 26px 90px rgba(0,0,0,0.35)",
          position: "relative",
        }}
      >
        <div
          style={{
            height: 44,
            background: C.white,
            borderBottom: `1px solid ${C.slate200}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 18px",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: C.blue,
            }}
          />
          <div style={{ fontSize: 15, fontWeight: 900, color: C.slate900 }}>
            문제 생성
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.slate400 }}>
            지문 선택 · 편집 · 유형 설정
          </div>
        </div>
        {children}
      </div>
    </AbsoluteFill>
  );
}
