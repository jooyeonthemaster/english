import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import {
  transformRequestSchema,
  type TransformResponse,
} from "@/lib/passage-transform/schema";
import { runParaphrase, runPrepend } from "@/lib/passage-transform/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================================
// POST /api/workbench/passage-transform — AI 지문 변형 (◈1)
//
// PARAPHRASE: 드래그 선택 구간을 뜻은 그대로, 표현만 바꿔 재작성
// PREPEND:    지문 맥락에 자연스럽게 이어지는 앞 문단 생성
//
// 크레딧은 선차감(◈1) 후 AI 실패 시 전액 환불 — restore-passage 와 동일 패턴.
// ============================================================================

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const parsed = transformRequestSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }

  const { mode, passageText, selectedText, avoidTexts, sentenceCount } =
    parsed.data;

  if (passageText.trim().length < 20) {
    return NextResponse.json(
      { error: "지문이 너무 짧습니다. 최소 20자 이상이어야 합니다." },
      { status: 400 },
    );
  }

  if (mode === "PARAPHRASE") {
    const span = selectedText?.trim() || "";
    if (span.length < 12) {
      return NextResponse.json(
        { error: "변형할 문장을 조금 더 길게 선택해주세요. (최소 12자)" },
        { status: 400 },
      );
    }
    if (!passageText.includes(span)) {
      return NextResponse.json(
        { error: "선택한 문장이 지문 본문과 일치하지 않습니다." },
        { status: 400 },
      );
    }
  }

  let creditTxId: string;
  try {
    const credit = await deductCredits(
      staff.academyId,
      "PASSAGE_TRANSFORM",
      staff.id,
      {
        source: "WORKBENCH_PASSAGE_TRANSFORM",
        mode,
        textLength: passageText.length,
        selectedLength: selectedText?.length ?? 0,
      },
    );
    creditTxId = credit.transactionId;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: "크레딧이 부족합니다.",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }
    throw err;
  }

  const refund = (reason: string) =>
    refundCredits(staff.academyId, "PASSAGE_TRANSFORM", creditTxId, reason).catch(
      (refundErr) => {
        // 환불 실패는 크레딧 유실 — 추적 가능하게 반드시 남긴다.
        console.error(
          `[PASSAGE-TRANSFORM] refund FAILED (academy=${staff.academyId}, tx=${creditTxId}, reason=${reason}):`,
          refundErr instanceof Error ? refundErr.message : refundErr,
        );
      },
    );

  try {
    if (mode === "PARAPHRASE") {
      const result = await runParaphrase({
        passageText,
        selectedText: selectedText!.trim(),
        avoidTexts,
      });
      const response: TransformResponse = {
        mode,
        text: result.rewrittenText,
        changes: (result.changes || []).filter((c) => c.before || c.after),
        note: result.note || "",
      };
      return NextResponse.json(response);
    }

    const result = await runPrepend({ passageText, avoidTexts, sentenceCount });
    const response: TransformResponse = {
      mode,
      text: result.paragraph,
      changes: [],
      note: result.note || "",
    };
    return NextResponse.json(response);
  } catch (err) {
    await refund(
      err instanceof Error ? `AI 변형 실패: ${err.message}` : "AI 변형 실패",
    );
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.message
            ? err.message
            : "AI 지문 변형에 실패했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 502 },
    );
  }
}
