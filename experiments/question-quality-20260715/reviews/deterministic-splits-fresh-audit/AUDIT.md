# Deterministic policy-severity splits — fresh-eyes audit

Date: 2026-07-15 KST  
Scope: sentence-order structural splits; summary-MC direction and completion
splits; blank explanation numbering and paraphrase-residual splits; grammar
keyPoint ghost-label and terminology splits; policy-map isolation  
Safety: model/API calls 0; browser calls 0; network calls 0; database reads/writes
0; production edits 0

## Verdict

**FAIL / BLOCK.** The policy-map separation itself is correct, and the intended
positive controls work. The current detectors are not yet precise enough to be
accepted as publication invariants: the fresh audit reproduced multiple fatal
false positives and multiple salvageable false negatives.

This verdict is about the frozen source snapshot recorded in `RESULTS.json`.
It does not invalidate the split-by-severity design. It says the new fatal
subsets need tighter lexical/structural boundaries before they can be used in a
production-identical campaign.

## What passed

- All nine new fatal codes are in `RELAXED_BLOCKING_QUALITY_CODES` and absent
  from both `SALVAGE_RELAXABLE_CODES` and `SHIP_FIRST_WARNING_CODES`.
- The retired `grammar-nonstandard-terminology` code is absent from all three
  policy maps.
- Whitespace-only sentence-order paragraphs emit
  `sentence-order-empty-paragraph`; uppercase `(A)` contamination emits the
  dedicated given-label fatal.
- Missing and clearly grammar-task summary directions emit their dedicated
  fatal codes, while the canonical summary-completion direction passes.
- Clear circled narrative steps emit the new fatal; terse option verdicts such
  as `①은 범위를 과장해 오답이다` pass.
- An exact transformed-answer residual emits the new blank fatal.
- A plain `(F) ...` keyPoint against rendered `(A)`–`(C)` labels emits the ghost
  fatal.
- `전사구` and `계사` are separated into error and register findings;
  `관계사` is a clean near-negative.
- `equity to learning` emits the new summary-completion fatal, while
  `opportunity to learn` passes; the broad grammatical
  `question of access to learning` signal remains only the old craft warning.

## Blocking findings

### F1 — summary completion suffix test mistakes valid infinitives for gerunds

Severity: **major; fatal false positive**

The fatal regex treats every token ending in the letters `ing` as a gerund.
It therefore emits `summary-mc-correct-completion-ungrammatical` for both of
these grammatical completions:

- `The program offers an opportunity to spring into action.` → matched
  `opportunity to spring`;
- `Leaders accept a responsibility to bring evidence forward.` → matched
  `responsibility to bring`.

The existing regression covers `to learn`/`to improve`, but not base-form verbs
whose spelling happens to end in `ing`. A fatal detector cannot use
`[a-z]+ing` as a part-of-speech test.

### F2 — competing-task direction detection is both overbroad and incomplete

Severity: **major; fatal false positive plus publication false negative**

The valid direction
`Complete the summary by choosing the grammatically correct words for (A) and (B).`
is rejected as a grammar task because `grammatically correct` is matched without
requiring an underlined-expression/grammar-question frame.

Conversely,
`Choose the phrase that best fits the blank in the passage.` is a clear
blank-inference task, but it receives only the nonblocking
`summary-mc-direction-frame` warning. Blank inference is absent from the
competing-task inventory. A student can therefore receive the wrong task
direction through the fallback ladder.

### F3 — circled-numbering classification confuses option analysis and misses fragments

Severity: **major; fatal false positive plus false negative**

This legitimate option-by-option explanation is fatally rejected:

`① 먼저 제시된 해결책만 충분하다고 보므로 오답이다. ② 다음으로 기술의 효과를 즉각적이라고 가정하므로 오답이다. ③ 마지막으로 지문의 결론과 일치하므로 정답이다.`

The discourse adverbs override the explicit `오답/정답` verdicts because the
sentences do not use one of the narrow concrete-trap words.

At the other boundary, the narrative fragment list
`① 빈칸 대조 확인 ② 근거 방향 확인 ③ 이를 종합` emits neither the fatal nor
the broad warning. Only the first marker is tokenized because subsequent
markers are not preceded by punctuation or final `다`.

### F4 — common list prefixes bypass the ghost-label fatal

Severity: **major; salvage path can expose a nonexistent label**

The exact-start `(F)` case is caught, but `• (F) ...` and `1. (F) ...` are not.
They fall back only to `grammar-keypoint-choice-mismatch`, which is
salvage-relaxable. Thus a visibly nonexistent label can still be published in
scarce mode when the model adds an ordinary bullet or list number.

### F5 — sentence-order normalization leaves visually empty/lowercase cases salvageable

Severity: **major; structural false negatives**

- A paragraph containing only U+200B ZERO WIDTH SPACE does not emit
  `sentence-order-empty-paragraph`; it emits only the salvageable
  `paragraph-too-short/thin` craft codes.
- A given block containing lowercase `(a)` does not emit
  `sentence-order-given-contains-paragraph-label`, while uppercase `(A)` does.

Both cases render as the same structural defect the new fatal split was meant
to isolate.

### F6 — residual-answer matching has incompatible boundary behavior

Severity: **major; fatal false positive plus false negative**

- Correct option `public art` is declared verbatim-visible merely because the
  passage contains the unrelated longer token `public article`.
- Correct option `evidence-based reasoning` is not declared visible when the
  passage exposes `evidence based reasoning` without the hyphen.

Multiword matching currently uses raw substring containment after only
case/whitespace normalization. It needs token boundaries and a deliberately
defined punctuation/hyphen normalization policy.

### F7 — the specialist-register `계사` regex catches ordinary lexical words

Severity: **moderate; retry/cost false positive, salvageable**

`예문의 주어는 그 회계사이고 동사는 reviewed이다.` is flagged for specialist
grammar register because `회계사` contains the substring `계사`. The negative
lookbehind protects only `관계사`. This does not create a fatal publication
error because `grammar-terminology-register` is salvageable, but it creates
unnecessary strict/relaxed retries and undermines the intended factual/register
split.

## Policy-map result

The map audit found **0 fatal-policy violations** across these nine codes:

`sentence-order-empty-paragraph`,
`sentence-order-given-contains-paragraph-label`,
`summary-mc-missing-direction`, `summary-mc-direction-task-mismatch`,
`blank-explanation-narrative-circled-numbering`,
`blank-paraphrase-correct-residual-visible`,
`grammar-keypoint-nonexistent-label`, `grammar-terminology-error`, and
`summary-mc-correct-completion-ungrammatical`.

The adjacent broad signals retain their intended lower severity. In particular,
`summary-mc-direction-frame` and `blank-explanation-step-numbering` are emitted
as warnings, and `summary-mc-awkward-collocation` is downgraded through
SHIP_FIRST. `grammar-keypoint-choice-mismatch` and
`grammar-terminology-register` still block strict/relaxed attempts but are
salvage-relaxable; that is the current ladder behavior, not a universally
nonblocking warning.

## Verification

- Focused existing regression suite: **36/36 PASS**.
- Full TypeScript check: **PASS** (`npx tsc --noEmit --pretty false`).
- Audit script and verifier ESLint: **PASS**.
- The broader grammar-generation suite run during this audit was **141/142**;
  the sole failure was the already separate
  `grammar-decoy-filler-span` expectation for the structurally loaded KILLER
  fixture, not one of these deterministic split codes.
- Independent replay: **PASS**. `verify.mjs` reruns the audit through the local
  TSX runtime, compares the full semantic JSON snapshot, rechecks all zero-call
  counters, and fails on audited source/test hash drift.

Artifact SHA-256 values at audit completion:

- `audit.mts`: `ce783efe30a9246f3a21cae532a871bf36f5cf3398c368c87a8c50f8873f2380`
- `RESULTS.json`: `91d8ed24a07c7c755d7304a15fbc4027c0f64f5154224e60fafe3e96373c41b5`
- `verify.mjs`: `3dcdfdb79cf1c2de7a2962588459317a5be778e712995735c08f8aefa528f42e`

`RESULTS.json` additionally pins SHA-256 values for the seven production files
and six focused test files used by the audit.

## Required remediation before acceptance

1. Replace the `...ing` suffix heuristic with a genuinely high-precision
   construction check and add base verbs ending in `ing` (`bring`, `spring`,
   `sing`, `ring`) as adversarial negatives.
2. Scope grammar-task direction matching to an actual grammar-question frame;
   recognize blank-inference directions as a competing task; add mixed valid
   summary constraints as negatives.
3. Tokenize every circled marker independently of preceding punctuation, then
   classify a clause ending in an explicit option verdict as an option analysis
   even when it begins with `먼저/다음으로/마지막으로`.
4. Strip common bullet/list prefixes before checking the leading keyPoint label,
   while retaining the original student-facing string for evidence.
5. Remove Unicode format-only characters before sentence-order emptiness checks
   and normalize paragraph-label case consistently.
6. Give multiword residual matching token boundaries and normalized hyphen/dash
   equivalence; add unrelated longer-token and punctuation-variant pairs.
7. Anchor `계사` as a Korean lexical unit that may take particles but may not be
   embedded in words such as `회계사`.

After those changes, rerun this fresh verifier and add the repaired boundary
cases to the production unit suites before changing the overall verdict.
