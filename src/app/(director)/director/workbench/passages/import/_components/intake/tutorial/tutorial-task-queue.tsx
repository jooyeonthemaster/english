"use client";

import { Easing, interpolate, spring } from "remotion";

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

function MiniPreview({ tone = "blue" }: { tone?: "blue" | "slate" }) {
  const color = tone === "blue" ? C.blue100 : C.slate200;
  return (
    <div
      style={{
        width: 128,
        height: 168,
        borderRadius: 8,
        background: C.white,
        border: `1px solid ${C.slate200}`,
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          height: 12,
          width: 86,
          margin: "0 auto 12px",
          borderRadius: 999,
          border: `1px solid ${C.slate300}`,
        }}
      />
      {[0.95, 0.72, 0.84, 0.62, 0.9, 0.7, 0.56, 0.82, 0.66].map(
        (w, index) => (
          <div
            key={index}
            style={{
              width: `${w * 100}%`,
              height: 4,
              borderRadius: 999,
              background: index === 3 ? color : C.slate200,
              marginBottom: 7,
            }}
          />
        ),
      )}
    </div>
  );
}

function ExistingMaterialCard({
  title,
  count,
  delay,
  frame,
}: {
  title: string;
  count: string;
  delay: number;
  frame: number;
}) {
  const p = clampInterp(frame, [delay, delay + 18], [0, 1], EASE);
  return (
    <div
      style={{
        opacity: p * 0.7,
        transform: `translateY(${(1 - p) * 12}px)`,
        height: 188,
        borderRadius: 14,
        background: C.white,
        border: `1px solid ${C.emerald100}`,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "136px 1fr",
      }}
    >
      <div
        style={{
          background: C.slate50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MiniPreview tone="slate" />
      </div>
      <div style={{ padding: 16, fontFamily: FONT }}>
        <div
          style={{
            color: C.slate900,
            fontSize: 14,
            fontWeight: 900,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 8,
            width: 42,
            height: 22,
            borderRadius: 999,
            background: C.emerald50,
            color: C.emerald,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 900,
          }}
        >
          완료
        </div>
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <StatBox label="처리 페이지" value={count} />
          <StatBox label="복원 결과" value="대기열" muted />
        </div>
        <div
          style={{
            marginTop: 12,
            color: C.blue,
            background: C.blue50,
            borderRadius: 7,
            width: 78,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          자료 추출
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        height: 48,
        borderRadius: 10,
        background: muted ? C.slate50 : C.blue50,
        padding: "7px 10px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ color: C.slate400, fontSize: 10, fontWeight: 800 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          color: muted ? C.slate600 : C.slate900,
          fontSize: 14,
          fontWeight: 900,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PendingMaterialCard({
  frame,
  title,
  meta,
}: {
  frame: number;
  title: string;
  meta: string;
}) {
  const p = clampInterp(frame, [18, 34], [0, 1], EASE);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 5);
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px) scale(${0.98 + 0.02 * p})`,
        height: 188,
        borderRadius: 14,
        background: C.white,
        border: `1.5px solid ${C.blue200}`,
        boxShadow: `0 0 0 ${3 + 3 * pulse}px rgba(37,99,235,${
          0.08 + 0.08 * pulse
        })`,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "136px 1fr",
      }}
    >
      <div
        style={{
          background: C.blue50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MiniPreview tone="blue" />
      </div>
      <div style={{ padding: 16, fontFamily: FONT }}>
        <div
          style={{
            color: C.slate900,
            fontSize: 14,
            fontWeight: 900,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              height: 22,
              borderRadius: 999,
              background: C.blue50,
              color: C.blue,
              border: `1px solid ${C.blue100}`,
              padding: "0 9px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 900,
            }}
          >
            대기 중
          </span>
          <span style={{ color: C.slate400, fontSize: 10.5, fontWeight: 800 }}>
            방금 추가됨
          </span>
        </div>
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <StatBox label="작업 상태" value="대기열" />
          <StatBox label="처리 방식" value={meta} muted />
        </div>
        <div
          style={{
            marginTop: 12,
            height: 5,
            borderRadius: 999,
            background: C.slate200,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${32 + 18 * pulse}%`,
              height: "100%",
              borderRadius: 999,
              background: C.blue,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function TutorialTaskQueue({
  frame,
  startFrame,
  fps,
  taskTitle,
  taskMeta,
}: {
  frame: number;
  startFrame: number;
  fps: number;
  taskTitle: string;
  taskMeta: string;
}) {
  const local = frame - startFrame;
  if (local < 0) return null;

  const sectionP = spring({
    frame: local - 4,
    fps,
    config: { damping: 20, mass: 0.7 },
  });
  const fly = clampInterp(local, [0, 26], [0, 1], EASE);
  const flyOpacity =
    clampInterp(local, [0, 8], [0, 1]) *
    (1 - clampInterp(local, [22, 32], [0, 1]));

  const sectionTop = interpolate(sectionP, [0, 1], [720, 360]);
  const startX = 960;
  const startY = 616;
  const targetX = 58;
  const targetY = 442;
  const flyX = interpolate(fly, [0, 1], [startX, targetX]);
  const flyY = interpolate(fly, [0, 1], [startY, targetY]);
  const flyScale = interpolate(fly, [0, 1], [0.86, 1]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 80,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 28,
          right: 28,
          top: sectionTop,
          height: 338,
          borderRadius: 14,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          boxShadow: "0 -14px 42px rgba(15,23,42,0.14)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 52,
            borderBottom: `1px solid ${C.slate100}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: C.blue50,
                color: C.blue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 900,
              }}
            >
              ▤
            </span>
            <span style={{ color: C.slate900, fontSize: 14, fontWeight: 900 }}>
              자료 목록
            </span>
            <span style={{ color: C.slate400, fontSize: 12, fontWeight: 800 }}>
              · 1건 추가
            </span>
          </div>
          <span style={{ color: C.slate400, fontSize: 11.5, fontWeight: 800 }}>
            최신순으로 표시됩니다
          </span>
        </div>

        <div
          style={{
            padding: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            background: C.slate50,
            height: 286,
            boxSizing: "border-box",
          }}
        >
          <PendingMaterialCard
            frame={local}
            title={taskTitle}
            meta={taskMeta}
          />
          <ExistingMaterialCard
            frame={local}
            delay={34}
            title="26-3모의고사"
            count="8/8"
          />
          <ExistingMaterialCard
            frame={local}
            delay={40}
            title="exam_12_passages.pdf"
            count="10/10"
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: flyX,
          top: flyY,
          width: 250,
          height: 70,
          opacity: flyOpacity,
          transform: `scale(${flyScale})`,
          transformOrigin: "left top",
          borderRadius: 14,
          background: C.white,
          border: `1.5px solid ${C.blue200}`,
          boxShadow: "0 18px 38px rgba(37,99,235,0.26)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 14px",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: C.blue50,
            color: C.blue,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 900,
          }}
        >
          ⇣
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: C.slate900,
              fontSize: 13,
              fontWeight: 900,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {taskTitle}
          </div>
          <div
            style={{
              marginTop: 3,
              color: C.slate500,
              fontSize: 10.5,
              fontWeight: 800,
            }}
          >
            자료 목록 대기열로 추가 중
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 30,
          bottom: 18,
          width: 168,
          height: 46,
          borderRadius: 999,
          background: C.white,
          border: `1px solid ${C.slate200}`,
          boxShadow: "0 12px 30px rgba(15,23,42,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: C.slate700,
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: C.blue50,
            color: C.blue,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
          }}
        >
          ▣
        </span>
        작업 목록
      </div>
    </div>
  );
}
