// SUMMARY_COMPLETE(요약문 완성 주관식) luna 확장 픽스처 테스트 — SPEC §3 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-summary-complete.ts
import { SUMMARY_COMPLETE_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/summary-complete";
import { SUMMARY_COMPLETE_MD_LANE } from "../src/lib/md-qgen/lane-summary-complete";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

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

// 정상 픽스처 — 게이트 전 축(라벨 정합·언어·분량·복사·노출·중복·허용답 위생) 통과 설계.
const GOOD = {
  summary:
    "Far from being lifeless for animals, cities (A) new behaviors that spread as younger animals (B) whatever succeeds, reshaping our view of wild learning.",
  blanks: [
    { label: "(A)", answer: "generate", accepted: ["produce", "breed"] },
    { label: "(B)", answer: "adopt", accepted: ["mimic"] },
  ],
  explanation:
    "도시가 새로운 행동을 만들어 개체군 전체로 퍼뜨린다는 첫 두 문장이 (A)의 근거입니다. 어린 개체가 성공한 기술을 그대로 따라 배운다는 셋째 문장이 (B)의 근거입니다.",
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check(
    "정상 픽스처: 코어스 무발동(corrections 0건)",
    parsed.corrections.length === 0,
    parsed.corrections.join("; "),
  );
  const adapt = SUMMARY_COMPLETE_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check(
      "어댑터: correctAnswer 를 정답 줄에서 파생",
      adapt.aiQuestion.correctAnswer === "(A) generate, (B) adopt",
      String(adapt.aiQuestion.correctAnswer),
    );
    const blanks = adapt.aiQuestion.blanks as Array<{
      label: string;
      answer: string;
      acceptedAnswers: string[];
    }>;
    check(
      "어댑터: acceptedAnswers 선두에 answer 강제 삽입 + 허용답 전달",
      blanks[0].acceptedAnswers.join("|") === "generate|produce|breed" &&
        blanks[1].acceptedAnswers.join("|") === "adopt|mimic",
      blanks.map((b) => b.acceptedAnswers.join("|")).join(" / "),
    );
    const surface = SUMMARY_COMPLETE_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+지문+요약문 빈칸선+답안 기입란 렌더",
      surface.includes("요약") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("(A) _____") &&
        surface.includes("(B) _____") &&
        surface.includes("[답안 기입]") &&
        !surface.includes("generate"),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  // N1 정답 노출: 요약문에 (A) 정답이 그대로 적힘.
  const leak = {
    ...GOOD,
    summary: GOOD.summary.replace("(A) new behaviors", "(A) generate new behaviors"),
  };
  check(
    "음성테스트: 요약문 정답 노출 반려",
    has(SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(leak), ctx).gateIssues, "노출"),
  );

  // N2 대안 나열: 정답 줄에 슬래시 나열(EXACT 채점 파괴).
  const alt = {
    ...GOOD,
    blanks: [
      { ...GOOD.blanks[0], answer: "generate / produce" },
      GOOD.blanks[1],
    ],
  };
  check(
    "음성테스트: 정답 값 대안 나열(/) 반려",
    has(SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(alt), ctx).gateIssues, "나열"),
  );

  // N3 정답 중복: 두 빈칸이 같은 답.
  const dup = {
    ...GOOD,
    blanks: [GOOD.blanks[0], { ...GOOD.blanks[1], answer: "generate", accepted: [] }],
  };
  check(
    "음성테스트: 빈칸 간 정답 동일 반려",
    has(SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(dup), ctx).gateIssues, "동일"),
  );

  // N4 정답 누락: blankCount 2 설정에 빈칸이 하나만 옴.
  const missing = { ...GOOD, blanks: [GOOD.blanks[0]] };
  check(
    "음성테스트: 정답(B) 누락 반려",
    has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(missing), ctx).gateIssues,
      "인식할 수 없음",
    ),
  );

  // N5 허용답 오염: (A) 허용답에 (B) 의 정답이 실림(두 칸이 같은 답을 받게 됨).
  const cross = {
    ...GOOD,
    blanks: [
      { ...GOOD.blanks[0], accepted: ["produce", "adopt"] },
      GOOD.blanks[1],
    ],
  };
  check(
    "음성테스트: 허용답에 타 빈칸 정답 반려",
    has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(cross), ctx).gateIssues,
      "정답과 동일",
    ),
  );

  // N6 언어 위반: 정답에 한국어.
  const korean = {
    ...GOOD,
    blanks: [{ ...GOOD.blanks[0], answer: "생성하다" }, GOOD.blanks[1]],
  };
  check(
    "음성테스트: 정답 한국어 혼입 반려",
    has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(korean), ctx).gateIssues,
      "한국어",
    ),
  );

  // N7 지문 축자 복사: 요약문이 지문 연속 10토큰을 그대로 옮김.
  const copied = {
    ...GOOD,
    summary:
      "Raccoons open containers that were designed to keep them out while city life (A) their habits and (B) their skills.",
  };
  check(
    "음성테스트: 요약문 지문 연속 복사 반려",
    has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(copied), ctx).gateIssues,
      "그대로 옮김",
    ),
  );

  // N8 JSON 파손 → gateIssues 반환(throw 금지).
  const parseFail = SUMMARY_COMPLETE_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));

  // ── r2 보강 축 (r1 패널 확정 F 계통) ──────────────────────────────────────
  // N9 다어절 자유 결합 키 — EXACT 채점에서 아무도 못 맞히는 정답(r1 Q03·Q23).
  const phrase = {
    ...GOOD,
    blanks: [{ ...GOOD.blanks[0], answer: "conceptual flexibility", accepted: [] }, GOOD.blanks[1]],
  };
  check(
    "음성테스트(r2): 자유 결합 2단어 정답 반려",
    has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(phrase), ctx).gateIssues,
      "자유 결합구",
    ),
  );

  // N9b 구동사(사전 등재 한 어휘 단위)는 예외 — 오탐이 없어야 계기가 산다.
  const phrasal = {
    ...GOOD,
    blanks: [GOOD.blanks[0], { ...GOOD.blanks[1], answer: "ward off", accepted: [] }],
  };
  check(
    "r2 무발동: 구동사 2단어(ward off)는 통과",
    !has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(phrasal), ctx).gateIssues,
      "자유 결합구",
    ),
    SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(phrasal), ctx).gateIssues.join("; "),
  );

  // N10 표적 인접 — 두 밑줄이 한 대구 안에 붙어 슬롯이 답을 구속 못 함(r1 Q23).
  const adjacent = {
    ...GOOD,
    summary:
      "Urban animals thrive because city life rewards (A) rather than (B), a finding that rewrites our view of wild learning.",
  };
  check(
    "음성테스트(r2): 표적 인접((A) rather than (B)) 반려",
    has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(adjacent), ctx).gateIssues,
      "사이가",
    ),
  );

  // N11 두 칸 동계어 — 한 칸이 다른 칸을 함의(r1 Q14 순환 계통).
  const cognate = {
    ...GOOD,
    blanks: [GOOD.blanks[0], { ...GOOD.blanks[1], answer: "generation", accepted: [] }],
  };
  check(
    "음성테스트(r2): 두 빈칸 정답이 같은 어족 반려",
    has(
      SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(cognate), ctx).gateIssues,
      "어족",
    ),
  );
}

// ── ③ 코어스 검증 (발동 — 정렬·라벨 정규화) ─────────────────────────────────
{
  // C1 제시 순서 역전 — 라벨 기준 재정렬 코어스 발동, 게이트는 클린.
  const reversed = { ...GOOD, blanks: [GOOD.blanks[1], GOOD.blanks[0]] };
  const parsed = SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(reversed), ctx);
  const q = parsed.question as { blanks: Array<{ label: string }> };
  check(
    "코어스: 빈칸 제시 순서 (B)(A)→(A)(B) 정렬 발동 + 게이트 클린",
    parsed.gateIssues.length === 0 &&
      has(parsed.corrections, "정렬") &&
      q.blanks.map((b) => b.label).join("") === "(A)(B)",
    parsed.gateIssues.join("; ") + " | " + parsed.corrections.join("; "),
  );
  check(
    "코어스 정렬 후에도 레인 adapt ok",
    SUMMARY_COMPLETE_MD_LANE.adapt(parsed, ctx).ok === true,
  );

  // C2 라벨 표기 드리프트 — "(a)"·"B" 를 "(A)"·"(B)" 로 정규화.
  const drifted = {
    ...GOOD,
    blanks: [
      { ...GOOD.blanks[0], label: "(a)" },
      { ...GOOD.blanks[1], label: "B" },
    ],
  };
  const parsedDrift = SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(drifted), ctx);
  const qd = parsedDrift.question as { blanks: Array<{ label: string }> };
  check(
    "코어스: 라벨 표기 (a)·B → (A)(B) 정규화 발동 + 게이트 클린",
    parsedDrift.gateIssues.length === 0 &&
      has(parsedDrift.corrections, "정규화") &&
      qd.blanks.map((b) => b.label).join("") === "(A)(B)",
    parsedDrift.gateIssues.join("; ") + " | " + parsedDrift.corrections.join("; "),
  );

  // C3 정규화 충돌(중복 라벨로 수렴) — 코어스가 손대지 않고 게이트가 지목.
  const collide = {
    ...GOOD,
    blanks: [
      { ...GOOD.blanks[0], label: "(A)" },
      { ...GOOD.blanks[1], label: "(a)" },
    ],
  };
  const parsedCollide = SUMMARY_COMPLETE_LUNA_EXT.parseAndGate(JSON.stringify(collide), ctx);
  check(
    "코어스: 라벨 정규화 충돌 시 무발동 → 게이트 반려",
    parsedCollide.gateIssues.length > 0,
    parsedCollide.corrections.join("; "),
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(SUMMARY_COMPLETE_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 요약문·정답·허용답·해설 방류 + JSON 무노출`,
      out.includes("요약문: Far from being lifeless") &&
        out.includes("\n정답(A): generate") &&
        out.includes("\n허용답: produce") &&
        out.includes("\n정답(B): adopt") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 200),
    );
  }
}

// ── ⑤ 동적 스키마·검산 블록: 설정 실값 반영 ─────────────────────────────────
{
  const ctx3 = { ...ctx, resolved: { summaryCompleteBlankCount: 3 } };
  const spec = SUMMARY_COMPLETE_LUNA_EXT.buildJsonSchema(ctx3);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 빈칸 3·라벨 enum (A)(B)(C)",
    schema.properties.blanks.minItems === 3 &&
      schema.properties.blanks.maxItems === 3 &&
      schema.properties.blanks.items.properties.label.enum.join("") === "(A)(B)(C)",
  );
  check(
    "동적 스키마: strict + additionalProperties:false",
    spec.strict === true &&
      schema.additionalProperties === false &&
      schema.properties.blanks.items.additionalProperties === false,
  );
  const ctxAlias = { ...ctx, resolved: { blankCount: 1 } };
  const aliasSchema = SUMMARY_COMPLETE_LUNA_EXT.buildJsonSchema(ctxAlias).schema as Record<
    string,
    any
  >;
  check(
    "동적 스키마: 리졸버 별칭 키(blankCount=1) 반영",
    aliasSchema.properties.blanks.minItems === 1 &&
      aliasSchema.properties.blanks.items.properties.label.enum.join("") === "(A)",
  );
  const selfcheck3 = SUMMARY_COMPLETE_LUNA_EXT.buildSelfcheck(ctx3);
  check(
    "검산 블록: 설정 실값·특칙(표기 변형 전수 나열)·사다리 포함",
    selfcheck3.includes("(A)(B)(C)") &&
      selfcheck3.includes("표기 변형 전수 나열") &&
      selfcheck3.includes("우선순위"),
  );
  check(
    "검산 블록(r2): F 계통 5축(한 단어·표적 분산·독립성·대체 후보·정답↔해설) 수록",
    selfcheck3.includes("한 단어 원칙") &&
      selfcheck3.includes("표적 분산") &&
      selfcheck3.includes("빈칸 독립성") &&
      selfcheck3.includes("대체 후보 배제") &&
      selfcheck3.includes("반의어·어근 누출") &&
      selfcheck3.includes("정답↔해설 정합"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
