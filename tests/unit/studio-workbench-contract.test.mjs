import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// 클래스 스튜디오 워크벤치 — 무회귀 계약 단위 테스트
// (docs/class-studio-spec.md §3.4 · §3.4.1 · §3.7.2 · §11)
//
//  1. buildAnalysisRequestBody(src/hooks/use-passage-queue.ts):
//     targetSections/sourceModule 부재 시 요청 body 가 확장 이전과 **바이트 동일**
//     (§11 무회귀 — 기존 학습지 생성 페이지의 와이어 포맷 불변), 빈 배열도 부재
//     취급, 지정 시에만 additive 키로 출현.
//  2. src/lib/studio/module-sections.ts:
//     모듈 ↔ 필요 섹션 표(§3.4 정본) · 섹션 종량제 가격 불변식 — 임의 부분집합
//     순차 구매 총액 == 일괄 구매 총액(항상 ≤5, 검수 L1-F4).
//  3. FULL_ANALYSIS_SECTIONS == resilient-generate ALL_SECTION_KINDS 복제 일치
//     (module-sections.ts 머리말의 "단위 테스트가 두 목록의 일치를 강제한다" 이행 —
//      원본이 서버 전용 모듈이라 소스 텍스트로 고정한다. grammar-engine 관용구).
//
// getStudioPassageSectionStates(§3.7.4)는 서버 전용(academyId 스코프 질의)이라
// 단위 테스트 대상에서 제외한다 — 계약은 행동 게이트(§13-3)가 검증한다.
//
// 러너 관용구: worksheet-study-compile.test.mjs 와 동일 — .mts 하니스를 npx tsx 로
// 실행하고 마지막 줄 JSON 을 판정한다. use-passage-queue 는 "use client" 모듈이며
// @/actions/workbench 배럴을 통해 server-only(임포트 즉시 throw)를 물고 온다.
// grammar-engine 의 react-server 조건 관용구는 이 모듈이 실제 react 훅을 임포트해
// (react-server 조건에선 createContext 부재로) 죽으므로 쓸 수 없다 — 대신 CJS
// _load 를 가로채 server-only 만 빈 모듈로 대체한다(하니스 안 주석 참조).
// ============================================================================

function runHarness(fileName, source) {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-studio-workbench");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, fileName);
  let raw;
  try {
    writeFileSync(harnessPath, source, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

// ── 1. buildAnalysisRequestBody — 부재 시 바이트 동일 · 지정 시에만 출현 ──────
const requestBodyHarness = `
// tsx 는 이 TS 그래프를 CJS 파이프라인으로 로드한다. use-passage-queue 가 끌고
// 오는 @/actions/workbench 배럴이 server-only 를 물고 있어(임포트 즉시 throw)
// CJS _load 를 가로채 server-only 만 빈 모듈로 대체한다. 순수 함수만 호출하므로
// DB·서버 API 에는 닿지 않는다.
import Module from "node:module";
const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, parent, isMain);
};
// 동적 import 네임스페이스는 tsx CJS interop 에서 named export 를 평면으로
// 노출한다(default 가 비어 있을 수 있다) — 양쪽 모두 지원.
const pick = (ns: any) => (ns && ns.default && Object.keys(ns.default).length ? ns.default : ns);
const { buildAnalysisRequestBody } = pick(await import("@/hooks/use-passage-queue"));

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

// 확장 이전 조립 기준선(§11) — 기존 정액 경로의 와이어 포맷 정본. 이 리터럴과의
// JSON.stringify 비교가 "새 키가 절대 나타나지 않는다"의 바이트 수준 증거다.
const legacyBody = (passageId: string, cfg: any, wantStream: boolean) => ({
  passageId,
  customPrompt: cfg.customPrompt,
  focusAreas: cfg.focusAreas,
  targetLevel: cfg.targetLevel,
  generationPlan: cfg.generationPlan,
  analysisTone: cfg.analysisTone,
  includeWorksheet: cfg.includeWorksheet === true,
  ...(wantStream ? { stream: true } : {}),
});
const BASE_KEYS = [
  "passageId",
  "customPrompt",
  "focusAreas",
  "targetLevel",
  "generationPlan",
  "analysisTone",
  "includeWorksheet",
];

const fullCfg = {
  customPrompt: "쉬운 어휘로 설명합니다",
  focusAreas: ["grammar", "vocabulary"],
  targetLevel: "고2",
  generationPlan: { id: "PRIME", label: "표준" },
  analysisTone: "friendly",
  includeWorksheet: true,
};
const minCfg = { customPrompt: "", focusAreas: [], targetLevel: "중3" };

// (a) 스튜디오 필드 부재 — 키 집합·바이트 완전 동일(옵션 유무 × 스트림 유무 매트릭스)
for (const [label, cfg] of [["full", fullCfg], ["min", minCfg]] as const) {
  for (const wantStream of [false, true]) {
    const tag = label + ",stream=" + wantStream;
    const body = buildAnalysisRequestBody("p-1", cfg as any, wantStream);
    const expectKeys = wantStream ? [...BASE_KEYS, "stream"] : BASE_KEYS;
    check(
      "무회귀 키 집합(" + tag + ")",
      JSON.stringify(Object.keys(body)) === JSON.stringify(expectKeys),
      Object.keys(body).join(","),
    );
    check(
      "무회귀 바이트 동일(" + tag + ")",
      JSON.stringify(body) === JSON.stringify(legacyBody("p-1", cfg, wantStream)),
      JSON.stringify(body),
    );
  }
}

// (b) targetSections 빈 배열 = 부재 취급(§3.4.1 — 부재/빈 배열이면 body 에 안 실린다)
const emptyArr = buildAnalysisRequestBody("p-1", { ...minCfg, targetSections: [] } as any, false);
check("빈 targetSections → 키 미출현", !("targetSections" in emptyArr));
check(
  "빈 targetSections → 기준선과 바이트 동일",
  JSON.stringify(emptyArr) === JSON.stringify(legacyBody("p-1", minCfg, false)),
);

// (c) 빈 문자열 sourceModule 도 부재 취급(falsy 가드 — 키 미출현)
const emptySrc = buildAnalysisRequestBody("p-1", { ...minCfg, sourceModule: "" } as any, false);
check("빈 sourceModule → 키 미출현", !("sourceModule" in emptySrc));

// (d) targetSections 지정 시에만 출현 — 값 패스스루(§3.7.2: 선택 모듈 필요 섹션 합집합)
const withTs = buildAnalysisRequestBody(
  "p-1",
  { ...fullCfg, targetSections: ["passage", "vocabulary"] } as any,
  false,
);
check(
  "targetSections 지정 → 키 출현·순서 패스스루",
  JSON.stringify(withTs.targetSections) === JSON.stringify(["passage", "vocabulary"]),
);
check("targetSections 단독 → sourceModule 미출현", !("sourceModule" in withTs));
check(
  "targetSections 는 additive 말미 배치(기존 키 순서 불변)",
  JSON.stringify(Object.keys(withTs)) === JSON.stringify([...BASE_KEYS, "targetSections"]),
  Object.keys(withTs).join(","),
);

// (e) sourceModule 지정 시에만 출현(§3.4.1-11 — 지문 스튜디오 카드 귀속)
const withSm = buildAnalysisRequestBody("p-1", { ...fullCfg, sourceModule: "vocab" } as any, false);
check("sourceModule 지정 → 키 출현·값 보존", withSm.sourceModule === "vocab");
check("sourceModule 단독 → targetSections 미출현", !("targetSections" in withSm));

// (f) 동시 지정 + 스트림 — additive 키 전체 순서 고정
const withBoth = buildAnalysisRequestBody(
  "p-1",
  { ...fullCfg, targetSections: ["passage"], sourceModule: "cloze" } as any,
  true,
);
check(
  "동시 지정+stream → 키 전체·순서",
  JSON.stringify(Object.keys(withBoth)) ===
    JSON.stringify([...BASE_KEYS, "targetSections", "sourceModule", "stream"]),
  Object.keys(withBoth).join(","),
);
// additive 증명 — 스튜디오 키만 제거하면 기준선과 바이트 동일(기존 값 무접촉)
const stripped = JSON.parse(JSON.stringify(withBoth));
delete stripped.targetSections;
delete stripped.sourceModule;
check(
  "additive: 스튜디오 키 제거 = 기준선 바이트 동일",
  JSON.stringify(stripped) === JSON.stringify(legacyBody("p-1", fullCfg, true)),
);

// (g) 입력 무변이(순수) — 동결 config 로 호출해도 예외 없음
let pure = true;
try {
  buildAnalysisRequestBody(
    "p-1",
    Object.freeze({ ...fullCfg, targetSections: Object.freeze(["passage"]) }) as any,
    true,
  );
} catch {
  pure = false;
}
check("promptConfig 무변이(동결 입력 안전)", pure);

console.log(JSON.stringify({ passed, failures }));
`;

test("studio 워크벤치 계약 — buildAnalysisRequestBody 무회귀 (§3.7.2·§11)", () => {
  const result = runHarness(".request-body-harness.mts", requestBodyHarness);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 15, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});

// ── 2. module-sections — §3.4 표 정본 · 섹션 종량제 가격 불변식 ───────────────
const moduleSectionsHarness = `
import msMod from "@/lib/studio/module-sections";
const {
  FULL_ANALYSIS_SECTIONS,
  MODULE_REQUIRED_SECTIONS,
  SECTION_CREDIT_COST,
  PARTIAL_ANALYSIS_CREDIT_CAP,
  partialAnalysisCreditCost,
  missingSections,
  moduleSectionStates,
  isSectionKind,
  isSectionBackedModuleId,
} = msMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

// (a) §3.4 표 정본 — 모듈 ↔ 필요 섹션(passage 는 공통 토대라 항상 선두)
const SPEC_TABLE: Record<string, string[]> = {
  vocab: ["passage", "vocabulary"],
  reading: ["passage", "summary"],
  grammar: ["passage", "grammar"],
  cloze: ["passage"],
  order: ["passage"],
  production: ["passage"],
};
check(
  "§3.4 모듈 키 집합 일치(6모듈)",
  JSON.stringify(Object.keys(MODULE_REQUIRED_SECTIONS).sort()) ===
    JSON.stringify(Object.keys(SPEC_TABLE).sort()),
  Object.keys(MODULE_REQUIRED_SECTIONS).join(","),
);
for (const mod of Object.keys(SPEC_TABLE)) {
  check(
    "§3.4 " + mod + " 필요 섹션 일치",
    JSON.stringify(MODULE_REQUIRED_SECTIONS[mod]) === JSON.stringify(SPEC_TABLE[mod]),
    JSON.stringify(MODULE_REQUIRED_SECTIONS[mod]),
  );
}
// 실전 문제(exam)는 분석 섹션이 아니라 실전 학습지 생성물이 원천 — 종량제 비대상(§3.4 특례)
check(
  "exam 은 섹션 종량제 비대상",
  !("exam" in MODULE_REQUIRED_SECTIONS) && isSectionBackedModuleId("exam") === false,
);
check("6모듈 전부 isSectionBackedModuleId 통과", Object.keys(SPEC_TABLE).every(isSectionBackedModuleId));
check("isSectionKind 가드", isSectionKind("vocabulary") === true && isSectionKind("bogus") === false);

// (b) 전체 분석 목표 = 7섹션(§3.4 남은 전체 분석 문단 정본)
const SPEC_FULL_SET = [
  "passage",
  "vocabulary",
  "summary",
  "grammar",
  "parsing",
  "exam-focus",
];
check(
  "전체 분석 6섹션 집합 일치",
  FULL_ANALYSIS_SECTIONS.length === 6 &&
    new Set(FULL_ANALYSIS_SECTIONS).size === 6 &&
    JSON.stringify([...FULL_ANALYSIS_SECTIONS].sort()) === JSON.stringify([...SPEC_FULL_SET].sort()),
  JSON.stringify(FULL_ANALYSIS_SECTIONS),
);
check("섹션 단가 1크레딧(§14-1)", SECTION_CREDIT_COST === 1);
check("지문 누적 지출 상한 5크레딧(§3.4 가격 정본)", PARTIAL_ANALYSIS_CREDIT_CAP === 5);

// (c) 가격 경계
check("부족 0 → 0크레딧(즉시 준비됨)", partialAnalysisCreditCost(0, 0) === 0 && partialAnalysisCreditCost(0, 3) === 0);
check("빈 지문 전체 7부족 → 일괄가 5", partialAnalysisCreditCost(7, 0) === 5);
check("보유 5 이상 → 잔여 상한 0(추가 과금 없음)", partialAnalysisCreditCost(2, 5) === 0 && partialAnalysisCreditCost(2, 7) === 0);
check("음수 방어(부족 음수 0·보유 음수 0 클램프)", partialAnalysisCreditCost(-1, 0) === 0 && partialAnalysisCreditCost(3, -2) === 3);

// (d) 구매 시뮬레이터 — missingSections·partialAnalysisCreditCost 실계약 그대로:
//     각 구매 = 부족 산출 → 과금 → 보유 편입(§3.4.1-1·2·3 흐름의 가격 부분)
function simulate(purchases: readonly (readonly string[])[]) {
  const present = new Set<string>();
  let total = 0;
  const steps: number[] = [];
  for (const target of purchases) {
    const missing = missingSections(target, present);
    const presentCount = FULL_ANALYSIS_SECTIONS.filter((k: string) => present.has(k)).length;
    const cost = partialAnalysisCreditCost(missing.length, presentCount);
    total += cost;
    steps.push(cost);
    for (const k of missing) present.add(k);
  }
  return { total, steps, present };
}
const M = MODULE_REQUIRED_SECTIONS;
const FULL = FULL_ANALYSIS_SECTIONS;

// 시나리오 1 — §3.4 예시 본문 그대로: 빈 지문 어휘만 2 → 남은 전체 min(5, 5−2) = 3 (총 5)
const s1 = simulate([M.vocab, FULL]);
check("S1 빈 지문 어휘만 = 2크레딧", s1.steps[0] === 2, String(s1.steps[0]));
check("S1 남은 전체 분석 = 3크레딧", s1.steps[1] === 3, String(s1.steps[1]));
check("S1 순차 총액 = 일괄가 5", s1.total === 5, String(s1.total));

// 시나리오 2 — §3.4 예시 분기: 어휘 2 → 어법 1 → 빈칸·어순·해석영작 0(passage 보유, G2)
//              → 남은 전체(총 5)
const s2 = simulate([M.vocab, M.grammar, M.cloze, M.order, M.production, FULL]);
check("S2 어법 추가 = 1크레딧", s2.steps[1] === 1, String(s2.steps[1]));
check(
  "S2 passage 보유 모듈 3종 = 0크레딧 즉시 사용 가능",
  s2.steps[2] === 0 && s2.steps[3] === 0 && s2.steps[4] === 0,
  s2.steps.join(","),
);
check("S2 순차 총액 = 일괄가 5", s2.total === 5, String(s2.total));

// 시나리오 3 — 직독직해 우선 경로: 2 → 1 → 1 → 잔여 상한 1 (총 5)
const s3 = simulate([M.reading, M.vocab, M.grammar, FULL]);
check("S3 단계 가격 2,1,1,1", JSON.stringify(s3.steps) === JSON.stringify([2, 1, 1, 1]), s3.steps.join(","));
check("S3 순차 총액 = 일괄가 5", s3.total === 5, String(s3.total));

// (e) 불변식 전수 — 6모듈 전 순열(720) × 말미 전체 분석: 매 접두 시점의 순차 총액이
//     같은 보유 집합을 한 번에 사는 일괄가 partialAnalysisCreditCost(|보유|, 0) 와
//     일치하고, 최종 총액은 항상 일괄가 5 · 상한 5 초과 없음(검수 L1-F4).
function perms<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) =>
    perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]),
  );
}
let permOk = true;
let prefixOk = true;
let capOk = true;
for (const order of perms(Object.keys(M))) {
  const present = new Set<string>();
  let running = 0;
  for (const target of [...order.map((id) => M[id]), FULL]) {
    const missing = missingSections(target, present);
    const presentCount = FULL.filter((k: string) => present.has(k)).length;
    running += partialAnalysisCreditCost(missing.length, presentCount);
    for (const k of missing) present.add(k);
    if (running !== partialAnalysisCreditCost(present.size, 0)) prefixOk = false;
    if (running > PARTIAL_ANALYSIS_CREDIT_CAP) capOk = false;
  }
  if (running !== 5) permOk = false;
}
check("불변식: 720개 전 순열 순차 총액 = 일괄가 5", permOk);
check("불변식: 모든 접두 총액 = 같은 보유 집합의 일괄가", prefixOk);
check("불변식: 누적 총액이 상한 5 를 넘지 않음", capOk);

// (f) moduleSectionStates — §3.4 카드 상태·가격 일괄 계산 정합
const stEmpty = moduleSectionStates(new Set());
check(
  "states: 섹션 기반 6모듈 전부·중복 없음",
  stEmpty.length === 6 && new Set(stEmpty.map((s: any) => s.moduleId)).size === 6,
);
const vocabEmpty = stEmpty.find((s: any) => s.moduleId === "vocab");
check(
  "빈 지문 어휘 카드 = 2크레딧·missing 결정론 순서",
  !!vocabEmpty &&
    vocabEmpty.ready === false &&
    JSON.stringify(vocabEmpty.missing) === JSON.stringify(["passage", "vocabulary"]) &&
    vocabEmpty.creditCost === 2,
);
const stPassage = moduleSectionStates(new Set(["passage"]));
for (const id of ["cloze", "order", "production"]) {
  const st = stPassage.find((s: any) => s.moduleId === id);
  check(
    "passage 보유 → " + id + " 즉시 사용 가능·0크레딧(G2 — 잠금 금지)",
    !!st && st.ready === true && st.missing.length === 0 && st.creditCost === 0,
  );
}
const vocabP = stPassage.find((s: any) => s.moduleId === "vocab");
check(
  "passage 보유 → 어휘 1크레딧(vocabulary 만 부족)",
  !!vocabP && JSON.stringify(vocabP.missing) === JSON.stringify(["vocabulary"]) && vocabP.creditCost === 1,
);
const readingP = stPassage.find((s: any) => s.moduleId === "reading");
const grammarP = stPassage.find((s: any) => s.moduleId === "grammar");
check(
  "passage 보유 → 직독직해·어법 각 1크레딧",
  !!readingP && readingP.creditCost === 1 && !!grammarP && grammarP.creditCost === 1,
);
check(
  "states 자기 정합: ready ⇔ missing 없음 ⇔ 0크레딧",
  [...stEmpty, ...stPassage].every(
    (s: any) => s.ready === (s.missing.length === 0) && (!s.ready || s.creditCost === 0),
  ),
);

// (g) missingSections 결정론 — 결과 순서는 입력 순서가 아니라 FULL 순서를 따른다
check(
  "missingSections: 입력 순서 무관 FULL 순서",
  JSON.stringify(missingSections(["vocabulary", "passage"], new Set())) ===
    JSON.stringify(["passage", "vocabulary"]),
);
check(
  "missingSections: 보유분 제외",
  JSON.stringify(missingSections(["vocabulary", "passage"], new Set(["vocabulary"]))) ===
    JSON.stringify(["passage"]),
);

console.log(JSON.stringify({ passed, failures, full: FULL_ANALYSIS_SECTIONS }));
`;

test("studio 워크벤치 계약 — module-sections §3.4 표·가격 불변식", () => {
  const result = runHarness(".module-sections-harness.mts", moduleSectionsHarness);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 30, `검증 수가 비정상적으로 적습니다: ${result.passed}`);

  // ── 3. 복제 목록 일치 강제 — FULL_ANALYSIS_SECTIONS 는 서버 전용 정본
  //    (resilient-generate.ts ALL_SECTION_KINDS)의 복제라 순서까지 일치해야 한다.
  //    원본 모듈은 임포트가 무거워(서버 전용) 소스 텍스트로 고정한다(게이트 RED).
  const generatorSource = readFileSync(
    path.join(repoRoot, "src", "lib", "passage-report", "analysis-report", "resilient-generate.ts"),
    "utf8",
  );
  const literal = generatorSource.match(/export const ALL_SECTION_KINDS[^=]*=\s*\[([\s\S]*?)\]/);
  assert.ok(literal, "resilient-generate.ts 에 ALL_SECTION_KINDS 리터럴이 존재해야 합니다");
  const generatorKinds = [...literal[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    result.full,
    generatorKinds,
    "FULL_ANALYSIS_SECTIONS 가 resilient-generate ALL_SECTION_KINDS 복제와 순서까지 일치해야 합니다",
  );
});
