// qgen-lab 미끼 코드 유혹도 사전 + 킬러 게이트 사전 필터(계획 단계에서 게이트가 반려할 자리를 미리 뺀다).
// 유혹도 사전: calib/d5d6-distance-temptation(SUMMARY D6 RULE) — 미끼 코드별 평균 유혹도 라벨(0=low, 2=high).
// 게이트 재사용 방식(보고): **프로덕션 게이트 모듈을 import 해 최소 MdGrammarQuestion 을 만들어 호출한다**(포팅 0).
//   · 죽은 미끼(gate-grammar-killer-decoys) — 판정 함수가 비공개이고 「죽은 미끼 ≥2」일 때만 메시지를 내므로,
//     후보 9개를 [[A..I]] 로 표시하고 확실히 죽은 파수꾼 [[J:…]](관사 바로 뒤)를 지문 끝 별도 문장으로 붙여
//     후보 하나라도 죽으면 발화하게 만든 뒤 메시지에서 라벨별 사유를 읽는다(판정은 토큰·거리만 보므로 묶음과 무관).
//   · 첫 밑줄 정답(gate-grammar-killer-answer-site)·과훈련 정답(gate-grammar-killer-overdrilled)·미끼 깊이
//     (gate-grammar-killer-decoy-depth inspectDecoyDepth) — 같은 방식. env 킬스위치도 프로덕션과 같이 따른다.
//   · RECOGNITION_BAN(grammar-killer-v2.ts 프롬프트 산문) 은 코드 게이트가 없어 판별 가능한 항목만 규칙으로 옮겼다.
import { inspectDecoyDepth } from "@/lib/md-qgen/gate-grammar-killer-decoy-depth";
import { gateGrammarKillerDeadDecoys } from "@/lib/md-qgen/gate-grammar-killer-decoys";
import { gateGrammarKillerAnswerSite } from "@/lib/md-qgen/gate-grammar-killer-answer-site";
import { gateGrammarKillerOverdrilledAnswer } from "@/lib/md-qgen/gate-grammar-killer-overdrilled";
import type { MdGrammarMark, MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { LabDifficulty } from "@/lib/qgen-lab/types";
import { BE, DET, HAVE, LEX_ADJ, MODAL, PREP, PRON, type CoarseKind, type SiteCandidate } from "./candidates";
import { candidateContext } from "./mutator";
import { baseOfEd, baseOfS, IRR_BASE, isVerbBase } from "./mutator-utils";

// ── 유혹도 사전 ─────────────────────────────────────────────────────────────────────────

/** 미끼 코드 → 평균 유혹도 라벨(0..2). ρ 0.371 단독, tempt2 와 블렌드 시 out-of-fold ρ 0.494. */
export const DECOY_CODE_PRIOR: Readonly<Record<string, number>> = {
  d: 1.59, b: 1.48, c: 1.3, i: 1.27, h: 1.06, e: 1.05, f: 1.0, g: 0.91, l: 0.62, m: 0.62, k: 0.58, a: 0.57,
};
const PRIOR_MEAN = Object.values(DECOY_CODE_PRIOR).reduce((s, x) => s + x, 0) / Object.keys(DECOY_CODE_PRIOR).length;

/** 코드 → 유혹도(0..2). 모르는 코드는 사전 평균. */
export const decoyCodePrior = (code: string | null | undefined): number =>
  code && DECOY_CODE_PRIOR[code] !== undefined ? DECOY_CODE_PRIOR[code] : PRIOR_MEAN;

/** D4 전(코드 미확정) 후보 범주의 기본 코드 — 사전 조회용 근사(확정은 categoryPair). */
export const KIND_DEFAULT_CODE: Readonly<Record<CoarseKind, string>> = {
  rel: "b", "to-inf": "k", ing: "c", "ed/pp": "c", verb: "d", pron: "g", "adj/adv": "f", other: "m",
};
export function candidateDefaultCode(c: Pick<SiteCandidate, "kind" | "tags">): string {
  if (c.kind === "other" && c.tags.includes("conj")) return "l";
  return KIND_DEFAULT_CODE[c.kind];
}

// ── 최소 문항 구성(게이트 호출용) ─────────────────────────────────────────────────────────

type Site = Pick<SiteCandidate, "start" | "end" | "word">;
const LABELS = "ABCDEFGHIJ";
const SENTINEL = " The [[J:qqqq]] ."; // 관사 바로 뒤 → 죽은 미끼 확정(표면 'qqqq' 는 자기확증·깊이 신호와 무관)

/** 지문에 [[L:text]] 마커를 끼운다(겹치지 않는 자리, 시작 순). */
function markPassage(passage: string, marks: { site: Site; label: string; text: string }[]): string {
  const sorted = [...marks].sort((a, b) => a.site.start - b.site.start);
  let out = "";
  let last = 0;
  for (const m of sorted) {
    if (m.site.start < last) throw new Error("code-prior: 겹치는 자리");
    out += passage.slice(last, m.site.start) + `[[${m.label}:${m.text}]]`;
    last = m.site.end;
  }
  return out + passage.slice(last);
}

function minimalQuestion(markedPassage: string, marks: MdGrammarMark[], answer: string): MdGrammarQuestion {
  return { kind: "grammar", marks, markedPassage, answer, answers: [answer], fix: "", fixes: {}, explanation: "", wrong: [] };
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

// ── 미끼 사전 필터 ──────────────────────────────────────────────────────────────────────

/** 죽은 미끼 사유(프로덕션 gateGrammarKillerDeadDecoys — 관사 직후·30토큰 내 동일 표면·전치사+ing·be/조동사+ly+pp).
 *  반환: 후보 id → 사유 배열(빈 배열 = 산 자리). 게이트가 env 로 꺼져 있으면 전부 빈 배열. */
export function decoyDeadReasons(passage: string, cands: (Site & { id: string })[]): Map<string, string[]> {
  const out = new Map<string, string[]>(cands.map((c) => [c.id, []]));
  for (const group of chunks(cands, 9)) {
    const marks = group.map((c, i) => ({ site: c, label: LABELS[i], text: c.word }));
    const q = minimalQuestion(markPassage(passage, marks) + SENTINEL, [], "(Z)");
    const msg = gateGrammarKillerDeadDecoys(q)[0];
    if (!msg) continue;
    group.forEach((c, i) => {
      const L = LABELS[i];
      const re = new RegExp(`\\(${L}\\) '[^']*' — (.*?)(?= · \\([A-J]\\) '|\\. 이 자리들은)`);
      const m = re.exec(msg);
      if (m) out.set(c.id, m[1].split(" / "));
      else if (msg.includes(`(${L}) '`)) out.set(c.id, ["죽은 미끼(게이트 메시지 형식 미해석)"]);
    });
  }
  return out;
}

/** 미끼 판단 깊이(프로덕션 inspectDecoyDepth) — 후보 id → {deep, signals, formula}. KILLER 게이트의
 *  「넷 다 얕고 넷 다 공식 자리」 반려를 피하려면 인벤토리에 deep 이 하나 이상 있어야 한다. */
export function decoyDepth(
  passage: string,
  cands: (Site & { id: string })[],
): Map<string, { deep: boolean; signals: string[]; formula: string | null }> {
  const out = new Map<string, { deep: boolean; signals: string[]; formula: string | null }>();
  for (const group of chunks(cands, 9)) {
    const marks = group.map((c, i) => ({ site: c, label: LABELS[i], text: c.word }));
    const r = inspectDecoyDepth(minimalQuestion(markPassage(passage, marks) + SENTINEL, [], "(Z)"));
    if (!r) continue;
    group.forEach((c, i) => {
      const v = r.verdicts.find((x) => x.label === `(${LABELS[i]})`);
      if (v) out.set(c.id, { deep: v.deep, signals: v.signals, formula: v.formula });
    });
  }
  return out;
}

export interface Prefilter {
  ok: boolean;
  /** ok=false 의 근거(KILLER 에서만 제외 사유가 된다). */
  reasons: string[];
  /** 비차단 참고 신호. */
  flags: string[];
}

/** 미끼 후보 사전 필터 — KILLER 면 죽은 미끼 사유가 있으면 제외. 그 외 난이도는 기록만. */
export function decoyPrefilter(passage: string, c: Site & { id: string }, difficulty: LabDifficulty = "KILLER"): Prefilter {
  const reasons = decoyDeadReasons(passage, [c]).get(c.id) ?? [];
  return difficulty === "KILLER" ? { ok: reasons.length === 0, reasons, flags: [] } : { ok: true, reasons: [], flags: reasons };
}

// ── 정답 사전 필터 ──────────────────────────────────────────────────────────────────────

const CONJ_PREP_HEADS = new Set(["because", "although", "while", "though", "despite", "during", "unless", "whereas", "since"]);

// 과거형과 모양이 다른 불규칙 과거분사 — 정동사 과거로 읽힐 수 없어 뒤에 목적어가 붙으면 표면이 즉시 부서진다.
const DISTINCT_PP = new Set("taken given gone seen known grown drawn thrown flown written ridden risen driven spoken broken chosen frozen stolen forgotten begun sung swum eaten fallen shaken worn torn born hidden bitten forgiven undertaken withdrawn overtaken undergone foreseen woken arisen lain done been shown proven".split(" "));
const ADJ_LIKE = /(al|ic|ive|ous|ful|less|able|ible|ant|ent|ary|ly)$/;
const headOf = (s: string) => (s.trim().split(/\s+/)[0] ?? "").replace(/[^A-Za-z'-]/g, "").toLowerCase();
const isPastParticipleForm = (w: string) => /ed$/.test(w) || (!!IRR_BASE[w] && IRR_BASE[w] !== w);
const isFiniteLike = (w: string) =>
  BE.has(w) || HAVE.has(w) || (!!baseOfS(w) && !DET.has(w)) || (/ed$/.test(w) && !!baseOfEd(w)) || (!!IRR_BASE[w] && !MODAL.has(w));

/** RECOGNITION_BAN(grammar-killer-v2.ts:51) 중 코드로 판별 가능한 「보면 아는」 오형. 반환 = 걸린 항목 설명. */
export function recognitionBanFlags(passage: string, c: SiteCandidate, wrong: string): string[] {
  const out: string[] = [];
  const x = candidateContext(c);
  const prev = x.left[x.left.length - 1] ?? null;
  const w = wrong.trim().toLowerCase();
  const o = c.word.trim().toLowerCase();
  const wHead = w.split(/\s+/).pop() ?? "";
  const oHead = o.split(/\s+/).pop() ?? "";
  const before = c.marked_sentence.slice(0, Math.max(0, c.marked_sentence.indexOf("⟦"))).trimEnd();
  // ① 과거분사 뒤 전치사 없이 한정사+명사구("approached a local art form") — 과거 정동사로도 읽히는 규칙형 -ed 는
  //    로컬로 자연스러워 제외(평가원 2020_SN 'inhabited their' 가 그 형태), be 뒤이거나 과거분사 전용형만.
  const ppOnly = DISTINCT_PP.has(wHead) || (!!prev && BE.has(prev) && isPastParticipleForm(wHead));
  if (ppOnly && !isPastParticipleForm(oHead) && x.next && DET.has(x.next)) {
    out.push(`과거분사 오형 '${wrong}' 뒤에 한정사 '${x.next}' 가 바로 이어져 표면이 파탄(목적어 달린 수동)`);
  }
  // ② 선행사 명사 바로 뒤의 what("styles what were")
  if (w === "what" && prev && !before.endsWith(",") && !PREP.has(prev) && !BE.has(prev) && !HAVE.has(prev) &&
      !LEX_ADJ.has(prev) && !ADJ_LIKE.test(prev) && !DET.has(prev) && !PRON.has(prev) &&
      !MODAL.has(prev) && !isVerbBase(prev) && !baseOfS(prev) && !baseOfEd(prev) &&
      !["and", "or", "but", "is", "know", "about", "of", "on", "see", "ask", "wonder"].includes(prev)) {
    out.push(`선행사 '${prev}' 바로 뒤의 what — 선행사가 눈앞이라 즉시 갈린다`);
  }
  // ③ 콤마 뒤 원형·현재형 정동사가 분사 자리를 차지 + 앞 정동사가 3단어 안
  if (before.endsWith(",") && /(ing|ed)$/.test(oHead) && !/(ing|ed)$/.test(wHead) && (baseOfS(wHead) || isVerbBase(wHead))) {
    const near = x.left.slice(-3);
    if (near.some(isFiniteLike)) out.push(`콤마 뒤 정동사 '${wrong}' 가 분사 자리 — 앞 정동사가 3단어 안에 보여 즉답`);
  }
  // ④ 접속사↔전치사 교체를 지문 전반부에(첫 밑줄 금지는 answerSiteIfFirst 로 따로)
  if ((CONJ_PREP_HEADS.has(headOf(wrong)) || CONJ_PREP_HEADS.has(headOf(c.word))) && c.start < passage.length / 2) {
    out.push(`접속사↔전치사 교체 '${c.word}'→'${wrong}' 가 지문 전반부 — 단서가 밑줄 바로 옆`);
  }
  // ⑤ 조동사 바로 뒤 비원형(철자·비단어는 제안기가 애초에 내지 않는다)
  if (prev && MODAL.has(prev) && !isVerbBase(wHead)) out.push(`조동사 '${prev}' 바로 뒤 비원형 '${wrong}'`);
  // (보강) 전치사 바로 뒤 동명사 → 비동명사: KILLER_SITES 의 「즉답 자리」(grammar-killer-v2.ts KILLER_SITES 끝줄)
  if (prev && PREP.has(prev) && /ing$/.test(oHead) && !/ing$/.test(wHead)) out.push(`전치사 '${prev}' 바로 뒤 동명사 자리를 '${wrong}' 로 — 즉답 자리`);
  return out;
}

/** 이 (자리, 오형)이 첫 밑줄 정답이면 프로덕션 첫 자리 게이트가 반려하는가(접속사/전치사 계열 머리). */
export function answerSiteIfFirst(passage: string, c: Site, wrong: string): string | null {
  const marked = markPassage(passage, [{ site: c, label: "A", text: wrong }]) + " The [[B:qqqq]] .";
  return gateGrammarKillerAnswerSite(minimalQuestion(marked, [], "(A)"))[0] ?? null;
}

/** 프로덕션 과훈련 정답 게이트(D1 보고동사 관용·D4 one of·D7 사역 to↔원형 — env 모드 core/all 그대로). */
export function answerOverdrill(passage: string, c: Site, wrong: string): string[] {
  const marks: MdGrammarMark[] = [{ label: "(A)", original: c.word, shown: wrong, code: "" }];
  const marked = markPassage(passage, [{ site: c, label: "A", text: wrong }]);
  return gateGrammarKillerOverdrilledAnswer(minimalQuestion(marked, marks, "(A)"), { requestedDifficulty: "KILLER" });
}

/** 정답 (자리, 오형) 사전 필터. KILLER: 과훈련·RECOGNITION_BAN 걸리면 제외, 첫 밑줄 게이트는 플래그(배치 미정).
 *  그 외 난이도: 전부 플래그만(프로덕션 비킬러 레인은 이 게이트들을 돌리지 않는다). */
export function answerPrefilter(passage: string, c: SiteCandidate, wrong: string, difficulty: LabDifficulty = "KILLER"): Prefilter {
  const reasons = [...answerOverdrill(passage, c, wrong), ...recognitionBanFlags(passage, c, wrong)];
  const first = answerSiteIfFirst(passage, c, wrong);
  const flags = first ? ["첫 밑줄 금지(접속사/전치사 정답 — 배치 시 ① 피할 것)"] : [];
  return difficulty === "KILLER" ? { ok: reasons.length === 0, reasons, flags } : { ok: true, reasons: [], flags: [...reasons, ...flags] };
}
