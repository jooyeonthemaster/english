# 장문 세트 (Long-Passage Multi-Question Set) — Architecture & Build Plan

> One passage carries **N ordered questions** as a coherent set (generalizing CSAT 43~45 to any
> combination of the app's 23 question types), with **deterministic, code-enforced hint-leakage
> isolation** between members. Feature gate: `FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS` (default `false`).
>
> Status: design verified by 2 multi-agent investigation workflows + 3 adversarial critiques +
> 2 code-fidelity verifiers. Phase 0 cleared to start. LLM = Gemini 3.5 Flash. Korean UI, no
> Sparkles/emoji icons, no orange/amber accents.

---

## 1. Why this is hard — the three verified truths

1. **Leakage is a *data-baking* bug, not a render bug.** Generation bakes the four mutated passage
   views (`passageWithBlank/Markers/Underline/Numbers`) into **both** `Question.questionText`
   (`buildGeneratedQuestionText`, [persistence:54-57](../src/lib/question-generation-persistence.ts))
   **and** `Question.structuredData` (`toPrismaJson(enriched)`, persistence:185). Two questions on the
   same `passageId` each carry a *different* mutated copy of the passage. Fix: a set stores **one clean
   shared passage + per-member span anchors**, and reconstructs each view **at render time**.

2. **Some types restructure the passage itself.** `SENTENCE_ORDER` ships shuffled `(A)(B)(C)(D)` blocks,
   `SENTENCE_INSERT` ships a passage with ①–⑤ gaps, `IRRELEVANT` injects an AI-authored foreign sentence.
   Showing a clean ordered passage at the head **leaks the order answer**. Real CSAT 43~45 resolves this
   by making **the shuffled blocks themselves the shared passage**. So a *structural member defines the
   displayed base passage*, and the other members anchor their marks **into that displayed layout**.

3. **The "set" concept already half-exists.** `PassageBundle` + `Question.bundleId`
   ([schema.prisma:2538](../prisma/schema.prisma)) model the extracted-exam 43~45, but only for
   extraction (`sourceMaterialId` required, no `academyId`), and **nothing renders/exports bundles as
   grouped sets yet**. We unify generated + extracted via a normalized `groupId`
   (`set:<id>` | `bundle:<id>` | `single:<localId>`) feeding the existing paper-builder
   `buildGroups → PaperGroup → paginateGroups` substrate (already does "one passage + N questions").

### Generation is per-question isolated today
Manual mode fires **one independent `count:1` fast job per (passage × type × index)**
([use-generation-handlers.ts](../src/app/(director)/director/workbench/generate/use-generation-handlers.ts)) →
`/api/workbench/ai-jobs/question-generation/fast` → `saveGeneratedQuestionsForJob`. The AI never sees
sibling questions. The set feature reuses this fan-out and adds a **structural-first ordering** + a
**deterministic post-hoc leakage gate** + **set-aware persistence** (strip baked views, store anchors).

---

## 2. Chosen architecture (hybrid)

| Layer | Decision |
|---|---|
| Data model | First-class `QuestionSet` + `QuestionSetItem(orderInSet, isStructural, spans)`. Spans stored as **re-derivable anchors** `{kind, label?, spanText, surroundingText, occurrenceIndex, blockIndex?}` — **never absolute offsets** (survive passage edits). |
| Generation | **Per-member client/server fan-out reusing the fast route** + structural-first ordering + deterministic post-hoc scan. **No single coordinated Gemini mega-call** (Flash coordination unreliable, [[project_irrelevant_redesign]]). |
| Leakage isolation | Deterministic **code** gate (SpanKind co-occurrence matrix + region/sentence-containment + structural composition rules), not AI prompting. |
| Render | New **`set-rendered` passage flow**: set members suppress baked views, reconstruct from anchors against the shared displayed base. |
| Export | Reuse `groupId` grouping; one passage per group via `isFirstInGroup`; `setLabel` ("[43~45]") header. Unifies with extracted `PassageBundle`. |
| Difficulty | **Per-item** — already satisfied by existing `Question.difficulty` per row. No set-level difficulty column. |

---

## 3. Data model (Prisma) — additive, fully backward compatible

New models go **after `PassageBundle` (after schema.prisma:2556)**.

```prisma
/// QuestionSet — one shared passage carrying N ordered questions (generalizes CSAT 43~45).
/// canonicalPassage = ordered source, NEVER shown (would leak SENTENCE_ORDER).
/// displayedPassageLayout = what the student sees (shuffled blocks / ①-marked / plain).
model QuestionSet {
  id                     String   @id @default(cuid())
  jobId                  String?  // generation lineage → WorkbenchAiJob (NOT "Job" — no such model)
  academyId              String
  structuralMode         String   @default("NONE") // "NONE" | "SENTENCE_ORDER" | "SENTENCE_INSERT"
  canonicalPassage       String   @db.Text          // ordered; never rendered
  displayedPassageLayout String   @db.Text          // JSON LayoutDescriptor; the visible base
  layoutFingerprint      String                     // sha256(displayedPassageLayout) — anchor gate
  itemCount              Int      @default(0)
  setLabel               String?  // "[43~45]" printed group header
  basePassageId          String?  // optional (Phase 7+): structural member promoted to a Passage
  status                 String   @default("OK")    // "OK" | "DEGRADED" (anchor resolve failed)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  job         WorkbenchAiJob? @relation(fields: [jobId], references: [id], onDelete: SetNull)
  academy     Academy         @relation(fields: [academyId], references: [id], onDelete: Cascade)
  basePassage Passage?        @relation("SetBasePassage", fields: [basePassageId], references: [id], onDelete: SetNull)
  items       QuestionSetItem[]

  @@index([jobId])
  @@index([academyId])
  @@map("question_sets")
}

/// QuestionSetItem — one member. spans are RE-DERIVABLE ANCHORS (not offsets).
model QuestionSetItem {
  id           String   @id @default(cuid())
  setId        String
  questionId   String   @unique          // one Question ⇄ one membership
  orderInSet   Int                        // 0-indexed; SPARSE allowed after deletes
  isStructural Boolean  @default(false)   // true => defines displayedPassageLayout
  spans        Json?                      // Array<Anchor> — authoritative anchor store
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  set      QuestionSet @relation(fields: [setId], references: [id], onDelete: Cascade)
  question Question    @relation("SetItemQuestion", fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([setId, orderInSet])
  @@index([setId])
  @@map("question_set_items")
}
```

`Question` deltas (inside existing model, lines 853–899):
```prisma
  setId   String?  // denormalized — fast set filtering without a join
  inSet   Boolean  @default(false)
  setItem QuestionSetItem? @relation("SetItemQuestion")   // back-relation (FK lives on the item)
  @@index([setId])
```
Back-relations: `Passage` (`setBasePassages QuestionSet[] @relation("SetBasePassage")`), `Academy`
(`questionSets QuestionSet[]`), **`WorkbenchAiJob`** (`questionSets QuestionSet[]`).

> Per-item difficulty is already satisfied — each member is its own `Question` row with its own
> `difficulty`. No set-level difficulty column.

---

## 4. Shared types (`src/lib/question-sets/types.ts`)

See the file for the authoritative definitions. Summary:
- `StructuralMode = "NONE" | "SENTENCE_ORDER" | "SENTENCE_INSERT"`.
- `SpanKind = BLANK | MARKER | UNDERLINE | NUMBER | CIRCLED_LETTER | BLOCK | SENTENCE`.
- `Anchor { kind, label?, spanText, surroundingText (≥30 chars), occurrenceIndex, blockIndex? }`.
- `LayoutBlock { label, text, canonicalIndex, displayOrder }` — **both indices stored explicitly**
  so boundary checks are unambiguous (displayed = sort by `displayOrder`).
- `LayoutDescriptor { type, givenSentence?, blocks?, correctOrder? (server-only), markerPositions?, fullPassage?, fingerprintHash }`.
- Classification consts: `TYPE_TO_SPANKIND`, `STRUCTURAL_TYPES`, `RECONSTRUCTABLE_TYPES` (the 9 inline
  mark types), `NON_STRUCTURAL_ALLOWED_TYPES`.

---

## 5. Generation + finalize flow (`src/lib/question-sets/generate-set.ts`)

Credit: `QUESTION_GEN_SINGLE (=2) × N` (VOCAB types = 1), no discount, finalize free.

1. **`validateSetComposition(configs)`** (deterministic, before any AI call): reject IRRELEVANT+others
   (IRRELEVANT solo-only), `SENTENCE_ORDER + SENTENCE_INSERT`, two structural members, and any
   MARKER/BLANK type co-occurring with another marking member (§6). Korean error strings.
2. **Generate the structural member FIRST** (if `structuralMode ≠ NONE`), fed `canonicalPassage`.
   Build `displayedPassageLayout` + `layoutFingerprint`. For `NONE`, the base is plain `canonicalPassage`.
3. **Generate non-structural members in parallel**, each fed **the DISPLAYED BASE** (blocks/sentences in
   display order, concatenated) — **NOT the canonical passage** — so anchors resolve against what the
   student sees (the critical 43~45 correctness fix).
4. **`resolveSpansForLayout`**: for each anchor call the **strict** matcher
   `findExpressionInPassageStrict(displayedBase, spanText, surroundingText)` → `{pos, ambiguous, count}`.
   Require `surroundingText` ≥30 chars and unique within a ±50-char window; set `occurrenceIndex`
   explicitly; ambiguous/not-found → `degraded[]`.
5. **`scanSetForLeakage`** (§6) → `conflicts[]`.
6. **Persist in one `prisma.$transaction`**: `QuestionSet` + per-member `Question` (set-aware:
   strip `passageWith*` from questionText *and* structuredData for non-structural members, preserve
   `markedExpressions/displayExpression/underlinedPronoun/options/correctAnswer`, write
   `structuredData._spans`) + `QuestionSetItem`. `status = (degraded||conflicts) ? "DEGRADED" : "OK"`.
   DEGRADED sets do **not** silently ship — they require manual review.
7. Return `{ set, items, conflicts, degraded }`.

**Matcher upgrade** ([text-utils.ts:183](../src/lib/question-postprocess/text-utils.ts)): add
`opts?: { occurrenceIndex?, requireUnique? }` + a `findExpressionInPassageStrict` sibling returning
ambiguity. Existing 3-arg callers untouched.

---

## 6. Leakage isolation (`src/lib/question-sets/leakage-gate.ts`) — pure, deterministic

**SpanKind co-occurrence matrix** (`true` = LEAK between two kinds from *different* members over the
*same region*; symmetric):

| A \ B | BLANK | MARKER | UNDERLINE | NUMBER | CIRCLED_LETTER | BLOCK | SENTENCE |
|---|---|---|---|---|---|---|---|
| **BLANK** | LEAK | LEAK | LEAK | LEAK | LEAK | LEAK | LEAK |
| **MARKER** | LEAK | LEAK | LEAK | LEAK | LEAK | LEAK | LEAK |
| **UNDERLINE** | LEAK | LEAK | OK | OK | OK | OK | OK |
| **NUMBER** | LEAK | LEAK | OK | LEAK | LEAK | LEAK | LEAK |
| **CIRCLED_LETTER** | LEAK | LEAK | OK | LEAK | LEAK | LEAK | LEAK |
| **BLOCK** | LEAK | LEAK | OK | LEAK | LEAK | LEAK | LEAK |
| **SENTENCE** | LEAK | LEAK | OK | LEAK | LEAK | LEAK | LEAK |

- **BLANK and MARKER are *exclusive*** — they cannot co-occur with anything (a blank reveals "something
  removed here"; a labeled marker advertises a tested span). At most **one** blank/marker member per set,
  and then no other marking member.
- **UNDERLINE is permissive** — bare underlines coexist with each other and with structural marks (carries
  no positional answer signal). This is what real 43~45 uses (44 지칭 = underline).
- **Structural marks (NUMBER/CIRCLED_LETTER/BLOCK)** leak against each other → one structural base per set.

**Refinements (applied via region check, not just the table):**
- *Region overlap*: conflict only when two anchors' ranges overlap AND `kindsLeak`. (BLANK+UNDERLINE in
  far-apart regions is allowed via this refinement even though the kind-table is conservative.)
- *Shuffled-block-boundary crossing* (SENTENCE_ORDER): a non-structural anchor straddling a block
  boundary leaks adjacency → conflict.
- *Sentence-containment*: a sub-span inside a whole-sentence-marked region (IRRELEVANT/structural) is
  flagged even when char-intersection is 0.
- *Prose/option-level* (CONTENT_MATCH/TOPIC options quoting a blanked phrase): best-effort verbatim
  string-containment WARN; semantic dedup out of scope.

**Composition rules (hard gates):** exactly one structural member; non-structural slots restricted to
UNDERLINE/source types (REFERENCE, SYNONYM, IMPLIED_MEANING, CONTEXT_MEANING, + source comprehension
TOPIC/TITLE/MAIN_IDEA/CONTENT_MATCH/SUMMARY_COMPLETE_MC); MARKER types (GRAMMAR_ERROR/VOCAB_CHOICE/ANTONYM)
and BLANK types (BLANK_INFERENCE/FILL_BLANK_KEY) only as a **solo marking member** (no other marking
member); IRRELEVANT solo-only; `SENTENCE_ORDER + SENTENCE_INSERT` forbidden.

---

## 7. Render-from-spans / `set-rendered` flow (screen + DOCX + HWPX)

**Reconstructable types (9):** BLANK_INFERENCE, FILL_BLANK_KEY, GRAMMAR_ERROR, VOCAB_CHOICE, ANTONYM,
REFERENCE, IMPLIED_MEANING, CONTEXT_MEANING, SYNONYM. SENTENCE_INSERT/IRRELEVANT only appear as the
structural member (render their own baked base).

- **Lib** `src/components/workbench/question-renderer-from-spans.ts`: `(base, anchors) → RenderedPassage`
  using `applyReplacementsRTL`, `replaceAtPosition`, `findWordInPassage`, `sanitizeExpressionForMarker`,
  `getCircledNumber/Letter`, `BLANK`. **MARKER/VOCAB reconstruction must map label→source-expression**
  (handle `expression="eat"` but passage form `"ate"` via `displayExpression`/surroundingText).
- **Passage-flow** ([passage-policy.ts](../src/components/exams/paper-builder/passage-policy.ts)): add a
  third value beyond `embedded|source` — a set member's embedded passage is suppressed; it renders from
  spans against the shared head. `QUESTION_PASSAGE_FLOW_RULES` becomes set-aware.
- **Screen** ([question-renderers.tsx](../src/components/workbench/question-renderers.tsx),
  [question-type-renderers.tsx](../src/components/workbench/question-type-renderers.tsx)): add `*FromSpans`
  variants for the 9 types + a `StructuralSetRenderer` (renders the displayed base once: given-sentence box
  + blocks for SENTENCE_ORDER, ①-marked passage for SENTENCE_INSERT, then members beneath). Neutral slate
  surfaces, no orange/blue accent fills.
- **Export** (DOCX `build-builder-document.ts` `appendQuestionGroups`; HWPX `builder.ts`): print the
  displayed base once for the group head, reconstruct each member's marks from spans; `isFirstInGroup`
  gate; fall back to baked + warn on DEGRADED. `groupItems` already merges `set:` consecutively.
- **Parity tests** `src/__tests__/render-from-spans.test.ts`: reconstructed ≡ baked per type.

---

## 8. Set-builder UX (3rd generation mode)

On `/director/workbench/questions/generate`: mode toggle gains **`세트`** (gated). Single-passage select;
ordered member list (add/remove/drag-reorder); each row: 유형 picker + **per-item 난이도** + reuse of
existing per-type detail settings (어법 밑줄/정답 개수, 빈칸 부정-부정, IRRELEVANT 슬롯). Structural preset
dropdown (`없음/글의 순서/문장 삽입`); one-click **수능 43~45형** preset = `[SENTENCE_ORDER, REFERENCE,
CONTENT_MATCH]`. Live `validateSetComposition` disables incompatible members with Korean reasons. Review
modal renders the displayed base once + members + surfaces `conflicts/degraded` (blocking on DEGRADED).
`QueueItem.config` gains `setId/memberConfigs`; `sameGenerationRequest` + `onRegenerate` gain a set branch.
House style: professional icons, no Sparkles/emoji, no orange/amber, no purple-on-white.

---

## 9. Exam-builder / export integration

- Loader [exam-paper-builder.ts:114-152](../src/actions/exam-paper-builder.ts): select `setItem
  {setId, orderInSet, isStructural}` + `bundleId`; **atomic-set-aware pagination** (don't split a set at
  the `take:400` boundary); single `examQuestion.findMany` for `qMetaById`.
- `makePaperItem` ([paper-item-utils.tsx:97/119](../src/components/exams/paper-builder/paper-item-utils.tsx)):
  `groupId = setId ? "set:"+id : bundleId ? "bundle:"+id : "single:"+localId`.
- `clonePaperItem` (:262): preserve `set:`/`bundle:` prefixes; cloning a set member routes through a
  set-level copy.
- `saveExamPaperDraft`: enforce **set-member contiguity** (consecutive `orderNum`) else Korean error.
- `PaperGroup`/`pagination.ts`: render `setLabel` header; suppress duplicate passage for
  SUMMARY_COMPLETE_MC / structural branches inside a set group.
- Set-member lifecycle actions (`src/actions/question-sets/`): delete (sparse `orderInSet`), reorder,
  set-level approve. Guard the legacy single-question editor from desyncing a set member.

---

## 10. Phase-by-phase build plan (each ships behind the flag)

| Phase | Scope | Riskiest unknown |
|---|---|---|
| **0** | Schema (`QuestionSet`/`QuestionSetItem`/`Question` deltas → `WorkbenchAiJob`) + `feature-flags.ts` + `src/lib/question-sets/types.ts` | **Prod Supabase migration** vs off-git Vercel deploy drift ([[project_deploy_smoat_cli]]) — confirm no schema drift before `migrate deploy` |
| **1** | `leakage-gate.ts` (matrix + region/boundary/containment + composition) + `text-utils.ts` strict matcher | Making 4 fallback strategies honor `occurrenceIndex` without breaking ~9 existing callers |
| **2** | `question-renderer-from-spans.ts` + parity tests (no UI wiring) | GRAMMAR label→source-expression mapping when passage form ≠ expression |
| **3** | Set-aware persistence (strip baked from questionText+structuredData; write `_spans`) | Strip fires ONLY for `inSet && !isStructural` — zero regression on existing library |
| **4** | Screen renderers (`*FromSpans` + `StructuralSetRenderer`) | Visual parity reconstructed vs baked across 9 types |
| **5** | Orchestrator `generate-set.ts` (structural-first, displayed-base, per-item difficulty) + lifecycle actions + **DEGRADED review workflow** | Gemini Flash anchor uniqueness on the displayed base; ambiguity rate < ~10% |
| **6** | Exam-builder integration (loader, groupId, contiguity, setLabel) | `take:400` atomic-set load for academies > 400 questions |
| **7** | DOCX + HWPX set-aware single-passage print | `plainWithMarkers` matching Word/PDF glyph rules (visual regression) |
| **8** | Set-builder UX (3rd mode, presets, per-item difficulty) + flag flip | Live `validateSetComposition` UX clarity |

**Single biggest cross-phase risk (Phase 5):** leakage correctness rests on Gemini emitting anchors whose
`surroundingText` is unique within the displayed base; the gate can only *reject* ambiguity (→ DEGRADED),
not repair it. Mitigation lives in the strict matcher + the DEGRADED review workflow, not in the prompt.

---

## 11. Corrections folded in from adversarial verification
- `Job` → **`WorkbenchAiJob`** everywhere (no `Job` model exists).
- Non-structural members generated against the **displayed base**, not canonical (43~45 correctness).
- `LayoutBlock` stores **both** `canonicalIndex` and `displayOrder`.
- Orchestrator validates `surroundingText` ≥30 chars + unique; **DEGRADED review workflow** required.
- **9** reconstructable types (not 8); a `*FromSpans` variant per type.
- Persistence strip preserves `markedExpressions/displayExpression` (needed for reconstruction).
- Non-structural slots restricted to underline/source types; MARKER/BLANK only as solo marking member.
