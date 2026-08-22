// TITLE luna 확장 픽스처 테스트 — 전 유형 이식 캠페인 견본(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-title.ts
import { TITLE_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/title";
import { TITLE_MD_LANE } from "../src/lib/md-qgen/lane-title";
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

const GOOD = {
  options: [
    { label: "①", text: "Why Cities Should Remove Urban Wildlife" },
    { label: "②", text: "City Animals: Unexpected Masters of Rapid Learning" },
    { label: "③", text: "How Raccoons Open Containers in the Wild" },
    { label: "④", text: "The Decline of Animal Instinct in Modern Life" },
    { label: "⑤", text: "Crosswalks: A Hidden Danger to Urban Crows" },
  ],
  answers: ["②"],
  explanation:
    "도시가 동물들의 빠른 학습과 적응을 이끄는 엔진이라는 글의 중심 내용을 포괄하므로 ②이 제목으로 가장 적절합니다.",
  wrong: [
    { label: "⑤", text: "횡단보도는 까마귀의 도구일 뿐 위험 요소로 서술되지 않았습니다." },
    { label: "①", text: "제거 주장은 지문에 없는 방향 반전입니다." },
    { label: "④", text: "본능의 쇠퇴는 지문이 다루지 않는 내용입니다." },
    { label: "③", text: "너구리 사례 하나로 초점을 좁힌 세부 함정입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = TITLE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as { wrong: Array<{ label: string }> };
  check(
    "코어스: 오답 라벨 정렬 발동",
    q.wrong.map((w) => w.label).join("") === "①③④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  const adapt = TITLE_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const surface = TITLE_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+지문+선지 렌더",
      surface.includes("제목") && surface.includes(PASSAGE.slice(0, 40)) && /City Animals/.test(surface),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본 ──\n" + surface.slice(0, 300) + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 울리는지) ───────────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    TITLE_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues.length > 0,
  );
  const wrongAnswerInWrong = {
    ...GOOD,
    wrong: [...GOOD.wrong.slice(0, 3), { label: "②", text: "정답 라벨이 오답 목록에." }],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    TITLE_LUNA_EXT.parseAndGate(JSON.stringify(wrongAnswerInWrong), ctx).gateIssues.length > 0,
  );
  const koMixed = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 2 ? { ...o, text: "도시 동물의 비밀" } : o)),
  };
  check(
    "음성테스트: 언어 혼입 반려(en 설정에 한국어 선지)",
    TITLE_LUNA_EXT.parseAndGate(JSON.stringify(koMixed), ctx).gateIssues.length > 0,
  );
  const parseFail = TITLE_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ③ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(TITLE_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 선지·정답·해설 방류 + JSON 무노출`,
      out.includes("\n② City Animals") &&
        out.includes("\n정답: ②") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ④ 동적 스키마: 설정 반영 ────────────────────────────────────────────────
{
  const ctx6 = { ...ctx, resolved: { genericOptionCount: 6, genericAnswerCount: 2 } };
  const spec = TITLE_LUNA_EXT.buildJsonSchema(ctx6);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 6·정답 2·오답 4",
    schema.properties.options.minItems === 6 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.options.items.properties.label.enum.length === 6,
  );
  check("검산 블록: 설정 실값 반영", TITLE_LUNA_EXT.buildSelfcheck(ctx6).includes("정확히 6개"));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
