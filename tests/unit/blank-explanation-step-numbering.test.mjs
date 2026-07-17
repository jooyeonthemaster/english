// 해설 서술 단계 번호 오용 게이트 (26-07-07 유저 검수 3회+ 재발, 실측 5/60).
//   문제: 해설 본문이 "① 빈칸 문장은… ② 근거는…" 식으로 원형숫자를 설명 단계
//   번호로 사용 → 선지 번호와 뒤섞여 정답 오독. 원인: 프롬프트의 4단 구조 지시가
//   단계를 ①②③④로 라벨링(같이 수정됨).
//   게이트: 선지 참조/판정 문맥을 먼저 제외하고, 문장 첫머리 원형숫자 중 빈칸·
//   근거·종합·순서 담화 단서가 붙은 것이 2회 이상이면 전용 fatal code. 정당한
//   축약 선지 판정("①은 범위를 과장해 오답")은 원문 인용이 없어도 통과한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import questionQuality from "../src/lib/question-quality/index.ts";
import questionSchemas from "../src/lib/question-ai-schemas-mc.ts";
const { validateQuestionQuality } = questionQuality;
const { aiBlankInferenceSchema } = questionSchemas;

const OPTIONS = [
  { label: "1", text: "reshape how we recall past events" },
  { label: "2", text: "gradually get replaced by objective facts" },
  { label: "3", text: "settle only as fixed opinions" },
  { label: "4", text: "come to define who we understand ourselves to be" },
  { label: "5", text: "determine every judgment we make" },
];

function buildQuestion(explanation) {
  return {
    direction: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    passageWithBlank: "Narratives matter. Over time the stories we tell ____________ in the end.",
    originalExpression: "come to define who we understand ourselves to be",
    surroundingText: "Over time the stories we tell come to define who we understand ourselves to be in the end.",
    blankAnswerMode: "PARAPHRASE",
    options: OPTIONS,
    correctAnswer: "4",
    explanation,
    keyPoints: ["근거 문장 종합", "과협소 오답 구분", "인과 방향"],
  };
}

function codesOf(explanation) {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question: buildQuestion(explanation),
    passage: undefined,
    requestedDifficulty: "KILLER",
  })
    .map((issue) => issue.code)
    .filter((code) =>
      [
        "blank-explanation-step-numbering",
        "blank-explanation-narrative-circled-numbering",
      ].includes(code),
    );
}

// 1) 실물 재현(유저 스크린샷 축약) — 단계 번호 ②④① + 정당한 선지 분석 ③
const stepNumbered = codesOf(
  "② 빈칸 문장은 내적 서사의 영향력이 어디까지 확장되는지를 밝히는 논지 심화 문장이다. ④ 앞서 'if you have had some bad experiences'로 경험이 서사로 굳어지는 과정을 보였다. ① 이 두 문장을 종합하면 서사가 정체성 자체를 규정한다는 결론이 도출된다. ③ 'settle only as fixed opinions'는 이미 언급된 신념 형성 단계로 축소한 과협소 오답이다.",
);

// 2) 정당한 선지 분석만 있는 해설 — 미발화해야 함
const legitOptionRefs = codesOf(
  "빈칸 문장은 글 전체의 결론부다. 앞선 근거 문장들이 서사와 정체성의 연결로 수렴하므로 정답이 도출된다. ③ 'settle only as fixed opinions'는 신념 형성 단계로 축소한 과협소 오답이다. ⑤ 'determine every judgment we make'는 특정 층위를 모든 판단으로 확대한 과확장 오답이다.",
);

// 3) 선지 원문을 인용하지 않은 정상 축약 판정 — 과거 false positive, 미발화해야 함
const terseOptionVerdicts = codesOf(
  "①은 범위를 과장해 오답이다. ②는 인과를 뒤집어 오답이다. ④는 지문의 결론과 정확히 일치하므로 정답이다.",
);

// 4) 순서 담화 단서를 직접 붙인 또 다른 양성 경계
const explicitDiscourseSteps = codesOf(
  "①: 먼저 빈칸 앞의 대조 관계를 확인한다. ②. 이어서 핵심 근거가 어느 결론으로 수렴하는지 살핀다. ③ 마지막으로 두 문장을 종합해 정답을 결정한다.",
);

// 5) 서술 단계 1회 + 정상 선지 판정 1회 — 서술 단서가 2회 미만이라 미발화
const mixedSingleNarrative = codesOf(
  "① 먼저 빈칸 앞의 대조 관계를 확인한다. ②는 인과 방향을 뒤집어 오답이다.",
);

// 6) 중간 열거(REFERENCE류 습관) — 문장 첫머리 아님, 미발화해야 함
const midPhraseEnum = codesOf(
  "이 글에서 ①, ②, ⑤의 표현은 모두 신념 형성 수준에 머무는 반면, 정답은 정체성 규정까지 나아간다. 따라서 논지의 심화 방향을 읽어야 한다.",
);

// 7) 원형숫자 없는 정상 해설 — 미발화
const clean = codesOf(
  "빈칸 문장은 결론부다. 먼저 경험이 서사로 굳어지는 과정이 제시되고, 이어서 서사가 정체성과 연결되므로, 따라서 정답이 도출된다.",
);

// 8) 단계 번호 1회만(경계) — 2회 미만이라 미발화
const singleMarker = codesOf(
  "① 빈칸 문장은 결론부다. 근거 문장들이 수렴하므로 정답이 도출되며, 오답들은 과협소 또는 과확장이다.",
);

// 9) 원형숫자 뒤에 담화 부사가 오더라도 직접 정오 판정이면 선지 분석이다.
const sequencedOptionVerdicts = codesOf(
  "① 먼저 제시된 해결책만 충분하다고 보므로 오답이다. ② 다음으로 기술의 효과를 즉각적이라고 가정하므로 오답이다. ③ 마지막으로 지문의 결론과 일치하므로 정답이다.",
);

// 10) 구두점 없이 이어진 압축 단계 번호도 서술 단계 오용이다.
const compactNarrativeSteps = codesOf(
  "① 빈칸 대조 확인 ② 근거 방향 확인 ③ 이를 종합",
);

// 11) 완곡한 직접 정오 판정도 선지 분석이다.
const modalOptionVerdicts = codesOf(
  "① 먼저 범위를 과장하므로 오답으로 볼 수 있다. ② 다음으로 인과를 뒤집으므로 오답이라고 할 수 있다. ③ 마지막으로 결론과 일치해 정답이라고 볼 수 있다.",
);

// 12) 판정 술어의 표면 변이도 실제 선지 판정이면 정상이다.
const expandedOptionVerdicts = [
  "① 먼저 범위를 과장하므로 오답으로 보아야 한다. ② 다음으로 인과를 뒤집으므로 오답으로 보아야 한다. ③ 마지막으로 결론과 일치해 정답으로 보아야 한다.",
  "① 먼저 범위를 과장하므로 오답이라고 판단할 수 있다. ② 다음으로 인과를 뒤집으므로 오답이라고 판단할 수 있다. ③ 마지막으로 결론과 일치해 정답이라고 판단할 수 있다.",
  "① 먼저 범위를 과장하므로 오답으로 간주된다. ② 다음으로 인과를 뒤집으므로 오답으로 간주된다. ③ 마지막으로 결론과 일치해 정답으로 간주된다.",
].map(codesOf);

// 13) '소거할 수 있는 기준'은 선지 판정이 아니라 풀이 단계 서술이다.
const eliminationMethodNarrative = codesOf(
  "① 먼저 오답을 소거할 수 있는 기준을 세운다. ② 다음으로 소거할 수 있는 표현을 찾는다. ③ 마지막으로 근거를 종합한다.",
);

const v3OptionVerdicts = [
  "① 먼저 범위를 과장하므로 오답이라 판단된다. ② 다음으로 인과를 뒤집으므로 오답이라 판단된다. ③ 마지막으로 결론과 일치해 정답이라 판단된다.",
  "① 먼저 범위를 과장하므로 오답이라고 봐야 한다. ② 다음으로 인과를 뒤집으므로 오답이라고 봐야 한다. ③ 마지막으로 결론과 일치해 정답이라고 봐야 한다.",
  "① 먼저 범위를 과장하므로 오답으로 인정된다. ② 다음으로 인과를 뒤집으므로 오답으로 인정된다. ③ 마지막으로 결론과 일치해 정답으로 인정된다.",
  "① 먼저 범위를 과장하므로 오답으로 인정할 수 있다. ② 다음으로 인과를 뒤집으므로 오답으로 인정할 수 있다. ③ 마지막으로 결론과 일치해 정답으로 인정할 수 있다.",
  "① 먼저 범위를 과장하므로 오답으로 분류해야 한다. ② 다음으로 인과를 뒤집으므로 오답으로 분류해야 한다. ③ 마지막으로 결론과 일치해 정답으로 분류해야 한다.",
  "① 먼저 범위를 과장하므로 오답에 해당한다고 판단한다. ② 다음으로 인과를 뒤집으므로 오답에 해당한다고 판단한다. ③ 마지막으로 결론과 일치해 정답에 해당한다고 판단한다.",
  "① 선택지는 범위를 과장한다. ② 선택지는 인과를 뒤집는다. ③ 선택지는 결론과 일치한다.",
  "①은 먼저 범위를 과장한다. ②는 다음으로 인과를 뒤집는다. ③은 마지막으로 결론과 일치한다.",
].map(codesOf);

const v4TerminalOptionVerdicts = [
  "오답이라고 본다",
  "오답으로 보인다",
  "오답임이 분명하다",
  "오답으로 확정된다",
  "오답이라고 결론짓는다",
  "오답임이 확실하다",
  "부적절하다고 판단한다",
  "오답으로 귀결된다",
  "오답이라고 판정한다",
].map((verdict) => codesOf(
  "① 먼저 이 선지는 범위를 지나치게 넓힌 선택지이므로 " + verdict + ". " +
  "② 다음으로 이 선지는 인과 방향을 뒤집은 선택지이므로 " + verdict + ". " +
  "③ 마지막으로 이 선지는 지문의 결론과 정확히 일치하므로 정답이라고 판단한다.",
));

const v3NarrativeMetaSteps = [
  "① 먼저 정답으로 판단할 수 있는 기준을 세운다. ② 다음으로 오답으로 판단할 수 있는 기준을 세운다. ③ 마지막으로 기준을 종합한다.",
  "① 먼저 오답으로 처리할 항목의 기준을 세운다. ② 다음으로 정답으로 처리할 항목의 기준을 세운다. ③ 마지막으로 이를 종합한다.",
  "① 먼저 오답으로 분류할 기준을 정한다. ② 다음으로 정답으로 분류할 기준을 정한다. ③ 마지막으로 이를 적용한다.",
  "① 먼저 정답에 해당하는 조건을 정리한다. ② 다음으로 오답에 해당하는 조건을 정리한다. ③ 마지막으로 조건을 대조한다.",
  "① 먼저 소거된다면 확인할 순서를 정한다. ② 다음으로 소거된다면 남는 근거를 찾는다. ③ 마지막으로 이를 종합한다.",
  "① 먼저 정답으로 인정할 수 있는 규칙을 만든다. ② 다음으로 오답으로 인정할 수 있는 규칙을 만든다. ③ 마지막으로 규칙을 검증한다.",
  "① 먼저 빈칸의 논리 방향을 확인한다. ② 다음으로 핵심 근거를 정리한다. ③ 마지막으로 두 근거를 종합한다.",
  "① 먼저 적절하다고 볼 수 있는 조건을 세운다. ② 다음으로 부적절하다고 볼 수 있는 조건을 세운다. ③ 마지막으로 조건을 적용한다.",
].map(codesOf);

// v7 boundary: procedural clauses do not always carry 먼저/다음으로. The
// terminal solver action itself is enough when at least two circled clauses
// are not option references.
const naturalActionNarratives = [
  "① 도입부에서 연구 조건을 찾는다. ② 결과 문장의 역접을 해석한다. ③ 두 단서를 합치면 정답이 결정된다.",
  "① 반복되는 핵심어를 표시한다. ② 반대 방향의 표현을 제거한다. ③ 남은 의미를 빈칸에 대입한다.",
  "① 시간 순서를 정리한다. ② 이전 상태와 이후 상태를 대비한다. ③ 변화의 방향을 나타낸 답을 넣는다.",
].map(codesOf);

const actionWordOptionControls = [
  "①은 핵심 조건을 제거해 오답이다. ②는 두 사례를 잘못 연결해 오답이다. ③은 논지를 정확히 반영해 정답이다.",
  "정답은 ④이다. 선택지 ①과 ②는 방향을 뒤집고, ③과 ⑤는 범위를 과장한다.",
].map(codesOf);

console.log(JSON.stringify({
  stepNumbered,
  legitOptionRefs,
  terseOptionVerdicts,
  explicitDiscourseSteps,
  mixedSingleNarrative,
  midPhraseEnum,
  clean,
  singleMarker,
  sequencedOptionVerdicts,
  compactNarrativeSteps,
  modalOptionVerdicts,
  expandedOptionVerdicts,
  eliminationMethodNarrative,
  v3OptionVerdicts,
  v4TerminalOptionVerdicts,
  v3NarrativeMetaSteps,
  naturalActionNarratives,
  actionWordOptionControls,
  explanationDescription: aiBlankInferenceSchema.shape.explanation.description,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".blank-step-numbering-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const result = runHarness();

test("실물 재현: 서술 단계 번호(②④①) 해설이 반려된다", () => {
  assert.equal(
    result.stepNumbered.filter(
      (code) => code === "blank-explanation-narrative-circled-numbering",
    ).length,
    1,
    JSON.stringify(result.stepNumbered),
  );
});

test("명시적 순서 담화 단서 2회 이상도 전용 fatal code로 반려된다", () => {
  assert.equal(
    result.explicitDiscourseSteps.filter(
      (code) => code === "blank-explanation-narrative-circled-numbering",
    ).length,
    1,
    JSON.stringify(result.explicitDiscourseSteps),
  );
});

test("정당한 선지 분석(자기 선지 텍스트 인용)은 통과", () => {
  assert.equal(result.legitOptionRefs.length, 0, JSON.stringify(result.legitOptionRefs));
});

test("원문 인용 없는 축약 선지 판정(①은 … 오답)도 통과", () => {
  assert.equal(
    result.terseOptionVerdicts.length,
    0,
    JSON.stringify(result.terseOptionVerdicts),
  );
});

test("서술 단계 단서가 1회뿐인 혼합 해설은 과잉 차단하지 않는다", () => {
  assert.equal(
    result.mixedSingleNarrative.length,
    0,
    JSON.stringify(result.mixedSingleNarrative),
  );
});

test("문장 중간 열거(①, ②, ⑤의 …)는 통과", () => {
  assert.equal(result.midPhraseEnum.length, 0);
});

test("원형숫자 없는 정상 해설·단계 번호 1회는 통과 (경계)", () => {
  assert.equal(result.clean.length, 0);
  assert.equal(result.singleMarker.length, 0);
});

test("담화 부사가 붙은 직접 정오 판정은 정상 선지 분석으로 통과", () => {
  assert.equal(
    result.sequencedOptionVerdicts.length,
    0,
    JSON.stringify(result.sequencedOptionVerdicts),
  );
});

test("구두점 없는 압축 서술 단계도 fatal code로 반려", () => {
  assert.equal(
    result.compactNarrativeSteps.filter(
      (code) => code === "blank-explanation-narrative-circled-numbering",
    ).length,
    1,
    JSON.stringify(result.compactNarrativeSteps),
  );
});

test("볼 수 있다/할 수 있다 형태의 직접 정오 판정도 정상 선지 분석으로 통과", () => {
  assert.equal(
    result.modalOptionVerdicts.length,
    0,
    JSON.stringify(result.modalOptionVerdicts),
  );
});

test("보아야 한다/판단할 수 있다/간주된다 판정도 선지 분석으로 통과", () => {
  for (const issues of result.expandedOptionVerdicts) {
    assert.equal(issues.length, 0, JSON.stringify(issues));
  }
});

test("일반적인 소거 방법을 설명하는 원형숫자는 선지 참조로 오인하지 않는다", () => {
  assert.equal(
    result.eliminationMethodNarrative.filter(
      (code) => code === "blank-explanation-narrative-circled-numbering",
    ).length,
    1,
    JSON.stringify(result.eliminationMethodNarrative),
  );
});

test("판정 술어의 다양한 종결형은 실제 선지 판정으로 분류한다", () => {
  for (const issues of result.v3OptionVerdicts) {
    assert.equal(issues.length, 0, JSON.stringify(issues));
  }
});

test("본다/보인다/확정된다/귀결된다 등 종결 판정도 선지 분석으로 분류한다", () => {
  for (const issues of result.v4TerminalOptionVerdicts) {
    assert.equal(issues.length, 0, JSON.stringify(issues));
  }
});

test("같은 판정 어휘라도 기준·조건·규칙을 세우는 메타 단계는 fatal이다", () => {
  for (const issues of result.v3NarrativeMetaSteps) {
    assert.equal(
      issues.includes("blank-explanation-narrative-circled-numbering"),
      true,
      JSON.stringify(issues),
    );
  }
});

test("담화 부사 없이 자연스러운 풀이 동작을 나열한 원형숫자 단계도 fatal이다", () => {
  for (const issues of result.naturalActionNarratives) {
    assert.equal(
      issues.includes("blank-explanation-narrative-circled-numbering"),
      true,
      JSON.stringify(issues),
    );
  }
});

test("같은 동작 어휘가 들어가도 실제 선지 참조·판정이면 통과한다", () => {
  for (const issues of result.actionWordOptionControls) {
    assert.equal(
      issues.includes("blank-explanation-narrative-circled-numbering"),
      false,
      JSON.stringify(issues),
    );
  }
});

test("생성 스키마도 원형숫자를 해설 단계 번호로 쓰지 않도록 명시한다", () => {
  assert.match(result.explanationDescription, /원형 숫자는 실제 선지를 인용할 때만/);
  assert.doesNotMatch(result.explanationDescription, /4단 구조\)?:\s*①/);
});
