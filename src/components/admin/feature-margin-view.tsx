import { Coins, Info } from "lucide-react";
import type { FeatureMarginAnalysis, FeatureMarginRow, MarginTier } from "@/actions/admin/feature-margin";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { featureRowDetail, tierRowDetail } from "@/components/admin/costs-parts/margin-hover-detail";
import type { AdminDetail } from "@/lib/admin-detail-types";

function formatBadgeDate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return match ? `${match[2]}.${match[3]}` : dateStr;
}

/** ISO → KST MM.DD */
function kstMonthDay(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

const perCreditText = (n: number | null) =>
  n == null ? "—" : `${formatNumber(Math.round(n * 10) / 10)}원`;

/** 실청구 평균 크레딧이 상수와 의미 있게 다를 때만 표기할 문자열(아니면 null) */
const MIN_REALIZED_ACTIONS = 20;
function realizedGap(feature: FeatureMarginRow): string | null {
  const realized = feature.realizedCreditsPerAction;
  if (realized == null || feature.actionCount < MIN_REALIZED_ACTIONS) return null;
  const rounded = Math.round(realized * 10) / 10;
  if (Math.abs(rounded - feature.credits) < 0.1) return null;
  return formatNumber(rounded);
}

function marginToneClass(pct: number | null): string {
  if (pct === null) return "text-gray-400";
  if (pct >= 70) return "text-emerald-600";
  if (pct >= 40) return "text-amber-600";
  return "text-rose-600";
}

function BasisBadge({ tier }: { tier: MarginTier }) {
  return tier.basis === "realized" ? (
    <Badge className="border-0 bg-blue-50 px-1.5 py-0 text-[10px] font-semibold text-blue-700">
      실판매
    </Badge>
  ) : (
    <Badge className="border-0 bg-gray-100 px-1.5 py-0 text-[10px] font-semibold text-gray-500">
      정가
    </Badge>
  );
}

// ─── 호버·클릭 상세(어드민 UI 규약 §5) 어댑터 ───────────────────────────
// 상세 빌더(costs-parts/margin-hover-detail)는 그대로 쓰고, 단가 축이 「정가·실판매」
// 2축으로 바뀌면서 달라진 우리 데이터 모양·표기만 여기서 맞춘다.
//  · sell 셀의 키가 팩 이름(label)에서 팩 코드(tier.key)로 바뀌었다 → 빌더의 label 자리에
//    key 를 넘겨야 「기능별 마진」 행이 매칭된다(안 맞추면 표가 빈 채로 뜬다).
//  · 빌더의 제목·부제는 「팩 정가」 시절 문구이고 단가를 반올림 없이 찍는다 →
//    우리 정의(마진 계산 단가 · 소수 1자리)로 덮어쓴다.

function tierDetail(tier: MarginTier, data: FeatureMarginAnalysis): AdminDetail {
  const built = tierRowDetail({ ...tier, label: tier.key }, data.features);
  const basisText = tier.basis === "realized" ? "실판매" : "정가";
  const subtitle =
    tier.kind === "blended"
      ? `최근 ${data.realizedWindow.days}일 결제 ${formatNumber(tier.realizedCount)}건 가중평균 · ${formatNumber(tier.price)}원 ÷ ${formatNumber(tier.credits)}C = ${perCreditText(tier.perCredit)}/C — 이 단가 기준 기능별 마진(낮은 순)`
      : `${formatNumber(tier.credits)}C · ${formatCurrency(tier.price)} · 마진 계산 단가 ${perCreditText(tier.perCredit)}/C(${basisText}) — 이 단가 기준 기능별 마진(낮은 순)`;
  return {
    ...built,
    title: tier.kind === "blended" ? "실판매 평균(전 팩)" : `${tier.label} 팩`,
    subtitle,
  };
}

function featureDetail(feature: FeatureMarginRow, data: FeatureMarginAnalysis): AdminDetail {
  const built = featureRowDetail(feature, data.fxRate.rate);
  const labelByKey = new Map(data.tiers.map((t) => [t.key, t.label] as const));
  const gap = realizedGap(feature);
  return {
    ...built,
    subtitle: `${feature.operationType} · 판매가 = 상수 ${feature.credits}C × 크레딧당 단가`,
    fields: gap
      ? [
          ...(built.fields ?? []),
          {
            label: "같은 기간 실청구 평균",
            value: `${gap}C · ${formatNumber(feature.actionCount)}건 (판매가·마진은 상수 기준)`,
            wide: true,
          },
        ]
      : built.fields,
    // 빌더가 팩 열에 sell 셀 키(팩 코드)를 그대로 쓰므로 사람이 읽는 팩 이름으로 되돌린다.
    sections: built.sections?.map((section) => ({
      ...section,
      rows: section.rows.map((row) =>
        row.tier ? { ...row, tier: labelByKey.get(row.tier) ?? row.tier } : row,
      ),
    })),
  };
}

export function FeatureMarginView({ data }: { data: FeatureMarginAnalysis }) {
  const estimateCount = data.features.filter((f) => f.costSource === "estimate").length;
  const win = data.realizedWindow;
  const windowLabel = `최근 ${win.days}일(${kstMonthDay(win.start)}~${kstMonthDay(win.end)})`;
  const packs = data.tiers.filter((t) => t.kind === "pack");
  const blended = data.tiers.find((t) => t.kind === "blended") ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-800">
        <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
        <div className="min-w-0">
          <p className="font-semibold">기능별 원가 대비 판매가(마진) 분석</p>
          <p className="mt-1 text-sky-700">
            원가는 AI 호출 1회 평균(고정 인프라 제외). 판매가 = 기능의 상수 크레딧 ×
            크레딧당 단가 — 상수 크레딧 기준이라 최소 청구·부분환불이 있는 기능은 실청구와
            다를 수 있습니다(다른 기능은 「실청구 평균」을 함께 표기).
            단가는 {windowLabel} 결제 완료 건의 실판매 단가(결제액 ÷ 지급 크레딧, 프로모션 보너스
            반영)이고, 팩별 결제가 {win.minPackSample}건 미만이면{" "}
            {data.listPriceSource === "db" ? "충전 상품 정가" : "기본 팩 정가"}를 씁니다.
            {estimateCount > 0 &&
              ` ${estimateCount}개 기능은 실사용 기록 전이라 원가 추정치 사용.`}
          </p>
          <div className="mt-2">
            <Badge
              variant="secondary"
              className="border-0 bg-gray-100 text-[11px] text-gray-500"
              title={`적용 환율 (전일 종가 기준) · 기준일 ${data.fxRate.date} · ${data.fxRate.source === "ECB" ? "ECB 기준환율" : "기본값"}`}
            >
              USD {formatNumber(data.fxRate.rate)}원 · 전일{" "}
              {formatBadgeDate(data.fxRate.date)}
              {data.fxRate.source !== "ECB" && " (기본)"}
            </Badge>
          </div>
        </div>
      </div>

      {/* 크레딧 팩 단가 */}
      <section className="rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-gray-800">크레딧 단가 기준</h2>
            <p className="mt-1 text-[12px] text-gray-400">
              정가({data.listPriceSource === "db" ? "충전 상품 DB" : "기본 팩"}) · {windowLabel} 실판매 단가 — 표시된 기준으로 마진 계산
            </p>
          </div>
          <Coins className="size-4 shrink-0 text-gray-400" strokeWidth={1.8} />
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 min-w-[110px] pl-5 text-[12px] font-medium text-gray-400">팩</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">크레딧</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">정가</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">정가 크레딧당</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">실판매 크레딧당</TableHead>
                <TableHead className="h-9 pr-5 text-right text-[12px] font-medium text-gray-400">마진 계산 단가</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.map((tier) => (
                <AdminHoverDetail key={tier.key} title={`${tier.label} 팩`} detail={tierDetail(tier, data)}>
                  <TableRow className="cursor-pointer hover:bg-gray-50/50">
                    <TableCell className="pl-5 text-[13px] font-medium text-gray-800">{tier.label}</TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums text-gray-600">{formatNumber(tier.credits)}C</TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums text-gray-600">{formatCurrency(tier.price)}</TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums text-gray-600">{perCreditText(tier.listPerCredit)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-[13px] tabular-nums text-gray-600">
                      {perCreditText(tier.realizedPerCredit)}
                      <span className="ml-1 text-[11px] text-gray-400">{formatNumber(tier.realizedCount)}건</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-5 text-right">
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-gray-900">
                        <BasisBadge tier={tier} />
                        {perCreditText(tier.perCredit)}
                      </span>
                    </TableCell>
                  </TableRow>
                </AdminHoverDetail>
              ))}
              {blended && (
                <AdminHoverDetail title="실판매 평균(전 팩)" detail={tierDetail(blended, data)}>
                  <TableRow className="cursor-pointer bg-blue-50/40 hover:bg-blue-50/60">
                    <TableCell className="pl-5 text-[13px] font-medium text-blue-800">실판매 평균(전 팩)</TableCell>
                    {/* 팩 행의 「크레딧·정가」와 단위가 다르다(90일 합계) — 같은 열에 두지 않고 아래 보조문구로 옮긴다. */}
                    <TableCell className="text-right text-[13px] text-gray-400">—</TableCell>
                    <TableCell className="text-right text-[13px] text-gray-400">—</TableCell>
                    <TableCell className="text-right text-[13px] text-gray-400">—</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-[13px] tabular-nums text-gray-600">
                      {perCreditText(blended.realizedPerCredit)}
                      <span className="ml-1 block text-[11px] text-gray-400">
                        {formatNumber(blended.realizedCount)}건 ·{" "}
                        {formatNumber(blended.price)}원 ÷ {formatNumber(blended.credits)}C
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-5 text-right">
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-gray-900">
                        <BasisBadge tier={blended} />
                        {perCreditText(blended.perCredit)}
                      </span>
                    </TableCell>
                  </TableRow>
                </AdminHoverDetail>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="border-t border-gray-50 px-5 py-3 text-[11px] leading-5 text-gray-400">
          실판매 크레딧당 = 해당 상품 결제액 합 ÷ 실제 지급 크레딧 합(보너스 포함). 결제 {win.minPackSample}건 이상이면
          실판매, 미만이면 정가로 마진을 계산합니다. 실판매 평균은 모든 팩 결제의 가중 평균이며 결제{" "}
          {win.minBlendedSample}건 이상일 때만 표시합니다(크레딧·정가 열은 팩 1개 단위라
          기간 합계인 실판매 평균 행에는 값이 없습니다 — 합계는 그 행 보조문구 참조).
          환불된 결제는 제외. 행에 커서를 올리거나 클릭하면 그 단가 기준 기능별 마진이 나옵니다.
        </p>
      </section>

      {/* 기능별 마진 */}
      <section className="rounded-xl border border-gray-100 bg-white">
        <div className="border-b border-gray-50 px-5 py-4">
          <h2 className="text-[14px] font-semibold text-gray-800">기능별 원가 · 판매가 · 마진</h2>
          <p className="mt-1 text-[12px] text-gray-400">
            각 단가 셀: 상단 판매가 / 하단 마진율. 마진율 색상 — 초록 ≥70% · 노랑 40~70% · 빨강 &lt;40%.
            원가는 API 호출 1회 평균이고 판매가는 액션 1건 기준이라, 1액션이 여러 번 호출하는
            기능은 마진율이 실제보다 높게 보입니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 min-w-[150px] pl-5 text-[12px] font-medium text-gray-400">기능</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">크레딧</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">원가</TableHead>
                {data.tiers.map((tier) => (
                  <TableHead key={tier.key} className="h-auto py-2 text-right text-[12px] font-medium text-gray-400">
                    <span className="block whitespace-nowrap">{tier.label}</span>
                    <span className="block whitespace-nowrap text-[10px] font-normal text-gray-400">
                      {tier.basis === "realized" ? "실판매" : "정가"} {perCreditText(tier.perCredit)}/C
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.features.map((feature) => (
                <AdminHoverDetail key={feature.operationType} title={feature.label} detail={featureDetail(feature, data)}>
                  <TableRow className="cursor-pointer hover:bg-gray-50/50">
                    <TableCell className="min-w-[150px] pl-5 text-[13px] font-medium text-gray-800">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{feature.label}</span>
                        {feature.planSensitive && (
                          <Badge className="border-0 bg-violet-100 px-1.5 py-0 text-[10px] font-semibold text-violet-700">
                            플랜별
                          </Badge>
                        )}
                      </div>
                      {feature.note && (
                        <p className="mt-0.5 text-[11px] font-normal text-gray-400">{feature.note}</p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-[13px] text-gray-600">
                      {feature.credits === 0 ? (
                        <span className="text-emerald-600">무료</span>
                      ) : (
                        `${feature.credits}C`
                      )}
                      {realizedGap(feature) && (
                        <span
                          className="mt-0.5 block text-[11px] font-normal text-amber-600"
                          title={`같은 기간 실청구 ${formatNumber(feature.actionCount)}건 평균 — 최소 청구·묶음 청구·부분환불·단가 변경으로 상수(${feature.credits}C)와 다를 수 있습니다. 판매가·마진은 상수 기준입니다.`}
                        >
                          실청구 평균 {realizedGap(feature)}C
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-gray-900">{formatCurrency(feature.costKrw)}</p>
                      <p className="mt-0.5 text-[11px] font-normal text-gray-400">
                        {feature.costSource === "actual" ? (
                          <>실측 {formatNumber(feature.sampleCount)}건</>
                        ) : (
                          <span className="text-amber-500">추정</span>
                        )}
                      </p>
                    </TableCell>
                    {feature.sell.map((cell) => (
                      <TableCell key={cell.label} className="whitespace-nowrap text-right">
                        <p className="text-[13px] font-medium tabular-nums text-gray-800">
                          {feature.credits === 0 ? "—" : formatCurrency(cell.price)}
                        </p>
                        <p className={cn("mt-0.5 text-[11px] font-semibold", marginToneClass(cell.marginPct))}>
                          {cell.marginPct === null ? "순비용" : `${cell.marginPct}%`}
                        </p>
                      </TableCell>
                    ))}
                  </TableRow>
                </AdminHoverDetail>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-gray-50 px-5 py-3 text-[11px] leading-relaxed text-gray-400">
          <span className="font-semibold text-violet-500">플랜별</span> 표시 기능은 학원이 PREMIUM 플랜이면 Claude
          모델을 써 원가가 3~5배 오릅니다(표는 기본/STANDARD·실측 기준). PREMIUM + 엔터프라이즈 조합이 마진 최저.
          텍스트 추출은 무료 제공이라 판매가 없이 원가만 발생(순비용).
        </div>
      </section>
    </div>
  );
}
