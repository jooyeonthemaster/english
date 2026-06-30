import { requireAdminAuth } from "@/lib/auth-admin";
import { BankDepositsAdminClient } from "@/components/admin/bank-deposits-admin-client";

export default async function AdminBankDepositsPage() {
  await requireAdminAuth();
  return <BankDepositsAdminClient />;
}
