"use client";

// 인라인 기출 브라우저 — 껍데기(정본 docs/gichul-question-bank-spec.md §11.2·§11.8·§11.13.2).
//
// ExamBankInlinePanel (flex h-full min-h-0 flex-col, @container)
// ├ 헤더 h-10:   [← 내 문항으로]  기출 문제 · 「2학년」                 [✓ 선택 N]
// ├ 필터 바(bank-inline-filters) + 활성 칩 줄
// ├ 결과 줄 h-8: [□ 이 페이지 전체]  현재 조건 3,076문항         정렬 [최신순 ▾]
// ├ 목록 div[role=list](data-exam-bank-list, 스크롤 컨테이너)
// │  └ DragSelect(deferCommit, min-h-full) — 행 div[role=listitem][data-drag-item-id] 40행/페이지, 가상화 없음
// └ 푸터: 공유 Pagination(totalPages > 1 일 때만)
//
// 계약(§11.8)
// - 호스트가 소유: 기출 모드 on/off·bankMap·코얼레싱 버퍼·pending/failed·pickedBankIds. 패널은 서버 액션을
//   부르지 않고 onTogglePick / onTogglePickMany 로만 올린다. 체크 상태 = 「이 조판에 들어 있음」 하나뿐.
// - 패널이 소유: 필터·페이지·fetch(훅)·미리보기 팝오버(행 안, 비제어)·키보드 이동(roving tabindex)·마키.
// - memo: props 는 원시값·ReadonlySet·안정 콜백만 — 호스트가 객체 리터럴을 내리면 두 방어선이 같이 깨진다.
// - 렌더 계기: `data-render-seq` 는 렌더마다 ref 로 증가(G-lag 게이트가 안정성을 센다).
//
// 마키 드래그(§11.13.2, 전역 드래그 계약 = deferCommit·인라인 틴트·rAF 자동 스크롤·놓을 때 1회 커밋)
// - DragSelect 는 스크롤 컨테이너 **안**에 둔다(컨테이너를 감싸지 않는다) — 선택 사각형이 콘텐츠 좌표라 스크롤과
//   함께 움직이고, 자동 스크롤 대상은 DragSelect 가 첫 행에서 위로 올라가며 찾는 이 컨테이너다.
// - `min-h-full` + 패딩을 DragSelect 쪽에 둔다(컨테이너는 패딩 0): 빈 여백에서도 드래그가 시작되고, 컨테이너에
//   패딩을 남기면 100% + 패딩이 항상 스크롤 높이를 넘겨 행 3개짜리 목록에도 스크롤바가 선다.
// - value = picked ∪ pending(useMemo, 호스트 Set 이 prev 를 돌려주면 참조 안정). 담기 드래그의 next 는 value 의
//   상위집합, 해제 드래그(선택 행에서 시작)의 next 는 부분집합 — 델타만 onTogglePickMany 로 1회 올린다.
//   pending 행은 value 에 있으므로 담기 델타에 절대 들지 않는다. 해제 델타에는 든다(호스트가 버퍼 취소로 처리 —
//   붉은 틴트가 「빠질 예정」을 이미 보여줬으므로 조용히 빼면 화면이 거짓말한다).
// - 델타는 DragSelect 가 base 로 쓴 그 렌더의 value(클로저) 와 **지금** 선택집합(ref) 을 둘 다 대조한다 —
//   드래그 도중 반입 실패로 빠진 id(팬텀)를 해제 델타에 싣거나, 그 사이 들어온 id 를 담기 델타에 싣지 않는다.
// - 행 클릭 토글은 그대로 산다: DragSelect 는 5px 임계 아래에서는 active 가 되지 않아 click 을 삼키지 않는다.
//
// ⚠ 함정
// - 페이지가 바뀌면 목록 컨테이너 `scrollTo({top:0})` 만 — scrollIntoView 는 조상 스크롤을 하이재킹한다(금지).
// - 호버로 상태를 바꾸는 코드 금지(§11.1 「틱틱」). 미리보기는 👁 클릭만.
// - 뷰포트 유틸(sm:/lg:) 금지, @container 만 — 조판 중 중앙 열은 420px 고정이다.
// - 「선택 N」 토글은 진입 시점의 선택 id 스냅샷(useState)으로 `?ids=` 를 1회만 받는다(150 초과는 훅이 청크).
//   그 뒤 해제는 로컬 필터(picked ∪ pending ∪ failed)로 즉시 사라진다 — 스냅샷을 pickedBankIds 파생으로 두면
//   해제마다 ids 재요청이 나가 목록이 깜빡였다. 필터 상태는 그대로 보존된다.
// - 패널은 hidden 으로 유지 마운트되는 전제(필터·스크롤 보존) — 언마운트하면 훅 state 가 사라진다.
// - 키보드: ↑↓/Home/End 는 목록 컨테이너의 DOM 자손에서 온 것만 처리한다(👁 팝오버는 body 포털이지만 React 합성
//   이벤트는 React 트리를 타고 여기까지 올라온다 — 팝오버 안 화살표가 목록 포커스를 옮기던 결함). Shift+Enter 는
//   같은 행 👁 을 연다(트리거가 tabIndex -1 이라 키보드 진입구가 이것뿐). 행 셀렉터는 `[data-exam-bank-row]`
//   (태그 없이) — 행이 li → div 로 바뀌어도 계약 속성만 보면 안 죽는다.
// - 스크롤 컨테이너는 overflow-x-hidden — 마키 사각형이 컨테이너 오른쪽 밖까지 그려지면 가로 스크롤바가 깜빡인다.

import { BookMarked, Check, ChevronLeft, Minus, RotateCw, SearchX } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { DragSelect } from "@/components/ui/drag-select";
import { Pagination } from "@/components/workbench/shared/pagination";
import type { ExamBankRow } from "@/lib/exam-passages/question-bank-types";
import { examBankRowMemberIds, examBankSelectionKey } from "@/lib/exam-passages/question-bank-grouping";
import { BankInlineActiveChips, BankInlineFilters } from "./bank-inline-filters";
import { BankInlineRow, BankInlineRowSkeleton, type BankInlineRowPickMeta } from "./bank-inline-row";
import type { ExamBankInlinePanelProps, ExamBankInlineRowState } from "./types";
import { useExamBankInline } from "./use-exam-bank-inline";

const BOX_BASE = "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors";
const BOX_OFF = `${BOX_BASE} border-slate-300 bg-white text-transparent`;
const BOX_ON = `${BOX_BASE} border-slate-600 bg-slate-600 text-white`;
const SKELETON_ROWS = 8;
const nf = new Intl.NumberFormat("ko-KR");

/**
 * onTogglePickMany 의 3번째 인자(담기 메타, 단위 H3 additive). H3 착지 전 types.ts 는 2인자라 3인자 호출이
 * tsc 에 걸린다 — 2인자 함수는 3인자 시그니처로 단언 가능(인자가 적은 쪽이 assignable)하고, 착지 뒤엔 단언이
 * 항등이 된다. 게이트에서 types.ts 의 메타 타입으로 접합한다.
 */
type TogglePickManyWithMeta = (bankIds: string[], next: boolean, metas?: ReadonlyMap<string, BankInlineRowPickMeta>) => void;

function pickMetaOf(row: ExamBankRow): BankInlineRowPickMeta {
  return { passageId: row.passageId, passageTitle: row.passageTitle, typeGroup: row.typeGroup, points: row.points };
}

/** 선택 0개일 때 DragSelect 에 내리는 공유 빈 집합 — 절대 mutate 금지(DragSelect 도 `new Set(value)` 로 복사만 한다). */
const EMPTY_SELECTION = new Set<string>();

function ExamBankInlinePanelImpl({
  scopeLabel,
  pickedBankIds: pickedMemberIds,
  pendingBankIds: pendingMemberIds,
  failedBankIds: failedMemberIds,
  bankTotal,
  onTogglePick,
  onTogglePickMany,
  onBack,
  className,
}: ExamBankInlinePanelProps) {
  const pickedBankIds = useMemo(() => new Set([...pickedMemberIds].map(examBankSelectionKey)), [pickedMemberIds]);
  const pendingBankIds = useMemo(() => new Set([...pendingMemberIds].map(examBankSelectionKey)), [pendingMemberIds]);
  const failedBankIds = useMemo(() => new Set([...failedMemberIds].map(examBankSelectionKey)), [failedMemberIds]);
  // G-lag 계기(§11.6) — 렌더 횟수 자체가 측정값이라 렌더 중 ref 를 올린다. 렌더 결과에 영향을 주는 값이
  // 아니고(DOM 속성 하나) state 로 두면 계기가 렌더를 유발하는 순환이 되므로 refs 규칙을 여기서만 끈다.
  const renderSeqRef = useRef(0);
  // eslint-disable-next-line react-hooks/refs
  renderSeqRef.current += 1;
  // eslint-disable-next-line react-hooks/refs
  const renderSeq = renderSeqRef.current;

  const disabled = scopeLabel === null;

  // ── 「선택만 보기」 — 진입 시점 스냅샷(해제는 로컬 필터, 재요청 없음) ────
  const [onlyIds, setOnlyIds] = useState<string[] | null>(null);
  const onlyPicked = onlyIds !== null;
  const enterOnlyPicked = useCallback(() => {
    // pending 도 포함 — 방금 체크한 행이 목록에서 사라지면 「넣는 중」이 보이지 않는다.
    const ids = [...pickedBankIds];
    for (const id of pendingBankIds) if (!pickedBankIds.has(id)) ids.push(id);
    setOnlyIds(ids);
  }, [pickedBankIds, pendingBankIds]);
  const exitOnlyPicked = useCallback(() => setOnlyIds(null), []);

  const api = useExamBankInline({ onlyIds });
  const { rows: fetchedRows, total: fetchedTotal, page, totalPages, setPage, loading, error, reload, initialPending, filters, hasActiveFilters, setSort, resetFilters } = api;

  // 선택만 보기 중 해제된 행은 스냅샷 응답에 남아 있다 — 로컬로 걸러 즉시 사라지게 한다. failed 는 남긴다
  // (체크는 되돌아갔지만 경고 표시가 여기서 사라지면 실패를 알 길이 없다).
  const rows = useMemo(
    () => (onlyPicked ? fetchedRows.filter((r) => pickedBankIds.has(r.id) || pendingBankIds.has(r.id) || failedBankIds.has(r.id)) : fetchedRows),
    [onlyPicked, fetchedRows, pickedBankIds, pendingBankIds, failedBankIds],
  );
  const total = onlyPicked ? rows.length : fetchedTotal;
  /** 마키 델타 → 담기 메타 조립용(화면 행만 — DragSelect 는 DOM 에 있는 행만 히트한다). */
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r] as const)), [rows]);
  const togglePickMany: TogglePickManyWithMeta = useCallback((ids, next, metas) => {
    const members: string[] = [];
    const memberMetas = new Map<string, BankInlineRowPickMeta>();
    for (const id of ids) {
      const row = rowById.get(id);
      for (const memberId of row ? examBankRowMemberIds(row) : [id]) {
        members.push(memberId);
        const meta = metas?.get(id) ?? (row ? pickMetaOf(row) : undefined);
        if (meta) memberMetas.set(memberId, meta);
      }
    }
    onTogglePickMany([...new Set(members)], next, memberMetas);
  }, [rowById, onTogglePickMany]);
  const togglePick = useCallback((id: string, next: boolean, meta: BankInlineRowPickMeta) => {
    if (rowById.get(id)?.memberIds?.length) togglePickMany([id], next, new Map([[id, meta]]));
    else onTogglePick(id, next, meta);
  }, [rowById, togglePickMany, onTogglePick]);

  // ── 목록 스크롤·키보드 ─────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // 페이지 전환·선택만 보기 전환·필터 변경(rows 교체) 시 목록 컨테이너만 맨 위로(scrollIntoView 금지).
    // rows 는 응답마다 새 배열이라 필터가 바뀌면 여기 걸린다 — 스크롤 깊은 곳에서 유형을 바꾸면 빈 화면처럼 보이던 결함.
    listRef.current?.scrollTo({ top: 0 });
  }, [page, onlyPicked, rows]);

  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const tabStopId = useMemo(() => {
    if (activeRowId !== null && rows.some((r) => r.id === activeRowId)) return activeRowId;
    return rows[0]?.id ?? null;
  }, [activeRowId, rows]);
  const handleFocusRow = useCallback((id: string) => setActiveRowId(id), []);
  const handleListKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const root = listRef.current;
    if (!root) return;
    // 포털(👁 팝오버) 안에서 올라온 합성 이벤트는 무시 — DOM 상 목록 컨테이너 밖이다.
    if (!(e.target instanceof Node) || !root.contains(e.target)) return;
    if (e.key === "Enter" && e.shiftKey) {
      // 체크박스에서 Shift+Enter = 같은 행 👁 열기(트리거는 tabIndex -1 이라 Tab 으로 못 간다).
      const eye = (e.target as Element).closest("[data-exam-bank-row]")?.querySelector<HTMLButtonElement>("button[data-exam-bank-preview]");
      if (!eye) return;
      e.preventDefault();
      eye.click();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    // 직계 자식(>)만 — 행 안 다른 role=checkbox 가 생겨도 roving 순서에 끼지 않는다.
    const boxes = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-exam-bank-row] > button[role="checkbox"]'));
    if (boxes.length === 0) return;
    const current = boxes.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = boxes.length - 1;
    else if (current < 0) next = 0;
    else next = Math.min(boxes.length - 1, Math.max(0, current + (e.key === "ArrowDown" ? 1 : -1)));
    e.preventDefault();
    boxes[next]?.focus();
  }, []);

  // ── 마키(§11.13.2) ──────────────────────────────────────────────────────
  // DragSelect 의 value = picked ∪ pending. 호스트가 변화 없을 때 prev Set 을 돌려주므로 여기도 참조가 안정된다.
  // 둘 다 비면 공유 빈 Set(매 렌더 새 Set 금지 — DragSelect 가 value 로 handleMouseDown 을 다시 만든다).
  const selectedSet = useMemo(() => {
    if (pickedBankIds.size === 0 && pendingBankIds.size === 0) return EMPTY_SELECTION;
    const s = new Set<string>(pickedBankIds);
    for (const id of pendingBankIds) s.add(id);
    return s;
  }, [pickedBankIds, pendingBankIds]);
  // 「지금」 선택집합 — 릴리스 커밋 시점에 읽는다(마우스다운 클로저의 value 와 대조해 팬텀을 거른다).
  // 렌더 중 ref 쓰기 금지 규칙 때문에 effect 로 미룬다 — 이벤트(릴리스)는 effect 가 흐른 뒤에만 온다.
  const selectedSetRef = useRef(selectedSet);
  useEffect(() => {
    selectedSetRef.current = selectedSet;
  }, [selectedSet]);

  const handleMarquee = useCallback(
    (next: Set<string>, meta?: { deferMode: "add" | "remove" }) => {
      if (disabled) return;
      // base = DragSelect 가 mousedown 에 스냅샷한 그 렌더의 value(= 이 클로저의 selectedSet). now = 릴리스 시점.
      const base = selectedSet;
      const now = selectedSetRef.current;
      if (meta?.deferMode === "remove") {
        // 해제 드래그: base − next, 단 지금도 선택돼 있는 것만(드래그 중 실패로 이미 빠진 id 는 다시 만지지 않는다 —
        // 만지면 호스트가 failed 표시를 지운다).
        const ids: string[] = [];
        for (const id of base) if (!next.has(id) && now.has(id)) ids.push(id);
        if (ids.length > 0) togglePickMany(ids, false);
        return;
      }
      // 담기 드래그: next − base, 순회 순서 = DragSelect enteredOrder(마키가 훑은 순서) → 조판 순서로 보존.
      // pending 은 base 에 있어 여기 들지 않는다. 화면에 없는 id(응답 교체로 사라진 행)는 메타를 못 만드니 버린다.
      const ids: string[] = [];
      // 호스트 계약(types.ts)은 Map<bankId, meta> — 배열을 주면 호스트의 metas.get 이 죽는다(p3a 실측 TypeError)
      const metas = new Map<string, BankInlineRowPickMeta>();
      for (const id of next) {
        if (base.has(id) || now.has(id)) continue;
        const row = rowById.get(id);
        if (!row) continue;
        ids.push(id);
        metas.set(id, pickMetaOf(row));
      }
      if (ids.length > 0) togglePickMany(ids, true, metas);
    },
    [disabled, selectedSet, rowById, togglePickMany],
  );

  // ── 행 상태·페이지 전체 ────────────────────────────────────────────────
  const rowState = (id: string): ExamBankInlineRowState =>
    failedBankIds.has(id) ? "failed" : pendingBankIds.has(id) ? "pending" : pickedBankIds.has(id) ? "picked" : "idle";
  const pageIds = rows.map((r) => r.id);
  const pageSettled = pageIds.filter((id) => !pendingBankIds.has(id));
  const pagePicked = pageSettled.filter((id) => pickedBankIds.has(id));
  const allChecked = pageSettled.length > 0 && pagePicked.length === pageSettled.length;
  const someChecked = pagePicked.length > 0 && !allChecked;
  const togglePage = () => {
    if (disabled || pageSettled.length === 0) return;
    if (allChecked) {
      togglePickMany(pagePicked, false);
      return;
    }
    const toAdd = rows.filter((r) => !pendingBankIds.has(r.id) && !pickedBankIds.has(r.id));
    togglePickMany(
      toAdd.map((r) => r.id),
      true,
      new Map(toAdd.map((r) => [r.id, pickMetaOf(r)] as const)),
    );
  };

  const pickedCount = pickedBankIds.size;
  const showEmpty = !initialPending && rows.length === 0;

  return (
    <section
      data-exam-bank-inline
      data-render-seq={renderSeq}
      data-exam-bank-loading={loading ? "1" : undefined}
      aria-label="기출 문제 브라우저"
      className={`flex h-full min-h-0 flex-col bg-white @container ${className ?? ""}`}
    >
      {/* ── 헤더 ── */}
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-slate-100 px-2">
        <button
          type="button"
          onClick={onBack}
          data-exam-bank-back
          aria-label="내 문항 목록으로 돌아가기"
          className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md pl-1 pr-2 text-[11.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <ChevronLeft className="size-3.5" />
          내 문항으로
        </button>
        <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <h2
          className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold text-slate-800"
          title={`평가원·교육청 기출 ${nf.format(bankTotal)}문항`}
        >
          <BookMarked className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
          <span className="shrink-0">기출 문제</span>
          {scopeLabel ? (
            // 괄호는 shrink-0, 이름만 truncate — 한 span 에 넣으면 긴 클래스명에서 닫는 「」」 가 먼저 잘린다.
            <span className="flex min-w-0 items-center font-semibold text-blue-700">
              <span className="shrink-0">「</span>
              <span className="min-w-0 truncate">{scopeLabel}</span>
              <span className="shrink-0">」</span>
            </span>
          ) : (
            <span className="truncate text-[11px] font-medium text-slate-400">클래스를 선택하면 넣을 수 있어요</span>
          )}
          {bankTotal > 0 ? (
            <span className="hidden shrink-0 text-[10.5px] font-medium text-slate-400 tabular-nums @[34rem]:inline">
              · {nf.format(bankTotal)}문항
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={onlyPicked ? exitOnlyPicked : enterOnlyPicked}
          disabled={pickedCount === 0 && !onlyPicked}
          aria-pressed={onlyPicked}
          aria-label={onlyPicked ? "전체 기출 문항 보기" : "시험지에 넣은 기출 문항만 보기"}
          data-exam-bank-picked-count={pickedCount}
          data-exam-bank-only-picked={onlyPicked ? "1" : "0"}
          className={
            "ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11.5px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-default disabled:opacity-50 " +
            (onlyPicked
              ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
          }
        >
          <Check className="size-3.5" strokeWidth={3} />
          선택 {pickedCount}
        </button>
      </header>

      {/* ── 필터 바(선택만 보기 중엔 안내 줄로 대체 — 필터 상태는 훅에 그대로 남는다) ── */}
      <div className="sticky top-0 z-10 shrink-0 border-b border-slate-100 bg-white/95 backdrop-blur">
        {onlyPicked ? (
          <div className="flex h-9 items-center gap-2 px-3 text-[11.5px] text-slate-500">
            <span className="min-w-0 truncate">지금 시험지에 넣은 기출만 보는 중</span>
            <button
              type="button"
              onClick={exitOnlyPicked}
              className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-blue-600 transition-colors hover:bg-blue-50"
            >
              전체 보기
            </button>
          </div>
        ) : (
          <>
            <BankInlineFilters api={api} />
            <BankInlineActiveChips api={api} />
          </>
        )}
      </div>

      {/* ── 결과 줄 ── */}
      <div className="relative flex h-8 shrink-0 items-center gap-2.5 border-b border-slate-100 px-3 text-[11px] text-slate-500">
        <button
          type="button"
          role="checkbox"
          aria-checked={allChecked ? true : someChecked ? "mixed" : false}
          aria-disabled={disabled || pageSettled.length === 0 || undefined}
          aria-label="이 페이지 전체 시험지에 넣기"
          data-exam-bank-select-page
          onClick={togglePage}
          className={
            "flex shrink-0 items-center gap-1.5 rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
            (disabled || pageSettled.length === 0 ? "cursor-default opacity-50" : "cursor-pointer text-slate-600 hover:text-slate-800")
          }
        >
          <span className={allChecked || someChecked ? BOX_ON : BOX_OFF} aria-hidden="true">
            {someChecked ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
          </span>
          이 페이지 전체
        </button>
        <span className="min-w-0 truncate tabular-nums" data-exam-bank-filtered-total={total}>
          {onlyPicked ? "시험지에 든 기출" : "현재 조건"} <b className="font-bold text-slate-800">{nf.format(total)}</b>문항
        </span>
        {onlyPicked ? null : (
          <select
            aria-label="정렬"
            value={filters.sort}
            onChange={(e) => setSort(e.target.value === "exam" ? "exam" : "latest")}
            className="ml-auto h-6 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white px-1 text-[11px] font-medium text-slate-600 outline-none transition-colors hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="latest">최신순</option>
            <option value="exam">회차순</option>
          </select>
        )}
        {/* 응답 대기 진행 바 — 스켈레톤 플래시 대신(§11.3). */}
        {loading && !initialPending ? (
          <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 animate-pulse bg-blue-500/70" />
        ) : null}
      </div>

      {error && rows.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-rose-100 bg-rose-50/60 px-3 py-1 text-[11px] text-rose-600">
          <span className="min-w-0 truncate">{error}</span>
          <button type="button" onClick={reload} className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-semibold hover:underline">
            <RotateCw className="size-3" /> 다시 시도
          </button>
        </div>
      ) : null}

      {/* ── 목록(스크롤 컨테이너 > DragSelect > 행) ── */}
      <div
        ref={listRef}
        role="list"
        data-exam-bank-list
        aria-label="기출 문항 목록"
        onKeyDown={handleListKeyDown}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <DragSelect
          deferCommit
          disabled={disabled}
          value={selectedSet}
          onChange={handleMarquee}
          className="flex min-h-full flex-col gap-1 px-2 py-1.5"
        >
          {initialPending
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => <BankInlineRowSkeleton key={i} />)
            : rows.map((r) => (
                <BankInlineRow
                  key={r.id}
                  id={r.id}
                  passageId={r.passageId}
                  passageTitle={r.passageTitle}
                  year={r.year}
                  exam={r.exam}
                  board={r.board}
                  grade={r.grade}
                  qNum={r.qNum}
                  setLabel={r.setLabel}
                  typeGroup={r.typeGroup}
                  points={r.points}
                  preview={r.preview}
                  state={rowState(r.id)}
                  disabled={disabled}
                  tabStop={tabStopId === r.id}
                  onToggle={togglePick}
                  onFocusRow={handleFocusRow}
                />
              ))}
          {showEmpty ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-exam-bank-empty>
              <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <SearchX className="size-4" />
              </span>
              {error ? (
                <>
                  <p className="text-[12px] text-slate-600">{error}</p>
                  <button type="button" onClick={reload} className={EMPTY_BTN}>
                    <RotateCw className="size-3" /> 다시 시도
                  </button>
                </>
              ) : onlyPicked ? (
                <>
                  <p className="text-[12px] text-slate-600">시험지에 넣은 기출 문항이 없습니다</p>
                  <button type="button" onClick={exitOnlyPicked} className={EMPTY_BTN}>
                    전체 보기
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[12px] text-slate-600">조건에 맞는 기출 문항이 없습니다</p>
                  {hasActiveFilters ? (
                    <button type="button" onClick={resetFilters} data-exam-bank-reset-filters className={EMPTY_BTN}>
                      필터 초기화
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </DragSelect>
      </div>

      {/* ── 푸터 ── */}
      {totalPages > 1 ? (
        // 공유 Pagination 은 md 이상에서 flex-nowrap — 420~512px 열에서 페이지 ≥3 부터(≪ ‹ 1 … n › ≫ 9~11칸) 가로로
        // 넘친다. 공유 컴포넌트는 손대지 않고 래퍼에서 자식 div 만 wrap 으로 되돌린다(자손 셀렉터 특이도가 md: 를 이긴다).
        <div data-exam-bank-pagination className="shrink-0 border-t border-slate-100 px-2 py-1.5 [&>div]:flex-wrap [&>div]:justify-center [&>div]:pt-0">
          <Pagination page={page} totalPages={totalPages} onGoToPage={setPage} />
        </div>
      ) : null}
    </section>
  );
}

const EMPTY_BTN =
  "inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50";

export const ExamBankInlinePanel = memo(ExamBankInlinePanelImpl);
