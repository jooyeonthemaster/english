#!/usr/bin/env node
// P0 지문 무결성 감사 — Codex 워커풀 (지문 단위).
//
// 왜 별도 러너인가: `codex-pool.mjs` 는 **유닛**(passageId + subType) 단위라
// 지문 단위 감사에 맞지 않는다. 감사는 지문 1개 → `_passage.json` 1개다.
//
// 왜 Codex 인가: 감사 큐 2,132건은 Claude 쿼터를 통째로 먹는다.
// 저작·검수가 Claude 를 필요로 하므로 감사는 구독 쿼터로 민다(메모리 no-external-paid-api 준수 —
// Codex 는 사용자 ChatGPT 구독이라 과금 API 가 아니다).
//
// 실행:
//   node qbank/harness/codex-audit.mjs --limit 40 --concurrency 8
//   node qbank/harness/codex-audit.mjs --year 2026 --limit 74 --concurrency 10
//
// 중단내성: `_passage.json` 이 이미 있는 지문은 건너뛴다. 재발사가 무해하다(I6).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { acquireSlot, slotStatus } from "./slots.mjs";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf("--" + n); return i === -1 ? d : argv[i + 1]; };
const LIMIT = Number(arg("limit", 40));
const CONCURRENCY = Number(arg("concurrency", 8));
const YEAR = arg("year", null);
const EFFORT = arg("effort", null);

const screen = JSON.parse(fs.readFileSync(path.join(ROOT, "qbank/spec/passage-screen.json"), "utf8"));
const corpusRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/exam-passages/passages.json"), "utf8"));
const corpus = Array.isArray(corpusRaw) ? corpusRaw : (corpusRaw.passages || Object.values(corpusRaw)[0]);
const byId = new Map(corpus.map((p) => [p.id, p]));

const outDirFor = (p) => path.join(ROOT, "qbank/out", String(p.year), p.id);
const donePath = (p) => path.join(outDirFor(p), "_passage.json");

// 스크리닝이 정한 auditQueue 순서를 그대로 따른다 — 우선순위가 이미 반영돼 있다.
const queue = (screen.auditQueue || [])
  .map((x) => (typeof x === "string" ? x : x.id))
  .map((id) => byId.get(id))
  .filter(Boolean)
  .filter((p) => (YEAR ? String(p.year) === String(YEAR) : true))
  .filter((p) => !fs.existsSync(donePath(p)))
  .slice(0, LIMIT);

if (!queue.length) {
  console.log("[codex-audit] 감사할 지문이 없다 (전부 _passage.json 보유 또는 필터 결과 0)");
  process.exit(0);
}

// 스크리닝이 이 지문에 붙인 코드 — 감사자가 무엇을 의심해야 하는지의 출발점
const codesFor = (id) => {
  const r = (screen.results || []).find((x) => x && (x.id === id || x[0] === id));
  if (!r) return [];
  if (Array.isArray(r.issues)) return r.issues.map((i) => i.code || i);
  if (Array.isArray(r)) return r.slice(1).flat().filter((v) => typeof v === "string");
  return [];
};

const prompt = (p) => [
  `너는 수능 영어 **지문 무결성 감사관**이다. 아래 지문에 오류가 있는지 판정하고 결과 파일을 써라.`,
  ``,
  `지문 ID: ${p.id}`,
  `연도/시험: ${p.year} ${p.exam || ""}  ·  유형: ${p.type || "?"}  ·  ${p.wordCount}단어`,
  `복원 종류(reconstructionKind): ${p.reconstructionKind || "unknown"}`,
  `기계 스크리닝이 붙인 코드: ${codesFor(p.id).join(", ") || "(없음)"}`,
  ``,
  `── 지문 원문 ──`,
  p.text,
  `── 끝 ──`,
  ``,
  `## 왜 이 감사가 필요한가`,
  `이 코퍼스의 지문은 **기출 문제에서 역복원**된 것이다. 원래 문제가 빈칸·어법오류·순서섞기였다면`,
  `그 조작을 되돌린 흔적이 남아 있을 수 있다. 우리는 이 지문 위에 수십 개의 변형 문항을 쌓을 것이므로,`,
  `**지문에 오류가 하나라도 남아 있으면 그 위의 모든 문항이 오염된다.**`,
  ``,
  `## 무엇을 보는가 (reconstructionKind 에 맞춰 초점을 바꿔라)`,
  `- \`grammar_error\` 계열: 어법 오류가 **되돌려지지 않고 남아 있는지**. 정형동사 수일치, 태,`,
  `  준동사, 관계사, 병렬, 대명사 수·격을 **전수** 훑어라. 원 문제의 정답 자리가 특히 위험하다.`,
  `- \`vocab\`/\`word_swap\` 계열: 문맥상 반대·부적절한 낱말이 남아 있는지.`,
  `- \`order\`/\`insert\`/\`irrelevant\` 계열: 문장 순서가 논리적으로 이어지는지, 접속·지시어가`,
  `  가리킬 선행사를 실제로 갖는지, 무관 문장이 남아 있지 않은지.`,
  `- \`blank\` 계열: 빈칸 마커나 복원 실패 흔적(\`___\`, \`(A)\`, \`[ ]\`)이 본문에 남아 있는지.`,
  `- 공통: 접합 흔적(문장 중간에 대문자 시작, 중복 어구, 잘린 앞뒤), 철자·구두점 파손.`,
  ``,
  `## 판정 규율`,
  `- **정상을 오류로 부르지 마라.** 영어에 실제로 존재하는 구문을 "어색하다"는 이유로 지적하면`,
  `  멀쩡한 지문 수천 개를 버리게 된다. 오류라고 하려면 **문법적으로 불가능**하거나`,
  `  **문맥상 명백히 모순**이어야 한다.`,
  `- 반대로 **판단이 안 서면 통과시키지 마라.** 애매한 것을 흘려보내면 오염이 하류로 번진다.`,
  `  이때는 \`confidence:"low"\` 로 낮추고 그 어구를 \`issues\` 에 남겨라 —`,
  `  심각도는 아래 §"격리와 교정" 규칙으로 정한다(원문 확정 불가 = block, 확정 가능 = flag).`,
  `- \`checkedFor\` 에 **실제로 무엇을 확인했는지 구체적으로** 적어라(대상 어구를 인용해서).`,
  `  "전반적으로 확인함" 같은 서술은 감사하지 않은 것과 같다.`,
  ``,
  `## ⚠ 격리와 교정을 구분하라 — 이 구분이 코퍼스의 절반을 좌우한다`,
  `\`ok:false\` 는 **"이 지문 위에는 어떤 문항도 쌓을 수 없다"** 는 뜻이고, 그 지문의 수십 개 유닛이 통째로 폐기된다.`,
  `그러니 **되돌릴 수 없는 손상에만** 쓴다. 반면 한 군데를 고치면 멀쩡해지는 것은 격리가 아니라 교정 대상이다.`,
  ``,
  `- \`severity: "block"\` → \`ok:false\`. 복원 실패로 **무엇이 원문인지 알 수 없는** 경우다:`,
  `  어법 오류가 남았는데 원형이 불명, 문장 순서가 깨져 논리가 복구 불가, 앞뒤가 잘려 나감,`,
  `  빈칸 마커가 남았는데 원 표현 불명.`,
  `- \`severity: "flag"\` → **\`ok:true\`** 로 두되 \`suggestedFix\` 를 반드시 채운다. 원문이 무엇인지`,
  `  **명확히 알 수 있는** 국소 결함이다: 고유명사 철자(McNeil→McNeill), 명백한 오타, 구두점 파손.`,
  `  이런 것으로 지문을 버리지 마라 — 고쳐 쓰면 된다.`,
  `- \`severity: "note"\` → \`ok:true\`. 문항 제작에 영향 없는 관찰(표기 관행 차이 등).`,
  ``,
  `판단 기준은 하나다: **"원문이 무엇이었는지 내가 확정할 수 있는가?"**`,
  `확정할 수 있으면 flag(+교정안), 확정할 수 없으면 block.`,
  ``,
  `## 산출`,
  `\`${path.relative(ROOT, donePath(p)).replace(/\\/g, "/")}\` 에 아래 JSON 을 써라(디렉토리가 없으면 만들어라).`,
  `기존 파일이 있으면 **전면 교체**한다.`,
  ``,
  `{`,
  `  "id": "${p.id}",`,
  `  "auditedAt": "<ISO8601>",`,
  `  "reconstructionKind": "${p.reconstructionKind || "unknown"}",`,
  `  "auditedBy": "codex/gpt-5.6",`,
  `  "integrity": {`,
  `    "ok": <true|false>,`,
  `    "confidence": "<high|medium|low>",`,
  `    "checkedFor": ["<확인한 항목을 어구 인용과 함께>", ...],`,
  `    "issues": [{`,
  `      "span": "<문제 어구 그대로 — 지문에서 그대로 찾을 수 있어야 한다>",`,
  `      "why": "<왜 오류인가>",`,
  `      "severity": "<block|flag|note>",`,
  `      "suggestedFix": "<flag 면 필수 — span 을 무엇으로 바꿔야 하는지. block/note 면 빈 문자열>"`,
  `    }]`,
  `  }`,
  `}`,
  ``,
  `오류가 없으면 \`issues\` 는 빈 배열이다. \`ok\` 는 **block 이 하나라도 있을 때만 false** 다.`,
  `마지막 줄에 \`RESULT: ok=<true|false> confidence=<...> block=<n> flag=<n>\` 을 출력하라.`,
].join("\n");

const pickCodex = () => {
  const glob = "/c/Users/jooye/.vscode/extensions/openai.chatgpt-";
  const base = "C:/Users/jooye/.vscode/extensions";
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith("openai.chatgpt-")).sort();
  for (const d of dirs.reverse()) {
    const bin = path.join(base, d, "bin/windows-x86_64/codex.exe");
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error(`codex 바이너리를 찾지 못했다 (${glob}*)`);
};
const CODEX_BIN = pickCodex();

const logDir = path.join(ROOT, "qbank/logs/codex-audit");
fs.mkdirSync(logDir, { recursive: true });

let done = 0, okCount = 0, badCount = 0;
const started = Date.now();

const runOne = (p) => new Promise((resolve) => {
  fs.mkdirSync(outDirFor(p), { recursive: true });
  const logFile = path.join(logDir, `${p.id}.log`);
  const ws = fs.createWriteStream(logFile);
  const args = ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write"];
  if (EFFORT) args.push("-c", `model_reasoning_effort=${EFFORT}`);
  args.push(prompt(p));
  const t0 = Date.now();
  const child = spawn(CODEX_BIN, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let tail = "";
  const cap = (buf) => { const s = buf.toString(); ws.write(s); tail = (tail + s).slice(-4000); };
  child.stdout.on("data", cap);
  child.stderr.on("data", cap);
  child.on("close", () => {
    ws.end();
    const secs = Math.round((Date.now() - t0) / 1000);
    const landed = fs.existsSync(donePath(p));
    let verdict = "?";
    if (landed) {
      try {
        const r = JSON.parse(fs.readFileSync(donePath(p), "utf8"));
        const iss = r.integrity?.issues || [];
        const nb = iss.filter((i) => i.severity === "block").length;
        const nf = iss.filter((i) => i.severity === "flag").length;
        // ok 는 block 유무로만 갈린다 — flag(교정 가능)는 사용 가능 지문이다
        if (nb > 0) { verdict = `BLOCK(${nb})`; badCount++; }
        else if (nf > 0) { verdict = `FIXABLE(${nf})`; okCount++; }
        else { verdict = "CLEAN"; okCount++; }
      } catch { verdict = "PARSE_FAIL"; }
    }
    done++;
    const rate = done / ((Date.now() - started) / 3600000);
    console.log(
      `[${String(done).padStart(3)}/${queue.length}] ${landed ? verdict.padEnd(10) : "NO_FILE   "} ` +
      `${p.id.padEnd(32)} ${String(secs).padStart(4)}s  (시간당 ${rate.toFixed(1)}건)`
    );
    resolve();
  });
});

console.log(`[codex-audit] 지문 ${queue.length} · 동시 ${CONCURRENCY} · effort=${EFFORT ?? "(config 기본)"}`);
console.log(`[codex-audit] 바이너리 ${CODEX_BIN}`);

const cursor = { i: 0 };
const worker = async () => {
  while (cursor.i < queue.length) {
    const p = queue[cursor.i++];
    // ★ 전역 슬롯 — 저작 풀과 같은 기계를 나눠 쓴다(slots.mjs 주석의 스래싱 사고 참조)
    const slot = await acquireSlot({ label: p.id });
    try { await runOne(p); } finally { slot.release(); }
  }
};
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

console.log(`\n[codex-audit] 완료 — 클린 ${okCount} · 이슈 ${badCount} · 파일없음 ${queue.length - okCount - badCount}`);
console.log(`[codex-audit] 총 ${Math.round((Date.now() - started) / 1000)}초`);
