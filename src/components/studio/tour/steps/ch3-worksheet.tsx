// 챕터 3 「학습지 생성」 — 감독 견본 챕터.
// 문구 정본: .tmp-studio-tour/spec.md §2 CH3 (자구 변형 금지).
// 큐 스팟 스텝(ch3-queue·ch3-done)은 지시의 핵심이다: 화면을 딤으로 가리고
// 우측 현황판 자리에 큐 목업 오버레이를 얹어 시선을 고정한다.
import { DemoQueue } from "../demo/demo-queue";
import { DemoWorksheet } from "../demo/demo-worksheet";
import type { TourStepDef } from "../types";

export const CH3_STEPS: TourStepDef[] = [
  {
    id: "ch3-select",
    chapter: "worksheet",
    view: "passages",
    // 앵커 개정(적대검수 확정 major): 구 앵커(passage-card-checkbox)는 스튜디오
    // 행 모드에서 값이 갈려(learning/review 변형) 실 흐름에서 한 번도 잠기지
    // 않았다 — 첫 행 전체(passage-card, ch2-rows 에서 잠김 실증)를 비춘다.
    anchor: '[data-generate-tour="passage-card"]',
    title: "먼저 지문을 체크합니다",
    body: "학습지로 만들 지문을 목록에서 체크해 주세요. 여러 개를 한 번에 골라도 됩니다 — 드래그로 쓸어 담을 수도 있습니다.",
    padding: 10,
  },
  {
    id: "ch3-cta",
    chapter: "worksheet",
    view: "passages",
    anchor: '[data-tour="cta-sheet-generate"]',
    title: "「학습지 생성」을 누릅니다",
    body: "체크한 지문 수가 버튼에 표시됩니다. 누르면 학습지 구성을 고르는 창이 열립니다.",
    placement: "top",
  },
  {
    id: "ch3-products",
    chapter: "worksheet",
    view: "passages",
    title: "세 가지 구성 중에 고릅니다",
    body: "기본 학습지는 원문 분석·어법·어휘·구문까지 담은 표준 구성입니다. 실전 학습지 포함은 여기에 워크북과 수능형 추론 5문항을 더합니다. 파이널 원페이지는 시험 직전용 요약 한 장입니다. 구성마다 지문당 차감되는 크레딧이 함께 표시되어 비용을 미리 알 수 있습니다. 아래에서 눌러 보며 비교해 보세요.",
    demo: { kind: "stage", render: () => <DemoWorksheet /> },
  },
  {
    id: "ch3-queue",
    chapter: "worksheet",
    view: "passages",
    anchor: 'aside[data-panel-key="dossier"]',
    title: "생성이 시작되면 오른쪽을 보세요",
    body: "이렇게 생성 큐가 실시간으로 돌아갑니다. 어떤 지문이 어느 단계인지, 얼마나 걸리는지 모두 표시됩니다. 기다리는 동안 다른 작업을 하셔도 됩니다 — 완성되면 알려 드립니다.",
    placement: "left",
    demo: { kind: "overlay", render: () => <DemoQueue variant="sheet-running" /> },
  },
  {
    id: "ch3-done",
    chapter: "worksheet",
    view: "passages",
    anchor: 'aside[data-panel-key="dossier"]',
    title: "완성되면 이 자리에 도착합니다",
    body: "방금 만든 학습지가 목록에 정리되고, 위쪽 「학습지 조판」 탭에 개수가 표시됩니다. 화면의 안내를 따라 체크만 하면 바로 조판으로 이어집니다.",
    placement: "left",
    demo: { kind: "overlay", render: () => <DemoQueue variant="sheet-done" /> },
  },
  // ch3-bridge 는 적대검수 확정으로 삭제됐다(ch4-cta 와 같은 앵커·같은 교훈의
  // 중복 — 두 스텝이 연속으로 같은 버튼을 비추며 「다음」이 무반응처럼 보였다).
];
