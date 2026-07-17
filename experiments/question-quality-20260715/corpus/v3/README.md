# Corpus v3: pinned, stratified, audit-first supply

This directory is a separate successor to v2. It does not modify v1/v2 and it
does not authorize model calls or generation-budget initialization.

## Frozen design

1. `snapshot-v3.ts` performs SELECT-only, all-academy DB extraction and freezes
   the repository, history, DB, Git, code, and as-of hashes before selection.
2. `select-corpus-v3.ts` reads only that private snapshot. It uses exact/near
   separation against all antecedent artifacts and every already allocated
   panel, including retained PASS rows.
3. Queue sizes use a one-sided 95% Clopper-Pearson lower bound and the smallest
   binomial queue whose probability of attaining the pass target is at least
   95%. A supply shortfall is a hard failure; targets are never divided by a
   raw pass rate or weakened to fit supply.
4. `prepare-audit-packet-v3.ts` runs only after successful preflight. Blind
   items contain exactly `blindId` and `passage`; target, source, origin, and
   identifiers stay in ignored sealed staging.
5. Two independent, attested audits and adjudication of every disagreement are
   required. Unreviewed items are unusable. Finalization walks each frozen
   panel queue in sequence and stops exactly at its certified target.
6. `verify-v3.ts` rebuilds the result from the pinned snapshot and separately
   checks live code/repository/history/DB drift. Either failure is blocking.

## Certified targets

- Grammar killer: 66 newly audited PASS passages.
- Blank killer: 66 newly audited PASS passages.
- General dev and holdout: exactly 33 DB + 33 repository PASS passages per
  split, combining the frozen retained baseline with new audited PASS rows.

Retained baseline: dev DB 10/repo 22; holdout DB 4/repo 21. Therefore the new
general targets are dev DB 23/repo 11 and holdout DB 29/repo 12.

## Commands

```powershell
npx tsx experiments/question-quality-20260715/corpus/v3/snapshot-v3.ts --as-of 2026-07-15T12:00:00+09:00 --write
npx tsx experiments/question-quality-20260715/corpus/v3/select-corpus-v3.ts --write
npx tsx experiments/question-quality-20260715/corpus/v3/verify-v3.ts
npx tsx experiments/question-quality-20260715/corpus/v3/prepare-audit-packet-v3.ts
npx tsx --test experiments/question-quality-20260715/corpus/v3/*.test.ts
```

Every write is exclusive. Delete/rebuild staging deliberately rather than
silently overwriting an audit lineage.
