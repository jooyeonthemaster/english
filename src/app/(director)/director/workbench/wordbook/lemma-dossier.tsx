"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 표제어 도시에 (우측 열)
//
// 왜 내용을 한 벌로 접었는가: 데스크톱 aside 와 모바일 슬라이드오버가 같은
// 내용을 공유해야 하므로 상태 3종(개관/스켈레톤/도시에)을 하나의 content 로
// 만들고 컨테이너만 두 벌 둔다. 미선택 시 빈 패널 대신 「코퍼스 개관」을
// 채워 우측 열이 항상 정보를 내도록 한다.
//
// ★ 척도 주의(wordbook-dossier.ts): 뜻별 연대·학년 분포는 수집 예문 "표본"
//   기준, 25개년·시행처·유형은 코퍼스 "전수" 기준 — 각주로 반드시 구분한다.
// ============================================================================

import { useState, type ReactNode } from "react";
import { Check, ChevronRight, Plus, X } from "lucide-react";
import { VOCAB_TRAP_KIND_LABELS } from "@/lib/vocab-drill/display";
import {
  DiffDots, fmt, fmt1, HBarList, PosChip, posKo, SectionTitle, SegBar,
  TierChip, tierKo, TrendChip, YearBars,
} from "./wordbook-ui";
import type {
  DossierExample, DossierSense, WordbookBasketItem, WordbookLemmaDossier,
  WordbookOverview,
} from "./wordbook-types";

interface LemmaDossierProps {
  dossier: WordbookLemmaDossier | null;
  loading: boolean;
  overview: WordbookOverview;
  basketSenseIds: ReadonlySet<string>;
  onToggleBasket: (item: WordbookBasketItem) => void;
  onNavigateLemma: (lemmaId: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
  /** 데스크톱 열 폭(px) — 셸의 리사이저블 패널이 관장. 0 = 접힘(열 미렌더) */
  desktopWidth?: number;
}

// byBoard JSONB 실제 키 → 화면 라벨·색(색 규약은 wordbook-ui.tsx 헤더가 정본).
const BOARD_PARTS = [
  { key: "학력평가", label: "학평", color: "bg-slate-300" },
  { key: "수능모의평가", label: "모평", color: "bg-slate-500" },
  { key: "대학수학능력시험", label: "수능", color: "bg-slate-900" },
] as const;

const GRADE_PARTS = [
  { key: "고1", color: "bg-sky-400" },
  { key: "고2", color: "bg-blue-500" },
  { key: "고3", color: "bg-indigo-600" },
] as const;

export function LemmaDossier({
  dossier, loading, overview, basketSenseIds, onToggleBasket, onNavigateLemma,
  mobileOpen, onClose, desktopWidth,
}: LemmaDossierProps) {
  const content = loading ? (
    <SkeletonPane />
  ) : dossier ? (
    <DossierPane
      dossier={dossier}
      basketSenseIds={basketSenseIds}
      onToggleBasket={onToggleBasket}
      onNavigateLemma={onNavigateLemma}
    />
  ) : (
    <OverviewPane overview={overview} />
  );

  return (
    <>
      {/* 데스크톱 — 3열 워크스테이션의 우측 열. 폭은 셸의 핸들이 조절(0=접힘).
          key 로 표제어 전환 시 스크롤을 맨 위로 되돌린다(긴 도시에 잔류 방지) */}
      {desktopWidth !== 0 ? (
        <aside
          className="hidden shrink-0 flex-col border-l border-slate-200 lg:flex"
          style={{ width: desktopWidth ?? 440 }}
        >
          <div key={dossier ? dossier.lemma.id : "overview"} className="min-h-0 flex-1 overflow-y-auto">
            {content}
          </div>
        </aside>
      ) : null}

      {/* lg 미만 — 슬라이드오버(개관은 모바일에선 띄우지 않는다) */}
      {mobileOpen && (dossier || loading) ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
          <div className="absolute inset-y-0 right-0 flex h-full w-full flex-col bg-white shadow-2xl sm:w-[440px]">
            <button
              type="button" aria-label="닫기" onClick={onClose}
              className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 hover:bg-slate-50"
            >
              <X className="size-4" />
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 본문 섹션 공통 틀 — 좌우 px-3 끝선 정렬·헤어라인 리듬을 한 곳에서 강제. */
function Sec({ title, hint, children }: { title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-3 py-2.5">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      {children}
    </section>
  );
}

// ── 상태 1 — 코퍼스 개관(미선택 대시보드) ────────────────────────────────────

function OverviewPane({ overview }: { overview: WordbookOverview }) {
  const byYear: Record<string, number> = {};
  for (const r of overview.examplesByYear) byYear[String(r.year)] = r.count;

  // 분포 4종은 모양이 같다 — 데이터로 접어 섹션 반복을 없앤다.
  const dists: { title: string; items: { label: string; value: number }[]; accent?: string; maxItems?: number }[] = [
    { title: "품사 분포", maxItems: 9, items: overview.posDist.map((d) => ({ label: posKo(d.key), value: d.count })) },
    { title: "수준 분포", accent: "bg-violet-500", items: overview.tierDist.map((d) => ({ label: tierKo(d.key), value: d.count })) },
    { title: "난이도 분포", items: overview.diffDist.map((d) => ({ label: `난이도 ${d.key}`, value: d.count })) },
    { title: "추세 분포", maxItems: 8, items: overview.trendDist.map((d) => ({ label: d.key, value: d.count })) },
  ];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 px-3 pb-2.5 pt-3">
        <h2 className="text-[13px] font-bold tracking-tight text-slate-900">기출 전체 한눈에</h2>
        <span className="truncate text-[10px] text-slate-400" title="활성 번들">
          {overview.bundleVersion}
        </span>
      </div>

      {overview.yearMax > 0 ? (
        <Sec title="연도별 기출 예문">
          <YearBars data={byYear} from={overview.yearMin} to={overview.yearMax} />
        </Sec>
      ) : null}

      <Sec title="시험 종류 구성">
        <SegBar
          parts={overview.boardTotals.map((b) => ({
            label: b.board,
            value: b.count,
            color: BOARD_PARTS.find((p) => p.label === b.board)?.color ?? "bg-slate-300",
          }))}
        />
      </Sec>

      {dists.map((d) => (
        <Sec key={d.title} title={d.title}>
          <HBarList items={d.items} accent={d.accent} maxItems={d.maxItems} />
        </Sec>
      ))}

      <p className="break-keep px-3 pb-6 pt-3 text-[11px] leading-relaxed text-slate-400">
        왼쪽 표에서 단어를 누르면 이 자리에 단어 분석이 뜹니다.
      </p>
    </div>
  );
}

// ── 상태 2 — 스켈레톤(실제 섹션 리듬을 흉내낸다) ─────────────────────────────

function SkeletonPane() {
  return (
    <div className="animate-pulse space-y-3 px-3 py-3">
      <div className="h-7 w-2/5 rounded bg-slate-100" />
      <div className="h-16 rounded-lg bg-slate-100" />
      <div className="h-20 rounded bg-slate-100" />
      <div className="h-8 rounded bg-slate-100" />
      <div className="h-24 rounded bg-slate-100" />
      <div className="h-24 rounded bg-slate-100" />
      <div className="h-10 rounded bg-slate-100" />
    </div>
  );
}

// ── 상태 3 — 도시에 본체 ─────────────────────────────────────────────────────

function DossierPane({
  dossier, basketSenseIds, onToggleBasket, onNavigateLemma,
}: {
  dossier: WordbookLemmaDossier;
  basketSenseIds: ReadonlySet<string>;
  onToggleBasket: (item: WordbookBasketItem) => void;
  onNavigateLemma: (lemmaId: string) => void;
}) {
  const { lemma, yearStats, senses, confusables } = dossier;
  const typeItems = yearStats
    ? Object.entries(yearStats.byType)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
    : [];
  const stats: [string, string][] = [
    [fmt1(lemma.per10k), "1만 단어당"],
    [fmt(lemma.passageCount), "나온 지문"],
    [fmt(lemma.totalOccurrences), "총 출현"],
    [lemma.yearsPresent === null ? "—" : `${lemma.yearsPresent}/25`, "나온 연수"],
    [lemma.longestGap === null ? "—" : `${lemma.longestGap}년`, "안 나온 기간"],
    [lemma.gradeTop ?? "—", "주로 나온 학년"],
  ];

  return (
    <div>
      {/* 헤더 — 구동사는 공백 포함이라 break-keep 으로 어중 절단을 막는다 */}
      <div className="border-b border-slate-200 px-3 pb-2.5 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="break-keep text-[20px] font-bold tracking-tight text-slate-900">{lemma.lemma}</h2>
          <PosChip pos={lemma.pos} />
          <TrendChip label={lemma.trendLabel} ratio={lemma.trendRatio} />
        </div>
        {lemma.surfaces.length > 0 ? (
          <div className="mt-0.5 break-keep text-[10.5px] text-slate-400">{lemma.surfaces.join(" · ")}</div>
        ) : null}
        {/* divide-x/y 는 2행 그리드에서 외곽 테두리와 겹쳐 이중선을 만든다 —
            gap-px + 바탕색으로 셀 사이 1px 만 남긴다 */}
        <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
          {stats.map(([value, label]) => (
            <div key={label} className="bg-white py-1.5 text-center">
              <div className="text-[13px] font-semibold tabular-nums text-slate-800">{value}</div>
              <div className="text-[9.5px] text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ① 25개년 출현 — 코퍼스 전수 */}
      {yearStats ? (
        <Sec title="25개년 출현" hint="기출 전체 기준">
          <YearBars data={yearStats.byYear} from={2003} to={2027} height={56} />
          <div className="mt-2">
            <SegBar parts={GRADE_PARTS.map((g) => ({ label: g.key, value: yearStats.byGrade[g.key] ?? 0, color: g.color }))} />
          </div>
        </Sec>
      ) : null}

      {/* ② 시행처 */}
      {yearStats ? (
        <Sec title="시험 종류">
          <SegBar parts={BOARD_PARTS.map((b) => ({ label: b.label, value: yearStats.byBoard[b.key] ?? 0, color: b.color }))} />
        </Sec>
      ) : null}

      {/* ③ 문항 유형 친화도 */}
      {typeItems.length > 0 ? (
        <Sec title="어떤 문제 유형에 잘 나오나">
          <HBarList items={typeItems} maxItems={6} />
        </Sec>
      ) : null}

      {/* ④ 뜻 목록 — 조회 캡(20) 초과 표제어는 절단 사실을 표기한다(take 47 등) */}
      <Sec
        title={
          lemma.senseCount > senses.length
            ? `뜻 ${senses.length}/${lemma.senseCount}개`
            : `뜻 ${senses.length}개`
        }
      >
        {lemma.senseCount > senses.length ? (
          <p className="mb-2 break-keep text-[10px] text-slate-400">
            출현이 많은 순으로 {senses.length}개까지 표시합니다.
          </p>
        ) : null}
        {senses.map((s, i) => (
          <div key={s.id} className={i > 0 ? "mt-2.5 border-t border-slate-100 pt-2.5" : undefined}>
            <SenseCard sense={s} lemma={lemma} inBasket={basketSenseIds.has(s.id)} onToggleBasket={onToggleBasket} />
          </div>
        ))}
      </Sec>

      {/* ⑤ 연어 */}
      {lemma.collocations.length > 0 ? (
        <Sec title="함께 나오는 표현">
          <div className="flex flex-wrap gap-1">
            {lemma.collocations.map((c) => (
              <span
                key={c} title={c}
                className="inline-flex h-6 max-w-full items-center truncate rounded-full border border-slate-200 px-2 text-[11px] text-slate-600"
              >
                {c}
              </span>
            ))}
          </div>
        </Sec>
      ) : null}

      {/* ⑥ 혼동어 — 옵시디언식 링크 항해.
          -mx-2: 행 텍스트는 px-3 끝선에 맞추고 hover 배경만 살짝 넓힌다 */}
      {confusables.length > 0 ? (
        <Sec title="같이 헷갈리는 단어">
          <div className="-mx-2">
            {confusables.map((c) => (
              <button
                key={c.lemmaId} type="button" onClick={() => onNavigateLemma(c.lemmaId)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="shrink-0 text-[12.5px] font-semibold text-slate-800">{c.lemma}</span>
                <PosChip pos={c.pos} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400" title={c.senseKo ?? undefined}>
                  {c.senseKo ?? ""}
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">{fmt1(c.per10k)}</span>
                <ChevronRight className="size-3.5 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        </Sec>
      ) : null}

      {/* ⑦ 각주 — 표본/전수 척도 구분(파일 상단 주석 참조) */}
      <p className="break-keep px-3 pb-6 pt-2 text-[10px] leading-relaxed text-slate-400">
        뜻별 시기·학년 숫자는 수집한 예문 기준입니다. 25개년 출현·시험
        종류·문제 유형은 기출 전체 기준입니다.
      </p>
    </div>
  );
}

// ── 뜻 카드 ──────────────────────────────────────────────────────────────────

function SenseCard({
  sense: s, lemma, inBasket, onToggleBasket,
}: {
  sense: DossierSense;
  lemma: WordbookLemmaDossier["lemma"];
  inBasket: boolean;
  onToggleBasket: (item: WordbookBasketItem) => void;
}) {
  const [moreExamples, setMoreExamples] = useState(false);
  const [moreTraps, setMoreTraps] = useState(false);

  const eraTotal = s.era.early + s.era.late;
  const gradeTotal = s.byGrade.g1 + s.byGrade.g2 + s.byGrade.g3;
  // 예문은 서버가 뜻당 12개까지 내려준다 — 접힌 상태 2개, 펼치면 전부.
  const shownExamples = s.examples.slice(0, moreExamples ? s.examples.length : 2);
  const shownTraps = s.traps.slice(0, moreTraps ? 4 : 2);
  const hiddenExamples = s.examples.length - 2;
  const hiddenTraps = Math.min(s.traps.length, 4) - 2;
  const toggleCls = "mt-0.5 text-[10.5px] font-medium text-blue-600 hover:underline";

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500">
          #{s.senseOrder + 1}
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-slate-800" title={s.senseKo}>
          {s.senseKo}
        </span>
        <TierChip tier={s.tier} />
        <DiffDots n={s.difficulty} />
        {/* 담기 버튼 — sense-table 과 동일 관용구(체크=담김/플러스=담기) */}
        <button
          type="button"
          aria-label={inBasket ? "단어장에서 빼기" : "단어장에 담기"}
          title={inBasket ? "단어장에서 빼기" : "단어장에 담기"}
          onClick={() => onToggleBasket({
            senseId: s.id, lemmaId: lemma.id, lemma: lemma.lemma, pos: lemma.pos,
            senseKo: s.senseKo, tier: s.tier, difficulty: s.difficulty,
          })}
          className={`ml-auto flex size-6 shrink-0 items-center justify-center rounded-full transition-colors ${
            inBasket
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          }`}
        >
          {inBasket ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
        </button>
      </div>

      <div className="mt-0.5 line-clamp-2 text-[11.5px] text-slate-500" title={s.senseEn}>
        {s.senseEn}
      </div>

      {s.senseKoCandidates.length >= 2 ? (
        <div className="mt-0.5 text-[10.5px] tabular-nums text-slate-400">
          <span className="font-medium">다른 번역</span>{" "}
          {s.senseKoCandidates.map((c) => `${c.ko} ${c.n}`).join(" · ")}
        </div>
      ) : null}

      <div className="mt-1 text-[10.5px] tabular-nums text-slate-400">
        출현 {fmt(s.occurrences)} · 예문 {fmt(s.exampleCount)} ·{" "}
        <span className={s.trapRate >= 0.5 ? "text-rose-500" : undefined}>
          함정 {s.trapCount}개{s.trapCount > 0 ? ` (${Math.round(s.trapRate * 100)}%)` : ""}
        </span>
      </div>

      {/* 뜻별 미니 분포 — 예문 표본 기준(각주 참조) */}
      {eraTotal > 0 || gradeTotal > 0 ? (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div>
            {eraTotal > 0 ? (
              <SegBar height={4} parts={[
                { label: "예전(~2015)", value: s.era.early, color: "bg-slate-400" },
                { label: "요즘(2016~)", value: s.era.late, color: "bg-blue-500" },
              ]} />
            ) : null}
          </div>
          <div>
            {gradeTotal > 0 ? (
              <SegBar height={4} parts={[
                { label: "고1", value: s.byGrade.g1, color: "bg-sky-400" },
                { label: "고2", value: s.byGrade.g2, color: "bg-blue-500" },
                { label: "고3", value: s.byGrade.g3, color: "bg-indigo-600" },
              ]} />
            ) : null}
          </div>
        </div>
      ) : null}

      {shownExamples.map((e, i) => (
        <ExampleCard key={i} example={e} />
      ))}
      {hiddenExamples > 0 ? (
        <button type="button" onClick={() => setMoreExamples((v) => !v)} className={toggleCls}>
          {moreExamples ? "예문 접기" : `수집한 예문 ${s.examples.length}개 모두 보기`}
        </button>
      ) : null}
      {/* "나온 지문 113개인데 예문이 왜 몇 개뿐?"에 대한 답 — 출현 전부를
          문장으로 저장하지 않고 대표 예문만 수집한다는 사실을 명시한다 */}
      {s.exampleCount > s.examples.length ? (
        <p className="mt-1 text-[10px] text-slate-400 break-keep">
          출현한 문장 전부가 아니라 대표 예문 {s.examples.length}개를 골라 보여
          드립니다.
        </p>
      ) : null}

      {shownTraps.length > 0 ? (
        <div className="mt-1 space-y-1">
          {shownTraps.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-px shrink-0 whitespace-nowrap rounded bg-amber-50 px-1 py-px text-[9.5px] font-medium text-amber-700">
                {VOCAB_TRAP_KIND_LABELS[t.kind] ?? t.kind}
              </span>
              <span className="break-keep text-[11px] text-slate-600">{t.note}</span>
            </div>
          ))}
        </div>
      ) : null}
      {hiddenTraps > 0 ? (
        <button type="button" onClick={() => setMoreTraps((v) => !v)} className={toggleCls}>
          {moreTraps ? "함정 접기" : `함정 ${hiddenTraps}개 더 보기`}
        </button>
      ) : null}
    </div>
  );
}

// ── 예문 카드 ────────────────────────────────────────────────────────────────

/** surface 를 대소문자 무시 첫 매칭으로 하이라이트 — 정규식 메타문자 이스케이프 필수. */
function highlightSurface(en: string, surface: string): ReactNode {
  if (!surface) return en;
  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = en.match(new RegExp(escaped, "i"));
  if (!m || m.index === undefined) return en;
  return (
    <>
      {en.slice(0, m.index)}
      <mark className="rounded-sm bg-amber-100 px-0.5 font-medium text-inherit">{m[0]}</mark>
      {en.slice(m.index + m[0].length)}
    </>
  );
}

function ExampleCard({ example: e }: { example: DossierExample }) {
  // 출처 요소는 전부 nullable — 있는 것만 " · " 로 잇는다
  const source = [[e.year, e.grade].filter(Boolean).join(" "), e.typeGroup, e.board]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="my-1 rounded bg-slate-50 px-2 py-1.5">
      <div className="break-keep text-[11.5px] leading-relaxed text-slate-700">
        {highlightSurface(e.en, e.surface)}
      </div>
      <div className="mt-0.5 break-keep text-[10.5px] text-slate-500">{e.ko}</div>
      {source ? <div className="mt-0.5 text-[10px] tabular-nums text-slate-400">{source}</div> : null}
    </div>
  );
}
