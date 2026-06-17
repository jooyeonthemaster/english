// ============================================================================
// 빈칸 추론 출제 포인트 카탈로그 — LLM 검증 정답논리 분류축 런타임 증류본
//
// 출처: EBSi 기출 빈칸추론 717문항(고1/2/3, 2014~2026)을 LLM으로 전수 분류한
// 검증 결과(2026-06-17, 716/717 분류·적대검증 일치율 73.3%). 산출물 =
// scripts/_gen_audit_out/blank-extraction/_p0_llm_labels.jsonl · _p0_taxonomy_summary.json.
//
// ⚠️ 휴리스틱(키워드) 분류는 반증됨: contrast_pivot 68%로 몰빵됐으나 실제 대조전환은
// 14.4%뿐(~4.7배 과대), 실제 톱2·3(개념명명·재진술)은 키워드 분류에 코드 자체가
// 없었다. 따라서 휴리스틱 pointCode 분포 대신 이 LLM 검증 분포를 focus 근거로 쓴다.
//
// 어법 grammar-point-catalog 의 빈칸판. buildGrammarPointGuidance ↔ buildBlankPointGuidance.
// 단 빈칸 focus 는 "정답 문자열"이 아니라 "정답이 빈칸에서 완성하는 추론 논리 축"이라,
// 어법의 "톱셋=정답/나머지=디코이"를 그대로 적용하지 않고 코어를 동급 후보로 주입한다.
// ============================================================================

export type BlankPointCode =
  | "cause_effect_completion"
  | "concept_labeling"
  | "restate_paraphrase"
  | "contrast_reversal"
  | "global_thesis_completion"
  | "discourse_connector"
  | "example_to_principle"
  | "analogy_mapping";

export interface BlankPointInfo {
  code: BlankPointCode;
  /** 한글 이름 */
  name: string;
  /** LLM 검증 빈도 순위(1=최빈출) */
  rank: number;
  /** 검증 분포 점유율(%) — n=716 */
  share: number;
  /** core=focus 코어 / secondary=보조 focus / rare=저빈출(코어 제외) */
  tier: "core" | "secondary" | "rare";
  /** 정답이 빈칸에서 완성하는 논리 정의 */
  definition: string;
  /** 지문/정답에서 이 유형을 식별하는 단서 (프롬프트 주입용 1줄) */
  signal: string;
}

export const BLANK_POINT_CATALOG: Record<BlankPointCode, BlankPointInfo> = {
  cause_effect_completion: {
    code: "cause_effect_completion",
    name: "인과·기제 채우기",
    rank: 1,
    share: 23.7,
    tier: "core",
    definition:
      "인과 사슬(원인·조건↔결과·귀결)에서 빠진 한쪽 항을 채운다. 단일 메커니즘에서 논리적으로 따라 나오는 직접 결과를 추론하거나, 명시된 결과를 낳는 선행 원인·작동 기제를 식별한다.",
    signal:
      "Thus/Therefore/As a result/because/so/this leads to/this in turn/depends on 같은 인과 표지, 또는 'A can help overcome ___'·'the price we pay for ___'. 여러 사례 귀납이 아니라 단일 기제의 직접 귀결이 단서.",
  },
  concept_labeling: {
    code: "concept_labeling",
    name: "추상 개념 명명",
    rank: 2,
    share: 20.1,
    tier: "core",
    definition:
      "지문이 어떤 현상·동기·반응을 구체적 정황으로 묘사만 하고, 빈칸은 그 정황을 부르는 상위 추상명사(카테고리)를 채운다. 구체 묘사→상위 명사의 수직 추상화. 행위·도구의 상위 목적·기능 명명도 포함.",
    signal:
      "보기가 단일 추상명사·명사구 위주(group identity, simplicity 등), 빈칸이 'badge of ___'·'craving for ___'·'tools for ___'·'in order to ___' 같은 명사·목적 자리, 본문은 그 개념의 사례·증상만 나열.",
  },
  restate_paraphrase: {
    code: "restate_paraphrase",
    name: "재진술·정의 환언",
    rank: 3,
    share: 16.8,
    tier: "core",
    definition:
      "빈칸이 직전/직후에 이미 진술된 내용(또는 대상의 본질·정의)을 방향 전환·새 정보 추가 없이 동의적으로 압축·환언한 표현을 채운다. 바로 옆에 답이 풀려 있는 '같은 것의 다른 표현' 동치 매칭.",
    signal:
      "빈칸 직전/직후 'In other words/That is/즉/동격 콜론(:)'으로 동일 내용 재진술, 또는 'X is/means ___' 계사 정의문이고 앞 단락이 그 대상을 길게 묘사. 빈칸 표현과 본문 표현이 의미상 1:1 대응.",
  },
  contrast_reversal: {
    code: "contrast_reversal",
    name: "대조 전환 반대개념",
    rank: 4,
    share: 14.4,
    tier: "core",
    definition:
      "빈칸 지점에 실제 방향 전환 신호가 있어, 앞서 제시·부정된 개념이나 통념의 '반대극'을 채워야 완성된다. 'X처럼 보이지만 실은 not-X', 'not A but B', 상충(tradeoff) 구조가 전형.",
    signal:
      "빈칸 직전/직후 but/however/yet/instead/rather/in contrast/in reality/not A but B 가 실제로 있고 의미가 정반대로 갈림. ⚠️ 역접 표지와 의미 반전이 동시에 있을 때만 — 표지만 멀리 있고 빈칸 자리는 동치/인과면 대조 아님(휴리스틱 과대계상 주의).",
  },
  global_thesis_completion: {
    code: "global_thesis_completion",
    name: "전체 주제문 완성",
    rank: 5,
    share: 11.9,
    tier: "secondary",
    definition:
      "빈칸이 지문 전체가 누적적으로 입증하는 핵심 주장(요지)을 직접 채운다. 특정 한두 문장 단서가 아니라 글 전체 논지를 종합해야 풀린다. 보통 서두 두괄식 또는 말미 결론 위치.",
    signal:
      "빈칸이 글 첫 문장 또는 결론 위치이고 본문 전체가 그것의 근거·부연. 'The implication is clear/no wonder/in general' 같은 전역 수렴 신호. 특정 인접 문장만으로는 답이 좁혀지지 않음.",
  },
  discourse_connector: {
    code: "discourse_connector",
    name: "담화 연결어 추론",
    rank: 6,
    share: 5.9,
    tier: "rare",
    definition:
      "빈칸이 내용어가 아니라 (A)/(B) 형태로 문장·단락을 잇는 연결표현을 고르거나, 두 항이 서로/사례와 맺는 의미 관계를 동시에 만족시키는 이항 정합 문항. 채우는 것이 '개념'이 아니라 '관계'.",
    signal:
      "발문이 '(A), (B)에 들어갈 말'이고 보기가 however/for example/as a result/in other words 연결어 조합, 또는 (A)/(B) 내용어 쌍이 상호·사례와 의미 정합 요구.",
  },
  example_to_principle: {
    code: "example_to_principle",
    name: "예시→원리 일반화",
    rank: 7,
    share: 5.2,
    tier: "rare",
    definition:
      "둘 이상의 구체 사례·실험·일화를 제시하고, 빈칸은 그 사례들이 공통으로 입증하는 일반 명제(원리·법칙·연구 결론)를 채운다. 개별 데이터에서 공통 패턴을 추상화하는 귀납.",
    signal:
      "빈칸 앞뒤에 'For example/For instance/In a study/researchers found'로 사례가 2개 이상 병렬되며 모두 같은 결론을 향함. 빈칸이 사례를 도입·총괄하는 명제 위치.",
  },
  analogy_mapping: {
    code: "analogy_mapping",
    name: "유추 대응 사상",
    rank: 8,
    share: 2.1,
    tier: "rare",
    definition:
      "지문이 명시적 비유(A는 B와 같다)를 세우고, 빈칸은 한쪽 영역의 요소를 다른 영역의 대응 요소로 사상하거나 비유가 함의하는 속성을 채운다. 두 영역 간 구조적 대응이 단서.",
    signal:
      "compare to/similarly/just as/like the ~/analogous 같은 명시적 비유 표지, 빈칸이 'Similarly, ___' 위치에서 비유의 다른 항을 요구, 두 영역이 평행 서술.",
  },
};

/**
 * 핵심 집중(focus) 코어 — LLM 검증 정답논리 분포 상위 4(누적 75%).
 * 어법 GRAMMAR_HIGH_YIELD_FOCUS_CODES 의 빈칸판. 단 "톱셋=정답"이 아니라 코어를
 * 동급 후보로 주입한다(일치율 73.3%·concept↔restate 경계 모호 → 정답 단일화 금지).
 */
export const BLANK_HIGH_YIELD_FOCUS_CODES: BlankPointCode[] = [
  "cause_effect_completion",
  "concept_labeling",
  "restate_paraphrase",
  "contrast_reversal",
];

/** 보조 focus — 코어 4 다음 빈출(누적 87%). 코어 자리가 없을 때 허용. */
export const BLANK_SECONDARY_FOCUS_CODE: BlankPointCode = "global_thesis_completion";

export interface BlankPointGuidanceOptions {
  /** 다양성: 배치 내 변형 인덱스 — 코어 정답논리 축 회전 지정의 결정형 오프셋 */
  variantIndex?: number;
  /** 핵심 집중 모드 — 정답논리를 검증 코어 4(+보조)로 좁힘 */
  pointFocus?: boolean;
  /** 다양성 모드 활성 여부 */
  diversityEnabled?: boolean;
}

/**
 * 빈칸 출제 포인트 가이드 — pointFocus 일 때만 candidate block 에 주입.
 * - 정답논리를 검증 코어 4(+보조 global_thesis)로 좁힌다.
 * - diversityEnabled 면 variantIndex 로 1순위 코어 논리축을 회전 지정(병렬 배치 분산).
 * - concept_labeling ↔ restate_paraphrase 변별 시그널을 대비 명시(검증 최모호축).
 * pointFocus 미지정이면 "" 반환 → 기존(비-focus) 동작 불변.
 */
export function buildBlankPointGuidance(options: BlankPointGuidanceOptions = {}): string {
  const { variantIndex, pointFocus = false, diversityEnabled = false } = options;
  if (!pointFocus) return "";

  const coreLine = BLANK_HIGH_YIELD_FOCUS_CODES.map(
    (code) => `${BLANK_POINT_CATALOG[code].name}(${code})`,
  ).join(" · ");

  let designatedLine = "";
  if (diversityEnabled) {
    const pool = BLANK_HIGH_YIELD_FOCUS_CODES;
    const offset =
      typeof variantIndex === "number" && Number.isFinite(variantIndex)
        ? Math.max(0, Math.floor(variantIndex)) % pool.length
        : 0;
    const designated = BLANK_POINT_CATALOG[pool[offset]];
    designatedLine = `- ⭐ 이번 문항은 되도록 '${designated.name}' 논리를 정답축으로 출제하세요 (${designated.signal}). 그 논리가 이 지문에 없으면 코어의 다른 축을 쓰되, 같은 지문으로 여러 문항을 만들 땐 정답 논리축을 코어 안에서 돌려가며 분산하세요.`;
  }

  const secondary = BLANK_POINT_CATALOG[BLANK_SECONDARY_FOCUS_CODE];
  return [
    "## 빈칸 출제 포인트 가이드 (기출 716문항 LLM 검증 정답논리 분포 — 핵심 집중 모드)",
    `- ⭐ 정답이 빈칸에서 완성하는 '추론 논리'를 다음 고빈출 코어 4종에서만 고르세요(동급 후보, 특정 하나로 고정하지 말 것): ${coreLine}. 코어 자리가 정말 없을 때만 보조 '${secondary.name}(${BLANK_SECONDARY_FOCUS_CODE})'까지 허용. 저빈출 축(예시→원리·담화연결어·유추)으로 변별을 시도하지 마세요 — 기출에서 위 코어가 출제의 대부분(누적 87%)입니다.`,
    designatedLine,
    `- ⚠️ '${BLANK_POINT_CATALOG.concept_labeling.name}'과 '${BLANK_POINT_CATALOG.restate_paraphrase.name}'은 가장 혼동되기 쉬우니 구분해 설계하세요: 재진술=빈칸 옆에 동의 표현이 이미 풀려 있는 '문장 단위 동치'(In other words/즉/동격 콜론). 개념명명=본문이 구체 정황만 묘사하고 빈칸이 그것의 '상위 추상명사'를 채우는 수직 추상화(보기가 단일 추상명사).`,
    "- 빈칸 위치와 정답을 함께 보고 정답이 위 논리로 도출되는지 자기검증하세요. 코어 논리 축을 우선 적용하되 코어 내부에서 정답을 하나로 단일화하지 마세요.",
  ]
    .filter(Boolean)
    .join("\n");
}
