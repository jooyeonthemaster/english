import { AlignmentType, BorderStyle, Document, Footer, Header, PageNumber, Paragraph, SectionType, TextRun } from "docx";
import { shouldForceSourcePassage, shouldRenderSourcePassageInsideQuestion } from "@/components/exams/paper-builder/passage-policy";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { NONE, bdr } from "../borders";
import { buildAnswerKeyTable } from "../build-answer-key";
import { COLOR, FONT, bodyFontForTemplate } from "../styles";
import type { DocChild, ExamQuestionData } from "../types";
import { buildCustomBlock } from "./custom-block";
import { buildPage1Header } from "./header";
import {
  resolveKoSetSharedPassageContent,
  suppressKoSetMemberInlinePassages,
} from "./ko-set-passage";
import type { BuilderBlock, BuilderItemResolved, BuilderLayout, BuilderSettings } from "./model";
import type { KoSetGroupItemLike } from "./ko-set-passage";
import { buildPassage } from "./passage";
import { buildQuestionBlock } from "./question";
import { BODY_LINE_HEIGHT, BODY_LINE_HEIGHT_COMPACT, DOCX_PAPER_SIZES, SIZE_BODY, SIZE_BODY_COMPACT, SIZE_CONTINUED, SIZE_FOOTER, bodyFont, exactLineSpacing, mmToDxa, setBodyFont } from "./sizes";
import { emptyParagraph, groupItems, printablePassageTitle } from "./util";



/**
 * KO 세트 공유지문 dedup — 웹(applyKoSetSharedPassages)·HWPX(break-plan)의
 * renderedSetIds 가드 미러(순수·테스트 대상). 같은 `set:<setId>` 그룹이
 * (세트 멤버 사이에 낀 커스텀 블록/다른 문항으로) 여러 그룹으로 쪼개져도
 * 공유지문 박스는 첫 그룹에만 1회 반환하고, 이후 그룹은 duplicate=true 로
 * 표시해 지문을 통째로 억제한다(웹 미리보기의 includePassage=false 미러).
 * 영어/일반 그룹(content null)은 셋을 건드리지 않는다 — 무회귀.
 */
export function takeKoSetSharedPassageOnce(
  renderedSetIds: Set<string>,
  groupKey: string | null | undefined,
  items: KoSetGroupItemLike[],
): { content: string | null; duplicate: boolean } {
  const content = resolveKoSetSharedPassageContent(groupKey, items);
  if (content === null) return { content: null, duplicate: false };
  const key = groupKey ?? "";
  if (renderedSetIds.has(key)) return { content: null, duplicate: true };
  renderedSetIds.add(key);
  return { content, duplicate: false };
}

function appendQuestionGroups(
  target: DocChild[],
  items: BuilderItemResolved[],
  layout: BuilderLayout,
  includeAnswers: boolean,
  compact: boolean,
  renderedKoSetIds: Set<string>,
) {
  const passageStyle = "plain";
  const showPassageTitle = layout.showPassageTitle === true;
  const groups = groupItems(items);

  // 워드(DOCX) 전용: 문항과 문항 사이에 항상 빈 줄 1개를 넣어 간격을 일관되게 한다
  // (미리보기·HWPX 는 그대로 — 사용자 요청 "워드만"). 본문 한 줄 높이의 빈 단락.
  const sepBodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const sepLh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
  const questionSeparator = () =>
    new Paragraph({
      spacing: { before: 0, after: 0, ...exactLineSpacing(sepBodySize, sepLh) },
      children: [new TextRun({ text: " ", font: bodyFont, size: sepBodySize })],
    });
  let renderedAnyQuestion = false;

  for (const group of groups) {
    // 이전 문항(그룹)과의 사이에 빈 줄 1개.
    if (renderedAnyQuestion) target.push(questionSeparator());
    const first = group.items[0];
    const rawPassageContent = (first.passageContent ?? first.sourceQuestion.passage?.content ?? "").trim();
    // KO 세트 그룹(`set:<setId>`): 병합 마커 공유지문 1박스 + 세트 지시문 —
    // 웹 미리보기(applyKoSetSharedPassages)와 동일. 영어/일반 그룹은 null 이
    // 반환되어 아래 기존 로직이 그대로 실행된다(무회귀 게이트).
    // [KO-EXPORT-1] 같은 setId 가 이미 그려졌으면(그룹 쪼개짐) duplicate —
    // 공유지문 중복 인쇄를 억제하고 멤버 문항만 렌더한다(웹 renderedSetIds 미러).
    const { content: koSetPassageContent, duplicate: koSetDuplicate } =
      takeKoSetSharedPassageOnce(renderedKoSetIds, group.groupKey, group.items);
    const passageContent =
      koSetPassageContent ??
      formatSourcePassageForQuestionItems(rawPassageContent, group.items).trim();
    const includePassage =
      // duplicate 그룹은 KO 지문동봉 유형의 shouldForceSourcePassage 되살림까지
      // 차단해 지문이 어떤 형태로도 두 번 인쇄되지 않게 한다.
      !koSetDuplicate &&
      (koSetPassageContent !== null ||
        (!shouldRenderSourcePassageInsideQuestion(first.sourceQuestion.subType) &&
          (first.includePassage !== false ||
            shouldForceSourcePassage({
              subType: first.sourceQuestion.subType,
              questionText: first.questionText || first.sourceQuestion.questionText,
              structuredData: (first.sourceQuestion as { structuredData?: unknown }).structuredData,
              passage: { content: rawPassageContent },
            }))));
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
    group.items.forEach((item, idx) => {
      // 같은 지문을 공유하는 그룹 내 문항들 사이에도 빈 줄 1개.
      if (idx > 0) target.push(questionSeparator());
      target.push(...buildQuestionBlock(item, layout, includeAnswers));
      renderedAnyQuestion = true;
    });
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
  const { title, settings, includeAnswers, fullExamQuestions } = opts;
  // KO 세트 멤버는 그룹 공유지문 1박스로 렌더하므로 멤버 인라인 지문을 억제한다
  // (라우트의 shouldForceSourcePassage 되살림 상쇄 — 영어/KO 솔로는 원소 그대로).
  const resolvedItems = suppressKoSetMemberInlinePassages(opts.resolvedItems);
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
  // KO 세트 공유지문 dedup 셋 — flush() 가 appendQuestionGroups 를 여러 번
  // 호출해도(커스텀 블록이 세트를 쪼개는 경우) 문서 전체에서 setId 당 1박스.
  const renderedKoSetIds = new Set<string>();
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
      appendQuestionGroups(section2Children, pendingQuestions, layout, includeAnswers, compact, renderedKoSetIds);
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
    appendQuestionGroups(section2Children, resolvedItems, layout, includeAnswers, compact, renderedKoSetIds);
  }

  // 정답표 (정답포함 모드가 아닐 때만 추가) — 항상 새 페이지에서 시작.
  if (!includeAnswers && fullExamQuestions.length > 0) {
    section2Children.push(
      ...buildAnswerKeyTable(fullExamQuestions, { pageBreakBefore: true }),
    );
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
