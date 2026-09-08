"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 2그룹 렌더(스튜디오 전용, v4 26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §1-1 · §3 U4-1·4 · §4(밴드)
//
// 왼쪽 목록을 「스모트 시험지」(INTERNAL 분석 행 + 분석 전 후보 카드 말미) /
// 「외부 시험지 · 사진·PDF」(그 외)로 나눈다. 필터·검색은 컨테이너가 먼저
// 적용해 내려주므로 여기는 순수 배치만 맡는다.
// 카드 렌더 함수를 주입받는 이유: BoardCard 의 핸들러 묶음(restarting·삭제·
// 재분석·힌트)은 컨테이너 소유라 여기로 복제하면 두 벌이 된다.
//
// 【26-09-03 사용자 지시 — 세로 2밴드 → **반반 탭**】 "외부 시험지 · 사진·PDF
// 이게 지금 너무 아래로 내려와 있어. 자체 시험지 이거 옆에 반반으로 탭 구분해."
// → 구 설계(두 밴드를 세로로 쌓고 각 밴드 아래 그리드)는 스모트 시험지가
// 10건 + 후보 다수인 방에서 **외부 그룹이 스크롤 한 바닥 아래로 밀려나** 존재
// 자체가 안 보였다. 이제 두 그룹은 **폭 50:50 탭 한 줄**이고 본문은 활성 그룹
// **하나만** 그린다(비활성 그룹은 언마운트 — `hidden` 유지 마운트는 카드가
// DOM 에 2벌 남아 프로브·포커스가 보이지 않는 카드를 집는다).
// 【같은 지시 — 자구】 "자체 시험지가 아니라 **스모트 시험지**야."
//   → 이 그룹의 실체는 「스모트(SMOAT)에서 만들어 배포·응시한 시험지」다.
//     허브 카드 칩(analyses-board-cards `showSourceChip`)도 같은 자구로 맞춘다.
//
// 후보 접이(감독 지시 SUP-U4-1, probe-v4 1차 실측 「후보 30장 벽」): 후보를
// `currentClassId` 일치(이 클래스) / 나머지(타 클래스·미분류, classId null 포함)로
// 갈라 이 클래스 것만 인라인, 나머지는 접어 둔다(기본 접힘, 로컬 상태). 클래스
// 축이 없으면(허브·클래스 미선택) 전부 인라인이되 상한 8 뒤를 접는다. 검색어가
// 살아 있으면 접지 않는다 — 검색에서 숨는 항목 0.
//
// 【26-09-04 사용자 지시 — 접이 토글을 **범위 세그먼트**로, 탭 줄에 편입】
// 구 설계는 그리드 안에 `col-span-full` 점선 행(「다른 클래스·미분류 시험지 25개
// 보기」)을 카드 사이에 끼워 넣었다. 카드 흐름을 가로지르는 전폭 띠라 시선이
// 끊기고, 카드가 1열로 접히는 좁은 폭에서는 목록 한가운데 이물질처럼 보였다.
// → 이제 **행 자체를 없애고** 탭 줄 오른쪽의 세그먼트 [이 클래스 (N) | 전체 (M)]
//   가 같은 일을 한다. 시각 어휘는 스튜디오 지문함 「범위」 세그먼트(library-pane
//   §3.10.4 — h-7 흰 트랙 + 활성 파랑 필)를 그대로 물려받는다: 한 화면에서
//   「범위를 가른다」를 말하는 방식이 두 벌이 되지 않게.
// 탭 카운트는 이제 **지금 그려진 수**다(펼치면 접힌 수만큼 늘어난다). 구 「+N」
// muted 꼬리는 세그먼트의 「전체 (M)」과 같은 말을 두 번 하므로 폐기하고, 계약
// 속성 `data-analysis-candidates-folded` 는 세그먼트 「전체」 버튼으로 이사했다.
//
// 좁은 폭 방어(노트북 실측): 탭 2개 + 세그먼트를 한 줄에 욱여넣으면 자구가
// 짓눌린다. @container `@2xl`(42rem) 미만에서는 세그먼트가 탭 줄 **아래로 내려가
// 좌측 정렬**되고, 그 이상에서만 같은 줄 오른쪽에 붙는다(찌그러짐 0).
//
// 활성 탭 결정(3층, 아래가 위를 덮는다):
//   ① 자동 — 사용자가 아직 탭을 고르지 않았으면 **항목이 있는 그룹**(스모트 우선).
//   ② 레일 추종(`activeGroup`) — 레일에 열린 분석이 **다른 그룹으로 바뀌면** 따라간다
//      (학생 관리 → 시험 분석 딥링크·후보 승격이 보드와 레일을 갈라놓지 않게).
//      값이 **바뀔 때만** 움직인다 — 사용자가 탭을 바꿔도 폴 틱마다 되끌지 않는다.
//   ③ 명시 포커스(`focus`) — 등록 완료처럼 「지금 만든 것이 저 탭에 있다」를 호스트가
//      아는 순간. `token` 이 바뀔 때만 발동(같은 그룹 연속 요청도 구분된다).
// 클래스가 바뀌면 ①로 되돌리고 접이도 접는다(다른 클래스의 선택을 안 끌고 온다).
//
// 계약 셀렉터:
//   · `[data-analysis-group-tab="internal"|"external"]` — **탭 버튼**(자구·카운트가
//     여기 산다). `[data-analysis-group-tab-active]` 가 활성 탭에만 붙는다.
//   · `[data-analysis-group="internal"|"external"]` — **활성 그룹 본문**(소속 카드가
//     이 안에서 질의된다). 비활성 그룹은 DOM 에 **없다** — 프로브는 카드를 찾기 전에
//     해당 탭을 먼저 클릭할 것(구 계약은 두 그룹이 늘 함께 있다고 가정했다).
//   · `[data-analysis-candidates-scope-group]` — 범위 세그먼트 트랙. 접힌 상태일
//     때만 `[data-analysis-candidates-collapsed]` 가 붙는다(구 계약 유지).
//   · `[data-analysis-candidates-scope="class"|"all"]` — 두 버튼. 「전체」 버튼은
//     구 토글 계약 `[data-analysis-candidates-more]` 와 접힌 수
//     `[data-analysis-candidates-folded]` 를 함께 진다(프로브 무회귀).
// ============================================================================

import { useState, type ReactNode } from "react";
import type {
  ExamCandidateRow,
  ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";

export type AnalysisGroupKey = "internal" | "external";

/** INTERNAL 판별 단일 소스(카드·그룹·힌트가 같은 식을 쓴다). */
export function isInternalRow(row: ExamReportSummaryRow): boolean {
  return row.sourceType === "INTERNAL";
}

/**
 * 그룹 탭 명시 포커스 요청 — 「지금 만든 것이 저 탭에 있다」를 아는 호스트가 보낸다.
 * `token` 이 **바뀔 때만** 발동하므로, 같은 그룹으로의 연속 요청도 각각 먹힌다
 * (등록을 두 번 연속 하면 두 번 다 외부 탭으로 간다).
 */
export interface GroupFocusRequest {
  group: AnalysisGroupKey;
  token: string;
}

const GROUP_LABEL: Record<AnalysisGroupKey, string> = {
  internal: "스모트 시험지",
  external: "외부 시험지 · 사진·PDF",
};

/** 좁은 보드 폭(@container < 28rem)에서 쓰는 축약 자구 — 탭이 반폭이라 필요하다. */
const GROUP_LABEL_SHORT: Record<AnalysisGroupKey, string> = {
  internal: "스모트 시험지",
  external: "외부 시험지",
};

const GROUP_EMPTY_HINT: Record<AnalysisGroupKey, string> = {
  internal: "스모트에서 만들어 배포한 시험지가 아직 없습니다.",
  external: "사진·PDF로 등록한 외부 시험지가 아직 없습니다.",
};

const GROUP_ORDER: readonly AnalysisGroupKey[] = ["internal", "external"];

/** 클래스 축이 없을 때 인라인으로 두는 후보 상한(SUP-U4-1). */
const INLINE_CANDIDATE_CAP = 8;

/** 그리드 규격 — analyses-board 본체 그리드와 동일(컨테이너 쿼리 열 수). */
export const BOARD_GRID_CLASS =
  "grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3";

// ── 탭 시각 문법 ────────────────────────────────────────────────────────────
// 【26-09-05 사용자 지시 "ui 좀 개선해봐"】 구 탭은 파스텔 필(h-8 · bg-slate-100 /
// bg-blue-50 + ring)이었다. 같은 줄 오른쪽의 범위 세그먼트(흰 트랙 + 파랑 채움)와
// 나란히 놓이자 **둥근 상자 셋이 서로 다른 문법으로 한 줄에 서** 무엇이 내비게이션
// 이고 무엇이 필터인지 읽히지 않았고, 카운트도 「10」칩과 「(10)」괄호 두 벌이었다.
// 활성 탭(파스텔)이 세그먼트의 활성(진한 파랑)보다 약해 위계까지 뒤집혀 있었다.
// → 탭은 **밑줄 탭 스트립**으로(텍스트 + 2px 파랑 밑줄, 비활성은 회색 글자만).
//   채워진 상자는 이제 줄에서 세그먼트 하나뿐이라 「고르기(탭) / 좁히기(세그먼트)」
//   가 형태로 갈린다. 카운트는 탭 안 작은 원형 카운터(GitHub 탭 관용구) 하나로.
// 계약: 카운트는 여전히 탭의 **마지막 span**(probe-scope-segment 가 `span.last()`
// 로 읽는다) · 자구 span 은 truncate 유지(잘림 게이트 대상).
const TAB_BASE =
  "-mb-px flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 border-b-2 px-2 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";
const TAB_ACTIVE = "border-blue-600 text-blue-700";
const TAB_IDLE =
  "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600";
const CHIP_BASE =
  "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold leading-none tabular-nums";
const CHIP_ACTIVE = "bg-blue-100 text-blue-700";
const CHIP_IDLE = "bg-slate-100 text-slate-500";

/**
 * 긴 자구 ↔ 축약 자구 교체 임계(컨테이너 쿼리) — **세그먼트 유무로 갈린다**.
 * 세그먼트가 같은 줄에 있으면 탭이 쓸 수 있는 폭이 약 255px 줄어든다.
 * 임계를 @md 하나로 두면 그 구간에서 「외부 시험지 · 사진·PDF」가 말줄임으로
 * 짓눌린다(1440·1366px 실측 129>91). 그래서 세그먼트가 붙는 렌더에서는 임계를
 * @3xl(48rem)로 올려 **잘리기 전에** 축약 자구로 갈아탄다.
 * (Tailwind 는 클래스 문자열을 정적으로 스캔하므로 두 벌을 통째로 적어 둔다.)
 */
const TAB_LABEL_SWAP = {
  wide: { short: "min-w-0 truncate @md:hidden", long: "hidden min-w-0 truncate @md:inline" },
  tight: { short: "min-w-0 truncate @3xl:hidden", long: "hidden min-w-0 truncate @3xl:inline" },
} as const;

function GroupTabs({
  active,
  counts,
  scopeInline,
  onSelect,
}: {
  active: AnalysisGroupKey;
  /** **지금 그려지는** 항목 수(펼침 상태가 반영된 값). */
  counts: Record<AnalysisGroupKey, number>;
  /** 범위 세그먼트가 같은 줄을 나눠 쓰는가 — 자구 교체 임계를 올린다. */
  scopeInline: boolean;
  onSelect: (group: AnalysisGroupKey) => void;
}) {
  const swap = scopeInline ? TAB_LABEL_SWAP.tight : TAB_LABEL_SWAP.wide;
  return (
    // 넓은 폭에서는 세그먼트와 한 줄을 나눠 쓰는 신축 항목(@2xl:flex-1),
    // 좁은 폭에서는 제 줄을 통째로 쓴다. min-w-0 은 탭 자구 truncate 의 전제.
    // 스트립 자체가 밑선(border-b)을 갖고, 활성 탭의 2px 밑줄이 -mb-px 로 그 위에
    // 겹친다(밑줄 탭의 표준 관용구).
    <div className="grid min-w-0 grid-cols-2 border-b border-slate-200 @2xl:flex-1">
      {GROUP_ORDER.map((group) => {
        const isActive = group === active;
        return (
          <button
            key={group}
            type="button"
            onClick={() => onSelect(group)}
            aria-pressed={isActive}
            aria-controls={`analysis-group-panel-${group}`}
            data-analysis-group-tab={group}
            data-analysis-group-tab-active={isActive ? "" : undefined}
            title={GROUP_LABEL[group]}
            className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
          >
            {/* 반폭 탭이라 좁은 보드에서는 축약 자구로 갈아탄다(잘림 대신 교체).
                min-w-0: flex 아이템 기본 min-width:auto 는 truncate 를 무력화한다. */}
            <span className={swap.short}>{GROUP_LABEL_SHORT[group]}</span>
            <span className={swap.long}>{GROUP_LABEL[group]}</span>
            <span
              className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {counts[group]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── 후보 범위 세그먼트 시각 문법 ────────────────────────────────────────────
// 26-09-07: h-7 트랙 안 h-full 버튼은 실제 클릭 높이가 22px뿐이었다.
// 자동 높이 트랙 + 최소 36px 버튼으로 여유를 확보하고, 같은 폭의 두 선택지를
// 중립 배경 위에 둔다. 활성 선택은 흰 표면·파란 글자, 건수는 별도 배지로 표시.
const SCOPE_TRACK =
  "grid max-w-full shrink-0 grid-cols-2 gap-1 self-start rounded-xl border border-slate-200 bg-slate-100 p-1 @2xl:self-center";
const SCOPE_BTN =
  "flex min-h-9 min-w-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";
const SCOPE_ON = "border-blue-200 bg-white text-blue-700 shadow-sm";
const SCOPE_OFF = "border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900";
const SCOPE_COUNT =
  "inline-flex min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-none";

/**
 * 접힌 후보 범위 세그먼트 [이 클래스 (N) | 전체 (M)] — 구 점선 토글 행의 대체.
 * `classScoped=false`(클래스 축 없음)면 자구가 [최근 (N) | 전체 (M)] 로 바뀐다.
 */
function CandidateScopeSegment({
  expanded,
  onChange,
  classScoped,
  narrowCount,
  totalCount,
  foldedCount,
}: {
  expanded: boolean;
  onChange: (next: boolean) => void;
  classScoped: boolean;
  /** 좁힌 상태에서 그려지는 수(= INTERNAL 행 + 인라인 후보). */
  narrowCount: number;
  /** 넓힌 상태에서 그려지는 수(= narrowCount + 접힌 후보). */
  totalCount: number;
  foldedCount: number;
}) {
  const narrowLabel = classScoped ? "이 클래스" : "최근";
  return (
    <div
      role="group"
      aria-label="미분석 시험지 범위"
      data-analysis-candidates-scope-group
      data-analysis-candidates-collapsed={expanded ? undefined : ""}
      className={SCOPE_TRACK}
    >
      <button
        type="button"
        aria-pressed={!expanded}
        aria-label={`${narrowLabel} (${narrowCount})`}
        onClick={() => onChange(false)}
        data-analysis-candidates-scope="class"
        title={
          classScoped
            ? "미분석 시험지를 이 클래스 것만 봅니다"
            : "미분석 시험지를 최근 것만 봅니다"
        }
        className={`${SCOPE_BTN} ${!expanded ? SCOPE_ON : SCOPE_OFF}`}
      >
        <span>{narrowLabel}</span>
        <span
          aria-hidden="true"
          className={`${SCOPE_COUNT} ${!expanded ? "bg-blue-50 text-blue-700" : "bg-slate-200/60 text-slate-500"}`}
        >
          {narrowCount}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={expanded}
        aria-label={`전체 (${totalCount})`}
        onClick={() => onChange(true)}
        data-analysis-candidates-scope="all"
        data-analysis-candidates-more
        data-analysis-candidates-folded={foldedCount}
        title={
          classScoped
            ? `다른 클래스·미분류 미분석 시험지 ${foldedCount}개까지 함께 봅니다`
            : `접어 둔 미분석 시험지 ${foldedCount}개까지 함께 봅니다`
        }
        className={`${SCOPE_BTN} ${expanded ? SCOPE_ON : SCOPE_OFF}`}
      >
        <span>전체</span>
        <span
          aria-hidden="true"
          className={`${SCOPE_COUNT} ${expanded ? "bg-blue-50 text-blue-700" : "bg-slate-200/60 text-slate-500"}`}
        >
          {totalCount}
        </span>
      </button>
    </div>
  );
}

export interface GroupedBoardGridProps {
  /** 필터·검색 통과 분석 행(컨테이너 순서 유지 — 낙관 행 프리펜드 보존). */
  rows: ExamReportSummaryRow[];
  /** 필터·검색 통과 후보(스모트 그룹 말미). */
  candidates: ExamCandidateRow[];
  renderRow: (row: ExamReportSummaryRow) => ReactNode;
  renderCandidate: (candidate: ExamCandidateRow) => ReactNode;
  /**
   * 작업 중인 클래스 id — 후보를 「이 클래스」 인라인 / 나머지 접이로 가른다.
   * null = 클래스 축 없음(상한 INLINE_CANDIDATE_CAP 뒤를 접는다).
   * 값이 바뀌면 탭 선택·접이가 초기화된다.
   */
  currentClassId?: string | null;
  /** 검색어 활성 — 검색 결과는 접지 않는다(검색에서 숨는 항목 0). */
  searchActive?: boolean;
  /** 레일에 열린 행이 속한 그룹(추종 ②) — null = 선택 없음. */
  activeGroup?: AnalysisGroupKey | null;
  /** 명시 포커스 요청(③) — token 이 바뀔 때만 발동. */
  focus?: GroupFocusRequest | null;
}

export function GroupedBoardGrid({
  rows,
  candidates,
  renderRow,
  renderCandidate,
  currentClassId = null,
  searchActive = false,
  activeGroup = null,
  focus = null,
}: GroupedBoardGridProps) {
  // 접이 펼침·탭 선택은 보드 로컬 — 클래스가 바뀌면 다시 접고 자동 탭으로
  // 되돌린다(다른 클래스의 펼침·탭 상태를 끌고 오지 않는다).
  const [expanded, setExpanded] = useState(false);
  // null = 아직 사용자가 고르지 않음(자동 탭). 한 번 고르면 그 선택이 산다 —
  // 빈 그룹을 골라도 되돌리지 않는다(클릭이 무동작으로 보이는 편이 더 나쁘다).
  const [tabPref, setTabPref] = useState<AnalysisGroupKey | null>(null);

  // ── 전이 판정 3종(클래스 교체 · ③명시 포커스 · ②레일 추종) ────────────────
  // **렌더 중 보정**(React 공식 「adjusting state during render」 — analysis-pane
  // responseTrack 과 같은 관용구)으로 한다. effect 로 하면 ⓐ 잘못된 탭이 한 번
  // 그려졌다가 튀고 ⓑ react-hooks/set-state-in-effect 가 정확히 그걸 경고한다.
  // 판정은 **값 비교가 아니라 전이**다 — 폴 틱마다 같은 activeGroup 이 다시 와도
  // 사용자가 방금 고른 탭을 되끌지 않는다. (boolean 래치는 StrictMode 이중 렌더가
  // 소진해 버린다 — R1 스튜디오 복원에서 실측된 함정이라 여기서도 전이 판정이다.)
  const focusToken = focus?.token ?? null;
  const [seen, setSeen] = useState<{
    classId: string | null;
    activeGroup: AnalysisGroupKey | null;
    focusToken: string | null;
  }>({ classId: currentClassId, activeGroup, focusToken });
  if (
    seen.classId !== currentClassId ||
    seen.activeGroup !== activeGroup ||
    seen.focusToken !== focusToken
  ) {
    const classChanged = seen.classId !== currentClassId;
    const focusChanged = seen.focusToken !== focusToken;
    const groupChanged = seen.activeGroup !== activeGroup;
    setSeen({ classId: currentClassId, activeGroup, focusToken });
    // 우선순위: 클래스 교체(전면 초기화) > ③ 명시 포커스 > ② 레일 추종.
    if (classChanged) {
      setTabPref(null);
      setExpanded(false);
    } else if (focusChanged && focus) {
      setTabPref(focus.group);
    } else if (groupChanged && activeGroup) {
      setTabPref(activeGroup);
    }
  }

  const internalRows: ExamReportSummaryRow[] = [];
  const externalRows: ExamReportSummaryRow[] = [];
  for (const row of rows) {
    (isInternalRow(row) ? internalRows : externalRows).push(row);
  }
  // 후보는 서버가 updatedAt desc 로 내려주지만(§2.1) 방어적으로 같은 순서를 재보증.
  const sortedCandidates = [...candidates].sort((a, b) =>
    b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0,
  );
  // 인라인 / 접힘 분할(정렬은 양쪽 모두 updatedAt desc 유지).
  let inlineCandidates: ExamCandidateRow[];
  let foldedCandidates: ExamCandidateRow[];
  if (searchActive) {
    inlineCandidates = sortedCandidates;
    foldedCandidates = [];
  } else if (currentClassId) {
    inlineCandidates = sortedCandidates.filter(
      (c) => c.classId === currentClassId,
    );
    foldedCandidates = sortedCandidates.filter(
      (c) => c.classId !== currentClassId,
    );
  } else {
    inlineCandidates = sortedCandidates.slice(0, INLINE_CANDIDATE_CAP);
    foldedCandidates = sortedCandidates.slice(INLINE_CANDIDATE_CAP);
  }
  const foldedCount = foldedCandidates.length;
  // 좁힌 상태(= 이 클래스/최근) 기준 스모트 수 — 세그먼트 왼쪽 버튼의 수이자
  // 접힘일 때의 탭 카운트.
  const internalNarrow = internalRows.length + inlineCandidates.length;
  const showScope = foldedCount > 0;
  // 탭 카운트는 **지금 그려지는 수**다 — 펼치면 접힌 수만큼 늘어난다.
  const counts: Record<AnalysisGroupKey, number> = {
    internal: internalNarrow + (expanded ? foldedCount : 0),
    external: externalRows.length,
  };

  // ① 자동 — 항목이 있는 그룹(스모트 우선). 접힌 후보만 있어도 스모트는 「있다」.
  const autoTab: AnalysisGroupKey =
    internalNarrow + foldedCount > 0
      ? "internal"
      : counts.external > 0
        ? "external"
        : "internal";
  const tab = tabPref ?? autoTab;

  // 빈 판정은 **지금 그려지는 수**로 한다. 구 코드는 접힌 후보가 있으면 「비지
  // 않음」으로 쳤는데, 그건 점선 토글 행이 그리드 안에 있어서 화면이 실제로는
  // 비지 않았기 때문이다. 그 행을 걷어낸 지금 같은 판정을 쓰면 「이 클래스 0건 +
  // 접힌 25건」 방이 **아무것도 없는 백지**가 된다 → 넓히라고 말해 주는 안내로.
  const isEmpty = counts[tab] === 0;
  const emptyHint =
    tab === "internal" && foldedCount > 0
      ? currentClassId
        ? "이 클래스 시험지는 없습니다. 위 「전체」를 누르면 다른 클래스·미분류 시험지를 볼 수 있어요."
        : "위 「전체」를 누르면 접어 둔 시험지를 볼 수 있어요."
      : GROUP_EMPTY_HINT[tab];

  return (
    <div className="flex flex-col gap-3">
      {/* 탭 줄 — 넓은 폭(@2xl≥42rem)에서는 [탭 스트립][범위 세그먼트]가 한 줄,
          그 미만에서는 세그먼트가 아래 줄로 내려가 좌측 정렬된다(찌그러짐 0).
          sticky(26-09-05): 보드 본문이 내부 스크롤러(scrollBody)일 때 카드 35장을
          내려도 탭·범위가 머리에 붙어 있다 — 흰 바탕이 뒤로 지나가는 카드를 덮는다.
          26-09-07: 그룹 보드의 상단 16px 패딩을 없앴으므로 sticky도 top-0으로
          맞춘다. 음수 보정을 남기면 스크롤할 때 탭 윗부분이 잘린다.
          (허브처럼 내부 스크롤러가 없으면 sticky 는 무해한 no-op.) */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-white @2xl:flex-row @2xl:items-center @2xl:gap-3">
        <GroupTabs
          active={tab}
          counts={counts}
          scopeInline={tab === "internal" && showScope}
          onSelect={setTabPref}
        />
        {tab === "internal" && showScope && (
          <CandidateScopeSegment
            expanded={expanded}
            onChange={setExpanded}
            classScoped={Boolean(currentClassId)}
            narrowCount={internalNarrow}
            totalCount={internalNarrow + foldedCount}
            foldedCount={foldedCount}
          />
        )}
      </div>
      {/* 활성 그룹 **하나만** 그린다 — 비활성 그룹은 언마운트(파일 머리 계약). */}
      <section
        key={tab}
        id={`analysis-group-panel-${tab}`}
        data-analysis-group={tab}
        className="flex flex-col gap-3"
      >
        {isEmpty ? (
          <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-[11.5px] text-slate-400">
            {emptyHint}
          </p>
        ) : tab === "internal" ? (
          <div className={BOARD_GRID_CLASS}>
            {internalRows.map(renderRow)}
            {inlineCandidates.map(renderCandidate)}
            {/* 펼침은 카드 흐름을 끊는 띠 없이 뒤에 그대로 이어 붙는다
                (구 `col-span-full` 점선 토글 행은 탭 줄 세그먼트로 이사). */}
            {expanded && foldedCandidates.map(renderCandidate)}
          </div>
        ) : (
          <div className={BOARD_GRID_CLASS}>{externalRows.map(renderRow)}</div>
        )}
      </section>
    </div>
  );
}
