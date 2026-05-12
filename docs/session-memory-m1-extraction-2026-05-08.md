# Session Memory: M1 Passage Extraction Redesign

Date: 2026-05-08
Project: `c:\roqkf\english`
Branch: `feature/student-app-redesign-v3`
Base/latest commit at session start: `add7ee6 Implement M2 extraction draft workflow`

## User Intent

The current focus is the extraction feature, especially M1 passage extraction. M2 question-set and M4 exam extraction should remain functional, but the product direction has changed:

- Passage extraction is the core priority.
- Question/exam extraction should be simplified later to mostly raw extraction data.
- Original passage restoration is mandatory for M1 passage extraction.
- Results should show raw extracted text and restored text side by side.
- The teacher should edit directly in the restored-text pane.
- No separate review page for raw M1 extraction output unless it becomes clearly necessary.

## Hard Boundaries

- Do not commit `.trigger/`.
- Do not touch these coworker-owned files unless the user explicitly asks:
  - `src/actions/assignments.ts`
  - `src/actions/student-app/get-dashboard.ts`
  - `src/actions/student-app/get-inbadi.ts`
- Do not start or occupy dev server port 3000 unless explicitly requested. The user was annoyed by 3000 being occupied and Next opening 3001.
- Full `tsc` is known to fail from unrelated `learning/session/materials` Prisma type errors. Prefer targeted checks and filter output for changed files.
- Existing Trigger.dev deployment must be redeployed for trigger-side changes to affect cloud runs.

## Current Worktree Snapshot

Known modified/untracked files at handoff:

- `.gitignore`
- `prisma/schema.prisma`
- `prisma/migrations/20260507000000_add_m1_passage_extraction_drafts/`
- `prisma/migrations/20260507001000_add_m1_passage_source_matches/`
- `prisma/migrations/20260508000000_add_extraction_page_source_file_name/`
- `src/app/(director)/director/workbench/passages/import/_components/bulk-extract-client.tsx`
- `src/app/(director)/director/workbench/passages/import/_components/mode-select-step.tsx`
- deleted: `src/app/(director)/director/workbench/passages/import/_components/upload-step.tsx`
- `src/app/api/extraction/jobs/route.ts`
- `src/app/api/extraction/jobs/[jobId]/route.ts`
- `src/app/api/extraction/jobs/[jobId]/start/route.ts`
- `src/app/api/extraction/m1-passages/`
- `src/components/layout/admin-shell.tsx`
- `src/hooks/use-extraction-upload.ts`
- `src/lib/extraction/constants.ts`
- deleted: `src/lib/extraction/direct-passage-processor.ts`
- `src/lib/extraction/m1-restoration.ts`
- `src/lib/extraction/ocr-prompt.ts`
- `src/lib/extraction/pdf-splitter.ts`
- `src/lib/extraction/store.ts`
- `src/lib/extraction/types.ts`
- `src/lib/extraction/zod-schemas.ts`
- `src/trigger/_lib/m1-passage-restoration.ts`
- `src/trigger/_lib/passage-web-search.ts`
- `src/trigger/_lib/m2-source-match.ts`
- `src/trigger/extraction-finalize.ts`
- `src/trigger/extraction-page.ts`
- `trigger.config.ts`

Also modified but coworker-owned and should be avoided:

- `src/actions/assignments.ts`
- `src/actions/student-app/get-dashboard.ts`
- `src/actions/student-app/get-inbadi.ts`

## Implemented Direction So Far

### M1 UI

Main UI file:

- `src/app/(director)/director/workbench/passages/import/_components/bulk-extract-client.tsx`

Current UX direction:

- Page is now a M1 passage extraction workroom.
- Old top step flow/header was removed or minimized.
- Input, result selection, and job queue are floating panels.
- Main screen prioritizes the extraction result room.
- Upload/input panel is compact.
- Job queue is a floating panel, not a large top status list.
- Result selection panel chooses which extracted passage to display.
- The result detail now shows only:
  - raw text pane
  - restored text pane
- Removed the separate "teacher final text" block.
- Removed the restoration change list block.
- Teacher edits happen directly in the restored text pane.
- Restored text still highlights restored/replaced segments.

Latest validation after the final UI simplification:

- `npx eslint 'src/app/(director)/director/workbench/passages/import/_components/bulk-extract-client.tsx'` passed.
- `npx tsc --noEmit --pretty false | Select-String -Pattern 'bulk-extract-client|workbench/passages/import'` produced no matching errors.

### M1 Job/Result APIs

Relevant files:

- `src/app/api/extraction/jobs/route.ts`
- `src/app/api/extraction/jobs/[jobId]/route.ts`
- `src/app/api/extraction/m1-passages/route.ts`

Important behavior:

- Job list should include PASSAGE_ONLY jobs that are pending/processing, have visible M1 drafts, or had an M1 draft pipeline save error.
- M1 visible draft filtering uses review statuses like `DRAFT` and `REVIEWED`.
- If result drafts are deleted/accepted and no visible results remain, corresponding completed jobs should disappear from the work queue.
- `m1DraftPipelineError` is surfaced for jobs whose extraction finished but M1 draft persistence failed.

### Upload/Input Behavior

Relevant files:

- `src/hooks/use-extraction-upload.ts`
- `src/lib/extraction/pdf-splitter.ts`
- `src/lib/extraction/store.ts`
- `src/lib/extraction/types.ts`
- `src/lib/extraction/constants.ts`
- `src/app/api/extraction/jobs/[jobId]/start/route.ts`

Important behavior:

- The direct/no-trigger quick extraction mode was removed.
- Upload now goes through Trigger.dev background processing.
- After extraction starts successfully, selected input files/pages are cleared from the input panel.
- Uploaded pages retain `sourceFileName` / source page information so result UI can show exactly which file/page each passage came from.

### M1 Restoration

Relevant files:

- `src/trigger/_lib/m1-passage-restoration.ts`
- `src/trigger/_lib/passage-web-search.ts`
- `src/trigger/extraction-finalize.ts`
- `src/lib/extraction/m1-restoration.ts`

Target restoration strategy:

1. Try same-academy DB/source passage matching.
2. If DB is not sufficient, try web/source search before AI-only reconstruction.
3. If exact source still cannot be found, use problem-solving/context restoration fallback.
4. If restoration fails, mark it as needing manual teacher correction.

Important bug investigated:

- Some DB `Passage` records were already polluted with question markers/answer artifacts, for example:
  - circled markers like `ⓐ`
  - choices like `[in, are, interested, which, no, you, longer]`
  - `(A)[LEAVE]`
- Those polluted DB records caused "DB match 100%" while restored text was still essentially the raw problem text.
- `m1-passage-restoration.ts` was updated to reject polluted exact DB matches using artifact detection before trusting a DB source.
- Existing extracted drafts do not automatically change. New extraction/reprocess is required, and trigger-side changes require deployment.

### Trigger Finalization

Relevant file:

- `src/trigger/extraction-finalize.ts`

Important change:

- M1 draft persistence transaction timeout was raised:
  - `timeout: 30_000`
  - `maxWait: 10_000`
- Final stored restoration changes should reflect the final restored text, not intermediate chunk changes that do not appear in the final text.

## Recent User Complaints / Things To Watch

- User noticed completed jobs with zero visible results. Cause was likely M1 draft transaction timeout or result filtering mismatch.
- User noticed one image with multiple passages returned too few visible results. Need keep watching extraction prompt/schema and result persistence.
- User wants file/page origin displayed clearly for each passage.
- User dislikes oversized headings and redundant explanatory text.
- User prefers compact, utilitarian UI where result viewing is dominant.
- User wants raw/restored only in the result body. Avoid adding back extra analysis panels unless asked.

## UIPro Skill Install

The user ran:

```powershell
uipro init --ai all
```

It installed project-local UI/UX skill folders such as:

- `.codex/skills/ui-ux-pro-max/SKILL.md`
- `.agent/skills/ui-ux-pro-max/SKILL.md`
- `.claude/skills/ui-ux-pro-max/SKILL.md`
- `.cursor/skills/ui-ux-pro-max/SKILL.md`
- `.gemini/skills/ui-ux-pro-max/SKILL.md`
- `.windsurf/skills/ui-ux-pro-max/SKILL.md`

For Codex global use, copy:

```powershell
Copy-Item -Recurse -Force `
  "c:\roqkf\english\.codex\skills\ui-ux-pro-max" `
  "$env:USERPROFILE\.codex\skills\ui-ux-pro-max"
```

The global skill should be available to other Codex projects after starting a new Codex session.

## Suggested Next Steps

1. If continuing UI work, inspect `bulk-extract-client.tsx` first and preserve the current raw/restored-only result body.
2. Verify the editable restored pane behavior in browser if the user asks. Do not start the dev server unless explicitly asked.
3. If continuing restoration work, create fresh extraction jobs after Trigger.dev deploy/restart so new restoration logic is actually exercised.
4. If committing, keep `.trigger/` out and avoid coworker-owned files.
5. Run focused checks:

```powershell
npx eslint 'src/app/(director)/director/workbench/passages/import/_components/bulk-extract-client.tsx'
npx tsc --noEmit --pretty false 2>&1 | Select-String -Pattern 'bulk-extract-client|workbench/passages/import|m1-passage-restoration|extraction-finalize'
```

