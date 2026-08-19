// md 다중 형식 결정론 픽스처 테스트 (26-07-23 스펙 v1 — U5 검증)
// 다중 빈칸 2·3 파싱/게이트, 어법 7·2(고침(X) 라벨식)·5·1 구형식 회귀·K=N,
// 자동 스냅(다중 빈칸·어법 미끼 원형 교정), 어댑터·후처리 형상까지 0원 검증.
// 실행: npx tsx scripts/_test-md-multi-formats.ts
import {
  INLINE_MARK_RE,
  autoSnapGrammarMarks,
  autoSnapMultiBlankExpressions,
  circledForMarkIndex,
  gateMdMultiBlank,
  gateMdQuestion,
  parseMdGrammar,
  parseMdMultiBlank,
  type MdGrammarQuestion,
  type MdMultiBlankQuestion,
} from "../src/lib/md-qgen/parser";
import {
  adaptMdGrammarToAiQuestion,
  adaptMdMultiBlankToAiQuestion,
} from "../src/lib/md-qgen/adapter";
import { postProcessQuestion } from "../src/lib/question-postprocess";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 다중 빈칸 (blankCount 2·3)
// ───────────────────────────────────────────────────────────────────────────
const MB_PASSAGE =
  "Coral reefs support a quarter of all marine life despite covering less than one percent of the ocean floor. " +
  "Their calcium structures provide shelter for countless species that would otherwise fall prey to predators. " +
  "Rising water temperatures force corals to expel the algae that supply most of their energy. " +
  "Without these partners, the corals turn white and begin to starve. " +
  "Scientists now breed heat-tolerant strains in the hope of rebuilding damaged reefs.";

const MB2_TEXT = `빈칸원문(A): provide shelter for countless species
빈칸원문(B): expel the algae that supply most of their energy
① offer refuge to numerous organisms …… absorb the nutrients that fuel growth
② guard their own territory fiercely …… eject the partners that power them
③ shield a vast range of creatures …… discharge the organisms that feed them
④ shield a vast range of creatures …… strengthen the bonds that sustain them
⑤ compete with invading species …… discharge the organisms that feed them
정답: ③
해설: 두 번째 문장은 산호 구조가 뭇 생물의 피난처임을 말하고, 세 번째 문장은 수온 상승이 에너지 공급원을 방출하게 함을 말합니다. 두 근거를 종합하면 ③의 조합이 가장 적절합니다.
오답:
① 첫 값은 그럴듯하나 두 번째 값이 영양 흡수로 방향이 반대입니다.
② 첫 값이 지문에 없는 영역 다툼 서사로 어긋납니다.
④ 첫 값은 정답과 같지만 두 번째 값이 유대 강화로 반대인 near-miss 입니다.
⑤ 첫 값이 경쟁 서사로 지문 밖 개념입니다.`;

const mb2 = parseMdMultiBlank(MB2_TEXT);
check("빈칸2 파싱: blanks 2·라벨 (A)(B)", mb2.blanks.length === 2 && mb2.blanks[0].label === "(A)" && mb2.blanks[1].label === "(B)");
check("빈칸2 파싱: 선지 5·각 blankValues 2", mb2.options.length === 5 && mb2.options.every((o) => o.blankValues.length === 2));
check("빈칸2 파싱: 정답 ③·오답 4(정답 라벨 제외)", mb2.answer === "③" && mb2.wrong.length === 4 && mb2.wrong.every((w) => w.label !== "③"));
check("빈칸2 파싱: 해설 오답 직전까지", mb2.explanation.endsWith("가장 적절합니다.") && !mb2.explanation.includes("오답"));
{
  const issues = gateMdMultiBlank(mb2, MB_PASSAGE, { blankCount: 2 });
  check("빈칸2 게이트: 클린", issues.length === 0, issues.join("; "));
}
{
  // blankCount 설정 3인데 2개 출력 — 개수 드리프트 반려
  const issues = gateMdMultiBlank(mb2, MB_PASSAGE, { blankCount: 3 });
  check("빈칸2 게이트: blankCount=3 강제 시 개수 반려", issues.some((i) => i.includes("2개") && i.includes("3개")), issues.join("; "));
}
{
  // 축자 아님 반려
  const bad: MdMultiBlankQuestion = {
    ...mb2,
    blanks: [mb2.blanks[0], { label: "(B)", expression: "expel the algae that fuel most of their energy" }],
  };
  const issues = gateMdMultiBlank(bad, MB_PASSAGE, { blankCount: 2 });
  check("빈칸2 게이트: 비축자 빈칸원문 반려", issues.some((i) => i.includes("(B)") && i.includes("축자로 없음")), issues.join("; "));
}
{
  // 구간 겹침(같은 자리) 반려
  const bad: MdMultiBlankQuestion = {
    ...mb2,
    blanks: [
      { label: "(A)", expression: "provide shelter for countless species" },
      { label: "(B)", expression: "shelter for countless species that would" },
    ],
  };
  const issues = gateMdMultiBlank(bad, MB_PASSAGE, { blankCount: 2 });
  check("빈칸2 게이트: 구간 겹침 반려", issues.some((i) => i.includes("겹침")), issues.join("; "));
}
{
  // 선지 값 개수 불일치 반려
  const bad: MdMultiBlankQuestion = {
    ...mb2,
    options: mb2.options.map((o, i) => (i === 2 ? { ...o, blankValues: [o.blankValues[0]] } : o)),
  };
  const issues = gateMdMultiBlank(bad, MB_PASSAGE, { blankCount: 2 });
  check("빈칸2 게이트: 선지 값 1개 반려", issues.some((i) => i.includes("③") && i.includes("1개")), issues.join("; "));
}
{
  // 드리프트 관용: 오답 목록에 정답 줄이 껴도 파서가 걸러 4개
  const drift = MB2_TEXT.replace("오답:\n①", "오답:\n③ (정답)\n①");
  const q = parseMdMultiBlank(drift);
  check("빈칸2 관용: 오답 속 정답 줄 필터", q.wrong.length === 4 && q.wrong.every((w) => w.label !== "③"));
}
{
  // 구분자 공백 드리프트 관용: "……" 붙여 써도 split
  const drift = MB2_TEXT.replace(
    "① offer refuge to numerous organisms …… absorb the nutrients that fuel growth",
    "① offer refuge to numerous organisms……absorb the nutrients that fuel growth",
  );
  const q = parseMdMultiBlank(drift);
  check("빈칸2 관용: 구분자 공백 드리프트", q.options[0].blankValues.length === 2);
}
{
  // 자동 스냅: (B) 내부 1단어 어긋남 → 지문 축자로 스냅 → 게이트 클린
  const drifted: MdMultiBlankQuestion = {
    ...mb2,
    blanks: [mb2.blanks[0], { label: "(B)", expression: "expel the algae which supply most" }],
  };
  const snapped = autoSnapMultiBlankExpressions(drifted, MB_PASSAGE);
  const snapOk =
    snapped.corrections.length === 1 &&
    snapped.question.blanks[1].expression === "expel the algae that supply most" &&
    snapped.question.blanks[0].expression === mb2.blanks[0].expression;
  check("빈칸2 스냅: 내부 1단어 어긋남 축자 스냅(타 빈칸 무변경)", snapOk, JSON.stringify(snapped.corrections));
  const issues = gateMdMultiBlank(snapped.question, MB_PASSAGE, { blankCount: 2 });
  check("빈칸2 스냅: 스냅 후 게이트 클린", issues.length === 0, issues.join("; "));
}

const MB3_TEXT = `빈칸원문(A): provide shelter for countless species
빈칸원문(B): expel the algae that supply most of their energy
빈칸원문(C): breed heat-tolerant strains
① offer refuge to numerous organisms …… absorb the nutrients that fuel growth …… abandon damaged colonies entirely
② shield a vast range of creatures …… discharge the organisms that feed them …… cultivate temperature-resistant varieties
③ guard their own territory fiercely …… eject the partners that power them …… cultivate temperature-resistant varieties
④ shield a vast range of creatures …… strengthen the bonds that sustain them …… abandon damaged colonies entirely
⑤ compete with invading species …… discharge the organisms that feed them …… monitor reef decline passively
정답: ②
해설: 산호 구조의 역할, 수온 상승의 결과, 과학자들의 대응이 각각 두 번째·세 번째·다섯 번째 문장에 근거합니다. 세 근거를 종합하면 ②의 조합이 가장 적절합니다.
오답:
① 세 번째 값이 포기 서사로 지문과 반대입니다.
③ 첫 값이 지문에 없는 영역 다툼입니다.
④ 두 번째 값이 유대 강화로 반대입니다.
⑤ 세 번째 값이 수동 관찰로 지문의 능동 대응과 어긋납니다.`;

const mb3 = parseMdMultiBlank(MB3_TEXT);
check("빈칸3 파싱: blanks 3·라벨 (A)(B)(C)", mb3.blanks.length === 3 && mb3.blanks.map((b) => b.label).join("") === "(A)(B)(C)");
check("빈칸3 파싱: 각 blankValues 3", mb3.options.length === 5 && mb3.options.every((o) => o.blankValues.length === 3));
{
  const issues = gateMdMultiBlank(mb3, MB_PASSAGE, { blankCount: 3 });
  check("빈칸3 게이트: 클린", issues.length === 0, issues.join("; "));
}
{
  // gateMdQuestion 위임 경로(MdAnyQuestion 유니언)도 동일 결과
  const issues = gateMdQuestion(mb3, MB_PASSAGE);
  check("빈칸3 게이트: gateMdQuestion 위임 클린", issues.length === 0, issues.join("; "));
}

// 다중 빈칸 어댑터 + 후처리 형상 (PARAPHRASE / SOURCE_EXACT)
{
  const adapt = adaptMdMultiBlankToAiQuestion(mb2, MB_PASSAGE, "KILLER", "PARAPHRASE");
  check("빈칸2 어댑터: ok", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check(
    "빈칸2 어댑터: 발문 계약 문자열",
    ai.direction === "다음 글의 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
    String(ai.direction),
  );
  const opts = ai.options as Array<{ label: string; text: string; blankValues: string[] }>;
  check("빈칸2 어댑터: 선지 라벨 1~5·text ' …… ' join", opts.map((o) => o.label).join("") === "12345" && opts[0].text === opts[0].blankValues.join(" …… "));
  check("빈칸2 어댑터: correctAnswer 숫자 라벨", ai.correctAnswer === "3");
  const blanks = ai.blanks as Array<{ label: string; originalExpression: string; surroundingText: string }>;
  check("빈칸2 어댑터: blanks 라벨 (A)(B)·surroundingText 채움", blanks.map((b) => b.label).join("") === "(A)(B)" && blanks.every((b) => b.surroundingText.length > 0));
  const wrongs = ai.wrongOptionExplanations as Array<{ label: string }>;
  check("빈칸2 어댑터: 오답해설 4(숫자 라벨)", wrongs.length === 4 && wrongs.map((w) => w.label).join("") === "1245");

  const pp = postProcessQuestion("BLANK_INFERENCE", MB_PASSAGE, ai);
  check("빈칸2 후처리(PARAPHRASE): success", pp.success === true, pp.error);
  const d = (pp.data ?? {}) as Record<string, unknown>;
  const pwb = String(d.passageWithBlank ?? "");
  check("빈칸2 후처리: passageWithBlank (A)/(B) 마커", pwb.includes("(A) _____") && pwb.includes("(B) _____"));
  const dOpts = d.options as Array<{ label: string; blankValues: string[] }>;
  const correct = dOpts.find((o) => o.label === d.correctAnswer);
  const src = (d.blanks as Array<{ originalExpression: string }>).map((b) => b.originalExpression.toLowerCase());
  const allParaphrased = correct?.blankValues.every((v, i) => v.toLowerCase() !== src[i]) ?? false;
  check("빈칸2 후처리(PARAPHRASE): 정답 blankValues 재진술 보존(축자 미강제)", allParaphrased);
}
{
  // SOURCE_EXACT: 후처리가 정답 조합을 원문 축자로 강제(계약 집행)
  const adapt = adaptMdMultiBlankToAiQuestion(mb2, MB_PASSAGE, "KILLER", "SOURCE_EXACT");
  check("빈칸2 어댑터(SOURCE_EXACT): ok", adapt.ok === true, adapt.error);
  const pp = postProcessQuestion("BLANK_INFERENCE", MB_PASSAGE, (adapt.aiQuestion ?? {}) as Record<string, unknown>);
  check("빈칸2 후처리(SOURCE_EXACT): success", pp.success === true, pp.error);
  const d = (pp.data ?? {}) as Record<string, unknown>;
  const dOpts = d.options as Array<{ label: string; blankValues: string[] }>;
  const correct = dOpts.find((o) => o.label === d.correctAnswer);
  const src = (d.blanks as Array<{ originalExpression: string }>).map((b) => b.originalExpression.toLowerCase());
  const verbatim = correct?.blankValues.every((v, i) => v.toLowerCase() === src[i]) ?? false;
  check("빈칸2 후처리(SOURCE_EXACT): 정답 blankValues 원문 축자 강제", verbatim, JSON.stringify(correct?.blankValues));
}

// ───────────────────────────────────────────────────────────────────────────
// 2. 어법 N마커·K정답
// ───────────────────────────────────────────────────────────────────────────
const GR_PASSAGE =
  "The researchers who study urban wildlife in crowded cities have discovered that many species adapt quickly to city environments. " +
  "Raccoons, for example, have learned to open containers and boxes that were designed to keep them out. " +
  "What surprises scientists most is the speed at which these behaviors spread through populations. " +
  "Young animals watch their mothers closely and imitate the techniques that prove successful. " +
  "As cities grow, the animals living in them will continue to develop skills that their rural cousins never need.";

const GR72_TEXT = `밑줄지문:
The researchers [[A:who study]] urban wildlife in crowded cities [[B:has discovered]] that many species adapt quickly to city environments. Raccoons, for example, have learned [[C:to open]] containers and boxes that [[D:were designed]] to keep them out. What surprises scientists most is the speed [[E:which]] these behaviors spread through populations. Young animals [[F:watch]] their mothers closely and imitate the techniques that prove successful. As cities grow, the animals [[G:living]] in them will continue to develop skills that their rural cousins never need.

원형·포인트:
(A) who study | b
(B) have discovered | d
(C) to open | k
(D) were designed | e
(E) at which | b
(F) watch | a
(G) living | c
정답: (B), (E)
고침(B): have discovered
고침(E): at which
해설: (B)는 주어 The researchers 가 복수이므로 has 가 아니라 have 가 필요합니다. (E)는 the speed 를 선행사로 받는 전치사+관계사 자리이므로 at which 가 필요합니다.
오답:
(A) 선행사가 복수 사람 명사라 who 가 옳습니다.
(C) learn 뒤 to부정사 목적어 자리라 옳습니다.
(D) 주어 containers 와 수동 관계라 옳습니다.
(F) 주어가 복수라 watch 가 옳습니다.
(G) the animals 를 능동 수식하는 현재분사라 옳습니다.`;

const gr72 = parseMdGrammar(GR72_TEXT);
check("어법7·2 파싱: 마커 7·순서 A~G", gr72.marks.length === 7 && gr72.marks.map((m) => m.label).join("") === "(A)(B)(C)(D)(E)(F)(G)");
check("어법7·2 파싱: answers 복수 수집", gr72.answers.length === 2 && gr72.answers.join(",") === "(B),(E)");
check("어법7·2 파싱: 하위호환 answer=첫 정답", gr72.answer === "(B)");
check(
  "어법7·2 파싱: 고침(X) 라벨식 수집 + fix 하위호환",
  gr72.fixes["(B)"] === "have discovered" && gr72.fixes["(E)"] === "at which" && gr72.fix === "have discovered",
);
check("어법7·2 파싱: 오답 5(비정답 라벨만)", gr72.wrong.length === 5 && gr72.wrong.every((w) => w.label !== "(B)" && w.label !== "(E)"));
{
  const issues = gateMdQuestion(gr72, GR_PASSAGE, { markerCount: 7, answerCount: 2 });
  check("어법7·2 게이트: 클린", issues.length === 0, issues.join("; "));
}
{
  // 기본값(5·1) 그대로면 7마커는 반려 — 파라미터화가 기본 동작을 안 바꿈을 확인
  const issues = gateMdQuestion(gr72, GR_PASSAGE);
  check("어법7·2 게이트: 기본 5·1로는 개수 반려(하위호환)", issues.length === 1 && issues[0].includes("7개") && issues[0].includes("5개"), issues.join("; "));
}
{
  // 고침(E) 누락 반려
  const bad: MdGrammarQuestion = { ...gr72, fixes: { "(B)": gr72.fixes["(B)"] } };
  const issues = gateMdQuestion(bad, GR_PASSAGE, { markerCount: 7, answerCount: 2 });
  check("어법7·2 게이트: 고침 라벨 누락 반려", issues.some((i) => i.includes("고침((E)) 누락")), issues.join("; "));
}
{
  // 변형 밑줄 수 ≠ 정답 수 반려 (F 도 오형으로)
  const bad: MdGrammarQuestion = {
    ...gr72,
    marks: gr72.marks.map((m) => (m.label === "(F)" ? { ...m, shown: "watches" } : m)),
  };
  const issues = gateMdQuestion(bad, GR_PASSAGE, { markerCount: 7, answerCount: 2 });
  check("어법7·2 게이트: 변형 3개 반려", issues.some((i) => i.includes("변형 밑줄 3개")), issues.join("; "));
}
{
  // 정답 라벨 집합과 변형 집합 불일치 반려
  const bad: MdGrammarQuestion = {
    ...gr72,
    answers: ["(B)", "(F)"],
    fixes: { "(B)": "have discovered", "(F)": "watch" },
  };
  const issues = gateMdQuestion(bad, GR_PASSAGE, { markerCount: 7, answerCount: 2 });
  check("어법7·2 게이트: 정답·변형 라벨 불일치 반려", issues.some((i) => i.includes("불일치")), issues.join("; "));
}
{
  // 미끼 원형 교정(집합 기반): 미끼 (A) 원형이 표시형과 다르게 적힌 드리프트 → 표시형으로 스냅
  const drifted: MdGrammarQuestion = {
    ...gr72,
    marks: gr72.marks.map((m) => (m.label === "(A)" ? { ...m, original: "who studies" } : m)),
  };
  const snapped = autoSnapGrammarMarks(drifted, GR_PASSAGE);
  const a = snapped.question.marks.find((m) => m.label === "(A)");
  check("어법7·2 스냅: 미끼 원형 교정(정답 집합 기준)", snapped.corrections.length === 1 && a?.original === "who study", JSON.stringify(snapped.corrections));
  const issues = gateMdQuestion(snapped.question, GR_PASSAGE, { markerCount: 7, answerCount: 2 });
  check("어법7·2 스냅: 교정 후 게이트 클린", issues.length === 0, issues.join("; "));
}

// 어법 7·2 어댑터 형상
{
  const adapt = adaptMdGrammarToAiQuestion(gr72, GR_PASSAGE, "KILLER");
  check("어법7·2 어댑터: ok", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check("어법7·2 어댑터: 발문 '모두 고르시오'", ai.direction === "다음 글의 밑줄 친 부분 중, 어법상 틀린 것을 모두 고르시오.", String(ai.direction));
  check("어법7·2 어댑터: correctAnswers·correctAnswer 병기", JSON.stringify(ai.correctAnswers) === '["(B)","(E)"]' && ai.correctAnswer === "(B), (E)");
  const mes = ai.markedExpressions as Array<{ label: string; isError: boolean; correction?: string; errorExpression: string; expression: string }>;
  check("어법7·2 어댑터: isError 집합 = {B,E}", mes.filter((m) => m.isError).map((m) => m.label).join(",") === "(B),(E)");
  check(
    "어법7·2 어댑터: 정답 correction=fixes·미끼 errorExpression=원문",
    mes.find((m) => m.label === "(B)")?.correction === "have discovered" &&
      mes.find((m) => m.label === "(E)")?.correction === "at which" &&
      mes.filter((m) => !m.isError).every((m) => m.errorExpression === m.expression),
  );
  const opts = ai.options as Array<{ label: string }>;
  check("어법7·2 어댑터: 선지 라벨 ①~⑦", opts.length === 7 && opts[6].label === "⑦");
  const wrongs = ai.wrongOptionExplanations as Array<{ label: string }>;
  check("어법7·2 어댑터: 오답해설 5", wrongs.length === 5);
}

// 어법 5·1 구형식 회귀
const GR51_TEXT = `밑줄지문:
The researchers [[A:who study]] urban wildlife in crowded cities [[B:have discovered]] that many species adapt quickly to city environments. Raccoons, for example, have learned [[C:opening]] containers and boxes that [[D:were designed]] to keep them out. What surprises scientists most is the speed at which these behaviors spread through populations. Young animals [[E:watch]] their mothers closely and imitate the techniques that prove successful. As cities grow, the animals living in them will continue to develop skills that their rural cousins never need.

원형·포인트:
(A) who study | b
(B) have discovered | d
(C) to open | k
(D) were designed | e
(E) watch | a
정답: (C)
고침: to open
해설: learn 은 to부정사를 목적어로 취하므로 opening 이 아니라 to open 이 필요합니다.
오답:
(A) 선행사가 복수 사람 명사라 who 가 옳습니다.
(B) 주어가 복수라 have 가 옳습니다.
(D) 주어와 수동 관계라 옳습니다.
(E) 주어가 복수라 watch 가 옳습니다.`;

const gr51 = parseMdGrammar(GR51_TEXT);
check(
  "어법5·1 구형식 회귀: answer/fix + answers/fixes 귀속",
  gr51.answer === "(C)" && gr51.fix === "to open" && gr51.answers.join("") === "(C)" && gr51.fixes["(C)"] === "to open",
);
{
  const issues = gateMdQuestion(gr51, GR_PASSAGE);
  check("어법5·1 구형식 회귀: 기본 게이트 클린", issues.length === 0, issues.join("; "));
  const issuesExplicit = gateMdQuestion(gr51, GR_PASSAGE, { markerCount: 5, answerCount: 1 });
  check("어법5·1 구형식 회귀: 명시 5·1 게이트 동일", issuesExplicit.length === 0, issuesExplicit.join("; "));
}
{
  const adapt = adaptMdGrammarToAiQuestion(gr51, GR_PASSAGE, "KILLER");
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check("어법5·1 어댑터: 단일 발문·correctAnswer 유지", adapt.ok === true && ai.direction === "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?" && ai.correctAnswer === "(C)");
  const mes = ai.markedExpressions as Array<{ label: string; isError: boolean; correction?: string }>;
  check("어법5·1 어댑터: isError 단일·correction 구형 고침", mes.filter((m) => m.isError).length === 1 && mes.find((m) => m.label === "(C)")?.correction === "to open");
}

// 어법 K=N (5·5) — 오답 섹션 생략 허용
const GR55_TEXT = `밑줄지문:
The researchers [[A:which study]] urban wildlife in crowded cities [[B:has discovered]] that many species adapt quickly to city environments. Raccoons, for example, have learned [[C:opening]] containers and boxes that [[D:designing]] to keep them out. What surprises scientists most is the speed at which these behaviors spread through populations. Young animals [[E:watches]] their mothers closely and imitate the techniques that prove successful. As cities grow, the animals living in them will continue to develop skills that their rural cousins never need.

원형·포인트:
(A) who study | b
(B) have discovered | d
(C) to open | k
(D) were designed | e
(E) watch | a
정답: (A), (B), (C), (D), (E)
고침(A): who study
고침(B): have discovered
고침(C): to open
고침(D): were designed
고침(E): watch
해설: 다섯 자리 모두 오형입니다. (A)는 사람 선행사, (B)는 복수 수일치, (C)는 to부정사 목적어, (D)는 수동태, (E)는 복수 수일치가 각각 필요합니다.`;

const gr55 = parseMdGrammar(GR55_TEXT);
check("어법5·5 파싱: answers 5·오답 0", gr55.answers.length === 5 && gr55.wrong.length === 0);
{
  const issues = gateMdQuestion(gr55, GR_PASSAGE, { markerCount: 5, answerCount: 5 });
  check("어법5·5 게이트: K=N 클린(오답 생략 허용)", issues.length === 0, issues.join("; "));
}
{
  const adapt = adaptMdGrammarToAiQuestion(gr55, GR_PASSAGE, "KILLER");
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const mes = ai.markedExpressions as Array<{ isError: boolean }>;
  const wrongs = ai.wrongOptionExplanations as Array<unknown>;
  check(
    "어법5·5 어댑터: 전마커 isError·오답해설 0·모두 고르시오",
    adapt.ok === true && mes.every((m) => m.isError) && wrongs.length === 0 && String(ai.direction).includes("모두 고르시오"),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 파서 소도구 확장 (라벨 A~J · 원형숫자 ①~⑩)
// ───────────────────────────────────────────────────────────────────────────
{
  const matches = [..."before [[J:never need]] after".matchAll(INLINE_MARK_RE)];
  check("INLINE_MARK_RE: 라벨 J 매칭", matches.length === 1 && matches[0][1] === "J" && matches[0][2] === "never need");
  check("circledForMarkIndex: ⑦·⑩ 확장", circledForMarkIndex(6) === "⑦" && circledForMarkIndex(9) === "⑩");
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
