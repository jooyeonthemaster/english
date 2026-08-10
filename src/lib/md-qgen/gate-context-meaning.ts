// ============================================================================
// 문맥 속 의미(CONTEXT_MEANING) 0원 결정형 게이트 — LLM 콜 없음.
// 400줄 규칙에 따라 parser-context-meaning.ts 에서 분리(1차 승차분 gate-vocab/order 선례).
//
// 설계 원칙 두 가지:
//  1) **게이트 메시지는 자리를 지목한다.** 이 문구가 그대로 재생성 프롬프트의
//     피드백이 되므로(route.ts buildPrompt(feedback)), "무엇이 몇 개"가 아니라
//     "어느 라벨의 무엇이 어떻게" 를 적는다(규범 §1-B 철칙 5).
//  2) **fast 검증기의 치명 게이트를 md 로 승격 이식한다.** md 레인은
//     validateQuestionQuality 결과를 차단하지 않고 기록만 하므로, 여기서 안 잡으면
//     결함이 그대로 출하된다. 이 유형에서 그 대상은
//     - dispatcher SHORT_TARGET_TYPES 의 `target-not-standalone`(error) → 축자·단어경계 검사
//     - 같은 블록의 `weak-target-word`(fast 는 warning) → md 는 반려로 승격.
//       기능어 단독 밑줄은 유형 자체가 성립하지 않아 경고로 흘려보낼 값이 아니다.
//     - 후처리 sanitizeSingleVocabOptionText 가 선지의 괄호 안을 **말없이 삭제**한다
//       → 괄호 뜻풀이를 게이트가 미리 반려한다(조용한 글자 소실 차단).
// ============================================================================

import {
  containsHangul,
  containsLatinLetter,
  countWordsForQuality,
  isTinyFunctionWord,
} from "@/lib/question-quality/core";
import { normalizeWs } from "./parser";
import {
  locateContextMeaningTarget,
  type MdContextMeaningQuestion,
} from "./parser-context-meaning";
import {
  CONTEXT_MEANING_MD_CIRCLED,
  CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS,
  CONTEXT_MEANING_MD_OPTION_MAX_WORDS,
  CONTEXT_MEANING_MD_TARGET_MAX_CHARS,
  CONTEXT_MEANING_MD_TARGET_MAX_WORDS,
} from "./prompts-context-meaning";

export interface GateMdContextMeaningOptions {
  optionCount?: number;
  answerCount?: number;
  /** 교사 설정 보기 언어(기본 en) — 선지 언어 정합 검사의 기준 */
  optionLanguage?: "ko" | "en";
  /** answer-only 모드에서 오답해설 개수 검사를 끈다 */
  requireWrong?: boolean;
}

const ELLIPSIS = (s: string, n = 60): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

// 지문이 그 토큰을 "언급(mention)" 하는 자리 — 뜻을 지문이 직접 알려 주므로
// 문맥 추론이 성립하지 않는다(실측: 라틴어 coloratus 밑줄로 유형 붕괴).
const MENTION_LEAD_RE =
  /(?:\b(?:the\s+(?:word|term|phrase|expression)|called|named|known\s+as|meaning|means|refers?\s+to)\s*)["'“‘]?\s*$/i;
const OPEN_QUOTE_RE = /["'“‘]$/;
const CLOSE_QUOTE_RE = /^["'”’]/;
// 문장 시작 직전에 올 수 있는 문자들 — 여기 해당하면 대문자 표기가 고유명사 신호가 아니다.
const SENTENCE_BOUNDARY_RE = /[.!?:;"'“”‘’()[\]—–\-]/;

/** 밑줄 자리가 문장 첫 단어인가(대문자 표기가 정상인 자리인가). */
function isSentenceInitial(passage: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(passage[i])) i -= 1;
  if (i < 0) return true;
  return SENTENCE_BOUNDARY_RE.test(passage[i]);
}

/**
 * 선지가 밑줄 단어의 굴절형인지 — 동어반복 차단.
 * 단일 토큰끼리만 비교한다(구 단위 비교는 오탐이 크다).
 */
function lemmaCandidates(word: string): string[] {
  const base = word.toLowerCase().replace(/[^a-z]/g, "");
  const out = new Set<string>();
  if (base.length >= 3) out.add(base);
  for (const suffix of ["ing", "ed", "es", "s", "d"]) {
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      const stem = base.slice(0, -suffix.length);
      if (stem.length >= 3) {
        out.add(stem);
        out.add(`${stem}e`);
        // 자음 중복(running → runn → run)
        if (/([bdfglmnprt])\1$/.test(stem) && stem.length > 3) {
          out.add(stem.slice(0, -1));
        }
      }
    }
  }
  return [...out];
}

function sharesLemma(a: string, b: string): boolean {
  const left = new Set(lemmaCandidates(a));
  if (left.size === 0) return false;
  return lemmaCandidates(b).some((candidate) => left.has(candidate));
}

function isSingleToken(text: string): boolean {
  return /^[A-Za-z][A-Za-z'-]*$/.test(text.trim());
}

/** 선지 형상 검사 — 라벨 순서·빈 텍스트·중복(개수는 호출 전 조기반려로 확정). */
function gateOptionShape(
  q: MdContextMeaningQuestion,
  expected: string[],
): string[] {
  const v: string[] = [];
  if (q.options.map((o) => o.label).join("") !== expected.join("")) {
    v.push(
      `선지 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${q.options.map((o) => o.label).join("") || "없음"}`,
    );
  }
  const seen = new Map<string, string>();
  for (const opt of q.options) {
    if (!opt.text) {
      v.push(`${opt.label} 선지 텍스트 누락`);
      continue;
    }
    const key = normalizeWs(opt.text).toLowerCase();
    const prev = seen.get(key);
    if (prev) {
      v.push(`선지 중복 — ${prev}와 ${opt.label}가 같은 내용: '${ELLIPSIS(opt.text)}'`);
    } else {
      seen.set(key, opt.label);
    }
  }
  return v;
}

/**
 * 선지 언어·형태 검사 — 교사 설정(optionLanguage)을 게이트가 집행하고,
 * 후처리가 말없이 지우는 형태(괄호 뜻풀이)를 미리 반려한다.
 */
function gateOptionText(
  q: MdContextMeaningQuestion,
  optionLanguage: "ko" | "en",
): string[] {
  const v: string[] = [];
  const target = normalizeWs(q.word).toLowerCase();
  for (const opt of q.options) {
    if (!opt.text) continue;
    const text = normalizeWs(opt.text);

    // 마크다운 장식 잔재 — 파서가 짝 맞는 장식(`**…**`·`__…__`·`_…_`·`*…*`·백틱)을
    // 이미 벗기고 양끝 잔재까지 절단하므로, 여기 남았다는 것은 짝이 깨진 표지가
    // **본문 한가운데** 박혔다는 뜻이다. 게이트·후처리·검증기 어느 층도 이걸 지우지
    // 않아 그대로 학생 표면에 나가고, 모델은 정답 선지만 굵게 쓰는 습관이 있어
    // **표지 하나가 정답을 눈으로 알려 준다**.
    // ⚠ `__` 만 보는 검사는 절반짜리다 — `_` 한 개짜리 기울임 잔재가 그대로 통과한다.
    //   선지는 영어 뜻풀이 구 또는 한국어 뜻풀이라 밑줄 문자가 정상일 자리가 없다.
    if (/[*`_]/.test(text)) {
      v.push(
        `${opt.label} 선지에 마크다운 장식이 남음 — 별표·백틱·밑줄표기 없이 뜻풀이만 적어라: '${ELLIPSIS(text)}'`,
      );
    }

    // 괄호 뜻풀이 — 후처리 sanitizeSingleVocabOptionText 가 괄호 안을 삭제한다.
    // 게이트가 안 잡으면 학생 표면에서 글자가 조용히 사라진다.
    if (/[()[\]]/.test(text)) {
      v.push(
        `${opt.label} 선지에 괄호 주석이 있음 — 서버가 괄호 안을 삭제하므로 뜻풀이만 남겨라: '${ELLIPSIS(text)}'`,
      );
    }

    // 동어반복 — 밑줄 단어(또는 그 굴절형)를 선지로 쓰면 문항이 무너진다.
    const optionKey = text.toLowerCase();
    if (target && optionKey === target) {
      v.push(`${opt.label} 선지가 밑줄 단어와 동일 — 동어반복: '${ELLIPSIS(text)}'`);
    } else if (
      target &&
      isSingleToken(text) &&
      isSingleToken(q.word) &&
      sharesLemma(text, q.word)
    ) {
      v.push(
        `${opt.label} 선지가 밑줄 단어의 굴절형 — 동어반복: '${ELLIPSIS(text)}' vs '${q.word}'`,
      );
    }

    if (optionLanguage === "en") {
      if (containsHangul(text)) {
        v.push(`${opt.label} 선지에 한글이 섞임 — 선지는 영어 전용: '${ELLIPSIS(text)}'`);
        continue;
      }
      if (!containsLatinLetter(text)) {
        v.push(`${opt.label} 선지가 영어 표현이 아님: '${ELLIPSIS(text)}'`);
        continue;
      }
      if (countWordsForQuality(text) > CONTEXT_MEANING_MD_OPTION_MAX_WORDS) {
        v.push(
          `${opt.label} 선지가 문장으로 늘어짐 — ${CONTEXT_MEANING_MD_OPTION_MAX_WORDS}단어 이내 뜻풀이 구로 줄여라: '${ELLIPSIS(text)}'`,
        );
      }
    } else {
      if (!containsHangul(text)) {
        v.push(
          `${opt.label} 선지가 한국어가 아님 — 교사 설정이 한국어 보기다: '${ELLIPSIS(text)}'`,
        );
        continue;
      }
      if (text.length > CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS) {
        v.push(
          `${opt.label} 선지가 너무 김 — ${CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS}자 이내 뜻풀이로 줄여라: '${ELLIPSIS(text)}'`,
        );
      }
    }
  }

  // 형태 비평행 — 정답만 유일하게 다단어이고 나머지가 전부 한 단어면 내용을 안
  // 읽고도 찍힌다(정밀도 높은 결정형 신호만 채택: 그 반대 방향은 검사하지 않는다).
  const answerSet = new Set(q.answers);
  const answerOptions = q.options.filter((o) => answerSet.has(o.label));
  const otherOptions = q.options.filter((o) => !answerSet.has(o.label));
  if (
    answerOptions.length === 1 &&
    otherOptions.length >= 3 &&
    countWordsForQuality(answerOptions[0].text) >= 2 &&
    otherOptions.every((o) => countWordsForQuality(o.text) === 1)
  ) {
    v.push(
      `정답 선지(${answerOptions[0].label})만 여러 단어이고 나머지는 전부 한 단어 — 형태로 정답이 들킨다`,
    );
  }

  return v;
}

/**
 * 셔플 재매핑 불가 표기 — question-diversity.ts:590 `UNMAPPABLE_MENTION` 과
 * **같은 소스**다(gate-synonym·gate-topic-main-idea 선례와 동일 식).
 *
 * 이 표기가 해설·오답해설에 하나라도 있으면 저장 직전
 * `shuffleQuestionOptionsForDiversity` 가 라벨 재매핑을 포기하고 원본을 그대로
 * 돌려준다 — 잡 result 에도 경고에도 **아무 흔적이 남지 않는** 조용한 실패라
 * 발견 자체가 불가능하고, 결과적으로 전 문항의 정답이 모델이 고른 위치에 고정된다.
 * 이 유형은 "사전 1번 뜻" 이 정답 기제를 설명하는 가장 자연스러운 한국어라서
 * 발생 확률이 유독 높다 — 프롬프트 한 겹으로는 못 막고 게이트가 집행해야 한다.
 */
const UNMAPPABLE_MENTION =
  /(?:[1-9]\s*번(?!째))|(?:선지\s*[1-9])|(?:보기\s*[1-9])|(?:\(\s*[1-9]\s*\))|(?:[①-⑳]\s*[~∼〜‐–—-]\s*[①-⑳])/;

/** 해설·오답해설의 평숫자 선지 지칭 검사 — 자리를 인용해 반려한다(§1-B 철칙 5). */
function gateAnswerMentions(q: MdContextMeaningQuestion): string[] {
  const v: string[] = [];
  const texts: Array<{ where: string; text: string }> = [
    { where: "해설", text: q.explanation },
    ...q.wrong.map((w) => ({ where: `${w.label} 오답해설`, text: w.text })),
  ];
  for (const { where, text } of texts) {
    if (!text) continue;
    const m = UNMAPPABLE_MENTION.exec(text);
    if (m) {
      v.push(
        `${where}에 평숫자 선지 지칭('${m[0]}')이 있음 — 선지는 출제 후 재배열되므로 이 표기가 하나라도 있으면 재배열이 통째로 취소된다. 뜻을 직접 인용하거나 ①~ 원문자만 써라: '${ELLIPSIS(text)}'`,
      );
    }
  }
  return v;
}

/**
 * 밑줄 표적 검사 — 이 유형의 심장.
 * 지문 결속(축자·유일)이 무너지면 후처리 findWordInPassage 가 "Word not found"
 * 로 전체 실패하거나, 더 나쁘게는 지문 원문을 모델 표기로 덮어쓴다.
 */
function gateTarget(q: MdContextMeaningQuestion, passage: string): string[] {
  const v: string[] = [];
  const word = q.word.trim();
  if (!word) return ["밑줄 표현 누락 — `밑줄:` 줄이 없거나 비어 있음"];

  // #1 형태 — 후처리가 \b단어\b 로 찾으므로 양끝이 영문자여야 한다.
  if (!/^[A-Za-z]/.test(word) || !/[A-Za-z]$/.test(word)) {
    v.push(
      `밑줄 표현이 영문자로 시작·종료하지 않음 — 구두점·따옴표를 빼고 단어만 적어라: '${ELLIPSIS(word)}'`,
    );
  }

  // #2 크기 — 이 유형의 표적은 단어 또는 짧은 구다(긴 절은 함축 의미 유형의 자리).
  const words = countWordsForQuality(word);
  if (words > CONTEXT_MEANING_MD_TARGET_MAX_WORDS || word.length > CONTEXT_MEANING_MD_TARGET_MAX_CHARS) {
    v.push(
      `밑줄이 너무 김(${words}단어/${word.length}자) — ${CONTEXT_MEANING_MD_TARGET_MAX_WORDS}단어 이내 단어·짧은 구로 잘라라: '${ELLIPSIS(word)}'`,
    );
  }

  // #3 하한 — 기능어 단독은 유형이 성립하지 않는다(fast 의 weak-target-word 는
  // warning 이지만, 이 유형에서 관사·전치사 밑줄은 문항 자체가 성립하지 않으므로
  // 반려로 승격한다).
  // ⚠ countContentTokens 를 하한 기준으로 쓰지 마라 — contentTokens 는 4글자
  //   이상 토큰만 세므로 run·set·bear 같은 이 유형 최적 표적이 전부 반려된다.
  if (isTinyFunctionWord(word)) {
    v.push(
      `밑줄이 기능어 단독(관사·전치사·대명사 류) — 문맥 의미를 물을 수 없다: '${word}'`,
    );
  } else if (word.replace(/[^A-Za-z]/g, "").length < 2) {
    v.push(`밑줄이 너무 짧음 — 내용어 한 단어 이상이어야 한다: '${ELLIPSIS(word)}'`);
  }

  // #4 지문 축자 결속 + 자리 유일 — 실패하면 후처리가 통째로 실패한다.
  const hit = locateContextMeaningTarget(passage, word);
  if (!hit) {
    v.push(
      `밑줄 표현이 지문에 축자로 없음(단어 경계 기준) — 지문에서 그대로 복사하라: '${ELLIPSIS(word)}'`,
    );
    return v;
  }
  if (hit.count > 1) {
    v.push(
      `밑줄 표현이 지문에 ${hit.count}회 등장 — 밑줄 자리가 모호하다. 한 번만 나오는 표현을 골라라: '${ELLIPSIS(word)}'`,
    );
  }
  const slice = passage.slice(hit.index, hit.index + hit.length);
  if (slice !== word) {
    v.push(
      `밑줄 표현이 지문 표기와 다름 — 지문은 '${ELLIPSIS(slice)}' 인데 '${ELLIPSIS(word)}' 로 적었다(굴절형·대소문자까지 축자여야 한다)`,
    );
  }

  const before = passage.slice(Math.max(0, hit.index - 40), hit.index);
  const after = passage.slice(hit.index + hit.length, hit.index + hit.length + 2);

  // #5 언급(mention) 자리 — 지문이 뜻을 직접 알려 주므로 문맥 추론이 아니다.
  if (MENTION_LEAD_RE.test(before)) {
    v.push(
      `밑줄이 지문이 용어 자체를 설명·인용하는 자리(the word ~ / called ~) — 뜻이 지문에 이미 적혀 있어 문항이 성립하지 않는다: '${ELLIPSIS(word)}'`,
    );
  } else if (OPEN_QUOTE_RE.test(before) && CLOSE_QUOTE_RE.test(after)) {
    v.push(
      `밑줄이 따옴표로 인용된 토큰 — 지문이 언급하는 말이지 문맥 속에서 쓰인 어휘가 아니다: '${ELLIPSIS(word)}'`,
    );
  }

  // #6 고유명사·외국어 표기 — 문장 중간의 대문자 시작 단어는 문맥 추론 대상이 아니다.
  if (
    /^[A-Z]/.test(word) &&
    isSingleToken(word) &&
    !isSentenceInitial(passage, hit.index)
  ) {
    v.push(
      `밑줄이 문장 중간의 대문자 시작 토큰 — 고유명사·외국어 표기는 표적이 될 수 없다: '${word}'`,
    );
  }

  return v;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdContextMeaning(
  q: MdContextMeaningQuestion,
  passage: string,
  options?: GateMdContextMeaningOptions,
): string[] {
  const optionCount = options?.optionCount ?? q.options.length;
  const answerCount = options?.answerCount ?? 1;
  const optionLanguage = options?.optionLanguage === "ko" ? "ko" : "en";
  const requireWrong = options?.requireWrong !== false;
  const expected: string[] = CONTEXT_MEANING_MD_CIRCLED.slice(0, optionCount);

  // 개수가 어긋나면 라벨·정답·오답 검사가 전부 파생 잡음이 된다 — 즉시 반려.
  if (q.options.length !== optionCount) {
    return [`선지 ${q.options.length}개 (${optionCount}개 필요)`];
  }

  const v: string[] = [
    ...gateOptionShape(q, expected),
    ...gateOptionText(q, optionLanguage),
    ...gateTarget(q, passage),
    ...gateAnswerMentions(q),
  ];

  // 정답 — `정답:` 줄이 유일 진실원이다(선지 줄에 정답 표시 칸을 두지 않는 계약).
  const optionLabels = new Set(q.options.map((o) => o.label));
  if (q.answers.length === 0) {
    v.push("정답 누락 — `정답:` 줄이 없거나 라벨을 읽을 수 없음");
  } else if (q.answers.length !== answerCount) {
    v.push(
      `정답 ${q.answers.length}개 (${answerCount}개 필요) — 실제 ${q.answers.join(", ")}`,
    );
  }
  for (const label of q.answers) {
    if (!optionLabels.has(label)) v.push(`정답 라벨(${label})이 선지에 없음`);
  }

  if (!q.explanation) v.push("해설 누락");

  const wrongNeeded = optionCount - answerCount;
  if (requireWrong && q.wrong.length !== wrongNeeded) {
    v.push(
      `오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요) — 정답을 뺀 모든 선지에 1개씩`,
    );
  }
  const answerSet = new Set(q.answers);
  for (const w of q.wrong) {
    if (answerSet.has(w.label)) v.push(`오답해설에 정답 라벨(${w.label}) 포함`);
    else if (!optionLabels.has(w.label)) {
      v.push(`오답해설 라벨(${w.label})이 선지에 없음`);
    }
  }

  return v;
}
