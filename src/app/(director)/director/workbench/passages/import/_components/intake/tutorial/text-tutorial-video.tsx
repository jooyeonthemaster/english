"use client";

import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
} from "remotion";

import { TutorialTaskQueue } from "./tutorial-task-queue";

export const TEXT_TUT_W = 1280;
export const TEXT_TUT_H = 720;
export const TEXT_TUT_FPS = 30;
export const TEXT_TUT_TOTAL = 720;

const C = {
  blue: "#2563EB",
  blue50: "#EFF6FF",
  blue100: "#DBEAFE",
  blue200: "#BFDBFE",
  blue300: "#93C5FD",
  slate950: "#020617",
  slate900: "#0F172A",
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
};
const FONT = '"Pretendard", -apple-system, system-ui, sans-serif';
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

const LEFT = { x: 36, y: 104, w: 720, h: 560 };
const RIGHT = { x: 780, y: 104, w: 464, h: 560 };
const TITLE = { x: LEFT.x + 28, y: LEFT.y + 34, w: 560, h: 40 };
const BODY = { x: LEFT.x + 28, y: LEFT.y + 92, w: 664, h: 350 };
const ADD_BTN = { x: LEFT.x + 28, y: LEFT.y + 456, w: 664, h: 44 };
const START_BTN = { x: RIGHT.x + 22, y: RIGHT.y + 496, w: RIGHT.w - 44, h: 44 };

const S = {
  paste1: [0, 162],
  add1: [162, 300],
  paste2: [300, 456],
  start: [456, 720],
};

type TextTutorialMode = "verbatim" | "restored";

const T = {
  type1: [52, 122],
  add1Click: [164, 188],
  card1: [190, 230],
  type2: [322, 392],
  add2Click: [398, 422],
  card2: [426, 466],
  startClick: [520, 548],
  toast: [560, 720],
};

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
        zIndex: 40,
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
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

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
  const t = spring({
    frame: frame - since,
    fps: TEXT_TUT_FPS,
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
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: C.slate900,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 1,
            fontSize: 12.5,
            fontWeight: 600,
            color: C.slate500,
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

function TextLines({
  progress,
  variant,
  mode,
}: {
  progress: number;
  variant: 1 | 2;
  mode: TextTutorialMode;
}) {
  const restored = mode === "restored";
  const rows =
    variant === 1
      ? restored
        ? [
            "Language learning is a path of (X) ______ through the landscapes.",
            "18. Which word best completes (X)?",
            "① failure   ② discovery   ③ league tables",
            "④ silence   ⑤ memory",
            "문제와 선지를 함께 붙여넣으면 AI가 원문을 복원해요.",
          ]
        : [
            "Soft drink companies attract consumers by adding bright colors.",
            "The colors make drinks look fresh, sweet, and exciting.",
            "However, many of those colors are artificial chemicals.",
            "(A) Also, artificial flavor can hide weak ingredients.",
            "(B) Studies have shown that color affects expectations.",
            "(C) Consumers often choose what looks vivid first.",
          ]
      : restored
        ? [
            "Although the sentence order is mixed, the question gives clues.",
            "19. Put the following sentences in the correct order.",
            "(A) First, readers notice repeated keywords.",
            "(B) Next, they connect cause and result.",
            "(C) Finally, the paragraph becomes one natural passage.",
          ]
        : [
            "A good reader does not simply translate each sentence.",
            "Instead, she checks how ideas connect across the paragraph.",
            "When one sentence feels isolated, the overall flow becomes weak.",
            "Therefore, structure is as important as vocabulary.",
            "This is why students should mark signal words while reading.",
          ];
  const shown = Math.max(0, Math.floor(rows.length * progress));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {rows.map((row, i) => {
        const visible = i < shown;
        const partial = i === shown && progress > 0 && progress < 1;
        const text = partial
          ? row.slice(0, Math.max(2, Math.floor(row.length * ((progress * rows.length) % 1))))
          : row;
        return (
          <div
            key={row}
            style={{
              height: 16,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 650,
              color: C.slate700,
              opacity: visible || partial ? 1 : 0.25,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {visible || partial ? text : i < 2 ? "본문을 입력하세요..." : ""}
            {partial ? <span style={{ color: C.blue }}>▌</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function InputBoard({
  frame,
  p1,
  p2,
  mode,
}: {
  frame: number;
  p1: number;
  p2: number;
  mode: TextTutorialMode;
}) {
  const firstCleared = frame >= T.add1Click[1] && frame < S.paste2[0];
  const secondCleared = frame >= T.add2Click[1];
  const second = frame >= S.paste2[0];
  const bodyProgress = firstCleared || secondCleared ? 0 : second ? p2 : p1;
  const title =
    mode === "restored"
      ? second
        ? "2026 고2 순서 배열 복원"
        : "2026 고1 빈칸 복원"
      : second
        ? "2026 고2 독해 구조 연습"
        : "2026 고1 3월 모의고사";
  const buttonReady =
    (frame >= T.type1[1] && frame < T.add1Click[1]) ||
    (frame >= T.type2[1] && frame < T.add2Click[1]);
  const clicked =
    (frame >= T.add1Click[0] && frame < T.add1Click[1]) ||
    (frame >= T.add2Click[0] && frame < T.add2Click[1]);
  return (
    <div
      style={{
        position: "absolute",
        left: LEFT.x,
        top: LEFT.y,
        width: LEFT.w,
        height: LEFT.h,
        background: C.slate50,
        borderRadius: 12,
        border: `1px solid ${C.slate200}`,
        padding: 18,
        boxSizing: "border-box",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: TITLE.x - LEFT.x,
          top: TITLE.y - LEFT.y,
          width: TITLE.w,
          height: TITLE.h,
          borderRadius: 8,
          border: `1px solid ${C.slate200}`,
          background: C.white,
          boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          fontSize: 13,
          fontWeight: 800,
          color: C.slate700,
        }}
      >
        {bodyProgress > 0.08 ? title : "제목(선택). 예: 2026 고1 3월 모의고사"}
      </div>
      <div
        style={{
          position: "absolute",
          right: 28,
          top: 34,
          width: 56,
          height: 34,
          borderRadius: 999,
          border: `1px solid ${bodyProgress >= 1 ? C.emerald100 : C.slate200}`,
          background: bodyProgress >= 1 ? C.emerald50 : C.white,
          color: bodyProgress >= 1 ? C.emerald : C.slate500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 900,
        }}
      >
        {bodyProgress >= 1 ? "612자" : `${Math.floor(bodyProgress * 612)}자`}
      </div>
      <div
        style={{
          position: "absolute",
          left: BODY.x - LEFT.x,
          top: BODY.y - LEFT.y,
          width: BODY.w,
          height: BODY.h,
          borderRadius: 10,
          border: `1.5px dashed ${bodyProgress > 0 ? C.blue200 : C.slate300}`,
          background: C.white,
          padding: "22px 28px",
          boxSizing: "border-box",
        }}
      >
        <TextLines
          progress={bodyProgress}
          variant={second ? 2 : 1}
          mode={mode}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: ADD_BTN.x - LEFT.x,
          top: ADD_BTN.y - LEFT.y,
          width: ADD_BTN.w,
          height: ADD_BTN.h,
          borderRadius: 9,
          border: `1px solid ${buttonReady || clicked ? C.blue : C.slate200}`,
          background: clicked ? C.blue50 : C.white,
          color: buttonReady || clicked ? C.blue : C.slate300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 900,
          boxShadow: buttonReady
            ? "0 0 0 4px rgba(37,99,235,0.12)"
            : "none",
        }}
      >
        <span style={{ fontSize: 18 }}>＋</span>
        지문 추가
      </div>
    </div>
  );
}

function ReviewCard({
  rank,
  title,
  pop,
  mode,
}: {
  rank: number;
  title: string;
  pop: number;
  mode: TextTutorialMode;
}) {
  const restored = mode === "restored";
  return (
    <div
      style={{
        opacity: pop,
        transform: `translateY(${(1 - pop) * 14}px)`,
        borderRadius: 10,
        border: `1px solid ${restored ? C.blue200 : C.slate200}`,
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
          padding: "0 10px",
          borderBottom: `1px solid ${C.slate100}`,
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            background: C.blue,
            color: "#fff",
            borderRadius: 5,
            padding: "2px 9px",
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          {restored ? "복원 지문" : "지문"} {rank}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 10.5,
            fontWeight: 700,
            color: C.slate600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: 10, background: C.slate50 }}>
        {(restored ? [0.94, 0.72, 0.86, 0.62] : [0.94, 0.84, 0.9, 0.68]).map((w, i) => (
          <div
            key={i}
            style={{
              width: `${w * 100}%`,
              height: 5,
              borderRadius: 999,
              background: restored && i === 1 ? C.blue200 : C.slate200,
              marginBottom: 6,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewPanel({
  frame,
  card1,
  card2,
  mode,
}: {
  frame: number;
  card1: number;
  card2: number;
  mode: TextTutorialMode;
}) {
  const restored = mode === "restored";
  const count = (frame >= T.card1[0] ? 1 : 0) + (frame >= T.card2[0] ? 1 : 0);
  const startReady = count >= 2 && frame >= S.start[0];
  const startPressed = frame >= T.startClick[0] && frame < T.startClick[1];
  return (
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
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          height: 48,
          borderBottom: `1px solid ${C.slate100}`,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 8,
          boxSizing: "border-box",
          fontSize: 13,
          fontWeight: 900,
          color: C.slate900,
        }}
      >
        <span style={{ color: C.blue }}>▰</span>
          {restored ? "복원될 지문" : "추출될 지문"} {count}개
      </div>
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          top: 66,
          display: "grid",
          gap: 10,
        }}
      >
        {frame < T.card1[0] ? (
          <div
            style={{
              height: 156,
              borderRadius: 12,
              border: `1.5px dashed ${C.slate200}`,
              background: C.slate50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: C.slate400,
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.6,
            }}
          >
            {restored ? "문제·선지까지 입력하고" : "왼쪽에 입력하고"}
            <br />
            “지문 추가”를 누르세요
          </div>
        ) : null}
        {frame >= T.card1[0] ? (
          <ReviewCard
            rank={1}
            title={restored ? "2026 고1 빈칸 복원" : "2026 고1 3월 모의고사"}
            pop={card1}
            mode={mode}
          />
        ) : null}
        {frame >= T.card2[0] ? (
          <ReviewCard
            rank={2}
            title={
              restored ? "2026 고2 순서 배열 복원" : "2026 고2 독해 구조 연습"
            }
            pop={card2}
            mode={mode}
          />
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 18,
        }}
      >
        <div
          style={{
            height: START_BTN.h,
            borderRadius: 9,
            background: startReady ? C.blue : C.blue300,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 900,
            boxShadow: startReady
              ? "0 0 0 4px rgba(37,99,235,0.13)"
              : "none",
            transform: startPressed ? "scale(0.985)" : "none",
          }}
        >
          ▶ {restored ? "복원하여 추출 시작" : "텍스트 추출 시작"}{" "}
          {count > 0 ? `(지문 ${count}개)` : ""}
        </div>
      </div>
    </div>
  );
}

export const TextTutorialVideo: React.FC<{ mode?: TextTutorialMode }> = ({
  mode = "verbatim",
}) => {
  const frame = useCurrentFrame();
  const restored = mode === "restored";
  const p1 = clampInterp(frame, T.type1 as [number, number], [0, 1], EASE);
  const p2 = clampInterp(frame, T.type2 as [number, number], [0, 1], EASE);
  const card1 = clampInterp(frame, T.card1 as [number, number], [0, 1], EASE);
  const card2 = clampInterp(frame, T.card2 as [number, number], [0, 1], EASE);

  let cap = {
    step: 1,
    title: restored
      ? "문제와 선지까지 함께 붙여넣어요"
      : "텍스트를 그대로 붙여넣어요",
    sub: restored
      ? "빈칸·순서형은 지문만 넣으면 원문 복원이 어려워요"
      : "제목은 선택, 본문은 여러 문단과 선지도 함께 입력할 수 있어요",
    since: S.paste1[0],
  };
  if (frame >= S.add1[0] && frame < S.paste2[0])
    cap = {
      step: 2,
      title: restored
        ? "복원할 지문으로 오른쪽에 쌓여요"
        : "지문 추가를 누르면 오른쪽에 쌓여요",
      sub: restored
        ? "AI가 읽을 문제 단위로 카드를 만들어둡니다"
        : "여러 지문을 한 작업으로 모아 추출할 수 있어요",
      since: S.add1[0],
    };
  else if (frame >= S.paste2[0] && frame < S.start[0])
    cap = {
      step: 3,
      title: restored
        ? "다른 복원 문제도 같은 방식으로 추가"
        : "두 번째 지문도 같은 방식으로 추가",
      sub: restored
        ? "빈칸·순서·삽입 문제는 보기까지 포함하면 좋아요"
        : "카드 순서가 곧 추출 순서가 됩니다",
      since: S.paste2[0],
    };
  else if (frame >= S.start[0])
    cap = {
      step: 4,
      title: restored ? "복원하여 추출 시작" : "텍스트 추출 시작",
      sub: restored
        ? "AI가 정답과 순서를 추론해 원문으로 복원합니다"
        : "누적된 지문을 한 번에 처리하고 작업 목록에서 확인해요",
      since: S.start[0],
    };

  let cx = BODY.x + 110;
  let cy = BODY.y + 88;
  let pressed = false;
  if (frame >= T.type1[1] && frame < T.add1Click[1]) {
    const p = clampInterp(frame, [T.type1[1], T.add1Click[0]], [0, 1], EASE);
    cx = interpolate(p, [0, 1], [BODY.x + 150, ADD_BTN.x + ADD_BTN.w / 2]);
    cy = interpolate(p, [0, 1], [BODY.y + 110, ADD_BTN.y + ADD_BTN.h / 2]);
    pressed = frame >= T.add1Click[0];
  } else if (frame >= T.type2[1] && frame < T.add2Click[1]) {
    const p = clampInterp(frame, [T.type2[1], T.add2Click[0]], [0, 1], EASE);
    cx = interpolate(p, [0, 1], [BODY.x + 150, ADD_BTN.x + ADD_BTN.w / 2]);
    cy = interpolate(p, [0, 1], [BODY.y + 110, ADD_BTN.y + ADD_BTN.h / 2]);
    pressed = frame >= T.add2Click[0];
  } else if (frame >= S.start[0]) {
    const p = clampInterp(frame, [S.start[0], T.startClick[0]], [0, 1], EASE);
    cx = interpolate(p, [0, 1], [RIGHT.x + 130, START_BTN.x + START_BTN.w / 2]);
    cy = interpolate(p, [0, 1], [RIGHT.y + 180, START_BTN.y + START_BTN.h / 2]);
    pressed = frame >= T.startClick[0] && frame < T.startClick[1];
  }
  const cursorOpacity = frame < T.type1[0] ? 0 : 1;

  return (
    <AbsoluteFill style={{ background: C.white, fontFamily: FONT }}>
      <Caption
        step={cap.step}
        title={cap.title}
        sub={cap.sub}
        frame={frame}
        since={cap.since}
      />
      <InputBoard frame={frame} p1={p1} p2={p2} mode={mode} />
      <ReviewPanel frame={frame} card1={card1} card2={card2} mode={mode} />
      <TutorialTaskQueue
        frame={frame}
        startFrame={T.toast[0]}
        fps={TEXT_TUT_FPS}
        taskTitle={restored ? "원문 복원 텍스트 2개" : "텍스트 지문 2개"}
        taskMeta={restored ? "AI 원문 복원 처리 대기" : "텍스트 추출 처리 대기"}
      />
      <Cursor x={cx} y={cy} pressed={pressed} opacity={cursorOpacity} />
    </AbsoluteFill>
  );
};

export default TextTutorialVideo;
