import { z } from "zod";

import {
  koCheckQuizSectionSchema,
  koConceptVocabSectionSchema,
  koExamPointsSectionSchema,
  koLiteraryDeviceSectionSchema,
  koOverviewSectionSchema,
  koParagraphSectionSchema,
  koSpeakerSectionSchema,
  koStructureSectionSchema,
  type KoAnalysisSection,
} from "./ko-schema";
import type { KoGenSectionKind } from "./ko-section-prompts";

/**
 * PRIME_KO 섹션 단위 결정론 정규화 + 검증 (영어 section-coerce.ts 골격 미러).
 *
 * 원칙:
 *  - 불량 배열 원소는 버리고 정상 원소만 남긴다(부분 구제). coercion 은 내용을 지어내지 않는다.
 *  - 정규화 후 반드시 진짜 KO 섹션 스키마로 재검증한다.
 *  - 품질 최소선(rows 하한)은 스키마가 아니라 여기서 걸어, 관대한 base 스키마(옛 저장분
 *    파싱 무회귀)와 신규 생성 품질 강제를 분리한다(영어 base/generation 분리 패턴의 KO 등가물).
 *  - ko-literary-device 는 근거 구절 verbatim 게이트: 원문에 글자 그대로 없는 인용 행은 버린다
 *    (KO-TYPE-CATALOG G1 근거앵커 게이트의 보고서판).
 */

export const KO_SECTION_SCHEMA: Record<KoGenSectionKind, z.ZodType<KoAnalysisSection>> = {
  "ko-overview": koOverviewSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
  "ko-paragraph": koParagraphSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
  "ko-concept-vocab": koConceptVocabSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
  "ko-structure": koStructureSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
  "ko-literary-device": koLiteraryDeviceSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
  "ko-speaker": koSpeakerSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
  "ko-exam-points": koExamPointsSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
  "ko-check-quiz": koCheckQuizSectionSchema as unknown as z.ZodType<KoAnalysisSection>,
};

/** 신규 생성 품질 하한 (coerce 후 남은 정상 행 기준). 미달 = 재생성 대상. */
const KO_MIN_ROWS: Record<KoGenSectionKind, number> = {
  "ko-overview": 0,
  "ko-paragraph": 1,
  "ko-concept-vocab": 4,
  "ko-structure": 2,
  "ko-literary-device": 2,
  "ko-speaker": 1,
  "ko-exam-points": 3,
  "ko-check-quiz": 5,
};

const CAP = {
  paragraphRows: 20,
  conceptRows: 30,
  structureRows: 12,
  deviceRows: 12,
  speakerRows: 10,
  examRows: 10,
  quizQuestions: 10,
} as const;

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
function clampInt(v: unknown, lo: number, hi: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** verbatim 대조용 정규화 — 공백 접힘 + NFC (내용은 보존, 띄어쓰기 잔차만 흡수). */
function normForContains(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** 근거 구절이 원문에 글자 그대로(공백 정규화 후) 존재하는가. */
export function koEvidenceInPassage(evidence: string, passage: string): boolean {
  const ev = normForContains(evidence);
  if (!ev) return false;
  return normForContains(passage).includes(ev);
}

export interface KoCoerceContext {
  /** 원문 — ko-literary-device 근거 verbatim 게이트에 사용. 없으면 게이트 생략. */
  passage?: string;
}

/** KO 섹션 raw 객체를 결정론적으로 정규화한다 (검증 전 단계). */
export function coerceKoSection(kind: KoGenSectionKind, raw: unknown, ctx: KoCoerceContext = {}): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>), kind };

  switch (kind) {
    case "ko-overview": {
      obj.genre = str(obj.genre).trim();
      obj.subjectMatter = str(obj.subjectMatter).trim();
      obj.theme = str(obj.theme).trim();
      obj.commentary = str(obj.commentary).trim();
      return obj;
    }

    case "ko-paragraph": {
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          const no = clampInt(row.no, 1, 99);
          if (no === undefined || !nonEmpty(row.gist)) return null;
          return { ...row, no, gist: str(row.gist).trim() };
        })
        .filter(Boolean)
        .slice(0, CAP.paragraphRows);
      return obj;
    }

    case "ko-concept-vocab": {
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          if (!nonEmpty(row.term) || !nonEmpty(row.meaning)) return null;
          return { ...row, term: str(row.term).trim(), meaning: str(row.meaning).trim() };
        })
        .filter(Boolean)
        .slice(0, CAP.conceptRows);
      return obj;
    }

    case "ko-structure": {
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          if (!nonEmpty(row.functionLabel) || !nonEmpty(row.keyPoint)) return null;
          const no = clampInt(row.no, 1, 99);
          return { ...row, ...(no !== undefined ? { no } : { no: undefined }) };
        })
        .filter(Boolean)
        .slice(0, CAP.structureRows);
      return obj;
    }

    case "ko-literary-device": {
      const passage = ctx.passage;
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          if (!nonEmpty(row.device) || !nonEmpty(row.evidence) || !nonEmpty(row.effect)) return null;
          // 근거앵커 게이트: 원문에 없는 인용 행은 통째로 버린다(허위 인용 차단).
          if (passage && !koEvidenceInPassage(str(row.evidence), passage)) return null;
          return { ...row, device: str(row.device).trim(), evidence: str(row.evidence).trim() };
        })
        .filter(Boolean)
        .slice(0, CAP.deviceRows);
      return obj;
    }

    case "ko-speaker": {
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          if (!nonEmpty(row.target) || !nonEmpty(row.emotion) || !nonEmpty(row.attitude)) return null;
          return { ...row };
        })
        .filter(Boolean)
        .slice(0, CAP.speakerRows);
      return obj;
    }

    case "ko-exam-points": {
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          if (!nonEmpty(row.slot)) return null;
          // typeId 는 KO_ 접두일 때만 유지(임의 문자열 오염 방지).
          const rawTypeId = str(row.typeId).trim().toUpperCase();
          const typeId = rawTypeId.startsWith("KO_") ? rawTypeId : undefined;
          return { ...row, slot: str(row.slot).trim(), typeId };
        })
        .filter(Boolean)
        .slice(0, CAP.examRows);
      return obj;
    }

    case "ko-check-quiz": {
      const questions = asArray(obj.questions)
        .map((q) => {
          if (!q || typeof q !== "object") return null;
          const row = q as Record<string, unknown>;
          const no = clampInt(row.no, 1, 10);
          if (no === undefined || !nonEmpty(row.prompt) || !nonEmpty(row.answer)) return null;
          const prompt = str(row.prompt).trim();
          const answer = str(row.answer).trim();
          // 정답 누출 게이트: OX 가 아닌데 정답 문구가 발문에 그대로 들어가면 그 문항은 버린다.
          const fmt = str(row.format).trim().toUpperCase() === "OX" ? "OX" : "단답";
          if (fmt !== "OX" && answer.length >= 2 && normForContains(prompt).includes(normForContains(answer))) {
            return null;
          }
          return { ...row, no, format: fmt, prompt, answer };
        })
        .filter(Boolean)
        .slice(0, CAP.quizQuestions);
      return {
        kind: "ko-check-quiz",
        ...(nonEmpty(obj.note) ? { note: obj.note } : {}),
        questions,
        hiddenAnswers: true, // 신규 생성분은 항상 학생 표면 은닉으로 시작
      };
    }

    default:
      return obj;
  }
}

export type KoSectionValidation =
  | { ok: true; section: KoAnalysisSection }
  | { ok: false; error: string };

export function validateKoSection(kind: KoGenSectionKind, coerced: unknown): KoSectionValidation {
  const schema = KO_SECTION_SCHEMA[kind];
  const r = schema.safeParse(coerced);
  if (!r.success) {
    return {
      ok: false,
      error: r.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" | "),
    };
  }
  // 신규 생성 품질 하한 — coerce 가 불량 행을 버린 뒤 남은 행 수 기준.
  const min = KO_MIN_ROWS[kind];
  if (min > 0) {
    const section = r.data as unknown as Record<string, unknown>;
    const rows = Array.isArray(section.rows)
      ? section.rows
      : Array.isArray(section.questions)
        ? section.questions
        : [];
    if (rows.length < min) {
      return {
        ok: false,
        error: `${kind}: 유효 항목이 ${rows.length}개 — 최소 ${min}개 필요 (근거 없는/불량 항목은 자동 제거됨). 원문에 실제로 있는 근거로 다시 채워라.`,
      };
    }
  }
  return { ok: true, section: r.data };
}

/** coerce → validate 를 한 번에. */
export function coerceAndValidateKo(
  kind: KoGenSectionKind,
  raw: unknown,
  ctx: KoCoerceContext = {},
): KoSectionValidation {
  return validateKoSection(kind, coerceKoSection(kind, raw, ctx));
}
