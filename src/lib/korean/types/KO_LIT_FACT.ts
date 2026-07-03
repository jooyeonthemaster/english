// ============================================================================
// KO_LIT_FACT — 문학 작품 내용·인물·사건 이해 (사실적 이해)
// ============================================================================
// 카탈로그 §2.2 KO_LIT_FACT 사양의 전면 구현 (비마커 MC5 — KO_RD_FACT 견본의
// 문학 산문 대응물).
//
// 실측 근거:
//   발문: "윗글에 대한 이해로 적절하지 않은 것은?" /
//         재구성형 "'허원'을 중심으로 윗글을 이해한 내용으로 적절하지 않은 것은?"
//         (핵심 서사소를 발문에 지정하는 재구성형이 최근 주류 — 서사소는 작은따옴표)
//   선지: 인물-행위-대상 삼항 구조의 문면 사실 진술
//   오답 설계 4원리: 행위 주체 교체 · 인과/시간 왜곡 · 정서 극성 반전(명백
//   오답이라 문항당 최대 1개) · 지문에 없는 세부 첨가
//   난이도 변형: 발췌 전체 세부 대조형(전수 검증 강제 — 시간 소모 준킬러)
//   세트 역할: 산문 세트 2번 슬롯 | 내신은 전체 줄거리 암기로 대응 가능
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { OPTION_LABELS } from "../core/markers";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const DISTORTION_PRINCIPLES = [
  "AGENT_SWAP",
  "CAUSAL_TEMPORAL_DISTORT",
  "EMOTION_POLARITY_FLIP",
  "DETAIL_FABRICATION",
] as const;

const schema = koMc5Envelope({
  stemForm: z
    .enum(["PLAIN", "FOCUSED"])
    .describe(
      "발문 형태 — PLAIN: '윗글에 대한 이해로 …' 표준형, FOCUSED: 핵심 서사소를 작은따옴표로 지정하는 재구성형(''X'를 중심으로 윗글을 이해한 내용으로 …')",
    ),
  focusElement: z
    .string()
    .min(1)
    .describe(
      "FOCUSED 전용 — 발문에 지정한 핵심 서사소(인물명·소재·사건어). 지문에 그대로 등장하는 표현이어야 하며(verbatim 검증됨) 발문에는 반드시 작은따옴표로 인용",
    )
    .optional(),
  stemPolarity: z
    .enum(["NEGATIVE", "POSITIVE"])
    .describe(
      "발문 극성 — NEGATIVE: '적절하지 않은 것은?' (기본, 참 4 + 왜곡 1), POSITIVE: '가장 적절한 것은?' (왜곡 4 + 참 1, 전수 검증 강제형)",
    ),
  distortions: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("왜곡(사실과 다른) 선지 라벨"),
        principle: z
          .enum(DISTORTION_PRINCIPLES)
          .describe(
            "이 선지에 적용한 왜곡 원리: AGENT_SWAP=행위 주체 교체, CAUSAL_TEMPORAL_DISTORT=인과·시간(선후) 왜곡, EMOTION_POLARITY_FLIP=정서 극성 반전(문항당 최대 1회), DETAIL_FABRICATION=지문에 없는 세부 첨가",
          ),
      }),
    )
    .min(1)
    .max(4)
    .describe(
      "왜곡 선지 선언 — NEGATIVE 발문이면 정답 선지 1개만, POSITIVE 발문이면 오답 선지 4개 전부. 라벨 중복 금지",
    ),
});

const prompt = `### 유형: 문학 — 작품 내용·인물·사건 이해 (사실적 이해)

**발문 템플릿** (stemForm × stemPolarity 조합에 따라 정확히 이 형태로):
- PLAIN × NEGATIVE(기본): "윗글에 대한 이해로 적절하지 않은 것은?"
- PLAIN × POSITIVE: "윗글에 대한 이해로 가장 적절한 것은?"
- FOCUSED × NEGATIVE: "'[핵심 서사소]'를 중심으로 윗글을 이해한 내용으로 적절하지 않은 것은?" (실측례: "'허원'을 중심으로 윗글을 이해한 내용으로 적절하지 않은 것은?")
- FOCUSED × POSITIVE: "'[핵심 서사소]'와 관련한 설명으로 가장 적절한 것은?" (실측례: "누명과 관련한 설명으로 가장 적절한 것은?")
- FOCUSED 의 핵심 서사소는 **반드시 작은따옴표**로 인용하고, 조사(를/을·와/과)는 받침에 맞게 붙여라.

**핵심 서사소(focusElement) 선정 규칙 — FOCUSED 일 때**:
1. 지문(발췌)에 **그대로 등장하는 표현**이어야 한다(한 글자도 바꾸지 마라 — verbatim 검증됨): 중심 인물명, 갈등의 핵이 되는 소재·사건어(예: '누명', '혼사', '편지').
2. 발췌 전반의 사건들을 하나로 꿰는 서사소를 골라라 — 한 장면에만 등장하는 지엽 소재는 부적격.
3. 선지 5개는 전부 그 서사소와의 관련(서사소를 둘러싼 인물의 행위·반응·사건 전개) 속에서 진술하라.

**선지 구성 원리**:
1. 선지는 **인물-행위-대상 삼항 구조**의 문면 사실 진술이다: "[인물]은/는 [대상·상황]에 대해/에게 [행위·반응]한다/했다" 골격, 평서형 '~다' 종결. 해석·감상·주제 진술이 아니라 발췌에 서술된 사건·행위·반응의 재진술이다.
2. 5개 선지는 발췌의 **서로 다른 장면·구간**을 다루고, 사건 전개 순서대로 배열하라(한 장면에 선지 3개 이상 몰지 마라).
3. 인물 지칭은 지문 표기를 그대로 써라 — 호칭·이름을 임의로 바꾸거나 지문에 없는 인물을 등장시키지 마라.
4. 선지는 지문 문장의 통복사가 아니라 재진술이다: 어휘·구문을 재구성하되 사실 관계는 보존하고(참 선지), 왜곡 선지는 **정확히 한 지점**만 비틀어라 — 두 군데 이상 틀리면 너무 쉬워진다.
5. NEGATIVE 발문이면 참 선지 4개 + 왜곡 선지 1개(=정답). POSITIVE 발문이면 왜곡 선지 4개 + 참 선지 1개(=정답)이며, 오답 4개는 서로 다른 왜곡 원리를 우선 사용하라.

**오답(왜곡) 함정 원리 — distortions 에 선언한 원리를 정확히 적용**:
- AGENT_SWAP(행위 주체 교체): A가 한 행위를 B가 한 것으로, 또는 행위의 주체와 대상을 맞바꿈. 예: 지문 "갑이 을을 관아에 고발했다" → 선지 "을은 갑을 관아에 고발했다".
- CAUSAL_TEMPORAL_DISTORT(인과·시간 왜곡): 원인↔결과 역전, 사건 선후 뒤집기, 계기 바꿔치기. 예: 지문 "노잣돈을 마련한 뒤 길을 떠났다" → 선지 "길을 떠난 뒤 노잣돈을 마련했다" / 지문 "죄책감 때문에 마을을 떠났다" → 선지 "협박을 받아 마을을 떠났다".
- EMOTION_POLARITY_FLIP(정서 극성 반전): 인물의 긍정 반응을 부정으로(반가움→못마땅함, 안도→불안). **명백 오답이 되므로 문항당 최대 1개** — 나머지 왜곡은 주체·인과 왜곡이나 세부 첨가로 구성하라.
- DETAIL_FABRICATION(지문에 없는 세부 첨가): 발췌의 인물·사건 어휘를 조합해 그럴듯하지만 발췌에 서술되지 않은 세부(행위의 동기, 이전 사연, 뒷일, 심리의 이유)를 사실처럼 진술. 근거 relation 은 NOT_MENTIONED.

**근거앵커(evidence) 작성법**:
- 모든 선지(①~⑤)에 각 1개 이상. spanText 는 해당 장면의 지문 원문 구절 그대로(8~60자, 변형·요약 금지).
- 참 선지: relation=SUPPORTS + 그 진술이 성립하는 장면의 원문 구절.
- 왜곡 선지(주체 교체·인과/시간 왜곡·극성 반전): relation=DISTORTS 또는 CONTRADICTS + 왜곡 판정의 기준이 되는 원문 구절.
- 세부 첨가 선지: relation=NOT_MENTIONED + 가장 가까운 관련 구절(첨가된 세부가 그 주변에 없음을 보이는 지점).

**금지**:
- **markers 필드 사용** — 이 유형은 마커 무사용이 표준이다. 마커를 선언하면 지문에
  원문자(㉠)가 실제로 찍히므로, 발문·선지가 그 라벨을 명시적으로 지칭하지 않는 한
  '설명 없는 고아 마킹'으로 학생을 혼란시킨다(시스템이 지칭 없는 마커를 반려한다).
  지시 대상이 필요 없으면 markers 를 아예 비워라.
- 해석·감상·상징·주제 진술 선지 (문면 사실 판정으로 한정 — 감상은 <보기> 유형의 몫).
- 발췌 밖 원작 전체 줄거리 지식을 요구하는 선지 (발췌에 서술된 내용만 근거로).
- 지문에 없는 인물·호칭의 등장, 인물 이름 오기.
- 두 개 이상의 선지가 같은 근거로 동시에 틀리는 구성.
- 상식만으로 배제되는 황당한 왜곡 (읽지 않아도 지워지는 선지).
- 지문 문장을 그대로 복사한 선지 (재진술 없는 선지).`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.stemForm === "FOCUSED") {
    lines.push(
      "- stemForm=FOCUSED 로 출제하라: 핵심 서사소를 작은따옴표로 지정한 재구성형 발문('[서사소]'를 중심으로 …). focusElement 는 지문에 그대로 등장하는 표현이어야 한다.",
    );
  } else if (settings.stemForm === "PLAIN") {
    lines.push("- stemForm=PLAIN 으로 출제하라 (윗글에 대한 이해로 …).");
  } else {
    lines.push(
      "- stemForm 은 지문 특성에 맞게 선택하라: 발췌를 관통하는 인물·소재가 뚜렷하면 재구성형(FOCUSED)을 우선하라 — 최근 주류 형식이다.",
    );
  }
  if (settings.stemPolarity === "POSITIVE") {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라: 발문은 '가장 적절한 것은?', 선지는 왜곡 4 + 참 1 — 오답 4개는 서로 다른 왜곡 원리를 사용하라.",
    );
  } else {
    lines.push("- stemPolarity=NEGATIVE 로 출제하라 (적절하지 않은 것은?).");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 자습서·수업의 표준 해석과 일치하는 사실 진술을 기반으로 하되, 왜곡은 내신 기출 관행인 미세 변형(부정↔긍정 반전, 주체 교체, 한 단어 치환)을 허용한다. 근거가 특정 장면에 몰려도 좋다.",
    );
  } else {
    lines.push(
      "- 수능 모드: 판정 기준은 **발췌 문면**이다 — 원작 전체 줄거리 지식 없이 발췌에 서술된 사건·행위만으로 참/거짓이 갈리게 하라.",
    );
  }
  return lines.join("\n");
}

const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const stemPolarity = question.stemPolarity === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);

  // [체크 1] 발문 극성 ↔ 선언 극성 정합 (KO_RD_FACT 미러)
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // [체크 2] 재구성형(FOCUSED) — 핵심 서사소의 지문 실재성 + 발문 작은따옴표 인용
  const stemForm = question.stemForm === "FOCUSED" ? "FOCUSED" : "PLAIN";
  const focusElement =
    typeof question.focusElement === "string" ? question.focusElement.trim() : "";
  if (stemForm === "FOCUSED") {
    if (!focusElement) {
      add("error", "ko-direction-grammar", "재구성형(FOCUSED) 발문인데 focusElement 가 없습니다");
    } else {
      if (!ctx.koText.containsSpanKo(ctx.passage, focusElement)) {
        add(
          "error",
          "ko-quote-not-verbatim",
          `핵심 서사소 "${focusElement}" 가 지문에 그대로 등장하지 않습니다 — 재구성형 서사소는 지문 실재 표현이어야 합니다`,
        );
      }
      const quoted = ctx.koText.extractQuotedSpansKo(direction);
      const quotedInStem =
        quoted.some((q) => q === focusElement) ||
        direction.includes(`‘${focusElement}’`) ||
        direction.includes(`'${focusElement}'`);
      if (!quotedInStem) {
        add(
          "error",
          "ko-direction-grammar",
          `재구성형 발문에 핵심 서사소가 작은따옴표('${focusElement}')로 인용되지 않았습니다`,
        );
      }
    }
  } else if (focusElement) {
    add(
      "warning",
      "ko-direction-grammar",
      "stemForm=PLAIN 인데 focusElement 가 선언되어 있습니다 — 재구성형이면 FOCUSED 로 선언하세요",
    );
  }

  // 선지별 evidence relation 집계
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

  // [체크 3] 극성-근거관계 정합 (KO_RD_FACT 의 SUPPORTS/DISTORTS 정합 미러):
  //   부정발문 → 정답(왜곡 선지)의 근거는 DISTORTS/CONTRADICTS/NOT_MENTIONED,
  //   나머지 4개(참 선지)의 근거는 SUPPORTS. 긍정발문 → 반대.
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldBeDistorted = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => DISTORT_RELATIONS.has(r));
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

  // [체크 4] 왜곡 선언(distortions) ↔ 정답·극성 정합
  const distortions = Array.isArray(question.distortions)
    ? (question.distortions as Record<string, unknown>[])
    : [];
  const declaredLabels = distortions
    .map((d) => (typeof d.label === "string" ? d.label : ""))
    .filter(Boolean);
  const declaredSet = new Set(declaredLabels);
  if (declaredLabels.length !== declaredSet.size) {
    add("error", "ko-correct-answer-invalid", "distortions 선언에 중복 라벨이 있습니다");
  }
  if (negativeStem) {
    if (declaredSet.size !== 1 || !declaredSet.has(correctAnswer)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `부정발문에서는 왜곡 선지가 정답 1개(${correctAnswer || "미지정"})여야 합니다 — 선언: [${declaredLabels.join(", ")}]`,
      );
    }
  } else {
    const expected = OPTION_LABELS.filter((l) => l !== correctAnswer);
    const complete =
      declaredSet.size === 4 &&
      !declaredSet.has(correctAnswer) &&
      expected.every((l) => declaredSet.has(l));
    if (!complete) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `긍정발문에서는 정답(${correctAnswer || "미지정"})을 제외한 오답 4개 전부가 왜곡 선언되어야 합니다 — 선언: [${declaredLabels.join(", ")}]`,
      );
    }
  }

  // [체크 5] 정서 극성 반전은 명백 오답 — 문항당 최대 1개 한정
  const flipCount = distortions.filter((d) => d.principle === "EMOTION_POLARITY_FLIP").length;
  if (flipCount > 1) {
    add(
      "warning",
      "ko-distortion-overuse",
      `정서 극성 반전(EMOTION_POLARITY_FLIP)이 ${flipCount}회 사용되었습니다 — 명백 오답이라 문항당 최대 1회로 한정하세요`,
    );
  }

  // [체크 6] 왜곡 원리 ↔ 근거 relation 세부 정합: 세부 첨가는 NOT_MENTIONED,
  //   주체/인과/극성 왜곡은 DISTORTS·CONTRADICTS 가 자연스럽다.
  for (const d of distortions) {
    const label = typeof d.label === "string" ? d.label : "";
    const principle = typeof d.principle === "string" ? d.principle : "";
    const relations = relationOf.get(label);
    if (!label || !relations) continue;
    if (principle === "DETAIL_FABRICATION" && !relations.has("NOT_MENTIONED")) {
      add(
        "warning",
        "ko-evidence-missing",
        `${label} 선지는 세부 첨가(DETAIL_FABRICATION) 왜곡인데 NOT_MENTIONED 근거가 없습니다 — 첨가된 세부는 미언급 표시가 필요합니다`,
      );
    }
    if (
      principle !== "DETAIL_FABRICATION" &&
      principle !== "" &&
      relations.has("NOT_MENTIONED") &&
      !relations.has("DISTORTS") &&
      !relations.has("CONTRADICTS")
    ) {
      add(
        "warning",
        "ko-evidence-missing",
        `${label} 선지의 왜곡 원리(${principle})는 원문 왜곡인데 근거가 NOT_MENTIONED 뿐입니다 — 왜곡 판정 기준 구절(DISTORTS/CONTRADICTS)을 제시하세요`,
      );
    }
  }

  // [체크 7] 고아 마커 차단(결정론) — 이 유형은 마커 무사용(meta.markerFamilies=[])
  // 계약인데 markers 가 선언되면 렌더가 지문에 원문자를 무조건 찍는다. 발문·선지
  // 어디서도 그 라벨을 지칭하지 않으면 학생 화면에 '설명 없는 ㉠'이 노출되는 실사용
  // 결함(판정단 major)이므로 차단한다. 라벨이 지칭되는 경우만 warning 으로 완화.
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  if (markers.length > 0) {
    const optionTexts = Array.isArray(question.options)
      ? (question.options as Record<string, unknown>[])
          .map((o) => (typeof o.text === "string" ? o.text : ""))
          .join("\n")
      : "";
    const referenceSurface = `${direction}\n${optionTexts}`;
    const orphanLabels = markers
      .map((m) => (typeof m.label === "string" ? m.label : ""))
      .filter((label) => label && !referenceSurface.includes(label));
    if (orphanLabels.length > 0) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커 ${orphanLabels.join(" ")} 가 발문·선지 어디에서도 지칭되지 않습니다 — 이 유형은 마커 무사용이 계약이며, 지칭 없는 마커는 지문에 고아 원문자로 노출됩니다(markers 를 비우세요)`,
      );
    } else {
      add(
        "warning",
        "ko-marker-option-mismatch",
        "이 유형(사실적 이해)은 마커 무사용이 표준입니다 — markers 선언이 정말 필요한지 재검토하세요",
      );
    }
  }

  return issues;
}

export const KO_LIT_FACT: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_FACT",
    area: "LITERATURE",
    label: "작품 내용·인물·사건 이해",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_ESSAY", "LIT_PLAY", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "산문 발췌의 인물·행위·사건을 삼항 구조 선지로 대조해 왜곡된 하나를 판정하는 문학 사실적 이해 유형 — 핵심 서사소 재구성형 포함",
    setSlot: "산문 세트 2번 슬롯(내용·인물 이해 축) — 하~중, 발췌 전체 세부 대조형은 준킬러",
    studentTask:
      "선지 5개의 인물-행위-대상 진술을 발췌 장면과 대조해 사실과 다른 하나(또는 맞는 하나)를 고릅니다.",
    bestFor: [
      "인물·사건 전개가 뚜렷한 현대·고전소설 발췌",
      "갈등의 핵이 되는 소재(서사소)가 있는 산문",
      "내신 줄거리 확인·수능형 발췌 대조 훈련",
    ],
    outputUi: ["지문 동봉", "5지선다(삼항 구조)", "선지별 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "stemForm",
        label: "발문 형태",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 특성)" },
          { value: "PLAIN", label: "표준형(윗글에 대한 이해)" },
          { value: "FOCUSED", label: "재구성형('서사소' 중심 — 최근 주류)" },
        ],
        defaultValue: "AUTO",
        description: "재구성형은 핵심 인물·소재를 작은따옴표로 지정해 선지를 그 축으로 재조직합니다",
      },
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것)" },
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
    BASIC:
      "왜곡은 행위 주체 교체처럼 한 장면의 문면 대조로 즉시 판정되게 하라. 참 선지의 재진술은 어휘 치환 수준으로.",
    INTERMEDIATE:
      "인과·시간 왜곡을 중심으로 — 판정에 두 장면(사건의 앞뒤) 대조가 필요하게 하라. 참 선지 중 1개는 서로 떨어진 두 장면의 정보를 결합하라.",
    KILLER:
      "발췌 전체 세부 대조형으로 설계하라: 선지 5개를 발췌 전 구간에 고르게 분산시켜 전수 검증을 강제하라. 왜곡은 세부 첨가·미세한 선후 교란처럼 원문과 한 끗 차이로 하고, 정서 극성 반전은 쓰지 마라. 재구성형(FOCUSED) 발문을 우선 고려하라.",
  },
};
