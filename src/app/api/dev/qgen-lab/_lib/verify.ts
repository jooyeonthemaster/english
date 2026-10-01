// qgen-lab 생성 후 검증기 jev-d10 (PLANNER-SPEC §3 — 보정 승자 설계 축자: calib/d10-verify MP·PM + calib/d7-validity C_cls_ex).
// 문항당 병렬 3콜. 생성기의 키·해설은 state 에 넣지 않는다(앵커링: 넣으면 오류없음 적발 31→19/37) — 키는 코드에서만 쓴다.
//   MP = mpChoice: {표시 문장, 고친 문장}(순서는 문항 해시) → pFixed = P(고친 쪽만 옳음)
//   PM = pmDecoy × 미끼 4개: state = 마커 제거 평문, ⟦⟧ 표시 문장 Bad=TRUE noul → 미끼별 P(오류)
//   D7 = validityClsEx(original = 고친 문장, modified = 표시 문장) → pBroke = P(broke_grammar)
// 규칙: PASS ⇔ pFixed ≥ minFixed(0.3) AND max 미끼 P(오류) ≤ maxDecoyErr(0.7) AND pBroke ≥ tau.
// D14 밴드: 첫 값이 임계 ±band(0.1) 안이면 reask(2)회 더 물어 평균 — 다른 조건이 밴드 밖에서 이미 실패면 생략.
// 고친 형 = 정답 밑줄의 original(게이트가 지문 재구성으로 축자 검증한 원문 형태). 없으면 고침(fixes/fix).
//
// τ 근거(26-09-25, scripts/_tmp-qgenlab-verify-test.ts): 기존 원자료(d10 raw MP·PM × d7 r1/r2 C_cls_ex, 금표준 37건 전부 조인)로
// 먼저 계산 → 같은 결론을 이 모듈 경로 라이브(d10 픽스처 194건, D7 3회·밴드 규칙 재생, phase plnverify-calib $0.029)로 확정.
//   τ     금표준 통과   N0 적발  N2 적발  NK 적발  실물 무효 4 적발  생성 유효 통과(GEN 22)
//   0     36/37 97%    36/37   29/37   37/37   0/4             22/22
//   0.12  34/37 92%    37/37   30/37   37/37   0/4             20/22   ← 기본값
//   0.3   31/37 84%    37/37   30/37   37/37   3/4             18/22
//   0.35  31/37 84%    37/37   30/37   37/37   3/4             18/22
//   0.4   31/37 84%    37/37   30/37   37/37   3/4             18/22
//   0.5   28/37 76%    37/37   31/37   37/37   3/4             17/22
//   → 규칙 그대로면 후보 0.3~0.5 는 전부 금표준 < 90%. 90% 이상 최댓값 = 0.14(0.15 부터 33/37) 인데 경계 항목
//     G:2023_SN them→themselves 가 pBroke 0.14(5회 판독 ±0.01)라 0.14 는 동전 던지기 → 안정 최댓값 0.12.
//     이 τ 에서 탈락: 2013_06 That→What(MP) · 2019_SN did→has(D7 0.02) · 2005_SN alike→like(D7 0.07).
//     실물 무효(your partner making 0.26 · has been giving 0.23 · cook traditions 0.19 · wave after wave is 0.84)는 못 잡는다.
//   면제 변형 {d7ExemptProForm:true}(대명사·대동사 쌍은 D7 제외 — D7 보정 "대명사 축 0/4 수용" 근거):
//     τ 0.3~0.45 → 금표준 34/37 92% · 실물 무효 3/4 · N0 37/37 · NK 37/37 · N2 29/37 · GEN 18/22 (τ 0.5 → 32/37).
//     실물 무효를 잡으려면 이 변형 + τ 0.3(적발이 0.3 에서 포화, 0.4 부터 S 유효 14/15)을 params 로 켠다.
// perMark 매핑: 미끼 = 1 − PM P(오류), 정답 = MP P(표시문만 옳음) + P(둘 다 옳음) (= 표시 문장이 문법적일 확률).
import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { VerifyResult } from "@/lib/qgen-lab/types";
import { askJev, type JevQuestion } from "./jev-client";
import { mpChoice, pmDecoy, readNoul, readValidity, validityClsEx, type JevFragment } from "./planners/jev-questions";
import { combineFragments, NUMS, sentencesByMarker } from "./planners/jev-questions-utils";

/** 재생성 피드백에 올라가는 실패 사유 머리말 — route.ts:1115 relocation 정규식(/정답 시비/)을 태운다. */
export const JEV_VERIFY_ISSUE_PREFIX = "정답 시비 — jev 검증: ";

/** 오케스트레이터용: 실패 VerifyResult → 게이트 이슈 한 줄(머리말 중복 방지). */
export function verifyGateIssue(v: Pick<VerifyResult, "reason">): string {
  return v.reason.startsWith(JEV_VERIFY_ISSUE_PREFIX) ? v.reason : `${JEV_VERIFY_ISSUE_PREFIX}${v.reason}`;
}

// ── 파라미터 ───────────────────────────────────────────────────────────────────────────────

/** D7 pBroke 임계 — 규칙 그대로에서 금표준 통과 ≥ 90% 인 안정 최댓값(머리 주석 표). */
export const D10_TAU = 0.12;

export interface D10Params {
  minFixed: number;
  maxDecoyErr: number;
  tau: number;
  band: number;
  reask: number;
  /** 대명사·대동사 쌍(them↔themselves, did↔has …)은 D7 게이트 면제(D7 보정: 대명사 축 0/4 수용 — MP·PM 만 적용). */
  d7ExemptProForm: boolean;
  /** MP 순서 해시 키(기본 = 정답 라벨 + 표시 지문). 보정 재현 시 claim id. */
  itemId?: string;
}

export const D10_DEFAULTS: Omit<D10Params, "itemId"> = {
  minFixed: 0.3,
  maxDecoyErr: 0.7,
  tau: D10_TAU,
  band: 0.1,
  reask: 2,
  d7ExemptProForm: false,
};

const num01 = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : d);

export function d10Params(params: Record<string, unknown> | undefined): D10Params {
  const p = params ?? {};
  const reask = typeof p.reask === "number" && Number.isInteger(p.reask) ? Math.max(0, Math.min(4, p.reask)) : D10_DEFAULTS.reask;
  return {
    minFixed: num01(p.minFixed, D10_DEFAULTS.minFixed),
    maxDecoyErr: num01(p.maxDecoyErr, D10_DEFAULTS.maxDecoyErr),
    tau: num01(p.tau, D10_DEFAULTS.tau),
    band: num01(p.band, D10_DEFAULTS.band),
    reask,
    d7ExemptProForm: typeof p.d7ExemptProForm === "boolean" ? p.d7ExemptProForm : D10_DEFAULTS.d7ExemptProForm,
    ...(typeof p.itemId === "string" && p.itemId ? { itemId: p.itemId } : {}),
  };
}

// ── 문항 → 검증 입력 ─────────────────────────────────────────────────────────────────────

const INLINE_MARK_RE = /\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g;

function labelIndex(label: string): number {
  const m = /^\(?([A-J])\)?$/.exec(label.trim());
  return m ? m[1].charCodeAt(0) - 65 : -1;
}

/** [[X:shown]] → 【① shown】 (라벨 A~J → ①~⑩). 보정 픽스처(normMarks)와 같은 표기(원문자 뒤 공백 1칸). */
export function toJevDisplayPassage(markedPassage: string): string {
  const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  return markedPassage.replace(INLINE_MARK_RE, (_m, letter: string, shown: string) => {
    const i = letter.charCodeAt(0) - 65;
    return `【${CIRCLED[i] ?? `(${letter})`} ${shown}】`;
  });
}

export interface D10Item {
  /** 번호 지문(【① x】…【⑤ x】) — 보정 display.numbered 와 같은 모양. */
  numbered: string;
  /** 정답 번호 1..5 · 라벨 "(C)". */
  key: number;
  answerLabel: string;
  shown: string;
  fix: string;
  marks: { label: string; no: number; shown: string }[];
  itemId: string;
}

/** 문항 → D10 입력. 밑줄 2~5개·정답 밑줄·고친 형이 없으면 throw(검증 불가 = 실행 오류). */
export function d10ItemFromQuestion(q: MdGrammarQuestion, itemId?: string): D10Item {
  const marked = q.markedPassage;
  if (!marked || !marked.includes("[[")) throw new Error("jev 검증 불가: markedPassage 없음(지문 복사 형식 아님)");
  const marks = [...q.marks]
    .map((m) => ({ label: m.label, i: labelIndex(m.label), shown: m.shown.trim(), original: (m.original ?? "").trim() }))
    .filter((m) => m.i >= 0)
    .sort((a, b) => a.i - b.i);
  if (marks.length < 2 || marks.length > NUMS.length || marks.some((m) => m.i >= NUMS.length)) {
    throw new Error(`jev 검증 불가: 밑줄 ${marks.length}개(라벨 A~E, 2~5개만)`);
  }
  const ans = marks.find((m) => m.i === labelIndex(q.answer));
  if (!ans) throw new Error(`jev 검증 불가: 정답 라벨 ${q.answer} 가 밑줄에 없음`);
  const fix = ans.original || (q.fixes?.[ans.label] ?? q.fix ?? "").trim();
  if (!fix) throw new Error(`jev 검증 불가: 정답 ${ans.label} 고친 형 없음`);
  if (fix === ans.shown) throw new Error(`jev 검증 불가: 정답 ${ans.label} 표시형이 원형과 같다`);
  const numbered = toJevDisplayPassage(marked);
  const sents = sentencesByMarker(numbered);
  for (const m of marks) {
    if (!sents[m.i]) throw new Error(`jev 검증 불가: ${m.label} 문장을 찾지 못함`);
  }
  return {
    numbered,
    key: ans.i + 1,
    answerLabel: ans.label,
    shown: ans.shown,
    fix,
    marks: marks.map((m) => ({ label: m.label, no: m.i + 1, shown: m.shown })),
    itemId: itemId ?? `${ans.label}|${marked}`,
  };
}

// ── 질문 조각(축자 빌더 재사용) ──────────────────────────────────────────────────────────

export interface D10Fragments {
  mp: JevFragment & { meta: { fixedKey: string; shownKey: string } };
  /** 미끼 번호 → 단일 질문 조각(state 동일 — 요청 시 combineFragments). */
  pm: Map<number, JevFragment>;
  d7: JevFragment;
  shownSentence: string;
  fixedSentence: string;
}

export function buildD10Fragments(item: D10Item): D10Fragments {
  const mp = mpChoice({ numbered: item.numbered, key: item.key, shown: item.shown, fix: item.fix, id: item.itemId });
  const st = mp.state as Record<string, string>;
  const fixedSentence = st[mp.meta.fixedKey];
  const shownSentence = st[mp.meta.shownKey];
  const pm = new Map<number, JevFragment>();
  for (const m of item.marks) if (m.no !== item.key) pm.set(m.no, pmDecoy(item.numbered, m.no, m.shown));
  return { mp, pm, d7: validityClsEx(fixedSentence, shownSentence), shownSentence, fixedSentence };
}

// ── 질의기(라이브 / 테스트 대역) ──────────────────────────────────────────────────────────

export interface MpProbs {
  fixed: number;
  shown: number;
  both: number;
  neither: number;
}

export interface D10Asker {
  mp(): Promise<{ probs: MpProbs; costUsd: number }>;
  pm(nos: number[]): Promise<{ pErr: Record<number, number>; costUsd: number }>;
  d7(): Promise<{ pBroke: number; costUsd: number }>;
}

type Q = Record<string, JevQuestion>;

export function liveD10Asker(item: D10Item, fr: D10Fragments, phase: string): D10Asker {
  const note = (k: string) => `d10-${k} ${item.answerLabel}`;
  return {
    async mp() {
      const r = await askJev(fr.mp.state, fr.mp.questions as Q, { phase, note: note("mp") });
      const a = r.answers.mp_choice;
      const p = a?.type === "choice" ? a.probabilities : {};
      const probs = { fixed: p[fr.mp.meta.fixedKey] ?? 0, shown: p[fr.mp.meta.shownKey] ?? 0, both: p.both ?? 0, neither: p.neither ?? 0 };
      return { probs, costUsd: r.costUsd };
    },
    async pm(nos) {
      const frag = combineFragments(nos.map((no) => ({ prefix: "", fragment: fr.pm.get(no) as JevFragment })));
      const r = await askJev(frag.state, frag.questions, { phase, note: note(`pm${nos.join("")}`) });
      const pErr: Record<number, number> = {};
      for (const no of nos) {
        const a = r.answers[`terr${no - 1}`];
        if (!a || a.type !== "noul") throw new Error(`jev 응답 형식 이상: terr${no - 1}`);
        pErr[no] = readNoul(a);
      }
      return { pErr, costUsd: r.costUsd };
    },
    async d7() {
      const r = await askJev(fr.d7.state, fr.d7.questions, { phase, note: note("d7") });
      const a = r.answers.C_cls_ex;
      if (!a || a.type !== "choice") throw new Error("jev 응답 형식 이상: C_cls_ex");
      return { pBroke: readValidity(a), costUsd: r.costUsd };
    },
  };
}

// ── 판정(순수) ───────────────────────────────────────────────────────────────────────────

export interface D10Features {
  mp: MpProbs;
  decoys: { label: string; no: number; shown: string; pError: number }[];
  pBroke: number;
}

type Status = "pass" | "fail" | "band";
function status(v: number, t: number, dir: "ge" | "le", band: number): Status {
  if (Math.abs(v - t) < band) return "band";
  return (dir === "ge" ? v >= t : v <= t) ? "pass" : "fail";
}

const PRONOUNS = new Set(
  "it its itself they them their theirs themselves he him his himself she her hers herself we us our ours ourselves you your yours yourself yourselves me my mine myself one ones oneself those these".split(" "),
);
const PRO_VERB = new Set(["do", "does", "did"]);
const AUX = new Set(["do", "does", "did", "is", "are", "was", "were", "am", "be", "has", "have", "had"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);

/** 대명사·대동사 쌍인가(D7 면제 후보) — **바뀐 토큰만**(공통 앞뒤 제거) 보고: 한쪽에 인칭·재귀·지시 대명사,
 *  또는 do/does/did ↔ 조동사·be·have 교체. ("your partner making"→"…makes" 처럼 구 밑줄 속 대명사는 무시) */
export function isProFormPair(shown: string, fix: string): boolean {
  let a = words(shown);
  let b = words(fix);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  a = a.slice(i, a.length - j);
  b = b.slice(i, b.length - j);
  if ([...a, ...b].some((w) => PRONOUNS.has(w))) return true;
  const swap = (x: string[], y: string[]) => x.some((w) => PRO_VERB.has(w)) && y.length > 0 && y.every((w) => AUX.has(w));
  return swap(a, b) || swap(b, a);
}

export interface D10Judgement {
  pass: boolean;
  failed: { mp: boolean; pm: string[]; d7: boolean };
  d7Exempt: boolean;
  reason: string;
}

const f2 = (x: number) => x.toFixed(2);

export function judgeD10Combined(item: Pick<D10Item, "answerLabel" | "shown" | "fix">, f: D10Features, p: D10Params): D10Judgement {
  const d7Exempt = p.d7ExemptProForm && isProFormPair(item.shown, item.fix);
  const mpFail = f.mp.fixed < p.minFixed;
  const pmFail = f.decoys.filter((d) => d.pError > p.maxDecoyErr);
  const d7Fail = !d7Exempt && p.tau > 0 && f.pBroke < p.tau;
  const pass = !mpFail && pmFail.length === 0 && !d7Fail;
  const ansTag = `정답 ${item.answerLabel}「${item.shown}」`;
  const topDecoy = f.decoys.reduce<D10Features["decoys"][number] | null>((m, d) => (!m || d.pError > m.pError ? d : m), null);
  let reason: string;
  if (pass) {
    reason =
      `jev 검증 통과: 고친 쪽만 옳음 ${f2(f.mp.fixed)}≥${f2(p.minFixed)}` +
      (topDecoy ? ` · 미끼 최대 P(오류) ${topDecoy.label} ${f2(topDecoy.pError)}≤${f2(p.maxDecoyErr)}` : "") +
      ` · 오형 비문 확률 ${f2(f.pBroke)}${d7Exempt ? "(대명사·대동사 면제)" : p.tau > 0 ? `≥${f2(p.tau)}` : ""}`;
  } else {
    const parts: string[] = [];
    if (mpFail) {
      parts.push(`${ansTag}이 오류로 확정되지 않음(원형「${item.fix}」과 비교해 고친 쪽만 옳을 확률 ${f2(f.mp.fixed)} < ${f2(p.minFixed)})`);
    }
    for (const d of pmFail) {
      parts.push(`미끼 ${d.label}「${d.shown}」도 어법 오류로 판정(P(오류) ${f2(d.pError)} > ${f2(p.maxDecoyErr)}) — 복수 정답 위험`);
    }
    if (d7Fail) {
      parts.push(`${ansTag} 오형이 다른 해석으로 문법적일 수 있음(비문 확률 ${f2(f.pBroke)} < ${f2(p.tau)})`);
    }
    reason = `${JEV_VERIFY_ISSUE_PREFIX}${parts.join(" · ")}`;
  }
  return { pass, failed: { mp: mpFail, pm: pmFail.map((d) => d.label), d7: d7Fail }, d7Exempt, reason };
}

// ── 실행(1라운드 병렬 → 밴드 재질의 → 판정) ─────────────────────────────────────────────

export interface D10Run {
  features: D10Features;
  /** 1라운드 원값(재질의 전). */
  first: D10Features;
  asks: { mp: number; pm: number; d7: number };
  jevCalls: number;
  costUsd: number;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export async function runD10(item: D10Item, p: D10Params, ask: D10Asker): Promise<D10Run> {
  const decoyMarks = item.marks.filter((m) => m.no !== item.key);
  const decoyNos = decoyMarks.map((m) => m.no);
  const [mp0, pm0, d70] = await Promise.all([ask.mp(), ask.pm(decoyNos), ask.d7()]);
  let cost = mp0.costUsd + pm0.costUsd + d70.costUsd;
  let calls = 3;
  const mpVals = [mp0.probs];
  const pmVals = new Map<number, number[]>(decoyNos.map((no) => [no, [pm0.pErr[no]]]));
  const d7Vals = [d70.pBroke];

  const d7Gated = p.tau > 0 && !(p.d7ExemptProForm && isProFormPair(item.shown, item.fix));
  const sMp = status(mp0.probs.fixed, p.minFixed, "ge", p.band);
  const sPm = decoyNos.map((no) => ({ no, s: status(pm0.pErr[no], p.maxDecoyErr, "le", p.band) }));
  const sD7: Status = d7Gated ? status(d70.pBroke, p.tau, "ge", p.band) : "pass";
  const clearFail = sMp === "fail" || sPm.some((x) => x.s === "fail") || sD7 === "fail";
  const bandPm = sPm.filter((x) => x.s === "band").map((x) => x.no);
  if (!clearFail && p.reask > 0 && (sMp === "band" || bandPm.length > 0 || sD7 === "band")) {
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < p.reask; i++) {
      if (sMp === "band") jobs.push(ask.mp().then((r) => void (mpVals.push(r.probs), (cost += r.costUsd), calls++)));
      if (bandPm.length) {
        jobs.push(
          ask.pm(bandPm).then((r) => {
            for (const no of bandPm) pmVals.get(no)?.push(r.pErr[no]);
            cost += r.costUsd;
            calls++;
          }),
        );
      }
      if (sD7 === "band") jobs.push(ask.d7().then((r) => void (d7Vals.push(r.pBroke), (cost += r.costUsd), calls++)));
    }
    await Promise.all(jobs);
  }
  const decoysOf = (pick: (no: number) => number) =>
    decoyMarks.map((m) => ({ label: m.label, no: m.no, shown: m.shown, pError: pick(m.no) }));
  const features: D10Features = {
    mp: {
      fixed: mean(mpVals.map((x) => x.fixed)),
      shown: mean(mpVals.map((x) => x.shown)),
      both: mean(mpVals.map((x) => x.both)),
      neither: mean(mpVals.map((x) => x.neither)),
    },
    decoys: decoysOf((no) => mean(pmVals.get(no) ?? [0])),
    pBroke: mean(d7Vals),
  };
  const first: D10Features = { mp: mp0.probs, decoys: decoysOf((no) => pm0.pErr[no]), pBroke: d70.pBroke };
  const pmAsks = Math.max(...[...pmVals.values()].map((v) => v.length));
  return { features, first, asks: { mp: mpVals.length, pm: pmAsks, d7: d7Vals.length }, jevCalls: calls, costUsd: cost };
}

// ── 공개 진입점 ───────────────────────────────────────────────────────────────────────────

export interface D10Detail {
  params: D10Params;
  item: Pick<D10Item, "key" | "answerLabel" | "shown" | "fix" | "itemId">;
  shownSentence: string;
  fixedSentence: string;
  run: D10Run;
  judgement: D10Judgement;
}

/** 선별기(jev-select) 등 pBroke·미끼 수치가 필요한 호출부용 — VerifyResult + 원수치. */
export async function jevVerifyDetailed(
  q: MdGrammarQuestion,
  _passage: string,
  params: Record<string, unknown> | undefined,
  phase: string,
  asker?: D10Asker,
): Promise<{ result: VerifyResult; detail: D10Detail }> {
  const t0 = Date.now();
  const p = d10Params(params);
  const item = d10ItemFromQuestion(q, p.itemId);
  const fr = buildD10Fragments(item);
  const run = await runD10(item, p, asker ?? liveD10Asker(item, fr, phase));
  const judgement = judgeD10Combined(item, run.features, p);
  const pErrByLabel = new Map(run.features.decoys.map((d) => [d.label, d.pError]));
  const perMark = item.marks.map((m) => ({
    label: m.label,
    shown: m.shown,
    pGrammatical: m.no === item.key ? run.features.mp.shown + run.features.mp.both : 1 - (pErrByLabel.get(m.label) ?? 0),
  }));
  const result: VerifyResult = {
    verifierId: "jev-d10",
    pass: judgement.pass,
    perMark,
    answerLabel: item.answerLabel,
    reason: judgement.reason,
    ms: Date.now() - t0,
    jevCostUsd: run.costUsd,
  };
  const { key, answerLabel, shown, fix, itemId } = item;
  return {
    result,
    detail: { params: p, item: { key, answerLabel, shown, fix, itemId }, shownSentence: fr.shownSentence, fixedSentence: fr.fixedSentence, run, judgement },
  };
}

export async function jevVerify(
  q: MdGrammarQuestion,
  passage: string,
  params: Record<string, unknown> | undefined,
  phase: string,
): Promise<VerifyResult> {
  return (await jevVerifyDetailed(q, passage, params, phase)).result;
}

// ── 구 규칙(LAB-SPEC §5 초기값 — 판정에 쓰지 않음, scripts/_tmp-qgenlab-imp3-selftest.ts 호환) ────────

export function jevNoulInstruction(circled: string, shown: string): string {
  return `In \`passage\`, the expression marked ${circled} ("${shown}") is grammatically correct in its sentence as written.`;
}

/** 구 규칙: 정답값 = min AND ≤ maxAnswerP AND (다른 밑줄 최저 − 정답값) ≥ minMargin. */
export function judgeD10(
  perMark: VerifyResult["perMark"],
  answerLabel: string,
  params: Record<string, unknown> | undefined,
): { pass: boolean; reason: string; margin: number } {
  const ans = perMark.find((x) => x.label === answerLabel);
  const others = perMark.filter((x) => x.label !== answerLabel);
  if (!ans || others.length === 0) return { pass: false, reason: `정답 라벨 ${answerLabel} 판정 불가`, margin: Number.NaN };
  const maxAnswerP = num01(params?.maxAnswerP, 1.0);
  const minMargin = typeof params?.minMargin === "number" ? params.minMargin : 0;
  const lo = others.reduce((a, b) => (b.pGrammatical < a.pGrammatical ? b : a));
  const margin = lo.pGrammatical - ans.pGrammatical;
  const pass = ans.pGrammatical <= lo.pGrammatical && ans.pGrammatical <= maxAnswerP && margin >= minMargin;
  const reason = `정답 ${ans.label} P옳음 ${f2(ans.pGrammatical)} · 차점 ${lo.label} ${f2(lo.pGrammatical)} · 차 ${f2(margin)}`;
  return { pass, reason, margin };
}
