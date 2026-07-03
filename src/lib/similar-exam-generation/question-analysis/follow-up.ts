import {
  cropQuestionImage,
  isUsableQuestionBoundingBox,
  type CroppedQuestionImage,
} from "./image-crop";
import {
  questionAnalysisUseDocAi,
  SINGLE_QUESTION_ANALYSIS_MODEL_ID,
  singleQuestionAnalysisMaxTokens,
  singleQuestionAnalysisModel,
} from "./model";
import type { QuestionInventoryItem, SingleItemAnalysis } from "./schema";
import { generateAnalysisWithRetries } from "./analysis-call";
import {
  flattenAnalysisQuestions,
  pickFirstQuestionOnly,
  preservePrimaryLocator,
  singleQuestionAnalysisFrom,
  type AnalysisQuestion,
  type LocatedAnalysisQuestion,
} from "./analysis-shape";
import { analysisErrorDetail } from "./errors";
import {
  findMissingInventoryItems,
  summarizeInventoryItem,
} from "./inventory";
import { extractOcrTextFromImage } from "./ocr";
import type { QuestionAnalysisImage } from "./types";

function clipText(value: unknown, maxLength: number): string {
  const text = typeof value === "string" ? value : "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, "");
}

function printedNumberPattern(questionNumber: number): RegExp {
  return new RegExp(`(^|[^0-9])${questionNumber}(\\s*[.)]|\\s+|\\s*번)`, "u");
}

function extractShortAnswerMarker(question: AnalysisQuestion): string | null {
  const text = question.source.direction ?? "";
  const match = text.match(/서답형\s*([0-9]+)/u);
  return match ? `서답형${match[1]}` : null;
}

function cropTextContainsTargetMarker(args: {
  cropOcrText: string;
  question: AnalysisQuestion;
}): boolean {
  const { cropOcrText, question } = args;
  const questionNumber = question.source.questionNumber;
  if (
    typeof questionNumber === "number" &&
    printedNumberPattern(questionNumber).test(cropOcrText)
  ) {
    return true;
  }

  const shortAnswerMarker = extractShortAnswerMarker(question);
  if (shortAnswerMarker && compactText(cropOcrText).includes(shortAnswerMarker)) {
    return true;
  }

  return questionNumber == null && !shortAnswerMarker;
}

function cropMismatchMessage(args: {
  cropOcrText?: string;
  located: LocatedAnalysisQuestion;
  ordinal: number;
  total: number;
}): string | null {
  const cropOcrText = args.cropOcrText?.trim();
  if (!cropOcrText || cropOcrText.length < 20) return null;
  if (cropTextContainsTargetMarker({ cropOcrText, question: args.located.question })) {
    return null;
  }

  const questionNumber = args.located.question.source.questionNumber;
  const shortAnswerMarker = extractShortAnswerMarker(args.located.question);
  const expected = [
    typeof questionNumber === "number" ? `${questionNumber}.` : null,
    shortAnswerMarker,
  ]
    .filter(Boolean)
    .join(" or ");
  return `Question crop mismatch for question ${args.ordinal}/${args.total}: expected marker ${expected || "(none)"} was not found in crop OCR.`;
}

function buildQuestionCandidateHint(question: AnalysisQuestion): string {
  const source = question.source;
  return JSON.stringify(
    {
      source: {
        questionNumber: source.questionNumber ?? null,
        direction: clipText(source.direction, 1200),
        passageHead: clipText(source.passage, 2000),
        optionCount: source.optionCount,
        options: source.options.map((option) => ({
          label: option.label,
          text: clipText(option.text, 500),
          isCorrect: option.isCorrect,
        })),
        correctAnswerLabels: source.correctAnswerLabels,
        multipleAnswers: source.multipleAnswers,
        completeness: source.completeness,
      },
      classification: question.classification,
      reproductionSpec: question.reproductionSpec,
      extractionNotes: question.extractionNotes,
    },
    null,
    2,
  );
}

function buildFollowUpInput(args: {
  located: LocatedAnalysisQuestion;
  ordinal: number;
  total: number;
  crop: CroppedQuestionImage;
  cropOcrText?: string;
}): string | undefined {
  const { located, ordinal, total, crop, cropOcrText } = args;
  const questionNumber = located.question.source.questionNumber ?? null;
  return [
    "## Single-question crop follow-up target",
    `The previous full-page pass detected ${total} questions.`,
    `Analyze ONLY question ordinal ${ordinal} of ${total}${
      questionNumber ? `, printed question number ${questionNumber}` : ""
    }.`,
    "The attached image is an isolated crop for this target question. Do not rely on any full-page image.",
    "Do not include any other question in the output.",
    "If the crop includes margins or a neighboring question fragment, anchor on the target question marker and ignore unrelated fragments.",
    "Return exactly one group with exactly one question.",
    "If the target has [I]/[II], (A)/(B), or (a)~(f) parts, preserve all parts.",
    "Do not create, estimate, or output source.boundingBox; the server already has the crop coordinates.",
    "Use only the crop image, the crop OCR reference below, and the initial target candidate.",
    `Crop pixels: left=${crop.crop.left}, top=${crop.crop.top}, width=${crop.crop.width}, height=${crop.crop.height}, source=${crop.crop.sourceWidth}x${crop.crop.sourceHeight}.`,
    cropOcrText?.trim()
      ? `\n## Crop OCR reference\n${cropOcrText.trim()}`
      : "\n## Crop OCR reference\n(no crop OCR text was extracted)",
    "",
    "Initial target candidate from the full-page pass:",
    buildQuestionCandidateHint(located.question),
  ].join("\n");
}

function buildInventoryCandidateHint(item: QuestionInventoryItem): string {
  return JSON.stringify(
    {
      label: item.label,
      questionNumber: item.questionNumber ?? null,
      groupLabel: item.groupLabel,
      direction: clipText(item.direction, 1200),
      status: item.status,
      rationale: clipText(item.rationale, 1200),
    },
    null,
    2,
  );
}

function buildMissingInventoryInput(args: {
  item: QuestionInventoryItem;
  ordinal: number;
  total: number;
  crop?: CroppedQuestionImage;
  cropOcrText?: string;
}): string {
  const { item, ordinal, total, crop, cropOcrText } = args;
  return [
    "## Missing inventory follow-up target",
    `The first full-page pass listed ${total} visible question inventory item(s).`,
    `The detailed groups[] omitted inventory item ${ordinal}/${total}. Analyze ONLY that omitted item.`,
    "Do not include any other question in the output.",
    "If the item has a shared passage range, include only the passage/stimulus parts needed for this specific question.",
    "Return exactly one group with exactly one question.",
    "Do not invent a question if the crop/page fragment is incomplete; set source.completeness.isComplete=false instead.",
    crop
      ? `Crop pixels: left=${crop.crop.left}, top=${crop.crop.top}, width=${crop.crop.width}, height=${crop.crop.height}, source=${crop.crop.sourceWidth}x${crop.crop.sourceHeight}.`
      : "No reliable crop was available. Use the full attached page image and target the inventory marker.",
    cropOcrText?.trim()
      ? `\n## Crop OCR reference\n${cropOcrText.trim()}`
      : "\n## Crop OCR reference\n(no crop OCR text was extracted)",
    "",
    "Inventory candidate:",
    buildInventoryCandidateHint(item),
  ].join("\n");
}

function preserveInventoryLocator(
  analysis: SingleItemAnalysis,
  item: QuestionInventoryItem,
): void {
  const single = flattenAnalysisQuestions(analysis)[0];
  if (!single) return;
  if (item.boundingBox) single.question.source.boundingBox = item.boundingBox;
  if (
    single.question.source.questionNumber == null &&
    typeof item.questionNumber === "number"
  ) {
    single.question.source.questionNumber = item.questionNumber;
  }
}

async function extractCropOcrText(
  crop: CroppedQuestionImage,
): Promise<string | undefined> {
  if (!questionAnalysisUseDocAi) return undefined;
  try {
    return await extractOcrTextFromImage(crop);
  } catch (error) {
    console.warn(
      `[SIMILAR-EXAM-QUESTION-ANALYSIS] crop OCR failed: ${analysisErrorDetail(error)}`,
    );
    return undefined;
  }
}

export async function reanalyzeAdditionalQuestions(args: {
  primaryAnalysis: SingleItemAnalysis;
  inputText?: string;
  images: QuestionAnalysisImage[];
  schoolType?: string;
  gradeInfo?: string;
}): Promise<{
  analysis: SingleItemAnalysis;
  attempts: number;
  usedSingleQuestionModel: boolean;
  warnings: string[];
  recoveredMissingCount: number;
  missingInventoryCount: number;
  cropMismatchCount: number;
  followUpFallbackCount: number;
}> {
  const locatedQuestions = flattenAnalysisQuestions(args.primaryAnalysis);
  if (locatedQuestions.length === 0) {
    return {
      analysis: args.primaryAnalysis,
      attempts: 0,
      usedSingleQuestionModel: false,
      warnings: ["Primary analysis returned no detailed question."],
      recoveredMissingCount: 0,
      missingInventoryCount: 0,
      cropMismatchCount: 0,
      followUpFallbackCount: 0,
    };
  }

  const analyses: SingleItemAnalysis[] = [singleQuestionAnalysisFrom(locatedQuestions[0])];
  let attempts = 0;
  let usedSingleQuestionModel = false;
  let recoveredMissingCount = 0;
  let cropMismatchCount = 0;
  let followUpFallbackCount = 0;
  const warnings: string[] = [];

  for (let index = 1; index < locatedQuestions.length; index += 1) {
    const ordinal = index + 1;
    const target = locatedQuestions[index];
    let crop: CroppedQuestionImage;
    let cropOcrText: string | undefined;
    try {
      crop = await cropQuestionImage(args.images, target.question.source.boundingBox);
      cropOcrText = await extractCropOcrText(crop);
      const mismatch = cropMismatchMessage({
        cropOcrText,
        located: target,
        ordinal,
        total: locatedQuestions.length,
      });
      if (mismatch) {
        const expanded = await cropQuestionImage(args.images, target.question.source.boundingBox, {
          padScale: 1.8,
        });
        const expandedOcrText = await extractCropOcrText(expanded);
        const expandedMismatch = cropMismatchMessage({
          cropOcrText: expandedOcrText,
          located: target,
          ordinal,
          total: locatedQuestions.length,
        });
        if (expandedMismatch) {
          cropMismatchCount += 1;
          followUpFallbackCount += 1;
          warnings.push(expandedMismatch);
          analyses.push(singleQuestionAnalysisFrom(target));
          continue;
        }
        crop = expanded;
        cropOcrText = expandedOcrText;
      }
    } catch (error) {
      followUpFallbackCount += 1;
      warnings.push(
        `Single-question crop fallback for question ${ordinal}/${locatedQuestions.length}: ${analysisErrorDetail(
          error,
        )}`,
      );
      analyses.push(singleQuestionAnalysisFrom(target));
      continue;
    }

    usedSingleQuestionModel = true;
    const followUp = await generateAnalysisWithRetries({
      inputText: buildFollowUpInput({
        located: target,
        ordinal,
        total: locatedQuestions.length,
        crop,
        cropOcrText,
      }),
      images: [crop],
      schoolType: args.schoolType,
      gradeInfo: args.gradeInfo,
      mode: `single-question-${ordinal}`,
      model: singleQuestionAnalysisModel,
      modelId: SINGLE_QUESTION_ANALYSIS_MODEL_ID,
      maxOutputTokens: singleQuestionAnalysisMaxTokens,
      includeBoundingBoxes: false,
      targetQuestion: {
        ordinal,
        total: locatedQuestions.length,
        questionNumber: target.question.source.questionNumber ?? null,
      },
    });
    attempts += followUp.attempts;
    if (!followUp.ok) {
      followUpFallbackCount += 1;
      warnings.push(
        `Single-question follow-up analysis failed for question ${ordinal}/${locatedQuestions.length}: ${analysisErrorDetail(
          followUp.lastError,
        )}`,
      );
      analyses.push(singleQuestionAnalysisFrom(target));
      continue;
    }
    const single = pickFirstQuestionOnly(followUp.analysis);
    if (!single) {
      followUpFallbackCount += 1;
      warnings.push(
        `Single-question follow-up analysis returned no question for ${ordinal}/${locatedQuestions.length}.`,
      );
      analyses.push(singleQuestionAnalysisFrom(target));
      continue;
    }
    preservePrimaryLocator(single, target);
    analyses.push(single);
  }

  let mergedAnalysis: SingleItemAnalysis = {
    inventory: args.primaryAnalysis.inventory ?? [],
    groups: analyses.flatMap((analysis) => analysis.groups),
  };

  const missingInventory = findMissingInventoryItems({
    inventory: args.primaryAnalysis.inventory,
    analysis: mergedAnalysis,
  });

  if (missingInventory.length > 0) {
    warnings.push(
      `Inventory reconciliation found ${missingInventory.length} complete question(s) missing from detailed analysis: ${missingInventory
        .map(summarizeInventoryItem)
        .join(" | ")}`,
    );
  }

  for (let index = 0; index < missingInventory.length; index += 1) {
    const item = missingInventory[index];
    let crop: CroppedQuestionImage | undefined;
    let cropOcrText: string | undefined;

    if (isUsableQuestionBoundingBox(item.boundingBox)) {
      try {
        crop = await cropQuestionImage(args.images, item.boundingBox, { padScale: 1.8 });
        cropOcrText = await extractCropOcrText(crop);
      } catch (error) {
        warnings.push(
          `Inventory crop unavailable for ${summarizeInventoryItem(item)}: ${analysisErrorDetail(
            error,
          )}`,
        );
      }
    }

    usedSingleQuestionModel = true;
    const followUp = await generateAnalysisWithRetries({
      inputText: buildMissingInventoryInput({
        item,
        ordinal: index + 1,
        total: missingInventory.length,
        crop,
        cropOcrText,
      }),
      images: crop ? [crop] : args.images,
      schoolType: args.schoolType,
      gradeInfo: args.gradeInfo,
      mode: `missing-inventory-question-${index + 1}`,
      model: singleQuestionAnalysisModel,
      modelId: SINGLE_QUESTION_ANALYSIS_MODEL_ID,
      maxOutputTokens: singleQuestionAnalysisMaxTokens,
      includeBoundingBoxes: false,
      targetQuestion: {
        ordinal: index + 1,
        total: missingInventory.length,
        questionNumber: item.questionNumber ?? null,
      },
    });
    attempts += followUp.attempts;

    if (!followUp.ok) {
      warnings.push(
        `Missing inventory follow-up failed for ${summarizeInventoryItem(item)}: ${analysisErrorDetail(
          followUp.lastError,
        )}`,
      );
      continue;
    }

    const single = pickFirstQuestionOnly(followUp.analysis);
    if (!single) {
      warnings.push(
        `Missing inventory follow-up returned no question for ${summarizeInventoryItem(item)}.`,
      );
      continue;
    }

    preserveInventoryLocator(single, item);
    mergedAnalysis = {
      ...mergedAnalysis,
      groups: [...mergedAnalysis.groups, ...single.groups],
    };
    recoveredMissingCount += 1;
  }

  return {
    analysis: mergedAnalysis,
    attempts,
    usedSingleQuestionModel,
    warnings,
    recoveredMissingCount,
    missingInventoryCount: missingInventory.length,
    cropMismatchCount,
    followUpFallbackCount,
  };
}
