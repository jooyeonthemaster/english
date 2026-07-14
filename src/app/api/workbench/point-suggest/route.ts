import { NextRequest, NextResponse } from "next/server";
import { APICallError, generateText } from "ai";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { googleGenerativeAI } from "@/lib/ai";
import { ATLAS_RESTORATION_MODEL_ID, atlasUsageWithCost } from "@/lib/atlas-ai";
import { recordAiCost } from "@/lib/platform-api-costs";
import { parseJsonLoose } from "@/lib/question-generation-llm";
import {
  tokenizePassage,
  anchorVerbatimText,
  type PointSentence,
} from "@/lib/passage-point-tokenizer";
import {
  TEACHER_POINT_UNITS,
  resolvePointPickerMeta,
  type TeacherPointUnit,
} from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";

// ============================================================================
// POST /api/workbench/point-suggest — "포인트 짚어주기" AI 후보 제안 (크레딧 0)
//
// 교사가 픽커에서 ScanSearch 버튼을 눌렀을 때만 호출된다(자동 발사 금지).
// flash-lite 직호출로 후보 quote 를 받아, 서버가 지문 indexOf 재앵커링으로
// start/end 를 결정론 계산한다 — 모델 오프셋은 절대 신뢰하지 않으며 축자
// 불일치 후보는 드롭한다. 실패는 완전 비차단(수동 선택 계속 가능)이고,
// deductCredits 는 호출하지 않되 recordAiCost 로 원가만 기록한다.
// ============================================================================

const SUGGEST_MODEL_ID = ATLAS_RESTORATION_MODEL_ID;
const SUGGEST_TIMEOUT_MS = 20_000;
const SUGGEST_MAX_ATTEMPTS = 2;
// 요청 maxPoints 상한과 동일 — 모델에게는 항상 최대치로 뽑게 하고 응답에서 자른다.
const SUGGEST_MAX_CANDIDATES = 8;
const QUOTE_MAX_CHARS = 120;
const REASON_MAX_CHARS = 40;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  passageId: z.string().min(1),
  questionType: z.string().min(1),
  unit: z.enum(TEACHER_POINT_UNITS),
  maxPoints: z.number().int().min(1).max(SUGGEST_MAX_CANDIDATES).default(SUGGEST_MAX_CANDIDATES),
});

interface PointSuggestion {
  quote: string; // 지문 축자(단어 경계 스냅됨) — 클라 TeacherPoint.text 로 그대로 사용
  sentenceIndex: number;
  start: number; // 서버 결정론 계산 — 지문 전체 기준 [start, end)
  end: number;
  reason: string; // ≤40자 합니다체
  tag?: string;
}

// ── (passageId, questionType) 인메모리 캐시 — TTL 10분 ──────────────────────
// 같은 지문·유형 재호출의 중복 과금(원가)을 막는다. 지문 편집·unit 변경
// (blankGranularity 연동) 시 낡은 후보를 돌려주지 않도록 content 해시와
// unit 을 엔트리에서 검증하고, 불일치는 미스로 처리해 덮어쓴다.

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 200;

interface SuggestCacheEntry {
  expiresAt: number;
  contentHash: string;
  unit: TeacherPointUnit;
  suggestions: PointSuggestion[];
}

const suggestionCache = new Map<string, SuggestCacheEntry>();

/** djb2 — 캐시 신선도 검증용 경량 해시(암호학적 강도 불필요). */
function hashContent(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i += 1) {
    h = ((h * 33) ^ content.charCodeAt(i)) >>> 0;
  }
  return `${content.length}:${h.toString(16)}`;
}

function readSuggestionCache(
  key: string,
  contentHash: string,
  unit: TeacherPointUnit,
): PointSuggestion[] | null {
  const entry = suggestionCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now() || entry.contentHash !== contentHash || entry.unit !== unit) {
    suggestionCache.delete(key);
    return null;
  }
  return entry.suggestions;
}

function writeSuggestionCache(
  key: string,
  contentHash: string,
  unit: TeacherPointUnit,
  suggestions: PointSuggestion[],
): void {
  const now = Date.now();
  for (const [k, entry] of suggestionCache) {
    if (entry.expiresAt <= now) suggestionCache.delete(k);
  }
  // 만료 정리 후에도 넘치면 가장 오래된 엔트리부터 비운다(Map 삽입 순서 = FIFO).
  while (suggestionCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = suggestionCache.keys().next().value;
    if (oldest === undefined) break;
    suggestionCache.delete(oldest);
  }
  suggestionCache.set(key, { expiresAt: now + CACHE_TTL_MS, contentHash, unit, suggestions });
}

// ── 프롬프트 ─────────────────────────────────────────────────────────────────

const UNIT_QUOTE_RULES: Record<TeacherPointUnit, string> = {
  word: "Each candidate quote MUST be exactly ONE word copied verbatim from the passage.",
  phrase:
    "Each candidate quote MUST be a contiguous 2-6 word phrase copied verbatim from the passage.",
  clause:
    "Each candidate quote MUST be a contiguous clause (subject + verb) copied verbatim from the passage, at most 120 characters.",
  sentence:
    "Each candidate identifies ONE whole sentence. Quote the opening span of that sentence verbatim (at most 120 characters) so it can be located exactly.",
};

function buildSuggestPrompt(args: {
  typeLabel: string;
  promptRole: string;
  unit: TeacherPointUnit;
  unitNoun: string;
  sentences: readonly PointSentence[];
}): string {
  const numbered = args.sentences.map((s) => `[${s.index}] ${s.text}`).join("\n");
  return [
    "You are an expert Korean CSAT-English question designer assisting a teacher.",
    `The teacher is building a "${args.typeLabel}" question and wants candidate focus points (${args.unitNoun}) picked from the passage below.`,
    args.promptRole,
    "",
    "## Selection rules",
    `- Propose up to ${SUGGEST_MAX_CANDIDATES} candidates, best first. Fewer is fine; return an empty list when nothing qualifies. NEVER invent text.`,
    `- ${UNIT_QUOTE_RULES[args.unit]}`,
    "- Every quote must appear character-for-character in the passage (same casing, same punctuation) and must not cross a sentence boundary.",
    "- Do not propose the same span twice.",
    "",
    "## Output JSON shape",
    'Return ONLY a JSON object, no markdown fences, no commentary: {"suggestions":[{"quote":"...","reason":"...","tag":"..."}]}',
    `- quote: the verbatim span (max ${QUOTE_MAX_CHARS} characters).`,
    `- reason: 왜 좋은 출제 포인트인지 반드시 한국어 합니다체로 ${REASON_MAX_CHARS}자 이내 작성합니다. (예: "역접 연결어로 글의 전환점입니다.")`,
    '- tag: 선택 필드 — 짧은 한국어 분류 라벨(예: 어법 유형 "수일치", "태"). 해당 없으면 생략합니다.',
    "",
    "## Passage sentences",
    numbered,
  ].join("\n");
}

// ── 응답 파싱 — strict json_schema 금지, 관대한 파싱 + 결정론 검증 ──────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 모델 원문 텍스트 → 검증된 후보 목록. quote 를 지문 indexOf 로 재앵커링해
 * start/end 를 서버가 계산하고, 불일치·중복·초과 길이는 조용히 드롭한다.
 */
function parseSuggestions(
  rawText: string,
  tokenized: ReturnType<typeof tokenizePassage>,
): PointSuggestion[] {
  const parsed = parseJsonLoose(rawText);
  const rawList: unknown[] = isRecord(parsed) && Array.isArray(parsed.suggestions)
    ? parsed.suggestions
    : Array.isArray(parsed)
      ? parsed
      : [];

  const seen = new Set<string>();
  const suggestions: PointSuggestion[] = [];
  for (const item of rawList) {
    if (suggestions.length >= SUGGEST_MAX_CANDIDATES) break;
    if (!isRecord(item)) continue;
    const quoteRaw = typeof item.quote === "string" ? item.quote.trim() : "";
    if (!quoteRaw || quoteRaw.length > QUOTE_MAX_CHARS) continue;

    // 축자 검증 + 단어 경계 앵커링 — 지문에 없으면(환각) 드롭.
    const anchored = anchorVerbatimText(tokenized, quoteRaw);
    if (!anchored || anchored.text.length > QUOTE_MAX_CHARS) continue;

    const key = `${anchored.start}:${anchored.end}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const reason =
      (typeof item.reason === "string" ? item.reason.trim() : "").slice(0, REASON_MAX_CHARS) ||
      "출제 포인트로 적합합니다.";
    const tag =
      typeof item.tag === "string" && item.tag.trim() ? item.tag.trim().slice(0, 20) : undefined;
    suggestions.push({
      quote: anchored.text,
      sentenceIndex: anchored.sentenceIndex,
      start: anchored.start,
      end: anchored.end,
      reason,
      ...(tag ? { tag } : {}),
    });
  }
  return suggestions;
}

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const { passageId, questionType, unit, maxPoints } = parsed.data;

  // 등재 유형만 허용 — 미등재 유형은 클라에서 진입 행 자체가 없으므로 방어선.
  // (route 는 유형별 typeSettings 를 받지 않으므로 기본 메타만 조회한다.)
  const meta = resolvePointPickerMeta(questionType, undefined);
  if (!meta) {
    return NextResponse.json(
      { error: "포인트 짚어주기를 지원하지 않는 유형입니다." },
      { status: 400 },
    );
  }

  // 지문 권한 확인 — 같은 academy 의 지문만 가능.
  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: { id: true, academyId: true, content: true },
  });
  if (!passage || passage.academyId !== staff.academyId) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  const content = passage.content || "";
  const tokenized = tokenizePassage(content);
  if (tokenized.sentences.length === 0) {
    // 후보 0건은 [] 정직 반환 — AI 호출 자체를 생략한다.
    return NextResponse.json({ suggestions: [], cached: false });
  }

  const cacheKey = `${passageId}:${questionType}`;
  const contentHash = hashContent(content);
  const cachedSuggestions = readSuggestionCache(cacheKey, contentHash, unit);
  if (cachedSuggestions) {
    return NextResponse.json({
      suggestions: cachedSuggestions.slice(0, maxPoints),
      cached: true,
    });
  }

  const prompt = buildSuggestPrompt({
    typeLabel: QUESTION_TYPE_UI[questionType]?.label || questionType,
    promptRole: meta.promptRole,
    unit,
    unitNoun: meta.unitNoun,
    sentences: tokenized.sentences,
  });

  // flash-lite 직호출 — 20s × 2시도, SDK 내부 재시도 차단(중복 과금 방지),
  // 비재시도성 오류는 즉시 중단. restore-passage 와 동일 규율.
  let rawText: string;
  let suggestUsage: unknown;
  try {
    rawText = await (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < SUGGEST_MAX_ATTEMPTS; attempt += 1) {
        const startedAt = Date.now();
        try {
          const { text, usage, providerMetadata } = await generateText({
            model: googleGenerativeAI(SUGGEST_MODEL_ID),
            prompt,
            temperature: 0,
            maxOutputTokens: 2048,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS),
          });
          suggestUsage = atlasUsageWithCost({ usage, providerMetadata });
          console.log(
            `[POINT-SUGGEST] ${SUGGEST_MODEL_ID} attempt ${attempt + 1} ok in ${Date.now() - startedAt}ms`,
          );
          return text;
        } catch (err) {
          lastError = err;
          console.warn(
            `[POINT-SUGGEST] ${SUGGEST_MODEL_ID} attempt ${attempt + 1} failed in ${Date.now() - startedAt}ms:`,
            err instanceof Error ? err.message : err,
          );
          if (APICallError.isInstance(err) && err.isRetryable === false) break;
          if (attempt < SUGGEST_MAX_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error("AI 제안 호출에 실패했습니다.");
    })();
  } catch {
    // 완전 비차단 — 클라는 안내만 띄우고 수동 선택 흐름을 그대로 유지한다.
    return NextResponse.json(
      { error: "AI 포인트 제안에 실패했습니다. 수동 선택은 계속 이용하실 수 있습니다." },
      { status: 502 },
    );
  }

  // 크레딧 차감 없음 — 원가만 기록한다. (recordAiCost 는 내부에서 실패를 삼킨다.)
  await recordAiCost({
    sourceType: "AI_INTERACTIVE",
    sourceDetail: "point-suggest",
    academyId: staff.academyId,
    model: SUGGEST_MODEL_ID,
    operationType: "POINT_SUGGEST",
    usage: suggestUsage,
    metadata: { questionType, unit },
  });

  const suggestions = parseSuggestions(rawText, tokenized);
  if (suggestions.length === 0) {
    // 파싱 실패·전량 드롭·정직한 빈 목록 모두 [] — 빈 결과는 캐시하지 않아
    // 재시도 여지를 남긴다.
    console.warn(`[POINT-SUGGEST] no verified suggestions (passage=${passageId}, type=${questionType})`);
    return NextResponse.json({ suggestions: [], cached: false });
  }

  writeSuggestionCache(cacheKey, contentHash, unit, suggestions);
  return NextResponse.json({ suggestions: suggestions.slice(0, maxPoints), cached: false });
}
