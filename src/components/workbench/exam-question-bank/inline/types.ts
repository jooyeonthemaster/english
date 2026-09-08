/**
 * 인라인 기출 브라우저 — 패널 ↔ 호스트 계약(docs/gichul-question-bank-spec.md §11.8 정본).
 *
 * 원칙:
 * - 패널은 서버 액션을 직접 부르지 않는다. 체크/해제는 호스트 콜백으로만 올린다.
 * - props 는 원시값·ReadonlySet·안정 콜백만 — 호스트(LibraryPane)와 패널 모두 memo 이며
 *   객체 리터럴 prop 하나가 두 방어선을 같이 깬다(composer-list-pane.tsx:463~465 선례).
 * - 체크 상태의 유일한 정의 = 「지금 조판 중인 시험지(flatPicked)에 들어 있음」.
 *   「담김」「이미 담김」「중복」 개념은 없다(사용자 결정 F-3).
 */

import type { ExamBankQNum } from "@/lib/exam-passages/question-bank-types";

/** 은행 필터 상태(패널 소유, 세션 내 유지 — 클래스 변경에도 유지) */
export interface ExamBankInlineFilters {
  q: string;
  yearFrom: number | null;
  yearTo: number | null;
  exams: string[];
  boards: string[];
  grades: string[];
  typeGroups: string[];
  /** 단일 번호 또는 장문 세트 범위 — API `qNums`. */
  qNums: ExamBankQNum[];
  /** "latest" = 연도↓·시험순·번호↑(기본, 서버 정렬) · "exam" = 회차(examId)·번호 */
  sort: "latest" | "exam";
}

export const EXAM_BANK_INLINE_DEFAULT_FILTERS: ExamBankInlineFilters = {
  q: "",
  yearFrom: null,
  yearTo: null,
  exams: [],
  boards: [],
  grades: [],
  typeGroups: [],
  qNums: [],
  sort: "latest",
};

/** 행 하나가 호스트에 대해 가질 수 있는 상태 — 패널은 이 셋을 props 집합으로 받아 그린다 */
export type ExamBankInlineRowState = "idle" | "picked" | "pending" | "failed";

/**
 * 「체크 즉시 조판」(§11.13.1) 픽 메타 — 패널이 **행 데이터**로 채워 올린다(additive, 옵셔널).
 * 호스트는 이 값으로 조판 픽(flatPicked)의 표시·배포 메타를 즉시 만든다(임시 id 는 목록 미러에
 * 없어 행에서 메타를 되찾을 수 없다). 없으면 호스트가 단건 GET 결과로 채운다 — 어느 쪽이든
 * 반입 착지 뒤 목록 rows 가 도착하면 행 정본 메타로 교체된다.
 */
export interface ExamBankPickMeta {
  /** 코퍼스 지문 id(ExamBankRow.passageId) — DB Passage.id 가 아니다(착지 뒤 행 정본으로 교체) */
  passageId: string;
  passageTitle: string;
  typeGroup: string;
  /** 원본 배점 — 3점이면 난이도 KILLER(반입 매핑과 같은 규칙) */
  points: number;
}

export interface ExamBankInlinePanelProps {
  /** 클래스명 — 헤더 「기출 문제 · 「2학년」」. 클래스 없음이면 null(헤더에 안내, 체크 불가) */
  scopeLabel: string | null;
  /** 조판(flatPicked)에 들어 있는 은행 항목 id 집합 — 호스트가 flatPicked ↔ bankMap 으로 파생(useMemo) */
  pickedBankIds: ReadonlySet<string>;
  /** 코얼레싱 버퍼에 있거나 반입 진행 중인 id(낙관 체크 + 스피너) */
  pendingBankIds: ReadonlySet<string>;
  /** 마지막 반입에서 실패한 id(체크 되돌림 + 경고 아이콘) */
  failedBankIds: ReadonlySet<string>;
  /** 은행 총 문항 수(헤더 보조 문구) — 호스트가 facets.total 을 원시값으로 내린다 */
  bankTotal: number;
  /**
   * 행 하나 체크/해제. next=true 면 시험지에 넣기(호스트가 즉시 조판 + 뒤에서 물질화), false 면
   * 조판에서 제거. meta 는 §11.13.1 additive — 패널이 행 데이터로 주면 호스트가 단건 GET 을
   * 기다리지 않고 픽 메타를 채운다(없어도 동작: 호스트가 GET 결과로 채운다).
   */
  onTogglePick: (bankId: string, next: boolean, meta?: ExamBankPickMeta) => void;
  /** 「이 페이지 전체」·마키 체크/해제 — 항목별 즉시 조판은 병렬, 버퍼 합류는 1회(콜 1회). metas 는 bankId → 메타 */
  onTogglePickMany: (bankIds: string[], next: boolean, metas?: ReadonlyMap<string, ExamBankPickMeta>) => void;
  /** 「← 내 문항으로」 — 호스트가 기출 모드를 끈다(패널 상태는 보존해야 하므로 언마운트 대신 hidden 권장) */
  onBack: () => void;
  /** 루트 <section> 에 병합할 추가 클래스(호스트가 flex 자리를 준다: "min-h-0 flex-1"). 렌더 시퀀스 계기 `data-render-seq` 는 패널 내부 ref 로 찍히며 props 와 무관하다 */
  className?: string;
}

/** 반입 액션(additive) — 요청 bankId ↔ 생성/재사용 Question.id 매핑. skipped 는 빠진다 */
export interface ExamBankImportMappingEntry {
  bankId: string;
  questionId: string;
}
