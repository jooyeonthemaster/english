import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ schoolSlug: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const passages = await prisma.passage.findMany({
    where: { schoolId: school.id },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(passages);
}
