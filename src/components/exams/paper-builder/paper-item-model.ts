// ============================================================================
// paper-item-model — 시험지 문항(PaperItem) 생성·판정의 JSX 없는 정본 (26-09-30 CORE-MODEL).
// paper-item-utils.tsx 에서 동작 보존으로 옮겼다. 웹(빌더·재오픈·상세·인쇄)과 서버(HWPX·DOCX)가
// 같은 함수를 import 한다 — 서버에 .tsx 를 끌어오지 않으려고 복제하던 관행(break-plan 등)을 끝낸다.
// 그룹화(buildGroups)는 paper-item-groups.ts, 저장본 → PaperItem 은 saved-paper-items.ts.
// ============================================================================
import type {
  BuilderQuestion,
  InsertablePaperBlockType,
  OptionItem,
  PaperItem,
} from "./types";
import {
  defaultIncludePassage,
  resolvePrintablePassage,
  shouldForceSourcePassage,
  shouldRenderSourcePassageInsideQuestion,
  type PassageSetKind,
} from "./passage-policy";
import { isGichulSetMemberData } from "./question-body-layout";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "./text-normalization";
import { buildCanonicalSentenceInsertOptionsFrom } from "@/lib/sentence-insert-options";
import { buildGrammarCorrectionQuestionTextForDisplay } from "@/lib/grammar-correction-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { normalizePaperFields } from "./render-model";
import { buildQuestionSetMergedPassage } from "@/lib/question-sets/render";
import { isKoQuestionType } from "@/lib/korean/registry";
import { koSetGroupId } from "@/lib/korean/sets/paper";

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

// structuredData(객체 또는 JSON 문자열)를 객체로 읽는다 — 그룹 병합(paper-item-groups)과 공유.
export function readStructuredObject(value: unknown): Record<string, unknown> {
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

function mergedSetPassageForQuestion(question: BuilderQuestion): string | null {
  if (!question.setId || !question.setRender) return null;
  return normalizePassageText(buildQuestionSetMergedPassage(question.setRender));
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
  // 지문 원천(EXAM-PAPER-MODEL §3, 저장 스냅숏이 없는 경로): DB 지문 → structuredData._sourcePassage(지문 삭제 가드의 보관본).
  // 저장본 경로(saved-paper-items.resolveExamQuestion)와 같은 함수 — 빌더에 새로 담은 보관본 문항도 저장·재오픈 전부터
  // 지문이 찍힌다(MPUI-3). DB 지문이 있으면 종전과 같다.
  const printable = resolvePrintablePassage({ question });
  const rawPassageContent = normalizePassageText(printable.content);
  const basePassageContent = isKoSetMember
    ? printable.content
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
  // 규칙 정본: passage-policy.defaultIncludePassage(기출·영어 세트 = 지문 있음, KO 세트 = false,
  // 요약문·주제문 영작 = true, 그 밖 = shouldIncludeSourcePassageByDefault). 판정은 이 문항이 실제로
  // 찍을 지문(passageContent — 세트 병합·각주 포함)으로 한다.
  const includeSourcePassage = defaultIncludePassage(
    { ...question, passage: { content: passageContent } },
    passageSetKindFor(question),
  );
  // 보관본만 있으면(DB 지문 행 없음) 저장본 경로와 같은 모양의 지문(id detached:<원 지문 id>)을 만든다.
  const passage: BuilderQuestion["passage"] = question.passage
    ? { ...question.passage, content: passageContent }
    : printable.origin === "detached"
      ? {
          id: printable.detachedPassageId ? `detached:${printable.detachedPassageId}` : `saved:${question.id}`,
          title: printable.title,
          content: passageContent,
          grade: null,
          semester: null,
          publisher: null,
          school: null,
        }
      : question.passage;
  const normalizedQuestion = {
    ...effectiveQuestion,
    questionText: normalizedQuestionText,
    passage,
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
    passageTitle: normalizeInlineText(printable.title),
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

export function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 세트 소속 판정(인쇄 규칙 분기용) — makePaperItem 과 저장본 경로가 같은 순서로 판정한다.
 * 기출 장문(structuredData._gichul.set.key) → "gichul", setId + KO 유형 → "ko", setId → "english".
 */
export function passageSetKindFor(question: {
  setId?: string | null;
  subType: string | null;
  structuredData?: unknown;
}): PassageSetKind {
  if (isGichulSetMemberData(question.structuredData)) return "gichul";
  if (!question.setId) return null;
  return isKoQuestionType(question.subType) ? "ko" : "english";
}
