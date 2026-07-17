# Zero-call surface and cost scenarios

These measurements execute the current production prompt builder and the research-only schemas locally. They make no provider request. The fixed 697-character passage hash is `bf3763cd41a8bafebf3b7d6c4ffe0fbc850d9ab8ac4f66cd48bc0dd94a8d3269`.

Input tokens are estimated at 2.2696 characters/token, with the displayed sensitivity interval using 3.0–1.8 characters/token. That calibration comes from one observed grammar request and is not a Gemini tokenizer. Expected completion is 4,000 tokens for grammar and 2,500 for blank. Expected USD uses the highest pinned under-200k endpoint rate. “Reserve USD” uses the high input-token sensitivity and highest any-tier rates; it is still only a scenario, not a proved campaign lease.

## Matched single-shot screen

| Profile | Plan | Total chars | Input tok est. | Sensitivity | Expected USD | Reserve scenario USD |
|---|---|---:|---:|---:|---:|---:|
| G0 current general-path control | STANDARD | 63,885 | 28,149 | 21,295–35,492 | 0.140802 | 0.160628 |
| G0 current general-path control | PREMIUM | 56,670 | 24,970 | 18,890–31,484 | 0.176292 | 0.356285 |
| G1 final-checklist ablation | STANDARD | 63,371 | 27,922 | 21,124–35,207 | 0.140189 | 0.159859 |
| G1 final-checklist ablation | PREMIUM | 56,156 | 24,743 | 18,719–31,198 | 0.175475 | 0.354226 |
| G2 positive compact | STANDARD | 18,010 | 7,936 | 6,004–10,006 | 0.086227 | 0.091816 |
| G2 positive compact | PREMIUM | 10,793 | 4,756 | 3,598–5,997 | 0.103522 | 0.172778 |
| G3 site certificate | STANDARD | 20,376 | 8,978 | 6,792–11,320 | 0.089041 | 0.095364 |
| G3 site certificate | PREMIUM | 13,159 | 5,798 | 4,387–7,311 | 0.107273 | 0.182239 |
| B0 current control | STANDARD | 45,722 | 20,146 | 15,241–25,402 | 0.094894 | 0.109085 |
| B0 current control | PREMIUM | 17,133 | 7,549 | 5,711–9,519 | 0.081176 | 0.149537 |
| B1 type-scoped tail | STANDARD | 29,187 | 12,860 | 9,729–16,215 | 0.075222 | 0.084281 |
| B1 type-scoped tail (static no-op proof; not called) | PREMIUM | 17,133 | 7,549 | 5,711–9,519 | 0.081176 | 0.149537 |
| B2 positive compact | STANDARD | 20,526 | 9,044 | 6,842–11,404 | 0.064919 | 0.071291 |
| B2 positive compact | PREMIUM | 8,471 | 3,733 | 2,824–4,707 | 0.067439 | 0.114890 |
| B3 option-intent ledger | STANDARD | 25,447 | 11,213 | 8,483–14,138 | 0.070775 | 0.078673 |
| B3 option-intent ledger | PREMIUM | 13,392 | 5,901 | 4,464–7,440 | 0.075244 | 0.134568 |

The current controls here are **general-path single-shot research controls**. Eligible PREMIUM grammar production normally uses the separate ladder, so the G0 PREMIUM row is not a production-yield or production-cost estimate. The `B1` PREMIUM row is retained only to prove exact identity with `B0`; it consumes zero scheduled provider calls. The grammar checklist payload is exactly 512 characters, while its removal changes the rendered prompt surface by 514 characters because the builder also removes two separator newlines.

The sealed `S1` output caps are 6,000 tokens for grammar and 4,000 for blank, deliberately higher than the expected-completion scenarios in this table. Recomputing with the high input-token sensitivity and those caps stays inside the frozen per-call ceilings: `$0.20` grammar STANDARD, `$0.43` grammar PREMIUM, `$0.14` blank STANDARD, and `$0.20` blank PREMIUM. A future price/request preflight above a ceiling blocks execution; these table scenarios cannot expand it.

## Exact treatment sizes

| Artifact | Characters |
|---|---:|
| G2 exact prompt block | 960 |
| G3 exact prompt block | 1,641 |
| B2 exact prompt block | 926 |
| B3 exact prompt block | 1,612 |
| Current KILLER grammar response schema (6 generated markers) | 4,737 |
| G3 KILLER grammar response schema (6 generated markers) | 6,422 |
| Current blank response schema | 2,449 |
| B3 blank response schema | 6,684 |

The B3 schema grows more than its prompt shrinks. Its economic case therefore depends on ship-ready yield and actual completion length, not input compression alone.

Exact treatment bytes are frozen independently of character counts:

| Artifact | SHA-256 |
|---|---|
| G2 prompt | `fc01702f19bba345db20445d2a6f69fb287fbb4defa7d4b9cb66043bceba43bb` |
| G3 prompt | `001139b7bb5cee0b9b249029c6e1e4eaac3f103b2cd7096cb37901893175bee1` |
| B2 prompt | `ff10990a134b692d343e4557c4f239ab76d293642a7ec41d76786b240da58cb8` |
| B3 prompt | `1b98cb8aeda2d791eaa3782d512bf782277f0df71f713e7f2032fb8aeafcbcca` |
| G3 6-marker/1-answer schema JSON | `40e24f989c16c6e9016cd51b2efe6e77118965694fc80a1ef25a6e7dd151fabb` |
| B3 schema JSON | `3130f865f4d08e7c9cbdf791449ea03cb33d4dad911513eb6b5fb905823ce801` |
| PREMIUM grammar G3 answer-stage schema JSON | `86f3e3aeda63900c28a76176045fdbd4e550e0ee7ddb84256320d392a10f883e` |

## PREMIUM grammar ladder fixture

On the same passage, the source-pinned answer-only prompt is 3,082 characters and its current schema is 1,234. The representative add-decoys prompt is 3,552 characters and the 5-marker full schema is 4,672. Replacing only `answerDesign` with `siteCertificate` makes the answer-stage schema 3,232 characters, a 1,998-character input-schema increase.

Using the planning completion assumptions of 1,200 answer-stage and 3,500 decoy-stage tokens, the two-stage minimum is approximately `$0.1214` at the under-200k Pro rates before any parse retry, hard regeneration, targeted repair, fallback general path, or solver. The high-sensitivity any-tier scenario is about `$0.2024`. The certificate schema alone adds about `$0.0032` under the calibrated under-200k input scenario, before any additional certificate completion tokens.

The add-decoys prompt embeds model-produced answer bytes, so this fixture is structural—not an exact future request forecast. Every real call, failed call, retry, repair, and solver must be measured by the sealed controller.

## Interpretation limits

- Character reduction is not evidence of quality gain.
- Schema description bytes are included, but provider serialization overhead may add bytes.
- Expected output tokens are assumptions; actual distributions must be reported by profile, plan, difficulty, and stage.
- These are per logical operation scenarios. They exclude hidden SDK retries by design in the screen and cannot be used as full production callgraph bounds.
- A current pricing refresh and a proven hard reservation formula are mandatory before execution.
- The stale historical 675/648/432-style callgraph values and the post-fallback 378 PREMIUM-grammar placeholder are pessimistic blockers, not execution envelopes. `S2` cannot be called a 240-candidate experiment until a fresh source-bound audit proves physical, candidate-capable, and USD bounds for the entire queue.
