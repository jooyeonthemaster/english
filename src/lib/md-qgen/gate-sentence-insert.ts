// ============================================================================
// 문장 삽입(SENTENCE_INSERT) 0원 결정형 게이트 — LLM 콜 없음(정규식·문자열 비교만).
// parser-sentence-insert.ts 에서 분리(파일 500줄 규약). 의존 방향은
// 이 파일 → parser-sentence-insert 단방향이다.
//
// 이 유형의 fast 레인은 "서버가 유사도로 추정해 뒤늦게 봉합"하는 구조였다
// (processSentenceInsert 의 findSourceSentenceToOmit 0.72 임계 · 정답 재키잉 ·
//  answer-leak 가드). md 는 그 추정을 **결정형 대조**로 바꾼다 —
//   번호지문에서 마커를 걷어내고 정답 자리에 삽입문장을 되돌리면 원 지문과 동일.
// 이 한 검사가 지어낸 문장·무단 편집·정답 오지정을 한꺼번에 잡는다.
//
// ⚠ 후처리(processSentenceInsert)는 **하드 실패**하는 분기가 여럿이라(첫 문장 추출·
//   정답 자리 마커 부재·정답 누출) 게이트에서 못 막으면 어댑터 이후 단계에서 잡이
//   죽는다. 그 세 분기를 전부 여기서 선반영해 재생성 기회를 준다.
// ⚠ fast 검증기(validators/sentence-insert.ts)의 error 코드 중 결정형인 것
//   (neutral-given · answer-desync · omitted-source-visible)도 게이트로 승격 이식했다 —
//   md 라우트는 검증기 결과를 차단하지 않고 기록만 하기 때문이다.
// ============================================================================

import { countDisplaySentences, countWords } from "@/lib/question-quality/core";
import {
  longestCommonTokenRun,
  sentenceInsertHasCohesiveCue,
  sentenceInsertSentenceSimilarity,
} from "@/lib/question-quality/validators/sentence-insert";
import { normalizeWs } from "./parser";
import {
  INSERT_CIRCLED,
  computeInsertLayout,
  foldForInsertMatch,
  insertMarkerOrdinal,
  type MdInsertLayout,
  type MdInsertQuestion,
} from "./parser-sentence-insert";

// ── 정답 누출 판정축 ─────────────────────────────────────────────────────────
// 후처리(processors/sentence-insert.ts)와 fast 검증기(validators/sentence-insert.ts)는
// 같은 이름의 검사를 **서로 다른 유사도 함수**로 한다(스톱워드 목록·토큰 최소길이가
// 다르다). 게이트가 한쪽 함수로 다른 쪽 임계(0.85)만 베끼면 "게이트 클린 → 후처리
// 하드 실패" 밴드가 생긴다 — 라우트의 1회 재생성은 gateIssues 에만 걸려 있으므로 그
// 실패에는 재생성이 없고, 모델 콜 1회를 소진한 채 '후처리 실패:…' 로 잡이 죽는다.
// 실측 쌍: validators 0.750 / 후처리 0.857(≥0.85 하드 실패).
// → 두 함수를 모두 계산해 **큰 값**을 쓰고, 임계는 두 하류(후처리 answer-leak 0.85 ·
//   validators omitted-source-visible 0.72) 중 낮은 쪽으로 내려 항상 보수적이 되게 한다.
const GIVEN_LEAK_THRESHOLD = 0.72;

/** processors/sentence-insert.ts 의 stop 목록(:322-349) 등가 복제. */
const POSTPROCESS_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "for", "from",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was",
  "were", "with",
]);

/** processors 의 normalizeComparableSentence(:312-319) 등가. */
function postProcessNormalize(value: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[.,!?;:]+$/g, "")
    .toLowerCase();
}

/** processors 의 contentTokens(:321-353) 등가 — 최소 길이 3 · 자체 스톱워드. */
function postProcessContentTokens(value: string): string[] {
  return (value.match(/[a-z][a-z'-]*/gi) ?? [])
    .map((token) => token.toLowerCase().replace(/^'+|'+$/g, ""))
    .filter((token) => token.length >= 3 && !POSTPROCESS_STOP_WORDS.has(token));
}

/**
 * processors/sentence-insert.ts 의 sentenceSimilarityScore(:275-292) 등가 복제.
 * 레이어 규칙상 후처리 내부 함수를 import 할 수 없으므로(export 도 안 돼 있다)
 * 계산을 그대로 옮겨 **후처리와 같은 축**으로 판정한다.
 */
function postProcessSentenceSimilarity(a: string, b: string): number {
  const na = postProcessNormalize(a);
  const nb = postProcessNormalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length >= 45 && nb.includes(na)) return 0.95;
  if (nb.length >= 45 && na.includes(nb)) return 0.95;
  const ta = postProcessContentTokens(na);
  const tb = postProcessContentTokens(nb);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const overlap = ta.filter((token) => setB.has(token)).length;
  const denom = Math.max(1, Math.min(ta.length, tb.length));
  const containment = overlap / denom;
  const jaccard = overlap / Math.max(1, new Set([...ta, ...tb]).size);
  const sequence = longestCommonTokenRun(ta, tb) / denom;
  return Math.max(containment, jaccard * 1.25, sequence);
}

/** 두 하류 판정축 중 큰 값 — 어느 쪽 하드 실패도 게이트가 먼저 잡는다. */
function insertLeakSimilarity(a: string, b: string): number {
  return Math.max(
    sentenceInsertSentenceSimilarity(a, b),
    postProcessSentenceSimilarity(a, b),
  );
}
/** 변형본 분량 허용 대역 — 같은 문장을 다시 쓰는 것이므로 좁게 잡는다. */
const VARIANT_WORD_RATIO: [number, number] = [0.6, 1.6];
/** 변형본이 보존해야 할 축자 꼬리 비중(앞부분만 재진술한다는 계약의 기계 판정축). */
const VARIANT_TAIL_RATIO = 0.25;

// 응집 단서 두 축 — 변형본이 "자리를 결정하는 단서"를 지웠는지 판정한다.
// validators/sentence-insert.ts:7-20 의 사전을 축별로 갈라 복제했다(그 함수는
// 두 축을 OR 로 합쳐 반환해 어느 축이 사라졌는지 알 수 없다).
const INSERT_ANAPHORA_RE =
  /\b(this|that|these|those|such|it|its|they|them|their|he|she|his|her|him)\b/i;
// ⚠ but/still/though/while/whereas/rather 는 validators 사전에 없어 대조 전환이
//   통째로 사라져도 연결사 소실 분기가 발화하지 않았다(few-shot 예문이 정확히 But 으로
//   시작한다). 이 사전은 **변형 접두부 대조 전용**이라 넓힐수록 보수적이 된다.
const INSERT_CONNECTIVE_RE =
  /\b(however|yet|but|still|though|although|while|whereas|rather|instead|nevertheless|nonetheless|therefore|thus|hence|consequently|for example|for instance|moreover|furthermore|in addition|besides|also|then|later|subsequently|afterwards?|meanwhile|on the contrary|in contrast|by contrast|similarly|likewise|as a result)\b/i;

const trunc = (s: string, n = 60): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

const markerName = (ordinal: number): string => `[[${ordinal + 1}]]`;

function insertFoldTokens(text: string): string[] {
  const folded = foldForInsertMatch(text);
  return folded ? folded.split(" ") : [];
}

/** 뒤에서부터 같은 토큰이 몇 개나 이어지는가 — "앞부분만 바꿨는가"의 판정축. */
function commonSuffixTokens(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) {
    n += 1;
  }
  return n;
}

/**
 * 변형본(`삽입문장(변형):`) 전용 검사 — 축자 줄 검사는 전부 그대로 돈다.
 * 실제로 달라졌는가 · 앞부분만 바꿨는가 · 자리를 결정하는 단서가 살아 있는가 ·
 * 분량/문장 수 유지 · 지문 다른 구간 복사 금지.
 */
function givenVariantIssues(q: MdInsertQuestion, passage: string): string[] {
  const v: string[] = [];
  const key = "삽입문장 변형본";
  const src = q.given;
  const variant = q.givenVariant;
  if (!src) return v; // 축자 결손은 상위 검사가 이미 말한다.

  if (normalizeWs(variant) === normalizeWs(src)) {
    v.push(`${key}이 축자와 동일 — 앞부분을 실제로 다시 써라(변형이 아니면 이 설정의 의미가 없다)`);
    return v;
  }
  const [srcTokens, varTokens] = [insertFoldTokens(src), insertFoldTokens(variant)];
  if (varTokens.length === 0) {
    v.push(`${key}에 영어 단어가 없음 — 지문과 같은 언어로 다시 써라`);
    return v;
  }
  const [srcWords, varWords] = [countWords(src), countWords(variant)];
  if (
    srcWords > 0 &&
    (varWords < srcWords * VARIANT_WORD_RATIO[0] || varWords > srcWords * VARIANT_WORD_RATIO[1])
  ) {
    v.push(
      `${key} 분량 이탈 (${varWords}단어 vs 축자 ${srcWords}단어 — ${VARIANT_WORD_RATIO.join("~")}배 안에서 다시 써라)`,
    );
  }
  if (countDisplaySentences(variant) > 1) {
    v.push(`${key}이 여러 문장으로 늘어남 — 한 문장을 유지하라`);
  }
  // 앞부분만 재진술 — 꼬리가 축자 그대로 이어져야 한다.
  const need = Math.max(3, Math.round(srcTokens.length * VARIANT_TAIL_RATIO));
  const kept = commonSuffixTokens(srcTokens, varTokens);
  if (srcTokens.length >= 6 && kept < need) {
    v.push(
      `${key}이 문장 전체를 다시 씀 (축자와 같은 꼬리 ${kept}토큰 — ${need}토큰 이상 필요). 앞부분(도입구·앞 절·주어부)만 바꾸고 뒷부분은 축자 그대로 이어 붙여라`,
    );
  }
  // 자리를 결정하는 단서 보존 — 이게 사라지면 여러 자리가 맞아 문항이 죽는다.
  // ⚠ 단서 대조는 **변형된 앞부분에만** 적용한다. 계약이 꼬리를 축자 복사하도록
  //   강제하므로 문장 '전체'를 보면 그 축자 꼬리가 검사를 대신 통과시킨다 — 관계대명사
  //   `that` 하나가 지시어 축과 응집 축을 동시에 만족시켜, 자리를 고정하던 `this cooling`
  //   이 통째로 사라진 변형본도 클린이 됐다(실측). 그게 이 설정이 막으려던 바로 그 결함이다.
  const srcPrefix = srcTokens.slice(0, Math.max(0, srcTokens.length - kept)).join(" ");
  const varPrefix = varTokens.slice(0, Math.max(0, varTokens.length - kept)).join(" ");
  if (!sentenceInsertHasCohesiveCue(variant)) {
    v.push(`${key}에 응집 단서(지시어·대명사·연결사)가 하나도 없음 — 자리를 결정하는 단서를 지우지 마라`);
  } else {
    if (INSERT_ANAPHORA_RE.test(srcPrefix) && !INSERT_ANAPHORA_RE.test(varPrefix)) {
      v.push(
        `${key}에서 앞 내용을 되받는 지시어·대명사가 사라짐 — 같은 선행어를 가리키는 지시어를 반드시 남겨라(축자 앞부분 '${trunc(srcPrefix, 40)}')`,
      );
    }
    if (INSERT_CONNECTIVE_RE.test(srcPrefix) && !INSERT_CONNECTIVE_RE.test(varPrefix)) {
      v.push(
        `${key}에서 논리 방향을 지시하던 연결사가 사라짐 — 표현은 바꾸되 같은 방향의 연결사를 남겨라(축자 앞부분 '${trunc(srcPrefix, 40)}')`,
      );
    }
  }
  // 지문의 다른 구간을 옮겨 적은 경우(재진술이 아니라 복사).
  const foldedPassage = foldForInsertMatch(passage);
  const foldedVariant = foldForInsertMatch(variant);
  if (foldedVariant.length >= 12 && foldedPassage.includes(foldedVariant)) {
    v.push(`${key}이 지문의 다른 구간을 그대로 옮겨 옴 — 자기 문장으로 다시 써라`);
  }
  return v;
}

/** 마커 자리 위생 — 문장 경계인가 · 지문 맨 앞은 아닌가 · 사이에 문장이 있는가. */
function markerPlacementIssues(layout: MdInsertLayout): string[] {
  const v: string[] = [];
  const seen = new Map<number, number>();
  for (const mark of layout.marks) {
    const at = layout.afterDisplayIndex[mark.ordinal];
    const name = markerName(mark.ordinal);
    if (at === -2) {
      v.push(`${name} 이(가) 지문 맨 앞에 있음 — 자리는 문장과 문장 사이에만 둔다`);
      continue;
    }
    if (at < 0) {
      const before = layout.clean.slice(Math.max(0, mark.at - 34), mark.at).trim();
      v.push(
        `${name} 이(가) 문장 경계가 아님 — 직전이 '…${trunc(before, 34)}' 로 끝난다. 마커는 마침표 뒤(문장과 문장 사이)에만 둔다`,
      );
      continue;
    }
    const prior = seen.get(at);
    if (prior !== undefined) {
      v.push(`${markerName(prior)} 와 ${name} 사이에 문장이 없음 — 같은 자리에 마커를 두 개 두지 마라`);
      continue;
    }
    seen.set(at, mark.ordinal);
  }
  return v;
}

export interface GateMdSentenceInsertOptions {
  /** 자리 마커 개수(5~8) */
  slotCount?: number;
  /** 주어진 문장 앞부분 변형 설정 */
  paraphrasePrefix?: boolean;
  /** answer-only 모드에서 오답해설 개수 검사를 끈다 */
  requireWrong?: boolean;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdSentenceInsert(
  q: MdInsertQuestion,
  passage: string,
  options?: GateMdSentenceInsertOptions,
): string[] {
  const requireWrong = options?.requireWrong !== false;
  const paraphrase = options?.paraphrasePrefix === true;
  // 라벨 배열(①~⑧) 밖의 값이 들어오면 진단 문구에 undefined 가 새므로 여기서 클램프한다.
  const slotCount = Math.min(
    INSERT_CIRCLED.length,
    Math.max(1, Math.round(Number(options?.slotCount ?? 5)) || 5),
  );
  const v: string[] = [];

  // #1 형상 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (!q.given) return ["삽입문장 누락"];
  if (!q.numberedPassage) return ["번호지문 누락"];

  const layout = computeInsertLayout(q, passage);
  // 지문 길이 하한 — 한 문장을 빼내고 나면 자리는 (문장 수 − 1)개뿐이다.
  // 클라이언트가 같은 식(slotCount + 1)으로 유형 선택 자체를 막지만(짧은 지문이
  // 프로덕션 1위 실패 원인이었다), 서버에서도 "재생성으로 탈출 불가능한 반려"임을
  // 한 줄로 못 박아 포렌식이 원인을 바로 가리키게 한다.
  if (layout.sentences.length < slotCount + 1) {
    return [
      `지문이 ${layout.sentences.length}문장뿐 — 자리 ${slotCount}개를 만들려면 ${slotCount + 1}문장 이상이어야 한다(지문이 짧아 이 유형이 성립하지 않는다)`,
    ];
  }
  // 자리 범위 밖 마커([[9]]·[[0]]·[[10]]) — 파서는 전부 수집하고(철칙 3) 게이트가
  // 자리를 지목한다(철칙 5). 파서가 조용히 버리면 리터럴이 잔여 지문에 그대로 남아
  // '지문 무단 편집'으로 오진되고, 재생성 프롬프트가 '지문을 고쳐 쓰지 마라'는 엉뚱한
  // 지시를 줘 두 번째 콜도 같은 실패로 끝난다(실측).
  const outOfRange = layout.marks.filter((m) => m.num < 1 || m.num > slotCount);
  const rangeNote =
    outOfRange.length > 0
      ? `마커 번호가 자리 범위(1~${slotCount}) 밖: ${outOfRange
          .map((m) => m.raw)
          .join("·")} — [[1]]~[[${slotCount}]] 만 써라`
      : "";

  if (layout.marks.length !== slotCount) {
    return [
      `삽입 자리 마커 ${layout.marks.length}개 (${slotCount}개 필요 — [[1]]~[[${slotCount}]])${
        rangeNote ? `. ${rangeNote}` : ""
      }`,
    ];
  }

  // #2 마커 번호 = 지문 등장순 1..N. 어긋나면 정답 라벨이 어느 자리를 가리키는지
  // 확정되지 않는다(학생 표면 번호는 등장순으로 다시 매겨진다).
  if (rangeNote) {
    v.push(rangeNote);
  } else {
    const numbering = layout.marks.map((m) => m.num).join(",");
    const expectedNumbering = layout.marks.map((_, i) => i + 1).join(",");
    if (numbering !== expectedNumbering) {
      v.push(`마커 번호가 지문 등장순 1..${slotCount} 이 아님 — 실제 ${numbering || "없음"}`);
    }
  }

  // #3 마커 자리 위생(문장 경계·맨 앞·빈 갭).
  if (layout.omittedIndex >= 0) {
    v.push(...markerPlacementIssues(layout));
  }

  // #4 빼낸 문장 확정 — 후처리 findSourceSentenceToOmit 의 결정형 대응물.
  const answerOrdinal = insertMarkerOrdinal(q.answer);
  if (layout.omittedIndex < 0) {
    if (layout.matchingGaps.length > 0) {
      v.push(
        "삽입문장이 지문의 완결된 한 문장이 아님 — 문장 경계에서 통째로 빼내라(반 문장·두 문장 동시 추출 금지)",
      );
    } else {
      v.push(
        "지문 재구성 불일치 — 번호지문이 '원 지문에서 문장 하나만 뺀 형태'가 아니다(마커 밖 텍스트를 고쳐 썼거나 문장을 지어냈다)",
      );
    }
  } else {
    const source = layout.sentences[layout.omittedIndex];
    // matchingGaps 가 비어 있지 않다는 것은 "삽입문장을 되돌리면 원 지문이 글자 그대로
    // 복원된다"는 증명이므로 축자 여부가 이미 확정돼 있다. 이때 분할기 단위(source)와
    // 글자가 다른 것은 splitIntoSentences 의 왕복 손실(닫는 따옴표를 다음 단위 선두로
    // 흘림)일 뿐이라, 발화하면 축자 완벽 출력을 거짓 반려한다.
    if (layout.matchingGaps.length === 0 && normalizeWs(source) !== normalizeWs(q.given)) {
      v.push(
        `삽입문장이 지문 축자가 아님 — 번호지문에서 빠진 원문은 '${trunc(source)}' 이다`,
      );
    }
    // 후처리 하드 실패 선반영: 첫 문장은 앞 고리가 없어 자리가 결정되지 않는다.
    if (layout.omittedIndex === 0) {
      v.push(
        "지문의 첫 문장을 빼냈음 — 첫 문장은 뺄 수 없다(앞 고리가 없어 자리가 결정되지 않는다). 둘째 문장 이후에서 골라라",
      );
    } else {
      // 후처리 하드 실패 선반영: 추출 자리에 마커가 없으면 정답을 매길 수 없다.
      const expected = layout.afterDisplayIndex.findIndex(
        (d) => d === layout.omittedIndex - 1,
      );
      if (expected < 0) {
        v.push(
          `빼낸 문장이 있던 자리('${trunc(layout.sentences[layout.omittedIndex - 1], 40)}' 바로 뒤)에 마커가 없음 — 그 자리에 반드시 마커를 두어라`,
        );
      }
    }
  }

  // ── #5 최강 불변식: 마커 제거 + 정답 자리에 삽입문장 복원 == 원 지문 ──────────
  if (!q.answer) {
    v.push("정답 누락");
  } else if (answerOrdinal < 0 || answerOrdinal >= layout.marks.length) {
    v.push(`정답 라벨(${q.answer})이 자리 마커 범위 밖 — ${INSERT_CIRCLED[0]}~${INSERT_CIRCLED[slotCount - 1]} 중 하나여야 한다`);
  } else if (!layout.matchingGaps.includes(answerOrdinal)) {
    // matchingGaps 가 비어 있으면 원인은 #4 가 이미 지목했으므로 침묵한다
    // (같은 결함에 진단 두 줄을 내면 재생성 프롬프트가 흐려진다).
    if (layout.matchingGaps.length > 0) {
      v.push(
        `정답 불일치 — 삽입문장을 되돌렸을 때 원 지문이 복원되는 자리는 ${layout.matchingGaps
          .map(markerName)
          .join("·")} 인데 정답은 ${q.answer} 로 표시됨`,
      );
    }
  } else if (answerOrdinal === 0 || answerOrdinal === layout.marks.length - 1) {
    // 양끝 자리는 한쪽 고리만 보면 풀려 변별력이 죽는다(fast 는 warning, md 는 승격).
    v.push(
      `정답이 양끝 자리(${q.answer}) — 가운데 자리(${INSERT_CIRCLED.slice(1, slotCount - 1)})가 되도록 빼낼 문장을 다시 골라라`,
    );
  }

  // #6 주어진 문장의 응집 단서 — 없으면 어느 자리에도 들어가 복수정답이 된다.
  const displayedGiven = paraphrase && q.givenVariant ? q.givenVariant : q.given;
  if (displayedGiven && !sentenceInsertHasCohesiveCue(displayedGiven)) {
    v.push(
      "주어진 문장에 응집 단서(지시어·대명사·연결사)가 없음 — 자리가 유일하게 결정되지 않는다(복수정답)",
    );
  }

  // #7 정답 누출 — 삽입문장과 거의 같은 문장이 표시 지문에 남아 있으면 자리가 노출된다
  // (후처리 GIVEN_SENTENCE_LEAK_THRESHOLD 하드 실패 · validators
  //  sentence-insert-omitted-source-visible 동시 선반영).
  // 두 하류가 보는 **표면이 다르다**: 후처리는 학생 표시면(givenSentence = 변형본)을,
  // validators 는 축자(omittedSourceSentence)를 대조한다. 둘 다 여기서 막는다.
  const leakSurfaces = [...new Set([displayedGiven, q.given].filter(Boolean))];
  if (leakSurfaces.length > 0 && layout.displaySentences.length > 0) {
    for (const sentence of layout.displaySentences) {
      if (leakSurfaces.some((s) => insertLeakSimilarity(s, sentence) >= GIVEN_LEAK_THRESHOLD)) {
        v.push(
          `주어진 문장과 거의 같은 문장이 번호지문에 남아 있음: '${trunc(sentence)}' — 정답 자리가 그대로 노출된다`,
        );
        break;
      }
    }
  }

  // #8 변형(2단 출력) 계약 — 설정과 출력이 어긋나면 학생 표면이 설정과 달라진다.
  if (paraphrase && !q.givenVariant) {
    v.push("주어진 문장 변형 설정인데 '삽입문장(변형):' 줄이 없음");
  } else if (!paraphrase && q.givenVariant) {
    v.push("주어진 문장 변형 설정이 꺼져 있는데 '삽입문장(변형):' 줄이 출력됨");
  } else if (paraphrase && q.givenVariant) {
    v.push(...givenVariantIssues(q, passage));
  }

  // #9 해설·오답 — 산문에 자리 번호를 쓰면 표시 번호와 어긋나 문항이 무효가 된다
  // (fast 의 sentence-insert-answer-desync 결정형 선반영).
  if (!q.explanation) v.push("해설 누락");
  else if (/[①-⑧]/.test(q.explanation)) {
    v.push(
      "해설이 자리 번호(원문자)로 위치를 지칭함 — 번호 대신 문장 내용을 인용해 지목하라",
    );
  }

  if (requireWrong) {
    const need = slotCount - 1;
    const got = q.wrong.map((w) => w.label);
    const dup = [...new Set(got.filter((l, i) => got.indexOf(l) !== i))];
    if (dup.length > 0) {
      v.push(`오답해설 라벨 중복: ${dup.join("")} — 자리마다 정확히 한 줄씩 써라`);
    }
    const validLabels = INSERT_CIRCLED.slice(0, slotCount);
    const alien = [...new Set(got.filter((l) => !validLabels.includes(l)))];
    if (alien.length > 0) v.push(`오답해설에 자리 범위 밖 라벨: ${alien.join("")}`);
    if (got.length !== need) v.push(`오답해설 ${got.length}개 (${need}개 필요)`);
    if (q.answer && validLabels.includes(q.answer)) {
      const lost = validLabels
        .split("")
        .filter((l) => l !== q.answer && !got.includes(l));
      if (lost.length > 0) v.push(`오답해설 누락 라벨: ${lost.join("")}`);
      if (got.includes(q.answer)) v.push("오답해설에 정답 번호 포함");
    }
    for (const w of q.wrong) {
      if (/[①-⑧]/.test(w.text)) {
        v.push(
          `오답해설 ${w.label} 이(가) 자리 번호(원문자)로 다른 위치를 지칭함 — 문장 내용을 인용해 지목하라`,
        );
        break;
      }
    }
  }

  return v;
}
