"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileImage,
  FileText,
  Keyboard,
  MousePointer2,
  X,
} from "lucide-react";

import {
  dispatchGenerateTourClearSampleText,
  dispatchGenerateTourMilestone,
  dispatchGenerateTourSampleTextByIndex,
  GENERATE_TOUR_MILESTONE_EVENT,
  GENERATE_TOUR_OPEN_EVENT,
  GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE,
  GENERATE_TOUR_SAMPLE_FILE_NAME,
  type GenerateTourMilestone,
  type GenerateTourMilestoneDetail,
} from "@/lib/generate-tour-demo";
import type { GenerateTourVariant } from "./generate-tour-video";

const GenerateTourPlayer = dynamic<{ variant?: GenerateTourVariant }>(
  () => import("./generate-tour-player").then((m) => m.GenerateTourPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-video w-full items-center justify-center rounded-[10px] bg-slate-950 text-[11px] font-bold text-slate-400">
        튜토리얼 준비 중...
      </div>
    ),
  },
);

const TOUR_HIDDEN_KEY = "smoat.workbench.questions.generate.tutorial.hidden.v1";
const TOUR_CARD_W = 430;
const TOUR_CARD_ESTIMATED_H = 580;
const TOUR_ACTION_GLOW_CLASS = "smoat-generate-tour-action-glow";
const TOUR_AUTO_ADVANCE_DELAY_MS = 620;
const TOUR_CURSOR_ENTRY_DELAY_MS = 680;

type TourMode =
  | "direct"
  | "file"
  | "generation-details"
  | "review-files"
  | "learning-materials"
  | "workspace-edit";

interface TourStep {
  title: string;
  body: string;
  video: GenerateTourVariant;
  targets?: string[];
  glowTargets?: string[];
  cursorPath?: {
    from: string;
    to: string;
    kind: "drag";
  };
  cropDemo?:
    | "single"
    | "first-column"
    | "second-column"
    | "workspace-selection";
  activateOutputMode?: "verbatim" | "restored";
  activateGenerationMode?: "manual" | "set";
  required?: {
    milestone: GenerateTourMilestone;
    startedMilestone?: GenerateTourMilestone;
    waitingLabel: string;
    startedLabel?: string;
    doneLabel: string;
  };
  demo?: {
    type: "sample-text" | "sample-file";
    label?: string;
    description: string;
    sampleIndex?: number;
  };
  examples?: Array<{
    label: string;
    text?: string;
    inputLabel?: string;
    inputText?: string;
    outputLabel?: string;
    outputText?: string;
  }>;
  resultHighlightCount?: number;
  decision?: {
    continueLabel: string;
    finishLabel: string;
    nextMode?: TourMode;
  };
}

interface TargetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface VirtualCursorState {
  left: number;
  top: number;
  visible: boolean;
  pressed: boolean;
}

interface VirtualDragGhostState {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
  lifted: boolean;
  dropping: boolean;
}

interface VirtualCropSelectionState {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
  active: boolean;
}

interface PointerPoint {
  left: number;
  top: number;
}

const DIRECT_TOUR_STEPS: TourStep[] = [
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

const FILE_TOUR_STEPS: TourStep[] = [
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

const GENERATION_DETAILS_TOUR_STEPS: TourStep[] = [
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
    body: "각 유형 행 오른쪽의 펼침 토글을 열면 발문 언어, 보기 언어, 삽입 문장 수, 빈칸 개수처럼 유형별 옵션을 조정할 수 있습니다. 여기서는 직접 열지 않아도 됩니다.",
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

const REVIEW_FILES_TOUR_STEPS: TourStep[] = [
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

const LEARNING_MATERIALS_TOUR_STEPS: TourStep[] = [
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

const WORKSPACE_EDIT_TOUR_STEPS: TourStep[] = [
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

const TOUR_STEPS_BY_MODE: Record<TourMode, TourStep[]> = {
  direct: DIRECT_TOUR_STEPS,
  file: FILE_TOUR_STEPS,
  "generation-details": GENERATION_DETAILS_TOUR_STEPS,
  "review-files": REVIEW_FILES_TOUR_STEPS,
  "learning-materials": LEARNING_MATERIALS_TOUR_STEPS,
  "workspace-edit": WORKSPACE_EDIT_TOUR_STEPS,
};

const TOUR_LESSONS: Array<{
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

function queryTourTarget(target: string) {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(
    `[data-generate-tour="${target}"]`,
  );
}

function firstAvailableTarget(targets: string[] | undefined) {
  if (!targets) return null;
  for (const target of targets) {
    const el = queryTourTarget(target);
    if (el) return el;
  }
  return null;
}

function visibleTourTargets(targets: string[] | undefined) {
  if (!targets || typeof document === "undefined") return [];
  const elements: HTMLElement[] = [];
  for (const target of targets) {
    document
      .querySelectorAll<HTMLElement>(`[data-generate-tour="${target}"]`)
      .forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) elements.push(el);
      });
  }
  return elements;
}

function readRect(el: HTMLElement | null): TargetRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function centerPoint(rect: TargetRect) {
  return {
    left: Math.round(rect.left + rect.width / 2),
    top: Math.round(rect.top + rect.height / 2),
  };
}

function approachPoint(rect: TargetRect) {
  return {
    left: Math.round(rect.left + Math.min(rect.width * 0.22, 42)),
    top: Math.round(rect.top - 34),
  };
}

function isTourCardTarget(target: string | undefined) {
  return target?.startsWith("tour-") ?? false;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getCardPosition(rect: TargetRect | null) {
  if (typeof window === "undefined") {
    return { left: 24, top: 24, width: TOUR_CARD_W };
  }
  const margin = 14;
  const width = Math.min(TOUR_CARD_W, window.innerWidth - margin * 2);
  if (!rect) {
    return {
      left: Math.round((window.innerWidth - width) / 2),
      top: Math.max(16, Math.round(window.innerHeight * 0.12)),
      width,
    };
  }

  const rightLeft = rect.right + margin;
  if (rightLeft + width <= window.innerWidth - margin) {
    return {
      left: rightLeft,
      top: clamp(
        rect.top + rect.height / 2 - TOUR_CARD_ESTIMATED_H / 2,
        margin,
        Math.max(margin, window.innerHeight - TOUR_CARD_ESTIMATED_H - margin),
      ),
      width,
    };
  }

  const leftLeft = rect.left - width - margin;
  if (leftLeft >= margin) {
    return {
      left: leftLeft,
      top: clamp(
        rect.top + rect.height / 2 - TOUR_CARD_ESTIMATED_H / 2,
        margin,
        Math.max(margin, window.innerHeight - TOUR_CARD_ESTIMATED_H - margin),
      ),
      width,
    };
  }

  const belowTop = rect.bottom + margin;
  const canBelow = belowTop + 360 <= window.innerHeight - margin;
  return {
    left: clamp(
      rect.left + rect.width / 2 - width / 2,
      margin,
      window.innerWidth - width - margin,
    ),
    top: canBelow
      ? belowTop
      : clamp(
          rect.top - 360 - margin,
          margin,
          window.innerHeight - 360 - margin,
        ),
    width,
  };
}

export function GeneratePageTour({
  onOpenChange,
  onResultHighlightCountChange,
  onFileTutorialStart,
}: {
  onOpenChange?: (open: boolean) => void;
  onResultHighlightCountChange?: (count: number) => void;
  onFileTutorialStart?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [tourMode, setTourMode] = useState<TourMode>("direct");
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [actionGlowRect, setActionGlowRect] = useState<TargetRect | null>(null);
  const [virtualCursor, setVirtualCursor] = useState<VirtualCursorState>({
    left: 0,
    top: 0,
    visible: false,
    pressed: false,
  });
  const [virtualDragGhost, setVirtualDragGhost] =
    useState<VirtualDragGhostState>({
      left: 0,
      top: 0,
      width: 220,
      height: 40,
      visible: false,
      lifted: false,
      dropping: false,
    });
  const [virtualCropSelection, setVirtualCropSelection] =
    useState<VirtualCropSelectionState>({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      visible: false,
      active: false,
    });
  const [completedStepIndexes, setCompletedStepIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const [startedStepIndexes, setStartedStepIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const lastPointerPointRef = useRef<PointerPoint | null>(null);

  const steps = TOUR_STEPS_BY_MODE[tourMode] ?? DIRECT_TOUR_STEPS;
  const currentStep = steps[stepIndex] ?? steps[0];
  const currentStepComplete =
    !currentStep?.required || completedStepIndexes.has(stepIndex);
  const currentStepStarted = startedStepIndexes.has(stepIndex);
  const currentTargets =
    currentStepStarted && currentStep?.required?.startedMilestone
      ? ["results-section"]
      : currentStep?.targets;
  const currentTargetKey = currentTargets?.join("|") ?? "";
  const cardPosition = useMemo(() => getCardPosition(targetRect), [targetRect]);
  const sampleTextStepIndex = useMemo(
    () => steps.findIndex((step) => step.demo?.type === "sample-text"),
    [steps],
  );
  const currentGlowTargets = useMemo(() => {
    if (!currentStep) return [];
    if (currentStep.required && (currentStepComplete || currentStepStarted)) {
      return [];
    }
    if (currentStep.glowTargets) return currentStep.glowTargets;
    return currentStep.required ? (currentStep.targets?.slice(0, 1) ?? []) : [];
  }, [currentStep, currentStepComplete, currentStepStarted]);
  const currentGlowTargetKey = currentGlowTargets.join("|");
  const visibleActionGlowRect =
    currentGlowTargets.length > 0 ? actionGlowRect : null;
  const currentCursorPath = currentStep?.cursorPath;
  const currentCursorPathKey = currentCursorPath
    ? `${currentCursorPath.from}|${currentCursorPath.to}|${currentCursorPath.kind}`
    : "";
  const showStepVideo = tourMode === "direct" && stepIndex === 0;
  const shouldPlayVirtualCue =
    Boolean(currentStep?.cropDemo) ||
    (!currentStepComplete && !currentStepStarted);
  const showVirtualCursor =
    visible && stepIndex > 0 && shouldPlayVirtualCue && virtualCursor.visible;
  const showVirtualDragGhost =
    showVirtualCursor && Boolean(currentCursorPath) && virtualDragGhost.visible;
  const virtualDragGhostLabel =
    currentCursorPath?.from === "passage-card-drag-handle"
      ? "지문 카드"
      : GENERATE_TOUR_SAMPLE_FILE_NAME;
  const showVirtualCropSelection =
    showVirtualCursor &&
    Boolean(currentStep?.cropDemo) &&
    virtualCropSelection.visible;

  // 자동오픈 금지 — 전 사용자에게 강제 풀스크린 오버레이가 뜨던 동작 제거.
  // "튜토리얼" 버튼이 openGenerateTour()로 이 이벤트를 쏠 때만 연다 (opt-in).
  useEffect(() => {
    const openTour = () => setVisible(true);
    window.addEventListener(GENERATE_TOUR_OPEN_EVENT, openTour);
    return () => window.removeEventListener(GENERATE_TOUR_OPEN_EVENT, openTour);
  }, []);

  useEffect(() => {
    const rememberPointer = (event: PointerEvent | MouseEvent) => {
      lastPointerPointRef.current = {
        left: event.clientX,
        top: event.clientY,
      };
    };

    window.addEventListener("pointermove", rememberPointer, {
      capture: true,
      passive: true,
    });
    window.addEventListener("mousemove", rememberPointer, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointerdown", rememberPointer, {
      capture: true,
      passive: true,
    });
    window.addEventListener("mousedown", rememberPointer, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("pointermove", rememberPointer, {
        capture: true,
      });
      window.removeEventListener("mousemove", rememberPointer, {
        capture: true,
      });
      window.removeEventListener("pointerdown", rememberPointer, {
        capture: true,
      });
      window.removeEventListener("mousedown", rememberPointer, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    onOpenChange?.(visible);
  }, [onOpenChange, visible]);

  useEffect(() => {
    if (
      !visible ||
      tourMode !== "generation-details" ||
      !currentStep?.activateGenerationMode
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      queryTourTarget(
        `generation-mode-${currentStep.activateGenerationMode}`,
      )?.click();
    }, 80);
    return () => window.clearTimeout(id);
  }, [currentStep?.activateGenerationMode, tourMode, visible]);

  useEffect(() => {
    if (
      !visible ||
      tourMode !== "generation-details" ||
      !currentStep?.activateOutputMode
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      queryTourTarget(`output-mode-${currentStep.activateOutputMode}`)?.click();
    }, 80);
    return () => window.clearTimeout(id);
  }, [currentStep?.activateOutputMode, tourMode, visible]);

  useEffect(() => {
    onResultHighlightCountChange?.(
      visible ? (currentStep?.resultHighlightCount ?? 0) : 0,
    );
  }, [
    currentStep?.resultHighlightCount,
    onResultHighlightCountChange,
    visible,
  ]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [stepIndex, visible]);

  useEffect(() => {
    if (!visible || !currentTargetKey) return;
    const targets = currentTargetKey.split("|").filter(Boolean);
    const el = firstAvailableTarget(targets);
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    const id = window.setTimeout(() => {
      setTargetRect(readRect(firstAvailableTarget(targets)));
    }, 260);
    return () => window.clearTimeout(id);
  }, [currentTargetKey, visible]);

  useEffect(() => {
    if (!visible) return;
    const targets = currentTargetKey.split("|").filter(Boolean);
    const measure = () => {
      if (targets.length === 0) {
        setTargetRect(null);
        return;
      }
      setTargetRect(readRect(firstAvailableTarget(targets)));
    };
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const id = window.setInterval(measure, 600);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(id);
    };
  }, [currentTargetKey, visible]);

  useEffect(() => {
    if (!visible || currentGlowTargets.length === 0) {
      return;
    }
    const measure = () => {
      setActionGlowRect(
        readRect(visibleTourTargets(currentGlowTargets)[0] ?? null),
      );
    };
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const id = window.setInterval(measure, 260);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(id);
    };
  }, [currentGlowTargetKey, currentGlowTargets, visible]);

  useEffect(() => {
    if (
      !visible ||
      stepIndex === 0 ||
      (!currentStep?.cropDemo && (currentStepComplete || currentStepStarted))
    )
      return;

    const timeouts: number[] = [];
    let interval: number | null = null;
    let raf = 0;

    const clearTimeouts = () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.length = 0;
    };

    const schedule = (callback: () => void, delay: number) => {
      timeouts.push(window.setTimeout(callback, delay));
    };

    const playClickCue = () => {
      const rect = readRect(visibleTourTargets(currentGlowTargets)[0] ?? null);
      if (!rect) {
        setVirtualCursor((prev) => ({ ...prev, visible: false }));
        return;
      }

      const targetName = currentGlowTargets[0];
      const start = isTourCardTarget(targetName)
        ? approachPoint(rect)
        : (lastPointerPointRef.current ?? approachPoint(rect));
      const end = centerPoint(rect);
      setVirtualCursor({
        left: start.left,
        top: start.top,
        visible: true,
        pressed: false,
      });
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            left: end.left,
            top: end.top,
          })),
        120,
      );
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            pressed: true,
          })),
        760,
      );
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            pressed: false,
          })),
        960,
      );
      schedule(
        () =>
          setVirtualCursor((prev) => ({
            ...prev,
            visible: false,
          })),
        1560,
      );
    };

    const playDragCue = (path: NonNullable<TourStep["cursorPath"]>) => {
      const fromRect = readRect(visibleTourTargets([path.from])[0] ?? null);
      const toRect = readRect(visibleTourTargets([path.to])[0] ?? null);
      if (!fromRect || !toRect) {
        setVirtualCursor((prev) => ({ ...prev, visible: false }));
        setVirtualDragGhost((prev) => ({ ...prev, visible: false }));
        return;
      }

      const from = isTourCardTarget(path.from)
        ? centerPoint(fromRect)
        : (lastPointerPointRef.current ?? centerPoint(fromRect));
      const to = centerPoint(toRect);
      const ghostWidth = clamp(fromRect.width, 190, 280);
      const ghostHeight = clamp(fromRect.height, 38, 46);
      const fromGhost = {
        left: Math.round(fromRect.left + fromRect.width / 2 - ghostWidth / 2),
        top: Math.round(fromRect.top + fromRect.height / 2 - ghostHeight / 2),
      };
      const toGhost = {
        left: Math.round(toRect.left + toRect.width / 2 - ghostWidth / 2),
        top: Math.round(toRect.top + toRect.height / 2 - ghostHeight / 2),
      };
      setVirtualCursor({
        left: from.left,
        top: from.top,
        visible: true,
        pressed: false,
      });
      setVirtualDragGhost({
        left: fromGhost.left,
        top: fromGhost.top,
        width: ghostWidth,
        height: ghostHeight,
        visible: true,
        lifted: false,
        dropping: false,
      });
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          pressed: true,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          lifted: true,
        }));
      }, 300);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          left: to.left,
          top: to.top,
          pressed: true,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          left: toGhost.left,
          top: toGhost.top,
        }));
      }, 520);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          pressed: false,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          lifted: false,
          dropping: true,
        }));
      }, 1560);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          visible: false,
        }));
        setVirtualDragGhost((prev) => ({
          ...prev,
          visible: false,
          dropping: false,
        }));
      }, 2060);
    };

    const playCropCue = () => {
      const cropDemoKind = currentStep?.cropDemo;
      const workspaceEditorRect =
        cropDemoKind === "workspace-selection"
          ? readRect(visibleTourTargets(["workspace-editor"])[0] ?? null)
          : null;
      const boardRect =
        cropDemoKind === "workspace-selection"
          ? null
          : readRect(visibleTourTargets(["file-crop-board"])[0] ?? null);
      const pageRect =
        cropDemoKind === "workspace-selection"
          ? null
          : readRect(visibleTourTargets(["file-crop-page"])[0] ?? null);
      const extractRect =
        cropDemoKind === "workspace-selection"
          ? null
          : readRect(visibleTourTargets(["file-extract-button"])[0] ?? null);
      const cropBaseRect = workspaceEditorRect ?? pageRect ?? boardRect;
      if (!cropBaseRect) {
        setVirtualCursor((prev) => ({ ...prev, visible: false }));
        setVirtualCropSelection((prev) => ({ ...prev, visible: false }));
        return;
      }

      const cropRatios =
        cropDemoKind === "workspace-selection"
          ? { left: 0.08, top: 0.34, width: 0.72, height: 0.18 }
          : cropDemoKind === "first-column"
            ? { left: 0.14, top: 0.225, width: 0.34, height: 0.36 }
            : cropDemoKind === "second-column"
              ? { left: 0.53, top: 0.225, width: 0.34, height: 0.36 }
              : { left: 0.14, top: 0.225, width: 0.72, height: 0.38 };
      const cropLeft = Math.round(
        cropBaseRect.left + cropBaseRect.width * cropRatios.left,
      );
      const cropTop = Math.round(
        cropBaseRect.top + cropBaseRect.height * cropRatios.top,
      );
      const cropWidth = Math.round(cropBaseRect.width * cropRatios.width);
      const cropHeight = Math.round(cropBaseRect.height * cropRatios.height);
      const start = { left: cropLeft, top: cropTop };
      const end = {
        left: cropLeft + cropWidth,
        top: cropTop + cropHeight,
      };

      setVirtualCursor({
        left: start.left,
        top: start.top,
        visible: true,
        pressed: false,
      });
      setVirtualCropSelection({
        left: start.left,
        top: start.top,
        width: 2,
        height: 2,
        visible: false,
        active: false,
      });
      schedule(() => {
        setVirtualCursor((prev) => ({ ...prev, pressed: true }));
        setVirtualCropSelection((prev) => ({
          ...prev,
          visible: true,
          active: true,
        }));
      }, 260);
      schedule(() => {
        setVirtualCursor((prev) => ({
          ...prev,
          left: end.left,
          top: end.top,
          pressed: true,
        }));
        setVirtualCropSelection((prev) => ({
          ...prev,
          width: cropWidth,
          height: cropHeight,
        }));
      }, 520);
      schedule(() => {
        setVirtualCursor((prev) => ({ ...prev, pressed: false }));
        setVirtualCropSelection((prev) => ({ ...prev, active: false }));
      }, 1580);
      if (cropDemoKind === "single" && extractRect) {
        const extract = centerPoint(extractRect);
        schedule(() => {
          setVirtualCursor((prev) => ({
            ...prev,
            left: extract.left,
            top: extract.top,
          }));
        }, 1960);
        schedule(() => {
          setVirtualCursor((prev) => ({ ...prev, pressed: true }));
        }, 2660);
        schedule(() => {
          setVirtualCursor((prev) => ({ ...prev, pressed: false }));
        }, 2860);
      }
      schedule(
        () => {
          setVirtualCursor((prev) => ({ ...prev, visible: false }));
          setVirtualCropSelection((prev) => ({
            ...prev,
            visible: false,
            active: false,
          }));
        },
        cropDemoKind === "single" ? 3400 : 2300,
      );
    };

    const playCue = () => {
      clearTimeouts();
      if (currentStep?.cropDemo) {
        playCropCue();
        return;
      }
      if (currentCursorPath) {
        playDragCue(currentCursorPath);
        return;
      }
      playClickCue();
    };

    raf = window.requestAnimationFrame(() => {
      setVirtualCursor((prev) => ({
        ...prev,
        visible: false,
        pressed: false,
      }));
      setVirtualDragGhost((prev) => ({
        ...prev,
        visible: false,
        lifted: false,
        dropping: false,
      }));
      setVirtualCropSelection((prev) => ({
        ...prev,
        visible: false,
        active: false,
      }));
      schedule(() => {
        playCue();
        interval = window.setInterval(
          playCue,
          currentStep?.cropDemo ? 4400 : currentCursorPath ? 3400 : 2600,
        );
      }, TOUR_CURSOR_ENTRY_DELAY_MS);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (interval !== null) window.clearInterval(interval);
      clearTimeouts();
    };
  }, [
    currentCursorPath,
    currentCursorPathKey,
    currentGlowTargetKey,
    currentGlowTargets,
    currentStep?.cropDemo,
    currentStepComplete,
    currentStepStarted,
    shouldPlayVirtualCue,
    stepIndex,
    visible,
  ]);

  useEffect(() => {
    if (!visible) return;
    const handleMilestone = (event: Event) => {
      const milestone = (event as CustomEvent<GenerateTourMilestoneDetail>)
        .detail?.milestone;
      if (!milestone || !currentStep?.required) return;
      if (currentStep.required.startedMilestone === milestone) {
        setStartedStepIndexes((prev) => {
          if (prev.has(stepIndex)) return prev;
          const next = new Set(prev);
          next.add(stepIndex);
          return next;
        });
        return;
      }
      if (currentStep.required.milestone !== milestone) return;
      setCompletedStepIndexes((prev) => {
        if (prev.has(stepIndex)) return prev;
        const next = new Set(prev);
        next.add(stepIndex);
        return next;
      });
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        setStepIndex((current) =>
          current === stepIndex && current < steps.length - 1
            ? current + 1
            : current,
        );
        autoAdvanceTimerRef.current = null;
      }, TOUR_AUTO_ADVANCE_DELAY_MS);
    };
    window.addEventListener(GENERATE_TOUR_MILESTONE_EVENT, handleMilestone);
    return () => {
      window.removeEventListener(
        GENERATE_TOUR_MILESTONE_EVENT,
        handleMilestone,
      );
    };
  }, [
    currentStep?.required,
    currentStep?.required?.milestone,
    currentStep?.required?.startedMilestone,
    stepIndex,
    steps.length,
    visible,
  ]);

  useEffect(() => {
    if (!visible || currentGlowTargets.length === 0) return;
    const applyGlow = () => {
      const elements = visibleTourTargets(currentGlowTargets);
      elements.forEach((el) => el.classList.add(TOUR_ACTION_GLOW_CLASS));
      return elements;
    };
    let activeElements = applyGlow();
    const id = window.setInterval(() => {
      activeElements.forEach((el) =>
        el.classList.remove(TOUR_ACTION_GLOW_CLASS),
      );
      activeElements = applyGlow();
    }, 700);
    return () => {
      window.clearInterval(id);
      activeElements.forEach((el) =>
        el.classList.remove(TOUR_ACTION_GLOW_CLASS),
      );
    };
  }, [currentGlowTargetKey, currentGlowTargets, visible]);

  const closeForSession = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setVisible(false);
  };
  const hideForever = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    try {
      window.localStorage.setItem(TOUR_HIDDEN_KEY, "1");
    } catch {
      // Ignore storage failures. The session close still works.
    }
    setVisible(false);
  };

  const clickTarget = (target: string) => {
    const el = queryTourTarget(target);
    if (!el) return;
    el.click();
    window.setTimeout(() => {
      const targets = currentTargetKey.split("|").filter(Boolean);
      setTargetRect(readRect(firstAvailableTarget(targets)));
    }, 240);
  };

  const fillSampleText = () => {
    clickTarget("intake-paste");
    window.setTimeout(() => {
      dispatchGenerateTourSampleTextByIndex(
        currentStep?.demo?.sampleIndex ?? 0,
      );
      dispatchGenerateTourMilestone("sample-text-filled");
      const targets = currentTargetKey.split("|").filter(Boolean);
      setTargetRect(readRect(firstAvailableTarget(targets)));
    }, 260);
  };

  const handleSampleFileDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE, "1");
    event.dataTransfer.setData("text/plain", GENERATE_TOUR_SAMPLE_FILE_NAME);
  };

  const next = () => {
    if (!currentStepComplete) return;
    if (stepIndex >= steps.length - 1) {
      setVisible(false);
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const startLesson = (mode: TourMode) => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    onFileTutorialStart?.();
    setCompletedStepIndexes(new Set());
    setStartedStepIndexes(new Set());
    setTargetRect(null);
    setActionGlowRect(null);
    setVirtualCursor((prev) => ({
      ...prev,
      visible: false,
      pressed: false,
    }));
    setVirtualDragGhost((prev) => ({
      ...prev,
      visible: false,
      lifted: false,
      dropping: false,
    }));
    setVirtualCropSelection((prev) => ({
      ...prev,
      visible: false,
      active: false,
    }));
    if (mode === "generation-details") {
      window.setTimeout(() => queryTourTarget("intake-upload")?.click(), 60);
    }
    if (
      mode === "review-files" ||
      mode === "learning-materials" ||
      mode === "workspace-edit"
    ) {
      window.setTimeout(() => queryTourTarget("intake-library")?.click(), 60);
    }
    setTourMode(mode);
    setStepIndex(0);
  };

  const previous = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    const nextIndex = Math.max(0, stepIndex - 1);
    if (sampleTextStepIndex >= 0 && nextIndex < sampleTextStepIndex) {
      dispatchGenerateTourClearSampleText();
      setCompletedStepIndexes((prev) => {
        const next = new Set<number>();
        prev.forEach((index) => {
          if (index < sampleTextStepIndex) next.add(index);
        });
        return next;
      });
    }
    setStartedStepIndexes((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      prev.forEach((index) => {
        if (index < nextIndex) next.add(index);
      });
      return next;
    });
    setStepIndex(nextIndex);
  };

  if (!visible) return null;

  const finalStep = stepIndex >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {targetRect ? (
        <div
          className="absolute rounded-lg border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.08),0_0_0_7px_rgba(37,99,235,0.12)] transition-all duration-200"
          style={{
            left: targetRect.left - 5,
            top: targetRect.top - 5,
            width: targetRect.width + 10,
            height: targetRect.height + 10,
          }}
        />
      ) : null}
      {visibleActionGlowRect ? (
        <div
          className="smoat-generate-tour-neon-frame absolute rounded-lg"
          style={{
            left: visibleActionGlowRect.left - 7,
            top: visibleActionGlowRect.top - 7,
            width: visibleActionGlowRect.width + 14,
            height: visibleActionGlowRect.height + 14,
          }}
        />
      ) : null}
      {showVirtualCropSelection ? (
        <div
          className={
            "smoat-generate-tour-crop-selection absolute z-[2] rounded-md " +
            (virtualCropSelection.active
              ? "smoat-generate-tour-crop-selection-active"
              : "")
          }
          style={{
            left: virtualCropSelection.left,
            top: virtualCropSelection.top,
            width: virtualCropSelection.width,
            height: virtualCropSelection.height,
          }}
        >
          <span className="absolute -top-7 left-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white shadow-lg shadow-blue-500/20">
            {currentStep?.cropDemo === "second-column"
              ? "Shift + 이어붙이기"
              : currentStep?.cropDemo === "workspace-selection"
                ? "문장 드래그"
                : "지문 영역 드래그"}
          </span>
        </div>
      ) : null}
      {showVirtualDragGhost ? (
        <div
          className={
            "smoat-generate-tour-file-ghost absolute z-[2] flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-[12px] font-black text-blue-700 shadow-xl shadow-blue-500/20 ring-1 ring-blue-100 " +
            (virtualDragGhost.lifted
              ? "smoat-generate-tour-file-ghost-lifted "
              : "") +
            (virtualDragGhost.dropping
              ? "smoat-generate-tour-file-ghost-dropping"
              : "")
          }
          style={{
            left: virtualDragGhost.left,
            top: virtualDragGhost.top,
            width: virtualDragGhost.width,
            height: virtualDragGhost.height,
          }}
        >
          {currentCursorPath?.from === "passage-card-drag-handle" ? (
            <FileText className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <FileImage className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {virtualDragGhostLabel}
          </span>
          <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-600">
            놓기
          </span>
        </div>
      ) : null}
      {showVirtualCursor ? (
        <div
          className={
            "smoat-generate-tour-virtual-cursor absolute z-[3] flex items-center gap-1 " +
            (virtualCursor.pressed
              ? "smoat-generate-tour-virtual-cursor-pressed"
              : "")
          }
          style={{
            left: virtualCursor.left,
            top: virtualCursor.top,
          }}
        >
          <MousePointer2
            className="size-6 fill-blue-600 text-white drop-shadow-[0_2px_8px_rgba(37,99,235,0.42)]"
            aria-hidden="true"
          />
          <span className="rounded-full bg-blue-600/95 px-2 py-0.5 text-[10px] font-black text-white shadow-lg shadow-blue-500/20">
            {currentStep?.cropDemo === "second-column"
              ? "Shift+드래그"
              : currentStep?.cropDemo || currentCursorPath
                ? "드래그"
                : "클릭"}
          </span>
        </div>
      ) : null}
      <div
        className="pointer-events-auto absolute flex max-h-[calc(100vh-28px)] flex-col overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xl shadow-slate-950/20 ring-1 ring-blue-100"
        style={{
          left: cardPosition.left,
          top: cardPosition.top,
          width: cardPosition.width,
        }}
      >
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-4 py-3 pr-11">
          <div className="-mx-1 mb-2 overflow-x-auto pr-8">
            <div className="flex min-w-max items-center gap-1 px-1">
              {TOUR_LESSONS.map((lesson, index) => {
                const active = lesson.mode === tourMode;

                return (
                  <div key={lesson.mode} className="flex items-center gap-1">
                    {index > 0 ? (
                      <span
                        className="text-[10px] font-black text-slate-300"
                        aria-hidden="true"
                      >
                        &gt;
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => startLesson(lesson.mode)}
                      title={lesson.title}
                      aria-current={active ? "step" : undefined}
                      className={
                        "inline-flex h-6 items-center justify-center rounded-md px-2 text-[10.5px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                        (active
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-100")
                      }
                    >
                      {lesson.label}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-[10.5px] font-black uppercase tracking-wide text-blue-600">
            문제 생성 안내 {stepIndex + 1}/{steps.length}
          </div>
          <h2 className="mt-1 text-[15px] font-black leading-snug text-slate-950">
            {currentStep?.title}
          </h2>
          <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-slate-500">
            {currentStep?.body}
          </p>
          {currentStep?.examples?.length ? (
            <div className="mt-2 grid gap-1.5">
              {currentStep.examples.map((example) => (
                <div
                  key={example.label}
                  className="rounded-md border border-blue-100 bg-white/80 px-2.5 py-2"
                >
                  <div className="text-[10.5px] font-black text-blue-600">
                    {example.label}
                  </div>
                  {example.inputText && example.outputText ? (
                    <div className="mt-1.5 grid gap-2 min-[420px]:grid-cols-2">
                      <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5 ring-1 ring-slate-100">
                        <div className="text-[9.5px] font-black text-slate-400">
                          {example.inputLabel ?? "원문 입력"}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[10.5px] font-semibold leading-relaxed text-slate-600">
                          {example.inputText}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-md bg-blue-50/70 px-2 py-1.5 ring-1 ring-blue-100">
                        <div className="text-[9.5px] font-black text-blue-500">
                          {example.outputLabel ?? "출력 결과"}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[10.5px] font-semibold leading-relaxed text-slate-700">
                          {example.outputText}
                        </p>
                      </div>
                    </div>
                  ) : example.text ? (
                    <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600">
                      {example.text}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={closeForSession}
            aria-label="튜토리얼 닫기"
            title="닫기"
            className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-md bg-white/95 text-blue-400 shadow-sm ring-1 ring-blue-100 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {showStepVideo ? (
          <div className="shrink-0 bg-slate-950 p-2">
            <GenerateTourPlayer variant={currentStep?.video ?? "overview"} />
          </div>
        ) : null}
        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3">
          {currentStep?.demo?.type === "sample-text" ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
              <button
                type="button"
                data-generate-tour="tour-sample-text-button"
                onClick={fillSampleText}
                className={
                  "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white px-3 text-[12px] font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition-colors hover:bg-blue-50 " +
                  (currentStepComplete ? "" : TOUR_ACTION_GLOW_CLASS)
                }
              >
                <Keyboard className="size-3.5" aria-hidden="true" />
                {currentStep.demo.label ?? "예문 자동 입력하기"}
              </button>
              <p className="mt-2 text-[11.5px] font-semibold leading-relaxed text-blue-700">
                {currentStep.demo.description}
              </p>
            </div>
          ) : null}

          {currentStep?.demo?.type === "sample-file" ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
              <p className="text-[11.5px] font-semibold leading-relaxed text-blue-700">
                {currentStep.demo.description}
              </p>
              <div
                draggable
                data-generate-tour="tour-sample-file-chip"
                onDragStart={handleSampleFileDragStart}
                title="이 예시 파일을 업로드 박스로 드래그하세요"
                className={
                  "mt-2 flex h-10 cursor-grab select-none items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-[12px] font-black text-blue-700 shadow-sm active:cursor-grabbing " +
                  (currentStepComplete ? "" : TOUR_ACTION_GLOW_CLASS)
                }
              >
                <FileImage className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {GENERATE_TOUR_SAMPLE_FILE_NAME}
                </span>
                <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-600">
                  드래그
                </span>
              </div>
            </div>
          ) : null}

          {currentStep?.required ? (
            <div
              className={
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-bold leading-relaxed " +
                (currentStepComplete
                  ? "border-blue-100 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-500")
              }
            >
              <CheckCircle2
                className={
                  "mt-0.5 size-3.5 shrink-0 " +
                  (currentStepComplete ? "text-blue-600" : "text-slate-300")
                }
                aria-hidden="true"
              />
              <span>
                {currentStepComplete
                  ? currentStep.required.doneLabel
                  : currentStepStarted && currentStep.required.startedLabel
                    ? currentStep.required.startedLabel
                    : currentStep.required.waitingLabel}
              </span>
            </div>
          ) : null}

          {currentStep?.decision ? (
            <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
              <button
                type="button"
                onClick={() =>
                  currentStep.decision?.nextMode
                    ? startLesson(currentStep.decision.nextMode)
                    : closeForSession()
                }
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-black text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {currentStep.decision.continueLabel}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={closeForSession}
                className="inline-flex h-9 items-center justify-center rounded-md bg-white px-3 text-[12px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {currentStep.decision.finishLabel}
              </button>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={previous}
              disabled={stepIndex === 0}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              이전
            </button>
            {!currentStep?.decision ? (
              <button
                type="button"
                onClick={next}
                disabled={!currentStepComplete}
                className={
                  "inline-flex h-8 items-center gap-1 rounded-md px-3 text-[11.5px] font-black transition-colors " +
                  (currentStepComplete
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-slate-200 text-slate-400")
                }
              >
                {finalStep
                  ? "끝내기"
                  : currentStepComplete
                    ? "다음"
                    : "완료 후 다음"}
                {!finalStep && currentStepComplete ? (
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                ) : null}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {steps.map((step, index) => (
              <span
                key={step.title}
                className={
                  "h-1.5 flex-1 rounded-full transition-colors " +
                  (index <= stepIndex ? "bg-blue-600" : "bg-slate-200")
                }
              />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 justify-end border-t border-slate-100 bg-white px-4 py-2.5">
          <button
            type="button"
            onClick={hideForever}
            className="inline-flex h-7 items-center rounded-md px-2 text-[11.5px] font-bold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
          >
            다시는 보지 않기
          </button>
        </div>
      </div>
      <style>{`
        .smoat-generate-tour-neon-frame {
          pointer-events: none;
          z-index: 1;
          border: 2px solid rgba(96, 165, 250, 0.58);
          background: rgba(96, 165, 250, 0.035);
          opacity: 0.58;
          box-shadow:
            0 0 4px rgba(147, 197, 253, 0.38),
            0 0 14px rgba(96, 165, 250, 0.24),
            0 0 26px rgba(37, 99, 235, 0.12),
            inset 0 0 8px rgba(147, 197, 253, 0.12);
          animation: smoat-generate-tour-neon-frame 1.9s ease-in-out infinite;
        }

        .${TOUR_ACTION_GLOW_CLASS} {
          position: relative;
          outline: 1.5px solid rgba(96, 165, 250, 0.58) !important;
          outline-offset: 3px;
          box-shadow:
            0 0 4px rgba(147, 197, 253, 0.32),
            0 0 12px rgba(96, 165, 250, 0.2),
            0 0 22px rgba(37, 99, 235, 0.1) !important;
          animation: smoat-generate-tour-action-neon 1.9s ease-in-out infinite;
        }

        .smoat-generate-tour-virtual-cursor {
          pointer-events: none;
          transform: translate(-4px, -4px) scale(1);
          opacity: 0.96;
          transition:
            left 760ms cubic-bezier(0.2, 0.86, 0.24, 1),
            top 760ms cubic-bezier(0.2, 0.86, 0.24, 1),
            transform 140ms ease,
            opacity 180ms ease;
        }

        .smoat-generate-tour-virtual-cursor-pressed {
          transform: translate(-4px, -4px) scale(0.88);
        }

        .smoat-generate-tour-file-ghost {
          pointer-events: none;
          opacity: 0.96;
          transform: translate3d(0, 0, 0) scale(1);
          transition:
            left 940ms cubic-bezier(0.2, 0.86, 0.24, 1),
            top 940ms cubic-bezier(0.2, 0.86, 0.24, 1),
            transform 180ms ease,
            opacity 180ms ease,
            box-shadow 180ms ease;
        }

        .smoat-generate-tour-file-ghost-lifted {
          transform: translate3d(0, -6px, 0) scale(1.035) rotate(-1deg);
          box-shadow:
            0 18px 34px rgba(37, 99, 235, 0.22),
            0 0 0 1px rgba(147, 197, 253, 0.55);
        }

        .smoat-generate-tour-file-ghost-dropping {
          opacity: 0.18;
          transform: translate3d(0, 6px, 0) scale(0.82);
        }

        .smoat-generate-tour-crop-selection {
          pointer-events: none;
          border: 2px solid rgba(37, 99, 235, 0.9);
          background:
            linear-gradient(
              135deg,
              rgba(37, 99, 235, 0.18),
              rgba(96, 165, 250, 0.08)
            );
          box-shadow:
            0 0 0 9999px rgba(15, 23, 42, 0.04),
            0 0 0 4px rgba(147, 197, 253, 0.28),
            0 12px 30px rgba(37, 99, 235, 0.18),
            inset 0 0 20px rgba(219, 234, 254, 0.3);
          transition:
            left 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
            top 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
            width 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
            height 900ms cubic-bezier(0.2, 0.86, 0.24, 1),
            opacity 180ms ease;
        }

        .smoat-generate-tour-crop-selection-active {
          animation: smoat-generate-tour-crop-pulse 1.15s ease-in-out infinite;
        }

        @keyframes smoat-generate-tour-neon-frame {
          0%,
          100% {
            opacity: 0.44;
            border-color: rgba(96, 165, 250, 0.42);
            box-shadow:
              0 0 3px rgba(147, 197, 253, 0.22),
              0 0 10px rgba(96, 165, 250, 0.14),
              0 0 18px rgba(37, 99, 235, 0.07),
              inset 0 0 6px rgba(147, 197, 253, 0.08);
          }
          50% {
            opacity: 0.92;
            border-color: rgba(147, 197, 253, 0.92);
            box-shadow:
              0 0 5px rgba(219, 234, 254, 0.76),
              0 0 18px rgba(96, 165, 250, 0.46),
              0 0 34px rgba(37, 99, 235, 0.22),
              inset 0 0 12px rgba(147, 197, 253, 0.18);
          }
        }

        @keyframes smoat-generate-tour-action-neon {
          0%,
          100% {
            outline-color: rgba(96, 165, 250, 0.38);
            box-shadow:
              0 0 3px rgba(147, 197, 253, 0.18),
              0 0 10px rgba(96, 165, 250, 0.12),
              0 0 18px rgba(37, 99, 235, 0.06) !important;
          }
          50% {
            outline-color: rgba(147, 197, 253, 0.9);
            box-shadow:
              0 0 5px rgba(219, 234, 254, 0.7),
              0 0 16px rgba(96, 165, 250, 0.38),
              0 0 30px rgba(37, 99, 235, 0.16) !important;
          }
        }

        @keyframes smoat-generate-tour-crop-pulse {
          0%,
          100% {
            border-color: rgba(37, 99, 235, 0.74);
            box-shadow:
              0 0 0 9999px rgba(15, 23, 42, 0.04),
              0 0 0 3px rgba(147, 197, 253, 0.22),
              0 10px 24px rgba(37, 99, 235, 0.14),
              inset 0 0 16px rgba(219, 234, 254, 0.26);
          }
          50% {
            border-color: rgba(59, 130, 246, 1);
            box-shadow:
              0 0 0 9999px rgba(15, 23, 42, 0.05),
              0 0 0 6px rgba(147, 197, 253, 0.34),
              0 14px 34px rgba(37, 99, 235, 0.22),
              inset 0 0 24px rgba(219, 234, 254, 0.36);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .${TOUR_ACTION_GLOW_CLASS},
          .smoat-generate-tour-neon-frame,
          .smoat-generate-tour-virtual-cursor,
          .smoat-generate-tour-file-ghost,
          .smoat-generate-tour-crop-selection {
            animation: none;
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
