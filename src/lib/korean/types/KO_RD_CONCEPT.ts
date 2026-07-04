// ============================================================================
// KO_RD_CONCEPT — 독서 개념 간 관계·비교 (㉠㉡ 마커형)
// ============================================================================
// 카탈로그 §2.1 KO_RD_CONCEPT 사양의 전면 구현.
//
// 실측 근거:
//   발문: "㉠과 ㉡에 대한 이해로 가장 적절한 것은?" (부정형 변형 가능)
//   메커니즘: 두 핵심 개념·이론·절차를 ㉠·㉡ 마킹, "㉠은 ㉡과 달리 / 모두" 프레임.
//   오답 원리: 속성 교차 오귀속(㉠의 속성을 ㉡에) · '모두/달리' 한정어 오적용 ·
//   정도 비교 반전. 과학·기술 이원 경로 지문에서 킬러화.
//   세트 역할: 세트 중간 심화 슬롯 | 2점(간혹 3점) | 난이도 중~상
//
// 유형 특화 결정론 검증:
//   (1) 마커 = KOR_CIRCLED 정확 2개(㉠·㉡, 등장 순서 라벨) + 두 스팬 상이
//   (2) 모든 선지에 ㉠ 또는 ㉡ 명시 언급 필수
//   (3) 발문에 ㉠·㉡ 동시 언급 + stemPolarity↔부정발문 정합
//   (4) '달리' 프레임·'모두' 프레임 혼합 여부 (텍스트 결정론 검출)
//   (5) 발문 극성 ↔ 근거 relation 정합 (왜곡 선지=DISTORTS 계열)
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koMarkerSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koMc5Envelope({
  markers: z
    .array(koMarkerSchema)
    .length(2)
    .describe(
      "지문 마킹 정확히 2개 — 비교 대상인 두 개념·이론·절차. 반드시 KOR_CIRCLED(㉠·㉡), 지문 등장 순서대로 ㉠→㉡. spanText 는 개념이 정의·도입되는 지점의 명칭 표현 verbatim",
    ),
  stemPolarity: z
    .enum(["POSITIVE", "NEGATIVE"])
    .describe(
      "발문 극성 — POSITIVE: '㉠과 ㉡에 대한 이해로 가장 적절한 것은?' (기본), NEGATIVE: '㉠과 ㉡에 대한 이해로 적절하지 않은 것은?' (변형)",
    ),
  distortionPrinciples: z
    .array(z.enum(["ATTRIBUTE_CROSS", "QUANTIFIER_MISAPPLY", "DEGREE_FLIP"]))
    .min(1)
    .max(3)
    .describe(
      "왜곡 선지들에 사용한 함정 원리 집합(중복 제거): ATTRIBUTE_CROSS=속성 교차 오귀속(㉠의 속성을 ㉡에), QUANTIFIER_MISAPPLY='모두/달리' 한정어 오적용, DEGREE_FLIP=정도 비교 반전",
    ),
});

const prompt = `### 유형: 독서 — 개념 간 관계·비교 (㉠㉡ 마커형)

**발문 템플릿** (stemPolarity 에 따라 정확히 이 형태로):
- POSITIVE(기본): "㉠과 ㉡에 대한 이해로 가장 적절한 것은?"
- NEGATIVE: "㉠과 ㉡에 대한 이해로 적절하지 않은 것은?"
발문에는 반드시 ㉠과 ㉡을 둘 다 표기하라 ("㉠에 대한 이해" 단독 발문 금지).

**마커(㉠·㉡) 선정 원리**:
1. 지문에서 **대비·병렬 구조를 이루는 두 핵심 개념·이론·절차·경로**를 골라라:
   과학·기술 지문의 이원 경로(두 공정·두 기전·두 방식), 인문·사회 지문의 두 견해·두 이론·두 제도.
2. 지문이 두 대상에 대해 **공통 상위 범주 + 구별 속성**(작동 조건·적용 범위·목적·한계·정도 차·절차 순서)을
   모두 서술하고 있어야 출제 가능하다. 한쪽 정보가 빈약하면 이 유형을 선택하지 마라.
3. spanText 는 각 개념이 처음 정의·도입되는 지점의 **명칭 표현 그대로**(명사구 권장, 조사 제외) — 한 글자도 바꾸지 마라.
4. 지문에서 먼저 등장하는 개념이 ㉠, 나중 개념이 ㉡. 라벨 순서를 절대 바꾸지 마라.
5. ㉠과 ㉡은 서로 다른 개념이어야 한다 — 같은 표현을 두 번 마킹하는 것 금지.

**선지 구성 원리 — 두 프레임 혼합**:
1. 모든 선지는 ㉠ 또는 ㉡을 **명시적으로 언급**해야 한다 (마커 없는 일반론 선지 금지).
2. 선지는 두 프레임을 혼합해 구성하라 (권장: 대조 3 + 공통 2):
   - 대조 프레임: "㉠은 ㉡과 달리 ~다." / "㉡은 ㉠과 달리 ~다."
   - 공통 프레임: "㉠과 ㉡은 모두 ~다."
   5개 선지 중 '달리' 프레임과 '모두' 프레임이 **각각 최소 1개씩** 반드시 나와야 한다.
3. 정도 비교 선지("㉠은 ㉡보다 ~가 크다/빠르다/많다")를 1개 포함하는 것을 권장한다
   (지문에 우열·크기·정도 서술이 있을 때만).
4. 각 선지의 술부는 지문에 서술된 속성(기능·조건·목적·한계·절차)의 **재진술**이다 —
   지문 문장 통복사 금지, 지문에 없는 속성 창작 금지.
5. POSITIVE 발문이면 프레임과 속성 귀속이 모두 정확한 선지 1개(=정답) + 왜곡 4개.
   NEGATIVE 발문이면 정확한 선지 4개 + 왜곡 1개(=정답).

**오답(왜곡) 함정 원리 — 하나를 정확히 한 지점에 적용** (distortionPrinciples 에 사용 원리를 선언):
- **속성 교차 오귀속(ATTRIBUTE_CROSS)**: ㉠의 속성을 ㉡의 것으로(또는 반대로) 귀속.
  예: 지문 "㉠ 방식은 촉매를 필요로 한다" → 왜곡 "㉡은 반응 과정에서 촉매를 필요로 한다."
  두 개념의 서술이 인접 문단에 있어 위치 기억만으로 헷갈리게 하라.
- **'모두/달리' 한정어 오적용(QUANTIFIER_MISAPPLY)**: 한쪽에만 성립하는 속성을 "모두"로 확장하거나,
  양쪽에 성립하는 공통 속성을 "달리"로 축소.
  예: 지문상 둘 다 외부 에너지를 소모하는데 → 왜곡 "㉠은 ㉡과 달리 외부 에너지를 소모한다."
  속성 자체는 지문에 실재하므로 매력도가 높다 — 한정어만 틀리게 하라.
- **정도 비교 반전(DEGREE_FLIP)**: 지문의 우열·크기·정도 관계를 뒤집기.
  예: 지문 "㉠이 ㉡보다 처리 속도가 빠르다" → 왜곡 "㉡은 ㉠에 비해 처리 속도가 빠르다."
  수치·비율이 있는 과학·기술 지문에서 우선 사용하라.
- 왜곡은 **정확히 한 지점**이어야 한다 — 프레임과 속성이 동시에 틀리면 너무 쉬워진다.
- 왜곡 4개가 필요할 때(POSITIVE)는 같은 원리를 3회 이상 반복하지 말고 원리를 섞어라.

**근거앵커(evidence) 작성**:
- 참 선지: relation=SUPPORTS + 해당 속성이 서술된 원문 구절. **'모두' 프레임 참 선지는
  ㉠ 쪽 근거와 ㉡ 쪽 근거를 각각 1개씩(2개)** 달아라 — 한쪽 근거만으로 '모두'를 지지할 수 없다.
- 왜곡 선지: relation=DISTORTS(교차 오귀속·정도 반전) 또는 CONTRADICTS(한정어 오적용) +
  귀속 판정의 기준이 되는 원문 구절(실제 속성이 어느 개념의 것인지 드러나는 문장).

**금지**:
- 지문에 없는 제3의 개념·이론을 끌어온 선지.
- 상식만으로 참/거짓 판정이 가능한 선지 (지문 대조 없이 풀리는 선지).
- ㉠·㉡ 언급 없이 성립하는 일반론 선지 ("이 글은 두 이론을 대비하고 있다" 류).
- 두 개 이상의 선지가 같은 이유로 틀리는 구성.
- 지문 문장을 그대로 복사한 선지 (재진술 없는 선지).`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.stemPolarity === "NEGATIVE") {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: 발문은 '㉠과 ㉡에 대한 이해로 적절하지 않은 것은?', 선지는 참 4 + 왜곡 1.",
    );
  } else {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라: 발문은 '㉠과 ㉡에 대한 이해로 가장 적절한 것은?', 선지는 왜곡 4 + 참 1.",
    );
  }
  if (settings.includeDegreeOption === false) {
    lines.push("- 정도 비교 선지(㉠이 ㉡보다 ~)는 넣지 마라 — 대조/공통 프레임만 사용.");
  } else {
    lines.push("- 지문에 우열·크기·정도 서술이 있으면 정도 비교 선지를 1개 포함하라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 두 개념의 정의·기능이 명시된 문장(수업 필기 지점) 중심으로 출제하고, 왜곡은 한정어·조사 한 끗 차이의 미세 변형을 허용하라. 해설에는 각 선지의 근거 문장을 직접 인용해 '근거 서술형' 변형 대비를 겸하게 하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 두 개념의 속성 서술을 서로 다른 문단에 분산 배치된 정보에서 뽑아 선지 판정에 문단 왕복 대조가 필요하게 하라.",
    );
  }
  return lines.join("\n");
}

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const stemPolarity = question.stemPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);

  // 발문 극성 ↔ 선언 극성 정합
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // 발문에 ㉠·㉡ 동시 언급 (결정론)
  if (!direction.includes("㉠") || !direction.includes("㉡")) {
    add(
      "error",
      "ko-direction-grammar",
      "개념 비교 발문은 ㉠과 ㉡을 둘 다 표기해야 합니다 (예: '㉠과 ㉡에 대한 이해로 가장 적절한 것은?')",
    );
  }

  // 마커: KOR_CIRCLED 정확 2개, 라벨 ㉠→㉡, 스팬 상이 (결정론)
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  if (markers.length !== 2) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커가 ${markers.length}개 — 개념 비교는 두 개념(㉠·㉡) 정확히 2개를 마킹해야 합니다`,
    );
  } else {
    for (const m of markers) {
      const family = typeof m.family === "string" ? m.family : "";
      if (family !== "KOR_CIRCLED") {
        add(
          "error",
          "ko-marker-option-mismatch",
          `개념 비교 마커는 KOR_CIRCLED(㉠·㉡)만 허용합니다 — ${family} 사용 불가`,
        );
      }
    }
    const labels = markers.map((m) => (typeof m.label === "string" ? m.label : ""));
    if (labels.join("") !== "㉠㉡") {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커 라벨은 지문 등장 순서대로 ㉠㉡ 이어야 합니다: ${labels.join("")}`,
      );
    }
    const spanA = typeof markers[0].spanText === "string" ? norm(markers[0].spanText as string) : "";
    const spanB = typeof markers[1].spanText === "string" ? norm(markers[1].spanText as string) : "";
    if (spanA && spanA === spanB) {
      add(
        "error",
        "ko-marker-option-mismatch",
        "㉠과 ㉡의 spanText 가 동일합니다 — 서로 다른 두 개념을 마킹해야 합니다",
      );
    }
  }

  // 각 선지에 ㉠ 또는 ㉡ 언급 필수 (결정론)
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  for (const o of options) {
    const text = typeof o.text === "string" ? o.text : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (text && !text.includes("㉠") && !text.includes("㉡")) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${label} 선지가 ㉠·㉡ 어느 것도 언급하지 않습니다 — 개념 비교 선지는 마커를 명시해야 합니다`,
      );
    }
  }

  // '달리'/'모두' 프레임 혼합 (결정론 텍스트 검출)
  if (options.length === 5) {
    const texts = options.map((o) => (typeof o.text === "string" ? o.text : ""));
    const contrastCount = texts.filter((t) => /달리/.test(t)).length;
    const bothCount = texts.filter((t) => /모두/.test(t)).length;
    if (contrastCount === 0 || bothCount === 0) {
      add(
        "warning",
        "ko-option-ending",
        `선지 프레임 혼합 위반 — '달리' 프레임 ${contrastCount}개, '모두' 프레임 ${bothCount}개: 두 프레임이 각각 최소 1개씩 있어야 합니다`,
      );
    }
    const framelessBoth = options.filter((o) => {
      const t = typeof o.text === "string" ? o.text : "";
      return t.includes("㉠") && t.includes("㉡") && !/달리|모두|보다|비해/.test(t);
    });
    for (const o of framelessBoth) {
      const label = typeof o.label === "string" ? o.label : "";
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지가 ㉠·㉡을 함께 언급하면서 비교 프레임('달리'/'모두'/'보다')이 없습니다 — 비교 관계를 명시하세요`,
      );
    }
  }

  // 극성-근거관계 정합: 왜곡 선지=DISTORTS 계열, 참 선지=SUPPORTS
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

  return issues;
}

export const KO_RD_CONCEPT: KoTypeModule = {
  meta: {
    typeId: "KO_RD_CONCEPT",
    area: "READING",
    label: "개념 비교(㉠㉡)",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "지문의 두 핵심 개념·이론·절차를 ㉠·㉡으로 마킹하고 '달리/모두' 프레임 선지로 속성 귀속을 판정하는 독서 심화 유형",
    setSlot: "독서 세트 중간 심화 슬롯 — 주제통합·이원 구조 지문의 ㉠㉡ 비교 단골",
    studentTask: "㉠과 ㉡의 속성 서술을 지문과 대조해 '달리/모두' 귀속이 정확한(또는 왜곡된) 선지를 고릅니다.",
    bestFor: ["과학·기술 이원 경로(두 공정·두 기전) 지문", "인문·사회 두 견해·두 제도 대비 지문", "(가)(나) 주제통합 지문"],
    outputUi: ["㉠·㉡ 마킹 지문", "5지선다('달리/모두' 프레임)", "선지별 귀속 근거 해설"],
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
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것)" },
        ],
        defaultValue: "POSITIVE",
        description: "기본은 긍정발문 — 왜곡 4개를 전수 소거해야 하는 형태입니다",
      },
      {
        key: "includeDegreeOption",
        label: "정도 비교 선지 포함",
        kind: "toggle",
        defaultValue: true,
        description: "지문에 우열·크기·정도 서술이 있을 때 '㉠은 ㉡보다 ~' 선지를 1개 포함합니다",
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
    BASIC:
      "두 개념의 정의·기능이 명시된 문장에서 직접 판정 가능하게 하라. 대조 프레임 위주, 왜곡은 명백한 속성 교차 오귀속으로.",
    INTERMEDIATE:
      "두 개념의 속성 서술을 서로 다른 문단에 분산시켜 선지 판정에 문단 왕복 대조가 필요하게 하라. '모두' 프레임에는 조건부 공통 속성을 쓰고, 한정어 오적용 왜곡을 1개 포함하라.",
    KILLER:
      "이원 경로의 절차·수치가 얽힌 지점에서 정도 비교 반전과 한정 조건 결합 왜곡('~인 경우에만')을 사용하라. 참 선지도 두 문단 정보를 결합한 재진술로 구성해 전수 검증을 강제하고, 부정발문 전환을 고려하라.",
  },
};
