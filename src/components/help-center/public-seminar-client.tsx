"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/help-center/status-badge";
import { registerGuestGroupSeminar } from "@/actions/public-seminar";
import type { GroupSeminarView } from "@/actions/help-center";
import { GROUP_SEMINAR_STATUSES, statusOf } from "@/lib/help-center";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users,
  CalendarClock,
  MapPin,
  Gift,
  ExternalLink,
  Presentation,
  CheckCircle2,
  X,
} from "lucide-react";

interface BankAccount {
  enabled: boolean;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

function toExternalUrl(url: string) {
  const t = url.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function firstUrl(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function Cover({ seminar }: { seminar: GroupSeminarView }) {
  if (seminar.coverImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={seminar.coverImageUrl} alt={seminar.title} className="h-44 w-full object-cover" />
    );
  }
  return (
    <div className="flex h-44 w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 text-slate-300">
      <Presentation className="size-8" strokeWidth={1.6} />
      <span className="text-[12px] font-semibold tracking-wide text-slate-400">
        SMOAT 단체 세미나
      </span>
    </div>
  );
}

export function PublicSeminarClient({
  seminars,
  bankAccount,
}: {
  seminars: GroupSeminarView[];
  bankAccount: BankAccount;
}) {
  const [applyTarget, setApplyTarget] = useState<GroupSeminarView | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  const open = seminars.filter((s) => !s.eventPassed);

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* 간단한 상단 바 */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
            SMOAT
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="text-[13px] font-medium text-slate-500 hover:text-slate-800"
            >
              로그인
            </Link>
            <Link
              href="/"
              aria-label="닫기"
              title="닫기"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            >
              <X className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">단체 세미나 신청</h1>
          <p className="mt-1 text-sm text-slate-500">
            회원이 아니어도 아래에서 바로 신청할 수 있습니다.
          </p>
        </div>

        {open.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <Users className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">현재 신청 가능한 단체 세미나가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {open.map((s) => (
              <SeminarCard
                key={s.id}
                seminar={s}
                submitted={submitted.has(s.id)}
                onApply={() => setApplyTarget(s)}
              />
            ))}
          </div>
        )}
      </main>

      {applyTarget && (
        <GuestApplyDialog
          seminar={applyTarget}
          bankAccount={bankAccount}
          onClose={() => setApplyTarget(null)}
          onDone={(id) => {
            setSubmitted((prev) => new Set(prev).add(id));
            setApplyTarget(null);
          }}
        />
      )}
    </div>
  );
}

function SeminarCard({
  seminar,
  submitted,
  onApply,
}: {
  seminar: GroupSeminarView;
  submitted: boolean;
  onApply: () => void;
}) {
  const mapUrl =
    seminar.mapUrl || firstUrl(seminar.location) || firstUrl(seminar.description);
  const canApply = seminar.registrationOpen && !submitted;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="relative">
        <Cover seminar={seminar} />
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={statusOf(GROUP_SEMINAR_STATUSES, seminar.status)} />
          {seminar.capacity != null && (
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              선착순 {seminar.capacity}명
            </span>
          )}
        </div>
        <h2 className="text-lg font-bold leading-tight text-slate-900">{seminar.title}</h2>
        {seminar.summary && <p className="text-sm text-slate-500">{seminar.summary}</p>}

        {/* 핵심 정보 */}
        <div className="space-y-1.5 text-sm text-slate-600">
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <span>
              {seminar.sessionDates.length > 0
                ? seminar.sessionDates.map((d) => formatDateTime(new Date(d))).join(" / ")
                : seminar.scheduledAt
                  ? formatDateTime(new Date(seminar.scheduledAt))
                  : "일정 조율 중"}
              {seminar.sessionDates.length > 1 && (
                <span className="text-slate-400"> · 하루 선택</span>
              )}
            </span>
          </div>
          {seminar.location && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <span>
                {seminar.location.split("·")[0]?.trim()}
                {mapUrl && (
                  <a
                    href={toExternalUrl(mapUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1.5 inline-flex items-center gap-0.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                  >
                    위치 확인 <ExternalLink className="size-3" />
                  </a>
                )}
              </span>
            </div>
          )}
        </div>

        {seminar.benefit?.trim() && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-blue-700">
              <Gift className="size-3.5" /> 참여자 혜택
            </div>
            <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-600">
              {seminar.benefit}
            </p>
          </div>
        )}

        {(seminar.depositAmount ?? 0) > 0 && (
          <p className="text-[12px] text-amber-700">
            참가 보증금 {seminar.depositAmount!.toLocaleString("ko-KR")}원 · 세미나 당일 환급
          </p>
        )}

        {submitted ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="size-4" /> 신청이 접수되었습니다.
          </div>
        ) : (
          <Button
            size="lg"
            className="h-12 w-full text-[15px] font-semibold sm:h-11"
            onClick={onApply}
            disabled={!canApply}
          >
            {canApply
              ? "세미나 신청하기"
              : seminar.eventPassed
                ? "종료된 세미나"
                : "신청이 마감되었습니다"}
          </Button>
        )}
      </div>
    </div>
  );
}

function GuestApplyDialog({
  seminar,
  bankAccount,
  onClose,
  onDone,
}: {
  seminar: GroupSeminarView;
  bankAccount: BankAccount;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [headCount, setHeadCount] = useState(1);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const depositAmount = seminar.depositAmount ?? 0;
  const hasDeposit = depositAmount > 0;
  const [depositorName, setDepositorName] = useState("");
  const [refundBank, setRefundBank] = useState("");
  const [refundAcct, setRefundAcct] = useState("");
  const [refundHolder, setRefundHolder] = useState("");

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
        toast.error("환급받을 계좌를 모두 입력해 주세요.");
        return;
      }
    }
    startTransition(async () => {
      try {
        const res = await registerGuestGroupSeminar(seminar.id, {
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
        onDone(seminar.id);
        void res;
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
        className={`flex max-h-[calc(100dvh_-_1.5rem)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl ${
          hasDeposit ? "max-w-3xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 고정 헤더 — 본문이 스크롤돼도 제목·닫기는 항상 보인다. */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">세미나 신청</h3>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-slate-400">{seminar.title}</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 스크롤 본문 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        <div
          className={
            hasDeposit ? "grid grid-cols-1 gap-3 lg:grid-cols-2" : "space-y-2.5"
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
                          <span className="text-[11px]">{closed ? "신청 마감" : "정원 마감"}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="g-name">이름</Label>
                <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-phone">연락처</Label>
                <Input
                  id="g-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-email">이메일 (선택)</Label>
                <Input id="g-email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-head">참석 인원</Label>
                <Input
                  id="g-head"
                  type="number"
                  min={1}
                  max={50}
                  value={headCount}
                  onChange={(e) => setHeadCount(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-academy">학원명 (선택)</Label>
              <Input
                id="g-academy"
                value={academyName}
                onChange={(e) => setAcademyName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-msg">문의·요청 (선택)</Label>
              <Textarea
                id="g-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="resize-y"
                placeholder="전달할 내용이 있으면 적어 주세요"
              />
            </div>
          </div>

          {/* 우: 참가 보증금 */}
          {hasDeposit && (
            <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
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
                  <div className="font-semibold text-slate-900">
                    {bankAccount.bankName} {bankAccount.accountNumber}
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
                <Label htmlFor="g-depositor">입금자명 (이 이름으로 입금 · 자동 확인)</Label>
                <Input
                  id="g-depositor"
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
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
        </div>

        {/* 하단 고정 액션 */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
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
