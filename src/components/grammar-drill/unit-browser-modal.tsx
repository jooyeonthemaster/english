"use client";

// ============================================================================
// 유닛 실물 브라우저 — 스펙 매칭 문항 전수 테이블 (v3 design §D3-4 ③)
//
// 컴포저 어법 패널([문항 보기])과 어법 훈련소(D5)가 공유하는 도메인 중립 모달.
// props 는 {open, onClose, initialSpec, studentId?} — 호출 표면을 모른다.
//
// - open 시 내부 본체를 마운트하는 구조 — initialSpec 은 useState 지연 초기화로
//   "열림 1회 반영"을 구현하고(초기화 효과 불요), 닫으면 상태가 통째로 버려진다.
// - 데이터: listGrammarPoolItems(유닛 스코프 1회 조회, 정답 미포함 메타 전용).
//   유형·난이도·개념 필터는 클라이언트 측(칩 즉답) — 스코프는 열림 1회 고정.
// - studentId 전달 시 보충 필요 개념 문항 상단 정렬(서버) + 숙달도 열 표기.
// - 행 클릭 → GrammarItemModal(정본 경로) 중첩. ESC 는 캡처 단계에서 단일
//   가드가 처리한다(composer-grammar-spec 예시 모달 관용구 미러): 문항 모달이
//   열려 있으면 그것만, 아니면 브라우저만 닫고 전파를 끊는다 — 그대로 두면
//   부모 WideModal(컴포저)의 document 리스너까지 닿아 작성 중 폼이 닫힌다.
// - 칩은 composer-grammar-spec 의 chip 관용구를 미러한다(수량 배지는 slate —
//   킷 FilterChip 의 rose 배지는 「오답 수」 의미라 여기선 오독을 부른다).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import {
  listGrammarPoolItems,
  type GrammarPoolItemList,
} from "@/actions/grammar-drill-admin/item-view";
import { GrammarItemModal } from "@/components/grammar-drill/grammar-item-modal";
import { WideModal } from "@/components/layout/wide-modal";
import { CardEmpty, scoreText } from "@/components/students/hub/analytics/kit";
import { GRAMMAR_UNITS, UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { DIFFICULTY_LABEL, GRAMMAR_TYPE_LABEL } from "@/lib/grammar-drill/display";
import { MIN_ATTEMPTS, WEAK_SCORE } from "@/lib/grammar-drill/weakness";
import {
  METRIC_LABELS,
  UNIT_BROWSER_COPY,
  scoreExplain,
} from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";

/** 진입 프리필 스펙 — GrammarAssignmentPayload 의 필터 부분집합(도메인 중립) */
export interface UnitBrowserSpec {
  unitIds?: string[];
  conceptIds?: string[];
  itemTypes?: string[];
  difficulties?: number[];
}

export function UnitBrowserModal({
  open,
  onClose,
  initialSpec,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  /** 열림 시점 1회 반영되는 초기값 — 열려 있는 동안 부모 스펙 변경은 무시 */
  initialSpec?: UnitBrowserSpec;
  /** 지정 시 보충 필요 개념 문항 상단 정렬 + 숙달도 열 표기 */
  studentId?: string;
}) {
  // 본체는 열릴 때마다 새로 마운트 — initialSpec 지연 초기화 + 상태 전량 폐기
  if (!open) return null;
  return (
    <UnitBrowserBody onClose={onClose} initialSpec={initialSpec} studentId={studentId} />
  );
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

function UnitBrowserBody({
  onClose,
  initialSpec,
  studentId,
}: {
  onClose: () => void;
  initialSpec?: UnitBrowserSpec;
  studentId?: string;
}) {
  // 스코프(유닛 집합) — 마운트 1회 고정. 유닛 미선택·개념만 선택이면 개념의
  // 소속 유닛으로 넓혀 잡아 "유닛 전체를 둘러보며 좁히는" 동선을 보장한다.
  const [scopeUnitIds] = useState<string[]>(() => {
    const units = new Set(initialSpec?.unitIds ?? []);
    if (units.size === 0) {
      for (const cid of initialSpec?.conceptIds ?? []) {
        const unit = GRAMMAR_UNITS.find((u) => u.conceptIds.includes(cid));
        if (unit) units.add(unit.id);
      }
    }
    return [...units];
  });
  const [typeFilter, setTypeFilter] = useState<ReadonlySet<string>>(
    () => new Set(initialSpec?.itemTypes ?? []),
  );
  const [diffFilter, setDiffFilter] = useState<ReadonlySet<number>>(
    () => new Set(initialSpec?.difficulties ?? []),
  );
  const [conceptFilter, setConceptFilter] = useState<ReadonlySet<string>>(
    () => new Set(initialSpec?.conceptIds ?? []),
  );
  const [itemId, setItemId] = useState<string | null>(null);
  const [fetchSeq, setFetchSeq] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);

  const scopeKey = scopeUnitIds.join(",");
  const fetchKey = `${scopeKey}|${studentId ?? ""}|${fetchSeq}`;

  // ESC 단일 가드(캡처) — 문항 모달 → 브라우저 순으로 한 겹씩만 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (itemId) setItemId(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [itemId, onClose]);

  // 스코프 조회 — 유닛 범위 전수(무스코프면 서버가 200개 절단 + truncated)
  useEffect(() => {
    let alive = true;
    listGrammarPoolItems(
      { unitIds: scopeKey ? scopeKey.split(",") : [] },
      studentId ? { studentId } : {},
    )
      .then((res) => {
        if (alive) setResult({ key: fetchKey, data: res });
      })
      .catch(() => {
        if (alive) setResult({ key: fetchKey, data: null });
      });
    return () => {
      alive = false;
    };
  }, [fetchKey, scopeKey, studentId]);

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

  // 칩 수량 — 스코프 내 전체 기준(필터 무관)이라 "넓히면 몇 개인지"가 보인다
  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    const byDiff: Record<string, number> = {};
    for (const r of data?.items ?? []) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      byDiff[String(r.difficulty)] = (byDiff[String(r.difficulty)] ?? 0) + 1;
    }
    return { byType, byDiff };
  }, [data]);

  // 개념 칩 — 조회 결과 등장 순(서버가 보충 필요 우선으로 정렬한 순서 유지)
  const conceptOptions = useMemo(() => {
    const seen = new Map<string, { id: string; title: string; count: number }>();
    for (const r of data?.items ?? []) {
      const cur = seen.get(r.conceptId);
      if (cur) cur.count += 1;
      else seen.set(r.conceptId, { id: r.conceptId, title: r.conceptTitle, count: 1 });
    }
    return [...seen.values()];
  }, [data]);

  const hasWeakOrder = useMemo(() => {
    const mastery = data?.masteryByConcept;
    if (!mastery) return false;
    return (data?.items ?? []).some((r) => {
      const m = mastery[r.conceptId];
      return !!m && m.attempts >= MIN_ATTEMPTS && m.score < WEAK_SCORE;
    });
  }, [data]);

  const scopeSummary = useMemo(() => {
    if (scopeUnitIds.length === 0) return UNIT_BROWSER_COPY.SCOPE_ALL;
    const titles = scopeUnitIds.map((id) => UNIT_BY_ID.get(id)?.title ?? id);
    if (titles.length <= 2) return titles.join(" · ");
    return `${titles.slice(0, 2).join(" · ")} 외 ${titles.length - 2}개 유닛`;
  }, [scopeUnitIds]);

  const showMastery = Boolean(studentId);
  const rowGrid = showMastery
    ? "grid grid-cols-[88px_64px_minmax(0,1fr)_160px_100px] items-center gap-x-3"
    : "grid grid-cols-[88px_64px_minmax(0,1fr)_160px] items-center gap-x-3";

  const resetFilters = () => {
    setTypeFilter(new Set());
    setDiffFilter(new Set());
    setConceptFilter(new Set());
  };

  return (
    <>
      <WideModal
        open
        onClose={onClose}
        icon={BookOpen}
        title={UNIT_BROWSER_COPY.TITLE}
        description={scopeSummary}
        maxWidthClassName="max-w-[1180px]"
      >
        <div className="flex h-[72vh] min-h-0">
          {/* ── 좌측 필터 레일 — 유형·난이도·개념 칩(빈 선택 = 전체) ── */}
          <aside className="flex w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-4">
            <FilterGroup label="문항 유형">
              {Object.entries(GRAMMAR_TYPE_LABEL).map(([type, label]) => (
                <BrowserChip
                  key={type}
                  label={label}
                  count={counts.byType[type] ?? 0}
                  active={typeFilter.has(type)}
                  onClick={() => setTypeFilter((s) => toggled(s, type))}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="난이도">
              {[1, 2, 3, 4].map((d) => (
                <BrowserChip
                  key={d}
                  label={DIFFICULTY_LABEL[String(d)] ?? `D${d}`}
                  count={counts.byDiff[String(d)] ?? 0}
                  active={diffFilter.has(d)}
                  onClick={() => setDiffFilter((s) => toggled(s, d))}
                />
              ))}
            </FilterGroup>
            {conceptOptions.length > 0 ? (
              <FilterGroup label="세부 개념">
                {conceptOptions.map((c) => (
                  <BrowserChip
                    key={c.id}
                    label={c.title}
                    count={c.count}
                    active={conceptFilter.has(c.id)}
                    onClick={() => setConceptFilter((s) => toggled(s, c.id))}
                  />
                ))}
              </FilterGroup>
            ) : null}
          </aside>

          {/* ── 본문 — 카운트 스트립 + 문항 테이블(내부 스크롤) ── */}
          <section className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2">
              <span className="text-[12px] font-semibold tabular-nums text-slate-500">
                조건과 일치하는 문항 {loading ? "…" : `${rows.length}개`}
              </span>
              {data?.truncated ? (
                <span className="text-[11.5px] text-rose-600">
                  {UNIT_BROWSER_COPY.TRUNCATED}
                </span>
              ) : null}
              {hasWeakOrder ? (
                <span className="text-[11.5px] text-slate-400">
                  {UNIT_BROWSER_COPY.WEAK_FIRST}
                </span>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
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
                  {typeFilter.size + diffFilter.size + conceptFilter.size > 0 ? (
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
                      rowGrid,
                      "sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-2 text-[11.5px] font-semibold text-slate-400",
                    )}
                  >
                    <span>유형</span>
                    <span>난이도</span>
                    <span>발문</span>
                    <span>개념</span>
                    {showMastery ? (
                      <span className="text-right">{METRIC_LABELS.MASTERY}</span>
                    ) : null}
                  </div>
                  <ul>
                    {rows.map((r) => {
                      const m = data?.masteryByConcept?.[r.conceptId] ?? null;
                      const weak =
                        !!m && m.attempts >= MIN_ATTEMPTS && m.score < WEAK_SCORE;
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => setItemId(r.id)}
                            title={`${r.unitTitle} · ${r.conceptTitle}`}
                            className={cn(
                              rowGrid,
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
                            {showMastery ? (
                              <span className="text-right">
                                {m ? (
                                  weak ? (
                                    <span
                                      title={scoreExplain({
                                        score: m.score,
                                        attempts: m.attempts,
                                        wrong: m.wrong,
                                      })}
                                      className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-600"
                                    >
                                      {METRIC_LABELS.WEAK} {m.score}점
                                    </span>
                                  ) : (
                                    <span
                                      title={scoreExplain({
                                        score: m.score,
                                        attempts: m.attempts,
                                        wrong: m.wrong,
                                      })}
                                      className={cn(
                                        "text-[12px] font-semibold tabular-nums",
                                        scoreText(m.score),
                                      )}
                                    >
                                      {m.score}점
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[12px] text-slate-300">—</span>
                                )}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </section>
        </div>
      </WideModal>

      {/* 실물 확인 — 강사 뷰 모달 중첩(itemId 자가로드, 정본 경로) */}
      <GrammarItemModal
        itemId={itemId}
        attempt={null}
        open={itemId !== null}
        onClose={() => setItemId(null)}
      />
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** 필터 칩 — composer-grammar-spec chip 관용구 미러 + slate 수량 표기 */
function BrowserChip({
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
