// ============================================================================
// KO_RD_FACT — 독서 사실적 이해(내용 일치·확인)  【견본 유형 #1 — 비마커 MC5】
// ============================================================================
// 카탈로그 §2.1 KO_RD_FACT 사양의 전면 구현. 팬아웃 모듈은 이 파일의 밀도
// (프롬프트 구체성·검증기 결정론·오답 원리 반영)를 기준선으로 삼는다.
//
// 실측 근거(2026 수능 1·10·14번):
//   발문: "윗글의 내용과 일치하지 않는 것은?" / "윗글에 대한 이해로 적절하지 않은 것은?"
//   오답(=정답이 되는 왜곡 선지) 설계 5원리: 주체 바꿔치기 · 인과/선후 역전 ·
//   한정 조건 삭제(과잉 일반화) · 비교 관계 반전 · 미언급 정보의 사실화
//   난이도 변형: 재진술 거리 확대, 두 문단 정보 결합 선지, 긍정발문 전환(전수 검증 강제)
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koMc5Envelope({
  stemPolarity: z
    .enum(["NEGATIVE", "POSITIVE"])
    .describe(
      "발문 극성 — NEGATIVE: '일치하지 않는/적절하지 않은 것은?' (기본), POSITIVE: '가장 적절한 것은?' (고난도 전수검증형)",
    ),
  distortionPrinciple: z
    .enum(["AGENT_SWAP", "CAUSAL_REVERSAL", "CONDITION_DROP", "COMPARISON_FLIP", "NOT_MENTIONED_AS_FACT"])
    .describe(
      "정답(왜곡) 선지에 사용한 왜곡 원리: AGENT_SWAP=주체 바꿔치기, CAUSAL_REVERSAL=인과/선후 역전, CONDITION_DROP=한정 조건 삭제(과잉 일반화), COMPARISON_FLIP=비교 관계 반전, NOT_MENTIONED_AS_FACT=미언급 정보의 사실화",
    ),
});

const prompt = `### 유형: 독서 — 사실적 이해(내용 일치·확인)

**발문 템플릿** (stemPolarity 에 따라 정확히 이 형태로):
- NEGATIVE(기본): "윗글의 내용과 일치하지 않는 것은?" 또는 "윗글에 대한 이해로 적절하지 않은 것은?"
- POSITIVE: "윗글의 내용과 일치하는 것은?" 이 아니라 반드시 "윗글에 대한 이해로 가장 적절한 것은?"

**선지 구성 원리**:
1. 5개 선지는 지문의 **서로 다른 문단/구역**의 세부 정보를 재진술한다 — 한 문단에 선지 3개 이상 몰지 마라.
2. 선지는 지문 문장의 복사가 아니라 재진술이다: 어휘를 바꾸고 구문을 재구성하되 의미는 보존하라(참 선지) 또는 정확히 한 군데만 비틀어라(왜곡 선지).
3. NEGATIVE 발문이면 참 선지 4개 + 왜곡 선지 1개(=정답). POSITIVE 발문이면 왜곡 선지 4개 + 참 선지 1개(=정답).
4. 왜곡 선지는 distortionPrinciple 5원리 중 하나를 정확히 적용하라:
   - 주체 바꿔치기: A가 한 행위를 B가 한 것으로 (예: 지문 "갑 이론은 ~을 전제한다" → 선지 "을 이론은 ~을 전제한다")
   - 인과/선후 역전: 원인↔결과, 먼저↔나중을 뒤집기
   - 한정 조건 삭제: "~인 경우에만/일반적으로/초기에는" 같은 한정을 지워 과잉 일반화
   - 비교 관계 반전: "A가 B보다 크다" → "B가 A보다 크다"
   - 미언급 정보의 사실화: 지문의 개념어들을 조합해 그럴듯하지만 지문에 없는 진술 만들기
5. 왜곡은 **정확히 한 지점**이어야 한다 — 두 군데 이상 틀리면 너무 쉬워진다. 왜곡 지점 외 나머지는 지문과 정확히 일치시켜라.
6. POSITIVE 발문일 때 오답 4개는 서로 다른 왜곡 원리를 쓰라(같은 원리 2회 금지).

**근거앵커(evidence) 작성**:
- 참 선지: relation=SUPPORTS + 해당 재진술의 원문 구절.
- 왜곡 선지: relation=DISTORTS(왜곡) 또는 CONTRADICTS(모순) 또는 NOT_MENTIONED(미언급 사실화) + 왜곡 판정의 기준이 되는 원문 구절.

**금지**:
- 지문 문장을 그대로 복사한 선지 (재진술 없는 선지).
- 상식만으로 참/거짓 판정이 가능한 선지.
- 명백히 황당한 왜곡 (읽지 않아도 배제되는 선지).`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const polarity = settings.stemPolarity;
  if (polarity === "POSITIVE") {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라: 발문은 '윗글에 대한 이해로 가장 적절한 것은?', 선지는 왜곡 4 + 참 1.",
    );
  } else {
    lines.push("- stemPolarity=NEGATIVE 로 출제하라 (일치하지 않는/적절하지 않은 것은?).");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 왜곡 선지는 '한 글자 차이' 수준의 미세 변형(조사·부정 전환·수치 한 자리)을 허용하고, 근거가 특정 문단에 몰려도 좋다.",
    );
  }
  return lines.join("\n");
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const stemPolarity = question.stemPolarity === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);

  // 발문 극성 ↔ 선언 극성 정합
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // 극성-근거관계 정합: 정답 선지의 evidence relation 이 극성과 맞아야 한다.
  //   NEGATIVE 발문 → 정답(왜곡 선지)의 근거는 DISTORTS/CONTRADICTS/NOT_MENTIONED,
  //                   나머지 4개(참 선지)의 근거는 SUPPORTS 여야 한다.
  //   POSITIVE 발문 → 반대.
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldBeDistorted = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => distortRelations.has(r));
    if (shouldBeDistorted && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 왜곡 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeDistorted && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 참 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`,
      );
    }
  }

  // 선지가 지문 문장 통복사인지 (재진술 요구) — 25자 이상 연속 일치 시 경고
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  for (const o of options) {
    const text = typeof o.text === "string" ? o.text : "";
    const label = typeof o.label === "string" ? o.label : "";
    const body = text.replace(/(다|이다|았다|었다|있다)\.?$/, "");
    if (body.length >= 25 && ctx.koText.containsSpanKo(ctx.passage, body)) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지가 지문 문장을 재진술 없이 복사했습니다 — 재진술 거리를 확보하세요`,
      );
    }
  }

  return issues;
}

export const KO_RD_FACT: KoTypeModule = {
  meta: {
    typeId: "KO_RD_FACT",
    area: "READING",
    label: "내용 일치(사실적 이해)",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "plain",
    needsSolverGate: false,
    description: "지문 세부 정보의 일치/불일치를 판정하는 독서 세트 도입 유형",
    setSlot: "독서 세트 1번 슬롯(도입) 고정 — 매회 3~4문항",
    studentTask: "선지 5개를 지문 세부 정보와 대조해 왜곡된 하나(또는 참인 하나)를 고릅니다.",
    bestFor: ["세부 정보가 밀도 있는 설명 지문", "개념·절차·비교 구조 지문", "내신 교과서 지문 확인"],
    outputUi: ["지문 동봉", "5지선다", "선지별 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "NEGATIVE", label: "부정발문(일치하지 않는 것)" },
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 전수검증형)" },
        ],
        defaultValue: "NEGATIVE",
        description: "긍정발문은 선지 전수 검증을 강제해 체감 난도가 올라갑니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: true,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC: "왜곡 지점이 한 문장 안에서 확인되게 하라. 재진술은 어휘 치환 수준.",
    INTERMEDIATE: "왜곡 판정에 두 문장의 대조가 필요하게 하라. 참 선지 중 1개는 두 문단 정보를 결합하라.",
    KILLER:
      "긍정발문 전환을 우선 고려하라. 왜곡은 한정 조건 삭제·비교 반전처럼 원문과 한 끗 차이로, 참 선지들도 재진술 거리를 최대화해 전수 검증을 강제하라.",
  },
};
