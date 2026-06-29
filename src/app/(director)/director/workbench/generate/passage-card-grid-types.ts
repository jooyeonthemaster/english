/**
 * passage-card-grid 타입.
 * 분석 요약 파싱 결과 타입 · PassageCardGrid props 인터페이스.
 */

import type { ReactNode } from "react";
import type {
  FilterOptions,
  PassageAnalysisStatusFilter,
  PassageCollectionItem,
  PassageItem,
  PassageSortOrder,
} from "./generate-page-types";
import type { QuestionCardItem } from "@/components/workbench/question-card";

export type ParsedAnalysisSummary = {
  vocabulary?: unknown[];
  grammarPoints?: unknown[];
  syntaxAnalysis?: unknown[];
  structure?: {
    topicSentenceIndex?: number | null;
    mainIdea?: string | null;
  };
  examDesign?: {
    paraphrasableSegments?: unknown[];
    structureTransformPoints?: unknown[];
  };
};

// ─── Props ───────────────────────────────────────────

export interface PassageCardGridProps {
  // Data
  passages: PassageItem[];
  filteredPassages: PassageItem[];
  filterOptions: FilterOptions;
  collections: PassageCollectionItem[];
  loadingPassages: boolean;

  // Search/filter state
  passageSearch: string;
  setPassageSearch: (v: string) => void;
  filterSchool: string;
  setFilterSchool: (v: string) => void;
  filterGrade: string;
  setFilterGrade: (v: string) => void;
  filterSemester: string;
  setFilterSemester: (v: string) => void;
  analysisStatusFilter: PassageAnalysisStatusFilter;
  setAnalysisStatusFilter: (v: PassageAnalysisStatusFilter) => void;
  // Sort controls live in the folder header. Optional — consumers that don't
  // pass them (e.g. tutor program builder) simply hide the sort control.
  passageSortOrder?: PassageSortOrder;
  setPassageSortOrder?: (v: PassageSortOrder) => void;
  passageStatusCounts: { all: number; analyzed: number; unanalyzed: number };
  activeFilterCount: number;

  // Collection
  selectedCollectionId: string;
  setSelectedCollectionId: (v: string) => void;

  // Selection
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  toggleCheckbox: (id: string, e?: React.MouseEvent) => void;
  selectAll: () => void;
  deselectAll: () => void;
  onCopySelectedToCollection?: (collectionId: string) => Promise<void> | void;
  onMoveSelectedToCollection?: (collectionId: string) => Promise<void> | void;
  onMovePassagesToCollection?: (
    passageIds: string[],
    collectionId: string,
  ) => Promise<void> | void;
  onCreateCollection?: (
    name: string,
    parentId?: string | null,
  ) => Promise<string | null | undefined> | string | null | undefined;
  onRemoveSelectedFromCollection?: () => Promise<void> | void;
  onDeleteSelectedPassages?: () => Promise<void> | void;
  passageBulkAction?: "move" | "remove" | "delete" | null;

  // Generation
  // NOTE: PassageCardGrid 는 문제 생성 외 페이지(튜터 프로그램 빌더 등)에서도
  // 재사용된다. 그쪽은 여전히 "auto" 를 넘기고 이 prop 은 본문에서 쓰이지 않으므로,
  // 문제 생성의 genMode 좁히기와 무관하게 넓은 유니온을 유지한다.
  genMode: "auto" | "manual" | "set";
  totalQuestions: number;
  handleBatchGenerate: () => void;
  selectionActionText?: string;
  selectionActionDisabled?: boolean;

  // 지문별 "이미 생성된" 문제 수(실시간). 생략 시 서버 _count 만 사용한다.
  questionCountByPassage?: Map<string, number>;

  // 지문별 생성된 문제 목록. 지문 카드 하단의 "생성된 문제" 요약 토글에 쓴다.
  questionsByPassage?: Map<string, QuestionCardItem[]>;
  // 전달되면 "생성된 문제" 목록의 문제 행 클릭 시 페이지 이동 대신
  // 인페이지 문제 상세 팝업을 연다.
  onOpenQuestionDetail?: (q: QuestionCardItem) => void;

  // 학습지 생성(다른 화면)에서 학습자료가 백그라운드로 생성 중인 지문 id.
  // 카드 테두리에 초록 글로우가 빙글 도는 모션을 띄운다.
  learningGeneratingPassageIds?: Set<string>;
  // 방금 학습자료 생성(분석)이 완료된 지문 id — 초록 글로우(클릭 시 해제).
  // 추출 완료(freshAnalysisPassageIds)의 파란 글로우와 색으로 구분된다.
  learningCompletedPassageIds?: Set<string>;

  // 추출 중인 지문 로딩 카드(이미지·PDF 추출). 카드 그리드 상단에 렌더한다.
  loadingCards?: ReactNode;
  // 방금 추출/분석이 끝난 지문 id. 완료 시각이 늦게 동기화되는 경우에도 글로우를 켠다.
  freshAnalysisPassageIds?: Set<string>;
  onFreshAnalysisAcknowledged?: (passageId: string) => void;
  reviewBulkActionRunning?: boolean;
  onBulkCompleteExtractionReview?: (passages: PassageItem[]) => void;

  // 선택한 지문 일괄 학습자료 생성. 버튼에 총 크레딧 소모량을 표시한다.
  onBulkGenerateLearning?: (passages: PassageItem[]) => void;
  learningBulkActionRunning?: boolean;
  learningCreditCostPerPassage?: number;

  // 선택한 지문을 워크스페이스로 보낸다 (학습자료 생성 버튼 오른쪽).
  onEditSelected?: () => void;
  // 워크스페이스에 올라간 지문 id. 카드 왼쪽 표시선과 배지로 구분한다.
  workspacePassageIds?: Set<string>;
  // 워크스페이스에 작업 중인 지문이 있는지 — 있으면 '추가' 어휘로 바꾼다.
  workspaceActive?: boolean;

  // Actions
  handleOpenAnalysisModal: (passageId: string) => void | Promise<void>;
  // Optional. When provided, clicking "상세 보기" on a 미분석 (un-analyzed) passage
  // opens a plain full-content viewer instead of the analysis/report modal.
  // Omit it (e.g. tutor program builder) to keep the legacy single-modal behavior.
  onViewPassageContent?: (passage: PassageItem) => void;
  // 카드 제목 인라인 수정(연필) 직후 부모가 목록 상태를 동기화할 수 있게.
  onPassageRenamed?: (passageId: string, title: string) => void;
  // 방금 상세를 열어본 지문 id(모달 닫혀도 유지) + 지금 열려 있는 상세 id.
  // 두 값으로 "상세를 닫는 순간 그 카드만 한 번 반짝임"을 만든다.
  lastViewedPassageId?: string | null;
  openPassageDetailId?: string | null;
  // 카드 우측 상단 검수 토글 점. 누르면 검수상태(빨강↔초록)가 실제로 바뀐다.
  onToggleExtractionReview?: (passage: PassageItem) => void;
  // 검수 토글 처리 중인 지문 id (점에 로딩 표시).
  reviewActionPassageIds?: Set<string>;
}
