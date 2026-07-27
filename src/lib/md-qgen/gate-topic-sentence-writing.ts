// ============================================================================
// 주제문 영작(TOPIC_SENTENCE_WRITING) 0원 결정형 게이트.
// 파일 분할 규약(500줄)에 따라 parser-topic-sentence-writing.ts 에서 분리
// (0원 스냅은 snap-topic-sentence-writing.ts — 파싱/보정/검사 3단 분리).
//
// 설계: md-stream 은 validateQuestionQuality 결과를 **차단하지 않고 기록만** 하므로
// (route.ts:1080-1099) fast 폴백 경로에서 실제 차단되는 코드들을 여기서 결정형으로
// 선행 차단한다. 이식 대상(정찰 §4 실측):
//   sw-modelanswer-present · tsw-mode-xor · sw-answer-language ·
//   tsw-scrambled-too-few · punctuation-only-chunk · scrambled-already-solved ·
//   tsw-scrambled-reconstruct · sw-summary-blank-marker-count ·
//   tsw-cloze-degenerate-stem · tsw-blank-answer-present ·
//   sw-answer-not-in-summary · tsw-answer-not-buildable-from-wordbank ·
//   writing-answer-verbatim-copy
//
// 게이트 메시지는 **자리를 지목**한다(철칙5) — 그 문구가 곧 재생성 프롬프트 피드백이다.
// ============================================================================

import {
  answerRunInPassage,
  containsHangul,
  containsLatinLetter,
  countLiteral,
  countWords,
  summaryWritingComparableTokens,
} from "@/lib/question-quality/core";
import { findUnbuildableWordBankBlanks } from "@/lib/question-quality/validators/summary/writing";
import { chipsAreInAnswerOrder } from "@/lib/topic-sentence-writing";
import { normalizeWs } from "./parser";
import {
  sameTswTokenMultiset,
  tswBlankAnswerSequence,
  tswWordTokens,
  type MdTswQuestion,
} from "./parser-topic-sentence-writing";
import {
  tswMdBlankLabels,
  type TswMdShape,
} from "./prompts-topic-sentence-writing";

/** topicForm 별 완성 답안 길이 허용폭(스키마 권장 12~14 / ≤12 보다 넉넉하게). */
const WORD_RANGE: Record<TswMdShape["topicForm"], { min: number; max: number }> = {
  sentence: { min: 6, max: 24 },
  nounPhrase: { min: 3, max: 16 },
};

function isEnglishAnswer(value: string): boolean {
  return Boolean(value) && !containsHangul(value) && containsLatinLetter(value);
}

/** 두 토큰열이 길이 2+ 의 연속 부분열을 공유하는가(validators/topic-sentence 동형). */
function sharesConsecutiveRun(a: string[], b: string[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const seq = ` ${b.join(" ")} `;
  for (let i = 0; i + 2 <= a.length; i += 1) {
    for (let len = a.length - i; len >= 2; len -= 1) {
      if (seq.includes(` ${a.slice(i, i + len).join(" ")} `)) return true;
    }
  }
  return false;
}

/** 정답이 지문 문장의 사실상 통째 복사인가(dispatcher.ts:1072-1090 동형). */
function verbatimCopyRun(phrase: string, passage: string): string {
  const tokens = summaryWritingComparableTokens(phrase);
  if (tokens.length < 6) return "";
  return answerRunInPassage(
    phrase,
    passage,
    Math.max(6, Math.ceil(tokens.length * 0.8)),
  );
}

function chipsWithoutDistractors(chips: string[], distractors: string[]): string[] {
  const rest = [...chips];
  for (const distractor of distractors) {
    const key = normalizeWs(distractor).toLowerCase();
    const index = rest.findIndex((chip) => normalizeWs(chip).toLowerCase() === key);
    if (index >= 0) rest.splice(index, 1);
  }
  return rest;
}

function multisetDiff(
  supply: string[],
  demand: string[],
): { missing: string[]; surplus: string[] } {
  const counts = new Map<string, number>();
  for (const token of supply) counts.set(token, (counts.get(token) ?? 0) + 1);
  const missing: string[] = [];
  for (const token of demand) {
    const left = counts.get(token) ?? 0;
    if (left > 0) counts.set(token, left - 1);
    else missing.push(token);
  }
  const surplus: string[] = [];
  for (const [token, left] of counts) {
    for (let i = 0; i < left; i += 1) surplus.push(token);
  }
  return { missing, surplus };
}

function quote(list: string[], max = 4): string {
  return list
    .slice(0, max)
    .map((item) => `"${item}"`)
    .join(", ");
}

// ── 공통 게이트 ────────────────────────────────────────────────────────────
function gateCommon(
  q: MdTswQuestion,
  passage: string,
  shape: TswMdShape,
): string[] {
  const v: string[] = [];

  // 원인을 지목한다(철칙3·5) — 표로 낸 출력은 모든 라벨이 한꺼번에 유실돼 종전에는
  // "주제문 누락·재료 0개·해설 누락" 6건이 쏟아지고 정작 '표로 냈다'는 말이 없었다.
  if (!q.topic) {
    v.push(
      q.sawTableLayout
        ? "주제문 줄 누락 — 출력이 마크다운 표로 보인다. 표를 쓰지 말고 `주제문: <값>` 처럼 **라벨: 값** 한 줄 형식으로 다시 내라"
        : "주제문 줄 누락 — `주제문:` 으로 시작하는 줄이 필요하다",
    );
  }
  // ⚠ `방식:` 줄 불일치는 **반려 사유가 아니다**(§1-B 철칙1 — 설정이 진실원인 상수의
  // 에코라 정보량 0). 스냅이 corrections 로 기록하고, 모드 위반의 실제 검출기는
  // 아래 모드 XOR 게이트다. 종전에는 모델의 사족 한 줄이 완벽한 문항을 반려시켰다.

  if (!q.modelAnswer) {
    v.push("모범답안이 비어 있음(주제문/빈칸 정답으로 완성문을 만들 수 없음)");
  } else {
    if (!isEnglishAnswer(q.modelAnswer)) {
      v.push(`모범답안이 영어가 아님: '${q.modelAnswer.slice(0, 50)}'`);
    }
    const words = countWords(q.modelAnswer);
    const range = WORD_RANGE[shape.topicForm];
    if (words < range.min || words > range.max) {
      v.push(
        `완성 답안이 ${words}단어 — ${
          shape.topicForm === "nounPhrase" ? "주제 명사구" : "주제문"
        }은 ${range.min}~${range.max}단어여야 한다`,
      );
    }
    const copied = verbatimCopyRun(q.modelAnswer, passage);
    if (copied) {
      v.push(
        `모범답안이 지문 문장의 통째 복사입니다: "${copied}". 시제·태·구문 전환이나 상위어 환언을 최소 1개 넣어 다시 설계하라`,
      );
    }
  }

  // 힌트 — 발문이 "[주제 힌트]를 참고하여"를 약속하므로 실물이 있어야 한다.
  if (shape.hintEnabled && !q.hint) {
    v.push("[주제 힌트] 사용 설정인데 `힌트:` 줄이 없음 — 발문이 없는 박스를 가리키게 된다");
  }
  if (q.hint) {
    const glossTokens = summaryWritingComparableTokens(q.hint);
    const leakSources = [q.modelAnswer, ...q.blanks.map((b) => b.answer)].filter(Boolean);
    for (const phrase of leakSources) {
      if (sharesConsecutiveRun(summaryWritingComparableTokens(phrase), glossTokens)) {
        v.push(
          `[주제 힌트]에 정답 어구가 그대로 노출됨: '${phrase.slice(0, 50)}' — 힌트는 논지 방향만 가리켜라`,
        );
        break;
      }
    }
  }

  // 미끼 — 설정 개수 집행. 스냅이 verbatim 배열에서는 칩 타일링으로 **파생 확정**하므로
  // (§1-B 철칙1) 그때는 `미끼:` 줄 유무와 무관하게 "남는 칩 수"만 검사한다. 선언 안 된
  // 잉여는 발문("쓰지 않는 단어가 포함됨")을 거짓으로 만든다.
  //
  // ⚠ 파생 레짐(verbatim 배열)에서 프롬프트는 `미끼:` 줄을 **쓰지 말라**고 지시한다.
  // 타일링이 실패했는데 "미끼 N개(설정은 M개)"를 반려 사유로 쓰면, 계약이 금지한 줄을
  // 쓰라는 **자기모순 피드백**이 되어 재생성이 같은 반려로 되돌아온다(철칙5 — 실패+환불).
  // 그 경우 진짜 원인(부족·잉여 토큰)은 gateScrambled 가 자리와 함께 지목하므로,
  // 모델이 실제로 미끼 줄을 낸 경우에만 개수를 따진다.
  const derivationRegime = q.mode === "scrambled" && shape.fidelity === "verbatim";
  const countMeaningful =
    q.distractorsDerived || !derivationRegime || q.distractors.length > 0;
  if (countMeaningful && q.distractors.length !== shape.distractors) {
    v.push(
      q.distractorsDerived
        ? `정답 조립에 쓰이지 않는 잉여 재료가 ${q.distractors.length}개 (설정은 정확히 ${shape.distractors}개)${
            q.distractors.length > 0
              ? ` — 남는 칩 ${quote(q.distractors)}`
              : ` — 정답에 쓰이지 않는 미끼 재료 ${shape.distractors}개를 칩 나열에 섞어라`
          }`
        : `미끼 ${q.distractors.length}개 (설정은 정확히 ${shape.distractors}개)${
            shape.distractors === 0
              ? " — 미끼 0개 설정이라 발문에 '쓰지 않는 단어' 안내가 없다"
              : ""
          }`,
    );
  }
  // 파생 확정된 미끼는 정의상 칩 원문이므로 실재 검사가 항상 참이다(검사 생략).
  if (!q.distractorsDerived) {
    const chipKeys = new Set(q.chips.map((chip) => normalizeWs(chip).toLowerCase()));
    for (const distractor of q.distractors) {
      if (!chipKeys.has(normalizeWs(distractor).toLowerCase())) {
        v.push(
          `미끼 '${distractor}' 가 제시 재료 안에 없음 — 미끼는 화면에 실제로 있는 칩이어야 한다`,
        );
      }
    }
  }

  // 칩 위생
  for (const chip of q.chips) {
    if (/^[^\wA-Za-z]+$/.test(chip)) {
      v.push(`구두점만으로 된 재료가 있음: '${chip}'`);
    }
  }

  if (!q.explanation) v.push("해설 누락");
  if (shape.scoringGranularity === "rubric" && q.scoringCriteria.length < 2) {
    v.push(
      `채점기준 ${q.scoringCriteria.length}개 (루브릭 채점 설정이라 2개 이상 필요)`,
    );
  }

  return v;
}

// ── scrambled(배열) 게이트 ─────────────────────────────────────────────────
function gateScrambled(q: MdTswQuestion, shape: TswMdShape): string[] {
  const v: string[] = [];

  if (q.sawAnswerLine) {
    v.push(
      "설정은 배열(scrambled) 모드인데 빈칸 정답 줄(`정답(A):`)이 있음 — 두 모드를 섞으면 렌더·채점이 갈린다",
    );
  }
  if (q.chips.length < 2) {
    v.push(`배열 재료가 ${q.chips.length}개 — \`칩:\` 줄에 2개 이상 필요하다`);
    return v;
  }

  // 어순 누수 — 스냅이 결정론 재배열한 **결과물**을 검사한다(위험 #1 심층 방어).
  if (
    q.modelAnswer &&
    (q.chips.join(" ") === q.modelAnswer ||
      chipsAreInAnswerOrder(q.chips, q.modelAnswer))
  ) {
    v.push("칩 나열이 정답 어순대로 읽혀 어순이 누설됨(재배열해도 탈출 불가한 칩 구성)");
  }

  // 한 칩이 정답 전체를 담으면 배열이 아니라 받아쓰기다.
  const answerTokens = summaryWritingComparableTokens(q.modelAnswer);
  if (answerTokens.length >= 2) {
    const phrase = ` ${answerTokens.join(" ")} `;
    for (const chip of q.chips) {
      if (` ${summaryWritingComparableTokens(chip).join(" ")} `.includes(phrase)) {
        v.push(`재료 '${chip.slice(0, 50)}' 하나가 정답 전체를 담고 있음 — 더 쪼개라`);
        break;
      }
    }
  }

  // 재구성 가능성 — verbatim 은 과부족 0 타일링, 그 외는 어간 커버리지.
  // ⚠ 정답 토큰이 하나도 없으면(주제문 누락·한국어 정답) 타일링 대조는 "칩 전부가 잉여"
  // 라는 거짓 원인을 만든다 — 진짜 원인은 gateCommon 이 이미 지목했으므로 건너뛴다(철칙5).
  if (tswWordTokens(q.modelAnswer).length === 0) return v;
  const answerOnly = chipsWithoutDistractors(q.chips, q.distractors);
  if (shape.fidelity === "verbatim") {
    const { missing, surplus } = multisetDiff(
      answerOnly.flatMap((chip) => tswWordTokens(chip)),
      tswWordTokens(q.modelAnswer),
    );
    if (missing.length > 0) {
      v.push(
        `미끼를 뺀 재료로 정답을 조립할 수 없음 — 부족 토큰 ${quote(missing)}${
          missing.length > 4 ? ` 외 ${missing.length - 4}개` : ""
        }`,
      );
    }
    if (surplus.length > 0) {
      // 파생 레짐에서는 `미끼:` 줄 선언을 지시하면 안 된다 — 프롬프트가 금지한 줄이다.
      // 여기까지 왔다는 것은 타일링이 실패했다는 뜻이고, 실패 원인은 언제나 "정답에
      // 일부만 쓰이는 칩"이다(칩이 통째로 남으면 그 칩이 미끼로 확정됐을 것이다).
      const surplusTokens = new Set(surplus);
      const straddling = answerOnly.find((chip) => {
        const tokens = tswWordTokens(chip);
        return (
          tokens.some((token) => surplusTokens.has(token)) &&
          tokens.some((token) => !surplusTokens.has(token))
        );
      });
      v.push(
        !q.distractorsDerived
          ? `정답에 쓰이지 않는 잉여 토큰이 있음 — ${quote(surplus)}. 재료 하나는 **통째로 쓰이거나 통째로 안 쓰이거나** 둘 중 하나여야 한다(정답에 일부만 쓰이는 재료는 학생이 배열할 수 없다)${
              straddling ? `. 그렇게 보이는 재료: '${straddling.slice(0, 40)}'` : ""
            }`
          : `미끼로 선언되지 않은 잉여 재료가 있음 — 남는 토큰 ${quote(surplus)}. 미끼면 \`미끼:\` 줄에 선언하고, 아니면 빼라`,
      );
    }
  } else {
    const stem = (token: string) => token.slice(0, 4);
    const chipStems = new Set(
      answerOnly.flatMap((chip) => summaryWritingComparableTokens(chip)).map(stem),
    );
    const answerStems = [...new Set(answerTokens.map(stem))];
    const missing = answerStems.filter((s) => !chipStems.has(s));
    if (answerStems.length >= 3 && missing.length >= 2) {
      v.push(
        `정답 조립에 필요한 핵심 내용어 ${missing.length}개가 재료에 없음 — 부족 어간 ${quote(missing)}`,
      );
    }
    // 비-verbatim 분기는 '부족'만 세고 **잉여는 보지 않아서**, 모델이 주제문을 두 줄로
    // 접어 내 정답이 절단돼도(칩은 온전한 문장분) 게이트가 클린이었다 — 조각이 정답지로
    // 출하되고 칩을 전부 배열한 학생이 전원 자동 오답이 되는 critical silent-drop.
    // 어형 변형·기능어 병합 여지를 20% 여유로 허용하고 그 위를 절단으로 지목한다.
    const supply = answerOnly.flatMap((chip) => tswWordTokens(chip)).length;
    const demand = tswWordTokens(q.modelAnswer).length;
    const slack = Math.max(1, Math.round(demand * 0.2));
    if (demand > 0 && supply > demand + slack) {
      v.push(
        `미끼를 뺀 재료(${supply}토큰)가 정답(${demand}토큰)보다 ${supply - demand}토큰 많음 — 모범답안이 잘려 들어왔거나 선언되지 않은 잉여 재료가 있다. \`주제문:\` 은 줄바꿈 없이 한 줄로 완결해서 내라`,
      );
    }
  }

  // 허용답 — 스냅이 절삭했으므로 잔여는 전부 멀티셋 동일이어야 한다(사후 불변식).
  for (const variant of q.acceptedVariants) {
    if (!sameTswTokenMultiset(variant, q.modelAnswer)) {
      v.push(`허용답 '${variant.slice(0, 50)}' 가 모범답안과 토큰 구성이 다름`);
    }
  }

  return v;
}

// ── cloze(빈칸 완성) 게이트 ────────────────────────────────────────────────
function gateCloze(q: MdTswQuestion, passage: string, shape: TswMdShape): string[] {
  const v: string[] = [];
  const expected = tswMdBlankLabels(shape.blankCount);

  if (!q.sawAnswerLine) {
    v.push(
      `설정은 빈칸 완성(cloze) 모드인데 빈칸 정답 줄이 없음 — ${expected
        .map((label) => `\`정답${label}:\``)
        .join(" · ")} 을 내라`,
    );
  }
  if (q.chips.length === 0) {
    v.push("`보기:` 줄 누락 — 발문이 [보기]를 지시하므로 칩이 반드시 있어야 한다");
  }
  if (q.blanks.length !== expected.length) {
    v.push(`빈칸 ${q.blanks.length}개 (${expected.length}개 필요)`);
  }
  const actualLabels = q.blanks.map((blank) => blank.label);
  if (actualLabels.join("") !== expected.join("")) {
    v.push(
      `빈칸 라벨이 ${expected.join("")} 순이 아님 — 실제 ${actualLabels.join("") || "없음"}`,
    );
  }

  // 주제문 placeholder 정합 — 라벨이 정확히 1회씩 있어야 마스킹·렌더가 성립한다.
  for (const label of expected) {
    const times = countLiteral(q.topic, label);
    if (times !== 1) {
      v.push(`주제문에 ${label} 가 ${times}회 — 정확히 1회여야 한다`);
    }
  }

  // 퇴화 stem — 라벨을 걷어낸 골격에 내용 단어가 3개 미만이면 발문이 성립하지 않는다.
  if (q.topic) {
    const stemTokens = q.topic
      .replace(/\([A-J]\)/g, " ")
      .split(/\s+/)
      .filter((token) => /[A-Za-z]/.test(token));
    if (stemTokens.length < 3) {
      v.push(
        `주제문 골격에 내용 단어가 ${stemTokens.length}개뿐 — 빈칸을 빼고도 완결된 문장 뼈대가 보여야 한다`,
      );
    }
  }

  const seenAnswers = new Set<string>();
  for (const blank of q.blanks) {
    if (!blank.answer) {
      v.push(`${blank.label} 정답 누락`);
      continue;
    }
    if (!isEnglishAnswer(blank.answer)) {
      v.push(`${blank.label} 정답이 영어가 아님: '${blank.answer.slice(0, 40)}'`);
    }
    if (tswWordTokens(blank.answer).length < 2) {
      v.push(
        `${blank.label} 정답이 한 단어('${blank.answer}') — 이 유형의 빈칸은 다단어 어구를 받는 자리다`,
      );
    }
    const key = normalizeWs(blank.answer).toLowerCase();
    if (seenAnswers.has(key)) v.push(`빈칸 정답 중복: '${blank.answer}'`);
    seenAnswers.add(key);

    const copied = verbatimCopyRun(blank.answer, passage);
    if (copied) {
      v.push(`${blank.label} 정답이 지문 문장의 통째 복사입니다: "${copied}"`);
    }
  }

  // 정답 어구가 학생 노출 주제문에 통째로 박혀 있으면 받아쓰기 전락.
  if (q.topic) {
    const topicSeq = ` ${summaryWritingComparableTokens(
      q.topic.replace(/\([A-J]\)/g, " "),
    ).join(" ")} `;
    for (const blank of q.blanks) {
      const tokens = summaryWritingComparableTokens(blank.answer);
      if (tokens.length >= 2 && topicSeq.includes(` ${tokens.join(" ")} `)) {
        v.push(
          `${blank.label} 정답이 주제문에 그대로 노출됨: "${tokens.join(" ")}" — 빈칸 자리에는 라벨만 두어라`,
        );
        break;
      }
    }
  }

  if (q.chips.length > 0) {
    // 보기 어순 누수 — 기준은 modelAnswer 가 아니라 "빈칸 정답 이어붙임"이다.
    const sequence = tswBlankAnswerSequence(q.blanks);
    if (q.chips.length >= 2 && sequence && chipsAreInAnswerOrder(q.chips, sequence)) {
      v.push("[보기]가 빈칸 정답 어순대로 읽혀 어순이 누설됨");
    }

    // 조립 가능성 — 검증기와 같은 알고리즘(멀티셋·기능어 정확일치·굴절 흡수).
    const buildBlanks = q.blanks
      .filter((blank) => blank.answer)
      .map((blank) => ({
        label: blank.label,
        candidates: [blank.answer, ...blank.variants],
      }));
    if (buildBlanks.length > 0) {
      const defects = findUnbuildableWordBankBlanks(q.chips, buildBlanks);
      for (const defect of defects) {
        v.push(
          `[보기] 칩으로 ${defect.label} 정답 조립 불가 — 부족 토큰 ${quote(defect.missing)}. 필요한 단어를 보기에 넣어라(같은 단어가 두 번 필요하면 칩도 두 개)`,
        );
      }
    }

    // 한 칩이 다단어 정답을 통째로 담으면 영작이 아니라 옮겨 적기다.
    for (const chip of q.chips) {
      const chipSeq = ` ${summaryWritingComparableTokens(chip).join(" ")} `;
      const hit = q.blanks.find((blank) => {
        const tokens = summaryWritingComparableTokens(blank.answer);
        return tokens.length >= 2 && chipSeq.includes(` ${tokens.join(" ")} `);
      });
      if (hit) {
        v.push(`재료 '${chip.slice(0, 50)}' 하나가 ${hit.label} 정답을 통째로 담고 있음`);
        break;
      }
    }
  }

  return v;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdTopicSentenceWriting(
  q: MdTswQuestion,
  passage: string,
  shape: TswMdShape,
): string[] {
  return [
    ...gateCommon(q, passage, shape),
    ...(q.mode === "scrambled" ? gateScrambled(q, shape) : gateCloze(q, passage, shape)),
  ];
}
