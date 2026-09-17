// 챕터 2 「지문 등록」 — 문구 정본: .tmp-studio-tour/spec.md §2 CH2 (자구 변형 금지)
import { DemoCrop } from "../demo/demo-crop";
import { DemoRegister } from "../demo/demo-register";
import type { TourStepDef } from "../types";

export const CH2_STEPS: TourStepDef[] = [
  {
    id: "ch2-intro",
    chapter: "register",
    view: "passages",
    // 앵커 개정(적대검수 확정): 구 앵커(레일 「새 클래스」)는 투어의 클래스
    // 자동 선택이 레일을 접는 순간(§3.10.12) 상시 소실됐다 — 접힘 뒤에도
    // 상존하는 ①칩(step-chip-target)이 클래스 공간의 유일한 안정 앵커다.
    anchor: '[data-tour="step-chip-target"]',
    title: "첫걸음은 클래스입니다",
    body: "모든 자료는 클래스에 담깁니다. 아직 클래스가 없다면 「새 클래스」로 하나 만들어 주세요 — 이름 하나면 충분합니다. 왼쪽 위 「대상」 표시를 누르면 언제든 클래스 공간을 여닫을 수 있습니다.",
    placement: "bottom",
  },
  {
    id: "ch2-add",
    chapter: "register",
    view: "passages",
    anchor: '[data-tour="add-passage"]',
    title: "지문은 여기서 추가합니다",
    body: "「지문 추가」를 누르면 세 가지 방법이 열립니다. 본문을 직접 붙여넣거나, PDF·이미지 파일에서 추출하거나, 기출 지문에서 골라 담을 수 있습니다. 하나씩 보여 드리겠습니다.",
    placement: "bottom",
  },
  {
    id: "ch2-paste",
    chapter: "register",
    view: "passages",
    title: "첫 번째 — 직접 입력",
    body: "가장 빠른 방법입니다. 가지고 있는 본문을 붙여넣으면 지문으로 바로 등록됩니다. 여러 지문을 한 번에 붙여넣어도 자동으로 나뉘어 담깁니다. 아래는 실제 화면과 같은 예시입니다.",
    demo: { kind: "stage", render: () => <DemoRegister mode="paste" /> },
  },
  {
    id: "ch2-crop",
    chapter: "register",
    view: "passages",
    title: "두 번째 — PDF·이미지에서 오려 내기",
    body: "파일을 올리면 원하는 영역만 드래그해서 지문으로 만들 수 있습니다. 아래에서 직접 드래그해 보세요 — 선택 영역의 위치와 크기가 실시간으로 계산되는 것을 보실 수 있습니다. Shift 를 누른 채 그리면 떨어진 영역도 한 지문으로 이어집니다.",
    demo: { kind: "stage", render: () => <DemoCrop /> },
  },
  {
    id: "ch2-exam",
    chapter: "register",
    view: "passages",
    title: "세 번째 — 기출 지문에서 가져오기",
    body: "학교·연도별 기출 시험지에서 지문을 골라 담습니다. 고른 지문은 지금 선택한 클래스의 지문관리로 바로 들어옵니다.",
    demo: { kind: "stage", render: () => <DemoRegister mode="exam" /> },
  },
  {
    id: "ch2-rows",
    chapter: "register",
    view: "passages",
    anchor: '[data-generate-tour="passage-card"]',
    title: "등록한 지문은 목록에 쌓입니다",
    body: "각 줄이 지문 하나입니다. 체크해서 고르고, 연필 모양을 누르면 그 자리에서 본문을 수정할 수 있습니다. 잘못 붙은 부분을 고치거나 문단을 다듬는 것도 모두 여기서 됩니다.",
    padding: 10,
  },
  {
    id: "ch2-scope",
    chapter: "register",
    view: "passages",
    // 앵커 개정(적대검수): 문구가 「두 버튼」을 말하므로 쌍 컨테이너를 비춘다.
    anchor: '[data-tour="cta-generate-pair"]',
    title: "다음은 생성입니다",
    body: "지문을 체크하면 아래 두 버튼이 살아납니다. 왼쪽은 학습지, 오른쪽은 실전 문제입니다. 바로 이어서 학습지부터 만들어 보겠습니다.",
    placement: "top",
  },
];
