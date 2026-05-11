import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";
import { JooyeonWelcomeModal } from "@/components/layout/jooyeon-welcome-modal";

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
      <JooyeonWelcomeModal staffEmail={staff.email} />
    </AdminShell>
  );
}
