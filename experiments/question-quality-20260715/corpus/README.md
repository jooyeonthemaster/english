# Frozen corpus selector

This directory builds the candidate passage panel for the 2026-07-15 question-quality study. The selector is deliberately **dry-run by default** and performs no model calls. Its production database access is restricted to Prisma `findMany`/`groupBy` reads.

## Commands

```powershell
npx tsx experiments/question-quality-20260715/corpus/select-corpus.ts
node --import tsx --test experiments/question-quality-20260715/corpus/selector.test.ts
npx tsx experiments/question-quality-20260715/corpus/select-corpus.ts --write
```

Use `--academy-id <id>` or `CORPUS_ACADEMY_ID` to override the isolated research academy. `--no-db` is an offline diagnostic and intentionally reports all DB quotas as shortfalls.

`--write` creates:

- `manifest-public.json`: IDs, normalized SHA-256 hashes, strata, automatic integrity flags, prior-use counts, and pending manual-audit state. It contains no passage text.
- `private/manifest-private.json`: the same records plus passage content for the harness.
- `robustness-queue.json`: public metadata for up to 20 intentionally noisy or edge candidates.
- `schedule-template.json`: deterministic rotations for 25 active UI types × 2 plans × 3 difficulties on both dev and holdout.

The label `CLEAN_CANDIDATE` is not a quality certification. It only means that limited automatic checks did not find obvious length, language, punctuation, OCR, delimiter, control-character, or source-scaffold corruption. Every core passage still requires two independent manual audits before generation.

