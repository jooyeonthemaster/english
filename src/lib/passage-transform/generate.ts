import { APICallError, generateObject } from "ai";
import type { z } from "zod";

import { googleGenerativeAI } from "@/lib/ai";
import { ATLAS_TRANSFORM_MODEL_ID } from "@/lib/atlas-ai";
import {
  paraphraseResultSchema,
  prependResultSchema,
  type ParaphraseResult,
  type PrependResult,
} from "./schema";
import { buildParaphrasePrompt, buildPrependPrompt } from "./prompts";

// ============================================================================
// AI ì§€ë¬?ë³€???¤í–‰ê¸????€ì§€??Flash-Lite ëª¨ë¸ ?„ìš©.
//
// ë¬¸ì œ ?ì„±(STANDARD/PREMIUM ?Œëœ)ê³??¬ë¦¬ ??ê¸°ëŠ¥?€ "?€?´í•‘?˜ë‹¤ ?„ë¥´?? ?˜ì???// ë¹ ë¥¸ ?¸í„°?™ì…˜?´ë¼ ë³„ë„??ê²½ëŸ‰ ëª¨ë¸???´ë‹¤. ëª¨ë¸?€ env ë¡??¤ë²„?¼ì´??ê°€??
// ============================================================================

// `||` + trim (NOT `??`): ë¹?env("")???¤ì œ ëª¨ë¸ë¡??´ë°±?´ì•¼ ?œë‹¤.
export const TRANSFORM_MODEL_ID =
  ATLAS_TRANSFORM_MODEL_ID;

// ?¼ìš°??maxDuration(60s) ?ˆì—?? 25s ?€?„ì•„??Ã— 2?œë„ = ìµœë? ~50s.
const TRANSFORM_TIMEOUT_MS = 25_000;
const TRANSFORM_MAX_RETRIES = 1;

async function runTransform<T>({
  schema,
  prompt,
  temperature,
  logPrefix,
}: {
  schema: z.ZodType<T>;
  prompt: string;
  temperature: number;
  logPrefix: string;
}): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TRANSFORM_MAX_RETRIES; attempt += 1) {
    const startedAt = Date.now();
    try {
      const result = await generateObject({
        model: googleGenerativeAI(TRANSFORM_MODEL_ID),
        schema,
        prompt,
        temperature,
        maxOutputTokens: 4096,
        // SDK ?´ë? ?¬ì‹œ??ê¸°ë³¸ 2???€ ?°ë¦¬ ë£¨í”„ê°€ ì¤‘ì²©?˜ë©´ ?¸ì¶œ??ê³±ìœ¼ë¡?        // ë¶ˆì–´?œë‹¤ ???¬ì‹œ?„ëŠ” ??ë£¨í”„?ì„œë§?ê´€ë¦¬í•œ??
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(TRANSFORM_TIMEOUT_MS),
        
      });
      console.log(
        `[${logPrefix}] ${TRANSFORM_MODEL_ID} attempt ${attempt + 1} ok in ${Date.now() - startedAt}ms`,
      );
      return result.object as T;
    } catch (err) {
      lastError = err;
      console.warn(
        `[${logPrefix}] ${TRANSFORM_MODEL_ID} attempt ${attempt + 1} failed in ${Date.now() - startedAt}ms:`,
        err instanceof Error ? err.message : err,
      );
      // ë¹„ì¬?œë„???¤ë¥˜(400/401/403 ????2ë²ˆì§¸ ê³¼ê¸ˆ ?¸ì¶œ ?†ì´ ì¦‰ì‹œ ì¢…ë£Œ.
      if (APICallError.isInstance(err) && err.isRetryable === false) {
        break;
      }
      // 429/5xx/?€?„ì•„????SDK ?´ë? ?¬ì‹œ?„ë? ê»ìœ¼ë¯€ë¡??¬ê¸°??ì§§ê²Œ ë°±ì˜¤??
      // ?œê°„ ?ˆì‚°: 25sÃ—2 + 2s = 52s < ?¼ìš°??maxDuration 60s.
      if (attempt < TRANSFORM_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("AI ì§€ë¬?ë³€?•ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.");
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** ?¬í”„ ë¬¸ì¥ ????ì¢…ê²°ë¶€???«ëŠ” ?°ì˜´??ê´„í˜¸ ?¬í•¨) + ê³µë°±/ë¬¸ì¥??ê²½ê³„ë¡??¼ë‹¤. */
const countSentences = (s: string) =>
  (s.match(/[.!?]["'?â€?\]]*(?:\s|$)/g) || []).length || (s.trim() ? 1 : 0);

/**
 * changes ?•ë¦¬ ??flash-lite ê°€ ?ì£¼ ?´ëŠ” ?°ë ˆê¸??ì„ ê±¸ëŸ¬?¸ë‹¤:
 * ?œìª½??ë¹???"X?? / "?’Y"), ?µë¬¸??ë³µì‚¬ ?? before===after, ì¤‘ë³µ.
 */
function cleanParaphraseChanges(
  changes: { before: string; after: string }[],
  selectedText: string,
): { before: string; after: string }[] {
  const seen = new Set<string>();
  const out: { before: string; after: string }[] = [];
  for (const c of changes || []) {
    const before = (c.before || "").trim();
    const after = (c.after || "").trim();
    if (!before || !after) continue;
    if (normalize(before) === normalize(after)) continue;
    // ?µë¬¸??? íƒ êµ¬ê°„??60% ?´ìƒ) ë³µì‚¬ ?ì? ?¸ì´ì¦????¨ì–´/êµ??˜ì?ë§??¨ê¸´??
    if (before.length > Math.max(60, selectedText.length * 0.6)) continue;
    const key = `${normalize(before)}??{normalize(after)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ before, after });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * PREPEND ?ˆì „?¥ì¹˜ ??ëª¨ë¸??ì§€ë¬?ì²«ë¨¸ë¦¬ë? ??ë¬¸ë‹¨ ?ì— ê·¸ë?ë¡?ë³µì‚¬?´ì˜¤???¬ê³ ë¥? * ê²°ì •ë¡ ì ?¼ë¡œ ?œê±°?œë‹¤. (?¨ì–´ ?¨ìœ„ë¡?"ë¬¸ë‹¨ ê¼¬ë¦¬ == ì§€ë¬?ë¨¸ë¦¬" ìµœì¥ ê²¹ì¹¨??ì°¾ì•„ ?ë¥¸??)
 */
function trimOverlapWithPassageStart(
  paragraph: string,
  passageText: string,
): string {
  const paraWords = paragraph.split(/\s+/).filter(Boolean);
  const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  const passageWords = passageText.split(/\s+/).filter(Boolean).map(normWord);
  // ?¨ì–´ ë°°ì—´ë¡?ë¹„êµ??"the" vs "theatre" ë¥??‘ë‘???¤íƒ??ì°¨ë‹¨?œë‹¤.
  const tailMatchesPassageStart = (n: number) => {
    const tail = paraWords.slice(paraWords.length - n).map(normWord);
    if (passageWords.length < n) return false;
    let contentMatches = 0;
    for (let i = 0; i < n; i += 1) {
      if (tail[i] !== passageWords[i]) return false;
      if (tail[i]) contentMatches += 1;
    }
    // êµ¬ë‘???„ìš© ? í°(ë¹??•ê·œ???¼ë¦¬???„ì¹˜ ?¼ì¹˜???ˆìš©?˜ë˜,
    // "ìµœì†Œ 5?¨ì–´ ê²¹ì¹¨"?€ ?¤ì œ ?´ìš©??5ê°œë? ?˜ë??˜ê²Œ ?œë‹¤.
    return contentMatches >= 5;
  };
  // ê¸?ê²¹ì¹¨ë¶€??ê²€????ìµœì†Œ 5?¨ì–´ ?´ìƒ ê²¹ì¹  ?Œë§Œ ë³µì‚¬ ?¬ê³ ë¡?ê°„ì£¼.
  for (let n = Math.min(paraWords.length, 80); n >= 5; n -= 1) {
    if (tailMatchesPassageStart(n)) {
      const trimmed = paraWords
        .slice(0, paraWords.length - n)
        .join(" ")
        .trim();
      // ê²¹ì¹¨???˜ë¼???ë¦¬ê°€ ë¬¸ì¥ ì¤‘ê°„?´ë©´("...these sounds,") ë§ˆì?ë§??„ê²°
      // ë¬¸ì¥ ê²½ê³„ê¹Œì? ì¶”ê?ë¡??˜ë¼ ë¯¸ì™„??ê¼¬ë¦¬ë¥??¨ê¸°ì§€ ?ŠëŠ”??
      return snapToSentenceEnd(trimmed);
    }
  }
  return paragraph.trim();
}

/**
 * ?ì´ ë¬¸ì¥ ì¢…ê²°ë¡??«íˆì§€ ?Šìœ¼ë©?ë§ˆì?ë§??„ê²° ë¬¸ì¥ê¹Œì?ë¡??ë¥¸??
 * - ê³¡ì„  ?°ì˜´??????Â·?«í˜ ê¸°í˜¸ ?°ì‡„(."))Â·ë§ì¤„?„í‘œ(????ì¢…ê²°ë¡??¸ì •
 * - ?½ì–´(U.S., Dr., e.g. ?? ??ë§ˆì¹¨?œëŠ” ë¬¸ì¥ ê²½ê³„ë¡?ì·¨ê¸‰?˜ì? ?ŠìŒ
 * - ê²½ê³„ ?ì •?€ "ì¢…ê²°ë¶€??+ ê³µë°± + ?€ë¬¸ì/?¬ëŠ” ?°ì˜´?? ???Œë§Œ
 */
const SENTENCE_CLOSERS = `["'?â€?\\]]*`;
const ABBREV_TAIL =
  /(?:\b\p{Lu}|\b(?:Dr|Mr|Mrs|Ms|St|Prof|Jr|Sr|vs|etc|Fig|No|e\.g|i\.e|cf))\.$/u;

function snapToSentenceEnd(text: string): string {
  const t = text.trim();
  if (!t || new RegExp(`[.!???${SENTENCE_CLOSERS}$`, "u").test(t)) return t;
  let best = -1;
  const boundary = new RegExp(
    `[.!???${SENTENCE_CLOSERS}(?=\\s+["'(\\[?œâ€??\\p{Lu})`,
    "gu",
  );
  for (const m of t.matchAll(boundary)) {
    const end = (m.index ?? 0) + m[0].length;
    if (m[0][0] === "." && ABBREV_TAIL.test(t.slice(0, end))) continue;
    best = end;
  }
  return best > 0 ? t.slice(0, best).trim() : t;
}

export async function runParaphrase({
  passageText,
  selectedText,
  avoidTexts,
}: {
  passageText: string;
  selectedText: string;
  avoidTexts?: string[];
}): Promise<ParaphraseResult> {
  const result = await runTransform({
    schema: paraphraseResultSchema,
    prompt: buildParaphrasePrompt({ passageText, selectedText, avoidTexts }),
    // ?™ì˜??? íƒ???¤ì–‘?±ì´ ?„ìš” ??"?¤ì‹œ ?ì„±" ???¤ë¥¸ ê²°ê³¼ê°€ ?˜ì????œë‹¤.
    temperature: 0.85,
    logPrefix: "PASSAGE-TRANSFORM-PARAPHRASE",
  });

  const rewritten = result.rewrittenText.trim();
  if (!rewritten) throw new Error("ë³€??ê²°ê³¼ê°€ ë¹„ì–´ ?ˆìŠµ?ˆë‹¤.");
  if (normalize(rewritten) === normalize(selectedText)) {
    throw new Error("ë³€??ê²°ê³¼ê°€ ?ë¬¸ê³??™ì¼?©ë‹ˆ?? ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.");
  }
  // ê¸¸ì´ ??£¼ ê°€????ëª¨ë¸???„ì²´ ì§€ë¬¸ì„ ?˜ëŒ?¤ë³´?´ëŠ” ?¬ê³  ë°©ì?.
  // (ì§§ì? ? íƒ?ì„œ??ê°€?œê? ë¬´ë ¥?´ì?ì§€ ?Šê²Œ ë°”ë‹¥ê°’ì? 160?ë¡œ ?œí•œ)
  if (rewritten.length > Math.max(selectedText.length * 2.5, 160)) {
    throw new Error("ë³€??ê²°ê³¼ê°€ ë¹„ì •?ì ?¼ë¡œ ê¹ë‹ˆ?? ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.");
  }
  // ?€?€ ë¶•ê´´ ê°€???€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
  // flash-lite ??ì£¼ì œ?ìœ¼ë¡??´ì§ˆ?ì¸(ë¬´ê? ë¬¸ì¥???ì¸) ?¤ë¬¸??span ??ë§Œë‚˜ë©?  // "ì¶©ì‹¤ ?¬ì‘?? ?€???µì‹¬ë§???ë¬¸ì¥?¼ë¡œ "?”ì•½"?´ë²„ë¦¬ëŠ” ?¬ê³ ê°€ ??‹¤(?¤ì¸¡ ?•ì¸).
  // ê·¸ë?ë¡??ìš©?˜ë©´ ? íƒ êµ¬ê°„ ?„ì²´ê°€ ??ë¬¸ì¥?¼ë¡œ ? ì•„ê°€ë¯€ë¡? ê²°ê³¼ê°€ ?ë¬¸ ?€ë¹?  // ?¬ê²Œ ì§§ì•„ì¡Œê±°???¤ë¬¸?????¨ì–´ ?ˆë°˜ ë¯¸ë§Œ) ë¬¸ì¥ ?˜ê? ê¸‰ê°?˜ë©´ ê±°ë???  // runTransform ???¬ì‹œ???ëŸ¬ë¡??˜ë ¤ë³´ë‚¸??ë¬´ì„± ?°ì´???ì‹¤ ì°¨ë‹¨).
  const srcWords = countWords(selectedText);
  const outWords = countWords(rewritten);
  const srcSentences = countSentences(selectedText);
  const outSentences = countSentences(rewritten);
  const wordCollapsed = srcWords >= 30 && outWords < srcWords * 0.5;
  const sentenceCollapsed =
    srcSentences >= 3 && outSentences <= Math.floor(srcSentences / 2);
  if (wordCollapsed || sentenceCollapsed) {
    throw new Error(
      "ë³€??ê²°ê³¼ê°€ ?ë¬¸ë³´ë‹¤ ?¬ê²Œ ì¤„ì—ˆ?µë‹ˆ??ë¬¸ì¥???”ì•½Â·?„ë½??. ?¤ì‹œ ?œë„?˜ê±°?? ??ë²ˆì— ?œë‘ ë¬¸ì¥??? íƒ??ë³€?•í•´ì£¼ì„¸??",
    );
  }
  return {
    ...result,
    rewrittenText: rewritten,
    changes: cleanParaphraseChanges(result.changes || [], selectedText),
  };
}

export async function runPrepend({
  passageText,
  avoidTexts,
  sentenceCount,
}: {
  passageText: string;
  avoidTexts?: string[];
  sentenceCount?: number;
}): Promise<PrependResult> {
  const result = await runTransform({
    schema: prependResultSchema,
    prompt: buildPrependPrompt({ passageText, avoidTexts, sentenceCount }),
    temperature: 0.8,
    logPrefix: "PASSAGE-TRANSFORM-PREPEND",
  });

  // ëª¨ë¸??ì§€ë¬?ì²?ë¬¸ì¥??ë¬¸ë‹¨ ?ì— ë³µì‚¬?´ì˜¤???¬ê³  ??ê²¹ì¹¨ ê¼¬ë¦¬ë¥??˜ë¼?¸ë‹¤.
  const paragraph = trimOverlapWithPassageStart(
    result.paragraph.trim(),
    passageText,
  );
  // 1ë¬¸ì¥ ?”ì²­?´ë©´ ì§§ì? ê²°ê³¼???•ìƒ ??ìµœì†Œ ?¨ì–´ ê°€?œë? ë¬¸ì¥ ?˜ì— ë¹„ë??œí‚¨??
  const minWords = (sentenceCount ?? 3) <= 1 ? 5 : 8;
  if (!paragraph || paragraph.split(/\s+/).length < minWords) {
    throw new Error("?ì„±??ë¬¸ë‹¨??ë¹„ì •?ì ?…ë‹ˆ?? ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.");
  }
  // ë¬¸ë‹¨ ?„ì²´ê°€ ì§€ë¬?ì²«ë¨¸ë¦?ë°˜ë³µ???¬ê³  ë°©ì?.
  if (normalize(passageText).startsWith(normalize(paragraph).slice(0, 80))) {
    throw new Error("?ì„±??ë¬¸ë‹¨??ì§€ë¬?ì²«ë¨¸ë¦¬ì? ì¤‘ë³µ?©ë‹ˆ?? ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.");
  }
  return { ...result, paragraph };
}
