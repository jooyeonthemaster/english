"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  Users,
  CalendarClock,
  AlarmClock,
  Copy,
  Check,
  MapPin,
  Clock,
  Video,
  X,
  CheckCircle2,
  Gift,
  ExternalLink,
  Presentation,
  Headphones,
  BookOpen,
  Star,
  ChevronDown,
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

/** 프로토콜이 없는 링크는 상대경로로 해석되므로 https://를 보정한다. */
function toExternalUrl(url: string) {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** 문자열에서 첫 http(s) URL을 뽑는다(장소 필드에 넣은 지도 링크 감지용). */
function firstUrl(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function durationLabel(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `약 ${min}분`;
  const h = Math.round((min / 60) * 10) / 10;
  return `약 ${Number.isInteger(h) ? h : h.toFixed(1)}시간`;
}

/** 본문 속 URL을 클릭 가능한 링크로 변환(개행은 whitespace-pre-wrap로 유지). */
function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const nodes: React.ReactNode[] = [];
  const regex = /(https?:\/\/[^\s]+)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    let url = m[0];
    // 문장 끝 구두점은 링크에서 제외.
    let trailing = "";
    const tm = url.match(/[)\].,;:!?]+$/);
    if (tm) {
      trailing = tm[0];
      url = url.slice(0, -trailing.length);
    }
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-medium text-blue-600 underline hover:text-blue-700"
      >
        {url}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <p className={className}>{nodes}</p>;
}

/** 입금 계좌(은행+계좌번호) 클립보드 복사 버튼 — 복사 직후 잠깐 체크로 바뀐다. */
function CopyAccountButton({
  bankName,
  accountNumber,
}: {
  bankName: string;
  accountNumber: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${bankName} ${accountNumber}`);
          setCopied(true);
          toast.success("계좌번호를 복사했어요.");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("복사에 실패했습니다. 계좌번호를 직접 입력해주세요.");
        }
      }}
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-semibold transition-colors ${
        copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      }`}
      aria-label="계좌번호 복사"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

/** 긴 본문을 절반 높이로 접고 "펼치기/접기"로 확장. 내용이 짧으면 버튼 미노출. */
const COLLAPSED_MAX_HEIGHT = 208; // = max-h-52

function CollapsibleText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // max-height 애니메이션 목표. 펼침이 끝나면 "none"으로 풀어 내용이 잘리지 않게 한다.
  const [maxHeight, setMaxHeight] = useState<number | "none">(COLLAPSED_MAX_HEIGHT);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setNeedsToggle(el.scrollHeight > COLLAPSED_MAX_HEIGHT + 4);
  }, [text]);

  function expand() {
    const el = ref.current;
    if (!el) return;
    // 클릭 시점의 실측 높이로 애니메이션(폰트 로드 후라 값이 정확).
    setMaxHeight(el.scrollHeight);
    setExpanded(true);
  }
  function collapse() {
    const el = ref.current;
    if (!el) return;
    // "none" 상태에선 먼저 현재 높이로 고정한 뒤 다음 프레임에 축소해야 트랜지션이 걸린다.
    setMaxHeight(el.scrollHeight);
    requestAnimationFrame(() => {
      setExpanded(false);
      setMaxHeight(COLLAPSED_MAX_HEIGHT);
    });
  }

  return (
    <div>
      <div
        ref={ref}
        className="relative overflow-hidden transition-[max-height] duration-500 ease-in-out"
        style={{ maxHeight }}
        onTransitionEnd={(e) => {
          // 펼침이 끝나면 높이 제약을 완전히 풀어(none) 이후 리플로우로 잘리는 것을 막는다.
          if (e.target === e.currentTarget && expanded) setMaxHeight("none");
        }}
      >
        <LinkifiedText
          text={text}
          className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600"
        />
        {needsToggle && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-50 to-transparent" />
        )}
      </div>
      {needsToggle && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => (expanded ? collapse() : expand())}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
          >
            {expanded ? "접기" : "펼치기"}
            <ChevronDown
              className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 커버 이미지 (없으면 브랜드 플레이스홀더) ──────────────────────────────────
function Cover({
  seminar,
  className,
}: {
  seminar: GroupSeminarView;
  className?: string;
}) {
  if (seminar.coverImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={seminar.coverImageUrl}
        alt={seminar.title}
        className={`object-cover ${className ?? ""}`}
      />
    );
  }
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 text-slate-300 ${
        className ?? ""
      }`}
    >
      <Presentation className="size-8" strokeWidth={1.6} />
      <span className="text-[12px] font-semibold tracking-wide text-slate-400">
        SMOAT 단체 세미나
      </span>
    </div>
  );
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
  const mapUrl =
    seminar.mapUrl || firstUrl(seminar.location) || firstUrl(seminar.description);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: info */}
        <div className="order-2 lg:order-1 p-6 sm:p-7 space-y-5">
          {/* 신청 정보 — 신청을 마쳤다면 최상단에 노출 */}
          {isRegistered && (
            <MyRegistrationCard
              mine={mine!}
              seminar={seminar}
              bankAccount={bankAccount}
              onCancel={onCancel}
              isPending={isPending}
            />
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={statusOf(GROUP_SEMINAR_STATUSES, seminar.status)} />
              {seminar.capacity != null && (
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  선착순 {seminar.capacity}명
                </span>
              )}
            </div>
            <h2 className="whitespace-pre-line text-2xl font-bold leading-tight tracking-tight text-slate-900">
              {seminar.title}
            </h2>
            {seminar.summary && (
              <p className="whitespace-pre-line text-sm text-slate-500">
                {seminar.summary}
              </p>
            )}
          </div>

          {/* 참여자 혜택 — 관리자에서 편집. 문구가 있을 때만 노출 */}
          {seminar.benefit?.trim() && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-blue-700">
                <Gift className="size-4 shrink-0" />
                참여자 혜택
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {seminar.benefit}
              </p>
            </div>
          )}

          {/* CTA — 아직 신청 전일 때만 노출(신청 후엔 상단 카드가 대신함) */}
          {!isRegistered && (
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
          )}
        </div>

        {/* Right: cover */}
        <div className="order-1 lg:order-2 relative min-h-[200px] lg:min-h-full">
          <Cover seminar={seminar} className="absolute inset-0 h-full w-full" />
        </div>
    </div>
  );
}

// ─── 정보 타일 ────────────────────────────────────────────────────────────────
function InfoTiles({ seminar }: { seminar: GroupSeminarView }) {
  const mapUrl =
    seminar.mapUrl || firstUrl(seminar.location) || firstUrl(seminar.description);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {/* 일정 */}
      <Tile
        icon={<Clock className="size-4" />}
        title={`일정${seminar.durationMin ? ` (${durationLabel(seminar.durationMin)})` : ""}`}
      >
        {seminar.sessionDates && seminar.sessionDates.length > 0 ? (
          <div className="space-y-0.5">
            {seminar.sessionDates.map((d) => (
              <div key={d} className="text-[13px] font-semibold text-slate-700">
                {formatDateTime(new Date(d))}
              </div>
            ))}
            {seminar.sessionDates.length > 1 && (
              <div className="pt-0.5 text-[11px] text-slate-400">
                ※ 선택한 1개 일자만 신청됩니다.
              </div>
            )}
          </div>
        ) : (
          <div className="text-[13px] font-semibold text-slate-700">
            {seminar.scheduledAt ? formatDateTime(new Date(seminar.scheduledAt)) : "조율 중"}
          </div>
        )}
      </Tile>

      {/* 장소 */}
      <Tile icon={<MapPin className="size-4" />} title="장소">
        <div className="text-[13px] font-semibold text-slate-700 line-clamp-2">
          {seminar.location?.replace(/https?:\/\/[^\s]+/i, "").replace(/·\s*$/, "").trim() ||
            "추후 안내"}
        </div>
        {mapUrl && (
          <a
            href={toExternalUrl(mapUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
          >
            위치 확인 <ExternalLink className="size-2.5" />
          </a>
        )}
      </Tile>

      {/* 신청 마감 — 실시간 카운트다운. 모바일에선 좌우 꽉(2칸), 데스크톱은 1칸 */}
      <DeadlineTile seminar={seminar} />
    </div>
  );
}

// ─── 신청 마감 카운트다운 타일 ───────────────────────────────────────────────
// 가장 가까운(아직 열려 있는) 세션의 마감 시각까지 초 단위로 센다.
// SSR-클라이언트 불일치를 피하려고 마운트 후에만 시계를 렌더한다.
function DeadlineTile({ seminar }: { seminar: GroupSeminarView }) {
  // 열려 있는 세션 중 가장 이른 마감 시각
  const target = useMemo(() => {
    const times = seminar.sessions
      .filter((s) => !s.registrationClosed)
      .map((s) => new Date(s.closesAt).getTime())
      .filter((t) => Number.isFinite(t));
    return times.length ? Math.min(...times) : null;
  }, [seminar.sessions]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const capacityLabel =
    seminar.capacity != null
      ? `${seminar.sessions.length > 1 ? "일자별 " : ""}선착순 ${seminar.capacity}명`
      : "상시 모집";

  const remaining = target && now ? target - now : null;

  // 마감 시각이 없거나(상시 모집) 이미 지난 경우 — 기존의 차분한 타일로
  if (!target || (remaining !== null && remaining <= 0)) {
    return (
      <Tile
        icon={<CalendarClock className="size-4" />}
        title="신청 마감"
        className="col-span-2 lg:col-span-1"
      >
        <div className="text-[13px] font-semibold text-slate-700">
          {target ? "접수 마감" : capacityLabel}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          {seminar.registerCloseDays
            ? `실행 ${seminar.registerCloseDays}일 전까지 신청`
            : "정원이 차면 자동 마감"}
        </div>
      </Tile>
    );
  }

  const total = remaining !== null ? Math.floor(remaining / 1000) : null;
  const days = total !== null ? Math.floor(total / 86400) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock =
    total !== null
      ? `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
      : null;
  const isToday = days === 0;

  return (
    <div className="relative col-span-2 overflow-hidden rounded-xl border border-rose-100 bg-rose-50/60 p-4 lg:col-span-1">
      {/* 펄스 dot — 접수가 실시간 진행 중임을 알리는 신호 */}
      <span className="absolute right-3.5 top-3.5 flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
      </span>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-rose-500">
        <AlarmClock className="size-4" />
        <span className="truncate">신청 마감까지</span>
      </div>
      <div
        className={`flex flex-wrap items-baseline gap-x-1.5 font-bold text-rose-600 tabular-nums ${
          isToday ? "animate-pulse" : ""
        }`}
      >
        {clock === null ? (
          <span className="text-lg tracking-tight text-rose-300">--:--:--</span>
        ) : (
          <>
            {days! > 0 && <span className="text-[15px]">D-{days}</span>}
            <span className="text-lg tracking-tight">{clock}</span>
            {isToday && (
              <span className="text-[11px] font-semibold">오늘 마감!</span>
            )}
          </>
        )}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-rose-400">
        {capacityLabel} · 정원이 차면 조기 마감
      </div>
    </div>
  );
}

function Tile({
  icon,
  title,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-100 bg-slate-50/60 p-4 ${className ?? ""}`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
        <span className="text-blue-500">{icon}</span>
        <span className="truncate">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── 안내 카드(다루는 내용 / 추천 / 문의) ─────────────────────────────────────
function ContentCards({ seminar }: { seminar: GroupSeminarView }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-stretch">
      {/* 좌: 세미나 안내 (2칸 폭) */}
      {seminar.description && (
        <InfoCard
          icon={<BookOpen className="size-4" />}
          title="세미나 안내"
          className="lg:col-span-2"
        >
          <CollapsibleText text={seminar.description} />
        </InfoCard>
      )}

      {/* 우: 추천 + 문의를 위아래로 (1칸 폭) */}
      <div className="flex flex-col gap-3">
        {seminar.target && (
          <InfoCard icon={<Star className="size-4" />} title="이런 원장님께 추천합니다">
            <LinkifiedText
              text={seminar.target}
              className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600"
            />
          </InfoCard>
        )}
        <InfoCard
          icon={<Headphones className="size-4" />}
          title="문의 안내"
          className="flex-1"
        >
          <p className="text-[13px] leading-relaxed text-slate-600">
            세미나 관련 문의는 고객센터를 이용해 주세요.
          </p>
          <a
            href="/director/help/support"
            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            문의 게시판 바로가기 <ExternalLink className="size-3" />
          </a>
        </InfoCard>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-slate-50/60 p-5 ${className ?? ""}`}>
      <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
        <span className="text-blue-500">{icon}</span>
        {title}
      </div>
      {children}
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
            <p className="mt-0.5 text-[12px] text-slate-400 line-clamp-1">{seminar.title}</p>
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
                <ContentCards seminar={hero} />
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
