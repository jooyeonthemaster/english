# Cross-type blank source frame v2 — reviewer reconciliation

Date: 2026-07-15 KST  
Verdict: **FRAME SUPPLY SUFFICIENT / BALANCED SPLIT FROZEN / NOT AUTHORIZED**

Both independent 157-row reviews were manifest-frozen and independently
verified before reconciliation. The fixed rule is exclusion precedence, then
domain-review deferral; only PASS/PASS is a frame pass.

## Result

- dual-lens frame pass: **133**
- excluded by at least one lens: **23**
- domain review with no exclusion: **1**
- selected by metadata-only deterministic split: **38**
  - development: 6
  - confirmatory: 20
  - reserve: 12

The split uses fixed discourse/topic cells and a seeded SHA-256 ordering of
content hashes inside each cell. It never uses passage text, private reviewer
notes, a prospective target span, generated item quality, model output, or
cost. The confirmatory block has exactly five argumentative, five expository,
five narrative, and five practical passages.

This closes the numerical and genre-balance failure of the earlier 24/59
frame. It does not authorize generation. Rights handling remains separate,
generation history must be refreshed immediately before operational sealing,
and provider/retry/queue controls remain open. No post-outcome replacement or
top-up is allowed.

Public artifacts contain no frame ID, content hash, passage text, private
identifier, or row-level decision. Model/API, network, database, secret access,
and full-question candidates were all zero.

