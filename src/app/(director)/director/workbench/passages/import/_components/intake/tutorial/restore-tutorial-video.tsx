"use client";

// RestoreTutorialVideo — CropTutorialVideo와 같은 작업 화면 문법으로
// "AI로 원문 복원" 모드를 설명하는 Remotion 컴포지션.

import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { TutorialTaskQueue } from "./tutorial-task-queue";

export const RESTORE_TUT_W = 1280;
export const RESTORE_TUT_H = 720;
export const RESTORE_TUT_FPS = 30;
export const RESTORE_TUT_TOTAL = 790;

const C = {
  blue: "#2563EB",
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
  amber50: "#FFFBEB",
  amber200: "#FDE68A",
  amber700: "#B45309",
};

const FONT = '"Pretendard", -apple-system, system-ui, sans-serif';
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

const S = {
  add: [0, 90],
  crop: [90, 252],
  analyze: [252, 420],
  restore: [420, 610],
  start: [610, 790],
} as const;

const T = {
  approach: [104, 124],
  draw: [124, 174],
  card: [174, 212],
  aiPulse: [278, 356],
  restore: [438, 512],
  startApproach: [622, 654],
  startClick: [654, 674],
  toast: [680, 790],
} as const;

const LEFT = { x: 28, y: 96, w: 720, h: 560 };
const RIGHT = { x: 764, y: 96, w: 488, h: 560 };
const PAPER = { x: 52, y: 116, w: 668, h: 520 };
const CROP_BOX = { x: 68, y: 176, w: 310, h: 380 };
const START_BTN = { x: RIGHT.x + RIGHT.w / 2, y: 664 + 22 };
const CURSOR_TIP = { dx: 4, dy: 3 };

type Rect = { x: number; y: number; w: number; h: number };

function clampInterp(
  frame: number,
  range: readonly [number, number],
  out: readonly [number, number],
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

function TextLines({
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

function PassageBlock({
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

function ExamPaper({ restored }: { restored: boolean }) {
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
      <div
        style={{
          position: "absolute",
          left: 22,
          top: 66,
          fontFamily: FONT,
          fontSize: 8.5,
          fontWeight: 800,
          color: C.slate600,
        }}
      >
        18. Which word best completes (X)?
      </div>

      <PassageBlock rect={{ x: 22, y: 90, w: 292, h: 138 }}>
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 7,
            color: restored ? C.emerald : C.slate400,
            fontSize: 8,
            fontWeight: 900,
          }}
        >
          지문
        </div>
        <TextLines
          x={10}
          y={28}
          w={268}
          lines={[
            "Language learning is a path of",
            restored ? "discovery through the landscapes" : "(X) ______ through the landscapes",
            "of history and culture, science and",
            "technology.",
            0.75,
            0.56,
          ]}
          color={restored ? C.slate700 : C.slate500}
        />
      </PassageBlock>

      <PassageBlock rect={{ x: 22, y: 248, w: 292, h: 188 }} tone="question">
        <div
          style={{
            padding: "10px 10px 6px",
            fontSize: 9,
            fontWeight: 900,
            color: C.slate700,
          }}
        >
          18. Which word best completes (X)?
        </div>
        {["failure", "discovery", "league tables", "silence", "memory"].map(
          (choice, index) => {
            const answer = index === 1;
            return (
              <div
                key={choice}
                style={{
                  margin: "5px 10px",
                  height: 22,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 8px",
                  background: restored && answer ? C.blue100 : C.white,
                  border:
                    restored && answer
                      ? `1.5px solid ${C.blue300}`
                      : `1px solid ${C.slate200}`,
                  color: restored && answer ? C.blue700 : C.slate600,
                  fontSize: 9,
                  fontWeight: restored && answer ? 900 : 700,
                }}
              >
                <span>{index + 1}</span>
                <span>{choice}</span>
                {restored && answer ? <span>✓</span> : null}
              </div>
            );
          },
        )}
      </PassageBlock>

      <div
        style={{
          position: "absolute",
          left: PAPER.w / 2,
          top: 58,
          bottom: 10,
          width: 1,
          background: C.slate200,
        }}
      />
      <PassageBlock rect={{ x: 354, y: 90, w: 292, h: 116 }}>
        <div
          style={{
            padding: 10,
            fontFamily: FONT,
            fontSize: 9,
            fontWeight: 800,
            color: C.slate600,
          }}
        >
          19. Choose the best order.
        </div>
        <TextLines x={10} y={36} w={268} lines={[0.9, 0.75, 0.88, 0.6]} />
      </PassageBlock>
      <TextLines
        x={366}
        y={232}
        w={252}
        lines={[0.9, 0.8, 0.72, 0.86, 0.62, 0.75, 0.5, 0.84]}
      />
    </div>
  );
}

function CropBox({
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

function PanelChrome({
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

function MiniLine({
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

function RestoreCard({
  stage,
  pop,
  pulse,
}: {
  stage: number;
  pop: number;
  pulse: number;
}) {
  const restored = stage >= 4;
  const analyzing = stage === 3;
  return (
    <div
      style={{
        opacity: pop,
        transform: `translateY(${(1 - pop) * 14}px)`,
        borderRadius: 10,
        border: `1px solid ${restored ? C.emerald : C.blue}`,
        outline: restored ? `2px solid ${C.emerald100}` : `2px solid ${C.blue100}`,
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
          height: 36,
          boxSizing: "border-box",
          padding: "0 10px",
          borderBottom: `1px solid ${C.slate100}`,
        }}
      >
        <span
          style={{
            background: restored ? C.emerald : C.blue,
            color: C.white,
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 900,
            padding: "2px 9px",
            borderRadius: 5,
          }}
        >
          지문 1
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
          문제와 선지를 포함해 자른 영역
        </span>
        <span
          style={{
            fontFamily: FONT,
            fontSize: 9,
            fontWeight: 900,
            color: restored ? C.emerald : C.blue700,
            background: restored ? C.emerald50 : C.blue50,
            border: `1px solid ${restored ? C.emerald100 : C.blue100}`,
            borderRadius: 999,
            padding: "2px 7px",
          }}
        >
          {restored ? "복원 완료" : analyzing ? "AI 분석 중" : "복원 대기"}
        </span>
      </div>
      <div
        style={{
          background: restored ? C.emerald50 : C.slate100,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            borderRadius: 7,
            background: C.white,
            border: `1px solid ${restored ? C.emerald100 : C.slate200}`,
            padding: 10,
          }}
        >
          <MiniLine>
            Language learning is a path of{" "}
            <span
              style={{
                borderRadius: 5,
                padding: "1px 5px",
                background: restored ? C.emerald100 : C.amber50,
                color: restored ? C.emerald : C.amber700,
                fontWeight: 900,
                textDecoration: restored ? "none" : "line-through",
              }}
            >
              {restored ? "discovery" : "(X) ______"}
            </span>{" "}
            through the landscapes of history and culture.
          </MiniLine>
          <MiniLine muted={!restored}>
            {restored
              ? "Science and technology help us discover new paths."
              : "문제·선지를 함께 읽어야 빈칸을 채울 수 있어요."}
          </MiniLine>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <StatusChip label="문제 포함" done={stage >= 2} />
          <StatusChip label="정답 추론" done={stage >= 3} active={analyzing} pulse={pulse} />
          <StatusChip label="빈칸 채움" done={stage >= 4} />
          <StatusChip label="원문 정리" done={stage >= 4} />
        </div>
      </div>
    </div>
  );
}

function StatusChip({
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

function AddScene({ frame, fps }: { frame: number; fps: number }) {
  const dzPulse = 0.5 + 0.5 * Math.sin(frame / 8);
  const drop = spring({
    frame: frame - 8,
    fps,
    config: { damping: 16, mass: 0.7 },
  });
  const y = interpolate(drop, [0, 1], [-120, 250], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 10, 72, 86], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
          ↑
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 16,
            fontWeight: 900,
            color: C.slate900,
          }}
        >
          AI로 원문 복원할 시험지 파일 추가
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.slate500 }}>
          빈칸·순서·삽입형 지문은 문제와 선지가 같이 필요해요
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 540,
          top: 96 + y,
          width: 160,
          height: 210,
          borderRadius: 8,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          boxShadow: "0 14px 34px rgba(15,23,42,0.18)",
          opacity,
          transform: "rotate(-4deg)",
          padding: 10,
          boxSizing: "border-box",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: 4,
            color: C.slate800,
            border: `1px solid ${C.slate400}`,
            borderRadius: 999,
            padding: "1px 0",
            marginBottom: 4,
          }}
        >
          영 어
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 7.5,
            fontWeight: 800,
            color: C.slate600,
            marginBottom: 6,
          }}
        >
          빈칸 유형 NO.5
        </div>
        {[0.9, 0.7, 0.85, 0.62, 0.92, 0.58, 0.8, 0.68, 0.95, 0.5, 0.76].map(
          (w, index) => (
            <div
              key={index}
              style={{
                height: 3,
                margin: "5px 0",
                width: `${w * 100}%`,
                background: C.slate200,
                borderRadius: 2,
              }}
            />
          ),
        )}
      </div>
    </AbsoluteFill>
  );
}

export const RestoreTutorialVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stage =
    frame >= S.start[0]
      ? 5
      : frame >= S.restore[0]
        ? 4
        : frame >= S.analyze[0]
          ? 3
          : frame >= S.crop[0]
            ? 2
            : 1;

  let cap: { step: number; title: string; sub: string; since: number } = {
    step: 1,
    title: "AI로 원문 복원할 파일을 올려요",
    sub: "빈칸·순서형 문제는 문제 정보까지 필요해요",
    since: S.add[0],
  };
  if (frame >= S.crop[0] && frame < S.analyze[0]) {
    cap = {
      step: 2,
      title: "지문 + 문제 + 선지를 함께 드래그",
      sub: "지문만 자르면 AI가 원문을 복원할 근거가 부족해요",
      since: S.crop[0],
    };
  } else if (frame >= S.analyze[0] && frame < S.restore[0]) {
    cap = {
      step: 3,
      title: "AI가 문제와 선지를 읽고 정답을 추론",
      sub: "빈칸과 섞인 순서를 풀어서 원문 후보를 만듭니다",
      since: S.analyze[0],
    };
  } else if (frame >= S.restore[0] && frame < S.start[0]) {
    cap = {
      step: 4,
      title: "완성된 원문 지문으로 복원",
      sub: "정답이 채워지고 문장 순서가 자연스럽게 정리돼요",
      since: S.restore[0],
    };
  } else if (frame >= S.start[0]) {
    cap = {
      step: 5,
      title: "복원하여 추출 시작",
      sub: "완성된 원문을 백그라운드 작업으로 보냅니다",
      since: S.start[0],
    };
  }

  const boardReveal = clampInterp(frame, [S.add[1] - 22, S.add[1]], [0, 1], EASE);
  const cropP = clampInterp(frame, T.draw, [0, 1], EASE);
  const cardPop = clampInterp(frame, T.card, [0, 1], EASE);
  const restoreP = clampInterp(frame, T.restore, [0, 1], EASE);
  const aiPulse =
    clampInterp(frame, T.aiPulse, [0, 1]) *
    (1 - clampInterp(frame, [T.aiPulse[1], T.restore[0]], [0, 1]));
  const restored = frame >= T.restore[0] + 12;
  const cardStage = restored ? 4 : stage;
  const panelCount = frame >= T.card[0] ? 1 : 0;

  let cx = CROP_BOX.x + 60;
  let cy = CROP_BOX.y + 40;
  let pressed = false;
  if (frame >= T.approach[0] && frame < T.card[0]) {
    const ap = clampInterp(frame, T.approach, [0, 1], EASE);
    cx =
      frame < T.draw[0]
        ? interpolate(ap, [0, 1], [PAPER.x + 120, CROP_BOX.x])
        : CROP_BOX.x + CROP_BOX.w * cropP;
    cy =
      frame < T.draw[0]
        ? interpolate(ap, [0, 1], [PAPER.y + 110, CROP_BOX.y])
        : CROP_BOX.y + CROP_BOX.h * cropP;
    pressed = frame >= T.draw[0] && frame < T.draw[1];
  } else if (frame >= S.start[0]) {
    const p = clampInterp(frame, T.startApproach, [0, 1], EASE);
    cx = interpolate(p, [0, 1], [RIGHT.x + 360, START_BTN.x]);
    cy = interpolate(p, [0, 1], [RIGHT.y + 220, START_BTN.y]);
    pressed = frame >= T.startClick[0] && frame < T.startClick[1];
  }

  return (
    <AbsoluteFill style={{ background: C.white, fontFamily: FONT }}>
      <Caption
        step={cap.step}
        title={cap.title}
        sub={cap.sub}
        frame={frame}
        since={cap.since}
      />

      {frame < S.add[1] ? (
        <AbsoluteFill style={{ opacity: 1 - boardReveal }}>
          <AddScene frame={frame} fps={fps} />
        </AbsoluteFill>
      ) : null}

      <div style={{ opacity: boardReveal }}>
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
          <ExamPaper restored={restored} />
          {frame >= T.draw[0] ? (
            <CropBox rect={CROP_BOX} progress={cropP} done={frame >= T.draw[1]} />
          ) : null}
        </div>

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
          <PanelChrome count={panelCount} stage={cardStage} />
          <div
            style={{
              flex: 1,
              padding: 12,
              display: "grid",
              gap: 10,
              alignContent: "start",
              background: "rgba(248,250,252,0.5)",
            }}
          >
            {panelCount === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: C.slate400,
                  fontSize: 11,
                  padding: "40px 10px",
                  lineHeight: 1.6,
                }}
              >
                왼쪽 이미지에서 문제와 선지까지 함께 잡으면
                <br />
                복원될 지문이 여기에 표시됩니다.
              </div>
            ) : (
              <RestoreCard
                stage={cardStage}
                pop={Math.max(cardPop, restoreP * 0.2)}
                pulse={aiPulse}
              />
            )}
          </div>
        </div>

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
          + 이미지·PDF 더 추가
        </div>

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
              color: C.white,
              fontFamily: FONT,
              fontSize: 14,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow:
                frame >= T.startApproach[1] && frame < T.toast[0]
                  ? "0 0 0 5px rgba(37,99,235,0.30)"
                  : "0 6px 16px rgba(37,99,235,0.25)",
              transform: `scale(${
                frame >= T.startClick[0] && frame < T.startClick[1] ? 0.97 : 1
              })`,
            }}
          >
            ▶ 복원하여 추출 시작 {panelCount > 0 ? "(지문 1개)" : ""}
          </div>
        </div>
      </div>

      <TutorialTaskQueue
        frame={frame}
        startFrame={T.toast[0]}
        fps={RESTORE_TUT_FPS}
        taskTitle="원문 복원 지문 1개"
        taskMeta="AI 원문 복원 처리 대기"
      />
      {frame >= T.approach[0] ? (
        <Cursor
          x={cx - CURSOR_TIP.dx}
          y={cy - CURSOR_TIP.dy}
          pressed={pressed}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export default RestoreTutorialVideo;
