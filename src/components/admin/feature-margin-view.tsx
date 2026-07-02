import { Coins, Info } from "lucide-react";
import type { FeatureMarginAnalysis } from "@/actions/admin/feature-margin";
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

function formatBadgeDate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return match ? `${match[2]}.${match[3]}` : dateStr;
}

function marginToneClass(pct: number | null): string {
  if (pct === null) return "text-gray-400";
  if (pct >= 70) return "text-emerald-600";
  if (pct >= 40) return "text-amber-600";
  return "text-rose-600";
}

export function FeatureMarginView({ data }: { data: FeatureMarginAnalysis }) {
  const estimateCount = data.features.filter((f) => f.costSource === "estimate").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-800">
        <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
        <div>
          <p className="font-semibold">기능별 원가 대비 판매가(마진) 분석</p>
          <p className="mt-1 text-sky-700">
            원가는 AI 호출 단가만 반영(고정 인프라 제외). 판매가 = 기능 크레딧 × 팩별 크레딧 단가.
            {estimateCount > 0 &&
              ` ${estimateCount}개 기능은 실사용 기록 전이라 추정치 사용.`}{" "}
            실측 기록이 쌓이면 자동 갱신됩니다.
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
        <div className="flex items-center justify-between border-b border-gray-50 px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">크레딧 팩 단가</h2>
            <p className="mt-1 text-[12px] text-gray-400">
              팩별 크레딧 1개당 판매 단가 — 판매가 계산 기준
            </p>
          </div>
          <Coins className="size-4 text-gray-400" strokeWidth={1.8} />
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[360px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 min-w-[120px] pl-5 text-[12px] font-medium text-gray-400">팩</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">크레딧</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">가격</TableHead>
                <TableHead className="h-9 pr-5 text-right text-[12px] font-medium text-gray-400">크레딧당</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tiers.map((tier) => (
                <TableRow key={tier.label} className="hover:bg-gray-50/50">
                  <TableCell className="pl-5 text-[13px] font-medium text-gray-800">{tier.label}</TableCell>
                  <TableCell className="text-right text-[13px] text-gray-600">{formatNumber(tier.credits)}C</TableCell>
                  <TableCell className="text-right text-[13px] text-gray-600">{formatCurrency(tier.price)}</TableCell>
                  <TableCell className="pr-5 text-right text-[13px] font-semibold text-gray-900">{tier.perCredit}원</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* 기능별 마진 */}
      <section className="rounded-xl border border-gray-100 bg-white">
        <div className="border-b border-gray-50 px-5 py-4">
          <h2 className="text-[14px] font-semibold text-gray-800">기능별 원가 · 판매가 · 마진</h2>
          <p className="mt-1 text-[12px] text-gray-400">
            각 팩 셀: 상단 판매가 / 하단 마진율. 마진율 색상 — 초록 ≥70% · 노랑 40~70% · 빨강 &lt;40%
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 min-w-[150px] pl-5 text-[12px] font-medium text-gray-400">기능</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">크레딧</TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">원가</TableHead>
                {data.tiers.map((tier) => (
                  <TableHead key={tier.label} className="h-9 text-right text-[12px] font-medium text-gray-400">
                    {tier.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.features.map((feature) => (
                <TableRow key={feature.operationType} className="hover:bg-gray-50/50">
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
                  <TableCell className="text-right text-[13px] text-gray-600">
                    {feature.credits === 0 ? (
                      <span className="text-emerald-600">무료</span>
                    ) : (
                      `${feature.credits}C`
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <p className="text-[13px] font-semibold text-gray-900">{formatCurrency(feature.costKrw)}</p>
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
                      <p className="text-[13px] font-medium text-gray-800">
                        {feature.credits === 0 ? "—" : formatCurrency(cell.price)}
                      </p>
                      <p className={cn("mt-0.5 text-[11px] font-semibold", marginToneClass(cell.marginPct))}>
                        {cell.marginPct === null ? "순비용" : `${cell.marginPct}%`}
                      </p>
                    </TableCell>
                  ))}
                </TableRow>
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
