import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { WebtoonLibraryClient } from "./library-page-client";

export default async function WebtoonLibraryPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <WebtoonLibraryClient academyId={staff.academyId} />;
}
