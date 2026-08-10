// ============================================================================
// 문법 오류 수정(GRAMMAR_CORRECTION) md 프롬프트 — 정본 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 구조 원본: prompts.ts buildMdGrammarPrompt 의
// "밑줄지문 + 원형 + 고침" 3단. 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// ── 이 유형이 어법(GRAMMAR_ERROR)과 다른 점 ────────────────────────────────
//  어법은 밑줄 5곳 중 "틀린 것을 고르는" 객관식이라 미끼(옳은 밑줄)가 있다.
//  이 유형은 **서술형**이다 — 밑줄 구간 전부가 오류이고(후처리 계약:
//  processGrammarCorrection 은 isError=true 가 아닌 구간이 하나라도 있으면
//  실패한다), 학생이 밑줄 안에서 틀린 자리를 스스로 찾아 직접 고쳐 쓴다.
//  선지가 없으므로 **오답 해설 섹션도 없고, `정답:` 줄도 없다**.
//
// ── 형식 설계 검산 (규범 §1-B 철칙 4개) ────────────────────────────────────
//  철칙1(한 정보는 한 곳에서만): `정답:` 줄을 두지 않았다. 이 유형의 정답은
//    각 자리의 "올바른 표현"이고 그것은 `고침(X):` 줄이 이미 말한다 —
//    별도 정답 줄은 100% 중복이라 반의어가 무너진 그 구조가 된다.
//  철칙2(줄당 칸 최소화): 고침 줄은 칸 2개(틀린 표현 · 올바른 표현)뿐이다.
//    포인트 코드 칸은 **의도적으로 없앴다** — GRAMMAR_CORRECTION 의 저장 스키마
//    (underlinedSegments)와 후처리 어디에도 pointCode 소비처가 없어, 받아 봐야
//    버려지는 죽은 칸이자 실패 모드만 하나 늘리는 칸이다.
//    밑줄 구간 원문(sourceText)도 받지 않는다 — 마커 안 변형본에서 틀린 표현을
//    올바른 표현으로 되돌리면 코드가 결정형으로 복원한다(파서 deriveSourceText).
//  철칙3(조용히 버리지 않기): 파서는 마커를 진실원으로 세그먼트를 만들고,
//    고침 줄이 없으면 빈 값으로 남겨 게이트가 "(B) 고침 줄 없음" 을 지목한다.
//  철칙4·5(자리를 지목하는 게이트): gate-grammar-correction.ts 참조.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 밑줄 라벨 축 — 후처리 grammarCorrectionLabel 과 동일한 (A)~(E) 대문자. */
export const GRAMMAR_CORRECTION_MD_LABELS = ["A", "B", "C", "D", "E"] as const;

/** 설정 범위 — question-type-generation-settings/grammar.ts 와 동기(1~5). */
export const GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN = 1;
export const GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX = 5;

export function clampGrammarCorrectionMdErrorCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN;
  return Math.min(
    GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX,
    Math.max(GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN, n),
  );
}

/** 정답 포인트 핵심 10선 — 정본 GRAMMAR_MD_POINT_LIST 와 같은 축(문자열만 재기술). */
const CORRECTION_POINT_LIST =
  "(a)정동사·준동사 (b)관계사(that·what 포함) (c)분사 능수동 (d)수일치 (e)태 (f)형용사·부사 (g)대명사 (h)목적격보어 (i)병렬 (k)부정사·동명사";

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
// 반드시 "이 설계가 아름다운 이유" 1줄을 포함한다(규범 블록 2 계약).
const CORRECTION_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 지문·표현을 복사하지는 마라)
지문: 도시의 가로수가 여름철 노면 온도를 낮춘다는 글.
- 밑줄 구간(원문 축자): "Trees planted along a busy street, whose canopies overlap by midsummer, reduce the surface temperature of the pavement beneath them."
- 심은 오류: reduce 를 reduces 로. 진짜 주어는 Trees 인데 그 사이에 분사구(planted along a busy street)와 관계절(whose canopies overlap by midsummer)이 끼어 있다. 동사 바로 앞 명사가 midsummer(단수)라 밑줄 안만 훑으면 reduces 가 오히려 자연스러워 보인다.
- 밑줄을 넓게 잡은 이유: 오류 토큰 하나만 밑줄 치면 "여기가 틀렸다"를 이미 알려 준 셈이라 과제가 성립하지 않는다. 학생은 문장 전체에서 오류 자리를 스스로 찾아야 한다.
- 고쳐 쓸 답의 유일성: reduce 말고 다른 답이 성립할 여지가 없다. 시제를 건드리지 않았고 의미도 변하지 않는다.
- 이 설계가 아름다운 이유: 답은 한 단어로 짧고 시비가 없는데, 그 답에 이르는 판정 근거(주어의 핵)는 밑줄 안에서 가장 먼 자리에 있다. 구조를 읽은 학생만 통과한다.`;

// 난이도 3분기 — 표적(밑줄 구간) 설계. 정본 BLANK_TARGET_BY_DIFFICULTY 대응물.
const CORRECTION_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 밑줄 구간 설계 (기본 난이도)
- 밑줄은 문장 하나를 통째로 잡아라(최소 8단어). 절만 잘라 쓰려면 주어와 동사가 함께 들어 있는 절이어야 한다.
- 오류는 그 문장 안에서 완결적으로 판정되는 자리로 — 주어와 동사가 붙어 있는 수일치, 명백한 태, 형용사·부사 자리처럼 개념을 알면 바로 보이는 자리.
- 다만 철자·구두점 수준의 오류는 금지다. 문법 개념 판단은 반드시 한 번 들어가야 한다.`,
  INTERMEDIATE: `## 밑줄 구간 설계 (중급 난이도)
- 밑줄은 수식어구·삽입구가 한 겹 낀 문장으로(최소 10단어). 판정하려면 그 수식을 한 번 건너뛰어야 하게 하라.
- 오류 자리와 판정 근거가 같은 어절에 붙어 있으면 미달이다 — 근거는 밑줄 안의 다른 부분(선행사·진짜 주어·병렬의 시작점)에 두어라.
- 밑줄 안을 소리 내어 읽었을 때 오류가 즉시 귀에 걸리면 자리를 옮겨라.`,
  KILLER: `## 밑줄 구간 설계 — KILLER 의 생명
- 밑줄은 구조 하중이 걸린 문장으로 잡아라(최소 12단어). 다음 중 최소 하나를 반드시 품어야 한다: 관계절(who·which·that·whose·where) · 삽입구(콤마로 끊긴 with·including·as well as·along with) · 병렬(not only A but B, both A and B, from A to B) · 수량 주어구(one of·the number of·a number of·most of) · 도치(Never·Rarely·Only then·Not only 문두) · 가목적어(find·make·consider + it + 보어 + to부정사).
- 오류는 그 자리에서 로컬로 자연스러워 보여야 한다. 진짜 주어의 핵, 선행사, 병렬의 시작점처럼 **오류 자리에서 멀리 떨어진 단서**를 추적해야만 틀렸음이 드러나야 한다.
- 🚫 한눈 비문 금지: 주어 바로 옆 수일치, who·which 단순 교체, 진행형 뒤 -ing 겹치기. 스캔만으로 잡히면 그건 킬러가 아니다.
- 사고 안에서 서로 다른 포인트의 오류 후보를 2개 이상 설계해 비교하고, 판정 단서가 더 길게 뻗은 쪽을 채택하라. 정동사·준동사에 습관적으로 정착하지 마라.`,
};

/** 오류 심기 규칙 — 정본의 "오답 기제 분류학" 대응물(이 유형은 미끼가 없으므로 변형 기제). */
function mutationSection(errorCount: number): string {
  return `## 오류 심기 — 고쳐 쓸 답이 유일해야 한다
- 원문은 이미 어법상 옳다고 전제하라. 원문을 고치는 과제가 아니라, **네가 원문 표현을 틀리게 변형해 두고 학생이 원문으로 되돌리게** 하는 과제다.
- 출제 포인트는 핵심 10선 안에서: ${CORRECTION_POINT_LIST}.${errorCount >= 2 ? ` 밑줄 ${errorCount}곳의 포인트는 서로 다르게 하고, 밑줄도 서로 다른 문장에 흩어라.` : ""}
- 변형은 **한 자리에 딱 한 곳**이다. 한 밑줄 안에 두 군데를 건드리면 학생의 답이 갈려 채점이 무너진다.
- 틀린 형태는 실제 영어에 존재하는 형태여야 한다. 🚫 unfriendlily(-ly 형용사에 -ly) · more better(이중 비교급) · informations(불가산 복수) · childs 같은 가짜 형태 금지. friendly·costly 류 -ly 형용사는 부사로 바꿀 수 없으니 형용사·부사 오류로 쓰지 마라.
- 🚫 둘 다 맞는 변형 금지 — 이런 자리는 복수정답 시비가 되어 문항이 무효다:
  · 규칙동사 현재↔과거 단독 교체(realizes↔realized, outpaces↔outpaced, does↔did) — 시간부사가 없으면 둘 다 성립한다.
  · 수량 의미토글(few↔a few, little↔a little, less↔fewer, amount↔number, some↔any) — 둘 다 문법적이고 의미만 다르다.
  · 능동·수동 부정사 선호(to gain↔to be gained), stop to do↔stop doing, 지각·사역동사 뒤 원형↔to부정사↔-ing 중 둘 이상이 성립하는 자리.
  · 생략 가능한 that, 관사·단순 전치사·철자·구두점·문체 취향.
- 🚫 원문 자체가 규범 논쟁 대상인 자리(집합명사 수일치, 단수 they, 당위절 be↔is)는 밑줄 치지 마라.`;
}

/** 마감 — 위반하면 문항이 시험 요령으로 뚫리거나 채점이 무너진다. */
function closingSection(errorCount: number): string {
  return `## 마감 — 위반하면 채점이 무너진다
- 밑줄 구간은 반드시 **오류 토큰보다 훨씬 넓다**. 틀린 표현만 밑줄 치면 답을 알려 준 것이다. 밑줄 구간의 단어 수는 최소한 "틀린 표현 단어 수 + 3" 이상이면서 5단어를 넘겨야 한다.
- 밑줄 구간은 한 문장 또는 한 절까지다. 두 문장 이상을 한 밑줄로 묶지 마라.
- 틀린 표현은 밑줄 구간 안에 **정확히 한 번만** 나타나야 한다. 같은 단어가 그 구간에 두 번 나오면 고칠 자리가 유일하지 않으니 밑줄을 옮겨라.
- 올바른 표현은 원문에 실제로 있던 바로 그 표현이다. 원문에도 없고 틀린 표현도 아닌 제3의 표현을 답으로 만들지 마라.
- 틀린 표현과 올바른 표현은 **판단이 걸린 최소 단위**(보통 1~3단어)로 적어라. 절 전체를 답으로 만들면 학생이 옮겨 적기 시험이 된다.${errorCount >= 2 ? `\n- 밑줄 ${errorCount}곳의 난이도를 고르게 맞춰라. 한 곳만 유독 쉬우면 나머지가 장식이 된다.` : ""}`;
}

function selfCheckSection(errorCount: number, lastLabel: string): string {
  return `## 출력 전 자기검산 (사고 안에서 수행)
- 마커 안 텍스트에서 틀린 표현을 올바른 표현으로 되돌린 결과가 **원문 문장과 한 글자도 다르지 않은지** 확인하라 — 다르면 그 밑줄은 통째로 무효다.
- 마커 밖의 지문 텍스트가 원문과 한 글자도 다르지 않은지 확인하라(문장 추가·삭제·재배열·구두점 변경 전부 금지).
- 라벨 (A)~(${lastLabel}) ${errorCount}개가 지문 등장 순서대로 붙어 있고, 고침 줄도 같은 라벨로 ${errorCount}줄인지 확인하라.
- 틀린 표현이 그 밑줄 구간 안에 정확히 1회 등장하는지 세어 보라.
- 학생이 쓸 수 있는 다른 정답이 있는지 스스로 반박해 보라 — 하나라도 떠오르면 그 자리는 시비 자리이니 재설계.
- 허용답 줄을 쓴다면 그 안에 **틀린 표현이 절대 들어가지 않게** 하라(들어가면 오답이 정답 처리된다).
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).`;
}

/** 해설 블록 — 이 유형은 선지가 없어 오답 해설 섹션이 존재하지 않는다. */
function correctionExplanationBlock(
  mode: MdExplanationMode,
  errorCount: number,
): string {
  if (mode === "answer-only") {
    return "해설: <딱 1문장 — 무엇을 무엇으로 고쳐야 하는지의 구조 근거만. 합니다체>";
  }
  return errorCount === 1
    ? "해설: <딱 2문장 — 그 자리가 요구하는 구조가 무엇이고 왜 표시된 형태가 비문인지. 합니다체>"
    : `해설: <밑줄 ${errorCount}곳을 (A)부터 순서대로, 각 1~2문장씩 — 그 자리가 요구하는 구조와 왜 표시된 형태가 비문인지. 합니다체>`;
}

/**
 * 문법 오류 수정 md 프롬프트.
 * 출력 계약(parser-grammar-correction.ts 와 1:1):
 *   `밑줄지문:` [[A:변형된 문장]] 인라인 마킹 +
 *   `고침(A): <틀린 표현> → <올바른 표현>` 라벨 라인 ×N +
 *   `허용답(A): ...`(선택) + `해설:`.
 * `정답:` 줄과 `오답:` 섹션은 **존재하지 않는다**(철칙 1 — 파일 상단 주석 참조).
 */
export function buildMdGrammarCorrectionPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { errorCount?: number },
): string {
  const errorCount = clampGrammarCorrectionMdErrorCount(
    opts?.errorCount ?? GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
  );
  const labels = GRAMMAR_CORRECTION_MD_LABELS.slice(0, errorCount);
  const lastLabel = labels[labels.length - 1];

  const headline =
    difficulty === "KILLER"
      ? `아래 지문에서 문장(또는 절) ${errorCount}곳에 밑줄을 긋고, 그 안에 어법 오류를 하나씩 심어 학생이 직접 바르게 고쳐 쓰게 하는 KILLER 서술형 문항 1개를 설계하라. 밑줄 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 지점에서 오류를 놓칠지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문에서 문장(또는 절) ${errorCount}곳에 밑줄을 긋고, 그 안에 어법 오류를 하나씩 심어 학생이 직접 바르게 고쳐 쓰게 하는 서술형 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 구조 판단 필요"})를 설계하라. 밑줄 하나하나에 명확한 출제 의도가 있어야 한다.`;

  // 비KILLER 는 few-shot 을 싣지 않는다(정본 어법 빌더 선례 prompts.ts:386-389).
  const fewshotBlock = difficulty === "BASIC" ? "" : `${CORRECTION_FEWSHOT}\n\n`;

  const fixScaffold = [
    "고침(A): <마커 안에 실제로 적은 틀린 표현> → <원문에 있던 올바른 표현>",
    ...labels.slice(1).map((l) => `고침(${l}): ...`),
  ].join("\n");

  const underlineContract =
    errorCount === 1
      ? `<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 1곳만 [[A:구간]] 로 감싼다. 마커 안에는 원문의 그 문장(또는 절)을 통째로 넣되, 그 안의 표현 딱 한 곳만 틀린 형태로 바꿔 적는다. 바꾼 그 한 곳을 뺀 나머지 텍스트는 마커 안팎 모두 원문과 완전히 동일해야 한다.>`
      : `<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 ${errorCount}곳만 [[A:구간]] ~ [[${lastLabel}:구간]] 로 감싼다. 마커 안에는 원문의 그 문장(또는 절)을 통째로 넣되, 각 마커마다 그 안의 표현 딱 한 곳씩만 틀린 형태로 바꿔 적는다. 바꾼 그 ${errorCount}곳을 뺀 나머지 텍스트는 마커 안팎 모두 원문과 완전히 동일해야 한다. 라벨은 지문 등장 순서대로 (A)(B)(C)… 로 붙인다.>`;

  return `너는 대한민국 수능·내신 영어 어법 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}${CORRECTION_TARGET_BY_DIFFICULTY[difficulty]}

${mutationSection(errorCount)}

${closingSection(errorCount)}

${selfCheckSection(errorCount, lastLabel)}

## 고침 줄 작성 규칙 (기계 파싱 계약)
- 한 밑줄 = 고침 한 줄이다. 형태는 \`고침(라벨): 틀린 표현 → 올바른 표현\` **하나뿐**이며, 화살표는 \` → \`(공백-화살표-공백)를 쓴다.
- 줄에 다른 칸을 덧붙이지 마라. 포인트 코드·문법 이름·밑줄 원문을 이 줄에 적지 마라.
- 밑줄 구간의 원문은 적지 않는다 — 위 두 표현만 있으면 서버가 원문을 결정형으로 복원한다.
- \`정답:\` 줄을 쓰지 마라. 이 문항의 정답은 각 고침 줄의 "올바른 표현"이며, 그것이 유일한 진실원이다.
- 선지가 없는 서술형이므로 \`오답:\` 섹션도 쓰지 마라.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
${underlineContract}

${fixScaffold}
허용답(A): <올바른 표현과 문법·의미가 완전히 동등해서 학생이 그렇게 써도 정답인 다른 교정형이 있으면 " | " 로 나열한다(예: in which | where). 확신 없는 변형은 넣지 마라. 동등한 답이 올바른 표현 하나뿐이면 이 줄은 통째로 생략한다.>
${correctionExplanationBlock(mode, errorCount)}

## 지문
${passage}`;
}
