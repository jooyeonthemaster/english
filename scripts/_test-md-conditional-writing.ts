// 조건부 영작(CONDITIONAL_WRITING) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → validateQuestionQuality 왕복 +
// **buildAnswerSpec → gradeAnswer 채점 왕복**(서술형 계열 고유 축) + 과금·적격성·난이도 3분기.
// 실행: npx tsx scripts/_test-md-conditional-writing.ts
//
// 형식 계약(§1-B 철칙 1): 이 유형에는 `정답:` 줄이 없다. `모범답안:` 이 정답의
// 유일 진실원이고 어댑터가 correctAnswer 로 복제한다. 선지가 없으므로 `오답:` 도 없고,
// 대신 사람 채점(MANUAL_ONLY)의 유일 근거인 `채점기준:` 을 받는다.
import {
  autoSnapConditionalWriting,
  parseMdConditionalWriting,
  type MdConditionalWritingQuestion,
} from "../src/lib/md-qgen/parser-conditional-writing";
import {
  gateMdConditionalWriting,
  isMachineCheckableCondition,
} from "../src/lib/md-qgen/gate-conditional-writing";
import {
  adaptMdConditionalWritingToAiQuestion,
  CONDITIONAL_WRITING_MD_DIRECTION,
  CONDITIONAL_WRITING_MD_DIRECTION_EN,
} from "../src/lib/md-qgen/adapter-conditional-writing";
import { CONDITIONAL_WRITING_MD_LANE } from "../src/lib/md-qgen/lane-conditional-writing";
import { buildMdConditionalWritingPrompt } from "../src/lib/md-qgen/prompts-conditional-writing";
import type { MdDifficulty } from "../src/lib/md-qgen/prompts";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { buildAnswerSpec } from "../src/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "../src/lib/exam-scoring/grade";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Museums that display historical dress face a peculiar difficulty. " +
  "Garments survive, but the gestures that once animated them do not. " +
  "Without the information contained in art, such displays would be an awkward imitation of the original makers' intentions. " +
  "Painters recorded how a sleeve was pushed back and how a collar was left open, and those records let curators restore posture as well as fabric. " +
  "What looks like a technical detail is therefore a form of historical evidence.";

const MODEL_ANSWER =
  "Had it not been for the information art contains, these exhibits would merely imitate what their first makers intended, awkwardly.";

const GOOD = `우리말: 예술에 담긴 정보가 없다면, 그러한 전시는 원래 제작자들의 의도를 어색하게 모방한 것에 그칠 것이다.
조건:
- 'Had it not been'으로 시작할 것
- 'without'을 사용하지 말 것
- 총 20단어로 쓸 것
모범답안: ${MODEL_ANSWER}
채점기준:
- 도치 가정법 'Had it not been for'를 정확히 쓰면 2점
- 금지어 없이 같은 조건 의미를 전달하면 1점
- 총 20단어 조건을 지키면 1점
해설: 조건 ①은 도치 가정법 'Had it not been for'로 충족되고, 조건 ②는 원문의 전치사 대신 그 도치 구문이 같은 조건 의미를 지게 하여 지켜집니다. 원문의 명사구를 동사구로 풀어 쓰고 과거 사실의 반대 가정으로 시제를 옮겨 총 20단어를 맞추었습니다.`;

function snapOf(md: string): {
  question: MdConditionalWritingQuestion;
  corrections: string[];
} {
  return autoSnapConditionalWriting(parseMdConditionalWriting(md));
}

function gateOf(md: string, difficulty: MdDifficulty = "KILLER"): string[] {
  return gateMdConditionalWriting(snapOf(md).question, PASSAGE, { difficulty });
}

function laneCtx(overrides?: Partial<MdLaneContext>): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: {},
    rawTypeSettings: undefined,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdConditionalWriting(GOOD);
check("파싱: 우리말 한 줄", parsed.korean.startsWith("예술에 담긴 정보가"), parsed.korean);
check("파싱: 조건 3개", parsed.conditions.length === 3, `실제 ${parsed.conditions.length}`);
check("파싱: 모범답안", parsed.modelAnswer === MODEL_ANSWER, parsed.modelAnswer);
check(
  "파싱: 채점기준 3개",
  parsed.scoringCriteria.length === 3,
  `실제 ${parsed.scoringCriteria.length}`,
);
check("파싱: 해설 존재", parsed.explanation.length > 50, `${parsed.explanation.length}자`);
check(
  "파싱: 해설에 지문·다른 섹션이 섞이지 않음",
  !parsed.explanation.includes("Museums") && !parsed.explanation.includes("채점기준"),
);

const snapped = autoSnapConditionalWriting(parsed);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린(KILLER)",
  gateMdConditionalWriting(snapped.question, PASSAGE, { difficulty: "KILLER" }).length === 0,
  gateMdConditionalWriting(snapped.question, PASSAGE, { difficulty: "KILLER" }).join(" / "),
);
check(
  "게이트: 정상 입력 클린(INTERMEDIATE·BASIC)",
  gateOf(GOOD, "INTERMEDIATE").length === 0 && gateOf(GOOD, "BASIC").length === 0,
  [...gateOf(GOOD, "INTERMEDIATE"), ...gateOf(GOOD, "BASIC")].join(" / "),
);
check(
  "게이트: requireCriteria=false 면 채점기준 없어도 클린",
  gateMdConditionalWriting(
    { ...snapped.question, scoringCriteria: [] },
    PASSAGE,
    { difficulty: "KILLER", requireCriteria: false },
  ).length === 0,
);
check(
  "기계 검증 가능 판정: 인용 토큰·정확 단어 수는 참, 구문 요구·범위 표현은 거짓",
  isMachineCheckableCondition("'without'을 사용하지 말 것") &&
    isMachineCheckableCondition("총 20단어로 쓸 것") &&
    !isMachineCheckableCondition("수동태로 쓸 것") &&
    !isMachineCheckableCondition("20단어 이내로 쓸 것"),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
type Case = [name: string, md: string, needle: string];
const REJECTS: Case[] = [
  [
    "우리말 누락",
    GOOD.replace(/^우리말:.*\n/m, ""),
    "우리말 줄을 인식할 수 없음",
  ],
  [
    "모범답안 누락",
    GOOD.replace(/^모범답안:.*\n/m, ""),
    "모범답안 줄을 인식할 수 없음",
  ],
  [
    "조건 항목 전무",
    GOOD.replace(
      /조건:\n- 'Had it not been'으로 시작할 것\n- 'without'을 사용하지 말 것\n- 총 20단어로 쓸 것\n/,
      "",
    ),
    "조건 항목이 하나도 없음",
  ],
  ["해설 누락", GOOD.replace(/^해설:.*$/m, ""), "해설 누락"],
  [
    "우리말이 한국어가 아님",
    GOOD.replace(
      /^우리말:.*$/m,
      "우리말: Without the information contained in art, displays would be awkward.",
    ),
    "우리말 줄이 한국어가 아님",
  ],
  [
    "우리말에 모범답안 영어 노출",
    GOOD.replace(
      /^우리말:(.*)$/m,
      "우리말:$1 (been for the information art contains)",
    ),
    "우리말 줄에 모범답안의 영어 표현이 노출됨",
  ],
  [
    "모범답안에 한글 혼입",
    GOOD.replace(MODEL_ANSWER, `${MODEL_ANSWER} 그리고 전시는 어색해집니다.`),
    "모범답안에 한글이 섞여 있음",
  ],
  [
    "모범답안 분량 미달",
    GOOD.replace(MODEL_ANSWER, "Art matters."),
    "6~40단어",
  ],
  [
    "모범답안이 지문 축자 복사(최강 게이트)",
    GOOD.replace(
      MODEL_ANSWER,
      "Without the information contained in art, such displays would be an awkward imitation of the original makers' intentions.",
    ),
    "축자 복사임",
  ],
  [
    "모범답안이 사실상 통째 복사(연속 런)",
    GOOD.replace(
      MODEL_ANSWER,
      "Without any information contained in art, such displays would be an awkward imitation of the original makers' intentions.",
    ),
    "사실상 통째 복사",
  ],
  [
    "KILLER 조건 1개",
    GOOD.replace("- 'without'을 사용하지 말 것\n", "").replace(
      "- 총 20단어로 쓸 것\n",
      "",
    ),
    "KILLER 난이도는 2개 이상",
  ],
  [
    "조건 과다(5개)",
    GOOD.replace(
      "- 총 20단어로 쓸 것\n",
      "- 총 20단어로 쓸 것\n- 분사구문을 쓸 것\n- 관계절을 쓸 것\n",
    ),
    "4개 이하여야 한다",
  ],
  [
    "조건이 한국어 지시문이 아님",
    GOOD.replace("- 총 20단어로 쓸 것\n", "- Use the passive voice.\n"),
    "한국어 지시문이 아님",
  ],
  [
    "조건 중복",
    GOOD.replace(
      "- 총 20단어로 쓸 것\n",
      "- 총 20단어로 쓸 것\n- 'without'을 사용하지 말 것\n",
    ),
    "앞 조건과 중복",
  ],
  [
    "기계 검증 가능한 조건 전무",
    GOOD.replace("- 'Had it not been'으로 시작할 것\n", "- 가정법으로 쓸 것\n")
      .replace("- 'without'을 사용하지 말 것\n", "- 분사구문을 쓸 것\n")
      .replace("- 총 20단어로 쓸 것\n", "- 수동태로 쓸 것\n"),
    "기계로 검증 가능한 항목이 없음",
  ],
  [
    "조건 위반 — 단어 수 불일치",
    GOOD.replace("- 총 20단어로 쓸 것", "- 총 25단어로 쓸 것"),
    "조건 위반",
  ],
  [
    "조건 위반 — 금지 토큰이 모범답안에 존재",
    GOOD.replace("- 'without'을 사용하지 말 것", "- 'information'을 사용하지 말 것"),
    "조건 위반",
  ],
  [
    "조건 위반 — 필수 토큰이 모범답안에 없음",
    GOOD.replace("- 'Had it not been'으로 시작할 것", "- 'not only'를 반드시 사용할 것"),
    "조건 위반",
  ],
  [
    "시작 자리 위반(정본 검증기가 못 보는 축)",
    GOOD.replace("- 'Had it not been'으로 시작할 것", "- 'these exhibits'로 시작할 것"),
    "문장을 시작할 것을 요구하는데",
  ],
  [
    "끝 자리 위반",
    GOOD.replace("- 'Had it not been'으로 시작할 것", "- 'exhibits'로 끝낼 것"),
    "문장을 끝낼 것을 요구하는데",
  ],
  [
    "채점기준 부족",
    GOOD.replace("- 금지어 없이 같은 조건 의미를 전달하면 1점\n", "").replace(
      "- 총 20단어 조건을 지키면 1점\n",
      "",
    ),
    "채점기준 1개",
  ],
  [
    "채점기준 과다",
    GOOD.replace(
      "- 총 20단어 조건을 지키면 1점\n",
      "- 총 20단어 조건을 지키면 1점\n- 철자 오류가 없으면 1점\n- 구두점이 정확하면 1점\n- 어순이 자연스러우면 1점\n",
    ),
    "5개 이하여야 한다",
  ],
  [
    "채점기준이 한국어가 아님",
    GOOD.replace(
      "- 총 20단어 조건을 지키면 1점",
      "- Full credit for the correct inversion.",
    ),
    "채점기준 3번이 한국어가 아님",
  ],
  [
    "해설이 한국어가 아님",
    GOOD.replace(/^해설:.*$/m, "해설: The inversion satisfies every stated condition here."),
    "해설이 한국어가 아님",
  ],
  [
    "해설이 너무 짧음",
    GOOD.replace(/^해설:.*$/m, "해설: 조건을 지켰습니다."),
    "조건이 어디서 충족되는지",
  ],
  [
    "해설 환각 인용(문항 표면에 없는 영어 인용)",
    GOOD.replace(
      /^해설:(.*)$/m,
      "해설:$1 특히 'a completely fabricated phrase'가 근거입니다.",
    ),
    "문항 어디에도 없는 영어 표현을 인용함",
  ],
  // ── wave2 적대검수 회귀 ────────────────────────────────────────────────
  [
    "[w2-1] 조건 목록 끝의 검산 메모가 모범답안을 노출(학생 표면 정답 노출 · critical)",
    GOOD.replace(
      "- 총 20단어로 쓸 것\n",
      "- 총 20단어로 쓸 것\n(예: Had it not been for the information art contains, these exhibits would merely imitate ...)\n",
    ),
    "조건 4번에 모범답안이 노출됨",
  ],
  [
    "[w2-2a] 우리말 괄호 병기 — 조건 인용 토큰이 문제에 미리 인쇄됨(critical)",
    GOOD.replace(
      /^우리말:.*$/m,
      "우리말: 예술에 담긴 정보가 없었다면(Had it not been for), 그러한 전시는 원래 제작자들의 의도를 어색하게 모방한 것에 그칠 것이다.",
    ),
    "우리말 줄에 조건의 인용 표현이 그대로 적혀 있음",
  ],
  [
    "[w2-2b] 우리말 괄호 병기 — 라틴 어구 축(토큰 런 검사가 못 잡는 형태)",
    GOOD.replace(
      /^우리말:.*$/m,
      "우리말: 예술에 담긴 정보가 없었다면(art contains), 그러한 전시는 원래 제작자들의 의도를 어색하게 모방한 것에 그칠 것이다.",
    ),
    "우리말 줄에 영어 어구가 섞여 있음",
  ],
  [
    "[w2-2c] 우리말이 사실상 영어인데 한글 꼬리만 달림",
    GOOD.replace(
      /^우리말:.*$/m,
      "우리말: Without the information contained in art, such displays would be an awkward imitation 입니다",
    ),
    "우리말 줄에 영어 어구가 섞여 있음",
  ],
  [
    "[w2-4b] 자리 지정의 부정형 — 정본 검증기 오독을 형식으로 지목",
    GOOD.replace("- 총 20단어로 쓸 것", "- 'Without'으로 시작하지 말 것"),
    "자리 지정을 부정형으로 썼다",
  ],
  [
    "[w2-8d] 조건에 표 파이프 잔재(양끝 파이프가 없어 파서가 표로 못 보는 형태)",
    GOOD.replace("- 총 20단어로 쓸 것", "- 3 | 총 20단어로 쓸 것"),
    "조건 3번에 마크다운 잔재가 남아 있음",
  ],
  [
    "[w2-8e] 채점기준에 표 파이프 잔재",
    GOOD.replace("- 총 20단어 조건을 지키면 1점", "- 1점 | 총 20단어 조건을 지키면"),
    "채점기준 3번에 마크다운 잔재가 남아 있음",
  ],
];

for (const [name, md, needle] of REJECTS) {
  const issues = gateOf(md);
  check(
    `게이트 반려: ${name}`,
    issues.some((issue) => issue.includes(needle)),
    `기대 '${needle}' · 실제 [${issues.join(" / ")}]`,
  );
}

check(
  "게이트: 우리말·모범답안 둘 다 없으면 조기 반환(무의미한 후속 검사 생략)",
  gateOf("조건:\n- 'x'를 사용할 것").every(
    (issue) =>
      issue.includes("우리말") ||
      issue.includes("모범답안") ||
      issue.includes("해설 누락"),
  ),
);
check(
  "게이트: BASIC 은 조건 1개도 허용",
  gateOf(
    GOOD.replace("- 'without'을 사용하지 말 것\n", "").replace(
      "- 총 20단어로 쓸 것\n",
      "",
    ),
    "BASIC",
  ).length === 0,
  gateOf(
    GOOD.replace("- 'without'을 사용하지 말 것\n", "").replace("- 총 20단어로 쓸 것\n", ""),
    "BASIC",
  ).join(" / "),
);
check(
  "게이트: 범위 수식 단어 수 조건은 위반으로 잡지 않는다(정본 검증기와 동일 관용)",
  gateOf(GOOD.replace("- 총 20단어로 쓸 것", "- 25단어 이내로 쓸 것")).length === 0,
  gateOf(GOOD.replace("- 총 20단어로 쓸 것", "- 25단어 이내로 쓸 것")).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 6필드 온전 + 게이트 클린이어야 한다.
//    ★ 줄이 조용히 유실되면 게이트에는 "개수 부족"으로만 보여 원인이 은폐된다(철칙 3).
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [name: string, from: string, to: string][] = [
  ["불릿 접두 라벨", "우리말:", "- 우리말:"],
  ["굵게 라벨(콜론 안)", "모범답안:", "**모범답안:**"],
  ["굵게 라벨(콜론 밖)", "해설:", "**해설**:"],
  ["줄 전체 굵게", "우리말:", "**우리말:"],
  ["헤딩 라벨 + 콜론", "조건:", "## 조건:"],
  ["각괄호 라벨", "우리말:", "[영작할 우리말]:"],
  ["전각 콜론", "모범답안:", "모범답안："],
  ["라벨 내부 공백", "모범답안:", "모범 답안:"],
  ["채점기준 라벨 공백", "채점기준:", "채점 기준:"],
  ["구형 `정답:` 별칭", "모범답안:", "정답:"],
  ["번호 목록 조건", "- 'Had it not been'으로 시작할 것", "1. 'Had it not been'으로 시작할 것"],
  ["별표 불릿 조건", "- 'without'을 사용하지 말 것", "* 'without'을 사용하지 말 것"],
  ["가운뎃점 불릿 조건", "- 총 20단어로 쓸 것", "• 총 20단어로 쓸 것"],
  ["표 행 조건", "- 'without'을 사용하지 말 것", "| - 'without'을 사용하지 말 것 |"],
  ["불릿 없는 조건 줄", "- 총 20단어로 쓸 것", "총 20단어로 쓸 것"],
  ["원문자 불릿 채점기준", "- 총 20단어 조건을 지키면 1점", "① 총 20단어 조건을 지키면 1점"],
];

// 줄 전체 굵게 드리프트는 끝에도 ** 가 붙어야 완성된다 — 별도 처리.
for (const [name, from, to] of DRIFTS) {
  let drifted = GOOD.replace(from, to);
  if (name === "줄 전체 굵게") {
    drifted = drifted.replace(/^(\*\*우리말:.*)$/m, "$1**");
  }
  const q = snapOf(drifted).question;
  const issues = gateMdConditionalWriting(q, PASSAGE, { difficulty: "KILLER" });
  check(
    `드리프트 관용: ${name}`,
    q.conditions.length === 3 &&
      q.scoringCriteria.length === 3 &&
      q.modelAnswer === MODEL_ANSWER &&
      q.korean.length > 10 &&
      q.explanation.length > 50 &&
      issues.length === 0,
    `조건 ${q.conditions.length} · 기준 ${q.scoringCriteria.length} · 답 '${q.modelAnswer.slice(0, 24)}' · ${issues.join(" / ")}`,
  );
}

// 번호 라벨형 조건(`조건 1:` 형태) — 라벨 줄마다 항목 하나
{
  const numbered = GOOD.replace(
    "조건:\n- 'Had it not been'으로 시작할 것\n- 'without'을 사용하지 말 것\n- 총 20단어로 쓸 것",
    "조건 1: 'Had it not been'으로 시작할 것\n조건 2: 'without'을 사용하지 말 것\n조건 3: 총 20단어로 쓸 것",
  );
  const q = snapOf(numbered).question;
  check(
    "드리프트 관용: `조건 N:` 라벨형",
    q.conditions.length === 3 && gateMdConditionalWriting(q, PASSAGE).length === 0,
    `조건 ${q.conditions.length} · ${gateMdConditionalWriting(q, PASSAGE).join(" / ")}`,
  );
}

// 모델이 지문을 뒤에 덧붙여도 해설이 오염되면 안 된다(헤딩 = 섹션 종료)
{
  const echoed = `${GOOD}\n\n## 지문\n${PASSAGE}`;
  const q = snapOf(echoed).question;
  check(
    "드리프트 관용: 지문 에코가 해설로 빨려 들어가지 않는다",
    !q.explanation.includes("Museums") && gateMdConditionalWriting(q, PASSAGE).length === 0,
    q.explanation.slice(-40),
  );
}

// 해설 줄바꿈 — 두 줄로 온 해설은 한 필드로 합친다
{
  const wrapped = GOOD.replace(
    "원문의 명사구를 동사구로",
    "\n원문의 명사구를 동사구로",
  );
  const q = snapOf(wrapped).question;
  check(
    "드리프트 관용: 여러 줄 해설을 한 필드로 합침",
    q.explanation.includes("충족되고") && q.explanation.includes("맞추었습니다"),
    q.explanation.slice(0, 40),
  );
}

// 과잉 관용 방지 — 라벨처럼 생긴 산문을 라벨로 오인하지 않는다
{
  const prose = GOOD.replace(
    "채점기준:",
    "채점기준:\n- 우리말은 원문 의미를 다 담아야 하므로 감점 대상이 아니다",
  );
  const q = snapOf(prose).question;
  check(
    "과잉 관용 방지: '우리말은 …' 산문을 라벨로 오인하지 않음",
    q.korean.startsWith("예술에 담긴") && q.scoringCriteria.length === 4,
    `korean='${q.korean.slice(0, 16)}' 기준 ${q.scoringCriteria.length}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정
// ───────────────────────────────────────────────────────────────────────────
{
  const quoted = GOOD.replace(`모범답안: ${MODEL_ANSWER}`, `모범답안: "${MODEL_ANSWER}"`);
  const s = snapOf(quoted);
  check(
    "스냅: 모범답안을 감싼 큰따옴표 제거",
    s.question.modelAnswer === MODEL_ANSWER && s.corrections.length === 1,
    `'${s.question.modelAnswer.slice(0, 24)}' · ${s.corrections.join(" / ")}`,
  );
  check(
    "스냅: 보정 후 게이트 클린",
    gateMdConditionalWriting(s.question, PASSAGE).length === 0,
    gateMdConditionalWriting(s.question, PASSAGE).join(" / "),
  );
}
{
  const bold = GOOD.replace(
    "- 'without'을 사용하지 말 것",
    "- **without**을 사용하지 말 것",
  );
  const s = snapOf(bold);
  check(
    "스냅: 굵게 표기 영어 토큰 → 작은따옴표(기계 검증 가능성 복원)",
    s.question.conditions[1] === "'without'을 사용하지 말 것" &&
      s.corrections.some((c) => c.includes("조건 표기 정규화")),
    `'${s.question.conditions[1]}' · ${s.corrections.join(" / ")}`,
  );
  check(
    "스냅: 굵게 보정 후 게이트 클린",
    gateMdConditionalWriting(s.question, PASSAGE).length === 0,
    gateMdConditionalWriting(s.question, PASSAGE).join(" / "),
  );
}
{
  const tick = GOOD.replace(
    "- 'without'을 사용하지 말 것",
    "- `without`을 사용하지 말 것",
  );
  const s = snapOf(tick);
  check(
    "스냅: 백틱 표기 영어 토큰 → 작은따옴표",
    s.question.conditions[1] === "'without'을 사용하지 말 것",
    `'${s.question.conditions[1]}'`,
  );
}
{
  // 보수 가드 — 아포스트로피가 든 값은 작은따옴표 벗기기를 하지 않는다.
  const withApostrophe = "Had it not been for art, the makers' intent would vanish today.";
  const s = autoSnapConditionalWriting({
    kind: "conditional-writing",
    korean: "'예술이 없었다면 제작자의 의도는 사라졌을 것이다.'",
    conditions: ["'Had it not been'으로 시작할 것"],
    modelAnswer: withApostrophe,
    scoringCriteria: [],
    explanation: "테스트",
  });
  check(
    "스냅 보수 가드: 내부 아포스트로피가 있으면 값을 건드리지 않는다",
    s.question.modelAnswer === withApostrophe,
    s.question.modelAnswer,
  );
  check(
    "스냅: 우리말을 감싼 작은따옴표는 제거(내부 아포스트로피 없음)",
    s.question.korean === "예술이 없었다면 제작자의 의도는 사라졌을 것이다.",
    s.question.korean,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → postProcessQuestion → validateQuestionQuality 왕복
// ───────────────────────────────────────────────────────────────────────────
const adapt = adaptMdConditionalWritingToAiQuestion(snapped.question, "KILLER");
check("어댑터: 성공", adapt.ok === true, adapt.error);
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
check("어댑터: 발문 상수(fast 산출과 동일 문구)", ai.direction === CONDITIONAL_WRITING_MD_DIRECTION);
check("어댑터: referenceSentence = 우리말", ai.referenceSentence === snapped.question.korean);
check(
  "어댑터: conditions 3개 · scoringCriteria 3개",
  (ai.conditions as string[]).length === 3 && (ai.scoringCriteria as string[]).length === 3,
);
check(
  "어댑터: correctAnswer = modelAnswer (정답의 유일 진실원 복제)",
  ai.correctAnswer === MODEL_ANSWER && ai.modelAnswer === MODEL_ANSWER,
  String(ai.correctAnswer),
);
check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
check(
  "어댑터: options 키가 아예 없다(correct-answer-mismatch 회귀 방지)",
  !("options" in ai),
);
check(
  "어댑터: 타 유형 필드 누출 없음(blanks·passageWithBlank·acceptedAnswers·scrambledWords)",
  !("blanks" in ai) &&
    !("passageWithBlank" in ai) &&
    !("acceptedAnswers" in ai) &&
    !("scrambledWords" in ai) &&
    !("originalExpression" in ai),
);
check("어댑터: difficulty 원본 그대로", ai.difficulty === "KILLER");
check(
  "어댑터: 채점기준이 비면 키 자체를 싣지 않는다",
  !(
    "scoringCriteria" in
    ((adaptMdConditionalWritingToAiQuestion(
      { ...snapped.question, scoringCriteria: [] },
      "BASIC",
    ).aiQuestion ?? {}) as Record<string, unknown>)
  ),
);
check(
  "어댑터: 필수 필드 결손이면 실패(카드 렌더 불가 방지)",
  adaptMdConditionalWritingToAiQuestion({ ...snapped.question, conditions: [] }, "BASIC").ok ===
    false &&
    adaptMdConditionalWritingToAiQuestion({ ...snapped.question, korean: "" }, "BASIC").ok ===
      false &&
    adaptMdConditionalWritingToAiQuestion({ ...snapped.question, modelAnswer: "" }, "BASIC")
      .ok === false,
);

const pp = postProcessQuestion("CONDITIONAL_WRITING", PASSAGE, ai as never);
check("후처리(PASSTHROUGH): 성공", pp.success === true, pp.error);
const data = (pp.data ?? {}) as Record<string, unknown>;
check(
  "후처리: 어댑터 완제품이 그대로 보존됨(후처리가 만들어 주는 것은 없다)",
  data.referenceSentence === ai.referenceSentence &&
    data.modelAnswer === MODEL_ANSWER &&
    data.correctAnswer === MODEL_ANSWER,
);
check(
  "후처리: 렌더 가능 판정 필드(referenceSentence && conditions) 충족",
  Boolean(data.referenceSentence) && Array.isArray(data.conditions) && (data.conditions as []).length > 0,
);
check("후처리: options 를 만들어 내지 않는다", !("options" in data) || data.options == null);

{
  const issues = validateQuestionQuality({
    typeId: "CONDITIONAL_WRITING",
    question: { ...data, difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...CONDITIONAL_WRITING_MD_LANE.qualityArgs(laneCtx()),
  });
  const errors = issues.filter((issue) => issue.severity === "error");
  check(
    "품질 검증: error 0건(RELAXED_BLOCKING 코드 무발화)",
    errors.length === 0,
    errors.map((e) => `${e.code}: ${e.message}`).join(" / "),
  );
  check(
    "품질 검증: cond-writing 전용 error 코드 무발화",
    !issues.some(
      (issue) =>
        issue.code === "cond-writing-verbatim-answer" ||
        issue.code === "cond-writing-condition-violated",
    ),
  );
  check(
    "품질 검증: killer-needs-multiple-conditions 무발화(조건 3개)",
    !issues.some((issue) => issue.code === "killer-needs-multiple-conditions"),
  );
}

// 게이트를 통과시킨 문항은 fast 차단 코드도 통과해야 한다 — 역방향 확인:
// 지문 축자 복사본은 게이트가 잡고, 검증기도 error 를 낸다(두 축이 같은 것을 본다).
{
  const copied = {
    ...data,
    modelAnswer:
      "Without the information contained in art, such displays would be an awkward imitation of the original makers' intentions.",
  };
  const issues = validateQuestionQuality({
    typeId: "CONDITIONAL_WRITING",
    question: copied,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
  });
  check(
    "축 정합: 게이트가 잡는 축자 복사를 정본 검증기도 error 로 잡는다",
    issues.some((issue) => issue.code === "cond-writing-verbatim-answer"),
    issues.map((i) => i.code).join(","),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 채점 왕복 — buildAnswerSpec → gradeAnswer (서술형 계열 고유 축)
//    CONDITIONAL_WRITING 은 FREE_WRITING(answer-spec.ts:250,271-273) 이라
//    **항상 MANUAL_ONLY → NEEDS_REVIEW** 다. acceptedAnswers 계약이 없다.
// ───────────────────────────────────────────────────────────────────────────
{
  const spec = buildAnswerSpec({
    id: "q-cw-1",
    type: "ESSAY",
    subType: "CONDITIONAL_WRITING",
    structuredData: data,
    correctAnswer: String(data.correctAnswer ?? ""),
    sourcePassageContent: PASSAGE,
    points: 4,
  });
  check("채점: inputKind MANUAL_ONLY", spec.inputKind === "MANUAL_ONLY", spec.inputKind);
  check("채점: manualReason 자유영작", (spec.manualReason ?? "").includes("자유영작"), spec.manualReason);
  check(
    "채점: 정답 집합 필드가 없다(acceptedAnswers 계약 부재 유형)",
    spec.fields === undefined && spec.textMode === undefined,
  );
  const exact = gradeAnswer(spec, { texts: { answer: MODEL_ANSWER } });
  const wrongish = gradeAnswer(spec, { texts: { answer: "I do not know." } });
  check(
    "채점: 모범답안과 똑같이 써도 NEEDS_REVIEW(기계 채점 불가 계약)",
    exact.status === "NEEDS_REVIEW" && exact.earnedPoints === null,
    exact.status,
  );
  check(
    "채점: 오답도 NEEDS_REVIEW — 자동 오채점이 없다",
    wrongish.status === "NEEDS_REVIEW" && wrongish.earnedPoints === null,
    wrongish.status,
  );
  check("채점: 배점 보존", spec.points === 4);
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금 축 · 적격성 · 난이도 3분기 · 언어 집행
// ───────────────────────────────────────────────────────────────────────────
check(
  "레인: subType CONDITIONAL_WRITING",
  CONDITIONAL_WRITING_MD_LANE.subType === "CONDITIONAL_WRITING",
);
check(
  "레인: 과금 QUESTION_GEN_SINGLE (2크레딧) — fast VOCAB_TYPES 미포함과 동기",
  CONDITIONAL_WRITING_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(CONDITIONAL_WRITING_MD_LANE.operationType),
);
check("레인: retryEligible", CONDITIONAL_WRITING_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 항상 true(resolved 에 전용 키가 없는 유형)",
  CONDITIONAL_WRITING_MD_LANE.isEligible({}) &&
    CONDITIONAL_WRITING_MD_LANE.isEligible({ anything: 99 }),
);
check(
  "레인: parseAndGate 왕복(정상 입력 클린 · 보정 0)",
  (() => {
    const r = CONDITIONAL_WRITING_MD_LANE.parseAndGate(GOOD, laneCtx());
    return r.gateIssues.length === 0 && r.corrections.length === 0;
  })(),
);
check(
  "레인: parseAndGate 가 난이도를 게이트에 전달(BASIC 조건 1개 허용)",
  CONDITIONAL_WRITING_MD_LANE.parseAndGate(
    GOOD.replace("- 'without'을 사용하지 말 것\n", "").replace("- 총 20단어로 쓸 것\n", ""),
    laneCtx({ difficulty: "BASIC" }),
  ).gateIssues.length === 0,
);
check(
  "레인: adapt 한국어 발문 기본",
  (
    CONDITIONAL_WRITING_MD_LANE.adapt(
      CONDITIONAL_WRITING_MD_LANE.parseAndGate(GOOD, laneCtx()),
      laneCtx(),
    ).aiQuestion ?? {}
  ).direction === CONDITIONAL_WRITING_MD_DIRECTION,
);
{
  const enSettings = { CONDITIONAL_WRITING: { stemLanguage: "en" } };
  const ctx = laneCtx({ rawTypeSettings: enSettings });
  check(
    "레인: stemLanguage=en 이면 발문 영어 + 언어 블록 1개",
    CONDITIONAL_WRITING_MD_LANE.buildExtras(ctx).length === 1 &&
      (CONDITIONAL_WRITING_MD_LANE.adapt(
        CONDITIONAL_WRITING_MD_LANE.parseAndGate(GOOD, ctx),
        ctx,
      ).aiQuestion ?? {}).direction === CONDITIONAL_WRITING_MD_DIRECTION_EN,
  );
  check(
    "레인: qualityArgs 에 stemLanguage 실값(전용 카운트 슬롯 없음)",
    JSON.stringify(CONDITIONAL_WRITING_MD_LANE.qualityArgs(ctx)) ===
      JSON.stringify({ stemLanguage: "en" }),
    JSON.stringify(CONDITIONAL_WRITING_MD_LANE.qualityArgs(ctx)),
  );
}
check(
  "레인: 기본(ko) 은 언어 블록·교사포인트 블록 없음",
  CONDITIONAL_WRITING_MD_LANE.buildExtras(laneCtx()).length === 0,
);
check(
  "레인: mdFormat 난이도별 최소 조건 수 기록",
  (CONDITIONAL_WRITING_MD_LANE.mdFormat(laneCtx({ difficulty: "BASIC" })).conditionMin === 1) &&
    CONDITIONAL_WRITING_MD_LANE.mdFormat(laneCtx({ difficulty: "KILLER" })).conditionMin === 2,
);
check(
  "레인: diversityTargets = referenceSentence",
  CONDITIONAL_WRITING_MD_LANE.diversityTargets({
    referenceSentence: "예술에 담긴 정보가 없다면",
  }).join("") === "예술에 담긴 정보가 없다면" &&
    CONDITIONAL_WRITING_MD_LANE.diversityTargets({}).length === 0,
);

for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const prompt = buildMdConditionalWritingPrompt(PASSAGE, "full", d);
  check(
    `프롬프트 ${d}: 난이도 분기 + 출력형식 + 지문 포함`,
    prompt.includes("## 출력 형식") &&
      prompt.includes("우리말:") &&
      prompt.includes("모범답안:") &&
      prompt.includes("채점기준:") &&
      prompt.includes("해설:") &&
      prompt.includes("## 지문") &&
      prompt.includes(PASSAGE.slice(0, 40)),
  );
}
check(
  "프롬프트: 난이도 3분기가 실제로 다른 표적 설계를 낸다",
  buildMdConditionalWritingPrompt(PASSAGE, "full", "BASIC").includes("표적 설계 (기본 난이도)") &&
    buildMdConditionalWritingPrompt(PASSAGE, "full", "INTERMEDIATE").includes(
      "표적 설계 (중급 난이도)",
    ) &&
    buildMdConditionalWritingPrompt(PASSAGE, "full", "KILLER").includes(
      "표적 설계 — KILLER 의 생명",
    ),
);
check(
  "프롬프트: `정답:` 줄을 요구하지 않는다(모범답안이 유일 진실원 — 철칙 1)",
  !/^정답:/m.test(buildMdConditionalWritingPrompt(PASSAGE, "full", "KILLER")),
);
check(
  "프롬프트: 선지·오답해설을 요구하지 않는다(서술형 계약)",
  !buildMdConditionalWritingPrompt(PASSAGE, "full", "KILLER").includes("오답:") &&
    !buildMdConditionalWritingPrompt(PASSAGE, "full", "KILLER").includes("①  <"),
);
check(
  "프롬프트: KILLER·INTERMEDIATE 는 few-shot 해부 포함, BASIC 은 생략",
  buildMdConditionalWritingPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부") &&
    buildMdConditionalWritingPrompt(PASSAGE, "full", "INTERMEDIATE").includes("모범 설계 해부") &&
    !buildMdConditionalWritingPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부"),
);
check(
  "프롬프트: answer-only 모드는 채점기준 섹션을 요구하지 않는다",
  !buildMdConditionalWritingPrompt(PASSAGE, "answer-only", "KILLER").includes("채점기준:"),
);
check(
  "프롬프트: verbatim 복사 금지 자기검산 문구 포함(실측 결함 대응)",
  buildMdConditionalWritingPrompt(PASSAGE, "full", "KILLER").includes("연속 6단어 이상"),
);

// ───────────────────────────────────────────────────────────────────────────
// 8. wave2 적대검수 회귀 픽스처 — 지적 8건 전량을 재현·고정한다.
//    각 픽스처는 수정 **전에는 실패**하던 실측 입력이다.
// ───────────────────────────────────────────────────────────────────────────

// [w2-3] 라벨 줄 드리프트 — 값이 통째로 유실되거나 직전 열린 섹션으로 오배치되던 형태.
//        전부 6필드 온전 + 게이트 클린이어야 한다(철칙 3: 파서가 데이터를 조용히 버리지 마라).
const W2_LABEL_DRIFTS: [name: string, md: string][] = [
  ["[w2-3①] `우리말:` 단독 줄 + 다음 줄에 값", GOOD.replace(/^우리말: (.*)$/m, "우리말:\n$1")],
  [
    "[w2-3②] `모범답안:` 단독 줄 + 다음 줄에 값",
    GOOD.replace(`모범답안: ${MODEL_ANSWER}`, `모범답안:\n${MODEL_ANSWER}`),
  ],
  [
    "[w2-3③] 코드펜스로 감싼 모범답안",
    GOOD.replace(`모범답안: ${MODEL_ANSWER}`, `모범답안:\n\`\`\`\n${MODEL_ANSWER}\n\`\`\``),
  ],
  ["[w2-3④] `모범답안(예시):` 괄호 부연", GOOD.replace("모범답안:", "모범답안(예시):")],
  ["[w2-3④b] `우리말 (영작 대상):` 괄호 부연", GOOD.replace("우리말:", "우리말 (영작 대상):")],
  ["[w2-3⑤] `조건 (3개):` 헤더", GOOD.replace("조건:", "조건 (3개):")],
  ["[w2-3⑤b] `조건 3개:` 헤더", GOOD.replace("조건:", "조건 3개:")],
  ["[w2-3⑥] 블록 인용(`> 해설: …`)", GOOD.replace(/^(해설:)/m, "> $1")],
  [
    "[w2-8①] 구분행 없는 2열 표 조건(번호 칸 + 내용 칸)",
    GOOD.replace(
      "- 'Had it not been'으로 시작할 것\n- 'without'을 사용하지 말 것\n- 총 20단어로 쓸 것",
      "| 1 | 'Had it not been'으로 시작할 것 |\n| 2 | 'without'을 사용하지 말 것 |\n| 3 | 총 20단어로 쓸 것 |",
    ),
  ],
  [
    "[w2-8①b] 헤더 + 구분행이 있는 정식 표 조건",
    GOOD.replace(
      "- 'Had it not been'으로 시작할 것\n- 'without'을 사용하지 말 것\n- 총 20단어로 쓸 것",
      "| 번호 | 내용 |\n|---|---|\n| 1 | 'Had it not been'으로 시작할 것 |\n| 2 | 'without'을 사용하지 말 것 |\n| 3 | 총 20단어로 쓸 것 |",
    ),
  ],
  [
    "[w2-8③] 라벨 줄 인라인 불릿(`조건: - …`)",
    GOOD.replace(
      "조건:\n- 'Had it not been'으로 시작할 것",
      "조건: - 'Had it not been'으로 시작할 것",
    ),
  ],
];
for (const [name, md] of W2_LABEL_DRIFTS) {
  const q = snapOf(md).question;
  const issues = gateMdConditionalWriting(q, PASSAGE, { difficulty: "KILLER" });
  check(
    `wave2 드리프트 관용: ${name}`,
    q.conditions.length === 3 &&
      q.scoringCriteria.length === 3 &&
      q.modelAnswer === MODEL_ANSWER &&
      q.korean.startsWith("예술에 담긴") &&
      q.explanation.length > 50 &&
      issues.length === 0,
    `조건 ${JSON.stringify(q.conditions)} · 기준 ${q.scoringCriteria.length} · 답 '${q.modelAnswer.slice(0, 24)}' · 우리말 '${q.korean.slice(0, 12)}' · ${issues.join(" / ")}`,
  );
}

// [w2-키워드] 이번 웨이브 최대 결함 계통(silent-drop) 고정:
//   선지·데이터 줄은 관대하게 파싱하면서 **키워드 줄만 무관용 정규식**으로 잡으면,
//   모델이 헤더를 굵게(`**해설:**`)·전각 콜론(`해설：`)으로 쓰는 순간 그 필드가 통째로 사라지고
//   게이트가 "…줄을 인식할 수 없음"이라는 **사실과 다른 원인**을 재생성 프롬프트에 싣는다.
//   → 모든 키워드 줄 × 모든 표기 드리프트 조합을 전수로 못 박는다.
const KEYWORD_LABELS = ["우리말:", "조건:", "모범답안:", "채점기준:", "해설:"] as const;
const KEYWORD_DECORATIONS: [name: string, wrap: (label: string) => string][] = [
  ["굵게(콜론 안)", (l) => `**${l}**`],
  ["굵게(콜론 밖)", (l) => `**${l.slice(0, -1)}**:`],
  ["전각 콜론", (l) => `${l.slice(0, -1)}：`],
  ["앞 공백", (l) => `   ${l}`],
  ["불릿 접두", (l) => `- ${l}`],
  ["헤딩 접두", (l) => `### ${l}`],
  ["블록 인용", (l) => `> ${l}`],
  ["각괄호 라벨", (l) => `[${l.slice(0, -1)}]:`],
  ["괄호 부연", (l) => `${l.slice(0, -1)}(필수):`],
  // 합성어 경계 공백(`모범 답안:` / `채점 기준:`) — 라벨 정규식이 `\s*` 를 둔 자리.
  ["라벨 내부 공백", (l) => `${l.slice(0, 2)} ${l.slice(2)}`],
];
for (const label of KEYWORD_LABELS) {
  for (const [decoName, wrap] of KEYWORD_DECORATIONS) {
    if (decoName === "라벨 내부 공백" && !["모범답안:", "채점기준:"].includes(label)) continue;
    const q = snapOf(GOOD.replace(label, wrap(label))).question;
    const issues = gateMdConditionalWriting(q, PASSAGE, { difficulty: "KILLER" });
    check(
      `키워드 줄 관용: \`${label}\` + ${decoName}`,
      q.korean.startsWith("예술에 담긴") &&
        q.conditions.length === 3 &&
        q.modelAnswer === MODEL_ANSWER &&
        q.scoringCriteria.length === 3 &&
        q.explanation.length > 50 &&
        issues.length === 0,
      `우리말 '${q.korean.slice(0, 10)}' · 조건 ${q.conditions.length} · 답 '${q.modelAnswer.slice(0, 18)}' · 기준 ${q.scoringCriteria.length} · 해설 ${q.explanation.length}자 · ${issues.join(" / ")}`,
    );
  }
}
// 구형 `정답:` 별칭도 같은 관용을 받아야 한다(모범답안 부재 시 폴백 진실원).
for (const [decoName, wrap] of KEYWORD_DECORATIONS.slice(0, 4)) {
  const q = snapOf(GOOD.replace("모범답안:", wrap("정답:"))).question;
  check(
    `키워드 줄 관용: 구형 \`정답:\` 별칭 + ${decoName}`,
    q.modelAnswer === MODEL_ANSWER &&
      gateMdConditionalWriting(q, PASSAGE, { difficulty: "KILLER" }).length === 0,
    `'${q.modelAnswer.slice(0, 24)}'`,
  );
}

// [w2-8②] 채점기준 표는 배점 칸을 버리지 않는다(번호 칸만 버린다).
{
  const q = snapOf(
    GOOD.replace(
      "- 도치 가정법 'Had it not been for'를 정확히 쓰면 2점",
      "| 2점 | 도치 가정법 'Had it not been for'를 정확히 쓰면 |",
    ),
  ).question;
  check(
    "wave2: 채점기준 표 — 파이프는 사라지고 배점 칸은 보존된다",
    !q.scoringCriteria[0].includes("|") &&
      q.scoringCriteria[0].includes("2점") &&
      q.scoringCriteria[0].includes("도치 가정법") &&
      gateMdConditionalWriting(q, PASSAGE).length === 0,
    `'${q.scoringCriteria[0]}' · ${gateMdConditionalWriting(q, PASSAGE).join(" / ")}`,
  );
}

// [w2-3④/철칙 5] 조기 반환 앞에서도 조건 이상을 함께 실어 보낸다 —
// 재생성 프롬프트가 '모범답안 줄을 인식할 수 없음'이라는 **거짓 원인 하나**만 받던 결함.
{
  const issues = gateOf(
    `우리말: 예술에 담긴 정보가 없다면, 그러한 전시는 어색한 모방에 그칠 것이다.
조건:
- 'Had it not been'으로 시작할 것
- 'without'을 사용하지 말 것
- ${MODEL_ANSWER}
해설: 조건은 도치 가정법으로 충족되며 금지어를 피해 같은 의미를 전달합니다. 원문 대비 시제와 구문을 전환했습니다.`,
  );
  check(
    "wave2[w2-3④]: 모범답안 결손 시에도 조건 오배치를 함께 지목한다",
    issues.some((i) => i.includes("모범답안 줄을 인식할 수 없음")) &&
      issues.some((i) => i.includes("조건 3번이 한국어 지시문이 아님")),
    issues.join(" / "),
  );
}

// [w2-4] 시작/끝 자리 강제는 **인용 토큰에 직접 붙은** 신호에만 발화한다.
//        구문 지시(분사구문으로 시작…)와 결합된 정상 KILLER 조건을 반려하면 안 된다.
const W2_EDGE_OK: [name: string, condition: string][] = [
  ["구문 요구 + 인용 토큰 결합", "분사구문으로 시작하고 'exhibits'를 사용할 것"],
  ["토큰과 무관한 위치 서술이 뒤에 붙음", "'exhibits'를 사용하되 분사구문으로 시작할 것"],
  ["끝 신호가 토큰과 무관", "'exhibits'를 쓰고 부사로 문장을 끝맺을 것"],
];
for (const [name, condition] of W2_EDGE_OK) {
  const issues = gateOf(GOOD.replace("- 총 20단어로 쓸 것", `- ${condition}`));
  check(
    `wave2[w2-4] 오탐 없음: ${name}`,
    issues.length === 0,
    issues.join(" / "),
  );
}
check(
  "wave2[w2-4]: 토큰 인접 자리 신호는 여전히 강제된다(`'X'로 시작/끝`)",
  gateOf(GOOD.replace("- 'Had it not been'으로 시작할 것", "- 'these exhibits'로 시작할 것")).some(
    (i) => i.includes("문장을 시작할 것을 요구하는데"),
  ) &&
    gateOf(GOOD.replace("- 'Had it not been'으로 시작할 것", "- 'exhibits'로 문장을 끝낼 것")).some(
      (i) => i.includes("문장을 끝낼 것을 요구하는데"),
    ),
);
{
  // 토큰이 여럿인 조건(`'A' 또는 'B'로 시작할 것`)에서 자리 강제는 some() 으로 관대하게 본다.
  // (정본 검증기는 must-use 토큰을 전부 요구하므로 별도 사유를 내지만, 그건 우리 축이 아니다 —
  //  #10 이 '시작 자리 위반'이라는 **두 번째 거짓 사유**를 얹지 않는 것이 여기서 고정할 계약이다.)
  const issues = gateOf(
    GOOD.replace(
      "- 'Had it not been'으로 시작할 것",
      "- 'Had it not been' 또는 'Should' 로 시작할 것",
    ),
  );
  check(
    "wave2[w2-4]: 인용 토큰이 여럿이면 하나만 자리를 맞춰도 자리 위반을 얹지 않는다",
    !issues.some((i) => i.includes("문장을 시작할 것을 요구하는데")),
    issues.join(" / "),
  );
}

// [w2-5] 스냅이 없던 조건 위반을 제조하면 안 된다 — 문법 용어는 승격 금지.
const W2_NO_PROMOTE: [name: string, bolded: string, expected: string][] = [
  ["다어절 문법 용어", "반드시 **passive voice**로 쓸 것", "반드시 passive voice로 쓸 것"],
  ["단일 문법 용어", "**inversion**을 쓸 것", "inversion을 쓸 것"],
  ["백틱 문법 용어", "`relative clause`를 쓸 것", "relative clause를 쓸 것"],
  [
    "모범답안에 없는 다어절 구문명",
    "**not only A but also B** 구문을 사용할 것",
    "not only A but also B 구문을 사용할 것",
  ],
];
for (const [name, bolded, expected] of W2_NO_PROMOTE) {
  const s = snapOf(GOOD.replace("- 총 20단어로 쓸 것", `- ${bolded}`));
  const issues = gateMdConditionalWriting(s.question, PASSAGE);
  check(
    `wave2[w2-5] 승격 금지: ${name}`,
    s.question.conditions[2] === expected && issues.length === 0,
    `'${s.question.conditions[2]}' · ${issues.join(" / ")}`,
  );
}
{
  // 승격이 정당한 두 경우는 유지한다 — 금지 조건, 그리고 모범답안에 실재하는 리터럴.
  const forbidden = snapOf(
    GOOD.replace("- 'without'을 사용하지 말 것", "- **without**을 사용하지 말 것"),
  );
  const present = snapOf(GOOD.replace("- 총 20단어로 쓸 것", "- **these exhibits**를 사용할 것"));
  check(
    "wave2[w2-5]: 금지 조건·모범답안 실재 토큰은 여전히 승격된다",
    forbidden.question.conditions[1] === "'without'을 사용하지 말 것" &&
      present.question.conditions[2] === "'these exhibits'를 사용할 것" &&
      gateMdConditionalWriting(present.question, PASSAGE).length === 0,
    `'${forbidden.question.conditions[1]}' · '${present.question.conditions[2]}'`,
  );
  check(
    "wave2[w2-5]: 승격이 일어나면 corrections 가 '기계 검증 대상으로 승격'을 명시한다",
    forbidden.corrections.some((c) => c.includes("기계 검증 대상으로 승격")),
    forbidden.corrections.join(" / "),
  );
}

// [w2-7] 해설 오염 — 헤딩 없이 지문을 덧붙여도 해설이 오염되지 않는다.
{
  const q = snapOf(`${GOOD}\n${PASSAGE}`).question;
  check(
    "wave2[w2-7]: 헤딩 없는 지문 에코가 해설로 빨려 들어가지 않는다",
    !q.explanation.includes("Museums") &&
      q.explanation.length < 200 &&
      gateMdConditionalWriting(q, PASSAGE).length === 0,
    `${q.explanation.length}자 · ${q.explanation.slice(-40)}`,
  );
}
{
  // 파서 가드를 우회해 필드에 직접 오염이 실려도 게이트가 상한 축으로 잡는다.
  const polluted = {
    ...snapped.question,
    explanation: `${snapped.question.explanation} ${PASSAGE}`,
  };
  const issues = gateMdConditionalWriting(polluted, PASSAGE);
  check(
    "wave2[w2-7]: 게이트 상한 축(길이·지문 런)이 해설 오염을 잡는다",
    issues.some((i) => i.includes("400자 이하")) &&
      issues.some((i) => i.includes("해설에 지문 원문이 통째로 섞여 들어옴")),
    issues.join(" / "),
  );
}

// [w2-6] 프롬프트 — 인용 규칙이 범주에 한정돼 있고 반례가 실려 있어야 한다.
{
  const killer = buildMdConditionalWritingPrompt(PASSAGE, "full", "KILLER");
  check(
    "wave2[w2-6]: 인용 규칙이 '문자 그대로 쓸 표현'으로 한정되고 구문명 인용 반례가 실려 있다",
    !killer.includes("영어 표현은 **반드시 작은따옴표로 감싸라**") &&
      killer.includes("문자 그대로") &&
      killer.includes("이 범주는 절대 따옴표를 쓰지 않는다") &&
      killer.includes("'not only A but also B' 구문을 사용할 것"),
  );
  check(
    "wave2[w2-6]: 자리 지정 부정형·조건 줄 모범답안 병기·표 꾸미기 금지가 명시돼 있다",
    killer.includes("자리 지정의 부정형") &&
      killer.includes("조건 줄에 모범답안 병기") &&
      killer.includes("표(파이프"),
  );
  check(
    "wave2[w2-6]: 출력 형식 스캐폴드가 무조건 인용을 지시하지 않는다",
    !killer.includes("<조건 1 — 영어 표현은 반드시 작은따옴표로 감쌀 것>") &&
      killer.includes("구문·문법 용어에는 따옴표 금지"),
  );
}

// [w2-1/w2-8] 학생 표면(student-safe) 축 — 조건 배열에 정답·마크다운이 새면 안 된다.
{
  const leaked = gateOf(
    GOOD.replace(
      "- 총 20단어로 쓸 것\n",
      "- 총 20단어로 쓸 것\n(예: Had it not been for the information art contains, these exhibits would merely imitate ...)\n",
    ),
  );
  check(
    "wave2[w2-1]: 조건 정답 누출 메시지가 자리(조건 N번)와 겹친 런을 지목한다(철칙 5)",
    leaked.some((i) => /조건 4번에 모범답안이 노출됨\(겹친 구간: "/.test(i)),
    leaked.join(" / "),
  );
  check(
    "wave2[w2-1]: 인용 토큰 자체는 누출로 치지 않는다(정상 조건 무발화)",
    gateOf(GOOD).length === 0,
    gateOf(GOOD).join(" / "),
  );
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
