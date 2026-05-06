"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ListChecks,
  SearchCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { M2PassageDraftSnapshot, M2QuestionDraftSnapshot } from "../types";

interface M2DraftPanelProps {
  drafts: M2PassageDraftSnapshot[];
}

type TextMode = "restored" | "problem";

export function M2DraftPanel({ drafts }: M2DraftPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    drafts[0]?.id ?? null,
  );
  const [textMode, setTextMode] = useState<TextMode>("restored");

  const selected = useMemo(
    () => drafts.find((draft) => draft.id === selectedId) ?? drafts[0] ?? null,
    [drafts, selectedId],
  );

  if (drafts.length === 0) return null;

  const totalQuestions = drafts.reduce(
    (sum, draft) => sum + draft.questions.length,
    0,
  );
  const needsReview = drafts.filter(
    (draft) =>
      draft.reviewStatus !== "CONFIRMED" ||
      draft.verificationStatus !== "PASS" ||
      draft.restorationStatus !== "RESTORED",
  ).length;

  return (
    <section className="border-b border-slate-200 bg-slate-50/80 px-6 py-3">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-sky-100 text-sky-700">
            <FileText className="size-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-slate-800">
              M2 지문 복원 Draft
            </h2>
            <p className="truncate text-[11px] text-slate-500">
              문제 세트에서 추출한 지문, 복원 근거, 연결 문제를 확인합니다.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px]">
          <Metric label="지문" value={drafts.length} />
          <Metric label="문제" value={totalQuestions} />
          <Metric label="검토 필요" value={needsReview} tone="warn" />
          <Link
            href="/director/questions/pending"
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-sky-700 hover:bg-sky-50"
          >
            문제 등록으로 이동
          </Link>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_340px] gap-3">
        <div className="min-h-0 rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
            복원 후보
          </div>
          <div className="max-h-52 overflow-auto p-2">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => setSelectedId(draft.id)}
                className={cn(
                  "mb-1 w-full rounded-md border px-3 py-2 text-left transition-colors last:mb-0",
                  selected?.id === draft.id
                    ? "border-sky-200 bg-sky-50"
                    : "border-transparent hover:bg-slate-50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-slate-800">
                    지문 {draft.passageOrder + 1}
                  </span>
                  <StatusPill
                    status={draft.verificationStatus}
                    okLabel="검증 통과"
                  />
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                  {draft.teacherText || draft.restoredText || draft.problemText}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>
                    p.{draft.sourcePageIndex.map((p) => p + 1).join(", ")}
                  </span>
                  <span>문제 {draft.questions.length}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <PassagePreview
            draft={selected}
            textMode={textMode}
            setTextMode={setTextMode}
          />
        ) : null}

        {selected ? <EvidencePanel draft={selected} /> : null}
      </div>
    </section>
  );
}

function PassagePreview({
  draft,
  textMode,
  setTextMode,
}: {
  draft: M2PassageDraftSnapshot;
  textMode: TextMode;
  setTextMode: (mode: TextMode) => void;
}) {
  const sentences =
    textMode === "restored"
      ? draft.sentences.map((sentence) => ({
          order: sentence.order,
          text: sentence.restoredText,
          status: sentence.status,
        }))
      : draft.sentences.map((sentence) => ({
          order: sentence.order,
          text: sentence.problemText ?? "",
          status: sentence.status,
        }));

  const fallbackText =
    textMode === "restored"
      ? draft.teacherText || draft.restoredText || ""
      : draft.problemText;

  return (
    <div className="min-h-0 rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-slate-800">
            문장 보기
          </span>
          <StatusPill status={draft.restorationStatus} okLabel="복원 완료" />
        </div>
        <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          <ModeButton
            active={textMode === "restored"}
            onClick={() => setTextMode("restored")}
          >
            복원문
          </ModeButton>
          <ModeButton
            active={textMode === "problem"}
            onClick={() => setTextMode("problem")}
          >
            문제형 원문
          </ModeButton>
        </div>
      </div>
      <div className="max-h-52 overflow-auto px-4 py-3">
        {sentences.some((sentence) => sentence.text.trim().length > 0) ? (
          <ol className="space-y-2">
            {sentences.map((sentence) => (
              <li
                key={`${textMode}-${sentence.order}`}
                className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 text-[12px] leading-6"
              >
                <span className="pt-0.5 text-right font-semibold text-slate-400">
                  {sentence.order}.
                </span>
                <p className="whitespace-pre-wrap text-slate-800">
                  {sentence.text || "문장 내용 없음"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="whitespace-pre-wrap text-[12px] leading-6 text-slate-700">
            {fallbackText || "표시할 지문이 없습니다."}
          </p>
        )}
      </div>
    </div>
  );
}

function EvidencePanel({ draft }: { draft: M2PassageDraftSnapshot }) {
  const warnings = toStringList(draft.warnings);
  const changes = draft.restoration?.changes ?? [];
  const bestMatch = draft.sourceMatches[0] ?? null;

  return (
    <div className="min-h-0 rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
        복원 메타
      </div>
      <div className="max-h-52 space-y-3 overflow-auto p-3">
        <InfoBlock icon={SearchCheck} title="출처 매칭">
          {bestMatch ? (
            <div className="space-y-1">
              <p className="text-[12px] font-semibold text-slate-800">
                {bestMatch.title ?? "제목 없음"}
              </p>
              <p className="text-[11px] text-slate-500">
                {[bestMatch.publisher, bestMatch.unit, bestMatch.year]
                  .filter(Boolean)
                  .join(" · ") || bestMatch.method}
              </p>
              <p className="text-[11px] text-slate-500">
                신뢰도 {formatConfidence(bestMatch.confidence)}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">매칭 후보 없음</p>
          )}
        </InfoBlock>

        <InfoBlock icon={ListChecks} title="변경 근거">
          {changes.length > 0 ? (
            <ul className="space-y-2">
              {changes.slice(0, 4).map((change) => (
                <li key={change.id} className="text-[11px] leading-5">
                  <p className="text-slate-700">
                    {change.before} →{" "}
                    <span className="font-semibold text-slate-900">
                      {change.after}
                    </span>
                  </p>
                  <p className="text-slate-500">
                    {change.reason || "근거 설명 없음"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-500">변경 근거 없음</p>
          )}
        </InfoBlock>

        <InfoBlock icon={AlertTriangle} title="주의 사항">
          {warnings.length > 0 ? (
            <ul className="space-y-1">
              {warnings.map((warning, index) => (
                <li
                  key={`${warning}-${index}`}
                  className="text-[11px] text-amber-700"
                >
                  {warning}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-500">추가 경고 없음</p>
          )}
        </InfoBlock>

        <QuestionSummary questions={draft.questions} />
      </div>
    </div>
  );
}

function QuestionSummary({
  questions,
}: {
  questions: M2QuestionDraftSnapshot[];
}) {
  return (
    <InfoBlock icon={CheckCircle2} title="연결 문제">
      {questions.length > 0 ? (
        <ul className="space-y-2">
          {questions.map((question) => (
            <li key={question.id} className="text-[11px] leading-5">
              <p className="line-clamp-2 font-semibold text-slate-700">
                {question.questionNumber
                  ? `${question.questionNumber}. ${question.stem}`
                  : question.stem}
              </p>
              {question.answer ? (
                <p className="text-slate-500">정답 {question.answer}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">연결된 문제 없음</p>
      )}
    </InfoBlock>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof SearchCheck;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
        <Icon className="size-3.5" strokeWidth={1.8} />
        {title}
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-1 font-semibold",
        tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-white text-slate-600",
      )}
    >
      {label} {value}
    </span>
  );
}

function StatusPill({ status, okLabel }: { status: string; okLabel: string }) {
  const ok =
    status === "PASS" || status === "RESTORED" || status === "CONFIRMED";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
      )}
    >
      {ok ? okLabel : status}
    </span>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 text-[11px] font-semibold transition-colors",
        active ? "bg-white text-sky-700 shadow-sm" : "text-slate-500",
      )}
    >
      {children}
    </button>
  );
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : null))
    .filter((item): item is string => Boolean(item));
}

function formatConfidence(value: number | null): string {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}
