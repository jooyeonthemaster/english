import { AdminTabs, type AdminTab } from "@/components/admin/kit";
import type { CostView } from "../_lib/costs-period";

// 서버가 ?view= 로 다시 렌더하는 탭 — 링크로 동작한다.
const TABS: ReadonlyArray<AdminTab<CostView>> = [
  { key: "dashboard", label: "손익 대시보드", href: "/admin/costs" },
  { key: "margin", label: "기능별 마진", href: "/admin/costs?view=margin" },
  { key: "settings", label: "정산·단가", href: "/admin/costs?view=settings" },
];

export function CostTabs({ view }: { view: CostView }) {
  return <AdminTabs ariaLabel="원가 분석 화면" tabs={TABS} value={view} />;
}
