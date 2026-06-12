// ============================================================================
// 문제 생성 다양성 모듈
// 같은 지문 + 같은 유형을 반복 생성할 때 (1) 타깃(빈칸 스팬·함축 밑줄·반의어 쌍 등)
// 중복과 (2) 정답 위치 편중을 줄인다.
//
// 세 가지 축:
//  - 기사용 타깃 회피: 저장된 기존 문항의 structuredData 에서 타깃을 추출해
//    "회피 목록" 프롬프트 블록으로 주입 (소프트 — 새 타깃이 없으면 재사용 허용).
//  - 정답 위치 스티어링: 라벨이 지문 위치에 결속된 유형(삽입·어휘·반의어·어법·순서)은
//    최근 정답 위치를 피해 서버가 위치를 지정 (IRRELEVANT 의 ⭐ 패턴 확장).
//  - 보기 셔플: 라벨이 지문과 무관한 보기 배열형 유형은 후처리에서 보기 내용을
//    재배열하고 정답·오답해설·해설 내 라벨 언급을 결정형으로 재매핑.
//
// 품질 게이트(validateQuestionQuality)는 셔플 이후 결과를 검증하므로, 다양성
// 때문에 게이트 이하 문항이 저장되는 경로는 없다.
// ============================================================================

import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";

// ---------------------------------------------------------------------------
// 컨텍스트 타입
// ---------------------------------------------------------------------------

export interface SubTypeDiversitySignals {
  /** 기존 문항이 사용한 타깃의 원문 표현 (유형별 의미는 extract 함수 참고) */
  usedTargets: string[];
  /** 기존 문항의 정규화된 정답 라벨 ("2", "5", "a", "c" 등) — 최근 순 */
  usedAnswerLabels: string[];
  /** 어법류: 기존 문항이 정답(오류)으로 사용한 출제 포인트 코드(a~m) — 회피용 */
  usedPointCodes?: string[];
}

export interface QuestionDiversityContext {
  bySubType: Record<string, SubTypeDiversitySignals>;
  /** 같은 배치에서 병렬 생성 중인 N개 중 몇 번째인지 (0-based) */
  variantIndex?: number;
  variantCount?: number;
}

const MAX_USED_TARGETS_PER_TYPE = 8;
const MAX_USED_ANSWER_LABELS_PER_TYPE = 12;
const MAX_TARGET_DISPLAY_LENGTH = 140;

// ---------------------------------------------------------------------------
// 공용 헬퍼 (방어적 파싱 — structuredData 는 신뢰할 수 없는 JSON)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeDiversityComparable(value: unknown): string {
  return asTrimmedString(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 정답 라벨 토큰을 "1"/"a" 형태로 정규화 (question-quality 의 normalizeLabel 과 동일 규약) */
function normalizeAnswerLabelToken(value: unknown): string {
  const text = asTrimmedString(value);
  if (!text) return "";
  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  const match = text.match(/^[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?\s*$/);
  if (!match) return "";
  return match[1].toLowerCase();
}

/** correctAnswer/correctAnswers 에서 라벨 토큰들을 수집 */
function collectAnswerLabelTokens(
  correctAnswer: unknown,
  correctAnswers?: unknown,
): string[] {
  const labels: string[] = [];
  const push = (value: unknown) => {
    const label = normalizeAnswerLabelToken(value);
    if (label && !labels.includes(label)) labels.push(label);
  };

  if (Array.isArray(correctAnswers)) correctAnswers.forEach(push);

  const text = asTrimmedString(correctAnswer);
  if (text) {
    const matches = text.match(
      /[\(\[]?\s*(?:[A-Ja-j]|\d{1,3}|[①-⑳㉑-㉟㊱-㊿])\s*[\)\].:]?/g,
    );
    if (matches?.length) matches.forEach(push);
    else push(text);
  }

  return labels;
}

function pushTarget(targets: string[], value: unknown) {
  const text = asTrimmedString(value);
  if (!text) return;
  const truncated =
    text.length > MAX_TARGET_DISPLAY_LENGTH
      ? `${text.slice(0, MAX_TARGET_DISPLAY_LENGTH)}…`
      : text;
  if (!targets.includes(truncated)) targets.push(truncated);
}

// ---------------------------------------------------------------------------
// 1) 기존 문항에서 "사용된 타깃 + 정답 라벨" 추출
// ---------------------------------------------------------------------------

export interface UsedQuestionRow {
  subType: string | null;
  structuredData: unknown;
  correctAnswer: string | null;
}

function extractUsedSignature(
  subType: string,
  structuredData: unknown,
  correctAnswer: string | null,
): { targets: string[]; answerLabels: string[]; pointCodes: string[] } {
  const data = isRecord(structuredData) ? structuredData : {};
  const targets: string[] = [];
  const pointCodes: string[] = [];
  const answerLabels = collectAnswerLabelTokens(
    correctAnswer ?? data.correctAnswer,
    data.correctAnswers,
  );

  switch (subType) {
    case "BLANK_INFERENCE": {
      pushTarget(targets, data.originalExpression);
      if (Array.isArray(data.blanks)) {
        for (const blank of data.blanks) {
          if (isRecord(blank)) pushTarget(targets, blank.originalExpression);
        }
      }
      break;
    }
    case "IMPLIED_MEANING":
      pushTarget(targets, data.underlinedExpression);
      break;
    case "CONTEXT_MEANING":
      pushTarget(targets, data.underlinedWord);
      break;
    case "SYNONYM":
      pushTarget(targets, data.targetWord);
      break;
    case "ANTONYM": {
      if (Array.isArray(data.markedWords)) {
        const pairTarget = (marked: Record<string, unknown>): string | null => {
          const word = asTrimmedString(marked.word);
          if (!word) return null;
          // 정답 쌍은 표시용 오답 반의어(antonym) 대신 실제 반의어(correctAntonym)로
          // 기록해야 후보 사전 텍스트("word correctAntonym")와 매칭되어 필터된다.
          const antonym =
            asTrimmedString(marked.correctAntonym) || asTrimmedString(marked.antonym);
          return antonym ? `${word} – ${antonym}` : word;
        };
        const markedRecords = data.markedWords.filter(isRecord);
        // 정답 쌍을 먼저 push — cap 절단 시에도 각 문항의 정답 타깃이 살아남는다.
        for (const marked of markedRecords) {
          if (marked.isIncorrectPair !== true) continue;
          const target = pairTarget(marked);
          if (target) pushTarget(targets, target);
        }
        for (const marked of markedRecords) {
          if (marked.isIncorrectPair === true) continue;
          const target = pairTarget(marked);
          if (target) pushTarget(targets, target);
        }
      }
      break;
    }
    case "VOCAB_CHOICE": {
      if (Array.isArray(data.markedWords)) {
        const markedRecords = data.markedWords.filter(isRecord);
        // 정답(부적절 어휘)을 먼저 push — cap 절단에도 정답 타깃은 유지.
        for (const marked of markedRecords) {
          if (marked.isInappropriate !== true) continue;
          pushTarget(targets, marked.originalWord ?? marked.word);
        }
        for (const marked of markedRecords) {
          if (marked.isInappropriate === true) continue;
          pushTarget(targets, marked.originalWord ?? marked.word);
        }
      }
      break;
    }
    case "GRAMMAR_ERROR": {
      if (Array.isArray(data.markedExpressions)) {
        for (const marked of data.markedExpressions) {
          if (isRecord(marked) && marked.isError === true) {
            pushTarget(targets, marked.expression);
            const pointCode = asTrimmedString(marked.pointCode).toLowerCase();
            if (/^[a-m]$/.test(pointCode)) pointCodes.push(pointCode);
          }
        }
      }
      break;
    }
    case "SENTENCE_INSERT":
      pushTarget(targets, data.givenSentence);
      break;
    case "REFERENCE":
      // 같은 대명사의 다른 위치 출제를 허용하기 위해 발생 단위(주변 문맥)로 기록.
      pushTarget(
        targets,
        asTrimmedString(data.surroundingText) || data.underlinedPronoun,
      );
      break;
    case "IRRELEVANT":
      // 보기 텍스트가 원형 숫자 마커라 타깃 회피 목록은 무의미하고 위치 고정
      // 지시와 모순만 만든다 — 정답 라벨 회피(위치 스티어링)만 사용.
      break;
    case "SUMMARY_COMPLETE_MC": {
      if (Array.isArray(data.blanks)) {
        for (const blank of data.blanks) {
          if (isRecord(blank)) pushTarget(targets, blank.answer);
        }
      }
      break;
    }
    case "SENTENCE_ORDER":
      // 분할 지점은 안정적으로 비교하기 어려움 — 정답 라벨 회피만 사용.
      break;
    default: {
      // 주제/제목/요지/내용일치 등 보기 배열형: 정답 보기 텍스트를 타깃으로 사용
      // (다음 생성에서 같은 표현의 정답 선지가 반복되는 것을 줄인다).
      const options = Array.isArray(data.options) ? data.options : [];
      const answerSet = new Set(answerLabels);
      for (const option of options) {
        if (!isRecord(option)) continue;
        const label = normalizeAnswerLabelToken(option.label);
        if (label && answerSet.has(label)) pushTarget(targets, option.text);
      }
      break;
    }
  }

  return { targets, answerLabels, pointCodes };
}

/** DB 에서 읽은 기존 문항 rows 로 다양성 컨텍스트 구성 (rows 는 최근 순 권장) */
export function buildQuestionDiversityContext(
  rows: UsedQuestionRow[],
  options: { variantIndex?: number; variantCount?: number } = {},
): QuestionDiversityContext {
  const bySubType: Record<string, SubTypeDiversitySignals> = {};

  for (const row of rows) {
    const subType = asTrimmedString(row.subType);
    if (!subType) continue;
    const signature = extractUsedSignature(
      subType,
      row.structuredData,
      row.correctAnswer,
    );
    const bucket = (bySubType[subType] ??= { usedTargets: [], usedAnswerLabels: [] });
    for (const target of signature.targets) {
      if (bucket.usedTargets.length >= MAX_USED_TARGETS_PER_TYPE) break;
      if (!bucket.usedTargets.includes(target)) bucket.usedTargets.push(target);
    }
    for (const label of signature.answerLabels) {
      if (bucket.usedAnswerLabels.length >= MAX_USED_ANSWER_LABELS_PER_TYPE) break;
      bucket.usedAnswerLabels.push(label);
    }
    if (signature.pointCodes.length > 0) {
      const codes = (bucket.usedPointCodes ??= []);
      for (const code of signature.pointCodes) {
        if (codes.length >= MAX_USED_ANSWER_LABELS_PER_TYPE) break;
        codes.push(code);
      }
    }
  }

  return {
    bySubType,
    variantIndex: options.variantIndex,
    variantCount: options.variantCount,
  };
}

// ---------------------------------------------------------------------------
// 2) 정답 위치 스티어링 (위치 결속형 유형)
// ---------------------------------------------------------------------------

/**
 * 사용 빈도가 가장 낮은 위치들 중에서 pickCount 개를 고른다.
 * variantIndex 가 있으면 같은 배치의 병렬 호출들이 서로 다른 위치를 받도록
 * 결정형으로 오프셋하고, 없으면 무작위 오프셋을 쓴다.
 */
export function pickSteeredPositions(
  positionLabels: string[],
  usedLabels: string[],
  variantIndex: number | undefined,
  pickCount = 1,
): string[] {
  if (positionLabels.length === 0) return [];
  const usage = new Map<string, number>(positionLabels.map((label) => [label, 0]));
  for (const used of usedLabels) {
    const normalized = normalizeAnswerLabelToken(used);
    if (usage.has(normalized)) {
      usage.set(normalized, (usage.get(normalized) ?? 0) + 1);
    }
  }

  const offset =
    typeof variantIndex === "number" && Number.isFinite(variantIndex)
      ? Math.max(0, Math.floor(variantIndex))
      : Math.floor(Math.random() * positionLabels.length);

  // 사용 횟수 오름차순 + 배치 오프셋 회전으로 동률을 가른다.
  const total = positionLabels.length;
  const ranked = positionLabels
    .map((label, index) => ({
      label,
      count: usage.get(label) ?? 0,
      rotation: (index + total - (offset % total)) % total,
    }))
    .sort((a, b) => a.count - b.count || a.rotation - b.rotation);

  return ranked.slice(0, Math.max(1, pickCount)).map((item) => item.label);
}

interface DiversityPromptCounts {
  sentenceInsertSlotCount?: number;
  vocabChoiceMarkerCount?: number;
  vocabChoiceAnswerCount?: number;
  antonymPairCount?: number;
  grammarMarkerCount?: number;
  grammarAnswerCount?: number;
}

const ALPHA_LOWER = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

function clampCount(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function buildAnswerPositionDirective(
  subType: string,
  signals: SubTypeDiversitySignals,
  variantIndex: number | undefined,
  counts: DiversityPromptCounts,
): string {
  const used = signals.usedAnswerLabels;

  switch (subType) {
    case "SENTENCE_INSERT": {
      const slotCount = clampCount(counts.sentenceInsertSlotCount, 5, 8, 5);
      // 양끝(①/마지막)은 게이트가 경고하는 자리 — 내부 위치만 후보로 쓴다.
      const interior = Array.from({ length: slotCount }, (_, i) => String(i + 1)).slice(
        1,
        slotCount - 1,
      );
      const picked = pickSteeredPositions(interior, used, variantIndex, 1)[0];
      if (!picked) return "";
      const marker = getCircledNumber(Number(picked) - 1);
      return `⭐ 이번 문항의 정답 삽입 위치: 주어진 문장의 정답 위치가 ${marker}(${picked}번 위치)이 되도록 지문 분할과 givenSentence 선택을 설계하세요. 매번 같은 위치(특히 ⑤)에 정답을 두지 마세요.`;
    }
    case "VOCAB_CHOICE": {
      const markerCount = clampCount(counts.vocabChoiceMarkerCount, 5, 10, 5);
      const answerCount = clampCount(counts.vocabChoiceAnswerCount, 1, markerCount, 1);
      const keys = ALPHA_LOWER.slice(0, markerCount);
      const picked = pickSteeredPositions(keys, used, variantIndex, answerCount);
      if (!picked.length) return "";
      const labels = picked.map((key) => `(${key})`).join(", ");
      return `⭐ 이번 문항의 정답 위치: 문맥상 부적절한 어휘는 되도록 ${labels} 위치(밑줄 순서 기준)에 배치하세요. 정답이 항상 (a) 등 지문 앞쪽 밑줄에 몰리지 않게 하세요.`;
    }
    case "ANTONYM": {
      const pairCount = clampCount(counts.antonymPairCount, 5, 10, 5);
      const keys = ALPHA_LOWER.slice(0, pairCount);
      // 반의어 후처리는 정답 라벨을 숫자("1"~)로 저장 — 알파벳 키 공간으로 변환해야
      // 사용 빈도 집계가 작동한다 (이미 알파벳이면 그대로 통과).
      const usedAlpha = used.map((label) => {
        const n = Number(label);
        return Number.isInteger(n) && n >= 1 && n <= keys.length
          ? keys[n - 1]
          : label;
      });
      const picked = pickSteeredPositions(keys, usedAlpha, variantIndex, 1)[0];
      if (!picked) return "";
      const label = `(${picked.toUpperCase()})`;
      return `⭐ 이번 문항의 정답 위치: 잘못 짝지어진 쌍은 되도록 ${label} 위치(쌍 나열 순서 기준)에 배치하세요. 정답 쌍의 위치가 매번 같지 않게 하세요.`;
    }
    case "GRAMMAR_ERROR": {
      const markerCount = clampCount(counts.grammarMarkerCount, 5, 10, 5);
      const answerCount = clampCount(counts.grammarAnswerCount, 1, markerCount, 1);
      const keys = ALPHA_LOWER.slice(0, markerCount);
      const picked = pickSteeredPositions(keys, used, variantIndex, answerCount);
      if (!picked.length) return "";
      const labels = picked.map((key) => `(${key.toUpperCase()})`).join(", ");
      return `⭐ 이번 문항의 정답 위치: 어법상 틀린 표현은 되도록 ${labels} 위치에 배치하세요. 정답 위치가 매번 같은 라벨에 몰리지 않게 하세요.`;
    }
    case "SENTENCE_ORDER": {
      const positions = ["1", "2", "3", "4", "5"];
      const picked = pickSteeredPositions(positions, used, variantIndex, 1)[0];
      if (!picked) return "";
      const marker = getCircledNumber(Number(picked) - 1);
      return `⭐ 이번 문항의 정답 위치: 정답이 ${marker}(${picked}번 선지)이 되도록 (A)(B)(C) 단락의 실제 순서와 선지 구성을 설계하세요. 정답이 항상 같은 번호에 몰리지 않게 하세요.`;
    }
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// 3) 다양성 프롬프트 블록 (회피 목록 + 위치 스티어링)
// ---------------------------------------------------------------------------

const TARGET_NOUN_BY_SUBTYPE: Record<string, string> = {
  BLANK_INFERENCE: "빈칸으로 만든 원문 표현",
  IMPLIED_MEANING: "밑줄 친 표현",
  CONTEXT_MEANING: "밑줄 친 단어",
  SYNONYM: "대상 단어",
  ANTONYM: "단어-반의어 쌍",
  VOCAB_CHOICE: "밑줄 어휘",
  GRAMMAR_ERROR: "오류로 변형한 표현",
  SENTENCE_INSERT: "삽입용으로 빼낸 문장",
  REFERENCE: "밑줄 친 대명사",
  SUMMARY_COMPLETE_MC: "요약문 빈칸 정답 어구",
};

export function buildDiversityPromptBlock(
  subType: string,
  signals: SubTypeDiversitySignals | undefined,
  variantIndex: number | undefined,
  counts: DiversityPromptCounts,
): string {
  const resolved = signals ?? { usedTargets: [], usedAnswerLabels: [] };
  const lines: string[] = [];

  if (SHUFFLE_OPTION_TYPES.has(subType)) {
    // 셔플(보기 재배열) 대상 유형: 해설이 선지를 평숫자로 지칭하면 재배열 후
    // 모순이 생기므로 금지한다 (재매핑 가능한 원형 숫자 또는 내용 지칭만 허용).
    lines.push(
      "해설(explanation)과 오답 해설에서 선지를 '2번', '(3)', '선지 5'처럼 숫자로 지칭하지 마세요. 선지를 언급할 때는 선지 내용을 직접 인용하거나 ①~⑩ 원형 숫자 표기만 사용하세요. (선지 순서는 출제 후 재배열될 수 있습니다)",
    );
  }

  if (resolved.usedTargets.length > 0) {
    const noun = TARGET_NOUN_BY_SUBTYPE[subType] ?? "정답 보기 표현";
    lines.push(
      `이 지문으로 이미 생성된 같은 유형 문항들이 사용한 ${noun}:`,
      ...resolved.usedTargets.map((target, index) => `${index + 1}. "${target}"`),
      "이번 문항은 위 목록과 다른 타깃을 선택하세요. 적절한 새 타깃이 정말 없을 때만 재사용할 수 있으며, 그 경우 선지 구성과 오답 설계를 반드시 다르게 하세요.",
    );
  }

  const positionDirective = buildAnswerPositionDirective(
    subType,
    resolved,
    variantIndex,
    counts,
  );
  if (positionDirective) lines.push(positionDirective);

  if (lines.length === 0) return "";
  return ["## 다양성 지시 (반복 생성 회피)", ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// 4) 보기 셔플 (보기 배열형 유형 — 정답 위치 편중 제거)
// ---------------------------------------------------------------------------

/** 라벨이 지문 위치와 무관해서 보기 내용을 재배열해도 안전한 유형들 */
export const SHUFFLE_OPTION_TYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "BLANK_INFERENCE",
  "IMPLIED_MEANING",
  "CONTEXT_MEANING",
  "SYNONYM",
  "SUMMARY_COMPLETE_MC",
]);

function fisherYatesPermutation(length: number): number[] {
  const perm = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

/** 해설 텍스트 안의 원형 숫자(①~⑩) 언급을 새 위치로 재매핑 (2단계 치환) */
function remapCircledMentions(text: string, oldToNew: number[]): string {
  if (!text) return text;
  const circled = getCircledNumbers(oldToNew.length);
  // 본문에 존재할 수 없는 센티널을 거쳐 치환해, 연쇄 덮어쓰기와 본문에 원래
  // 있던 일반 숫자의 오변환을 모두 막는다.
  let result = text;
  for (let oldIndex = 0; oldIndex < oldToNew.length; oldIndex++) {
    result = result
      .split(circled[oldIndex])
      .join(`@@CIRCLED_${oldToNew[oldIndex]}@@`);
  }
  return result.replace(/@@CIRCLED_(\d+)@@/g, (_, index) =>
    getCircledNumber(Number(index)),
  );
}

/**
 * 보기 배열형 문항의 보기 내용을 재배열한다.
 * - 라벨 문자열은 자리 순서를 유지하고, 내용(text·blankValues 등)만 이동.
 * - correctAnswer / correctAnswers / wrongOptionExplanations(객체·배열 모두) /
 *   해설 내 원형 숫자 언급을 일관되게 재매핑.
 * - 모양이 예상과 다르면(라벨 중복, 정답 라벨 미해석 등) 셔플하지 않고 원본 반환 —
 *   다양성 시도가 기존 게이트 통과 문항을 깨뜨리지 않게 하는 안전장치.
 */
export function shuffleQuestionOptionsForDiversity(
  question: Record<string, unknown>,
  subType: string,
): Record<string, unknown> {
  if (!SHUFFLE_OPTION_TYPES.has(subType)) return question;

  const rawOptions = Array.isArray(question.options) ? question.options : null;
  if (!rawOptions) return question;
  const options = rawOptions.filter(isRecord);
  if (options.length < 2 || options.length !== rawOptions.length) return question;

  const normalizedLabels = options.map((opt) => normalizeAnswerLabelToken(opt.label));
  if (normalizedLabels.some((label) => !label)) return question;
  if (new Set(normalizedLabels).size !== normalizedLabels.length) return question;

  // 해설이 선지를 평숫자("3번", "선지 5", "(3)")나 원형 숫자 범위("①~④")로
  // 지칭하면 재매핑이 불가능 — 셔플을 포기해 정답 키와 해설의 모순을 막는다.
  // (다양성 프롬프트가 번호 지칭을 금지하므로 새 생성분에서는 드문 경로.)
  const mentionTexts: string[] = [];
  if (typeof question.explanation === "string") mentionTexts.push(question.explanation);
  const rawWrongExplanations = question.wrongOptionExplanations;
  if (Array.isArray(rawWrongExplanations)) {
    for (const item of rawWrongExplanations) {
      if (isRecord(item) && typeof item.explanation === "string") {
        mentionTexts.push(item.explanation);
      }
    }
  } else if (isRecord(rawWrongExplanations)) {
    for (const value of Object.values(rawWrongExplanations)) {
      if (typeof value === "string") mentionTexts.push(value);
    }
  }
  const UNMAPPABLE_MENTION =
    /(?:[1-9]\s*번(?!째))|(?:선지\s*[1-9])|(?:보기\s*[1-9])|(?:\(\s*[1-9]\s*\))|(?:[①-⑳]\s*[~∼〜‐–—-]\s*[①-⑳])/;
  if (mentionTexts.some((text) => UNMAPPABLE_MENTION.test(text))) {
    return question;
  }

  // 정답 보기의 (구) 인덱스 결정 — 정답 선언 "전체"가 라벨 형태로 파싱될 때만
  // 라벨 매칭을 신뢰한다. 보기 전문형 정답("그는 5년 동안 일했다") 속 숫자를
  // 라벨로 오인해 정답 키를 엉뚱한 보기로 재작성하는 것을 막고, 일부 토큰만
  // 맞는 모호한 선언("3 (d)")은 셔플로 세탁하지 않고 게이트가 원본을 보게 한다.
  const arrayTokens: string[] = [];
  if (Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0) {
    for (const value of question.correctAnswers) {
      const token = normalizeAnswerLabelToken(value);
      if (!token) return question;
      if (!arrayTokens.includes(token)) arrayTokens.push(token);
    }
  }
  const correctAnswerText = asTrimmedString(question.correctAnswer);
  const stringParts = correctAnswerText
    ? correctAnswerText.split(",").map((part) => part.trim()).filter(Boolean)
    : [];
  const stringTokens: string[] = [];
  let stringIsPureLabels = stringParts.length > 0;
  for (const part of stringParts) {
    const token = normalizeAnswerLabelToken(part);
    if (!token) {
      stringIsPureLabels = false;
      stringTokens.length = 0;
      break;
    }
    if (!stringTokens.includes(token)) stringTokens.push(token);
  }
  // 배열과 문자열이 둘 다 라벨 형태인데 서로 다르면 모호 — 게이트에 맡긴다.
  if (arrayTokens.length > 0 && stringIsPureLabels) {
    const sameSet =
      arrayTokens.length === stringTokens.length &&
      arrayTokens.every((token) => stringTokens.includes(token));
    if (!sameSet) return question;
  }
  const answerLabelTokens = arrayTokens.length > 0 ? arrayTokens : stringTokens;
  const answerByLabel = answerLabelTokens.length > 0;
  let oldCorrectIndices: number[];
  if (answerByLabel) {
    const indices = answerLabelTokens.map((token) => normalizedLabels.indexOf(token));
    if (indices.some((index) => index < 0)) return question;
    oldCorrectIndices = indices;
  } else {
    const textMatchedIndex = options.findIndex(
      (opt) =>
        asTrimmedString(opt.text) && asTrimmedString(opt.text) === correctAnswerText,
    );
    if (textMatchedIndex < 0) return question;
    oldCorrectIndices = [textMatchedIndex];
  }

  const perm = fisherYatesPermutation(options.length); // newIndex -> oldIndex
  const oldToNew: number[] = new Array(options.length);
  for (let newIndex = 0; newIndex < perm.length; newIndex++) {
    oldToNew[perm[newIndex]] = newIndex;
  }

  const newOptions = perm.map((oldIndex, newIndex) => ({
    ...options[oldIndex],
    label: options[newIndex].label,
  }));

  const result: Record<string, unknown> = { ...question, options: newOptions };

  // correctAnswer / correctAnswers 재매핑 (라벨 기반일 때만 — 텍스트 기반 정답은
  // 내용이 함께 이동하므로 그대로 유효하다).
  if (answerByLabel) {
    const newCorrectLabels = oldCorrectIndices
      .map((oldIndex) => oldToNew[oldIndex])
      .sort((a, b) => a - b)
      .map((newIndex) => asTrimmedString(newOptions[newIndex].label));
    if (newCorrectLabels.some((label) => !label)) return question;
    result.correctAnswer = newCorrectLabels.join(", ");
    if (Array.isArray(question.correctAnswers)) {
      result.correctAnswers = newCorrectLabels;
    }
  }

  // wrongOptionExplanations 재매핑 — 해설은 보기 "내용"에 붙어 있으므로 내용을
  // 따라 새 라벨로 이동한다. 객체(Record)와 배열([{label, explanation}]) 모두 지원.
  const remapExplanationLabel = (rawLabel: unknown): string | null => {
    const token = normalizeAnswerLabelToken(rawLabel);
    if (!token) return null;
    const oldIndex = normalizedLabels.indexOf(token);
    if (oldIndex < 0) return null;
    return asTrimmedString(newOptions[oldToNew[oldIndex]].label) || null;
  };

  const wrongExplanations = question.wrongOptionExplanations;
  if (Array.isArray(wrongExplanations)) {
    result.wrongOptionExplanations = wrongExplanations.map((item) => {
      if (!isRecord(item)) return item;
      const newLabel = remapExplanationLabel(item.label);
      const explanation =
        typeof item.explanation === "string"
          ? remapCircledMentions(item.explanation, oldToNew)
          : item.explanation;
      return newLabel ? { ...item, label: newLabel, explanation } : { ...item, explanation };
    });
  } else if (isRecord(wrongExplanations)) {
    const remapped: Record<string, unknown> = {};
    for (const [rawLabel, value] of Object.entries(wrongExplanations)) {
      const newLabel = remapExplanationLabel(rawLabel) ?? rawLabel;
      remapped[newLabel] =
        typeof value === "string" ? remapCircledMentions(value, oldToNew) : value;
    }
    if (Object.keys(remapped).length !== Object.keys(wrongExplanations).length) {
      // 키 충돌로 해설이 유실되면 셔플을 포기한다 (게이트/표시 일관성 우선).
      return question;
    }
    result.wrongOptionExplanations = remapped;
  }

  if (typeof question.explanation === "string") {
    result.explanation = remapCircledMentions(question.explanation, oldToNew);
  }
  // answerLogic 은 UI 미노출 내부 필드지만 라벨 언급("정답 선지 ④")이 남으면
  // 메타데이터 정합이 깨진다 (실생성 검수에서 발견된 누락).
  if (typeof question.answerLogic === "string") {
    result.answerLogic = remapCircledMentions(question.answerLogic, oldToNew);
  }

  return result;
}
