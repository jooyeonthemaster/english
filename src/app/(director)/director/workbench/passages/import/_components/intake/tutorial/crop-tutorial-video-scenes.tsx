"use client";

import { AbsoluteFill, interpolate, spring } from "remotion";
import { BOX1, BOXA, BOXB, C, FONT, LEFT, PAPER } from "./crop-tutorial-video-constants";
import { MiniPassage, PassageBlock, TextLines } from "./crop-tutorial-video-primitives";
export function ExamPaper() {
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
      {/* 헤더 */}
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
      {/* 가운데 세로 구분선 */}
      <div
        style={{
          position: "absolute",
          left: PAPER.w / 2,
          top: 56,
          bottom: 10,
          width: 1,
          background: C.slate200,
        }}
      />

      {/* 좌측 칼럼: 문항 + 지문1 / 지문2(앞부분) */}
      <div
        style={{
          position: "absolute",
          left: 18,
          top: 64,
          fontFamily: FONT,
          fontSize: 8.5,
          fontWeight: 700,
          color: C.slate600,
        }}
      >
        12. Which one best summarizes the passage?
      </div>
      {/* 지문1 (BOX1 위치에 맞춤) */}
      <PassageBlock
        rect={{ x: BOX1.x - PAPER.x, y: BOX1.y - PAPER.y, w: BOX1.w, h: BOX1.h }}
        lines={[
          "We are taught from an early age that",
          '"sharing is caring." We tell our children',
          "to share their toys. The sharing economy",
          "sounds like a good thing. Thanks to apps,",
          "users can share their cars, rooms, tools,",
          "and even their own time and talents.",
          0.7,
          0.9,
          0.5,
        ]}
      />
      <div
        style={{
          position: "absolute",
          left: 18,
          top: BOXA.y - PAPER.y - 22,
          fontFamily: FONT,
          fontSize: 8.5,
          fontWeight: 700,
          color: C.slate600,
        }}
      >
        13. Read the passage below and answer.
      </div>
      {/* 지문2 앞부분 (BOXA) — 이어짐 */}
      <PassageBlock
        rect={{ x: BOXA.x - PAPER.x, y: BOXA.y - PAPER.y, w: BOXA.w, h: BOXA.h }}
        lines={[
          "Former U.S. Secretary of Labor Robert",
          "Reich calls this the “share-the-scraps”",
          "economy. He argues that only software",
          "companies earn real money; gig workers",
          "have to make do with the scraps.",
        ]}
        hint="이어짐 →"
        hintSide="bl"
      />

      {/* 우측 칼럼: 지문2 뒷부분(이어서) + 문항 */}
      <PassageBlock
        rect={{ x: BOXB.x - PAPER.x, y: BOXB.y - PAPER.y, w: BOXB.w, h: BOXB.h }}
        lines={[
          "The gig economy promised extra income,",
          "an opportunity to “monetize their own",
          "downtime,” Sundararajan claimed. Reich",
          "points out that this downtime might be",
          "your family time. In return, gig workers",
          "earn low wages without any guarantee.",
        ]}
        hint="← 이어서"
        hintSide="tr"
      />
      <div
        style={{
          position: "absolute",
          left: PAPER.w / 2 + 14,
          top: BOXB.y - PAPER.y + BOXB.h + 14,
          fontFamily: FONT,
          fontSize: 8.5,
          fontWeight: 700,
          color: C.slate600,
        }}
      >
        14. Where is the best place to insert?
      </div>
      <TextLines
        x={PAPER.w / 2 + 14}
        y={BOXB.y - PAPER.y + BOXB.h + 30}
        w={PAPER.w / 2 - 34}
        lines={[0.95, 0.85, 0.9, 0.6, 0.8, 0.5]}
      />
    </div>
  );
}

// ── 추출될 지문 카드 ───────────────────────────────────────────────────────
export function PassageCard({
  rank,
  subtitle,
  pieces,
  checked,
  pop,
  h,
}: {
  rank: number;
  subtitle: string;
  pieces: (number | string)[][];
  checked: boolean;
  pop: number; // 0..1 등장
  /** 고정 높이(단일 조각 카드=CARD_H). 미전달 시 내용에 맞춰 늘어남(합쳐진 카드). */
  h?: number;
}) {
  return (
    <div
      style={{
        opacity: pop,
        transform: `translateY(${(1 - pop) * 14}px)`,
        height: h,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        borderRadius: 10,
        border: `1px solid ${checked ? C.blue : C.slate200}`,
        outline: checked ? `2px solid ${C.blue300}` : "none",
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
          flexShrink: 0,
          boxSizing: "border-box",
          padding: "0 10px",
          borderBottom: `1px solid ${C.slate100}`,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            border: `1px solid ${checked ? C.blue : C.slate300}`,
            background: checked ? C.blue : C.white,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? "✓" : ""}
        </span>
        <span
          style={{
            background: C.blue,
            color: "#fff",
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 800,
            padding: "2px 9px",
            borderRadius: 5,
          }}
        >
          지문 {rank}
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
          {subtitle}
        </span>
        {pieces.length > 1 ? (
          <span
            style={{
              fontFamily: FONT,
              fontSize: 9,
              fontWeight: 700,
              color: C.slate600,
              border: `1px solid ${C.slate200}`,
              borderRadius: 5,
              padding: "1px 6px",
            }}
          >
            ✂ 분리
          </span>
        ) : null}
      </div>
      <div
        style={{
          flex: h ? 1 : undefined,
          background: C.slate100,
          padding: 8,
          display: "grid",
          gap: 6,
          alignContent: h ? "center" : "start",
          overflow: "hidden",
        }}
      >
        {pieces.map((p, i) => (
          <MiniPassage key={i} lines={p} />
        ))}
      </div>
    </div>
  );
}

// 장면 1: 드롭존 + 떨어지는 시험지 파일
export function AddScene({ frame, fps }: { frame: number; fps: number }) {
  const files = [
    { x: 470, label: "NO.5", delay: 8 },
    { x: 600, label: "NO.6", delay: 20 },
  ];
  const dzPulse = 0.5 + 0.5 * Math.sin(frame / 8);
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
          ⬆
        </div>
        <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 900, color: C.slate900 }}>
          파일을 끌어놓거나 클릭해서 추가
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.slate500 }}>
          여러 이미지·PDF를 한 번에 올릴 수 있어요
        </div>
      </div>

      {files.map((f, i) => {
        const fr = frame - f.delay;
        const drop = spring({ frame: fr, fps, config: { damping: 16, mass: 0.7 } });
        const y = interpolate(drop, [0, 1], [-120, 250 + i * 8], { extrapolateLeft: "clamp" });
        const op = interpolate(fr, [0, 8, 70, 84], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: f.x,
              top: 96 + y,
              width: 150,
              height: 200,
              borderRadius: 8,
              background: C.white,
              border: `1px solid ${C.slate200}`,
              boxShadow: "0 14px 34px rgba(15,23,42,0.18)",
              opacity: op,
              transform: `rotate(${i === 0 ? -4 : 5}deg)`,
              padding: 10,
              boxSizing: "border-box",
              fontFamily: FONT,
            }}
          >
            <div style={{ textAlign: "center", fontSize: 9, fontWeight: 900, letterSpacing: 4, color: C.slate800, border: `1px solid ${C.slate400}`, borderRadius: 999, padding: "1px 0", marginBottom: 4 }}>
              영 어
            </div>
            <div style={{ textAlign: "center", fontSize: 7.5, fontWeight: 800, color: C.slate600, marginBottom: 6 }}>
              중간고사 {f.label}
            </div>
            {[0.95, 0.8, 0.9, 0.6, 0.85, 0.7, 0.95, 0.5, 0.88, 0.75, 0.6, 0.9].map((w, j) => (
              <div key={j} style={{ height: 3, margin: "5px 0", width: `${w * 100}%`, background: C.slate200, borderRadius: 2 }} />
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
