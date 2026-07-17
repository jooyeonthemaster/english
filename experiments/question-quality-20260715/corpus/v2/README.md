# Corpus v2: strict, disjoint audit queues

This selector builds candidate queues for the 2026-07-15 question-quality study. It does not generate questions, call a model, certify passages, or write to the database.

## What it produces

- General dev/holdout retain only the existing two-rater adjudicated `PASS` representatives.
- General replacement queues are sized from the observed v1 pass rates: dev needs 28 certified replacements and queues 53 candidates; holdout needs 35 and queues 84.
- KILLER grammar focus queues 60 primary plus 105 reserve candidates. The 165 total is `ceil(60 / (19/52))`, using the observed strict holdout grammar pass rate.
- KILLER blank focus queues 60 primary plus 83 reserve candidates. The 143 total is `ceil(60 / (19/45))`, using the observed strict holdout blank pass rate.

Every new row remains `CLEAN_CANDIDATE`, not a certified passage. It is unusable for generation until two independent passage audits and adjudication pass.

## Hard gates

New candidates must have zero prior `Question`, AI `Question`, and `WorkbenchAiJob` rows across every same-content passage in **all academies**. All globally prior-used DB passage texts are also added to the near-duplicate exclusion index. DB candidate supply itself remains limited to the configured research academy, and DB-origin candidates additionally require `reviewedAt`; there is no relaxed tier. Repository candidates require high confidence and no deliberate source error.

General and grammar candidates require `reconstructionKind=none`. Blank focus alone may use official, high-confidence `reconstructionKind=blank` passages: that repository label records restoration of the source blank, not free generation. These candidates still receive the same two-review gate.

Separation checks include:

- exact normalized SHA-256;
- markup/blank/boilerplate-stripped comparison SHA-256;
- overlapping source-document question ranges;
- adjacent source fragments with shared 12-token runs;
- 5-token Jaccard or containment;
- long contiguous 12-token overlap even below the Jaccard threshold.

The comparison set contains every selected panel, the 7/15 dawn passages, the grammar corpus, and passage IDs/text extracted recursively from `experiments/**/*.json{,l}` and `scripts/**/*.json{,l}`. The output records source-document metadata and exclusion diagnostics.

## Commands

Dry-run is the default:

```powershell
npx tsx experiments/question-quality-20260715/corpus/v2/select-corpus-v2.ts
```

Create the v2 artifacts:

```powershell
npx tsx experiments/question-quality-20260715/corpus/v2/select-corpus-v2.ts --write
```

`--write` creates `manifest-public.json`, `private/manifest-private.json`, and `historical-exposure-public.json`. It refuses to overwrite any existing output. `--no-db` is diagnostic only: because DB exposure cannot be proven, every new queue correctly reports a shortfall.

Verification:

```powershell
npx tsx --test experiments/question-quality-20260715/corpus/v2/selector-v2.test.ts
npx tsc --noEmit --pretty false
npx eslint experiments/question-quality-20260715/corpus/v2/*.ts
```
