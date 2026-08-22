// luna 확장형(어법 비표준 N·K + 다중 빈칸 2~3) 0원 결정론 픽스처 (26-08-14 캠페인).
// 실행: node_modules/.bin/tsx scripts/_test-luna-lane-formats.ts
import {
  adaptLunaGrammarJsonNK,
  adaptLunaMultiBlankJson,
  buildLunaGrammarJsonSchemaNK,
  buildLunaGrammarSelfcheckNK,
  buildLunaMultiBlankJsonSchema,
  buildLunaMultiBlankSelfcheck,
  MULTIBLANK_VALUE_SEPARATOR,
} from "../src/lib/md-qgen/luna-lane";
import {
  LUNA_GRAMMAR_NK_BRIDGE_SPECS,
  LUNA_MULTIBLANK_BRIDGE_SPECS,
  LunaJsonMdBridge,
} from "../src/lib/md-qgen/luna-stream-bridge";
import {
  autoSnapGrammarMarks,
  gateMdMultiBlank,
  gateMdQuestion,
} from "../src/lib/md-qgen/parser";
import {
  adaptMdGrammarToAiQuestion,
  adaptMdMultiBlankToAiQuestion,
} from "../src/lib/md-qgen/adapter";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

const PASSAGE =
  "The researchers who study urban wildlife in crowded cities have discovered that many species adapt quickly to city environments. " +
  "Raccoons, for example, have learned to open containers and boxes that were designed to keep them out. " +
  "What surprises scientists most is the speed at which these behaviors spread through populations. " +
  "Young animals watch their mothers closely and imitate the techniques that prove successful. " +
  "As cities grow, the animals living in them will continue to develop skills that their rural cousins never need.";

// ── ① 어법 비표준 7·2 ───────────────────────────────────────────────────────
{
  const NK = {
    markedPassage: PASSAGE.replace("who", "[[A:who]]")
      .replace("have discovered", "[[B:has discovered]]")
      .replace("to open", "[[C:to open]]")
      .replace("were designed", "[[D:were designed]]")
      .replace("at which", "[[E:which]]")
      .replace("watch", "[[F:watch]]")
      .replace("living", "[[G:living]]"),
    marks: [
      { label: "(A)", shown: "who", original: "who", code: "b" },
      { label: "(B)", shown: "has discovered", original: "have discovered", code: "d" },
      { label: "(C)", shown: "to open", original: "to open", code: "k" },
      { label: "(D)", shown: "were designed", original: "were designed", code: "e" },
      { label: "(E)", shown: "which", original: "at which", code: "b" },
      { label: "(F)", shown: "watch", original: "watch", code: "a" },
      { label: "(G)", shown: "living", original: "living", code: "c" },
    ],
    answers: ["(B)", "(E)"],
    fixes: [
      { label: "(B)", fix: "have discovered" },
      { label: "(E)", fix: "at which" },
    ],
    explanation:
      "(B)는 복수 주어 The researchers 에 호응해야 하므로 have 가 필요합니다. (E)는 the speed 를 받는 전치사+관계사 자리이므로 at which 가 필요합니다.",
    wrong: [
      { label: "(G)", text: "능동 수식 현재분사라 옳습니다." },
      { label: "(A)", text: "사람 선행사의 주격 관계대명사라 옳습니다." },
      { label: "(D)", text: "수동 관계라 옳습니다." },
      { label: "(F)", text: "복수 주어와 수일치라 옳습니다." },
      { label: "(C)", text: "learn 의 to부정사 목적어라 옳습니다." },
    ],
  };
  const adapted = adaptLunaGrammarJsonNK(JSON.stringify(NK));
  const snapped = autoSnapGrammarMarks(adapted.question, PASSAGE);
  const issues = gateMdQuestion(snapped.question, PASSAGE, { markerCount: 7, answerCount: 2 });
  check("NK 7·2: 게이트 클린", adapted.issues.length === 0 && issues.length === 0, issues.join("; "));
  check(
    "NK 7·2: fixes 맵 귀속 + 오답 정렬",
    snapped.question.fixes["(B)"] === "have discovered" &&
      snapped.question.fixes["(E)"] === "at which" &&
      snapped.question.wrong.map((w) => w.label).join("") === "(A)(C)(D)(F)(G)",
  );
  const adapt = adaptMdGrammarToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("NK 7·2: 레거시 어댑터 왕복 ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  // 음성테스트: 정답 라벨 수 ≠ 설정.
  const oneAnswer = { ...NK, answers: ["(B)"], fixes: [{ label: "(B)", fix: "have discovered" }] };
  const oneAdapted = adaptLunaGrammarJsonNK(JSON.stringify(oneAnswer));
  check(
    "NK 음성테스트: 정답 1개(설정 2) 반려",
    gateMdQuestion(autoSnapGrammarMarks(oneAdapted.question, PASSAGE).question, PASSAGE, {
      markerCount: 7,
      answerCount: 2,
    }).length > 0,
  );
  // 스키마·검산 동적 파라미터.
  const spec = buildLunaGrammarJsonSchemaNK(7, 2) as any;
  check(
    "NK 스키마: 동적 계수",
    spec.schema.properties.marks.minItems === 7 &&
      spec.schema.properties.answers.minItems === 2 &&
      spec.schema.properties.wrong.minItems === 5,
  );
  check(
    "NK 검산: 계수·복수정답 규칙 포함",
    buildLunaGrammarSelfcheckNK(7, 2).includes("7개") &&
      buildLunaGrammarSelfcheckNK(7, 2).includes("서로 다른 문장"),
  );
  // 브릿지.
  const json = JSON.stringify(NK);
  let out = "";
  const bridge = new LunaJsonMdBridge(LUNA_GRAMMAR_NK_BRIDGE_SPECS, (d) => (out += d));
  for (let i = 0; i < json.length; i += 7) bridge.push(json.slice(i, i + 7));
  check(
    "NK 브릿지: 복수정답 한 줄(머리표 1회) + 고침 + JSON 무노출",
    out.includes("[[A:who]]") &&
      out.includes("\n정답: (B), (E)") &&
      !/정답: [^\n]*\n정답:/.test(out) &&
      out.includes("\n고침(B): have discovered") &&
      !out.includes("{"),
    out.slice(0, 200),
  );
}

// ── ② 다중 빈칸 2 ───────────────────────────────────────────────────────────
{
  const MB = {
    blanks: [
      { label: "(A)", expression: "adapt quickly to city environments" },
      { label: "(B)", expression: "imitate the techniques that prove successful" },
    ],
    options: [
      { label: "①", blankValues: ["adapt quickly to city environments", "imitate the techniques that prove successful"] },
      { label: "②", blankValues: ["abandon their natural habitats", "reject the methods of their mothers"] },
      { label: "③", blankValues: ["adapt quickly to city environments", "reject the methods of their mothers"] },
      { label: "④", blankValues: ["compete fiercely for scarce food", "imitate the techniques that prove successful"] },
      { label: "⑤", blankValues: ["compete fiercely for scarce food", "invent entirely new survival rules"] },
    ],
    answer: "①",
    explanation: "도시 적응과 모방 학습이라는 두 축을 원문 그대로 담은 ①이 정답입니다.",
    wrong: [
      { label: "⑤", text: "경쟁·발명은 지문에 없는 방향입니다." },
      { label: "②", text: "서식지 포기는 방향 반전입니다." },
      { label: "④", text: "먹이 경쟁은 근거가 없습니다(near-miss)." },
      { label: "③", text: "모방 거부는 마지막 문장과 정면 충돌합니다(near-miss)." },
    ],
  };
  const { question } = adaptLunaMultiBlankJson(JSON.stringify(MB));
  check(
    "다중2: text 조립(계약 구분자) + 오답 정렬",
    question.options[0].text ===
      `adapt quickly to city environments${MULTIBLANK_VALUE_SEPARATOR}imitate the techniques that prove successful` &&
      question.wrong.map((w) => w.label).join("") === "②③④⑤",
  );
  const issues = gateMdMultiBlank(question, PASSAGE, { blankCount: 2 });
  check("다중2: 게이트 클린", issues.length === 0, issues.join("; "));
  const adapt = adaptMdMultiBlankToAiQuestion(question, PASSAGE, "KILLER", "SOURCE_EXACT");
  check("다중2: 레거시 어댑터 왕복 ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  // 음성테스트: 비축자 빈칸원문 / 값 수 불일치.
  const badExpr = {
    ...MB,
    blanks: [MB.blanks[0], { label: "(B)", expression: "copy the [빈칸] of their mothers" }],
  };
  check(
    "다중2 음성테스트: 비축자 빈칸원문 반려",
    gateMdMultiBlank(adaptLunaMultiBlankJson(JSON.stringify(badExpr)).question, PASSAGE, {
      blankCount: 2,
    }).length > 0,
  );
  const badValues = {
    ...MB,
    options: MB.options.map((o, i) => (i === 2 ? { ...o, blankValues: [o.blankValues[0]] } : o)),
  };
  check(
    "다중2 음성테스트: 값 수 불일치 반려",
    gateMdMultiBlank(adaptLunaMultiBlankJson(JSON.stringify(badValues)).question, PASSAGE, {
      blankCount: 2,
    }).length > 0,
  );
  const spec = buildLunaMultiBlankJsonSchema(3) as any;
  check(
    "다중 스키마: blankCount 3 동적",
    spec.schema.properties.blanks.minItems === 3 &&
      spec.schema.properties.options.items.properties.blankValues.minItems === 3,
  );
  check("다중 검산: 라벨 런 포함", buildLunaMultiBlankSelfcheck(2).includes("(A)(B)"));
  // 브릿지.
  const json = JSON.stringify(MB);
  let out = "";
  const bridge = new LunaJsonMdBridge(LUNA_MULTIBLANK_BRIDGE_SPECS, (d) => (out += d));
  for (let i = 0; i < json.length; i += 5) bridge.push(json.slice(i, i + 5));
  check(
    "다중 브릿지: 조합값 기출 구분자(사이에만) + JSON 무노출",
    out.includes("\n빈칸원문(A): adapt quickly") &&
      out.includes(
        "\n① adapt quickly to city environments …… imitate the techniques that prove successful",
      ) &&
      out.includes("\n\n정답: ①") &&
      !out.includes("{"),
    out.slice(0, 260),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
