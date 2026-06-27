"use client";

import { interpolate } from "remotion";
import { C, UI, clampInterp, pulse } from "./generate-tour-video-constants";
import { AppFrame, Cursor, MiniLine, PassageCard, Segment } from "./generate-tour-video-primitives";
export function BaseWorkspace({
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

export function UploadScene({ frame }: { frame: number }) {
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

export function PasteScene({ frame }: { frame: number }) {
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
