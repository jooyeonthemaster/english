# Campaign v6 connectivity pilot v5 — independent correctness review v1

Verdict: **FAIL_BLOCKERS**

This review independently inspected the frozen subject at `execution/campaign-v6-connectivity-pilot-v5`. The author's conclusions were not used as premises. Four requested counterexamples were reproduced. All 39 non-private subject-manifest entries matched at both the start and end of reproduction; the snapshot hash remained `24ff47fc58580de5f0341e220ebde8c491fa61fe507196739648e4d70f93539b`.

No network, credential, global-ledger, API, model, database, or private exact-wire access occurred. The repository-transaction reproduction created and removed files only in this review directory. The subject was not modified.

## Blocking findings

### C1_VALID_WRAPPER_CARDINALITY_UNDERCOUNT

Two syntactically valid JSON values each structurally carrying two question objects were independently passed to `observeRawCandidateCardinalityV5`:

- root array: `[{"questions":[{"id":1},{"id":2}]}]`
- root string containing JSON: `"{\"questions\":[{\"id\":1},{\"id\":2}]}"`

Both returned `fullQuestionObjectsObserved=0`, `candidateUnitsEffective=1`, and `cardinalityAmbiguous=false`. The cause is the object-only conversion at `strict-json-observer.ts:268`: arrays and strings become `null` before the bounded question traversal at line 270. A valid wrapper can therefore contain affirmative multiplicity while being accounted as one non-ambiguous candidate.

This contradicts the frozen contract's intended valid-JSON ambiguity/cardinality accounting. Parser rejection later does not repair the already understated candidate count.

Required correction: traverse every valid JSON root shape that can contain or wrap a model envelope, or mark any unsupported valid root container/string with affirmative nested model structure as ambiguous. Regression cases must assert either effective count at least two or ambiguity true.

### C2_CLOSED_TEMP_PATH_IDENTITY_NOT_REATTESTED

The review-local transaction reproduction changed the temporary path's identity after its handle had been closed and before commit:

- before: device `3807829001`, inode `281474979336136`
- after: device `3807829001`, inode `281474979336137`

The mutation requested `{"identity":"transaction-created-node","amount":1}`. The replacement path contained `{"identity":"replacement-path-node","amount":999}`. The transaction nevertheless returned `committed=true` with no cleanup warning, and the replacement bytes became the target.

The file-identity gap is visible in `live-io.ts`: the temporary handle is closed at line 374, the offline hook runs at line 376, only the target is reattested at line 377, and the temporary pathname is renamed at line 379. No temporary-file identity or byte commitment is captured and rechecked before the pathname rename.

Required correction: bind the created temporary object and exact bytes to an attestation and prove the same object remains at the commit pathname immediately before rename. A regression must replace the closed temporary path and require the transaction to fail without reporting commit.

### C3_BUNDLER_IMPLEMENTATION_UNSEALED_NO_INDEPENDENT_EQUIVALENCE

The subject manifest and frozen-runtime artifact seal the three generated bundles, source files, and Node runtime, but not the installed build implementation that maps source to bundle:

| implementation input | observed SHA-256 | in subject manifest | hash in frozen artifact |
|---|---|---:|---:|
| `node_modules/esbuild/lib/main.js` | `b090fe57c79c677256a242703ea07bb2191eced357bece2f9a25539443da070c` | no | no |
| `node_modules/@esbuild/win32-x64/esbuild.exe` | `f0dd2091eaf58d11b96c64e0c4516f8ecf94486a28d2a8e7a968bd6770db3ffe` | no | no |

The artifact records only the name, version string `0.27.3`, and configuration. The build disables source maps and does not persist the esbuild metafile. The verifier rebuilds through the same ambient `buildFrozenRuntimeV5()` path.

An offline ambient rebuild did reproduce all three stored bundles byte-for-byte. That proves reproducibility with the currently installed, unsealed implementation; it does not independently establish the source-to-bundle mapping for the frozen subject. No separate equivalence artifact was found.

Required correction: include hashes and identities for the JavaScript and native esbuild implementation bytes in the subject closure, and preserve independently checkable source-to-bundle provenance (or provide a genuinely independent equivalence derivation). A version string alone is not build provenance.

### C4_INTENT_WRITE_FAILURE_DOES_NOT_GATE_SETTLEMENT

AST-level control-flow inspection confirms:

- terminal-intent write: line 934
- catch assigns `reconciliationError`: lines 935–937
- settlement try begins: line 940
- quarantine/ordinary global settlement calls: lines 942/944

The only intervening top-level statements are two variable declarations. There is no return, throw, or condition on `reconciliationError`. Consequently, after the intent write throws and its error is caught, either global settlement function remains reachable. A later error report cannot undo that control-flow ordering.

Required correction: make successful durable intent recording an explicit precondition for entering either settlement function, and add a fault-injection regression that makes the marker write fail and proves both settlement functions remain uncalled.

## Independent checks that passed

- Model/order/route/reasoning: protocol order is Standard `google/gemini-3.5-flash`, then Premium `google/gemini-3.1-pro-preview`; the runner iterates that array serially and breaks after failure. Endpoint routing is only `google-vertex/global`, fallback is false, required parameters are true, and reasoning is `{enabled:false, effort:"none", exclude:true}`. The public runner validates those exact fields against the committed private wire before use; the private artifact itself was not opened under this review's constraints.
- Price maxima: a synthetic multi-endpoint, override-heavy snapshot produced the independently calculated maxima exactly: input `83`, output `72`, request `0.4`, cache-read `31`, cache-write `41`, and internal-reasoning `51` in the reported units.
- Billing equality: a valid response produced identical cost/token fields in independent billing extraction and the success parser (`0.125`, `11`, `7`, `18`, reasoning `0`, cache `0`). An inconsistent total was made unknown by extraction and rejected by the parser.
- Permanent no-dispatch: all four authorization booleans are false; the permanent gate throws; the production runner reaches it before exact-wire loading; operator and live-child entrypoints also call it.

## Acceptance boundary

The four blockers concern cardinality accounting, temporary file identity, build provenance, and settlement control flow. Permanent no-dispatch limits the current frozen package's execution, but does not make those four correctness claims pass. A successor package needs fixes plus independent regression evidence for each blocker before a `PASS_NO_BLOCKERS` verdict is supportable.

Machine-readable values are in `evidence.json`; `reproduce.mts` performs the offline reproductions; `review.json` is the verdict record; `MANIFEST.sha256` seals the review outputs.
