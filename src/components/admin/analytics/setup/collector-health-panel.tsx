"use client";

// ① 수집기 상태 — 최근 24h/7d 히트, 마지막 히트 시각, 호스트별 세션(테스트 데이터 표시),
// 이벤트 종류, 급증 점검, 누적 전환·추적 링크, analytics_* 테이블 용량. 기간·필터와 무관(전체 수집 기준).
//
// 수집 중단 감시가 이 패널의 존재 이유라 화면이 보이는 동안 60초마다 다시 조회하고(실시간 탭 10초
// 규약보다 느슨하다 — I5 위배 아님), 상대 시각·상태등은 응답 시각이 아니라 현재 시각으로 계산한다.
// 「마지막 히트」는 방문자 기기 시계(클라이언트 ts) 기준이다 — 서버 수신 시각이 아니다(D18 미적용분).

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SetupReport } from "@/lib/analytics/reports/setup";
import { fmtAgo, fmtDateTime, fmtInt, fmtPct } from "@/lib/analytics/format";
import { PRODUCTION_HOSTS } from "@/lib/analytics/sanitize";
import { cn } from "@/lib/utils";
import { BreakdownTable } from "../shared/breakdown-table";
import { KpiCard } from "../shared/kpi-card";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useReport } from "../shared/use-report";

type Level = "ok" | "warn" | "down";

/** 이 시간 넘게 이벤트가 없으면 노랑(트래픽이 적은 시간대일 수도 있어 경고만). */
const QUIET_WARN_MS = 60 * 60_000;

/** 화면이 보이는 동안 재조회 주기(react-query 가 탭이 숨으면 멈춘다). */
const POLL_MS = 60_000;

/** 상대 시각 갱신 주기 — 응답이 없어도 「N초 전」이 계속 흐른다. */
const TICK_MS = 1_000;

/** 단일 방문자 식별자가 24시간 히트의 이 비율 이상이면 위조·봇 의심(최소 표본 20건). */
const SPIKE_SHARE_WARN = 50;
const SPIKE_MIN_EVENTS = 20;

const TEST_HOSTS = new Set(["qa.seed", "localhost", "127.0.0.1"]);

type HostKind = "production" | "test" | "other";

function hostKind(hostname: string): HostKind {
  if (PRODUCTION_HOSTS.has(hostname)) return "production";
  if (TEST_HOSTS.has(hostname) || hostname.endsWith(".localhost")) return "test";
  return "other";
}

function collectorStatus(c: SetupReport["collector"], now: number): { level: Level; title: string; detail: string } {
  if (c.events24h === 0) {
    return {
      level: "down",
      title: "최근 24시간 수집 0건",
      detail: `배포 전이거나 수집이 멈췄습니다. 마지막 히트: ${c.lastEventAt ? `${fmtDateTime(c.lastEventAt)} (${fmtAgo(c.lastEventAt, now)})` : "기록 없음"}`,
    };
  }
  const lastMs = c.lastEventAt ? new Date(c.lastEventAt).getTime() : 0;
  if (!lastMs || now - lastMs > QUIET_WARN_MS) {
    return {
      level: "warn",
      title: "최근 1시간 수집 없음",
      detail: `마지막 히트 ${c.lastEventAt ? fmtAgo(c.lastEventAt, now) : "기록 없음"}. 방문이 적은 시간대이거나, 방문자 기기 시계가 느려 히트 시각이 과거로 기록됐을 수 있습니다 — 계속되면 공개 페이지를 열어 /api/collect 요청이 나가는지 확인하세요.`,
    };
  }
  const hasProduction = c.hostnames.some((h) => hostKind(h.hostname) === "production");
  if (!hasProduction) {
    return {
      level: "warn",
      title: "운영 도메인 수집 0건(최근 7일)",
      detail: "수집은 동작하지만 smoat.co.kr 방문이 없습니다. 테스트·로컬 데이터만 쌓여 있거나 운영 배포 전입니다.",
    };
  }
  return {
    level: "ok",
    title: "정상 수집 중",
    detail: `마지막 히트 ${fmtAgo(c.lastEventAt, now)}(방문자 기기 시계 기준) · 최근 24시간 이벤트 ${fmtInt(c.events24h)}건`,
  };
}

const LEVEL_STYLE: Record<Level, { box: string; dot: string; text: string; label: string }> = {
  ok: { box: "border-emerald-100 bg-emerald-50/60", dot: "bg-emerald-500", text: "text-emerald-800", label: "정상" },
  warn: { box: "border-amber-100 bg-amber-50/70", dot: "bg-amber-400", text: "text-amber-800", label: "주의" },
  down: { box: "border-rose-100 bg-rose-50", dot: "bg-rose-500", text: "text-rose-700", label: "경고" },
};

const HOST_BADGE: Record<HostKind, { label: string; className: string }> = {
  production: { label: "운영", className: "bg-emerald-50 text-emerald-700" },
  test: { label: "테스트 데이터", className: "bg-amber-50 text-amber-700" },
  other: { label: "비운영 호스트", className: "bg-gray-100 text-gray-500" },
};

function eventLabel(r: { type: string; name: string | null }): string {
  if (r.type === "pageview") return "페이지뷰";
  return r.name ? r.name : `${r.type} (이름 없음)`;
}

/** 현재 시각을 주기적으로 갱신 — 화면을 띄워둔 채로도 상대 시각·상태등이 얼지 않는다. */
function useNowTick(intervalMs = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function CollectorHealthPanel() {
  const { data, error, isLoading, isFetching, refetch } = useReport<SetupReport>("setup", {
    refetchInterval: POLL_MS,
  });

  return (
    <Section
      title="수집기 상태"
      description="기간·필터와 무관한 전체 수집 기준(관리자·로컬 등 내부 트래픽 포함) · 화면이 보이는 동안 60초마다 자동 갱신"
      right={
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} aria-hidden />
          새로고침
        </button>
      }
    >
      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={5} />}
      {data && <CollectorBody data={data} />}
    </Section>
  );
}

function CollectorBody({ data }: { data: SetupReport }) {
  // 「N초 전」·상태등은 응답 시각이 아니라 지금 시각 기준(화면을 띄워두면 계속 흐른다).
  const now = useNowTick();
  const c = data.collector;
  const status = collectorStatus(c, now);
  const style = LEVEL_STYLE[status.level];
  const listedSessions = c.hostnames.reduce((s, h) => s + h.sessions, 0);
  const testSessions = c.hostnames.filter((h) => hostKind(h.hostname) === "test").reduce((s, h) => s + h.sessions, 0);
  const testShare = listedSessions > 0 ? Math.round((testSessions / listedSessions) * 1000) / 10 : 0;
  const noConversions = data.conversions.signup + data.conversions.purchase === 0;
  const spikeSuspect = c.spike.topVisitorShare >= SPIKE_SHARE_WARN && c.events24h >= SPIKE_MIN_EVENTS;

  return (
    <div className="space-y-5">
      <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", style.box)} role="status">
        <span className="relative mt-1 flex size-2.5 shrink-0">
          {status.level === "ok" && (
            <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", style.dot)} />
          )}
          <span className={cn("relative inline-flex size-2.5 rounded-full", style.dot)} />
        </span>
        <div className="min-w-0">
          <p className={cn("text-[13.5px] font-semibold", style.text)}>
            <span className="mr-1.5 text-[11px] font-bold">[{style.label}]</span>
            {status.title}
          </p>
          <p className={cn("mt-0.5 text-[12.5px] break-words", style.text, "opacity-80")}>{status.detail}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="이벤트 (24시간)" value={fmtInt(c.events24h)} hint={`7일 ${fmtInt(c.events7d)}건`} />
        <KpiCard
          label="방문 (24시간)"
          value={fmtInt(c.sessions24h)}
          hint={`방문자 ${fmtInt(c.visitors24h)}명`}
        />
        <KpiCard
          label="마지막 히트"
          value={c.lastEventAt ? fmtAgo(c.lastEventAt, now) : "없음"}
          hint={c.lastEventAt ? `${fmtDateTime(c.lastEventAt)} · 방문자 기기 시계 기준` : undefined}
        />
        <KpiCard label="내부 트래픽 비중 (7일)" value={fmtPct(c.internalShare7d)} hint="관리자·비운영 호스트" />
        <KpiCard
          label="누적 전환"
          value={`${fmtInt(data.conversions.signup + data.conversions.purchase)}건`}
          hint={`가입 ${fmtInt(data.conversions.signup)} · 결제 ${fmtInt(data.conversions.purchase)}`}
        />
        <KpiCard
          label="추적 링크"
          value={`${fmtInt(data.trackedLinks.active)}개 활성`}
          hint={`전체 ${fmtInt(data.trackedLinks.total)}개`}
        />
        <KpiCard
          label="최다 시간대 히트 (24시간)"
          value={fmtInt(c.spike.peakHourHits)}
          hint={c.spike.peakHourLabel ? `${c.spike.peakHourLabel} (KST)` : "이벤트 없음"}
        />
        <KpiCard
          label="단일 방문자 최대 비중 (24시간)"
          value={fmtPct(c.spike.topVisitorShare)}
          hint={`${fmtInt(c.spike.topVisitorHits)}건 · IP 미저장이라 방문자 식별자 기준`}
          className={spikeSuspect ? "border-amber-200 bg-amber-50/60" : undefined}
        />
        <div className="col-span-2 rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-[12px] font-medium text-gray-400">수집 엔드포인트</div>
          <div className="mt-2 font-mono text-[15px] font-semibold text-gray-900 break-all">POST {data.trackerEndpoint}</div>
          <div className="mt-2 text-[11.5px] text-gray-400">
            공개·앱 페이지의 트래커가 여기로 전송합니다 · /admin 경로는 수집하지 않음
          </div>
        </div>
      </div>

      {(noConversions || spikeSuspect) && (
        <div className="space-y-1.5">
          {noConversions && (
            <p className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
              전환 기록 0건 — 가입·결제 전환이 아직 한 번도 발사된 적이 없습니다. 픽셀 전환이 실제로 나가는지는 아직 실증되지
              않았습니다(analytics_conversions 0행).
            </p>
          )}
          {spikeSuspect && (
            <p className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
              단일 방문자 식별자가 최근 24시간 히트의 {fmtPct(c.spike.topVisitorShare)}({fmtInt(c.spike.topVisitorHits)}건)를
              차지합니다. /api/collect 는 무인증 쓰기라 위조·봇 반복 요청일 수 있습니다 — 세션 탐색기에서 해당 방문자를
              확인하세요.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-1 text-[13px] font-semibold text-gray-700">호스트별 방문 (7일)</h4>
          {testSessions > 0 && (
            <div className="mb-2 space-y-1 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
              <p className="font-semibold">
                테스트 호스트 {fmtInt(testSessions)}/{fmtInt(listedSessions)} 세션({fmtPct(testShare)}) — qa.seed·localhost 등
                합성·로컬 데이터입니다.
              </p>
              <p>
                이 세션들은 isInternal=false 로 적재돼 위의 「내부 트래픽 비중 {fmtPct(c.internalShare7d)}」에 잡히지 않고,
                대시보드·유입 수치에는 그대로 들어갑니다.
              </p>
              <p>
                제거: 저장소에서 <code className="rounded bg-white/70 px-1 font-mono">npx tsx scripts/analytics-seed-qa.ts --clean</code>{" "}
                을 실행한 뒤 analytics_sessions 에 qa.seed 가 0행인지 확인하세요(배포 차단 조건 · 운영 체크리스트
                docs/analytics/ops-checklist.md).
              </p>
            </div>
          )}
          <BreakdownTable
            rows={c.hostnames}
            rowKey={(r) => r.hostname}
            labelHeader="호스트"
            label={(r) => {
              const badge = HOST_BADGE[hostKind(r.hostname)];
              return (
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-[12px]">{r.hostname}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10.5px] font-semibold", badge.className)}>{badge.label}</span>
                </span>
              );
            }}
            barValue={(r) => r.sessions}
            columns={[{ key: "s", label: "방문", render: (r) => fmtInt(r.sessions) }]}
            emptyMessage="최근 7일 방문 세션이 없습니다"
          />
        </div>
        <div className="min-w-0">
          <h4 className="mb-2 text-[13px] font-semibold text-gray-700">이벤트 종류 (7일, 상위 20)</h4>
          <BreakdownTable
            rows={c.eventsByType7d}
            rowKey={(r) => `${r.type}:${r.name ?? ""}`}
            labelHeader="이벤트"
            label={(r) => (
              <span className="inline-flex items-center gap-2">
                {eventLabel(r)}
                <span className="font-mono text-[11px] text-gray-400">{r.type}</span>
              </span>
            )}
            barValue={(r) => r.count}
            columns={[{ key: "n", label: "건수", render: (r) => fmtInt(r.count) }]}
            emptyMessage="최근 7일 이벤트가 없습니다"
          />
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[13px] font-semibold text-gray-700">
          분석 테이블 용량 <span className="font-normal text-gray-400">· 인덱스 포함</span>
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] text-left">
            <thead>
              <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400">
                <th className="py-2 pr-3 font-semibold">테이블</th>
                <th className="px-2 py-2 text-right font-semibold">행 수</th>
                <th className="py-2 pl-2 text-right font-semibold">용량</th>
              </tr>
            </thead>
            <tbody>
              {data.tables.map((t) => (
                <tr key={t.table} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-2 font-mono text-[11.5px] break-all text-gray-700">{t.table}</td>
                  <td className="px-2 py-2 text-right text-[12.5px] tabular-nums text-gray-600">{fmtInt(t.rows)}</td>
                  <td className="py-2 pl-2 text-right text-[12.5px] whitespace-nowrap tabular-nums text-gray-600">{t.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
