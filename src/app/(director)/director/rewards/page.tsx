import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { RewardsClient } from "./rewards-client";

export const metadata: Metadata = {
  title: "크레딧 미션",
};

export default async function RewardsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <RewardsClient />;
}
