# Grammar solver certificate v1

Status: **DESIGN/MECHANISM ONLY — NO API EXECUTION AUTHORIZATION**

This contract replaces model-authored student explanation prose only after a blind solver independently submits a five-marker certificate. Acceptance requires all of the following:

- one and only one ungrammatical marker;
- solver answer equals the candidate key;
- every observed surface and correction equals the candidate's actual marker fields;
- all five point codes and closed rule IDs agree;
- every evidence span is an exact substring of the rendered student passage and contains the observed surface;
- all four decoys are grammatical;
- no marker has a defensible alternative standard parse.

On acceptance, the server renders the answer explanation, three key points, and four wrong-option explanations from a versioned Korean template catalog. Candidate explanation prose and solver free-form reasoning are not rendered. On any mismatch, no explanation is produced.

The solver prompt contains only the student-facing direction and marked passage. It omits the answer key, corrections, generated explanation, key points, and wrong-option explanations.

This does not prove the solver itself is correct. Before use, it still requires:

1. exact provider-wire and ledger registration as a separately billed evaluation call;
2. a fresh blind truth holdout across all supported rule IDs;
3. disagreement/failure policy and per-item cost ceiling;
4. STANDARD/PREMIUM paired evidence that the extra call improves fatal-free and explanation-accuracy rates enough to justify cost;
5. fail-closed behavior when the certificate is absent or unresolved.

No model/API/network/DB call was made to build or test this artifact.
