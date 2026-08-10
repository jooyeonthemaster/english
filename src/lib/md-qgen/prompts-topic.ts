// ============================================================================
// 주제 추론(TOPIC) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 이 유형은 **지문을 한 글자도 건드리지 않는다.** 그래서 형식이 가장 얇다 —
// 선지 N개 + 정답 + 해설 + 오답, 그게 전부다(형식 설계 철칙 §1-B: 한 정보는 한
// 곳에서만, 줄당 칸 수 최소화). 정답 여부를 줄마다 다시 받는 칸을 만들지 않는다.
// `정답:` 줄이 유일 진실원이다 — 반의어가 그 중복 계약 때문에 실사용에서 2연속
// 반려됐다.
//
// 형식이 얇은 만큼 **승부는 전적으로 선지 공예**에서 난다. 그래서 이 프롬프트의
// 중심 블록은 정본 빈칸의 오답 기제 분류학(방향반대·도입부함정·범위확대·근거없음)
// 을 '주제' 판단축으로 번역해 이식한 것이다:
//   방향반대 → 관점 반전 / 도입부함정 → 도입부 소재 함정 /
//   범위확대 → 범위 이탈(확대·축소) / 근거없음 → 지문 밖 통념
// 여기에 이 유형 고유의 다섯째 기제(관점 소거 = '소재만 맞는 선지')를 더한다.
// 주제 문항의 최다 실패는 "정답이 소재로 전락하는 것"이라 그 자리를 오답에 먼저
// 배정해 정답이 소재에 머무를 자리를 없앤다.
//
// ⚠ 발문(direction)은 모델에게 받지 않는다 — 극성·정답 개수·발문 언어의 함수라
//   어댑터가 결정론으로 만든다(lane-topic.ts buildTopicDirection). 모델이 만들 수
//   있는 실패 모드 하나를 통째로 제거한 것이다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 선지 라벨 축 — 원문자. 최종 저장 라벨("1"~"N")은 어댑터가 파생한다. */
export const TOPIC_MD_CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧",
] as const;

// UI 설정 범위(generic option/answer count)와 동기 — question-type-generation-settings/generic.ts
export const TOPIC_MD_OPTION_COUNT_MIN = 4;
export const TOPIC_MD_OPTION_COUNT_MAX = 8;
export const TOPIC_MD_OPTION_COUNT_DEFAULT = 5;
export const TOPIC_MD_ANSWER_COUNT_MIN = 1;
export const TOPIC_MD_ANSWER_COUNT_DEFAULT = 1;

/** 대의파악 정답 극성 — NEGATIVE 는 '주제로 적절하지 않은 것' 고르기. */
export type TopicMdPolarity = "POSITIVE" | "NEGATIVE";
/** 학생에게 보이는 선지 언어(기본 en — TOPIC 은 영어 주제구가 표준). */
export type TopicMdOptionLanguage = "en" | "ko";

export function clampTopicMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TOPIC_MD_OPTION_COUNT_DEFAULT;
  return Math.min(TOPIC_MD_OPTION_COUNT_MAX, Math.max(TOPIC_MD_OPTION_COUNT_MIN, n));
}

/** 정답 개수 클램프 — 오답이 최소 1개는 남아야 하므로 상한은 optionCount-1. */
export function clampTopicMdAnswerCount(value: unknown, optionCount: number): number {
  const options = clampTopicMdOptionCount(optionCount);
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return TOPIC_MD_ANSWER_COUNT_DEFAULT;
  return Math.min(options - 1, Math.max(TOPIC_MD_ANSWER_COUNT_MIN, n));
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 이 해부는 "정답은 소재가 아니라 소재+관점"이라는 이 유형의 급소를 한 화면에 보여준다.
const TOPIC_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 지문·표현을 복사하지는 마라)
지문: 도시의 가로수가 여름 기온을 낮추는 효과는 어떤 수종을 심느냐보다 나무를 얼마나 촘촘히 **이어서** 심느냐에 달려 있다는 글. 전반부는 "더 좋은 수종을 고르면 된다"는 통념을 소개하고, 중반의 However 이후 연속된 수관(canopy)이 만드는 그늘의 사슬이 진짜 변수임을 논증한다.
- ① 관점 소거(소재만): "the variety of tree species planted in modern cities" — 화제는 맞지만 필자가 그것에 대해 무엇을 주장했는지가 없다. 지문을 대충 읽은 학생이 가장 먼저 집는 선지다.
- ② 도입부 소재 함정: "the growing popularity of choosing heat-resistant species" — However 이전의 통념에 시야가 갇힌 선지. 지문 앞부분만 읽으면 완벽해 보인다.
- ③ 범위 이탈: "how urban forests can replace mechanical cooling systems" — 지문 소재를 쓰되 지문이 말하지 않은 해결책으로 넓혔다.
- ④ 정답: "why the continuity of tree cover matters more than species choice in cooling cities" — 중심 화제(도시 냉각)와 **필자의 판단**(연속성 > 수종)이 한 구 안에 같이 들어 있다. 이 둘 중 하나라도 빠지면 주제가 아니라 소재다.
- ⑤ 관점 반전: "the limited role of shade in lowering summer temperatures" — 핵심어(그늘·기온)를 그대로 실어 정답처럼 보이게 해 놓고 필자의 평가 방향을 뒤집었다. 상위권도 마지막까지 정답과 저울질하는 자리다.
- 이 설계가 아름다운 이유: 오답 넷이 각각 "이 학생은 글의 어느 지점에서 멈췄는가"를 정확히 하나씩 지목한다(안 읽음 / 앞부분만 / 밖으로 나감 / 방향을 뒤집음). 그리고 다섯 선지가 전부 같은 층위의 명사구여서, 형태나 길이만 보고는 정답을 고를 수 없다.`;

// 난이도 3분기 — 주제가 지문 어디에 어떻게 놓여 있는지가 난이도의 실체다.
const TOPIC_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도)
- 주제가 **한 문장에 명시된 글**을 기준으로 잡아라 — 주제문(첫 문단의 일반 진술이나 결론 문장)이 정답의 근거가 되고, 근거 깊이는 1문장이면 된다.
- 정답은 그 주제문을 자연스럽게 압축한 표현이되, 문장을 그대로 옮겨 적지는 마라(주제 선지는 진술문이 아니라 압축된 구다).
- 오답은 명백히 구분되게 하되 각자 "왜 그럴듯한가"의 답은 있어야 한다 — 아무 관련 없는 소재를 던져 놓은 선지는 선지가 아니라 빈칸 채우기다.`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도)
- 주제가 **두 문장 이상의 종합**으로만 결정되게 하라 — 통념 제시 후 반박, 원인 제시 후 귀결처럼 논지가 꺾이는 지점을 지나야 정답이 확정되는 글의 층위를 골라라.
- 정답은 지문의 표면 어휘를 그대로 나열하지 말고 한 단계 추상화하라. 핵심 명사 하나 정도는 공유해도 되지만, 지문 문장을 복사한 티가 나면 실패다.
- 오답 중 최소 2개는 지문의 실제 문장에 정박시켜라 — 지문을 읽지 않고 상식만으로 소거되는 오답이 다수면 문항이 무너진다.`,
  KILLER: `## 표적 설계 — KILLER 의 생명
- 주제가 **글 전체에 분산**된 지문 층위를 다뤄라: 도입부의 통념, 중반의 전환, 후반의 재정의가 각각 다른 문장에 흩어져 있고, 셋을 다 읽어야만 중심 생각이 하나로 좁혀지는 글.
- 정답은 지문의 표면 어휘를 재사용하지 않는 **추상 명사구**로 써라(핵심 명사·동사 재사용 0개 목표). 단, 추상화가 지나쳐 어느 지문에나 붙는 문구가 되면 그것도 실패다 — 이 지문에만 맞아야 한다.
- 정답이 지문의 특정 한 문장을 그대로 가리키면 안 된다. 학생이 문장 하나를 찾아 대조하는 것으로 풀면 킬러가 아니다.
- 오답 중 최소 2개는 상위권도 끝까지 정답과 저울질하게 만들어라. 그중 하나는 반드시 **관점 반전**이어야 한다 — 핵심어를 그대로 실어 정답처럼 보이게 하고 필자의 평가·인과 방향만 뒤집은 선지다.`,
};

// 오답 기제 분류학 — 정본 빈칸 4종의 '주제' 축 번역 + 이 유형 고유의 5번째.
// 소재 구속·층위 일치는 정본 문구를 이 유형의 표면(명사구 선지)으로 옮겼다.
const TOPIC_TAXONOMY = `1. **관점 반전(최매력)**: 글의 핵심어를 그대로 실어 주제처럼 보이게 해 놓고, 필자의 평가 방향이나 인과 방향만 뒤집는다(옹호↔비판, 원인↔결과, A가 B를 낳는다↔B가 A를 낳는다).
2. **도입부 소재 함정**: 논지 전환(However·Yet·But 류) 이전의 통념·배경·도입 예시를 글 전체의 주제로 삼은 진술. 앞부분만 읽은 학생이 고른다.
3. **범위 이탈(확대 또는 축소)**: 지문 소재를 쓰되 지문이 말하지 않은 일반화·해결책·전망으로 넓히거나, 예시 하나·세부 사실을 전체 주제로 좁힌다.
4. **지문 밖 통념(근거 없음)**: 상식적으로 그럴듯하지만 지문에 논리 근거가 없는 진술.
5. **관점 소거(소재만 맞음)**: 중심 화제는 정확한데 필자의 판단이 빠져 '주제'가 아니라 '소재'에 그친 진술.`;

const TOPIC_MATERIAL_RULES = `- 소재 구속: 오답의 재료는 전부 **지문에 실재하는 소재·어휘**여야 한다. 지문에 없는 분야 개념(다른 학문 용어·정책 방안·기술 이름)을 들여오면 학생이 지문을 안 읽고 소거한다 — 그건 함정이 아니라 장식이다.
- 층위 일치: 선지 전부를 같은 문법 형식(명사구 또는 의문사절 중 하나로 통일)과 같은 추상 층위로 맞춰라. 하나만 형태가 다르면 그 하나가 정답으로 지목된다.
- 지문 문장 축자 복사 금지: 선지는 지문 문장을 옮겨 적은 것이 아니라 **압축한 것**이다. 지문 문장을 그대로 잘라 붙인 선지는 기계 검사에서 반려된다.`;

function distractorSection(
  polarity: TopicMdPolarity,
  wrongCount: number,
  answerCount: number,
): string {
  if (polarity === "NEGATIVE") {
    return `## 선지 설계 — 정답(부적절) ${answerCount}개 + 타당한 선지 ${wrongCount}개
- 이 문항의 **정답은 "주제로 명백히 부적절한" 선지 ${answerCount}개**다. 정답은 아래 기제 중 하나를 명확하게 구현하라(둘 이상을 섞어 어정쩡하게 만들지 마라):
${TOPIC_TAXONOMY}
- 나머지 **${wrongCount}개는 전부 이 글의 주제로 충분히 타당**해야 한다. 각각 다른 근거 문장·다른 초점으로 타당하되, 어느 하나도 "덜 포괄적이라 부적절하다"는 시비가 붙으면 안 된다 — 복수정답은 이 유형의 사형선고다.
- 정답 선지는 길이·추상도·문체를 나머지와 똑같이 맞춰라. 정답이 형태로 표나면 문항이 죽는다. 부적절함은 오직 **내용**(지문 범위 이탈·관점 반전·근거 없음)에서만 드러나야 한다.
${TOPIC_MATERIAL_RULES}`;
  }
  const spread =
    wrongCount >= 5
      ? `- 오답 ${wrongCount}개에 기제 5종을 하나씩 배정하고, 남는 오답은 이미 쓴 기제를 다시 쓰되 **지문의 다른 문장**에 정박시켜라(같은 문장을 두 번 노리면 두 선지가 같은 함정이 된다).`
      : wrongCount === 4
        ? `- 오답 4개에 기제를 하나씩 배정하라 — **관점 반전과 관점 소거는 반드시 포함**하고(관점 소거를 오답에 먼저 배정해야 정답이 소재로 전락할 자리가 없어진다), 나머지 둘은 2~4번에서 서로 다른 것을 고른다. 같은 기제 2개는 금지다.`
        : `- 오답 ${wrongCount}개에 서로 다른 기제를 배정하라 — **관점 반전은 반드시 포함**한다. 같은 기제 2개는 금지다.`;
  return `## 오답 ${wrongCount}개 — 기제 분류학 (같은 기제 중복 금지)
${TOPIC_TAXONOMY}
${spread}
${TOPIC_MATERIAL_RULES}`;
}

/**
 * 극성 안내 — NEGATIVE 일 때만. 위쪽 블록들(few-shot 해부·표적 설계)은 '가장 적절한
 * 것' 문항의 언어로 쓰여 있어서, 극성이 뒤집히면 그 안의 '정답'이라는 말이 이번
 * 문항의 정답과 반대를 가리킨다. 블록을 통째로 두 벌 쓰는 대신 **역할 전환을
 * 한 번 명시**해 해부의 가치를 살리고 모순만 제거한다.
 */
function polarityBridge(polarity: TopicMdPolarity, difficulty: MdDifficulty): string {
  if (polarity !== "NEGATIVE") return "";
  const fewshotLine =
    difficulty === "BASIC"
      ? ""
      : `\n- 위 **모범 설계 해부**도 '가장 적절한 것' 문항의 것이다. 거기서 **오답으로 설계된 넷이 이번 문항의 정답 후보**이고, 정답으로 설계된 하나가 이번 문항에서는 타당한 선지 쪽이다. 설계 기제는 그대로 가져오되 무엇을 고르게 할지만 뒤집어라.`;
  return `## ⚠ 극성 주의 (이 문항은 '적절하지 않은 것' 고르기다)
- 위 **표적 설계** 절에서 말하는 '정답'은 *이 글의 올바른 주제 진술*을 뜻한다. 그 진술을 정확히 확정하는 일은 똑같이 먼저 해야 한다 — 주제를 못 잡으면 무엇이 부적절한지도 정할 수 없다.
- 다만 이번 문항에서 그 올바른 진술은 **고르게 할 답이 아니라 타당한 선지 쪽**에 놓인다.${fewshotLine}

`;
}

function optionShapeSection(
  optionCount: number,
  optionLanguage: TopicMdOptionLanguage,
  hasFewshot: boolean,
): string {
  if (optionLanguage === "ko") {
    return `## 선지 표면 (교사 설정: 한국어 선지)
- 선지 ${optionCount}개는 전부 **한국어 명사구**로 쓴다("~하는 이유", "~의 필요성", "~에 대한 오해" 류).${
      hasFewshot
        ? `\n- 위 해부의 예시 선지는 영어지만 **이번 문항의 선지는 한국어**다 — 설계 원리만 가져오고 표면 언어는 이 절을 따른다.`
        : ""
    }
- 완전한 진술문("…해야 한다", "…이다")으로 쓰지 마라 — 그것은 요지(MAIN_IDEA) 유형의 표면이고, 주제 유형에서는 층위 위반이다.
- 지문의 영어 표현을 한국어 문장 속 어휘로 섞지 마라(인용이 꼭 필요하면 따옴표로 묶는다).`;
  }
  return `## 선지 표면 (표준: 영어 선지)
- 선지 ${optionCount}개는 전부 **영어 명사구 또는 짧은 구**로 쓴다(the/how/why 로 시작하는 구 포함). 한국어를 섞지 마라 — 한국어 주제 선지는 요지형 문항과 혼동된다.
- 완전한 문장(주어+정동사로 끝맺는 진술문)으로 쓰지 마라. 마침표로 끝내지 않는다.
- 다섯 선지의 첫 단어 형태를 지나치게 통일하지 마라(전부 The 로 시작하는 식) — 형태 반복은 내용 없는 평행일 뿐이다. 층위만 맞으면 된다.`;
}

function closingSection(polarity: TopicMdPolarity, wrongCount: number): string {
  if (polarity === "NEGATIVE") {
    return `## 마감 — 위반하면 시험 요령으로 뚫린다
- **복수정답 금지가 이 극성의 생명이다**: 타당한 선지 ${wrongCount}개는 어느 하나도 "덜 포괄적이라 부적절하다"는 시비가 붙으면 안 된다. 고르게 할 선지만 내용상 명백히 부적절하고, 나머지는 전부 깨끗해야 한다.
- 부적절한 선지가 길이·문체·추상도로 표나면 실패다. 선지 길이는 서로 ±3단어 이내로 맞춘다.
- 절대 표현(all·never·completely·only 류)을 부적절한 선지에만 몰지 마라 — 그 단어 하나가 소거 요령이 된다.
- 선지끼리 같은 뜻이 되면 안 된다. 두 선지가 서로 다른 말로 같은 것을 말하면 어느 쪽이 부적절한지 시비가 생긴다.`;
  }
  return `## 마감 — 위반하면 시험 요령으로 뚫린다
- 즉사 오답 금지: ${wrongCount >= 4 ? "오답 중 최소 2개는" : "오답 중 최소 1개는"} 상위권 학생도 정답과 끝까지 저울질해야 한다. 한눈에 지워지는 선지만 늘어놓으면 변별력이 0이다.
- 정답만 유독 길거나 유독 종합적으로 보이면 실패다. 선지 길이는 서로 ±3단어 이내로 맞춘다.
- 절대 표현(all·never·completely·only 류)을 오답에만 몰지 마라 — 그 단어 하나가 소거 요령이 된다.
- 선지끼리 같은 뜻이 되면 안 된다. 두 선지가 서로 다른 말로 같은 것을 말하면 복수정답 시비다.`;
}

function selfCheckSection(
  polarity: TopicMdPolarity,
  optionCount: number,
  wrongCount: number,
): string {
  const head =
    polarity === "NEGATIVE"
      ? `- 타당한 선지 ${wrongCount}개 각각에 대해 "이 진술이 이 글의 주제로 타당한 지문 근거는 무엇인가"를 한 줄씩 답해보라 — 못 대는 선지는 두 번째 정답이 되어 문항을 무효로 만든다.
- 고르게 할 선지에 대해 "왜 이것이 이 글의 주제가 될 수 없는가"를 한 줄로 답해보라 — '조금 약하다' 수준이면 복수정답 시비이므로 재설계.
- 그 선지가 지문 밖 개념을 들여왔는지 확인하라 — 소재는 지문 안에서 가져오되 판단만 어긋나야 한다.`
      : `- 정답 선지 하나만 남기고 나머지를 지운 뒤 "이 글은 무엇에 관한, 어떤 주장의 글인가"에 그 선지가 답이 되는지 확인하라 — 화제만 남았으면 관점을 보태 재설계.
- 각 오답에 대해 "이 선지를 고르는 학생은 글의 어느 지점에서 멈췄는가"를 한 줄씩 답해보라 — 못 대는 오답은 재설계.
- 오답이 지문 밖 개념을 들여왔는지 확인하라 — 들여왔으면 그 선지는 함정이 아니라 장식이다.`;
  return `## 출력 전 자기검산 (사고 안에서 수행)
${head}
- 선지 ${optionCount}개의 문법 형식과 길이가 나란한지, 정답이 형태만으로 지목되지 않는지 확인하라.
- 지문 문장을 그대로 잘라 붙인 선지가 없는지 확인하라.
- 해설과 오답 해설에서 선지를 번호(③, 3번, 선지 2)로 지칭하지 마라 — 선지 순서는 저장 시 재배열되므로 번호 지칭은 문항을 무효로 만든다. 지칭이 필요하면 그 선지의 내용을 인용하라.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).`;
}

// 정답 병기 예시 — 홀수 인덱스 라벨을 먼저 골라 "②, ④" 형태로 보여준다.
// (①부터 채우면 모델이 예시 라벨을 실제 정답으로 앵커링하는 실측 편향 — 정본
//  grammarAnswerExample 과 같은 회피책.)
function topicAnswerExample(optionCount: number, answerCount: number): string {
  const picked: number[] = [];
  for (let i = 1; i < optionCount && picked.length < answerCount; i += 2) picked.push(i);
  for (let i = 0; i < optionCount && picked.length < answerCount; i += 2) picked.push(i);
  picked.sort((a, b) => a - b);
  return picked.map((i) => TOPIC_MD_CIRCLED[i]).join(", ");
}

function topicExplanationBlock(
  mode: MdExplanationMode,
  optionCount: number,
  answerCount: number,
  polarity: TopicMdPolarity,
): string {
  const lastLabel = TOPIC_MD_CIRCLED[optionCount - 1];
  const wrongCount = optionCount - answerCount;
  const answerLine =
    answerCount === 1
      ? `정답: <${TOPIC_MD_CIRCLED[0]}~${lastLabel} 하나>`
      : `정답: <정답 라벨 ${answerCount}개를 ", " 로 병기 — 예: ${topicAnswerExample(optionCount, answerCount)}>`;
  const explanationCore =
    polarity === "NEGATIVE"
      ? `딱 2문장 — 이 글의 주제가 무엇인지 먼저 밝히고, 정답 선지가 그 주제에서 어떻게 벗어나는지. 합니다체`
      : `딱 2문장 — 논지 전개를 근거로 중심 화제와 필자의 관점을 연결해 정답을 도출. 합니다체`;
  if (mode === "answer-only") {
    return `${answerLine}
해설: <${explanationCore}. 오답 해설은 쓰지 마라>`;
  }
  const wrongCore =
    polarity === "NEGATIVE"
      ? `<이 선지가 이 글의 주제로 왜 타당한지 지문 근거로 1문장>`
      : `<기제 이름 — 이 선지를 고르는 학생이 글의 어느 지점에서 멈췄는지, 그리고 왜 주제가 아닌지 1문장>`;
  return `${answerLine}
해설: <${explanationCore}>
오답:
${TOPIC_MD_CIRCLED[0]} ${wrongCore} (정답 번호는 제외하고 ${wrongCount}개만)
...`;
}

/**
 * 주제 추론 md 프롬프트.
 *
 * 출력 계약(parser-topic.ts 와 1:1): 원문자 선지 N줄 + `정답:` + `해설:` + `오답:`.
 * 지문은 건드리지 않으므로 지문 재출력 블록이 없다 — 이 유형에서 가장 중요한
 * 사실이다(출력이 짧아 절단 위험도 낮다).
 */
export function buildMdTopicPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: {
    optionCount?: number;
    answerCount?: number;
    polarity?: TopicMdPolarity;
    optionLanguage?: TopicMdOptionLanguage;
  },
): string {
  const optionCount = clampTopicMdOptionCount(
    opts?.optionCount ?? TOPIC_MD_OPTION_COUNT_DEFAULT,
  );
  const answerCount = clampTopicMdAnswerCount(
    opts?.answerCount ?? TOPIC_MD_ANSWER_COUNT_DEFAULT,
    optionCount,
  );
  const polarity: TopicMdPolarity = opts?.polarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const optionLanguage: TopicMdOptionLanguage = opts?.optionLanguage === "ko" ? "ko" : "en";
  const wrongCount = optionCount - answerCount;
  const labels = TOPIC_MD_CIRCLED.slice(0, optionCount);

  const goal =
    polarity === "NEGATIVE"
      ? `"글의 주제로 적절하지 **않은** 것"을 고르게 하는`
      : answerCount >= 2
        ? `"글의 주제로 적절한 것을 모두" 고르게 하는`
        : `"글의 주제로 가장 적절한 것"을 고르게 하는`;
  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 ${goal} KILLER 문항 1개를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 ${goal} 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock = difficulty === "BASIC" ? "" : `${TOPIC_FEWSHOT}\n\n`;

  const multiAnswerBlock =
    answerCount < 2
      ? ""
      : polarity === "NEGATIVE"
        ? `\n\n## 정답 ${answerCount}개 (교사 설정, 필수)
- 고르게 할 **부적절한 선지 ${answerCount}개**는 각각 **독립적으로** 부적절해야 하고, 서로 다른 이유(범위 이탈·관점 반전·근거 없음 등)로 부적절해야 한다.
- 나머지 ${wrongCount}개는 전부 이 글의 주제로 충분히 타당해야 한다 — 그중 하나라도 흔들리면 정답이 ${answerCount}개를 넘어 문항이 무효가 된다.`
        : `\n\n## 정답 ${answerCount}개 (교사 설정, 필수)
- 정답 ${answerCount}개는 **각각 독립적으로** 이 글의 주제로 타당해야 한다. 서로 표현과 초점이 다르되 둘 다 옳아야 하며, 한쪽이 다른 쪽의 상위·하위 개념이면 시비가 붙으므로 금지한다.
- 나머지 ${wrongCount}개는 전부 명백히 주제가 아니어야 한다.`;

  const scaffold = labels.map((c) => `${c} <선지>`).join("\n");

  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 주제란 무엇인가 — 여기서 문항의 격이 갈린다
- 주제는 **중심 화제 + 그 화제에 대한 필자의 관점**이다. 둘 중 하나만 있으면 그것은 주제가 아니라 소재(화제만) 이거나 요지(주장 문장)다.
- 이 유형은 요지·주장 문항이 아니다. 정답을 완전한 진술문으로 쓰지 마라 — 압축된 구로 써야 한다.
- 지문은 **한 글자도 바꾸지 않는다**. 지문을 다시 출력하지도 마라. 네가 만드는 것은 선지 ${optionCount}개와 해설뿐이다.

${TOPIC_TARGET_BY_DIFFICULTY[difficulty]}

${polarityBridge(polarity, difficulty)}${distractorSection(polarity, wrongCount, answerCount)}

${optionShapeSection(optionCount, optionLanguage, difficulty !== "BASIC")}${multiAnswerBlock}

${closingSection(polarity, wrongCount)}

${selfCheckSection(polarity, optionCount, wrongCount)}

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
${scaffold}
${topicExplanationBlock(mode, optionCount, answerCount, polarity)}

## 지문
${passage}`;
}
