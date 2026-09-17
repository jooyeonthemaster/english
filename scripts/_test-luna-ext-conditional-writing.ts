// CONDITIONAL_WRITING luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-conditional-writing.ts
import { CONDITIONAL_WRITING_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/conditional-writing";
import { CONDITIONAL_WRITING_MD_LANE } from "../src/lib/md-qgen/lane-conditional-writing";
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

const TARGET_SENTENCE =
  "Without the constant feedback of failure, no organism would ever refine the skills that keep it alive.";
const PASSAGE =
  "Learning is driven by error. " +
  TARGET_SENTENCE +
  " Young predators miss far more often than they catch, and each miss quietly tunes the next attempt. " +
  "What looks like clumsiness from the outside is, from the inside, a curriculum written by mistakes, and the species that endure are the ones that keep taking its lessons.";

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

// 모범답안 17단어(countWords 기준: failure's 1단어·life-sustaining 1단어) —
// 'Had it not been' 시작·'without' 부재·지문 축자 비복사를 모두 만족한다.
const GOOD = {
  korean:
    "실패라는 끊임없는 되먹임이 없다면, 어떤 생물도 자신을 살아 있게 하는 기술을 다듬지 못할 것이다.",
  conditions: [
    "'Had it not been'으로 시작할 것",
    "'without'을 사용하지 말 것",
    "총 17단어로 쓸 것",
  ],
  modelAnswer:
    "Had it not been for failure's constant feedback, no organism could ever have refined its life-sustaining skills.",
  scoringCriteria: [
    "'Had it not been' 가정법 도치로 문장을 시작했는지 확인하고 충족 시 2점을 부여합니다.",
    "'without'을 쓰지 않고 조건의 의미를 살렸는지 확인하고 충족 시 2점을 부여합니다.",
    "총 17단어의 완성 문장이면 1점을 부여합니다.",
  ],
  explanation:
    "모범답안은 'Had it not been'으로 문장을 열어 가정법 과거완료 도치를 충족하고, 금지된 표현 대신 for 전치사구로 같은 의미를 전달합니다. 원문의 부정 조건절을 가정법 도치로 전환하고 관계절 서술을 복합형용사로 압축해 총 17단어를 지켰습니다.",
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("코어스 무발동: corrections 없음", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const adapt = CONDITIONAL_WRITING_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check(
      "어댑터 계약: correctAnswer = modelAnswer 복제 + options 부재",
      adapt.aiQuestion.correctAnswer === GOOD.modelAnswer &&
        !("options" in adapt.aiQuestion),
    );
    const surface = CONDITIONAL_WRITING_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+지문+우리말+조건 렌더 · 모범답안 미노출",
      surface.includes("영작") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("[우리말] 실패라는") &&
        surface.includes("- 'Had it not been'으로 시작할 것") &&
        !surface.includes(GOOD.modelAnswer),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스 발동: 불릿·번호 장식 + 빈 항목 → 교정 후 게이트 클린 ───────────
{
  const decorated = {
    ...GOOD,
    conditions: [
      "- 'Had it not been'으로 시작할 것",
      "② 'without'을 사용하지 말 것",
      "총 17단어로 쓸 것",
      "   ",
    ],
  };
  const parsed = CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(decorated), ctx);
  const q = parsed.question as { conditions: string[] };
  check(
    "코어스 발동: 불릿 제거·빈 항목 제거 후 게이트 클린",
    parsed.gateIssues.length === 0 &&
      parsed.corrections.length >= 3 &&
      q.conditions.length === 3 &&
      q.conditions[0] === "'Had it not been'으로 시작할 것",
    `issues=[${parsed.gateIssues.join("; ")}] corrections=[${parsed.corrections.join("; ")}]`,
  );
}

// ── ②-2 코어스 발동: 해설 마크다운 잔재(게이트 사각지대) → 교정 후 게이트 클린 ──
{
  const backticked = {
    ...GOOD,
    explanation:
      "모범답안은 `'Had it not been'`으로 문장을 열어 **가정법 과거완료 도치**를 충족하고, 금지된 표현 대신 for 전치사구로 같은 의미를 전달합니다. 원문의 부정 조건절을 가정법 도치로 전환하고 관계절 서술을 복합형용사로 압축해 총 17단어를 지켰습니다.",
  };
  const parsed = CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(backticked), ctx);
  const q = parsed.question as { explanation: string };
  check(
    "코어스 발동: 해설 백틱·별표 제거 후 게이트 클린",
    parsed.gateIssues.length === 0 &&
      parsed.corrections.some((c) => c.includes("해설 마크다운 잔재")) &&
      !q.explanation.includes("`") &&
      !q.explanation.includes("**") &&
      q.explanation.includes("'Had it not been'으로 문장을 열어"),
    `issues=[${parsed.gateIssues.join("; ")}] explanation=${q.explanation.slice(0, 60)}`,
  );
  // 무발동 확인 — 잔재 없는 해설은 손대지 않는다(저장 텍스트 무단 변경 금지).
  const clean = CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check(
    "코어스 무발동: 정상 해설은 원문 보존",
    (clean.question as { explanation: string }).explanation === GOOD.explanation &&
      !clean.corrections.some((c) => c.includes("해설 마크다운")),
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  // (a) 모범답안 = 지문 문장 축자 복사(최강 불변식 — F급 실측 계통)
  const verbatim = { ...GOOD, modelAnswer: TARGET_SENTENCE };
  check(
    "음성테스트: 지문 축자 복사 반려",
    has(CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(verbatim), ctx).gateIssues, "축자 복사"),
  );
  // (b) 정확 단어 수 조건 자기모순(조건 20단어 vs 실제 17단어)
  const wordMismatch = {
    ...GOOD,
    conditions: [GOOD.conditions[0], GOOD.conditions[1], "총 20단어로 쓸 것"],
  };
  check(
    "음성테스트: 단어 수 조건 자기모순 반려",
    has(CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(wordMismatch), ctx).gateIssues, "조건 위반"),
  );
  // (c) 금지 토큰 위반(모범답안이 'without' 사용)
  const forbiddenUsed = {
    ...GOOD,
    conditions: [GOOD.conditions[0], GOOD.conditions[1], "총 18단어로 쓸 것"],
    modelAnswer:
      "Had it not been without failure's constant feedback, no organism could ever have refined its life-sustaining skills.",
  };
  check(
    "음성테스트: 금지 토큰 사용 반려",
    has(CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(forbiddenUsed), ctx).gateIssues, "조건 위반"),
  );
  // (d) 우리말 괄호 병기 누출(영작 대상이 문제에 미리 인쇄)
  const koreanLeak = {
    ...GOOD,
    korean:
      "실패라는 끊임없는 되먹임(constant feedback)이 없다면, 어떤 생물도 살아남는 기술을 다듬지 못할 것이다.",
  };
  check(
    "음성테스트: 우리말 영어 병기 누출 반려",
    has(CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(koreanLeak), ctx).gateIssues, "영어 어구"),
  );
  // (e) 조건 수 미달(KILLER 최소 2개)
  const tooFew = { ...GOOD, conditions: ["총 17단어로 쓸 것"] };
  check(
    "음성테스트: 조건 수 미달 반려",
    has(CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(tooFew), ctx).gateIssues, "2개 이상"),
  );
  // (f) 기계 검증 가능 조건 전무(구문 요구만)
  const unverifiable = {
    ...GOOD,
    conditions: ["수동태로 쓸 것", "분사구문으로 시작할 것"],
  };
  check(
    "음성테스트: 기계 검증 가능 조건 전무 반려",
    has(
      CONDITIONAL_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(unverifiable), ctx).gateIssues,
      "기계로 검증 가능한 항목이 없음",
    ),
  );
  // (g) JSON 파손 → throw 금지, gateIssues 로 반려
  const parseFail = CONDITIONAL_WRITING_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    parseFail.question === null && has(parseFail.gateIssues, "파싱 실패"),
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(CONDITIONAL_WRITING_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 섹션 라벨·본문 방류 + JSON 무노출`,
      out.includes("우리말: 실패라는") &&
        out.includes("\n조건:") &&
        out.includes("\n- 'Had it not been'으로 시작할 것") &&
        out.includes("\n\n모범답안: Had it not been for failure's") &&
        out.includes("\n채점기준:") &&
        out.includes("\n\n해설: 모범답안은") &&
        !out.includes("{") &&
        !out.includes('"korean"') &&
        !out.includes('"conditions"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 동적 스키마·검산 블록: 난이도 실값 반영 ───────────────────────────────
{
  const specKiller = CONDITIONAL_WRITING_LUNA_EXT.buildJsonSchema(ctx);
  const killerSchema = specKiller.schema as Record<string, any>;
  const specBasic = CONDITIONAL_WRITING_LUNA_EXT.buildJsonSchema({
    ...ctx,
    difficulty: "BASIC",
  });
  const basicSchema = specBasic.schema as Record<string, any>;
  check(
    "동적 스키마: KILLER 조건 2~4 · BASIC 조건 1~4 · 채점기준 2~5",
    specKiller.strict === true &&
      killerSchema.additionalProperties === false &&
      killerSchema.properties.conditions.minItems === 2 &&
      killerSchema.properties.conditions.maxItems === 4 &&
      basicSchema.properties.conditions.minItems === 1 &&
      killerSchema.properties.scoringCriteria.minItems === 2 &&
      killerSchema.properties.scoringCriteria.maxItems === 5,
  );
  check(
    "스키마 동형성: 파서 산출물 필드 전부 required",
    JSON.stringify(killerSchema.required) ===
      JSON.stringify(["korean", "conditions", "modelAnswer", "scoringCriteria", "explanation"]),
  );
  const selfcheck = CONDITIONAL_WRITING_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: 난이도 실값·사다리·핵심 반려 조건 수록",
    selfcheck.includes("2~4개") &&
      selfcheck.includes("우선순위") &&
      selfcheck.includes("축자 복사") &&
      selfcheck.includes("작은따옴표") &&
      selfcheck.includes("6~40단어") &&
      CONDITIONAL_WRITING_LUNA_EXT.buildSelfcheck({ ...ctx, difficulty: "BASIC" }).includes("1~4개"),
  );
  // r2 수리분 — 빈 출력(예산 소진)·창작 절·조건 축 중복·해설 구조 서술 4계통.
  check(
    "검산 블록(r2): 작성 순서·예산 경고·우리말 대응·축 중복·해설 사실성 수록",
    selfcheck.includes("## 작성 순서") &&
      selfcheck.includes("답안이 먼저고 숫자가 나중이다") &&
      selfcheck.includes("빈 출력") &&
      selfcheck.includes("대응 성분") &&
      selfcheck.includes("조건 축은 넷이다") &&
      selfcheck.includes("It-that 강조구문") &&
      selfcheck.includes("상투 문구를 복사하면 틀린다"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
