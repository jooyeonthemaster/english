import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Download,
  FileUp,
  NotebookPen,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

import { getStaffSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { TaskQueueHost } from "@/components/workbench/task-queue";

interface StageAction {
  label: string;
  href: string;
  variant: "primary" | "secondary";
}

interface WorkflowStage {
  step: string;
  title: string;
  flowLabel: string;
  flowDescription: string;
  flowResult: string;
  cardDescription: string;
  icon: LucideIcon;
  actions: StageAction[];
}

const workflowStages: WorkflowStage[] = [
  {
    step: "01",
    title: "자료 추출",
    flowLabel: "이미지/PDF 업로드",
    flowDescription: "스캔본, PDF, 문제지 사진을 올리면 지문과 문제 원본을 자동으로 분리합니다.",
    flowResult: "DB에 저장된 지문 자료",
    cardDescription: "이미지/PDF 파일에서 지문을 한 번에 추출하고 DB에 저장해 관리합니다.",
    icon: FileUp,
    actions: [
      {
        label: "자료 추출하기",
        href: "/director/workbench/extraction",
        variant: "primary",
      },
      {
        label: "추출된 자료 관리하기",
        href: "/director/workbench/extraction/jobs",
        variant: "secondary",
      },
    ],
  },
  {
    step: "02",
    title: "지문 분석",
    flowLabel: "AI 지문 분석",
    flowDescription: "저장된 지문을 불러와 핵심 어휘, 문법, 문장 구조, 출제 포인트를 뽑습니다.",
    flowResult: "출제 포인트가 정리된 지문",
    cardDescription: "핵심 어휘, 문법, 문장 구조와 출제 포인트를 AI로 분석합니다.",
    icon: NotebookPen,
    actions: [
      {
        label: "지문 분석하기",
        href: "/director/workbench/passages/create",
        variant: "primary",
      },
      {
        label: "분석된 지문 관리하기",
        href: "/director/workbench/passages",
        variant: "secondary",
      },
    ],
  },
  {
    step: "03",
    title: "문제 생성",
    flowLabel: "문제 대량 생성",
    flowDescription: "앞에서 찾은 출제 포인트를 바탕으로 내신형 문제를 원하는 수량만큼 생성합니다.",
    flowResult: "검수 가능한 문제 은행",
    cardDescription: "앞에서 도출한 출제 포인트로 문제를 한 번에 대량 생성할 수 있습니다.",
    icon: WandSparkles,
    actions: [
      {
        label: "문제 생성하기",
        href: "/director/workbench/questions/generate",
        variant: "primary",
      },
      {
        label: "생성된 문제 관리하기",
        href: "/director/workbench/questions",
        variant: "secondary",
      },
    ],
  },
  {
    step: "04",
    title: "시험지 생성",
    flowLabel: "시험지 생성",
    flowDescription: "생성한 문제를 골라 시험지로 묶고, 편집 가능한 DOCX 문서로 내보냅니다.",
    flowResult: "Word/한글 편집용 시험지",
    cardDescription: "생성한 문제를 시험지로 묶고 DOCX로 내려받아 Word/한글에서 바로 편집합니다.",
    icon: Download,
    actions: [
      {
        label: "시험지 생성",
        href: "/director/workbench/exams/create",
        variant: "primary",
      },
      {
        label: "시험지 관리",
        href: "/director/workbench/exams",
        variant: "secondary",
      },
    ],
  },
];

export default async function DirectorDashboardPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director");

  return (
    <TaskQueueHost defaultDomain="all">
      <div className="w-full space-y-4">
        <WorkflowOverview />

        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
          {workflowStages.map((stage) => (
            <WorkflowStageCard key={stage.step} {...stage} />
          ))}
        </div>
      </div>
    </TaskQueueHost>
  );
}

function WorkflowOverview() {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">
            Production Flow
          </p>
          <h2 className="mt-1 text-[18px] font-bold text-slate-950">
            이미지/PDF 자료가 시험지 문서로 완성되는 과정
          </h2>
        </div>
        <p className="max-w-[700px] text-[13px] leading-5 text-slate-500 xl:text-right">
          자료를 올리면 지문 DB가 만들어지고, AI 분석과 문제 생성을 거쳐 DOCX 시험지까지 이어집니다.
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-700">
          <span className="text-blue-700">이미지/PDF</span>
          <ArrowRight className="size-3.5 text-slate-400" />
          <span>지문 DB</span>
          <ArrowRight className="size-3.5 text-slate-400" />
          <span>AI 출제 포인트</span>
          <ArrowRight className="size-3.5 text-slate-400" />
          <span>대량 생성 문제</span>
          <ArrowRight className="size-3.5 text-slate-400" />
          <span className="text-blue-700">DOCX 시험지</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] xl:items-stretch">
        {workflowStages.map((stage, index) => (
          <div key={stage.step} className="contents">
            <FlowStep stage={stage} />
            {index < workflowStages.length - 1 && <FlowConnector />}
          </div>
        ))}
      </div>
    </section>
  );
}

function FlowStep({ stage }: { stage: WorkflowStage }) {
  const Icon = stage.icon;

  return (
    <div className="min-w-0">
      <div className="flex h-full min-h-[126px] flex-col rounded-lg border border-blue-100 bg-blue-50/45 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-blue-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <Icon className="size-3.5" />
            </span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-blue-700">
              {stage.step}
            </span>
            <span className="truncate text-[12px] font-bold text-slate-950">
              {stage.flowLabel}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-slate-600">{stage.flowDescription}</p>
        <div className="mt-auto pt-2">
          <p className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-blue-700">
            결과: {stage.flowResult}
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="hidden w-8 items-center justify-center xl:flex">
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-100 bg-white text-blue-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <ArrowRight className="size-4" />
      </div>
    </div>
  );
}

function WorkflowStageCard({
  step,
  title,
  cardDescription,
  icon: Icon,
  actions,
}: WorkflowStage) {
  return (
    <section className="relative flex min-h-[190px] flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_26px_rgba(15,23,42,0.07)]">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-blue-500" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon className="size-[18px]" />
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-500">
          {step}
        </span>
      </div>

      <div className="mt-4">
        <h3 className="text-[19px] font-bold text-slate-950">{title}</h3>
        <p className="mt-2 line-clamp-2 max-w-[680px] text-[13px] leading-5 text-slate-500">
          {cardDescription}
        </p>
      </div>

      <div className="mt-auto grid grid-cols-1 gap-2 pt-4 sm:grid-cols-2">
        {actions.map((action) => (
          <StageActionLink key={action.label} {...action} />
        ))}
      </div>
    </section>
  );
}

function StageActionLink({ label, href, variant }: StageAction) {
  return (
    <Link
      href={href}
      className={cn(
        "group/action flex h-10 items-center justify-between gap-3 rounded-lg px-3 text-[12px] font-semibold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        variant === "primary"
          ? "bg-blue-600 text-white shadow-[0_5px_14px_rgba(37,99,235,0.16)] hover:bg-blue-700"
          : "border border-blue-100 bg-blue-50/60 text-blue-700 hover:border-blue-200 hover:bg-white"
      )}
    >
      <span className="truncate">{label}</span>
      <ArrowRight
        className={cn(
          "size-3.5 shrink-0 transition-transform group-hover/action:translate-x-0.5",
          variant === "primary" ? "text-white/85" : "text-blue-500"
        )}
      />
    </Link>
  );
}
