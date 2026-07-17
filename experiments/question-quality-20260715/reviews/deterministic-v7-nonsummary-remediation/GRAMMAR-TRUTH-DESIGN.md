# Free-text grammar truth: bounded remediation design

Status: **BLOCKED BY DESIGN, not regex-remediated**  
Scope: `grammar_terminology_accuracy` in the frozen v7 corpus

## Why the current finding remains a blocker

The 16 positive controls are not one terminology typo. They are independent false propositions about voice, modals, clause complementation, gerunds, relative adverbs, agreement, participles, perfect aspect, comparison, conditionals, indirect questions, countability, and participial clauses. A finite phrase blacklist can recognize those 16 strings while still saying nothing defensible about the next false rule. It would also risk rejecting accurate statements that contain the same terms in a different relation.

`findGrammarTerminologyError` therefore remains a detector for bounded, objectively wrong **term substitutions** such as `전사구`; it is not relabeled as a truth oracle. This remediation intentionally adds no open-ended “bad grammar fact” regex.

## Sound target architecture

1. Generation emits a structured rule certificate per explanation claim:
   - rendered underline `label`;
   - catalog `pointCode` and versioned `ruleId`;
   - exact source `observedSurface` and proposed `correctionSurface`;
   - bounded relation such as `REQUIRES_BASE_AFTER_MODAL`, `PASSIVE_FORM`, or `SUBJECT_VERB_NUMBER`;
   - exact evidence span / surrounding text.
2. A versioned server-side rule catalog deterministically checks:
   - label and evidence span exist on the student-visible surface;
   - `ruleId` is allowed for the declared `pointCode`;
   - the observed/correction pair satisfies that rule's bounded transformation contract;
   - the answer label and explanation claim agree.
3. For catalogued rules, the student explanation is rendered from the verified certificate with a short template. This costs no additional model call and prevents the prose from inventing a different rule.
4. Any non-catalogued/free-form claim is fail-closed for production or sent to a separate semantic verifier. The verifier must judge the complete claim against the actual source construction; it must not receive only a keyword or isolated sentence.
5. Conditional verifier calls, disagreement logging, and a fixed per-item cost ceiling are required before rollout. “Always regenerate twice” is explicitly out of scope.

## Required proof before PASS

- A versioned certificate schema and catalog with normal/defect controls for each supported `pointCode`.
- Exact source/correction binding tests, including labels that exist but point at the wrong surface.
- A fresh, independently authored grammar-truth holdout; the 16 exposed v7 strings cannot be the acceptance set.
- Zero false acceptance on the fresh fatal controls and a measured false-rejection bound on valid expert/school-grammar paraphrases.
- Cost and fallback evidence showing that an unverifiable claim cannot silently ship when the semantic verifier is unavailable.

Until those conditions are met, the overall deterministic grammar-explanation truth verdict remains **BLOCK**.
