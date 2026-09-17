// ============================================================================
// 내용 일치(CONTENT_MATCH) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 이 유형은 **지문을 한 글자도 건드리지 않는다.** 밑줄·네모·빈칸이 없으니
// "지문 재구성 일치" 라는 최강 게이트가 존재하지 않는다. 그래서 형식 설계의
// 승부처는 하나다 — **각 선지의 판단 근거가 되는 지문 문장을 받아 내는 것.**
// 그 한 줄이 있어야 (1) 모델이 "지문에 없는 사실"을 지어내지 못하고
// (2) 게이트가 0원으로 축자 대조·중복·전역 분포를 결정형으로 검사할 수 있다.
// 근거 줄이 없으면 이 유형의 게이트는 개수 세기밖에 남지 않는다.
//
// ⚠ 발문(direction)은 이 프롬프트가 받지 않는다. 극성(일치/불일치)·정답 개수·
//   발문 언어는 전부 **교사 설정**이므로 어댑터가 결정론으로 합성한다 —
//   설정을 모델에게 되받는 것은 §1-B 철칙 1(한 정보는 한 곳에서만) 위반이고,
//   실제로 fast 레인의 content-match-direction-polarity error 가 그 구멍이다.
// ============================================================================

import type { ContentMatchPolarity } from "@/lib/question-type-generation-settings";
import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** md 선지 라벨 축 — 원문자 ①~⑫ (optionCount 최대 12). */
export const CONTENT_MATCH_MD_CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫",
] as const;

export const CONTENT_MATCH_MD_OPTION_COUNT_MIN = 5;
export const CONTENT_MATCH_MD_OPTION_COUNT_MAX = 12;
export const CONTENT_MATCH_MD_ANSWER_COUNT_MIN = 1;

export function clampContentMatchMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONTENT_MATCH_MD_OPTION_COUNT_MIN;
  return Math.min(
    CONTENT_MATCH_MD_OPTION_COUNT_MAX,
    Math.max(CONTENT_MATCH_MD_OPTION_COUNT_MIN, n),
  );
}

export function clampContentMatchMdAnswerCount(
  value: unknown,
  optionCount: number,
): number {
  const max = clampContentMatchMdOptionCount(optionCount);
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONTENT_MATCH_MD_ANSWER_COUNT_MIN;
  return Math.min(max, Math.max(CONTENT_MATCH_MD_ANSWER_COUNT_MIN, n));
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 이 유형의 급소(왜곡은 실재 주장에서, 한 지점에서만)를 실물로 보여 준다.
const CONTENT_MATCH_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 도시의 가로수가 여름 기온을 낮추지만, 그 효과는 나무가 충분히 자란 뒤에야 측정된다는 글.
- 근거 문장 배치: 다섯 진술의 근거를 지문 1·2·4·5·7번째 문장에서 하나씩 뽑아 글 전체를 훑었다. 앞 두 문장에서 다섯 개를 짜내지 않았다.
- 정답(불일치) 설계 — 조건·시점 탈락: 지문은 "묘목을 심은 뒤 10년이 지나야 냉각 효과가 관측된다"고 했는데, 진술은 "가로수를 심으면 그해 여름부터 기온이 내려간다"로 시점 조건만 떼어 냈다. 나머지 정보(주체·인과 방향·수치)는 전부 지문 그대로다.
- 왜 아름다운가: 학생이 근거 문장을 찾아 나란히 놓았을 때 어긋나는 지점이 **'10년 뒤'라는 한 곳으로** 확정된다. 두 군데를 동시에 비틀지 않았기 때문에 시비가 생기지 않는다.
- 참 진술 설계: 넷 다 근거 문장의 뜻을 정확히 담되 어휘를 멀리 보냈다 — "체감 온도가 3도까지 떨어진다"를 "실제 기온과 사람이 느끼는 더위 사이의 간극이 줄어든다"로. 표면 어휘가 지문과 달라 학생은 "안 나온 얘기 같은데?" 하고 흔들리지만, 근거 문장을 읽으면 정확히 참이다.`;

const CONTENT_MATCH_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도)
- 왜곡은 근거 문장 한 문장 안에서 확인되는 명시적 사실(수치·주체·시점·유무)에서 일어난다. 문장 하나를 나란히 놓으면 판정이 끝나야 한다.
- 나머지 진술도 각자의 근거 문장 하나만 읽으면 확인되게 하라. 두 문장을 합쳐야 하는 진술은 이 난이도에 넣지 마라.`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도)
- 왜곡은 서로 다른 두 문장의 관계(인과·대조·조건)를 잘못 결합한 데서 일어난다 — 근거 문장 하나만 읽으면 참처럼 읽혀야 하고, 앞뒤 문장을 함께 봐야 어긋남이 드러나야 한다.
- 나머지 진술 중 최소 하나는 두 문장을 합쳐야 참임이 확정되게 하라.`,
  KILLER: `## 표적 설계
- 왜곡은 글의 논지가 수렴하는 자리(중반 이후의 주장·인과의 귀결)에서 일어난다. 지엽적인 예시 문장을 비틀어 정답을 만들지 마라 — 그건 사실 확인 문제이지 독해 문제가 아니다.
- 근거 문장을 찾아 읽어도 한정어 하나·인과 방향 하나의 차이라 한 번 더 되짚어야 판정되게 하라.
- 나머지 진술은 전부 재진술 강도가 높아 표면 어휘 대조로는 하나도 확인되지 않아야 한다.`,
};

/** 왜곡 기제 분류학 — 정본 빈칸의 4종(방향반대·도입부함정·범위확대·근거없음)을
 *  "지문 진술과의 대조" 라는 이 유형의 판단축으로 번역한 것. */
const DISTORTION_TAXONOMY = `1. 인과 뒤집기(방향반대): 지문의 원인과 결과를 맞바꾸거나, 지문이 상관으로만 말한 것을 인과로 격상한다.
2. 조건·시점 탈락(도입부함정): 지문이 붙여 둔 전제·조건절·시점(초기에는·실험 상황에서는·훈련을 거친 뒤에야)을 떼어 내 무조건 참인 것처럼 말한다. 문장의 앞부분만 읽은 학생이 정확히 이 함정에 빠진다.
3. 범위·정도 확대(범위확대): 지문의 한정어(일부·흔히·특정 조건에서)를 전칭(모든·항상·결코)으로 밀거나, 한 사례의 결론을 전체로 일반화한다.
4. 주체·대상 바꿔치기(근거없음의 정교한 형): 지문에서 서로 다른 두 주체(집단 A와 B, 저자와 반대편, 과거와 현재)에 속한 서술을 맞바꾼다. 소재는 전부 지문에 실재하므로 소거가 안 된다.`;

function polarityContract(
  matchType: ContentMatchPolarity,
  optionCount: number,
  answerCount: number,
): string {
  const rest = optionCount - answerCount;
  const answerSide = matchType === "일치" ? "일치하는" : "일치하지 않는";
  const restSide = matchType === "일치" ? "일치하지 않는" : "일치하는";
  return `## 이 문항의 정답 규약 (교사 설정 — 어기면 문항이 무효다)
- 학생은 "지문의 내용과 ${answerSide} 진술"을 고른다. 정답은 정확히 ${answerCount}개다.
- 정답 진술 ${answerCount}개는 지문 내용과 ${answerSide} 진술이고, 나머지 ${rest}개는 전부 지문 내용과 ${restSide} 진술이다.
- 발문은 시스템이 이 설정 그대로 자동으로 붙인다 — **발문 줄을 쓰지 마라.** 유형·극성·정답 개수를 다시 적지도 마라.`;
}

/** 왜곡·참진술 공예 절. 극성에 따라 "왜곡 기제를 정답에 거는가 / 오답에 거는가" 가 뒤집힌다. */
function craftSection(
  matchType: ContentMatchPolarity,
  optionCount: number,
  answerCount: number,
): string {
  const rest = optionCount - answerCount;
  if (matchType === "불일치") {
    return `## 정답 진술 ${answerCount}개의 왜곡 기제 — 여기서 문항의 격이 갈린다
정답은 **지문에 실재하는 주장 하나를 미세하게 비튼 것**이어야 한다. 아래 4종 중 서로 다른 것을 ${answerCount}개 골라라(같은 기제 두 번 금지).
${DISTORTION_TAXONOMY}
- 왜곡은 **한 지점에서만** 일어난다. 한 진술에서 두 군데를 동시에 비틀면 어긋남이 확정되지 않아 시비가 생긴다.
- 🚫 금지: 지문에 없는 사실을 새로 지어내 정답으로 삼는 것. 그건 함정이 아니라 무근거라 학생이 지문을 안 읽고도 소거한다.

## 참 진술 ${rest}개 — 즉사 오답 금지
- 참 진술은 근거 문장의 뜻을 **정확히** 담되 표현은 최대한 멀리 보내라. 어휘가 지문과 똑같으면 학생은 눈으로 대조만 하고 끝낸다.
- ${rest}개 중 최소 2개는 상위권 학생도 지문으로 되돌아가 확인해야 한다 — 표면 어휘가 지문과 달라 "안 나온 얘기 같은데?" 하고 흔들리되, 근거 문장을 읽으면 정확히 참인 진술.
- 절대 표현(모든·항상·결코·전혀)을 정답에만 몰지 마라. 단정적인 진술이 하나뿐이면 지문을 읽지 않고도 찍힌다.`;
  }
  return `## 오답 진술 ${rest}개의 왜곡 기제 — 여기서 문항의 격이 갈린다
오답은 전부 **지문에 실재하는 주장 하나를 미세하게 비튼 것**이어야 한다. 아래 4종을 서로 겹치지 않게 배분하라(${rest}개가 4개를 넘으면 같은 기제 안에서 비트는 대상을 달리하라).
${DISTORTION_TAXONOMY}
- 왜곡은 진술마다 **한 지점에서만** 일어난다. 두 군데를 동시에 비틀면 어긋남이 확정되지 않아 시비가 생긴다.
- 🚫 금지: 지문에 없는 사실을 새로 지어내 오답으로 삼는 것. 그건 함정이 아니라 장식이라 학생이 지문을 안 읽고도 소거한다.

## 정답 진술 ${answerCount}개 — 즉사 정답 금지
- 정답은 근거 문장의 뜻을 **정확히** 담되 표현은 최대한 멀리 보내라. 지문 문장을 그대로 옮겨 적으면 학생은 눈으로 대조만 하고 끝낸다.
- 정답이 유독 길거나 유독 조심스러운 표현("~한 경우도 있다")이면 그 형태만으로 찍힌다. ${optionCount}개 진술의 길이·단정성·추상도를 맞춰라.
- 오답 ${rest}개 중 최소 2개는 상위권 학생도 정답과 끝까지 저울질하게 만들어라 — 근거 문장을 정확히 읽어야만 어긋남이 드러나는 것으로.`;
}

function explanationBlock(
  mode: MdExplanationMode,
  matchType: ContentMatchPolarity,
  optionCount: number,
  answerCount: number,
  labels: readonly string[],
): string {
  const rest = optionCount - answerCount;
  // 라벨 앵커링 회피(prompts.ts:257-265 선례) — 예시 정답을 ① 로 보여 주면
  // 모델이 그 자리를 그대로 쓴다. 홀수 인덱스를 먼저 소진하고 모자라면 나머지를
  // 채운 뒤 라벨 순으로 정렬한다(중복 없는 예시 보장).
  const sample = [
    ...labels.filter((_, i) => i % 2 === 1),
    ...labels.filter((_, i) => i % 2 === 0),
  ]
    .slice(0, answerCount)
    .sort((a, b) => labels.indexOf(a) - labels.indexOf(b));
  const answerShape =
    answerCount === 1
      ? `<${labels[0]}~${labels[labels.length - 1]} 중 하나>`
      : `<서로 다른 ${answerCount}개를 ", " 로 이어서 — 예: ${sample.join(", ")}>`;
  const head = `정답: ${answerShape}
해설: <딱 2문장 — 정답 진술이 근거 문장의 무엇과 ${
    matchType === "일치" ? "맞아떨어지는지" : "어긋나는지"
  }만. 합니다체`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  // 26-08-18 O225 해설 다이어트 — 판정 근거 1문장만(유혹·기제 서사 제거)
  const wrongShape =
    matchType === "불일치"
      ? "<근거 문장이 이 진술을 왜 참으로 확정하는지 딱 1문장 — 왜 틀린 것처럼 보이는지 서술 금지>"
      : "<이 진술이 근거 문장의 무엇과 어긋나는지 딱 1문장 — 기제 이름·왜 그럴듯한지 서술 금지>";
  return `${head}>
오답:
${labels[0]} ${wrongShape} (정답 번호는 제외하고 ${rest}개만)
...`;
}

export interface MdContentMatchPromptOptions {
  optionCount?: number;
  answerCount?: number;
  /** 정답 극성(교사 설정). 기본 "불일치" — 수능 표준형. */
  matchType?: ContentMatchPolarity;
  /** 선지 언어(교사 설정). 기본 "en" — 내용일치 보기 기본은 영문(2026-06-10 강사 확정). */
  optionLanguage?: "ko" | "en";
}

/**
 * 내용 일치 md 프롬프트.
 * 출력 계약(parser-content-match.ts 와 1:1):
 *   `선지:` ①~ 라벨 라인 + `근거:` ①~ 라벨 라인(지문 축자 문장) +
 *   `정답:`(유일 진실원) + `해설:` + `오답:`.
 * 줄마다 참·거짓 표시를 받지 않는다 — 정답은 `정답:` 줄 하나가 진실원이다
 * (§1-B 철칙 1. 반의어가 그 중복 계약 때문에 실사용에서 2연속 반려됐다).
 */
export function buildMdContentMatchPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: MdContentMatchPromptOptions,
): string {
  const optionCount = clampContentMatchMdOptionCount(
    opts?.optionCount ?? CONTENT_MATCH_MD_OPTION_COUNT_MIN,
  );
  const answerCount = clampContentMatchMdAnswerCount(
    opts?.answerCount ?? CONTENT_MATCH_MD_ANSWER_COUNT_MIN,
    optionCount,
  );
  const matchType: ContentMatchPolarity = opts?.matchType === "일치" ? "일치" : "불일치";
  const optionLanguage = opts?.optionLanguage === "ko" ? "ko" : "en";
  const labels = CONTENT_MATCH_MD_CIRCLED.slice(0, optionCount);
  const lastLabel = labels[labels.length - 1];
  const langWord = optionLanguage === "ko" ? "한국어" : "영어";
  const langRule =
    optionLanguage === "ko"
      ? "- 진술문은 전부 **한국어**로 쓴다(지문에서 인용할 고유명사·전문용어만 영어 그대로 허용)."
      : "- 진술문은 전부 **영어**로 쓴다. 한글을 한 글자도 섞지 마라(해설과 오답 해설만 한국어다).";

  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 진술문 ${optionCount}개를 제시하고 "지문의 내용과 ${
          matchType === "일치" ? "일치하는" : "일치하지 않는"
        } 것"을 고르게 하는 KILLER 문항 1개를 설계하라. 진술 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 진술에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 진술문 ${optionCount}개를 제시하고 "지문의 내용과 ${
          matchType === "일치" ? "일치하는" : "일치하지 않는"
        } 것"을 고르게 하는 문항 1개(난이도: ${
          difficulty === "BASIC"
            ? "기본 — 교과서 수준 확인형"
            : "중급 — 모의고사 중위권, 문장 관계 판단 필요"
        })를 설계하라. 진술 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock = difficulty === "BASIC" ? "" : `${CONTENT_MATCH_FEWSHOT}\n\n`;
  const optionScaffold = [
    `${labels[0]} <${langWord} 진술문>`,
    ...labels.slice(1).map((l) => `${l} ...`),
  ].join("\n");
  const evidenceScaffold = [
    `${labels[0]} <${labels[0]}의 참·거짓이 확정되는 지문 문장 하나 — 한 글자도 바꾸지 말고 그대로>`,
    ...labels.slice(1).map((l) => `${l} ...`),
  ].join("\n");

  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}${polarityContract(matchType, optionCount, answerCount)}

## 진술문 ${optionCount}개 — 지문을 옮겨 적는 게 아니라 다시 말하는 것이다
- 각 진술은 지문의 한 문장을 근거로 삼되, **그 문장을 그대로 옮겨 적으면 실격이다.** 어휘와 구조를 바꿔 재진술하라 — 그래야 학생이 눈으로 대조하지 않고 뜻을 이해해야 한다.
- 진술 ${optionCount}개의 근거 문장은 **서로 다른 문장**이고, ${labels[0]}의 근거가 가장 앞, ${lastLabel}의 근거가 가장 뒤가 되도록 **지문 등장 순서대로** 배열한다. 앞 두 문장에서 ${optionCount}개를 짜내면 실패다 — 지문 전체를 고르게 훑어라.
- 진술은 지문에 실제로 서술된 것만 다룬다. 새 인물·새 수치·새 소재를 지어내지 마라.
${langRule}

${CONTENT_MATCH_TARGET_BY_DIFFICULTY[difficulty]}

${craftSection(matchType, optionCount, answerCount)}

## 마감 — 위반하면 시험 요령으로 뚫린다
- 진술 ${optionCount}개의 길이를 서로 맞춰라(가장 긴 것이 가장 짧은 것의 두 배를 넘지 않게). 유독 긴 진술 하나가 정답을 흘리면 안 된다.
- 지문 문장을 그대로 옮겨 적은 진술이 하나라도 있으면 실격이다.
- 정답은 정확히 ${answerCount}개다. ${answerCount + 1}개째가 시비 걸릴 여지가 있으면 그 문항은 무효다.
- 근거 줄은 지문에서 **한 글자도 바꾸지 말고** 문장 하나를 통째로 옮겨 적는다(마침표까지). 요약·중략(...)·두 문장 이어붙이기 금지.

## 출력 전 자기검산 (사고 안에서 수행)
- 진술 ${optionCount}개 각각에 대해 "이 진술의 참·거짓이 지문의 어느 문장으로 확정되는가"를 한 줄씩 답해 보라 — 못 대는 진술은 재설계.
- 근거 ${optionCount}줄이 전부 지문에 그대로 있는 문장인지, 서로 다른 문장인지, 지문 등장 순서대로인지 확인하라.
- 정답 진술을 그 근거 문장과 나란히 놓고 "무엇이 ${
    matchType === "일치" ? "맞아떨어지는가" : "어긋나는가"
  }"를 한 지점으로 지목할 수 있는지 확인하라 — 두 지점 이상이면 재설계.
- 나머지 ${optionCount - answerCount}개를 각자의 근거 문장과 나란히 놓고 판정이 뒤집히지 않는지 확인하라 — 하나라도 걸리면 복수정답이라 문항이 무효다.
- 지문 문장을 그대로 옮겨 적은 진술이 없는지 확인하라.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
선지:
${optionScaffold}

근거:
${evidenceScaffold}

${explanationBlock(mode, matchType, optionCount, answerCount, labels)}

## 지문
${passage}`;
}
