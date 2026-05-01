import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  FolderTree,
  GraduationCap,
  Layers,
  ListChecks,
  NotebookPen,
  PencilLine,
  SearchCheck,
  Sparkles,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn, formatKoreanDate, formatNumber } from "@/lib/utils";

type FolderKind = "passage" | "question" | "exam";

interface CollectionSnapshot {
  id: string;
  kind: FolderKind;
  name: string;
  parentId: string | null;
  color: string | null;
  items: number;
  children: number;
  updatedAt: Date;
  href: string;
}

interface UnifiedFolder {
  key: string;
  name: string;
  passage?: CollectionSnapshot;
  question?: CollectionSnapshot;
  exam?: CollectionSnapshot;
  totalItems: number;
  stageCount: number;
  updatedAt: Date;
}

interface DashboardData {
  sourceMaterialCount: number;
  recentExtractionJobs: {
    id: string;
    originalFileName: string | null;
    sourceType: string;
    mode: string;
    status: string;
    totalPages: number;
    successPages: number;
    failedPages: number;
    pendingPages: number;
    createdAt: Date;
  }[];
  content: {
    passages: number;
    analyzedPassages: number;
    pendingAnalysis: number;
    annotatedPassages: number;
    questions: number;
    aiQuestions: number;
    approvedQuestions: number;
    unapprovedQuestions: number;
    exams: number;
    draftExams: number;
    exportReadyExams: number;
  };
  folders: {
    unified: UnifiedFolder[];
    passage: CollectionSnapshot[];
    question: CollectionSnapshot[];
    exam: CollectionSnapshot[];
    unfiled: Record<FolderKind, number>;
  };
  recent: {
    sourceMaterials: {
      id: string;
      title: string;
      type: string;
      year: number | null;
      round: string | null;
      grade: number | null;
      createdAt: Date;
      _count: { passages: number; questions: number; exams: number };
    }[];
    passages: {
      id: string;
      title: string;
      grade: number | null;
      createdAt: Date;
      analysis: { id: string } | null;
      _count: { questions: number; notes: number };
    }[];
    questions: {
      id: string;
      questionText: string;
      type: string;
      approved: boolean;
      aiGenerated: boolean;
      createdAt: Date;
      passage: { title: string } | null;
    }[];
    exams: {
      id: string;
      title: string;
      status: string;
      createdAt: Date;
      _count: { questions: number };
    }[];
  };
}

const folderMeta: Record<
  FolderKind,
  {
    label: string;
    href: string;
    icon: LucideIcon;
    iconClass: string;
    chipClass: string;
  }
> = {
  passage: {
    label: "지문",
    href: "/director/workbench/passages",
    icon: FileText,
    iconClass: "bg-blue-50 text-blue-600",
    chipClass: "border-blue-100 bg-blue-50 text-blue-700",
  },
  question: {
    label: "문제",
    href: "/director/questions",
    icon: ListChecks,
    iconClass: "bg-sky-50 text-sky-600",
    chipClass: "border-sky-100 bg-sky-50 text-sky-700",
  },
  exam: {
    label: "시험지",
    href: "/director/exams",
    icon: GraduationCap,
    iconClass: "bg-cyan-50 text-cyan-600",
    chipClass: "border-cyan-100 bg-cyan-50 text-cyan-700",
  },
};

export default async function DirectorDashboardPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director");

  const data = await getWorkflowDashboardData(staff.academyId);

  const workflowStages = [
    {
      step: "01",
      title: "자료 추출",
      summary: "이미지와 PDF를 텍스트, 지문, 문제 원본으로 전환합니다.",
      href: "/director/workbench/passages/import",
      cta: "추출 시작",
      icon: FileUp,
      iconClass: "bg-slate-50 text-slate-600",
      borderClass: "hover:border-slate-300",
      stats: [
        { label: "원본 자료", value: data.sourceMaterialCount },
        { label: "최근 작업", value: data.recentExtractionJobs.length },
      ],
    },
    {
      step: "02",
      title: "지문 분석",
      summary: "추출된 텍스트를 불러와 필기와 AI 분석을 함께 쌓습니다.",
      href: "/director/workbench/passages",
      cta: "지문 열기",
      icon: NotebookPen,
      iconClass: "bg-blue-50 text-blue-600",
      borderClass: "hover:border-blue-300",
      stats: [
        { label: "분석 완료", value: data.content.analyzedPassages },
        { label: "필기 지문", value: data.content.annotatedPassages },
      ],
    },
    {
      step: "03",
      title: "문제 생성",
      summary: "분석된 지문과 필기 포인트를 기반으로 문제를 만듭니다.",
      href: "/director/workbench/generate",
      cta: "문제 생성",
      icon: WandSparkles,
      iconClass: "bg-sky-50 text-sky-600",
      borderClass: "hover:border-sky-300",
      stats: [
        { label: "AI 문제", value: data.content.aiQuestions },
        { label: "검수 대기", value: data.content.unapprovedQuestions },
      ],
    },
    {
      step: "04",
      title: "시험지·DOCX",
      summary: "검수한 문제를 시험지로 묶고 문서 파일로 내보냅니다.",
      href: "/director/exams",
      cta: "시험지 관리",
      icon: Download,
      iconClass: "bg-cyan-50 text-cyan-600",
      borderClass: "hover:border-cyan-300",
      stats: [
        { label: "시험지", value: data.content.exams },
        { label: "내보내기 가능", value: data.content.exportReadyExams },
      ],
    },
  ];

  const workQueue = [
    {
      title: "분석 대기 지문",
      count: data.content.pendingAnalysis,
      href: "/director/workbench/passages",
      icon: SearchCheck,
      tone: "blue" as const,
    },
    {
      title: "검수 대기 문제",
      count: data.content.unapprovedQuestions,
      href: "/director/questions?approved=false",
      icon: ClipboardCheck,
      tone: "sky" as const,
    },
    {
      title: "작성 중 시험지",
      count: data.content.draftExams,
      href: "/director/exams",
      icon: PencilLine,
      tone: "cyan" as const,
    },
  ];

  return (
    <div className="w-full px-6 md:px-10 py-8 flex flex-col gap-8 bg-slate-50/30">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-700">
            <Workflow className="size-3.5" />
            AI 콘텐츠 제작 허브
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-950">
            추출부터 DOCX까지 이어지는 출제 워크플로우
          </h1>
          <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-slate-500">
            {formatKoreanDate(new Date())} 기준으로 원본 자료, 지문 분석, 문제 생성,
            시험지 폴더를 한 화면에서 이어 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="h-10 rounded-md bg-slate-950 px-4 hover:bg-slate-800">
            <Link href="/director/workbench/passages/import">
              <FileUp className="size-4" />
              자료 추출
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-md bg-white px-4">
            <Link href="/director/workbench/generate">
              <Sparkles className="size-4" />
              문제 생성
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-md bg-white px-4">
            <Link href="/director/exams/create">
              <GraduationCap className="size-4" />
              시험지 만들기
            </Link>
          </Button>
        </div>
      </header>

      <section>
        <SectionHeading
          eyebrow="Main Flow"
          title="한 번에 이어지는 4단계"
          description="각 단계는 실제 작업 페이지로 바로 연결됩니다."
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {workflowStages.map((stage) => (
            <WorkflowStageCard key={stage.step} {...stage} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <UnifiedFolderBoard folders={data.folders.unified} />
        <ActionQueue items={workQueue} recentJobs={data.recentExtractionJobs} />
      </section>

      <section>
        <SectionHeading
          eyebrow="Library Control"
          title="지문·문제·시험지 폴더 통합 보기"
          description="서로 다른 폴더 구조를 같은 작업 단위로 맞춰볼 수 있게 묶었습니다."
        />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <FolderLane
            kind="passage"
            folders={data.folders.passage}
            unfiledCount={data.folders.unfiled.passage}
          />
          <FolderLane
            kind="question"
            folders={data.folders.question}
            unfiledCount={data.folders.unfiled.question}
          />
          <FolderLane
            kind="exam"
            folders={data.folders.exam}
            unfiledCount={data.folders.unfiled.exam}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <RecentSourceMaterials items={data.recent.sourceMaterials} />
        <RecentContentPanel data={data.recent} />
      </section>
    </div>
  );
}

async function getWorkflowDashboardData(academyId: string): Promise<DashboardData> {
  const [
    sourceMaterialCount,
    recentExtractionJobs,
    passages,
    analyzedPassages,
    pendingAnalysis,
    annotatedPassageIds,
    questions,
    aiQuestions,
    approvedQuestions,
    exams,
    draftExams,
    exportReadyExams,
    passageCollections,
    questionCollections,
    examCollections,
    unfiledPassages,
    unfiledQuestions,
    unfiledExams,
    recentSourceMaterials,
    recentPassages,
    recentQuestions,
    recentExams,
  ] = await Promise.all([
    prisma.sourceMaterial.count({ where: { academyId } }),
    prisma.extractionJob.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        originalFileName: true,
        sourceType: true,
        mode: true,
        status: true,
        totalPages: true,
        successPages: true,
        failedPages: true,
        pendingPages: true,
        createdAt: true,
      },
    }),
    prisma.passage.count({ where: { academyId } }),
    prisma.passage.count({ where: { academyId, analysis: { isNot: null } } }),
    prisma.passage.count({ where: { academyId, analysis: null } }),
    prisma.passageNote.findMany({
      where: { passage: { academyId } },
      distinct: ["passageId"],
      select: { passageId: true },
    }),
    prisma.question.count({ where: { academyId } }),
    prisma.question.count({ where: { academyId, aiGenerated: true } }),
    prisma.question.count({ where: { academyId, approved: true } }),
    prisma.exam.count({ where: { academyId } }),
    prisma.exam.count({ where: { academyId, status: "DRAFT" } }),
    prisma.exam.count({ where: { academyId, questions: { some: {} } } }),
    prisma.passageCollection.findMany({
      where: { academyId },
      include: { _count: { select: { items: true, children: true } } },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.questionCollection.findMany({
      where: { academyId },
      include: { _count: { select: { items: true, children: true } } },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.examCollection.findMany({
      where: { academyId },
      include: { _count: { select: { items: true, children: true } } },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.passage.count({ where: { academyId, collectionItems: { none: {} } } }),
    prisma.question.count({ where: { academyId, collectionItems: { none: {} } } }),
    prisma.exam.count({ where: { academyId, collectionItems: { none: {} } } }),
    prisma.sourceMaterial.findMany({
      where: { academyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        type: true,
        year: true,
        round: true,
        grade: true,
        createdAt: true,
        _count: { select: { passages: true, questions: true, exams: true } },
      },
    }),
    prisma.passage.findMany({
      where: { academyId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        grade: true,
        createdAt: true,
        analysis: { select: { id: true } },
        _count: { select: { questions: true, notes: true } },
      },
    }),
    prisma.question.findMany({
      where: { academyId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        questionText: true,
        type: true,
        approved: true,
        aiGenerated: true,
        createdAt: true,
        passage: { select: { title: true } },
      },
    }),
    prisma.exam.findMany({
      where: { academyId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
    }),
  ]);

  const passageSnapshots = passageCollections.map((collection) =>
    toCollectionSnapshot(collection, "passage")
  );
  const questionSnapshots = questionCollections.map((collection) =>
    toCollectionSnapshot(collection, "question")
  );
  const examSnapshots = examCollections.map((collection) =>
    toCollectionSnapshot(collection, "exam")
  );

  return {
    sourceMaterialCount,
    recentExtractionJobs,
    content: {
      passages,
      analyzedPassages,
      pendingAnalysis,
      annotatedPassages: annotatedPassageIds.length,
      questions,
      aiQuestions,
      approvedQuestions,
      unapprovedQuestions: Math.max(questions - approvedQuestions, 0),
      exams,
      draftExams,
      exportReadyExams,
    },
    folders: {
      unified: buildUnifiedFolders([
        ...passageSnapshots,
        ...questionSnapshots,
        ...examSnapshots,
      ]),
      passage: passageSnapshots,
      question: questionSnapshots,
      exam: examSnapshots,
      unfiled: {
        passage: unfiledPassages,
        question: unfiledQuestions,
        exam: unfiledExams,
      },
    },
    recent: {
      sourceMaterials: recentSourceMaterials,
      passages: recentPassages,
      questions: recentQuestions,
      exams: recentExams,
    },
  };
}

function toCollectionSnapshot(
  collection: {
    id: string;
    parentId: string | null;
    name: string;
    color: string | null;
    updatedAt: Date;
    _count: { items: number; children: number };
  },
  kind: FolderKind
): CollectionSnapshot {
  const query = `collectionId=${encodeURIComponent(collection.id)}`;
  const href =
    kind === "passage"
      ? `/director/workbench/passages?${query}`
      : kind === "question"
        ? `/director/questions?${query}`
        : `/director/exams?${query}`;

  return {
    id: collection.id,
    kind,
    name: collection.name,
    parentId: collection.parentId,
    color: collection.color,
    items: collection._count.items,
    children: collection._count.children,
    updatedAt: collection.updatedAt,
    href,
  };
}

function buildUnifiedFolders(collections: CollectionSnapshot[]): UnifiedFolder[] {
  const grouped = new Map<string, UnifiedFolder>();

  for (const collection of collections) {
    const key = normalizeFolderName(collection.name);
    const current =
      grouped.get(key) ??
      ({
        key,
        name: collection.name,
        totalItems: 0,
        stageCount: 0,
        updatedAt: collection.updatedAt,
      } satisfies UnifiedFolder);

    current[collection.kind] = collection;
    current.totalItems += collection.items;
    current.stageCount = ["passage", "question", "exam"].filter(
      (kind) => current[kind as FolderKind]
    ).length;
    if (collection.updatedAt > current.updatedAt) current.updatedAt = collection.updatedAt;

    grouped.set(key, current);
  }

  return [...grouped.values()]
    .sort((a, b) => {
      if (b.stageCount !== a.stageCount) return b.stageCount - a.stageCount;
      if (b.totalItems !== a.totalItems) return b.totalItems - a.totalItems;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, 7);
}

function normalizeFolderName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[18px] font-bold text-slate-900">{title}</h2>
      </div>
      <p className="max-w-[520px] text-[13px] leading-5 text-slate-500 md:text-right">
        {description}
      </p>
    </div>
  );
}

function WorkflowStageCard({
  step,
  title,
  summary,
  href,
  cta,
  icon: Icon,
  iconClass,
  borderClass,
  stats,
}: {
  step: string;
  title: string;
  summary: string;
  href: string;
  cta: string;
  icon: LucideIcon;
  iconClass: string;
  borderClass: string;
  stats: { label: string; value: number }[];
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[224px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover",
        borderClass
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex size-11 items-center justify-center rounded-md", iconClass)}>
          <Icon className="size-5" />
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold tabular-nums text-slate-500">
          {step}
        </span>
      </div>
      <h3 className="mt-4 text-[17px] font-bold text-slate-950">{title}</h3>
      <p className="mt-2 min-h-[42px] text-[13px] leading-5 text-slate-500">{summary}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-medium text-slate-400">{stat.label}</p>
            <p className="mt-1 text-[16px] font-bold tabular-nums text-slate-800">
              {formatNumber(stat.value)}
            </p>
          </div>
        ))}
      </div>
      <span className="mt-auto flex items-center gap-1 pt-4 text-[13px] font-semibold text-blue-600">
        {cta}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function UnifiedFolderBoard({ folders }: { folders: UnifiedFolder[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FolderTree className="size-4 text-slate-500" />
            <h2 className="text-[16px] font-bold text-slate-900">통합 작업 세트</h2>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            같은 이름의 지문·문제·시험지 폴더를 하나의 제작 단위로 묶었습니다.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md bg-slate-100 text-slate-600">
          최대 7개 표시
        </Badge>
      </div>

      <div className="mt-4 overflow-x-auto">
        {folders.length > 0 ? (
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(220px,1.25fr)_116px_116px_116px_148px] gap-2 border-b border-slate-100 px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              <span>작업 세트</span>
              <span>지문</span>
              <span>문제</span>
              <span>시험지</span>
              <span>다음 이동</span>
            </div>
            <div className="divide-y divide-slate-100">
              {folders.map((folder) => (
                <UnifiedFolderRow key={folder.key} folder={folder} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[188px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-[13px] text-slate-400">
            아직 폴더가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function UnifiedFolderRow({ folder }: { folder: UnifiedFolder }) {
  const action = getFolderNextAction(folder);

  return (
    <div className="grid grid-cols-[minmax(220px,1.25fr)_116px_116px_116px_148px] items-center gap-2 px-3 py-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[14px] font-semibold text-slate-900">{folder.name}</p>
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
            {folder.stageCount}/3
          </span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {(["passage", "question", "exam"] as FolderKind[]).map((kind) => (
            <span
              key={kind}
              className={cn(
                "h-1.5 w-8 rounded-full",
                folder[kind] ? "bg-blue-500" : "bg-slate-200"
              )}
            />
          ))}
        </div>
      </div>
      <FolderCell snapshot={folder.passage} kind="passage" />
      <FolderCell snapshot={folder.question} kind="question" />
      <FolderCell snapshot={folder.exam} kind="exam" />
      <Link
        href={action.href}
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-600"
      >
        {action.label}
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}

function FolderCell({
  snapshot,
  kind,
}: {
  snapshot?: CollectionSnapshot;
  kind: FolderKind;
}) {
  const meta = folderMeta[kind];
  if (!snapshot) {
    return <span className="text-[12px] text-slate-300">없음</span>;
  }

  return (
    <Link
      href={snapshot.href}
      className={cn(
        "inline-flex h-8 w-fit max-w-[104px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-colors hover:bg-white",
        meta.chipClass
      )}
    >
      <FolderOpen className="size-3.5 shrink-0" />
      <span className="truncate">{formatNumber(snapshot.items)}개</span>
    </Link>
  );
}

function getFolderNextAction(folder: UnifiedFolder) {
  if (!folder.passage) {
    return { label: "자료 추출", href: "/director/workbench/passages/import" };
  }
  if (!folder.question) {
    return { label: "문제 생성", href: "/director/workbench/generate" };
  }
  if (!folder.exam) {
    return { label: "시험지 구성", href: "/director/exams/create" };
  }
  return { label: "DOCX 내보내기", href: "/director/exams" };
}

function ActionQueue({
  items,
  recentJobs,
}: {
  items: {
    title: string;
    count: number;
    href: string;
    icon: LucideIcon;
    tone: "blue" | "sky" | "cyan";
  }[];
  recentJobs: DashboardData["recentExtractionJobs"];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 text-slate-500" />
        <h2 className="text-[16px] font-bold text-slate-900">이어 할 작업</h2>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2">
        {items.map((item) => (
          <QueueLink key={item.title} {...item} />
        ))}
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-400">
            최근 추출
          </p>
          <Link
            href="/director/workbench/passages/import"
            className="text-[12px] font-semibold text-blue-600 hover:text-blue-700"
          >
            새 추출
          </Link>
        </div>
        <div className="space-y-2">
          {recentJobs.length > 0 ? (
            recentJobs.slice(0, 3).map((job) => <ExtractionJobRow key={job.id} job={job} />)
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-[13px] text-slate-400">
              추출 작업이 아직 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueLink({
  title,
  count,
  href,
  icon: Icon,
  tone,
}: {
  title: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: "blue" | "sky" | "cyan";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    sky: "bg-sky-50 text-sky-600",
    cyan: "bg-cyan-50 text-cyan-600",
  }[tone];

  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/80 px-3 py-3 transition-colors hover:border-blue-200 hover:bg-white"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", toneClass)}>
          <Icon className="size-4" />
        </div>
        <span className="truncate text-[13px] font-semibold text-slate-700">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[16px] font-bold tabular-nums text-slate-900">
          {formatNumber(count)}
        </span>
        <ChevronRight className="size-4 text-slate-300 transition-colors group-hover:text-blue-500" />
      </div>
    </Link>
  );
}

function ExtractionJobRow({ job }: { job: DashboardData["recentExtractionJobs"][number] }) {
  const status = getExtractionStatus(job.status);
  const progress = job.totalPages > 0 ? Math.round((job.successPages / job.totalPages) * 100) : 0;

  return (
    <div className="rounded-md border border-slate-100 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-semibold text-slate-700">
          {job.originalFileName || `${job.sourceType} 추출`}
        </p>
        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", status.className)}>
          {status.label}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full", status.barClass)} style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-slate-400">
          {job.successPages}/{job.totalPages}
        </span>
      </div>
    </div>
  );
}

function getExtractionStatus(status: string) {
  switch (status) {
    case "COMPLETED":
      return {
        label: "완료",
        className: "bg-blue-50 text-blue-700",
        barClass: "bg-blue-500",
      };
    case "PARTIAL":
      return {
        label: "부분 완료",
        className: "bg-sky-50 text-sky-700",
        barClass: "bg-sky-500",
      };
    case "FAILED":
      return {
        label: "실패",
        className: "bg-red-50 text-red-700",
        barClass: "bg-red-500",
      };
    case "PROCESSING":
      return {
        label: "진행 중",
        className: "bg-blue-50 text-blue-700",
        barClass: "bg-blue-500",
      };
    case "CANCELLED":
      return {
        label: "취소",
        className: "bg-slate-100 text-slate-500",
        barClass: "bg-slate-400",
      };
    default:
      return {
        label: "대기",
        className: "bg-slate-100 text-slate-600",
        barClass: "bg-slate-400",
      };
  }
}

function FolderLane({
  kind,
  folders,
  unfiledCount,
}: {
  kind: FolderKind;
  folders: CollectionSnapshot[];
  unfiledCount: number;
}) {
  const meta = folderMeta[kind];
  const Icon = meta.icon;
  const topFolders = folders.slice(0, 5);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", meta.iconClass)}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold text-slate-900">{meta.label} 폴더</h3>
            <p className="text-[12px] text-slate-400">
              {formatNumber(folders.length)}개 폴더
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-md bg-white">
          <Link href={meta.href}>열기</Link>
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {topFolders.length > 0 ? (
          topFolders.map((folder) => (
            <Link
              href={folder.href}
              key={folder.id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-white"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-700">{folder.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  하위 폴더 {formatNumber(folder.children)}개
                </p>
              </div>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-slate-800">
                {formatNumber(folder.items)}
              </span>
            </Link>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-[13px] text-slate-400">
            폴더 없음
          </div>
        )}
      </div>
      <Link
        href={meta.href}
        className="mt-3 flex items-center justify-between rounded-md border border-dashed border-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-500 hover:border-blue-200 hover:text-blue-600"
      >
        <span>미분류 {meta.label}</span>
        <span className="tabular-nums">{formatNumber(unfiledCount)}개</span>
      </Link>
    </div>
  );
}

function RecentSourceMaterials({
  items,
}: {
  items: DashboardData["recent"]["sourceMaterials"];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-slate-500" />
          <h2 className="text-[16px] font-bold text-slate-900">최근 원본 자료</h2>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-md bg-white">
          <Link href="/director/workbench/passages/import">추출</Link>
        </Button>
      </div>
      <div className="mt-4 divide-y divide-slate-100">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-slate-800">{item.title}</p>
                <p className="mt-1 truncate text-[12px] text-slate-400">
                  {[item.year, item.round, item.grade ? `${item.grade}학년` : null, item.type]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <MiniCount label="지문" value={item._count.passages} />
                <MiniCount label="문제" value={item._count.questions} />
                <MiniCount label="시험" value={item._count.exams} />
              </div>
            </div>
          ))
        ) : (
          <div className="flex min-h-[190px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-[13px] text-slate-400">
            등록된 원본 자료가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex min-w-12 flex-col items-center rounded-md bg-slate-50 px-2 py-1">
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <span className="text-[12px] font-bold tabular-nums text-slate-700">{formatNumber(value)}</span>
    </span>
  );
}

function RecentContentPanel({ data }: { data: DashboardData["recent"] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-slate-500" />
        <h2 className="text-[16px] font-bold text-slate-900">최근 콘텐츠 흐름</h2>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RecentColumn
          title="지문"
          href="/director/workbench/passages"
          icon={FileText}
          rows={data.passages.map((item) => ({
            id: item.id,
            href: `/director/workbench/passages/${item.id}`,
            title: item.title,
            meta: item.analysis ? `분석 완료 · 문제 ${item._count.questions}개` : "분석 대기",
            badge: item._count.notes > 0 ? `필기 ${item._count.notes}` : undefined,
            muted: !item.analysis,
          }))}
        />
        <RecentColumn
          title="문제"
          href="/director/questions"
          icon={ListChecks}
          rows={data.questions.map((item) => ({
            id: item.id,
            href: `/director/questions/${item.id}`,
            title: cleanQuestionPreview(item.questionText),
            meta: item.passage?.title || item.type,
            badge: item.approved ? "검수 완료" : "검수 대기",
            muted: !item.approved,
          }))}
        />
        <RecentColumn
          title="시험지"
          href="/director/exams"
          icon={GraduationCap}
          rows={data.exams.map((item) => ({
            id: item.id,
            href: `/director/exams/${item.id}`,
            title: item.title,
            meta: `${item.status} · 문제 ${item._count.questions}개`,
            badge: item._count.questions > 0 ? "DOCX 가능" : undefined,
            muted: item._count.questions === 0,
          }))}
        />
      </div>
    </div>
  );
}

function RecentColumn({
  title,
  href,
  icon: Icon,
  rows,
}: {
  title: string;
  href: string;
  icon: LucideIcon;
  rows: { id: string; href: string; title: string; meta: string; badge?: string; muted?: boolean }[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-slate-400" />
          <p className="text-[13px] font-bold text-slate-700">{title}</p>
        </div>
        <Link href={href} className="text-[12px] font-semibold text-blue-600 hover:text-blue-700">
          전체
        </Link>
      </div>
      <div className="space-y-2">
        {rows.length > 0 ? (
          rows.slice(0, 4).map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="block rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-[13px] font-semibold text-slate-800">
                  {row.title}
                </p>
                {row.badge ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                      row.muted ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-700"
                    )}
                  >
                    {row.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-400">{row.meta}</p>
            </Link>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-[13px] text-slate-400">
            항목 없음
          </div>
        )}
      </div>
    </div>
  );
}

function cleanQuestionPreview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 80) || "문제 본문 없음";
}
