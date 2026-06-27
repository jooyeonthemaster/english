"use client";

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TutorialTaskQueue } from "./tutorial-task-queue";
import { C, CROP_BOX, CURSOR_TIP, EASE, FONT, LEFT, PAPER, RESTORE_TUT_FPS, RIGHT, S, START_BTN, T, clampInterp } from "./restore-tutorial-video-constants";
import { Caption, CropBox, Cursor, PanelChrome } from "./restore-tutorial-video-primitives";
import { AddScene, ExamPaper, RestoreCard } from "./restore-tutorial-video-scenes";

export {
  RESTORE_TUT_FPS,
  RESTORE_TUT_H,
  RESTORE_TUT_TOTAL,
  RESTORE_TUT_W,
} from "./restore-tutorial-video-constants";
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
