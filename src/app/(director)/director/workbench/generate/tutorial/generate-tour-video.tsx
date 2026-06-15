"use client";

import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import type { ReactNode } from "react";

export type GenerateTourVariant =
  | "overview"
  | "library"
  | "file"
  | "paste"
  | "workspace"
  | "precise"
  | "results";

export const GENERATE_TOUR_W = 960;
export const GENERATE_TOUR_H = 540;
export const GENERATE_TOUR_FPS = 30;
export const GENERATE_TOUR_TOTAL = 240;

const C = {
  blue: "#2563EB",
  blue50: "#EFF6FF",
  blue100: "#DBEAFE",
  blue200: "#BFDBFE",
  blue300: "#93C5FD",
  blue700: "#1D4ED8",
  violet: "#7C3AED",
  violet50: "#F5F3FF",
  violet100: "#EDE9FE",
  violet200: "#DDD6FE",
  violet700: "#6D28D9",
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
  red: "#DC2626",
};

const FONT =
  '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const FRAME_PAD = 18;
const INNER_W = GENERATE_TOUR_W - FRAME_PAD * 2;
const INNER_H = GENERATE_TOUR_H - FRAME_PAD * 2;
const UI = {
  top: 62,
  leftX: 18,
  leftW: 260,
  midX: 292,
  midW: 372,
  rightX: 676,
  rightW: 230,
  gap: 14,
  safeRight: INNER_W - 18,
  resultTop: INNER_H - 18 - 134,
  resultW: INNER_W - 36,
};

function clampInterp(
  frame: number,
  range: [number, number],
  output: [number, number],
) {
  return interpolate(frame, range, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
}

function pulse(frame: number, start: number, end: number) {
  const p = clampInterp(frame, [start, end], [0, Math.PI * 2]);
  return 0.5 + Math.sin(p) * 0.5;
}

function Cursor({
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

function MiniLine({
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

function Segment({
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

function PassageCard({
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

function AppFrame({ children }: { children: ReactNode }) {
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

function BaseWorkspace({
  leftActive = false,
  mode = "auto",
  result = false,
}: {
  leftActive?: boolean;
  mode?: "auto" | "manual";
  result?: boolean;
}) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: UI.leftX,
          top: UI.top,
          width: UI.leftW,
          bottom: result ? 170 : 18,
          borderRadius: 14,
          background: leftActive ? C.violet50 : C.white,
          border: `1px solid ${leftActive ? C.violet200 : C.slate200}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 42,
            borderBottom: `1px solid ${C.slate200}`,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontSize: 13,
            fontWeight: 900,
            color: leftActive ? C.violet700 : C.slate800,
          }}
        >
          지문 워크스페이스
        </div>
        {leftActive ? (
          <div style={{ padding: 12 }}>
            <div
              style={{
                height: 112,
                borderRadius: 12,
                background: C.white,
                border: `1px solid ${C.violet200}`,
                padding: 12,
              }}
            >
              <MiniLine w={92} color={C.violet100} />
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                <MiniLine w={198} />
                <MiniLine w={176} />
                <MiniLine w={210} />
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                height: 36,
                borderRadius: 999,
                background: C.violet,
                color: C.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              AI 변형 · 범위 지정
            </div>
          </div>
        ) : (
          <div
            style={{
              height: "calc(100% - 42px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.slate400,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            워크스페이스로 보내기
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: UI.midX,
          top: UI.top,
          width: UI.midW,
          bottom: result ? 170 : 18,
          borderRadius: 14,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 42,
            borderBottom: `1px solid ${C.slate200}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, color: C.slate800 }}>
            지문 입력·선택
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <MiniLine w={46} h={24} color={C.slate100} />
            <MiniLine w={54} h={24} color={C.blue100} />
            <MiniLine w={74} h={24} color={C.blue100} />
          </div>
        </div>
        <PassageCard x={18} y={68} selected workspace={leftActive} />
        <PassageCard x={190} y={68} title="지문 2" />
        <PassageCard x={18} y={222} title="지문 3" />
        <PassageCard
          x={190}
          y={222}
          selected={mode === "manual"}
          title="지문 4"
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: UI.rightX,
          top: UI.top,
          width: UI.rightW,
          bottom: result ? 170 : 18,
          borderRadius: 14,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 42,
            borderBottom: `1px solid ${C.slate200}`,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontSize: 13,
            fontWeight: 900,
            color: C.slate800,
          }}
        >
          유형·생성 설정
        </div>
        <div style={{ padding: 12 }}>
          <div
            style={{
              height: 36,
              borderRadius: 10,
              background: C.slate100,
              padding: 3,
              display: "flex",
              gap: 3,
            }}
          >
            <Segment label="자동" active={mode === "auto"} />
            <Segment label="유형" active={mode === "manual"} />
          </div>
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <MiniLine w={68} color={C.slate300} />
            <MiniLine
              w={172}
              h={32}
              color={mode === "manual" ? C.slate100 : C.blue100}
            />
            <MiniLine w={154} h={32} color={C.slate100} />
            <MiniLine w={182} h={32} color={C.slate100} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 12,
              height: 42,
              borderRadius: 12,
              background: C.blue,
              color: C.white,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            문제 생성
          </div>
        </div>
      </div>
      {result ? (
        <div
          style={{
            position: "absolute",
            left: UI.leftX,
            top: UI.resultTop,
            width: UI.resultW,
            height: 134,
            borderRadius: 14,
            background: C.white,
            border: `1px solid ${C.slate200}`,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, color: C.slate800 }}>
            생성/검수 결과
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 66,
                  borderRadius: 10,
                  background: C.slate50,
                  border: `1px solid ${C.slate200}`,
                  padding: 10,
                }}
              >
                <MiniLine w={90 + i * 14} color={C.slate300} />
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  <MiniLine w={180} />
                  <MiniLine w={132} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function UploadScene({ frame }: { frame: number }) {
  const uploadGlow = pulse(frame, 20, 110);
  const crop = clampInterp(frame, [84, 132], [0, 1]);
  const cardIn = clampInterp(frame, [132, 168], [0, 1]);
  const leftPanel = { x: 44, y: 82, w: 500, h: 372 };
  const rightPanel = { x: 568, y: 82, w: 312, h: 372 };
  const cursorX = interpolate(
    frame,
    [0, 56, 92, 124, 168, 210],
    [470, 470, 340, 426, 720, 720],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const cursorY = interpolate(
    frame,
    [0, 56, 92, 124, 168, 210],
    [238, 238, 228, 318, 412, 412],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AppFrame>
      <div
        style={{
          position: "absolute",
          left: leftPanel.x,
          top: leftPanel.y,
          width: leftPanel.w,
          height: leftPanel.h,
          borderRadius: 16,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          padding: 18,
        }}
      >
        <div
          style={{
            height: 220,
            borderRadius: 14,
            border: `2px dashed ${C.blue300}`,
            background: `rgba(37,99,235,${0.06 + uploadGlow * 0.06})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, color: C.blue700 }}>
            파일을 끌어놓거나 클릭해서 추가
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.slate500 }}>
            PDF · PNG · JPG
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 82,
            top: 252,
            width: 216 * crop,
            height: 84 * crop,
            borderRadius: 8,
            border: `3px solid ${C.blue}`,
            background: "rgba(37,99,235,0.08)",
            opacity: crop > 0.02 ? 1 : 0,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: rightPanel.x,
          top: rightPanel.y,
          width: rightPanel.w,
          height: rightPanel.h,
          borderRadius: 16,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, color: C.slate900 }}>
          추출될 지문
        </div>
        <div
          style={{
            marginTop: 16,
            height: 104,
            borderRadius: 12,
            background: C.blue50,
            border: `1px solid ${C.blue200}`,
            padding: 14,
            opacity: cardIn,
            transform: `translateY(${(1 - cardIn) * 16}px)`,
          }}
        >
          <MiniLine w={110} color={C.blue200} />
          <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
            <MiniLine w={198} />
            <MiniLine w={176} />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            height: 42,
            borderRadius: 12,
            background: C.blue,
            color: C.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 900,
          }}
        >
          추출 시작
        </div>
      </div>
      <Cursor x={cursorX} y={cursorY} pressed={frame > 92 && frame < 124} />
    </AppFrame>
  );
}

function PasteScene({ frame }: { frame: number }) {
  const rows = Math.min(3, Math.max(0, Math.floor((frame - 48) / 34) + 1));
  const board = { x: 42, y: 82, right: 42, bottom: 50 };
  const cursorX = interpolate(frame, [0, 70, 130, 200], [300, 300, 710, 710], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorY = interpolate(frame, [0, 70, 130, 200], [214, 214, 416, 416], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AppFrame>
      <div
        style={{
          position: "absolute",
          left: board.x,
          right: board.right,
          top: board.y,
          bottom: board.bottom,
          borderRadius: 16,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 48,
            borderBottom: `1px solid ${C.slate200}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 900, color: C.slate900 }}>
            직접 입력
          </div>
          <div
            style={{
              height: 32,
              borderRadius: 10,
              background: C.slate100,
              padding: 3,
              display: "flex",
              width: 272,
            }}
          >
            <Segment label="그대로 추출" active />
            <Segment label="AI 복원" />
          </div>
        </div>
        <div style={{ display: "flex", height: "calc(100% - 48px)" }}>
          <div style={{ flex: 1, padding: 20 }}>
            <div
              style={{
                height: "100%",
                borderRadius: 14,
                border: `1px solid ${C.blue200}`,
                background: C.blue50,
                padding: 18,
              }}
            >
              <MiniLine w={160} color={C.blue200} h={13} />
              <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
                <MiniLine w={420} color={C.slate300} />
                <MiniLine w={512} color={C.slate200} />
                <MiniLine w={468} color={C.slate200} />
                <MiniLine w={390} color={C.slate200} />
              </div>
            </div>
          </div>
          <div
            style={{
              width: 250,
              position: "relative",
              borderLeft: `1px solid ${C.slate200}`,
              background: C.slate50,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 900, color: C.slate800 }}>
              등록할 지문
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 9 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 54,
                    borderRadius: 10,
                    background: C.white,
                    border: `1px solid ${C.slate200}`,
                    padding: 10,
                    opacity: i < rows ? 1 : 0.25,
                  }}
                >
                  <MiniLine w={76} color={i < rows ? C.blue200 : C.slate200} />
                  <MiniLine w={142} color={C.slate200} />
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                bottom: 16,
                height: 40,
                borderRadius: 12,
                background: C.blue,
                color: C.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 900,
              }}
            >
              지문 등록하고 선택
            </div>
          </div>
        </div>
      </div>
      <Cursor x={cursorX} y={cursorY} pressed={frame > 128 && frame < 148} />
    </AppFrame>
  );
}

function WorkspaceScene({ frame }: { frame: number }) {
  const cursorX = interpolate(
    frame,
    [0, 60, 110, 168, 230],
    [584, 584, 242, 206, 790],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const cursorY = interpolate(
    frame,
    [0, 60, 110, 168, 230],
    [185, 185, 214, 296, 420],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const range = clampInterp(frame, [120, 158], [0, 1]);
  return (
    <AppFrame>
      <BaseWorkspace leftActive result={false} mode="manual" />
      <div
        style={{
          position: "absolute",
          left: UI.leftX + 34,
          top: 244,
          width: 190 * range,
          height: 36,
          borderRadius: 8,
          background: "rgba(124,58,237,0.14)",
          border: `2px solid ${C.violet}`,
          opacity: range > 0.02 ? 1 : 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: UI.leftX + 32,
          top: 304,
          width: 210,
          height: 38,
          borderRadius: 12,
          background: C.violet,
          color: C.white,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 900,
          opacity: range,
        }}
      >
        AI 문장 변형 · 이 범위만 출제
      </div>
      <Cursor x={cursorX} y={cursorY} pressed={frame > 118 && frame < 156} />
    </AppFrame>
  );
}

function PreciseScene({ frame }: { frame: number }) {
  const plusCount = Math.min(3, Math.max(0, Math.floor((frame - 70) / 36) + 1));
  return (
    <AppFrame>
      <BaseWorkspace mode="manual" result={false} />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            right: 44,
            top: 202 + i * 42,
            width: 168,
            height: 32,
            borderRadius: 9,
            background: i < plusCount ? C.blue50 : C.slate50,
            border: `1px solid ${i < plusCount ? C.blue200 : C.slate200}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            fontSize: 12,
            fontWeight: 900,
            color: i < plusCount ? C.blue700 : C.slate500,
          }}
        >
          <span>{["빈칸 추론", "어법 판단", "글의 순서"][i]}</span>
          <span>{i < plusCount ? "1" : "+"}</span>
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          right: 44,
          bottom: 84,
          width: 168,
          height: 56,
          borderRadius: 10,
          background: C.slate50,
          border: `1px solid ${C.slate200}`,
          padding: 10,
        }}
      >
        <MiniLine w={82} color={C.slate300} />
        <MiniLine w={136} color={C.slate200} />
      </div>
      <Cursor
        x={interpolate(
          frame,
          [0, 66, 102, 138, 196],
          [830, 830, 830, 830, 814],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}
        y={interpolate(
          frame,
          [0, 66, 102, 138, 196],
          [204, 204, 246, 288, 418],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}
        pressed={
          (frame > 70 && frame < 82) ||
          (frame > 106 && frame < 118) ||
          (frame > 142 && frame < 154)
        }
      />
    </AppFrame>
  );
}

function ResultsScene({ frame }: { frame: number }) {
  const done = clampInterp(frame, [64, 120], [0, 1]);
  const resultHighlight = {
    x: UI.leftX + 32,
    y: UI.resultTop + 28,
    w: UI.resultW - 64,
    h: 78,
  };
  return (
    <AppFrame>
      <BaseWorkspace result mode="manual" />
      <div
        style={{
          position: "absolute",
          left: resultHighlight.x,
          top: resultHighlight.y,
          width: resultHighlight.w,
          height: resultHighlight.h,
          borderRadius: 14,
          background: C.white,
          border: `2px solid ${C.blue200}`,
          boxShadow: "0 0 0 6px rgba(37,99,235,0.08)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: resultHighlight.x + 26,
          top: resultHighlight.y + 36,
          width: 104,
          height: 30,
          borderRadius: 9,
          background: `rgba(37,99,235,${done})`,
          color: done > 0.5 ? C.white : C.blue700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        검수완료
      </div>
      <Cursor
        x={interpolate(frame, [0, 80, 130, 210], [510, 510, 126, 126], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        y={interpolate(
          frame,
          [0, 80, 130, 210],
          [426, 426, resultHighlight.y + 42, resultHighlight.y + 42],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}
        pressed={frame > 124 && frame < 142}
      />
    </AppFrame>
  );
}

function OverviewScene({ frame }: { frame: number }) {
  const phase = Math.floor((frame % GENERATE_TOUR_TOTAL) / 48);
  const activeIndex = Math.min(phase, 3);
  return (
    <AppFrame>
      <BaseWorkspace
        leftActive={phase >= 1}
        mode={phase >= 2 ? "manual" : "auto"}
        result={phase >= 3}
      />
      {[
        {
          x: UI.midX,
          y: UI.top,
          w: UI.midW,
          h: 420,
          label: "지문 입력·선택",
        },
        {
          x: UI.leftX,
          y: UI.top,
          w: UI.leftW,
          h: 420,
          label: "워크스페이스",
        },
        {
          x: UI.rightX,
          y: UI.top,
          w: UI.rightW,
          h: 420,
          label: "유형·생성 설정",
        },
        {
          x: UI.leftX,
          y: UI.resultTop,
          w: UI.resultW,
          h: 134,
          label: "생성/검수 결과",
        },
      ].map((r, i) =>
        activeIndex === i ? (
          <div
            key={r.label}
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              borderRadius: 16,
              border: `4px solid ${i === 1 ? C.violet : C.blue}`,
              boxShadow: `0 0 0 ${8 + pulse(frame, 0, 48) * 4}px rgba(37,99,235,0.10)`,
              pointerEvents: "none",
            }}
          />
        ) : null,
      )}
    </AppFrame>
  );
}

function LibraryScene({ frame }: { frame: number }) {
  const selected = frame > 62;
  return (
    <AppFrame>
      <BaseWorkspace leftActive={false} mode="auto" result={false} />
      <Cursor
        x={interpolate(
          frame,
          [0, 54, 96, 160, 216],
          [342, 342, 790, 790, 790],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}
        y={interpolate(
          frame,
          [0, 54, 96, 160, 216],
          [154, 154, 420, 420, 420],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )}
        pressed={(frame > 58 && frame < 74) || (frame > 164 && frame < 180)}
      />
      <PassageCard x={UI.midX + 18} y={130} selected={selected} />
    </AppFrame>
  );
}

export function GenerateTourVideo({
  variant = "overview",
}: {
  variant?: GenerateTourVariant;
}) {
  const frame = useCurrentFrame();
  if (variant === "file") return <UploadScene frame={frame} />;
  if (variant === "paste") return <PasteScene frame={frame} />;
  if (variant === "workspace") return <WorkspaceScene frame={frame} />;
  if (variant === "precise") return <PreciseScene frame={frame} />;
  if (variant === "results") return <ResultsScene frame={frame} />;
  if (variant === "library") return <LibraryScene frame={frame} />;
  return <OverviewScene frame={frame} />;
}
