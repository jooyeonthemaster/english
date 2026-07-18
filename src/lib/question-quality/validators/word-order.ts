// WORD_ORDER 재구성 게이트 (wave1) — 제시 칩(scrambledWords)에서 선언된 미끼
// (wordBankDistractors)를 뺀 토큰 멀티셋이 modelAnswer 의 토큰을 전부 덮어야
// 학생이 정답 문장을 조립할 수 있다 (TSW 의 tsw-scrambled-reconstruct 와 동일
// 철학·정규화). "부족"만 결함으로 본다 — 잉여 칩은 프롬프트가 허용하는 미끼
// (INTERMEDIATE 0~1개·KILLER 포함)라 WORD_ORDER 스키마에 선언 필드가 없어도
// 정상이며, 미끼 누락과 구분이 불안정하므로 차단하지 않는다.
//
// T8(허용답안): acceptedAnswers 각 원소도 "제시 칩만으로 조립 가능한 등가 어순"이어야
// 한다(스키마/프롬프트 계약). modelAnswer 와 같은 자리에서 각 허용답이 modelAnswer 와
// **동일 토큰 멀티셋**(= (scrambledWords − wordBankDistractors) 로 과부족 0 조립)인지
// 결정론 검증하고, 아닌 항목은 error 로 차단한다(자동채점이 이 집합을 정확일치로 흡수
// → 칩으로 못 만드는 허용답은 오정답 흡수 위험).
import { QuestionQualitySeverity, normalizeComparableText, normalizeText } from "../core";



/** 정규화 토큰 — normalizeComparableText(소문자·공백 정규화) 후 단어/숫자 단위. */
export function wordOrderComparableTokens(value: string): string[] {
  const normalized = normalizeComparableText(value);
  if (!normalized) return [];
  return normalized.match(/[a-z]+(?:['-][a-z]+)*|\d+(?:[.,]\d+)*/g) ?? [];
}



/** 토큰 배열 → 멀티셋(토큰 → 개수). */
function toTokenMultiset(tokens: string[]): Map<string, number> {
  const multiset = new Map<string, number>();
  for (const token of tokens) {
    multiset.set(token, (multiset.get(token) ?? 0) + 1);
  }
  return multiset;
}



export function validateWordOrderReconstruction(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const modelAnswer = normalizeText(question.modelAnswer);
  const chips = Array.isArray(question.scrambledWords)
    ? question.scrambledWords.filter((chip): chip is string => typeof chip === "string")
    : [];
  if (!modelAnswer || chips.length === 0) return;

  const declaredDistractors = Array.isArray(question.wordBankDistractors)
    ? question.wordBankDistractors.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  const available = new Map<string, number>();
  for (const chip of chips) {
    for (const token of wordOrderComparableTokens(chip)) {
      available.set(token, (available.get(token) ?? 0) + 1);
    }
  }
  for (const distractor of declaredDistractors) {
    for (const token of wordOrderComparableTokens(distractor)) {
      const count = available.get(token) ?? 0;
      if (count > 0) available.set(token, count - 1);
    }
  }

  const modelTokens = wordOrderComparableTokens(modelAnswer);
  const missing: string[] = [];
  for (const token of modelTokens) {
    const count = available.get(token) ?? 0;
    if (count > 0) {
      available.set(token, count - 1);
    } else {
      missing.push(token);
    }
  }

  if (missing.length > 0) {
    add(
      "error",
      "word-order-unreconstructable",
      `WORD_ORDER chips cannot reassemble modelAnswer: token(s) ${[...new Set(missing)]
        .slice(0, 8)
        .map((token) => `"${token}"`)
        .join(", ")} are required by the answer but missing from scrambledWords (minus declared distractors). Split modelAnswer verbatim into the chips so every answer word is available.`,
    );
    // modelAnswer 자체가 조립 불가면 이미 정답 무효급으로 차단됐다 — 허용답 검증은
    // (깨진 modelAnswer 기준 비교라) 무의미하므로 여기서 종료한다.
    return;
  }

  // ── acceptedAnswers 결정형 조립 검증 (T8) ────────────────────────────────────
  // 각 허용답은 modelAnswer 와 **동일 토큰 멀티셋**이어야 한다 = 정답과 같은 칩을
  // 과부족 없이 그대로 재배열한 문장. modelAnswer 를 기준으로 삼으므로 미선언 미끼
  // (modelAnswer 부족검사가 관용하는 잉여 칩)에 강건하다 — 축약형(it's≠it is)·동의어
  // 치환·단어 누락/추가처럼 제시 칩으로 만들 수 없는 허용답을 결정론으로 골라낸다.
  const acceptedAnswers = Array.isArray(question.acceptedAnswers)
    ? question.acceptedAnswers.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (acceptedAnswers.length === 0) return;

  const modelMultiset = toTokenMultiset(modelTokens);
  for (const accepted of acceptedAnswers) {
    const acceptedTokens = wordOrderComparableTokens(accepted);
    if (acceptedTokens.length === 0) continue; // 빈/기호전용 원소는 무시(부재 취급)
    const acceptedMultiset = toTokenMultiset(acceptedTokens);

    const surplus: string[] = []; // 허용답엔 있는데 정답 칩엔 없거나 초과(과 — 없는 칩)
    const deficit: string[] = []; // 정답 칩엔 있는데 허용답이 덜 쓰는 토큰(부족 — 남는 칩)
    for (const token of new Set([...acceptedMultiset.keys(), ...modelMultiset.keys()])) {
      const inAccepted = acceptedMultiset.get(token) ?? 0;
      const inModel = modelMultiset.get(token) ?? 0;
      if (inAccepted > inModel) surplus.push(token);
      else if (inAccepted < inModel) deficit.push(token);
    }

    if (surplus.length > 0 || deficit.length > 0) {
      const detail: string[] = [];
      if (surplus.length > 0) {
        detail.push(
          `needs chip(s) not available: ${[...new Set(surplus)]
            .slice(0, 6)
            .map((token) => `"${token}"`)
            .join(", ")}`,
        );
      }
      if (deficit.length > 0) {
        detail.push(
          `leaves answer chip(s) unused: ${[...new Set(deficit)]
            .slice(0, 6)
            .map((token) => `"${token}"`)
            .join(", ")}`,
        );
      }
      add(
        "error",
        "word-order-accepted-unreconstructable",
        `WORD_ORDER acceptedAnswers entry "${accepted}" is not a pure rearrangement of the answer chips (${detail.join(
          "; ",
        )}). Every acceptedAnswers entry must use exactly the same chips as modelAnswer — no contraction merging two chips (it's vs it is), no substituted/added/dropped words. Drop the entry or fix the chips.`,
      );
    }
  }
}
