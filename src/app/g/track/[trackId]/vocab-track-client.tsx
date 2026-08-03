"use client";

// 어휘 트랙 허브 — /g/track/vocab
// 오늘의 복습(만기 큐)이 최상단 CTA, 그 아래 빠른 훈련 2버튼 · 단어장(덱) 그리드.
// 데이터는 서버(page.tsx)가 조립해 payload 로 내려준다 — 여기서는 렌더만 한다.
// 규범: gd.css 기존 클래스 + Tailwind 레이아웃 유틸만, 폰트 크기는 .gd-t-* 만.

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactElement } from "react";
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Flame,
  ScrollText,
  Target,
} from "lucide-react";
import {
  VOCAB_STAGE_LABELS,
  vocabLevelProgress,
} from "@/lib/vocab-drill/display";

export interface VocabTrackPayload {
  dueCount: number;
  weakCount: number;
  stat: {
    xp: number;
    sensesSeen: number;
    sensesMastered: number;
    streakDays: number;
    bestCombo: number;
  } | null;
  decks: {
    id: string;
    title: string;
    subtitle: string | null;
    senseCount: number;
    stage: string;
    seenCount: number;
    masteredCount: number;
    bestTestScore: number | null;
  }[];
}

const INK3: CSSProperties = { color: "var(--gd-ink-3)" };

export function VocabTrackClient({
  payload,
}: {
  payload: VocabTrackPayload;
}): ReactElement {
  const router = useRouter();
  const { dueCount, weakCount, stat, decks } = payload;
  const lv = vocabLevelProgress(stat?.xp ?? 0);
  const streak = stat?.streakDays ?? 0;

  return (
    <div className="gd-page mx-auto min-h-dvh px-5 pb-14">
      <header className="flex items-center gap-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push("/g/home")}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--gd-ink-2)" }}
          aria-label="홈으로"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <p className="gd-label">학습 트랙</p>
      </header>

      <h1 className="gd-t-xl mt-2 font-bold tracking-tight">어휘 훈련</h1>
      <p className="gd-prose-2 mt-1">
        기출에서 뽑은 단어를 매일 짧게, 잊기 직전에 다시 만납니다.
      </p>

      {/* ── 히어로: 레벨·XP·연속 학습일 ── */}
      <section className="gd-card mt-4 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="gd-label">어휘 훈련 레벨</p>
          <span
            className="gd-t-2xs inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold"
            style={
              streak > 0
                ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
                : {
                    background: "var(--gd-paper)",
                    color: "var(--gd-ink-3)",
                    border: "1px solid var(--gd-line)",
                  }
            }
          >
            <Flame className="h-3 w-3" strokeWidth={2} aria-hidden />
            연속 {streak}일
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="gd-mono gd-t-2xl font-bold">LV.{lv.level}</span>
          <span className="gd-mono gd-t-2xs" style={INK3}>
            {lv.intoLevel}/{lv.toNext} XP
          </span>
        </div>
        <div
          className="gd-meter mt-2"
          role="img"
          aria-label={`다음 레벨까지 ${lv.pct}% 진행`}
        >
          <span style={{ width: `${lv.pct}%` }} />
        </div>
        <p className="gd-t-2xs mt-1.5" style={INK3}>
          다음 레벨까지{" "}
          <strong className="gd-mono" style={{ color: "var(--gd-ink-2)" }}>
            {Math.max(0, lv.toNext - lv.intoLevel)}
          </strong>{" "}
          XP 남았습니다
        </p>
      </section>

      {/* ── 오늘의 복습 (최상단 CTA) ── */}
      <section className="gd-block mt-4" data-tone="accent">
        <p className="gd-label mb-1.5" style={{ color: "var(--gd-blue)" }}>
          오늘의 복습
        </p>
        {dueCount > 0 ? (
          <>
            <p className="gd-prose font-bold">
              복습할 단어 {dueCount}개가 기다립니다
            </p>
            <p className="gd-t-xs mt-1" style={INK3}>
              잊기 직전의 단어부터 순서대로 나옵니다
            </p>
            <Link
              href="/g/vocab-drill?mode=review"
              className="gd-btn gd-btn-primary mt-3 w-full"
            >
              지금 복습
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </>
        ) : (
          <>
            <p className="gd-prose font-bold">오늘 복습은 끝났습니다</p>
            <p className="gd-t-xs mt-1" style={INK3}>
              드릴로 새 단어를 만나며 기억을 넓혀 보세요
            </p>
            <Link
              href="/g/vocab-drill?mode=drill"
              className="gd-btn gd-btn-primary mt-3 w-full"
            >
              오늘의 드릴
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </>
        )}
      </section>

      {/* ── 빠른 훈련 ── */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Link
          href="/g/vocab-drill?mode=weak"
          className="gd-card flex min-h-[2.75rem] items-center gap-2.5 px-3.5 py-3"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }}
          >
            <Target className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="gd-t-sm flex items-center gap-1.5 font-semibold">
              취약 단어
              {weakCount > 0 && (
                <span
                  className="gd-mono gd-t-3xs rounded-full px-1.5 py-0.5 font-bold"
                  style={{
                    background: "var(--gd-bad-soft)",
                    color: "var(--gd-bad)",
                  }}
                >
                  {weakCount}
                </span>
              )}
            </span>
            <span className="gd-t-3xs block" style={INK3}>
              {weakCount > 0 ? "낮은 숙달도부터" : "아직 없습니다"}
            </span>
          </span>
        </Link>
        <Link
          href="/g/vocab-drill?mode=context"
          className="gd-card flex min-h-[2.75rem] items-center gap-2.5 px-3.5 py-3"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: "var(--gd-blue-soft)",
              color: "var(--gd-blue)",
            }}
          >
            <ScrollText className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="gd-t-sm block font-semibold">문맥 훈련</span>
            <span className="gd-t-3xs block" style={INK3}>
              기출 문장 빈칸
            </span>
          </span>
        </Link>
      </div>

      {/* ── 단어장(덱) ── */}
      <section className="mt-8">
        <div className="gd-hairline-b mb-3 flex items-baseline justify-between gap-2 pb-2">
          <p className="gd-label" style={{ color: "var(--gd-blue)" }}>
            단어장
          </p>
          <p className="gd-mono gd-t-2xs shrink-0" style={INK3}>
            {decks.length}권
          </p>
        </div>
        {decks.length === 0 ? (
          <div className="gd-card px-4 py-8 text-center">
            <p className="gd-t-sm" style={INK3}>
              아직 열린 단어장이 없습니다. 잠시 후 다시 확인해 주세요.
            </p>
          </div>
        ) : (
          <div className="gd-grid-2 flex flex-col gap-2.5">
            {decks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}
      </section>

      {/* ── 숙달 요약 ── */}
      <section className="gd-card mt-6 px-4 py-4">
        <div className="flex items-stretch">
          <StatCell
            value={stat?.sensesSeen ?? 0}
            label="만난 단어"
            color="var(--gd-ink)"
          />
          <span
            className="w-px shrink-0"
            style={{ background: "var(--gd-line)" }}
            aria-hidden
          />
          <StatCell
            value={stat?.sensesMastered ?? 0}
            label="완성한 단어"
            color="var(--gd-good)"
          />
        </div>
      </section>

      {/* ── 내 단어 기록 ── */}
      <Link href="/g/vocab-drill/me" className="gd-btn gd-btn-ghost mt-4 w-full">
        <BarChart3 className="h-4 w-4" strokeWidth={2} aria-hidden />
        내 단어 기록
      </Link>
    </div>
  );
}

// ── 소부품 ──────────────────────────────────────────────────────────────────

function StatCell({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 text-center">
      <span
        className="gd-mono gd-t-2xl font-bold leading-none tracking-tight"
        style={{ color }}
      >
        {value.toLocaleString()}
      </span>
      <span className="gd-t-2xs" style={INK3}>
        {label}
      </span>
    </div>
  );
}

function StagePill({ stage }: { stage: string }) {
  const label = VOCAB_STAGE_LABELS[stage] ?? stage;
  const style: CSSProperties =
    stage === "MASTERED"
      ? { background: "var(--gd-good-soft)", color: "var(--gd-master)" }
      : stage === "LEARN"
        ? {
            background: "var(--gd-paper)",
            color: "var(--gd-ink-3)",
            border: "1px solid var(--gd-line)",
          }
        : { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" };
  return (
    <span
      className="gd-t-3xs shrink-0 rounded-full px-1.5 py-0.5 font-bold"
      style={style}
    >
      {label}
    </span>
  );
}

function DeckCard({
  deck,
}: {
  deck: VocabTrackPayload["decks"][number];
}) {
  const mastered = deck.stage === "MASTERED";
  const pct = Math.min(
    100,
    Math.round((deck.seenCount / Math.max(1, deck.senseCount)) * 100),
  );

  return (
    <Link href={`/g/vocab-drill/deck/${deck.id}`} className="block">
      <div className="gd-card flex h-full flex-col px-3.5 py-3.5">
        <div className="flex items-center gap-2">
          <p
            className="gd-t-md min-w-0 flex-1 truncate font-semibold"
            style={{ wordBreak: "keep-all" }}
          >
            {deck.title}
          </p>
          <StagePill stage={deck.stage} />
          <ChevronRight
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--gd-ink-3)" }}
            aria-hidden
          />
        </div>

        {deck.subtitle ? (
          <p
            className="gd-t-xs mt-1.5 leading-snug"
            style={{
              color: "var(--gd-ink-3)",
              wordBreak: "keep-all",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {deck.subtitle}
          </p>
        ) : null}

        <div className="mt-2.5 flex items-center gap-2">
          <div
            className="gd-meter flex-1"
            data-tone={mastered ? "good" : undefined}
            role="img"
            aria-label={`진행 ${deck.seenCount}/${deck.senseCount} 단어`}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <span
            className="gd-mono gd-t-3xs shrink-0"
            style={{
              color: mastered ? "var(--gd-master)" : "var(--gd-ink-3)",
            }}
          >
            {deck.seenCount}/{deck.senseCount}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="gd-t-3xs" style={INK3}>
            완성 {deck.masteredCount}
          </span>
          <span
            className="gd-mono gd-t-3xs ml-auto shrink-0 font-semibold"
            style={{
              color:
                deck.bestTestScore !== null
                  ? deck.bestTestScore >= 70
                    ? "var(--gd-good)"
                    : "var(--gd-bad)"
                  : "var(--gd-ink-3)",
            }}
          >
            {deck.bestTestScore !== null
              ? `최고 시험 ${deck.bestTestScore}점`
              : "시험 전"}
          </span>
        </div>
      </div>
    </Link>
  );
}
