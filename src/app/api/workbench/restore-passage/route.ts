import { NextRequest, NextResponse } from "next/server";
import { APICallError, generateObject } from "ai";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { googleGenerativeAI } from "@/lib/ai";
import { ATLAS_RESTORATION_MODEL_ID, atlasUsageWithCost } from "@/lib/atlas-ai";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import {
  GROUNDED_SYSTEM_PROMPT,
  GROUNDED_RESTORATION_RULES,
} from "@/lib/extraction/restoration/prompts/_grounded-instructions";
import {
  buildFallbackM1Restoration,
  hasUnresolvedM1ProblemArtifacts,
} from "@/lib/extraction/m1-restoration";
import { recordAiCost } from "@/lib/platform-api-costs";

// 蹂듭썝 ?꾩슜 寃쎈웾 紐⑤뜽 ??異붿텧 ?뚯씠?꾨씪??passage-restoration ?ㅽ뀒?댁?? ?숈씪.
// (scripts/test-restoration-lite.ts 22耳?댁뒪 寃利? lite 媛 3.5-flash 蹂대떎
// ?뺥솗쨌?덉젙쨌2.5諛?鍮좊쫫 ??JSON ?뚯넀쨌???놁쓬)
const RESTORE_MODEL_ID =
  ATLAS_RESTORATION_MODEL_ID;
const RESTORE_TIMEOUT_MS = 45_000;
const RESTORE_MAX_ATTEMPTS = 2;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  passageText: z.string().min(20, "吏臾몄씠 ?덈Т 吏㏃뒿?덈떎."),
  // Optional answer key / linked questions pasted by the teacher. When present
  // it grounds blank-fill and grammar/vocab restoration; when absent the model
  // does a best-effort reconstruction and flags uncertainty.
  answerKey: z.string().optional(),
});

// The structured response we ask Gemini for. Kept intentionally small/focused
// (vs. the full grounded schema) so it is easy to render in the review panel.
const restorationSchema = z.object({
  restoredText: z
    .string()
    .describe(
      "蹂듭썝??吏臾?蹂몃Ц. 吏臾??먮옒 ?몄뼱 洹몃?濡?(?곸뼱 吏臾몄씠硫??곸뼱 洹몃?濡??붾떎).",
    ),
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
        reason: z
          .string()
          .default("")
          .describe(
            "???섏젙?????댁쑀. 諛섎뱶???쒓뎅?대줈 吏㏐쾶 ?묒꽦?쒕떎. ?곸뼱濡??곗? 留?寃? ?? \"二쇱뼱媛 ?⑥닔??was濡?援먯젙\", \"臾몃㎘??鍮덉뭏??異붿젙\".",
          ),
      }),
    )
    .default([]),
  warnings: z
    .array(
      z
        .string()
        .describe(
          "?좎깮?섏씠 吏곸젒 ?뺤씤?댁빞 ???? 諛섎뱶???쒓뎅??臾몄옣?쇰줈 ?묒꽦?쒕떎. ?곸뼱濡??곗? 留?寃? ?? \"留덉?留?臾몄옣??鍮덉뭏? ?뺣떟???놁뼱 臾몃㎘?쇰줈 異붿젙?덉뒿?덈떎 ???뺤씤 ?꾩슂.\"",
        ),
    )
    .default([])
    .describe("?좎깮??寃?좎슜 寃쎄퀬 紐⑸줉. 紐⑤뱺 ??ぉ???쒓뎅?대줈 ?묒꽦?쒕떎."),
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
    "- LANGUAGE ??留ㅼ슦 以묒슂: ?щ엺???쎈뒗 ?ㅻ챸 ?꾨뱶??諛섎뱶???쒓뎅?대줈 ?묒꽦?섏꽭?? 利?紐⑤뱺 `warnings[]` ??ぉ怨?紐⑤뱺 `changes[].reason` ? ?쒓뎅?댁뿬???⑸땲???곸뼱濡??곕㈃ ?ㅻ떟?쇰줈 媛꾩＜). ?쎈뒗 ?щ엺? ?쒓뎅 ?좎깮?섏엯?덈떎. ?? `restoredText`쨌`before`쨌`after` ??吏臾??먮Ц ?몄뼱 洹몃?濡??곸뼱 吏臾몄씠硫??곸뼱), `type` ? ?곷Ц enum 肄붾뱶 洹몃?濡??〓땲??",
    "- restoredText: the clean restored passage as continuous prose (no markers, no chunk labels, no numbering).",
    "- status: \"RESTORED\" (fully clean & confident) | \"PARTIAL\" (some guessed blanks or leftover uncertainty) | \"NO_RESTORATION_NEEDED\" (was already clean) | \"FAILED\" (could not restore).",
    "- changes: log EVERY substantive edit as { before, after, type, reason } ??a filled blank, a corrected grammar/vocab word, a moved/inserted sentence, or a removed irrelevant sentence. `reason` ? 諛섎뱶???쒓뎅?대줈 吏㏐쾶 ?묒꽦?섏꽭??(?? \"二쇱뼱媛 ?⑥닔??was 濡?援먯젙\", \"臾몃㎘??鍮덉뭏 異붿젙\").",
    "  ??Stripping a problem marker/label/number ((a), ?? (A) chunk labels, [3??) is pure housekeeping ??you need NOT log those.",
    "  ??A grammar / vocab / blank / word-order correction is a REPLACEMENT and MUST be logged: `before` = the original fragment with the marker stripped off (e.g. `were`, NOT `(e) were`); `after` = the corrected text that now appears in restoredText (e.g. `was`). `after` MUST be non-empty for these ??an empty `after` is WRONG and loses the fix.",
    "      RIGHT: { \"before\": \"were\", \"after\": \"was\", \"type\": \"GRAMMAR\", \"reason\": \"二쇱뼱 'the trait'媛 ?⑥닔\" }   |   WRONG: { \"before\": \"were\", \"after\": \"\" }",
    "      blank fill e.g.: { \"before\": \"the next ________ mini-silence\", \"after\": \"the next available mini-silence\", \"type\": \"BLANK\", \"reason\": \"문맥상 빈칸을 보충함\" }",
    "  ??`after` may be empty ONLY for a deliberately removed irrelevant sentence. Every entry MUST include all four fields.",
    "- warnings (諛섎뱶???쒓뎅?대줈 ?묒꽦): ONLY for things the teacher should double-check ??guessed/uncertain blanks, ambiguous edits, leftover markers. 媛?寃쎄퀬???쒓뎅?대줈 ?곗꽭??(?? \"留덉?留?臾몄옣??鍮덉뭏? ?뺣떟???놁뼱 臾몃㎘?쇰줈 異붿젙?덉뒿?덈떎 ???뺤씤 ?꾩슂.\"). Do NOT use warnings to narrate a correction you ALREADY logged in `changes` (log the correction in `changes`, not here).",
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

  // ?? (PASSAGE_RESTORATION) ??same cost as the image쨌PDF "AI ?먮Ц 蹂듭썝". Deduct
  // upfront; refund only when the AI call fails or returns an unusable result.
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
          error: "?щ젅?㏃씠 遺議깊빀?덈떎.",
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
  let restoreUsage: unknown;
  try {
    // flash-lite 吏곸젒 ?몄텧 ??45s 횞 2?쒕룄, SDK ?대? ?ъ떆??李⑤떒(以묒꺽 怨쇨툑 諛⑹?),
    // 鍮꾩옱?쒕룄???ㅻ쪟??利됱떆 以묐떒. passage-transform 怨??숈씪 洹쒖쑉.
    result = await (async () => {
      const prompt = buildRestorationPrompt(passageText, answerKey);
      let lastError: unknown;
      for (let attempt = 0; attempt < RESTORE_MAX_ATTEMPTS; attempt += 1) {
        const startedAt = Date.now();
        try {
          const { object, usage, providerMetadata } = await generateObject({
            model: googleGenerativeAI(RESTORE_MODEL_ID),
            schema: restorationSchema,
            prompt,
            temperature: 0,
            maxOutputTokens: 8192,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(RESTORE_TIMEOUT_MS),

          });
          restoreUsage = atlasUsageWithCost({ usage, providerMetadata });
          console.log(
            `[WORKBENCH-PASTE-RESTORE] ${RESTORE_MODEL_ID} attempt ${attempt + 1} ok in ${Date.now() - startedAt}ms`,
          );
          return object;
        } catch (err) {
          lastError = err;
          console.warn(
            `[WORKBENCH-PASTE-RESTORE] ${RESTORE_MODEL_ID} attempt ${attempt + 1} failed in ${Date.now() - startedAt}ms:`,
            err instanceof Error ? err.message : err,
          );
          if (APICallError.isInstance(err) && err.isRetryable === false) break;
          if (attempt < RESTORE_MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2_000));
          }
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("AI 蹂듭썝???ㅽ뙣?덉뒿?덈떎.");
    })();
  } catch (err) {
    // AI call failed ??deterministic marker-strip fallback so the user still
    // gets *something* cleaner than the raw paste.
    console.warn(
      "[WORKBENCH-PASTE-RESTORE] AI restore failed, using code fallback:",
      err instanceof Error ? err.message : err,
    );
    await refundRestore("AI 蹂듭썝 ?ㅽ뙣 ??留덉빱 ?쒓굅 ?대갚");
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
        "AI 蹂듭썝???ㅽ뙣??留덉빱 ?쒓굅留??곸슜?덉뒿?덈떎. 鍮덉뭏쨌?대쾿? 吏곸젒 ?뺤씤?댁＜?몄슂.",
      ],
      degraded: true,
    });
  }

  // AI 복원 호출이 성공적으로 응답을 반환했으므로 원가를 기록한다.
  await recordAiCost({
    sourceType: "AI_INTERACTIVE",
    sourceDetail: "restore-passage",
    academyId: staff.academyId,
    model: RESTORE_MODEL_ID,
    operationType: "PASSAGE_RESTORATION",
    usage: restoreUsage,
  });

  // Post-hoc safety: if obvious problem artifacts survived, never report a clean
  // "RESTORED" ??downgrade and warn so the user reviews.
  const restoredText = (result.restoredText || "").trim();
  let status = result.status;
  const warnings = [...(result.warnings || [])];
  if (restoredText && hasUnresolvedM1ProblemArtifacts(restoredText)) {
    if (status === "RESTORED" || status === "NO_RESTORATION_NEEDED") {
      status = "PARTIAL";
    }
    warnings.push("蹂듭썝蹂몄뿉 臾몄젣 ?뺥깭 ?붿쟻???⑥븘 ?덉뒿?덈떎. 吏곸젒 ?뺤씤쨌?섏젙?댁＜?몄슂.");
  }
  if (!restoredText) {
    // Schema enforces restoredText is a string, but an empty string still
    // passes ??surface it so recurring Gemini anomalies are diagnosable.
    console.warn("[WORKBENCH-PASTE-RESTORE] empty restoredText from model");
    await refundRestore("蹂듭썝 寃곌낵 鍮꾩뼱 ?덉쓬");
    return NextResponse.json({
      restoredText: passageText,
      status: "FAILED",
      changes: [],
      warnings: ["蹂듭썝 寃곌낵媛 鍮꾩뼱 ?덉뒿?덈떎. ?먮Ц??吏곸젒 ?뺣━?댁＜?몄슂."],
      degraded: true,
    });
  }

  // The AI restoration call completed, so only failed results are refunded.
  if (status === "FAILED") {
    await refundRestore("蹂듭썝 ?ㅽ뙣");
  }

  return NextResponse.json({
    restoredText,
    status,
    changes: result.changes || [],
    warnings,
    degraded: false,
  });
}
