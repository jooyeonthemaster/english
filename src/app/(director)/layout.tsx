import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";

export default async function DirectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaffSession();

  if (!staff) {
    redirect("/login?callbackUrl=/director");
  }

  if (staff.role !== "DIRECTOR") {
    redirect("/teacher");
  }

  return (
    <AdminShell staff={staff} basePath="/director">
      {children}
    </AdminShell>
  );
}
