"use client";

// ============================================================================
// 단어 훈련 — 몰입 플레이어 (어법 drill-player.tsx 의 단어판)
//
// 상/중/하 3단 고정: 헤더(진행·콤보) / 문항(스크롤) / 액션바(힌트·제출).
// 상태기계: loading → playing(answer→feedback 반복) → summary.
// 채점은 전부 서버(/api/vocab-drill/submit) — 클라이언트에 정답 없음.
// FLASH 는 카드 내 O/X 버튼이 onFlashAnswer 로 즉시 제출을 트리거한다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Flame,
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import type {
  VocabClientItem,
  VocabDrillMode,
  VocabQueueResponse,
  VocabSubmitBody,
  VocabSubmitVerdict,
} from "@/lib/vocab-drill/payload";
import {
  VOCAB_ITEM_TYPE_LABELS,
  VOCAB_TIER_LABELS,
} from "@/lib/vocab-drill/display";
import { VocabItemView } from "./item-views";
import { VocabVerdictPanel } from "./verdict-panel";

const DIFF_LABEL = ["", "기초", "표준", "심화", "고난도", "킬러"] as const;

type Phase = "loading" | "error" | "empty" | "playing" | "summary";

interface ItemResult {
  senseId: string;
  lemma: string;
  senseKo: string;
  correct: boolean;
  timeMs: number;
  xp: number;
}

export interface VocabDrillPlayerProps {
  mode: VocabDrillMode;
  deckId?: string;
  assignmentId?: string;
}

export function VocabDrillPlayer({ mode, deckId, assignmentId }: VocabDrillPlayerProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<VocabQueueResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<VocabSubmitVerdict | null>(null);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [submitting, setSubmitting] = useState(false);
  // 제출 실패는 반드시 화면에 남긴다 — 무음 실패는 학생을 문항에 가둔다.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [learnResult, setLearnResult] = useState<{
    advanced: boolean;
    seen: number;
    total: number;
  } | null>(null);
  // 큐 로드·문항 전환 시마다 Date.now()로 재설정되므로 초기값은 0으로 둔다.
  const startRef = useRef(0);
  // 문항당 1회 생성해 재시도에도 같은 키를 재사용한다(서버 멱등 원장).
  const clientKeyRef = useRef<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const item: VocabClientItem | null = queue?.items[idx] ?? null;
  const effectiveDeckId = queue?.deckId ?? deckId;

  const loadQueue = useCallback(async () => {
    setPhase("loading");
    setQueue(null);
    setIdx(0);
    setResults([]);
    setVerdict(null);
    setDraft(null);
    setHintLevel(0);
    setSubmitError(null);
    setTestResult(null);
    setLearnResult(null);
    clientKeyRef.current = null;
    const qs = new URLSearchParams({ mode });
    if (deckId) qs.set("deckId", deckId);
    if (assignmentId) qs.set("assignmentId", assignmentId);
    try {
      const res = await fetch(`/api/vocab-drill/queue?${qs}`);
      if (res.status === 401) {
        router.replace("/g");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data?.ok || !data.queue) {
        setPhase("error");
        return;
      }
      const q: VocabQueueResponse = data.queue;
      // ok:true + items:[] 는 정상적 빈 상태다(복습 없음·과제 완료) — 오류가 아니다.
      if (q.items.length === 0) {
        setQueue(q);
        setPhase("empty");
        return;
      }
      setQueue(q);
      startRef.current = Date.now();
      setPhase("playing");
    } catch {
      setPhase("error");
    }
  }, [mode, deckId, assignmentId, router]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function submit(answerOverride?: string) {
    const answer = answerOverride ?? draft;
    if (!item || answer === null || answer.trim() === "" || submitting || verdict) return;
    setSubmitting(true);
    setSubmitError(null);
    if (!clientKeyRef.current) clientKeyRef.current = crypto.randomUUID();
    const body: VocabSubmitBody = {
      senseId: item.senseId,
      itemType: item.type,
      answer,
      timeMs: Date.now() - startRef.current,
      hintUsed: hintLevel,
      source: item.type === "FLASH" ? "FLASH" : sourceFor(mode),
      deckId: effectiveDeckId,
      exampleId: item.type === "CONTEXT_FILL" ? item.exampleId : undefined,
      assignmentId,
      // probe 는 채점 근거 봉인 토큰이다 — 없으면 서버가 채점을 거부한다(404).
      // TRAP_JUDGE 와 EXAMPLE_MATCH(라벨↔실키 매핑) 둘 다 필수다.
      probe:
        item.type === "TRAP_JUDGE" || item.type === "EXAMPLE_MATCH"
          ? item.probe
          : undefined,
      clientKey: clientKeyRef.current,
    };
    try {
      const res = await fetch("/api/vocab-drill/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/g");
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.ok && data.verdict) {
        const v: VocabSubmitVerdict = data.verdict;
        setVerdict(v);
        setResults((r) => [
          ...r,
          {
            senseId: item.senseId,
            lemma: v.lemma,
            senseKo: v.senseKo,
            correct: v.correct,
            timeMs: Date.now() - startRef.current,
            xp: v.duplicate ? 0 : v.xpGained,
          },
        ]);
        requestAnimationFrame(() => {
          mainRef.current?.scrollTo({
            top: mainRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      } else if (data?.error === "ITEM_NOT_FOUND") {
        // 서버가 이 문항을 채점할 수 없다(재료 소실·토큰 만료) — 재시도해도 같다.
        // 학생을 가두지 말고 다음 문항으로 넘긴다(기록은 남지 않는다).
        setSubmitting(false);
        await next();
        return;
      } else {
        setSubmitError("채점 결과를 받지 못했습니다. 다시 제출해 주십시오.");
      }
    } catch {
      // 판정 실패 — 상태 유지, 학생이 다시 제출 가능(clientKey 재사용으로 멱등)
      setSubmitError("연결이 원활하지 않습니다. 다시 제출해 주십시오.");
    }
    setSubmitting(false);
  }

  async function next() {
    if (!queue) return;
    if (idx + 1 >= queue.items.length) {
      // 큐 종료 훅 — 어법 concept_check/test 선례의 단어판
      if (mode === "learn" && effectiveDeckId) {
        const res = await fetch(`/api/vocab-drill/deck/${effectiveDeckId}/learn`, {
          method: "POST",
        }).catch(() => null);
        if (res?.ok) {
          const data = await res.json().catch(() => null);
          if (data?.ok) {
            setLearnResult({ advanced: data.advanced, seen: data.seen, total: data.total });
          }
        }
      }
      if (mode === "test" && effectiveDeckId) {
        const res = await fetch(
          `/api/vocab-drill/deck/${effectiveDeckId}/complete-test`,
          { method: "POST" },
        ).catch(() => null);
        if (res?.ok) {
          const data = await res.json().catch(() => null);
          if (data?.ok) setTestResult({ score: data.score, passed: data.passed });
        }
      }
      setPhase("summary");
      return;
    }
    setIdx(idx + 1);
    setDraft(null);
    setVerdict(null);
    setHintLevel(0);
    setSubmitError(null);
    clientKeyRef.current = null;
    startRef.current = Date.now();
    mainRef.current?.scrollTo({ top: 0 });
  }

  function exit() {
    router.back();
  }

  // ── 화면 분기 ──
  if (phase === "loading") return <CenterNote text="문항을 준비하는 중…" />;
  if (phase === "error")
    return (
      <CenterNote
        text="문항을 불러오지 못했습니다."
        action={{ label: "다시 시도", onClick: loadQueue }}
      />
    );
  if (phase === "empty")
    return (
      <CenterNote
        text={emptyText(mode)}
        action={{ label: "트랙으로", onClick: () => router.push("/g/track/vocab") }}
      />
    );
  if (phase === "summary" && queue)
    return (
      <Summary
        queue={queue}
        results={results}
        testResult={testResult}
        learnResult={learnResult}
        mode={mode}
        onRetry={loadQueue}
        onExit={exit}
      />
    );
  if (!item || !queue) return null;

  const progress = ((idx + (verdict ? 1 : 0)) / queue.items.length) * 100;
  const correctSoFar = results.filter((r) => r.correct).length;
  // 연속정답 콤보 — 뒤에서부터 이어진 정답 수
  let combo = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].correct) combo += 1;
    else break;
  }
  const isFlash = item.type === "FLASH";
  const hasHints = !isFlash && item.hints[0].trim() !== "";
  const canSubmit = (() => {
    if (draft === null || draft.trim() === "") return false;
    if (item.type === "EXAMPLE_MATCH") {
      // 부분 제출 금지 — 서버는 서빙한 짝을 전부 채운 답만 채점한다(아니면 404).
      return draft.split(",").filter(Boolean).length === item.examples.length;
    }
    return true;
  })();

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      {/* ── 헤더 ── */}
      <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex h-10 items-center gap-2">
          <button
            type="button"
            onClick={exit}
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-2)" }}
            aria-label="나가기"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
          <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">{queue.title}</p>
          {combo >= 2 && (
            <span className="gd-combo gd-t-2xs shrink-0">
              <Flame className="h-3 w-3" strokeWidth={2.25} />
              {combo}연속
            </span>
          )}
          <p className="gd-t-xs shrink-0 font-semibold" style={{ color: "var(--gd-ink-2)" }}>
            {mode === "assignment" ? (
              <span className="gd-t-3xs mr-1 font-medium" style={{ color: "var(--gd-ink-3)" }}>
                이번 세트
              </span>
            ) : null}
            <span className="gd-mono">
              {idx + 1}
              <span style={{ color: "var(--gd-ink-3)" }}>/{queue.items.length}</span>
            </span>
          </p>
        </div>
        <div className="gd-meter mt-1">
          <span style={{ width: `${progress}%` }} />
        </div>
      </header>

      {/* ── 문항 ── */}
      <main ref={mainRef} className="gd-scroll flex-1 px-5 pb-6 pt-4">
        <div className="mb-3.5 flex items-center gap-1.5">
          <span
            className="gd-t-3xs rounded-md px-1.5 py-0.5 font-bold tracking-wide"
            style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
          >
            {VOCAB_ITEM_TYPE_LABELS[item.type]}
          </span>
          <span
            className="gd-t-3xs rounded-md px-1.5 py-0.5 font-semibold"
            style={{
              background: "var(--gd-paper)",
              color: "var(--gd-ink-2)",
              border: "1px solid var(--gd-line)",
            }}
          >
            {VOCAB_TIER_LABELS[item.tier] ?? item.tier}
          </span>
          <span
            className="gd-t-3xs ml-auto font-semibold"
            style={{ color: diffColor(item.difficulty) }}
          >
            {DIFF_LABEL[item.difficulty] ?? ""}
          </span>
        </div>

        <VocabItemView
          key={item.id}
          item={item}
          draft={draft}
          setDraft={setDraft}
          verdict={verdict}
          onFlashAnswer={(v) => void submit(v)}
        />

        {/* 힌트 — 인라인 계단식 2단 */}
        {hintLevel >= 1 && !verdict && hasHints && (
          <div
            className="gd-pop mt-4 rounded-xl border p-3.5"
            style={{ borderColor: "var(--gd-blue-line)", background: "var(--gd-blue-soft)" }}
          >
            <p className="gd-label mb-1" style={{ color: "var(--gd-blue)" }}>
              힌트 1
            </p>
            <p className="gd-t-sm leading-relaxed">{item.hints[0]}</p>
            {hintLevel >= 2 && (
              <>
                <p className="gd-label mt-3 mb-1" style={{ color: "var(--gd-blue)" }}>
                  힌트 2
                </p>
                <p className="gd-t-sm leading-relaxed">{item.hints[1]}</p>
              </>
            )}
          </div>
        )}

        {/* 제출 실패 배너 — 재시도(같은 clientKey 로 멱등)·건너뛰기 탈출구 */}
        {submitError && !verdict && (
          <div className="gd-block gd-pop mt-4" data-tone="warn" role="alert">
            <div className="flex items-start gap-2">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={2}
                style={{ color: "var(--gd-bad)" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="gd-t-sm font-semibold" style={{ color: "var(--gd-bad)" }}>
                  {submitError}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting}
                    className="gd-btn gd-btn-ghost"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
                    다시 제출
                  </button>
                  <button
                    type="button"
                    onClick={() => void next()}
                    className="gd-btn gd-btn-quiet"
                  >
                    건너뛰기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {verdict && <VocabVerdictPanel verdict={verdict} itemType={item.type} />}
      </main>

      {/* ── 액션바 ── */}
      <footer className="gd-hairline-t gd-safe-b shrink-0 bg-white px-4 pt-2.5">
        <div className="mb-2 flex gap-2">
          {!verdict && hasHints && (
            <ToolButton
              icon={<Lightbulb className="h-4 w-4" strokeWidth={1.75} />}
              label={hintLevel === 0 ? "힌트" : hintLevel === 1 ? "힌트 2" : "힌트 끝"}
              disabled={hintLevel >= 2}
              onClick={() => setHintLevel((h) => (h < 2 ? ((h + 1) as 1 | 2) : h))}
            />
          )}
          {results.length > 0 && (
            <p className="gd-mono gd-t-2xs ml-auto self-center" style={{ color: "var(--gd-ink-3)" }}>
              정답 {correctSoFar}/{results.length}
            </p>
          )}
        </div>
        {verdict ? (
          <button type="button" onClick={next} className="gd-btn gd-btn-primary w-full">
            {idx + 1 >= queue.items.length ? "결과 보기" : "다음 문항"}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : isFlash ? (
          <div className="flex min-h-11 items-center justify-center">
            <p className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
              카드를 확인한 뒤 알고 있었는지 선택해 주십시오.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || submitting}
            className="gd-btn gd-btn-primary w-full"
          >
            {submitting ? "채점 중…" : "제출하기"}
          </button>
        )}
      </footer>
    </div>
  );
}

// ── 모드 → 제출 source (payload.ts 규약) ─────────────────────────────────────

function sourceFor(mode: VocabDrillMode): string {
  switch (mode) {
    case "learn":
      return "FLASH";
    case "context":
      return "CONTEXT";
    case "test":
      return "DECK_TEST";
    case "review":
      return "REVIEW";
    case "assignment":
      return "ASSIGNMENT";
    case "drill":
    case "weak":
    default:
      return "DRILL";
  }
}

/** 정상적 빈 상태의 안내 — 오류 문구를 쓰지 않는다(모드별로 뜻이 다르다). */
function emptyText(mode: VocabDrillMode): string {
  switch (mode) {
    case "review":
      return "오늘 복습할 단어가 없습니다";
    case "weak":
      return "취약 단어가 없습니다";
    case "assignment":
      return "과제를 모두 마쳤습니다";
    default:
      return "출제할 단어가 없습니다";
  }
}

function diffColor(d: number): string {
  if (d >= 4) return "var(--gd-bad)";
  if (d === 3) return "var(--gd-ink)";
  return "var(--gd-ink-3)";
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  // 시각(칩 h-9)은 유지하고 실제 터치 영역만 min-h-11(44px)로 확장한다.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center disabled:opacity-40"
    >
      <span
        className="gd-t-2xs flex h-9 items-center gap-1.5 rounded-lg border px-2.5 font-semibold"
        style={{ borderColor: "var(--gd-line)", color: "var(--gd-ink-2)" }}
      >
        {icon}
        {label}
      </span>
    </button>
  );
}

function CenterNote({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
        {text}
      </p>
      {action && (
        <button type="button" onClick={action.onClick} className="gd-btn gd-btn-ghost">
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── 세트 종료 요약 ───────────────────────────────────────────────────────────

function Summary({
  queue,
  results,
  testResult,
  learnResult,
  mode,
  onRetry,
  onExit,
}: {
  queue: VocabQueueResponse;
  results: ItemResult[];
  testResult: { score: number; passed: boolean } | null;
  learnResult: { advanced: boolean; seen: number; total: number } | null;
  mode: VocabDrillMode;
  onRetry: () => void;
  onExit: () => void;
}) {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const acc = total ? Math.round((correct / total) * 100) : 0;
  const avgSec = total
    ? Math.round(results.reduce((s, r) => s + r.timeMs, 0) / total / 1000)
    : 0;
  const xpTotal = results.reduce((s, r) => s + r.xp, 0);
  // 틀린 단어 — senseId 로 중복 제거(같은 단어를 두 유형에서 틀린 경우 1회)
  const wrongWords = [
    ...new Map(
      results.filter((r) => !r.correct).map((r) => [r.senseId, r]),
    ).values(),
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8">
      <div className="gd-card gd-pop w-full p-6 text-center">
        <p className="gd-label">{queue.title}</p>

        {testResult ? (
          <>
            <p
              className="gd-mono mt-4 text-5xl font-bold"
              style={{ color: testResult.passed ? "var(--gd-good)" : "var(--gd-ink)" }}
            >
              {testResult.score}
              <span className="gd-t-lg font-semibold" style={{ color: "var(--gd-ink-3)" }}>
                점
              </span>
            </p>
            <p
              className={`gd-t-sm mt-2 font-semibold${testResult.passed ? " gd-pop" : ""}`}
              style={{ color: testResult.passed ? "var(--gd-good)" : "var(--gd-bad)" }}
            >
              {testResult.passed
                ? "합격 — 덱 시험을 통과했습니다"
                : "70점 미만 — 취약 단어를 복습한 뒤 재응시해 주십시오"}
            </p>
          </>
        ) : (
          <p className="gd-mono mt-4 text-5xl font-bold">
            {correct}
            <span className="gd-t-lg font-semibold" style={{ color: "var(--gd-ink-3)" }}>
              /{total}
            </span>
          </p>
        )}

        <div className="gd-hairline-t mt-5 grid grid-cols-3 gap-2 pt-4">
          <Stat label="정답률" value={`${acc}%`} />
          <Stat label="평균 풀이" value={`${avgSec}초`} />
          <Stat label="획득 XP" value={`+${xpTotal}`} />
        </div>

        {mode === "learn" && learnResult && (
          <p
            className="gd-t-xs mt-4 rounded-lg px-3 py-2"
            style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
          >
            {learnResult.advanced
              ? "학습 카드를 모두 확인했습니다 — 드릴 단계가 열렸습니다."
              : `카드 ${learnResult.seen}/${learnResult.total}개를 확인했습니다.`}
          </p>
        )}
      </div>

      {wrongWords.length > 0 && (
        <div className="gd-card mt-3 w-full p-4">
          <p className="gd-label mb-2">틀린 단어 {wrongWords.length}개</p>
          <ul className="flex flex-col gap-1.5">
            {wrongWords.map((w) => (
              <li key={w.senseId} className="flex items-baseline justify-between gap-3">
                <span className="gd-en gd-t-sm font-semibold">{w.lemma}</span>
                <span
                  className="gd-t-xs min-w-0 truncate text-right"
                  style={{ color: "var(--gd-ink-2)" }}
                >
                  {w.senseKo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex w-full flex-col gap-2">
        {mode === "test" ? (
          !testResult?.passed && (
            <button type="button" onClick={onRetry} className="gd-btn gd-btn-primary w-full">
              <RotateCcw className="h-4 w-4" strokeWidth={2} />
              재응시
            </button>
          )
        ) : (
          <button type="button" onClick={onRetry} className="gd-btn gd-btn-primary w-full">
            <RotateCcw className="h-4 w-4" strokeWidth={2} />
            한 세트 더
          </button>
        )}
        <button type="button" onClick={onExit} className="gd-btn gd-btn-ghost w-full">
          나가기
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="gd-mono gd-t-lg font-bold">{value}</p>
      <p className="gd-t-3xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
        {label}
      </p>
    </div>
  );
}
