/**
 * 한 문제(번호 + 메타 + 본문 + 옵션 + 답란/정답해설) 렌더러.
 * DOCX 의 buildQuestionBlock 과 동일한 시각 구조를 HWPX 로 재현.
 */

import type { BlockNode, BorderSpec, HAlign, RunNode } from "../types";
import { restyleBlockTree, txt } from "../types";
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
  KO_BOGI_HEADER_LINE_RE,
  KO_CONDITION_HEADER_LINE,
  KO_FOOTNOTE_LINE_RE,
  KO_SOURCE_LINE_RE,
  koPaperRenderModel,
  koPaperSegmentsFromModel,
  koPaperStemText,
} from "@/components/exams/paper-builder/korean/ko-paper-adapter";
import {
  formatInlineMarkersForSubtype,
  optionOrdinalLabel,
  shouldRenderOptionListForSubtype,
} from "@/components/exams/paper-builder/option-display";
import {
  normalizeInlineText,
  normalizeQuestionText,
} from "@/components/exams/paper-builder/text-normalization";
import { questionHasEmbeddedPassage } from "@/components/exams/paper-builder/passage-policy";
import { isFlowStructuredSubtype } from "@/components/exams/paper-builder/question-body-layout";
import { resolvePaperLayout } from "@/components/exams/paper-builder/paper-layout-defaults";
import type { BreakBefore, PaperItem } from "@/components/exams/paper-builder/types";
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
import {
  isTopicSentenceClozeMode,
  isTopicSentenceWriting,
  topicSentenceWritingMaskedTopic,
  topicSentenceWritingWordBankText,
} from "@/lib/topic-sentence-writing";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import { printInlinePassageOf } from "../export-model";

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
  // 문항 단위 서식(블록 서식 툴바) — 미리보기와 동일하게 다운로드에도 반영한다.
  blockFontPt?: number | null;
  blockBold?: boolean;
  blockItalic?: boolean;
  blockAlign?: "left" | "center" | "right";
  // 강제 나눔(SPEC §3.2) — builder-blocks.itemBreakFields 가 읽는다.
  breakBefore?: BreakBefore;
  keepWithPrev?: boolean;
  /**
   * 웹 인쇄가 이 문항 안(구조화 본문)에 그리는 지문(paper-export-items.inlineSourcePassageForItem). "" 면 없음.
   * 문항 안 지문은 이 값으로만 판단한다 — includePassage 를 「문항 안 지문」으로 재해석하지 않는다(CM-R2).
   * 없으면(손입력) printInlinePassageOf 가 같은 공용 규칙으로 계산한다.
   */
  printInlinePassage?: string;
  /** 이 항목을 만든 공용 PaperItem(라우트가 채운다). 조판(buildGroups)·정답표가 이것을 쓴다. */
  paperItem?: PaperItem;
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
  /** 그룹 지문 박스를 켠 그룹인가(group.includePassage) — 켰으면 본문 위 지문 제목을 또 찍지 않는다(웹·DOCX 와 같다). */
  groupPassageShown?: boolean;
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
      keepRole: "caption",
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

// ---------------------------------------------------------------------------
// TOPIC_SENTENCE_WRITING (주제문 영작) 학생노출 블록 추출.
//   SUMMARY_WRITING 과 동일한 SW-LEAK-1: 정답계열(modelAnswer / blanks[].answer /
//   acceptableVariants / requiredLemmas / wordBankDistractors / scoringCriteria)은 절대
//   만지지 않는다. mode 분기: cloze=[주제문](마스킹)+[보기], scrambled=[배열 단어].
//   1차: structuredData(👁필드)의 topic-sentence-writing.ts 학생안전 헬퍼로 직접 생성.
//   2차(폴백): 이미 학생안전하게 직렬화된 questionText 의 마커 블록만 파싱.
// ---------------------------------------------------------------------------

interface TopicSentenceWritingStudentBlocks {
  gloss: string; // [주제 힌트] koreanGloss
  topic: string; // [주제문] 마스킹된 주제문 (cloze)
  wordBank: string; // [보기] (cloze)
  scrambled: string; // [배열 단어] (scrambled)
}

function extractTopicSentenceWritingBlocksFromText(
  text: string,
): TopicSentenceWritingStudentBlocks {
  const blocks = (text || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const pick = (marker: string) => {
    const block = blocks.find((b) => b.startsWith(marker));
    return block ? block.slice(marker.length).replace(/^\s*/, "").trim() : "";
  };
  return {
    gloss: pick("[주제 힌트]"),
    topic: pick("[주제문]"),
    wordBank: pick("[보기]"),
    scrambled: pick("[배열 단어]"),
  };
}

function resolveTopicSentenceWritingBlocks(
  sourceQuestion: ExamQuestionData["question"],
  questionText: string,
): TopicSentenceWritingStudentBlocks {
  const structured = asPlainRecord(sourceQuestion.structuredData);
  const hasStructured =
    typeof structured.mode === "string" ||
    (Array.isArray(structured.scrambledWords) && structured.scrambledWords.length > 0) ||
    (typeof structured.summaryWithBlanks === "string" &&
      structured.summaryWithBlanks.trim().length > 0);

  if (hasStructured) {
    const gloss = typeof structured.koreanGloss === "string" ? structured.koreanGloss.trim() : "";
    if (isTopicSentenceClozeMode(structured)) {
      return {
        gloss,
        topic: topicSentenceWritingMaskedTopic(structured),
        wordBank: topicSentenceWritingWordBankText(structured),
        scrambled: "",
      };
    }
    const scrambled = Array.isArray(structured.scrambledWords)
      ? structured.scrambledWords
          .map((w) => (typeof w === "string" ? w.trim() : ""))
          .filter(Boolean)
          .join(" / ")
      : "";
    return { gloss, topic: "", wordBank: "", scrambled };
  }
  return extractTopicSentenceWritingBlocksFromText(questionText);
}

export function renderQuestionBlock(opts: QuestionRenderOptions): BlockNode[] {
  const { item, layout, includeAnswers, contentWidthHpu } = opts;
  const compact = layout.density === "compact";
  // 레이아웃 기본값은 웹 상세와 같은 정본(resolvePaperLayout) — [n점·유형] 배지는 기본 끔(docs/EXAM-PAPER-MODEL.md §8),
  // 답란은 기본 켬. 예전 `showQuestionMeta !== false` 는 settings NULL 시험지에 배지를 107/107 붙였다(P8).
  const resolvedLayout = resolvePaperLayout({ layout });
  const showMeta = resolvedLayout.showQuestionMeta;
  const showAnswerSpace = resolvedLayout.showAnswerSpace && !includeAnswers;

  const orderNum = item.orderNum ?? 0;
  const points = item.points ?? 1;
  const subType = item.sourceQuestion.subType || "";
  // 라벨이 없는 유형(UNKNOWN 등)은 유형 부분을 빼고 「[n점]」만 — 웹 a4-paper-page 배지와 같다(HW-4). 원시 코드 금지.
  const subTypeLabel = subType ? SUBTYPE_LABELS[subType] || "" : "";
  const questionText = normalizeQuestionText(
    formatInlineMarkersForSubtype(
      item.questionText ?? item.sourceQuestion.questionText ?? "",
      subType,
    ),
  ).trim();
  // SENTENCE_TRANSFORM: 지문을 인라인으로 보여줄 때만 [원문] 블록을 제거한다(원문이 지문에
  // 밑줄로 노출되므로 중복). 지문을 감추면(includePassage=false) [원문] 을 남겨 문장을 제공.
  const displayQuestionText =
    subType === "SENTENCE_TRANSFORM" && item.includePassage !== false
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

  // ── KO(국어) 문항 전용 렌더 ──
  //   structuredData → 렌더모델 → 어댑터 세그먼트(지문/보기/조건 박스) — 웹/DOCX 와
  //   1:1 정합. 발문은 koPaperStemText([n점]·부정어 __밑줄__ 포함). 어댑터 해소
  //   실패(미등록 유형·데이터 결손)면 null → 아래 표준 경로(parseQuestionSections
  //   + 【보기】/【조건】 마커)로 비파괴 강등된다.
  //   지문 박스는 문항 안 지문(printInlinePassageOf — 공용 규칙)이 있을 때만 그린다. includePassage 로 재해석하지
  //   않는다(COH-7): 세트 멤버·지문 끔·구조화 유형 밖은 "" 라 억제 — DOCX question.ts 의 같은 호출과 술어가 같다.
  const koModel = koPaperRenderModel({ ...item, includePassage: printInlinePassageOf(item).length > 0 });
  if (koModel) {
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
    const koStem = koPaperStemText(koModel).trim();
    if (koStem) {
      headerRuns.push(
        txt(" ", { size: bodySize }),
        ...parseFormattedToRuns(koStem, { size: bodySize, bold: true }),
      );
    }
    result.push({
      kind: "p",
      keepRole: "questionHead",
      style: { spaceBefore: 80, spaceAfter: 100, lineSpacingPct: 158 },
      runs: headerRuns,
    });

    for (const seg of koPaperSegmentsFromModel(koModel)) {
      if (seg.kind !== "box") continue;
      result.push(
        ...renderKoStructBox(
          seg.text,
          seg.boxStyle === "passage" ? "passage" : "given",
          compact,
        ),
      );
    }

    if (options.length > 0) {
      result.push(...renderOptions({ options, subType, compact, contentWidthHpu }));
    }

    // 서술형 답란 (정답 미포함 경로에서만) — 표준 경로의 답란 블록 미러.
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

    // 정답·해설 (해설 포함 모드)
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
          subType: item.sourceQuestion.subType,
        }),
      );
    }

    void GIVEN_BORDER;
    return result;
  }

  // ── TOPIC_SENTENCE_WRITING (주제문 영작) 전용 렌더 ──
  //   SUMMARY_WRITING 파이프를 미러하되 라벨/마커만 주제문용으로 바꾸고, mode 로 분기한다.
  //   순서: 헤더(번호+배점+stem) → [지문] → [주제 힌트](회색 context) →
  //     cloze: [주제문]((A)(B) 빈칸선, renderSummary 재사용) + [보기](칩) /
  //     scrambled: [배열 단어](칩, WORD_ORDER 류) → 영작 답란 → (교사면) 정답·해설.
  //   isSummaryWriting 보다 먼저 검사한다(독립 분기, 무회귀). 정답계열은 영작 답란/칩/마스킹
  //   어디에도 들어가지 않는다(SW-LEAK-1). 학생노출은 셔플된 scrambledWords/마스킹 주제문뿐.
  if (isTopicSentenceWriting(subType)) {
    const tsSections = parseQuestionSections(displayQuestionText, subType);
    const tsDirection = tsSections.find((s) => s.type === "direction");
    const tsStem = (tsDirection?.content ?? "").trim();
    const blocks = resolveTopicSentenceWritingBlocks(item.sourceQuestion, displayQuestionText);

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
    if (tsStem) {
      headerRuns.push(
        txt(" ", { size: bodySize }),
        ...parseFormattedToRuns(tsStem, {
          size: compact ? SIZE.bodyCompact : SIZE.body,
          bold: true,
        }),
      );
    }
    result.push({
      kind: "p",
      keepRole: "questionHead",
      style: { spaceBefore: 80, spaceAfter: 100, lineSpacingPct: 158 },
      runs: headerRuns,
    });

    // 2. [지문] — 웹과 같은 문항 안 지문(단독 문항은 항상, 세트 멤버는 공유 지문이 맡아 없음). 주제문/제시어 위에.
    const tsPassage = printInlinePassageOf(item).trim();
    if (tsPassage) {
      result.push(
        ...renderPassage({
          passageTitle,
          passageContent: tsPassage,
          passageStyle: "plain",
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers: false,
          contentWidthHpu,
        }),
      );
    }

    // 3. [주제 힌트] (있으면) — 회색 context (renderGloss 색 규칙 미러, 라벨만 주제 힌트).
    if (blocks.gloss) {
      result.push(...renderContext({ type: "context", label: "주제 힌트", content: blocks.gloss }));
    }

    if (blocks.topic) {
      // 4a. cloze — [주제문]((A)(B) 파란 배지 + 고정폭 빈칸선) + [보기] 칩.
      result.push(
        ...renderSummary({ type: "summary", label: "주제문", content: blocks.topic }, contentWidthHpu),
      );
      if (blocks.wordBank) result.push(...renderWordBank(blocks.wordBank));
    } else if (blocks.scrambled) {
      // 4b. scrambled — [배열 단어] 칩(WORD_ORDER 류). 셔플된 제시어뿐, 정답 어순 미노출.
      result.push(
        ...renderScrambled({
          type: "scrambled",
          label: "배열 단어",
          content: blocks.scrambled,
          items: blocks.scrambled
            .split(/\s*\/\s*/)
            .map((w) => w.trim())
            .filter(Boolean),
        }),
      );
    }

    // 5. 영작 답란 (서술형 writing space) — 정답 미포함 경로에서만. 화살표 없음.
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

    // 6. 정답·해설 (교사면, includeAnswers=true 일 때만). 정답계열은 여기서만.
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
          subType: item.sourceQuestion.subType,
        }),
      );
    }

    void GIVEN_BORDER;
    return result;
  }

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
      keepRole: "questionHead",
      style: { spaceBefore: 80, spaceAfter: 100, lineSpacingPct: 158 },
      runs: headerRuns,
    });

    // 2. [지문] — 웹과 같은 문항 안 지문(단독 문항은 "무조건", 세트 멤버는 공유 지문이 맡아 없음). 요약문 위에.
    const swPassage = printInlinePassageOf(item).trim();
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
          subType: item.sourceQuestion.subType,
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
  // 문항 안 지문 = 웹 인쇄가 구조화 본문에 그리는 지문 박스 그대로(printInlinePassageOf — 공용 규칙).
  // 저장 토글·강제 규칙·요약문류 항상 인라인·세트 멤버 억제(공유 지문은 그룹 박스)가 모두 그 안에서 끝난다.
  // 여기서 includePassage 를 다시 해석하지 않는다(예전 `includePassage !== false` 는 settings NULL 에서
  // undefined 를 「지문 포함」으로 읽었다).
  const inlinePassageContent = printInlinePassageOf(item);
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
  // 본문 위 지문 제목 = 웹 a4-paper-page showBodyPassageTitle(DOCX question.ts 와 같은 술어): 내장 지문 유형이고,
  // 구조화 본문이 아니며(구조화 유형은 문항 안 지문 박스가 제목을 싣는다), 그룹 지문 박스가 꺼졌을 때만.
  // 예전에는 그룹 박스 제목에 더해 한 번 더 찍었다(지문 제목 표시 켬 + 내장 지문 유형 + 지문 켬).
  if (hasEmbeddedSourcePassage && !isFlowStructuredSubtype(subType) && !opts.groupPassageShown) {
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
      keepRole: "questionHead",
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
      keepRole: "questionHead",
      style: { spaceBefore: 80, spaceAfter: 80 },
      runs: headerRuns,
    });
  }

  // 2. 문항 안 지문(웹 structuredSegments 의 passage 박스와 같은 텍스트)
  if (inlinePassageContent) {
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
        keepRole: "caption",
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
        // 발문 속 지문(본문 섹션)에는 제목을 달지 않는다 — 웹은 본문을 제목 없이 그리고, 제목은 위의 본문 위 제목·
        // 그룹 지문 박스·문항 안 지문 박스에서만 찍는다(DOCX 도 같다). 예전에는 본문 위 제목과 합쳐 두 번 찍었다.
        result.push(
          ...renderPassage({
            passageTitle,
            passageContent: section.content,
            passageStyle: "plain",
            showPassageTitle: false,
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
        keepRole: "option",
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
        subType: item.sourceQuestion.subType,
      }),
    );
  }

  void GIVEN_BORDER;
  return result;
}

// -----------------------------------------------------------------------------
// KO(국어) 박스 — 어댑터 세그먼트 텍스트(행 규약)를 HWPX 문단으로 변환.
//   첫 행 "〈 보 기 〉" → 중앙 헤더 / "[조건]" → 볼드 라벨
//   지문 말미 "- 작가, 「작품」 -" → 우측 정렬 / "*어휘: 뜻" → 축소 회색
//   그 외 행 → 양끝맞춤 본문(__밑줄__·ⓐ 마커는 parseFormattedToRuns) — DOCX 미러.
// -----------------------------------------------------------------------------
function renderKoStructBox(
  text: string,
  style: "passage" | "given",
  compact: boolean,
): BlockNode[] {
  const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
  const lineSpacingPct = compact ? 146 : 158;
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: BlockNode[] = [];

  lines.forEach((line, idx) => {
    if (idx === 0 && KO_BOGI_HEADER_LINE_RE.test(line)) {
      blocks.push({
        kind: "p",
        keepRole: "caption",
        style: { align: "CENTER", spaceBefore: 40, spaceAfter: 30, lineSpacingPct: 120 },
        runs: [txt(line, { size: SIZE.meta, bold: true, color: COLORS.darkGray })],
      });
      return;
    }
    if (idx === 0 && line === KO_CONDITION_HEADER_LINE) {
      blocks.push({
        kind: "p",
        keepRole: "caption",
        style: { align: "LEFT", spaceBefore: 40, spaceAfter: 30, lineSpacingPct: 120 },
        runs: [txt(line, { size: SIZE.meta, bold: true, color: COLORS.gray })],
      });
      return;
    }
    if (style === "passage" && KO_SOURCE_LINE_RE.test(line)) {
      blocks.push({
        kind: "p",
        style: { align: "RIGHT", spaceBefore: 20, spaceAfter: 20, lineSpacingPct: 130 },
        runs: [txt(line, { size: SIZE.meta, color: COLORS.gray })],
      });
      return;
    }
    if (style === "passage" && KO_FOOTNOTE_LINE_RE.test(line)) {
      blocks.push({
        kind: "p",
        style: { align: "LEFT", spaceAfter: 20, lineSpacingPct: 130 },
        runs: [txt(line, { size: SIZE.meta, color: COLORS.gray })],
      });
      return;
    }
    blocks.push({
      kind: "p",
      style: {
        align: "JUSTIFY",
        spaceAfter: idx < lines.length - 1 ? 40 : 0,
        lineSpacingPct,
      },
      runs: parseFormattedToRuns(line, { size: bodySize }),
    });
  });

  // 박스 간/박스-선지 간격 (renderPassage 말미 spacing 관행 미러)
  blocks.push({ kind: "p", style: { spaceAfter: 100 }, runs: [] });
  return blocks;
}

// 문항 블록 단위 서식(글자 크기 pt·굵게·기울임·정렬)을 렌더 결과에 후처리로 입힌다.
// 미리보기는 문항 컨테이너에 fontSize/bold/italic/align 을 줘 발문·본문·선지가 상속하므로,
// 다운로드도 동일하게 문항의 모든 텍스트 런을 비례 조정한다. 기본값(미설정)이면 무변경.
export function applyQuestionBlockFormat(
  blocks: BlockNode[],
  fmt: {
    blockFontPt?: number | null;
    blockBold?: boolean;
    blockItalic?: boolean;
    blockAlign?: string | null;
  },
  compact: boolean,
): BlockNode[] {
  const baseBody = compact ? SIZE.bodyCompact : SIZE.body;
  const pt = fmt.blockFontPt;
  const scale = typeof pt === "number" && pt > 0 ? pt / baseBody : 1;
  const align: HAlign | undefined =
    fmt.blockAlign === "center" ? "CENTER" : fmt.blockAlign === "right" ? "RIGHT" : undefined;
  return restyleBlockTree(blocks, {
    scale,
    bold: !!fmt.blockBold,
    italic: !!fmt.blockItalic,
    align,
  });
}
