# Codex Native Exam Webtoon Harness v4 policy

## Scope and non-negotiable rules

The source of truth is `src/data/exam-passages/passages.json`. The current inventory contains 4,537 passages and therefore requires exactly 9,074 approved `KO_EN` assets:

- `MACHO_BLACK_RED`
- `CUTE_PASTEL`

Every visible Korean and English character must be created together with the artwork during the original native Codex image-generation call. Leaving blank areas for later typography, adding text after generation, compositing, inpainting, cropping, re-encoding, or otherwise changing the generated pixels is forbidden.

Only the native Codex image-generation capability in the current session may create an image. Do not use this application's backend or CLI generators, AtlasCloud, OpenRouter image models, Higgsfield, Gemini image APIs, Replicate, or any other external image-generation API. If native Codex generation is unavailable, stop; do not fall back.

The harness does not call an image model. It freezes the passage inventory, claims generation work, emits exact prompts, stages bytes produced by native Codex, records provenance and independent QA, manages retries, and verifies completion.

The two concepts intentionally have different density contracts. `MACHO_BLACK_RED` keeps the dense black/red action-comic treatment. `CUTE_PASTEL` follows the user's white-tone reference: exactly 10 roomy panels, thin black/gray line art, light gray shading, sparse muted pastel accents, and natural Korean teen/young-adult proportions. Toddler/chibi, glossy 3D, candy-color children's-book, preschool, and mascot-dominant styling fail QA. CUTE uses only 5–7 short exact source-English anchors, each at most 96 characters and 15 words, paired with concise natural Korean; the remaining logic must be conveyed by scenes and short Korean narration. The page may be only slightly denser than the reference and must not reproduce the whole passage as paragraph blocks.

## State, locking, and global capacity

The current policy run directory is `out/codex-native-exam-webtoons-20260715-v4`. The prior `v2` and development-only `v3` directories are preserved as superseded-policy audit trails. Override the directory on any command with `--run-dir=<directory>`.

Production runs use `state.sqlite` with schema v2, row-level asset persistence, unique receipt constraints, an incrementing revision, WAL journaling, `synchronous=FULL`, and an exclusive `state.lock`. Legacy JSON fixtures remain readable for migration and adversarial tests. Every mutating command checks the frozen source, prompt-policy, QA-policy, and inventory hashes while holding the lock. The lock contains a PID and random ownership token; it is reclaimed only when its owner process is dead (or an invalid lock has remained unreadable for 30 seconds), and release revalidates the ownership token. A live lock is never stolen merely because it is old.

The native generation capacity is globally capped at 10 active `GEN_QUEUED` assets for the entire run, not 10 per process or 10 per `next` call. Concurrent `next` processes serialize through the state lock. If seven live leases already exist, a request for ten can claim at most three.

Each claim contains:

- `runId`
- `batchId`
- `assetId`, `passageId`, `concept`, and `language`
- `attempt` and `promptRevision`
- the immutable prompt text and its `promptHash`
- a single-use `claimToken`
- `leaseExpiresAt`

The default generation lease is 30 minutes. `--lease-ms=<positive integer>` may override it for a `next` call. Both `next` and `recover` expire overdue leases. Expiry releases capacity, records `LEASE_EXPIRED` or `LEASE_MISSING`, increments the prompt revision, and routes the asset through the normal retry/RCA policy. An expired claim token must never be staged.

## Commands

All value-bearing flags use `--name=value` syntax. `--force` is the standalone boolean exception.

### Initialize a run

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts init --run-dir=<directory>
```

Use `--force` only when intentionally replacing an existing state file. Prefer a clean run directory for a new production run. Initialization writes `inventory.jsonl`, freezes the complete source-file SHA-256 and per-passage hashes, and creates two assets per passage.

### Claim native generation work

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts next --run-dir=<directory> --limit=10
```

Optional filters are `--passage-id=<passage-id>` and `--concept=MACHO_BLACK_RED` or `--concept=CUTE_PASTEL`. `--limit` must be from 1 through 10. The returned prompts are the exact prompts that must be sent as separate native Codex image-generation calls. Ten returned items may be submitted concurrently as ten native calls.

The full prompt snapshot is atomically written to `prompts/<passage>/<concept>/attempt-NN.txt`. State stores its immutable path, attempt, prompt revision, required exact-English phrase array, creation time, and SHA-256. A later correction creates a new file; it never rewrites an earlier attempt.

### Stage a successful native result

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts stage `
  --run-dir=<directory> `
  --asset-id=<asset-id> `
  --image=<absolute-native-output-path> `
  --attempt=<attempt> `
  --batch-id=<batch-id> `
  --claim-token=<claim-token> `
  --session-id=<native-session-id> `
  --tool-call-id=<native-tool-call-id> `
  --generator-agent-id=<generator-agent-id>
```

All claim fields must match the active, unexpired lease. The current v2 provenance guard additionally requires:

- `sessionId` contains only letters, digits, and hyphens.
- `toolCallId` starts with `exec-`, contains only letters, digits, and hyphens, and exactly matches the image filename stem.
- The source image is under `C:\Users\jooye\.codex\generated_images\<sessionId>\`.
- A staging or final file cannot be presented as a new native output.
- A native `toolCallId` or output SHA-256 already present in another asset's retained native receipt is rejected. Operationally, every native call must remain globally single-use even after a failed attempt.

The harness resolves the real filesystem path to reject junction/symlink escapes, decodes the native PNG, JPEG, or WebP with strict error handling, and requires a high-resolution tall page: at least 768×1300 pixels with height/width from 1.65 through 2.20. It records dimensions, computes SHA-256, copies bytes unchanged into `staging/<passage>/<concept>/attempt-NN.<ext>`, and rehashes the copy. It then stores a native receipt containing the session, tool call, generator, batch, claim token, attempt, prompt hash, original path, output hash, and staging time. Tool-call IDs and output hashes are retained in an append-only run ledger and remain single-use after retries. Supplying these fields is an audit record; it does not authorize a non-native generator.

### Record a native generation failure

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts generation-failed `
  --run-dir=<directory> `
  --asset-id=<asset-id> `
  --attempt=<attempt> `
  --batch-id=<batch-id> `
  --claim-token=<claim-token> `
  --failure-code=<code> `
  --correction=<concrete-regeneration-directive>
```

This command also requires the exact active lease tuple. It releases the slot, records the failure, increments `promptRevision`, and applies the retry/RCA policy. It must be used for a failed native call; never substitute an external provider.

### Recover expired leases

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts recover --run-dir=<directory>
```

The command is safe to repeat and reports the recovered asset IDs and active counts before and after recovery.

### Record an individual QA report

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts record-qa --run-dir=<directory> --review=<review.json>
```

Each staged image needs two reports from distinct fresh-eyes reviewers:

1. `TEXT_PROOF` checks exact frozen English anchors, a natural and meaning-faithful Korean pair for every anchor, glyph integrity, concept-specific density, cropping, blank bubbles, filler text, watermarks, phone readability, and unchanged native pixels. Korean is not compared to one frozen translation string.
2. `NARRATIVE_ART` checks content coverage, logic, invented facts, engagement, concept-specific panel count, audience age fit, reference-aligned text density, concept fidelity, style consistency, reference independence, and phone readability. For CUTE, a childlike/chibi page or text-heavy page is a hard failure even when individual text remains readable.

Neither reviewer may be the generating agent, and the second reviewer may not reuse the first reviewer's identity. A report is bound to the exact `runId`, `assetId`, `attempt`, frozen `sourceHash`, `promptHash`, staged `imageSha256`, and `generatorAgentId`. Before accepting it, the harness re-reads and decodes the staged image, recomputes its hash, and rehashes the stored prompt snapshot.

Reviewer identities are append-only per asset: an identity used on an earlier attempt cannot review a later attempt of the same asset. A first failing report does not release the asset for retry; the asset remains `QA_RUNNING` until both independent reports are present, so one review can never erase or bypass the other.

The JSON object is exact: every listed key is required and unknown keys are rejected. The following common envelope uses placeholders; the empty `hardGates` and `metrics` objects are not valid reports and must be replaced by the exact kind-specific objects below.

Common fields:

```json
{
  "runId": "codex-native-...",
  "assetId": "<passage-id>__MACHO_BLACK_RED",
  "kind": "TEXT_PROOF",
  "attempt": 1,
  "sourceHash": "<64 lowercase hex>",
  "promptHash": "<64 lowercase hex>",
  "imageSha256": "<64 lowercase hex>",
  "reviewerAgentId": "fresh-eyes-text-01",
  "generatorAgentId": "native-generator-01",
  "pass": true,
  "certain": true,
  "hardGates": {},
  "metrics": {},
  "requiredPhraseEvidence": [],
  "failureCodes": [],
  "correctionDirective": "",
  "evidence": ["Original-resolution and phone-width inspection completed; all required text is legible."]
}
```

For `TEXT_PROOF`, `hardGates` must contain exactly:

```json
{
  "nativeCodexProvenance": true,
  "unmodifiedBytes": true,
  "allRequiredEnglishExact": true,
  "allRequiredKoreanReadable": true,
  "everyRequiredEnglishPairedWithKorean": true,
  "allRenderedKoreanMeaningFaithful": true,
  "noBrokenGlyphs": true,
  "noCropping": true,
  "noBlankBubbles": true,
  "noWatermarkOrFillerText": true,
  "textDensityWithinConceptBudget": true
}
```

Its exact metrics are `textExactness = 100`, `koreanSemanticFidelity >= 95`, `koreanNaturalness >= 95`, and `layoutReadability >= 95`.

`TEXT_PROOF` additionally requires `requiredPhraseEvidence` with exactly one ordered entry per frozen phrase—no missing, extra, duplicate, or reordered entries:

```json
[
  {
    "requiredPhrase": "<exact frozen source substring>",
    "englishTranscription": "<literal English transcription from the pixels; must be identical>",
    "koreanTranscription": "<literal natural Korean text paired with this anchor>",
    "location": "panel 2, upper narration box",
    "englishExact": true,
    "koreanMeaningFaithful": true,
    "koreanNatural": true,
    "readable": true
  }
]
```

`NARRATIVE_ART` does not contain `requiredPhraseEvidence`; the two kinds have different exact top-level key sets.

For `NARRATIVE_ART`, `hardGates` must contain exactly:

```json
{
  "contentComplete": true,
  "logicFaithful": true,
  "noInventedFacts": true,
  "engagingAndCoherent": true,
  "panelCount10To12": true,
  "conceptStyleAccurate": true,
  "audienceAgeAppropriate": true,
  "referenceTextDensityAligned": true,
  "noMixedStyle": true,
  "noReferenceCopying": true,
  "phoneReadable": true,
  "verticalPageAspect": true
}
```

Its exact metrics and thresholds are `contentFidelity >= 95`, `logicAccuracy >= 95`, `engagement >= 85`, `styleFidelity >= 90`, `visualTextBalance >= 95`, and `layoutReadability >= 95`.

For CUTE, `panelCount10To12` is true only at exactly 10 panels because the frozen prompt narrows the general 10–12 rule. Reviewers must inspect both original resolution and a phone-width view. They must reject toddler/chibi/children's-book rendering, dark or saturated full-page fills, pastel used as broad candy-color fill, text that dominates the illustrations, repeated long English, dense recap grids, or paragraph blocks materially heavier than the user's reference. Meaningful visual arrows, hearts, stars, and simple icons are allowed when they contain no broken or invented text and do not introduce unsupported facts.

`pass` is not subjective metadata: it must equal `certain && all hard gates && all metric thresholds`. A passing report uses `failureCodes: []` and an empty `correctionDirective`. A failing report supplies at least one failure code, a concrete full-regeneration directive, and evidence. Any failed hard gate means regenerating the complete page; text must never be repaired afterward.

### Record the required RCA for attempts 6 and later

Failures on attempts 1–5 become `RETRY_QUEUED`. Failures on attempts 6–8 become `RCA_REQUIRED`, and `next` will not reclaim them until an RCA is recorded. Attempt 9 and later become `BLOCKED_RCA`. A blocked asset requires a fresh bound RCA plus the explicit operator flag `--terminal-override`; without that flag it cannot be reclaimed. This preserves fail-closed intervention without making the all-assets completion goal permanently impossible.

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts record-rca `
  --run-dir=<directory> `
  --asset-id=<asset-id> `
  --review=<rca.json> `
  --terminal-override
```

Required RCA shape:

```json
{
  "runId": "codex-native-...",
  "assetId": "<asset-id>",
  "attempt": 6,
  "sourceHash": "<64 lowercase hex>",
  "promptHash": "<64 lowercase hex>",
  "imageSha256": "<64 lowercase hex or null when generation produced no image>",
  "failureHistoryHash": "<SHA-256 of the current serialized failure history>",
  "reviewerAgentId": "rca-reviewer-01",
  "evidence": ["Concrete observed failure and panel location"],
  "rootCause": "Specific reason the prior generation repeatedly failed",
  "correctionDirective": "Specific redesign instruction for a complete native regeneration"
}
```

A valid RCA reviewer must be fresh relative to every generator, individual reviewer, pair reviewer, and prior RCA reviewer associated with the asset. The exact reviewed bytes are atomically archived and hashed. A valid RCA adds the redesigned correction to failure history, increments the prompt revision, and returns the asset to `RETRY_QUEUED`. The next claim advances the attempt and emits a new prompt hash and claim token. Use `--terminal-override` only for `BLOCKED_RCA`; it is rejected as a silent substitute for normal QA.

### Review and approve a concept pair

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts approve-pair `
  --run-dir=<directory> `
  --passage-id=<passage-id> `
  --review=<pair-review.json>
```

Both concepts must be `PAIR_QA_PENDING` with two passing individual reviews. The pair reviewer must be fresh: it cannot be either generator, any individual-review identity recorded across the two assets, or the pair-review identity currently recorded on the assets.

The pair JSON is exact and is bound to both current asset IDs, concepts, attempts, and image hashes:

```json
{
  "runId": "codex-native-...",
  "passageId": "<passage-id>",
  "assets": [
    {
      "assetId": "<passage-id>__MACHO_BLACK_RED",
      "concept": "MACHO_BLACK_RED",
      "attempt": 1,
      "imageSha256": "<64 lowercase hex>"
    },
    {
      "assetId": "<passage-id>__CUTE_PASTEL",
      "concept": "CUTE_PASTEL",
      "attempt": 1,
      "imageSha256": "<64 lowercase hex>"
    }
  ],
  "reviewerAgentId": "fresh-eyes-pair-01",
  "pass": true,
  "certain": true,
  "hardGates": {
    "contentEquivalent": true,
    "conceptsDistinct": true,
    "bothIndividuallyPassed": true,
    "noMixedStyle": true
  },
  "failureConcepts": [],
  "correctionDirective": "",
  "evidence": ["Both pages cover the same source logic while their art directions are unmistakably distinct."]
}
```

Pair `pass` must equal `certain && all pair hard gates`. A failed pair review must name at least one current concept in `failureConcepts` and provide a concrete correction directive; a passing review must use an empty failure list and correction. Artifacts are versioned by both attempt numbers and image-hash prefixes, so a stale pair report cannot silently replace a newer one.

Before approval, the harness decodes and rehashes both staged files. It then copies unchanged bytes to `final/<passage>/<concept>.<ext>`, decodes and rehashes each final copy, and only then changes both statuses to `APPROVED`. A detected byte change aborts approval.

### Status and final verification

```powershell
npx.cmd tsx scripts/codex-native-webtoon-harness.ts status --run-dir=<directory>
npx.cmd tsx scripts/codex-native-webtoon-harness.ts verify --run-dir=<directory>
```

`status` reports source/policy/inventory drift, SQLite revision, active leases, available generation slots, status counts, approved assets and passages, concept totals, and percentage progress.

`verify` fails unless all 9,074 assets are `APPROVED`. It also verifies:

- the frozen source-file, prompt-policy, QA-policy, and inventory hashes plus passage count;
- SQLite asset count and inventory line count;
- both concepts for every passage;
- native receipt presence and globally unique native tool-call IDs;
- both independent QA passes and a passing pair QA bound to current attempts and hashes;
- the bytes and SHA-256 of every current individual and pair review artifact, strict schema revalidation, structured exact-phrase evidence, and reviewer independence/history;
- prompt snapshot file SHA-256 and its binding to the native receipt;
- append-only receipt, review, pair-review, and RCA ledger consistency;
- existence and successful image decoding of the actual native, staged, and final files;
- freshly recomputed SHA-256 equality across native, staged, and final bytes and every recorded hash.

Missing, corrupt, modified, or post-processed files make verification fail. Completion is proven only when `verify` returns `pass: true` with `failureCount: 0`; status counts or recorded hashes alone are not completion evidence.
