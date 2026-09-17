import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CostPeriodControls } from "@/components/admin/cost-period-controls";
import { SectionCard } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import type { CostPeriodMode } from "@/actions/admin/operations-cost-types";
import type { CostView } from "../_lib/costs-period";

export type PeriodState = {
  mode: CostPeriodMode;
  dateValue: string;
  monthValue: string;
  startValue: string | null;
  endValue: string | null;
  isRange: boolean;
  /** 현재 탭을 URL 에 유지(기간 이동 시 탭이 풀리지 않게) */
  view?: CostView;
};

/** 기간 이동(이전·다음) + 집계 단위 컨트롤을 한 줄에 담는 바. */
export function PeriodBar({
  caption,
  label,
  prevHref,
  nextHref,
  period,
}: {
  caption: string;
  label: string;
  prevHref: string;
  nextHref: string;
  period: PeriodState;
}) {
  return (
    <SectionCard>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon-sm" aria-label="이전">
            <Link href={prevHref} title="이전">
              <ChevronLeft className="size-4" strokeWidth={2} />
            </Link>
          </Button>
          <div className="min-w-0 px-2">
            <p className="text-[12px] font-medium text-gray-400">{caption}</p>
            <p className="truncate text-[22px] font-bold leading-tight text-gray-900">{label}</p>
          </div>
          <Button asChild variant="outline" size="icon-sm" aria-label="다음">
            <Link href={nextHref} title="다음">
              <ChevronRight className="size-4" strokeWidth={2} />
            </Link>
          </Button>
        </div>

        <CostPeriodControls
          mode={period.mode}
          dateValue={period.dateValue}
          monthValue={period.monthValue}
          startValue={period.startValue}
          endValue={period.endValue}
          isRange={period.isRange}
          view={period.view}
        />
      </div>
    </SectionCard>
  );
}
