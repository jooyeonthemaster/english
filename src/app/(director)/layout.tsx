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
    // 로그인 후 사실상의 홈(문제 생성)으로 곧장 보낸다. "/director" 로 두면 로그인
    // 직후 config redirect(/director → 문제 생성)를 한 번 더 거치는 hop 이 생기므로
    // 최종 목적지를 콜백에 그대로 박는다. (auth-redirect.ts DEFAULT_DIRECTOR_REDIRECT)
    redirect("/login?callbackUrl=/director/workbench/questions/generate");
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
