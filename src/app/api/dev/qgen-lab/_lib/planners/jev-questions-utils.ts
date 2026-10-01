// qgen-lab jev 질문 공용 도구 — 조각 합치기·요청 분할(한도 안 팬아웃)·병렬 요청·임계 밴드 재질의,
// 그리고 D10 번호 지문 텍스트 도우미(calib/d10-verify/designs.mjs 축자 이식 — state 모양이 보정과 같아야 한다).
// 한도(jevdocs models.md:15-20): 요청당 state+전 질문 ≤64k 토큰, state+최장 질문 ≤32k, choice 옵션 ≤255.
// 토큰 추정은 JSON 문자수/3.0(보수적 — site-planner 실측 A2 질문 ≈3.1자/토큰).
import { askJev, type JevAnswer, type JevQuestion } from "../jev-client";
import type { JevFragment, JevState } from "./jev-questions";

// ── D10 텍스트 도우미(designs.mjs 축자) ──────────────────────────────────────────────────
export const NUMS = ["①", "②", "③", "④", "⑤"];
const MARK_RE = /【([①-⑤])\s*([^】]*)】/g;

/** 번호 지문 → 마커 제거 평문. */
export const plain = (numbered: string): string => numbered.replace(MARK_RE, (_m, _n, t: string) => t.trim());

/** 번호 지문을 문장으로 나눠 마커 1..5 각각이 든 문장(마커 포함)을 돌려준다. */
export function sentencesByMarker(numbered: string): string[] {
  const bounds = [0];
  const re = /[.!?]["”’')]*\s+(?=["“‘'(]?[A-Z【])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(numbered))) bounds.push(m.index + m[0].length);
  bounds.push(numbered.length);
  const sents: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) sents.push({ start: bounds[i], end: bounds[i + 1], text: numbered.slice(bounds[i], bounds[i + 1]).trim() });
  return NUMS.map((n) => {
    const pos = numbered.indexOf(`【${n}`);
    return sents.find((s) => pos >= s.start && pos < s.end)?.text ?? "";
  });
}

/** 대상 마커는 ⟦text⟧(replacement 있으면 그것), 나머지 마커는 제거. */
export function markedSentence(sentence: string, no: number, replacement?: string): string {
  return sentence.replace(MARK_RE, (_m, n: string, t: string) => (NUMS.indexOf(n) + 1 === no ? `⟦${replacement ?? t.trim()}⟧` : t.trim()));
}

export function hashBit(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) & 1;
}

// ── 조각 합치기 ─────────────────────────────────────────────────────────────────────────

/** 같은 state 조각을 한 요청으로 합친다. 질문 키에 prefix 를 붙이고(`${prefix}:${key}`, prefix 빈 문자열이면 그대로),
 *  state 는 문자열이면 동일해야 하고 객체면 키 합집합(같은 키는 같은 값이어야 함)으로 합친다. 충돌은 throw. */
export function combineFragments(parts: { prefix: string; fragment: JevFragment }[]): JevFragment {
  let state: JevState | undefined;
  const questions: Record<string, JevQuestion> = {};
  for (const { prefix, fragment } of parts) {
    const s = fragment.state;
    if (s !== undefined) {
      if (state === undefined) state = typeof s === "string" ? s : { ...s };
      else if (typeof s === "string" || typeof state === "string") {
        if (s !== state) throw new Error("combineFragments: state 불일치(문자열)");
      } else {
        for (const [k, v] of Object.entries(s)) {
          if (k in state && JSON.stringify(state[k]) !== JSON.stringify(v)) throw new Error(`combineFragments: state.${k} 충돌`);
          state[k] = v;
        }
      }
    }
    for (const [k, q] of Object.entries(fragment.questions)) {
      const key = prefix ? `${prefix}:${k}` : k;
      if (key in questions) throw new Error(`combineFragments: 질문 키 중복 ${key}`);
      questions[key] = q;
    }
  }
  return { state, questions };
}

// ── 요청 분할 ───────────────────────────────────────────────────────────────────────────

export interface PackLimits {
  /** 요청당 추정 토큰 상한(state+질문). 기본 56k(하드 64k 에 여유). */
  maxTokens?: number;
  /** 요청당 질문 수 상한. 기본 255. */
  maxQuestions?: number;
  charsPerToken?: number;
}

export const estTokens = (v: unknown, charsPerToken = 3.0) => Math.ceil(JSON.stringify(v ?? null).length / charsPerToken);

/** 한 state 의 질문 묶음을 한도 안의 요청들로 나눈다(균형 분할 — 병렬 지연을 고르게).
 *  choice 옵션 수·state+최장 질문(32k) 위반은 throw. 기본 한도에서 site-planner A2+D(~65후보·130질문)는 대개 1요청. */
export function packJevRequests(fragment: JevFragment, limits: PackLimits = {}): { state: JevState; questions: Record<string, JevQuestion> }[] {
  const cpt = limits.charsPerToken ?? 3.0;
  const maxTok = limits.maxTokens ?? 56_000;
  const maxQ = Math.min(limits.maxQuestions ?? 255, 10_000);
  const state = fragment.state ?? "";
  const stTok = estTokens(state, cpt);
  const entries = Object.entries(fragment.questions);
  if (entries.length === 0) return [];
  const sizes = entries.map(([k, q]) => {
    if (q.type === "choice") {
      const n = Object.keys(q.criteria || {}).length;
      if (n < 2 || n > 255) throw new Error(`jev 질문 ${k}: choice 옵션 ${n}개(2..255)`);
    }
    const t = estTokens(q, cpt);
    if (stTok + t > 32_000) throw new Error(`jev 질문 ${k}: state+질문 추정 ${stTok + t} 토큰 > 32k`);
    return t;
  });
  const total = sizes.reduce((s, x) => s + x, 0);
  const room = Math.max(1, maxTok - stTok);
  const k = Math.max(Math.ceil(total / room), Math.ceil(entries.length / maxQ), 1);
  const target = total / k;
  const out: { state: JevState; questions: Record<string, JevQuestion> }[] = [];
  let cur: Record<string, JevQuestion> = {};
  let tok = 0;
  let n = 0;
  entries.forEach(([key, q], i) => {
    const t = sizes[i];
    const over = tok + t > room || n + 1 > maxQ;
    const balanced = out.length < k - 1 && tok >= target;
    if (n > 0 && (over || balanced)) {
      out.push({ state, questions: cur });
      cur = {};
      tok = 0;
      n = 0;
    }
    cur[key] = q;
    tok += t;
    n++;
  });
  if (n > 0) out.push({ state, questions: cur });
  return out;
}

export interface PackedResult {
  answers: Record<string, JevAnswer>;
  costUsd: number;
  /** 병렬 요청 전체 벽시계. */
  ms: number;
  requests: number;
  requestMs: number[];
  estTokens: number;
  model: string;
}

/** 조각을 한도 안 요청들로 나눠 병렬 질의하고 답을 합친다(원장·캡은 askJev 가 처리). */
export async function askJevPacked(
  fragment: JevFragment,
  opts: { phase: string; note?: string } & PackLimits,
): Promise<PackedResult> {
  const reqs = packJevRequests(fragment, opts);
  const t0 = performance.now();
  const rs = await Promise.all(
    reqs.map((r, i) => askJev(r.state, r.questions, { phase: opts.phase, note: `${opts.note ?? ""}${reqs.length > 1 ? ` #${i + 1}/${reqs.length}` : ""}`.trim() })),
  );
  return {
    answers: Object.assign({}, ...rs.map((r) => r.answers)),
    costUsd: rs.reduce((s, r) => s + r.costUsd, 0),
    ms: Math.round(performance.now() - t0),
    requests: reqs.length,
    requestMs: rs.map((r) => r.ms),
    estTokens: reqs.reduce((s, r) => s + estTokens(r.state, opts.charsPerToken) + estTokens(r.questions, opts.charsPerToken), 0),
    model: rs[0]?.model ?? "",
  };
}

/** 동시성 제한 map(요청이 조각별로 다른 state 일 때 — D7 쌍 등). */
export async function pmap<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** D14 밴드: 첫 값이 임계 ±band 안이면 extra 번 더 물어 평균(보정 권고 — D7 ±0.1·2회, D4 ±0.08). */
export async function askBanded(
  first: number,
  threshold: number,
  reask: () => Promise<number>,
  opts: { band?: number; extra?: number } = {},
): Promise<{ value: number; asks: number; values: number[] }> {
  const band = opts.band ?? 0.1;
  const extra = opts.extra ?? 2;
  const values = [first];
  if (Math.abs(first - threshold) < band) for (let i = 0; i < extra; i++) values.push(await reask());
  return { value: values.reduce((s, x) => s + x, 0) / values.length, asks: values.length, values };
}
