import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const session = await getStudentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await params;

  const list = await prisma.vocabularyList.findUnique({
    where: { id: listId },
    include: {
      items: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          english: true,
          korean: true,
          partOfSpeech: true,
          exampleEn: true,
          exampleKr: true,
        },
      },
    },
  });

  if (!list) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    listId: list.id,
    title: list.title,
    items: list.items,
  });
}
