"use client";

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TutorialTaskQueue } from "./tutorial-task-queue";
import { BOX1, BOXA, BOXB, C, CARD_H, CURSOR_TIP, EASE, FONT, LEFT, MERGE_BTN, RIGHT, S, START_BTN, T, TUT_FPS, cbCenter, clampInterp } from "./crop-tutorial-video-constants";
import { Caption, CropBox, Cursor, PanelChrome, SplitConnector } from "./crop-tutorial-video-primitives";
import { AddScene, ExamPaper, PassageCard } from "./crop-tutorial-video-scenes";

export {
  TUT_FPS,
  TUT_H,
  TUT_TOTAL,
  TUT_W,
} from "./crop-tutorial-video-constants";
// ── 메인 컴포지션 ──────────────────────────────────────────────────────────
export const CropTutorialVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 현재 장면 + 캡션
  let cap = { step: 1, title: "시험지 이미지·PDF를 올려요", sub: "여러 장을 한 번에 올릴 수 있어요", since: S.add[0] };
  if (frame >= S.crop1[0] && frame < S.crop1[1])
    cap = { step: 2, title: "지문 부분을 드래그하면 한 지문!", sub: "잘라낸 영역만 글자로 읽어 정리돼요", since: S.crop1[0] };
  else if (frame >= S.split[0] && frame < S.split[1])
    cap = { step: 3, title: "칸·페이지로 나뉜 지문은 각각 잘라요", sub: "왼→오 칸, 또는 다음 페이지로 이어진 한 지문", since: S.split[0] };
  else if (frame >= S.merge[0] && frame < S.merge[1])
    cap = { step: 4, title: "두 조각을 골라 '한 지문으로 합치기'", sub: "나뉜 조각이 하나의 완성된 지문이 돼요", since: S.merge[0] };
  else if (frame >= S.start[0])
    cap = { step: 5, title: "추출 시작 — 백그라운드로 처리!", sub: "기다릴 필요 없이 바로 다음 작업 가능", since: S.start[0] };

  // ── 진행도 계산 ──
  const box1P = clampInterp(frame, [T.c1Draw[0], T.c1Draw[1]], [0, 1], EASE);
  const card1Pop = clampInterp(frame, [T.c1Card[0], T.c1Card[1]], [0, 1], EASE);
  const boxAP = clampInterp(frame, [T.aDraw[0], T.aDraw[1]], [0, 1], EASE);
  const cardAPop = clampInterp(frame, [T.aCard[0], T.aCard[1]], [0, 1], EASE);
  const boxBP = clampInterp(frame, [T.bDraw[0], T.bDraw[1]], [0, 1], EASE);
  const cardBPop = clampInterp(frame, [T.bCard[0], T.bCard[1]], [0, 1], EASE);
  const check2 = frame >= T.check2[1];
  const check3 = frame >= T.check3[1];
  const glow = clampInterp(frame, [T.btnGlow[0], T.btnGlow[1]], [0, 1]) *
    (1 - clampInterp(frame, [T.btnClick[0], T.btnClick[1]], [0, 1]));
  const mergeP = clampInterp(frame, [T.mergeAnim[0], T.mergeAnim[1]], [0, 1], EASE);
  const merged = frame >= T.mergeAnim[0] + 6;

  // 패널에 보이는 지문 수
  const visible1 = frame >= T.c1Card[0];
  const visibleA = frame >= T.aCard[0] && !merged;
  const visibleB = frame >= T.bCard[0] && !merged;
  const panelCount =
    (visible1 ? 1 : 0) + (visibleA ? 1 : 0) + (visibleB ? 1 : 0) + (merged ? 1 : 0);
  const selected = (check2 && !merged ? 1 : 0) + (check3 && !merged ? 1 : 0);

  // ── 커서 위치 choreography ──
  let cx = 360;
  let cy = 300;
  let pressed = false;
  // crop1: 박스1 그리기
  if (frame >= T.c1Approach[0] && frame < T.c1Card[0]) {
    const dp = clampInterp(frame, [T.c1Draw[0], T.c1Draw[1]], [0, 1], EASE);
    const ap = clampInterp(frame, [T.c1Approach[0], T.c1Approach[1]], [0, 1], EASE);
    const sx = interpolate(ap, [0, 1], [200, BOX1.x], { extrapolateRight: "clamp" });
    const sy = interpolate(ap, [0, 1], [180, BOX1.y], { extrapolateRight: "clamp" });
    cx = frame < T.c1Draw[0] ? sx : BOX1.x + BOX1.w * dp;
    cy = frame < T.c1Draw[0] ? sy : BOX1.y + BOX1.h * dp;
    pressed = frame >= T.c1Draw[0] && frame < T.c1Draw[1];
  } else if (frame >= T.aApproach[0] && frame < T.aCard[0]) {
    const dp = boxAP;
    const ap = clampInterp(frame, [T.aApproach[0], T.aApproach[1]], [0, 1], EASE);
    const sx = interpolate(ap, [0, 1], [BOX1.x + 80, BOXA.x], { extrapolateRight: "clamp" });
    const sy = interpolate(ap, [0, 1], [BOX1.y + 60, BOXA.y], { extrapolateRight: "clamp" });
    cx = frame < T.aDraw[0] ? sx : BOXA.x + BOXA.w * dp;
    cy = frame < T.aDraw[0] ? sy : BOXA.y + BOXA.h * dp;
    pressed = frame >= T.aDraw[0] && frame < T.aDraw[1];
  } else if (frame >= T.bApproach[0] && frame < T.bCard[0]) {
    const dp = boxBP;
    const ap = clampInterp(frame, [T.bApproach[0], T.bApproach[1]], [0, 1], EASE);
    const sx = interpolate(ap, [0, 1], [BOXA.x + 100, BOXB.x], { extrapolateRight: "clamp" });
    const sy = interpolate(ap, [0, 1], [BOXA.y - 80, BOXB.y], { extrapolateRight: "clamp" });
    cx = frame < T.bDraw[0] ? sx : BOXB.x + BOXB.w * dp;
    cy = frame < T.bDraw[0] ? sy : BOXB.y + BOXB.h * dp;
    pressed = frame >= T.bDraw[0] && frame < T.bDraw[1];
  } else if (frame >= S.merge[0] && frame < S.start[0]) {
    // 지문2 체크박스 → 지문3 체크박스 → "한 지문으로 합치기" 버튼.
    // 타깃은 실제 렌더 좌표(cbCenter/MERGE_BTN). 커서 꼬리표가 정확히 그 위에 떨어진다.
    const cb2 = cbCenter(1); // 두 번째 카드(지문 2)
    const cb3 = cbCenter(2); // 세 번째 카드(지문 3)
    if (frame < T.check2[1]) {
      const p = clampInterp(frame, [S.merge[0], T.check2[1]], [0, 1], EASE);
      cx = interpolate(p, [0, 1], [BOXB.x + 120, cb2.x]);
      cy = interpolate(p, [0, 1], [BOXB.y, cb2.y]);
      pressed = frame >= T.check2[1] - 7;
    } else if (frame < T.check3[1]) {
      const p = clampInterp(frame, [T.check2[1], T.check3[1]], [0, 1], EASE);
      cx = interpolate(p, [0, 1], [cb2.x, cb3.x]);
      cy = interpolate(p, [0, 1], [cb2.y, cb3.y]);
      pressed = frame >= T.check3[1] - 7;
    } else {
      const p = clampInterp(frame, [T.check3[1], T.btnClick[0]], [0, 1], EASE);
      cx = interpolate(p, [0, 1], [cb3.x, MERGE_BTN.x]);
      cy = interpolate(p, [0, 1], [cb3.y, MERGE_BTN.y]);
      pressed = frame >= T.btnClick[0] && frame < T.btnClick[1];
    }
  } else if (frame >= S.start[0]) {
    const p = clampInterp(frame, [T.startApproach[0], T.startApproach[1]], [0, 1], EASE);
    cx = interpolate(p, [0, 1], [MERGE_BTN.x, START_BTN.x]);
    cy = interpolate(p, [0, 1], [MERGE_BTN.y, START_BTN.y]);
    pressed = frame >= T.startClick[0] && frame < T.startClick[1];
  }

  // 드롭존(장면1) → 보드 전환
  const boardReveal = clampInterp(frame, [S.add[1] - 22, S.add[1]], [0, 1], EASE);

  return (
    <AbsoluteFill style={{ background: C.white, fontFamily: FONT }}>
      <Caption step={cap.step} title={cap.title} sub={cap.sub} frame={frame} since={cap.since} />

      {/* 장면 1: 드롭존 + 떨어지는 파일 (보드로 크로스페이드) */}
      {frame < S.add[1] ? (
        <AbsoluteFill style={{ opacity: 1 - boardReveal }}>
          <AddScene frame={frame} fps={fps} />
        </AbsoluteFill>
      ) : null}

      {/* 보드 (장면 2~) */}
      <div style={{ opacity: boardReveal }}>
        {/* 좌: 시험지 캔버스 */}
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
          <ExamPaper />
          {/* 크롭 박스들 */}
          {frame >= T.c1Draw[0] ? (
            <CropBox rect={BOX1} progress={box1P} label="지문 1" tone={frame >= T.c1Draw[1] ? "done" : "active"} />
          ) : null}
          {frame >= T.aDraw[0] ? (
            <CropBox rect={BOXA} progress={boxAP} label={merged ? "지문 2" : "지문 2"} tone={frame >= T.aDraw[1] ? "done" : "active"} />
          ) : null}
          {frame >= T.bDraw[0] ? (
            <CropBox rect={BOXB} progress={boxBP} label={merged ? "지문 2" : "지문 3"} tone={frame >= T.bDraw[1] ? "done" : "active"} />
          ) : null}
          {/* 나뉜 지문 연결 안내 (split 장면) */}
          {frame >= T.bCard[0] && frame < S.merge[1] ? (
            <SplitConnector opacity={clampInterp(frame, [T.bCard[0], T.bCard[1]], [0, 1])} pulse={frame} />
          ) : null}
        </div>

        {/* 우: 추출될 지문 패널 */}
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
          <PanelChrome count={panelCount} selected={selected} glow={glow} />
          <div style={{ flex: 1, padding: 12, display: "grid", gap: 10, alignContent: "start", background: "rgba(248,250,252,0.5)" }}>
            {!visible1 && !visibleA && !visibleB && !merged ? (
              <div style={{ textAlign: "center", color: C.slate400, fontSize: 11, padding: "40px 10px", lineHeight: 1.6 }}>
                왼쪽 이미지에서 영역을 그리면
                <br />
                추출될 지문이 여기에 표시됩니다.
              </div>
            ) : null}
            {visible1 ? (
              <PassageCard
                rank={1}
                subtitle="1장에서 자른 지문"
                pieces={[["We are taught from an early age that", '"sharing is caring." The sharing economy', "sounds like a good thing.", 0.7, 0.5]]}
                checked={false}
                pop={card1Pop}
                h={CARD_H}
              />
            ) : null}
            {visibleA ? (
              <PassageCard
                rank={2}
                subtitle="1장에서 자른 지문"
                pieces={[["Former U.S. Secretary of Labor Robert", "Reich calls this the share-the-scraps", "economy.", 0.6]]}
                checked={check2}
                pop={cardAPop}
                h={CARD_H}
              />
            ) : null}
            {visibleB ? (
              <PassageCard
                rank={3}
                subtitle="1장에서 자른 지문"
                pieces={[["The gig economy promised extra income,", "an opportunity to monetize downtime,", "Reich points out.", 0.5]]}
                checked={check3}
                pop={cardBPop}
                h={CARD_H}
              />
            ) : null}
            {merged ? (
              <PassageCard
                rank={2}
                subtitle="2개 영역을 이어붙인 지문"
                pieces={[
                  ["Former U.S. Secretary of Labor Robert", "Reich calls this the share-the-scraps", "economy.", 0.6],
                  ["The gig economy promised extra income,", "an opportunity to monetize downtime,", "Reich points out.", 0.5],
                ]}
                checked={false}
                pop={mergeP}
              />
            ) : null}
          </div>
        </div>

        {/* 푸터: 추출 시작 버튼 */}
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
              color: "#fff",
              fontFamily: FONT,
              fontSize: 14,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow:
                frame >= T.startApproach[1] && frame < T.toast[0]
                  ? `0 0 0 5px rgba(37,99,235,0.30)`
                  : "0 6px 16px rgba(37,99,235,0.25)",
              transform: `scale(${frame >= T.startClick[0] && frame < T.startClick[1] ? 0.97 : 1})`,
            }}
          >
            ▶ 추출 시작 {panelCount > 0 ? `(지문 ${panelCount}개)` : ""}
          </div>
        </div>
        {/* 좌측 푸터: 더 추가 */}
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
          ＋ 이미지·PDF 더 추가
        </div>
      </div>

      <TutorialTaskQueue
        frame={frame}
        startFrame={T.toast[0]}
        fps={TUT_FPS}
        taskTitle="지문 2개 추출"
        taskMeta="백그라운드 OCR 처리 대기"
      />

      {/* 커서 — svg 꼭짓점이 타깃(cx,cy)에 정확히 닿도록 좌상으로 보정 */}
      {frame >= T.c1Approach[0] ? (
        <Cursor x={cx - CURSOR_TIP.dx} y={cy - CURSOR_TIP.dy} pressed={pressed} />
      ) : null}
    </AbsoluteFill>
  );
};

export default CropTutorialVideo;
