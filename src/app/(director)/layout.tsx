import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";
import { JooyeonWelcomeModal } from "@/components/layout/jooyeon-welcome-modal";
import { SiteBannerHost } from "@/components/site-banners/site-banner-host";
import { ReviewDrawerProvider } from "@/components/layout/review-drawer-context";
import { SidebarFocusProvider } from "@/components/layout/sidebar-focus-context";
import { ActivityTracker } from "@/components/layout/activity-tracker";
import { ManualQuickAccessHost } from "@/components/manual/manual-quick-access-host";
import { TaskQueueRouteHost } from "@/components/workbench/task-queue";
import { getStaticManualManifest, STATIC_MANUAL_PUBLIC_BASE } from "@/lib/manual/static-manual";
import { getManualSectionVisibility } from "@/lib/platform-settings";

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

  const manualManifest = getStaticManualManifest();
  const manualVisibility = manualManifest ? await getManualSectionVisibility() : {};
  const visibleManualGroups = manualManifest
    ? manualManifest.groups.filter((group) => manualVisibility[group.slug] !== false)
    : [];

  return (
    <ReviewDrawerProvider>
      <SidebarFocusProvider>
        <AdminShell staff={staff} basePath="/director">
          <TaskQueueRouteHost>
            {children}
            <ManualQuickAccessHost
              assetBase={STATIC_MANUAL_PUBLIC_BASE}
              entries={manualManifest?.entries ?? []}
              groups={visibleManualGroups}
            />
            <ActivityTracker />
            <JooyeonWelcomeModal staffEmail={staff.email} />
            <SiteBannerHost />
          </TaskQueueRouteHost>
        </AdminShell>
      </SidebarFocusProvider>
    </ReviewDrawerProvider>
  );
}
