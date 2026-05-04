import { generateText } from "ai";
import { model } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";

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

    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "TEXT_EXTRACTION", staff.id);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

    let text: string;
    try {
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
                text: `이 이미지에서 영어 지문 텍스트를 정확하게 추출해주세요.

규칙:
- 영어 본문 텍스트만 추출하세요
- 문제 번호, 보기, 한글 해설 등은 제외하세요
- 줄바꿈과 문단 구분을 원본 그대로 유지하세요
- OCR 오류가 있을 수 있는 부분은 문맥에 맞게 교정하세요
- 추출한 텍스트만 출력하고, 부가 설명은 하지 마세요`,
              },
            ],
          },
        ],
      });
      text = result.text;
    } catch (aiError) {
      await refundCredits(staff.academyId, "TEXT_EXTRACTION", creditResult.transactionId, "Text extraction failed");
      throw aiError;
    }

    return NextResponse.json({ text: text.trim(), creditsRemaining: creditResult.balanceAfter });
  } catch (error) {
    console.error("OCR extraction error:", error);
    return NextResponse.json(
      { error: "텍스트 추출에 실패했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
