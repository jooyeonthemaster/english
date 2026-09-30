// ============================================================================
// paper-export-items — PaperItem(웹 정본) → HWPX·DOCX 문서 빌더 입력(BuilderItemResolved 호환) 어댑터
// (26-09-30 CORE-MODEL). 서버 라우트는 자기 해석(resolveBuilderItems·applyBuilderSettings·
// shouldForceBuilderSourcePassage)을 버리고 아래 순서로만 소비한다:
//
//   const settings = parseSavedPaperSettings(exam.settings);          // saved-paper-items
//   const paperItems = buildPaperItemsFromExam(exam.questions, settings);
//   const groups = buildGroups(paperItems);                           // paper-item-groups — 지문 박스·세트 안내문
//   const exportItems = toPaperExportItems(paperItems);               // 문항만, 순서 보존
//   exportItems[i].printInlinePassage                                  // 문항 안 지문(없으면 "")
//   const layout = resolvePaperLayout(settings);                      // paper-layout-defaults
//   const answers = answerKeyEntries(paperItems);                     // answer-key-entries
//
// PaperExportItem 은 export-hwpx render/question.ts 와 export-docx build-builder-document/model.ts 의
// BuilderItemResolved 에 구조적으로 대입된다(+ breakBefore·keepWithPrev·printInlinePassage). 모든 필드는
// 이미 판정이 끝난 값이다 — 소비처는 `includePassage !== false || force` 같은 재해석을 하지 않는다.
//
// 지문은 두 자리에만 찍힌다(웹 인쇄와 같은 규칙, CM-R2):
//   ① 그룹 지문 박스 = buildGroups(paperItems) 의 group.includePassage·passageContent·setPrompt
//      (세트 공유 지문·기출 세트 토글·지문 묶음의 1회 출력이 여기서 끝난다. 비세트 지문 묶음에서 앞 멤버가 같은
//       지문을 ②로 이미 찍었으면 buildGroups 가 박스를 끈다 — paper-item-groups.dropBundleBoxAfterInlinePassage)
//   ② 문항 안 지문 박스 = PaperExportItem.printInlinePassage(inlineSourcePassageForItem). "" 면 없음.
//      구조화 유형(주제·제목·요지·내용일치·요약문·영작 등)만 해당하고, 세트 멤버는 항상 "" 다(공유 지문은 ①).
//      PaperItem 하나만으로 정해지는 값이다(그룹 문맥 불필요) — ①이 ②를 보고 조정한다.
// includePassage 는 판정 기록일 뿐 「문항 안 지문을 그릴지」로 다시 해석하지 않는다 — 영어 세트의 TITLE·
// CONTENT_MATCH 멤버는 강제 규칙으로 includePassage=true 지만 웹은 문항 안 지문을 그리지 않는다.
// JSX·window 의존 없음.
// ============================================================================
import type { BreakBefore, OptionItem, PaperBlockAlign, PaperItem } from "./types";
import { isSetMemberItem } from "./paper-item-model";
import { isFlowStructuredSubtype, structuredSegments } from "./question-body-layout";

/** export-docx _lib/types.ts ExamQuestionData["question"] 와 같은 모양. */
export type PaperExportSourceQuestion = {
  id: string;
  type: string;
  subType: string | null;
  /** 정규화·어법 수정형 복구가 끝난 발문(PaperItem.sourceQuestion.questionText). */
  questionText: string;
  structuredData?: unknown;
  /** 원 문항의 선지 JSON 문자열(표시용 선지는 PaperExportItem.options). */
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  /** 인쇄할 지문(EXAM-PAPER-MODEL §3 — 스냅숏 → DB → _sourcePassage). 싣는지는 PaperExportItem.includePassage 가 정한다. */
  passage: { title: string; content: string } | null;
  explanation: {
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
};

export type PaperExportItem = {
  localId: string;
  questionId: string;
  orderNum: number;
  points: number;
  groupId: string | null;
  /**
   * EXAM-PAPER-MODEL §2 판정 완료값(강제 ? true : 저장값 boolean ? 저장값 : 기본값). 판정 기록이다 — 무엇을 찍을지는
   * 그룹 지문 = buildGroups, 문항 안 지문 = printInlinePassage 로만 정한다(이 값으로 재해석 금지).
   */
  includePassage: boolean;
  /** 웹이 이 문항 안(구조화 본문)에 찍는 지문 박스 텍스트. 없으면 "". inlineSourcePassageForItem 참고. */
  printInlinePassage: string;
  passageTitle: string;
  passageContent: string;
  questionText: string;
  options: OptionItem[];
  correctAnswer: string;
  answerSpaceLines: number;
  objectiveAnswerSlots: number;
  objectiveAnswerTexts: string[];
  sectionTitle: string;
  teacherNote: string;
  blockFontPt: number | null;
  blockBold: boolean;
  blockItalic: boolean;
  blockAlign: PaperBlockAlign;
  breakBefore: BreakBefore;
  keepWithPrev: boolean;
  sourceQuestion: PaperExportSourceQuestion;
};

/**
 * 웹 인쇄가 문항 안(구조화 본문)에 실제로 그리는 출처 지문 — 없으면 "".
 * 웹 조판(pagination-metrics.buildStructLineBlocks → a4-paper-page StructuredBody)과 같은 규칙이다:
 *  - 구조화 유형(isFlowStructuredSubtype)만 구조화 본문을 그린다(그 밖 유형의 지문은 그룹 지문 박스뿐).
 *  - structuredSegments 의 passage 박스를 쓴다. 강제·저장 토글·기출 세트(빈 세그먼트)·요약문류 항상 인라인은
 *    이미 그 안에서 판정된다.
 *  - 세트 멤버(setId)는 passage 박스를 버린다. 공유 지문은 그룹 선두 박스(buildGroups)가 1회만 그린다.
 */
export function inlineSourcePassageForItem(item: PaperItem): string {
  if (item.blockType !== "question") return "";
  if (!isFlowStructuredSubtype(item.sourceQuestion.subType)) return "";
  if (isSetMemberItem(item)) return "";
  return structuredSegments(item)
    .flatMap((seg) => (seg.kind === "box" && seg.boxStyle === "passage" ? [seg.text] : []))
    .join("\n\n");
}

/** 문항 PaperItem 하나 → 문서 빌더 입력. 문항 블록이 아니면 null(텍스트·섹션·이미지 블록은 PaperItem 그대로 쓴다). */
export function toPaperExportItem(item: PaperItem): PaperExportItem | null {
  if (item.blockType !== "question") return null;
  const source = item.sourceQuestion;
  const passageContent = item.passageContent || source.passage?.content || "";
  const passageTitle = item.passageTitle || source.passage?.title || "";
  return {
    localId: item.localId,
    questionId: item.questionId,
    orderNum: item.orderNum,
    points: item.points,
    groupId: item.groupId,
    includePassage: item.includePassage,
    printInlinePassage: inlineSourcePassageForItem(item),
    passageTitle,
    passageContent,
    questionText: item.questionText,
    options: item.options,
    correctAnswer: item.correctAnswer,
    answerSpaceLines: item.answerSpaceLines,
    objectiveAnswerSlots: item.objectiveAnswerSlots,
    objectiveAnswerTexts: item.objectiveAnswerTexts,
    sectionTitle: item.sectionTitle,
    teacherNote: item.teacherNote,
    blockFontPt: item.blockFontPt,
    blockBold: item.blockBold,
    blockItalic: item.blockItalic,
    blockAlign: item.blockAlign,
    breakBefore: item.breakBefore,
    keepWithPrev: item.keepWithPrev,
    sourceQuestion: {
      id: source.id,
      type: source.type,
      subType: source.subType,
      questionText: source.questionText,
      structuredData: source.structuredData,
      options: source.options,
      correctAnswer: source.correctAnswer,
      difficulty: source.difficulty,
      passage: passageContent || source.passage ? { title: passageTitle, content: passageContent } : null,
      explanation: source.explanation
        ? {
            content: source.explanation.content ?? "",
            keyPoints: source.explanation.keyPoints ?? null,
            wrongOptionExplanations: source.explanation.wrongOptionExplanations ?? null,
          }
        : null,
    },
  };
}

/** 문항 PaperItem 들 → 문서 빌더 입력(문항만, 순서 보존). */
export function toPaperExportItems(items: readonly PaperItem[]): PaperExportItem[] {
  const out: PaperExportItem[] = [];
  for (const item of items) {
    const exported = toPaperExportItem(item);
    if (exported) out.push(exported);
  }
  return out;
}
