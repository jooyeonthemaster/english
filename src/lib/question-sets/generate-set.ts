// ============================================================================
// 지문 세트 — generation orchestrator (preset-driven, server)
// ============================================================================
// 흐름: 프리셋 해석 → 지문 로드 + 최소분량 게이트 → 구조멤버 우선 생성(있으면) →
// 비구조 멤버를 "표시 베이스"에 대해 병렬 생성(앵커가 학생이 보는 지문에 맞게
// 해소되도록) → 결정론적 누설 스캔 → 세트-인지 저장(트랜잭션 타임아웃 + 해설행).
// 멤버 생성은 기존 단일문항 엔진(runQuestionGenerationWithEmptyRetry)을 멤버당
// 1회 재사용 — LLM은 "N문항 조율"을 하지 않고, 격리는 코드로 사후 강제한다.
//
// 생성(buildQuestionSet, DB 무저장)과 저장(persistQuestionSet)을 분리해 하네스에서
// 생성 품질만 따로 검증할 수 있게 한다.
// ============================================================================

import { createHash } from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import {
  resolveEffectiveGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import {
  findExpressionInPassage,
  findExpressionInPassageStrict,
  findWordInPassage,
} from "@/lib/question-postprocess/text-utils";
import type { FoundPosition } from "@/lib/question-postprocess/types";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";

import { extractAnchors } from "./anchor-extraction";
import {
  scanSetForLeakage,
  type LeakageConflict,
  type LeakageReport,
  type MemberSpanSet,
  type ResolvedSpan,
} from "./leakage-gate";
import { prepareSetMember } from "./persistence";
import {
  QUESTION_SET_SAFETY_MAX_ATTEMPTS,
  passageMeetsPreset,
  resolvePreset,
  type SetDifficulty,
  type SetPreset,
} from "./presets";
import {
  type AnchorFindStrategy,
  isStructuralType,
  spanKindOf,
  type Anchor,
  type LayoutBlock,
  type LayoutDescriptor,
  type StructuralMode,
} from "./types";

type AnyRecord = Record<string, unknown>;

/**
 * 멤버별 오버라이드 — UI에서 프리셋 위에 얹는 멤버 단위 커스터마이즈(일반 생성의
 * 유형별 설정과 동일). 프리셋의 멤버 순서와 1:1 평행 배열. 유형(typeId)은 프리셋이
 * 고정(검증된 조합 보존)하고, 난이도·세부설정만 멤버별로 바꾼다.
 */
export interface SetMemberOverride {
  difficulty?: SetDifficulty;
  generationPlan?: QuestionGenerationPlan;
  typeSettings?: Record<string, unknown>;
}

export interface GenerateSetParams {
  academyId: string;
  staffId: string;
  jobId?: string;
  passageId: string;
  presetId: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
  /** 세트 전체 기본 난이도(멤버에 difficulty가 없을 때 사용). */
  difficulty?: SetDifficulty;
  /** 멤버별 오버라이드(프리셋 멤버 순서와 평행). */
  memberOverrides?: SetMemberOverride[];
}

export interface GenerateSetResult {
  setId: string;
  status: "OK" | "DEGRADED";
  conflicts: LeakageConflict[];
  degradedCount: number;
  /** 실제 세트 생성 시도 횟수. 1차 안전 장치는 최대 2회(초기 + 재생성 1회). */
  attemptCount: number;
  /** 최종 생성 전에 DEGRADED로 버린 시도들의 요약(운영 검수/과금 근거). */
  safetyRejectedAttempts: SetSafetyRejectedAttempt[];
  questionIds: string[];
}

interface GenContext {
  schoolType: string;
  gradeInfo: string;
  teacherIntentBlock: string;
  analysisContext: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
}

/** 생성·후처리까지 끝낸 한 멤버(저장 직전 형태). */
export interface PreparedSetMember {
  typeId: string;
  difficulty: SetDifficulty;
  isStructural: boolean;
  /** 후처리 완료된 원 질문 데이터(해설 추출 등에 사용). */
  data: AnyRecord;
  questionText: string;
  structuredData: AnyRecord;
  /** 렌더타임 재구성용 앵커(저장 시 QuestionSetItem.spans). */
  spans: Anchor[];
  correctAnswer: string;
  options: unknown;
}

export interface BuildSetResult {
  preset: SetPreset;
  canonicalPassage: string;
  displayedBase: string;
  layout: LayoutDescriptor;
  members: PreparedSetMember[];
  leakage: LeakageReport;
  degradedCount: number;
  status: "OK" | "DEGRADED";
  attemptCount: number;
  safetyRejectedAttempts: SetSafetyRejectedAttempt[];
}

export interface SetSafetyRejectedAttempt {
  attempt: number;
  degradedCount: number;
  conflicts: LeakageConflict[];
  anchorSummary: string[];
}

type BuildSetAttemptResult = Omit<
  BuildSetResult,
  "attemptCount" | "safetyRejectedAttempts"
>;

type SetMemberBuildConfig = {
  typeId: string;
  difficulty?: SetDifficulty;
  generationPlan: QuestionGenerationPlan;
  typeSettings?: Record<string, unknown>;
};

interface ReservedSetAnchor {
  memberIndex: number;
  typeId: string;
  anchor: Anchor;
  span: ResolvedSpan;
  sentence: string;
}

const GRAMMAR_PRIORITY_TYPES: ReadonlySet<string> = new Set([
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compactText(value: unknown, max = 90): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function summarizePreparedAnchors(members: PreparedSetMember[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    const anchors = member.spans ?? [];
    if (anchors.length === 0) continue;
    const parts = anchors.slice(0, 8).map((a) => {
      const label = a.label ? `${a.label} ` : "";
      const text = compactText(a.spanText, 50);
      const ctx = compactText(a.surroundingText, 70);
      return `${a.kind}:${label}"${text}"${ctx ? ` / ctx="${ctx}"` : ""}`;
    });
    lines.push(`#${i + 1} ${member.typeId}: ${parts.join("; ")}`);
  }
  return lines.slice(0, 12);
}

function buildSetSafetyRetryPrompt(args: {
  preset: SetPreset;
  rejected: SetSafetyRejectedAttempt;
}): string {
  const { preset, rejected } = args;
  const conflictLines = rejected.conflicts.length
    ? rejected.conflicts
        .slice(0, 8)
        .map(
          (c) =>
            `- member #${c.a + 1} and #${c.b + 1}: ${c.reason} (${c.kindPair.join(" + ")})`,
        )
        .join("\n")
    : "- No explicit overlap conflict. At least one member anchor could not be located unambiguously in the shared displayed passage.";
  const anchorLines = rejected.anchorSummary.length
    ? rejected.anchorSummary.map((line) => `- ${line}`).join("\n")
    : "- No reliable anchor summary was available.";

  return [
    "## Long-passage set safety retry",
    `Preset: ${preset.id} / ${preset.label}`,
    "The previous set attempt was rejected by deterministic set validation. Regenerate this member so the final shared-passage set is valid.",
    "",
    "Previous validation result:",
    conflictLines,
    "",
    "Previous marked/underlined/blank anchors:",
    anchorLines,
    "",
    "Mandatory rules for this retry:",
    "- If this member marks, underlines, blanks, or labels passage text, choose an answer locus that is different from the previous anchors.",
    "- Different set members must not mark or underline the same word, phrase, or overlapping character range.",
    "- Choose targets in different sentences from other marked/underlined/blank members; same-sentence MARKER/BLANK/UNDERLINE combinations are rejected.",
    "- For grammar/vocabulary marker questions, do not choose expressions that contain or touch a reference-pronoun underline.",
    "- For vocabulary/meaning pairs, choose different lexical items; never reuse the same surface expression for both members.",
    "- For structural questions, every marker or omitted/given sentence must be copied from the displayed passage exactly enough for deterministic reconstruction.",
    "- Every anchor field such as targetWord, underlinedWord, underlinedPronoun, originalExpression, markedExpressions[].expression, and surroundingText must be verbatim source-backed and unambiguous in the passage.",
    "- If the first natural target would violate these rules, choose a different valid target rather than forcing the same location.",
  ].join("\n");
}

function appendSetSafetyPrompt(
  customPrompt: string | undefined,
  safetyPrompt: string,
): string {
  const base = customPrompt?.trim();
  return base ? `${base}\n\n${safetyPrompt}` : safetyPrompt;
}

function isGrammarPriorityType(typeId: string): boolean {
  return GRAMMAR_PRIORITY_TYPES.has(typeId);
}

function shouldReceiveReservedAnchorPrompt(typeId: string): boolean {
  const kind = spanKindOf(typeId);
  return kind === "BLANK" || kind === "MARKER" || kind === "UNDERLINE";
}

function sentenceAroundRange(base: string, start: number, end: number): string {
  const leftPunctuation = Math.max(
    base.lastIndexOf(".", start - 1),
    base.lastIndexOf("?", start - 1),
    base.lastIndexOf("!", start - 1),
    base.lastIndexOf("\n", start - 1),
  );
  const rightCandidates = [".", "?", "!", "\n"]
    .map((ch) => base.indexOf(ch, Math.max(end, start)))
    .filter((idx) => idx >= 0);
  const sentenceStart = leftPunctuation >= 0 ? leftPunctuation + 1 : 0;
  const sentenceEnd =
    rightCandidates.length > 0 ? Math.min(...rightCandidates) + 1 : base.length;
  return compactText(base.slice(sentenceStart, sentenceEnd), 160);
}

function buildReservedAnchorPrompt(reserved: ReservedSetAnchor[]): string {
  if (reserved.length === 0) return "";
  const lines = reserved.slice(0, 12).map((item) => {
    const label = item.anchor.label ? `${item.anchor.label} ` : "";
    const source = compactText(item.anchor.spanText, 70);
    const display =
      item.anchor.passageForm && item.anchor.passageForm !== item.anchor.spanText
        ? ` / displayed="${compactText(item.anchor.passageForm, 70)}"`
        : "";
    const ctx = item.anchor.surroundingText
      ? ` / ctx="${compactText(item.anchor.surroundingText, 90)}"`
      : "";
    const sentence = item.sentence ? ` / sentence="${item.sentence}"` : "";
    return `- member #${item.memberIndex + 1} ${item.typeId}: ${item.anchor.kind}:${label}"${source}"${display}${ctx}${sentence}`;
  });

  return [
    "## Long-passage set reserved grammar loci",
    "A grammar member in this same set has already selected the following source-backed passage locus. Preserve that priority.",
    "",
    "Reserved loci:",
    ...lines,
    "",
    "Mandatory rules for this member:",
    "- Do not underline, blank, mark, label, or otherwise choose any reserved expression.",
    "- Do not choose a target in the same sentence as any reserved grammar locus.",
    "- If this member is a REFERENCE/underlined-word/vocabulary/blank item, choose a different sentence-level evidence locus. For REFERENCE, the underlined pronoun itself must be in a sentence with no reserved grammar marker.",
    "- Do not create an answer whose decisive clue is the grammar mutation or the same surface phrase selected above.",
    "- If the most natural target would touch a reserved locus, choose another valid source-backed target instead.",
  ].join("\n");
}

function collectResolvedReservations(args: {
  displayedBase: string;
  memberIndex: number;
  typeId: string;
  anchors: Anchor[];
}): ReservedSetAnchor[] {
  const { displayedBase, memberIndex, typeId, anchors } = args;
  const out: ReservedSetAnchor[] = [];
  for (const anchor of anchors) {
    const resolved = resolveAnchorStrict(displayedBase, anchor);
    if (!resolved.pos || resolved.ambiguous) continue;
    const span: ResolvedSpan = {
      start: resolved.pos.index,
      end: resolved.pos.index + resolved.pos.length,
      kind: anchor.kind,
      label: anchor.label,
    };
    out.push({
      memberIndex,
      typeId,
      anchor,
      span,
      sentence: sentenceAroundRange(displayedBase, span.start, span.end),
    });
  }
  return out;
}

function isSingleToken(s: string): boolean {
  return /^[A-Za-z][A-Za-z'-]*$/.test(s.trim());
}

function defaultFindStrategy(kind: Anchor["kind"]): AnchorFindStrategy {
  if (kind === "MARKER") return "word";
  if (kind === "UNDERLINE") return "word";
  return "expression";
}

function hasTokenBoundaries(text: string, index: number, length: number): boolean {
  const before = index > 0 ? text[index - 1] : "";
  const after = index + length < text.length ? text[index + length] : "";
  return !/[A-Za-z0-9'-]/.test(before) && !/[A-Za-z0-9'-]/.test(after);
}

function countMatchesInScope(
  passage: string,
  expression: string,
  surroundingText: string | undefined,
  requireWordBoundary: boolean,
): number {
  const needle = expression.trim();
  if (!needle) return 0;
  let scopeText = passage;
  if (surroundingText && surroundingText.trim().length > 0) {
    const ctx = findExpressionInPassage(passage, surroundingText);
    if (ctx) {
      const start = Math.max(0, ctx.index - 50);
      const end = Math.min(passage.length, ctx.index + ctx.length + 50);
      scopeText = passage.slice(start, end);
    }
  }

  const hay = scopeText.toLowerCase();
  const low = needle.toLowerCase();
  let count = 0;
  let idx = hay.indexOf(low);
  while (idx !== -1) {
    if (!requireWordBoundary || hasTokenBoundaries(scopeText, idx, needle.length)) {
      count += 1;
    }
    idx = hay.indexOf(low, idx + 1);
  }
  return count;
}

function locateAnchorWithStrategy(
  base: string,
  anchor: Anchor,
  text: string,
): FoundPosition | null {
  const surrounding = anchor.surroundingText;
  const strategy = anchor.findStrategy ?? defaultFindStrategy(anchor.kind);
  switch (strategy) {
    case "word":
      return findWordInPassage(base, text, surrounding);
    case "wordStrict":
      return findWordInPassage(base, text, surrounding, true);
    case "wordOrExpression":
      return (
        findWordInPassage(base, text, surrounding) ||
        findExpressionInPassage(base, text, surrounding)
      );
    case "grammar":
      return isSingleToken(text)
        ? findWordInPassage(base, text, surrounding)
        : findExpressionInPassage(base, text, surrounding);
    case "expression":
    default:
      return findExpressionInPassage(base, text, surrounding);
  }
}

function resolveAnchorStrict(
  base: string,
  anchor: Anchor,
): { pos: FoundPosition | null; ambiguous: boolean } {
  const texts = [anchor.spanText, anchor.fallbackText].filter(
    (text): text is string => typeof text === "string" && text.trim().length > 0,
  );
  for (const text of texts) {
    const pos = locateAnchorWithStrategy(base, anchor, text);
    if (!pos) continue;
    if (anchor.surroundingText?.trim()) {
      return { pos, ambiguous: false };
    }
    const strategy = anchor.findStrategy ?? defaultFindStrategy(anchor.kind);
    const strict =
      strategy === "expression"
        ? findExpressionInPassageStrict(base, text, anchor.surroundingText)
        : {
            pos,
            count: countMatchesInScope(
              base,
              text,
              anchor.surroundingText,
              true,
            ),
            ambiguous: false,
          };
    return {
      pos,
      ambiguous:
        strict.ambiguous ||
        (strict.count !== undefined && strict.count !== 1 && anchor.occurrenceIndex == null),
    };
  }
  return { pos: null, ambiguous: true };
}

/** 한 멤버를 `passageContent` 에 대해 생성 — 기본 엔진을 멤버당 1회 재사용. */
async function generateOne(
  passageContent: string,
  subType: string,
  difficulty: string,
  generationPlan: QuestionGenerationPlan,
  typeSettings: unknown,
  ctx: GenContext,
): Promise<AnyRecord | null> {
  const diffLabel = difficulty || "INTERMEDIATE";
  const result = await runQuestionGenerationWithEmptyRetry(
    {
      plan: [{ subType, count: 1, reason: "지문 세트 member", targetPoints: [] }],
      schoolType: ctx.schoolType,
      gradeInfo: ctx.gradeInfo,
      passageContent,
      teacherIntentBlock: ctx.teacherIntentBlock,
      analysisContext: ctx.analysisContext,
      diffLabel,
      diffInstruction: DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE,
      generationPlan,
      customPrompt: ctx.customPrompt,
      typeSettings: typeSettings
        ? ({ [subType]: typeSettings } as Record<string, unknown>)
        : undefined,
    },
    { logPrefix: "SET-GEN" },
  );
  return (result.questions[0] as AnyRecord | undefined) ?? null;
}

/** 구조 멤버로부터 표시 베이스 지문 + 레이아웃 디스크립터를 만든다. */
function buildStructuralLayout(
  mode: StructuralMode,
  structural: AnyRecord | null,
  canonicalPassage: string,
): { displayedBase: string; layout: LayoutDescriptor } {
  if (mode === "SENTENCE_ORDER" && structural) {
    const givenSentence =
      typeof structural.givenSentence === "string" ? structural.givenSentence : "";
    const paragraphs = Array.isArray(structural.paragraphs)
      ? (structural.paragraphs as AnyRecord[])
      : [];
    const blocks: LayoutBlock[] = paragraphs.map((p, i) => ({
      label: typeof p.label === "string" ? p.label : `(${String.fromCharCode(65 + i)})`,
      text: typeof p.text === "string" ? p.text : "",
      canonicalIndex: i,
      displayOrder: i,
    }));
    const lines: string[] = [];
    if (givenSentence) lines.push(givenSentence);
    for (const b of blocks) lines.push(`${b.label} ${b.text}`.trim());
    const displayedBase = lines.join("\n\n");
    const correctOrder = Array.isArray(structural.correctOrder)
      ? (structural.correctOrder as number[])
      : undefined;
    const layoutNoHash = {
      type: mode,
      givenSentence: givenSentence || undefined,
      blocks,
      correctOrder,
      fullPassage: displayedBase,
    };
    return {
      displayedBase,
      layout: { ...layoutNoHash, fingerprintHash: sha256(JSON.stringify(layoutNoHash)) },
    };
  }

  if (mode === "SENTENCE_INSERT" && structural) {
    const displayedBase =
      (typeof structural.passageWithMarkers === "string" && structural.passageWithMarkers) ||
      (typeof structural.passageWithNumbers === "string" && structural.passageWithNumbers) ||
      canonicalPassage;
    const givenSentence =
      typeof structural.givenSentence === "string" ? structural.givenSentence : undefined;
    const layoutNoHash = { type: mode, givenSentence, fullPassage: displayedBase };
    return {
      displayedBase,
      layout: { ...layoutNoHash, fingerprintHash: sha256(JSON.stringify(layoutNoHash)) },
    };
  }

  // NONE — plain shared passage.
  const layoutNoHash = { type: "NONE" as const, fullPassage: canonicalPassage };
  return {
    displayedBase: canonicalPassage,
    layout: { ...layoutNoHash, fingerprintHash: sha256(JSON.stringify(layoutNoHash)) },
  };
}

/** 앵커를 표시 베이스의 문자 범위로 해소; 모호/누락은 degraded 로 분리. */
function resolveSpans(
  base: string,
  anchors: Anchor[],
): { spans: ResolvedSpan[]; degraded: Anchor[] } {
  const spans: ResolvedSpan[] = [];
  const degraded: Anchor[] = [];
  for (const a of anchors) {
    const r = resolveAnchorStrict(base, a);
    if (r.pos && !r.ambiguous) {
      spans.push({
        start: r.pos.index,
        end: r.pos.index + r.pos.length,
        kind: a.kind,
        label: a.label,
      });
    } else {
      degraded.push(a);
    }
  }
  return { spans, degraded };
}

async function buildQuestionSetOnce(opts: {
  preset: SetPreset;
  passageContent: string;
  ctx: GenContext;
  baseDifficulty: SetDifficulty;
  memberOverrides?: SetMemberOverride[];
}): Promise<BuildSetAttemptResult> {
  const { preset, passageContent, ctx, baseDifficulty, memberOverrides } = opts;
  const canonicalPassage = passageContent;
  // 유효 멤버 = 프리셋(유형·순서 고정) + 멤버별 오버라이드(난이도·세부설정). 일반 생성의
  // 유형별 설정과 동일한 커스터마이즈를 멤버 단위로 받는다.
  const members: SetMemberBuildConfig[] = preset.members.map((m, i) => {
    const ov = memberOverrides?.[i];
    const memberDifficulty = ov?.difficulty ?? m.difficulty;
    return {
      typeId: m.typeId,
      difficulty: memberDifficulty,
      // 26-08-18 난이도 기반 티어: 멤버 플랜은 멤버 난이도(없으면 세트 기본)가
      // 결정한다 — 프리셋·오버라이드의 generationPlan 은 무시(question-set 라우트
      // 과금과 동일 규칙, resolveEffectiveGenerationPlan 단일 소스).
      generationPlan: resolveEffectiveGenerationPlan(
        ov?.generationPlan ?? m.generationPlan ?? ctx.generationPlan,
        memberDifficulty ?? baseDifficulty,
      ),
      typeSettings:
        m.typeSettings || ov?.typeSettings
          ? { ...(m.typeSettings ?? {}), ...(ov?.typeSettings ?? {}) }
          : undefined,
    };
  });
  const structuralIndex = members.findIndex((m) => isStructuralType(m.typeId));

  // 1) 구조 멤버 우선 — 표시 베이스를 정의한다.
  const generated: (AnyRecord | null)[] = new Array(members.length).fill(null);
  let displayedBase = canonicalPassage;
  let layout: LayoutDescriptor;

  if (structuralIndex >= 0) {
    const sm = members[structuralIndex];
    const structuralQ = await generateOne(
      canonicalPassage,
      sm.typeId,
      sm.difficulty ?? baseDifficulty,
      sm.generationPlan,
      sm.typeSettings,
      ctx,
    );
    generated[structuralIndex] = structuralQ;
    const built = buildStructuralLayout(preset.structuralMode, structuralQ, canonicalPassage);
    displayedBase = built.displayedBase;
    layout = built.layout;
  } else {
    layout = buildStructuralLayout("NONE", null, canonicalPassage).layout;
  }

  // 2) 비구조 멤버를 표시 베이스에 대해 병렬 생성.
  const reservedGrammarAnchors: ReservedSetAnchor[] = [];
  const nonStructuralIndices = members
    .map((_, i) => i)
    .filter((i) => i !== structuralIndex);
  const grammarPriorityIndices = nonStructuralIndices.filter((i) =>
    isGrammarPriorityType(members[i].typeId),
  );

  for (const i of grammarPriorityIndices) {
    const m = members[i];
    const reservedPrompt = buildReservedAnchorPrompt(reservedGrammarAnchors);
    const memberCtx = reservedPrompt
      ? { ...ctx, customPrompt: appendSetSafetyPrompt(ctx.customPrompt, reservedPrompt) }
      : ctx;
    const data = await generateOne(
      displayedBase,
      m.typeId,
      m.difficulty ?? baseDifficulty,
      m.generationPlan,
      m.typeSettings,
      memberCtx,
    );
    generated[i] = data;
    if (data) {
      reservedGrammarAnchors.push(
        ...collectResolvedReservations({
          displayedBase,
          memberIndex: i,
          typeId: m.typeId,
          anchors: extractAnchors(m.typeId, data),
        }),
      );
    }
  }

  const reservedPrompt = buildReservedAnchorPrompt(reservedGrammarAnchors);
  await Promise.all(
    nonStructuralIndices
      .filter((i) => !grammarPriorityIndices.includes(i))
      .map(async (i) => {
        const m = members[i];
        const memberCtx =
          reservedPrompt && shouldReceiveReservedAnchorPrompt(m.typeId)
            ? {
                ...ctx,
                customPrompt: appendSetSafetyPrompt(ctx.customPrompt, reservedPrompt),
              }
            : ctx;
        generated[i] = await generateOne(
          displayedBase,
          m.typeId,
          m.difficulty ?? baseDifficulty,
          m.generationPlan,
          m.typeSettings,
          memberCtx,
        );
      }),
  );

  // 3) 멤버별: 앵커 추출 → 표시 베이스에 해소 → 저장 준비.
  const memberSpanSets: MemberSpanSet[] = [];
  const prepared: PreparedSetMember[] = [];
  let degradedCount = 0;

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const data = generated[i];
    if (!data) {
      degradedCount += 1;
      continue;
    }
    const structural = i === structuralIndex;
    const member = prepareSetMember(m.typeId, data, structural);

    const anchors = structural ? [] : extractAnchors(m.typeId, data);
    const { spans, degraded } = structural
      ? {
          spans: [
            { start: 0, end: displayedBase.length, kind: "BLOCK" } as ResolvedSpan,
          ],
          degraded: [] as Anchor[],
        }
      : resolveSpans(displayedBase, anchors);
    degradedCount += degraded.length;

    memberSpanSets.push({ index: i, typeId: m.typeId, isStructural: structural, spans });
    prepared.push({
      typeId: m.typeId,
      difficulty: m.difficulty ?? baseDifficulty,
      isStructural: structural,
      data,
      questionText: member.questionText,
      structuredData: member.structuredData,
      spans: member.spans,
      correctAnswer:
        typeof data.correctAnswer === "string"
          ? data.correctAnswer
          : typeof data.modelAnswer === "string"
            ? data.modelAnswer
            : "",
      options: Array.isArray(data.options) ? data.options : undefined,
    });
  }

  // 4) 결정론적 누설 스캔(검증된 정밀부품 재사용).
  const leakage = scanSetForLeakage(memberSpanSets, displayedBase);
  const status: "OK" | "DEGRADED" =
    leakage.status === "CONFLICT" || degradedCount > 0 ? "DEGRADED" : "OK";

  return {
    preset,
    canonicalPassage,
    displayedBase,
    layout,
    members: prepared,
    leakage,
    degradedCount,
    status,
  };
}

/**
 * 생성 + 격리만 수행하고 DB 에는 쓰지 않는다(하네스 검증용). 지문 내용·컨텍스트를
 * 직접 받으므로 DB 없이 호출 가능. 저장은 persistQuestionSet 이 담당.
 *
 * 1차 세트 안전 장치: 첫 생성 결과가 DEGRADED면 충돌/앵커 요약을 프롬프트에
 * 주입해 한 번 더 생성한다. 최종 OK가 되면 두 번째 결과만 저장하고, 여전히
 * DEGRADED면 기존처럼 수동 검수 대상으로 저장한다.
 */
export async function buildQuestionSet(opts: {
  preset: SetPreset;
  passageContent: string;
  ctx: GenContext;
  baseDifficulty: SetDifficulty;
  memberOverrides?: SetMemberOverride[];
}): Promise<BuildSetResult> {
  const rejectedAttempts: SetSafetyRejectedAttempt[] = [];
  let ctx = opts.ctx;

  for (let attempt = 1; attempt <= QUESTION_SET_SAFETY_MAX_ATTEMPTS; attempt += 1) {
    const built = await buildQuestionSetOnce({ ...opts, ctx });
    if (built.status === "OK" || attempt === QUESTION_SET_SAFETY_MAX_ATTEMPTS) {
      return {
        ...built,
        attemptCount: attempt,
        safetyRejectedAttempts: rejectedAttempts,
      };
    }

    const rejected: SetSafetyRejectedAttempt = {
      attempt,
      degradedCount: built.degradedCount,
      conflicts: built.leakage.conflicts,
      anchorSummary: summarizePreparedAnchors(built.members),
    };
    rejectedAttempts.push(rejected);
    ctx = {
      ...ctx,
      customPrompt: appendSetSafetyPrompt(
        opts.ctx.customPrompt,
        buildSetSafetyRetryPrompt({ preset: opts.preset, rejected }),
      ),
    };
  }

  throw new Error("세트 생성 안전 재시도 상태가 올바르지 않습니다.");
}

/** 멤버 데이터에서 표준 저장 경로와 동일한 해설 nested-create 입력을 만든다. */
function buildExplanationCreate(
  data: AnyRecord,
): Prisma.QuestionExplanationCreateWithoutQuestionInput | undefined {
  const explanation = data.explanation;
  if (typeof explanation !== "string" || !explanation.trim()) return undefined;
  const keyPoints = data.keyPoints;
  const wrongOptionExplanations = data.wrongOptionExplanations;
  return {
    content: explanation,
    keyPoints:
      keyPoints === undefined || keyPoints === null
        ? null
        : typeof keyPoints === "string"
          ? keyPoints
          : JSON.stringify(keyPoints),
    wrongOptionExplanations:
      wrongOptionExplanations === undefined || wrongOptionExplanations === null
        ? null
        : typeof wrongOptionExplanations === "string"
          ? wrongOptionExplanations
          : JSON.stringify(wrongOptionExplanations),
    aiGenerated: true,
  };
}

/**
 * 세트 + 멤버 Question + QuestionSetItem 을 한 트랜잭션에 저장. 표준 저장 경로와
 * 동일하게 (1) 해설행을 nested create, (2) 트랜잭션 타임아웃을 명시(기본 5초 롤백
 * 버그 회피). 비구조 멤버의 baked 지문은 prepareSetMember 가 이미 strip 했다.
 */
async function persistQuestionSet(opts: {
  academyId: string;
  passageId: string;
  jobId?: string;
  built: BuildSetResult;
}): Promise<{ setId: string; questionIds: string[] }> {
  const { academyId, passageId, jobId, built } = opts;
  const questionIds: string[] = [];

  const set = await prisma.$transaction(
    async (tx) => {
      const createdSet = await tx.questionSet.create({
        data: {
          jobId: jobId ?? null,
          academyId,
          structuralMode: built.preset.structuralMode,
          canonicalPassage: built.canonicalPassage,
          displayedPassageLayout: JSON.stringify(built.layout),
          layoutFingerprint: built.layout.fingerprintHash,
          itemCount: built.members.length,
          setLabel: built.preset.label,
          basePassageId: passageId,
          status: built.status,
        },
      });

      for (let order = 0; order < built.members.length; order++) {
        const m = built.members[order];
        const explanationCreate = buildExplanationCreate(m.data);
        const question = await tx.question.create({
          data: {
            academyId,
            passageId,
            type: Array.isArray(m.options) ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
            subType: m.typeId,
            questionText: m.questionText,
            structuredData: m.structuredData as unknown as Prisma.InputJsonValue,
            options: Array.isArray(m.options) ? JSON.stringify(m.options) : null,
            correctAnswer: m.correctAnswer,
            points: 1,
            difficulty: m.difficulty,
            aiGenerated: true,
            approved: false,
            // inSet=true: 일반 목록에서는 숨기고, 전용 '지문 세트' 섹션에서만 묶어 보여준다.
            inSet: true,
            setId: createdSet.id,
            ...(explanationCreate ? { explanation: { create: explanationCreate } } : {}),
          },
        });
        questionIds.push(question.id);
        await tx.questionSetItem.create({
          data: {
            setId: createdSet.id,
            questionId: question.id,
            orderInSet: order,
            isStructural: m.isStructural,
            spans: m.spans as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return createdSet;
    },
    { maxWait: 10_000, timeout: QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS },
  );

  return { setId: set.id, questionIds };
}

/**
 * 프리셋 기반 지문 세트 생성 오케스트레이터. 합성 에러(프리셋 불명/지문 미달)에는
 * throw(호출자가 한국어 메시지 노출), 앵커 모호/누설 잔존은 DEGRADED 상태로 저장
 * (조용히 출하하지 않고 수동 검수 대상).
 */
export async function generateQuestionSet(
  params: GenerateSetParams,
): Promise<GenerateSetResult> {
  const preset = resolvePreset(params.presetId);
  if (!preset) {
    throw new Error("알 수 없는 세트 프리셋입니다.");
  }

  const passage = await prisma.passage.findFirst({
    where: { id: params.passageId, academyId: params.academyId },
    include: {
      school: { select: { type: true, name: true } },
      analysis: { select: { analysisData: true } },
      notes: { orderBy: { order: "asc" } },
    },
  });
  if (!passage) throw new Error("지문을 찾을 수 없습니다.");

  // 최소 분량 게이트(버그② 수정): 세트 경로에 길이 사전검증이 없던 결함을 메운다.
  const feasibility = passageMeetsPreset(passage.content, preset);
  if (!feasibility.ok) {
    throw new Error(feasibility.reason ?? "지문 분량이 이 세트에 부족합니다.");
  }

  const ctx: GenContext = {
    schoolType: passage.school?.type === "MIDDLE" ? "중학교" : "고등학교",
    gradeInfo: passage.grade ? `${passage.grade}학년` : "",
    teacherIntentBlock: buildQuestionAnnotationBlock(extractTeacherAnnotations(passage)),
    analysisContext: buildAnalysisContext(passage),
    generationPlan: params.generationPlan,
    customPrompt: params.customPrompt,
  };

  const built = await buildQuestionSet({
    preset,
    passageContent: passage.content,
    ctx,
    baseDifficulty: params.difficulty ?? "INTERMEDIATE",
    memberOverrides: params.memberOverrides,
  });

  if (built.members.length === 0) {
    throw new Error("세트 문항을 한 개도 생성하지 못했습니다.");
  }

  const { setId, questionIds } = await persistQuestionSet({
    academyId: params.academyId,
    passageId: params.passageId,
    jobId: params.jobId,
    built,
  });

  return {
    setId,
    status: built.status,
    conflicts: built.leakage.conflicts,
    degradedCount: built.degradedCount,
    attemptCount: built.attemptCount,
    safetyRejectedAttempts: built.safetyRejectedAttempts,
    questionIds,
  };
}
