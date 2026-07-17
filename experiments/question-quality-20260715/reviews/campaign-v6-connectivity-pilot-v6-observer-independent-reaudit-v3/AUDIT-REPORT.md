# Campaign v6 strict JSON observer — independent re-audit v3

## Verdict

`FAIL_BLOCKERS`

The exact current observer reproduces and passes the immutable v2 review's full 917-case behavioral matrix. It then fails 30 of 986 newly authored, non-derived adversarial cases. Twenty-one failures erase physically present candidate multiplicity into the ordinary state `choices=0, questions=0, units=1, ambiguous=false, saturated=false`. Nine failures turn wholly neutral quoted prose into `ambiguous=true, saturated=true` by spending the 4,096-attempt recovery budget on punctuation inside complete neutral strings.

This review is observer-only, permanent, and non-authorizing. It does not authorize v6 freeze, metadata capture, provider/model/network activity, ledger mutation, C0/S1 generation, or production use.

## Exact subject and independence

- Observer: `execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts`
- Observer SHA-256 before and after: `736911a9f5763c17ec839ed30c04e960503ab803fdd4c1b8af220a49106bb2bb`
- Coordinated offline test SHA-256 (hash observation only): `30a04ca8e82fabca47f2a432a6c1182b17053f6e195ba5c9c40abb075606a4b3`
- Subject tests imported/executed: 0
- Subject test content inspected: 0
- Subject edits: 0
- Provider/model/network/database/secret/private-artifact/ledger/build/freeze/live activity: 0

Only the observer was imported. The coordinated `offline.test.ts` was neither imported nor executed, and its content was not inspected. Its bytes were read only to bind the SHA-256 shown above.

## Immutable predecessor replay

`predecessor-replay.ts` is byte-for-byte the sealed v2 `audit.ts` algorithm except for the single expected-subject-hash replacement from the prior observer SHA to the exact current observer SHA. The verifier proves that one-line transformation before execution.

| Matrix | Cases | Passing | Failing |
|---|---:|---:|---:|
| Immutable v2 behavioral matrix | 917 | 917 | 0 |
| Fresh v3 non-derived matrix | 986 | 956 | 30 |
| **Combined** | **1,903** | **1,873** | **30** |

- Reproduced predecessor matrix fingerprint: `d03275523a39930086f490ef5857a95ea75797739a0caadba05061e1bf249fda`
- Fresh matrix fingerprint: `fd9c88b6c2838f125bb974e13a05653982fe956e821797326674076bf31ea50d`
- Fresh failure fingerprint: `6fd77d85b3e0d24a75fe7c6620f78cf0a4019770fe4fb2415453e023d70e4ca3`
- Combined exact full-output assertions: 987
- Combined safety-predicate assertions: 916

The fresh matrix contains 752 affirmative-multiplicity cases, 96 neutral-liveness cases, and 138 exact-accounting cases. All 138 exact-accounting cases pass. The tested surface includes unterminated strings; invalid escapes before, inside, and after encoded payloads; incomplete `\\u` escapes; valid surrogate pairs and lone/reversed surrogates; eight levels of nested quoted wrappers; whitespace/BOM/prose/fence/comma/colon prefixes; odd/even backslash parity; later raw roots; typed provider choices and explicit questions with mixed lineages; semantic JSON/code/math/HTML leaves; arbitrary non-provider fields; HTML/Cloudflare controls; quote storms; exact 2 MiB, node, depth, candidate, and 4,096/4,097 recovery boundaries; and disjoint large-prefix probes.

## B1 — odd raw backslash parity suppresses quoted multiplicity

Twenty failures occur when a malformed raw prefix ends in an odd backslash run immediately before a quoted JSON wrapper containing two provider choices, two provider roots, two questions, or an explicit two-question container. Even runs recover; odd runs are globally treated as escaping the quote although no valid surrounding JSON string has established that lexical state. The escaped payload body is then ignored.

Representative case:

- ID: `raw-quote-backslash-parity-1-two-choices`
- Raw SHA-256: `b24f2ca169a7110360c3787d40013d55cd3a8e9df68df75b518b4b8f3636f3db`
- Raw bytes: 431
- Actual: `choices=0, questions=0, units=1, ambiguous=false, saturated=false`

This is not merely an exact-count miss: affirmative multiplicity receives neither recovery nor global quarantine.

## B2 — malformed-string close desynchronizes a later valid quoted root

One independent later-root case concatenates a closed invalid-escape string with a valid quoted, comma-prefixed two-choice output. Recovery begins from the invalid escape but mistakes quote roles across the boundary, so the later valid quoted root is never analyzed.

- ID: `later-root-quoted-7`
- Raw SHA-256: `9eb8101028100f223d172b0283bf66393b3d6cfdf3ab654c82f01e7053e6391a`
- Raw bytes: 424
- Actual: `choices=0, questions=0, units=1, ambiguous=false, saturated=false`

The surrounding invalid string is complete as a malformed span; recovery must resume after its actual closing quote and consider the next quote independently.

## B3 — complete neutral quoted prose consumes recovery capacity

Nine neutral-liveness cases fail. Each response is an invalid neutral prefix followed only by complete neutral JSON strings. Their decoded text includes prose braces/brackets such as `{trace}` and `[metric]` but no provider envelope, question container, model carrier, or semantic candidate hint. Because structural punctuation prevents the scanner from skipping a complete neutral string, punctuation inside the string becomes repeated failed recovery roots. At scale the 4,096-attempt cap is exhausted and the observer returns global saturation.

Representative cases:

| ID | Raw bytes | Raw SHA-256 | Actual |
|---|---:|---|---|
| `neutral-quote-storm-v3-7` | 85,517 | `3503648676d20be6006f0174d587b3a1b966f0c028a50cb4faa155385b76db43` | `ambiguous=true, saturated=true` |
| `neutral-quote-storm-recovery-exact-4096` | 139,281 | `2c4ffc853a9a4d903874f2229287ead991dd1754869992f3cea686a3d6128eb4` | `ambiguous=true, saturated=true` |
| `neutral-quote-storm-recovery-plus-one-4097` | 139,315 | `6e67d86ca225611f8c7163802c737d81f94bad24c9c562a5e0bbd424702d6ba6` | `ambiguous=true, saturated=true` |

This violates the required neutral-body liveness contract. Neutral punctuation is not a candidate-recovery attempt.

## Monotonicity, bounds, and disjoint spans

The source still has one parser-cursor initialization, no parser-cursor decrement, a recovery scan beginning at the prior offset, and `recoveryOffset = Math.max(recoveryStart + 1, recovered.endOffset)`. The malformed-string decoder advances in a single bounded pass. Recovery attempts, decoded expansion, raw bytes, nodes, depth, and candidate counts remain capped.

All fresh exact disjoint-accounting cases pass, including 2–144 provider roots separated by malformed gaps. Large-prefix probes from 128 KiB through 1 MiB recover the later provider exactly once. Local timings are recorded as diagnostics but are not used as an oracle. No unbounded quadratic rewind/rescan path was found. B3 is a bounded false-positive exhaustion problem, not evidence of a cursor rewind.

## Required successor

A successor must:

1. scope slash-parity quote suppression to a confirmed string span; at a malformed raw-output boundary, an odd preceding slash cannot permanently suppress an otherwise candidate-bearing quoted wrapper;
2. preserve the real closing boundary of a malformed string and restart quote recovery after that boundary without pairing a closing quote with the next root's opening quote;
3. analyze a complete quoted string once, then skip its entire span when decoded evidence is neutral, without charging braces/brackets inside neutral prose against the recovery-attempt cap;
4. if obfuscated decoded evidence cannot be classified safely, globally quarantine rather than emit an ordinary single-candidate state;
5. retain all 1,873 current passes, especially malformed-string recovery, surrogate handling, semantic-leaf liveness, typed-container accounting, exact limits, monotonic cursor advancement, and disjoint-span accounting;
6. rerun this exact 1,903-case combined contract plus fresh successor-specific cases in a new immutable review directory.

No provider, model, network, database, secret, private artifact, ledger, build/freeze, or live command was used.
