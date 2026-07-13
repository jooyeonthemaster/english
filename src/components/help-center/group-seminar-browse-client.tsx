"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/help-center/status-badge";
import {
  registerGroupSeminar,
  cancelGroupSeminarRegistration,
  type GroupSeminarView,
} from "@/actions/help-center";
import { GROUP_SEMINAR_STATUSES, statusOf } from "@/lib/help-center";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  Cover,
  SeminarHero,
  InfoTiles,
  ContentCards,
  CopyAccountButton,
  seminarMapUrl,
  toExternalUrl,
} from "@/components/help-center/group-seminar-display";
import {
  Users,
  CalendarClock,
  AlarmClock,
  Video,
  X,
  CheckCircle2,
  Gift,
  ExternalLink,
} from "lucide-react";

interface Prefill {
  applicantName: string;
  phone: string;
  email: string;
  academyName: string;
}

interface BankAccount {
  enabled: boolean;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

// ─── 내 신청 정보 카드 ───────────────────────────────────────────────────────
// 신청을 마치면 히어로 최상단에 노출. 상단=참석 일시·인원, 하단=보증금 입금 상태.
// 토스 스타일: 흰 카드 + 상태 pill + 라벨/값 정렬, 군더더기 없음.
function MyRegistrationCard({
  mine,
  seminar,
  bankAccount,
  onCancel,
  isPending,
}: {
  mine: NonNullable<GroupSeminarView["myRegistration"]>;
  seminar: GroupSeminarView;
  bankAccount: BankAccount;
  onCancel: () => void;
  isPending: boolean;
}) {
  const waiting = mine.depositStatus === "WAITING";
  const paid = mine.depositStatus === "PAID";
  const canCancel = seminar.status === "OPEN" && !mine.id.startsWith("temp-");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* 상태 pill */}
      <div className="flex items-center gap-2">
        {waiting ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[12px] font-bold text-amber-700">
            <AlarmClock className="size-3.5" />
            입금 대기중
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-bold text-emerald-700">
            <CheckCircle2 className="size-3.5" />
            {paid ? "참석 확정" : "신청 완료"}
          </span>
        )}
      </div>

      {/* 상단 — 참석 일시 · 참여 인원 */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400">
            <CalendarClock className="size-4" />
            참석 일시
          </span>
          <span className="text-right text-[14px] font-bold text-slate-900">
            {mine.selectedDate ? formatDateTime(new Date(mine.selectedDate)) : "일정 조율 중"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400">
            <Users className="size-4" />
            참여 인원
          </span>
          <span className="text-right text-[14px] font-bold text-slate-900">
            {mine.headCount}명
          </span>
        </div>
      </div>

      {/* 하단 — 보증금 입금 대기 상태창 */}
      {waiting && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-amber-700">
            <AlarmClock className="size-4" />
            보증금 입금 대기중
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
            참가 보증금{" "}
            <b className="text-slate-900">
              {(seminar.depositAmount ?? 0).toLocaleString("ko-KR")}원
            </b>
            을 입금하면 자동으로 신청이 확정됩니다.
          </p>
          {bankAccount.enabled && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200/70 bg-white px-3 py-2 text-[13px] font-semibold text-slate-900">
              <span>
                {bankAccount.bankName} {bankAccount.accountNumber} · 예금주{" "}
                {bankAccount.accountHolder}
              </span>
              <CopyAccountButton
                bankName={bankAccount.bankName}
                accountNumber={bankAccount.accountNumber}
              />
            </div>
          )}
          <div className="mt-1.5 text-[11px] font-semibold text-amber-600">
            세미나 당일에 환급해 드립니다.
          </div>
        </div>
      )}

      {paid && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-700">
          보증금 입금이 확인되어 참석이 확정되었습니다.
        </div>
      )}

      {/* 액션 — 온라인 접속 · 신청 취소 */}
      {(seminar.meetingUrl || canCancel) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {seminar.meetingUrl && (
            <a
              href={toExternalUrl(seminar.meetingUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Video className="size-3.5" />
              온라인 접속
            </a>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              disabled={isPending}
              className="text-xs text-slate-400 hover:text-rose-600"
            >
              신청 취소
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 히어로(현재 모집/예정 세미나) ────────────────────────────────────────────
function Hero({
  seminar,
  bankAccount,
  onApply,
  onCancel,
  isPending,
}: {
  seminar: GroupSeminarView;
  bankAccount: BankAccount;
  onApply: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const mine = seminar.myRegistration;
  const isRegistered = mine != null && mine.status !== "CANCELED";
  const isFull = seminar.spotsLeft != null && seminar.spotsLeft <= 0;
  const canApply = seminar.registrationOpen && !isRegistered;
  const mapUrl = seminarMapUrl(seminar);

  return (
    <SeminarHero
      seminar={seminar}
      topSlot={
        isRegistered ? (
          <MyRegistrationCard
            mine={mine!}
            seminar={seminar}
            bankAccount={bankAccount}
            onCancel={onCancel}
            isPending={isPending}
          />
        ) : null
      }
      cta={
        !isRegistered ? (
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:justify-start">
            <Button
              size="lg"
              onClick={onApply}
              disabled={!canApply}
              className="h-12 w-full text-[15px] font-semibold sm:h-10 sm:w-auto sm:text-sm"
            >
              {canApply
                ? "세미나 신청하기"
                : seminar.eventPassed
                  ? "종료된 세미나"
                  : isFull
                    ? "정원이 마감되었습니다"
                    : "신청이 마감되었습니다"}
            </Button>
            {mapUrl && (
              <a
                href={toExternalUrl(mapUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                지도에서 위치 확인하기
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        ) : null
      }
    />
  );
}

// ─── 신청 모달 ────────────────────────────────────────────────────────────────
function ApplyDialog({
  seminar,
  prefill,
  bankAccount,
  onClose,
  onDone,
}: {
  seminar: GroupSeminarView;
  prefill: Prefill;
  bankAccount: BankAccount;
  onClose: () => void;
  onDone: (next: GroupSeminarView) => void;
}) {
  const [name, setName] = useState(prefill.applicantName);
  const [phone, setPhone] = useState(prefill.phone);
  const [email, setEmail] = useState(prefill.email);
  const [academyName, setAcademyName] = useState(prefill.academyName);
  const [headCount, setHeadCount] = useState(1);
  const [message, setMessage] = useState("");
  const [showMsg, setShowMsg] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 참가 보증금
  const depositAmount = seminar.depositAmount ?? 0;
  const hasDeposit = depositAmount > 0;
  const [depositorName, setDepositorName] = useState(prefill.applicantName);
  const [refundBank, setRefundBank] = useState("");
  const [refundAcct, setRefundAcct] = useState("");
  const [refundHolder, setRefundHolder] = useState(prefill.applicantName);

  const dateOptions = seminar.sessionDates ?? [];
  const needsDateChoice = dateOptions.length > 1;
  const [selectedDate, setSelectedDate] = useState<string | null>(
    dateOptions.length === 1 ? dateOptions[0] : null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    if (!name.trim() || !phone.trim()) {
      toast.error("이름과 연락처를 입력하세요.");
      return;
    }
    if (needsDateChoice && !selectedDate) {
      toast.error("참석하실 날짜를 선택해 주세요.");
      return;
    }
    if (hasDeposit) {
      if (!depositorName.trim()) {
        toast.error("입금자명을 입력해 주세요.");
        return;
      }
      if (!refundBank.trim() || !refundAcct.trim() || !refundHolder.trim()) {
        toast.error("환급받을 계좌(은행·계좌번호·예금주)를 모두 입력해 주세요.");
        return;
      }
    }
    startTransition(async () => {
      try {
        await registerGroupSeminar(seminar.id, {
          applicantName: name,
          phone,
          email: email || undefined,
          academyName: academyName || undefined,
          headCount,
          selectedDate,
          message: message || undefined,
          depositorName: hasDeposit ? depositorName : undefined,
          refundBankName: hasDeposit ? refundBank : undefined,
          refundAccountNumber: hasDeposit ? refundAcct : undefined,
          refundAccountHolder: hasDeposit ? refundHolder : undefined,
        });
        toast.success(
          hasDeposit
            ? "신청이 접수되었습니다. 안내된 계좌로 보증금을 입금해 주세요."
            : "세미나 신청이 완료되었습니다.",
        );
        const chosen = selectedDate ?? dateOptions[0] ?? null;
        onDone({
          ...seminar,
          registeredCount: seminar.registeredCount + headCount,
          spotsLeft:
            seminar.spotsLeft != null ? Math.max(0, seminar.spotsLeft - headCount) : null,
          sessions: seminar.sessions.map((x) =>
            x.date === chosen
              ? {
                  ...x,
                  registeredCount: x.registeredCount + headCount,
                  spotsLeft: x.spotsLeft != null ? Math.max(0, x.spotsLeft - headCount) : null,
                }
              : x,
          ),
          myRegistration: {
            id: `temp-${seminar.id}`,
            headCount,
            status: "REGISTERED",
            selectedDate: chosen,
            depositStatus: hasDeposit ? "WAITING" : "NONE",
          },
        });
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[calc(100dvh_-_1.5rem)] w-full overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-xl sm:p-5 ${
          hasDeposit ? "max-w-3xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">세미나 신청</h3>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-slate-400">{seminar.title}</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          className={
            hasDeposit ? "mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2" : "mt-3 space-y-2.5"
          }
        >
          {/* 좌: 참석 정보 */}
          <div className="space-y-2.5">
            {needsDateChoice && (
              <div className="space-y-1.5 rounded-xl border border-blue-100 bg-blue-50/40 p-2.5">
                <Label>참석 날짜 선택 (하루)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {dateOptions.map((d) => {
                    const info = seminar.sessions.find((x) => x.date === d);
                    const closed = info?.registrationClosed ?? false;
                    const full = info?.spotsLeft != null && info.spotsLeft <= 0;
                    const disabled = closed || full;
                    const active = selectedDate === d;
                    return (
                      <button
                        type="button"
                        key={d}
                        disabled={disabled}
                        onClick={() => setSelectedDate(d)}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 text-center text-[13px] transition-colors ${
                          disabled
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                            : active
                              ? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1 font-medium leading-tight">
                          {formatDateTime(new Date(d))}
                          {active && !disabled && <CheckCircle2 className="size-3.5" />}
                        </span>
                        {(closed || full) && (
                          <span className="text-[11px]">
                            {closed ? "신청 마감" : "정원 마감"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  하루만 선택해 참석하시면 됩니다. (일자별 정원 별도)
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="ap-name">이름</Label>
                <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-phone">연락처</Label>
                <Input
                  id="ap-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-academy">학원명 (선택)</Label>
                <Input
                  id="ap-academy"
                  value={academyName}
                  onChange={(e) => setAcademyName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-head">참석 인원</Label>
                <Input
                  id="ap-head"
                  type="number"
                  min={1}
                  max={50}
                  value={headCount}
                  onChange={(e) => setHeadCount(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
            {showMsg ? (
              <div className="space-y-1.5">
                <Label htmlFor="ap-msg">문의·요청 (선택)</Label>
                <Textarea
                  id="ap-msg"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="resize-y"
                  placeholder="전달할 내용이 있으면 적어 주세요"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowMsg(true)}
                className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
              >
                + 문의·요청 추가 (선택)
              </button>
            )}
          </div>
          {/* 우: 참가 보증금 */}
          {hasDeposit && (
            <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              {/* 강조 안내문 */}
              <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-[13px] font-bold text-amber-800">
                <Gift className="size-4 shrink-0" />
                세미나 당일에 환급해 드립니다.
              </div>
              <p className="text-[12.5px] leading-relaxed text-slate-600">
                참가 보증금{" "}
                <b className="text-slate-900">{depositAmount.toLocaleString("ko-KR")}원</b>을 아래
                계좌로 입금하시면 신청이 확정됩니다.
              </p>
              {bankAccount.enabled ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                    <span>
                      {bankAccount.bankName} {bankAccount.accountNumber}
                    </span>
                    <CopyAccountButton
                      bankName={bankAccount.bankName}
                      accountNumber={bankAccount.accountNumber}
                    />
                  </div>
                  <div className="text-[12px] text-slate-500">
                    예금주 {bankAccount.accountHolder}
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-slate-400">
                  입금 계좌는 신청 후 개별 안내드립니다.
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="ap-depositor">입금자명 (이 이름으로 입금 · 자동 확인)</Label>
                <Input
                  id="ap-depositor"
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>환급받을 계좌</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="은행"
                    value={refundBank}
                    onChange={(e) => setRefundBank(e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="계좌번호"
                    value={refundAcct}
                    onChange={(e) => setRefundAcct(e.target.value)}
                  />
                </div>
                <Input
                  placeholder="예금주"
                  value={refundHolder}
                  onChange={(e) => setRefundHolder(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "신청 중..." : "신청 완료"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────
export function GroupSeminarBrowseClient({
  prefill,
  initialSeminars,
  focusId,
  bankAccount,
}: {
  prefill: Prefill;
  initialSeminars: GroupSeminarView[];
  focusId?: string | null;
  bankAccount: BankAccount;
}) {
  const [seminars, setSeminars] = useState(initialSeminars);
  const [applyTarget, setApplyTarget] = useState<GroupSeminarView | null>(null);
  const [isPending, startTransition] = useTransition();
  const [highlightId, setHighlightId] = useState<string | null>(
    focusId && initialSeminars.some((s) => s.id === focusId) ? focusId : null,
  );

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`gs-${highlightId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { hero, otherUpcoming, past } = useMemo(() => {
    // 날짜가 모두 지난(eventPassed) 세미나는 상태와 무관하게 "지난 세미나"로.
    const isPast = (s: GroupSeminarView) =>
      s.status === "ENDED" || s.status === "CANCELED" || s.eventPassed;
    const upcoming = seminars.filter(
      (s) => (s.status === "OPEN" || s.status === "CLOSED") && !s.eventPassed,
    );
    // 히어로는 "지금 신청 가능한" 세미나 우선, 없으면 가장 임박한 예정 건.
    const heroSeminar =
      upcoming.find((s) => s.registrationOpen) ??
      upcoming.find((s) => s.status === "OPEN") ??
      upcoming[0] ??
      null;
    const others = upcoming.filter((s) => s.id !== heroSeminar?.id);
    const pastList = seminars
      .filter(isPast)
      .sort((a, b) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""));
    return { hero: heroSeminar, otherUpcoming: others, past: pastList };
  }, [seminars]);

  function update(next: GroupSeminarView) {
    setSeminars((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  }

  function cancelRegistration(seminar: GroupSeminarView) {
    const mine = seminar.myRegistration;
    if (!mine || mine.id.startsWith("temp-")) return;
    if (!confirm("신청을 취소하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await cancelGroupSeminarRegistration(mine.id);
        toast.success("신청이 취소되었습니다.");
        update({
          ...seminar,
          registeredCount: Math.max(0, seminar.registeredCount - mine.headCount),
          spotsLeft:
            seminar.spotsLeft != null ? seminar.spotsLeft + mine.headCount : null,
          sessions: seminar.sessions.map((x) =>
            x.date === mine.selectedDate
              ? {
                  ...x,
                  registeredCount: Math.max(0, x.registeredCount - mine.headCount),
                  spotsLeft: x.spotsLeft != null ? x.spotsLeft + mine.headCount : null,
                }
              : x,
          ),
          myRegistration: null,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-gray-900">단체 세미나 신청</h1>
        <p className="mt-0.5 text-[13px] text-gray-400">
          스모트가 여는 단체 세미나에 참여해 보세요
        </p>
      </div>

      {!hero && past.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-20 text-center">
          <Users className="mx-auto size-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">현재 모집 중인 단체 세미나가 없습니다.</p>
        </div>
      ) : (
        <>
          {hero ? (
            /* 하나의 흰색 카드로 묶어 "같은 한 세미나"로 읽히게 한다. */
            <div
              id={`gs-${hero.id}`}
              className={`overflow-hidden rounded-2xl border bg-card shadow-sm scroll-mt-24 transition-shadow ${
                highlightId === hero.id
                  ? "border-blue-400 ring-2 ring-blue-400 ring-offset-2"
                  : "border-border"
              }`}
            >
              <Hero
                seminar={hero}
                bankAccount={bankAccount}
                onApply={() => setApplyTarget(hero)}
                onCancel={() => cancelRegistration(hero)}
                isPending={isPending}
              />
              <div className="space-y-5 border-t border-slate-100 p-5 sm:p-6">
                <InfoTiles seminar={hero} />
                <ContentCards
                  seminar={hero}
                  support={{
                    href: "/director/help/support",
                    label: "문의 게시판 바로가기",
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 py-14 text-center">
              <p className="text-sm text-slate-400">현재 모집 중인 세미나가 없습니다.</p>
            </div>
          )}

          {/* 다른 진행 예정 */}
          {otherUpcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-500">다른 진행 예정 세미나</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {otherUpcoming.map((s) => (
                  <UpcomingCard
                    key={s.id}
                    seminar={s}
                    highlight={highlightId === s.id}
                    onApply={() => setApplyTarget(s)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 지난 세미나 */}
          {past.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold text-slate-500">지난 세미나</h2>
              <div className="space-y-2.5">
                {past.map((s) => (
                  <PastCard key={s.id} seminar={s} highlight={highlightId === s.id} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {applyTarget && (
        <ApplyDialog
          seminar={applyTarget}
          prefill={prefill}
          bankAccount={bankAccount}
          onClose={() => setApplyTarget(null)}
          onDone={update}
        />
      )}
    </div>
  );
}

// ─── 지난 세미나 카드 ─────────────────────────────────────────────────────────
function PastCard({ seminar, highlight }: { seminar: GroupSeminarView; highlight: boolean }) {
  return (
    <div
      id={`gs-${seminar.id}`}
      className={`flex items-center gap-4 rounded-2xl border bg-card p-3 scroll-mt-24 transition-shadow ${
        highlight ? "border-blue-400 ring-2 ring-blue-400 ring-offset-2" : "border-slate-100"
      }`}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl">
        <Cover seminar={seminar} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={statusOf(GROUP_SEMINAR_STATUSES, seminar.status)} />
          {seminar.myRegistration && seminar.myRegistration.status !== "CANCELED" && (
            <span className="text-[11px] font-semibold text-emerald-600">참석 신청함</span>
          )}
        </div>
        <div className="mt-1 truncate text-[14px] font-semibold text-slate-800">
          {seminar.title}
        </div>
        <div className="mt-0.5 text-[12px] text-slate-400">
          {seminar.scheduledAt ? formatDateTime(new Date(seminar.scheduledAt)) : "종료"}
          {seminar.location ? ` · ${seminar.location.split("·")[0]?.trim()}` : ""}
        </div>
      </div>
    </div>
  );
}

// ─── 진행 예정(히어로 외) 카드 ────────────────────────────────────────────────
function UpcomingCard({
  seminar,
  highlight,
  onApply,
}: {
  seminar: GroupSeminarView;
  highlight: boolean;
  onApply: () => void;
}) {
  const mine = seminar.myRegistration;
  const isRegistered = mine != null && mine.status !== "CANCELED";
  const isFull = seminar.spotsLeft != null && seminar.spotsLeft <= 0;
  const canApply = seminar.registrationOpen && !isRegistered;

  return (
    <div
      id={`gs-${seminar.id}`}
      className={`overflow-hidden rounded-2xl border bg-card scroll-mt-24 transition-shadow ${
        highlight ? "border-blue-400 ring-2 ring-blue-400 ring-offset-2" : "border-slate-100"
      }`}
    >
      <div className="relative h-28 w-full">
        <Cover seminar={seminar} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={statusOf(GROUP_SEMINAR_STATUSES, seminar.status)} />
          {isRegistered && (
            <span className="text-[11px] font-semibold text-emerald-600">신청함</span>
          )}
        </div>
        <div className="truncate text-[14px] font-bold text-slate-800">{seminar.title}</div>
        <div className="text-[12px] text-slate-400">
          {seminar.scheduledAt ? formatDateTime(new Date(seminar.scheduledAt)) : "일정 조율 중"}
          {seminar.capacity != null &&
            ` · ${seminar.registeredCount}/${seminar.capacity}명`}
        </div>
        <Button
          size="sm"
          variant={canApply ? "default" : "outline"}
          className="w-full"
          onClick={onApply}
          disabled={!canApply}
        >
          {isRegistered
            ? "신청 완료"
            : canApply
              ? "신청하기"
              : seminar.eventPassed
                ? "종료"
                : isFull
                  ? "정원 마감"
                  : "신청 마감"}
        </Button>
      </div>
    </div>
  );
}
