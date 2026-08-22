// 범용 luna-ext paired 벤치 (26-08-14, 전 유형 이식 캠페인 공용 장비).
// 사용: node_modules/.bin/tsx scripts/_bench-luna-ext.ts --type SUBTYPE [--n 12] [--label r1]
// - 같은 지문에서 luna(ext: JSON+검산+OpenAI핀) vs gemini-3.6(현행 md 레인 복제) 생성.
// - 게이트 반려 1회 재생성(프로덕션 정책), 게이트 통과분은 레인 어댑터 왕복까지 검증.
// - 산출: experiments/question-quality-20260715/luna-migration-20260814/bench/<SUBTYPE><-label>.json
// - 잔액 가드: 남은 크레딧 $5 미만이면 발사 거부(§5-11).
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-migration-20260814";
const SRC = "experiments/question-quality-20260715/luna-bench-20260814";
const LUNA = "openai/gpt-5.6-luna";
/** 대조군 기본은 3.6(캠페인 전 라운드 기준). --gmodel 로 교체해 세대 비교가 가능하다. */
const G36_DEFAULT = "google/gemini-3.6-flash";
const MAX_TOKENS = 14_000;
const CONCURRENCY = 2; // 429 방지 — 올리지 마라(캠페인은 유형 병렬로 이미 넓다)

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

interface CallMetrics {
  text: string;
  ttfbMs: number | null;
  firstReasoningMs: number | null;
  firstContentMs: number | null;
  durationMs: number;
  costUsd: number | null;
  outputTokens: number;
  reasoningTokens: number;
  provider: string | null;
  finishReason: string | null;
}

async function streamCall(args: {
  model: string;
  system?: string;
  prompt: string;
  jsonSchema?: { name: string; strict: boolean; schema: unknown };
  maxTokens?: number;
  pinOpenAI?: boolean;
}): Promise<CallMetrics> {
  const attempt = async (): Promise<CallMetrics> => {
    const t0 = Date.now();
    const messages: Array<{ role: string; content: string }> = [];
    if (args.system) messages.push({ role: "system", content: args.system });
    messages.push({ role: "user", content: args.prompt });
    const body: Record<string, unknown> = {
      model: args.model,
      messages,
      max_tokens: args.maxTokens ?? MAX_TOKENS,
      stream: true,
      usage: { include: true },
      reasoning: { enabled: true, effort: "high", exclude: false },
    };
    if (args.jsonSchema)
      body.response_format = { type: "json_schema", json_schema: args.jsonSchema };
    if (args.pinOpenAI) body.provider = { order: ["openai"], allow_fallbacks: false };
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok || !res.body)
      throw new Error(`${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let ttfbMs: number | null = null;
    let firstReasoningMs: number | null = null;
    let firstContentMs: number | null = null;
    let provider: string | null = null;
    let finishReason: string | null = null;
    let usage: any = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttfbMs === null) ttfbMs = Date.now() - t0;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          if (typeof j.provider === "string" && !provider) provider = j.provider;
          const choice = j.choices?.[0] ?? {};
          if (choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice.delta ?? {};
          const r: string = delta.reasoning ?? delta.reasoning_content ?? "";
          if (r && firstReasoningMs === null) firstReasoningMs = Date.now() - t0;
          const c: string = delta.content ?? "";
          if (c) {
            if (firstContentMs === null) firstContentMs = Date.now() - t0;
            text += c;
          }
          if (j.usage) usage = j.usage;
        } catch {
          /* partial */
        }
      }
    }
    if (!text.trim()) throw new Error("빈 본문");
    return {
      text,
      ttfbMs,
      firstReasoningMs,
      firstContentMs,
      durationMs: Date.now() - t0,
      costUsd: typeof usage?.cost === "number" ? usage.cost : null,
      outputTokens: usage?.completion_tokens ?? 0,
      reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      provider,
      finishReason,
    };
  };
  try {
    return await attempt();
  } catch (e) {
    // 전송 계층 1회 재시도(429·5xx·빈 본문) — 3s 백오프.
    await new Promise((r) => setTimeout(r, 3000));
    return attempt();
  }
}

async function main() {
  const subType = arg("type");
  const n = Number(arg("n", "12"));
  const label = arg("label", "");
  const gModel = arg("gmodel", G36_DEFAULT) as string;
  if (!subType) throw new Error("--type SUBTYPE 필수");
  console.log(`대조군 모델: ${gModel}`);

  // ── 잔액 가드 ──────────────────────────────────────────────────────────────
  const credits = await fetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  }).then((r) => r.json());
  const remaining = (credits?.data?.total_credits ?? 0) - (credits?.data?.total_usage ?? 0);
  if (remaining < 5) throw new Error(`잔액 가드: 남은 크레딧 $${remaining.toFixed(2)} < $5 — 발사 중단`);

  const { prisma } = await import("../src/lib/prisma");
  const { getMdLane } = await import("../src/lib/md-qgen/lane-registry");
  const { LUNA_QGEN_SYSTEM_MESSAGE } = await import("../src/lib/md-qgen/luna-lane");
  const { resolveQuestionTypeGenerationSettings } = await import(
    "../src/lib/question-type-generation-settings"
  );

  const lane = getMdLane(subType);
  if (!lane) throw new Error(`레인 미등록: ${subType}`);
  const kebab = subType.toLowerCase().replace(/_/g, "-");
  const mod = await import(`../src/lib/md-qgen/luna-ext/${kebab}.ts`);
  const ext = Object.values(mod).find(
    (v: any) => v && typeof v === "object" && "subType" in v && "parseAndGate" in v,
  ) as any;
  if (!ext) throw new Error(`luna-ext 모듈에서 LunaLaneExt export 미발견: ${kebab}.ts`);
  if (ext.subType !== subType) throw new Error(`ext.subType(${ext.subType}) ≠ ${subType}`);

  const gen = JSON.parse(readFileSync(resolve(SRC, "gen-v2.json"), "utf8"));
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const meta of gen.passages.slice(0, n)) {
    const p = await prisma.passage.findUnique({
      where: { id: meta.id },
      select: { id: true, title: true, content: true },
    });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }

  const resolved = resolveQuestionTypeGenerationSettings(subType, undefined, "KILLER") as Record<
    string,
    unknown
  >;
  if (!lane.isEligible(resolved)) {
    throw new Error(`기본 설정으로 레인 부적격 — resolved=${JSON.stringify(resolved).slice(0, 300)}`);
  }
  const mkCtx = (passage: string) => ({
    passage,
    difficulty: "KILLER" as const,
    rawDifficulty: "KILLER",
    resolved,
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  });

  type Arm = { arm: "luna" | "g36" };
  const tasks: Array<() => Promise<any>> = [];
  for (const p of passages) {
    for (const a of [{ arm: "luna" }, { arm: "g36" }] as Arm[]) {
      tasks.push(async () => {
        const ctx = mkCtx(p.content);
        const base = [lane.buildBasePrompt(ctx), ...lane.buildExtras(ctx)].join("\n\n");
        const callOnce = async (feedback: string | null) => {
          const luna = a.arm === "luna";
          const prompt = `${base}${luna ? `\n\n${ext.buildSelfcheck(ctx)}` : ""}${
            feedback
              ? `\n\n[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.`
              : ""
          }`;
          const r = await streamCall({
            model: luna ? LUNA : gModel,
            system: luna ? LUNA_QGEN_SYSTEM_MESSAGE : undefined,
            prompt,
            jsonSchema: luna ? ext.buildJsonSchema(ctx) : undefined,
            maxTokens: luna ? ext.maxTokens : undefined,
            pinOpenAI: luna,
          });
          let parsed: any;
          try {
            parsed = luna ? ext.parseAndGate(r.text, ctx) : lane.parseAndGate(r.text, ctx);
          } catch (e) {
            parsed = {
              question: null,
              gateIssues: [`파싱 예외: ${e instanceof Error ? e.message : String(e)}`],
              corrections: [],
            };
          }
          return { r, parsed };
        };
        try {
          const a1 = await callOnce(null);
          let chosen = a1;
          let attempts = 1;
          let firstGateIssues: string[] | null = null;
          if (a1.parsed.gateIssues.length > 0 && lane.retryEligible) {
            firstGateIssues = a1.parsed.gateIssues;
            attempts = 2;
            try {
              const a2 = await callOnce(a1.parsed.gateIssues.join(", "));
              if (a2.parsed.gateIssues.length <= a1.parsed.gateIssues.length) chosen = a2;
            } catch {
              /* keep a1 */
            }
          }
          let aiQuestion: Record<string, unknown> | null = null;
          let adaptError: string | null = null;
          if (chosen.parsed.gateIssues.length === 0) {
            try {
              const adapt = lane.adapt(chosen.parsed, ctx);
              if (adapt.ok && adapt.aiQuestion) aiQuestion = adapt.aiQuestion;
              else adaptError = adapt.error ?? "unknown";
            } catch (e) {
              adaptError = e instanceof Error ? e.message : String(e);
            }
          }
          return {
            arm: a.arm,
            passageId: p.id,
            passageTitle: p.title,
            attempts,
            firstGateIssues: firstGateIssues?.map((i) => i.slice(0, 200)) ?? null,
            gateIssues: chosen.parsed.gateIssues.map((i: string) => i.slice(0, 200)),
            corrections: chosen.parsed.corrections,
            adaptError,
            aiQuestion,
            parsedQuestion: chosen.parsed.question,
            ttfbMs: chosen.r.ttfbMs,
            firstReasoningMs: chosen.r.firstReasoningMs,
            firstContentMs: chosen.r.firstContentMs,
            durationMs: chosen.r.durationMs,
            totalDurationMs:
              chosen === a1 ? a1.r.durationMs : a1.r.durationMs + chosen.r.durationMs,
            totalCostUsd: (a1.r.costUsd ?? 0) + (chosen === a1 ? 0 : chosen.r.costUsd ?? 0),
            outputTokens: chosen.r.outputTokens,
            reasoningTokens: chosen.r.reasoningTokens,
            provider: chosen.r.provider,
            finishReason: chosen.r.finishReason,
            rawText: String(chosen.r.text).slice(0, 6000),
          };
        } catch (e) {
          return {
            arm: a.arm,
            passageId: p.id,
            passageTitle: p.title,
            error: e instanceof Error ? e.message : String(e),
            gateIssues: [],
            aiQuestion: null,
          };
        }
      });
    }
  }

  const rows: any[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      const r = await tasks[i]();
      rows.push(r);
      const st = r.error
        ? `ERROR ${r.error.slice(0, 50)}`
        : r.gateIssues.length
          ? `REJECT: ${r.gateIssues[0]?.slice(0, 55)}`
          : r.adaptError
            ? `ADAPT-FAIL: ${String(r.adaptError).slice(0, 50)}`
            : "PASS";
      console.log(
        `[${rows.length}/${tasks.length}] ${r.arm} ${String(r.passageTitle).slice(0, 20)} ${((r.totalDurationMs ?? 0) / 1000).toFixed(0)}s att${r.attempts ?? "-"} ${st}`,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  mkdirSync(resolve(DIR, "bench"), { recursive: true });
  const out = resolve(DIR, "bench", `${subType}${label ? `-${label}` : ""}.json`);
  writeFileSync(
    out,
    JSON.stringify({ generatedAt: new Date().toISOString(), subType, n, gModel, rows }, null, 2),
  );
  for (const armName of ["luna", "g36"]) {
    const rs = rows.filter((r) => r.arm === armName);
    const ok = rs.filter((r) => !r.error && r.gateIssues.length === 0 && !r.adaptError);
    const live = rs.filter((r) => !r.error);
    console.log(
      `${subType} ${armName}: 통과 ${ok.length}/${rs.length} | 평균 ${(live.reduce((x, r) => x + (r.totalDurationMs ?? 0), 0) / Math.max(1, live.length) / 1000).toFixed(1)}s | 문항당 ₩${((live.reduce((x, r) => x + (r.totalCostUsd ?? 0), 0) / Math.max(1, live.length)) * 1470).toFixed(1)}`,
    );
  }
  console.log(`저장: ${out}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
