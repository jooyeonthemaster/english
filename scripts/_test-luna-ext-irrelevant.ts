// IRRELEVANT luna 확장 픽스처 테스트 — 이식 캠페인 SPEC §3 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-irrelevant.ts
import { IRRELEVANT_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/irrelevant";
import { IRRELEVANT_MD_LANE } from "../src/lib/md-qgen/lane-irrelevant";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdIrrelevantQuestion } from "../src/lib/md-qgen/parser-irrelevant";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// ── 픽스처 지문(7문장) — 꿀벌 8자 춤 의사소통 ───────────────────────────────
const S = [
  "Honeybees returning from a rich patch of flowers perform a waggle dance that encodes both the direction and the distance of the food source.",
  "Other foragers follow the dancer closely, reading the angle of her movements against the position of the sun.",
  "The longer the central run of the dance lasts, the farther away the flowers are.",
  "Experienced foragers can even adjust this information for crosswinds that would otherwise push them off course.",
  "When several dancers point to different patches at once, the colony gradually shifts its workforce toward the richest source.",
  "This collective computation lets the hive follow a changing landscape of blooms without any single bee seeing the whole picture.",
  "For this reason, biologists describe the waggle dance as one of the most refined communication systems outside human language.",
];
const PASSAGE = S.join(" ");

// 삽입 무관 문장 — on-topic(dance·forager·colony·flowers 재사용) / off-logic
// (의사소통 논지 → 근육 단련 화제 침입). KILLER 게이트 전 항목 통과 설계.
const INSERTED =
  "Indeed, this shared dance also gives each young forager in the colony a chance to strengthen the wing muscles that long flights between flowers demand.";

const NP = `${S[0]} [[1:${S[1]}]] [[2:${S[2]}]] [[3:${INSERTED}]] [[4:${S[3]}]] [[5:${S[4]}]] ${S[5]} ${S[6]}`;

const GOOD = {
  numberedPassage: NP,
  answer: "3",
  explanation:
    "글은 꿀벌의 8자 춤이 먹이의 방향과 거리를 알리는 의사소통 수단임을 설명하는데, 춤이 어린 일벌의 날개 근육을 단련시킨다는 문장은 정보 전달이라는 논지에서 벗어나 근육 단련이라는 다른 화제를 끌어들입니다. 그 문장을 들어내면 춤의 지속 시간 해독에서 바람 보정으로 이어지는 흐름이 빈틈없이 복원됩니다.",
  wrong: [
    { label: "1", text: "춤을 해독하는 다른 일벌들의 행동을 서술해 앞 문장의 의사소통 기능을 구체화하는 문장입니다." },
    { label: "2", text: "춤의 지속 시간이 거리 정보를 담는다는 해독 원리를 설명해 흐름에 필요한 문장입니다." },
    { label: "4", text: "바람 조건에 따른 정보 보정을 서술해 춤 정보의 정밀함을 보여 주는 문장입니다." },
    { label: "5", text: "여러 춤이 경쟁할 때 군집이 일손을 재배분한다는 귀결로 이어 주는 문장입니다." },
  ],
};

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

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("정상 픽스처: 코어스 무발동", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const q = parsed.question as MdIrrelevantQuestion;
  check(
    "파서 산출물 동형: slots 5개 파생 + answer 정규화",
    q.kind === "irrelevant" && q.slots.length === 5 && q.answer === "3" && q.slots[2].text === INSERTED,
    JSON.stringify({ slots: q.slots.length, answer: q.answer }),
  );
  const adapt = IRRELEVANT_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const ai = adapt.aiQuestion as {
      sentences: string[];
      irrelevantIndex: number;
      correctAnswer: string;
      wrongOptionExplanations: Array<{ label: string }>;
    };
    check(
      "어댑터 형상: sentences 5·irrelevantIndex 2·correctAnswer 3·오답해설 4",
      ai.sentences.length === 5 &&
        ai.irrelevantIndex === 2 &&
        ai.correctAnswer === "3" &&
        ai.wrongOptionExplanations.map((w) => w.label).join(",") === "1,2,4,5",
      JSON.stringify({ idx: ai.irrelevantIndex, ca: ai.correctAnswer }),
    );
    const surface = IRRELEVANT_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+번호 지문(도입문 무번호·삽입문 ③) 렌더",
      surface.includes("관계 없는 문장은?") &&
        surface.includes("Honeybees returning") &&
        !surface.includes("① Honeybees") &&
        surface.includes("① Other foragers") &&
        surface.includes(`③ ${INSERTED}`) &&
        surface.includes("⑤ When several dancers"),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 울리는지) ───────────────────────
{
  // (a) 마커 밖 원문 무단 편집 → 재구성 불일치(구조형 최강 방어선)
  const tampered = {
    ...GOOD,
    numberedPassage: NP.replace("changing landscape", "shifting landscape"),
  };
  check(
    "음성테스트: 마커 밖 원문 편집 → 재구성 불일치 반려",
    has(IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(tampered), ctx).gateIssues, "재구성 불일치"),
  );
  // (b) 비정답 슬롯 패러프레이즈 → 축자 반려
  const paraphrased = {
    ...GOOD,
    numberedPassage: NP.replace(
      `[[2:${S[2]}]]`,
      "[[2:The longer the dance lasts, the farther away the flowers are.]]",
    ),
  };
  check(
    "음성테스트: 비정답 슬롯 변형 → 축자 아님 반려",
    has(IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(paraphrased), ctx).gateIssues, "축자"),
  );
  // (c) 정답이 마지막 번호 → 가장자리 반려
  const edge = { ...GOOD, answer: "5" };
  check(
    "음성테스트: 정답 가장자리(5번) 반려",
    has(IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(edge), ctx).gateIssues, "첫/마지막"),
  );
  // (d) 역접 연결어로 시작하는 삽입문 → 즉사 반려
  const contrast = {
    ...GOOD,
    numberedPassage: NP.replace(
      `[[3:${INSERTED}]]`,
      "[[3:However, young bees usually learn the dance by simply watching older foragers inside the hive.]]",
    ),
  };
  check(
    "음성테스트: 역접 시작 삽입문 반려",
    has(IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(contrast), ctx).gateIssues, "역접"),
  );
  // (e) 마커 미폐합(]] 누락) → 개수 반려 + 인식 실패 지점 지목
  const unclosed = {
    ...GOOD,
    numberedPassage: NP.replace(`[[5:${S[4]}]]`, `[[5:${S[4]}`),
  };
  check(
    "음성테스트: ]] 미폐합 마커 → 인식 실패 지점 지목 반려",
    has(IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(unclosed), ctx).gateIssues, "인식 실패"),
  );
  // (f) JSON 파손 → throw 금지, gateIssues 반환(재생성 유도)
  const broken = IRRELEVANT_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    broken.question === null && has(broken.gateIssues, "파싱 실패"),
  );
  // (g) 지문으로 불가능한 슬롯 수 → 진짜 원인 단독 반려(파생 잡음 억제)
  const ctx10 = { ...ctx, resolved: { irrelevantSlotCount: 10 } };
  const infeasible = IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx10);
  check(
    "음성테스트: 지문 문장수 부족(슬롯 10) → 적격성 단독 반려",
    infeasible.gateIssues.length === 1 && has(infeasible.gateIssues, "만들 수 없다"),
    infeasible.gateIssues.join("; "),
  );
}

// ── ③ 코어스: 등장순 재번호 발동(정답·오답 동기 치환) ───────────────────────
{
  const offset = {
    numberedPassage: `${S[0]} [[2:${S[1]}]] [[3:${S[2]}]] [[4:${INSERTED}]] [[6:${S[3]}]] [[7:${S[4]}]] ${S[5]} ${S[6]}`,
    answer: "4",
    explanation: GOOD.explanation,
    wrong: [
      { label: "2", text: GOOD.wrong[0].text },
      { label: "3", text: GOOD.wrong[1].text },
      { label: "6", text: GOOD.wrong[2].text },
      { label: "7", text: GOOD.wrong[3].text },
    ],
  };
  const parsed = IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(offset), ctx);
  const q = parsed.question as MdIrrelevantQuestion;
  check(
    "코어스: 비정준 라벨(2,3,4,6,7) → 1~5 재번호 + 정답 4→3 동기 치환 → 게이트 클린",
    parsed.gateIssues.length === 0 &&
      parsed.corrections.some((c) => c.includes("재부여")) &&
      q.answer === "3" &&
      q.slots.map((s) => s.label).join(",") === "1,2,3,4,5" &&
      q.wrong.map((w) => w.label).sort().join(",") === "1,2,4,5",
    `${parsed.gateIssues.join("; ")} / ${parsed.corrections.join("; ")}`,
  );
}

// ── ④ 교사 지정 준수(레인 parseAndGate 동형 동작) ───────────────────────────
{
  const tp = (text: string) =>
    [{ text, unit: "sentence", tag: null, note: null }] as unknown as MdLaneContext["teacherPoints"];
  const covered = IRRELEVANT_LUNA_EXT.parseAndGate(
    JSON.stringify(GOOD),
    { ...ctx, teacherPoints: tp(S[4]) },
  );
  check("교사 지정: 슬롯에 있는 문장 → 클린", covered.gateIssues.length === 0, covered.gateIssues.join("; "));
  const missed = IRRELEVANT_LUNA_EXT.parseAndGate(
    JSON.stringify(GOOD),
    { ...ctx, teacherPoints: tp(S[6]) },
  );
  check("교사 지정: 슬롯에 없는 문장 → 반려", has(missed.gateIssues, "번호 슬롯에 없음"));
  const firstSentence = IRRELEVANT_LUNA_EXT.parseAndGate(
    JSON.stringify(GOOD),
    { ...ctx, teacherPoints: tp(S[0]) },
  );
  check(
    "교사 지정: 지문 첫 문장 → 판정 불가 통과 + 보정 기록",
    firstSentence.gateIssues.length === 0 &&
      firstSentence.corrections.some((c) => c.includes("건너뜀")),
    `${firstSentence.gateIssues.join("; ")} / ${firstSentence.corrections.join("; ")}`,
  );
}

// ── ④-b 코어스: 해설 메타 누설 어휘 교정(발동/무발동) ────────────────────────
{
  const leaked = {
    ...GOOD,
    explanation:
      "글은 꿀벌의 8자 춤이 먹이의 방향과 거리를 알리는 의사소통 수단임을 설명하는데, 삽입 문장은 어린 일벌의 날개 근육 단련이라는 다른 화제를 끌어들입니다. 끼운 문장을 들어내면 춤의 지속 시간 해독에서 바람 보정으로 이어지는 흐름이 빈틈없이 복원됩니다.",
    wrong: GOOD.wrong.map((w) =>
      w.label === "4"
        ? { ...w, text: "삽입된 문장 뒤에서 바람 조건에 따른 정보 보정을 서술하는 문장입니다." }
        : w,
    ),
  };
  const parsed = IRRELEVANT_LUNA_EXT.parseAndGate(JSON.stringify(leaked), ctx);
  const q = parsed.question as MdIrrelevantQuestion;
  check(
    "코어스 발동: 메타 누설 어휘 → '이 문장' 치환(해설·오답 해설) + 보정 기록 + 게이트 클린",
    parsed.gateIssues.length === 0 &&
      !/삽입|끼운|끼워/.test(q.explanation) &&
      q.explanation.includes("이 문장은 어린 일벌") &&
      q.explanation.includes("이 문장을 들어내면") &&
      !q.wrong.some((w) => /삽입|끼운/.test(w.text)) &&
      parsed.corrections.some((c) => c.includes("메타 누설")),
    `${parsed.gateIssues.join("; ")} / ${parsed.corrections.join("; ")} / ${q.explanation.slice(0, 80)}`,
  );
  // 무발동은 ① 의 "정상 픽스처: 코어스 무발동" 이 이미 계기로 선다.
}

// ── ⑤ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(IRRELEVANT_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 번호지문·정답·해설 방류 + JSON 무노출`,
      out.startsWith("번호지문:\nHoneybees returning") &&
        out.includes("[[3:Indeed") &&
        out.includes("\n정답: 3") &&
        out.includes("\n해설: 글은 꿀벌의") &&
        out.includes("\n1 춤을 해독하는") &&
        !out.includes("{") &&
        !out.includes('"numberedPassage"') &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑥ 동적 스키마·검산 블록: 설정 실값 반영 ─────────────────────────────────
{
  const ctx8 = { ...ctx, resolved: { irrelevantSlotCount: 8 } };
  const spec = IRRELEVANT_LUNA_EXT.buildJsonSchema(ctx8);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 슬롯 8 → 오답 7·정답 enum 2~7·라벨 enum 8",
    spec.strict === true &&
      schema.additionalProperties === false &&
      schema.properties.wrong.minItems === 7 &&
      schema.properties.wrong.maxItems === 7 &&
      schema.properties.answer.enum.join(",") === "2,3,4,5,6,7" &&
      schema.properties.wrong.items.properties.label.enum.length === 8,
  );
  const clamped = IRRELEVANT_LUNA_EXT.buildJsonSchema({
    ...ctx,
    resolved: { irrelevantSlotCount: 99 },
  }).schema as Record<string, any>;
  check("동적 스키마: 슬롯 99 → 상한 10 클램프", clamped.properties.wrong.minItems === 9);
  const selfcheck = IRRELEVANT_LUNA_EXT.buildSelfcheck(ctx8);
  check(
    "검산 블록: 실값(1~8·가운데 2~7)·재구성 전수 대조·사다리 포함",
    selfcheck.includes("1~8") &&
      selfcheck.includes("2~7") &&
      selfcheck.includes("실제로 재구성해 원문과 문장 단위로 전수 대조") &&
      selfcheck.includes("우선순위") &&
      selfcheck.includes("양보"),
  );
  check(
    "검산 블록(r2 보강): 복원 지점 P→N 2단계·메타 누설 금지·표지 편중 금지",
    selfcheck.includes("복원 지점 2단계 검산") &&
      selfcheck.includes("출제 시점 어휘 금지") &&
      selfcheck.includes("첫머리 표지 편중 금지"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
