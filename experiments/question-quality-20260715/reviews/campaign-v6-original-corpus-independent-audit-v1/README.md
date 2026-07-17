# Campaign v6 original corpus — independent source-aware audit v1

This audit reads the ignored exact-text corpus directly and does not import or
trust the source package's builder. It independently checks the twelve rows,
the 6/6 type split, sentence/word measurements, rights/scope record shape, PII
patterns, public leakage, Git ignore/tracking state, source manifest, and local
text overlap. A human adversarial review covers every one of the 127 sentences
for grammaticality, naturalness, coherence, exam suitability, grammar-error
affordances, and blank-inference design.

The exact row findings and broad repository-overlap capture are private and
directory-ignored. The public artifact publishes only counts, row IDs,
categorical dispositions, hashes, and methodological limits. It contains no
passage, hinge, proposed answer unit, correction, or quoted finding.

## Verdict

`BLOCK_UNCONDITIONAL_S1_V6_ADMISSION_PENDING_TEXT_METADATA_DIFFICULTY_AND_BLANK_POSITION_REMEDIATION`

There is no pre-existing grammatical error, PII hit, content contradiction, or
eight-token overlap in the examined material. The block is a quality bar, not
a rights accusation: four rows contain avoidable non-idiomatic/semantic-agent
wording under a strict clean-source standard; one of those also reveals its
recommended blank thesis again after the blank. Three grammar rows contain an
imprecise affordance label. One otherwise sound blank row should default to
intermediate difficulty unless a close-paraphrase option gate passes. In
addition, five of six recommended blank units are final or penultimate; the
only middle unit is itself blocked by a later thesis restatement. This is an
external-validity block for a general S1 screen, because internal argumentative
pivots, contrast/counterexample bridges, and anaphoric internal slots are not
represented by a clean unrestricted row.

The source builder is reproducible in this workspace but is not hermetic: its
overlap calculation reads two ignored private artifacts outside the package,
and those dependency files are not members of the source manifest. The public
source artifact commits the derived normalized sets, which detects meaningful
drift, but a clean checkout without those private files cannot rerun the build.
This is reported as a reproducibility limitation, not a passage-rights failure.

The source package correctly keeps `generationAuthorized=false`. This audit
does not authorize provider dispatch. Provider privacy, route, credential,
pricing, budget, physical-call, and exact-controller gates remain separate.

## Reproduce

```powershell
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1/capture-overlap.mts
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1/build.mts
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1/tsconfig.json --noEmit
```

All commands are local-only. The overlap capture scans repository text files
while excluding dependency/build caches, this audit directory, and the source
corpus directory itself. It performs no web, API, model, or database call.
