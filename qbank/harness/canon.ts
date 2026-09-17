// ============================================================================
// 정본 2종(BLANK_INFERENCE · GRAMMAR_ERROR) 오프라인 어댑터.
//
// 이 둘은 lane-registry 에 등록되지 않고 md-stream 라우트가 직접 처리한다.
// 여기서는 그 분기를 **호출 순서·인자까지 그대로** 이식해 MdLane 인터페이스로 감싼다.
// 원본: src/app/api/workbench/ai-jobs/question-generation/md-stream/route.ts
//   parseAndGate() :347-400   / 설정 읽기 :446-475   / adapt :1055-1081   / 프롬프트 :736-757
//
// ⚠ 정본 파서는 decoration.ts 를 import 하지 않는다 → 장식(**정답:**)을 쓰면 필드가 증발한다.
//    (정찰 확정, spec/recon/00-contract.md §8)
// ============================================================================

import {
  autoSnapBlankExpression,
  autoSnapGrammarMarks,
  autoSnapMultiBlankExpressions,
  gateMdMultiBlank,
  gateMdQuestion,
  parseMdBlank,
  parseMdGrammar,
  parseMdMultiBlank,
  type MdAnyQuestion,
} from "../../src/lib/md-qgen/parser";
import {
  adaptMdBlankToAiQuestion,
  adaptMdMultiBlankToAiQuestion,
  adaptMdGrammarToAiQuestion,
} from "../../src/lib/md-qgen/adapter";
import {
  buildMdBlankPrompt,
  buildMdMultiBlankPrompt,
  buildMdGrammarPrompt,
  type MdDifficulty,
} from "../../src/lib/md-qgen/prompts";
import type { MdLane, MdLaneContext, MdLaneParsed, MdLaneAdaptResult } from "../../src/lib/md-qgen/lane-types";

export const CANON_SUBTYPES = ["BLANK_INFERENCE", "GRAMMAR_ERROR"] as const;
export type CanonSubType = (typeof CANON_SUBTYPES)[number];

export function isCanon(subType: string): subType is CanonSubType {
  return (CANON_SUBTYPES as readonly string[]).includes(subType);
}

/** 라우트 :446-475 와 동일한 설정 읽기. */
function readCounts(resolved: Record<string, unknown>) {
  return {
    blankCount: (resolved.blankInferenceBlankCount as number | null | undefined) ?? 1,
    markerCount: (resolved.grammarMarkerCount as number | null | undefined) ?? 5,
    answerCount: (resolved.grammarAnswerCount as number | null | undefined) ?? 1,
    blankParaphrase: Boolean(resolved.blankInferenceParaphraseAnswer),
    blankDoubleNegative: Boolean(resolved.blankInferenceDoubleNegative),
  };
}

function blankAnswerMode(c: ReturnType<typeof readCounts>): "PARAPHRASE" | "SOURCE_EXACT" | "DOUBLE_NEGATIVE" {
  if (c.blankDoubleNegative) return "DOUBLE_NEGATIVE";
  return c.blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT";
}

/** 정답 표적 추출 — 레인의 diversityTargets 대응물. 유닛 내 정답 중복 판정에 쓴다. */
function canonDiversityTargets(subType: string, structuredData: Record<string, unknown>): string[] {
  if (subType === "GRAMMAR_ERROR") {
    // 어법의 표적 = 정답 라벨이 아니라 "무엇을 고쳤는가"(고침 문자열). 라벨은 셔플로 바뀐다.
    const marks = structuredData.grammarMarks ?? structuredData.marks;
    const fixes = structuredData.fixes;
    if (fixes && typeof fixes === "object") return Object.values(fixes as Record<string, string>).map(String);
    if (typeof structuredData.correctFix === "string") return [structuredData.correctFix];
    if (Array.isArray(marks)) {
      return (marks as Record<string, unknown>[])
        .filter((m) => m && m.isAnswer)
        .map((m) => String(m.original ?? m.shown ?? ""));
    }
    return [];
  }
  // 빈칸의 표적 = 정답 선지 텍스트(원문 표현이 아니라 학생이 고르는 값).
  const opts = structuredData.options;
  const answer = structuredData.correctAnswer;
  if (Array.isArray(opts) && answer != null) {
    const hit = (opts as Record<string, unknown>[]).find((o) => String(o.label) === String(answer));
    if (hit) return [String(hit.text ?? "")];
  }
  return [];
}

/**
 * 정본 유형을 MdLane 인터페이스로 감싼다.
 * qgen-core 는 레인형/정본을 구분하지 않고 이걸 그대로 쓴다.
 */
export function getCanonLane(subType: string): MdLane | null {
  if (!isCanon(subType)) return null;

  return {
    subType,
    operationType: "QUESTION_GEN_SINGLE",
    retryEligible: true,

    isEligible(resolved: Record<string, unknown>): boolean {
      const c = readCounts(resolved);
      if (subType === "BLANK_INFERENCE") return c.blankCount >= 1 && c.blankCount <= 3;
      return c.markerCount >= 5 && c.markerCount <= 10 && c.answerCount >= 1 && c.answerCount <= c.markerCount;
    },

    buildBasePrompt(ctx: MdLaneContext): string {
      const c = readCounts(ctx.resolved);
      const diff = ctx.difficulty as MdDifficulty;
      if (subType === "BLANK_INFERENCE") {
        if (c.blankCount >= 2) {
          return buildMdMultiBlankPrompt(
            ctx.passage,
            "full",
            diff,
            c.blankCount === 3 ? 3 : 2,
            c.blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT",
          );
        }
        return buildMdBlankPrompt(ctx.passage, "full", diff);
      }
      return buildMdGrammarPrompt(ctx.passage, "full", diff, {
        markerCount: c.markerCount,
        answerCount: c.answerCount,
      });
    },

    buildExtras(): string[] {
      // 설정 모드 블록(빈칸 단위·DN·포인트 집중 등)은 라우트가 조립한다.
      // qbank 는 프로덕션 프롬프트를 저작에 쓰지 않으므로(craft doctrine 사용) 비워 둔다.
      return [];
    },

    parseAndGate(text: string, ctx: MdLaneContext): MdLaneParsed {
      const c = readCounts(ctx.resolved);
      if (subType === "BLANK_INFERENCE") {
        if (c.blankCount >= 2) {
          const snapped = autoSnapMultiBlankExpressions(parseMdMultiBlank(text), ctx.passage);
          return {
            question: snapped.question,
            gateIssues: gateMdMultiBlank(snapped.question, ctx.passage, { blankCount: c.blankCount }),
            corrections: snapped.corrections,
          };
        }
        const snapped = autoSnapBlankExpression(parseMdBlank(text), ctx.passage);
        return {
          question: snapped.question,
          gateIssues: gateMdQuestion(snapped.question, ctx.passage),
          corrections: snapped.corrections,
        };
      }
      const snapped = autoSnapGrammarMarks(parseMdGrammar(text), ctx.passage);
      return {
        question: snapped.question,
        gateIssues: gateMdQuestion(snapped.question, ctx.passage, {
          markerCount: c.markerCount,
          answerCount: c.answerCount,
        }),
        corrections: snapped.corrections,
      };
    },

    adapt(parsed: MdLaneParsed, ctx: MdLaneContext): MdLaneAdaptResult {
      const c = readCounts(ctx.resolved);
      const q = parsed.question as MdAnyQuestion;
      const diff = ctx.difficulty as MdDifficulty;
      if (q.kind === "blank") return adaptMdBlankToAiQuestion(q, ctx.passage, diff, blankAnswerMode(c));
      if (q.kind === "multiBlank")
        return adaptMdMultiBlankToAiQuestion(
          q,
          ctx.passage,
          diff,
          // DN 은 단일 빈칸 전용(리졸버가 강제) — 두 모드만 존재한다.
          c.blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT",
        );
      return adaptMdGrammarToAiQuestion(q, ctx.passage, diff);
    },

    qualityArgs(ctx: MdLaneContext): Record<string, unknown> {
      const c = readCounts(ctx.resolved);
      if (subType === "BLANK_INFERENCE") return { blankCount: c.blankCount };
      return { markerCount: c.markerCount, answerCount: c.answerCount };
    },

    mdFormat(ctx: MdLaneContext): Record<string, unknown> {
      const c = readCounts(ctx.resolved);
      return subType === "BLANK_INFERENCE"
        ? { blankCount: c.blankCount, answerMode: blankAnswerMode(c) }
        : { markerCount: c.markerCount, answerCount: c.answerCount };
    },

    diversityTargets(structuredData: Record<string, unknown>): string[] {
      return canonDiversityTargets(subType, structuredData).filter((s) => s.trim().length > 0);
    },
  };
}
