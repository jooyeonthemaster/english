// 빈칸 span 경계 선택 결함 검출 (2026-07-17 프로덕션 전수감사 O164에서 규명된 클래스).
// passageWithBlank 는 서버가 원지문을 splice 해 만들므로(question-postprocess/blank-inference)
// 빈칸 밖 텍스트 훼손은 구조적으로 없다 — 남는 결함 축은 "어떤 span 을 골랐는가"뿐이다.
// 여기서는 관찰된 두 붕괴 클래스를 결정형으로 차단한다:
//   (1) 문장 전체를 통째로 빈칸화 → "…Singapore. _____. That was…" 고아 문장 파편 (J012)
//   (2) 콤마 삽입구 경계를 가로지르는 절단 → "…success, _____." 고아 콤마 비문 (J001)
import { splitBlankSurface } from "./seam";

export interface BlankSpanCarveFinding {
  code:
    | "blank-span-full-sentence"
    | "blank-span-clause-carve"
    | "blank-span-sentence-swallow"
    | "blank-trailing-dependent";
  message: string;
  evidence: Record<string, unknown>;
}

const SENTENCE_SPLIT = /(?<=[.!?]["'”’]?)\s+/;
const OPENING_WRAPPERS = /^[\s"'“‘(\[]*$/;

// 절단(R2)은 빈칸 앞 조각이 "술부를 기다리는 주어 NP"로 시작할 때만 비문이 된다.
// 문두 부사구/담화표지/종속절("After all,", "Surprisingly,", "Over the past decade,",
// "When X,")가 콤마로 닫힌 경우는 나머지 전체를 빈칸화해도 정문이다 — FP 스캔(2.8%)에서
// 관찰된 오탐 4건이 전부 이 패턴이었다. 한정사/대명사류 주어 신호로 화이트리스트 판정한다.
const SUBJECT_NP_START =
  /^(?:the|a|an|this|that|these|those|it|he|she|they|we|you|i|his|her|their|our|its|my|your|one|each|every|all|most|many|some|no|both|several|such)\b/i;

/** 빈칸이 속한 문장에서 빈칸 앞/뒤 조각을 얻는다. */
function sentenceParts(left: string, right: string): { before: string; after: string } {
  const leftChunks = left.split(SENTENCE_SPLIT);
  const before = leftChunks[leftChunks.length - 1] ?? "";
  const terminatorIdx = right.search(/[.!?]/);
  const after = terminatorIdx === -1 ? right : right.slice(0, terminatorIdx + 1);
  return { before, after };
}

export function findBlankSpanCarveIssues(
  passageWithBlank: string | undefined,
  originalExpression: string | undefined,
  correctOptionText?: string,
): BlankSpanCarveFinding[] {
  if (!passageWithBlank) return [];
  const { left, right, blankCount } = splitBlankSurface(passageWithBlank);
  if (blankCount !== 1) return [];
  const { before, after } = sentenceParts(left, right);
  const findings: BlankSpanCarveFinding[] = [];

  // (1) 문장 전체 빈칸 + 술부형 선지: 빈칸이 문장을 열고(앞이 비어 있거나 여는
  //     인용부호뿐) 직후가 곧바로 문장 종결부호인데, 정답 선지가 소문자 술부로
  //     시작하면 "_____." 자리가 고아 문장 파편이 된다 (J012). 선지가 대문자로
  //     시작하는 완전문이면 문장 빈칸 자체는 기능하므로 차단하지 않는다 —
  //     FP 스캔에서 기수락 문장형 빈칸 5/500 이 이 케이스였다.
  const startsSentence = OPENING_WRAPPERS.test(before);
  const endsSentenceImmediately = /^[\s"'”’)\]]*[.!?]/.test(right);
  const correctStartsLowercase = /^[a-z]/.test((correctOptionText ?? "").trim());
  if (startsSentence && endsSentenceImmediately && correctStartsLowercase) {
    findings.push({
      code: "blank-span-full-sentence",
      message:
        "The blank replaces an entire sentence while the options are lowercase predicates, leaving an orphaned sentence fragment. Choose a span INSIDE a sentence (keep the sentence frame such as its subject), or do not blank a whole sentence.",
      evidence: {
        before: before.slice(-60),
        after: after.slice(0, 60),
        correctOption: (correctOptionText ?? "").slice(0, 80),
      },
    });
  }

  // (2) 삽입구 절단: 빈칸이 콤마 직후에서 시작하는데 잘려나간 span 자체가 콤마를
  //     포함한다 → 삽입구의 닫는 경계와 본동사부를 함께 삼켜 "주어, _____." 비문.
  const beforeEndsWithComma = /,\s*$/.test(before);
  const spanCrossesComma = (originalExpression ?? "").includes(",");
  const beforeIsSubjectNp = SUBJECT_NP_START.test(before.trim());
  if (!startsSentence && beforeEndsWithComma && spanCrossesComma && beforeIsSubjectNp) {
    findings.push({
      code: "blank-span-clause-carve",
      message:
        "The blank starts right after a comma and the removed span itself crosses a comma boundary, carving through a parenthetical and leaving an orphaned comma. Blank a span that stays within one clause: either the full predicate INCLUDING the parenthetical, or a span that does not cross comma boundaries.",
      evidence: {
        before: before.slice(-60),
        originalExpression: (originalExpression ?? "").slice(0, 120),
      },
    });
  }

  return findings;
}

// ── O201 S3i 이식분 (실험 게이트 FULL_SENTENCE_SWALLOW·TRAILING_DEPENDENT) ────
// 공백 정규화는 core 단일 소스(normalizeText)를 재사용 — 로컬 사본이 core 의
// 향후 보강(NBSP 등)과 어긋나 오염 지문에서 침묵 미발화하는 것을 막는다.

import { normalizeText as WS_NORM } from "../../core";

/**
 * 문장삼킴 비율 게이트 (S3i FULL_SENTENCE_SWALLOW): 원문에서 스팬이 속한 문장을
 * 찾아 스팬이 그 문장의 88% 이상을 차지하면 사실상 문장 전체 빈칸 — 고아 파편
 * 위험 + "문장 통째 삼키기 금지" 계약(R1) 위반. 기존 blank-span-full-sentence
 * (빈칸이 문장을 열고+직후 종결+소문자 술부 선지의 좁은 케이스)보다 넓은 결정형
 * 커버리지다. O201 확증런에서 프리미엄 계약과 함께 3중 재현된 스펙 그대로.
 */
export function findBlankSentenceSwallowIssue(
  passage: string | undefined,
  originalExpression: string | undefined,
): BlankSpanCarveFinding | null {
  const oe = WS_NORM(originalExpression ?? "");
  const pnorm = WS_NORM(passage ?? "");
  if (!oe || !pnorm || !pnorm.includes(oe)) return null;
  const sentences = pnorm.split(/(?<=[.!?])\s+/);
  const host = sentences.find((sentence) => sentence.includes(oe));
  if (!host || oe.length < host.length * 0.88) return null;
  return {
    code: "blank-span-sentence-swallow",
    message:
      "The blanked span swallows (almost) the entire host sentence. Blank a phrase/clause-level span inside the sentence — keep the sentence frame (its subject or predicate anchor) visible.",
    evidence: {
      hostSentence: host.slice(0, 160),
      originalExpression: oe.slice(0, 120),
      ratio: Number((oe.length / host.length).toFixed(2)),
    },
  };
}

// 빈칸 직후 의존 잔여 구문 — 빈칸 내용에 문법적으로 의존하는 등위/관계 구문이
// 바로 뒤에 남으면 선행사 고아·비문 결합 위험이 있다. S3i R2 계약의 결정형 짝.
// ⚠ 리뷰 실측 판정(26-07-20): ", which"·", nor" 류는 빈칸 앞 명사/절을 선행사로
// 취하는 정문 케이스(문장 관계절·전방 부가)가 실존해 결정형으로 확정 불가 —
// 이 게이트는 "경고"로만 발화하고(차단 아님), 확정 판정은 통합 검수리 콜의
// 축⑤(절단 건전성 — 전체 문맥 재파싱)가 담당한다.
const TRAILING_DEPENDENT_AFTER_BLANK =
  /^\s*,?\s*(?:nor\b|which\b|behind which\b|in which\b|whom\b|and neither\b)/i;

export function findBlankTrailingDependentIssue(
  passageWithBlank: string | undefined,
): BlankSpanCarveFinding | null {
  if (!passageWithBlank) return null;
  const { right, blankCount } = splitBlankSurface(passageWithBlank);
  if (blankCount !== 1) return null;
  if (!TRAILING_DEPENDENT_AFTER_BLANK.test(right)) return null;
  return {
    code: "blank-trailing-dependent",
    message:
      'A dependent-looking remnant (", nor …", ", which …", "in which …", "whom …") immediately follows the blank. Verify it does not depend on the removed span (orphaned antecedent) — include the tail in the span or move the blank if it does.',
    evidence: {
      after: right.slice(0, 60),
    },
  };
}
