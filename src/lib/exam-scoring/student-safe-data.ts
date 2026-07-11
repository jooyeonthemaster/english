// ============================================================================
// 통합 시험 채점 — 학생 안전 페이로드: 유형별 조립기(내부 모듈, 순수)
//
// student-safe.ts(공개 API·타입 계약)의 내부 구현부. 여기의 모든 함수는
// **화이트리스트 명시 복사**만 수행한다 — 스프레드/omit 금지, 정답성 필드
// (student-safe.ts 헤더의 금지 목록) 절대 미복사. 500줄 규율로 분리했을 뿐
// 소유·계약은 student-safe.ts 와 한 몸이다(임포트도 student-safe 경유만).
// ============================================================================

import { grammarCorrectionLabel } from "@/lib/grammar-correction-display";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
  readSummaryPairOption,
} from "@/lib/summary-complete-mc";
import { summaryWritingMaskedSummary } from "@/lib/summary-writing";
import { shouldRenderOptionListForSubtype } from "@/components/exams/paper-builder/option-display";
import type {
  StudentRenderableQuestion,
  StudentSafeBlankSlot,
  StudentSafeData,
  StudentSafeOption,
  StudentSafeParagraph,
  StudentSafeUnderlinedSegment,
} from "./student-safe";

// ── 방어적 파서(answer-spec.ts 관례 미러 — 해당 파일 소유권 밖이라 로컬 복제) ──

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 문자열이면 양끝 트림(내부 개행·문단 구조는 보존 — 지문 렌더 충실도) */
export function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 라벨·한 줄 표시용 — 다중 공백 축약 + 트림 */
function cleanOneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stringArray(value: unknown): string[] {
  return asArray(value)
    .map((v) => cleanOneLine(v))
    .filter((v) => v.length > 0);
}

// ── 조립 조각 ────────────────────────────────────────────────────────────────

/**
 * 미끼 칩 안전 병합 — 칩 목록(wordBank/scrambledWords)은 생성 계약상 이미 미끼를
 * 포함한 셔플본이다. 계약 위반 데이터(미끼가 칩에 없음)를 방어하되, 뒤에 덧붙이면
 * "끝에 있는 게 미끼"라는 위치 신호가 생기므로 병합이 실제로 일어난 경우에만
 * 전체를 결정론 사전순으로 재정렬한다(원저 셔플 순서는 병합 불필요 시 보존).
 * 중복 칩은 의도적 데이터("같은 문자열 2개")라 절대 dedupe 하지 않는다.
 */
function mergeChipsWithDistractors(chips: string[], distractors: string[]): string[] {
  if (chips.length === 0) {
    // 칩 자체가 없으면 미끼만 내보낼 이유가 없다(문항 성립 불가 — 빈 배열 유지)
    return chips;
  }
  const present = new Set(chips);
  const missing = distractors.filter((d) => !present.has(d));
  if (missing.length === 0) return chips;
  return [...chips, ...missing].sort((a, b) => a.localeCompare(b, "en"));
}

/** 작문 계열 blanks[] → 학생 노출 단서만 남긴 슬롯(answer 계열 필드 원천 미복사) */
function safeBlankSlots(data: Record<string, unknown>): StudentSafeBlankSlot[] {
  return asArray(data.blanks)
    .map((raw, index) => {
      const rec = asRecord(raw);
      if (!rec) return null;
      const label =
        cleanOneLine(rec.label) || `(${String.fromCharCode(65 + index)})`;
      const slot: StudentSafeBlankSlot = { label };
      const hint = cleanOneLine(rec.firstLetterHint);
      if (hint) slot.firstLetterHint = hint;
      if (typeof rec.targetWordCount === "number" && Number.isFinite(rec.targetWordCount)) {
        slot.targetWordCount = rec.targetWordCount;
      }
      const frame = asTrimmed(rec.connectorFrameAfter);
      if (frame) slot.connectorFrameAfter = frame;
      return slot;
    })
    .filter((s): s is StudentSafeBlankSlot => s != null);
}

/**
 * GRAMMAR_CORRECTION 밑줄 구간 → {label, displayedText} 표시형만.
 * displayedText 부재 시 sourceText(올바른 원문)를 그대로 내보내면 정답이 노출되므로,
 * correctedPart→errorPart 치환이 성공한 경우에만 표시형으로 파생한다. 파생 불가면
 * 해당 구간을 생략한다(누출보다 결손이 낫다 — questionText 의 마킹 지문이 본선).
 */
function safeGrammarCorrectionSegments(
  data: Record<string, unknown>,
): StudentSafeUnderlinedSegment[] {
  const out: StudentSafeUnderlinedSegment[] = [];
  asArray(data.underlinedSegments).forEach((raw, index) => {
    const rec = asRecord(raw);
    if (!rec) return;
    // 현행 스키마는 전 구간 isError=true 강제지만, 레거시 비오류 구간은 답 대상이 아님
    if (rec.isError === false) return;

    let displayed = cleanOneLine(rec.displayedText);
    if (!displayed) {
      const source = cleanOneLine(rec.sourceText);
      const corrected = cleanOneLine(rec.correctedPart);
      const errorPart = cleanOneLine(rec.errorPart);
      if (source && corrected && errorPart && source.includes(corrected)) {
        displayed = source.replace(corrected, errorPart);
      }
    }
    if (!displayed) return;

    const rawLabel = cleanOneLine(rec.label);
    const label = /^\([A-Ja-j]\)$/.test(rawLabel)
      ? rawLabel.toUpperCase()
      : grammarCorrectionLabel(index);
    out.push({ label, displayedText: displayed });
  });
  return out;
}

/** SYNONYM — 저장 지문이 없으면 렌더러와 동일하게 contextSentence 에 밑줄 파생 */
function synonymPassageWithUnderline(data: Record<string, unknown>): string {
  const explicit = asTrimmed(data.passageWithUnderline);
  if (explicit) return explicit;
  const sentence = asTrimmed(data.contextSentence);
  const target = cleanOneLine(data.targetWord);
  if (!sentence || !target) return sentence;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sentence.replace(new RegExp(`\\b${escaped}\\b`, "i"), (m) => `__${m}__`);
}

/** blankValues 키("blankA") → 표시 라벨("(A)") */
function blankKeyToLabel(key: string): string {
  const match = key.match(/^blank([A-Z])$/i);
  return match ? `(${match[1].toUpperCase()})` : `(${key})`;
}

/**
 * 선지 화이트리스트 조립 — label/text 만, SUMMARY_COMPLETE_MC 는 blankValues 추가.
 * 마커 전용 4유형(어법·무관문장·문장삽입·어휘선택)은 시험지와 동일하게 선지 리스트를
 * 내보내지 않는다(선지 데이터에 정답형 표현이 섞일 수 있는 표면 자체를 제거).
 * slotValues(네모어법 정답 조합) 등 그 외 키는 어떤 유형에서도 복사하지 않는다.
 */
export function buildSafeOptions(
  subType: string,
  rawOptions: unknown,
): StudentSafeOption[] {
  if (!shouldRenderOptionListForSubtype(subType)) return [];
  const out: StudentSafeOption[] = [];
  for (const raw of asArray(rawOptions)) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const label = cleanOneLine(rec.label);
    if (!label) continue;
    const option: StudentSafeOption = {
      label,
      text: typeof rec.text === "string" ? rec.text : "",
    };
    if (subType === "SUMMARY_COMPLETE_MC") {
      const pair = readSummaryPairOption(rec);
      const values = Object.entries(pair.values ?? {})
        .filter((entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1].trim().length > 0,
        )
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, value]) => ({ label: blankKeyToLabel(key), value: value.trim() }));
      if (values.length > 0) option.blankValues = values;
    }
    out.push(option);
  }
  return out;
}

// ── 유형별 safeData ──────────────────────────────────────────────────────────

/** s[key] = 트림 문자열(비면 미기록) — 화이트리스트 명시 복사 전용 헬퍼 */
function setStr(
  s: StudentSafeData,
  key: keyof Pick<
    StudentSafeData,
    | "passageWithBlank"
    | "passageWithMarkers"
    | "passageWithUnderline"
    | "passageWithNumbers"
    | "underlinedExpression"
    | "underlinedPronoun"
    | "underlinedWord"
    | "targetWord"
    | "contextSentence"
    | "givenSentence"
    | "matchType"
    | "koreanGloss"
    | "contextHint"
    | "referenceSentence"
    | "originalSentence"
    | "mode"
    | "topicForm"
  >,
  value: unknown,
): void {
  const text = asTrimmed(value);
  if (text) s[key] = text;
}

export function buildSafeData(
  subType: string,
  data: Record<string, unknown> | null,
  q: StudentRenderableQuestion,
): StudentSafeData | undefined {
  if (!data) return undefined;
  const s: StudentSafeData = {};

  switch (subType) {
    case "BLANK_INFERENCE":
      setStr(s, "passageWithBlank", data.passageWithBlank);
      break;

    // 마커 지문 유형 — 지문 자체가 학생 표시형(오류/부적절 형이 이미 구워진 텍스트).
    // markedExpressions/markedWords(정오 플래그·교정형 보유)는 절대 미복사.
    case "GRAMMAR_ERROR":
    case "VOCAB_CHOICE":
    case "ANTONYM":
    case "GRAMMAR_CHOICE_COMBO":
      setStr(s, "passageWithMarkers", data.passageWithMarkers);
      break;

    case "SENTENCE_ORDER": {
      setStr(s, "givenSentence", data.givenSentence);
      const paragraphs = asArray(data.paragraphs)
        .map((raw) => {
          const rec = asRecord(raw);
          if (!rec) return null;
          const label = cleanOneLine(rec.label);
          const text = asTrimmed(rec.text);
          if (!label || !text) return null;
          return { label, text } satisfies StudentSafeParagraph;
        })
        .filter((p): p is StudentSafeParagraph => p != null);
      if (paragraphs.length > 0) s.paragraphs = paragraphs;
      break;
    }

    case "SENTENCE_INSERT":
      setStr(s, "givenSentence", data.givenSentence);
      setStr(s, "passageWithMarkers", data.passageWithMarkers);
      break;

    // 원문 참조 유형 — 지문은 top-level passageContent 로, 선지는 options 로 충분
    case "TOPIC":
    case "MAIN_IDEA":
    case "TOPIC_MAIN_IDEA":
    case "TITLE":
      break;

    case "IMPLIED_MEANING":
      setStr(s, "passageWithUnderline", data.passageWithUnderline);
      setStr(s, "underlinedExpression", data.underlinedExpression);
      break;

    case "REFERENCE":
      setStr(s, "passageWithUnderline", data.passageWithUnderline);
      setStr(s, "underlinedPronoun", data.underlinedPronoun);
      break;

    case "CONTENT_MATCH":
      setStr(s, "matchType", data.matchType);
      break;

    case "SUMMARY_COMPLETE_MC": {
      const summary = asTrimmed(data.summaryWithBlanks);
      if (summary) {
        // 방어심도: 모델이 요약문에 정답을 인라인으로 남겼어도 서버에서 제거 후
        // 빈칸선을 부착한 표시형만 내보낸다(마스킹에 쓰인 정답은 미포함).
        s.summaryWithBlanks = formatSummaryCompleteMcSummaryForDisplay(
          summary,
          readSummaryBlankAnswersFromQuestionLike(data, q.options, q.correctAnswer),
        );
      }
      break;
    }

    case "IRRELEVANT":
      setStr(s, "passageWithNumbers", data.passageWithNumbers);
      break;

    case "CONTEXT_MEANING":
      setStr(s, "passageWithUnderline", data.passageWithUnderline);
      setStr(s, "underlinedWord", data.underlinedWord);
      break;

    case "SYNONYM": {
      const passage = synonymPassageWithUnderline(data);
      if (passage) s.passageWithUnderline = passage;
      setStr(s, "targetWord", data.targetWord);
      setStr(s, "contextSentence", data.contextSentence);
      break;
    }

    case "CONDITIONAL_WRITING": {
      setStr(s, "referenceSentence", data.referenceSentence);
      const conditions = stringArray(data.conditions);
      if (conditions.length > 0) s.conditions = conditions;
      break;
    }

    case "SENTENCE_TRANSFORM": {
      setStr(s, "originalSentence", data.originalSentence);
      const conditions = stringArray(data.conditions);
      if (conditions.length > 0) s.conditions = conditions;
      break;
    }

    case "FILL_BLANK_KEY": {
      // 렌더러(FillBlankKeyRenderer)와 동일한 우선순위: 전체 지문판 → 문장판
      const passage =
        asTrimmed(data.passageWithBlank) || asTrimmed(data.sentenceWithBlank);
      if (passage) s.passageWithBlank = passage;
      break;
    }

    case "SUMMARY_COMPLETE": {
      const summary = asTrimmed(data.summaryWithBlanks);
      if (summary) {
        // blanks[].answer 로 마스킹(방어심도) + 빈칸선 부착 — 정답 자체는 미포함
        s.summaryWithBlanks = formatSummaryCompleteMcSummaryForDisplay(
          summary,
          readSummaryBlankAnswersFromQuestionLike(data),
        );
      }
      const slots = safeBlankSlots(data);
      if (slots.length > 0) s.blanks = slots;
      break;
    }

    case "SUMMARY_WRITING": {
      // 서버 마스킹 완료본(clueMode=firstLetter 면 "(A) p____ s____" 슬롯 포함).
      // blankGlosses 는 v1 학생 비노출(빈칸별 직역 + [보기] 결합 시 정답 노출 — 시각검수).
      const masked = summaryWritingMaskedSummary(data);
      if (masked) s.summaryWithBlanks = masked;
      setStr(s, "koreanGloss", data.koreanGloss);
      const chips = mergeChipsWithDistractors(
        stringArray(data.wordBank),
        stringArray(data.wordBankDistractors),
      );
      if (chips.length > 0) s.wordBank = chips;
      const slots = safeBlankSlots(data);
      if (slots.length > 0) s.blanks = slots;
      break;
    }

    case "WORD_ORDER": {
      const chips = mergeChipsWithDistractors(
        stringArray(data.scrambledWords),
        stringArray(data.wordBankDistractors),
      );
      if (chips.length > 0) s.scrambledWords = chips;
      setStr(s, "contextHint", data.contextHint);
      break;
    }

    case "TOPIC_SENTENCE_WRITING": {
      setStr(s, "mode", data.mode);
      setStr(s, "topicForm", data.topicForm);
      setStr(s, "koreanGloss", data.koreanGloss);
      // 모드 판별이 흔들리는 레거시 데이터 방어 — 존재하는 학생 노출물만 각각 조립
      // (마스킹 완료본·셔플 칩은 어느 모드에서도 안전).
      const masked = summaryWritingMaskedSummary(data);
      if (masked) s.summaryWithBlanks = masked;
      const bank = mergeChipsWithDistractors(
        stringArray(data.wordBank),
        stringArray(data.wordBankDistractors),
      );
      if (bank.length > 0) s.wordBank = bank;
      const scrambled = mergeChipsWithDistractors(
        stringArray(data.scrambledWords),
        stringArray(data.wordBankDistractors),
      );
      if (scrambled.length > 0) s.scrambledWords = scrambled;
      const slots = safeBlankSlots(data);
      if (slots.length > 0) s.blanks = slots;
      break;
    }

    case "GRAMMAR_CORRECTION": {
      const segments = safeGrammarCorrectionSegments(data);
      if (segments.length > 0) s.underlinedSegments = segments;
      break;
    }

    default:
      // 미지 유형(커스텀 등): questionText·선지 label/text 만 — structuredData 미복사
      break;
  }

  return s;
}
