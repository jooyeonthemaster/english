# Deterministic split remediation re-audit v6

## Immutable verdict

**BLOCK — 894/904 passed; ten unambiguous summary evidence/source phrasing failures remain.**

The gate is strict: one expected/observed mismatch blocks. No warning credit, tolerance, majority vote, or oracle relaxation is used.

- Frozen v5 semantic replay on the patched source snapshot: **712/712 PASS**.
- New v6 holdout: **182/192**, exceeding the required minimum of 160.
- Combined: **894/904**, therefore **BLOCK**.

This audit made no production or existing-test edits and used no model API, browser, network, or database access.

## Exact blocking failures

All ten failures expected `summary-mc-direction-task-mismatch=true` and observed `false`. Each direction first requests summary completion and then explicitly requests a separately answered unsupported/contradictory claim task.

| ID | Exact direction |
|---|---|
| `v6-summary-evidence-mixed-07` | `요약문 빈칸 (A), (B)를 먼저 완성하시오. 별개 과제로 글의 내용을 근거로 옳지 않은 진술을 고르시오.` |
| `v6-summary-evidence-mixed-08` | `요약문의 빈칸 (A)와 (B)에 단어를 넣으시오. 또한 본문 내용을 근거로 사실이 아닌 주장을 찾으시오.` |
| `v6-summary-evidence-mixed-09` | `요약문 빈칸 (A), (B)를 완성하시오. 이와 독립적으로 글에서 뒷받침할 근거가 없는 주장을 고르시오.` |
| `v6-summary-evidence-mixed-10` | `요약문의 빈자리 (A), (B)를 채우시오. 두 번째 과제로 본문이 뒷받침하지 않는 진술을 선택하시오.` |
| `v6-summary-evidence-mixed-11` | `요약문 빈칸 (A)와 (B)를 완성하시오. 별도로 글의 증거로 정당화할 수 없는 주장을 찾으시오.` |
| `v6-summary-evidence-mixed-12` | `요약문의 두 빈칸 (A), (B)를 채우시오. 추가로 본문에 제시된 증거가 지지하지 않는 진술을 고르시오.` |
| `v6-summary-evidence-mixed-13` | `Complete summary blanks (A) and (B). As a separate task, choose the claim for which the passage provides no evidence.` |
| `v6-summary-evidence-mixed-14` | `Fill (A) and (B) in the summary. Independently select the statement not supported by evidence in the text.` |
| `v6-summary-evidence-mixed-15` | `Complete the summary at (A) and (B); then identify the assertion with no textual support in the source passage.` |
| `v6-summary-evidence-mixed-16` | `Choose the pair for summary slots (A) and (B). Separately, select the claim that cannot be justified from the passage.` |

The first six positive controls passed for the currently recognized forms `글/본문의 내용에 근거하지 않은`, `내용에 뒷받침되지 않는`, `내용에 어긋나는`, and `내용과 모순되는`. The ten failures show that the detector remains lexical rather than task-object complete: natural `내용을 근거로`, `근거가 없는`, `본문이 뒷받침하지 않는`, `증거가 지지하지 않는`, and corresponding English evidence/source paraphrases escape.

## Holdout design and balance

Every family has exactly 16 detector-positive and 16 detector-negative controls. A detector that always emits or always abstains therefore cannot pass.

| Family | Positive | Negative | Pass | Fail |
|---|---:|---:|---:|---:|
| summary evidence/source task split | 16 | 16 | 22 | 10 |
| blank circled verdict/meta role | 16 | 16 | 32 | 0 |
| grammar ghost Unicode decoration | 16 | 16 | 32 | 0 |
| grammar terminology | 16 | 16 | 32 | 0 |
| transformed residual punctuation | 16 | 16 | 32 | 0 |
| sentence-order Unicode `Cf` | 16 | 16 | 32 | 0 |
| **total** | **96** | **96** | **182** | **10** |

The summary negatives deliberately reuse evidence/source language while binding it only to the pair for `(A)/(B)`, for example choosing the summary pair “using evidence from the passage” or avoiding unsupported pairs. All 16 negatives abstained correctly, so widening coverage must preserve this no-overblocking boundary.

The other families use new inputs and transformations:

- 16 new finite option verdicts paired against 16 new circled procedural narratives;
- 16 new Unicode/Markdown prefixes before nonexistent `(J)`, paired with the same decorated label after prose;
- 16 explicit linguistic uses of `계사`, paired against 16 disambiguated lexical/calendar collisions;
- 16 new exact punctuation-bearing transformed answers, paired against one-punctuation/grapheme mutations;
- the next 16 runtime `\p{Cf}` property members after v5's post-v4 slice, each paired as invisible-only and visible two-sentence prose.

## Novelty and ambiguity policy

All 192 case IDs use the `v6-` namespace. IDs and inputs are individually unique; no full v6 input occurs literally in either frozen v4 or v5 audit source, and the selected `Cf` set has zero overlap with v5. Ordered ID/input hashes are frozen in `RESULTS.json`.

Twelve ambiguous candidates were excluded before execution with exact candidate strings and reasons. They include evidence-checking methods without a second answer, unresolved pronouns, nonfinite circled fragments, single-marker cases, prefixes that can be prose or decoration, ambiguous calendar/grammar senses, intentionally equivalent apostrophes, undefined slash spacing, and non-prose Unicode fragments. Exclusions are separate from the ten failures and do not relax any executed oracle.

## Integrity and reproduction

`RESULTS.json` freezes audited source/test SHA-256 hashes, every frozen v4/v5 artifact hash, ancestry harness hashes, novelty ledgers, control balance, exclusions, exact failures, and zero-use safety counters.

`verify.mjs` fails on any source/test drift, v4/v5 artifact drift, artifact drift, count/failure change, or semantic replay difference. It re-executes all 712 inherited cases and all 192 v6 cases and requires exact JSON equality.

Run from the repository root:

```powershell
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v6/verify.mjs
```

The manifest covers `AUDIT.md`, `RESULTS.json`, `audit.mts`, and `verify.mjs`; the verifier prints the manifest's own SHA-256.
