// 요약문 완성 객관식(SUMMARY_COMPLETE_MC) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → 셔플 → 품질검증 왕복 +
// 과금 축까지. 실행: npx tsx scripts/_test-md-summary-mc.ts
//
// 형식 계약(규범 §1-B 철칙 1): 빈칸 정답을 따로 받는 줄이 **없다** —
// `정답:` 줄이 가리키는 선지의 값이 곧 각 빈칸의 정답이다. 그래서 검증기의
// summary-mc-correct-pair-mismatch 는 구조적으로 발생할 수 없다.
import {
  autoSnapSummaryMc,
  parseMdSummaryMc,
  summaryMcAnswerValues,
  type MdSummaryMcQuestion,
} from "../src/lib/md-qgen/parser-summary-mc";
import {
  gateMdSummaryMc,
  summaryMcGateAdvisories,
} from "../src/lib/md-qgen/gate-summary-mc";
import { adaptMdSummaryMcToAiQuestion } from "../src/lib/md-qgen/adapter-summary-mc";
import { SUMMARY_COMPLETE_MC_MD_LANE } from "../src/lib/md-qgen/lane-summary-mc";
import {
  buildMdSummaryMcPrompt,
  clampSummaryMcMdBlankCount,
} from "../src/lib/md-qgen/prompts-summary-mc";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "../src/lib/summary-complete-mc";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Playground designers once treated every scrape as a design failure, so they smoothed the ground, lowered the frames, and padded every edge. " +
  "Children who grow up on such surfaces rarely meet a hazard small enough to teach them anything at all. " +
  "Researchers who tracked school injuries found that the calmest looking yards produced the worst falls once pupils reached open ground. " +
  "The reason is that judging height, speed, and grip is a skill, and a skill only develops where it is exercised. " +
  "Removing the small risks removes the practice, and the practice is what keeps a young body upright. " +
  "Protection, in other words, can quietly manufacture the very fragility it promises to prevent.";

const SUMMARY =
  "By engineering hazards out of play spaces, adults leave children (A) in the judgment that protects them, so safety itself becomes a source of (B).";

const GOOD = `요약문: ${SUMMARY}
① untrained …… vulnerability
② untrained …… independence
③ uninterested …… vulnerability
④ overprotected …… confidence
⑤ distracted …… boredom
정답: ①
해설: 지문은 위험을 전부 걷어낸 놀이터가 오히려 더 큰 사고를 낳는다고 밝힙니다. 위험 판단이 연습으로만 자라는 기술이라는 근거에서, 보호가 아이를 훈련되지 않은 상태로 남겨 취약성의 원인이 된다는 요약이 도출됩니다.
오답:
② 앞칸은 맞지만 지문은 보호의 귀결을 자립이 아니라 취약성으로 규정하므로 뒷칸이 어긋납니다.
③ 뒷칸은 맞지만 지문이 말하는 결핍은 흥미가 아니라 판단 훈련이므로 앞칸이 어긋납니다.
④ 지문은 보호가 자신감을 준다고 말한 적이 없으며 두 값 모두 인과 방향이 뒤집혔습니다.
⑤ 산만함과 지루함은 지문에 근거가 없는 소재라 요약문의 인과 축과 무관합니다.`;

function gateOf(text: string, blankCount = 2): string[] {
  const q = autoSnapSummaryMc(parseMdSummaryMc(text)).question;
  return gateMdSummaryMc(q, PASSAGE, { blankCount });
}

function ctxOf(blankCount: number, rawTypeSettings: unknown = null): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { summaryCompleteMcBlankCount: blankCount },
    rawTypeSettings,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdSummaryMc(GOOD);
check("파싱: 요약문 한 줄 복원", parsed.summary === SUMMARY, parsed.summary);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check(
  "파싱: 값 2개씩 분해",
  parsed.options.every((o) => o.values.length === 2),
  JSON.stringify(parsed.options.map((o) => o.values)),
);
check("파싱: 정답 ①", parsed.answer === "①", parsed.answer);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 해설 존재·정답줄 미포함", parsed.explanation.length > 20 && !parsed.explanation.includes("정답:"));
check(
  "파생: 빈칸 정답 = 정답 선지의 값(유일 진실원)",
  summaryMcAnswerValues(parsed).join("|") === "untrained|vulnerability",
  summaryMcAnswerValues(parsed).join("|"),
);

const snapped = autoSnapSummaryMc(parsed);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린",
  gateMdSummaryMc(snapped.question, PASSAGE, { blankCount: 2 }).length === 0,
  gateMdSummaryMc(snapped.question, PASSAGE, { blankCount: 2 }).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전 불변식
// ───────────────────────────────────────────────────────────────────────────
const REJECTS: [name: string, text: string, needle: string][] = [
  ["요약문 누락", GOOD.replace(`요약문: ${SUMMARY}\n`, ""), "요약문 누락"],
  ["선지 4개", GOOD.replace("⑤ distracted …… boredom\n", ""), "선지 4개"],
  [
    "요약문에 (B) 없음",
    GOOD.replace("a source of (B).", "a source of harm."),
    "빈칸 라벨",
  ],
  [
    "요약문에 (A) 2회",
    GOOD.replace("a source of (B).", "a source of (A) and (B)."),
    "회 등장",
  ],
  [
    "설정 범위 밖 라벨 (C)",
    GOOD.replace("a source of (B).", "a source of (B) and (C)."),
    "설정 범위 밖",
  ],
  [
    "라벨 순서 역전",
    GOOD.replace("children (A) in the judgment", "children (B) in the judgment").replace(
      "a source of (B).",
      "a source of (A).",
    ),
    "순서",
  ],
  [
    "요약문 한국어 혼입",
    GOOD.replace("a source of (B).", "a source of (B) 취약성."),
    "한국어가 섞임",
  ],
  [
    "요약문 종결부호 없음(절단)",
    GOOD.replace("a source of (B).", "a source of (B)"),
    "종결 부호",
  ],
  [
    "요약문 두 문장",
    GOOD.replace(
      "protects them, so safety itself becomes",
      "protects them. Safety itself becomes",
    ),
    "두 문장",
  ],
  [
    "요약문 과소 분량",
    GOOD.replace(SUMMARY, "Adults leave children (A) and (B)."),
    "짧음",
  ],
  [
    "요약문이 지문을 연속 복사",
    GOOD.replace(
      SUMMARY,
      "Because judging height speed and grip is a skill and a skill only develops where it is exercised, children stay (A) and grow (B).",
    ),
    "연속 8단어",
  ],
  [
    "값 구분자 누락(값 1개)",
    GOOD.replace("① untrained …… vulnerability", "① untrained vulnerability"),
    "값 1개",
  ],
  [
    "값에 한국어",
    GOOD.replace("④ overprotected …… confidence", "④ overprotected …… 자신감"),
    "한국어가 섞임",
  ],
  [
    "값이 과도하게 긺",
    GOOD.replace(
      "⑤ distracted …… boredom",
      "⑤ distracted …… a very long and rambling explanatory phrase here",
    ),
    "단어로 김",
  ],
  [
    "열 값이 전부 동일",
    GOOD.replace("③ uninterested …… vulnerability", "③ untrained …… vulnerability")
      .replace("④ overprotected …… confidence", "④ untrained …… confidence")
      .replace("⑤ distracted …… boredom", "⑤ untrained …… boredom"),
    "열의 값이 전부 동일",
  ],
  [
    "열 병렬 위반(길이 편차)",
    GOOD.replace(
      "⑤ distracted …… boredom",
      "⑤ distracted …… a quiet loss of nerve",
    ),
    "열 병렬 위반",
  ],
  [
    "조합 중복",
    GOOD.replace("⑤ distracted …… boredom", "⑤ overprotected …… confidence"),
    "조합 중복",
  ],
  [
    "정답과 동일한 오답 조합",
    GOOD.replace("⑤ distracted …… boredom", "⑤ untrained …… vulnerability"),
    "완전히 동일",
  ],
  ["정답 누락", GOOD.replace("정답: ①\n", ""), "정답 누락"],
  [
    "정답 값이 요약문에 노출",
    GOOD.replace("a source of (B).", "a source of (B) vulnerability."),
    "그대로 노출됨",
  ],
  [
    "(A)만 맞는 반쪽 정답 부재",
    GOOD.replace("② untrained …… independence", "② overcautious …… independence"),
    "(A)만 정답",
  ],
  [
    "(B)만 맞는 반쪽 정답 부재",
    GOOD.replace("③ uninterested …… vulnerability", "③ uninterested …… fatigue"),
    "(B)만 정답",
  ],
  ["해설 누락", GOOD.replace(/^해설:.*$/m, ""), "해설 누락"],
  [
    "오답해설 3개",
    GOOD.replace(/^⑤ 산만함과.*$/m, ""),
    "오답해설 3개",
  ],
];
for (const [name, text, needle] of REJECTS) {
  const issues = gateOf(text);
  check(`게이트 반려: ${name}`, issues.some((i) => i.includes(needle)), issues.join(" / ") || "이슈 없음");
}

// 문장 계수는 검증기(countSentenceEndings)보다 보수적이다 — 검증기는 약어의
// 마침표까지 세어 warning 을 내지만, 게이트가 같은 기준을 쓰면 정상 문항을
// **반려**(=실제 생성비 손실)하게 된다. 경고는 무료, 오반려는 유료라 이쪽이 옳다.
check(
  "게이트: 약어(U.S.)를 문장 종결로 오인하지 않음",
  gateOf(GOOD.replace("adults leave children", "U.S. adults leave children")).length === 0,
  gateOf(GOOD.replace("adults leave children", "U.S. adults leave children")).join(" / "),
);
check(
  "게이트 반려: 정답 라벨이 선지에 없음",
  gateMdSummaryMc(
    {
      ...snapped.question,
      options: snapped.question.options.map((o) =>
        o.label === "①" ? { ...o, label: "⑤" } : o,
      ),
    },
    PASSAGE,
    { blankCount: 2 },
  ).some((i) => i.includes("정답 라벨")),
);
check(
  "게이트 반려: 오답해설에 정답 라벨 포함",
  gateMdSummaryMc(
    {
      ...snapped.question,
      wrong: [...snapped.question.wrong.slice(1), { label: "①", text: "정답인데 끼어듦" }],
    },
    PASSAGE,
    { blankCount: 2 },
  ).some((i) => i.includes("정답 라벨 포함")),
);
check(
  "게이트: requireWrong=false 면 오답해설 없어도 통과",
  gateMdSummaryMc({ ...snapped.question, wrong: [] }, PASSAGE, {
    blankCount: 2,
    requireWrong: false,
  }).length === 0,
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 5선지 + 게이트 클린이어야 한다.
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [name: string, from: string, to: string][] = [
  ["숫자 라벨 괄호", "① untrained …… vulnerability", "1) untrained …… vulnerability"],
  ["숫자 라벨 점", "② untrained …… independence", "2. untrained …… independence"],
  ["굵게 라벨", "③ uninterested …… vulnerability", "**③** uninterested …… vulnerability"],
  ["불릿 접두", "④ overprotected …… confidence", "- ④ overprotected …… confidence"],
  ["별표 불릿", "⑤ distracted …… boredom", "* ⑤ distracted …… boredom"],
  ["표 형식 행", "④ overprotected …… confidence", "| ④ overprotected …… confidence |"],
  ["구분자 점 3개", "① untrained …… vulnerability", "① untrained ... vulnerability"],
  ["구분자 말줄임표 1개", "② untrained …… independence", "② untrained … independence"],
  ["구분자 공백 과다", "③ uninterested …… vulnerability", "③ uninterested    ……    vulnerability"],
  ["구분자 파이프", "④ overprotected …… confidence", "④ overprotected | confidence"],
  ["구분자 슬래시", "⑤ distracted …… boredom", "⑤ distracted / boredom"],
  ["요약문 라벨 굵게", `요약문: ${SUMMARY}`, `**요약문:** ${SUMMARY}`],
  ["요약문 다음 줄 개행", `요약문: ${SUMMARY}`, `요약문:\n${SUMMARY}`],
  ["요약문 줄바꿈 접힘", `요약문: ${SUMMARY}`, `요약문: ${SUMMARY.replace("adults ", "adults\n")}`],
  ["정답 숫자 표기", "정답: ①", "정답: 1"],
  ["정답 굵게", "정답: ①", "정답: **①**"],
  ["정답 괄호 표기", "정답: ①", "정답: (1)"],
  ["오답 숫자 라벨", "② 앞칸은 맞지만", "2) 앞칸은 맞지만"],
  ["오답 헤더 뒤 공백", "오답:\n", "오답: \n"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdSummaryMc(drifted);
  const issues = gateOf(drifted);
  check(
    `드리프트 관용: ${name}`,
    q.options.length === 5 && issues.length === 0,
    `선지 ${q.options.length}개 · ${issues.join(" / ")}`,
  );
}

// 과잉 관용 방지 — 라벨 없는 산문 줄·해설 속 번호 목록을 선지로 오인하지 않는다.
check(
  "과잉 관용 방지: 산문 줄 무시",
  parseMdSummaryMc(GOOD.replace("① untrained", "Below are the five pairs.\n① untrained")).options
    .length === 5,
);
check(
  "과잉 관용 방지: 해설 속 번호 목록 무시",
  parseMdSummaryMc(
    GOOD.replace("해설: 지문은", "해설: 1. 지문은"),
  ).options.length === 5,
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정
// ───────────────────────────────────────────────────────────────────────────
{
  const s = autoSnapSummaryMc(
    parseMdSummaryMc(GOOD.replace("children (A) in", "children （a） in")),
  );
  check(
    "스냅: 전각·소문자 라벨을 (A) 정본으로",
    s.question.summary.includes("children (A) in") && s.corrections.length === 1,
    s.corrections.join(" / "),
  );
  check("스냅 후 게이트 클린(라벨 정규화)", gateMdSummaryMc(s.question, PASSAGE, { blankCount: 2 }).length === 0);
}
{
  const s = autoSnapSummaryMc(
    parseMdSummaryMc(GOOD.replace("(A) in the judgment", "(A) _____ in the judgment")),
  );
  check(
    "스냅: 라벨 뒤 빈칸선 제거",
    !s.question.summary.includes("_____") && s.corrections.some((c) => c.includes("빈칸선")),
    s.question.summary,
  );
  check("스냅 후 게이트 클린(빈칸선)", gateMdSummaryMc(s.question, PASSAGE, { blankCount: 2 }).length === 0);
}
{
  const s = autoSnapSummaryMc(
    parseMdSummaryMc(
      GOOD.replace("① untrained …… vulnerability", "① (A) untrained …… (B) \"vulnerability\""),
    ),
  );
  check(
    "스냅: 값의 라벨 접두·따옴표 제거",
    s.question.options[0].values.join("|") === "untrained|vulnerability",
    s.question.options[0].values.join("|"),
  );
  check("스냅 후 게이트 클린(값 장식)", gateMdSummaryMc(s.question, PASSAGE, { blankCount: 2 }).length === 0);
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → 후처리 → 셔플 → 품질검증 왕복
// ───────────────────────────────────────────────────────────────────────────
const adapt = adaptMdSummaryMcToAiQuestion(snapped.question, "KILLER", 2);
check("어댑터: 성공", adapt.ok === true, adapt.error);
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
check(
  "어댑터: 발문이 프로덕션 고정 문자열",
  ai.direction === "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
  String(ai.direction),
);
check("어댑터: summaryWithBlanks 축자 전달", ai.summaryWithBlanks === SUMMARY);
check(
  "어댑터: blanks 가 정답 선지 값에서 파생",
  JSON.stringify(ai.blanks) ===
    JSON.stringify([
      { label: "(A)", answer: "untrained" },
      { label: "(B)", answer: "vulnerability" },
    ]),
  JSON.stringify(ai.blanks),
);
{
  const options = ai.options as Array<Record<string, unknown>>;
  check("어댑터: 선지 라벨 숫자 축 '1'~'5'", options[0].label === "1" && options[4].label === "5");
  check(
    "어댑터: text 를 계약 구분자로 재조립",
    options[0].text === "untrained …… vulnerability",
    String(options[0].text),
  );
  check(
    "어댑터: blankValues 라벨·순서",
    JSON.stringify(options[1].blankValues) ===
      JSON.stringify([
        { label: "(A)", value: "untrained" },
        { label: "(B)", value: "independence" },
      ]),
    JSON.stringify(options[1].blankValues),
  );
  check("어댑터: blankA/blankB 호환 필드", options[2].blankA === "uninterested" && options[2].blankB === "vulnerability");
  check("어댑터: correctAnswer '1'", ai.correctAnswer === "1", String(ai.correctAnswer));
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 이물 필드 없음(지문 파생 필드 미생성)",
    !("passageWithBlank" in ai) &&
      !("passageWithMarkers" in ai) &&
      !("originalExpression" in ai) &&
      !("markedWords" in ai),
  );
}

const pp = postProcessQuestion("SUMMARY_COMPLETE_MC", PASSAGE, ai as never);
check("후처리: 성공(PASSTHROUGH)", pp.success === true, pp.error);
const ppData = (pp.data ?? {}) as Record<string, unknown>;
check(
  "후처리: wrongOptionExplanations Record 정규화",
  !Array.isArray(ppData.wrongOptionExplanations) &&
    typeof ppData.wrongOptionExplanations === "object" &&
    Object.keys(ppData.wrongOptionExplanations as Record<string, unknown>).join(",") === "2,3,4,5",
  JSON.stringify(ppData.wrongOptionExplanations),
);

// 학생 표면 — 저장 정본은 라벨만이고 빈칸선은 표시 계층이 붙인다.
{
  const display = formatSummaryCompleteMcSummaryForDisplay(
    String(ppData.summaryWithBlanks),
    readSummaryBlankAnswersFromQuestionLike(ppData),
  );
  check(
    "학생 표면: (A) _____ 빈칸선 부착 · 정답 미노출",
    display.includes("(A) _____") &&
      display.includes("(B) _____") &&
      !display.includes("untrained") &&
      !display.includes("vulnerability"),
    display,
  );
}

function qualityErrors(question: Record<string, unknown>): string[] {
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...SUMMARY_COMPLETE_MC_MD_LANE.qualityArgs(ctxOf(2)),
  })
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.code}: ${issue.message}`);
}
check("품질검증: error 0건(후처리 직후)", qualityErrors(ppData).length === 0, qualityErrors(ppData).join(" / "));

// 셔플 상호작용 — 이 유형은 SHUFFLE_OPTION_TYPES 멤버라 저장 직전 재배열된다.
let shuffleOk = true;
let shuffleDetail = "";
for (let i = 0; i < 20; i += 1) {
  const shuffled = shuffleQuestionOptionsForDiversity({ ...ppData }, "SUMMARY_COMPLETE_MC");
  const options = shuffled.options as Array<Record<string, unknown>>;
  const answerLabel = String(shuffled.correctAnswer);
  const answerOption = options.find((o) => o.label === answerLabel);
  const values = (answerOption?.blankValues ?? []) as Array<Record<string, unknown>>;
  const labelsOk = options.map((o) => o.label).join(",") === "1,2,3,4,5";
  const pairOk =
    values.map((v) => String(v.value)).join("|") === "untrained|vulnerability" &&
    answerOption?.text === "untrained …… vulnerability" &&
    answerOption?.blankA === "untrained";
  const explanations = shuffled.wrongOptionExplanations as Record<string, string>;
  const explOk = !Object.keys(explanations).includes(answerLabel) && Object.keys(explanations).length === 4;
  if (!labelsOk || !pairOk || !explOk) {
    shuffleOk = false;
    shuffleDetail = JSON.stringify({ answerLabel, values, explKeys: Object.keys(explanations) });
    break;
  }
  if (qualityErrors(shuffled).length > 0) {
    shuffleOk = false;
    shuffleDetail = qualityErrors(shuffled).join(" / ");
    break;
  }
}
check("셔플: 정답·blankValues·오답해설 동행(20회)", shuffleOk, shuffleDetail);

// ───────────────────────────────────────────────────────────────────────────
// 6. 다중 빈칸(3칸) 경로
// ───────────────────────────────────────────────────────────────────────────
const SUMMARY3 =
  "By engineering hazards out of play spaces, adults leave children (A) in the judgment that protects them, so safety becomes a source of (B) rather than a mark of (C).";
const GOOD3 = `요약문: ${SUMMARY3}
① untrained …… vulnerability …… competence
② untrained …… vulnerability …… boredom
③ untrained …… independence …… competence
④ uninterested …… vulnerability …… competence
⑤ distracted …… boredom …… convenience
정답: ①
해설: 지문은 작은 위험을 없앨수록 판단 연습이 사라진다고 밝힙니다. 그 결과 보호가 아이를 훈련되지 않은 상태로 남겨 유능함이 아니라 취약성의 원인이 된다는 요약이 도출됩니다.
오답:
② 앞의 두 칸은 맞지만 마지막 칸의 지루함은 지문의 논지와 무관합니다.
③ 가운데 칸이 자립으로 뒤집혀 보호의 귀결을 반대로 진술합니다.
④ 첫 칸의 결핍이 흥미로 바뀌어 지문이 말한 판단 훈련의 결핍과 어긋납니다.
⑤ 세 칸 모두 지문에 근거가 없는 소재로 채워졌습니다.`;

{
  const q3 = autoSnapSummaryMc(parseMdSummaryMc(GOOD3)).question;
  check("3칸: 값 3개씩 분해", q3.options.every((o) => o.values.length === 3));
  check(
    "3칸: 게이트 클린",
    gateMdSummaryMc(q3, PASSAGE, { blankCount: 3 }).length === 0,
    gateMdSummaryMc(q3, PASSAGE, { blankCount: 3 }).join(" / "),
  );
  check(
    "3칸: near-miss 없으면 반려",
    gateMdSummaryMc(
      autoSnapSummaryMc(
        parseMdSummaryMc(
          GOOD3.replace("② untrained …… vulnerability …… boredom", "② overcautious …… independence …… boredom")
            .replace("③ untrained …… independence …… competence", "③ overcautious …… boredom …… convenience")
            .replace("④ uninterested …… vulnerability …… competence", "④ distracted …… independence …… fatigue"),
        ),
      ).question,
      PASSAGE,
      { blankCount: 3 },
    ).some((i) => i.includes("near-miss")),
  );
  check(
    "3칸: blankCount 2로 검사하면 라벨 범위 반려",
    gateMdSummaryMc(q3, PASSAGE, { blankCount: 2 }).some((i) => i.includes("설정 범위 밖")),
  );
  const adapt3 = adaptMdSummaryMcToAiQuestion(q3, "INTERMEDIATE", 3);
  const ai3 = (adapt3.aiQuestion ?? {}) as Record<string, unknown>;
  check("3칸: 어댑터 성공", adapt3.ok === true, adapt3.error);
  check(
    "3칸: 발문에 (C) 포함",
    String(ai3.direction).includes("(A), (B), (C)"),
    String(ai3.direction),
  );
  check(
    "3칸: blanks 3개 파생",
    JSON.stringify(ai3.blanks) ===
      JSON.stringify([
        { label: "(A)", answer: "untrained" },
        { label: "(B)", answer: "vulnerability" },
        { label: "(C)", answer: "competence" },
      ]),
    JSON.stringify(ai3.blanks),
  );
  const pp3 = postProcessQuestion("SUMMARY_COMPLETE_MC", PASSAGE, ai3 as never);
  const errors3 = validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: pp3.data,
    passage: PASSAGE,
    requestedDifficulty: "INTERMEDIATE",
    ...SUMMARY_COMPLETE_MC_MD_LANE.qualityArgs(ctxOf(3)),
  }).filter((issue) => issue.severity === "error");
  check("3칸: 품질검증 error 0건", errors3.length === 0, errors3.map((e) => e.code).join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금·적격성·난이도 3분기·설정 집행
// ───────────────────────────────────────────────────────────────────────────
check("레인: subType SUMMARY_COMPLETE_MC", SUMMARY_COMPLETE_MC_MD_LANE.subType === "SUMMARY_COMPLETE_MC");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (fast getOperationType 동기)",
  SUMMARY_COMPLETE_MC_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE > 0,
  String(SUMMARY_COMPLETE_MC_MD_LANE.operationType),
);
check("레인: retryEligible", SUMMARY_COMPLETE_MC_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 2~4 · 범위 밖 거부",
  SUMMARY_COMPLETE_MC_MD_LANE.isEligible({ summaryCompleteMcBlankCount: 2 }) &&
    SUMMARY_COMPLETE_MC_MD_LANE.isEligible({ summaryCompleteMcBlankCount: 4 }) &&
    SUMMARY_COMPLETE_MC_MD_LANE.isEligible({}) &&
    !SUMMARY_COMPLETE_MC_MD_LANE.isEligible({ summaryCompleteMcBlankCount: 5 }) &&
    !SUMMARY_COMPLETE_MC_MD_LANE.isEligible({ summaryCompleteMcBlankCount: 1 }) &&
    !SUMMARY_COMPLETE_MC_MD_LANE.isEligible({ blankCount: 9 }),
);
check(
  "레인: parseAndGate 클린 + corrections 전달",
  SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(GOOD, ctxOf(2)).gateIssues.length === 0,
  SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(GOOD, ctxOf(2)).gateIssues.join(" / "),
);
check(
  "레인: adapt 성공",
  SUMMARY_COMPLETE_MC_MD_LANE.adapt(
    SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(GOOD, ctxOf(2)),
    ctxOf(2),
  ).ok === true,
);
check(
  "레인: qualityArgs 언어 축",
  JSON.stringify(SUMMARY_COMPLETE_MC_MD_LANE.qualityArgs(ctxOf(2))) ===
    JSON.stringify({ stemLanguage: "ko", optionLanguage: "en" }),
  JSON.stringify(SUMMARY_COMPLETE_MC_MD_LANE.qualityArgs(ctxOf(2))),
);
check(
  "레인: mdFormat 포렌식 메타",
  JSON.stringify(SUMMARY_COMPLETE_MC_MD_LANE.mdFormat(ctxOf(3))) ===
    JSON.stringify({ blankCount: 3, optionCount: 5 }),
  JSON.stringify(SUMMARY_COMPLETE_MC_MD_LANE.mdFormat(ctxOf(3))),
);
check(
  "레인: diversityTargets = blanks[].answer",
  SUMMARY_COMPLETE_MC_MD_LANE.diversityTargets({
    blanks: [{ answer: "untrained" }, { answer: "vulnerability" }],
  }).join(",") === "untrained,vulnerability",
);
check("레인: diversityTargets 이물 입력 안전", SUMMARY_COMPLETE_MC_MD_LANE.diversityTargets({}).length === 0);
{
  const enCtx = ctxOf(2, { SUMMARY_COMPLETE_MC: { stemLanguage: "en" } });
  check(
    "설정 집행: 발문 영어 블록 주입",
    SUMMARY_COMPLETE_MC_MD_LANE.buildExtras(enCtx).some((e) => e.includes("질문 언어")),
  );
  check("설정 집행: 기본(ko)은 블록 없음", SUMMARY_COMPLETE_MC_MD_LANE.buildExtras(ctxOf(2)).length === 0);
  const enAdapt = SUMMARY_COMPLETE_MC_MD_LANE.adapt(
    SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(GOOD, enCtx),
    enCtx,
  );
  check(
    "설정 집행: 영어 발문 치환",
    String((enAdapt.aiQuestion ?? {}).direction).startsWith("Which set of words"),
    String((enAdapt.aiQuestion ?? {}).direction),
  );
  check(
    "설정 집행: qualityArgs.stemLanguage en 반영",
    (SUMMARY_COMPLETE_MC_MD_LANE.qualityArgs(enCtx) as { stemLanguage: string }).stemLanguage === "en",
  );
}

// 프롬프트 — 난이도 3분기 · 형식 리터럴 · 단일 진실원 계약
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdSummaryMcPrompt(PASSAGE, "full", d, { blankCount: 2 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 형식 리터럴 + 지문 포함`,
    p.includes("## 출력 형식") &&
      p.includes("요약문:") &&
      p.includes("① <(A)값> …… <(B)값>") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
{
  const basic = buildMdSummaryMcPrompt(PASSAGE, "full", "BASIC");
  const killer = buildMdSummaryMcPrompt(PASSAGE, "full", "KILLER");
  check("프롬프트: BASIC 은 few-shot 생략", !basic.includes("모범 설계 해부"));
  check("프롬프트: KILLER 는 few-shot 포함", killer.includes("모범 설계 해부"));
  check("프롬프트: 난이도별 설계 절이 다르다", basic.includes("기본 난이도") && killer.includes("KILLER 의 생명"));
  check(
    "프롬프트: 빈칸 정답 전용 줄을 요구하지 않는다(단일 진실원)",
    !killer.includes("빈칸정답:") &&
      !killer.includes("정답값:") &&
      killer.includes("빈칸 정답을 따로 적는 줄을 만들지 마라"),
  );
  check(
    "프롬프트: answer-only 모드는 오답 섹션 미요구",
    !buildMdSummaryMcPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n①"),
  );
  const p4 = buildMdSummaryMcPrompt(PASSAGE, "full", "KILLER", { blankCount: 4 });
  check("프롬프트: 4칸 스캐폴드 (D) 포함", p4.includes("<(D)값>") && p4.includes("(A), (B), (C), (D)"));
  check(
    "프롬프트: blankCount 클램프(1→2, 9→4)",
    buildMdSummaryMcPrompt(PASSAGE, "full", "KILLER", { blankCount: 1 }).includes("① <(A)값> …… <(B)값>") &&
      buildMdSummaryMcPrompt(PASSAGE, "full", "KILLER", { blankCount: 9 }).includes("<(D)값>"),
  );
  check(
    "클램프 함수: 1→2 · 9→4 · 비수치→2",
    clampSummaryMcMdBlankCount(1) === 2 &&
      clampSummaryMcMdBlankCount(9) === 4 &&
      clampSummaryMcMdBlankCount("x") === 2,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 적대검수 1기 회귀 픽스처 (2026-07-26)
//    각 블록은 지적서 .wave2-findings/summary-mc.json 의 실측 결함을 그대로 재현한다.
// ───────────────────────────────────────────────────────────────────────────

// ── F1 (critical · silent-drop): GFM 표 행에서 라벨/값 셀 사이 파이프 ────────
// 꼬리 파이프만 지우던 반쪽 관용 탓에 (A) 값 앞에 "| " 가 남아, 게이트·검증기·
// 표시 계층을 전부 통과한 채 blanks[0].answer="| untrained" 가 저장·인쇄됐다.
{
  const TABLE_CELL = GOOD.replace(
    "① untrained …… vulnerability",
    "| ① | untrained …… vulnerability |",
  );
  const q = autoSnapSummaryMc(parseMdSummaryMc(TABLE_CELL)).question;
  check(
    "F1 표 셀 파이프: 값에 '| ' 잔재 없음",
    q.options[0].values.join("|") === "untrained|vulnerability",
    JSON.stringify(q.options[0].values),
  );
  check("F1 표 셀 파이프: 게이트 클린", gateOf(TABLE_CELL).length === 0, gateOf(TABLE_CELL).join(" / "));
  const a = adaptMdSummaryMcToAiQuestion(q, "KILLER", 2);
  check(
    "F1 표 셀 파이프: 어댑터 정답 키 무오염",
    JSON.stringify(a.aiQuestion?.blanks) ===
      JSON.stringify([
        { label: "(A)", answer: "untrained" },
        { label: "(B)", answer: "vulnerability" },
      ]),
    JSON.stringify(a.aiQuestion?.blanks),
  );

  // 값마다 셀을 나눈 표 행도 같은 결과여야 한다.
  const PER_CELL = GOOD.replace(
    "② untrained …… independence",
    "| ② | untrained | independence |",
  );
  check(
    "F1 표 셀 분리 행: 값 2개 정상 분해 + 게이트 클린",
    autoSnapSummaryMc(parseMdSummaryMc(PER_CELL)).question.options[1].values.join("|") ===
      "untrained|independence" && gateOf(PER_CELL).length === 0,
    gateOf(PER_CELL).join(" / "),
  );

  // 관용이 다시 새면 게이트가 자리를 지목한다(무음 오염 → 유음 반려).
  check(
    "F1 게이트: 값에 남은 '|' 를 자리 지목",
    gateMdSummaryMc(
      {
        ...snapped.question,
        options: snapped.question.options.map((o, i) =>
          i === 0 ? { ...o, values: ["| untrained", "vulnerability"] } : o,
        ),
      },
      PASSAGE,
      { blankCount: 2 },
    ).some((issue) => issue.includes("표 구분자 '|' 가 남아 있음")),
  );
}

// ── F2 (major · silent-drop): 키워드 줄 무관용 ───────────────────────────────
// 선지·데이터 줄은 관대하게 파싱하면서 `해설:` `오답:` 만 무관용이면, 모델이
// 헤더를 굵게/헤딩으로 쓰는 순간 필드가 통째로 사라지고 게이트가 "해설 누락"
// 이라는 **사실과 다른 원인**을 재생성 프롬프트에 실어 보낸다.
const KEYWORD_DRIFTS: [name: string, from: string, to: string][] = [
  ["해설 굵게", "해설:", "**해설:**"],
  ["해설 굵게(콜론 밖)", "해설:", "**해설**:"],
  ["해설 헤딩", "해설:", "### 해설:"],
  ["해설 전각 콜론", "해설:", "해설："],
  ["오답 굵게", "오답:", "**오답:**"],
  ["오답 헤딩", "오답:", "## 오답:"],
  ["오답 전각 콜론", "오답:", "오답："],
  ["오답 불릿", "오답:", "- 오답:"],
  ["정답 굵게(헤더)", "정답: ①", "**정답:** ①"],
  ["정답 헤딩", "정답: ①", "#### 정답: ①"],
  ["정답 불릿", "정답: ①", "* 정답: ①"],
  ["정답 전각 콜론", "정답: ①", "정답： ①"],
  ["요약문 헤딩", "요약문:", "## 요약문:"],
  ["요약문 전각 콜론", "요약문:", "요약문："],
  ["요약문 불릿", "요약문:", "- 요약문:"],
];
for (const [name, from, to] of KEYWORD_DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdSummaryMc(drifted);
  const issues = gateOf(drifted);
  check(
    `F2 키워드 줄 관용: ${name}`,
    q.summary === SUMMARY &&
      q.answer === "①" &&
      q.explanation.length > 20 &&
      q.wrong.length === 4 &&
      issues.length === 0,
    `요약문 ${q.summary === SUMMARY} · 정답 '${q.answer}' · 해설 ${q.explanation.length}자 · 오답 ${q.wrong.length}개 · ${issues.join(" / ")}`,
  );
}
{
  // 네 섹션이 동시에 흔들리는 실측 최악 케이스.
  const ALL = GOOD.replace("요약문:", "**요약문：**")
    .replace("정답: ①", "- **정답**： ①")
    .replace("해설:", "### **해설:**")
    .replace("오답:", "> **오답** ：");
  const q = parseMdSummaryMc(ALL);
  check(
    "F2 키워드 줄 관용: 네 섹션 동시 드리프트",
    q.summary === SUMMARY &&
      q.answer === "①" &&
      q.explanation.length > 20 &&
      q.wrong.length === 4 &&
      gateOf(ALL).length === 0,
    `정답 '${q.answer}' · 해설 ${q.explanation.length}자 · 오답 ${q.wrong.length}개 · ${gateOf(ALL).join(" / ")}`,
  );
  // 관용이 과하면 안 된다 — 해설 본문이 `정답:` 라인을 삼키면 학생 표면에 정답이 박힌다.
  check(
    "F2 과잉 관용 방지: 해설이 정답 줄을 흡수하지 않음",
    !q.explanation.includes("①") && !q.explanation.includes("정답"),
    q.explanation,
  );
}

// ── F5 (major · silent-drop): 값 라벨을 열 위치와 대조하지 않고 삭제 ─────────
{
  const FLIPPED = GOOD.replace(
    "⑤ distracted …… boredom",
    "⑤ (B) boredom …… (A) distracted",
  );
  const s = autoSnapSummaryMc(parseMdSummaryMc(FLIPPED));
  check(
    "F5 라벨 역전(오답 행): 라벨 기준 재정렬",
    s.question.options[4].values.join("|") === "distracted|boredom",
    s.question.options[4].values.join("|"),
  );
  check(
    "F5 라벨 역전: corrections 에 기록",
    s.corrections.some((c) => c.includes("재정렬")),
    s.corrections.join(" / "),
  );
  check(
    "F5 라벨 역전: 재정렬 후 text 도 동행",
    s.question.options[4].text === "distracted …… boredom",
    s.question.options[4].text,
  );
  check(
    "F5 라벨 역전: 게이트 클린",
    gateMdSummaryMc(s.question, PASSAGE, { blankCount: 2 }).length === 0,
    gateMdSummaryMc(s.question, PASSAGE, { blankCount: 2 }).join(" / "),
  );

  // 정답 행이 뒤집히면 종전에는 "(A)만 정답 …없음"·"(B)만 정답 …없음" 두 줄만
  // 외쳐 진짜 원인을 은폐했다(재생성 피드백이 엉뚱한 방향을 지시).
  const FLIPPED_ANSWER = GOOD.replace(
    "① untrained …… vulnerability",
    "① (B) vulnerability …… (A) untrained",
  );
  const sa = autoSnapSummaryMc(parseMdSummaryMc(FLIPPED_ANSWER));
  check(
    "F5 라벨 역전(정답 행): 재정렬 후 게이트 클린",
    sa.question.options[0].values.join("|") === "untrained|vulnerability" &&
      gateMdSummaryMc(sa.question, PASSAGE, { blankCount: 2 }).length === 0,
    gateMdSummaryMc(sa.question, PASSAGE, { blankCount: 2 }).join(" / "),
  );

  // 애매한 라벨(중복·부분)은 손대지 않고 게이트가 자리를 지목한다.
  for (const [name, to] of [
    ["라벨 중복", "⑤ (A) distracted …… (A) boredom"],
    ["부분 라벨", "⑤ distracted …… (A) boredom"],
  ] as const) {
    const issues = gateOf(GOOD.replace("⑤ distracted …… boredom", to));
    check(
      `F5 ${name}: 게이트가 자리를 지목`,
      issues.some((i) => i.includes("⑤ 2번째 값의 라벨이 (A) — 그 자리는 (B) 값이어야 함")),
      issues.join(" / ") || "이슈 없음",
    );
  }
  check(
    "F5 과잉 반응 방지: 정상 라벨 접두는 무반응",
    gateOf(
      GOOD.replace("① untrained …… vulnerability", "① (A) untrained …… (B) vulnerability"),
    ).length === 0,
  );
}

// ── F3/F4 (major · gate-gap): 차단 예산 재배치 ──────────────────────────────
// 지문·요약문이 자동화 판단 주제여야 의미장(semantic family) 검사가 작동한다.
const PASSAGE_K =
  "When a hospital replaced its triage nurses with a scoring model, the board described the change as a purely technical upgrade. " +
  "The model, however, encoded a long series of contested choices about which symptoms should count as urgent. " +
  "Those choices had once been argued about in the open, in front of patients who could push back on them. " +
  "Now they sit inside a formula that nobody on the ward is authorised to question or to revise. " +
  "The machine did not dissolve the hard call; it moved that call upstream, to the small team that wrote the rules.";
const SUMMARY_K =
  "Automating a triage decision buries a (A) choice inside a (B) rule that no one on the ward may question.";
const KILLER_STRONG = `요약문: ${SUMMARY_K}
① moral …… technical
② moral …… algorithmic
③ ethical …… technical
④ hurried …… seasonal
⑤ playful …… weather
정답: ①
해설: 지문은 채점 모델 도입이 순수한 기술 개선처럼 소개됐다고 밝힙니다. 그러나 무엇을 응급으로 볼지에 대한 다툼 있는 선택이 규칙 안에 묻혔다는 근거에서, 도덕적 선택이 기술적 규칙에 감춰졌다는 요약이 도출됩니다.
오답:
② 앞칸은 맞지만 뒷칸은 같은 기술 계열이면서도 규칙의 성격을 알고리즘 자체로 좁혀 지문의 층위와 어긋납니다.
③ 뒷칸은 맞지만 앞칸은 정답과 같은 의미장의 근접어일 뿐 지문이 다투는 선택의 성격과 어긋납니다.
④ 두 값 모두 지문 근거가 없는 소재입니다.
⑤ 두 값 모두 지문 논지와 무관한 장식입니다.`;

function gateK(text: string, difficulty: string): string[] {
  return gateMdSummaryMc(autoSnapSummaryMc(parseMdSummaryMc(text)).question, PASSAGE_K, {
    blankCount: 2,
    difficulty,
  });
}

check(
  "F3 KILLER 함정 강도: 양쪽 강함 → 게이트 클린",
  gateK(KILLER_STRONG, "KILLER").length === 0,
  gateK(KILLER_STRONG, "KILLER").join(" / "),
);
{
  // 게이트 클린 == 검증기 KILLER 함정 코드 0건 (판정 축을 공유하므로 구조적 보장).
  const q = autoSnapSummaryMc(parseMdSummaryMc(KILLER_STRONG)).question;
  const a = adaptMdSummaryMcToAiQuestion(q, "KILLER", 2);
  const ppK = postProcessQuestion("SUMMARY_COMPLETE_MC", PASSAGE_K, a.aiQuestion as never);
  const errors = validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: ppK.data,
    passage: PASSAGE_K,
    requestedDifficulty: "KILLER",
    ...SUMMARY_COMPLETE_MC_MD_LANE.qualityArgs(ctxOf(2)),
  }).filter((issue) => issue.severity === "error");
  check(
    "F3 KILLER 함정 강도: 게이트 클린 문항은 검증기 error 0건",
    errors.length === 0,
    errors.map((e) => e.code).join(" / "),
  );
}
// 종전에는 아래 두 케이스가 md 게이트 CLEAN 으로 통과해 SHIP_FIRST 밖 error 를
// 달고 그대로 출하됐다(검증기는 md 레인에서 차단하지 않는다).
{
  const WEAK_B = KILLER_STRONG.replace("② moral …… algorithmic", "② moral …… boredom");
  check(
    "F3 KILLER: 정답 (A)에 붙은 (B) 함정이 약하면 반려",
    gateK(WEAK_B, "KILLER").some((i) => i.includes("정답 (A) 'moral' 와 짝지은")),
    gateK(WEAK_B, "KILLER").join(" / ") || "이슈 없음",
  );
  const WEAK_A = KILLER_STRONG.replace("③ ethical …… technical", "③ hollow …… technical");
  check(
    "F3 KILLER: 정답 (B)에 붙은 (A) 함정이 약하면 반려",
    gateK(WEAK_A, "KILLER").some((i) => i.includes("정답 (B) 'technical' 와 짝지은")),
    gateK(WEAK_A, "KILLER").join(" / ") || "이슈 없음",
  );
  // 축이 갈라지면 fast 가 통과시키는 문항을 md 만 반려한다 — 검증기와 동일하게
  // BASIC/INTERMEDIATE 에서는 함정 강도를 묻지 않는다.
  check(
    "F3 비KILLER: 함정 강도는 묻지 않음(검증기 축과 동기)",
    gateK(WEAK_B, "BASIC").length === 0 && gateK(WEAK_B, "INTERMEDIATE").length === 0,
    `${gateK(WEAK_B, "BASIC").join(" / ")} | ${gateK(WEAK_B, "INTERMEDIATE").join(" / ")}`,
  );
}

// F4: 반쪽 정답 부재는 SHIP_FIRST 강등 코드(core.ts:61) — fast 는 정상 출하한다.
{
  const NO_HALF_B = GOOD.replace(
    "③ uninterested …… vulnerability",
    "③ uninterested …… fatigue",
  );
  const q = autoSnapSummaryMc(parseMdSummaryMc(NO_HALF_B)).question;
  for (const d of ["BASIC", "INTERMEDIATE"] as const) {
    check(
      `F4 ${d}: 반쪽 정답 부재는 비차단`,
      gateMdSummaryMc(q, PASSAGE, { blankCount: 2, difficulty: d }).length === 0,
      gateMdSummaryMc(q, PASSAGE, { blankCount: 2, difficulty: d }).join(" / "),
    );
    check(
      `F4 ${d}: 비차단 권고로 기록`,
      summaryMcGateAdvisories(q, { blankCount: 2, difficulty: d }).some((a) =>
        a.startsWith("참고(비차단): (B)만 정답"),
      ),
      summaryMcGateAdvisories(q, { blankCount: 2, difficulty: d }).join(" / ") || "없음",
    );
  }
  check(
    "F4 KILLER: 반쪽 정답 부재는 계속 하드 반려",
    gateMdSummaryMc(q, PASSAGE, { blankCount: 2, difficulty: "KILLER" }).some((i) =>
      i.includes("(B)만 정답"),
    ),
  );
  check(
    "F4 난이도 미지정 기본값은 엄격(KILLER)",
    gateMdSummaryMc(q, PASSAGE, { blankCount: 2 }).some((i) => i.includes("(B)만 정답")),
  );
  check(
    "F4 정상 문항은 권고도 없음",
    summaryMcGateAdvisories(snapped.question, { blankCount: 2, difficulty: "BASIC" }).length === 0,
  );
  // 3칸 near-miss(검증기 severity=warning)도 같은 예산 규칙을 따른다.
  const NO_NEAR_MISS = GOOD3.replace(
    "② untrained …… vulnerability …… boredom",
    "② overcautious …… independence …… boredom",
  )
    .replace("③ untrained …… independence …… competence", "③ overcautious …… boredom …… convenience")
    .replace("④ uninterested …… vulnerability …… competence", "④ distracted …… independence …… fatigue");
  const q3nm = autoSnapSummaryMc(parseMdSummaryMc(NO_NEAR_MISS)).question;
  check(
    "F4 3칸 near-miss 부재: BASIC 비차단 + 권고 기록",
    gateMdSummaryMc(q3nm, PASSAGE, { blankCount: 3, difficulty: "BASIC" }).length === 0 &&
      summaryMcGateAdvisories(q3nm, { blankCount: 3, difficulty: "BASIC" }).some((a) =>
        a.includes("near-miss"),
      ),
    gateMdSummaryMc(q3nm, PASSAGE, { blankCount: 3, difficulty: "BASIC" }).join(" / "),
  );
}

// 레인 배선 — 난이도가 게이트까지 실제로 전달되는지(배선이 끊기면 위 검사가 전부 무의미).
{
  function ctxD(rawDifficulty: string): MdLaneContext {
    return { ...ctxOf(2), rawDifficulty, difficulty: "KILLER" };
  }
  const NO_HALF_B = GOOD.replace(
    "③ uninterested …… vulnerability",
    "③ uninterested …… fatigue",
  );
  check(
    "레인 배선: rawDifficulty=BASIC 이면 반려 없이 권고만",
    SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(NO_HALF_B, ctxD("BASIC")).gateIssues.length === 0 &&
      SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(NO_HALF_B, ctxD("BASIC")).corrections.some((c) =>
        c.startsWith("참고(비차단):"),
      ),
    JSON.stringify(SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(NO_HALF_B, ctxD("BASIC"))),
  );
  check(
    "레인 배선: rawDifficulty=KILLER 는 반려",
    SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(NO_HALF_B, ctxD("KILLER")).gateIssues.length > 0,
  );
  check(
    "레인 배선: 정상 문항은 KILLER 에서도 클린",
    SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(GOOD, ctxD("KILLER")).gateIssues.length === 0,
    SUMMARY_COMPLETE_MC_MD_LANE.parseAndGate(GOOD, ctxD("KILLER")).gateIssues.join(" / "),
  );
}

// 타입 가드 — 파싱 결과가 레인 계약 형상인지
const asQuestion: MdSummaryMcQuestion = snapped.question;
check("형상: kind 태그 summaryMc", asQuestion.kind === "summaryMc");

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
