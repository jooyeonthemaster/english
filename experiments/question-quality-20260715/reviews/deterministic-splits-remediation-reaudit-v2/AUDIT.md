# Deterministic split remediation — adversarial re-audit v2

Date: 2026-07-15 KST  
Safety: model/API 0; browser/network 0; DB read/write 0; production edits 0;
existing-test edits 0

## Verdict

**BLOCK — 120/144 passed, 24/144 failed.**

The complete earlier suite passed **97/97**, including all nine fatal policy
mappings. A second, independently added ring of 47 neighboring variants passed
23 and failed 24. This is a frozen pre-follow-up-remediation snapshot; later
fixes must be evaluated in another artifact rather than rewriting this one.

## Failure distribution

| Added boundary family | Pass | Fail | Total |
|---|---:|---:|---:|
| More base infinitives ending `-ing` | 4 | 0 | 4 |
| Summary direction neighbors | 4 | 4 | 8 |
| Circled explanation neighbors | 2 | 4 | 6 |
| Ghost-label prefix neighbors | 4 | 4 | 8 |
| Unicode format-only paragraphs | 0 | 8 | 8 |
| Residual punctuation neighbors | 5 | 2 | 7 |
| Korean terminology neighbors | 4 | 2 | 6 |
| **New ring** | **23** | **24** | **47** |

## Findings

1. Summary direction segmentation both over- and under-blocked. A valid second
   sentence selecting the grammatically correct option for each summary blank
   was called a grammar task. Conversely, same-clause English/Korean competing
   tasks and a colon-introduced blank task escaped the fatal.
2. Direct option verdicts using `오답으로 보아야 한다`, `오답이라고 판단할 수
   있다`, or `오답으로 간주된다` were called narrative steps. In the other
   direction, narrative instructions describing how to `소거할 수` 있는 기준을
   세운다 were mistaken for option verdicts.
3. Ghost labels still escaped behind `①.`, `1:`, `[1]`, and Korean `가.` list
   prefixes.
4. U+200E, U+200F, U+202A, U+202E, U+2061, U+2063, U+00AD, and a mixture of
   these visually empty format characters did not emit
   `sentence-order-empty-paragraph`.
5. Exact transformed answers with a trailing possessive apostrophe in a token
   (`students' shared responsibility`, straight or curly apostrophe) escaped
   the residual fatal.
6. The real Korean sexagenary-calendar words `계사년` and `계사일` were treated
   as standalone specialist grammar term `계사`.

`RESULTS.json` contains all 24 case IDs and exact expectations. The audit
harness contains all exact inputs and composes the frozen 97-case harness with
the 47 new cases. It pins both harness hashes, the audited source/test hashes,
and the preceding BLOCK artifact manifest. `verify.mjs` replays only when the
audited source snapshot is current; otherwise it verifies immutable artifact
integrity and reports drift. Canonical hashes are in `MANIFEST.sha256`.
