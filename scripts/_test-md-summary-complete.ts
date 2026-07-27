// 요약문 완성 단답형(SUMMARY_COMPLETE) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → validateQuestionQuality 왕복 +
// **buildAnswerSpec → gradeAnswer 채점 왕복**(서술형 계열의 핵심 추가 축) + 과금·적격성.
// 실행: npx tsx scripts/_test-md-summary-complete.ts
//
// 형식 계약(규범 §1-B 철칙 1 적용): 정답의 유일 진실원은 `정답(X):` 줄이고,
// `모범답안:` 줄도 `허용답:` 안의 정답 자기복제도 두지 않는다. correctAnswer 와
// acceptedAnswers[0] 은 어댑터가 그 줄에서 파생한다.
import {
  autoSnapSummaryComplete,
  parseMdSummaryComplete,
  summaryCompleteLabelSequence,
  type MdSummaryCompleteQuestion,
} from "../src/lib/md-qgen/parser-summary-complete";
import { gateMdSummaryComplete } from "../src/lib/md-qgen/gate-summary-complete";
import {
  SUMMARY_COMPLETE_MD_DIRECTION,
  adaptMdSummaryCompleteToAiQuestion,
} from "../src/lib/md-qgen/adapter-summary-complete";
import { SUMMARY_COMPLETE_MD_LANE } from "../src/lib/md-qgen/lane-summary-complete";
import {
  buildMdSummaryCompletePrompt,
  clampSummaryCompleteMdBlankCount,
  summaryCompleteMdLabels,
} from "../src/lib/md-qgen/prompts-summary-complete";
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
  "Modern playgrounds are engineered to remove every conceivable hazard, and designers treat each padded surface as a small victory. " +
  "Yet developmental researchers keep reporting the same paradox: the safer a play space looks, the more often children are hurt in it. " +
  "When a climbing frame never punishes a careless step, a child gathers no evidence about how far a body can lean before it falls. " +
  "That evidence is exactly what lets an older child refuse a jump that no adult would ever have forbidden. " +
  "Protection, pushed far enough, quietly removes the very lesson it was meant to deliver.";

const SUMMARY =
  "Because a hazard-free play space never lets a child test the limits of a body, protection leaves the young (A) in judging danger and finally becomes a source of (B).";

const EXPLANATION =
  "해설: 글은 위험을 모두 제거한 놀이터일수록 아이가 자기 몸의 한계를 시험할 근거를 얻지 못한다고 말합니다. 그래서 첫 빈칸에는 판단이 훈련되지 않았다는 뜻의 말이, 둘째 빈칸에는 보호가 오히려 낳는 취약함이 들어갑니다.";

const GOOD = `요약문: ${SUMMARY}
정답(A): untrained
허용답(A): unpracticed
정답(B): vulnerability
허용답(B): fragility, exposure
${EXPLANATION}`;

function snapOf(text: string, blankCount = 2) {
  return autoSnapSummaryComplete(parseMdSummaryComplete(text), { blankCount });
}
function gateOf(text: string, blankCount = 2): string[] {
  return gateMdSummaryComplete(snapOf(text, blankCount).question, PASSAGE, {
    blankCount,
  });
}
function ctxOf(blankCount = 2, rawTypeSettings: unknown = null): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { summaryCompleteBlankCount: blankCount },
    rawTypeSettings,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdSummaryComplete(GOOD);
check("파싱: 요약문 한 줄", parsed.summary === SUMMARY, parsed.summary.slice(0, 60));
check("파싱: 빈칸 2개", parsed.blanks.length === 2, `실제 ${parsed.blanks.length}`);
check(
  "파싱: 라벨 축 (A)(B) 괄호 대문자 고정",
  parsed.blanks.map((b) => b.label).join("") === "(A)(B)",
  parsed.blanks.map((b) => b.label).join(""),
);
check(
  "파싱: 정답 값",
  parsed.blanks[0].answer === "untrained" && parsed.blanks[1].answer === "vulnerability",
  parsed.blanks.map((b) => b.answer).join("|"),
);
check(
  "파싱: 허용답 목록 (', ' 구분자)",
  parsed.blanks[0].accepted.join("|") === "unpracticed" &&
    parsed.blanks[1].accepted.join("|") === "fragility|exposure",
  parsed.blanks[1].accepted.join("|"),
);
check("파싱: 해설 존재", parsed.explanation.length > 30, parsed.explanation.slice(0, 40));
check(
  "파싱: 허용답에 정답 자기복제를 받지 않는다(철칙 1)",
  !parsed.blanks[0].accepted.includes("untrained"),
);
check(
  "라벨 시퀀스 추출: 요약문 등장순 (A)(B)",
  summaryCompleteLabelSequence(SUMMARY).join("") === "(A)(B)",
);

const snapped = snapOf(GOOD);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check("게이트: 정상 입력 클린", gateOf(GOOD).length === 0, gateOf(GOOD).join(" / "));

// 난이도·빈칸 수 변주 정상경로 (BASIC 1빈칸 / INTERMEDIATE 3빈칸)
{
  const one = `요약문: Because a hazard-free play space never lets a child test the limits of a body, protection finally becomes a source of (A).
정답(A): vulnerability
해설: 글은 위험 제거가 오히려 아이의 판단 근거를 없앤다고 말합니다. 그래서 빈칸에는 보호가 낳는 취약함이 들어갑니다.`;
  check("정상: 1빈칸 게이트 클린", gateOf(one, 1).length === 0, gateOf(one, 1).join(" / "));
  const three = `요약문: Because a hazard-free play space never lets a child test the limits of a body, protection leaves the young (A) in judging danger, turns caution into (B), and finally becomes a source of (C).
정답(A): untrained
정답(B): dependence
정답(C): vulnerability
해설: 글은 위험 제거가 아이의 판단 근거를 없앤다고 말합니다. 세 빈칸은 원인에서 귀결로 이어지는 논지를 차례로 압축합니다.`;
  check("정상: 3빈칸 게이트 클린", gateOf(three, 3).length === 0, gateOf(three, 3).join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 요약문 누락",
  gateOf(GOOD.replace(`요약문: ${SUMMARY}\n`, "")).some((i) => i.includes("요약문 누락")),
);
check(
  "게이트: 요약문에 라벨 (B) 없음",
  gateOf(GOOD.replace(" of (B).", " of danger.")).some((i) => i.includes("순서로 각 1회가 아님")),
);
check(
  "게이트: 라벨이 2회 등장",
  gateOf(GOOD.replace("in judging danger", "in judging (B) danger")).some((i) =>
    i.includes("(B) 가 2회 등장"),
  ),
);
check(
  "게이트: 설정 범위 밖 라벨이 요약문에 있음",
  gateOf(GOOD.replace("a source of (B).", "a source of (B) and (C).")).some((i) =>
    i.includes("설정 범위 밖 빈칸 라벨 (C)"),
  ),
);
check(
  "게이트: 정답 줄 누락 — 자리를 지목한다",
  gateOf(GOOD.replace("정답(B): vulnerability\n", "")).some((i) =>
    i.includes("정답(B) 줄을 인식할 수 없음"),
  ),
);
check(
  "게이트: 설정 범위 밖 정답 줄",
  gateOf(`${GOOD}\n정답(C): spare`).some((i) =>
    i.includes("설정 범위 밖 빈칸 라벨 (C) 의 정답 줄"),
  ),
);
check(
  "게이트: 정답에 한국어",
  gateOf(GOOD.replace("정답(B): vulnerability", "정답(B): 취약함")).some((i) =>
    i.includes("한국어가 섞임"),
  ),
);
check(
  "게이트: 정답이 요약문에 노출",
  gateOf(GOOD.replace("a source of (B).", "a source of vulnerability (B).")).some((i) =>
    i.includes("요약문에 그대로 노출됨"),
  ),
);
check(
  "게이트: 두 빈칸 정답 중복",
  gateOf(GOOD.replace("정답(B): vulnerability", "정답(B): untrained")).some((i) =>
    i.includes("정답이 동일"),
  ),
);
check(
  "게이트: 정답 단어 수 초과(5단어 초과)",
  gateOf(
    GOOD.replace("정답(B): vulnerability", "정답(B): a very long explanatory phrase here"),
  ).some((i) => i.includes("단어로 김")),
);
check(
  "게이트: 정답에 라벨 재부착",
  gateMdSummaryComplete(
    {
      ...snapped.question,
      blanks: [
        snapped.question.blanks[0],
        { ...snapped.question.blanks[1], answer: "(B) vulnerability" },
      ],
    },
    PASSAGE,
    { blankCount: 2 },
  ).some((i) => i.includes("빈칸 라벨이 붙어 있음")),
);
check(
  "게이트: 정답이 지문 문장의 통째 복사",
  gateOf(GOOD.replace("정답(B): vulnerability", "정답(B): conceivable hazard")).some((i) =>
    i.includes("지문 문장의 통째 복사"),
  ),
);
check(
  "게이트: 요약문이 지문을 연속 8단어 복사",
  gateOf(
    GOOD.replace(
      SUMMARY,
      "Because a child gathers no evidence about how far a body may lean, protection leaves the young (A) and finally becomes a source of (B).",
    ),
  ).some((i) => i.includes("연속 8단어 이상 그대로 옮김")),
);
check(
  "게이트: 요약문에 밑줄 잔존",
  gateOf(GOOD.replace("in judging danger", "in _____ judging danger")).some((i) =>
    i.includes("밑줄(_____)이 있음"),
  ),
);
check(
  "게이트: 요약문에 한국어 섞임",
  gateOf(GOOD.replace("a source of (B).", "a source of 취약함 (B).")).some((i) =>
    i.includes("요약문에 한국어가 섞임"),
  ),
);
check(
  "게이트: 요약문 종결 부호 없음(생성 절단)",
  gateOf(GOOD.replace("a source of (B).", "a source of (B)")).some((i) =>
    i.includes("문장 종결 부호 없이 끝남"),
  ),
);
check(
  "게이트: 요약문이 두 문장",
  gateOf(
    GOOD.replace(
      SUMMARY,
      "Protection removes every risk. Children then grow (A) in judging danger and become a source of (B).",
    ),
  ).some((i) => i.includes("두 문장 이상")),
);
check(
  "게이트: 요약문이 너무 짧음",
  gateOf(GOOD.replace(SUMMARY, "Play (A) becomes (B).")).some((i) =>
    i.includes("너무 짧음"),
  ),
);
check(
  "게이트: 허용답이 다른 빈칸 정답과 동일(채점 사고)",
  gateOf(GOOD.replace("허용답(A): unpracticed", "허용답(A): unpracticed, vulnerability")).some(
    (i) => i.includes("의 정답과 동일"),
  ),
);
check(
  "게이트: 허용답에 한국어",
  gateOf(GOOD.replace("허용답(B): fragility, exposure", "허용답(B): fragility, 취약함")).some(
    (i) => i.includes("허용답(B) 값에 한국어가 섞임"),
  ),
);
check(
  "게이트: 허용답이 요약문에 노출",
  gateOf(GOOD.replace("허용답(B): fragility, exposure", "허용답(B): fragility, protection")).some(
    (i) => i.includes("허용답(B) 값('protection')이 요약문에 그대로 노출됨"),
  ),
);
check(
  "게이트: 허용답에 정답 자기복제(스냅 우회 직접 호출)",
  gateMdSummaryComplete(
    {
      ...snapped.question,
      blanks: [
        { ...snapped.question.blanks[0], accepted: ["untrained"] },
        snapped.question.blanks[1],
      ],
    },
    PASSAGE,
    { blankCount: 2 },
  ).some((i) => i.includes("정답과 같은 값")),
);
check(
  "게이트: 해설 누락",
  gateOf(GOOD.replace(EXPLANATION, "")).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 해설이 한국어가 아님",
  gateOf(GOOD.replace(EXPLANATION, "해설: The summary compresses the paradox of protection.")).some(
    (i) => i.includes("해설이 한국어가 아님"),
  ),
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 2빈칸 + 게이트 클린이어야 한다(줄 유실 회귀 방지).
//    규범 §1-B 철칙 3: 장식 하나에 줄이 통째로 사라지면 원인이 은폐된다.
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두", "정답(A): untrained", "- 정답(A): untrained"],
  ["별표 불릿", "정답(A): untrained", "* 정답(A): untrained"],
  ["가운뎃점 불릿", "정답(B): vulnerability", "· 정답(B): vulnerability"],
  ["번호 목록 접두", "정답(B): vulnerability", "2. 정답(B): vulnerability"],
  ["굵게 라벨", "정답(B): vulnerability", "**정답(B):** vulnerability"],
  ["굵게 + 불릿", "정답(A): untrained", "- **정답(A):** untrained"],
  ["표 형식 행", "정답(B): vulnerability", "| 정답(B) | vulnerability |"],
  ["잔여 파이프", "정답(B): vulnerability", "정답(B): vulnerability | 취약함"],
  ["라벨 소문자", "정답(B): vulnerability", "정답(b): vulnerability"],
  ["대괄호 라벨", "정답(B): vulnerability", "정답[B]: vulnerability"],
  ["전각 콜론", "정답(B): vulnerability", "정답(B)： vulnerability"],
  ["라벨 앞 공백", "정답(B): vulnerability", "정답 (B) : vulnerability"],
  ["괄호 없는 라벨", "정답(B): vulnerability", "정답 B: vulnerability"],
  ["머리표 접힘(값이 다음 줄)", "정답(B): vulnerability", "정답(B):\nvulnerability"],
  ["요약문 접힘(값이 다음 줄)", `요약문: ${SUMMARY}`, `요약문:\n${SUMMARY}`],
  ["허용답 세미콜론 구분자", "허용답(B): fragility, exposure", "허용답(B): fragility; exposure"],
  ["허용답 슬래시 구분자", "허용답(B): fragility, exposure", "허용답(B): fragility / exposure"],
  ["허용답 구분자 공백 과다", "허용답(B): fragility, exposure", "허용답(B): fragility ,  exposure"],
  ["허용답 머리표 변형(동치)", "허용답(B): fragility, exposure", "동치(B): fragility, exposure"],
  ["허용답 머리표 변형(허용 답안)", "허용답(A): unpracticed", "허용 답안(A): unpracticed"],
  ["허용답 '없음' 표기", "허용답(A): unpracticed", "허용답(A): 없음"],
  ["허용답 'none' 표기", "허용답(A): unpracticed", "허용답(A): none"],
  ["허용답 빈 값", "허용답(A): unpracticed", "허용답(A):"],
  ["해설 개행 분할", EXPLANATION, EXPLANATION.replace(". ", ".\n")],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = snapOf(drifted).question;
  const issues = gateMdSummaryComplete(q, PASSAGE, { blankCount: 2 });
  check(
    `드리프트 관용: ${name}`,
    q.blanks.length === 2 && issues.length === 0,
    `빈칸 ${q.blanks.length}개 · ${issues.join(" / ")}`,
  );
}

// 라벨 없는 구형 단일 표기 — blankCount=1 에서 (A) 로 귀속된다.
{
  const bare = `요약문: Because a hazard-free play space never lets a child test the limits of a body, protection finally becomes a source of (A).
정답: vulnerability
허용답: fragility
해설: 글은 위험 제거가 아이의 판단 근거를 없앤다고 말합니다. 빈칸에는 보호가 낳는 취약함이 들어갑니다.`;
  const q = snapOf(bare, 1).question;
  check(
    "드리프트 관용: 라벨 없는 `정답:` → (A) 귀속",
    q.blanks.length === 1 && q.blanks[0].label === "(A)" && q.blanks[0].answer === "vulnerability",
    JSON.stringify(q.blanks),
  );
  check(
    "드리프트 관용: 라벨 없는 `허용답:` → (A) 귀속 + 게이트 클린",
    q.blanks[0].accepted.join("|") === "fragility" &&
      gateMdSummaryComplete(q, PASSAGE, { blankCount: 1 }).length === 0,
    gateMdSummaryComplete(q, PASSAGE, { blankCount: 1 }).join(" / "),
  );
}

// 과잉 관용 방지 — 머리표 없는 산문 줄은 빈칸으로 오인하지 않는다.
{
  const prose = GOOD.replace("정답(A): untrained", "위 요약문은 지문 전체를 압축한 것이다.\n정답(A): untrained");
  const q = snapOf(prose).question;
  check("과잉 관용 방지: 머리표 없는 산문 줄 무시", q.blanks.length === 2, `실제 ${q.blanks.length}`);
}

// ── 회귀: 키워드 줄 무관용 silent-drop (적대검수 2웨이브 지배 계통) ─────────────
// 키워드 줄이 장식 하나에 통째로 사라지면 게이트가 "정답 누락"이라는 **사실과
// 다른** 원인을 지목하고, 그 문구가 그대로 [반려 재생성] 피드백이 되어 모델을
// 엉뚱한 방향으로 몬다(규범 §1-B 철칙 3·5).
const KEYWORD_DRIFTS: [string, string, string][] = [
  ["헤딩 접두 `## 정답(A):`", "정답(A): untrained", "## 정답(A): untrained"],
  ["헤딩 접두 `#### 정답(B):`", "정답(B): vulnerability", "#### 정답(B): vulnerability"],
  ["헤딩 접두 `## 요약문:`", "요약문: ", "## 요약문: "],
  ["헤딩 접두 `### 해설:`", EXPLANATION, `### ${EXPLANATION}`],
  ["헤딩 접두 `## 허용답(B):`", "허용답(B): fragility, exposure", "## 허용답(B): fragility, exposure"],
  ["단일 별표 강조 `*정답(A):*`", "정답(A): untrained", "*정답(A):* untrained"],
  ["삼중 별표 강조", "정답(B): vulnerability", "***정답(B):*** vulnerability"],
  ["별표 + 전각 콜론", "정답(B): vulnerability", "*정답(B)：* vulnerability"],
  ["대괄호 머리표 `[해설]:`", "해설:", "[해설]:"],
  ["대괄호 머리표 `[정답(A)]:`", "정답(A):", "[정답(A)]:"],
  ["전각 대괄호 머리표 `【해설】:`", "해설:", "【해설】:"],
  ["헤딩 + 불릿 + 굵게 복합", "정답(A): untrained", "## - **정답(A):** untrained"],
];
for (const [name, from, to] of KEYWORD_DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = snapOf(drifted).question;
  const issues = gateMdSummaryComplete(q, PASSAGE, { blankCount: 2 });
  check(
    `키워드 줄 관용(silent-drop 회귀): ${name}`,
    q.blanks.length === 2 && issues.length === 0 && q.summary === SUMMARY,
    `빈칸 ${q.blanks.length}개 · ${issues.join(" / ")}`,
  );
}
check(
  "키워드 줄 관용: 머리표가 아닌 헤딩(`## 지문`)은 종전대로 섹션 경계",
  (() => {
    const q = snapOf(`${GOOD}\n\n## 지문\n${PASSAGE}`).question;
    return q.blanks.length === 2 && !q.explanation.includes("Modern playgrounds");
  })(),
  snapOf(`${GOOD}\n\n## 지문\n${PASSAGE}`).question.explanation.slice(-40),
);
check(
  "키워드 줄 관용: 요약문의 `_____` 는 여전히 남아 게이트가 잡는다(밑줄 미삭제)",
  gateMdSummaryComplete(
    { ...parseMdSummaryComplete(GOOD.replace("in judging danger", "in _____ judging danger")) },
    PASSAGE,
    { blankCount: 2 },
  ).some((i) => i.includes("밑줄(_____)이 있음")),
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정
// ───────────────────────────────────────────────────────────────────────────
{
  const s = snapOf(GOOD.replace("the young (A) in judging", "the young (A) _____ in judging"));
  check(
    "스냅: 라벨 뒤 밑줄 표기 제거",
    s.corrections.some((c) => c.includes("밑줄")) && !/_{2,}/.test(s.question.summary),
    s.corrections.join(" / "),
  );
  check(
    "스냅 후 게이트 클린(밑줄 보정본)",
    gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).length === 0,
    gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).join(" / "),
  );
}
{
  const s = snapOf(GOOD.replace('정답(A): untrained', '정답(A): "untrained".'));
  check(
    "스냅: 정답의 따옴표·문말 구두점 제거",
    s.question.blanks[0].answer === "untrained" && s.corrections.length === 1,
    `${s.question.blanks[0].answer} / ${s.corrections.join(" / ")}`,
  );
}
{
  const s = snapOf(GOOD.replace("정답(A): untrained", "정답(A): (A) untrained"));
  check(
    "스냅: 정답 앞 라벨 재부착 제거",
    s.question.blanks[0].answer === "untrained",
    s.question.blanks[0].answer,
  );
}
{
  const s = snapOf(GOOD.replace("허용답(A): unpracticed", "허용답(A): untrained, unpracticed"));
  check(
    "스냅: 허용답에서 정답과 같은 값 제거(중복 계약)",
    s.question.blanks[0].accepted.join("|") === "unpracticed" &&
      s.corrections.some((c) => c.includes("정답과 같은 값")),
    s.corrections.join(" / "),
  );
}
{
  const s = snapOf(GOOD.replace("허용답(B): fragility, exposure", "허용답(B): fragility, Fragility, exposure"));
  check(
    "스냅: 허용답 중복 제거(대소문자 무관)",
    s.question.blanks[1].accepted.join("|") === "fragility|exposure" &&
      s.corrections.some((c) => c.includes("허용답 중복")),
    s.corrections.join(" / "),
  );
}
{
  const swapped = `요약문: ${SUMMARY}
정답(B): vulnerability
허용답(B): fragility
정답(A): untrained
${EXPLANATION}`;
  const s = snapOf(swapped);
  check(
    "파싱: 정답 줄이 뒤바뀌어 와도 라벨 축으로 정규화",
    s.question.blanks.map((b) => b.label).join("") === "(A)(B)" &&
      s.question.blanks[0].answer === "untrained",
    JSON.stringify(s.question.blanks.map((b) => `${b.label}=${b.answer}`)),
  );
  check(
    "스냅 후 게이트 클린(순서 보정본)",
    gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).length === 0,
    gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).join(" / "),
  );
}
{
  // 스냅 단독 호출(파서 우회) — 라벨 역순 입력도 (A)(B) 로 정렬하고 보정을 기록한다.
  const reversed: MdSummaryCompleteQuestion = {
    kind: "summaryComplete",
    summary: SUMMARY,
    blanks: [
      { label: "(B)", answer: "vulnerability", accepted: [] },
      { label: "(A)", answer: "untrained", accepted: [] },
    ],
    explanation: "글은 보호가 판단 근거를 없앤다고 말합니다.",
  };
  const s = autoSnapSummaryComplete(reversed, { blankCount: 2 });
  check(
    "스냅: 라벨 역순 입력을 (A)(B) 로 정렬하고 보정 기록",
    s.question.blanks.map((b) => b.label).join("") === "(A)(B)" &&
      s.corrections.some((c) => c.includes("제시 순서")),
    `${s.question.blanks.map((b) => b.label).join("")} / ${s.corrections.join(" / ")}`,
  );
}
{
  const one = `요약문: Because a hazard-free play space never lets a child test the limits of a body, protection finally becomes a source of (A).
정답(B): vulnerability
해설: 글은 위험 제거가 아이의 판단 근거를 없앤다고 말합니다. 빈칸에는 보호가 낳는 취약함이 들어갑니다.`;
  const s = snapOf(one, 1);
  check(
    "스냅: 1빈칸에서 라벨 축을 요약문 라벨 (A) 로 보정",
    s.question.blanks[0].label === "(A)" && s.corrections.some((c) => c.includes("보정")),
    `${s.question.blanks[0].label} / ${s.corrections.join(" / ")}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4-B. 적대검수 2웨이브 회귀 — 값 라벨 승격 · 요약문 라벨 정규화 · 정답 대안 나열
// ───────────────────────────────────────────────────────────────────────────

// [critical] 값 선두의 (X) 를 '장식'으로 버리면 도착 순서 귀속이 (A)/(B) 를
// 조용히 뒤바꾼 채 게이트를 CLEAN 으로 통과한다. EXACT 채점이라 되돌릴 수 없다.
{
  const bareHeads = `요약문: ${SUMMARY}
정답: (B) vulnerability
정답: (A) untrained
${EXPLANATION}`;
  const s = snapOf(bareHeads);
  check(
    "회귀[critical]: 머리표 라벨이 없으면 **값 라벨**로 귀속(도착 순서 폴백보다 우선)",
    s.question.blanks.map((b) => `${b.label}=${b.answer}`).join("|") ===
      "(A)=untrained|(B)=vulnerability",
    JSON.stringify(s.question.blanks),
  );
  check(
    "회귀[critical]: 값 라벨 귀속본은 게이트 클린 + correctAnswer 가 뒤바뀌지 않는다",
    gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).length === 0 &&
      adaptMdSummaryCompleteToAiQuestion(s.question, "KILLER", 2).aiQuestion
        ?.correctAnswer === "(A) untrained, (B) vulnerability",
    String(adaptMdSummaryCompleteToAiQuestion(s.question, "KILLER", 2).aiQuestion?.correctAnswer),
  );
}
{
  // 머리표 라벨과 값 라벨이 충돌하면 **스냅이 조용히 지우지 않고** 게이트가 자리를 지목한다.
  const conflict = `요약문: ${SUMMARY}
정답(A): (B) vulnerability
정답(B): (A) untrained
${EXPLANATION}`;
  const s = snapOf(conflict);
  const issues = gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 });
  check(
    "회귀[critical]: 머리표 라벨 ≠ 값 라벨이면 스냅이 값을 지우지 않는다",
    s.question.blanks[0].answer === "(B) vulnerability" &&
      !s.corrections.some((c) => c.includes("표기 제거")),
    `${s.question.blanks[0].answer} / ${s.corrections.join(" / ")}`,
  );
  check(
    "회귀[critical]: 라벨 충돌은 게이트가 자리를 지목해 반려(§1-B 철칙 5)",
    issues.some((i) => i.includes("정답(A) 줄의 값에 다른 빈칸 라벨 (B) 가 붙어 있음")) &&
      issues.some((i) => i.includes("정답(B) 줄의 값에 다른 빈칸 라벨 (A) 가 붙어 있음")),
    issues.join(" / "),
  );
  // 전각 괄호로 온 타라벨도 같은 자리에서 잡힌다.
  check(
    "회귀[critical]: 전각 괄호 타라벨 `（B）` 도 반려",
    gateOf(`요약문: ${SUMMARY}
정답(A): （B） vulnerability
정답(B): untrained
${EXPLANATION}`).some((i) => i.includes("다른 빈칸 라벨 (B) 가 붙어 있음")),
  );
}
{
  // 무회귀: **자기 라벨** 재부착은 종전대로 장식으로 벗긴다.
  const s = snapOf(`요약문: ${SUMMARY}
정답(A): (A) untrained
정답(B): (B) vulnerability
${EXPLANATION}`);
  check(
    "회귀[critical]: 자기 라벨 재부착은 종전대로 제거(무회귀)",
    s.question.blanks.map((b) => b.answer).join("|") === "untrained|vulnerability" &&
      gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).length === 0,
    JSON.stringify(s.question.blanks),
  );
  // 범위 밖 글자 접두는 라벨 정보가 아니라 장식이므로 종전대로 제거한다.
  check(
    "회귀[critical]: 범위 밖 `(x)` 접두는 장식으로 제거(과잉 반려 방지)",
    snapOf(GOOD.replace("정답(A): untrained", "정답(A): (x) untrained")).question.blanks[0]
      .answer === "untrained",
  );
  // 허용답 값에도 같은 규칙이 걸린다.
  check(
    "회귀[critical]: 허용답 값의 타라벨도 지우지 않고 게이트가 반려",
    gateOf(GOOD.replace("허용답(A): unpracticed", "허용답(A): (B) unpracticed")).some((i) =>
      i.includes("허용답(A) 줄의 값에 다른 빈칸 라벨 (B) 가 붙어 있음"),
    ),
    gateOf(GOOD.replace("허용답(A): unpracticed", "허용답(A): (B) unpracticed")).join(" / "),
  );
}

// [major] 요약문의 소문자·전각 빈칸 라벨을 스냅이 정규화하지 않으면, 게이트는
// 대문자로 접어 보고 CLEAN 을 주는데 저장본에는 `(b)` 가 그대로 남아 학생 화면에
// 빈칸선 없는 `(b)` 가 인쇄된다(형제 레인 autoSnapSummaryMc S1 과 동일 보정).
for (const [name, surface] of [
  ["소문자 `(b)`", "of (b)."],
  ["전각 괄호 `（B）`", "of （B）."],
  ["괄호 안 공백 `( B )`", "of ( B )."],
  ["전각 + 소문자 `（b）`", "of （b）."],
] as const) {
  const s = snapOf(GOOD.replace("of (B).", surface));
  check(
    `회귀[major]: 요약문 라벨 표기 정규화 — ${name}`,
    s.question.summary === SUMMARY &&
      s.corrections.some((c) => c.includes("라벨 표기를 (A) 축으로 정규화")) &&
      gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).length === 0,
    `${s.question.summary.slice(-40)} / ${s.corrections.join(" / ")}`,
  );
}
check(
  "회귀[major]: 라벨 범위 밖 영문 괄호 표기(`designer(s)`)는 훼손하지 않는다",
  (() => {
    const withParens = GOOD.replace("protection leaves", "the designer(s) let protection leave");
    const s = snapOf(withParens);
    return (
      s.question.summary.includes("designer(s)") &&
      s.corrections.length === 0 &&
      gateMdSummaryComplete(s.question, PASSAGE, { blankCount: 2 }).length === 0
    );
  })(),
  snapOf(GOOD.replace("protection leaves", "the designer(s) let protection leave")).question.summary,
);

// [major] `정답(X):` 값의 대안 나열 — EXACT 채점이라 그 문자열 전체가 유일 정답이
// 되어 어떤 학생도 맞힐 수 없다. 동치는 `허용답(X):` 줄이 맡는다.
for (const [name, value] of [
  ["슬래시", "untrained/unpracticed"],
  ["쉼표", "untrained, unpracticed"],
  ["세미콜론", "untrained; unpracticed"],
  ["괄호 병기", "untrained (or unpracticed)"],
  ["or 연결", "untrained or unpracticed"],
] as const) {
  check(
    `회귀[major]: 정답 값 대안 나열 반려 — ${name}`,
    gateOf(GOOD.replace("정답(A): untrained", `정답(A): ${value}`)).some((i) =>
      i.includes("정답(A) 값에 대안이"),
    ),
    gateOf(GOOD.replace("정답(A): untrained", `정답(A): ${value}`)).join(" / "),
  );
}
check(
  "회귀[major]: 대안 나열 검사는 **허용답에는 적용하지 않는다**(목록이 정상인 자리)",
  gateOf(GOOD).length === 0 &&
    gateOf(GOOD.replace("허용답(B): fragility, exposure", "허용답(B): fragility, exposure, frailty"))
      .length === 0,
  gateOf(GOOD.replace("허용답(B): fragility, exposure", "허용답(B): fragility, exposure, frailty")).join(" / "),
);
check(
  "회귀[major]: 하이픈·아포스트로피 정답은 대안 나열로 오인하지 않는다(과잉 반려 방지)",
  gateOf(
    GOOD.replace("정답(A): untrained", "정답(A): risk-blind").replace(
      "정답(B): vulnerability",
      "정답(B): others' exposure",
    ),
  ).length === 0,
  gateOf(
    GOOD.replace("정답(A): untrained", "정답(A): risk-blind").replace(
      "정답(B): vulnerability",
      "정답(B): others' exposure",
    ),
  ).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → postProcessQuestion → validateQuestionQuality 왕복
// ───────────────────────────────────────────────────────────────────────────
const adapt = adaptMdSummaryCompleteToAiQuestion(snapped.question, "KILLER", 2);
check("어댑터: 성공", adapt.ok === true, adapt.error);
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
check("어댑터: direction 상수(fast 산출 문구 유지)", ai.direction === SUMMARY_COMPLETE_MD_DIRECTION);
check("어댑터: summaryWithBlanks 실림", ai.summaryWithBlanks === SUMMARY);
{
  const blanks = ai.blanks as Array<Record<string, unknown>>;
  check("어댑터: blanks 2개 · 라벨 (A)(B)", blanks.length === 2 && blanks[0].label === "(A)" && blanks[1].label === "(B)");
  check(
    "어댑터: acceptedAnswers 선두에 answer 강제 삽입(스키마 계약)",
    (blanks[0].acceptedAnswers as string[])[0] === "untrained" &&
      (blanks[1].acceptedAnswers as string[])[0] === "vulnerability",
    JSON.stringify(blanks.map((b) => b.acceptedAnswers)),
  );
  check(
    "어댑터: acceptedAnswers 에 동치 병합",
    (blanks[0].acceptedAnswers as string[]).join("|") === "untrained|unpracticed" &&
      (blanks[1].acceptedAnswers as string[]).join("|") === "vulnerability|fragility|exposure",
    JSON.stringify(blanks.map((b) => b.acceptedAnswers)),
  );
}
check(
  "어댑터: correctAnswer 는 정답 줄에서 파생 '(A) x, (B) y'",
  ai.correctAnswer === "(A) untrained, (B) vulnerability",
  String(ai.correctAnswer),
);
check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
check("어댑터: tags 빈 배열", Array.isArray(ai.tags) && (ai.tags as []).length === 0);
check("어댑터: difficulty 원본 전달", ai.difficulty === "KILLER");
check(
  "어댑터: ‼ options 키 부재 (correct-answer-mismatch 회귀 방지)",
  !("options" in ai),
);
check(
  "어댑터: 타 유형 이물 필드 없음",
  !("passageWithBlank" in ai) &&
    !("passageWithMarkers" in ai) &&
    !("markedWords" in ai) &&
    !("scrambledWords" in ai) &&
    !("modelAnswer" in ai) &&
    !("scoringCriteria" in ai) &&
    !("wrongOptionExplanations" in ai),
);
check(
  "어댑터: 빈칸 정답 누락이면 실패",
  adaptMdSummaryCompleteToAiQuestion(
    { ...snapped.question, blanks: [snapped.question.blanks[0]] },
    "KILLER",
    2,
  ).ok === false,
);

const pp = postProcessQuestion("SUMMARY_COMPLETE", PASSAGE, ai as never);
check("후처리: PASSTHROUGH 성공", pp.success === true, pp.error);
const data = (pp.data ?? {}) as Record<string, unknown>;
check("후처리: 지문 파생 필드를 만들지 않는다(어댑터가 완제품)", !("passageWithBlank" in data));
check("후처리: blanks·summaryWithBlanks 보존", !!data.blanks && data.summaryWithBlanks === SUMMARY);
check(
  "렌더 가능 판정 필드 충족(question-renderers.tsx:742)",
  !!data.summaryWithBlanks && !!data.blanks,
);

{
  const issues = validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE",
    question: data,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...SUMMARY_COMPLETE_MD_LANE.qualityArgs(ctxOf(2)),
  });
  const errors = issues.filter((i) => i.severity === "error");
  check(
    "품질검증: error 0건",
    errors.length === 0,
    errors.map((e) => `${e.code}: ${e.message}`).join(" / "),
  );
  check(
    "품질검증: summary-complete-* 결함 0건",
    issues.every((i) => !i.code.startsWith("summary-complete-")),
    issues.map((i) => i.code).join(","),
  );
  check(
    "품질검증: 영작 verbatim 누수 코드 0건",
    issues.every((i) => !i.code.startsWith("writing-answer-verbatim")),
    issues.map((i) => i.code).join(","),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. buildAnswerSpec → gradeAnswer 채점 왕복 (서술형 계열의 핵심 축)
// ───────────────────────────────────────────────────────────────────────────
const spec = buildAnswerSpec({
  id: "q-sc-1",
  type: "ESSAY",
  subType: "SUMMARY_COMPLETE",
  options: null,
  correctAnswer: String(data.correctAnswer ?? ""),
  structuredData: data,
  sourcePassageContent: PASSAGE,
  points: 4,
});
check("채점: inputKind TEXT_MULTI", spec.inputKind === "TEXT_MULTI", String(spec.inputKind));
check("채점: textMode EXACT", spec.textMode === "EXACT", String(spec.textMode));
check(
  "채점: 필드 키 = blanks[].label 원문 '(A)','(B)'",
  (spec.fields ?? []).map((f) => f.key).join("|") === "(A)|(B)",
  (spec.fields ?? []).map((f) => f.key).join("|"),
);
check("채점: 부분점수 활성(필드 2개)", spec.partialCredit === true);
check(
  "채점: 허용 집합에 정답+동치 전량 주입",
  (spec.fields?.[1].answers ?? []).join("|") === "vulnerability|fragility|exposure",
  (spec.fields?.[1].answers ?? []).join("|"),
);
check(
  "채점: 모범답안 정확 입력 → CORRECT 만점",
  (() => {
    const r = gradeAnswer(spec, { texts: { "(A)": "untrained", "(B)": "vulnerability" } });
    return r.status === "CORRECT" && r.earnedPoints === 4;
  })(),
);
check(
  "채점: 동치 답안 + 표면차(대문자·문말 마침표) → CORRECT",
  (() => {
    const r = gradeAnswer(spec, { texts: { "(A)": "Unpracticed", "(B)": "fragility." } });
    return r.status === "CORRECT" && r.earnedPoints === 4;
  })(),
);
check(
  "채점: 한 칸만 정답 → PARTIAL 절반",
  (() => {
    const r = gradeAnswer(spec, { texts: { "(A)": "untrained", "(B)": "confidence" } });
    return r.status === "PARTIAL" && r.earnedPoints === 2;
  })(),
);
check(
  "채점: 전부 오답 → WRONG",
  (() => {
    const r = gradeAnswer(spec, { texts: { "(A)": "safe", "(B)": "confidence" } });
    return r.status === "WRONG" && r.earnedPoints === 0;
  })(),
);
check(
  "채점: 미입력 칸은 오답 처리(빈 문자열)",
  (() => {
    const r = gradeAnswer(spec, { texts: { "(A)": "untrained", "(B)": "" } });
    return r.status === "PARTIAL" && r.earnedPoints === 2;
  })(),
);
check(
  "채점: 키 축 desync 방지 — 'A'(괄호 없음)로 넣으면 만점이 되지 않는다",
  (() => {
    const r = gradeAnswer(spec, { texts: { A: "untrained", B: "vulnerability" } });
    return r.status === "WRONG";
  })(),
);
{
  // 1빈칸 계약 — TEXT_SINGLE + 부분점수 비활성
  const oneAdapt = adaptMdSummaryCompleteToAiQuestion(
    {
      kind: "summaryComplete",
      summary:
        "Because a hazard-free play space never lets a child test the limits of a body, protection finally becomes a source of (A).",
      blanks: [{ label: "(A)", answer: "vulnerability", accepted: ["fragility"] }],
      explanation: "글은 위험 제거가 판단 근거를 없앤다고 말합니다.",
    } satisfies MdSummaryCompleteQuestion,
    "BASIC",
    1,
  );
  const oneData = (postProcessQuestion(
    "SUMMARY_COMPLETE",
    PASSAGE,
    (oneAdapt.aiQuestion ?? {}) as never,
  ).data ?? {}) as Record<string, unknown>;
  const oneSpec = buildAnswerSpec({
    id: "q-sc-2",
    type: "ESSAY",
    subType: "SUMMARY_COMPLETE",
    options: null,
    correctAnswer: String(oneData.correctAnswer ?? ""),
    structuredData: oneData,
    sourcePassageContent: PASSAGE,
    points: 3,
  });
  check(
    "채점: 1빈칸은 TEXT_SINGLE · 부분점수 비활성",
    oneSpec.inputKind === "TEXT_SINGLE" && oneSpec.partialCredit === false,
    `${oneSpec.inputKind} / ${oneSpec.partialCredit}`,
  );
  check(
    "채점: 1빈칸 동치 답안 만점",
    gradeAnswer(oneSpec, { texts: { "(A)": "fragility" } }).earnedPoints === 3,
  );
  check("어댑터: 1빈칸 correctAnswer '(A) vulnerability'", oneData.correctAnswer === "(A) vulnerability");
}

{
  // 3빈칸 전 구간 왕복 — 필드 3개 부분점수(1/3, 2/3) 계약까지 확인.
  const threeMd = `요약문: Because a hazard-free play space never lets a child test the limits of a body, protection leaves the young (A) in judging danger, turns caution into (B), and finally becomes a source of (C).
정답(A): untrained
정답(B): dependence
정답(C): vulnerability
허용답(C): fragility
${EXPLANATION}`;
  const three = SUMMARY_COMPLETE_MD_LANE.parseAndGate(threeMd, ctxOf(3));
  check("3빈칸: 게이트 클린", three.gateIssues.length === 0, three.gateIssues.join(" / "));
  const threeAdapt = SUMMARY_COMPLETE_MD_LANE.adapt(three, ctxOf(3));
  const threeData = (postProcessQuestion(
    "SUMMARY_COMPLETE",
    PASSAGE,
    (threeAdapt.aiQuestion ?? {}) as never,
  ).data ?? {}) as Record<string, unknown>;
  check(
    "3빈칸: correctAnswer 3칸 병기",
    threeData.correctAnswer === "(A) untrained, (B) dependence, (C) vulnerability",
    String(threeData.correctAnswer),
  );
  const threeErrors = validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE",
    question: threeData,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...SUMMARY_COMPLETE_MD_LANE.qualityArgs(ctxOf(3)),
  }).filter((i) => i.severity === "error");
  check(
    "3빈칸: 품질검증 error 0건",
    threeErrors.length === 0,
    threeErrors.map((e) => e.code).join(","),
  );
  const threeSpec = buildAnswerSpec({
    id: "q-sc-3",
    type: "ESSAY",
    subType: "SUMMARY_COMPLETE",
    options: null,
    correctAnswer: String(threeData.correctAnswer ?? ""),
    structuredData: threeData,
    sourcePassageContent: PASSAGE,
    points: 6,
  });
  check(
    "3빈칸 채점: 필드 3개 · 두 칸 정답 → PARTIAL 4점",
    (spec.fields ?? []).length === 2 &&
      (threeSpec.fields ?? []).length === 3 &&
      gradeAnswer(threeSpec, {
        texts: { "(A)": "untrained", "(B)": "dependence", "(C)": "nope" },
      }).earnedPoints === 4,
  );
  check(
    "3빈칸 채점: 전부 정답(마지막은 동치) → 만점",
    gradeAnswer(threeSpec, {
      texts: { "(A)": "untrained", "(B)": "dependence", "(C)": "fragility" },
    }).status === "CORRECT",
  );
}
{
  // 발문 영어 경로도 품질검증 error 0 — 발문 언어는 SUMMARY_COMPLETE 전용 검증기
  // 대상이 아니지만(dispatcher.ts:1020-1022), 회귀 감시를 위해 못박아 둔다.
  const enSettings = { SUMMARY_COMPLETE: { stemLanguage: "en" } };
  const enCtx = ctxOf(2, enSettings);
  const enAdapt = SUMMARY_COMPLETE_MD_LANE.adapt(
    SUMMARY_COMPLETE_MD_LANE.parseAndGate(GOOD, enCtx),
    enCtx,
  );
  const enData = (postProcessQuestion(
    "SUMMARY_COMPLETE",
    PASSAGE,
    (enAdapt.aiQuestion ?? {}) as never,
  ).data ?? {}) as Record<string, unknown>;
  const enErrors = validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE",
    question: enData,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...SUMMARY_COMPLETE_MD_LANE.qualityArgs(enCtx),
  }).filter((i) => i.severity === "error");
  check("영어 발문 경로: 품질검증 error 0건", enErrors.length === 0, enErrors.map((e) => e.code).join(","));
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금 축 · 적격성 · 난이도 3분기 · 설정 집행
// ───────────────────────────────────────────────────────────────────────────
check("레인: subType SUMMARY_COMPLETE", SUMMARY_COMPLETE_MD_LANE.subType === "SUMMARY_COMPLETE");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (2크레딧) — fast getOperationType 과 동기",
  SUMMARY_COMPLETE_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(SUMMARY_COMPLETE_MD_LANE.operationType),
);
check("레인: retryEligible", SUMMARY_COMPLETE_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 1~5 · 범위 밖 거부",
  SUMMARY_COMPLETE_MD_LANE.isEligible({ summaryCompleteBlankCount: 1 }) &&
    SUMMARY_COMPLETE_MD_LANE.isEligible({ summaryCompleteBlankCount: 5 }) &&
    SUMMARY_COMPLETE_MD_LANE.isEligible({}) &&
    !SUMMARY_COMPLETE_MD_LANE.isEligible({ summaryCompleteBlankCount: 0 }) &&
    !SUMMARY_COMPLETE_MD_LANE.isEligible({ summaryCompleteBlankCount: 6 }) &&
    !SUMMARY_COMPLETE_MD_LANE.isEligible({ blankCount: 9 }),
);
check(
  "레인: mdFormat 실값",
  JSON.stringify(SUMMARY_COMPLETE_MD_LANE.mdFormat(ctxOf(3))) === '{"blankCount":3}',
  JSON.stringify(SUMMARY_COMPLETE_MD_LANE.mdFormat(ctxOf(3))),
);
check(
  "레인: qualityArgs 에 SUMMARY_COMPLETE 전용 슬롯을 넣지 않는다(스키마에 없음)",
  Object.keys(SUMMARY_COMPLETE_MD_LANE.qualityArgs(ctxOf(2))).sort().join(",") ===
    "optionLanguage,stemLanguage",
  Object.keys(SUMMARY_COMPLETE_MD_LANE.qualityArgs(ctxOf(2))).join(","),
);
check(
  "레인: diversityTargets = blanks[].answer",
  SUMMARY_COMPLETE_MD_LANE.diversityTargets({
    blanks: [{ answer: "untrained" }, { answer: "vulnerability" }],
  }).join(",") === "untrained,vulnerability",
);
check(
  "레인: parseAndGate 왕복(설정 blankCount 집행)",
  (() => {
    const r = SUMMARY_COMPLETE_MD_LANE.parseAndGate(GOOD, ctxOf(2));
    const wrongCount = SUMMARY_COMPLETE_MD_LANE.parseAndGate(GOOD, ctxOf(3));
    return r.gateIssues.length === 0 && wrongCount.gateIssues.length > 0;
  })(),
);
check(
  "레인: adapt 왕복 성공",
  SUMMARY_COMPLETE_MD_LANE.adapt(
    SUMMARY_COMPLETE_MD_LANE.parseAndGate(GOOD, ctxOf(2)),
    ctxOf(2),
  ).ok === true,
);
check(
  "레인: buildExtras 기본은 비어 있음(언어 기본값 ko)",
  SUMMARY_COMPLETE_MD_LANE.buildExtras(ctxOf(2)).length === 0,
);
{
  const enSettings = { SUMMARY_COMPLETE: { stemLanguage: "en" } };
  check(
    "레인: stemLanguage=en → 질문 언어 블록 주입",
    SUMMARY_COMPLETE_MD_LANE.buildExtras(ctxOf(2, enSettings)).some((b) =>
      b.includes("질문 언어"),
    ),
  );
  const enAdapt = SUMMARY_COMPLETE_MD_LANE.adapt(
    SUMMARY_COMPLETE_MD_LANE.parseAndGate(GOOD, ctxOf(2, enSettings)),
    ctxOf(2, enSettings),
  );
  check(
    "레인: stemLanguage=en → 발문만 영어로 교체",
    typeof enAdapt.aiQuestion?.direction === "string" &&
      /blanks \(A\), \(B\)/.test(String(enAdapt.aiQuestion?.direction)),
    String(enAdapt.aiQuestion?.direction),
  );
  check(
    "레인: qualityArgs stemLanguage 실값 반영",
    SUMMARY_COMPLETE_MD_LANE.qualityArgs(ctxOf(2, enSettings)).stemLanguage === "en",
  );
}

// 프롬프트 — 난이도 3분기 · 라벨 스캐폴드 · 형식 계약 리터럴
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdSummaryCompletePrompt(PASSAGE, "full", d, { blankCount: 3 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 3빈칸 스캐폴드 + 지문 포함`,
    p.includes("정답(C):") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)) &&
      p.includes("## 출력 형식"),
  );
}
check(
  "프롬프트: BASIC 은 few-shot 생략, KILLER 는 포함",
  !buildMdSummaryCompletePrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
);
check(
  "프롬프트: 난이도별 설계 절이 서로 다르다",
  new Set(
    (["BASIC", "INTERMEDIATE", "KILLER"] as const).map((d) =>
      buildMdSummaryCompletePrompt(PASSAGE, "full", d).split("## 요약문·빈칸 설계")[1]?.slice(0, 80),
    ),
  ).size === 3,
);
check(
  "프롬프트: `모범답안:` 줄을 요구하지 않는다(철칙 1)",
  !buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER").includes("모범답안:"),
);
check(
  "프롬프트: `오답:` 블록이 없다(서술형 — 선지 없음)",
  !buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER").includes("\n오답:"),
);
check(
  "프롬프트: 허용답 위생 경고 포함(채점 흡수 사고 방어)",
  buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER").includes("무조건 만점"),
);
check(
  "프롬프트: 정답 자기복제 금지 지시 포함",
  buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER").includes(
    "정답 자신은 허용답에 다시 적지 마라",
  ),
);
check(
  "프롬프트: blankCount 클램프(0→1, 99→5)",
  buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER", { blankCount: 0 }).includes("정답(A):") &&
    !buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER", { blankCount: 0 }).includes("정답(B)") &&
    buildMdSummaryCompletePrompt(PASSAGE, "full", "KILLER", { blankCount: 99 }).includes("정답(E)"),
);
check(
  "프롬프트: answer-only 모드는 해설만 남긴다",
  buildMdSummaryCompletePrompt(PASSAGE, "answer-only", "KILLER").includes("해설:"),
);
check(
  "라벨 유틸: clamp · labels",
  clampSummaryCompleteMdBlankCount("4") === 4 &&
    clampSummaryCompleteMdBlankCount(undefined) === 2 &&
    summaryCompleteMdLabels(5).join("") === "(A)(B)(C)(D)(E)",
);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
