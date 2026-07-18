// W2-D (26-07-18) irrelevantIndex===0/last 엣지 회귀: 후처리→검증 전 파이프라인.
// processIrrelevant 는 엣지에 놓인 삽입문을 가운데 슬롯으로 재배치하고 correctAnswer·
// options·wrongOptionExplanations 를 재정렬하지만, 재배치된 irrelevantIndex 를 반환
// 데이터에 되쓰지 않아 저장값이 옛(엣지) 값으로 남았다. 그 결과 검증기가 후처리 뒤
// 데이터에서 irrelevant-index-edge / -answer-index-mismatch / -answer-desync /
// -source-not-verbatim 을 한꺼번에 오발화했다(검증기가 문서화한 불변식 위반). 후처리가
// irrelevantIndex 를 되쓰도록 보정한 뒤, 엣지 입력이 이 오발화들과 count-mismatch 없이
// 통과하는지, 저장 irrelevantIndex 가 재배치 위치와 정합하는지 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import irrProc from "@/lib/question-postprocess/processors/irrelevant";
import quality from "@/lib/question-quality";
const { processIrrelevant } = irrProc;
const { validateQuestionQuality } = quality;

const P = [
  "A foraging honeybee returns to the crowded hive with urgent news about food.",
  "The returning bee performs an intricate looping dance upon the vertical comb.",
  "The precise angle of the dance encodes the direction toward the distant flowers.",
  "The duration of each waggle run encodes the distance to the food source.",
  "Nearby hive workers attentively read these dance vibrations through their legs.",
];
const passage = P.join(" ");
// 삽입문은 지문·source 와 어휘가 겹쳐(dance/workers/hive) too-unrelated 경고는 피하되
// 원문에 verbatim 으로는 없다.
const inserted = "The dance also helps young hive workers learn the daily rhythm of foraging.";

function evaluate(sentences, irrelevantIndex, correctAnswer) {
  const res = processIrrelevant(passage, { sentences, irrelevantIndex, correctAnswer, wrongOptionExplanations: {} });
  const d = res.data;
  const issues = validateQuestionQuality({
    typeId: "IRRELEVANT",
    requestedDifficulty: "INTERMEDIATE",
    passage,
    question: { direction: "다음 글에서 전체 흐름과 관계 없는 문장은?", difficulty: "INTERMEDIATE", ...d },
  });
  return {
    postIrrelevantIndex: d.irrelevantIndex,
    correctAnswer: d.correctAnswer,
    codes: issues.map((i) => i.code),
  };
}

// 엣지 0: 삽입문을 0번 슬롯에.
const edge0 = evaluate([inserted, P[1], P[2], P[3], P[4]], 0, "1");
// 엣지 last(4): 삽입문을 마지막 슬롯에.
const edgeLast = evaluate([P[0], P[1], P[2], P[3], inserted], 4, "5");
// 비-엣지(회귀): 삽입문을 1번 슬롯에 — 재배치 없음.
const nonEdge = evaluate([P[1], inserted, P[2], P[3], P[4]], 1, "2");

process.stdout.write(JSON.stringify({ edge0, edgeLast, nonEdge }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".w2d-irrelevant-index-edge-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`node node_modules/tsx/dist/cli.mjs "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();
const CASCADE_CODES = [
  "irrelevant-marking-count-mismatch", // 임무 명세의 count-mismatch (엣지에서 오발화하면 안 됨)
  "irrelevant-index-edge",
  "irrelevant-answer-index-mismatch",
  "irrelevant-answer-desync",
  "irrelevant-source-not-verbatim",
];

test("postprocess writes back the relocated irrelevantIndex (edge 0 -> 1, edge last -> n-2)", () => {
  assert.equal(result.edge0.postIrrelevantIndex, 1, JSON.stringify(result.edge0));
  assert.equal(result.edge0.correctAnswer, "②", JSON.stringify(result.edge0));
  assert.equal(result.edgeLast.postIrrelevantIndex, 3, JSON.stringify(result.edgeLast));
  assert.equal(result.edgeLast.correctAnswer, "④", JSON.stringify(result.edgeLast));
});

test("no count-mismatch or index/answer/source cascade misfires at the irrelevantIndex edges", () => {
  for (const [name, evald] of [
    ["edge0", result.edge0],
    ["edgeLast", result.edgeLast],
  ]) {
    for (const code of CASCADE_CODES) {
      assert.equal(
        evald.codes.includes(code),
        false,
        `${name} must not fire ${code}: ${JSON.stringify(evald.codes)}`,
      );
    }
  }
});

test("non-edge irrelevantIndex is unchanged (regression)", () => {
  assert.equal(result.nonEdge.postIrrelevantIndex, 1, JSON.stringify(result.nonEdge));
  assert.equal(result.nonEdge.correctAnswer, "②", JSON.stringify(result.nonEdge));
  for (const code of CASCADE_CODES) {
    assert.equal(
      result.nonEdge.codes.includes(code),
      false,
      `nonEdge must not fire ${code}: ${JSON.stringify(result.nonEdge.codes)}`,
    );
  }
});
