// 구제 린트 공용 어휘·형태 판정(코드 전용, LLM 0콜) — LAB/rescue/replay/lib/lex.mjs 의 축자 TS 이식.
// 어휘 원천은 planners/lexicon.json(calib/site-planner/lexicon.json 과 바이트 동일 사본)이다.
// 규칙·집합을 바꾸지 마라 — T1·R-lint 정밀도(replay out/lint-eval.json)가 이 정의로 측정됐다.
import LEXICON from "../planners/lexicon.json";

export const LEX_VERB: ReadonlySet<string> = new Set(LEXICON.verb);
export const LEX_ADJ: ReadonlySet<string> = new Set(LEXICON.adj);

const set = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));
export const BE = set("am is are was were be been being 's 're 'm");
export const HAVE = set("have has had having 've");
export const DO = set("do does did");
export const MODAL = set("can could will would shall should may might must cannot");
export const REL = set("which that what who whom whose where when whether if how why whatever whichever whoever wherever whenever");
export const REL_PRON = set("which that who whom whose");
export const PERS_SUBJ = set("it he she they we i you");
export const PRON = set(
  "it its itself they them their theirs themselves those this these one ones he him his himself she her herself we us our ourselves you your yourself yourselves me my myself i",
);
export const DET = set("the a an this these those my his her its our their your some many few several all both each every no any such another other either neither much");
export const ARTICLE = set("a an the");
export const PREP = set(
  "of in on at by for with from into onto about over under between among through without within across against toward towards upon behind beyond around along despite besides via like during throughout per than unlike",
);
export const SUBORD = set("because although though while when whenever if unless until since as whereas once before after whether so");
export const COORD = set("and or but nor yet");
export const CONNECTIVE = set(
  "however therefore moreover furthermore accordingly consequently thus hence instead meanwhile nevertheless nonetheless including besides also even still just only very too often always never already soon then rather indeed otherwise",
);
export const SKIP_ADV = set("not never also still only even just always often really already usually rarely seldom sometimes simply merely actually further");
export const ADV_OK = set("so too very well here now then almost quite perhaps again together away back ever once rather somewhat nearly");
export const BOTH_OK = set("begin begins began begun beginning start starts started starting continue continues continued continuing like likes liked love loves loved hate hates hated prefer prefers preferred");
export const TO_PREP_HEADS: readonly (readonly string[])[] = [
  ["look", "forward"], ["contribute"], ["contributes"], ["contributed"], ["contributing"], ["object"], ["devoted"], ["committed"], ["key"],
  ["respond"], ["responds"], ["lead"], ["leads"], ["led"], ["due"], ["addition"], ["comes"], ["opposed"], ["used"], ["accustomed"], ["according"], ["similar"], ["related"], ["access"], ["attention"], ["exposure"], ["subject"], ["resistance"], ["adapt"], ["adjust"], ["compared"], ["prior"], ["thanks"],
];
export const PL_NOUN = set("people children men women data media criteria phenomena police cattle feet teeth mice geese");
export const SG_S_NOUN = set("news physics economics mathematics politics ethics series species means process access analysis basis crisis thesis emphasis hypothesis bus gas lens this is was has does as us its whereas always perhaps");
export const PL_PRON = set("they we these those them ones both many few several others");
export const SG_PRON = set("it he she this that one everything everyone everybody something someone somebody nothing nobody anything anyone each either neither another itself himself herself");
export const IRREG_PP = set(
  "born beaten become begun bent bound bitten bled blown broken bred brought built burnt bought caught chosen come clung cost crept cut dealt dug done drawn dreamt drunk driven eaten fallen fed felt fought found fled flung flown forbidden forgotten forgiven frozen got gotten given gone ground grown hung had heard hidden hit held hurt kept knelt known laid led leant leapt learnt left lent let lain lit lost made meant met paid put quit read ridden rung risen run said seen sought sold sent set shaken shed shone shot shown shrunk shut sung sunk sat slept slid slung spoken sped spent spun spread sprung stood stolen stuck stung stunk struck strung sworn swept swum swung taken taught torn told thought thrown thrust trodden understood undertaken woken worn woven wept won wound withdrawn written overcome overtaken undergone foreseen misunderstood proven",
);
export const IRREG_PAST = set("arose awoke bore beat became began bent bit bled blew broke bred brought built bought caught chose came crept dealt dug did drew drank drove ate fell fed felt fought found fled flew forgot forgave froze got gave went grew hung heard hid held kept knew laid led left lent lay lit lost made meant met paid rode rang rose ran said saw sought sold sent shook shone shot showed shrank sang sank sat slept slid spoke sped spent spun sprang stood stole stuck struck swore swept swam swung took taught tore told thought threw understood undertook woke wore wove wept won wound withdrew wrote overcame overtook underwent foresaw");
// 형태 동사로 오인되기 쉬운 비동사(-ing/-ed/-s 모양)
export const NOT_ING = set("thing things something nothing anything everything during morning evening king ring spring string ceiling bring sing swing sting wing cling fling sling nothing according including");
export const NOT_ED = set("need needs seed feed speed indeed bed red hundred shed breed deed weed creed proceed exceed succeed bleed heed embed");
const BASE_EXTRA = set(
  "be have do go make take give get come see know think find say keep let put run set show tell feel leave bring begin seem help turn start hold stand hear play move live believe happen provide sit lose pay meet include continue learn change lead understand watch follow stop create speak read spend grow open walk win offer remember love consider appear buy wait serve die send expect build stay fall cut reach kill remain suggest raise pass sell require report decide pull need",
);

export const clean = (w: unknown): string => String(w ?? "").replace(/[’ʼ]/g, "'").replace(/[^A-Za-z'-]/g, "").toLowerCase();
export const isIng = (w: string): boolean => /ing$/.test(w) && w.length > 4 && !NOT_ING.has(w);
export const isPP = (w: string): boolean => IRREG_PP.has(w) || (/(ed)$/.test(w) && w.length >= 4 && !NOT_ED.has(w));
export const isEdForm = (w: string): boolean =>
  (/ed$/.test(w) && w.length >= 4 && !NOT_ED.has(w)) || IRREG_PP.has(w) || IRREG_PAST.has(w);

/** -s 동사의 원형(어휘집 확인) 또는 null. */
export function baseOfS(w: string): string | null {
  if (!w.endsWith("s") || w.length < 3 || w.endsWith("ss") || SG_S_NOUN.has(w)) return null;
  const c = [w.slice(0, -1)];
  if (w.endsWith("es")) c.push(w.slice(0, -2));
  if (w.endsWith("ies")) c.push(w.slice(0, -3) + "y");
  return c.find((x) => LEX_VERB.has(x)) || null;
}
export const isBaseVerb = (w: string): boolean => LEX_VERB.has(w) || BASE_EXTRA.has(w);
export const adjShaped = (w: string): boolean => LEX_ADJ.has(w) || /(ive|ous|able|ible|al|ful|less|ic|ical|ent|ant|ary)$/.test(w);

export type Num = "sg" | "pl";

/** 정동사 형태의 수: 'sg' | 'pl' | null(과거형 등 수 표지 없음). base = 현재 복수형 원형. */
export function verbNumber(w: string): Num | null {
  if (["is", "was", "has", "does", "'s"].includes(w)) return "sg";
  if (["are", "were", "have", "do", "'re", "'ve"].includes(w)) return "pl";
  if (baseOfS(w)) return "sg";
  if (isBaseVerb(w) && !isIng(w) && !(/ed$/.test(w) && !NOT_ED.has(w))) return "pl";
  return null;
}
/** 명사(구 머리)·대명사의 수 추정: 'sg' | 'pl' | null. */
export function nounNumber(w: string | null | undefined): Num | null {
  if (!w) return null;
  if (PL_PRON.has(w) || PL_NOUN.has(w)) return "pl";
  if (SG_PRON.has(w) || SG_S_NOUN.has(w)) return "sg";
  if (/['’]s$/.test(w)) return null; // 소유격
  if (/(ss|us|is)$/.test(w)) return "sg";
  if (/s$/.test(w) && w.length > 3) return "pl";
  return "sg";
}
/** 오형/고침 쌍 공통 lemma 수 토글(-s/-es/-ies) 여부. */
export function isSToggle(a: string, b: string): boolean {
  if (a === b) return false;
  const [x, y] = a.length < b.length ? [a, b] : [b, a];
  return y === x + "s" || y === x + "es" || (x.endsWith("y") && y === x.slice(0, -1) + "ies");
}
