// ============================================================================
// 요지·주장(MAIN_IDEA) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 견본(EXEMPLAR): prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 이 유형은 **지문을 한 글자도 변형하지 않는다.** 그래서 다른 유형이 가진
// "지문 재구성 일치" 라는 최강 게이트가 없다 — 결정형으로 붙잡을 수 있는 지문
// 정합 축이 하나뿐이라, 형식에 `근거:` 줄(정답 논지가 가장 압축된 지문 문장의
// 축자 복사)을 둔다. 이 한 줄이 (1) 모델이 논지 문장을 실제로 특정하게 만드는
// 공예 장치이면서 (2) 0원 게이트가 지문과 대조할 수 있는 유일한 앵커다.
//
// 오답 기제 분류학은 정본 빈칸 프롬프트(prompts.ts:74-80)의 4종
// (방향반대·도입부함정·범위확대·근거없음)을 대의파악 축으로 번역한 것이다 —
// 빈칸이 "빈칸에 들어갈 말"을 겨루게 하듯, 요지는 "필자의 판단"을 겨루게 한다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 선지 라벨 축 — 학생 표면·저장 라벨은 어댑터가 "1"~"8" 로 파생한다. */
export const MAIN_IDEA_MD_LABELS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧",
] as const;

export const MAIN_IDEA_MD_OPTION_COUNT_MIN = 4;
export const MAIN_IDEA_MD_OPTION_COUNT_MAX = 8;
export const MAIN_IDEA_MD_OPTION_COUNT_DEFAULT = 5;
export const MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT = 1;

/** 발문축 — 지문 성격에 따라 요지형/주장형 발문이 갈린다(둘 다 수능 실물 관습). */
export type MainIdeaStemAxis = "요지" | "주장";
/** 정답 극성 — NEGATIVE 는 '적절하지 않은 것' 고르기(교사 설정). */
export type MainIdeaPolarity = "POSITIVE" | "NEGATIVE";
/** 선지 표시 언어 — MAIN_IDEA 는 보기 언어 토글 대상(stem-option scope). */
export type MainIdeaOptionLanguage = "ko" | "en";

export function clampMainIdeaMdOptionCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MAIN_IDEA_MD_OPTION_COUNT_DEFAULT;
  return Math.min(
    MAIN_IDEA_MD_OPTION_COUNT_MAX,
    Math.max(MAIN_IDEA_MD_OPTION_COUNT_MIN, n),
  );
}

/** 정답 개수는 1 ~ (선지 수 - 1) — 오답이 최소 1개는 남아야 문항이 성립한다. */
export function clampMainIdeaMdAnswerCount(
  value: unknown,
  optionCount: number = MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
): number {
  const max = Math.max(1, clampMainIdeaMdOptionCount(optionCount) - 1);
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT;
  return Math.min(max, Math.max(1, n));
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 정답 하나가 아니라 "오답 넷이 각각 왜 매력적인가"를 보여 주는 것이 핵심이다.
const MAIN_IDEA_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 추천 알고리즘이 이용자의 과거 선택을 근거로 콘텐츠를 좁혀 제시하는데, 이용자는 취향이 넓어진다고 느끼지만 실제 선택지는 줄어든다는 글. 전반부는 개인화의 편익을 서술하다가 however 이후 체감과 실제의 괴리로 전환된다.
- 논지 축: 요지는 전환 **이후**에 있다. 전반부(편익 서술)는 필자가 뒤집으려고 깔아 둔 발판이다.
- 근거 문장: 괴리를 단언하는 한 문장(전환 직후의 귀결문)을 지문 축자 그대로 뽑는다.
- 정답: "개인화된 추천은 취향이 넓어진다는 착각을 주지만 실제로는 선택의 폭을 좁힌다." — 체감을 말한 문장과 결과를 말한 문장을 **종합**해야 나온다. 어느 한 문장의 번역이 아니다.
- 오답 해부(기제 각 1개): ②방향반대 — "알고리즘은 이용자의 취향을 넓혀 준다"(핵심어는 그대로 쓰되 결론만 뒤집어, 훑어보면 가장 정답 같다). ③도입부함정 — "개인화는 탐색 비용을 줄여 준다"(전환 앞 서술을 요지로 승격, 전환을 못 읽은 학생이 고른다). ④범위확대 — "플랫폼의 추천을 제도로 규제해야 한다"(지문에 없는 당위·해결책). ⑤근거없음 — "이용자는 알고리즘의 판단을 신뢰하지 않는다"(그럴듯한 통념, 지문 근거 0).
- 이 설계가 아름다운 이유: 오답 넷이 전부 지문의 소재로 만들어져 지문을 안 읽고는 하나도 소거되지 않고, 방향반대 선지가 끝까지 정답과 경합한다.`;

const MAIN_IDEA_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 정답 진술 설계 (기본 난이도)
- 요지가 한 문장(주제문·결론문)에 명시된 자리를 골라라. 정답은 그 문장의 평이한 재진술이면 된다(근거 깊이 1문장).
- 오답은 명확히 구분되게 하되, 각 오답도 "왜 이걸 고르는 학생이 있는가"를 한 줄로 댈 수 있어야 한다.`,
  INTERMEDIATE: `## 정답 진술 설계 (중급 난이도)
- 요지가 한 문장에 다 들어 있지 않은 글을 겨냥하라 — 대조 전환(통념↔반박)이나 인과 귀결처럼 **서로 다른 두 문장을 이어야** 정답이 도출되게 하라(근거 깊이 2문장).
- 정답은 지문 한 문장의 번역이 아니라 두 문장의 종합이다. 한 문장만 읽고 고를 수 있으면 미달이다.
- 오답은 지문의 일부와는 맞아떨어지되 논지의 방향·범위에서 어긋나게 만들어라.`,
  KILLER: `## 정답 진술 설계 — KILLER 의 생명
- 논지가 예시·양보(although·while 류)·유보를 거쳐 **마지막에 수렴**하는 자리를 겨냥하라. 정답 근거는 서로 다른 문장 두셋에 흩어져 있어야 한다.
- 정답은 지문의 표면 어휘를 재사용하지 않는 **추상 재진술**이다(핵심 명사·동사 재사용 0개 목표). 지문 문장을 그대로 옮겨 번역한 선지는 KILLER 에서 실격이다.
- 상위권이 마지막까지 저울질할 오답이 최소 2개 있어야 한다. 그중 하나는 반드시 방향반대(핵심어는 그대로, 결론만 뒤집힌) 선지다.
- 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`,
};

// ⚠ 극성 반전판. NEGATIVE 에서 정답은 '요지로 **적절하지 않은**' 진술이므로 위 블록의
// "정답=추상 재진술 · 정답 근거를 지문 문장 두셋에 분산" 지시가 그대로 남으면
// "지문이 지지하지 않도록 설계한 정답의 근거를 지문에서 찾아라"는 자기모순이 된다.
// 극성 블록이 뒤에서 '역할을 뒤집는다'고 선언해도, 뒤집을 대상 자체를 여기서 바꿔
// 두는 편이 계약이 깨끗하다(설계 노력은 '타당 선지 N개' 쪽으로 옮긴다).
const MAIN_IDEA_TARGET_BY_DIFFICULTY_NEGATIVE: Record<MdDifficulty, string> = {
  BASIC: `## 타당 선지 설계 (기본 난이도)
- 요지가 한 문장(주제문·결론문)에 명시된 지문을 골라라. 타당 선지들은 그 문장과 주변 문장의 평이한 재진술이면 된다(근거 깊이 1문장).
- 정답(부적절) 선지는 그 명시된 논지와 **정면으로** 어긋나게 하라 — 학생이 지문 한 문장만 확인해도 어긋남을 확정할 수 있어야 한다.`,
  INTERMEDIATE: `## 타당 선지 설계 (중급 난이도)
- 타당 선지 각각을 **서로 다른 근거 문장**에 정박시켜라. 대조 전환(통념↔반박)·인과 귀결 등 논지 전개의 서로 다른 마디를 하나씩 맡게 하라(근거 깊이 2문장).
- 타당 선지들은 포괄 범위가 서로 달라도 좋지만 **전부 방어 가능**해야 한다. "덜 포괄적"이라는 이유로 탈락시킬 선지를 만들면 복수정답 시비가 난다.
- 정답(부적절) 선지는 지문의 소재를 쓰되 논지의 방향·근거에서 결정적으로 어긋나게 하라.`,
  KILLER: `## 타당 선지 설계 — KILLER 의 생명
- 논지가 예시·양보(although·while 류)·유보를 거쳐 마지막에 수렴하는 지문을 겨냥하라. 타당 선지들은 그 수렴 과정의 서로 다른 마디를 각각 축약한 **추상 재진술**이어야 한다(지문 문장의 축자 번역은 실격).
- 타당 선지 하나하나에 "지문의 어느 문장이 이걸 뒷받침하는가"의 답이 있어야 한다. 하나라도 흔들리면 정답이 둘이 되어 문항이 무효다.
- 정답(부적절) 선지는 훑어보면 타당해 보이되, 지문과 대조하면 **결정적으로** 어긋나야 한다. 어긋남의 축은 하나로 선명하게 잡아라(태도 반전 / 인과 반전 / 지문에 없는 당위).
- 학생이 어느 선지에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`,
};

// 오답 기제 분류학(닫힌 집합) — 정본 빈칸 4종을 대의파악 축으로 번역하고,
// 선지 6~8개 설정을 위해 예비 기제 3종을 덧붙였다. 같은 기제 2개 금지가 핵심.
const MAIN_IDEA_TRAP_TAXONOMY = [
  "1. 방향반대(최매력 오답): 지문의 핵심어구를 그대로 쓰되 필자의 태도·인과 방향만 뒤집는다. 훑어보면 가장 정답처럼 보여야 한다.",
  "2. 도입부함정: 필자가 반박하려고 끌어온 통념·기존 견해를 요지로 승격한 진술. 전환(however 류) 앞에서 멈춘 학생이 고른다.",
  "3. 범위확대: 지문이 말하지 않은 일반화·당위·해결책으로 넓힌 진술(\"따라서 제도적으로 ...해야 한다\" 류).",
  "4. 부분승격: 지문의 예시 하나·부수 조건을 글 전체의 요지로 끌어올린 진술.",
  "5. 근거없음(통념형): 상식적으로 그럴듯하지만 지문에 근거 문장이 없는 진술.",
  "6. 인과역전: 지문이 원인이라 한 것을 결과로, 결과라 한 것을 원인으로 뒤집은 진술.",
  "7. 조건삭제: 필자가 달아 둔 조건·유보를 지우고 무조건적 단정으로 바꾼 진술.",
];

function trapTaxonomyBlock(wrongCount: number): string {
  // 오답 수만큼만 싣는다 — 쓸 수 없는 기제를 나열하면 지시가 흐려진다.
  const lines = MAIN_IDEA_TRAP_TAXONOMY.slice(0, Math.max(4, Math.min(7, wrongCount + 1)));
  return `## 오답 ${wrongCount}개 — 기제를 하나씩 다르게 (같은 기제 2개 금지)
${lines.join("\n")}
- 소재 구속: 오답 ${wrongCount}개 전부 "지문에 실재하는 소재·개념"을 재료로 만들어라. 지문에 없는 분야 개념을 들여오면 학생이 지문을 안 읽고도 소거한다 — 그건 함정이 아니라 장식이다.
- 층위 일치: 선지 전부 "필자의 판단"층 진술이어야 한다. 하나만 사실 서술·소재 나열이면 층위로 표난다.`;
}

function negativePolarityBlock(answerCount: number, validCount: number): string {
  return `## ⚠️ 정답 극성 (교사 설정 — 위의 정답·오답 역할 지시를 이 절이 뒤집는다)
- 이 문항의 정답은 요지로 **적절하지 않은** 선지 ${answerCount}개다. 위에서 설명한 정답/오답의 역할이 통째로 반대가 된다.
- 위 '모범 설계 해부'의 '정답'은 요지로 타당한 진술을 가리킨다 — **이 문항에서 그런 진술은 정답이 아니라 나머지 ${validCount}개**다. 해부에서 가져올 것은 "오답 넷이 각각 왜 매력적인가"를 계산하는 설계 태도이지 역할 배치가 아니다.
- 정답(부적절) ${answerCount}개: 지문의 소재를 쓰되 요지로서 **명백히** 부적절해야 한다 — 필자의 태도·인과 방향을 뒤집었거나(방향반대), 지문에 근거 문장이 없는 주장이거나(근거없음), 지문이 말하지 않은 당위·해결책으로 넓힌 진술(범위확대) 중 하나를 쓰라. "덜 포괄적"·"조금 약함" 정도의 차이면 복수정답 시비가 나므로 실격이다.
- 나머지 ${validCount}개: 전부 요지로 **충분히 타당**해야 한다. 각각 서로 다른 근거 문장에 정박시켜, 어느 하나도 부적절한 것으로 오인될 여지가 없게 하라.
- ${validCount}개의 길이·추상도를 정답과 맞춰라 — 정답만 튀면 극성만 확인하고 풀린다.`;
}

/** 선지 예시 라벨 — ① 앵커링을 피해 가운데 라벨부터 뽑는다(정본 선례). */
function sampleAnswerLabels(optionCount: number, answerCount: number): string {
  const labels = MAIN_IDEA_MD_LABELS.slice(0, optionCount);
  const picked: string[] = [];
  for (let i = 1; i < labels.length && picked.length < answerCount; i += 2) {
    picked.push(labels[i]);
  }
  for (let i = 0; i < labels.length && picked.length < answerCount; i += 1) {
    if (!picked.includes(labels[i])) picked.push(labels[i]);
  }
  return picked.join(", ");
}

function answerLine(optionCount: number, answerCount: number): string {
  const first = MAIN_IDEA_MD_LABELS[0];
  const last = MAIN_IDEA_MD_LABELS[optionCount - 1];
  if (answerCount <= 1) return `정답: <${first}~${last} 하나>`;
  return `정답: <${first}~${last} 중 정확히 ${answerCount}개를 ", " 로 병기 — 예: ${sampleAnswerLabels(optionCount, answerCount)}>`;
}

function wrongBlock(
  mode: MdExplanationMode,
  wrongCount: number,
  polarity: MainIdeaPolarity,
): string {
  const head = `해설: <딱 2문장 — 근거 문장 연결과 정답 도출만. 합니다체`;
  if (mode === "answer-only") return `${head}. 오답 해설은 쓰지 마라>`;
  const item =
    polarity === "NEGATIVE"
      ? `① <이 선지가 왜 요지로 타당한지(=왜 정답이 아닌지) 지문 근거로 1문장>`
      : `① <기제이름 — 왜 매력적이고 왜 탈락인지 1문장>`;
  return `${head}>
오답:
${item} (정답 번호는 제외하고 ${wrongCount}개만)
...`;
}

/**
 * 요지·주장 md 프롬프트.
 * 출력 계약(parser-main-idea.ts 와 1:1): `발문형:` + `근거:` + 원문자 선지 N개 +
 * `정답:` + `해설:` + `오답:`. 지문은 변형하지 않으므로 지문 재출력 줄이 없다.
 */
export function buildMdMainIdeaPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: {
    optionCount?: number;
    answerCount?: number;
    polarity?: MainIdeaPolarity;
    optionLanguage?: MainIdeaOptionLanguage;
  },
): string {
  const optionCount = clampMainIdeaMdOptionCount(
    opts?.optionCount ?? MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  );
  const answerCount = clampMainIdeaMdAnswerCount(
    opts?.answerCount ?? MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
    optionCount,
  );
  const polarity: MainIdeaPolarity = opts?.polarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const optionLanguage: MainIdeaOptionLanguage = opts?.optionLanguage === "en" ? "en" : "ko";
  const wrongCount = optionCount - answerCount;
  const labels = MAIN_IDEA_MD_LABELS.slice(0, optionCount);
  const langLabel = optionLanguage === "en" ? "영어" : "한국어";

  const goal =
    polarity === "NEGATIVE"
      ? `"글의 요지로 적절하지 않은 것"을 고르게 하는`
      : `"글의 요지(필자의 주장)"를 고르게 하는`;
  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 ${goal} KILLER 문항 1개를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다.`
      : `아래 지문으로 ${goal} 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 선지 ${optionCount}개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const negative = polarity === "NEGATIVE";
  const fewshotBlock = difficulty === "BASIC" ? "" : `${MAIN_IDEA_FEWSHOT}\n\n`;
  const targetBlock = negative
    ? MAIN_IDEA_TARGET_BY_DIFFICULTY_NEGATIVE[difficulty]
    : MAIN_IDEA_TARGET_BY_DIFFICULTY[difficulty];
  const trapBlock = negative
    ? negativePolarityBlock(answerCount, wrongCount)
    : trapTaxonomyBlock(wrongCount);
  const optionScaffold = labels
    .map((l, i) => (i === 0 ? `${l} <선지 — ${langLabel} 진술문, 개행 없이 한 줄>` : `${l} <선지>`))
    .join("\n");

  // ⚠ 극성 반전의 사각지대: 극성 블록 **뒤에** 오는 마감·자기검산·출력형식이 계속
  // POSITIVE 역할("오답 4개를 저울질하게 하라", "지문의 어느 문장이 이걸 부정하는가",
  // "정답의 논지가 압축된 지문 문장")을 지시하면, 극성 블록의 반(反)복수정답 요구와
  // 정면 충돌한다. NEGATIVE 에서 '오답'은 타당한 요지 진술들이므로 그 지시는 곧
  // "지문이 지지하는 진술을 부적절해 보이게 만들라"가 되고, 그렇게 나온 복수정답
  // 문항은 게이트 #1~#11 이 전부 형상 검사라 클린 통과해 그대로 저장된다.
  // → 계약의 마지막 줄까지 극성을 일관되게 유지한다.
  const closingRoleLine = negative
    ? `- 즉사 정답 금지: 정답(부적절) ${answerCount}개가 절대 표현·엉뚱한 소재로 한눈에 튀면 안 된다. 지문과 대조해야 어긋남이 드러나게 하라.
- 타당 선지 ${wrongCount}개는 전부 지문 근거로 방어 가능해야 한다 — 하나라도 흔들리면 정답이 둘이 되어 문항이 무효다.`
    : `- 즉사 오답 금지: 오답 ${wrongCount}개 중 최소 2개는 상위권도 끝까지 저울질해야 한다.`;
  const selfCheckLines = negative
    ? `- 정답(부적절) 선지를 지문 전체와 대조해, 그 진술이 글의 결론으로 도출될 여지가 **전혀** 없는지 확인하라.
- 나머지 ${wrongCount}개 각각에 대해 "지문의 어느 문장이 이걸 뒷받침하는가"를 한 줄씩 답해보라 — 못 대는 선지는 재설계(그게 곧 두 번째 정답이다).
- 정답(부적절) 선지 각각에 대해 "지문의 어느 문장이 이걸 부정하는가"를 한 줄로 답하라 — 못 대면 재설계.
- 타당 선지끼리 같은 근거 문장을 중복해서 쓰지 않았는지 확인하라.`
    : `- 정답 선지를 가린 채 지문을 읽었을 때, 그 진술이 글 전체의 결론으로 자연스럽게 도출되는지 확인하라.
- 오답 ${wrongCount}개 각각에 대해 "왜 매력적인가"와 "지문의 어느 문장이 이걸 부정하는가"를 한 줄씩 답해보라 — 못 대는 오답은 재설계.
- 기제가 겹치는 오답이 없는지, 두 선지가 동시에 정답이 될 여지가 없는지 확인하라.`;

  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 논지 축 확정 — 여기서 문항의 격이 갈린다
- 요지는 "이 글이 무엇에 대한 글인가"(주제·소재)가 아니라 "그 소재에 대해 필자가 내린 판단·권고"다. 소재만 옮긴 진술은 요지가 아니라 주제이며, 그건 다른 유형의 문항이다.
- 지문의 논지 전개를 먼저 읽어라: 통념 제시 → 반박 → 근거 → 귀결. **however·but·yet·rather·in fact 같은 전환 이후**가 요지의 자리다. 전환이 없으면 마지막 한두 문장의 귀결이 요지다.
- 첫 문장은 대개 소재 도입이지 요지가 아니다. 첫 문장만 옮긴 진술을 요지로 삼지 마라.
- \`근거:\` 줄에는 그 논지가 가장 압축된 **지문 문장 하나**를 한 글자도 바꾸지 말고 옮겨라. 이 줄은 기계가 지문과 축자 대조하는 유일한 앵커다 — 지문에 없는 문장을 쓰면 문항 전체가 반려된다.

${targetBlock}

${trapBlock}

## 마감 — 위반하면 시험 요령으로 뚫린다
- 선지 ${optionCount}개는 전부 ${langLabel} 진술문이다. 길이·추상도·문체를 서로 맞춰라 — 유독 길거나 유독 종합적인 선지 하나가 정답을 흘리면 안 된다.
${closingRoleLine}
- 절대 표현(반드시·결코·전혀·항상)을 일부 선지에만 몰지 마라.
- 두 선지가 같은 말을 다르게 쓴 것이면 안 된다 — 서로 배타적인 진술 ${optionCount}개여야 한다(복수정답 시비 = 문항 무효).
- 지문 문장을 그대로 옮겨 적은 선지 금지. 선지는 필자의 판단을 압축한 완전한 진술문이어야 하고, 제목·주제형 명사구("...의 중요성", "...에 대한 고찰")로 쓰면 실격이다.
- 선지는 한 줄에 하나씩, **개행 없이** 쓴다. 선지 본문 안에서 줄을 바꾸면 다음 줄은 버려지거나 다른 선지의 시작으로 읽혀 잘린 선지가 출제된다.
- 선지 줄에는 선지 문장만 쓴다. 정답 표시·기호(\`(정답)\`·\`[정답]\`·\`← 정답\`·✅)를 어느 위치에도 달지 마라 — 정답은 \`정답:\` 줄에서만 밝힌다(달면 시험지에 정답이 인쇄된다).
- 해설·오답 해설에서 선지를 번호(①·1번·(3))로 지칭하지 마라 — 선지 순서는 저장 단계에서 재배열된다. 지칭이 필요하면 선지 내용을 인용하라.

## 출력 전 자기검산 (사고 안에서 수행)
- \`근거:\` 줄이 지문에 한 글자도 다르지 않게 실재하는 문장인지 원문과 대조하라.
${selfCheckLines}
- 정답이 ${answerCount}개인지 세어라. 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
헤더는 굵게·헤딩(\`**정답:**\`·\`### 정답\`)으로 꾸미지 말고 아래 그대로 쓴다.
발문형: <요지 또는 주장 중 한 단어 — 필자가 당위·권고를 직접 밀면 주장, 현상·원리의 종합이면 요지>
근거: <글의 요지가 가장 압축된 지문 문장 하나 — 지문 축자, 개행 없이 한 줄>
${optionScaffold}
${answerLine(optionCount, answerCount)}
${wrongBlock(mode, wrongCount, polarity)}

## 지문
${passage}`;
}
