# Deterministic split remediation — independent v7 fresh audit

Audit date: 2026-07-15 KST  
Verdict: **BLOCK**  
Blocking rule: one semantic oracle mismatch blocks; no tolerance or warning credit.

## Outcome

- Frozen v6 remains immutable **BLOCK (894/904)**. Its four-file manifest is intact.
- Replaying all 904 inherited semantic cases against the current source gives **904/904**.
- The new v7 corpus contains **256** cases: 224 pre-source-review blind cases plus a transparently post-seal 32-case Korean answer-object supplement.
- New holdout result: **165/256 pass, 91 fail**.
- Combined result: **1,069/1,160 pass, 91 fail → BLOCK**.
- New controls are exactly balanced: 128 positive / 128 negative.
- No v4-v6 primary input literal was reused.

| Family | Cases | Pass | FN | FP |
|---|---:|---:|---:|---:|
| Blank explanation circled-step role | 32 | 16 | 16 | 0 |
| Blank transformed-answer residue | 32 | 32 | 0 | 0 |
| Grammar nonexistent key-point label | 32 | 18 | 14 | 0 |
| Grammar explanation terminology/rule accuracy | 32 | 16 | 16 | 0 |
| Sentence-order paragraph integrity | 32 | 19 | 13 | 0 |
| Summary-MC direction answer object | 96 | 64 | 18 | 14 |

`RESULTS.json` preserves all 91 failed ids, expected/observed polarity, family, corpus source, and issue codes. Each id resolves to its immutable full input and oracle in the sealed blind corpus or the separately hashed targeted supplement.

## Blind protocol and novelty

The 224-case semantic corpus was authored and hashed before any v4-v6 audit script, result, audit narrative, verifier, manifest, or unit-test body was opened. The seal was created at `2026-07-14T20:15:14.1813684Z`:

- `blind-holdout-cases.mjs`: `d74721aafa909a641bd69de236ef1c7dcbc921b327e363ecbf93b65bbe921fdd`
- 6 families, with 16 positive / 16 negative in each non-summary family.
- Summary-MC: 32 positive / 32 negative, including `본문상`, `지문으로 볼 때`, `글에 비추어`, and `제시 근거상` eight times each; explicit `(A)/(B)` and unlabeled two-blank surfaces are balanced 16/16 per polarity.
- Ambiguous candidates were discarded before assigning an id and were not run.

After the blind run did not expose the suspected nearest-object false positive, a separate, explicitly non-blind 32-case supplement was added. It is balanced 16 true claim-selection tasks / 16 true pair-selection tasks. This supplement is additive and did not alter any sealed oracle.

## Blocking findings

### 1. Summary-MC direction detection is neither recall-safe nor object-precise

The complete summary family has **18 false negatives and 14 false positives**.

- Source framings such as `본문상` and `제시 근거상`, positive support wording, and several object/action orders evade the content-evidence task detector.
- More seriously, 14 of 16 targeted pair-object negatives are rejected as `summary-mc-direction-task-mismatch`. In sentences such as “본문의 주장과 일치하는 (A)/(B) 표현 쌍을 고르시오,” `주장` is part of a modifier and `쌍` is the commanded object. The current helper treats nearby `주장 + source + verdict + 고르다` vocabulary as sufficient and does not bind the selection verb to its nearest/direct answer object.
- A safe remediation must identify the commanded object (claim/statement versus pair/combination/blank expressions), not only keyword co-occurrence within a character window. The same minimal pairs must become regression tests.

### 2. Circled procedural numbering fatal is narrower than the visible defect

All 16 new procedural explanations are unambiguous three-step narratives, yet none receives `blank-explanation-narrative-circled-numbering`. The broad warning fires in this region, but the fatal requires a small post-marker discourse-cue vocabulary. Natural action predicates such as “도입부에서 조건을 찾는다” or “주어를 확정한다” therefore escape the fatal even though ①/②/③ plainly organize solution steps.

### 3. Grammar ghost-label validation recognizes only a narrow label grammar

Fourteen of 16 nonexistent-label positives are missed. The detector structurally parses only parenthesized Latin `(A)`–`(J)` anchors; circled numerals, bracketed numerals, Roman forms, Hangul ordinal references, and other student-visible ghost references are ignored. The two parenthesized-Latin controls are detected, confirming that the miss is label-grammar coverage rather than fixture wiring.

### 4. False grammar rules remain outside deterministic explanation protection

Sixteen objectively false school-grammar rules receive no terminology-error fatal (for example, defining passive voice as `be + present participle`, or requiring a `to`-infinitive after a modal). This is broader than the current one-term error lexicon: the result demonstrates that deterministic term replacement alone cannot certify explanation correctness. A separate bounded rule certificate or explanation verifier is required; expanding one regex list should not be represented as semantic coverage.

### 5. Sentence-order paragraph-body integrity has uncovered structural gaps

Thirteen positive controls are missed after scoring only the named structural split or an explicit same-family equivalent. Duplicate `(A)/(B)/(C)`-style labels inside paragraph bodies have no dedicated structural fatal, and dependent fragments are not distinguished by a fragment-specific invariant. Unrelated fixture diagnostics were deliberately denied pass credit.

### 6. Exact transformed-answer residue is the only new family with complete separation

All 16 exact-residue positives and all 16 paraphrased negatives are classified correctly (**32/32**). This is the sole v7 family that supports a fresh PASS claim.

## Provenance

- Frozen v6 manifest SHA-256: `99f7472df3f71a8a7c00c0856b622726284370b65a155a5a4b1d3efaa9e8af56`.
- Frozen v6 audit SHA-256: `f557fb04ccf4eb83758b13b7a09a63209343ad8aaaf1658204cc4daf861653a7`.
- Relative to frozen v6 source/test provenance, only `src/lib/question-quality/validators/summary/mc.ts` and `tests/unit/summary-mc-direction-split.test.mjs` changed; both frozen and current hashes are recorded in `RESULTS.json`.
- Current source/test hashes for every v6-audited path are recorded and verified by exact replay.
- TypeScript reports no v7 audit-file diagnostics.

## Safety and scope

The audit made zero model/API, browser, network, or database calls; performed zero production or existing-test edits; and wrote only this new v7 review directory. It does not authorize shipment. Production remediation must occur after this immutable BLOCK artifact is frozen, followed by a genuinely new audit.
