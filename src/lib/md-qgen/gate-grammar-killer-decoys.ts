// ============================================================================
// 어법 KILLER 「죽은 미끼」 0원 결정형 게이트 — LLM 콜 없음.
//
// 배경(26-08-21 실측): 사용자 반려 실물에서 밑줄 5개 중 3개가 상위권이 검토조차
// 하지 않는 자리였다(① closely = be+부사+p.p. / ③ desired = 관사 옆 고정연어 /
// ④ themselves = 앞 문장 "call themselves" 가 정오를 확증). 실질 선택지가 2개로
// 줄어 KILLER 계약이 붕괴한다.
//
// 핵심: 이 네 자리는 **프롬프트가 이미 금지하고 있었다**.
//   grammar-killer-v2.ts 설계 절차 3단계:
//     "미끼 4개 = 각각 '학생이 구체적으로 무엇으로 잘못 고치고 싶어지는 자리'.
//      (by -ing · 관사 옆 · 주어 바로 옆 동사 · 지시 대상이 붙은 대명사는 실격)"
//   모델이 지키지 않았고 확인하는 코드가 없었을 뿐이다. 이 파일은 그 네 실격
//   조건 중 결정론으로 판정 가능한 세 개(관사 옆 / 지시 대상 붙은 대명사 /
//   by -ing)에 더해, 실물에서 나온 be+부사+p.p. 자리를 집행한다.
//   ("주어 바로 옆 동사"는 주어 핵 판정에 구문분석이 필요해 제외 — §미구현)
//
// 임계값 근거(실기출 실측): 기출 어법 156문항 마커 복원본에서 죽은 미끼 개수
// 분포는 {0개: 133, 1개: 23, 2개 이상: 0} 이다. 실기출에 2개 이상은 **한 건도
// 없다**. 그래서 임계를 2로 둔다 — 이 임계에서 실기출 오반려율 0.0%(156/156 통과)
// 이고 사용자 반려 실물은 죽은 미끼 3개로 정확히 적발된다.
//
// 효과 실측(30지문 실생성, 3.7-flash 프로덕션 설정): 1차 죽은미끼 분포
// {0개:25, 1개:4, 2개:1} → 게이트 사유를 주입해 재생성한 5건이 전부 0개로
// 개선(개선 5 / 동일 0 / 악화 0). 최종 분포 {0개:30}.
//
// ⚠ 이 게이트의 메시지는 그대로 [반려 재생성] 프롬프트의 피드백이 된다
//   (route.ts 의 gateIssues 경로). "어느 라벨의 무엇이 왜" 를 반드시 적는다.
//
// 킬스위치: env QGEN_GRAMMAR_KILLER_DECOY_GATE=off (재빌드 불필요).
// ============================================================================

import { normalizeWs, type MdGrammarQuestion } from "./parser";

/** 게이트 활성 여부 — off 면 빈 배열(전면 무력화). */
export function isGrammarKillerDecoyGateEnabled(): boolean {
  return (
    process.env.QGEN_GRAMMAR_KILLER_DECOY_GATE?.trim().toLowerCase() !== "off"
  );
}

/** 실기출 실측 임계 — 2개 이상인 기출이 0건이라 2로 고정한다. */
const DEAD_DECOY_LIMIT = 2;

/** 자기확증 근접 창(토큰). 이 안에서 같은 표면이 다시 보이면 눈 대조로 끝난다. */
const SELF_CONFIRM_WINDOW = 30;

/** 고정연어 슬롯을 만드는 관사 — 지시·소유 한정사는 제외(정상 판단 자리다). */
const ARTICLES = new Set(["a", "an", "the"]);

/** by -ing 계열: 전치사 직후 동명사는 형태가 강제돼 판단 여지가 없다. */
const PREPOSITIONS = new Set([
  "by", "of", "in", "on", "at", "for", "with", "from", "about", "through",
  "after", "before", "without", "into", "upon", "despite", "besides", "via",
]);

/** be·조동사 — 뒤에 p.p. 가 오면 그 사이 부사는 구조 판단이 발생하지 않는다. */
const AUXILIARIES = new Set([
  "is", "are", "was", "were", "be", "been", "being", "am",
  "has", "have", "had", "do", "does", "did",
  "will", "would", "can", "could", "may", "might", "shall", "should", "must",
]);

/**
 * 자기확증 검사에서 제외할 어휘 — 지문에서 자연 반복하는 기능어·조동사·범용
 * 명사. 이 목록 없이 돌리면 did/made/which/having 류에 오발해 실기출 오반려율이
 * 19.9% 까지 치솟는다(26-08-21 실측 → 목록 도입 후 3.8% → 미끼 한정 후 0.0%).
 */
const SELF_CONFIRM_STOPWORDS = new Set([
  "having", "being", "doing", "making", "taking", "giving", "using",
  "become", "becomes", "became", "through", "without", "between",
  "because", "although", "however", "people", "things", "something",
  "someone", "another", "others", "before", "during", "within",
  "toward", "towards", "around", "across", "against",
  "result", "results", "number", "numbers", "system", "systems",
  "process", "processes",
]);

const cleanToken = (w: string): string =>
  w.replace(/[^A-Za-z'-]/g, "").toLowerCase();

interface MarkSite {
  label: string;
  /** 밑줄 표현의 첫 단어(판정이 걸리는 핵심어). */
  head: string;
  /** 지문 토큰열에서 이 밑줄이 시작하는 인덱스. */
  tokenIndex: number;
}

/**
 * markedPassage(`[[A:표현]]` 인라인 마킹)에서 마커를 제거한 순수 지문 토큰열과
 * 각 라벨의 토큰 인덱스를 얻는다. markedPassage 가 없으면 null(게이트 미발화).
 */
function readMarkSites(
  q: MdGrammarQuestion,
): { tokens: string[]; sites: MarkSite[] } | null {
  const marked = normalizeWs(q.markedPassage);
  if (!marked) return null;
  const re = /\[\[([A-J])\s*:\s*([^\]]*)\]\]/g;
  let plain = "";
  let last = 0;
  const raw: { label: string; charOffset: number; expr: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(marked))) {
    plain += marked.slice(last, m.index);
    raw.push({ label: `(${m[1]})`, charOffset: plain.length, expr: m[2].trim() });
    plain += m[2].trim();
    last = m.index + m[0].length;
  }
  plain += marked.slice(last);
  if (raw.length < 2) return null;
  const tokens = plain.split(/\s+/).filter(Boolean);
  const sites = raw.map((r) => ({
    label: r.label,
    head: cleanToken(r.expr.split(/\s+/)[0] ?? ""),
    tokenIndex: plain.slice(0, r.charOffset).split(/\s+/).filter(Boolean).length,
  }));
  return { tokens, sites };
}

/** 한 미끼 자리가 죽은 이유들(빈 배열이면 살아있는 자리). */
function deadReasons(
  site: MarkSite,
  tokens: string[],
): string[] {
  const reasons: string[] = [];
  const { head, tokenIndex: i } = site;
  if (!head) return reasons;
  const prev = i > 0 ? cleanToken(tokens[i - 1] ?? "") : "";
  const next = cleanToken(tokens[i + 1] ?? "");

  // ① 관사 옆 — "a desired state" 처럼 고정연어 슬롯에 박혀 판정이 발생하지 않는다.
  if (ARTICLES.has(prev)) {
    reasons.push(`관사 '${prev}' 바로 뒤 고정연어 자리`);
  }

  // ② 지시 대상이 붙은 대명사 / 근접 자기확증 — 같은 표면이 지문에 무마킹으로
  //    다시 보이면 학생은 문법이 아니라 눈 대조로 끝낸다.
  //    (실물: "call themselves conservationists" 가 "think of themselves" 를 확증)
  const isReflexive = /(?:self|selves)$/.test(head);
  if (
    isReflexive ||
    (head.length >= 6 && !SELF_CONFIRM_STOPWORDS.has(head))
  ) {
    let near = 0;
    for (let k = 0; k < tokens.length; k += 1) {
      if (k === i) continue;
      if (Math.abs(k - i) > SELF_CONFIRM_WINDOW) continue;
      if (cleanToken(tokens[k] ?? "") === head) near += 1;
    }
    if (near >= 1) {
      reasons.push(
        `같은 표면 '${head}' 가 ${SELF_CONFIRM_WINDOW}단어 이내에 밑줄 없이 다시 등장해 정오를 확증`,
      );
    }
  }

  // ③ by -ing — 전치사 직후는 동명사가 강제돼 고를 것이 없다.
  if (PREPOSITIONS.has(prev) && /ing$/.test(head)) {
    reasons.push(`전치사 '${prev}' 직후라 동명사 형태가 강제되는 자리`);
  }

  // ④ be/조동사 + 부사 + p.p. — 부사 자리가 구조 판단을 발생시키지 않는다.
  //    (실물: "have been closely related")
  if (/ly$/.test(head) && AUXILIARIES.has(prev) && /(?:ed|en)$/.test(next)) {
    reasons.push(`'${prev} __ ${next}' 사이의 부사라 형태 판단이 발생하지 않는 자리`);
  }

  return reasons;
}

/**
 * 어법 KILLER v2 산출물의 죽은 미끼를 적발한다. 정답 라벨은 검사하지 않는다 —
 * v2 프롬프트의 실격 목록은 **미끼 4개**에 대한 규정이기 때문이다(정답에 적용하면
 * 실기출 6건이 오반려됐다, 26-08-21 실측).
 *
 * @returns 죽은 미끼가 임계 이상이면 재생성 피드백 문자열 1건, 아니면 빈 배열.
 */
export function gateGrammarKillerDeadDecoys(
  q: MdGrammarQuestion,
): string[] {
  if (!isGrammarKillerDecoyGateEnabled()) return [];
  const read = readMarkSites(q);
  if (!read) return [];
  const { tokens, sites } = read;

  const answerLabels = new Set(
    (q.answers?.length ? q.answers : [q.answer]).filter(Boolean),
  );
  const dead: { label: string; head: string; reasons: string[] }[] = [];
  for (const site of sites) {
    if (answerLabels.has(site.label)) continue; // 정답 자리는 대상 아님
    const reasons = deadReasons(site, tokens);
    if (reasons.length > 0) {
      dead.push({ label: site.label, head: site.head, reasons });
    }
  }
  if (dead.length < DEAD_DECOY_LIMIT) return [];

  const detail = dead
    .map((d) => `${d.label} '${d.head}' — ${d.reasons.join(" / ")}`)
    .join(" · ");
  return [
    `죽은 미끼 ${dead.length}개 — ${detail}. 이 자리들은 상위권이 검토조차 하지 않아 실질 선택지가 ${5 - dead.length}개로 줄어든다. 해당 밑줄을 지문 안의 다른 자리로 옮겨라 — 각 미끼는 "학생이 구체적으로 무엇으로 잘못 고치고 싶어지는지"를 한 단어로 말할 수 있어야 한다.`,
  ];
}
