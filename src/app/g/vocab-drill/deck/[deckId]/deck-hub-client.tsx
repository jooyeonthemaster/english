"use client";

// 덱 허브 클라이언트 — 진행 요약 + 5단계 스테퍼 + 단계별 진입 카드.
// 몰입 화면 관용구(GShell 미적용, 자체 헤더 — w/[taskId]/hub-client.tsx:129).

import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  FileText,
  GraduationCap,
  Lock,
} from "lucide-react";
import { VOCAB_DECK_STAGES } from "@/lib/vocab-drill/payload";
import { VOCAB_STAGE_LABELS } from "@/lib/vocab-drill/display";

interface DeckProgressProps {
  stage: string;
  seenCount: number;
  masteredCount: number;
  bestTestScore: number | null;
  lastStudiedAt: string | null; // ISO
}

/** "7. 20. 14:32" — 서울 기준 절대 시각 (vocab-client.tsx 관용구) */
function lastStudiedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${hh}:${mm}`;
}

// ── 소부품 (vocab-client.tsx:88 StatCell 관용구) ────────────────────────────

function StatCell({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "ink" | "bad" | "good";
}) {
  const color =
    tone === "bad" ? "var(--gd-bad)" : tone === "good" ? "var(--gd-good)" : "var(--gd-ink)";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 text-center">
      <span className="gd-mono text-2xl font-bold leading-none tracking-tight" style={{ color }}>
        {value}
      </span>
      <span className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
        {label}
      </span>
    </div>
  );
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export function DeckHubClient({
  deckId,
  title,
  subtitle,
  totalCount,
  progress,
}: {
  deckId: string;
  title: string;
  subtitle: string | null;
  totalCount: number;
  progress: DeckProgressProps;
}) {
  const stageIdx = Math.max(
    0,
    (VOCAB_DECK_STAGES as readonly string[]).indexOf(progress.stage),
  );
  const mastered = progress.stage === "MASTERED";
  const seenPct =
    totalCount > 0 ? Math.min(100, Math.round((progress.seenCount / totalCount) * 100)) : 0;

  const cards = [
    {
      key: "learn",
      label: "학습",
      desc: "카드를 넘기며 뜻과 기출 예문을 익힙니다",
      lockNote: null as string | null,
      href: `/g/vocab-drill/learn/${deckId}`,
      icon: <BookOpen className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: true,
      done: stageIdx >= 1,
    },
    {
      key: "drill",
      label: "드릴",
      desc: "뜻 고르기 · 단어 고르기 · 철자 훈련입니다",
      lockNote: "학습을 80% 마치면 열립니다",
      href: `/g/vocab-drill?mode=drill&deckId=${deckId}`,
      icon: <Dumbbell className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: stageIdx >= 1,
      done: stageIdx >= 2,
    },
    {
      key: "context",
      label: "문맥 훈련",
      desc: "기출 예문 빈칸에 알맞은 단어를 채웁니다",
      lockNote: "드릴을 60% 이상 진행하면 열립니다",
      href: `/g/vocab-drill?mode=context&deckId=${deckId}`,
      icon: <FileText className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: stageIdx >= 2,
      done: stageIdx >= 3,
    },
    {
      key: "test",
      label: "덱 시험",
      desc: "12문항 종합 — 70점 이상이면 덱 완성입니다",
      lockNote: "문맥 훈련을 30% 이상 진행하면 열립니다",
      href: `/g/vocab-drill?mode=test&deckId=${deckId}`,
      icon: <GraduationCap className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: stageIdx >= 3,
      done: mastered,
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── 헤더 ── */}
      <header
        className="shrink-0"
        style={{ background: "var(--gd-card)", borderBottom: "1px solid var(--gd-line)" }}
      >
        <div className="gd-page flex items-center gap-1.5 px-2.5 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Link
            href="/g/track/vocab"
            aria-label="단어 트랙으로 돌아가기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-2)" }}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="gd-label">단어 훈련</p>
            <h1 className="gd-t-sm truncate font-bold tracking-tight">{title}</h1>
          </div>
        </div>
      </header>

      <main className="gd-page gd-safe-b flex flex-1 flex-col gap-3 px-4 py-4">
        {/* ── 완성 배너 ── */}
        {mastered && (
          <div className="gd-verdict flex items-center gap-2.5 px-4 py-3" data-tone="good">
            <CheckCircle2
              className="h-5 w-5 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--gd-good)" }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="gd-t-sm font-bold" style={{ color: "var(--gd-good)" }}>
                덱 완성
              </p>
              <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
                덱 시험을 통과해 모든 단계를 마쳤습니다. 언제든 다시 훈련할 수 있습니다.
              </p>
            </div>
          </div>
        )}

        {/* ── 히어로: 제목 + 진행 요약 ── */}
        <section className="gd-card px-4 py-4">
          <h2 className="gd-t-lg font-bold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
              {subtitle}
            </p>
          )}

          <div className="gd-hairline-t mt-3 flex pt-3">
            <StatCell value={progress.seenCount} label="본 단어" tone="ink" />
            <StatCell value={progress.masteredCount} label="완성 단어" tone="good" />
            <StatCell value={totalCount} label="전체" tone="ink" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="gd-meter flex-1" data-tone={mastered ? "good" : undefined}>
              <span style={{ width: `${seenPct}%` }} />
            </div>
            <span className="gd-mono gd-t-3xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
              {seenPct}%
            </span>
          </div>

          {progress.lastStudiedAt && (
            <p className="gd-t-2xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
              마지막 학습 {lastStudiedLabel(progress.lastStudiedAt)}
            </p>
          )}
        </section>

        {/* ── 단계 스테퍼 ── */}
        <section className="gd-card px-4 py-3.5">
          <p className="gd-label mb-2">진행 단계</p>
          <div className="gd-seg">
            {VOCAB_DECK_STAGES.map((s, i) => (
              <i
                key={s}
                data-on={
                  mastered || i < stageIdx ? "done" : i === stageIdx ? "true" : undefined
                }
              />
            ))}
          </div>
          <div className="mt-1.5 flex">
            {VOCAB_DECK_STAGES.map((s, i) => (
              <span
                key={s}
                className="gd-t-3xs flex-1 text-center font-medium"
                style={{
                  color: mastered
                    ? "var(--gd-good)"
                    : i === stageIdx
                      ? "var(--gd-blue)"
                      : i < stageIdx
                        ? "var(--gd-ink-2)"
                        : "var(--gd-ink-3)",
                }}
              >
                {VOCAB_STAGE_LABELS[s]}
              </span>
            ))}
          </div>
        </section>

        {/* ── 단계별 진입 카드 ── */}
        <section>
          <p className="gd-label mb-2">훈련</p>
          <div className="flex flex-col gap-2">
            {cards.map((c) => {
              const inner = (
                <div
                  className="gd-card flex min-h-[2.75rem] items-center gap-3 px-3.5 py-3.5"
                  style={!c.enabled ? { opacity: 0.55 } : undefined}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={
                      c.done
                        ? { background: "var(--gd-good-soft)", color: "var(--gd-good)" }
                        : c.enabled
                          ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
                          : { background: "var(--gd-paper)", color: "var(--gd-ink-3)" }
                    }
                  >
                    {c.done ? (
                      <Check className="h-5 w-5" strokeWidth={2.25} />
                    ) : c.enabled ? (
                      c.icon
                    ) : (
                      <Lock className="h-4.5 w-4.5" strokeWidth={1.75} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="gd-t-base font-semibold">{c.label}</p>
                    <p className="gd-t-2xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
                      {c.enabled ? c.desc : c.lockNote}
                    </p>
                  </div>
                  {c.key === "test" && progress.bestTestScore !== null && (
                    <span className="gd-block-head gd-mono shrink-0" data-tone="accent">
                      최고 {progress.bestTestScore}점
                    </span>
                  )}
                  {c.enabled && (
                    <ChevronRight
                      className="h-4 w-4 shrink-0"
                      style={{ color: "var(--gd-ink-3)" }}
                      aria-hidden
                    />
                  )}
                </div>
              );
              return c.enabled ? (
                <Link key={c.key} href={c.href}>
                  {inner}
                </Link>
              ) : (
                <div key={c.key} aria-disabled="true">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
