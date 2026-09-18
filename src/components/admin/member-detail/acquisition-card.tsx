"use client";

// 회원 상세 개요 탭 「유입 경로」 카드 — 이 학원이 어디서 와서 가입했는지(최초·가입 직전 유입).
// 데이터: GET /api/admin/analytics/academy-acquisition?academyId=… (서버 액션 금지, I7)

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Compass } from "lucide-react";
import { SectionCard } from "@/components/admin/member-detail/atoms";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANNEL_COLORS, channelLabel, isChannel, sourceLabel } from "@/lib/analytics/channels";
import { analyticsStartLabel, signupVsTrackingStart } from "@/lib/analytics/tracking-start";
import type { AcademyAcquisition } from "@/lib/analytics/reports/academy-acquisition";

const DAY_MS = 86_400_000;

const KST_DATETIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtKst(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : KST_DATETIME.format(d);
}

async function fetchAcquisition(academyId: string): Promise<AcademyAcquisition> {
  const res = await fetch(
    `/api/admin/analytics/academy-acquisition?academyId=${encodeURIComponent(academyId)}`,
    { cache: "no-store", credentials: "same-origin" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `요청 실패 (${res.status})`);
  }
  return (await res.json()) as AcademyAcquisition;
}

export function AcquisitionCard({ academyId }: { academyId: string }) {
  const { data, isPending, error, refetch, isFetching } = useQuery<AcademyAcquisition, Error>({
    queryKey: ["admin-member-acquisition", academyId],
    queryFn: () => fetchAcquisition(academyId),
    staleTime: 60_000,
    retry: 1,
  });

  const sessionsHref = `/admin/analytics/sessions?academyId=${encodeURIComponent(academyId)}&all=1`;
  const action =
    data && data.sessions > 0 ? (
      <Link
        href={sessionsHref}
        className="inline-flex items-center gap-0.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
      >
        방문 기록 보기
        <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
      </Link>
    ) : undefined;

  return (
    <SectionCard title="유입 경로" icon={<Compass />} action={action}>
      {isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
          <span>유입 경로를 불러오지 못했습니다 · {error.message}</span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-300"
          >
            다시 시도
          </button>
        </div>
      ) : data ? (
        <AcquisitionBody data={data} />
      ) : null}
    </SectionCard>
  );
}

/**
 * 유입 기록이 없을 때의 이유 — 가입일이 수집 시작보다 앞서는지로 갈린다.
 * 시작일은 배포 시점 env(NEXT_PUBLIC_ANALYTICS_START_AT)에서 오고, 미설정이면
 * 단정하지 않고 두 가능성을 함께 적는다(하드코딩한 날짜를 쓰면 배포가 밀린 만큼 거짓이 된다).
 */
function emptyReason(academyCreatedAt: string | null, hasSessions: boolean): string {
  const verdict = signupVsTrackingStart(academyCreatedAt);
  const label = analyticsStartLabel();
  if (verdict === "before") {
    const when = label ? `유입 추적 시작(${label}) 이전 가입` : "유입 추적 시작 이전 가입";
    return hasSessions
      ? `가입 전 유입 기록이 없습니다 — ${when}입니다`
      : `${when}이라 방문 기록이 없습니다`;
  }
  if (verdict === "after") {
    return hasSessions
      ? "가입 전 유입 기록이 없습니다 — 다른 기기에서 가입했거나 방문 분석을 거부한 방문입니다"
      : "이 학원의 가입 전 방문 기록이 없습니다(다른 기기·차단·수동 가입)";
  }
  return hasSessions
    ? "가입 전 유입 기록이 없습니다 — 유입 추적 시작 이전 가입이거나 다른 기기에서 가입했습니다"
    : "유입 추적 시작 이전 가입이거나 방문 기록이 없습니다";
}

function AcquisitionBody({ data }: { data: AcademyAcquisition }) {
  if (!data.tracked) {
    return data.sessions === 0 ? (
      <p className="text-[13px] text-gray-500">{emptyReason(data.academyCreatedAt, false)}</p>
    ) : (
      <div className="space-y-1">
        <p className="text-[13px] text-gray-500">{emptyReason(data.academyCreatedAt, true)}</p>
        <p className="text-[12px] text-gray-400 tabular-nums">
          가입 후 방문 {data.sessions.toLocaleString("ko-KR")}회 · 최근 {fmtKst(data.lastSessionAt)}
        </p>
      </div>
    );
  }

  const first = data.first;
  const last = data.last;
  const daysToSignup =
    first?.firstSeenAt && data.academyCreatedAt
      ? Math.max(
          0,
          Math.floor(
            (new Date(data.academyCreatedAt).getTime() - new Date(first.firstSeenAt).getTime()) / DAY_MS,
          ),
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TouchBlock
          title="최초 유입"
          channel={first?.channel ?? null}
          source={first?.source ?? null}
          medium={first?.medium ?? null}
          campaign={first?.campaign ?? null}
          at={first?.firstSeenAt ?? null}
          extra={
            first && (first.referrerHost || first.landingPath) ? (
              <>
                {first.referrerHost && (
                  <div className="truncate" title={first.referrerHost}>
                    출처 {first.referrerHost}
                  </div>
                )}
                {first.landingPath && (
                  <div className="truncate font-mono text-[11px]" title={first.landingPath}>
                    진입 {first.landingPath}
                  </div>
                )}
              </>
            ) : null
          }
        />
        <TouchBlock
          title="가입 직전 유입"
          channel={last?.channel ?? null}
          source={last?.source ?? null}
          medium={null}
          campaign={last?.campaign ?? null}
          at={last?.startedAt ?? null}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-50">
        <Stat label="가입 전 방문" value={`${data.touchCountBeforeSignup.toLocaleString("ko-KR")}회`} />
        <Stat label="가입까지" value={daysToSignup === null ? "—" : `${daysToSignup}일`} />
        <Stat label="전체 방문" value={`${data.sessions.toLocaleString("ko-KR")}회`} />
        <Stat label="브라우저" value={`${data.visitors.toLocaleString("ko-KR")}개`} />
      </div>
      <p className="text-[11px] text-gray-400 tabular-nums">
        첫 방문 {fmtKst(data.firstSessionAt)} · 최근 방문 {fmtKst(data.lastSessionAt)} · 가입{" "}
        {fmtKst(data.academyCreatedAt)} · 내부 트래픽 제외
      </p>
    </div>
  );
}

function TouchBlock({
  title,
  channel,
  source,
  medium,
  campaign,
  at,
  extra,
}: {
  title: string;
  channel: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  at: string | null;
  extra?: ReactNode;
}) {
  const color = channel && isChannel(channel) ? CHANNEL_COLORS[channel] : "#cbd5e1";
  const utm = [medium, campaign].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/40 px-3.5 py-3">
      <div className="text-[11px] font-medium text-gray-400">{title}</div>
      <div className="mt-1 flex items-center gap-1.5 min-w-0">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-[14px] font-semibold text-gray-900 truncate">{channelLabel(channel)}</span>
        {source && <span className="text-[12px] text-gray-500 truncate">· {sourceLabel(source)}</span>}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[12px] text-gray-500 min-w-0">
        {utm && (
          <div className="truncate" title={utm}>
            {utm}
          </div>
        )}
        {extra}
        <div className="text-[11px] text-gray-400 tabular-nums">{fmtKst(at)}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="mt-0.5 text-[14px] font-semibold text-gray-800 tabular-nums">{value}</div>
    </div>
  );
}
