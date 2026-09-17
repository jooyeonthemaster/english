// 챕터 7 「배포와 확인」 — 문구 정본: .tmp-studio-tour/spec.md §2 CH7 (자구 변형 금지)
import type { TourStepDef } from "../types";

export const CH7_STEPS: TourStepDef[] = [
  {
    id: "ch7-dossier",
    chapter: "deploy",
    view: "passages",
    anchor: 'aside[data-panel-key="dossier"]',
    title: "오른쪽 현황판을 다시 봐 주세요",
    body: "목록에서 지문을 고르면 그 지문의 학습지·문제가 얼마나 만들어졌는지 이곳에 정리됩니다. 지문을 펼치면 만든 자료를 바로 열어 볼 수도 있습니다.",
    placement: "left",
  },
  {
    id: "ch7-students",
    chapter: "deploy",
    // 앵커 개정(적대검수 확정): 구 앵커(레일 aside)는 클래스 선택 후 상시
    // 접혀 100% 강등이었다 — 상존하는 ①칩으로 교체. 카카오톡 초대장 문구는
    // §M off(기본)에서 실존하지 않는 동선이라 삭제(적대검수 확정 major).
    anchor: '[data-tour="step-chip-target"]',
    title: "학생 등록도 클래스 공간에서 합니다",
    body: "왼쪽 위 「대상」 표시를 눌러 클래스 공간을 열고, 클래스 이름 옆 메뉴에서 학생을 추가합니다. 등록한 학생 명단이 결과 확인의 기본이 됩니다.",
    placement: "bottom",
  },
  {
    id: "ch7-strip",
    chapter: "deploy",
    anchor: '[data-tour="step-strip"]',
    title: "진행 단계는 늘 위에 있습니다",
    body: "대상을 고르고, 자료를 만들고, 조판한다 — 이 세 단계만 기억하시면 됩니다. 어느 화면에 있든 이 표시가 현재 위치를 알려 줍니다.",
    placement: "bottom",
  },
  {
    id: "ch7-relaunch",
    chapter: "deploy",
    anchor: "[data-tour-launcher]",
    title: "이 안내는 언제든 다시 볼 수 있습니다",
    body: "위쪽의 「튜토리얼」 버튼을 누르면 처음부터 다시 안내해 드립니다. 궁금한 부분만 챕터로 골라 볼 수도 있습니다.",
    placement: "bottom",
  },
];
