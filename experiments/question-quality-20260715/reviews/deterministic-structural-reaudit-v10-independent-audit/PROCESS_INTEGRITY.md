# Process Integrity and Blindness Qualification

## What happened

The author seal was verified first and returned:

`SEAL 2ddce4ecbebdcbb5d411a812185f2613d3639a727ab4ded3e8aa594c231fbc03`

The next attempted command was intended to print only JSON property names. It used PowerShell `Get-Content -Raw | ConvertFrom-Json` without forcing UTF-8. Parsing failed, and PowerShell embedded a large portion of the raw JSON input in its error record. That console output exposed some `expected` and `oracleReason` values to the supervising agent before predictions were generated.

This was a process failure. The audit therefore does **not** claim perfect supervisor-level blindness.

## Computational isolation used after the failure

No prediction was generated before the failure was recognized. A mechanical extractor was then created and run in a separate Node process. It:

- removed source IDs, pair IDs, expected labels, oracle reasons, and authoring order;
- shuffled cases from the pre-existing author seal and assigned neutral `B001`–`B200` IDs;
- removed fixture analysis fields `unitAnalysis`, `leadingReference`, `carrier.quotedText`, and `renderedLabelInventory.state`;
- whitelisted only production-observable fields needed by each adapter;
- wrote the blind payload and a separately sealed map;
- recorded extractor, source, blind-payload, and map hashes.

A fresh TSX process then:

- read only `blinded-cases.json` as case data;
- recursively rejected oracle/rationale/pair fields;
- dynamically imported the current production validators;
- asserted that no credential-named environment variables were inherited;
- replaced `fetch`, HTTP(S), TCP, TLS, and DNS entry points with throwing guards;
- invoked actual production functions for every case;
- wrote `predictions.json` and `PREDICTION_SEAL.json` atomically before any adjudication.

The pre-adjudication prediction hash is `fc5a1dfe5fbc198eaf9488daf07f9c4c8745f2344a4cd29bdc142c06f37657f6`.

## Executed runner preservation

The exact runner bytes used before adjudication are preserved in `run_blind_predictions.pre-adjudication-sealed.txt`, SHA-256 `9586c15b3ac1eeb1eb36ea83ff1c7de89b15203982692196c286cb1b18ba9e79`. That equals the runner hash embedded in both the prediction payload and seal.

After adjudication, the active `.ts` copy received type-only cast/lint edits so global TypeScript and ESLint could inspect it. Those edits do not rewrite history: the executed source remains separately hash-verifiable.

## Limits of the claim

The fresh process had ordinary repository filesystem permissions. No kernel-level file-access trace, restricted OS token, container mount allowlist, or filesystem sandbox was installed. The file-access claim is supported by the runner's audited source, explicit input path, projection-key assertions, source closure, and hashes; it is not an OS-enforced proof that arbitrary reads were impossible.

The correct qualification is therefore:

> The prediction artifact is computationally separated and cryptographically pre-adjudication-sealed, but the supervising audit context was contaminated by an earlier console echo and the fresh process was not filesystem-sandboxed.
