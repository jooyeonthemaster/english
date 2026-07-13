"use client";

// 단체 세미나 표시(프레젠테이션) 컴포넌트 모음.
// 회원용(group-seminar-browse-client) · 비회원용(public-seminar-client)이 같은 레이아웃을
// 공유하도록 히어로/정보 타일/안내 카드를 이 파일로 추출했다. 신청 로직은 각 클라이언트가 소유.

import { useEffect, useMemo, useRef, useState } from "react";
import type { GroupSeminarView } from "@/actions/help-center";
import { StatusBadge } from "@/components/help-center/status-badge";
import { GROUP_SEMINAR_STATUSES, statusOf } from "@/lib/help-center";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarClock,
  AlarmClock,
  Copy,
  Check,
  MapPin,
  Clock,
  ExternalLink,
  Presentation,
  Headphones,
  BookOpen,
  Star,
  ChevronDown,
  Gift,
} from "lucide-react";

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────
/** 프로토콜이 없는 링크는 상대경로로 해석되므로 https://를 보정한다. */
export function toExternalUrl(url: string) {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** 문자열에서 첫 http(s) URL을 뽑는다(장소 필드에 넣은 지도 링크 감지용). */
export function firstUrl(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

/** 세미나의 지도 링크 후보(mapUrl → 장소 → 본문 순). */
export function seminarMapUrl(seminar: GroupSeminarView): string | null {
  return seminar.mapUrl || firstUrl(seminar.location) || firstUrl(seminar.description);
}

function durationLabel(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `약 ${min}분`;
  const h = Math.round((min / 60) * 10) / 10;
  return `약 ${Number.isInteger(h) ? h : h.toFixed(1)}시간`;
}

/** 본문 속 URL을 클릭 가능한 링크로 변환(개행은 whitespace-pre-wrap로 유지). */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
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
export function CopyAccountButton({
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

export function CollapsibleText({ text }: { text: string }) {
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
export function Cover({
  seminar,
  className,
}: {
  seminar: GroupSeminarView;
  className?: string;
}) {
  if (seminar.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
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

// ─── 히어로(좌: 정보/CTA · 우: 커버) ─────────────────────────────────────────
// topSlot(신청 정보 카드 등)과 cta(신청 버튼 영역)는 각 클라이언트가 주입한다.
export function SeminarHero({
  seminar,
  topSlot,
  cta,
}: {
  seminar: GroupSeminarView;
  topSlot?: React.ReactNode;
  cta?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
      {/* Left: info */}
      <div className="order-2 space-y-5 p-6 sm:p-7 lg:order-1">
        {topSlot}

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
            <p className="whitespace-pre-line text-sm text-slate-500">{seminar.summary}</p>
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

        {cta}
      </div>

      {/* Right: cover */}
      <div className="relative order-1 min-h-[200px] lg:order-2 lg:min-h-full">
        <Cover seminar={seminar} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}

// ─── 정보 타일 ────────────────────────────────────────────────────────────────
export function InfoTiles({ seminar }: { seminar: GroupSeminarView }) {
  const mapUrl = seminarMapUrl(seminar);

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
        <div className="line-clamp-2 text-[13px] font-semibold text-slate-700">
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
            {isToday && <span className="text-[11px] font-semibold">오늘 마감!</span>}
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
    <div className={`rounded-xl border border-slate-100 bg-slate-50/60 p-4 ${className ?? ""}`}>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
        <span className="text-blue-500">{icon}</span>
        <span className="truncate">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── 안내 카드(다루는 내용 / 추천 / 문의) ─────────────────────────────────────
// support: 문의 안내 카드의 링크. 회원은 문의 게시판, 비회원은 로그인 등으로 분기.
export function ContentCards({
  seminar,
  support,
}: {
  seminar: GroupSeminarView;
  support: { href: string; label: string; description?: string };
}) {
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
        <InfoCard icon={<Headphones className="size-4" />} title="문의 안내" className="flex-1">
          <p className="text-[13px] leading-relaxed text-slate-600">
            {support.description ?? "세미나 관련 문의는 고객센터를 이용해 주세요."}
          </p>
          <a
            href={support.href}
            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            {support.label} <ExternalLink className="size-3" />
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
