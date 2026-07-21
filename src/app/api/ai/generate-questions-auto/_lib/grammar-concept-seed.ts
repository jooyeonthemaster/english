// ============================================================================
// 어법 훈련소 — 개념 시드 합성지문 생성기 (v3 design §D5-3, 단위 D-2 신설)
//
// buildConceptSeedPassage(conceptIds, difficulty): 드릴 커리큘럼의 개념 스켈레톤
// (curriculum.ts title·oneLiner)과 개념 카드 원본(bundle.ts algorithm·traps —
// 저작된 유닛만)을 재료로, 대상 개념 구문이 실제로 들어 있는 90~120단어 학술
// 단락 1편을 1콜로 생성한다. 이 단락은 Passage(source="GRAMMAR_STUDIO") 행이
// 되어 기존 GRAMMAR_ERROR 생성 파이프(사다리·솔버·검수리 게이트)에 그대로
// 투입된다 — 문항 오형 심기는 전적으로 기존 파이프 소관이고, 이 모듈은
// "심을 자리가 실제로 존재하는 지문"만 책임진다.
//
// 시드 게이트(§D5-3 1종 신설):
//  1) 분량 게이트 — 단어 수 70~150(목표 90~120), 단일 문단.
//  2) 증거 게이트 — 요청 개념마다 모델이 인용한 evidence.quote 가 단락에
//     '원문 그대로' 존재해야 한다(결정론 부분문자열 검사 — 파이프의
//     surroundingText 원문 인용 계약과 동형).
//  3) 표면형 게이트 — 표면 패턴이 신뢰 가능한 유닛에 한해 정규식 보조 검사
//     (관계사·접속/전치·조동사 등). 패턴이 없는 유닛은 증거 게이트만.
//  불충족 시 반려 사유를 주입해 1회 재생성, 재실패면 ok:false 반환(무과금 —
//  크레딧 차감은 잡 워커에서만 일어난다).
//
// 저작규범 증류(grammar-drill-authoring.md §3·§4·§6·§7):
//  - 난이도는 문장 길이가 아니라 '판단 거리'로 조절(§3 루브릭).
//  - 금지 변형 8종(§6)이 걸리는 자리를 개념 구현 위치로 쓰지 않도록 프롬프트
//    계약으로 봉인 — 이후 오형 심기가 복수 정답 시비에 걸리지 않게 한다.
//  - 판단 대상 구문 간 최소 3단어 간격·지문 전반 분산(§7).
//
// ⚠️ 소유권(D-2): _lib 의 기존 파일은 다른 세션이 수정 중 — 이 신설 leaf 1개만.
// import 방향: grammar-studio 잡 라우트 → 이 파일 → lib(leaf). 기존 _lib 모듈을
// 임포트하지 않고, 기존 _lib 모듈도 이 파일을 모른다(무회귀).
// ============================================================================

import { z } from "zod";

import { getGrammarConcept } from "@/lib/grammar-drill/bundle";
import {
  CONCEPT_SKELETON_BY_ID,
  UNIT_BY_ID,
} from "@/lib/grammar-drill/curriculum";
import { generateQuestionObject } from "@/lib/question-generation-llm";

// ── 결과·사용량 타입 ─────────────────────────────────────────────────────────

export interface ConceptSeedUsageEvent {
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface ConceptSeedEvidence {
  conceptId: string;
  quote: string;
  note: string;
}

export type ConceptSeedResult =
  | {
      ok: true;
      /** 한국어 소재 제목(6~24자) — Passage.title 조립 재료 */
      title: string;
      /** 영어 학술 단락 1편(90~120단어 목표) — Passage.content */
      paragraph: string;
      evidences: ConceptSeedEvidence[];
      attempts: number;
      usageEvents: ConceptSeedUsageEvent[];
    }
  | { ok: false; reason: string; attempts: number; usageEvents: ConceptSeedUsageEvent[] };

// ── 분량 경계 (§D5-3 80~120단어 — 수능 29번 스키마 80~190 과 교집합) ─────────

/** 프롬프트 목표 하한/상한 */
export const CONCEPT_SEED_TARGET_WORDS = { min: 90, max: 120 } as const;
/** 게이트 하드 경계 — 이 밖이면 반려(재생성 1회) */
export const CONCEPT_SEED_HARD_WORDS = { min: 70, max: 150 } as const;

// ── 표면형 보조 패턴 (게이트 3) ──────────────────────────────────────────────
// 정규식으로 '구문의 존재'를 신뢰 있게 감지할 수 있는 유닛만 등재한다.
// 수일치·분사·준동사처럼 패턴이 전 영어 문장에 편재해 변별력이 없는 유닛은
// 의도적으로 비운다(오탐 게이트는 없느니만 못하다) — 그 유닛들은 증거 게이트
// (원문 인용 검사)가 단독으로 커버한다.

const UNIT_SURFACE_PATTERNS: Partial<Record<string, { pattern: RegExp; label: string }>> = {
  u06: { pattern: /\b(what|that|which)\b/i, label: "관계사(what/that/which)" },
  u07: {
    pattern: /\b(which|that|where|when|whom|whose)\b/i,
    label: "관계대명사/관계부사",
  },
  u08: {
    pattern:
      /\b(while|during|although|though|despite|because|because of|unless|whereas)\b/i,
    label: "접속사/전치사(양보·시간·이유)",
  },
  u12: {
    pattern: /\b(if|were|had|nor|neither|so|than|as)\b/i,
    label: "도치·가정법·비교 표지",
  },
  b04: {
    pattern: /\b(can|could|may|might|must|should|would|shall|ought)\b/i,
    label: "조동사",
  },
  b06: { pattern: /\b(more|most|less|than|as)\b|\w+er\b/i, label: "비교 표지" },
};

// ── 구조화 응답 스키마 ───────────────────────────────────────────────────────

const conceptSeedSchema = z.object({
  title: z.string().describe("지문 소재 제목 — 한국어 6~24자, 명사구"),
  paragraph: z
    .string()
    .describe(
      `영어 학술 단락 1편 — ${CONCEPT_SEED_TARGET_WORDS.min}~${CONCEPT_SEED_TARGET_WORDS.max}단어, 줄바꿈 없이 한 문단, 문장 5~7개.`,
    ),
  evidences: z
    .array(
      z.object({
        conceptId: z.string().describe("대상 개념 ID — 요청된 ID 그대로"),
        quote: z
          .string()
          .describe(
            "그 개념 구문이 실제로 들어 있는 단락 원문 구간 — 단락에서 한 글자도 바꾸지 않고 그대로 인용(공백 포함 8~80자)",
          ),
        note: z.string().describe("이 구간이 개념을 어떻게 구현하는지 — 한국어 1문장"),
      }),
    )
    .describe("요청된 모든 개념 각각에 대해 최소 1개"),
});

type ConceptSeedDraft = z.infer<typeof conceptSeedSchema>;

// ── 프롬프트 재료 ────────────────────────────────────────────────────────────

/** 드릴 난이도(1~4) → 판단 거리 지시문 (§3 루브릭 증류 — 길이가 아니라 거리) */
const DIFFICULTY_SEED_INSTRUCTIONS: Record<number, string> = {
  1: "판단 거리 0 — 개념 구문이 인접 성분만으로 판정되게 배치합니다(주어-동사 인접 등). 수식어 간섭 없이 짧고 직선적인 문장 위주.",
  2: "간섭 1겹 — 개념 구문과 판단 근거 사이에 수식어구 1개(전치사구·짧은 분사구)를 끼워 판단 거리를 한 단계 벌립니다.",
  3: "간섭 2겹 — 관계절 안의 전치사구, 삽입절 통과처럼 두 겹을 걷어내야 판정되는 자리에 개념 구문을 배치합니다.",
  4: "킬러 — 장거리 의존(진짜 주어 핵~동사, 선행사~관계절, 병렬 시작점~대상)을 한 문장 안에 심고, '옳지만 틀려 보이는' 구문이 근처에 공존하게 구성합니다.",
};

/** §6 금지 변형 8종 → 지문 설계 계약으로 증류(개념 구현 위치 봉인) */
const FORBIDDEN_SITE_RULES = [
  "- 시제가 판단 대상이 될 문장에는 시간 부사(last year, since 2010, in recent decades 등)를 반드시 명시합니다 — 시간 부사 없는 과거/현재완료 자리를 개념 구현 위치로 쓰지 않습니다.",
  "- 다음 자리는 개념 구현 위치로 삼지 않습니다(이후 오형 심기가 복수 정답 시비에 걸립니다): 지각동사 뒤 원형/-ing 자리, 제한 용법 that/which 자리, little↔a little·few↔a few 류 의미 토글 자리, very+과거분사 자리, 미국/영국 용법이 갈리는 자리(집합명사 수일치 등).",
  "- 자동사는 능동으로만 등장시킵니다(자동사의 수동 표면 금지). 명사 바로 뒤에 what 이 직결되는 구조 금지.",
  "- 판단 대상이 될 구문끼리는 최소 3단어 간격을 두고 지문 전반에 고르게 분산합니다.",
  "- 고유명사·통계 수치는 최소화합니다(사실 검증 부담 회피). 어법 판단 후보가 될 동사·준동사·관계사·형용사/부사 자리가 풍부한 문장 구조를 선택합니다.",
].join("\n");

/** 개념 1건의 프롬프트 블록 — 스켈레톤(항상) + 개념 카드(저작된 유닛만) */
function buildConceptBlock(conceptId: string): string | null {
  const skeleton = CONCEPT_SKELETON_BY_ID.get(conceptId);
  if (!skeleton) return null;
  const unit = UNIT_BY_ID.get(skeleton.unitId);
  const lines = [
    `### ${conceptId} — ${skeleton.title}`,
    `- 소속 유닛: ${unit ? `${unit.title}(${unit.subtitle})` : skeleton.unitId}`,
    `- 핵심: ${skeleton.oneLiner}`,
  ];
  // 개념 카드 원본(알고리즘·함정) — b유닛 등 미저작 유닛은 스켈레톤만으로 진행.
  const card = getGrammarConcept(conceptId);
  if (card) {
    if (card.algorithm.length > 0) {
      lines.push(`- 판단 알고리즘: ${card.algorithm.slice(0, 3).join(" → ")}`);
    }
    for (const trap of card.traps.slice(0, 2)) {
      lines.push(`- 함정 「${trap.title}」: ${trap.body}`);
    }
  }
  return lines.join("\n");
}

function buildSeedPrompt(input: {
  conceptIds: string[];
  difficulty: number;
  rejectNote: string | null;
}): string {
  const conceptBlocks = input.conceptIds
    .map((id) => buildConceptBlock(id))
    .filter((b): b is string => b !== null);
  const diffInstruction =
    DIFFICULTY_SEED_INSTRUCTIONS[input.difficulty] ?? DIFFICULTY_SEED_INSTRUCTIONS[2];

  return [
    "당신은 수능 영어 어법 문항용 지문을 저작하는 전문가입니다. 아래 대상 개념의 구문이 '실제로' 들어 있는 학술 단락 1편을 영어로 작성하십시오. 이 단락은 이후 어법 판단 문항(밑줄 5개 중 틀린 것 고르기)의 원문 지문이 됩니다 — 단락 자체는 전부 어법상 옳은 정문이어야 합니다(오류를 심는 것은 다음 단계의 일입니다).",
    `## 대상 개념 (각 개념의 구문이 단락에 최소 1회 자연스럽게 등장해야 합니다)\n${conceptBlocks.join("\n\n")}`,
    `## 분량·형식\n- ${CONCEPT_SEED_TARGET_WORDS.min}~${CONCEPT_SEED_TARGET_WORDS.max}단어, 한 문단(줄바꿈 없음), 문장 5~7개.\n- 학술 소재(자연과학·사회과학·인문 중 하나) — CEFR B2 수준 어휘.`,
    `## 난이도(판단 거리) — 길이가 아니라 거리로 조절합니다\n${diffInstruction}`,
    `## 지문 설계 계약 (위반 시 반려)\n${FORBIDDEN_SITE_RULES}`,
    "## 출력 계약\n- evidences 에는 요청된 개념 ID 각각에 대해, 그 개념 구문이 들어 있는 단락 원문 구간을 '한 글자도 바꾸지 않고' 인용합니다 — 인용이 단락과 불일치하면 자동 반려됩니다.",
    ...(input.rejectNote
      ? [`## 직전 시도 반려 사유 — 같은 결함이 재발하지 않게 작성합니다\n${input.rejectNote}`]
      : []),
  ].join("\n\n");
}

// ── 시드 게이트 ──────────────────────────────────────────────────────────────

function normalizeForMatch(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function countSeedWords(paragraph: string): number {
  return paragraph.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * 시드 게이트 — 결정론 검사만(LLM 재호출 없음). 실패 시 반려 사유를 반환한다.
 * export 이유: 단위 테스트·잡 라우트의 감사 로그가 같은 판정을 재사용할 수 있게.
 */
export function verifyConceptSeedPassage(
  draft: Pick<ConceptSeedDraft, "paragraph" | "evidences">,
  conceptIds: string[],
): { ok: true } | { ok: false; reason: string } {
  const paragraph = draft.paragraph ?? "";
  const words = countSeedWords(paragraph);
  if (words < CONCEPT_SEED_HARD_WORDS.min || words > CONCEPT_SEED_HARD_WORDS.max) {
    return {
      ok: false,
      reason: `분량 위반 — ${words}단어(허용 ${CONCEPT_SEED_HARD_WORDS.min}~${CONCEPT_SEED_HARD_WORDS.max}, 목표 ${CONCEPT_SEED_TARGET_WORDS.min}~${CONCEPT_SEED_TARGET_WORDS.max})`,
    };
  }
  if (/\n\s*\n/.test(paragraph.trim())) {
    return { ok: false, reason: "형식 위반 — 두 문단 이상(한 문단이어야 합니다)" };
  }

  const normalizedParagraph = normalizeForMatch(paragraph);
  for (const conceptId of conceptIds) {
    const evidence = draft.evidences.find((e) => e.conceptId === conceptId);
    if (!evidence) {
      return { ok: false, reason: `증거 누락 — ${conceptId} 의 evidence 가 없습니다` };
    }
    const quote = normalizeForMatch(evidence.quote);
    if (quote.length < 8) {
      return {
        ok: false,
        reason: `증거 부실 — ${conceptId} 인용이 너무 짧습니다(8자 미만)`,
      };
    }
    if (!normalizedParagraph.includes(quote)) {
      return {
        ok: false,
        reason: `증거 불일치 — ${conceptId} 인용("${evidence.quote.slice(0, 40)}…")이 단락 원문에 없습니다. 단락에서 한 글자도 바꾸지 말고 그대로 인용하십시오`,
      };
    }
    // 표면형 보조 게이트 — 패턴이 등재된 유닛만.
    const unitId = CONCEPT_SKELETON_BY_ID.get(conceptId)?.unitId;
    const surface = unitId ? UNIT_SURFACE_PATTERNS[unitId] : undefined;
    if (surface && !surface.pattern.test(paragraph)) {
      return {
        ok: false,
        reason: `표면형 미검출 — 단락에 ${surface.label} 구문의 표지가 보이지 않습니다(${conceptId})`,
      };
    }
  }
  return { ok: true };
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export interface BuildConceptSeedPassageInput {
  /** 대상 개념 ID(1~3개 권장 — 90~120단어에 자연 구현 가능한 상한) */
  conceptIds: string[];
  /** 드릴 난이도 1~4 (§3 루브릭 — 판단 거리) */
  difficulty: number;
  /** 콜 시작 전 잔여 예산 확인용 절대시각(ms) — 라우트 벽시계 공유 */
  deadlineAt?: number;
}

/**
 * 개념 시드 합성지문 1편 생성 — 1콜 + 게이트 불충족 시 1회 재생성(§D5-3).
 * LLM/게이트 실패를 던지지 않고 ok:false 로 반환한다(호출자 = 잡 라우트가
 * 해당 문항만 요청에서 제외 — 크레딧 미차감 구간이라 환불 이슈 없음).
 */
export async function buildConceptSeedPassage(
  input: BuildConceptSeedPassageInput,
): Promise<ConceptSeedResult> {
  const usageEvents: ConceptSeedUsageEvent[] = [];
  const conceptIds = [...new Set(input.conceptIds)].filter((id) =>
    CONCEPT_SKELETON_BY_ID.has(id),
  );
  if (conceptIds.length === 0) {
    return {
      ok: false,
      reason: "대상 개념이 커리큘럼에 없습니다",
      attempts: 0,
      usageEvents,
    };
  }

  let rejectNote: string | null = null;
  let attempts = 0;

  // 초기 생성 1회 + 반려 재생성 1회(§D5-3 "불충족 시 1회 재생성 후 실패 반환").
  for (let round = 0; round < 2; round += 1) {
    attempts += 1;
    let draft: ConceptSeedDraft;
    try {
      const result = await generateQuestionObject({
        schema: conceptSeedSchema,
        prompt: buildSeedPrompt({
          conceptIds,
          difficulty: input.difficulty,
          rejectNote,
        }),
        // 시드는 STANDARD 매핑(flash3) — 100단어 단락 1편에 프리미엄 라우팅 불요.
        generationPlan: "STANDARD",
        logPrefix: "GRAMMAR-CONCEPT-SEED",
        maxTokens: 2_048,
        deadlineAt: input.deadlineAt,
      });
      usageEvents.push({
        usage: result.usage,
        provider: result.provider,
        modelId: result.modelId,
        attempts: result.attempts,
        durationMs: result.durationMs,
      });
      draft = result.object;
    } catch (error) {
      return {
        ok: false,
        reason: `시드 생성 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
        attempts,
        usageEvents,
      };
    }

    const verdict = verifyConceptSeedPassage(draft, conceptIds);
    if (verdict.ok) {
      return {
        ok: true,
        title: draft.title.trim(),
        paragraph: draft.paragraph.trim(),
        evidences: draft.evidences,
        attempts,
        usageEvents,
      };
    }
    console.warn(
      `[GRAMMAR-CONCEPT-SEED] gate rejected (round ${round + 1}/2): ${verdict.reason}`,
    );
    rejectNote = verdict.reason;
  }

  return {
    ok: false,
    reason: rejectNote ?? "시드 게이트 반려",
    attempts,
    usageEvents,
  };
}
