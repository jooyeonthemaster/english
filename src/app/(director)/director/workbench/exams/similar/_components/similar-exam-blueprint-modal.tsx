"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

import {
  DIFFICULTY_META,
  SUBTYPE_LABELS,
} from "@/components/exams/paper-builder/constants";
import type { ExamPatternProfile } from "@/lib/similar-exam-generation/schemas";

interface JobDetail {
  id: string;
  title: string;
  originalFileName: string | null;
  totalPages: number;
  blueprint: ExamPatternProfile | null;
  result: Record<string, unknown> | null;
}

interface SimilarExamBlueprintModalProps {
  onClose: () => void;
  /** 작업(job) 기반: 동형 생성 페이지 하단 카드에서 사용. 지정 시 서버에서 fetch. */
  jobId?: string;
  /**
   * 직접(blueprint) 기반: 시험지 관리에서 이미 보유한 exam.settings 의 patternProfile 을
   * 그대로 넘겨 fetch 없이 표시. (jobId 없이 사용)
   */
  blueprint?: ExamPatternProfile | null;
  generatedCount?: number | null;
  title?: string | null;
}

function readNumber(source: Record<string, unknown> | null, key: string): number | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span className="text-[13px] font-bold text-slate-900">{value}</span>
    </span>
  );
}

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-6 py-5 first:border-t-0">
      <h3 className="mb-3 text-[13px] font-bold text-slate-900">
        {title}
        {sub ? <span className="ml-1.5 font-medium text-slate-400">· {sub}</span> : null}
      </h3>
      {children}
    </section>
  );
}

export function SimilarExamBlueprintModal({
  jobId,
  blueprint: blueprintProp = null,
  generatedCount: generatedCountProp = null,
  title: titleProp = null,
  onClose,
}: SimilarExamBlueprintModalProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/similar-exams/jobs/${jobId}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("작업 정보를 불러오지 못했습니다.");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setJob(data.job ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const bp = jobId ? job?.blueprint ?? null : blueprintProp;
  const result = job?.result ?? null;

  // 유형 분포 — 한글 라벨 + 많은 순 정렬.
  const typeRows = useMemo(() => {
    if (!bp) return [];
    return [...bp.distribution.byType]
      .map((row) => ({
        type: row.type,
        count: row.count,
        label: SUBTYPE_LABELS[row.type] ?? row.type,
      }))
      .sort((a, b) => b.count - a.count);
  }, [bp]);
  const maxTypeCount = typeRows.reduce((max, row) => Math.max(max, row.count), 0);

  const generatedCount = jobId
    ? readNumber(result, "questionCount")
    : generatedCountProp;
  const patternCount =
    (jobId ? readNumber(result, "patternQuestionCount") : null) ??
    bp?.sourceExam.totalQuestionCount ??
    null;
  const excludedCount =
    patternCount != null && generatedCount != null
      ? Math.max(0, patternCount - generatedCount)
      : 0;

  const sourceMetaLine = bp
    ? [
        bp.sourceExam.subject,
        bp.paperLayout.header.grade,
        bp.sourceMeta.examCategory,
        [bp.sourceMeta.schoolName, bp.sourceMeta.year]
          .filter(Boolean)
          .join(" · "),
      ]
        .filter((part) => part && String(part).trim())
        .join("  ·  ")
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-950">분석 정보</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {job?.originalFileName || job?.title || titleProp || "동형 시험지"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              불러오는 중
            </div>
          ) : error ? (
            <div className="px-6 py-20 text-center text-sm text-red-600">{error}</div>
          ) : !bp ? (
            <div className="px-6 py-20 text-center text-sm text-slate-500">
              분석 데이터가 아직 없습니다.
            </div>
          ) : (
            <>
              {/* 1. 원본 시험지 */}
              <Block title="원본 시험지">
                <p className="text-[15px] font-bold leading-snug text-slate-900">
                  {bp.sourceExam.title}
                </p>
                {sourceMetaLine ? (
                  <p className="mt-1 text-[12px] text-slate-500">{sourceMetaLine}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatPill
                    label="총 문항"
                    value={`${bp.sourceExam.totalQuestionCount}문항`}
                  />
                  {bp.sourceExam.durationMinutes ? (
                    <StatPill
                      label="시험 시간"
                      value={`${bp.sourceExam.durationMinutes}분`}
                    />
                  ) : null}
                  {bp.sourceExam.totalPoints ? (
                    <StatPill label="총점" value={`${bp.sourceExam.totalPoints}점`} />
                  ) : null}
                </div>
              </Block>

              {/* 2. 생성 결과 */}
              <Block title="생성 결과">
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3.5">
                  <div className="flex items-end gap-2">
                    <span className="text-[30px] font-black leading-none text-blue-700">
                      {generatedCount ?? "-"}
                    </span>
                    <span className="pb-0.5 text-[13px] font-bold text-slate-600">
                      문항 생성
                    </span>
                    {patternCount != null ? (
                      <span className="pb-1 text-[12px] font-medium text-slate-400">
                        / 원본 패턴 {patternCount}문항
                      </span>
                    ) : null}
                  </div>
                  {excludedCount > 0 ? (
                    <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                      듣기·이미지 등 자동 생성이 어려운{" "}
                      <b className="font-bold text-slate-700">{excludedCount}문항</b>은
                      제외되었습니다.
                    </p>
                  ) : null}
                </div>
              </Block>

              {/* 3. 출제 구성 (원본 패턴) */}
              <Block title="출제 구성" sub="원본 패턴 기준">
                {typeRows.length > 0 ? (
                  <div className="space-y-1.5">
                    {typeRows.map((row) => (
                      <div key={row.type} className="flex items-center gap-2.5">
                        <span className="w-24 shrink-0 truncate text-[12px] font-medium text-slate-700">
                          {row.label}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{
                              width: `${maxTypeCount > 0 ? (row.count / maxTypeCount) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="w-7 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-900">
                          {row.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-400">난이도</span>
                    {(["BASIC", "INTERMEDIATE", "KILLER"] as const).map((key) => (
                      <span
                        key={key}
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_META[key].className}`}
                      >
                        {DIFFICULTY_META[key].label} {bp.distribution.byDifficulty[key]}
                      </span>
                    ))}
                  </div>
                  {bp.distribution.byPoints.length > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-400">배점</span>
                      {bp.distribution.byPoints.map((row) => (
                        <span
                          key={row.points}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                        >
                          {row.points}점 ×{row.count}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Block>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
