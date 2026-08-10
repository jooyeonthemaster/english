"use client";

// 학생 상세 허브 — 헤더 카드 (디자인 바이블 §2 slate/blue 언어).
// 뒤로가기 → /director/students(정본 로스터). 상태 변경·과제 배포·상담 기록
// 진입 내장. 퀵스탯은 onSelect 있으면 해당 탭으로 점프하는 버튼이 된다.

import { useTransition } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ClipboardList,
  ExternalLink,
  MessageSquarePlus,
  Phone,
  School,
} from "lucide-react";
import { toast } from "sonner";
import { openStudentAppSession, updateStudentStatus } from "@/actions/students";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import { CTA_LABELS } from "@/lib/wording/director-glossary";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface StudentHubHeaderData {
  id: string;
  name: string;
  status: string;
  studentCode: string;
  grade: number;
  phone: string | null;
  schoolName: string | null;
  classes: { id: string; name: string }[];
}

export interface HubQuickStat {
  label: string;
  value: string;
  tone?: PillTone;
  /** 보조 라인(예: "응시 3회") — 없으면 미렌더 */
  sub?: string;
  /** 있으면 셀이 버튼이 되어 해당 탭·필터로 점프 */
  onSelect?: () => void;
}

const STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  ACTIVE: { label: "재원", tone: "emerald" },
  PAUSED: { label: "휴원", tone: "slate" },
  WAITING: { label: "대기", tone: "violet" },
  WITHDRAWN: { label: "퇴원", tone: "rose" },
};

// 학생 코드는 상시 평문 노출(26-07-12 유저 확정) — 마스킹 정책 폐기.

/** 010-1234-5678 하이픈 포맷 — 11자리 아닐 땐 원문 유지 */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function StudentHubHeader({
  student,
  quickStats,
  lastActivityAt,
  isDirector,
  onOpenComposer,
  onGoTab,
}: {
  student: StudentHubHeaderData;
  quickStats: HubQuickStat[];
  /** 마지막 학습 활동 ISO(어법 시도·과제 완료 max) — null(신입생)이면 미렌더 */
  lastActivityAt?: string | null;
  isDirector: boolean;
  onOpenComposer: () => void;
  /** 헤더 퀵액션(상담 기록 등)의 탭 점프 */
  onGoTab: (tab: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [appOpening, startAppOpen] = useTransition();
  const statusMeta = STATUS_META[student.status] ?? STATUS_META.ACTIVE;

  // 이 학생의 /g 세션을 발급받아 새 탭으로 연다 — 팝업 차단 회피를 위해
  // 클릭 시점에 창을 먼저 열고, 발급 성공 후 주소를 넣는다.
  const openStudentApp = () => {
    const win = window.open("about:blank", "_blank");
    startAppOpen(async () => {
      const res = await openStudentAppSession(student.id);
      if (res.success) {
        if (win) win.location.href = "/g/home";
        else window.open("/g/home", "_blank");
        toast.success(`${student.name} 학생으로 학생 앱을 열었습니다.`);
      } else {
        win?.close();
        toast.error(res.error ?? "학생 앱을 열지 못했습니다.");
      }
    });
  };

  const changeStatus = (status: string) => {
    if (status === student.status) return;
    startTransition(async () => {
      const res = await updateStudentStatus(student.id, status);
      if (res.success) toast.success("학생 상태를 변경했습니다.");
      else toast.error(res.error ?? "상태 변경에 실패했습니다.");
    });
  };

  // 전화번호 탭 — 데스크톱은 클립보드 복사, 모바일 UA 는 다이얼러(tel:) 연결
  const handlePhoneClick = async () => {
    const phone = student.phone;
    if (!phone) return;
    if (typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
      window.location.href = `tel:${phone.replace(/\D/g, "")}`;
      return;
    }
    try {
      await navigator.clipboard.writeText(formatPhone(phone));
      toast.success("전화번호를 복사했습니다.");
    } catch {
      toast.error("복사하지 못했습니다. 전화번호를 직접 선택해 주세요.");
    }
  };

  // 7일 이상 무활동이면 rose 경고 톤
  const staleActivity = lastActivityAt
    ? Date.now() - new Date(lastActivityAt).getTime() >= 7 * 86_400_000
    : false;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/director/students"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            학생 목록
          </Link>
          {/* mr: 전역 작업 목록 플로팅 버튼(top-right fixed) 예약 코너 회피 */}
          <div className="mr-10 flex flex-wrap items-center justify-end gap-2 min-[1800px]:mr-0">
            {isDirector ? (
              <select
                value={student.status}
                disabled={pending}
                onChange={(e) => changeStatus(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-600 outline-none focus:border-blue-400 disabled:opacity-50"
                aria-label="학생 상태 변경"
              >
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => onGoTab("consult")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              상담 기록
            </button>
            {student.status === "ACTIVE" ? (
              <button
                type="button"
                disabled={appOpening}
                onClick={openStudentApp}
                title={`${student.name} 학생 계정으로 모바일 학습 앱을 새 탭에서 엽니다`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <ExternalLink className="size-4" aria-hidden />
                {appOpening ? "여는 중…" : "학생 앱 열기"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onOpenComposer}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <ClipboardList className="size-4" aria-hidden />
              {CTA_LABELS.SEND_TASK}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-600 ring-1 ring-blue-100"
            aria-hidden
          >
            {student.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{student.name}</h1>
              <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
              <span
                className="select-all rounded bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-500 ring-1 ring-slate-100"
                title="학생 앱 로그인 코드"
              >
                {student.studentCode}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <School className="size-4 text-slate-300" aria-hidden />
                {student.schoolName ?? "학교 미등록"} · {student.grade}학년
              </span>
              {student.phone ? (
                <button
                  type="button"
                  onClick={() => void handlePhoneClick()}
                  title="탭하면 전화번호를 복사합니다"
                  className="inline-flex items-center gap-1 rounded transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  <Phone className="size-4 text-slate-300" aria-hidden />
                  {formatPhone(student.phone)}
                </button>
              ) : null}
              {lastActivityAt ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    staleActivity && "font-semibold text-rose-600",
                  )}
                >
                  <Activity
                    className={cn("size-4", staleActivity ? "text-rose-400" : "text-slate-300")}
                    aria-hidden
                  />
                  마지막 학습 {formatRelativeTime(lastActivityAt)}
                </span>
              ) : null}
              {student.classes.length > 0 ? (
                <span className="flex items-center gap-1">
                  {student.classes.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500"
                    >
                      {c.name}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-[11px] text-slate-300">반 미배정</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 퀵 스탯 스트립 — onSelect 있는 셀은 해당 탭·필터로 점프하는 버튼 */}
      <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/50 sm:grid-cols-3 lg:grid-cols-6">
        {quickStats.map((s) => {
          const inner = (
            <>
              <span className="truncate text-[12px] font-medium text-slate-400">{s.label}</span>
              <span
                className={cn(
                  "truncate text-2xl font-bold tabular-nums",
                  s.tone === "emerald"
                    ? "text-emerald-600"
                    : s.tone === "rose"
                      ? "text-rose-600"
                      : s.tone === "blue"
                        ? "text-blue-600"
                        : "text-slate-900",
                )}
              >
                {s.value}
              </span>
              {s.sub ? (
                <span className="truncate text-[12px] tabular-nums text-slate-300">{s.sub}</span>
              ) : null}
            </>
          );
          return s.onSelect ? (
            <button
              key={s.label}
              type="button"
              onClick={s.onSelect}
              className="flex flex-col gap-1 px-5 py-4 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
            >
              {inner}
            </button>
          ) : (
            <div key={s.label} className="flex flex-col gap-1 px-5 py-4">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
