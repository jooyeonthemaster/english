import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getCreditTransactions } from "@/lib/credits";

export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const type = searchParams.get("type") || undefined;

    const result = await getCreditTransactions(staff.academyId, {
      limit,
      offset,
      type,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[credits/transactions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit transactions" },
      { status: 500 },
    );
  }
}
