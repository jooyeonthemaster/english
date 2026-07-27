// ============================================================================
// 동의어(SYNONYM) md 프롬프트 — 정본(빈칸·어법) 7블록 골격 이식본.
// 견본: prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 이 유형은 **지문을 한 글자도 변형하지 않는다.** 모델이 내는 것은 표적 단어 한 줄과
// 선지·정답·해설·오답뿐이다. 그래서 형식이 전 유형 중 가장 가볍고, 공예의 승부처가
// 오롯이 "표적 단어 선정"과 "오답 {N-K}개 설계"에 놓인다.
//
// 공예 서사의 뿌리는 저장소가 이미 실전에서 검증한 두 지시다:
//  - question-generation-prompt-contract.ts:146 (SYNONYM uniqueness test) —
//    "모든 선지를 원문장에 소리 없이 대입하라. 의미·어조·연어·논지 구조를 동시에
//     지키는 선지가 **정확히 하나**여야 한다. 오답은 '덜 흔한 동의어'가 아니라
//     **단 하나의 문맥 요구조건에서만 실패하는** 근접 후보여야 한다."
//  - rubric.ts:174 (SYNONYM) — 표적은 의미 무게가 있는 단어, 오답은 같은 품사·
//    근접 의미이되 문맥·어조에서 어긋나야 하고, KILLER 는 초등 짝을 금지한다.
// 이 파일은 그 두 문장을 md 골격으로 펼친 것이다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 선지 라벨 축 — 최대 8지선다(generic optionCount 상한)까지 원문자. */
export const SYNONYM_MD_CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧",
] as const;

export const SYNONYM_MD_OPTION_COUNT_MIN = 4;
export const SYNONYM_MD_OPTION_COUNT_MAX = 8;
export const SYNONYM_MD_OPTION_COUNT_DEFAULT = 5;
export const SYNONYM_MD_ANSWER_COUNT_MIN = 1;
export const SYNONYM_MD_ANSWER_COUNT_DEFAULT = 1;

/**
 * 표적 상한 — 동의어 문항의 표적은 "단어"다(question-type-ui.ts:278 requiredFields
 * = targetWord). 숙어·구동사까지는 허용하되 3단어를 넘기면 그것은 함축·문맥의미
 * 유형의 자리다. 프롬프트·게이트가 **같은 숫자**를 공유해야 "프롬프트는 허용하는데
 * 서버가 반려" 라는 자기모순이 생기지 않는다.
 */
export const SYNONYM_MD_TARGET_MAX_WORDS = 3;
/** 선지 상한 — 동의어 선지는 단어 또는 짧은 구다(뜻풀이·설명문이 되면 유형 붕괴). */
export const SYNONYM_MD_OPTION_MAX_WORDS = 4;

export function clampSynonymMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return SYNONYM_MD_OPTION_COUNT_DEFAULT;
  return Math.min(
    SYNONYM_MD_OPTION_COUNT_MAX,
    Math.max(SYNONYM_MD_OPTION_COUNT_MIN, n),
  );
}

export function clampSynonymMdAnswerCount(
  value: unknown,
  optionCount: number = SYNONYM_MD_OPTION_COUNT_DEFAULT,
): number {
  const cap = Math.max(
    SYNONYM_MD_ANSWER_COUNT_MIN,
    clampSynonymMdOptionCount(optionCount) - 1,
  );
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return SYNONYM_MD_ANSWER_COUNT_DEFAULT;
  return Math.min(cap, Math.max(SYNONYM_MD_ANSWER_COUNT_MIN, n));
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 이 예시가 보여 주는 것은 단 하나: **대입 검사**다. 다섯 후보를 원문장에 하나씩
// 넣어 보면 목적어·인과·태도를 동시에 지키는 것이 정확히 하나뿐이다.
const SYNONYM_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 사내 이견을 전부 눌러 없애려던 관리자들이 결국 합의처럼 보이는 침묵을 길러 내고 만다는 글. 문장: "Managers who suppress every disagreement eventually cultivate a silence that looks like consensus."
- 표적 선정: cultivate. 일상 의미는 "경작하다"인데 이 문장에서는 "(분위기·태도를) 길러 내다"로 전이돼 있다. **문맥을 봐야 어느 뜻인지 결정되는 단어** — 이것이 표적의 자격이다.
- 정답: foster. 의도치 않게 무언가를 자라게 한다는 뜻이 이 문장의 인과와 목적어(silence)에 그대로 들어맞는다. 가장 희귀한 사전 동의어가 아니라 **그 자리에 가장 자연스러운 시험 정답**을 골랐다는 점이 중요하다.
- 오답 해부(각 오답은 딱 한 가지 문맥 요구조건에서만 실패한다):
  - till — **다의어 오축**: cultivate 의 "경작하다" 뜻의 정당한 사전 동의어다. 단어 카드만 보면 완벽하지만 silence 를 목적어로 받지 못한다.
  - tolerate — **논지 배반**: 문장에 넣으면 문법도 의미도 통하지만, 관리자가 침묵을 "허용"했다는 말이 되어 "만들어 냈다"는 필자의 인과가 사라진다.
  - fabricate — **강도 이동**: 같은 '만들다' 축이지만 의도적 날조라는 세기가 과해, 무의식적 결과라는 문맥과 어긋난다.
  - endure — **의미장 이웃**: silence 와 자주 붙어 다녀 연상으로 끌리지만 애초에 동의 관계가 아니다.
- 이 설계가 아름다운 이유: 다섯 후보를 원문장에 하나씩 대입하면 목적어·인과·태도를 **동시에** 지키는 것이 정확히 하나뿐이다. 단어 카드로만 푸는 학생은 till 에서 멈추고, 문장만 대충 읽은 학생은 tolerate 에서 멈춘다. 오답마다 "이 학생은 왜 이걸 고르는가"의 답이 한 줄로 나온다.`;

// 표적(대상 단어) 설계 — 난이도 3분기. 축은 "정답을 결정하는 근거의 깊이"다.
const SYNONYM_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도)
- 표적은 글의 내용을 지고 있는 **내용어**(동사·명사·형용사·부사) 중 그 **한 문장 안에서** 뜻이 확정되는 단어로 고른다(근거 깊이 1문장).
- 기본 난이도라도 true/good/big/old 류 초등 어휘는 금지다 — 지문을 안 읽어도 풀리는 단어장 문항이 된다. 교과서 수준이되 **문장 안에서 확인이 필요한** 단어를 골라라.
- 오답은 같은 품사·같은 의미장이되 그 문장에 넣으면 뜻이 분명히 달라지는 단어로 만든다. 이 난이도에서는 오답의 실패가 **한 번 대입해 보면 보이는** 정도여야 한다.`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도)
- 표적은 **앞뒤 문장의 논리 방향(인과 또는 대조)을 봐야 어느 뜻인지 결정되는 단어**로 고른다(근거 깊이 2문장).
- 표적 문장 하나만 읽고 정답이 확정되면 미달이다. 그 단어가 문단에서 맡은 역할(원인인가 결과인가, 긍정 평가인가 유보인가)이 판단에 개입해야 한다.
- 오답 중 **최소 하나는 그 단어의 정당한 사전 동의어**여야 한다. 다만 이 문장의 연어(공기 제약)나 강도에서 어긋나 탈락하게 만들어라 — 사전만으로는 지울 수 없어야 한다.`,
  KILLER: `## 표적 설계 — 여기서 문항의 격이 갈린다
- **다의어 또는 의미가 전이된 단어를 1순위로 고른다**: 일상 의미와 이 지문에서의 의미가 다른 단어(cultivate·address·charge·keep·run 류), 또는 비유적·전문적·평가적으로 쓰인 단어.
- 정답은 **그 자리에 가장 자연스러운 시험 정답**이어야 한다. 가장 희귀하거나 가장 고급스러운 사전 동의어를 정답으로 삼지 마라 — 그건 어휘 자랑이지 변별이 아니다.
- 정답의 근거는 **표적 문장 하나에 갇히지 않게** 하라. 목적어·주어의 성격, 앞 문장이 세운 인과, 필자의 태도 중 최소 두 가지가 정답을 확정하는 데 개입해야 한다.
- 오답 중 **최소 2개는 사전에 실제로 동의어로 실려 있는 단어**여야 한다. 그리고 각 오답은 **딱 하나의 문맥 요구조건**(목적어 연어·강도·태도 극성·논지 역할)에서만 실패해야 한다. 두 가지 이상에서 동시에 실패하면 훑어보기만 해도 지워진다.
- 🚫 금지: 초등 짝(big-large, happy-glad, fast-quick 류), 품사·형태가 어긋나 문법만으로 지워지는 후보, 지문에 없는 분야 전문어.`,
};

/**
 * 오답 기제 분류학 — 정본 빈칸의 4종(방향반대·도입부함정·범위확대·근거없음)을
 * 이 유형의 판단축(단어의 사전 의미 ↔ 이 문장에서 요구하는 의미)으로 번역한 것.
 * 빈칸의 '도입부함정'(시야가 논지 전환 이전에 갇힘)에 대응하는 이 유형의 자리가
 * **다의어 오축**(시야가 사전 1번 뜻에 갇힘)이라, 그것을 1번으로 승격했다.
 */
function synonymDecoySection(wrongCount: number): string {
  const head = `## 오답 ${wrongCount}개 — 기제를 서로 다르게 (같은 기제 2개 금지)`;
  const taxonomy = [
    "1. **다의어 오축**(이 유형의 최매력 오답): 표적 단어의 **다른 사전 의미**에 대한 정당한 동의어. 사전을 펴면 실제로 실려 있어 단어 지식만으로 푸는 학생이 그대로 걸린다. 이 문장의 의미축이 아니라는 것이 유일한 결함이다.",
    "2. **연어 위반**: 뜻은 근접하지만 이 문장의 목적어·주어와 함께 쓰이지 않는 단어. 문법은 성립하고 의미도 얼추 맞아 대입해 봐야만 어색함이 드러난다.",
    "3. **강도 이동**: 같은 의미축이되 세기가 과하거나 모자란 단어(우려↔공포, 제안↔명령). 방향은 맞아서 끝까지 남는다.",
    "4. **태도 극성**: 함축·어조가 뒤집힌 단어(중립 서술↔폄하, 칭찬↔비꼼). 필자의 태도를 읽어야만 걸러진다.",
    "5. **논지 역할 배반**: 문장 하나만 보면 자연스럽지만, 문단이 세운 인과·대조에서 표적이 맡은 역할을 바꿔 버리는 단어.",
    "6. **의미장 이웃**: 같은 화제에서 자주 붙어 다녀 연상으로 끌리지만 애초에 동의 관계가 아닌 단어.",
  ].join("\n");
  const pick =
    wrongCount >= 2
      ? `- 위 6종 중 **서로 다른 ${wrongCount}종**을 골라 하나씩 배정하라. **1번(다의어 오축)은 반드시 포함**한다 — 이 하나가 문항의 변별을 만든다.`
      : "- 위 6종 중 **1번(다의어 오축)** 을 쓴다 — 오답이 하나뿐일 때 가장 변별력이 높다.";
  return `${head}
${taxonomy}
${pick}
- 소재 구속: 오답은 전부 **이 지문의 화제 안에서** 자연스럽게 떠오르는 단어여야 한다. 지문과 무관한 분야의 단어를 들여오면 학생이 지문을 안 읽고도 소거한다 — 그건 함정이 아니라 장식이다.
- 층위 일치: 표적과 **품사·굴절 형태를 전부 맞춰라**. 표적이 3인칭 단수 동사면 오답도 3인칭 단수 동사, -ing 이면 -ing, -ly 면 -ly 다. 형태가 어긋나면 문법만으로 지워져 오답 하나가 통째로 죽는다.
- 난이도·길이 평행: 유독 어렵거나 유독 긴 후보 하나가 정답을 흘리면 안 된다. 다섯 후보를 나란히 놓았을 때 어느 것이 정답인지 형태로는 알 수 없어야 한다.`;
}

function synonymExplanationBlock(
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
해설: <딱 2문장 — 표적 단어가 이 문맥에서 갖는 의미가 무엇이고, 정답이 왜 그 의미를 그대로 보존하는지. 합니다체`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}>
오답:
${labels[0]} <기제이름 — 왜 매력적이고 어느 한 조건에서 어긋나는지 1문장> (정답 번호는 제외하고 오답 ${wrongCount}개만)
...`;
}

/**
 * 동의어 md 프롬프트.
 * 출력 계약(parser-synonym.ts 와 1:1): `대상:` 한 줄 + 원문자 선지 N줄 +
 * `정답:` + `해설:` + `오답:`.
 *
 * **지문을 재출력시키지 않는다** — 이 유형은 지문을 변형하지 않으므로 지문 재구성
 * 계약 자체가 없고, 출력 토큰도 그만큼 짧다.
 * **문맥 문장을 따로 받지 않는다** — `contextSentence` 는 표적 단어의 지문 내
 * 자리가 유일하게 확정되면 코드로 잘라 낼 수 있는 파생값이다. 모델에게 다시
 * 받으면 재진술 드리프트라는 실패 모드만 하나 늘어난다(규범 §1-B 철칙 1·2).
 */
export function buildMdSynonymPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { optionCount?: number; answerCount?: number },
): string {
  const optionCount = clampSynonymMdOptionCount(
    opts?.optionCount ?? SYNONYM_MD_OPTION_COUNT_DEFAULT,
  );
  const answerCount = clampSynonymMdAnswerCount(
    opts?.answerCount ?? SYNONYM_MD_ANSWER_COUNT_DEFAULT,
    optionCount,
  );
  const wrongCount = optionCount - answerCount;
  const labels = SYNONYM_MD_CIRCLED.slice(0, optionCount);

  const headline =
    difficulty === "KILLER"
      ? `아래 지문에서 단어 하나에 밑줄을 긋고 "그 단어와 문맥상 의미가 가장 가까운 것"을 고르게 하는 KILLER 문항 1개를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문에서 단어 하나에 밑줄을 긋고 "그 단어와 문맥상 의미가 가장 가까운 것"을 고르게 하는 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 문맥 판단 필요"})를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock = difficulty === "BASIC" ? "" : `${SYNONYM_FEWSHOT}\n\n`;

  const optionScaffold = labels.map((l) => `${l} <영어 단어 또는 짧은 구>`).join("\n");

  const multiAnswerRule =
    answerCount >= 2
      ? `\n- 이 문항은 **정답이 ${answerCount}개**다. ${answerCount}개 전부가 원문장에 대입했을 때 의미·어조·연어를 지켜야 하고, 서로 뜻이 겹치는 중복이어서는 안 된다(서로 다른 측면에서 표적의 의미를 만족시켜라).`
      : "";

  return `너는 대한민국 수능 영어 어휘 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 이 유형의 심장 — 대입 검사(uniqueness test)
- 이 문항은 "이 단어의 사전 동의어를 아는가"를 묻는 것이 아니다. **"이 문장이 요구하는 의미를 아는가"** 를 묻는다.
- 설계를 끝낸 뒤 반드시 하라: 선지 ${optionCount}개를 **원문장의 표적 자리에 하나씩 소리 없이 대입**하라. 의미·어조·연어·논지 구조를 **동시에** 지키는 선지가 정확히 ${answerCount}개여야 한다. ${answerCount + 1}개째가 통과하면 그 선지를 다시 써라.
- 좋은 오답은 "덜 흔한 동의어"가 아니다. **딱 하나의 문맥 요구조건에서만 실패하는** 근접 후보다. 두 조건에서 동시에 실패하면 즉사 오답이고, 아무 조건에서도 실패하지 않으면 복수 정답이다.

## 표적 단어 규칙 (형식 하드 계약 — 위반은 기계 반려)
- 표적은 **지문에 실재하는 단어를 한 글자도 바꾸지 않고 복사**한다. 굴절형·대소문자까지 원문 그대로(원형으로 되돌리지 마라).
- 표적은 **${SYNONYM_MD_TARGET_MAX_WORDS}단어 이내**다. 원칙은 한 단어이고, 구동사·숙어처럼 한 덩어리로만 뜻이 사는 표현일 때만 2~3단어를 허용한다.
- 관사·전치사·접속사·대명사·be동사 등 기능어는 실격이다. 고유명사·숫자·지문이 정의해 주는 외국어 인용어도 금지 — 그건 문맥 추론이 아니라 지문이 알려 주는 지식이다.
- 지문에 **두 번 이상 등장하는 단어는 표적으로 쓰지 마라** — 밑줄 자리가 유일하게 확정되지 않는다.
- 표적 자신을 선지에 넣지 마라. 표적과 철자가 같은 후보는 동의어가 아니라 정답 누출이다.

${SYNONYM_TARGET_BY_DIFFICULTY[difficulty]}

${synonymDecoySection(wrongCount)}

## 선지 작성
- 선지 ${optionCount}개는 **전부 영어 단어 또는 ${SYNONYM_MD_OPTION_MAX_WORDS}단어 이내의 짧은 구**로 쓴다. 한글 뜻풀이·괄호 설명·"word (meaning)" 형식·해설성 문구는 전부 금지다.${multiAnswerRule}
- ${optionCount}개 후보의 품사와 굴절 형태를 표적과 전부 일치시켜라 — 형태로 지워지는 후보가 하나라도 있으면 실질 선지 수가 줄어든다.
- 같은 어간의 파생형 두 개(care·careful 류)를 함께 쓰지 마라. 서로 독립된 후보가 아니다.
- 해설·오답 해설에서 선지를 "2번", "선지 3" 처럼 **평숫자로 지칭하지 마라**(선지 순서는 출제 후 재배열된다). 선지를 가리킬 때는 그 단어를 직접 쓰거나 ${labels[0]}~${labels[labels.length - 1]} 원문자만 써라.

## 마감 — 위반하면 시험 요령으로 뚫린다
- 즉사 오답 금지: 오답 ${wrongCount}개 중 최소 ${Math.min(2, wrongCount)}개는 상위권 학생도 정답과 끝까지 저울질해야 한다.
- 선지끼리 사실상 같은 뜻을 쓴 중복 금지 — 두 후보가 같은 말이면 그 문항은 무효다.
- 정답은 정확히 ${answerCount}개다. 시비 걸릴 여지가 있는 후보가 남아 있으면 그 후보를 다시 써라.

## 출력 전 자기검산 (사고 안에서 수행, 출력하지 마라)
- ⭐ **대입 검사**: ${optionCount}개 후보를 원문장에 하나씩 넣어 완성 문장을 만들어 보라. 의미·어조·연어·논지를 동시에 지키는 것이 ${answerCount}개인지 세어라. 아니면 재설계.
- 표적 단어를 지문에서 찾아 **한 글자씩 대조**하라 — 한 글자라도 다르면 기계 검사가 반려한다. 지문에 몇 번 등장하는지도 세어라(1회여야 한다).
- 표적이 기능어·고유명사가 아닌지, ${SYNONYM_MD_TARGET_MAX_WORDS}단어 이내인지 확인하라.
- 각 후보의 품사·굴절 형태가 표적과 같은지 하나씩 확인하라(-s·-ing·-ed·-ly·비교급·최상급).
- 각 오답이 **어느 한 조건**에서 실패하는지 한 줄씩 답해보라 — 못 대는 오답은 재설계.
- 기제가 겹치는 오답이 없는지 확인하라.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문·선지 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
대상: <지문에서 밑줄 칠 단어 — 지문 축자 그대로, ${SYNONYM_MD_TARGET_MAX_WORDS}단어 이내, 개행 없이 한 줄. 따옴표·별표로 감싸지 마라.>
${optionScaffold}
${synonymExplanationBlock(mode, labels, answerCount, wrongCount)}

## 지문
${passage}`;
}
