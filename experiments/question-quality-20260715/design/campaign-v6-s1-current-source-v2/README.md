# Campaign v6 S1 current-source reseal v2

This package prepares a new current-source seal without modifying or replacing
the immutable `campaign-v6-s1` evidence. The old package is retained as stale
lineage only. Its exact private queue is copied byte-for-byte: the same 12
passages, 180 assignments, membership, seeded order, profiles, plans,
difficulties, one candidate opportunity, one physical fetch, one semantic
question, one outer attempt, zero SDK retries, and no replacement or top-up.

The current bytes of all 55 sources in the original S1 closure are rehashed.
Exactly seven paths differ from the old seal. All seven are currently untracked,
have no index/HEAD blob and no Git path history, so their prior hashes are old
artifact evidence rather than Git ancestry. The public artifact records both
the old and current hashes and treats the old source seal as stale.

Production type authority is pinned to the exact PASSed v4 subject manifest
`715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04`
and independent-audit manifest
`796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d`.
That authority does not authorize dispatch.

Connectivity remains exactly `PENDING_CONNECTIVITY_V6_INDEPENDENT_PASS`.
There is no placeholder connectivity hash, no v5 substitution, no freeze, and
no authorization. Generation eligibility remains zero. These scripts perform
only local file hashing and read-only Git inspection; they do not access a
network, provider, model, API, database, secret, or budget ledger.

Offline reproduction:

```powershell
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/build.mts --write
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/build.mts
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/verify.mts
npx.cmd tsx experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/hostile-tests.mts
npx.cmd tsc -p experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/tsconfig.json --noEmit
```

The package is preparation evidence only and must remain
`CURRENT_SOURCE_RESEAL_PREPARED_EXECUTION_BLOCKED` until a separately frozen
connectivity v6 package receives a fresh independent PASS and a later,
separately reviewed authorization artifact is created.
