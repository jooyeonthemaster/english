// ============================================================================
// 어법 출제 포인트 카탈로그 — docs/grammar-test-points.md 런타임 증류본
//
// 출처: 어법끝 START 2025 + ESSENTIAL 개정판 통합 마스터 (강사 제공, 2026-05-21).
// 1994~2021 수능·평가원 28년 정답 빈도 + 최근 6년 정답(오답) 데이터 기반.
// 강사 피드백(2026-05-31): "수능 최빈출이 대략 8~10가지인데 잘 짚어서 출제하지
// 못한다" → 정답 포인트를 빈도 코어 풀로 유도하고, 오답 선택률이 높은 포인트를
// 디코이 카드로 쓰며, 교재의 함정 시나리오를 그대로 주입한다.
//
// pointCode 체계(a~m)는 기존 스키마/후처리/렌더러와 공유되므로 변경하지 않는다.
// ============================================================================

import { describeGrammarMinimalPairs } from "./grammar-minimal-pairs";

export type GrammarPointCode =
  | "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m";

export interface GrammarPointInfo {
  code: GrammarPointCode;
  label: string;
  /** 28년 빈도 순위 (대표 TP 기준, 1=최빈출) */
  rank: number;
  /** 1994~2021 정답 출제 횟수 (관련 TP 합산) */
  answerFreq: number;
  /** 최근 6년 정답 횟수 */
  recentAnswer: number;
  /** 최근 6년 오답(디코이로 선택된) 횟수 — 높을수록 함정 카드로 강력 */
  recentWrong: number;
  /** 정답 적합도: core=최빈출 코어(정답 우선) / mid=가끔 / rare=정답 지양 */
  tier: "core" | "mid" | "rare";
  /** 교재의 함정 시나리오 — 디코이/정답 설계 시 프롬프트에 주입되는 1줄들 */
  traps: string[];
}

export const GRAMMAR_POINT_CATALOG: Record<GrammarPointCode, GrammarPointInfo> = {
  a: {
    code: "a",
    label: "정동사 vs 준동사",
    rank: 1,
    answerFreq: 97,
    recentAnswer: 25,
    recentWrong: 7,
    tier: "core",
    traps: [
      "한 문장의 동사 수 = (접속사+관계사) 수 + 1. 삽입절 <관계대명사 + I think/believe류>를 빼고 동사 자리를 판단하게 하라.",
      "세미콜론(;)이나 접속부사(thus/however) 뒤 절에는 새 본동사가 필요하다 — 준동사로 바꾸면 오류.",
      "과거형과 과거분사형이 같은 동사의 후치 수식(The proposal agreed upon that night ...)을 본동사로 착각하게 하라.",
    ],
  },
  b: {
    code: "b",
    label: "관계사 (관계대명사 vs 관계부사, that vs what)",
    rank: 2,
    answerFreq: 160,
    recentAnswer: 32,
    recentWrong: 88,
    tier: "core",
    traps: [
      "관계대명사 + 불완전한 절 / 관계부사·전치사+관계대명사 + 완전한 절 — 절의 완전성으로만 판단되게 하라.",
      "that[which] vs what: 선행사가 있으면 that/which, 없으면 what (최근 6년 오답 56회 — 최고 함정 카드).",
      "추상 선행사(point, case, situation, stage, circumstance) + where 를 함정으로 활용하라.",
      "콤마+which 는 앞 절 전체를 선행사로 받을 수 있다 — 계속적 용법에서 that/what 은 불가.",
    ],
  },
  c: {
    code: "c",
    label: "분사 능동 v-ing vs 수동 p.p.",
    rank: 4,
    answerFreq: 82,
    recentAnswer: 9,
    recentWrong: 47,
    tier: "core",
    traps: [
      "의미상 주어와 분사의 능/수동 관계로 판단. 분사 뒤 목적어가 있으면 능동(v-ing).",
      "자동사 분사는 목적어가 없어도 v-ing(a missing child, a retired teacher) — '목적어 없으면 p.p.' 규칙의 예외 함정.",
      "with + 명사 + 분사(부대상황)에서 with 뒤 명사가 의미상 주어.",
      "감정 동사: 감정을 유발하면 v-ing, 느끼면 p.p. (boring lecturer vs bored students).",
      "접속사 잔류 절축약: if/when/while + (주어+be 생략) + 분사 (if eaten, when asked, if left untreated) — 절 축약을 읽어야 능수동이 판별되는 기출 빈출 형태.",
    ],
  },
  d: {
    code: "d",
    label: "수일치",
    rank: 6,
    answerFreq: 76,
    recentAnswer: 16,
    recentWrong: 41,
    tier: "core",
    traps: [
      "주어 + [전명구/분사구/to-v구/관계사절/동격·콤마 삽입구] + 동사 — 동사 바로 앞 명사가 아닌 진짜 주어와 일치.",
      "the number of + 복수명사(단수 취급) vs a number of + 복수명사(복수), one of + 복수명사 + 단수동사 — 기출 최빈 함정.",
      "부분 표현(percent/most/half/the rest of + 명사)은 of 뒤 명사에 일치.",
      "도치구문(There/장소 부사구/부정어 도치)에서 동사 뒤 진짜 주어와 일치.",
      "구·절 주어(동명사구, that절)는 단수 취급.",
    ],
  },
  e: {
    code: "e",
    label: "능동태 vs 수동태",
    rank: 7,
    answerFreq: 53,
    recentAnswer: 6,
    recentWrong: 11,
    tier: "core",
    traps: [
      "타동사인데 뒤에 목적어가 없으면 수동 의심 — 단 관계대명사절에서 목적어가 앞으로 빠진 경우는 능동 유지(함정).",
      "자동사(occur, happen, appear, disappear, consist, belong)는 수동태 불가.",
      "be used to-v(~하는 데 사용되다) vs be used to v-ing(~에 익숙하다) vs used to-v(과거 습관).",
    ],
  },
  f: {
    code: "f",
    label: "형용사 자리 vs 부사 자리",
    rank: 8,
    answerFreq: 61,
    recentAnswer: 7,
    recentWrong: 51,
    tier: "core",
    traps: [
      "보어 자리는 형용사: be/remain/keep/stay, become/get/grow, seem, look/sound/feel + 5형식 OC(make/find/keep/leave + O + 형용사).",
      "-ly 로 끝나는 형용사(costly, friendly, lively, deadly, lonely, likely)를 부사로 착각하게 하라 (최근 6년 오답 49회 — 최상위 함정 카드).",
      "enough 어순: enough+명사 / 형·부+enough.",
      "혼동 형·부: hard/hardly, late/lately, high/highly, near/nearly, close/closely — 의미가 달라지는 쌍.",
    ],
  },
  g: {
    code: "g",
    label: "대명사 일치",
    rank: 9,
    answerFreq: 47,
    recentAnswer: 4,
    recentWrong: 45,
    tier: "core",
    traps: [
      "앞 명사 반복 회피의 that/those 는 받는 명사의 수에 일치 (the color ... than that of / growth patterns ... those of).",
      "it(앞에 나온 특정한 것) vs one/ones(같은 종류의 불특정한 것).",
      "의미상 주어 = 목적어이면 재귀대명사(themselves) — them 과의 대비가 최근 오답 44회의 함정 카드.",
      "<부사절, 주절> 구조에서 부사절의 대명사는 주절 주어를 가리킬 수 있다.",
    ],
  },
  h: {
    code: "h",
    label: "목적격보어 형태",
    rank: 10,
    answerFreq: 30,
    recentAnswer: 1,
    recentWrong: 16,
    tier: "core",
    traps: [
      "사역(make/have/let)+O+동사원형, 지각(see/hear/watch/notice)+O+동사원형 또는 v-ing(진행 강조).",
      "enable/allow/cause/force/encourage/expect + O + to-v — get 도 to-v(사역 make 와 대비).",
      "O와 OC가 수동 관계면 p.p.: have+O+p.p., keep+O+p.p. (Keep your radio tuned).",
    ],
  },
  i: {
    code: "i",
    label: "병렬구조",
    rank: 5,
    answerFreq: 64,
    recentAnswer: 7,
    recentWrong: 22,
    tier: "core",
    traps: [
      "등위접속사(and/but/or)·상관접속사(both A and B, not only A but also B)가 잇는 항목의 문법 형태 일치.",
      "A and [부사구] B 처럼 부사가 끼어 거리가 멀어진 병렬을 함정으로 활용하라.",
      "비교 대상(than/as ~ as)의 양쪽 형태 일치, from A to B / between A and B 짝 구조.",
      "to부정사 병렬에서 두 번째 to 는 생략 가능 — 생략형을 오류로 오인하게 하는 함정.",
    ],
  },
  j: {
    code: "j",
    label: "가정법 시제",
    rank: 33,
    answerFreq: 3,
    recentAnswer: 0,
    recentWrong: 1,
    tier: "rare",
    traps: [
      "if 가정법 과거/과거완료의 동사 짝, if 생략 도치(Had/Were/Should + S).",
    ],
  },
  k: {
    code: "k",
    label: "to-v vs v-ing",
    rank: 14,
    answerFreq: 18,
    recentAnswer: 0,
    recentWrong: 11,
    // 수능·평가원 빈도표(14위)로는 mid 였으나, 내신·학평 포함 기출 1570제 전수
    // 분류(2026-06-11)에서 정답 포인트 6위(184건/2623, 7.0%) — 내신 학원 고객
    // 기준으로 코어 승격. 전치사 to 함정이 절반 이상.
    tier: "core",
    traps: [
      "remember/forget/regret/try/stop + to-v(앞일) vs v-ing(이미 한 일) — 의미 변화 동사.",
      "전치사 to(+v-ing/명사: look forward to, be used to, object to, contribute to, when it comes to) vs 부정사 to(+동사원형: be likely/willing/reluctant to) — 함정으로 빈출(오답이 정답보다 많음).",
    ],
  },
  l: {
    code: "l",
    label: "전치사 vs 접속사",
    rank: 12,
    answerFreq: 22,
    recentAnswer: 0,
    recentWrong: 4,
    tier: "mid",
    traps: [
      "during/while, despite·in spite of/although·though, because of/because — 뒤가 명사(구)면 전치사, 절(S+V)이면 접속사.",
    ],
  },
  m: {
    code: "m",
    label: "비교구문",
    rank: 25,
    answerFreq: 11,
    recentAnswer: 0,
    recentWrong: 7,
    tier: "rare",
    traps: [
      "비교급 수식 부사는 much/even/still/far/a lot (very 불가), as+원급+as 사이 형/부 판단, the 비교급 ~ the 비교급.",
    ],
  },
};

/** 정답(오류) 포인트로 우선 지정할 코어 풀 — 빈도 순. 강사 언급 "최빈출 8~10가지". */
export const GRAMMAR_CORE_ANSWER_CODES: GrammarPointCode[] = [
  "a", // 1위 정동사vs준동사
  "b", // 2·3위 관계사/that·what
  "c", // 4위 분사
  "i", // 5위 병렬
  "d", // 6위 수일치
  "e", // 7위 태
  "f", // 8위 형/부
  "g", // 9위 대명사
  "h", // 10위 목적격보어
  "k", // 내신·학평 기출 1570제 분류 6위(7.0%) — 내신 기준 코어 승격
];

/**
 * 핵심 집중(focus) 모드 정답 포인트 톱셋 — 강사 제공 기출 1000제 실분포 상위 6.
 * (b 관계사 867 · d 수일치 619 · k to-v/v-ing 519 · c 분사 496 · g 대명사 442 · f 형/부 310)
 * 다양성(중복방지) 모드는 코어 10개를 순회하지만, focus 모드는 이 6개 안에서만
 * 정답 포인트를 로테이션해 "고빈출 핵심에 집중"한다(나머지는 디코이로만).
 * ⚠️ 카탈로그 GRAMMAR_CORE_ANSWER_CODES 는 수능 28년 기준이라 a(정동사)를 1위로
 * 두지만, 강사 1000제에선 a 가 거의 최하위(98) — focus 셋에서 제외.
 */
export const GRAMMAR_HIGH_YIELD_FOCUS_CODES: GrammarPointCode[] = ["b", "d", "k", "c", "g", "f"];

/** 최근 6년 오답 선택률 최상위 — 디코이(함정) 카드 우선순위. */
export const GRAMMAR_TOP_DECOY_CODES: GrammarPointCode[] = ["b", "f", "c", "g", "d", "i"];

export type GrammarGenerationMode = "judgment" | "correction";
export type GrammarAuditDifficultyLevel = "하" | "중" | "상";

export const GRAMMAR_1000_AUDIT_PROFILE = {
  totalQuestions: 1570,
  forms: {
    abcOptions: 761,
    underlineError: 764,
    other: 45,
  },
  levels: {
    "하": {
      count: 319,
      formBias: "밑줄 오류 찾기 212 / A-B-C 선택형 94",
      topPoints: [
        "완전타동사·어법성 동사 61",
        "형용사·부사 53",
        "명사·관사·수량 44",
        "to부정사·동명사 38",
      ],
      topTraps: [
        "숙어처럼 보이는 구조 82",
        "형용사/부사 자리 혼동 45",
        "능동/수동 의미관계 혼동 26",
        "대명사 지시대상/수 일치 26",
      ],
      designFocus: [
        "한 문장 안에서 바로 회수되는 단서",
        "전치사 뒤 동명사, 보어 자리 형용사, 명확한 목적어 유무",
        "정답은 1-step 판단이되 오답 밑줄은 실제 문법 포인트가 있어야 함",
      ],
    },
    "중": {
      count: 1036,
      formBias: "A-B-C 선택형 577 / 밑줄 오류 찾기 427",
      topPoints: [
        "명사·관사·수량 383",
        "완전타동사·어법성 동사 362",
        "to부정사·동명사 317",
        "태·분사 310",
        "형용사·부사 295",
        "대명사·지시어 265",
        "관계사 263",
      ],
      topTraps: [
        "숙어처럼 보이는 구조 503",
        "능동/수동 의미관계 혼동 373",
        "관계사 격·선행사 혼동 353",
        "형용사/부사 자리 혼동 340",
        "대명사 지시대상/수 일치 327",
      ],
      designFocus: [
        "절 경계나 수식어를 한 번 걷어내야 보이는 구조",
        "what/that/which, 분사 능수동, spend/used to/look forward to류 준동사",
        "정답 1개라도 나머지 밑줄은 서로 다른 함정 포인트로 구성",
      ],
    },
    "상": {
      count: 215,
      formBias: "밑줄 오류 찾기 125 / A-B-C 선택형 90",
      topPoints: [
        "관계사 83",
        "태·분사 83",
        "형용사·부사 68",
        "to부정사·동명사 66",
        "명사·관사·수량 64",
        "완전타동사·어법성 동사 54",
        "병렬·구조 49",
      ],
      topTraps: [
        "숙어처럼 보이는 구조 99",
        "관계사 격·선행사 혼동 96",
        "능동/수동 의미관계 혼동 92",
        "형용사/부사 자리 혼동 81",
        "대명사 지시대상/수 일치 58",
        "병렬 형태 불일치 49",
      ],
      designFocus: [
        "긴 수식어, 삽입구, 관계절, 분사구문, 병렬 범위를 함께 읽어야 함",
        "로컬로는 자연스러워 보이지만 선행사·의미상 주어·진짜 주어를 확인하면 무너지는 오류",
        "정답 포인트는 관계사/분사/준동사/병렬/형부사 중 고난도 구조를 우선",
      ],
    },
  },
} as const;

export interface GrammarPointGuidanceOptions {
  /** 다양성 배치 인덱스 — 정답 포인트 지정 로테이션의 결정형 오프셋 */
  variantIndex?: number;
  /** 같은 지문에서 이미 정답으로 사용된 pointCode들 (회피) */
  usedPointCodes?: string[];
  /** 다양성 모드 활성 여부 — 미활성이면 지정(⭐) 없이 빈도 가이드만 */
  diversityEnabled?: boolean;
  answerCount?: number;
  requestedDifficulty?: string;
  mode?: GrammarGenerationMode;
  /**
   * 핵심 집중(focus) 모드 — true 면 정답 포인트를 고빈출 톱셋(1000제 상위 6)
   * 안에서만 로테이션해 출제 포인트를 집중시킨다. false/미지정이면 기존 다양성
   * (코어 10개 순회). 강사 "출제 포인트 못 잡음" 피드백 대응.
   */
  pointFocus?: boolean;
}

function normalizeAuditDifficultyLevel(difficulty?: string): GrammarAuditDifficultyLevel {
  const normalized = String(difficulty ?? "").trim().toUpperCase();
  if (normalized === "BASIC" || normalized === "하") return "하";
  if (normalized === "KILLER" || normalized === "상") return "상";
  return "중";
}

export function buildGrammar1000AuditGuidance(requestedDifficulty?: string): string {
  const level = normalizeAuditDifficultyLevel(requestedDifficulty);
  const profile = GRAMMAR_1000_AUDIT_PROFILE.levels[level];
  return [
    "## 어법 1000제 PDF 분석 기반 난이도 보정",
    `- 분석 표본: 총 ${GRAMMAR_1000_AUDIT_PROFILE.totalQuestions}문항, 밑줄 오류 찾기 ${GRAMMAR_1000_AUDIT_PROFILE.forms.underlineError}개, A/B/C 선택형 ${GRAMMAR_1000_AUDIT_PROFILE.forms.abcOptions}개.`,
    `- 현재 난이도 기준: ${level} (${profile.count}문항). 형식 경향: ${profile.formBias}.`,
    `- 이 난이도에서 자주 나오는 포인트: ${profile.topPoints.join(" · ")}.`,
    `- 이 난이도에서 강한 함정: ${profile.topTraps.join(" · ")}.`,
    `- 설계 기준: ${profile.designFocus.join(" / ")}.`,
  ].join("\n");
}

/**
 * 어법 후보 블록에 주입할 빈도 기반 출제 가이드를 생성한다.
 * - 정답 포인트: 코어 풀 안내 + (다양성 모드) variantIndex 로테이션으로 1개 지정(소프트).
 * - 디코이: 오답 선택률 최상위 함정 카드 + 교재 함정 시나리오.
 */
export function buildGrammarPointGuidance(
  options: GrammarPointGuidanceOptions = {},
): string {
  const {
    variantIndex,
    usedPointCodes,
    diversityEnabled,
    answerCount = 1,
    requestedDifficulty,
    mode = "judgment",
    pointFocus = false,
  } = options;

  // 핵심 집중 모드면 정답 포인트 풀을 고빈출 톱셋(1000제 상위 6)으로 좁힌다.
  // 다양성 모드는 코어 10개 전체 순회(저빈출 a·e·i·h 강제 → 출제 포인트 흩뿌림).
  const answerPool = pointFocus ? GRAMMAR_HIGH_YIELD_FOCUS_CODES : GRAMMAR_CORE_ANSWER_CODES;

  const coreLine = answerPool.map((code) => {
    const info = GRAMMAR_POINT_CATALOG[code];
    return `(${code}) ${info.label}[${info.rank}위]`;
  }).join(" · ");

  // 정답 포인트 지정: 기사용 코드를 뺀 풀에서 로테이션. 전부 사용됐으면 풀 리셋.
  let designated: GrammarPointCode[] = [];
  if (diversityEnabled) {
    const used = new Set(
      (usedPointCodes ?? []).map((code) => code.trim().toLowerCase()),
    );
    const available = answerPool.filter((code) => !used.has(code));
    const pool = available.length >= answerCount ? available : answerPool;
    const offset =
      typeof variantIndex === "number" && Number.isFinite(variantIndex)
        ? Math.max(0, Math.floor(variantIndex))
        : Math.floor(Math.random() * pool.length);
    designated = Array.from(
      { length: Math.min(answerCount, pool.length) },
      (_, i) => pool[(offset + i) % pool.length],
    );
  }

  // 단일 정답일 때는 폴백 2개까지 순위로 지정 — 지문에 1순위 구조가 없을 때
  // 모델이 한 포인트로 일괄 후퇴하며 생기는 편중을 막는다.
  const fallbackChain =
    designated.length === 1 && answerCount === 1
      ? Array.from({ length: 2 }, (_, i) => {
          const pool = answerPool;
          const baseIndex = pool.indexOf(designated[0]);
          return pool[(baseIndex + i + 1) % pool.length];
        }).filter((code) => !designated.includes(code))
      : [];

  const designatedLines = designated.length
    ? [
        `- ⭐ 이번 문항의 정답 포인트(다양성 지시): 1순위 ${designated
          .map((code) => `(${code}) ${GRAMMAR_POINT_CATALOG[code].label}`)
          .join(", ")} 의 오류를 정답으로 만드세요.${
          fallbackChain.length
            ? ` 지문에 그 문법 구조가 없으면 2순위 (${fallbackChain[0]}) ${GRAMMAR_POINT_CATALOG[fallbackChain[0]].label}${
                fallbackChain[1]
                  ? `, 3순위 (${fallbackChain[1]}) ${GRAMMAR_POINT_CATALOG[fallbackChain[1]].label}`
                  : ""
              } 순서로 시도하세요. 순위를 건너뛰고 다른 포인트로 가지 마세요.`
            : " 지문에 그 문법 구조가 없을 때만 코어 목록의 다른 포인트를 사용하세요."
        } 같은 지문에서 정답 포인트가 반복되지 않게 하세요.`,
        ...designated.flatMap((code) => {
          const trapHints = GRAMMAR_POINT_CATALOG[code].traps
            .slice(0, 2)
            .map((trap) => `  · 지정 포인트 설계 힌트: ${trap}`);
          // 기출 1000제 최소대립쌍 — 이 포인트의 검증된 오류 변형 방향.
          const pairs = describeGrammarMinimalPairs(code);
          return pairs
            ? [...trapHints, `  · 기출 검증 오류 변형(이 방향으로 오류를 만드세요): ${pairs}`]
            : trapHints;
        }),
      ]
    : [];

  const decoyLines = GRAMMAR_TOP_DECOY_CODES.slice(0, 4).map((code) => {
    const info = GRAMMAR_POINT_CATALOG[code];
    return `  · (${code}) ${info.label} — ${info.traps[Math.min(1, info.traps.length - 1)]}`;
  });

  return [
    "## 어법 출제 포인트 가이드 (수능·평가원 28년 기출 빈도 기반)",
    pointFocus
      ? `- ⭐ 핵심 집중 모드: 정답(오류) 포인트는 반드시 기출 최빈출 톱셋에서만 고르세요: ${coreLine}. 이 6개 밖의 포인트(정동사 단독·능수동태·병렬·목적격보어·비교·전치사 등)는 정답으로 만들지 말고 디코이로만 쓰세요 — 강사 기출 1000제에서 관계사·수일치·to부정사/동명사·분사·대명사·형부가 출제의 대부분입니다.`
      : `- 정답(오류로 변형하는) 포인트는 다음 최빈출 코어에서 선택하세요: ${coreLine}.`,
    pointFocus
      ? "- 같은 지문에서 여러 문항을 만들 때도 정답 포인트는 위 톱셋 안에서만 쓰고, 변화는 '다른 포인트로 바꾸기'가 아니라 '같은 포인트를 다른 문장·다른 자리·다른 디코이 구성으로' 주세요. 엉뚱한 저빈출 포인트로 변별을 시도하지 마세요."
      : "",
    pointFocus
      ? "- ⚠️ 단, 톱셋 포인트를 **깨끗하게(명백한 단일 오류로)** 출제할 자리가 지문에 없으면, 억지로 비문을 만들지 마세요. 예: 소유격 its 를 목적격 them 으로 바꿔 'them parts'(한정사 자리 붕괴)처럼 만들지 말고, its→their(수일치)처럼 깨끗한 변형이 가능할 때만 그 포인트를 정답으로 쓰세요. 깨끗한 톱셋 자리가 정말 없으면 그 지문에서 가장 자연스럽게 틀리는 자리를 정답으로 하고, 톱셋은 디코이로 채우세요."
      : "",
    mode === "correction"
      ? "- (j) 가정법·법, (m) 비교구문은 수능 객관식 정답 빈도는 낮지만 1000제 내신형에서는 보조 포인트로 자주 보입니다. 단독 암기형 오류로 남발하지 말고, 지문에 if/as/than/법조동사 구조가 명확할 때만 서술형 수정 후보로 쓰세요."
      : "- (j) 가정법, (m) 비교구문은 28년간 정답 출제가 극히 드뭅니다 — 정답으로 만들지 말고 디코이로만 사용하세요. (l) 전치사/접속사도 정답보다는 디코이에 적합합니다.",
    buildGrammar1000AuditGuidance(requestedDifficulty),
    ...designatedLines,
    "- 디코이(밑줄만 치고 어법상 옳게 두는 자리)는 최근 6년 학생 오답 선택률이 가장 높은 함정 카드를 우선 배치하세요:",
    ...decoyLines,
    "- 디코이는 되도록 서로 다른 문법 포인트의 자리를 고르세요. 단, pointCode 는 **항상 그 자리의 실제 문법 성격대로** 기재해야 합니다 — 코드 중복을 피하려고 다른 코드를 거짓으로 적으면 안 됩니다 (중복되면 중복된 대로 정직하게 기재). '한눈에 옳음이 보이는' 자리(병렬 형용사 바로 옆, 지시 대상이 붙어 있는 대명사 등)는 함정 가치가 없습니다.",
    "- ⚠️ 원문 표현 자체가 표준 규범과 어긋나 보이거나 어법 논쟁이 있는 자리(예: 복수 주어 + 동격 each 뒤 동사의 수, 집합명사 수일치, 사용역에 따라 갈리는 변이형)는 정답으로도 디코이로도 밑줄을 긋지 마세요. 원문을 오류로 판정하지 말고, 의심스러운 자리는 피해서 다른 곳에 출제하세요.",
    "- 자기검증: 각 밑줄의 pointCode 는 그 밑줄의 해설(wrongOptionExplanations/explanation)이 설명하는 문법 범주와 일치해야 합니다. 분사구문 능수동이면 (c), 수일치면 (d), 명사절·관계절의 that/what 은 (b)입니다. 제출 전 5개 밑줄의 코드-해설 일치를 확인하세요.",
    mode === "judgment"
      ? "- ⭐ 밑줄 span은 최소 문법 단위(보통 1~3단어, 최대 5단어)로만 좁히세요. 절 전체(주어+정동사+목적어)나 문장 통째 밑줄은 금지입니다. pointCode 의 필수 토큰(분사면 -ing/p.p., 관계사면 that/which/where 등, 대명사면 it/them/that/those 등, k면 to+원형/-ing, l면 during/while/because 등, m면 비교 표지)이 밑줄 표면 문자열 안에 실제로 있어야 하며, 없는데 코드만 붙이면 가짜 디코이입니다."
      : "",
    mode === "judgment"
      ? "- 🚫 시제만 바꾸는 변형 금지: 기출 1000제 정답 오류에 '현재↔과거 시제 단독 교체'(예: realizes→realized, outpaces→outpaced)는 검증되지 않은 변형입니다. 문맥상 두 시제가 모두 가능해 정답 시비가 됩니다. 오류는 위 기출 검증 변형 방향(수일치·관계사·분사 능수동·형부 등)으로만 만드세요."
      : "",
    "- 정답·디코이의 '판단'은 문장 전체 구조(선행사·진주어·의미상 주어·병렬 범위 등)를 읽어야 가능해야 합니다. 단, 그렇다고 밑줄을 길게 긋지 마세요 — 판단 근거는 밑줄 밖 맥락에 두고, 밑줄은 판단이 걸린 한 토큰에만 긋습니다. 단어 하나만 보고 즉답되는 자리(관사, 단순 전치사, 철자, 조동사 바로 옆 원형)는 금지.",
  ].filter(Boolean).join("\n");
}
