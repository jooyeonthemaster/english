import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  PlayCircle,
  Upload,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { getStaffSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Tone = "blue" | "emerald" | "amber" | "rose" | "slate";

interface WorkflowStep {
  step: number;
  title: string;
  count: string;
  helper: string;
  href: string;
  action: string;
  tone: Tone;
  icon: LucideIcon;
  progress: number;
}

interface JobItem {
  title: string;
  status: string;
  progress?: number;
  meta: string;
  tone: Tone;
}

interface AlertItem {
  title: string;
  body: string;
  time: string;
  tone: Tone;
}

interface RecentPassage {
  name: string;
  type: string;
  date: string;
  status: string;
  passages: string;
  topics: string[];
}

const workflowSteps: WorkflowStep[] = [
  {
    step: 1,
    title: "자료 업로드",
    count: "5개",
    helper: "업로드 완료",
    href: "/director/workbench/extraction",
    action: "새 자료 업로드",
    tone: "emerald",
    icon: Upload,
    progress: 100,
  },
  {
    step: 2,
    title: "지문 분석",
    count: "2 / 5",
    helper: "개 분석 완료",
    href: "/director/workbench/passages/create",
    action: "분석 시작",
    tone: "blue",
    icon: FileText,
    progress: 40,
  },
  {
    step: 3,
    title: "문제 생성",
    count: "3 / 6",
    helper: "세트 생성 완료",
    href: "/director/workbench/questions/generate",
    action: "문제 생성하기",
    tone: "amber",
    icon: Wand2,
    progress: 50,
  },
  {
    step: 4,
    title: "시험지 완성",
    count: "1 / 2",
    helper: "개 완성",
    href: "/director/workbench/exams/create",
    action: "시험지 만들기",
    tone: "slate",
    icon: ClipboardList,
    progress: 50,
  },
];

const jobs: JobItem[] = [
  {
    title: "2026-중2-1과 분석",
    status: "지문 분석 중",
    progress: 68,
    meta: "남은 시간 2분",
    tone: "blue",
  },
  {
    title: "중1-5과 문제 생성",
    status: "문제 생성 중",
    progress: 42,
    meta: "남은 시간 1분",
    tone: "blue",
  },
  {
    title: "2026-중3-기말 시험지",
    status: "시험지 생성 중",
    progress: 25,
    meta: "남은 시간 3분",
    tone: "blue",
  },
  {
    title: "어법 문제 생성",
    status: "대기 중",
    meta: "대기 순서 2번째",
    tone: "amber",
  },
];

const alerts: AlertItem[] = [
  {
    title: "검수 필요",
    body: "중2-1과 문제 세트에 AI 검수 결과 3개 항목이 남아 있습니다.",
    time: "10분 전",
    tone: "rose",
  },
  {
    title: "완료",
    body: "2026-중1-3과 지문 분석이 완료되었습니다.",
    time: "1시간 전",
    tone: "emerald",
  },
  {
    title: "완료",
    body: "중1-2과 문제 32문항 생성이 완료되었습니다.",
    time: "2시간 전",
    tone: "blue",
  },
  {
    title: "자료 부족",
    body: "중3-5과 어휘 리스트가 부족합니다.",
    time: "3시간 전",
    tone: "amber",
  },
];

const recentPassages: RecentPassage[] = [
  {
    name: "중2-1과_본문.pdf",
    type: "PDF",
    date: "2026.06.01 10:15",
    status: "분석 완료",
    passages: "3개",
    topics: ["환경", "도시 생활", "지속가능"],
  },
  {
    name: "중2-2과_본문.docx",
    type: "DOCX",
    date: "2026.05.31 16:40",
    status: "분석 중",
    passages: "-",
    topics: ["기술", "미래 사회"],
  },
  {
    name: "중1-5과_지문.txt",
    type: "TXT",
    date: "2026.05.30 14:22",
    status: "분석 완료",
    passages: "2개",
    topics: ["인물", "성장"],
  },
];

export default async function DirectorDashboardV2Page() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director/dashboard-v2");

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-2">
      <DashboardHeader staffName={staff.name} />

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-2">
          <NextActionPanel />
          <WorkflowPanel />
          <RecentWorkPanel />
        </div>
        <aside className="flex min-w-0 flex-col gap-2">
          <BackgroundJobsPanel />
          <AlertsPanel />
        </aside>
      </div>
    </div>
  );
}

function DashboardHeader({ staffName }: { staffName: string }) {
  return (
    <header className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
            Beta
          </span>
          <span className="text-[12px] font-semibold text-slate-500">
            {staffName} 선생님
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <h1 className="text-[23px] font-black leading-none text-slate-950">
            오늘의 내신대비
          </h1>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-600">
            중2 1학기 기말 D-14
          </span>
          <span className="text-[13px] font-semibold text-slate-500">
            2026.06.15
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/director"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          기존 대시보드
        </Link>
        <Link
          href="/director/workbench/passages/create"
          className="inline-flex h-8 items-center gap-2 rounded-lg bg-blue-600 px-3 text-[12px] font-bold text-white shadow-[0_8px_18px_rgba(37,99,235,0.18)] transition-colors hover:bg-blue-700"
        >
          <PlayCircle className="size-4" />
          빠른 시작
        </Link>
        <button
          type="button"
          aria-label="알림"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
        >
          <Bell className="size-4" />
        </button>
        <div className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700">
          <CalendarDays className="size-4 text-slate-400" />
          2026.06.01
        </div>
      </div>
    </header>
  );
}

function NextActionPanel() {
  return (
    <section className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="rounded-lg border border-emerald-100 bg-emerald-700 p-3 text-white shadow-sm">
        <div className="mb-2 inline-flex rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-bold">
          다음 추천 작업
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_86px] md:items-center">
          <div>
            <h2 className="text-[19px] font-black leading-tight">
              지문 분석 시작하기
            </h2>
            <p className="mt-1 text-[12px] font-medium leading-5 text-emerald-50">
              업로드된 2개 자료를 분석해 문제 생성 준비를 마무리하세요.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone="emerald">예상 10-15분</StatusPill>
              <StatusPill tone="emerald">선행 조건 충족</StatusPill>
            </div>
          </div>
          <div className="hidden justify-self-end md:block">
            <div className="relative h-[78px] w-[86px]">
              <div className="absolute left-1 top-6 h-12 w-10 rounded-md border border-white/40 bg-white/90 shadow-sm" />
              <div className="absolute left-6 top-1 h-16 w-12 rounded-md border border-white/50 bg-white shadow-md">
                <div className="mx-auto mt-3 h-1.5 w-7 rounded bg-blue-100" />
                <div className="mx-auto mt-2 h-5 w-8 rounded bg-emerald-100" />
                <div className="mx-auto mt-2 h-1.5 w-8 rounded bg-slate-100" />
              </div>
              <div className="absolute bottom-3 right-0 flex size-8 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-lg">
                <Eye className="size-4" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link
            href="/director/workbench/passages/create"
            className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[12px] font-bold text-white transition-colors hover:bg-blue-700"
          >
            지문 분석 시작
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/director/workbench/extraction/jobs"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-white px-4 text-[12px] font-bold text-slate-800 transition-colors hover:bg-emerald-50"
          >
            업로드한 자료 보기
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <h2 className="text-[15px] font-black text-slate-950">오늘의 요약</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <SummaryTile icon={Loader2} label="진행" value="3건" tone="blue" />
          <SummaryTile icon={Clock3} label="대기" value="2건" tone="amber" />
          <SummaryTile icon={CheckCircle2} label="완료" value="4건" tone="emerald" />
          <SummaryTile icon={AlertCircle} label="검수" value="1건" tone="rose" />
        </div>
      </div>
    </section>
  );
}

function WorkflowPanel() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-black text-slate-950">내신대비 흐름</h2>
        <span className="text-[12px] font-bold text-slate-500">준비율 62%</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {workflowSteps.map((step, index) => (
          <WorkflowStepCard
            key={step.title}
            step={step}
            showConnector={index < workflowSteps.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

function WorkflowStepCard({
  step,
  showConnector,
}: {
  step: WorkflowStep;
  showConnector: boolean;
}) {
  const Icon = step.icon;

  return (
    <div className="relative min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
      {showConnector && (
        <div className="absolute right-[-11px] top-1/2 hidden h-px w-[20px] bg-slate-200 xl:block" />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-6 items-center justify-center rounded-md text-[12px] font-black text-white", toneBg(step.tone))}>
            {step.step}
          </span>
          <h3 className="text-[13px] font-black text-slate-900">{step.title}</h3>
        </div>
        <Icon className={cn("size-4", toneText(step.tone))} />
      </div>
      <div className="mt-2">
        <p className="text-[23px] font-black leading-none text-slate-950">{step.count}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{step.helper}</p>
      </div>
      <ProgressBar value={step.progress} tone={step.tone} className="mt-2" />
      <Link
        href={step.href}
        className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[12px] font-bold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-50"
      >
        {step.action}
      </Link>
    </div>
  );
}

function RecentWorkPanel() {
  return (
    <section className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-black text-slate-950">최근 작업</h2>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold text-slate-500">
              <span className="rounded-md bg-white px-2 py-1 text-blue-700 shadow-sm">최근 지문</span>
              <span className="px-2 py-1">최근 문제</span>
              <span className="px-2 py-1">최근 시험지</span>
            </div>
          </div>
          <Link href="/director/workbench/passages" className="text-[12px] font-bold text-blue-700">
            모두 보기
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {recentPassages.slice(0, 2).map((item) => (
            <RecentPassageRow key={item.name} item={item} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="grid grid-cols-[66px_1fr] gap-3">
          <div className="flex h-[88px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <div className="h-[70px] w-[48px] rounded border border-slate-200 bg-white p-2 shadow-sm">
              <div className="mb-2 h-1.5 w-8 rounded bg-slate-200" />
              <div className="space-y-1">
                <div className="h-1 rounded bg-slate-100" />
                <div className="h-1 rounded bg-slate-100" />
                <div className="h-1 w-7 rounded bg-slate-100" />
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-500">최근 시험지 초안</p>
            <h3 className="mt-1 text-[14px] font-black leading-5 text-slate-950">
              2026 중2-1학기 기말 대비
            </h3>
            <div className="mt-2 flex flex-wrap gap-1">
              <StatusPill tone="emerald">완성</StatusPill>
              <StatusPill tone="slate">35문항</StatusPill>
              <StatusPill tone="slate">100점</StatusPill>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <IconButton href="/director/workbench/exams/create" label="미리보기" icon={Eye} />
              <IconButton href="/director/workbench/exams/create" label="다운로드" icon={Download} />
              <IconButton href="/director/workbench/exams" label="더보기" icon={MoreHorizontal} />
            </div>
          </div>
        </div>
        <Link
          href="/director/workbench/exams/create"
          className="mt-2 inline-flex h-7 w-full items-center justify-center rounded-lg bg-blue-600 text-[12px] font-bold text-white transition-colors hover:bg-blue-700"
        >
          시험지 편집하기
        </Link>
      </div>
    </section>
  );
}

function BackgroundJobsPanel() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-black text-slate-950">백그라운드 작업</h2>
        <button type="button" className="text-[12px] font-bold text-blue-700">
          모두 보기
        </button>
      </div>
      <div className="space-y-1.5">
        {jobs.map((job) => (
          <div key={job.title} className="rounded-lg border border-slate-100 bg-white p-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-black text-slate-900">{job.title}</p>
                <p className={cn("mt-0.5 text-[11px] font-bold", toneText(job.tone))}>{job.status}</p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-slate-500">{job.meta}</span>
            </div>
            {typeof job.progress === "number" && (
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar value={job.progress} tone={job.tone} />
                <span className="w-9 text-right text-[11px] font-bold text-slate-500">{job.progress}%</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertsPanel() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-black text-slate-950">최근 알림</h2>
        <button type="button" className="text-[12px] font-bold text-blue-700">
          모두 보기
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {alerts.map((alert) => (
          <div key={`${alert.title}-${alert.time}`} className="flex gap-2.5 py-2 first:pt-0 last:pb-0">
            <span className={cn("mt-1 size-2 rounded-full", toneBg(alert.tone))} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-[12px] font-black", toneText(alert.tone))}>{alert.title}</p>
                <span className="shrink-0 text-[11px] font-semibold text-slate-400">{alert.time}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-4 text-slate-600">{alert.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentPassageRow({ item }: { item: RecentPassage }) {
  return (
    <div className="grid gap-2 px-3 py-1.5 md:grid-cols-[1fr_92px_70px_1.1fr_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-black text-blue-700">
          {item.type}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-black text-slate-950">{item.name}</p>
          <p className="text-[11px] font-medium text-slate-500">업로드 {item.date}</p>
        </div>
      </div>
      <StatusPill tone={item.status === "분석 완료" ? "emerald" : "blue"}>{item.status}</StatusPill>
      <span className="text-[11px] font-bold text-slate-600">지문 {item.passages}</span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {item.topics.slice(0, 2).map((topic) => (
          <span key={topic} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
            {topic}
          </span>
        ))}
      </div>
      <button type="button" aria-label={`${item.name} 더보기`} className="justify-self-start text-slate-400 md:justify-self-end">
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone: Tone;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 items-center justify-center rounded-md text-white", toneBg(tone))}>
          <Icon className="size-3" />
        </span>
        <span className="text-[11px] font-bold text-slate-600">{label}</span>
      </div>
      <p className="mt-1 text-[15px] font-black leading-none text-slate-950">{value}</p>
    </div>
  );
}

function IconButton({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700"
    >
      <Icon className="size-4" />
    </Link>
  );
}

function ProgressBar({
  value,
  tone,
  className,
}: {
  value: number;
  tone: Tone;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cn("h-full rounded-full", toneBg(tone))} style={{ width: `${value}%` }} />
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: Tone }) {
  return (
    <span className={cn("inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-black", toneSoft(tone))}>
      {children}
    </span>
  );
}

function toneBg(tone: Tone) {
  return {
    blue: "bg-blue-600",
    emerald: "bg-emerald-600",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    slate: "bg-slate-600",
  }[tone];
}

function toneText(tone: Tone) {
  return {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    slate: "text-slate-700",
  }[tone];
}

function toneSoft(tone: Tone) {
  return {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];
}
