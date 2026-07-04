// ============================================================================
// KO_LIT_PHRASE — 문학 구절·시어 의미/기능 (㉠~㉤ / ⓐ~ⓔ)  【견본 유형 #2 — 마커 MC5】
// ============================================================================
// 카탈로그 §2.2 KO_LIT_PHRASE 사양의 전면 구현. 마커형 유형(마커 삽입·1:1
// 선지 대응·위계 검증)의 기준선 견본이다.
//
// 실측 근거:
//   최빈 발문: "㉠~㉤에 대한 이해로 적절하지 않은 것은?"
//   마커 위계: ㉠~㉤=구절·문장·발화·공간 / ⓐ~ⓔ=시어·단어·개별 대목 (한 세트 공존 실증)
//   선지-마커 1:1 순서 대응 원칙: ①=㉠, ②=㉡ …
//   오답 원리: 기능을 인접 구절과 맞바꿈 · 발화 주체 혼동 · 과잉 상징 해석
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koMarkerSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { KOR_CIRCLED_LABELS, LATIN_CIRCLED_LABELS } from "../core/markers";
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
    .length(5)
    .describe(
      "지문 마킹 5개 — 선지 ①~⑤와 1:1 순서 대응(①=첫 마커). 구절·문장·발화면 KOR_CIRCLED(㉠~㉤), 시어·단어면 LATIN_CIRCLED(ⓐ~ⓔ). 한 문항 안에서는 한 패밀리로 통일",
    ),
});

const prompt = `### 유형: 문학 — 구절·시어의 의미/기능 (㉠~㉤ / ⓐ~ⓔ)

**발문 템플릿**:
- 부정발문(기본): "㉠~㉤에 대한 이해로 적절하지 않은 것은?" (ⓐ계열이면 "ⓐ~ⓔ에 대한 이해로…")
- 긍정발문: "㉠~㉤에 대한 설명으로 가장 적절한 것은?"

**마커 선정 원리**:
1. 지문에서 의미·기능이 뚜렷한 지점 5곳을 고르라: 인물의 발화, 심리가 응축된 구절, 공간·소재 언급, 전환점 문장, 함축적 시어.
2. 위계를 지켜라: 스팬이 **어절 1~2개(단어·시어)면 ⓐ~ⓔ**, **구절·문장·발화면 ㉠~㉤**. 한 문항 안에서는 한 패밀리로 통일하라.
3. 마커 5개는 지문 전반에 분산시키고(한 문단 몰림 금지), 지문 등장 순서대로 ㉠→㉤ 라벨을 부여하라.
4. spanText 는 지문 원문 그대로 — 조사 하나도 바꾸지 마라.

**선지 구성 원리**:
1. 선지-마커 1:1 순서 대응: ①은 ㉠에 대한 진술, ②는 ㉡에 대한 진술 … 순서를 절대 바꾸지 마라.
2. 선지는 "㉠: [의미/기능 진술]" 이 아니라 "㉠은 ~을 드러낸다/보여 준다" 형태의 완결 문장으로.
3. 진술 축: 구절의 의미, 인물 심리·태도의 표출, 서사적·시적 기능(전환·조성·암시·대비), 발화의 의도.
4. 오답(왜곡) 선지의 함정 원리 — 하나를 정확히 적용:
   - 기능 맞바꿈: ㉡의 기능을 ㉢의 것으로 설명 (인접 마커끼리)
   - 발화 주체·대상 혼동: 발화자를 다른 인물로, 또는 발화의 청자를 뒤바꿈
   - 심리 극성 유지 오귀속: 같은 극성 안에서 다른 정서로 (예: '체념'을 '달관'으로)
   - 과잉 상징 해석: 지문 근거 없이 상징 의미를 부여
5. 나머지 4개 선지는 지문 문면과 앞뒤 맥락으로 명백히 성립해야 한다.

**근거앵커**: 각 선지의 근거는 해당 마커 주변 문맥(앞뒤 문장)에서 뽑아라. 참 선지=SUPPORTS, 왜곡 선지=DISTORTS(기능 맞바꿈·오귀속) 또는 NOT_MENTIONED(과잉 상징).

**금지**:
- 마커 없이 성립하는 일반론 선지 ("이 작품은 ~하다").
- 두 개 이상의 선지가 같은 이유로 틀리는 구성.
- 자습서식 고정 해석의 무근거 단정 (지문 문면에서 확인 가능해야 함).`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.markerFamily === "LATIN_CIRCLED") {
    lines.push("- 마커는 ⓐ~ⓔ(시어·단어 단위)로 출제하라.");
  } else if (settings.markerFamily === "KOR_CIRCLED") {
    lines.push("- 마커는 ㉠~㉤(구절·문장 단위)로 출제하라.");
  } else {
    lines.push("- 마커 패밀리는 지문 특성에 맞게 선택하라 (운문·시어 중심이면 ⓐ~ⓔ, 산문 구절·발화면 ㉠~㉤).");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 수업에서 강조될 법한 핵심 구절(주제 응축부·상징 소재)을 우선 마킹하되, 위치 암기로 풀리지 않게 진술을 재구성하라.",
    );
  }
  return lines.join("\n");
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];

  // 마커 5개 + 선지 5개 1:1
  if (markers.length !== 5) {
    add("error", "ko-marker-option-mismatch", `마커가 ${markers.length}개 — 선지 1:1 대응을 위해 정확히 5개여야 합니다`);
  }

  // 한 패밀리 통일 + 위계(단어=ⓐ, 구절=㉠) 검사
  const families = new Set(markers.map((m) => (typeof m.family === "string" ? m.family : "")));
  if (families.size > 1) {
    add("error", "ko-marker-option-mismatch", `마커 패밀리가 혼재합니다(${[...families].join(", ")}) — 한 문항에서는 한 패밀리로 통일`);
  }
  for (const m of markers) {
    const family = typeof m.family === "string" ? m.family : "";
    const span = typeof m.spanText === "string" ? m.spanText : "";
    if (!span) continue;
    const eojeol = ctx.koText.eojeolCount(span);
    if (family === "KOR_CIRCLED" && eojeol <= 1) {
      add("warning", "ko-marker-hierarchy", `㉠계열 마커에 단어 스팬("${span}") — 단어·시어는 ⓐ계열을 사용해야 합니다`);
    }
    if (family === "LATIN_CIRCLED" && eojeol >= 4) {
      add("warning", "ko-marker-hierarchy", `ⓐ계열 마커에 구절 스팬("${span.slice(0, 20)}…") — 구절·문장은 ㉠계열을 사용해야 합니다`);
    }
  }

  // 선지 i 가 마커 i 를 지시하는지 (1:1 순서 대응)
  const expectedLabels =
    families.has("LATIN_CIRCLED") ? LATIN_CIRCLED_LABELS : KOR_CIRCLED_LABELS;
  for (let i = 0; i < Math.min(options.length, 5); i++) {
    const text = typeof options[i].text === "string" ? (options[i].text as string) : "";
    const optionLabel = typeof options[i].label === "string" ? (options[i].label as string) : "";
    const markerLabel = expectedLabels[i];
    if (text && !text.includes(markerLabel)) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${optionLabel} 선지가 ${markerLabel} 를 지시하지 않습니다 — 선지-마커 1:1 순서 대응(①=${expectedLabels[0]}) 위반`,
      );
    }
  }

  // 마커 라벨이 순서대로인지 (㉠㉡㉢㉣㉤)
  const labels = markers.map((m) => (typeof m.label === "string" ? m.label : ""));
  const expectedSeq = expectedLabels.slice(0, markers.length).join("");
  if (labels.join("") !== expectedSeq && markers.length === 5) {
    add("error", "ko-marker-option-mismatch", `마커 라벨이 ${expectedSeq} 순서가 아닙니다: ${labels.join("")}`);
  }

  return issues;
}

export const KO_LIT_PHRASE: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_PHRASE",
    area: "LITERATURE",
    label: "구절·시어의 의미(㉠~㉤)",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: [
      "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_ESSAY", "LIT_PLAY", "MIXED",
    ],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: ["KOR_CIRCLED", "LATIN_CIRCLED"],
    optionEnding: "plain",
    needsSolverGate: false,
    lockedOptionOrder: true,
    description: "지문에 ㉠~㉤/ⓐ~ⓔ 를 마킹하고 각 구절·시어의 의미와 기능을 1:1 선지로 판정하는 문학 최다 형식",
    setSlot: "문학 세트 중간 슬롯 — 매 시험 3~5문항 최다 형식",
    studentTask: "㉠~㉤ 각 구절의 의미·기능 진술에서 왜곡된 하나를 고릅니다.",
    bestFor: ["발화·심리 구절이 풍부한 산문", "함축적 시어가 있는 운문", "내신 수업 강조 구절"],
    outputUi: ["㉠~㉤ 마킹 지문", "5지선다(1:1 대응)", "구절별 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "markerFamily",
        label: "마커 종류",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 특성)" },
          { value: "KOR_CIRCLED", label: "㉠~㉤ (구절·문장)" },
          { value: "LATIN_CIRCLED", label: "ⓐ~ⓔ (시어·단어)" },
        ],
        defaultValue: "AUTO",
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
    BASIC: "마커 주변 한 문장으로 판정 가능하게. 왜곡은 명확한 기능 맞바꿈으로.",
    INTERMEDIATE: "판정에 마커 앞뒤 맥락(2~3문장) 결합이 필요하게. 심리 오귀속은 동일 극성 내에서.",
    KILLER:
      "왜곡 선지를 '절반 참'으로 설계하라(의미는 맞고 기능만 틀림). 나머지 참 선지들도 표면 재진술이 아닌 맥락 종합 진술로 구성해 전수 검증을 강제하라.",
  },
};
