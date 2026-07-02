import * as React from "react";
import type {
  BuilderQuestion,
  InsertablePaperBlockType,
  OptionItem,
  PaperGroup,
  PaperItem,
} from "./types";
import {
  shouldForceSourcePassage,
  shouldIncludeSourcePassageByDefault,
  shouldRenderSourcePassageInsideQuestion,
} from "./passage-policy";
import { isSummaryWritingSubtype } from "./summary-complete-mc-layout";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "./text-normalization";
import { buildCanonicalSentenceInsertOptionsFrom } from "@/lib/sentence-insert-options";
import { getCircledNumber } from "@/lib/question-postprocess/types";
import { splitSentenceInsertGivenBlock } from "./option-display";
import { buildGrammarCorrectionQuestionTextForDisplay } from "@/lib/grammar-correction-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { formatSourcePassageForQuestionItems } from "./source-passage-markers";
import { normalizePaperFields } from "./render-model";

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function parseJSON<T>(input: unknown, fallback: T): T {
  if (!input) return fallback;
  if (Array.isArray(input)) return input as T;
  if (typeof input === "object") return input as T;
  if (typeof input !== "string") return fallback;
  try {
    const parsed = JSON.parse(input);
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function parseOptions(input: string | null): OptionItem[] {
  const parsed = parseJSON<OptionItem[]>(input, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((option, index) => ({
      label: normalizeInlineText(String(option?.label || index + 1)),
      text: normalizeQuestionText(String(option?.text || "")),
    }))
    .filter((option) => option.text.trim().length > 0 || option.label.trim().length > 0);
}

export function parseTags(input: string | null): string[] {
  const parsed = parseJSON<string[]>(input, []);
  return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : [];
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function questionPreview(questionText: string): string {
  return normalizeQuestionText(questionText).replace(/\s+/g, " ").trim().slice(0, 180);
}

function normalizedQuestionTextForPaper(question: BuilderQuestion): string {
  const normalizedQuestionText = normalizeQuestionText(question.questionText);
  if (question.subType !== "GRAMMAR_CORRECTION") {
    return normalizedQuestionText;
  }

  const structuredData = parseJSON<Record<string, unknown>>(question.structuredData, {});
  const grammarCorrectionText = normalizeQuestionText(
    buildGrammarCorrectionQuestionTextForDisplay(structuredData),
  );
  if (!grammarCorrectionText.includes("__")) {
    return normalizedQuestionText;
  }

  return grammarCorrectionText;
}

export function makeLocalId(questionId: string): string {
  return `${questionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// 지문 박스 제목: item 의 passageTitle 이 비면 원본 문항의 지문 제목으로 폴백+정규화(빈칸 방지).
export function resolvePaperItemPassageTitle(item: PaperItem): string {
  return normalizeInlineText(
    item.passageTitle || item.sourceQuestion.passage?.title || "",
  );
}

// 장문 세트(수능 43~45처럼 지문 1회 + N문항) 멤버의 그룹 ID.
// 같은 setId 멤버는 동일한 그룹으로 묶여 공유 지문을 한 번만 출력한다.
function setGroupIdForQuestion(question: BuilderQuestion): string | null {
  const setId = question.setId;
  return setId ? `set:${setId}` : null;
}

// 이 PaperItem 이 장문 세트 멤버인지(= sourceQuestion.setId 존재).
export function isSetMemberItem(item: PaperItem): boolean {
  return item.blockType === "question" && Boolean(item.sourceQuestion.setId);
}

// 커스텀 레이아웃(v2) 문항은 LayoutDoc.answerLineCount 가 서술형 답란 줄 수를
// 명시한다(원본 문항 양식 캡처값). 있으면 기본값 로직보다 우선한다.
function customLayoutAnswerSpaceLines(question: BuilderQuestion): number | null {
  const structuredData = parseJSON<Record<string, unknown>>(question.structuredData, {});
  if (structuredData?._typeId !== "CUSTOM_LAYOUT") return null;
  const layout = structuredData.layout;
  if (!layout || typeof layout !== "object") return null;
  const count = (layout as { answerLineCount?: unknown }).answerLineCount;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  return clampNumber(Math.round(count), 0, 12);
}

function paperBlockDefaults(): Pick<
  PaperItem,
  | "locked"
  | "blockTitle"
  | "blockText"
  | "blockAlign"
  | "blockFontSize"
  | "blockBold"
  | "blockItalic"
  | "blockFontPt"
  | "blockAccentColor"
  | "dividerStyle"
  | "dividerThickness"
  | "spacerHeight"
  | "imageDataUrl"
  | "imageAlt"
  | "imageWidth"
> {
  return {
    locked: false,
    blockTitle: "",
    blockText: "",
    blockAlign: "left",
    blockFontSize: "md",
    blockBold: false,
    blockItalic: false,
    blockFontPt: null,
    blockAccentColor: "#2563EB",
    dividerStyle: "solid",
    dividerThickness: 1,
    spacerHeight: 32,
    imageDataUrl: null,
    imageAlt: "",
    imageWidth: 70,
  };
}

export function makePaperItem(question: BuilderQuestion, orderNum: number, _existingItems: PaperItem[]): PaperItem {
  void _existingItems;
  const localId = makeLocalId(question.id);
  const customAnswerSpaceLines = customLayoutAnswerSpaceLines(question);
  // 일반 문항의 이관된 마커 유형은 표기(마커·라벨·보기순서)를 시험지 렌더 시점에 정본화.
  // 동형·미이관·도출실패는 null → 현 동작 유지(회귀 0). 생성/DB 무영향(여기서만 변환).
  const normalizedFields = normalizePaperFields(question, "normalized");
  const options =
    normalizedFields?.options ??
    (question.subType === "SENTENCE_INSERT"
      ? buildCanonicalSentenceInsertOptionsFrom(question.options)
      : parseOptions(question.options));
  const isSubjective = options.length === 0;
  const effectiveQuestion = normalizedFields
    ? { ...question, correctAnswer: normalizedFields.correctAnswer }
    : question;
  const normalizedQuestionText = normalizedFields
    ? normalizeQuestionText(normalizedFields.questionText)
    : normalizedQuestionTextForPaper(question);
  const passageContent = normalizePassageText(question.passage?.content || "");
  // 요약문 영작(SUMMARY_WRITING)·주제문 영작(TOPIC_SENTENCE_WRITING)은 원본 지문을 시험지에
  // "무조건 함께" 가져온다(사용자 요구·레퍼런스 형식). 학생은 지문을 읽고 요약문/주제문을 영작한다.
  // SUMMARY_COMPLETE 와 동일하게 INLINE_SOURCE 로 처리 — 지문은 structuredSegments() 가
  // 문제 안(요약문/주제문 위)에 박스로 인라인 렌더하고, 별도 출처 지문 블록은 억제된다.
  // 장문 세트 멤버는 공유 지문을 그룹 첫머리에서 "1회"만 출력한다.
  // 요약/주제문 영작의 단독 문항 지문 강제 포함 정책은 세트가 아닐 때만 적용한다.
  const includeSourcePassage = question.setId
    ? Boolean(passageContent)
    : isSummaryWritingSubtype(question.subType) ||
        question.subType === "TOPIC_SENTENCE_WRITING"
      ? true
      : shouldIncludeSourcePassageByDefault(question);
  const normalizedQuestion = {
    ...effectiveQuestion,
    questionText: normalizedQuestionText,
    passage: question.passage
      ? { ...question.passage, content: passageContent }
      : question.passage,
  };

  const item: PaperItem = {
    localId,
    questionId: question.id,
    sourceQuestion: normalizedQuestion,
    orderNum,
    points: question.points || 1,
    groupId: setGroupIdForQuestion(question) ?? `single:${localId}`,
    includePassage: includeSourcePassage,
    passageTitle: normalizeInlineText(question.passage?.title || ""),
    passageContent,
    questionText: normalizedQuestionText,
    options,
    correctAnswer: formatStoredQuestionCorrectAnswer(effectiveQuestion) || "",
    answerSpaceLines:
      customAnswerSpaceLines ??
      (isSubjective && question.subType !== "GRAMMAR_CORRECTION" ? 4 : 0),
    objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [],
    sectionTitle: "",
    teacherNote: "",
    breakBefore: "auto",
    // keepWithPrev 는 "앞 문항과 강제로 같은 칸에 붙이기"(사용자 수동 토글) 전용.
    // 출처 지문 포함 여부(includeSourcePassage)와 분리한다 — 기본값을 true 로 두면
    // 페이지네이션이 overflow 를 무시(headerForceStay)해 칸 경계에서 잘렸다.
    // 구조화 유형의 "한 덩어리 유지"는 subtype 기반 원자 배치 로직이 담당한다.
    keepWithPrev: false,
    blockType: "question",
    ...paperBlockDefaults(),
  };
  return item;
}

function questionWithPaperItemPassage(item: PaperItem): BuilderQuestion {
  const passageContent = normalizePassageText(
    item.passageContent || item.sourceQuestion.passage?.content || "",
  );
  const passageTitle = resolvePaperItemPassageTitle(item);
  return {
    ...item.sourceQuestion,
    passage: item.sourceQuestion.passage
      ? { ...item.sourceQuestion.passage, title: passageTitle, content: passageContent }
      : {
          id: `paper:${item.questionId}`,
          title: passageTitle,
          content: passageContent,
          grade: null,
          semester: null,
          publisher: null,
          school: null,
        },
  };
}

export function shouldRenderSourcePassageForItem(item: PaperItem): boolean {
  if (item.blockType !== "question") return false;
  // 장문 세트 멤버: 공유 지문을 그룹 첫머리에서 1회만 출력한다.
  if (isSetMemberItem(item)) {
    const passageContent = normalizePassageText(
      item.passageContent || item.sourceQuestion.passage?.content || "",
    );
    return Boolean(passageContent.trim());
  }
  // 요약문 영작은 INLINE_SOURCE(SUMMARY_COMPLETE 와 동일) — 지문은 structuredSegments() 가 문제
  // 안에 인라인으로 그리므로 여기(별도 출처 지문 블록)에서는 그리지 않는다(중복 방지).
  if (shouldRenderSourcePassageInsideQuestion(item.sourceQuestion.subType)) return false;
  const sourceQuestion = questionWithPaperItemPassage(item);
  return (
    Boolean(sourceQuestion.passage?.content?.trim()) &&
    (item.includePassage || shouldForceSourcePassage(sourceQuestion))
  );
}

export function isSourcePassageForcedForItem(item: PaperItem): boolean {
  if (item.blockType !== "question") return false;
  const sourceQuestion = questionWithPaperItemPassage(item);
  return shouldForceSourcePassage(sourceQuestion);
}

function makeSyntheticQuestion(localId: string, label: string): BuilderQuestion {
  return {
    id: localId,
    type: "CUSTOM_BLOCK",
    subType: null,
    questionText: label,
    structuredData: null,
    options: null,
    correctAnswer: "",
    points: 0,
    difficulty: "CUSTOM",
    tags: null,
    aiGenerated: false,
    approved: true,
    starred: false,
    createdAt: new Date().toISOString(),
    passage: null,
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

export function makeCustomPaperBlock(
  blockType: InsertablePaperBlockType,
  orderNum: number,
): PaperItem {
  const localId = makeLocalId(`block-${blockType}`);
  const labelByType: Record<InsertablePaperBlockType, string> = {
    text: "텍스트 블록",
    section: "새 섹션",
    divider: "구분선",
    spacer: "여백",
    image: "이미지",
  };
  const defaultTextByType: Record<InsertablePaperBlockType, string> = {
    text: "",
    section: "새 섹션",
    divider: "",
    spacer: "",
    image: "",
  };
  const sourceQuestion = makeSyntheticQuestion(localId, labelByType[blockType]);
  const defaults = paperBlockDefaults();

  return {
    localId,
    questionId: `custom:${localId}`,
    sourceQuestion,
    orderNum,
    points: 0,
    groupId: `block:${localId}`,
    includePassage: false,
    passageTitle: "",
    passageContent: "",
    questionText: defaultTextByType[blockType],
    options: [],
    correctAnswer: "",
    answerSpaceLines: 0,
    objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [],
    sectionTitle: blockType === "section" ? "새 섹션" : "",
    teacherNote: "",
    breakBefore: "auto",
    keepWithPrev: false,
    blockType,
    ...defaults,
    blockTitle: blockType === "section" ? "새 섹션" : "",
    blockText: defaultTextByType[blockType],
    blockFontSize: blockType === "section" ? "lg" : "md",
    // 섹션 제목은 기존처럼 기본 굵게(font-black). 텍스트는 일반체.
    blockBold: blockType === "section",
    spacerHeight: blockType === "spacer" ? 40 : defaults.spacerHeight,
    imageWidth: blockType === "image" ? 100 : defaults.imageWidth,
  };
}

export function clonePaperItem(item: PaperItem, orderNum: number): PaperItem {
  const localId = makeLocalId(item.blockType === "question" ? item.questionId : `block-${item.blockType}`);
  return {
    ...item,
    localId,
    orderNum,
    locked: false,
    // 세트("set:")·지문("passage:") 묶음 그룹은 복제해도 같은 그룹에 남도록 prefix 보존.
    // 그 외 솔로 문항/블록은 새 localId 기반 고유 그룹으로(기존 동작).
    groupId:
      item.blockType === "question" &&
      item.groupId &&
      (item.groupId.startsWith("passage:") || item.groupId.startsWith("set:"))
        ? item.groupId
        : `${item.blockType === "question" ? "single" : "block"}:${localId}`,
  };
}

export function reindexItems(items: PaperItem[]): PaperItem[] {
  let questionOrder = 0;
  return items.map((item) => ({
    ...item,
    orderNum: item.blockType === "question" ? (questionOrder += 1) : 0,
  }));
}

export function buildGroups(items: PaperItem[]): PaperGroup[] {
  const groups: PaperGroup[] = [];
  // 같은 지문 묶음(groupId)이 비문항 블록(워드프로세서식 빈 줄 등)으로 끊겨 여러 그룹으로
  // 쪼개지더라도 지문 박스는 한 번만 그리도록, 이미 지문을 그린 groupId 를 기억한다.
  // (안 그러면 지문이 중복 렌더되어 칸 높이가 부풀고 페이지 여백을 넘는다.)
  const passageRenderedGroupIds = new Set<string>();
  for (const item of items) {
    if (item.blockType !== "question") {
      groups.push({
        id: item.groupId || item.localId,
        items: [item],
        includePassage: false,
        passageTitle: "",
        passageContent: "",
      });
      continue;
    }

    const last = groups[groups.length - 1];
    if (last && item.groupId && last.id === item.groupId) {
      last.items.push(item);
      const passageContent = normalizePassageText(
        item.passageContent || item.sourceQuestion.passage?.content || "",
      );
      if (shouldRenderSourcePassageForItem(item) && passageContent) {
        // 제목은 폴백·정규화(빈칸 방지)하되, 지문 박스 표시는 이 묶음이
        // 아직 한 번도 안 그렸을 때만 켠다(중복 방지).
        last.passageTitle = resolvePaperItemPassageTitle(item);
        last.passageContent = formatSourcePassageForQuestionItems(
          passageContent,
          last.items,
        );
        if (!last.includePassage && !passageRenderedGroupIds.has(last.id)) {
          last.includePassage = true;
          passageRenderedGroupIds.add(last.id);
        }
      }
    } else {
      const passageContent = normalizePassageText(
        item.passageContent || item.sourceQuestion.passage?.content || "",
      );
      const groupId = item.groupId || item.localId;
      const wantsPassage =
        shouldRenderSourcePassageForItem(item) && Boolean(passageContent);
      // 같은 지문 묶음이 "비문항 블록"(워드프로세서식 빈 줄 등)으로 쪼개진 경우에만 지문
      // 중복 렌더를 막는다. 다른 문항(다른 지문)으로 갈라진 경우는 기존처럼 각자 지문을
      // 그리도록 둬 일반 시험지 생성 동작을 바꾸지 않는다(회귀 방지).
      const prevGroup = groups[groups.length - 1];
      const prevIsNonQuestionBlock =
        !!prevGroup && prevGroup.items[0]?.blockType !== "question";
      const renderPassage =
        wantsPassage &&
        !(prevIsNonQuestionBlock && passageRenderedGroupIds.has(groupId));
      if (wantsPassage) passageRenderedGroupIds.add(groupId);
      const groupItems = [item];
      groups.push({
        id: groupId,
        items: groupItems,
        includePassage: renderPassage,
        passageTitle: resolvePaperItemPassageTitle(item),
        passageContent: formatSourcePassageForQuestionItems(passageContent, groupItems),
      });
    }
  }
  return groups;
}

export function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type FormattedInlineOptions = {
  alphabetMarkerClassName?: string;
};

function alphabetMarkerClassNameForSubtype(
  subType: string | null | undefined,
  options?: FormattedInlineOptions,
) {
  if (options?.alphabetMarkerClassName) return options.alphabetMarkerClassName;
  return subType === "SENTENCE_ORDER" ? "font-bold text-black" : "font-bold text-blue-700";
}

function letterMarkerIndex(letter: string) {
  const index = letter.toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < 26 ? index : null;
}

function circledLetterMarkerIndex(marker: string) {
  const codePoint = marker.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x24D0 || codePoint > 0x24E9) {
    return null;
  }
  return codePoint - 0x24D0;
}

function inlineMarkerDisplay(
  marker: string,
  subType: string | null | undefined,
) {
  if (subType !== "IRRELEVANT") return marker;
  const markerIndex = circledLetterMarkerIndex(marker);
  return markerIndex === null ? marker : getCircledNumber(markerIndex);
}

function parenthesizedMarkerDisplay(
  letter: string,
  subType: string | null | undefined,
) {
  const markerIndex = letterMarkerIndex(letter);
  if (
    (subType === "IRRELEVANT" || subType === "SENTENCE_INSERT" || subType === "VOCAB_CHOICE") &&
    markerIndex !== null
  ) {
    return getCircledNumber(markerIndex);
  }
  return `(${letter.toUpperCase()})`;
}

export function renderFormattedInline(
  text: string,
  subType?: string | null,
  options?: FormattedInlineOptions,
) {
  const parts: React.ReactNode[] = [];
  // standalone \uAD04\uD638\uBB38\uC790 \uB9C8\uCEE4: (A)~(J) (\uAC10\uC2FC __(A)..__ \uACBD\uB85C\uC758 [a-jA-J] \uC640 \uB3D9\uC77C \uBC94\uC704\uB85C
  // \uB9DE\uCDA4 \u2014 6~10\uC9C0\uC120\uB2E4 \uBCF4\uAE30 \uCC38\uC870 (F)(G).. \uAC00 A~E\uB9CC \uD30C\uB791\uC774\uACE0 \uB098\uBA38\uC9C4 \uAC80\uC815\uC774\uB358 \uBB38\uC81C \uC218\uC815).
  const pattern = /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])|\(([a-jA-J])\)|(\[[^\]]+\])/g;
  const alphabetMarkerClassName = alphabetMarkerClassNameForSubtype(subType, options);
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      const circledMarkerMatch = match[1].match(/^([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])\s*(.+)$/);
      if (circledMarkerMatch) {
        parts.push(
          <span key={key++} data-mark="u" data-raw={`__${match[1]}__`}>
            <span className="font-bold text-blue-700">
              {inlineMarkerDisplay(circledMarkerMatch[1], subType)}
            </span>
            {" "}
            <span className="font-semibold underline decoration-blue-500 underline-offset-4">
              {circledMarkerMatch[2]}
            </span>
          </span>,
        );
        lastIndex = pattern.lastIndex;
        continue;
      }
      const markerMatch = match[1].match(/^\(([a-jA-J])\)\s*(.+)$/);
      if (markerMatch) {
        parts.push(
          <span key={key++} data-mark="u" data-raw={`__${match[1]}__`}>
            <span className="font-bold text-blue-700">
              {parenthesizedMarkerDisplay(markerMatch[1], subType)}
            </span>
            {" "}
            <span className="font-semibold underline decoration-blue-500 underline-offset-4">
              {markerMatch[2]}
            </span>
          </span>,
        );
      } else {
        parts.push(
          <span key={key++} data-mark="u" className="font-semibold underline decoration-blue-500 underline-offset-4">
            {match[1]}
          </span>,
        );
      }
    } else if (match[2]) {
      parts.push(
        <span key={key++} className="mx-0.5 font-bold text-blue-700">
          {inlineMarkerDisplay(match[2], subType)}
        </span>,
      );
    } else if (match[3]) {
      parts.push(
        // 스탠드얼론 괄호알파벳 마커도 원형숫자 마커(match[2])와 동일하게 좌우여백 통일.
        <span key={key++} className={`mx-0.5 ${alphabetMarkerClassName}`}>
          {parenthesizedMarkerDisplay(match[3], subType)}
        </span>,
      );
    } else if (match[4]) {
      // 네모 어법(GRAMMAR_CHOICE_COMBO) 후보 [좌 / 우]는 파랑으로(다른 어법 마커와 색 통일).
      // 그 외 유형의 [조건]/[요약문] 등 대괄호는 평문 유지.
      parts.push(
        subType === "GRAMMAR_CHOICE_COMBO" ? (
          <span key={key++} className="font-semibold text-blue-700">
            {match[4]}
          </span>
        ) : (
          <span key={key++}>{match[4]}</span>
        ),
      );
    } else {
      parts.push(
        <span
          key={key++}
          data-mark="blank"
          data-raw={match[0]}
          contentEditable={false}
          className="mx-1 inline-block min-w-[56px] border-b border-slate-500 align-baseline"
        >
          &nbsp;
        </span>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : text;
}

function normalizeSummaryCompletionQuestionText(
  text: string,
  subType: string | null | undefined,
) {
  // \uC694\uC57D\uBB38 \uC601\uC791(SUMMARY_WRITING): questionText \uC5D0\uB294 [\uD574\uC11D]/[\uC694\uC57D\uBB38]/[\uBCF4\uAE30]/[\uC55E\uAE00\uC790]\uB9CC
  // \uB4E4\uC5B4\uC788\uACE0 \uC815\uB2F5\uACC4\uC5F4([\uBE48\uCE78 \uC815\uB2F5]/modelAnswer \uB4F1)\uC740 \uC560\uCD08\uC5D0 \uC9C1\uB82C\uD654\uB418\uC9C0 \uC54A\uB294\uB2E4.
  // \uB530\uB77C\uC11C \uC815\uB2F5 \uC81C\uAC70\uAC00 \uBD88\uD544\uC694\uD558\uBA70, \uD559\uC0DD\uB178\uCD9C \uB9C8\uCEE4\uB97C \uADF8\uB300\uB85C \uBCF4\uC874\uD55C\uB2E4.
  if (subType === "SUMMARY_WRITING") return text;

  // 주제문 영작(TOPIC_SENTENCE_WRITING): questionText 에는 [주제 힌트]/[주제문]/[보기]/[배열 단어]만
  // 들어있고 정답계열(modelAnswer/blanks[].answer 등)은 애초에 직렬화되지 않는다.
  // 따라서 정답 제거가 불필요하며, 학생노출 마커를 그대로 보존한다(SUMMARY_WRITING 미러).
  if (subType === "TOPIC_SENTENCE_WRITING") return text;

  if (subType !== "SUMMARY_COMPLETE_MC") return text;

  return text
    .replace(/\n{0,2}\[(?:\uBE48\uCE78\s*\uC815\uB2F5|blank answers)\][\s\S]*$/i, "")
    .replace(/^\[(?:\uC694\uC57D\uBB38|summary)\]\s*/gim, "\u2193\n");
}

export function joinRenderedLinesForDisplay(lines: string[]) {
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      continue;
    }

    currentParagraph.push(trimmed);
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  // 전부 통짜: 단락을 빈 줄(\n\n)이 아닌 공백으로 이어 단일 흐름으로(유형 간 통일).
  return paragraphs.join(" ").replace(/[ \t]{2,}/g, " ").trim();
}

// 지문 단락을 단일 흐름(통짜)으로 — 임베드/박스 유형 간 "문단 분리 vs 통짜" 불일치 해소.
// 수능 지문 관례(단일 문단 흐름)에 맞춤. (given-block 분리 후 적용해 경계 탐색은 보존.)
function collapsePassageParagraphs(text: string): string {
  return text.replace(/\n{2,}/g, " ").replace(/[ \t]{2,}/g, " ");
}

export function renderQuestionTextInline(
  text: string,
  subType: string | null | undefined,
) {
  const normalizedText = normalizeSummaryCompletionQuestionText(text, subType);
  const { beforeText, givenText } = splitSentenceInsertGivenBlock(normalizedText, subType);
  if (!givenText) return renderFormattedInline(collapsePassageParagraphs(normalizedText), subType);

  // 실제 수능 포맷: '주어진 문장' 박스를 지문 '위'에 둔다(라벨은 한글).
  return (
    <>
      <span data-block="1" className="mb-1.5 block leading-[1.55]">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
          주어진 문장
        </span>
        {renderFormattedInline(givenText, subType)}
      </span>
      {beforeText && (
        <span data-block="1" className="block">{renderFormattedInline(collapsePassageParagraphs(beforeText), subType)}</span>
      )}
    </>
  );
}
