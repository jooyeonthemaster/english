import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_FEATURES = new Set([
  "students",
  "classes",
  "attendance",
  "assignments",
  "billing",
  "finance",
  "salaries",
  "messages",
  "consultations",
  "calendar",
  "analytics",
  "reports",
]);

type CountRow = { count: bigint };

export async function GET(request: NextRequest) {
  const feature = request.nextUrl.searchParams.get("feature");
  if (!feature) {
    return NextResponse.json({ error: "missing_feature" }, { status: 400 });
  }
  if (!ALLOWED_FEATURES.has(feature)) {
    return NextResponse.json({ error: "unknown_feature" }, { status: 400 });
  }

  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT count FROM public.feature_pressure WHERE feature = ${feature} LIMIT 1
  `;
  const count = rows[0]?.count ?? BigInt(0);
  return NextResponse.json({ feature, count: Number(count) });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const feature = body && typeof body === "object" ? (body as { feature?: string }).feature : null;

  if (!feature || typeof feature !== "string") {
    return NextResponse.json({ error: "missing_feature" }, { status: 400 });
  }
  if (!ALLOWED_FEATURES.has(feature)) {
    return NextResponse.json({ error: "unknown_feature" }, { status: 400 });
  }

  const rows = await prisma.$queryRaw<CountRow[]>`
    INSERT INTO public.feature_pressure (feature, count, updated_at)
    VALUES (${feature}, 1, now())
    ON CONFLICT (feature)
    DO UPDATE SET count = public.feature_pressure.count + 1, updated_at = now()
    RETURNING count
  `;

  const count = rows[0]?.count ?? BigInt(0);
  return NextResponse.json({ feature, count: Number(count) });
}
