import { APICallError, generateObject } from "ai";
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

// 라우트 maxDuration(60s) 안에서: 25s 타임아웃 × 2시도 = 최대 ~50s.
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
        // SDK 내부 재시도(기본 2회)와 우리 루프가 중첩되면 호출이 곱으로
        // 불어난다 — 재시도는 이 루프에서만 관리한다.
        maxRetries: 0,
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
      // 비재시도성 오류(400/401/403 등)는 2번째 과금 호출 없이 즉시 종료.
      if (APICallError.isInstance(err) && err.isRetryable === false) {
        break;
      }
      // 429/5xx/타임아웃 — SDK 내부 재시도를 껐으므로 여기서 짧게 백오프.
      // 시간 예산: 25s×2 + 2s = 52s < 라우트 maxDuration 60s.
      if (attempt < TRANSFORM_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
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
  const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  const passageWords = passageText.split(/\s+/).filter(Boolean).map(normWord);
  // 단어 배열로 비교해 "the" vs "theatre" 류 접두어 오탐을 차단한다.
  const tailMatchesPassageStart = (n: number) => {
    const tail = paraWords.slice(paraWords.length - n).map(normWord);
    if (passageWords.length < n) return false;
    let contentMatches = 0;
    for (let i = 0; i < n; i += 1) {
      if (tail[i] !== passageWords[i]) return false;
      if (tail[i]) contentMatches += 1;
    }
    // 구두점 전용 토큰(빈 정규화)끼리의 위치 일치는 허용하되,
    // "최소 5단어 겹침"은 실제 내용어 5개를 의미하게 한다.
    return contentMatches >= 5;
  };
  // 긴 겹침부터 검사 — 최소 5단어 이상 겹칠 때만 복사 사고로 간주.
  for (let n = Math.min(paraWords.length, 80); n >= 5; n -= 1) {
    if (tailMatchesPassageStart(n)) {
      const trimmed = paraWords
        .slice(0, paraWords.length - n)
        .join(" ")
        .trim();
      // 겹침을 잘라낸 자리가 문장 중간이면("...these sounds,") 마지막 완결
      // 문장 경계까지 추가로 잘라 미완성 꼬리를 남기지 않는다.
      return snapToSentenceEnd(trimmed);
    }
  }
  return paragraph.trim();
}

/**
 * 끝이 문장 종결로 닫히지 않으면 마지막 완결 문장까지로 자른다.
 * - 곡선 따옴표(” ’)·닫힘 기호 연쇄(."))·말줄임표(…)도 종결로 인정
 * - 약어(U.S., Dr., e.g. …) 뒤 마침표는 문장 경계로 취급하지 않음
 * - 경계 판정은 "종결부호 + 공백 + 대문자/여는 따옴표" 일 때만
 */
const SENTENCE_CLOSERS = `["'”’)\\]]*`;
const ABBREV_TAIL =
  /(?:\b\p{Lu}|\b(?:Dr|Mr|Mrs|Ms|St|Prof|Jr|Sr|vs|etc|Fig|No|e\.g|i\.e|cf))\.$/u;

function snapToSentenceEnd(text: string): string {
  const t = text.trim();
  if (!t || new RegExp(`[.!?…]${SENTENCE_CLOSERS}$`, "u").test(t)) return t;
  let best = -1;
  const boundary = new RegExp(
    `[.!?…]${SENTENCE_CLOSERS}(?=\\s+["'(\\[“‘]?\\p{Lu})`,
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
  // (짧은 선택에서도 가드가 무력해지지 않게 바닥값은 160자로 제한)
  if (rewritten.length > Math.max(selectedText.length * 2.5, 160)) {
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
