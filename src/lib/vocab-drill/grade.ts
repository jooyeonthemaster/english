// 단어 훈련 — 유형별 채점 (순수 함수).
//
// DB 조회가 필요한 재료(EXAMPLE_MATCH 짝 정본, TRAP_JUDGE probe 해독)는
// engine.ts 가 모아서 넘긴다 — 이 모듈은 판정만 한다.
// 채점 기준은 전부 서버 정본(senseKo·lemma·example.senseId)과의 대조다.
// 클라이언트가 보낸 문자열을 기준으로 삼는 채점은 없다.
import type { VocabDrillSense } from "@prisma/client";
import type { VocabProbe } from "./probe";
import { isNearMiss, normalizeLemmaForSpell } from "./spell";

/** 선지·철자 비교용 정규화 — 대소문자·양끝 공백·연속 공백·따옴표 통일. */
export function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

/** 한국어 뜻 비교 — 공백·중점·물결까지 무시(senseKo 표기 편차 흡수). */
export function normalizeKo(raw: string): string {
  return raw.replace(/[\s·~〜]/g, "");
}

export interface ExampleMatchPair {
  /** 클라이언트가 본 예문 라벨(불투명) — verdict 회신에도 이 라벨만 쓴다 */
  exampleId: string;
  /** 학생이 이 예문에 붙인 sense(라벨을 probe 로 되돌린 실 senseId) */
  answeredKey: string;
  /** probe 정본 — 이 예문이 실제로 속한 senseId */
  correctKey: string;
}

export interface GradeContext {
  sense: VocabDrillSense;
  /** 복호화·무결성 검증을 통과한 probe (실패면 null) */
  probe?: VocabProbe | null;
  /** EXAMPLE_MATCH — 짝 정본 대조 결과 재료(라벨을 probe 로 되돌린 것) */
  matchPairs?: ExampleMatchPair[];
  /** EXAMPLE_MATCH — 서빙한 짝 수. 부분 제출을 막는 기준 */
  expectedPairs?: number;
}

export interface GradeResult {
  correct: boolean;
  /** EXAMPLE_MATCH — 짝별 정오(verdict 로 그대로 나간다) */
  pairResults?: { exampleId: string; correct: boolean }[];
  /** SPELL — 오답이지만 한 글자 차이 */
  nearMiss?: boolean;
}

export function gradeAnswer(
  itemType: string,
  answer: string,
  ctx: GradeContext,
): GradeResult | null {
  const { sense } = ctx;
  switch (itemType) {
    case "MEANING_CHOICE":
      return { correct: normalizeKo(answer) === normalizeKo(sense.senseKo) };
    case "WORD_CHOICE":
    case "CONTEXT_FILL":
      return { correct: normalizeAnswer(answer) === normalizeAnswer(sense.lemma) };
    case "SPELL": {
      // 정규화 후 완전 일치. 편집거리 허용은 하지 않는다 — lead/read, form/from 처럼
      // 한 글자 차이가 실제로 다른 표제어인 쌍이 코퍼스에 있다(spell.ts 머리말).
      const correct =
        normalizeLemmaForSpell(answer) === normalizeLemmaForSpell(sense.lemma);
      return { correct, nearMiss: !correct && isNearMiss(answer, sense.lemma) };
    }
    case "TRAP_JUDGE": {
      const probe = ctx.probe;
      if (!probe || probe.kind !== "TRAP_JUDGE" || probe.senseId !== sense.id) {
        return null; // 토큰 위조·누락·유형 불일치
      }
      if (answer !== "O" && answer !== "X") return null;
      const claimIsTrue = probe.claimSenseId === sense.id;
      return { correct: (answer === "O") === claimIsTrue };
    }
    case "EXAMPLE_MATCH": {
      const pairs = ctx.matchPairs ?? [];
      // **부분 제출 금지** — 서빙한 짝을 전부 채워야 채점한다. 짝 하나만 보내고
      // every() 로 통과하던 구멍을 engine 이 봉인 집합과 대조해 막는다.
      if (!pairs.length || pairs.length !== (ctx.expectedPairs ?? pairs.length)) {
        return null;
      }
      const pairResults = pairs.map((p) => ({
        exampleId: p.exampleId,
        correct: p.answeredKey === p.correctKey,
      }));
      return { correct: pairResults.every((p) => p.correct), pairResults };
    }
    case "FLASH":
      // 자기평가 — O(알았다)만 정답 처리. 숙달도 시드에만 영향을 준다.
      if (answer !== "O" && answer !== "X") return null;
      return { correct: answer === "O" };
    default:
      return null;
  }
}

/** EXAMPLE_MATCH 응답 파서 — "예문라벨:뜻라벨,…" (최대 4짝) */
export function parseMatchAnswer(
  answer: string,
): { exampleId: string; senseKey: string }[] | null {
  const parts = answer.split(",").filter(Boolean).slice(0, 4);
  if (!parts.length) return null;
  const out: { exampleId: string; senseKey: string }[] = [];
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx <= 0) return null;
    out.push({
      exampleId: part.slice(0, idx).trim(),
      senseKey: part.slice(idx + 1).trim(),
    });
  }
  return out;
}
