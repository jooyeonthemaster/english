# Campaign v6 strict JSON observer — independent re-audit v1

## Verdict

`FAIL_BLOCKERS`

The remediated observer passes the four previously reported blocker classes, but it still discards root-sequence evidence and cannot recover affirmative candidate evidence behind common invalid prefixes. Either defect can make a physically multi-candidate response appear to be one non-ambiguous candidate.

This is a permanent, non-authorizing review artifact. It did not dispatch, build/freeze, read credentials or private artifacts, call a provider/model/network, or read/write the global candidate ledger.

## Exact subject and result

- Strict observer: `execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts`
- Strict observer SHA-256: `a7900fd2026eac7d63a2aca53ec77402bd18b9274b12699470f7bc3df89ee47d`
- Coordinated offline test SHA-256 observed during the final matrix run: `d87f24ec74d64395c5478f56f12abff2af30e6c071a2e6d71f9b62e66765550d`
- Deterministic cases: **461**
- Passing: **367**
- Failing: **94**
- Matrix fingerprint: `a2136f586fdaaca7d0cd46fb30e135db47c8ef8666e4994c8f5c9bca3c3eb432`
- Failure fingerprint: `1568d5165c73aff6081672f16429e8f94eb6f05bb350f43a206860616f7ee371`

The audit matrix is self-contained in `audit.ts`. It imports the exact observer only. It neither imports nor executes the subject's test suite, and it reads the coordinated offline test solely to report its hash.

## Independent matrix

| Category | Cases | Failures | Result |
|---|---:|---:|---|
| OpenRouter array envelopes | 48 | 0 | pass |
| typed choices maps / JSON strings | 56 | 0 | pass |
| explicit questions arrays / maps / scalars / strings | 72 | 0 | pass |
| nested neutral and JSON-string wrappers | 42 | 0 | pass |
| liveness / answer-metadata context | 72 | 0 | pass |
| decoded keys before truncated values | 12 | 0 | pass |
| raw root sequences | 26 | 26 | **fail** |
| decoded-content root sequences | 26 | 26 | **fail** |
| invalid-prefix/suffix recovery | 48 | 42 | **fail** |
| pure-neutral root controls | 12 | 0 | pass |
| positive root controls | 3 | 0 | pass |
| duplicate / escaped-equivalent keys | 24 | 0 | pass |
| exact byte/node/depth/1,001 caps | 8 | 0 | pass |
| native Gemini diagnostics under the OpenRouter contract | 12 | 0 | pass |
| **Total** | **461** | **94** | **FAIL_BLOCKERS** |

The 367 passing controls include the four former blocker classes: provider-evidenced `choices` objects/strings retain per-entry lineages; explicit `questions` maps/scalars/strings are not collapsed; a decoded candidate-bearing key survives truncation before its value; and answer-option/rubric metadata inside an established question does not create a second question or provider choice.

## B1 — parsed root count and parse failure are discarded

`ParsedSequence` carries `roots`, `partialRoot`, and `failed`, but candidate analysis uses only the candidate-bearing descendants. It does not propagate `roots.length` or `failed` when exactly one provider/model lineage was already found. Therefore a valid one-choice envelope plus a second neutral root or failed tail remains `choices=1`, `units=1`, `ambiguous=false`; that combination does not itself request candidate quarantine.

Representative exact observations:

| Case | Raw SHA-256 | Expected `(choices, questions, units, ambiguous)` | Actual |
|---|---|---|---|
| provider then `{}` | `3209cec68908fe5d25119c081dd6e6dad0b2679b49337d223e14a9c97a0fadc8` | `(1, 0, 1, true)` | `(1, 0, 1, false)` |
| `{}` then provider | `1484a927e2c6f7ba8f12579db21534a95bb838028d4fa2357340ecaebe637248` | `(1, 0, 1, true)` | `(1, 0, 1, false)` |
| provider then truncated `{` | `c09e62fb091a8030976c2717c816a760606d227f00680b660cf486d979087817` | `(1, 0, 1, true)` | `(1, 0, 1, false)` |
| provider then trailing comma | `96a3a86c3e6107cb96a8452ece1d1654a60858b5c9bee2696724498c56692635` | `(1, 0, 1, true)` | `(1, 0, 1, false)` |
| decoded question then `{}` | `43830339d1f787576fce334ea500bbc9dfb7c43df7eb9396f0c689c9c885cef9` | `(1, 1, 1, true)` | `(1, 1, 1, false)` |
| decoded question then unterminated string | `4f2b5745b359fe378b4dc4f8e6b3ae3b9477e6cbb485cacd07b0219c90d7b696` | `(1, 1, 1, true)` | `(1, 1, 1, false)` |

The failure is systematic across complete neutral object/array/scalar roots before and after the provider root, incomplete objects/arrays/strings, missing values, invalid token/exponent/escape, and the same forms inside `message.content`.

Pure-neutral controls intentionally expect `ambiguous=false`: `{} {}` or `{} {` does not invent a model lineage, and the independently observed zero-choice shortage already fails closed. Two valid provider roots and provider-plus-question controls correctly produce two units and ambiguity. Whitespace-only trailing bytes correctly remain non-ambiguous. This isolates the defect to extra root/failure evidence coexisting with a model surface.

## B2 — invalid-prefix recovery blind spot

Decoded-string observation is entered only when the content's first non-whitespace character is `[`, `{`, or `"`. Raw sequence parsing stops at the first unrecoverable token. Consequently, `null `, `true `, `0 `, BOM, a Markdown code fence, prose, comma, or colon can hide one or two later complete questions; BOM/fence/prose/comma/colon can also hide later complete OpenRouter envelopes at the raw top level.

Representative exact observations:

| Case | Raw SHA-256 | Expected `(choices, questions, units, ambiguous)` | Actual |
|---|---|---|---|
| code fence then two decoded questions | `56f3fa5be6525f1a1cb18d9c319bc385d47731902746c49576e7b9007b394e37` | `(1, 2, 2, true)` | `(1, 0, 1, false)` |
| code fence then raw two-choice envelope | `355aed845ec55809309598b453b89bbd316276e399c861d4ccb345c5f0019fde` | `(2, 0, 2, true)` | `(0, 0, 1, false)` |
| raw `null ` then one-choice envelope | `13bc6a4e2d14203f61becd4e75078e4841f00bb6dddfc327fe3ec688ea792850` | `(1, 0, 1, true)` | `(1, 0, 1, false)` |
| decoded question then prose suffix | `b69682ed05e9624c905b0f5b94a28f1b38bd3574406a6d591ea9b602043d66a6` | `(1, 1, 1, true)` | `(1, 1, 1, false)` |

The six passing raw-prefix controls are informative: JSON-scalar prefixes (`null`, `true`, `0`) do not erase a later two-choice envelope or two provider roots because the top-level sequence parser can advance through the scalar. They still erase the required ambiguity for a later single-choice envelope. The five non-JSON prefixes erase all later provider evidence.

## Required remediation and successor audit

At minimum, a successor must:

1. preserve root-count and parse-failure evidence at both raw and recursively decoded sequence boundaries;
2. set ambiguity when a model-surface lineage coexists with another complete root or a failed/truncated tail, while retaining the pure-neutral controls;
3. recover and count bounded candidate-bearing roots behind invalid prefixes, or emit an equally strong cardinality-unobservable/quarantine state that cannot under-account the physical candidates;
4. retain exact per-entry lineage behavior for typed provider choices and explicit questions;
5. rerun this exact 461-case matrix plus fresh non-derived adversarial cases under a new immutable review directory.

This review does not authorize v6 freeze, network metadata capture, provider dispatch, candidate-ledger mutation, or any C0/S1 candidate generation.
