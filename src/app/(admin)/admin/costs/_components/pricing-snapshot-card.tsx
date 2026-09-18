import { createProviderPricing } from "@/actions/admin";
import type { OperationsCostDashboard } from "@/actions/admin/operations-cost-types";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  SectionCard,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatNumber } from "@/lib/utils";
import * as hoverDetail from "../_lib/costs-hover-detail";

const INPUT_CLASS = "text-[13px]";

/** 단가 스냅샷 — 활성 단가 표 + 단가 추가 폼 */
export function PricingSnapshotCard({
  dashboard,
  effectiveFromValue,
}: {
  dashboard: OperationsCostDashboard;
  effectiveFromValue: string;
}) {
  return (
    <SectionCard title="단가 스냅샷" description="호출별 원장 계산에 적용되는 활성 단가">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.3fr]">
        <SectionCard title="단가 추가" description="공급자·모델 패턴별 USD 단가와 적용 시작일">
          <form action={createProviderPricing} className="grid grid-cols-2 gap-2">
            <Select name="provider" defaultValue="OPENROUTER">
              <SelectTrigger className={cn("w-full", INPUT_CLASS)} aria-label="공급자">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                <SelectItem value="GOOGLE_GEMINI">Google Gemini</SelectItem>
                <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                <SelectItem value="GOOGLE_DOCUMENT_AI">Google Document AI</SelectItem>
                <SelectItem value="ATLASCLOUD">AtlasCloud</SelectItem>
              </SelectContent>
            </Select>
            <Select name="unitType" defaultValue="TOKENS">
              <SelectTrigger className={cn("w-full", INPUT_CLASS)} aria-label="단위">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOKENS">TOKENS</SelectItem>
                <SelectItem value="PAGE">PAGE</SelectItem>
                <SelectItem value="IMAGE">IMAGE</SelectItem>
                <SelectItem value="CALL">CALL</SelectItem>
              </SelectContent>
            </Select>
            <Input name="modelPattern" placeholder="model pattern" className={INPUT_CLASS} />
            <Input
              type="date"
              name="effectiveFrom"
              defaultValue={effectiveFromValue}
              aria-label="적용 시작일"
              className={INPUT_CLASS}
            />
            <Input
              type="number"
              step="0.000001"
              min="0"
              name="inputUsdPer1M"
              placeholder="input $/1M"
              className={INPUT_CLASS}
            />
            <Input
              type="number"
              step="0.000001"
              min="0"
              name="outputUsdPer1M"
              placeholder="output $/1M"
              className={INPUT_CLASS}
            />
            <Input
              type="number"
              step="0.000001"
              min="0"
              name="unitUsd"
              placeholder="unit $"
              className={INPUT_CLASS}
            />
            <Input
              type="number"
              step="0.0001"
              min="0"
              name="usdToKrwRate"
              defaultValue={dashboard.usdToKrwRate}
              aria-label="적용 환율"
              className={INPUT_CLASS}
            />
            <Input name="notes" placeholder="memo" className={cn("col-span-2", INPUT_CLASS)} />
            <Button type="submit" size="sm" className="col-span-2">
              단가 추가
            </Button>
          </form>
        </SectionCard>

        <DataTable>
          <DataTableHeader>
            <Tr>
              <Th>Provider</Th>
              <Th>단위</Th>
              <Th align="right">입력</Th>
              <Th align="right">출력/단위</Th>
              <Th align="right">환율</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {dashboard.providerPricings.length === 0 ? (
              <DataTableEmpty colSpan={5}>
                <AdminEmptyState compact title="활성 단가가 없습니다" />
              </DataTableEmpty>
            ) : (
              dashboard.providerPricings.map((pricing) => (
                <AdminHoverDetail
                  key={pricing.id}
                  title={pricing.provider}
                  detail={hoverDetail.pricingRowDetail(pricing)}
                >
                  <Tr clickable>
                    <Td className="font-medium text-gray-800">
                      {pricing.provider}
                      {pricing.modelPattern && (
                        <span className="ml-1 font-normal text-gray-400">{pricing.modelPattern}</span>
                      )}
                    </Td>
                    <Td className="text-gray-500">{pricing.unitType}</Td>
                    <Td align="right" className="font-normal text-gray-700">
                      {pricing.inputUsdPer1M === null ? "-" : `$${pricing.inputUsdPer1M}`}
                    </Td>
                    <Td align="right" className="font-normal text-gray-700">
                      {pricing.unitType === "TOKENS"
                        ? pricing.outputUsdPer1M === null
                          ? "-"
                          : `$${pricing.outputUsdPer1M}`
                        : pricing.unitUsd === null
                          ? "-"
                          : `$${pricing.unitUsd}`}
                    </Td>
                    <Td align="right" className="font-normal text-gray-500">
                      {formatNumber(pricing.usdToKrwRate)}
                    </Td>
                  </Tr>
                </AdminHoverDetail>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </div>
    </SectionCard>
  );
}
