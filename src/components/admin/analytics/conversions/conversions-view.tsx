"use client";

// 유입 분석 — 전환·가입. 「가입한 학원이 어디서 왔는가」를 푸는 화면.
//   AnalyticsToolbar + 귀속 모델 토글 → useReport("conversions", {model}) → 퍼널 · 채널/소스 표 · 가입 학원 목록 · 이벤트 · 픽셀 전환.

import type { AttributionModel } from "@/lib/analytics/attribution";
import type { ConversionsReport } from "@/lib/analytics/reports/conversions";
import { CHANNEL_COLORS, channelLabel, isChannel, sourceLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtKrw } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { BreakdownTable } from "../shared/breakdown-table";
import { ReportEmpty, ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { useReport } from "../shared/use-report";
import { ConversionFunnel, CoverageBadge } from "./conversion-funnel";
import { SignupListTable } from "./signup-list-table";

const MODEL_LABELS: Record<AttributionModel, string> = { first: "최초 유입", last: "가입 직전 유입" };
const MODEL_HINTS: Record<AttributionModel, string> = {
  first: "가입 학원에 연결된 가장 이른 방문자의 첫 유입",
  last: "가입 전 마지막 방문(직접 방문이 아닌 것 우선)",
};

/** 수집기가 보내는 이벤트명(§3.1, §6.3) 표시명 */
const EVENT_LABELS: Record<string, string> = {
  cta_click: "CTA 버튼 클릭",
  outbound: "외부 링크 클릭",
  download: "파일 다운로드",
  signup_complete: "가입 완료",
  purchase_complete: "결제 완료",
};

const PIXEL_TYPE_LABELS: Record<string, string> = { signup: "가입", purchase: "결제" };

function ModelToggle({ model, onChange }: { model: AttributionModel; onChange: (m: AttributionModel) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-semibold text-gray-500">귀속 모델</span>
      <div className="inline-flex rounded-lg border border-gray-100 bg-white p-0.5 shadow-sm" role="radiogroup" aria-label="귀속 모델">
        {(Object.keys(MODEL_LABELS) as AttributionModel[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={model === m}
            onClick={() => onChange(m)}
            className={cn(
              "h-7 rounded-md px-2.5 text-[12px] font-semibold",
              model === m ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-900",
            )}
          >
            {MODEL_LABELS[m]}
          </button>
        ))}
      </div>
      <span className="text-[11.5px] text-gray-400">{MODEL_HINTS[model]}</span>
    </div>
  );
}

function ChannelName({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-2 rounded-full" style={{ background: isChannel(channel) ? CHANNEL_COLORS[channel] : "#94a3b8" }} aria-hidden />
      {channelLabel(channel)}
    </span>
  );
}

export function ConversionsView() {
  const { get, update, filters } = useAnalyticsParams();
  const model: AttributionModel = get("model") === "last" ? "last" : "first";
  const { data, error, isLoading, isFetching } = useReport<ConversionsReport>("conversions", { params: { model } });
  const filtered = Object.keys(filters).length > 0;

  return (
    <div className="space-y-5">
      <AnalyticsToolbar />
      <ModelToggle model={model} onChange={(m) => update({ model: m === "first" ? null : m })} />

      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={8} />}

      {data && (
        <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-80")}>
          <Section
            title="가입 퍼널"
            description="① ② 는 방문자(명) · ③ ④ 는 가입 학원(곳) — 단계 간 비율은 같은 기준끼리만 냅니다"
            right={<CoverageBadge coverage={data.coverage} filtered={filtered} />}
          >
            <ConversionFunnel data={data} filtered={filtered} />
          </Section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section
              title="채널별 가입·결제·매출"
              description={`${MODEL_LABELS[data.model]} 기준 · 결제는 현재까지 누적(코호트) · 매출은 기간 내 충전 순매출 · 행 클릭 = 채널 필터`}
            >
              <BreakdownTable
                rows={data.byChannel}
                rowKey={(r) => r.channel}
                labelHeader="채널"
                label={(r) => <ChannelName channel={r.channel} />}
                barValue={(r) => r.signups}
                columns={[
                  { key: "su", label: "가입", render: (r) => `${fmtInt(r.signups)}곳` },
                  { key: "pu", label: "결제(누적)", render: (r) => `${fmtInt(r.purchasers)}곳` },
                  { key: "rv", label: "매출", render: (r) => fmtKrw(r.revenue) },
                ]}
                filterKey="channel"
                filterValue={(r) => r.channel}
                emptyMessage="유입이 추적된 가입 학원이 없습니다"
              />
            </Section>
            <Section
              title="소스별 가입·결제·매출"
              description={`${MODEL_LABELS[data.model]} 기준 · 결제는 현재까지 누적(코호트) · 행 클릭 = 소스+채널 필터`}
            >
              <BreakdownTable
                rows={data.bySource}
                rowKey={(r) => `${r.source}|${r.channel}`}
                labelHeader="소스"
                label={(r) => sourceLabel(r.source === "(none)" ? null : r.source)}
                barValue={(r) => r.signups}
                columns={[
                  { key: "ch", label: "채널", align: "left", render: (r) => <span className="text-gray-400">{channelLabel(r.channel)}</span> },
                  { key: "su", label: "가입", render: (r) => `${fmtInt(r.signups)}곳` },
                  { key: "pu", label: "결제(누적)", render: (r) => `${fmtInt(r.purchasers)}곳` },
                  { key: "rv", label: "매출", render: (r) => fmtKrw(r.revenue) },
                ]}
                onRowClick={(r) => update({ source: r.source, channel: r.channel })}
                emptyMessage="유입이 추적된 가입 학원이 없습니다"
              />
            </Section>
          </div>

          <Section
            title="가입 학원"
            description={
              filtered
                ? `필터에 맞는 추적된 가입 학원 ${fmtInt(data.signupListTotal)}곳 · 최신순 · 유입 칸을 누르면(데스크톱은 올리면) 상세`
                : `기간 내 가입 ${fmtInt(data.coverage.signups)}곳 전체 · 최신순 최대 ${fmtInt(data.signupListLimit)}곳 · 유입 칸을 누르면(데스크톱은 올리면) 상세`
            }
          >
            <SignupListTable
              key={`${data.model}-${filtered}`}
              rows={data.signupList}
              model={data.model}
              filtered={filtered}
              coverage={data.coverage}
              total={data.signupListTotal}
              limit={data.signupListLimit}
            />
          </Section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Section className="xl:col-span-2" title="커스텀 이벤트" description="CTA 클릭·외부 링크·다운로드 등 · 기간·필터 적용">
              <BreakdownTable
                rows={data.events}
                rowKey={(r) => r.name}
                labelHeader="이벤트"
                label={(r) => (
                  <span className="inline-flex items-baseline gap-2">
                    {EVENT_LABELS[r.name] ?? r.name}
                    {EVENT_LABELS[r.name] && <span className="font-mono text-[11px] text-gray-400">{r.name}</span>}
                  </span>
                )}
                barValue={(r) => r.count}
                columns={[
                  { key: "c", label: "횟수", render: (r) => fmtInt(r.count) },
                  { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors) },
                  { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
                ]}
                emptyMessage="이 기간에 기록된 커스텀 이벤트가 없습니다"
              />
            </Section>
            <Section title="픽셀 전환 기록" description="서버가 판정해 픽셀 발사를 지시한 전환 · 기간만 적용">
              {data.pixelConversions.length === 0 ? (
                <ReportEmpty message="이 기간에 기록된 전환이 없습니다" />
              ) : (
                <ul className="divide-y divide-gray-50">
                  {data.pixelConversions.map((p) => (
                    <li key={p.type} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-[13px] font-semibold text-gray-800">{PIXEL_TYPE_LABELS[p.type] ?? p.type}</span>
                      <span className="text-right text-[12.5px] tabular-nums text-gray-600">
                        {fmtInt(p.count)}건
                        {p.type !== "signup" && <span className="ml-2 font-semibold text-gray-900">{fmtKrw(p.value)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
