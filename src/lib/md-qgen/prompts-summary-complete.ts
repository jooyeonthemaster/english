// ============================================================================
// 요약문 완성 단답형(SUMMARY_COMPLETE) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의
// 이식본. 견본: prompts-antonym.ts · prompts-summary-mc.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 공예 서사는 question-prompts-essay.ts:64-69(SUMMARY_COMPLETE) 의 실전 계약과
// question-prompts-mc.ts 계열의 요약문 공예를 md 골격으로 옮긴 것이다.
//
// ⚠ 이 유형은 **서술형이다 — 선지가 없다.** 학생이 빈칸에 직접 영어를 써 넣고
//   exam-scoring 이 `blanks[].label` 을 입력 키로, `blanks[].acceptedAnswers` 를
//   허용 집합으로 EXACT 대조한다(answer-spec.ts:303-305 · grade.ts:41-60).
//   그래서 `오답:` 블록이 없고, 대신 `허용답:` 줄이 채점 계약의 핵심이다.
//
// ── 형식 설계의 핵심 결정 (규범 §1-B 철칙 1 적용) ──────────────────────────
// 1) `모범답안:` 줄을 두지 않는다. 각 빈칸의 정답은 `정답(A):` 줄이 유일 진실원이고,
//    스키마의 `correctAnswer`("(A) x, (B) y")는 어댑터가 그 줄들에서 **파생**한다.
//    같은 사실을 두 곳에서 받으면 어긋날 자리만 생긴다(반의어 2연속 반려의 구조).
// 2) `허용답(A):` 에 정답 자신을 다시 적게 하지 않는다 — 스키마가 요구하는
//    "answer 문자열 포함"은 어댑터가 선두 강제 삽입으로 충족한다(같은 이유).
// 3) 줄당 칸은 하나뿐이다. 파이프·표·O/X 칸을 두지 않는다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 빈칸 라벨 축 — question-schemas-essay.ts:123 buildSummaryCompleteSchema 와 동일. */
export const SUMMARY_COMPLETE_MD_LABEL_KEYS = "ABCDE";

/** 설정 범위 — question-type-generation-settings/summary.ts:13-17 과 동일. */
export const SUMMARY_COMPLETE_MD_BLANK_COUNT_MIN = 1;
export const SUMMARY_COMPLETE_MD_BLANK_COUNT_MAX = 5;
export const SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT = 2;

/** 허용답 구분자 계약 리터럴 — 이 유형이 쓰는 유일한 목록 구분자다. */
export const SUMMARY_COMPLETE_MD_VARIANT_JOINER = ", ";

export function clampSummaryCompleteMdBlankCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT;
  return Math.min(
    SUMMARY_COMPLETE_MD_BLANK_COUNT_MAX,
    Math.max(SUMMARY_COMPLETE_MD_BLANK_COUNT_MIN, n),
  );
}

/** 빈칸 라벨 배열 — `["(A)","(B)"]` (프롬프트·파서·게이트·어댑터 공용 축). */
export function summaryCompleteMdLabels(blankCount: number): string[] {
  return SUMMARY_COMPLETE_MD_LABEL_KEYS.slice(
    0,
    clampSummaryCompleteMdBlankCount(blankCount),
  )
    .split("")
    .map((k) => `(${k})`);
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
const SUMMARY_COMPLETE_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 놀이터에서 위험 요소를 공학적으로 전부 제거할수록 아이들이 위험을 스스로 가늠하는 법을 배우지 못해 오히려 더 다친다는 글.
- 요약문: "Engineering every hazard out of play spaces leaves children (A) in the very judgment that keeps them safe, so protection itself turns into a source of (B)." — 지문의 어느 문장도 그대로 옮기지 않았고, 인과 축(보호 → 역효과) 하나만 남겼다.
- 빈칸 자리 선정: (A)는 역설이 걸리는 자리(아이가 무엇을 잃는가), (B)는 그 역설의 귀결(보호가 무엇으로 바뀌는가). 두 칸이 원인-결과로 묶여 있어, 글 전체를 읽지 않으면 어느 쪽도 확정되지 않는다.
- 정답: (A) untrained / (B) vulnerability — 둘 다 지문 표면 어휘의 복사가 아니라 상위 개념이다. 지문은 "children never learn to judge risk" 라고 쓰고, 요약문은 그것을 한 단어로 압축한다.
- 허용답 설계: (A) 는 "unpracticed" 처럼 같은 의미축·같은 품사로 요약문에 꽂아도 문법이 그대로인 어형만 넣는다. "unaware" 는 의미축(연습 부족 ≠ 인지 부족)이 달라 넣지 않는다 — 넣는 순간 오답이 만점으로 흡수된다.
- 이 설계가 아름다운 이유: 두 빈칸이 하나의 인과로 묶여 있어, 학생은 한 칸을 채우려고 해도 글 전체의 논지를 세워야 한다. 그리고 정답 어휘가 지문에 없기 때문에, 지문이 눈앞에 함께 보여도 베껴 쓸 것이 없다.`;

// 빈칸 자리·정답 설계 절 — 난이도 3분기(프로덕션 난이도 루브릭 정합).
function summaryCompleteDesignSection(
  difficulty: MdDifficulty,
  labelsText: string,
): string {
  if (difficulty === "BASIC") {
    return `## 요약문·빈칸 설계 (기본 난이도)
- 요약문은 지문 요지의 직접적인 재진술이다. ${labelsText} 각각의 근거가 지문의 **한 문장 안에서** 확인되게 하라(빈칸별 근거 깊이 1문장).
- 정답은 지문 핵심어를 한 단계만 일반화한 수준이면 충분하다. 다만 지문 문장을 통째로 옮기지는 마라 — 요약문은 언제나 재진술이다.
- 학생이 근거 문장을 찾기만 하면 답이 하나로 확정되어야 한다. 두 단어가 똑같이 그럴듯하면 그건 시비가 나는 문항이다.`;
  }
  if (difficulty === "INTERMEDIATE") {
    return `## 요약문·빈칸 설계 (중급 난이도)
- 요약문은 **서로 다른 두 문장 이상을 인과 또는 대조로 이어야** 값이 확정되는 자리에 빈칸을 둔다(빈칸별 근거 깊이 2문장).
- 정답은 지문 표면 어휘의 복사가 아니라 재진술이다. 지문에 그대로 있는 단어를 그대로 답으로 쓰면, 지문이 문제 안에 함께 보이는 이 유형에서는 "찾아 베끼기"가 된다.
- 근거 문장 하나만 보고 채우면 그럴듯하지만 다른 문장과 충돌하는 값이 실제로 존재해야 한다 — 그 충돌이 이 난이도의 변별이다.`;
  }
  return `## 요약문·빈칸 설계 — KILLER 의 생명
- 요약문은 지문 전체의 요지·인과·대조·결론을 **한 문장**으로 압축한 것이다. 원문 문장 복사는 실격 — 표면 어휘를 재사용하지 않은 상위 추상으로 다시 써라.
- 빈칸 ${labelsText} 는 글의 논지가 지나가는 급소들이다. 서로 논리적으로 묶여 있어야 한다(원인-결과, 문제-해결, 대조, 수단-목적, 변화-귀결). 세부 정보·주변 예시를 빈칸으로 만들면 그 자체로 실패다.
- 정답은 지문 어느 문장에도 그대로 없는 **상위 개념어**여야 한다. 학생이 지문을 훑어 단어를 골라 옮기는 것으로 풀리면 킬러가 아니다.
- 정답 자리에는 "지문을 절반만 읽은 학생이 쓸 법한 그럴듯한 오답"이 최소 2개는 떠올라야 한다. 한 칸을 보고 후보가 즉시 하나로 좁혀지면 그 칸은 묻지 않은 것과 같다.`;
}

// 학생 오답 기제 + 허용답 위생 — 이 유형에는 선지가 없으므로, 오답 기제는
// "학생이 무엇을 써서 틀리는가"이고 그 판정선을 긋는 것이 `허용답:` 이다.
function summaryCompleteTrapSection(labelsText: string): string {
  return `## 학생 오답 기제 — 선지가 없으니 '무엇을 써서 틀리는가'를 설계하라
- 이 문항에는 선지가 없다. 학생은 빈칸에 자기 손으로 영어를 써 넣고, 채점은 네가 정한 정답 집합과의 **정확 일치**로 이루어진다. 그러므로 설계의 축은 두 개다: ①정답이 하나로 수렴하는가 ②그 정답을 못 쓴 학생이 어디로 빠지는가.
- 정답이 하나로 수렴하려면, 요약문의 그 자리가 **문법 슬롯과 의미축을 동시에 구속**해야 한다. 예를 들어 "a source of (B)" 는 명사 자리를 구속하고, 앞 절의 인과가 의미축을 구속한다. 슬롯이 헐거우면 학생마다 다른 단어를 쓰고 채점이 폭주한다.
- 학생이 빠지는 자리를 미리 계산하라: 지문 표면어를 그대로 옮겨 쓰기 / 인과 방향 반전(원인 자리에 결과어) / 범위 확대(부분 사례를 전체 결론으로) / 같은 의미장이지만 정도·극성이 어긋난 단어. 이 넷 중 최소 둘이 실제로 떠오르지 않는 자리는 빈칸으로 쓰지 마라.
- 소재 구속: 정답과 요약문의 재료는 전부 **지문에 실재하는 논리**에서 길어 올려라. 지문 밖 개념을 수입하면 지문을 안 읽고도 상식으로 채워진다.

## 허용답 — 오답을 만점으로 흡수하는 유일한 통로다 (가장 위험한 칸)
- \`허용답(X):\` 에 적은 표현은 **자동채점에서 무조건 만점**이 된다. 되돌릴 수 없는 채점 사고는 전부 이 줄에서 난다.
- 넣어도 되는 것: 요약문에 꽂았을 때 문법이 그대로 성립하고 의미가 **완전히 같은** 표현. 축약형·관사 유무·동치 구문(예: 관계사 등가)·같은 의미의 어형 변형.
- 절대 넣으면 안 되는 것: 같은 의미장의 '비슷한' 단어, 정도·극성이 다른 단어, 문법 슬롯이 다른 형태(명사 자리에 형용사), 상위·하위 개념. 조금이라도 망설여지면 **넣지 마라.**
- 확신 있는 동치가 없으면 \`허용답(X):\` 줄 **자체를 쓰지 마라.** 빈 줄이나 "없음" 을 적지 마라.
- 정답 자신은 허용답에 다시 적지 마라 — 채점 집합에는 자동으로 들어간다. 같은 사실을 두 곳에서 받으면 어긋날 자리만 생긴다.
- 한 빈칸의 허용답이 **다른 빈칸의 정답**과 같으면 실격이다(두 칸이 같은 답을 받게 된다).
- ${labelsText} 의 정답은 서로 달라야 한다. 같은 단어가 두 칸에 들어가면 그 문항은 한 칸만 물은 것이다.`;
}

function summaryCompleteExplanationBlock(mode: MdExplanationMode): string {
  const head = `해설: <딱 2문장 — 각 빈칸이 지문의 어느 논지를 압축하는지, 그 근거 문장이 무엇인지. 합니다체`;
  // 이 유형은 선지가 없어 `오답:` 블록이 존재하지 않는다. answer-only 모드에서도
  // 해설 자체는 남긴다(정본의 answer-only 는 '오답 해설을 쓰지 마라'는 뜻이다).
  return mode === "answer-only"
    ? `${head}. 한 문장으로 줄여도 된다>`
    : `${head}>`;
}

/**
 * 요약문 완성 단답형 md 프롬프트.
 *
 * 출력 계약(parser-summary-complete.ts 와 1:1):
 *   `요약문:` 한 줄 + 라벨별 `정답(A):` (필수) · `허용답(A):` (선택) + `해설:`.
 * 선지가 없으므로 `오답:` 블록은 없고, `모범답안:` 줄도 없다(정답 줄이 유일 진실원).
 */
export function buildMdSummaryCompletePrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { blankCount?: number },
): string {
  const blankCount = clampSummaryCompleteMdBlankCount(
    opts?.blankCount ?? SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT,
  );
  const labels = summaryCompleteMdLabels(blankCount);
  const labelsText = labels.join(", ");
  const firstLabel = labels[0];

  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 내신 서술형 '요약문 완성' KILLER 문항 1개를 설계하라. 영어 한 문장 요약문의 빈칸 ${labelsText} 에 들어갈 말을 학생이 **직접 써 넣게** 하는 형식이다(선지 없음). 빈칸 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 칸에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 내신 서술형 '요약문 완성' 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 추론 필요"})를 설계하라. 영어 한 문장 요약문의 빈칸 ${labelsText} 에 들어갈 말을 학생이 **직접 써 넣게** 하는 형식이다(선지 없음). 빈칸 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock =
    difficulty === "BASIC" ? "" : `${SUMMARY_COMPLETE_FEWSHOT}\n\n`;

  const answerScaffold = labels
    .map((label, i) =>
      i === 0
        ? `정답(${label.slice(1, -1)}): <이 빈칸에 들어갈 영어 단어 또는 짧은 어구(보통 1~3단어)>\n허용답(${label.slice(1, -1)}): <"${SUMMARY_COMPLETE_MD_VARIANT_JOINER.trim()} " 로 이은 동치 정답 — 확신 있는 것이 없으면 이 줄 자체를 쓰지 마라>`
        : `정답${label}: ...\n허용답${label}: ...`,
    )
    .join("\n");

  return `너는 대한민국 수능·내신 영어 서술형을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 요약문 공예 — 여기서 문항의 격이 갈린다
- 요약문은 **영어 한 문장**이다. 지문 전체를 다 읽어야만 쓸 수 있는 압축이어야 하며, 원문 문장을 그대로 옮기거나 이어 붙인 것은 실격이다(연속 8단어 이상이 지문과 같으면 복사로 간주한다).
- 요약문 안에서 빈칸 자리는 라벨 ${labelsText} 로만 표시한다. 각 라벨은 요약문에 **정확히 한 번씩**, ${labels.join(" → ")} 순서로 등장해야 한다.
- 빈칸 자리에는 라벨 ${firstLabel} 만 쓰고 밑줄(\`_____\`)이나 말줄임표를 덧붙이지 마라 — 시험지가 자동으로 넣는다.
- 요약문에 정답을 노출하지 마라. 라벨 옆에 정답을 적어 두거나, 정답과 같은 표현을 요약문 다른 자리에 써 두면 그 빈칸은 무의미해진다.
- 정답을 끼워 읽었을 때 요약문 전체가 자연스러운 영어여야 한다. 빈칸 앞뒤 구조가 답의 품사·수·시제를 구속하도록 문장을 설계하라 — 그래야 학생의 답이 하나로 수렴한다.

${summaryCompleteDesignSection(difficulty, labelsText)}

${summaryCompleteTrapSection(labelsText)}

## 마감 — 위반하면 시험 요령으로 뚫린다
- 한 빈칸의 답은 **1~3단어**가 기본이고 5단어를 넘지 않는다. 문장을 통째로 쓰게 하는 자리는 이 유형이 아니다.
- 정답은 영어 단어 또는 짧은 영어 어구다. 한국어·괄호 뜻풀이·설명구·따옴표를 섞지 마라.
- 정답에 라벨(${firstLabel})을 다시 붙이지 마라. 정답 값만 적는다.
- 지문이 문제 안에 함께 인쇄된다. 정답 어구가 지문 문장에 통째로 들어 있으면 학생이 베껴 쓰고 끝난다 — 정답은 재진술·상위 추상이어야 한다.

## 출력 전 자기검산 (사고 안에서 수행)
- 요약문에 ${labelsText} 가 각각 정확히 한 번씩, 순서대로 들어 있는지 확인하라.
- 요약문에서 지문과 연속으로 겹치는 단어가 8개를 넘지 않는지 확인하라 — 넘으면 다시 써라.
- 각 정답을 요약문에 꽂아 소리 내어 읽어 보라. 문법이 어긋나거나 어색하면 정답 또는 요약문 재설계.
- 각 정답이 요약문 다른 자리에 이미 적혀 있지 않은지 확인하라(정답 누출).
- 각 정답 어구가 지문 문장에 연속으로 통째 들어 있지 않은지 확인하라 — 들어 있으면 상위 개념으로 다시 써라.
- ${labelsText} 의 정답이 서로 다른지 확인하라.
- \`허용답:\` 에 적은 표현 하나하나에 대해 "이걸 쓴 학생에게 만점을 줘도 되는가"를 답해보라 — 망설여지면 지워라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 요약문·정답 표현 인용만 허용).

## 작성 규칙 (기계 파싱 계약)
- 요약문은 개행 없이 **한 줄**로 쓴다.
- 빈칸 라벨은 **반각 괄호 + 대문자** \`${firstLabel}\` 형태로만 쓴다. \`(${firstLabel.slice(1, -1).toLowerCase()})\`·전각 괄호·괄호 안 공백을 쓰지 마라.
- \`정답(X):\` 는 빈칸마다 정확히 한 줄씩, ${labels.join(" → ")} 순서로 쓴다. 한 줄에 두 빈칸을 몰아 쓰지 마라.
- \`정답(X):\` 값에는 **답 하나만** 적는다. 슬래시(\`/\`)·쉼표·세미콜론·\`(or ...)\`·\`or\` 로 대안을 나열하지 마라 — 채점은 그 줄 전체를 하나의 문자열로 대조하므로, 나열하는 순간 어떤 학생도 그 빈칸을 맞힐 수 없다. 동치는 반드시 \`허용답(X):\` 줄로 보내라.
- 값 앞에 라벨을 다시 붙이지 마라. 특히 \`정답${firstLabel}:\` 줄의 값에 **다른 빈칸의 라벨**을 적으면 어느 칸의 정답인지 확정할 수 없어 반려된다.
- \`허용답(X):\` 는 동치가 있을 때만 쓰고, 값은 \`${SUMMARY_COMPLETE_MD_VARIANT_JOINER.trim()} \`(쉼표+공백)로만 잇는다. 다른 구분자 금지.
- **정답을 두 번 적는 줄을 만들지 마라.** \`정답(X):\` 줄이 그 빈칸 정답의 유일한 진실원이다. 전체 요약문을 채운 '모범답안' 줄도 쓰지 마라 — 코드가 정답 줄에서 만든다.
- 표·파이프(\`|\`)·번호 목록으로 꾸미지 마라.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
요약문: <${labelsText} 가 각각 한 번씩 든 영어 한 문장 요약문>
${answerScaffold}
${summaryCompleteExplanationBlock(mode)}

## 지문
${passage}`;
}
