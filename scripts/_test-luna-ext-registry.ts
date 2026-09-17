// luna-ext 레지스트리 전수 계약 테스트 (26-08-14 캠페인 통합 게이트).
// 유형별 픽스처가 "그 유형이 잘 도는가"를 본다면, 이 테스트는 **라우트가 어떤
// 유형을 태워도 죽지 않는가**를 본다: 등록 누락·킬스위치·기본 설정에서의 스키마/
// 검산 생성 예외(= 프로덕션 500)·브릿지 스펙 형상·strict 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-registry.ts
import {
  getLunaExt,
  LUNA_EXT_SUBTYPES,
} from "../src/lib/md-qgen/luna-ext-registry";
import { getMdLane, MD_LANE_SUBTYPES } from "../src/lib/md-qgen/lane-registry";
import { resolveQuestionTypeGenerationSettings } from "../src/lib/question-type-generation-settings";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Urban wildlife has learned to thrive in cities. Raccoons open containers that were designed to keep them out, and crows drop nuts onto crosswalks so passing cars crack them open. " +
  "Researchers who track these behaviors find that they spread quickly through populations, as young animals imitate the techniques that prove successful. " +
  "The lesson is clear: cities are not biological deserts but engines of rapid adaptation.";

// ── ① 등록 커버리지: md 레인 전 유형에 luna 확장이 있는가 ────────────────────
{
  const missing = MD_LANE_SUBTYPES.filter((t) => !LUNA_EXT_SUBTYPES.includes(t));
  check(
    `등록 커버리지: 레인 ${MD_LANE_SUBTYPES.length}종 전부 luna 확장 보유`,
    missing.length === 0,
    `누락: ${missing.join(", ")}`,
  );
  const orphan = LUNA_EXT_SUBTYPES.filter((t) => !MD_LANE_SUBTYPES.includes(t));
  check("등록 무결성: 레인 없는 고아 확장 없음", orphan.length === 0, orphan.join(", "));
}

// ── ② 유형별 계약: 기본 설정에서 스키마·검산·브릿지가 예외 없이 나오는가 ─────
// 채택 결정(기본 잔류 목록)과 무관하게 **등록된 전 유형**이 계약을 지켜야 한다 —
// 잔류 유형도 나중에 env 로 켜질 수 있고, 계약 위반은 그때 라우트 500 이 된다.
process.env.QGEN_LUNA_LANE_EXCLUDE = "";
for (const subType of LUNA_EXT_SUBTYPES) {
  const ext = getLunaExt(subType);
  const lane = getMdLane(subType);
  if (!ext || !lane) {
    check(`${subType}: 레지스트리 조회`, false, "ext 또는 lane null");
    continue;
  }
  const resolved = resolveQuestionTypeGenerationSettings(
    subType,
    undefined,
    "KILLER",
  ) as unknown as Record<string, unknown>;
  const ctx: MdLaneContext = {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved,
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  };
  try {
    const spec = ext.buildJsonSchema(ctx) as {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
    const schema = spec.schema as Record<string, any>;
    const ok =
      typeof spec.name === "string" &&
      spec.name.length > 0 &&
      spec.strict === true &&
      schema?.type === "object" &&
      schema?.additionalProperties === false &&
      Array.isArray(schema?.required) &&
      schema.required.length > 0;
    check(`${subType}: json_schema strict 계약`, ok, JSON.stringify(spec).slice(0, 160));
  } catch (e) {
    check(`${subType}: json_schema 생성`, false, e instanceof Error ? e.message : String(e));
  }
  try {
    const sc = ext.buildSelfcheck(ctx);
    check(
      `${subType}: 검산 블록 생성(비어있지 않음)`,
      typeof sc === "string" && sc.trim().length > 80,
      `${sc?.length ?? 0}자`,
    );
  } catch (e) {
    check(`${subType}: 검산 생성`, false, e instanceof Error ? e.message : String(e));
  }
  try {
    const specs = ext.bridgeSpecs;
    const okShape =
      Array.isArray(specs) &&
      specs.length > 0 &&
      specs.every((s) => typeof s.path === "string" && s.path.length > 0);
    // 브릿지가 임의 파손 JSON 에도 예외 없이 견디는지(표시 경로가 생성을 죽이면 안 됨).
    let threw = false;
    try {
      const bridge = new LunaJsonMdBridge(specs, () => {});
      for (const ch of '{"a":[{"b":"c\\u00"}],,,}') bridge.push(ch);
    } catch {
      threw = true;
    }
    check(`${subType}: bridgeSpecs 형상 + 파손 JSON 내성`, okShape && !threw);
  } catch (e) {
    check(`${subType}: bridgeSpecs`, false, e instanceof Error ? e.message : String(e));
  }
  // parseAndGate 는 파손 입력에서 throw 하면 안 된다(라우트 500 → 잡 고아).
  try {
    const parsed = ext.parseAndGate("{not json", ctx);
    check(
      `${subType}: 파손 JSON → gateIssues(throw 금지)`,
      Array.isArray(parsed.gateIssues) && parsed.gateIssues.length > 0,
      JSON.stringify(parsed.gateIssues ?? []).slice(0, 120),
    );
  } catch (e) {
    check(
      `${subType}: 파손 JSON 내성`,
      false,
      `throw: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  // renderEvalSurface 는 평가 전용이지만 빈 입력에 죽지 않아야 한다.
  try {
    const s = ext.renderEvalSurface({}, PASSAGE);
    check(`${subType}: renderEvalSurface 내성`, typeof s === "string");
  } catch (e) {
    check(`${subType}: renderEvalSurface`, false, e instanceof Error ? e.message : String(e));
  }
}

// ── ③ 킬스위치·제외 목록 ────────────────────────────────────────────────────
{
  delete process.env.QGEN_LUNA_LANE_EXCLUDE; // 기본값 경로 복귀
  process.env.QGEN_LUNA_LANE = "off";
  check("킬스위치 QGEN_LUNA_LANE=off: 전 유형 null", getLunaExt("TOPIC") === null);
  delete process.env.QGEN_LUNA_LANE;
  // 코드 기본 잔류(판정 결과) — env 미설정 시 SENTENCE_INSERT 만 gemini.
  check("기본 잔류: SENTENCE_INSERT 는 gemini", getLunaExt("SENTENCE_INSERT") === null);
  check("기본 채택: SENTENCE_ORDER 는 luna", getLunaExt("SENTENCE_ORDER") !== null);
  check("기본 채택: FILL_BLANK_KEY 는 luna", getLunaExt("FILL_BLANK_KEY") !== null);
  check(
    "기본 채택: GRAMMAR_CHOICE_COMBO 는 luna",
    getLunaExt("GRAMMAR_CHOICE_COMBO") !== null,
  );
  process.env.QGEN_LUNA_LANE_EXCLUDE = "SENTENCE_ORDER, topic";
  check("env 오버라이드: SENTENCE_ORDER 잔류", getLunaExt("SENTENCE_ORDER") === null);
  check("env 오버라이드: 대소문자 무관", getLunaExt("TOPIC") === null);
  check(
    "env 오버라이드: 기본 잔류가 해제된다(SENTENCE_INSERT 복귀)",
    getLunaExt("SENTENCE_INSERT") !== null,
  );
  process.env.QGEN_LUNA_LANE_EXCLUDE = "";
  check("env 빈 문자열: 전 유형 luna", getLunaExt("SENTENCE_INSERT") !== null);
  delete process.env.QGEN_LUNA_LANE_EXCLUDE;
  check("env 해제 후 기본값 복구", getLunaExt("SENTENCE_ORDER") !== null && getLunaExt("SENTENCE_INSERT") === null);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
