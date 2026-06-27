"use client";

import { AbsoluteFill, interpolate, spring } from "remotion";
import { C, FONT, LEFT, PAPER } from "./restore-tutorial-video-constants";
import { MiniLine, PassageBlock, StatusChip, TextLines } from "./restore-tutorial-video-primitives";
export function ExamPaper({ restored }: { restored: boolean }) {
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

export function RestoreCard({
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

export function AddScene({ frame, fps }: { frame: number; fps: number }) {
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
