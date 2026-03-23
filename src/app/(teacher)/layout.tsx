import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaffSession();

  if (!staff) {
    redirect("/login?callbackUrl=/teacher");
  }

  // Both DIRECTOR and TEACHER can access teacher routes
  if (staff.role !== "DIRECTOR" && staff.role !== "TEACHER") {
    redirect("/login");
  }

  return (
    <AdminShell staff={staff} basePath="/teacher">
      {children}
    </AdminShell>
  );
}
