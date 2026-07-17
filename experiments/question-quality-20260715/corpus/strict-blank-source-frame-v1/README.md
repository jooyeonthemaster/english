# Strict blank source frame v1

This artifact binds the exact 59-row `focus-blank-killer` frame from the immutable v3 snapshot to public content hashes and a git-ignored private identifier map. It performs no new DB, model, API, or network call.

The binding is deliberately **not execution authorization**:

- all 59 rows satisfy the frozen automatic official-source, reviewed, high-confidence, restored-central-span, historical-exclusion, and near-duplicate gates;
- all 59 still have `manualPassageIntegrity=UNREVIEWED`;
- the source snapshot records no rights/license field, so this artifact makes no legal conclusion;
- because the reduced design consumes all 59 rows, one manual exclusion forces a queue redesign rather than a silent replacement.

Rebuild with:

```powershell
npx tsx experiments/question-quality-20260715/corpus/strict-blank-source-frame-v1/build.mts
```

The public JSON contains no passage text, candidate ID, database ID, academy ID, or source record ID. Those identifiers are kept only in the git-ignored private map.
