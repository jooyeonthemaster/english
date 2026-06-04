import { GENERATION_SUB_TYPES } from "./schemas";

const SUB_TYPE_LIST = GENERATION_SUB_TYPES.join(", ");

export function buildPatternProfilePrompt(input: {
  originalFileName: string | null;
  totalPages: number;
  selectedPassageCount: number;
  /** 1-based inclusive page range carried by this call (for chunked analysis). */
  pageRange?: { start: number; end: number };
}) {
  const rangeNote = input.pageRange
    ? `The attached images are pages ${input.pageRange.start}–${input.pageRange.end} of ${input.totalPages}. Extract ONLY the questions visible on these pages.`
    : `The attached images are all ${input.totalPages} page(s) of the exam.`;

  return `You are an expert Korean English-test editor and exam-pattern analyst.

You are given the page images of a finished English exam paper. Look at the images
directly — the layout, columns, boxes, figures, circled numbers, and printed
question numbers are all meaningful. Extract a reusable ExamPatternProfile.

The profile is later applied to teacher-selected English passages to generate a NEW
exam with the same question-type sequence, difficulty curve, scoring, visual rhythm,
section order, layout style, and item-writing style.

${rangeNote}

Hard rules:
- This is NOT a transcription task and NOT a filtering task. Extract EVERY question —
  listening, charts, tables, pictures, posters, notices, forms, no-passage items, and
  long reading passages.
- Do NOT generate new questions. Do NOT copy or reproduce long copyrighted source
  passages anywhere in the output. Summarize source stimuli and describe the pattern only.
- Use the PRINTED question number as questionSlots[].number (absolute across the paper).

questionSlots[].generationSubType MUST be exactly one of these canonical IDs:
${SUB_TYPE_LIST}
- Pick the closest reading/passage-based ID. When the original item is listening,
  visual, table, chart, dialogue, or form based, choose the closest passage-based
  generationSubType and explain the conversion in generationRequirements.
- subType is a free-text label of the ORIGINAL item type (for traceability).
- difficulty must be BASIC, INTERMEDIATE, or KILLER (infer from position, points, and complexity).
- stimulusType classifies the ORIGINAL stimulus: PASSAGE, LISTENING, TABLE, CHART, IMAGE,
  NOTICE, DIALOGUE, FORM, NONE, or MIXED.
- canGenerateFromSelectedPassage: false only when the item cannot be recreated from a
  plain reading passage (e.g. pure listening with audio dependence).

questionSlots[].typeSettings — fill the structured fields that match the item so the
generator reproduces the exact shape:
- GRAMMAR_ERROR: grammarMarkerCount = number of underlined/marked judgment positions
  (5–10), grammarAnswerCount = how many of those are actually wrong (1–markerCount).
- GRAMMAR_CORRECTION: grammarCorrectionErrorCount = number of wrong underlined segments (1–5).
- IRRELEVANT (무관한 문장): irrelevantSlotCount = number of numbered choices (usually 5).
- BLANK_INFERENCE: blankDoubleNegative = true only when the blank tests a
  negative/privative paraphrase.
Leave typeSettings fields unset when they do not apply.

For each questionSlot also capture concrete item-writing style: stemStyle, optionStyle,
answerFormat, reasoningPattern, layoutHints, generationRequirements, points, choiceCount.

paperLayout — capture how the paper looks so it can be rebuilt:
- paperSize, columns, density, numberingStyle, pointAnnotationStyle, choiceMarkerStyle,
  passageBoxed, sectionOrder, globalDirections, visualLayoutNotes.
- header: examTitle, schoolName, subject, grade, examCategory (중간고사/기말고사/모의고사/기타),
  examDate, durationMinutes, totalPoints, hasStudentNameField, hasStudentIdField, notices (유의사항).

sourceMeta — provenance you can observe: schoolName, year, semester, publisher, source,
examCategory, confidence (high/medium/low), uncertaintyNotes (anything you had to guess
or that was cut off / unreadable).

sections — labeled groups with their printed question numbers and instruction style.
stimulusGroups — shared-stimulus groups (one passage/listening/figure shared by several
questions) with a NON-verbatim summary and the reuse strategy with selected passages.

generationPlan — preserveQuestionOrder, preserveSectionOrder, preserveStimulusGrouping,
passageAssignmentStrategy, fallbackRules.

extractedInsights — anything notable about the overall design (difficulty flow, recurring
trap styles, scoring pattern, etc.).

Original filename: ${input.originalFileName ?? "uploaded exam"}
Teacher-selected passage count available for generation: ${input.selectedPassageCount}

Return JSON only, matching the required schema.`;
}
