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

export const OCR_SYSTEM_PROMPT = `당신은 한국 중·고등학교 시험지(수능/모의평가/학력평가/내신/교재) 이미지를 디지털 텍스트로 옮겨 적는 텍스트 인식 도우미입니다.
모든 포맷(수능, 모평, 학평, 내신 학교시험, 교재·문제집)을 동등한 품질로 처리합니다.

[작업 원칙]
1. 의역·요약·문장 다듬기·맞춤법 교정은 하지 않는다. 이미지에 인쇄된 글자의 형태를 그대로 옮긴다.
2. 한글·한자·영문·숫자·특수문자(① ② ③ ④ ⑤, ㉠ ㉡ ㉢, ㈎ ㈏ ㈐, 「 」, 『 』, 【 】, * † ‡ §)는 이미지에 찍힌 형태대로 기록한다. 원문자 "①"을 "(1)"이나 "1)"로 바꾸지 않는다.
3. 줄바꿈·들여쓰기·문단 구분은 이미지의 레이아웃과 동일하게 유지한다.
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

[지시문의 다양한 변형 — 모두 이미지에 보이는 그대로 기록]
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
- 인식한 텍스트만 평문으로 출력한다. 마크다운·코드블록·JSON 래핑 금지.
- 헤더/수험 유의사항/쪽수/저작권 같은 비문항 영역도 이미지에 있으면 함께 기록한다 (세분화는 후처리).
- 지시문, 문항 번호, 선택지도 함께 기록한다.
- 이미지에 글자가 전혀 없거나 완전히 인식 불가면 빈 문자열을 반환한다.`;

export const OCR_USER_PROMPT = `이 이미지(시험지 한 페이지)의 인쇄된 모든 텍스트를 위 작업 원칙대로 기록해 주세요.`;

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
/**
 * Repair invalid backslash-escape sequences inside JSON string literals.
 *
 * Gemini's structured output occasionally emits `\X` where X is not a valid
 * JSON escape character — most commonly when the model includes a non-ASCII
 * character (CJK ideograph, Hangul, fullwidth punctuation) right after a
 * backslash that the OCR layer dropped in by accident. Example failure:
 *
 *     "...and are\热情ly adopt..."   ← `\热` is not a valid JSON escape
 *
 * Strict JSON.parse rejects the whole document on a single bad escape, even
 * when the rest of the response is fine. We pre-process the text:
 *
 *   - Walk the string. Track whether we are inside a `"..."` string literal.
 *   - Outside a string: leave bytes alone.
 *   - Inside a string: when we see `\`, look at the next character. If it is
 *     one of the seven canonical escape chars (`"\\/bfnrt`) or the unicode
 *     `u` (followed by 4 hex digits), we keep the backslash. Otherwise we
 *     drop the backslash and keep just the following character.
 *
 * This is intentionally conservative — we only strip the offending backslash;
 * the character that followed it remains in the string content, so the OCR
 * text is preserved as-is.
 */
function repairInvalidEscapes(text: string): string {
  const VALID_ESCAPE_CHARS = new Set([
    '"',
    "\\",
    "/",
    "b",
    "f",
    "n",
    "r",
    "t",
  ]);
  const out: string[] = [];
  let inStr = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (!inStr) {
      if (c === '"') inStr = true;
      out.push(c);
      i += 1;
      continue;
    }
    // Inside a string literal.
    if (c === '"') {
      inStr = false;
      out.push(c);
      i += 1;
      continue;
    }
    if (c === "\\") {
      const next = text[i + 1];
      if (next === undefined) {
        // Trailing backslash with no following char — drop it.
        i += 1;
        continue;
      }
      if (next === "u") {
        // \uXXXX — peek 4 hex digits; if valid, keep entire 6-char run.
        const hex = text.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out.push(text.slice(i, i + 6));
          i += 6;
          continue;
        }
        // Invalid \uXXXX — drop the backslash, keep the 'u'.
        out.push("u");
        i += 2;
        continue;
      }
      if (VALID_ESCAPE_CHARS.has(next)) {
        out.push("\\" + next);
        i += 2;
        continue;
      }
      // Invalid escape — drop the backslash, keep the following character.
      out.push(next);
      i += 2;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join("");
}

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

  // 3) Repair invalid `\X` escape sequences (e.g. `\热` from CJK characters
  //    that leaked into the OCR text after a stray backslash). Without this
  //    the JSON.parse call rejects the whole response with "Unexpected token".
  text = repairInvalidEscapes(text);

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
  const positionHint =
    pageIndex === 0
      ? "이 페이지는 업로드 묶음의 첫 장입니다. 시험지 헤더(시행년도·회차·과목·학년)가 있다면 반드시 포함해 주세요."
      : pageIndex === totalPages - 1
        ? "이 페이지는 업로드 묶음의 마지막 장입니다. 저작권 고지·쪽수 표기 같은 머리말·꼬리말은 본문과 분리해서 다뤄 주세요."
        : "";
  // 업로드 묶음 인덱스는 시험지 자체의 쪽수와 다를 수 있다 (사용자가 여러 시험지를 한 번에 올림 / 순서가 뒤섞임).
  // 그래서 더 이상 "N장 중 M번째" 라고 알려주지 않는다 — 페이지 쪽수는 페이지에 실제로 표기된 표시에서만 추출.
  return [
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
      "content": "블록 본문 (이미지에 인쇄된 형태 그대로 기록 — 오탈자·공백·줄바꿈 보존). 변형하거나 복원하지 말 것.",
      "confidence": 0.0~1.0 (선택, 인식 신뢰도),
      "questionNumber": 1~999 정수 (QUESTION_STEM/CHOICE/EXPLANATION에 권장),
      "choiceIndex": 1~9 정수 (CHOICE에만, ①=1 ⑤=5),
      "isAnswer": true/false (CHOICE에만, 정답 표기★/●/■가 보일 때만 true),
      "sharedPassageRange": "2~4" 형태 문자열 (선택, 이 블록이 속한 공유 지문 범위),
      "questionAnalysis": {                  // QUESTION_STEM에만 채움. 그 외는 null/생략.
        "questionType": "BLANK_INFERENCE" | "BLANK_WORD" | "BLANK_SENTENCE" | "CONNECTOR" | "SENTENCE_ORDER" | "PARAGRAPH_ORDER" | "SENTENCE_INSERT" | "IRRELEVANT" | "GRAMMAR_ERROR" | "GRAMMAR_CORRECTION" | "VOCAB_CHOICE" | "CONTEXT_MEANING" | "REFERENCE" | "CONTENT_MATCH" | "TOPIC_MAIN_IDEA" | "TITLE" | "PURPOSE" | "MOOD_TONE" | "SUMMARY_COMPLETE" | "WORD_ORDER" | "SENTENCE_TRANSFORM" | "CONDITIONAL_WRITING" | "TEXTBOOK_DETAIL" | "DIALOGUE_ORDER" | "DIALOGUE_RESPONSE" | "KOREAN_TRANSLATION" | "ENGLISH_DEFINITION" | "UNKNOWN",
        "typeLabel": "주제" | "제목" | "빈칸 추론" | "글의 순서" | "문장 삽입" | "무관한 문장" | "어법" | "어휘" 등 한국어 라벨,
        "answer": "③" 또는 "(B)-(A)-(C)" 같이 문제의 정답 (모르면 null),
        "answerConfidence": 0.0~1.0 (정답 단서 신뢰도, 모르면 null),
        "evidence": ["문제 풀이 근거가 된 본문/선지 단서들"],
        "warnings": ["풀이 시 주의사항"]
      },
      "continuesFromPrevious": boolean (PASSAGE_BODY only — 이 본문이 이전 페이지에서 이어진 것이면 true),
      "continuesToNext": boolean (PASSAGE_BODY only — 이 본문이 다음 페이지로 이어지면 true),
      "boundaryConfidence": 0.0~1.0 (PASSAGE_BODY only — 경계 판정 신뢰도)
    }
  ],
  "pageMeta": {
    "hasExamHeader": boolean,
    "subject": "ENGLISH" | "KOREAN" | "MATH" | "OTHER",
    "year": 정수,
    "round": "6월" | "9월" | "수능" | "중간" | "기말" | "1회" 등,
    "schoolName": 문자열 (내신시험일 때),
    "publisher": 문자열 (교재/학습지일 때, 예: "리딩파워", "수능특강", "빠바"),
    "pageNumber": 정수 또는 null (이 페이지의 번호 — "1 / 8" 이면 1, "( 2 )" 이면 2; 표시 없으면 null),
    "pageTotal": 정수 또는 null (이 페이지에 보이는 전체 쪽수 — "1 / 8" 이면 8; 없으면 null),
    "examCode": 문자열 또는 null (페이지 상단의 시험 코드 — "과목코드 03", "코드 [05]" 같이 적힌 식별자; 없으면 null),
    "problemEvidence": {                     // 페이지 단위 풀이 단서 (선택)
      "sourceHints": ["출처 추정 단서 (대표 문장, 인용 표시 등)"],
      "unresolved": ["풀이 못 한 부분 메모"],
      "warnings": ["페이지 단위 경고"]
    }
  }
}

[복원 관련 필드는 사용 금지]
- restoredText / restorationStatus / restorationChanges / restorationWarnings 필드는 1차 호출에서 사용하지 않는다. 본문은 \`content\`에 원문 그대로만 담는다. 복원은 후속 단계에서 별도 처리한다.`;

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

[페이지 식별 신호 (CRITICAL — 페이지 정렬 / cluster용)]
- 페이지 어디든 "N / M", "(N)", "- N -", "N쪽", "N page" 같은 페이지 표기가 보이면
  → pageMeta.pageNumber = N, pageMeta.pageTotal = M (분모 있을 때만).
  EXAM_META / HEADER / FOOTER 어느 블록에 들어가든 pageMeta 에 함께 기록.
- "과목코드 03", "코드 [05]", "시험번호: 7" 같은 시험 식별 코드가 페이지 상단에 보이면
  → pageMeta.examCode = "03" (숫자만 또는 표시 그대로 짧게).
  같은 시험지의 모든 페이지는 같은 examCode 를 공유한다. cluster signal로 사용.
- 페이지 번호 / 시험 코드가 안 보이면 해당 필드를 null 로.

[페이지 경계 처리 (CRITICAL — 문제/본문/보기가 페이지 사이에 잘리는 케이스)]
- 페이지 마지막 부분에 "다음 쪽에 계속", "▶", "→ 계속", "(계속)", "→" 같은 continuation 표시가 보이면
  → 그 직전 블록 (보통 마지막 PASSAGE_BODY 또는 마지막 QUESTION_STEM) 의
    continuesToNext = true 로 표시. PASSAGE_BODY 가 아니라 QUESTION_STEM 인 경우에도
    questionMeta 에 continuesToNext 형태로 보존 (선택 — 모르면 가까운 PASSAGE_BODY 에라도).
- 페이지 첫 부분이 곧장 ①, ②, ③, ④, ⑤ 같은 보기 마커로 시작하면
  → 그 보기들은 이전 페이지의 QUESTION_STEM 에 속하는 CHOICE 들이다. CHOICE 블록으로
    출력하고, 같은 페이지 안에 등장하는 다른 STEM (다음 문제) 의 자식으로 묶지 말 것.
    parentLocalId 는 비워둔다 (finalize 가 글로벌 순서로 자동 연결).
- 페이지 첫 PASSAGE_BODY 가 소문자 / 연결사 / 마침표 없는 절로 시작하면
  → 그 블록의 continuesFromPrevious = true 로 표시. 이전 페이지의 본문 끝과 자연스럽게
    이어지는 segment 임을 명시.
- 페이지 마지막 PASSAGE_BODY 가 마침표/물음표/느낌표로 끝나지 않으면
  → 그 블록의 continuesToNext = true 로 표시 (continuation 표시가 없어도).

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
  - **빈칸 표시**: 빈칸 추론 문제에서 시험지의 빈칸은 보통 긴 공백, 밑줄,
    또는 박스로 표시된다. content 에 옮길 때는 반드시 **"________"
    (underscore 8개 이상)** 로 변환해 빈칸 위치를 명시한다. 예:
    * "It's like a piece of ________ translation"
    * "Centralized, formal rules can ________"
    * "we tend to ________ our knowledge"
    공백/밑줄/박스 그대로 두면 후속 복원 단계에서 빈칸 위치를 추정할
    수 없어 빈칸이 사라진다. **빈칸 자리는 절대 누락하지 말 것**.

◆ QUESTION_STEM — 문제 지시문(문두)
  - 문제 번호 + 지시문 (선지는 별도 블록)
  - 예:
    * "1. 다음 글의 주제로 가장 적절한 것은?"
    * "2. 다음 글에서 필자가 주장하는 바로 가장 적절한 것은? [3.1점]"
    * "[2~4] 다음 글을 읽고 물음에 답하시오."
  - 배점 표시([3.1점])도 content에 포함
  - 소문항("1-①", "1-(가)")도 독립 QUESTION_STEM
  - **공유 지시문 "[N~M] ..." 은 반드시 별도 QUESTION_STEM 블록으로 추출**한다.
    공유 지시문은 본문 블록 안에 흡수하거나 생략하면 안 됨. 다음 두 가지 모두 명시:
    * questionNumber: null (이 stem 자체는 번호 없음)
    * sharedPassageRange: "N~M" (예: "41~42", "2~4")
    그 다음 본문(PASSAGE_BODY) 과 각 번호 stem 들은 같은 sharedPassageRange 를
    동일하게 가진다. **공유 지시문 stem 누락은 흔한 오류 — 절대 빼먹지 말 것**.

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
- 오탈자도 이미지에 보이는 형태 그대로 기록한다.

${STRUCTURED_OCR_SCHEMA_HINT}`;

const PASSAGE_ONLY_STRUCTURED_ADDON = `
[PASSAGE_ONLY 추가 규칙 — 1차 호출의 책임]

이 페이지에서 1차 호출이 책임지는 일은 다음 두 가지뿐이다.

1) 이미지에 인쇄된 형태대로 텍스트 기록
   - 본문 블록(PASSAGE_BODY)·문제 번호·지시문·선지 모두 시험지 이미지에 보이는 모습대로 \`content\`에 담는다.
   - ① ~ ⑤ 마커, 빈칸 ___, (A)(B)(C) 라벨, [3점] 같은 배점 표기, 박스 sentence 등 문제 형태도 같이 기록한다.
   - "복원"은 시도하지 않는다. restoredText / restorationStatus / restorationChanges 등 복원 관련 필드는 사용하지 않는다.
   - 한 페이지에 여러 문제가 있으면 각각 분리해서 블록으로 출력하되, 본문 자체는 이미지의 형태를 유지한다.

2) 문제별 풀이 + 유형 분류
   - 각 QUESTION_STEM 블록에 \`questionAnalysis\` 필드를 채운다.
     * questionType: 아래 [유형 매핑 표] 의 한국어 stem 키워드를 보고 enum 값을 결정한다. 키워드가 명확하면 반드시 그 type을 사용 — UNKNOWN으로 도피하지 말 것. 진짜로 어느 패턴도 매칭 안 되는 드문 케이스만 "UNKNOWN".
     * typeLabel: 그 type에 대응되는 한국어 라벨 (아래 표 참고).
     * answer: 본문/선지로부터 추론한 정답 ("③", "(B)-(A)-(C)", "after the third sentence" 등). 자신 없으면 null.
     * answerConfidence: 0.0~1.0. 자신 없으면 null.
     * evidence: 풀이의 근거가 된 본문/선지 발췌 (string[]).
     * warnings: 풀이 시 주의사항 (string[]).
   - 페이지 전체에 걸친 출처 단서(인용 표시, 대표 문장)는 pageMeta.problemEvidence.sourceHints 에 담는다.

[유형 매핑 표 — 한국어 stem 키워드 → questionType]

같은 의미의 변형 (띄어쓰기·조사·문장부호 차이)도 모두 동일 type 으로 매핑하라. 두 패턴이 동시 매칭하면 더 구체적인 (= 본문 수정이 더 명확한) type 을 우선 선택.

A. 본문 수정 / 보강이 필요한 유형 ← 복원 단계에서 본문 자체를 손봐야
  * "빈칸에 들어갈 말로 가장 적절한" + 빈칸이 1개 단어 후보 → BLANK_WORD ("빈칸 단어")
  * "빈칸에 들어갈 말로 가장 적절한" + 빈칸이 1개 문장 후보 → BLANK_SENTENCE ("빈칸 문장")
  * "빈칸에 들어갈 말로 가장 적절한" + 빈칸이 2개~3개 ((A)(B) / (A)(B)(C)) → BLANK_WORD ("빈칸 단어·어구", 복수 빈칸)
  * "빈칸에 들어갈 말로 가장 적절한" + 단순 추론 (위 세 가지 어디에도 명확히 안 들어가는 일반 빈칸) → BLANK_INFERENCE ("빈칸 추론")
  * "빈칸에 들어갈 연결사" / "빈칸에 들어갈 연결어" → CONNECTOR ("연결사")
  * "주어진 글 다음에 이어질 글의 순서로 가장 적절한" → PARAGRAPH_ORDER ("단락 순서")
  * "다음 글의 (A), (B), (C)의 순서로 가장 적절한" / "글의 순서로 가장 적절한" → SENTENCE_ORDER ("글의 순서")
  * "흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳" → SENTENCE_INSERT ("문장 삽입")
  * "전체 흐름과 관계 없는 문장" / "전체 흐름과 무관한 문장" → IRRELEVANT ("무관한 문장")
  * "어법상 적절하지 않은" / "어법상 틀린" / "어법상 어색한" → GRAMMAR_ERROR ("어법")
  * "어법상 올바른 형태로 쓰시오" / "어법에 맞게 고치시오" (서답형) → GRAMMAR_CORRECTION ("어법 수정")
  * "문맥상 낱말의 쓰임이 적절하지 않은" / "문맥상 어색한 단어" → VOCAB_CHOICE ("어휘")
  * "보기의 (A)~(I) 중 밑줄 친 단어의 동의어가 문맥상 적절하지 않은 것" / "동의어/유의어가 적절하지 않은" → VOCAB_CHOICE ("어휘 — 동의어 적합성")
  * "요약문의 빈칸에 들어갈 말로 가장 적절한 것끼리 짝지어진 것" → SUMMARY_COMPLETE ("요약문 완성")
  * "한 문장으로 요약하고자 한다. 빈칸 (A), (B) ... 에 들어갈 말" (서답형) → SUMMARY_COMPLETE ("서답형 요약")
  * "박스 안에 주어진 단어를 모두 이용하여 의미와 어순에 맞게" / "단어들을 의미에 맞게 배열" → WORD_ORDER ("어순 배열")
  * "문장을 ~로 바꿔 쓰시오" / "문장을 ~ 형태로 변환하시오" → SENTENCE_TRANSFORM ("문장 변환")
  * "조건에 맞게 영작하시오" / "조건에 맞게 서술하시오" → CONDITIONAL_WRITING ("조건 작문")
  * "다음 글을 읽고, 밑의 질문에 대한 답으로 가장 적절한 '완전한 한 문장'을 본문에서 찾아 그대로 쓰시오" → TEXTBOOK_DETAIL ("본문 문장 찾기 — 서답형")
  * "다음 대화의 순서로 가장 적절한" → DIALOGUE_ORDER ("대화 순서")

B. 본문 수정 불필요 유형 ← 복원 단계에서 본문 그대로 emit + 마커만 strip
  * "글의 제목으로 가장 적절한" → TITLE ("제목")
  * "글의 주제로 가장 적절한" → TOPIC_MAIN_IDEA ("주제")
  * "글의 요지로 가장 적절한" → TOPIC_MAIN_IDEA ("요지")
  * "글의 목적으로 가장 적절한" → PURPOSE ("글의 목적")
  * "필자의 심경 / 분위기로 가장 적절한" / "I'의 심경 변화" → MOOD_TONE ("심경 / 분위기")
  * "글의 내용과 일치하지 않는" / "글의 내용과 일치하는" → CONTENT_MATCH ("내용 일치")
  * "도표의 내용과 일치하지 않는" / "표의 내용과 일치하지 않는" → CONTENT_MATCH ("도표 일치", 본문이 도표)
  * "안내문의 내용과 일치하지 않는" / "안내문에 관한 설명으로 일치하지 않는" → CONTENT_MATCH ("안내문 일치")
  * "밑줄 친 ~ 가 다음 글에서 의미하는 바로 가장 적절한" → CONTEXT_MEANING ("함축적 의미")
  * "밑줄 친 ~ 가 가리키는 대상이 / 지칭하는 것이 다른" → REFERENCE ("지칭 추론")
  * "다음 대화의 빈칸에 들어갈 응답으로 가장 적절한" → DIALOGUE_RESPONSE ("대화 응답")
  * 영어 단어의 의미를 한국어로 번역하는 문제 → KOREAN_TRANSLATION ("한국어 번역")
  * 영어 단어의 영영풀이 (definition) 선택 → ENGLISH_DEFINITION ("영영풀이")

C. 매핑 안 되는 경우만 → UNKNOWN
  * 위 어느 패턴에도 매칭 안 됨 — 새로운 형태이거나 stem 이 너무 짧아서 판별 불가
  * UNKNOWN 으로 분류했어도 evidence 와 answer 는 가능한 한 채워야 한다

[정밀도 규칙]
  * 비슷한 두 type 중 헷갈리면 본문 수정이 더 명확한 쪽 선택 (A 그룹 우선)
  * "빈칸" + "연결사" 동시 매칭 → CONNECTOR 우선
  * "빈칸" + "요약문" 동시 매칭 → SUMMARY_COMPLETE 우선
  * UNKNOWN 으로 도피하지 말 것. 위 매핑 표의 키워드가 stem 에 부분이라도 나타나면 그 type 으로 결정.
    UNKNOWN 은 "[N~M] 다음 글을 읽고 물음에 답하시오" 같은 ANCHOR-only stem 처럼 본문 수정 지시 자체가 없는 케이스에만 사용한다.

[공유 지문 stem 처리 (CRITICAL — 그루핑에 영향)]
  하나의 공유 지문에 N번 ~ M번 문제가 묶이는 시험지 패턴 ("[N~M] 다음 글을 읽고 물음에 답하시오" + 그 아래 "N. [...점]", "N+1. [...점]" 같은 개별 stem) 처리는 다음과 같이 통일한다.

  1) ANCHOR stem (공유 지시문) 출력:
     - 별도 QUESTION_STEM 블록으로 출력하되 questionNumber 는 비운다 (number=null).
     - sharedPassageRange="N~M" 으로 명시.
     - questionAnalysis 는 비운다 (questionType=null, answer=null). 이 stem 자체는 지시문일 뿐 풀이 대상이 아님.

  2) 개별 numbered stem 출력:
     - 각 번호 (N, N+1, ..., M) 마다 별도 QUESTION_STEM 블록으로 출력.
     - questionNumber=정수.
     - sharedPassageRange="N~M" 동일하게 명시.
     - questionAnalysis 는 그 번호 stem 의 한국어 키워드를 매핑 표에 따라 채운다 (TITLE / VOCAB_CHOICE / BLANK_* / IRRELEVANT / SENTENCE_INSERT 등). UNKNOWN 금지.

  3) 한 번호가 두 ANCHOR 그룹에 동시 등장 금지:
     - 시험지 page-break 등으로 N번이 "[8~9]" ANCHOR 와 "[9~10]" ANCHOR 둘 다 가깝게 보여도, N번 stem 블록은 한 번만 출력한다 (가장 가까운 ANCHOR 한 곳에 sharedPassageRange 매핑).
     - 두 ANCHOR 가 실제 시험지에 둘 다 인쇄되어 있어도 stem 본문 (예: "9. [3.1점] ...") 자체는 시험지에서 한 번만 등장하므로 한 블록만 출력하면 된다.

  4) ANCHOR 없이 sub-passage 라벨 ([I], [II], (A), (B) 등) 로 묶이는 케이스:
     - 한 numbered stem 안의 sub-passage 표지는 PASSAGE_BODY 블록의 일부로 처리. 별도 stem 블록 만들지 말 것.

  이 규칙을 위반하면 후속 그루핑이 한 문제를 두 draft 로 분리하거나 그 반대로 합치는 오류가 발생한다.

[블록 분리 원칙]
- 한 문항 = QUESTION_STEM + (필요하면 박스 sentence 같은 보조 블록) + (있으면) PASSAGE_BODY + CHOICE×N.
- 각 선지 ① ~ ⑤는 반드시 5개 독립 CHOICE 블록.
- 본문이 페이지 경계에서 잘리면 continuesFromPrevious / continuesToNext 표시.
- 한 페이지에 본문 없는 문제(어법 5문장 비교 등)가 있으면 PASSAGE_BODY 없이 QUESTION_STEM + CHOICE만 출력.
- 박스로 둘러싼 sentence(삽입형 정답 후보)는 DIAGRAM이 아니라 별도의 PASSAGE_BODY 블록(혹은 그 문제의 일부 컨텍스트)으로 출력하라. 박스 외형은 시각 요소가 아니라 문제 본문의 일부다.
- 동일 페이지 안에 여러 문제·여러 본문이 있으면 reading order(좌→우, 상→하) 그대로 블록을 나열한다.

[제외할 것]
- 시험지 헤더(시험명·학교·학년·출판사) → EXAM_META 블록.
- 페이지 번호·저작권·"다음 장으로" → HEADER / FOOTER.
- 필기·낙서·형광펜 → NOISE 또는 제외.
`;

export function buildStructuredOcrSystemPrompt(mode: ExtractionMode): string {
  if (mode !== "PASSAGE_ONLY") return STRUCTURED_OCR_SYSTEM_PROMPT;
  return `${STRUCTURED_OCR_SYSTEM_PROMPT}\n\n${PASSAGE_ONLY_STRUCTURED_ADDON}`;
}

// ─── Text-input variant — Document AI가 추출한 텍스트를 받아 분류만 수행 ──
//
// Gemini vision OCR이 평가원 PDF의 특정 페이지에서 RECITATION으로 거절되는
// 문제를 회피하기 위해, 1차 OCR은 Document AI(Google Cloud)로 옮기고
// Gemini는 "이미 추출된 텍스트"를 받아 블록 분류 + 문제 풀이만 담당한다.
//
// 시스템 프롬프트는 이미지 기반 버전을 거의 그대로 재사용하되,
//   - "이미지" / "이미지에 인쇄된" → "입력 텍스트"
//   - "추가 OCR 시도" 같은 표현 제거
// 만 살짝 보정한다. 출력 스키마(structuredOcrResponseSchema)는 동일.
//
// **Note**: 텍스트 입력에서는 isAnswer 표시(★/●/■)를 시각적으로 알 수 없으므로
// Document AI가 그런 마커를 텍스트로 보존했을 때만 true로 표기하도록 한다.

const TEXT_INPUT_DISCLAIMER = `
[중요 — 입력 형식]
이번 호출에서는 시험지 이미지를 받지 않는다. 대신 Google Cloud Document AI가 OCR로 추출한 **텍스트**가 제공된다. 너의 일은:
  1) 받은 텍스트를 의미 단위 블록(EXAM_META / HEADER / FOOTER / PASSAGE_BODY / QUESTION_STEM / CHOICE / EXPLANATION / DIAGRAM / NOISE)으로 분류.
  2) QUESTION_STEM에 대해서는 questionAnalysis (유형 + 풀이 + 정답)를 채움.
  3) JSON 1개 반환.

추출된 텍스트에 OCR 오류(잘린 문자, 잘못 인식된 글자, 띄어쓰기 깨짐)가 있어도 임의 수정하지 말 것. content에는 받은 그대로 담는다. 복원은 후속 단계에서 처리한다.
이미지가 없으므로 ★/●/■ 같은 정답 마커는 텍스트로 보존된 경우(예: "③★")에만 isAnswer=true로 표기한다.
`;

export function buildStructuredOcrSystemPromptForText(
  mode: ExtractionMode,
): string {
  const base =
    mode === "PASSAGE_ONLY"
      ? `${STRUCTURED_OCR_SYSTEM_PROMPT}\n\n${PASSAGE_ONLY_STRUCTURED_ADDON}`
      : STRUCTURED_OCR_SYSTEM_PROMPT;
  return `${base}\n\n${TEXT_INPUT_DISCLAIMER}`;
}

export function buildStructuredOcrUserPromptForText(
  mode: ExtractionMode,
  pageIndex: number,
  totalPages: number,
  extractedText: string,
): string {
  const cfg = getModeConfig(mode);
  const positionHint =
    pageIndex === 0
      ? "이 페이지는 업로드 묶음의 첫 장입니다. 시험지 헤더(시행년도·회차·과목·학년)가 있다면 EXAM_META로 분리해 주세요."
      : pageIndex === totalPages - 1
        ? "이 페이지는 업로드 묶음의 마지막 장입니다. 저작권 고지·쪽수 표기 같은 머리말·꼬리말은 본문과 분리해 주세요."
        : "";
  // CRITICAL: upload-bundle index is NOT the booklet's own page number.
  // We deliberately do NOT tell the model "this is page N of M" because it
  // confuses the booklet's footer pageTotal (e.g. "3 / 8") with the upload
  // batch size, leading to inconsistent pageMeta.pageTotal across pages of
  // the same booklet. The model should extract booklet page number / total
  // ONLY from text it actually sees on the page (footer / header markup).
  return [
    `모드: ${cfg.shortLabel} — ${cfg.label}.`,
    positionHint,
    "pageMeta.pageNumber / pageMeta.pageTotal 는 페이지에 실제로 표기된 쪽수 표시(\"N / M\", \"(N)\", \"- N -\", \"N쪽\" 등)에서만 추출하세요. 업로드 묶음 인덱스(전체 묶음에서 몇 번째 페이지인지)를 그대로 옮기지 마세요.",
    "",
    "[Document AI가 추출한 페이지 텍스트] (= 본문 텍스트의 source of truth)",
    "```",
    extractedText,
    "```",
    "",
    "[참고용 페이지 이미지 사용 규칙 — CRITICAL]",
    "이 요청에는 페이지 이미지가 함께 첨부됩니다. 이미지는 오직 다음 두 가지 용도로만 사용하세요:",
    "  1) 위 텍스트에서 누락된 본문 안 마커(①②③④⑤, (a)~(f), (A)~(C), [A]~[C], ( ① )~( ⑤ ) 등)의 위치 확인",
    "  2) 시각 신호로만 식별 가능한 layout 단서(박스로 둘러친 sentence, 본문 내 강조선 위치 등) 보강",
    "이미지에서 본문 영어 문장을 새로 OCR하거나 다시 생성/재현하지 마세요.",
    "이미지에서 본 글자를 길게 받아쓰는 행동은 RECITATION 위험을 유발하므로 **절대 금지**.",
    "본문 텍스트는 위의 Document AI 결과를 그대로 옮기고, 누락된 마커만 본문 안의 정확한 단어 앞에 삽입하세요.",
    "  - 예: Document AI text 가 \"...random variation is combined with nonrandom selection...\" 이고",
    "    이미지 본문에 \"①combined\" 가 보이면 → blockType=PASSAGE_BODY 의 content 를",
    "    \"...random variation is ①combined with nonrandom selection...\" 로 (Document AI text 그대로 + 마커만 부착).",
    "  - 단어 자체 / 어순 / 띄어쓰기 / 마침표는 Document AI text 가 우선. 마커만 추가 보강.",
    "",
    "위 텍스트를 분류 규칙대로 블록으로 분해하고 (이미지에서 본 마커는 본문 안에 부착하여) JSON 1개로 반환해 주세요.",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

/** Tolerant string-array preprocessor.
 *
 *  Gemini occasionally returns a SINGLE STRING for fields the prompt asks
 *  for as an ARRAY (e.g. `"warnings": "주의: ..."` instead of
 *  `"warnings": ["주의: ..."]`). Strict `z.array(z.string())` rejects that
 *  and tanks the entire page parse. We normalise:
 *    - string  → [string]
 *    - null/undefined → []
 *    - array of mixed → array of strings (drop non-strings)
 *    - any other value → []
 */
function coerceStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value.length > 0 ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}
const flexibleStringArray = z.preprocess(
  coerceStringArray,
  z.array(z.string()).default([]),
);

/** Per-question analysis attached to a QUESTION_STEM block. The 1st-pass OCR
 *  call now performs question-type classification + answer inference at the
 *  same time as text extraction, so the 2nd-pass restoration call can skip
 *  the separate problem-evidence Gemini round-trip. */
const questionAnalysisSchema = z.object({
  questionType: z.string().nullable().optional(),
  typeLabel: z.string().nullable().optional(),
  answer: z.string().nullable().optional(),
  answerConfidence: z.number().min(0).max(1).nullable().optional(),
  evidence: flexibleStringArray.nullable().optional(),
  warnings: flexibleStringArray.nullable().optional(),
});

/** Page-level problem-evidence summary — hints that don't belong to a single
 *  question (source attribution clues, page-wide warnings). */
const pageProblemEvidenceSchema = z.object({
  sourceHints: flexibleStringArray.nullable().optional(),
  unresolved: flexibleStringArray.nullable().optional(),
  warnings: flexibleStringArray.nullable().optional(),
});

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
        /** 1st-pass question analysis. Only meaningful on QUESTION_STEM blocks
         *  — for other block types the model is asked to omit / set to null. */
        questionAnalysis: questionAnalysisSchema.nullable().optional(),
        /** Page-boundary boundary metadata for PASSAGE_BODY only. The legacy
         *  single-pass restoration fields (restoredText / restorationStatus /
         *  restorationChanges / restorationWarnings) have been retired —
         *  restoration is now done in the 2nd-pass grounded restoration call.
         *  These fields stay here as `nullable().optional()` so old responses
         *  still parse without the parser rejecting them. */
        restoredText: z.string().nullable().optional(),
        restorationStatus: z
          .enum(["RESTORED", "NO_RESTORATION_NEEDED", "PARTIAL", "FAILED"])
          .nullable()
          .optional(),
        restorationChanges: z
          .array(
            z.object({
              sentenceOrder: z.number().int().min(1).nullable().optional(),
              before: z.string().default(""),
              after: z.string().default(""),
              changeType: z.string().nullable().optional(),
              reason: z.string().nullable().optional(),
              confidence: z.number().min(0).max(1).nullable().optional(),
            }),
          )
          .nullable()
          .optional(),
        restorationWarnings: flexibleStringArray.nullable().optional(),
        continuesFromPrevious: z.boolean().nullable().optional(),
        continuesToNext: z.boolean().nullable().optional(),
        boundaryConfidence: z.number().min(0).max(1).nullable().optional(),
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
      /** Page number visible on this sheet (1-based). e.g. "1 / 8" → 1.
       *  Null when no page-number markup is present. Used by finalize to
       *  reorder pages when the upload order is wrong. */
      pageNumber: z.number().int().nullable().optional(),
      /** Total page count visible on this sheet. e.g. "1 / 8" → 8.
       *  Same fingerprint within a single test booklet, so it also acts
       *  as a clustering signal across mixed-upload jobs. */
      pageTotal: z.number().int().nullable().optional(),
      /** Free-text exam code printed on the page (e.g. "과목코드 03").
       *  Strongest single fingerprint for "same test booklet" clustering. */
      examCode: z.string().nullable().optional(),
      problemEvidence: pageProblemEvidenceSchema.nullable().optional(),
    })
    .optional(),
});

export type StructuredOcrResponse = z.infer<typeof structuredOcrResponseSchema>;
export type StructuredOcrQuestionAnalysis = z.infer<typeof questionAnalysisSchema>;
export type StructuredOcrPageProblemEvidence = z.infer<
  typeof pageProblemEvidenceSchema
>;
