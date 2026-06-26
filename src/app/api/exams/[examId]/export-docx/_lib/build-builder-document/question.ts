import { AlignmentType, BorderStyle, Paragraph, TextRun, UnderlineType } from "docx";
import { formatInlineMarkersForSubtype, optionDisplayLabel, optionDisplayTextForSubtype, optionOrdinalLabel, shouldRenderOptionListForSubtype } from "@/components/exams/paper-builder/option-display";
import { questionHasEmbeddedPassage, shouldRenderSourcePassageInsideQuestion } from "@/components/exams/paper-builder/passage-policy";
import { sentenceOrderSegmentsFromQuestionText } from "@/components/exams/paper-builder/question-body-layout";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { isSummaryCompleteMc, isSummaryCompleteSubtype, splitSummaryCompleteMcQuestionText } from "@/components/exams/paper-builder/summary-complete-mc-layout";
import { normalizeQuestionText } from "@/components/exams/paper-builder/text-normalization";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { formatSummaryCompleteMcSummaryForDisplay, readSummaryBlankAnswersFromQuestionLike } from "@/lib/summary-complete-mc";
import { isSummaryWriting } from "@/lib/summary-writing";
import { NONE, bdr } from "../borders";
import { parseFormattedText } from "../parse-formatted-text";
import { COLOR, FONT, KR_FONT } from "../styles";
import type { DocChild } from "../types";
import { buildAnswerBlock } from "./answer";
import type { BuilderItemResolved, BuilderLayout } from "./model";
import { buildGivenBox, buildPassage, buildPassageTitleParagraph, extractGivenBlock, parseSummaryWritingBlocks, shouldPlaceInlinePassageBeforeBody, stripOriginalBlock } from "./passage";
import { BODY_LINE_HEIGHT, BODY_LINE_HEIGHT_COMPACT, SIZE_BODY, SIZE_BODY_COMPACT, SIZE_META, SIZE_OPTION, SIZE_OPTION_COMPACT, SIZE_QNUM, SIZE_QNUM_COMPACT, SUBTYPE_LABELS_DOCX, bodyFont, exactLineSpacing } from "./sizes";
import { firstQuestionLineForHeader, printablePassageTitle, safeParseOptions } from "./util";



// =============================================================================
// 문항 (번호 + 메타 + 본문 + 옵션 + 답란)
// =============================================================================

export function buildQuestionBlock(
  item: BuilderItemResolved,
  layout: BuilderLayout,
  includeAnswers: boolean,
): DocChild[] {
  const result: DocChild[] = [];
  const compact = layout.density === "compact";
  const showMeta = layout.showQuestionMeta === true;
  const showAnswerSpace = layout.showAnswerSpace !== false && !includeAnswers;

  const orderNum = item.orderNum ?? 0;
  const points = item.points ?? 1;
  const subType = item.sourceQuestion.subType || "";
  const subTypeLabel = subType ? SUBTYPE_LABELS_DOCX[subType] || subType : "";
  const questionText = normalizeQuestionText(
    formatInlineMarkersForSubtype(
      item.questionText ?? item.sourceQuestion.questionText ?? "",
      subType,
    ),
  ).trim();
  const parsedOptions = (item.options ?? safeParseOptions(item.sourceQuestion.options)).filter(
    (o) => o && (o.text || "").length >= 0,
  );
  const options = shouldRenderOptionListForSubtype(subType) ? parsedOptions : [];

  const qNumSize = compact ? SIZE_QNUM_COMPACT : SIZE_QNUM;
  const bodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const optionSize = compact ? SIZE_OPTION_COMPACT : SIZE_OPTION;
  const lh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
  const summaryComplete = isSummaryCompleteSubtype(subType);
  const summaryMc = isSummaryCompleteMc(subType);
  const summaryWriting = isSummaryWriting(subType);
  const showPassageTitle = layout.showPassageTitle === true;
  const passageTitle = printablePassageTitle(item);
  const passageContent = (item.passageContent ?? item.sourceQuestion.passage?.content ?? "").trim();
  const hasEmbeddedSourcePassage = questionHasEmbeddedPassage({
    ...item.sourceQuestion,
    questionText,
    passage: { content: passageContent },
  });
  const inlineSourcePassage =
    shouldRenderSourcePassageInsideQuestion(subType) && !summaryMc && !hasEmbeddedSourcePassage;
  const inlinePassageContent = passageContent
    ? formatSourcePassageForQuestionItems(passageContent, [item]).trim()
    : "";
  const summaryPartsForHeader = summaryComplete
    ? splitSummaryCompleteMcQuestionText(questionText)
    : null;
  const genericHeaderQuestionText = !summaryPartsForHeader
    ? firstQuestionLineForHeader(questionText, subType)
    : "";
  const headerQuestionText =
    summaryPartsForHeader?.stem || genericHeaderQuestionText;
  const embeddedPassageTitle =
    hasEmbeddedSourcePassage && !summaryWriting
      ? buildPassageTitleParagraph(passageTitle, showPassageTitle)
      : null;
  if (embeddedPassageTitle) result.push(embeddedPassageTitle);

  // 번호 + 메타 + 본문 한 단락 (번호 굵게, 메타 작게, 본문은 새 줄에서 시작)
  const headerRuns: TextRun[] = [
    new TextRun({
      text: `${orderNum}. `,
      font: bodyFont,
      size: qNumSize,
      bold: true,
      color: COLOR.black,
    }),
  ];
  if (showMeta) {
    const metaText = subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`;
    headerRuns.push(
      new TextRun({
        text: metaText,
        font: bodyFont,
        size: SIZE_META,
        color: COLOR.gray,
      }),
    );
  }

  // 첫 단락에 번호 + 메타. 그 다음 단락에 본문(있는 경우).
  if (headerQuestionText) {
    headerRuns.push(
      ...parseFormattedText(headerQuestionText, {
        font: bodyFont,
        size: bodySize,
        bold: true,
      }),
    );
  }

  result.push(
    new Paragraph({
      spacing: { before: 80, after: questionText ? 40 : 80 },
      children: headerRuns,
      keepNext: true,
    }),
  );

  if (questionText) {
    if (summaryWriting) {
      // 요약문 영작: 헤더(번호+배점+발문) 아래에
      //   [지문](테두리 박스) → [해석](회색) → [요약문]((A)(B)+빈칸선) → [보기](인라인) → [앞글자]
      // 지문은 "무조건" 함께 렌더한다(사용자 요구·레퍼런스 형식, SUMMARY_COMPLETE 미러).
      // 정답계열([빈칸 정답]/modelAnswer 등)은 직렬화에 없으므로 절대 렌더되지 않는다(SW-LEAK-1).
      const sw = parseSummaryWritingBlocks(questionText);

      if (passageContent) {
        result.push(
          ...buildPassage({
            passageTitle,
            passageContent: inlinePassageContent || passageContent,
            passageStyle: "plain",
            showPassageTitle,
            compact,
            usesSentenceInsertMarkers: false,
          }),
        );
      }

      if (sw.gloss) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 60, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[해석] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
                color: COLOR.gray,
              }),
              ...parseFormattedText(sw.gloss, {
                font: bodyFont,
                size: bodySize,
                color: COLOR.gray,
              }),
            ],
          }),
        );
      }

      if (sw.summary) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 90, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[요약문] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
              }),
              // (A)(B) 마커는 파랑, _____ 빈칸선·본문은 영문 폰트로(parseFormattedText)
              ...parseFormattedText(sw.summary, {
                font: FONT,
                size: bodySize,
                bold: true,
              }),
            ],
          }),
        );
      }

      if (sw.wordBank) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 70, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[보기] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
              }),
              ...parseFormattedText(sw.wordBank, {
                font: FONT,
                size: bodySize,
              }),
            ],
          }),
        );
      }

      if (sw.firstLetters) {
        result.push(
          new Paragraph({
            spacing: { before: 0, after: 70, ...exactLineSpacing(SIZE_META, lh) },
            children: [
              new TextRun({
                text: "[앞글자] ",
                font: bodyFont,
                size: SIZE_META,
                bold: true,
                color: COLOR.gray,
              }),
              ...parseFormattedText(sw.firstLetters, {
                font: FONT,
                size: SIZE_META,
                color: COLOR.gray,
                markerColor: COLOR.black,
              }),
            ],
          }),
        );
      }
    } else if (summaryComplete) {
      const { summary } = summaryPartsForHeader ?? splitSummaryCompleteMcQuestionText(questionText);
      const maskedSummary = formatSummaryCompleteMcSummaryForDisplay(
        summary,
        readSummaryBlankAnswersFromQuestionLike(
          item.sourceQuestion,
          item.options,
          item.correctAnswer ?? item.sourceQuestion.correctAnswer,
        ),
      );
      if (passageContent) {
        result.push(
          ...buildPassage({
            passageTitle,
            passageContent: inlinePassageContent || passageContent,
            passageStyle: "plain",
            showPassageTitle,
            compact,
            usesSentenceInsertMarkers: false,
          }),
        );
      }
      if (summaryMc) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 20, after: 50 },
            children: [
              new TextRun({
                text: "\u2193",
                font: bodyFont,
                size: bodySize,
                bold: true,
                color: COLOR.gray,
              }),
            ],
          }),
        );
      }
      if (maskedSummary) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 90, ...exactLineSpacing(bodySize, lh) },
            children: [
              ...(!summaryMc
                ? [
                    new TextRun({
                      text: "[\uC694\uC57D\uBB38] ",
                      font: bodyFont,
                      size: bodySize,
                      bold: true,
                    }),
                  ]
                : []),
              ...parseFormattedText(maskedSummary, {
                font: FONT,
                size: bodySize,
                bold: true,
              }),
            ],
          }),
        );
      }
    } else {
    if (subType === "SENTENCE_ORDER") {
      for (const segment of sentenceOrderSegmentsFromQuestionText(questionText)) {
        if (segment.kind === "box" && segment.boxStyle === "given") {
          result.push(...buildGivenBox(segment.text.replace(/\s*\n\s*/g, " "), bodySize, lh));
        } else if (segment.kind === "para") {
          result.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 0, after: 60, ...exactLineSpacing(bodySize, lh) },
              children: [
                new TextRun({
                  text: `${segment.label} `,
                  font: bodyFont,
                  size: bodySize,
                  bold: true,
                  color: COLOR.black,
                }),
                ...parseFormattedText(segment.text, {
                  font: bodyFont,
                  size: bodySize,
                  bold: true,
                  markerColor: COLOR.black,
                }),
              ],
            }),
          );
        } else if (segment.kind === "text") {
          result.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 0, after: 60, ...exactLineSpacing(bodySize, lh) },
              children: parseFormattedText(segment.text, {
                font: bodyFont,
                size: bodySize,
                bold: true,
                markerColor: COLOR.black,
              }),
            }),
          );
        }
      }
    } else {
    const { given: givenText, rest: restText } = extractGivenBlock(questionText, subType);

    // 주어진 문장 박스(문장삽입/순서)를 본문(지문/단락) 위에 먼저 그린다.
    if (givenText) {
      result.push(...buildGivenBox(givenText.replace(/\s*\n\s*/g, " "), bodySize, lh));
    }

    if (
      inlineSourcePassage &&
      shouldPlaceInlinePassageBeforeBody(subType) &&
      inlinePassageContent
    ) {
      result.push(
        ...buildPassage({
          passageTitle,
          passageContent: inlinePassageContent,
          passageStyle: "plain",
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers: false,
        }),
      );
    }

    const visibleRestText =
      subType === "SENTENCE_TRANSFORM"
        ? stripOriginalBlock(restText || questionText)
        : restText || questionText;
    const questionLines = visibleRestText.split("\n");

    let skippedHeaderQuestionLine = false;
    const bodyQuestionParagraphs = questionLines.filter((text) => {
      if (
        !skippedHeaderQuestionLine &&
        headerQuestionText &&
        text.trim() === headerQuestionText.trim()
      ) {
        skippedHeaderQuestionLine = true;
        return false;
      }
      return true;
    });

    bodyQuestionParagraphs.forEach((text, idx) => {
      const trimmed = text.trim();
      result.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: {
            before: 0,
            after: idx === bodyQuestionParagraphs.length - 1 ? 100 : 30,
            ...exactLineSpacing(bodySize, lh),
          },
          keepNext: idx === bodyQuestionParagraphs.length - 1 && options.length > 0,
          children:
            trimmed.length === 0
              ? [new TextRun({ text: " ", font: bodyFont, size: bodySize })]
              : parseFormattedText(trimmed, {
                  font: bodyFont,
                  size: bodySize,
                  bold: true,
                  // 순서 유형의 (A)(B)(C)는 미리보기에서 검정, 그 외 본문 마커는 파랑(기본)
                  ...(subType === "SENTENCE_ORDER" ? { markerColor: COLOR.black } : {}),
                }),
        }),
      );
    });

    if (
      inlineSourcePassage &&
      !shouldPlaceInlinePassageBeforeBody(subType) &&
      inlinePassageContent
    ) {
      result.push(
        ...buildPassage({
          passageTitle,
          passageContent: inlinePassageContent,
          passageStyle: "plain",
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers: subType === "SENTENCE_INSERT",
        }),
      );
    }
    }
    }
  }

  // 옵션 (preview 와 동일하게 원문자 번호 + 유형별 선택지 표시)
  if (options.length > 0) {
    options.forEach((opt, idx) => {
      const displayText = optionDisplayTextForSubtype(subType, idx, opt.text || "");
      const hasDisplayText = displayText.trim().length > 0;
      const useKR = /[가-힣]/.test(displayText);
      result.push(
        new Paragraph({
          spacing: { after: 60, ...exactLineSpacing(optionSize, lh) },
          indent: { left: 376, hanging: 290 }, // 미리보기 선지: 번호 min-w-18px + gap-1.5(6px)
          children: [
            new TextRun({
              text: optionDisplayLabel(subType, idx, opt.label),
              font: bodyFont,
              size: optionSize,
              bold: true,
              color: COLOR.darkGray,
            }),
            ...(hasDisplayText
              ? [
                  new TextRun({ text: "  ", font: bodyFont, size: optionSize }),
                  ...parseFormattedText(displayText, {
                    font: useKR ? KR_FONT : FONT,
                    size: optionSize,
                    markerColor: COLOR.black, // 선지의 (A) 마커는 미리보기에서 검정
                  }),
                ]
              : []),
          ],
        }),
      );
    });
  }

  // 객관식 추가 선지
  if (
    showAnswerSpace &&
    options.length > 0 &&
    (item.objectiveAnswerSlots ?? 0) > 0
  ) {
    const slots = Math.max(1, Math.min(10, item.objectiveAnswerSlots ?? 0));
    const objectiveAnswerTexts = item.objectiveAnswerTexts || [];
    for (let slotIndex = 0; slotIndex < slots; slotIndex += 1) {
      const optionIndex = options.length + slotIndex;
      const displayText = objectiveAnswerTexts[slotIndex]?.trim() || "";
      const useKR = /[가-힣]/.test(displayText);
      result.push(
        new Paragraph({
          spacing: { after: 60, ...exactLineSpacing(optionSize, lh) },
          indent: { left: 376, hanging: 290 }, // 미리보기 선지: 번호 min-w-18px + gap-1.5(6px)
          children: [
            new TextRun({
              text: optionOrdinalLabel(optionIndex),
              font: bodyFont,
              size: optionSize,
              bold: true,
              color: COLOR.darkGray,
            }),
            new TextRun({ text: "  ", font: bodyFont, size: optionSize }),
            ...(displayText
              ? parseFormattedText(displayText, {
                  font: useKR ? KR_FONT : FONT,
                  size: optionSize,
                  markerColor: COLOR.black,
                })
              : [
                  new TextRun({
                    text: "                                      ",
                    font: bodyFont,
                    size: optionSize,
                    underline: { type: UnderlineType.SINGLE },
                    color: COLOR.darkGray,
                  }),
                ]),
          ],
        }),
      );
    }
  }

  if (options.length > 0) {
    result.push(new Paragraph({ spacing: { after: 60 } }));
  }

  // 서술형/주관식 답란
  if (
    showAnswerSpace &&
    (item.answerSpaceLines ?? 0) > 0
  ) {
    const lines = Math.max(1, Math.min(12, item.answerSpaceLines ?? 0));
    for (let i = 0; i < lines; i++) {
      result.push(
        new Paragraph({
          spacing: { before: i === 0 ? 40 : 80, after: 80 },
          border: {
            bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
            top: NONE,
            left: NONE,
            right: NONE,
          },
          children: [new TextRun({ text: " " })],
        }),
      );
    }
  }

  // 정답 + 해설 (해설 포함 다운로드)
  if (includeAnswers) {
    result.push(
      ...buildAnswerBlock({
        correctAnswer: formatStoredQuestionCorrectAnswer({
          ...item.sourceQuestion,
          correctAnswer: item.correctAnswer ?? item.sourceQuestion.correctAnswer ?? "",
        }),
        explanation: item.sourceQuestion.explanation,
        hasOptions: options.length > 0,
      }),
    );
  }

  return result;
}
