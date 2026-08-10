"use client";

// 과제 컴포저 — VOCAB(단어 훈련) 스펙 빌더 (composer-grammar-spec 복제-변형).
// 덱 선택(저장된 질의 — vocab_drill_decks) 또는 티어/난이도 직접 지정 + 문항 수.
// 스펙 변경 300ms 디바운스로 countVocabDrillPoolAction 라이브 집계 — 0매치/부족을
// 배포 전에 그 자리에서 보여준다. 산정 우선순위는 서버 가드·학생 큐와 동일:
// senseIds > deckIds > tiers/difficulties (컴포저는 deckIds/직접 조건만 만든다).
// 배지 톤 규약: rose = 0매치(배포 거부), amber = 풀 부족(서버가 문항 수를 풀
// 크기로 클램프해 배포는 된다), slate = 정상. 라이브 집계와 배포 가드가 같은
// 술어(engine.assignmentPoolSize)를 쓰므로 배지가 약속한 N 이 곧 실제 문항 수다.

import { useEffect, useRef, useState } from "react";
import { listVocabDecks } from "@/actions/vocab-drill-admin/decks";
import {
  countVocabDrillPoolAction,
  type VocabPoolCount,
} from "@/actions/vocab-drill-admin/pool";
import { VOCAB_TIER_LABELS } from "@/lib/vocab-drill/display";
import type { VocabAssignmentPayload } from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";

const MAX_DECKS = 5; // 학생 큐(buildVocabQueue assignment 모드)의 slice(0,5)와 정합
const MIN_COUNT = 5;
const MAX_COUNT = 100;

const TIER_ORDER = ["basic", "core", "academic", "advanced"] as const;

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "D1 기초",
  2: "D2 쉬움",
  3: "D3 표준",
  4: "D4 심화",
  5: "D5 고난도",
};

function chipClass(active: boolean): string {
  return cn(
    "rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
    active
      ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-sm"
      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
  );
}

// ── 덱 목록 방어 정규화 — decks 액션(다른 소유자)의 반환 형상 변화에 견딘다 ──

interface DeckOption {
  id: string;
  title: string;
  subtitle: string | null;
  /** 표시용 단어 수 캐시(senseCountCache) — 없으면 미표기 */
  senseCount: number | null;
}

function normalizeDecks(res: unknown): DeckOption[] {
  const list = Array.isArray(res)
    ? res
    : res && typeof res === "object" && Array.isArray((res as { data?: unknown }).data)
      ? ((res as { data: unknown[] }).data)
      : [];
  const out: DeckOption[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.title !== "string") continue;
    // 보관(ARCHIVED) 덱은 신규 배포 선택지에서 제외 — status 필드 부재는 통과
    if (typeof r.status === "string" && r.status !== "ACTIVE") continue;
    out.push({
      id: r.id,
      title: r.title,
      subtitle: typeof r.subtitle === "string" ? r.subtitle : null,
      senseCount:
        typeof r.senseCountCache === "number"
          ? r.senseCountCache
          : typeof r.senseCount === "number"
            ? r.senseCount
            : null,
    });
  }
  return out;
}

/** 컴포저 ③ 패널용 래퍼 — 헤더 스트립 + 독립 스크롤 영역(어법 패널과 동형) */
export function ComposerVocabPanel({
  spec,
  onChange,
}: {
  spec: VocabAssignmentPayload;
  onChange: (next: VocabAssignmentPayload) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-100 px-4 py-2">
        <p className="text-[12px] font-semibold text-slate-500">
          출제 범위 구성
          <span className="ml-1.5 font-normal text-slate-400">
            — 선택한 덱·조건에서 학생마다 아직 풀지 않은 단어가 자동 편성됩니다
          </span>
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <ComposerVocabSpec spec={spec} onChange={onChange} />
      </div>
    </div>
  );
}

export function ComposerVocabSpec({
  spec,
  onChange,
}: {
  spec: VocabAssignmentPayload;
  onChange: (next: VocabAssignmentPayload) => void;
}) {
  // ── 덱 목록 — 마운트 1회 로드(WideModal 이 닫히면 언마운트돼 자연 초기화) ──
  const [decks, setDecks] = useState<DeckOption[] | null>(null);
  const [decksFailed, setDecksFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res: unknown = await listVocabDecks();
        if (!alive) return;
        setDecks(normalizeDecks(res));
      } catch {
        if (!alive) return;
        setDecks([]);
        setDecksFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── 라이브 풀 카운트 — 필터 변경 300ms 디바운스(count 는 배지 톤만 재계산) ──
  const filterKey = JSON.stringify({
    k: [...(spec.deckIds ?? [])].sort(),
    t: [...(spec.tiers ?? [])].sort(),
    d: [...(spec.difficulties ?? [])].sort((a, b) => a - b),
  });
  const [poolResult, setPoolResult] = useState<{
    key: string;
    pool: VocabPoolCount | null;
  } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    // seq 가드 — 늦게 도착한 이전 응답이 최신 키를 덮어쓰지 못하게 한다
    const seq = ++seqRef.current;
    const timer = setTimeout(() => {
      const f = JSON.parse(filterKey) as { k: string[]; t: string[]; d: number[] };
      countVocabDrillPoolAction({
        deckIds: f.k,
        tiers: f.t,
        difficulties: f.d,
      })
        .then((res) => {
          if (seqRef.current !== seq) return;
          setPoolResult({ key: filterKey, pool: res });
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          setPoolResult({ key: filterKey, pool: null });
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [filterKey]);

  const poolLoading = poolResult === null || poolResult.key !== filterKey;
  const pool = poolResult?.pool ?? null;

  const selectedDecks = new Set(spec.deckIds ?? []);
  const deckMode = selectedDecks.size > 0;

  const toggleDeck = (deckId: string) => {
    const next = new Set(selectedDecks);
    if (next.has(deckId)) next.delete(deckId);
    else {
      if (next.size >= MAX_DECKS) return; // 5개 상한 — 학생 큐 slice 정합
      next.add(deckId);
    }
    onChange({ ...spec, deckIds: [...next] });
  };
  const toggleTier = (tier: string) => {
    const list = new Set(spec.tiers ?? []);
    if (list.has(tier)) list.delete(tier);
    else list.add(tier);
    onChange({ ...spec, tiers: [...list] });
  };
  const toggleDifficulty = (d: number) => {
    const list = new Set(spec.difficulties ?? []);
    if (list.has(d)) list.delete(d);
    else list.add(d);
    onChange({ ...spec, difficulties: [...list].sort() });
  };
  const setCount = (n: number) =>
    onChange({ ...spec, count: Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(n))) });

  return (
    <div className="flex flex-col gap-4">
      {/* ── 덱 선택 — 저장된 질의(멤버십 테이블 없음), 최대 5개 ── */}
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
          단어 덱{" "}
          <span className="font-normal text-slate-400">
            (미선택 = 아래 조건으로 직접 지정 · 최대 {MAX_DECKS}개)
          </span>
        </p>
        {decks === null ? (
          <p className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-400">
            덱 목록을 불러오는 중입니다…
          </p>
        ) : decks.length === 0 ? (
          <p className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-400">
            {decksFailed
              ? "덱 목록을 불러오지 못했습니다. 아래 조건으로 직접 지정해 주세요."
              : "사용할 수 있는 덱이 없습니다. 아래 조건으로 직접 지정해 주세요."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {decks.map((d) => {
              const active = selectedDecks.has(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDeck(d.id)}
                  className={cn(chipClass(active), "w-full min-w-0 text-left")}
                  title={d.subtitle ?? d.title}
                >
                  <span className="block truncate">
                    {d.title}
                    {d.senseCount ? (
                      <span
                        className={cn(
                          "ml-1 font-normal tabular-nums",
                          active ? "text-blue-500" : "text-slate-400",
                        )}
                      >
                        {d.senseCount}단어
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 직접 지정(티어/난이도) — 덱 선택 시 서버가 덱 스펙을 우선한다 ── */}
      <div className={cn(deckMode && "pointer-events-none opacity-45")} aria-disabled={deckMode}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
              티어 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIER_ORDER.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className={chipClass((spec.tiers ?? []).includes(tier))}
                >
                  {VOCAB_TIER_LABELS[tier] ?? tier}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
              난이도 <span className="font-normal text-slate-400">(미선택 = 전체)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((d) => (
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
        {deckMode ? (
          <p className="mt-1.5 text-[11.5px] text-slate-400">
            덱을 선택하면 덱에 저장된 조건이 우선 적용됩니다 — 직접 지정은 덱 미선택 시에만
            반영됩니다.
          </p>
        ) : null}
      </div>

      {/* ── 문항 수 + 라이브 풀 배지 ── */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-slate-500">문항 수</p>
          <VocabPoolBadge pool={pool} loading={poolLoading} count={spec.count} />
          {/* 원클릭 보정 — 서버 클램프를 기다리지 않고 입력값을 미리 맞춰 둔다 */}
          {pool &&
          !poolLoading &&
          pool.total >= MIN_COUNT &&
          pool.total < spec.count ? (
            <button
              type="button"
              onClick={() => setCount(pool.total)}
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
        </div>
        <div className="flex items-center gap-2">
          {[10, 20, 30, 50].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={chipClass(spec.count === n)}
            >
              {n}문항
            </button>
          ))}
          <input
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={spec.count}
            onChange={(e) => setCount(Number(e.target.value) || MIN_COUNT)}
            className="h-8 w-20 rounded-md border border-slate-200 px-2 text-center text-[13px] tabular-nums text-slate-700 outline-none focus:border-blue-400"
            aria-label="문항 수 직접 입력"
          />
        </div>
      </div>
    </div>
  );
}

/** 라이브 풀 배지 — slate=정상, amber=자동 조정 예고, rose=0매치(배포 거부) */
function VocabPoolBadge({
  pool,
  loading,
  count,
}: {
  pool: VocabPoolCount | null;
  loading: boolean;
  count: number;
}) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium";
  if (!pool) {
    return (
      <span className={cn(base, "border-slate-200 bg-slate-50 text-slate-400")}>
        {loading ? "일치 단어 확인 중…" : "단어 수를 확인하지 못했습니다"}
      </span>
    );
  }
  if (pool.total === 0) {
    return (
      <span
        className={cn(
          base,
          "border-rose-200 bg-rose-50 text-rose-700",
          loading && "opacity-60",
        )}
      >
        일치하는 단어가 없습니다 — 조건을 넓혀 주세요
      </span>
    );
  }
  if (pool.total < count) {
    // 배포는 가능하다 — 서버(createStudyAssignment VOCAB 분기)가 문항 수를 풀
    // 크기로 클램프한다. 그러니 "줄이세요"가 아니라 "이렇게 나갑니다"로 알린다.
    return (
      <span
        className={cn(
          base,
          "border-amber-200 bg-amber-50 tabular-nums text-amber-700",
          loading && "opacity-60",
        )}
      >
        조건과 일치하는 단어 {pool.total}개 — 문항 수가 자동으로 {pool.total}개로
        조정됩니다
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
    >
      조건과 일치하는 단어 {pool.total}개
    </span>
  );
}
