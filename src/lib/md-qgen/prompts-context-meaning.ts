// ============================================================================
// 문맥 속 의미(CONTEXT_MEANING) md 프롬프트 — 정본(빈칸·어법) 7블록 골격 이식본.
// 견본: prompts-antonym.ts · prompts-implied.ts / 계약: docs/md-qgen-type-expansion-spec.md
//
// 이 유형은 **지문을 한 글자도 변형하지 않는다.** 모델이 내는 것은 밑줄 표적 한 줄과
// 선지·정답·해설·오답뿐이다. 그래서 형식이 전 유형 중 가장 가볍고(칸 하나 = 실패 모드
// 하나 — 규범 §1-B 철칙 2), 공예의 승부처가 오롯이 "밑줄 자리 선정"과 "오답 설계"에 놓인다.
//
// 공예 서사는 question-prompts-vocab.ts:8-36(CONTEXT_MEANING) 의 실전 검증된 지시를
// md 골격으로 옮긴 것이다 — 다의어 표적 강제, 외국어·고유명사·언급(mention) 금지,
// 오답 2종 분류(폴리세미 함정 / 문맥 유혹 오독), 근접 의미장 2개 하한이 모두 실측
// 결함(오답 즉시 소거 / 라틴어 coloratus 밑줄로 유형 자체 붕괴)에 대응해 다듬어져 있다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 선지 라벨 축 — 최대 8지선다(generic optionCount 상한)까지 원문자. */
export const CONTEXT_MEANING_MD_CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧",
] as const;

export const CONTEXT_MEANING_MD_OPTION_COUNT_MIN = 4;
export const CONTEXT_MEANING_MD_OPTION_COUNT_MAX = 8;
export const CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT = 5;
export const CONTEXT_MEANING_MD_ANSWER_COUNT_MIN = 1;
export const CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT = 1;

/**
 * 밑줄 표적 상한 — 이 유형의 표적은 **단어 또는 짧은 구**다(긴 절은 IMPLIED_MEANING
 * 의 자리). 프롬프트·게이트가 한 숫자를 공유해야 "프롬프트는 허용하는데 서버가
 * 반려" 라는 자기모순이 생기지 않는다.
 */
export const CONTEXT_MEANING_MD_TARGET_MAX_WORDS = 5;
export const CONTEXT_MEANING_MD_TARGET_MAX_CHARS = 60;

/** 선지 상한 — 선지는 뜻풀이 "구"다. 완결 문장으로 늘어지면 유형이 무너진다. */
export const CONTEXT_MEANING_MD_OPTION_MAX_WORDS = 6;
export const CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS = 30;

export function clampContextMeaningMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT;
  return Math.min(
    CONTEXT_MEANING_MD_OPTION_COUNT_MAX,
    Math.max(CONTEXT_MEANING_MD_OPTION_COUNT_MIN, n),
  );
}

export function clampContextMeaningMdAnswerCount(
  value: unknown,
  optionCount: number = CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT,
): number {
  const cap = Math.max(
    CONTEXT_MEANING_MD_ANSWER_COUNT_MIN,
    clampContextMeaningMdOptionCount(optionCount) - 1,
  );
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT;
  return Math.min(cap, Math.max(CONTEXT_MEANING_MD_ANSWER_COUNT_MIN, n));
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 이 예시가 보여주는 것은 하나다: **사전 대표 의미로 바꿔 읽으면 문장이 무너지는 자리**
// 를 골랐을 때에만 이 유형이 살아난다는 것.
const CONTEXT_MEANING_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 반대파를 몰아내고 권력을 굳힌 지도자를 다룬 글. 한 문장이 "the victory was cheap, bought with promises he never meant to keep" 로 닫힌다.
- 표적 선정: cheap. 사전 대표 의미인 '값이 싼'으로 바꿔 읽으면 문장이 성립하지 않는다 — 뒤따르는 "지키지도 않을 약속으로 샀다"를 읽어야 '치를 대가 없이 얻은, 그래서 값어치 없는'이라는 평가 의미가 확정된다. **밑줄만 보고 사전 뜻으로 바꾸면 오히려 틀린다는 것이 이 표적의 자격증이다.**
- 정답 설계: won without real sacrifice. 근거는 밑줄 문장 뒷부분 하나뿐이고, 그 하나를 읽었는지가 정답을 가른다.
- 오답 설계: ① low in price — 사전 대표 의미(최매력, 밑줄만 본 학생이 즉시 집는다). ② poorly made — 이 단어가 실제로 갖는 또 다른 뜻('조잡한'), 의미장이 인접해 끝까지 남는다. ③ obtained by sheer luck — 문맥이 부르는 오독('대가 없음'을 '운'으로 옮김). ④ offered at a discount — 가격 의미장 안의 근접 오독.
- 이 설계가 아름다운 이유: 다섯 선지 중 넷이 cheap 이 실제로 가질 수 있는 뜻이거나 이 문맥이 부르는 오독이다. 단어를 잘 아는 학생일수록 ①로 손이 먼저 나가고, 문장으로 되돌아온 학생만 정답에 닿는다. 어휘력이 아니라 독해가 변별한다.`;

// 표적(밑줄) 설계 — 난이도 3분기. 축은 **뜻을 확정하는 데 필요한 근거의 깊이**다
// (1문장 / 앞뒤 2문장 / 글 전체의 태도·논지).
const CONTEXT_MEANING_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도)
- 표적은 **한 문장 안에서 뜻이 확정되는 다의어**로 고른다(근거 깊이 1문장). 밑줄이 든 문장만 끝까지 읽으면 어느 뜻인지 결정되어야 한다.
- 기본 난이도라도 **사전 대표 의미 = 정답은 실패다.** 밑줄 단어를 가장 흔한 뜻으로 바꿔 읽었을 때 문장이 어색해지는 자리여야 한다.
- 지나치게 전문적인 저빈도 어휘는 피한다 — 이 난이도의 변별은 어휘력이 아니라 "문맥이 어느 뜻을 고르게 하는가"다.`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도)
- 표적은 **앞뒤 두 문장의 논리 방향(인과·대조)을 이어야 뜻이 결정되는 자리**로 고른다(근거 깊이 2문장).
- 밑줄이 든 문장 하나만 읽고도 뜻이 확정되면 미달이다. 앞 문장이 깔아 둔 상황이나 뒤 문장이 밝히는 결과가 있어야 뜻이 좁혀지게 하라.
- 대조 표지(not merely / rather than / instead of / yet · although 절) 뒤에서 의미가 뒤집히는 단어가 이 난이도의 최적 표적이다.`,
  KILLER: `## 표적 설계 — 여기서 문항의 격이 갈린다
- 다음 중 하나를 고른다(있으면 (3)을 최우선):
  (1) **다의어의 비주류 뜻**: 사전에 실려 있으나 이 단어를 배울 때 먼저 외우는 뜻이 아닌 것. run·address·charge·keep·hold 같은 쉬운 단어일수록 좋다.
  (2) **비유·전이 의미**: 구체 영역의 단어가 추상 영역으로 옮겨 쓰인 자리(경제 글의 hunger, 생태 글의 currency 류).
  (3) **태도·격식·연어로만 결정되는 의미**: 사전 뜻 목록 어디에도 그대로는 실려 있지 않고, 필자의 평가(칭찬·폄하)나 붙어 있는 짝(전치사·목적어)이 있어야 확정되는 뜻.
- 정답 근거는 **밑줄 문장 밖에도 걸쳐** 있어야 한다. 글 전체의 논지·태도를 확인해야 뜻이 좁혀지는 자리를 골라라.
- 🚫 **투명 직역 표적 금지**(실측 최다 결함): 밑줄만 보고 사전 대표 의미로 바꿔도 정답이 되는 단어(exceed→surpass 류)는 이 유형이 아니라 SYNONYM 이다.
- 🚫 지문이 인용·정의하는 **외국어 단어**(coloratus 류)와 고유명사는 표적이 될 수 없다 — 그 뜻은 지문이 직접 알려 주는 지식이지 문맥 추론이 아니다.`,
};

/**
 * 오답 기제 분류학 — 정본 빈칸의 4종(방향반대·도입부함정·범위확대·근거없음)을
 * 이 유형의 판단축(사전 뜻 ↔ 문맥이 고르는 뜻)으로 번역한 것이다.
 * 빈칸의 '도입부함정'(시야가 논지 전환 이전에 갇힘)에 대응하는 이 유형의 자리가
 * 바로 **사전 대표 의미**(시야가 단어 카드에 갇힘)이라, 그것을 첫 기제로 승격했다.
 */
function contextMeaningDecoySection(wrongCount: number): string {
  const head = `## 오답 ${wrongCount}개 — 기제를 서로 다르게 (같은 기제 2개 금지)`;
  // ⚠ 기제 이름에 숫자를 넣지 마라(대표뜻 · 폴리세미 …). 모델은 이 이름을 오답
  //   해설 첫머리에 그대로 쓰는데, 해설에 "1번"·"선지 3" 같은 평숫자 지칭이 섞이면
  //   shuffleQuestionOptionsForDiversity 의 UNMAPPABLE_MENTION 가드가 발동해
  //   **선지 셔플이 통째로 포기된다**(이 유형은 SHUFFLE_OPTION_TYPES 멤버다).
  const taxonomy = [
    "1. **대표뜻**(이 유형의 최매력 오답): 그 단어를 배울 때 가장 먼저 외우는 대표 의미. 밑줄만 보고 고른 학생이 전부 여기에 걸린다.",
    "2. **폴리세미**(다른 실제 뜻): 다른 문맥이라면 그 단어가 진짜로 가질 수 있는 또 하나의 사전 뜻. 사전을 펴면 실제로 실려 있어 끝까지 남는다.",
    "3. **문맥 유혹 오독**: 주변 문장의 소재·이미지·연상에 이끌려 고르게 되는 뜻. 지문은 읽었으나 단어 자리를 안 본 학생이 걸린다.",
    "4. **근접 의미장**: 정답과 같은 도메인에 있으나 정도·방향·함축이 어긋난 뜻. 재대입해야 어긋남이 드러난다.",
    "5. **연어 오독**: 밑줄 단어에 붙은 짝(전치사·목적어·관용구)을 다른 관용으로 읽은 뜻.",
  ].join("\n");
  const pick =
    wrongCount >= 2
      ? `- 위 다섯 기제 중 **서로 다른 ${wrongCount}종**을 골라 하나씩 배정하라. **대표뜻 기제는 반드시 포함**한다 — 이 하나가 이 유형의 변별을 만든다.`
      : "- 위 다섯 기제 중 **대표뜻**을 쓴다 — 오답이 하나뿐일 때 가장 변별력이 높다.";
  return `${head}
${taxonomy}
${pick}
- **근접 의미장 하한**: 오답 중 최소 ${Math.min(2, wrongCount)}개는 정답과 같은 의미장(근접 도메인)에 있어야 한다. 정답만 문맥 도메인에 있고 오답이 전부 동떨어진 뜻이면 도메인 매칭만으로 즉답된다 — 실측 최다 결함이다.
- **무작위 금지**: "이 뜻은 이 단어가 실제 가질 수 있는 뜻인가, 아니면 이 문맥이 부르는 오독인가"에 예라고 답하지 못하는 오답은 장식이지 함정이 아니다. 지우고 다시 써라.
- **문법 소거 금지**: 각 선지를 밑줄 자리에 대입했을 때 문법이 성립해야 한다(품사·수·시제 일치). 형태만으로 지워지는 오답은 오답이 아니다.`;
}

function contextMeaningExplanationBlock(
  mode: MdExplanationMode,
  labels: readonly string[],
  answerCount: number,
  wrongCount: number,
): string {
  // 라벨 앵커링 회피(정본 선례): 예시 라벨은 홀수 인덱스부터 뽑아 정답 위치 편중을 막는다.
  const answerSpec =
    answerCount >= 2
      ? `<${labels[0]}~${labels[labels.length - 1]} 중 ${answerCount}개를 ", " 로 병기 — 예: ${labels[1]}, ${labels[3]}>`
      : `<${labels[0]}~${labels[labels.length - 1]} 하나>`;
  const head = `정답: ${answerSpec}
해설: <딱 2문장 — 이 단어가 이 지문에서 어느 의미축으로 쓰였는지, 그 축을 확정해 주는 근거가 어느 문장인지. 합니다체`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}>
오답:
${labels[0]} <기제이름 — 왜 매력적이고 왜 탈락인지 1문장> (정답 번호는 제외하고 오답 ${wrongCount}개만)
...`;
}

/**
 * 문맥 속 의미 md 프롬프트.
 * 출력 계약(parser-context-meaning.ts 와 1:1): `밑줄:` 한 줄 + 원문자 선지 N줄 +
 * `정답:` + `해설:` + `오답:`. **지문을 재출력시키지 않는다** — 지문을 변형하지
 * 않는 유형이므로 지문 재구성 계약 자체가 없고, 출력 토큰도 그만큼 짧다.
 *
 * 형식 철칙 대조(규범 §1-B):
 *  ① 정답의 유일 진실원은 `정답:` 줄 하나다 — 선지 줄에 O/X 칸을 두지 않는다.
 *  ② 줄당 칸은 1개(라벨 + 값)뿐이다.
 *  ③ 파서는 줄 단위로 관대하게 읽고, 잘못된 자리는 게이트가 라벨로 지목한다.
 */
export function buildMdContextMeaningPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: {
    optionCount?: number;
    answerCount?: number;
    optionLanguage?: "ko" | "en";
  },
): string {
  const optionCount = clampContextMeaningMdOptionCount(
    opts?.optionCount ?? CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT,
  );
  const answerCount = clampContextMeaningMdAnswerCount(
    opts?.answerCount ?? CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT,
    optionCount,
  );
  const wrongCount = optionCount - answerCount;
  const labels = CONTEXT_MEANING_MD_CIRCLED.slice(0, optionCount);
  const optionLanguage = opts?.optionLanguage === "ko" ? "ko" : "en";

  const headline =
    difficulty === "KILLER"
      ? `아래 지문에서 다의어 한 곳에 밑줄을 긋고 "그 단어가 이 문맥에서 갖는 의미"를 고르게 하는 KILLER 문항 1개를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문에서 다의어 한 곳에 밑줄을 긋고 "그 단어가 이 문맥에서 갖는 의미"를 고르게 하는 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 문맥 판단 필요"})를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock =
    difficulty === "BASIC" ? "" : `${CONTEXT_MEANING_FEWSHOT}\n\n`;

  const optionLanguageRule =
    optionLanguage === "en"
      ? `- 선지 ${optionCount}개는 **전부 영어**로 쓴다. 한글이 한 글자라도 섞이면 실격이다. 각 선지는 뜻풀이 **구(句)**다 — ${CONTEXT_MEANING_MD_OPTION_MAX_WORDS}단어 이내의 단어·짧은 구로 쓰고, 완결 문장으로 늘어뜨리지 마라.`
      : `- 선지 ${optionCount}개는 **전부 한국어 뜻풀이**로 쓴다(교사 설정). ${CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS}자 이내의 짧은 뜻풀이 구로 쓰고, 영어 표현은 지문에서 인용할 때만 허용한다.`;

  const optionScaffold = labels.map((l) => `${l} <선지>`).join("\n");

  const multiAnswerRule =
    answerCount >= 2
      ? `\n- 이 문항은 **정답이 ${answerCount}개**다. ${answerCount}개 전부가 이 문맥의 의미로 성립해야 하고, 서로 같은 뜻을 말만 바꾼 중복이어서는 안 된다(서로 다른 측면을 짚어라).`
      : "";

  return `너는 대한민국 수능 영어영역 어휘 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 이 유형의 정체 — 어휘력 시험이 아니다
- 문맥 속 의미는 **다의어 판별** 유형이다. 변별은 단어의 난도가 아니라 "이 문맥이 어느 뜻을 고르게 하는가"에서 나온다. run·address·charge·keeping 처럼 쉬운 단어일수록 좋은 표적이다.
- 밑줄만 보고 사전 대표 의미로 바꿔도 정답이 되는 단어는 **이 유형의 표적이 아니다**(그건 SYNONYM 이다). 문맥을 확인해야만 뜻이 결정되는 단어를 골라라.
- 학생이 치러야 할 대가는 "문장으로 되돌아가 읽는 일"이다. 그 대가를 치르지 않고 풀리는 문항은 실패다.

## 밑줄 표적 규칙 (형식 하드 계약 — 위반은 기계 반려)
- 밑줄은 **지문에 실재하는 표현을 한 글자도 바꾸지 않고 복사**한다. 굴절형·대소문자·구두점까지 원문 그대로.
- 밑줄은 **한 단어**가 기본이고, 필요하면 ${CONTEXT_MEANING_MD_TARGET_MAX_WORDS}단어 이내(최대 ${CONTEXT_MEANING_MD_TARGET_MAX_CHARS}자)의 짧은 구(구동사·관용구)까지 허용한다. 절·문장 전체 밑줄은 금지 — 길어지면 IMPLIED_MEANING(함축 의미) 문항이 된다.
- 관사·전치사·접속사·대명사·be동사 **단독** 밑줄 금지(a·the·it·is 류). 내용어여야 한다.
- 밑줄은 반드시 영문자로 시작해서 영문자로 끝난다. 구두점·따옴표를 밑줄 안에 넣지 마라.
- 지문에 **두 번 이상 등장하는 표현은 표적으로 쓰지 마라** — 밑줄 자리가 유일하게 확정되지 않는다.
- 🚫 **영어 문장 속에서 영어 어휘로 쓰인 단어만** 표적이다. 지문이 따옴표로 인용하거나 "the word ~" 처럼 **언급(mention)** 하는 토큰, 지문이 소개하는 외국어 단어, 고유명사(문장 중간의 대문자 시작 단어)는 전부 실격이다.

${CONTEXT_MEANING_TARGET_BY_DIFFICULTY[difficulty]}

${contextMeaningDecoySection(wrongCount)}

## 선지 작성
${optionLanguageRule}${multiAnswerRule}
- 정답은 **이 문맥에서의 뜻**을 옮긴 것이다. 밑줄 단어 자체나 그 굴절형(charge → charging)을 선지에 그대로 쓰지 마라 — 동어반복이라 문항이 무너진다.
- 괄호 뜻풀이·대괄호 주석·한국어 병기를 선지에 넣지 마라. 서버가 괄호 안을 잘라 내므로 실제로 글자가 사라진다.
- 모든 선지의 길이·격식·구체성을 서로 맞춰라. 정답만 유일하게 길거나 유일하게 여러 단어면 내용을 안 읽고도 찍힌다.
- 해설·오답 해설에서 선지를 **평숫자로 지칭하지 마라** — 아라비아 숫자에 '번'을 붙이거나 '선지'·'보기' 뒤에 숫자를 적는 표기를 말한다. 선지 순서는 출제 후 재배열되므로 그런 표기가 하나라도 섞이면 재배열이 통째로 취소된다. 선지를 가리킬 때는 내용을 인용하거나 ${labels[0]}~${labels[labels.length - 1]} 원문자만 써라.

## 마감 — 위반하면 시험 요령으로 뚫린다
- 즉사 오답 금지: 오답 ${wrongCount}개 중 최소 ${Math.min(2, wrongCount)}개는 상위권 학생도 정답과 끝까지 저울질해야 한다.
- 선지끼리 같은 뜻을 다르게 쓴 중복 금지 — 두 선지가 같은 말이면 그 문항은 무효다.
- 정답은 정확히 ${answerCount}개다. ${answerCount + 1}개째로 시비 걸릴 여지가 있으면 그 선지를 다시 써라.

## 출력 전 자기검산 (사고 안에서 수행, 출력하지 마라)
- ⭐ **리트머스 검사**: 밑줄 단어를 **사전 대표 의미**으로 바꿔 그 문장을 다시 읽어 보라. 그래도 자연스럽게 읽히면 문맥이 뜻을 결정하지 못하는 자리이므로 **그 표적은 탈락**이다 — 다른 후보로 다시 골라라. 후보를 2~3개 세워 이 검사를 각각 돌리고, 마지막까지 남은 가장 문맥 의존적인 후보만 밑줄로 써라.
- 밑줄 표현을 지문에서 찾아 **한 글자씩 대조**하라 — 한 글자라도 다르면 기계 검사가 반려한다. 지문에 몇 번 등장하는지도 세어라(1회여야 한다).
- 밑줄이 따옴표 안이나 "the word ~" 뒤에 있지 않은지, 문장 중간의 대문자 시작 고유명사가 아닌지 확인하라.
- 각 오답에 대해 "이 뜻은 이 단어가 실제 가질 수 있는 뜻인가, 아니면 이 문맥이 부르는 오독인가"에 예라고 답해 보라 — 못 대는 오답은 재설계.
- 정답과 같은 의미장의 오답이 ${Math.min(2, wrongCount)}개 이상인지 세어 보라.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄: <지문에서 밑줄 칠 단어 — 지문 축자 그대로, ${CONTEXT_MEANING_MD_TARGET_MAX_WORDS}단어 이내, 개행 없이 한 줄. 따옴표·별표로 감싸지 마라.>
${optionScaffold}
${contextMeaningExplanationBlock(mode, labels, answerCount, wrongCount)}

## 지문
${passage}`;
}
