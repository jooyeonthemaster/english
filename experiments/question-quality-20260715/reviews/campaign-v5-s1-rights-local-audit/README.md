# Campaign v5 S1 local rights/provenance audit

## Verdict

**BLOCKED — no documented selected-row provider-processing rights.** This is a bounded local evidence audit, not a legal opinion. It does not establish that the material is necessarily unusable; it establishes that the frozen S1 controller has no local, row-bound evidence that is sufficient to admit any of its 180 assignments.

No network, model API, live database read, database write, or secret access occurred. The global API-candidate counter remains `0/1,000`.

## Frozen aggregate result

| Provenance class | Passages | Assignments | Local rights verdict |
|---|---:|---:|---|
| `repo-official / EXAM` | 9 | 134 | Blocked: official-source provenance is not itself a licence to reproduce and transmit full text through an external model-processing chain. |
| `db-global / HANDOUT` | 3 | 46 | Blocked: no row-bound uploader/academy/owner attestation or licence is retained in the sealed evidence. |
| **Total** | **12** | **180** | **All blocked; campaign-eligible assignments = 0.** |

The question-type split is Grammar 6 passages / 96 assignments and Blank 6 passages / 84 assignments. All 12 selected public source-frame rows say `rightsRecord=NOT_PRESENT_IN_SNAPSHOT`, and all 12 remain `campaignEligible=false`. The same absence applies to all 186 grammar-frame rows and all 157 blank-frame rows.

## What the local evidence does and does not prove

- The frozen v3 snapshot gives deterministic content, document, and history provenance. It joins all 12 selections exactly, but its selected candidate/document records contain no copyright, licence, or provider-processing permission field.
- The tracked official-exam repository evolved through 1,634, 4,546, and 4,537-row revisions. An all-row field scan at each revision found source/exam metadata but zero rights-like fields. The current nine selected repository rows therefore have traceable origin but no locally retained permission record.
- `Passage` and `SourceMaterial` retain source type, source reference, file lineage, and creator metadata, but neither model has a content-rights or processing-permission field. For the three HANDOUT rows, the sealed snapshot therefore cannot establish an ownership/permission chain.
- The current terms require members not to upload infringing material and allow the company to process input/output data for service delivery and quality work. Those are relevant general clauses, but they neither bind a rights record to these 12 rows nor explicitly grant a named model-processing chain a content licence or sublicence. They also do not establish that the nine repository rows came from a member upload covered by those terms.
- Onboarding validates a required agreement checkbox, but the local schema/route does not retain a required-terms version and acceptance timestamp. The scoped 157-file upload/import/persistence scan found no upload-time content-rights attestation control.

## Exact authority still missing

Execution can close the source-rights hold only after a deterministic gate can bind every selected passage to unexpired evidence:

1. For each repository EXAM row, a licence or rightsholder permission record covering full-text reproduction and transmission through the approved external model-processing chain for the S1 research and question-generation purpose.
2. For each HANDOUT row, an uploader, academy, owner, or licensor attestation with identity, timestamp, terms/version, source binding, and authority scope covering the same processing.
3. A 12/12 row-to-record binding checked before registry admission. A provenance label, source URL, official-exam label, generic terms acceptance, or absence of a complaint must not be treated as permission.

Endpoint privacy/retention, provider allow-listing, limited credentials, fresh pricing, and exact-wire preflight are separate holds and were not decided here.

## Privacy boundary

The public artifact contains only aggregate counts, paths, file-level hashes, Git commit hashes, and categorical verdicts. It contains no passage text, row ID, content digest, source ID, assignment ID, academy identifier, or credential value. The verifier reads private sealed inputs locally, reconstructs only aggregates, and scans the public result and this README for accidental exact-value leakage.

Key sealed evidence includes:

| Evidence | SHA-256 |
|---|---|
| S1 private queue file | `ba2e64ea9989d594147019c3cf88b066266bbeff11eefb74cb8299732af52583` |
| Grammar public source frame | `95aee407c00ee294d7e6acecd1a2720b355c46df844af1745eabed5908a68304` |
| Blank public source frame | `7a2d73fccbc7322e0e6a3d634f2402f1f99c1c6d3ac6be9360eaabfb78248f79` |
| Frozen v3 private snapshot | `53bf493d6392c462824dcddd2ecfdc5dfdc0810a4ab2829db5b9993b1799e92a` |
| Current official-exam repository | `4337bc34ba2f98cf9af708cdf27d27219fe7599bf30f03fb5fd4698e84347a6f` |
| Scoped upload-flow source projection | `9ef98177b2dc15e650531275889335e0dac1ef1c963192f88e2484c00ac1ca3a` |

The complete path, byte-count, and SHA-256 ledger is in `audit-result.json`.

## Reproduce offline

```powershell
node experiments/question-quality-20260715/reviews/campaign-v5-s1-rights-local-audit/verify.mjs
```

The verifier uses only local files and read-only Git objects. It does not call a model, network, database, or secret store.
