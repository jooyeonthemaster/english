// ============================================================================
// 글의 순서 출제 포인트 카탈로그 — LLM 검증 응집장치(cohesion) 분류축 런타임 증류본
//
// 출처: EBSi 기출 글의순서 550문항(고1/2/3, 2011~2026)을 LLM으로 전수 분류한
// 검증 결과(2026-06-19). 산출물 = sentence-order P0 라벨링 워크플로(n=550).
// 분포: temporal_sequence 42.9% · anaphora_reference 24% · contrast_reversal 15.5%
//       · example_elaboration 9.3% · cause_effect 4.2% · addition_extension 3.3%
//       · coherence_bridge 0.9%.
//
// ⚠️ 기존 추출의 pointCode는 표면 휴리스틱이라 신뢰하지 않는다(코퍼스 리포트도
// "later LLM P0 pass should relabel"라 명시). 이 LLM 검증 분포를 focus 근거로 쓴다.
//
// 빈칸 blank-point-catalog · 문장삽입 sentence-insert-point-catalog 의 글의순서판.
// 문장삽입과 형제 과제(둘 다 응집장치로 순서를 고정)라 같은 7코드 taxonomy를 쓴다.
// 단 글의순서는 1위가 '시간·서사 순서(temporal_sequence)'로, 코어가 3종(82.4%).
// focus 는 "각 단락 연결이 고빈출 응집장치로 '유일하게' 결정되게(정답 순서 복수화
// 방지)" 설계를 유도한다.
// ============================================================================

export type SentenceOrderPointCode =
  | "temporal_sequence"
  | "anaphora_reference"
  | "contrast_reversal"
  | "example_elaboration"
  | "cause_effect"
  | "addition_extension"
  | "coherence_bridge";

export interface SentenceOrderPointInfo {
  code: SentenceOrderPointCode;
  name: string;
  rank: number;
  share: number;
  tier: "core" | "secondary" | "rare";
  definition: string;
  signal: string;
}

export const SENTENCE_ORDER_POINT_CATALOG: Record<
  SentenceOrderPointCode,
  SentenceOrderPointInfo
> = {
  temporal_sequence: {
    code: "temporal_sequence",
    name: "시간·서사 순서",
    rank: 1,
    share: 42.9,
    tier: "core",
    definition:
      "단락들이 시간·절차·서사 진행상 한 단계씩이어서, 앞 단계 → 뒤 단계 순서가 한 배열에서만 맞는다. 글의순서 최빈출(42.9%).",
    signal:
      "각 단락이 사건·절차·이야기의 다음 단계를 이어받게 분할하라(then/next/after/before/later/finally, 또는 서사적 사건 진행). 단락 첫머리의 시간 표지·사건 전개가 직전 단락의 끝을 받아야 하고, 다른 배열에서는 시간 순서가 깨지게 하라.",
  },
  anaphora_reference: {
    code: "anaphora_reference",
    name: "참조 해소",
    rank: 2,
    share: 24,
    tier: "core",
    definition:
      "한 단락이 지시사·대명사·정관사구(this/these/such/the+명사/it/they)로 시작해 그 선행어가 직전 단락에만 존재 → 참조 해소가 연결을 고정한다. 2위(24%).",
    signal:
      "단락 첫머리에 역참조 표현을 두고, 그 선행어(명사구)가 오직 직전 단락 끝에서만 도입되게 분할하라. 다른 단락 뒤에 붙이면 선행어가 없어 참조가 떠야 한다. 예: 'These findings ~', 'Such a system ~', 'This is why ~'.",
  },
  contrast_reversal: {
    code: "contrast_reversal",
    name: "대조 전환",
    rank: 3,
    share: 15.5,
    tier: "core",
    definition:
      "한 단락이 앞 단락의 방향을 뒤집는 의미 반전(however/but/instead/on the other hand/not A but B)이라, 앞 주장과 반대 전개 사이에서만 자연스럽다. 3위(15.5%).",
    signal:
      "한 단락을 역접·반전으로 시작하되 표지뿐 아니라 내용이 직전 단락과 정반대로 갈리게 하라. ⚠️ 표면 however 만 있고 실제 연결 단서가 지시어면 그건 참조 해소다(혼동 주의 — 진짜 반전일 때만 대조).",
  },
  example_elaboration: {
    code: "example_elaboration",
    name: "예시·구체화",
    rank: 4,
    share: 9.3,
    tier: "secondary",
    definition:
      "한 단락이 앞 단락의 일반 진술을 구체 예시·사례로 받쳐, 일반→예시 순서가 한 배열에서만 맞는다. 4위(9.3%).",
    signal:
      "For example/For instance/In one study 로 직전 단락의 일반 명제를 사례로 구체화하라. 그 일반 명제가 예시 단락 바로 앞에 있어야 한다.",
  },
  cause_effect: {
    code: "cause_effect",
    name: "인과·결과 고리",
    rank: 5,
    share: 4.2,
    tier: "rare",
    definition:
      "한 단락이 앞 단락(원인)의 결과·귀결이거나 뒤 결과의 원인을 제공해 인과 사슬이 한 배열에서만 이어진다. 5위(4.2%).",
    signal:
      "Therefore/Thus/As a result/Because/So 로 직전 단락과 인과로 묶되, 원인(또는 결과)이 직전(또는 직후) 단락에만 존재하게 하라. 코어가 안 맞을 때만.",
  },
  addition_extension: {
    code: "addition_extension",
    name: "첨가·심화 확장",
    rank: 6,
    share: 3.3,
    tier: "rare",
    definition:
      "한 단락이 앞과 같은 방향의 정보를 첨가·심화(also/moreover/furthermore)해 동질 정보가 이어지는 자리. 6위(3.3%).",
    signal:
      "Moreover/In addition/Furthermore 로 앞 단락의 논점을 한 단계 더한다. 코어가 안 맞을 때만.",
  },
  coherence_bridge: {
    code: "coherence_bridge",
    name: "담화 연속(표지 없음)",
    rank: 7,
    share: 0.9,
    tier: "rare",
    definition:
      "명시 연결어 없이 화제·논지 연속만으로 순서가 정해지는 경우. 표층 단서가 약해 정답이 흔들리기 쉽다. 7위(0.9%).",
    signal:
      "명시 연결어 없이 화제 연속으로만 잇는 방식. 표면 단서가 약해 정답 복수화 위험이 크니 코어(시간순서·참조·대조)가 정말 안 될 때만 쓰라.",
  },
};

/**
 * 핵심 집중(focus) 코어 — LLM 검증 응집장치 분포 상위 3(누적 82.4%).
 * 글의순서는 1위 temporal_sequence(42.9%)가 단독으로 크고 코어 3종에 집중되어,
 * 코어를 3개로 둔다. 동급 후보로 주입한다 — 정답 순서를 유일하게 고정하는 장치들.
 */
export const SENTENCE_ORDER_HIGH_YIELD_FOCUS_CODES: SentenceOrderPointCode[] = [
  "temporal_sequence",
  "anaphora_reference",
  "contrast_reversal",
];

/** 보조 focus — 코어 3 다음 빈출(누적 91.7%). 코어 장치가 안 맞을 때만 허용. */
export const SENTENCE_ORDER_SECONDARY_FOCUS_CODE: SentenceOrderPointCode =
  "example_elaboration";

export interface SentenceOrderPointGuidanceOptions {
  /** 다양성: 배치 내 변형 인덱스 — 코어 응집장치 축 회전 지정의 결정형 오프셋 */
  variantIndex?: number;
  /** 핵심 집중 모드 — 응집장치를 검증 코어 3(+보조)로 좁힘 */
  pointFocus?: boolean;
  /** 다양성 모드 활성 여부 */
  diversityEnabled?: boolean;
}

/**
 * 글의 순서 출제 포인트 가이드 — pointFocus 일 때만 주입.
 * - 단락 연결을 고정하는 응집장치를 검증 코어 3(시간순서·참조·대조, +보조 예시)로 좁힌다.
 * - diversityEnabled 면 variantIndex 로 1순위 코어 장치를 회전 지정(병렬 배치 분산).
 * pointFocus 미지정이면 "" 반환 → 기존(비-focus) 동작 불변.
 */
export function buildSentenceOrderPointGuidance(
  options: SentenceOrderPointGuidanceOptions = {},
): string {
  const { variantIndex, pointFocus = false, diversityEnabled = false } = options;
  if (!pointFocus) return "";

  const coreLine = SENTENCE_ORDER_HIGH_YIELD_FOCUS_CODES.map(
    (code) => `${SENTENCE_ORDER_POINT_CATALOG[code].name}(${code})`,
  ).join(" · ");

  let designatedLine = "";
  if (diversityEnabled) {
    const pool = SENTENCE_ORDER_HIGH_YIELD_FOCUS_CODES;
    const offset =
      typeof variantIndex === "number" && Number.isFinite(variantIndex)
        ? Math.max(0, Math.floor(variantIndex)) % pool.length
        : 0;
    const designated = SENTENCE_ORDER_POINT_CATALOG[pool[offset]];
    designatedLine = `- ⭐ 이번 문항은 되도록 '${designated.name}' 장치로 단락 순서를 고정하세요 (${designated.signal}). 이 장치가 이 지문에 안 맞으면 코어의 다른 축을 쓰되, 같은 지문으로 여러 문항을 만들 땐 순서 응집장치를 코어 안에서 돌려가며 분산하세요.`;
  }

  const secondary = SENTENCE_ORDER_POINT_CATALOG[SENTENCE_ORDER_SECONDARY_FOCUS_CODE];
  return [
    "## 글의 순서 출제 포인트 가이드 (기출 550문항 LLM 검증 응집장치 분포 — 핵심 집중 모드)",
    `- ⭐ 단락 순서를 '유일하게' 고정하는 응집장치를 다음 고빈출 코어 3종에서 고르세요(동급 후보, 하나로 고정하지 말 것): ${coreLine}. 코어가 정말 안 맞을 때만 보조 '${secondary.name}(${SENTENCE_ORDER_SECONDARY_FOCUS_CODE})'까지 허용. 저빈출 축(인과·첨가·담화연속)에 기대지 마세요 — 기출에서 위 코어가 대부분(코어 누적 82.4%, +보조 91.7%)입니다.`,
    designatedLine,
    `- ⭐ 핵심 설계 원칙: 선택한 코어 장치가 인접 두 단락 사이를 '한 배열에서만' 자연스럽게 잇고, 다른 배열에서는 그 장치가 깨지도록(선행어 부재/시간 역행/반전 대상 없음) 단락을 분할하세요. 어느 순서로 놓아도 말이 되는 중립적 분할은 금지(정답 복수화).`,
    "- 제출 전 자가검증: 각 단락 연결의 응집장치를 라벨링하고, 그 장치가 코어(또는 보조)인지·정답 순서가 유일한지 확인한 뒤 확정하세요.",
  ]
    .filter(Boolean)
    .join("\n");
}
