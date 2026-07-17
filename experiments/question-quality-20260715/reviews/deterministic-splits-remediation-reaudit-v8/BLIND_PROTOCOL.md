# Deterministic split remediation re-audit v8: blind protocol

- Corpus authoring began before any production source, existing test, or prior audit artifact was opened.
- The corpus is balanced per family: 16 expected-accept controls and 16 expected-block defects.
- The corpus is sealed with SHA-256 before implementation discovery or execution.
- Post-seal work is read-only with respect to production source, tests, and prior artifacts.
- No API, model, network, database, or secret is used.
- Any oracle mismatch blocks the aggregate verdict; family verdicts remain separate.

