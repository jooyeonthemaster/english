import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getReportsList } from "@/actions/reports";
import { ReportsManagementClient } from "./reports-management-client";

export default async function DirectorReportsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director/reports");
  if (staff.role !== "DIRECTOR") redirect("/teacher");

  const reports = await getReportsList();

  // Get classes for bulk generation
  const { prisma } = await import("@/lib/prisma");
  const classes = await prisma.class.findMany({
    where: { academyId: staff.academyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const students = await prisma.student.findMany({
    where: { academyId: staff.academyId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <ReportsManagementClient
      reports={reports}
      classes={classes}
      students={students}
    />
  );
}
