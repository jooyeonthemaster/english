// ============================================================================
// crop-native — 크롭 이미지 1장을 단 한 번의 Gemini 멀티모달 호출로 OCR + 문제풀이
// + 원문 복원 + 변경점(근거)까지 처리한다.
//
// 적응형 인테이크에서 사용자가 시험지에서 "지문(+문제+선지)"을 직접 크롭하므로,
// 1 크롭 = 1 지문이다. 따라서 예전의 "DocAI OCR → Gemini 블록 분류 → finalize 그룹핑
// → DB 조회 → Gemini 복원(배치)" 다단계가 전부 불필요하다. 이 함수가 그 전부를 한 콜로
// 대체한다(실제 평가원/모의고사 크롭 3종으로 RECITATION 없이 동작 검증 완료).
//
// 모델은 passage-restoration 스테이지 설정(기본 gemini-3.5-flash-lite, env
// OPENROUTER_RESTORATION_MODEL 로 오버라이드)을 따른다. 응답은 response_format:
// json_schema(strict)로 와이어에서 강제하고, 파싱은 펜스 제거·별칭 흡수로 한 번 더
// 방어한다(26-07-27 장애: json_object 만 보내던 시절 3.1-flash-lite 가 rawText 를
// ocrText 로 자유작명 → 전건 EMPTY_OUTPUT DEAD).
// ============================================================================

import { postAtlasChatCompletionAsGeminiLike } from "@/lib/atlas-chat-rest";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { stripProblemMarkers } from "./text-utils";

export interface CropRestoreChange {
  /** 어느 마커/빈칸을 고쳤는지(예: "(X)[As a result / However]", "ⓓ", "( Ⓔ )"). */
  marker: string;
  before: string;
  after: string;
  /** 리뷰 "복원 근거" 패널의 유형 라벨용. VOCAB/GRAMMAR/BLANK/WORD_ORDER/INSERTION/
   *  ORDERING/SUMMARY/OTHER 중 하나. 화이트리스트에 없으면 호출자가 OTHER로 매핑. */
  type: string;
  /** 한국어 해설(왜 이게 정답인지) — 패널 메모로 그대로 표시된다. */
  reason: string;
}

export interface CropRestoreResult {
  /** 문제 유형(모델 자체 분류, 예: connector_selection, blank_fill, grammar). */
  problemType: string;
  /** 크롭의 충실한 OCR(문제 마커·선지 그대로 보존) — 리뷰의 "원문" 좌측. */
  rawText: string;
  /** 마커를 정답으로 치환·정렬한 완성된 원문 — 리뷰의 "복원본" 우측 / teacherText. */
  restoredText: string;
  /** 마커별 변경 근거 — 리뷰 변경점 패널/하이라이트로 표시. */
  changes: CropRestoreChange[];
  /** 토큰/실측 청구액(USD) — 원가 원장(ExtractionPage.aiCostUsd) 기록용. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}

const SYSTEM_PROMPT = `You are an expert assistant for Korean high-school English exams.
You receive ONE cropped image containing exactly ONE English passage that has been
turned into a problem: blanks to fill (___ or (X)____), a connector/word to choose
from inline options like (X)[As a result / However], a scrambled sentence order
((A)(B)(C)), an inserted sentence, or an irrelevant/grammatically-marked sentence.

Do ALL of this in this single response:
1) OCR the passage faithfully, keeping the problem markers exactly as printed.
2) Identify the problem type and the in-image choices.
3) SOLVE it and write the fully RESTORED original passage: every blank filled with the
   correct answer, every inline choice replaced by the single correct option, order
   fixed, irrelevant sentence removed, grammar/word errors corrected. The restored
   passage must read as clean prose with NO problem markers left — this includes
   ⓐ-ⓔ, lowercase letter markers (a)-(e), (A)/(B)/(C) chunk labels, (X), ___ blanks
   (fill EVERY blank — never leave one), circled numbers ①-⑤, underlines, AND
   insertion-slot markers like ( ① )( ② )( ③ )( ④ )( ⑤ ): remove every slot marker
   after placing the inserted sentence. Also drop the question number, Korean
   instruction line (발문), score tags like [3점], and the choice list — restoredText
   is the passage body only. Keep word-gloss footnote lines (e.g. "* sanction: 제재를
   가하다") verbatim at the end if present.
   If the passage is already clean (no problem to solve), restoredText must equal the
   OCR text and changes must be empty.
4) For every SUBSTANTIVE restoration add a "changes" entry — the chosen answer for a
   blank/connector, a corrected grammar/word form, a moved or removed sentence. Each:
     - marker: the related problem marker (e.g. "(X)", "ⓓ", "( Ⓔ )")
     - before: the original problem fragment (with its marker/options)
     - after: your restored fragment (the single correct text; "" if you removed it)
     - type: EXACTLY ONE of VOCAB, GRAMMAR, BLANK, WORD_ORDER, INSERTION, ORDERING,
       SUMMARY, OTHER (use BLANK for blank/connector choices, GRAMMAR for 어법,
       VOCAB for 어휘, INSERTION for 문장삽입, ORDERING for 순서, OTHER if unsure)
     - reason: a SHORT Korean explanation (해설) of WHY this is the answer
   Do NOT add entries for merely stripping cosmetic markers (ⓐ, (A), (X) brackets)
   when the wording is otherwise unchanged — only real answer/correction edits.

Output ONLY JSON. No prose outside JSON. The JSON object must use EXACTLY these
top-level keys and no others:
  { "problemType": string, "rawText": string, "restoredText": string, "changes": [...] }
"rawText" is the faithful OCR of step 1 (NOT "ocrText" or any other name);
"restoredText" is the solved restoration of step 3.`;

// response_format: json_schema 로 와이어에 실제 전송된다(strict). additionalProperties
// 명시는 strict 모드 프로바이더 호환 요건.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    problemType: { type: "string" },
    rawText: { type: "string" },
    restoredText: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          marker: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          type: {
            type: "string",
            enum: [
              "VOCAB",
              "GRAMMAR",
              "BLANK",
              "WORD_ORDER",
              "INSERTION",
              "ORDERING",
              "SUMMARY",
              "OTHER",
            ],
          },
          reason: { type: "string" },
        },
        required: ["marker", "before", "after", "type", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["problemType", "rawText", "restoredText", "changes"],
  additionalProperties: false,
};

/**
 * 모델 출력 JSON 방어 파싱 — 마크다운 펜스 제거 → 실패 시 최외곽 {} 재시도.
 * json_schema 강제가 1차 방어지만, 프로바이더가 스키마를 무시/미지원해도
 * 여기서 한 번 더 살린다.
 */
function parseModelJson(text: string): Record<string, unknown> {
  const unfenced = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(unfenced) as Record<string, unknown>;
  } catch (err) {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw err;
  }
}

/** 키 자유작명 흡수 — 과거 장애에서 관측된 별칭(ocrText 등)을 정본 키로 정규화. */
function readStringAlias(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

const CROP_RESTORE_TIMEOUT_MS = 90_000;

/**
 * 크롭 이미지 1장 → {원문 OCR, 복원본, 변경점}. 단일 Gemini 멀티모달 호출.
 * 빈 출력(RECITATION 등)·형태 불일치는 throw → 호출자가 페이지 실패로 처리.
 */
export async function restoreCropImage(params: {
  base64: string;
  mimeType: string;
  /** AbortSignal 등 향후 확장 여지. */
  timeoutInMs?: number;
}): Promise<CropRestoreResult> {
  const model = getExtractionAiModelName("passage-restoration");
  const body = await postAtlasChatCompletionAsGeminiLike({
    model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: "Restore this passage. Return JSON only.",
    image: { mimeType: params.mimeType, base64: params.base64 },
    temperature: 0.2,
    maxOutputTokens: 8192,
    responseJsonSchema: { name: "crop_restore", schema: RESPONSE_SCHEMA },
    timeoutInMs: params.timeoutInMs ?? CROP_RESTORE_TIMEOUT_MS,
  }) as GeminiResponse;

  const cand = body.candidates?.[0];
  const text =
    cand?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  if (!text) {
    const err = new Error(
      `Gemini crop-restore empty output; finishReason=${cand?.finishReason ?? "unknown"}`,
    );
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseModelJson(text);
  } catch (err) {
    const wrapped = new Error(
      `Gemini crop-restore JSON parse failure: ${
        err instanceof Error ? err.message : String(err)
      }. Raw: ${text.slice(0, 300)}`,
    );
    (wrapped as Error & { code?: string }).code = "PARSE_ERROR";
    throw wrapped;
  }
  // 최소 정합성 — rawText는 반드시(별칭 흡수 포함), restoredText 비면 rawText로 폴백.
  const rawText = readStringAlias(parsed, ["rawText", "ocrText", "ocr", "text"]);
  if (!rawText) {
    const err = new Error(
      `Gemini crop-restore: rawText missing (keys=${Object.keys(parsed).join(",")})`,
    );
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }
  // (a)~(e)·(A)~(Z) 마커는 모델(3.5-lite·3.6-flash 공통)이 지시에도 간헐적으로
  // 남긴다 — 결정론적 후처리로 확실히 제거한다(텍스트 경로와 동일한 안전망).
  const restoredText = stripProblemMarkers(
    readStringAlias(parsed, ["restoredText", "restored", "restoredPassage"]) ?? "",
  );
  const changes = parsed.changes;
  return {
    problemType:
      typeof parsed.problemType === "string" ? parsed.problemType : "unknown",
    rawText,
    restoredText: restoredText?.trim() || rawText,
    changes: Array.isArray(changes)
      ? (changes as Array<Record<string, unknown> | null>).map((c) => ({
          marker: String(c?.marker ?? ""),
          before: String(c?.before ?? ""),
          after: String(c?.after ?? ""),
          type: String(c?.type ?? "OTHER"),
          reason: String(c?.reason ?? ""),
        }))
      : [],
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount,
      outputTokens: body.usageMetadata?.candidatesTokenCount,
      costUsd: body.usageMetadata?.costUsd,
    },
  };
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    costUsd?: number;
    generationId?: string;
  };
}
