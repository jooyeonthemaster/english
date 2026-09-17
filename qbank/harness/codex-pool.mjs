// Codex 워커풀 — Codex CLI 를 N개 동시 실행해 유닛 작업을 처리한다.
//
// 왜 별도 드라이버인가: Workflow 의 agent() 는 Claude 다. Codex 는 셸 프로세스이므로
// 워크플로가 아니라 여기서 직접 몬다. **Claude 세션 쿼터를 전혀 소모하지 않는 두 번째 실행 풀**이다.
// 실측(2026-07-28): Claude 세션 한도에 3번 걸렸다 — 이 풀이 그 병목을 우회한다.
//
// 실행:
//   node qbank/harness/codex-pool.mjs --batch qbank/work/pilot-q23.json --role author --concurrency 3
//   node qbank/harness/codex-pool.mjs --batch <file> --role review --concurrency 4
//   node qbank/harness/codex-pool.mjs --units "2027_x-q23:TOPIC,2027_x-q23:MAIN_IDEA" --role review
//   ... --dry-run   (프롬프트만 찍고 실행 안 함)
//
// 산출: 유닛 디렉토리에 .md / .review.json 이 직접 쓰인다(Claude 경로와 동일).
//       실행 로그는 qbank/logs/codex/<passageId>__<subType>__<role>.log

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { unitStatus, STATUS } from "./ledger.mjs";
import { acquireSlot, slotStatus } from "./slots.mjs";

const ROOT = process.cwd();

/**
 * 게이트 번들 재빌드 — 워커를 띄우기 전에 **매번** 돌린다.
 *
 * 왜 번들인가: 에이전트는 자가 게이트 루프에서 게이트를 유닛당 5~10회 부른다.
 * `tsx` 는 호출마다 qgen-core → src/lib/md-qgen/* 전체를 재컴파일하는데,
 * 동시 15기가 그걸 동시에 하면 12코어가 포화된다(실측: 게이트 1회 66초, 번들은 13초 — 5배).
 * 병목은 Codex API 가 아니라 **로컬 CPU** 였다.
 *
 * 왜 매번인가: 번들이 낡으면 에이전트가 **구버전 게이트로 검증**한다 —
 * 통과했다는 보고가 거짓이 되는 조용한 사고다. esbuild 는 1초면 끝나므로
 * 조건부 재빌드로 아끼려다 스테일 위험을 지는 것은 남는 장사가 아니다.
 */
const GATE_BUNDLE = "qbank/harness/.build/gate.mjs";
{
  const r = spawnSync(
    path.join(ROOT, "node_modules/.bin/esbuild.cmd"),
    [
      "qbank/harness/gate.ts", "--bundle", "--platform=node", "--format=esm",
      "--target=node20", `--outfile=${GATE_BUNDLE}`, "--external:node:*", "--log-level=warning",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(`[codex-pool] 게이트 번들 빌드 실패 — 에이전트가 검증할 수단이 없다.\n${r.stderr || r.stdout}`);
    process.exit(3);
  }
  console.log(`[codex-pool] 게이트 번들 재빌드 완료 (${GATE_BUNDLE})`);
}
const SHIM = path.join(ROOT, "qbank/harness/codex.sh");
const LOGDIR = path.join(ROOT, "qbank/logs/codex");
const PLAN = path.join(ROOT, "qbank/spec/unit-plan.json");

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf("--" + n);
  return i === -1 ? d : argv[i + 1];
};
const has = (n) => argv.includes("--" + n);

const ROLE = arg("role", "review");
const CONCURRENCY = Number(arg("concurrency", 3));
const TIMEOUT_MS = Number(arg("timeout", 1800)) * 1000;
// 기본값 없음 — 지정하지 않으면 `~/.codex/config.toml` 의 설정(ultra)이 그대로 적용된다.
// 초판이 "high" 를 기본값으로 넘겨 사용자 설정을 조용히 하향시켰다(실측 적발).
const EFFORT = arg("effort", null);

const passages = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/exam-passages/passages.json"), "utf8"));
const byId = new Map(passages.map((p) => [p.id, p]));
const plan = fs.existsSync(PLAN) ? JSON.parse(fs.readFileSync(PLAN, "utf8")) : { units: [] };
const planByKey = new Map(plan.units.map((u) => [u.passageId + " " + u.subType, u]));

// ── 대상 유닛 수집 ────────────────────────────────────────────────────────
let units = [];
const batchFile = arg("batch");
if (batchFile) {
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, batchFile), "utf8"));
  units = b.units || [];
} else if (arg("units")) {
  units = arg("units")
    .split(",")
    .map((s) => {
      const [passageId, subType] = s.split(":");
      const u = planByKey.get(passageId + " " + subType);
      return { passageId, subType, variants: u?.variants ?? 5, year: byId.get(passageId)?.year, tier: u?.tier };
    });
} else {
  console.error("--batch <file> 또는 --units <pid:TYPE,...> 가 필요하다");
  process.exit(2);
}

// 역할별로 처리 가능한 상태만 남긴다.
// --any-status: 상태 무관 강제 실행(교차 검수 실험처럼 이미 검수된 유닛을 다시 볼 때).
units = units.filter((u) => {
  const p = byId.get(u.passageId);
  if (!p) return false;
  if (has("any-status")) return true;
  const st = unitStatus(p.year, u.passageId, u.subType).status;
  if (ROLE === "author") return st === STATUS.PENDING || st === STATUS.GATE_FAILED || st === STATUS.AUTHORED;
  if (ROLE === "review") return st === STATUS.GATED || st === STATUS.REVIEW_ISSUES || st === STATUS.REVIEWED;
  if (ROLE === "repair") return st === STATUS.REVIEW_ISSUES;
  return true;
});

if (!units.length) {
  console.log(`[codex-pool] 처리할 유닛이 없다 (role=${ROLE})`);
  process.exit(0);
}

// ── 프롬프트 조립 ─────────────────────────────────────────────────────────
const SPEC = "qbank/spec";

function unitDir(u) {
  return `qbank/out/${byId.get(u.passageId).year}/${u.passageId}`;
}

function authorPrompt(u) {
  const d = unitDir(u);
  return [
    "너는 대한민국 수능 영어 최정상 출제위원이다. 작업 디렉토리는 d:/Desktop/2026project/nara 이다.",
    "",
    `## 임무 — 기출 지문 \`${u.passageId}\` 로 **${u.subType}** 유형 문항 **${u.variants}개** 설계`,
    `산출 경로: \`${d}/${u.subType}.md\``,
    "",
    "## 필독 (이 순서로 Read — 건너뛰면 반드시 반려된다)",
    `1. \`${SPEC}/quality-constitution.md\`  — 품질 헌법(A등급 7조건·실패축 V1~V5·오답 택소노미 L1~L7/F1~F7)`,
    `2. \`${SPEC}/craft/00-AUTHORING.md\`    — 공통 저작 지침. **§4.4 반복 실패 패턴 6종을 특히 정독하라**`,
    `3. \`${SPEC}/types/${u.subType}.md\`    — 형식 계약(골격·파서 규칙·게이트 사유·§8 다각화 축)`,
    `4. \`${SPEC}/recon/00-contract.md\`     — 공유 계약(장식 0·마커 밖 지문 불가침)`,
    "",
    "## 지문 확보 (손으로 옮겨 적지 마라 — 한 글자만 달라도 재구성 게이트가 반려한다)",
    "```",
    `node qbank/harness/passage.mjs ${u.passageId} --meta`,
    "```",
    "",
    "## 절대 규칙",
    "- **장식 0**: 굵게·헤딩·불릿·인용·표·백틱을 머리표와 선지 줄에 절대 쓰지 마라.",
    "- **마커 밖 지문 불가침**: 지문 변형 유형은 마커 밖을 한 글자도 바꿀 수 없다.",
    "- **정답 머리표는 유형마다 다르다** — 형식 계약 문서를 확인하라(`정답:` / `모범답안:` / `정답(A):` / `고침(A):`).",
    "- **수를 채우려 품질을 낮추지 마라.** 적격 표적이 요청보다 적으면 그만큼만 만들고 사유를 보고하라.",
    "",
    "## 출력 형식 (컨테이너)",
    "```",
    "<!-- ITEM 1",
    "difficulty: BASIC|INTERMEDIATE|KILLER",
    "point: <겨냥 지점 + 인지 작업. 유닛 내에서 유일해야 한다>",
    "craft: <설계 의도 — 최강 미끼가 무엇이고 왜인지>",
    'settings: {"optionCount":5}',
    "-->",
    "<형식 계약대로의 마크다운. 장식 0.>",
    "```",
    "",
    "## ★ 자가 게이트 루프 (0원 — PASS 날 때까지 반복하라, 최대 6회)",
    "```",
    `node qbank/harness/.build/gate.mjs --passage ${u.passageId} --type ${u.subType}`,
    "```",
    "",
    "## 반환",
    "마지막 줄에 `RESULT: gatePassed=<true|false> items=<개수> attempts=<시도횟수>` 를 출력하라.",
    "거짓 보고 금지 — 마지막 게이트 실행이 실제로 PASS 였을 때만 true 다.",
  ].join("\n");
}

function reviewPrompt(u) {
  const d = unitDir(u);
  return [
    "너는 이 문항들을 **처음 보는 적대적 검수관**이다. 저작자가 아니다.",
    "작업 디렉토리는 d:/Desktop/2026project/nara 이다.",
    "**너는 이 문항을 만든 모델과 다른 모델이다 — 그래서 네 블라인드 풀이가 특별히 값지다.**",
    "같은 모델이 자기 문항을 풀면 자기 사고 경로를 그대로 되밟아 결함을 못 본다. 너는 그 맹점을 공유하지 않는다.",
    "",
    "## 대상",
    `- 문항 파일: \`${d}/${u.subType}.md\``,
    `- 게이트 결과: \`${d}/${u.subType}.gate.json\` (형식은 이미 통과했다 — 형식을 다시 보지 마라)`,
    `- 유형: ${u.subType} · 지문 id: ${u.passageId}`,
    "",
    "## 필독",
    `\`${SPEC}/quality-constitution.md\` — 특히 §1(A등급 7조건) §2(실패축 V1~V5·C5) §3(오답 택소노미) §8(검수 5렌즈)`,
    "",
    "## 지문 확보 (사실의 유일한 원천)",
    "```",
    `node qbank/harness/passage.mjs ${u.passageId}`,
    "```",
    "",
    "## 5렌즈를 전부 수행하라",
    "### ① 블라인드 풀이 (★ 네가 다른 모델이라 가장 값진 렌즈)",
    "**먼저 `정답:`·`해설:`·`오답:` 을 보지 말고** 지문과 선지만으로 각 문항을 실제로 풀어라.",
    "네 답과 confidence(high/medium/low)를 기록한 뒤에야 정답을 확인하라.",
    "불일치 → V2 critical. confidence low → V2 major. 두 선지가 모두 성립하면 그 자체가 critical.",
    "### ② 품질·사실 검수 (V4)",
    "해설이 인용한 영어가 지문에 **문자 그대로** 있는가. 지문에 없는 배경지식을 근거로 쓰는가.",
    "오답 해설의 라벨이 실제 그 선지를 가리키는가. 정답이 서로 다른 문장 2곳으로 방어되는가.",
    "**해설이 주장하는 기제가 실제로 작동하는가**(조건의 효력·모범답안의 통사를 문자 단위로 대조).",
    "### ③ 형식 규정 (게이트가 못 보는 것만)",
    "선지 층위 통일 / 길이 편향(정답이 최장인가) / 극단어 편중 / 해설 언어 규약(한자·가나·'영단어+다').",
    "### ④ 미끼 심사",
    "오답마다 decoyPull 0~10 과 (L,F) 코드 부여. BASIC ≥3 / INTERMEDIATE ≥5 / KILLER ≥7.",
    "**같은 F코드 3회 이상 → 실격(critical).** 즉사 오답 과반 → critical.",
    "### ⑤ 다각화 심사 (유닛 전체 동시)",
    "두 문항이 사실상 같은 것을 묻는가. 난이도 분포. point 값이 실제 내용과 일치하는가.",
    "**내용일치 계열은 전 문항 선지 명제의 진리값 표를 만들어 모순이 없는지 확인하라.**",
    "",
    "## 판정 규칙",
    "- critical = 출하 불가 / major = 수리 대상 / minor = 기록만.",
    "- **모든 finding 에 지문 또는 문항 직접 인용을 붙여라.** 인용 없는 지적은 지적이 아니다.",
    "- **0건 보고는 받아들여지지 않는다** — 최소한 minor 라도 무엇을 검토했는지 남겨라.",
    "",
    "## 산출",
    // ⚠ Claude 검수자의 `.review.json` 을 덮어쓰지 않는다. 별도 파일에 쓴다 —
    //   ① 동시 실행 충돌 방지 ② **두 모델 검수자를 직접 대조**할 수 있게(교차 검수의 값은 여기서 나온다)
    `\`${d}/${u.subType}.review.codex.json\` 에 아래 스키마로 Write 하라.`,
    "**같은 이름의 `.review.json` 이 이미 있어도 절대 건드리지 마라** — 다른 검수자의 산출물이다.",
    "```json",
    "{",
    `  "passageId": "${u.passageId}", "subType": "${u.subType}", "reviewer": "codex",`,
    '  "blindSolve": [{"item":1,"myAnswer":"③","confidence":"high","matchesIntended":true,"competingOption":""}],',
    '  "decoyScores": [{"item":1,"maxDecoyPull":7,"strongest":"②","codes":["②: L2+F1"]}],',
    '  "findings": [{"item":1,"lens":"blind|fact|format|decoy|diversity","severity":"critical|major|minor",',
    '               "axis":"V1|V2|V3|V4|V5|C5|other","summary":"...","evidence":"<직접 인용>","suggestedFix":"..."}],',
    '  "grade": "A|B|C|F"',
    "}",
    "```",
    "마지막 줄에 `RESULT: critical=<n> major=<n> grade=<X>` 를 출력하라.",
  ].join("\n");
}

function repairPrompt(u) {
  const d = unitDir(u);
  return [
    "너는 검수 지적을 **실제로 고치는** 수리 담당이다. 저작자도 검수자도 아니다.",
    "작업 디렉토리는 d:/Desktop/2026project/nara 이다.",
    "",
    `## 대상: \`${d}/${u.subType}.md\``,
    `## 지적: \`${d}/${u.subType}.review.json\` 의 findings 중 severity 가 critical 또는 major 인 것`,
    "",
    "## 필독",
    `\`${SPEC}/quality-constitution.md\` · \`${SPEC}/types/${u.subType}.md\` · \`${SPEC}/craft/00-AUTHORING.md\` §4.4`,
    "",
    "## 지문 확보",
    "```",
    `node qbank/harness/passage.mjs ${u.passageId}`,
    "```",
    "",
    "## 규칙",
    "- 지적된 문항만 고쳐라. 통과한 문항은 **손대지 마라**(회귀 방지).",
    "- 지적이 틀렸다고 판단되면 고치지 말고 사유와 함께 보고하라 — 검수 오탐도 실재한다.",
    "- 수리 후 **반드시** 게이트를 다시 돌려 PASS 를 확인하라:",
    "```",
    `node qbank/harness/.build/gate.mjs --passage ${u.passageId} --type ${u.subType}`,
    "```",
    "- `.review.json` 의 각 finding 에 `\"outcome\": \"fixed|skipped|no_change_needed\"` 를 추가해 갱신하라.",
    "",
    "## 반환",
    "마지막 줄에 `RESULT: gatePassed=<true|false> fixed=<n> skipped=<n>` 을 출력하라.",
    "**고치지 않고 fixed 라고 하지 마라.**",
  ].join("\n");
}

const PROMPT = { author: authorPrompt, review: reviewPrompt, repair: repairPrompt }[ROLE];
if (!PROMPT) {
  console.error(`알 수 없는 role: ${ROLE} (author|review|repair)`);
  process.exit(2);
}

// ── 실행 ──────────────────────────────────────────────────────────────────
fs.mkdirSync(LOGDIR, { recursive: true });

function runOne(u) {
  return new Promise((resolve) => {
    const tag = `${u.passageId}__${u.subType}__${ROLE}`;
    const logPath = path.join(LOGDIR, tag + ".log");
    const prompt = PROMPT(u);
    if (has("dry-run")) {
      fs.writeFileSync(logPath.replace(/\.log$/, ".prompt.txt"), prompt, "utf8");
      resolve({ unit: u, ok: true, dryRun: true });
      return;
    }
    const started = Date.now();
    const out = fs.createWriteStream(logPath);
    const child = spawn("bash", [SHIM, "exec", prompt], {
      cwd: ROOT,
      env: EFFORT ? { ...process.env, CODEX_EFFORT: EFFORT } : { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let tail = "";
    const cap = (buf) => {
      const s = buf.toString();
      out.write(s);
      tail = (tail + s).slice(-4000);
    };
    child.stdout.on("data", cap);
    child.stderr.on("data", cap);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      out.end();
      const m = /RESULT:\s*(.+)/.exec(tail);
      resolve({
        unit: u,
        ok: code === 0,
        exit: code,
        seconds: Math.round((Date.now() - started) / 1000),
        result: m ? m[1].trim() : null,
        logPath,
      });
    });
  });
}

async function pool(items, n, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      // ★ 전역 슬롯 — 이 풀의 concurrency 는 **자기 상한**일 뿐이다.
      //   여러 풀이 동시에 돌면 합계가 기계를 넘긴다(실전: 4개 풀 합 38 → CPU 100%, 스래싱).
      //   여기서 기계 전체의 여유를 확인하고 없으면 기다린다.
      const slot = await acquireSlot({ label: `${items[idx].subType}@${items[idx].passageId.slice(-4)}` });
      let r;
      try {
        r = await fn(items[idx]);
      } finally {
        slot.release();
      }
      results[idx] = r;
      const u = items[idx];
      console.log(
        `[${String(results.filter(Boolean).length).padStart(3)}/${items.length}] ${r.ok ? "OK  " : "FAIL"} ` +
          `${u.subType.padEnd(24)} ${String(r.seconds ?? 0).padStart(4)}s  ${r.result ?? ""}`,
      );
    }
  });
  await Promise.all(workers);
  return results;
}

// ── 버전 각인 ─────────────────────────────────────────────────────────────
// Codex 확장은 **몇 주 주기로 업데이트되며 그때마다 바이너리 경로가 바뀐다**(메모리 codex-integration).
// 실제로 이 프로젝트 진행 중에도 사용자가 중간에 업데이트를 걸었다.
// 산출물 품질이 갑자기 달라지면 "지침 탓인지 버전 탓인지"를 가려야 하므로, 매 런의 바이너리를 기록한다.
let CODEX_VERSION = "(unknown)";
let CODEX_PATH = "(unknown)";
try {
  const { execSync } = await import("node:child_process");
  CODEX_PATH = execSync(`bash ${JSON.stringify(SHIM)} --which`, { encoding: "utf8" }).split("\n")[0].trim();
  CODEX_VERSION = execSync(`bash ${JSON.stringify(SHIM)} --which`, { encoding: "utf8" }).split("\n")[1]?.trim() || "?";
} catch {
  /* 버전 조회 실패는 실행을 막지 않는다 */
}

console.log(`[codex-pool] role=${ROLE} · 유닛 ${units.length} · 동시 ${CONCURRENCY} · effort=${EFFORT ?? "(config 기본: ultra)"}`);
console.log(`[codex-pool] 바이너리 ${CODEX_VERSION}`);
console.log(`[codex-pool]          ${CODEX_PATH}`);
const started = Date.now();
const results = await pool(units, CONCURRENCY, runOne);
const ok = results.filter((r) => r && r.ok).length;
console.log(`\n[codex-pool] 완료 ${ok}/${units.length} · ${Math.round((Date.now() - started) / 1000)}s`);
console.log(`[codex-pool] 로그: ${LOGDIR}`);
if (ok < units.length) {
  console.log("실패 유닛:");
  for (const r of results) if (r && !r.ok) console.log(`  ${r.unit.subType} exit=${r.exit} → ${r.logPath}`);
}
