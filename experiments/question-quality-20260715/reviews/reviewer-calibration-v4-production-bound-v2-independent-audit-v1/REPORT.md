# Independent hostile audit — reviewer calibration v4 production-bound v2

Verdict: **FAIL_BLOCKERS**. This is a design-only audit. It certifies no reviewer, grants no scoring or evaluator authority, and authorizes no execution or activation.

## Exact subject and public lineage

The audited subject is `experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v2` at subject manifest SHA-256 `10801e127bb612e2bb6909acf857ff6fa2ef0cac667a0fd7e4e39f774e656413` and public-manifest SHA-256 `2b5426fdab4e5d56e0e8e45ebdd34f0cabf8c72270b1d3ac7b4932dca1332d98`.

The independent verifier rehashed all seven direct upstream bytes and all 26 rows in the five directly pinned public manifests. It also rehashed the evaluation-authority public manifest's ten upstream bytes and 23 safe rows from its nested public manifests. One nested row was `private/.gitignore`; the verifier refused and did not open it. No private, item, answer, gold, actor, secret, environment, database, network, model/API, ledger, or question-generation resource was accessed.

The byte chain confirms:

- evaluation-authority v2 subject manifest `ac4ed7ee…`, public manifest `c62fb02e…`, and independent audit manifest `0cdf9d67…` with `PASS_NO_BLOCKERS` and zero current authority;
- production-type-binding v4 subject manifest `715818a8…`, binding `47df395f…`, frozen snapshot pin `d126aa31…`, and independent audit manifest `796adc11…` with `PASS_NO_BLOCKERS`;
- reviewer-calibration v3 replacement protocol `4c27307b…` and manifest `ea73ff07…`, used only as `DESIGN_ONLY_UNISSUED` methodology with no production type, certificate, scoring, or execution authority.

Independent recomputation confirmed 25 UI types, two focus types, 23 nonfocus types, eight disjoint families, 32 four-epoch schedule rows, 16 distinct epoch-1 main/holdout contacts, all 23 contacts after two combined epochs, and all 23 main-only contacts after four epochs. It also reconstructed the exact 12 pilot, 24 main, zero-item trusted-gold audit, 24 one-time holdout, and separate activation sequence, plus all 60 empty future slot IDs. Every current actor, payload, gold, access, phase-seal, certificate, adjudicator, and activation count remains zero.

## Blockers

1. **Trusted-gold self-audit is not excluded.** `protocol.json:299` excludes `ANY_PACKET_AUTHOR`, but never defines packet author as a superset of item or gold author. `event-schemas.json:49` has no `ITEM_AUTHOR` or `GOLD_AUTHOR` role. A trusted-gold auditor can therefore author the item or gold being audited without a declared incompatibility.

2. **Activation-audit self-review is not excluded.** The only activation-auditor pair is with the fresh adjudicator (`protocol.json:323`). Packet/item/gold authors, both certification reviewers, the trusted-gold auditor, and the S1 result custodian may all be the same actor as the purported independent activation auditor.

3. **Exact-type coverage is not bound into certification or activation.** The design correctly says contact is not certification (`protocol.json:229`, `PROTOCOL.md:49`), but the reviewer certificate carries only a generic scope string (`event-schemas.json:292-305`) and activation binds only two certificate hashes (`event-schemas.json:343-363`). Neither binds canonical IDs, a coverage count/map, nor passed coverage-event hashes from `registries.json:179`. Epoch-1's 16/23 nonfocus contact can therefore be escalated to global 25-type authority.

4. **The activation audit dependency is circular.** The prose orders an immutable activation event and then its independent audit (`README.md:26`, `PROTOCOL.md:53`), while the event schema requires that future audit's manifest hash and PASS verdict inside the event being audited (`event-schemas.json:348-366`). A post-event audit cannot already be hashed into the immutable event, and a pre-event audit cannot attest the final event bytes.

5. **Slot materialization cannot carry required hidden/type evidence.** `slotMaterialization` omits explanation-evidence, author-hypothesis, and rotation-epoch commitments, permits any `typeId`, and accepts any family prefix (`event-schemas.json:106-133`). Because `unevaluatedProperties` is false, the omitted commitments cannot be added. This contradicts the required hidden bindings and exact v4 type/family/epoch contract.

6. **Freshness, disjointness, replay, and backfill have no material proof.** The protocol asserts normalized text-window, topic, scenario, author, and surface disjointness (`protocol.json:244`), but no slot or activation event binds those fingerprints or a disjointness proof. Pilot, failed, or near-duplicate items can be replayed under new opaque commitments.

7. **Access authorization does not bind the resource class or current state.** The authorization schema accepts arbitrary `resourceSha256`, `visibleSurfaceSha256`, and `denySetSha256` values (`event-schemas.json:146-176`) without a state, resource class, canonical policy digest, or allowlist proof. DENIAL lacks state and deny-set binding. An answer or trusted-gold surface can be authorized in phase 1 under an opaque hash.

8. **Pre-open authorization and single-use capability lack chain evidence.** The event union has authorization and after-close receipt but no sealed OPEN or capability-consumption event (`event-schemas.json:7-15`). `openedAt` is self-reported later, and no use index prevents a second authorization or receipt. Backdated ALLOW and capability replay therefore remain structurally admissible despite the prose constraints.

## Hostile audit

The standalone verifier constructs 256 mutations without loading the subject's fixture generator. All 256 expected baseline violations were detected. It separately exercises 21 access scenarios: one valid claimed pair, fourteen binding/hash/order/time/decision cases, and six material bypasses. Total independently constructed cases: **277**. Deterministic case digest: `e5044394edcf5e24867b7dea527ba3f4e566312019009215b1ffed9bd62b91a7`.

The audit inspected the subject verifier and fixture as hostile, untrusted source material, but never imported or executed them and reused none of their mutation cases or generator logic as evidence. The standalone verifier does not parse the subject fixture. The subject was byte-identical before and after both verification passes.

## Disposition

This v2 subject remains permanently design-only and zero-authority, but it is not sufficient as the basis for a future certification or activation package. A successor must close all eight blockers and receive a fresh independent audit. No actual reviewer certification is claimed by this report.

Reproduce from the repository root:

```powershell
node experiments/question-quality-20260715/reviews/reviewer-calibration-v4-production-bound-v2-independent-audit-v1/independent-verify.mjs
```
