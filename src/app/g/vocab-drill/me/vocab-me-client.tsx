"use client";

// 내 단어 기록 — /g/vocab-drill/me
// GET /api/vocab-drill/me 를 자체 로드해 렌더(어법 me-client 관용구).
// 일자별 학습 바·덱 시험 기록·라이트너 상자 분포·유형별 정답률·취약 TOP10·덱 진행.
// 차트 라이브러리 금지 — 순수 CSS 바·세그먼트만. 폰트 크기는 .gd-t-* 만.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Target } from "lucide-react";
import {
  VOCAB_ITEM_TYPE_LABELS,
  VOCAB_STAGE_LABELS,
} from "@/lib/vocab-drill/display";

// ── /api/vocab-drill/me 응답(사용 필드만 — 서버가 정본) ─────────────────────

interface DayRow {
  date: string; // "YYYY-MM-DD" (서울)
  solved: number;
  correct: number;
}

interface TestRecord {
  date: string;
  deckId: string | null;
  deckTitle: string;
  solved: number;
  correct: number;
  score: number;
}

interface WeakRow {
  senseId: string;
  lemma: string;
  pos: string;
  senseKo: string;
  tier: string;
  score: number;
  attempts: number;
  lapses: number;
}

interface DeckRow {
  deckId: string;
  /** 서버가 실어 준다 — 시험 기록이 없는 진행 중 덱도 제목이 나온다. */
  title: string;
  stage: string;
  totalCount: number;
  seenCount: number;
  masteredCount: number;
  bestTestScore: number | null;
  lastStudiedAt: string | null;
}

interface MePayload {
  totals: { solved: number; correct: number; avgTimeMs: number; hintRate: number };
  stat: {
    xp: number;
    sensesSeen: number;
    sensesMastered: number;
    streakDays: number;
    bestCombo: number;
  } | null;
  days: DayRow[];
  byItemType: Record<string, { solved: number; correct: number } | undefined>;
  boxes: { box: number; count: number }[];
  dueCount: number;
  weak: WeakRow[];
  testRecords: TestRecord[];
  decks: DeckRow[];
}

const INK2: CSSProperties = { color: "var(--gd-ink-2)" };
const INK3: CSSProperties = { color: "var(--gd-ink-3)" };

/** "YYYY-MM-DD" → "M. D." */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  if (!m || !d) return date;
  return `${Number(m)}. ${Number(d)}.`;
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export function VocabMeClient() {
  const router = useRouter();
  const [me, setMe] = useState<MePayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch("/api/vocab-drill/me")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/g");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.ok) setMe(d.me);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [router, reload]);

  const testGroups = useMemo(() => {
    const map = new Map<string, TestRecord[]>();
    for (const r of me?.testRecords ?? []) {
      const rows = map.get(r.date);
      if (rows) rows.push(r);
      else map.set(r.date, [r]);
    }
    return [...map.entries()];
  }, [me]);

  if (failed) {
    return (
      <div className="gd-page flex min-h-[60dvh] flex-col items-center justify-center px-5">
        <p className="gd-prose-2 text-center">기록을 불러오지 못했습니다.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setReload((n) => n + 1);
          }}
          className="gd-btn gd-btn-primary mt-4 w-full"
        >
          다시 불러오기
        </button>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="gd-page px-5 pb-6 pt-5">
        <div className="animate-pulse flex flex-col gap-4" aria-hidden>
          <div
            className="h-7 w-36 rounded-lg"
            style={{ background: "var(--gd-line)" }}
          />
          <div className="gd-card h-20" />
          <div className="gd-card h-24" />
          <div className="gd-card h-40" />
        </div>
        <p className="sr-only">기록을 불러오는 중입니다</p>
      </div>
    );
  }

  const acc = me.totals.solved
    ? Math.round((me.totals.correct / me.totals.solved) * 100)
    : 0;
  const maxDay = Math.max(1, ...me.days.map((d) => d.solved));
  const boxTotal = me.boxes.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="gd-page px-5 pb-6 pt-4">
      <header className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1)
              router.back();
            else router.push("/g/track/vocab");
          }}
          aria-label="뒤로 가기"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={INK2}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <div className="min-w-0">
          <p className="gd-label">어휘 훈련</p>
          <h1 className="gd-t-xl font-bold tracking-tight">내 단어 기록</h1>
        </div>
      </header>

      {/* ── 총괄 계기판 ── */}
      <div
        className="gd-card mt-4 grid grid-cols-3 divide-x p-0"
        style={{ borderColor: "var(--gd-line)" }}
      >
        <Cell label="푼 문항" value={me.totals.solved.toLocaleString()} />
        <Cell label="정답률" value={`${acc}%`} />
        <Cell label="연속 학습일" value={`${me.stat?.streakDays ?? 0}일`} />
      </div>

      {/* ── 일자별 학습 기록 (14일) ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">일자별 학습 기록</p>
        <div
          className="gd-card flex items-end gap-1 px-3.5 pb-2 pt-4"
          style={{ height: "5.75rem" }}
        >
          {me.days.map((d, i) => {
            const today = i === me.days.length - 1;
            const dayAcc = d.solved ? d.correct / d.solved : 1;
            const fill =
              d.solved === 0
                ? "var(--gd-line)"
                : dayAcc < 0.6
                  ? "var(--gd-bad)"
                  : "var(--gd-blue)";
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(2, (d.solved / maxDay) * 44)}px`,
                    background: fill,
                    opacity:
                      d.solved === 0
                        ? 0.6
                        : today
                          ? 1
                          : 0.4 + 0.6 * (d.solved / maxDay),
                  }}
                  title={`${shortDate(d.date)} · ${d.solved}문항 중 ${d.correct}개`}
                />
                <span
                  className="gd-t-3xs"
                  style={{
                    color: today ? "var(--gd-blue)" : "var(--gd-ink-3)",
                    fontWeight: today ? 700 : undefined,
                    fontSize: "0.5rem",
                  }}
                >
                  {today ? "오늘" : date2(d.date)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="gd-t-3xs mt-1.5" style={INK3}>
          막대 높이는 푼 문항 수, 붉은 막대는 정답률 60% 미만인 날입니다
        </p>
      </section>

      {/* ── 일자별 단어 시험 기록 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">단어 시험 기록</p>
        {testGroups.length === 0 ? (
          <div className="gd-card flex flex-col items-center gap-2 px-5 py-8 text-center">
            <ClipboardCheck
              className="h-8 w-8"
              strokeWidth={1.5}
              style={{ color: "var(--gd-ink-3)" }}
              aria-hidden
            />
            <p className="gd-t-sm font-semibold">아직 덱 시험 기록이 없습니다</p>
            <p className="gd-t-xs" style={INK3}>
              단어장의 시험 단계를 마치면 여기에 쌓입니다
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {testGroups.map(([date, rows]) => (
              <div key={date}>
                <p className="gd-mono gd-t-2xs mb-1.5 font-semibold" style={INK3}>
                  {shortDate(date)}
                </p>
                <div className="flex flex-col gap-1.5">
                  {rows.map((r, i) => (
                    <div
                      key={`${r.deckId ?? "-"}:${i}`}
                      className="gd-card flex items-center gap-2.5 px-3.5 py-2.5"
                    >
                      <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">
                        {r.deckTitle}
                      </p>
                      <span className="gd-t-2xs shrink-0" style={INK3}>
                        {r.solved}문항 중 {r.correct}개
                      </span>
                      <span
                        className="gd-mono gd-t-2xs shrink-0 rounded-full px-2 py-0.5 font-bold"
                        style={
                          r.score >= 70
                            ? {
                                background: "var(--gd-good-soft)",
                                color: "var(--gd-good)",
                              }
                            : {
                                background: "var(--gd-bad-soft)",
                                color: "var(--gd-bad)",
                              }
                        }
                      >
                        {r.score}점
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 라이트너 상자 분포 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">복습 상자 분포</p>
        <div className="gd-card px-3.5 py-3.5">
          <div
            className="flex h-2 overflow-hidden rounded-full"
            style={{ background: "var(--gd-line)" }}
            role="img"
            aria-label={`전체 ${boxTotal}개 단어의 상자 분포`}
          >
            {boxTotal > 0 &&
              me.boxes.map((b) =>
                b.count > 0 ? (
                  <span
                    key={b.box}
                    className="block h-full"
                    style={{
                      width: `${(b.count / boxTotal) * 100}%`,
                      ...BOX_STYLE[b.box],
                    }}
                  />
                ) : null,
              )}
          </div>
          <div className="mt-2.5 grid grid-cols-6">
            {me.boxes.map((b) => (
              <div key={b.box} className="flex flex-col items-center gap-0.5">
                <span className="gd-mono gd-t-xs font-bold">{b.count}</span>
                <span className="gd-t-3xs flex items-center gap-1" style={INK3}>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={BOX_STYLE[b.box]}
                    aria-hidden
                  />
                  상자{b.box}
                </span>
              </div>
            ))}
          </div>
          <p className="gd-hairline-t gd-t-xs mt-3 pt-2.5" style={INK2}>
            상자 번호가 클수록 오래 기억한 단어입니다 · 지금{" "}
            <strong className="gd-mono" style={{ color: "var(--gd-ink)" }}>
              {me.dueCount}
            </strong>
            개 복습 대기
          </p>
        </div>
      </section>

      {/* ── 유형별 정답률 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">유형별 정답률</p>
        <div className="gd-card flex flex-col gap-3 px-3.5 py-3.5">
          {Object.entries(VOCAB_ITEM_TYPE_LABELS).map(([type, label]) => (
            <AccuracyBar key={type} label={label} stat={me.byItemType[type]} />
          ))}
        </div>
      </section>

      {/* ── 취약 단어 TOP 10 ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="gd-label">취약 단어 TOP 10</p>
          {me.weak.length > 0 && (
            <Link
              href="/g/vocab-drill?mode=weak"
              className="gd-t-2xs shrink-0 font-semibold"
              style={{ color: "var(--gd-blue)" }}
            >
              전체 훈련
            </Link>
          )}
        </div>
        {me.weak.length === 0 ? (
          <div className="gd-card flex flex-col items-center gap-2 px-5 py-8 text-center">
            <Target
              className="h-8 w-8"
              strokeWidth={1.5}
              style={{ color: "var(--gd-good)" }}
              aria-hidden
            />
            <p className="gd-t-sm font-semibold">지금은 취약 단어가 없습니다</p>
            <p className="gd-t-xs" style={INK3}>
              드릴을 이어 가면 흔들리는 단어가 여기에 모입니다
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {me.weak.map((w) => (
              <div
                key={w.senseId}
                className="gd-card flex items-center gap-3 px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="gd-en gd-t-lg font-bold"
                      style={{ color: "var(--gd-ink)" }}
                    >
                      {w.lemma}
                    </span>
                    {w.lapses > 0 && (
                      <span
                        className="gd-t-3xs rounded-full px-1.5 py-0.5 font-bold"
                        style={{
                          background: "var(--gd-bad-soft)",
                          color: "var(--gd-bad)",
                        }}
                      >
                        {w.lapses}번 무너짐
                      </span>
                    )}
                  </span>
                  <p className="gd-t-sm mt-0.5 truncate" style={INK2}>
                    {w.senseKo}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="gd-mono gd-t-2xs" style={INK3}>
                    숙달{" "}
                    <strong style={{ color: "var(--gd-bad)" }}>{w.score}</strong>
                  </span>
                  <Link
                    href="/g/vocab-drill?mode=weak"
                    className="gd-btn-chip"
                    style={{ minHeight: "2.75rem" }}
                    aria-label={`${w.lemma} 포함 취약 단어 훈련`}
                  >
                    훈련
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 단어장 진행 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">단어장 진행</p>
        {me.decks.length === 0 ? (
          <div className="gd-card px-4 py-8 text-center">
            <p className="gd-t-sm" style={INK3}>
              아직 학습을 시작한 단어장이 없습니다
            </p>
          </div>
        ) : (
          <div className="gd-card flex flex-col px-3.5 py-1">
            {me.decks.map((d, i) => (
              <div
                key={d.deckId}
                className={`flex flex-col gap-1.5 py-3 ${i > 0 ? "gd-hairline-t" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">
                    {d.title || "단어장"}
                  </p>
                  <span
                    className="gd-t-3xs shrink-0 rounded-full px-1.5 py-0.5 font-bold"
                    style={
                      d.stage === "MASTERED"
                        ? {
                            background: "var(--gd-good-soft)",
                            color: "var(--gd-master)",
                          }
                        : {
                            background: "var(--gd-blue-soft)",
                            color: "var(--gd-blue)",
                          }
                    }
                  >
                    {VOCAB_STAGE_LABELS[d.stage] ?? d.stage}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="gd-meter flex-1"
                    data-tone={d.stage === "MASTERED" ? "good" : undefined}
                    role="img"
                    aria-label={`본 단어 ${d.seenCount}/${d.totalCount}`}
                  >
                    <span
                      style={{
                        width: `${Math.min(100, Math.round((d.seenCount / Math.max(1, d.totalCount)) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="gd-mono gd-t-3xs shrink-0" style={INK3}>
                    {d.seenCount}/{d.totalCount}
                  </span>
                </div>
                <p className="gd-t-3xs" style={INK3}>
                  완성 {d.masteredCount} ·{" "}
                  {d.bestTestScore !== null
                    ? `최고 시험 ${d.bestTestScore}점`
                    : "시험 전"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── 소부품 ──────────────────────────────────────────────────────────────────

/** 라이트너 상자 색 — 0(새 단어) 회색 → 1~4 파랑 농도 → 5 완성(초록) */
const BOX_STYLE: Record<number, CSSProperties> = {
  0: { background: "var(--gd-line-strong)" },
  1: { background: "var(--gd-blue)", opacity: 0.3 },
  2: { background: "var(--gd-blue)", opacity: 0.5 },
  3: { background: "var(--gd-blue)", opacity: 0.72 },
  4: { background: "var(--gd-blue)" },
  5: { background: "var(--gd-good)" },
};

/** "YYYY-MM-DD" → "일(DD)" 축 라벨 */
function date2(date: string): string {
  return date.slice(8);
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col items-center py-3"
      style={{ borderColor: "var(--gd-line)" }}
    >
      <p className="gd-mono gd-t-md font-bold">{value}</p>
      <p className="gd-t-3xs mt-0.5" style={INK3}>
        {label}
      </p>
    </div>
  );
}

/** 순수 CSS 정답률 바 — w/[taskId]/report 관용구(60% 미만 gd-bad) */
function AccuracyBar({
  label,
  stat,
}: {
  label: string;
  stat: { solved: number; correct: number } | undefined;
}) {
  const p = stat?.solved
    ? Math.round((stat.correct / stat.solved) * 100)
    : null;
  const fill = p !== null && p < 60 ? "var(--gd-bad)" : "var(--gd-blue)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="gd-t-xs font-semibold" style={INK2}>
          {label}
        </span>
        <span className="gd-mono gd-t-xs font-bold" style={{ color: p === null ? "var(--gd-ink-3)" : fill }}>
          {p === null ? "—" : `${p}%`}
          {stat?.solved ? (
            <span style={{ color: "var(--gd-ink-3)" }}> {stat.solved}</span>
          ) : null}
        </span>
      </div>
      <div
        className="mt-1 overflow-hidden rounded-full"
        style={{ height: "0.375rem", background: "var(--gd-line)" }}
        role="img"
        aria-label={`${label} 정답률 ${p === null ? "기록 없음" : `${p}%`}`}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${p ?? 0}%`, background: fill }}
        />
      </div>
    </div>
  );
}
