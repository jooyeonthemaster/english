import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getClassesForAttendance } from "@/actions/attendance";
import { AttendanceClient } from "./attendance-client";

export default async function AttendancePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const classes = await getClassesForAttendance(staff.academyId);

  return (
    <AttendanceClient
      academyId={staff.academyId}
      classes={classes}
    />
  );
}
