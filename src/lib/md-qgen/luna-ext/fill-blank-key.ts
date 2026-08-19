// ============================================================================
// FILL_BLANK_KEY(핵심어 빈칸·주관식) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 서술형 계열(선지 없음). 파싱 산출물은 MdFillBlankKeyQuestion 동형으로 만들어
// 레인의 스냅(autoSnapFillBlankKey)·게이트(gateMdFillBlankKey)·어댑터를 전부
// 재사용한다.
//
// acceptedAnswers 를 스키마에 두지 않는 이유(md 프롬프트와 동일 판단 —
// prompts-fill-blank-key.ts 헤더 :15-22):
//   이 유형의 허용답 계약은 "표기 변형만"(question-schemas-essay.ts:96-98)이고,
//   표기 변형(축약형·대소문자·문말 구두점)은 전부 어댑터가 결정론으로 파생한다
//   (adapter-fill-blank-key.ts buildFillBlankKeyAcceptedAnswers). 모델에게 칸을
//   주면 동의어가 한 줄 섞이는 순간 지문에 없는 표현을 쓴 학생이 만점을 받는
//   되돌릴 수 없는 채점 사고가 난다. strict 스키마에서 칸 자체를 없애면 그 실패
//   모드가 **구조적으로 소멸**한다 — SPEC §패밀리 특칙의 "표기 변형 전부 나열"
//   검산은 스키마에 칸이 있을 때의 처방이므로 여기선 결정론 파생이 그 자리다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import type { MdDifficulty } from "../prompts";
import {
  FILL_BLANK_KEY_MD_BLANK,
  FILL_BLANK_KEY_MD_QUOTE_WORD_MAX,
  FILL_BLANK_KEY_MD_WORD_MAX,
  FILL_BLANK_KEY_MD_WORD_MIN,
} from "../prompts-fill-blank-key";
import {
  answerBoundaryRegex,
  autoSnapFillBlankKey,
  cleanFillBlankKeyValue,
  fillBlankKeyFrameMatches,
  countFillBlankKeyAnswerOccurrences,
  type MdFillBlankKeyQuestion,
} from "../parser-fill-blank-key";
import { gateMdFillBlankKey } from "../gate-fill-blank-key";
import { FILL_BLANK_KEY_MD_DIRECTION } from "../adapter-fill-blank-key";

/** 난이도별 권장 정답 폭 — 프롬프트(buildMdFillBlankKeyPrompt wordHint)와 동기. */
function wordHintOf(difficulty: MdDifficulty): string {
  return difficulty === "BASIC"
    ? "2~3단어"
    : difficulty === "INTERMEDIATE"
      ? "3~4단어"
      : "2~5단어";
}

/**
 * 해설 미완결 검출(ext 자체 검사 — 레인 게이트는 explanation 완결을 보지 않는다).
 *
 * 실측 근거(FILL_BLANK_KEY 1차 벤치 luna 행, passage cmsilz13z…): 모델이
 * `finishMe`가 아니라 finishReason "stop" 으로 JSON 을 스스로 닫으면서 해설을
 * "…결론입니다. 앞서" 에서 끊어 출력했고, 레인 게이트가 이를 통과시켜 근거 0줄
 * 짜리 해설이 그대로 출고됐다. 종결어미 검사는 기계로 100% 확정 가능하므로
 * 코어스가 아니라 게이트 이슈로 올려 재생성을 유도한다(SPEC §1-8).
 */
function truncatedExplanationIssues(explanation: string): string[] {
  const t = explanation.trim();
  if (!t) return []; // 빈 해설은 레인 게이트가 이미 잡는다(중복 보고 금지).
  if (!/[.!?。]$/.test(t)) {
    return [
      `해설이 미완결로 끊겼습니다(문장부호로 끝나지 않음): "…${t.slice(-24)}"`,
    ];
  }
  // 합쇼체 종결(…니다. / …시오. / …까?)만 통과 — 해라체 "…된다." 류 문체 이탈 검출.
  if (!/(니다\.|시오\.|까\?)$/.test(t)) {
    return [`해설 마지막 문장이 합쇼체 종결이 아닙니다: "…${t.slice(-24)}"`];
  }
  return [];
}

// ════════════════════════════════════════════════════════════════════════════
// 표적 확정성 — **결정형 장치**(2차 수리, r2 판정 근거).
//
// r1·r2 두 라운드 실측의 결론: 이 유형의 F 는 전부 "표적 자리 선정"에서 난다.
// 그런데 **프롬프트 검산만으로는 봉쇄되지 않는다** — 한 계통을 말로 막으면 모델은
// 다른 나쁜 자리로 이동한다(r2: 계통A 회피 → 계통B·D 신설). 그래서 2차 수리는
// 검산 문장이 아니라 **기계가 세는 규칙** 세 개를 세우고, 그 규칙을 검산 블록에
// 그대로 공개해 모델이 사전에 회피하게 한다(반려는 최후 수단).
//
// 세 규칙은 전부 **고정밀 저재현**으로 설계했다 — 정상 문항을 죽이면 재생성 1회를
// 태우고 게이트 수율이 떨어지므로, 실측 F 표본이 실제로 걸리는 좁은 형상만 잡는다.
//   D1 부정 극성 자리   : 빈칸이 필자가 **부정하는 통념** 안에 있음(r2 Q15)
//   D2 스팬 경계 파손   : 빈칸 직후에 `of ~` 가 남아 답형이 불확정(r2 Q16) → 코어스
//   D3 어휘 앵커 부재   : 정답의 핵심 파생명사·합성어를 지문이 어휘로 정해 주지 않음
//                        (r2 Q09 emotional investment · r1 Q13 drip-drip-drip ·
//                         r1 Q19 knee-jerk survival actions)
// ════════════════════════════════════════════════════════════════════════════

/** 정답 어구의 단어 수(게이트 wordCount 와 동형). */
function wordCount(value: string): number {
  return value.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

/** 접두 경계만 보는 어근 탐색 — invest → investing/investment 를 같은 어근으로 본다. */
function stemAppears(haystack: string, stem: string): boolean {
  if (stem.length < 4) return false;
  return new RegExp(`(?<![A-Za-z])${stem}`, "i").test(haystack);
}

/** 정답이 실제로 등장한 자리를 지운 지문 — "다른 곳에 어휘 근거가 있는가"의 검사판. */
function passageOutsideAnswer(passage: string, answer: string): string {
  return answer.trim() ? passage.replace(answerBoundaryRegex(answer), " ") : passage;
}

// ── D1 부정 극성 자리 ───────────────────────────────────────────────────────
/**
 * 빈칸 **앞쪽 같은 절**에 부정·통념 표지가 있으면 그 빈칸은 필자가 부정하는 명제의
 * 술어 자리다. 그 자리는 "무엇이 아닌가"만 정해지므로 동의어가 전부 성립한다.
 * 실측(r2 Q15): `experts don't think plants are _____` — 지문이 같은 내용을
 * 'an SOS'·'trouble calls'·'express their discontent' 로 세 번 축자 명시해 두어
 * 발문("본문에서 찾아 쓰시오")이 정답이 아닌 그 어구들을 적극 유도했다.
 *
 * 절 경계(쉼표·세미콜론·대시·역접 접속사) 뒤 구간만 본다 — "Although we do not
 * know the cause, the effect is _____" 같은 정상 자리를 죽이지 않기 위함이다.
 */
// ⚠ 축약형(`don't`·`doesn't`)의 `n't` 는 **앞이 반드시 낱자**라, 다른 표지와 같은
//   `(?<![A-Za-z])` 룩비하인드에 묶으면 영원히 매칭되지 않는다(실측: r2 Q15
//   "experts don't think plants are _____" 가 이 한 글자 때문에 무검출이었다).
//   축약형만 별도 갈래로 뺀다.
const NEGATION_MARKERS =
  /(?<![A-Za-z])(?:not|never|nothing|neither|nor|hardly|scarcely|rarely|myth|mistakenly|wrongly|falsely|far from|rather than|instead of)(?![A-Za-z])|n['’]t(?![A-Za-z])/i;

function negativePolarityIssues(sentenceWithBlank: string): string[] {
  const marker = /_{3,}/.exec(sentenceWithBlank);
  if (!marker) return [];
  const head = sentenceWithBlank.slice(0, marker.index);
  // 마지막 절 경계 뒤 구간만 남긴다(경계: , ; : — – ( 및 역접·양보 접속사).
  const clause = head
    .split(/[,;:—–(]|(?<![A-Za-z])(?:but|yet|however|although|though|whereas|while)(?![A-Za-z])/i)
    .pop();
  if (!clause || !NEGATION_MARKERS.test(clause)) return [];
  return [
    `빈칸이 필자가 **부정하는 통념** 안에 있습니다(빈칸 앞 같은 절의 부정 표지: "${clause
      .trim()
      .slice(-40)}"). 부정문 자리는 "무엇이 아닌가"만 정해져 동의어가 전부 성립하고, 지문이 그 통념을 다른 어구로 이미 말해 두었을 확률이 높습니다 — 필자가 **긍정하는 주장 문장**으로 표적을 옮기십시오`,
  ];
}

// ── D2 스팬 경계 파손(빈칸 직후 of-구) ──────────────────────────────────────
/** 명사구가 끝나는 자리 — 여기까지가 `of` 보충어다. */
const NP_STOP_WORDS = new Set([
  "in", "on", "at", "for", "to", "from", "with", "by", "into", "onto", "through",
  "during", "without", "about", "over", "under", "between", "among", "against",
  "as", "and", "or", "but", "that", "which", "who", "whom", "whose", "where",
  "when", "while", "because", "so", "if", "than", "is", "are", "was", "were",
  "has", "have", "had", "can", "could", "will", "would", "may", "might", "of",
]);
const ARTICLES = new Set(["a", "an", "the"]);

/**
 * 빈칸 직후가 `of ~` 면 정답 스팬이 **명사구 한가운데서 끊긴** 것이다(r2 Q16:
 * `helps us _____ of the stimuli` / 정답 'reduce the complexity' — 관사 the 를
 * 스팬 안에 품고 보충어 of 구를 밖에 남겨 'make sense'·'reduce complexity' 가
 * 같은 자리에 성립했다). 기계로 확정 가능하므로 **반려가 아니라 교정**한다(SPEC §1-8):
 * of 보충어를 빈칸 안으로 끌어들여 답형을 하나로 고정한다. 확장이 상한을 넘거나
 * 프레임이 복원되지 않으면 손대지 않고 게이트 이슈로 넘긴다(보수 가드).
 */
function coerceDanglingOfComplement(
  q: MdFillBlankKeyQuestion,
  passage: string,
): { question: MdFillBlankKeyQuestion; correction: string } | null {
  const sentence = q.sentenceWithBlank;
  const answer = q.answer.trim();
  const marker = /_{3,}/.exec(sentence);
  if (!marker || !answer) return null;
  const end = marker.index + marker[0].length;
  const tail = sentence.slice(end);
  const of = /^(\s+of\s+)/i.exec(tail);
  if (!of) return null;

  let cursor = of[1].length;
  const picked: string[] = [];
  while (picked.length < 4) {
    const rest = tail.slice(cursor);
    const w = /^([A-Za-z][A-Za-z'’-]*)/.exec(rest);
    if (!w) break;
    const word = w[1];
    if (NP_STOP_WORDS.has(word.toLowerCase())) break;
    picked.push(word);
    const after = rest.slice(word.length);
    const gap = /^\s+/.exec(after);
    cursor += word.length + (gap ? gap[0].length : 0);
    if (!gap) break; // 구두점·문말 — 여기서 명사구가 닫힌다.
  }
  if (!picked.some((w) => !ARTICLES.has(w.toLowerCase()) && w.length >= 3)) return null;

  const nextAnswer = `${answer} of ${picked.join(" ")}`;
  if (wordCount(nextAnswer) > FILL_BLANK_KEY_MD_WORD_MAX) return null;
  const remainder = tail.slice(cursor);
  const nextSentence =
    sentence.slice(0, end) +
    (/^[.,;:!?]/.test(remainder) ? remainder : remainder ? ` ${remainder.trimStart()}` : "");
  if (!fillBlankKeyFrameMatches(passage, nextSentence, nextAnswer)) return null;
  if (countFillBlankKeyAnswerOccurrences(passage, nextAnswer) !== 1) return null;

  return {
    question: { ...q, sentenceWithBlank: nextSentence, answer: nextAnswer },
    correction: `정답 스팬이 명사구 중간에서 끊겨(빈칸 직후 'of ~') of 보충어를 빈칸 안으로 확장: '${answer}' → '${nextAnswer}'`,
  };
}

/** 코어스가 살리지 못한 경계 파손은 반려한다(교정 불가 = 답형 불확정). */
function danglingOfIssues(sentenceWithBlank: string, answer: string): string[] {
  const marker = /_{3,}/.exec(sentenceWithBlank);
  if (!marker || !answer.trim()) return [];
  if (!/^\s+of\s+/i.test(sentenceWithBlank.slice(marker.index + marker[0].length))) return [];
  return [
    `정답 스팬('${answer.slice(0, 40)}')이 명사구 한가운데서 끊겨 보충어 'of ~' 가 빈칸 밖에 남았습니다 — 학생이 어디까지 쓸지 정해지지 않아 답형이 불확정입니다. of 구까지 포함한 완결된 통사 단위로 빈칸을 다시 잡거나(단어 수 상한을 넘으면) 다른 자리를 고르십시오`,
  ];
}

// ── D3 어휘 앵커 부재 ───────────────────────────────────────────────────────
/** 파생명사 접미사 — 어근이 지문에 있어야 학생이 그 **어휘**를 복원할 수 있다. */
const NOMINAL_SUFFIXES = [
  "ments", "ment", "tions", "tion", "sions", "sion", "ities", "ity",
  "nesses", "ness", "ances", "ance", "ences", "ence", "ships", "ship",
  "isms", "ism",
];

function answerTokens(answer: string): string[] {
  return answer.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
}

/**
 * 정답의 **핵심어**(마지막 내용어)가 파생명사인데 그 어근이 지문 어디에도 없으면,
 * 지문은 '뜻'만 정하고 '단어'는 정하지 않은 것이다 — 축자 완전일치 채점이 무너진다.
 * 실측: r2 Q09 'emotional investment'(지문에 invest 계열 0건, 지문이 주는 것은
 * 'The more affected one is' 뿐 → intensity/involvement/influence 가 모두 성립),
 * r1 Q09 'emotional intensity' 도 같은 자리의 같은 결함.
 * ⚠ 이 검사는 **핵심어 하나만** 본다. 모든 내용어로 넓히면 정상 문항('take
 *   ourselves to know')까지 죽는다 — 고정밀 저재현이 설계 의도다.
 */
function lexicalAnchorIssues(answer: string, passage: string): string[] {
  const tokens = answerTokens(answer);
  if (tokens.length === 0) return [];
  const outside = passageOutsideAnswer(passage, answer);
  const issues: string[] = [];

  const head = tokens[tokens.length - 1].replace(/['’]s$/i, "");
  const lower = head.toLowerCase();
  const suffix = NOMINAL_SUFFIXES.find((s) => lower.endsWith(s) && lower.length - s.length >= 4);
  if (suffix) {
    const stem = lower.slice(0, lower.length - suffix.length);
    if (!stemAppears(outside, stem)) {
      issues.push(
        `정답의 핵심어 '${head}'(파생명사)의 어근 '${stem}-' 가 지문 다른 곳에 한 번도 나오지 않습니다 — 지문이 뜻만 정하고 **단어를 정해 주지 않는** 자리라, 같은 뜻의 다른 명사가 전부 정답이 됩니다(축자 완전일치 채점이 무너집니다). 지문이 이미 쓴 어휘로 이루어진 어구를 표적으로 고르십시오`,
      );
    }
  }

  // 하이픈 합성어 — 구성 요소 중 하나도 지문에 없으면 학생이 그 조어를 만들 수 없다.
  for (const token of tokens) {
    if (!token.includes("-")) continue;
    const parts = token.split("-").filter((p) => p.length >= 3);
    if (parts.length < 2) continue;
    if (parts.every((p) => p.toLowerCase() === parts[0].toLowerCase())) {
      issues.push(
        `정답에 같은 말을 반복하는 의성·리듬 표현('${token}')이 들어 있습니다 — 지문이 그 표현을 지목하는 단서를 줄 수 없어 문체 선택이 되어 버립니다. 다른 표적을 고르십시오`,
      );
      continue;
    }
    if (!parts.some((p) => stemAppears(outside, p.toLowerCase()))) {
      issues.push(
        `정답의 합성어 '${token}' 는 구성 요소(${parts.join(", ")}) 중 어느 것도 지문 다른 곳에 나오지 않습니다 — 학생이 그 조어를 복원할 근거가 없습니다(예: 지문에 reflex/instinct 계열이 없는데 'knee-jerk' 를 요구하는 자리). 지문 어휘로 이루어진 표적을 고르십시오`,
      );
    }
  }
  return issues;
}

export const FILL_BLANK_KEY_LUNA_EXT: LunaLaneExt = {
  subType: "FILL_BLANK_KEY",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const wordHint = wordHintOf(ctx.difficulty);
    return {
      name: "fill_blank_key_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        // 필드 순서 = 스트리밍 도착 순서 — 본문성 큰 필드(빈칸문장)를 앞에.
        required: ["sentenceWithBlank", "answer", "explanation"],
        properties: {
          sentenceWithBlank: {
            type: "string",
            description: `지문의 한 문장을 그대로 옮기되 정답 스팬만 ${FILL_BLANK_KEY_MD_BLANK} 로 바꾼 한 줄. 빈칸은 정확히 1개, 빈칸을 제외한 나머지는 원문과 한 글자도(철자·구두점·대소문자) 달라선 안 된다`,
          },
          answer: {
            type: "string",
            description: `${FILL_BLANK_KEY_MD_BLANK} 자리에 원래 있던 지문 축자 표현(${wordHint}) — 관사·문장부호 없이 어구만, 명사구·동사구 하나가 통째로 들어간 완결된 통사 단위(보충어 'of ~' 를 빈칸 밖에 남기지 말 것). 지문 전체에서 정확히 1회만 등장해야 하고, 학생이 **그 단어 자체**를 복원할 수 있어야 한다 — 지문에 어근이 없는 파생명사(invest 계열 0건인데 'investment')·합성어는 자동 반려된다`,
          },
          explanation: {
            type: "string",
            description:
              "해설 딱 2문장(한국어 합쇼체, 400자 이내) — ①빈칸 문장이 글의 논지에서 하는 역할 ②정답을 유일하게 지목하는 지문 단서(어느 문장의 무엇). 두 문장 모두 '~습니다.'로 끝까지 완결해야 한다 — 문장 도중이나 접속 부사만 남기고 끊긴 조각은 자동 반려된다",
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const wordHint = wordHintOf(ctx.difficulty);
    return [
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 1순위 판정 확정성(프레임 축자 복원·정답의 지문 유일 등장·**정답 어휘 자체의 복원 가능성**) > 2순위 기출 형식(빈칸 정확히 1개·지문의 한 문장·관사와 전치사는 빈칸 밖·완결된 통사 단위) > 3순위 표적 공예(논지 수렴 자리·근거 깊이·개념어의 세련됨).",
      "- **막히면 3순위부터 양보하라(실제 탈출구다).** 이 순서로 양보한다: ① 논지 수렴 자리를 포기하고 글 중반의 평범한 설명 문장으로 옮겨도 된다 ② 개념적으로 근사한 새 명명 대신 **지문이 이미 쓴 어휘를 재활용한 어구**를 정답으로 삼아도 된다(그 어구가 지문에 두 번 나오지만 않으면 된다) ③ 근거 깊이(2문장 종합)를 1문장으로 낮춰도 된다 ④ 정답 길이를 늘려 통사 구속이 강한 4~6단어 어구를 잡아도 된다. **1순위·2순위는 어떤 경우에도 양보 불가**이고, 위 넷을 다 써도 안 되면 다시 ①로 돌아가 다른 문장을 고르라 — 확정성이 의심스러운 자리를 강행하는 선택지는 없다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "- sentenceWithBlank·answer·explanation 세 필드는 하나도 비어 있으면 안 된다.",
      `- sentenceWithBlank 의 빈칸 마커는 정확히 ${FILL_BLANK_KEY_MD_BLANK} 1개다 — 0개도 2개 이상도 반려된다.`,
      "- sentenceWithBlank 는 지문의 **한 문장**이다. 두 문장을 이어 붙이면 반려된다(기계가 문장 경계를 센다). 빈칸을 뺀 나머지가 4단어 미만이어도, 60단어를 넘어도 반려된다.",
      "- 빈칸에 answer 를 되끼운 문장을 지문의 그 문장과 나란히 놓고 **한 글자씩** 대조하라 — 철자·구두점·어형·관사 어느 하나라도 다르면 프레임 변조로 반려된다. 빈칸을 뚫으면서 문장을 다듬지 마라.",
      "- 빈칸을 지문 **첫 문장**에 뚫으면 반려된다(앞 문맥이 없어 유일 지목이 성립하지 않는다).",
      `- answer 는 ${FILL_BLANK_KEY_MD_WORD_MIN}~${FILL_BLANK_KEY_MD_WORD_MAX}단어(권장 ${wordHint})의 지문 축자 표현이다. 1단어는 동의어가 다 맞아 채점이 무너지므로 반려되고, ${FILL_BLANK_KEY_MD_WORD_MAX}단어 초과는 문장을 통째로 비운 셈이라 반려된다.`,
      "- answer 를 지문 전체에서 세어 보라 — **정확히 1회**여야 한다. 0회(축자 아님)도, 2회 이상(빈칸 처리 뒤에도 본문에 남아 학생이 찾아 베낀다)도 반려된다.",
      "- answer 가 sentenceWithBlank 에 그대로 남아 있거나 자음골격·언더스코어 난독으로 노출되면 반려된다 — 그 스팬은 반드시 빈칸이어야 한다.",
      "- answer 는 관사(a/an/the)로 시작하면 안 된다(관사는 빈칸 밖 문장 쪽에 남겨라). 따옴표·괄호·콜론·언더스코어를 포함하거나 문장부호로 끝나도 반려된다.",
      "- 허용답·동의어 목록을 만들지 마라 — 표기 변형(축약형·대소문자)은 시스템이 결정론으로 파생한다. 스키마에 그 칸이 없는 것은 의도다.",
      "- 학생이 그 자리에 쓸 법한 표현 3개를 실제로 떠올려라 — 하나라도 정답과 의미가 같은데 표기만 다르면(동의어·어순 변형) 그 자리는 채점이 무너진다. 표적을 재선정하라.",
      "",
      "### 표적 선정 절차 — 순서대로 수행하라 (이 유형 채점 사고의 전량이 여기서 난다)",
      "**먼저 이 오해부터 풀어라.** 앞 예시가 말하는 '축자 부재'는 *그 어구가 지문에 두 번 나오면 안 된다*는 뜻이지, *정답 어휘의 근거가 지문에 없어도 된다*는 뜻이 **아니다**. 채점은 학생이 손으로 쓴 철자와의 완전일치다 — 지문이 뜻만 주고 단어를 주지 않으면, 뜻을 정확히 이해한 학생이 다른 단어를 써서 0점을 받는다. 그래서 이 유형에서 가장 잘 망가지는 표적은 **모델이 지문 내용을 요약해 새로 만들어 낸 세련된 개념어**다.",
      "- **1단계 — 후보 3개**: 지문 중반 이후(첫 문장 제외)의 서로 다른 문장에서 표적 후보를 3개 뽑아라. 하나만 잡고 밀어붙이지 마라.",
      "- **2단계 — 각 후보를 아래 4개 검사에 통과시켜라(전부 기계가 다시 센다)**.",
      "  · **A 어휘 앵커**: 정답을 가린 채 지문 단서만으로 그 **단어 자체**를 복원할 수 있는가. 정답의 핵심 명사가 -ment/-tion/-ity/-ness/-ance/-ence 류 파생명사인데 그 **어근이 지문 다른 곳에 한 번도 나오지 않으면 기계가 자동 반려한다**(예: 지문에 invest 계열이 0건인데 'emotional investment' 를 요구 — affectedness/intensity/involvement 가 전부 성립한다). 하이픈 합성어도 구성 요소 중 하나는 지문에 있어야 하고(reflex/instinct 단서 없는 'knee-jerk'), 같은 말을 반복하는 의성·리듬 표현(drip-drip-drip)은 그 자체로 반려된다.",
      "  · **B 본문 동치 어구**: 지문을 처음부터 훑어, 빈칸 자리에 넣어도 문맥·문법이 성립하는 **다른 어구가 본문에 실재하는지** 확인하라. 발문이 '본문에서 찾아 쓰시오'이므로 학생은 본문에 있는 그 어구를 그대로 쓴다 — 다르면 부당 오답이다. 상습 지점: (a) 지문 첫머리가 같은 주장·처방을 다른 어구로 이미 말해 둔 경우, (b) 대구 틀에서 앞 절의 술어가 그대로 들어맞는 경우, (c) 지문이 같은 내용을 비유·환언으로 두세 번 되풀이한 대목.",
      "  · **C 극성**: 빈칸이 **필자가 부정하는 통념** 안에 있으면 안 된다(`experts don't think plants are _____` 류). 부정문 자리는 '무엇이 아닌가'만 정해져 동의어가 전부 성립하고, 지문이 그 통념을 이미 다른 어구로 말해 두었을 확률이 높다 — **기계가 빈칸 앞 절의 부정 표지를 검사해 자동 반려한다**. 필자가 긍정하는 주장 문장을 골라라.",
      "  · **D 스팬 경계**: 정답은 **완결된 통사 단위**여야 한다. 명사구 중간에서 끊어 보충어를 빈칸 밖에 남기지 마라 — `helps us _____ of the stimuli`(정답 'reduce the complexity')처럼 빈칸 **직후에 of 구가 남으면 기계가 자동 교정하거나 반려한다**. 관사·전치사는 빈칸 밖(`the _____`), 그러나 스팬 안에 관사를 품은 채 뒤의 of 구를 버리는 것은 금지다.",
      "- **3단계 — 선택**: 4개 검사를 통과한 후보 중 논지에 가장 가까운 것을 고른다. **가장 안전한 표적은 지문이 이미 쓴 어휘로 이루어진 어구가 그 문장에서 결정(結晶)되는 자리**다(예: 앞에서 'linear thinking' 을 반복한 글의 'nonlinear manner', 'new information' 을 쓴 글의 'application of new information'). 지문 어휘의 재활용은 이 유형에서 결함이 아니라 **미덕**이다 — 같은 어구가 두 번 나오지만 않으면 된다.",
      "- **4단계 — 골격 잉여 확인**: 빈칸을 뺀 문장 골격이 이미 정답의 의미를 다 말하고 있으면 남은 자리는 문체 선택일 뿐이다(`gradually builds up in a ___ over time` — 점진성·시간성을 골격이 선점했다). 빈칸이 채워져야 비로소 문장이 새 정보를 얻는 자리를 골라라.",
      "- 후보 3개가 전부 막히면 위 **우선순위 사다리대로 3순위를 양보**하고 더 평범한 자리로 내려가라. 어휘 앵커(A)·극성(C)·경계(D)는 기계가 세므로 양보 대상이 아니다.",
      "",
      "- explanation 은 한국어 합쇼체(-습니다) **딱 2문장**, 400자 이내다. 한국어가 없으면 반려되고, 길면 지문·군더더기가 섞인 것으로 반려된다.",
      "- explanation 은 **끝까지 다 써라** — 두 문장 모두 '~습니다.'로 완결해야 한다. 문장 도중에 멈추거나 접속 부사('앞서' 등)만 남기고 끊으면 기계가 미완결로 자동 반려한다.",
      `- explanation 이 지문 표현을 인용할 때는 **지문 축자 그대로** 따옴표에 넣어라 — 지문·빈칸문장·정답 어디에도 없는 영어 인용은 환각으로 반려된다. 인용은 한 조각 ${FILL_BLANK_KEY_MD_QUOTE_WORD_MAX}단어 이내로 자르고, 지문을 연속 30단어 이상 옮겨 실으면 재출력으로 반려된다.`,
      "- 해설의 구조 서술(\"바로 앞 문장이 ~을 규정한다\", \"관계절이 ~을 강제한다\" 등)은 실제 지문을 재확인한 사실만 써라 — 확인 없는 상투 템플릿 복사는 허위 해설이다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        sentenceWithBlank?: unknown;
        answer?: unknown;
        explanation?: unknown;
      };
      // 저장·표시로 나가는 값은 md 경로와 동일한 단일 정리 경로를 통과한다
      // (cleanFillBlankKeyValue = 공유 장식 정리 + 빈칸 마커 봉인 보존).
      const q: MdFillBlankKeyQuestion = {
        kind: "fill-blank-key",
        sentenceWithBlank: cleanFillBlankKeyValue(raw.sentenceWithBlank),
        answer: cleanFillBlankKeyValue(raw.answer),
        // 스키마가 허용답 칸을 두지 않으므로 항상 빈 배열 — 표기 변형은 레인
        // adapt(buildFillBlankKeyAcceptedAnswers)가 결정론으로 파생한다.
        acceptedAnswers: [],
        explanation: cleanFillBlankKeyValue(raw.explanation),
        unknownLabelLines: [],
        droppedLines: [],
      };
      // 코어스: 레인과 동일한 0원 스냅(마커 폭 정규화·빈칸 미표기 치환·꼬리
      // 구두점 절삭·관사 외출) → ext 고유 코어스(of 보충어 확장) → 게이트.
      const snapped = autoSnapFillBlankKey(q, ctx.passage);
      let question = snapped.question;
      const corrections = [...snapped.corrections];
      const ofFix = coerceDanglingOfComplement(question, ctx.passage);
      if (ofFix) {
        question = ofFix.question;
        corrections.push(ofFix.correction);
      }
      return {
        question,
        gateIssues: [
          ...gateMdFillBlankKey(question, ctx.passage),
          ...truncatedExplanationIssues(question.explanation),
          ...negativePolarityIssues(question.sentenceWithBlank),
          ...danglingOfIssues(question.sentenceWithBlank, question.answer),
          ...lexicalAnchorIssues(question.answer, ctx.passage),
        ],
        corrections,
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [
          `luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`,
        ],
        corrections: [],
      };
    }
  },

  bridgeSpecs: [
    { path: "sentenceWithBlank", prefix: "빈칸문장: ", suffix: "\n" },
    { path: "answer", prefix: "\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : FILL_BLANK_KEY_MD_DIRECTION;
    const answer =
      typeof aiQuestion.answer === "string" ? aiQuestion.answer.trim() : "";
    const sentenceWithBlank =
      typeof aiQuestion.sentenceWithBlank === "string"
        ? aiQuestion.sentenceWithBlank.trim()
        : "";
    // 학생 화면 = 지문 전체가 빈칸 하나만 뚫린 채(passageWithBlank 는 프로덕션
    // 후처리 processFillBlankKey 전담이므로, 평가 표면은 여기서 같은 방식으로
    // 파생한다 — 게이트가 정답의 지문 유일 등장을 보증하므로 첫 매치 치환).
    let surface = passage;
    const m = answer ? answerBoundaryRegex(answer).exec(passage) : null;
    if (m) {
      surface =
        passage.slice(0, m.index) +
        FILL_BLANK_KEY_MD_BLANK +
        passage.slice(m.index + m[0].length);
    } else if (sentenceWithBlank) {
      // 정답 위치를 못 찾는 파손 표본 — 빈칸 문장을 병기해 패널이 결함을 보게 한다.
      surface = `${passage}\n\n[빈칸 문장] ${sentenceWithBlank}`;
    }
    return `${direction}\n\n${surface}`;
  },
};
