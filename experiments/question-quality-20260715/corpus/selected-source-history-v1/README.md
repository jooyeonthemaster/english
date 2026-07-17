# Selected-source generation-history refresh

This read-only preflight binds the frozen grammar and blank source selections
to the current production database state. It answers one narrow question:
has any selected passage accumulated a `Question` or `WorkbenchAiJob` since
the pinned corpus snapshot?

It deliberately does not scan the campaign's own corpus/review artifacts as
"history". Those files contain prospective passages by construction and are
not antecedent model exposure. The pinned snapshot already sealed antecedent
repository history; this refresh measures the mutable production-DB delta.

```powershell
npx tsx experiments/question-quality-20260715/corpus/selected-source-history-v1/refresh.mts --label baseline-20260715 --write
```

- Only `Passage.findMany`, `Question.groupBy`, and
  `WorkbenchAiJob.groupBy` are used through the existing v3 read-only loader.
- Private rows contain frame IDs/content hashes and stay under `private/`.
- Public rows contain aggregates and cryptographic bindings only—no passage,
  database, academy, document, or frame identifiers.
- A refresh never authorizes generation. Rights, provider controls, a limited
  key, price freshness, operational queue sealing, and independent review
  remain separate holds.
- Run labels are immutable. A later pre-dispatch check must use a new label;
  old evidence is never overwritten.

