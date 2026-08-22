// SUMMARY_COMPLETE_MC luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-summary-complete-mc.ts
import { SUMMARY_COMPLETE_MC_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/summary-complete-mc";
import { SUMMARY_COMPLETE_MC_MD_LANE } from "../src/lib/md-qgen/lane-summary-mc";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdSummaryMcQuestion } from "../src/lib/md-qgen/parser-summary-mc";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

const PASSAGE =
  "Urban wildlife has learned to thrive in cities. Raccoons open containers that were designed to keep them out, and crows drop nuts onto crosswalks so passing cars crack them open. " +
  "Researchers who track these behaviors find that they spread quickly through populations, as young animals imitate the techniques that prove successful. " +
  "The lesson is clear: cities are not biological deserts but engines of rapid adaptation, and the animals that master them are rewriting what we thought we knew about learning in the wild.";

const ctx: MdLaneContext = {
  passage: PASSAGE,
  difficulty: "KILLER",
  rawDifficulty: "KILLER",
  resolved: {},
  rawTypeSettings: null,
  teacherPoints: [],
  variantIndex: 0,
  variantCount: 1,
};

// 정상 픽스처 — KILLER 전 게이트(반쪽 정답 2종 + 의미장 함정 강도까지) 통과 설계.
// 정답 ③ adaptive(evolutionary 의미장) …… social(equality 의미장).
//  · ① aOnly: 정답 (A) 그대로 + 같은 의미장 (B) 함정(inclusive ∈ equality)
//  · ② bOnly: 정답 (B) 그대로 + 같은 의미장 (A) 함정(genetic ∈ evolutionary)
const GOOD = {
  summary:
    "Far from being lifeless, cities push animals toward (A) habits, which young animals acquire through (B) learning.",
  options: [
    { label: "①", values: ["adaptive", "inclusive"] },
    { label: "②", values: ["genetic", "social"] },
    { label: "③", values: ["adaptive", "social"] },
    { label: "④", values: ["instinctive", "solitary"] },
    { label: "⑤", values: ["learned", "imitative"] },
  ],
  answer: "③",
  explanation:
    "도시가 동물의 행동을 새 환경에 맞게 바꾸고, 어린 개체가 남의 성공 기법을 보고 배우며 그 행동이 퍼진다는 두 근거가 (A) 적응, (B) 사회적 학습 축으로 요약됩니다. 따라서 ③ 조합이 정답입니다.",
  wrong: [
    { label: "⑤", text: "(A) learned 는 학습의 결과일 뿐 지문이 말하는 적응 방향을 담지 못합니다." },
    { label: "①", text: "(B) inclusive 는 포용의 의미로, 모방을 통한 학습이라는 (B) 자리의 논지와 어긋납니다." },
    { label: "④", text: "(A) instinctive 는 본능을 뜻해 학습된 행동이라는 지문 논지와 정반대입니다." },
    { label: "②", text: "(A) genetic 은 유전을 뜻하지만 지문의 확산 경로는 유전이 아니라 모방입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 코어스 → 레인 adapt ok ─────────────────
{
  const parsed = SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린(KILLER 전 게이트)", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as MdSummaryMcQuestion;
  check(
    "코어스: 오답 해설 라벨 오름차순 정렬 발동",
    q.wrong.map((w) => w.label).join("") === "①②④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  check(
    "코어스 무발동: 정순 선지에 재정렬 correction 없음",
    !has(parsed.corrections, "재정렬"),
    parsed.corrections.join("; "),
  );
  const adapt = SUMMARY_COMPLETE_MC_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const blanks = adapt.aiQuestion.blanks as Array<{ label: string; answer: string }>;
    check(
      "어댑터: 빈칸 정답이 정답 선지 값에서 파생",
      adapt.aiQuestion.correctAnswer === "3" &&
        blanks.map((b) => b.answer).join("|") === "adaptive|social",
      JSON.stringify({ correctAnswer: adapt.aiQuestion.correctAnswer, blanks }),
    );
    const surface = SUMMARY_COMPLETE_MC_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+지문+요약문(빈칸선)+조합 선지 렌더",
      surface.includes("요약") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("(A) _____") &&
        surface.includes("③ adaptive …… social"),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    has(SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "선지 4개"),
  );

  const brokenLabels = {
    ...GOOD,
    summary:
      "Far from being lifeless, cities push animals toward (A) habits which young animals copy from one another.",
  };
  check(
    "음성테스트: 요약문 (B) 라벨 결손 반려(마커 정합)",
    has(
      SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(brokenLabels), ctx).gateIssues,
      "빈칸 라벨",
    ),
  );

  // 구조형 핵심 음성 — 지문 축자 연속 복사(재구성 대조의 이 유형 등가물).
  const copied = {
    ...GOOD,
    summary:
      "Cities are not biological deserts but engines of rapid adaptation, and the animals that master them acquire (A) habits through (B) learning.",
  };
  check(
    "음성테스트: 지문 연속 8단어 축자 복사 반려",
    has(SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(copied), ctx).gateIssues, "그대로 옮김"),
  );

  const leaked = {
    ...GOOD,
    summary:
      "Far from being lifeless, cities push animals toward (A) habits, which young animals acquire through (B) social imitation.",
  };
  check(
    "음성테스트: 정답 값 요약문 노출 반려",
    has(SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(leaked), ctx).gateIssues, "노출"),
  );

  const weakTraps = {
    ...GOOD,
    options: [
      { label: "①", values: ["adaptive", "inherited"] },
      { label: "②", values: ["random", "social"] },
      { label: "③", values: ["adaptive", "social"] },
      { label: "④", values: ["instinctive", "solitary"] },
      { label: "⑤", values: ["learned", "imitative"] },
    ],
  };
  check(
    "음성테스트: KILLER 의미장 함정 부재 반려",
    has(SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(weakTraps), ctx).gateIssues, "함정 강도"),
  );

  const noHalfCorrect = {
    ...GOOD,
    options: [
      { label: "①", values: ["genetic", "inherited"] },
      { label: "②", values: ["instinctive", "imitative"] },
      { label: "③", values: ["adaptive", "social"] },
      { label: "④", values: ["instinctive", "solitary"] },
      { label: "⑤", values: ["learned", "imitative"] },
    ],
  };
  check(
    "음성테스트: 반쪽 정답 부재 반려(KILLER)",
    has(SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(noHalfCorrect), ctx).gateIssues, "반쪽 정답"),
  );
  // 같은 픽스처가 BASIC/INTERMEDIATE 에서는 반려가 아니라 비차단 권고 — 난이도 축 검증.
  const ctxMid: MdLaneContext = { ...ctx, difficulty: "INTERMEDIATE", rawDifficulty: "INTERMEDIATE" };
  const midParsed = SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(noHalfCorrect), ctxMid);
  check(
    "난이도 축: INTERMEDIATE 에선 게이트 클린 + 비차단 권고 강등",
    midParsed.gateIssues.length === 0 && has(midParsed.corrections, "참고(비차단)"),
    `issues=${midParsed.gateIssues.join("; ")} / corr=${midParsed.corrections.join("; ")}`,
  );

  const parseFail = SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ③ 코어스: 선지 라벨 재정렬 발동 + 스냅 재사용(값 라벨 접두 제거) ─────────
{
  const shuffled = {
    ...GOOD,
    options: [GOOD.options[2], GOOD.options[0], GOOD.options[1], GOOD.options[3], GOOD.options[4]],
  };
  const parsed = SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(shuffled), ctx);
  const q = parsed.question as MdSummaryMcQuestion;
  check(
    "코어스 발동: 등장순 어긋난 선지를 라벨 오름차순 재정렬 + 게이트 클린",
    q.options.map((o) => o.label).join("") === "①②③④⑤" &&
      has(parsed.corrections, "재정렬") &&
      parsed.gateIssues.length === 0,
    `labels=${q.options.map((o) => o.label).join("")} / ${parsed.gateIssues.join("; ")}`,
  );
  const adapt = SUMMARY_COMPLETE_MC_MD_LANE.adapt(parsed, ctx);
  check("코어스 후 왕복: 레인 adapt ok + 정답 유지", adapt.ok === true && adapt.aiQuestion?.correctAnswer === "3", adapt.error);

  const labeledValues = {
    ...GOOD,
    options: GOOD.options.map((o) =>
      o.label === "③" ? { ...o, values: ["(A) adaptive", "(B) social"] } : o,
    ),
  };
  const snapped = SUMMARY_COMPLETE_MC_LUNA_EXT.parseAndGate(JSON.stringify(labeledValues), ctx);
  const sq = snapped.question as MdSummaryMcQuestion;
  check(
    "스냅 재사용: 값 라벨 접두 제거 + 게이트 클린",
    sq.options[2].values.join("|") === "adaptive|social" &&
      has(snapped.corrections, "라벨 접두") &&
      snapped.gateIssues.length === 0,
    `values=${sq.options[2].values.join("|")} / ${snapped.gateIssues.join("; ")}`,
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(SUMMARY_COMPLETE_MC_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 요약문·선지·정답·해설 방류 + JSON 무노출`,
      out.includes("요약문: Far from being lifeless") &&
        out.includes("\n③ adaptive social") &&
        out.includes("\n\n정답: ③") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"') &&
        !out.includes('"values"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 동적 스키마·검산 블록: 빈칸 수 설정 반영 ──────────────────────────────
{
  const ctx3 = { ...ctx, resolved: { summaryCompleteMcBlankCount: 3 } };
  const spec = SUMMARY_COMPLETE_MC_LUNA_EXT.buildJsonSchema(ctx3);
  const schema = spec.schema as Record<string, any>;
  const values = schema.properties.options.items.properties.values;
  check(
    "동적 스키마: 빈칸 3 → values 3·선지 5·오답 4",
    values.minItems === 3 &&
      values.maxItems === 3 &&
      schema.properties.options.minItems === 5 &&
      schema.properties.wrong.minItems === 4 &&
      spec.strict === true,
  );
  const selfcheck3 = SUMMARY_COMPLETE_MC_LUNA_EXT.buildSelfcheck(ctx3);
  check(
    "검산 블록: 빈칸 3 → (C) 라벨·near-miss 규칙 반영",
    selfcheck3.includes("(C)") && selfcheck3.includes("near-miss"),
  );
  const selfcheckKiller = SUMMARY_COMPLETE_MC_LUNA_EXT.buildSelfcheck(ctx);
  const selfcheckMid = SUMMARY_COMPLETE_MC_LUNA_EXT.buildSelfcheck({
    ...ctx,
    difficulty: "INTERMEDIATE",
    rawDifficulty: "INTERMEDIATE",
  });
  check(
    "검산 블록: KILLER 함정 강도 규칙은 KILLER 에만 + 사다리·재구성 대조 포함",
    selfcheckKiller.includes("함정 강도") &&
      !selfcheckMid.includes("함정 강도") &&
      selfcheckKiller.includes("우선순위") &&
      selfcheckKiller.includes("재구성"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
