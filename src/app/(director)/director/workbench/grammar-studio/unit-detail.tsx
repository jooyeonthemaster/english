"use client";

// ============================================================================
// 어법 훈련소 — 유닛 상세 (§D5-2: 개념·유형·난이도 칩 + 문항 전수 테이블)
//
// - 데이터: listGrammarPoolItems(유닛 스코프 1회 조회 — B-3 계약, 정답 미포함
//   메타 전용). 칩 필터는 클라이언트 측 즉답, 테이블은 내부 스크롤.
// - 행 클릭 → GrammarItemModal(정본 경로 — 정답·해설·힌트 계단 강사 뷰).
//   이 화면엔 부모 모달이 없으므로 ESC 는 WideModal 자가 처리로 충분하다.
// - 우상단 [이 유닛으로 AI 생성]: onGenerate 미전달 시 미렌더(D-2 배선 전
//   다크런칭 규약) — 전달되면 현재 칩 선택을 시드로 넘긴다.
// - b유닛(문항 0) 빈 상태: GRAMMAR_STUDIO_COPY.UNIT_EMPTY 정직 안내.
// - 칩·테이블 관용구는 unit-browser-modal(B-3)을 미러한다(수량 배지 slate —
//   킷 FilterChip 의 rose 배지는 「오답 수」 의미라 여기선 오독을 부른다).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot } from "lucide-react";

import {
  listGrammarPoolItems,
  type GrammarPoolItemList,
} from "@/actions/grammar-drill-admin/item-view";
import { GrammarItemModal } from "@/components/grammar-drill/grammar-item-modal";
import { GrammarStudioIcon } from "@/components/icons/workflow-icons";
import { SectionCard } from "@/components/layout/page-frame";
import { CardEmpty, TabEmpty } from "@/components/students/hub/analytics/kit";
import {
  CONCEPT_SKELETON_BY_ID,
  UNIT_BY_ID,
  unitLabel,
} from "@/lib/grammar-drill/curriculum";
import { DIFFICULTY_LABEL, GRAMMAR_TYPE_LABEL } from "@/lib/grammar-drill/display";
import {
  CTA_LABELS,
  GRAMMAR_STUDIO_COPY,
  UNIT_BROWSER_COPY,
} from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";

/** [이 유닛으로 AI 생성] 시드 — D-2 generate-panel 프리필 계약(선택 칩 그대로) */
export interface GrammarStudioGenerateSeed {
  unitId: string;
  /** 빈 배열 = 유닛 전체(무필터) */
  conceptIds: string[];
  itemTypes: string[];
  difficulties: number[];
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** 조회 결과 — key(fetchKey) 불일치 = 로딩 중(효과 내 동기 setState 회피) */
interface FetchResult {
  key: string;
  /** null = 조회 실패 */
  data: GrammarPoolItemList | null;
}

const ROW_GRID = "grid grid-cols-[88px_64px_minmax(0,1fr)_160px] items-center gap-x-3";

export function UnitDetail({
  unitId,
  onBack,
  onGenerate,
}: {
  unitId: string;
  onBack: () => void;
  /** D-2 배선용 — 미전달 시 [이 유닛으로 AI 생성] 버튼 미렌더 */
  onGenerate?: (seed: GrammarStudioGenerateSeed) => void;
}) {
  const unit = UNIT_BY_ID.get(unitId) ?? null;

  const [typeFilter, setTypeFilter] = useState<ReadonlySet<string>>(new Set());
  const [diffFilter, setDiffFilter] = useState<ReadonlySet<number>>(new Set());
  const [conceptFilter, setConceptFilter] = useState<ReadonlySet<string>>(new Set());
  const [itemId, setItemId] = useState<string | null>(null);
  const [fetchSeq, setFetchSeq] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);

  const fetchKey = `${unitId}|${fetchSeq}`;

  // 유닛 스코프 전수 조회 — 필터는 클라이언트 측(칩 즉답)
  useEffect(() => {
    let alive = true;
    listGrammarPoolItems({ unitIds: [unitId] })
      .then((res) => {
        if (alive) setResult({ key: fetchKey, data: res });
      })
      .catch(() => {
        if (alive) setResult({ key: fetchKey, data: null });
      });
    return () => {
      alive = false;
    };
  }, [fetchKey, unitId]);

  const loading = result === null || result.key !== fetchKey;
  const failed = !loading && result?.data == null;
  const data = loading ? null : (result?.data ?? null);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.items.filter(
      (r) =>
        (typeFilter.size === 0 || typeFilter.has(r.type)) &&
        (diffFilter.size === 0 || diffFilter.has(r.difficulty)) &&
        (conceptFilter.size === 0 || conceptFilter.has(r.conceptId)),
    );
  }, [data, typeFilter, diffFilter, conceptFilter]);

  // 칩 수량 — 유닛 전체 기준(필터 무관)이라 "넓히면 몇 개인지"가 보인다
  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    const byDiff: Record<string, number> = {};
    const byConcept: Record<string, number> = {};
    for (const r of data?.items ?? []) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      byDiff[String(r.difficulty)] = (byDiff[String(r.difficulty)] ?? 0) + 1;
      byConcept[r.conceptId] = (byConcept[r.conceptId] ?? 0) + 1;
    }
    return { byType, byDiff, byConcept };
  }, [data]);

  // 개념 칩 — 커리큘럼 정본 순서(문항 0 개념도 구조가 보이게 노출)
  const conceptOptions = useMemo(() => {
    if (!unit) return [];
    return unit.conceptIds.map((cid) => ({
      id: cid,
      title: CONCEPT_SKELETON_BY_ID.get(cid)?.title ?? cid,
    }));
  }, [unit]);

  if (!unit) return null;

  const filterCount = typeFilter.size + diffFilter.size + conceptFilter.size;
  const resetFilters = () => {
    setTypeFilter(new Set());
    setDiffFilter(new Set());
    setConceptFilter(new Set());
  };

  const unitEmpty = !loading && !failed && (data?.total ?? 0) === 0;

  const generateButton = onGenerate ? (
    <button
      type="button"
      onClick={() =>
        onGenerate({
          unitId,
          conceptIds: [...conceptFilter],
          itemTypes: [...typeFilter],
          difficulties: [...diffFilter],
        })
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      <Bot className="size-3.5" aria-hidden />
      {CTA_LABELS.GENERATE_FROM_UNIT}
    </button>
  ) : null;

  return (
    <>
      <SectionCard
        icon={GrammarStudioIcon}
        title={`${unitLabel(unitId)} · ${unit.title}`}
        description={`${unit.subtitle} — ${unit.frequencyNote}`}
        bodyClassName="p-0"
        actions={
          <>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {GRAMMAR_STUDIO_COPY.BACK_TO_UNITS}
            </button>
            {generateButton}
          </>
        }
      >
        {unitEmpty ? (
          /* ── b유닛(문항 0) — 정직 안내 + (배선 시) 생성 CTA ── */
          <TabEmpty
            icon={GrammarStudioIcon}
            title={GRAMMAR_STUDIO_COPY.UNIT_EMPTY}
            cta={generateButton}
            className="m-4"
          />
        ) : (
          <>
            {/* ── 필터 칩 — 개념·유형·난이도(빈 선택 = 전체) ── */}
            <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3">
              <ChipRow label="개념">
                {conceptOptions.map((c) => (
                  <FilterChip
                    key={c.id}
                    label={c.title}
                    count={counts.byConcept[c.id] ?? 0}
                    active={conceptFilter.has(c.id)}
                    onClick={() => setConceptFilter((s) => toggled(s, c.id))}
                  />
                ))}
              </ChipRow>
              <ChipRow label="유형">
                {Object.entries(GRAMMAR_TYPE_LABEL).map(([type, label]) => (
                  <FilterChip
                    key={type}
                    label={label}
                    count={counts.byType[type] ?? 0}
                    active={typeFilter.has(type)}
                    onClick={() => setTypeFilter((s) => toggled(s, type))}
                  />
                ))}
              </ChipRow>
              <ChipRow label="난이도">
                {[1, 2, 3, 4].map((d) => (
                  <FilterChip
                    key={d}
                    label={DIFFICULTY_LABEL[String(d)] ?? `D${d}`}
                    count={counts.byDiff[String(d)] ?? 0}
                    active={diffFilter.has(d)}
                    onClick={() => setDiffFilter((s) => toggled(s, d))}
                  />
                ))}
              </ChipRow>
            </div>

            {/* ── 카운트 스트립 ── */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2">
              <span className="text-[12px] font-semibold tabular-nums text-slate-500">
                조건과 일치하는 문항 {loading ? "…" : `${rows.length}개`}
              </span>
              {!loading && data ? (
                <span className="text-[11.5px] text-slate-400">
                  유닛 전체 {data.total}개
                </span>
              ) : null}
              {filterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-auto rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  조건 초기화
                </button>
              ) : null}
            </div>

            {/* ── 문항 전수 테이블(내부 스크롤) ── */}
            <div className="max-h-[560px] min-h-0 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col gap-2 p-4" aria-label={UNIT_BROWSER_COPY.LOADING}>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-md bg-slate-100" />
                  ))}
                </div>
              ) : failed ? (
                <div className="flex flex-col items-center gap-3 py-14">
                  <p className="text-[13px] text-rose-700">{UNIT_BROWSER_COPY.LOAD_FAILED}</p>
                  <button
                    type="button"
                    onClick={() => setFetchSeq((s) => s + 1)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                  >
                    {UNIT_BROWSER_COPY.RETRY}
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <CardEmpty text={UNIT_BROWSER_COPY.EMPTY} />
                  {filterCount > 0 ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                    >
                      조건 초기화
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      ROW_GRID,
                      "sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-2 text-[11.5px] font-semibold text-slate-400",
                    )}
                  >
                    <span>유형</span>
                    <span>난이도</span>
                    <span>발문</span>
                    <span>개념</span>
                  </div>
                  <ul>
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setItemId(r.id)}
                          title={`${r.unitTitle} · ${r.conceptTitle}`}
                          className={cn(
                            ROW_GRID,
                            "w-full border-b border-slate-50 px-4 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:bg-blue-50/60 focus-visible:outline-none",
                          )}
                        >
                          <span className="inline-flex min-w-0 items-center">
                            <span className="truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                              {GRAMMAR_TYPE_LABEL[r.type] ?? r.type}
                            </span>
                          </span>
                          <span className="text-[12px] tabular-nums text-slate-500">
                            {DIFFICULTY_LABEL[String(r.difficulty)] ?? `D${r.difficulty}`}
                          </span>
                          <span className="truncate font-serif text-[13px] text-slate-700">
                            {r.preview}
                          </span>
                          <span className="truncate text-[12px] text-slate-500">
                            {r.conceptTitle}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* 실물 확인 — 강사 뷰 모달(itemId 자가로드, 정본 경로) */}
      <GrammarItemModal
        itemId={itemId}
        attempt={null}
        open={itemId !== null}
        onClose={() => setItemId(null)}
      />
    </>
  );
}

/** 필터 행 — 좌측 고정 캡션 + 칩 랩 */
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="w-[52px] shrink-0 pt-1 text-[12px] font-semibold text-slate-500">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" role="group" aria-label={`${label} 필터`}>
        {children}
      </div>
    </div>
  );
}

/** 필터 칩 — unit-browser-modal 의 BrowserChip 관용구 미러(slate 수량 표기) */
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
        active
          ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-sm"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "shrink-0 text-[10.5px] font-bold tabular-nums",
          active ? "text-blue-500" : "text-slate-400",
        )}
      >
        {count}
      </span>
    </button>
  );
}
