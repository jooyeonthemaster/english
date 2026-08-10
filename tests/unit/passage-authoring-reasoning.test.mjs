// ============================================================================
// AI 지문 생성 — 사고(reasoning) 계약. 두 겹이다.
//
// ① resolveAuthoringReasoningEffort — 사고 강도를 "요청에서 파생"한다.
//   왜 이 테스트가 있나: 26-07-25 실사용 첫 실패의 원인이 고정 상수 effort="high"
//   였다. reasoning 토큰은 프롬프트가 커질수록 늘고 maxOutputTokens 를 함께 먹으므로,
//   자료 없는 요청에 맞는 값이 자료 18k자 요청에서는 JSON 을 잘라 버린다.
//   리졸버가 조용히 고정 상수로 되돌아가면 같은 사고가 재현된다 — 그 회귀를 막는다.
//
//   실측 근거(google/gemini-3.6-flash, 26-07-25):
//     effort   총 11.4k자        총 27.4k자
//     high     40.8s(60s캡 실패)  50.8s·54.0s 모두 실패(240s 줘도)
//     medium   33.8s             43.1s
//     low      11.4s             4.4~13.7s
//
// ② 스트림 레인의 **사고 델타 수신** 계약(소스 잠금).
//   이 기능의 명시적 실패조건은 "reasoning.exclude 가 true 면 사고 델타가 아예 오지
//   않는다 = 사고 패널이 영구 빈 화면"이다. 그런데 그 조건을 잠그는 테스트가 없었다.
//   누군가 stream/route.ts 의 직접 fetch 를 공용 atlasReasoningRequestFor 로
//   "정리"하면 gemini 분기가 exclude:true 를 실어 기능이 죽는데, 게이트 4종은 전부
//   초록이다. 그래서 아래 §A 가 소스 문자열을 직접 잠근다
//   (passage-authoring-refund.test.mjs 와 같은 리포 관례 — 그쪽은 환불 계산식을
//    같은 방식으로 잠근다).
//
// ③ 비상 env 오버라이드의 화이트리스트(블로커 8).
//   PASSAGE_AUTHORING_REASONING_EFFORT 가 검증 없이 통과하면 "none" 한 값으로 두
//   레인의 의미가 갈린다 — JSON 레인은 atlas-ai 가 {enabled:false} 로 번역하지만,
//   스트림 레인은 {enabled:true, effort:"none"} 을 와이어에 직송한다. 장애 대응으로
//   env 를 켜는 바로 그 순간 스트림 레인만 다르게 깨진다. 화이트리스트 밖 값이
//   무시되는지를 (a) 순수 함수로 (b) env 를 실제로 켠 별도 프로세스로 잠근다.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// execFileSync 로 npx.cmd 를 직접 부르면 Windows 에서 EINVAL 이다(.cmd 는 셸을
// 거쳐야 한다). 같은 디렉터리의 다른 하네스 테스트와 동일하게 execSync 를 쓴다.
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// generate.ts 는 ai-sdk·prisma 계열을 최상단에서 끌어오므로 단위 테스트가 그대로
// import 할 수 없다. 다른 passage-authoring 테스트와 같은 tsx 하네스 방식을 쓴다.
const harnessSource = `
import { readFileSync } from "node:fs";
import * as srcPath from "node:path";

// generate.ts 는 default export 가 없다(다른 하네스 테스트의 대상 모듈과 다른 점).
// CJS 트랜스파일 결과에서 네임드를 꺼내려면 네임스페이스 import 를 쓴다.
import * as genMod from "@/lib/passage-authoring/generate";
const { resolveAuthoringReasoningEffort, normalizeReasoningEffortOverride } =
  genMod as any;

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean) => {
  if (ok) passed += 1;
  else failures.push(label);
};

const readSrc = (...parts: string[]) =>
  readFileSync(srcPath.join(process.cwd(), ...parts), "utf8").replace(/\\r\\n/g, "\\n");
const streamSrc = readSrc(
  "src", "app", "api", "workbench", "passage-authoring", "stream", "route.ts",
);
const genSrc = readSrc("src", "lib", "passage-authoring", "generate.ts");

// ══ §A 스트림 레인 소스 잠금 — 사고 델타가 실제로 오는 조건 ═══════════════
// (a) exclude:false 를 싣는다 ─────────────────────────────────────────────
check(
  "스트림 레인 요청 body 가 reasoning{enabled:true, effort, exclude:false} 를 싣는다",
  streamSrc.includes(
    "reasoning: { enabled: true, effort: args.reasoningEffort, exclude: false },",
  ),
);
// 코드에 쓰이는 형태는 프리티어 규약상 항상 공백 있는 "exclude: false" 다.
// (주석 본문은 공백 없는 "exclude:true" 로 적혀 있어 이 대조에 걸리지 않는다 —
//  일부러 그렇게 두었다. 주석까지 잡으면 설명을 못 쓴다.)
check(
  "스트림 레인 코드에 exclude: true 가 없다",
  !streamSrc.includes("exclude: true"),
);
check(
  "exclude 지정은 정확히 한 곳(사고 스트림 콜)뿐",
  streamSrc.split("exclude: false").length - 1 === 1,
);
// 받은 사고 델타를 실제로 화면으로 흘리는 배선까지 함께 잠근다. exclude:false 만
// 지켜도 소비부가 사라지면 증상(빈 사고 패널)은 똑같다.
check(
  "사고 델타를 reasoning/reasoning_content 두 이름 모두에서 읽는다",
  streamSrc.includes(
    'const reasoningDelta: string = delta.reasoning ?? delta.reasoning_content ?? "";',
  ),
);
check(
  '사고 델타를 t:"r" 프레임으로 방출한다',
  streamSrc.includes('if (reasoningDelta) args.emit({ t: "r", d: maskDelta(reasoningDelta) });'),
);

// (b) max_tokens 는 사고+출력 공유를 감안한 값이고, 실제로 요청에 실린다 ────
check(
  "MD_MAX_TOKENS 상수가 16,000 으로 선언돼 있다",
  streamSrc.includes("const MD_MAX_TOKENS = 16_000;"),
);
check(
  "요청 body 가 그 상수를 max_tokens 로 싣는다(리터럴 하드코딩 금지)",
  streamSrc.includes("max_tokens: MD_MAX_TOKENS,"),
);
const mdCap = streamSrc.match(/const MD_MAX_TOKENS = ([\\d_]+);/);
const mdTokens = mdCap ? Number(mdCap[1].replace(/_/g, "")) : 0;
const jsonCap = genSrc.match(/maxOutputTokens: ([\\d_]+),/);
const jsonTokens = jsonCap ? Number(jsonCap[1].replace(/_/g, "")) : 0;
check("MD_MAX_TOKENS 를 소스에서 수치로 읽었다", mdTokens > 0);
check("JSON 레인 maxOutputTokens 를 소스에서 수치로 읽었다", jsonTokens > 0);
// 사고 델타를 실제로 받는 레인이 사고를 숨기는 레인보다 상한이 작으면 절단이 난다
// (26-07-25 사고: reasoning 이 8,000 캡을 태워 JSON 이 잘렸다).
check(
  "스트림 레인 상한 ≥ JSON 레인 상한 (사고를 받는 쪽이 더 여유 있어야 한다)",
  mdTokens >= jsonTokens,
);
check("스트림 레인 상한이 16,000 이상", mdTokens >= 16_000);

// (c) 공용 변환기를 쓰지 않는다 ───────────────────────────────────────────
// atlas-ai.atlasReasoningRequestFor 는 gemini 분기에서 **항상** exclude:true 를
// 싣는다(atlas-ai.ts:352-369). 그 함수로 "정리"하는 순간 사고 패널이 죽는다.
check(
  "스트림 레인이 atlasReasoningRequestFor 를 호출하지 않는다",
  !/atlasReasoningRequestFor\\s*\\(/.test(streamSrc),
);
check(
  "스트림 레인이 atlasReasoningRequestFor 를 import 하지 않는다",
  !/atlasReasoningRequestFor\\s*,/.test(streamSrc),
);
// 공용 SDK 프로바이더(atlasCloud.transformRequestBody)를 타면 같은 변환기가
// 자동으로 걸린다 — 그래서 이 콜만은 게이트웨이에 직접 fetch 한다.
check(
  "사고 콜은 게이트웨이 chat/completions 로 직접 fetch 한다",
  streamSrc.includes("/chat/completions") && /await fetch\\(/.test(streamSrc),
);
check(
  "스트림 레인 사고 콜이 SDK generateObject 를 쓰지 않는다",
  !/generateObject\\s*\\(/.test(streamSrc),
);

// ══ §B env 오버라이드 화이트리스트(블로커 8) ══════════════════════════════
check(
  "화이트리스트 상수가 low|medium|high 세 값이다",
  genSrc.includes(
    'const REASONING_EFFORT_WHITELIST: readonly string[] = ["low", "medium", "high"];',
  ),
);
check(
  '화이트리스트에 "none" 이 없다(사고 끄기는 effort 손잡이로 표현하지 않는다)',
  !/REASONING_EFFORT_WHITELIST[^;]*"none"/.test(genSrc),
);
check(
  "env 오버라이드가 정규화를 거쳐 상수에 들어간다",
  genSrc.includes(
    "const AUTHORING_REASONING_OVERRIDE = normalizeReasoningEffortOverride(",
  ),
);
check(
  "정규화된 오버라이드가 있으면 리졸버가 그것을 먼저 돌려준다",
  genSrc.includes("if (AUTHORING_REASONING_OVERRIDE) return AUTHORING_REASONING_OVERRIDE;"),
);

// 순수 함수 동작 — 범위 밖은 전부 null(=파생 로직으로 떨어진다).
for (const ok of ["low", "medium", "high"]) {
  check("오버라이드 허용값 " + ok, normalizeReasoningEffortOverride(ok) === ok);
}
check("대소문자·공백은 정규화한다", normalizeReasoningEffortOverride("  HIGH ") === "high");
for (const bad of [
  "none", "NONE", "off", "disabled", "0", "minimal", "xhigh", "very-high",
  "medium-high", "true", "lo w", "highest", "２", "-", "null",
]) {
  check(
    "범위 밖 오버라이드는 무시된다: " + bad,
    normalizeReasoningEffortOverride(bad) === null,
  );
}
for (const empty of ["", "   ", undefined]) {
  check(
    "빈 오버라이드는 null: " + JSON.stringify(empty),
    normalizeReasoningEffortOverride(empty as any) === null,
  );
}

// ══ §C 리졸버 파생 규칙 ═══════════════════════════════════════════════════
// ⚠️ 아래 검증들은 "유효한 오버라이드가 걸려 있지 않은 상태"를 전제한다. 테스트
//    러너는 이 하네스를 (1) env 없이 (2) env="none"(범위 밖) 으로 두 번 돌린다 —
//    두 실행의 결과가 같아야 오버라이드 검증이 실효한다.

// ── 이미지가 붙으면 언제나 low ──────────────────────────────────────────────
// 비전 디코딩 지연이 미실측이다. 미실측 구간에서 사고를 올리는 것이 이번 사고의
// 방식이었으므로, 재기 전까지는 낮은 쪽에 선다.
check(
  "이미지 1장이면 프롬프트가 작아도 low",
  resolveAuthoringReasoningEffort({ promptChars: 1_000, imageCount: 1 }) === "low",
);
check(
  "이미지 4장이면 low",
  resolveAuthoringReasoningEffort({ promptChars: 5_000, imageCount: 4 }) === "low",
);

// ── 프롬프트 총량 임계 ──────────────────────────────────────────────────────
check(
  "자료 없는 최소 요청(11.4k자 실측 구간)은 medium",
  resolveAuthoringReasoningEffort({ promptChars: 11_400, imageCount: 0 }) === "medium",
);
check(
  "임계값(16,000) 정확히는 medium — 초과일 때만 내린다",
  resolveAuthoringReasoningEffort({ promptChars: 16_000, imageCount: 0 }) === "medium",
);
check(
  "임계 1자 초과는 low",
  resolveAuthoringReasoningEffort({ promptChars: 16_001, imageCount: 0 }) === "low",
);
check(
  "실사용 실패 재현 구간(27.4k자)은 반드시 low",
  resolveAuthoringReasoningEffort({ promptChars: 27_400, imageCount: 0 }) === "low",
);
check(
  "자료 예산 상한(60k자)을 다 쓴 요청도 low",
  resolveAuthoringReasoningEffort({ promptChars: 70_000, imageCount: 0 }) === "low",
);

// ── high 는 어떤 조건에서도 자동 선택되지 않는다 ────────────────────────────
// 실측에서 자료 없는 최소 요청조차 60s 캡에서 실패했다.
const efforts = new Set<string>();
for (let chars = 0; chars <= 80_000; chars += 250) {
  for (const imageCount of [0, 1, 2, 4]) {
    efforts.add(resolveAuthoringReasoningEffort({ promptChars: chars, imageCount }));
  }
}
check("자동 선택 결과에 high 가 없다", !efforts.has("high"));
check("자동 선택 결과는 low·medium 두 종뿐", efforts.size === 2);
// 와이어 직송 레인이 있으므로 비표준 문자열이 새어 나가면 그 자체로 400 이다.
check(
  "리졸버 출력은 언제나 화이트리스트 안",
  [...efforts].every((value) => ["low", "medium", "high"].includes(value)),
);

// ── 결정론 ─────────────────────────────────────────────────────────────────
const a = resolveAuthoringReasoningEffort({ promptChars: 12_345, imageCount: 0 });
const b = resolveAuthoringReasoningEffort({ promptChars: 12_345, imageCount: 0 });
check("같은 입력이면 같은 출력", a === b);

// ── 단조성: 프롬프트가 커지면서 사고가 다시 올라가지 않는다 ────────────────
// medium → low 로 한 번 내려간 뒤 다시 medium 이 되면 큰 요청이 위험 구간에
// 재진입한다. 경계가 하나뿐임을 잠근다.
const RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
let prev = RANK[resolveAuthoringReasoningEffort({ promptChars: 0, imageCount: 0 })];
let monotonic = true;
for (let chars = 0; chars <= 80_000; chars += 500) {
  const cur = RANK[resolveAuthoringReasoningEffort({ promptChars: chars, imageCount: 0 })];
  if (cur > prev) monotonic = false;
  prev = cur;
}
check("프롬프트가 커질수록 사고 강도는 오르지 않는다(단조 비증가)", monotonic);

console.log(JSON.stringify({ passed, failures }));
`;

/** 하네스를 tsx 로 1회 실행하고 {passed, failures} 를 돌려준다. */
function runHarness(envOverride) {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-authoring-reasoning");
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "probe.ts");
  fs.writeFileSync(entry, harnessSource, "utf8");

  const env = { ...process.env };
  // 개발 머신의 .env 가 이 키를 갖고 있어도 테스트 결과가 흔들리면 안 된다.
  delete env.PASSAGE_AUTHORING_REASONING_EFFORT;
  if (envOverride !== undefined) {
    env.PASSAGE_AUTHORING_REASONING_EFFORT = envOverride;
  }

  let stdout = "";
  try {
    stdout = execSync(`npx tsx "${entry}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 120_000,
      env,
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "{}";
  return JSON.parse(lastLine);
}

// 검증을 추가하면 이 값도 함께 올린다. 하네스가 조용히 빈 채로 통과하는 것
// (import 실패·조기 return)을 막는 하한이다.
const MIN_CHECKS = 50; // 현재 53건.

test("passage-authoring reasoning contract (resolver + stream lane source locks)", () => {
  const { passed, failures } = runHarness(undefined);
  assert.equal(failures.length, 0, `실패한 검증: ${failures.join(", ")}`);
  assert.ok(passed >= MIN_CHECKS, `검증이 너무 적게 돌았다(${passed}건)`);
});

test("비상 env 오버라이드가 범위 밖 값이면 무시된다 (PASSAGE_AUTHORING_REASONING_EFFORT=none)", () => {
  // 블로커 8 의 정확한 사고 값. 이 값이 그대로 통과하면 스트림 레인이 와이어에
  // {enabled:true, effort:"none"} 을 실어 게이트웨이가 400 을 내거나 조용히
  // 무시한다(JSON 레인은 atlas-ai 가 {enabled:false} 로 번역해 정상 동작 —
  // 즉 **한쪽 레인만** 깨진다). env 를 실제로 켠 별도 프로세스로 잠근다.
  const { passed, failures } = runHarness("none");
  assert.equal(
    failures.length,
    0,
    `env="none" 이 파생 로직을 오염시켰다: ${failures.join(", ")}`,
  );
  assert.ok(passed >= MIN_CHECKS, `검증이 너무 적게 돌았다(${passed}건)`);
});
