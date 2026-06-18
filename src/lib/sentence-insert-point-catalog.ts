// ============================================================================
// 문장 삽입 출제 포인트 카탈로그 — LLM 검증 응집장치(cohesion) 분류축 런타임 증류본
//
// 출처: EBSi 기출 문장삽입 456문항(고1/2/3, 2006~2026)을 LLM으로 전수 분류한
// 검증 결과(2026-06-18). 산출물 =
// scripts/_gen_audit_out/sentence-insert-extraction/_p0_llm_labels.jsonl ·
// _p0_taxonomy_summary.json · _p0-report.md.
//
// ⚠️ 휴리스틱(키워드) 분류는 반증됨: contrast_reversal 45.4%로 몰렸으나 LLM 검증
// 결과 32.2%, 진짜 최빈출은 anaphora_reference(참조 해소) 49.3% — 휴리스틱이 가장
// 많이 놓친 축(휴리스틱 contrast 207 중 78개·coherence 46개·cause 31개가 실제론
// anaphora). 따라서 키워드 분포 대신 이 LLM 검증 분포를 focus 근거로 쓴다.
//
// 빈칸 blank-point-catalog 의 문장삽입판. buildBlankPointGuidance ↔
// buildSentenceInsertPointGuidance. 단 문장삽입 focus 는 "정답 자리를 고정하는
// 응집장치(cohesive device)"를 고빈출 코어로 좁히는 것이라, 정답 슬롯에서 앞·뒤
// 고리가 동시에 닫히게 하는 단서(지시어 역참조/대조 전환)에 집중하도록 유도한다.
// ============================================================================

export type SentenceInsertPointCode =
  | "anaphora_reference"
  | "contrast_reversal"
  | "cause_effect"
  | "addition_extension"
  | "example_elaboration"
  | "coherence_bridge"
  | "temporal_sequence";

export interface SentenceInsertPointInfo {
  code: SentenceInsertPointCode;
  /** 한글 이름 */
  name: string;
  /** LLM 검증 빈도 순위(1=최빈출) */
  rank: number;
  /** 검증 분포 점유율(%) — n=456 */
  share: number;
  /** core=focus 코어 / secondary=보조 focus / rare=저빈출(코어 제외) */
  tier: "core" | "secondary" | "rare";
  /** 정답 자리를 고정하는 응집장치 정의 */
  definition: string;
  /** 지문/주어진 문장에서 이 장치를 식별·설계하는 단서 (프롬프트 주입용 1줄) */
  signal: string;
}

export const SENTENCE_INSERT_POINT_CATALOG: Record<
  SentenceInsertPointCode,
  SentenceInsertPointInfo
> = {
  anaphora_reference: {
    code: "anaphora_reference",
    name: "참조 해소",
    rank: 1,
    share: 49.3,
    tier: "core",
    definition:
      "주어진 문장이 지시사·대명사·정관사·such/the same 등 역참조 표현을 담아, 그 선행어가 정답 직전 문장에만 존재하거나(앞 고리), 정답 직후 문장이 주어진 문장의 명사구를 다시 받아(뒤 고리) 오직 한 자리에서만 앞·뒤 참조가 동시에 닫힌다. 기출 최빈출(49.3%).",
    signal:
      "주어진 문장에 this/these/that/those/it/they/such+명사/the+구정보명사를 두고, 그 지시 대상이 오직 정답 직전 문장에서만 도입되게 하라. 나머지 gap에는 선행어가 없어 참조가 떠야 한다. 양방향(주어진 문장이 앞 선행어를 받고, 뒤 문장이 주어진 문장을 다시 받음)이면 자리가 가장 강하게 고정된다. 예: 'this process'·'These patterns'·'such a person'·'those water glasses'.",
  },
  contrast_reversal: {
    code: "contrast_reversal",
    name: "대조 전환",
    rank: 2,
    share: 32.2,
    tier: "core",
    definition:
      "주어진 문장이 앞 내용의 방향을 뒤집는 진짜 의미 반전(역접·양보·not A but B)이라, 앞의 한 주장과 뒤의 반대 전개 사이의 한 자리에서만 자연스럽다. 2위(32.2%).",
    signal:
      "주어진 문장에 However/Yet/Instead/Rather/On the other hand/By contrast/in reality/not A but B 를 두되, 표지뿐 아니라 내용이 앞 문장과 정반대로 갈리게 하라. ⚠️ 표면 but/however 만 있고 정작 자리를 고정하는 단서가 지시어 역참조이면 그건 대조가 아니라 참조 해소다(기출 휴리스틱이 가장 많이 혼동한 지점 — 진짜 반전일 때만 대조). 예: 'Rather, it is a horizontal shift'·'But with more permanent things'·'~, on the other hand'.",
  },
  cause_effect: {
    code: "cause_effect",
    name: "인과·결과 고리",
    rank: 3,
    share: 4.4,
    tier: "secondary",
    definition:
      "주어진 문장이 앞 문장(원인·조건)의 결과·귀결이거나, 뒤 결과의 원인·기제를 제공해 인과 사슬이 한 자리에서만 이어진다. 3위(4.4%).",
    signal:
      "Therefore/Thus/As a result/Hence/So/This is because/For this reason 으로 앞 문장과 인과로 묶되, 그 원인(또는 결과)이 정답 직전(또는 직후) 문장에만 존재하게 하라. 예: 'Hence the number of steps'·'So he was eliminated'·'This is because'.",
  },
  addition_extension: {
    code: "addition_extension",
    name: "첨가·심화 확장",
    rank: 4,
    share: 3.9,
    tier: "rare",
    definition:
      "주어진 문장이 앞 문장과 같은 방향의 정보를 첨가·심화(also/moreover/not only~but also)해 동질 정보가 이어지는 자리. 4위(3.9%).",
    signal:
      "Moreover/In addition/Furthermore/Also/not only~but also 로 앞과 같은 논점을 한 단계 더한다. 예: 'Environmental factors can also determine'·'In addition, ...'·'Worse, ...'.",
  },
  example_elaboration: {
    code: "example_elaboration",
    name: "예시·구체화",
    rank: 5,
    share: 3.7,
    tier: "rare",
    definition:
      "주어진 문장이 앞의 일반 진술을 구체 예시·사례로 받쳐, 일반→예시 순서가 한 자리에서만 맞는다. 5위(3.7%).",
    signal:
      "For example/For instance 로 앞 일반 명제의 사례를 든다. 그 일반 명제가 정답 직전에만 있어야 한다. 예: 'For example, Jupiter is so big'·'Such a thing would occur, for example'.",
  },
  coherence_bridge: {
    code: "coherence_bridge",
    name: "담화 연속(표지 없음)",
    rank: 6,
    share: 3.5,
    tier: "rare",
    definition:
      "표면 연결어 없이 화제·논지 연속만으로 자리가 결정되는 경우(Specifically/This shows 같은 약한 담화신호 포함). 표층 단서가 약해 변별이 가장 어렵다. 6위(3.5%).",
    signal:
      "명시 연결어 없이 앞 문장의 화제를 이어받아 다음으로 넘기는 담화 적합. 표면 단서가 약하므로 정답이 흔들리기 쉽다 — 코어(참조 해소·대조 전환)가 정말 안 될 때만 쓰라. 예: 'Specifically, ...'·'This shows that ...'.",
  },
  temporal_sequence: {
    code: "temporal_sequence",
    name: "시간·절차 순서",
    rank: 7,
    share: 2.9,
    tier: "rare",
    definition:
      "주어진 문장이 시간·절차상 한 단계여서, 앞 단계와 뒤 단계 사이 한 자리에서만 순서가 맞는다. 7위(2.9%).",
    signal:
      "Then/Next/After/Before/Subsequently/The next step 로 절차·사건 순서를 잇는다. 그 직전 단계가 정답 바로 앞에 있어야 한다. 예: 'The next step in this process'·'Then one doctor suggested'·'Only after everyone had finished lunch'.",
  },
};

/**
 * 핵심 집중(focus) 코어 — LLM 검증 응집장치 분포 상위 2(누적 81.5%).
 * 빈칸 BLANK_HIGH_YIELD_FOCUS_CODES 의 문장삽입판. 문장삽입은 분포가 코어 2종에
 * 매우 집중돼(81.5%) 코어를 2개로 둔다. 코어를 동급 후보로 주입한다(정답 자리를
 * 가장 강하게 고정하는 두 장치 — 참조 해소·대조 전환).
 */
export const SENTENCE_INSERT_HIGH_YIELD_FOCUS_CODES: SentenceInsertPointCode[] = [
  "anaphora_reference",
  "contrast_reversal",
];

/** 보조 focus — 코어 2 다음 빈출(누적 85.9%). 코어 장치가 안 맞을 때만 허용. */
export const SENTENCE_INSERT_SECONDARY_FOCUS_CODE: SentenceInsertPointCode =
  "cause_effect";

export interface SentenceInsertPointGuidanceOptions {
  /** 다양성: 배치 내 변형 인덱스 — 코어 응집장치 축 회전 지정의 결정형 오프셋 */
  variantIndex?: number;
  /** 핵심 집중 모드 — 응집장치를 검증 코어 2(+보조)로 좁힘 */
  pointFocus?: boolean;
  /** 다양성 모드 활성 여부 */
  diversityEnabled?: boolean;
}

/**
 * 문장 삽입 출제 포인트 가이드 — pointFocus 일 때만 후보 블록에 주입.
 * - 정답 자리를 고정하는 응집장치를 검증 코어 2(참조 해소·대조 전환, +보조 인과)로 좁힌다.
 * - diversityEnabled 면 variantIndex 로 1순위 코어 장치를 회전 지정(병렬 배치 분산).
 * - anaphora ↔ contrast 변별 시그널을 대비 명시(휴리스틱 최대 혼동축).
 * pointFocus 미지정이면 "" 반환 → 기존(비-focus) 동작 불변.
 */
export function buildSentenceInsertPointGuidance(
  options: SentenceInsertPointGuidanceOptions = {},
): string {
  const { variantIndex, pointFocus = false, diversityEnabled = false } = options;
  if (!pointFocus) return "";

  const coreLine = SENTENCE_INSERT_HIGH_YIELD_FOCUS_CODES.map(
    (code) => `${SENTENCE_INSERT_POINT_CATALOG[code].name}(${code})`,
  ).join(" · ");

  let designatedLine = "";
  if (diversityEnabled) {
    const pool = SENTENCE_INSERT_HIGH_YIELD_FOCUS_CODES;
    const offset =
      typeof variantIndex === "number" && Number.isFinite(variantIndex)
        ? Math.max(0, Math.floor(variantIndex)) % pool.length
        : 0;
    const designated = SENTENCE_INSERT_POINT_CATALOG[pool[offset]];
    designatedLine = `- ⭐ 이번 문항은 되도록 '${designated.name}' 장치로 정답 자리를 고정하세요 (${designated.signal}). 그 장치가 이 지문에 안 맞으면 코어의 다른 축을 쓰되, 같은 지문으로 여러 문항을 만들 땐 정답 응집장치를 코어 안에서 돌려가며 분산하세요.`;
  }

  const secondary = SENTENCE_INSERT_POINT_CATALOG[SENTENCE_INSERT_SECONDARY_FOCUS_CODE];
  return [
    "## 문장 삽입 출제 포인트 가이드 (기출 456문항 LLM 검증 응집장치 분포 — 핵심 집중 모드)",
    `- ⭐ 정답 자리를 고정하는 '응집장치(cohesive device)'를 다음 고빈출 코어 2종에서 고르세요(동급 후보, 특정 하나로 고정하지 말 것): ${coreLine}. 코어가 정말 안 맞을 때만 보조 '${secondary.name}(${SENTENCE_INSERT_SECONDARY_FOCUS_CODE})'까지 허용. 저빈출 축(첨가·예시·담화연속·시간순서)으로 변별을 시도하지 마세요 — 기출에서 위 코어가 출제의 대부분(코어 누적 81.5%, +보조 85.9%)입니다.`,
    designatedLine,
    `- ⚠️ '${SENTENCE_INSERT_POINT_CATALOG.anaphora_reference.name}'과 '${SENTENCE_INSERT_POINT_CATALOG.contrast_reversal.name}'은 가장 혼동되기 쉬우니 구분해 설계하세요: 정답 자리를 실제로 고정하는 단서가 ① 지시어·정관사가 앞 선행어를 요구하는 '참조 해소'인지, ② 내용이 정반대로 갈리는 '진짜 의미 반전'인지를 판정하세요. 주어진 문장에 but/however 가 있어도 자리를 고정하는 게 역참조면 참조 해소로 설계하세요(표면 역접어에 속지 말 것).`,
    `- ⭐ 선택한 코어 장치가 정답 한 자리에서만 앞 고리와 뒤 고리를 동시에 닫고, 나머지 4개 자리에서는 그 장치가 깨지도록(선행사 부재/반전 대상 없음/인과 단절) 주어진 문장과 지문 분할을 설계하세요. 어디에 넣어도 무난한 중립 문장은 금지(정답 복수화).`,
    "- 제출 전 자가검증: 정답 자리의 응집장치를 한 가지로 라벨링하고, 그 장치가 코어(또는 보조)인지·정답 외 자리에서 실제로 깨지는지 확인한 뒤 확정하세요.",
  ]
    .filter(Boolean)
    .join("\n");
}
