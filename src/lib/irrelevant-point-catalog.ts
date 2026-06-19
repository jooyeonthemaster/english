// ============================================================================
// 무관 문장 출제 포인트 카탈로그 — LLM 검증 무관성(irrelevance) 분류축 런타임 증류본
//
// 출처: EBSi 기출 무관문장 327문항(고1/2/3, 2011~2026) 중 227문항을 LLM으로 전수
// 분류한 검증 결과(2026-06-18). 산출물 =
// scripts/_gen_audit_out/irrelevant-sentence-extraction/_p0_llm_labels.jsonl ·
// _p0_taxonomy_summary.json.
//
// ⚠️ 휴리스틱(표면 키워드) 분류는 LLM과 일치율 50.2%로 약하다 — 단순
// topic_intrusion 외에 scope_shift / causal_mismatch / contrast_misuse /
// conclusion_mismatch 가 의미 기준으로 분리됐다. 따라서 표면 분포 대신 이 LLM 검증
// 분포를 focus 근거로 쓴다.
//
// 빈칸 blank-point-catalog · 문장삽입 sentence-insert-point-catalog 의 무관문장판.
// 단 무관문장 focus 는 "삽입할 무관 문장이 어떤 식으로 무관해지는지(무관성 유형)"를
// 고빈출 코어로 좁히는 것이다. 코어(주제 침입·범위 이탈)는 어휘는 인접 문장과
// 겹쳐(위장) 표면상 자연스럽되, 글의 주제/논지 범위에서 벗어나 정확히 한 자리에서만
// 흐름이 끊기는 — 실제 기출에서 가장 많고 가장 깨끗한 오답 문장 설계를 유도한다.
// ============================================================================

export type IrrelevantPointCode =
  | "topic_intrusion"
  | "scope_shift"
  | "contrast_misuse"
  | "causal_mismatch"
  | "conclusion_mismatch";

export interface IrrelevantPointInfo {
  code: IrrelevantPointCode;
  /** 한글 이름 */
  name: string;
  /** LLM 검증 빈도 순위(1=최빈출) */
  rank: number;
  /** 검증 분포 점유율(%) — n=227 */
  share: number;
  /** core=focus 코어 / secondary=보조 focus / rare=저빈출(코어 제외) */
  tier: "core" | "secondary" | "rare";
  /** 무관 문장이 무관해지는 방식의 정의 */
  definition: string;
  /** 무관 문장을 이 유형으로 설계하는 단서 (프롬프트 주입용 1줄) */
  signal: string;
}

export const IRRELEVANT_POINT_CATALOG: Record<
  IrrelevantPointCode,
  IrrelevantPointInfo
> = {
  topic_intrusion: {
    code: "topic_intrusion",
    name: "주제 침입",
    rank: 1,
    share: 63,
    tier: "core",
    definition:
      "삽입 문장이 글 전체의 주제/소재와 다른 화제를 끌어들여, 앞뒤 어느 문장의 논지와도 이어지지 않는다. 기출 최빈출(63%).",
    signal:
      "글의 핵심 소재와 '다른 화제'를 도입하되, 인접 문장의 내용어 3~4개(같은 분야 어휘)는 재사용해 표면상 자연스럽게 위장하라. 예: 정신건강 효과를 다루는 글에 '소셜미디어를 구매 결정 정보 수집에 쓴다'는 소비행동 문장. 어휘는 겹쳐도 다루는 화제가 글의 주제 밖이라 흐름이 끊겨야 한다.",
  },
  scope_shift: {
    code: "scope_shift",
    name: "범위 이탈",
    rank: 2,
    share: 20.3,
    tier: "core",
    definition:
      "삽입 문장이 같은 소재를 다루되 글이 논증하는 '특정 측면/범위'를 벗어난 다른 측면을 평가·서술해 논지 범위를 이탈한다. 2위(20.3%).",
    signal:
      "글의 소재는 유지하되 글이 다루는 '논점(측면)'과 다른 측면으로 옮겨가라. 예: 인쇄술의 '표준화·정확성'을 논증하는 글에서 어떤 저자의 '관찰력·독창성 부족'을 평가하는 문장 — 소재(그 인물/대상)는 같지만 평가 측면이 글의 범위 밖. 인접 문장은 본래 측면을 일관되게 유지하게 하라.",
  },
  contrast_misuse: {
    code: "contrast_misuse",
    name: "대조 오용",
    rank: 3,
    share: 6.2,
    tier: "secondary",
    definition:
      "삽입 문장이 글의 일관된 주장과 정반대의 입장을 펴, 앞뒤 문장의 흐름을 모두 끊는다(진짜 반론이 아니라 논지에 안 맞는 대조). 3위(6.2%).",
    signal:
      "글이 일관되게 옹호하는 주장에 대해 정반대 입장을 한 문장으로 끼워, 앞뒤 문장(같은 주장 전개)과 논리적으로 충돌하게 하라. 단 표면 역접어(However 등)만으로 어설프게 만들지 말 것 — 내용이 실제로 글의 논지와 모순돼야 한다.",
  },
  causal_mismatch: {
    code: "causal_mismatch",
    name: "인과 오류",
    rank: 4,
    share: 5.7,
    tier: "rare",
    definition:
      "삽입 문장이 As a result/Therefore 등 인과 표지로 연결하면서, 앞 문장의 논리적 귀결이 아닌 결론을 도출해 인과 사슬을 왜곡한다. 4위(5.7%).",
    signal:
      "As a result/Therefore 로 앞 문장과 인과를 표방하되, 도출하는 결론이 앞 문장에서 실제로 따라 나오지 않게 하라(거짓 인과). 코어가 안 맞을 때만.",
  },
  conclusion_mismatch: {
    code: "conclusion_mismatch",
    name: "결론 불일치",
    rank: 5,
    share: 4.8,
    tier: "rare",
    definition:
      "삽입 문장이 In other words/Thus 등으로 앞 내용을 재진술·결론짓는 듯하나, 실제로는 상반되거나 따라 나오지 않는 결론을 제시한다. 5위(4.8%).",
    signal:
      "In other words/Thus 로 앞 문장을 결론짓는 척하되, 제시 내용이 앞 문장과 상반되거나 논리적으로 이어지지 않게 하라. 코어가 안 맞을 때만.",
  },
};

/**
 * 핵심 집중(focus) 코어 — LLM 검증 무관성 분포 상위 2(누적 83.3%).
 * 무관문장은 코어 2종(주제 침입·범위 이탈)에 매우 집중되어(83.3%) 코어를 2개로 둔다.
 * 동급 후보로 주입한다 — 어휘는 위장하되 주제/범위가 벗어나 한 자리에서만 끊기는,
 * 기출에서 가장 많고 가장 깨끗한 오답 문장 두 유형.
 */
export const IRRELEVANT_HIGH_YIELD_FOCUS_CODES: IrrelevantPointCode[] = [
  "topic_intrusion",
  "scope_shift",
];

/** 보조 focus — 코어 2 다음 빈출(누적 89.5%). 코어 유형이 안 맞을 때만 허용. */
export const IRRELEVANT_SECONDARY_FOCUS_CODE: IrrelevantPointCode =
  "contrast_misuse";

export interface IrrelevantPointGuidanceOptions {
  /** 다양성: 배치 내 변형 인덱스 — 코어 무관성 유형 회전 지정의 결정형 오프셋 */
  variantIndex?: number;
  /** 핵심 집중 모드 — 무관성 유형을 검증 코어 2(+보조)로 좁힘 */
  pointFocus?: boolean;
  /** 다양성 모드 활성 여부 */
  diversityEnabled?: boolean;
}

/**
 * 무관 문장 출제 포인트 가이드 — pointFocus 일 때만 주입.
 * - 삽입 무관 문장의 '무관성 유형'을 검증 코어 2(주제 침입·범위 이탈, +보조 대조 오용)로 좁힌다.
 * - diversityEnabled 면 variantIndex 로 1순위 코어 유형을 회전 지정(병렬 배치 분산).
 * pointFocus 미지정이면 "" 반환 → 기존(비-focus) 동작 불변.
 */
export function buildIrrelevantPointGuidance(
  options: IrrelevantPointGuidanceOptions = {},
): string {
  const { variantIndex, pointFocus = false, diversityEnabled = false } = options;
  if (!pointFocus) return "";

  const coreLine = IRRELEVANT_HIGH_YIELD_FOCUS_CODES.map(
    (code) => `${IRRELEVANT_POINT_CATALOG[code].name}(${code})`,
  ).join(" · ");

  let designatedLine = "";
  if (diversityEnabled) {
    const pool = IRRELEVANT_HIGH_YIELD_FOCUS_CODES;
    const offset =
      typeof variantIndex === "number" && Number.isFinite(variantIndex)
        ? Math.max(0, Math.floor(variantIndex)) % pool.length
        : 0;
    const designated = IRRELEVANT_POINT_CATALOG[pool[offset]];
    designatedLine = `- ⭐ 이번 문항은 되도록 '${designated.name}' 유형으로 무관 문장을 설계하세요 (${designated.signal}). 이 유형이 이 지문에 안 맞으면 코어의 다른 축을 쓰되, 같은 지문으로 여러 문항을 만들 땐 무관성 유형을 코어 안에서 돌려가며 분산하세요.`;
  }

  const secondary = IRRELEVANT_POINT_CATALOG[IRRELEVANT_SECONDARY_FOCUS_CODE];
  return [
    "## 무관 문장 출제 포인트 가이드 (기출 227문항 LLM 검증 무관성 분포 — 핵심 집중 모드)",
    `- ⭐ 삽입할 무관 문장이 '무관해지는 방식'을 다음 고빈출 코어 2종에서 고르세요(동급 후보, 하나로 고정하지 말 것): ${coreLine}. 코어가 정말 안 맞을 때만 보조 '${secondary.name}(${IRRELEVANT_SECONDARY_FOCUS_CODE})'까지 허용. 저빈출 축(인과 오류·결론 불일치)으로 무관성을 만들지 마세요 — 기출에서 위 코어가 대부분(코어 누적 83.3%, +보조 89.5%)입니다.`,
    designatedLine,
    `- ⭐ 핵심 설계 원칙: 무관 문장은 인접 문장의 내용어를 3~4개 재사용해 '어휘는 자연스럽게 위장'하되, 다루는 '화제(주제 침입)'나 '논점 측면(범위 이탈)'이 글에서 벗어나 정확히 한 자리에서만 흐름이 끊기게 하세요. 어휘가 너무 새롭거나(너무 동떨어짐) 표면 단서로 티 나게 무관하면 안 됩니다 — 읽으면 매끄럽지만 논지상 빠져야 하는 문장.`,
    "- 제출 전 자가검증: 무관 문장의 무관성 유형을 한 가지로 라벨링하고, 그 유형이 코어(또는 보조)인지·인접 문장과 어휘가 겹치되 주제/범위가 벗어나는지 확인한 뒤 확정하세요.",
  ]
    .filter(Boolean)
    .join("\n");
}
