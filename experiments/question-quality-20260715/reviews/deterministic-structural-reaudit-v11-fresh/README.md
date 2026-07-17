# Fresh deterministic structural re-audit v11

This directory is an independent, synthetic, source-aware holdout audit of the
current production validateQuestionQuality entry point. It does not use the
network, an external API, a database, or a generation call. It contains no
production passage, production identifier, credential, or secret.

The chronology is enforced in code:

1. build-corpus.mjs constructs paired controls and single-dimension defects,
   writes corpus.json and oracle.json, and seals both SHA-256 hashes.
2. run-audit.mts verifies those hashes before dynamically importing the
   production validator. It then writes results.json, report.md, and
   chronology.json.
3. finalize-manifest.mjs hashes the public artifact set and copies the exact
   production-source snapshot from the evaluation result.
4. verify.mjs independently checks the seal, pair balance, confusion matrix,
   source hashes, artifact hashes, chronology, and public-data hygiene.

The holdout spans generic option and answer envelopes, ordering and insertion,
single/multi/key-expression blanks, grammar error/combo/correction, vocabulary,
antonym, implied meaning, summary, topic, irrelevant-sentence structure,
Korean common contracts, and bidirectional English/Korean dispatch boundaries.
Every family has three synthetic source variants and a control/defect pair.

Run from this directory:

    node build-corpus.mjs
    npx tsx run-audit.mts
    node finalize-manifest.mjs
    node verify.mjs
    npx tsc -p tsconfig.json --noEmit
    npx eslint build-corpus.mjs run-audit.mts finalize-manifest.mjs verify.mjs audit.test.mjs
    node --test audit.test.mjs

report.md is the short verdict. results.json contains both the production
blocking confusion matrix (severity=error) and the exact pre-sealed target-code
matrix, plus per-family and per-code defect taxonomies.
