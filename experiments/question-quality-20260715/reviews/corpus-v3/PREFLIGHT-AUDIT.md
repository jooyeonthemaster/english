# Corpus v3 preflight audit

Date: 2026-07-15 KST  
Disposition: **HARD FAIL — candidate supply shortage; no operational manifest or blind packet**

## Integrity result

- Pinned snapshot: `c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13`
- Pinned rebuild: PASS, zero findings
- Live code/repository/history/DB drift: PASS, zero mismatches
- Public snapshot SHA-256: `ada79827bddebede2549096a6ef61c31fc6e22d3e3fd75bfb91b36b4a3c0b597b`
- Public preflight SHA-256: `e4fc9129c714d1b167b2f5fa66d16a056cc9af7b1aad3323096986eee2d88ebe`
- DB writes: 0; model/API/browser calls: 0

The selector was rebuilt from the private pinned snapshot, not from changing
live roots. A second, separately reported live check found identical code,
repository passage, antecedent-history, and database extract hashes.

## Preregistered queue math

Every rate is the exact one-sided 95% Clopper-Pearson lower bound of the frozen
past audit stratum. Every queue is the smallest `n` for which the binomial
probability of reaching the target is at least 95%.

| Panel | Frozen evidence | New PASS target | Conservative rate | Required queue | Eligible pool before cross-panel allocation |
|---|---:|---:|---:|---:|---:|
| Grammar killer | 19/52 | 66 | 0.25417 | 307 | 599 |
| Blank killer | 19/45 | 66 | 0.29696 | 262 | 59 |
| General dev DB | 10/30 | 23 | 0.19331 | 158 | 154 |
| General dev repo | 22/30 | 11 | 0.57007 | 26 | 801 |
| General holdout DB | 4/30 | 29 | 0.04685 | 815 | 154 |
| General holdout repo | 21/30 | 12 | 0.53493 | 30 | 801 |

## Blocking findings

1. Blank supply is structurally insufficient even before pass/fail auditing:
   only 59 passages satisfy the actual source `originalType=빈칸추론`, high
   confidence, and `reconstructionKind=blank` gate. This is fewer than the 66
   required PASS rows and 203 fewer than the statistically required queue.
2. The entire eligible global DB general pool is 154 passages. The holdout DB
   stratum alone requires 815 queue rows because its frozen pass evidence is
   4/30. Dev+holdout queues must also be mutually exact/near disjoint, so no
   allocation can satisfy both.
3. After scarce focus allocation and global exact/near separation, the DB and
   general-repo queues also fail preregistered length/discourse concentration
   limits. The selector did not relax those limits.

Because these are supply constraints, generating a blind packet would falsely
signal that the preregistered audit can finish. The packet builder was executed
as a negative check and correctly refused to run without operational manifests.

## Required next decision

Do not lower targets, reuse exposed passages, broaden blank eligibility to mere
tags, or average DB/repo strata together. A future v4 must first preregister one
of: new independent official blank supply; a justified target redesign with
power/precision analysis; or a pilot that produces defensible new DB-stratum
pass-rate evidence. Any such change is a new campaign, not an edit to this v3
lineage.
