# Deterministic question-quality split remediation re-audit v8

## Verdict

**BLOCK.** The sealed 256-case corpus produced 93 oracle mismatches. Under the declared rule, one mismatch is sufficient to block. The result is not flattened into a single unsupported-semantics failure: the two fully bounded families that passed remain separately evidenced below.

## Blind protocol and provenance

- The 256 cases were authored before any production source, existing test, or previous deterministic audit/remediation artifact was opened.
- The pre-inspection seal is `cases.json` SHA-256 `564064210a382bd41c54913d9cf6edbd4943385f968517a5dfba81827afcb08f`.
- The corpus contains eight families, exactly 32 cases per family: 16 normal/ACCEPT controls and 16 defect/BLOCK controls.
- After sealing, the harness inspected and invoked the current tree at Git HEAD `467c6d107137a91088d3eba1620ba4036a63d709`.
- Production source, existing tests, and older artifacts were not edited. Only this new v8 directory was written.
- No model/API, network, database, or secret access occurred. API candidates consumed: **0**.

The harness scores only each family's dedicated deterministic signal. Unrelated warnings or quality codes are retained in `case-results.json` but cannot manufacture a family pass. Sentence-order probes receive identical neutral padding and a nontrivial answer permutation so generic length and unscrambled-answer gates do not confound the intended split; the sealed probe text itself is unchanged.

## Results by family

| Family | Normal accepted | Defects blocked | Case pass | FP | FN | Verdict |
|---|---:|---:|---:|---:|---:|---|
| SUMMARY_COMPLETE_MC keyed answer-object binding | 16/16 | 0/16 | 16/32 | 0 | 16 | BLOCK |
| Blank explanation: procedural circled steps vs option analysis | 16/16 | 16/16 | 32/32 | 0 | 0 | **PASS** |
| Grammar ghost/nonexistent labels, new rendered forms | 16/16 | 3/16 | 19/32 | 0 | 13 | BLOCK |
| Grammar free-text rule truth | 16/16 | 0/16 | 16/32 | 0 | 16 | BLOCK — known unsupported semantic verifier |
| Sentence-order duplicate structural label in body prose | 16/16 | 0/16 | 16/32 | 0 | 16 | BLOCK |
| Sentence-order dependent fragment vs complete dependent opener | 16/16 | 0/16 | 16/32 | 0 | 16 | BLOCK |
| Exact transformed-answer residue | 16/16 | 16/16 | 32/32 | 0 | 0 | **PASS** |
| BLANK_INFERENCE semantic-role preservation | 16/16 | 0/16 | 16/32 | 0 | 16 | BLOCK |
| **Total** | **128/128** | **35/128** | **163/256** | **0** | **93** | **BLOCK** |

### Bounded PASS evidence

1. Blank explanation option analysis passed all 32 new cases. Real option-content analysis remained unblocked, while all 16 circled procedural sequences emitted the blocking `blank-explanation-narrative-circled-numbering` signal. This is independent of the broader warning code.
2. Exact transformed-answer residue passed all 32 cases. All 16 clean controls abstained and all 16 verbatim residues emitted `blank-answer-residual-visible`.

The focused legacy suite also passed **80/80**. That confirms the older bounded examples still work; it does not override any fresh sealed mismatch.

## Blocking findings

### 1. SUMMARY_COMPLETE_MC keyed object binding: 16 false negatives

All particle-omitted, particle-stacked, nominalized/passive, multi-object/source-phrase, and relative-clause controls were accepted. Every paired defect retained the keyed label but commanded a distractor object, and none emitted `summary-mc-direction-task-mismatch`.

The production validator reads `direction`, blank answers, options, and `correctAnswer`, but does not bind the commanded English object in the explanation/direction utterance back to the keyed option text (`src/lib/question-quality/validators/summary/mc.ts`, initialization at lines 12-16). Its answer-object classifier is instead bounded to distinguishing summary-completion objects from separately scored task objects such as claims/statements (roughly lines 375-458). This is a real scope gap for the sealed oracle, not evidence that the existing task-type classifier regressed.

### 2. Grammar ghost forms: 13 false negatives

The detector blocked `ⓕ`, `⑥`, and `Ⓕ`. It missed these 13 new leading rendered forms:

`（ｆ）`, `⒡`, `𝒇`, `𝔣`, `𝖋`, `ｆ`, `f̲`, `〈f〉`, `［f］`, `❨f❩`, `⁽ᶠ⁾`, `<u>f</u>`, `&#102;`.

All 16 extant-label controls abstained, so this family had no false positives. The current leading-reference parser has a bounded grammar and does not apply a general Unicode/rendered-form canonicalization before comparing against rendered labels (`src/lib/question-quality/validators/grammar/shared.ts`, lines 1058-1145).

### 3. Grammar free-text truth: 16 false negatives, explicitly unsupported

All true-rule controls were accepted, but all paired objectively false rules were also accepted. The current `findGrammarTerminologyError` is a finite high-confidence terminology recognizer; it is not an open-ended English grammar theorem prover. This known unsupported family therefore blocks the aggregate under the oracle rule, but it does **not** erase the two bounded family passes or the partial ghost-label evidence.

No broad truth regex should be inferred from this audit. A safe remediation would require a bounded rule certificate/schema or an independently verified semantic layer.

### 4. Sentence-order body-label contamination: 16 false negatives

All defects place an exact `(A)`, `(B)`, or `(C)` structural token in ordinary body prose rather than at the start. Production intentionally limits `sentence-order-paragraph-body-label` to a leading token to avoid ordinary-prose false positives (`src/lib/question-quality/validators/sentence-order.ts`, lines 95-108). Consequently, every mid-body duplicate survived.

The normal controls and padded native projections emitted no unrelated quality code. This is a clear boundary of the current leading-only certificate.

### 5. Sentence-order dependent fragments: 16 false negatives

The 16 complete dependent openers were correctly left alone. Each paired defect begins with a subordinate fragment terminated by a period; identical neutral complete prose follows only to remove length/thinness confounds. None emitted `sentence-order-dependent-fragment`.

The current helper returns false whenever the paragraph contains `.`, `!`, or `?`, and also limits its certificate to at most ten words and a small subordinator set (`src/lib/question-quality/validators/sentence-order.ts`, lines 214-224). Terminal punctuation therefore lets a syntactically dependent sentence escape. The result preserves the desirable no-false-positive side but fails the defect side of this fresh split.

### 6. BLANK_INFERENCE semantic-role preservation: 16 false negatives

All 16 faithful answers and all 16 corrupted answers have equal whitespace-token counts. Defect distribution is actor 4, polarity 3, condition 3, cause 3, and scope 3. Every faithful control was accepted; every semantic-role corruption was also accepted.

The current semantic preservation helper is a single narrow polarity pattern for “resist the temptation to reduce/simplify/limit/narrow” and its reversal (`src/lib/question-quality/validators/blank/paraphrase.ts`, lines 303-325). It does not generally verify actor identity, negation, necessary conditions, causal direction, or quantifier scope. Token length cannot explain the misses.

## Post-seal literal novelty

The post-seal checker extracted 764 semantic leaf literals (minimum eight characters and two word-like tokens), normalized them with NFKC, lowercase, and whitespace folding, and compared them against every textual artifact in all earlier sibling review directories.

- Prior files: 116
- Prior bytes: 6,652,373
- Comparison-universe SHA-256: `226335a1069e155aaab582b2576929ea513123a55843fe55d08342f90ee5c284`
- Exact normalized matches: **0**
- Novelty verdict: **PASS**

Structural enums, labels, and answer-order tokens are explicitly excluded from the semantic-literal set. Full comparison evidence and every compared file hash are in `novelty.json`.

## Verification

- Sealed corpus: 256 cases, eight balanced families, unique IDs, one normal plus one defect per pair.
- Equal-token semantic-role pairs: 16/16 verified.
- Focused legacy tests: 80 passed, 0 failed, exit status 0.
- Fresh audit replay: deterministic `audit.mts --check` must reproduce 163 pass / 93 fail and every family split.
- `verify.mjs` verifies the seal, manifest, source/test hashes, corpus invariants, family arithmetic, novelty evidence, test log, zero-API safety declaration, and a fresh no-write replay.

Machine-readable details are in `results.json`, `case-results.json`, `novelty.json`, and `source-hashes.json`. `MANIFEST.sha256` is generated only after all payloads are final.

