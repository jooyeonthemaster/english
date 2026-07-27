// ============================================================================
// 네모 어법(GRAMMAR_CHOICE_COMBO) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md · recon-synthesis §3-B
//
// 실장애 대응: 구형 fast 경로는 어법 프리미엄 사다리(다단 검수·수리)를 태워
// 250~271s 를 먹고 270s 데드라인에 클램프돼 "AI 응답이 지연되어 시간 안에
// 생성을 마치지 못했습니다"로 끝났다. md 레인은 단일 콜 + 0원 결정형 게이트라
// 그 사다리 자체가 사라진다 — 이것이 근본 해결이다.
// ============================================================================

import { buildGrammarPointGuidance } from "@/lib/grammar-point-catalog";
import {
  getQuestionLanguageToggleScope,
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  COMBO_MD_OPTION_COUNT,
  COMBO_MD_SLOT_COUNT,
  buildMdComboPrompt,
  clampComboMdSlotCount,
} from "./prompts-combo";
import {
  autoSnapComboSlots,
  parseMdCombo,
  type MdComboQuestion,
} from "./parser-combo";
import { gateMdCombo } from "./gate-combo";
import { adaptMdComboToAiQuestion } from "./adapter-combo";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const COMBO_SUB_TYPE = "GRAMMAR_CHOICE_COMBO";

const COMBO_DIRECTION_EN =
  "Which of the following is the most appropriate expression in each of the boxes (A), (B), and (C)?";

/**
 * 이 유형에는 개수 노브가 없다 — resolved 는 grammarPointFocus 단독
 * (dispatchers.ts:121-136). 그래도 나중에 노브가 생겨 3 이외의 값이 들어오면
 * 후처리(slots.length !== 3 하드 실패)에서 죽으므로, 여기서 fast 로 되돌린다.
 */
const COMBO_COUNT_KEYS = [
  "comboSlotCount",
  "slotCount",
  "boxCount",
  "markerCount",
  "grammarChoiceComboSlotCount",
] as const;

function pointFocusOf(ctx: MdLaneContext): boolean {
  return Boolean((ctx.resolved as { grammarPointFocus?: unknown }).grammarPointFocus);
}

/**
 * 교사 지정 준수 게이트 — point-picker-config.ts:319-322 의 준수 표면
 * (slots[].correctExpression)과 동일 축으로 검사한다.
 */
function teacherPointIssues(q: MdComboQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    const hit = q.slots.some((slot) => {
      const correct = normalizeWs(slot.correct);
      return correct.length > 0 && (correct.includes(pt) || pt.includes(correct));
    });
    if (!hit) issues.push(`교사 지정 표현이 네모에 없음: '${p.text.slice(0, 60)}'`);
  }
  return issues;
}

export const GRAMMAR_CHOICE_COMBO_MD_LANE: MdLane = {
  subType: COMBO_SUB_TYPE,

  // fast 레인 getOperationType 과 동기 — 어휘 계열(CONTEXT_MEANING·SYNONYM·
  // ANTONYM)만 QUESTION_GEN_VOCAB 이고 네모 어법은 표준 단건이다(2크레딧).
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(스펙 §1 [6] 재생성 계약).
  // ⚠ 벤치에서 콜당 240s 초과가 관측되면 false 로 낮추는 것을 감독에게 제안할 것
  //   (정찰 R10 — 재생성까지 가면 총 예산 270s 를 넘길 수 있다).
  retryEligible: true,

  isEligible(resolved) {
    for (const key of COMBO_COUNT_KEYS) {
      const raw = (resolved as Record<string, unknown>)[key];
      if (raw === undefined || raw === null || raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || clampComboMdSlotCount(n) !== n) return false;
    }
    return true;
  },

  buildBasePrompt(ctx) {
    // pointFocus 를 프롬프트로 넘기는 것이 필수다 — 넘기지 않으면 KILLER 하드
    // 포인트 지정((i)병렬 포함)이 buildExtras 가 덧붙이는 "병렬은 디코이로만"
    // 가이드와 정면 충돌한다(fast 는 hardPool 을 분기해 이 모순을 회피한다).
    return buildMdComboPrompt(ctx.passage, "full", ctx.difficulty, {
      slotCount: COMBO_MD_SLOT_COUNT,
      pointFocus: pointFocusOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];

    // 어법끝 빈도 가이드 — 세 슬롯 포인트 지정(answerCount=3)·함정 카드·금지 목록.
    // fast 의 네모 후보 블록(candidate-blocks/grammar.ts:1166-1172)과 동일 신호원.
    // ⚠ 지문 문장 재열거(같은 블록의 sentences.slice(0,14))는 싣지 않는다 —
    //   md 프롬프트는 이미 지문 전문을 1회 포함하므로 2회 인쇄는 입력 비대다.
    // KILLER 는 base 프롬프트가 하드 포인트 지정을 이미 발행하므로 로테이션
    // 지정을 끈다(fast 도 isKiller 면 diversityEnabled=false — 지정 충돌 방지).
    const isKiller = ctx.difficulty === "KILLER";
    const guidance = buildGrammarPointGuidance({
      variantIndex: ctx.variantIndex,
      diversityEnabled: !isKiller && ctx.variantCount > 1,
      pointFocus: pointFocusOf(ctx),
      answerCount: COMBO_MD_SLOT_COUNT,
      requestedDifficulty: ctx.rawDifficulty,
    });
    if (guidance) {
      // 브리지 문구가 우선순위를 못 박는다 — 가이드는 밑줄 어법(정답 1 + 디코이 4)
      // 전제로 쓰여 "정답으로 쓰지 말고 디코이로만"을 발행하는데, 네모 어법에는
      // 디코이 자리가 없어 그 문장이 곧 전면 금지가 된다. base 프롬프트의 하드
      // 포인트 지정은 pointFocus 를 이미 반영해 발행되므로 base 가 우선이다.
      extras.push(
        [
          "## 포인트 가이드 적용 안내 (네모 어법)",
          '- 아래 가이드의 "밑줄"은 이 유형에서 "네모"로 읽어라. 정답 포인트 지시는 세 네모의 포인트 배분에 적용한다.',
          "- 이 유형에는 **디코이 자리가 없다**(세 네모가 전부 정답 포인트다). 가이드가 \"디코이로만 쓰라\"고 한 포인트는 '세 네모에 쓰지 마라'로 읽어라.",
          "- 위 '네모 설계' 절의 포인트 지정이 이 제한을 이미 반영한 값이다. 둘이 어긋나 보이면 '네모 설계' 절을 따른다.",
          "",
          guidance,
        ].join("\n"),
      );
    }

    // 질문 언어 집행 — md 레인의 기존 결함(라우트에 stemLanguage 참조 0건) 봉합.
    // 네모 어법은 toggle scope 가 'stem' 이라 발문 언어만 집행한다(보기는 영어
    // 후보 조합이라 구조적으로 고정 — optionLanguage 는 UI 에 노출조차 안 된다).
    if (readStemLanguageSetting(ctx.rawTypeSettings, COMBO_SUB_TYPE) === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 선지의 후보 표현은 지문 영어 그대로, 해설·오답 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdCombo(text);
    const snapped = autoSnapComboSlots(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdCombo(q, ctx.passage, {
          slotCount: COMBO_MD_SLOT_COUNT,
          optionCount: COMBO_MD_OPTION_COUNT,
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdComboToAiQuestion(
      parsed.question as MdComboQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, COMBO_SUB_TYPE) === "en"
    ) {
      result.aiQuestion.direction = COMBO_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    // 보기 언어는 이 유형에서 토글이 노출되지 않는다(scope='stem' — 네모 후보
    // 조합이라 구조적으로 영어 고정). languageSettingsForType 과 같은 규칙으로,
    // 노출되지 않는 축은 저장값이 아니라 구조 기본값(ko)을 보고한다 — 스테일
    // 저장값이 검증 인자로 새어 나가는 desync 방지.
    const optionLanguage =
      getQuestionLanguageToggleScope(COMBO_SUB_TYPE) === "stem-option"
        ? readOptionLanguageSetting(ctx.rawTypeSettings, COMBO_SUB_TYPE)
        : "ko";
    return {
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, COMBO_SUB_TYPE),
      optionLanguage,
    };
  },

  mdFormat(ctx) {
    return {
      slotCount: COMBO_MD_SLOT_COUNT,
      optionCount: COMBO_MD_OPTION_COUNT,
      pointFocus: pointFocusOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    const targets: string[] = [];
    const slots = structuredData.slots;
    if (Array.isArray(slots)) {
      for (const slot of slots as Array<Record<string, unknown>>) {
        const expr = slot?.correctExpression;
        if (typeof expr === "string" && expr.trim()) {
          targets.push(expr.trim().slice(0, 90));
        }
      }
    }
    return targets;
  },
};
