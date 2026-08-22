"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/help-center/status-badge";
import {
  createSeminarRequest,
  cancelSeminarRequest,
  type SeminarRequestView,
} from "@/actions/help-center";
import {
  SEMINAR_ONBOARDING_FREE_CREDITS,
  SEMINAR_STATUSES,
  statusOf,
} from "@/lib/help-center";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  Presentation,
  CalendarClock,
  CalendarDays,
  CalendarCheck2,
  X,
  Video,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Users,
  MessagesSquare,
  MonitorCheck,
  FileDown,
  ClipboardList,
  BookOpenCheck,
  Gift,
  MessageCircleQuestion,
} from "lucide-react";

interface Prefill {
  applicantName: string;
  phone: string;
  email: string;
  academyName: string;
}

const TIME_SLOTS = [
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
] as const;
const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MAX_WEEK_OFFSET = 3;

/** 프로토콜이 없는 링크(예: "www.smoat.co.kr")는 상대경로로 해석되므로 https://를 보정한다. */
function toExternalUrl(url: string) {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026.07.16 (수)" — 신청 내역·관리자 화면에 그대로 저장되는 표기 */
function formatFullDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} (${DOW[d.getDay()]})`;
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
      {n}
    </span>
  );
}

/** 단체 세미나 히어로의 Fact 타일과 동일한 스타일 */
function Fact({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-600">
      <span className="text-slate-400">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function GuideRow({
  icon,
  title,
  children,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
          <span className="text-blue-500">{icon}</span>
          {title}
        </div>
        {badge}
      </div>
      <div className="mt-0.5 break-keep pl-[22px] text-[13px] leading-snug text-slate-600">
        {children}
      </div>
    </div>
  );
}

export function SeminarClient({
  prefill,
  initialRequests,
  weeklyBooked,
  weeklyCapacity,
  heroImageUrl = null,
}: {
  prefill: Prefill;
  initialRequests: SeminarRequestView[];
  weeklyBooked: number;
  weeklyCapacity: number;
  /** 어드민(1:1 세미나 신청 관리)에서 설정한 히어로 이미지; 없으면 플레이스홀더 */
  heroImageUrl?: string | null;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [showApply, setShowApply] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 팝업 열림 동안 ESC로 닫기 (단체 세미나 ApplyDialog와 동일 관례)
  useEffect(() => {
    if (!showApply) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setShowApply(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showApply]);

  const [name, setName] = useState(prefill.applicantName);
  const [phone, setPhone] = useState(prefill.phone);
  const [email, setEmail] = useState(prefill.email);
  const [message, setMessage] = useState("");

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const today = useMemo(startOfToday, []);

  // 내일부터 7일씩 넘겨 보는 롤링 윈도우 — 과거 날짜는 아예 보여주지 않는다
  const weekDays = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() + 1 + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return { date: d, key: dateKey(d) };
    });
  }, [today, weekOffset]);

  // 선택은 key에서 복원 — 주를 넘겨도 선택한 날짜가 유지된다
  const selectedDate = useMemo(() => {
    if (!selectedDay) return null;
    const [y, m, d] = selectedDay.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDay]);

  const selectionLabel =
    selectedDate && selectedTime
      ? `${formatFullDate(selectedDate)} ${selectedTime}`
      : null;

  const remaining = Math.max(0, weeklyCapacity - weeklyBooked);
  const bookedPct = Math.min(
    100,
    Math.round((weeklyBooked / weeklyCapacity) * 100),
  );

  function submit() {
    if (!selectedDay || !selectedDate) {
      toast.error("희망 일정을 선택해주세요.");
      return;
    }
    if (!selectedTime) {
      toast.error("상담 시간을 선택해주세요.");
      return;
    }
    if (!name.trim() || !phone.trim()) {
      toast.error("담당자 이름과 연락처를 입력해주세요.");
      return;
    }
    const preferredTimes = `${formatFullDate(selectedDate)} ${selectedTime}`;
    startTransition(async () => {
      try {
        await createSeminarRequest({
          applicantName: name,
          phone,
          email: email || undefined,
          preferredChannel: "EITHER",
          preferredTimes,
          message: message || undefined,
        });
        toast.success(
          "세미나 신청이 접수되었습니다. 담당자가 일정 확인 후 연락드립니다.",
        );
        // 새로고침 대신 낙관적 추가 — 서버 재조회는 페이지 진입 시.
        setRequests((prev) => [
          {
            id: `temp-${prev.length}`,
            applicantName: name,
            phone,
            email: email || null,
            preferredChannel: "EITHER",
            preferredTimes,
            topic: null,
            message: message || null,
            status: "RECEIVED",
            scheduledAt: null,
            meetingUrl: null,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setSelectedDay(null);
        setSelectedTime(null);
        setMessage("");
        setShowApply(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  function cancel(id: string) {
    if (!confirm("신청을 취소하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await cancelSeminarRequest(id);
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "CANCELED" } : r)),
        );
        toast.success("신청이 취소되었습니다.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Presentation className="size-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">1:1 세미나 신청</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            우리 학원 상황에 맞춘 도입 상담을 예약하세요
          </p>
        </div>
      </div>

      {/* Hero — 단체 세미나 히어로와 같은 2단 구조 */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left: info */}
          <div className="order-2 space-y-5 p-6 sm:p-7 lg:order-1">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                예약 가능
              </span>
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">
                스모트 1:1 맞춤 세미나
              </h2>
              <p className="break-keep text-sm text-slate-500">
                원장님의 학원 상황과 목표에 맞춰 스모트 도입 효과와 활용 방안을
                제안드립니다.
              </p>
            </div>

            {/* Key facts */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact icon={<Video className="size-4" />}>
                온라인 Zoom · 60분
              </Fact>
              <Fact icon={<Users className="size-4" />}>
                원장님 또는 실무 담당자
              </Fact>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays className="size-4 text-slate-400" />
                    이번 주 {weeklyBooked}/{weeklyCapacity} 슬롯
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      remaining === 0 ? "text-rose-500" : "text-emerald-600"
                    }`}
                  >
                    {remaining === 0
                      ? "이번 주 마감"
                      : `남은 상담 슬롯 ${remaining}`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${bookedPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Feature chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { icon: MessagesSquare, label: "맞춤 컨설팅" },
                { icon: MonitorCheck, label: "실무 중심 상담" },
                { icon: FileDown, label: "도입 가이드 제공" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1.5 text-xs font-medium text-slate-600"
                >
                  <Icon className="size-3.5 text-blue-500" strokeWidth={1.9} />
                  {label}
                </span>
              ))}
            </div>

            {/* CTA */}
            <Button size="lg" onClick={() => setShowApply(true)}>
              <CalendarCheck2 className="size-4" />
              세미나 신청하기
            </Button>
          </div>

          {/* Right: cover — 어드민 설정 이미지, 없으면 단체 세미나 톤의 플레이스홀더 */}
          <div className="relative order-1 min-h-[200px] lg:order-2 lg:min-h-full">
            {heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroImageUrl}
                alt="스모트 1:1 맞춤 세미나"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 text-slate-300">
                <Presentation className="size-8" strokeWidth={1.6} />
                <span className="text-[12px] font-semibold tracking-wide text-slate-400">
                  SMOAT 1:1 맞춤 세미나
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Apply popup — 상담 예약 폼 + 상담 안내 (단체 세미나 ApplyDialog 관례) */}
      {showApply && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3"
          onClick={() => setShowApply(false)}
        >
          <div
            className="m-auto w-full max-w-6xl rounded-2xl bg-white px-5 py-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-slate-900">
                  <CalendarCheck2
                    className="size-4 text-blue-500"
                    strokeWidth={1.9}
                  />
                  상담 예약하기
                </h3>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  희망 일정을 선택하면 담당자가 확인 후 연락드립니다
                </p>
              </div>
              <button
                onClick={() => setShowApply(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 두 컬럼을 같은 높이로 stretch — 폼이 사이드바 높이에 맞춰 늘어난다 */}
            <div className="mt-1 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
              {/* Booking form */}
              <div className="flex min-w-0 flex-col">
                {/* Step 1: date */}
                <div className="space-y-2.5 border-b border-slate-100 py-3">
                  <div className="flex items-center gap-2">
                    <StepNumber n={1} />
                    <span className="text-sm font-semibold text-slate-700">
                      희망 일정
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setWeekOffset((v) => Math.max(0, v - 1))}
                      disabled={weekOffset === 0}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="이전 7일"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <div className="grid flex-1 grid-cols-7 gap-1.5">
                      {weekDays.map((d) => {
                        const active = selectedDay === d.key;
                        const dow = d.date.getDay();
                        // 일요일 빨강 · 토요일 파랑 — 선택 여부와 무관하게 유지
                        const dowColor =
                          dow === 0
                            ? "text-rose-500"
                            : dow === 6
                              ? "text-blue-500"
                              : active
                                ? "text-blue-500"
                                : "text-slate-400";
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => setSelectedDay(d.key)}
                            className={`flex flex-col items-center gap-0.5 rounded-xl border py-1.5 transition-colors ${
                              active
                                ? "border-blue-500 bg-blue-50/60 text-blue-600 ring-1 ring-blue-500"
                                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
                            }`}
                          >
                            <span className="text-[13px] font-semibold">
                              {d.date.getMonth() + 1}.{d.date.getDate()}
                            </span>
                            <span className={`text-[11px] ${dowColor}`}>
                              ({DOW[dow]})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setWeekOffset((v) => Math.min(MAX_WEEK_OFFSET, v + 1))
                      }
                      disabled={weekOffset === MAX_WEEK_OFFSET}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="다음 7일"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Step 2: time */}
                <div className="space-y-2.5 border-b border-slate-100 py-3">
                  <div className="flex items-center gap-2">
                    <StepNumber n={2} />
                    <span className="text-sm font-semibold text-slate-700">
                      상담 시간
                    </span>
                    <span className="text-xs font-normal text-slate-400">
                      (시간을 선택해주세요)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                    {TIME_SLOTS.map((t) => {
                      const active = selectedTime === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelectedTime(t)}
                          className={`rounded-xl border py-1.5 text-[13px] font-medium transition-colors ${
                            active
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  {selectionLabel && (
                    <p className="text-xs font-medium text-blue-600">
                      · 선택한 시간: {selectionLabel}
                    </p>
                  )}
                </div>

                {/* Step 3: contact */}
                <div className="space-y-2.5 border-b border-slate-100 py-3">
                  <div className="flex items-center gap-2">
                    <StepNumber n={3} />
                    <span className="text-sm font-semibold text-slate-700">
                      담당자 정보
                    </span>
                  </div>
                  {/* 이메일이 가장 기니 넓게 — 값이 잘리지 않게 비중 배분 */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1.1fr_1.6fr]">
                    <Input
                      className="h-9"
                      aria-label="이름"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름"
                    />
                    <Input
                      className="h-9"
                      aria-label="연락처"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="010-0000-0000"
                    />
                    <Input
                      className="h-9"
                      aria-label="이메일 (선택)"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="이메일 (선택)"
                    />
                  </div>
                  <div className="flex h-9 items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3.5">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-400">학원명</span>
                      <span className="font-medium text-slate-700">
                        {prefill.academyName || "-"}
                      </span>
                    </div>
                    <ChevronDown className="size-4 text-slate-300" />
                  </div>
                </div>

                {/* Step 4: message — 남는 세로 공간을 입력창이 채운다 */}
                <div className="flex flex-1 flex-col gap-2.5 py-3">
                  <div className="flex items-center gap-2">
                    <StepNumber n={4} />
                    <span className="text-sm font-semibold text-slate-700">
                      요청사항
                    </span>
                    <span className="text-xs font-normal text-slate-400">
                      (선택)
                    </span>
                  </div>
                  <div className="relative flex-1">
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 300))}
                      placeholder="상담 받고 싶은 내용이나 궁금한 점을 남겨주세요."
                      className="h-full min-h-[96px] resize-none pb-6"
                    />
                    <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] text-slate-300">
                      {message.length}/300
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="w-full"
                >
                  <CalendarClock className="size-4" />
                  {isPending ? "접수 중..." : "1:1 세미나 신청하기"}
                </Button>
                <p className="mt-1.5 text-center text-[11px] text-slate-400">
                  · 신청 완료 후 담당자가 일정 확인을 위해 연락드립니다.
                </p>
              </div>

              {/* Guide sidebar */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                <div className="flex items-center gap-1.5 border-b border-slate-200/70 pb-2.5 text-[14px] font-bold text-slate-900">
                  <MessageCircleQuestion
                    className="size-4 text-blue-500"
                    strokeWidth={1.9}
                  />
                  상담 안내
                </div>
                <div className="divide-y divide-slate-200/70">
                  <GuideRow
                    icon={<Video className="size-4" strokeWidth={1.9} />}
                    title="상담 방식"
                    badge={
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                        온라인
                      </span>
                    }
                  >
                    온라인 Zoom
                  </GuideRow>
                  <GuideRow
                    icon={<Clock className="size-4" strokeWidth={1.9} />}
                    title="소요 시간"
                  >
                    60분
                  </GuideRow>
                  <GuideRow
                    icon={<Users className="size-4" strokeWidth={1.9} />}
                    title="진행 대상"
                  >
                    원장님 또는 실무 담당자
                  </GuideRow>
                  <GuideRow
                    icon={
                      <BookOpenCheck className="size-4" strokeWidth={1.9} />
                    }
                    title="상담 내용"
                  >
                    문제 생성 · 시험지 제작 · 학습지 운영 흐름
                    <br />
                    스모트 도입 효과 · 활용 사례 · 맞춤 제안
                  </GuideRow>
                  <GuideRow
                    icon={
                      <ClipboardList className="size-4" strokeWidth={1.9} />
                    }
                    title="준비하면 좋은 자료"
                  >
                    현재 사용 중인 교재 / 시험지, 학원 운영 현황, 어려운 점이나
                    개선하고 싶은 부분
                  </GuideRow>
                </div>
                <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-2.5">
                  <Gift className="size-5 shrink-0 text-blue-500" />
                  <p className="break-keep text-[13px] font-medium text-slate-600">
                    <span className="font-bold text-blue-600">
                      {SEMINAR_ONBOARDING_FREE_CREDITS} 크레딧 무료 지급
                    </span>{" "}
                    — 온라인으로 사용 방법을 안내해 드리고, 세미나 진행 후 학원
                    계정으로 크레딧을 드립니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My requests */}
      {requests.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-semibold text-slate-500">내 신청 내역</h2>
          <div className="space-y-2.5">
            {requests.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-100 bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={statusOf(SEMINAR_STATUSES, r.status)}
                      />
                      <span className="text-sm font-medium">
                        1:1 맞춤 세미나
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      신청일 {formatDateTime(new Date(r.createdAt))}
                      {r.preferredTimes
                        ? ` · 희망 일정: ${r.preferredTimes}`
                        : ""}
                    </div>
                    {r.scheduledAt && (
                      <div className="flex items-center gap-1 text-xs font-medium text-violet-600">
                        <CalendarClock className="size-3.5" />
                        확정 일정: {formatDateTime(new Date(r.scheduledAt))}
                      </div>
                    )}
                    {r.topic && (
                      <div className="text-xs text-slate-500">
                        주제: {r.topic}
                      </div>
                    )}
                    {r.message && (
                      <div className="text-xs text-slate-500">
                        요청사항: {r.message}
                      </div>
                    )}
                    {r.meetingUrl && (
                      <a
                        href={toExternalUrl(r.meetingUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        <Video className="size-3.5" />
                        줌(Zoom) 화상 접속
                      </a>
                    )}
                  </div>
                  {r.status !== "DONE" &&
                    r.status !== "CANCELED" &&
                    !r.id.startsWith("temp-") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-rose-600"
                        onClick={() => cancel(r.id)}
                      >
                        <X className="size-3.5" />
                        취소
                      </Button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
