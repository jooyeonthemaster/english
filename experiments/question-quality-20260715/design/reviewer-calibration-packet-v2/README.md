# Reviewer calibration packet v2

Status: **SEALED CANDIDATE / GOLD_ADJUDICATION_PENDING / NO REVIEWER CERTIFICATION**

This is the fresh replacement for invalidated packet v1. It contains 24 directly
written local items: eight grammar, eight blank-inference, and eight nonfocus.
No v1 solve, review, author stratum, or planned distribution is treated as gold.
No reviewer packet has been issued from v2.

## Response contract

Blind answers are a strict discriminated union:

- `SINGLE_LABEL` and `MULTIPLE_LABELS` for displayed choices;
- `SINGLE_TEXT` and `MULTIPLE_TEXTS` for full constructed responses;
- `NO_ANSWER` and `UNEVALUABLE` for empty answer states.

Every full text carries its exact SHA-256 and a normalized-text duplicate guard.
Every answer set carries an order-insensitive set hash. Constructed items reject
all labels, including invented labels such as `INITIAL_ONLY`. Accepted
equivalence sets are explicit answer-union values, not loose strings.

The exact answer, text hashes, set hash, item pseudonym, surface hash, relabel
map, phase-one record hash, submission hash, seal, reveal, review record,
adjudicator solve, final label, scorer input, and certificate are bound through
the protocol. The scorer reads only the fixed private gold path; caller-supplied
gold or oracle fields are rejected.

## Claim boundary

The private `F/C/B/A` strata and self-audit are author construction hypotheses.
They are not certification evidence. Final gold may truthfully differ. The
final-gold schema stores that result without forcing balance; a separate
issuance gate returns `PACKET_COMPOSITION_INELIGIBLE` if the resulting packet
does not retain the planned calibration coverage. The remedy is a new packet,
never relabeling adjudicated truth.

The packet authorizes only local independent Codex-agent review for this
campaign. It forbids external-provider dispatch, publication, resale, training,
and unrelated reuse. It consumed zero model/API candidates, network calls,
database calls, or secret reads.

## Offline reproduction

```powershell
npx.cmd tsx experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/build.mts
npx.cmd tsx experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/tsconfig.json --noEmit
node experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/finalize-manifest.mjs
```

Normal replay creates no issue, review, reveal, adjudication, gold, or
certificate record.

