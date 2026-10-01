// qgen-lab jev(TypeSafe System One) 클라이언트 — .tmp-qgen-lab-2609/lib/jev.mjs 의 TS 이식.
// OpenRouter 경유 POST /api/v1/systemone. 원장 기록·캡 사전 거부·재시도·스키마 검증 포함.
// 제약(jevdocs): choice 옵션 2..255, score 레벨 2..10, state+최장질문 ≤32k 토큰, 전체 ≤64k.
// 모델은 재현성을 위해 jev-1.13 핀(별칭 jev-latest 는 릴리스 때 이동 — models.md:40).
// 이식 추가분: 시도당 타임아웃(JEV_TIMEOUT_MS, 기본 30s — 멈춘 요청이 랩 실행을 붙잡지 않게),
// retry-after 존중, 답 형상 검증(choice 키·score 수치), 네트워크 오류도 원장에 한 줄.
// 구제 전략 추가분: opts.timeoutMs(시도당 상한 덮어쓰기 — 전략 내부 jev 는 5s·2회). 없으면 기존 그대로.
import { assertLabBudget, readOpenRouterCostUsd, recordLabCost } from "./ledger";

export const JEV_MODEL = process.env.JEV_MODEL?.trim() || "jev-1.13";
const JEV_URL = "https://openrouter.ai/api/v1/systemone";

export type JevQuestion =
  | { type: "noul"; instructions: unknown; criteria?: { true?: unknown; false?: unknown } }
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "score"; instructions: unknown; criteria: unknown[] };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: "score";
      score: number;
      probabilities: Record<string, number>;
      confidence: number;
      legend?: Record<string, string>;
    };

export interface JevResult {
  answers: Record<string, JevAnswer>;
  costUsd: number;
  /** 호출부 체감 벽시계(재시도·백오프 포함). 원장에는 시도별 ms 가 따로 남는다. */
  ms: number;
  /** 응답 model(예: typesafe/jev-1.13-20260917). */
  model: string;
}

function jevTimeoutMs(): number {
  const n = Number(process.env.JEV_TIMEOUT_MS || 30_000);
  return Number.isFinite(n) && n >= 1_000 ? n : 30_000;
}

function validateQuestions(questions: Record<string, JevQuestion>): void {
  const entries = Object.entries(questions);
  if (entries.length === 0) throw new Error("jev: questions empty");
  for (const [k, q] of entries) {
    if (!q || !["noul", "choice", "score"].includes(q.type)) throw new Error(`jev q ${k}: bad type`);
    if (q.type === "choice") {
      const n = Object.keys(q.criteria || {}).length;
      if (n < 2 || n > 255) throw new Error(`jev q ${k}: choice options ${n} (2..255)`);
    }
    if (q.type === "score") {
      const n = (q.criteria || []).length;
      if (n < 2 || n > 10) throw new Error(`jev q ${k}: score levels ${n} (2..10)`);
    }
  }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function numMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (isNum(x)) out[k] = x;
  return out;
}

/** 고장 난 답이 통과로 바뀌지 않게 — 빠진 키·형 불일치·범위 밖은 throw
 *  (gate-tool-calls 쿡북 방어 파싱). confidence·probabilities 누락은 0·{} 기본값. */
function normalizeAnswers(
  questions: Record<string, JevQuestion>,
  raw: unknown,
): Record<string, JevAnswer> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, Record<string, unknown>>) : {};
  const out: Record<string, JevAnswer> = {};
  for (const [k, q] of Object.entries(questions)) {
    const ans = src[k];
    if (!ans || typeof ans !== "object") throw new Error(`jev did not answer ${k}`);
    if (ans.type !== undefined && ans.type !== q.type) {
      throw new Error(`jev answer type mismatch ${k}: ${String(ans.type)} != ${q.type}`);
    }
    const confidence = isNum(ans.confidence) ? ans.confidence : 0;
    if (q.type === "noul") {
      if (!isNum(ans.noul) || ans.noul < 0 || ans.noul > 1) throw new Error(`jev noul out of range ${k}`);
      out[k] = { type: "noul", noul: ans.noul };
    } else if (q.type === "choice") {
      if (
        typeof ans.choice !== "string" ||
        !Object.prototype.hasOwnProperty.call(q.criteria || {}, ans.choice)
      ) {
        throw new Error(`jev choice not in criteria ${k}: ${String(ans.choice)}`);
      }
      out[k] = { type: "choice", choice: ans.choice, probabilities: numMap(ans.probabilities), confidence };
    } else {
      if (!isNum(ans.score)) throw new Error(`jev score not numeric ${k}`);
      const legend =
        ans.legend && typeof ans.legend === "object"
          ? Object.fromEntries(
              Object.entries(ans.legend as Record<string, unknown>).map(([lk, lv]) => [
                lk,
                typeof lv === "string" ? lv : JSON.stringify(lv),
              ]),
            )
          : undefined;
      out[k] = {
        type: "score",
        score: ans.score,
        probabilities: numMap(ans.probabilities),
        confidence,
        ...(legend ? { legend } : {}),
      };
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(attempt: number, retryAfter: string | null): number {
  const ra = Number(retryAfter);
  if (retryAfter && Number.isFinite(ra) && ra > 0) return Math.min(20_000, ra * 1000);
  return Math.min(20_000, 1000 * 2 ** attempt);
}

export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  opts: { phase: string; note?: string; maxAttempts?: number; timeoutMs?: number },
): Promise<JevResult> {
  validateQuestions(questions);
  assertLabBudget(opts.phase);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  const { phase, note } = opts;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 6);
  const timeoutMs =
    opts.timeoutMs !== undefined && Number.isFinite(opts.timeoutMs) ? Math.max(1_000, opts.timeoutMs) : jevTimeoutMs();
  const body = JSON.stringify({ model: JEV_MODEL, state, questions });
  const tAll = performance.now();
  let lastErr: unknown = null;
  for (let a = 0; a < maxAttempts; a++) {
    const t0 = performance.now();
    let r: Response;
    try {
      r = await fetch(JEV_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      recordLabCost({
        phase, kind: "jev", model: JEV_MODEL, costUsd: 0,
        ms: performance.now() - t0, ok: false, note: `net ${msg.slice(0, 80)}`,
      });
      if (a < maxAttempts - 1) await sleep(backoffMs(a, null));
      continue;
    }
    const ms = Math.round(performance.now() - t0);
    if (r.status === 429 || r.status === 529 || r.status >= 500) {
      lastErr = new Error(`jev ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
      recordLabCost({ phase, kind: "jev", model: JEV_MODEL, costUsd: 0, ms, ok: false, note: `retry ${r.status}` });
      if (a < maxAttempts - 1) await sleep(backoffMs(a, r.headers.get("retry-after")));
      continue;
    }
    const txt = await r.text();
    if (!r.ok) {
      recordLabCost({ phase, kind: "jev", model: JEV_MODEL, costUsd: 0, ms, ok: false, note: `${r.status}` });
      throw new Error(`jev ${r.status} ${txt.slice(0, 400)}`);
    }
    let j: { model?: unknown; answers?: unknown; usage?: unknown };
    try {
      j = JSON.parse(txt);
    } catch {
      recordLabCost({ phase, kind: "jev", model: JEV_MODEL, costUsd: 0, ms, ok: false, note: "bad json" });
      throw new Error(`jev bad json ${txt.slice(0, 200)}`);
    }
    const model = typeof j.model === "string" && j.model ? j.model : JEV_MODEL;
    const costUsd = readOpenRouterCostUsd(j.usage) ?? 0;
    recordLabCost({ phase, kind: "jev", model, costUsd, ms, ok: true, note });
    const answers = normalizeAnswers(questions, j.answers);
    return { answers, costUsd, ms: Math.round(performance.now() - tAll), model };
  }
  throw lastErr instanceof Error ? lastErr : new Error("jev retries exhausted");
}
