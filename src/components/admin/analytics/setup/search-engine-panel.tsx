"use client";

// ③ 검색엔진·사이트맵 — 사이트맵 실제 제공 URL 수·섹션, robots/sitemap/llms/rss 링크, 소유확인 메타,
// IndexNow, Google Search Console 실연결 진단(읽기 전용) + 검색어·페이지 상위·사이트맵 제출 상태,
// 네이버 서치어드바이저 안내. 결과는 서버 메모리 10분 캐시 — 「다시 확인」은 refresh=1.

import { useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import type { SearchEnginesReport } from "@/lib/analytics/reports/search-engines";
import { fmtDateTime, fmtInt, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { BreakdownTable } from "../shared/breakdown-table";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useReport } from "../shared/use-report";
import { InfoCard, KeyCheckBadge, OkBadge, VerificationBadge } from "./search-engine-badges";
import { GscBlock } from "./search-engine-gsc-block";

export function SearchEnginePanel() {
  // 0 이면 캐시 허용, 누를 때마다 새 nonce → refresh=1 로 새 요청(쿼리 키가 바뀐다).
  const [nonce, setNonce] = useState(0);
  const { data, error, isLoading, isFetching } = useReport<SearchEnginesReport>("search-engines", {
    params: nonce ? { refresh: 1, t: nonce } : undefined,
  });

  return (
    <Section
      title="검색엔진·사이트맵"
      description="사이트맵 실제 제공분 · Google Search Console 실연결 검사(읽기 전용) · 결과 10분 캐시"
      right={
        <button
          type="button"
          onClick={() => setNonce(Date.now())}
          disabled={isFetching}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} aria-hidden />
          {isFetching ? "확인 중…" : "다시 확인"}
        </button>
      }
    >
      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={6} />}
      {data && (
        <div className={cn("space-y-6 transition-opacity", isFetching && "opacity-70")}>
          <SitemapBlock data={data} />
          <GscBlock gsc={data.gsc} />
          <NaverBlock data={data} />
        </div>
      )}
    </Section>
  );
}

function SitemapBlock({ data }: { data: SearchEnginesReport }) {
  const links: Array<{ label: string; href: string }> = [
    { label: "sitemap.xml", href: data.sitemap.url },
    { label: "robots.txt", href: data.robotsUrl },
    { label: "llms.txt", href: data.llmsUrl },
    { label: "rss.xml", href: data.rssUrl },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 font-mono text-[12px] font-semibold text-gray-700 hover:border-blue-200 hover:text-blue-700"
          >
            {l.label}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <InfoCard label="사이트맵 URL">
          <div className="text-[24px] font-bold leading-none text-gray-900 tabular-nums">{fmtInt(data.sitemap.total)}개</div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-gray-400">
            {data.sitemap.lastModified ? (
              <>
                실제 갱신일 최신 {fmtDateTime(data.sitemap.lastModified)} · {fmtInt(data.sitemap.datedEntries)}개 항목만 갱신일을
                가집니다(나머지는 요청 시각이 lastmod 로 나갑니다)
              </>
            ) : (
              <>실제 갱신일 없음 — 모든 항목의 lastmod 가 요청 시각으로 나갑니다</>
            )}
          </p>
        </InfoCard>
        <InfoCard label="소유확인 메타 태그">
          <div className="flex flex-wrap gap-2">
            <VerificationBadge name="Google" state={data.verification.google} />
            <VerificationBadge name="네이버" state={data.verification.naver} />
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-gray-400">
            「기본값」은 코드에 박힌 폴백 코드라 환경변수 없이도 항상 삽입됩니다 — 실제 소유확인 완료 여부는 각 콘솔에서
            확인하세요.
          </p>
        </InfoCard>
        <InfoCard label="IndexNow (Bing·네이버 등)">
          <div className="flex flex-wrap gap-2">
            <OkBadge
              ok={data.indexNow.configured}
              tone={data.indexNow.configured && !data.indexNow.fromEnv ? "warn" : "ok"}
              okText={data.indexNow.fromEnv ? "키 설정됨(env)" : "키 설정됨(기본값)"}
              failText="키 없음"
            />
            <KeyCheckBadge check={data.indexNow.keyCheck} />
          </div>
          {data.indexNow.keyLocation && (
            <a
              href={data.indexNow.keyLocation}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block font-mono text-[11.5px] text-blue-600 break-all hover:underline"
            >
              {data.indexNow.keyLocation}
            </a>
          )}
          {data.indexNow.keyCheck.detail && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-amber-700 break-words">{data.indexNow.keyCheck.detail}</p>
          )}
        </InfoCard>
      </div>

      <div>
        <h4 className="mb-2 text-[13px] font-semibold text-gray-700">사이트맵 섹션별 URL 수</h4>
        <BreakdownTable
          rows={data.sitemap.bySection}
          rowKey={(r) => r.section}
          labelHeader="섹션(첫 경로)"
          label={(r) => <span className="font-mono text-[12px]">{r.section === "home" ? "/ (홈)" : `/${r.section}`}</span>}
          barValue={(r) => r.count}
          columns={[
            { key: "n", label: "URL", render: (r) => fmtInt(r.count) },
            {
              key: "p",
              label: "비중",
              render: (r) => fmtPct(data.sitemap.total ? (r.count / data.sitemap.total) * 100 : 0),
            },
          ]}
          initialLimit={8}
          emptyMessage="사이트맵에 URL 이 없습니다"
        />
      </div>
    </div>
  );
}

function NaverBlock({ data }: { data: SearchEnginesReport }) {
  return (
    <div className="space-y-3 border-t border-gray-50 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[13px] font-semibold text-gray-700">네이버 서치어드바이저</h4>
        <OkBadge ok={data.naver.verified} okText="소유확인 메타 삽입됨" failText="소유확인 메타 없음" />
      </div>
      <p className="text-[12.5px] leading-relaxed text-gray-500">{data.naver.note}</p>
      <div className="space-y-1.5">
        <CopyRow label="사이트맵 제출 주소" value={data.sitemap.url} />
        <CopyRow label="RSS 제출 주소" value={data.rssUrl} />
      </div>
      <a
        href={data.naver.consoleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#03c75a] px-3 text-[12px] font-semibold text-white hover:brightness-95"
      >
        서치어드바이저 열기 <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-[11.5px] font-semibold text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 font-mono text-[12px] text-gray-800 break-all">{value}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // 클립보드 권한 없음 — 조용히 무시(주소는 화면에 보인다)
          }
        }}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11.5px] font-semibold text-gray-600 hover:bg-gray-100"
      >
        {copied ? <Check className="size-3 text-emerald-600" aria-hidden /> : <Copy className="size-3" aria-hidden />}
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}
