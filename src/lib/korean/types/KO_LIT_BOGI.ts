// ============================================================================
// KO_LIT_BOGI — 문학 <보기> 외적 준거 감상 (문학 3점 킬러 슬롯)
// ============================================================================
// 카탈로그 §2.2 KO_LIT_BOKI 사양의 전면 구현. 난도5 유형 — needsSolverGate.
//
// 실측 근거(2025 수능 21·25·31·34 / 2026 수능 21·23·30·34):
//   문학 3점 4개는 세트당 1개, 전부 <보기>/외적 준거 결합형 (예외 없음).
//   발문: "<보기>를 참고하여 윗글을 감상한 내용으로 적절하지 않은 것은?"
//   변형: "선생님의 설명을 참고하여~"(2026 수능 21번), 마커 결합형(2026 수능 30번).
//   <보기> = 작가론·문학사·창작 배경·비평 개념 3~6문장 — 해석 논쟁 차단 장치
//   (정답 기준은 작가 의도가 아니라 <보기>-지문 정합성).
//   선지 3요소 고정: '지문 직접 인용'(작은따옴표 verbatim) + 보기 개념 연결 + ~군 종결.
//   오답 4원리: (a)인용 정확·연결 왜곡(최빈) (b)개념 A 자리에 B (c)극성 반전
//   (d)보기 외 준거 무단 도입.
// ============================================================================

import { z } from "zod";
import { koBogiSchema, koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koMc5Envelope({
  bogi: koBogiSchema.describe(
    "<보기> — 작가론·문학사·창작 배경·비평 개념 3~6문장의 외적 준거 (이 유형의 필수 요소). 모든 선지의 성립·배제가 이 준거 틀 안에서만 판정되도록 설계",
  ),
  distortionPrinciple: z
    .enum(["LINK_DISTORTION", "CONCEPT_SWAP", "POLARITY_FLIP", "EXTERNAL_CRITERION"])
    .describe(
      "정답(왜곡) 선지에 사용한 오답 원리: LINK_DISTORTION=인용은 정확하나 보기 준거와의 연결 왜곡(최빈·우선), CONCEPT_SWAP=보기 개념 A 자리에 B 적용, POLARITY_FLIP=극성 반전, EXTERNAL_CRITERION=보기에 없는 준거 무단 도입",
    ),
});

const prompt = `### 유형: 문학 — <보기> 외적 준거 감상 (3점 킬러)

**발문 템플릿** (정확히 이 형태 중 하나 — [3점] 표기는 시스템 처리이니 넣지 말 것):
- 표준: "<보기>를 참고하여 윗글을 감상한 내용으로 적절하지 않은 것은?"
- 복합지문: "<보기>를 참고하여 (가), (나)를 감상한 내용으로 적절하지 않은 것은?"
- 변형(선생님 프레임): "선생님의 설명을 참고하여 윗글을 감상한 내용으로 적절하지 않은 것은?" (이때 bogi.label="학습 활동" 또는 "보기", 첫 행을 "선생님: …" 화자 형식으로)
- 마커 결합형: "<보기>를 참고하여 ㉠~㉤을 이해한 내용으로 적절하지 않은 것은?" (markers 5개 동봉 — 아래 마커 결합 규칙 참조)
이 유형의 발문은 반드시 부정발문이다. 긍정발문 금지.

**<보기> 설계 원리 (이 유형의 심장 — 해석 논쟁 차단 장치)**:
1. <보기>는 지문 밖 외적 준거 3~6문장이다. 준거 축 4종 중 지문에 맞는 것을 택하라:
   - 작가론: 작가의 생애·창작 경향·작품 세계 ("○○은 고향 상실의 체험을 ~로 형상화해 왔다")
   - 문학사·갈래 이론: 사조·갈래 관습·시대별 경향 ("1930년대 모더니즘 시는 도시 문명을 ~")
   - 창작·시대 배경: 작품이 놓인 역사·사회적 맥락 ("이 작품은 산업화로 해체되는 농촌 공동체를 배경으로 ~")
   - 비평 개념: 해석 도구가 되는 이론 개념 ("서정적 자아의 '동일화'란 대상과 화자의 거리가 소멸되는 ~")
2. <보기>에는 **판정 가능한 준거 개념을 2개 이상** 심어라. 모든 선지(참 4 + 왜곡 1)의 성립·배제가
   이 준거 틀 안에서만 가능해야 한다 — <보기> 없이 지문만으로 풀리는 선지 구성은 이 유형의 실패다.
3. <보기>는 일반론으로 흐르지 말고 이 지문의 구체 국면(소재·인물·구절)에 사상 가능한 진술로 쓰라.
   단, 지문 문장을 그대로 복사해 넣지 마라(<보기>는 외적 준거이지 지문 요약이 아니다).
4. 정답 시비 차단: <보기>의 준거는 상호 모순 없이, 왜곡 선지를 배제하는 근거가 <보기> 문면에서
   일의적으로 확인되도록 하라.

**선지 3요소 고정 규칙 (전 선지 공통 — 하나라도 빠지면 반려)**:
1. '지문 직접 인용': 지문의 구절을 작은따옴표('…')로 4자 이상 verbatim 인용 — 한 글자도 바꾸지 마라.
   조사·어미 변형 금지, 요약 인용 금지. 인용은 선지마다 서로 다른 구절로, 지문 전반에 분산시켜라.
2. 보기 개념 연결: 인용 구절을 <보기>의 준거 개념과 연결하는 해석 진술 — <보기>에 쓴 어휘가
   선지에 실제로 등장해야 한다.
3. 종결: 반드시 '~군' 또는 '~겠군'으로 끝낸다.
   예: "'북적이던 장터가 빈터로 남았다'는 <보기>의 공동체 해체가 공간의 변화로 형상화된 것이겠군."

**오답(왜곡) 선지 4원리 — distortionPrinciple 하나를 정확히 적용**:
- LINK_DISTORTION(최빈 — 우선 사용): 인용도 정확하고 보기 어휘도 정확한데, 인용 구절과 보기 개념의
  **연결만** 왜곡한다. (예: '고향 상실'의 준거를 귀향 장면 인용에 붙여 "상실감의 표출"로 설명 —
  실제 장면은 회복의 국면)
- CONCEPT_SWAP: <보기>의 개념 A가 적용될 자리에 개념 B를 적용. (예: 보기의 '자연 친화'와 '현실 도피'
  중, 자연 묘사 구절에 '현실 도피'를 오귀속)
- POLARITY_FLIP: 극성 반전 — 긍정적 형상화를 부정적으로, 비판을 옹호로. (예: 풍자 대상에 대한
  '연민의 시선'이라고 서술)
- EXTERNAL_CRITERION: <보기>에 없는 준거의 무단 도입. (예: 보기는 작가론만 제시했는데 "당대 검열을
  피하기 위한 상징"이라는 시대 배경 준거를 끌어옴)
왜곡은 **정확히 한 지점**이어야 한다. 인용 자체를 틀리게 하거나(존재하지 않는 구절) 두 요소를 동시에
비틀면 난도가 무너진다 — 인용은 정답 선지에서도 항상 정확해야 한다.

**참 선지 4개 구성**:
- 각 선지는 서로 다른 인용 + 서로 다른(또는 결합된) 보기 준거로, <보기>-지문 정합이 명백하게.
- 참 선지끼리 해석 층위(소재 상징·인물 태도·구조·주제)를 분산시켜 특정 준거 편중을 피하라.

**마커 결합형일 때 (markers 동봉)**:
- 지문의 구절 5곳에 ㉠~㉤(구절·문장)을 등장 순서대로 마킹하고, 각 선지는 마커 1개 이상을 라벨로
  지시하며 <보기> 준거와 연결하라. 이 변형에서도 작은따옴표 인용·보기 어휘·~군 종결 3요소는 동일하게 지켜라.

**근거앵커(evidence) 작성**:
- 참 선지: relation=SUPPORTS + 선지가 인용·해석한 지문 구절(인용부와 그 주변 문맥).
- 왜곡 선지: LINK_DISTORTION·CONCEPT_SWAP·POLARITY_FLIP → relation=DISTORTS + 왜곡 판정의 기준이
  되는 지문 구절. EXTERNAL_CRITERION → relation=NOT_MENTIONED + 가장 가까운 관련 구절.
- <보기> 준거 문장 자체를 근거로 쓸 때는 spanText 를 <보기> 원문 그대로 복사하라.

**금지**:
- <보기> 없이 지문 문면만으로 정오가 갈리는 선지 (외적 준거 유형의 자기부정).
- 작은따옴표 인용이 없는 선지, 지문에 없는 구절의 인용, 요약·짜깁기 인용.
- 두 개 이상의 선지가 같은 이유로 틀리는 구성, 왜곡 지점이 두 군데 이상인 정답 선지.
- <보기>에 지문 문장 복사(정답 누출), 상호 모순되는 준거, 검증 불가능한 일반론 준거.
- 자습서식 고정 해석의 무근거 단정 — 모든 해석은 <보기> 준거로 소급 가능해야 한다.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const anchor = settings.bogiAnchor;
  if (anchor === "AUTHOR") {
    lines.push("- <보기> 준거 축: 작가론(작가의 생애·창작 경향·작품 세계) 중심으로 설계하라.");
  } else if (anchor === "HISTORY") {
    lines.push("- <보기> 준거 축: 문학사·갈래 이론(사조·갈래 관습·시대별 경향) 중심으로 설계하라.");
  } else if (anchor === "BACKGROUND") {
    lines.push("- <보기> 준거 축: 창작·시대 배경(역사·사회적 맥락) 중심으로 설계하라.");
  } else if (anchor === "CRITICISM") {
    lines.push("- <보기> 준거 축: 비평 개념(해석 도구가 되는 이론 개념의 정의+적용) 중심으로 설계하라.");
  } else {
    lines.push("- <보기> 준거 축은 지문 특성에 맞게 선택하라 (작가론/문학사/창작 배경/비평 개념).");
  }
  if (settings.variant === "MARKER_COMBINED") {
    lines.push(
      "- 마커 결합형으로 출제하라: 지문 구절 5곳에 ㉠~㉤ 마킹(markers 5개), 발문은 \"<보기>를 참고하여 ㉠~㉤을 이해한 내용으로 적절하지 않은 것은?\", 각 선지는 마커 라벨을 지시.",
    );
  } else {
    lines.push("- 표준형으로 출제하라 (마커 없이 각 선지가 지문 구절을 작은따옴표로 직접 인용).");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: <보기>는 수업·자습서에서 공유되는 공인 해석(작품 해설의 요지)을 준거로 재구성하고, 인용 구절은 수업에서 강조될 법한 핵심부를 우선하라. 단 해석 암기만으로 풀리지 않게 왜곡 지점은 '연결'에 두어라. 필요시 참 선지 1개는 <보기>가 언급한 외부 작품·갈래 관습과의 비교 진술로 확장해도 좋다.",
    );
  } else {
    lines.push(
      "- 수능 모드: <보기>는 이 문항을 위해 신규 집필된 외적 준거여야 하며(기성 해설 복사 금지), 배경지식 없이 <보기> 문면만으로 준거가 완결되게 하라. 3점 킬러 슬롯 — 전 선지 전수 검증을 강제하는 밀도로.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 헬퍼 — <보기> 준거 어휘 추출 (조사 박리 + 초일반어 제외, 결정론)
// ---------------------------------------------------------------------------

const TRAILING_JOSA_RE =
  /(에서의|으로써|이라는|이라고|에서는|에게서|으로는|으로도|까지도|라는|라고|에서|에게|께서|보다|처럼|까지|부터|조차|마저|과의|와의|으로|로서|로써|이며|이고|하며|하고|하는|되는|이다|한다|와|과|은|는|이|가|을|를|의|에|도|만|로|며|다)$/;

const BOGI_STOPWORDS = new Set([
  "있다", "없다", "것이", "것은", "것을", "그것", "이것", "저것", "때문", "경우", "이후", "이전",
  "통해", "위해", "대해", "대한", "가장", "매우", "여러", "다른", "같은", "모든", "바로", "다시",
  "그리고", "그러나", "하지만", "또한", "이러한", "그런데", "따라서", "그래서", "한편",
  "작품", "작가", "시인", "화자", "인물", "독자", "지문", "윗글", "보기",
]);

/** <보기> 행들에서 판정용 준거 어휘(2자 이상 한글 어간)를 결정론 추출한다. */
function extractBogiKeywords(bogiLines: string[]): string[] {
  const keys = new Set<string>();
  for (const line of bogiLines) {
    // 한글 연속열만 어절 후보로 (라벨 "ㄱ."·화자 "선생님:"·문장부호 배제)
    const tokens = line.match(/[가-힣]{2,}/g) ?? [];
    for (const token of tokens) {
      const candidates = new Set<string>([token]);
      const stripped = token.replace(TRAILING_JOSA_RE, "");
      if (stripped.length >= 2) candidates.add(stripped);
      for (const c of candidates) {
        if (c.length >= 2 && !BOGI_STOPWORDS.has(c)) keys.add(c);
      }
    }
  }
  return [...keys];
}

function readBogiLines(question: Record<string, unknown>): string[] {
  if (!question.bogi || typeof question.bogi !== "object") return [];
  const lines = (question.bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];

  // ── 발문: 부정발문 고정 + 외적 준거 프레임 지시 ─────────────────────────
  // 문학 3점 <보기>형은 2025·2026 수능 전수에서 부정발문 (카탈로그 실측).
  if (direction && !ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "<보기> 외적 준거 감상은 부정발문('~감상한 내용으로 적절하지 않은 것은?') 고정 유형입니다",
    );
  }
  if (direction && !/(보기|선생님|학습\s*활동)/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 <보기>(또는 '선생님의 설명'/'학습 활동') 준거를 지시하지 않습니다: "${direction.slice(0, 40)}"`,
    );
  }

  // ── 선지 3요소 ①: 작은따옴표 '지문 직접 인용' 존재 강제 (4자 이상) ──────
  // 공통 게이트는 '있는 인용의 verbatim'만 검사한다 — 여기서 존재 자체와
  // '지문(보기 아님) 인용'임을 강제해 결합 시 최엄격 게이트가 된다.
  for (const o of options) {
    const label = typeof o.label === "string" ? o.label : "";
    const text = typeof o.text === "string" ? o.text : "";
    if (!text) continue;
    const quotes = ctx.koText.extractQuotedSpansKo(text).filter((q) => q.length >= 4);
    if (quotes.length === 0) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `${label} 선지에 작은따옴표 지문 인용(4자 이상)이 없습니다 — 선지 3요소('지문 직접 인용'+보기 개념 연결+~군) 위반`,
      );
      continue;
    }
    if (!quotes.some((q) => ctx.koText.containsSpanKo(ctx.passage, q))) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `${label} 선지의 인용('${quotes[0].slice(0, 20)}…')이 지문에 없습니다 — <보기>가 아닌 지문 구절을 verbatim 인용해야 합니다`,
      );
    }
  }

  // ── 선지 3요소 ②: 각 선지에 <보기> 준거 어휘 1개 이상 ──────────────────
  const bogiLines = readBogiLines(question);
  if (bogiLines.length > 0) {
    const keywords = extractBogiKeywords(bogiLines);
    if (keywords.length > 0) {
      for (const o of options) {
        const label = typeof o.label === "string" ? o.label : "";
        const text = typeof o.text === "string" ? o.text : "";
        if (!text) continue;
        if (!keywords.some((k) => text.includes(k))) {
          add(
            "error",
            "ko-bogi-missing",
            `${label} 선지에 <보기> 준거 어휘가 하나도 없습니다 — 인용을 <보기> 개념과 연결하는 해석 진술이어야 합니다`,
          );
        }
      }
    }
  }

  // ── 극성-근거관계 정합 (부정발문 고정: 정답=왜곡, 나머지=SUPPORTS) ──────
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
    if (isCorrect && ![...relations].some((r) => distortRelations.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 정답(왜곡) 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다`,
      );
    }
    if (!isCorrect && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 참 선지인데 SUPPORTS 근거가 없습니다 — <보기>-지문 정합의 근거를 앵커하세요`,
      );
    }
  }

  // ── 마커 결합형 정합 (markers 동봉 시) ──────────────────────────────────
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  const markerLabels = markers
    .map((m) => (typeof m.label === "string" ? m.label : ""))
    .filter(Boolean);
  if (markerLabels.length > 0) {
    if (direction && !markerLabels.some((l) => direction.includes(l))) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커 결합형(마커 ${markerLabels.length}개)인데 발문이 마커(${markerLabels[0]}~)를 지시하지 않습니다`,
      );
    }
    // 선지-마커 대응은 순서 무관 검사 (이 유형은 정답 위치 셔플 대상이므로 1:1 순서 강제 금지)
    for (const o of options) {
      const label = typeof o.label === "string" ? o.label : "";
      const text = typeof o.text === "string" ? o.text : "";
      if (!text) continue;
      if (!markerLabels.some((l) => text.includes(l))) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지가 마커(${markerLabels.join(" ")})를 하나도 지시하지 않습니다 — 마커 결합형 위반`,
        );
      }
    }
  }

  // ── 배점 상궤: 3점 킬러 슬롯 ────────────────────────────────────────────
  const points = typeof question.points === "number" ? question.points : 3;
  if (points !== 3) {
    add(
      "warning",
      "ko-points-unusual",
      `문학 <보기> 외적 준거 감상은 3점 킬러 슬롯 관행입니다 (현재 ${points}점)`,
    );
  }

  return issues;
}

export const KO_LIT_BOGI: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_BOGI",
    area: "LITERATURE",
    label: "〈보기〉 외적 준거 감상",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: [
      "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_ESSAY", "LIT_PLAY", "MIXED",
    ],
    defaultPoints: 3,
    usesBogi: "required",
    markerFamilies: ["KOR_CIRCLED", "LATIN_CIRCLED"],
    optionEnding: "appreciation",
    needsSolverGate: true,
    description:
      "작가론·문학사·창작 배경·비평 개념의 <보기>를 해석 틀로 고정하고, '지문 직접 인용+보기 개념 연결+~군' 3요소 선지의 정합을 판정하는 문학 3점 킬러 유형",
    setSlot:
      "문학 세트당 정확히 1개의 3점 킬러 슬롯 — 4문항 세트는 마지막, 갈래복합 세트는 중간 배치 가능 (문학 3점 4개 전부 이 계열)",
    studentTask:
      "<보기>의 외적 준거를 해석 틀로 삼아, 지문 인용과 보기 개념의 연결이 왜곡된 감상 하나를 고릅니다.",
    bestFor: [
      "작가·시대 맥락이 뚜렷한 현대시·현대소설",
      "갈래 관습이 판정 준거가 되는 고전시가·고전소설",
      "비평 개념 적용 훈련이 필요한 상위권 변별",
    ],
    outputUi: ["지문 동봉", "〈보기〉 준거 박스", "5지선다(~군 감상형)", "선지별 보기-지문 정합 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "bogiAnchor",
        label: "<보기> 준거 축",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 특성)" },
          { value: "AUTHOR", label: "작가론(생애·작품 세계)" },
          { value: "HISTORY", label: "문학사·갈래 이론" },
          { value: "BACKGROUND", label: "창작·시대 배경" },
          { value: "CRITICISM", label: "비평 개념" },
        ],
        defaultValue: "AUTO",
        description: "선지 성립·배제의 기준이 되는 외적 준거의 종류",
      },
      {
        key: "variant",
        label: "출제 형태",
        kind: "select",
        options: [
          { value: "STANDARD", label: "표준(윗글 감상)" },
          { value: "MARKER_COMBINED", label: "마커 결합형(㉠~㉤ 이해)" },
        ],
        defaultValue: "STANDARD",
        description: "마커 결합형은 지문에 ㉠~㉤을 마킹하고 선지가 마커를 지시합니다 (2026 수능 30번형)",
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
      defaultPoints: 3,
    });
  },
  difficultyGuide: {
    BASIC:
      "<보기>는 준거 개념 2개의 평이한 배경 설명으로. 왜곡은 POLARITY_FLIP(극성 반전)처럼 <보기> 한 문장과의 정면 대조로 즉시 판정되게 하라. 인용 구절은 지문의 명시적 국면에서.",
    INTERMEDIATE:
      "<보기>에 준거 개념 2~3개를 심고 왜곡은 CONCEPT_SWAP(개념 오귀속) 위주로 — 판정에 <보기> 두 문장의 구분 적용이 필요하게 하라. 참 선지 중 1개는 보기 개념 2개를 결합한 진술로.",
    KILLER:
      "왜곡은 LINK_DISTORTION '절반 참' 설계로: 인용도 보기 어휘도 전부 정확하고 오직 연결 논리만 한 끗 왜곡하라(해당 국면의 서사·시상 단계를 <보기> 준거의 다른 국면에 접합). 참 선지들도 인용-준거 대응을 표면 어휘가 아닌 맥락 종합으로 구성해 전 선지 전수 검증을 강제하라. 2026 수능 12번형 긍정 전환은 금지 — 부정발문 유지가 이 유형의 관행이다.",
  },
};
