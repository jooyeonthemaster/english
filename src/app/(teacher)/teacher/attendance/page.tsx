import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getTeacherClasses } from "@/actions/attendance";
import { TeacherAttendanceClient } from "./teacher-attendance-client";

export default async function TeacherAttendancePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const classes = await getTeacherClasses(staff.id);

  return (
    <TeacherAttendanceClient
      academyId={staff.academyId}
      classes={classes}
      staffName={staff.name}
    />
  );
}
