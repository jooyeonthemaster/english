import { Suspense } from "react";
import { getInvoices, getBillingSummary, getOverdueInvoices } from "@/actions/billing";
import { BillingDashboardClient } from "./billing-dashboard-client";

export const metadata = {
  title: "수납 관리 | NARA",
};

interface PageProps {
  searchParams: Promise<{
    month?: string;
    status?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function BillingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentMonth =
    params.month ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const [invoiceResult, summary, overdueList] = await Promise.all([
    getInvoices({
      month: params.month || undefined,
      status: params.status || undefined,
      search: params.search || undefined,
      page: params.page ? parseInt(params.page) : 1,
    }),
    getBillingSummary(currentMonth),
    getOverdueInvoices(),
  ]);

  return (
    <Suspense fallback={<BillingLoadingSkeleton />}>
      <BillingDashboardClient
        invoices={invoiceResult.invoices}
        total={invoiceResult.total}
        page={invoiceResult.page}
        totalPages={invoiceResult.totalPages}
        summary={summary}
        overdueList={overdueList}
        currentMonth={currentMonth}
        currentStatus={params.status || "ALL"}
        currentSearch={params.search || ""}
      />
    </Suspense>
  );
}

function BillingLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[120px] animate-pulse rounded-xl border border-[#F2F4F6] bg-white" />
        ))}
      </div>
      <div className="h-[400px] animate-pulse rounded-xl border border-[#F2F4F6] bg-white" />
    </div>
  );
}
