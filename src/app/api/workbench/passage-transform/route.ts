import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import type { OperationType } from "@/lib/credit-costs";
import {
  transformRequestSchema,
  isWholePassageMode,
  variantModeLabel,
  type TransformResponse,
} from "@/lib/passage-transform/schema";
import { runParaphrase, runPrepend } from "@/lib/passage-transform/generate";
import { runWholePassageTransform } from "@/lib/passage-transform/whole-passage";
import { recordAiCost } from "@/lib/platform-api-costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================================
// POST /api/workbench/passage-transform — AI 지문 변형 (◈1)
//
// 구간(span) 변형 — 인라인 미리보기, DB 저장 없음:
//   PARAPHRASE: 드래그 선택 구간을 뜻은 그대로, 표현만 바꿔 재작성
//   PREPEND:    지문 맥락에 자연스럽게 이어지는 앞 문단 생성
//
// 지문 전체(whole-passage) 변형 — 결과는 호출 측이 변형본 Passage 로 저장:
//   RELATED_TOPIC / OPPOSITE_TOPIC: 같은 분야 새 지문 / 반대 입장 새 지문
//   DIFFICULTY (EASIER|HARDER) / LENGTH (SHORTER|LONGER): 난이도·분량만 변형
//
// 크레딧은 선차감(◈1) 후 AI 실패 시 전액 환불. 구간=PASSAGE_TRANSFORM(1),
// 전체=PASSAGE_VARIANT(2) 로 과금 타입을 분기한다. — restore-passage 와 동일 패턴.
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

  const { mode, passageText, selectedText, avoidTexts, sentenceCount, direction } =
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

  // 난이도/길이 변형은 방향이 필수이고 모드와 짝이 맞아야 한다.
  if (mode === "DIFFICULTY" && !["EASIER", "HARDER"].includes(direction || "")) {
    return NextResponse.json(
      { error: "난이도 변형 방향(EASIER/HARDER)을 지정해주세요." },
      { status: 400 },
    );
  }
  if (mode === "LENGTH" && !["SHORTER", "LONGER"].includes(direction || "")) {
    return NextResponse.json(
      { error: "길이 변형 방향(SHORTER/LONGER)을 지정해주세요." },
      { status: 400 },
    );
  }

  const whole = isWholePassageMode(mode);
  // RELATED_TOPIC/OPPOSITE_TOPIC 는 방향을 쓰지 않는다 — 메타·다운스트림이 깨끗하게
  // 남도록 그 경우 direction 을 정규화(undefined)한다.
  const normDirection =
    mode === "DIFFICULTY" || mode === "LENGTH" ? direction : undefined;
  const operationType: OperationType = whole
    ? "PASSAGE_VARIANT"
    : "PASSAGE_TRANSFORM";

  let creditTxId: string;
  try {
    const credit = await deductCredits(staff.academyId, operationType, staff.id, {
      source: whole
        ? "WORKBENCH_PASSAGE_VARIANT"
        : "WORKBENCH_PASSAGE_TRANSFORM",
      mode,
      direction: normDirection ?? null,
      textLength: passageText.length,
      selectedLength: selectedText?.length ?? 0,
    });
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
    refundCredits(staff.academyId, operationType, creditTxId, reason).catch(
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
      await recordAiCost({
        sourceType: "AI_INTERACTIVE",
        sourceDetail: "passage-transform",
        academyId: staff.academyId,
        model: result.modelId,
        operationType: "PASSAGE_TRANSFORM",
        usage: result.usage,
        metadata: { mode },
      });
      const response: TransformResponse = {
        mode,
        text: result.rewrittenText,
        changes: (result.changes || []).filter((c) => c.before || c.after),
        note: result.note || "",
      };
      return NextResponse.json(response);
    }

    if (mode === "PREPEND") {
      const result = await runPrepend({ passageText, avoidTexts, sentenceCount });
      await recordAiCost({
        sourceType: "AI_INTERACTIVE",
        sourceDetail: "passage-transform",
        academyId: staff.academyId,
        model: result.modelId,
        operationType: "PASSAGE_TRANSFORM",
        usage: result.usage,
        metadata: { mode },
      });
      const response: TransformResponse = {
        mode,
        text: result.paragraph,
        changes: [],
        note: result.note || "",
      };
      return NextResponse.json(response);
    }

    // ── 지문 전체 변형 (RELATED_TOPIC / OPPOSITE_TOPIC / DIFFICULTY / LENGTH) ──
    const result = await runWholePassageTransform({
      mode,
      passageText,
      direction: normDirection,
      avoidTexts,
    });
    await recordAiCost({
      sourceType: "AI_INTERACTIVE",
      sourceDetail: "passage-transform",
      academyId: staff.academyId,
      model: result.modelId,
      operationType: "PASSAGE_TRANSFORM",
      usage: result.usage,
      metadata: { mode, direction: normDirection ?? null },
    });
    // Flash-Lite 가 meta 필드를 자주 비우므로 결정론적 라벨로 폴백한다.
    const fallbackSummary = `${variantModeLabel(mode, normDirection)} 변형으로 생성한 새 지문`;
    const response: TransformResponse = {
      mode,
      text: result.passage,
      changes: [],
      note: result.summary || fallbackSummary,
      title: result.title || "",
      summary: result.summary || fallbackSummary,
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
