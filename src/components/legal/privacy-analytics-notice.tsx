// ============================================================================
// 개인정보처리방침 — 쿠키·행태정보·외부 분석/광고 도구 고지 보조 블록.
// src/app/privacy/page.tsx 의 10·11항 아래에 붙는다(서버 컴포넌트, 상태 없음).
//
// 사실 근거:
//  - 1st-party 수집: src/lib/analytics/client.ts(쿠키 smoat_vid 730일, localStorage smoat_vid/smoat_ses)
//  - 거부 수단: src/lib/analytics/consent.ts(거부 쿠키 smoat_analytics_optout, GPC, 저장소 차단)
//  - 외부 도구 목록·연락처·보유기간·로드 범위: src/components/legal/privacy-analytics-data.ts
// ============================================================================

import type { ReactNode } from "react";

import { AnalyticsOptOutToggle } from "@/components/analytics/analytics-optout-toggle";
import {
  ANALYTICS_TOOLS,
  BROWSER_GUIDES,
  MOBILE_OPT_OUT_TEXT,
  type ExternalLinkItem,
} from "@/components/legal/privacy-analytics-data";

function ExternalLink({ item }: { item: ExternalLinkItem }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 hover:decoration-blue-500"
    >
      {item.label}
    </a>
  );
}

/** 10항 하단 — 이 사이트 전용 거부 토글 + 브라우저별 쿠키 차단·삭제 방법. */
export function BrowserCookieGuide() {
  return (
    <>
      <AnalyticsOptOutToggle />
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-[13px] font-bold text-slate-800">브라우저별 쿠키 설정 방법</h3>
        <ul className="mt-2 space-y-2">
          {BROWSER_GUIDES.map((g) => (
            <li key={g.browser} className="text-[13px] leading-6 text-slate-600">
              <span className="font-semibold text-slate-800">{g.browser}</span>
              <span className="mx-1 text-slate-300">·</span>
              <span className="break-keep">{g.path}</span>{" "}
              <span className="whitespace-nowrap">
                (<ExternalLink item={g.help} />)
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-5 text-slate-500">
          메뉴 이름과 위치는 브라우저 버전에 따라 다를 수 있습니다. SMOAT의 방문자 식별 쿠키는 이 사이트가 직접
          저장하는 쿠키이므로 「서드 파티(타사) 쿠키 차단」만으로는 차단되지 않습니다. 또한 저장된 쿠키와 사이트
          데이터를 지우기만 하면 다음 방문에 새 식별자가 만들어져 수집은 계속되고 이전 기록과 연결만 끊어집니다.
          수집 자체를 멈추려면 위 「방문 분석 거부」 버튼을 누르거나, 브라우저의 Global Privacy Control(GPC)을
          켜거나, 이 사이트의 쿠키와 사이트 데이터 저장을 모두 차단하십시오.
        </p>
      </div>
    </>
  );
}

/** 11항 하단 — 외부 분석·광고 도구 목록(작성지침 15항 6항목 + 국외 이전 연락처·보유기간). */
export function ThirdPartyAnalyticsTools() {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ANALYTICS_TOOLS.map((tool) => (
          <div key={tool.name} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[14px] font-bold text-slate-900">{tool.name}</span>
              <span
                className={
                  tool.country === "대한민국"
                    ? "rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200"
                    : "rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200"
                }
              >
                {tool.country === "대한민국" ? "국내" : "국외 이전"}
              </span>
            </div>
            <dl className="mt-2 space-y-1.5 text-[13px] leading-6">
              <Row label="사업자">
                {tool.operator} ({tool.country})
              </Row>
              <Row label="연락처">
                <ExternalLink item={tool.contact} />
                {tool.contactNote ? (
                  <span className="mt-0.5 block text-[12px] leading-5 text-slate-500">{tool.contactNote}</span>
                ) : null}
              </Row>
              <Row label="종류">{tool.kind}</Row>
              <Row label="수집·전송 정보">
                {tool.collects}
                {tool.note ? (
                  <span className="mt-0.5 block text-[12px] leading-5 text-slate-500">{tool.note}</span>
                ) : null}
              </Row>
              <Row label="이용 목적">{tool.purpose}</Row>
              {tool.scope ? <Row label="사용 화면">{tool.scope}</Row> : null}
              <Row label="보유·이용 기간">{tool.retention}</Row>
              <Row label="거부·설정">
                {tool.links.length === 0
                  ? "브라우저 쿠키 설정(10항)"
                  : tool.links.map((l, i) => (
                      <span key={l.href}>
                        {i > 0 ? ", " : ""}
                        <ExternalLink item={l} />
                      </span>
                    ))}
                {tool.links.length > 0 ? ", 브라우저 쿠키 설정(10항)" : ""}
                {tool.linksNote ? (
                  <span className="mt-0.5 block text-[12px] leading-5 text-slate-500">{tool.linksNote}</span>
                ) : null}
                <span className="mt-0.5 block text-[12px] leading-5 text-slate-500">{MOBILE_OPT_OUT_TEXT}</span>
              </Row>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-slate-500">
        위 목록은 회사가 사용할 수 있는 도구 전체이며, 회사는 운영에 필요한 도구만 선택하여 사용하고 그 현황을
        주기적으로 점검합니다. 보유·이용 기간은 각 사업자가 공개한 기준과 회사의 설정값을 적은 것으로, 각 사업자의
        정책 변경에 따라 달라질 수 있으며 그 경우 본 방침을 개정하여 안내합니다. 위 도구의 수집을 한 번에 막으려면
        10항의 「방문 분석 거부」 버튼을 사용하십시오.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="inline font-semibold text-slate-700">{label}: </dt>
      <dd className="inline break-keep text-slate-600">{children}</dd>
    </div>
  );
}
