import { generateObject } from "ai";
import type { z } from "zod";

import { googleGenerativeAI } from "@/lib/ai";
import {
  paraphraseResultSchema,
  prependResultSchema,
  type ParaphraseResult,
  type PrependResult,
} from "./schema";
import { buildParaphrasePrompt, buildPrependPrompt } from "./prompts";

// ============================================================================
// AI 지문 변형 실행기 — 저지연 Flash-Lite 모델 전용.
//
// 문제 생성(STANDARD/PREMIUM 플랜)과 달리 이 기능은 "타이핑하다 누르는" 수준의
// 빠른 인터랙션이라 별도의 경량 모델을 쓴다. 모델은 env 로 오버라이드 가능.
// ============================================================================

// `||` + trim (NOT `??`): 빈 env("")는 실제 모델로 폴백해야 한다.
export const TRANSFORM_MODEL_ID =
  process.env.GEMINI_TRANSFORM_MODEL?.trim() || "gemini-3.1-flash-lite";

const TRANSFORM_TIMEOUT_MS = 30_000;
const TRANSFORM_MAX_RETRIES = 2;

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
        abortSignal: AbortSignal.timeout(TRANSFORM_TIMEOUT_MS),
        providerOptions: {
          google: {
            // 변형은 추론보다 지시 추종 — thinking 은 끄고 지연을 최소화한다.
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
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
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("AI 지문 변형에 실패했습니다.");
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * changes 정리 — flash-lite 가 자주 내는 쓰레기 쌍을 걸러낸다:
 * 한쪽이 빈 쌍("X→" / "→Y"), 통문장 복사 쌍, before===after, 중복.
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
    // 통문장(선택 구간의 60% 이상) 복사 쌍은 노이즈 — 단어/구 수준만 남긴다.
    if (before.length > Math.max(60, selectedText.length * 0.6)) continue;
    const key = `${normalize(before)}→${normalize(after)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ before, after });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * PREPEND 안전장치 — 모델이 지문 첫머리를 새 문단 끝에 그대로 복사해오는 사고를
 * 결정론적으로 제거한다. (단어 단위로 "문단 꼬리 == 지문 머리" 최장 겹침을 찾아 자른다.)
 */
function trimOverlapWithPassageStart(
  paragraph: string,
  passageText: string,
): string {
  const paraWords = paragraph.split(/\s+/).filter(Boolean);
  const passageNorm = normalize(passageText);
  // 긴 겹침부터 검사 — 최소 5단어 이상 겹칠 때만 복사 사고로 간주.
  for (let n = Math.min(paraWords.length, 80); n >= 5; n -= 1) {
    const tail = paraWords.slice(paraWords.length - n).join(" ");
    if (passageNorm.startsWith(normalize(tail))) {
      return paraWords.slice(0, paraWords.length - n).join(" ").trim();
    }
  }
  return paragraph.trim();
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
    // 동의어 선택의 다양성이 필요 — "다시 생성" 시 다른 결과가 나와야 한다.
    temperature: 0.85,
    logPrefix: "PASSAGE-TRANSFORM-PARAPHRASE",
  });

  const rewritten = result.rewrittenText.trim();
  if (!rewritten) throw new Error("변형 결과가 비어 있습니다.");
  if (normalize(rewritten) === normalize(selectedText)) {
    throw new Error("변형 결과가 원문과 동일합니다. 다시 시도해주세요.");
  }
  // 길이 폭주 가드 — 모델이 전체 지문을 되돌려보내는 사고 방지.
  if (rewritten.length > Math.max(selectedText.length * 2.5, selectedText.length + 200)) {
    throw new Error("변형 결과가 비정상적으로 깁니다. 다시 시도해주세요.");
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
}: {
  passageText: string;
  avoidTexts?: string[];
}): Promise<PrependResult> {
  const result = await runTransform({
    schema: prependResultSchema,
    prompt: buildPrependPrompt({ passageText, avoidTexts }),
    temperature: 0.8,
    logPrefix: "PASSAGE-TRANSFORM-PREPEND",
  });

  // 모델이 지문 첫 문장을 문단 끝에 복사해오는 사고 — 겹침 꼬리를 잘라낸다.
  const paragraph = trimOverlapWithPassageStart(
    result.paragraph.trim(),
    passageText,
  );
  if (!paragraph || paragraph.split(/\s+/).length < 8) {
    throw new Error("생성된 문단이 비정상적입니다. 다시 시도해주세요.");
  }
  // 문단 전체가 지문 첫머리 반복인 사고 방지.
  if (normalize(passageText).startsWith(normalize(paragraph).slice(0, 80))) {
    throw new Error("생성된 문단이 지문 첫머리와 중복됩니다. 다시 시도해주세요.");
  }
  return { ...result, paragraph };
}
