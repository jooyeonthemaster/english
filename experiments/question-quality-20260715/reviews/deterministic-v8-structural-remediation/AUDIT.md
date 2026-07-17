# v8 bounded structural remediation

Date: 2026-07-15 KST  
Verdict: **PASS_POST_FIT_REPLAY_ONLY / GLOBAL_BLOCK_REMAINS**

## Scope

This remediation covers four high-confidence structural families exposed by the
sealed v8 audit:

- `SUMMARY_COMPLETE_MC`: an explicit choice/answer assertion names a visible
  option surface that disagrees with `correctAnswer`.
- grammar key points: a Unicode/rendered leading label names no visible
  underline.
- `SENTENCE_ORDER`: a paragraph body repeats a structural `(A)/(B)/(C)` label.
- `SENTENCE_ORDER`: a punctuated subordinate fragment is padded by later prose.

It does **not** claim to solve the two semantic families that remain open:
free-text grammar-rule truth and blank actor/polarity/condition/cause/scope
preservation. Those require the separately designed blind certificates and
fresh truth holdouts.

## Changes

- Summary answer-object binding uses unique full option surfaces, a bounded
  selection predicate, token boundaries, and explicit rejection context. It
  abstains on duplicate/short surfaces and on comparison-only mentions.
- Grammar label comparison normalizes NFKC compatibility forms, combining
  marks, bracket variants, a bounded underline wrapper, and safe numeric HTML
  entities before comparing the leading key-point reference with actual
  rendered labels.
- Sentence-order validation rejects standalone structural labels anywhere in
  paragraph bodies while preserving quoted tokens, formulae, and embedded
  lexical notation.
- Sentence-order validation inspects each bounded sentence independently, so a
  period after a dependent clause and a later padding sentence cannot hide the
  fragment. Sentence-initial demonstrative `That` remains a normal control.

## Evidence

- Frozen v8 replay for these four families: **128/128**, FN 0, FP 0.
- Focused summary/grammar/sentence-order tests: **35/35 PASS**.
- Broad grammar regression after replacing an obsolete filler-decoy fixture
  with a genuinely judgeable fifth site: **106/106 PASS**.
- Targeted ESLint: PASS.
- Full `tsc --noEmit`: PASS.

The frozen-v8 result is post-fit. In particular, the original v8 summary audit
projection used a fixed pair question and did not bind its sealed choices or
key. This remediation replay corrects that projection by calling the production
answer-object binder with the sealed five choices and sealed key. It is evidence
that the observed family was repaired, not an independent estimate.

## Safety and status

Model/API calls 0, network calls 0, DB calls 0. Campaign candidates remain
0/1,000. A fresh independently authored v9 audit is required. The global gate
remains BLOCK because grammar truth and blank semantic-role preservation are
still design-only.

