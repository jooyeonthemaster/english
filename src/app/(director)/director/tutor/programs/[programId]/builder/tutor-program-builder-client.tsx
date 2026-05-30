"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ComponentProps, MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Layers3,
  Loader2,
  MessageCircleQuestion,
  Rocket,
  Sparkles,
  Target,
  Wand2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";
import {
  countWords,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  type PassageItem,
} from "@/app/(director)/director/workbench/generate/generate-page-types";
import { addTutorProgramPassagesAction } from "@/actions/tutor";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";
import { TutorPublishForm } from "./tutor-publish-form";

type TargetOption = {
  id: string;
  label: string;
  count?: number;
};

type BuilderActivity = {
  id: string;
  mode: string;
  type: string;
  title: string;
  itemCount: number;
  maxScore: number;
  estimatedSec: number;
};

type BuilderLesson = {
  id: string;
  passageId: string;
  title: string;
  passageContent: string;
  schoolName?: string | null;
  grade?: number | null;
  unit?: string | null;
  analysisData?: string | null;
  activityCount: number;
  totalMaxScore: number;
  activities: BuilderActivity[];
};

type BuilderProgram = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  estimatedMin: number;
  lessons: BuilderLesson[];
};

type BuildJob = {
  id: string;
  status: "generating" | "done" | "error";
  title: string;
  detail: string;
};

type AnalysisModalPassage = ComponentProps<typeof PassageAnalysisModal>["passage"];

const modeLabels: Record<string, string> = {
  interpret: "해석",
  memorize: "암기",
  order: "순서",
  vocab: "어휘",
  grammar: "어법",
  transfer: "전이",
  mastery: "마스터리",
};

const activityTypeLabels: Record<string, string> = {
  sentence_translate: "직독직해",
  gist_select: "주제 선택",
  paraphrase_mc: "바꿔쓰기",
  first_letter_recall: "첫 글자",
  progressive_cloze: "빈칸 복원",
  sentence_rebuild: "어순 조립",
  chunk_rebuild: "구문 조립",
  sentence_order: "흐름 배열",
  insertion_point: "삽입 위치",
  irrelevant_sentence: "무관 문장",
  vocab_choice: "문맥 뜻",
  vocab_spell: "철자 쓰기",
  vocab_match: "어휘 매칭",
  contextual_meaning: "문맥 추론",
  collocation_select: "연어 선택",
  grammar_binary: "어법 O/X",
  grammar_find: "어법 찾기",
  grammar_correct: "어법 고치기",
  structure_transform: "구문 전환",
  mastery_test: "마스터리",
};

export function TutorProgramBuilderClient({
  academyId,
  initialProgram,
  activeStudentCount,
  classes,
}: {
  academyId: string;
  initialProgram: BuilderProgram;
  activeStudentCount: number;
  classes: TargetOption[];
}) {
  const router = useRouter();
  const [program, setProgram] = useState(initialProgram);
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [collections, setCollections] = useState<{ id: string; name: string; _count: { items: number } }[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(true);
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState<PassageAnalysisStatusFilter>("all");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [analysisModalPassage, setAnalysisModalPassage] = useState<AnalysisModalPassage | null>(null);
  const [loadingAnalysisModal, setLoadingAnalysisModal] = useState(false);
  const [buildJobs, setBuildJobs] = useState<BuildJob[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setProgram(initialProgram);
  }, [initialProgram]);

  useEffect(() => {
    setLoadingPassages(true);
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((response) => response.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
        if (data.collections) setCollections(data.collections);
      })
      .catch(() => toast.error("지문 목록을 불러오지 못했어요."))
      .finally(() => setLoadingPassages(false));
  }, [academyId]);

  const existingPassageIds = useMemo(
    () => new Set(program.lessons.map((lesson) => lesson.passageId)),
    [program.lessons],
  );

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
      if (selectedCollectionId && !passage.collectionItems?.some((item) => item.collectionId === selectedCollectionId)) return false;
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
  const totalActivities = program.lessons.reduce((sum, lesson) => sum + lesson.activities.length, 0);
  const totalWords = program.lessons.reduce((sum, lesson) => sum + countWords(lesson.passageContent), 0);
  const canGenerate = selectedIds.size > 0 && selectedAnalyzedCount === selectedIds.size && !isPending;
  const activeFilterCount =
    [filterSchool, filterGrade, filterSemester].filter(Boolean).length + (analysisStatusFilter === "all" ? 0 : 1);

  const toggleCheckbox = useCallback(
    (id: string, event?: MouseEvent) => {
      event?.stopPropagation();
      if (existingPassageIds.has(id)) {
        toast.info("이미 이 프로그램에 포함된 지문입니다.");
        return;
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [existingPassageIds],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.filter((passage) => !existingPassageIds.has(passage.id)).map((passage) => passage.id)));
  }, [existingPassageIds, filteredPassages]);

  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const handleOpenAnalysisModal = useCallback(async (passageId: string) => {
    setLoadingAnalysisModal(true);
    try {
      const { getWorkbenchPassage } = await import("@/actions/workbench");
      const result = await getWorkbenchPassage(passageId);
      if (result) setAnalysisModalPassage(result as AnalysisModalPassage);
      else toast.error("지문 데이터를 불러오지 못했어요.");
    } catch {
      toast.error("지문 상세 로딩 실패");
    } finally {
      setLoadingAnalysisModal(false);
    }
  }, []);

  const handleBuild = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (selectedAnalyzedCount !== selectedIds.size) {
      toast.error("분석 완료된 지문만 모바일 학습으로 만들 수 있어요.");
      return;
    }

    const ids = Array.from(selectedIds);
    const jobId = `build-${Date.now()}`;
    setBuildJobs((current) => [
      {
        id: jobId,
        status: "generating",
        title: `${ids.length}개 지문 모바일 학습 생성`,
        detail: "어휘, 어순, 어법, 문맥 퀴즈와 AI 코칭 활동을 구성하고 있어요.",
      },
      ...current,
    ]);

    startTransition(async () => {
      const result = await addTutorProgramPassagesAction(program.id, ids);
      if (!result.ok) {
        setBuildJobs((current) =>
          current.map((job) =>
            job.id === jobId
              ? { ...job, status: "error", detail: result.error }
              : job,
          ),
        );
        toast.error(result.error);
        return;
      }

      setBuildJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "done",
                detail: `${result.added ?? ids.length}개 지문이 프로그램에 추가됐어요.`,
              }
            : job,
        ),
      );
      setSelectedIds(new Set());
      toast.success(`${result.added ?? ids.length}개 지문 학습 생성 완료`);
      router.refresh();
    });
  }, [program.id, router, selectedAnalyzedCount, selectedIds]);

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex min-w-0 gap-3">
            <Button asChild variant="outline" size="icon" className="mt-1 shrink-0 rounded-xl">
              <Link href="/director/tutor/programs" aria-label="프로그램 목록으로 이동">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Mobile Learning Builder</p>
                <Badge variant="outline" className="rounded-full border-blue-100 bg-blue-50 text-blue-700">
                  {formatTutorStatus(program.status)}
                </Badge>
              </div>
              <h1 className="mt-1 line-clamp-1 text-2xl font-black text-slate-950">{program.title}</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                지문을 선택하면 분석된 어휘와 문장 데이터를 기반으로 학생 모바일용 학습 활동과 AI 코칭룸을 자동 구성합니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
            <Metric label="지문" value={`${program.lessons.length}`} />
            <Metric label="활동" value={`${totalActivities}`} />
            <Metric label="분량" value={`${totalWords}`} />
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row bg-white lg:h-[560px] xl:h-[620px] w-full">
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
          handleBatchGenerate={handleBuild}
          selectionActionText={`${selectedIds.size}개 지문 모바일 학습 생성`}
          selectionActionDisabled={!canGenerate}
          handleOpenAnalysisModal={handleOpenAnalysisModal}
        />

        <aside className="flex w-full shrink-0 flex-col overflow-hidden border-l border-slate-200/80 bg-white lg:w-[380px] xl:w-[440px]">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <Wand2 className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-950">지문별 모바일 학습 자동 구성</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-blue-700">
                    분석된 어휘, 문장, 어법 포인트를 그대로 사용해서 학생 화면에 바로 풀 수 있는 활동을 만듭니다.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniStat label="선택" value={selectedIds.size} />
                <MiniStat label="분석" value={selectedAnalyzedCount} />
                <MiniStat label="포함됨" value={program.lessons.length} />
              </div>

              {selectedIds.size > 0 && selectedAnalyzedCount !== selectedIds.size && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                  미분석 지문이 섞여 있어요. 분석 완료 지문만 생성됩니다.
                </div>
              )}

              <Button
                onClick={handleBuild}
                disabled={!canGenerate}
                className="mt-4 h-12 w-full rounded-xl bg-blue-600 text-sm font-black hover:bg-blue-700"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
                선택 지문으로 학습 생성
              </Button>
            </div>

            <div className="mt-4 grid gap-2">
              <FeatureRow Icon={BookOpen} title="어휘 스프린트" detail="뜻 고르기, 철자 쓰기, 문맥 의미, 연어 선택" />
              <FeatureRow Icon={Layers3} title="문장 복원" detail="첫 글자 암기, 어순 조립, 빈칸 복원" />
              <FeatureRow Icon={Target} title="내신 포인트" detail="어법 판단, 구문 전환, 흐름 배열, 삽입 위치" />
              <FeatureRow Icon={MessageCircleQuestion} title="AI 코칭룸" detail="지문 질문, 채팅 퀴즈, 약점 분석까지 연결" />
            </div>
          </div>

          <div className="border-t border-slate-100 p-4">
            <TutorPublishForm
              programId={program.id}
              disabled={program.lessons.length === 0 || totalActivities === 0}
              activeStudentCount={activeStudentCount}
              classes={classes}
            />
          </div>
        </aside>
      </div>

      <div className="h-3 shrink-0 border-y border-slate-200/60 bg-[#E8EAEE]" />

      <section className="grid min-h-[360px] gap-4 bg-slate-50 px-5 py-5 xl:grid-cols-[360px_1fr]">
        <BuildQueue jobs={buildJobs} />
        <ProgramLessonBoard program={program} />
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
            <span className="text-[13px] font-medium text-slate-700">지문 분석 데이터 로딩 중...</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-center shadow-sm">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-black text-blue-700">{value}</p>
    </div>
  );
}

function FeatureRow({ Icon, title, detail }: { Icon: typeof BookOpen; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-blue-600">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-xs font-black text-slate-900">{title}</p>
        <p className="mt-0.5 text-[11px] font-medium leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function BuildQueue({ jobs }: { jobs: BuildJob[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">생성 작업</p>
          <p className="mt-1 text-xs font-medium text-slate-500">방금 실행한 모바일 학습 생성 작업입니다.</p>
        </div>
        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-500">
          {jobs.length}
        </Badge>
      </div>

      <div className="mt-4 space-y-2">
        {jobs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <Bot className="mx-auto size-6 text-slate-300" />
            <p className="mt-2 text-xs font-bold text-slate-400">지문을 선택하고 학습을 생성하면 여기에 표시됩니다.</p>
          </div>
        )}
        {jobs.map((job) => (
          <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2">
              {job.status === "generating" && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-blue-600" />}
              {job.status === "done" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
              {job.status === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
              <div className="min-w-0">
                <p className="line-clamp-1 text-xs font-black text-slate-900">{job.title}</p>
                <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">{job.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgramLessonBoard({ program }: { program: BuilderProgram }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">프로그램 구성</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            학생은 아래 지문 단위로 입장하고, 각 지문 안에서 훈련과 AI 채팅 퀴즈를 진행합니다.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full border-blue-100 bg-blue-50 text-blue-700">
          {program.lessons.length}개 지문
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {program.lessons.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
            <Sparkles className="mx-auto size-7 text-slate-300" />
            <p className="mt-3 text-sm font-black text-slate-500">아직 생성된 학습 지문이 없습니다.</p>
            <p className="mt-1 text-xs font-medium text-slate-400">왼쪽에서 분석 완료 지문을 선택해 모바일 학습을 만들어 주세요.</p>
          </div>
        )}

        {program.lessons.map((lesson, index) => {
          const modeCounts = lesson.activities.reduce((acc, activity) => {
            acc[activity.mode] = (acc[activity.mode] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          return (
            <article key={lesson.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-blue-600">지문 {index + 1}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-950">{lesson.title}</h3>
                  <p className="mt-2 line-clamp-3 text-xs font-medium leading-5 text-slate-500">{lesson.passageContent}</p>
                </div>
                <div className="shrink-0 rounded-xl bg-slate-50 px-2.5 py-2 text-center">
                  <p className="text-lg font-black text-slate-950">{lesson.activities.length}</p>
                  <p className="text-[10px] font-bold text-slate-400">활동</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {lesson.schoolName && <Badge variant="outline" className="rounded-full border-slate-200 text-slate-500">{lesson.schoolName}</Badge>}
                {lesson.grade && <Badge variant="secondary" className="rounded-full">{lesson.grade}학년</Badge>}
                {lesson.unit && <Badge variant="secondary" className="rounded-full">{lesson.unit}</Badge>}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {Object.entries(modeCounts).slice(0, 6).map(([mode, count]) => (
                  <div key={mode} className="rounded-lg bg-slate-50 px-2 py-1.5 text-center">
                    <p className="text-[10px] font-bold text-slate-400">{modeLabels[mode] ?? mode}</p>
                    <p className="text-xs font-black text-slate-800">{count}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {lesson.activities.slice(0, 7).map((activity) => (
                  <span key={activity.id} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                    {activityTypeLabels[activity.type] ?? activity.type}
                  </span>
                ))}
                {lesson.activities.length > 7 && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    +{lesson.activities.length - 7}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
