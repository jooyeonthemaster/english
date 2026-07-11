"use client";

// ============================================================================
// 어법 드릴 — 플레이어 (핵심 화면)
//
// 상/중/하 3단 고정: 헤더(진행) / 문항(스크롤) / 액션바(힌트·개념·질문·제출).
// 상태기계: loading → playing(answer→feedback 반복) → summary.
// 채점은 전부 서버(/api/grammar-drill/submit) — 클라이언트에 정답 없음.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Lightbulb,
  MessageCircleQuestion,
  RotateCcw,
} from "lucide-react";
import type {
  ClientItem,
  DrillMode,
  QueueResponse,
  SubmitVerdict,
} from "@/lib/grammar-drill/payload";
import { ItemView } from "./item-views";
import { VerdictPanel, stageLabel } from "./verdict-panel";
import { ConceptSheet, ChatSheet } from "./sheets";

const DIFF_LABEL = ["", "기초", "표준", "심화", "킬러"] as const;

interface DrillParams {
  mode: DrillMode;
  unitId?: string;
  conceptId?: string;
  setId?: string;
  assignmentId?: string;
}

type Phase = "loading" | "error" | "empty" | "playing" | "summary";

interface ItemResult {
  itemId: string;
  correct: boolean;
  timeMs: number;
}

export function DrillPlayer({ params }: { params: DrillParams }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<SubmitVerdict | null>(null);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [peeked, setPeeked] = useState(false);
  const [sheet, setSheet] = useState<"none" | "concept" | "chat">("none");
  const [submitting, setSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ score: number; passed: boolean } | null>(null);
  // 큐 로드·문항 전환 시마다 Date.now()로 재설정되므로 초기값은 0으로 둔다.
  const startRef = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  const item: ClientItem | null = queue?.items[idx] ?? null;

  const loadQueue = useCallback(async () => {
    setPhase("loading");
    setQueue(null);
    setIdx(0);
    setResults([]);
    setVerdict(null);
    setDraft(null);
    setHintLevel(0);
    setPeeked(false);
    setTestResult(null);
    const qs = new URLSearchParams({ mode: params.mode });
    if (params.unitId) qs.set("unitId", params.unitId);
    if (params.conceptId) qs.set("conceptId", params.conceptId);
    if (params.setId) qs.set("setId", params.setId);
    if (params.assignmentId) qs.set("assignmentId", params.assignmentId);
    try {
      const res = await fetch(`/api/grammar-drill/queue?${qs}`);
      if (res.status === 401) {
        router.replace("/g");
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        setPhase("error");
        return;
      }
      const q: QueueResponse = data.queue;
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
  }, [params.mode, params.unitId, params.conceptId, params.setId, params.assignmentId, router]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function submit() {
    if (!item || draft === null || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/grammar-drill/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          answer: draft,
          timeMs: Date.now() - startRef.current,
          hintUsed: hintLevel,
          conceptPeeked: peeked,
          source: sourceFor(params.mode),
          assignmentId: params.assignmentId,
        }),
      });
      if (res.status === 401) {
        router.replace("/g");
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setVerdict(data.verdict);
        setResults((r) => [
          ...r,
          {
            itemId: item.id,
            correct: data.verdict.correct,
            timeMs: Date.now() - startRef.current,
          },
        ]);
        requestAnimationFrame(() => {
          mainRef.current?.scrollTo({
            top: mainRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      }
    } catch {
      // 판정 실패 — 상태 유지, 학생이 다시 제출 가능
    }
    setSubmitting(false);
  }

  async function next() {
    if (!queue) return;
    if (idx + 1 >= queue.items.length) {
      // 큐 종료 훅
      if (params.mode === "concept_check" && params.unitId) {
        await fetch(`/api/grammar-drill/unit/${params.unitId}/learn`, {
          method: "POST",
        }).catch(() => {});
      }
      if (params.mode === "test" && params.unitId) {
        const res = await fetch(
          `/api/grammar-drill/unit/${params.unitId}/complete-test`,
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
    setPeeked(false);
    startRef.current = Date.now();
    mainRef.current?.scrollTo({ top: 0 });
  }

  function exit() {
    if (params.mode === "concept_check" || params.mode === "test") {
      router.push(params.unitId ? `/g/unit/${params.unitId}` : "/g/home");
      return;
    }
    router.push(params.unitId ? `/g/unit/${params.unitId}` : "/g/home");
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
        text={
          params.mode === "review"
            ? "복습할 오답이 없습니다. 드릴을 먼저 진행해 주십시오."
            : params.mode === "assignment"
              ? "이 배정 학습은 이미 완료되었습니다."
              : "출제할 문항이 아직 준비되지 않았습니다."
        }
        action={{ label: "홈으로", onClick: () => router.push("/g/home") }}
      />
    );
  if (phase === "summary" && queue)
    return (
      <Summary
        queue={queue}
        results={results}
        testResult={testResult}
        mode={params.mode}
        unitId={params.unitId}
        onRetry={loadQueue}
        onExit={exit}
      />
    );
  if (!item || !queue) return null;

  const progress = ((idx + (verdict ? 1 : 0)) / queue.items.length) * 100;
  const correctSoFar = results.filter((r) => r.correct).length;

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      {/* ── 헤더 ── */}
      <header className="shrink-0 px-4 pt-3">
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
          <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">
            {queue.title}
          </p>
          <p className="gd-t-xs shrink-0 font-semibold" style={{ color: "var(--gd-ink-2)" }}>
            {/* 배정 모드: 큐는 배정 전체가 아니라 이번 세트만 담는다(엔진 QUEUE_SIZE 단위
                발급). 페이로드의 assignmentRemaining 만으로는 전체 문항 수를 알 수 없어
                누적 카운터 대신 "이번 세트" 라벨로 헤더 제목(전체)과 의미를 구분한다. */}
            {params.mode === "assignment" ? (
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
            {item.unitTitle}
          </span>
          <span
            className="gd-t-3xs rounded-md px-1.5 py-0.5 font-semibold"
            style={{ background: "var(--gd-paper)", color: "var(--gd-ink-2)", border: "1px solid var(--gd-line)" }}
          >
            {item.conceptTitle}
          </span>
          <span className="gd-t-3xs ml-auto font-semibold" style={{ color: diffColor(item.difficulty) }}>
            {DIFF_LABEL[item.difficulty]}
          </span>
        </div>

        <ItemView item={item} draft={draft} setDraft={setDraft} verdict={verdict} />

        {/* 힌트 — 인라인 계단식 */}
        {hintLevel >= 1 && !verdict && (
          <div
            className="gd-pop mt-4 rounded-xl border p-3.5"
            style={{ borderColor: "var(--gd-blue-line)", background: "var(--gd-blue-soft)" }}
          >
            <p className="gd-label mb-1" style={{ color: "var(--gd-blue)" }}>
              힌트 1 — 구조
            </p>
            <p className="gd-t-sm leading-relaxed">{item.hints[0]}</p>
            {hintLevel >= 2 && (
              <>
                <p className="gd-label mt-3 mb-1" style={{ color: "var(--gd-blue)" }}>
                  힌트 2 — 판단 규칙
                </p>
                <p className="gd-t-sm leading-relaxed">{item.hints[1]}</p>
              </>
            )}
          </div>
        )}

        {verdict && <VerdictPanel verdict={verdict} />}
      </main>

      {/* ── 액션바 ── */}
      <footer className="gd-hairline-t gd-safe-b shrink-0 bg-white px-4 pt-2.5">
        <div className="mb-2 flex gap-2">
          {!verdict && (
            <ToolButton
              icon={<Lightbulb className="h-4 w-4" strokeWidth={1.75} />}
              label={hintLevel === 0 ? "힌트" : hintLevel === 1 ? "힌트 2" : "힌트 끝"}
              disabled={hintLevel >= 2}
              onClick={() => setHintLevel((h) => (h < 2 ? ((h + 1) as 1 | 2) : h))}
            />
          )}
          <ToolButton
            icon={<BookOpen className="h-4 w-4" strokeWidth={1.75} />}
            label="개념"
            onClick={() => setSheet("concept")}
          />
          <ToolButton
            icon={<MessageCircleQuestion className="h-4 w-4" strokeWidth={1.75} />}
            label="질문"
            onClick={() => setSheet("chat")}
          />
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
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={draft === null || draft.trim() === "" || submitting}
            className="gd-btn gd-btn-primary w-full"
          >
            {submitting ? "채점 중…" : "제출하기"}
          </button>
        )}
      </footer>

      {/* ── 시트 ── */}
      {sheet === "concept" && (
        <ConceptSheet
          conceptId={item.conceptId}
          onClose={() => setSheet("none")}
          onPeeked={() => setPeeked(true)}
        />
      )}
      {sheet === "chat" && (
        <ChatSheet
          itemId={item.id}
          revealAllowed={Boolean(verdict)}
          onClose={() => setSheet("none")}
        />
      )}
    </div>
  );
}

function sourceFor(mode: DrillMode): string {
  switch (mode) {
    case "concept_check":
      return "CONCEPT_CHECK";
    case "reading":
      return "READING";
    case "written":
      return "WRITTEN";
    case "test":
      return "UNIT_TEST";
    case "mixed":
      return "MIXED";
    case "review":
      return "REVIEW";
    case "assignment":
      return "ASSIGNMENT";
    default:
      return "DRILL";
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
  mode,
  unitId,
  onRetry,
  onExit,
}: {
  queue: QueueResponse;
  results: ItemResult[];
  testResult: { score: number; passed: boolean } | null;
  mode: DrillMode;
  unitId?: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const acc = total ? Math.round((correct / total) * 100) : 0;
  const avgSec = total
    ? Math.round(results.reduce((s, r) => s + r.timeMs, 0) / total / 1000)
    : 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
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
              className="gd-t-sm mt-2 font-semibold"
              style={{ color: testResult.passed ? "var(--gd-good)" : "var(--gd-bad)" }}
            >
              {testResult.passed
                ? "합격 — 유닛 마스터를 달성했습니다"
                : "70점 미만 — 취약 개념을 복습한 뒤 재응시해 주십시오"}
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
          <Stat label="문항" value={`${total}개`} />
        </div>

        {mode === "concept_check" && (
          <p className="gd-t-xs mt-4 rounded-lg px-3 py-2" style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}>
            개념 학습을 마쳤습니다 — {stageLabel("DRILL")} 단계가 열렸습니다.
          </p>
        )}
      </div>

      <div className="mt-4 flex w-full flex-col gap-2">
        {mode !== "concept_check" && mode !== "test" && (
          <button type="button" onClick={onRetry} className="gd-btn gd-btn-primary w-full">
            <RotateCcw className="h-4 w-4" strokeWidth={2} />
            한 세트 더
          </button>
        )}
        {mode === "test" && !testResult?.passed && (
          <button type="button" onClick={onRetry} className="gd-btn gd-btn-primary w-full">
            <RotateCcw className="h-4 w-4" strokeWidth={2} />
            재응시
          </button>
        )}
        <button type="button" onClick={onExit} className="gd-btn gd-btn-ghost w-full">
          {unitId ? "유닛으로" : "홈으로"}
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
