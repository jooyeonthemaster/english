import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeBlankSeam,
  inferSubjectNumber,
  inferTerminalNumber,
  splitBlankSurface,
} from "../../../src/lib/question-quality/validators/blank/seam";

test("detects heterogeneous relative-clause number contracts", () => {
  const findings = analyzeBlankSeam({
    passageWithBlank: "Writing _____ that are part of conversation can be difficult.",
    correctAnswer: "1",
    options: [
      { label: "1", text: "lacks physical cues and instant responses" },
      { label: "2", text: "allows an audience to control the flow of exchange" },
      { label: "3", text: "encourages bodily gestures and adjustments" },
    ],
  });
  const finding = findings.find((item) => item.code === "blank-relative-tail-contract");
  assert.ok(finding);
  assert.deepEqual(finding.evidence.incompatibleLabels, ["2"]);
});

test("does not flag a relative tail when all option endings share the contract", () => {
  const findings = analyzeBlankSeam({
    passageWithBlank: "The policy created _____ that are difficult to reverse.",
    options: [
      { label: "A", text: "several institutional constraints" },
      { label: "B", text: "long-lasting social costs" },
      { label: "C", text: "two competing incentives" },
    ],
  });
  assert.ok(!findings.some((item) => item.code === "blank-relative-tail-contract"));
});

test("detects article and duplicated connector seams", () => {
  const article = analyzeBlankSeam({
    passageWithBlank: "This is an _____ for reform.",
    options: [
      { label: "1", text: "effective opportunity" },
      { label: "2", text: "useful opportunity" },
      { label: "3", text: "important opportunity" },
    ],
  });
  assert.deepEqual(
    article.find((item) => item.code === "blank-article-boundary")?.evidence.affectedLabels,
    ["2"],
  );

  const connector = analyzeBlankSeam({
    passageWithBlank: "The framework must identify and _____ before implementation.",
    options: [
      { label: "1", text: "and resolve the conflict" },
      { label: "2", text: "resolve the conflict" },
      { label: "3", text: "explain the tradeoff" },
    ],
  });
  assert.ok(connector.some((item) => item.code === "blank-double-connector-boundary"));
});

test("terminal number and blank parsing stay deliberately conservative", () => {
  assert.equal(inferTerminalNumber("a flow of exchange"), "singular");
  assert.equal(inferTerminalNumber("bodily gestures and adjustments"), "plural");
  assert.equal(inferTerminalNumber("several responses"), "plural");
  assert.equal(splitBlankSurface("left _____ right").blankCount, 1);
  assert.equal(splitBlankSurface("left _____ middle _____ right").blankCount, 2);
  assert.equal(inferSubjectNumber("a primary task for people"), "singular");
  assert.equal(inferSubjectNumber("several practical constraints"), "plural");
  assert.equal(inferSubjectNumber("the main task for human beings"), "unknown");
});

test("finite-tail rule fires only on explicit subject-number cues", () => {
  const findings = analyzeBlankSeam({
    passageWithBlank: "_____ is central to the argument.",
    options: [
      { label: "1", text: "a coherent principle" },
      { label: "2", text: "several competing principles" },
      { label: "3", text: "this institutional rule" },
    ],
  });
  assert.deepEqual(
    findings.find((item) => item.code === "blank-finite-tail-agreement-contract")?.evidence
      .incompatibleLabels,
    ["2"],
  );
});
