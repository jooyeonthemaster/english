# Reviewer calibration packet v1

Status: **SEALED CANDIDATE PACKET / GOLD_ADJUDICATION_PENDING / NO REVIEWER CERTIFICATION**

This package contains 24 newly written, local-only calibration items for the
question-quality study. It makes fatal validity and `F/C/B/A` craft boundaries
reviewable without treating the author's construction intent as truth.

No provider, model API, network, database, or secret was used. These items are
not newly generated production candidates and consume `0/1,000` candidate
opportunities.

## Composition and claim boundary

- 8 `GRAMMAR_ERROR` items;
- 8 `BLANK_INFERENCE` items;
- 8 nonfocus items spanning all seven evidence families;
- within each block, two author hypotheses in each `F/C/B/A` stratum;
- 24 distinct topic tags;
- zero normalized exact or eight-word overlap with the current twelve-row S1
  original corpus, and zero eight-word overlap between calibration rows.

The author strata are deliberately private. They are only construction
hypotheses. `private/gold.private.json` remains
`GOLD_ADJUDICATION_PENDING`, contains no final label, and records zero completed
independent reviews. If adjudication does not retain two `F/C/B/A` cases in
each block, the packet must be remediated and adjudicated again; labels must
never be forced to preserve the planned balance.

`finalGoldSchema` accepts the truthful adjudicated distribution. A separate
certificate-issuance check raises `PACKET_COMPOSITION_INELIGIBLE` when that
truthful result no longer provides the planned two examples per grade and two
fatals per block; the remedy is a new packet version, never relabeling gold.

Passing this packet can eventually certify the two focus modules and familiarity
with seven nonfocus evidence families. It cannot certify expertise in all 23
nonfocus types. A supplemental type-specific calibration remains required
before S3.

## Rights and privacy

Every row was composed directly for this request without a source document,
web search, external API, database, or adaptation. Each row permits local Codex
agent review for this calibration workflow, but forbids external-provider API
dispatch, publication, resale, training, and unrelated reuse. A conservative
pattern scan found no common identifier shape, and each row carries a manual
no-PII observation.

Exact questions, source bindings, author hypotheses, pending gold, and future
corpus-exclusion commitments are gitignored under `private/`. The public
artifact exposes only counts, hashes, provenance status, overlap results, and
upstream contract bindings.

## Two-phase blind workflow

`reveal.mts` implements a fail-closed sequence:

1. Issue a reviewer-specific packet with deterministic item ordering and
   independent answer-label permutations. Phase 1 contains only the student
   surface.
2. Accept exactly one response for every pseudonym, validate answer cardinality
   and labels, and seal the complete response hash.
3. Reveal source binding, stored key, explanation, and scoring contract only
   when the packet, response, seal, and private relabel map all match.
4. Keep the sealed blind answer immutable in every post-reveal review record.

All output paths accepted by the CLI are restricted to this package's private
directory.

## Gold and scoring

Final gold requires two distinct independent-review hashes and one fresh
adjudicator solve plus adjudication hash for every item. The adjudicator must
solve the relabeled surface before seeing either rationale. The scorer loads
the sealed private oracle itself and refuses the current pending file; callers
cannot pass an arbitrary gold object or oracle hash to obtain a certificate.

Metrics are evaluated per reviewer against final gold, never against pair
consensus. Missing values or zero denominators fail. Thresholds operate on raw
ratios, not rounded displays. The fixed candidate balance would imply at least
22/24 exact fatal judgments, all 6 fatal detections, and at least 16/18
nonfatal detections, but final scoring is unavailable until independent gold
exists.

Blind-solve exact agreement, fatal classification, grade QWK, grammar site
diagnoses, blank seam/axis diagnoses, and block-level gates are all
non-compensatory. Blind-solve requires at least `9/10` globally and `7/8` in
every block.
Required focus diagnostic arrays must be exactly `A-E` or `1-5`; completeness
is derived from five required atomic values per grammar site, five per blank
option, and `answerPreserved` for all seven proposition axes rather than
reviewer self-report. Every threshold is stored as an integer fraction and
evaluated by cross multiplication; displayed decimals never decide a result.

## Reproduce locally

```powershell
npx.cmd tsx experiments/question-quality-20260715/design/reviewer-calibration-packet-v1/build.mts --write
node experiments/question-quality-20260715/design/reviewer-calibration-packet-v1/finalize-manifest.mjs
npx.cmd tsx experiments/question-quality-20260715/design/reviewer-calibration-packet-v1/build.mts
npx.cmd tsx experiments/question-quality-20260715/design/reviewer-calibration-packet-v1/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/design/reviewer-calibration-packet-v1/tsconfig.json --noEmit
```

The build and verification commands are offline. Normal replay does not alter
the gold state or create review records.
