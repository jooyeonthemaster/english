// ============================================================================
// 제목 추론(TITLE) md 프롬프트 — 정본 빈칸(buildMdBlankPrompt) 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 이 유형은 **지문을 한 글자도 건드리지 않는다.** 그래서 마크다운 계약이 전 유형
// 통틀어 가장 짧다 — 선지 N개 + `정답:` + `해설:` + `오답:` 이 전부다.
// 규범 §1-B 철칙 대조:
//   철칙1(한 정보는 한 곳) — 정답의 유일 진실원은 `정답:` 줄이다. 선지 줄에
//     "이게 정답인가"를 다시 받지 않는다(반의어 실사용 2연속 반려의 원인).
//   철칙2(줄당 칸 최소) — 선지 줄의 칸은 `번호 + 제목` 하나뿐이다. 오답 기제
//     이름은 별도 칸이 아니라 오답 해설 한 줄 안의 산문으로 받는다(정본 동형).
//   철칙3(조용한 버림 금지) — 파서가 줄 단위로 관대하게 읽고, 무엇이 어긋났는지는
//     게이트가 라벨을 지목한다.
//
// 공예의 승부처는 오답 설계다. 정본 빈칸의 오답 기제 분류학(방향반대·도입부함정·
// 범위확대·근거없음)을 "소재는 맞고 판단이 어긋난다"는 제목 유형의 판단축으로
// 번역해 이식했다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 선지 라벨 축 — 수능 표준 원문자. optionCount 4~8 을 전부 덮는다. */
export const TITLE_MD_CIRCLED = "①②③④⑤⑥⑦⑧";

export const TITLE_MD_OPTION_COUNT_MIN = 4;
export const TITLE_MD_OPTION_COUNT_MAX = 8;
export const TITLE_MD_OPTION_COUNT_DEFAULT = 5;
export const TITLE_MD_ANSWER_COUNT_MIN = 1;
export const TITLE_MD_ANSWER_COUNT_DEFAULT = 1;

/** 선지 텍스트 언어(교사 설정 optionLanguage). 기본은 영어 제목이다. */
export type TitleMdOptionLanguage = "ko" | "en";
/** 정답 극성(교사 설정 answerPolarity). NEGATIVE = '적절하지 않은 것' 고르기. */
export type TitleMdAnswerPolarity = "POSITIVE" | "NEGATIVE";

export interface TitleMdPromptOptions {
  optionCount?: number;
  answerCount?: number;
  optionLanguage?: TitleMdOptionLanguage;
  answerPolarity?: TitleMdAnswerPolarity;
}

export function clampTitleMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TITLE_MD_OPTION_COUNT_DEFAULT;
  return Math.min(TITLE_MD_OPTION_COUNT_MAX, Math.max(TITLE_MD_OPTION_COUNT_MIN, n));
}

/** 정답 개수 상한은 optionCount-1 — 오답이 0개면 문항이 성립하지 않는다. */
export function clampTitleMdAnswerCount(value: unknown, optionCount: unknown): number {
  const max = Math.max(TITLE_MD_ANSWER_COUNT_MIN, clampTitleMdOptionCount(optionCount) - 1);
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return Math.min(TITLE_MD_ANSWER_COUNT_DEFAULT, max);
  return Math.min(max, Math.max(TITLE_MD_ANSWER_COUNT_MIN, n));
}

export function titleMdLabels(optionCount: number): string[] {
  return TITLE_MD_CIRCLED.slice(0, clampTitleMdOptionCount(optionCount)).split("");
}

// 정답 병기 예시는 홀수 인덱스부터 뽑는다 — ① 부터 채우면 모델이 예시 라벨을
// 실제 정답으로 앵커링한다(정본 grammarAnswerExample 과 동일 근거).
function titleAnswerExample(optionCount: number, answerCount: number): string {
  const picked: number[] = [];
  for (let i = 1; i < optionCount && picked.length < answerCount; i += 2) picked.push(i);
  for (let i = 0; i < optionCount && picked.length < answerCount; i += 2) picked.push(i);
  picked.sort((a, b) => a - b);
  return picked.map((i) => TITLE_MD_CIRCLED[i]).join(", ");
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 기제 4종이 전부 실행된 한 문항을 통째로 해부해 보여 준다.
const TITLE_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 도시가 소음을 줄이려 방음벽을 세웠는데 주민들은 오히려 더 시끄럽다고 느꼈다 — 배경 소음이 걷히자 개별 소리가 도드라졌기 때문이라는 글.
- 논지 축: 시끄러움을 만드는 것은 "소리의 총량"이 아니라 "소리의 대비"다. 해결책이 문제를 키운 역설.
- 정답: "Why Silencing a City Can Make It Louder" — 결론(대비의 역설)을 지문 표면 어휘(barrier·background noise) 재사용 없이 압축했고, 제목 형상(의문형)도 갖췄다.
- 오답 해부(기제 각 1개, 중복 없음):
  · 방향반대 — "Sound Barriers: A Proven Cure for Urban Noise". 핵심 소재(방음벽)를 표제로 앞세워 가장 제목다워 보이지만 필자의 판단(실패)을 정반대(성공)로 뒤집었다. 소재 매칭으로 푸는 학생이 끝까지 붙잡는 최매력 오답.
  · 도입부함정 — "The Rising Toll of City Noise on Health". 논지 전환 이전의 도입 서술에 시야가 갇힌 제목. 지문에 실재하지만 결론이 아니다.
  · 범위확대 — "Redesigning Cities Around Human Perception". 지각이라는 지문의 재료를 쓰되 지문이 말하지 않은 도시 설계 전반의 처방으로 넓혔다.
  · 근거없음 — "Why People Complain More Than They Suffer". 그럴듯한 통념이지만 지문에 근거 문장이 0이다.
- 이 설계가 아름다운 이유: 정답을 고르려면 "무엇에 대한 글인가(소재)"가 아니라 "그래서 무엇이라 말하는가(판단)"까지 읽어야 한다. 소재만 맞춘 방향반대 선지가 표면상 가장 제목답게 보이므로 끝까지 저울질이 일어난다.`;

// 부정 극성 전용 few-shot. POSITIVE 해부본을 그대로 물려주면 재앙이다 — 거기서
// 오답에 배정한 기제(판단 뒤집기·근거없음·범위확대)가 부정 극성에서는 **정답(부적절)
// 제조법**과 동일하므로, 모델이 few-shot 을 따라 그 기제를 2개 이상 만들면 부적절
// 선지가 복수가 되어 복수정답 문항이 된다. 이 결함은 0원 결정형으로 판정할 수 없어
// 게이트·검증기 어디에도 걸리지 않고 그대로 출하된다.
const TITLE_FEWSHOT_NEGATIVE = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 도시가 소음을 줄이려 방음벽을 세웠는데 주민들은 오히려 더 시끄럽다고 느꼈다 — 배경 소음이 걷히자 개별 소리가 도드라졌기 때문이라는 글.
- 논지 축: 시끄러움을 만드는 것은 "소리의 총량"이 아니라 "소리의 대비"다. 해결책이 문제를 키운 역설.
- 정답(= 제목으로 적절하지 않은 것): "Sound Barriers: A Proven Cure for Urban Noise". 핵심 소재(방음벽)를 표제로 앞세워 표면상 가장 제목다워 보이지만, 필자의 판단(실패)을 정반대(성공)로 뒤집었다. 이 표제를 지지하는 문장이 지문에 **0개**라는 것이 결정형으로 확인된다.
- 타당한 선지 해부 — 넷이 서로 다른 근거 문장에 걸려 있어야 한다:
  · "Why Silencing a City Can Make It Louder" — 결론(대비의 역설)을 의문형 표제로 압축. 근거는 전환 이후의 귀결 문장.
  · "The Hidden Cost of Chasing Lower Decibels" — 같은 결론을 '대가'의 각도에서 재진술. 근거는 더 낮은 수치를 좇다 성가심을 짓는다는 마지막 문장.
  · "Contrast, Not Volume, Decides What Feels Noisy" — 논지 축 자체를 직진술. 근거는 대비를 정의한 문장.
  · "When Removing Noise Adds Irritation" — 역설을 조건절 표제로 되살림. 근거는 배경 소음이 걷힌 뒤의 서술.
- 이 설계가 아름다운 이유: 타당한 네 선지가 각각 다른 문장에 걸려 있어 어느 하나도 '덜 타당함'으로 흔들리지 않고, 부적절 선지 하나만 지문 전체와 정면으로 충돌한다. 학생은 소재가 아니라 필자의 판단 방향을 읽어야만 고를 수 있다.`;

const TITLE_ANSWER_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 정답 제목 설계 (기본 난이도)
- 주제문이 명시적으로 드러난 자리를 잡아, 그 주제문을 명료하게 압축한 제목을 정답으로 삼아라(근거 깊이 1문장).
- 정답이 지문의 핵심어를 한두 개 재사용해도 좋다. 다만 한 문장을 통째로 옮겨 적은 것은 제목이 아니라 인용이다.
- 오답은 명백히 구분되게 하되, 각자 "학생이 이걸 왜 고르는가"의 답은 반드시 있어야 한다.`,
  INTERMEDIATE: `## 정답 제목 설계 (중급 난이도)
- 정답은 서로 다른 두 문장을 인과 또는 대조로 이어야 도출되게 하라(근거 깊이 2문장). 한 문장만 읽고 골라지면 미달이다.
- 지문 표면 어휘 재사용은 최대 두 개까지. 나머지는 한 단계 위 개념으로 올려 써라.
- 오답 중 최소 하나는 지문의 핵심어를 정답보다 더 많이 담아, 표면 매칭 풀이를 적극적으로 유혹하라.`,
  KILLER: `## 정답 제목 설계 — KILLER 의 생명
- 정답은 글의 논지가 수렴하는 자리(전환 이후의 결론·인과의 귀결)를 압축한다. 도입부나 예시는 정답의 근거가 될 수 없다.
- 정답은 마지막 문장의 표면 패러프레이즈가 아니라 **글의 기능 구조(수단→경로→목적)를 압축한 제목**이어야 한다(26-08-19 상한 재채점 실측 — 표면 패러프레이즈 정답은 종반부 스캔 즉답). 표면 어휘 재사용 0개를 목표로, 지문에 없는 은유로 재기술하는 것이 최상급이다.
- 정답의 근거는 서로 다른 문장 두 개 이상에 흩어져 있어야 한다. 한 문장이 정답을 거의 그대로 풀어 놓은 지문이면 그 자리를 피해 논지 축을 다시 잡아라.
- 오답 중 최소 두 개는 상위권도 끝까지 정답과 저울질하게 만들어라 — 소재는 맞고 판단만 어긋난 선지가 그 역할이고, **지문 축자 어구(바이그램)는 정답이 아니라 이런 함정 오답에** 실어 표면 매칭 학생을 낚아라(수단-목적 전도형이 최적이다).`,
};

/**
 * 부정 극성 전용 난이도 3분기 — TITLE_ANSWER_BY_DIFFICULTY 의 대응물.
 * 규범 §1 블록3 은 BASIC/INTERMEDIATE/KILLER 3분기를 **필수**로 요구하는데,
 * 종전 negative 분기는 정답 설계절을 통째로 삭제해 세 난이도의 차이가 헤드라인
 * 한 문장뿐이었다. 부정 극성에서 갈라야 할 두 축은
 *   (1) 부적절 선지의 '명백성 강도'  (2) 타당 선지의 '근거 깊이' 다.
 */
const TITLE_NEGATIVE_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 선지 설계 (기본 난이도 — 부정 극성)
- 부적절 선지의 명백성: 주제문 한 문장(근거 깊이 1문장)만 확인해도 어긋남이 드러나야 한다 — 필자의 판단을 정면으로 뒤집거나, 지문에 근거 문장이 하나도 없는 주장을 담아라.
- 타당한 선지의 근거 깊이: 각 선지가 지문의 명시적 주제문·결론 문장 **하나**에 곧바로 대응해야 한다. 대응 문장을 못 대는 선지는 재설계.
- 타당한 선지가 지문 한 문장을 통째로 옮긴 인용이면 안 된다 — 압축된 표제여야 한다.`,
  INTERMEDIATE: `## 선지 설계 (중급 난이도 — 부정 극성)
- 부적절 선지의 명백성: 소재·어휘는 지문의 것을 그대로 쓰되 판단만 어긋나게 하라(소재가 지문 밖이면 읽지 않고도 걸러진다). 어긋남은 서로 다른 두 문장을 인과 또는 대조로 이어야(근거 깊이 2문장) 확정되게 하라.
- 타당한 선지의 근거 깊이: 선지들이 **서로 다른 문장**을 근거로 삼아야 한다. 둘이 같은 문장을 나눠 쓰면 사실상 같은 말이 되어 복수정답 시비를 부른다.
- 타당한 선지 중 최소 하나는 지문 표면 어휘를 부적절 선지보다 적게 쓰고도 논지를 더 정확히 담게 하라 — 표면 매칭 풀이가 오히려 틀리도록 설계하는 자리다.`,
  KILLER: `## 선지 설계 — KILLER 의 생명 (부정 극성)
- 부적절 선지의 명백성: 표면상 가장 제목다워야 한다(핵심 소재를 표제로 앞세우고 형식·길이도 나머지와 동일). 그러면서 **논지가 수렴하는 자리**에서만 어긋나라 — 도입부·예시와만 어긋나는 선지는 지문 전체와 충돌하지 않아 부적절 판정이 흔들린다.
- 어긋남은 결정형이어야 한다: "이 표제를 지지하는 문장이 지문에 0개"이거나 "지문의 결론과 방향이 정반대"여야 한다. '덜 포괄적이다'·'조금 좁다' 정도는 KILLER 에서 이의신청을 부르는 최악의 설계다.
- 타당한 선지의 근거 깊이: 각각 서로 다른 문장 두 개 이상에 근거가 흩어지게 하고, 표면 어휘 재사용 0개를 목표로 하라(지문이 만들어 낸 역설·비유를 제목의 형식으로 되살려라).
- 학생이 흔들려야 하는 지점은 "어느 것이 덜 좋은가"가 아니라 "어느 것만 지문과 충돌하는가"다. 전자로 흔들리면 그 문항은 무효다.`,
};

/** 오답 기제 분류학(POSITIVE 극성) — 정본 빈칸 4종을 제목 판단축으로 번역. */
function titleDecoySection(optionCount: number, wrongCount: number): string {
  const spread =
    wrongCount >= 4
      ? `기제 4종을 각각 최소 1개씩 쓰고, 남는 ${wrongCount - 4}개는 같은 기제의 다른 각도로 만들어라(같은 함정을 그대로 두 번 반복하지 마라).`
      : `아래 4종 중 서로 다른 ${wrongCount}종을 골라 하나씩 배정하라(같은 기제 2개 금지).`;
  return `## 오답 ${wrongCount}개 — 기제 분류학. ${spread}
1. 방향반대(최매력 오답): 글의 핵심 소재·표현을 표제로 그대로 실어 정답처럼 보이게 하고, 필자의 판단·태도·인과 방향만 정반대로 뒤집는다.
2. 도입부함정: 논지 전환(however·but·yet 류) 이전의 도입·통념 서술을 제목으로 삼은 선지. 지문에 실재하지만 결론이 아니다.
3. 범위확대 또는 세부축소: 지문의 소재를 쓰되 지문이 말하지 않은 범위·해결책·일반화로 넓히거나, 반대로 예시 하나·세부 하나에 갇혀 글 전체를 대표하지 못하게 만든다.
4. 근거없음(통념형): 주제와 그럴듯하게 어울리지만 지문에 근거 문장이 하나도 없는 서술.
- 소재 구속: 오답 ${wrongCount}개 전부 "지문에 실재하는 소재·어휘"를 재료로 만들어라. 지문에 없는 분야 개념(다른 학문 용어·정책 방안)을 들여오면 학생이 지문을 안 읽고도 소거한다 — 그건 함정이 아니라 장식이다.
- 층위 일치: 선지 ${optionCount}개의 형식을 맞춰라. 전부 제목 형상(명사구·동명사구·의문형·콜론 부제)이어야 한다. 하나만 완전한 진술문이면 내용을 안 읽어도 형식만으로 걸러진다.`;
}

/**
 * 부정 극성 전용 — 정답이 '부적절한 제목'이라 설계 방향이 통째로 뒤집힌다.
 * 소재 구속·층위 일치는 극성과 무관한 공통 공예 규칙인데 종전에는 POSITIVE 전용
 * titleDecoySection 안에만 있어서, negative 프롬프트에는 통째로 부재했다 —
 * 그래서 여기로 옮겨 실었다(규범 §1 블록4 는 두 규칙을 전 유형 필수로 못박는다).
 */
function titleNegativeSection(
  optionCount: number,
  answerCount: number,
  wrongCount: number,
): string {
  return `## ⚠️ 정답 극성 — '제목으로 적절하지 않은 것' 고르기 (이 절이 위의 모든 정답·오답 지시를 덮어쓴다)
- 학생이 골라야 하는 정답 ${answerCount}개는 이 글의 제목으로 **명백히 부적절한** 선지다.
- 나머지 ${wrongCount}개는 전부 제목으로 충분히 타당해야 한다. 각각 다른 근거(결론 압축·논지 축·인과의 귀결·역설의 재진술)로 타당해야 하고, 어느 하나도 부적절로 오인될 여지가 없어야 한다 — 복수정답 시비가 붙으면 문항 전체가 무효다.
- 정답(부적절) 선지는 길이·추상도·형식을 나머지와 똑같이 맞추되, 아래 중 하나로 '명백히' 부적절하게 만들어라: 필자의 판단을 정반대로 뒤집기 / 지문에 근거가 0인 주장 담기 / 지문이 말하지 않은 범위로 넓히기. 단순히 덜 포괄적인 정도로는 안 된다.
- 소재 구속: 선지 ${optionCount}개 전부 "지문에 실재하는 소재·어휘"를 재료로 만들어라. 지문에 없는 분야 개념(다른 학문 용어·정책 방안)을 들여오면 학생이 지문을 안 읽고도 부적절 선지를 찍는다 — 그건 함정이 아니라 장식이다.
- 층위 일치: 선지 ${optionCount}개의 형식을 맞춰라. 전부 제목 형상(명사구·동명사구·의문형·콜론 부제)이어야 한다. 하나만 완전한 진술문이면 내용을 안 읽어도 형식만으로 찍힌다.
- 아래 \`오답:\` 절에는 '적절한' 나머지 ${wrongCount}개가 각각 왜 제목으로 타당한지를 지문 근거로 한 줄씩 쓴다.`;
}

/**
 * 마감 규칙 — 극성에 따라 문장을 **뒤집는다**.
 * 종전에는 POSITIVE 문구("즉사 오답 금지 / 오답 중 최소 2개는 끝까지 저울질")가
 * negative 에도 그대로 실려, 바로 위 극성 절의 "타당 선지는 어느 하나도 부적절로
 * 오인될 여지가 없어야 한다"와 정면으로 충돌했다. 저울질을 요구하면 곧 복수정답이다.
 */
function titleClosingSection(wrongCount: number, negative: boolean): string {
  const head = negative
    ? `- 타당한 선지 ${wrongCount}개는 어느 하나도 '부적절'로 오인될 여지가 없어야 한다. 근거가 약하거나 덜 포괄적인 선지를 하나라도 섞으면 그게 곧 복수정답이다 — 지문과 정면으로 충돌하는 선지는 정답뿐이어야 한다.
- 반대로 부적절 선지가 소재·형식·길이에서 혼자 튀면 읽지 않고도 찍힌다. 튀어야 하는 것은 오직 '판단의 방향'뿐이다.`
    : `- 즉사 오답 금지: ${wrongCount >= 2 ? "오답 중 최소 2개는" : "오답은"} 상위권 학생도 정답과 끝까지 저울질해야 한다. 소재만 확인하면 소거되는 선지를 절반 넘게 만들지 마라.`;
  const absolute = negative
    ? "- 절대 표현(always·never·only·완전히·유일한 류)을 부적절 선지에만 몰지 마라 — 그 표지 하나로 정답이 드러난다."
    : "- 절대 표현(always·never·only·완전히·유일한 류)을 오답에만 몰지 마라 — 그 표지 하나로 소거된다.";
  const length = negative
    ? "- 선지 길이는 서로 ±3단어 이내로 맞춰라. 부적절 선지만 유독 짧거나 길면 읽지 않고도 찍힌다."
    : "- 선지 길이는 서로 ±3단어 이내로 맞춰라. 정답만 유독 길거나 유독 포괄적이면 읽지 않고도 찍힌다.";
  return `## 마감 — 위반하면 시험 요령으로 뚫린다
${head}
${absolute}
${length}
- 두 선지가 사실상 같은 말이면 안 된다(복수정답 시비). 서로 다른 이유로 정확히 하나씩 갈려야 한다.
- 제목은 한 줄짜리 표제다. 문장 두 개를 잇거나 세미콜론으로 늘어놓지 마라.`;
}

function titleOptionLanguageRule(
  optionCount: number,
  optionLanguage: TitleMdOptionLanguage,
): string {
  return optionLanguage === "ko"
    ? `- 선지 ${optionCount}개는 전부 **한국어 제목**으로 쓴다. 지문에서 그대로 인용한 고유명사·전문 용어를 빼면 영어를 섞지 마라.`
    : `- 선지 ${optionCount}개는 전부 **영어 제목**으로 쓴다. 한국어를 섞지 마라(한국어는 해설·오답 해설에만 쓴다).`;
}

function titleExplanationBlock(
  mode: MdExplanationMode,
  optionCount: number,
  answerCount: number,
  negative: boolean,
): string {
  const wrongCount = optionCount - answerCount;
  const lastLabel = TITLE_MD_CIRCLED[optionCount - 1];
  const answerLine =
    answerCount === 1
      ? `정답: <${TITLE_MD_CIRCLED[0]}~${lastLabel} 하나>`
      : `정답: <정답 번호 ${answerCount}개를 ", " 로 병기 — 예: ${titleAnswerExample(optionCount, answerCount)}>`;
  const core = negative
    ? "딱 2문장 — 이 글의 논지 축이 무엇이고 정답 선지가 왜 그 축에서 벗어나는지. 합니다체"
    : "딱 2문장 — 이 글의 논지 축이 무엇이고 정답 제목이 그 축을 어떻게 압축하는지. 합니다체";
  if (mode === "answer-only") {
    return `${answerLine}
해설: <${core}. 오답 해설은 쓰지 마라>`;
  }
  // 26-08-18 O225 해설 다이어트
  const wrongShape = negative
    ? "<이 제목이 이 글의 제목으로 왜 타당한지 지문 근거로 1문장>"
    : "<왜 탈락인지 1문장 — 매력 이유·기제 이름 서술 금지>";
  return `${answerLine}
해설: <${core}>
오답:
${TITLE_MD_CIRCLED[0]} ${wrongShape} (정답 번호는 제외하고 ${wrongCount}개만)
...`;
}

/**
 * 제목 추론 md 프롬프트.
 * 출력 계약(parser-title.ts 와 1:1): 원문자 선지 N줄 + `정답:` + `해설:` + `오답:`.
 * 지문은 변형하지 않으므로 밑줄지문·재구성 계약이 없다.
 */
export function buildMdTitlePrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: TitleMdPromptOptions,
): string {
  const optionCount = clampTitleMdOptionCount(
    opts?.optionCount ?? TITLE_MD_OPTION_COUNT_DEFAULT,
  );
  const answerCount = clampTitleMdAnswerCount(
    opts?.answerCount ?? TITLE_MD_ANSWER_COUNT_DEFAULT,
    optionCount,
  );
  const optionLanguage: TitleMdOptionLanguage = opts?.optionLanguage === "ko" ? "ko" : "en";
  const negative = opts?.answerPolarity === "NEGATIVE";
  const wrongCount = optionCount - answerCount;
  const labels = titleMdLabels(optionCount);

  const polarityPhrase = negative
    ? "'제목으로 가장 적절하지 않은 것'을 고르게 하는 부정 극성 '제목 추론'"
    : "'제목 추론'";
  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 ${polarityPhrase} KILLER 문항 1개(선지 ${optionCount}개·정답 ${answerCount}개)를 설계하라. 선지 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 ${polarityPhrase} 문항 1개(선지 ${optionCount}개·정답 ${answerCount}개, 난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 선지 하나하나에 명확한 출제 의도가 있어야 한다.`;

  // 극성별 해부본을 갈아 끼운다 — POSITIVE 해부본을 negative 에 물려주면 그 안의
  // 오답 기제가 곧 '부적절 선지 제조법'이라 복수정답 문항을 가르치는 셈이 된다.
  const fewshot = negative ? TITLE_FEWSHOT_NEGATIVE : TITLE_FEWSHOT;
  const fewshotBlock = difficulty === "BASIC" ? "" : `${fewshot}\n\n`;

  const multiAnswerRule =
    answerCount >= 2
      ? negative
        ? `\n- 정답(부적절) ${answerCount}개는 서로 **다른 사유**로 부적절해야 한다(같은 사유 반복 금지). 두 정답이 사실상 같은 결함이면 하나를 재설계하라.`
        : `\n- 정답 ${answerCount}개는 서로 **다른 각도**에서 전부 타당한 제목이어야 한다(같은 말을 두 번 쓰지 마라). 각 정답이 지문의 어느 문장을 근거로 삼는지 서로 다르게 하라.`
      : "";

  // 난이도 3분기(설계절) → 극성 전용 절(덮어쓰기) 순서는 두 극성에서 동일하다.
  const designSection = negative
    ? `${TITLE_NEGATIVE_BY_DIFFICULTY[difficulty]}${multiAnswerRule}\n\n${titleNegativeSection(optionCount, answerCount, wrongCount)}`
    : `${TITLE_ANSWER_BY_DIFFICULTY[difficulty]}${multiAnswerRule}\n\n${titleDecoySection(optionCount, wrongCount)}`;

  const closingSection = titleClosingSection(wrongCount, negative);

  const selfCheck = `## 출력 전 자기검산 (사고 안에서 수행)
- ${negative ? `정답(부적절) ${answerCount}개가 왜 부적절한지, 나머지 ${wrongCount}개가 왜 타당한지` : `각 오답이 왜 탈락하는지`} 지문 근거로 한 줄씩 답해보라 — 못 대는 선지는 재설계.
- ${negative ? `타당한 선지 ${wrongCount}개를 각각` : "정답 제목을"} "이 글은 ___에 대한 글이고, 결론은 ___이다"로 풀어 쓸 수 있는지 확인${negative ? " — 정답(부적절) 선지만 그렇게 풀어 쓸 수 없어야 한다." : " — 소재만 있고 판단이 없으면 그건 제목이 아니라 주제어다."}
- ${negative ? `타당한 선지 ${wrongCount}개가 서로 다른 근거 문장에 걸려 있는지, 그래서 사실상 같은 말인 짝이 없는지` : "기제가 겹치는 오답이 없는지"} 확인.
- ${negative ? "타당한 선지" : "정답"}이 지문 한 문장의 축자 복사가 아닌지 확인 — 복사면 압축이 없다.
- 선지 ${optionCount}개가 전부 같은 형식·비슷한 길이인지 확인.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설·오답 해설은 한국어만 쓴다. 한자·가나 등 비한글 문자와 "영단어+다"(예: steals다) 짜깁기는 기계 검사에서 반려되니 절대 쓰지 마라 — 지문 표현을 인용할 때만 영어를 따옴표 안에 넣어라.`;

  const optionScaffold = labels
    .map((label, index) => (index === 0 ? `${label} <선지>` : `${label} ...`))
    .join("\n");

  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}${designSection}

${closingSection}

${selfCheck}

## 선지 줄 작성 규칙 (기계 파싱 계약)
- 한 줄에 선지 하나, 형태는 \`번호 제목\` **하나뿐**이다. 줄에 다른 칸(기제 이름·O/X·근거 문장)을 덧붙이지 마라.
- 번호는 원문자 ${labels.join("")} 를 순서대로 쓴다. 어느 선지가 정답인지는 줄에 표시하지 말고 아래 \`정답:\` 줄로만 알려라.
- 제목 안에 줄바꿈을 넣지 마라 — 선지 하나는 반드시 한 줄이다.
${titleOptionLanguageRule(optionCount, optionLanguage)}

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
${optionScaffold}
${titleExplanationBlock(mode, optionCount, answerCount, negative)}

## 지문
${passage}`;
}
