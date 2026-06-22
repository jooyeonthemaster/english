import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { WebtoonPageClient } from "./webtoon-page-client";

export default async function WebtoonPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <WebtoonPageClient academyId={staff.academyId} />;
}
