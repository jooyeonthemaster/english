# Campaign v6 S1 offline isolation review v1

Verdict: **PASS_OFFLINE_ISOLATION_REPRODUCED_EXECUTION_BLOCKED**.

This independent local review reproduced the current sealed S1 controller and exact-wire preflight without contacting a network, provider, model, API, browser, application database, or credential source. It authorizes no live execution.

## Result

- Both target manifests rehashed with zero mismatches. S1 manifest: `3ed71284aaf28c6c0f78f89d75c13bc30f86d894f17ccecf88f24d4cd5c1614b`; preflight manifest: `b92c3772879e974c16b3a87527cb27d11c2a6cd90ac5018ac485f6989135c95e`.
- The private preflight artifact is gitignored/untracked and hashes to `96318916c4ef714ae55febab3a63b992e93d6e2911f03235698487f40601ca7a`, exactly matching its public commitment.
- The generated production `runtime.ts` import closure contains nine files and does not contain `runtime.test-support.ts`.
- `runtime.test-support.ts` imports no fetch boundary, callsite adapter, HTTP(S), TCP, TLS, or transport delegate. It accepts only stores branded in its private `WeakSet`, created below the OS temporary directory, and returns a durable bookkeeping controller marked `OFFLINE_FAKE_ONLY_NO_DELEGATE`.
- Production authorization remains fail-closed: the sole production trust root is the documented placeholder, no test trust-root path is exported, no production credential capability is minted (`credentialSecrets.set(...)` is absent), and both persisted artifacts remain explicitly blocked.
- A direct in-memory probe proved `normalizeScope()` preserves the entire provenance object including `requestEnvelopeHash` and `promptProfileArtifactHash`, rejects malformed values for either field, and invokes zero native fetches. Static inspection confirms the change consists of optional `assertHash()` validation/preservation blocks.
- The exact-wire compiler replayed all 180 assignments through the production core with 180 locally intercepted fetches, 180 unique bodies, 180 unique envelopes, zero unexpected fetches, and zero blocked alternate-transport attempts. External network/model/provider/API calls and candidates consumed were all zero.

The official builders were run without `--write` because this review was forbidden to modify target files. Their official verifiers independently regenerated and byte-compared the expected artifacts. The S1 typecheck used a temporary build-info path so the existing target `tsconfig.tsbuildinfo` was not touched.

## Reproduction

From the repository root:

```powershell
node experiments/question-quality-20260715/reviews/campaign-v6-s1-offline-isolation-review-v1/verify.mjs --full
```

The full verifier uses only the checked-in local Node/tsx/TypeScript toolchain, snapshots target hashes before and after, runs the unit/controller/ledger suites, both official verifiers and typechecks, the guarded 180-row replay, and the local normalization probe. See `result.json` for machine-readable outcomes and `source-hashes.json` for the exact reviewed bytes.
