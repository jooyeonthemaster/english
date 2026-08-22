import { z } from "zod";
import {
  passageSectionSchema,
  summarySectionSchema,
  grammarSectionSchema,
  examFocusSectionSchema,
  vocabularySectionSchema,
  parsingSectionSchema,
  type AnalysisSection,
} from "./schema";
import type { SectionKind } from "./section-prompts";
import { MIN_ANTONYM_COVERAGE, normalizeVocabularySection } from "./vocab-normalize";

/**
 * 섹션 단위 결정론적 정규화(coercion) + 검증.
 *
 * 핵심 아이디어(회복형 생성의 토대):
 *  - 모델 출력이 "거의 맞지만 일부 깨진" 흔한 경우(상한 초과·불량 행 1~2개·범위 밖 숫자)를
 *    **거부(reject) 대신 결정론적으로 고쳐서 살린다.** → 장문 지문이 하드캡(예: parsing≤8,
 *    passage.sentences≤40)을 넘겨도 전체 실패하지 않고 잘라서 통과.
 *  - 코어 원칙: 불량 배열 원소는 버리고 정상 원소만 남긴다(부분 구제). 그래도 섹션의
 *    최소 요구(min)를 못 채우면 그 섹션만 '재생성 대상'으로 표시한다.
 *  - 정규화 후 반드시 진짜 섹션 스키마로 재검증한다(절대 깨진 섹션을 통과시키지 않는다).
 */

export const SECTION_SCHEMA: Record<SectionKind, z.ZodType<AnalysisSection>> = {
  passage: passageSectionSchema as unknown as z.ZodType<AnalysisSection>,
  summary: summarySectionSchema as unknown as z.ZodType<AnalysisSection>,
  grammar: grammarSectionSchema as unknown as z.ZodType<AnalysisSection>,
  "exam-focus": examFocusSectionSchema as unknown as z.ZodType<AnalysisSection>,
  vocabulary: vocabularySectionSchema as unknown as z.ZodType<AnalysisSection>,
  parsing: parsingSectionSchema as unknown as z.ZodType<AnalysisSection>,
};

// 하드캡(스키마와 동일). 장문 지문이 넘기면 잘라서 통과시킨다.
const CAP = {
  passageSentences: 40,
  passageKeywords: 15,
  chunks: 24,
  grammarRows: 20,
  examRows: 10,
  vocabRows: 40,
  parsingItems: 8,
  summarySentences: 5,
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
function clampInt(v: unknown, lo: number, hi: number, fallback?: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/**
 * 섹션 raw 객체를 결정론적으로 정규화한다. 깨진 원소는 버리고 정상만 남기며 상한까지 자른다.
 * 반환값은 아직 '검증 전' 객체다(검증은 validateSection 이 한다).
 */
export function coerceSection(kind: SectionKind, raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>), kind };

  switch (kind) {
    case "passage": {
      const validSentences = asArray(obj.sentences)
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const row = s as Record<string, unknown>;
          const n = clampInt(row.n, 1, 60);
          if (n === undefined || !nonEmpty(row.en) || typeof row.ko !== "string") return null;
          const chunks = asArray(row.chunks)
            .filter((c) => c && typeof c === "object" && nonEmpty((c as Record<string, unknown>).text))
            .slice(0, CAP.chunks)
            // emphasis 는 enum("core"|"normal") 밖 값을 접어서 살린다 — luna 실측(26-08-12,
            // 3런 중 2런)에서 자유값이 나와 passage 섹션 전체가 재생성 대상이 되던 것을
            // "거부 대신 고쳐서 살린다" 원칙대로 필드 드롭으로 구제(모델 불문 방어).
            .map((c) => {
              const chunk = c as Record<string, unknown>;
              if (chunk.emphasis !== undefined && chunk.emphasis !== "core" && chunk.emphasis !== "normal") {
                const { emphasis: _drop, ...rest } = chunk;
                return rest;
              }
              return chunk;
            });
          return { ...row, n, en: str(row.en), ko: str(row.ko), ...(chunks.length ? { chunks } : { chunks: undefined }) };
        })
        .filter(Boolean);
      if (validSentences.length > CAP.passageSentences) {
        console.warn(`[COERCE] passage sentences ${validSentences.length} → ${CAP.passageSentences} (장문 절단)`);
      }
      obj.sentences = validSentences.slice(0, CAP.passageSentences);
      obj.keywords = asArray(obj.keywords).filter(nonEmpty).slice(0, CAP.passageKeywords);
      return obj;
    }

    case "summary": {
      obj.sentences = asArray(obj.sentences).filter(nonEmpty).slice(0, CAP.summarySentences);
      obj.thesisEn = str(obj.thesisEn);
      return obj;
    }

    case "grammar": {
      const POINT_CODES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"];
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          // sentenceNo 누락/비정상 행은 버린다(부분 구제) — 1로 날조하면 어법 포인트가
          // ① 문장에 허위 귀속되므로 금지(coercion 은 절대 내용을 지어내지 않는다).
          const sentenceNo = clampInt(row.sentenceNo, 1, 60);
          if (sentenceNo === undefined || !nonEmpty(row.point) || !nonEmpty(row.explanation)) return null;
          const pointCode = typeof row.pointCode === "string" && POINT_CODES.includes(row.pointCode) ? row.pointCode : undefined;
          return { ...row, sentenceNo, pointCode };
        })
        .filter(Boolean)
        .slice(0, CAP.grammarRows);
      return obj;
    }

    case "exam-focus": {
      const TYPES = ["빈칸추론", "주제", "제목", "순서", "문장삽입", "함축의미", "지칭", "요약"];
      obj.rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          if (!nonEmpty(row.type)) return null;
          // type 정규화(공백 제거) — 표준 8유형 외엔 schema 가 string 이라 통과하나 가능한 표준화.
          const t = str(row.type).replace(/\s+/g, "");
          const type = TYPES.includes(t) ? t : str(row.type);
          const sentenceNo = clampInt(row.sentenceNo, 1, 60);
          return { ...row, type, ...(sentenceNo !== undefined ? { sentenceNo } : {}) };
        })
        .filter(Boolean)
        .slice(0, CAP.examRows);
      return obj;
    }

    case "vocabulary": {
      const rows = asArray(obj.rows)
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const row = r as Record<string, unknown>;
          if (!nonEmpty(row.headword) || !nonEmpty(row.meaning)) return null;
          const difficulty = clampInt(row.difficulty, 1, 5);
          return { ...row, ...(difficulty !== undefined ? { difficulty } : {}) };
        })
        .filter((r): r is Record<string, unknown> => r !== null)
        .slice(0, CAP.vocabRows);
      // 관계어(동의어·반의어) 결정론 정규화 — 상한 2개, 없음="—", 교차관계 충돌 해소.
      // 프롬프트가 지켜지지 않아도 저장 JSON 자체를 고쳐 표/인쇄/학생앱이 같은 값을 본다.
      // ❗정규화는 값만 다듬는다 — 행을 떨어뜨리거나 섹션을 탈락시키지 않는다(멱등).
      const norm = normalizeVocabularySection({ ...obj, rows });
      if (norm.stats.conflictsDropped > 0 || norm.stats.synTruncated > 0 || norm.stats.antTruncated > 0) {
        console.warn(
          `[COERCE] vocab 관계어 정규화: 충돌제거 ${norm.stats.conflictsDropped}, ` +
            `동의어절단 ${norm.stats.synTruncated}행, 반의어절단 ${norm.stats.antTruncated}행, ` +
            `반의어공백 ${norm.stats.antFilledDash}/${norm.stats.rows}행`,
        );
      }
      // 커버리지 계측만 — 미달이어도 섹션을 탈락시키지 않는다(재개·최종 재조립에서
      // vocabulary 가 통째로 사라지고 섹션 예산을 태운다). 프롬프트 하한은 70%.
      if (norm.stats.rows >= 10 && norm.stats.antCoverage < MIN_ANTONYM_COVERAGE) {
        console.warn(
          `[COERCE] vocab 반의어 커버리지 낮음: ${Math.round(norm.stats.antCoverage * 100)}% (${norm.stats.rows}행)`,
        );
      }
      return norm.section;
    }

    case "parsing": {
      obj.items = asArray(obj.items)
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const item = it as Record<string, unknown>;
          const sentenceNo = clampInt(item.sentenceNo, 1, 60);
          const parts = asArray(item.parts)
            .filter((p) => p && typeof p === "object" && nonEmpty((p as Record<string, unknown>).label) && nonEmpty((p as Record<string, unknown>).text))
            .slice(0, 10);
          if (sentenceNo === undefined || !nonEmpty(item.en) || parts.length < 1 || !nonEmpty(item.translation)) return null;
          return { ...item, sentenceNo, parts };
        })
        .filter(Boolean)
        .slice(0, CAP.parsingItems);
      return obj;
    }

    default:
      return obj;
  }
}

export type SectionValidation =
  | { ok: true; section: AnalysisSection }
  | { ok: false; error: string };

/** 정규화된 섹션을 진짜 섹션 스키마로 검증. 통과해야만 확정 섹션으로 받는다. */
export function validateSection(kind: SectionKind, coerced: unknown): SectionValidation {
  const schema = SECTION_SCHEMA[kind];
  const r = schema.safeParse(coerced);
  if (r.success) return { ok: true, section: r.data };
  return {
    ok: false,
    error: r.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(" | "),
  };
}

/** coerce → validate 를 한 번에. */
export function coerceAndValidate(kind: SectionKind, raw: unknown): SectionValidation {
  return validateSection(kind, coerceSection(kind, raw));
}
