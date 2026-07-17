import assert from "node:assert/strict";
import test from "node:test";

import {
  bindAndRenderGrammarSolverCertificate,
  buildBlindGrammarSolverCertificatePrompt,
  GRAMMAR_CERTIFICATE_VERSION,
  grammarSolverCertificateSchema,
  type GrammarCertificateCandidate,
  type GrammarSolverCertificate,
} from "./contract";

const candidate: GrammarCertificateCandidate = {
  direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
  passageWithMarkers:
    "We were suddenly __(A) struck__ by the quiet. Other people __(B) who__ were reading stayed nearby. " +
    "We saw them __(C) immersed__. Consider a group __(D) which__ everybody reads aloud. " +
    "Reading __(E) collaboratively__ can be sociable.",
  correctAnswer: "(D)",
  markedExpressions: [
    { label: "(A)", expression: "struck", errorExpression: "struck", correction: "struck", isError: false, pointCode: "c" },
    { label: "(B)", expression: "who", errorExpression: "who", correction: "who", isError: false, pointCode: "b" },
    { label: "(C)", expression: "immersed", errorExpression: "immersed", correction: "immersed", isError: false, pointCode: "h" },
    { label: "(D)", expression: "in which", errorExpression: "which", correction: "in which", isError: true, pointCode: "b" },
    { label: "(E)", expression: "collaboratively", errorExpression: "collaboratively", correction: "collaboratively", isError: false, pointCode: "f" },
  ],
  explanation: "DO NOT LEAK MODEL EXPLANATION",
  keyPoints: ["DO NOT LEAK KEY POINT"],
  wrongOptionExplanations: { "(A)": "DO NOT LEAK OPTION PROSE" },
};

const certificate: GrammarSolverCertificate = {
  certificateVersion: GRAMMAR_CERTIFICATE_VERSION,
  overallVerdict: "UNIQUE_INVALID",
  studentAnswer: "(D)",
  markerAnalyses: [
    { label: "(A)", observedSurfaceExact: "struck", verdict: "GRAMMATICAL", correctedForm: "struck", pointCode: "c", ruleId: "PARTICIPLE_VOICE", evidenceSpanExact: "We were suddenly struck by the quiet.", alternativeParse: "NONE_DEFENSIBLE" },
    { label: "(B)", observedSurfaceExact: "who", verdict: "GRAMMATICAL", correctedForm: "who", pointCode: "b", ruleId: "RELATIVE_OR_NOMINAL_CLAUSE", evidenceSpanExact: "Other people who were reading stayed nearby.", alternativeParse: "NONE_DEFENSIBLE" },
    { label: "(C)", observedSurfaceExact: "immersed", verdict: "GRAMMATICAL", correctedForm: "immersed", pointCode: "h", ruleId: "OBJECT_COMPLEMENT_FORM", evidenceSpanExact: "We saw them immersed.", alternativeParse: "NONE_DEFENSIBLE" },
    { label: "(D)", observedSurfaceExact: "which", verdict: "UNGRAMMATICAL", correctedForm: "in which", pointCode: "b", ruleId: "RELATIVE_OR_NOMINAL_CLAUSE", evidenceSpanExact: "Consider a group which everybody reads aloud.", alternativeParse: "NONE_DEFENSIBLE" },
    { label: "(E)", observedSurfaceExact: "collaboratively", verdict: "GRAMMATICAL", correctedForm: "collaboratively", pointCode: "f", ruleId: "ADJECTIVE_ADVERB_FUNCTION", evidenceSpanExact: "Reading collaboratively can be sociable.", alternativeParse: "NONE_DEFENSIBLE" },
  ],
};

test("a fully bound unique certificate renders only versioned server copy", () => {
  const result = bindAndRenderGrammarSolverCertificate(candidate, certificate);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  const rendered = JSON.stringify(result.rendered);
  assert.match(result.rendered.explanation, /^정답은 \(D\)입니다/u);
  assert.equal(Object.keys(result.rendered.wrongOptionExplanations).length, 4);
  assert.equal(result.rendered.keyPoints.length, 3);
  assert.doesNotMatch(rendered, /DO NOT LEAK/u);
});

test("blind solver prompt omits answer key, correction, and generated explanation", () => {
  const prompt = buildBlindGrammarSolverCertificatePrompt(candidate);
  assert.match(prompt, /학생용 지문/u);
  assert.doesNotMatch(prompt, /DO NOT LEAK/u);
  assert.doesNotMatch(prompt, /정답은 \(D\)/u);
  assert.doesNotMatch(prompt, /in which/u);
});

test("answer mismatch, non-unique verdict, and extra invalid decoy fail closed", () => {
  const changed = structuredClone(certificate);
  changed.overallVerdict = "MULTIPLE_INVALID";
  changed.studentAnswer = "MULTIPLE";
  changed.markerAnalyses[0].verdict = "UNGRAMMATICAL";
  const result = bindAndRenderGrammarSolverCertificate(candidate, changed);
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.ok(result.rejectionCodes.includes("SOLVER_NOT_UNIQUE"));
  assert.ok(result.rejectionCodes.includes("ANSWER_MISMATCH"));
  assert.ok(result.rejectionCodes.includes("DECOY_NOT_GRAMMATICAL"));
});

test("surface, correction, point, rule, evidence, and alternative parse are independently bound", () => {
  const mutations: Array<[keyof GrammarSolverCertificate["markerAnalyses"][number], unknown, string]> = [
    ["observedSurfaceExact", "that", "SURFACE_MISMATCH"],
    ["correctedForm", "where", "CORRECTION_MISMATCH"],
    ["pointCode", "c", "POINT_CODE_MISMATCH"],
    ["ruleId", "PARTICIPLE_VOICE", "RULE_ID_MISMATCH"],
    ["evidenceSpanExact", "A fabricated source sentence with which inside.", "EVIDENCE_NOT_BOUND"],
    ["alternativeParse", "PLAUSIBLE_STANDARD_PARSE", "ALTERNATIVE_PARSE_DEFENSIBLE"],
  ];
  for (const [field, value, expectedCode] of mutations) {
    const changed = structuredClone(certificate) as GrammarSolverCertificate;
    Object.assign(changed.markerAnalyses[3], { [field]: value });
    const result = bindAndRenderGrammarSolverCertificate(candidate, changed);
    assert.equal(result.accepted, false, field);
    if (result.accepted) continue;
    assert.ok(result.rejectionCodes.includes(expectedCode as never), field);
  }
});

test("schema rejects unknown free-form rules and wrong marker cardinality", () => {
  const unknownRule = structuredClone(certificate) as unknown as Record<string, unknown>;
  (unknownRule.markerAnalyses as Array<Record<string, unknown>>)[0].ruleId = "MODEL_INVENTED_RULE";
  assert.equal(grammarSolverCertificateSchema.safeParse(unknownRule).success, false);
  const short = structuredClone(certificate);
  short.markerAnalyses.pop();
  assert.equal(grammarSolverCertificateSchema.safeParse(short).success, false);
});

