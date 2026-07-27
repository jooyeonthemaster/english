// ============================================================================
// 주제문 영작(TOPIC_SENTENCE_WRITING) 0원 스냅(자동 보정).
// 파일 분할 규약(500줄)에 따라 parser-topic-sentence-writing.ts 에서 분리
// (게이트가 gate-topic-sentence-writing.ts 로 분리된 것과 같은 규약).
//
// 파서는 관대하게 흡수하고, 스냅은 **저장될 형상**으로 결정론 보정하며, 게이트는
// 엄격하게 반려한다. 스냅이 버리거나 고친 것은 전부 corrections 로 남긴다 —
// 데이터를 조용히 버리지 않는다(규범 §1-B 철칙3).
// ============================================================================

import {
  reshuffleTopicSentenceWritingChips,
  chipsAreInAnswerOrder,
} from "@/lib/topic-sentence-writing";
import { normalizeWs } from "./parser";
import {
  sameTswTokenMultiset,
  synthesizeTswModelAnswer,
  tswBlankAnswerSequence,
  tswBuildableFromChips,
  tswWordTokens,
  type MdTswQuestion,
} from "./parser-topic-sentence-writing";
import type { TswMdShape } from "./prompts-topic-sentence-writing";

/** 타일링 탐색 예산 — 초과하면 그때까지의 최선해로 마감한다(0원 결정형 유지). */
const TILING_NODE_BUDGET = 60000;

/**
 * verbatim 어형에서 **미끼는 파생값이다**: 칩을 정답에 타일링하고 남는 것이 곧 미끼다.
 * `미끼:` 줄을 두 번째 진실원으로 받으면, 칩이 완벽한 문항이 줄 하나 누락만으로
 * "미끼 0개" + "미선언 잉여 재료" 두 건 동시 반려된다(§1-B 철칙1 — 반의어가 정확히
 * 이 구조로 실사용 2연속 반려됐다). 파생값은 **칩 원문 문자열**이라 런타임 정확일치
 * (mergeChipsWithDistractors)와도 어긋나지 않는다.
 *
 * ⚠ 회귀 처방: 종전에는 "긴 칩부터" 그리디라 exact-cover 가 아니었다. 청크 미끼가
 * 정답 토큰의 **부분집합**이면(프롬프트가 요구하는 '실제로 경쟁하는' 미끼가 정확히 그
 * 모양이다) 그 미끼를 먼저 소비해 버려 타일링이 실패하고, 결함 0인 문항이 모델의 셔플
 * 순서에 따라 반려됐다 — 같은 문항이 칩 나열 순서만 바뀌면 판정이 갈리는 비결정성.
 * 실측: 정답 `strict hygiene and sustained stewardship of shared tools` · 미끼
 * `strict stewardship` 을 앞에 두면 2건 반려, 뒤에 두면 0건.
 * 지금은 **백트래킹 exact-cover** 라 칩 순서와 무관하다.
 *
 * `expectedSpare` 를 주면 남는 칩 개수가 그 값인 해를 우선한다. 잉여 토큰 총량은
 * 고정이지만 **칩 개수**는 덮는 방식에 따라 달라지므로(같은 칩 구성에 해가 여럿),
 * 설정과 맞는 해석이 있으면 그쪽을 택한다 — 어느 해석이든 칩 구성과 모순되지 않으므로
 * 결함을 가리지 않는다(개수가 진짜로 안 맞으면 어떤 해도 맞지 않아 게이트가 반려한다).
 *
 * 과부족 없이 덮는 조합이 하나도 없으면 `null` — 게이트가 부족·잉여 토큰을 지목한다.
 */
export function deriveTswVerbatimDistractors(
  chips: string[],
  answer: string,
  expectedSpare?: number,
): string[] | null {
  const need = new Map<string, number>();
  for (const token of tswWordTokens(answer)) {
    need.set(token, (need.get(token) ?? 0) + 1);
  }
  let demand = 0;
  for (const count of need.values()) demand += count;
  if (demand === 0) return null;

  // 정답 토큰을 초과 보유한 칩은 어떤 해에서도 쓰일 수 없다 — 탐색 밖으로 먼저 뺀다.
  const forcedSpare: number[] = [];
  const candidates: { index: number; tokens: string[] }[] = [];
  for (let i = 0; i < chips.length; i += 1) {
    const tokens = tswWordTokens(chips[i]);
    const own = new Map<string, number>();
    for (const token of tokens) own.set(token, (own.get(token) ?? 0) + 1);
    let fits = tokens.length > 0;
    for (const [token, count] of own) {
      if ((need.get(token) ?? 0) < count) {
        fits = false;
        break;
      }
    }
    if (fits) candidates.push({ index: i, tokens });
    else forcedSpare.push(i);
  }
  // 큰 칩부터 — 남은 토큰 수 가지치기가 빨리 걸린다.
  candidates.sort((a, b) => b.tokens.length - a.tokens.length || a.index - b.index);
  const suffix = new Array<number>(candidates.length + 1).fill(0);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    suffix[i] = suffix[i + 1] + candidates[i].tokens.length;
  }

  const remain = new Map(need);
  const used = new Array<boolean>(candidates.length).fill(false);
  let best: string[] | null = null;
  let nodes = 0;
  let done = false;

  const record = (): void => {
    const spare = [...forcedSpare];
    for (let i = 0; i < candidates.length; i += 1) {
      if (!used[i]) spare.push(candidates[i].index);
    }
    spare.sort((a, b) => a - b);
    if (best === null || spare.length === expectedSpare) {
      best = spare.map((index) => chips[index]);
    }
    if (expectedSpare === undefined || spare.length === expectedSpare) done = true;
  };

  const walk = (at: number, left: number): void => {
    if (done) return;
    if (left === 0) {
      record();
      return;
    }
    if (at >= candidates.length || left > suffix[at]) return;
    nodes += 1;
    if (nodes > TILING_NODE_BUDGET) {
      done = true;
      return;
    }
    const { tokens } = candidates[at];
    let taken = 0;
    let usable = true;
    for (; taken < tokens.length; taken += 1) {
      const have = remain.get(tokens[taken]) ?? 0;
      if (have <= 0) {
        usable = false;
        break;
      }
      remain.set(tokens[taken], have - 1);
    }
    if (usable) {
      used[at] = true;
      walk(at + 1, left - tokens.length);
      used[at] = false;
    }
    for (let j = taken - 1; j >= 0; j -= 1) {
      remain.set(tokens[j], (remain.get(tokens[j]) ?? 0) + 1);
    }
    walk(at + 1, left);
  };

  walk(0, demand);
  return best;
}

/** 재료(칩)가 실제로 공급하는 구두점 문자 집합. */
function chipPunctuation(chips: string[]): Set<string> {
  const out = new Set<string>();
  for (const chip of chips) {
    for (const ch of chip) {
      if (/[^\p{L}\p{N}\s]/u.test(ch)) out.add(ch);
    }
  }
  return out;
}

/**
 * 칩이 공급하지 못하는 **내부** 구두점을 걷어낸 동치 표면. 채점 normalizeText 는
 * **문말** 구두점만 떼므로(exam-scoring/normalize.ts:93) 정답 안쪽 쉼표·세미콜론을
 * 어느 칩도 들고 있지 않으면, 칩을 완벽히 배열한 학생이 영원히 오답 처리된다
 * (만점이 구조적으로 불가능한 문항). 그 답안을 흡수할 표면을 파생해 허용답에 싣는다.
 *
 * 안전 가드: 단어 사이를 잇는 부호(하이픈·아포스트로피)는 보존하고, 토큰 멀티셋이
 * 바뀌면 파생을 포기한다 — 어순·어휘가 다른 오답은 절대 흡수할 수 없다.
 */
export function tswPunctuationRelaxedForm(answer: string, chips: string[]): string {
  const supplied = chipPunctuation(chips);
  const trimmed = answer.replace(/[.,!?;:]+\s*$/, "");
  const tail = answer.slice(trimmed.length);
  const wordChar = (ch: string | undefined) => Boolean(ch) && /[\p{L}\p{N}]/u.test(ch!);
  let body = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    const punctuation = /[^\p{L}\p{N}\s]/u.test(ch);
    if (!punctuation || supplied.has(ch)) body += ch;
    else if (wordChar(trimmed[i - 1]) && wordChar(trimmed[i + 1])) body += ch;
  }
  const out = `${body}${tail}`.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  return out &&
    normalizeWs(out) !== normalizeWs(answer) &&
    sameTswTokenMultiset(out, answer)
    ? out
    : "";
}

/**
 * 0원 자동 보정. 게이트 반려 주계통을 먼저 흡수한다.
 *
 * ⚠ 핵심(위험 #1): fast 레인은 생성 직후 reshuffleTopicSentenceWritingChips 로 칩을
 * 결정론 재배열하는데(run-question-generation.ts:1046-1052) md-stream 라우트에는 그
 * 단계가 없다. 여기서 **같은 함수를 호출**해 파싱 결과에 미리 반영해 두면, 게이트가
 * "최종 저장될 칩 순서"를 검사하게 되고 어댑터의 재호출은 멱등 no-op 이 된다.
 *
 * ⚠ 위험 #2(허용답 오염 = 오답 흡수): 동치·허용답은 반려하지 않고 **절삭**한다.
 * 반려하면 멀쩡한 문항이 통째로 죽고, 그대로 두면 오답이 만점으로 흡수된다.
 * 버린 것은 반드시 corrections 로 남긴다(데이터를 조용히 버리지 않는다 — 철칙3).
 */
export function autoSnapTopicSentenceWriting(
  q: MdTswQuestion,
  shape: TswMdShape,
): { question: MdTswQuestion; corrections: string[] } {
  const corrections: string[] = [];
  let hint = q.hint;
  let blanks = q.blanks;
  let acceptedVariants = q.acceptedVariants;

  // `방식:` 은 설정 상수의 에코라 정보량 0이다 — 어긋나도 **반려하지 않고 기록만** 한다
  // (§1-B 철칙1. 모드 위반의 실제 검출기는 모드 XOR 게이트다).
  if (q.declaredMode && q.declaredMode !== q.mode) {
    corrections.push(
      `\`방식:\` 줄이 '${q.declaredMode}' 로 왔으나 모드의 진실원은 설정('${q.mode}') — 무시하고 기록만 남김`,
    );
  }

  // 라벨 혼용 흡수 기록 — 파싱은 이미 흡수했으므로 사실 기록만 남긴다.
  if (q.mode === "scrambled" && !q.sawChipLabel && q.sawBankLabel && q.chips.length > 0) {
    corrections.push("`보기:` 로 온 배열 재료를 `칩:` 으로 흡수");
  }
  if (q.mode === "cloze" && !q.sawBankLabel && q.sawChipLabel && q.chips.length > 0) {
    corrections.push("`칩:` 으로 온 보기 재료를 `보기:` 로 흡수");
  }

  // 힌트 설정 정합 — hintEnabled=false 면 발문에 "[주제 힌트]를 참고하여"가 없다.
  // 힌트를 남기면 발문에 없는 박스가 학생 화면에 뜬다(발문-실물 불일치 실측 결함).
  if (!shape.hintEnabled && hint) {
    corrections.push(`힌트 미사용 설정이라 [주제 힌트] 줄을 버림: '${hint.slice(0, 40)}'`);
    hint = "";
  }

  let modelAnswer = q.modelAnswer;
  if (q.mode === "cloze") {
    modelAnswer = synthesizeTswModelAnswer(q.topic, blanks);
    if (
      q.strayModelAnswer &&
      normalizeWs(q.strayModelAnswer) !== normalizeWs(modelAnswer)
    ) {
      corrections.push(
        "모범답안 줄은 계약 밖이라 무시하고 주제문 치환 합성본을 채택(빈칸 정답이 유일 진실원)",
      );
    }
    // 동치 절삭 — 보기 칩으로 조립 불가하거나 정답과 같은 것은 오답 흡수 위험.
    blanks = blanks.map((blank) => {
      const kept: string[] = [];
      for (const variant of blank.variants) {
        if (normalizeWs(variant).toLowerCase() === normalizeWs(blank.answer).toLowerCase()) {
          corrections.push(`${blank.label} 동치 중 정답과 동일한 항목 제거: '${variant}'`);
          continue;
        }
        if (!tswBuildableFromChips(q.chips, variant)) {
          corrections.push(
            `${blank.label} 동치 '${variant}' 는 보기 칩으로 조립 불가 — 오답 흡수 방지로 제거`,
          );
          continue;
        }
        kept.push(variant);
      }
      // 칩이 공급 못 하는 내부 구두점을 뺀 표면을 동치로 실어, [보기]만으로 조립한
      // 최선 답안이 쉼표 하나 때문에 부분점수로 깎이는 구조를 없앤다(만점 불가 결함).
      const relaxed = tswPunctuationRelaxedForm(blank.answer, q.chips);
      if (
        relaxed &&
        !kept.some((v) => normalizeWs(v).toLowerCase() === normalizeWs(relaxed).toLowerCase())
      ) {
        corrections.push(
          `${blank.label} 정답의 내부 구두점을 어느 보기 칩도 공급하지 않아 구두점 제거형을 동치로 추가: '${relaxed.slice(0, 60)}'`,
        );
        kept.push(relaxed);
      }
      return { ...blank, variants: kept };
    });
  } else {
    // scrambled 는 `주제문:` 줄이 곧 모범답안이다(별도 모범답안 줄은 계약 밖).
    // 라벨만 다르게 온 값을 파서가 흡수했거나, 두 줄이 어긋난 사실을 기록으로 남긴다.
    if (q.strayModelAnswer) {
      if (!q.sawTopicLabel) {
        corrections.push(
          `\`모범답안:\` 줄로 온 값을 \`주제문:\`(= 모범답안)으로 흡수: '${modelAnswer.slice(0, 50)}'`,
        );
      } else if (normalizeWs(q.strayModelAnswer) !== normalizeWs(modelAnswer)) {
        corrections.push(
          "모범답안 줄은 계약 밖이라 무시하고 `주제문:` 줄을 채택(scrambled 의 유일 진실원)",
        );
      }
    }
    // 허용답 절삭 — 같은 칩으로 조립되지 않는 문장은 학생이 만들 수 없는 답이다.
    const kept: string[] = [];
    for (const variant of acceptedVariants) {
      if (normalizeWs(variant).toLowerCase() === normalizeWs(modelAnswer).toLowerCase()) {
        continue; // modelAnswer 자신은 채점이 항상 포함한다(중복 제거)
      }
      if (!sameTswTokenMultiset(variant, modelAnswer)) {
        corrections.push(
          `허용답 '${variant.slice(0, 60)}' 가 모범답안과 토큰 구성이 달라 제거(같은 칩으로 만들 수 없는 답)`,
        );
        continue;
      }
      kept.push(variant);
    }
    // 칩이 공급 못 하는 내부 구두점(쉼표·세미콜론)이 정답에 있으면, 칩을 완벽히 배열한
    // 답안이 영원히 불일치한다 — 채점 normalizeText 는 문말 부호만 뗀다. 그 답안을
    // 흡수할 표면을 허용답에 싣는다(토큰 멀티셋 동일이라 오답은 흡수하지 못한다).
    const relaxed = tswPunctuationRelaxedForm(modelAnswer, q.chips);
    if (
      relaxed &&
      !kept.some((v) => normalizeWs(v).toLowerCase() === normalizeWs(relaxed).toLowerCase())
    ) {
      corrections.push(
        `모범답안의 내부 구두점을 어느 칩도 공급하지 않아 구두점 제거형을 허용답에 추가: '${relaxed.slice(0, 60)}'`,
      );
      kept.push(relaxed);
    }
    acceptedVariants = kept;
  }

  // 미끼 진실원 확정 — verbatim 배열은 칩 타일링에서 **파생**하고(중복 계약 소멸),
  // 그 외에는 선언값을 받되 매칭된 **칩 원문 문자열로 치환**한다. 게이트는 미끼↔칩을
  // normalizeWs+소문자로 느슨히 비교하는데 런타임 학생 표면(mergeChipsWithDistractors)
  // 은 정확일치라, 대소문자·곡선따옴표 차이 하나로 칩이 하나 더 늘고 **칩 전체가
  // 알파벳으로 재정렬**돼 인쇄본과 온라인이 서로 다른 문항이 된다.
  let distractors = q.distractors;
  let distractorsDerived = false;
  // 퇴화 입력(주제문 누락·한국어 정답·칩 0개)에서는 파생하지 않는다 — 파생하면 칩 전부가
  // "잉여 재료"로 잡혀 진짜 원인(주제문 누락)을 가리는 엉뚱한 반려 사유가 붙는다.
  const derivable =
    q.mode === "scrambled" &&
    shape.fidelity === "verbatim" &&
    q.chips.length > 0 &&
    tswWordTokens(modelAnswer).length > 0;
  const derived = derivable
    ? deriveTswVerbatimDistractors(q.chips, modelAnswer, shape.distractors)
    : null;
  if (derived !== null) {
    distractorsDerived = true;
    const before = q.distractors.join(" / ");
    if (before !== derived.join(" / ")) {
      corrections.push(
        `미끼는 칩 타일링에서 파생 확정(선언값 '${before || "없음"}' → '${derived.join(" / ") || "없음"}') — \`미끼:\` 줄은 중복 계약이라 진실원이 아니다`,
      );
    }
    distractors = derived;
  } else {
    // 파생 시도가 실패했다는 사실 자체를 남긴다 — 종전에는 아무 흔적도 없이 선언 경로로
    // 떨어져, 게이트가 "미끼 0개"라는 **사실과 다른 원인**을 지목하고 그 문구가 그대로
    // 재생성 피드백이 됐다(§1-B 철칙3 — 데이터를 조용히 버리지 않는다).
    if (derivable) {
      corrections.push(
        `미끼 파생 실패 — 칩 ${q.chips.length}개로 정답 ${tswWordTokens(modelAnswer).length}토큰을 과부족 없이 덮는 조합이 없다(정답에 일부만 쓰이는 칩이 있다). 게이트가 부족·잉여 토큰을 지목한다`,
      );
    }
    distractors = q.distractors.map((raw) => {
      if (q.chips.includes(raw)) return raw;
      const key = normalizeWs(raw).toLowerCase();
      const chip = q.chips.find((c) => normalizeWs(c).toLowerCase() === key);
      if (!chip) return raw;
      corrections.push(
        `미끼 '${raw}' 를 칩 원문 '${chip}' 으로 정합 — 런타임은 정확일치라 표기가 다르면 칩이 중복되고 전체가 재정렬된다`,
      );
      return chip;
    });
  }

  // 칩 결정론 재배열 — fast 레인과 동일 변환. 정답 어순으로 읽히던 경우만 기록한다
  // (그 외의 재배열은 정보 손실이 없는 순열이라 잡음만 늘린다).
  const reference =
    q.mode === "cloze" ? tswBlankAnswerSequence(blanks) || modelAnswer : modelAnswer;
  const leaked =
    q.chips.length > 1 &&
    Boolean(reference) &&
    (q.chips.join(" ") === modelAnswer || chipsAreInAnswerOrder(q.chips, reference));
  const reshuffled = reshuffleTopicSentenceWritingChips({
    modelAnswer,
    ...(q.mode === "scrambled"
      ? { scrambledWords: q.chips }
      : { wordBank: q.chips, blanks }),
  }) as { scrambledWords?: string[]; wordBank?: string[] };
  const chips =
    (q.mode === "scrambled" ? reshuffled.scrambledWords : reshuffled.wordBank) ?? q.chips;
  if (leaked) {
    corrections.push("칩 나열이 정답 어순으로 읽혀 결정론 재배열로 떼어 놓음");
  }

  return {
    question: {
      ...q,
      hint,
      blanks,
      modelAnswer,
      acceptedVariants,
      chips,
      distractors,
      distractorsDerived,
    },
    corrections,
  };
}
