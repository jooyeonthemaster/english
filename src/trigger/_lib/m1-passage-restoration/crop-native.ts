// ============================================================================
// crop-native — 크롭 이미지 1장을 단 한 번의 Gemini 멀티모달 호출로 OCR + 문제풀이
// + 원문 복원 + 변경점(근거)까지 처리한다.
//
// 적응형 인테이크에서 사용자가 시험지에서 "지문(+문제+선지)"을 직접 크롭하므로,
// 1 크롭 = 1 지문이다. 따라서 예전의 "DocAI OCR → Gemini 블록 분류 → finalize 그룹핑
// → DB 조회 → Gemini 복원(배치)" 다단계가 전부 불필요하다. 이 함수가 그 전부를 한 콜로
// 대체한다(실제 평가원/모의고사 크롭 3종으로 RECITATION 없이 동작 검증 완료).
//
// 모델은 passage-restoration 스테이지 설정(Gemini 3.5 Flash)을 따른다. 응답은
// responseSchema로 강제해 형태를 보장한다.
// ============================================================================

import { getExtractionAiModelName } from "@/lib/extraction/model-config";

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
   passage must read as clean prose with NO problem markers (ⓐ, (A), (X), ___) left.
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

Output ONLY JSON. No prose outside JSON.`;

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
      },
    },
  },
  required: ["problemType", "rawText", "restoredText", "changes"],
};

const CROP_RESTORE_TIMEOUT_MS = 90_000;

function getGoogleApiKey(): string {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "Missing env var: GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY",
    );
  }
  return key;
}

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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    getGoogleApiKey(),
  )}`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    params.timeoutInMs ?? CROP_RESTORE_TIMEOUT_MS,
  );
  let body: GeminiResponse;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: params.mimeType, data: params.base64 } },
              { text: "Restore this passage. Return JSON only." },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini crop-restore HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    body = (await res.json()) as GeminiResponse;
  } finally {
    clearTimeout(timer);
  }

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

  let parsed: CropRestoreResult;
  try {
    parsed = JSON.parse(text) as CropRestoreResult;
  } catch (err) {
    throw new Error(
      `Gemini crop-restore JSON parse failure: ${
        err instanceof Error ? err.message : String(err)
      }. Raw: ${text.slice(0, 300)}`,
    );
  }
  // 최소 정합성 — rawText는 반드시, restoredText 비면 rawText로 폴백.
  if (!parsed.rawText || typeof parsed.rawText !== "string") {
    const err = new Error("Gemini crop-restore: rawText missing");
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }
  return {
    problemType: parsed.problemType ?? "unknown",
    rawText: parsed.rawText,
    restoredText: parsed.restoredText?.trim() || parsed.rawText,
    changes: Array.isArray(parsed.changes)
      ? parsed.changes.map((c) => ({
          marker: String(c?.marker ?? ""),
          before: String(c?.before ?? ""),
          after: String(c?.after ?? ""),
          type: String(c?.type ?? "OTHER"),
          reason: String(c?.reason ?? ""),
        }))
      : [],
  };
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
}
