"use client";

// ============================================================================
// /g/w/[taskId] — 학습지 스터디 허브 클라이언트 (docs/worksheet-study-spec.md §8.1)
//
// 데이터 페치 없음 — 서버 페이지(page.tsx)가 조립한 props 만 렌더한다.
// 스테이지는 자유 진입(순차 잠금 없음), 이어하기 CTA 는 첫 미완료 스테이지.
// legacy 완료("다 확인했습니다")는 w-viewer-client 의 complete() 패턴을 그대로
// 미러해 기배포 과제의 완료 경로를 보존한다(무회귀). 셸 태버 없는 몰입 화면.
// 학생 노출 문구는 전부 합니다체, 아이콘은 lucide-react 만.
// ============================================================================

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Play,
} from "lucide-react";

export interface HubStageRow {
  id: string;
  title: string;
  subtitle: string;
  estMin: number;
  itemCount: number;
  graded: boolean;
  status: "todo" | "in-progress" | "done";
  score?: number;
}

export interface WorksheetStudyHubProps {
  taskId: string;
  title: string;
  instructions: string | null;
  /** "D-3" | "D-DAY" | null — D+ 접두면 기한 지남(warn 톤) */
  dDay: string | null;
  stages: HubStageRow[];
  masteryPct: number | null;
  /** done 스테이지 수 */
  doneCount: number;
  taskDone: boolean;
  /** true = 단계 완료가 과제 완료 조건 */
  requiredMode: boolean;
  /** true = "다 확인했습니다" 버튼 노출(과거 배포 무회귀) */
  legacyCompleteAllowed: boolean;
  /** 이미 DONE 상태 — legacy 버튼을 완료 배지로 */
  initialLegacyDone: boolean;
}

export function WorksheetStudyHub({
  taskId,
  title,
  instructions,
  dDay,
  stages,
  masteryPct,
  doneCount,
  taskDone,
  requiredMode,
  legacyCompleteAllowed,
  initialLegacyDone,
}: WorksheetStudyHubProps) {
  // ── 안내문 — 긴 안내(40자 이상 또는 개행 포함)만 1줄 접힘 + 토글(뷰어와 동일) ──
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const instructionsCollapsible =
    !!instructions && (instructions.length >= 40 || instructions.includes("\n"));

  // ── legacy 완료 — w-viewer-client complete() 패턴 미러 ─────────────────────
  const [legacyDone, setLegacyDone] = useState(initialLegacyDone);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const complete = useCallback(async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/g/tasks/${taskId}/complete`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !json?.ok) throw new Error("COMPLETE_FAILED");
      setLegacyDone(true);
    } catch {
      setCompleteError("완료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setCompleting(false);
    }
  }, [taskId]);

  // ── 진행 파생값 ────────────────────────────────────────────────────────────
  const effectiveDone = taskDone || legacyDone;
  const stageTotal = stages.length;
  const progressPct =
    stageTotal > 0 ? Math.min(100, Math.round((doneCount / stageTotal) * 100)) : 0;
  const firstIncomplete = stages.find((s) => s.status !== "done");
  const allDone = stageTotal > 0 && !firstIncomplete;
  const started = doneCount > 0 || stages.some((s) => s.status === "in-progress");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── 헤더 ── */}
      <header
        className="shrink-0"
        style={{ background: "var(--gd-card)", borderBottom: "1px solid var(--gd-line)" }}
      >
        <div className="gd-page flex items-center gap-1.5 px-2.5 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Link
            href="/g/tasks"
            aria-label="과제 목록으로 돌아가기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-2)" }}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="gd-label">학습지</p>
            <h1 className="gd-t-sm truncate font-bold tracking-tight">{title}</h1>
          </div>
          {dDay ? (
            <span
              className="gd-block-head gd-mono shrink-0"
              data-tone={dDay.startsWith("D+") ? "warn" : undefined}
            >
              {dDay}
            </span>
          ) : null}
        </div>
      </header>

      {/* ── 선생님 안내문 — 짧은 안내는 상시 전문, 긴 안내는 1줄 접힘+토글 ── */}
      {instructions ? (
        <div
          className="shrink-0"
          style={{ background: "var(--gd-blue-soft)", borderBottom: "1px solid var(--gd-blue-line)" }}
        >
          <div className="gd-page px-4 py-2">
            {instructionsCollapsible ? (
              <button
                type="button"
                onClick={() => setInstructionsOpen((v) => !v)}
                aria-expanded={instructionsOpen}
                className="flex w-full items-start gap-1.5 text-left"
              >
                <p
                  className={
                    instructionsOpen
                      ? "gd-t-xs min-w-0 flex-1 whitespace-pre-line"
                      : "gd-t-xs line-clamp-1 min-w-0 flex-1"
                  }
                  style={{ color: "var(--gd-ink-2)" }}
                >
                  <span className="mr-1 font-semibold" style={{ color: "var(--gd-blue)" }}>
                    선생님 안내
                  </span>
                  {instructions}
                </p>
                <ChevronDown
                  className={
                    instructionsOpen ? "gd-chev h-4 w-4 shrink-0 rotate-180" : "gd-chev h-4 w-4 shrink-0"
                  }
                  strokeWidth={1.75}
                  style={{ color: "var(--gd-ink-3)" }}
                  aria-hidden
                />
              </button>
            ) : (
              <p className="gd-t-xs whitespace-pre-line" style={{ color: "var(--gd-ink-2)" }}>
                <span className="mr-1 font-semibold" style={{ color: "var(--gd-blue)" }}>
                  선생님 안내
                </span>
                {instructions}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <main className="gd-page gd-safe-b flex flex-1 flex-col gap-3 px-4 py-4">
        {/* ── 진행 히어로 ── */}
        <section className="gd-card px-4 py-4">
          {effectiveDone ? (
            <div className="mb-3 flex items-center gap-1.5" style={{ color: "var(--gd-good)" }}>
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="gd-t-sm font-bold">확인 완료</span>
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="gd-label">진행 상황</p>
              <p className="gd-t-lg mt-1 font-bold">
                <span className="gd-mono">
                  {doneCount}/{stageTotal}
                </span>{" "}
                단계 완료
              </p>
            </div>
            {masteryPct !== null ? (
              <div className="shrink-0 text-right">
                <p className="gd-label">숙달도</p>
                <p className="gd-mono gd-t-2xl mt-1 font-bold leading-none">
                  {masteryPct}
                  <span className="gd-t-md">%</span>
                </p>
              </div>
            ) : null}
          </div>

          <div className="gd-meter mt-3" data-tone={allDone ? "good" : undefined}>
            <span style={{ width: `${progressPct}%` }} />
          </div>

          {allDone ? (
            <Link href={`/g/w/${taskId}/report`} className="gd-btn gd-btn-primary mt-4 w-full">
              <BarChart3 className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
              결과 리포트 보기
            </Link>
          ) : firstIncomplete ? (
            <Link
              href={`/g/w/${taskId}/study/${firstIncomplete.id}`}
              className="gd-btn gd-btn-primary mt-4 w-full"
            >
              <Play className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
              {started ? "이어서 학습하기" : "학습 시작하기"}
            </Link>
          ) : null}
        </section>

        {/* ── 스테이지 리스트 (자유 진입 — 순차 잠금 없음) ── */}
        <section aria-label="학습 단계">
          <p className="gd-label mb-2">학습 단계</p>
          <div className="flex flex-col gap-2">
            {stages.map((s, i) => (
              <Link key={s.id} href={`/g/w/${taskId}/study/${s.id}`} className="block">
                <div className="gd-card flex items-center gap-3 px-4 py-3.5">
                  <span
                    className="gd-t-xs inline-flex shrink-0 items-center justify-center rounded-full font-bold"
                    style={{
                      width: "1.75rem",
                      height: "1.75rem",
                      background:
                        s.status === "done" ? "var(--gd-good-soft)" : "var(--gd-blue-soft)",
                      color: s.status === "done" ? "var(--gd-good)" : "var(--gd-blue)",
                    }}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="gd-t-md font-bold leading-snug">{s.title}</p>
                    <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
                      {s.subtitle}
                    </p>
                    <p className="gd-t-2xs gd-mono mt-1" style={{ color: "var(--gd-ink-3)" }}>
                      {s.itemCount}문항 · {s.estMin}분
                    </p>
                  </div>
                  {s.status === "done" ? (
                    s.graded && typeof s.score === "number" ? (
                      <span
                        className="gd-t-xs gd-mono shrink-0 rounded-md px-2 py-1 font-bold"
                        style={{ background: "var(--gd-good-soft)", color: "var(--gd-good)" }}
                      >
                        {s.score}점
                      </span>
                    ) : (
                      <CheckCircle2
                        className="h-5 w-5 shrink-0"
                        strokeWidth={2}
                        style={{ color: "var(--gd-good)" }}
                        aria-label="완료"
                      />
                    )
                  ) : s.status === "in-progress" ? (
                    <span
                      className="gd-t-2xs shrink-0 rounded-md px-1.5 py-0.5 font-semibold"
                      style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
                    >
                      진행 중
                    </span>
                  ) : (
                    <ChevronRight
                      className="h-4 w-4 shrink-0"
                      style={{ color: "var(--gd-ink-3)" }}
                      aria-hidden
                    />
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 하단 유틸 — 원본 뷰어 · 결과 리포트(완료 1개부터 활성) ── */}
        <div className="flex gap-2">
          <Link href={`/g/w/${taskId}/doc`} className="gd-btn gd-btn-ghost flex-1">
            <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            원본 학습지 보기
          </Link>
          {doneCount >= 1 ? (
            <Link href={`/g/w/${taskId}/report`} className="gd-btn gd-btn-ghost flex-1">
              <BarChart3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              결과 리포트
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="gd-btn gd-btn-ghost flex-1"
              style={{ opacity: 0.45, pointerEvents: "none" }}
            >
              <BarChart3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              결과 리포트
            </span>
          )}
        </div>

        {/* ── 완료 규칙 안내 · legacy 완료 ── */}
        {requiredMode && !taskDone ? (
          <p className="gd-t-xs text-center" style={{ color: "var(--gd-ink-2)" }}>
            필수 단계를 모두 완료하면 과제가 자동으로 완료됩니다
          </p>
        ) : null}

        {legacyCompleteAllowed && !taskDone ? (
          <section aria-label="과제 완료">
            {completeError ? (
              <p className="gd-t-xs mb-2 text-center" style={{ color: "var(--gd-bad)" }}>
                {completeError}
              </p>
            ) : null}
            {legacyDone ? (
              <div
                className="gd-t-sm flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-xl font-semibold"
                style={{
                  background: "var(--gd-good-soft)",
                  border: "1px solid #a7f3d0",
                  color: "var(--gd-good)",
                }}
              >
                <CheckCircle2 className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                확인 완료
              </div>
            ) : (
              <button
                type="button"
                onClick={complete}
                disabled={completing}
                className="gd-btn gd-btn-primary w-full"
              >
                {completing ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2} aria-hidden />
                ) : (
                  <Check className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                )}
                {completing ? "처리 중…" : "다 확인했습니다"}
              </button>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
