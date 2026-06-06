"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileSearch,
  Loader2,
  RefreshCcw,
} from "lucide-react";

import { QUESTION_TYPE_META } from "@/lib/question-schemas";
import { cn } from "@/lib/utils";

import {
  SimilarQuestionAnalysisModal,
  type QAnalysis,
} from "./similar-question-analysis-modal";

export interface SimilarQuestionItem {
  id: string;
  subType: string | null;
  questionText: string;
  options: Array<{ label: string; text: string }>;
  correctAnswer: string;
  difficulty: string;
  points: number;
  createdAt: string;
  passageTitle: string | null;
  explanation: string | null;
  analysis: QAnalysis | null;
}

type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface JobSkipSummary {
  analysis?: {
    inventoryCount?: number;
    detailedCountBeforeFilter?: number;
    detailedCountAfterFilter?: number;
    incompleteRemovedCount?: number;
    missingInventoryCount?: number;
    recoveredMissingCount?: number;
    cropMismatchCount?: number;
    followUpFallbackCount?: number;
    warnings?: string[];
  };
  generation?: {
    skippedCount?: number;
    skippedByReason?: Array<{ count?: number; sample?: string }>;
  };
}

interface SimilarQuestionJob {
  id: string;
  status: JobStatus;
  referenceCount: number;
  passageCount: number;
  totalCount: number;
  savedCount: number;
  skippedCount: number;
  skipSummary: JobSkipSummary | null;
  errorMessage: string | null;
  gradeInfo: string | null;
  createdAt: string;
  completedAt: string | null;
}

const COLLAPSED_STORAGE_KEY = "smoat.similarQuestion.jobsBandCollapsed.v1";
const POLL_INTERVAL_MS = 3000;

function typeLabel(subType: string | null): string {
  if (!subType) return "문항";
  if (subType === "CUSTOM") return "신규 유형";
  return QUESTION_TYPE_META[subType]?.label ?? subType;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function isActive(status: JobStatus): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function summarizeErrorMessage(message: string | null): string {
  if (!message?.trim()) return "생성에 실패했습니다.";

  const compact = message.replace(/\s+/g, " ").trim();
  const followUp = compact.match(/Single-question follow-up analysis failed for question ([^:]+):/);
  const finishReason = compact.match(/finishReason=([^|\s]+)/);

  if (followUp) {
    return [
      `문항별 분석 실패 (${followUp[1]})`,
      "AI 응답 형식 오류",
      finishReason ? `finishReason=${finishReason[1]}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (compact.includes("No object generated")) {
    return "AI 응답을 구조화하지 못했습니다.";
  }

  const withoutRaw = compact
    .replace(/\|\s*rawHead=.*$/i, "")
    .replace(/\|\s*cause=JSON parsing failed: Text:.*$/i, " · JSON parsing failed")
    .replace(/Text:\s*\{.*$/i, "Text: JSON parsing failed");

  return truncateText(withoutRaw, 160);
}

function generationSkippedCount(job: SimilarQuestionJob): number {
  return job.skipSummary?.generation?.skippedCount ?? job.skippedCount;
}

function summarizeJobDiagnostics(job: SimilarQuestionJob): string | null {
  const analysis = job.skipSummary?.analysis;
  if (!analysis) return null;

  const parts: string[] = [];
  if ((analysis.incompleteRemovedCount ?? 0) > 0) {
    parts.push(`분석 제외 ${analysis.incompleteRemovedCount}개`);
  }
  if ((analysis.recoveredMissingCount ?? 0) > 0) {
    parts.push(`누락 회수 ${analysis.recoveredMissingCount}/${analysis.missingInventoryCount ?? analysis.recoveredMissingCount}`);
  } else if ((analysis.missingInventoryCount ?? 0) > 0) {
    parts.push(`누락 후보 ${analysis.missingInventoryCount}개`);
  }
  if ((analysis.cropMismatchCount ?? 0) > 0) {
    parts.push(`crop 경고 ${analysis.cropMismatchCount}개`);
  }
  if ((analysis.followUpFallbackCount ?? 0) > 0) {
    parts.push(`원분석 사용 ${analysis.followUpFallbackCount}개`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function summarizeGenerationSkips(job: SimilarQuestionJob): string | null {
  const skipped = generationSkippedCount(job);
  if (skipped <= 0) return null;
  const reason = job.skipSummary?.generation?.skippedByReason?.[0]?.sample;
  return reason ? `생성 실패 ${skipped}개 · ${truncateText(reason, 80)}` : `생성 실패 ${skipped}개`;
}

function JobCard({ job }: { job: SimilarQuestionJob }) {
  const done = job.savedCount + job.skippedCount;
  const percent =
    job.totalCount > 0 ? Math.min(100, Math.round((done / job.totalCount) * 100)) : 0;
  const errorSummary = summarizeErrorMessage(job.errorMessage);
  const genSkipped = generationSkippedCount(job);
  const diagnostics = summarizeJobDiagnostics(job);
  const generationSkipSummary = summarizeGenerationSkips(job);

  const tone =
    job.status === "FAILED"
      ? "border-rose-200 bg-rose-50/60"
      : job.status === "COMPLETED"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-blue-200 bg-blue-50/50";

  return (
    <div className={cn("flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border p-3", tone)}>
      <div className="flex min-w-0 items-center gap-1.5">
        {job.status === "PENDING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
            <Clock className="size-3" />
            대기 중
          </span>
        ) : job.status === "PROCESSING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700">
            <Loader2 className="size-3 animate-spin" />
            생성 중
          </span>
        ) : job.status === "COMPLETED" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
            <CheckCircle2 className="size-3" />
            완료
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
            <AlertCircle className="size-3" />
            실패
          </span>
        )}
        {job.gradeInfo ? (
          <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500">
            {job.gradeInfo}
          </span>
        ) : null}
        <span className="ml-auto text-[10.5px] text-slate-400 tabular-nums">
          {formatTime(job.createdAt)}
        </span>
      </div>

      {job.status === "PROCESSING" ? (
        job.totalCount > 0 ? (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-[11px] font-medium text-blue-600 tabular-nums">
              {done}/{job.totalCount} 처리 · 저장 {job.savedCount}
              {genSkipped > 0 ? ` · 생성 실패 ${genSkipped}` : ""}
            </p>
          </div>
        ) : (
          // 분석(LLM) 단계 — totalCount 가 아직 0이라 결정형 막대 대신 인디터미닛 표시.
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600">
            <Loader2 className="size-3 animate-spin" />
            원본 문항 분석 중…
          </p>
        )
      ) : job.status === "PENDING" ? (
        <p className="text-[11px] text-slate-500">
          문항 분석 후 지문 {job.passageCount}개에 동형 생성을 시작합니다.
        </p>
      ) : job.status === "COMPLETED" ? (
        <p className="text-[11px] font-medium text-emerald-700 tabular-nums">
          {job.savedCount}개 생성
          {genSkipped > 0 ? ` · 생성 실패 ${genSkipped}개` : ""}
          {diagnostics ? (
            <span
              className="mt-1 block min-w-0 overflow-hidden break-words font-normal text-slate-500 line-clamp-2"
              title={diagnostics}
            >
              {diagnostics}
            </span>
          ) : null}
          {generationSkipSummary ? (
            <span
              className="mt-1 block min-w-0 overflow-hidden break-words font-normal text-amber-700 line-clamp-2"
              title={generationSkipSummary}
            >
              {generationSkipSummary}
            </span>
          ) : null}
          {job.savedCount === 0 && job.errorMessage ? (
            <span
              className="mt-1 block min-w-0 overflow-hidden break-words font-normal text-slate-500 line-clamp-2"
              title={job.errorMessage}
            >
              {summarizeErrorMessage(job.errorMessage)}
            </span>
          ) : null}
        </p>
      ) : (
        <p
          className="min-w-0 overflow-hidden break-words text-[11px] leading-relaxed text-rose-600 line-clamp-3"
          title={job.errorMessage ?? undefined}
        >
          {errorSummary}
        </p>
      )}
    </div>
  );
}

export function SimilarQuestionJobsPanel({
  refreshKey,
  running,
}: {
  refreshKey: number;
  running: boolean;
}) {
  const [items, setItems] = useState<SimilarQuestionItem[]>([]);
  const [jobs, setJobs] = useState<SimilarQuestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analysisModal, setAnalysisModal] = useState<QAnalysis | null>(null);
  // load() 인-플라이트 가드 — 느린 옛 응답이 새 응답을 덮어쓰는 깜빡임 방지.
  const loadSeq = useRef(0);
  // active(true)→비active(false) 전이 감지용 — 완료 직후 1회 추가 로드(리드 스큐 보정).
  const wasActiveRef = useRef(false);

  useEffect(() => {
    setCollapsed(
      typeof window !== "undefined" &&
        window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true",
    );
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // 무시
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [jobsRes, qRes] = await Promise.all([
        fetch("/api/similar-exams/question-generation-jobs?limit=12", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/similar-exams/question-generations?limit=30", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const jobsData = jobsRes.ok
        ? ((await jobsRes.json()) as { jobs: SimilarQuestionJob[] })
        : null;
      const qData = qRes.ok
        ? ((await qRes.json()) as { questions: SimilarQuestionItem[] })
        : null;
      // 더 새로운 load 가 시작됐으면 이 응답은 버린다(stale overwrite 방지).
      if (seq !== loadSeq.current) return;
      if (jobsData) setJobs(jobsData.jobs ?? []);
      if (qData) setItems(qData.questions ?? []);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  const hasActiveJobs = useMemo(() => jobs.some((j) => isActive(j.status)), [jobs]);

  // 진행 중 작업이 있으면 폴링. 모두 끝나면 멈춤.
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveJobs, load]);

  // active→비active 전이(막 모든 잡 완료): 폴링이 멈춘 뒤라 마지막 폴링이 리드 스큐로
  // 직전 커밋된 문항을 놓쳤을 수 있어, 1회 추가 로드로 보정한다.
  useEffect(() => {
    const justFinished = wasActiveRef.current && !hasActiveJobs;
    wasActiveRef.current = hasActiveJobs;
    if (!justFinished) return;
    const timer = setTimeout(() => void load(), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [hasActiveJobs, load]);

  const showSpinner = hasActiveJobs || running;
  const visibleJobs = jobs;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden border-t border-slate-200 bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <FileSearch className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[13px] font-black text-slate-900">동형 문제 생성 작업</h2>
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            · 문항 {items.length}건
          </span>
          {showSpinner ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
              <Loader2 className="size-3 animate-spin" />
              진행 중
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCcw className="size-3.5" />
            새로고침
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? "목록 펼치기" : "목록 접기"}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-blue-500 transition-colors hover:text-blue-700"
          >
            {collapsed ? (
              <>
                <ChevronUp className="size-3.5" />
                펼치기
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                접기
              </>
            )}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="space-y-4 p-4">
          {/* ─── 작업 큐(대기/진행/완료/실패) ─── */}
          {visibleJobs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                작업 큐
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          ) : null}

          {/* ─── 생성한 동형 문항 ─── */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              생성한 동형 문항
            </p>
            {loading && items.length === 0 && !showSpinner ? (
              <div className="flex items-center gap-2 px-1 py-8 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                목록을 불러오는 중
              </div>
            ) : items.length === 0 ? (
              <div className="px-1 py-8 text-sm text-slate-500">
                {showSpinner
                  ? "생성이 끝나면 여기에 문항이 추가됩니다."
                  : "아직 생성한 동형 문항이 없습니다. 문항을 올리고 지문을 골라 큐에 추가해 보세요."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => {
                  const expanded = expandedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex flex-col gap-2 rounded-xl border bg-white p-3 transition-colors",
                        expanded
                          ? "border-blue-300 shadow-sm md:col-span-2 lg:col-span-3 xl:col-span-4"
                          : "border-slate-200 hover:border-blue-200",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        className="flex flex-col items-start gap-1 text-left"
                      >
                        <div className="flex w-full items-center gap-1.5">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
                            {typeLabel(item.subType)}
                          </span>
                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-600">
                            완료
                          </span>
                          <span className="ml-auto text-[10.5px] text-slate-400 tabular-nums">
                            {formatTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[12px] leading-snug text-slate-800">
                          {item.questionText.split("\n").find((l) => l.trim()) ??
                            item.questionText}
                        </p>
                        {item.passageTitle ? (
                          <span className="text-[10.5px] text-slate-400">
                            지문: {item.passageTitle}
                          </span>
                        ) : null}
                      </button>

                      {item.analysis ? (
                        <button
                          type="button"
                          onClick={() => setAnalysisModal(item.analysis)}
                          className="self-start text-[11px] font-semibold text-blue-500 hover:text-blue-700"
                        >
                          분석 정보
                        </button>
                      ) : null}

                      {expanded ? (
                        <div className="mt-1 space-y-2 border-t border-slate-100 pt-2 text-[12px]">
                          <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-800">
                            {item.questionText}
                          </pre>
                          {item.options.length > 0 ? (
                            <ol className="space-y-0.5">
                              {item.options.map((o, i) => (
                                <li
                                  key={i}
                                  className={cn(
                                    "rounded px-1.5 py-0.5",
                                    String(o.label) === String(item.correctAnswer)
                                      ? "bg-emerald-50 font-semibold text-emerald-700"
                                      : "text-slate-700",
                                  )}
                                >
                                  {o.label}. {o.text}
                                </li>
                              ))}
                            </ol>
                          ) : null}
                          <p className="text-[11px]">
                            <span className="font-bold text-slate-700">정답: </span>
                            <span className="text-blue-700">{item.correctAnswer}</span>
                          </p>
                          {item.explanation ? (
                            <div className="rounded-md bg-amber-50/60 p-2 text-[11px] leading-relaxed text-slate-700">
                              <span className="font-bold">해설: </span>
                              {item.explanation}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {analysisModal ? (
        <SimilarQuestionAnalysisModal
          analysis={analysisModal}
          onClose={() => setAnalysisModal(null)}
        />
      ) : null}
    </section>
  );
}
