// 챕터 6 「시험지 조판」 — 문구 정본: .tmp-studio-tour/spec.md §2 CH6 (자구 변형 금지)
import { DemoExamLayout } from "../demo/demo-exam-layout";
import type { TourStepDef } from "../types";

export const CH6_STEPS: TourStepDef[] = [
  {
    id: "ch6-pill",
    chapter: "exam-compose",
    anchor: 'button[data-asset-view="exam"]',
    title: "이번에는 「시험지 조판」입니다",
    body: "만든 문제로 실전 시험지를 완성하는 곳입니다. 학습지 조판과 같은 방식이라 금방 익숙해지실 겁니다.",
    placement: "bottom",
  },
  {
    id: "ch6-list",
    chapter: "exam-compose",
    view: "exam",
    anchor: '[data-tour="composer-list"]',
    title: "여기는 문제만 모입니다",
    body: "시험지의 재료는 문제이므로 왼쪽 목록에 문제만 보입니다. 유형·난이도·킬러 여부로 걸러 원하는 문제를 빠르게 찾을 수 있습니다.",
    placement: "right",
  },
  {
    id: "ch6-check",
    chapter: "exam-compose",
    view: "exam",
    // 앵커 개정(적대검수): 직전 스텝과 같은 판 전체 대신 문항 행 하나를 비춘다.
    anchor: 'div[data-drag-item-id^="q:"]',
    title: "체크한 순서가 문항 번호가 됩니다",
    body: "문제를 체크하는 순간 오른쪽 시험지에 실시간으로 배치됩니다. 1번부터 순서대로 — 체크 순서를 바꾸면 번호도 따라 바뀝니다.",
    padding: 6,
  },
  {
    id: "ch6-layout",
    chapter: "exam-compose",
    view: "exam",
    title: "시험지 모양을 마음대로 바꿉니다",
    body: "실제 내신 시험지처럼 2단으로 짜거나, 큼직한 1단으로 바꾸거나, 용지를 A4·B4 중에 고를 수 있습니다. 아래 미리보기에서 직접 눌러 보세요 — 배치가 그 자리에서 다시 계산됩니다.",
    demo: { kind: "stage", render: () => <DemoExamLayout mode="layout" /> },
  },
  {
    id: "ch6-settings",
    chapter: "exam-compose",
    view: "exam",
    title: "세부 설정도 준비되어 있습니다",
    body: "배점 자동 배분, 표지 페이지, 학원 로고, 문항 메타 표시까지 — 오른쪽 「시험지 설정」 패널에서 전부 조절합니다.",
    demo: { kind: "stage", render: () => <DemoExamLayout mode="settings" /> },
  },
  {
    id: "ch6-export",
    chapter: "exam-compose",
    view: "exam",
    title: "인쇄부터 파일 저장까지",
    body: "완성한 시험지는 인쇄하거나 PDF·워드·한글 파일로 내려받을 수 있습니다. 해설지도 같은 자리에서 뽑습니다.",
    demo: { kind: "stage", render: () => <DemoExamLayout mode="export" /> },
  },
];
