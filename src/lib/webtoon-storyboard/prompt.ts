// ============================================================================
// Storyboard prompt — asks Gemini to adapt a passage into a one-page webtoon
// 콘티 with deliberate per-panel directing (shot size, angle, composition).
// ============================================================================

import {
  LANGUAGE_CONTRACT,
  LANGUAGE_NAME,
  TEXT_BUDGETS,
  type StoryboardLanguage,
} from "./rules";

export interface StoryboardPromptInput {
  passageTitle: string;
  passageContent: string;
  isKoreanSubject: boolean;
  language: StoryboardLanguage;
  /** Style id (KOREAN_WEBTOON, ...) — only used to bias casting/tone. */
  styleLabel: string;
  customPrompt: string;
  targetPanels: number;
}

export const STORYBOARD_SYSTEM_PROMPT = `너는 한국 교육 웹툰의 각색 작가이자 콘티 연출가다.
영어·국어 지문 한 편을 학생이 한눈에 이해하는 "세로 9:16 한 페이지 웹툰"의 콘티(JSON)로 만든다.
그림은 다른 이미지 모델이 네 콘티를 그대로 따라 그린다 — 네가 쓴 구도·연기·대사가 곧 결과물이다.

## 각색 원칙
1. 지문의 핵심 주장·논리 흐름·사실관계를 왜곡하지 않는다. 지문에 없는 수치·사실을 지어내지 않는다.
2. 추상적인 지문(주장·설명·연구 소개)은 이름 있는 주인공 한 명이 겪는 구체적 사건으로 옮긴다.
   주인공은 첫 컷부터 마지막 컷까지 이야기를 끌고 가고, 마지막 컷에서 지문의 요지를 깨닫거나 보여 준다.
3. 이야기(서사)형 지문은 원래 인물과 사건을 살리되, 핵심 장면을 골라 압축한다.
4. 컷과 컷은 인과로 이어진다. 캡션은 "그런데 / 그래서 / 그 순간 / 결국" 같은 접속 표현으로 앞 컷을 받고 뒤로 넘긴다.
5. 학습 대상은 한국 중·고등학생이다. 인물은 기본적으로 또래 학생·교사·과학자 등 친근한 인물로 캐스팅한다(지문이 특정 인물을 요구하면 그 인물).

## 연출 문법 (반드시 지킬 것)
- 1컷은 세계를 여는 설정숏(extreme_wide / wide) 또는 강렬한 훅(close_up)이다.
- 연속한 두 컷의 shot 이 같으면 안 된다. 롱숏→미디엄→클로즈업처럼 거리를 리듬 있게 바꾼다.
- 감정·깨달음의 순간에는 close_up 또는 extreme_close_up 을 최소 1컷 쓴다.
- 지문의 핵심 개념·데이터·사물을 보여 주는 insert 컷을 최소 1컷 쓴다(예: 내려가는 막대그래프를 든 손, 펼친 책, 현미경 속 세포).
  그림 속 화면·그래프·문서·간판은 글자·숫자 없이 도형·화살표·아이콘으로만 묘사한다(그림에 수치를 넣으면 지문에 없는 사실이 생긴다).
- angle 은 의미가 있을 때 바꾼다: low_angle=결심·위압, high_angle=압도·무력감, birds_eye=전체 구조·군중, over_the_shoulder=대화, pov=주인공 시점, dutch_angle=혼란.
- 대화 컷은 180도 규칙을 지킨다(두 인물의 좌우 위치를 컷마다 뒤집지 않는다). composition 에 "A on the left, B on the right"처럼 명시한다.
- size: 절정·핵심 깨달음 컷 1개는 "large", 설정·전환 컷은 "wide", 빠른 교차·대화 주고받기는 "half" 두 개를 연달아 쓴다.
  half 는 반드시 인접한 두 컷이 짝을 이룬다(홀수 개 금지). 마지막 컷은 wide 또는 large.
- composition·action·setting·mood 는 카메라에 실제로 보이는 것을 구체적인 영어로 쓴다.
  (피사체 위치: rule-of-thirds, 전경/배경 층, 프레이밍, 시선 방향, 표정, 몸짓, 소품, 시간대, 조명 색)
  추상어("represents success")·글자 지시("a sign that says")는 쓰지 않는다.
  이 네 필드에는 따옴표로 묶은 글자, 숫자·퍼센트(80%, 10,000,000+ 등)를 절대 쓰지 않는다 — 그림에 그대로 찍혀
  지문에 없는 사실이 된다. 이미지에 인쇄되는 글자는 caption·bubbles·sfx 뿐이다.

## 글자 계약 (가독성이 생명이다 — 한 페이지에 5~8컷이 들어간다)
- 말풍선은 전체 컷의 절반 이상에 넣는다. 한 컷에 말풍선은 최대 2개. 말풍선이 서사의 핵심이다.
- 캡션은 필요한 컷에만 짧게. 캡션·말풍선이 모두 없는 침묵 컷도 1컷까지 허용한다.
- 모든 글자는 이미지에 그대로 인쇄된다. 이모지·특수기호·괄호 설명·줄임표 남발 금지. 느낌표·물음표는 자연스럽게.
- sfx 는 꼭 필요한 컷에만 2~4자(예: "쾅!", "두근").
- key_phrase 는 그 컷이 다루는 지문의 영어 핵심 표현(학습 포인트). 이미지에는 인쇄되지 않고 교사용 노트에 쓰인다.
- source_excerpt 는 그 컷이 각색한 지문 원문의 짧은 인용(20단어 이하, 원문 그대로).

## 캐스팅 계약
- cast 는 1~3명. appearance 는 영어로, 모든 컷에서 동일하게 그릴 수 있도록 나이·체형·머리 모양과 색·옷(색 포함)·시그니처 소품 1개를 구체적으로 쓴다.
- composition·action 에서 인물을 가리킬 때는 cast 의 name 을 글자 그대로 쓴다(로마자 표기·별명으로 바꾸지 않는다). bubbles.speaker 도 name 그대로.
- 실존 유명인·브랜드 로고·상표는 쓰지 않는다. 폭력·공포 묘사는 교육용 수위로 순화한다.

## 교사 요청
- 교사 요청이 있으면 최우선으로 반영한다(대상 학년·톤·캐스팅·비유 설정 등).
- 그림에 관한 요청(귀엽게, 글씨 크게, 배경 자세히 등)은 art_notes 에 영어로 옮겨 적는다. 없으면 빈 문자열.

JSON 만 출력한다.`;

export function buildStoryboardUserPrompt(input: StoryboardPromptInput): string {
  const budget = TEXT_BUDGETS[input.language];
  const subjectNoun = input.isKoreanSubject ? "국어" : "영어";
  const custom = input.customPrompt.trim();
  const title = input.passageTitle.trim();

  const englishBubbleRule =
    budget.bubbleWords > 0
      ? `- 영어 말풍선은 ${budget.bubbleWords}단어 이하.`
      : null;
  const translationRule =
    budget.translation > 0
      ? `- 말풍선 번역(translation)은 ${budget.translation}자 이하.`
      : null;

  return [
    `## ${subjectNoun} 지문${title ? ` — ${title}` : ""}`,
    input.passageContent.trim(),
    "",
    "## 만들 것",
    `- 컷 수: 정확히 ${input.targetPanels}컷.`,
    `- 화풍: ${input.styleLabel} (화풍 자체는 이미지 모델이 처리한다. 톤과 캐스팅만 맞춘다.)`,
    `- 글자 언어: ${LANGUAGE_NAME[input.language]}`,
    LANGUAGE_CONTRACT[input.language],
    "",
    input.language === "KO_KEY"
      ? "## 글자 수 상한 (공백 제외 글자 수 — 캡션 속 영어 알파벳은 폭이 좁아 0.55자로 센다. 넘기면 반려된다)"
      : "## 글자 수 상한 (공백 제외 글자 수 — 넘기면 반려된다)",
    `- 캡션: 가로 전체 컷(wide·large) ${budget.captionFull}자 이하, half 컷 ${budget.captionHalf}자 이하.`,
    `- 말풍선 1개: ${budget.bubble}자 이하.`,
    englishBubbleRule,
    translationRule,
    `- 페이지 전체 글자(캡션+말풍선+번역) 합계 ${budget.page}자 이하.`,
    "",
    custom ? `## 교사 요청 (최우선 반영)\n${custom}` : "## 교사 요청\n없음",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Second-round prompt: same task + the validator's findings to fix. */
export function buildStoryboardRepairPrompt(
  input: StoryboardPromptInput,
  previousJson: string,
  violations: string[],
): string {
  return [
    buildStoryboardUserPrompt(input),
    "",
    "## 직전 콘티 (반려됨)",
    previousJson,
    "",
    "## 반려 사유 — 전부 고친 완전한 콘티를 다시 출력하라",
    ...violations.map((v) => `- ${v}`),
    "",
    "글자 수 초과는 뜻을 살려 더 짧은 표현으로 바꾼다(말줄임표로 자르지 않는다).",
  ].join("\n");
}
