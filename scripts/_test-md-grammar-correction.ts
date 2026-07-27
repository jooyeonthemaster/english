// 문법 오류 수정(GRAMMAR_CORRECTION) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processGrammarCorrection 왕복 + 검증기 + 과금 축까지.
// 실행: npx tsx scripts/_test-md-grammar-correction.ts
//
// 형식 계약: 밑줄지문 [[A:변형본]] + `고침(A): 틀린 표현 → 올바른 표현` 라벨 줄 +
// (선택) `허용답(A):` + `해설:`. `정답:` 줄과 `오답:` 섹션은 존재하지 않는다 —
// 이 유형의 정답은 각 고침 줄의 "올바른 표현" 하나뿐이라 별도 정답 줄은 100% 중복이다
// (규범 §1-B 철칙 1 — 반의어가 그 중복 때문에 실사용에서 2연속 반려됐다).
import {
  collectCorrectionMarks,
  deriveCorrectionSourceText,
  parseMdGrammarCorrection,
  reconstructCorrectionPassage,
  splitCorrectionPair,
} from "../src/lib/md-qgen/parser-grammar-correction";
import { autoSnapCorrectionSegments } from "../src/lib/md-qgen/snap-grammar-correction";
import { gateMdGrammarCorrection } from "../src/lib/md-qgen/gate-grammar-correction";
import { adaptMdGrammarCorrectionToAiQuestion } from "../src/lib/md-qgen/adapter-grammar-correction";
import { GRAMMAR_CORRECTION_MD_LANE } from "../src/lib/md-qgen/lane-grammar-correction";
import { buildMdGrammarCorrectionPrompt } from "../src/lib/md-qgen/prompts-grammar-correction";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import { runWave2Fixtures } from "./_test-md-grammar-correction-wave2";
import { runDecorationFixtures } from "./_test-md-grammar-correction-decoration";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const S1 =
  "Trees planted along a busy street, whose canopies overlap by midsummer, reduce the surface temperature of the pavement beneath them.";
const S2 =
  "City planners who ignore this cooling effect often underestimate how much energy a neighborhood spends on air conditioning.";
const S3 =
  "A row of young saplings, together with a strip of grass, was installed last spring as a pilot project.";
const S4 = "Cool air settles near the shaded ground.";
const S5 =
  "Residents reported that the sidewalk felt noticeably cooler within two summers.";
const S6 =
  "The number of similar projects has grown steadily since the first measurements were published.";
const PASSAGE = [S1, S2, S3, S4, S5, S6].join(" ");

function mutate(sentence: string, from: string, to: string): string {
  return sentence.replace(new RegExp(`(?<![A-Za-z])${from}(?![A-Za-z])`), to);
}
function mark(
  passage: string,
  sentence: string,
  label: string,
  from: string,
  to: string,
): string {
  return passage.replace(sentence, `[[${label}:${mutate(sentence, from, to)}]]`);
}

// 정상 마킹 — (A) 수일치(reduce→reduces) · (B) 수일치(was→were).
const MARKED = mark(
  mark(PASSAGE, S1, "A", "reduce", "reduces"),
  S3,
  "B",
  "was",
  "were",
);

const GOOD = `밑줄지문:
${MARKED}

고침(A): reduces → reduce
고침(B): were → was
허용답(A): reduce | do reduce
해설: (A)의 진짜 주어는 Trees 이므로 복수 동사 reduce 가 와야 합니다. (B)의 주어는 A row 이므로 together with 로 이어진 명사구에 끌리지 말고 단수 동사 was 를 써야 합니다.`;

function gateOf(text: string, errorCount = 2, difficulty = "KILLER"): string[] {
  const q = autoSnapCorrectionSegments(parseMdGrammarCorrection(text)).question;
  return gateMdGrammarCorrection(q, PASSAGE, {
    errorCount,
    requestedDifficulty: difficulty,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로 — 파싱·복원·재구성
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdGrammarCorrection(GOOD);
check("파싱: 밑줄 구간 2개", parsed.segments.length === 2, `실제 ${parsed.segments.length}`);
check("파싱: 라벨 (A)(B)", parsed.segments.map((s) => s.label).join("") === "(A)(B)");
check(
  "파싱: 틀린 표현·올바른 표현",
  parsed.segments[0].errorPart === "reduces" &&
    parsed.segments[0].correctedPart === "reduce" &&
    parsed.segments[1].errorPart === "were" &&
    parsed.segments[1].correctedPart === "was",
  JSON.stringify(parsed.segments.map((s) => [s.errorPart, s.correctedPart])),
);
check(
  "파싱: 허용답 (A) 2개 · (B) 없음",
  parsed.segments[0].acceptedAnswers.join("|") === "reduce|do reduce" &&
    parsed.segments[1].acceptedAnswers.length === 0,
  parsed.segments[0].acceptedAnswers.join("|"),
);
check("파싱: 해설 존재", parsed.explanation.length > 20);
check(
  "파싱: 밑줄지문에 고침·해설 줄이 섞이지 않음",
  !parsed.markedPassage.includes("고침") && !parsed.markedPassage.includes("해설"),
);
check("마커 수집: 2개", collectCorrectionMarks(parsed.markedPassage).length === 2);
check(
  "원문 복원: (A) sourceText == 원 문장",
  deriveCorrectionSourceText(parsed.segments[0]) === S1,
  String(deriveCorrectionSourceText(parsed.segments[0])),
);
check(
  "원문 복원: (B) sourceText == 원 문장",
  deriveCorrectionSourceText(parsed.segments[1]) === S3,
);
check(
  "재구성: 마커를 원문으로 되돌리면 지문과 동일",
  reconstructCorrectionPassage(parsed).trim() === PASSAGE,
);

const snapped = autoSnapCorrectionSegments(parsed);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린",
  gateMdGrammarCorrection(snapped.question, PASSAGE, {
    errorCount: 2,
    requestedDifficulty: "KILLER",
  }).length === 0,
  gateMdGrammarCorrection(snapped.question, PASSAGE, {
    errorCount: 2,
    requestedDifficulty: "KILLER",
  }).join(" / "),
);

// 밑줄 1개 문항(기본 설정) — 구형 라벨 없는 `고침:` 줄까지 흡수한다.
const SINGLE = `밑줄지문:
${mark(PASSAGE, S1, "A", "reduce", "reduces")}

고침: reduces → reduce
해설: 진짜 주어는 Trees 이므로 복수 동사 reduce 가 와야 합니다. 삽입된 관계절의 midsummer 에 끌리면 안 됩니다.`;
{
  const q = autoSnapCorrectionSegments(parseMdGrammarCorrection(SINGLE)).question;
  check("파싱: 라벨 없는 구형 고침 줄을 첫 밑줄에 귀속", q.segments[0].correctedPart === "reduce");
  check(
    "게이트: 밑줄 1개 문항 클린",
    gateMdGrammarCorrection(q, PASSAGE, { errorCount: 1, requestedDifficulty: "BASIC" }).length === 0,
    gateMdGrammarCorrection(q, PASSAGE, { errorCount: 1 }).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 형상·계약
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트 개수: 마커 1개면 반려",
  gateOf(GOOD.replace(`[[B:${mutate(S3, "was", "were")}]]`, S3)).some((i) =>
    i.includes("밑줄 마커"),
  ),
);
check(
  "게이트: 고침 줄 없음 반려(자리를 지목)",
  gateOf(GOOD.replace("고침(B): were → was\n", "")).some(
    (i) => i.includes("(B) 고침 줄 없음"),
  ),
  gateOf(GOOD.replace("고침(B): were → was\n", "")).join(" / "),
);
check(
  "게이트: 틀린 표현이 밑줄 안에 없음 반려",
  gateOf(GOOD.replace("고침(A): reduces → reduce", "고침(A): lowers → reduce")).some((i) =>
    i.includes("밑줄 구간 안에 없음"),
  ),
);
check(
  "게이트: 틀린 표현과 올바른 표현이 같으면 반려",
  gateOf(GOOD.replace("고침(A): reduces → reduce", "고침(A): reduces → reduces")).some((i) =>
    i.includes("같음"),
  ),
);
check(
  "게이트: 틀린 표현이 구간에 2회 등장하면 반려",
  gateOf(
    GOOD.replace("고침(B): were → was", "고침(B): a → the"),
  ).some((i) => i.includes("회 등장")),
  gateOf(GOOD.replace("고침(B): were → was", "고침(B): a → the")).join(" / "),
);
check(
  "게이트: 마커 밖 지문 무단 편집 반려",
  gateOf(GOOD.replace("Residents reported", "Residents later reported")).some((i) =>
    i.includes("지문 재구성 불일치"),
  ),
);
check(
  "게이트: 마커 안 이중 변형 반려(되돌린 구간이 지문에 없음)",
  gateOf(GOOD.replace("a busy street", "a quiet street")).some(
    (i) => i.includes("지문에 축자로 없음") || i.includes("지문 재구성 불일치"),
  ),
);
check(
  "게이트: 해설 누락 반려",
  gateOf(GOOD.split("해설:")[0]).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 유령 고침 라벨 지목",
  gateOf(`${GOOD}\n고침(D): were → was`).some((i) => i.includes("(D) 마커가 없음")),
  gateOf(`${GOOD}\n고침(D): were → was`).join(" / "),
);
check(
  "게이트: 고침 줄 라벨 중복 지목",
  gateOf(`${GOOD}\n고침(A): reduces → reduce`).some((i) => i.includes("라벨 중복")),
);
check(
  "게이트: 허용답에 틀린 표현이 들어가면 반려",
  gateOf(GOOD.replace("허용답(A): reduce | do reduce", "허용답(A): reduce | reduces")).some(
    (i) => i.includes("허용답에 틀린 표현"),
  ),
);

// 밑줄 폭 — 오류 토큰만 밑줄 치면 답을 알려 준 것이다.
{
  const narrow = `밑줄지문:
${PASSAGE.replace("reduce the surface", "[[A:reduces]] the surface")}

고침(A): reduces → reduce
해설: 진짜 주어는 Trees 이므로 복수 동사가 필요합니다. 삽입 관계절에 끌리면 안 됩니다.`;
  const issues = gateMdGrammarCorrection(
    autoSnapCorrectionSegments(parseMdGrammarCorrection(narrow)).question,
    PASSAGE,
    { errorCount: 1, requestedDifficulty: "INTERMEDIATE" },
  );
  check(
    "게이트: 밑줄이 고칠 표현 자체면 반려",
    issues.some((i) => i.includes("밑줄이 고칠 표현 자체")),
    issues.join(" / "),
  );
  check("게이트: 밑줄 구간이 너무 짧으면 반려", issues.some((i) => i.includes("너무 짧음")));
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 게이트 반려 — 정답 시비(fast 검증기 error 승격 이식)
// ───────────────────────────────────────────────────────────────────────────
{
  const tense = `밑줄지문:
${mark(PASSAGE, S1, "A", "reduce", "reduced")}

고침(A): reduced → reduce
해설: 문맥상 현재 시제가 맞습니다. 그래서 reduce 로 고쳐야 합니다.`;
  check(
    "게이트: 시제 단독 교체(reduce↔reduced) 반려",
    gateOf(tense, 1).some((i) => i.includes("시제 단독 교체")),
    gateOf(tense, 1).join(" / "),
  );
}
{
  const quantity = `밑줄지문:
${mark(PASSAGE, S6, "A", "number", "amount")}

고침(A): amount → number
해설: 가산 명사 projects 앞이므로 number 가 맞습니다. amount 는 불가산 명사에 씁니다.`;
  check(
    "게이트: 수량 논쟁쌍(amount↔number) 반려",
    gateOf(quantity, 1).some((i) => i.includes("수량 표현 정답 시비")),
    gateOf(quantity, 1).join(" / "),
  );
}
{
  const thin = `밑줄지문:
${mark(PASSAGE, S4, "A", "settles", "settle")}

고침(A): settle → settles
해설: 주어 Cool air 는 단수이므로 settles 가 맞습니다. 그래서 settle 을 고쳐야 합니다.`;
  check(
    "게이트: KILLER 얇은 표적 반려",
    gateOf(thin, 1, "KILLER").some((i) => i.includes("얇은 표적")),
    gateOf(thin, 1, "KILLER").join(" / "),
  );
  check(
    "게이트: 같은 표적도 INTERMEDIATE 면 통과(난이도 분기 확인)",
    gateOf(thin, 1, "INTERMEDIATE").length === 0,
    gateOf(thin, 1, "INTERMEDIATE").join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 드리프트 관용 — 전부 2구간 + 게이트 클린이어야 한다.
//    (줄이 통째로 유실되면 게이트에는 "고침 줄 없음"으로만 보여 진짜 원인이 은폐된다)
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두", "고침(A): reduces → reduce", "- 고침(A): reduces → reduce"],
  ["별표 불릿", "고침(A): reduces → reduce", "* 고침(A): reduces → reduce"],
  ["굵게 라벨", "고침(A): reduces → reduce", "**고침(A)**: reduces → reduce"],
  ["라벨 소문자", "고침(A): reduces → reduce", "고침(a): reduces → reduce"],
  ["라벨 괄호 없음", "고침(A): reduces → reduce", "고침 A: reduces → reduce"],
  ["대괄호 라벨", "고침(A): reduces → reduce", "고침[A]: reduces → reduce"],
  ["전각 콜론", "고침(A): reduces → reduce", "고침(A)： reduces → reduce"],
  ["화살표 ASCII", "고침(A): reduces → reduce", "고침(A): reduces -> reduce"],
  ["화살표 =>", "고침(A): reduces → reduce", "고침(A): reduces => reduce"],
  ["화살표 ⇒", "고침(A): reduces → reduce", "고침(A): reduces ⇒ reduce"],
  ["파이프 구분자", "고침(A): reduces → reduce", "고침(A): reduces | reduce"],
  ["공백 대시 구분자", "고침(A): reduces → reduce", "고침(A): reduces - reduce"],
  ["en dash 구분자", "고침(A): reduces → reduce", "고침(A): reduces – reduce"],
  ["따옴표 감쌈", "고침(A): reduces → reduce", `고침(A): "reduces" → "reduce"`],
  ["백틱 감쌈", "고침(A): reduces → reduce", "고침(A): `reduces` → `reduce`"],
  ["구분자 주변 공백 과다", "고침(A): reduces → reduce", "고침(A):   reduces    →    reduce"],
  ["표 형식 행", "고침(A): reduces → reduce", "| 고침(A) | reduces → reduce |"],
  ["허용답 굵게·불릿", "허용답(A): reduce | do reduce", "- **허용답(A)**: reduce | do reduce"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdGrammarCorrection(drifted);
  const issues = gateOf(drifted);
  check(
    `줄 유실 방지: ${name}`,
    q.segments.length === 2 &&
      q.segments[0].errorPart === "reduces" &&
      q.segments[0].correctedPart === "reduce" &&
      issues.length === 0,
    `구간 ${q.segments.length}개 · (A)='${q.segments[0]?.errorPart}→${q.segments[0]?.correctedPart}' · ${issues.join(" / ")}`,
  );
}

// 하이픈 포함 표현이 공백 대시 폴백에 깨지지 않는다.
check(
  "하이픈 표현 보존: 'well-being → well-beings' 분리",
  splitCorrectionPair("well-beings → well-being")?.correctedPart === "well-being" &&
    splitCorrectionPair("well-beings → well-being")?.errorPart === "well-beings",
);
// 과잉 관용 방지 — 라벨 섹션 밖 산문은 고침 줄로 오인하지 않는다.
check(
  "과잉 관용 방지: '고침' 글자가 없는 산문 줄 무시",
  parseMdGrammarCorrection(`${GOOD}\n두 밑줄 모두 수일치 포인트입니다.`).segments.length === 2,
);

// ───────────────────────────────────────────────────────────────────────────
// 5. 스냅(0원 보정) — 전부 재구성 게이트가 최종 심판이라는 이중 안전망 위에서 돈다.
// ───────────────────────────────────────────────────────────────────────────
{
  const s = autoSnapCorrectionSegments(
    parseMdGrammarCorrection(GOOD.replace("고침(A): reduces → reduce", "고침(A): reduces. → reduce.")),
  );
  check(
    "스냅: 꼬리 구두점 제거",
    s.corrections.some((c) => c.includes("꼬리 구두점")) &&
      s.question.segments[0].errorPart === "reduces" &&
      s.question.segments[0].correctedPart === "reduce",
    s.corrections.join(" / "),
  );
  check(
    "스냅 후 게이트 클린(꼬리 구두점)",
    gateMdGrammarCorrection(s.question, PASSAGE, { errorCount: 2 }).length === 0,
    gateMdGrammarCorrection(s.question, PASSAGE, { errorCount: 2 }).join(" / "),
  );
}
{
  const s = autoSnapCorrectionSegments(
    parseMdGrammarCorrection(GOOD.replace("고침(A): reduces → reduce", "고침(A): reduce → reduces")),
  );
  check(
    "스냅: 화살표 좌우 뒤집힘 복구",
    s.corrections.some((c) => c.includes("좌우 교정")) &&
      s.question.segments[0].errorPart === "reduces",
    s.corrections.join(" / "),
  );
  check(
    "스냅 후 게이트 클린(좌우 교정)",
    gateMdGrammarCorrection(s.question, PASSAGE, { errorCount: 2 }).length === 0,
  );
}
{
  const s = autoSnapCorrectionSegments(
    parseMdGrammarCorrection(GOOD.replace("고침(B): were → was", "고침(B): Were → was")),
  );
  check(
    "스냅: 틀린 표현 대소문자 스냅",
    s.corrections.some((c) => c.includes("대소문자 스냅")) &&
      s.question.segments[1].errorPart === "were",
    s.corrections.join(" / "),
  );
}
{
  const s = autoSnapCorrectionSegments(
    parseMdGrammarCorrection(GOOD.replace("허용답(A): reduce | do reduce", "허용답(A): do reduce")),
  );
  check(
    "스냅: 허용답에 올바른 표현 보충(모범답안 누락 = 정답 학생 오답 처리)",
    s.corrections.some((c) => c.includes("허용답에 올바른 표현")) &&
      s.question.segments[0].acceptedAnswers[0] === "reduce",
    s.corrections.join(" / "),
  );
}
{
  const s = autoSnapCorrectionSegments(
    parseMdGrammarCorrection(
      GOOD.replace("허용답(A): reduce | do reduce", "허용답(A): reduce | reduce | do reduce"),
    ),
  );
  check(
    "스냅: 허용답 중복 제거",
    s.question.segments[0].acceptedAnswers.join("|") === "reduce|do reduce",
    s.question.segments[0].acceptedAnswers.join("|"),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 어댑터 → processGrammarCorrection 왕복 → 검증기
// ───────────────────────────────────────────────────────────────────────────
{
  const adapt = adaptMdGrammarCorrectionToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const segs = ai.underlinedSegments as Array<Record<string, unknown>>;
  check("어댑터: underlinedSegments 2개", segs.length === 2);
  check("어댑터: 라벨 축 (A) 대문자 유지", segs[0].label === "(A)" && segs[1].label === "(B)");
  check(
    "어댑터: 전 구간 isError=true (후처리 하드 계약)",
    segs.every((s) => s.isError === true),
  );
  check(
    "어댑터: sourceText 는 지문 축자",
    segs.every((s) => PASSAGE.includes(String(s.sourceText))),
  );
  check(
    "어댑터: displayedText 는 sourceText 와 다름(변형본)",
    segs.every((s) => s.displayedText !== s.sourceText),
  );
  check(
    "어댑터: surroundingText 채움 + 지문 포함",
    segs.every(
      (s) => typeof s.surroundingText === "string" && PASSAGE.includes(String(s.surroundingText)),
    ),
  );
  check(
    "어댑터: 허용답은 있는 구간에만 실린다",
    Array.isArray(segs[0].acceptedAnswers) && !("acceptedAnswers" in segs[1]),
  );
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 발문이 2구간 라벨을 열거",
    String(ai.direction).includes("(A), (B)") && String(ai.direction).includes("고쳐"),
    String(ai.direction),
  );
  check(
    "어댑터: 후처리 소관 필드를 만들지 않는다",
    !("passageWithUnderline" in ai) &&
      !("correctAnswer" in ai) &&
      !("errorParts" in ai) &&
      !("correctedParts" in ai),
  );
  check(
    "어댑터: 이물 필드 없음(빈칸·어법·선지 계열)",
    !("blanks" in ai) &&
      !("passageWithBlank" in ai) &&
      !("markedExpressions" in ai) &&
      !("options" in ai) &&
      !("wrongOptionExplanations" in ai),
  );

  const pp = postProcessQuestion("GRAMMAR_CORRECTION", PASSAGE, ai as never);
  check("후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const underlined = String(data.passageWithUnderline ?? "");
  check(
    "후처리: passageWithUnderline 에 밑줄 2곳 생성",
    (underlined.match(/__[^_]+__/g) ?? []).length === 2,
    underlined.slice(0, 90),
  );
  check(
    "후처리: 밑줄 안이 변형본(학생 표면)",
    underlined.includes("reduces") && underlined.includes("were installed"),
  );
  check(
    "후처리: correctAnswer = '(A) reduce, (B) was'",
    data.correctAnswer === "(A) reduce, (B) was",
    String(data.correctAnswer),
  );
  check(
    "후처리: errorParts·correctedParts 평탄화",
    JSON.stringify(data.errorParts) === JSON.stringify(["reduces", "were"]) &&
      JSON.stringify(data.correctedParts) === JSON.stringify(["reduce", "was"]),
    JSON.stringify(data.errorParts),
  );
  check(
    "후처리: acceptedAnswers 보존(T8a 채점 동치 집합)",
    JSON.stringify(
      (data.underlinedSegments as Array<Record<string, unknown>>)[0].acceptedAnswers,
    ) === JSON.stringify(["reduce", "do reduce"]),
  );
  check(
    "후처리: 발문 유지(정규화 통과)",
    String(data.direction).includes("(A), (B)"),
    String(data.direction),
  );

  const issues = validateQuestionQuality({
    typeId: "GRAMMAR_CORRECTION",
    question: data,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    grammarCorrectionErrorCount: 2,
  });
  const errors = issues.filter(
    (i) => i.severity === "error" && i.code.startsWith("grammar-correction"),
  );
  check("검증기: grammar-correction 계열 error 0", errors.length === 0, JSON.stringify(errors));
}

// 밑줄 1개 경로도 왕복한다(기본 설정 = 1).
{
  const q = autoSnapCorrectionSegments(parseMdGrammarCorrection(SINGLE)).question;
  const adapt = adaptMdGrammarCorrectionToAiQuestion(q, PASSAGE, "INTERMEDIATE");
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check(
    "어댑터(1구간): 기본 발문 사용",
    ai.direction === "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
    String(ai.direction),
  );
  const pp = postProcessQuestion("GRAMMAR_CORRECTION", PASSAGE, ai as never);
  check("후처리(1구간): 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check("후처리(1구간): correctAnswer '(A) reduce'", data.correctAnswer === "(A) reduce", String(data.correctAnswer));
  const errors = validateQuestionQuality({
    typeId: "GRAMMAR_CORRECTION",
    question: data,
    passage: PASSAGE,
    requestedDifficulty: "INTERMEDIATE",
    grammarCorrectionErrorCount: 1,
  }).filter((i) => i.severity === "error" && i.code.startsWith("grammar-correction"));
  check("검증기(1구간): grammar-correction 계열 error 0", errors.length === 0, JSON.stringify(errors));
}

// 어댑터 방어 — 복원 불가 입력은 저장 형상으로 나가지 않는다.
{
  const broken = autoSnapCorrectionSegments(
    parseMdGrammarCorrection(GOOD.replace("고침(A): reduces → reduce", "고침(A): lowers → reduce")),
  ).question;
  const adapt = adaptMdGrammarCorrectionToAiQuestion(broken, PASSAGE, "KILLER");
  check("어댑터: 복원 불가 구간이면 실패 반환", adapt.ok === false, adapt.error);
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금 축 · 적격성 · 설정 집행 · 난이도 3분기
// ───────────────────────────────────────────────────────────────────────────
function ctxOf(overrides?: Partial<MdLaneContext>): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { grammarCorrectionErrorCount: 2 },
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...overrides,
  } as MdLaneContext;
}

check("레인: subType GRAMMAR_CORRECTION", GRAMMAR_CORRECTION_MD_LANE.subType === "GRAMMAR_CORRECTION");
check(
  "레인: 과금 QUESTION_GEN_SINGLE — fast VOCAB_TYPES 미포함 유형",
  GRAMMAR_CORRECTION_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE === CREDIT_COSTS.QUESTION_GEN_SINGLE,
  String(GRAMMAR_CORRECTION_MD_LANE.operationType),
);
check("레인: retryEligible", GRAMMAR_CORRECTION_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 1~5 · 범위 밖 거부",
  GRAMMAR_CORRECTION_MD_LANE.isEligible({ grammarCorrectionErrorCount: 1 }) &&
    GRAMMAR_CORRECTION_MD_LANE.isEligible({ grammarCorrectionErrorCount: 5 }) &&
    GRAMMAR_CORRECTION_MD_LANE.isEligible({}) &&
    !GRAMMAR_CORRECTION_MD_LANE.isEligible({ grammarCorrectionErrorCount: 0 }) &&
    !GRAMMAR_CORRECTION_MD_LANE.isEligible({ grammarCorrectionErrorCount: 6 }),
);
check(
  "레인: qualityArgs 에 설정 실값 전달",
  JSON.stringify(GRAMMAR_CORRECTION_MD_LANE.qualityArgs(ctxOf())) ===
    JSON.stringify({ grammarCorrectionErrorCount: 2, stemLanguage: "ko" }),
  JSON.stringify(GRAMMAR_CORRECTION_MD_LANE.qualityArgs(ctxOf())),
);
check(
  "레인: mdFormat 포렌식 메타",
  JSON.stringify(GRAMMAR_CORRECTION_MD_LANE.mdFormat(ctxOf())) ===
    JSON.stringify({ errorCount: 2, pointFocus: false }),
);
check(
  "레인: diversityTargets = underlinedSegments[].sourceText",
  GRAMMAR_CORRECTION_MD_LANE.diversityTargets({
    underlinedSegments: [{ sourceText: S1 }, { sourceText: S3 }],
  }).length === 2,
);
check(
  "레인: pointFocus 꺼짐이면 extras 없음",
  GRAMMAR_CORRECTION_MD_LANE.buildExtras(ctxOf()).length === 0,
);
check(
  "레인: pointFocus 켜짐이면 집중 블록 주입",
  GRAMMAR_CORRECTION_MD_LANE.buildExtras(
    ctxOf({ resolved: { grammarCorrectionErrorCount: 2, grammarPointFocus: true } }),
  ).join("\n").includes("출제 포인트 집중"),
);
check(
  "레인: parseAndGate 정상 입력 클린",
  GRAMMAR_CORRECTION_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0,
  GRAMMAR_CORRECTION_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "),
);
check(
  "레인: 설정 개수(3)와 실제(2)가 다르면 반려",
  GRAMMAR_CORRECTION_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ resolved: { grammarCorrectionErrorCount: 3 } }),
  ).gateIssues.some((i) => i.includes("3개 필요")),
);
check(
  "레인: 교사 지정 표현이 밑줄 구간에 있으면 통과",
  GRAMMAR_CORRECTION_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: "whose canopies overlap" }] as MdLaneContext["teacherPoints"] }),
  ).gateIssues.length === 0,
);
check(
  "레인: 교사 지정 표현이 밑줄 밖이면 반려",
  GRAMMAR_CORRECTION_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: "air conditioning" }] as MdLaneContext["teacherPoints"] }),
  ).gateIssues.some((i) => i.includes("교사 지정 표현")),
);
check(
  "레인: adapt 위임 성공",
  GRAMMAR_CORRECTION_MD_LANE.adapt(
    GRAMMAR_CORRECTION_MD_LANE.parseAndGate(GOOD, ctxOf()),
    ctxOf(),
  ).ok === true,
);

// 프롬프트 — 난이도 3분기 · 개수 스캐폴드 · 형식 계약
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdGrammarCorrectionPrompt(PASSAGE, "full", d, { errorCount: 3 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 3구간 스캐폴드 + 지문 포함`,
    p.includes("밑줄 구간 설계") &&
      p.includes("고침(C): ...") &&
      p.includes("## 지문") &&
      p.includes(S1),
  );
}
check(
  "프롬프트: BASIC 은 few-shot 생략 · KILLER 는 포함",
  !buildMdGrammarCorrectionPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdGrammarCorrectionPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
);
check(
  "프롬프트: 정답 줄·오답 섹션을 요구하지 않는다(철칙 1 — 중복 계약 제거)",
  buildMdGrammarCorrectionPrompt(PASSAGE, "full", "KILLER").includes("`정답:` 줄을 쓰지 마라") &&
    !buildMdGrammarCorrectionPrompt(PASSAGE, "full", "KILLER").includes("\n오답:"),
);
check(
  "프롬프트: 포인트 코드 칸을 요구하지 않는다(죽은 칸 제거)",
  !buildMdGrammarCorrectionPrompt(PASSAGE, "full", "KILLER").includes("포인트코드"),
);
check(
  "프롬프트: errorCount 클램프(0→1, 99→5)",
  buildMdGrammarCorrectionPrompt(PASSAGE, "full", "KILLER", { errorCount: 0 }).includes(
    "밑줄 1곳만 [[A:구간]]",
  ) &&
    buildMdGrammarCorrectionPrompt(PASSAGE, "full", "KILLER", { errorCount: 99 }).includes(
      "고침(E): ...",
    ),
);
check(
  "프롬프트: answer-only 모드는 해설 1문장",
  buildMdGrammarCorrectionPrompt(PASSAGE, "answer-only", "KILLER").includes("딱 1문장"),
);

// ───────────────────────────────────────────────────────────────────────────
// 8. 적대검수 1기 지적 회귀 픽스처 (critical 1 · major 3 + 키워드 줄 무관용 계통)
//    전부 "수정 전 실제로 재현되던" 형태다. 하나라도 깨지면 그 사고가 되살아난 것.
// ───────────────────────────────────────────────────────────────────────────

// F1(critical) — 교사 지정 포인트가 밑줄 안에 실재하는데 뒤에 구두점이 붙어 있어
// 100% 반려되던 자리. 포인트 픽커 기본 unit="word" 는 구두점을 gap 으로 빼므로
// 지정값에 구두점이 없고, 그 구두점은 지문에 있는 것이라 재생성으로 회복 불가였다.
for (const pt of ["them", "midsummer", "street"]) {
  const issues = GRAMMAR_CORRECTION_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: pt }] as MdLaneContext["teacherPoints"] }),
  ).gateIssues;
  check(`F1 교사 지정: 구두점 앞 단어 '${pt}' 도 밑줄 구간으로 인정`, issues.length === 0, issues.join(" / "));
}
check(
  "F1 교사 지정: 지정 구간이 밑줄보다 넓어도 인정(양방향 포함)",
  GRAMMAR_CORRECTION_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: `${S1} ${S2}` }] as MdLaneContext["teacherPoints"] }),
  ).gateIssues.length === 0,
);
check(
  "F1 무회귀: 지정 표현이 정말 밑줄 밖이면 여전히 반려",
  GRAMMAR_CORRECTION_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: "sidewalk" }] as MdLaneContext["teacherPoints"] }),
  ).gateIssues.some((i) => i.includes("교사 지정 표현")),
);

// F2(major) — 굵게 헤더의 닫는 `**` 가 콜론 뒤로 밀려 값 안으로 새던 형태.
// 고침 줄은 "틀린 표현 '** reduces' 이 밑줄 구간 안에 없음" 이라는 거짓 지적을 받고,
// 허용답 줄은 게이트를 통과해 `** reduce` 라는 쓰레기가 채점 집합에 저장됐다.
const BOLD_HEAD_DRIFTS: [string, string, string][] = [
  ["굵게 라벨 — 콜론이 굵게 안쪽", "고침(A): reduces → reduce", "**고침(A):** reduces → reduce"],
  ["굵게 라벨 — 불릿 + 라벨 앞 공백", "고침(A): reduces → reduce", "- **고침 (A):** reduces → reduce"],
  ["줄 전체 굵게", "고침(A): reduces → reduce", "**고침(A): reduces → reduce**"],
  ["값 안 강조는 보존", "고침(A): reduces → reduce", "고침(A): **reduces** → **reduce**"],
];
for (const [name, from, to] of BOLD_HEAD_DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdGrammarCorrection(drifted);
  const issues = gateOf(drifted);
  check(
    `F2 굵게 헤더 오염 방지: ${name}`,
    q.segments.length === 2 &&
      q.segments[0].errorPart === "reduces" &&
      q.segments[0].correctedPart === "reduce" &&
      issues.length === 0,
    `(A)='${q.segments[0]?.errorPart}→${q.segments[0]?.correctedPart}' · ${issues.join(" / ")}`,
  );
}
{
  const bold = GOOD.replace("허용답(A): reduce | do reduce", "**허용답(A):** reduce | do reduce");
  const q = autoSnapCorrectionSegments(parseMdGrammarCorrection(bold)).question;
  check(
    "F2 허용답 굵게 헤더: 채점 집합에 쓰레기 값이 들어가지 않는다",
    q.segments[0].acceptedAnswers.join("|") === "reduce|do reduce" && gateOf(bold).length === 0,
    q.segments[0].acceptedAnswers.join("|"),
  );
  const pp = postProcessQuestion(
    "GRAMMAR_CORRECTION",
    PASSAGE,
    (adaptMdGrammarCorrectionToAiQuestion(q, PASSAGE, "KILLER").aiQuestion ?? {}) as never,
  );
  check(
    "F2 허용답 굵게 헤더: 후처리까지 정상 값만 실린다",
    JSON.stringify(
      ((pp.data ?? {}) as Record<string, unknown>).underlinedSegments as unknown,
    ).includes('["reduce","do reduce"]'),
  );
}

// F3(major) — 마커 표기가 흔들리면 밑줄이 통째로 사라지고 게이트에는 "밑줄 마커
// 0개" 라는 개수 오류로만 보였다(고침 줄 라벨은 소문자를 관용하면서 마커만 막아
// 둔 비대칭). 그 문자열이 그대로 재생성 피드백이 되어 모델은 '마커를 안 붙였다'는
// 거짓 지적을 받았다.
const MARK_DRIFTS: [string, string, string][] = [
  ["라벨 소문자", "[[a:", "[[b:"],
  ["라벨 앞 공백", "[[ A:", "[[ B:"],
  ["라벨 뒤 공백", "[[A :", "[[B :"],
  ["괄호 라벨", "[[(A):", "[[(B):"],
  ["전각 콜론", "[[A：", "[[B："],
];
for (const [name, headA, headB] of MARK_DRIFTS) {
  const drifted = GOOD.replace("[[A:", headA).replace("[[B:", headB);
  const q = parseMdGrammarCorrection(drifted);
  const issues = gateOf(drifted);
  check(
    `F3 마커 표기 관용: ${name}`,
    q.segments.length === 2 &&
      q.segments.map((s) => s.label).join("") === "(A)(B)" &&
      issues.length === 0 &&
      GRAMMAR_CORRECTION_MD_LANE.adapt(
        GRAMMAR_CORRECTION_MD_LANE.parseAndGate(drifted, ctxOf()),
        ctxOf(),
      ).ok === true,
    `구간 ${q.segments.length}개 · ${issues.join(" / ")}`,
  );
}
{
  const broken = GOOD.replace("[[A:", "[[A|").replace("[[B:", "[[B|");
  const issues = gateOf(broken);
  check(
    "F3 마커가 정말 계약 밖이면 자리를 지목한다(개수만 말하지 않는다)",
    issues.some((i) => i.includes("마커 표기가 [[A:구간]] 형식이 아님")),
    issues.join(" / "),
  );
}

// F4(major) — 복원 실패 자리에 변형본을 되꽂아 대조하니 재구성이 **반드시** 어긋나,
// 지문을 한 글자도 안 건드린 출력에도 "마커 밖 텍스트가 원문과 다르다" 는 거짓
// 지적이 항상 함께 실렸다. 그 문구가 재생성 프롬프트에 들어가 모델이 멀쩡한 지문을
// 손대게 만들었고, 라우트는 반려 수만 줄면 그 재생성을 채택했다.
for (const [name, drifted] of [
  ["고침 줄 누락", GOOD.replace("고침(B): were → was\n", "")],
  ["틀린 표현이 밑줄 밖", GOOD.replace("고침(A): reduces → reduce", "고침(A): lowers → reduce")],
  ["틀린 표현 2회 등장", GOOD.replace("고침(B): were → was", "고침(B): a → the")],
] as [string, string][]) {
  const issues = gateOf(drifted);
  check(
    `F4 복원 실패(${name})에 거짓 '지문 재구성 불일치' 를 얹지 않는다`,
    issues.length > 0 && !issues.some((i) => i.includes("지문 재구성 불일치")),
    issues.join(" / "),
  );
}
check(
  "F4 무회귀: 복원 실패 중에도 마커 밖 실제 편집은 여전히 잡는다",
  gateOf(
    GOOD.replace("고침(B): were → was\n", "").replace("Residents reported", "Residents later reported"),
  ).some((i) => i.includes("지문 재구성 불일치")),
  gateOf(
    GOOD.replace("고침(B): were → was\n", "").replace("Residents reported", "Residents later reported"),
  ).join(" / "),
);

// 지배적 결함 계통 — 키워드 줄 무관용. 데이터 줄만 관대하게 파싱하고 키워드 줄을
// 무관용 정규식으로 두면, 굵게·전각 콜론·인용 접두 하나에 그 필드가 통째로 사라지고
// 게이트가 "밑줄지문 누락"·"해설 누락" 이라는 **사실과 다른 원인**을 지목한다.
const KEYWORD_DRIFTS: [string, string, string][] = [
  ["밑줄지문 굵게(콜론 안쪽)", "밑줄지문:", "**밑줄지문:**"],
  ["밑줄지문 굵게(콜론 밖)", "밑줄지문:", "**밑줄지문**:"],
  ["밑줄지문 전각 콜론", "밑줄지문:", "밑줄지문："],
  ["밑줄지문 들여쓰기", "밑줄지문:", "  밑줄지문:"],
  ["해설 굵게", "해설:", "**해설:**"],
  ["해설 전각 콜론", "해설:", "해설："],
  ["해설 인용 접두", "해설:", "> 해설:"],
  ["고침 인용 접두", "고침(A):", "> 고침(A):"],
  ["허용답 전각 콜론", "허용답(A):", "허용답(A)："],
];
for (const [name, from, to] of KEYWORD_DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdGrammarCorrection(drifted);
  const issues = gateOf(drifted);
  check(
    `키워드 줄 유실 방지: ${name}`,
    q.markedPassage.length > 0 &&
      q.explanation.length > 20 &&
      q.segments.length === 2 &&
      issues.length === 0,
    `지문 ${q.markedPassage.length}자 · 해설 ${q.explanation.length}자 · ${issues.join(" / ")}`,
  );
}

// `고침:` 섹션 헤더 + 불릿 라벨 항목 — 실측 드리프트. 이 형태를 못 읽으면 고침 줄이
// 전량 사라져 게이트에 "(A) 고침 줄 없음" 만 보이고 진짜 원인(표기 형태)이 은폐된다.
{
  const SECTION = `밑줄지문:
${MARKED}

고침:
- (A) reduces → reduce
- (B) were → was

허용답:
- (A) reduce | do reduce
해설: (A)의 진짜 주어는 Trees 이므로 복수 동사 reduce 가 와야 합니다. (B)의 주어는 A row 이므로 단수 동사 was 를 써야 합니다.`;
  const q = autoSnapCorrectionSegments(parseMdGrammarCorrection(SECTION)).question;
  const issues = gateOf(SECTION);
  check(
    "섹션 헤더형 고침·허용답(`고침:` + 불릿 라벨 항목) 흡수",
    q.segments.length === 2 &&
      q.segments[0].errorPart === "reduces" &&
      q.segments[1].correctedPart === "was" &&
      q.segments[0].acceptedAnswers.join("|") === "reduce|do reduce" &&
      issues.length === 0,
    `${JSON.stringify(q.segments.map((s) => [s.errorPart, s.correctedPart]))} · ${issues.join(" / ")}`,
  );
}
check(
  "과잉 관용 방지: 섹션 헤더가 없으면 라벨 산문을 고침 줄로 읽지 않는다",
  parseMdGrammarCorrection(`${GOOD}\n(A) 이 자리는 수일치 포인트 - 주어를 확인하라`).fixLabels
    .length === 2,
);

// ───────────────────────────────────────────────────────────────────────────
// 9. 적대검수 2기 회귀 픽스처 — 별 파일로 분리(본 파일 길이 관리). 진입점은 하나다.
// ───────────────────────────────────────────────────────────────────────────
runWave2Fixtures({ PASSAGE, GOOD, MARKED, check });

// ───────────────────────────────────────────────────────────────────────────
// 10. 적대검수 3기(장식 단일화) 회귀 픽스처 — 공유 유틸 decoration.ts 승차 고정.
//     파서가 인식하는 **모든 키워드 줄** × 감독 픽스처와 같은 장식 매트릭스.
// ───────────────────────────────────────────────────────────────────────────
runDecorationFixtures({ PASSAGE, GOOD, MARKED, S1, check });

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
