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
import type { PassageActivityMap } from "@/lib/passage-activity";

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
  // 과목 스코프 — "KOREAN" 이면 국어 전용 그리드(갈래 배지 노출). 미전달 =
  // 영어 기본(국어 요소 미노출, 기존 UI 픽셀 동일).
  subjectScope?: "KOREAN";
  // Sort controls live in the folder header. Optional — consumers that don't
  // pass them (e.g. tutor program builder) simply hide the sort control.
  passageSortOrder?: PassageSortOrder;
  setPassageSortOrder?: (v: PassageSortOrder) => void;
  passageStatusCounts: { all: number; analyzed: number; unanalyzed: number };
  activeFilterCount: number;

  // Collection
  selectedCollectionId: string;
  setSelectedCollectionId: (v: string) => void;
  // 브레드크럼 루트 라벨(폴더 헤더 "○○ · 전체 지문"의 ○○). 호스트 화면의
  // 실제 문맥에 맞춰 주입한다(예: 클래스 스튜디오 "내 지문함"). 미전달 =
  // 기본 "학습지 관리" — 기존 호스트 픽셀 불변.
  breadcrumbRootLabel?: string;
  // 폴더 칩 창을 접힌 채로 시작(additive) — 세로 공간이 귀한 임베드(클래스
  // 스튜디오)용. 미전달 = false(기존 호스트 픽셀 불변). 펼치기는 한 클릭.
  initialFolderCollapsed?: boolean;
  // 컴팩트 카드(additive) — 데스크톱 카드 300→260px·본문 미리보기 5→3줄.
  // 1080p 실사용 창(높이 ~930)에서도 카드 2행이 통으로 보이게 하는 임베드용.
  // 미전달 = false(기존 호스트 픽셀 불변).
  compactCards?: boolean;
  // 가로 행 목록(additive) — true 면 뷰포트 불문 카드 그리드 대신 전폭 가로 행
  // 리스트로 렌더한다(본문 미리보기 없음·제목 무절단·가변 높이 — 클래스
  // 스튜디오 임베드용, 스펙 §3.8.4). 미전달 = false(기존 호스트 픽셀 불변).
  listRows?: boolean;
  // 「담김」 배지(additive — 클래스 스튜디오 §3.10.4) — **listRows 모드에서만**
  // 이 집합에 든 지문의 행 제목 옆에 소형 「담김」 배지를 붙여 클래스 등록
  // 상태를 표시한다. 미전달 = 렌더 경로 완전 불변(기존 호스트 픽셀 불변).
  classBadgePassageIds?: ReadonlySet<string>;
  // 모바일 페이지네이션 resetKey 에 덧붙는 호스트 토큰(additive) — 값이 바뀌면
  // 모바일 페이지가 1로 되돌아간다(클래스 스튜디오 스코프 세그먼트 전환 등,
  // §3.10.4). 미전달 = resetKey 문자열이 기존과 동일(기존 호스트 무회귀).
  mobilePageResetToken?: string;
  // ── 행 인라인 지문 수정(additive — 클래스 스튜디오 §3.10.18 E18-f) ──────────
  // 아래 3종은 **listRows 모드에서만** 소비되며, 셋 다 미전달이면 렌더 결과가
  // 기존과 바이트 동일하다(문제 생성·지문 등록·문항은행·유사 문제·튜터 빌더 등
  // 다른 호스트 전부 무회귀). 스튜디오만 이 3종을 넘긴다.
  //
  // 행 우측 아이콘 버튼의 정체. "detail"(기본) = 기존 Maximize2 「상세보기」 →
  // openPassageCard(분석/원문 모달). "edit" = PencilLine 「지문 수정」 →
  // onEditPassageInline(행 아래 인라인 편집기 토글, 모달 없음).
  // ⚠ 공유 컴포넌트 CardDetailIconButton 의 기본값은 22개 파일이 쓰므로 절대
  //   바꾸지 않는다 — 호출부에서 icon/title/aria-label 만 오버라이드한다.
  rowPrimaryAction?: "detail" | "edit";
  // rowPrimaryAction==="edit" 일 때 행 버튼·더블클릭·Enter 가 부르는 핸들러.
  // (edit 모드에서 상세 모달과 인라인 편집이 공존하면 같은 행이 두 의미를
  //  갖는 거짓말이 되므로, 세 진입점 전부를 이 핸들러로 재바인딩한다.)
  onEditPassageInline?: (passage: PassageItem) => void;
  // 행 **바로 아래**(행 div 의 형제)에 그릴 확장 노드. 반환 null = 미확장.
  // ⚠ 행 안이 아니라 형제로 그리는 이유는 §3.10.18 E18-g 참조 — 행 루트의
  //   overflow-hidden(팝오버 잘림)·flex-wrap(전폭 자식 붕괴)·data-drag-item-id
  //   (마키 히트 사각형 부풀림)·onClick 선택 토글 4종 때문이다.
  //   호출부는 반드시 참조 안정(useCallback)으로 넘긴다.
  renderRowExpansion?: (passage: PassageItem) => ReactNode;

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
    /** Source folders to KEEP the items in (skip removal) when moving. */
    keepFolderIds?: string[],
  ) => Promise<void> | void;
  /** Copy (add to target, keep in current folders) by explicit ids. When
   *  provided, dropping a card onto a folder opens a 복사/이동 chooser at the
   *  drop point instead of silently moving. Omit to keep the legacy
   *  drag = immediate move behaviour. */
  onCopyPassagesToCollection?: (
    passageIds: string[],
    collectionId: string,
  ) => Promise<void> | void;
  onCreateCollection?: (
    name: string,
    parentId?: string | null,
  ) => Promise<string | null | undefined> | string | null | undefined;
  onRenameCollection?: (
    collectionId: string,
    name: string,
  ) => Promise<void> | void;
  onRemovePassagesFromFolder?: (
    passageIds: string[],
    collectionId: string,
  ) => Promise<void> | void;
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

  // 문항 이력 지연 로더(additive) — 전달되면 questionsByPassage 에 목록이 없는
  // 행/카드도 서버 집계(p._count.questions) > 0 이면 「생성된 문제」 토글을
  // 그리고, 팝오버 최초 오픈 시 이 로더로 목록을 지연 조회한다.
  // ⚠ 참조 안정 전제 — memo(PassageListRow) 의 prop 으로 내려간다.
  onLazyLoadQuestions?: (passageId: string) => Promise<QuestionCardItem[]>;
  // 전달되면 "생성된 문제" 목록의 문제 행 클릭 시 페이지 이동 대신
  // 인페이지 문제 상세 팝업을 연다.
  onOpenQuestionDetail?: (q: QuestionCardItem) => void;

  // 학습지 생성(다른 화면)에서 학습자료가 백그라운드로 생성 중인 지문 id.
  // 카드 테두리에 초록 글로우가 빙글 도는 모션을 띄운다.
  learningGeneratingPassageIds?: Set<string>;
  // 지문별 「생성 중」 활동 표식(additive — 계약: @/lib/passage-activity).
  // 든 지문의 행/카드 테두리 안쪽에 파란 링이 흐르고, listRows 행은 메타줄에
  // 무엇이 도는지 소형 라벨을 얹는다. 미전달 = 렌더 경로 완전 불변.
  //
  // learningGeneratingPassageIds 와의 관계: **같은 의미의 두 채널**이다(저쪽은
  // 지문등록 화면의 초록 conic 글로우, 이쪽은 호스트가 라벨까지 정하는 범용
  // 표식). 한 행에 둘 다 걸리면 기존 채널이 이긴다 — 선주민 우선이고, 두 모션이
  // 겹치면 테두리가 두 겹으로 도는 것처럼 보이기 때문. 새 호스트는 이쪽을 쓴다.
  //
  // ⚠ 맵 자체도, 그 안의 값 객체도 **참조 안정**이어야 한다: 값은 memo
  //   (PassageListRow)의 비교 대상이라 폴링 틱마다 새 객체가 오면 목록 전체가
  //   다시 그려진다. 조립부는 passageActivitySignature 로 시그니처 메모를 걸 것.
  rowActivity?: PassageActivityMap;
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
  // 툴바 일괄 생성 버튼의 라벨. 호스트 화면의 산출물 어휘에 맞춰 주입한다
  // (예: 클래스 스튜디오 "학습 만들기"). 미전달 = 기본 "학습자료 생성" —
  // 기존 호스트 픽셀 불변.
  bulkGenerateLabel?: string;

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
  // 행별 검수 토글 숨김(additive — 클래스 스튜디오 §3.10.15). onToggleExtractionReview
  // 미전달만으론 disabled 회색 버튼이 잔존하므로 렌더 자체를 게이트한다. 미검수
  // 붉은 테두리도 함께 끈다(해제 수단 없는 경고색만 남기지 않기 위함).
  // 미전달 = false(기존 호스트 픽셀 불변).
  hideReviewToggle?: boolean;
  // 툴바 우측 필터 팝오버+검색 토글(과 인라인 검색 입력 행) 숨김(additive —
  // §3.10.15 필터/검색 2쌍 중복 해소). 살아남는 쌍은 폴더 헤더의 정렬+검색
  // 팝오버 하나뿐이다. 미전달 = false(기존 호스트 픽셀 불변).
  hideToolbarFilterSearch?: boolean;
  // 전체선택 체크박스를 폴더 브레드크럼 행에 인라인하고 툴바 행을 접는다
  // (additive — §3.10.17-c: 벌크·필터가 전부 꺼진 호스트에서 체크박스 하나가
  // 가로 행을 독점하는 고아 행 수복). 미전달 = false(기존 호스트 픽셀 불변).
  inlineSelectAllInHeader?: boolean;
}
