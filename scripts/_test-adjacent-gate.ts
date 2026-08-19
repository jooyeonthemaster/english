// 인접 게이트 픽스처 (26-08-18 O225 문장 경계 예외 + 26-08-19 짧은 지문 완화) — API 0콜.
import { gateMdQuestion, parseMdGrammar } from "../src/lib/md-qgen/parser";
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) pass++; else { fail++; console.error("FAIL", n, d ?? ""); } };
const mk = (marked: string, fix = "continues", answer = "(E)") => `밑줄지문:\n${marked}\n\n원형·포인트:\n(A) playing | k\n(B) Reconsidering | c\n(C) won | i\n(D) played | i\n(E) continue | d\n정답: ${answer}\n고침: ${fix}\n해설: 단수 주어이므로 continues 가 옳습니다.\n오답:\n(A) 동명사 목적어로 옳습니다.\n(B) 분사구문으로 옳습니다.\n(C) 과거 동사로 옳습니다.\n(D) 병렬 과거 동사로 옳습니다.`;

// ── 장문(5문장 이상) — 종전 3단어 임계 유지 ────────────────────────────────
const P5 = "He gave up playing the piano. Reconsidering the convention, he focused on works for the left hand. In 1949, he won the award and then played concerts worldwide. Critics praised the performances. His commitment continue today.";
// 1) 문장 경계를 넘는 2단어 간격 — 통과해야 함
{
  const q = parseMdGrammar(mk("He gave up [[A:playing]] the piano. [[B:Reconsidering]] the convention, he focused on works for the left hand. In 1949, he [[C:won]] the award and then [[D:played]] concerts worldwide. Critics praised the performances. His commitment [[E:continue]] today."));
  const issues = gateMdQuestion(q, P5, { markerCount: 5, answerCount: 1 });
  check("장문: 문장 경계 넘는 인접은 통과", !issues.some(i => i.includes("인접")), JSON.stringify(issues));
}
// 2) 같은 문장 안 1단어 간격 — 장문에서는 여전히 반려(재구성은 정합하게 유지)
{
  const q = parseMdGrammar(`밑줄지문:\nHe gave up [[A:playing]] the piano. Reconsidering the convention, he focused on works for the left hand. In 1949, he [[B:won]] the [[C:award]] and then played concerts worldwide. Critics [[D:praised]] the performances. His commitment [[E:continue]] today.\n\n원형·포인트:\n(A) playing | k\n(B) won | i\n(C) award | a\n(D) praised | i\n(E) continue | d\n정답: (E)\n고침: continues\n해설: 단수 주어이므로 continues 가 옳습니다.\n오답:\n(A) 동명사 목적어로 옳습니다.\n(B) 과거 동사로 옳습니다.\n(C) 명사 목적어로 옳습니다.\n(D) 과거 동사로 옳습니다.`);
  const issues = gateMdQuestion(q, P5, { markerCount: 5, answerCount: 1 });
  check("장문: 같은 문장 내 1단어 간격은 반려", issues.some(i => i.includes("인접")), JSON.stringify(issues));
}

// ── 짧은 지문(문장 5개 미만) — 임계 1단어로 완화(26-08-19, 23번 계통 원큐) ──
const PS = "Conformity in the teenage years has been studied by putting young people in situations where they are asked to make a choice. The fascinating thing about the results is that conformity is not spread equally across all groups.";
// 3) 짧은 지문: 같은 문장 내 1단어 간격 — 통과해야 함(종전엔 반려 → 잡 실패·환불)
{
  const q = parseMdGrammar(mk("Conformity in the teenage years has been [[A:studied]] by [[B:putting]] young [[C:people]] in situations [[D:where]] they are asked to make a choice. The fascinating thing about the results is that conformity is not spread [[E:equally]] across all groups.", "equally", "(E)"));
  const issues = gateMdQuestion(q, PS, { markerCount: 5, answerCount: 1 });
  check("짧은 지문: 1단어 간격은 통과", !issues.some(i => i.includes("인접")), JSON.stringify(issues));
}
// 4) 짧은 지문: 0단어 간격(연속 밑줄) — 여전히 반려
{
  const q = parseMdGrammar(mk("Conformity in the teenage years has been [[A:studied]] [[B:putting]] young [[C:people]] in situations [[D:where]] they are asked to make a choice. The fascinating thing about the results is that conformity is not spread [[E:equally]] across all groups.", "equally", "(E)"));
  const issues = gateMdQuestion(q, PS, { markerCount: 5, answerCount: 1 });
  check("짧은 지문: 0단어 간격은 반려", issues.some(i => i.includes("인접")), JSON.stringify(issues));
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
