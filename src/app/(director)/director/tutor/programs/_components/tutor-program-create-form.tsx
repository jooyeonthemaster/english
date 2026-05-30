"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ComponentProps, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, FileText, Loader2, Settings2, Sparkles, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";
import { createTutorProgramAction } from "@/actions/tutor";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { Button } from "@/components/ui/button";
import {
  countWords,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  type PassageItem,
} from "@/app/(director)/director/workbench/generate/generate-page-types";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";

type CollectionOption = { id: string; name: string; _count: { items: number } };
type GenerationMode = "auto" | "template";
type TemplateKey = "basic_interpret" | "memorize" | "grammar_focus" | "advanced_transform" | "exam_compression";
type AnalysisModalPassage = ComponentProps<typeof PassageAnalysisModal>["passage"];

const templateOptions: Array<{ key: TemplateKey; label: string; detail: string }> = [
  { key: "basic_interpret", label: "기초 해석", detail: "직독직해, 핵심 흐름, 필수 어휘" },
  { key: "memorize", label: "본문 암기", detail: "빈칸, 첫 글자, 문장 복원" },
  { key: "grammar_focus", label: "어법 집중", detail: "어법 판단, 오류 찾기, 구문 변형" },
  { key: "advanced_transform", label: "상위권 변형", detail: "추론, 삽입, 순서, 전이 영작" },
  { key: "exam_compression", label: "시험 압축", detail: "출제 포인트 위주 빠른 회전" },
];

export function TutorProgramCreateForm() {
  const router = useRouter();
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
  const [analysisModalPassage, setAnalysisModalPassage] = useState<AnalysisModalPassage | null>(null);
  const [loadingAnalysisModal, setLoadingAnalysisModal] = useState(false);
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
    const firstTitle = selectedPassages[0]?.title ?? "모바일 학습";
    const autoTitle = selectedIds.size > 1 ? `${firstTitle} 외 ${selectedIds.size - 1}개` : firstTitle;
    const formData = new FormData();
    formData.set("title", programTitle.trim() || autoTitle);
    formData.set("description", description.trim());
    formData.set("templateKey", resolvedTemplateKey);
    formData.set("passageIds", Array.from(selectedIds).join(","));

    startTransition(async () => {
      const result = await createTutorProgramAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("모바일 학습 프로그램을 생성했어요.");
      router.push(`/director/tutor/programs/${result.id}/builder`);
    });
  }, [description, hasUnanalyzedSelection, programTitle, resolvedTemplateKey, router, selectedIds, selectedPassages]);

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
                      지문 분석 데이터를 기반으로 어휘, 문장 복원, 어법, AI 코칭 활동을 자동 구성합니다.
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

      <section className="bg-slate-50 px-5 py-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <BookOpen className="size-4" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-950">생성 후 바로 빌더로 이동합니다</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                다음 화면에서 클래스 단위 배포와 지문 추가 생성을 이어서 처리할 수 있습니다.
              </p>
            </div>
            <Sparkles className="ml-auto hidden size-5 text-slate-300 sm:block" />
          </div>
        </div>
      </section>

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
            <span className="text-[13px] font-medium text-slate-700">지문 분석 데이터를 불러오는 중...</span>
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
