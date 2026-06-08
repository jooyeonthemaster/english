"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ComponentProps, MouseEvent } from "react";
import { CheckCircle2, FileText, Loader2, Send, Settings2, Users, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { Button } from "@/components/ui/button";
import {
  countWords,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  type PassageItem,
} from "@/app/(director)/director/workbench/generate/generate-page-types";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";
import {
  TutorProgramGenerationQueue,
  type TutorProgramGenerationJob,
} from "./tutor-program-generation-queue";

type CollectionOption = { id: string; name: string; _count: { items: number } };
type GenerationMode = "auto" | "template";
type TemplateKey = "basic_interpret" | "memorize" | "grammar_focus" | "advanced_transform" | "exam_compression";
type AnalysisModalPassage = ComponentProps<typeof PassageAnalysisModal>["passage"];
type PublishTargetType = "NONE" | "CLASS" | "STUDENT";
type TargetOption = { id: string; label: string; count?: number; meta?: string | null };

const templateOptions: Array<{ key: TemplateKey; label: string; detail: string }> = [
  { key: "basic_interpret", label: "기초 해석", detail: "직독직해, 핵심 흐름, 필수 어휘" },
  { key: "memorize", label: "본문 암기", detail: "빈칸, 첫 글자, 문장 복원" },
  { key: "grammar_focus", label: "어법 집중", detail: "어법 판단, 오류 찾기, 구문 변형" },
  { key: "advanced_transform", label: "상위권 변형", detail: "추론, 삽입, 순서, 전이 영작" },
  { key: "exam_compression", label: "시험 압축", detail: "출제 포인트 위주 빠른 회전" },
];

export function TutorProgramCreateForm({
  classes = [],
  students = [],
}: {
  classes?: TargetOption[];
  students?: TargetOption[];
}) {
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(true);
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState<PassageAnalysisStatusFilter>("all");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generationMode, setGenerationMode] = useState<GenerationMode>("auto");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("basic_interpret");
  const [programTitle, setProgramTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publishTargetType, setPublishTargetType] = useState<PublishTargetType>("NONE");
  const [publishTargetId, setPublishTargetId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [analysisModalPassage, setAnalysisModalPassage] = useState<AnalysisModalPassage | null>(null);
  const [loadingAnalysisModal, setLoadingAnalysisModal] = useState(false);
  const [generationJobs, setGenerationJobs] = useState<TutorProgramGenerationJob[]>([]);
  const [loadingGenerationJobs, setLoadingGenerationJobs] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLoadingPassages(true);
    fetch("/api/passages/list")
      .then((response) => response.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
        if (data.collections) setCollections(data.collections);
      })
      .catch(() => toast.error("지문 목록을 불러오지 못했어요."))
      .finally(() => setLoadingPassages(false));
  }, []);

  const loadGenerationJobs = useCallback(async () => {
    setLoadingGenerationJobs(true);
    try {
      const response = await fetch("/api/tutor/program-generation/jobs?limit=50", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { jobs?: TutorProgramGenerationJob[] };
      setGenerationJobs(data.jobs ?? []);
    } catch {
      // Keep optimistic jobs visible during transient polling failures.
    } finally {
      setLoadingGenerationJobs(false);
    }
  }, []);

  useEffect(() => {
    void loadGenerationJobs();
    const timer = window.setInterval(loadGenerationJobs, 5_000);
    return () => window.clearInterval(timer);
  }, [loadGenerationJobs]);

  const filteredPassages = useMemo(() => {
    return passages.filter((passage) => {
      if (passageSearch) {
        const query = passageSearch.toLowerCase();
        if (!passage.title.toLowerCase().includes(query) && !passage.content.toLowerCase().includes(query)) return false;
      }
      if (filterSchool && passage.school?.id !== filterSchool) return false;
      if (filterGrade && passage.grade !== Number(filterGrade)) return false;
      if (filterSemester && passage.semester !== filterSemester) return false;
      if (analysisStatusFilter === "analyzed" && !passage.analysis) return false;
      if (analysisStatusFilter === "unanalyzed" && passage.analysis) return false;
      if (selectedCollectionId && !passage.collectionItems?.some((item) => item.collectionId === selectedCollectionId)) {
        return false;
      }
      return true;
    });
  }, [analysisStatusFilter, filterGrade, filterSchool, filterSemester, passageSearch, passages, selectedCollectionId]);

  const passageStatusCounts = useMemo(
    () => ({
      all: passages.length,
      analyzed: passages.filter((passage) => passage.analysis).length,
      unanalyzed: passages.filter((passage) => !passage.analysis).length,
    }),
    [passages],
  );

  const selectedPassages = useMemo(
    () => passages.filter((passage) => selectedIds.has(passage.id)),
    [passages, selectedIds],
  );
  const selectedAnalyzedCount = selectedPassages.filter((passage) => passage.analysis).length;
  const selectedWords = selectedPassages.reduce((sum, passage) => sum + countWords(passage.content), 0);
  const hasUnanalyzedSelection = selectedIds.size > 0 && selectedAnalyzedCount !== selectedIds.size;
  const activeFilterCount =
    [filterSchool, filterGrade, filterSemester].filter(Boolean).length + (analysisStatusFilter === "all" ? 0 : 1);
  const canCreate = selectedIds.size > 0 && selectedIds.size <= 12 && !hasUnanalyzedSelection && !isPending;
  const resolvedTemplateKey = generationMode === "auto" ? "basic_interpret" : templateKey;
  const publishOptions = publishTargetType === "CLASS" ? classes : publishTargetType === "STUDENT" ? students : [];

  const toggleCheckbox = useCallback((id: string, event?: MouseEvent) => {
    event?.stopPropagation();
    setError("");
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= 12) {
        toast.info("한 번에 최대 12개 지문까지 프로그램으로 묶을 수 있어요.");
        return current;
      }
      next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setError("");
    setSelectedIds(new Set(filteredPassages.slice(0, 12).map((passage) => passage.id)));
    if (filteredPassages.length > 12) toast.info("상위 12개 지문만 선택했어요.");
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    setError("");
  }, []);

  const handleOpenAnalysisModal = useCallback(async (passageId: string) => {
    setLoadingAnalysisModal(true);
    try {
      const { getWorkbenchPassage } = await import("@/actions/workbench");
      const result = await getWorkbenchPassage(passageId);
      if (result) setAnalysisModalPassage(result as AnalysisModalPassage);
      else toast.error("지문 데이터를 불러오지 못했어요.");
    } catch {
      toast.error("지문 상세 로딩에 실패했어요.");
    } finally {
      setLoadingAnalysisModal(false);
    }
  }, []);

  const handleCreateProgram = useCallback(() => {
    setError("");
    if (selectedIds.size === 0) {
      setError("왼쪽에서 지문을 먼저 선택하세요.");
      return;
    }
    if (hasUnanalyzedSelection) {
      setError("분석 완료 지문만 모바일 학습 프로그램으로 만들 수 있어요.");
      return;
    }
    if (publishTargetType !== "NONE" && !publishTargetId) {
      setError("바로 배포하려면 클래스 또는 학생을 선택하세요.");
      return;
    }
    const firstTitle = selectedPassages[0]?.title ?? "모바일 학습";
    const autoTitle = selectedIds.size > 1 ? `${firstTitle} 외 ${selectedIds.size - 1}개` : firstTitle;
    const title = programTitle.trim() || autoTitle;
    const passageIds = Array.from(selectedIds);
    const optimisticLessons = selectedPassages.map((passage) => ({
      passageId: passage.id,
      title: passage.title,
      contentPreview: passage.content.slice(0, 260),
      activityCount: 0,
      ruleBasedCount: 0,
      examAlignedCount: 0,
      activities: [],
      warnings: [],
    }));

    startTransition(async () => {
      const response = await fetch("/api/tutor/program-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          description: description.trim(),
          templateKey: resolvedTemplateKey,
          passageIds,
          publishTargetType,
          publishTargetId: publishTargetId || undefined,
          dueAt: dueAt || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setError(result.details || result.error || "프로그램 생성 작업을 시작하지 못했습니다.");
        return;
      }
      const jobId = String(result.jobId ?? "");
      if (jobId) {
        const now = new Date().toISOString();
        setGenerationJobs((current) => [
          {
            id: jobId,
            status: "PENDING",
            title,
            requestedCount: passageIds.length,
            successCount: 0,
            failedCount: 0,
            resultCount: 0,
            config: {
              title,
              description,
              templateKey: resolvedTemplateKey,
              passageIds,
              publishTargetType,
              publishTargetId,
              dueAt,
            },
            result: {
              title,
              status: "PROCESSING",
              totalPassages: passageIds.length,
              completedPassages: 0,
              activityCount: 0,
              estimatedMin: 0,
              currentPassageTitle: selectedPassages[0]?.title,
              lessons: optimisticLessons,
              warnings: [],
            },
            errorMessage: null,
            createdAt: result.createdAt || now,
            startedAt: null,
            completedAt: null,
          },
          ...current.filter((job) => job.id !== jobId),
        ]);
      }
      setSelectedIds(new Set());
      toast.success("프로그램 생성 작업을 시작했습니다. 아래 카드에서 진행 상황을 확인하세요.");
      window.setTimeout(loadGenerationJobs, 800);
      window.setTimeout(loadGenerationJobs, 2500);
    });
  }, [
    description,
    dueAt,
    hasUnanalyzedSelection,
    loadGenerationJobs,
    programTitle,
    publishTargetId,
    publishTargetType,
    resolvedTemplateKey,
    selectedIds,
    selectedPassages,
    setSelectedIds,
  ]);

  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col bg-slate-50">
      <div className="flex flex-col lg:flex-row bg-white lg:h-[620px] xl:h-[680px] w-full">
        <PassageCardGrid
          passages={passages}
          filteredPassages={filteredPassages}
          filterOptions={filterOptions}
          collections={collections}
          loadingPassages={loadingPassages}
          passageSearch={passageSearch}
          setPassageSearch={setPassageSearch}
          filterSchool={filterSchool}
          setFilterSchool={setFilterSchool}
          filterGrade={filterGrade}
          setFilterGrade={setFilterGrade}
          filterSemester={filterSemester}
          setFilterSemester={setFilterSemester}
          analysisStatusFilter={analysisStatusFilter}
          setAnalysisStatusFilter={setAnalysisStatusFilter}
          passageStatusCounts={passageStatusCounts}
          activeFilterCount={activeFilterCount}
          selectedCollectionId={selectedCollectionId}
          setSelectedCollectionId={setSelectedCollectionId}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          toggleCheckbox={toggleCheckbox}
          selectAll={selectAll}
          deselectAll={deselectAll}
          genMode="auto"
          totalQuestions={1}
          handleBatchGenerate={handleCreateProgram}
          selectionActionText={`${selectedIds.size}개 지문 학습 생성`}
          selectionActionDisabled={!canCreate}
          handleOpenAnalysisModal={handleOpenAnalysisModal}
        />

        <aside className="flex flex-col bg-white overflow-hidden w-full lg:w-[360px] xl:w-[420px] shrink-0 border-l border-slate-200/80">
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 pt-5 pb-3">
              <div className="flex bg-slate-100/80 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setGenerationMode("auto")}
                  className={[
                    "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200",
                    generationMode === "auto"
                      ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200"
                      : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  <Zap className="size-4" />
                  자동 생성
                </button>
                <button
                  type="button"
                  onClick={() => setGenerationMode("template")}
                  className={[
                    "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200",
                    generationMode === "template"
                      ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200"
                      : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  <Settings2 className="size-4" />
                  유형 지정
                </button>
              </div>
            </div>

            <div className="px-5 py-3 space-y-4">
              <div className="rounded-xl bg-gradient-to-br from-blue-50/80 to-blue-50/30 border border-blue-200/50 p-4 space-y-4">
                <div className="flex items-start gap-2.5">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100/80 shrink-0 mt-0.5">
                    <Wand2 className="size-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-blue-800">AI 모바일 학습 생성</p>
                    <p className="text-[11px] text-blue-600/80 mt-1 leading-relaxed">
                      학습지 생성 데이터를 기반으로 어휘, 문장 복원, 어법, AI 코칭 활동을 자동 구성합니다.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <PanelStat label="선택" value={`${selectedIds.size}`} />
                  <PanelStat label="분석" value={`${selectedAnalyzedCount}`} />
                  <PanelStat label="단어" value={`${selectedWords}`} />
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">프로그램명</span>
                <input
                  value={programTitle}
                  onChange={(event) => setProgramTitle(event.target.value)}
                  placeholder="비워두면 첫 지문 제목으로 자동 저장"
                  className="w-full h-10 px-3.5 text-[12px] rounded-xl border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 transition-all"
                />
              </div>

              {generationMode === "template" && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">학습 유형</span>
                  <div className="grid gap-2">
                    {templateOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setTemplateKey(option.key)}
                        className={[
                          "rounded-xl border px-3 py-2.5 text-left transition-all",
                          templateKey === option.key
                            ? "border-blue-300 bg-blue-50 shadow-sm shadow-blue-50"
                            : "border-slate-200 bg-white hover:border-slate-300",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-2 text-[12px] font-bold text-slate-800">
                          {templateKey === option.key && <CheckCircle2 className="size-3.5 text-blue-600" />}
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{option.detail}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">추가 지시사항</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="예: 단어 테스트를 더 많이, 어법은 서술형 변형 위주로..."
                  className="w-full min-h-[72px] px-3.5 py-2.5 text-[12px] leading-relaxed rounded-xl border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 resize-none transition-all"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-start gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                    <Send className="size-4" />
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-slate-900">생성 후 바로 배포</p>
                    <p className="mt-0.5 text-[11px] font-medium leading-5 text-slate-500">
                      클래스 전체나 개별 학생에게 학생 앱 학습으로 즉시 열어줄 수 있습니다.
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {[
                    { key: "NONE", label: "나중에", icon: FileText },
                    { key: "CLASS", label: "클래스", icon: Users },
                    { key: "STUDENT", label: "학생", icon: CheckCircle2 },
                  ].map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setPublishTargetType(key as PublishTargetType);
                        setPublishTargetId("");
                      }}
                      className={[
                        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-black transition",
                        publishTargetType === key
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                      ].join(" ")}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {publishTargetType !== "NONE" && (
                  <div className="mt-3 grid gap-2">
                    <select
                      value={publishTargetId}
                      onChange={(event) => setPublishTargetId(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                    >
                      <option value="">{publishTargetType === "CLASS" ? "배포할 클래스를 선택하세요" : "배포할 학생을 선택하세요"}</option>
                      {publishOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                          {typeof option.count === "number" ? ` · ${option.count}명` : ""}
                          {option.meta ? ` · ${option.meta}` : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                    />
                  </div>
                )}
              </div>

              {hasUnanalyzedSelection && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
                  미분석 지문이 포함되어 있어요. 분석 완료 지문만 학습 생성이 가능합니다.
                </div>
              )}
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600">{error}</div>}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0">
            <Button
              onClick={handleCreateProgram}
              disabled={!canCreate}
              className={[
                "w-full h-12 rounded-xl text-[14px] font-bold transition-all duration-200",
                canCreate ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-400 cursor-not-allowed hover:bg-slate-200",
              ].join(" ")}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {selectedIds.size === 0 ? "지문을 선택하세요" : "모바일 학습 생성"}
            </Button>
          </div>
        </aside>
      </div>

      <div className="h-3 shrink-0 border-y border-slate-200/60 bg-[#E8EAEE]" />

      <TutorProgramGenerationQueue
        jobs={generationJobs}
        loading={loadingGenerationJobs}
        onRefresh={loadGenerationJobs}
      />

      {analysisModalPassage && (
        <PassageAnalysisModal
          open={Boolean(analysisModalPassage)}
          onClose={() => setAnalysisModalPassage(null)}
          passage={analysisModalPassage}
          initialAnalysis={
            analysisModalPassage.analysis?.analysisData
              ? typeof analysisModalPassage.analysis.analysisData === "string"
                ? JSON.parse(analysisModalPassage.analysis.analysisData)
                : analysisModalPassage.analysis.analysisData
              : null
          }
        />
      )}

      {loadingAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-xl">
            <Loader2 className="size-5 animate-spin text-blue-600" />
            <span className="text-[13px] font-medium text-slate-700">학습지 생성 데이터를 불러오는 중...</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white/70 px-2 py-2 text-center">
      <p className="text-[10px] font-black text-blue-500">{label}</p>
      <p className="mt-0.5 text-[13px] font-black text-slate-800">{value}</p>
    </div>
  );
}
