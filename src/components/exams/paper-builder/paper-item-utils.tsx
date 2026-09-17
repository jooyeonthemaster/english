import * as React from "react";
import type {
  BuilderQuestion,
  BuilderQuestionSetRender,
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
import { isGichulSetMemberData } from "./question-body-layout";
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
import { buildQuestionSetMergedPassage } from "@/lib/question-sets/render";
import { reconstructPassageView } from "@/lib/question-sets/reconstruct";
import type { Anchor } from "@/lib/question-sets/types";
import { isKoQuestionType } from "@/lib/korean/registry";
import {
  buildKoSetDirective,
  buildKoSetSharedPassage,
  isKoSetGroupId,
  koSetGroupId,
} from "@/lib/korean/sets/paper";

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

// 이 PaperItem 이 장문 세트 멤버인지(= sourceQuestion.setId 존재).
export function isSetMemberItem(item: PaperItem): boolean {
  return item.blockType === "question" && Boolean(item.sourceQuestion.setId);
}

// ── 영어(비-KO) 장문 세트: 공유 지문 1박스 병합 렌더 (codex 방식) ──────────────
// 세트 멤버는 지문을 저장하지 않고 span anchors(_spans)/setRender 만 갖는다. 그룹
// 선두에 병합 지문 1박스(밑줄 __…__ + 빈칸 ___)를 그리고 '[1~2] 다음 글을 읽고,
// 물음에 답하시오.' 안내를 붙인다. KO 세트는 이 경로가 아니라 applyKoSetSharedPassages
// (buildKoSetSharedPassage/koSetDirective)로 처리한다 — 아래 헬퍼들은 KO 그룹에도
// 중간값을 채우지만 applyKoSetSharedPassages 가 그 값을 덮어써 KO 동작은 불변이다.
function readStructuredObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function spansFromStructuredData(value: unknown): Anchor[] {
  const spans = readStructuredObject(value)._spans;
  return Array.isArray(spans) ? (spans as Anchor[]) : [];
}

function mergedSetPassageForQuestion(question: BuilderQuestion): string | null {
  if (!question.setId || !question.setRender) return null;
  return normalizePassageText(buildQuestionSetMergedPassage(question.setRender));
}

function setRenderFromItems(items: PaperItem[]): BuilderQuestionSetRender | null {
  for (const item of items) {
    const render = item.sourceQuestion.setRender;
    if (render) return render;
  }
  return null;
}

function normalizedSourcePassageForItem(item: PaperItem): string {
  return normalizePassageText(item.sourceQuestion.passage?.content || "");
}

function currentPassageDiffersFromSource(items: PaperItem[]): boolean {
  return items.some((item) => {
    const current = normalizePassageText(item.passageContent || "");
    const source = normalizedSourcePassageForItem(item);
    return Boolean(current) && current !== source;
  });
}

function mergedSetPassageForItems(
  passageContent: string,
  items: PaperItem[],
): string | null {
  if (!items.some(isSetMemberItem)) return null;
  if (currentPassageDiffersFromSource(items)) return passageContent;

  const setRender = setRenderFromItems(items);
  if (setRender) {
    const merged = buildQuestionSetMergedPassage(setRender);
    const footnotes = [...new Set(items.flatMap((item) => {
      const meta = readStructuredObject(readStructuredObject(item.sourceQuestion.structuredData)._gichul);
      return Array.isArray(meta.footnotes)
        ? meta.footnotes.filter((line): line is string => typeof line === "string" && Boolean(line.trim()) && !merged.includes(line))
        : [];
    }))];
    return normalizePassageText(merged + (footnotes.length ? `\n${footnotes.join("  ")}` : ""));
  }

  const base = normalizePassageText(
    passageContent || items.map(normalizedSourcePassageForItem).find(Boolean) || "",
  );
  const spans = items.flatMap((item) =>
    spansFromStructuredData(item.sourceQuestion.structuredData),
  );
  if (!base || spans.length === 0) return base || null;
  return normalizePassageText(reconstructPassageView(base, spans).text || base);
}

function formatPassageContentForGroup(
  passageContent: string,
  items: PaperItem[],
): string {
  return (
    mergedSetPassageForItems(passageContent, items) ??
    formatSourcePassageForQuestionItems(passageContent, items)
  );
}

function setPromptForItems(items: PaperItem[]): string {
  if (!items.some(isSetMemberItem)) return "";
  const orderNums = items
    .filter((item) => item.blockType === "question" && item.orderNum > 0)
    .map((item) => item.orderNum);
  if (orderNums.length === 0) return "";
  const first = Math.min(...orderNums);
  const last = Math.max(...orderNums);
  const range = first === last ? `[${first}]` : `[${first}~${last}]`;
  return `${range} 다음 글을 읽고, 물음에 답하시오.`;
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
  // 국어(KO) 세트 멤버: 병합-마커 공유지문 모델(로컬) — 영어 세트의 codex 병합지문
  // (span anchors)/setRender 경로를 타지 않는다. groupId `set:<setId>` 로 묶고,
  // 멤버 문항은 지문 미동봉(includePassage=false → koStructuredSegments 가 지문 박스
  // 억제, 발문+보기+선지만). 공유지문 1박스는 applyKoSetSharedPassages 가 그룹 선두에 그린다.
  const isKoSetMember = Boolean(question.setId) && isKoQuestionType(question.subType);
  // 일반 문항의 이관된 마커 유형은 표기(마커·라벨·보기순서)를 시험지 렌더 시점에 정본화.
  // 동형·미이관·도출실패는 null → 현 동작 유지(회귀 0). 생성/DB 무영향(여기서만 변환).
  // 영어 세트 멤버는 지문/마커를 공유 지문 1박스(codex 병합 경로)로만 그리므로 enrich·자기완결
  // 주입을 타지 않는다 — 멤버 본문은 발문+보기만, 지문은 그룹 선두 박스가 담당한다.
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
  // KO 세트 멤버의 지문은 공유지문 1박스(applyKoSetSharedPassages)가 소비한다 — 단락 접힘
  // (normalizePassageText)을 우회해 원문 개행(운문 행 구분)을 보존한다. 마커 병합
  // (buildKoMarkedPassage)이 같은 normalizeKo 폼에서 동작하므로 정규화도 그쪽에 위임.
  // 영어 세트 멤버는 codex 병합지문: setRender 있으면 병합 지문, 없으면 원지문(정규화) —
  // buildGroups 의 mergedSetPassageForItems 가 span anchors 로 최종 병합한다.
  const rawPassageContent = normalizePassageText(question.passage?.content || "");
  const basePassageContent = isKoSetMember
    ? question.passage?.content || ""
    : mergedSetPassageForQuestion(question) ?? rawPassageContent;
  // 기출 문항 은행 반입분(structuredData._gichul.footnotes): 출처형·요약문은 각주가 questionText 밖에 있어
  // 지문 박스 아래 별도 줄로 인쇄돼야 한다 — 지문 내용 꼬리에 각주 블록을 붙인다(normalizePassageText 가 각주 블록을
  // 별도 줄로 유지). 이미 questionText 안에 각주가 구워진 내장형은 건너뛴다. AI 생성 문항은 _gichul 이 없어 불변.
  const gichulFootnotes = readStructuredObject(question.structuredData)._gichul as { footnotes?: unknown } | undefined;
  const footnoteLines = Array.isArray(gichulFootnotes?.footnotes)
    ? (gichulFootnotes!.footnotes as unknown[]).filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];
  const footnoteTail =
    footnoteLines.length > 0 && basePassageContent && !question.questionText.includes(footnoteLines[0])
      ? `\n\n${footnoteLines.join("  ")}`
      : "";
  const passageContent = basePassageContent + footnoteTail;
  // 요약문 영작(SUMMARY_WRITING)·주제문 영작(TOPIC_SENTENCE_WRITING)은 원본 지문을 시험지에
  // "무조건 함께" 가져온다(사용자 요구·레퍼런스 형식). 학생은 지문을 읽고 요약문/주제문을 영작한다.
  // SUMMARY_COMPLETE 와 동일하게 INLINE_SOURCE 로 처리 — 지문은 structuredSegments() 가
  // 문제 안(요약문/주제문 위)에 박스로 인라인 렌더하고, 별도 출처 지문 블록은 억제된다.
  // KO 세트 멤버는 지문 미동봉(공유지문 1박스 경로) — includePassage=false 가
  // koStructuredSegments 의 suppressPassage 로 전달돼 멤버 안 지문 박스를 억제한다.
  // 영어 세트 멤버는 공유 지문을 그룹 첫머리에서 "1회"만 출력한다(codex). 요약/주제문 영작의
  // 단독 문항 지문 강제 포함 정책은 세트가 아닐 때만 적용한다.
  // 기출 장문은 공통 지문을 기본 표시한다. 소문항 내 중복 지문은 structuredSegments의
  // 장문 분기가 억제하고, includePassage 토글은 묶음 전체의 공통 지문에 적용한다.
  const isGichulSetMember = isGichulSetMemberData(question.structuredData);
  const includeSourcePassage = isGichulSetMember
    ? Boolean(passageContent)
    : isKoSetMember
    ? false
    : question.setId
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
    // KO·영어 세트 멤버 모두 `set:<setId>` 로 묶어 공유지문 1박스를 그룹 선두에 그린다
    // (영어=codex 병합지문, KO=applyKoSetSharedPassages). 비세트 문항은 솔로("single:<localId>").
    groupId: question.setId ? koSetGroupId(question.setId) : `single:${localId}`,
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
  // 영어 세트 멤버는 자기완결 주입(materializeSetMember)을 타지 않는다 — 지문은 공유
  // 지문 1박스(buildGroups 의 mergedSetPassageForItems)가 그룹 선두에 병합해 그린다.
  // KO 세트 멤버는 applyKoSetSharedPassages 가 공유지문 1박스를 채운다.
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
  // 장문 세트 멤버(영어·KO 공통): 공유 지문을 그룹 첫머리에서 1회만 출력한다. 지문 콘텐츠가
  // 있으면 무조건 그린다(KO 는 이후 applyKoSetSharedPassages 가 공유지문으로 덮어쓴다).
  if (isSetMemberItem(item)) {
    const passageContent = normalizePassageText(
      item.passageContent || item.sourceQuestion.passage?.content || "",
    );
    return Boolean(passageContent.trim()) && (!isGichulSetMemberData(item.sourceQuestion.structuredData) || item.includePassage);
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
  if (isGichulSetMemberData(item.sourceQuestion.structuredData)) return false;
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
        setPrompt: "",
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
        last.passageContent = formatPassageContentForGroup(
          passageContent,
          last.items,
        );
        last.setPrompt = setPromptForItems(last.items);
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
        passageContent: formatPassageContentForGroup(passageContent, groupItems),
        setPrompt: setPromptForItems(groupItems),
      });
    }
  }
  applyKoSetSharedPassages(groups);
  return groups;
}

// KO 세트 그룹(`set:<setId>`) 선두에 공유지문 1박스를 채운다: 전 멤버 markers 를
// buildKoMarkedPassage 로 병합 오버레이한 지문 + 세트 지시문 "[n~m] 다음 글을 읽고
// 물음에 답하시오."(번호는 그룹 내 문항 번호에서 파생). 멤버 문항은 makePaperItem 이
// includePassage=false 로 만들어 지문 미동봉(발문+보기+선지만)이다.
// 영어 세트도 `set:` 프리픽스를 쓰지만(codex 병합지문 경로), 멤버가 KO 유형이 아니라
// isKoQuestionType every-검사에서 걸러져 이 함수에 절대 잡히지 않는다 — 영어 세트는
// buildGroups 의 mergedSetPassageForItems/setPromptForItems 병합 결과를 그대로 유지한다.
// KO 세트는 지시문을 passageContent 에 접합하므로 codex setPromptForItems 가 채운
// setPrompt(쉼표 변형)를 여기서 비워 지시문 이중 노출을 막는다.
function applyKoSetSharedPassages(groups: PaperGroup[]) {
  const renderedSetIds = new Set<string>();
  for (const group of groups) {
    if (!isKoSetGroupId(group.id)) continue;
    const questionItems = group.items.filter((it) => it.blockType === "question");
    if (
      questionItems.length === 0 ||
      !questionItems.every((it) => isKoQuestionType(it.sourceQuestion.subType))
    ) {
      continue;
    }
    // 같은 세트가 비문항 블록으로 쪼개져 그룹이 여러 개면 지문 박스는 첫 그룹만.
    if (renderedSetIds.has(group.id)) {
      group.includePassage = false;
      group.setPrompt = "";
      continue;
    }
    const passage =
      questionItems[0].passageContent ||
      questionItems[0].sourceQuestion.passage?.content ||
      "";
    if (!passage.trim()) continue;
    renderedSetIds.add(group.id);
    const shared = buildKoSetSharedPassage(
      passage,
      questionItems.map((it) => it.sourceQuestion.structuredData),
    );
    const directive = buildKoSetDirective(questionItems.map((it) => it.orderNum));
    group.passageTitle = resolvePaperItemPassageTitle(questionItems[0]);
    group.passageContent = `${directive}\n${shared}`;
    group.includePassage = true;
    group.setPrompt = "";
  }
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
  // 원문 대소문자 보존 — 강제 대문자화는 **장문 세트(§12)의 (a)~(e) 를 (A)~(E) 로 바꿔** 인쇄본과
  // 어긋나게 한다(26-09-08 감독 육안: 2026 수능 41-42 공유 지문이 「(A) inevitable」로 렌더). 기존
  // 대문자 데이터((A)~(J) 어법·보기 참조)는 그대로 대문자로 나오므로 무회귀 — 소문자 라벨은
  // VOCAB_CHOICE(원문자 분기) 와 세트 멤버뿐이고, 후자는 소문자가 정본이다.
  return `(${letter})`;
}

/**
 * 원문자 마커(①·`__② word__`·`__(a) word__`)와 바로 뒤 단어 사이의 공백. 일반 공백이면 줄 끝에서
 * 「② / helps」 처럼 마커와 단어가 갈라진다(기출 문항 은행 조판 실측, 어법·어휘·무관·삽입 전 문항 확률 재발).
 * nbsp 로 묶어 한 줄에 두되 단어 자체는 그대로 개행 가능하게 둔다(래퍼 nowrap 금지 — 문장 길이 밑줄이
 * 칸을 넘친다). 텍스트 길이는 그대로라 페이지네이션 줄 수 추정(pagination-metrics wrapParagraph 의
 * 마커+다음 단어 묶음 판정)과 동기. 편집 직렬화(editable-text serializeEditableDom → normalizeEditableText)가
 * \u00A0 를 공백으로 되돌리므로 저장 텍스트엔 새지 않는다.
 */
const MARKER_WORD_JOINER = "\u00A0";

export function renderFormattedInline(
  text: string,
  subType?: string | null,
  options?: FormattedInlineOptions,
) {
  const parts: React.ReactNode[] = [];
  // standalone \uAD04\uD638\uBB38\uC790 \uB9C8\uCEE4: (A)~(J) (\uAC10\uC2FC __(A)..__ \uACBD\uB85C\uC758 [a-jA-J] \uC640 \uB3D9\uC77C \uBC94\uC704\uB85C
  // \uB9DE\uCDA4 \u2014 6~10\uC9C0\uC120\uB2E4 \uBCF4\uAE30 \uCC38\uC870 (F)(G).. \uAC00 A~E\uB9CC \uD30C\uB791\uC774\uACE0 \uB098\uBA38\uC9C4 \uAC80\uC815\uC774\uB358 \uBB38\uC81C \uC218\uC815).
  // \u3260-\u326D: \uD55C\uAE00 \uC6D0\uBB38\uC790 \u3260~\u326D(KO \uB9C8\uD0B9\uC9C0\uBB38 \uB77C\uBCA8) \u2014 \uCE74\uB4DC \uB80C\uB354\uB7EC(KO_INLINE_RE)\uC640
  // \uB3D9\uC77C\uD558\uAC8C \uD30C\uB780 \uBCFC\uB4DC \uAC15\uC870. [EN-REG-5] \uB2E8, KO \uAC8C\uC774\uD2B8\uB85C 2\uBC8C \uBD84\uAE30: \uC601\uC5B4 \uC720\uD615
  // (subType \uBA85\uC2DC)\uC758 \uD55C\uAD6D\uC5B4 \uD14D\uC2A4\uD2B8([\uC870\uAC74] '\u3260 \u2026' \uC5F4\uAC70 \uB4F1)\uC5D0\uC11C \u3260 \uC774 \uD30C\uB780 \uB9C8\uCEE4\uB85C
  // \uBC14\uB00C\uC9C0 \uC54A\uAC8C KO_* \uC720\uD615\uC5D0\uC11C\uB9CC \uD655\uC7A5 \uD328\uD134\uC744 \uC4F4\uB2E4. subType \uC774 \uC5C6\uB294 \uD638\uCD9C(KO \uC138\uD2B8
  // \uACF5\uC720\uC9C0\uBB38 \uBC15\uC2A4 \uB4F1 \uADF8\uB8F9 \uC9C0\uBB38 fragment)\uC740 \uD655\uC7A5 \uD328\uD134 \uC720\uC9C0 \u2014 KO \uBCD1\uD569\uB9C8\uCEE4\uAC00 \uAE68\uC9C0\uC9C0
  // \uC54A\uACE0, \uC601\uC5B4 \uC9C0\uBB38 \uBCF8\uBB38\uC5D0\uB294 \u3260 \uC774 \uB4F1\uC7A5\uD558\uC9C0 \uC54A\uC544 \uBB34\uD68C\uADC0.
  const koMarkerEligible = subType == null || subType.startsWith("KO_");
  const pattern = koMarkerEligible
    ? /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9\u3260-\u326D])|\(([a-jA-J])\)|(\[[^\]]+\])/g
    : /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])|\(([a-jA-J])\)|(\[[^\]]+\])/g;
  const alphabetMarkerClassName = alphabetMarkerClassNameForSubtype(subType, options);
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  // 직전 조각이 단독 원문자 마커(match[2] — 삽입 위치 ①·무관 「① __문장__」)였으면 다음 평문 조각의
  // 머리 공백 1개를 nbsp 로 바꿔 마커와 다음 단어를 한 줄에 묶는다. 다른 조각이 끼면 해제.
  let joinAfterMarker = false;
  const pushPlain = (slice: string) => {
    const glued =
      joinAfterMarker && slice.startsWith(" ") ? MARKER_WORD_JOINER + slice.slice(1) : slice;
    joinAfterMarker = false;
    parts.push(<span key={key++}>{glued}</span>);
  };

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushPlain(text.slice(lastIndex, match.index));
    }
    joinAfterMarker = false;
    if (match[1]) {
      const circledMarkerMatch = match[1].match(
        koMarkerEligible
          ? /^([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9\u3260-\u326D])\s*(.+)$/
          : /^([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])\s*(.+)$/,
      );
      if (circledMarkerMatch) {
        parts.push(
          <span key={key++} data-mark="u" data-raw={`__${match[1]}__`}>
            <span className="font-bold text-blue-700">
              {inlineMarkerDisplay(circledMarkerMatch[1], subType)}
            </span>
            {MARKER_WORD_JOINER}
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
            {MARKER_WORD_JOINER}
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
      joinAfterMarker = true;
    } else if (match[3]) {
      // 평문 소문자 라벨 "(a)~(e)" 는 마커가 아니라 **글자 그대로**다(§12.1-2). 장문 세트의 발문
      //   「밑줄 친 (a)~(e) 중에서 …」·선지 「① (a) ② (b) …」·공유 지문이 전부 여기 해당한다.
      // 호출부 옵션이 아니라 전역 규칙인 이유: 발문·선지·지문이 서로 다른 렌더 지점 6곳에서 그려져
      //   옵션을 하나만 빠뜨려도 같은 문항 안에서 (a) 와 (A) 가 섞인다(26-09-08 감독 육안: 44번 발문만
      //   「(A) ~ (E)」 파란 볼드). 실측 무회귀 — 은행 3,076+1,119 중 평문 소문자 라벨은 REFERENCE 490 ·
      //   VOCAB_CHOICE 110 이고 전부 세트 멤버다(대문자 (A)~(J) 보기 참조는 아래 기존 경로 유지).
      if (/^[a-j]$/.test(match[3])) {
        parts.push(<span key={key++}>{`(${match[3]})`}</span>);
        lastIndex = pattern.lastIndex;
        continue;
      }
      // 「(A)」 라벨 바로 뒤에 빈칸선(___)이 오면 한 덩어리(nowrap)로 — 줄 끝에서 라벨만 남고 빈칸이 다음 줄로
      // 떨어지던 것(요약문·(A)(B) 빈칸, 전수 렌더 검수 실측 22건) 방지. 빈칸 조각을 여기서 함께 소비한다.
      const blankAhead = text.slice(pattern.lastIndex).match(/^\s*(_{3,})/);
      if (blankAhead) {
        parts.push(
          <span key={key++} className="whitespace-nowrap">
            <span className={`mx-0.5 ${alphabetMarkerClassName}`}>{parenthesizedMarkerDisplay(match[3], subType)}</span>
            <span
              data-mark="blank"
              data-raw={blankAhead[1]}
              contentEditable={false}
              className="mx-1 inline-block min-w-[4.5em] border-b border-slate-500 align-baseline"
            >
              &nbsp;
            </span>
          </span>,
        );
        pattern.lastIndex += blankAhead[0].length;
        lastIndex = pattern.lastIndex;
        continue;
      }
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
          // 빈칸 최소폭은 활자 상대(4.5em) — 고정 56px 는 좁은 단·축소 표면에서 쪼갤 수 없는
          // 원자 토큰이 되어 justify 단어 간격 팽창의 증폭기였다(26-08-26 전수조사 WS-1).
          className="mx-1 inline-block min-w-[4.5em] border-b border-slate-500 align-baseline"
        >
          &nbsp;
        </span>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) pushPlain(text.slice(lastIndex));
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

// 리스트/라벨/불릿으로 시작하는 줄(하드 개행 유지 대상): [조건]/[영작할 우리말] 같은 라벨,
// "1." "2)" 번호 항목, (A)~(E) 라벨, 원형숫자, 불릿. 이런 줄은 앞줄과 공백으로 이으면
// 뭉개지므로 줄바꿈을 유지한다.
const HARD_BREAK_LINE_RE =
  /^(\[[^\]]+\]|\(?[A-Ea-e]\)|[①-⑳㉑-㉟㊱-㊿]|\d+[.)]|[-*•]\s+)/;

export function joinRenderedLinesForDisplay(
  lines: string[],
  opts?: {
    keepListBreaks?: boolean;
    /**
     * lines[i] 가 원문(\n 경계) 행의 첫 랩행인지(StructRow.isSourceLineStart, lines 와
     * 같은 인덱스). 전달되면 리스트/라벨 판정(HARD_BREAK_LINE_RE)을 원문 행 머리에만
     * 적용한다 — 긴 프로즈가 래핑되다 우연히 "(A)"/"3.5" 등으로 시작하게 된 이어짐
     * 행이 문장 중간 강제 개행으로 오탐되는 것을 구조적으로 차단(래핑 오탐 0).
     */
    sourceLineStarts?: ReadonlyArray<boolean | undefined>;
  },
) {
  // keepListBreaks: 프로즈는 공백으로 잇되, 리스트/라벨 줄과 문단 경계(빈 줄)는 개행을
  // 유지한다([조건] 번호 목록이 한 줄로 뭉개지던 렌더 버그 수정). 부모가 whitespace-pre-line
  // 이라 \n 이 실제 줄바꿈으로 그려진다. 지문(passage)은 기존 "통짜 단일 흐름"을 유지한다.
  if (opts?.keepListBreaks) {
    let result = "";
    let prevBlank = false;
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        prevBlank = true;
        continue;
      }
      // 플래그가 명시적으로 false(래핑 이어짐 행)면 리스트 판정 자체를 건너뛰고
      // 무조건 공백 연결. undefined(플래그 미전달 레거시 경로)는 종전 휴리스틱 유지.
      const atSourceLineStart = opts.sourceLineStarts
        ? opts.sourceLineStarts[i] !== false
        : true;
      if (result === "") {
        result = trimmed;
      } else if (prevBlank) {
        result += `\n\n${trimmed}`;
      } else if (
        (atSourceLineStart && HARD_BREAK_LINE_RE.test(trimmed)) ||
        // 각주 줄("* word: 뜻")은 원문 행 판정과 무관하게 항상 별도 줄(지문 박스 각주 인쇄 관행)
        PASSAGE_FOOTNOTE_PARAGRAPH_RE.test(trimmed)
      ) {
        result += `\n${trimmed}`;
      } else {
        result += ` ${trimmed}`;
      }
      prevBlank = false;
    }
    return result.replace(/[ \t]{2,}/g, " ").trim();
  }

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

    // 각주 줄("* word: 뜻")은 빈 줄이 없어도 새 단락으로 — 아래 reduce 가 `\n` 으로 이어 별도 줄에 인쇄한다
    // (지문 박스는 normalizePassageText 가 각주를 `\n` 하나로 붙이므로 빈 줄 경계가 없다).
    if (PASSAGE_FOOTNOTE_PARAGRAPH_RE.test(trimmed) && currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(" "));
      currentParagraph = [];
    }
    currentParagraph.push(trimmed);
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  // 전부 통짜: 단락을 빈 줄(\n\n)이 아닌 공백으로 이어 단일 흐름으로(유형 간 통일).
  // 예외 — 각주 단락("* word: 뜻")은 별도 줄(칸/쪽 경계에서 쪼개진 본문 조각도 통짜 경로와 같은 모양이어야 한다).
  return paragraphs
    .reduce((acc, p) => (acc === "" ? p : acc + (PASSAGE_FOOTNOTE_PARAGRAPH_RE.test(p) ? "\n" : " ") + p), "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// 지문 단락을 단일 흐름(통짜)으로 — 임베드/박스 유형 간 "문단 분리 vs 통짜" 불일치 해소.
// 수능 지문 관례(단일 문단 흐름)에 맞춤. (given-block 분리 후 적용해 경계 탐색은 보존.)
function collapsePassageParagraphs(text: string): string {
  // 각주 블록("* consensus: 합의 ** aesthetic: 미학의")만은 인쇄 관행대로 본문 아래 별도 줄에 둔다
  // (부모가 whitespace-pre-line). 공급원은 기출 문항 은행 본문뿐이라 AI 생성 문항 렌더는 그대로다.
  return text
    .replace(/\n{2,}(?=[*＊]\s*[A-Za-z])/g, "\n")
    .replace(/\n{2,}/g, " ")
    .replace(/[ \t]{2,}/g, " ");
}

/** 지문 각주 블록 머리(paper-builder/text-normalization 의 규칙과 동일) */
const PASSAGE_FOOTNOTE_PARAGRAPH_RE = /^[*＊]\s*[A-Za-z]/;

/**
 * 칸/쪽 경계에서 쪼개진 본문 조각의 밑줄 마커(`__…__`) 짝 맞추기.
 * 무관한 문장(① __문장__)처럼 밑줄이 문장 길이라 경계를 넘어가면, 조각 안의 `__` 개수가 홀수가 되어
 * renderFormattedInline 의 `__([^_]+)__` 가 잡지 못하고 원시 `__` 가 그대로 찍힌다(기출 문항 은행 조판 실측).
 * 시작 조각이면 끝에, 이어짐 조각이면 앞에 `__` 를 보충한다. 빈칸(`___` 이상)은 세지 않는다.
 * 조각 전체가 한 밑줄 안에 들어가 마커가 0개인 경우(짝수)는 판별 불가라 그대로 둔다.
 */
export function balanceUnderlineMarkersForFragment(text: string, startsAtBeginning: boolean): string {
  // 정확히 두 글자짜리 밑줄 런만 센다(빈칸 `___` 이상 제외). lookbehind 정규식은 Safari ≤16.3 에서 모듈 평가 시
  // SyntaxError 로 조판기 전체를 죽이므로(검수 실측) 런 길이 스캔으로 쓴다.
  const pairs = (text.match(/_+/g) || []).filter((run) => run.length === 2).length;
  if (pairs % 2 === 0) return text;
  return startsAtBeginning ? `${text}__` : `__${text}`;
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
