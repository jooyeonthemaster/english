// ============================================================================
// 반의어(ANTONYM) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 【이 파일은 신규 유형 승차의 견본(EXEMPLAR)이다.】 다른 유형 구현은 이 파일의
// 블록 구성·수사·형식 리터럴 관습을 그대로 따른다.
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 공예 서사는 question-prompts-vocab.ts:45-78(ANTONYM) 의 실전 검증된 지시를
// md 골격으로 옮긴 것이다 — 표적 선정 규칙·오축 다의어 함정·형태 정합·금지 쌍이
// 이미 실측 결함(true-real 동의어 쌍 반복 출하)에 대응해 다듬어져 있다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

export const ANTONYM_MD_LABELS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
] as const;

export const ANTONYM_MD_PAIR_COUNT_MIN = 5;
export const ANTONYM_MD_PAIR_COUNT_MAX = 10;

export function clampAntonymMdPairCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return ANTONYM_MD_PAIR_COUNT_MIN;
  return Math.min(ANTONYM_MD_PAIR_COUNT_MAX, Math.max(ANTONYM_MD_PAIR_COUNT_MIN, n));
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
const ANTONYM_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 서로 다른 언어들이 "공통의(common) 뿌리를 공유한다"는 비교언어학 글.
- 표적 선정: common · diverge · preserve · gradual · distinct — 전부 글의 논지를 지고 있는 내용어다. true/good/big 류 기초어로 칸을 채우지 않았다.
- 정답 쌍 설계(오축 다의어 함정): (A) common - rare. 지문에서 common 은 "빈번한"이 아니라 **"공유된"** 의 뜻이다. rare 는 '빈도축'의 정당한 사전 반의어라 훑어보면 완벽해 보이지만, 이 지문의 의미축(공유↔개별)이 아니다. 문맥상 실제 반의어는 separate 다.
- 미끼 쌍 설계: diverge-converge · preserve-discard · gradual-abrupt · distinct-indistinguishable — 넷 다 **이 지문의 문맥 의미**에 대한 반의어이고, 품사·형태(-e/-ed/-ual)까지 맞다.
- 이 설계가 아름다운 이유: 정답을 찾으려면 common 이 이 글에서 어떤 뜻으로 쓰였는지를 문장으로 되돌아가 확인해야 한다. 단어 카드만 보면 오히려 정답이 가장 그럴듯해 보인다.`;

const ANTONYM_ANSWER_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 정답 쌍 설계 (기본 난이도)
- 정답 쌍은 **동의어를 반의어 자리에 넣는 고전 함정**이 기본이다(increased - raised 류). 반의 관계가 성립하지 않음이 문맥 확인으로 명확히 드러나야 한다.
- 표적 단어는 의미가 명확한 내용어로 고르되, 기초 어휘(true/long/same/oldest 류)로 전 칸을 채우지 마라 — 최대 1~2개만 허용한다.`,
  INTERMEDIATE: `## 정답 쌍 설계 (중급 난이도)
- **투명 동의어 함정 금지** — true-real, big-large, good-beneficial 처럼 지문을 안 읽어도 "이건 동의어잖아"가 보이는 쌍은 실패다.
- 다음 중 하나로 설계하라:
  1. **오축(誤軸) 다의어 함정(최우선)**: 지문에서의 의미가 일상 의미와 다른 단어를 골라, "일상 의미의 정당한 사전 반의어"를 짝으로 표시한다. 표면상 그럴듯하지만 문맥 의미축이 다르다.
  2. **근접 뉘앙스 함정**: 올바른 반의어와 같은 의미장에 있으나 정도·방향·함축이 어긋나는 단어 — 문장에 재대입해야 판정된다.
- 미끼 중 최소 2개는 지문에 정박한 내용어여야 한다(단어 지식만으로 소거되면 미달).`,
  KILLER: `## 정답 쌍 설계 — KILLER 의 생명
- **오축(誤軸) 다의어 함정을 1순위로 설계하라**: 지문에서 그 단어가 쓰인 의미가 일상 의미와 다른 표적을 고르고, **일상 의미에 대한 정당한 사전 반의어**를 짝으로 제시한다. 사전을 펴면 실제로 반의어 목록에 실려 있어 학생이 "맞는데?" 하고 넘어가지만, 이 지문의 의미축으로는 반대말이 아니다.
- 차선책(근접 뉘앙스 함정): 올바른 반의어와 같은 의미장이되 정도·방향·함축이 어긋나는 단어. 문장에 재대입해야만 어긋남이 드러나야 한다.
- 🚫 정답으로 금지: 투명 동의어(true-real, big-large), 그리고 기초어(true/good/bad/new/long/same/old)를 정답 자리 표적으로 쓰는 것 — 문항이 단어 카드로 전락한다.
- 미끼 보정: 옳은 쌍 넷은 깨끗하고 시비 없어야 하지만 초등 사전 쌍(long-short, same-different)으로 다 채우지 마라 — 그런 쌍은 최대 1개. 나머지는 지문에 정박한 내용어를 같은 형태로.`,
};

function antonymExplanationBlock(
  mode: MdExplanationMode,
  wrongCount: number,
): string {
  const head = `정답: <반의 관계가 성립하지 않는 쌍의 라벨 하나>
바른짝: <정답 자리 단어의, 이 지문 문맥에서의 실제 반의어 한 단어>
해설: <딱 2문장 — 그 단어가 이 지문에서 갖는 의미축이 무엇이고 짝 단어가 왜 그 축의 반대가 아닌지. 합니다체`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}>
오답:
(A) <이 쌍이 이 지문 문맥에서 왜 정확한 반의 관계인지 1문장> (정답 라벨은 제외하고 ${wrongCount}개만)
...`;
}

/**
 * 반의어 md 프롬프트.
 * 출력 계약(parser-antonym.ts 와 1:1): `밑줄지문:` [[A:단어]] 인라인 마킹 +
 * `짝:` 라벨 라인(`(A) 원문단어 - 짝단어 | O|X | (X인 줄만) 실제 반의어`) +
 * `정답:` + `해설:` + `오답:`.
 */
export function buildMdAntonymPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { pairCount?: number },
): string {
  const pairCount = clampAntonymMdPairCount(opts?.pairCount ?? ANTONYM_MD_PAIR_COUNT_MIN);
  const labels = ANTONYM_MD_LABELS.slice(0, pairCount);
  const lastLabel = labels[labels.length - 1];
  const wrongCount = pairCount - 1;

  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 밑줄 어휘 ${pairCount}개와 짝 단어를 제시하고 "반의어 관계가 바르지 않은 것"을 고르게 하는 KILLER 문항 1개를 설계하라. 쌍 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 쌍에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 밑줄 어휘 ${pairCount}개와 짝 단어를 제시하고 "반의어 관계가 바르지 않은 것"을 고르게 하는 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 문맥 판단 필요"})를 설계하라. 쌍 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock =
    difficulty === "BASIC" ? "" : `${ANTONYM_FEWSHOT}\n\n`;

  const pairScaffold = [
    "(A) <원문 단어(마커 안 표현과 완전히 동일)> - <선지에 표시할 짝 단어>",
    ...labels.slice(1).map((l) => `(${l}) ...`),
  ].join("\n");

  return `너는 대한민국 수능 영어 어휘 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 표적 단어 선정 — 여기서 문항의 격이 갈린다
- 표적 ${pairCount}개는 **문맥을 봐야 의미가 결정되는 내용어**(동사·명사·형용사·부사)를 우선한다. 관사·전치사·접속사·대명사·be동사는 실격.
- true/long/oldest/same/good/bad 같은 초등 기초 어휘로 칸을 채우면 지문 없이 단어 카드만으로 풀리는 문항이 되어 실패다 — 그런 기초 쌍은 **옳은 쌍으로 최대 1~2개**만 허용한다.
- 표적은 지문 전체에 고루 분포시켜라. 한 문장에 두 개 이상 몰지 말고, 같은 문장에서 유사 의미의 단어 두 개(common 과 same 류)를 함께 표시하지 마라 — 어느 쪽이 진짜 오류인지 시비가 생긴다.
- 지문에 여러 번 등장하는 단어는 표적으로 쓰지 마라(밑줄 자리가 유일하게 확정되지 않는다).

${ANTONYM_ANSWER_BY_DIFFICULTY[difficulty]}

## 미끼 쌍 ${wrongCount}개 — 하나라도 시비가 나면 문항 전체가 무효다
- 미끼 ${wrongCount}쌍은 품사·형태·**문맥 의미축**까지 맞는 정확한 반의어여야 한다. 그 단어가 지문에서 쓰인 **그 의미**의 반의어인지 반드시 확인하라(사전 1번 뜻의 반의어가 아니라).
- 형태 정합 필수: forces 처럼 3인칭 단수 동사면 짝도 allows/restrains 같은 같은 형태여야 한다. restrain 처럼 원형을 섞으면 실패. -ing·-ly·-ed·비교급·최상급도 양쪽이 같아야 한다. (단 varied 처럼 형용사로 굳어진 분사형은 uniform 같은 일반 형용사와 짝지어도 된다.)
- 반의어는 단순 관련어·대조 이미지가 아니라 **같은 의미축의 정반대**다. mastery 의 반대는 ignorance 가 아니라 incompetence 축이다.
- 같은 쌍의 양방향을 서로 다른 선지로 쓰지 마라(good-bad 와 bad-good 을 한 문항에).
- 🚫 금지 쌍: force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, unproductive-passive, unproductive-uninterested, paid-refunded.

## 마감 — 위반하면 시험 요령으로 뚫린다
- 정답 쌍은 정확히 **1개**다. 두 개 이상이 시비 걸릴 여지가 있으면 그 문항은 무효다.
- 짝 단어는 전부 **한 단어**(또는 하이픈 결합 한 덩어리)로 쓴다. 구·절·설명구·괄호 뜻풀이 금지.
- 짝 단어의 길이·난이도를 서로 맞춰라. 유독 어렵거나 유독 긴 짝 하나가 정답을 흘리면 안 된다.

## 출력 전 자기검산 (사고 안에서 수행)
- 밑줄지문의 마커를 전부 걷어낸 텍스트가 원 지문과 한 글자도 다르지 않은지 확인하라 — 마커 안 단어도 원문 축자여야 한다(굴절형·대소문자 포함).
- 미끼 ${wrongCount}개 각각에 대해 "이 지문에서 이 단어의 의미는 무엇이고, 그 의미의 반대가 이 짝이 맞는가"를 한 줄씩 답해보라 — 못 대는 미끼는 재설계.
- 정답 쌍에 대해 "학생이 이걸 왜 반의어라고 착각하는가"와 "왜 실제로는 아닌가"를 각각 한 줄로 답해보라 — 못 대면 정답 쌍 재설계.
- 정답 쌍이 지문을 안 읽은 학생에게도 한눈에 들키는 투명 동의어가 아닌지 확인하라(기본 난이도 제외).
- "정답:" 라벨이 실제로 반의 관계가 깨진 그 쌍을 가리키는지, "바른짝:" 이 그 자리의 진짜 문맥 반의어인지 확인하라.
- 오답 목록에 정답 라벨을 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 짝 줄 작성 규칙 (기계 파싱 계약)
- 한 줄에 쌍 하나, 형태는 \`라벨 단어 - 짝단어\` **하나뿐**이다. 줄에 다른 칸을 덧붙이지 마라.
- 단어와 짝 단어 사이는 **공백-하이픈-공백**(\` - \`)으로 구분한다. 단어 자체에 하이픈이
  들어가도(well-being 류) 이 규칙 덕에 안전하게 갈린다.
- 어느 쌍이 오류인지는 줄에 표시하지 말고 아래 \`정답:\` 줄로만 알려라.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 표적 단어 ${pairCount}곳만 [[A:단어]] ~ [[${lastLabel}:단어]] 로 감싼다. 마커 안 단어는 원문 축자 그대로다(변형 절대 금지). 마커 밖의 모든 텍스트도 원문과 완전히 동일해야 한다.>

짝:
${pairScaffold}
${antonymExplanationBlock(mode, wrongCount)}

## 지문
${passage}`;
}
