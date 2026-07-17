# Migration rationale: invalidated v1 to candidate v2

This document is a design rationale, not adjudicated gold.

Packet v1 remains byte-preserved and invalidated for certification. Its sealed
rater-1 work and still-blind rater-2 work were used only to identify failure
families. Their hashes are recorded in `packet-public.json`; no v1 answer,
grade, or review record is imported into a v2 oracle or certificate.

## Protocol repair

V1 coupled answer multiplicity to option labels. A reviewer who found two full
constructed answers could not state that judgment without fabricating labels.
V2 replaces the coupled fields with six mutually exclusive answer variants.
Exact text bytes and individual hashes remain visible and immutable, while the
answer-set hash sorts member identities so a true set is order-insensitive.
Whitespace-equivalent duplicates, repeated accepted sets, label/text domain
mixing, and a canonical answer missing from its accepted sets fail validation.

Issuance maps only real option or inline-marker labels. Seal validation enforces
the issued label mode. Each phase-one record hash includes pseudonym, surface,
answer union, and confidence, so a record copied across items cannot retain its
binding. Reveal re-hashes every relabeled set. Review and gold schemas carry the
same union rather than flattening constructed text into labels. Final gold also
binds the fresh adjudicator's exact answer and set hash. Certificate scoring
loads the fixed private gold artifact and refuses oracle injection.

## Content repair informed by the blind audits

All 24 v2 rows are new direct-original local compositions. The identified v1
failure patterns were not patched by changing stored labels in place:

- alternative sentence order was replaced with unique anaphoric sequencing;
- the open word-order task now mandates an initial chunk, removing the
  fronted/postposed ambiguity;
- condition transformations enumerate every accepted full sentence without
  reversing polarity;
- all eight grammar surfaces have exactly one ungrammatical marked site;
- the grammar-combination task has exactly one grammatical pair;
- a two-output correction task uses `MULTIPLE_TEXTS`, preserving both complete
  corrections rather than omitting one or inventing labels;
- every blank option is grammatical in the shared slot and normalized option
  texts are distinct;
- stored explanations no longer cross-map displayed labels after permutation;
- explanations that are intentionally defective in private author-`F`
  hypotheses name the keyed label but state a separately reviewable false rule;
  other intentional `F` hypotheses use answer-key or leakage defects.

These are author assertions only. Fresh independent blind reviewers and a fresh
adjudicator must still decide whether the repairs hold and whether the truthful
grade composition remains eligible.

