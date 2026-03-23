import { getSalaries } from "@/actions/finance";
import { SalariesClient } from "./salaries-client";

export const metadata = {
  title: "급여 관리 | NARA",
};

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function SalariesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const currentMonth =
    params.month ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const salaryData = await getSalaries(currentMonth);

  return (
    <SalariesClient
      salaryData={salaryData}
      currentMonth={currentMonth}
    />
  );
}
