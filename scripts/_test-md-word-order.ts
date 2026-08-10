// 배열 영작(WORD_ORDER) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 전종 → 어댑터 → postProcessQuestion(PASSTHROUGH) →
// validateQuestionQuality → **buildAnswerSpec/gradeAnswer 채점 왕복** → 레인 계약.
// 실행: npx tsx scripts/_test-md-word-order.ts
//
// ⚠ 이 유형은 서술형이다. 선지가 없으므로 `정답: <①~⑤>` 줄도 `오답:` 블록도 없고,
//   정답의 유일 진실원은 `모범답안:` 줄이다(§1-B 철칙1). 채점은 문자열 집합 대조라
//   acceptedAnswers 오염이 곧 "오답을 정답으로 흡수"하는 사고가 된다 — 그 축을
//   §7(채점 왕복)에서 실제 gradeAnswer 로 검증한다.
import {
  deriveWordOrderDistractors,
  joinWordOrderChunks,
  parseMdWordOrder,
  splitWordOrderChips,
  wordOrderAccounting,
  type MdWordOrderQuestion,
} from "../src/lib/md-qgen/parser-word-order";
import { autoSnapWordOrderChips, gateMdWordOrder } from "../src/lib/md-qgen/gate-word-order";
import { adaptMdWordOrderToAiQuestion } from "../src/lib/md-qgen/adapter-word-order";
import { WORD_ORDER_MD_LANE } from "../src/lib/md-qgen/lane-word-order";
import {
  buildMdWordOrderPrompt,
  wordOrderMdDistractorMin,
} from "../src/lib/md-qgen/prompts-word-order";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { chipsAreInAnswerOrder } from "../src/lib/topic-sentence-writing";
import { buildAnswerSpec } from "../src/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "../src/lib/exam-scoring/grade";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import { runWordOrderDecorationMatrix } from "./_test-md-word-order-decoration";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Because the technology spread faster than regulators could respond, early adopters quietly shaped the norms that everyone later inherited. " +
  "Lawmakers arrived years afterward, drafting rules for practices that had already hardened into ordinary habit. " +
  "Researchers who study this pattern call it a governance lag, and they warn that the interval keeps widening. " +
  "Each new platform compresses the distance between invention and mass adoption, leaving even less room for public deliberation.";

const ANSWER =
  "Spreading faster than regulators could respond, the norms were shaped by early adopters.";

const GOOD = `모범답안: ${ANSWER}
칩: the norms / by regulators / Spreading faster / were shaped / than regulators could respond / shaped / by early adopters
미끼: by regulators / shaped
힌트: 앞 문장의 인과 관계를 뒤집어 결과 쪽에 초점을 둔 문장입니다.
허용답:
- The norms were shaped by early adopters, spreading faster than regulators could respond.
해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이 문두에 오고 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.`;

function snapOf(text: string) {
  return autoSnapWordOrderChips(parseMdWordOrder(text));
}
function parsedOf(text: string): MdWordOrderQuestion {
  return snapOf(text).question;
}
function gateOf(text: string, distractorMin = 2): string[] {
  return gateMdWordOrder(parsedOf(text), PASSAGE, { distractorMin });
}
function gateRaw(q: MdWordOrderQuestion, distractorMin = 2): string[] {
  return gateMdWordOrder(q, PASSAGE, { distractorMin });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로 — 파싱
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdWordOrder(GOOD);
check("파싱: 모범답안", parsed.modelAnswer === ANSWER, parsed.modelAnswer);
check("파싱: 칩 7개", parsed.chips.length === 7, `실제 ${parsed.chips.length}`);
check(
  "파싱: 칩 내용 축자 보존(다단어 청크가 쪼개지지 않음)",
  parsed.chips.includes("than regulators could respond") && parsed.chips.includes("the norms"),
  parsed.chips.join(" | "),
);
check("파싱: 미끼 2개", parsed.distractors.length === 2, parsed.distractors.join(" / "));
check("파싱: 힌트 한국어 한 줄", parsed.contextHint.startsWith("앞 문장의"), parsed.contextHint);
check("파싱: 허용답 1개", parsed.acceptedAnswers.length === 1, String(parsed.acceptedAnswers.length));
check(
  "파싱: 해설 2문장 · 다음 섹션 미포함",
  parsed.explanation.includes("분사구문") && !parsed.explanation.includes("모범답안"),
  parsed.explanation.slice(0, 60),
);
check(
  "파싱: 정답의 유일 진실원은 모범답안 줄(칩 줄에 정답표시 칸 없음)",
  !GOOD.includes("| O") && !GOOD.includes("정답:"),
);
check(
  "칩 분리 헬퍼: 쉼표로는 나누지 않는다(칩이 쉼표를 담을 수 있음)",
  splitWordOrderChips("a, b / c").length === 2,
  splitWordOrderChips("a, b / c").join(" | "),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 스냅
// ───────────────────────────────────────────────────────────────────────────
const snapped = snapOf(GOOD);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "스냅: 칩 내용 불변(재배열만)",
  snapped.question.chips.length === 7 &&
    [...snapped.question.chips].sort().join("|") === [...parsed.chips].sort().join("|"),
);
check(
  "스냅: 재배열 결과가 정답 어순이 아님(§9 #1 fast 동형)",
  !chipsAreInAnswerOrder(snapped.question.chips, ANSWER),
  snapped.question.chips.join(" / "),
);
check(
  "스냅: 멱등(두 번 돌려도 같은 칩 순서)",
  autoSnapWordOrderChips(snapped.question).question.chips.join("|") ===
    snapped.question.chips.join("|"),
);
{
  const s = snapOf(GOOD.replace(`${ANSWER}`, ANSWER.replace(/\.$/, "")));
  check(
    "스냅: 모범답안 종결부호 보정",
    s.question.modelAnswer === ANSWER && s.corrections.some((c) => c.includes("종결부호")),
    s.corrections.join(" / "),
  );
}
{
  const s = snapOf(GOOD.replace("미끼: by regulators / shaped", "미끼: By Regulators / shaped"));
  check(
    "스냅: 미끼 대소문자 드리프트를 칩 축자로 보정",
    s.question.distractors.includes("by regulators") &&
      s.corrections.some((c) => c.includes("칩 축자")),
    s.corrections.join(" / "),
  );
}
{
  const s = snapOf(GOOD.replace("미끼: by regulators / shaped", "미끼: by regulators / shaped / nonexistent"));
  check(
    "스냅: 칩에 없는 미끼는 제외 + corrections 기록(조용히 버리지 않음)",
    s.question.distractors.length === 2 && s.corrections.some((c) => c.includes("칩 목록에 없어 제외")),
    s.corrections.join(" / "),
  );
}
{
  // 미끼 미선언(실측 최다 드리프트) → 칩·모범답안 대조로 결정론 재도출
  const s = snapOf(GOOD.replace("미끼: by regulators / shaped\n", ""));
  check(
    "스냅: 미끼 미선언 → 결정론 재도출",
    s.question.distractors.length === 2 &&
      s.question.distractors.includes("shaped") &&
      s.question.distractors.includes("by regulators") &&
      s.corrections.some((c) => c.includes("재도출")),
    `${s.question.distractors.join(" / ")} :: ${s.corrections.join(" / ")}`,
  );
  check("스냅: 재도출 후 게이트 클린", gateRaw(s.question).length === 0, gateRaw(s.question).join(" / "));
}
{
  // 미끼를 정답 칩으로 잘못 선언 → 회계 실패 → 재도출로 자가 치유
  const s = snapOf(GOOD.replace("미끼: by regulators / shaped", "미끼: the norms"));
  check(
    "스냅: 미끼 오선언(정답 칩) → 재도출로 자가 치유",
    s.question.distractors.length === 2 && gateRaw(s.question).length === 0,
    `${s.question.distractors.join(" / ")} :: ${gateRaw(s.question).join(" / ")}`,
  );
}
{
  // ★ acceptedAnswers 오염은 되돌릴 수 없는 채점 사고다(§9 #2) — 절삭 + 기록
  const s = snapOf(
    GOOD.replace(
      "- The norms were shaped by early adopters, spreading faster than regulators could respond.",
      "- The norms were formed by early adopters, spreading faster than regulators could respond.",
    ),
  );
  check(
    "★ 스냅: 칩으로 못 만드는 허용답 절삭(오답 흡수 방지) + corrections 기록",
    s.question.acceptedAnswers.length === 0 &&
      s.corrections.some((c) => c.includes("오답 흡수 방지")),
    s.corrections.join(" / "),
  );
}
{
  const s = snapOf(
    GOOD.replace(
      "- The norms were shaped by early adopters, spreading faster than regulators could respond.",
      `- ${ANSWER}`,
    ),
  );
  check(
    "스냅: 허용답이 모범답안 자신이면 조용히 흡수(중복 제거)",
    s.question.acceptedAnswers.length === 0 && s.corrections.length === 0,
    s.corrections.join(" / "),
  );
}
{
  const inOrder =
    "칩: Spreading faster / than regulators could respond / the norms / were shaped / by early adopters / shaped / by regulators";
  const s = snapOf(GOOD.replace(/^칩:.*$/m, inOrder));
  check(
    "★ 스냅: 칩이 정답 어순으로 읽히면 결정론 재배열 + 기록",
    !chipsAreInAnswerOrder(s.question.chips, ANSWER) &&
      s.corrections.some((c) => c.includes("재배열")),
    `${s.question.chips.join(" / ")} :: ${s.corrections.join(" / ")}`,
  );
  check("스냅: 재배열 후 게이트 클린", gateRaw(s.question).length === 0, gateRaw(s.question).join(" / "));
}

// 회계·재도출 헬퍼 단위 검증
check(
  "회계: 정상 입력 과부족 0",
  (() => {
    const a = wordOrderAccounting(parsed.chips, parsed.distractors, ANSWER);
    return a.missing.length === 0 && a.surplus.length === 0;
  })(),
);
check(
  "재도출: 짧은 칩이 긴 칩을 굶기지 않는다(shaped vs were shaped)",
  (deriveWordOrderDistractors(
    ["shaped", "were shaped", "the norms", "Spreading faster", "than regulators could respond", "by early adopters"],
    ANSWER,
  ) ?? []).join("|") === "shaped",
  String(deriveWordOrderDistractors(
    ["shaped", "were shaped", "the norms", "Spreading faster", "than regulators could respond", "by early adopters"],
    ANSWER,
  )),
);
check(
  "재도출: 조립 자체가 불가하면 보정하지 않는다(null)",
  deriveWordOrderDistractors(["the norms", "were shaped"], ANSWER) === null,
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 게이트 클린
// ───────────────────────────────────────────────────────────────────────────
check("게이트: 정상 입력 클린(KILLER 미끼 2)", gateOf(GOOD, 2).length === 0, gateOf(GOOD, 2).join(" / "));
check("게이트: BASIC 미끼 하한 1 에서도 클린", gateOf(GOOD, 1).length === 0, gateOf(GOOD, 1).join(" / "));

// ───────────────────────────────────────────────────────────────────────────
// 4. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 모범답안 누락",
  gateOf(GOOD.replace(/^모범답안:.*$/m, "")).some((i) => i.includes("모범답안 줄을 인식할 수 없음")),
);
check(
  "게이트: 칩을 하나도 못 얻음 → 청크 경계 자리를 지목(§1-B 철칙5)",
  gateOf(GOOD.replace(/^칩:.*$/m, "")).some((i) => i.includes("모범답안 줄에 청크 경계가 없음")),
  gateOf(GOOD.replace(/^칩:.*$/m, "")).join(" / "),
);
check(
  "게이트: 모범답안에 한글 혼입",
  gateOf(GOOD.replace(ANSWER, "규범은 the norms were shaped by early adopters 였습니다.")).some((i) =>
    i.includes("한글이 섞임"),
  ),
);
check(
  "게이트: 모범답안이 너무 짧음",
  gateRaw({ ...parsed, modelAnswer: "The norms were shaped." }).some((i) => i.includes("단어 이상 필요")),
);
check(
  "게이트: 칩 개수 하한",
  gateRaw({ ...parsed, chips: ["the norms", "were shaped"], distractors: [] }).some((i) =>
    i.includes("칩 2개"),
  ),
);
check(
  "게이트: 구두점 전용 칩",
  gateRaw({ ...parsed, chips: [...parsed.chips, ","] }).some((i) => i.includes("구두점만 있는 칩")),
);
check(
  "게이트: 칩에 한글 혼입",
  gateRaw({ ...parsed, chips: [...parsed.chips, "규제 기관"] }).some((i) => i.includes("칩에 한글이 섞임")),
);
check(
  "게이트: 선언 미끼가 칩에 없음",
  gateRaw({ ...parsed, distractors: [...parsed.distractors, "phantom chip"] }).some((i) =>
    i.includes("칩 목록에 없음"),
  ),
);
check(
  "게이트: 미끼 개수 하한(KILLER 2개)",
  gateRaw({ ...parsed, chips: parsed.chips.filter((c) => c !== "shaped"), distractors: ["by regulators"] }, 2).some(
    (i) => i.includes("미끼 1개"),
  ),
);
check(
  "게이트: 정답 청크 개수 범위",
  gateRaw({
    ...parsed,
    chips: ["Spreading faster than regulators could respond the norms were shaped by early adopters", "shaped", "by regulators", "quietly"],
    distractors: ["shaped", "by regulators", "quietly"],
  }).some((i) => i.includes("정답 청크")),
);
check(
  "게이트: 한 칩이 정답의 절반을 넘음",
  gateRaw({
    ...parsed,
    chips: [
      "Spreading faster than regulators could respond the norms",
      "were shaped",
      "by early adopters",
      "shaped",
      "by regulators",
    ],
    distractors: ["shaped", "by regulators"],
  }).some((i) => i.includes("절반을 넘지 못한다")),
);
check(
  "게이트: 칩으로 정답 조립 불가(부족 토큰 지목)",
  (() => {
    const issues = gateRaw({
      ...parsed,
      chips: parsed.chips.filter((c) => c !== "were shaped"),
      distractors: parsed.distractors,
    });
    return issues.some((i) => i.includes("부족 토큰") && i.includes('"shaped"'));
  })(),
  gateRaw({ ...parsed, chips: parsed.chips.filter((c) => c !== "were shaped") }).join(" / "),
);
check(
  "게이트: 미선언 미끼(잉여 토큰 지목)",
  gateRaw({ ...parsed, distractors: ["shaped"] }).some(
    (i) => i.includes("남는 토큰") && i.includes("선언하지 않은 미끼"),
  ),
  gateRaw({ ...parsed, distractors: ["shaped"] }).join(" / "),
);
check(
  "게이트: 칩이 정답 어순 그대로",
  gateRaw({
    ...parsed,
    chips: ["Spreading faster", "than regulators could respond", "the norms", "were shaped", "by early adopters"],
    distractors: [],
  }, 0).some((i) => i.includes("정답 어순 그대로")),
);
check(
  "★ 게이트: 미끼를 빼고 읽으면 정답 문장(fast 두 검사의 사각)",
  gateRaw({
    ...parsed,
    chips: ["Spreading faster", "than regulators could respond", "the norms", "were shaped", "by early adopters", "shaped", "by regulators"],
    distractors: ["shaped", "by regulators"],
  }).some((i) => i.includes("미끼를 빼고 칩을 왼→오로 읽으면")),
);
check(
  "게이트: 칩이 정답 어순에 근접(단어 단위 칩, 왼→오 읽기로 풀림)",
  gateRaw({
    ...parsed,
    chips: [
      "Spreading", "faster", "than", "quietly", "regulators", "could", "respond",
      "the", "were", "norms", "shaped", "by", "early", "adopters",
    ],
    distractors: ["quietly"],
  }).some((i) => i.includes("정답 어순에 가까움")),
  gateRaw({
    ...parsed,
    chips: [
      "Spreading", "faster", "than", "quietly", "regulators", "could", "respond",
      "the", "were", "norms", "shaped", "by", "early", "adopters",
    ],
    distractors: ["quietly"],
  }).join(" / "),
);
check(
  "★ 게이트: 모범답안이 지문 문장 통째 복사(§9 #5 F급)",
  (() => {
    const verbatim = "Lawmakers arrived years afterward, drafting rules for practices that had already hardened into ordinary habit.";
    return gateRaw({
      ...parsed,
      modelAnswer: verbatim,
      chips: ["Lawmakers arrived", "years afterward", "drafting rules", "for practices", "that had already", "hardened into ordinary habit", "quietly"],
      distractors: ["quietly"],
      acceptedAnswers: [],
    }).some((i) => i.includes("통째 복사"));
  })(),
);
check(
  "★ 게이트: 허용답이 칩으로 조립 불가(오답 흡수 차단)",
  gateRaw({
    ...parsed,
    acceptedAnswers: ["The norms were formed by early adopters, spreading faster than regulators could respond."],
  }).some((i) => i.includes("제시 칩만으로 조립되지 않음")),
);
check(
  "게이트: 허용답 축약형(it's ↔ it is 계열)도 차단",
  gateRaw({
    ...parsed,
    acceptedAnswers: ["Spreading faster than regulators could respond, the norms were shaped by adopters."],
  }).some((i) => i.includes("제시 칩만으로 조립되지 않음")),
);
check(
  "게이트: 힌트가 한국어가 아님",
  gateOf(GOOD.replace(/^힌트:.*$/m, "힌트: The norms came before the rules.")).some((i) =>
    i.includes("한국어 한 줄이어야"),
  ),
);
check(
  "게이트: 힌트에 정답 표현 누수",
  gateRaw({
    ...parsed,
    contextHint: "규범은 the norms were shaped by early adopters 라는 뜻입니다.",
  }).some((i) => i.includes("정답 표현이 그대로 노출")),
);
check(
  "게이트: 해설 누락",
  gateOf(GOOD.replace(/^해설:[\s\S]*$/m, "")).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 해설이 한국어가 아님",
  gateRaw({ ...parsed, explanation: "The cause clause becomes a participial phrase." }).some((i) =>
    i.includes("해설이 한국어가 아님"),
  ),
);
check(
  "게이트: 해설이 인용한 영어 조각이 문항 표면에 없음",
  gateRaw({
    ...parsed,
    explanation: "이 문장은 \"the lawmakers negotiated privately\" 라는 구절을 재구성한 것입니다.",
  }).some((i) => i.toLowerCase().includes("quote") || i.includes("인용") || i.includes("실재")),
  gateRaw({
    ...parsed,
    explanation: "이 문장은 \"the lawmakers negotiated privately\" 라는 구절을 재구성한 것입니다.",
  }).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 5. 드리프트 관용 — 전부 칩 7개 + 게이트 클린이어야 한다
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["굵게 라벨(모범답안)", `모범답안: ${ANSWER}`, `**모범답안:** ${ANSWER}`],
  ["라벨 드리프트(모범답안→정답)", `모범답안: ${ANSWER}`, `정답: ${ANSWER}`],
  ["라벨 공백(모범 답안)", `모범답안: ${ANSWER}`, `모범 답안: ${ANSWER}`],
  ["전각 콜론", "칩: the norms", "칩： the norms"],
  ["불릿 접두(칩)", "칩: the norms", "- 칩: the norms"],
  ["별표 불릿(칩)", "칩: the norms", "* 칩: the norms"],
  ["굵게 라벨(칩)", "칩: the norms", "**칩:** the norms"],
  ["라벨 드리프트(칩→배열 단어)", "칩: the norms", "배열 단어: the norms"],
  ["표 행 파이프 잔재", "칩: the norms", "| 칩: | the norms"],
  ["구분자 주변 공백 과다", " / by regulators / ", "   /   by regulators   /   "],
  ["칩 백틱 장식", "the norms /", "`the norms` /"],
  ["미끼 굵게 라벨", "미끼: by regulators", "**미끼:** by regulators"],
  ["힌트 라벨 드리프트", "힌트: 앞 문장", "문맥 힌트: 앞 문장"],
  ["허용답 라벨 드리프트", "허용답:", "허용 답안:"],
  ["해설 굵게 라벨", "해설: 원인절", "**해설:** 원인절"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parsedOf(drifted);
  const issues = gateRaw(q);
  check(
    `드리프트 관용: ${name}`,
    q.chips.length === 7 && q.modelAnswer === ANSWER && issues.length === 0,
    `칩 ${q.chips.length}개 · ${issues.join(" / ")}`,
  );
}
{
  // 칩을 인라인 대신 불릿 목록으로 내는 드리프트
  const bulleted = GOOD.replace(
    /^칩:.*$/m,
    [
      "칩:",
      "- the norms",
      "- by regulators",
      "- Spreading faster",
      "- were shaped",
      "- than regulators could respond",
      "- shaped",
      "- by early adopters",
    ].join("\n"),
  );
  const q = parsedOf(bulleted);
  check(
    "드리프트 관용: 칩을 불릿 목록으로 출력",
    q.chips.length === 7 && gateRaw(q).length === 0,
    `칩 ${q.chips.length}개 · ${gateRaw(q).join(" / ")}`,
  );
}
{
  // 슬래시가 하나도 없는 파이프 구분자(표 드리프트)
  const piped = GOOD.replace(
    /^칩:.*$/m,
    "칩: the norms | by regulators | Spreading faster | were shaped | than regulators could respond | shaped | by early adopters",
  );
  const q = parsedOf(piped);
  check(
    "드리프트 관용: 파이프 구분자",
    q.chips.length === 7 && gateRaw(q).length === 0,
    `칩 ${q.chips.length}개 · ${gateRaw(q).join(" / ")}`,
  );
}
{
  const noOptional = `모범답안: ${ANSWER}
칩: the norms / by regulators / Spreading faster / were shaped / than regulators could respond / shaped / by early adopters
미끼: by regulators / shaped
해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이 문두에 오고 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.`;
  const q = parsedOf(noOptional);
  check(
    "드리프트 관용: 힌트·허용답 섹션 생략(선택 섹션)",
    q.contextHint === "" && q.acceptedAnswers.length === 0 && gateRaw(q).length === 0,
    gateRaw(q).join(" / "),
  );
}
{
  const noneMarkers = GOOD.replace(/^힌트:.*$/m, "힌트: 없음").replace(
    "- The norms were shaped by early adopters, spreading faster than regulators could respond.",
    "- 없음",
  );
  const q = parsedOf(noneMarkers);
  check(
    "드리프트 관용: '없음' 표기를 값 없음으로 흡수",
    q.contextHint === "" && q.acceptedAnswers.length === 0 && gateRaw(q).length === 0,
    gateRaw(q).join(" / "),
  );
}
{
  // 과잉 관용 방지 — 섹션 밖 산문을 칩으로 오인하지 않는다
  const withProse = `${GOOD}\n\n이 문항은 수동태 전환을 표적으로 삼았습니다.`;
  const q = parsedOf(withProse);
  check(
    "과잉 관용 방지: 꼬리 산문을 칩·허용답으로 오인하지 않음",
    q.chips.length === 7 && q.acceptedAnswers.length === 1,
    `칩 ${q.chips.length} · 허용답 ${q.acceptedAnswers.length}`,
  );
}
{
  // 출력 전체를 코드펜스로 감싸는 드리프트 — 꼬리 ``` 가 해설에 실리면 안 된다
  const fenced = "```markdown\n" + GOOD + "\n```";
  const q = parsedOf(fenced);
  check(
    "드리프트 관용: 코드펜스로 감싼 출력",
    q.chips.length === 7 &&
      q.modelAnswer === ANSWER &&
      !q.explanation.includes("`") &&
      gateRaw(q).length === 0,
    `칩 ${q.chips.length}개 · 해설='${q.explanation.slice(-20)}' · ${gateRaw(q).join(" / ")}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 어댑터 → postProcessQuestion(PASSTHROUGH) → validateQuestionQuality
// ───────────────────────────────────────────────────────────────────────────
const adapt = adaptMdWordOrderToAiQuestion(snapped.question, "KILLER");
check("어댑터: 성공", adapt.ok === true, adapt.error);
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
check(
  "어댑터: direction 에 '쓰지 않는 단어' 안내(미끼 있음)",
  String(ai.direction).includes("쓰지 않는 단어가 포함되어 있음"),
  String(ai.direction),
);
check("어댑터: correctAnswer === modelAnswer", ai.correctAnswer === ANSWER, String(ai.correctAnswer));
check(
  "★ 어댑터: options 키 자체가 없다(correct-answer-mismatch 회귀 방지)",
  !("options" in ai),
);
check(
  "★ 어댑터: 빈칸 계열 이물 필드 없음(blanks/passageWithBlank/originalExpression)",
  !("blanks" in ai) && !("passageWithBlank" in ai) && !("originalExpression" in ai),
);
check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
check(
  "★ 어댑터: acceptedAnswers 선두에 modelAnswer 강제 삽입(스키마 계약)",
  Array.isArray(ai.acceptedAnswers) &&
    (ai.acceptedAnswers as string[])[0] === ANSWER &&
    (ai.acceptedAnswers as string[]).length === 2,
  JSON.stringify(ai.acceptedAnswers),
);
check(
  "★ 어댑터: scrambledWords 가 정답 어순이 아니다(§9 #1)",
  !chipsAreInAnswerOrder(ai.scrambledWords as string[], ANSWER),
  (ai.scrambledWords as string[]).join(" / "),
);
check(
  "어댑터: 선언 미끼가 전부 scrambledWords 안에 실재(학생 페이로드 알파벳 재정렬 방지)",
  (ai.wordBankDistractors as string[]).every((d) => (ai.scrambledWords as string[]).includes(d)),
);
check(
  "어댑터: 미끼 0개면 발문 괄호 안내 제거",
  String(
    (adaptMdWordOrderToAiQuestion({ ...snapped.question, distractors: [] }, "BASIC").aiQuestion ?? {})
      .direction,
  ) === "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오.",
);
check(
  "어댑터: 모범답안 없으면 실패",
  adaptMdWordOrderToAiQuestion({ ...snapped.question, modelAnswer: "" }, "KILLER").ok === false,
);

const pp = postProcessQuestion("WORD_ORDER", PASSAGE, ai as never);
check("후처리: PASSTHROUGH 성공", pp.success === true, pp.error);
const data = (pp.data ?? {}) as Record<string, unknown>;
check(
  "후처리: 필드 무변형 통과(scrambledWords·modelAnswer 보존)",
  (data.scrambledWords as string[]).join("|") === (ai.scrambledWords as string[]).join("|") &&
    data.modelAnswer === ANSWER,
);
check(
  "후처리: 렌더 필수 필드 scrambledWords 존재(카드가 그려지는 조건)",
  Array.isArray(data.scrambledWords) && (data.scrambledWords as string[]).length > 0,
);
{
  const issues = validateQuestionQuality({
    typeId: "WORD_ORDER",
    question: data,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    stemLanguage: "ko",
  });
  const errors = issues.filter((i) => i.severity === "error");
  check("품질 검증기: error 0건", errors.length === 0, errors.map((e) => e.code).join(", "));
}
{
  // 게이트를 우회해 오염 문항을 넣으면 fast 검증기가 실제로 error 를 낸다 —
  // 즉 md 게이트가 그 자리를 대신 막고 있다는 대조군.
  const dirty = {
    ...data,
    acceptedAnswers: [ANSWER, "The norms were formed by early adopters."],
  };
  const codes = validateQuestionQuality({
    typeId: "WORD_ORDER",
    question: dirty,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
  })
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
  check(
    "대조군: 오염 허용답은 fast 검증기가 word-order-accepted-unreconstructable 로 잡는다",
    codes.includes("word-order-accepted-unreconstructable"),
    codes.join(", "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 채점 왕복 — buildAnswerSpec → gradeAnswer (서술형 계열의 핵심 축)
// ───────────────────────────────────────────────────────────────────────────
const spec = buildAnswerSpec({
  id: "q-word-order",
  type: "SUBJECTIVE",
  subType: "WORD_ORDER",
  correctAnswer: String(data.correctAnswer ?? ""),
  structuredData: data,
  sourcePassageContent: PASSAGE,
  points: 4,
});
check("채점: inputKind TEXT_SINGLE", spec.inputKind === "TEXT_SINGLE", spec.inputKind);
check("채점: textMode EXACT", spec.textMode === "EXACT", String(spec.textMode));
check(
  "채점: 필드 키가 'answer'(학생 입력 키 계약)",
  spec.fields?.length === 1 && spec.fields?.[0].key === "answer",
  JSON.stringify(spec.fields?.map((f) => f.key)),
);
check(
  "채점: 허용 정답 집합에 modelAnswer + 등가 어순 2건",
  (spec.fields?.[0].answers.length ?? 0) === 2,
  JSON.stringify(spec.fields?.[0].answers),
);
check(
  "채점: 모범답안 그대로 제출 → CORRECT 만점",
  (() => {
    const r = gradeAnswer(spec, { texts: { answer: ANSWER } });
    return r.status === "CORRECT" && r.earnedPoints === 4;
  })(),
);
check(
  "채점: 문말 마침표 없이 제출해도 CORRECT(normalizeText 관용)",
  gradeAnswer(spec, { texts: { answer: ANSWER.replace(/\.$/, "") } }).status === "CORRECT",
);
check(
  "채점: 허용답(등가 어순) 제출 → CORRECT",
  gradeAnswer(spec, {
    texts: {
      answer:
        "The norms were shaped by early adopters, spreading faster than regulators could respond.",
    },
  }).status === "CORRECT",
);
check(
  "★ 채점: 단어를 바꿔 쓴 답은 WRONG(허용답 절삭이 오답 흡수를 막았다)",
  gradeAnswer(spec, {
    texts: {
      answer:
        "The norms were formed by early adopters, spreading faster than regulators could respond.",
    },
  }).status === "WRONG",
);
check(
  "채점: 미끼 칩을 섞어 쓴 답은 WRONG",
  gradeAnswer(spec, {
    texts: { answer: "Spreading faster than regulators could respond, the norms shaped by regulators." },
  }).status === "WRONG",
);
check("채점: 무응답은 WRONG", gradeAnswer(spec, { texts: { answer: "" } }).status === "WRONG");
check("채점: 부분점수 없음(필드 1개)", spec.partialCredit === false);

// ───────────────────────────────────────────────────────────────────────────
// 8. 레인 계약 — 과금 축 · 적격성 · 난이도 3분기 · 다양성
// ───────────────────────────────────────────────────────────────────────────
check("레인: subType WORD_ORDER", WORD_ORDER_MD_LANE.subType === "WORD_ORDER");
check(
  "★ 레인: 과금 QUESTION_GEN_SINGLE (fast getOperationType 동기 — 이중청구 회귀 방지)",
  WORD_ORDER_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(WORD_ORDER_MD_LANE.operationType),
);
check("레인: retryEligible", WORD_ORDER_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 항상 true(유형 전용 설정 키가 없음)",
  WORD_ORDER_MD_LANE.isEligible({}) && WORD_ORDER_MD_LANE.isEligible({ anything: 99 }),
);
check(
  "레인: diversityTargets = modelAnswer",
  WORD_ORDER_MD_LANE.diversityTargets({ modelAnswer: ANSWER })[0] === ANSWER.slice(0, 90),
);
check("레인: diversityTargets 빈 입력 방어", WORD_ORDER_MD_LANE.diversityTargets({}).length === 0);

const laneCtx = (difficulty: "BASIC" | "INTERMEDIATE" | "KILLER", stemLanguage?: string) => ({
  passage: PASSAGE,
  difficulty,
  rawDifficulty: difficulty,
  resolved: {} as Record<string, unknown>,
  rawTypeSettings: stemLanguage
    ? { WORD_ORDER: { stemLanguage } }
    : undefined,
  teacherPoints: [],
  variantIndex: 0,
  variantCount: 1,
});

for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = WORD_ORDER_MD_LANE.buildBasePrompt(laneCtx(d));
  check(
    `프롬프트 ${d}: 난이도 분기 + 출력 형식 + 지문 포함`,
    p.includes("## 출력 형식") &&
      p.includes("모범답안:") &&
      p.includes("칩:") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
check(
  "프롬프트: 난이도별 표적 설계 헤더가 서로 다르다(3분기 실재)",
  new Set(
    (["BASIC", "INTERMEDIATE", "KILLER"] as const).map((d) =>
      buildMdWordOrderPrompt(PASSAGE, "full", d).match(/^## 표적 설계.*$/m)?.[0] ?? "",
    ),
  ).size === 3,
);
check(
  "프롬프트: KILLER 미끼 하한 2 · BASIC 1 이 문면에 실린다",
  buildMdWordOrderPrompt(PASSAGE, "full", "KILLER").includes("2개 이상") &&
    wordOrderMdDistractorMin("BASIC") === 1 &&
    wordOrderMdDistractorMin("KILLER") === 2,
);
check(
  "프롬프트: few-shot 해부는 BASIC 에서 생략(정본 관습)",
  !buildMdWordOrderPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdWordOrderPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
);
check(
  "★ 프롬프트: 정답을 두 곳에서 받지 않는다 — `칩:` 출력 줄 소멸(§1-B 철칙1)",
  (() => {
    const p = buildMdWordOrderPrompt(PASSAGE, "full", "KILLER");
    const format = p.slice(p.indexOf("## 출력 형식"), p.indexOf("## 지문"));
    return (
      !/^칩:/m.test(format) &&
      p.includes("`칩:` 줄은 **만들지 마라**") &&
      format.includes("청크 경계마다") &&
      format.includes("정답에 쓰이지 않는 **새 칩**")
    );
  })(),
);
check(
  "프롬프트: verbatim 재배열 금지 자기검산(연속 6단어)",
  buildMdWordOrderPrompt(PASSAGE, "full", "KILLER").includes("연속 6단어 이상"),
);
check(
  "프롬프트: 선지·오답 블록을 요구하지 않는다(서술형 계약)",
  (() => {
    const p = buildMdWordOrderPrompt(PASSAGE, "full", "KILLER");
    return (
      !p.includes("오답:") &&
      !/^[①②③④⑤]/m.test(p) &&
      !p.includes("정답: <①") &&
      p.includes("선지가 없다")
    );
  })(),
);
check(
  "레인: buildExtras 기본은 빈 배열(교사포인트 블록 없음)",
  WORD_ORDER_MD_LANE.buildExtras(laneCtx("KILLER")).length === 0,
);
check(
  "레인: stemLanguage=en 이면 발문 언어 블록 추가",
  WORD_ORDER_MD_LANE.buildExtras(laneCtx("KILLER", "en")).some((b) => b.includes("질문 언어")),
);
check(
  "레인: qualityArgs 는 stemLanguage 만(없는 슬롯 금지)",
  Object.keys(WORD_ORDER_MD_LANE.qualityArgs(laneCtx("KILLER"))).join(",") === "stemLanguage",
  JSON.stringify(WORD_ORDER_MD_LANE.qualityArgs(laneCtx("KILLER"))),
);
check(
  "레인: mdFormat 에 미끼 하한·난이도 실값",
  WORD_ORDER_MD_LANE.mdFormat(laneCtx("KILLER")).distractorMin === 2 &&
    WORD_ORDER_MD_LANE.mdFormat(laneCtx("BASIC")).distractorMin === 1,
);
{
  const laneParsed = WORD_ORDER_MD_LANE.parseAndGate(GOOD, laneCtx("KILLER"));
  check(
    "레인: parseAndGate 정상 입력 클린",
    laneParsed.gateIssues.length === 0 && laneParsed.corrections.length === 0,
    laneParsed.gateIssues.join(" / "),
  );
  const laneAdapt = WORD_ORDER_MD_LANE.adapt(laneParsed, laneCtx("KILLER"));
  check("레인: adapt 성공", laneAdapt.ok === true, laneAdapt.error);
  check(
    "레인: 게이트가 본 칩 == 어댑터가 싣는 칩(형상 동기)",
    ((laneAdapt.aiQuestion?.scrambledWords ?? []) as string[]).join("|") ===
      (laneParsed.question as MdWordOrderQuestion).chips.join("|"),
  );
  const enAdapt = WORD_ORDER_MD_LANE.adapt(laneParsed, laneCtx("KILLER", "en"));
  check(
    "레인: stemLanguage=en 이면 발문 영어",
    String(enAdapt.aiQuestion?.direction).startsWith("Rearrange the given words"),
    String(enAdapt.aiQuestion?.direction),
  );
}
{
  const laneParsed = WORD_ORDER_MD_LANE.parseAndGate(GOOD, laneCtx("BASIC"));
  check(
    "레인: BASIC 은 미끼 하한 1 로 게이트(난이도 실값 집행)",
    laneParsed.gateIssues.length === 0,
    laneParsed.gateIssues.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. 신형식(단일 진실원) — `모범답안:` 줄의 ` / ` 청크 경계가 곧 정답 칩이다.
//    적대검수 major(§1-B 철칙1 위반) 수리분: 정답 문장을 `모범답안:`·`칩:` 두 줄에
//    걸쳐 축자로 두 번 받던 중복 계약을 철회했다. 위 1~8절은 구형(`칩:` 줄) 출력이
//    폴백으로 **무회귀** 흡수되는지를 그대로 지키는 대조군이다.
// ───────────────────────────────────────────────────────────────────────────
const V2 = `모범답안: Spreading faster / than regulators could respond, / the norms / were shaped / by early adopters.
미끼: by regulators / shaped
힌트: 앞 문장의 인과 관계를 뒤집어 결과 쪽에 초점을 둔 문장입니다.
허용답:
- The norms were shaped by early adopters, spreading faster than regulators could respond.
해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이 문두에 오고 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.`;

{
  const raw = parseMdWordOrder(V2);
  check("신형식: 청크 마커를 지운 완성 문장이 modelAnswer", raw.modelAnswer === ANSWER, raw.modelAnswer);
  check("신형식: chunksFromAnswer 플래그", raw.chunksFromAnswer === true);
  check(
    "신형식: 칩 = 정답 청크 5 ∪ 미끼 2 (칩 줄 없이 파생)",
    raw.chips.length === 7 &&
      raw.chips.includes("than regulators could respond,") &&
      raw.chips.includes("by early adopters.") &&
      raw.chips.includes("shaped"),
    raw.chips.join(" | "),
  );
  check(
    "신형식: 구두점은 앞 청크에 붙어 보존된다(구두점 전용 칩 0)",
    raw.chips.every((c) => c.trim().length > 1),
    raw.chips.join(" | "),
  );

  const s = snapOf(V2);
  check(
    "★ 신형식: 스냅 무보정 — 청크가 정답 어순인 건 정상이라 '재배열' 을 기록하지 않는다",
    s.corrections.length === 0,
    s.corrections.join(" / "),
  );
  check(
    "신형식: 스냅이 칩을 정답 어순에서 떼어 놓는다",
    !chipsAreInAnswerOrder(s.question.chips, ANSWER) &&
      gateRaw(s.question).length === 0,
    `${s.question.chips.join(" / ")} :: ${gateRaw(s.question).join(" / ")}`,
  );
  check("신형식: 게이트 클린(KILLER 미끼 2)", gateOf(V2, 2).length === 0, gateOf(V2, 2).join(" / "));
  check(
    "신형식: 회계가 항등식 — 과부족 0",
    (() => {
      const a = wordOrderAccounting(s.question.chips, s.question.distractors, ANSWER);
      return a.missing.length === 0 && a.surplus.length === 0;
    })(),
  );
  check(
    "신형식: 청크 이어붙이기 헬퍼(구두점 앞 공백 드리프트 흡수)",
    joinWordOrderChunks(["Spreading faster", "than regulators could respond ,", "the norms"]) ===
      "Spreading faster than regulators could respond, the norms",
    joinWordOrderChunks(["Spreading faster", "than regulators could respond ,", "the norms"]),
  );

  // ★ M5 수리의 핵심 — 구형에서는 칩 줄이 관사 하나만 흘려도 문항이 통째로 반려됐다.
  //   신형식은 정답과 칩이 같은 문자열에서 나오므로 그 어긋남이 **구조적으로 불가능**하다.
  const dropped = V2.replace("/ the norms /", "/ norms /");
  const dq = parsedOf(dropped);
  check(
    "★ 신형식: 청크를 다르게 끊어도 '부족 토큰' 반려가 불가능(정답이 함께 움직인다)",
    dq.modelAnswer === "Spreading faster than regulators could respond, norms were shaped by early adopters." &&
      gateRaw(dq).length === 0,
    `${dq.modelAnswer} :: ${gateRaw(dq).join(" / ")}`,
  );
  check(
    "대조군(구형): 같은 누락이 `칩:` 줄에서 나면 여전히 '부족 토큰' 반려",
    gateOf(GOOD.replace("칩: the norms /", "칩: norms /")).some((i) => i.includes("부족 토큰")),
  );

  // 어댑터 → 후처리 → 채점 왕복(신형식)
  const a2 = adaptMdWordOrderToAiQuestion(s.question, "KILLER");
  check("신형식: 어댑터 성공", a2.ok === true, a2.error);
  const ai2 = (a2.aiQuestion ?? {}) as Record<string, unknown>;
  const pp2 = postProcessQuestion("WORD_ORDER", PASSAGE, ai2 as never);
  check("신형식: 후처리 성공", pp2.success === true, pp2.error);
  const spec2 = buildAnswerSpec({
    id: "q-word-order-v2",
    type: "SUBJECTIVE",
    subType: "WORD_ORDER",
    correctAnswer: String((pp2.data as Record<string, unknown>).correctAnswer ?? ""),
    structuredData: pp2.data as Record<string, unknown>,
    sourcePassageContent: PASSAGE,
    points: 4,
  });
  check(
    "★ 신형식: 제시 칩을 정답 순서로 배열한 답이 CORRECT(채점 왕복)",
    gradeAnswer(spec2, { texts: { answer: ANSWER } }).status === "CORRECT",
  );
  check(
    "신형식: 품질 검증기 error 0건",
    validateQuestionQuality({
      typeId: "WORD_ORDER",
      question: pp2.data as Record<string, unknown>,
      passage: PASSAGE,
      requestedDifficulty: "KILLER",
      stemLanguage: "ko",
    }).filter((i) => i.severity === "error").length === 0,
  );
  const laneV2 = WORD_ORDER_MD_LANE.parseAndGate(V2, laneCtx("KILLER"));
  check(
    "신형식: 레인 parseAndGate 클린 + 보정 기록 없음",
    laneV2.gateIssues.length === 0 && laneV2.corrections.length === 0,
    `${laneV2.gateIssues.join(" / ")} :: ${laneV2.corrections.join(" / ")}`,
  );
}
{
  // 미끼가 정답 청크와 축자 동일 — 신형식이 새로 만든 실패 모드(같은 칩 2개)
  const dup = V2.replace("미끼: by regulators / shaped", "미끼: by regulators / the norms");
  check(
    "★ 신형식 게이트: 미끼가 정답 청크와 동일하면 반려(같은 칩 2개 제시)",
    gateOf(dup, 2).some((i) => i.includes("정답 청크와 동일")),
    gateOf(dup, 2).join(" / "),
  );
}
{
  // 청크 마커를 안 쓰고 `칩:` 줄도 없는 출력 — 자리를 지목해야 한다(§1-B 철칙5)
  const noChunk = V2.replace(/^모범답안:.*$/m, `모범답안: ${ANSWER}`);
  check(
    "신형식 게이트: 청크 경계 없음을 정확히 지목",
    gateOf(noChunk, 2).some((i) => i.includes("모범답안 줄에 청크 경계가 없음")),
    gateOf(noChunk, 2).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10. [적대검수 critical] 표 행 파이프 잔재 — 반쪽 관용 금지(§1-B 철칙3)
//     헤더가 선두 파이프만 흡수하고 값 안·끝의 파이프를 남기면, 그 문자열이 그대로
//     채점 correctAnswer 가 되어 **정답을 정확히 쓴 학생 전원이 오답**이 된다.
//     토큰 회계가 파이프를 버리므로 게이트는 클린을 내 사고가 은폐된다.
// ───────────────────────────────────────────────────────────────────────────
{
  const piped = V2.replace(
    /^모범답안:.*$/m,
    "| 모범답안: | Spreading faster / than regulators could respond, / the norms / were shaped / by early adopters. |",
  ).replace("미끼: by regulators / shaped", "| 미끼: | by regulators / shaped |");
  const q = parsedOf(piped);
  check(
    "★ 파이프: 모범답안 값에서 앞뒤 파이프 제거(꼬리 마침표 뒤 파이프 포함)",
    q.modelAnswer === ANSWER,
    JSON.stringify(q.modelAnswer),
  );
  check(
    "★ 파이프: 칩·미끼 어디에도 파이프가 남지 않는다",
    q.chips.every((c) => !c.includes("|")) && q.distractors.every((d) => !d.includes("|")),
    `${q.chips.join(" | ")} :: ${q.distractors.join(" | ")}`,
  );
  check("파이프: 게이트 클린", gateRaw(q).length === 0, gateRaw(q).join(" / "));
  check(
    "★ 파이프: 채점 왕복 — 정답 문장을 그대로 쓴 학생이 CORRECT (오염 시 전원 오답이었다)",
    (() => {
      const adapted = adaptMdWordOrderToAiQuestion(snapOf(piped).question, "KILLER");
      const processed = postProcessQuestion("WORD_ORDER", PASSAGE, adapted.aiQuestion as never);
      const data2 = processed.data as Record<string, unknown>;
      const s2 = buildAnswerSpec({
        id: "q-word-order-pipe",
        type: "SUBJECTIVE",
        subType: "WORD_ORDER",
        correctAnswer: String(data2.correctAnswer ?? ""),
        structuredData: data2,
        sourcePassageContent: PASSAGE,
        points: 4,
      });
      return gradeAnswer(s2, { texts: { answer: ANSWER } }).status === "CORRECT";
    })(),
  );
}
{
  // 구형 표 행 — 선두·중간·꼬리 파이프 전부
  const piped = GOOD.replace(
    /^칩:.*$/m,
    "| 칩: | the norms | by regulators | Spreading faster | were shaped | than regulators could respond | shaped | by early adopters |",
  );
  const q = parsedOf(piped);
  check(
    "★ 파이프(구형 표 행): 칩 7개 · 파이프 잔재 0 · 게이트 클린",
    q.chips.length === 7 && q.chips.every((c) => !c.includes("|")) && gateRaw(q).length === 0,
    `${q.chips.join(" | ")} :: ${gateRaw(q).join(" / ")}`,
  );
}
{
  // 값이 장식뿐인 표 행 — 벗기기 전에 "비었나"를 판정하면 빈 원소가 허용답 집합에
  // 실린다(채점 집합 오염). 스냅이 뒤에서 지워 주므로 게이트로는 절대 안 보인다.
  const q = parseMdWordOrder(GOOD.replace(/^허용답:$/m, "| 허용답: |"));
  check(
    "★ 파이프: 값이 파이프뿐인 헤더가 빈 허용답 원소를 만들지 않는다",
    q.acceptedAnswers.length === 1 && q.acceptedAnswers.every((a) => a.trim().length > 0),
    JSON.stringify(q.acceptedAnswers),
  );
  const b = parseMdWordOrder(
    GOOD.replace(
      "- The norms were shaped by early adopters, spreading faster than regulators could respond.",
      "- |\n- The norms were shaped by early adopters, spreading faster than regulators could respond.",
    ),
  );
  check(
    "★ 파이프: 장식뿐인 불릿(`- |`)도 빈 허용답 원소가 되지 않는다",
    b.acceptedAnswers.length === 1 && b.acceptedAnswers.every((a) => a.trim().length > 0),
    JSON.stringify(b.acceptedAnswers),
  );
}
{
  const tail = GOOD.replace("/ by early adopters", "/ by early adopters |");
  const q = parsedOf(tail);
  check(
    "★ 파이프: 꼬리 파이프만 있는 칩도 정리(`by early adopters |` → `by early adopters`)",
    q.chips.includes("by early adopters") && q.chips.every((c) => !c.includes("|")),
    q.chips.join(" | "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 11. [적대검수 critical] 칩 내부 슬래시 — `and/or` · `km/h` · `3/4`
//     공백 없는 슬래시를 구분자로 보면 칩이 조용히 쪼개진다. 토큰 회계가 슬래시를
//     버리므로 게이트는 전부 클린이고, 학생은 칩을 정답 순서로 남김없이 배열해도
//     `and or` ≠ `and/or` 라 오답 — **정답자가 구조적으로 0명**이 된다.
// ───────────────────────────────────────────────────────────────────────────
check(
  "★ 슬래시: 공백 없는 슬래시는 구분자가 아니다(and/or 보존)",
  (() => {
    const parts = splitWordOrderChips("The rules and/or norms / were shaped / by early adopters");
    return parts.length === 3 && parts[0] === "The rules and/or norms";
  })(),
  splitWordOrderChips("The rules and/or norms / were shaped / by early adopters").join(" | "),
);
check(
  "★ 슬래시: km/h 가 한 글자 칩 'h' 로 쪼개지지 않는다",
  (() => {
    const parts = splitWordOrderChips("Speeds above 30 km/h / by drivers / that year");
    return parts.length === 3 && parts[0] === "Speeds above 30 km/h" && !parts.includes("h");
  })(),
  splitWordOrderChips("Speeds above 30 km/h / by drivers / that year").join(" | "),
);
check(
  "슬래시: 한쪽 공백만 있는 드리프트(`a/ b`, `a /b`)는 계속 흡수",
  splitWordOrderChips("a/ b").length === 2 && splitWordOrderChips("a /b").length === 2,
);
check(
  "슬래시: 전각 슬래시(／)도 공백이 있으면 구분자",
  splitWordOrderChips("a ／ b").length === 2,
);
{
  const AND_OR = "The rules and/or norms were shaped by early adopters over time.";
  const md = `모범답안: The rules and/or norms / were shaped / by early adopters / over time.
미끼: by regulators
해설: 주절을 수동태로 바꾸고 주어를 명사구로 묶은 문장입니다. 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.`;
  const q = parsedOf(md);
  check(
    "★ 슬래시: and/or 를 담은 문항이 파싱·게이트를 온전히 통과",
    q.modelAnswer === AND_OR &&
      q.chips.includes("The rules and/or norms") &&
      gateMdWordOrder(q, PASSAGE, { distractorMin: 1 }).length === 0,
    `${q.modelAnswer} :: ${q.chips.join(" | ")} :: ${gateMdWordOrder(q, PASSAGE, { distractorMin: 1 }).join(" / ")}`,
  );
  check(
    "★ 슬래시: 채점 왕복 — 칩을 정답 순서로 배열한 답이 CORRECT",
    (() => {
      const adapted = adaptMdWordOrderToAiQuestion(q, "INTERMEDIATE");
      const processed = postProcessQuestion("WORD_ORDER", PASSAGE, adapted.aiQuestion as never);
      const data2 = processed.data as Record<string, unknown>;
      const s2 = buildAnswerSpec({
        id: "q-word-order-slash",
        type: "SUBJECTIVE",
        subType: "WORD_ORDER",
        correctAnswer: String(data2.correctAnswer ?? ""),
        structuredData: data2,
        sourcePassageContent: PASSAGE,
        points: 4,
      });
      return gradeAnswer(s2, { texts: { answer: AND_OR } }).status === "CORRECT";
    })(),
  );
}
{
  // 게이트 #7b — 토큰 회계가 원리상 못 보는 "단어 내부 기호 손실"을 문자 축으로 잡는다.
  const split = `모범답안: The rules and/or norms were shaped by early adopters over time.
칩: The rules and / or norms / were shaped / by early adopters / over time / by regulators
미끼: by regulators
해설: 주절을 수동태로 바꾸고 주어를 명사구로 묶은 문장입니다. 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.`;
  const q = parsedOf(split);
  const issues = gateMdWordOrder(q, PASSAGE, { distractorMin: 1 });
  check(
    "★ 게이트 #7b: 칩이 단어 내부 기호에서 갈리면 반려(토큰 회계는 클린인데도)",
    wordOrderAccounting(q.chips, q.distractors, q.modelAnswer).missing.length === 0 &&
      issues.some((i) => i.includes("단어 안의 기호")),
    issues.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 12. [적대검수 major] 해설 꼬리 흡수 — `해설:` 이 마지막 섹션이라 종결자가 없었다.
//     모델의 꼬리 출력이 통째로 해설에 실려 정답해설 지면이 미끼를 알려주고,
//     게이트 #12 는 한글 포함만 보므로 항상 통과했다.
// ───────────────────────────────────────────────────────────────────────────
{
  const q = parsedOf(GOOD.replace("해설: 원인절", "**해설:** 원인절"));
  check(
    "★ 해설: 닫는 볼드(`**해설:**`)가 값 선두에 박히지 않는다",
    q.explanation.startsWith("원인절을") && !q.explanation.includes("*"),
    JSON.stringify(q.explanation.slice(0, 30)),
  );
}
{
  const q = parsedOf(GOOD.replace("해설: 원인절", "## 해설: 원인절"));
  check(
    "★ 해설: 마크다운 제목 접두(`## 해설:`)에도 필드가 사라지지 않는다",
    q.explanation.startsWith("원인절을") && gateRaw(q).length === 0,
    `${JSON.stringify(q.explanation.slice(0, 24))} :: ${gateRaw(q).join(" / ")}`,
  );
}
{
  const q = parsedOf(
    `${GOOD}\n설계 노트: 미끼는 "by regulators" 와 "shaped" 두 개이며, 나머지 다섯 칩만 정답에 쓰입니다.`,
  );
  check(
    "★ 해설: 뒤따르는 설계 노트를 흡수하지 않는다(미끼 누설 차단)",
    !q.explanation.includes("설계") && !q.explanation.includes("미끼는"),
    JSON.stringify(q.explanation.slice(-40)),
  );
}
{
  const q = parsedOf(`${GOOD}\n발문: Rearrange the given words to complete the sentence.`);
  check(
    "★ 해설: 뒤따르는 영어 발문 줄을 흡수하지 않는다",
    !q.explanation.includes("Rearrange"),
    JSON.stringify(q.explanation.slice(-40)),
  );
}
{
  const q = parsedOf(`${GOOD}\n\n이 문항은 수동태 전환을 표적으로 삼았습니다.`);
  check(
    "★ 해설: 빈 줄 뒤 꼬리 산문을 흡수하지 않는다",
    !q.explanation.includes("표적으로"),
    JSON.stringify(q.explanation.slice(-40)),
  );
}
{
  // 무회귀 — 두 문장이 개행으로 갈려 오는 정상 드리프트는 계속 흡수한다
  const q = parsedOf(
    GOOD.replace(
      "해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이",
      "해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다.\n분사구문이",
    ),
  );
  check(
    "해설: 두 문장이 개행으로 갈려도 흡수(기존 관용 무회귀)",
    q.explanation.includes("분사구문이 문두에") && gateRaw(q).length === 0,
    JSON.stringify(q.explanation),
  );
}
check(
  "★ 게이트: 해설에 문항 표면에 없는 영어 문장이 섞이면 반려",
  gateRaw({
    ...parsed,
    explanation:
      "원인절을 분사구문으로 접은 문장입니다. Rearrange the given words to complete the sentence.",
  }).some((i) => i.includes("무관한 영어 문장")),
  gateRaw({
    ...parsed,
    explanation:
      "원인절을 분사구문으로 접은 문장입니다. Rearrange the given words to complete the sentence.",
  }).join(" / "),
);
check(
  "게이트: 해설이 정답 표현을 길게 인용하는 것은 허용(오검출 방지)",
  gateRaw({
    ...parsed,
    explanation:
      "분사구문을 문두에 두어 the norms were shaped by early adopters 순서가 됩니다. 행위자 전치사구가 뒤에 놓입니다.",
  }).every((i) => !i.includes("무관한 영어 문장")),
);
check(
  "게이트: 인용하며 쉼표를 흘려도 유출로 오검출하지 않는다(단어열 비교)",
  gateRaw({
    ...parsed,
    explanation:
      "원래 어순은 Spreading faster than regulators could respond the norms 입니다. 행위자 전치사구가 뒤에 놓입니다.",
  }).every((i) => !i.includes("무관한 영어 문장")),
  gateRaw({
    ...parsed,
    explanation:
      "원래 어순은 Spreading faster than regulators could respond the norms 입니다. 행위자 전치사구가 뒤에 놓입니다.",
  }).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 13. 키워드 줄 무관용 회귀 — 이번 웨이브 최대 결함 계통(silent-drop).
//     모든 라벨 줄이 강조(`**` `__` `*` `_` `***`)·값 쌍 장식(`"…"` `[…]`)·
//     전각콜론·불릿·제목·표 파이프·앞뒤 공백을 흡수해야 한다. 한 조합이라도 새면
//     그 필드가 통째로 사라지고 게이트가 **사실과 다른 원인**을 지목해, 그 문구가
//     그대로 [반려 재생성] 피드백이 되어 모델을 엉뚱하게 몬다.
//
//     ⚠ 표는 **구형·신형식 양쪽**에 똑같이 돌린다(_test-md-word-order-decoration.ts).
//       1차 수리 뒤에도 결함이 남은 이유가 정확히 이것이었다 — 이 표가 구형(`칩:` 줄)
//       픽스처 위에만 서 있어서 신형식 청크 줄의 장식 처리를 **한 번도** 통과시키지
//       않았고, 같은 결함이 다른 입구로 그대로 들어왔다. 줄 전체 쌍 장식 회귀·거짓
//       반려 차단·과잉 차단 금지 픽스처도 그 파일에 함께 있다.
// ───────────────────────────────────────────────────────────────────────────
runWordOrderDecorationMatrix({
  check,
  passage: PASSAGE,
  answer: ANSWER,
  legacyGood: GOOD,
  newGood: V2,
});

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
