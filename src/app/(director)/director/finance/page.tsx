import {
  getFinanceSummary,
  getRevenueTrend,
  getCollectionRateTrend,
  getExpenses,
} from "@/actions/finance";
import { FinanceDashboardClient } from "./finance-dashboard-client";

export const metadata = {
  title: "재무 관리 | 영신ai",
};

interface PageProps {
  searchParams: Promise<{
    category?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  }>;
}

export default async function FinancePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const [summary, trend, collectionRate, expenseResult] = await Promise.all([
    getFinanceSummary(),
    getRevenueTrend(),
    getCollectionRateTrend(),
    getExpenses({
      category: params.category || undefined,
      startDate: params.startDate || undefined,
      endDate: params.endDate || undefined,
      page: params.page ? parseInt(params.page) : 1,
    }),
  ]);

  return (
    <FinanceDashboardClient
      summary={summary}
      trend={trend}
      collectionRate={collectionRate}
      expenses={expenseResult.expenses}
      expenseTotal={expenseResult.total}
      expensePage={expenseResult.page}
      expenseTotalPages={expenseResult.totalPages}
      currentCategory={params.category || "ALL"}
    />
  );
}
