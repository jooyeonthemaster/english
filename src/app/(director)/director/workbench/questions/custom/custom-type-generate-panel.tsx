"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { PassageContentModal } from "@/components/workbench/passage-content-modal";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";

// ── 경계: 문제 생성(기본 UI)의 재사용 가능 컴포넌트를 import 만 한다(무수정). 지문 선택 UX를
//    "정확하게 똑같이" 맞추기 위해 PassageCardGrid·WorkspaceShell·타입을 그대로 차용. ──
import { PassageCardGrid } from "../../generate/passage-card-grid";
import { WorkspaceShell } from "../../generate/workspace-shell";
import type {
  FilterOptions,
  PassageAnalysisStatusFilter,
  PassageCollectionItem,
  PassageItem,
  PassageSortOrder,
} from "../../generate/generate-page-types";

import {
  builtinLabel,
  type CustomGenJob,
  type CustomGenQuestion,
  type CustomTypeListItem,
  DIFFICULTY_LABEL,
  formatTime,
  tierLabel,
} from "./custom-type-utils";

const POLL_INTERVAL_MS = 3000;

function isActive(status: CustomGenJob["status"]): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

export function CustomTypeGeneratePanel({ typesRefreshKey }: { typesRefreshKey: number }) {
  // ── 커스텀 유형 ──
  const [types, setTypes] = useState<CustomTypeListItem[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [countPerPassage, setCountPerPassage] = useState(1);
  const [gradeInfo, setGradeInfo] = useState("고3");
  const [submitting, setSubmitting] = useState(false);

  // ── 작업/결과 ──
  const [jobs, setJobs] = useState<CustomGenJob[]>([]);
  const [questions, setQuestions] = useState<CustomGenQuestion[]>([]);
  const loadSeq = useRef(0);

  // ── 지문 (문제 생성과 동일한 PassageCardGrid 데이터/상태) ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [collections, setCollections] = useState<PassageCollectionItem[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(true);

  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] =
    useState<PassageAnalysisStatusFilter>("all");
  const [passageSortOrder, setPassageSortOrder] = useState<PassageSortOrder>("newest");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [contentModalPassage, setContentModalPassage] = useState<PassageItem | null>(null);

  // ── 유형 목록 ──
  const loadTypes = useCallback(async () => {
    const res = await fetch("/api/custom-question-types", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { types: CustomTypeListItem[] };
    setTypes(json.types ?? []);
    setSelectedTypeId((cur) => cur ?? json.types?.[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes, typesRefreshKey]);

  // ── 지문 목록 (문제 생성과 동일한 /api/passages/list) ──
  const loadPassages = useCallback(async () => {
    setLoadingPassages(true);
    try {
      const res = await fetch("/api/passages/list", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      setPassages(data.passages || []);
      if (data.filters) setFilterOptions(data.filters);
      if (data.collections) setCollections(data.collections);
    } catch {
      /* ignore */
    } finally {
      setLoadingPassages(false);
    }
  }, []);

  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  // ── 필터/정렬 (문제 생성과 동일 로직) ──
  const filteredPassages = useMemo(() => {
    const result = passages.filter((p) => {
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (analysisStatusFilter === "analyzed" && !p.analysis) return false;
      if (analysisStatusFilter === "unanalyzed" && p.analysis) return false;
      if (
        selectedCollectionId &&
        !p.collectionItems?.some((ci) => ci.collectionId === selectedCollectionId)
      ) {
        return false;
      }
      return true;
    });

    switch (passageSortOrder) {
      case "oldest":
        result.reverse();
        break;
      case "name_asc":
        result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        break;
      case "name_desc":
        result.sort((a, b) => b.title.localeCompare(a.title, "ko"));
        break;
      default:
        break;
    }
    return result;
  }, [
    passages,
    passageSearch,
    filterSchool,
    filterGrade,
    filterSemester,
    analysisStatusFilter,
    selectedCollectionId,
    passageSortOrder,
  ]);

  const passageStatusCounts = useMemo(
    () => ({
      all: passages.length,
      analyzed: passages.filter((p) => !!p.analysis).length,
      unanalyzed: passages.filter((p) => !p.analysis).length,
    }),
    [passages],
  );

  const activeFilterCount =
    [filterSchool, filterGrade, filterSemester].filter(Boolean).length +
    (analysisStatusFilter === "all" ? 0 : 1);

  const toggleCheckbox = useCallback((id: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 상세 보기 — 지문 전체 내용 뷰어(분석/미분석 모두 동일 뷰어). 목록이 이미 content 를 갖고 있어 추가 조회 불필요.
  const handleOpenAnalysisModal = useCallback(
    (passageId: string) => {
      const p = passages.find((pp) => pp.id === passageId);
      if (p) setContentModalPassage(p);
    },
    [passages],
  );

  // ── 선택 유형의 잡 + 생성 문항 ──
  const loadJobsAndQuestions = useCallback(async (typeId: string) => {
    const seq = ++loadSeq.current;
    const [jobsRes, qRes] = await Promise.all([
      fetch(
        `/api/custom-question-types/generation-jobs?customTypeId=${encodeURIComponent(typeId)}&limit=20`,
        { credentials: "include", cache: "no-store" },
      ),
      fetch(
        `/api/custom-question-types/generations?customTypeId=${encodeURIComponent(typeId)}&limit=30`,
        { credentials: "include", cache: "no-store" },
      ),
    ]);
    const jobsData = jobsRes.ok ? ((await jobsRes.json()) as { jobs: CustomGenJob[] }) : null;
    const qData = qRes.ok ? ((await qRes.json()) as { questions: CustomGenQuestion[] }) : null;
    if (seq !== loadSeq.current) return;
    if (jobsData) setJobs(jobsData.jobs ?? []);
    if (qData) setQuestions(qData.questions ?? []);
  }, []);

  useEffect(() => {
    if (!selectedTypeId) {
      setJobs([]);
      setQuestions([]);
      return;
    }
    void loadJobsAndQuestions(selectedTypeId);
  }, [selectedTypeId, loadJobsAndQuestions]);

  const hasActiveJobs = useMemo(() => jobs.some((j) => isActive(j.status)), [jobs]);

  useEffect(() => {
    if (!hasActiveJobs || !selectedTypeId) return;
    const timer = setInterval(() => void loadJobsAndQuestions(selectedTypeId), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveJobs, selectedTypeId, loadJobsAndQuestions]);

  const selectedType = types.find((t) => t.id === selectedTypeId) ?? null;

  const run = useCallback(async () => {
    if (!selectedTypeId) {
      toast.error("커스텀 유형을 먼저 선택하세요.");
      return;
    }
    const passageIds = Array.from(selectedIds);
    if (passageIds.length === 0) {
      toast.error("동형을 입힐 지문을 1개 이상 선택하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/custom-question-types/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customTypeId: selectedTypeId, passageIds, countPerPassage, gradeInfo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "생성 요청에 실패했습니다.");
      toast.success(`생성 작업을 큐에 등록했어요. (지문 ${passageIds.length} × ${countPerPassage}개)`);
      await loadJobsAndQuestions(selectedTypeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "생성 요청에 실패했습니다.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedTypeId, selectedIds, countPerPassage, gradeInfo, loadJobsAndQuestions]);

  return (
    <div className="space-y-4 p-4">
      <WorkspaceShell
        leftLabel="지문"
        header={
          <WorkflowPageTitle
            icon={QuestionGenerationIcon}
            title="유형으로 생성"
            description="커스텀 유형을 고르고, 지문을 선택해 같은 출제 의도의 동형 문항을 생성합니다."
          />
        }
        left={
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
            passageSortOrder={passageSortOrder}
            setPassageSortOrder={setPassageSortOrder}
            passageStatusCounts={passageStatusCounts}
            activeFilterCount={activeFilterCount}
            selectedCollectionId={selectedCollectionId}
            setSelectedCollectionId={setSelectedCollectionId}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            toggleCheckbox={toggleCheckbox}
            selectAll={selectAll}
            deselectAll={deselectAll}
            genMode="manual"
            totalQuestions={0}
            handleBatchGenerate={() => {}}
            handleOpenAnalysisModal={handleOpenAnalysisModal}
            onViewPassageContent={setContentModalPassage}
          />
        }
        right={<GenerationConfigPanel
          types={types}
          selectedTypeId={selectedTypeId}
          setSelectedTypeId={setSelectedTypeId}
          selectedType={selectedType}
          selectedCount={selectedIds.size}
          countPerPassage={countPerPassage}
          setCountPerPassage={setCountPerPassage}
          gradeInfo={gradeInfo}
          setGradeInfo={setGradeInfo}
          submitting={submitting}
          onRun={run}
        />}
      />

      {/* 작업 큐 */}
      {jobs.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">작업 큐</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      ) : null}

      {/* 생성 결과 */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">생성한 문항</h3>
          <span className="text-[11px] text-slate-400">· {questions.length}건</span>
          {selectedTypeId ? (
            <button
              type="button"
              onClick={() => void loadJobsAndQuestions(selectedTypeId)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
            >
              <RefreshCcw className="size-3.5" />
              새로고침
            </button>
          ) : null}
        </div>
        {questions.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-slate-400">
            아직 생성한 문항이 없습니다. 유형과 지문을 골라 큐에 추가해 보세요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {questions.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
          </div>
        )}
      </section>

      <PassageContentModal
        open={!!contentModalPassage}
        onClose={() => setContentModalPassage(null)}
        passage={contentModalPassage}
      />
    </div>
  );
}

// ─────────────────────────── 우측 생성 설정 패널 ───────────────────────────
function GenerationConfigPanel({
  types,
  selectedTypeId,
  setSelectedTypeId,
  selectedType,
  selectedCount,
  countPerPassage,
  setCountPerPassage,
  gradeInfo,
  setGradeInfo,
  submitting,
  onRun,
}: {
  types: CustomTypeListItem[];
  selectedTypeId: string | null;
  setSelectedTypeId: (id: string) => void;
  selectedType: CustomTypeListItem | null;
  selectedCount: number;
  countPerPassage: number;
  setCountPerPassage: (n: number) => void;
  gradeInfo: string;
  setGradeInfo: (v: string) => void;
  submitting: boolean;
  onRun: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* 유형 선택 */}
        <div>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">
            커스텀 유형 선택
          </h3>
          {types.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-500">
              저장된 커스텀 유형이 없습니다. ‘유형 만들기’ 탭에서 먼저 유형을 만드세요.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTypeId(t.id)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    selectedTypeId === t.id
                      ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-300/30"
                      : "border-slate-200 bg-white hover:border-blue-200",
                  )}
                >
                  <span className="text-[13px] font-bold text-slate-800">{t.name}</span>
                  <span className="text-[10.5px] text-slate-400">
                    {builtinLabel(t.nearestBuiltin)} · 생성 {t.generatedCount}개
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 생성 옵션 */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-600">선택 지문</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-bold text-blue-600 ring-1 ring-blue-100">
              {selectedCount}개
            </span>
          </div>
          <label className="flex items-center justify-between text-[12px] text-slate-600">
            지문당 생성 개수
            <input
              type="number"
              min={1}
              max={10}
              value={countPerPassage}
              onChange={(e) => setCountPerPassage(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
            />
          </label>
          <label className="flex items-center justify-between text-[12px] text-slate-600">
            학년
            <input
              value={gradeInfo}
              onChange={(e) => setGradeInfo(e.target.value)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
            />
          </label>
        </div>
      </div>

      {/* 실행 (하단 고정) */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        {selectedType ? (
          <p className="mb-2 truncate text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">{selectedType.name}</span> ·{" "}
            {tierLabel(selectedType.nearestBuiltin ? "BUILTIN_OVERRIDE" : "GENERIC")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRun}
          disabled={submitting || !selectedTypeId || selectedCount === 0}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {submitting ? "등록 중…" : "동형 생성 큐에 추가"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── 작업 카드 ───────────────────────────
function JobCard({ job }: { job: CustomGenJob }) {
  const done = job.savedCount + job.skippedCount;
  const percent = job.totalCount > 0 ? Math.min(100, Math.round((done / job.totalCount) * 100)) : 0;
  const tone =
    job.status === "FAILED"
      ? "border-rose-200 bg-rose-50/60"
      : job.status === "COMPLETED"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-blue-200 bg-blue-50/50";

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-3", tone)}>
      <div className="flex items-center gap-1.5">
        {job.status === "PENDING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
            <Clock className="size-3" /> 대기 중
          </span>
        ) : job.status === "PROCESSING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700">
            <Loader2 className="size-3 animate-spin" /> 생성 중
          </span>
        ) : job.status === "COMPLETED" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
            <CheckCircle2 className="size-3" /> 완료
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
            <AlertCircle className="size-3" /> 실패
          </span>
        )}
        <span className="ml-auto text-[10.5px] text-slate-400 tabular-nums">{formatTime(job.createdAt)}</span>
      </div>

      {job.status === "PROCESSING" && job.totalCount > 0 ? (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[11px] font-medium text-blue-600 tabular-nums">
            {done}/{job.totalCount} 처리 · 저장 {job.savedCount}
            {job.skippedCount > 0 ? ` · 제외 ${job.skippedCount}` : ""}
          </p>
        </div>
      ) : job.status === "COMPLETED" ? (
        <p className="text-[11px] font-medium text-emerald-700 tabular-nums">
          {job.savedCount}개 생성
          {job.skippedCount > 0 ? ` · ${job.skippedCount}개 제외` : ""}
          {job.savedCount === 0 && job.errorMessage ? (
            <span className="mt-1 block font-normal text-slate-500">{job.errorMessage}</span>
          ) : null}
        </p>
      ) : job.status === "FAILED" ? (
        <p className="text-[11px] leading-relaxed text-rose-600 line-clamp-3" title={job.errorMessage ?? undefined}>
          {job.errorMessage ?? "생성에 실패했습니다."}
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          지문 {job.passageCount}개 × {job.countPerPassage}개 생성 대기 중
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── 문항 카드 ───────────────────────────
function QuestionCard({ question }: { question: CustomGenQuestion }) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = question.questionText.split("\n").find((l) => l.trim()) ?? question.questionText;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex flex-col items-start gap-1 text-left">
        <div className="flex w-full items-center gap-1.5">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
            {question.tier === "BUILTIN_OVERRIDE" ? builtinLabel(question.subType) : "범용"}
          </span>
          <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500">
            {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
          </span>
          <span className="ml-auto text-[10.5px] text-slate-400 tabular-nums">{formatTime(question.createdAt)}</span>
        </div>
        <p className="line-clamp-2 text-[12px] leading-snug text-slate-800">{firstLine}</p>
        {question.passageTitle ? (
          <span className="text-[10.5px] text-slate-400">지문: {question.passageTitle}</span>
        ) : null}
      </button>

      {expanded ? (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-800">
            {question.questionText}
          </pre>
          {question.options.length > 0 ? (
            <ol className="space-y-0.5">
              {question.options.map((o, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11.5px]",
                    String(o.label) === String(question.correctAnswer)
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
            <span className="text-blue-700">{question.correctAnswer}</span>
          </p>
          {question.explanation ? (
            <div className="rounded-md bg-amber-50/60 p-2 text-[11px] leading-relaxed text-slate-700">
              <span className="font-bold">해설: </span>
              {question.explanation}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
