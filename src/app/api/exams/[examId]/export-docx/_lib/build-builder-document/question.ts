import { AlignmentType, BorderStyle, Paragraph, TextRun, UnderlineType } from "docx";
import { formatInlineMarkersForSubtype, multiBlankOptionMatrix, optionDisplayLabel, optionDisplayTextForSubtype, optionOrdinalLabel, shouldRenderOptionListForSubtype } from "@/components/exams/paper-builder/option-display";
import { buildMultiBlankOptionsTable, optionKeep } from "../render-options";
import {
  KO_BOGI_HEADER_LINE_RE,
  KO_CONDITION_HEADER_LINE,
  KO_FOOTNOTE_LINE_RE,
  KO_SOURCE_LINE_RE,
  balanceKoUnderlineMarkersPerLine,
  koPaperRenderModel,
  koPaperSegmentsFromModel,
  koPaperStemText,
} from "@/components/exams/paper-builder/korean/ko-paper-adapter";
import type { PaperExportItem } from "@/components/exams/paper-builder/paper-export-items";
import { resolvePaperLayout } from "@/components/exams/paper-builder/paper-layout-defaults";
import { questionHasEmbeddedPassage } from "@/components/exams/paper-builder/passage-policy";
import { isFlowStructuredSubtype, sentenceOrderSegmentsFromQuestionText } from "@/components/exams/paper-builder/question-body-layout";
import { isSummaryCompleteMc, isSummaryCompleteSubtype, splitSummaryCompleteMcQuestionText } from "@/components/exams/paper-builder/summary-complete-mc-layout";
import { normalizeQuestionText } from "@/components/exams/paper-builder/text-normalization";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { formatSummaryCompleteMcSummaryForDisplay, readSummaryBlankAnswersFromQuestionLike } from "@/lib/summary-complete-mc";
import { isSummaryWriting } from "@/lib/summary-writing";
import { NONE, bdr } from "../borders";
import { docxKeep, estimateTextLines, isStandaloneLabelLine } from "../keep-policy";
import { parseFormattedText } from "../parse-formatted-text";
import { COLOR, FONT, KR_FONT } from "../styles";
import type { DocChild } from "../types";
import { buildAnswerBlock } from "./answer";
import type { BuilderItemResolved, BuilderLayout } from "./model";
import { parseTopicSentenceWritingBlocks } from "./model";
import { buildGivenBox, buildPassage, buildPassageTitleParagraph, extractGivenBlock, parseSummaryWritingBlocks, shouldPlaceInlinePassageBeforeBody, stripOriginalBlock } from "./passage";
import { builderPageGeometry } from "./page-geometry";
import { BODY_LINE_HEIGHT, BODY_LINE_HEIGHT_COMPACT, SIZE_BODY, SIZE_BODY_COMPACT, SIZE_META, SIZE_OPTION, SIZE_OPTION_COMPACT, SIZE_QNUM, SIZE_QNUM_COMPACT, SUBTYPE_LABELS_DOCX, bodyFont, exactLineSpacing } from "./sizes";
import { firstQuestionLineForHeader, printablePassageTitle, safeParseOptions } from "./util";



// =============================================================================
// 문항 (번호 + 메타 + 본문 + 옵션 + 답란)
// =============================================================================

/**
 * 문서 조립(assemble)이 넘기는 문항 — 공용 어댑터 toPaperExportItem 의 결과.
 * printInlinePassage = 웹이 이 문항 안(구조화 본문)에 그리는 지문(없으면 ""). 문항 안 지문은
 * 이 값으로만 정한다(includePassage 재해석 금지 — paper-export-items.ts 머리 계약).
 */
export type DocxQuestionItem = BuilderItemResolved & Pick<PaperExportItem, "printInlinePassage">;

export function buildQuestionBlock(
  item: DocxQuestionItem,
  layout: BuilderLayout,
  includeAnswers: boolean,
  opts: {
    /** 이 문항이 속한 그룹의 지문 박스가 그려졌는가(웹 fragment.includePassage) — 내장 지문 제목 판정용. */
    groupPassageShown?: boolean;
  } = {},
): DocChild[] {
  const result: DocChild[] = [];
  const compact = layout.density === "compact";
  // 표시 기본값은 웹과 같은 단일 원천(resolvePaperLayout — showQuestionMeta 기본 false,
  // showAnswerSpace 기본 true, showPassageTitle 기본 DEFAULT_SHOW_PASSAGE_TITLE).
  const display = resolvePaperLayout({ layout });
  const showMeta = display.showQuestionMeta;
  const showAnswerSpace = display.showAnswerSpace && !includeAnswers;
  // 문항 안의 표(다중 빈칸 선지·정답 배지)가 들어갈 본문 단 폭(DXA).
  const bodyColumnWidthDxa = builderPageGeometry(layout).bodyColumnWidthDxa;

  const orderNum = item.orderNum ?? 0;
  const points = item.points ?? 1;
  const subType = item.sourceQuestion.subType || "";
  // 메타 배지의 유형 이름 — 라벨 표에 없으면 유형 부분을 생략한다(원시 코드 「UNKNOWN」 등을 찍지 않는다).
  // 웹 a4-paper-page 의 `subType && SUBTYPE_LABELS[subType] ? " · 라벨" : ""` 와 같은 폴백(HW-4).
  const subTypeLabel = subType ? SUBTYPE_LABELS_DOCX[subType] || "" : "";
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

  // 문항 단위 글자 크기(pt)·굵게·기울임 — 미리보기 컨테이너 글꼴 상속과 동일하게,
  // 본문/번호/선지 크기를 같은 비율로 확대·축소한다(DOCX size 는 half-point = pt*2).
  const baseBodyHalf = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const fontScale =
    typeof item.blockFontPt === "number" && item.blockFontPt > 0
      ? (item.blockFontPt * 2) / baseBodyHalf
      : 1;
  const qNumSize = Math.round((compact ? SIZE_QNUM_COMPACT : SIZE_QNUM) * fontScale);
  const bodySize = Math.round(baseBodyHalf * fontScale);
  const optionSize = Math.round((compact ? SIZE_OPTION_COMPACT : SIZE_OPTION) * fontScale);
  const qBold = item.blockBold ?? false;
  const qItalic = item.blockItalic ?? false;
  const lh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
  const summaryComplete = isSummaryCompleteSubtype(subType);
  const summaryMc = isSummaryCompleteMc(subType);
  const summaryWriting = isSummaryWriting(subType);
  const topicSentenceWriting = subType === "TOPIC_SENTENCE_WRITING";
  const showPassageTitle = display.showPassageTitle;
  const passageTitle = printablePassageTitle(item);
  const passageContent = (item.passageContent ?? item.sourceQuestion.passage?.content ?? "").trim();
  const hasEmbeddedSourcePassage = questionHasEmbeddedPassage({
    ...item.sourceQuestion,
    questionText,
    passage: { content: passageContent },
  });
  // 문항 안 지문 — 공용 판정 결과(웹 structuredSegments 의 passage 박스, 세트 멤버는 "")를 그대로 그린다.
  // 요약문 완성·요약문/주제문 영작·주제·제목·내용일치·조건 영작 등 모든 유형이 이 한 값만 본다.
  const inlinePassage = (item.printInlinePassage ?? "").trim();
  const inlinePassageBlocks = (usesSentenceInsertMarkers: boolean) =>
    inlinePassage
      ? buildPassage({
          passageTitle,
          passageContent: inlinePassage,
          passageStyle: "plain",
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers,
        })
      : [];
  const summaryPartsForHeader = summaryComplete
    ? splitSummaryCompleteMcQuestionText(questionText)
    : null;
  // KO(국어) 문항: structuredData → 렌더모델(발문·마킹지문·보기·조건). null 이면
  // (미등록 유형·데이터 결손) 아래 표준 폴백(questionText 라인 렌더)으로 강등된다.
  // 지문 박스는 printInlinePassage 가 있을 때만(세트 멤버·지문 끔은 억제 — 웹 koStructuredSegments 미러).
  const koModel = koPaperRenderModel({ ...item, includePassage: inlinePassage.length > 0 });
  // KO 렌더모델의 stem 이 비면(데이터 결손 방어) questionText 첫 줄 폴백 — 발문이
  // 통째로 사라진 문항이 인쇄되지 않게 한다(웹 koStemForItem 의 폴백과 동일 규칙).
  const koStemText =
    koModel && koModel.stem.text.trim() ? koPaperStemText(koModel) : "";
  const genericHeaderQuestionText = !summaryPartsForHeader
    ? koModel && koStemText
      ? koStemText
      : firstQuestionLineForHeader(questionText, subType)
    : "";
  const headerQuestionText =
    summaryPartsForHeader?.stem || genericHeaderQuestionText;
  // 내장 지문 유형의 지문 제목(웹 a4-paper-page showBodyPassageTitle): 구조화 본문이 아니고
  // 그룹 지문 박스가 그려지지 않았을 때만.
  const embeddedPassageTitle =
    hasEmbeddedSourcePassage && !isFlowStructuredSubtype(subType) && !opts.groupPassageShown
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
  const metaText = !showMeta ? "" : subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`;
  if (metaText) {
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
        italics: qItalic,
      }),
    );
  }

  // 머리 문단 = 역할 questionHead(keep-policy.ts): keepLines + (문항 안에 뒤 요소가 있으면) keepNext.
  // 뒤 요소가 있는지는 문항 블록을 다 만든 뒤에야 알므로 자리만 잡아 두고 맨 끝에 끼워 넣는다.
  // 비정상적으로 긴 머리(요약문 완성 발문에 지문이 붙은 저장본 등)는 KEEP_MAX_LINES 상한으로 본문처럼 다룬다.
  const headerIndex = result.length;
  const headerLines = estimateTextLines(
    `${orderNum}. ${metaText}${headerQuestionText}`,
    Math.max(bodySize, qNumSize),
    bodyColumnWidthDxa,
  );
  const headerParagraph = (hasNext: boolean) =>
    new Paragraph({
      spacing: { before: 80, after: questionText ? 40 : 80 },
      children: headerRuns,
      ...docxKeep("questionHead", { hasNext, lines: headerLines }),
    });

  if (questionText) {
    if (koModel) {
      // KO(국어): 지문(마킹 병합)·<보기>·<조건> 박스를 어댑터 세그먼트로 렌더 —
      // 웹 구조 렌더(structuredSegments KO 게이트)와 1:1 정합. 발문은 위 헤더에서
      // koPaperStemText 로 이미 렌더했다. 선지/답란/정답은 아래 공통 경로.
      for (const seg of koPaperSegmentsFromModel(koModel)) {
        if (seg.kind !== "box") continue;
        result.push(
          ...buildKoStructBox(
            seg.text,
            seg.boxStyle === "passage" ? "passage" : "given",
            bodySize,
            lh,
            bodyColumnWidthDxa,
          ),
        );
      }
    } else if (summaryWriting) {
      // 요약문 영작: 헤더(번호+배점+발문) 아래에
      //   [지문](테두리 박스) → [해석](회색) → [요약문]((A)(B)+빈칸선) → [보기](인라인) → [앞글자]
      // 지문은 "무조건" 함께 렌더한다(사용자 요구·레퍼런스 형식, SUMMARY_COMPLETE 미러).
      // 정답계열([빈칸 정답]/modelAnswer 등)은 직렬화에 없으므로 절대 렌더되지 않는다(SW-LEAK-1).
      const sw = parseSummaryWritingBlocks(questionText);

      result.push(...inlinePassageBlocks(false));

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
    } else if (topicSentenceWriting) {
      // 주제문 영작(듀얼모드): 헤더(번호+배점+발문) 아래에
      //   [지문](테두리 박스) → [주제 힌트](회색) →
      //     cloze:     [주제문]((A)(B)+빈칸선) → [보기](인라인)
      //     scrambled: [배열 단어](인라인 칩)
      // 모드 판별은 직렬 questionText 의 [주제문] 마커 존재 여부로 한다(structuredData 미참조).
      // 정답계열(modelAnswer/blanks[].answer 등)은 직렬화에 없으므로 절대 렌더되지 않는다(SW-LEAK-1).
      const tsw = parseTopicSentenceWritingBlocks(questionText);

      result.push(...inlinePassageBlocks(false));

      if (tsw.gloss) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 60, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[주제 힌트] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
                color: COLOR.gray,
              }),
              ...parseFormattedText(tsw.gloss, {
                font: bodyFont,
                size: bodySize,
                color: COLOR.gray,
              }),
            ],
          }),
        );
      }

      if (tsw.summary) {
        // cloze 모드 — 마스킹된 주제문((A)(B) + 빈칸선). [요약문] 렌더와 동일.
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 90, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[주제문] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
              }),
              // (A)(B) 마커는 파랑, _____ 빈칸선·본문은 영문 폰트로(parseFormattedText)
              ...parseFormattedText(tsw.summary, {
                font: FONT,
                size: bodySize,
                bold: true,
              }),
            ],
          }),
        );
      } else if (tsw.scrambled) {
        // scrambled 모드 — 셔플된 제시어 칩(배열 영작 류). 정답 어순 미노출(SW-LEAK-1).
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 90, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[배열 단어] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
              }),
              ...parseFormattedText(tsw.scrambled, {
                font: FONT,
                size: bodySize,
                bold: true,
              }),
            ],
          }),
        );
      }

      if (tsw.wordBank) {
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
              ...parseFormattedText(tsw.wordBank, {
                font: FONT,
                size: bodySize,
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
      result.push(...inlinePassageBlocks(false));
      if (summaryMc) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 20, after: 50 },
            // ↓ = caption(HWPX 와 같다) — 요약문과 한 단에.
            ...docxKeep("caption", { hasNext: Boolean(maskedSummary) }),
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

    if (shouldPlaceInlinePassageBeforeBody(subType)) {
      result.push(...inlinePassageBlocks(false));
    }

    // SENTENCE_TRANSFORM: 지문을 동봉하면(includePassage) [원문] 블록을 제거한다(원문이
    // 지문에 밑줄로 노출되므로 중복). 지문을 감추면 [원문] 을 남겨 전환 대상 문장을 제공.
    // 계약 예외(COH-7): 이것은 「지문을 찍을지」 판정이 아니라 웹 structuredSegments 의 본문 텍스트 규칙
    // 미러라서 웹과 같은 술어(item.includePassage)를 쓴다. 지문을 찍을지는 printInlinePassage 로만 정한다
    // (위 inlinePassageBlocks). printInlinePassage 로 바꾸면 세트 멤버(공유 지문은 그룹 박스 — inline "")에서
    // [원문] 이 되살아나 웹과 어긋난다. 「저장값 true 인데 지문이 비었다」 경우는 웹·HWPX 와 똑같이 [원문]
    // 도 지문도 찍히지 않는다 — 세 출력을 함께 바꿀 일이다(보고됨).
    const visibleRestText =
      subType === "SENTENCE_TRANSFORM" && item.includePassage !== false
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
    // 발문(헤더)과 본문 사이의 빈 줄(원문 "발문\n\n본문" 의 \n\n)은 미리보기에선 본문 위에
    // 표시되지 않는다. DOCX 도 선두 빈 줄을 제거해 발문 바로 아래에서 본문이 시작하게 한다
    // (이 처리 없으면 1번 외 모든 문항에서 발문 아래 빈 줄 한 칸이 더 생겨 미리보기와 어긋남).
    while (
      bodyQuestionParagraphs.length > 0 &&
      bodyQuestionParagraphs[0].trim().length === 0
    ) {
      bodyQuestionParagraphs.shift();
    }

    bodyQuestionParagraphs.forEach((text, idx) => {
      const trimmed = text.trim();
      // 단독 라벨 줄(「[조건]」 등)만 caption — HWPX 구역 라벨(labelPara)과 같다. 그 밖 본문 줄은 역할 없음.
      const labelKeep = isStandaloneLabelLine(trimmed)
        ? docxKeep("caption", {
            hasNext: idx < bodyQuestionParagraphs.length - 1 || options.length > 0,
          })
        : {};
      result.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: {
            before: 0,
            // 본문 마지막 단락: 선지가 뒤따르면 본문↔선지 간격(100), 선지가 없으면(밑줄/어휘
            // 등 인라인 마커 유형) 이 본문이 문항의 마지막 요소이므로 선지 trailing(60)과
            // 같게 둬 문항 간 간격을 일관되게 한다.
            after:
              idx === bodyQuestionParagraphs.length - 1
                ? options.length > 0
                  ? 100
                  : 60
                : 30,
            ...exactLineSpacing(bodySize, lh),
          },
          // 본문 문단 = 역할 없음 → keep 속성 없음(keep-policy.ts). 선지 앞 마지막 본문 문단(대개 지문 전체)에
          // keepNext 를 걸면 한컴 2024가 그 문단을 통째로 선지와 한 단에 두려다 큰 빈 단·사슬 포기(선지 쪼개짐·
          // 머리 줄 고아)를 냈다(HW-1). 선지 묶음 자체는 optionKeep 이 지킨다.
          ...labelKeep,
          children:
            trimmed.length === 0
              ? [new TextRun({ text: " ", font: bodyFont, size: bodySize })]
              : parseFormattedText(trimmed, {
                  font: bodyFont,
                  size: bodySize,
                  // 문항 본문(지문)은 일반체 — 발문(헤더)만 굵게(미리보기와 동일).
                  // 일부 유형(빈칸·어휘·무관문장 등)이 굵게 나오던 불일치 해소.
                  // 단, 문항 단위 '굵게' 서식이 켜지면 본문도 함께 굵게(미리보기와 동일).
                  bold: qBold,
                  italics: qItalic,
                  // 순서 유형의 (A)(B)(C)는 미리보기에서 검정, 그 외 본문 마커는 파랑(기본)
                  ...(subType === "SENTENCE_ORDER" ? { markerColor: COLOR.black } : {}),
                }),
        }),
      );
    });

    if (!shouldPlaceInlinePassageBeforeBody(subType)) {
      result.push(...inlinePassageBlocks(subType === "SENTENCE_INSERT"));
    }
    }
    }
  }

  // 선지 묶음(①~⑤ + 객관식 추가 선지 칸)은 단·쪽 경계에서 갈리지 않게 한 덩어리(optionKeep).
  const objectiveSlots =
    showAnswerSpace && options.length > 0 && (item.objectiveAnswerSlots ?? 0) > 0
      ? Math.max(1, Math.min(10, item.objectiveAnswerSlots ?? 0))
      : 0;
  const lastOptionBundleIndex = options.length + objectiveSlots - 1;
  // 정답포함에서도 선지 묶음 → 정답 배지 다리는 두지 않는다(HWPX keep-policy 와의 의도된 차이 — keep-policy.ts
  // 대응표). Word 는 keepNext 사슬(선지 + 배지 + 「해설」 + 첫 줄 ≈ 단의 40%)을 상한 없이 통째로 옮겨 25% 넘는
  // 빈 단이 A 해설 0→10, B 해설 0→9 로 늘었다(26-09-30 실측). 배지는 뒤 해설과만 묶는다(answer.ts).

  // 옵션 (preview 와 동일하게 원문자 번호 + 유형별 선택지 표시)
  if (options.length > 0) {
    // 다중 빈칸(BLANK_INFERENCE) 조합 선지 — (A)/(B) 컬럼 헤더 무테두리 표
    // (미리보기 그리드와 동일 형식: 헤더 한 줄 + 각 행은 값만).
    const multiBlank =
      subType === "BLANK_INFERENCE" ? multiBlankOptionMatrix(options) : null;
    if (multiBlank) {
      result.push(
        buildMultiBlankOptionsTable(multiBlank, {
          size: optionSize,
          bold: qBold,
          italics: qItalic,
          widthDxa: bodyColumnWidthDxa,
          keepWithNext: objectiveSlots > 0,
        }),
      );
    } else {
    options.forEach((opt, idx) => {
      const displayText = optionDisplayTextForSubtype(subType, idx, opt.text || "");
      const hasDisplayText = displayText.trim().length > 0;
      const useKR = /[가-힣]/.test(displayText);
      result.push(
        new Paragraph({
          spacing: { after: 60, ...exactLineSpacing(optionSize, lh) },
          indent: { left: 376, hanging: 290 }, // 미리보기 선지: 번호 min-w-18px + gap-1.5(6px)
          ...optionKeep(idx === lastOptionBundleIndex),
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
                    bold: qBold,
                    italics: qItalic,
                    markerColor: COLOR.black, // 선지의 (A) 마커는 미리보기에서 검정
                  }),
                ]
              : []),
          ],
        }),
      );
    });
    }
  }

  // 객관식 추가 선지
  if (objectiveSlots > 0) {
    const slots = objectiveSlots;
    const objectiveAnswerTexts = item.objectiveAnswerTexts || [];
    for (let slotIndex = 0; slotIndex < slots; slotIndex += 1) {
      const optionIndex = options.length + slotIndex;
      const displayText = objectiveAnswerTexts[slotIndex]?.trim() || "";
      const useKR = /[가-힣]/.test(displayText);
      result.push(
        new Paragraph({
          spacing: { after: 60, ...exactLineSpacing(optionSize, lh) },
          indent: { left: 376, hanging: 290 }, // 미리보기 선지: 번호 min-w-18px + gap-1.5(6px)
          ...optionKeep(optionIndex === lastOptionBundleIndex),
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
                  bold: qBold,
                  italics: qItalic,
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

  // 선지 뒤 빈 줄: 답란/해설이 뒤따를 때만 구분용으로 둔다. 문항 사이 간격은 다음 문항
  // 헤더의 before spacing 으로 일관 처리하므로, 여기서 무조건 빈 줄을 넣으면 "선지 있는
  // 문항"만 한 줄 더 벌어져 문항 간 간격이 들쭉날쭉해진다(미리보기는 항상 동일 간격).
  const hasTrailingAnswerContent =
    includeAnswers ||
    (showAnswerSpace &&
      (((item.objectiveAnswerSlots ?? 0) > 0) || ((item.answerSpaceLines ?? 0) > 0)));
  if (options.length > 0 && hasTrailingAnswerContent) {
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
        subType: item.sourceQuestion.subType,
        widthDxa: bodyColumnWidthDxa,
      }),
    );
  }

  result.splice(headerIndex, 0, headerParagraph(result.length > headerIndex));
  return result;
}

// -----------------------------------------------------------------------------
// KO(국어) 박스 — 어댑터 세그먼트 텍스트(행 규약)를 DOCX 문단으로 변환.
//   첫 행 "〈 보 기 〉" → 중앙 헤더 / "[조건]" → 볼드 라벨
//   지문 말미 "- 작가, 「작품」 -" → 우측 정렬 / "*어휘: 뜻" → 축소 회색
//   그 외 행 → 양끝맞춤 본문(한글 bodyFont, __밑줄__·ⓐ 마커는 parseFormattedText)
// -----------------------------------------------------------------------------
function buildKoStructBox(
  text: string,
  style: "passage" | "given",
  bodySize: number,
  lh: number,
  widthDxa: number,
): DocChild[] {
  // 행 경계를 넘는 __밑줄__ 마킹(운문 행간 마킹)은 행별 균형 마크업으로 정규화 —
  // 행 단위 parseFormattedText 가 홀수 `__` 를 리터럴로 인쇄하는 결함 방지.
  const lines = balanceKoUnderlineMarkersPerLine(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const out: DocChild[] = [];
  // 〈보기〉·[조건] 머리 = caption(HWPX ko-box 와 같다) — 박스 첫 행과 한 단에.
  const headerKeep = (line: string) =>
    docxKeep("caption", {
      hasNext: lines.length > 1,
      lines: estimateTextLines(line, SIZE_META, widthDxa),
    });

  lines.forEach((line, idx) => {
    // 헤더("〈 보 기 〉"/"[조건]")는 어댑터가 given 박스에만 만든다 — 지문 첫 행이
    // "〈제1수〉"(연시조 수 라벨)인 경우 본문 행이 헤더로 오분류되지 않게 given 한정.
    if (idx === 0 && style === "given" && KO_BOGI_HEADER_LINE_RE.test(line)) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 40, after: 30 },
          ...headerKeep(line),
          children: [
            new TextRun({
              text: line,
              font: bodyFont,
              size: SIZE_META,
              bold: true,
              color: COLOR.darkGray,
            }),
          ],
        }),
      );
      return;
    }
    if (idx === 0 && style === "given" && line === KO_CONDITION_HEADER_LINE) {
      out.push(
        new Paragraph({
          spacing: { before: 40, after: 30 },
          ...headerKeep(line),
          children: [
            new TextRun({
              text: line,
              font: bodyFont,
              size: SIZE_META,
              bold: true,
              color: COLOR.gray,
              characterSpacing: 10,
            }),
          ],
        }),
      );
      return;
    }
    if (style === "passage" && KO_SOURCE_LINE_RE.test(line)) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 20, after: 20 },
          children: [
            new TextRun({ text: line, font: bodyFont, size: SIZE_META, color: COLOR.gray }),
          ],
        }),
      );
      return;
    }
    if (style === "passage" && KO_FOOTNOTE_LINE_RE.test(line)) {
      out.push(
        new Paragraph({
          spacing: { before: 0, after: 20 },
          children: [
            new TextRun({ text: line, font: bodyFont, size: SIZE_META, color: COLOR.gray }),
          ],
        }),
      );
      return;
    }
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: {
          after: idx < lines.length - 1 ? 40 : 0,
          ...exactLineSpacing(bodySize, lh),
        },
        children: parseFormattedText(line, { font: bodyFont, size: bodySize }),
      }),
    );
  });

  // 박스 간/박스-선지 간격 (buildPassage 말미 spacing 관행 미러)
  out.push(new Paragraph({ spacing: { after: 100 } }));
  return out;
}
