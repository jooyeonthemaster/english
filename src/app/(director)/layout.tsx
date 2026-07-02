import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";
import { JooyeonWelcomeModal } from "@/components/layout/jooyeon-welcome-modal";
import { SiteBannerHost } from "@/components/site-banners/site-banner-host";
import { ReviewDrawerProvider } from "@/components/layout/review-drawer-context";
import { SidebarFocusProvider } from "@/components/layout/sidebar-focus-context";
import { ActivityTracker } from "@/components/layout/activity-tracker";
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
      <SidebarFocusProvider>
        <AdminShell staff={staff} basePath="/director">
          <TaskQueueRouteHost>
            {children}
            <ActivityTracker />
            <JooyeonWelcomeModal staffEmail={staff.email} />
            <SiteBannerHost />
          </TaskQueueRouteHost>
        </AdminShell>
      </SidebarFocusProvider>
    </ReviewDrawerProvider>
  );
}
