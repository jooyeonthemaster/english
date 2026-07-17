# Prompt-profile negative-evidence audit v1

## Verdict

**G3 defect confirmed and remediated offline. B3 overclaim corrected; literal seam claims remain non-evidentiary. Live campaign evidence: none.**

This audit used zero API candidates, zero external network calls, zero application-DB operations, and no secrets. It does not authorize S1 execution or promote any prompt profile.

## G3: the defect was real

The pre-fix G3 JSON Schema exposed `certificationStatus = CERTIFIED | NO_SAFE_SITE`, but both branches shared the same required object. Even a `NO_SAFE_SITE` response had to contain:

- all ten certificate bindings, including a mutation and `mutationOnlyCertifiedSite=true`; and
- all ten completed-question fields, including five marked expressions, answer data, and explanations.

Consequently, a genuine abstention failed structured parsing before raw-candidate observation. The prompt invited abstention while the schema made it unreachable. That is methodological coercion: a model could comply only by inventing a certificate/question shell or by failing the call.

The remediation keeps a single provider object and introduces no `anyOf` or `oneOf`. The provider surface now requires only `siteCertificate` and `certificationStatus`. Server-side conditional refinement then enforces two disjoint outcomes:

- `NO_SAFE_SITE`: requires a nonblank `abstentionReason`, forbids every certificate binding, and forbids every completed-question field.
- `CERTIFIED`: forbids `abstentionReason` and reparses the candidate against the original complete certificate and complete question schema.

After structured parsing, the raw minimal abstention is observed once by the research runtime, the adapter returns `parsed_rejected`, and neither postprocessing nor shipment occurs. A certified candidate still passes only with all required fields and then faces the existing exact passage/marker binding checks.

The dynamic verifier covers one valid minimal abstention, five hostile abstentions, deletion of each of ten completed-question fields, deletion of each of ten certificate bindings, certified exact binding, and adapter-level abstention rejection.

## Exact production flow

```text
profile Zod schema
  -> provider JSON Schema / AI SDK structured parser
  -> raw candidate observation
  -> G3/B3 profile adapter
  -> production postprocess
  -> production quality validators
  -> terminal parsed_accepted or parsed_rejected
```

The source trace matters. A schema-invalid `CERTIFIED` object never becomes a candidate. A schema-valid `NO_SAFE_SITE` object does become negative evidence and is rejected before finalization. For B3, the adapter validates exact target/evidence bindings, visible option-to-ledger text/label bindings, answer-key binding, and distinct declared primary mechanisms. It does not inspect `seamAudit`.

## B3: what is and is not recomputed

The three `seamAudit` fields remain `literal(true)` as a model planning/checklist treatment. They are not server attestations and are not trusted by the adapter. The prompt's former statement that the gate “recalculates this combination” was too broad, so it now names the limited coverage and explicitly reserves the rest for independent adjudication.

After the adapter, `blankBlueprint` is serialized into the internal `blankDesign` field. The blank postprocessor removes that field, constructs the actual `passageWithBlank`, and the quality layer runs on student-visible options. High-confidence deterministic seam rules currently block:

- relative-clause tail number mismatches;
- finite-tail subject agreement mismatches;
- duplicated boundary connectors, prepositions, or punctuation; and
- fixed `a/an` sound mismatches.

Other blank validators add contextual syntax, polarity, option-length, lexical, and paraphrase heuristics. None of these constitute a complete English parser or semantic proof.

The adversarial fixture makes the boundary explicit. It keeps all three `seamAudit` values true and synchronizes the visible option with its ledger row, so the B3 adapter accepts it. One option nevertheless repeats the period already outside the blank; the actual quality gate recomputes and blocks `blank-double-punctuation-boundary`. A second fixture keeps a clean grammatical seam but reverses the passage thesis. The adapter accepts it and the seam analyzer finds nothing. Its semantic validity therefore remains a blind-rater/manual judgment, as do the declared distractor mechanism, answer equivalence, mutual exclusivity, and overall craft.

## Verification

Run:

```powershell
npx.cmd tsx experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/verify.ts
```

Focused production/profile tests, repository TypeScript checking, and focused ESLint are recorded in `test-results.json`. `source-closure.json` pins every production, test, fixture, and audit source used by the verdict. `MANIFEST.sha256` seals this directory except itself.

## Limits

This is an offline implementation and method-validity result. It does not show that G3 or B3 improves question quality, that a live provider will choose abstention at an appropriate rate, or that any profile should be promoted. Those claims require the preregistered live sample and independent blind adjudication.
