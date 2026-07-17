# Original S1 v6 corpus

This package seals twelve newly composed English passages for a replacement
S1 v6 screen: six `GRAMMAR_ERROR` sources and six `BLANK_INFERENCE` sources.
The passages were written directly for this user request without web search,
an external API/model call, a source document, or adaptation from an
identifiable passage. Building and verification are offline and consume
`0/1,000` candidate opportunities.

The current seal is `original-s1-v6-remediation-v1`. It supersedes private
artifact `bcb5d768...cabb68` after the preserved independent v1 audit found
four wording defects, three imprecise grammar-affordance labels, and a strong
terminal-thesis bias among recommended blank sites. Remediation was performed
offline without web, API, model, or database access; the original row-bound
rights and campaign processing scope remain unchanged.

## Private/public boundary

- `private/original-passages.private.json` contains the exact passage text,
  type-specific design notes, and row-bound provenance/processing-scope
  records. The directory-local ignore rule prevents the exact-text artifact
  from being tracked. The verifier checks both ignore status and the absence
  of a tracked private file.
- `corpus-public.json` exposes only aggregate dimensions, counts, byte/word
  measurements, SHA-256 commitments, scoped rights/provenance statuses, PII
  scan summaries, local-overlap results, grammar-binding counts, and blank-site
  position/role strata. It contains no passage text, binding excerpt,
  inferential hinge, proposed blank, correction, or distractor notes.
- `MANIFEST.sha256` binds every package file, including the ignored private
  artifact, without publishing its contents.

Each private row records that it is a new composition, was not copied or
adapted, cites no third-party source, claims no third-party permission, and is
permitted by the requesting user only for the named S1 v6 external-model
question-generation evaluation. That permission is limited to the exact
passage plus the frozen campaign context and remains conditional on separate
privacy, provider allow-list, limited-credential, fresh-price, spend-cap,
physical-call, controller-registry, and exact-wire gates. The corpus package
alone does **not** authorize dispatch, production use, publication, resale,
training, or reuse in another campaign.

## Offline evidence

The builder validates the 6/6 type split, unique topic families, discourse and
syntax/word-band coverage, type-specific suitability notes, exact blank-unit
binding, ASCII one-paragraph form, and row-level provenance invariants. Each of
the thirty grammar affordances is now bound to a unique exact excerpt and
sentence number. Blank design validation requires both difficulty levels,
checks the declared sentence position, and applies a conservative post-blank
content-overlap screen. The current distribution is five internal sites and
one terminal site; three internal sites are contrast/counterexample pivots and
one is an anaphoric causal bridge. A
conservative machine scan checks common email, URL, handle, phone, IP, long
number, and resident-number patterns in addition to the row-level manual PII
observation record.

Originality checks compare five-token sequences across all new rows and
eight-token sequences plus exact normalized text against two sealed local
selected sets: the twelve v5 S1 selections and the fifty-seven retained v3
selections. Normal build and verification read only a package-local ignored
fixture containing SHA-256 hashes of normalized passages and eight-token
windows; it contains no exact reference passage or n-gram text. Public output
contains only counts and commitments to those reference sets.

`refresh-local-reference-fixture.mts` is the only generation-only command that
reads the two external ignored source artifacts. It is not imported or invoked
by normal build/verify. Run it only when deliberately refreshing the reference
sets, then review and reseal the resulting private fixture and manifest.

These records are engineering evidence, not legal advice or a legal opinion.
Local overlap checks cannot prove global uniqueness, copyrightability,
ownership, or non-infringement. Pattern scanning cannot prove that every
possible identifier is absent. No third-party permission is represented
because no third-party source was intentionally used or adapted. A separate
legal or policy review may still be required by the operator.

## Reproduce and verify

```powershell
npx.cmd tsx experiments/question-quality-20260715/corpus/original-s1-v6/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/corpus/original-s1-v6/build.mts
npx.cmd tsx experiments/question-quality-20260715/corpus/original-s1-v6/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/corpus/original-s1-v6/tsconfig.json --noEmit
```

The commands read only local files. They make no network, database, provider,
or model request.
