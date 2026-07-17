# S1 v6 corpus independent v2 audit

This package is a fresh audit of the sealed `original-s1-v6-remediation-v1`
corpus. The reviewer did not author the corpus or its remediation and read all
12 exact private passages sentence by sentence before recording judgments.
The ignored manual record binds all 127 sentences, every row-level
authorship/processing-scope/PII record, all 30 grammar affordance bindings, and
all six blank targets without publishing exact text or row membership.

The grammar review checks that each named mechanism is actually present at its
declared sentence and unique anchor. The blank review separately adjudicates
intermediate and killer viability, answer uniqueness, site position and role,
and whether later prose contains a substitutable near-answer restatement. The
result is five internal targets and one terminal target, including three
internal contrast/counterexample pivots and one anaphoric causal bridge. Later
prose applies, exemplifies, or qualifies the internal targets; it does not
repeat a full answer proposition in a later single sentence.

Originality evidence is deliberately limited. A new independent filesystem
walker scans all declared text extensions under the repository, including
ignored experimental files, while excluding the source and prior audit
packages themselves plus build/cache dependency directories. Six exact
downstream generated artifact paths (campaign/preflight public artifacts,
manifests, and ignored private artifacts) are also transparently excluded to
avoid measuring authorized self-derivation or creating an audit-to-campaign
hash cycle. The public audit records every exact path, its source-bound
exclusion-rule SHA-256, and the reason; campaign and preflight source code is
still scanned. The walker compares
eight-token windows in memory, persists no source or target n-gram text, and
found zero hit files. The package also independently rechecks cross-row
five-token overlap, the package-local hash-only historical reference fixture,
and 12-token public leakage. These are local engineering checks, not proof of
global originality, copyright ownership, or non-infringement.

Normal source build/verify/typecheck and remediation build/typecheck commands
are rerun with a secret-free child environment. The sealed legacy remediation
verifier is not rerun after campaign derivation because its repository scanner
incorrectly treats the campaign's own generated private queue as antecedent
overlap. That one stale scope assertion is transparently superseded by this
audit's exact path+rule-hash exclusions and reproducible broad rescan; all
remediation manifests, semantic checks, leakage, rights, PII, and seals remain
validated. Ten in-memory tamper cases must all be rejected:
passage bytes, PII, rights scope, public row commitment, missing adjudication,
grammar anchor sentence, blank position, fixture plaintext shape, repository
overlap, and corpus revision. The generation-only reference fixture refresher
is never invoked.

Reproduce locally:

```powershell
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/capture-repo-overlap.mts --write
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/build.mts
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/verify.mts --rescan
npx.cmd tsx experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/verify.mts --rescan --require-inventory-identity
npx.cmd tsc -p experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/tsconfig.json --noEmit
```

The audit passes corpus quality and structure only. It does not authorize
external dispatch. Provider privacy, dedicated credential, fresh pricing,
spend/call caps, exact-wire, generated-question quality, and explicit approval
remain separate gates. API, network, provider/model, database, and real-secret
use are zero.

The sealed inventory is immutable evidence of the capture-time repository
walk. A later `--rescan` always requires the same source corpus and exclusion
policy and fails on any current overlap hit, but it reports unrelated inventory
drift instead of rewriting history. Add `--require-inventory-identity` only
inside a coordinated whole-repository freeze when exact file/byte/hash identity
is the intended freshness assertion. Downstream campaign admission separately
binds the current quality/runtime/profile source closure, so unrelated files do
not silently change the production evidence surface.
