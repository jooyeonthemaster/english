import { AlignmentType, BorderStyle, Document, Footer, Header, PageNumber, Paragraph, SectionType, TextRun } from "docx";
import { answerKeyEntries, type AnswerEntry } from "@/components/exams/paper-builder/answer-key-entries";
import { buildGroups } from "@/components/exams/paper-builder/paper-item-groups";
import { toPaperExportItem } from "@/components/exams/paper-builder/paper-export-items";
import {
  resolvePaperLayout,
  type PaperLayoutSettingsLike,
  type ResolvedPaperLayout,
} from "@/components/exams/paper-builder/paper-layout-defaults";
import {
  buildPaperItemsFromExam,
  type SavedPaperExamQuestion,
  type SavedPaperSettings,
} from "@/components/exams/paper-builder/saved-paper-items";
import type { PaperGroup, PaperItem } from "@/components/exams/paper-builder/types";
import { NONE, bdr } from "../borders";
import { buildAnswerKeyTableFromEntries } from "../build-answer-key";
import { docxKeep } from "../keep-policy";
import { COLOR, FONT, bodyFontForTemplate } from "../styles";
import type { DocChild, ExamQuestionData } from "../types";
import { buildCustomBlock } from "./custom-block";
import { buildPage1Header } from "./header";
import { resolveKoSetSharedPassageContent } from "./ko-set-passage";
import type { KoSetGroupItemLike } from "./ko-set-passage";
import type { BuilderBlock, BuilderHeader, BuilderLayout } from "./model";
import { builderPageGeometry } from "./page-geometry";
import { buildPassage } from "./passage";
import { buildQuestionBlock } from "./question";
import { BODY_LINE_HEIGHT, BODY_LINE_HEIGHT_COMPACT, SIZE_BODY, SIZE_BODY_COMPACT, SIZE_CONTINUED, SIZE_FOOTER, bodyFont, exactLineSpacing, setBodyFont } from "./sizes";
import { emptyParagraph, paperItemsFromResolvedItems, type DocxResolvedInput } from "./util";

// =============================================================================
// DOCX 시험지 조립 — 공용 정본(26-09-30 DOCX-CONSUMER) 소비자.
//
// 「무엇을 찍을지」는 여기서 다시 판정하지 않는다(docs/EXAM-PAPER-MODEL.md §1~§4):
//   문항 목록   = buildPaperItemsFromExam(시험 문항, 저장 설정)   — settings NULL·빌더 v1/v2·similar-v1 공통
//   지문 ①     = buildGroups(paperItems) 의 그룹 지문(includePassage·passageContent·setPrompt·passageTitle)
//   지문 ②     = toPaperExportItem(item).printInlinePassage(문항 안 지문, 없으면 "")
//   레이아웃    = resolvePaperLayout(settings)                    — showQuestionMeta 기본 false 등 웹 기본값
//   정답표      = answerKeyEntries(paperItems)                    — 편집 정답 우선 + 객관식 ①~ 통일
//   쪽 기하     = builderPageGeometry(layout)                     — 구역 여백·단 간격·표 그릇 폭의 단일 원천
// settings 없는 시험지도 레거시 렌더러(build-document.ts) 대신 이 경로를 탄다.
// 범위 밖(docs/EXAM-PAPER-MODEL.md §13): 쪽당 N문제(forceTwoPerPage)·강제 나눔(breakBefore)·표지(cover).
// =============================================================================

/**
 * KO 세트 공유지문 dedup — 웹(applyKoSetSharedPassages)·HWPX(break-plan)의 renderedSetIds 가드
 * 미러(순수). 같은 `set:<setId>` 그룹이 여러 그룹으로 쪼개져도 공유지문 박스는 첫 그룹에만 1회
 * 반환하고, 이후 그룹은 duplicate=true 로 표시한다.
 * DOCX 조립은 이제 공용 buildGroups(applyKoSetSharedPassages)의 결과를 그대로 쓰므로 이 함수를
 * 부르지 않는다 — 같은 규칙의 단위 계약(tests/unit/ko-isolation-scope-wiring)을 위해 남겨 둔다.
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

/** 문서 빌더가 읽는 저장 설정의 최소형 — 서버 BuilderSettings·SavedPaperSettings·NULL 모두 수용. */
export type DocxPaperSettingsLike = PaperLayoutSettingsLike & {
  blocks?: readonly BuilderBlock[] | null;
};

function builderLayoutFrom(resolved: ResolvedPaperLayout): BuilderLayout {
  return {
    paperSize: resolved.paperSize,
    columns: resolved.columns,
    density: resolved.density,
    showAnswerSpace: resolved.showAnswerSpace,
    showPassageTitle: resolved.showPassageTitle,
    showQuestionMeta: resolved.showQuestionMeta,
    passageStyle: resolved.passageStyle,
    forceTwoPerPage: resolved.forceTwoPerPage,
  };
}

function builderHeaderFrom(resolved: ResolvedPaperLayout): BuilderHeader {
  return {
    subtitle: resolved.header.subtitle,
    schoolName: resolved.header.schoolName,
    className: resolved.header.className,
    studentNameLabel: resolved.header.studentNameLabel,
    instructions: resolved.header.instructions,
    academyLogoDataUrl: resolved.header.academyLogoDataUrl,
  };
}

/** 커스텀 블록 PaperItem → buildCustomBlock 입력. 웹처럼 텍스트는 blockText 만 쓴다(질문 라벨 폴백 없음). */
function customBlockFromPaperItem(item: PaperItem): BuilderBlock {
  return { ...item, questionText: item.blockText };
}

type GroupRenderContext = {
  layout: BuilderLayout;
  includeAnswers: boolean;
  compact: boolean;
};

/** 그룹 지문 박스(웹 a4-paper-page 의 fragment 지문: 세트 안내문 → 제목 → 본문). */
function buildGroupPassage(group: PaperGroup, ctx: GroupRenderContext): DocChild[] {
  const out: DocChild[] = [];
  if (group.setPrompt) {
    const size = ctx.compact ? SIZE_BODY_COMPACT : SIZE_BODY;
    const lh = ctx.compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 60, ...exactLineSpacing(size, lh) },
        // 세트 안내문 = caption(keep-policy.ts, HWPX renderSetPrompt 와 같다) — 지문 첫머리와 한 단에.
        ...docxKeep("caption", { hasNext: true }),
        children: [new TextRun({ text: group.setPrompt, font: bodyFont, size, bold: true })],
      }),
    );
  }
  out.push(
    ...buildPassage({
      passageTitle: group.passageTitle,
      passageContent: group.passageContent,
      passageStyle: "plain",
      showPassageTitle: ctx.layout.showPassageTitle === true,
      compact: ctx.compact,
      usesSentenceInsertMarkers: group.items.some(
        (item) => item.sourceQuestion.subType === "SENTENCE_INSERT",
      ),
    }),
  );
  return out;
}

function appendPaperGroups(target: DocChild[], groups: PaperGroup[], ctx: GroupRenderContext) {
  // 워드(DOCX) 전용: 문항과 문항 사이에 항상 빈 줄 1개를 넣어 간격을 일관되게 한다
  // (미리보기·HWPX 는 그대로 — 사용자 요청 "워드만"). 본문 한 줄 높이의 빈 단락.
  // 커스텀 블록 바로 뒤의 첫 문항 그룹 앞에는 넣지 않는다(종전 flush 단위 동작과 같다).
  const sepBodySize = ctx.compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const sepLh = ctx.compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
  const questionSeparator = () =>
    new Paragraph({
      spacing: { before: 0, after: 0, ...exactLineSpacing(sepBodySize, sepLh) },
      children: [new TextRun({ text: " ", font: bodyFont, size: sepBodySize })],
    });
  let prevWasQuestionGroup = false;

  for (const group of groups) {
    const first = group.items[0];
    if (!first) continue;
    if (first.blockType !== "question") {
      for (const block of group.items) {
        target.push(...buildCustomBlock(customBlockFromPaperItem(block), ctx.compact));
      }
      prevWasQuestionGroup = false;
      continue;
    }
    if (prevWasQuestionGroup) target.push(questionSeparator());
    // ① 그룹 지문 — buildGroups 가 판정을 끝냈다(세트 병합·KO 공유지문·기출 세트 토글·
    //    비문항 블록으로 쪼개진 묶음의 1회 출력). 여기서 includePassage 를 재해석하지 않는다.
    const groupPassageShown = group.includePassage && Boolean(group.passageContent.trim());
    if (groupPassageShown) target.push(...buildGroupPassage(group, ctx));
    let renderedInGroup = 0;
    for (const item of group.items) {
      const exportItem = toPaperExportItem(item);
      if (!exportItem) continue;
      // 같은 지문을 공유하는 그룹 내 문항들 사이에도 빈 줄 1개.
      if (renderedInGroup > 0) target.push(questionSeparator());
      // ② 문항 안 지문 = exportItem.printInlinePassage (question.ts 가 그대로 그린다).
      target.push(
        ...buildQuestionBlock(exportItem, ctx.layout, ctx.includeAnswers, { groupPassageShown }),
      );
      renderedInGroup += 1;
    }
    prevWasQuestionGroup = renderedInGroup > 0;
  }
}

// =============================================================================
// 메인: Document 빌드
// =============================================================================

export type BuildBuilderExamDocumentInput = {
  title: string;
  /** 저장 설정. null = settings 없는 시험지(레이아웃·머리글은 resolvePaperLayout 기본값). */
  settings: DocxPaperSettingsLike | null;
  includeAnswers: boolean;
} & (
  | {
      /** 공용 정본 PaperItem[](buildPaperItemsFromExam). 시험지 라우트가 쓰는 경로. */
      paperItems: readonly PaperItem[];
      resolvedItems?: undefined;
      fullExamQuestions?: undefined;
    }
  | {
      /**
       * 호환 입력 — 단일 문항 내보내기 라우트·기존 테스트 하네스. 항목에 공용 PaperItem(paperItem)이
       * 동봉돼 있으면 그대로 쓰고(단일 문항 로더), 없으면 저장 항목으로 보고 공용 규칙을 태운다
       * (paperItemsFromResolvedItems). fullExamQuestions 가 비면 정답표를 싣지 않는다.
       */
      paperItems?: undefined;
      resolvedItems: DocxResolvedInput[];
      fullExamQuestions: ExamQuestionData[];
    }
);

export function buildBuilderExamDocument(opts: BuildBuilderExamDocumentInput): Document {
  const { title, settings, includeAnswers } = opts;
  const resolvedLayout = resolvePaperLayout(settings);
  const layout = builderLayoutFrom(resolvedLayout);
  const header = builderHeaderFrom(resolvedLayout);

  let paperItems: readonly PaperItem[];
  let answers: AnswerEntry[];
  if (opts.paperItems) {
    paperItems = opts.paperItems;
    answers = answerKeyEntries(paperItems);
  } else {
    paperItems = paperItemsFromResolvedItems(opts.resolvedItems, settings?.blocks ?? undefined);
    answers = opts.fullExamQuestions.length > 0 ? answerKeyEntries(paperItems) : [];
  }

  setBodyFont(bodyFontForTemplate(resolvedLayout.template));
  const compact = layout.density === "compact";
  // 용지·여백·단 간격·그릇 폭의 단일 원천(표 폭 계산과 같은 값 — page-geometry.ts).
  const geometry = builderPageGeometry(layout);

  // ---- Section 1: 1페이지 상단 헤더 (단일 컬럼, 연속 섹션) ----
  const section1Children: DocChild[] = buildPage1Header(
    header,
    title,
    compact,
    geometry.pageContentWidthDxa,
  );

  // ---- Section 2: 본문 (1단/2단) ----
  const section2Children: DocChild[] = [];
  appendPaperGroups(section2Children, buildGroups([...paperItems]), {
    layout,
    includeAnswers,
    compact,
  });

  // 정답표 (정답포함 모드가 아닐 때만 추가) — 항상 새 페이지에서 시작, 본문 단 폭에 맞춘다.
  if (!includeAnswers && answers.length > 0) {
    section2Children.push(
      ...buildAnswerKeyTableFromEntries(answers, {
        pageBreakBefore: true,
        containerWidthDxa: geometry.bodyColumnWidthDxa,
      }),
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
          new TextRun({ text: "- ", font: bodyFont, size: SIZE_FOOTER, color: COLOR.gray }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_FOOTER, color: COLOR.gray }),
          new TextRun({ text: " / ", font: bodyFont, size: SIZE_FOOTER, color: COLOR.gray }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: SIZE_FOOTER, color: COLOR.gray }),
          new TextRun({ text: " -", font: bodyFont, size: SIZE_FOOTER, color: COLOR.gray }),
        ],
      }),
    ],
  });

  const page = { size: geometry.pageSize, margin: geometry.margin };
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
          page,
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
          page,
          column: { count: geometry.columns, space: geometry.columnSpaceDxa },
          titlePage: true,
        },
        headers: { first: emptyHeader, default: continuedHeader },
        footers: { first: pageFooter, default: pageFooter },
        children: section2Children,
      },
    ],
  });
}

/**
 * 시험지 DOCX 의 순수 진입점(라우트·검증 하네스 공용) — DB·파일·이미지 변환 없음.
 * 이미지(webp 등) 임베드 변환은 호출부가 settings.blocks·header.academyLogoDataUrl 을 제자리
 * 변환한 뒤 부른다. settings 가 null 이거나 빌더 형식이 아니면 문항은 makePaperItem 기본값,
 * 레이아웃은 resolvePaperLayout 기본값으로 조판된다(레거시 렌더러 미사용).
 */
export function buildExamDocxDocument(input: {
  title: string;
  examQuestions: readonly SavedPaperExamQuestion[];
  settings: SavedPaperSettings | null;
  includeAnswers: boolean;
}): Document {
  const paperItems = buildPaperItemsFromExam(input.examQuestions, input.settings);
  return buildBuilderExamDocument({
    title: input.title,
    settings: input.settings as DocxPaperSettingsLike | null,
    paperItems,
    includeAnswers: input.includeAnswers,
  });
}
