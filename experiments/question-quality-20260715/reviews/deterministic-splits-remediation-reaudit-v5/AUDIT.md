# Deterministic split remediation re-audit v5

## Immutable verdict

**BLOCK — 711/712 passed; one unambiguous deterministic boundary failure remains.**

The gate is intentionally strict: any expected/observed mismatch blocks. No warning credit, tolerance, majority vote, or oracle relaxation is used.

- Frozen v4 semantic replay on the audited source snapshot: **520/520 PASS**.
- New v5 holdout: **191/192**, with 192 cases (32 above the required minimum of 160).
- Combined: **711/712**, therefore **BLOCK**.

This audit made no production or existing-test edits and used no model API, browser, network, or database access.

## Exact blocking failure

- ID: `v5-summary-mixed-13`
- Family: `summary-mixed-task-v5`
- Expected: `true` (`summary-mc-direction-task-mismatch` must be emitted)
- Observed: `false`
- Exact direction: `요약문의 두 자리 (A), (B)를 채우시오. 그와 별개로, 글의 내용에 근거하지 않은 주장을 고르시오.`

The first sentence asks for the summary pair. The second sentence explicitly says “separately” and asks for a different answer object: a claim unsupported by the text. It is therefore not a separator or pragmatic borderline. The current Korean content-match pattern recognizes forms such as `본문에 근거하지 않은 주장` and `글의 내용에 어긋나는 주장`, but misses the natural composition `글의 내용에 근거하지 않은 주장`.

## New holdout design

Every family has exactly 16 detector-positive and 16 detector-negative controls. The 96/96 overall balance prevents a detector that always emits or always abstains from looking healthy.

| Family | Positive | Negative | Pass | Fail |
|---|---:|---:|---:|---:|
| summary mixed-task | 16 | 16 | 31 | 1 |
| blank circled verdict/meta role | 16 | 16 | 32 | 0 |
| grammar ghost Unicode decoration | 16 | 16 | 32 | 0 |
| grammar terminology | 16 | 16 | 32 | 0 |
| transformed residual punctuation | 16 | 16 | 32 | 0 |
| sentence-order Unicode `Cf` | 16 | 16 | 32 | 0 |
| **total** | **96** | **96** | **191** | **1** |

The cases are independent, natural-language or property/metamorphic holdouts rather than copies of frozen v4 literals:

- Summary positives assign a clearly separate grammar, passage-blank, title, main-idea, content, irrelevant-sentence, insertion, or order task. Negatives bind every operation to summary slots `(A)` and `(B)`.
- Blank controls split finite option verdicts from circled procedural steps. Both sides contain three markers, so only syntactic/discourse role changes.
- Ghost-label controls use 16 new Unicode/Markdown decorations before nonexistent `(H)`, paired with the identical decorated label after real prose.
- Terminology controls put `계사` in explicit linguistic contexts, paired against disambiguated profession/history/statistics/design/machinery and sexagenary-calendar collisions.
- Residual controls preserve 16 exact transformed answers with meaningful punctuation, paired against one-punctuation or one-grapheme mutations.
- Sentence-order controls enumerate the runtime `\p{Cf}` property, remove all 65 v4 members, and select the first 16 of the remaining 105. Each invisible-only paragraph is paired with substantive two-sentence prose containing the same code point.

All 192 IDs use the `v5-` namespace; all IDs and inputs are unique. Their ordered ID/input hashes are recorded in `RESULTS.json`.

## Oracle ambiguity exclusions

Twelve candidates were excluded before execution, with exact examples and reasons recorded in `RESULTS.json`. The exclusions do not make the oracle more permissive; they prevent unrelated or genuinely indeterminate cases from being mislabeled. They cover:

- preparatory reading/checking language without a second response object;
- circled fragments lacking enough syntax or markers to distinguish option citation from procedure;
- single-letter or meta-question prefixes that can be either decoration or prose;
- `관계사` and a possible proper name whose target sense is not fixed;
- dash/spacing and case-only residual transformations that are intentionally equivalent;
- emoji-only and dangling-combining-mark strings that do not establish substantive paragraph prose.

## Integrity and reproduction

`RESULTS.json` freezes:

- all audited production/test SHA-256 hashes;
- all five frozen v4 artifact hashes;
- the v4 replay harness hash and its self-reported hash;
- case-ledger hashes, control counts, exclusions, exact failure ID/string, and zero-use safety counters.

`verify.mjs` fails on any source/test drift, frozen-v4 drift, artifact drift, count change, failure change, or semantic replay difference. It re-executes all 520 v4 cases and all 192 v5 cases, then requires exact JSON equality with the frozen result.

Run from the repository root:

```powershell
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v5/verify.mjs
```

The manifest covers `AUDIT.md`, `RESULTS.json`, `audit.mts`, and `verify.mjs`. The manifest's own SHA-256 is printed by the verifier.
