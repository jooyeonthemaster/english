import { AlignmentType, BorderStyle, Document, Footer, Header, PageNumber, Paragraph, SectionType, TextRun } from "docx";
import { shouldForceSourcePassage, shouldRenderSourcePassageInsideQuestion } from "@/components/exams/paper-builder/passage-policy";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { NONE, bdr } from "../borders";
import { buildAnswerKeyTable } from "../build-answer-key";
import { COLOR, FONT, bodyFontForTemplate } from "../styles";
import type { DocChild, ExamQuestionData } from "../types";
import { buildCustomBlock } from "./custom-block";
import { buildPage1Header } from "./header";
import type { BuilderBlock, BuilderItemResolved, BuilderLayout, BuilderSettings } from "./model";
import { buildPassage } from "./passage";
import { buildQuestionBlock } from "./question";
import { DOCX_PAPER_SIZES, SIZE_CONTINUED, SIZE_FOOTER, bodyFont, mmToDxa, setBodyFont } from "./sizes";
import { emptyParagraph, groupItems, printablePassageTitle } from "./util";



function appendQuestionGroups(
  target: DocChild[],
  items: BuilderItemResolved[],
  layout: BuilderLayout,
  includeAnswers: boolean,
  compact: boolean,
) {
  const passageStyle = "plain";
  const showPassageTitle = layout.showPassageTitle === true;
  const groups = groupItems(items);
  for (const group of groups) {
    const first = group.items[0];
    const rawPassageContent = (first.passageContent ?? first.sourceQuestion.passage?.content ?? "").trim();
    const passageContent = formatSourcePassageForQuestionItems(
      rawPassageContent,
      group.items,
    ).trim();
    const includePassage =
      !shouldRenderSourcePassageInsideQuestion(first.sourceQuestion.subType) &&
      (first.includePassage !== false ||
        shouldForceSourcePassage({
          subType: first.sourceQuestion.subType,
          questionText: first.questionText || first.sourceQuestion.questionText,
          structuredData: (first.sourceQuestion as { structuredData?: unknown }).structuredData,
          passage: { content: rawPassageContent },
        }));
    if (includePassage && passageContent) {
      const passageBlocks = buildPassage({
        passageTitle: printablePassageTitle(first),
        passageContent,
        passageStyle,
        showPassageTitle,
        compact,
        usesSentenceInsertMarkers: group.items.some(
          (item) => item.sourceQuestion.subType === "SENTENCE_INSERT",
        ),
      });
      target.push(...passageBlocks);
    }
    for (const item of group.items) {
      target.push(...buildQuestionBlock(item, layout, includeAnswers));
    }
  }
}

// =============================================================================
// 메인: Document 빌드
// =============================================================================

export function buildBuilderExamDocument(opts: {
  title: string;
  settings: BuilderSettings;
  resolvedItems: BuilderItemResolved[];
  includeAnswers: boolean;
  fullExamQuestions: ExamQuestionData[];
}): Document {
  const { title, settings, resolvedItems, includeAnswers, fullExamQuestions } = opts;
  setBodyFont(bodyFontForTemplate(settings.template));
  const header = settings.header || {};
  const layout = settings.layout || {};
  const columns: 1 | 2 = layout.columns === 1 ? 1 : 2;
  const compact = layout.density === "compact";
  const paperSize = layout.paperSize === "B4" ? "B4" : "A4";
  const pageSize = DOCX_PAPER_SIZES[paperSize];

  // 페이지 마진 (5차 — 전체 여백 축소): 미리보기 a4-paper-page.tsx 의 px 패딩을
  // 가상 A4 스케일(760px=210mm, mm/px=0.276316)로 환산해 미리보기·HWPX 와 일치시킨다.
  //   comfortable px-[34px] py-[28px] → L/R 9.395mm, T/B 7.737mm.
  //   compact px-[28px] py-[24px] → L/R 7.737mm, T/B 6.632mm.
  const MM_PER_PX = 210 / 760; // 0.276316
  const lrPx = compact ? 28 : 34;
  const tbPx = compact ? 24 : 28;
  const lrDxa = mmToDxa(lrPx * MM_PER_PX);
  const tbDxa = mmToDxa(tbPx * MM_PER_PX);
  const margin = { top: tbDxa, bottom: tbDxa, left: lrDxa, right: lrDxa };

  // ---- Section 1: 1페이지 상단 헤더 (단일 컬럼, 연속 섹션) ----
  const section1Children: DocChild[] = buildPage1Header(header, title, compact);

  // ---- Section 2: 본문 (1단/2단) ----
  const section2Children: DocChild[] = [];
  if (settings.blocks?.length) {
    const byLocalId = new Map(
      resolvedItems
        .filter((item) => item.localId)
        .map((item) => [item.localId as string, item]),
    );
    const used = new Set<BuilderItemResolved>();
    const takeQuestion = (block: BuilderBlock) => {
      const byId = block.localId ? byLocalId.get(block.localId) : undefined;
      if (byId && !used.has(byId)) {
        used.add(byId);
        return byId;
      }
      const fallback = resolvedItems.find(
        (item) => !used.has(item) && item.questionId === block.questionId,
      );
      if (fallback) used.add(fallback);
      return fallback;
    };
    let pendingQuestions: BuilderItemResolved[] = [];
    const flush = () => {
      if (pendingQuestions.length === 0) return;
      appendQuestionGroups(section2Children, pendingQuestions, layout, includeAnswers, compact);
      pendingQuestions = [];
    };

    for (const block of settings.blocks) {
      if (block.blockType === "question") {
        const questionItem = takeQuestion(block);
        if (questionItem) pendingQuestions.push(questionItem);
        continue;
      }
      flush();
      section2Children.push(...buildCustomBlock(block, compact));
    }
    flush();
  } else {
    appendQuestionGroups(section2Children, resolvedItems, layout, includeAnswers, compact);
  }

  // 정답표 (정답포함 모드가 아닐 때만 추가)
  if (!includeAnswers && fullExamQuestions.length > 0) {
    section2Children.push(...buildAnswerKeyTable(fullExamQuestions));
  }

  // ---- 헤더/푸터 정의 ----
  // 1페이지에는 본문 상단의 리치 헤더만 보이도록, titlePage + headers.first 를 비워둠
  const continuedHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        border: {
          bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
          top: NONE, left: NONE, right: NONE,
        },
        children: [
          new TextRun({
            text: title,
            font: bodyFont,
            size: SIZE_CONTINUED,
            color: COLOR.gray,
          }),
        ],
      }),
    ],
  });
  const emptyHeader = new Header({ children: [emptyParagraph()] });

  const pageFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "- ",
            font: bodyFont,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            text: " / ",
            font: bodyFont,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: FONT,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            text: " -",
            font: bodyFont,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
        ],
      }),
    ],
  });

  return new Document({
    creator: "nara",
    styles: {
      default: {
        document: {
          run: { font: bodyFont },
        },
      },
    },
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: { size: pageSize, margin },
          column: { count: 1 },
          titlePage: true,
        },
        headers: { first: emptyHeader, default: continuedHeader },
        footers: { first: pageFooter, default: pageFooter },
        children: section1Children,
      },
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: { size: pageSize, margin },
          column: {
            count: columns,
            space: columns === 2 ? 501 : 0, // 미리보기 TWO_COLUMN_GAP 32px → 8.842mm
          },
          titlePage: true,
        },
        headers: { first: emptyHeader, default: continuedHeader },
        footers: { first: pageFooter, default: pageFooter },
        children: section2Children,
      },
    ],
  });
}
