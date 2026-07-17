# Reviewer A — strict blank source integrity audit

## Verdict

**FRAME_BLOCKED.** All 59 rows were read manually; no sampling was used. Lens A produced 29 `PASS`, 3 `EXCLUDE`, and 27 `DOMAIN_REVIEW` decisions. This review authorizes **zero** campaign rows.

The three exclusions are structural, not stylistic:

- one source combines two speakers and two question tasks while its restored blank is only a local detail;
- two sources are two-slot connector tasks rather than substantive blank-inference tasks;
- one of those connector records also carries a form-specific answer-key conflict in its retained source note.

The 27 domain reviews are evidence-limited. Their current passage text is complete and coherent, but the expanded source bundle retains no raw blank-bearing form or filled-span record. A plausible-looking restored paragraph is not enough to certify faithful official reconstruction or the centrality and uniqueness of the actual official target.

## Fixed protocol

Each row was adjudicated against the same seven criteria:

1. complete English passage;
2. no visible encoding, OCR, or control-character corruption;
3. intact opening, terminal, and internal sentence boundaries;
4. source-bound blank restoration;
5. a paragraph-controlling inferential target rather than a local or connector-only target;
6. enough distributed context to make the restored meaning unique;
7. no pinned-history ID, exact, near-duplicate, or within-frame duplicate collision.

The only permitted row verdicts were `PASS`, `EXCLUDE`, and `DOMAIN_REVIEW`. The fixed reason-code dictionary is embedded in the git-ignored private review. Concise per-row notes contain no verbatim passage quotation.

## Source and reconstruction evidence

- Raw blank-bearing records were locally available for 32 rows.
- All 32 full restored texts match the current bundled passage text after whitespace normalization.
- Thirty are single semantic spans with one literal restored-span occurrence.
- Two are combined two-connector records; both were excluded from semantic blank-inference use.
- The other 27 rows have restored passage text only. They remain `DOMAIN_REVIEW`, even where the passage appears pedagogically promising.
- The mechanical scan found zero encoding/control-character failures and zero incomplete opening or terminal boundaries, but this scan supplements rather than replaces the manual reading.

## History and duplicate scope

The frozen v3 selection was replayed from its private snapshot. All 59 bound rows reproduce in the same order. Historical ID aliases, the frozen forbidden-reference index, and an incremental within-frame near-duplicate index all return zero collisions.

This statement is limited to the pinned snapshot's history scope. It is not proof against exposure that occurs after that snapshot; the history index must be refreshed immediately before any future campaign queue is authorized.

## Independence and privacy

Reviewer A did not read or use Reviewer B's row decisions or notes. Public files contain only aggregate counts, protocol, hashes, and safety facts. Passage text, candidate IDs, source record IDs, document keys, source IDs, and per-row notes remain absent from public outputs.

## Consequence

The exact 59-row design cannot proceed unchanged: three rows require exclusion and 27 require source-domain verification. Because the prior design consumed all 59 rows with no reserve, replacements or a redesigned estimand must be frozen explicitly; silent top-up is prohibited. Rights metadata remains absent and this audit makes no legal conclusion.

Model/API calls, network calls, database calls, and campaign candidates: **0**.
