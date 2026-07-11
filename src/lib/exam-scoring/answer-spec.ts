// ============================================================================
// 통합 시험 채점 — 문항 → AnswerSpec 추출(순수)
//
// 전 영어 26유형의 정답 데이터(정찰 확정 유형표, 설계문서 §3.2)를 유형별로
// 해석해 채점 명세를 만든다. 계약:
//  - 문항 단위 격리: 어떤 입력에도 절대 throw 하지 않는다. 해석 불가 문항은
//    MANUAL_ONLY 로 강등(채점 대신 강사 검토) — 시험 전체 채점을 죽이지 않는다.
//  - 진실원본 이원화 흡수: correctAnswers[](복수정답)·blanks[]·correctedParts[] 는
//    structuredData 에만 있고, correctAnswer 컬럼은 표기 유형별 3중 불일치(숫자/
//    원형숫자/문자) → normalizeChoiceTokenExtended 축으로 통일.
//  - 선지 개수 가변: options.length 가 정본(5 고정 가정 금지).
// ============================================================================

import { normalizeSentenceInsertAnswer } from "@/lib/sentence-insert-options";
import type {
  AnswerFieldSpec,
  AnswerSpec,
  ScorableQuestion,
  TextGradeMode,
} from "./types";
import { normalizeChoiceList, normalizeChoiceTokenExtended } from "./normalize";

// ── 방어적 파서 ──────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return asArray(value)
    .map((v) => asString(v).trim())
    .filter((v) => v.length > 0);
}

interface ParsedOption {
  label: string;
  text: string;
}

function parseOptions(value: unknown): ParsedOption[] {
  return asArray(value)
    .map((raw) => {
      const rec = asRecord(raw);
      if (!rec) return null;
      const label = asString(rec.label).trim();
      const text = asString(rec.text);
      if (!label) return null;
      return { label, text };
    })
    .filter((o): o is ParsedOption => o != null);
}

// ── 명세 빌더 조각 ────────────────────────────────────────────────────────────

function manualSpec(q: ScorableQuestion, reason: string): AnswerSpec {
  return {
    questionId: q.id,
    subType: q.subType ?? "",
    inputKind: "MANUAL_ONLY",
    points: q.points,
    manualReason: reason,
  };
}

/** 객관식 공통 — correctAnswers[](복수) 우선, 없으면 correctAnswer 단일 */
function choiceSpec(
  q: ScorableQuestion,
  data: Record<string, unknown> | null,
  options: ParsedOption[],
  opts?: { normalizeAnswer?: (value: unknown) => string | undefined },
): AnswerSpec {
  const normalizeOne = opts?.normalizeAnswer ?? normalizeChoiceTokenExtended;

  const multiRaw = data?.correctAnswers;
  const multi = normalizeChoiceList(multiRaw);
  const single = normalizeOne(
    (data?.correctAnswer as unknown) ?? q.correctAnswer ?? undefined,
  );

  // 복수정답: structuredData.correctAnswers 가 2개 이상일 때만 MULTI 로 승격.
  // (1개짜리 correctAnswers 는 단일 취급 — CONTENT_MATCH answerN=1 optional 케이스)
  const correctChoices = multi.length >= 2 ? multi : single ? [single] : [];
  if (correctChoices.length === 0) {
    return manualSpec(q, "정답 데이터 없음 — 강사 확인 필요");
  }

  const optionCount = options.length >= 2 ? options.length : 5;
  const optionLabels =
    options.length >= 2 ? options.map((o) => o.label) : undefined;

  // 정답 토큰이 선지 범위를 벗어나면 데이터 오염 — 오채점 대신 수동 검토로 강등.
  if (correctChoices.some((c) => Number(c) > optionCount)) {
    return manualSpec(q, "정답 토큰이 선지 범위를 벗어남 — 강사 확인 필요");
  }

  if (correctChoices.length >= 2) {
    return {
      questionId: q.id,
      subType: q.subType ?? "",
      inputKind: "MULTI_CHOICE",
      optionCount,
      optionLabels,
      correctChoices,
      selectCount: correctChoices.length,
      partialCredit: false, // 학교 시험 관행: 복수정답은 전부 골라야 정답
      points: q.points,
    };
  }

  return {
    questionId: q.id,
    subType: q.subType ?? "",
    inputKind: "SINGLE_CHOICE",
    optionCount,
    optionLabels,
    correctChoices,
    points: q.points,
  };
}

/** 서답형 공통 — 필드 정의로 TEXT_SINGLE/TEXT_MULTI 명세 생성 */
function textSpec(
  q: ScorableQuestion,
  fields: AnswerFieldSpec[],
  textMode: TextGradeMode,
): AnswerSpec {
  const valid = fields.filter((f) => f.answers.length > 0);
  if (valid.length === 0) {
    return manualSpec(q, "서답형 정답 데이터 없음 — 강사 확인 필요");
  }
  return {
    questionId: q.id,
    subType: q.subType ?? "",
    inputKind: valid.length === 1 ? "TEXT_SINGLE" : "TEXT_MULTI",
    textMode,
    fields: valid,
    partialCredit: valid.length > 1,
    points: q.points,
  };
}

/** blanks[]({label, answer, acceptableVariants?, requiredLemmas?}) → 필드 배열 */
function fieldsFromBlanks(data: Record<string, unknown> | null): AnswerFieldSpec[] {
  return asArray(data?.blanks)
    .map((raw, index) => {
      const rec = asRecord(raw);
      if (!rec) return null;
      const answer = asString(rec.answer).trim();
      if (!answer) return null;
      const label = asString(rec.label).trim() || `(${index + 1})`;
      const variants = stringArray(rec.acceptableVariants);
      const lemmas = stringArray(rec.requiredLemmas).map((l) => l.toLowerCase());
      return {
        key: label,
        label,
        answers: [answer, ...variants],
        ...(lemmas.length > 0 ? { lemmas } : {}),
      } satisfies AnswerFieldSpec;
    })
    .filter((f): f is AnswerFieldSpec => f != null);
}

// ── 유형별 추출 ──────────────────────────────────────────────────────────────

/** 단순 5지 단일선택 유형(정찰 유형표 §객관식) */
const SIMPLE_SINGLE_CHOICE = new Set([
  "BLANK_INFERENCE",
  "GRAMMAR_CHOICE_COMBO",
  "SENTENCE_ORDER",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "REFERENCE",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);

/** correctAnswers[] 복수정답 가능 유형 */
const MULTI_CAPABLE_CHOICE = new Set([
  "GRAMMAR_ERROR",
  "VOCAB_CHOICE",
  "IMPLIED_MEANING",
  "CONTENT_MATCH",
]);

/** 진짜 자유영작 — 규칙채점 불가, 항상 강사/AI 검토 */
const FREE_WRITING = new Set(["CONDITIONAL_WRITING", "SENTENCE_TRANSFORM"]);

/**
 * 문항 → 채점 명세. 절대 throw 하지 않는다.
 * 미지의 subType(커스텀 유형·KO 등)은 폴백: options 가 있으면 correctAnswer 단일
 * 선택 채점 시도, 없으면 MANUAL_ONLY.
 */
export function buildAnswerSpec(q: ScorableQuestion): AnswerSpec {
  try {
    const data = asRecord(q.structuredData);
    const options = parseOptions(q.options ?? data?.options);
    const subType = q.subType ?? "";

    if (FREE_WRITING.has(subType)) {
      return manualSpec(q, "자유영작 — 기계 채점 불가");
    }

    if (SIMPLE_SINGLE_CHOICE.has(subType) || MULTI_CAPABLE_CHOICE.has(subType)) {
      return choiceSpec(q, data, options);
    }

    if (subType === "SENTENCE_INSERT") {
      // 마커 수 5~8 가변 — 전용 정규화(문자/원형/숫자 마커 전부 흡수)
      return choiceSpec(q, data, options, {
        normalizeAnswer: (value) => {
          if (value == null) return undefined;
          const normalized = normalizeSentenceInsertAnswer(value);
          return /^([1-9]|1[0-5])$/.test(normalized)
            ? normalized
            : normalizeChoiceTokenExtended(value);
        },
      });
    }

    if (subType === "FILL_BLANK_KEY") {
      const answer = asString(data?.answer).trim() || (q.correctAnswer ?? "").trim();
      return textSpec(
        q,
        answer ? [{ key: "answer", label: "답", answers: [answer] }] : [],
        "EXACT",
      );
    }

    if (subType === "SUMMARY_COMPLETE") {
      return textSpec(q, fieldsFromBlanks(data), "EXACT");
    }

    if (subType === "SUMMARY_WRITING") {
      const scoringMode = asString(data?.scoringMode);
      if (scoringMode === "LLM_RUBRIC") {
        return manualSpec(q, "LLM_RUBRIC 채점 모드 — 강사/AI 검토 필요");
      }
      const fields = fieldsFromBlanks(data);
      return textSpec(q, fields, scoringMode === "LEMMA" ? "LEMMA" : "VARIANTS");
    }

    if (subType === "TOPIC_SENTENCE_WRITING") {
      // cloze 모드: blanks[] / scrambled 모드: modelAnswer 단일
      const blanks = fieldsFromBlanks(data);
      if (blanks.length > 0) return textSpec(q, blanks, "VARIANTS");
      const model = asString(data?.modelAnswer).trim();
      const variants = stringArray(data?.acceptableVariants);
      return textSpec(
        q,
        model
          ? [{ key: "answer", label: "답", answers: [model, ...variants] }]
          : [],
        "VARIANTS",
      );
    }

    if (subType === "WORD_ORDER") {
      const model =
        asString(data?.modelAnswer).trim() || (q.correctAnswer ?? "").trim();
      return textSpec(
        q,
        model ? [{ key: "answer", label: "답", answers: [model] }] : [],
        "EXACT",
      );
    }

    if (subType === "GRAMMAR_CORRECTION") {
      const segments = asArray(data?.underlinedSegments);
      const fallbackParts = stringArray(data?.correctedParts);
      const firstFallback = asString(data?.correctedPart).trim();
      const fields: AnswerFieldSpec[] = [];
      segments.forEach((raw, index) => {
        const rec = asRecord(raw);
        if (!rec) return;
        // 오류 구간만 답 필드 — isError=false 구간은 학생이 고칠 대상이 아님
        if (rec.isError === false) return;
        const answer =
          asString(rec.correctedPart).trim() ||
          fallbackParts[index] ||
          (index === 0 ? firstFallback : "");
        if (!answer) return;
        const label = asString(rec.label).trim() || `밑줄 ${index + 1}`;
        fields.push({ key: `seg-${index + 1}`, label, answers: [answer] });
      });
      if (fields.length === 0 && fallbackParts.length > 0) {
        fallbackParts.forEach((part, index) => {
          fields.push({
            key: `seg-${index + 1}`,
            label: `밑줄 ${index + 1}`,
            answers: [part],
          });
        });
      }
      return textSpec(q, fields, "EXACT");
    }

    // ── 폴백: 미지의 subType(커스텀 유형·KO 유형 등) ──
    if (options.length >= 2) {
      return choiceSpec(q, data, options);
    }
    return manualSpec(q, "지원되지 않는 유형 — 강사 확인 필요");
  } catch {
    return manualSpec(q, "정답 데이터 해석 실패 — 강사 확인 필요");
  }
}
