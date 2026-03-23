import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getTodayAttendance,
  getAttendanceReport,
  getMissingStudents,
} from "@/actions/attendance";
import { AttendanceDashboardClient } from "./dashboard-client";

export default async function AttendanceDashboardPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [todayData, report, missing] = await Promise.all([
    getTodayAttendance(staff.academyId),
    getAttendanceReport(staff.academyId, new Date()),
    getMissingStudents(staff.academyId),
  ]);

  return (
    <AttendanceDashboardClient
      todayData={todayData}
      report={report}
      missingStudents={missing}
    />
  );
}
