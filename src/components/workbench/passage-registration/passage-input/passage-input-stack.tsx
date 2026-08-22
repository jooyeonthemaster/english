"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Check,
  ChevronsDownUp,
  Eye,
  FilePen,
  HelpCircle,
  Loader2,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { usePersistedState } from "@/hooks/use-persisted-state";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  getPassageAnalysisCreditCost,
  PASSAGE_ANALYSIS_BASE_CREDIT_COST,
  PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST,
} from "@/lib/passage-analysis-credit-costs";
import {
  LearningSheetPreviewModal,
  type LearningSheetVariant,
} from "../learning-sheet-preview-modal";
import { PassageInputRow } from "./passage-input-row";
import {
  makeEmptyRow,
  MIN_CONTENT_CHARS,
  type PassageInputRow as RowData,
} from "./types";

interface PassageInputStackProps {
  rows: RowData[];
  setRows: Dispatch<SetStateAction<RowData[]>>;
  /** True while the parent is persisting + analyzing. Locks every input. */
  saving: boolean;
  /** Persist + analyze every valid row (each carries its own annotations). */
  onAnalyze: (
    plan: QuestionGenerationPlan,
    options: { includeWorksheet: boolean; finalOnepage?: boolean },
  ) => void;
  /**
   * '지문 추가' 클릭 동작. 주어지면 내 지문함으로 돌아가 지문을 골라 담는다
   * (문제생성 워크스페이스와 동일). 없으면 빈 행을 직접 추가하는 폴백.
   */
  onAddPassage?: () => void;
  /** 변형 지문 생성 → 새 Passage 저장 + 새 행 추가 (부모가 처리). */
  onAddVariant?: (args: {
    sourcePassageId: string | null;
    title: string;
    content: string;
    mode: import("@/lib/passage-transform/schema").WholePassageTransformMode;
    direction?: import("@/lib/passage-transform/schema").VariantDirection;
  }) => Promise<boolean>;
  /**
   * 학습지 구성(기본/실전 포함) 제어 리프트 — 모바일 스텝 플로우에서 부모(하단
   * 고정 바)가 '생성하기'를 대신 눌러야 하므로, 선택 상태를 부모로 끌어올린다.
   * 미전달(PC·기존 소비처) 시 내부 usePersistedState 로 폴백해 무회귀.
   */
  includeWorksheet?: boolean;
  onIncludeWorksheetChange?: (v: boolean) => void;
  /**
   * 학습지 구성 3상품(기본/실전/파이널) 리프트 — 구 boolean 리프트의 확장.
   * sheetVariant 가 오면 includeWorksheet 보다 우선하며, 변경 통지도
   * onSheetVariantChange 한쪽으로만 나간다(구 prop 는 하위호환 유지).
   */
  sheetVariant?: LearningSheetVariant;
  onSheetVariantChange?: (v: LearningSheetVariant) => void;
}

/**
 * Unified multi-passage annotation surface for the 학습지 생성 page. Replaces
 * both the old single-passage center editor AND the separate 직접 입력 paste tab:
 * a numbered stack of passage cards (지문 1·2·N), each with its own tiptap
 * annotation editor + per-row AI 복원, a 지문 추가 button, and a single 분석 시작
 * footer that analyzes them all (marks → per-passage analysis). Drafts checked
 * in 자료 관리 are loaded in as rows by the parent.
 */
export function PassageInputStack({
  rows,
  setRows,
  saving,
  onAnalyze,
  onAddPassage,
  onAddVariant,
  includeWorksheet: includeWorksheetProp,
  onIncludeWorksheetChange,
  sheetVariant: sheetVariantProp,
  onSheetVariantChange,
}: PassageInputStackProps) {
  // 지문 입력 행 영역 — '생성하기'가 비활(유효 지문 0개)일 때 눌리면 이 안의
  // 행 카드들을 글로우해 "지문을 먼저 입력하세요"를 유도한다.
  const rowsZoneRef = useRef<HTMLDivElement>(null);

  const updateRow = (localId: string, patch: Partial<RowData>) =>
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
    );

  const addRow = () =>
    setRows((prev) => [...prev, makeEmptyRow()]);

  // 문제생성 워크스페이스처럼 행은 0개까지 비울 수 있다 — 마지막 카드를 지우면
  // 빈 워크스페이스('지문 추가' 버튼만)로 돌아간다.
  const removeRow = (localId: string) =>
    setRows((prev) => prev.filter((r) => r.localId !== localId));

  // Replace one row with N rows built from its detected chunks (smart-split).
  const splitRow = (localId: string, chunks: string[]) =>
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.localId === localId);
      if (idx < 0) return prev;
      const built = chunks.map((c, i) => {
        const row = makeEmptyRow(c);
        // Keep the original title on the first chunk only.
        if (i === 0 && prev[idx].title) row.title = prev[idx].title;
        return row;
      });
      return [...prev.slice(0, idx), ...built, ...prev.slice(idx + 1)];
    });

  // ── 새로 추가/불러온 행에 파란 글로우를 한 번 반짝인다 ──
  // 처음 마운트된 행들은 미리 "본 적 있음"으로 등록해 두어 글로우가 뜨지 않게
  // 하고, 이후 새로 등장하는 localId(불러오기·지문 추가·스마트 분할)에만 글로우를
  // 붙인다. 애니메이션이 끝나면 해당 행의 글로우 상태를 해제한다.
  const seenIdsRef = useRef<Set<string> | null>(null);
  if (seenIdsRef.current === null) {
    seenIdsRef.current = new Set(rows.map((r) => r.localId));
  }
  const [glowingIds, setGlowingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fresh = rows
      .map((r) => r.localId)
      .filter((id) => !seenIdsRef.current!.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seenIdsRef.current!.add(id));
    setGlowingIds((prev) => {
      const next = new Set(prev);
      fresh.forEach((id) => next.add(id));
      return next;
    });
  }, [rows]);

  const clearGlow = (localId: string) =>
    setGlowingIds((prev) => {
      if (!prev.has(localId)) return prev;
      const next = new Set(prev);
      next.delete(localId);
      return next;
    });

  const validRows = useMemo(
    () => rows.filter((r) => r.content.trim().length >= MIN_CONTENT_CHARS),
    [rows],
  );
  const canAnalyze = validRows.length > 0 && !saving;

  const primaryAnalysisPlan: QuestionGenerationPlan = "STANDARD";
  const primaryUnitCost = PASSAGE_ANALYSIS_BASE_CREDIT_COST;

  // ── 학습지 구성 선택 — 기본/실전 포함/파이널 원페이지 (선택은 브라우저에 기억) ──
  // 부모가 제어 값을 넘기면(모바일 스텝 플로우) 그것을 쓰고, 아니면 내부에
  // 로컬 저장한다. 두 경로 모두 같은 저장 키를 공유해 값이 어긋나지 않는다.
  // 정본은 신규 variant 키이며, 구 boolean 키(include-worksheet)는 다른 소비처
  // 무회귀를 위해 계속 동기 기록한다.
  // 구 boolean 키는 쓰기 전용(동기 기록)으로만 쓴다 — 읽기 정본은 variant 키.
  const [, setLocalIncludeWorksheet] = usePersistedState<boolean>(
    "smoat:passages-create:include-worksheet",
    false,
    (v): v is boolean => typeof v === "boolean",
  );
  const [localVariant, setLocalVariant] =
    usePersistedState<LearningSheetVariant>(
      "smoat:passages-create:sheet-variant",
      "basic",
      (v): v is LearningSheetVariant =>
        v === "basic" || v === "practice" || v === "final",
    );
  // 구 boolean 키 → 신규 variant 키 1회 마이그레이션 — 신규 키가 이미 있으면
  // 그 값이 정본이고, 없을 때만 구 키 true 를 practice 로 시드한다(false→basic 은
  // 초기값과 같아 별도 기록 불필요).
  useEffect(() => {
    try {
      if (
        window.localStorage.getItem("smoat:passages-create:sheet-variant") !== null
      ) {
        return;
      }
      const legacy = window.localStorage.getItem(
        "smoat:passages-create:include-worksheet",
      );
      if (legacy !== null && JSON.parse(legacy) === true) {
        setLocalVariant("practice");
      }
    } catch {
      /* 저장소 접근 불가 시 기본값(basic) 유지 */
    }
    // 마운트 1회 — 저장 키는 컴포넌트 수명 동안 불변.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // variant 리프트가 오면 그것이 정본, 없으면 구 boolean 리프트를 variant 로
  // 해석(하위호환), 둘 다 없으면 로컬 저장값.
  const sheetVariant: LearningSheetVariant =
    sheetVariantProp ??
    (includeWorksheetProp !== undefined
      ? includeWorksheetProp
        ? "practice"
        : "basic"
      : localVariant);
  const includeWorksheet = sheetVariant === "practice";
  const setSheetVariant = (v: LearningSheetVariant) => {
    setLocalVariant(v);
    // 구 boolean 키 동기 기록 — include-worksheet 소비처(모바일 하단 바 등) 무회귀.
    setLocalIncludeWorksheet(v === "practice");
    // variant-인지 부모에게는 variant 만 통지한다 — 구 콜백까지 함께 부르면
    // final 이 boolean(false)으로 강등되어 부모 상태를 덮을 수 있다.
    if (onSheetVariantChange) onSheetVariantChange(v);
    else onIncludeWorksheetChange?.(v === "practice");
  };
  const [previewVariant, setPreviewVariant] =
    useState<LearningSheetVariant | null>(null);

  const worksheetUnitCost = PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST;
  const n = validRows.length;
  // 파이널 원페이지는 지문당 기본가(◈5)와 동일 단가라 includeWorksheet=false
  // 경로의 계산식이 그대로 성립한다(스펙 §1 가격 정본).
  const selectedUnitCost = getPassageAnalysisCreditCost({ includeWorksheet });
  const primaryTotal = selectedUnitCost * Math.max(1, n);
  const selectedSheetLabel =
    sheetVariant === "final"
      ? "파이널 원페이지"
      : sheetVariant === "practice"
        ? "실전 학습지 포함"
        : "기본 학습지";

  const countChip =
    n > 1 ? (
      <span className="inline-flex items-center rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
        {n}개
      </span>
    ) : null;

  // 워크스페이스가 비어 있으면(불러온/입력한 지문 0개) '지문 추가' 버튼만 남기고
  // 학습지 구성·생성 푸터는 숨긴다 — 문제생성 워크스페이스의 빈 상태와 동일.
  const isEmpty = rows.length === 0;

  // ── 카드 선택 (체크박스) ──
  // 제거된 행의 잔여 id 는 무해(localId 는 재사용되지 않음). 개수는 현재 행 기준
  // 으로 라이브 계산해 정확도를 유지한다.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const toggleSelected = (localId: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  const selectedCount = useMemo(
    () => rows.reduce((n, r) => n + (selectedIds.has(r.localId) ? 1 : 0), 0),
    [rows, selectedIds],
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.localId)));

  // ── 워크스페이스 헤더 동작 ──
  const setAllCollapsed = (collapsed: boolean) =>
    setRows((prev) =>
      prev.map((r) => (r.collapsed === collapsed ? r : { ...r, collapsed })),
    );
  // 선택된 카드가 있으면 그것만 워크스페이스에서 빼고, 없으면 전체를 비운다.
  const clearWorkspace = () => {
    if (saving) return;
    if (selectedCount > 0) {
      setRows((prev) => prev.filter((r) => !selectedIds.has(r.localId)));
      setSelectedIds(new Set());
      return;
    }
    if (
      window.confirm("워크스페이스를 비울까요? (불러온 지문은 삭제되지 않습니다)")
    ) {
      setRows([]);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-slate-50/60">
      {/* 워크스페이스 헤더 — 전체 펼치기 · 제목/개수 · 모두 접기 · 비우기
          (문제생성 지문 워크스페이스 헤더와 동일 구성: 박스 없이 하단 보더만).
          비어 있어도 제목 바는 항상 노출하고, 행에 의존하는 컨트롤(체크박스·개수·
          액션)만 숨긴다. */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-100 bg-white pl-3 pr-1.5">
        {!isEmpty ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected}
            aria-label="전체 선택"
            title="지문 전체 선택 / 해제"
            onClick={toggleSelectAll}
            className={
              "flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors " +
              (allSelected
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-slate-300 bg-white text-transparent hover:border-blue-400")
            }
          >
            <Check className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
        <FilePen
          className="h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden="true"
        />
        <h3 className="shrink-0 text-[12.5px] font-bold text-slate-800">
          학습지 워크스페이스
        </h3>
        {!isEmpty ? (
          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold leading-none text-white tabular-nums">
            {rows.length}
          </span>
        ) : null}
        <span className="min-w-0 flex-1" aria-hidden="true" />
        {!isEmpty ? (
          <>
            <span
              className="mx-0.5 h-4 w-px shrink-0 bg-slate-200"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() =>
                toast.info(
                  "지문을 펼쳐 마킹·AI 변형하고, 아래 '생성하기'로 학습지를 만드세요.",
                )
              }
              title="기능 안내"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setAllCollapsed(true)}
              title="모두 접기"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearWorkspace}
              disabled={saving}
              title={
                selectedCount > 0
                  ? `선택한 지문 ${selectedCount}개 빼기 (지문은 삭제되지 않음)`
                  : "워크스페이스 비우기 (지문은 삭제되지 않음)"
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {/* Rows (scrollable). With a single row, it stretches to fill the height. */}
      <div
        ref={rowsZoneRef}
        // 반응형 그리드 — 넓은 화면에서 카드가 2열로 동일 폭 타일된다(펼침/접힘
        // 무관). items-start 로 둬서 접힌(짧은) 카드가 옆의 펼친(긴) 카드 높이에
        // 맞춰 늘어나 '빈 카드'처럼 보이지 않게 한다. 패널(IntakeSurface 오버레이)이
        // 고정 높이를 주므로 flex-1 로 영역을 채우고 그 안에서만 스크롤된다.
        className="grid min-h-0 flex-1 grid-cols-1 content-start items-start gap-2.5 overflow-y-auto p-3 xl:grid-cols-2"
      >
        {rows.map((row, i) => (
          <PassageInputRow
            key={row.localId}
            index={i}
            row={row}
            onChange={(patch) => updateRow(row.localId, patch)}
            onRemove={() => removeRow(row.localId)}
            canRemove
            removeMode="delete"
            disabled={saving}
            onSplit={(chunks) => splitRow(row.localId, chunks)}
            justAdded={glowingIds.has(row.localId)}
            onGlowEnd={() => clearGlow(row.localId)}
            selected={selectedIds.has(row.localId)}
            onToggleSelected={() => toggleSelected(row.localId)}
            enableAiTransforms
            onAddVariant={onAddVariant}
          />
        ))}

        {/* 지문 추가 — 지문 카드와 같은 가로 폭(2열이면 반쪽), 높이는 고정
            (self-start 로 옆 카드 높이에 맞춰 늘어나지 않게). 클릭하면 내
            지문함으로 돌아가 지문을 골라 담는다(문제생성 워크스페이스와 동일). */}
        <button
          type="button"
          onClick={onAddPassage ?? addRow}
          disabled={saving}
          className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-slate-300 bg-white text-[12.5px] font-semibold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          빈 지문 추가
        </button>

        {/* 빈 워크스페이스 안내 — 추가 버튼 아래 빈 공간 가운데에 회색 문구
            (문제생성 워크스페이스와 동일). */}
        {isEmpty ? (
          <div className="col-span-full flex min-h-[320px] items-center justify-center">
            <p className="text-[13px] font-medium text-slate-400">
              지문을 먼저 추가해주세요
            </p>
          </div>
        ) : null}
      </div>

      {!isEmpty && (
        <div className="shrink-0 px-3 pb-3">
      {/* ── 학습지 구성 선택 — 무엇이 만들어지는지 실물로 보고 고른다 ── */}
      <div className="shrink-0">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            학습지 구성
          </span>
          <button
            type="button"
            onClick={() => setPreviewVariant(sheetVariant)}
            className="flex items-center gap-1 text-[11.5px] font-bold text-blue-600 transition-colors hover:text-blue-700 hover:underline"
          >
            <Eye className="size-3.5" />
            실제 생성 예시 보기
          </button>
        </div>
        <div
          role="radiogroup"
          aria-label="학습지 구성 선택"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {(
            [
              {
                id: "basic" as const,
                selected: sheetVariant === "basic",
                title: "기본 학습지",
                desc: "원문 필기 캔버스 · 요약 · 어법 · 출제 포인트 · 어휘 · 구문 분석",
                unit: primaryUnitCost,
              },
              {
                id: "practice" as const,
                selected: sheetVariant === "practice",
                title: "실전 학습지 포함",
                desc: "기본 구성 + 어법 선택 워크북 · 어휘 빈칸 · 배열 영작 + 수능형 추론 5문항",
                unit: primaryUnitCost + worksheetUnitCost,
              },
              {
                id: "final" as const,
                selected: sheetVariant === "final",
                title: "파이널 원페이지",
                desc: "시험 직전 족집게 · 손필기 원문 분석 · 유형별 출제 포인트·함정 · A4 딱 1장",
                unit: primaryUnitCost,
              },
            ]
          ).map((option) => (
            <div
              key={option.id}
              role="radio"
              aria-checked={option.selected}
              tabIndex={0}
              onClick={() => !saving && setSheetVariant(option.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!saving) setSheetVariant(option.id);
                }
              }}
              className={`group flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2.5 transition-all ${
                option.selected
                  ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
              } ${saving ? "pointer-events-none opacity-60" : ""}${
                // 3번째 카드(파이널)는 설명이 길어 2열 그리드에서 전폭을 쓴다.
                option.id === "final" ? " sm:col-span-2" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    option.selected
                      ? "border-blue-500 bg-blue-500"
                      : "border-slate-300 bg-white group-hover:border-slate-400"
                  }`}
                >
                  {option.selected ? (
                    <span className="size-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[12.5px] font-bold ${
                    option.selected ? "text-blue-800" : "text-slate-700"
                  }`}
                >
                  {option.title}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    option.selected
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  지문당 ◈{option.unit}
                </span>
              </div>
              <p className="pl-5 text-[11px] leading-snug text-slate-500">
                {option.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Generate footer — 모바일(<lg)에서는 하단 고정 스텝 바가 '생성하기'를
          대신 소유하므로 숨긴다(PC 는 그대로). */}
      <div className="mt-2 w-full shrink-0 max-lg:hidden">
        <Button
          // aria-disabled — 비활처럼 보이되 클릭은 살려, 유효 지문이 없을 때 누르면
          // 입력 행을 글로우해 "지문을 먼저 입력하세요"를 유도한다.
          aria-disabled={!canAnalyze}
          onClick={() => {
            if (saving) return;
            if (validRows.length === 0) {
              triggerHintGlowWithin(rowsZoneRef.current, ":scope > div");
              return;
            }
            // final 선택 시 includeWorksheet=false 강제(조합 금지 — 스펙 §1),
            // finalOnepage 는 true 일 때만 키 존재(부재 스프레드 무회귀).
            onAnalyze(primaryAnalysisPlan, {
              includeWorksheet,
              ...(sheetVariant === "final" ? { finalOnepage: true } : {}),
            });
          }}
          className={
            "h-10 w-full rounded-lg px-3 text-[13px] font-extrabold " +
            (canAnalyze
              ? "bg-blue-600 hover:bg-blue-700"
              : "cursor-not-allowed bg-blue-300 hover:bg-blue-300")
          }
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Wand2 className="size-4" />
          )}
          {selectedSheetLabel} 생성하기
          {countChip}
          <span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
            {primaryTotal.toLocaleString("ko-KR")} 크레딧
          </span>
        </Button>
      </div>
        </div>
      )}

      {/* 실제 학습지 미리보기 — 기본/실전 비교는 실제 생성 데이터 그대로 */}
      <LearningSheetPreviewModal
        open={previewVariant !== null}
        initialVariant={previewVariant ?? "basic"}
        basicUnitCost={primaryUnitCost}
        onClose={() => setPreviewVariant(null)}
        onApplyVariant={(variant) => {
          setSheetVariant(variant);
          setPreviewVariant(null);
        }}
      />
    </div>
  );
}
