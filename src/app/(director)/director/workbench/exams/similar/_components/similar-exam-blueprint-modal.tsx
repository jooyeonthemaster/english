"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

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
  jobId: string;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-6 py-5 first:border-t-0">
      <h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 font-medium text-slate-800">{value}</span>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

function compactTypeSettings(ts: unknown): string {
  if (!ts || typeof ts !== "object") return "";
  const entries = Object.entries(ts as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined,
  );
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(", ");
}

export function SimilarExamBlueprintModal({
  jobId,
  onClose,
}: SimilarExamBlueprintModalProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const bp = job?.blueprint ?? null;
  const result = (job?.result ?? {}) as {
    questionCount?: number;
    patternQuestionCount?: number;
    callSummary?: {
      analysis?: Record<string, unknown>;
      generation?: Record<string, unknown>;
      llmCallsTotal?: number;
      llmAttemptsTotal?: number;
    };
    debugTiming?: Record<string, number>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-950">생성 근거 · 분석 데이터</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {job?.originalFileName || job?.title || "동형 모의고사"}
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
              <Section title="원본 시험지 분석">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Field label="제목" value={bp.sourceExam.title} />
                  <Field label="과목" value={bp.sourceExam.subject} />
                  <Field label="총 문항" value={`${bp.sourceExam.totalQuestionCount}문항`} />
                  <Field label="시험 시간" value={bp.sourceExam.durationMinutes ? `${bp.sourceExam.durationMinutes}분` : null} />
                  <Field label="총점" value={bp.sourceExam.totalPoints ? `${bp.sourceExam.totalPoints}점` : null} />
                </div>
                {bp.sourceExam.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{bp.sourceExam.summary}</p>
                )}
              </Section>

              <Section title="출처 정보">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Field label="학교/기관" value={bp.sourceMeta.schoolName} />
                  <Field label="연도" value={bp.sourceMeta.year} />
                  <Field label="학기" value={bp.sourceMeta.semester} />
                  <Field label="출판사" value={bp.sourceMeta.publisher} />
                  <Field label="시험 종류" value={bp.sourceMeta.examCategory} />
                  <Field label="신뢰도" value={bp.sourceMeta.confidence} />
                </div>
                {bp.sourceMeta.uncertaintyNotes.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-700">
                    {bp.sourceMeta.uncertaintyNotes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="출제 분포">
                <div className="space-y-2">
                  <div>
                    <span className="mr-2 text-xs text-slate-400">유형</span>
                    <span className="inline-flex flex-wrap gap-1">
                      {bp.distribution.byType.map((d) => (
                        <Chip key={d.type}>{d.type} ×{d.count}</Chip>
                      ))}
                    </span>
                  </div>
                  <div>
                    <span className="mr-2 text-xs text-slate-400">난이도</span>
                    <span className="inline-flex flex-wrap gap-1">
                      <Chip>기본 {bp.distribution.byDifficulty.BASIC}</Chip>
                      <Chip>중급 {bp.distribution.byDifficulty.INTERMEDIATE}</Chip>
                      <Chip>킬러 {bp.distribution.byDifficulty.KILLER}</Chip>
                    </span>
                  </div>
                  <div>
                    <span className="mr-2 text-xs text-slate-400">배점</span>
                    <span className="inline-flex flex-wrap gap-1">
                      {bp.distribution.byPoints.map((d) => (
                        <Chip key={d.points}>{d.points}점 ×{d.count}</Chip>
                      ))}
                    </span>
                  </div>
                  <div>
                    <span className="mr-2 text-xs text-slate-400">자극 유형</span>
                    <span className="inline-flex flex-wrap gap-1">
                      {bp.distribution.byStimulusType.map((d) => (
                        <Chip key={d.type}>{d.type} ×{d.count}</Chip>
                      ))}
                    </span>
                  </div>
                  {bp.distribution.skillCoverage.length > 0 && (
                    <div>
                      <span className="mr-2 text-xs text-slate-400">평가 영역</span>
                      <span className="inline-flex flex-wrap gap-1">
                        {bp.distribution.skillCoverage.map((s, i) => (
                          <Chip key={i}>{s}</Chip>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              </Section>

              <Section title="레이아웃 / 시험지 형식">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Field label="용지" value={bp.paperLayout.paperSize} />
                  <Field label="단 수" value={`${bp.paperLayout.columns}단`} />
                  <Field label="밀도" value={bp.paperLayout.density} />
                  <Field label="번호 표기" value={bp.paperLayout.numberingStyle} />
                  <Field label="배점 표기" value={bp.paperLayout.pointAnnotationStyle} />
                  <Field label="선택지 마커" value={bp.paperLayout.choiceMarkerStyle} />
                  <Field label="지문 박스" value={bp.paperLayout.passageBoxed ? "사용" : "미사용"} />
                  <Field label="시험 제목" value={bp.paperLayout.header.examTitle} />
                  <Field label="학교명" value={bp.paperLayout.header.schoolName} />
                  <Field label="학년" value={bp.paperLayout.header.grade} />
                  <Field label="시험 종류" value={bp.paperLayout.header.examCategory} />
                  <Field label="시행일" value={bp.paperLayout.header.examDate} />
                </div>
                {bp.paperLayout.header.notices.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-slate-400">유의사항</span>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                      {bp.paperLayout.header.notices.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bp.paperLayout.globalDirections.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-slate-400">공통 지시문</span>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                      {bp.paperLayout.globalDirections.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bp.paperLayout.visualLayoutNotes && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {bp.paperLayout.visualLayoutNotes}
                  </p>
                )}
              </Section>

              {bp.sections.length > 0 && (
                <Section title="섹션 구성">
                  <ul className="space-y-1.5 text-sm">
                    {bp.sections.map((s) => (
                      <li key={s.id} className="text-slate-700">
                        <span className="font-semibold">{s.label}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          문항 {s.questionNumbers.join(", ")}
                        </span>
                        {s.instructionStyle && (
                          <span className="ml-2 text-xs text-slate-500">· {s.instructionStyle}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {bp.stimulusGroups.length > 0 && (
                <Section title="자극(지문) 그룹">
                  <ul className="space-y-2 text-sm">
                    {bp.stimulusGroups.map((g) => (
                      <li key={g.id} className="rounded-md bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip>{g.type}</Chip>
                          <span className="text-xs text-slate-400">
                            문항 {g.questionNumbers.join(", ")}
                          </span>
                        </div>
                        {g.sourceSummary && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">{g.sourceSummary}</p>
                        )}
                        {g.reuseWithSelectedPassageStrategy && (
                          <p className="mt-1 text-xs leading-relaxed text-blue-700">
                            재사용 전략: {g.reuseWithSelectedPassageStrategy}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title={`문항 슬롯 (${bp.questionSlots.length})`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        <th className="py-1.5 pr-2">#</th>
                        <th className="py-1.5 pr-2">생성 유형</th>
                        <th className="py-1.5 pr-2">원 자극</th>
                        <th className="py-1.5 pr-2">난이도</th>
                        <th className="py-1.5 pr-2">배점</th>
                        <th className="py-1.5 pr-2">보기</th>
                        <th className="py-1.5 pr-2">생성</th>
                        <th className="py-1.5 pr-2">설정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bp.questionSlots.map((slot) => (
                        <tr key={slot.number} className="border-b border-slate-50 text-slate-700">
                          <td className="py-1.5 pr-2 font-semibold">{slot.number}</td>
                          <td className="py-1.5 pr-2">{slot.generationSubType}</td>
                          <td className="py-1.5 pr-2 text-slate-400">{slot.stimulusType}</td>
                          <td className="py-1.5 pr-2">{slot.difficulty}</td>
                          <td className="py-1.5 pr-2">{slot.points}</td>
                          <td className="py-1.5 pr-2">{slot.choiceCount}</td>
                          <td className="py-1.5 pr-2">
                            {slot.canGenerateFromSelectedPassage ? (
                              <span className="text-emerald-600">생성</span>
                            ) : (
                              <span className="text-slate-300">제외</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-slate-400">
                            {compactTypeSettings(slot.typeSettings)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="생성 계획">
                <div className="flex flex-wrap gap-1">
                  {bp.generationPlan.preserveQuestionOrder && <Chip>문항 순서 유지</Chip>}
                  {bp.generationPlan.preserveSectionOrder && <Chip>섹션 순서 유지</Chip>}
                  {bp.generationPlan.preserveStimulusGrouping && <Chip>지문 묶음 유지</Chip>}
                </div>
                {bp.generationPlan.passageAssignmentStrategy && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    지문 배정: {bp.generationPlan.passageAssignmentStrategy}
                  </p>
                )}
                {bp.generationPlan.fallbackRules.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
                    {bp.generationPlan.fallbackRules.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </Section>

              {bp.extractedInsights.length > 0 && (
                <Section title="핵심 인사이트">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {bp.extractedInsights.map((insight, i) => (
                      <li key={i}>{insight}</li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="생성 결과">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Field label="생성 문항" value={result.questionCount != null ? `${result.questionCount}문항` : null} />
                  <Field label="패턴 문항" value={result.patternQuestionCount != null ? `${result.patternQuestionCount}문항` : null} />
                  <Field label="LLM 호출" value={result.callSummary?.llmCallsTotal != null ? `${result.callSummary.llmCallsTotal}회` : null} />
                  <Field
                    label="총 소요"
                    value={
                      result.debugTiming?.totalRunMs != null
                        ? `${Math.round(result.debugTiming.totalRunMs / 1000)}초`
                        : null
                    }
                  />
                </div>
                {result.callSummary?.generation && (
                  <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                    {JSON.stringify(result.callSummary.generation, null, 2)}
                  </pre>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
