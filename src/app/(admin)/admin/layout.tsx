import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth-admin";
import { SuperAdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return (
    <SuperAdminShell
      admin={{
        adminId: session.adminId,
        name: session.name,
        email: session.email,
        role: session.role,
      }}
    >
      {children}
    </SuperAdminShell>
  );
}
