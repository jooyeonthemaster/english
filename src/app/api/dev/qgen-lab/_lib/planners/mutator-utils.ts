// qgen-lab 오형 생성기 형태론 — calib/d5d6-distance-temptation/mutate.mjs 의 활용 규칙(IRR·ing/pp/s3·어간 복원·형부 전환) 이식·보강.
// 비단어 방지: mutate.mjs 는 passages.json 전체 어휘로 확인했지만 런타임에 코퍼스를 읽지 않으므로
// lexicon.json(동사 원형 2,062·형용사 774 — 활용형이 코퍼스에 실재하는 어간만) + 불규칙표로 어간을 확인한다.
// 보강분(원본에 없음): 자음 중복(stop→stopping), ie→ying, -eed/-ing 로 끝나는 원형(need·bring — 어휘집 구축 규칙상 누락),
// 과거형 불규칙 역표(took→take), 짧은 어휘집 잡음(us·the·com 등) 제외.
import { LEX_ADJ, LEX_VERB } from "./candidates";

/** 원형 → 과거분사(불규칙). mutate.mjs IRR + 보강. */
export const IRR_PP: Record<string, string> = {
  make: "made", take: "taken", give: "given", find: "found", see: "seen", know: "known", show: "shown", write: "written",
  bring: "brought", think: "thought", keep: "kept", leave: "left", build: "built", hold: "held", tell: "told", get: "gotten",
  feel: "felt", grow: "grown", choose: "chosen", begin: "begun", drive: "driven", speak: "spoken", break: "broken",
  forget: "forgotten", hide: "hidden", lead: "led", lose: "lost", pay: "paid", say: "said", sell: "sold", send: "sent",
  spend: "spent", stand: "stood", teach: "taught", understand: "understood", win: "won", buy: "bought", catch: "caught",
  seek: "sought", feed: "fed", meet: "met", draw: "drawn", fall: "fallen", eat: "eaten", wear: "worn", throw: "thrown",
  bear: "born", rise: "risen", shake: "shaken", steal: "stolen", fly: "flown", sing: "sung", swim: "swum", ride: "ridden",
  lay: "laid", lie: "lain", bind: "bound", hang: "hung", strike: "struck", become: "become", come: "come", run: "run",
  put: "put", set: "set", cut: "cut", let: "let", read: "read", spread: "spread", cost: "cost", hit: "hit", overcome: "overcome",
  go: "gone", do: "done", have: "had", be: "been", mean: "meant", hear: "heard", sit: "sat", sleep: "slept", fight: "fought",
  lend: "lent", flee: "fled", dig: "dug", stick: "stuck", shoot: "shot", bite: "bitten", forgive: "forgiven", freeze: "frozen",
  undertake: "undertaken", withdraw: "withdrawn", overtake: "overtaken", undergo: "undergone", foresee: "foreseen",
  misunderstand: "misunderstood", tear: "torn", swear: "sworn", sweep: "swept", weep: "wept", wake: "woken", arise: "arisen",
};

/** 과거·과거분사(불규칙) → 원형. */
export const IRR_BASE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(IRR_PP).map(([b, p]) => [p, b])),
  took: "take", gave: "give", came: "come", became: "become", went: "go", saw: "see", knew: "know", grew: "grow",
  drew: "draw", threw: "throw", flew: "fly", wrote: "write", rode: "ride", rose: "rise", drove: "drive", spoke: "speak",
  broke: "break", chose: "choose", froze: "freeze", stole: "steal", forgot: "forget", began: "begin", ran: "run",
  sang: "sing", swam: "swim", drank: "drink", ate: "eat", fell: "fall", shook: "shake", wore: "wear", tore: "tear",
  bore: "bear", hid: "hide", bit: "bite", forgave: "forgive", undertook: "undertake", withdrew: "withdraw",
  overcame: "overcome", overtook: "overtake", underwent: "undergo", foresaw: "foresee", woke: "wake", arose: "arise",
  lay: "lie", did: "do", had: "have", was: "be", were: "be",
};
// "found"(설립하다)·"left"(형용사) 같은 동형은 불규칙 해석을 우선한다(기출 빈도).
IRR_BASE.found = "find";
IRR_BASE.born = "bear";

/** 어휘집 구축 규칙(-ing/-ed 로 끝나는 원형 제외)으로 빠진 동사 원형. */
const VERB_EXTRA = new Set([
  "need", "feed", "proceed", "succeed", "exceed", "bleed", "breed", "speed", "heed", "embed", "shed", "seed",
  "bring", "sing", "ring", "spring", "string", "swing", "sting", "cling", "fling", "wring",
]);
/** 어휘집의 짧은 잡음(코퍼스 유도 부산물) — 어간으로 채택하지 않는다. */
const STEM_NOISE = new Set("br de fe ge le ly pi re se st th vi bak bas com los nam pac sid tim lin the but not out own she we me us to fee doe".split(" "));
const SHORT_VERBS = new Set(["be", "do", "go", "see"]);
/** 2음절 이상인데 끝 자음을 겹치는 원형. */
const DOUBLE_FINAL = new Set("begin occur prefer refer admit commit control permit regret forget submit omit equip transfer upset compel expel propel rebel excel patrol deter incur recur confer infer defer".split(" "));

export function isVerbBase(b: string): boolean {
  if (!b || STEM_NOISE.has(b)) return false;
  if (VERB_EXTRA.has(b) || IRR_PP[b] || SHORT_VERBS.has(b)) return true;
  return b.length >= 3 && LEX_VERB.has(b);
}

const vowelGroups = (w: string) => (w.match(/[aeiou]+/g) || []).length;

/** 끝 자음 중복 여부(stop→stopping, plan→planned; visit·open 은 아님). */
export function doublesFinal(b: string): boolean {
  if (DOUBLE_FINAL.has(b)) return true;
  return vowelGroups(b) === 1 && /(^|[^aeiou])[aeiou][bdgklmnprtv]$/.test(b);
}

export function ingOf(b: string, forceDouble = false): string {
  if (b === "be") return "being";
  if (b.endsWith("ie")) return b.slice(0, -2) + "ying";
  if (/(ee|ye|oe)$/.test(b)) return b + "ing";
  if (b.endsWith("e") && b.length > 2) return b.slice(0, -1) + "ing";
  if (forceDouble || doublesFinal(b)) return b + b.slice(-1) + "ing";
  return b + "ing";
}

export function ppOf(b: string, forceDouble = false): string {
  if (IRR_PP[b]) return IRR_PP[b];
  if (b.endsWith("e")) return b + "d";
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + "ied";
  if (forceDouble || doublesFinal(b)) return b + b.slice(-1) + "ed";
  return b + "ed";
}

export function s3Of(b: string): string {
  const special: Record<string, string> = { have: "has", be: "is", do: "does", go: "goes" };
  if (special[b]) return special[b];
  if (/(s|sh|ch|x|z|o)$/.test(b)) return b + "es";
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + "ies";
  return b + "s";
}

/** -ing 형 → 원형(어휘집으로 확인). doubled = 원형이 자음 중복 활용을 하는가. */
export function baseOfIng(w: string): { base: string; doubled: boolean } | null {
  if (!w.endsWith("ing") || w.length < 5) return null;
  const s = w.slice(0, -3);
  const cands: { base: string; doubled: boolean }[] = [];
  if (w.endsWith("ying") && s.length <= 2) cands.push({ base: s.slice(0, -1) + "ie", doubled: false });
  if (/([b-df-hj-np-tv-z])\1$/.test(s)) cands.push({ base: s.slice(0, -1), doubled: true });
  if (doublesFinal(s)) cands.push({ base: s + "e", doubled: false }, { base: s, doubled: false });
  else cands.push({ base: s, doubled: false }, { base: s + "e", doubled: false });
  return cands.find((c) => isVerbBase(c.base)) ?? null;
}

/** -ed/불규칙 과거·과거분사 → 원형. */
export function baseOfEd(w: string): { base: string; doubled: boolean } | null {
  if (IRR_BASE[w]) return { base: IRR_BASE[w], doubled: false };
  if (!w.endsWith("ed") || w.length < 4) return null;
  const s = w.slice(0, -2);
  const cands: { base: string; doubled: boolean }[] = [];
  if (w.endsWith("ied")) cands.push({ base: w.slice(0, -3) + "y", doubled: false });
  cands.push({ base: w.slice(0, -1), doubled: false }, { base: s, doubled: false });
  if (/([b-df-hj-np-tv-z])\1$/.test(s)) cands.push({ base: s.slice(0, -1), doubled: true });
  return cands.find((c) => isVerbBase(c.base)) ?? null;
}

/** 3인칭 -s 형 → 원형. */
export function baseOfS(w: string): string | null {
  if (!w.endsWith("s") || w.length < 3 || w.endsWith("ss")) return null;
  const cands = [w.slice(0, -1)];
  if (w.endsWith("es")) cands.push(w.slice(0, -2));
  if (w.endsWith("ies")) cands.push(w.slice(0, -3) + "y");
  return cands.find(isVerbBase) ?? null;
}

const ADJ_SUFFIX = /(ible|able|ful|ous|ive|less|ical|ary|al|ent|ant|ic|ish|ate|ile)$/;
const ADV_SPECIAL: Record<string, string> = { true: "truly", due: "duly", whole: "wholly", full: "fully", public: "publicly", good: "well", shy: "shyly", sly: "slyly", dry: "dryly" };
const ADJ_SPECIAL: Record<string, string> = Object.fromEntries(Object.entries(ADV_SPECIAL).map(([a, d]) => [d, a]));

/** 형용사 → 부사(-ly). 어휘집 형용사(=-ly 형이 코퍼스에 실재) 또는 형용사 접미사만. */
export function advOf(a: string): string | null {
  if (ADV_SPECIAL[a]) return ADV_SPECIAL[a];
  if (a.endsWith("ly") || a.length < 3) return null;
  if (!LEX_ADJ.has(a) && !ADJ_SUFFIX.test(a)) return null;
  if (/[^aeiou]y$/.test(a)) return a.slice(0, -1) + "ily";
  if (a.endsWith("le")) return a.slice(0, -1) + "y";
  if (a.endsWith("ic")) return a + "ally";
  if (a.endsWith("ll")) return a + "y";
  if (a.endsWith("ue")) return a.slice(0, -1) + "y";
  return a + "ly";
}

/** 부사(-ly) → 형용사. 후보 어간 중 어휘집 형용사 → 형용사 접미사 순으로 채택. */
export function adjOf(d: string): string | null {
  if (ADJ_SPECIAL[d]) return ADJ_SPECIAL[d];
  if (!d.endsWith("ly") || d.length < 5) return null;
  const c: string[] = [];
  if (d.endsWith("ily")) c.push(d.slice(0, -3) + "y");
  if (d.endsWith("ably") || d.endsWith("ibly")) c.push(d.slice(0, -1) + "e");
  if (d.endsWith("ically")) c.push(d.slice(0, -2), d.slice(0, -4));
  if (d.endsWith("lly")) c.push(d.slice(0, -2), d.slice(0, -1));
  if (/[bdgkpt]ly$/.test(d)) c.push(d.slice(0, -1) + "e");
  c.push(d.slice(0, -2));
  return c.find((x) => LEX_ADJ.has(x)) ?? c.find((x) => x.length >= 3 && ADJ_SUFFIX.test(x)) ?? null;
}

/** 첫 글자 대문자 보존. */
export function matchCase(src: string, out: string): string {
  const f = src[0];
  return f && f === f.toUpperCase() && f !== f.toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out;
}
