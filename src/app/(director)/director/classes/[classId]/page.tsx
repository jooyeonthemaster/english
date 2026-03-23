import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getClass } from "@/actions/classes";
import { ClassDetailClient } from "./class-detail-client";

interface Props {
  params: Promise<{ classId: string }>;
}

export default async function ClassDetailPage({ params }: Props) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { classId } = await params;
  const classData = await getClass(classId);

  if (!classData) notFound();

  return (
    <ClassDetailClient
      classData={classData}
      academyId={staff.academyId}
    />
  );
}
