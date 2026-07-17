# Immutability policy

`MANIFEST.sha256` lists the SHA-256 digest of every payload file in this directory except the manifest itself (standard non-circular convention).

After the final `verify.mjs` pass, every file in this directory, including the manifest, is assigned the Windows read-only attribute. Reproduction is read-only: `verify.mjs` invokes `audit.mts --check`, which does not rewrite results or logs.

