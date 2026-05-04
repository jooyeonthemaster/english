// ============================================================================
// Extraction mode system — Single Source of Truth.
//
// Every place that needs to distinguish the four extraction modes
// (M1 지문만 / M2 문제 세트 / M3 해설 / M4 시험지 통째) reads from this file:
//   - UI: mode selection cards, review tab structure, result preview
//   - API:   `/api/extraction/jobs` request validation, commit routing
//   - Worker: OCR prompt variant, segmentation targets
//   - DB:    ExtractionJob.mode column values
//
// Keep this file a *pure* data module — no Prisma / no React imports — so both
// server and client can import it with zero side effects.
// ============================================================================

import type { BlockType } from "./block-types";

export type ExtractionMode =
  | "PASSAGE_ONLY"
  | "QUESTION_SET"
  | "EXPLANATION"
  | "FULL_EXAM";

export type ModeIcon = "FileText" | "ListChecks" | "NotebookPen" | "FilePlus2";
export type ReviewTab = "passage" | "question" | "explanation" | "meta";

export interface ProducedEntityNote {
  /** Entity name as shown in the UI card ("Passage", "Question", "Exam"…) */
  name: string;
  /** 1줄 설명 — 강사가 즉시 이해 가능한 톤 */
  description: string;
}

export interface ModeConfig {
  id: ExtractionMode;
  /** 한국어 정식 명칭 — 업로드 카드/배지에 그대로 노출 */
  label: string;
  /** 배지용 초단문 ("M1" / "M2" / "M3" / "M4") */
  shortLabel: string;
  /** 모드 선택 화면의 1줄 요약 */
  description: string;
  /** 카드 본문 2~3줄 상세 설명 */
  detailedDescription: string;
  /** lucide-react 아이콘 이름 (실제 존재하는 export만 사용) */
  icon: ModeIcon;
  /** 저장 시 생성되는 엔티티 목록 — 미리보기 카드에서 렌더 */
  producedEntities: ProducedEntityNote[];
  /** OCR 시스템 프롬프트에 덧붙일 모드 전용 지시 */
  promptAddon: string;
  /** 세그멘테이션이 "저장 대상"으로 취급할 블록 타입 */
  relevantBlockTypes: BlockType[];
  /** 리뷰 UI의 탭 구조 — 좌측부터 탭 순서 그대로 */
  reviewTabs: ReviewTab[];
  /** true면 UI 노출은 하되 선택 불가(준비 중) */
  disabled?: boolean;
  /** 비활성 상태일 때 badge 표기 문구 */
  disabledReason?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Mode definitions.
// ────────────────────────────────────────────────────────────────────────────

export const MODES: Record<ExtractionMode, ModeConfig> = {
  PASSAGE_ONLY: {
    id: "PASSAGE_ONLY",
    label: "지문만",
    shortLabel: "M1",
    description: "본문만 뽑아 지문 라이브러리에 적재합니다.",
    detailedDescription:
      "시험지·교재·프린트에서 영어 지문 본문만 선별해 저장합니다. 문제 번호·선지·해설은 모두 무시하고, 학습용 지문 컬렉션으로 묶어 둡니다.",
    icon: "FileText",
    producedEntities: [
      { name: "Passage", description: "본문 텍스트 원문을 그대로 보존한 지문." },
      { name: "PassageCollection", description: "이번 업로드로 묶인 지문 모음(선택)." },
    ],
    promptAddon: `이번 추출은 PASSAGE_ONLY 모드입니다.

[포함할 것]
- 읽기용 지문 본문만 (영어/한국어/혼합 모두).
- 단락 구분은 원문 그대로 유지.

[반드시 제외할 것 — 지문에 섞지 말 것]
- 시험지 헤더: 교재명(리딩파워, 수능특강, Ch·Unit 표기), 학교명·학년·학기·교시·과목코드·시행년도·회차.
- 답안 작성 유의사항 / 답안지 작성법 / 배점 안내문.
- 문제 번호: "1.", "(2)", "3)".
- 지시문: "다음 글을 읽고 물음에 답하시오", "다음 글의 주제로 가장 적절한 것은?", "[2~4] 다음 글을 …".
- 범위 표기: "[1~3]", "[2~4]".
- 선지: ①②③④⑤와 그에 딸린 내용.
- 정답·해설·풀이 블록.
- 쪽번호·저작권·머리말·꼬리말·필기·낙서·형광펜·밑줄.

[여러 지문 처리]
한 페이지에 지문이 여러 개 있으면 (시험지 보통 10개 이상) 각 지문 사이를 빈 줄로 구분하되, 지문 자체에는 번호·지시문을 붙이지 마세요. 후처리에서 지문 경계를 자동 감지합니다.`,
    relevantBlockTypes: ["PASSAGE_BODY"],
    reviewTabs: ["passage", "meta"],
  },

  QUESTION_SET: {
    id: "QUESTION_SET",
    label: "문제 세트",
    shortLabel: "M2",
    description: "지문·문제·선지(+정답)를 통째로 문제 은행에 등록합니다.",
    detailedDescription:
      "지문과 딸린 문제·선지·정답(표기돼 있을 때)을 한 묶음으로 저장합니다. 해설이 있다면 함께 붙입니다. 기출 문제 은행을 빠르게 채울 때 사용합니다.",
    icon: "ListChecks",
    producedEntities: [
      { name: "Passage", description: "문제가 딸린 지문 본문." },
      { name: "Question", description: "문항·선지·정답(표기 있을 때)." },
      { name: "QuestionExplanation", description: "해설이 함께 들어온 경우 자동 저장." },
    ],
    promptAddon: `이번 추출은 QUESTION_SET 모드입니다. 구조화 JSON으로 출력합니다.

[블록 분리 원칙]
- 하나의 문항 = PASSAGE_BODY + QUESTION_STEM + CHOICE × 5 (선지가 5개 미만이면 있는 만큼).
- 선지 ①~⑤는 각각 독립 CHOICE 블록으로. 한 블록에 여러 선지 병합 금지.
- 각 CHOICE에 questionNumber(소속 문제 번호) + choiceIndex(1~5) 필수.
- 정답 표기(●/★/■/체크/'정답 ③' 텍스트)가 이미지에 있을 때만 isAnswer: true.

[공유 지문 vs 공유 지시문 구분]
- "[2~4] 다음 글을 읽고 물음에 답하시오." → 공유 지문 (PASSAGE_BODY 1개, 각 QUESTION_STEM에 sharedPassageRange: "2~4").
- "[2~4] 다음 글의 주제로 가장 적절한 것을 고르시오." → 공유 지시문이지만 실제 본문은 각 번호마다 별개 → PASSAGE_BODY 3개, 모두 sharedPassageRange: null.
- 판별 힌트: 지시 문구가 "다음 글을 읽고"면 공유 지문, "다음 글의 [주제/제목/요지/…]"면 각 번호가 독립 지문.

[제외할 것]
- 시험지 헤더·답안 안내는 EXAM_META 또는 HEADER로 분리하고 PASSAGE_BODY에 섞지 말 것.
- 필기·낙서·형광펜 흔적은 NOISE로 분류하거나 제외.`,
    relevantBlockTypes: ["PASSAGE_BODY", "QUESTION_STEM", "CHOICE", "EXPLANATION"],
    reviewTabs: ["passage", "question", "meta"],
  },

  EXPLANATION: {
    id: "EXPLANATION",
    label: "해설 자료",
    shortLabel: "M3",
    description: "해설지를 디지털화해 기존 문제에 매칭합니다.",
    detailedDescription:
      "별도로 배포된 해설지·정답지를 스캔해 이미 등록돼 있는 문제에 해설을 붙입니다. 문항 번호·정답 키로 기존 Question을 찾아 연결합니다.",
    icon: "NotebookPen",
    producedEntities: [
      { name: "QuestionExplanation", description: "기존 Question에 매칭된 해설 레코드." },
    ],
    promptAddon:
      "이번 추출은 EXPLANATION 모드입니다. 해설 본문만 EXPLANATION 블록으로 추출하고, 각 해설의 문항 번호·정답·핵심 포인트를 함께 기록하세요. 지문 본문은 중복 저장되지 않도록 건드리지 않습니다.",
    relevantBlockTypes: ["EXPLANATION"],
    reviewTabs: ["explanation", "meta"],
    disabled: true,
    disabledReason: "v2 준비 중",
  },

  FULL_EXAM: {
    id: "FULL_EXAM",
    label: "시험지 통째",
    shortLabel: "M4",
    description: "지문·문제·시험지를 통째로 저장하고 자동 태깅합니다.",
    detailedDescription:
      "시험지 한 부를 그대로 디지털화합니다. 지문·문제·선지·정답에 더해 시험(Exam) 레코드와 PassageBundle(묶음 지문)까지 만들고, 헤더에서 시행년도·회차·과목·학년을 자동 태깅합니다.",
    icon: "FilePlus2",
    producedEntities: [
      { name: "SourceMaterial", description: "한 부의 시험지 원본 메타데이터." },
      { name: "Passage", description: "시험지의 모든 지문." },
      { name: "Question", description: "모든 문제·선지·정답." },
      { name: "Exam", description: "실전형 Exam 레코드(시험 배포에 재사용)." },
      { name: "PassageBundle", description: "[32~34]처럼 묶여 있는 지문·문제 묶음." },
    ],
    promptAddon: `이번 추출은 FULL_EXAM 모드입니다. 한 부의 시험지를 통째로 구조화합니다.

[EXAM_META 추출 (1페이지 상단 필수)]
반드시 EXAM_META 블록 1개를 만들어 pageMeta 필드와 함께 채우세요:
- year: 시행년도 (예: 2024 — "2024학년도"에서 추출)
- round: 회차 — "수능" | "6월" | "9월" | "11월" | "중간" | "기말" | "1회" | "2회" 등
- subject: "ENGLISH" | "KOREAN" | "MATH" | "OTHER"
- schoolName: 내신시험이면 학교명 (예: "연수고등학교")
- publisher: 교재 유래면 출판사·교재명 (예: "리딩파워", "수능특강", "빠바")

대표 예시:
- "2024학년도 9월 모의평가 영어 영역" → year=2024, round="9월", subject="ENGLISH"
- "2024학년도 대학수학능력시험 영어" → year=2024, round="수능"
- "연수고등학교 2022학년도 2학기 2회고사 영어II" → year=2022, round="2회", schoolName="연수고등학교"
- "리딩파워(유형완성) Ch 3,4,13~16강" → publisher="리딩파워"

[블록 분리 원칙]
- EXAM_META → HEADER → (PASSAGE_BODY + QUESTION_STEM + CHOICE×5)* → EXPLANATION* → FOOTER 순서.
- 공유 지문 "[2~4] 다음 글을 읽고..." → PASSAGE_BODY 1개 + QUESTION_STEM 3개 (sharedPassageRange: "2~4").
- 공유 지시문 "[2~4] 다음 글의 주제로..." → PASSAGE_BODY 3개 (각 번호마다, sharedPassageRange: null).
- 선지 ①~⑤는 반드시 5개 독립 CHOICE 블록.

[제외]
- 필기·낙서·형광펜 마킹·밑줄·동그라미 → NOISE로 분류하거나 제외.
- 수험 유의사항 / "답안지 작성법" / "배점 참고" 등 안내문 → HEADER.`,
    relevantBlockTypes: [
      "PASSAGE_BODY",
      "QUESTION_STEM",
      "CHOICE",
      "EXPLANATION",
      "EXAM_META",
    ],
    reviewTabs: ["passage", "question", "meta"],
  },
};

/** UI 노출 순서 — M1 → M2 → M4 → M3 (M3은 비활성). */
export const MODE_LIST: ModeConfig[] = [
  MODES.PASSAGE_ONLY,
  MODES.QUESTION_SET,
  MODES.FULL_EXAM,
  MODES.EXPLANATION,
];

export function getModeConfig(mode: ExtractionMode): ModeConfig {
  return MODES[mode];
}

export function isValidMode(value: unknown): value is ExtractionMode {
  return typeof value === "string" && value in MODES;
}

export function usesStructuredExtraction(mode: ExtractionMode): boolean {
  return (
    mode === "PASSAGE_ONLY" ||
    mode === "QUESTION_SET" ||
    mode === "FULL_EXAM"
  );
}

/** 기본 모드 — 기존 코드 호환 (mode 미지정 시 M1). */
export const DEFAULT_EXTRACTION_MODE: ExtractionMode = "PASSAGE_ONLY";
