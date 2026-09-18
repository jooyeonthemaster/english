"use client";

// ③-2 Google Search Console 블록 — 연결 진단 결과·제출된 사이트맵·검색어/페이지 상위.
//
// · probe.error 는 서버가 만든 사전 정의 요약이다(업스트림 원문 아님). 원문·서비스 계정은
//   SUPER_ADMIN 응답에만 실리는 probe.debug 에 들어 있고, 접이식으로만 보여준다(SEC-10).
// · 사이트맵 표에 「색인」 열은 두지 않는다 — Search Console API 의 indexed 필드는 구글이
//   deprecated 로 표시해 항상 0 이 내려오고, 그대로 두면 「색인 0건」으로 오독된다.

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { GscPageRow, GscQueryRow, GscSection } from "@/lib/analytics/reports/search-engines";
import { fmtDateTime, fmtInt, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { BreakdownTable } from "../shared/breakdown-table";
import { ReportEmpty } from "../shared/report-states";
import { OkBadge } from "./search-engine-badges";

export function GscBlock({ gsc }: { gsc: GscSection }) {
  const p = gsc.probe;
  return (
    <div className="space-y-4 border-t border-gray-50 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[13px] font-semibold text-gray-700">Google Search Console</h4>
        <OkBadge ok={gsc.configured} okText="서비스 계정 설정됨" failText="미설정" />
        <span className="font-mono text-[11.5px] text-gray-400 break-all">{gsc.siteUrl}</span>
        <a
          href={gsc.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-gray-200 px-2 text-[11.5px] font-semibold text-gray-600 hover:border-blue-200 hover:text-blue-700"
        >
          콘솔 열기 <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {p.ok ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-800">
          연결 정상 (HTTP {p.status}) — 사이트맵 목록·검색 실적 조회 성공
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-3">
          <p className="text-[12.5px] font-semibold text-rose-700">
            {gsc.configured ? "연결 실패" : "연결 안 됨"} · {p.status ? `HTTP ${p.status}` : "호출 전 실패"}
          </p>
          {p.error && <p className="text-[12.5px] leading-relaxed text-rose-700/90 break-words">{p.error}</p>}
          {p.remedy && (
            <p className="rounded-md bg-white/70 px-2.5 py-2 text-[12.5px] leading-relaxed text-gray-700 break-words">
              <span className="mr-1 font-semibold text-amber-700">조치</span>
              {p.remedy}
            </p>
          )}
          {p.debug && (
            <details className="rounded-md bg-white/70 px-2.5 py-2">
              <summary className="cursor-pointer text-[11.5px] font-semibold text-gray-500">
                원본 진단 (최고관리자에게만 표시)
              </summary>
              <dl className="mt-1.5 space-y-1 text-[11.5px] text-gray-600">
                <DebugRow label="Google 응답" value={p.debug.upstream} />
                <DebugRow label="현재 인증" value={p.debug.credentialSource} />
                <DebugRow label="서비스 계정" value={p.debug.serviceAccount} />
                <DebugRow label="전용 계정 env" value={p.debug.envHint} />
              </dl>
            </details>
          )}
        </div>
      )}

      {gsc.sitemaps && (
        <div>
          <h5 className="mb-2 text-[12.5px] font-semibold text-gray-600">제출된 사이트맵</h5>
          {gsc.sitemaps.length === 0 ? (
            <ReportEmpty message="Search Console 에 제출된 사이트맵이 없습니다" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-gray-50 text-[11px] font-semibold text-gray-400">
                    {["경로", "마지막 제출", "마지막 읽음", "상태", "오류", "경고", "제출 URL"].map((h, i) => (
                      <th key={h} className={cn("px-2 py-2 font-semibold whitespace-nowrap", i === 0 ? "pl-0" : "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gsc.sitemaps.map((s) => (
                    <tr key={s.path} className="border-b border-gray-50 text-[12.5px] tabular-nums text-gray-600 last:border-0">
                      <td className="py-2 pr-2 font-mono text-[11.5px] text-gray-800 break-all">{s.path}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{fmtDateTime(s.lastSubmitted)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{fmtDateTime(s.lastDownloaded)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{s.isPending ? "처리 대기" : "처리됨"}</td>
                      <td className={cn("px-2 py-2 text-right", s.errors > 0 && "font-semibold text-rose-600")}>{fmtInt(s.errors)}</td>
                      <td className={cn("px-2 py-2 text-right", s.warnings > 0 && "font-semibold text-amber-600")}>{fmtInt(s.warnings)}</td>
                      <td className="px-2 py-2 text-right">{fmtInt(s.submitted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-400">
            「제출 URL」은 구글이 이 사이트맵에서 읽어간 URL 수입니다. 색인 건수는 API 가 제공하지 않습니다(구글이 해당 필드를
            deprecated 로 표시) —{" "}
            <a href={gsc.consoleUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Search Console 색인 현황
            </a>
            에서 확인하세요.
          </p>
        </div>
      )}

      {(gsc.topQueries || gsc.topPages) && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {gsc.topQueries && (
            <SearchTable
              title="검색어 상위 25"
              header="검색어"
              rows={gsc.topQueries}
              rowKey={(r) => r.query}
              label={(r) => r.query}
            />
          )}
          {gsc.topPages && (
            <SearchTable
              title="페이지 상위 25"
              header="페이지"
              rows={gsc.topPages}
              rowKey={(r) => r.page}
              label={(r) => <span className="font-mono text-[11.5px]">{pagePath(r.page)}</span>}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SearchTable<Row extends GscQueryRow | GscPageRow>({
  title,
  header,
  rows,
  rowKey,
  label,
}: {
  title: string;
  header: string;
  rows: Row[];
  rowKey: (r: Row) => string;
  label: (r: Row) => ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h5 className="mb-2 text-[12.5px] font-semibold text-gray-600">
        {title} <span className="font-normal text-gray-400">· 최근 28일(확정 데이터, 오늘−3일까지)</span>
      </h5>
      <BreakdownTable
        rows={rows}
        rowKey={rowKey}
        labelHeader={header}
        label={label}
        barValue={(r) => r.clicks}
        columns={[
          { key: "c", label: "클릭", render: (r) => fmtInt(r.clicks) },
          { key: "i", label: "노출", render: (r) => fmtInt(r.impressions) },
          { key: "r", label: "CTR", render: (r) => fmtPct(r.ctr) },
          { key: "p", label: "순위", render: (r) => r.position.toFixed(1) },
        ]}
        emptyMessage="이 기간 검색 실적이 없습니다"
      />
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-mono text-[11px] break-words text-gray-600">{value}</dd>
    </div>
  );
}

/** GSC 페이지 URL → 경로만(도메인은 모두 같다). 파싱 실패 시 원문. */
function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}
