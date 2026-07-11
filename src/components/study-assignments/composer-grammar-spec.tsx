"use client";

// 과제 컴포저 — GRAMMAR(어법 훈련) 스펙 빌더.
// 유닛/개념/유형/난이도 칩 + 문항 수. 취약 개념 프리셋(전달 시) 원클릭 채움.
// 스펙 변경 300ms 디바운스로 countGrammarDrillPool 라이브 집계 — 0매치/부족을
// 배포 전에 그 자리에서 보여주고, 예시 문항은 GrammarItemModal 로 실물 확인.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import {
  countGrammarDrillPool,
  type GrammarPoolCount,
} from "@/actions/grammar-drill-admin";
import { GrammarItemModal } from "@/components/students/hub/grammar-item-modal";
import {
  CONCEPT_SKELETON_BY_ID,
  GRAMMAR_UNITS,
} from "@/lib/grammar-drill/curriculum";
import { GRAMMAR_TYPE_LABEL } from "@/lib/grammar-drill/display";
import type { GrammarAssignmentPayload } from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";

export interface WeakConceptPreset {
  conceptId: string;
  title: string;
  score: number;
}

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "D1 기초",
  2: "D2 표준",
  3: "D3 심화",
  4: "D4 킬러",
};

function chipClass(active: boolean): string {
  return cn(
    "rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
    active
      ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-sm"
      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
  );
}

/** 컴포저 ③ 패널용 래퍼 — 헤더 스트립 + 독립 스크롤 영역에 스펙 빌더를 담는다 */
export function ComposerGrammarPanel({
  spec,
  onChange,
  weakConcepts,
}: {
  spec: GrammarAssignmentPayload;
  onChange: (next: GrammarAssignmentPayload) => void;
  weakConcepts?: WeakConceptPreset[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-100 px-4 py-2">
        <p className="text-[12px] font-semibold text-slate-500">
          출제 범위 구성
          <span className="ml-1.5 font-normal text-slate-400">
            — 선택한 조건으로 학생마다 취약 우선 문항이 자동 편성됩니다
          </span>
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <ComposerGrammarSpec spec={spec} onChange={onChange} weakConcepts={weakConcepts} />
      </div>
    </div>
  );
}

export function ComposerGrammarSpec({
  spec,
  onChange,
  weakConcepts,
}: {
  spec: GrammarAssignmentPayload;
  onChange: (next: GrammarAssignmentPayload) => void;
  weakConcepts?: WeakConceptPreset[];
}) {
  // ── 라이브 풀 카운트 — 필터 변경 300ms 디바운스 후 서버 집계(DB 0회) ──
  // count 는 집계에 영향이 없으므로 키에서 제외(변경 시 배지 톤만 재계산).
  const filterKey = JSON.stringify({
    u: [...(spec.unitIds ?? [])].sort(),
    c: [...(spec.conceptIds ?? [])].sort(),
    t: [...(spec.itemTypes ?? [])].sort(),
    d: [...(spec.difficulties ?? [])].sort((a, b) => a - b),
  });
  const [pool, setPool] = useState<GrammarPoolCount | null>(null);
  const [poolLoading, setPoolLoading] = useState(true);
  const seqRef = useRef(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    setPoolLoading(true);
    const timer = setTimeout(() => {
      const f = JSON.parse(filterKey) as {
        u: string[];
        c: string[];
        t: string[];
        d: number[];
      };
      countGrammarDrillPool({
        unitIds: f.u,
        conceptIds: f.c,
        itemTypes: f.t,
        difficulties: f.d,
      })
        .then((res) => {
          if (seqRef.current !== seq) return;
          setPool(res);
          setPreviewIdx(0);
          setPoolLoading(false);
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setPool(null);
          setPoolLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [filterKey]);

  // 예시 모달이 열려 있을 때 ESC 는 캡처 단계에서 가로채 예시만 닫는다 —
  // 그대로 두면 컴포저(WideModal)의 document 리스너까지 닿아 작성 중인
  // 과제 폼 전체가 닫힌다.
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPreviewOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [previewOpen]);

  const samples = pool?.sampleItemIds ?? [];
  const clampedIdx = Math.min(previewIdx, Math.max(0, samples.length - 1));

  const toggle = (key: "unitIds" | "conceptIds" | "itemTypes", value: string) => {
    const list = new Set(spec[key] ?? []);
    if (list.has(value)) list.delete(value);
    else list.add(value);
    onChange({ ...spec, [key]: [...list] });
  };
  const toggleDifficulty = (d: number) => {
    const list = new Set(spec.difficulties ?? []);
    if (list.has(d)) list.delete(d);
    else list.add(d);
    onChange({ ...spec, difficulties: [...list].sort() });
  };

  const selectedUnits = new Set(spec.unitIds ?? []);
  // 개념 칩은 선택한 유닛 범위(미선택 시 전체가 아니라 취약 프리셋만 노출해 밀도 관리)
  const conceptChoices = GRAMMAR_UNITS.filter(
    (u) => selectedUnits.size === 0 || selectedUnits.has(u.id),
  );

  return (
    <div className="flex flex-col gap-4">
      {weakConcepts && weakConcepts.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-slate-600">
              취약 개념 프리셋 — 숙달도가 낮은 개념으로 바로 구성합니다
            </p>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...spec,
                  unitIds: [],
                  conceptIds: weakConcepts.map((w) => w.conceptId),
                })
              }
              className="shrink-0 rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
            >
              프리셋 적용
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {weakConcepts.map((w) => (
              <span
                key={w.conceptId}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
              >
                {w.title}
                <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold tabular-nums text-rose-600">
                  {w.score}점
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
          유닛 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {GRAMMAR_UNITS.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle("unitIds", u.id)}
              className={cn(chipClass(selectedUnits.has(u.id)), "w-full truncate text-left")}
              title={u.subtitle}
            >
              {u.order}. {u.title}
            </button>
          ))}
        </div>
      </div>

      {(spec.conceptIds?.length ?? 0) > 0 || selectedUnits.size > 0 ? (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
            세부 개념 <span className="font-normal text-slate-400">(미선택 = 유닛 전체)</span>
          </p>
          <div className="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
            {conceptChoices.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-20 shrink-0 text-[11px] font-medium text-slate-400">
                  {u.title}
                </span>
                {u.conceptIds.map((cid) => (
                  <ConceptChip
                    key={cid}
                    conceptId={cid}
                    active={(spec.conceptIds ?? []).includes(cid)}
                    onToggle={() => toggle("conceptIds", cid)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
            문항 유형 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(GRAMMAR_TYPE_LABEL).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => toggle("itemTypes", type)}
                className={chipClass((spec.itemTypes ?? []).includes(type))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
            난이도 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDifficulty(d)}
                className={chipClass((spec.difficulties ?? []).includes(d))}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-slate-500">문항 수</p>
          <PoolBadge pool={pool} loading={poolLoading} count={spec.count} />
          {/* 원클릭 보정 — 배지가 알린 문제(부족/0매치)를 그 자리에서 푼다 */}
          {pool && !poolLoading && pool.total > 0 && pool.total < spec.count ? (
            <button
              type="button"
              onClick={() => onChange({ ...spec, count: pool.total })}
              className="rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              → {pool.total}문항으로 맞추기
            </button>
          ) : null}
          {pool && !poolLoading && pool.total === 0 ? (
            <button
              type="button"
              onClick={() => onChange({ count: spec.count })}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              조건 초기화
            </button>
          ) : null}
          {samples.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setPreviewIdx(0);
                setPreviewOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <Eye className="size-3" aria-hidden />
              예시 문항 보기
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {[10, 20, 30, 50].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...spec, count: n })}
              className={chipClass(spec.count === n)}
            >
              {n}문항
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={100}
            value={spec.count}
            onChange={(e) =>
              onChange({
                ...spec,
                count: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
              })
            }
            className="h-8 w-20 rounded-md border border-slate-200 px-2 text-center text-[13px] tabular-nums text-slate-700 outline-none focus:border-blue-400"
            aria-label="문항 수 직접 입력"
          />
        </div>
      </div>

      {/* 예시 문항 실물 확인 — 기존 강사 뷰 모달 재사용(itemId 자가로드) */}
      <GrammarItemModal
        itemId={samples[clampedIdx] ?? null}
        attempt={null}
        open={previewOpen && samples.length > 0}
        onClose={() => setPreviewOpen(false)}
      />
      {previewOpen && samples.length > 1 && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-lg">
              <button
                type="button"
                onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
                disabled={clampedIdx === 0}
                aria-label="이전 예시 문항"
                className="flex size-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="px-1 text-[11.5px] font-semibold tabular-nums text-slate-600">
                예시 {clampedIdx + 1} / {samples.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPreviewIdx((i) => Math.min(samples.length - 1, i + 1))
                }
                disabled={clampedIdx === samples.length - 1}
                aria-label="다음 예시 문항"
                className="flex size-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** 라이브 풀 배지 — slate=정상, rose=0매치/문항 수 부족(주황 금지 계약) */
function PoolBadge({
  pool,
  loading,
  count,
}: {
  pool: GrammarPoolCount | null;
  loading: boolean;
  count: number;
}) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium";
  if (!pool) {
    return (
      <span className={cn(base, "border-slate-200 bg-slate-50 text-slate-400")}>
        {loading ? "일치 문항 확인 중…" : "문항 수를 확인하지 못했습니다"}
      </span>
    );
  }
  const breakdown = [
    ...Object.entries(pool.byType).map(
      ([t, n]) => `${GRAMMAR_TYPE_LABEL[t] ?? t} ${n}`,
    ),
    ...Object.entries(pool.byDifficulty).map(([d, n]) => `D${d} ${n}`),
  ].join(" · ");
  if (pool.total === 0) {
    return (
      <span
        className={cn(
          base,
          "border-rose-200 bg-rose-50 text-rose-700",
          loading && "opacity-60",
        )}
      >
        일치하는 문항이 없습니다 — 조건을 넓혀 주세요
      </span>
    );
  }
  if (pool.total < count) {
    return (
      <span
        className={cn(
          base,
          "border-rose-200 bg-rose-50 tabular-nums text-rose-700",
          loading && "opacity-60",
        )}
        title={breakdown}
      >
        조건과 일치하는 문항 {pool.total}개 — 문항 수를 {pool.total}개 이하로
        줄이거나 조건을 넓혀 주세요
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "border-slate-200 bg-slate-50 tabular-nums text-slate-600",
        loading && "opacity-60",
      )}
      title={breakdown}
    >
      조건과 일치하는 문항 {pool.total}개
    </span>
  );
}

function ConceptChip({
  conceptId,
  active,
  onToggle,
}: {
  conceptId: string;
  active: boolean;
  onToggle: () => void;
}) {
  const skeleton = CONCEPT_SKELETON_BY_ID.get(conceptId);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(chipClass(active), "max-w-[220px] truncate")}
      title={skeleton?.oneLiner ?? conceptId}
    >
      {skeleton?.title ?? conceptId}
    </button>
  );
}
