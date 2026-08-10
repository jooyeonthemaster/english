// ============================================================================
// 요약문 완성 단답형(SUMMARY_COMPLETE) 0원 결정형 게이트.
// 견본: gate-summary-mc.ts · parser-antonym.ts
// 계약: docs/md-qgen-type-expansion-spec.md §1 [6] · §1-B 철칙 5
//
// 게이트 메시지는 **자리를 지목한다** — 이 문구가 그대로 [반려 재생성] 피드백으로
// 실려 재생성 성공률을 가른다. `"정답(B) 줄을 인식할 수 없음(받은 값: '')"` 처럼
// 어느 라벨의 무엇이 어떻게 잘못됐는지 적는다.
//
// ── 이 유형이 지켜야 하는 불변식의 성격 ────────────────────────────────────
// 지문을 변형하지 않으므로 "지문 재구성 대조"(어법·어휘의 최강 게이트)가 없다.
// 그 자리를 세 축이 대신한다:
//   ① 요약문 무결성 — 라벨 각 1회 · 정답 미노출 · 지문 연속 복사 금지
//      (fast 검증기 summary-complete-* 전량을 생성 시점에 결정형으로 선반영)
//   ② 채점 계약 — 학생 입력 키 `(A)` 축 · 정답 영어 · 정답 중복 금지
//   ③ 허용답 위생 — 이 집합에 든 문자열은 자동채점에서 **무조건 만점**이다
//      (grade.ts:50). 오염되면 오답이 정답으로 흡수되고 되돌릴 수 없다.
// ============================================================================

import { answerRunInPassage, summaryWritingComparableTokens } from "@/lib/question-quality/core";
import { normalizeWs } from "./parser";
import {
  stripSummaryCompleteMarkers,
  summaryCompleteCmp,
  summaryCompleteLabelSequence,
  type MdSummaryCompleteQuestion,
} from "./parser-summary-complete";
import { summaryCompleteMdLabels } from "./prompts-summary-complete";

/** 요약문 최소·최대 단어 수 — 한 문장 압축의 상식 범위(절단·장광설 검출). */
const SUMMARY_MIN_WORDS = 8;
const SUMMARY_MAX_WORDS = 60;
/** 빈칸 답 최대 단어 수 — 이 유형의 답은 단어 또는 짧은 어구다(프롬프트 마감 규칙). */
const ANSWER_MAX_WORDS = 5;
/** 지문 연속 복사로 간주하는 토큰 길이(요약문). */
const COPY_NGRAM = 8;
/** 정답 노출 판정 최소 길이 — 검증기 complete.ts:75 와 동일(4자 미만은 우연 일치). */
const LEAK_MIN_CHARS = 4;

const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;

function words(value: string): string[] {
  return normalizeWs(value).split(" ").filter(Boolean);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** 문장 종결 개수 — 약어(U.S.)·소문자 후속을 문장 끝으로 세지 않는 보수 계수. */
function sentenceEndCount(text: string): number {
  let count = 0;
  for (const m of text.matchAll(/[.!?]+(?=\s+["'“‘([]?[A-Z]|\s*$)/g)) {
    const before = text.slice(0, m.index ?? 0);
    if (/(?:^|[\s(])[A-Z]$/.test(before)) continue;
    count += 1;
  }
  return count;
}

/** 요약문이 지문에서 연속 N토큰 이상을 그대로 옮겼는지(압축 재진술 위반 검출). */
function findCopiedRun(summary: string, passage: string): string | null {
  const summaryTokens = tokens(stripSummaryCompleteMarkers(summary));
  if (summaryTokens.length < COPY_NGRAM) return null;
  const passageTokens = tokens(passage);
  if (passageTokens.length < COPY_NGRAM) return null;
  const grams = new Set<string>();
  for (let i = 0; i + COPY_NGRAM <= passageTokens.length; i += 1) {
    grams.add(passageTokens.slice(i, i + COPY_NGRAM).join(" "));
  }
  for (let i = 0; i + COPY_NGRAM <= summaryTokens.length; i += 1) {
    const gram = summaryTokens.slice(i, i + COPY_NGRAM).join(" ");
    if (grams.has(gram)) return gram;
  }
  return null;
}

/**
 * 정답 어구가 지문 문장의 통째 복사인지 — 지문이 문항 안에 INLINE 으로 함께
 * 렌더되므로(question-view.tsx PASSAGE_CONTENT_SUBTYPES), 다단어 정답이 지문에
 * 연속으로 그대로 있으면 학생이 베껴 쓰고 끝난다.
 *
 * (a) 내용토큰 2개 이상이 **전부** 지문에 연속 등장 → 찾아 베끼기(이 유형 전용 임계).
 *     한 단어 정답이 지문 어휘와 겹치는 것은 이 유형에서 정상이라 제외한다.
 * (b) fast 검증기 error 임계 그대로 이식(dispatcher.ts:1072-1090) — 내용토큰 6+ 且
 *     80% 이상 연속 verbatim. RELAXED_BLOCKING 이라 fast 폴백 경로에서 실제 차단된다.
 */
function verbatimCopyRun(answer: string, passage: string): string | null {
  const contentTokens = summaryWritingComparableTokens(answer);
  if (contentTokens.length < 2) return null;
  const full = answerRunInPassage(answer, passage, contentTokens.length);
  if (full) return full;
  if (contentTokens.length < 6) return null;
  return (
    answerRunInPassage(
      answer,
      passage,
      Math.max(6, Math.ceil(contentTokens.length * 0.8)),
    ) || null
  );
}

/** 값 선두에 남은 빈칸 라벨 — 스냅이 자기 라벨만 벗기므로 여기 오는 건 타 라벨이다. */
const LEADING_LABEL_RE = /^[(（[]\s*([A-Ea-e])\s*[)）\]]/;

/**
 * 값 한 개의 표면 위생(언어·길이·라벨 재부착) 검사.
 * @param ownLabel 이 값이 속한 빈칸 라벨. 값에 **다른** 빈칸 라벨이 붙어 있으면
 *   어느 칸의 값인지 확정 불가이므로 자리를 지목해 반려한다(스냅은 지우지 않는다).
 */
function valueSurfaceIssues(where: string, value: string, ownLabel?: string): string[] {
  const v: string[] = [];
  if (HANGUL_RE.test(value)) {
    v.push(`${where} 값에 한국어가 섞임: '${value.slice(0, 30)}' — 영어 단어·어구여야 함`);
  } else if (!LATIN_RE.test(value)) {
    v.push(`${where} 값이 영어가 아님: '${value.slice(0, 30)}'`);
  }
  const foreign = value.match(LEADING_LABEL_RE)?.[1]?.toUpperCase();
  if (foreign && ownLabel && `(${foreign})` !== ownLabel) {
    v.push(
      `${where} 줄의 값에 다른 빈칸 라벨 (${foreign}) 가 붙어 있음: '${value.slice(0, 30)}' — 어느 빈칸의 값인지 확정 불가. 라벨은 머리표에만 쓰고 값에는 그 칸의 답만 적을 것`,
    );
  } else if (/[(（]\s*[A-Ea-e]\s*[)）]/.test(value)) {
    v.push(`${where} 값에 빈칸 라벨이 붙어 있음: '${value.slice(0, 30)}' — 값만 적을 것`);
  }
  const wordCount = words(value).length;
  if (wordCount > ANSWER_MAX_WORDS) {
    v.push(
      `${where} 값이 ${wordCount}단어로 김 (${ANSWER_MAX_WORDS}단어 이하): '${value.slice(0, 40)}'`,
    );
  }
  return v;
}

/**
 * 정답 값의 **대안 나열** 검출 — 정답 전용 검사다.
 *
 * 이 유형의 채점은 EXACT 다(grade.ts). `정답(A): untrained/unpracticed` 가 통과하면
 * 그 문자열 **전체**가 유일한 정답이 되어 `untrained` 를 쓴 학생도 0점이고, 쉼표형은
 * correctAnswer 문자열("(A) untrained, unpracticed, (B) ...")까지 깨져 강사 검수면에서
 * 빈칸 경계를 읽을 수 없다. 프롬프트는 동치를 `허용답(X):` 로 보내라고 지시하므로,
 * 정답 줄의 목록 표기는 곧 '허용답이 정답 줄로 샌' 신호다.
 * ⚠ 허용답 값에는 적용하지 않는다 — 거기서는 목록이 정상이다.
 */
const ANSWER_ALTERNATIVE_PATTERNS: readonly { re: RegExp; what: string }[] = [
  { re: /\//, what: "슬래시(/)" },
  { re: /[,，]/, what: "쉼표(,)" },
  { re: /[;；]/, what: "세미콜론(;)" },
  { re: /[(（]\s*or\b/i, what: "괄호 병기((or ...))" },
  { re: /(?:^|\s)or(?:\s|$)/i, what: "or" },
  { re: /또는|혹은/, what: "또는" },
];

function answerAlternativeIssue(label: string, value: string): string | null {
  const hit = ANSWER_ALTERNATIVE_PATTERNS.find((p) => p.re.test(value));
  if (!hit) return null;
  return `정답${label} 값에 대안이 ${hit.what} 로 나열됨: '${value.slice(0, 40)}' — 정답은 하나만 적고 동치는 허용답${label} 줄로 옮길 것`;
}

/**
 * 0원 결정형 게이트 — 빈 배열이면 클린.
 * @param options.blankCount 교사 설정(1~5). 미지정이면 파싱된 빈칸 수를 기대값으로 쓴다.
 */
export function gateMdSummaryComplete(
  q: MdSummaryCompleteQuestion,
  passage: string,
  options?: { blankCount?: number },
): string[] {
  const blankCount = options?.blankCount ?? q.blanks.length;
  const labels = summaryCompleteMdLabels(blankCount);
  const v: string[] = [];

  // #1 요약문 — 없으면 이후 검사가 전부 무의미하다(검증기 summary-complete-missing-summary).
  if (!q.summary) {
    return ["요약문 누락 — '요약문:' 줄이 없거나 비어 있음"];
  }

  // ── ① 요약문 무결성 ────────────────────────────────────────────────────────
  // #2 라벨 개수·순서. 학생이 읽는 순서와 정답 줄 순서가 어긋나면 채점 키가 흔들린다.
  const sequence = summaryCompleteLabelSequence(q.summary);
  const extraLabels = [...new Set(sequence.filter((l) => !labels.includes(l)))];
  if (extraLabels.length > 0) {
    v.push(
      `요약문에 설정 범위 밖 빈칸 라벨 ${extraLabels.join("")} 가 있음 — ${labels.join("")} 만 써야 함`,
    );
  }
  if (sequence.join("") !== labels.join("")) {
    v.push(
      `요약문 빈칸 라벨이 ${labels.join("")} 순서로 각 1회가 아님 — 실제 ${sequence.join("") || "없음"}`,
    );
  }
  for (const label of labels) {
    const count = sequence.filter((l) => l === label).length;
    if (count !== 1) {
      v.push(`요약문에 ${label} 가 ${count}회 등장 (정확히 1회 필요)`);
    }
  }

  // #3 요약문 언어 — 학생 표면은 영어 한 문장이다.
  if (HANGUL_RE.test(q.summary)) {
    v.push("요약문에 한국어가 섞임 — 영어 한 문장이어야 함");
  }
  if (!LATIN_RE.test(stripSummaryCompleteMarkers(q.summary))) {
    v.push("요약문에 영어 본문이 없음");
  }

  // #4 절단·다문장 검출.
  const tail = q.summary.replace(/["'”’)\]\s]+$/g, "");
  if (tail && !/[.!?]$/.test(tail)) {
    v.push(
      `요약문이 문장 종결 부호 없이 끝남("...${tail.slice(-25)}") — 생성이 잘린 요약문`,
    );
  }
  if (sentenceEndCount(q.summary) > 1) {
    v.push("요약문이 두 문장 이상 — 한 문장으로 압축해야 함");
  }

  // #5 분량 — 한 문장 압축의 상식 범위.
  const summaryWords = words(stripSummaryCompleteMarkers(q.summary)).length;
  if (summaryWords < SUMMARY_MIN_WORDS) {
    v.push(
      `요약문이 ${summaryWords}단어로 너무 짧음 (${SUMMARY_MIN_WORDS}단어 이상 필요)`,
    );
  } else if (summaryWords > SUMMARY_MAX_WORDS) {
    v.push(`요약문이 ${summaryWords}단어로 너무 김 (${SUMMARY_MAX_WORDS}단어 이하)`);
  }

  // #6 빈칸 자리 표기 — 밑줄은 시험지가 자동으로 넣는다(addSummaryCompleteMcBlankLines).
  //    남아 있으면 `(A) _____ _____` 로 이중 인쇄된다.
  if (/_{2,}/.test(q.summary)) {
    v.push("요약문에 밑줄(_____)이 있음 — 빈칸 자리는 라벨 (A) 로만 표시할 것");
  }

  // #7 지문 복사 — 이 유형의 정체성(압축 재진술)을 지키는 핵심 게이트.
  const copied = findCopiedRun(q.summary, passage);
  if (copied) {
    v.push(
      `요약문이 지문을 연속 ${COPY_NGRAM}단어 이상 그대로 옮김("${copied}") — 재진술로 다시 쓸 것`,
    );
  }

  // ── ② 채점 계약(정답 축) ───────────────────────────────────────────────────
  const byLabel = new Map(q.blanks.map((b) => [b.label, b]));
  for (const label of labels) {
    const blank = byLabel.get(label);
    if (!blank || !blank.answer.trim()) {
      v.push(`정답${label} 줄을 인식할 수 없음(받은 값: '${blank?.answer ?? ""}')`);
    }
  }
  for (const blank of q.blanks) {
    if (!labels.includes(blank.label)) {
      v.push(
        `설정 범위 밖 빈칸 라벨 ${blank.label} 의 정답 줄이 있음 — ${labels.join("")} 만 써야 함`,
      );
    }
  }

  const summaryKey = summaryCompleteCmp(q.summary);
  const answerKeyByLabel = new Map(
    q.blanks
      .filter((b) => b.answer.trim())
      .map((b) => [b.label, summaryCompleteCmp(b.answer)] as const),
  );
  const seenAnswers = new Map<string, string>();

  for (const blank of q.blanks) {
    const answer = blank.answer.trim();
    if (!answer) continue;
    v.push(...valueSurfaceIssues(`정답${blank.label}`, answer, blank.label));
    const alternative = answerAlternativeIssue(blank.label, answer);
    if (alternative) v.push(alternative);

    // #8 정답 노출 — 요약문에 정답이 그대로 있으면 빈칸이 무의미해진다
    //    (검증기 summary-complete-answer-leaks-in-summary 선반영).
    const key = summaryCompleteCmp(answer);
    if (key.length >= LEAK_MIN_CHARS && summaryKey.includes(key)) {
      v.push(
        `${blank.label} 정답('${answer}')이 요약문에 그대로 노출됨 — 빈칸이 무의미해짐`,
      );
    }

    // #9 정답 중복 — 두 칸이 같은 답이면 한 칸만 물은 문항이다
    //    (검증기 duplicate-summary-answer 선반영).
    const prev = seenAnswers.get(key);
    if (prev) {
      v.push(`${prev}와 ${blank.label}의 정답이 동일('${answer}') — 서로 다른 논지를 물어야 함`);
    } else {
      seenAnswers.set(key, blank.label);
    }

    // #10 지문 통째 복사 — 지문이 문항 안에 함께 보이므로 베껴쓰기 과제가 된다.
    const run = verbatimCopyRun(answer, passage);
    if (run) {
      v.push(
        `${blank.label} 정답이 지문 문장의 통째 복사입니다: "${run}". 상위 개념·재진술로 다시 설계하라.`,
      );
    }
  }

  // ── ③ 허용답 위생 — 오답을 만점으로 흡수하는 유일한 통로 ────────────────────
  for (const blank of q.blanks) {
    const ownKey = summaryCompleteCmp(blank.answer);
    const seen = new Set<string>();
    for (const raw of blank.accepted) {
      const value = raw.trim();
      const where = `허용답${blank.label}`;
      if (!value) {
        v.push(`${where} 에 빈 값이 있음 — 동치가 없으면 줄 자체를 쓰지 말 것`);
        continue;
      }
      v.push(...valueSurfaceIssues(where, value, blank.label));

      const key = summaryCompleteCmp(value);
      if (key && key === ownKey) {
        v.push(`${where} 에 정답과 같은 값('${value}')이 있음 — 정답은 자동으로 포함된다`);
      }
      if (key && seen.has(key)) {
        v.push(`${where} 에 같은 값('${value}')이 두 번 있음`);
      }
      seen.add(key);

      if (key.length >= LEAK_MIN_CHARS && summaryKey.includes(key)) {
        v.push(`${where} 값('${value}')이 요약문에 그대로 노출됨 — 그 빈칸이 무의미해짐`);
      }
      // 다른 빈칸의 정답을 허용답에 실으면 두 칸이 같은 답을 받는다(채점 사고).
      for (const [otherLabel, otherKey] of answerKeyByLabel) {
        if (otherLabel === blank.label) continue;
        if (key && key === otherKey) {
          v.push(
            `${where} 값('${value}')이 ${otherLabel} 의 정답과 동일 — 두 빈칸이 같은 답을 받게 됨`,
          );
        }
      }
    }
  }

  // ── 해설 축 ────────────────────────────────────────────────────────────────
  if (!q.explanation) {
    v.push("해설 누락 — '해설:' 줄이 필요함");
  } else if (!HANGUL_RE.test(q.explanation)) {
    v.push("해설이 한국어가 아님 — 해설은 한국어로 쓸 것(지문 표현 인용만 영어 허용)");
  }

  return v;
}
