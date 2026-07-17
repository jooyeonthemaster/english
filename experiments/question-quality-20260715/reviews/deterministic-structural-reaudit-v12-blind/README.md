# Deterministic Structural Reaudit v12 — Blind Holdout

This artifact is an independently authored, source-aware holdout for the current production question-quality validator and relaxed production blocking policy.

## Independence and safety

- Authoring used current production validator, contract, and source code only.
- The v9/v10/v11 corpus, oracle, case payloads, and builders were not read or reused.
- The only inherited public constraints were that a WORD_ORDER control must not copy its model answer from the source and every SENTENCE_ORDER control block must satisfy the production minimum of two sentences and 24 words.
- No API/OpenRouter call, network access, database access, or production-source edit occurred.
- The corpus and oracle are serialized and SHA-256 sealed before `run-audit.mts` dynamically loads and executes the production validator.

## Design

The sealed corpus contains 64 validation families, three lexical variants per family, and a defect/control member for every variant: 384 cases and 192 exact pairs. Coverage includes generic option/type integrity, WORD_ORDER, FILL_BLANK_KEY, SUMMARY_COMPLETE, SENTENCE_ORDER, single- and multi-blank inference, GRAMMAR_ERROR, GRAMMAR_CORRECTION, and SENTENCE_INSERT.

Every control receives two independent checks:

1. the current production validator and relaxed production blocking policy;
2. a family-specific source-aware audit for source backing, answer synchronization, reconstruction, marker counts, and visible answer leakage.

Target-code exactness and production-blocking behavior are reported separately. This prevents a validator that emits the right error but fails to place it in the relaxed shipping blocklist from being counted as operationally safe.

## Final result

- Target-code exactness: TP 192, TN 192, FP 0, FN 0 (sensitivity 1.0, specificity 1.0).
- Source-aware control validity: 192/192.
- Production blocking against the presealed structural oracle: TP 138, TN 195, FP 0, FN 51 (sensitivity 0.7301587, specificity 1.0).
- Seventeen structural `error` codes are emitted correctly but absent from `RELAXED_BLOCKING_QUALITY_CODES`; each escaped in all three lexical variants.
- `blank-target-list-like` is separately preclassified as a deliberate craft warning, not a structural blocking expectation.

The 17 policy-gap codes are listed in [REPORT.md](./REPORT.md) and machine-readable in `results.json`. This artifact does not change production policy; it isolates the evidence required for a separately reviewed remediation.

## Reproduction

Run from the repository root:

```powershell
node experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/build-corpus.mjs --write
npx.cmd tsx experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/run-audit.mts --write
node --test experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/audit.test.mjs
npx.cmd tsc -p experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/tsconfig.json --noEmit --pretty false
npx.cmd eslint experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/build-corpus.mjs experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/run-audit.mts experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/audit.test.mjs experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/finalize-manifest.mjs experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/verify.mjs
node experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/finalize-manifest.mjs
node experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind/verify.mjs
```

`run-audit.mts` intentionally exits with status 2 for the recorded `PARTIAL` verdict because the blocklist-policy gap is real. It still writes complete results and the report when `--write` is supplied.
