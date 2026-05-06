# M2 Question Set Extraction

> Status: planning baseline  
> Scope: M2 extraction only. Final registration, passage analysis, question analysis, and billing policy are separate follow-up work.

## Purpose

M2 is not a "question-only extraction" feature.

M2 means:

```text
Extract the problem sheet
-> recover the original study passage
-> structure the linked questions
-> save a reviewable draft
```

The product goal is to let teachers build reusable learning assets from a worksheet or problem set:

- a restored passage that can later be analyzed, annotated, and used for question generation
- questions linked to that passage
- evidence and metadata explaining how the restored passage was produced
- a draft workflow that survives refresh/navigation before final registration

M2 should never treat questions as useful standalone data when a passage exists. A question extracted from a passage-based worksheet must be linked back to its passage.

## Current State

Current M2 behavior is roughly:

```text
Upload
-> per-page Gemini structured OCR
-> ExtractionItem rows
-> code-based grouping in extraction-finalize
-> ExtractionResult draft
-> review UI
```

Current model:

- `gemini-3-flash-preview`
- used through Gemini REST in Trigger.dev for extraction
- temperature `0`
- page-level retry and concurrency are already handled by Trigger.dev tasks

Current limitations:

- no original-passage restoration step
- no restoration verification step
- no dedicated draft tables for passage/question registration
- source matching is limited; there is no full local/fuzzy/web source matching pipeline yet
- M2 can show passage and question blocks, but the final product semantics are not yet "restored passage + linked question drafts"

## Confirmed Decisions

### M2 Definition

M2 is:

```text
Passage + question set extraction
```

It must extract:

- problem-sheet passage text
- restored original passage text
- questions
- choices
- answer signals when visible
- printed explanations if present
- source metadata candidates
- restoration metadata
- validation warnings

### Final Registration Is Not Automatic

Extraction creates drafts.

It must not automatically promote results to the final passage bank or question bank.

The teacher must review and confirm.

### Teacher Confirmation Rule

Saving/registration is allowed when the teacher manually confirms the draft.

This is true even when AI restoration failed, as long as the teacher manually edits/checks the result.

### Restoration Failure Rule

If original-passage restoration fails:

- show `restoration failed`
- preserve the problem-sheet passage
- allow teacher editing
- allow final registration only after teacher confirmation

The system should not silently save a problem-mutated passage as a clean study passage.

### Model Policy

Use `gemini-3-flash-preview` for all extraction stages initially.

However, implementation should allow later model separation by stage:

- OCR/structure model
- restoration model
- verification model

The initial implementation should keep the configuration centralized so a future model swap does not require touching pipeline logic.

### AI Re-run Policy

The pipeline performs AI restoration and verification once during extraction.

After a teacher manually confirms or edits a draft:

- AI must not automatically overwrite the teacher-confirmed content
- "restore again" and "verify again" may exist later as explicit manual actions
- any re-run result should be treated as a new candidate, not as an automatic replacement

### Question Registration Drafts

Question registration should use dedicated draft tables rather than inserting directly into final `Question` rows.

Reason:

- extraction metadata is rich
- teacher review state matters
- final `Question` should stay clean
- future question analysis can run from a controlled registration state

### Passage Registration Drafts

Restored passages should also remain in a registration-pending state before entering the final passage bank.

After extraction:

- questions go to a question-registration draft flow
- passages go to a passage-registration draft flow
- final passage analysis, translation, vocabulary, grammar, and question generation readiness happen after or during the passage registration flow, not during extraction

## Extraction API Call Shape

The confirmed extraction flow uses three AI stages.

```text
1. OCR / structured extraction
2. original-passage restoration
3. restoration verification
```

### Stage 1: OCR / Structured Extraction

Unit:

- page-level

Input:

- page image
- mode = `QUESTION_SET`
- page index and total page count

Output:

- `PASSAGE_BODY`
- `QUESTION_STEM`
- `CHOICE`
- `EXPLANATION`
- `EXAM_META`
- `HEADER`
- `FOOTER`
- `NOISE`
- answer marks when visible
- confidence/needs-review signals

Responsibility:

- preserve printed text
- split blocks accurately
- avoid paraphrasing
- capture enough structure for later grouping

### Non-AI Step: Grouping / Source Matching

After OCR, code should group blocks into passage-centered units.

Unit:

- passage group

The group should include:

- one passage candidate
- linked questions
- choices
- explanations
- source/page metadata

Source matching happens before restoration and should not count as one of the three AI calls.

Source matching should try, in order:

- existing academy passages
- registration-pending passages
- existing source materials
- internal original-text corpus when available
- public exam/textbook/EBS corpus when available
- web/search integration when available

Source candidates must be teacher-editable.

### Stage 2: Original-Passage Restoration

Unit:

- passage group

Input:

- problem-sheet passage
- linked questions
- choices
- visible answers
- printed explanations, if present
- source-match candidates

Output:

- restored original passage
- restoration status
- sentence list
- unresolved markers
- change list
- evidence for each change
- confidence and warnings

Restoration should cover all relevant problem transformations from the start:

- vocabulary choices
- grammar transformations
- blanks
- word order
- sentence insertion
- sentence ordering
- summary/completion-style transformations when enough evidence exists
- other common school worksheet patterns when problem evidence supports them

The key point: this is passage restoration, not question solving for its own sake. Solving the question is useful only insofar as it provides evidence to recover the original passage.

### Stage 3: Restoration Verification

Unit:

- passage group

Input:

- problem-sheet passage
- restored passage
- linked questions/choices/answers
- restoration changes
- source candidates

Output:

- verification status
- warnings
- remaining problem markers
- suspicious changes
- missing/extra sentence warnings
- teacher-review requirements

Verification does not make the final decision. It only provides review signals. The teacher remains the final authority.

## Draft Data Requirements

The extraction draft must preserve enough information to resume, inspect, and register later.

Required passage draft data:

- job id
- source material id/candidate
- source page indexes
- problem-sheet passage text
- restored passage text
- teacher-edited restored text
- restoration status
- verification status
- teacher confirmation status
- confidence/warnings
- source matching status/candidates

Required question draft data:

- linked passage draft id
- source page indexes
- printed question number
- stem
- choices
- answer signal
- printed explanation
- inferred question type
- confidence/warnings
- teacher confirmation status

Required sentence draft data:

- passage draft id
- order
- problem-sheet sentence text
- restored sentence text
- status
- source/change metadata

Required restoration metadata:

- method: source match, question evidence, manual, failed, partial
- changes
- evidence question number
- evidence type
- before/after text
- confidence
- unresolved markers
- warnings

Required source-match metadata:

- candidate source id/ref
- title
- publisher/year/unit/round where available
- confidence
- match method
- reason
- selected/teacher-edited state

## Suggested Database Direction

Create dedicated draft/restoration tables rather than storing all M2 state inside final `Passage`/`Question`.

Suggested concepts:

- `PassageDraft`
- `QuestionDraft`
- `PassageDraftSentence`
- `PassageRestoration`
- `PassageRestorationChange`
- `PassageSourceMatch`

Naming can be adjusted to fit existing schema conventions.

Final `Passage` and `Question` rows should be created only when the teacher explicitly registers/promotes drafts.

## Review UX Requirements

The review UI should be passage-centered.

Required concepts:

- passage group list
- linked question count
- needs-review status
- original/restored passage toggle
- sentence-number view
- restoration evidence summary
- source candidates
- teacher confirmation checkbox
- auto-saved edits

### Passage Text Views

The UI should support at least two passage views:

- restored passage
- problem-sheet passage

The restored passage is the candidate for future passage registration.

The problem-sheet passage must remain available even after final registration, because teachers may need to compare the restored original with the problem-mutated worksheet text.

### Sentence View

Sentence numbering is for review and analysis convenience.

It must not be inserted into final `Passage.content`.

M2 sentence view includes:

- sentence number
- English sentence text
- status/warning

M2 sentence view excludes:

- Korean translation
- grammar explanation
- vocabulary explanation
- detailed passage analysis

Those belong to the separate passage-analysis feature.

### Restoration Evidence

Evidence can be displayed as a grouped summary rather than inline below every sentence.

Example:

```text
Restoration evidence
- Q5 vocabulary: cancel -> conduct
- Essay 1: in which you are no longer interested
- Essay 2: [LEAVE] -> left
- Essay 2: [INVOLVE] -> involved
```

## Registration Flow

Extraction completion produces drafts.

Later registration flow:

```text
M2 extraction draft
-> teacher review/edit/confirm
-> passage registration pending
-> question registration pending
-> final passage/question banks
```

Questions should not depend on final bank registration to remain inspectable. They should remain available in a question-registration draft page.

Passages should not enter the final passage bank until the passage-registration flow is complete.

After final passage registration, both should remain inspectable:

- restored original passage
- original problem-sheet passage

## Error and Failure Policy

OCR failure:

- page-level failure
- retry according to existing Trigger.dev retry policy
- if terminal, page is failed/dead

Restoration failure:

- does not fail the whole extraction job
- passage group is marked `restoration failed`
- teacher can edit manually

Verification failure:

- does not fail the whole extraction job
- passage group is marked `verification failed` or `needs review`
- teacher can still confirm manually

Source matching failure:

- does not fail the extraction job
- restoration can proceed from question evidence
- metadata records `source not found`

## Non-Goals For This Phase

Do not include these inside M2 extraction:

- final passage analysis
- Korean translation
- grammar/vocabulary teaching notes
- detailed question explanation generation
- distractor analysis
- question-generation workflows
- final billing/credit policy changes
- final M4 full-exam workflow redesign

These should be implemented as separate registration/analysis features.

## Implementation Notes

Keep M1 and M4 stable while changing M2.

Implementation should be modular:

- model configuration per extraction stage
- OCR worker remains page-oriented
- restoration helper remains passage-group-oriented
- verification helper remains passage-group-oriented
- draft persistence separated from final promotion
- source matching separated from AI restoration

Suggested pipeline shape:

```text
start job
-> trigger per-page extraction-page tasks
-> finalize groups structured items
-> for each M2 passage group:
   -> source match
   -> restore original passage
   -> verify restoration
   -> persist passage/question/sentence/restoration drafts
-> mark job ready for review
```

Teacher edits should be auto-saved with debounce.

Final registration should be an explicit action and should never happen as a side effect of extraction completion.

