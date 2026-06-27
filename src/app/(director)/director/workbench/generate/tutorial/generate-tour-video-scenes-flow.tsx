"use client";

import { interpolate } from "remotion";
import { C, GENERATE_TOUR_TOTAL, UI, clampInterp, pulse } from "./generate-tour-video-constants";
import { AppFrame, Cursor, MiniLine, PassageCard } from "./generate-tour-video-primitives";
import { BaseWorkspace } from "./generate-tour-video-scenes-base";
export function WorkspaceScene({ frame }: { frame: number }) {
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

export function PreciseScene({ frame }: { frame: number }) {
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

export function ResultsScene({ frame }: { frame: number }) {
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

export function OverviewScene({ frame }: { frame: number }) {
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

export function LibraryScene({ frame }: { frame: number }) {
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
