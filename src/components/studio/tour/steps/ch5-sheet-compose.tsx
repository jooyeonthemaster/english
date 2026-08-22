// 챕터 5 「학습지 조판」 — 문구 정본: .tmp-studio-tour/spec.md §2 CH5 (자구 변형 금지)
// E25 계약: 체크 = 즉시 조판. 「버튼을 누르세요」 류 문구 금지(스펙 §5-6).
import { DemoCompose } from "../demo/demo-compose";
import type { TourStepDef } from "../types";

export const CH5_STEPS: TourStepDef[] = [
  {
    id: "ch5-pill",
    chapter: "sheet-compose",
    anchor: 'button[data-asset-view="sheet"]',
    title: "「학습지 조판」 탭입니다",
    body: "만든 학습지를 인쇄물로 완성하는 곳입니다. 탭을 누르는 순간 왼쪽에 재료 목록, 오른쪽에 조판 화면이 준비됩니다.",
    placement: "bottom",
  },
  {
    id: "ch5-list",
    chapter: "sheet-compose",
    view: "sheet",
    anchor: '[data-tour="composer-list"]',
    title: "왼쪽 목록에 재료가 모여 있습니다",
    body: "학습지와 문제가 한 목록에 함께 보입니다. 위의 「전체 · 문제 · 학습지」로 종류를 거를 수 있습니다.",
    placement: "right",
  },
  {
    id: "ch5-filter",
    chapter: "sheet-compose",
    view: "sheet",
    anchor: '[data-tour="composer-passage-filter"]',
    title: "지문별로 모아 볼 수 있습니다",
    body: "지문 필터를 고르면 그 지문의 학습지와 문제만 남습니다. 지문 하나를 끝까지 만들 때 특히 편합니다.",
    placement: "bottom",
  },
  {
    id: "ch5-check",
    chapter: "sheet-compose",
    view: "sheet",
    // 앵커 개정(적대검수): 직전 스텝과 같은 판 전체 대신 학습지 행 하나를
    // 비춰 스텝 전환이 눈에 보이게 한다(w: 행 부재 시 center 폴백).
    anchor: 'div[data-drag-item-id^="w:"]',
    title: "체크하면 그 순간 조판됩니다",
    body: "학습지를 체크하는 순간 오른쪽에 바로 펼쳐집니다. 따로 버튼을 누를 필요가 없습니다. 여러 개를 체크하면 체크한 순서 그대로 한 묶음이 됩니다.",
    padding: 6,
  },
  {
    id: "ch5-combine",
    chapter: "sheet-compose",
    view: "sheet",
    title: "학습지 뒤에 문제를 이어 붙입니다",
    body: "이 기능이 학습지 조판의 백미입니다. 학습지와 문제를 함께 체크하면, 학습지 뒤에 문제 페이지가 이어 붙어 A4 한 묶음으로 완성됩니다. 아래 예시에서 문제를 붙였다 떼며 확인해 보세요.",
    demo: { kind: "stage", render: () => <DemoCompose mode="combine" /> },
  },
  {
    id: "ch5-activity",
    chapter: "sheet-compose",
    view: "sheet",
    title: "단어 시험지·빈칸·영작도 붙일 수 있습니다",
    body: "조판 화면 왼쪽의 학습 활동 패널에서 고릅니다. 지문 단어로 만드는 단어 시험지, 키워드 빈칸, 끊어읽기·백지 영작, 어순 배열까지 — 추가 비용 없이 그 자리에서 만들어집니다.",
    demo: { kind: "stage", render: () => <DemoCompose mode="activity" /> },
  },
  {
    id: "ch5-print",
    chapter: "sheet-compose",
    view: "sheet",
    title: "완성되면 저장하고 인쇄합니다",
    body: "오른쪽 위의 저장·인쇄 버튼으로 마무리합니다. 문항 정답표도 한 번에 붙일 수 있어 채점까지 편해집니다.",
    demo: { kind: "stage", render: () => <DemoCompose mode="print" /> },
  },
];
