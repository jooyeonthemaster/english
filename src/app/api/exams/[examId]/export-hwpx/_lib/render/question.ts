/**
 * 한 문제(번호 + 메타 + 본문 + 옵션 + 답란/정답해설) 렌더러.
 * DOCX 의 buildQuestionBlock 과 동일한 시각 구조를 HWPX 로 재현.
 */

import type { BlockNode, BorderSpec, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE, SUBTYPE_LABELS } from "../tokens";
import { parseFormattedToRuns } from "../format";
import { renderOptions, type ParsedOption } from "./options";
import {
  renderBlanks,
  renderConditions,
  renderContext,
  renderDirection,
  renderError,
  renderFallback,
  renderFirstLetter,
  renderGloss,
  renderHint,
  renderMarker,
  renderMatchType,
  renderParagraphs,
  renderScrambled,
  renderSummary,
  renderTarget,
  renderWordBank,
} from "./section-types";
import { renderPassage } from "./passage";
import { renderAnswerBlock } from "./answer";

import { parseQuestionSections } from "@/app/api/exams/[examId]/export-docx/_lib/parse-question-sections";
import {
  formatInlineMarkersForSubtype,
  optionOrdinalLabel,
  shouldRenderOptionListForSubtype,
} from "@/components/exams/paper-builder/option-display";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import {
  normalizeInlineText,
  normalizeQuestionText,
} from "@/components/exams/paper-builder/text-normalization";
import {
  questionHasEmbeddedPassage,
  shouldRenderSourcePassageInsideQuestion,
} from "@/components/exams/paper-builder/passage-policy";
import {
  isSummaryCompleteMc,
  isSummaryCompleteSubtype,
  splitSummaryCompleteMcQuestionText,
} from "@/components/exams/paper-builder/summary-complete-mc-layout";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";
import {
  isSummaryWriting,
  summaryWritingMaskedSummary,
  summaryWritingWordBankText,
} from "@/lib/summary-writing";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
const GIVEN_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.18,
  color: COLORS.gray,
};
const ANSWER_LINE: BorderSpec = {
  type: "SOLID",
  widthMm: 0.12,
  color: COLORS.lightGray,
};

export interface BuilderItemResolved {
  localId?: string;
  questionId: string;
  orderNum?: number;
  points?: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: ParsedOption[];
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
  sourceQuestion: ExamQuestionData["question"];
}

export interface QuestionRenderOptions {
  item: BuilderItemResolved;
  layout: {
    columns?: 1 | 2;
    density?: "comfortable" | "compact";
    showAnswerSpace?: boolean;
    showQuestionMeta?: boolean;
    showPassageTitle?: boolean;
    passageStyle?: "boxed" | "underlined" | "plain";
  };
  includeAnswers: boolean;
  contentWidthHpu: number;
}

function safeParseOptions(raw: string | null | undefined): ParsedOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o, idx) => ({
      label: String(o?.label ?? idx + 1),
      text: String(o?.text ?? ""),
    }));
  } catch {
    return [];
  }
}

function stripOriginalBlock(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !/^\[(?:original|\uC6D0\uBB38)\]\s*/i.test(block))
    .join("\n\n")
    .trim();
}

function printablePassageTitle(item: BuilderItemResolved): string {
  const savedTitle = normalizeInlineText(item.passageTitle || "");
  const sourceTitle = normalizeInlineText(item.sourceQuestion.passage?.title || "");
  return savedTitle || sourceTitle;
}

function renderPassageTitleBlock(
  passageTitle: string,
  showPassageTitle: boolean,
): BlockNode[] {
  if (!showPassageTitle || !passageTitle.trim()) return [];
  return [
    {
      kind: "p",
      style: { align: "LEFT", spaceBefore: 20, spaceAfter: 30, lineSpacingPct: 130 },
      runs: [
        txt(passageTitle.toUpperCase(), {
          size: SIZE.passageTitle,
          bold: true,
          color: COLORS.darkGray,
          letterSpacing: 20,
        }),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// SUMMARY_WRITING (\uC694\uC57D\uBB38 \uC601\uC791) \uD559\uC0DD\uB178\uCD9C \uBE14\uB85D \uCD94\uCD9C.
//   \uC815\uB2F5\uACC4\uC5F4(modelAnswer / blanks[].answer / acceptableVariants / requiredLemmas /
//   wordBankDistractors / scoringCriteria)\uC740 \uC808\uB300 \uB9CC\uC9C0\uC9C0 \uC54A\uB294\uB2E4(SW-LEAK-1).
//   1\uCC28: structuredData(\uD83D\uDC41\uD544\uB4DC)\uC5D0\uC11C summary-writing.ts \uC758 \uD559\uC0DD\uC548\uC804 \uD5EC\uD37C\uB85C \uC9C1\uC811 \uC0DD\uC131.
//   2\uCC28(\uD3F4\uBC31): \uC774\uBBF8 \uD559\uC0DD\uC548\uC804\uD558\uAC8C \uC9C1\uB82C\uD654\uB41C questionText \uC758 [\uD574\uC11D]/[\uBCF4\uAE30]/[\uC55E\uAE00\uC790] \uBE14\uB85D\uB9CC \uD30C\uC2F1.
// ---------------------------------------------------------------------------

interface SummaryWritingStudentBlocks {
  gloss: string;
  summary: string;
  wordBank: string;
  firstLetters: string;
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// questionText \uD3F4\uBC31 \u2014 \uC774\uBBF8 \uD559\uC0DD\uC548\uC804 \uC9C1\uB82C\uD654\uB41C [\uD574\uC11D]/[\uBCF4\uAE30]/[\uC55E\uAE00\uC790] \uBE14\uB85D\uB9CC \uBF51\uB294\uB2E4.
// (\uC815\uB2F5\uACC4\uC5F4 \uB9C8\uCEE4 [\uBE48\uCE78 \uC815\uB2F5] \uC740 SUMMARY_WRITING \uC9C1\uB82C\uD654\uC5D0 \uC560\uCD08\uC5D0 \uC5C6\uB2E4.)
function extractSummaryWritingBlocksFromText(text: string): SummaryWritingStudentBlocks {
  const blocks = (text || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const pick = (marker: string) => {
    const block = blocks.find((b) => b.startsWith(marker));
    return block ? block.slice(marker.length).replace(/^\s*/, "").trim() : "";
  };
  return {
    gloss: pick("[\uD574\uC11D]"),
    summary: pick("[\uC694\uC57D\uBB38]"),
    wordBank: pick("[\uBCF4\uAE30]"),
    firstLetters: pick("[\uC55E\uAE00\uC790]"),
  };
}

function resolveSummaryWritingBlocks(
  sourceQuestion: ExamQuestionData["question"],
  questionText: string,
): SummaryWritingStudentBlocks {
  const structured = asPlainRecord(sourceQuestion.structuredData);
  const hasStructured =
    typeof structured.summaryWithBlanks === "string" &&
    structured.summaryWithBlanks.trim().length > 0;

  if (hasStructured) {
    return {
      gloss: typeof structured.koreanGloss === "string" ? structured.koreanGloss.trim() : "",
      // 앞글자 단서는 별도 줄이 아니라 [요약문] 빈칸이 단어별 슬롯(칸마다 앞글자)으로 렌더된다
      // (summaryWritingMaskedSummary 가 clueMode=firstLetter 면 "(A) p____ s____ ..." 생성).
      summary: summaryWritingMaskedSummary(structured),
      wordBank: summaryWritingWordBankText(structured),
      firstLetters: "",
    };
  }
  return extractSummaryWritingBlocksFromText(questionText);
}

export function renderQuestionBlock(opts: QuestionRenderOptions): BlockNode[] {
  const { item, layout, includeAnswers, contentWidthHpu } = opts;
  const compact = layout.density === "compact";
  // 미리보기/break-plan 과 동일하게 기본 ON ([점·유형] 표시). 이전엔 === true 라 기본 OFF 였다.
  const showMeta = layout.showQuestionMeta !== false;
  const showAnswerSpace = layout.showAnswerSpace !== false && !includeAnswers;

  const orderNum = item.orderNum ?? 0;
  const points = item.points ?? 1;
  const subType = item.sourceQuestion.subType || "";
  const subTypeLabel = subType ? SUBTYPE_LABELS[subType] || subType : "";
  const questionText = normalizeQuestionText(
    formatInlineMarkersForSubtype(
      item.questionText ?? item.sourceQuestion.questionText ?? "",
      subType,
    ),
  ).trim();
  const displayQuestionText =
    subType === "SENTENCE_TRANSFORM"
      ? stripOriginalBlock(questionText)
      : questionText;
  const parsedOptions = (item.options ?? safeParseOptions(item.sourceQuestion.options))
    .filter((o) => o && (o.text || "").length >= 0);
  const options = shouldRenderOptionListForSubtype(subType) ? parsedOptions : [];

  const result: BlockNode[] = [];
  const qNumSize = compact ? SIZE.qNumCompact : SIZE.qNum;
  const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
  const showPassageTitle = layout.showPassageTitle === true;
  const passageTitle = printablePassageTitle(item);

  // ── SUMMARY_WRITING (요약문 영작) 전용 렌더 ──
  //   SUMMARY_COMPLETE 의 헤더/박스 구조를 미러하되, 정답 자동채움(maskSummary +
  //   readSummaryBlankAnswers) 경로를 절대 타지 않는다. 학생노출 블록만 그린다.
  //   순서: 헤더(번호+배점+stem) → [해석] → [요약문]((A)(B)빈칸선) → [보기] →
  //         [앞글자] → 영작 답란(border-bottom 줄). 화살표 없음.
  //   isSummaryWriting 를 isSummaryCompleteSubtype 보다 먼저 검사해, 후자가 확장돼
  //   SUMMARY_WRITING 을 포함하게 되더라도 누설 경로로 빠지지 않게 한다(SW-LEAK-1).
  if (isSummaryWriting(subType)) {
    const swSections = parseQuestionSections(displayQuestionText, subType);
    const swDirection = swSections.find((s) => s.type === "direction");
    const swStem = (swDirection?.content ?? "").trim();
    const blocks = resolveSummaryWritingBlocks(item.sourceQuestion, displayQuestionText);

    // 1. 헤더 (번호 + [배점 · 유형] + 발문)
    const headerRuns: RunNode[] = [
      txt(`${orderNum}. `, { size: qNumSize, bold: true, color: COLORS.black }),
    ];
    if (showMeta) {
      headerRuns.push(
        txt("  ", { size: qNumSize }),
        txt(subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`, {
          size: SIZE.meta,
          color: COLORS.gray,
        }),
      );
    }
    if (swStem) {
      headerRuns.push(
        txt(" ", { size: bodySize }),
        ...parseFormattedToRuns(swStem, {
          size: compact ? SIZE.bodyCompact : SIZE.body,
          bold: true,
        }),
      );
    }
    result.push({
      kind: "p",
      style: { spaceBefore: 80, spaceAfter: 100, lineSpacingPct: 158 },
      runs: headerRuns,
    });

    // 2. [지문] — "무조건" 함께 렌더(사용자 요구·레퍼런스 형식, SUMMARY_COMPLETE 미러). 요약문 위에.
    const swPassage = (item.passageContent ?? item.sourceQuestion.passage?.content ?? "").trim();
    if (swPassage) {
      result.push(
        ...renderPassage({
          passageTitle,
          passageContent: swPassage,
          passageStyle: "plain",
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers: false,
          contentWidthHpu,
        }),
      );
    }

    // 3. [해석] (있으면) — 회색 박스
    if (blocks.gloss) result.push(...renderGloss(blocks.gloss));

    // 3. [요약문] ((A)(B) 파란 배지 + 고정폭 빈칸선) — renderSummary 재사용
    if (blocks.summary) {
      result.push(
        ...renderSummary({ type: "summary", label: "요약문", content: blocks.summary }, contentWidthHpu),
      );
    }

    // 4. [보기] (있으면) — WordOrder 칩 스타일
    if (blocks.wordBank) result.push(...renderWordBank(blocks.wordBank));

    // 5. [앞글자] (있으면) — 회색 작은 텍스트
    if (blocks.firstLetters) result.push(...renderFirstLetter(blocks.firstLetters));

    // 6. 영작 답란 (서술형 writing space) — 정답 미포함 경로에서만. 화살표 없음.
    if (showAnswerSpace && (item.answerSpaceLines ?? 0) > 0) {
      const lines = Math.max(1, Math.min(12, item.answerSpaceLines ?? 3));
      for (let i = 0; i < lines; i++) {
        result.push({
          kind: "tbl",
          colWidthsHpu: [contentWidthHpu],
          borders: { left: NO, right: NO, top: NO, bottom: ANSWER_LINE },
          rows: [
            {
              heightHpu: 720,
              cells: [
                {
                  widthHpu: contentWidthHpu,
                  heightHpu: 720,
                  vAlign: "BOTTOM",
                  borders: { left: NO, right: NO, top: NO, bottom: ANSWER_LINE },
                  margins: { left: 0, right: 0, top: i === 0 ? 80 : 120, bottom: 0 },
                  blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
                },
              ],
            },
          ],
        });
      }
    }

    // 7. 정답·해설 (교사면, includeAnswers=true 일 때만). 정답계열은 여기서만.
    if (includeAnswers) {
      result.push(
        ...renderAnswerBlock({
          correctAnswer: formatStoredQuestionCorrectAnswer({
            ...item.sourceQuestion,
            correctAnswer: item.correctAnswer ?? item.sourceQuestion.correctAnswer ?? "",
          }),
          explanation: item.sourceQuestion.explanation,
          hasOptions: false,
          contentWidthHpu,
        }),
      );
    }

    void GIVEN_BORDER;
    return result;
  }

  // 본문 텍스트 파싱
  const sections = parseQuestionSections(displayQuestionText, subType);
  const directionSection = sections.find((s) => s.type === "direction");
  const summaryComplete = isSummaryCompleteSubtype(subType);
  const summaryMc = isSummaryCompleteMc(subType);
  const sourcePassageContent = item.passageContent ?? item.sourceQuestion.passage?.content ?? "";
  const hasEmbeddedSourcePassage = questionHasEmbeddedPassage({
    ...item.sourceQuestion,
    questionText,
    passage: { content: sourcePassageContent },
  });
  const inlineSourcePassage =
    shouldRenderSourcePassageInsideQuestion(subType) && !summaryMc && !hasEmbeddedSourcePassage;
  const summaryParts = summaryComplete
    ? splitSummaryCompleteMcQuestionText(displayQuestionText)
    : { stem: "", summary: "" };
  const summaryText = summaryComplete
    ? formatSummaryCompleteMcSummaryForDisplay(
      summaryParts.summary,
      readSummaryBlankAnswersFromQuestionLike(
        item.sourceQuestion,
        item.options,
        item.correctAnswer ?? item.sourceQuestion.correctAnswer,
      ),
    )
    : "";
  if (hasEmbeddedSourcePassage) {
    result.push(...renderPassageTitleBlock(passageTitle, showPassageTitle));
  }

  // 1. 번호 + 메타 + (지시문)
  if (summaryComplete) {
    const headerRuns: RunNode[] = [
      txt(`${orderNum}. `, {
        size: qNumSize,
        bold: true,
        color: COLORS.black,
      }),
    ];
    if (showMeta) {
      headerRuns.push(
        txt(subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`, {
          size: SIZE.meta,
          color: COLORS.gray,
        }),
      );
    }
    if (summaryParts.stem) {
      headerRuns.push(
        ...parseFormattedToRuns(summaryParts.stem, {
          size: compact ? SIZE.bodyCompact : SIZE.body,
          bold: true,
        }),
      );
    }
    result.push({
      kind: "p",
      style: { spaceBefore: 80, spaceAfter: 80, lineSpacingPct: 158 },
      runs: headerRuns,
    });
  } else if (directionSection) {
    result.push(
      ...renderDirection(
        directionSection,
        orderNum,
        points,
        subTypeLabel,
        showMeta,
        compact,
      ),
    );
  } else {
    const headerRuns: RunNode[] = [
      txt(`${orderNum}. `, {
        size: qNumSize,
        bold: true,
        color: COLORS.black,
      }),
    ];
    if (showMeta) {
      headerRuns.push(
        txt(subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`, {
          size: SIZE.meta,
          color: COLORS.gray,
        }),
      );
    }
    result.push({
      kind: "p",
      style: { spaceBefore: 80, spaceAfter: 80 },
      runs: headerRuns,
    });
  }

  // 2. 글로벌 지문 (passage 모델, embed 가 아닌 경우)
  //    fragment 경로는 재구성된 PaperItem(sourceQuestion.passage 없음)을 넘기므로,
  //    지문 존재 판정은 sourceQuestion.passage 가 아니라 passageContent 로 한다.
  const sourcePassage = item.sourceQuestion.passage;
  const inlinePassageContent =
    formatSourcePassageForQuestionItems(
      item.passageContent ?? sourcePassage?.content ?? "",
      [item],
    );
  if (inlinePassageContent && (summaryMc || inlineSourcePassage)) {
    result.push(
      ...renderPassage({
        passageTitle,
        passageContent: inlinePassageContent,
        passageStyle: "plain",
        showPassageTitle,
        compact,
        usesSentenceInsertMarkers: subType === "SENTENCE_INSERT",
        contentWidthHpu,
      }),
    );
  }

  // 3. 본문 섹션들
  if (summaryComplete) {
    if (summaryMc) {
      result.push({
        kind: "p",
        style: { align: "CENTER", spaceBefore: 20, spaceAfter: 60 },
        runs: [txt("\u2193", { size: bodySize, bold: true, color: COLORS.gray })],
      });
    }
    if (summaryText) {
      result.push(
        ...renderSummary(
          {
            type: "summary",
            content: summaryMc ? summaryText : `[\uC694\uC57D\uBB38] ${summaryText}`,
          },
          contentWidthHpu,
        ),
      );
    }
  } else {
    // 문장삽입: '주어진 문장' 마커 박스는 지문 '위'에 와야 한다. 레거시 직렬화는
    // 지문 뒤에 위치할 수 있으므로 marker 섹션을 본문 앞으로 끌어올린다.
    const orderedSections =
      subType === "SENTENCE_INSERT"
        ? [
            ...sections.filter((s) => s.type === "marker"),
            ...sections.filter((s) => s.type !== "marker"),
          ]
        : sections;
    for (const section of orderedSections) {
      if (section.type === "direction") continue;
      switch (section.type) {
      case "passage":
        result.push(
          ...renderPassage({
            passageTitle,
            passageContent: section.content,
            passageStyle: "plain",
            showPassageTitle,
            compact,
            usesSentenceInsertMarkers: subType === "SENTENCE_INSERT",
            contentWidthHpu,
          }),
        );
        break;
      case "marker":
        result.push(...renderMarker(section, contentWidthHpu));
        break;
      case "conditions":
        result.push(...renderConditions(section));
        break;
      case "error":
        result.push(...renderError(section, contentWidthHpu));
        break;
      case "summary":
        result.push(...renderSummary(section, contentWidthHpu));
        break;
      case "scrambled":
        result.push(...renderScrambled(section));
        break;
      case "target":
        result.push(...renderTarget(section));
        break;
      case "context":
        result.push(...renderContext(section));
        break;
      case "paragraphs":
        result.push(...renderParagraphs(section));
        break;
      case "blanks":
        result.push(...renderBlanks(section));
        break;
      case "hint":
        result.push(...renderHint(section));
        break;
      case "matchType":
        result.push(...renderMatchType(section));
        break;
      default:
        result.push(...renderFallback(section));
      }
    }
  }

  // 4. 옵션
  if (options.length > 0) {
    result.push(...renderOptions({ options, subType, compact, contentWidthHpu }));
  }

  // 5. 객관식 추가 선지
  if (
    showAnswerSpace &&
    options.length > 0 &&
    (item.objectiveAnswerSlots ?? 0) > 0
  ) {
    const slots = Math.max(1, Math.min(10, item.objectiveAnswerSlots ?? 0));
    const objectiveAnswerTexts = item.objectiveAnswerTexts || [];
    for (let i = 0; i < slots; i += 1) {
      const optionIndex = options.length + i;
      const displayText = objectiveAnswerTexts[i]?.trim() || "";
      result.push({
        kind: "p",
        style: {
          leftMargin: 360,
          indentFirst: -280,
          spaceAfter: 40,
          lineSpacingPct: 145,
        },
        runs: [
          txt(optionOrdinalLabel(optionIndex), {
            size: bodySize,
            bold: true,
            color: COLORS.darkGray,
          }),
          txt("  ", { size: bodySize }),
          displayText
            ? txt(displayText, {
                size: bodySize,
                color: COLORS.darkGray,
              })
            : txt("", { size: bodySize, color: COLORS.darkGray }),
        ],
      });
    }
  }

  // 5. 서술형/주관식 답란
  if (showAnswerSpace && (item.answerSpaceLines ?? 0) > 0) {
    const lines = Math.max(1, Math.min(12, item.answerSpaceLines ?? 3));
    for (let i = 0; i < lines; i++) {
      result.push({
        kind: "tbl",
        colWidthsHpu: [contentWidthHpu],
        borders: { left: NO, right: NO, top: NO, bottom: ANSWER_LINE },
        rows: [
          {
            heightHpu: 720,
            cells: [
              {
                widthHpu: contentWidthHpu,
                heightHpu: 720,
                vAlign: "BOTTOM",
                borders: { left: NO, right: NO, top: NO, bottom: ANSWER_LINE },
                margins: { left: 0, right: 0, top: i === 0 ? 80 : 120, bottom: 0 },
                blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
              },
            ],
          },
        ],
      });
    }
  }

  // 6. 정답·해설 (해설 포함 모드)
  if (includeAnswers) {
    result.push(
      ...renderAnswerBlock({
        correctAnswer: formatStoredQuestionCorrectAnswer({
          ...item.sourceQuestion,
          correctAnswer: item.correctAnswer ?? item.sourceQuestion.correctAnswer ?? "",
        }),
        explanation: item.sourceQuestion.explanation,
        hasOptions: options.length > 0,
        contentWidthHpu,
      }),
    );
  }

  void GIVEN_BORDER;
  return result;
}
