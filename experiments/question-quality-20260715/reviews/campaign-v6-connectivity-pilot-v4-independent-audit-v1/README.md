# Campaign v6 connectivity pilot v4 — independent hostile audit v1

Verdict: **FAIL** (`critical` blocker).

This is a pure offline software audit of `campaign-v6-connectivity-pilot-v4`. The author report and author hashes were treated as claims to test, not as authority. The target package was not modified. No live execution, public metadata capture, network/provider/model/API call, database or browser access, real credential/environment-file read, API-candidate consumption, or global-ledger mutation was authorized or performed.

## Blocking results

The advertised compiler closure is incomplete. Independent TypeScript resolution reproduces the author's `192 AST source + 4 declared data = 196` rows, but the inherited v2 compiler also iterates a literal `SOURCE_PATHS` array and calls `readFileSync` on all 32 rows. Three of those live file inputs are outside both the 192 AST rows and four declared-data rows: `openrouter-question-parser.ts`, `harness/atlas-controller.ts`, and `harness/ledger.ts`. The actual unique file-input closure is therefore 199, not 196. Mutating each omitted row in memory changes the inherited closure commitment, inherited private semantic hash, and v4 private semantic hash while the advertised compiler-closure commitment stays unchanged.

`capture-price-snapshot.mts` is one of the four declared live entrypoints, but its direct CLI guard calls `main()` without reading the sealed protocol or checking `liveExecutionAuthorized`, `hostileAuditPassed`, or `dispatchCommandPresent`. With an output argument it can enter three external GETs (one models request and two endpoint requests) while all three authorization flags remain false. This violates the required all-live-entrypoint CLI block.

The production cost settlement also underreports post-send failures. Independent pure fault fixtures and static dataflow confirm that HTTP-status, parser, and cost-cap failures can carry a finite positive `usage.cost`, yet no assignment evidence is persisted; final global settlement reads success evidence plus `state.actualCostUsd` and records zero. No fixture invoked the network or mutated the ledger.

The exact response-schema/parser contract otherwise passed the required direct negative tests against both real sealed schemas: only `finish_reason=stop` is accepted; `length`, `content_filter`, `tool_calls`, `null`, and omission are rejected; exact recursive extra/missing/type/enum/min/max/pattern/cardinality checks pass; exactly one choice/question is required; usage is safe-integer/nonnegative with exact totals; cost and route/model evidence are checked. A separate defense-in-depth observation is recorded because an extra `message.tool_calls` field can coexist with otherwise valid `stop` content; that is not counted as a blocker for the specified finish-reason/content-schema contract.

## Independent results

- AST/import closure reproduction: `192 source + 4 declared data = 196`; independent TypeScript resolver plus AST, `@/` alias, static imports/exports, import-equals, literal dynamic import and literal `require`; unresolved local and nonliteral dynamic counts are both zero.
- Advertised 196-row set-and-bytes SHA-256: `392d53c829803775987a6585976a8011ff0659feaf65f70e539ddf6f7f34c19f`. It is not the full file-input closure.
- Actual unique compiler file-input closure: 199 rows after adding the three unadvertised literal `SOURCE_PATHS` reads. All 199 possible single-row deletions are rejected by independent length and hash equality.
- Historical v3 32-row list exactly matches the inherited compiler's literal `SOURCE_PATHS`: 29 rows overlap the advertised 196 and 3 omitted rows are active file inputs. It is not authority, but it exposed inputs that the v4 closure incorrectly discarded.
- Live closure: exact `8 source + 3 runtime data = 11`; test support, verifier, build, and offline-test files are absent.
- Exact live closure set-and-bytes SHA-256: `b557909aedf6bc7910750a3bf4da77755ee16587f86e33915b9d5d7268efe6ef`.
- Protocol/private/public/compiler/live/manifest/author-report byte and semantic bindings all validate independently. v2/v3 manifest hashes match the earlier independent-audit baselines and every manifest row matches current bytes.
- The author `build --check`, verifier, scoped `tsc`, and offline tests all reproduce successfully, but they are corroboration only. A fifth compiler probe injects synthetic nonsecret values into all relevant ambient configuration families and still gets exact build parity.
- A separate nonblocking fail-closed ledger fault is documented: the first journal append occurs after global reservation but before entry into the settlement-protected `try`, so an append fault can strand the two-candidate reservation without making a network call.

## Reproduce

From the repository root, using the already-installed local Node dependencies:

```powershell
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1/run-author-gates.mts --write
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1/build.mts --write
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1/build.mts --check
node node_modules/typescript/lib/tsc.js -p experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1/tsconfig.json --pretty false
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1/verify.mts
```

Do not run any v4 live entrypoint during audit reproduction. Even after remediation, this review remains **offline structure only; separate authorized version required**.

Machine-readable detail is in `report.json`, `evidence.json`, and `author-gates.json`.

## Reproducibility note

`author-gates.json` deliberately excludes wall-clock runtimes and normalizes
both Node test-reporter per-test `(…ms)` timings and aggregate `duration_ms`
values before hashing or retaining transcript summaries. Those values are
execution noise, not source evidence. `build.mts
--write` regenerates the complete nine-row review manifest after regenerating
the report, and `build.mts --check` verifies both report bytes and the manifest.
Two consecutive executions over identical repository bytes must therefore
produce byte-identical sealed review artifacts.
