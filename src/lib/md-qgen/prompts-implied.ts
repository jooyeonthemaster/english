// ============================================================================
// 함축 의미 추론(IMPLIED_MEANING) md 프롬프트 — 정본(빈칸·어법) 7블록 골격 이식본.
// 견본: prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 이 유형은 **지문을 한 글자도 변형하지 않는다.** 모델이 내는 것은 밑줄 표적 한 줄과
// 선지·정답·해설·오답뿐이다. 그래서 형식이 전 유형 중 가장 가볍고, 공예의 승부처가
// 오롯이 "밑줄 자리 선정"과 "오답 {N-K}개 설계"에 놓인다.
//
// 공예 서사는 question-prompts-mc.ts:496-559(IMPLIED_MEANING) 의 실전 검증된 지시를
// md 골격으로 옮긴 것이다 — 세 갈래 표적(핵심 압축·정반대 방향·비유), 6단어 상한,
// 인접 재진술 금지, 리트머스 검사(표면-이면 간극 0 탈락)가 모두 실측 결함
// (문자 그대로의 사실 서술 = 최다 fatal / 지엽 타깃 반복 거부)에 대응해 다듬어져 있다.
// ============================================================================

import { findImpliedMeaningCandidates } from "@/lib/question-quality/candidate-blocks/implied";
import { rotateByVariantIndex } from "@/lib/question-quality/candidate-blocks/shared";
import { countWordBoundaryMatches } from "./parser";
import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 선지 라벨 축 — 최대 8지선다(generic optionCount 상한)까지 원문자. */
export const IMPLIED_MD_CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧",
] as const;

export const IMPLIED_MD_OPTION_COUNT_MIN = 4;
export const IMPLIED_MD_OPTION_COUNT_MAX = 8;
export const IMPLIED_MD_OPTION_COUNT_DEFAULT = 5;
export const IMPLIED_MD_ANSWER_COUNT_MIN = 1;
export const IMPLIED_MD_ANSWER_COUNT_DEFAULT = 1;

/**
 * 밑줄 표적 상한 — question-quality/validators/implied.ts 의
 * `implied-meaning-target-too-long`(항상 error) 과 **같은 값**이다.
 * 프롬프트·게이트·검증기가 한 숫자를 공유해야 "프롬프트는 8단어를 허용하는데
 * 서버가 6단어로 반려" 같은 자기모순이 생기지 않는다.
 */
export const IMPLIED_MD_TARGET_MAX_WORDS = 6;
export const IMPLIED_MD_TARGET_MAX_CHARS = 90;

export function clampImpliedMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return IMPLIED_MD_OPTION_COUNT_DEFAULT;
  return Math.min(
    IMPLIED_MD_OPTION_COUNT_MAX,
    Math.max(IMPLIED_MD_OPTION_COUNT_MIN, n),
  );
}

export function clampImpliedMdAnswerCount(
  value: unknown,
  optionCount: number = IMPLIED_MD_OPTION_COUNT_DEFAULT,
): number {
  const cap = Math.max(
    IMPLIED_MD_ANSWER_COUNT_MIN,
    clampImpliedMdOptionCount(optionCount) - 1,
  );
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return IMPLIED_MD_ANSWER_COUNT_DEFAULT;
  return Math.min(cap, Math.max(IMPLIED_MD_ANSWER_COUNT_MIN, n));
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 이 예시는 "표면 직역"과 "함축"이 확실히 다른 표적을 골랐을 때 문항이 어떻게
// 살아나는지를 보여준다(밑줄이 사실 서술이면 이 해부가 성립하지 않는다).
const IMPLIED_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 도시가 오래된 보도블록을 값싼 새 포장재로 갈아 끼우면서, 거리에 남아 있던 세대의 흔적이 함께 사라진다는 글. 마지막 문단이 "the city was rewriting a page it had never read" 로 닫힌다.
- 표적 선정: 마지막 문장에서 "a page it had never read"(6단어)만 잘라 냈다. 결론부 + 비유 + 압축 — 세 조건이 한자리에서 만난다. 문장 전체("the city was rewriting a page it had never read")를 그대로 밑줄 치지 않은 이유가 중요하다: ${IMPLIED_MD_TARGET_MAX_WORDS}단어를 넘으면 기계가 반려한다.
- 표면 직역: "읽어 본 적 없는 페이지." 이 직역만으로는 아무 판단도 나오지 않는다 — 바로 그 공백이 이 문항의 심장이다.
- 정답(함축): "개입하는 주체가 자기가 무엇을 지우는지 이해하지 못한 채 손대고 있다" — 앞 문단의 '흔적'과 뒤 문장의 '값싼 교체'를 이어야만 도출된다. 밑줄 문장 하나만 읽어서는 나오지 않는다.
- 오답 설계: ①표면직역 — "도시가 아직 읽지 않은 기록을 새로 작성했다"(직역에서 한 발도 못 나감). ②방향반대 — "낡은 기록을 되살려 보존했다"(지문 핵심어 '기록'을 앞에 실어 정답처럼 보이지만 필자의 평가가 정반대). ③범위확대 — "모든 도시 재개발은 중단되어야 한다"(지문이 말하지 않은 처방). ④근거없음 — "주민들이 새 포장재를 선호했다"(그럴듯하지만 텍스트 근거 0).
- 이 설계가 아름다운 이유: 정답을 고르려면 밑줄을 문장으로 되돌려 앞뒤 근거를 이어야 하고, 직역만 한 학생은 ①에서 멈춘다. 오답마다 "이 학생은 왜 이걸 고르는가"의 답이 한 줄로 나온다.`;

// 표적(밑줄) 설계 — 난이도 3분기. 근거 깊이(1문장/2문장/2문장 이상 분산)가 축이다.
const IMPLIED_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도)
- 밑줄은 **결론부(마지막 1~2문장)나 첫 문장의 주제 압축 표현**에서 고른다. 함축의 근거는 밑줄 문장 자신과 바로 옆 문장의 재진술로 확인되면 된다(근거 깊이 1문장).
- 기본 난이도라도 **직역=정답은 실패다.** 직역에 필자의 판단·평가가 한 겹 더해져야 정답이 성립한다.
- 압축·대조·비유 중 무엇이든 하나는 걸려 있어야 한다. 아무 장치도 없는 평서 사실문은 표적이 아니다.`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도)
- 밑줄은 **논지가 꺾이거나 수렴하는 자리**에서 고른다. 앞뒤 두 문장의 논리 방향(인과 또는 대조)을 이어야 비로소 함축이 결정되게 하라(근거 깊이 2문장).
- 밑줄 문장 하나만 읽고 풀리면 미달이다. 밑줄을 가린 채 앞뒤 문장만 읽어도 정답이 보이면 그것도 미달이다.
- 대조 표지(not merely A but B / rather than / instead of / while·although 뒤의 평가) 뒤에 붙은 압축 표현이 이 난이도의 최적 표적이다.`,
  KILLER: `## 표적 설계 — 여기서 문항의 격이 갈린다
- 세 갈래 중 하나를 고른다(있으면 (3)을 최우선):
  (1) 글의 핵심·주제를 다른 말로 압축한 짧은 구/절 — 주제문을 그대로가 아니라 **환언한** 자리.
  (2) 그 핵심과 **정반대 방향**을 표현한 짧은 구/절 — 필자가 비판·부정·대조하는 표현.
  (3) **비유·은유·압축 이미지** — 지문에 은유가 있으면 무조건 그것이 1순위다.
- 정답 근거는 **서로 다른 문장 2개 이상에 흩어져** 있어야 한다. 종합해야만 풀리는 자리를 골라라.
- 🚫 바로 다음(또는 바로 앞) 문장이 밑줄을 거의 그대로 풀어 주는 자리는 금지 — "that is / in other words / this means" 로 이어지는 자리가 대표적이다. 그런 자리는 함축이 아니라 독해 확인이 된다.
- 🚫 **문자 그대로의 사실 서술 금지**(실측 최다 결함): "played a comparable role", "exceeded all others" 처럼 사실을 직접 진술하는 구는 표면과 이면이 같아 함축이 성립하지 않는다.`,
};

/**
 * 오답 기제 분류학 — 정본 빈칸의 4종(방향반대·도입부함정·범위확대·근거없음)을
 * 이 유형의 판단축(표면 ↔ 이면)으로 번역한 것이다.
 * 빈칸의 '도입부함정'(시야가 논지 전환 이전에 갇힘)에 대응하는 이 유형의 자리가
 * 바로 **표면 직역**(시야가 밑줄의 글자에 갇힘)이라, 그것을 1번으로 승격했다.
 */
function impliedDecoySection(wrongCount: number): string {
  const head = `## 오답 ${wrongCount}개 — 기제를 서로 다르게 (같은 기제 2개 금지)`;
  const taxonomy = [
    "1. **표면직역**(이 유형의 최매력 오답): 밑줄을 글자 그대로만 읽은 뜻. 직역에서 한 발도 나가지 않았다는 것이 유일한 결함이라 훑어보면 가장 안전해 보인다.",
    "2. **방향반대**: 밑줄이 지고 있는 필자의 평가·인과 방향을 뒤집은 뜻. 앞부분에 지문 핵심어를 그대로 실어 정답처럼 보이게 하고 뒷부분에서 논지를 뒤집어라.",
    "3. **범위확대**: 지문의 소재를 쓰되 지문이 말하지 않은 범위·처방·전면 일반화로 확장한 뜻.",
    "4. **근거없음(통념형)**: 상식적으로 그럴듯하지만 이 지문에 근거가 없는 서술.",
    "5. **부분해석**: 밑줄 안의 한 요소만 반영하고 나머지 요소를 버린 뜻 — 절반만 맞아서 끝까지 남는다.",
    "6. **인과역전**: 지문이 말한 원인과 결과를 맞바꾼 뜻.",
  ].join("\n");
  const pick =
    wrongCount >= 2
      ? `- 위 6종 중 **서로 다른 ${wrongCount}종**을 골라 하나씩 배정하라. **1번(표면직역)과 2번(방향반대)은 반드시 포함**한다 — 이 둘이 문항의 변별을 만든다.`
      : "- 위 6종 중 **1번(표면직역)** 을 쓴다 — 오답이 하나뿐일 때 가장 변별력이 높다.";
  return `${head}
${taxonomy}
${pick}
- 소재 구속: 오답 전부 "지문에 실재하는 소재·어휘"를 재료로 만들어라. 지문에 없는 분야 개념을 들여오면 학생이 지문을 안 읽고도 소거한다 — 그건 함정이 아니라 장식이다.
- 층위 일치: 모든 선지를 같은 문법 형식·같은 추상도로 맞춰라. 정답만 유난히 종합적이거나 유난히 길면 형태로 들킨다.`;
}

function impliedExplanationBlock(
  mode: MdExplanationMode,
  labels: readonly string[],
  answerCount: number,
  wrongCount: number,
): string {
  // 라벨 앵커링 회피(정본 선례): 예시는 홀수 인덱스부터 뽑아 정답 위치 편중을 막는다.
  const answerSpec =
    answerCount >= 2
      ? `<${labels[0]}~${labels[labels.length - 1]} 중 ${answerCount}개를 ", " 로 병기 — 예: ${labels[1]}, ${labels[3]}>`
      : `<${labels[0]}~${labels[labels.length - 1]} 하나>`;
  const head = `정답: ${answerSpec}
해설: <딱 2문장 — 어느 근거 문장을 어떻게 이어 표면 의미에서 함축으로 넘어가는지. 합니다체`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}>
오답:
${labels[0]} <기제이름 — 왜 매력적이고 왜 탈락인지 1문장> (정답 번호는 제외하고 오답 ${wrongCount}개만)
...`;
}

/**
 * 함축 의미 추론 md 프롬프트.
 * 출력 계약(parser-implied.ts 와 1:1): `밑줄:` 한 줄 + 원문자 선지 N줄 +
 * `정답:` + `해설:` + `오답:`. **지문을 재출력시키지 않는다** — 이 유형은 지문을
 * 변형하지 않으므로 지문 재구성 계약 자체가 없고, 출력 토큰도 그만큼 짧다.
 */
export function buildMdImpliedPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: {
    optionCount?: number;
    answerCount?: number;
    optionLanguage?: "ko" | "en";
  },
): string {
  const optionCount = clampImpliedMdOptionCount(
    opts?.optionCount ?? IMPLIED_MD_OPTION_COUNT_DEFAULT,
  );
  const answerCount = clampImpliedMdAnswerCount(
    opts?.answerCount ?? IMPLIED_MD_ANSWER_COUNT_DEFAULT,
    optionCount,
  );
  const wrongCount = optionCount - answerCount;
  const labels = IMPLIED_MD_CIRCLED.slice(0, optionCount);
  const optionLanguage = opts?.optionLanguage === "ko" ? "ko" : "en";

  const headline =
    difficulty === "KILLER"
      ? `아래 지문에서 짧은 표현 한 곳에 밑줄을 긋고 "그 표현이 함축하는 의미"를 고르게 하는 KILLER 문항 1개를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문에서 짧은 표현 한 곳에 밑줄을 긋고 "그 표현이 함축하는 의미"를 고르게 하는 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock = difficulty === "BASIC" ? "" : `${IMPLIED_FEWSHOT}\n\n`;

  const optionLanguageRule =
    optionLanguage === "en"
      ? `- 선지 ${optionCount}개는 **전부 영어**로 쓴다. 한글이 한 글자라도 섞이면 실격이다. 각 선지는 세 단어 이상의 자연스러운 영어 구·절·짧은 문장이어야 한다(한두 단어 라벨 금지).`
      : `- 선지 ${optionCount}개는 **전부 한국어 완결 진술문**으로 쓴다(교사 설정). 영어 표현은 지문에서 인용할 때만 허용한다.`;

  const optionScaffold = labels.map((l) => `${l} <선지>`).join("\n");

  const multiAnswerRule =
    answerCount >= 2
      ? `\n- 이 문항은 **정답이 ${answerCount}개**다. ${answerCount}개 전부가 밑줄의 함축으로 성립해야 하고, 서로 같은 말을 다르게 쓴 중복이어서는 안 된다(서로 다른 측면을 짚어라).`
      : "";

  return `너는 대한민국 수능 영어영역 대의파악 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 이 유형의 정체 — 어휘 문제가 아니다
- 함축 의미 추론은 **대의파악 계열**이다. 주제·제목·요약과 같은 중심 내용 판단을 요구하되, 그 중심 생각이 지문 안에서 은유·압축·환언으로 나타난 자리에 밑줄을 긋는 유형이다.
- 따라서 밑줄의 함축을 "이 글의 요지는 ___다"의 빈칸에 넣었을 때 글 전체의 요지로 자연스럽게 환원되어야 한다. 환원되지 않으면 그건 지엽 세부이므로 표적을 다시 골라라.
- 핵심은 **"표면의 말"과 "글의 중심 의미" 사이의 거리**다. 거리가 0이면 단순 독해 확인 문제이고, 중심 의미와 무관하면 나쁜 함축 문제다.

## 밑줄 표적 규칙 (형식 하드 계약 — 위반은 기계 반려)
- 밑줄은 **지문에 실재하는 표현을 한 글자도 바꾸지 않고 복사**한다. 굴절형·대소문자·구두점까지 원문 그대로.
- 밑줄은 **${IMPLIED_MD_TARGET_MAX_WORDS}단어 이내**(최대 ${IMPLIED_MD_TARGET_MAX_CHARS}자)의 압축 표현이다. 긴 절·문장 전체·주제문 통째로 밑줄 금지 — 길어지면 함축의 "압축"이 사라져 주제 문항이 된다. 의미 단위가 길면 그 안의 핵심 명사구·동사구·대조구·비유구만 잘라 써라.
- 단일 단어·대명사·기능어·사전식 숙어는 금지다(그건 CONTEXT_MEANING·REFERENCE 의 자리다). 내용어 2개 이상.
- 전치사·접속사(of·to·in·that·while 류)로 **끝나는** 절단 표현 금지 — 표현이 잘려 보인다.
- 물음표로 끝나는 수사적 질문, 자문자답 문장 금지. 자문자답 구조라면 질문이 아니라 답변 쪽의 압축 표현에 밑줄을 그어라.
- 지문에 **두 번 이상 등장하는 표현은 표적으로 쓰지 마라** — 밑줄 자리가 유일하게 확정되지 않는다.

${IMPLIED_TARGET_BY_DIFFICULTY[difficulty]}

${impliedDecoySection(wrongCount)}

## 선지 작성
${optionLanguageRule}${multiAnswerRule}
- 정답은 밑줄의 **직역이 아니라** 지문 근거를 종합한 함축의 재진술이다. 밑줄의 표면 어휘를 그대로 재사용하지 마라.
- 모든 선지의 길이를 서로 ±3단어 안에 맞춰라. 정답만 길거나 종합적이면 내용을 안 읽고도 찍힌다.
- 절대 표현(completely·entirely·always·never·only·solely·must 류)을 오답에만 몰지 마라 — 지문이 그 정도를 명시하지 않았다면 그 선지는 훑어보기만 해도 지워진다.
- 해설·오답 해설에서 선지를 "2번", "선지 3" 처럼 **평숫자로 지칭하지 마라**(선지 순서는 출제 후 재배열된다). 선지를 가리킬 때는 내용을 인용하거나 ${labels[0]}~${labels[labels.length - 1]} 원문자만 써라.

## 마감 — 위반하면 시험 요령으로 뚫린다
- 즉사 오답 금지: 오답 ${wrongCount}개 중 최소 ${Math.min(2, wrongCount)}개는 상위권 학생도 정답과 끝까지 저울질해야 한다.
- 선지끼리 같은 뜻을 다르게 쓴 중복 금지 — 두 선지가 같은 말이면 그 문항은 무효다.
- 정답은 정확히 ${answerCount}개다. "이것도 정답 아니냐"고 시비 걸릴 선지가 하나라도 있으면 그 선지를 다시 써라.

## 출력 전 자기검산 (사고 안에서 수행, 출력하지 마라)
- ⭐ **리트머스 검사**: 밑줄의 표면 의미(직역)와 정답의 함축 의미를 각각 한 문장으로 적어 보라. 두 문장이 사실상 같은 진술이면 표면-이면 간극이 0이므로 **그 밑줄은 탈락**이다 — 표적을 다시 골라라. 간극은 "직역만으로는 안 보이는 필자의 판단·인과·가치 평가"가 정답에 더해질 때만 성립한다.
- 밑줄 표현을 지문에서 찾아 **한 글자씩 대조**하라 — 한 글자라도 다르면 기계 검사가 반려한다. 지문에 몇 번 등장하는지도 세어라(1회여야 한다).
- 밑줄 단어 수를 세어라 — ${IMPLIED_MD_TARGET_MAX_WORDS}단어를 넘으면 반려된다.
- 각 오답이 왜 틀렸는지 지문 근거로 한 줄씩 답해보라 — 근거를 못 대는 오답은 재설계.
- 기제가 겹치는 오답이 없는지 확인하라.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄: <지문에서 밑줄 칠 표현 — 지문 축자 그대로, ${IMPLIED_MD_TARGET_MAX_WORDS}단어 이내, 개행 없이 한 줄. 따옴표·별표로 감싸지 마라.>
${optionScaffold}
${impliedExplanationBlock(mode, labels, answerCount, wrongCount)}

## 지문
${passage}`;
}

// ============================================================================
// 표적 후보 블록 — md 계약 전용 (레인 buildExtras 가 싣는다)
//
// fast 공용 블록 buildImpliedMeaningCandidateBlock 을 그대로 실으면 계약이 깨진다:
//  ① 그 블록은 md 형식에 없는 `surroundingText` 출력을 요구하고, 표적 입력 줄을
//     `밑줄:` 이 아니라 JSON 필드명 `underlinedExpression` 으로 4회 지칭한다.
//     base 의 "이 형식 그대로, 다른 말 붙이지 마라" 와 정면 충돌이고, 모델이
//     `underlinedExpression="..."` 줄을 내면 `밑줄:` 이 비어 반려 → 재생성 1회 →
//     실패·환불로 끝난다. (md 는 surroundingText 를 어댑터가 코드로 계산한다 —
//     파생 가능한 것에 칸을 만들지 않는다는 규범 §1-B 철칙 2 준수 지점이다.)
//  ② 후보 0건 분기가 "선지는 영어 패러프레이즈여야 한다"를 **무조건** 덧붙여
//     교사 설정 optionLanguage=ko 를 extras 가 뒤집는다. 선지 언어는 base 한 곳
//     에서만 말해야 한다(레인 주석이 선언한 자기모순 방지 지점).
//  ③ 후보 추출기가 `passage.indexOf` 만 보므로 지문에 2회 등장하는 표현을 추천할
//     수 있는데, 게이트는 그것을 "밑줄 자리가 모호"로 반려한다.
//
// 그래서 후보 **추출기**(findImpliedMeaningCandidates)만 재사용하고, 문구는 md
// 계약으로 번역해 소유 파일에서 관리한다. 1회 등장 필터도 여기서 건다.
// ============================================================================

/** 후보 목록에 실을 최대 개수 — 공용 블록과 같은 값. */
const IMPLIED_MD_CANDIDATE_LIMIT = 10;

const IMPLIED_MD_TARGET_RULES = [
  `- ⭐ 밑줄은 **${IMPLIED_MD_TARGET_MAX_WORDS}단어 이내**로 짧게 잡는다. 후보 문장이 길면 함축을 지고 있는 핵심 명사구·동사구·대조구·비유구만 잘라 써라. 문장 전체 밑줄 금지.`,
  "- ⭐ 표적은 셋 중 하나여야 한다(지문에 비유가 있으면 (3)이 무조건 1순위): (1) 지문의 핵심·주제를 압축한 구, (2) 그 핵심과 **정반대 방향**을 표현한 구(필자의 비판·부정·대조), (3) 비유·은유 표현.",
  "- 이 유형은 TOPIC/TITLE/SUMMARY 계열이다 — 지문의 중심 주장을 비유적·압축적·결론적으로 재진술한 자리를 골라라. 예시·실험 속 지엽 세부는 피한다.",
  "- 단일 어휘·대명사·기능어·사전식 숙어에 밑줄 금지. 수사적 질문, 그리고 바로 다음 문장이 답을 그대로 풀어 주는 자리도 금지.",
  "- 오답은 지문에 실재하는 개념에 뿌리내린 near-miss 여야 한다. 정답은 밑줄 앞뒤 근거를 종합한 함축의 재진술이다.",
] as const;

/**
 * 이 지문에서 기계가 뽑은 밑줄 표적 후보 블록.
 * 문구는 전부 md 출력 계약(`밑줄:` 한 줄)으로 말하고, **선지 언어는 한 마디도
 * 하지 않는다** — 그건 base 프롬프트의 소관이다.
 */
export function buildMdImpliedCandidateBlock(
  passage: string,
  difficulty: MdDifficulty = "KILLER",
  opts?: { variantIndex?: number; diversityEnabled?: boolean },
): string {
  const killerLine =
    difficulty === "KILLER"
      ? "- KILLER 보정: 밑줄 앞뒤 단서 **2개 이상**을 이어야 답이 나오는 자리를 골라라."
      : "";

  // 지문에 1회만 등장하는 후보만 남긴다 — 2회 이상이면 밑줄 자리가 확정되지 않아
  // 게이트가 반려한다. 반려될 것을 추천하는 후보 블록은 모델을 함정으로 민다.
  const candidates = rotateByVariantIndex(
    findImpliedMeaningCandidates(passage).filter(
      (candidate) => countWordBoundaryMatches(passage, candidate.expression) === 1,
    ),
    opts?.variantIndex,
  ).slice(0, IMPLIED_MD_CANDIDATE_LIMIT);

  if (candidates.length === 0) {
    return [
      "## IMPLIED_MEANING target planning guardrail (md 계약)",
      "- 기계가 자동으로 뽑아낸 강한 후보가 없다. 그래도 좋은 문항은 만들 수 있으니 아래 기준으로 직접 골라라.",
      "- 지문에서 **그대로 복사한** 짧은 구·절을 골라 `밑줄:` 줄에 한 줄로 적어라. 지문에 **1회만** 등장하는 표현이어야 한다(2회 이상이면 기계 반려).",
      ...IMPLIED_MD_TARGET_RULES,
      killerLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "## IMPLIED_MEANING target candidates (md 계약 — 이 지문에서 기계가 뽑은 후보)",
    opts?.diversityEnabled
      ? "- ⭐ 다양성 지시: 이번 문항은 되도록 아래 후보 1번을 밑줄로 쓰라. 함축 출제에 부적합할 때만 다른 후보를 쓰고, 매번 같은 표현으로 수렴하지 마라."
      : "",
    "- 아래 후보 중 하나를 골라 **`밑줄:` 줄에 지문 축자 그대로** 적어라. 목록 밖에서 더 좋은 표현을 찾았다면 그것을 써도 된다(단, 지문에 1회만 등장해야 한다).",
    "- 후보는 전부 지문 1회 등장으로 걸러 두었다. 후보를 그대로 쓰면 자리 모호 반려가 나지 않는다.",
    ...IMPLIED_MD_TARGET_RULES,
    killerLine,
    ...candidates.map(
      (candidate, index) =>
        `${index + 1}. (문장 ${candidate.sentenceIndex + 1}) ${candidate.sentence}\n   → \`밑줄: ${candidate.expression}\``,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
