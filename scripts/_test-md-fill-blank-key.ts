// 핵심 표현 빈칸(FILL_BLANK_KEY) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processFillBlankKey → validateQuestionQuality
// → buildAnswerSpec → gradeAnswer 까지 **채점 왕복**을 포함한다(서술형 계열의
// 핵심 축 — 견본 반의어에는 없는 추가 축).
// 실행: npx tsx scripts/_test-md-fill-blank-key.ts
//
// 형식 계약(3줄): `빈칸문장:` / `정답:` / `해설:`.
// 허용답 칸은 **두지 않는다** — 이 유형의 허용답 계약은 스키마상 "표기 변형만"
// 이고, 표기 변형은 전부 결정론으로 파생 가능하다. 칸을 없애 "모델이 동의어를
// 끼워 넣어 오답을 흡수하는" 되돌릴 수 없는 채점 사고를 구조적으로 소멸시켰다.
import {
  answerBoundaryRegex,
  autoSnapFillBlankKey,
  countFillBlankKeyAnswerOccurrences,
  expandFillBlankKeyContractions,
  fillBlankKeyFrameMatches,
  orthographicKey,
  parseMdFillBlankKey,
  restoreFillBlankKeySentence,
  type MdFillBlankKeyQuestion,
} from "../src/lib/md-qgen/parser-fill-blank-key";
import { gateMdFillBlankKey, internalSentenceBreaks } from "../src/lib/md-qgen/gate-fill-blank-key";
import {
  adaptMdFillBlankKeyToAiQuestion,
  buildFillBlankKeyAcceptedAnswers,
  deriveOrthographicVariants,
  FILL_BLANK_KEY_MD_DIRECTION,
  FILL_BLANK_KEY_MD_DIRECTION_EN,
} from "../src/lib/md-qgen/adapter-fill-blank-key";
import { FILL_BLANK_KEY_MD_LANE } from "../src/lib/md-qgen/lane-fill-blank-key";
import {
  buildMdFillBlankKeyPrompt,
  FILL_BLANK_KEY_MD_QUOTE_WORD_MAX,
} from "../src/lib/md-qgen/prompts-fill-blank-key";
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
  "Every laboratory keeps a drawer of experiments that never worked. " +
  "A researcher who reviews only her own notebook will read those failures as bad luck, because the mistake that produced them is invisible from the inside. " +
  "Colleagues, by contrast, arrive without that blind spot and attack the argument at exactly the joint where it was weakest. " +
  "What a lone researcher cannot supply for herself is the adversarial scrutiny that turns a private hunch into a public claim. " +
  "Science therefore advances less through individual brilliance than through the stubborn habit of letting other people look.";

const SWB =
  "What a lone researcher cannot supply for herself is the _____ that turns a private hunch into a public claim.";
const ANSWER = "adversarial scrutiny";
const EXPLANATION =
  "이 문장은 앞의 두 장면(혼자 보는 사람의 사각과 동료의 반박)을 하나의 개념으로 압축하는 자리입니다. 바로 앞 문장이 동료가 논증의 가장 약한 이음매를 공격한다고 서술하므로, 빈칸에는 그 공격적 검증 절차를 가리키는 표현이 들어갑니다.";

const GOOD = `빈칸문장: ${SWB}
정답: ${ANSWER}
해설: ${EXPLANATION}`;

function parsedOf(text: string): MdFillBlankKeyQuestion {
  return autoSnapFillBlankKey(parseMdFillBlankKey(text), PASSAGE).question;
}
function gateOf(text: string): string[] {
  return gateMdFillBlankKey(parsedOf(text), PASSAGE);
}
function q(overrides: Partial<MdFillBlankKeyQuestion>): MdFillBlankKeyQuestion {
  return {
    kind: "fill-blank-key",
    sentenceWithBlank: SWB,
    answer: ANSWER,
    acceptedAnswers: [],
    explanation: EXPLANATION,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
{
  const p = parseMdFillBlankKey(GOOD);
  check("파싱: 빈칸문장", p.sentenceWithBlank === SWB, p.sentenceWithBlank);
  check("파싱: 정답", p.answer === ANSWER, p.answer);
  check("파싱: 해설", p.explanation === EXPLANATION);
  check("파싱: 허용답 없음(요구하지 않는 칸)", p.acceptedAnswers.length === 0);
  const s = autoSnapFillBlankKey(p, PASSAGE);
  check("스냅: 정상 입력은 무보정", s.corrections.length === 0, s.corrections.join(" / "));
  check("게이트: 정상 입력 클린", gateOf(GOOD).length === 0, gateOf(GOOD).join(" / "));
  check("복원: 프레임이 지문에 축자 존재", fillBlankKeyFrameMatches(PASSAGE, SWB, ANSWER));
  check(
    "복원문: 정규화 후 마침표 절삭",
    restoreFillBlankKeySentence(SWB, ANSWER).endsWith("public claim"),
    restoreFillBlankKeySentence(SWB, ANSWER).slice(-30),
  );
  check("정답 지문 등장 1회", countFillBlankKeyAnswerOccurrences(PASSAGE, ANSWER) === 1);
}

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 검사 전종
// ───────────────────────────────────────────────────────────────────────────
const REJECTS: [string, MdFillBlankKeyQuestion, string][] = [
  ["빈칸문장 누락", q({ sentenceWithBlank: "" }), "빈칸문장 누락"],
  ["정답 누락", q({ answer: "" }), "정답 누락"],
  ["해설 누락", q({ explanation: "" }), "해설 누락"],
  [
    "빈칸 마커 없음",
    q({ sentenceWithBlank: SWB.replace("_____", "adversarial scrutiny") }),
    "빈칸 마커",
  ],
  [
    "빈칸 2개",
    q({ sentenceWithBlank: SWB.replace("a private hunch", "a _____ hunch") }),
    "빈칸이 2개",
  ],
  ["정답 1단어", q({ answer: "scrutiny" }), "1단어"],
  [
    "정답 8단어(문장 삼킴)",
    q({
      sentenceWithBlank: "What a lone researcher cannot supply for herself is _____.",
      answer: "the adversarial scrutiny that turns a private hunch into a public claim",
    }),
    "단어",
  ],
  ["정답에 괄호", q({ answer: "adversarial scrutiny (검증)" }), "문장부호"],
  ["정답 꼬리 구두점", q({ answer: "adversarial scrutiny." }), "문장부호로 끝남"],
  ["정답 관사 시작", q({ answer: "the adversarial scrutiny" }), "관사로 시작"],
  ["프레임 골격 빈약", q({ sentenceWithBlank: "It is _____." }), "빈칸을 뺀 단어"],
  [
    "문장 이어붙임",
    q({
      sentenceWithBlank:
        "Colleagues, by contrast, arrive without that blind spot and attack the argument at exactly the joint where it was weakest. What a lone researcher cannot supply for herself is the _____ that turns a private hunch into a public claim.",
    }),
    "이어 붙임",
  ],
  [
    "프레임 무단 편집",
    q({ sentenceWithBlank: SWB.replace("cannot supply", "can not supply") }),
    "지문에 없음",
  ],
  [
    "첫 문장 표적",
    q({
      sentenceWithBlank: "Every laboratory keeps a drawer of _____ that never worked.",
      answer: "experiments",
    }),
    "첫 문장",
  ],
  [
    "정답이 지문에 없음",
    q({ answer: "collective verification" }),
    "지문에 축자로 없음",
  ],
  [
    "정답 잔존(빈칸문장 내)",
    q({
      sentenceWithBlank: `${SWB} The adversarial scrutiny matters.`,
      answer: ANSWER,
    }),
    "그대로 남아 노출",
  ],
  [
    "자음골격 난독",
    q({
      sentenceWithBlank:
        "What a lone researcher cannot supply for herself is the a_d_v_e_r_s_a_r_i_a_l s_c_r_u_t_i_n_y that turns a private hunch into a public claim.",
    }),
    "자음골격",
  ],
  ["해설 한국어 없음", q({ explanation: "This sentence compresses the argument." }), "한국어가 없음"],
  [
    "해설 환각 인용",
    q({ explanation: `앞 문장이 "a collective verification ritual" 이라고 서술합니다. 그래서 정답이 도출됩니다.` }),
    "환각 인용",
  ],
];
for (const [name, question, needle] of REJECTS) {
  const issues = gateMdFillBlankKey(question, PASSAGE);
  check(`게이트 반려: ${name}`, issues.some((i) => i.includes(needle)), issues.join(" / ") || "(클린)");
}
{
  // 정답이 지문에 2회 이상 나오면, 후처리가 첫 등장만 빈칸 처리하므로 본문에
  // 정답이 남는다(fbk-answer-residual-leak). 전용 지문으로 그 축만 검사한다.
  const REPEAT_PASSAGE =
    "Teams that share a common goal often drift apart within a season. " +
    "A common goal is not the same as a shared method, and only the second survives disagreement.";
  const repeat = q({
    sentenceWithBlank: "A _____ is not the same as a shared method, and only the second survives disagreement.",
    answer: "common goal",
  });
  const issues = gateMdFillBlankKey(repeat, REPEAT_PASSAGE);
  check(
    "게이트 반려: 정답이 지문에 2회 등장",
    issues.some((i) => i.includes("2회 등장")),
    issues.join(" / ") || "(클린)",
  );
  check(
    "게이트: 같은 프레임이라도 유일 등장이면 통과",
    gateMdFillBlankKey(
      q({
        sentenceWithBlank: "A common goal is not the same as a _____, and only the second survives disagreement.",
        answer: "shared method",
      }),
      REPEAT_PASSAGE,
    ).length === 0,
  );
}
check(
  "게이트: 지문 축자 인용은 통과(환각 인용 오탐 방지)",
  gateMdFillBlankKey(
    q({ explanation: `앞 문장이 "attack the argument at exactly the joint" 이라고 서술합니다. 그래서 검증 절차가 정답입니다.` }),
    PASSAGE,
  ).length === 0,
);
check(
  "게이트: 12자 미만 인용은 무시(오탐 방지)",
  gateMdFillBlankKey(q({ explanation: `핵심은 "hunch" 입니다. 앞 문장이 근거를 제시합니다.` }), PASSAGE).length === 0,
);
check(
  "게이트: forbidFirstSentence 해제 시 첫 문장 허용",
  gateMdFillBlankKey(
    q({
      sentenceWithBlank: "Every laboratory keeps a drawer of _____ that never worked.",
      answer: "experiments that never",
    }),
    PASSAGE,
    { forbidFirstSentence: false },
  ).every((i) => !i.includes("첫 문장")),
);
check(
  "게이트: requireExplanation:false 면 해설 미요구",
  gateMdFillBlankKey(q({ explanation: "" }), PASSAGE, { requireExplanation: false }).length === 0,
);
check("문장 경계: 약어 오탐 방지", internalSentenceBreaks("Dr. Smith and e.g. Chen agreed.") === 0);
check("문장 경계: 진짜 경계 1곳", internalSentenceBreaks("It rained. Then it stopped.") === 1);

// 방어: 빈 입력·정규식 특수문자·하이픈 표현에서 throw 하지 않고 오반려도 없어야 한다.
{
  const empty = parseMdFillBlankKey("");
  check("방어: 빈 입력 파싱 무예외", empty.answer === "" && empty.sentenceWithBlank === "");
  check("방어: 빈 입력 게이트는 필드 누락만 지목", gateMdFillBlankKey(empty, PASSAGE).length === 3);
  check("방어: 빈 정답은 지문 등장 0회", countFillBlankKeyAnswerOccurrences(PASSAGE, "") === 0);
  const HY_PASSAGE =
    "Memory researchers once split the brain into storage bins. " +
    "The decisive shift came when they treated long-term memory (a.k.a. consolidation) as a process rather than a place.";
  const hyphen = q({
    sentenceWithBlank:
      "The decisive shift came when they treated _____ (a.k.a. consolidation) as a process rather than a place.",
    answer: "long-term memory",
    explanation:
      "이 문장은 앞 문장의 낡은 비유를 뒤집는 전환점입니다. 앞 문장이 뇌를 저장고로 나눴다고 서술하므로, 빈칸에는 그 저장고 비유의 대상이 들어갑니다.",
  });
  check(
    "방어: 하이픈·괄호 포함 프레임에서도 게이트 클린",
    gateMdFillBlankKey(hyphen, HY_PASSAGE).length === 0,
    gateMdFillBlankKey(hyphen, HY_PASSAGE).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 파싱 성공 + 게이트 클린이어야 한다
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string][] = [
  ["불릿 접두", GOOD.replace("빈칸문장:", "- 빈칸문장:")],
  ["별표 불릿", GOOD.replace("정답:", "* 정답:")],
  ["굵게 라벨", GOOD.replace("정답:", "**정답:**").replace("해설:", "**해설:**")],
  ["굵게 라벨(콜론 밖)", GOOD.replace("빈칸문장:", "**빈칸문장**:")],
  ["라벨 내부 공백", GOOD.replace("빈칸문장:", "빈칸 문장:")],
  ["전각 콜론", GOOD.replace("정답:", "정답：")],
  ["표 파이프 잔재", GOOD.replace(`정답: ${ANSWER}`, `| 정답: ${ANSWER} |`)],
  ["정답 큰따옴표 감쌈", GOOD.replace(`정답: ${ANSWER}`, `정답: "${ANSWER}"`)],
  ["정답 곱슬따옴표 감쌈", GOOD.replace(`정답: ${ANSWER}`, `정답: “${ANSWER}”`)],
  ["정답 백틱 감쌈", GOOD.replace(`정답: ${ANSWER}`, `정답: \`${ANSWER}\``)],
  ["정답 굵게 감쌈", GOOD.replace(`정답: ${ANSWER}`, `정답: **${ANSWER}**`)],
  ["라벨 순서 뒤바뀜", `정답: ${ANSWER}\n빈칸문장: ${SWB}\n해설: ${EXPLANATION}`],
  ["섹션 사이 빈 줄", GOOD.split("\n").join("\n\n")],
  [
    "빈칸문장 두 줄 접힘",
    GOOD.replace(SWB, "What a lone researcher cannot supply for herself is the _____\nthat turns a private hunch into a public claim."),
  ],
  [
    "해설 두 줄",
    GOOD.replace(EXPLANATION, EXPLANATION.replace("입니다. ", "입니다.\n")),
  ],
  ["마커 폭 4", GOOD.replace("_____", "____")],
  ["마커 폭 10", GOOD.replace("_____", "__________")],
  ["꼬리 안내문", `${GOOD}\n\n## 지문\n${PASSAGE}`],
  // ── 회귀(지적서 #2 silent-drop): 라벨 장식 미인식으로 줄이 통째로 사라지고
  //    게이트가 "정답 누락"이라는 거짓 원인을 지목하던 계통. 실측 5종 전부.
  ["en 대시 불릿", GOOD.replace("정답:", "– 정답:")],
  ["em 대시 불릿", GOOD.replace("정답:", "— 정답:")],
  ["중점 불릿", GOOD.replace("해설:", "· 해설:")],
  ["삼각 불릿", GOOD.replace("정답:", "▶ 정답:")],
  ["헤더 라벨", GOOD.replace("정답:", "### 정답:")],
  ["인용(>) 접두", GOOD.replace("정답:", "> 정답:")],
  ["번호목록", `1. 빈칸문장: ${SWB}\n2. 정답: ${ANSWER}\n3. 해설: ${EXPLANATION}`],
  ["번호목록 괄호", `1) 빈칸문장: ${SWB}\n2) 정답: ${ANSWER}\n3) 해설: ${EXPLANATION}`],
  [
    "마크다운 표 행(콜론 없음)",
    `| 항목 | 값 |\n|---|---|\n| 빈칸문장 | ${SWB} |\n| 정답 | ${ANSWER} |\n| 해설 | ${EXPLANATION} |`,
  ],
  ["굵게+대시 불릿 조합", GOOD.replace("정답:", "– **정답:**")],
  ["라벨 앞뒤 공백", GOOD.replace("정답:", "  정답 :  ")],
  // ── 회귀(지적서 #2 부수): `정답:` 다음 줄의 부연이 answer 에 접합돼
  //    'adversarial scrutiny 이 표현은 …' 로 오염되던 계통.
  [
    "정답 다음 줄 부연",
    `빈칸문장: ${SWB}\n정답: ${ANSWER}\n이 표현은 4번째 문장에 있습니다.\n해설: ${EXPLANATION}`,
  ],
  // ── 회귀(지적서 #4 gate-gap): 해설이 마지막 섹션이라 꼬리를 전부 흡수하던 계통.
  ["꼬리 지문 재출력(`지문:` 라벨)", `${GOOD}\n\n지문:\n${PASSAGE}`],
  ["꼬리 지문 재출력(코드펜스)", `${GOOD}\n\n\`\`\`\n${PASSAGE}\n\`\`\``],
  ["꼬리 지문 재출력(맨몸)", `${GOOD}\n\n${PASSAGE}`],
];
for (const [name, text] of DRIFTS) {
  const issues = gateOf(text);
  const p = parsedOf(text);
  check(
    `드리프트 관용: ${name}`,
    issues.length === 0 && p.answer === ANSWER,
    `answer='${p.answer}' · ${issues.join(" / ")}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3-B. 적대검수 지적 회귀 픽스처 (wave2 · critical/major 4건)
// ───────────────────────────────────────────────────────────────────────────

// ── #1 correctness: 비교축이 G6(따옴표만 접음)·G7(원문 그대로)로 갈려
//    같은 입력에서 "G6 통과 · G7 반려"의 자기모순이 나던 계통.
//    지문은 웹·워드 붙여넣기라 곱슬 아포스트로피(’)·en 대시(–)를 쓰는데
//    모델은 곧은 표기로 받아쓴다. 실사용 상시 재현이었다.
{
  const CURLY_PASSAGE =
    "Editors often ask why a promising manuscript stalls in review. " +
    "The honest answer is that it’s the missing counterexample that keeps the argument from closing. " +
    "Readers forgive a rough style, but they do not forgive a claim that never meets resistance.";
  const CURLY_EXPL =
    "이 문장은 앞 문장이 던진 물음에 답하는 자리입니다. 뒤 문장이 반론을 만나지 않는 주장을 독자가 용서하지 않는다고 서술하므로, 빈칸에는 빠진 반례를 가리키는 표현이 들어갑니다.";
  const curly = q({
    sentenceWithBlank: "The honest answer is that _____ that keeps the argument from closing.",
    answer: "it's the missing counterexample",
    explanation: CURLY_EXPL,
  });
  check(
    "#1 곱슬 아포스트로피 지문 + 곧은 정답 → 게이트 클린",
    gateMdFillBlankKey(curly, CURLY_PASSAGE).length === 0,
    gateMdFillBlankKey(curly, CURLY_PASSAGE).join(" / "),
  );
  check(
    "#1 G6·G7 이 같은 접기 폭을 쓴다(프레임 성립 ⟺ 축자 등장)",
    fillBlankKeyFrameMatches(CURLY_PASSAGE, curly.sentenceWithBlank, curly.answer) &&
      countFillBlankKeyAnswerOccurrences(CURLY_PASSAGE, curly.answer) === 1,
    `frame=${fillBlankKeyFrameMatches(CURLY_PASSAGE, curly.sentenceWithBlank, curly.answer)} occ=${countFillBlankKeyAnswerOccurrences(CURLY_PASSAGE, curly.answer)}`,
  );
  // 역방향(지문 곧은 / 모델 곱슬)도 같은 폭으로 흡수해야 한다.
  const STRAIGHT_PASSAGE = CURLY_PASSAGE.replace("it’s", "it's");
  check(
    "#1 역방향(곧은 지문 + 곱슬 정답)도 게이트 클린",
    gateMdFillBlankKey(
      { ...curly, answer: "it’s the missing counterexample" },
      STRAIGHT_PASSAGE,
    ).length === 0,
  );

  const DASH_PASSAGE =
    "Regulators once treated safety as an absolute. " +
    "Modern practice instead frames every rule as a cost–benefit negotiation that no single agency can settle alone. " +
    "That reframing changed who gets a seat at the table.";
  const dash = q({
    sentenceWithBlank:
      "Modern practice instead frames every rule as a _____ that no single agency can settle alone.",
    answer: "cost-benefit negotiation",
    explanation:
      "이 문장은 앞 문장의 절대적 안전관을 뒤집는 자리입니다. 뒤 문장이 협상 테이블의 참여자가 바뀌었다고 서술하므로, 빈칸에는 비용과 편익을 저울질하는 협상을 가리키는 표현이 들어갑니다.",
  });
  check(
    "#1 en 대시 지문 + 하이픈 정답 → 게이트 클린",
    gateMdFillBlankKey(dash, DASH_PASSAGE).length === 0,
    gateMdFillBlankKey(dash, DASH_PASSAGE).join(" / "),
  );
  check(
    "#1 en 대시 지문을 하이픈으로 인용해도 환각 인용으로 오판하지 않는다",
    gateMdFillBlankKey(
      {
        ...dash,
        explanation: `앞 문장이 "cost-benefit negotiation" 이라고 서술합니다. 그래서 이 표현이 정답입니다.`,
      },
      DASH_PASSAGE,
    ).length === 0,
  );
  // 접기 폭이 넓어져도 "정말 지문에 없는 정답"은 여전히 반려해야 한다(무뎌짐 금지).
  check(
    "#1 접기 폭 확대가 축자 검사를 무디게 하지 않는다",
    gateMdFillBlankKey({ ...dash, answer: "cost sharing negotiation" }, DASH_PASSAGE).some((i) =>
      i.includes("지문에 축자로 없음"),
    ),
  );
  check(
    "#1 단어경계 정규식: 아포스트로피 양방향 흡수",
    answerBoundaryRegex("it's the missing counterexample").test(
      "that it’s the missing counterexample that",
    ) &&
      answerBoundaryRegex("it’s the missing counterexample").test(
        "that it's the missing counterexample that",
      ),
  );
  check(
    "#1 단어경계 정규식: 대시 양방향 흡수",
    answerBoundaryRegex("cost-benefit negotiation").test("a cost–benefit negotiation that") &&
      answerBoundaryRegex("cost—benefit negotiation").test("a cost-benefit negotiation that"),
  );
  check(
    "#1 단어경계는 유지된다(단어 내부 매칭 금지 — art'is'ts 사고 회귀 방지)",
    !answerBoundaryRegex("is").test("artists") && answerBoundaryRegex("is").test("this is a test"),
  );
}

// ── #2 silent-drop: 라벨 장식 미인식 줄이 직전 섹션에 흡수돼 값이 통째로
//    사라지고, 게이트는 "정답 누락"이라는 거짓 원인만 던지던 계통.
{
  const enDash = `빈칸문장: ${SWB}\n– 정답: ${ANSWER}\n해설: ${EXPLANATION}`;
  const p = parseMdFillBlankKey(enDash);
  check("#2 en 대시 불릿 라벨을 읽는다", p.answer === ANSWER, `answer='${p.answer}'`);
  check(
    "#2 미인식 줄이 빈칸문장을 오염시키지 않는다",
    p.sentenceWithBlank === SWB,
    p.sentenceWithBlank.slice(-40),
  );
  const table = `| 빈칸문장 | ${SWB} |\n| 정답 | ${ANSWER} |\n| 해설 | ${EXPLANATION} |`;
  const pt = parseMdFillBlankKey(table);
  check(
    "#2 표 행(콜론 없는 `| 라벨 | 값 |`) 3필드 전부 수집",
    pt.answer === ANSWER && pt.sentenceWithBlank === SWB && pt.explanation === EXPLANATION,
    `answer='${pt.answer}'`,
  );
  const numbered = `1. 빈칸문장: ${SWB}\n2. 정답: ${ANSWER}\n3. 해설: ${EXPLANATION}`;
  check("#2 번호목록 3필드 전부 수집", parseMdFillBlankKey(numbered).answer === ANSWER);
  check("#2 헤더 라벨(`### 정답:`) 수집", parseMdFillBlankKey(GOOD.replace("정답:", "### 정답:")).answer === ANSWER);
  check(
    "#2 `정답:` 다음 줄 부연이 정답에 접합되지 않는다",
    parseMdFillBlankKey(`빈칸문장: ${SWB}\n정답: ${ANSWER}\n이 표현은 4번째 문장에 있습니다.\n해설: ${EXPLANATION}`)
      .answer === ANSWER,
  );
  // 계약 밖 라벨은 직전 버킷에 붙이지 않고 모아 두고, **필드가 빌 때만** 자리를 지목한다.
  const unknown = `빈칸문장: ${SWB}\n답변: ${ANSWER}\n해설: ${EXPLANATION}`;
  const pu = parseMdFillBlankKey(unknown);
  check("#2 미지 라벨 줄 수집", (pu.unknownLabelLines ?? []).some((l) => l.includes("답변")));
  check("#2 미지 라벨이 빈칸문장을 오염시키지 않는다", pu.sentenceWithBlank === SWB);
  {
    const issues = gateMdFillBlankKey(pu, PASSAGE);
    check(
      "#2 정답 누락 + '읽지 못한 라벨 줄' 자리 지목 동반 (거짓 원인 단독 반려 금지)",
      issues.some((i) => i.includes("정답 누락")) &&
        issues.some((i) => i.includes("읽지 못한 라벨 줄") && i.includes("답변")),
      issues.join(" / "),
    );
  }
  // 세 필드가 정상이면 군더더기 라벨 한 줄로 반려하지 않는다(살릴 수 있는 문항을
  // 죽이면 재생성 1회 소진 + 크레딧 환불로 손해가 더 크다). 대신 corrections 기록.
  const extra = `${GOOD}\n참고: 이 표현은 4번째 문장에 있습니다.`;
  const se = autoSnapFillBlankKey(parseMdFillBlankKey(extra), PASSAGE);
  check("#2 필드 정상이면 군더더기 라벨로 반려하지 않는다", gateOf(extra).length === 0, gateOf(extra).join(" / "));
  check(
    "#2 대신 corrections 로 기록(조용히 버리지 않는다 — 철칙3)",
    se.corrections.some((c) => c.includes("참고")),
    se.corrections.join(" / "),
  );
}

// ── #3 edge-case: 점 찍힌 이니셜리즘(U.S. / Ph.D. / N.A.S.A.)을 문장 경계로
//    오판해, 모델이 순응할 수 없는 하드 반려("문장을 쪼개라 — 쪼갤 문장이 없다")를
//    내던 계통. 미국 소재 지문은 수능·모의고사 단골이라 상시 재현이었다.
check("#3 U.S. 는 문장 경계가 아니다", internalSentenceBreaks("The U.S. Constitution guarantees the right.") === 0);
check("#3 Ph.D. 는 문장 경계가 아니다", internalSentenceBreaks("A Ph.D. Program takes years.") === 0);
check(
  "#3 N.A.S.A. 는 문장 경계가 아니다",
  internalSentenceBreaks("In 1969 N.A.S.A. Engineers landed a craft.") === 0,
);
check(
  "#3 a.k.a. 는 문장 경계가 아니다",
  internalSentenceBreaks("They studied consolidation (a.k.a. Memory) for years.") === 0,
);
// 무뎌짐 금지 — 점 없는 토큰 뒤는 여전히 진짜 경계다(약어 목록에 us/uk 를 넣으면
// 이 축이 조용히 죽는다. 그래서 목록 확장 대신 '내부 점' 조건으로만 방어한다).
check("#3 점 없는 'us.' 뒤는 여전히 문장 경계", internalSentenceBreaks("He gave it to us. Then he left.") === 1);
check("#3 점 없는 'IBM.' 뒤는 여전히 문장 경계", internalSentenceBreaks("She left IBM. Then she founded a lab.") === 1);
{
  const US_PASSAGE =
    "Public health agencies rarely admit how much they borrow from one another. " +
    "When a new pathogen appears, the U.S. Centers for Disease Control quietly copies containment protocols written abroad, because no single agency can rehearse every scenario. " +
    "That borrowing is not a weakness but the mechanism by which preparedness spreads.";
  const usQ = q({
    sentenceWithBlank:
      "When a new pathogen appears, the U.S. Centers for Disease Control quietly copies _____ written abroad, because no single agency can rehearse every scenario.",
    answer: "containment protocols",
    explanation:
      "이 문장은 기관들이 서로에게서 빌려 온다는 앞 문장을 구체화하는 자리입니다. 뒤 문장이 그 빌림이 대비 태세를 퍼뜨리는 기제라고 서술하므로, 빈칸에는 외국에서 작성된 봉쇄 절차를 가리키는 표현이 들어갑니다.",
  });
  check(
    "#3 U.S. 가 든 정상 한 문장은 게이트 클린(하드 반려 회귀 방지)",
    gateMdFillBlankKey(usQ, US_PASSAGE).length === 0,
    gateMdFillBlankKey(usQ, US_PASSAGE).join(" / "),
  );
  check(
    "#3 진짜 두 문장 이어붙임은 여전히 반려",
    gateMdFillBlankKey(
      {
        ...usQ,
        sentenceWithBlank: `Public health agencies rarely admit how much they borrow from one another. ${usQ.sentenceWithBlank}`,
      },
      US_PASSAGE,
    ).some((i) => i.includes("이어 붙임")),
  );
}

// ── #4 gate-gap: `해설:` 은 마지막 섹션이라 종결자가 없어 꼬리의 지문 재출력이
//    통째로 해설에 실리고, 게이트 클린·검증기 error 0 으로 **그대로 출하**되던
//    계통(Explanation.content 에 영어 지문 전문이 저장돼 학생·강사 표면에 렌더).
{
  for (const [name, tail] of [
    ["`지문:` 라벨", `\n\n지문:\n${PASSAGE}`],
    ["코드펜스", `\n\n\`\`\`\n${PASSAGE}\n\`\`\``],
    ["맨몸", `\n\n${PASSAGE}`],
    ["'이상입니다.' 류 꼬리", `\n\n${PASSAGE}\n이상입니다.`],
  ] as [string, string][]) {
    const text = `${GOOD}${tail}`;
    const parsed = parseMdFillBlankKey(text);
    check(
      `#4 해설 꼬리 흡수 차단(${name})`,
      parsed.explanation === EXPLANATION,
      `${parsed.explanation.length}자 · 꼬리='${parsed.explanation.slice(-40)}'`,
    );
    check(`#4 그래도 문항은 살린다(${name}) — 게이트 클린`, gateOf(text).length === 0, gateOf(text).join(" / "));
  }
  const s = autoSnapFillBlankKey(parseMdFillBlankKey(`${GOOD}\n\n${PASSAGE}`), PASSAGE);
  check(
    "#4 버린 꼬리를 corrections 로 기록(조용히 버리지 않는다 — 철칙3)",
    s.corrections.some((c) => c.includes("군더더기")),
    s.corrections.join(" / "),
  );
  // 파서가 뚫려도 잡는 2중 방어 — 게이트 결정형 검사 2종.
  check(
    "#4 게이트: 해설 길이 상한 반려",
    gateMdFillBlankKey(q({ explanation: `${EXPLANATION} ${PASSAGE}` }), PASSAGE).some((i) =>
      i.includes("딱 2문장"),
    ),
  );
  check(
    "#4 게이트: 해설이 지문을 연속 30단어 이상 재출력하면 반려",
    gateMdFillBlankKey(
      q({
        explanation:
          "근거는 다음 문장입니다. A researcher who reviews only her own notebook will read those failures as bad luck, because the mistake that produced them is invisible from the inside. Colleagues, by contrast, arrive without that blind spot",
      }),
      PASSAGE,
    ).some((i) => i.includes("30단어 이상")),
  );
  check("#4 정상 해설은 두 검사에 걸리지 않는다", gateOf(GOOD).length === 0);
  check(
    "#4 해설 속 짧은 지문 인용은 통과",
    gateMdFillBlankKey(
      q({ explanation: `앞 문장이 "attack the argument at exactly the joint" 이라고 서술합니다. 그래서 정답입니다.` }),
      PASSAGE,
    ).length === 0,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3-C. wave2 잔여 지적 회귀 픽스처 (round2 · major 2건 + 전수 감사 자체 발견 4건)
// ───────────────────────────────────────────────────────────────────────────

// ── R2-#1 silent-drop: 언더스코어 라벨 강조가 **반쪽만** 지원돼(콜론 앞만 흡수)
//    닫는 `__` 가 값 선두에 실리던 계통. 실측: `__정답:__ X` → answer='__ X' →
//    게이트가 ①정답에 문장부호 포함 ②되끼운 문장이 지문에 없음 ③정답이 지문에
//    축자로 없음 — **거짓 원인 3건**을 던지고 모델을 '정답을 바꿔라'로 몰았다.
//    `__해설:__` 은 게이트 클린이라 '__ 이 문장은…' 이 학생 표면에 그대로 출하됐다.
{
  const LABEL_DECORATIONS: [string, (l: string) => string][] = [
    ["**라벨:**", (l) => `**${l}:**`],
    ["**라벨**:", (l) => `**${l}**:`],
    ["**라벨: 값**(전줄)", (l) => `**${l}:`], // 닫는 ** 는 값 뒤에 붙인다(아래에서 처리)
    ["__라벨:__", (l) => `__${l}:__`],
    ["__라벨__:", (l) => `__${l}__:`],
    ["_라벨:_", (l) => `_${l}:_`],
    ["_라벨_:", (l) => `_${l}_:`],
    ["___라벨___:", (l) => `___${l}___:`],
    ["___라벨:___", (l) => `___${l}:___`],
    ["*라벨*:", (l) => `*${l}*:`],
    ["***라벨***:", (l) => `***${l}***:`],
    ["## __라벨:__", (l) => `## __${l}:__`],
    ["> __라벨:__", (l) => `> __${l}:__`],
    ["- __라벨:__", (l) => `- __${l}:__`],
    ["– __라벨:__", (l) => `– __${l}:__`],
    ["1. __라벨:__", (l) => `1. __${l}:__`],
    ["__라벨：__(전각)", (l) => `__${l}：__`],
    ["**라벨：**(전각)", (l) => `**${l}：**`],
  ];
  for (const [name, deco] of LABEL_DECORATIONS) {
    for (const [label, value] of [
      ["빈칸문장", SWB],
      ["정답", ANSWER],
      ["해설", EXPLANATION],
    ] as [string, string][]) {
      const line = name.includes("전줄") ? `**${label}: ${value}**` : `${deco(label)} ${value}`;
      const text = [
        label === "빈칸문장" ? line : `빈칸문장: ${SWB}`,
        label === "정답" ? line : `정답: ${ANSWER}`,
        label === "해설" ? line : `해설: ${EXPLANATION}`,
      ].join("\n");
      const p = parsedOf(text);
      const issues = gateOf(text);
      check(
        `R2-#1 ${name} × ${label}`,
        p.sentenceWithBlank === SWB && p.answer === ANSWER && p.explanation === EXPLANATION &&
          issues.length === 0,
        `swb='${p.sentenceWithBlank.slice(0, 20)}' ans='${p.answer}' exp='${p.explanation.slice(0, 14)}' · ${issues.join(" / ")}`,
      );
    }
  }
  // 값 쪽 감싸기도 **양끝 모두** 벗겨야 한다 — 한쪽만 벗기면 말미가 오염된다.
  for (const [name, wrap] of [
    ["굵게", (v: string) => `**${v}**`],
    ["언더스코어", (v: string) => `__${v}__`],
    ["큰따옴표", (v: string) => `"${v}"`],
    ["곱슬따옴표", (v: string) => `“${v}”`],
    ["백틱", (v: string) => `\`${v}\``],
    ["굵게+따옴표", (v: string) => `**"${v}"**`],
    ["짝 깨진 여는 별표", (v: string) => `** ${v}`],
    ["불릿 잔재", (v: string) => `* ${v}`],
  ] as [string, (v: string) => string][]) {
    const text = `빈칸문장: ${SWB}\n정답: ${wrap(ANSWER)}\n해설: ${wrap(EXPLANATION)}`;
    const p = parsedOf(text);
    check(
      `R2-#1 값 감싸기(${name})는 양끝 모두 벗긴다 — 해설은 학생 표면에 그대로 렌더된다`,
      p.answer === ANSWER && p.explanation === EXPLANATION,
      `ans='${p.answer}' exp='${p.explanation.slice(0, 22)}'`,
    );
  }
  // 마커 면역 — 값 선두가 빈칸 마커일 때 라벨 장식이 그것을 갉아먹으면
  // 게이트가 "빈칸 마커가 없음"이라는 거짓 원인을 지목한다.
  const START_PASSAGE =
    "Field biologists once trusted a single season of data. " +
    "Repeated sampling now anchors every claim they publish, because one season can hide a decade of variation. " +
    "The habit spread only after several famous retractions.";
  const START_EXPL =
    "이 문장은 한 계절치 자료를 믿던 관행을 뒤집는 자리입니다. 뒤 문장이 그 관행이 여러 차례의 철회 뒤에야 퍼졌다고 서술하므로, 빈칸에는 반복 표집을 가리키는 표현이 들어갑니다.";
  for (const marker of ["___", "____", "_____", "__________"]) {
    for (const lab of ["빈칸문장:", "__빈칸문장:__", "_빈칸문장:_", "___빈칸문장___:", "**빈칸문장:**", "> __빈칸문장:__"]) {
      const text = `${lab} ${marker} now anchors every claim they publish, because one season can hide a decade of variation.\n정답: Repeated sampling\n해설: ${START_EXPL}`;
      const s = autoSnapFillBlankKey(parseMdFillBlankKey(text), START_PASSAGE);
      const issues = gateMdFillBlankKey(s.question, START_PASSAGE);
      check(
        `R2-#1 마커 폭 ${marker.length} × ${lab} 에서 마커가 살아남는다`,
        s.question.sentenceWithBlank.startsWith("_____ now") && issues.length === 0,
        `swb='${s.question.sentenceWithBlank.slice(0, 16)}' · ${issues.join(" / ")}`,
      );
    }
  }
  // 무뎌짐 금지 — 계약 밖 라벨은 언더스코어로 감싸도 여전히 미지 라벨이어야 한다.
  const pu = parseMdFillBlankKey(`빈칸문장: ${SWB}\n__답변:__ ${ANSWER}\n해설: ${EXPLANATION}`);
  check(
    "R2-#1 무뎌짐 금지: `__답변:__` 은 여전히 미지 라벨(자리 지목)",
    pu.answer === "" && (pu.unknownLabelLines ?? []).some((l) => l.includes("답변")),
    `ans='${pu.answer}' unk=${JSON.stringify(pu.unknownLabelLines)}`,
  );
  check(
    "R2-#1 미지 라벨 보고는 **모델이 쓴 원본 줄** 그대로(장식 포함)",
    (pu.unknownLabelLines ?? []).some((l) => l.includes("__답변:__")),
    JSON.stringify(pu.unknownLabelLines),
  );
}

// ── 자체 발견: 표 셀이 라벨/값으로 갈린 `| 정답: | 값 |` 에서 labelRe 가 먼저
//    매칭돼 값이 '| adversarial scrutiny' 로 오염되던 계통(앞 파이프 미절삭).
for (const [name, row] of [
  ["| 정답: | 값 |", `| 정답: | ${ANSWER} |`],
  ["| 정답： | 값 |(전각)", `| 정답： | ${ANSWER} |`],
  ["| **정답:** | 값 |", `| **정답:** | ${ANSWER} |`],
] as [string, string][]) {
  const text = `빈칸문장: ${SWB}\n${row}\n해설: ${EXPLANATION}`;
  const p = parsedOf(text);
  check(`자체발견 표 셀 분리 ${name}`, p.answer === ANSWER && gateOf(text).length === 0, `ans='${p.answer}'`);
}

// ── 자체 발견: 대사 인용 문장(양끝 따옴표)에서 바깥 따옴표만 뜯겨 G6 가
//    "지문에 없음"이라는 거짓 원인을 지목하던 계통. 안쪽에 같은 토큰이 또 있으면
//    감싸기로 보지 않는다.
{
  const DIALOG_PASSAGE =
    "The instructor never raised her voice. " +
    `"Do it," she said, "before the standing agreement lapses." ` +
    "Everyone in the room understood the deadline.";
  const text =
    `빈칸문장: "Do it," she said, "before the _____ lapses."\n정답: standing agreement\n` +
    `해설: 이 문장은 마감의 존재를 처음 알리는 자리입니다. 뒤 문장이 모두가 마감을 이해했다고 서술하므로, 빈칸에는 유효한 합의를 가리키는 표현이 들어갑니다.`;
  const s = autoSnapFillBlankKey(parseMdFillBlankKey(text), DIALOG_PASSAGE);
  check(
    "자체발견 대사 인용 문장의 바깥 따옴표를 뜯지 않는다",
    s.question.sentenceWithBlank.startsWith(`"Do it,"`) &&
      gateMdFillBlankKey(s.question, DIALOG_PASSAGE).length === 0,
    `swb='${s.question.sentenceWithBlank.slice(0, 26)}' · ${gateMdFillBlankKey(s.question, DIALOG_PASSAGE).join(" / ")}`,
  );
  check(
    "자체발견 그래도 진짜 감싸기 따옴표는 벗긴다(무뎌짐 금지)",
    parseMdFillBlankKey(`정답: "${ANSWER}"`).answer === ANSWER,
  );
}

// ── R2-#2 과잉 차단: 해설의 '지문 20단어 재출력' 게이트가 **완전히 정상인 문항**을
//    하드 반려하던 계통. 프롬프트는 '지문 축자 그대로 인용하라'고 시키고 G16 은
//    축자성을 요구하는데, 지문 문장은 20~30단어가 예사다(프로브 지문의 근거 문장 =
//    정확히 20단어, 표적 문장 = 21단어). 19단어 통과·20단어 반려의 자의적 절벽에서
//    정상 문항이 재생성 1회(OpenRouter 2콜)를 태우고 환불로 끝났다.
{
  const EVIDENCE =
    "Colleagues, by contrast, arrive without that blind spot and attack the argument at exactly the joint where it was weakest";
  const evWords = EVIDENCE.split(/\s+/);
  check("R2-#2 지문 근거 문장은 20단어다(절벽이 실사용 상시 재현이던 근거)", evWords.length === 20);
  // 근거 문장 전문(20단어) — 지적서가 실측한 절벽 바로 그 자리.
  {
    const expl = `이 문장은 앞의 두 장면을 하나의 개념으로 압축하는 자리입니다. 바로 앞 문장이 "${EVIDENCE}" 라고 서술하므로, 빈칸에는 그 검증 절차를 가리키는 표현이 들어갑니다.`;
    const issues = gateMdFillBlankKey(q({ explanation: expl }), PASSAGE);
    check("R2-#2 정상 문항: 근거 문장 전문(20단어) 축자 인용 → 게이트 클린", issues.length === 0, issues.join(" / "));
  }
  // 19~29단어 축자 인용은 전부 통과해야 한다(임계 30 직전까지 무반려).
  const PW = PASSAGE.match(/[A-Za-z0-9'-]+/g) ?? [];
  for (const n of [19, 20, 21, 25, 29]) {
    const quote = PW.slice(10, 10 + n).join(" ");
    const expl = `이 문장은 논지가 수렴하는 자리입니다. 지문이 "${quote}" 라고 서술하므로, 빈칸에는 그 검증 절차를 가리키는 표현이 들어갑니다.`;
    const issues = gateMdFillBlankKey(q({ explanation: expl }), PASSAGE);
    check(
      `R2-#2 정상 문항: 지문 ${n}단어 축자 인용 → 게이트 클린(해설 ${expl.length}자)`,
      issues.length === 0,
      issues.join(" / "),
    );
  }
  check(
    "R2-#2 임계 경계: 30단어부터 반려(29는 통과)",
    gateMdFillBlankKey(
      q({ explanation: `지문이 "${PW.slice(10, 40).join(" ")}" 라고 서술합니다. 그래서 정답입니다.` }),
      PASSAGE,
    ).some((i) => i.includes("30단어 이상")),
  );
  // 표적 문장(빈칸문장)은 학생 화면에 이미 통째로 보이므로 인용해도 '재출력'이 아니다.
  const target =
    "What a lone researcher cannot supply for herself is the adversarial scrutiny that turns a private hunch into a public claim";
  check(
    "R2-#2 표적 문장 전문(21단어) 인용은 면제 — 학생이 이미 보는 문장이다",
    gateMdFillBlankKey(
      q({
        explanation: `이 문장은 글의 논지가 수렴하는 자리입니다. "${target}" 가 앞의 서술을 한 어구로 압축하므로, 빈칸에는 그 검증 절차를 가리키는 표현이 들어갑니다.`,
      }),
      PASSAGE,
    ).length === 0,
  );
  // 무뎌짐 금지 — 진짜 지문 재출력(연속 30단어 이상)은 여전히 반려.
  check(
    "R2-#2 무뎌짐 금지: 연속 35단어 재출력은 반려(400자 이내여도)",
    gateMdFillBlankKey(
      q({
        explanation: `해설입니다. ${(PASSAGE.match(/[A-Za-z0-9'-]+/g) ?? []).slice(20, 55).join(" ")}`,
      }),
      PASSAGE,
    ).some((i) => i.includes("30단어 이상")),
  );
  check(
    "R2-#2 무뎌짐 금지: 지문 전문 재출력은 길이 상한이 단독으로도 잡는다",
    gateMdFillBlankKey(q({ explanation: `해설 두 문장입니다. ${PASSAGE}` }), PASSAGE).some((i) =>
      i.includes("딱 2문장"),
    ),
  );
  check(
    "R2-#2 게이트 문구가 순응 가능한 규칙을 알려준다(자리 지목 — 철칙5)",
    gateMdFillBlankKey(
      q({
        explanation: `해설입니다. ${(PASSAGE.match(/[A-Za-z0-9'-]+/g) ?? []).slice(20, 55).join(" ")}`,
      }),
      PASSAGE,
    ).some((i) => i.includes("한 조각") && i.includes("단어 이내로 줄이고")),
  );
  check(
    "R2-#2 프롬프트가 인용 상한을 명시한다(모델이 순응할 수 있어야 한다)",
    buildMdFillBlankKeyPrompt(PASSAGE, "full", "KILLER").includes(
      `한 조각 ${FILL_BLANK_KEY_MD_QUOTE_WORD_MAX}단어 이내`,
    ),
  );
}

// ── 지적서에는 없지만 같은 계통(키워드 줄 무관용)에서 자체 발견한 2건 ──────
// (a) 콜론 뒤 강조 흡수가 **값 선두의 빈칸 마커**를 갉아먹던 결함.
//     `빈칸문장: ____ now anchors …`(빈칸이 문장 맨 앞) → `__` 를 강조로 오인해
//     먹고 남은 `__` 는 `_{3,}` 에 안 걸려 게이트가 "빈칸 마커가 없음"이라는
//     거짓 원인을 지목했다(구 정규식 실측: 마커 4개 → 마커 유실).
{
  const START_PASSAGE =
    "Field biologists once trusted a single season of data. " +
    "Repeated sampling now anchors every claim they publish, because one season can hide a decade of variation. " +
    "The habit spread only after several famous retractions.";
  const START_EXPL =
    "이 문장은 한 계절치 자료를 믿던 관행을 뒤집는 자리입니다. 뒤 문장이 그 관행이 여러 차례의 철회 뒤에야 퍼졌다고 서술하므로, 빈칸에는 반복 표집을 가리키는 표현이 들어갑니다.";
  for (const marker of ["____", "_____", "__________"]) {
    const text = `빈칸문장: ${marker} now anchors every claim they publish, because one season can hide a decade of variation.\n정답: Repeated sampling\n해설: ${START_EXPL}`;
    const s = autoSnapFillBlankKey(parseMdFillBlankKey(text), START_PASSAGE);
    const issues = gateMdFillBlankKey(s.question, START_PASSAGE);
    check(
      `계통(a): 문장 맨 앞 빈칸 마커 ${marker.length}개가 살아남는다`,
      s.question.sentenceWithBlank.startsWith("_____ now") && issues.length === 0,
      `swb='${s.question.sentenceWithBlank.slice(0, 14)}' · ${issues.join(" / ")}`,
    );
  }
}
// (b) 값을 언더스코어 강조로 감싼 드리프트(`정답: __X__`)에서 꼬리 `__` 가 남아
//     "정답에 문장부호·괄호가 포함됨"으로 반려되던 결함. 대칭일 때만 벗긴다.
check(
  "계통(b): 값의 언더스코어 강조는 대칭일 때만 벗긴다",
  parseMdFillBlankKey(`정답: __${ANSWER}__`).answer === ANSWER,
  parseMdFillBlankKey(`정답: __${ANSWER}__`).answer,
);
check(
  "계통(b): 빈칸 마커는 강조로 오인하지 않는다(비대칭 언더스코어 보존)",
  parseMdFillBlankKey(`빈칸문장: ${SWB}`).sentenceWithBlank === SWB,
);
check("계통(b): 이중 대시 불릿 라벨", parseMdFillBlankKey(GOOD.replace("정답:", "-- 정답:")).answer === ANSWER);
check(
  "계통(b): 별표 이탤릭 라벨",
  parseMdFillBlankKey(GOOD.replace("정답:", "*정답*:")).answer === ANSWER,
);

// ───────────────────────────────────────────────────────────────────────────
// 3-D. 공유 장식 유틸(decoration.ts) 승차 회귀 — 유형별 재발명 소멸
//   머리표는 keywordLineRe 하나, 값은 cleanMdValue 하나로 단일화했다. 공유 유틸이
//   보장하는 매트릭스가 **세 계약 라벨 전부에서** 성립해야 한다 — 한 라벨만 되고
//   다른 라벨은 안 되던 부분집합 지원이 이번 웨이브 잔여 결함의 형상이었다.
// ───────────────────────────────────────────────────────────────────────────
{
  const LABELS: [string, string][] = [
    ["빈칸문장", SWB],
    ["정답", ANSWER],
    ["해설", EXPLANATION],
  ];
  const build = (label: string, line: string) =>
    LABELS.map(([l, v]) => (l === label ? line : `${l}: ${v}`)).join("\n");
  const verify = (name: string, label: string, line: string) => {
    const text = build(label, line);
    const p = parsedOf(text);
    const issues = gateOf(text);
    check(
      name,
      p.sentenceWithBlank === SWB && p.answer === ANSWER && p.explanation === EXPLANATION &&
        issues.length === 0,
      `swb='${p.sentenceWithBlank.slice(0, 18)}' ans='${p.answer}' exp='${p.explanation.slice(0, 12)}' · ${issues.join(" / ")}`,
    );
  };

  // 머리표 매트릭스 — decoration.ts 픽스처가 고정한 전 계통.
  const HEADS: [string, (l: string) => string][] = [
    ["평문", (l) => `${l}: `],
    ["**라벨:**", (l) => `**${l}:** `],
    ["**라벨**:", (l) => `**${l}**: `],
    ["__라벨:__", (l) => `__${l}:__ `],
    ["_라벨:_", (l) => `_${l}:_ `],
    ["`라벨:`", (l) => `\`${l}:\` `],
    ["## 라벨:", (l) => `## ${l}: `],
    ["### 라벨:", (l) => `### ${l}: `],
    ["> 라벨:", (l) => `> ${l}: `],
    ["- 라벨:", (l) => `- ${l}: `],
    ["* 라벨:", (l) => `* ${l}: `],
    ["전각 콜론", (l) => `${l}： `],
    ["들여쓰기+꼬리공백", (l) => `   ${l}:   `],
    ["| 라벨:", (l) => `| ${l}: `],
    ["***라벨:***", (l) => `***${l}:*** `],
    ["~~라벨:~~", (l) => `~~${l}:~~ `],
    ["콜론 뒤 공백 없음", (l) => `${l}:`],
  ];
  for (const [hname, deco] of HEADS) {
    for (const [label, value] of LABELS) {
      verify(`공유매트릭스 머리표 ${hname} × ${label}`, label, `${deco(label)}${value}`);
    }
  }

  // 값 감싸기 매트릭스 — 한쪽만 벗겨 선두/말미가 오염되던 계통.
  const VALUES: [string, (v: string) => string][] = [
    ["**값**", (v) => `**${v}**`],
    ["__값__", (v) => `__${v}__`],
    ["___값___", (v) => `___${v}___`],
    ["***값***", (v) => `***${v}***`],
    ["`값`", (v) => `\`${v}\``],
    ['"값"', (v) => `"${v}"`],
    ["“값”", (v) => `“${v}”`],
    ["~~값~~", (v) => `~~${v}~~`],
  ];
  for (const [vname, wrap] of VALUES) {
    for (const [label, value] of LABELS) {
      verify(`공유매트릭스 값 감싸기 ${vname} × ${label}`, label, `${label}: ${wrap(value)}`);
    }
  }

  // 마커 면역 — 공유 stripEmphasis 는 `_` 를 강조로 본다. 봉인이 뚫리면 마커가
  // 통째로 사라지고 게이트가 "빈칸 마커가 없음"이라는 거짓 원인을 지목한다.
  const START_PASSAGE =
    "Field biologists once trusted a single season of data. " +
    "Repeated sampling now anchors every claim they publish, because one season can hide a decade of variation. " +
    "The habit spread only after several famous retractions.";
  const START_EXPL =
    "이 문장은 한 계절치 자료를 믿던 관행을 뒤집는 자리입니다. 뒤 문장이 그 관행이 여러 차례의 철회 뒤에야 퍼졌다고 서술하므로, 빈칸에는 반복 표집을 가리키는 표현이 들어갑니다.";
  const TAIL = "now anchors every claim they publish, because one season can hide a decade of variation.";
  for (const [name, line] of [
    ["콜론 직후 마커(공백 없음)", `빈칸문장:_____ ${TAIL}`],
    ["___라벨:___ + 마커", `___빈칸문장:___ _____ ${TAIL}`],
    ["___라벨___: + 마커", `___빈칸문장___: _____ ${TAIL}`],
    ["~~라벨:~~ + 마커", `~~빈칸문장:~~ _____ ${TAIL}`],
    ["`라벨:` + 마커", `\`빈칸문장:\` _____ ${TAIL}`],
  ] as [string, string][]) {
    const text = `${line}\n정답: Repeated sampling\n해설: ${START_EXPL}`;
    const s = autoSnapFillBlankKey(parseMdFillBlankKey(text), START_PASSAGE);
    const issues = gateMdFillBlankKey(s.question, START_PASSAGE);
    check(
      `공유매트릭스 마커 보존: ${name}`,
      s.question.sentenceWithBlank.startsWith("_____ now") && issues.length === 0,
      `swb='${s.question.sentenceWithBlank.slice(0, 16)}' · ${issues.join(" / ")}`,
    );
  }

  // 과잉 차단 금지 — 본문 강조는 **표식만** 벗기고 낱말을 보존하며, 본문 따옴표는
  // 통째로 보존한다(감싸기 따옴표만 한 겹 벗긴다).
  const EMPH_PASSAGE =
    "Urban planners once dismissed roadside strips as leftover ground. " +
    `"Green" corridors were once regarded as decoration, but they now carry the daily traffic of pollinators between parks. ` +
    "Every bridge design now begins from that reversal.";
  {
    const text =
      `빈칸문장: "Green" corridors were *once* regarded as decoration, but they now carry the _____ between parks.\n` +
      `정답: daily traffic of pollinators\n` +
      `해설: 이 문장은 앞 문장의 통념을 뒤집는 자리입니다. 뒤 문장이 설계의 출발점이 바뀌었다고 서술하므로, 빈칸에는 수분 매개자의 일상적 왕래를 가리키는 표현이 들어갑니다.`;
    const p = autoSnapFillBlankKey(parseMdFillBlankKey(text), EMPH_PASSAGE).question;
    const issues = gateMdFillBlankKey(p, EMPH_PASSAGE);
    check(
      "과잉차단 금지: 본문 강조는 표식만 벗기고 낱말은 보존(were *once* regarded)",
      p.sentenceWithBlank.includes("were once regarded") && !p.sentenceWithBlank.includes("*"),
      p.sentenceWithBlank,
    );
    check(
      "과잉차단 금지: 본문 따옴표는 보존(\"Green\" corridors)",
      p.sentenceWithBlank.startsWith(`"Green" corridors`),
      p.sentenceWithBlank.slice(0, 30),
    );
    check("과잉차단 금지: 그 문항은 게이트 클린", issues.length === 0, issues.join(" / "));
  }

  // 산문 오인 금지 — 공유 머리표는 `## 정답`(콜론 없는 헤딩)까지 관용한다. 그 관용을
  // 그대로 두면 해설 본문의 `정답은 ~입니다`가 라벨로 오인돼 값이 통째로 오염된다.
  {
    const text = `빈칸문장: ${SWB}\n정답: ${ANSWER}\n해설: 이 문장은 앞의 두 장면을 하나의 개념으로 압축하는 자리입니다.\n정답은 바로 앞 문장이 지목합니다.`;
    const p = parsedOf(text);
    check(
      "산문 오인 금지: 해설 안의 `정답은 ~입니다`는 라벨이 아니다",
      p.answer === ANSWER && p.explanation.endsWith("정답은 바로 앞 문장이 지목합니다."),
      `ans='${p.answer}' exp='${p.explanation}'`,
    );
    check("산문 오인 금지: 그 문항은 게이트 클린", gateOf(text).length === 0, gateOf(text).join(" / "));
  }
  // 반대로 콜론 없는 **헤딩** 관습(`## 정답` + 다음 줄 값)은 받아 준다.
  {
    const text = `빈칸문장: ${SWB}\n## 정답\n${ANSWER}\n해설: ${EXPLANATION}`;
    const p = parsedOf(text);
    check(
      "콜론 없는 헤딩 머리표(`## 정답`) + 다음 줄 값",
      p.answer === ANSWER && gateOf(text).length === 0,
      `ans='${p.answer}' · ${gateOf(text).join(" / ")}`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정
// ───────────────────────────────────────────────────────────────────────────
{
  const s = autoSnapFillBlankKey(parseMdFillBlankKey(GOOD.replace("_____", "____")), PASSAGE);
  check(
    "스냅: 마커 폭 정규화",
    s.question.sentenceWithBlank.includes("_____") && s.corrections.some((c) => c.includes("마커 폭")),
    s.corrections.join(" / "),
  );
}
{
  const noBlank = `빈칸문장: ${SWB.replace("_____", ANSWER)}\n정답: ${ANSWER}\n해설: ${EXPLANATION}`;
  const s = autoSnapFillBlankKey(parseMdFillBlankKey(noBlank), PASSAGE);
  check(
    "스냅: 빈칸 미표기 문장을 _____ 로 치환",
    s.question.sentenceWithBlank === SWB && s.corrections.some((c) => c.includes("치환")),
    s.corrections.join(" / "),
  );
  check("스냅 후 게이트 클린", gateMdFillBlankKey(s.question, PASSAGE).length === 0);
}
{
  const s = autoSnapFillBlankKey(
    parseMdFillBlankKey(GOOD.replace(`정답: ${ANSWER}`, `정답: ${ANSWER},`)),
    PASSAGE,
  );
  check(
    "스냅: 정답 꼬리 구두점 절삭",
    s.question.answer === ANSWER && s.corrections.some((c) => c.includes("구두점")),
    `'${s.question.answer}' · ${s.corrections.join(" / ")}`,
  );
}
{
  // 관사 외출 — 학생이 관사를 쓸지 말지로 채점이 갈리는 축을 결정형으로 봉합한다.
  const withArticle = `빈칸문장: ${SWB.replace("is the _____", "is _____")}\n정답: the ${ANSWER}\n해설: ${EXPLANATION}`;
  const s = autoSnapFillBlankKey(parseMdFillBlankKey(withArticle), PASSAGE);
  check(
    "스냅: 관사를 빈칸 밖으로 이동",
    s.question.answer === ANSWER &&
      s.question.sentenceWithBlank === SWB &&
      s.corrections.some((c) => c.includes("관사")),
    `'${s.question.answer}' / '${s.question.sentenceWithBlank}'`,
  );
  check("스냅(관사) 후 게이트 클린", gateMdFillBlankKey(s.question, PASSAGE).length === 0);
}
{
  // 허용답 드리프트 — 표기 변형만 남기고 의미 변형은 절삭 + 기록(조용히 버리지 않는다).
  const drifted = `${GOOD}\n허용답:\n- adversarial scrutiny\n- critical peer review\n- ADVERSARIAL SCRUTINY`;
  const s = autoSnapFillBlankKey(parseMdFillBlankKey(drifted), PASSAGE);
  check(
    "파싱: 드리프트 허용답 3건 수집",
    parseMdFillBlankKey(drifted).acceptedAnswers.length === 3,
    String(parseMdFillBlankKey(drifted).acceptedAnswers.length),
  );
  check(
    "스냅: 동의어 허용답 절삭 + corrections 기록",
    s.question.acceptedAnswers.length === 0 &&
      s.corrections.some((c) => c.includes("critical peer review") && c.includes("폐기")),
    `남은 ${s.question.acceptedAnswers.length}건 · ${s.corrections.join(" / ")}`,
  );
}
check("표기 변형 판정: 축약형 동일 취급", orthographicKey("it's") === orthographicKey("it is"));
check("표기 변형 판정: 소유격 's 는 전개하지 않는다(오답 흡수 방지)", orthographicKey("nature's course") !== orthographicKey("nature is course"));
check("축약 전개: don't → do not", expandFillBlankKeyContractions("don't") === "do not");
check("축약 전개: cannot → can not", expandFillBlankKeyContractions("cannot") === "can not");

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 — 후처리 경계·이물 필드 금지
// ───────────────────────────────────────────────────────────────────────────
const BASE = parsedOf(GOOD);
{
  const adapt = adaptMdFillBlankKeyToAiQuestion(BASE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check("어댑터: 발문 상수(fast 표면 동일)", ai.direction === FILL_BLANK_KEY_MD_DIRECTION);
  check("어댑터: sentenceWithBlank 전달", ai.sentenceWithBlank === SWB);
  check("어댑터: answer 전달", ai.answer === ANSWER);
  check("어댑터: correctAnswer = answer", ai.correctAnswer === ANSWER);
  check("어댑터: difficulty 원본", ai.difficulty === "KILLER");
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check("어댑터: tags 빈 배열", Array.isArray(ai.tags) && (ai.tags as []).length === 0);
  check(
    "어댑터: acceptedAnswers 선두 = answer",
    Array.isArray(ai.acceptedAnswers) && (ai.acceptedAnswers as string[])[0] === ANSWER,
    JSON.stringify(ai.acceptedAnswers),
  );
  check(
    "어댑터: options 키 부재 (correct-answer-mismatch 회피)",
    !("options" in ai),
  );
  check(
    "어댑터: passageWithBlank 미생성 (후처리 전담)",
    !("passageWithBlank" in ai),
  );
  check(
    "어댑터: 타 유형 이물 필드 없음",
    !("blanks" in ai) && !("markedWords" in ai) && !("originalExpression" in ai) &&
      !("scrambledWords" in ai) && !("modelAnswer" in ai),
  );
  // 저장 표면으로 나가는 마지막 관문에서도 장식을 씻는다 — 이 유형은 PASSTHROUGH 라
  // 후처리가 값을 다시 씻어 주지 않아, 한 번 새면 학생·강사 표면까지 그대로 간다.
  for (const [name, wrap] of [
    ["굵게", (v: string) => `**${v}**`],
    ["언더스코어", (v: string) => `__${v}__`],
    ["백틱", (v: string) => `\`${v}\``],
  ] as [string, (v: string) => string][]) {
    const dirty = adaptMdFillBlankKeyToAiQuestion(
      {
        ...BASE,
        sentenceWithBlank: wrap(SWB),
        answer: wrap(ANSWER),
        explanation: wrap(EXPLANATION),
      },
      "KILLER",
    );
    const ai = (dirty.aiQuestion ?? {}) as Record<string, unknown>;
    check(
      `어댑터: 값 장식(${name})을 저장 직전에 씻고 빈칸 마커는 보존`,
      ai.sentenceWithBlank === SWB && ai.answer === ANSWER && ai.explanation === EXPLANATION &&
        ai.correctAnswer === ANSWER,
      `swb='${String(ai.sentenceWithBlank).slice(0, 24)}' ans='${String(ai.answer)}'`,
    );
  }
  check(
    "어댑터: 빈칸 마커 없으면 실패",
    adaptMdFillBlankKeyToAiQuestion({ ...BASE, sentenceWithBlank: "no blank here" }, "BASIC").ok === false,
  );
  check(
    "어댑터: 정답 없으면 실패",
    adaptMdFillBlankKeyToAiQuestion({ ...BASE, answer: "" }, "BASIC").ok === false,
  );
}
check(
  "허용답 파생: 축약형 양방향",
  deriveOrthographicVariants("it's the missing counterexample")[0] === "it is the missing counterexample",
  JSON.stringify(deriveOrthographicVariants("it's the missing counterexample")),
);
check(
  "허용답 파생: 축약 대상 없으면 0건(대소문자는 채점기가 흡수)",
  deriveOrthographicVariants(ANSWER).length === 0,
);
check(
  "허용답 조립: 중복 제거 + 정답 선두",
  buildFillBlankKeyAcceptedAnswers(ANSWER, ["Adversarial Scrutiny", "adversarial scrutiny"]).join("|") === ANSWER,
  buildFillBlankKeyAcceptedAnswers(ANSWER, ["Adversarial Scrutiny"]).join("|"),
);

// ───────────────────────────────────────────────────────────────────────────
// 6. 후처리 왕복 + 품질 검증기 무결
// ───────────────────────────────────────────────────────────────────────────
{
  const ai = (adaptMdFillBlankKeyToAiQuestion(BASE, "KILLER").aiQuestion ?? {}) as Record<string, unknown>;
  const pp = postProcessQuestion("FILL_BLANK_KEY", PASSAGE, ai as never);
  check("후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const pwb = String(data.passageWithBlank ?? "");
  check("후처리: passageWithBlank 생성", pwb.includes("_____"), pwb.slice(0, 60));
  check(
    "후처리: 지문에서 정답이 사라짐(누수 0)",
    pwb.length > 0 && countFillBlankKeyAnswerOccurrences(pwb, ANSWER) === 0,
  );
  check(
    "후처리: 빈칸 정확히 1개",
    (pwb.match(/_{3,}/g) ?? []).length === 1,
    String((pwb.match(/_{3,}/g) ?? []).length),
  );
  const issues = validateQuestionQuality({
    typeId: "FILL_BLANK_KEY",
    question: data,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    stemLanguage: "ko",
  });
  const errors = issues.filter((i) => i.severity === "error");
  check("검증기: error 0건", errors.length === 0, errors.map((e) => e.code).join(", "));
  check(
    "검증기: fbk-* 코드 0건",
    issues.every((i) => !i.code.startsWith("fbk-")),
    issues.map((i) => i.code).join(", "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 채점 왕복 — buildAnswerSpec → gradeAnswer (서술형 계열의 핵심 축)
// ───────────────────────────────────────────────────────────────────────────
function specFor(data: Record<string, unknown>) {
  return buildAnswerSpec({
    id: "q1",
    type: "ESSAY",
    subType: "FILL_BLANK_KEY",
    correctAnswer: String(data.correctAnswer ?? ""),
    structuredData: data,
    sourcePassageContent: PASSAGE,
    points: 4,
  });
}
{
  const ai = (adaptMdFillBlankKeyToAiQuestion(BASE, "KILLER").aiQuestion ?? {}) as Record<string, unknown>;
  const data = (postProcessQuestion("FILL_BLANK_KEY", PASSAGE, ai as never).data ?? {}) as Record<string, unknown>;
  const spec = specFor(data);
  check("채점: inputKind TEXT_SINGLE · EXACT", spec.inputKind === "TEXT_SINGLE" && spec.textMode === "EXACT");
  check("채점: 필드 키 'answer'", spec.fields?.[0]?.key === "answer", JSON.stringify(spec.fields?.[0]));
  const grade = (text: string) => gradeAnswer(spec, { texts: { answer: text } }).status;
  check("채점: 정확 일치 → CORRECT", grade(ANSWER) === "CORRECT");
  check("채점: 대소문자 변형 → CORRECT", grade("Adversarial Scrutiny") === "CORRECT");
  check("채점: 문말 구두점 → CORRECT", grade("adversarial scrutiny.") === "CORRECT");
  check("채점: 앞뒤 공백 → CORRECT", grade("  adversarial   scrutiny ") === "CORRECT");
  check("채점: 동의어 → WRONG (오답 흡수 없음)", grade("critical peer review") === "WRONG");
  check("채점: 관사 추가 → WRONG (관사 외출 규칙의 근거)", grade("the adversarial scrutiny") === "WRONG");
  check("채점: 빈 답 → WRONG", grade("") === "WRONG");
}

// 축약형이 있는 정답 — 결정형 파생 허용답이 실제 채점에서 흡수되는지
{
  const P2 =
    "Editors often ask why a promising manuscript stalls in review. " +
    "The honest answer is that it's the missing counterexample that keeps the argument from closing. " +
    "Readers forgive a rough style, but they do not forgive a claim that never meets resistance.";
  const q2: MdFillBlankKeyQuestion = {
    kind: "fill-blank-key",
    sentenceWithBlank: "The honest answer is that _____ that keeps the argument from closing.",
    answer: "it's the missing counterexample",
    acceptedAnswers: [],
    explanation:
      "이 문장은 앞 문장이 던진 물음에 대한 대답을 담은 자리입니다. 뒤 문장이 반론을 만나지 않는 주장을 독자가 용서하지 않는다고 서술하므로, 빈칸에는 빠진 반례를 가리키는 표현이 들어갑니다.",
  };
  check("축약형 문항: 게이트 클린", gateMdFillBlankKey(q2, P2).length === 0, gateMdFillBlankKey(q2, P2).join(" / "));
  const ai2 = (adaptMdFillBlankKeyToAiQuestion(q2, "INTERMEDIATE").aiQuestion ?? {}) as Record<string, unknown>;
  check(
    "축약형 문항: acceptedAnswers 에 전개형 파생",
    (ai2.acceptedAnswers as string[]).includes("it is the missing counterexample"),
    JSON.stringify(ai2.acceptedAnswers),
  );
  const data2 = (postProcessQuestion("FILL_BLANK_KEY", P2, ai2 as never).data ?? {}) as Record<string, unknown>;
  const spec2 = buildAnswerSpec({
    id: "q2",
    type: "ESSAY",
    subType: "FILL_BLANK_KEY",
    correctAnswer: String(data2.correctAnswer ?? ""),
    structuredData: data2,
    sourcePassageContent: P2,
    points: 4,
  });
  const g2 = (text: string) => gradeAnswer(spec2, { texts: { answer: text } }).status;
  // 지적서 #1 의 실사용 형상 — 지문은 곱슬 아포스트로피(웹·워드 붙여넣기),
  // 모델 정답은 곧은 따옴표(LLM 기본 표기). 게이트를 통과시킨 뒤 **후처리·검증·채점
  // 왕복까지** 실제로 성립하는지 확인한다(통과시켜 놓고 뒤에서 깨지면 더 나쁘다).
  {
    const CURLY = P2.replace("it's", "it’s");
    const aiC = (adaptMdFillBlankKeyToAiQuestion(q2, "INTERMEDIATE").aiQuestion ?? {}) as Record<string, unknown>;
    const ppC = postProcessQuestion("FILL_BLANK_KEY", CURLY, aiC as never);
    const dataC = (ppC.data ?? {}) as Record<string, unknown>;
    const pwbC = String(dataC.passageWithBlank ?? "");
    check("#1 곱슬 지문: 게이트 클린", gateMdFillBlankKey(q2, CURLY).length === 0, gateMdFillBlankKey(q2, CURLY).join(" / "));
    check("#1 곱슬 지문: 후처리 warnings 0", (ppC.warnings ?? []).length === 0, (ppC.warnings ?? []).join(" / "));
    check("#1 곱슬 지문: passageWithBlank 빈칸 1개", (pwbC.match(/_{3,}/g) ?? []).length === 1, pwbC.slice(0, 80));
    check(
      "#1 곱슬 지문: 지문에서 정답이 사라짐(누수 0)",
      pwbC.length > 0 && countFillBlankKeyAnswerOccurrences(pwbC, q2.answer) === 0,
    );
    const errC = validateQuestionQuality({
      typeId: "FILL_BLANK_KEY",
      question: dataC,
      passage: CURLY,
      requestedDifficulty: "INTERMEDIATE",
      stemLanguage: "ko",
    }).filter((i) => i.severity === "error");
    check("#1 곱슬 지문: 검증기 error 0건", errC.length === 0, errC.map((e) => e.code).join(", "));
  }
  check("축약형 문항: 축약형 답 → CORRECT", g2("it's the missing counterexample") === "CORRECT");
  check("축약형 문항: 전개형 답 → CORRECT (결정형 파생 흡수)", g2("it is the missing counterexample") === "CORRECT");
  check("축약형 문항: 곱슬 아포스트로피 → CORRECT", g2("it’s the missing counterexample") === "CORRECT");
  check("축약형 문항: 다른 표현 → WRONG", g2("the absent counterexample") === "WRONG");
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 레인 계약 — 과금·적격성·난이도 3분기·언어 토글
// ───────────────────────────────────────────────────────────────────────────
check("레인: subType FILL_BLANK_KEY", FILL_BLANK_KEY_MD_LANE.subType === "FILL_BLANK_KEY");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (fast VOCAB_TYPES 미포함 — 이중청구 회귀 방지)",
  FILL_BLANK_KEY_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE > 0,
  String(FILL_BLANK_KEY_MD_LANE.operationType),
);
check("레인: retryEligible", FILL_BLANK_KEY_MD_LANE.retryEligible === true);
check("레인: isEligible 항상 true(설정 노브 없음)", FILL_BLANK_KEY_MD_LANE.isEligible({}) === true);
check(
  "레인: diversityTargets = answer",
  FILL_BLANK_KEY_MD_LANE.diversityTargets({ answer: ANSWER }).join(",") === ANSWER,
);
check("레인: diversityTargets 빈 데이터 안전", FILL_BLANK_KEY_MD_LANE.diversityTargets({}).length === 0);
{
  const ctx = {
    passage: PASSAGE,
    difficulty: "KILLER" as const,
    rawDifficulty: "KILLER",
    resolved: {},
    rawTypeSettings: {},
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  };
  const parsed = FILL_BLANK_KEY_MD_LANE.parseAndGate(GOOD, ctx);
  check("레인: parseAndGate 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join(" / "));
  const adapted = FILL_BLANK_KEY_MD_LANE.adapt(parsed, ctx);
  check("레인: adapt 성공 · 한국어 발문", adapted.ok && adapted.aiQuestion?.direction === FILL_BLANK_KEY_MD_DIRECTION);
  check("레인: buildExtras 한국어 기본은 비어 있음", FILL_BLANK_KEY_MD_LANE.buildExtras(ctx).length === 0);
  check(
    "레인: qualityArgs stemLanguage 만",
    JSON.stringify(FILL_BLANK_KEY_MD_LANE.qualityArgs(ctx)) === JSON.stringify({ stemLanguage: "ko" }),
  );
  check(
    "레인: mdFormat 포렌식(허용답 파생 표기)",
    FILL_BLANK_KEY_MD_LANE.mdFormat(ctx).acceptedAnswers === "derived" &&
      FILL_BLANK_KEY_MD_LANE.mdFormat(ctx).blankCount === 1,
  );

  const enCtx = { ...ctx, rawTypeSettings: { stemLanguage: "en" } };
  check("레인: 영어 발문 설정 → extras 블록", FILL_BLANK_KEY_MD_LANE.buildExtras(enCtx).length === 1);
  const enAdapt = FILL_BLANK_KEY_MD_LANE.adapt(FILL_BLANK_KEY_MD_LANE.parseAndGate(GOOD, enCtx), enCtx);
  check(
    "레인: 영어 발문 설정 → direction 영문 상수",
    enAdapt.aiQuestion?.direction === FILL_BLANK_KEY_MD_DIRECTION_EN,
    String(enAdapt.aiQuestion?.direction),
  );
}
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdFillBlankKeyPrompt(PASSAGE, "full", d);
  check(
    `프롬프트 ${d}: 난이도 분기 + 형식 리터럴 + 지문 포함`,
    p.includes("빈칸문장:") && p.includes("정답:") && p.includes("해설:") &&
      p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)),
  );
}
check(
  "프롬프트: 난이도별 문구가 실제로 다르다",
  new Set(
    (["BASIC", "INTERMEDIATE", "KILLER"] as const).map((d) => buildMdFillBlankKeyPrompt(PASSAGE, "full", d)),
  ).size === 3,
);
check(
  "프롬프트: 허용답 칸을 요구하지 않는다(오답 흡수 구조적 차단)",
  !buildMdFillBlankKeyPrompt(PASSAGE, "full", "KILLER").includes("허용답:"),
);
check(
  "프롬프트: 유일 지목 + 축자 부재 2축 명시",
  buildMdFillBlankKeyPrompt(PASSAGE, "full", "KILLER").includes("유일 지목") &&
    buildMdFillBlankKeyPrompt(PASSAGE, "full", "KILLER").includes("축자 부재"),
);
check(
  "프롬프트: answer-only 모드는 해설 1문장",
  buildMdFillBlankKeyPrompt(PASSAGE, "answer-only", "KILLER").includes("딱 1문장"),
);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
