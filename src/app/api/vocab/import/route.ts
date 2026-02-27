import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const listId = formData.get("listId") as string | null;

    if (!file || !listId) {
      return NextResponse.json(
        { error: "File and listId are required" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

    // Skip header if present
    const header = lines[0].toLowerCase();
    const startIndex = header.includes("english") || header.includes("\uc601\ub2e8\uc5b4") ? 1 : 0;

    const items: Array<{
      english: string;
      korean: string;
      partOfSpeech?: string;
      exampleEn?: string;
      exampleKr?: string;
    }> = [];

    for (let i = startIndex; i < lines.length; i++) {
      // Support both comma and tab separation
      const parts = lines[i].includes("\t")
        ? lines[i].split("\t")
        : lines[i].split(",").map(s => s.trim().replace(/^"|"$/g, ""));

      if (parts.length >= 2) {
        items.push({
          english: parts[0].trim(),
          korean: parts[1].trim(),
          partOfSpeech: parts[2]?.trim() || undefined,
          exampleEn: parts[3]?.trim() || undefined,
          exampleKr: parts[4]?.trim() || undefined,
        });
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No valid items found in CSV" },
        { status: 400 }
      );
    }

    // Get current max order
    const maxOrder = await prisma.vocabularyItem.aggregate({
      where: { listId },
      _max: { order: true },
    });
    let currentOrder = (maxOrder._max.order || 0) + 1;

    // Create items
    const created = await prisma.vocabularyItem.createMany({
      data: items.map((item) => ({
        listId,
        english: item.english,
        korean: item.korean,
        partOfSpeech: item.partOfSpeech || null,
        exampleEn: item.exampleEn || null,
        exampleKr: item.exampleKr || null,
        order: currentOrder++,
      })),
    });

    return NextResponse.json({
      success: true,
      count: created.count,
      message: `${created.count}\uac1c\uc758 \ub2e8\uc5b4\uac00 \ucd94\uac00\ub418\uc5c8\uc2b5\ub2c8\ub2e4`,
    });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json(
      { error: "CSV \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4" },
      { status: 500 }
    );
  }
}
