// 해설 서술 단계 번호 오용 게이트 (26-07-07 유저 검수 3회+ 재발, 실측 5/60).
//   문제: 해설 본문이 "① 빈칸 문장은… ② 근거는…" 식으로 원형숫자를 설명 단계
//   번호로 사용 → 선지 번호와 뒤섞여 정답 오독. 원인: 프롬프트의 4단 구조 지시가
//   단계를 ①②③④로 라벨링(같이 수정됨).
//   게이트: 문장 첫머리 원형숫자가 해당 선지 텍스트를 인용하지 않으면 단계 번호로
//   판정, 2회 이상이면 blank-explanation-step-numbering. 정당한 선지 분석
//   ("③ 'option text'는 … 오답")과 중간 열거("①, ②의 'they'…")는 통과.
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
const { validateQuestionQuality } = questionQuality;

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
    .filter((code) => code === "blank-explanation-step-numbering");
}

// 1) 실물 재현(유저 스크린샷 축약) — 단계 번호 ②④① + 정당한 선지 분석 ③
const stepNumbered = codesOf(
  "② 빈칸 문장은 내적 서사의 영향력이 어디까지 확장되는지를 밝히는 논지 심화 문장이다. ④ 앞서 'if you have had some bad experiences'로 경험이 서사로 굳어지는 과정을 보였다. ① 이 두 문장을 종합하면 서사가 정체성 자체를 규정한다는 결론이 도출된다. ③ 'settle only as fixed opinions'는 이미 언급된 신념 형성 단계로 축소한 과협소 오답이다.",
);

// 2) 정당한 선지 분석만 있는 해설 — 미발화해야 함
const legitOptionRefs = codesOf(
  "빈칸 문장은 글 전체의 결론부다. 앞선 근거 문장들이 서사와 정체성의 연결로 수렴하므로 정답이 도출된다. ③ 'settle only as fixed opinions'는 신념 형성 단계로 축소한 과협소 오답이다. ⑤ 'determine every judgment we make'는 특정 층위를 모든 판단으로 확대한 과확장 오답이다.",
);

// 3) 중간 열거(REFERENCE류 습관) — 문장 첫머리 아님, 미발화해야 함
const midPhraseEnum = codesOf(
  "이 글에서 ①, ②, ⑤의 표현은 모두 신념 형성 수준에 머무는 반면, 정답은 정체성 규정까지 나아간다. 따라서 논지의 심화 방향을 읽어야 한다.",
);

// 4) 원형숫자 없는 정상 해설 — 미발화
const clean = codesOf(
  "빈칸 문장은 결론부다. 먼저 경험이 서사로 굳어지는 과정이 제시되고, 이어서 서사가 정체성과 연결되므로, 따라서 정답이 도출된다.",
);

// 5) 단계 번호 1회만(경계) — 2회 미만이라 미발화
const singleMarker = codesOf(
  "① 빈칸 문장은 결론부다. 근거 문장들이 수렴하므로 정답이 도출되며, 오답들은 과협소 또는 과확장이다.",
);

console.log(JSON.stringify({ stepNumbered, legitOptionRefs, midPhraseEnum, clean, singleMarker }));
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
  assert.equal(result.stepNumbered.length, 1, JSON.stringify(result.stepNumbered));
});

test("정당한 선지 분석(자기 선지 텍스트 인용)은 통과", () => {
  assert.equal(result.legitOptionRefs.length, 0, JSON.stringify(result.legitOptionRefs));
});

test("문장 중간 열거(①, ②, ⑤의 …)는 통과", () => {
  assert.equal(result.midPhraseEnum.length, 0);
});

test("원형숫자 없는 정상 해설·단계 번호 1회는 통과 (경계)", () => {
  assert.equal(result.clean.length, 0);
  assert.equal(result.singleMarker.length, 0);
});
