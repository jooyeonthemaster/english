"use client";

// 국가·시도·도시 분해 (Vercel 지오 헤더 기준 — 로컬 방문은 미상).
// 국가 행 클릭 = country 필터, 시·도·도시 행 클릭 = country+region 필터.
// region 코드(11·27·41 …)는 국가 안에서만 유일하다 → 도시 행도 항상 국가를 함께 건다.
// 공용 필터에 city 키가 없어 도시 행은 시·도까지만 좁힌다(숫자가 늘어난다 — 행 안내 문구로 고지).

import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { countryLabel, regionLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtPct } from "@/lib/analytics/format";
import { BreakdownTable } from "../shared/breakdown-table";
import { Section } from "../shared/section";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { pctOf } from "./audience-utils";

const orNone = (v: string | null) => v ?? "(none)";

/** 국가 꼬리표 — KR 이 아닌 국가에서만 붙인다(대부분이 KR 이라 소음 방지) */
function foreignTag(country: string | null) {
  if (!country || country === "KR") return null;
  return <span className="ml-1.5 text-[11.5px] text-gray-400">{countryLabel(country)}</span>;
}

const CITY_ROW_HINT = "이 도시가 속한 시·도로 좁힙니다(숫자가 늘어납니다)";

export function GeoSections({ data }: { data: AudienceReport }) {
  const { update } = useAnalyticsParams();
  const countryTotal = data.countries.reduce((s, r) => s + r.sessions, 0);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Section title="국가" description="방문 기준 · 행 클릭 = 필터">
        <BreakdownTable
          rows={data.countries}
          rowKey={(r) => orNone(r.country)}
          labelHeader="국가"
          label={(r) => countryLabel(r.country)}
          barValue={(r) => r.sessions}
          columns={[
            { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors) },
            { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
            {
              key: "p",
              label: "비중",
              render: (r) => <span className="text-gray-400">{fmtPct(pctOf(r.sessions, countryTotal))}</span>,
            },
          ]}
          filterKey="country"
          filterValue={(r) => orNone(r.country)}
        />
      </Section>

      <Section title="시·도" description="행 클릭 = 국가+시·도 필터">
        <BreakdownTable
          rows={data.regions}
          rowKey={(r) => `${orNone(r.country)}|${orNone(r.region)}`}
          labelHeader="지역"
          label={(r) => (
            <span>
              {regionLabel(r.country, r.region)}
              {foreignTag(r.country)}
            </span>
          )}
          barValue={(r) => r.sessions}
          columns={[
            { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors) },
            { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
          ]}
          onRowClick={(r) => update({ country: orNone(r.country), region: orNone(r.region) })}
        />
      </Section>

      <Section title="도시" description={`행 클릭 = ${CITY_ROW_HINT}`}>
        <BreakdownTable
          rows={data.cities}
          rowKey={(r) => `${orNone(r.country)}|${orNone(r.city)}|${orNone(r.region)}`}
          labelHeader="도시"
          label={(r) => (
            <span title={CITY_ROW_HINT}>
              {r.city ?? "미상"}
              {r.region && (
                <span className="ml-1.5 text-[11.5px] text-gray-400">{regionLabel(r.country, r.region)}</span>
              )}
              {foreignTag(r.country)}
            </span>
          )}
          barValue={(r) => r.sessions}
          columns={[{ key: "s", label: "방문", render: (r) => fmtInt(r.sessions) }]}
          onRowClick={(r) => update({ country: orNone(r.country), region: orNone(r.region) })}
        />
      </Section>
    </div>
  );
}
