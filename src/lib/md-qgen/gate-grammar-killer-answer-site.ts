// ============================================================================
// 어법 KILLER 「요란한 첫 자리 정답」 0원 결정형 게이트 — LLM 콜 없음.
//
// 배경(26-08-22 실측): 실물 산출물이 정답을 ①because(→because of)에 두었다.
// 접속사/전치사 자리는 판정 단서(뒤따르는 명사구/절)가 밑줄 **바로 옆**이라
// v2 프롬프트의 정답 하한(단서 ≥5단어·개입 구조 ≥1)을 정의상 통과할 수 없고,
// 그것이 첫 밑줄(①)에 놓이면 학생(솔버)이 읽기 순서상 가장 먼저 만나 즉시
// 종결한다. A/B 실측(n=10×2): 이 문항의 미끼 검토가 **전멸**했다 — 미끼 생존
// 0.00 vs 실기출 0.79 vs 같은 지문 직전 산출물(정답 ④them) 0.90. 정답 자리
// 하나가 문항 전체를 죽였다.
//
// 임계 근거(실기출 실측, 156문항 마커 복원본):
//   · 정답 라벨 분포 ① 6.4% / ② 21.8% / ③ 23.7% / ④ 27.6% / ⑤ 20.5%
//     — 기출은 정답을 첫 밑줄에 거의 두지 않는다.
//   · 접속사/전치사류가 정답인 기출 실물은 1건("while a crash")뿐이고 그것도
//     **④** 자리다. 「① + 접속사/전치사류 정답」 복합 조건은 기출 0건 —
//     이 게이트의 오반려율 0.0%(156/156 통과).
// 두 신호를 단독으로 쓰면 오반려한다(① 단독 6.4%, 접속사류 단독 0.64%) —
// 반드시 복합 조건으로만 반려한다.
//
// ⚠ 메시지는 그대로 [반려 재생성] 프롬프트의 피드백이 된다 — 왜 죽는지와
//   어디로 옮길지를 적는다.
//
// 킬스위치: env QGEN_GRAMMAR_KILLER_ANSWER_SITE_GATE=off (재빌드 불필요).
// ============================================================================

import { normalizeWs, type MdGrammarQuestion } from "./parser";

export function isGrammarKillerAnswerSiteGateEnabled(): boolean {
  return (
    process.env.QGEN_GRAMMAR_KILLER_ANSWER_SITE_GATE?.trim().toLowerCase() !==
    "off"
  );
}

/**
 * 접속사/전치사 판정 계열 — 오형·원형 어느 쪽이든 이 표면이면 단서가 인접한다.
 * (because of 의 because, despite↔although 교체류 포함. 26-08-22 FP 검증에
 * 쓴 집합과 동일하게 유지할 것 — 집합을 넓히면 오반려율을 다시 재야 한다.)
 */
const CONJ_PREP_HEADS = new Set([
  "because", "although", "while", "though", "despite", "during",
  "unless", "whereas", "since",
]);

const MARK_RE = /\[\[([A-J])\s*:\s*([^\]]*)\]\]/g;

/**
 * 어법 KILLER 정답 자리를 검사한다 — 정답이 **첫 번째 밑줄**이면서 표면이
 * 접속사/전치사 판정 계열인 복합 조건만 반려한다.
 *
 * @returns 해당하면 재생성 피드백 1건, 아니면 빈 배열.
 */
export function gateGrammarKillerAnswerSite(q: MdGrammarQuestion): string[] {
  if (!isGrammarKillerAnswerSiteGateEnabled()) return [];
  const marked = normalizeWs(q.markedPassage);
  if (!marked) return [];

  const sites: { label: string; head: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = MARK_RE.exec(marked))) {
    sites.push({
      label: `(${m[1]})`,
      head: (m[2].trim().split(/\s+/)[0] ?? "")
        .replace(/[^A-Za-z'-]/g, "")
        .toLowerCase(),
    });
  }
  if (sites.length < 2) return [];

  const answerLabels = new Set(
    (q.answers?.length ? q.answers : [q.answer]).filter(Boolean),
  );
  const first = sites[0];
  if (!answerLabels.has(first.label)) return [];
  if (!CONJ_PREP_HEADS.has(first.head)) return [];

  return [
    `정답 ${first.label} '${first.head}' — 접속사/전치사 판정은 단서(뒤따르는 명사구/절)가 밑줄 바로 옆이라 즉시 판정되는데, 그것이 첫 밑줄이라 학생이 읽기 순서상 가장 먼저 만나 나머지 네 자리를 검토하지 않는다(실측: 미끼 검토 전멸, 기출에서 「첫 밑줄 + 접속사/전치사 정답」은 0건). 정답을 지문 중후반의 다른 자리(단서가 5단어 이상 떨어진 구조 판단 자리)로 옮기고, 이 자리는 밑줄에서 빼거나 미끼로 강등하라.`,
  ];
}
