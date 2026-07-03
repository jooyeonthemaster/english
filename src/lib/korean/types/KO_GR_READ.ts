// ============================================================================
// KO_GR_READ — 문법 지문형 세트 1문항째: 문법 설명 지문 이해 (언매 35번 미러)
// ============================================================================
// 카탈로그 §2.5 KO_GR_READ 사양의 전면 구현. KO_RD_FACT(사실적 이해)의 구조를
// 문법 설명 지문(GRAMMAR_CONCEPT)에 미러하되, 이 유형의 시그니처는
// **정답(왜곡) 근거를 한정 조항('~인 경우에만', '다만', '~를 제외하면')에
// 지엽 배치**하는 것이다 — 대충 읽으면 원칙만 기억하고 예외를 놓치게 설계.
//
// 실측 근거(언매 35번 관행):
//   발문: "윗글에 대한 이해로 적절하지 않은 것은?"
//   지문: 1,000자 내외 문법 설명(음운·형태·통사·국어사) — 소재는 매년 신규 발굴
//   (음절 구조→합성 명사→훈민정음 용자례→호칭어/지칭어→품사 통용→활용),
//   교과 주변부·통시·화용 소재로 배경지식 무력화.
//   난이도: 언매 오답률 상위 상습(2024 수능 35번 정답률 20~32%대 — 기관별 편차)
//   오답(왜곡) 3원리: 규칙 적용 범위 확대 · 예외를 원칙으로 · 두 규칙의 조건 교차
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
      "발문 극성 — NEGATIVE: '윗글에 대한 이해로 적절하지 않은 것은?' (기본·언매 35번 관행), POSITIVE: '윗글에 대한 이해로 가장 적절한 것은?' (고난도 전수검증형)",
    ),
  distortionPrinciple: z
    .enum(["SCOPE_EXPANSION", "EXCEPTION_AS_RULE", "CONDITION_CROSS"])
    .describe(
      "정답(왜곡) 선지에 사용한 왜곡 원리: SCOPE_EXPANSION=규칙 적용 범위 확대(한정 조건 삭제·전칭화), EXCEPTION_AS_RULE=예외 조항을 일반 원칙으로 승격, CONDITION_CROSS=두 규칙의 적용 조건을 맞바꿈",
    ),
});

const prompt = `### 유형: 문법 — 지문형 문법 세트 1문항째: 지문 이해 (언매 35번 미러)

**지문 전제**: 대상 지문은 음운·형태·통사·국어사 개념을 서술하는 문법 설명 지문이다.
출제 전에 지문에서 **원칙-예외 이중 구조**를 찾아라: 일반 원칙 서술과 그것을 한정하는
조항('~인 경우에만', '다만 ~', '~를 제외하면', '원칙적으로 ~이나')이 함께 있는 지점.
이 유형의 성패는 그 한정 조항을 정답 판정의 기준으로 삼는 데 있다.

**발문 템플릿** (stemPolarity 에 따라 정확히 이 형태로):
- NEGATIVE(기본): "윗글에 대한 이해로 적절하지 않은 것은?"
- POSITIVE: "윗글에 대한 이해로 가장 적절한 것은?"

**선지 구성 원리**:
1. 5개 선지는 지문의 **서로 다른 문단/규칙 서술 구역**의 정보를 재진술한다 — 한 문단에
   선지 3개 이상 몰지 마라. 지문이 규칙 여러 개를 설명하면 규칙마다 최소 1개 선지를 배정하라.
2. NEGATIVE 발문이면 참 선지 4개 + 왜곡 선지 1개(=정답). POSITIVE 발문이면 왜곡 선지
   4개 + 참 선지 1개(=정답).
3. **시그니처 — 정답 근거의 한정 조항 지엽 배치**: 왜곡(정답 계열) 선지의 정오를 가르는
   근거는 지문 본문의 중심 서술이 아니라 **스치듯 지나가는 한정 조항**('~인 경우에만',
   '다만', '~를 제외하면', '~일 때에 한하여', '원칙적으로')에서 뽑아라. 원칙 문장만 읽은
   학생에게는 왜곡 선지가 참으로 보이고, 예외·조건부까지 정독한 학생만 왜곡을 잡아내게
   설계한다. 지문에 한정 조항이 여러 곳이면 가장 눈에 덜 띄는 곳(문단 말미·괄호 병기·
   예시 사이)을 골라라.
4. 왜곡 선지는 distortionPrinciple 3원리 중 하나를 정확히 적용하라:
   - **규칙 적용 범위 확대(SCOPE_EXPANSION)**: 한정 조건을 지워 전칭화한다.
     (예: 지문 "구개음화는 뒤의 'ㅣ'가 형식 형태소인 경우에만 일어난다" →
     선지 "'ㄷ, ㅌ' 뒤에 모음 'ㅣ'가 오면 항상 구개음화가 일어난다" — '형식 형태소인
     경우에만'이라는 한정을 삭제)
   - **예외를 원칙으로(EXCEPTION_AS_RULE)**: '다만/[붙임]' 예외 조항의 내용을 일반
     원칙인 것처럼 승격한다. (예: 지문 "다만 합성어에서는 'ㄴ'이 첨가되기도 한다" →
     선지 "'ㄴ' 첨가는 단어의 짜임과 무관하게 일어나는 일반적 현상이다")
   - **두 규칙의 조건 교차(CONDITION_CROSS)**: 지문이 규칙 A(조건 α)와 규칙 B(조건 β)를
     나란히 설명할 때 조건을 맞바꾼다. (예: 지문 "주격 조사는 받침 뒤에서 '이', 모음
     뒤에서 '가'로 실현된다"의 두 조건을 교차 → 선지 "받침으로 끝난 체언 뒤에서는
     주격 조사 '가'가 결합한다")
5. 왜곡은 **정확히 한 지점**이어야 한다 — 두 군데 이상 틀리면 예외 조항을 읽지 않아도
   배제되어 시그니처가 무력화된다. 왜곡 지점 외 나머지 서술은 지문과 정확히 일치시켜라.
6. 지문이 용례 단어(예: '굳이', '해돋이', '맏이')를 제시하면 선지에서 그 용례를 재활용하되,
   용례에 대한 규칙 적용 서술의 정오로 판정되게 하라 — 용례 자체를 새로 만들어 지문 밖
   지식을 요구하지 마라.
7. POSITIVE 발문일 때 왜곡 4개는 서로 다른 왜곡 원리를 우선 사용하고(3원리 소진 후 중복
   허용), 그중 최소 1개는 한정 조항 근거 왜곡이어야 한다.

**근거앵커(evidence) 작성**:
- 참 선지: relation=SUPPORTS + 해당 재진술의 원천이 되는 규칙 서술 구절.
- 왜곡 선지: relation=DISTORTS(범위 확대·조건 교차) 또는 CONTRADICTS(예외의 원칙 승격) +
  **판정의 기준이 되는 한정 조항 구절을 spanText 로 그대로 복사하라** — '다만 ~',
  '~인 경우에만 ~', '~를 제외하면 ~' 부분이 spanText 에 포함되어야 한다.

**금지**:
- 지문 밖 문법 지식(교육과정 배경지식)만으로 정오가 판정되는 선지 — 판정 근거는 전부
  지문 문면에 있어야 한다(언매 35번의 존재 이유: 배경지식 무력화).
- 지문의 용어 정의 문장을 재진술 없이 그대로 복사한 선지.
- 한정 조항과 무관한 본문 중심 문장의 왜곡 — 시그니처 위반. 정답 근거는 예외·조건부에.
- 명백히 황당한 왜곡 (지문을 읽지 않아도 배제되는 선지).
- 옛한글 자모(ㆍ ㅿ ㆁ 등)가 필요한 국어사 세부 표기 — 개념 서술 수준으로만 다뤄라.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const polarity = settings.stemPolarity;
  if (polarity === "POSITIVE") {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라: 발문은 '윗글에 대한 이해로 가장 적절한 것은?', 선지는 왜곡 4 + 참 1 (전수 검증 강제).",
    );
  } else {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: 발문은 '윗글에 대한 이해로 적절하지 않은 것은?' (언매 35번 관행).",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 문법 단원의 개념 서술 방식·용어에 밀착하라. 왜곡은 용어 한 단어 치환·조사 교체 수준의 미세 변형을 허용하고, 근거가 특정 문단에 몰려도 좋다. 단 정답 근거를 한정 조항('다만/~인 경우에만')에 두는 원칙은 유지하라.",
    );
  } else {
    lines.push(
      "- 수능(언매 35번) 모드: 배경지식만으로 풀리지 않게 지문 문면 판정을 강제하라. 정답 근거는 반드시 지문의 한정 조항에 지엽 배치하고, 참 선지들도 규칙-용례 대응의 재진술로 구성하라.",
    );
  }
  return lines.join("\n");
}

/** 한정 표지 — 왜곡 선지의 근거 스팬이 예외·조건부 조항인지 판정하는 결정론 단서. */
const LIMIT_MARKERS = ["다만", "경우", "제외", "원칙", "만"] as const;

function hasLimitMarker(span: string): boolean {
  return LIMIT_MARKERS.some((marker) => span.includes(marker));
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const stemPolarity = question.stemPolarity === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);

  // [결정론 1] 발문 극성 ↔ 선언 극성 정합 (KO_RD_FACT 미러)
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // [결정론 2] 극성-근거관계 정합 (KO_RD_FACT 미러):
  //   NEGATIVE 발문 → 정답(왜곡 선지)의 근거는 DISTORTS/CONTRADICTS/NOT_MENTIONED,
  //                   나머지 4개(참 선지)의 근거는 SUPPORTS 여야 한다.
  //   POSITIVE 발문 → 반대.
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  const spansOf = new Map<string, string[]>();
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    const span = typeof e.spanText === "string" ? e.spanText : "";
    if (!label) continue;
    if (relation) {
      const set = relationOf.get(label) ?? new Set<string>();
      set.add(relation);
      relationOf.set(label, set);
    }
    if (span) {
      const spans = spansOf.get(label) ?? [];
      spans.push(span);
      spansOf.set(label, spans);
    }
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

  // [결정론 3] 시그니처 — 왜곡 선지의 근거 스팬에 한정 표지('만/다만/경우/제외/원칙')
  //   포함 여부. 미포함이면 정답 근거가 한정 조항에 지엽 배치되지 않았다는 신호(warning
  //   — 재생성 시 지엽 배치를 유도).
  const optionsRaw = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const optionLabels = optionsRaw
    .map((o) => (typeof o.label === "string" ? o.label : ""))
    .filter(Boolean);
  const distortedLabels = negativeStem
    ? optionLabels.filter((label) => label === correctAnswer)
    : optionLabels.filter((label) => label !== correctAnswer);
  const distortedSpans = distortedLabels.flatMap((label) => spansOf.get(label) ?? []);
  if (distortedSpans.length > 0 && !distortedSpans.some(hasLimitMarker)) {
    add(
      "warning",
      "ko-option-ending",
      `왜곡 선지(${distortedLabels.join(", ")})의 근거 스팬에 한정 표지('만'·'다만'·'경우'·'제외'·'원칙')가 없습니다 — 정답 근거를 지문의 한정 조항(예외·조건부)에 지엽 배치하세요 (KO_GR_READ 시그니처)`,
    );
  }

  // [결정론 4] 선지가 지문 문장 통복사인지 (재진술 요구, KO_RD_FACT 미러) —
  //   25자 이상 연속 일치 시 경고
  for (const o of optionsRaw) {
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

export const KO_GR_READ: KoTypeModule = {
  meta: {
    typeId: "KO_GR_READ",
    area: "GRAMMAR",
    label: "문법 지문 이해(지문형 세트)",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["GRAMMAR_CONCEPT"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "문법 설명 지문(음운·형태·통사·국어사)의 이해를 판정하는 지문형 문법 세트 도입 유형 — 정답 근거를 한정 조항('~인 경우에만'/'다만')에 지엽 배치하는 언매 35번 미러",
    setSlot: "문법 지문형 2문항 세트 1번째 슬롯(언매 35번 미러) — 매회 고정, 사례 적용(KO_GR_APPLY, 3점) 선행",
    studentTask:
      "문법 설명 지문의 규칙·예외 서술과 선지 5개를 대조해, 한정 조항을 놓치면 참으로 보이는 왜곡 선지 하나(또는 참인 하나)를 고릅니다.",
    bestFor: [
      "원칙-예외 이중 구조가 있는 문법 개념 설명 지문",
      "음운 변동·단어 형성·문장 구조·국어사 개념 서술 지문",
      "내신 교과서 문법 단원 지문 확인",
    ],
    outputUi: ["문법 설명 지문 동봉", "5지선다", "선지별 근거·오답 해설(한정 조항 앵커)"],
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
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것 — 언매 35번 관행)" },
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 전수검증형)" },
        ],
        defaultValue: "NEGATIVE",
        description: "긍정발문은 왜곡 선지 4개의 전수 검증을 강제해 체감 난도가 올라갑니다",
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
      "한정 조항이 명시적('다만 ~'으로 시작)인 지점을 근거로 삼고, 왜곡은 그 조항 하나의 삭제(범위 확대)로. 왜곡 판정이 원칙 문장과 예외 문장 한 쌍의 대조로 가능하게 하라.",
    INTERMEDIATE:
      "한정 조항과 원칙 서술이 서로 다른 문단에 떨어진 지점을 근거로 골라 왕복 대조를 강제하라. 참 선지 중 1개는 두 규칙의 서술을 결합한 재진술로 구성하라.",
    KILLER:
      "두 규칙의 조건 교차(CONDITION_CROSS)를 우선 적용하라 — 조건이 표면상 유사한 규칙 쌍에서 교차해야 함정이 산다. 근거가 되는 한정 표지는 '만' 한 글자·괄호 병기처럼 최소 노출 지점으로 고르고, 참 선지들도 지문 용례를 다른 규칙에 대응시킨 재진술로 구성해 전수 검증을 강제하라. 긍정발문 전환을 함께 고려하라.",
  },
};
