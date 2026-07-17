# Campaign v6 strict JSON observer — independent re-audit v4

## Verdict

`PASS_NO_BLOCKERS`

The exact 1,903-case v3 contract passes without regression, including all 30 cases that failed against the predecessor observer. A separately authored v4 matrix adds 1,950 cases and also passes in full. The combined result is **3,853/3,853 passing, 0 failing**.

This is an observer-only correctness review. It does not authorize the broader campaign-v6 system, a freeze, provider/model/network activity, ledger mutation, C0/S1 generation, or production deployment.

## Exact subject binding

- Observer: `execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts`
- Observer SHA-256 before and after: `8df2072304c3bc48873dac05889c6d22ddf313f25fa321f9e6baac69fcc1fd3a`
- Coordinated offline test (hash observation only): `212dadaad0f3812c2f4c2836bf4048694f237f8aeb618937bf09cd44149f5172`
- Subject tests imported, executed, or inspected: 0
- Subject edits: 0

## Exact predecessor replay

`legacy-replay.mts` reads the two immutable v3 audit programs, verifies their sealed hashes, replaces only their exact prior subject/offline hash bindings, transpiles them in memory, and executes them against the current observer. It does not copy or alter their generators or fixtures.

| Contract | Cases | Passing | Failing | Matrix SHA-256 |
|---|---:|---:|---:|---|
| Immutable 917-case predecessor contract | 917 | 917 | 0 | `d03275523a39930086f490ef5857a95ea75797739a0caadba05061e1bf249fda` |
| Immutable 986-case v3 fresh contract | 986 | 986 | 0 | `fd9c88b6c2838f125bb974e13a05653982fe956e821797326674076bf31ea50d` |
| **Exact replay subtotal** | **1,903** | **1,903** | **0** | — |

The 986-case replay specifically confirms that the prior 20 odd-backslash blind spots, one malformed-string/later-root desynchronization, and nine neutral-prose saturation failures are gone while all 956 prior passes remain passes.

## Independent v4 matrix

The new matrix shares no generator or fixture with the v3 audit. It uses a small narrow reference scanner for complete JSON values and separately hand-classified safety fixtures for malformed/truncated boundaries. These oracle families are crossed rather than relying on the observer implementation.

| Category | Cases | Passing | Failing |
|---|---:|---:|---:|
| Raw-boundary odd/even backslash parity | 288 | 288 | 0 |
| Malformed string followed by a later root | 120 | 120 | 0 |
| Complete neutral quoted prose | 144 | 144 | 0 |
| Neutral strings across the 4,096 recovery boundary | 12 | 12 | 0 |
| Nested/escaped/Unicode quoted wrappers | 240 | 240 | 0 |
| Multiple roots with prefix/suffix garbage | 240 | 240 | 0 |
| Truncation at every UTF-16 position | 402 | 402 | 0 |
| UTF-8 streaming chunk splits | 320 | 320 | 0 |
| Nested braces/brackets and Unicode whitespace | 160 | 160 | 0 |
| Byte/depth/candidate hard bounds | 24 | 24 | 0 |
| **Fresh subtotal** | **1,950** | **1,950** | **0** |

The fresh matrix has 1,627 distinct raw bodies and 320 distinct byte-split schedules. Its oracle composition is 884 exact-output cases, 664 affirmative-multiplicity quarantine cases, and 402 every-position invariant/truncation cases. The narrow reference scanner supplies 720 cases; hand-class fixtures supply 1,230.

- Fresh matrix fingerprint: `35dd30ef4331961889d6d12196cc11e3502508b655261b84484dd2610a42eae4`
- Fresh result fingerprint: `a0bf61afcbe8b8d7e6a72b415fa9b01c530cf7bf3a855c7b7d079955cc091db3`
- Empty failure fingerprint: `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Combined matrix-binding fingerprint: `d3fb25e744b2ac941ac9118e7a144777ac34db3f97eb9c504e2af912cf946bae`

## Findings

1. Odd/even raw backslash runs from 0 through 31 no longer suppress physically present quoted multiplicity.
2. Six invalid-escape classes followed by direct or quoted roots recover to a quarantine state in every tested separator combination.
3. Complete neutral strings containing prose braces, brackets, escaped quotes, HTML, math, Korean, Japanese, and schema-adjacent ordinary words remain neutral, including 4,090–4,101-token storms around the recovery cap.
4. All truncation positions preserve deterministic public invariants; once the second provider choice is physically complete, truncation cannot produce an ordinary unambiguous single-candidate state.
5. All UTF-8 byte splits reconstruct byte-exactly through `StringDecoder`, including splits inside Korean, emoji, em dash, escaped quotes, and JSON keys, and produce the exact unsplit observation.
6. The 2 MiB byte limit, depth limit, and 1,001-candidate sentinel remain fail-closed.

No blocker was found in the exact observer bound above. This result must be combined with the separate system-boundary and calibration reviews before any campaign-v6 authorization decision.

## Activity boundary

Provider calls, model calls, network calls, database reads/writes, secret reads, private-artifact reads, ledger reads/writes, build/freeze commands, and live commands were all 0.

