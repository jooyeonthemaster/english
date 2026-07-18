// W2-D (26-07-18) 렌더 정합 보정 회귀: sentence-insert 마커 문장경계 화이트리스트.
// 실측(processSentenceInsert 렌더): 마커는 항상 종결부호(.!?) 직후에만 놓인다. 기존
// 화이트리스트 /[.!?”’"')\]]/ 는 닫는 인용/괄호가 종결부호 없이 단독으로 마커 앞에 와도
// 통과시켜, 렌더에 존재하지 않는 "문장 내부(래퍼 뒤) 마커"를 놓쳤다. 보정 후:
//  · 종결부호(.!?) → 경계 통과(회귀)
//  · 종결부호 + 닫는 래퍼(."/.)/.]) → 경계 통과(문장이 인용/괄호로 끝난 정상형)
//  · 닫는 래퍼 단독(종결부호 없음, 예 "(aside) ①") → 문장 내부 마커로 차단(신규)
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import siVal from "@/lib/question-quality/validators/sentence-insert";
const { findSentenceInsertMarkerContractIssues } = siVal;

const run = (pwm) => findSentenceInsertMarkerContractIssues(pwm).map((f) => f.code);

// 마커 ② 가 닫는 괄호 ")" 뒤(종결부호 없음) → 문장 내부 마커(신규 차단).
const bareCloserMidSentence = run(
  "The committee met early today. ① The final plan (a bold one) ② was approved by all. ③ Reforms began the next morning. ④ Success followed quickly. ⑤",
);

// 마커 ② 가 종결부호+닫는 따옴표(.\") 뒤 → 정상 문장 경계(통과).
const terminalBackedQuote = run(
  "The captain gave the order. ① He shouted, \"Stop now.\" ② The crew froze at once. ③ Silence filled the whole deck. ④ Then chaos finally erupted. ⑤",
);

// 마커 ② 가 종결부호+닫는 괄호(.)) 뒤 → 정상 문장 경계(통과).
const terminalBackedParen = run(
  "The report was finally released. ① The panel agreed on the plan (unanimously.) ② Funding arrived within a week. ③ Construction started right away. ④ The bridge opened on time. ⑤",
);

// 건강 대조: 전부 맨 종결부호(.!?) 뒤(회귀).
const healthyBare = run(
  "The storm approached the coast quickly. ① Waves crashed against the rocks. ② Could the keeper hold on? ③ The night grew darker still! ④ Dawn arrived over the water. ⑤",
);

process.stdout.write(JSON.stringify({
  bareCloserMidSentence, terminalBackedQuote, terminalBackedParen, healthyBare,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".w2d-si-marker-boundary-harness.mts");
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

test("bare closing wrapper (no terminal punctuation) before a marker is flagged mid-sentence", () => {
  assert.ok(
    result.bareCloserMidSentence.includes("sentence-insert-marker-mid-sentence"),
    JSON.stringify(result.bareCloserMidSentence),
  );
});

test("terminal punctuation followed by a closing quote/paren is a valid boundary (passes)", () => {
  assert.equal(
    result.terminalBackedQuote.includes("sentence-insert-marker-mid-sentence"),
    false,
    `quote: ${JSON.stringify(result.terminalBackedQuote)}`,
  );
  assert.equal(
    result.terminalBackedParen.includes("sentence-insert-marker-mid-sentence"),
    false,
    `paren: ${JSON.stringify(result.terminalBackedParen)}`,
  );
});

test("bare terminal punctuation markers still pass (regression)", () => {
  assert.equal(
    result.healthyBare.includes("sentence-insert-marker-mid-sentence"),
    false,
    JSON.stringify(result.healthyBare),
  );
  assert.equal(
    result.healthyBare.includes("sentence-insert-marker-empty-gap"),
    false,
    JSON.stringify(result.healthyBare),
  );
});
