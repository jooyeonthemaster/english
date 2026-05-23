/**
 * 시험지 빌더 → HwpxDocument 메인 엔트리.
 *
 * 입력: BuilderSettings + ExamQuestionData[]
 * 출력: HwpxDocument (그 다음 package.ts 에서 ZIP 생성)
 */

import { mm, A4_WIDTH, A4_HEIGHT } from "./units";
import type { BlockNode, HwpxDocument, SectionSpec } from "./types";
import { txt } from "./types";
import { COLORS, SIZE } from "./tokens";
import { renderPageHeader } from "./render/page-header";
import { renderPassage } from "./render/passage";
import {
  renderQuestionBlock,
  type BuilderItemResolved,
} from "./render/question";
import { renderAnswerKey } from "./render/answer-key";
import type {
  BuilderHeader,
  BuilderLayout,
  BuilderSettings,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

export interface BuildHwpxOptions {
  title: string;
  settings: BuilderSettings | null;
  resolvedItems: BuilderItemResolved[];
  includeAnswers: boolean;
  fullExamQuestions: ExamQuestionData[];
}

function groupItems(
  items: BuilderItemResolved[],
): Array<{ groupKey: string; items: BuilderItemResolved[] }> {
  const groups: Array<{ groupKey: string; items: BuilderItemResolved[] }> = [];
  for (const item of items) {
    const key = item.groupId || `single:${item.questionId}-${item.orderNum}`;
    const last = groups[groups.length - 1];
    if (last && last.groupKey === key) {
      last.items.push(item);
    } else {
      groups.push({ groupKey: key, items: [item] });
    }
  }
  return groups;
}

export function buildBuilderHwpxDocument(
  opts: BuildHwpxOptions,
): HwpxDocument {
  const { title, settings, resolvedItems, includeAnswers, fullExamQuestions } =
    opts;
  const header: BuilderHeader = settings?.header ?? {};
  const layout: BuilderLayout = settings?.layout ?? {};
  const compact = layout.density === "compact";
  const passageStyle = layout.passageStyle ?? "boxed";
  const showPassageTitle = layout.showPassageTitle !== false;
  const columns: 1 | 2 = layout.columns === 1 ? 1 : 2;

  // 페이지 설정 (A4) — 미리보기와 비슷한 빽빽한 마진
  const marginLR = compact ? mm(12) : mm(14);
  const marginTB = compact ? mm(12) : mm(14);
  const pageWidth = A4_WIDTH;
  const pageHeight = A4_HEIGHT;
  const contentWidth = pageWidth - 2 * marginLR;
  const columnGap = mm(6);
  const columnWidth =
    columns === 1
      ? contentWidth
      : Math.floor((contentWidth - columnGap) / 2);

  const blocks: BlockNode[] = [];

  // 1) 페이지 헤더 (제목, 학교/반/이름)
  //    2단 모드에서도 헤더 표는 단 폭으로 줄어든다(자동). 사용자는 columns=1
  //    모드를 골라야 헤더가 페이지 전체 폭을 차지하는 일반 시험지 룩이 된다.
  blocks.push(
    ...renderPageHeader({
      subtitle: header.subtitle,
      title,
      schoolName: header.schoolName,
      className: header.className,
      studentNameLabel: header.studentNameLabel,
      compact,
      contentWidthHpu: columnWidth,
    }),
  );

  // 2) 안내문
  const instructions = (header.instructions || "").trim();
  if (instructions) {
    blocks.push({
      kind: "p",
      style: {
        align: "LEFT",
        spaceBefore: 120,
        spaceAfter: 160,
        lineSpacingPct: 150,
      },
      runs: [
        txt(instructions, {
          size: SIZE.instructions,
          color: COLORS.gray,
        }),
      ],
    });
  } else {
    blocks.push({ kind: "p", style: { spaceAfter: 100 }, runs: [] });
  }

  // 3) 본문 — 문제 그룹별
  const groups = groupItems(resolvedItems);
  for (const group of groups) {
    const first = group.items[0];
    const includePassage = first.includePassage !== false;
    const passageContent = (
      first.passageContent ?? first.sourceQuestion.passage?.content ?? ""
    ).trim();

    if (includePassage && passageContent) {
      blocks.push(
        ...renderPassage({
          passageTitle:
            first.passageTitle ?? first.sourceQuestion.passage?.title ?? "",
          passageContent,
          passageStyle,
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers: group.items.some(
            (it) => it.sourceQuestion.subType === "SENTENCE_INSERT",
          ),
          contentWidthHpu: columnWidth,
        }),
      );
    }
    for (const item of group.items) {
      blocks.push(
        ...renderQuestionBlock({
          item,
          layout,
          includeAnswers,
          contentWidthHpu: columnWidth,
        }),
      );
    }
  }

  // 4) 정답표 (해설 모드가 아닐 때)
  if (!includeAnswers && fullExamQuestions.length > 0) {
    blocks.push(
      ...renderAnswerKey(fullExamQuestions, columnWidth),
    );
  }

  // 5) 마지막 페이지 번호 (인라인) — Phase 0
  blocks.push({
    kind: "p",
    style: { align: "CENTER", spaceBefore: 240, spaceAfter: 0 },
    runs: [
      txt("- ", { size: SIZE.footer, color: COLORS.gray }),
      { kind: "pageNum", style: { size: SIZE.footer, color: COLORS.gray } },
      txt(" / ", { size: SIZE.footer, color: COLORS.gray }),
      { kind: "totalPages", style: { size: SIZE.footer, color: COLORS.gray } },
      txt(" -", { size: SIZE.footer, color: COLORS.gray }),
    ],
  });

  const section: SectionSpec = {
    pageWidthHpu: pageWidth,
    pageHeightHpu: pageHeight,
    marginLeft: marginLR,
    marginRight: marginLR,
    marginTop: marginTB,
    marginBottom: marginTB,
    marginHeader: mm(8),
    marginFooter: mm(8),
    columns,
    columnGapHpu: columnGap,
    blocks,
  };

  return { title, sections: [section] };
}
