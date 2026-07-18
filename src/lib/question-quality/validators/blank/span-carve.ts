// 빈칸 span 경계 선택 결함 검출 (2026-07-17 프로덕션 전수감사 O164에서 규명된 클래스).
// passageWithBlank 는 서버가 원지문을 splice 해 만들므로(question-postprocess/blank-inference)
// 빈칸 밖 텍스트 훼손은 구조적으로 없다 — 남는 결함 축은 "어떤 span 을 골랐는가"뿐이다.
// 여기서는 관찰된 두 붕괴 클래스를 결정형으로 차단한다:
//   (1) 문장 전체를 통째로 빈칸화 → "…Singapore. _____. That was…" 고아 문장 파편 (J012)
//   (2) 콤마 삽입구 경계를 가로지르는 절단 → "…success, _____." 고아 콤마 비문 (J001)
import { splitBlankSurface } from "./seam";

export interface BlankSpanCarveFinding {
  code: "blank-span-full-sentence" | "blank-span-clause-carve";
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
