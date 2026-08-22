// SENTENCE_INSERT luna 확장 픽스처 테스트 — SPEC §3 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-sentence-insert.ts
import { SENTENCE_INSERT_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/sentence-insert";
import { sentenceInsertGateAdvisories } from "../src/lib/md-qgen/gate-sentence-insert";
import { SENTENCE_INSERT_MD_LANE } from "../src/lib/md-qgen/lane-sentence-insert";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdInsertQuestion } from "../src/lib/md-qgen/parser-sentence-insert";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// ── 픽스처 지문: 7문장, S3(전환점·this cooling)을 빼낸다 ─────────────────────
const S = [
  "Urban trees are often praised for the shade they cast on summer streets.",
  "In many cities, planners line avenues with maples and oaks precisely because leafy canopies soften the heat of the pavement.",
  "Measurements taken in Seoul and Tokyo show that shaded asphalt can stay several degrees cooler than exposed asphalt through the afternoon.",
  "But this cooling arrives with a price tag that budget documents rarely mention.",
  "That expense shows up in pruning contracts, root repairs, and the slow work of replacing storm-damaged trunks.",
  "When such costs are ignored, tree programs swell in good years and collapse in the first lean season.",
  "Cities that plan for the full ledger, by contrast, keep their canopies alive for decades.",
];
const PASSAGE = S.join(" ");
// 빼낸 문장 S3 의 자리는 [[3]](S2 뒤) — 가운데 정답, 마커는 문장 사이 등장순.
const NUMBERED = `${S[0]} [[1]] ${S[1]} [[2]] ${S[2]} [[3]] ${S[4]} [[4]] ${S[5]} [[5]] ${S[6]}`;
const VARIANT =
  "Yet this cooling carries a price tag that budget documents rarely mention.";

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
const ctxP: MdLaneContext = { ...ctx, resolved: { sentenceInsertParaphrasePrefix: true } };
const teacherPointsOf = (text: string) =>
  [{ text, unit: "SENTENCE", tag: "", note: "" }] as unknown as MdLaneContext["teacherPoints"];

const GOOD = {
  given: S[3],
  numberedPassage: NUMBERED,
  answer: "③",
  explanation:
    "주어진 문장의 this cooling은 그늘 덕에 노면이 더 시원하게 유지된다는 앞 내용을 되받습니다. 또한 뒤 문장의 That expense가 주어진 문장이 도입한 a price tag를 받으므로 'That expense shows up…' 문장 바로 앞 자리가 정답입니다.",
  wrong: [
    { label: "①", text: "가로수 예찬이 막 시작된 자리라 this cooling이 가리킬 냉각 효과가 아직 등장하지 않았습니다." },
    { label: "②", text: "가로수를 심는 이유만 서술된 자리라 측정된 냉각 효과가 아직 진술되지 않아 앞 고리가 닫히지 않습니다." },
    { label: "④", text: "비용 항목이 이미 나열된 뒤라 비용을 새로 도입하는 주어진 문장이 들어가면 논의 순서가 뒤집힙니다." },
    { label: "⑤", text: "관리 실패 사례로 화제가 넘어간 뒤라 That expense가 받을 도입부와의 거리가 어긋납니다." },
  ],
};
const GOOD_P = {
  given: GOOD.given,
  givenVariant: VARIANT,
  numberedPassage: GOOD.numberedPassage,
  answer: GOOD.answer,
  explanation: GOOD.explanation,
  wrong: GOOD.wrong,
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok → 평가 표면 ───────────────
{
  const parsed = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as MdInsertQuestion;
  check(
    "코어스 무발동: 정렬 유지·보정 0건",
    parsed.corrections.length === 0 && q.wrong.map((w) => w.label).join("") === "①②④⑤",
    `corrections=${parsed.corrections.join("; ")} labels=${q.wrong.map((w) => w.label).join("")}`,
  );
  const adapt = SENTENCE_INSERT_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check("어댑터: 정답 재키 '3'", adapt.aiQuestion.correctAnswer === "3", String(adapt.aiQuestion.correctAnswer));
    check(
      "어댑터: 마커 원지문 좌표 [0,1,2,4,5]",
      JSON.stringify(adapt.aiQuestion.markerAfterSentenceIndices) === "[0,1,2,4,5]",
      JSON.stringify(adapt.aiQuestion.markerAfterSentenceIndices),
    );
    check("어댑터: 추출 원문 = S3 축자", adapt.aiQuestion.sourceSentenceToOmit === S[3]);
    const surface = SENTENCE_INSERT_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+주어진 문장+마커 5개 렌더",
      surface.includes("가장 적절한 곳은") &&
        surface.includes(`[주어진 문장] ${S[3]}`) &&
        surface.includes("( ① )") &&
        surface.includes("( ⑤ )") &&
        !surface.includes(S[3] + " ( ") && // 빼낸 문장이 본문에 남지 않는다
        surface.includes(S[0]),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스: 발동 케이스 ────────────────────────────────────────────────────
{
  const shuffled = {
    ...GOOD,
    wrong: [GOOD.wrong[3], GOOD.wrong[0], GOOD.wrong[2], GOOD.wrong[1]],
  };
  const parsed = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(shuffled), ctx);
  const q = parsed.question as MdInsertQuestion;
  check(
    "코어스: 오답 라벨 정렬 발동(⑤①④② → ①②④⑤)",
    q.wrong.map((w) => w.label).join("") === "①②④⑤" && parsed.gateIssues.length === 0,
    q.wrong.map((w) => w.label).join(""),
  );

  // 꼬리 마커 구출 — [[5]] 가 지문 맨 끝에 매달렸고 직전 마커 뒤에 문장이 2개.
  const tailHung = {
    ...GOOD,
    numberedPassage: `${S[0]} [[1]] ${S[1]} [[2]] ${S[2]} [[3]] ${S[4]} [[4]] ${S[5]} ${S[6]} [[5]]`,
  };
  const rescued = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(tailHung), ctx);
  const qr = rescued.question as MdInsertQuestion;
  check(
    "코어스: 꼬리 마커 구출 발동(맨 끝 [[5]] → 마지막 문장 앞)",
    qr.numberedPassage === NUMBERED &&
      rescued.gateIssues.length === 0 &&
      rescued.corrections.some((c) => c.includes("맨 끝에 매달려")),
    `np=${qr.numberedPassage.slice(-90)} issues=${rescued.gateIssues.join("; ")}`,
  );
  // 무발동 1 — 꼬리에 문장이 1개뿐이면 옮길 빈 경계가 없다(원 지문이 짧은 계통).
  const tailNoRoom = {
    ...GOOD,
    numberedPassage: `${S[0]} [[1]] ${S[1]} [[2]] ${S[2]} [[3]] ${S[4]} ${S[5]} [[4]] ${S[6]} [[5]]`,
  };
  const noRoom = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(tailNoRoom), ctx);
  check(
    "코어스 무발동: 꼬리 문장 1개 → 침묵(게이트는 여전히 클린)",
    noRoom.corrections.length === 0 &&
      (noRoom.question as MdInsertQuestion).numberedPassage === tailNoRoom.numberedPassage,
    `corrections=${noRoom.corrections.join("; ")}`,
  );
  // 무발동 2 — 마지막 마커가 이미 문장 사이면 손대지 않는다(GOOD 자체는 ① 에서 확인).
  const tailAnswer = {
    ...GOOD,
    answer: "⑤",
    numberedPassage: tailHung.numberedPassage,
  };
  const answerTail = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(tailAnswer), ctx);
  check(
    "코어스 무발동: 정답이 꼬리 마커면 옮기지 않음(재구성 축 보호)",
    answerTail.corrections.length === 0 &&
      (answerTail.question as MdInsertQuestion).numberedPassage === tailHung.numberedPassage,
    `corrections=${answerTail.corrections.join("; ")}`,
  );

  const drift = { ...GOOD, given: S[3].replace(/\.$/, "") }; // 끝 마침표 탈락 드리프트
  const snapped = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(drift), ctx);
  const qs = snapped.question as MdInsertQuestion;
  check(
    "코어스: 삽입문장 축자 스냅 발동(레인 autoSnap 재사용)",
    snapped.corrections.length === 1 && qs.given === S[3] && snapped.gateIssues.length === 0,
    `corrections=${snapped.corrections.join("; ")} issues=${snapped.gateIssues.join("; ")}`,
  );
}

// ── ③ 변형(paraphrasePrefix) 2단 출력 계약 ───────────────────────────────────
{
  const parsed = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD_P), ctxP);
  check("변형 설정: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const adapt = SENTENCE_INSERT_MD_LANE.adapt(parsed, ctxP);
  check(
    "변형 설정: 학생 표시면=변형본·추출 원문=축자",
    adapt.ok === true &&
      adapt.aiQuestion?.givenSentence === VARIANT &&
      adapt.aiQuestion?.sourceSentenceToOmit === S[3],
    adapt.error,
  );
  check(
    "음성테스트: 변형본이 축자와 동일 → 반려",
    has(
      SENTENCE_INSERT_LUNA_EXT.parseAndGate(
        JSON.stringify({ ...GOOD_P, givenVariant: S[3] }),
        ctxP,
      ).gateIssues,
      "동일",
    ),
  );
  check(
    "음성테스트: 변형 설정인데 변형 줄 누락 → 반려",
    has(SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxP).gateIssues, "줄이 없음"),
  );
  check(
    "음성테스트: 설정 꺼짐인데 변형 줄 출력 → 반려",
    has(SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD_P), ctx).gateIssues, "꺼져"),
  );
}

// ── ④ 게이트 음성테스트 (계기 검증 — 위반이 울리는지) ───────────────────────
{
  const brokenReconstruction = {
    ...GOOD,
    numberedPassage: NUMBERED.replace("collapse", "crumble"), // 지문 무단 편집
  };
  check(
    "음성테스트: 지문 한 단어 무단 편집 → 재구성 불일치 반려",
    has(
      SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(brokenReconstruction), ctx).gateIssues,
      "재구성 불일치",
    ),
  );
  check(
    "음성테스트: 정답 오지정(④) → 정답 불일치 반려",
    has(
      SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify({ ...GOOD, answer: "④" }), ctx).gateIssues,
      "정답 불일치",
    ),
  );
  check(
    "음성테스트: 마커 4개 → 개수 반려",
    has(
      SENTENCE_INSERT_LUNA_EXT.parseAndGate(
        JSON.stringify({ ...GOOD, numberedPassage: NUMBERED.replace(" [[5]]", "") }),
        ctx,
      ).gateIssues,
      "마커",
    ),
  );
  const answerInWrong = {
    ...GOOD,
    wrong: [...GOOD.wrong.slice(0, 3), { label: "③", text: "정답 라벨이 오답 목록에." }],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 → 결손 반려",
    has(SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues, "오답해설"),
  );
  check(
    "음성테스트: 해설이 원문자로 위치 지칭 → 반려",
    has(
      SENTENCE_INSERT_LUNA_EXT.parseAndGate(
        JSON.stringify({ ...GOOD, explanation: "③ 자리에 들어가는 것이 가장 적절합니다." }),
        ctx,
      ).gateIssues,
      "원문자",
    ),
  );
  // 양끝 정답: S1 을 빼내고 그 자리([[1]])를 정답으로 — 재구성 성립. 26-08-22 강등:
  // 기출 양끝 정답 27.0%(수능 22.6%)라 차단하지 않는다 — 게이트 클린 + 비차단 권고.
  // (양끝 회피는 luna 프롬프트 지시가 담당하고, 게이트는 기출 구조를 반려하지 않는다)
  const edge = {
    given: S[1],
    numberedPassage: `${S[0]} [[1]] ${S[2]} [[2]] ${S[3]} [[3]] ${S[4]} [[4]] ${S[5]} [[5]] ${S[6]}`,
    answer: "①",
    explanation: GOOD.explanation,
    wrong: [
      { label: "②", text: GOOD.wrong[0].text },
      { label: "③", text: GOOD.wrong[1].text },
      { label: "④", text: GOOD.wrong[2].text },
      { label: "⑤", text: GOOD.wrong[3].text },
    ],
  };
  const edgeParsed = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(edge), ctx);
  check(
    "강등(26-08-22): 양끝 정답(①)은 차단하지 않는다(기출 27.0%)",
    !has(edgeParsed.gateIssues, "양끝"),
    edgeParsed.gateIssues.join("; "),
  );
  check(
    "강등(26-08-22): 양끝 정답이 비차단 권고로 발화",
    edgeParsed.question !== null &&
      sentenceInsertGateAdvisories(
        edgeParsed.question as MdInsertQuestion,
        ctx.passage,
        { slotCount: 5 },
      ).some((a) => a.includes("양끝 자리")),
  );
  const parseFail = SENTENCE_INSERT_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    parseFail.question === null && has(parseFail.gateIssues, "파싱 실패"),
  );
}

// ── ⑤ 교사 지정 준수(레인 parseAndGate 동형) ─────────────────────────────────
{
  const hit = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), {
    ...ctx,
    teacherPoints: teacherPointsOf("budget documents rarely mention"),
  });
  check("교사 지정 준수: 지정 문장이 삽입문장에 포함 → 클린", hit.gateIssues.length === 0, hit.gateIssues.join("; "));
  const miss = SENTENCE_INSERT_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), {
    ...ctx,
    teacherPoints: teacherPointsOf("the slow work of replacing storm-damaged trunks"),
  });
  check("교사 지정 미준수: 다른 문장을 빼냄 → 반려", has(miss.gateIssues, "교사 지정 문장"));
}

// ── ⑥ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(SENTENCE_INSERT_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 섹션 라벨·본문 방류 + JSON 무노출`,
      out.includes("삽입문장: But this cooling") &&
        out.includes("번호지문:\n" + S[0]) &&
        out.includes("[[3]]") &&
        out.includes("\n정답: ③") &&
        out.includes("\n해설: ") &&
        out.includes("\n① ") &&
        !out.includes("{") &&
        !out.includes('"label"') &&
        !out.includes('"numberedPassage"'),
      out.slice(0, 160),
    );
  }
  let outP = "";
  const bridgeP = new LunaJsonMdBridge(SENTENCE_INSERT_LUNA_EXT.bridgeSpecs, (d) => (outP += d));
  const jsonP = JSON.stringify(GOOD_P);
  for (let i = 0; i < jsonP.length; i += 7) bridgeP.push(jsonP.slice(i, i + 7));
  check(
    "브릿지(변형): 삽입문장(변형) 라벨 방류",
    outP.includes("삽입문장: But this cooling") && outP.includes("삽입문장(변형): Yet this cooling"),
    outP.slice(0, 160),
  );
}

// ── ⑦ 동적 스키마·검산 블록 ─────────────────────────────────────────────────
{
  const spec = SENTENCE_INSERT_LUNA_EXT.buildJsonSchema(ctx);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마(기본): 5자리·변형 필드 없음·정답 enum 가운데(②③④)",
    spec.strict === true &&
      JSON.stringify(schema.required) ===
        JSON.stringify(["given", "numberedPassage", "answer", "explanation", "wrong"]) &&
      schema.properties.answer.enum.join("") === "②③④" &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.wrong.maxItems === 4 &&
      schema.properties.wrong.items.properties.label.enum.length === 5,
    JSON.stringify(schema.required),
  );
  const ctx7P: MdLaneContext = {
    ...ctx,
    resolved: { sentenceInsertSlotCount: 7, sentenceInsertParaphrasePrefix: true },
  };
  const spec7 = SENTENCE_INSERT_LUNA_EXT.buildJsonSchema(ctx7P);
  const schema7 = spec7.schema as Record<string, any>;
  check(
    "동적 스키마(7자리+변형): givenVariant 포함·오답 6·정답 enum ②~⑥",
    Object.keys(schema7.properties)[1] === "givenVariant" &&
      (schema7.required as string[]).includes("givenVariant") &&
      schema7.properties.wrong.minItems === 6 &&
      schema7.properties.answer.enum.join("") === "②③④⑤⑥" &&
      schema7.properties.wrong.items.properties.label.enum.length === 7,
    JSON.stringify(schema7.required),
  );
  const selfcheck7 = SENTENCE_INSERT_LUNA_EXT.buildSelfcheck(ctx7P);
  check(
    "검산 블록: 자리 수 실값 반영([[7]]·정확히 7개)",
    selfcheck7.includes("[[7]]") && selfcheck7.includes("정확히 7개") && selfcheck7.includes("1순위"),
  );
  const selfcheck5 = SENTENCE_INSERT_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록(r2): 결정 절차·꼬리 자리·부재 주장 검증 수록",
    selfcheck5.includes("결정 절차") &&
      selfcheck5.includes("마지막 마커([[5]]) 뒤에는 문장이 최소 한 개") &&
      selfcheck5.includes("부재 주장 검증") &&
      selfcheck5.includes("인접 어휘 검증"),
    selfcheck5.slice(0, 120),
  );
  check(
    "검산 블록: 변형 섹션은 설정 켤 때만",
    selfcheck7.includes("변형본 검산") &&
      !SENTENCE_INSERT_LUNA_EXT.buildSelfcheck(ctx).includes("변형본 검산"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
