// ============================================================================
// KO_RD_STRUCT — 독서 전개 방식·논지 구조 / (가)(나) 관계  【비마커 MC5】
// ============================================================================
// 카탈로그 §2.1 KO_RD_STRUCT 사양의 전면 구현.
//
// 실측 근거:
//   발문: "윗글의 내용 전개 방식으로 가장 적절한 것은?" /
//         (가)(나) 복합: "(가)와 (나)의 내용 전개 방식에 대한 설명으로 가장 적절한 것은?"
//   메커니즘: 거시 구조(정의→예시, 통시, 견해 대비, 문제→해결)를 메타 진술로 판정.
//   선지 어미: '~하고 있다' (meta.optionEnding="strategy" — 공통 게이트가 검사).
//   (가)(나) 복합이면 대구 선지 "(가)는 ~을, (나)는 ~을 …하고 있다".
//   오답 4원리: 부재 전개 장치 삽입 · (가)(나) 역할 맞바꿈 · 한쪽만 참인 짝 ·
//               관계 규정(소개 vs 비판) 왜곡
//   세트 역할: 주제통합 세트 1번 슬롯 단골.
//
// 유형 특화 결정론 체크(validate):
//   1. compositeMode ↔ 지문 (가)(나) 파트 실재 ↔ 발문 템플릿 정합
//   2. 선지 개념어가 전개 방식 개념어 은행(KO_RD_STRUCT_DEVICE_BANK)에 있는지
//      — 외부 개념어 = warning(ko-option-ending)
//   3. GA_NA 모드 대구 선지((가)·(나) 동시 언급) 검사
//   4. stemPolarity ↔ 발문 극성 정합 + 극성 ↔ 근거 relation 정합
//   5. distractorPrinciples 라벨 정합(정답 선지 오귀속·복합 전용 원리의 단일 지문 사용)
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { splitKoPassageParts } from "../core/passage-meta";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 전개 방식 개념어 은행 (닫힌 집합 — validator 결정론 검사의 기준)
// ---------------------------------------------------------------------------
// device: 개념어(선지 진술의 기법부), example: 표준 선지 문형(프롬프트 노출),
// cues: 선지 텍스트에서 이 장치의 사용을 인정하는 표면형(부분 문자열 매칭).
// 은행 밖 개념어만으로 구성된 선지는 warning(ko-option-ending)으로 표면화한다.

interface KoStructDevice {
  device: string;
  example: string;
  cues: readonly string[];
}

export const KO_RD_STRUCT_DEVICE_BANK: readonly KoStructDevice[] = [
  {
    device: "정의→예시",
    example: "핵심 개념의 정의를 제시한 뒤 구체적인 사례를 들어 설명하고 있다",
    cues: ["정의", "개념을 밝히", "개념을 제시", "예시", "사례", "예를 들"],
  },
  {
    device: "통시적 고찰",
    example: "대상이 변화해 온 과정을 시간의 흐름에 따라 고찰하고 있다",
    cues: ["통시", "시간의 흐름", "시대", "변천", "변화 과정", "형성 과정", "역사적"],
  },
  {
    device: "견해 대비",
    example: "하나의 쟁점에 대한 상반된 견해를 소개하고 그 차이를 밝히고 있다",
    cues: ["견해", "관점", "입장", "이론", "학설", "쟁점"],
  },
  {
    device: "문답",
    example: "질문을 던지고 그에 답하는 방식으로 화제를 전개하고 있다",
    cues: ["질문", "물음", "문답", "묻고"],
  },
  {
    device: "유추",
    example: "친숙한 대상에 빗대어 낯선 개념을 유추의 방식으로 설명하고 있다",
    cues: ["유추", "빗대", "비유"],
  },
  {
    device: "분류",
    example: "대상을 일정한 기준에 따라 유형별로 나누어 설명하고 있다",
    cues: ["분류", "유형", "기준에 따라", "나누어", "구분"],
  },
  {
    device: "인과",
    example: "현상이 나타나게 된 원인을 분석하고 그 결과를 밝히고 있다",
    cues: ["인과", "원인", "결과", "요인", "영향"],
  },
  {
    device: "절차 서술",
    example: "일이 이루어지는 절차를 순서에 따라 단계적으로 서술하고 있다",
    cues: ["절차", "과정", "단계", "순서", "차례"],
  },
  {
    device: "비교·대조",
    example: "두 대상의 공통점과 차이점을 중심으로 비교하며 설명하고 있다",
    cues: ["비교", "대조", "공통점", "차이점", "달리"],
  },
  {
    device: "문제→해결",
    example: "문제 상황을 제기한 뒤 그 해결 방안을 모색하고 있다",
    cues: ["문제", "해결", "방안", "대안"],
  },
  {
    device: "구체화(부연·상술)",
    example: "중심 화제를 제시한 뒤 이를 세부 요소로 나누어 구체화하고 있다",
    cues: ["구체화", "부연", "상술", "세부", "상세"],
  },
  {
    device: "인용",
    example: "전문가의 견해를 인용하여 논지를 뒷받침하고 있다",
    cues: ["인용", "전문가", "문헌", "연구 결과"],
  },
  {
    device: "통념 반박",
    example: "일반적인 통념을 제시한 뒤 그 한계를 지적하며 논지를 전개하고 있다",
    cues: ["통념", "일반적인 인식", "반박", "한계를 지적", "비판"],
  },
  {
    device: "가설 검증",
    example: "가설을 세우고 이를 검증해 가는 과정을 서술하고 있다",
    cues: ["가설", "검증", "실험"],
  },
  {
    device: "장단점 분석",
    example: "대상의 의의와 한계를 함께 짚으며 균형 있게 서술하고 있다",
    cues: ["장점", "단점", "의의", "한계"],
  },
  {
    device: "절충·종합",
    example: "대립하는 두 견해를 절충하여 새로운 결론을 이끌어 내고 있다",
    cues: ["절충", "종합", "수렴", "통합"],
  },
  {
    device: "(가)(나) 관계 규정",
    example: "(나)는 (가)에서 소개한 이론을 구체적인 사례에 적용하고 있다",
    cues: ["소개", "적용", "보완", "발전", "구체적", "이론적 근거", "전제"],
  },
] as const;

// ---------------------------------------------------------------------------
// 스키마 — koMc5Envelope 확장 (검증·렌더에 필요한 필드만)
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  compositeMode: z
    .enum(["SINGLE", "GA_NA"])
    .describe(
      "지문 형태 선언 — SINGLE: 단일 지문(발문 '윗글의 내용 전개 방식…'), GA_NA: (가)(나) 복합 지문(발문 '(가)와 (나)의 내용 전개 방식…', 전 선지 대구 구조). 지문 실제 형태와 일치해야 함",
    ),
  stemPolarity: z
    .enum(["POSITIVE", "NEGATIVE"])
    .describe(
      "발문 극성 — POSITIVE: '가장 적절한 것은?' (이 유형의 표준), NEGATIVE: '적절하지 않은 것은?' (전수 검증 강제형)",
    ),
  distractorPrinciples: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("함정 원리를 적용한 오답 선지 라벨"),
        principle: z
          .enum(["ABSENT_DEVICE", "ROLE_SWAP", "HALF_TRUE_PAIR", "RELATION_DISTORT"])
          .describe(
            "ABSENT_DEVICE=부재 전개 장치 삽입, ROLE_SWAP=(가)(나) 역할 맞바꿈(GA_NA 전용), HALF_TRUE_PAIR=대구/2절 선지의 한쪽만 참, RELATION_DISTORT=(가)(나) 관계 규정 왜곡(소개→비판 등, GA_NA 전용)",
          ),
      }),
    )
    .length(4)
    .describe("오답(왜곡) 선지 4개 각각에 적용한 함정 원리 — 정답 선지 라벨은 넣지 말 것"),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 (출제 매뉴얼)
// ---------------------------------------------------------------------------

const deviceBankForPrompt = KO_RD_STRUCT_DEVICE_BANK.map(
  (d) => `  - ${d.device}: "${d.example}"`,
).join("\n");

const prompt = `### 유형: 독서 — 전개 방식·논지 구조 / (가)(나) 관계

**발문 템플릿** (compositeMode·stemPolarity 에 따라 정확히 이 형태로):
- SINGLE + POSITIVE(표준): "윗글의 내용 전개 방식으로 가장 적절한 것은?"
- SINGLE + NEGATIVE: "윗글의 내용 전개 방식에 대한 설명으로 적절하지 않은 것은?"
- GA_NA + POSITIVE: "(가)와 (나)의 내용 전개 방식에 대한 설명으로 가장 적절한 것은?"
- GA_NA + NEGATIVE: "(가)와 (나)의 내용 전개 방식에 대한 설명으로 적절하지 않은 것은?"
- 지문에 (가)(나) 파트 라벨이 실재할 때만 GA_NA 를 선언하라. 단일 지문에 GA_NA 발문 금지.

**선지 구성 원리**:
1. 선지는 미시 정보가 아니라 **거시 구조(글 전체의 전개 방식)**에 대한 메타 진술이다. 특정 문단의
   세부 내용 일치 여부를 묻는 선지는 이 유형이 아니다(KO_RD_FACT 와의 경계).
2. 선지 문형은 "[전개 장치]+(하여/함으로써)+[대상·효과]" 2단 구조, 어미는 반드시 '~하고 있다'.
   (예: "묻고 답하는 방식으로 화제에 대한 독자의 관심을 환기하고 있다")
3. 전개 장치의 개념어는 아래 **개념어 은행(닫힌 집합)** 안에서만 골라라. 은행 밖 신조 개념어 금지:
${deviceBankForPrompt}
4. GA_NA(복합)면 **5개 선지 전부 대구 구조**로: "(가)는 ~을, (나)는 ~을 …하고 있다" 또는
   "(가)와 (나)는 모두 ~하고 있다" / "(가)는 (나)와 달리 ~하고 있다". (가)·(나)를 언급하지 않는
   선지는 만들지 마라.
5. 참 선지의 전개 장치는 지문에서 **실현 구절을 짚을 수 있어야** 한다(정의 문장, 사례 문장,
   질문 문장 등). 실현 구절이 없는 장치를 참 선지에 쓰지 마라.
6. POSITIVE 발문이면 참 선지 1개(=정답) + 왜곡 선지 4개. NEGATIVE 발문이면 참 4 + 왜곡 1(=정답).
7. 왜곡 선지 4개는 서로 다른 함정 원리를 우선 사용하고(같은 원리 최대 2회), 각 선지에 적용한
   원리를 distractorPrinciples 에 라벨과 함께 선언하라.

**오답 함정 원리 (4원리 — 정확히 하나씩 적용)**:
- ABSENT_DEVICE(부재 전개 장치 삽입): 지문에 없는 장치를 그럴듯하게 삽입.
  예) 지문이 단일 이론을 절차대로 설명할 뿐인데 "상반된 두 견해를 절충하여 결론을 도출하고 있다".
  장치 자체가 없어야 하며, 유사 장치가 있으면(비교가 한 문장이라도 있으면 '비교' 선지) 함정이 무너진다.
- ROLE_SWAP((가)(나) 역할 맞바꿈, GA_NA 전용): (가)가 이론 소개, (나)가 사례 적용인데
  "(가)는 구체적 사례를 분석하고, (나)는 이론적 개념을 정의하고 있다"처럼 역할을 뒤집기.
- HALF_TRUE_PAIR(한쪽만 참인 짝): 대구·2절 선지에서 앞 절은 지문과 일치, 뒤 절만 거짓.
  예) "(가)는 개념의 정의를 제시하고 있고(참), (나)는 통념의 한계를 반박하고 있다(거짓)".
  단일 지문이면 "질문을 던지고(참) 전문가의 견해를 인용하여 답하고 있다(거짓)"처럼 2절 중 한 절만 거짓.
  이 유형 최빈·최강 함정 — 왜곡 선지 4개 중 최소 1개는 이 원리로 만들라.
- RELATION_DISTORT(관계 규정 왜곡, GA_NA 전용): 두 글의 실제 관계(소개·보완·적용)를
  다른 관계(비판·반박·절충)로 규정. 예) (나)가 (가)의 이론을 사례에 적용할 뿐인데
  "(나)는 (가)에서 소개한 이론의 한계를 비판하고 있다".

**근거앵커(evidence) 작성**:
- 참 선지: relation=SUPPORTS + 그 전개 장치가 **실현된 원문 구절**(정의 문장·사례 도입부·질문문 등)을
  지문에서 그대로 복사. 대구 선지는 (가) 근거와 (나) 근거를 각각 1개씩 달아라.
- ABSENT_DEVICE 왜곡: relation=NOT_MENTIONED + 가장 가까운 관련 구절(장치가 없음을 보이는 기준점).
- ROLE_SWAP/RELATION_DISTORT/HALF_TRUE_PAIR 왜곡: relation=DISTORTS + 실제 역할·관계·장치가
  드러나는 원문 구절(왜곡 판정의 기준).

**금지**:
- 개념어 은행 밖의 전개 방식 용어("스토리텔링", "브레인스토밍" 류 비교과 용어).
- 세부 내용 일치 판정으로 환원되는 선지 (거시 구조 진술이 아닌 것).
- 두 군데 이상 틀린 왜곡 선지 (읽지 않아도 배제됨) / 상식만으로 배제되는 황당한 장치.
- GA_NA 에서 (가) 또는 (나) 한쪽만 언급하는 선지.
- 지문 문장을 그대로 복사한 선지 — 메타 진술이므로 구조를 요약·추상화해야 한다.`;

// ---------------------------------------------------------------------------
// settings — examMode(수능/내신) 차이 반영
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const mode = settings.compositeMode;
  if (mode === "GA_NA") {
    lines.push(
      "- compositeMode=GA_NA 로 출제하라: 발문은 '(가)와 (나)의 내용 전개 방식에 대한 설명으로…', 5개 선지 전부 (가)·(나) 대구 구조.",
    );
  } else if (mode === "SINGLE") {
    lines.push("- compositeMode=SINGLE 로 출제하라: 발문은 '윗글의 내용 전개 방식으로…'.");
  } else {
    lines.push(
      "- 지문에 (가)(나) 파트 라벨이 있으면 GA_NA(대구 선지), 없으면 SINGLE 로 출제하라 — 지문 실제 형태와 어긋난 선언 금지.",
    );
  }
  if (settings.stemPolarity === "NEGATIVE") {
    lines.push("- stemPolarity=NEGATIVE 로 출제하라 ('적절하지 않은 것은?'): 참 선지 4 + 왜곡 1.");
  } else {
    lines.push("- stemPolarity=POSITIVE 로 출제하라 ('가장 적절한 것은?' — 이 유형의 표준): 참 1 + 왜곡 4.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 학습활동 '글의 짜임' 변형으로 출제하라 — 문단별 중심 화제·연결 관계(처음-중간-끝, 문단 간 기능)를 선지에 반영해도 좋고, 왜곡은 장치 명칭 한 단어 치환(예: '분류'→'분석') 수준의 미세 변형을 허용한다.",
    );
  } else {
    lines.push(
      "- 수능 모드: 주제통합 세트 1번 슬롯 관행을 따르라 — 글 전체 층위의 메타 진술만 허용, 문단 번호 지시('2문단에서 ~') 금지.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// validate — 유형 특화 결정론 체크
// (공통 게이트가 선실행: 선지 수·라벨·어미 '~하고 있다'(strategy)·근거앵커
//  존재/verbatim·발문 문법 — 여기서 중복 구현하지 않는다)
// ---------------------------------------------------------------------------

const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
const GA_NA_ONLY_PRINCIPLES = new Set(["ROLE_SWAP", "RELATION_DISTORT"]);

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const compositeMode = question.compositeMode === "GA_NA" ? "GA_NA" : "SINGLE";
  const stemPolarity = question.stemPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];

  // ── 체크 1: compositeMode ↔ 지문 파트 ↔ 발문 템플릿 정합 ─────────────
  const parts = splitKoPassageParts(ctx.passage);
  const labeledPartCount = parts.filter((p) => p.label).length;
  if (compositeMode === "GA_NA") {
    if (labeledPartCount < 2) {
      add(
        "error",
        "ko-direction-grammar",
        `compositeMode=GA_NA 인데 지문에 (가)(나) 파트 라벨이 ${labeledPartCount}개 — 복합 지문이 아닙니다`,
      );
    }
    if (!direction.includes("(가)") || !direction.includes("(나)")) {
      add(
        "error",
        "ko-direction-grammar",
        `GA_NA 발문은 "(가)와 (나)의 내용 전개 방식에 대한 설명으로…" 형태여야 합니다: "${direction}"`,
      );
    }
  } else {
    if (!direction.includes("윗글")) {
      add(
        "error",
        "ko-direction-grammar",
        `SINGLE 발문은 "윗글의 내용 전개 방식으로…" 형태여야 합니다: "${direction}"`,
      );
    }
    if (direction.includes("(가)")) {
      add(
        "error",
        "ko-direction-grammar",
        "compositeMode=SINGLE 인데 발문이 (가)(나)를 지시합니다 — 모드 선언 모순",
      );
    }
    if (labeledPartCount >= 2) {
      add(
        "warning",
        "ko-option-ending",
        "지문이 (가)(나) 복합인데 SINGLE(윗글 전체) 발문입니다 — GA_NA 대구 선지 출제를 권장합니다",
      );
    }
  }

  // ── 체크 2: 발문 극성 ↔ 선언 극성 정합 ────────────────────────────────
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // ── 체크 3: 선지 개념어가 은행(닫힌 집합)에 있는지 ────────────────────
  // 전개 장치 기법부는 KO_RD_STRUCT_DEVICE_BANK 의 cue 표면형 중 하나 이상을
  // 포함해야 한다. 은행 밖 개념어만으로 구성된 선지 = warning(ko-option-ending).
  for (const o of options) {
    const text = typeof o.text === "string" ? o.text : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (!text) continue;
    const normalized = ctx.koText.normalizeKo(text);
    const matched = KO_RD_STRUCT_DEVICE_BANK.some((d) =>
      d.cues.some((cue) => normalized.includes(cue)),
    );
    if (!matched) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지의 전개 방식 개념어가 개념어 은행에 없습니다 — 닫힌 집합(정의→예시·통시·견해 대비·문답·유추·분류·인과·절차 등) 안에서 기법부를 구성하세요: "${text.slice(0, 40)}"`,
      );
    }
  }

  // ── 체크 4: GA_NA 대구 선지 — 모든 선지가 (가)·(나)를 함께 언급 ──────
  if (compositeMode === "GA_NA") {
    for (const o of options) {
      const text = typeof o.text === "string" ? o.text : "";
      const label = typeof o.label === "string" ? o.label : "";
      if (!text) continue;
      const hasGa = text.includes("(가)");
      const hasNa = text.includes("(나)");
      if (!hasGa || !hasNa) {
        add(
          "warning",
          "ko-option-ending",
          `${label} 선지가 대구 구조가 아닙니다 — GA_NA 는 전 선지가 (가)·(나)를 함께 진술해야 합니다("(가)는 ~을, (나)는 ~을"): "${text.slice(0, 40)}"`,
        );
      }
    }
  }

  // ── 체크 5: 극성 ↔ 근거 relation 정합 ─────────────────────────────────
  // POSITIVE 발문 → 정답(참 선지)은 SUPPORTS, 오답(왜곡)은 왜곡 계열이어야 한다.
  // NEGATIVE 발문 → 반대.
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
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldBeDistorted = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => DISTORT_RELATIONS.has(r));
    if (shouldBeDistorted && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 왜곡(전개 장치 부재/역할 왜곡) 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeDistorted && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 참 선지인데 장치 실현 구절(SUPPORTS 근거)이 없습니다 — 극성 모순`,
      );
    }
  }

  // ── 체크 6: distractorPrinciples 정합 ─────────────────────────────────
  const principles = Array.isArray(question.distractorPrinciples)
    ? (question.distractorPrinciples as Record<string, unknown>[])
    : [];
  const seenLabels = new Set<string>();
  for (const p of principles) {
    const label = typeof p.label === "string" ? p.label : "";
    const principle = typeof p.principle === "string" ? p.principle : "";
    if (label && label === correctAnswer) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `distractorPrinciples 가 정답 선지(${label})에 함정 원리를 부여했습니다 — 정답/오답 선언 모순`,
      );
    }
    if (label) {
      if (seenLabels.has(label)) {
        add("warning", "ko-option-ending", `distractorPrinciples 에 ${label} 라벨이 중복 — 오답 4개 각 1개여야 합니다`);
      }
      seenLabels.add(label);
    }
    if (compositeMode === "SINGLE" && GA_NA_ONLY_PRINCIPLES.has(principle)) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 함정 원리 ${principle} 는 (가)(나) 복합 전용입니다 — SINGLE 지문에서는 ABSENT_DEVICE/HALF_TRUE_PAIR 를 사용하세요`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_RD_STRUCT: KoTypeModule = {
  meta: {
    typeId: "KO_RD_STRUCT",
    area: "READING",
    label: "전개 방식·논지 구조",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "strategy",
    needsSolverGate: false,
    description:
      "글의 거시 전개 방식(정의→예시·통시·견해 대비·문답 등) 또는 (가)(나) 복합 지문의 관계를 '~하고 있다' 메타 진술로 판정하는 독서 유형",
    setSlot: "주제통합 세트 1번 슬롯 단골 — 세트 도입부의 (가)(나) 관계/전개 판정",
    studentTask:
      "글 전체(또는 (가)와 (나))의 전개 방식을 메타 진술한 선지 5개에서 지문 구조와 정합하는 하나(또는 왜곡된 하나)를 고릅니다.",
    bestFor: ["주제통합 (가)(나) 복합 지문", "전개 구조가 뚜렷한 설명·논증 지문", "내신 '글의 짜임' 학습활동 변형"],
    outputUi: ["지문 동봉", "5지선다('~하고 있다' 대구 선지)", "선지별 장치 실현 구절 근거"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "compositeMode",
        label: "지문 형태",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 파트 감지)" },
          { value: "SINGLE", label: "단일 지문(윗글의 전개 방식)" },
          { value: "GA_NA", label: "(가)(나) 복합(대구 선지)" },
        ],
        defaultValue: "AUTO",
        description: "(가)(나) 복합 지문이면 전 선지가 '(가)는 ~을, (나)는 ~을' 대구 구조가 됩니다",
      },
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 표준)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것 — 전수검증형)" },
        ],
        defaultValue: "POSITIVE",
        description: "이 유형의 수능 표준은 긍정발문(참 1 + 왜곡 4)입니다",
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
      "표면에 드러나는 장치(질문문·'예를 들어'·연대 표지)만 사용하고, 왜곡은 부재 장치 삽입(ABSENT_DEVICE) 위주로 명확하게. 대구 선지는 두 절 모두 명백히 참/거짓이게 하라.",
    INTERMEDIATE:
      "왜곡 선지에 한쪽만 참인 짝(HALF_TRUE_PAIR)을 최소 2개 포함하라. 참 선지의 장치는 표지어 없이 실현된 것(암시적 문답·비교)을 골라 판정에 문단 대조가 필요하게 하라.",
    KILLER:
      "GA_NA 대구 + 관계 규정 왜곡(RELATION_DISTORT: 적용→비판, 소개→반박)을 정답 인접 선지에 배치하라. 모든 왜곡을 '한 절만 거짓' 수준으로 좁히고, 참 선지도 두 파트의 구조를 종합해야 확인되는 진술로 구성해 전수 검증을 강제하라.",
  },
};
