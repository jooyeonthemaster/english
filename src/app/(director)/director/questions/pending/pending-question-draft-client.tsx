"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  promoteQuestionDraft,
  skipQuestionDraft,
  updateQuestionDraft,
  type QuestionDraftListItem,
} from "@/actions/workbench";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PendingQuestionDraftClientProps {
  initialDrafts: QuestionDraftListItem[];
}

interface ChoiceEdit {
  label: string;
  text: string;
}

export function PendingQuestionDraftClient({
  initialDrafts,
}: PendingQuestionDraftClientProps) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState(initialDrafts[0]?.id ?? null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter((draft) =>
      [draft.stem, draft.answer, draft.explanation, draft.job.originalFileName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [drafts, search]);

  const selected =
    drafts.find((draft) => draft.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="flex h-[calc(100vh-56px)] min-h-[640px] flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <Link href="/director/questions" className="hover:text-sky-700">
              문제 은행
            </Link>
            <ArrowRight className="size-3" />
            <span>등록 대기</span>
          </div>
          <h1 className="mt-1 text-[20px] font-bold text-slate-900">
            문제 등록 대기
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <Metric label="대기" value={drafts.length} />
          <Link
            href="/director/questions"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 hover:bg-slate-50"
          >
            문제 은행 보기
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9 text-[13px]"
                placeholder="문제, 정답, 파일명 검색"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {filtered.length > 0 ? (
              filtered.map((draft) => (
                <DraftListButton
                  key={draft.id}
                  draft={draft}
                  selected={selected?.id === draft.id}
                  onClick={() => setSelectedId(draft.id)}
                />
              ))
            ) : (
              <EmptyState />
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-auto p-6">
          {selected ? (
            <QuestionDraftEditor
              key={selected.id}
              draft={selected}
              onSaved={(next) => {
                setDrafts((prev) =>
                  prev.map((draft) => (draft.id === next.id ? next : draft)),
                );
              }}
              onRemoved={(id) => {
                const next = drafts.filter((draft) => draft.id !== id);
                setDrafts(next);
                setSelectedId(next[0]?.id ?? null);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-slate-500">
              등록 대기 문제가 없습니다.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function QuestionDraftEditor({
  draft,
  onSaved,
  onRemoved,
}: {
  draft: QuestionDraftListItem;
  onSaved: (draft: QuestionDraftListItem) => void;
  onRemoved: (id: string) => void;
}) {
  const [stem, setStem] = useState(draft.stem);
  const [choices, setChoices] = useState<ChoiceEdit[]>(
    parseChoices(draft.choices),
  );
  const [answer, setAnswer] = useState(draft.answer ?? "");
  const [explanation, setExplanation] = useState(draft.explanation ?? "");
  const [questionType, setQuestionType] = useState(draft.questionType ?? "");
  const [isPending, startTransition] = useTransition();

  const payload = {
    stem,
    choices,
    answer,
    explanation,
    questionType: questionType || null,
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">
              {draft.questionNumber ? `${draft.questionNumber}번 문제` : "문제"}
            </h2>
            <p className="mt-1 text-[12px] text-slate-500">
              검수 후 문제 은행에 등록하면 승인된 문제로 저장됩니다.
            </p>
          </div>
          <StatusPill status={draft.reviewStatus} />
        </div>

        <div className="space-y-5 p-5">
          <Field label="문제 유형">
            <Input
              value={questionType}
              onChange={(event) => setQuestionType(event.target.value)}
              placeholder="예: GRAMMAR_ERROR, VOCAB_CONTEXT"
            />
          </Field>

          <Field label="문제">
            <Textarea
              value={stem}
              onChange={(event) => setStem(event.target.value)}
              className="min-h-32 resize-y text-[13px] leading-6"
            />
          </Field>

          <Field label="선지">
            <div className="space-y-2">
              {choices.map((choice, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[58px_minmax(0,1fr)] gap-2"
                >
                  <Input
                    value={choice.label}
                    onChange={(event) =>
                      setChoices((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? { ...row, label: event.target.value }
                            : row,
                        ),
                      )
                    }
                    aria-label={`${index + 1}번 선지 라벨`}
                  />
                  <Input
                    value={choice.text}
                    onChange={(event) =>
                      setChoices((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? { ...row, text: event.target.value }
                            : row,
                        ),
                      )
                    }
                    aria-label={`${index + 1}번 선지 내용`}
                  />
                </div>
              ))}
              {choices.length === 0 ? (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                  추출된 선지가 없습니다. 단답형 문제로 등록됩니다.
                </p>
              ) : null}
            </div>
          </Field>

          <Field label="정답">
            <Input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="정답"
            />
          </Field>

          <Field label="해설">
            <Textarea
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              className="min-h-28 resize-y text-[13px] leading-6"
              placeholder="해설이 없으면 비워둘 수 있습니다."
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await updateQuestionDraft(draft.id, payload);
                  if (!result.success) {
                    toast.error(result.error ?? "저장 실패");
                    return;
                  }
                  onSaved({ ...draft, ...payload, reviewStatus: "REVIEWED" });
                  toast.success("문제 draft를 저장했습니다.");
                });
              }}
            >
              <Save className="size-4" />
              임시 저장
            </Button>
            <Button
              type="button"
              disabled={isPending || stem.trim().length === 0}
              onClick={() => {
                startTransition(async () => {
                  const result = await promoteQuestionDraft(draft.id, payload);
                  if (!result.success) {
                    toast.error(result.error ?? "등록 실패");
                    return;
                  }
                  onRemoved(draft.id);
                  toast.success("문제 은행에 등록했습니다.");
                });
              }}
            >
              <CheckCircle2 className="size-4" />
              문제 은행에 등록
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await skipQuestionDraft(draft.id);
                  if (!result.success) {
                    toast.error(result.error ?? "삭제 실패");
                    return;
                  }
                  onRemoved(draft.id);
                  toast.success("등록 대기 목록에서 제외했습니다.");
                });
              }}
            >
              <Trash2 className="size-4" />
              제외
            </Button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <InfoPanel title="연결 지문">
          {draft.passageDraft ? (
            <div className="space-y-2">
              <p className="text-[12px] font-semibold text-slate-800">
                지문 {draft.passageDraft.passageOrder + 1}
              </p>
              <p className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-[12px] leading-6 text-slate-600">
                {draft.passageDraft.teacherText ||
                  draft.passageDraft.restoredText ||
                  draft.passageDraft.problemText}
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">연결된 지문 없음</p>
          )}
        </InfoPanel>

        <InfoPanel title="추출 정보">
          <dl className="space-y-2 text-[12px]">
            <MetaRow label="파일" value={draft.job.originalFileName ?? "-"} />
            <MetaRow
              label="페이지"
              value={draft.sourcePageIndex.map((page) => page + 1).join(", ")}
            />
            <MetaRow
              label="신뢰도"
              value={
                typeof draft.confidence === "number"
                  ? `${Math.round(draft.confidence * 100)}%`
                  : "-"
              }
            />
          </dl>
        </InfoPanel>
      </aside>
    </div>
  );
}

function DraftListButton({
  draft,
  selected,
  onClick,
}: {
  draft: QuestionDraftListItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-2 w-full rounded-md border px-3 py-3 text-left transition-colors last:mb-0",
        selected
          ? "border-sky-200 bg-sky-50"
          : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-slate-800">
          {draft.questionNumber ? `${draft.questionNumber}번` : "문제"}
        </span>
        <StatusPill status={draft.reviewStatus} />
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-600">
        {draft.stem}
      </p>
      <p className="mt-2 truncate text-[11px] text-slate-400">
        {draft.job.originalFileName ?? "추출 작업"} · p.
        {draft.sourcePageIndex.map((page) => page + 1).join(", ")}
      </p>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 text-[12px] font-bold text-slate-700">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-semibold text-slate-700">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600">
      {label} {value}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const reviewed = status === "REVIEWED";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold",
        reviewed ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700",
      )}
    >
      {reviewed ? "검수됨" : "대기"}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-60 flex-col items-center justify-center rounded-md border border-dashed border-slate-200 text-center">
      <FileText className="mb-2 size-6 text-slate-300" />
      <p className="text-[13px] font-semibold text-slate-600">
        표시할 문제가 없습니다.
      </p>
      <p className="mt-1 text-[12px] text-slate-400">검색어를 확인하세요.</p>
    </div>
  );
}

function parseChoices(value: unknown): ChoiceEdit[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((choice, index) => {
      if (!choice || typeof choice !== "object") return null;
      const row = choice as Record<string, unknown>;
      const label =
        typeof row.label === "string" ? row.label : String(index + 1);
      const text =
        typeof row.text === "string"
          ? row.text
          : typeof row.content === "string"
            ? row.content
            : "";
      return { label, text };
    })
    .filter((choice): choice is ChoiceEdit => Boolean(choice));
}
