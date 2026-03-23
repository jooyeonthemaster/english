import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getClasses } from "@/actions/classes";
import { ClassListClient } from "./class-list-client";

export default async function ClassesPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const classes = await getClasses(staff.academyId);

  return <ClassListClient classes={classes} academyId={staff.academyId} />;
}
