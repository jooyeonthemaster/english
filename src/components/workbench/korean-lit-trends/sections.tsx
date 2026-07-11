"use client";

// 비차트 섹션 — 현행 매트릭스 카드·분량 레인지·접점 카드·재출제 표·<보기> 층위·표기 전환.

import type { LitTrends, LitTrendExample } from "./types";
import { GENRE_COLORS } from "./types";

type OpenFn = (title: string, ids: string[]) => void;

/** 지문 연결 칩 — 클릭하면 해당 지문(들)을 드로어로 연다. */
export function PassageChip({
  label,
  ids,
  onOpen,
  title,
}: {
  label: string;
  ids: string[];
  onOpen: OpenFn;
  title?: string;
}) {
  if (ids.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(title ?? label, ids)}
      className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1 text-[11.5px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
    >
      {label}
      <span className="text-[10px] font-bold text-blue-400">
        {ids.length > 1 ? `×${ids.length}` : "→"}
      </span>
    </button>
  );
}

// ── 히어로 스탯 타일 ────────────────────────────────────────
export function StatTiles({ hero }: { hero: LitTrends["hero"] }) {
  const tiles = [
    { label: "분석한 문학 기출 지문", value: hero.passages.toLocaleString(), sub: `수능·평가원 ${hero.kice} + 교육청 학평 ${hero.ebsi}` },
    { label: "확인된 실존 작품", value: hero.works.toLocaleString(), sub: "출전 표기에서 전수 추출" },
    { label: "분석 학년도", value: `${hero.yearMin}~${hero.yearMax}`, sub: "수능·평가원 기준" },
    { label: "작가 특정형 <보기>", value: "29%", sub: "실존 작품이어야 성립하는 문항" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-2xl border border-slate-200 bg-white p-4"
        >
          <p className="text-[11.5px] font-semibold text-slate-500">{t.label}</p>
          <p className="mt-1 text-[26px] font-bold leading-none text-slate-900">
            {t.value}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">{t.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── 2. 현행 4세트 매트릭스 ──────────────────────────────────
export function MatrixCards({
  data,
  onOpen,
}: {
  data: LitTrends["matrix"];
  onOpen: OpenFn;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {data.map((m) => (
        <div
          key={m.slot}
          className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white">
              {m.slot}번
            </span>
            <h3 className="text-[13.5px] font-bold text-slate-900">{m.name}</h3>
            <span className="ml-auto text-[11px] font-semibold text-slate-400">
              {m.questions} · {m.length}
            </span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-slate-600">{m.rule}</p>
          {m.examples.length > 0 ? (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {m.examples.map((e) => (
                <PassageChip
                  key={e.id}
                  label={e.label}
                  ids={[e.id]}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── 4b. 분량 레인지 (min–중앙값–max) ────────────────────────
export function LengthRanges({ data }: { data: LitTrends["lengths"] }) {
  const max = Math.max(
    ...data.flatMap((d) => [d.kice?.max ?? 0, d.ebsi?.max ?? 0]),
  );
  const Row = ({
    label,
    stat,
    color,
  }: {
    label: string;
    stat: { min: number; med: number; max: number; n: number } | null;
    color: string;
  }) => {
    if (!stat) return null;
    const l = (v: number) => `${(v / max) * 100}%`;
    return (
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-right text-[10.5px] font-semibold text-slate-400">
          {label}
        </span>
        <div className="relative h-5 flex-1">
          <div className="absolute inset-y-2 left-0 right-0 rounded-full bg-slate-100" />
          <div
            className="absolute inset-y-2 rounded-full"
            style={{
              left: l(stat.min),
              width: `calc(${l(stat.max)} - ${l(stat.min)})`,
              backgroundColor: color,
              opacity: 0.25,
            }}
          />
          <div
            className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full ring-2 ring-white"
            style={{ left: `calc(${l(stat.med)} - 6px)`, backgroundColor: color }}
            title={`중앙값 ${stat.med.toLocaleString()}자`}
          />
        </div>
        <span className="w-40 shrink-0 text-[10.5px] tabular-nums text-slate-500">
          {stat.min.toLocaleString()}~{stat.max.toLocaleString()}자 · 중앙{" "}
          {stat.med.toLocaleString()}
        </span>
      </div>
    );
  };
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.genre} className="rounded-xl border border-slate-100 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-slate-700">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: GENRE_COLORS[d.genre] ?? "#64748b" }}
            />
            {d.genre}
          </p>
          <div className="space-y-1">
            <Row label="수능·평가원" stat={d.kice} color={GENRE_COLORS[d.genre] ?? "#64748b"} />
            <Row label="교육청 학평" stat={d.ebsi} color="#94a3b8" />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-slate-400">
        공백 포함 글자수. 학평은 수능·평가원보다 체계적으로 약 500자 깁니다 —
        실전 기준 분량은 항상 수능·평가원 쪽입니다.
      </p>
    </div>
  );
}

// ── 5b. 접점 유형 T1~T8 ─────────────────────────────────────
export function ThemeGrid({
  data,
  onOpen,
}: {
  data: LitTrends["themes"];
  onOpen: OpenFn;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {data.map((t) => (
        <div
          key={t.code}
          className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-3.5"
        >
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10.5px] font-bold text-cyan-700 ring-1 ring-cyan-100">
              {t.code}
            </span>
            <h4 className="text-[12.5px] font-bold text-slate-800">{t.label}</h4>
          </div>
          <p className="text-[11.5px] leading-relaxed text-slate-500">{t.desc}</p>
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {t.examples.map((e) => (
              <PassageChip key={e.id} label={e.label} ids={[e.id]} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 6. 재출제 표 ────────────────────────────────────────────
export function ReappearTable({
  data,
  onOpen,
}: {
  data: LitTrends["reappear"];
  onOpen: OpenFn;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-slate-500">
            <th className="px-3 py-2 font-semibold">작품</th>
            <th className="px-3 py-2 font-semibold">1차 출제</th>
            <th className="px-3 py-2 font-semibold">재출제</th>
            <th className="px-3 py-2 font-semibold">간격</th>
            <th className="px-3 py-2 font-semibold">무엇이 달라졌나</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={`${r.author}-${r.work}`} className="border-b border-slate-100">
              <td className="px-3 py-2">
                <p className="font-bold text-slate-800">「{r.work}」</p>
                <p className="text-[11px] text-slate-400">{r.author}</p>
              </td>
              <td className="px-3 py-2">
                <PassageChip
                  label={`${r.first.year} ${r.first.siheng}`}
                  ids={[r.first.id]}
                  title={`「${r.work}」 1차 출제 (${r.first.year} ${r.first.siheng})`}
                  onOpen={onOpen}
                />
              </td>
              <td className="px-3 py-2">
                <PassageChip
                  label={`${r.second.year} ${r.second.siheng}`}
                  ids={[r.second.id]}
                  title={`「${r.work}」 재출제 (${r.second.year} ${r.second.siheng})`}
                  onOpen={onOpen}
                />
              </td>
              <td className="px-3 py-2 font-bold tabular-nums text-slate-700">
                {r.gap}년
              </td>
              <td className="px-3 py-2 leading-relaxed text-slate-600">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 7. <보기> 층위 ──────────────────────────────────────────
export function BogiSection({
  data,
  onOpen,
}: {
  data: LitTrends["bogi"];
  onOpen: OpenFn;
}) {
  const pct = Math.round((data.specific / data.total) * 100);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-[11.5px]">
          <span className="font-semibold text-slate-600">
            작가·작품·문학사 특정형{" "}
            <strong className="text-slate-900">
              {data.specific}건 ({pct}%)
            </strong>
          </span>
          <span className="text-slate-400">
            일반 해석 프레임형 {data.total - data.specific}건
          </span>
        </div>
        <div
          className="flex h-5 w-full overflow-hidden rounded-full"
          role="img"
          aria-label={`문학 보기 ${data.total}건 중 특정형 ${data.specific}건(${pct}%)`}
        >
          <div
            className="border-r-2 border-white"
            style={{ width: `${pct}%`, backgroundColor: "#2563eb" }}
          />
          <div className="flex-1 bg-slate-200" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {data.types.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-slate-200 bg-white p-3.5"
          >
            <h4 className="text-[12.5px] font-bold text-slate-800">{t.label}</h4>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              {t.desc}
            </p>
            {t.example ? (
              <blockquote className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11.5px] leading-relaxed text-slate-600">
                “{t.example.quote}”
                {t.example.id ? (
                  <div className="mt-1.5">
                    <PassageChip
                      label={`「${t.example.work}」 지문 보기`}
                      ids={[t.example.id]}
                      onOpen={onOpen}
                    />
                  </div>
                ) : null}
              </blockquote>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 6b. 표기 전환 사례 ──────────────────────────────────────
export function NotationCase({
  data,
  onOpen,
}: {
  data: NonNullable<LitTrends["notation"]>;
  onOpen: OpenFn;
}) {
  const Card = ({
    tag,
    year,
    siheng,
    snippet,
    id,
    accent,
  }: {
    tag: string;
    year: number;
    siheng: string;
    snippet: string;
    id: string;
    accent: boolean;
  }) => (
    <div
      className={
        "flex flex-col gap-2 rounded-2xl border p-4 " +
        (accent ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white")
      }
    >
      <div className="flex items-center justify-between">
        <span
          className={
            "rounded px-1.5 py-0.5 text-[10.5px] font-bold " +
            (accent
              ? "bg-blue-600 text-white"
              : "bg-slate-200 text-slate-600")
          }
        >
          {tag}
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {year} {siheng}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-all text-[12.5px] leading-relaxed text-slate-700">
        {snippet}…
      </p>
      <div>
        <PassageChip
          label="지문 전문 보기"
          ids={[id]}
          title={`한거십팔곡 (${year} ${siheng})`}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      <Card
        tag="중세 원표기"
        year={data.before.year}
        siheng={data.before.siheng}
        snippet={data.before.snippet}
        id={data.before.id}
        accent={false}
      />
      <Card
        tag="현대역 절충 (현행 표준)"
        year={data.after.year}
        siheng={data.after.siheng}
        snippet={data.after.snippet}
        id={data.after.id}
        accent
      />
    </div>
  );
}

// ── 3c. 선택된 작가/연대의 작품 칩 패널 ─────────────────────
export function WorkChips({
  title,
  works,
  onOpen,
}: {
  title: string;
  works: { label: string; ids: string[] }[];
  onOpen: OpenFn;
}) {
  const usable = works.filter((w) => w.ids.length > 0);
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <p className="mb-1.5 text-[11.5px] font-bold text-slate-600">{title}</p>
      {usable.length === 0 ? (
        <p className="text-[11.5px] text-slate-400">
          코퍼스에 지문이 연결된 작품이 없습니다.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {usable.map((w) => (
            <PassageChip
              key={w.label}
              label={w.label}
              ids={w.ids}
              title={`${title} — ${w.label}`}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export type { LitTrendExample };
