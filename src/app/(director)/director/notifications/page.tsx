import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = {
  title: "알림",
};

export default async function NotificationsPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <NotificationsClient />;
}
