/**
 * 어법(GRAMMAR_ERROR) 해설 결정론 린트 — round-2 감독관 판정 ④.
 *
 * 결정론으로 잡히는 "해설 파손"만 검출한다. 전부 warning 급('grammar-explanation-lint')
 * 으로만 발행되어 출하를 차단하지 않는다 — repair 분기(해설 전용 수리)가 소비한다.
 *
 * 검출 항목:
 *  (a) 어투 혼용 — 한 필드(explanation·wrongOptionExplanations 항목·keyPoints 항목)
 *      안에서 첫 문장이 해라체('-이다.'/'-한다.'/'-된다.')로 끝나는데 같은 필드의
 *      나머지에 합니다체('-…니다')가 섞인 경우 (round-1 실측 q06).
 *  (b) 수(數) 모순 — "복수 명사인 a/an X"(round-1 실측 q23 '복수 명사인 a child'),
 *      "단수 명사인 Xs"(영어 단어가 -s 복수형인데 단수라 서술). 단수형인데 -s 로
 *      끝나는 상용어(news·-ss·-us·-is·-ics 등)는 제외해 오탐을 막는다.
 *  (c) keyPoints 라벨 중복 — 같은 밑줄 라벨을 두 keyPoint 가 반복 앵커. (라벨 존재·
 *      정답 라벨 선두·주제 정합은 기존 grammar-keypoint-choice-mismatch 게이트가
 *      error 로 이미 강제하므로 여기서 중복 검출하지 않는다.)
 *  (d) 한국어-영단어 붙임 오타 — 한글과 영단어 사이 공백 부재로 문자가 샌드위치된
 *      확정 패턴 /[가-힣][A-Za-z]{2,}[가-힣]/ (round-1 실측 q18 '동사encouraged가').
 *      백틱 코드 스팬은 제외하고, 전부 대문자인 약어(TV·EBS·AI 등)는 한글 붙임이
 *      관행 표기이므로 제외한다. 인용부호('…'/"…")는 문자 인접을 끊으므로 인용된
 *      영단어는 구조적으로 매치되지 않는다(코드/인용 문맥 자동 제외).
 *
 * 하드 실패 유발 금지 계약: 이 모듈은 어떤 경로에서도 error 를 만들지 않는다.
 */

import { collectWrongOptionExplanations, normalizeText } from "../../core";

interface LintField {
  name: string;
  text: string;
}

function collectLintFields(question: Record<string, unknown>): LintField[] {
  const fields: LintField[] = [];
  const explanation = normalizeText(question.explanation);
  if (explanation) fields.push({ name: "explanation", text: explanation });
  for (const [label, text] of collectWrongOptionExplanations(
    question.wrongOptionExplanations,
  )) {
    fields.push({ name: `wrongOptionExplanations(${label.toUpperCase()})`, text });
  }
  if (Array.isArray(question.keyPoints)) {
    question.keyPoints.forEach((point, index) => {
      const text = normalizeText(point);
      if (text) fields.push({ name: `keyPoints[${index + 1}]`, text });
    });
  }
  return fields;
}

// ── (a) 어투 혼용 ─────────────────────────────────────────────────────────────
// 합니다체 종결: '…니다' 뒤가 구두점/공백/닫는 인용/문자열 끝.
const HAPNIDA_ENDING_RE = /[가-힣]니다(?=[\s.,!?)"'”’…]|$)/;
// 해라체 종결(스펙 확정 3형): '-이다.' / '-한다.' / '-된다.' (닫는 인용 허용).
const HAERA_SENTENCE_ENDING_RE = /(?:이다|한다|된다)\s*[.!?]?["'”’]?\s*$/;

function firstSentenceOf(text: string): string {
  const match = /^[^.!?]*[.!?]/.exec(text);
  return (match ? match[0] : text).trim();
}

function findMixedSpeechLevel(text: string): string | null {
  const first = firstSentenceOf(text);
  if (!HAERA_SENTENCE_ENDING_RE.test(first)) return null;
  const rest = text.slice(text.indexOf(first) + first.length);
  if (!HAPNIDA_ENDING_RE.test(rest)) return null;
  return first.length > 60 ? `…${first.slice(-58)}` : first;
}

// ── (b) 수(數) 모순 ───────────────────────────────────────────────────────────
// "복수 명사인 a/an X" — 단, 'a few/a number of' 류 수량사 관용구는 복수 서술과
// 모순이 아니므로 제외.
const PLURAL_NOUN_WITH_ARTICLE_RE =
  /복수\s*명사인\s+['"‘“]?(an?)\s+([A-Za-z][A-Za-z'-]*)/;
const A_QUANTIFIER_HEADS = new Set([
  "few",
  "lot",
  "number",
  "couple",
  "dozen",
  "hundred",
  "thousand",
  "million",
  "variety",
  "range",
  "series",
  "group",
  "pair",
  "set",
  "list",
  "host",
  "handful",
  "majority",
  "total",
  "bit",
  "great",
  "good",
]);

// "단수 명사인 Xs" — 단수형인데 s 로 끝나는 상용어는 제외(오탐 방지).
const SINGULAR_NOUN_PLURAL_S_RE =
  /단수\s*명사인\s+['"‘“]?([A-Za-z][A-Za-z'-]*s)\b/;
const SINGULAR_S_SAFE_SUFFIX_RE = /(?:ss|us|is|ics)$/i;
const SINGULAR_S_SAFE_WORDS = new Set([
  "news",
  "means",
  "series",
  "species",
  "lens",
  "diabetes",
  "measles",
  "rabies",
  "headquarters",
  "summons",
  "whereabouts",
  "as",
  "is",
  "was",
  "has",
  "does",
  "its",
  "his",
  "this",
  "thus",
  "always",
  "perhaps",
]);

function findNumberContradiction(text: string): string | null {
  const pluralMatch = PLURAL_NOUN_WITH_ARTICLE_RE.exec(text);
  if (pluralMatch && !A_QUANTIFIER_HEADS.has(pluralMatch[2].toLowerCase())) {
    return `복수 명사인 ${pluralMatch[1]} ${pluralMatch[2]}`;
  }
  const singularMatch = SINGULAR_NOUN_PLURAL_S_RE.exec(text);
  if (singularMatch) {
    const word = singularMatch[1];
    if (
      !SINGULAR_S_SAFE_SUFFIX_RE.test(word) &&
      !SINGULAR_S_SAFE_WORDS.has(word.toLowerCase())
    ) {
      return `단수 명사인 ${word}`;
    }
  }
  return null;
}

// ── (c) keyPoints 라벨 중복 ───────────────────────────────────────────────────
function findDuplicateKeyPointLabel(keyPoints: unknown): string | null {
  if (!Array.isArray(keyPoints)) return null;
  const seen = new Set<string>();
  for (const point of keyPoints) {
    if (typeof point !== "string") continue;
    const match = /^\s*\(([A-Ja-j])\)/.exec(point);
    if (!match) continue;
    const label = match[1].toLowerCase();
    if (seen.has(label)) return label.toUpperCase();
    seen.add(label);
  }
  return null;
}

// ── (d) 한국어-영단어 붙임 오타 ───────────────────────────────────────────────
function blankOutBacktickSpans(text: string): string {
  return text.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
}

function findKoreanEnglishGlue(text: string): string | null {
  const scannable = blankOutBacktickSpans(text);
  // 뒤 한글은 룩어헤드로 소비하지 않아 연속 매치도 첫 건부터 잡는다.
  for (const match of scannable.matchAll(/[가-힣]([A-Za-z]{2,})(?=[가-힣])/g)) {
    const token = match[1];
    // 전부 대문자면 약어(TV·EBS·AI·PP) — 한글 붙임이 관행 표기라 제외.
    if (!/[a-z]/.test(token)) continue;
    if (match.index === undefined) continue;
    return scannable.slice(match.index, match.index + 1 + token.length + 1);
  }
  return null;
}

/**
 * GRAMMAR_ERROR 해설(explanation·wrongOptionExplanations·keyPoints)의 결정론
 * 파손을 수집한다. 반환값은 사람이 읽는 지적 메시지 배열 — 전부
 * 'grammar-explanation-lint' warning 하나의 코드로 발행된다(출하 비차단).
 */
export function collectGrammarExplanationLintFindings(
  question: Record<string, unknown>,
): string[] {
  const findings: string[] = [];

  for (const field of collectLintFields(question)) {
    const mixedTone = findMixedSpeechLevel(field.text);
    if (mixedTone) {
      findings.push(
        `${field.name}: 어투 혼용 — 첫 문장이 해라체("${mixedTone}")로 끝나는데 같은 필드에 합니다체 문장이 섞여 있습니다. 전체를 합니다체로 통일하세요.`,
      );
    }
    const numberContradiction = findNumberContradiction(field.text);
    if (numberContradiction) {
      findings.push(
        `${field.name}: 수 모순 — "${numberContradiction}"처럼 한국어 수 서술과 영어 표현의 단·복수가 어긋납니다. 실제 형태에 맞게 서술을 고치세요.`,
      );
    }
    const glued = findKoreanEnglishGlue(field.text);
    if (glued) {
      findings.push(
        `${field.name}: 한글-영단어 붙임 오타 — "${glued}"처럼 한글과 영단어 사이 공백이 빠져 있습니다. 영단어 앞뒤를 띄어 쓰세요.`,
      );
    }
  }

  const duplicateLabel = findDuplicateKeyPointLabel(question.keyPoints);
  if (duplicateLabel) {
    findings.push(
      `keyPoints: 라벨 중복 — (${duplicateLabel}) 라벨이 두 개 이상의 keyPoint 에 반복 사용되었습니다. 서로 다른 밑줄 라벨 3개로 재작성하세요.`,
    );
  }

  return findings.slice(0, 8);
}
