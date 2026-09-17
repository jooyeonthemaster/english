// 챕터 1 「한눈에 보기」 — 문구 정본: .tmp-studio-tour/spec.md §2 CH1 (자구 변형 금지)
import type { TourStepDef } from "../types";

export const CH1_STEPS: TourStepDef[] = [
  // 순서 계약: tree 가 pillars 보다 먼저다 — pillars 스텝의 view 보장이 클래스
  // 퀵 선택을 실클릭하면 레일이 자동 접힘(§3.10.12)이라, 접히기 전에 레일을
  // 먼저 비춘다(견본 스모크 실측으로 확정한 순서).
  {
    id: "ch1-tree",
    chapter: "overview",
    anchor: 'aside[data-panel-key="tree"]',
    title: "왼쪽은 클래스 공간입니다",
    body: "모든 작업은 클래스 단위로 진행됩니다. 여기서 클래스를 만들고 학생을 등록합니다. 클래스를 선택하면 이 영역은 자동으로 접혀 작업 공간이 넓어집니다.",
    placement: "right",
  },
  {
    id: "ch1-pillars",
    chapter: "overview",
    view: "passages",
    anchor: '[data-tour="asset-pills"]',
    title: "화면은 딱 세 곳만 기억하시면 됩니다",
    body: "위쪽의 세 탭이 작업의 전부입니다. 「지문관리」에서 지문을 모으고, 「학습지 조판」에서 학습지를 만들고, 「시험지 조판」에서 시험지를 완성합니다. 지금부터 이 순서 그대로 차근차근 안내해 드리겠습니다.",
    placement: "bottom",
  },
  {
    id: "ch1-dossier",
    chapter: "overview",
    anchor: 'aside[data-panel-key="dossier"]',
    title: "오른쪽은 현황판입니다",
    body: "선택한 지문의 상세 현황, 생성 진행 상황, 완성된 자료가 모두 이곳에 모입니다. 잠시 후 학습지를 만들 때 이 자리에서 진행 과정을 실시간으로 보게 됩니다.",
    placement: "left",
  },
  {
    id: "ch1-step-strip",
    chapter: "overview",
    anchor: '[data-tour="step-strip"]',
    title: "지금 어디까지 왔는지 늘 알려 드립니다",
    body: "상단의 「대상 → 자료 → 조판」 단계 표시가 현재 진행 위치를 보여 줍니다. 길을 잃어도 이 표시만 보면 됩니다.",
    placement: "bottom",
  },
];
