"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageIcon, Loader2, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createWorkbenchPassage } from "@/actions/workbench";
import { FormSection } from "@/components/workbench/passage-registration/sections/form-section";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  useCreateExtraction,
  type ExtractionPromotedResult,
} from "@/components/workbench/passage-registration/use-create-extraction";
import {
  isPristineEmptyRow,
  makeEmptyRow,
  makeRowFromDraft,
  MIN_CONTENT_CHARS,
  type PassageInputRow,
} from "@/components/workbench/passage-registration/passage-input/types";
import type { DraftCollectionItem } from "@/components/workbench/passage-registration/types";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import { getDraftDisplayTitle } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/title";
import type {
  IntakeView,
  IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import {
  DEFAULT_WEBTOON_LANGUAGE,
  type WebtoonLanguageId,
  type WebtoonStyleId,
} from "./webtoon-page-types";
import { useWebtoonState } from "./use-webtoon-state";
import { WebtoonInputStack } from "./webtoon-input-stack";
import { WebtoonQueueCard } from "./webtoon-queue-card";
import { WebtoonTextEditor } from "./editor/webtoon-text-editor";

interface WebtoonPageClientProps {
  academyId: string;
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;
}

/** Build a passage title from the first non-empty line of typed content. */
function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

export function WebtoonPageClient({
  academyId,
  draftCollections,
  draftMembership,
}: WebtoonPageClientProps) {
  // ─── 지문 입력 스택 (자료 관리에서 불러온 지문 = 행) ───
  const [rows, setRows] = useState<PassageInputRow[]>(() => [makeEmptyRow()]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const loadedDraftIds = useMemo(
    () =>
      rows
        .map((r) => r.sourceDraftId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    [rows],
  );

  // ─── 웹툰 옵션 ───
  const [style, setStyle] = useState<WebtoonStyleId>("KOREAN_WEBTOON");
  const [language, setLanguage] = useState<WebtoonLanguageId>(
    DEFAULT_WEBTOON_LANGUAGE,
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // ─── 폼 접기 ───
  const [formCollapsed, setFormCollapsed] = useState(false);

  // ─── 웹툰 큐 (DB 폴링) ───
  const {
    items: queue,
    loading: queueLoading,
    handleBatchGenerate,
    handleRetry,
    handleRemove,
    patchItem,
  } = useWebtoonState({ academyId });

  // ─── 자막 편집기 ───
  const [editingWebtoonId, setEditingWebtoonId] = useState<string | null>(null);
  const editingWebtoon = useMemo(
    () => queue.find((q) => q.id === editingWebtoonId) ?? null,
    [queue, editingWebtoonId],
  );

  const queueCounts = useMemo(
    () => ({
      generating: queue.filter(
        (q) => q.status === "PENDING" || q.status === "GENERATING",
      ).length,
      done: queue.filter((q) => q.status === "COMPLETED").length,
      error: queue.filter((q) => q.status === "FAILED").length,
    }),
    [queue],
  );

  // ─── 자료 관리 → 행 ───
  const { triggerRefresh, setScope } = useTaskQueue();
  const [draftRefreshToken, setDraftRefreshToken] = useState(0);
  const bumpDraftRefresh = useCallback(
    () => setDraftRefreshToken((v) => v + 1),
    [],
  );

  const handleLoadDrafts = useCallback((drafts: M1PassageDraftWithJob[]) => {
    const prev = rowsRef.current;
    const existing = new Set(
      prev.map((r) => r.sourceDraftId).filter((id): id is string => !!id),
    );
    const incoming = drafts
      .filter((d) => !existing.has(d.id))
      .map((d) => ({
        d,
        text: formatExtractedTextForDisplay(
          d.teacherText?.trim() ||
            d.restoredText?.trim() ||
            d.rawText?.trim() ||
            "",
        ),
      }))
      .filter((x) => x.text.length > 0)
      .map(({ d, text }) =>
        makeRowFromDraft({
          title: d.title?.trim() || getDraftDisplayTitle(d),
          content: text,
          sourceDraftId: d.id,
          source:
            d.job?.displayName?.trim() ||
            d.job?.originalFileName?.trim() ||
            null,
        }),
      );

    if (incoming.length === 0) {
      toast.info("이미 불러온 지문이거나 본문이 비어 있어요.");
      return;
    }
    const base = prev.length === 1 && isPristineEmptyRow(prev[0]) ? [] : prev;
    if (base.length === 0) incoming[0] = { ...incoming[0], collapsed: false };
    const next = [...base, ...incoming];
    rowsRef.current = next;
    setRows(next);
    setFormCollapsed(false);
    toast.success(`${incoming.length}개 지문을 불러왔어요. 웹툰을 생성하세요.`);
  }, []);

  const handleSelectDraftLoad = useCallback(
    (draft: M1PassageDraftWithJob) => handleLoadDrafts([draft]),
    [handleLoadDrafts],
  );

  // ─── Intake (이미지·PDF) ───
  const [intakeView, setIntakeView] = useState<IntakeView>("library");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("upload");

  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});
  const handleExtractionPromoted = useCallback(
    ({ jobId, complete }: ExtractionPromotedResult) => {
      bumpDraftRefresh();
      triggerRefresh();
      if (complete) {
        window.setTimeout(() => clearExtractionPendingRef.current(jobId), 1500);
      }
      toast.success(
        complete
          ? "추출이 완료돼 자료 목록에 추가됐어요. 지문을 선택해 불러오세요."
          : "일부 지문이 자료 목록에 추가됐어요. 나머지는 계속 처리 중입니다.",
      );
    },
    [bumpDraftRefresh, triggerRefresh],
  );

  const {
    beginJob: beginExtractionJob,
    attachJob: attachExtractionJob,
    failJob: failExtractionJob,
    clearPending: clearExtractionPending,
    pending: extractionPending,
  } = useCreateExtraction({ onPromoted: handleExtractionPromoted });
  useEffect(() => {
    clearExtractionPendingRef.current = clearExtractionPending;
  }, [clearExtractionPending]);

  const handleExtractionBegin = useCallback(
    (id: string, count: number) => {
      beginExtractionJob(id, count);
      setIntakeView("library");
      setScope("extraction");
    },
    [beginExtractionJob, setScope],
  );
  const handleExtractionResult = useCallback(
    (id: string, jobId: string | null) => {
      if (jobId) {
        attachExtractionJob(id, jobId);
        bumpDraftRefresh();
        triggerRefresh();
      } else {
        failExtractionJob(id);
      }
    },
    [attachExtractionJob, failExtractionJob, bumpDraftRefresh, triggerRefresh],
  );

  // ─── 웹툰 생성 액션: 각 행 → Passage 저장 → 웹툰 큐잉 ───
  const handleGenerate = useCallback(async () => {
    const current = rowsRef.current;
    const valid = current.filter(
      (r) => r.content.trim().length >= MIN_CONTENT_CHARS,
    );
    if (valid.length === 0) {
      toast.error(`지문을 ${MIN_CONTENT_CHARS}자 이상 입력해주세요.`);
      return;
    }
    if (generating) return;
    setGenerating(true);

    try {
      const results = await Promise.allSettled(
        valid.map(async (row) => {
          const text = row.content.trim();
          const title = row.title.trim() || derivePastedTitle(text);
          const result = await createWorkbenchPassage({
            title,
            content: text,
            source: row.source?.trim() || undefined,
            sourceDraftId: row.sourceDraftId ?? undefined,
          });
          if (!result.success || !result.id) {
            throw new Error(result.error || "CREATE_FAILED");
          }
          return { id: result.id, title, content: text };
        }),
      );

      const created = results.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
      const failed = results.length - created.length;

      if (created.length > 0) {
        const queued = await handleBatchGenerate(
          created,
          style,
          customPrompt,
          language,
        );
        // 큐잉이 실제로 성공했을 때만 입력 스택을 비운다. 생성 요청이 실패하면
        // (네트워크/크레딧 부족 등) 작성한 지문을 보존해 바로 재시도할 수 있게 한다.
        if (queued > 0) {
          const fresh = [makeEmptyRow()];
          rowsRef.current = fresh;
          setRows(fresh);
        }
        bumpDraftRefresh();
        triggerRefresh();
      }
      if (failed > 0) {
        toast.error(`${failed}개 지문 등록에 실패했습니다.`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "웹툰 생성 중 오류가 발생했습니다.",
      );
    } finally {
      setGenerating(false);
    }
  }, [
    generating,
    style,
    language,
    customPrompt,
    handleBatchGenerate,
    bumpDraftRefresh,
    triggerRefresh,
  ]);

  return (
    <TooltipProvider>
      <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
        <main className="flex w-full min-w-0 flex-col gap-4">
          {/* ─── 자료 관리 + 지문 편집 스택 (학습지 생성과 동일 레이아웃, 액션=웹툰 생성) ─── */}
          <FormSection
            academyId={academyId}
            formCollapsed={formCollapsed}
            setFormCollapsed={setFormCollapsed}
            title="웹툰 생성"
            description="자료를 불러오거나 직접 입력한 지문을 한 장의 세로형 웹툰으로 생성합니다."
            titleIcon={Palette}
            libraryLabel="자료 관리"
            rightPane={
              <WebtoonInputStack
                rows={rows}
                setRows={setRows}
                saving={generating}
                style={style}
                setStyle={setStyle}
                language={language}
                setLanguage={setLanguage}
                customPrompt={customPrompt}
                setCustomPrompt={setCustomPrompt}
                onGenerate={handleGenerate}
              />
            }
            draftRefreshToken={draftRefreshToken}
            onSelectDraft={handleSelectDraftLoad}
            onLoadSelectedDrafts={handleLoadDrafts}
            loadedDraftIds={loadedDraftIds}
            draftCollections={draftCollections}
            draftMembership={draftMembership}
            intakeView={intakeView}
            setIntakeView={setIntakeView}
            intakeTab={intakeTab}
            setIntakeTab={setIntakeTab}
            onExtractionBegin={handleExtractionBegin}
            onExtractionResult={handleExtractionResult}
            extractionPending={extractionPending}
          />

          {/* ─── 생성한 웹툰 ─── */}
          <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-bold text-slate-900">
                    생성한 웹툰
                  </h2>
                  <p className="text-[12px] font-medium text-slate-400">
                    백그라운드에서 처리되며 완료되면 자동으로 표시됩니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {queueCounts.generating > 0 && (
                  <Badge className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    생성 중 {queueCounts.generating}
                  </Badge>
                )}
                {queueCounts.done > 0 && (
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    완료 {queueCounts.done}
                  </Badge>
                )}
                {queueCounts.error > 0 && (
                  <Badge className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
                    실패 {queueCounts.error}
                  </Badge>
                )}
                <Link
                  href="/director/workbench/webtoon/library"
                  className="text-[11.5px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                >
                  전체 보관함 →
                </Link>
              </div>
            </div>

            <div className="px-4 py-4">
              {queueLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <p className="text-[12px] text-slate-400">목록 불러오는 중...</p>
                </div>
              ) : queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 opacity-70">
                  <ImageIcon className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-[13px] text-slate-400">
                    아직 생성된 웹툰이 없습니다
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    위에서 지문을 불러오고 화풍·언어를 설정한 뒤 웹툰 생성을
                    눌러주세요
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {queue.map((item) => (
                    <WebtoonQueueCard
                      key={item.id}
                      item={item}
                      onRetry={handleRetry}
                      onRemove={handleRemove}
                      onEditText={setEditingWebtoonId}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {editingWebtoonId ? (
        <WebtoonTextEditor
          key={editingWebtoonId}
          webtoonId={editingWebtoonId}
          title={editingWebtoon?.passage.title}
          onClose={() => setEditingWebtoonId(null)}
          onExported={(editedImageUrl) =>
            patchItem(editingWebtoonId, { editedImageUrl })
          }
        />
      ) : null}
    </TooltipProvider>
  );
}
