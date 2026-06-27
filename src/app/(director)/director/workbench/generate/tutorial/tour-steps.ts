import type { TourMode, TourStep } from "./tour-types";

export const DIRECT_TOUR_STEPS: TourStep[] = [
  {
    title: "1강. 직접입력으로 문제를 만들어봅니다",
    body: "이번 튜토리얼은 문제 생성 흐름을 강의처럼 나눠 안내합니다. 먼저 텍스트를 직접 넣어 문제를 생성하고, 각 강의 끝에서 다음 강의를 이어갈지 선택할 수 있습니다.",
    video: "overview",
    targets: ["page-title"],
  },
  {
    title: "직접 입력 탭을 직접 눌러주세요",
    body: "상단의 직접 입력 버튼을 눌러 텍스트 입력 화면을 엽니다. 이 버튼을 실제로 눌러야 다음 단계가 열립니다.",
    video: "paste",
    targets: ["intake-paste", "intake-tabs"],
    glowTargets: ["intake-paste"],
    required: {
      milestone: "paste-tab-opened",
      waitingLabel: "상단의 직접 입력 버튼을 눌러주세요.",
      doneLabel: "직접 입력 화면이 열렸습니다.",
    },
  },
  {
    title: "첫 번째 예문을 입력창에 넣어봅니다",
    body: "직접입력 실습용 첫 번째 예문을 자동으로 넣을 수 있습니다. 아래 버튼을 누르면 제목과 본문이 채워지고, 다음 단계에서 지문 추가를 직접 누르게 됩니다.",
    video: "paste",
    targets: ["paste-board"],
    glowTargets: ["tour-sample-text-button"],
    demo: {
      type: "sample-text",
      label: "첫 번째 예문 입력하기",
      description:
        "예문은 튜토리얼 연습용입니다. 이전 단계로 돌아가면 자동으로 비워집니다.",
      sampleIndex: 0,
    },
    required: {
      milestone: "sample-text-filled",
      waitingLabel: "첫 번째 예문 입력하기를 눌러 입력창을 채워주세요.",
      doneLabel: "첫 번째 예문이 입력되었습니다.",
    },
  },
  {
    title: "첫 번째 예문을 지문 추가로 목록에 쌓습니다",
    body: "입력창 아래의 지문 추가 버튼을 직접 눌러주세요. 첫 번째 예문이 오른쪽 등록 목록으로 이동해야 다음 단계로 갈 수 있습니다.",
    video: "paste",
    targets: ["paste-add-button", "paste-board"],
    glowTargets: ["paste-add-button"],
    required: {
      milestone: "paste-draft-added",
      waitingLabel: "지문 추가 버튼을 눌러 첫 번째 예문을 목록에 넣어주세요.",
      doneLabel: "첫 번째 예문이 등록 목록에 추가되었습니다.",
    },
  },
  {
    title: "두 번째 예문도 입력창에 넣어봅니다",
    body: "문제 생성 실습은 지문 2개를 기준으로 진행합니다. 아래 버튼으로 두 번째 예문을 넣고, 다음 단계에서 다시 지문 추가를 눌러주세요.",
    video: "paste",
    targets: ["paste-board"],
    glowTargets: ["tour-sample-text-button"],
    demo: {
      type: "sample-text",
      label: "두 번째 예문 입력하기",
      description:
        "첫 번째 예문은 오른쪽 등록 목록에 남아 있고, 두 번째 예문은 왼쪽 입력창에 채워집니다.",
      sampleIndex: 1,
    },
    required: {
      milestone: "sample-text-filled",
      waitingLabel: "두 번째 예문 입력하기를 눌러 입력창을 채워주세요.",
      doneLabel: "두 번째 예문이 입력되었습니다.",
    },
  },
  {
    title: "두 번째 예문까지 지문 추가로 목록에 쌓습니다",
    body: "지문 추가 버튼을 한 번 더 눌러주세요. 두 예시 지문이 모두 오른쪽 등록 목록에 들어와야 다음 단계로 넘어갑니다.",
    video: "paste",
    targets: ["paste-add-button", "paste-board"],
    glowTargets: ["paste-add-button"],
    required: {
      milestone: "paste-two-drafts-added",
      waitingLabel: "두 번째 예문도 지문 추가 버튼으로 목록에 넣어주세요.",
      doneLabel: "예시 지문 2개가 모두 등록 목록에 추가되었습니다.",
    },
  },
  {
    title: "지문 등록하고 선택을 눌러 저장합니다",
    body: "오른쪽 목록에 쌓인 예시 지문 2개를 내 지문으로 저장합니다. 아래의 지문 등록하고 선택 버튼을 누르고 저장이 끝날 때까지 기다려주세요.",
    video: "paste",
    targets: ["paste-register-button", "paste-board"],
    glowTargets: ["paste-register-button"],
    required: {
      milestone: "paste-registered",
      waitingLabel: "지문 등록하고 선택 버튼을 눌러 저장을 완료해주세요.",
      doneLabel: "지문이 저장되고 생성 대상으로 선택되었습니다.",
    },
  },
  {
    title: "유형 지정 모드로 생성 방식을 맞춥니다",
    body: "오른쪽 유형·생성 설정에서 유형 지정 탭을 눌러주세요. 문제 유형을 직접 고른 뒤 생성하는 흐름을 먼저 익힙니다.",
    video: "results",
    targets: ["generation-mode-manual", "generation-mode"],
    glowTargets: ["generation-mode-manual"],
    required: {
      milestone: "generation-mode-manual-opened",
      waitingLabel: "오른쪽 설정에서 유형 지정 탭을 눌러주세요.",
      doneLabel: "유형 지정 모드가 선택되었습니다.",
    },
  },
  {
    title: "생성할 문제 유형을 하나 선택합니다",
    body: "문제 유형 목록에서 원하는 유형의 + 버튼을 눌러 1문제를 추가하세요. 유형이 하나 이상 지정되어야 생성 버튼을 누를 수 있습니다.",
    video: "results",
    targets: ["type-add-button", "type-list"],
    glowTargets: ["type-add-button"],
    required: {
      milestone: "generation-type-selected",
      waitingLabel: "문제 유형 목록에서 + 버튼을 눌러 유형을 추가해주세요.",
      doneLabel: "생성할 문제 유형이 지정되었습니다.",
    },
  },
  {
    title: "직접입력 지문으로 문제 생성을 시작합니다",
    body: "이제 오른쪽의 생성 버튼을 직접 누르세요. 버튼을 누른 뒤 문제 생성 요청이 완료되어 결과 영역에 작업 또는 결과가 나타나야 다음 단계로 넘어갑니다.",
    video: "results",
    targets: ["generate-button", "generation-mode"],
    glowTargets: ["generate-button"],
    required: {
      milestone: "question-generation-completed",
      startedMilestone: "question-generation-started",
      waitingLabel: "생성 버튼을 누르고 처리 완료를 기다려주세요.",
      startedLabel:
        "생성 요청이 접수되었습니다. 결과가 만들어질 때까지 기다려주세요.",
      doneLabel: "직접입력 지문으로 문제 생성이 시작/완료되었습니다.",
    },
  },
  {
    title: "방금 생성된 2문제 중 첫 번째를 열어봅니다",
    body: "생성/검수 결과에서 방금 만든 2문제만 강조해두었습니다. 그중 첫 번째 문제 카드를 더블클릭하거나 우측 하단 상세 버튼을 눌러 상세보기를 열어주세요.",
    video: "results",
    targets: ["generated-question-card-first", "results-section"],
    glowTargets: ["generated-question-card-first"],
    resultHighlightCount: 2,
    required: {
      milestone: "question-detail-opened",
      waitingLabel: "강조된 첫 번째 문제 카드를 더블클릭하거나 우측 하단 상세 버튼을 눌러 상세보기를 열어주세요.",
      doneLabel: "문제 상세보기를 확인했습니다.",
    },
  },
  {
    title: "직접 입력 튜토리얼이 끝났습니다",
    body: "직접 입력으로 지문을 넣고, 유형을 지정하고, 생성 결과를 확인하는 흐름을 마쳤습니다. 이어서 이미지·PDF 추출 방식도 실습할 수 있습니다.",
    video: "results",
    targets: ["question-detail-modal"],
    decision: {
      continueLabel: "이미지·PDF 실습 이어가기",
      finishLabel: "여기서 끝내기",
      nextMode: "file",
    },
  },
];

export const FILE_TOUR_STEPS: TourStep[] = [
  {
    title: "2강. 이미지·PDF로 추출해서 다시 생성합니다",
    body: "두 번째 실습은 파일에서 지문을 뽑아 문제를 만드는 흐름입니다. 먼저 상단의 이미지·PDF 버튼을 직접 눌러주세요.",
    video: "file",
    targets: ["intake-upload", "intake-tabs"],
    glowTargets: ["intake-upload"],
    required: {
      milestone: "upload-tab-opened",
      waitingLabel: "상단의 이미지·PDF 버튼을 눌러주세요.",
      doneLabel: "이미지·PDF 화면이 열렸습니다.",
    },
  },
  {
    title: "예시 파일을 업로드 박스에 끌어놓습니다",
    body: "아래 예시 파일을 마우스로 잡고 업로드 박스에 놓으세요. 파일이 들어가 크롭 화면이 준비되어야 다음 단계가 열립니다.",
    video: "file",
    targets: ["upload-dropzone"],
    glowTargets: ["upload-dropzone"],
    cursorPath: {
      from: "tour-sample-file-chip",
      to: "upload-dropzone",
      kind: "drag",
    },
    demo: {
      type: "sample-file",
      description:
        "아래 파일 칩을 잡아 업로드 박스에 드래그&드롭하세요. 실제 이미지 파일처럼 처리됩니다.",
    },
    required: {
      milestone: "file-ready",
      waitingLabel: "예시 파일을 업로드 박스에 끌어놓아주세요.",
      doneLabel: "파일이 들어가 크롭 화면이 준비되었습니다.",
    },
  },
  {
    title: "첫 번째 단을 먼저 드래그합니다",
    body: "예시 지문은 2단으로 나뉘어 있습니다. 먼저 왼쪽 단의 본문만 드래그해 첫 번째 크롭 영역을 만들어주세요.",
    video: "file",
    targets: ["file-crop-board"],
    glowTargets: ["file-crop-board"],
    cropDemo: "first-column",
    required: {
      milestone: "file-crop-first-created",
      waitingLabel:
        "미리보기에서 왼쪽 단 본문을 드래그해 첫 번째 영역을 만들어주세요.",
      doneLabel: "첫 번째 단이 지문 영역으로 지정되었습니다.",
    },
  },
  {
    title: "Shift로 두 번째 단을 같은 지문에 이어붙입니다",
    body: "첫 영역이 선택된 상태에서 Shift를 누른 채 오른쪽 단을 드래그하세요. 두 번째 영역이 별도 지문이 아니라 같은 지문 1개로 이어붙습니다.",
    video: "file",
    targets: ["file-crop-board"],
    glowTargets: ["file-crop-board"],
    cropDemo: "second-column",
    required: {
      milestone: "file-crop-joined",
      waitingLabel:
        "Shift를 누른 채 오른쪽 단 본문을 드래그해 같은 지문에 이어붙여주세요.",
      doneLabel: "두 번째 단이 같은 지문에 이어붙었습니다.",
    },
  },
  {
    title: "합쳐진 지문을 추출합니다",
    body: "추출될 지문이 1개로 정리되면 추출 시작 버튼을 누르세요. 두 영역이 한 지문으로 합쳐진 상태로 내 지문에 추가됩니다.",
    video: "file",
    targets: ["file-extract-button", "file-crop-board"],
    glowTargets: ["file-extract-button"],
    required: {
      milestone: "file-extraction-completed",
      waitingLabel: "추출 시작 버튼을 누르고 완료를 기다려주세요.",
      doneLabel: "파일에서 지문이 추출되어 내 지문에 추가되었습니다.",
    },
  },
  {
    title: "추출된 지문 카드를 선택합니다",
    body: "내 지문 목록에 새로 들어온 지문 카드의 체크박스를 직접 눌러 생성 대상으로 선택하세요.",
    video: "library",
    targets: ["passage-card-checkbox", "passage-card", "library-toolbar"],
    glowTargets: ["passage-card-checkbox"],
    required: {
      milestone: "passage-selected",
      waitingLabel: "지문 카드의 체크박스를 눌러 선택해주세요.",
      doneLabel: "지문이 생성 대상으로 선택되었습니다.",
    },
  },
  {
    title: "추출 지문도 유형 지정으로 생성합니다",
    body: "직접입력 생성 뒤에는 유형 선택이 초기화됩니다. 다시 유형 지정 탭을 눌러 파일에서 추출한 지문에도 유형을 지정할 준비를 해주세요.",
    video: "results",
    targets: ["generation-mode-manual", "generation-mode"],
    glowTargets: ["generation-mode-manual"],
    required: {
      milestone: "generation-mode-manual-opened",
      waitingLabel: "오른쪽 설정에서 유형 지정 탭을 눌러주세요.",
      doneLabel: "유형 지정 모드가 선택되었습니다.",
    },
  },
  {
    title: "추출 지문에 적용할 유형을 선택합니다",
    body: "문제 유형 목록에서 + 버튼을 눌러 추출 지문에 적용할 유형을 하나 추가하세요. 이 선택이 생성 버튼의 문제 수에 반영됩니다.",
    video: "results",
    targets: ["type-add-button", "type-list"],
    glowTargets: ["type-add-button"],
    required: {
      milestone: "generation-type-selected",
      waitingLabel: "문제 유형 목록에서 + 버튼을 눌러 유형을 추가해주세요.",
      doneLabel: "추출 지문에 적용할 문제 유형이 지정되었습니다.",
    },
  },
  {
    title: "추출된 지문으로 문제 생성을 시작합니다",
    body: "오른쪽 생성 버튼을 다시 누르세요. 파일에서 추출한 지문으로 문제 생성 요청이 완료되어야 튜토리얼이 마무리됩니다.",
    video: "results",
    targets: ["generate-button", "generation-mode"],
    glowTargets: ["generate-button"],
    required: {
      milestone: "question-generation-completed",
      startedMilestone: "question-generation-started",
      waitingLabel: "생성 버튼을 누르고 처리 완료를 기다려주세요.",
      startedLabel:
        "생성 요청이 접수되었습니다. 결과가 만들어질 때까지 기다려주세요.",
      doneLabel: "추출 지문으로 문제 생성이 시작/완료되었습니다.",
    },
  },
  {
    title: "방금 생성된 문제 카드를 열어봅니다",
    body: "생성/검수 결과에서 이미지·PDF 추출 지문으로 방금 만든 문제 카드를 강조해두었습니다. 강조된 카드를 더블클릭하거나 우측 하단 상세 버튼을 눌러 상세보기를 열어주세요.",
    video: "results",
    targets: ["generated-question-card-first", "results-section"],
    glowTargets: ["generated-question-card-first"],
    resultHighlightCount: 1,
    required: {
      milestone: "question-detail-opened",
      waitingLabel: "강조된 문제 카드를 더블클릭하거나 우측 하단 상세 버튼을 눌러 상세보기를 열어주세요.",
      doneLabel: "문제 상세보기가 열렸습니다.",
    },
  },
  {
    title: "이미지·PDF 튜토리얼이 끝났습니다",
    body: "파일에서 지문을 추출하고, 유형을 지정하고, 생성된 문제의 상세보기까지 확인했습니다. 이제 같은 방식으로 실제 자료를 올려 문제를 만들 수 있습니다.",
    video: "results",
    targets: ["question-detail-modal"],
    decision: {
      continueLabel: "3강 이어가기",
      finishLabel: "여기서 끝내기",
      nextMode: "generation-details",
    },
  },
];

export const GENERATION_DETAILS_TOUR_STEPS: TourStep[] = [
  {
    title: "3강. 문제 생성 상세 기능을 살펴봅니다",
    body: "이미지·PDF에서 지문을 뽑을 때는 그대로 추출과 AI로 원문 복원 두 흐름이 있습니다. 이 선택은 파일을 올리기 전 출력 방식에서 정합니다.",
    video: "file",
    targets: ["output-mode", "paste-output-mode", "intake-tabs"],
    glowTargets: ["output-mode"],
  },
  {
    title: "그대로 추출은 원본 보존용입니다",
    body: "그대로 추출은 OCR로 읽은 본문을 최대한 그대로 가져옵니다. 시험지·교재 원문을 보존해서 문제를 만들고 싶을 때 적합합니다.",
    video: "file",
    targets: ["output-mode-verbatim", "output-mode", "paste-output-mode"],
    glowTargets: ["output-mode-verbatim", "output-mode"],
    activateOutputMode: "verbatim",
    examples: [
      {
        label: "그대로 추출 비교",
        inputLabel: "원문 입력",
        inputText:
          "A good reader does not simply translate each sentence.\nInstead, the reader checks how ideas connect across the paragraph.",
        outputLabel: "출력 결과",
        outputText:
          "A good reader does not simply translate each sentence.\nInstead, the reader checks how ideas connect across the paragraph.",
      },
      {
        label: "핵심 차이",
        text: "원문이 이미 깨끗하면 줄바꿈과 표현을 최대한 보존해 그대로 가져옵니다.",
      },
    ],
  },
  {
    title: "AI 원문 복원은 문제 지문 복구용입니다",
    body: "AI로 원문 복원은 문제·선지와 섞여 있는 자료에서 본문을 다시 정리할 때 유용합니다. 지문+문제+선지를 함께 잡아도 본문 중심으로 정리됩니다.",
    video: "file",
    targets: ["output-mode-restored", "output-mode", "paste-output-mode"],
    glowTargets: ["output-mode-restored", "output-mode"],
    activateOutputMode: "restored",
    examples: [
      {
        label: "AI 원문 복원 비교",
        inputLabel: "원문 입력",
        inputText:
          "3. 다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?\nA good reader does not simply translate each sentence. Instead, the reader checks how ideas connect across the paragraph.\n① translate each word\n② notice contrast, cause, and result",
        outputLabel: "출력 결과",
        outputText:
          "A good reader does not simply translate each sentence. Instead, the reader checks how ideas connect across the paragraph.",
      },
      {
        label: "핵심 차이",
        text: "문제 번호, 보기, 선지처럼 지문 밖 요소가 섞여 있으면 본문만 골라 읽기 좋은 형태로 복원합니다.",
      },
    ],
  },
  {
    title: "유형 지정은 출제 의도 제어용입니다",
    body: "유형 지정은 선생님이 원하는 문제 유형과 개수를 직접 고르는 방식입니다. 이 단계에 들어오면 화면이 유형 지정 모드로 자동 전환됩니다.",
    video: "results",
    targets: ["generation-mode-manual", "type-list", "generation-mode"],
    glowTargets: ["generation-mode-manual"],
    activateGenerationMode: "manual",
    examples: [
      {
        label: "예시",
        text: "오늘 수업 목표가 연결어라면 빈칸 추론 2문제와 글의 순서 1문제처럼 의도한 유형만 골라 생성합니다.",
      },
    ],
  },
  {
    title: "유형별 + 버튼으로 수량을 정합니다",
    body: "유형 목록의 + 버튼은 해당 유형을 몇 문제 만들지 정하는 곳입니다. 여러 유형을 섞으면 한 지문에서 다양한 관점의 문제를 만들 수 있습니다.",
    video: "results",
    targets: ["type-add-button", "type-list"],
    glowTargets: ["type-add-button"],
    activateGenerationMode: "manual",
    examples: [
      {
        label: "예시",
        text: "빈칸 추론 1개, 어휘 적절성 1개, 내용 일치 1개처럼 수업 목표에 맞춰 유형과 수량을 직접 조합합니다.",
      },
    ],
  },
  {
    title: "유형별 세부 옵션은 토글 안에 있습니다",
    body: "각 유형 행 오른쪽의 펼침 토글을 열면 질문 언어, 보기 언어, 삽입 문장 수, 빈칸 개수처럼 유형별 옵션을 조정할 수 있습니다. 여기서는 직접 열지 않아도 됩니다.",
    video: "results",
    targets: ["type-detail-toggle", "type-list"],
    glowTargets: ["type-detail-toggle"],
    activateGenerationMode: "manual",
    examples: [
      {
        label: "예시",
        text: "순서 삽입은 문장 순서 감각을, 빈칸 추론은 핵심 논리와 어휘 선택을, 어법 판단은 문법 포인트를 집중적으로 확인합니다.",
      },
    ],
  },
  {
    title: "장문 세트는 한 지문에서 묶음 문제를 만듭니다",
    body: "장문 세트는 긴 지문 하나를 기준으로 여러 문항을 세트처럼 구성합니다. 화면은 자동으로 장문 세트 모드로 바뀌며, 사용자가 버튼을 누르지 않아도 설명을 볼 수 있습니다.",
    video: "results",
    targets: ["generation-mode-set", "set-builder-panel", "generation-mode"],
    glowTargets: ["generation-mode-set"],
    activateGenerationMode: "set",
    examples: [
      {
        label: "예시",
        text: "긴 독해 지문 하나에서 제목 추론, 빈칸 추론, 어휘 적절성, 내용 일치처럼 서로 연결된 4문항짜리 세트를 만듭니다.",
      },
      {
        label: "추천 상황",
        text: "모의고사식 긴 지문 한 세트를 만들거나, 한 지문으로 10분짜리 미니 테스트를 구성할 때 적합합니다.",
      },
      {
        label: "구성 방식",
        text: "기준이 되는 구조 유형을 하나 두고, 그 위에 내용 일치·어휘·함축 의미 같은 문항을 묶어 세트처럼 출제합니다.",
      },
    ],
  },
  {
    title: "3강이 끝났습니다",
    body: "이제 출력 방식, 유형 상세, 생성 모드의 차이를 훑었습니다. 다음 강의에서는 지문 검수와 파일 관리 흐름을 봅니다.",
    video: "results",
    targets: ["generation-mode"],
    decision: {
      continueLabel: "4강 이어가기",
      finishLabel: "여기서 끝내기",
      nextMode: "review-files",
    },
  },
];

export const REVIEW_FILES_TOUR_STEPS: TourStep[] = [
  {
    title: "4강. 지문 검수와 파일 관리는 내 지문에서 시작합니다",
    body: "상단의 내 지문 버튼을 누르면 저장된 지문 목록이 열립니다. 문제 생성뿐 아니라 지문 검수, 폴더 이동, 검색, 일괄 작업도 이 목록에서 시작합니다.",
    video: "library",
    targets: ["intake-library", "library-toolbar", "passage-card"],
    glowTargets: ["intake-library"],
  },
  {
    title: "검수할 지문을 직접 체크합니다",
    body: "검수필요 스탬프가 있는 지문 카드의 체크박스를 직접 눌러주세요. 검수할 지문이 선택되어야 검수완료 버튼을 사용할 수 있습니다.",
    video: "library",
    targets: [
      "passage-review-checkbox",
      "passage-card-checkbox",
      "library-toolbar",
    ],
    glowTargets: ["passage-review-checkbox", "passage-card-checkbox"],
    required: {
      milestone: "review-passage-selected",
      waitingLabel: "검수필요 지문 카드의 체크박스를 눌러 선택해주세요.",
      doneLabel: "검수할 지문이 선택되었습니다.",
    },
  },
  {
    title: "선택한 지문을 검수완료합니다",
    body: "이제 상단 툴바의 검수완료 버튼을 눌러 선택한 지문을 확정하세요. 실제 검수완료 처리가 끝나야 다음 단계로 넘어갑니다.",
    video: "library",
    targets: ["library-review-complete", "library-toolbar"],
    glowTargets: ["library-review-complete"],
    required: {
      milestone: "passage-review-completed",
      waitingLabel: "검수완료 버튼을 누르고 완료 처리를 확인해주세요.",
      doneLabel: "선택한 지문이 검수완료 처리되었습니다.",
    },
  },
  {
    title: "새 폴더를 직접 만듭니다",
    body: "폴더 창의 추가 버튼을 누르고 폴더 이름을 입력한 뒤 생성해주세요. 예를 들어 '6월 모의고사'처럼 출처나 작업 단위로 만들면 나중에 찾기 쉽습니다.",
    video: "library",
    targets: [
      "library-folder-create-button",
      "library-folder-create-form",
      "library-folder-window",
    ],
    glowTargets: ["library-folder-create-button", "library-folder-name-input"],
    required: {
      milestone: "passage-folder-created",
      waitingLabel:
        "추가 버튼을 누르고 폴더 이름을 입력해 새 폴더를 만들어주세요.",
      doneLabel: "새 폴더가 만들어졌습니다.",
    },
  },
  {
    title: "지문을 폴더로 드래그합니다",
    body: "지문 카드 왼쪽의 손잡이를 잡고 방금 만든 폴더 위로 끌어놓으세요. 드롭하면 해당 지문이 폴더 안으로 이동합니다.",
    video: "library",
    targets: [
      "passage-card-drag-handle",
      "library-folder-created-drop-target",
      "library-folder-window",
    ],
    glowTargets: [
      "passage-card-drag-handle",
      "library-folder-created-drop-target",
    ],
    cursorPath: {
      from: "passage-card-drag-handle",
      to: "library-folder-created-drop-target",
      kind: "drag",
    },
    required: {
      milestone: "passage-folder-drop-completed",
      waitingLabel: "지문 카드의 손잡이를 새 폴더로 드래그해 넣어주세요.",
      doneLabel: "지문이 폴더에 들어갔습니다.",
    },
  },
  {
    title: "폴더 창으로 자료를 분류합니다",
    body: "이제 폴더를 눌러 안에 들어간 지문만 확인할 수 있습니다. 선택 지문은 상단 이동/복사 도구로도 정리할 수 있습니다.",
    video: "library",
    targets: ["library-folder-created-drop-target", "library-folder-window"],
  },
  {
    title: "4강이 끝났습니다",
    body: "지문 검수와 파일 관리는 선택, 검수완료, 폴더 정리의 반복입니다. 다음 강의에서는 선택 지문으로 학습자료를 만드는 흐름을 봅니다.",
    video: "library",
    targets: ["library-toolbar"],
    decision: {
      continueLabel: "5강 이어가기",
      finishLabel: "여기서 끝내기",
      nextMode: "learning-materials",
    },
  },
];

export const LEARNING_MATERIALS_TOUR_STEPS: TourStep[] = [
  {
    title: "5강. 학습자료로 만들 지문을 선택합니다",
    body: "내 지문에서 학습자료를 만들 지문 카드의 체크박스를 직접 눌러주세요. 선택이 되어야 상단의 학습자료 생성 버튼을 사용할 수 있습니다.",
    video: "library",
    targets: [
      "passage-learning-checkbox",
      "passage-card-checkbox",
      "library-toolbar",
    ],
    glowTargets: ["passage-learning-checkbox", "passage-card-checkbox"],
    required: {
      milestone: "passage-selected",
      waitingLabel: "학습자료로 만들 지문 카드의 체크박스를 눌러주세요.",
      doneLabel: "학습자료 생성 대상 지문이 선택되었습니다.",
    },
  },
  {
    title: "선택 지문으로 학습자료 생성을 시작합니다",
    body: "상단 툴바의 학습자료 생성 버튼을 눌러주세요. 확인창을 승인하면 분석·어휘·학습 포인트를 만드는 작업이 백그라운드에서 시작됩니다.",
    video: "library",
    targets: ["library-learning-generate", "library-toolbar"],
    glowTargets: ["library-learning-generate"],
    required: {
      milestone: "learning-generation-started",
      waitingLabel: "학습자료 생성 버튼을 누르고 확인창을 승인해주세요.",
      doneLabel: "학습자료 생성 작업이 시작되었습니다.",
    },
  },
  {
    title: "생성이 끝날 때까지 잠시 기다립니다",
    body: "학습자료 생성이 완료되면 방금 선택했던 지문 카드가 다시 강조됩니다. 이 단계에서는 별도로 누를 버튼이 없고, 완료 표시가 뜨면 자동으로 다음 안내로 넘어갑니다.",
    video: "library",
    targets: ["library-learning-generate", "library-toolbar"],
    glowTargets: [],
    required: {
      milestone: "learning-generation-completed",
      waitingLabel: "학습자료 생성이 완료될 때까지 기다려주세요.",
      doneLabel: "학습자료 생성이 완료되었습니다.",
    },
  },
  {
    title: "생성된 학습자료 카드를 열어봅니다",
    body: "방금 학습자료가 생성된 지문 카드가 강조됩니다. 카드를 더블클릭하거나 우측 하단 상세 버튼을 누르면 분석 포인트, 어휘, 독해 포인트를 확인할 수 있는 상세보기 팝업이 열립니다.",
    video: "library",
    targets: ["passage-learning-result-card", "passage-card"],
    glowTargets: ["passage-learning-result-card"],
    required: {
      milestone: "learning-detail-opened",
      waitingLabel: "강조된 지문 카드를 더블클릭하거나 우측 하단 상세 버튼을 눌러 상세보기 팝업을 열어주세요.",
      doneLabel: "학습자료 상세보기 팝업이 열렸습니다.",
    },
  },
  {
    title: "5강이 끝났습니다",
    body: "상세보기 팝업에서 방금 생성된 학습자료를 확인할 수 있습니다. 학습자료 생성은 문제 만들기와 별도로 지문 자체를 수업 자료화하는 기능입니다. 마지막 강의에서는 지문 워크스페이스를 실습합니다.",
    video: "library",
    targets: ["passage-learning-detail-modal", "passage-learning-result-card"],
    decision: {
      continueLabel: "6강 이어가기",
      finishLabel: "여기서 끝내기",
      nextMode: "workspace-edit",
    },
  },
];

export const WORKSPACE_EDIT_TOUR_STEPS: TourStep[] = [
  {
    title: "6강. 편집할 지문을 선택합니다",
    body: "내 지문에서 편집해 볼 지문 하나를 체크해주세요. 선택한 지문을 왼쪽 워크스페이스로 가져와 직접 변형하고 생성까지 해보겠습니다.",
    video: "workspace",
    targets: [
      "passage-learning-checkbox",
      "passage-card-checkbox",
      "library-toolbar",
    ],
    glowTargets: ["passage-learning-checkbox", "passage-card-checkbox"],
    required: {
      milestone: "passage-selected",
      waitingLabel: "편집할 지문 카드의 체크박스를 눌러주세요.",
      doneLabel: "편집할 지문이 선택되었습니다.",
    },
  },
  {
    title: "워크스페이스로 보내기로 워크스페이스를 엽니다",
    body: "상단 툴바의 워크스페이스로 보내기 버튼을 눌러주세요. 선택한 지문이 내 지문함을 덮으며 워크스페이스로 펼쳐집니다.",
    video: "workspace",
    targets: ["library-edit-selected", "library-toolbar"],
    glowTargets: ["library-edit-selected"],
    required: {
      milestone: "workspace-opened",
      waitingLabel: "워크스페이스로 보내기 버튼을 눌러 워크스페이스를 열어주세요.",
      doneLabel: "지문 워크스페이스가 열렸습니다.",
    },
  },
  {
    title: "문장을 드래그해 AI 변형 준비를 합니다",
    body: "워크스페이스 본문에서 바꿔볼 문장을 직접 드래그해 선택하세요. 선택 팝오버가 떠야 다음 단계로 넘어갑니다.",
    video: "workspace",
    targets: ["workspace", "workspace-editor"],
    glowTargets: ["workspace-editor"],
    cropDemo: "workspace-selection",
    required: {
      milestone: "workspace-text-selected",
      waitingLabel: "본문에서 문장 한 덩어리를 드래그해 선택해주세요.",
      doneLabel: "문장이 선택되었습니다.",
    },
  },
  {
    title: "AI 문장 변형을 실행합니다",
    body: "선택 팝오버의 AI 문장 변형 버튼을 눌러주세요. AI가 선택한 문장의 표현을 바꾼 미리보기를 만들어줍니다.",
    video: "workspace",
    targets: ["workspace-paraphrase-button", "workspace-editor"],
    glowTargets: ["workspace-paraphrase-button"],
    required: {
      milestone: "workspace-paraphrase-previewed",
      waitingLabel: "AI 문장 변형 버튼을 누르고 결과 미리보기를 기다려주세요.",
      doneLabel: "AI 문장 변형 미리보기가 만들어졌습니다.",
    },
  },
  {
    title: "변형된 문장을 적용합니다",
    body: "바뀐 단어와 표현을 확인한 뒤 이 문장으로 교체 버튼을 눌러 실제 지문에 적용하세요.",
    video: "workspace",
    targets: ["workspace-apply-paraphrase-preview", "workspace-editor"],
    glowTargets: ["workspace-apply-paraphrase-preview"],
    required: {
      milestone: "workspace-paraphrase-applied",
      waitingLabel: "이 문장으로 교체 버튼을 눌러 변형문을 적용해주세요.",
      doneLabel: "AI 문장 변형이 지문에 적용되었습니다.",
    },
  },
  {
    title: "이 범위만 출제 기능도 같은 선택에서 시작합니다",
    body: "문장을 드래그하면 같은 팝오버에 이 범위만 출제 버튼도 나타납니다. 긴 지문 중 일부 구간만 문제화하고 싶을 때 쓰는 기능이며, 이번 실습에서는 소개만 하고 넘어갑니다.",
    video: "workspace",
    targets: ["workspace-ai-tools", "workspace-editor"],
    cropDemo: "workspace-selection",
  },
  {
    title: "앞 맥락 문단 추가를 실행합니다",
    body: "본문 맨 앞의 앞 맥락 문단 추가 버튼을 눌러주세요. AI가 이어지는 앞 문단을 생성해 미리보기로 보여줍니다.",
    video: "workspace",
    targets: ["workspace-prepend-button", "workspace-editor"],
    glowTargets: ["workspace-prepend-button"],
    required: {
      milestone: "workspace-prepend-previewed",
      waitingLabel: "앞 맥락 문단 추가 버튼을 누르고 미리보기를 기다려주세요.",
      doneLabel: "앞 맥락 문단 미리보기가 만들어졌습니다.",
    },
  },
  {
    title: "앞 맥락 문단을 적용합니다",
    body: "생성된 앞 문단을 확인한 뒤 맨 앞에 추가 버튼을 눌러 지문에 적용하세요. 적용된 구간은 색으로 표시됩니다.",
    video: "workspace",
    targets: ["workspace-apply-prepend-preview", "workspace-editor"],
    glowTargets: ["workspace-apply-prepend-preview"],
    required: {
      milestone: "workspace-prepend-applied",
      waitingLabel: "맨 앞에 추가 버튼을 눌러 앞 맥락 문단을 적용해주세요.",
      doneLabel: "앞 맥락 문단이 지문에 적용되었습니다.",
    },
  },
  {
    title: "오른쪽에서 유형 지정을 선택합니다",
    body: "편집된 지문으로 문제를 만들기 위해 오른쪽 유형·생성 설정에서 유형 지정 탭을 눌러주세요.",
    video: "workspace",
    targets: ["generation-mode-manual", "generation-mode"],
    glowTargets: ["generation-mode-manual"],
    required: {
      milestone: "generation-mode-manual-opened",
      waitingLabel: "오른쪽 설정에서 유형 지정 탭을 눌러주세요.",
      doneLabel: "유형 지정 모드가 열렸습니다.",
    },
  },
  {
    title: "생성할 문제 유형을 추가합니다",
    body: "문제 유형 목록에서 원하는 유형의 + 버튼을 눌러 1문제를 추가하세요. 이 유형이 방금 편집한 지문에 적용됩니다.",
    video: "workspace",
    targets: ["type-add-button", "type-list"],
    glowTargets: ["type-add-button"],
    required: {
      milestone: "generation-type-selected",
      waitingLabel: "문제 유형의 + 버튼을 눌러 생성할 유형을 추가해주세요.",
      doneLabel: "생성할 문제 유형이 지정되었습니다.",
    },
  },
  {
    title: "편집된 지문으로 문제 생성을 시작합니다",
    body: "오른쪽 생성 버튼을 눌러주세요. 편집·보강된 지문은 변형본으로 저장된 뒤 문제 생성에 사용됩니다.",
    video: "workspace",
    targets: ["generate-button", "generation-mode"],
    glowTargets: ["generate-button"],
    required: {
      milestone: "question-generation-completed",
      startedMilestone: "question-generation-started",
      waitingLabel: "생성 버튼을 누르고 처리 완료를 기다려주세요.",
      startedLabel:
        "생성 요청이 접수되었습니다. 결과가 만들어질 때까지 기다려주세요.",
      doneLabel: "편집된 지문으로 문제 생성이 완료되었습니다.",
    },
  },
  {
    title: "생성/검수 결과에서 결과물을 확인합니다",
    body: "방금 생성된 문제 카드가 생성/검수 결과에 표시됩니다. 강조된 첫 번째 문제 카드를 더블클릭하거나 우측 하단 상세 버튼을 눌러 상세보기를 열어주세요.",
    video: "workspace",
    targets: ["generated-question-card-first", "results-section"],
    glowTargets: ["generated-question-card-first"],
    resultHighlightCount: 1,
    required: {
      milestone: "question-detail-opened",
      waitingLabel: "강조된 문제 카드를 더블클릭하거나 우측 하단 상세 버튼을 눌러 상세보기를 열어주세요.",
      doneLabel: "생성된 문제의 상세보기를 확인했습니다.",
    },
  },
  {
    title: "전체 튜토리얼이 끝났습니다",
    body: "직접입력, 이미지·PDF, 생성 상세 기능, 지문 검수·파일관리, 학습자료 생성, 워크스페이스 편집과 문제 생성까지 모두 실습했습니다.",
    video: "workspace",
    targets: ["question-detail-modal", "results-section"],
    decision: {
      continueLabel: "1강부터 다시 보기",
      finishLabel: "튜토리얼 끝내기",
      nextMode: "direct",
    },
  },
];

export const TOUR_STEPS_BY_MODE: Record<TourMode, TourStep[]> = {
  direct: DIRECT_TOUR_STEPS,
  file: FILE_TOUR_STEPS,
  "generation-details": GENERATION_DETAILS_TOUR_STEPS,
  "review-files": REVIEW_FILES_TOUR_STEPS,
  "learning-materials": LEARNING_MATERIALS_TOUR_STEPS,
  "workspace-edit": WORKSPACE_EDIT_TOUR_STEPS,
};

export const TOUR_LESSONS: Array<{
  mode: TourMode;
  label: string;
  title: string;
}> = [
  {
    mode: "direct",
    label: "1강",
    title: "지문 직접입력으로 문제 만들기",
  },
  {
    mode: "file",
    label: "2강",
    title: "이미지/PDF 지문으로 문제 만들기",
  },
  {
    mode: "generation-details",
    label: "3강",
    title: "문제 생성 상세 기능 소개",
  },
  {
    mode: "review-files",
    label: "4강",
    title: "지문 검수하기, 파일관리",
  },
  {
    mode: "learning-materials",
    label: "5강",
    title: "학습자료 생성하기",
  },
  {
    mode: "workspace-edit",
    label: "6강",
    title: "워크스페이스로 보내기",
  },
];
