# Campaign v6 strict JSON observer — independent re-audit v2

## Verdict

`FAIL_BLOCKERS`

The exact final observer passes the predecessor's entire 461-case behavioral contract, including the four original failure classes and the v1 root-sequence/prefix-recovery findings. It fails 144 of 456 fresh, non-derived adversarial cases. In both remaining blocker classes, a response that physically contains affirmative candidate multiplicity is reported as the ordinary state `choicesObserved=0`, `candidateUnitsEffective=1`, `cardinalityAmbiguous=false`, `observationSaturated=false`.

This is an observer-only, permanent, non-authorizing review. It does not authorize v6 freeze, metadata capture, network/provider/model activity, ledger mutation, C0/S1 generation, or production use.

## Exact subject

- Observer: `execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts`
- Observer SHA-256: `41969f7b9c7cad9c2e1da8568be86f646d103de4297038b9085c955a73002187`
- Coordinated offline test (hash observation only): `execution/campaign-v6-connectivity-pilot-v6/offline.test.ts`
- Offline-test SHA-256: `e06274726e50281e30015067910d20de50127a75798ada87ff320882acba880c`

The audit imported only the exact observer. It did not import, execute, or inspect the subject's tests. The offline test was read only for its hash.

## Matrix

| Matrix component | Cases | Passing | Failing |
|---|---:|---:|---:|
| Reproduced predecessor contract | 461 | 461 | 0 |
| Fresh non-derived adversarial matrix | 456 | 312 | 144 |
| **Combined** | **917** | **773** | **144** |

- Exact full-output assertions: 753
- Safety-predicate assertions allowing either exact recovery or global quarantine: 164
- Matrix fingerprint: `d03275523a39930086f490ef5857a95ea75797739a0caadba05061e1bf249fda`
- Failure fingerprint: `b1046d570c5c3547a74a61647b4800f9144e32f226b5d0e2483534a4429196b4`

All 144 failures are confined to two fresh categories:

| Category | Cases | Failures |
|---|---:|---:|
| Quoted/nested output wrappers | 64 | 44 |
| Unterminated or invalid-escape strings swallowing escaped payloads | 100 | 100 |

The passing matrix covers raw and decoded prefix/middle/suffix gaps; missing separators; strings, escapes and surrogates; nested wrappers; typed `choices` and `questions`; provider `message`/`delta` carriers; complete plus partial roots; duplicate keys; candidate lineage non-duplication; semantic leaf braces/brackets/code/math/quoted JSON; arbitrary `content` outside provider context; Cloudflare/HTML/error-body neutral controls; exact byte/node/depth/1,001-candidate boundaries; a near-2 MiB invalid prefix; and the 4,096/4,097 recovery-attempt boundary.

## B1 — valid quoted output roots are skipped

`findRecoveryRootStartV6` delegates quote recognition to `isRecoveryStringRootStartV6`. That predicate accepts a quote only when its immediate next character is `{`, `[`, `"`, or a narrowly shaped backslash sequence. A valid JSON string whose decoded model output begins with whitespace, BOM, prose, a fence, comma, or colon is therefore skipped after an invalid raw prefix. The same decoded-prefix blind spot recurs in top-level and nested JSON-string wrappers.

Representative counterexamples:

| Case | Raw SHA-256 | Actual |
|---|---|---|
| Invalid prefix + quoted, space-prefixed two-choice envelope | `64900ac87d7be5ca9990e9232dd81b37e2e5db2347d2938703475b7a74aed3d3` | `choices=0, questions=0, units=1, ambiguous=false, saturated=false` |
| Top-level quoted, BOM-prefixed two-choice envelope | `7b1989fdafd549d8eb168fbae248b045221c8e37f105c861b66f073247971925` | `choices=0, questions=0, units=1, ambiguous=false, saturated=false` |

These are valid transport JSON strings containing a complete two-choice provider envelope. Exact recovery would be preferable, but the audit accepts a global ambiguity signal as a safe alternative. The observer supplies neither.

## B2 — malformed strings hide escaped candidate payloads

Two related paths remain blind:

1. An unterminated JSON string containing a fully escaped provider/question payload advances the parser cursor to EOF. Recovery starts at `failureOffset=EOF`, so the monotonic scanner never sees the swallowed payload.
2. An invalid escape fails earlier, but the later payload is still encoded for the surrounding string. Scanning from its `{` encounters backslash-escaped keys rather than a standalone JSON object, and no candidate evidence or quarantine survives.

Representative counterexamples:

| Case | Raw SHA-256 | Actual |
|---|---|---|
| Unterminated wrapper swallowing a two-choice envelope | `204df1bcc6bfdd5f94290fb0f2476bebaaea6190bfccc32cacd34ebe6f38d007` | `choices=0, questions=0, units=1, ambiguous=false, saturated=false` |
| Invalid escape before an escaped two-choice envelope | `0601ffa50ff92e2699fdf8f7369fd995648cc793ebc9e761b35095b3dfe7994e` | `choices=0, questions=0, units=1, ambiguous=false, saturated=false` |

The 100 failures span one provider, two provider choices, two provider roots, two questions, and mixed question/provider payloads across ten distinct string prefixes. Twenty positive controls with an unescaped later provider root recover exactly, isolating the defect to escaped string payloads.

## Independent static proof

The exact source has one parser-cursor initialization, 19 forward increments, and zero decrement operations. Recovery:

1. scans from `Math.max(0, fromOffset)` with a strictly increasing scan index;
2. parses only at the found `recoveryStart`;
3. advances with `Math.max(recoveryStart + 1, recovered.endOffset)`.

By induction, each next attempted span starts after the prior attempted start and never before the prior parser end. Complete parsed spans are disjoint; a failed span hands off at its failure/end cursor. The scan does not rewind or rescan a completed span. Quote lookahead is capped by depth, recovery attempts by 4,096, decoded expansion by 2 MiB, nodes by 50,000, and depth by 128. The boundary matrix confirms 4,096 attempts and an exact-cap near-2 MiB scan remain live, while plus-one cases saturate.

Therefore the recovery cursor is monotonic and bounded, with no unbounded O(n²) rewind/rescan path. The same property explains B2: once an unterminated string consumes to EOF, the design has deliberately discarded any opportunity to inspect swallowed encoded payload evidence.

## Required successor

A successor should:

1. treat syntactically valid JSON strings as possible roots at explicit raw/model-output boundaries even when their decoded value starts with whitespace, BOM, or bounded invalid-prefix bytes;
2. on a malformed string, either recover bounded escaped candidate-bearing payload evidence or set a global ambiguity/quarantine signal;
3. keep Cloudflare/HTML/error bodies and arbitrary non-provider `content` fields non-ambiguous when they contain no affirmative candidate surface;
4. preserve the verified monotonic/bounded cursor, disjoint spans, exact limits, typed-container accounting, and semantic-leaf liveness;
5. rerun this exact 917-case matrix plus fresh successor cases under a new immutable review directory.

No provider, model, network, database, secret, private artifact, ledger, build/freeze, or live command was used.
