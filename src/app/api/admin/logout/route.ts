import { NextResponse } from "next/server";
import { logoutAdmin } from "@/lib/auth-admin";

export async function POST() {
  await logoutAdmin();
  return NextResponse.json({ success: true });
}
