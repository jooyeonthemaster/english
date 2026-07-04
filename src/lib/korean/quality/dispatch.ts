// ============================================================================
// validateKoQuestion — KO 품질 검증 진입점 (KO-DESIGN-SPEC §7)
// ============================================================================
// 영어 dispatcher.ts 의 validateTypeSpecific 에 삽입되는 KO_ 게이트 1개가
// 여기로 위임한다. 공통 게이트(common.ts) 선실행 → 유형 특화 validate().
// examMode·passageKind 는 생성 시 질문 객체에 저장된 koContext 에서 복원한다
// (dispatcher 시그니처 무변경 — run-edit 경로 자동 커버).
// ============================================================================

import * as koText from "../core/ko-text";
import type { KoPassageKind } from "../core/passage-meta";
import { KO_TYPE_REGISTRY } from "../registry";
import type {
  KoDifficulty,
  KoExamMode,
  KoQualityIssue,
  KoValidationContext,
} from "../registry/type-module";
import { validateKoCommon } from "./common";

export interface KoContext {
  examMode: KoExamMode;
  passageKind: KoPassageKind | null;
}

/** 생성 시 서버가 질문 객체에 주입하는 컨텍스트 필드를 복원한다. */
export function readKoContext(question: Record<string, unknown>): KoContext {
  const raw = question.koContext;
  if (raw && typeof raw === "object") {
    const c = raw as Record<string, unknown>;
    return {
      examMode: c.examMode === "NAESIN" ? "NAESIN" : "SUNEUNG",
      passageKind: typeof c.passageKind === "string" ? (c.passageKind as KoPassageKind) : null,
    };
  }
  return { examMode: "SUNEUNG", passageKind: null };
}

export function validateKoQuestion(input: {
  typeId: string;
  question: Record<string, unknown>;
  passage?: string;
  requestedDifficulty?: string;
}): KoQualityIssue[] {
  const { typeId, question, passage = "", requestedDifficulty } = input;
  const mod = KO_TYPE_REGISTRY[typeId];
  if (!mod) {
    // 미등록 KO 유형은 조용한 무검증 출하 대신 명시적 차단 (대원칙 5)
    return [
      {
        severity: "error",
        code: "ko-correct-answer-invalid",
        message: `등록되지 않은 KO 유형입니다: ${typeId} — validator 없이는 활성화할 수 없습니다`,
      },
    ];
  }

  const koCtx = readKoContext(question);
  const difficulty: KoDifficulty =
    requestedDifficulty === "BASIC" || requestedDifficulty === "KILLER"
      ? requestedDifficulty
      : "INTERMEDIATE";

  const ctx: KoValidationContext = {
    passage,
    passageKind: koCtx.passageKind,
    examMode: koCtx.examMode,
    difficulty,
    koText,
  };

  const issues = validateKoCommon(question, mod.meta, ctx);
  try {
    issues.push(...mod.validate(question, ctx));
  } catch (error) {
    issues.push({
      severity: "error",
      code: "ko-correct-answer-invalid",
      message: `유형 검증기 실행 실패(${typeId}): ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return issues;
}
