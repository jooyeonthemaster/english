import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

import { GEMINI_MODEL_ID, model } from "@/lib/ai";
import { getStaffSession } from "@/lib/auth";
import { recordAiCost } from "@/lib/platform-api-costs";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "이미지가 없습니다." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type as
      | "image/png"
      | "image/jpeg"
      | "image/webp"
      | "image/gif";

    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: `data:${mimeType};base64,${base64}`,
            },
            {
              type: "text",
              text: [
                "이미지에서 영어 지문 텍스트를 정확하게 추출해 주세요.",
                "",
                "규칙:",
                "- 영어 본문 텍스트만 추출하세요.",
                "- 문제 번호, 보기, 해설 등은 제외하세요.",
                "- 줄바꿈과 문단 구분은 원본 흐름을 최대한 보존하세요.",
                "- OCR 오류가 있어 보이는 부분은 문맥에 맞게 교정하세요.",
                "- 추가 설명 없이 추출된 텍스트만 출력하세요.",
              ].join("\n"),
            },
          ],
        },
      ],
    });

    await recordAiCost({
      sourceType: "AI_INTERACTIVE",
      sourceDetail: "extract-text",
      academyId: staff.academyId,
      model: GEMINI_MODEL_ID,
      operationType: "TEXT_EXTRACTION",
      usage: result.usage,
    });

    return NextResponse.json({ text: result.text.trim() });
  } catch (error) {
    console.error("OCR extraction error:", error);
    return NextResponse.json(
      { error: "텍스트 추출에 실패했습니다. 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
