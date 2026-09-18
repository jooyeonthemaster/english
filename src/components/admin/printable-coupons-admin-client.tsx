"use client";

// ============================================================================
// 실물 쿠폰(/admin/coupons) — 배치 목록이 먼저, 발급은 머리 버튼 → 팝업.
//   · 발급 폼·배치 표·인쇄 핸드오프는 printable-coupons-admin-client-parts/ 로 분리.
//   · 서버 액션·데이터 흐름은 그대로(로직 무변경).
// ============================================================================

import { useCallback, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  FilterBar,
  FilterChipGroup,
  PageHeader,
  ResultCount,
  SearchInput,
  SectionCard,
  useConfirm,
} from "@/components/admin/kit";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Button } from "@/components/ui/button";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import {
  listPrintableCouponBatches,
  setBatchActive,
  voidPrintableCoupons,
  type BatchListRow,
  type ListBatchesResult,
} from "@/actions/admin/printable-coupons";
import { BatchTable } from "./printable-coupons-admin-client-parts/batch-table";
import { EFFECT_OPTIONS } from "./printable-coupons-admin-client-parts/effect-options";
import { IssueCouponDialog } from "./printable-coupons-admin-client-parts/issue-coupon-dialog";
import { openPrintTab } from "./printable-coupons-admin-client-parts/print-handoff";

// 인쇄 뷰(coupon-print-view)가 이 경로에서 타입을 가져간다 — 경로 유지.
export type { PrintHandoff } from "./printable-coupons-admin-client-parts/print-handoff";

const FILTER_OPTIONS = [
  { key: "all", label: "전체" },
  ...EFFECT_OPTIONS.map((o) => ({ key: o.value as string, label: o.label })),
];

export function PrintableCouponsAdminClient({
  initial,
}: {
  initial: ListBatchesResult;
}) {
  const [data, setData] = useState<ListBatchesResult>(initial);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [effectFilter, setEffectFilter] = useState<string>("all");
  const [issueOpen, setIssueOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const reload = useCallback(
    (next: { page?: number; search?: string; effectType?: string }) => {
      startTransition(async () => {
        const res = await listPrintableCouponBatches({
          page: next.page ?? 1,
          pageSize: data.pageSize,
          search: next.search ?? search,
          effectType:
            (next.effectType ?? effectFilter) === "all"
              ? undefined
              : next.effectType ?? effectFilter,
        });
        setData(res);
      });
    },
    [data.pageSize, search, effectFilter],
  );

  const { schedule, flush } = useSearchDebounce((value) =>
    reload({ page: 1, search: value }),
  );

  function toggleActive(row: BatchListRow) {
    startTransition(async () => {
      const res = await setBatchActive({ batchId: row.id, isActive: !row.isActive });
      if (!res.success) toast.error(res.error);
      else toast.success(row.isActive ? "배치를 일시중지했습니다." : "배치를 다시 활성화했습니다.");
      reload({ page: data.page });
    });
  }

  async function voidBatch(row: BatchListRow) {
    const active = row.counts.ACTIVE;
    if (active === 0) {
      toast.error("영구중지할 미등록(ACTIVE) 코드가 없습니다.");
      return;
    }
    const ok = await confirm({
      title: `미등록 코드 ${active}장을 영구중지할까요?`,
      description: "되돌릴 수 없습니다. 이미 등록/사용된 코드는 유지됩니다.",
      confirmLabel: "영구중지",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await voidPrintableCoupons({ batchId: row.id });
      if (!res.success) toast.error(res.error);
      else toast.success(`${res.voided}장을 영구중지했습니다.`);
      reload({ page: data.page });
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="실물 쿠폰"
        description="8자리 코드 + QR이 박힌 실물 쿠폰을 배치로 발급·인쇄합니다. 원장이 QR·코드로 등록하면 크레딧이 즉시 지급되거나(교환권), 다음 충전 결제 때 할인됩니다."
        actions={
          <Button type="button" onClick={() => setIssueOpen(true)}>
            <Plus className="size-4" strokeWidth={2} />
            쿠폰 발급
          </Button>
        }
      />

      <FilterBar
        right={<ResultCount total={data.total} page={data.page} totalPages={totalPages} />}
      >
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            // 지우면 즉시 원복, 입력 중엔 250ms 디바운스.
            if (value === "") flush("");
            else schedule(value);
          }}
          onEnter={() => flush(search)}
          placeholder="라벨·쿠폰명 검색"
          ariaLabel="쿠폰 배치 검색"
        />
        <FilterChipGroup
          options={FILTER_OPTIONS}
          value={effectFilter}
          onChange={(key) => {
            setEffectFilter(key);
            reload({ page: 1, effectType: key });
          }}
          ariaLabel="쿠폰 효과 필터"
        />
      </FilterBar>

      <SectionCard padded={false}>
        <BatchTable
          rows={data.rows}
          loading={isPending}
          onToggleActive={toggleActive}
          onVoid={voidBatch}
        />
        <AdminPagination
          page={data.page}
          totalPages={totalPages}
          disabled={isPending}
          onChange={(p) => reload({ page: p })}
        />
      </SectionCard>

      <IssueCouponDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        onIssued={(batchId, handoff) => {
          openPrintTab(batchId, handoff);
          reload({ page: 1 });
        }}
      />
    </div>
  );
}
