// ============================================================================
// RenderModel — 시험지 렌더 표기 정규화 관문 (STEP 1, GRAMMAR_ERROR)
//
// 목표: 생성기가 굳혀 보낸 표기 문자열(questionText·passageWithMarkers·라벨)을
// 시험지가 되파싱하는 대신, structuredData(시맨틱)에서 표기를 렌더 시점에 일괄
// 부여한다. 표기 정책은 파라미터:
//   - "normalized": 일반 시험지 프리셋(라벨·마커·밑줄 통일).
//   - "faithful"  : 원문 미러(동형 등 — 저장된 형태 그대로 유지).
//
// 이 단계는 **additive** 다 — a4-paper-page / pagination 은 아직 안 건드린다.
// RenderModel 을 산출·검증만 하고, 배선은 다음 증분에서.
//
// GRAMMAR_ERROR 외 유형은 PASSTHROUGH 로 떨궈 현 동작(평탄 questionText 렌더)을
// 그대로 유지한다 — 배선 시 회귀 0 보장용.
// ============================================================================

import {
  findExpressionInPassage,
  findWordInPassage,
  sanitizeExpressionForMarker,
} from "@/lib/question-postprocess/text-utils";
import { getCircledNumber } from "@/lib/question-postprocess/types";
import type { BuilderQuestion, OptionItem, PaperItem } from "./types";
import { resolveMarkerScheme, type MarkerRenderScheme } from "./marker-render-scheme";

export type RenderStyle = "faithful" | "normalized";

export type RenderMarkKind = "underline" | "box" | "blank" | "position";

/** 세그먼트 텍스트 위 표시 영역. start/length 는 세그먼트의 clean 텍스트 기준. */
export type RenderMark = {
  start: number;
  /** clean 텍스트에서 이 마크가 덮는(치환하는) 원본 영역 길이. */
  length: number;
  /** 마크 영역에 실제로 보일 텍스트(어법 오류는 오류형이 원본 자리에 표시됨). */
  displayText: string;
  /** 0-based 출현 순서. 라벨 스킴(①/(A)/…)은 렌더가 ordinal 로 부여 — 모델은 표기 미보유. */
  ordinal: number;
  kind: RenderMarkKind;
  /** 어법: 이 마크가 정답(오류) 자리인지. */
  isError?: boolean;
  /** faithful 모드(원문 미러)에서 보존할 원본 라벨 문자열(예: "A"). normalized 는 무시. */
  sourceLabel?: string;
  /** source 재유도 경로에서 이 마크가 유래한 원본 markedExpressions/markedWords 인덱스.
   *  문제 관리 structured 정규화가 분석 배열을 출현순으로 재정렬할 때 역매핑에 쓴다. */
  origIndex?: number;
};

export type RenderSegmentRole = "passage" | "summary" | "given" | "para" | "text";

export type RenderSegment = {
  role: RenderSegmentRole;
  /** 표기 제거된 clean 텍스트. marks 가 이 문자열 오프셋을 참조한다. */
  text: string;
  marks: RenderMark[];
};

/** 재정렬된 보기(라벨형+리스트 유형: 반의어 등). 라벨은 렌더가 ordinal 로 부여. */
export type RenderOption = { ordinal: number; text: string };

export type RenderModelKind =
  | "MARKED_PASSAGE" // 지문 인라인 마커형(어법·어휘·무관문장 등). 별도 보기 리스트 없음.
  | "PASSTHROUGH"; // 아직 미이관 — fallbackQuestionText 로 현 동작 유지.

export type RenderModel = {
  kind: RenderModelKind;
  style: RenderStyle;
  subType: string | null;
  stem?: string;
  segments: RenderSegment[];
  /** 재정렬된 보기(라벨형+리스트 유형만). 있으면 호출자가 PaperItem.options 를 교체. */
  options?: RenderOption[];
  /** 정답 자리의 0-based ordinal(라벨 재부여와 무관하게 일관). 렌더가 ①/(A) 로 표시. */
  answerOrdinals: number[];
  /** 참고용 원본 정답 문자열(라벨 재부여 시 stale 가능 — 표시는 answerOrdinals 우선). */
  correctAnswer?: string;
  /** PASSTHROUGH: 현재처럼 렌더할 원본 평탄 텍스트(정규화 미적용). */
  fallbackQuestionText?: string;
  /** 진단/관문 폴백 사유. */
  notes: string[];
};

// ─────────────────────────── 공통 유틸 ───────────────────────────

function readStructuredData(sd: unknown): Record<string, unknown> | null {
  if (sd && typeof sd === "object" && !Array.isArray(sd)) {
    return sd as Record<string, unknown>;
  }
  if (typeof sd !== "string") return null;
  try {
    const parsed = JSON.parse(sd);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// ─────────────────────── GRAMMAR_ERROR 표기 부여 ───────────────────────

type GrammarMarkedExpression = {
  label?: unknown;
  expression?: unknown;
  isError?: unknown;
  correction?: unknown;
  errorExpression?: unknown;
  surroundingText?: unknown;
};

/** 지문에서 위치를 찾을 때 쓰는 원본 표현(정본 processor 의 getSourceExpression 미러). */
function sourceExpressionOf(me: GrammarMarkedExpression): string {
  return (
    normalizeSpaces(str(me.expression)) ||
    normalizeSpaces(str(me.correction)) ||
    normalizeSpaces(str(me.errorExpression))
  );
}

/** 마크 영역에 표시할 표면형(오류면 오류형, 아니면 원형). processor 미러. */
function surfaceExpressionOf(me: GrammarMarkedExpression): string {
  if (me.isError === true) {
    return normalizeSpaces(str(me.errorExpression)) || normalizeSpaces(str(me.expression));
  }
  return normalizeSpaces(str(me.expression));
}

function isSingleToken(expression: string): boolean {
  return /^[A-Za-z][A-Za-z'-]*$/.test(expression.trim());
}

/** "(A)"/"A"/"a"/"3" → 정규 키 "A". 정본 normalizeGrammarKey 축약판. */
function grammarKey(value: unknown): string {
  const text = normalizeSpaces(str(value));
  const alpha = text.match(/^[([]?\s*([A-Ja-j])\s*[)\].:]?$/);
  if (alpha) return alpha[1].toUpperCase();
  const numeric = text.match(/^[([]?\s*([1-9]|10)\s*[)\].:]?$/);
  if (numeric) return "ABCDEFGHIJ"[Number(numeric[1]) - 1] ?? "";
  return "";
}

/** 정본 processor 의 findGrammarExpression 미러(단일 토큰=word, 그 외=expression). */
function locateGrammarExpression(passage: string, me: GrammarMarkedExpression) {
  const source = sourceExpressionOf(me);
  if (!source) return null;
  const surrounding = normalizeSpaces(str(me.surroundingText)) || undefined;
  const find = (expr: string) =>
    isSingleToken(expr)
      ? findWordInPassage(passage, expr, surrounding)
      : findExpressionInPassage(passage, expr, surrounding);

  // expression → correction → errorExpression 순으로 시도(정본 폴백 체인 축약판).
  let found = find(source);
  const correction = normalizeSpaces(str(me.correction));
  if (!found && me.isError === true && correction && correction !== source) {
    found = find(correction);
  }
  const errorExpression = normalizeSpaces(str(me.errorExpression));
  if (!found && me.isError === true && errorExpression) {
    found = find(errorExpression);
  }
  return found;
}

/**
 * source 지문 + markedExpressions 로 마크 span 을 재유도한다(normalized 경로).
 * 정본 grammar-error processor 와 동일하게 **지문 출현 순서**로 ordinal 을 부여한다.
 * 전부 못 찾으면 null(상위가 baked 폴백).
 */
function deriveGrammarMarksFromSource(
  passage: string,
  marked: GrammarMarkedExpression[],
): RenderMark[] | null {
  const located = marked
    .map((me, origIndex) => ({ me, origIndex, found: locateGrammarExpression(passage, me) }))
    .filter((x): x is { me: GrammarMarkedExpression; origIndex: number; found: { index: number; length: number } } =>
      Boolean(x.found),
    );

  if (located.length === 0) return null;
  // 일부만 찾힌 경우도 찾힌 것만 마킹(부분 마커) — 상위가 비율로 판단.
  located.sort((a, b) => a.found.index - b.found.index);

  return located.map((item, ordinal) => ({
    start: item.found.index,
    length: item.found.length,
    displayText: surfaceExpressionOf(item.me) || passage.slice(item.found.index, item.found.index + item.found.length),
    ordinal,
    kind: "underline" as const,
    isError: item.me.isError === true,
    origIndex: item.origIndex,
  }));
}

const BAKED_GRAMMAR_MARK_RE = /__\(?([A-Ja-j])\)?\s+([^_]+?)__/g;

/**
 * 저장된 passageWithMarkers(`__(A) surface__`)를 파싱해 clean 텍스트 + 마크로 환원한다.
 * source 지문이 없거나(동형/임베드) faithful 모드일 때 사용. 라운드트립 보존.
 */
function parseBakedMarkers(passageWithMarkers: string): {
  cleanText: string;
  marks: RenderMark[];
} | null {
  if (!passageWithMarkers.includes("__")) return null;
  let clean = "";
  let lastIndex = 0;
  let ordinal = 0;
  const marks: RenderMark[] = [];
  BAKED_GRAMMAR_MARK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BAKED_GRAMMAR_MARK_RE.exec(passageWithMarkers))) {
    clean += passageWithMarkers.slice(lastIndex, m.index);
    const surface = normalizeSpaces(m[2]);
    marks.push({
      start: clean.length,
      length: surface.length,
      displayText: surface,
      ordinal,
      kind: "underline",
      sourceLabel: m[1].toUpperCase(),
    });
    clean += surface;
    ordinal += 1;
    lastIndex = m.index + m[0].length;
  }
  if (marks.length === 0) return null;
  clean += passageWithMarkers.slice(lastIndex);
  return { cleanText: clean, marks };
}

/** isError 마크의 ordinal 목록(정답 자리). 라벨 재부여와 무관하게 일관. */
function answerOrdinalsFromMarks(marks: RenderMark[]): number[] {
  return marks.filter((m) => m.isError === true).map((m) => m.ordinal);
}

/** {label, 오류여부} 항목들에서 오류 라벨 키(A/B/…) 집합을 만든다. */
function errorLabelKeys(
  items: Array<{ label?: unknown }>,
  isError: (item: { label?: unknown }) => boolean,
): Set<string> {
  return new Set(items.filter(isError).map((it) => grammarKey(it.label)).filter(Boolean));
}

/**
 * baked 마크는 isError 를 직접 못 가지므로 errorKeys(label→오류)로 복원.
 * 비면 stored correctAnswer 의 라벨로 폴백.
 */
function answerOrdinalsForBaked(
  marks: RenderMark[],
  errorKeys: Set<string>,
  correctAnswer: string,
): number[] {
  if (errorKeys.size === 0) {
    for (const token of correctAnswer.split(/[,\s]+/)) {
      const key = grammarKey(token);
      if (key) errorKeys.add(key);
    }
  }
  return marks.filter((m) => m.sourceLabel && errorKeys.has(m.sourceLabel)).map((m) => m.ordinal);
}

function enrichGrammarError(q: BuilderQuestion, style: RenderStyle): RenderModel {
  const sd = readStructuredData(q.structuredData);
  const notes: string[] = [];
  const stem = normalizeSpaces(str(sd?.direction)) || undefined;
  const correctAnswer = str(q.correctAnswer) || undefined;
  const passage = str(q.passage?.content);
  const marked = Array.isArray(sd?.markedExpressions)
    ? (sd!.markedExpressions as GrammarMarkedExpression[])
    : [];

  // 1) normalized + source 지문 보유 → 시맨틱에서 재유도(87% 경로).
  if (style === "normalized" && passage.trim() && marked.length > 0) {
    const marks = deriveGrammarMarksFromSource(passage, marked);
    if (marks && marks.length === marked.length) {
      return {
        kind: "MARKED_PASSAGE",
        style,
        subType: q.subType,
        stem,
        segments: [{ role: "passage", text: passage, marks }],
        answerOrdinals: answerOrdinalsFromMarks(marks),
        correctAnswer,
        notes,
      };
    }
    if (marks) {
      notes.push(`partial-derive: ${marks.length}/${marked.length} located`);
    } else {
      notes.push("derive-failed: no expressions located in source passage");
    }
  }

  // 2) faithful 또는 source 재유도 실패 → 저장된 passageWithMarkers 파싱(12% 경로).
  const baked = str(sd?.passageWithMarkers);
  const parsed = parseBakedMarkers(baked);
  if (parsed) {
    if (style === "normalized") notes.push("fallback: parsed baked passageWithMarkers");
    return {
      kind: "MARKED_PASSAGE",
      style,
      subType: q.subType,
      stem,
      segments: [{ role: "passage", text: parsed.cleanText, marks: parsed.marks }],
      answerOrdinals: answerOrdinalsForBaked(
        parsed.marks,
        errorLabelKeys(marked, (m) => (m as GrammarMarkedExpression).isError === true),
        str(q.correctAnswer),
      ),
      correctAnswer,
      notes,
    };
  }

  // 3) 둘 다 없음 → 현 동작 유지(평탄 렌더). 안 깨짐.
  notes.push("passthrough: no structuredData markers and no source passage");
  return {
    kind: "PASSTHROUGH",
    style,
    subType: q.subType,
    stem,
    segments: [],
    answerOrdinals: [],
    correctAnswer,
    fallbackQuestionText: q.questionText,
    notes,
  };
}

// ─────────────────────── VOCAB_CHOICE(어휘 적절성) 표기 부여 ───────────────────────
// 정본 processVocabChoice 미러: originalWord 로 위치 탐색, 정답/변형단어는 substituteWord
// 표시, 그 외 originalWord. 단 정본은 라벨을 출현순 재정렬하지 않아 ①②④③⑤ 가 발생 →
// 여기서 출현순 재부여로 정본화한다.

type VocabMarkedWord = {
  label?: unknown;
  originalWord?: unknown;
  substituteWord?: unknown;
  isInappropriate?: unknown;
  surroundingText?: unknown;
};

function deriveVocabMarksFromSource(
  passage: string,
  marked: VocabMarkedWord[],
  variantMode: boolean,
): RenderMark[] | null {
  const located = marked
    .map((mw, origIndex) => {
      const original = normalizeSpaces(str(mw.originalWord));
      if (!original) return null;
      const surrounding = normalizeSpaces(str(mw.surroundingText)) || undefined;
      const found = isSingleToken(original)
        ? findWordInPassage(passage, original, surrounding)
        : findExpressionInPassage(passage, original, surrounding);
      if (!found) return null;
      const isInappropriate = mw.isInappropriate === true;
      const substitute = normalizeSpaces(str(mw.substituteWord));
      const showsSubstitute = isInappropriate || (variantMode && !!substitute);
      // 정본 processVocabChoice 와 동일하게 표시 단어를 sanitize.
      const surface = sanitizeExpressionForMarker((showsSubstitute ? substitute : original) || original);
      return { found, surface, isError: isInappropriate, origIndex };
    })
    .filter((x): x is { found: { index: number; length: number }; surface: string; isError: boolean; origIndex: number } =>
      Boolean(x),
    );

  if (located.length === 0) return null;
  located.sort((a, b) => a.found.index - b.found.index);
  return located.map((item, ordinal) => ({
    start: item.found.index,
    length: item.found.length,
    displayText: item.surface,
    ordinal,
    kind: "underline" as const,
    isError: item.isError,
    origIndex: item.origIndex,
  }));
}

function enrichVocabChoice(q: BuilderQuestion, style: RenderStyle): RenderModel {
  const sd = readStructuredData(q.structuredData);
  const notes: string[] = [];
  const stem = normalizeSpaces(str(sd?.direction)) || undefined;
  const correctAnswer = str(q.correctAnswer) || undefined;
  const passage = str(q.passage?.content);
  const marked = Array.isArray(sd?.markedWords) ? (sd!.markedWords as VocabMarkedWord[]) : [];
  const variantMode = normalizeSpaces(str(sd?.vocabDisplayMode)).toUpperCase() === "SYNONYM_VARIANT";

  // 어휘는 정본이 substituteWord 치환 등으로 본문을 가공하므로, 저장된 passageWithMarkers
  // 를 **재라벨링(출현순)** 하는 baked 경로를 우선한다 — 내용은 정본 그대로 두고 순서만
  // 정본화해 내용 오류 위험 0. (source 재유도는 substitute/위치 재현이 불확실 → 폴백.)
  if (style === "normalized") {
    const parsed = parseBakedMarkers(str(sd?.passageWithMarkers));
    if (parsed) {
      return {
        kind: "MARKED_PASSAGE",
        style,
        subType: q.subType,
        stem,
        segments: [{ role: "passage", text: parsed.cleanText, marks: parsed.marks }],
        answerOrdinals: answerOrdinalsForBaked(
          parsed.marks,
          errorLabelKeys(marked, (m) => (m as VocabMarkedWord).isInappropriate === true),
          str(q.correctAnswer),
        ),
        correctAnswer,
        notes,
      };
    }
    // baked 없음 → source 재유도 폴백.
    if (passage.trim() && marked.length > 0) {
      const marks = deriveVocabMarksFromSource(passage, marked, variantMode);
      if (marks && marks.length === marked.length) {
        notes.push("fallback: derived from source (no baked markers)");
        return {
          kind: "MARKED_PASSAGE",
          style,
          subType: q.subType,
          stem,
          segments: [{ role: "passage", text: passage, marks }],
          answerOrdinals: answerOrdinalsFromMarks(marks),
          correctAnswer,
          notes,
        };
      }
    }
  }

  notes.push("passthrough: no structuredData markers and no source passage");
  return {
    kind: "PASSTHROUGH",
    style,
    subType: q.subType,
    stem,
    segments: [],
    answerOrdinals: [],
    correctAnswer,
    fallbackQuestionText: q.questionText,
    notes,
  };
}

// ─────────────────────── ANTONYM(반의어) 표기 부여 ───────────────────────
// 라벨형+리스트 유형: 지문 `__(A) word__` 라벨밑줄 + 보기 `① (A) word - antonym`.
// markedWords 를 지문 출현순으로 재정렬해 (A)~(E)·보기·정답을 모두 정본화한다.
// (어법/어휘와 달리 보기 리스트까지 재정렬 → RenderModel.options 반환.)

type AntonymMarkedWord = {
  label?: unknown;
  word?: unknown;
  antonym?: unknown;
  isIncorrectPair?: unknown;
  surroundingText?: unknown;
};

function enrichAntonym(q: BuilderQuestion, style: RenderStyle): RenderModel {
  const sd = readStructuredData(q.structuredData);
  const notes: string[] = [];
  const stem = normalizeSpaces(str(sd?.direction)) || undefined;
  const correctAnswer = str(q.correctAnswer) || undefined;
  const passage = str(q.passage?.content);
  const marked = Array.isArray(sd?.markedWords) ? (sd!.markedWords as AntonymMarkedWord[]) : [];

  if (style === "normalized" && passage.trim() && marked.length > 0) {
    const located = marked
      .map((mw, origIndex) => {
        const word = normalizeSpaces(str(mw.word));
        if (!word) return null;
        const surrounding = normalizeSpaces(str(mw.surroundingText)) || undefined;
        const found = isSingleToken(word)
          ? findWordInPassage(passage, word, surrounding)
          : findExpressionInPassage(passage, word, surrounding);
        if (!found) return null;
        return { found, word, antonym: normalizeSpaces(str(mw.antonym)), isError: mw.isIncorrectPair === true, origIndex };
      })
      .filter((x): x is { found: { index: number; length: number }; word: string; antonym: string; isError: boolean; origIndex: number } =>
        Boolean(x),
      );

    if (located.length === marked.length) {
      located.sort((a, b) => a.found.index - b.found.index);
      const marks: RenderMark[] = located.map((it, ordinal) => ({
        start: it.found.index,
        length: it.found.length,
        displayText: sanitizeExpressionForMarker(it.word),
        ordinal,
        kind: "underline" as const,
        isError: it.isError,
        origIndex: it.origIndex,
      }));
      // 보기: 출현순 + (라벨) 참조. 라벨은 직렬화와 동일 대문자.
      const options: RenderOption[] = located.map((it, ordinal) => ({
        ordinal,
        text: `(${VERIFY_LABELS[ordinal] ?? ordinal + 1}) ${it.word} - ${it.antonym}`.trim(),
      }));
      // 정답: isIncorrectPair 마크가 있으면 그 위치, 없으면(구버전) stored 정답(옛 옵션번호)
      // → 원래 markedWords index → 재정렬 후 새 위치 로 매핑(재정렬돼도 정답 정합).
      let answerOrdinals = marks.filter((m) => m.isError === true).map((m) => m.ordinal);
      if (answerOrdinals.length === 0) {
        const storedNums = (str(q.correctAnswer).match(/\d+/g) || []).map((n) => Number(n) - 1);
        answerOrdinals = storedNums
          .map((origIdx) => located.findIndex((it) => it.origIndex === origIdx))
          .filter((ord) => ord >= 0);
      }
      return {
        kind: "MARKED_PASSAGE",
        style,
        subType: q.subType,
        stem,
        segments: [{ role: "passage", text: passage, marks }],
        options,
        answerOrdinals,
        correctAnswer,
        notes,
      };
    }
    notes.push(`derive-incomplete: ${located.length}/${marked.length} located`);
  }

  // source 재유도 불가 → 현 동작 유지(보기 재정렬엔 위치가 필수라 baked 폴백 안 함).
  notes.push("passthrough: antonym needs source-passage word location");
  return {
    kind: "PASSTHROUGH",
    style,
    subType: q.subType,
    stem,
    segments: [],
    answerOrdinals: [],
    correctAnswer,
    fallbackQuestionText: q.questionText,
    notes,
  };
}

// ─────────────────────────── 디스패처 ───────────────────────────

/**
 * PaperItem → RenderModel. 표기는 style 에 따라 부여(normalized=프리셋, faithful=원문 미러).
 * STEP 1: GRAMMAR_ERROR 만 이관, 나머지는 PASSTHROUGH(현 동작 유지).
 *
 * 동형 문항의 기본 style 은 호출자가 "faithful" 로 넘기는 것을 권장(원문 형태 보존).
 */
export function enrichQuestionForRender(
  question: BuilderQuestion,
  style: RenderStyle = "normalized",
): RenderModel {
  if (question.subType === "GRAMMAR_ERROR") {
    return enrichGrammarError(question, style);
  }
  if (question.subType === "VOCAB_CHOICE") {
    return enrichVocabChoice(question, style);
  }
  if (question.subType === "ANTONYM") {
    return enrichAntonym(question, style);
  }

  // 미이관 유형 — 현 동작 유지.
  return {
    kind: "PASSTHROUGH",
    style,
    subType: question.subType,
    segments: [],
    answerOrdinals: [],
    fallbackQuestionText: question.questionText,
    notes: ["passthrough: subType not yet migrated"],
  };
}

export function enrichPaperItemForRender(
  item: PaperItem,
  style: RenderStyle = "normalized",
): RenderModel {
  return enrichQuestionForRender(item.sourceQuestion, style);
}

/**
 * RenderModel(마커형)을 `__(A) surface__` 형태로 직렬화한다(라벨=출현순 정본).
 * a4 는 `(A)` 를 formatGrammarErrorPassageMarkers 로 ①로 변환해 렌더하므로,
 * 표기 형식은 그대로 두고 **라벨 순서만 정본화**해 기존 렌더 파이프라인에 무손실로 흘린다.
 */
const VERIFY_LABELS = "ABCDEFGHIJ";
export function serializeNormalizedMarkedPassage(model: RenderModel): string {
  const seg = model.segments.find((s) => s.role === "passage");
  if (!seg) return "";
  // 어휘 적절성은 (a) 소문자, 그 외 마커형은 (A) 대문자 규약. a4 는 둘 다 ①로 변환.
  const lower = model.subType === "VOCAB_CHOICE";
  const sorted = [...seg.marks].sort((a, b) => b.start - a.start); // RTL 치환
  let out = seg.text;
  for (const mark of sorted) {
    const letter = VERIFY_LABELS[mark.ordinal] ?? String(mark.ordinal + 1);
    const label = lower ? letter.toLowerCase() : letter;
    const replacement = `__(${label}) ${mark.displayText}__`;
    out = out.slice(0, mark.start) + replacement + out.slice(mark.start + mark.length);
  }
  return out;
}

/** 검증 하네스 호환용 별칭. */
export const serializeMarkedPassageForVerify = serializeNormalizedMarkedPassage;

/**
 * 동형 생성분 판별 — structuredData 의 _similar* 메타키로 식별.
 * 동형(문제/시험지)은 원문 미러 정책이라 normalized 정규화에서 제외(현 렌더 유지).
 */
export function isSimilarGenerated(question: BuilderQuestion): boolean {
  const sd = readStructuredData(question.structuredData);
  if (!sd) return false;
  return (
    "_similarQuestionGenJobId" in sd ||
    "_similarQuestionGen" in sd ||
    "_genericSimilar" in sd ||
    "_similarExamJobId" in sd
  );
}

/**
 * 시험지 PaperItem 용 정규화 필드(questionText·correctAnswer)를 산출한다.
 * 일반 문항의 **이관된 유형만** 표기를 정본화하고, 그 외(동형·미이관·도출실패)는
 * null 을 반환해 호출자가 현 동작을 유지하게 한다(회귀 0).
 *
 * 반환 questionText 는 raw(미정규화) — 호출자가 normalizeQuestionText 로 마감한다.
 */
export function normalizePaperFields(
  question: BuilderQuestion,
  style: RenderStyle = "normalized",
  schemeOverride?: Partial<MarkerRenderScheme>,
): { questionText: string; correctAnswer: string; options?: OptionItem[] } | null {
  if (style !== "normalized") return null; // faithful=원문 유지
  if (isSimilarGenerated(question)) return null; // 동형 보류

  // 수능 표준 스킴 테이블이 컨트롤러 — 정규화 구현된 마커 유형만 정본화.
  // (override 로 추후 다른 형식 상호변경 가능. 미구현 유형은 표준값만 문서화·현 동작 유지.)
  const scheme = resolveMarkerScheme(question.subType, schemeOverride);
  if (!scheme.normalizeImplemented) return null;

  // 유형별 마커 도출은 dispatcher(enrichQuestionForRender)가 처리.
  const model = enrichQuestionForRender(question, style);
  if (model.kind !== "MARKED_PASSAGE") return null;
  const seg = model.segments.find((s) => s.role === "passage");
  if (!seg || seg.marks.length === 0) return null;
  const stem = model.stem;
  if (!stem) return null; // 발문 없으면 보수적 패스(원문 유지)

  const markedPassage = serializeNormalizedMarkedPassage(model);
  if (!markedPassage) return null;

  // 정답 표기: 어휘 적절성·반의어는 숫자(보기 번호), 그 외 마커형은 (A) 알파벳.
  const numericAnswer = question.subType === "VOCAB_CHOICE" || question.subType === "ANTONYM";
  const answerLabel = (o: number) => (numericAnswer ? String(o + 1) : `(${VERIFY_LABELS[o] ?? o + 1})`);
  const correctAnswer = model.answerOrdinals.length
    ? model.answerOrdinals.map(answerLabel).join(", ")
    : str(question.correctAnswer);

  // 라벨형+리스트 유형(반의어)은 보기도 출현순으로 재정렬해 반환.
  const options = model.options
    ? model.options.map((o) => ({ label: "", text: o.text }))
    : undefined;

  return { questionText: `${stem}\n\n${markedPassage}`, correctAnswer, options };
}

// ─────────────────── 문제 관리(카드·상세 모달) 구조 정규화 ───────────────────
// 시험지(normalizePaperFields)는 평탄 questionText 를 만들지만, 문제 관리 화면은
// structuredData 의 개별 필드(passageWithMarkers·markedExpressions/markedWords·
// options·correctAnswer)를 유형별 렌더러가 직접 소비한다. 그래서 동일한 출현순
// 정본화를 **structured 필드 위에서** 수행해 돌려준다 — 렌더러/모달/분석블록/폰트는 그대로.
//   - 시험지와 동일한 ordering 로직(enrichQuestionForRender)을 재사용 → 두 화면이 한 소스로 일치.
//   - 동형(_similar*)은 시험지와 동일하게 faithful 유지(재정렬 안 함).
//   - 각 유형의 현행 라벨 심볼은 보존(어법=(A)·어휘=①·반의어=(A)+보기①)하고 **순서만** 정본화.
//   - back-map(원본 항목↔출현순) 실패 시 전체 미적용(부분 정규화 금지 → 안전 폴백).

const DISPLAY_NORMALIZE_SUBTYPES = new Set(["GRAMMAR_ERROR", "VOCAB_CHOICE", "ANTONYM"]);

type DisplayMarked = Record<string, unknown> & { label?: unknown };

function isSimilarGeneratedDisplay(question: Record<string, unknown>): boolean {
  return (
    "_similarQuestionGenJobId" in question ||
    "_similarQuestionGen" in question ||
    "_genericSimilar" in question ||
    "_similarExamJobId" in question
  );
}

/**
 * 출현순 marks 로 원본 분석 배열(markedExpressions/markedWords)을 재정렬 + 라벨 재부여.
 * source 재유도 마크는 origIndex 로, baked 마크는 sourceLabel(키)로 원본을 역매핑한다.
 * 하나라도 역매핑 실패 시 null(상위가 전체 미적용 → 깨진 중간 상태 방지).
 */
function reorderMarkedForDisplay(
  marks: RenderMark[],
  original: DisplayMarked[],
  relabel: (ordinal: number) => string,
): DisplayMarked[] | null {
  const byKey = new Map<string, DisplayMarked>();
  original.forEach((item) => {
    const key = grammarKey(item.label);
    if (key && !byKey.has(key)) byKey.set(key, item);
  });

  const ordered = [...marks].sort((a, b) => a.ordinal - b.ordinal);
  const result: DisplayMarked[] = [];
  for (const mark of ordered) {
    let item: DisplayMarked | undefined;
    if (typeof mark.origIndex === "number") item = original[mark.origIndex];
    else if (mark.sourceLabel) item = byKey.get(mark.sourceLabel.toUpperCase());
    if (!item) return null;
    result.push({ ...item, label: relabel(mark.ordinal) });
  }
  return result;
}

/**
 * structuredData(display) → 출현순 정본화된 structuredData. GRAMMAR_ERROR·VOCAB_CHOICE·
 * ANTONYM 만 처리하고 그 외/동형/도출실패는 입력을 그대로 돌려준다(회귀 0).
 */
export function normalizeStructuredQuestionForDisplay(
  question: unknown,
  sourcePassageContent?: string,
): unknown {
  if (!question || typeof question !== "object" || Array.isArray(question)) return question;
  const q = question as Record<string, unknown>;
  const typeId = typeof q._typeId === "string" ? q._typeId : "";
  if (!DISPLAY_NORMALIZE_SUBTYPES.has(typeId)) return question;
  if (isSimilarGeneratedDisplay(q)) return question; // 동형=faithful(시험지와 동일)

  // enrichQuestionForRender 는 BuilderQuestion 형태를 읽으므로 최소 어댑터로 감싼다
  // (subType·structuredData·passage.content·correctAnswer 만 참조).
  const builderLike = {
    subType: typeId,
    structuredData: q,
    questionText: "",
    correctAnswer: typeof q.correctAnswer === "string" ? q.correctAnswer : "",
    passage: sourcePassageContent ? { content: sourcePassageContent } : null,
  } as unknown as BuilderQuestion;

  const model = enrichQuestionForRender(builderLike, "normalized");
  if (model.kind !== "MARKED_PASSAGE") return question;
  const seg = model.segments.find((s) => s.role === "passage");
  if (!seg || seg.marks.length === 0) return question;

  const passageWithMarkers = serializeNormalizedMarkedPassage(model);
  if (!passageWithMarkers) return question;

  const circled = (ordinal: number) => getCircledNumber(ordinal);
  const alpha = (ordinal: number) => `(${VERIFY_LABELS[ordinal] ?? String(ordinal + 1)})`;
  const next: Record<string, unknown> = { ...q, passageWithMarkers };

  if (typeId === "GRAMMAR_ERROR") {
    const original = Array.isArray(q.markedExpressions) ? (q.markedExpressions as DisplayMarked[]) : [];
    const reordered = reorderMarkedForDisplay(seg.marks, original, alpha);
    if (!reordered) return question;
    next.markedExpressions = reordered;
    if (model.answerOrdinals.length) {
      const labels = model.answerOrdinals.map(alpha);
      next.correctAnswer = labels.join(", ");
      next.correctAnswers = labels;
    }
    return next;
  }

  if (typeId === "VOCAB_CHOICE") {
    const original = Array.isArray(q.markedWords) ? (q.markedWords as DisplayMarked[]) : [];
    const reordered = reorderMarkedForDisplay(seg.marks, original, circled);
    if (!reordered) return question;
    next.markedWords = reordered;
    if (model.answerOrdinals.length) {
      const labels = model.answerOrdinals.map((o) => String(o + 1));
      next.correctAnswer = labels.join(", ");
      next.correctAnswers = labels;
    }
    return next;
  }

  // ANTONYM — 보기 리스트까지 출현순 재정렬(라벨형+리스트 유형).
  const original = Array.isArray(q.markedWords) ? (q.markedWords as DisplayMarked[]) : [];
  const reordered = reorderMarkedForDisplay(seg.marks, original, alpha);
  if (!reordered) return question;
  next.markedWords = reordered;
  if (model.options) {
    next.options = model.options.map((o) => ({ label: getCircledNumber(o.ordinal), text: o.text }));
  }
  if (model.answerOrdinals.length) {
    next.correctAnswer = model.answerOrdinals.map(circled).join(", ");
  }
  return next;
}
