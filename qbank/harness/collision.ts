// ============================================================================
// 문항 병치 충돌 판정 — "이 문제와 이 문제가 같은 시험지에 있으면 정답이 유실되는가"
//
// 사용자 요구: 문항 간 패러프레이즈/노출 충돌 메타데이터.
//
// ★ 설계 중 확인된 구조적 사실:
//   같은 지문의 **지문 무변형 유형**(제목·주제·요지·함축·내용일치)은 지문 **전문을 그대로 인쇄**한다.
//   같은 지문의 **지문 변형 유형**(빈칸·어법·어휘·순서·삽입·무관·지칭)은 그 지문에서 무언가를
//   지우거나·바꾸거나·뒤섞는다.
//   → 둘이 같은 시험지에 있으면 변형 유형의 정답이 무변형 유형의 지문에 **문자 그대로 인쇄된다.**
//   이건 패러프레이즈 수준의 미묘한 누출이 아니라 **축자 노출**이며, 지금까지 아무도 판정하지 않았다.
//
// 판정은 결정론이다 — LLM 미사용, 0원.
// ============================================================================

/** 이 유형이 학생에게 보여 주는 지문의 형태 */
export type PassageSurface =
  | "INTACT" // 원문 그대로 인쇄
  | "BLANKED" // 일부 구절을 빈칸으로 지움
  | "ERROR_INJECTED" // 문법 오류를 심음
  | "WORD_SWAPPED" // 어휘를 바꿔치기
  | "SCRAMBLED" // 문단을 뒤섞음
  | "SENTENCE_PULLED" // 문장을 빼내고 위치 마커를 심음
  | "SENTENCE_ADDED" // 무관한 문장을 끼워 넣음
  | "MARKED_ONLY" // 원문 그대로 + 밑줄/네모 표기만 (본문 어휘 불변)
  | "NONE"; // 지문을 아예 인쇄하지 않음(요약문 단독 등)

/** 이 유형이 성립하려면 학생에게 감춰져 있어야 하는 것 */
export type HiddenAsset =
  | "ORIGINAL_EXPRESSION" // 빈칸에 들어갈 원래 표현
  | "CORRECT_FORM" // 어법의 올바른 형태
  | "ORIGINAL_WORD" // 어휘의 원래 단어
  | "ORIGINAL_ORDER" // 문단의 원래 순서
  | "ORIGINAL_POSITION" // 빠진 문장의 원래 자리
  | "ADDED_SENTENCE" // 끼워 넣은 무관 문장의 정체
  | "NOTHING"; // 감출 것이 없다(추론형)

export interface TypeSurface {
  surface: PassageSurface;
  hides: HiddenAsset;
  /** 지문 원문을 그대로 노출하는가 — 다른 유형의 감춰진 자산을 드러내는가 */
  revealsOriginalText: boolean;
}

export const TYPE_SURFACE: Record<string, TypeSurface> = {
  // ── 지문 무변형: 원문을 그대로 인쇄한다 → 모든 변형 유형의 답을 노출한다 ──
  TITLE: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  TOPIC: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  MAIN_IDEA: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  TOPIC_MAIN_IDEA: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  IMPLIED_MEANING: { surface: "MARKED_ONLY", hides: "NOTHING", revealsOriginalText: true },
  CONTENT_MATCH: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  REFERENCE: { surface: "MARKED_ONLY", hides: "NOTHING", revealsOriginalText: true },

  // ── 지문 변형: 각자 무언가를 감춘다 ──
  BLANK_INFERENCE: { surface: "BLANKED", hides: "ORIGINAL_EXPRESSION", revealsOriginalText: false },
  FILL_BLANK_KEY: { surface: "BLANKED", hides: "ORIGINAL_EXPRESSION", revealsOriginalText: false },
  GRAMMAR_ERROR: { surface: "ERROR_INJECTED", hides: "CORRECT_FORM", revealsOriginalText: false },
  GRAMMAR_CHOICE_COMBO: { surface: "ERROR_INJECTED", hides: "CORRECT_FORM", revealsOriginalText: false },
  GRAMMAR_CORRECTION: { surface: "ERROR_INJECTED", hides: "CORRECT_FORM", revealsOriginalText: false },
  VOCAB_CHOICE: { surface: "WORD_SWAPPED", hides: "ORIGINAL_WORD", revealsOriginalText: false },
  // 어휘 3종은 **본문을 바꾸지 않는다** — 밑줄/마킹만 한다(정찰 확정).
  //   CONTEXT_MEANING: md 에 지문을 싣지 않고 후처리가 `__단어__` 를 주입
  //   SYNONYM: md 에 지문을 쓰지 않음
  //   ANTONYM: "마킹만, 본문 1글자도 불변" — 초판에 WORD_SWAPPED/ORIGINAL_WORD 로 잘못 적었다(감독 오류, 수정)
  CONTEXT_MEANING: { surface: "MARKED_ONLY", hides: "NOTHING", revealsOriginalText: true },
  SYNONYM: { surface: "MARKED_ONLY", hides: "NOTHING", revealsOriginalText: true },
  ANTONYM: { surface: "MARKED_ONLY", hides: "NOTHING", revealsOriginalText: true },
  SENTENCE_ORDER: { surface: "SCRAMBLED", hides: "ORIGINAL_ORDER", revealsOriginalText: false },
  SENTENCE_INSERT: { surface: "SENTENCE_PULLED", hides: "ORIGINAL_POSITION", revealsOriginalText: false },
  IRRELEVANT: { surface: "SENTENCE_ADDED", hides: "ADDED_SENTENCE", revealsOriginalText: false },

  // ── 요약문 계열: 지문 + 요약틀. 지문은 원문 그대로 ──
  SUMMARY_COMPLETE_MC: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  SUMMARY_COMPLETE: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  SUMMARY_WRITING: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },

  // ── 서술형 ──
  CONDITIONAL_WRITING: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  SENTENCE_TRANSFORM: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  // WORD_ORDER 는 지문을 그대로 인쇄하지만 **감추는 것이 없다** — 정답 문장은 지문 문장의
  // 변형본(태·시제·구문 전환)이고 축자 복사 경로는 게이트가 F급으로 차단한다
  // (`gate-word-order.ts:264-278`). 초판에 ORIGINAL_ORDER 로 잘못 적어 8문항이 8그룹으로
  // 쪼개졌다(감독 오류, 수정).
  WORD_ORDER: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
  TOPIC_SENTENCE_WRITING: { surface: "INTACT", hides: "NOTHING", revealsOriginalText: true },
};

export type Risk = "critical" | "major" | "minor" | "safe";

export interface CollisionVerdict {
  risk: Risk;
  reason: string;
  /** 어느 쪽이 피해자인가 — 정답이 유실되는 문항 */
  victim: "a" | "b" | "both" | null;
}

export interface QuestionRef {
  qid: string;
  subType: string;
  itemIndex: number;
  /** 정답이 성립하려면 감춰져 있어야 하는 축자 문자열들(빈칸 원문·고침 원형·치환된 단어 등) */
  hiddenSpans: string[];
  /** 정답 선지 텍스트 */
  answerText: string;
  /**
   * 이 문항이 학생에게 **인쇄해 보여 주는** 선지 전체(정답 포함).
   * 정답↔정답만 비교하면 놓치는 누출이 있다 — 부정 극성 문항은 "타당한 선지"를 4개나
   * 인쇄하는데, 그 중 하나가 옆 문항의 정답과 같은 아이디어면 답이 그대로 새어 나간다.
   * (실측: 견본 TITLE #4 의 타당 선지 "Why Lifespan Decides Between Instinct and Learning" 가
   *  #1 의 정답 "Why Body Size Decides Between Instinct and Learning" 와 사실상 동일)
   */
  optionTexts: string[];
  /** 해설이 인용한 지문 문장들 */
  quotedSentences: string[];
}

const norm = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 2);

/** 자카드 유사도 — 패러프레이즈 근접도 판정용 */
function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** 경량 어간화 — 굴절만 접는다(단복수·3인칭·진행·과거). 형태소 분석기는 쓰지 않는다. */
const stem = (t: string) =>
  t
    .replace(/(ies)$/, "y")
    .replace(/(sses|shes|ches|xes)$/, "")
    .replace(/([^s])s$/, "$1")
    .replace(/(ing|ed)$/, "");

function jaccardStemmed(a: string, b: string): number {
  const A = new Set(tokens(a).map(stem));
  const B = new Set(tokens(b).map(stem));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/**
 * 두 문항을 같은 시험지에 나란히 두었을 때의 위험을 판정한다.
 * **전제: 두 문항이 같은 지문에서 나왔다.** 다른 지문이면 충돌하지 않는다.
 */
export function judgePair(a: QuestionRef, b: QuestionRef): CollisionVerdict {
  const sa = TYPE_SURFACE[a.subType];
  const sb = TYPE_SURFACE[b.subType];
  if (!sa || !sb) return { risk: "minor", reason: `유형 표면 미정의(${a.subType}/${b.subType})`, victim: null };

  // ① 원문 노출 — 가장 치명적이고 가장 흔하다
  const aRevealsB = sa.revealsOriginalText && sb.hides !== "NOTHING";
  const bRevealsA = sb.revealsOriginalText && sa.hides !== "NOTHING";
  if (aRevealsB && bRevealsA) {
    return {
      risk: "critical",
      reason: `양쪽 모두 상대의 감춘 자산을 노출한다 (${a.subType}=${sa.surface} ↔ ${b.subType}=${sb.surface})`,
      victim: "both",
    };
  }
  if (aRevealsB) {
    return {
      risk: "critical",
      reason: `${a.subType} 이 지문 원문(${sa.surface})을 인쇄하므로 ${b.subType} 이 감춘 ${sb.hides} 가 그대로 읽힌다`,
      victim: "b",
    };
  }
  if (bRevealsA) {
    return {
      risk: "critical",
      reason: `${b.subType} 이 지문 원문(${sb.surface})을 인쇄하므로 ${a.subType} 이 감춘 ${sa.hides} 가 그대로 읽힌다`,
      victim: "a",
    };
  }

  // ② 변형 × 변형 — 서로 다른 곳을 건드리면 각자 상대의 원형을 보여 준다
  if (sa.hides !== "NOTHING" && sb.hides !== "NOTHING") {
    // 같은 지점인지 판정: 완전일치 / 포함관계 / 어간 자카드.
    // 포함관계를 넣는 이유 — "preprogrammed behavior patterns" 와 "preprogrammed behavior pattern" 은
    // 토큰 자카드가 0.5 라 임계에 미달하지만 명백히 같은 자리다(단복수 차이).
    const spanOverlap = (x: string, y: string) => {
      const nx = norm(x);
      const ny = norm(y);
      if (!nx || !ny) return false;
      if (nx === ny) return true;
      if (nx.includes(ny) || ny.includes(nx)) return true;
      return jaccardStemmed(x, y) > 0.6;
    };
    const overlap = a.hiddenSpans.some((x) => b.hiddenSpans.some((y) => spanOverlap(x, y)));
    if (!overlap) {
      return {
        risk: "critical",
        reason: `서로 다른 지점을 변형했다 — ${a.subType} 지문에는 ${b.subType} 의 정답 지점이 원형으로 남아 있고 그 반대도 같다`,
        victim: "both",
      };
    }
    return {
      risk: "minor",
      reason: "같은 지점을 변형했다 — 상호 노출은 없으나 같은 표현을 두 번 묻는 중복 학습",
      victim: null,
    };
  }

  // ③ 감출 것이 없는 추론형끼리 — 정답 누출은 선지·해설 경로로만 발생한다
  const ansSim = jaccard(a.answerText, b.answerText);
  if (ansSim > 0.55) {
    return {
      risk: "major",
      reason: `정답이 사실상 같다(자카드 ${ansSim.toFixed(2)}) — 한쪽을 풀면 다른 쪽이 따라 풀린다`,
      victim: "both",
    };
  }

  // ③-b 정답 ↔ 상대 선지 누출 — 정답끼리만 봐서는 안 잡힌다.
  // 부정 극성 문항은 "타당한 선지"를 여러 개 인쇄하는데, 그 중 하나가 옆 문항의 정답과
  // 같은 아이디어면 학생이 그 문항을 읽는 것만으로 답이 확인된다.
  const best = (needle: string, hay: string[]) =>
    hay.reduce((m, o) => Math.max(m, jaccardStemmed(needle, o)), 0);
  const aLeakedByB = best(a.answerText, b.optionTexts || []);
  const bLeakedByA = best(b.answerText, a.optionTexts || []);
  const leak = Math.max(aLeakedByB, bLeakedByA);
  if (leak > 0.5) {
    return {
      risk: "major",
      reason: `한쪽 정답이 다른 쪽 선지로 인쇄된다(자카드 ${leak.toFixed(2)}) — 옆 문항을 읽는 것만으로 답이 확인된다`,
      victim: aLeakedByB > bLeakedByA ? "a" : "b",
    };
  }
  if (leak > 0.38) {
    return {
      risk: "minor",
      reason: `정답과 상대 선지의 표현이 상당히 겹친다(자카드 ${leak.toFixed(2)}) — 같은 회차 배치는 피하는 편이 낫다`,
      victim: null,
    };
  }

  // ④ 해설 인용 충돌 — A 의 해설이 B 의 정답 근거 문장을 통째로 인용
  const quoteHit =
    a.quotedSentences.some((q) => jaccard(q, b.answerText) > 0.5) ||
    b.quotedSentences.some((q) => jaccard(q, a.answerText) > 0.5);
  if (quoteHit) {
    return { risk: "minor", reason: "한쪽 해설이 다른 쪽 정답의 근거 문장을 인용한다(해설지 동시 열람 시)", victim: null };
  }

  if (ansSim > 0.35) {
    return { risk: "minor", reason: `정답 어휘가 상당히 겹친다(자카드 ${ansSim.toFixed(2)})`, victim: null };
  }

  return { risk: "safe", reason: "상호 노출 없음", victim: null };
}

/** 한 지문의 전 문항에 대해 쌍별 판정 + 동시 출제 가능 그룹을 만든다. */
export function analyzePassage(questions: QuestionRef[]): {
  pairs: { a: string; b: string; risk: Risk; reason: string; victim: string | null }[];
  /** 서로 critical 충돌이 없는 최대 묶음들 — 한 시험지에 함께 낼 수 있는 조합 */
  safeGroups: string[][];
  stats: Record<Risk, number>;
} {
  const pairs: { a: string; b: string; risk: Risk; reason: string; victim: string | null }[] = [];
  const stats: Record<Risk, number> = { critical: 0, major: 0, minor: 0, safe: 0 };
  const conflict = new Map<string, Set<string>>();
  for (const q of questions) conflict.set(q.qid, new Set());

  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      const v = judgePair(questions[i], questions[j]);
      stats[v.risk] += 1;
      if (v.risk !== "safe") {
        pairs.push({ a: questions[i].qid, b: questions[j].qid, risk: v.risk, reason: v.reason, victim: v.victim });
      }
      if (v.risk === "critical") {
        conflict.get(questions[i].qid)!.add(questions[j].qid);
        conflict.get(questions[j].qid)!.add(questions[i].qid);
      }
    }
  }

  // 탐욕적 그래프 색칠 — 충돌 없는 묶음으로 분할한다(시험지 회차 배분에 그대로 쓴다)
  const safeGroups: string[][] = [];
  const placed = new Set<string>();
  for (const q of questions) {
    if (placed.has(q.qid)) continue;
    let target = safeGroups.find((g) => g.every((other) => !conflict.get(q.qid)!.has(other)));
    if (!target) {
      target = [];
      safeGroups.push(target);
    }
    target.push(q.qid);
    placed.add(q.qid);
  }

  return { pairs, safeGroups, stats };
}
