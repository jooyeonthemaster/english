/** 검증기 벤치마크(O184): 감사자 확정 라벨(V4 결함/깨끗)이 있는 기존 문항을
 *  pro vs grok@high 검증기에 재검사시켜 적발률·오경보율을 비교한다. 생성 0콜. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716");
const corpus = JSON.parse(readFileSync(join(BASE, "private/corpus-joined.private.json"), "utf8")) as { rows: Array<{ frameId: string; passageText: string }> };
const passageByFrame = new Map(corpus.rows.map((r) => [r.frameId, r.passageText]));

// 감사자 확정 라벨: FAIL = validity.V4=false(치명), PASS = V 전통과·V4 주요 이슈 없음.
const CASES: Array<{ batch: string; pid: string; expect: "FAIL" | "PASS" }> = [
  // V4 치명 확정 (적발해야 함)
  { batch: "grok-longform-v1", pid: "P005", expect: "FAIL" },
  { batch: "grok-longform-v1", pid: "P007", expect: "FAIL" },
  { batch: "grok-longform-v1", pid: "P011", expect: "FAIL" },
  { batch: "grok-longform-v1", pid: "P013", expect: "FAIL" },
  { batch: "type-sweep-v1", pid: "P013", expect: "FAIL" },
  { batch: "type-sweep-v1", pid: "P014", expect: "FAIL" },
  { batch: "stdfix-blank-funnel-v1", pid: "P005", expect: "FAIL" },
  { batch: "stdfix-blank-funnel-v1", pid: "P010", expect: "FAIL" },
  { batch: "stdfix-blank-funnel-v1", pid: "P012", expect: "FAIL" },
  { batch: "stdfix-grammar-b2-v1", pid: "P003", expect: "FAIL" },
  { batch: "stdfix-grammar-b2-v1", pid: "P010", expect: "FAIL" },
  { batch: "grok-lf-med-v1", pid: "P001", expect: "FAIL" },
  // V 전통과 확정 (통과시켜야 함)
  { batch: "grok-confirm-v1", pid: "P002", expect: "PASS" },
  { batch: "grok-confirm-v1", pid: "P005", expect: "PASS" },
  { batch: "grok-confirm-v1", pid: "P006", expect: "PASS" },
  { batch: "grok-confirm-v1", pid: "P014", expect: "PASS" },
  { batch: "grok-confirm-v1", pid: "P015", expect: "PASS" },
  { batch: "grok-confirm-v1", pid: "P019", expect: "PASS" },
  { batch: "grok-confirm-v1", pid: "P021", expect: "PASS" },
  { batch: "grok-lf-high-v1", pid: "P002", expect: "PASS" },
  { batch: "grok-lf-high-v1", pid: "P006", expect: "PASS" },
  { batch: "grok-lf-high-v1", pid: "P008", expect: "PASS" },
  { batch: "stdfix-egate-pro-v1", pid: "P001", expect: "PASS" },
  { batch: "stdfix-egate-pro-v1", pid: "P002", expect: "PASS" },
];

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote: { type: "string" },
          verdict: { type: "string", enum: ["OK", "WRONG", "UNSUPPORTED"] },
          evidence: { type: "string" },
        },
        required: ["quote", "verdict", "evidence"],
      },
    },
    overallVerdict: { type: "string", enum: ["PASS", "FAIL"] },
  },
  required: ["claims", "overallVerdict"],
};

function loadCase(batch: string, pid: string) {
  const key = JSON.parse(readFileSync(join(BASE, "batches", batch, "eval/key.json"), "utf8"));
  const meta = key[pid];
  const items = readFileSync(join(BASE, "batches", batch, "items.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const item = items.find((i) => i.itemId === meta.itemId);
  const q = item?.accepted;
  const passage = passageByFrame.get(item?.frameId) ?? "";
  return { q, passage, meta };
}

function renderQ(q: Record<string, unknown>): string {
  const passageField =
    (typeof q.passageWithMarkers === "string" && q.passageWithMarkers) ||
    (typeof q.passageWithBlank === "string" && q.passageWithBlank) ||
    (typeof q.passageWithUnderline === "string" && q.passageWithUnderline) || "";
  const options = Array.isArray(q.options)
    ? (q.options as { label?: unknown; text?: unknown }[]).map((o) => `${o.label} ${o.text}`).join("\n")
    : "";
  return `${passageField}\n\n${q.direction ?? ""}\n${options}`;
}

async function verify(model: string, passage: string, q: Record<string, unknown>): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  const body: Record<string, unknown> = {
    model,
    messages: [{
      role: "user",
      content: `너는 해설 사실검증관이다. 아래 문항의 해설이 실제 영어 문장·지문과 일치하는지 주장 단위로 검증하라. 각 주장을 실제 문장을 직접 파싱해 판정하고(해설의 단정을 믿지 마라), 함정 인과의 방향, 문법 용어의 정확성, 지문 인용·문장 귀속, 오답 해설과 실제 선지 내용의 대응, 한국어 비단어·손상 용어를 모두 본다. WRONG/UNSUPPORTED 가 하나라도 있으면 overallVerdict=FAIL. 애매하면 FAIL(보수적).\n\n## 원지문\n${passage}\n\n## 문항 (학생 노출 형태)\n${renderQ(q)}\n\n## 선언 정답\n${String(q.correctAnswer ?? "")}\n\n## 검증 대상 해설\n${JSON.stringify({ explanation: q.explanation, wrongOptionExplanations: q.wrongOptionExplanations, keyPoints: q.keyPoints }, null, 1)}`,
    }],
    response_format: { type: "json_schema", json_schema: { name: "verify", strict: true, schema: VERIFY_SCHEMA } },
    max_tokens: 8000,
  };
  if (model.startsWith("x-ai/")) body.reasoning_effort = "high";
  else body.reasoning = { enabled: true, effort: "low", exclude: true };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: unknown };
  if (json.error) return `ERROR:${JSON.stringify(json.error).slice(0, 80)}`;
  try {
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "");
    return `${parsed.overallVerdict}|$${(json.usage?.cost ?? 0).toFixed(4)}`;
  } catch {
    return "PARSE_ERROR";
  }
}

async function main() {
  const MODELS = ["google/gemini-3.1-pro-preview", "x-ai/grok-4.5"];
  const results: Record<string, { hit: number; miss: number; falseAlarm: number; ok: number; err: number; cost: number }> = {};
  for (const m of MODELS) results[m] = { hit: 0, miss: 0, falseAlarm: 0, ok: 0, err: 0, cost: 0 };
  for (const c of CASES) {
    const { q, passage } = loadCase(c.batch, c.pid);
    if (!q) { console.log(`skip ${c.batch}/${c.pid} (no question)`); continue; }
    const row: string[] = [`${c.batch}/${c.pid}`.padEnd(34), c.expect.padEnd(5)];
    for (const m of MODELS) {
      const out = await verify(m, passage, q);
      const [verdict, cost] = out.split("|");
      const r = results[m]!;
      if (verdict === "FAIL" && c.expect === "FAIL") r.hit += 1;
      else if (verdict === "PASS" && c.expect === "FAIL") r.miss += 1;
      else if (verdict === "FAIL" && c.expect === "PASS") r.falseAlarm += 1;
      else if (verdict === "PASS" && c.expect === "PASS") r.ok += 1;
      else r.err += 1;
      r.cost += Number((cost ?? "$0").slice(1));
      row.push(`${m.includes("grok") ? "grok" : "pro"}:${verdict}`);
    }
    console.log(row.join("  "));
  }
  console.log("\n══ 결과 (FAIL 12 = 결함 확정본, PASS 12 = 깨끗 확정본) ══");
  for (const m of MODELS) {
    const r = results[m]!;
    console.log(`${m}: 적발 ${r.hit}/${r.hit + r.miss} | 오경보 ${r.falseAlarm}/${r.falseAlarm + r.ok} | 오류 ${r.err} | 총비용 $${r.cost.toFixed(3)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
