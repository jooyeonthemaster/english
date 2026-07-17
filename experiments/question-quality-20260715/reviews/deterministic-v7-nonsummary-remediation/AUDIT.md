# Deterministic v7 non-summary remediation

Date: 2026-07-15 KST  
Overall verdict: **BLOCK**  
Bounded high-confidence remediation subset: **PASS (95/95)**

## Outcome

This change remediates only the requested non-summary, high-confidence surface families. It does not claim that deterministic regex can certify arbitrary English-grammar propositions.

| Family | Frozen v7 scoring after patch | Remediation-aware replay | Outcome |
|---|---:|---:|---|
| Blank circled procedural numbering | 32/32 | 32/32 | PASS |
| Grammar nonexistent/ghost label | 31/32 | 31/32 | implementation detects every real ghost; one frozen negative oracle is contradictory |
| Grammar free-text rule truth | 16/32 | 16/32 | BLOCK; deliberately not overfit with a fact blacklist |
| Sentence-order paragraph integrity | 27/32 | 32/32 | implementation PASS; frozen scorer does not recognize the new fragment code |

The complete frozen-v7 harness now reports **1,138/1,160, 22 failures, BLOCK**. Of those 22:

- 16 are unrestricted free-text grammar-truth controls;
- 1 is the contradictory ghost-label oracle;
- 5 are dependent-fragment rows for which the production validator emits the new dedicated code, but the immutable scorer's allowed-code list predates that code.

The remediation-aware replay covers 128 in-scope controls and reports **111/128**. Removing the 32 deliberately out-of-scope grammar-truth rows and the one invalid oracle leaves the bounded subset at **95/95**.

## Implemented protections

- Blank explanations now recognize natural solver actions such as finding, comparing, separating, and selecting as procedural clauses even when `먼저/다음으로` is omitted. Two or more non-option circled clauses are required; direct option verdicts remain controls.
- Ghost-label validation now understands the student-visible label grammars exposed by v7: circled digits and letters, bracketed/parenthesized numbers, lower-case Roman numerals, Korean ordinal `밑줄` labels, and the existing parenthesized Latin labels. Candidates are compared with actual rendered labels, not accepted from a style whitelist.
- Sentence-order paragraph bodies now reject a duplicated leading `(A)`, `[A]`, or circled A-C marker with `sentence-order-paragraph-body-label`.
- Short punctuation-free dependent surfaces beginning with an overt dependency marker receive `sentence-order-dependent-fragment`. Complete dependent openers containing a main clause are explicit normal controls. This is a bounded structural certificate, not a general English parser.

## Frozen-oracle defect

`v7-grammar-label-neg-12` declares only `[1]`, `[2]`, `[3]`, `[4]`, and `[5]`, but its explanation references `㉡`. The frozen row says that reference is valid. Those facts cannot all be true.

The validator correctly emits `grammar-keypoint-nonexistent-label`; the immutable score therefore records one false positive. The implementation was not weakened to satisfy the bad oracle.

## Grammar truth blocker

The 16 false-rule controls span different grammatical relations. Adding those phrases to a regex list would memorize exposed examples without proving the next claim and could reject accurate statements containing the same terms.

No such list was added. [GRAMMAR-TRUTH-DESIGN.md](./GRAMMAR-TRUTH-DESIGN.md) specifies a bounded rule-certificate/catalog design, deterministic source/correction binding, zero-call template rendering for catalogued rules, and a conditional semantic verifier for genuinely free-form claims. The overall verdict remains BLOCK until that architecture and a fresh independent holdout are proved.

## Verification

- Focused normal/defect tests: **37/37 PASS**.
- ESLint over the three source and three test files: **PASS**.
- Remediation artifact verifier: `PASS_ARTIFACT_INTEGRITY_BOUNDED_REMEDIATION_ONLY_OVERALL_BLOCK`.
- Frozen v7 manifest: all seven entries still match exactly; the frozen directory was not edited.
- Adjacent regression run: **180/181 PASS**. The one failure is an existing `grammar-decoy-filler-span` rejection of label E (`change`) in a structurally-loaded KILLER fixture; none of this remediation's edited branches emits that code.
- Project typecheck was executed. It reported zero diagnostics in the remediation files and four diagnostics in a concurrent untracked `policy-severity-reaudit-v2/build-reaudit.mts` file whose default imports do not match named-only exports. Therefore a repository-wide typecheck PASS is not claimed here.
- The original v7 verifier is expected to reject current-source hash drift because the root summary remediation changed `summary/mc.ts` after v7 was frozen. Artifact immutability is separately established by the exact v7 manifest verification in `replay.mts` and `verify.mjs`.

## Safety and provenance

No model/API, network, browser, database, or secret reads were performed. API campaign consumption remains **0**. Exact hashes are recorded in `RESULTS.json`; `replay.mts` recomputes current classifications and `verify.mjs` binds the replay, source/tests, design note, and untouched frozen-v7 manifest.
