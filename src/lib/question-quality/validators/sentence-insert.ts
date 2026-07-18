// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { getCircledNumbers } from "@/lib/question-postprocess/types";
import { QuestionQualitySeverity, SENTENCE_INSERT_SLOT_MAX, SENTENCE_INSERT_SLOT_MIN, collectWrongOptionExplanations, containsComparableSentence, contentTokens, findDuplicate, isRecord, normalizeComparableText, normalizeText, splitPassageSentences } from "../core";



export function sentenceInsertHasCohesiveCue(sentence: string): boolean {
  const s = ` ${sentence.toLowerCase()} `;
  if (/\b(this|that|these|those|such|it|its|they|them|their|he|she|his|her|him)\b/.test(s)) {
    return true;
  }
  if (
    /\b(however|yet|instead|nevertheless|nonetheless|therefore|thus|hence|consequently|for example|for instance|moreover|furthermore|in addition|besides|also|then|later|subsequently|afterwards?|meanwhile|on the contrary|in contrast|by contrast|similarly|likewise|as a result)\b/.test(
      s,
    )
  ) {
    return true;
  }
  return false;
}



export function normalizeSentenceInsertGapLabel(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  const match = text.match(/(\d{1,2})/);
  return match ? match[1] : text;
}



export function countSentenceInsertGapMarkers(text: string): number {
  // Slot count is configurable (5~8); count up to the supported maximum.
  const circled = getCircledNumbers(SENTENCE_INSERT_SLOT_MAX);
  return circled.filter((marker) => text.includes(marker)).length;
}



/**
 * T10 렌더-계약 정합 게이트 — passageWithMarkers 의 각 원형숫자 마커가 "문장 경계"에만
 * 놓였는지 결정형 검증(실측 결함 V1-MARKER-DESYNC / V1-MARKER-PLACEMENT-MISMATCH,
 * campaign-20260716 P008). 잡는 두 파손:
 *  (1) 인접 빈 갭 — 두 마커 사이에 문장이 없다(공백뿐). 삽입할 자리가 성립하지 않는다.
 *  (2) 문장 중간 마커 — 마커 바로 앞(공백 제외)이 문장 종결부호가 아니다(소문자/콤마 등
 *      문장 내부). 마커는 완전한 두 문장 사이에만 와야 한다.
 *
 * 계약상 정상이라 검사에서 제외하는 것(DB 실측 기반 오탐 배제):
 *  - 마커 spread(마커 사이 문장 2개+): markerAfterSentenceIndices 는 임의 오름차순 위치를
 *    허용하므로 비연속 갭은 정상(DB 수락 69.6%). 이 축은 결정형으로 정상과 구분 불가라
 *    E-gate(해설-렌더 desync) 담당.
 *  - 지문 끝 마커(마지막 비공백이 마커): 정답 갭 "마지막 문장 뒤" 관례로 정상(DB 80%).
 *  - 지문 첫 내용이 마커(시작 갭): 앞 문장이 없어 종결부호 검사 대상에서 제외.
 * DB 실측(수락 SENTENCE_INSERT 260건) 두 파손 발동 0건(끝 마커/무종결 letter 서명 오탐은
 * 끝 마커 제외로 배제). error(strict 차단). W2-D 정정(26-07-18, 지휘관 판정): 마커가
 * 문장 경계 밖이면 삽입 자리가 렌더 파손(문항 불성립)이라 F급 무결성 결함 —
 * RELAXED_BLOCKING_QUALITY_CODES 에 등재해 전 레인 차단한다.
 */
export interface SentenceInsertMarkerFinding {
  code: "sentence-insert-marker-mid-sentence" | "sentence-insert-marker-empty-gap";
  message: string;
  evidence: Record<string, unknown>;
}

// 원형숫자(①~⑳) — 갭 마커 스캔용 (SENTENCE_INSERT_SLOT_MAX 여유 포함).
const SI_MARKER_CLASS = /[①-⑳]/;
const SI_MARKER_GLOBAL = /[①-⑳]/g;
// 문장 경계 판정용(W2-D 렌더 정합 검증, 26-07-18). 실측: processSentenceInsert 렌더는
// splitIntoSentences 경계(=.!?)에만 마커를 놓고, 마침표 뒤 닫는 인용부호는 다음 문장
// 선두로 넘어가므로(stranding) 마커 직전 문자는 항상 .!? 이다. 그래서 문장 경계 =
// 종결부호(.!?), 그리고 그 뒤에 붙을 수 있는 닫는 인용/괄호 래퍼(."/.)/.] 형태)뿐이다.
// 닫는 래퍼가 종결부호 없이 단독으로 마커 앞에 오면("(aside) ①") 문장 내부 마커다 —
// 기존 화이트리스트는 그 단독 래퍼도 허용해 렌더에 없는 형태를 통과시켰다(정합 보정).
const SI_SENTENCE_TERMINAL = /[.!?]/;
const SI_CLOSING_WRAPPER = /[”’"')\]]/;

/**
 * 마커 직전(인덱스 j = 첫 비공백 문자)이 문장 경계인지 판정. 종결부호(.!?)면 즉시 경계.
 * 닫는 인용/괄호 래퍼면 그 run(및 사이 공백)을 건너뛴 뒤 종결부호가 있어야 경계로
 * 인정한다(문장이 ."/.)/.] 로 끝난 형태). 래퍼만 있고 종결부호가 없으면 문장 내부다.
 */
function isSentenceInsertBoundaryBefore(text: string, j: number): boolean {
  let k = j;
  while (k >= 0) {
    const ch = text[k] ?? "";
    if (/\s/.test(ch) || SI_CLOSING_WRAPPER.test(ch)) {
      k -= 1;
      continue;
    }
    break;
  }
  return SI_SENTENCE_TERMINAL.test(text[k] ?? "");
}

export function findSentenceInsertMarkerContractIssues(
  passageWithMarkers: string | undefined,
): SentenceInsertMarkerFinding[] {
  if (!passageWithMarkers) return [];
  const text = passageWithMarkers;
  const marks = [...text.matchAll(SI_MARKER_GLOBAL)];
  if (marks.length < 2) return [];

  // 지문 끝 마커(마지막 비공백 문자가 마커)의 위치 — 관례상 정상이라 경계 검사 제외.
  let lastNonSpace = text.length - 1;
  while (lastNonSpace >= 0 && /\s/.test(text[lastNonSpace] ?? "")) lastNonSpace -= 1;
  const endMarkerIndex =
    lastNonSpace >= 0 && SI_MARKER_CLASS.test(text[lastNonSpace] ?? "") ? lastNonSpace : -1;

  const findings: SentenceInsertMarkerFinding[] = [];
  for (let i = 0; i < marks.length; i += 1) {
    const match = marks[i];
    const start = match.index ?? 0;

    // (1) 인접 빈 갭 — 이전 마커와의 사이가 공백뿐.
    if (i > 0) {
      const previous = marks[i - 1];
      const between = text.slice((previous.index ?? 0) + previous[0].length, start);
      if (between.replace(/\s+/g, "").length === 0) {
        findings.push({
          code: "sentence-insert-marker-empty-gap",
          message: `SENTENCE_INSERT markers ${previous[0]} and ${match[0]} are adjacent with no sentence between them; every gap marker must sit between two sentences.`,
          evidence: { markers: `${previous[0]}${match[0]}` },
        });
        continue; // 이 마커의 경계 검사는 위 진단으로 충분.
      }
    }

    // (2) 문장 중간 마커 — 시작 갭(앞 내용 없음)·끝 마커는 제외.
    if (start === endMarkerIndex) continue;
    let j = start - 1;
    while (j >= 0 && /\s/.test(text[j] ?? "")) j -= 1;
    if (j < 0) continue; // 지문 첫 내용이 마커(시작 갭) → 정상.
    const before = text[j] ?? "";
    if (SI_MARKER_CLASS.test(before)) continue; // 인접 마커는 (1)에서 처리.
    if (!isSentenceInsertBoundaryBefore(text, j)) {
      findings.push({
        code: "sentence-insert-marker-mid-sentence",
        message: `SENTENCE_INSERT marker ${match[0]} is not at a sentence boundary; the preceding character "${before}" is not sentence-final punctuation (.!? optionally followed by a closing quote/bracket). Gap markers must sit between complete sentences.`,
        evidence: {
          marker: match[0],
          precedingChar: before,
          context: text.slice(Math.max(0, start - 40), start + 1),
        },
      });
    }
  }
  return findings;
}

export function findSentenceInsertVisibleSourceLeak(
  sourceSentence: string,
  passageWithMarkers: string,
): { sentence: string; score: number } | null {
  const source = normalizeText(sourceSentence);
  if (!source) return null;

  const visiblePassage = stripSentenceInsertMarkers(passageWithMarkers);
  const visibleSentences = splitPassageSentences(visiblePassage, { includeShort: true });
  let best: { sentence: string; score: number } | null = null;
  for (const sentence of visibleSentences) {
    const score = sentenceInsertSentenceSimilarity(source, sentence);
    if (!best || score > best.score) best = { sentence, score };
  }

  if (!best) return null;
  if (normalizeComparableText(best.sentence) === normalizeComparableText(source)) return best;
  return best.score >= 0.72 ? best : null;
}



export function stripSentenceInsertMarkers(text: string): string {
  return text
    .replace(/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}



export function sentenceInsertSentenceSimilarity(a: string, b: string): number {
  const normalizedA = normalizeComparableText(a).replace(/[.,!?;:]+$/g, "");
  const normalizedB = normalizeComparableText(b).replace(/[.,!?;:]+$/g, "");
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.length >= 45 && normalizedB.includes(normalizedA)) return 0.95;
  if (normalizedB.length >= 45 && normalizedA.includes(normalizedB)) return 0.95;

  const tokensA = [...contentTokens(normalizedA)];
  const tokensB = [...contentTokens(normalizedB)];
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  const overlap = tokensA.filter((token) => setB.has(token)).length;
  const containment = overlap / Math.max(1, Math.min(tokensA.length, tokensB.length));
  const jaccard = overlap / Math.max(1, new Set([...tokensA, ...tokensB]).size);
  const sequence = longestCommonTokenRun(tokensA, tokensB) / Math.max(1, Math.min(tokensA.length, tokensB.length));
  return Math.max(containment, jaccard * 1.25, sequence);
}



export function longestCommonTokenRun(a: string[], b: string[]): number {
  let best = 0;
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        best = Math.max(best, dp[i][j]);
      }
    }
  }
  return best;
}



export function validateSentenceInsertQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedSlotCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  // 1) 마커 인덱스: 요청 개수(기본 5) · 오름차순
  const indices = Array.isArray(question.markerAfterSentenceIndices)
    ? question.markerAfterSentenceIndices.filter((n): n is number => typeof n === "number")
    : [];
  const expectedSlotCount =
    requestedSlotCount ??
    (indices.length >= SENTENCE_INSERT_SLOT_MIN && indices.length <= SENTENCE_INSERT_SLOT_MAX
      ? indices.length
      : 5);
  if (indices.length !== expectedSlotCount) {
    add(
      "warning",
      "sentence-insert-marker-count",
      `Expected ${expectedSlotCount} marker indices for SENTENCE_INSERT, got ${indices.length}.`,
    );
  } else if (!indices.every((n, i) => i === 0 || n > indices[i - 1])) {
    add(
      "warning",
      "sentence-insert-marker-order",
      "markerAfterSentenceIndices must be strictly ascending.",
    );
  }

  // 2) 주어진 문장: 존재 + 응집 단서(중립 문장 → 복수정답 위험)
  const given = normalizeText(question.givenSentence);
  if (!given) {
    add("error", "sentence-insert-missing-given", "SENTENCE_INSERT is missing givenSentence.");
  } else if (!sentenceInsertHasCohesiveCue(given)) {
    add(
      "error",
      "sentence-insert-neutral-given",
      "The given sentence has no explicit cohesive cue (demonstrative/pronoun/connective); it may fit multiple gaps (복수정답 위험).",
    );
  }

  // 3) 정답 위치: 양끝(①·⑤) 회피 → 가운데(②③④) 권장
  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  if (!passageWithMarkers) {
    add("error", "sentence-insert-missing-passage", "SENTENCE_INSERT is missing passageWithMarkers.");
  } else {
    const markerCount = countSentenceInsertGapMarkers(passageWithMarkers);
    if (markerCount !== expectedSlotCount) {
      add(
        "error",
        "sentence-insert-gap-marker-count",
        `SENTENCE_INSERT passageWithMarkers must contain exactly ${expectedSlotCount} gap markers, got ${markerCount}.`,
      );
    }
    // T10 렌더-계약 정합 게이트 — 마커가 문장 경계 사이에만 놓였는지(문장 중간 마커·인접
    // 빈 갭 금지) 결정형 검증. 마커 spread(비연속 갭)·지문 끝 마커는 계약상 정상이므로
    // 검사하지 않는다.
    for (const finding of findSentenceInsertMarkerContractIssues(passageWithMarkers)) {
      add("error", finding.code, finding.message);
    }
  }

  const omittedSource =
    normalizeText(question.omittedSourceSentence) ||
    normalizeText(question.sourceSentenceToOmit);
  if (omittedSource) {
    if (passage && !containsComparableSentence(passage, omittedSource)) {
      add(
        "error",
        "sentence-insert-omitted-source-not-backed",
        "sourceSentenceToOmit/omittedSourceSentence must be an original passage sentence.",
      );
    }
    if (passageWithMarkers) {
      const leak = findSentenceInsertVisibleSourceLeak(omittedSource, passageWithMarkers);
      if (leak) {
        add(
          "error",
          "sentence-insert-omitted-source-visible",
          `The omitted source sentence is still visible in passageWithMarkers: "${leak.sentence.slice(0, 100)}"`,
        );
      }
    }
  } else if (given && passageWithMarkers) {
    add(
      "error",
      "sentence-insert-missing-omitted-source",
      "SENTENCE_INSERT must provide sourceSentenceToOmit/omittedSourceSentence copied from the original passage; newly invented bridge sentences are not allowed.",
    );
    const leak = findSentenceInsertVisibleSourceLeak(given, passageWithMarkers);
    if (leak && leak.score >= 0.72) {
      add(
        "error",
        "sentence-insert-given-leaks-in-passage",
        `The given sentence is still visible, or nearly visible, in passageWithMarkers: "${leak.sentence.slice(0, 100)}"`,
      );
    }
  }

  const answer = normalizeSentenceInsertGapLabel(question.correctAnswer);
  if (answer === "1" || answer === String(expectedSlotCount)) {
    add(
      "warning",
      "sentence-insert-edge-answer",
      `Correct gap is at an edge (${answer}); 가운데 위치가 변별력에 유리합니다.`,
    );
  }

  // ── 정답 갭 단일 진실원 교차검증 (wave2: sentence-insert-answer-desync) ─────
  // 후처리(processSentenceInsert)가 correctAnswer 를 omission gap 기준으로 결정론
  // 재키잉하지만, 해설/insertionRationale/오답해설 "산문"의 모델 원래 주장(틀린
  // 원형숫자)은 재정렬되지 않는다(베이스라인 실측 runIndex 12: correctAnswer ③이
  // 위치상 옳은데 해설이 "④에 들어가는 것이 가장 적절"·오답해설이 ③을 오답으로
  // 설명 — llm 심사 38점). 결정론 표면 3가지를 잡는다:
  //  (1) 재구성: 정답 갭에 givenSentence 를 되끼우면 원문과 일치해야 한다(다른
  //      갭에서만 일치하면 mis-key). 어느 갭에서도 일치하지 않으면 발화하지 않음.
  //  (2) 해설이 명시 주장하는 갭 번호("N에 들어가는 것이 … 적절"/"정답은 N").
  //  (3) 오답 해설 맵이 정답 라벨을 포함.
  if (answer && /^\d+$/.test(answer)) {
    validateSentenceInsertAnswerDesync(
      question,
      passage,
      passageWithMarkers,
      given,
      answer,
      expectedSlotCount,
      add,
    );
  }

  // 4) 함정 게이트: distractorTraps 가 있으면 각 결함이 비어있지 않고 서로 달라야 함
  // (desync 함수는 파일 하단 validateSentenceInsertAnswerDesync 참조)
  const traps = Array.isArray(question.distractorTraps)
    ? question.distractorTraps.filter(isRecord)
    : [];
  if (traps.length > 0) {
    const flaws = traps.map((t) => normalizeText(t.fatalFlaw)).filter(Boolean);
    if (flaws.length < traps.length) {
      add(
        "warning",
        "sentence-insert-trap-empty-flaw",
        "Some distractorTraps have an empty fatalFlaw; each wrong gap needs a decisive reason.",
      );
    }
    if (findDuplicate(flaws)) {
      add(
        "warning",
        "sentence-insert-trap-duplicate-flaw",
        "distractorTraps repeat the same fatalFlaw; each trap should fail for a different reason.",
      );
    }
    if (answer && traps.some((t) => normalizeSentenceInsertGapLabel(t.gapLabel) === answer)) {
      add(
        "warning",
        "sentence-insert-trap-on-answer",
        "A distractorTrap points at the correct gap.",
      );
    }
  }
}



// 원형숫자(①~⑳) — 갭 마커/해설 산문 스캔용.
const SI_CIRCLED_CLASS = "[\u2460-\u2473]";

/**
 * wave2 게이트: SENTENCE_INSERT 의 correctAnswer(단일 진실원)와 재구성 위치·해설
 * 산문 주장·오답해설 라벨 체계가 일치하는지 결정론 교차검증. 보수 원칙 — 재구성이
 * 어느 갭에서도 원문과 일치하지 않으면(패러프레이즈/추출 경로) 그 분기는 침묵한다.
 */
export function validateSentenceInsertAnswerDesync(
  question: Record<string, unknown>,
  passage: string | undefined,
  passageWithMarkers: string,
  givenSentence: string,
  answer: string,
  expectedSlotCount: number,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const claims: string[] = [];
  const answerIndex = Number(answer);

  // (1) 재구성 검증 — 마커 k 자리에 givenSentence 를 끼우고 나머지 마커를 지우면
  //     원문과 비교가능 동일해지는 k 집합을 구한다. 집합이 비어있지 않은데 정답이
  //     그 안에 없으면 mis-key 확정.
  if (passage && passageWithMarkers && givenSentence) {
    const circledRe = new RegExp(SI_CIRCLED_CLASS, "g");
    const markerMatches = [...passageWithMarkers.matchAll(circledRe)];
    if (markerMatches.length === expectedSlotCount) {
      const passageComparable = normalizeComparableText(passage);
      const matchingGaps: number[] = [];
      for (let gap = 0; gap < markerMatches.length; gap += 1) {
        let cursor = 0;
        let rebuilt = "";
        for (const [markerOrdinal, markerMatch] of markerMatches.entries()) {
          if (markerMatch.index === undefined) continue;
          rebuilt += passageWithMarkers.slice(cursor, markerMatch.index);
          rebuilt += markerOrdinal === gap ? ` ${givenSentence} ` : " ";
          cursor = markerMatch.index + markerMatch[0].length;
        }
        rebuilt += passageWithMarkers.slice(cursor);
        if (normalizeComparableText(rebuilt) === passageComparable) {
          matchingGaps.push(markerOrdinal1Based(gap));
        }
      }
      if (matchingGaps.length > 0 && !matchingGaps.includes(answerIndex)) {
        claims.push(
          `restoring the given sentence reconstructs the source only at gap ${matchingGaps.join("/")}, not at the keyed answer ${answerIndex}`,
        );
      }
    }
  }

  // (2) 해설/insertionRationale 이 명시 주장하는 갭 번호.
  const proseTexts = [
    normalizeText(question.explanation),
    normalizeText(question.insertionRationale),
    ...(Array.isArray(question.keyPoints)
      ? question.keyPoints.map((point: unknown) => normalizeText(point))
      : []),
  ]
    .filter(Boolean)
    .join("\n");
  const assertedGapRe = new RegExp(
    `(${SI_CIRCLED_CLASS})\s*번?\s*(?:자리|위치|곳)?\s*에\s*들어가[^${SI_CIRCLED_CLASS.slice(1, -1)}.!?]{0,30}적절`,
    "g",
  );
  for (const match of proseTexts.matchAll(assertedGapRe)) {
    const asserted = normalizeSentenceInsertGapLabel(match[1]);
    if (asserted && asserted !== answer) {
      claims.push(`explanation asserts the correct gap is ${match[1]}`);
    }
  }
  const answerDeclRe = new RegExp(`정답은?\s*[:\s"'(\[]*\s*(${SI_CIRCLED_CLASS})`, "g");
  for (const match of proseTexts.matchAll(answerDeclRe)) {
    const asserted = normalizeSentenceInsertGapLabel(match[1]);
    if (asserted && asserted !== answer) {
      claims.push(`explanation declares the answer as ${match[1]}`);
    }
  }

  // (3) 오답 해설 맵이 정답 라벨을 포함 — 라벨 체계가 다른 갭 기준으로 쓰였다.
  const wrongExplanations = collectWrongOptionExplanations(question.wrongOptionExplanations);
  const wrongKeys = [...wrongExplanations.keys()].map((key) =>
    normalizeSentenceInsertGapLabel(key),
  );
  if (wrongKeys.includes(answer)) {
    claims.push("wrongOptionExplanations covers the answer gap");
  }

  if (claims.length > 0) {
    add(
      "error",
      "sentence-insert-answer-desync",
      `SENTENCE_INSERT answer references disagree with correctAnswer ${answerIndex}: ${claims.join("; ")}. The keyed gap, the omission-site reconstruction, and every gap claim in explanation/insertionRationale/wrongOptionExplanations must agree.`,
    );
  }
}

function markerOrdinal1Based(zeroBased: number): number {
  return zeroBased + 1;
}
