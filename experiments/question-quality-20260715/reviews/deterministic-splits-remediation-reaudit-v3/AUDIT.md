# Deterministic split remediation — independent adversarial re-audit v3

Date: 2026-07-15 KST  
Safety: model/API 0; browser/network 0; DB read/write 0; production edits 0;
existing-test edits 0

## Verdict

**BLOCK — 201/242 passed, 41/242 failed.**

The entire inherited v2 suite passed **144/144**. The v3 audit then added 98
previously unseen cases—at least 16 around every remediated family—and found 41
new boundary failures. PASS requires 100%; therefore the result is BLOCK even
though all earlier regressions remain repaired.

## Added-ring results

| Family | Pass | Fail | Total |
|---|---:|---:|---:|
| Summary directions | 9 | 7 | 16 |
| Circled explanations | 6 | 10 | 16 |
| Grammar ghost-label prefixes | 4 | 12 | 16 |
| Unicode format-only paragraphs | 16 | 0 | 16 |
| Punctuated answer residuals | 8 | 8 | 16 |
| Korean `계사` terminology | 14 | 4 | 18 |
| **New ring** | **57** | **41** | **98** |

## Findings

### Summary direction: segmentation is still lexical

The repaired splitter correctly handles the v2 punctuation/conjunction set,
but misses real second tasks joined by bare `and`, `while`, slash, em dash,
Korean `완성하며`, and `완성한 뒤`. It also fatally rejects the valid restatement
“select the grammatically correct option for (A) and (B)” because only phrases
that repeat the word `blank` are bound back to the summary operation.

### Circled explanation: verdict words do not identify discourse role

Legitimate option judgments such as `오답이라 판단된다`, `오답이라고 봐야 한다`,
and `정답으로 인정된다/인정할 수 있다` are false positives. Conversely,
meta-instructions such as `정답으로 판단할 수 있는 기준을 세운다`, `오답으로
처리/분류할 기준`, `정답에 해당하는 조건`, and `소거된다면 확인할 순서` are
false negatives. Extending a verdict-phrase alternation cannot by itself
distinguish a completed option judgment from instructions for constructing a
judgment criterion.

### Ghost labels: prefix enumeration remains open-ended

Nonexistent `(F)` labels escaped behind fullwidth/ideographic punctuation,
circled or parenthesized Hangul, Latin/Roman list labels, three-digit numbers,
Markdown blockquotes/headings/task boxes, and nested quote prefixes. The label
is visually explicit in every case; it should not become salvageable because a
decorative prefix was not enumerated.

### Unicode format controls: repaired cleanly

All 16 new cases passed, including U+061C, U+180E, bidi controls, invisible
operators, interlinear annotation controls, astral language/tag controls, and
visible prose containing embedded controls. The Unicode `Cf`-category approach
generalized beyond the prior examples without erasing visible content.

### Residual matching: exact punctuation is discarded too early

Exact answer strings containing comma, slash, ampersand, parentheses, colon,
period abbreviation (`U.S.`), semicolon, or plus sign escaped. The near-negative
controls passed. A direct boundary-safe exact-string path should precede any
lossy token/hyphen normalization path.

### Korean terminology: ordinary-word defense hides specialist compounds

Calendar and ordinary lexical compounds passed correctly. However the actual
specialist grammar compounds `비계사`, `유사계사`, `무계사절`, and `준계사` were
false negatives because any preceding Hangul syllable suppresses `계사`.

## Provenance

The self-contained v3 harness composes the immutable 144-case v2 harness and
contains all 98 exact new inputs and expectations. `RESULTS.json` pins the v3
and v2 harnesses, 14 audited production/test files, the v2 BLOCK manifest, all
case-ledger hashes, and zero-call safety counters. No prior artifact was
rewritten.

`verify.mjs` performs semantic replay when the audited source snapshot remains
current. If follow-up remediation changes that source, it instead verifies the
historical artifact and reports source drift. Canonical artifact hashes are in
`MANIFEST.sha256`.
