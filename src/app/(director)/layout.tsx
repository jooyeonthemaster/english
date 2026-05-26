import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";
import { JooyeonWelcomeModal } from "@/components/layout/jooyeon-welcome-modal";
import { ReviewDrawerProvider } from "@/components/layout/review-drawer-context";
import { TaskQueueRouteHost } from "@/components/workbench/task-queue";

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
    <ReviewDrawerProvider>
      <AdminShell staff={staff} basePath="/director">
        <TaskQueueRouteHost>
          {children}
          <JooyeonWelcomeModal staffEmail={staff.email} />
        </TaskQueueRouteHost>
      </AdminShell>
    </ReviewDrawerProvider>
  );
}
