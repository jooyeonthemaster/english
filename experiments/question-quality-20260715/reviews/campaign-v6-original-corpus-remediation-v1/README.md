# Campaign v6 original corpus remediation v1

This package implements and seals the findings of the preserved independent
audit `campaign-v6-original-corpus-independent-audit-v1`. Exact before/after
row rationales and the repository-wide overlap evidence are private and
directory-ignored. The public artifact contains only categorical changes,
counts, row IDs, structural strata, and cryptographic commitments.

## Result

`PASS_REMEDIATED_CORPUS_QUALITY_AND_STRUCTURE_GATES_NOT_EXTERNAL_DISPATCH_AUTHORIZATION`

- Four audit-identified wording defects were corrected without changing each
  passage's intended claim.
- All thirty grammar affordances are bound to a unique exact excerpt and
  sentence number. The G03, G04, and G05 category errors are corrected.
- Recommended blank sites changed from four terminal, one late, and one middle
  to five internal and one terminal. Three internal sites are
  contrast/counterexample pivots and one is an anaphoric causal bridge.
- Every blank row records both intermediate and killer affordances. B02 now
  synthesizes paired evidence internally rather than repeating a terminal
  thesis; B05's later near-restatement was removed.
- Rights/provenance commitments are unchanged for all twelve rows. The corpus
  remains original-composition scoped, PII-clear under the stated checks, and
  `generationAuthorized=false`.

This seal is a corpus-quality result only. It does not satisfy or replace the
provider privacy, allow-list, dedicated credential, live pricing, hard spend,
physical-call, exact-controller, or generation-quality gates.

## Reproduce

```powershell
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/capture-overlap.mts
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/build.mts
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/tsconfig.json --noEmit
```

All commands are local-only. No web, API, model, or database request is made.
Normal source build/verify is now hermetic with respect to historical overlap:
it reads a package-local ignored fixture containing only normalized-passage and
eight-token SHA-256 hashes. A separate generation-only refresher is the sole
reader of the two external ignored inputs and is never imported or invoked by
normal build/verify.
