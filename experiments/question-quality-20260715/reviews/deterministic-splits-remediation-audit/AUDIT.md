# Deterministic split remediation — independent adversarial audit

Date: 2026-07-15 KST  
Scope: the seven detector-boundary defects recorded by
`deterministic-splits-fresh-audit`, plus adjacent adversarial variants and the
nine fatal-code policy mappings  
Safety: model/API 0; browser 0; network 0; database read/write 0; production
edits 0; existing-test edits 0

## Verdict

**BLOCK — 91/97 passed, 6/97 failed.**

All seven originally reported examples were repaired, and four categories were
clean across their expanded suites: summary-completion grammar/collocation
(15/15), sentence-order structure (11/11), transformed-answer residual matching
(15/15), and Korean terminology boundaries (10/10). All nine fatal policy maps
also passed (9/9): every code is relaxed-blocking and absent from both salvage
and SHIP_FIRST.

The implementation was nevertheless not ready to accept as an invariant at
this frozen source snapshot. Adversarial neighboring forms exposed six
remaining boundary failures: three summary-direction false negatives, one
circled-explanation false positive, and two ghost-label false negatives.

## Exact blocking findings

### B1 — plural blank-task direction escaped the competing-task fatal

Case `direction-competing-blank-plural`:

> Choose the words that best fit the blanks in the passage.

Observed only `summary-mc-direction-frame` (warning), not
`summary-mc-direction-task-mismatch` (fatal). The singular `blank` pattern had
been repaired, but its plural neighbor remained salvageable.

### B2 — an explicit summary prefix suppressed real second tasks

Cases `direction-mixed-summary-and-grammar` and
`direction-mixed-summary-and-blank`:

> Complete the summary by choosing words for (A) and (B). Then identify which
> underlined expression is grammatically incorrect.

> Complete the summary by choosing words for (A) and (B). Then choose the
> phrase that best fits the blank in the passage.

Both produced no direction diagnostic. The valid-summary exemption was applied
to the whole string, so it correctly protected phrases such as “grammatically
correct words” but also hid an independently stated grammar or blank task.

### B3 — common Korean option-verdict paraphrases were treated as steps

Case `circled-options-can-be-seen`:

> ① 먼저 범위를 과장하므로 오답으로 볼 수 있다. ② 다음으로 인과를 뒤집으므로
> 오답이라고 할 수 있다. ③ 마지막으로 결론과 일치해 정답이라고 볼 수 있다.

Observed both the warning and
`blank-explanation-narrative-circled-numbering` fatal. These clauses explicitly
judge options, but the direct-verdict inventory covered `오답이다`,
`오답으로 판단된다`, and similar forms without covering `오답으로 볼 수 있다` /
`정답이라고 할 수 있다`.

### B4 — nested and circled list prefixes still bypassed ghost-label fatal

Cases `ghost-nested-bullet-number` and `ghost-circled-list-number`:

> • 1. (F) 분사 선택을 확인한다.

> ① (F) 분사 선택을 확인한다.

`findGrammarKeypointNonexistentLabel` returned null in both cases. The first
fell back to the salvage-relaxable craft mismatch; the second did the same.
Ordinary single bullets and ordinary Arabic list numbers passed, but the prefix
normalizer accepted only one such prefix and did not accept circled list
numbers.

## Passing coverage by category

| Category | Pass | Fail | Total |
|---|---:|---:|---:|
| Summary completion grammar/collocation | 15 | 0 | 15 |
| Summary directions | 12 | 3 | 15 |
| Blank circled explanation numbering | 9 | 1 | 10 |
| Grammar ghost labels | 10 | 2 | 12 |
| Sentence-order structure | 11 | 0 | 11 |
| Blank transformed-answer residual | 15 | 0 | 15 |
| Korean grammar terminology | 10 | 0 | 10 |
| Fatal policy isolation | 9 | 0 | 9 |
| **Total** | **91** | **6** | **97** |

Notable repaired boundaries that passed include:

- valid infinitives ending in the letters `-ing`: bring, cling, fling, ring,
  sing, spring, sting, and swing;
- valid explicit summary directions containing “grammatically correct” and
  blank wording, alongside pure grammar/blank competing tasks;
- sentence and compact/no-space circled narrative steps, ordinary direct option
  verdicts, named options, and coordinated option lists;
- plain, bullet, numbered, and lowercase `(F)` ghost labels;
- U+200B/U+200C/U+200D/U+2060/U+FEFF-only paragraphs and lowercase/fullwidth
  `(a)/(b)/(c)` contamination;
- exact, ASCII-hyphen, and U+2010–U+2015 dash-equivalent residuals, with clean
  longer-token negatives such as `public art` vs `public article`;
- standalone `계사` with particles, while 관계사/관계사절/회계사/공인회계사/
  세계사/근현대세계사 remained clean.

## Provenance and immutability

`RESULTS.json` pins the exact audit harness plus 14 audited source/test files.
It also pins all four files in the earlier FAIL artifact, proving that the
earlier record was preserved. The self-contained harness contains all 97 case
inputs and expectations and imports only production validators/policy sets.

This directory freezes the **91/97 pre-follow-up-remediation snapshot**. Source
changes made after the freeze are intentionally not rewritten into this
artifact. `verify.mjs` therefore performs a semantic replay only when the
audited source hashes are still current; after later remediation it verifies
artifact integrity, reports the exact source-drift paths, and leaves this BLOCK
record immutable. A new sibling audit is required for any later PASS claim.

The canonical artifact hashes are in `MANIFEST.sha256`; the manifest's own hash
is printed by `verify.mjs`.
