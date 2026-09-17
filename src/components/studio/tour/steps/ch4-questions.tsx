// 챕터 4 「실전 문제 생성」 — 문구 정본: .tmp-studio-tour/spec.md §2 CH4 (자구 변형 금지)
import { DemoQuestionGen } from "../demo/demo-question-gen";
import { DemoQueue } from "../demo/demo-queue";
import type { TourStepDef } from "../types";

export const CH4_STEPS: TourStepDef[] = [
  {
    id: "ch4-cta",
    chapter: "questions",
    view: "passages",
    anchor: '[data-generate-tour="row-generate-button"]',
    title: "「실전 문제 생성」을 누릅니다",
    body: "학습지와 똑같이, 지문을 체크한 뒤 이 버튼을 누르면 됩니다. 유형을 고르는 창이 열립니다.",
    placement: "top",
  },
  {
    id: "ch4-types",
    chapter: "questions",
    view: "passages",
    title: "유형을 고르고 문항 수를 정합니다",
    body: "수능·모의고사 객관식, 내신 서술형, 어휘까지 유형별로 골라 담습니다. 더하기를 누를 때마다 문항 수가 올라가고, 난이도도 기본·중급·킬러 중에 정할 수 있습니다. 아래에서 직접 눌러 보세요.",
    demo: { kind: "stage", render: () => <DemoQuestionGen mode="types" /> },
  },
  {
    id: "ch4-queue",
    chapter: "questions",
    view: "passages",
    anchor: 'aside[data-panel-key="dossier"]',
    title: "문제도 같은 자리에서 생성됩니다",
    body: "유형과 문항 수가 표시된 채 큐가 돌아갑니다. 지문마다 따로 진행되니 여러 지문을 한 번에 맡겨도 됩니다.",
    placement: "left",
    demo: { kind: "overlay", render: () => <DemoQueue variant="questions-running" /> },
  },
  {
    id: "ch4-result",
    chapter: "questions",
    view: "passages",
    title: "완성된 문제는 이렇게 생겼습니다",
    body: "발문·선택지·정답·해설까지 갖춘 문제가 지문마다 정리됩니다. 이제 재료가 다 모였습니다 — 조판으로 가겠습니다.",
    demo: { kind: "stage", render: () => <DemoQuestionGen mode="results" /> },
  },
];
