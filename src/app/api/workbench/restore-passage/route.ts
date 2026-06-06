import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import {
  GROUNDED_SYSTEM_PROMPT,
  GROUNDED_RESTORATION_RULES,
} from "@/lib/extraction/restoration/prompts/_grounded-instructions";
import {
  buildFallbackM1Restoration,
  hasUnresolvedM1ProblemArtifacts,
} from "@/lib/extraction/m1-restoration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  passageText: z.string().min(20, "지문이 너무 짧습니다."),
  // Optional answer key / linked questions pasted by the teacher. When present
  // it grounds blank-fill and grammar/vocab restoration; when absent the model
  // does a best-effort reconstruction and flags uncertainty.
  answerKey: z.string().optional(),
});

// The structured response we ask Gemini for. Kept intentionally small/focused
// (vs. the full grounded schema) so it is easy to render in the review panel.
const restorationSchema = z.object({
  restoredText: z.string(),
  status: z
    .enum(["RESTORED", "PARTIAL", "NO_RESTORATION_NEEDED", "FAILED"])
    .default("PARTIAL"),
  changes: z
    .array(
      z.object({
        before: z.string().default(""),
        after: z.string().default(""),
        type: z
          .enum([
            "BLANK",
            "GRAMMAR",
            "VOCAB",
            "WORD_ORDER",
            "INSERTION",
            "ORDERING",
            "MARKER",
            "OTHER",
          ])
          .default("OTHER"),
        reason: z.string().default(""),
      }),
    )
    .default([]),
  warnings: z.array(z.string()).default([]),
});

type RestorationResult = z.infer<typeof restorationSchema>;

function buildRestorationPrompt(passageText: string, answerKey?: string): string {
  const hasAnswerKey = !!answerKey && answerKey.trim().length > 0;
  return [
    GROUNDED_SYSTEM_PROMPT,
    "",
    "Restore the problem-mutated English passage below into its clean ORIGINAL study passage.",
    "",
    ...GROUNDED_RESTORATION_RULES,
    "",
    "## Working without an extraction pipeline",
    hasAnswerKey
      ? "- An answer key / linked questions block is provided. Use it as the authoritative source for filling blanks and correcting marked grammar/vocab words."
      : "- NO answer key / questions are provided. Fill blanks and correct marked words ONLY when the surrounding context makes the original unambiguous. When you must guess, still produce your best reconstruction BUT add a clear note to `warnings` and set `status` to \"PARTIAL\".",
    "- If the text is already a clean passage with no problem markers, return it unchanged with status \"NO_RESTORATION_NEEDED\" and empty changes.",
    "- Never invent sentences or content not supported by the raw text or the answer key.",
    "",
    "## Output JSON shape",
    "Return strict JSON only: { restoredText, status, changes[], warnings[] }.",
    "- restoredText: the clean restored passage as continuous prose (no markers, no chunk labels, no numbering).",
    "- status: \"RESTORED\" (fully clean & confident) | \"PARTIAL\" (some guessed blanks or leftover uncertainty) | \"NO_RESTORATION_NEEDED\" (was already clean) | \"FAILED\" (could not restore).",
    "- changes: log EVERY substantive edit as { before, after, type, reason } — a filled blank, a corrected grammar/vocab word, a moved/inserted sentence, or a removed irrelevant sentence.",
    "  • Stripping a problem marker/label/number ((a), ①, (A) chunk labels, [3점]) is pure housekeeping — you need NOT log those.",
    "  • A grammar / vocab / blank / word-order correction is a REPLACEMENT and MUST be logged: `before` = the original fragment with the marker stripped off (e.g. `were`, NOT `(e) were`); `after` = the corrected text that now appears in restoredText (e.g. `was`). `after` MUST be non-empty for these — an empty `after` is WRONG and loses the fix.",
    "      RIGHT: { \"before\": \"were\", \"after\": \"was\", \"type\": \"GRAMMAR\", \"reason\": \"주어 'the trait'가 단수\" }   |   WRONG: { \"before\": \"were\", \"after\": \"\" }",
    "      blank fill e.g.: { \"before\": \"the next ________ mini-silence\", \"after\": \"the next available mini-silence\", \"type\": \"BLANK\", \"reason\": \"문맥상\" }",
    "  • `after` may be empty ONLY for a deliberately removed irrelevant sentence. Every entry MUST include all four fields.",
    "- warnings: ONLY for things the teacher should double-check — guessed/uncertain blanks, ambiguous edits, leftover markers. Do NOT use warnings to narrate a correction you ALREADY logged in `changes` (log the correction in `changes`, not here).",
    "",
    "## Problem-form passage",
    passageText,
    "",
    "## Answer key / linked questions" + (hasAnswerKey ? "" : " (none provided)"),
    hasAnswerKey ? answerKey!.trim() : "(none)",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }

  const { passageText, answerKey } = parsed.data;

  // ◈2 (PASSAGE_RESTORATION) — same cost as the image·PDF "AI 원문 복원". Deduct
  // upfront; refund when no real restoration happened (AI error fallback, empty
  // result, FAILED, or NO_RESTORATION_NEEDED).
  let creditTxId: string;
  try {
    const credit = await deductCredits(
      staff.academyId,
      "PASSAGE_RESTORATION",
      staff.id,
      { source: "WORKBENCH_PASTE_RESTORE", textLength: passageText.length },
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
  const refundRestore = (reason: string) =>
    refundCredits(
      staff.academyId,
      "PASSAGE_RESTORATION",
      creditTxId,
      reason,
    ).catch(() => {});

  let result: RestorationResult;
  try {
    // Uses the question-generation Gemini path (STANDARD plan) with its built-in
    // ~60s timeout + retries. Pasted passages are short, so 60s is ample; on any
    // failure we fall back to deterministic marker-strip below.
    const { object } = await generateQuestionObject({
      schema: restorationSchema,
      prompt: buildRestorationPrompt(passageText, answerKey),
      generationPlan: "STANDARD",
      logPrefix: "WORKBENCH-PASTE-RESTORE",
      maxTokens: 8192,
    });
    result = object;
  } catch (err) {
    // AI call failed → deterministic marker-strip fallback so the user still
    // gets *something* cleaner than the raw paste.
    console.warn(
      "[WORKBENCH-PASTE-RESTORE] AI restore failed, using code fallback:",
      err instanceof Error ? err.message : err,
    );
    await refundRestore("AI 복원 실패 — 마커 제거 폴백");
    const fallback = buildFallbackM1Restoration(passageText);
    return NextResponse.json({
      restoredText: fallback.restoredText,
      status: fallback.status,
      changes: fallback.changes.map((c) => ({
        before: c.before,
        after: c.after,
        type: "MARKER",
        reason: c.reason ?? "",
      })),
      warnings: [
        "AI 복원에 실패해 마커 제거만 적용했습니다. 빈칸·어법은 직접 확인해주세요.",
      ],
      degraded: true,
    });
  }

  // Post-hoc safety: if obvious problem artifacts survived, never report a clean
  // "RESTORED" — downgrade and warn so the user reviews.
  const restoredText = (result.restoredText || "").trim();
  let status = result.status;
  const warnings = [...(result.warnings || [])];
  if (restoredText && hasUnresolvedM1ProblemArtifacts(restoredText)) {
    if (status === "RESTORED" || status === "NO_RESTORATION_NEEDED") {
      status = "PARTIAL";
    }
    warnings.push("복원본에 문제 형태 흔적이 남아 있습니다. 직접 확인·수정해주세요.");
  }
  if (!restoredText) {
    // Schema enforces restoredText is a string, but an empty string still
    // passes — surface it so recurring Gemini anomalies are diagnosable.
    console.warn("[WORKBENCH-PASTE-RESTORE] empty restoredText from model");
    await refundRestore("복원 결과 비어 있음");
    return NextResponse.json({
      restoredText: passageText,
      status: "FAILED",
      changes: [],
      warnings: ["복원 결과가 비어 있습니다. 원문을 직접 정리해주세요."],
      degraded: true,
    });
  }

  // Only RESTORED / PARTIAL actually restored something — refund otherwise so
  // the teacher isn't charged when nothing changed.
  if (status === "FAILED" || status === "NO_RESTORATION_NEEDED") {
    await refundRestore(
      status === "FAILED" ? "복원 실패" : "복원 불필요(이미 깨끗함)",
    );
  }

  return NextResponse.json({
    restoredText,
    status,
    changes: result.changes || [],
    warnings,
    degraded: false,
  });
}
