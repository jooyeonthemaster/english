// ============================================================================
// 회원(=학원/선생님) 맞춤 문자 생성 엔진 — 순수 모듈(클라이언트 import 가능).
//
// DB의 기능별 사용 내역(consumptionByOp)·접속/사용 추이를 바탕으로,
//   · 잘 쓰는 기능
//   · 아직 안 쓰는 "좋은 기능"
// 을 가려내고, 선생님 한 명 한 명에게 맞는 문자 초안을 만들어 준다.
// AI 호출 없이 규칙 기반이라 즉시·무료·사실 기반(없는 사용을 지어내지 않음).
// ============================================================================

export interface OutreachFeature {
  key: string;
  /** 문자/칩에 쓰는 한글 기능명 */
  label: string;
  /** 사용으로 간주하는 크레딧 operationType들 (하나라도 있으면 "사용") */
  opTypes: string[];
  /** 미사용일 때 권유 한 줄 */
  pitch: string;
  /** 추천 우선순위 (작을수록 먼저) */
  rank: number;
}

// 추천 대상 핵심 기능 카탈로그. opTypes는 OPERATION_TYPE_LABELS 키와 일치.
export const OUTREACH_FEATURES: OutreachFeature[] = [
  {
    key: "EXTRACTION",
    label: "자료 추출",
    opTypes: ["TEXT_EXTRACTION", "PASSAGE_RESTORATION"],
    pitch: "PDF·교재를 캡처해 올리면 지문·문제가 자동으로 추출돼요 (OCR 무료).",
    rank: 1,
  },
  {
    key: "EXAM",
    label: "시험지 생성",
    opTypes: ["EXAM_GENERATION"],
    pitch: "고른 문제로 시험지(DOCX·HWP)가 바로 완성돼요.",
    rank: 2,
  },
  {
    key: "QUESTION_GEN",
    label: "문제 생성",
    opTypes: ["QUESTION_GEN_SINGLE", "AUTO_GEN_BATCH", "LEARNING_QUESTION_GEN"],
    pitch: "지문만 넣으면 유형별 문제가 자동으로 만들어져요.",
    rank: 3,
  },
  {
    key: "PASSAGE_ANALYSIS",
    label: "학습지 생성",
    opTypes: ["PASSAGE_ANALYSIS"],
    pitch: "지문 하나로 분석·학습지가 자동 생성돼요.",
    rank: 4,
  },
  {
    key: "EXPLANATION",
    label: "해설 생성",
    opTypes: ["QUESTION_EXPLANATION"],
    pitch: "문항마다 상세 해설을 자동으로 붙일 수 있어요.",
    rank: 5,
  },
  {
    key: "GRAMMAR",
    label: "문법 포인트 분석",
    opTypes: ["GRAMMAR_ENHANCEMENT"],
    pitch: "지문 속 핵심 문법을 자동으로 짚어줘요.",
    rank: 6,
  },
  {
    key: "VOCAB",
    label: "어휘 문제",
    opTypes: ["QUESTION_GEN_VOCAB"],
    pitch: "단어장으로 어휘 문제도 자동 생성돼요.",
    rank: 7,
  },
  {
    key: "WEBTOON",
    label: "웹툰 생성",
    opTypes: ["WEBTOON_IMAGE"],
    pitch: "지문을 웹툰으로 만들어 학생 몰입도를 높여보세요.",
    rank: 8,
  },
  {
    key: "AI_CHAT",
    label: "AI 튜터링",
    opTypes: ["AI_CHAT"],
    pitch: "학생용 AI 튜터링도 함께 제공돼요.",
    rank: 9,
  },
];

export interface ConsumptionRow {
  operationType: string | null;
  count: number;
}

export interface UsageAnalysis {
  used: OutreachFeature[];
  /** 미사용 + 추천 대상, rank 오름차순 */
  unused: OutreachFeature[];
}

/** consumptionByOp(기능별 사용 횟수)로 사용/미사용 기능을 가른다. */
export function analyzeUsage(rows: ConsumptionRow[]): UsageAnalysis {
  const usedOps = new Set(
    rows.filter((r) => r.operationType && r.count > 0).map((r) => r.operationType as string),
  );
  const used: OutreachFeature[] = [];
  const unused: OutreachFeature[] = [];
  for (const f of OUTREACH_FEATURES) {
    if (f.opTypes.some((op) => usedOps.has(op))) used.push(f);
    else unused.push(f);
  }
  unused.sort((a, b) => a.rank - b.rank);
  return { used, unused };
}

export type OutreachPreset = "RECOMMEND" | "REENGAGE" | "THANKS";

export const OUTREACH_PRESETS: Array<{ value: OutreachPreset; label: string }> = [
  { value: "RECOMMEND", label: "기능 추천" },
  { value: "REENGAGE", label: "재방문 유도" },
  { value: "THANKS", label: "감사 인사" },
];

export interface OutreachProfile {
  teacherName: string;
  academyName: string;
  used: OutreachFeature[];
  unused: OutreachFeature[];
  /** 마지막 "활동"(로그인 또는 실제 사용)으로부터 경과일 (없으면 null).
   *  로그인만 보면 세션이 길게 유지될 때 활동을 과소평가하므로 사용 기준을 함께 본다. */
  daysSinceActive: number | null;
  /** 최근 30일 사용 크레딧 합 */
  last30dUsage: number;
  /** 최근 30일 중 사용한 일수 */
  activeDays: number;
}

/** 신호에 맞는 기본 프리셋 추천. */
export function recommendPreset(p: OutreachProfile): OutreachPreset {
  // 최근에 활발히 쓰고 있으면 미사용 추천/감사 — 활동 기준이라 "로그인은 몇 주 전인데
  // 매일 쓰는" 회원을 잘못 재방문 유도로 보내지 않는다.
  if (p.activeDays >= 8 || p.last30dUsage >= 300) return "THANKS";
  if (p.daysSinceActive !== null && p.daysSinceActive >= 14) return "REENGAGE";
  return "RECOMMEND";
}

function joinLabels(features: OutreachFeature[], max = 2): string {
  return features
    .slice(0, max)
    .map((f) => f.label)
    .join("·");
}

/** 선생님 호칭 — 학원명 우선, 없으면 이름. */
function honorific(p: OutreachProfile): string {
  const base = p.academyName?.trim() || p.teacherName?.trim() || "선생님";
  return `${base} 원장님`;
}

/**
 * 프로필 + 프리셋으로 맞춤 문자 초안을 만든다. 관리자가 그대로 보내거나
 * 살짝 다듬어 쓰면 된다.
 */
export function buildSmsDraft(p: OutreachProfile, preset: OutreachPreset): string {
  const hi = honorific(p);
  const f1 = p.unused[0];
  const f2 = p.unused[1];

  if (preset === "REENGAGE") {
    const gap =
      p.daysSinceActive !== null && p.daysSinceActive >= 1
        ? `${p.daysSinceActive}일 동안 사용이 없으셔서 안부 전해요. 잘 지내시죠?`
        : `오랜만에 안부 전해요. 잘 지내시죠?`;
    const value = f1
      ? `그새 '${f1.label}' 기능이 더 편해졌어요 — ${f1.pitch}`
      : `최근 생성 품질이 많이 좋아졌어요. 한번 확인해 보세요!`;
    return [
      `${hi}, 스모트입니다 :)`,
      gap,
      value,
      `가볍게 다시 한번 들러보시는 건 어떨까요? 도움 필요하시면 편히 답장 주세요!`,
    ].join("\n");
  }

  if (preset === "THANKS") {
    const thanks =
      p.activeDays > 0
        ? `최근 ${p.activeDays}일간 스모트를 활발히 써주셔서 감사해요!`
        : `스모트를 꾸준히 써주셔서 감사해요!`;
    const plus = f1
      ? `한 가지 더 추천드리면 '${f1.label}' 기능이에요 — ${f1.pitch}`
      : `이미 대부분의 기능을 잘 활용하고 계세요. 새 기능도 계속 준비 중이에요!`;
    return [`${hi}, 스모트입니다 :)`, thanks, plus, `앞으로도 잘 부탁드리고 항상 응원합니다!`].join(
      "\n",
    );
  }

  // RECOMMEND (기본)
  const usedClause =
    p.used.length > 0
      ? `요즘 '${joinLabels(p.used)}' 기능을 잘 써주고 계시더라고요.`
      : `스모트에 가입해 주셔서 감사합니다.`;
  const unusedClause = f1
    ? `아직 '${f1.label}' 기능은 안 써보셨더라고요 — ${f1.pitch}${
        f2 ? `\n그리고 '${f2.label}' 기능도 있어요 — ${f2.pitch}` : ""
      }`
    : `이미 주요 기능을 두루 활용하고 계시네요! 새 기능도 계속 업데이트되니 기대해 주세요.`;
  return [`${hi}, 스모트입니다 :)`, usedClause, unusedClause, `편하게 써보시고 궁금한 점 있으면 언제든 답장 주세요!`].join(
    "\n",
  );
}

export interface SmsLength {
  chars: number;
  bytes: number;
  /** 한국 기준 90바이트 이하 = SMS, 초과 = LMS */
  type: "SMS" | "LMS";
}

/** 한국 문자 기준 바이트 수(한글·이모지=2바이트 근사)와 SMS/LMS 구분. */
export function smsLength(text: string): SmsLength {
  const chars = Array.from(text);
  let bytes = 0;
  for (const ch of chars) {
    bytes += (ch.codePointAt(0) ?? 0) > 0x7f ? 2 : 1;
  }
  return { chars: chars.length, bytes, type: bytes <= 90 ? "SMS" : "LMS" };
}
