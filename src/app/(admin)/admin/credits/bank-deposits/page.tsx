import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ status?: string; view?: string }>;
};

// 결제 관리(/admin/credit-plans)의 "입금 확인" 탭으로 통합됨.
// 기존 링크·북마크·운영 알림 링크가 계속 동작하도록 필터를 그대로 넘겨 리다이렉트한다.
export default async function AdminBankDepositsPage({ searchParams }: PageProps) {
  const { status, view } = await searchParams;
  const params = new URLSearchParams({ tab: "deposits" });
  if (status) params.set("status", status);
  if (view) params.set("view", view);
  redirect(`/admin/credit-plans?${params.toString()}`);
}
