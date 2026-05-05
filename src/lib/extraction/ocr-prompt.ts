// ============================================================================
// OCR Prompt — enforced "verbatim, do not paraphrase" for Korean exam papers.
//
// Design choices:
// - System prompt goes BEFORE the image to resist prompt-injection from text
//   printed on the exam (e.g. handwritten "ignore previous instructions").
// - Explicit rules about Korean exam markers (①②③, 「」, ㉠, ㈎) and Chinese
//   characters, which Gemini otherwise tends to "normalise" into plain ASCII.
// - JSON-ish tail asks for a confidence hint; if the model refuses or omits
//   it, we parse defensively.
//
// NOTE: We are intentionally NOT using structured output (responseMimeType:
// application/json) for this call. Per-page extraction wants raw verbatim
// text; forcing JSON adds format tokens and nudges the model toward
// summarization. Segmentation into passages is a separate deterministic
// step done in src/lib/extraction/segmentation.ts.
// ============================================================================

export const OCR_SYSTEM_PROMPT = `당신은 한국 중·고등학교 시험지(수능/모의평가/학력평가/내신/교재) 전용 OCR 엔진입니다.
모든 포맷(수능, 모평, 학평, 내신 학교시험, 교재·문제집)을 동등한 품질로 처리합니다.

[절대 금지]
1. 의역·요약·문장 다듬기·맞춤법 교정 일체 금지. 오탈자처럼 보여도 원문 그대로 옮긴다.
2. 한글·한자·영문·숫자·특수문자(① ② ③ ④ ⑤, ㉠ ㉡ ㉢, ㈎ ㈏ ㈐, 「 」, 『 』, 【 】, * † ‡ §)는 이미지에 찍힌 글자 그대로 보존한다. 원문자 "①"을 "(1)"이나 "1)"로 바꾸지 않는다.
3. 줄바꿈·들여쓰기·문단 구분은 원문 레이아웃과 동일하게 유지한다.
4. 필기·낙서·형광펜 표시·밑줄·동그라미·별표 같은 사용자 학습 흔적은 출력에 포함하지 않는다. 인쇄된 본문만 옮긴다.
5. 글자가 불확실해 추측이 필요하면 해당 부분을 \`[?]\`로 남기고, 문맥으로 만들어내지 말 것.
6. 개인정보(학생 이름, 전화번호, 학번)는 \`[마스킹]\`으로 치환한다.

[페이지 구조 인식]
한국 시험지의 전형적 구조:
- 상단 헤더: 교재명/단원(예: "리딩파워 Ch.3", "수능특강 Unit 12"), 학교명·학년·학기·교시·과목코드·시행일, "2024학년도 9월 모의평가 영어" 같은 시험 식별 정보
- 수험 유의사항/답안 표시 안내문
- 각 문항 블록: [문제 번호] + [지시문] + [지문 본문] + [선지 ①~⑤]
- 공유 지문 표기: "[2~4] 다음 글을 읽고 물음에 답하시오." 같이 여러 문제가 하나의 지문을 공유
- 하단: 쪽수, 저작권, 다음 장으로 이어짐 표시

[지시문의 다양한 변형 — 모두 원문 그대로 포함하기]
한국어:
- "다음 글을 읽고 물음에 답하시오."
- "다음 글의 주제로 가장 적절한 것은?"
- "다음 글의 제목으로 가장 적절한 것은?"
- "다음 글의 요지로 가장 적절한 것은?"
- "다음 글의 목적으로 가장 적절한 것은?"
- "다음 글의 어조로 가장 적절한 것은?"
- "다음 글의 분위기로 가장 적절한 것은?"
- "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?"
- "다음 글의 내용과 일치하는(하지 않는) 것은?"
- "다음 글의 밑줄 친 부분에 들어갈 말로 가장 적절한 것은?"
- "다음 빈칸에 들어갈 말로 가장 적절한 것은?"
- "(A), (B), (C)의 각 네모 안에서 문맥에 맞는 낱말로 가장 적절한 것은?"
- "[1~3]", "[5~7]", "[20~24]" 같은 범위 표기 (공유 지문 또는 공유 지시)

영어:
- "Read the following passage and answer the questions."
- "Choose the best answer."
- "Which of the following is true according to the passage?"
- "What is the main idea of the passage?"

[출력 형식]
- 추출한 텍스트만 평문으로 출력한다. 마크다운·코드블록·JSON 래핑 금지.
- 헤더/수험 유의사항/쪽수/저작권 같은 비문항 영역도 페이지에 있으면 그대로 포함한다 (세분화는 후처리).
- 지시문, 문항 번호, 선택지도 그대로 포함한다.
- 페이지에 글자가 전혀 없거나 완전히 인식 불가면 빈 문자열을 반환한다.`;

export const OCR_USER_PROMPT = `이 이미지(시험지 한 페이지)에서 위 규칙을 지켜 인쇄된 모든 텍스트를 원문 그대로 추출해 주세요.`;

/** Tokens we advise the caller to set on the Gemini call. */
export const OCR_GENERATION_CONFIG = {
  temperature: 0,
  topK: 1,
  topP: 0,
  maxOutputTokens: 8192,
} as const;

/**
 * Google Gemini API — structured(JSON) 모드에서 JSON 강제용 generation config.
 * Trigger.dev worker 가 이 값을 extend 해서 generateText / generateContent 호출 시 사용한다.
 *
 * `responseSchema` 는 Gemini API provider(ai-sdk, @google/genai 등) 마다 형태가 다르므로
 * 여기서는 주입하지 않고 `responseMimeType` 만 강제한다. 필요 시 worker 쪽에서
 * 이 객체를 spread 해서 `responseSchema` 를 덧붙여 쓰면 된다.
 */
export const STRUCTURED_OCR_GENERATION_CONFIG = {
  ...OCR_GENERATION_CONFIG,
  responseMimeType: "application/json",
} as const;

/** If the model starts its reply with Markdown fences, strip them.
 *  Defensive — Gemini occasionally wraps long text in ``` regardless of prompt.
 *
 *  NOTE: This helper is for LEGACY plain-text OCR output (M1). For structured
 *  JSON mode (M2 / M4) use `sanitizeStructuredJson()` instead — it is aware of
 *  leading/trailing non-JSON prose that Gemini sometimes emits around the
 *  JSON payload even when `responseMimeType: application/json` is set. */
export function sanitizeOcrOutput(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "");
  }
  return text.trim();
}

/**
 * Walk `str` and return the `[start, end)` offsets of the first balanced
 * top-level JSON value (`{...}` or `[...]`). String literals are respected —
 * braces/brackets inside double-quoted strings do NOT affect the depth
 * counter, which guards against false positives when prose around the JSON
 * contains `{` / `}` or `[` / `]` (e.g. "returned {foo: bar} yesterday").
 *
 * Returns `null` when no balanced top-level structure is present.
 */
function findFirstTopLevelJson(
  str: string,
): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < str.length; i += 1) {
    const c = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (inStr) {
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{" || c === "[") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}" || c === "]") {
      if (depth === 0) continue; // stray closer before any opener — skip
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return { start, end: i + 1 };
      }
    }
  }
  return null;
}

/**
 * Strip Markdown fences / extra prose around a JSON payload returned by the
 * structured OCR prompt. Produces a string that is safe to pass to
 * `JSON.parse` in the happy path.
 *
 * Robust against these Gemini quirks:
 *   - ` ```json\n{...}\n``` ` fenced block
 *   - ` ```\n{...}\n``` ` unlabeled fence
 *   - Leading/trailing whitespace or explanatory sentences
 *   - Trailing commentary after the closing `}` / `]`
 *   - Prose containing stray `{` / `}` characters (handled by the
 *     string-aware `findFirstTopLevelJson` scanner — a pure `indexOf("{")`
 *     approach would misidentify the payload's start).
 *
 * If no balanced brace/bracket block is found, throws
 * `Error("SANITIZE_STRUCTURED_JSON_NO_OBJECT")`. Callers should classify that
 * as `PARSE_ERROR` and surface it upstream instead of retrying into an
 * infinite loop.
 */
export function sanitizeStructuredJson(raw: string): string {
  if (typeof raw !== "string") {
    throw new Error("SANITIZE_STRUCTURED_JSON_NOT_STRING");
  }
  let text = raw.trim();

  // 1) Strip Markdown fences (```json ... ``` / ``` ... ```), including
  //    variants with CRLF, tabs, or language tags like ```JSON / ```json5.
  //    We loop because Gemini sometimes double-wraps.
  for (let guard = 0; guard < 3; guard += 1) {
    const fenceOpen = /^```[ \t]*[a-zA-Z0-9_-]*[ \t]*\r?\n?/;
    const fenceClose = /\r?\n?[ \t]*```[ \t]*$/;
    if (fenceOpen.test(text) || fenceClose.test(text)) {
      text = text.replace(fenceOpen, "").replace(fenceClose, "").trim();
      continue;
    }
    break;
  }

  // 2) Locate the first balanced top-level JSON region via a brace/bracket
  //    counter that is aware of string literals. This replaces the old
  //    `indexOf("{") + lastIndexOf("}")` heuristic, which happily matched
  //    braces sitting inside prose (e.g. "see {docs} for details").
  const region = findFirstTopLevelJson(text);
  if (!region) {
    throw new Error("SANITIZE_STRUCTURED_JSON_NO_OBJECT");
  }
  text = text.slice(region.start, region.end);

  return text.trim();
}

// ============================================================================
// Mode-aware prompt variants — M1 / M2 / M3 / M4
// ----------------------------------------------------------------------------
// Legacy `OCR_SYSTEM_PROMPT` / `OCR_USER_PROMPT` stays as the M1 default so
// existing Trigger.dev tasks keep working. For the new block-classifying flow
// (M2 / M4), use `STRUCTURED_OCR_SYSTEM_PROMPT` together with
// `structuredOcrResponseSchema` and treat the response as JSON.
// ============================================================================

import { z } from "zod";
import { getModeConfig, type ExtractionMode } from "./modes";

/**
 * Build a system prompt for the given mode. Appends the mode's `promptAddon`
 * to the common verbatim/privacy rules.
 */
export function buildOcrSystemPrompt(mode: ExtractionMode): string {
  const cfg = getModeConfig(mode);
  return `${OCR_SYSTEM_PROMPT}\n\n[모드 지시]\n${cfg.promptAddon}`;
}

/**
 * Build the per-page user prompt. Includes page position so the model knows
 * which page is the cover / header page (relevant for FULL_EXAM).
 */
export function buildOcrUserPrompt(
  mode: ExtractionMode,
  pageIndex: number,
  totalPages: number,
): string {
  const cfg = getModeConfig(mode);
  const oneBased = pageIndex + 1;
  const positionHint =
    pageIndex === 0
      ? "이 페이지는 전체 묶음의 첫 장입니다. 시험지 헤더(시행년도·회차·과목·학년)가 있다면 반드시 포함해 주세요."
      : pageIndex === totalPages - 1
        ? "이 페이지는 마지막 장입니다. 저작권 고지·쪽수 표기 같은 머리말·꼬리말은 본문과 분리해서 다뤄 주세요."
        : "";
  return [
    `이 이미지는 전체 ${totalPages}장 중 ${oneBased}번째 페이지입니다.`,
    `모드: ${cfg.shortLabel} — ${cfg.label}.`,
    positionHint,
    "위 규칙을 지켜 인쇄된 모든 텍스트를 원문 그대로 추출해 주세요.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Structured (JSON) OCR — for M2 / M4 block classification ──────────────

export const STRUCTURED_OCR_SCHEMA_HINT = `[JSON 스키마 — 엄격히 준수]
{
  "blocks": [
    {
      "blockType": "EXAM_META" | "HEADER" | "FOOTER" | "PASSAGE_BODY" | "QUESTION_STEM" | "CHOICE" | "EXPLANATION" | "DIAGRAM" | "NOISE",
      "content": "블록 본문 (원문 verbatim — 오탈자·공백·줄바꿈 보존)",
      "confidence": 0.0~1.0 (선택, 인식 신뢰도),
      "questionNumber": 1~999 정수 (QUESTION_STEM/CHOICE/EXPLANATION에 권장),
      "choiceIndex": 1~9 정수 (CHOICE에만, ①=1 ⑤=5),
      "isAnswer": true/false (CHOICE에만, 정답 표기★/●/■가 보일 때만 true),
      "sharedPassageRange": "2~4" 형태 문자열 (선택, 이 블록이 속한 공유 지문 범위)
    }
  ],
  "pageMeta": {
    "hasExamHeader": boolean,
    "subject": "ENGLISH" | "KOREAN" | "MATH" | "OTHER",
    "year": 정수,
    "round": "6월" | "9월" | "수능" | "중간" | "기말" | "1회" 등,
    "schoolName": 문자열 (내신시험일 때),
    "publisher": 문자열 (교재/학습지일 때, 예: "리딩파워", "수능특강", "빠바")
  }
}`;

export const STRUCTURED_OCR_SYSTEM_PROMPT = `${OCR_SYSTEM_PROMPT}

[구조화 모드 — 블록 단위 분류]

다음 규칙에 따라 페이지 내용을 **의미 단위 블록들**로 분해해 JSON으로 출력한다.
출력은 오직 JSON 한 개(스키마 준수). 마크다운/코드블록/주석 금지.

[블록 타입별 판별 기준]

◆ EXAM_META — 시험/자료 식별 메타데이터 (오직 1페이지 상단에만)
  포함: 학년도, 회차/월차, 시험 종류, 과목명, 학교명, 학년·학기·교시, 교재명, 출판사·단원
  예시 내용:
    - "2024학년도 9월 모의평가 영어"
    - "2024학년도 대학수학능력시험 영어 영역"
    - "연수고등학교 2024학년도 2학기 2회고사 영어"
    - "리딩파워(유형완성) Ch 3,4,13~16강"
    - "수능특강 영어 Unit 12"
    - "과목코드: [44]", "제 2 교시", "2학년 공통과정"
  → 반드시 EXAM_META로 분리. PASSAGE_BODY나 HEADER로 절대 분류 금지.
  → pageMeta 필드(subject/year/round/schoolName/publisher)도 함께 채운다.

◆ HEADER — 페이지 머리말 (비문항 장식)
  포함: 페이지 번호, 쪽수 표기("1", "- 1 -"), 로고, 문서 타이틀 반복, 답안 작성 유의사항 헤더
  → 본문과 분리해 별도 블록으로.

◆ FOOTER — 페이지 꼬리말
  포함: 저작권 고지("© 2024 출판사"), 쪽수, "다음 장으로" 안내
  → 본문에 섞지 말 것.

◆ PASSAGE_BODY — 지문 본문 (읽기 지문)
  - 지시문·문제 번호·선지를 포함하지 않는 순수 본문 텍스트
  - 문장 2개 이상, 최소 20자 이상 권장
  - 시험지 지문/교재 지문 모두 해당
  - 여러 문단이면 줄바꿈 2개로 분리 보존

◆ QUESTION_STEM — 문제 지시문(문두)
  - 문제 번호 + 지시문 (선지는 별도 블록)
  - 예:
    * "1. 다음 글의 주제로 가장 적절한 것은?"
    * "2. 다음 글에서 필자가 주장하는 바로 가장 적절한 것은? [3.1점]"
    * "[2~4] 다음 글을 읽고 물음에 답하시오."
  - 배점 표시([3.1점])도 content에 포함
  - 소문항("1-①", "1-(가)")도 독립 QUESTION_STEM

◆ CHOICE — 선지 (각각 독립 블록 ①~⑤)
  - ①②③④⑤ 각 선지를 반드시 5개 분리. 한 블록에 여러 선지 묶기 금지.
  - content에는 "① situations workers get stressed out" 전체 포함 (원문자 포함)
  - questionNumber: 이 선지가 속한 문제 번호 (필수)
  - choiceIndex: 1~5
  - isAnswer: 이미지에 명확한 정답 표시(★/●/■/체크표시)가 있을 때만 true

◆ EXPLANATION — 정답 해설
  - "정답", "해설", "풀이" 같은 섹션 이후 본문
  - questionNumber와 함께

◆ DIAGRAM — 도표/그림/표 (OCR 불가능한 시각 요소)
  - content: "(표: 국가별 GDP 비교)" 같은 설명

◆ NOISE — 낙서/필기/형광펜 마킹 흔적
  - 가능하면 아예 제외. 꼭 남겨야 하면 NOISE로.

[공유 지문 vs 공유 지시문 — 매우 중요]

범위 표기 "[2~4]"가 나올 때 두 가지 케이스를 반드시 구분:

케이스 A — 공유 지문 (여러 문제가 지문 1개를 공유):
  "[2~4] 다음 글을 읽고 물음에 답하시오."
  → PASSAGE_BODY 1개 (sharedPassageRange: "2~4")
  → QUESTION_STEM 3개 (questionNumber: 2, 3, 4, 각각 sharedPassageRange: "2~4")
  → CHOICE 각 문제당 5개씩 총 15개

케이스 B — 공유 지시문 (여러 문제가 지시만 공유, 지문은 각각):
  "[2~4] 다음 글의 주제로 가장 적절한 것을 고르시오."
  이어서 각 번호마다 별도 본문이 나옴.
  → PASSAGE_BODY 3개 (각각 다른 내용, sharedPassageRange: null)
  → QUESTION_STEM 3개 (각 문제, sharedPassageRange: null)
  → CHOICE 각 문제당 5개씩

판별 기준:
- 지시가 "다음 글을 읽고" / "Read the following passage" 형태 + 본문이 1개만 이어지면 → 케이스 A
- 지시가 "다음 글의 주제로" / "다음 글에서 필자가" / "다음 글의 제목으로" 같은 질문형 + 범위 안 각 번호마다 별도 본문이 이어지면 → 케이스 B
- 본문 개수 = 문제 개수면 케이스 B, 본문 1개 + 문제 다수면 케이스 A

[출력 순서 규칙]
1. EXAM_META (페이지 1 상단만)
2. HEADER (있으면)
3. 각 문항 묶음: PASSAGE_BODY → QUESTION_STEM → CHOICE × 5 (순서 반복)
4. EXPLANATION (있으면)
5. FOOTER (있으면)
블록 순서는 시험지에서 읽는 순서(좌→우, 상→하, 2단 레이아웃은 좌 전체 → 우 전체).

[엄격 준수]
- 출력은 JSON 1개. 그 외 일체 금지.
- 모든 선지 ①~⑤는 반드시 5개 독립 CHOICE 블록. 한 블록에 병합 금지.
- questionNumber는 명확할 때 반드시 기입 (비워두면 후처리에서 매핑 실패).
- 오탈자도 원문 verbatim 보존.

${STRUCTURED_OCR_SCHEMA_HINT}`;

const PASSAGE_ONLY_STRUCTURED_ADDON = `
[PASSAGE_ONLY additional rules]
- The primary goal is to detect passage boundaries accurately.
- Emit one PASSAGE_BODY block for each distinct passage body on the page.
- A single page may contain zero, one, or many PASSAGE_BODY blocks.
- If the same passage continues from a previous page, emit only the continuation text on this page as PASSAGE_BODY. Do not repeat prior-page text.
- Never include question numbers, question stems, choices, slide numbers, page counters, STEP/CASE/SLIDE labels, or section labels inside PASSAGE_BODY.
- When boundary cues depend on nearby questions or choices, keep those as QUESTION_STEM / CHOICE blocks so the downstream grouper can separate adjacent passages correctly.
- Even when there are no question blocks, still emit PASSAGE_BODY for standalone prose/textbook passages instead of collapsing the whole page into HEADER/NOISE.
`;

export function buildStructuredOcrSystemPrompt(mode: ExtractionMode): string {
  if (mode !== "PASSAGE_ONLY") return STRUCTURED_OCR_SYSTEM_PROMPT;
  return `${STRUCTURED_OCR_SYSTEM_PROMPT}\n\n${PASSAGE_ONLY_STRUCTURED_ADDON}`;
}

/** Parsed structured OCR response. Used by worker after JSON.parse. */
export const structuredOcrResponseSchema = z.object({
  blocks: z
    .array(
      z.object({
        blockType: z.enum([
          "PASSAGE_BODY",
          "QUESTION_STEM",
          "CHOICE",
          "EXPLANATION",
          "EXAM_META",
          "HEADER",
          "FOOTER",
          "DIAGRAM",
          "NOISE",
        ]),
        content: z.string(),
        confidence: z.number().min(0).max(1).nullable().optional(),
        questionNumber: z.number().int().min(1).max(999).nullable().optional(),
        choiceIndex: z.number().int().min(1).max(9).nullable().optional(),
        isAnswer: z.boolean().nullable().optional(),
        /** Range (e.g. "2~4") this block belongs to when it's part of a
         *  shared-passage set. Null / omitted for independent passages. */
        sharedPassageRange: z.string().nullable().optional(),
      }),
    )
    .default([]),
  pageMeta: z
    .object({
      hasExamHeader: z.boolean().nullable().optional(),
      subject: z.enum(["ENGLISH", "KOREAN", "MATH", "OTHER"]).nullable().optional(),
      year: z.number().int().nullable().optional(),
      round: z.string().nullable().optional(),
      schoolName: z.string().nullable().optional(),
      publisher: z.string().nullable().optional(),
    })
    .optional(),
});

export type StructuredOcrResponse = z.infer<typeof structuredOcrResponseSchema>;
