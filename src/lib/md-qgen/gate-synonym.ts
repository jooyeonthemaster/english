// ============================================================================
// 동의어(SYNONYM) 0원 결정형 게이트 — LLM 콜 없음.
// 400줄 규칙에 따라 parser-synonym.ts 에서 분리(1차 승차분 gate-vocab/gate-order 선례).
//
// 설계 원칙 두 가지:
//  1) **게이트 메시지는 자리를 지목한다.** 이 문구가 그대로 재생성 프롬프트의
//     피드백이 되므로(route.ts buildPrompt(feedback)), "무엇이 몇 개"가 아니라
//     "어느 라벨의 무엇이 어떻게" 를 적는다(규범 §1-B 철칙 5).
//  2) **fast 검증기·프롬프트 계약의 치명 조항을 md 로 승격 이식한다.** md 레인은
//     validateQuestionQuality 결과를 차단하지 않고 기록만 하므로, 여기서 안 잡으면
//     결함이 그대로 출하된다. 이 유형에서 그 대상은
//     ①표적의 지문 축자·자리 유일(후처리 밑줄 실패 방지)
//     ②선지 표면 계약(영어 단어/짧은 구·뜻풀이 금지 — question-prompts-vocab.ts:42)
//     ③표적↔선지 굴절 형태 정합(대입 검사가 성립하려면 필수)
//     ④정답 누출(표적 자신·같은 어간이 선지에 있음)
//     이다.
//
// ⚠ 이 유형은 지문을 변형하지 않는다 — gateMdQuestion 어법 분기의
//   "변형된 마커 수 == 정답 수" 계열 불변식을 복사하면 100% 반려된다(정찰 R2).
// ============================================================================

import {
  containsHangul,
  containsLatinLetter,
  antonymPairKey,
  countWordsForQuality,
  isSingleEnglishToken,
  isTinyFunctionWord,
  normalizeText,
} from "@/lib/question-quality/core";
import { findAntonymSurfaceFormIssue } from "@/lib/question-quality/validators/antonym";
import { normalizeWs } from "./parser";
import { locateSynonymTarget, type MdSynonymQuestion } from "./parser-synonym";
import {
  SYNONYM_MD_CIRCLED,
  SYNONYM_MD_OPTION_MAX_WORDS,
  SYNONYM_MD_TARGET_MAX_WORDS,
} from "./prompts-synonym";

export interface GateMdSynonymOptions {
  optionCount?: number;
  answerCount?: number;
  /** answer-only 모드에서 오답해설 개수 검사를 끈다 */
  requireWrong?: boolean;
}

const ELLIPSIS = (s: string, n = 60): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

/**
 * 표적으로 쓸 수 없는 기능어 — 동의어 문항의 표적은 내용어여야 한다.
 * core 의 contentTokens 는 4자 미만 토큰을 전부 버려 run·aid·odd 같은 정당한
 * 다의어 표적까지 탈락시키므로, 여기서는 **기능어 목록으로 부정 판정**만 한다.
 */
const SYNONYM_FUNCTION_WORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "it", "its", "he", "she",
  "they", "them", "their", "his", "her", "we", "our", "you", "your", "i", "me",
  "my", "who", "whom", "whose", "which", "what", "there", "here",
  "is", "am", "are", "was", "were", "be", "been", "being", "do", "does", "did",
  "have", "has", "had", "will", "would", "can", "could", "shall", "should",
  "may", "might", "must",
  "in", "on", "at", "to", "of", "for", "as", "by", "with", "from", "into",
  "onto", "over", "under", "about", "through", "during", "between", "among",
  "and", "or", "but", "so", "yet", "nor", "if", "than", "then", "because",
  "while", "although", "though", "when", "where", "not", "no",
]);

function isFunctionWordToken(token: string): boolean {
  return SYNONYM_FUNCTION_WORDS.has(token.toLowerCase().replace(/[^a-z']/g, ""));
}

/**
 * 셔플 재매핑 불가 표기 — question-diversity.ts 의 UNMAPPABLE_MENTION 과 **같은 식**이다.
 * 이 표기가 있으면 셔플러가 재배열을 통째로 포기해(=다양성 상실) 정답 위치가
 * 고정된다. 게이트가 같은 식을 쓰므로 "게이트는 통과인데 셔플만 조용히 죽는"
 * 어긋남이 생기지 않는다.
 */
const UNMAPPABLE_MENTION =
  /(?:[1-9]\s*번(?!째))|(?:선지\s*[1-9])|(?:보기\s*[1-9])|(?:\(\s*[1-9]\s*\))|(?:[①-⑳]\s*[~∼〜‐–—-]\s*[①-⑳])/;

/**
 * 비교 전용 정규화 키 — 마크다운 장식·따옴표·후행 구두점을 무시한다.
 *
 * ⚠ 26-07-26 적대검수 critical 의 두 번째 방벽: 파서가 장식을 벗기는 것이 1차
 * 처방이고, 여기는 **하나라도 새어 들어왔을 때 검사가 조용히 빗나가지 않게** 하는
 * 2차 방벽이다. 종전에는 raw 텍스트로 비교해 `**foster` 가 들어오면 중복·정답누출·
 * 굴절형 검사가 전부 무발화했다(antonymPairKey·isSingleEnglishToken 이 별표 붙은
 * 문자열을 영어 토큰으로 보지 않는다). 장식이 남아 있다는 사실 자체는 아래
 * gateOptionSurface 가 별도로 반려하므로, 여기서 지운다고 은폐되지 않는다.
 */
function cleanText(text: string): string {
  return normalizeWs(text)
    .replace(/[*_`~"'“”‘’]/g, "")
    .replace(/^[-–—:：\s]+/, "")
    .replace(/[.,;:！!?？\s]+$/, "")
    .trim();
}

/** 대소문자까지 지운 동일성 비교 키. 메시지에는 cleanText 쪽(원 대소문자)을 쓴다. */
function compareKey(text: string): string {
  return cleanText(text).toLowerCase();
}

/** 선지 형상 검사 — 라벨 순서·빈 텍스트·중복. */
function gateOptionShape(
  q: MdSynonymQuestion,
  expected: string[],
  skipOrder = false,
): string[] {
  const v: string[] = [];
  if (!skipOrder && q.options.map((o) => o.label).join("") !== expected.join("")) {
    v.push(
      `선지 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${q.options.map((o) => o.label).join("") || "없음"}`,
    );
  }
  const seen = new Map<string, string>();
  const seenLexeme = new Map<string, string>();
  for (const opt of q.options) {
    if (!opt.text) {
      v.push(`${opt.label} 선지 텍스트 누락`);
      continue;
    }
    const key = compareKey(opt.text);
    const prev = seen.get(key);
    if (prev) {
      v.push(`선지 중복 — ${prev}와 ${opt.label}가 같은 단어: '${ELLIPSIS(opt.text)}'`);
    } else {
      seen.set(key, opt.label);
    }
    // 같은 어간의 굴절형 두 개(increase·increases)는 독립 후보가 아니다.
    const lexeme = antonymPairKey(compareKey(opt.text));
    if (lexeme) {
      const prevLexeme = seenLexeme.get(lexeme);
      if (prevLexeme && prevLexeme !== opt.label && !prev) {
        v.push(
          `선지 ${prevLexeme}와 ${opt.label}가 같은 단어의 굴절형 — 독립된 후보가 아니다: '${ELLIPSIS(opt.text)}'`,
        );
      } else if (!prevLexeme) {
        seenLexeme.set(lexeme, opt.label);
      }
    }
  }
  return v;
}

/**
 * 선지 표면 계약 — 동의어 선지는 **영어 단어 또는 짧은 구**다.
 * (question-prompts-vocab.ts:42 "options.text에는 영어 단어/구만. 한국어 뜻풀이·
 *  괄호 설명·'word (meaning)' 형식 금지" 의 결정형 승격.)
 * 후처리 sanitizeSingleVocabOptionText 가 괄호를 떼어내 주기는 하지만, 떼고 나면
 * 선지가 통째로 달라지므로 **여기서 반려해 다시 받는 편**이 옳다.
 */
function gateOptionSurface(q: MdSynonymQuestion): string[] {
  const v: string[] = [];
  for (const opt of q.options) {
    if (!opt.text) continue;
    if (containsHangul(opt.text)) {
      v.push(`${opt.label} 선지에 한글이 섞임 — 선지는 영어 단어/구 전용: '${ELLIPSIS(opt.text)}'`);
      continue;
    }
    if (!containsLatinLetter(opt.text)) {
      v.push(`${opt.label} 선지가 영어 표현이 아님: '${ELLIPSIS(opt.text)}'`);
      continue;
    }
    if (/[()[\]{}]/.test(opt.text)) {
      v.push(
        `${opt.label} 선지에 괄호 뜻풀이·부연이 붙음 — 단어만 남겨라: '${ELLIPSIS(opt.text)}'`,
      );
    }
    // 구분자 병기 — fast 프롬프트가 금지한 "word (meaning)" 를 괄호 없이 우회하는
    // 실측 형태(`fabricate - invent`·`fabricate / invent`·`fabricate: invent`·
    // `fabricate, invent`)를 잡는다. 정답 선지가 이 형태면 뜻풀이가 곧 정답 힌트가
    // 되고, 표적을 앞뒤에 붙인 `cultivate, till` 은 정답누출 완전일치 비교까지 빠져나간다.
    // 하이픈 단어(well-being)를 깨지 않도록 맨몸 하이픈은 **공백으로 둘러싸일 때만** 본다.
    const separator = opt.text.match(/\s[-–—]\s|[–—/|:;=,]/)?.[0];
    if (separator) {
      v.push(
        `${opt.label} 선지에 뜻풀이·병기가 붙음 — 구분자 '${separator.trim()}' 로 두 표현이 이어져 있다. 후보 하나만 남겨라: '${ELLIPSIS(opt.text)}'`,
      );
    }
    // 마크다운 장식 잔재 — 파서가 이미 벗기지만, 다섯 선지 중 하나만 별표가 붙으면
    // 그것이 정답이라는 신호가 되어 셔플의 정답 은닉이 무의미해진다(실사고 계통).
    if (/[*_`~]/.test(opt.text)) {
      v.push(
        `${opt.label} 선지에 마크다운 장식(**·_·\`)이 남음 — 단어만 써라: '${ELLIPSIS(opt.text)}'`,
      );
    }
    const words = countWordsForQuality(opt.text);
    if (words > SYNONYM_MD_OPTION_MAX_WORDS) {
      v.push(
        `${opt.label} 선지가 ${words}단어 — 동의어 선지는 ${SYNONYM_MD_OPTION_MAX_WORDS}단어 이내의 단어·짧은 구다: '${ELLIPSIS(opt.text)}'`,
      );
    }
    if (/[.!?]/.test(opt.text)) {
      v.push(
        `${opt.label} 선지가 문장 형태 — 동의어 후보 단어만 써라: '${ELLIPSIS(opt.text)}'`,
      );
    }
  }
  return v;
}

/**
 * 표적 단어 검사 — 이 유형의 심장.
 * 지문 결속(축자·유일)이 깨지면 후처리가 밑줄을 긋지 못해 밑줄 없는 문항이 저장된다.
 */
function gateTarget(q: MdSynonymQuestion, passage: string): string[] {
  const v: string[] = [];
  const target = q.target.trim();
  if (!target) return ["대상 단어 누락 — `대상:` 줄이 없거나 비어 있음"];

  // #1 지문 축자 결속 — 실패하면 후처리 findWordInPassage 가 밑줄을 못 긋는다.
  const hit = locateSynonymTarget(passage, target);
  if (!hit) {
    v.push(
      `대상 단어가 지문에 축자로 없음 — 지문에서 그대로 복사하라(굴절형·대소문자 포함): '${ELLIPSIS(target, 80)}'`,
    );
  } else if (hit.count > 1) {
    // #2 자리 유일 — 같은 단어가 여러 번이면 어느 자리에 밑줄인지 확정되지 않는다.
    v.push(
      `대상 단어가 지문에 ${hit.count}회 등장 — 밑줄 자리가 모호하다. 한 번만 나오는 단어를 골라라: '${ELLIPSIS(target, 80)}'`,
    );
  }

  // #3 크기 — 동의어 표적은 단어다. 길어지면 함축·문맥의미 유형이 된다.
  const words = countWordsForQuality(target);
  if (words > SYNONYM_MD_TARGET_MAX_WORDS) {
    v.push(
      `대상이 ${words}단어 — ${SYNONYM_MD_TARGET_MAX_WORDS}단어 이내의 단어(또는 한 덩어리 숙어)로 잡아라: '${ELLIPSIS(target, 80)}'`,
    );
  }

  // #4 기능어 금지 — 관사·전치사·대명사·be동사는 동의어 표적이 될 수 없다.
  const tokens = target.split(/\s+/).filter(Boolean);
  if (isTinyFunctionWord(target) || tokens.every(isFunctionWordToken)) {
    v.push(`대상이 기능어 — 내용어(동사·명사·형용사·부사)를 골라라: '${target}'`);
  }

  // #5 고유명사 추정 — 문장 첫머리가 아닌 대문자 단일 토큰. 고유명사는 동의어가
  //    없어 문항이 성립하지 않는다(fast 프롬프트의 고유명사 금지 조항 승격).
  if (hit && hit.count === 1 && isSingleEnglishToken(target) && /^[A-Z]/.test(target)) {
    const before = passage.slice(Math.max(0, hit.index - 2), hit.index);
    const sentenceInitial = hit.index === 0 || /[.!?]\s$/.test(before) || /\n$/.test(before);
    if (!sentenceInitial) {
      v.push(`대상이 고유명사로 보임(문장 중간의 대문자 단어) — 일반 내용어를 골라라: '${target}'`);
    }
  }

  return v;
}

/**
 * **-s 로 끝나지만 굴절이 아닌 단어** — 단수 명사·학문명·부사.
 *
 * ⚠ 26-07-26 적대검수 major: core.hasInflectionalS 의 예외 목록(ss|us|is|ous|less|ness)이
 * -es/-ws/-ns/-as/-os/-ics 를 못 걸러 `species`·`news`·`lens`·`bias`·`means`·`series`·
 * `physics`·`chaos`·`canvas` 를 표적으로 잡으면 **선지 5개 전부**가
 * "-s 형태 불일치" 로 반려돼 문항이 100% 생성 실패한다(실측). 반의어는 짝 단어가
 * 표적과 같은 굴절형인 것이 자연스러워 이 오탐이 드물지만, 동의어 표적은 품사 제약이
 * 없어 노출면이 훨씬 넓다. 그 문구가 그대로 재생성 피드백이라 모델은 단수 명사의
 * 동의어를 억지로 복수화(news→informations 류 비문)하는 방향으로 끌려간다.
 */
const NON_INFLECTIONAL_S_WORDS = new Set([
  "species", "series", "news", "means", "lens", "bias", "corps", "chaos",
  "canvas", "atlas", "alias", "ethos", "pathos", "cosmos", "census", "surplus",
  "headquarters", "premises", "goods", "savings", "odds", "riches", "customs",
  "always", "perhaps", "sometimes", "besides", "nonetheless", "whereas",
]);

/** 굴절 -s 가 아닌 것으로 보이는가(단수 명사·학문명 -ics·방향 부사 -wards). */
function hasNonInflectionalS(word: string): boolean {
  const w = normalizeWs(word).toLowerCase().replace(/[^a-z'-]/g, "");
  return NON_INFLECTIONAL_S_WORDS.has(w) || /(?:ics|wards)$/.test(w);
}

/** findAntonymSurfaceFormIssue 가 -s 조항으로 발화했는지 식별하는 표지. */
const S_FORM_MARK = "third-person/plural -s form";

/**
 * 표면형 정합 — 정본 검증기를 재사용하되 **-s 조항만** 단수 명사 표적에서 면제한다.
 *
 * 공유 검증기는 첫 위반에서 반환하므로 -s 를 건너뛴 나머지 조항을 얻을 방법이 없다.
 * 그래서 면제 경로에서만 -ing·-ly·-ed 축을 원어 그대로 다시 대조한다(메시지에 원어가
 * 그대로 실려야 재생성 피드백이 거짓말을 하지 않는다). 공유 검증기는 읽기 전용이다.
 */
function findSynonymFormIssue(target: string, option: string): string | null {
  const issue = findAntonymSurfaceFormIssue(target, option);
  // ⚠ 과거·분사형 축 제외(26-07-27 실사용 과잉차단 실측): 'raw - unrefined' ·
  // 'natural - forced' 처럼 -ed 로 끝나는 **형용사**를 시제 불일치로 오인해 정상
  // 선지를 반려하고 재생성을 유발했다. 정본 화이트리스트가 유한해 계속 새는 축이라
  // 아예 게이트에서 뺀다(반의어 게이트와 동일 결정). 나머지 축은 유지.
  if (issue?.includes("past/participle form")) return null;
  if (!issue || !issue.includes(S_FORM_MARK)) return issue;
  if (!hasNonInflectionalS(target) && !hasNonInflectionalS(option)) return issue;
  for (const suffix of ["ing", "ly"] as const) {
    const a = target.trim().toLowerCase().endsWith(suffix);
    const b = option.trim().toLowerCase().endsWith(suffix);
    if (a !== b) return `"${target}" and "${option}" do not share -${suffix} form`;
  }
  return null;
}

/**
 * 표적 ↔ 선지 정합 — 대입 검사가 성립하기 위한 형식 전제.
 * 굴절 형태가 어긋난 후보는 문법만으로 지워져 실질 선지 수가 줄고, 표적 자신이나
 * 그 굴절형이 선지에 있으면 정답 누출이다.
 */
function gateTargetOptionFit(q: MdSynonymQuestion): string[] {
  const v: string[] = [];
  const targetText = cleanText(q.target);
  const target = targetText.toLowerCase();
  if (!target) return v;
  const targetLexeme = antonymPairKey(target);
  const formIssues: { label: string; issue: string }[] = [];

  for (const opt of q.options) {
    if (!opt.text) continue;
    const optKey = compareKey(opt.text);
    if (optKey === target) {
      v.push(`${opt.label} 선지가 대상 단어와 동일 — 자기 자신은 동의어 후보가 아니다: '${opt.text}'`);
      continue;
    }
    const optLexeme = antonymPairKey(optKey);
    if (targetLexeme && optLexeme && targetLexeme === optLexeme) {
      v.push(
        `${opt.label} 선지가 대상 단어의 굴절형 — 다른 단어를 써라: '${opt.text}' (대상 '${targetText}')`,
      );
      continue;
    }
    // 굴절 형태 정합 — 둘 다 단일 영어 토큰일 때만 발화하므로 구(phrase)는 자동 면제.
    const formIssue = findSynonymFormIssue(targetText, cleanText(opt.text));
    if (formIssue) formIssues.push({ label: opt.label, issue: formIssue });
  }

  // 선지 전부가 같은 축에서 어긋나면 원인은 선지가 아니라 **대상 쪽**일 확률이 높다.
  // 라벨 5개에 같은 문장을 5번 싣는 대신 대상을 지목한 한 줄로 모은다(철칙 5).
  if (formIssues.length >= 2 && formIssues.length === q.options.length) {
    v.push(
      `형태 불일치 — 선지 ${formIssues.length}개가 전부 대상 '${targetText}' 과 굴절 형태가 어긋난다(${formIssues[0].issue}). 대상의 품사·굴절형을 다시 확인하고, 선지 전체를 그 형태에 맞춰라`,
    );
  } else {
    for (const f of formIssues) v.push(`${f.label} 형태 불일치 — ${f.issue}`);
  }
  return v;
}

/** 셔플 재매핑 불가 표기 검사 — 해설·오답해설 전부. */
function gateAnswerMentions(q: MdSynonymQuestion): string[] {
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
        `${where}가 선지를 평숫자로 지칭함('${m[0]}') — 선지 순서는 출제 후 재배열된다. 단어를 직접 쓰거나 ①~ 원문자만 써라`,
      );
    }
  }
  return v;
}

/** 기대 라벨 집합과의 차집합을 사람이 읽는 한 줄로. 빈 쪽은 문구에서 생략한다. */
function labelDiffNote(got: string[], want: string[]): string {
  const gotSet = new Set(got);
  const missing = want.filter((l) => !gotSet.has(l));
  const wantSet = new Set(want);
  const extra = got.filter((l) => !wantSet.has(l));
  const parts: string[] = [`인식된 라벨 ${got.join("") || "없음"}`];
  if (missing.length) parts.push(`${missing.join("")} 줄이 없거나 형식이 어긋남`);
  if (extra.length) parts.push(`${extra.join("")} 는 계약 밖 라벨`);
  return parts.join(", ");
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdSynonym(
  q: MdSynonymQuestion,
  passage: string,
  options?: GateMdSynonymOptions,
): string[] {
  const optionCount = options?.optionCount ?? q.options.length;
  const answerCount = options?.answerCount ?? 1;
  const requireWrong = options?.requireWrong !== false;
  const expected: string[] = SYNONYM_MD_CIRCLED.slice(0, optionCount);
  const optionLabelList = q.options.map((o) => o.label);
  const countMismatch = q.options.length !== optionCount;

  const v: string[] = [];
  // ⚠ 26-07-26 적대검수 major: 종전에는 개수 불일치에서 조기 return 해
  // `선지 4개 (5개 필요)` **한 줄만** 돌려주고 표적·정답·해설 검사를 전부 침묵시켰다.
  // 규범 §1-B 철칙 5 가 나쁜 예로 인용한 "어휘쌍 3개 (5개 필요)" 와 정확히 같은 상태다.
  // 이제 ①어느 라벨이 비었는지 지목하고 ②개수와 무관한 검사는 계속 돌려, 재생성
  // 프롬프트가 한 번에 전량을 고칠 수 있게 한다(라벨 순서 검사만 파생 잡음이라 끈다).
  if (countMismatch) {
    v.push(
      `선지 ${q.options.length}개 (${optionCount}개 필요) — ${labelDiffNote(optionLabelList, expected)}`,
    );
  }
  v.push(
    ...gateOptionShape(q, expected, countMismatch),
    ...gateOptionSurface(q),
    ...gateTarget(q, passage),
    ...gateTargetOptionFit(q),
    ...gateAnswerMentions(q),
  );

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

  if (!normalizeText(q.explanation)) v.push("해설 누락");

  const wrongNeeded = optionCount - answerCount;
  if (requireWrong && q.wrong.length !== wrongNeeded) {
    // 어느 라벨이 비었는지 지목한다. `정답:` 라벨을 오답 칸에 쓰는 실측 드리프트는
    // 파서가 걷어내므로(관대한 파싱), 걷어낸 사실을 여기서 되살려 붙인다 —
    // 그러지 않으면 "오답해설 3개" 만 남아 모델이 같은 실수를 반복한다(철칙 3·5).
    const wantWrong = expected.filter((l) => !q.answers.includes(l));
    const dropped = q.answerLabelsInWrong ?? [];
    const droppedNote = dropped.length
      ? ` · 정답 라벨 ${dropped.join("")} 줄이 오답 칸에 있어 제외됨(정답 해설은 \`해설:\` 줄에 쓴다)`
      : "";
    v.push(
      `오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요) — 정답을 뺀 모든 선지에 1개씩. ${labelDiffNote(q.wrong.map((w) => w.label), wantWrong)}${droppedNote}`,
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
