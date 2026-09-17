// GRAMMAR_CORRECTION luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-grammar-correction.ts
import { GRAMMAR_CORRECTION_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/grammar-correction";
import { GRAMMAR_CORRECTION_MD_LANE } from "../src/lib/md-qgen/lane-grammar-correction";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { TeacherPointPayload } from "../src/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// 문장 3개 — S1(관계절+삽입 분사구, 수일치 표적)·S2(관계절, 수일치 표적)·S3(무변형).
const S1 =
  "Trees planted along a busy street, whose canopies overlap by midsummer, reduce the surface temperature of the pavement beneath them.";
const S1_WRONG = S1.replace("reduce the", "reduces the");
const S2 =
  "City planners who measure these effects have found that shaded blocks stay cooler through the evening, because the asphalt absorbs far less heat during the day.";
const S2_WRONG = S2.replace("absorbs", "absorb");
const S3 =
  "The lesson for designers is simple: a continuous canopy is not an ornament but a working piece of climate infrastructure.";
const PASSAGE = `${S1} ${S2} ${S3}`;

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
const ctx2: MdLaneContext = { ...ctx, resolved: { grammarCorrectionErrorCount: 2 } };

const GOOD = {
  markedPassage: `[[A:${S1_WRONG}]] ${S2} ${S3}`,
  fixes: [
    { label: "(A)", errorPart: "reduces", correctedPart: "reduce", acceptedAnswers: [] },
  ],
  explanation:
    "밑줄 (A)의 진짜 주어는 문두의 복수 명사 Trees이고, planted 분사구와 whose 관계절이 주어와 동사 사이에 삽입되어 있습니다. 따라서 단수형 reduces가 아니라 복수 동사 reduce로 고쳐 써야 합니다.",
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok → 평가 표면 ──────────────
{
  const parsed = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("정상 픽스처: 코어스 무발동", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const q = parsed.question as {
    segments: Array<{ label: string; errorPart: string; correctedPart: string }>;
  };
  check(
    "파서 산출물 동형: 세그먼트 라벨·고침 쌍",
    q.segments.length === 1 &&
      q.segments[0].label === "(A)" &&
      q.segments[0].errorPart === "reduces" &&
      q.segments[0].correctedPart === "reduce",
  );
  const adapt = GRAMMAR_CORRECTION_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const segs = adapt.aiQuestion.underlinedSegments as Array<Record<string, unknown>>;
    check(
      "어댑터 산출: sourceText 복원 + isError=true",
      segs.length === 1 && segs[0].sourceText === S1 && segs[0].isError === true,
      JSON.stringify(segs[0]).slice(0, 120),
    );
    const surface = GRAMMAR_CORRECTION_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+밑줄 변형본+답안 칸 렌더",
      surface.includes("고쳐 쓰시오") &&
        surface.includes("__(A) ") &&
        surface.includes("reduces the surface temperature") &&
        surface.includes("[답안]") &&
        surface.includes(S2.slice(0, 30)),
      surface.slice(0, 150),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스: 라벨 등장순 재번호 발동 / 스냅(꼬리 구두점) 재사용 ────────────
{
  const swapped = {
    markedPassage: `[[B:${S1_WRONG}]] [[A:${S2_WRONG}]] ${S3}`,
    fixes: [
      { label: "(B)", errorPart: "reduces", correctedPart: "reduce", acceptedAnswers: [] },
      { label: "(A)", errorPart: "absorb", correctedPart: "absorbs", acceptedAnswers: [] },
    ],
    explanation:
      "밑줄 (A)는 주어 Trees가 복수이므로 reduce로 고쳐야 합니다. 밑줄 (B)는 주어 the asphalt가 단수이므로 absorbs로 고쳐 써야 합니다.",
  };
  const parsed = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(swapped), ctx2);
  check(
    "코어스: 라벨 등장순 재번호 발동 → 게이트 클린",
    parsed.gateIssues.length === 0 && has(parsed.corrections, "재번호"),
    `issues=[${parsed.gateIssues.join("; ")}] corrections=[${parsed.corrections.join("; ")}]`,
  );
  const q = parsed.question as {
    segments: Array<{ label: string; errorPart: string }>;
  };
  check(
    "코어스: 재번호 후 고침 쌍 동기 치환",
    q.segments[0]?.label === "(A)" &&
      q.segments[0]?.errorPart === "reduces" &&
      q.segments[1]?.label === "(B)" &&
      q.segments[1]?.errorPart === "absorb",
    JSON.stringify(q.segments.map((s) => [s.label, s.errorPart])),
  );
  check(
    "코어스: 재번호 왕복도 레인 adapt ok",
    GRAMMAR_CORRECTION_MD_LANE.adapt(parsed, ctx2).ok === true,
  );

  const tailPunct = {
    ...GOOD,
    fixes: [{ label: "(A)", errorPart: "reduces.", correctedPart: "reduce", acceptedAnswers: [] }],
  };
  const snapped = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(tailPunct), ctx);
  check(
    "코어스: 레인 스냅 재사용(꼬리 구두점 제거) → 게이트 클린",
    snapped.gateIssues.length === 0 && has(snapped.corrections, "꼬리 구두점"),
    `issues=[${snapped.gateIssues.join("; ")}] corrections=[${snapped.corrections.join("; ")}]`,
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ────────────────
{
  const brokenVerbatim = {
    ...GOOD,
    fixes: [{ label: "(A)", errorPart: "lowers", correctedPart: "reduce", acceptedAnswers: [] }],
  };
  const r1 = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(brokenVerbatim), ctx);
  check(
    "음성테스트: 틀린 표현 축자 깨짐 반려",
    has(r1.gateIssues, "밑줄 구간 안에 없음"),
    r1.gateIssues.join("; "),
  );

  const editedOutside = {
    ...GOOD,
    markedPassage: `[[A:${S1_WRONG}]] ${S2.replace("City planners", "Urban planners")} ${S3}`,
  };
  const r2 = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(editedOutside), ctx);
  check(
    "음성테스트: 마커 밖 원문 훼손 → 재구성 불일치 반려",
    has(r2.gateIssues, "지문 재구성 불일치"),
    r2.gateIssues.join("; "),
  );

  const r3 = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx2);
  check(
    "음성테스트: 마커 수 부족(2개 필요, 1개) 반려",
    has(r3.gateIssues, "밑줄 마커 1개"),
    r3.gateIssues.join("; "),
  );

  const poisonedAccepted = {
    ...GOOD,
    fixes: [
      { label: "(A)", errorPart: "reduces", correctedPart: "reduce", acceptedAnswers: ["reduces"] },
    ],
  };
  const r4 = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(poisonedAccepted), ctx);
  check(
    "음성테스트: 허용답에 틀린 표현 반려",
    has(r4.gateIssues, "허용답에 틀린 표현"),
    r4.gateIssues.join("; "),
  );

  const narrow = {
    markedPassage: `${S1.replace("reduce", "[[A:reduces]]")} ${S2} ${S3}`,
    fixes: [{ label: "(A)", errorPart: "reduces", correctedPart: "reduce", acceptedAnswers: [] }],
    explanation: "주어 Trees가 복수이므로 reduce로 고쳐 써야 합니다.",
  };
  const r5 = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(narrow), ctx);
  check(
    "음성테스트: 오류 토큰만 밑줄(답 노출) 반려",
    has(r5.gateIssues, "고칠 표현 자체") || has(r5.gateIssues, "너무 짧음"),
    r5.gateIssues.join("; "),
  );

  const ghostLabel = {
    ...GOOD,
    fixes: [{ label: "(C)", errorPart: "reduces", correctedPart: "reduce", acceptedAnswers: [] }],
  };
  const r6 = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(ghostLabel), ctx);
  check(
    "음성테스트: 유령 고침 라벨 + (A) 고침 누락 반려",
    has(r6.gateIssues, "마커가 없음") && has(r6.gateIssues, "고침 줄 없음"),
    r6.gateIssues.join("; "),
  );

  const parseFail = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ④ 교사 지정 준수 (레인 판정 등가 복제 검증) ────────────────────────────
{
  const tp = (text: string) =>
    [{ text, unit: "word", tag: null, note: null }] as unknown as TeacherPointPayload[];
  const missed = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), {
    ...ctx,
    teacherPoints: tp("shaded blocks stay cooler"),
  });
  check(
    "교사 지정: 밑줄 밖 표현 미준수 반려",
    has(missed.gateIssues, "교사 지정 표현"),
    missed.gateIssues.join("; "),
  );
  const hit = GRAMMAR_CORRECTION_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), {
    ...ctx,
    teacherPoints: tp("reduce the surface temperature"),
  });
  check("교사 지정: 밑줄 안 표현 준수 통과", hit.gateIssues.length === 0, hit.gateIssues.join("; "));
}

// ── ⑤ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(GRAMMAR_CORRECTION_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 밑줄지문·고침·해설 방류 + JSON 무노출`,
      out.includes("밑줄지문:\n[[A:Trees planted") &&
        out.includes("\n고침(A): reduces → reduce") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"') &&
        !out.includes("acceptedAnswers"),
      out.slice(0, 150),
    );
  }
}

// ── ⑥ 동적 스키마·검산 블록: 설정 반영 ──────────────────────────────────────
{
  const ctx3 = { ...ctx, resolved: { grammarCorrectionErrorCount: 3 } };
  const spec = GRAMMAR_CORRECTION_LUNA_EXT.buildJsonSchema(ctx3);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: fixes 3개·라벨 enum (A)(B)(C)·strict",
    spec.strict === true &&
      schema.additionalProperties === false &&
      schema.properties.fixes.minItems === 3 &&
      schema.properties.fixes.maxItems === 3 &&
      schema.properties.fixes.items.properties.label.enum.join("") === "(A)(B)(C)",
  );
  check(
    "동적 스키마: 본문성 큰 필드(markedPassage)가 첫 필드",
    Object.keys(schema.properties)[0] === "markedPassage",
  );
  const clamped = GRAMMAR_CORRECTION_LUNA_EXT.buildJsonSchema({
    ...ctx,
    resolved: { grammarCorrectionErrorCount: 99 },
  }).schema as Record<string, any>;
  check("동적 스키마: 범위 밖 설정 클램프(99→5)", clamped.properties.fixes.maxItems === 5);

  const sc3 = GRAMMAR_CORRECTION_LUNA_EXT.buildSelfcheck(ctx3);
  check(
    "검산 블록: 설정 실값·사다리·핵심 검산 포함",
    sc3.includes("정확히 3개") &&
      sc3.includes("(A)(B)(C)") &&
      sc3.includes("우선순위") &&
      sc3.includes("재구성 축자 일치") &&
      sc3.includes("기등장") &&
      sc3.includes("합쇼체"),
  );
  check(
    "검산 블록: KILLER 분기·교사 지정 분기",
    sc3.includes("구조 하중") &&
      !sc3.includes("교사 지정") &&
      GRAMMAR_CORRECTION_LUNA_EXT.buildSelfcheck({
        ...ctx,
        teacherPoints: [{ text: "x", unit: "word", tag: null, note: null }] as unknown as TeacherPointPayload[],
      }).includes("교사 지정"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
