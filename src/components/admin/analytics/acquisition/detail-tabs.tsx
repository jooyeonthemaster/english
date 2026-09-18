"use client";

// 상세 유입 탭 카드 — 참조 도메인·전체 referrer·UTM 캠페인·콘텐츠·키워드·인앱·AI·광고 클릭ID·추적 링크.
// 행 클릭 = 해당 필터(필터 키가 없는 차원은 클릭 없음).

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { AcquisitionReport } from "@/lib/analytics/reports/acquisition";
import { inAppLabel, sourceLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { BreakdownTable } from "../shared/breakdown-table";
import { Section } from "../shared/section";
import { useAnalyticsParams, withSharedQuery } from "../shared/use-analytics-params";
import { conversionCell, countCell, krwCell, ratio, SIGNUP_RATIO_LABEL, SIGNUP_RATIO_NOTE } from "./acquisition-bits";

type TabKey = "hosts" | "referrers" | "campaigns" | "contents" | "terms" | "inApps" | "ai" | "clickIds" | "links";

/** 가입·매출 열이 있는 표에 붙는 공통 꼬리말 — 귀속은 기간 밖 방문에서 올 수 있다(§14 D12). */
const ATTR_NOTE = "가입·매출은 선택한 귀속 모델 기준이라 기간 밖 방문에서 올 수 있고, 같은 행의 방문 수와 같은 집단이 아닙니다";

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: "hosts", label: "참조 도메인", description: `방문 직전 사이트의 도메인 · 클릭하면 이 도메인으로 필터 · ${ATTR_NOTE}` },
  { key: "referrers", label: "전체 referrer", description: "상위 50 · 쿼리스트링(검색어 등)은 저장하지 않아 도메인+경로만 보입니다 · 가입·매출은 '참조 도메인' 탭에서 봅니다" },
  { key: "campaigns", label: "UTM 캠페인", description: `utm_source·utm_medium·utm_campaign 또는 광고 클릭ID가 붙은 방문 · ${SIGNUP_RATIO_NOTE}` },
  { key: "contents", label: "콘텐츠", description: "utm_content 별 방문 · 클릭하면 해당 캠페인으로 필터 · 가입·매출은 'UTM 캠페인' 탭에서 봅니다" },
  { key: "terms", label: "키워드", description: "utm_term · 네이버 광고 키워드(n_keyword·n_query) · 가입·매출은 'UTM 캠페인' 탭에서 봅니다" },
  { key: "inApps", label: "인앱 브라우저", description: `UA 로 판정한 앱 안 브라우저 · referrer 가 비어도 어느 앱에서 열었는지 알 수 있습니다 · ${ATTR_NOTE}` },
  { key: "ai", label: "AI 유입", description: `ChatGPT·퍼플렉시티·제미나이 등 AI 검색·어시스턴트에서 온 방문 · ${ATTR_NOTE}` },
  { key: "clickIds", label: "광고 클릭ID", description: "랜딩 URL 에 붙은 광고 클릭 식별자 종류 · fbclid 는 오가닉 공유에도 붙습니다 · 가입·매출은 'UTM 캠페인' 탭에서 봅니다" },
  { key: "links", label: "추적 링크", description: `/go/[slug] 추적 링크로 들어온 방문 · ${ATTR_NOTE}` },
];

const CLICK_ID_LABELS: Record<string, string> = {
  gclid: "구글 광고",
  gbraid: "구글 광고(iOS 앱)",
  wbraid: "구글 광고(iOS 웹)",
  NaPm: "네이버 검색광고",
  n_media: "네이버 검색광고",
  msclkid: "마이크로소프트(빙) 광고",
  ttclid: "틱톡 광고",
  twclid: "X(트위터) 광고",
  li_fat_id: "링크드인 광고",
  dclid: "구글 디스플레이",
  fbclid: "메타(페북·인스타) 링크",
};

function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host || null;
  } catch {
    return null;
  }
}

function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="font-mono text-[12px]" title={title}>
      {children}
    </span>
  );
}

function None({ text = "(없음)" }: { text?: string }) {
  return <span className="text-gray-400">{text}</span>;
}

export function AcquisitionDetailTabs({ data }: { data: AcquisitionReport }) {
  const { update, setFilter, sharedQuery } = useAnalyticsParams();
  const [tab, setTab] = useState<TabKey>("hosts");
  const counts: Record<TabKey, number> = {
    hosts: data.referrerHosts.length,
    referrers: data.referrers.length,
    campaigns: data.campaigns.length,
    contents: data.contents.length,
    terms: data.terms.length,
    inApps: data.inApps.length,
    ai: data.ai.length,
    clickIds: data.clickIds.length,
    links: data.trackedLinks.length,
  };
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const inAppTotal = data.inApps.reduce((s, r) => s + r.sessions, 0);

  return (
    <Section
      title="상세 유입"
      description={current.description}
      right={
        tab === "links" ? (
          <Link
            href={withSharedQuery("/admin/analytics/links", sharedQuery)}
            prefetch={false}
            className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-blue-600 hover:underline"
          >
            링크 만들기 <ArrowRight className="size-3" aria-hidden />
          </Link>
        ) : undefined
      }
    >
      <div className="-mx-1 mb-4 overflow-x-auto">
        <div className="flex min-w-max gap-1 px-1" role="tablist" aria-label="상세 유입 차원">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
                tab === t.key ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900",
              )}
            >
              {t.label}
              <span className={cn("text-[11px] tabular-nums", tab === t.key ? "text-blue-100" : "text-gray-400")}>
                {fmtInt(counts[t.key])}
              </span>
            </button>
          ))}
        </div>
      </div>

      {tab === "hosts" && (
        <BreakdownTable
          rows={data.referrerHosts}
          rowKey={(r) => r.host}
          labelHeader="참조 도메인"
          label={(r) => <Mono>{r.host}</Mono>}
          barValue={(r) => r.sessions}
          columns={[
            { key: "v", label: "방문자", render: (r) => countCell(r.visitors) },
            { key: "s", label: "방문", render: (r) => countCell(r.sessions) },
            { key: "su", label: "가입", render: (r) => countCell(r.signups) },
            { key: "rev", label: "매출", render: (r) => krwCell(r.revenue) },
          ]}
          filterKey="referrerHost"
          filterValue={(r) => r.host}
          emptyMessage="referrer 가 남은 방문이 없습니다"
        />
      )}

      {tab === "referrers" && (
        <BreakdownTable
          rows={data.referrers}
          rowKey={(r) => r.url}
          labelHeader="referrer URL"
          label={(r) => <Mono title={r.url}>{r.url}</Mono>}
          barValue={(r) => r.sessions}
          columns={[{ key: "s", label: "방문", render: (r) => fmtInt(r.sessions) }]}
          onRowClick={(r) => {
            const host = hostOf(r.url);
            if (host) setFilter("referrerHost", host);
          }}
          emptyMessage="referrer 가 남은 방문이 없습니다"
        />
      )}

      {tab === "campaigns" && (
        <BreakdownTable
          rows={data.campaigns}
          rowKey={(r) => `${r.source}|${r.medium}|${r.campaign}`}
          labelHeader="캠페인"
          label={(r) => (r.campaign ? r.campaign : <None text="(캠페인 없음)" />)}
          barValue={(r) => r.sessions}
          columns={[
            { key: "src", label: "소스", align: "left", render: (r) => (r.source ? sourceLabel(r.source) : <None />) },
            { key: "med", label: "매체", align: "left", render: (r) => (r.medium ? r.medium : <None />) },
            { key: "v", label: "방문자", render: (r) => countCell(r.visitors) },
            { key: "s", label: "방문", render: (r) => countCell(r.sessions) },
            { key: "su", label: "가입", render: (r) => countCell(r.signups) },
            { key: "cr", label: SIGNUP_RATIO_LABEL, render: (r) => conversionCell(r.signups, r.visitors) },
            { key: "rev", label: "매출", render: (r) => krwCell(r.revenue) },
          ]}
          onRowClick={(r) =>
            update({ source: r.source ?? "(none)", medium: r.medium ?? "(none)", campaign: r.campaign ?? "(none)" })
          }
          emptyMessage="UTM·광고 파라미터가 붙은 방문이 없습니다 — 추적 링크나 UTM 링크를 배포해 보세요"
        />
      )}

      {tab === "contents" && (
        <BreakdownTable
          rows={data.contents}
          rowKey={(r) => `${r.campaign}|${r.content}`}
          labelHeader="콘텐츠(utm_content)"
          label={(r) => r.content}
          barValue={(r) => r.sessions}
          columns={[
            { key: "c", label: "캠페인", align: "left", render: (r) => (r.campaign ? r.campaign : <None />) },
            { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
          ]}
          onRowClick={(r) => {
            if (r.campaign) setFilter("campaign", r.campaign);
          }}
          emptyMessage="utm_content 가 붙은 방문이 없습니다"
        />
      )}

      {tab === "terms" && (
        <BreakdownTable
          rows={data.terms}
          rowKey={(r) => r.term}
          labelHeader="키워드"
          label={(r) => r.term}
          barValue={(r) => r.sessions}
          columns={[{ key: "s", label: "방문", render: (r) => fmtInt(r.sessions) }]}
          emptyMessage="키워드(utm_term·네이버 광고 키워드)가 붙은 방문이 없습니다"
        />
      )}

      {tab === "inApps" && (
        <BreakdownTable
          rows={data.inApps}
          rowKey={(r) => r.inApp ?? "(none)"}
          labelHeader="브라우저"
          label={(r) => (r.inApp ? inAppLabel(r.inApp) : <span className="text-gray-500">{inAppLabel(null)}</span>)}
          barValue={(r) => r.sessions}
          columns={[
            { key: "v", label: "방문자", render: (r) => countCell(r.visitors) },
            { key: "s", label: "방문", render: (r) => countCell(r.sessions) },
            {
              key: "p",
              label: "비중",
              render: (r) => fmtPct(ratio(r.sessions, inAppTotal)),
            },
            { key: "su", label: "가입", render: (r) => countCell(r.signups) },
            { key: "rev", label: "매출", render: (r) => krwCell(r.revenue) },
          ]}
          filterKey="inApp"
          filterValue={(r) => r.inApp ?? "(none)"}
        />
      )}

      {tab === "ai" && (
        <BreakdownTable
          rows={data.ai}
          rowKey={(r) => r.source}
          labelHeader="AI 서비스"
          label={(r) => sourceLabel(r.source)}
          barValue={(r) => r.sessions}
          columns={[
            { key: "v", label: "방문자", render: (r) => countCell(r.visitors) },
            { key: "s", label: "방문", render: (r) => countCell(r.sessions) },
            { key: "su", label: "가입", render: (r) => countCell(r.signups) },
            { key: "rev", label: "매출", render: (r) => krwCell(r.revenue) },
          ]}
          onRowClick={(r) => update({ channel: "ai", source: r.source })}
          emptyMessage="AI 검색·어시스턴트에서 온 방문이 없습니다"
        />
      )}

      {tab === "clickIds" && (
        <BreakdownTable
          rows={data.clickIds}
          rowKey={(r) => r.clickIdType}
          labelHeader="클릭ID"
          label={(r) => (
            <span>
              {CLICK_ID_LABELS[r.clickIdType] ?? r.clickIdType} <Mono>({r.clickIdType})</Mono>
            </span>
          )}
          barValue={(r) => r.sessions}
          columns={[{ key: "s", label: "방문", render: (r) => fmtInt(r.sessions) }]}
          emptyMessage="광고 클릭ID(gclid·NaPm·fbclid 등)가 붙은 방문이 없습니다"
        />
      )}

      {tab === "links" && (
        <BreakdownTable
          rows={data.trackedLinks}
          rowKey={(r) => r.slug}
          labelHeader="추적 링크"
          label={(r) => <Mono>/go/{r.slug}</Mono>}
          barValue={(r) => r.sessions}
          columns={[
            { key: "v", label: "방문자", render: (r) => countCell(r.visitors) },
            { key: "s", label: "방문", render: (r) => countCell(r.sessions) },
            { key: "su", label: "가입", render: (r) => countCell(r.signups) },
          ]}
          filterKey="link"
          filterValue={(r) => r.slug}
          emptyMessage="추적 링크로 들어온 방문이 없습니다 — '추적 링크' 탭에서 SNS·카톡용 링크를 만들어 쓰세요"
        />
      )}
    </Section>
  );
}
