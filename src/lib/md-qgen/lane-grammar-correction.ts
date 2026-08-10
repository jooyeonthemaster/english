// ============================================================================
// 문법 오류 수정(GRAMMAR_CORRECTION) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 과금 축(중대): fast 레인 getOperationType 의 VOCAB_TYPES 는
// {CONTEXT_MEANING, SYNONYM, ANTONYM} 뿐이다(fast/route.ts:70). 이 유형은
// 거기 없으므로 **QUESTION_GEN_SINGLE** 이다 — 여기를 VOCAB 로 "고쳐" 두면
// fast 폴백과 요금이 갈린다(1차 승차에서 실제로 잡힌 이중청구 사고의 반대편).
// ============================================================================

import {
  GRAMMAR_HIGH_YIELD_FOCUS_CODES,
  GRAMMAR_POINT_CATALOG,
} from "@/lib/grammar-point-catalog";
import {
  readGrammarCorrectionErrorCountSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  buildMdGrammarCorrectionPrompt,
  clampGrammarCorrectionMdErrorCount,
  GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX,
  GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
} from "./prompts-grammar-correction";
import {
  deriveCorrectionSourceText,
  parseMdGrammarCorrection,
  type MdGrammarCorrectionQuestion,
} from "./parser-grammar-correction";
import { autoSnapCorrectionSegments } from "./snap-grammar-correction";
import { gateMdGrammarCorrection } from "./gate-grammar-correction";
import { adaptMdGrammarCorrectionToAiQuestion } from "./adapter-grammar-correction";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

interface CorrectionResolved {
  grammarCorrectionErrorCount?: number;
  grammarPointFocus?: boolean;
}

function errorCountOf(ctx: MdLaneContext): number {
  return clampGrammarCorrectionMdErrorCount(
    (ctx.resolved as CorrectionResolved).grammarCorrectionErrorCount ??
      GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
  );
}

function pointFocusOf(ctx: MdLaneContext): boolean {
  return (ctx.resolved as CorrectionResolved).grammarPointFocus === true;
}

/**
 * 핵심 집중 모드 블록.
 * fast 는 buildGrammarCorrectionCandidateBlock 안에서 buildGrammarPointGuidance 를
 * 통째로 싣지만, 그 블록은 "디코이(밑줄만 치고 옳게 두는 자리)" 와 JSON 필드명을
 * 전제한다 — 이 유형의 md 계약(모든 밑줄이 오류·마크다운 출력)과 정면 충돌해
 * 재사용하지 않는다. 대신 같은 카탈로그에서 톱셋만 뽑아 이 유형용으로 다시 쓴다.
 */
function pointFocusBlock(): string {
  const list = GRAMMAR_HIGH_YIELD_FOCUS_CODES.map((code) => {
    const info = GRAMMAR_POINT_CATALOG[code];
    return `(${code}) ${info.label}[${info.rank}위]`;
  }).join(" · ");
  return [
    "## 출제 포인트 집중 (교사 설정, 필수 — 위의 핵심 10선보다 우선한다)",
    `- 오류로 변형할 포인트는 기출 최빈출 톱셋 안에서만 고른다: ${list}.`,
    "- 이 밖의 포인트(정동사 단독·병렬·비교구문·전치사 등)로 오류를 만들지 마라.",
    "- ⚠ 단, 톱셋 포인트를 **깨끗한 단일 오류로** 심을 자리가 지문에 없으면 억지로 비문을 만들지 마라. 소유격 its 를 목적격 them 으로 바꿔 한정사 자리를 붕괴시키는 식(them parts)이 아니라, its → their(수일치)처럼 깨끗한 변형이 가능할 때만 그 포인트를 쓴다. 깨끗한 톱셋 자리가 정말 없으면 지문이 실제로 주는 가장 깨끗한 자리를 써라.",
  ].join("\n");
}

/**
 * 교사 지정 준수 게이트 — 지정 표현마다 밑줄 구간(원문 축자) 하나와 겹쳐야 한다.
 * 준수 표면은 point-picker-config 의
 * `GRAMMAR_CORRECTION → underlinedSegments[].sourceText` 와 같은 축이다.
 *
 * ⚠ 대조는 **정본(md-stream route 의 teacherPointComplianceIssues 어법 분기)과
 *   동일한 정규화 후 양방향 단순 포함**이다. 종전에는 양쪽을 공백으로 감싸
 *   대조했는데, 그러면 밑줄 안에 실재하는 지정 표현이라도 지문에서 뒤에 쉼표·
 *   마침표가 붙어 있으면(`beneath them.`) 100% 반려됐다 — 그 구두점은 지문에
 *   있는 것이라 모델이 어떻게 재생성해도 회복 불가능한 실패였다(포인트 픽커
 *   기본 unit="word" 는 구두점을 gap 으로 빼므로 지정값에 구두점이 없다).
 *   복원본(sourceText)과 변형본(displayedText) 둘 다 표면으로 인정하는 것도
 *   정본과 같다 — 어느 쪽이든 같은 밑줄 자리를 가리킨다.
 */
function teacherPointIssues(
  q: MdGrammarCorrectionQuestion,
  ctx: MdLaneContext,
): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const surfaces = q.segments
    .flatMap((segment) => [
      deriveCorrectionSourceText(segment) ?? "",
      segment.displayedText,
    ])
    .map((text) => normalizeWs(text).toLowerCase())
    .filter((text) => text.length > 0);
  if (surfaces.length === 0) return [];
  const issues: string[] = [];
  for (const point of ctx.teacherPoints) {
    const needle = normalizeWs(point.text).toLowerCase();
    if (!needle) continue;
    const hit = surfaces.some(
      (surface) => surface.includes(needle) || needle.includes(surface),
    );
    if (!hit) {
      issues.push(`교사 지정 표현이 밑줄 구간에 없음: '${point.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const GRAMMAR_CORRECTION_MD_LANE: MdLane = {
  subType: "GRAMMAR_CORRECTION",

  // fast 레인 VOCAB_TYPES 미포함 확인 완료 — 어휘 계열이 아니므로 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const n = Number(
      (resolved as CorrectionResolved).grammarCorrectionErrorCount ??
        GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
    );
    return (
      Number.isFinite(n) &&
      n >= GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN &&
      n <= GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX
    );
  },

  buildBasePrompt(ctx) {
    return buildMdGrammarCorrectionPrompt(ctx.passage, "full", ctx.difficulty, {
      errorCount: errorCountOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    if (pointFocusOf(ctx)) extras.push(pointFocusBlock());
    // 질문 언어(stemLanguage) 블록은 의도적으로 싣지 않는다:
    // 후처리 normalizeGrammarCorrectionDirection 이 "밑줄" + "고쳐/수정/바르게" 가
    // 없는 발문을 한국어 기본 발문으로 되돌리므로(processors:237-247), 영어 발문은
    // fast 레인에서도 저장되지 못한다. 블록을 실으면 집행되지도 않으면서 해설을
    // 영어로 끌고 갈 위험만 생긴다. 설정 실값은 qualityArgs 로 검증기에 넘긴다.
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdGrammarCorrection(text);
    const snapped = autoSnapCorrectionSegments(parsed);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdGrammarCorrection(q, ctx.passage, {
          errorCount: errorCountOf(ctx),
          requestedDifficulty: ctx.rawDifficulty,
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    return adaptMdGrammarCorrectionToAiQuestion(
      parsed.question as MdGrammarCorrectionQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
  },

  qualityArgs(ctx) {
    return {
      grammarCorrectionErrorCount: errorCountOf(ctx),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "GRAMMAR_CORRECTION"),
    };
  },

  mdFormat(ctx) {
    return {
      errorCount: errorCountOf(ctx),
      pointFocus: pointFocusOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    const targets: string[] = [];
    const segments = structuredData.underlinedSegments;
    if (Array.isArray(segments)) {
      for (const raw of segments as Array<Record<string, unknown>>) {
        if (typeof raw?.sourceText === "string" && raw.sourceText.trim()) {
          targets.push(raw.sourceText.trim().slice(0, 90));
        }
      }
    }
    return targets;
  },
};

// 설정 리더 재수출 — 라우트는 lane 인터페이스만 소비하지만, 벤치·픽스처가
// "UI 설정 → resolved" 경로를 직접 재현할 때 쓴다(견본 lane-antonym 동형).
export { readGrammarCorrectionErrorCountSetting };
