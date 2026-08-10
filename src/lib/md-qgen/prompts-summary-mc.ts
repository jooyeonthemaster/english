// ============================================================================
// 요약문 완성 객관식(SUMMARY_COMPLETE_MC) md 프롬프트 — 정본(빈칸·어법) 7블록
// 골격의 이식본. 견본: prompts-antonym.ts / 계약: docs/md-qgen-type-expansion-spec.md
//
// 공예 서사는 question-prompts-mc.ts:595-648(SUMMARY_COMPLETE_MC) 의 실전 검증된
// 지시를 md 골격으로 옮긴 것이다 — 반쪽 정답 함정(KILLER 8-1 절)·열 병렬·억지
// collocation 금지는 이미 실측 결함에 대응해 다듬어져 있다.
//
// ── 형식 설계의 핵심 결정 (규범 §1-B 철칙 1 적용) ──────────────────────────
// 이 유형은 "빈칸 정답"과 "정답 선지의 값"이 **같은 사실**이다. fast 스키마는
// blanks[].answer 와 options[정답].blankValues 를 둘 다 받고, 검증기가
// summary-mc-correct-pair-mismatch 로 그 둘의 불일치를 사후 적발한다 — 전형적인
// 중복 계약이다(반의어를 2연속 반려시킨 그 구조).
// md 레인은 `정답:` 줄 하나만 진실원으로 두고, 빈칸 정답은 그 줄이 가리키는
// 선지의 값에서 **파생**한다. 그 결과 정답 불일치라는 실패 모드 자체가 사라진다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 요약문 빈칸 라벨 축 — question-schemas-mc.ts:229 SUMMARY_COMPLETE_MC_BLANK_LABELS 와 동일. */
export const SUMMARY_MC_MD_LABEL_KEYS = "ABCD";

export const SUMMARY_MC_MD_BLANK_COUNT_MIN = 2;
export const SUMMARY_MC_MD_BLANK_COUNT_MAX = 4;
export const SUMMARY_MC_MD_BLANK_COUNT_DEFAULT = 2;

/** 조합 선지 개수 — 이 유형은 5지선다 고정(스키마 .length(5), 노브 없음). */
export const SUMMARY_MC_MD_OPTION_COUNT = 5;

/** 값 구분자 계약 리터럴 — 다중 빈칸(prompts.ts:198)과 동일 관습을 재사용한다. */
export const SUMMARY_MC_MD_VALUE_JOINER = " …… ";

export function clampSummaryMcMdBlankCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return SUMMARY_MC_MD_BLANK_COUNT_DEFAULT;
  return Math.min(
    SUMMARY_MC_MD_BLANK_COUNT_MAX,
    Math.max(SUMMARY_MC_MD_BLANK_COUNT_MIN, n),
  );
}

/** 빈칸 라벨 배열 — `["(A)","(B)"]` (파서·게이트·어댑터 공용 축). */
export function summaryMcMdLabels(blankCount: number): string[] {
  return SUMMARY_MC_MD_LABEL_KEYS.slice(0, clampSummaryMcMdBlankCount(blankCount))
    .split("")
    .map((k) => `(${k})`);
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
const SUMMARY_MC_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 놀이터에서 위험 요소를 공학적으로 전부 제거할수록 아이들이 위험을 스스로 가늠하는 법을 배우지 못해 오히려 더 다친다는 글.
- 요약문: "By engineering every hazard out of play spaces, adults leave children (A) in the very judgment that keeps them safe, so protection itself becomes a source of (B)." — 지문의 어느 문장도 그대로 옮기지 않았고, 인과 축(보호 → 역효과) 하나만 남겼다.
- 빈칸 선정: (A)는 역설이 걸리는 자리(아이가 무엇을 잃는가), (B)는 그 역설의 귀결(보호가 무엇으로 바뀌는가). 두 칸이 원인-결과로 묶여 있어 한쪽만 보고는 확정되지 않는다.
- 정답 조합: untrained …… vulnerability
- 미끼 조합: ① untrained …… independence — (A)를 정답 그대로 두고 (B)만 "그럴듯한 다른 귀결"로 바꿔, (A)를 맞힌 학생을 끝까지 붙잡는다. ② uninterested …… vulnerability — (B)를 정답 그대로 두고 (A)만 같은 의미장의 근접어로 바꾼다. ③ 두 칸 모두 지문 소재를 쓰되 인과 방향이 뒤집힌 조합. ④ 지문이 말하지 않은 범위로 확대된 조합.
- 이 설계가 아름다운 이유: 가장 강한 (B) 함정을 **정답 (A)에 붙였고**, 가장 강한 (A) 함정을 **정답 (B)에 붙였다**. 그래서 학생은 두 칸을 전부 검증해야만 답이 하나로 좁혀진다 — 한 칸만 아는 학생은 반드시 반쪽 정답에 걸린다.`;

// 요약문·정답 설계 절 — 난이도 3분기(프로덕션 난이도 루브릭 정합).
function summaryMcDesignSection(
  difficulty: MdDifficulty,
  labelsText: string,
): string {
  if (difficulty === "BASIC") {
    return `## 요약문·정답 설계 (기본 난이도)
- 요약문은 지문 요지의 직접적인 재진술이다. ${labelsText} 각각의 근거가 지문의 한 문장 안에서 확인되게 하라(빈칸별 근거 깊이 1문장).
- 정답 값은 지문 핵심어를 한 단계만 일반화한 수준이면 충분하다. 다만 지문 단어를 그대로 베껴 쓰지는 마라.
- 오답 조합은 명백히 구분되게 하되, 각각 "왜 이걸 고르는가"의 답은 있어야 한다.`;
  }
  if (difficulty === "INTERMEDIATE") {
    return `## 요약문·정답 설계 (중급 난이도)
- 요약문은 서로 다른 두 문장 이상을 인과 또는 대조로 이어야 값이 확정되는 자리에 빈칸을 둔다(빈칸별 근거 깊이 2문장).
- 한쪽 빈칸만 보고 고르면 반드시 틀리게 만들어라 — 반쪽 정답 함정이 형식상 존재하는 데 그치지 말고, 실제로 매력적이어야 한다.
- 정답 값은 원문 표현의 복사가 아니라 재진술이다. 오답은 지문 일부와 연결되지만 핵심 논리에서 어긋나게 하라.`;
  }
  return `## 요약문·정답 설계 — KILLER 의 생명
- 요약문은 지문 전체의 요지·인과·대조·결론을 한 문장으로 압축한 것이다. 원문 문장 복사는 실격 — 표면 어휘를 재사용하지 않은 상위 추상으로 다시 써라.
- 빈칸 ${labelsText} 는 글의 논지가 지나가는 급소들이다. 서로 논리적으로 묶여 있어야 한다(원인-결과, 문제-해결, 대조, 수단-목적, 변화-귀결). 세부 정보·주변 예시를 빈칸으로 만들면 그 자체로 실패다.
- 정답 값은 원문 표현의 반복이 아니라 상위 개념/추상화다. 각 칸마다 지문상 그럴듯한 오답 후보가 **최소 2개**는 있어야 한다 — 한 칸만 보고 후보가 2개 이하로 즉시 좁혀지면 킬러가 아니다.
- 가장 매력적인 오답 값을 **정답 값과 결합하라**: 가장 그럴듯한 (B) 함정은 정답 (A)와 짝지어야 하고, 가장 그럴듯한 (A) 함정은 정답 (B)와 짝지어야 한다. 강한 함정을 즉시 소거되는 값 뒤에 묻어 두면 문항이 죽는다.`;
}

// 오답 조합 기제 — 열(빈칸)과 행(조합)을 동시에 설계하게 하는 절.
function summaryMcTrapSection(blankCount: number, labelsText: string): string {
  const halfCorrectRule =
    blankCount === 2
      ? `- **반쪽 정답 2종은 필수다**: (A)만 정답이고 (B)가 틀린 조합 최소 1개, (B)만 정답이고 (A)가 틀린 조합 최소 1개. 이 둘은 서로 다른 번호여야 하고 정답 번호와도 달라야 한다.
- 반쪽 정답을 만들 때 맞는 쪽 값은 정답 값을 **한 글자도 바꾸지 말고 그대로** 복사하라. 미묘하게 다르게 쓰면 학생이 표기 차이만으로 소거한다.`
      : `- **한 칸만 틀린 조합(near-miss)이 최소 1개** 있어야 한다: ${labelsText} 중 하나만 오답이고 나머지는 정답 값을 그대로 복사한 조합. 그래야 학생이 모든 칸을 검증한다.
- 서로 다른 칸을 틀리게 한 near-miss 를 2개 이상 넣으면 더 좋다 — 어느 한 칸도 그냥 넘어갈 수 없게 된다.`;
  return `## 오답 조합 ${SUMMARY_MC_MD_OPTION_COUNT - 1}개 — 열과 행을 모두 설계하라
${halfCorrectRule}
- 나머지 오답은 서로 다른 기제로 만들어라: 세부 예시를 전체 요지처럼 과장 / 원인과 결과를 뒤바꿈 / 긍정·부정(증가·감소) 방향 반전 / 문법 슬롯은 맞는데 핵심 의미가 어긋남 / 범위가 지나치게 넓거나 좁음.
- 소재 구속: 오답 값은 전부 **지문에 실재하는 소재·논리**에서 길어 올려라. 지문에 없는 분야 개념을 수입하면 학생이 지문을 안 읽고 소거한다 — 그건 함정이 아니라 장식이다.
- 열 병렬: 같은 칸 자리의 값 ${SUMMARY_MC_MD_OPTION_COUNT}개는 품사·문법 슬롯이 전부 같아야 한다((A)가 형용사 자리면 다섯 다 형용사). 요약문에 꽂아 읽어 비문이 되는 값은 실격이다.
- 각 칸마다 서로 다른 값이 최소 2개는 있어야 한다. 한 칸의 값 다섯이 전부 같으면 그 빈칸은 묻지 않은 것과 같다.
- 같은 조합을 두 번 쓰지 마라. 정답과 모든 값이 같은 오답은 문항을 무효로 만든다.`;
}

function summaryMcExplanationBlock(
  mode: MdExplanationMode,
  wrongCount: number,
): string {
  const head = `정답: <①~⑤ 하나 — 이 줄이 정답의 유일한 진실원이다>
해설: <딱 2문장 — 각 빈칸의 근거 문장을 연결해 정답 조합을 도출. 합니다체`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}>
오답:
① <어느 빈칸의 어떤 값이 왜 어긋나는지 1문장 — 한 칸만 틀린 조합은 그 사실을 명시> (정답 번호는 제외하고 ${wrongCount}개만)
...`;
}

/**
 * 요약문 완성 객관식 md 프롬프트.
 * 출력 계약(parser-summary-mc.ts 와 1:1): `요약문:` 한 줄 + 조합 선지 5개(값을
 * " …… " 로 연결) + `정답:` + `해설:` + `오답:`.
 * 빈칸 정답을 따로 받는 줄은 **없다** — `정답:` 줄이 가리키는 선지의 값이 곧
 * 각 빈칸의 정답이다(규범 §1-B 철칙 1).
 */
export function buildMdSummaryMcPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { blankCount?: number },
): string {
  const blankCount = clampSummaryMcMdBlankCount(
    opts?.blankCount ?? SUMMARY_MC_MD_BLANK_COUNT_DEFAULT,
  );
  const labels = summaryMcMdLabels(blankCount);
  const labelsText = labels.join(", ");
  const wrongCount = SUMMARY_MC_MD_OPTION_COUNT - 1;

  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 수능 영어 40번형 '요약문 완성' KILLER 문항 1개를 설계하라. 영어 한 문장 요약문의 빈칸 ${labelsText} 에 들어갈 값의 조합을 고르게 하는 형식이다. 조합 선지 다섯 개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 칸에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 수능 영어 40번형 '요약문 완성' 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 영어 한 문장 요약문의 빈칸 ${labelsText} 에 들어갈 값의 조합을 고르게 하는 형식이다. 조합 선지 다섯 개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock = difficulty === "BASIC" ? "" : `${SUMMARY_MC_FEWSHOT}\n\n`;

  const optionShape = labels.map((l) => `<${l}값>`).join(SUMMARY_MC_MD_VALUE_JOINER);
  const optionLines = ["①", "②", "③", "④", "⑤"]
    .map((c) => `${c} ${optionShape}`)
    .join("\n");

  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 요약문 공예 — 여기서 문항의 격이 갈린다
- 요약문은 **영어 한 문장**이다. 지문 전체를 다 읽어야만 쓸 수 있는 압축이어야 하며, 원문 문장을 그대로 옮기거나 이어 붙인 것은 실격이다(연속 8단어 이상이 지문과 같으면 복사로 간주한다).
- 요약문 안에서 빈칸 자리는 라벨 ${labelsText} 로만 표시한다. 각 라벨은 요약문에 **정확히 한 번씩**, ${labels.join(" → ")} 순서로 등장해야 한다.
- 요약문에 정답 값을 노출하지 마라 — 라벨 옆에 정답을 적어 두면 문항이 즉시 무효다.
- 정답 조합을 끼워 읽었을 때 요약문 전체가 자연스러운 영어여야 한다. 특히 "a question/matter/issue of (A) to (B)" 처럼 두 칸을 억지로 이어 붙인 구조는 금지다. (B)가 to 뒤에 오면 원형동사가 와야 하고, 동명사가 필요하면 by/through/of 같은 자연스러운 전치사 구조로 다시 써라.

${summaryMcDesignSection(difficulty, labelsText)}

${summaryMcTrapSection(blankCount, labelsText)}

## 마감 — 위반하면 시험 요령으로 뚫린다
- 즉사 오답 금지: 오답 ${wrongCount}개 중 최소 2개는 상위권 학생도 정답과 끝까지 저울질해야 한다.
- 정답 값만 유독 길거나 유독 추상적이면 실패다. 같은 칸의 값들은 길이 차가 ±3단어 이내여야 한다.
- 값은 영어 단어 또는 짧은 영어 어구다. 한국어·괄호 뜻풀이·설명구를 섞지 마라. 한 값은 6단어를 넘지 않는다.
- 해설과 오답 해설에서 선지를 "3번", "선지 5" 처럼 **평숫자로 지칭하지 마라** — 선지는 저장 시 재배열될 수 있다. 지칭이 필요하면 ①~⑤ 원형 숫자나 값 자체를 인용하라.

## 출력 전 자기검산 (사고 안에서 수행)
- 요약문에 ${labelsText} 가 각각 정확히 한 번씩, 순서대로 들어 있는지 확인하라.
- 요약문에서 지문과 연속으로 겹치는 단어가 8개를 넘지 않는지 확인하라 — 넘으면 다시 써라.
- 정답 조합을 요약문에 꽂아 소리 내어 읽어 보라. 어색하면 정답 값 재설계.
- 다섯 조합을 칸별로 세로로 훑어, 같은 칸의 값들이 같은 문법 슬롯에 전부 꽂히는지 확인하라.
- ${blankCount === 2 ? "(A)만 맞는 조합과 (B)만 맞는 조합이 각각 있는지 확인하라 — 없으면 오답 하나를 재설계." : "한 칸만 틀린 조합이 있는지 확인하라 — 없으면 오답 하나를 재설계."}
- 같은 조합이 두 번 나오지 않는지, 정답과 모든 값이 같은 오답이 없는지 확인하라.
- 각 오답이 어느 칸에서 왜 틀렸는지 지문 근거로 한 줄씩 답해보라 — 못 대는 오답은 재설계.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 요약문·선지 표현 인용만 허용).

## 작성 규칙 (기계 파싱 계약)
- **빈칸 정답을 따로 적는 줄을 만들지 마라.** \`정답:\` 줄이 가리키는 선지의 값이 곧 각 빈칸의 정답이다. 같은 사실을 두 곳에서 받으면 어긋날 자리만 생긴다.
- 요약문은 개행 없이 **한 줄**로 쓴다.
- 빈칸 자리에는 라벨 \`(A)\` 만 쓰고 밑줄(\`_____\`)이나 말줄임표를 덧붙이지 마라 — 시험지가 자동으로 넣는다.
- 선지 한 줄에는 값 ${blankCount}개를 \`${SUMMARY_MC_MD_VALUE_JOINER.trim()}\`(공백+…+…+공백)로 연결한다. 다른 구분자 금지, 값 앞에 라벨 \`(A)\` 를 다시 붙이지 마라.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
요약문: <${labelsText} 가 각각 한 번씩 든 영어 한 문장 요약문>
${optionLines}
${summaryMcExplanationBlock(mode, wrongCount)}

## 지문
${passage}`;
}
