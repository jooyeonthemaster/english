import { requireAdminAuth } from "@/lib/auth-admin";
import { BankDepositsAdminClient } from "@/components/admin/bank-deposits-admin-client";

type PageProps = {
  searchParams: Promise<{ status?: string; view?: string }>;
};

export default async function AdminBankDepositsPage({ searchParams }: PageProps) {
  await requireAdminAuth();
  const { status, view } = await searchParams;
  return (
    <BankDepositsAdminClient
      initialStatus={status}
      focusPending={view === "pending"}
    />
  );
}
