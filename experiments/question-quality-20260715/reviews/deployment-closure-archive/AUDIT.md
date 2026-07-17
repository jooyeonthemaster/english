# Production deployment closure archive audit

## Verdict

- **Raw Vercel source-input closure: PASS within the declared static-analysis boundary.** Every archived closure byte is recoverable from a pinned Git revision plus an explicit raw/LF/CRLF transform, or from one ignored private content-addressed blob. The offline verifier rebuilds the graph and validates every Vercel UID.
- **Compiled production-runtime byte parity: BLOCKED.** This is a closure over the raw source inputs uploaded to Vercel, not over the compiled Next.js Lambda bundles. Vercel exposes the build outputs here as Lambda descriptors rather than the raw source-file objects used by this archive.
- **Trigger worker source-byte parity: BLOCKED.** Trigger metadata strongly correlates version `20260714.1` with the same dirty local snapshot, but its API exposes an opaque bundle `contentHash`, not per-source-file bytes or digests.

No OpenRouter/model, browser, application database, or production mutation call was made. Remote access was limited to read-only Vercel deployment-file APIs and read-only Trigger deployment/run metadata APIs.

## Frozen identity

| Item | Value |
|---|---|
| Vercel deployment | `dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD` |
| Production URL | `nara-qn6rcsvkh-jooyoens-projects-59877186.vercel.app` |
| Vercel source deployment time | `2026-07-14T14:55:04.535Z` (`2026-07-14 23:55:04.535 KST`) |
| Metadata Git SHA | `467c6d107137a91088d3eba1620ba4036a63d709` |
| Metadata branch | `20260714jooyeon` |
| Dirty deployment | `true` (`gitDirty=1`) |
| Final capture time | `2026-07-14T19:04:43.478Z` (`2026-07-15 04:04:43.478 KST`) |

The Git SHA is metadata, not the source identity. The source identity is the pinned Vercel path/UID index plus the closure manifest and four private raw blobs below.

## Root set and resolver

The union closure begins at 15 roots:

- Three question-generation routes: the legacy auto route, the workbench enqueue route, and the workbench fast route.
- Four provider roots: `atlas-ai`, `atlas`, `atlas-chat-rest`, and the question-generation LLM facade.
- One Trigger task root: `workbench-question-generation`.
- Seven build/runtime evidence roots: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `vercel.json`, `trigger.config.ts`, and `prisma/schema.prisma`.

The resolver parses deployed bytes with the TypeScript parser and recursively follows:

- static `import` and `export ... from` declarations, including type-only edges;
- literal `import()`, `require()`, and `require.resolve()` calls;
- literal `new URL(..., import.meta.url)` asset references;
- relative references and the deployed `@/* -> src/*` alias.

Computed expressions are recorded by location, AST kind, and expression SHA-256 without retaining the expression text. The final graph contains no computed import/require/asset expression, no ambiguous resolution, and no unresolved static local reference.

## Closure result

| Measure | Result |
|---|---:|
| Pinned raw source-input files available for resolution | 4,410 |
| Union closure files | 245 |
| Local dependency edges | 722 |
| Type-only local edges | 110 |
| External package references | 98 |
| Parsed source files | 235 |
| Non-source evidence/data files | 10 |
| Unresolved static local references | 0 |
| Ambiguous local resolutions | 0 |
| Computed import/require/asset references | 0 |

Type-only edges are intentionally retained. Consequently, this is a conservative source closure and can be larger than a tree-shaken runtime bundle.

## Git reconstruction and private archive

The verifier compares the raw deployed UID against every content-changing Git revision for that path using raw, LF-normalized, and CRLF-normalized bytes.

| Reconstruction class | Files |
|---|---:|
| Exact Git raw bytes | 94 |
| Git bytes transformed to CRLF | 147 |
| Git bytes transformed to LF | 0 |
| Not reconstructable from Git; private blob required | 4 |

The four non-Git files are:

| Deployed path | Vercel UID | Raw SHA-256 | Bytes |
|---|---|---|---:|
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts` | `745be1479ba240e80cbd96422c0890fd490f0841` | `759cbf4664c6e9bdfcd5dc73edf6b8eaa0b689df3ea605453be9e127ecab9039` | 40,817 |
| `src/lib/question-postprocess/processors/context-meaning.ts` | `14d0d4813ba81bbe58f8569eb780ca04d1725feb` | `190e48e50084e1acd2f973a92443481a0f1a7f666622ce5dd1565c938111ffaf` | 1,052 |
| `src/lib/question-postprocess/processors/reference.ts` | `50822c9839b3cf38a9fa49c73f0c5eba68811fe8` | `aea40e68cc0b091d7af9b83b2cf957cdc3272dc3606acd9634865a07a69060d0` | 1,132 |
| `src/lib/question-quality/validators/sentence-insert.ts` | `f277c154e33104c2c462ae885c3864f22c2e7266` | `60d37028fb25035f7137faa35df1ec8b01ba13a4aa05abf68a4059db3610f63d` | 15,035 |

They total 58,036 bytes and four unique SHA-256-addressed blobs. The private archive index SHA-256 is `208da5aff9bd508790e8e51ba01070cd779e9c4a3c57345b8d37800a69963f1b`.

Raw blobs live only under:

`experiments/question-quality-20260715/private/deployment-closure-archive/dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD/blobs/sha256/`

The parent `.gitignore` excludes all private archive content. The verifier confirms that no raw blob is tracked and that no unreferenced `.raw` blob remains.

## Secret-pattern inventory

All 245 closure files were scanned for provider-style API keys, Trigger keys, GitHub tokens, JWTs, private-key headers, credentialed database URLs, and named hard-coded secret literals.

- Pattern matches: **0**
- Files with matches: **0**
- Public artifact disclosure: counts and exact-match SHA-256 digests only; no match text is ever serialized.

Zero matches means only that the declared patterns did not match. It is not a proof that arbitrary source text contains no confidential information, which is why all non-Git raw bytes remain private anyway.

## Trigger worker evidence

The read-only production-scoped Trigger APIs returned:

| Field | Value |
|---|---|
| Deployment | `deployment_hqeh6ndqz7hwx6vcvebkq` |
| Version / worker version | `20260714.1` / `20260714.1` |
| Runtime | `node-22` (`22.16.0`) |
| Status | `DEPLOYED` |
| Opaque content hash | `ca6a9112457aafae9c6a3f1d0289ddf8` |
| Target task registered | `workbench-question-generation` present |
| Git SHA / ref / dirty | same SHA, same ref, dirty `true` |
| Trigger creation delta from Vercel source deployment | +19,586 ms |

The raw image reference and `externalBuildData` values were not retained. Only their SHA-256, key names, and non-secret deployment metadata were kept; the returned external-build keys include `buildToken`, so retaining the original object would have been unsafe.

The exact target-task run query returned 100 rows in the 90-day window. Its latest observed run was `2026-06-09T10:42:31.099Z` on worker version `20260605.5`; no run on `20260714.1` was observed. Therefore the July worker is registered, but this evidence does not prove that the current worker version has executed a question-generation task. The APIs also do not expose whether a matching deployment was created with `--skip-promotion`.

## Runtime and completeness limits

This audit deliberately does not turn the following into false parity claims:

1. **Compiled Vercel output.** Next.js bundling, tree-shaking, route manifests, and Lambda packaging can alter the runtime graph. The raw source closure does not reconstruct those bytes.
2. **External packages.** Bare imports such as `ai`, `@prisma/client`, `@trigger.dev/sdk`, Next.js, and Zod stop at the package boundary. `package-lock.json` is pinned, but installed package bytes and native artifacts are not archived here.
3. **Prisma generation.** `prisma/schema.prisma` is pinned as a build input. Generated Prisma client bytes, engines, migrations applied to production, and database schema state are not proven by that source file.
4. **Runtime data.** Database rows, environment values, remote configuration, model-provider state, and filesystem reads not expressed as a supported literal module/asset reference are outside the graph. No database was queried.
5. **Environment discovery.** Direct static `process.env.NAME` access is inventoried by name only. Indirect helper calls, computed names, framework-injected variables, and the values themselves are not claimed complete.
6. **Generated/data-driven imports.** There are zero computed import/require expressions in this closure, but reflection, globbing, generated code, package-internal data loading, and non-module I/O can still add runtime dependencies.
7. **Trigger build.** The matching Trigger `contentHash` is useful correlation evidence but cannot be compared to Vercel source UIDs. Trigger source-byte equality remains unproven until Trigger exposes a source archive or per-file digest map.

## Verification and hashes

Run the fully offline verifier after the four private blobs are present:

```powershell
node experiments\question-quality-20260715\reviews\deployment-closure-archive\verify-deployment-closure.mjs
```

The final verifier result is `PASS` and rechecks the path/UID index, reconstructs all 245 closure files, rebuilds all 722 edges, recomputes the secret inventory, checks public artifacts for exact matched-secret leakage, and verifies private-archive isolation.

| Artifact | SHA-256 |
|---|---|
| `deployment-source-file-index.json` | `655f1b42d53e9c19a6a4b0cba703a8fc42242ea9a19af97ee756c2f848be2008` |
| `deployment-closure-manifest.json` | `9a3364beaf64fa205e8226a2c5328e4bd6dfc967dd72b3b4430677dd71947124` |
| `deployment-secret-pattern-inventory.json` | `9103bb837f9b5aff0f038ce4b97d99b6cd29471be60fae664e01cd46d3515798` |
| `trigger-worker-provenance.json` | `51dfcf1bf500c18060b82ab0abb16e9297462deba3d08d5d0e155f477b38df11` |
| `capture-deployment-closure.mjs` | `69bf8d357a78ffbb2a59b49ac5bce3fa48f86d4e93b31bfeb42b87359025a032` |
| `deployment-closure-lib.mjs` | `b05683ce4daba1605a488095f7df1fcc34f63116832db81746ceb9882fbb4669` |
| `verify-deployment-closure.mjs` | `40b78b5b708fbea91a6e85ccff75da265e905822c14c97635ed5a2665aec9625` |
| `deployment-closure-verification.json` | `ebad6dcd40d7ecace515678319878a91cd61262f88ce965bbc769e7b361fa456` |

The capture manifest pins the capture script and closure-library hashes. The verification report pins the verifier hash separately.

## Read-only API references

- Vercel REST API deployment-file endpoints: <https://vercel.com/docs/rest-api>
- Trigger deployment list: <https://trigger.dev/docs/management/deployments/list>
- Trigger deployment detail: <https://trigger.dev/docs/management/deployments/retrieve>
