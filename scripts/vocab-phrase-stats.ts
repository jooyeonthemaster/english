/**
 * 기출 단어 코퍼스 — 구·숙어 정량 모수 엔진 (LLM 0회)
 *
 * vocab-corpus-stats.ts 는 **단일 표층형**만 센다. 그래서 `give up` `for example`
 * `out of one's reach` 같은 다어절 표제어에는 추세 지표가 하나도 붙지 않았다
 * (실측: 5,221 표제어 중 1,514개 = 29% 가 미부착, 전부 구·숙어).
 * 이 스크립트가 그 구멍을 메운다. 산출 행 형상은 stats.json 과 **완전히 동일**하고
 * (`surface` 자리에 구가 들어간다), 추세 수식·창(EARLY/LATE)·라벨 임계값도 그대로 복제했다.
 * 그래야 vocab-corpus-build.ts 가 두 파일을 같은 코드로 결합할 수 있다.
 *
 *   npx tsx scripts/vocab-phrase-stats.ts --out=experiments/vocab-corpus-20260728/phrase-stats.json
 *   npx tsx scripts/vocab-phrase-stats.ts --phrase="give up"   # 구 하나 조회(매칭 실현형까지)
 *   npx tsx scripts/vocab-phrase-stats.ts --top=30             # 추세 급변 상위
 *   npx tsx scripts/vocab-phrase-stats.ts --zero=40            # 0회 구 목록(매칭 결함 점검용)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 왜 이런 매칭 규범인가 — **되돌리지 말 것**
 * ────────────────────────────────────────────────────────────────────────────
 * 표제어는 사전형이고 본문은 굴절형이다. 구를 문자열 그대로 찾으면 대부분 0회가 나온다.
 * 실제로 `lead to` 는 코퍼스에서 "led to / leads to / leading to" 로 나타나고 원형은 소수다.
 * 문자열 일치만 하면 "이 구는 안 쓰인다"는 **거짓 결론**이 나온다. 그래서:
 *
 *  (1) 머리 동사 굴절 확장 — 구의 첫 토큰이 동사면 -s/-es/-ed/-ing/불규칙형까지 함께 찾는다.
 *      동사 판정은 lemmas.json 자신의 pos=verb 표제어 + phrasal_verb 머리 + 내장 목록의 합집합
 *      으로 한다(외부 사전·LLM 없이 데이터에서 유도). 과생성(존재하지 않는 굴절형)은
 *      코퍼스에 없으면 그냥 매칭되지 않으므로 무해하다 — 반대로 과소생성은 곧바로 거짓 0회다.
 *  (2) one's / oneself 슬롯 — §3.5.7 이 정준화한 자리 표시자다. 소유격 대명사와 재귀대명사,
 *      그리고 명사 소유격(`child's` 처럼 `'s` 로 끝나는 토큰)까지 받는다.
 *      "out of one's reach" 의 실현형은 "out of their reach" 이지 원형이 아니다.
 *  (3) 자리표시자 슬롯 — `someone`/`doing`/`done`/`do`, 그리고 총칭 `one`. 사전 표기일 뿐 본문에
 *      그 글자가 나오지 않는다. 형태 제약(-ing형/과거분사/원형동사/대명사)을 걸어 복원한다.
 *      제약 없이 아무 토큰이나 받으면 "come to do" 가 "come to mind/terms/life" 까지 먹는다.
 *  (4) 관사 유연성 — 표제어에서 벗겨진 a/an/the 복원. **단, 3슬롯 이상의 중간 슬롯 앞에서만.**
 *      무제한 허용을 실측했더니 126회 중 90%가 오탐이었다: "in case"→"in the case",
 *      "not only"→"not the only", "in particular"→"in a particular", "take place"→"takes the place".
 *      무관사 관용구는 관사형과 최소대립쌍이라 관사 하나로 전혀 다른 구문이 된다.
 *      제한 후 전 코퍼스 3회만 발화한다("in the terms of", "on the top of that").
 *  (5) 분리 구동사 — "give it up" 처럼 목적어가 낀다. 오탐 위험이 커서 2단으로 나눴다.
 *      · 총계에 반영: 대명사 목적어·부사만("give it up", "focus more on", "rely heavily on"),
 *        3슬롯 이상이면 명사구까지("take these needs into account" — 뒤 슬롯들이 검증해 준다).
 *      · **총계 제외**: 2어 구동사의 어휘 명사구 분리("kick teenagers out"). 진짜 분리형이지만
 *        "take part in"→take in, "put pressure on"→put on 오탐과 형태가 같아 구별이 불가능하다.
 *        실측으로 `take in` 은 분리 매칭 67/87 이 오탐이었다. 그래서 looseSeparableHits 로만 남긴다.
 *      두 계수 모두 행에 노출되므로 언제든 감사·재편입할 수 있다.
 *  (6) 와일드카드 슬롯 — "so ... that", "as ... as", "not only a but also b" 처럼 표제어 자체가
 *      변수 자리를 가진 상관구문. `~` `...` 및 a/b 변수 표기를 1~6토큰 임의 구간으로 컴파일한다.
 *      "not only but also" 처럼 표기가 붙어 있는 상관구문에는 컴파일 단계에서 간극을 넣는다
 *      (코퍼스에 인접형은 0회, 이격형은 55회다). 이 행에는 hasWildcard=true 가 붙는다.
 *  (7) 하이픈 복합어 — 토크나이저가 하이픈을 자르므로 "long-term" 은 2토큰 구와 같다.
 *      굴절은 뒤 요소에 붙고("fine-tune"→"fine-tuned"), 붙여쓰기 실현형도 함께 찾는다
 *      ("passer-by" → 본문 "passersby" 4회).
 *  (8) be 슬롯의 형태 확장은 **사전형 `be`**, 또는 앞에 열린 슬롯(주어 자리)이 있는 굴절형에만
 *      적용한다. 앞이 전부 고정 어휘인 굴절형은 굳은 연결어다 — 위치 무관 확장을 했더니
 *      `that is`(=즉) 한 행이 관계절 "that are/was/were/being" 을 통째로 먹어 712회가 됐다
 *      (원문 대조: 관용구 실사용은 쉼표를 동반한 79회뿐). §BE_FORMS / §PARENTHETICAL_IDIOMS.
 *  (9) 부정 축약형 — 토크나이저는 "don't" 를 1토큰으로 유지하므로 `not` 슬롯이 축약 토큰을
 *      직접 받는다(곡선 아포스트로피의 "don"+"t" 분리형 포함). 토크나이저는 **손대지 않는다**.
 *      이게 없으면 코퍼스 n't 1,625건이 어떤 "not …" 표제어에도 매칭되지 않는다. §NEG_STEMS.
 * (10) 명사구 내부 수식어 삽입 — 분리 간극은 머리 직후에서만 열려서 [V][a][N][P] 형이
 *      수식어형을 전부 놓쳤다("play a role in" 5회 vs 실측 모수 38회). §4-(d).
 * (11) 약한 증거의 행별 편입 판정 — "진짜지만 오탐과 형태가 같은" 매칭(어휘 명사구 분리,
 *      관사 교체, one's→정관사)은 무조건 넣으면 오탐이 들어오고 무조건 빼면 **거짓 0회**가 된다.
 *      그래서 행 단위로 판단한다. §foldWeakEvidence.
 * (12) `미등장` 라벨은 **총계 0** 에만 붙인다. 약한 증거만 있으면 "판정보류", 두 창 사이에서만
 *      나오면 "중간기만 등장" 이다. 라벨이 부재를 단언하면 매칭 실패가 곧 연구 결론이 된다.
 *
 * 정확도 검증 방법: 엔진과 무관한 원문 정규식(grep 상당)으로 대조했다. 아래는 **재실행 필수** 대조군이다.
 *   for example 599 · such as 543 · in fact 213 · of course 119 · rather than 254 ·
 *   have to 536 · lead to 193 · take advantage of 26 · take into account 17
 * 위 규범 (8)~(12) 도입 후 재대조한 값(전부 원문과 일치):
 *   that is 80(관용구 79+축약 1) · human being 76(복수 58+단수 18) · well-being 52 ·
 *   a number of 128 · play a part in 8 · for what one is 3 · on one's side 2 · make one's way 4
 * 이 대조는 매칭 규범을 고칠 때마다 다시 돌릴 것.
 *
 * 0회 행은 **전수 원문 대조로 검증한다**(이 엔진이 "안 쓰인다"고 말하면 그게 곧 연구 결론이 되므로).
 * 알려진 한계 1건: 구 **내부**에 삽입된 쉼표 삽입구는 매칭하지 못한다
 * ("now is the time to" ↔ 원문 "now is the time, therefore, to emphasize…"(2004), 코퍼스 1건).
 * 쉼표 장벽은 이 엔진 전반의 폭주 방지 장치라, 1건을 위해 뚫으면 정밀도를 광범위하게 잃는다.
 * 남겨 두되 **모르고 지나치지 말 것** — 0회 행은 반드시 원문으로 확인하고 결론을 내라.
 *
 * 문장 경계: 모든 매칭은 `.!?;:` 를 **넘지 않는다**. 인접 토큰이라도 그 사이에 마침표가 있으면
 * 같은 구가 아니다. 분리 구동사 사이 구간은 쉼표도 넘지 못한다.
 *
 * 정규화: 연도마다 코퍼스 크기가 다르다(2003년 24지문 vs 2014년 311지문). 원시 빈도로 추세를
 * 논하면 전부 거짓이다. 모든 추세 지표는 **만 단어당 출현(per10k)** 이다. 이건 이 프로젝트의
 * 확정 규범이고 협상 대상이 아니다.
 *
 * 토크나이저는 stats.ts 와 **바이트 단위로 동일**하다(/[a-z]+(?:'[a-z]+)?/g). 곡선 아포스트로피
 * 정규화 같은 '개선'을 넣으면 분모(총 634,971단어)가 어긋나 두 엔진의 per10k 를 비교할 수 없게 된다.
 *
 * 성능: 4,537지문 × 1,500구를 이중 루프로 돌리지 않는다. 지문을 한 번 토큰화해 두고,
 * 구는 **머리 토큰 색인**(첫 슬롯이 받는 모든 굴절형 → 패턴 목록)으로 조회한다.
 * 코퍼스 위치당 후보 패턴만 검사하므로 전체가 수 초에 끝난다.
 */
import fs from "node:fs";
import PASSAGES from "@/data/exam-passages/passages.json";

// ─────────────────────────────────────────────────────────────────────────────
// 0. 코퍼스 적재 · 토큰화 (stats.ts 와 동일 규격)
// ─────────────────────────────────────────────────────────────────────────────
type Rec = {
  id: string; year: number; exam: string; board: string;
  grade?: string; typeGroup: string; text: string;
};
const ALL = (PASSAGES as unknown as Rec[]).filter((p) => typeof p.text === "string" && p.text.trim());

const TOKEN_RE = /[a-z]+(?:'[a-z]+)?/g;
/** 문장 경계로 취급하는 부호 — 이걸 넘는 매칭은 같은 구가 아니다. */
const SENT_BREAK_RE = /[.!?;:]/;

type Doc = {
  meta: Rec;
  toks: string[];
  /** i번째 토큰 **앞**에 문장부호가 있었는가 */
  hardBefore: boolean[];
  /** i번째 토큰 **앞**에 쉼표가 있었는가 */
  commaBefore: boolean[];
};

function tokenizeDoc(p: Rec): Doc {
  const lower = p.text.toLowerCase();
  const toks: string[] = [];
  const hardBefore: boolean[] = [];
  const commaBefore: boolean[] = [];
  let prevEnd = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(lower)) !== null) {
    const gap = lower.slice(prevEnd, m.index);
    toks.push(m[0]);
    hardBefore.push(toks.length > 1 && SENT_BREAK_RE.test(gap));
    commaBefore.push(toks.length > 1 && gap.includes(","));
    prevEnd = m.index + m[0].length;
  }
  return { meta: p, toks, hardBefore, commaBefore };
}

const DOCS: Doc[] = ALL.map(tokenizeDoc);

// 축별 분모 + 토큰 빈도(색인 선택용)
const totalWordsByYear = new Map<number, number>();
const totalWordsByGrade = new Map<string, number>();
const totalWordsByType = new Map<string, number>();
const passagesByYear = new Map<number, number>();
const tokenFreq = new Map<string, number>();
let corpusWords = 0;

const bump = <K>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

for (const d of DOCS) {
  const grade = d.meta.grade ?? "(미상)";
  corpusWords += d.toks.length;
  bump(totalWordsByYear, d.meta.year, d.toks.length);
  bump(totalWordsByGrade, grade, d.toks.length);
  bump(totalWordsByType, d.meta.typeGroup, d.toks.length);
  bump(passagesByYear, d.meta.year);
  for (const t of d.toks) bump(tokenFreq, t);
}

const YEARS = [...totalWordsByYear.keys()].sort((a, b) => a - b);
const GRADES = ["고1", "고2", "고3"];

// ─────────────────────────────────────────────────────────────────────────────
// 1. 동사 형태론 — 굴절형 생성 (결정론적)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 코퍼스에서 실제로 쓰이는 불규칙 동사만 있으면 된다는 요구에 맞춰, 수능/모의고사 지문에
 * 실제로 등장하는 범위로 추렸다. base → [과거, 과거분사] (같으면 하나만 적어도 된다).
 */
const IRREGULAR: Record<string, string[]> = {
  // 3인칭 단수가 불규칙인 동사는 be/have 뿐이다. has 를 빠뜨리면 "have to" 가 68회(13%) 과소집계된다.
  be: ["was", "were", "been", "am", "is", "are"],
  have: ["had", "has"], do: ["did", "done"], say: ["said"], go: ["went", "gone"],
  get: ["got", "gotten"], make: ["made"], know: ["knew", "known"], think: ["thought"],
  take: ["took", "taken"], see: ["saw", "seen"], come: ["came"], want: [],
  give: ["gave", "given"], find: ["found"], tell: ["told"], become: ["became"],
  leave: ["left"], feel: ["felt"], put: ["put"], bring: ["brought"], begin: ["began", "begun"],
  keep: ["kept"], hold: ["held"], write: ["wrote", "written"], stand: ["stood"],
  hear: ["heard"], let: ["let"], mean: ["meant"], set: ["set"], meet: ["met"],
  run: ["ran"], pay: ["paid"], sit: ["sat"], speak: ["spoke", "spoken"], lie: ["lay", "lain"],
  lead: ["led"], read: ["read"], grow: ["grew", "grown"], lose: ["lost"], fall: ["fell", "fallen"],
  send: ["sent"], build: ["built"], understand: ["understood"], draw: ["drew", "drawn"],
  break: ["broke", "broken"], spend: ["spent"], cut: ["cut"], rise: ["rose", "risen"],
  drive: ["drove", "driven"], buy: ["bought"], wear: ["wore", "worn"], choose: ["chose", "chosen"],
  seek: ["sought"], throw: ["threw", "thrown"], catch: ["caught"], deal: ["dealt"],
  win: ["won"], forget: ["forgot", "forgotten"], eat: ["ate", "eaten"], teach: ["taught"],
  fight: ["fought"], sell: ["sold"], hit: ["hit"], drink: ["drank", "drunk"], sing: ["sang", "sung"],
  swim: ["swam", "swum"], ride: ["rode", "ridden"], sleep: ["slept"], hang: ["hung"],
  fly: ["flew", "flown"], blow: ["blew", "blown"], shake: ["shook", "shaken"], steal: ["stole", "stolen"],
  strike: ["struck"], hide: ["hid", "hidden"], bear: ["bore", "borne"], beat: ["beat", "beaten"],
  bite: ["bit", "bitten"], burn: ["burnt"], cost: ["cost"], dig: ["dug"], feed: ["fed"],
  freeze: ["froze", "frozen"], hurt: ["hurt"], lay: ["laid"], lend: ["lent"], light: ["lit"],
  quit: ["quit"], rid: ["rid"], seat: [], shine: ["shone"], shoot: ["shot"], shut: ["shut"],
  slide: ["slid"], split: ["split"], spread: ["spread"], stick: ["stuck"], strive: ["strove", "striven"],
  sweep: ["swept"], swing: ["swung"], tear: ["tore", "torn"], wake: ["woke", "woken"],
  arise: ["arose", "arisen"], awake: ["awoke", "awoken"], bend: ["bent"], bind: ["bound"],
  cling: ["clung"], creep: ["crept"], flee: ["fled"], forgive: ["forgave", "forgiven"],
  freeze_: [], grind: ["ground"], kneel: ["knelt"], lean: ["leant"], overcome: ["overcame"],
  prove: ["proved", "proven"], seek_: [], shrink: ["shrank", "shrunk"], sink: ["sank", "sunk"],
  spill: ["spilt"], spin: ["spun"], spring: ["sprang", "sprung"], sting: ["stung"],
  undergo: ["underwent", "undergone"], undertake: ["undertook", "undertaken"],
  withdraw: ["withdrew", "withdrawn"], upset: ["upset"], mislead: ["misled"], rebuild: ["rebuilt"],
  outgrow: ["outgrew", "outgrown"], foresee: ["foresaw", "foreseen"],
};

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const isVowel = (c: string) => VOWELS.has(c);

/** 3인칭 단수 / 복수형 -s. */
function sForm(base: string): string[] {
  if (/(?:s|x|z|ch|sh)$/.test(base)) return [base + "es"];
  if (/[^aeiou]y$/.test(base)) return [base.slice(0, -1) + "ies"];
  if (/[^aeiou]o$/.test(base)) return [base + "es", base + "s"];
  return [base + "s"];
}

/** CVC 중복 후보(stop→stopped). 강세를 알 수 없으므로 중복형·비중복형을 **둘 다** 낸다. */
function doubled(base: string): string | null {
  if (base.length < 3) return null;
  const a = base[base.length - 3], b = base[base.length - 2], c = base[base.length - 1];
  if (!isVowel(a) && isVowel(b) && !isVowel(c) && !"wxy".includes(c)) return base + c;
  return null;
}

function edForm(base: string): string[] {
  const out: string[] = [];
  if (base.endsWith("e")) out.push(base + "d");
  else if (/[^aeiou]y$/.test(base)) out.push(base.slice(0, -1) + "ied");
  else if (base.endsWith("c")) out.push(base + "ked");
  else {
    out.push(base + "ed");
    const d = doubled(base);
    if (d) out.push(d + "ed");
  }
  return out;
}

function ingForm(base: string): string[] {
  const out: string[] = [];
  if (base.endsWith("ie")) out.push(base.slice(0, -2) + "ying");
  else if (base.endsWith("ee") || base.endsWith("oe") || base.endsWith("ye")) out.push(base + "ing");
  else if (base.endsWith("e")) out.push(base.slice(0, -1) + "ing");
  else if (base.endsWith("c")) out.push(base + "king");
  else {
    out.push(base + "ing");
    const d = doubled(base);
    if (d) out.push(d + "ing");
  }
  return out;
}

function verbForms(base: string): string[] {
  const set = new Set<string>([base]);
  if (base === "be") { for (const f of ["am", "is", "are", "was", "were", "been", "being"]) set.add(f); return [...set]; }
  for (const f of sForm(base)) set.add(f);
  for (const f of edForm(base)) set.add(f);
  for (const f of ingForm(base)) set.add(f);
  for (const f of IRREGULAR[base] ?? []) set.add(f);
  return [...set];
}

/** 불규칙 과거분사 집합 — `done` 자리표시자 슬롯 판정용. */
const IRREGULAR_PP = new Set<string>();
for (const forms of Object.values(IRREGULAR)) for (const f of forms) IRREGULAR_PP.add(f);

/** 동사 어휘집 — 6절에서 lemmas.json 으로부터 채운다(외부 사전·LLM 없음). */
const VERB_LEX = new Set<string>();
/** 명사 어휘집 — `do` 자리표시자가 명사를 먹는 것을 막는다("come to mind" 는 다른 숙어다). */
const NOUN_LEX = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// 2. 슬롯 클래스
// ─────────────────────────────────────────────────────────────────────────────
/**
 * one's 슬롯이 받는 것들. 정관사 `the` 를 포함시킨 이유: 소유격 자리는 본문에서 정관사로
 * 실현되는 경우가 흔하다("through one's eyes" ↔ 본문 "through the eyes of an artist").
 * 이걸 빼면 그 표제어가 통째로 0회가 된다(실측으로 확인).
 */
const POSS_PRONOUNS = new Set(["my", "your", "his", "her", "its", "our", "their", "one's", "whose", "someone's", "everyone's", "people's", "the"]);
const REFLEXIVES = new Set(["myself", "yourself", "yourselves", "himself", "herself", "itself", "ourselves", "themselves", "oneself"]);
const ARTICLES = new Set(["a", "an", "the"]);
/**
 * be 동사 표층형.
 * **표제어의 `be` (사전형)만** 이 집합 전체로 확장한다. 표제어가 굴절형을 적어 놓았다면
 * (`that is`, `that is why`) 그건 그 형태로 고정된 관용구지 굴절 슬롯이 아니다.
 * 위치 무관하게 확장했던 과거 규칙은 `that is`(=즉, idiom) 한 행이 관계절 "that are/was/
 * were/being" 을 통째로 먹게 만들었다 — 원문 대조 712회 중 관용구 실사용은 79회뿐이었고
 * "that are" 215건은 전수가 관계절이었다("learned eating behaviors that are formed…").
 * 확장 대상을 사전형으로 좁히면 "what ... be like"→"what it is like" 는 그대로 살아 있다.
 */
const BE_FORMS = new Set(["be", "am", "is", "are", "was", "were", "been", "being"]);
/** 총칭 대명사 — 표제어의 총칭 `one`("for what one is")이 본문에서 실현되는 형태. */
const GENERIC_PRONOUNS = new Set(["one", "i", "you", "he", "she", "it", "we", "they", "people", "someone", "everyone", "anyone", "nobody", "person"]);
/** 총칭 `one` 판정 — 뒤따르는 정형동사 표지. "one of the"(literal)와 구별한다. */
const FINITE_MARKERS = new Set(["is", "are", "was", "were", "can", "could", "has", "have", "had", "does", "do", "did", "will", "would", "should", "must", "may", "might"]);

/** 관사 삽입을 허용하지 않는(=명사 앞이 아닌) 기능어 슬롯. */
const FUNCTION_SLOT = new Set([
  "up", "down", "out", "off", "on", "in", "over", "away", "back", "together", "apart", "around",
  "aside", "through", "along", "forward", "of", "to", "for", "with", "from", "by", "at", "as",
  "into", "onto", "about", "after", "before", "than", "and", "or", "but", "if", "that", "so",
  "not", "no", "be", "am", "is", "are", "was", "were", "been",
]);

/** 진짜 분리 가능한 불변화사만. from/of/at 류(전치사 동사)는 분리되지 않는다. */
const SEPARABLE_PARTICLES = new Set([
  "up", "down", "out", "off", "on", "in", "over", "away", "back", "together", "apart",
  "around", "aside", "through", "along", "forward", "across", "by",
  // 서술 보어형 — 목적어가 반드시 앞에 온다("leave the animals alone", "set them free")
  "alone", "free", "aware", "busy",
]);

/**
 * 불변화사가 아니라 **전치사**여서 위 목록에서 빠진 2어 표제어들.
 * "look at" 처럼 목적어가 전치사 **뒤**에 오는 것도 있지만, "see A as B" "turn A into B"
 * "stop A from B" "keep A from B" 처럼 목적어가 전치사 **앞**에 오는 타동-전치사 구문도 같은
 * 표기("see as")로 등재된다. 후자는 분리형이 유일한 실현형인데 separable=false 라 total 은
 * 물론 진단 계수 looseSeparableHits 에도 안 남아 **완전히 비가시**했다
 * (실측: "turn into" total=23·loose=0 인데 원문 "turn(s/ed/ing) it into" 6건,
 *  "see as" total=56·loose=0 인데 원문 "see/saw/seen ... as" 81건).
 * 그래서 이 목록에는 **엄격 간극(대명사·부사 닫힌 부류)만** 열어 준다. 어휘 명사구 분리는
 * SEPARABLE_PARTICLES 와 달리 열지 않는다 — "look at"류 오탐과 구별할 수 없기 때문이다.
 * `to` 는 제외한다(부정사 to 앞에 목적어가 끼면 그건 다른 구문이다 — compile 의 기존 가드와 동일 취지).
 */
const PREP_GAP_PARTICLES = new Set([
  "into", "from", "as", "of", "about", "for", "with", "at", "against", "upon", "onto",
]);

/**
 * 부정 축약형. 토크나이저(stats.ts 와 바이트 단위 동일)는 "don't" 를 **1토큰**으로 유지하므로
 * 표제어의 `not` 슬롯이 원리적으로 발화할 수 없었다(실측: 코퍼스 n't 1,625건이 구조적 비가시,
 * "not have to" 23 vs 원문 축약형 37건). 토크나이저는 손대지 않는다 — 분모(634,971단어)가
 * 어긋나면 stats.json 과 per10k 를 비교할 수 없게 된다. 대신 `not` 슬롯이 축약 토큰을 받는다.
 * 곡선 아포스트로피(’)는 토크나이저가 "don"+"t" 두 토큰으로 쪼개므로(코퍼스 89건) 그 쌍도 받는다.
 */
const NEG_STEMS = [
  "do", "does", "did", "is", "are", "was", "were", "has", "have", "had", "ca", "wo",
  "could", "would", "should", "must", "might", "need", "dare", "sha", "ai",
];
const NEG_CONTRACTED = new Set(NEG_STEMS.map((s) => `${s}n't`));
const NEG_SPLIT_STEMS = new Set(NEG_STEMS.map((s) => `${s}n`));
/** `not` 슬롯이 받는 전체 토큰 집합(색인 키 생성용). */
const NEG_HEAD_TOKENS = ["not", "cannot", ...NEG_CONTRACTED, ...NEG_SPLIT_STEMS];

/**
 * 자유 통사와 동형이라 **쉼표 구획이 있어야만** 관용구인 표제어.
 * 근거(원문 대조): "that is" 는 코퍼스에 366회 나오지만 관용구(=즉)는 쉼표를 동반한 79회뿐이고
 * 나머지는 전부 관계절·지시대명사 주어다("for that is where it is displayed", "something that is
 * not a proper name"). 어휘 매처는 뜻을 모르므로 이 한 가지 표층 신호로만 구별할 수 있다.
 * **일반 규칙으로 넓히지 말 것** — "so that"(155) "up to"(133) "as if"(76) 처럼 전부 기능어로
 * 이루어진 관용구는 쉼표 없이 쓰이는 게 정상이라, 기능어 구성이라는 조건으로 자동화하면 전멸한다.
 * 이 집합에 무언가를 추가할 때는 원문 콘코던스 전수 확인을 근거로 남길 것.
 */
const PARENTHETICAL_IDIOMS = new Set(["that is"]);

/**
 * 2어 구동사의 분리 구간에 **허용되는** 토큰 — 대명사 목적어와 부사뿐이다.
 * 감사 결과 이 제약이 없으면 "take part in / takes place in" 이 `take in` 으로,
 * "put pressure on" 이 `put on` 으로, "major turning point in" 이 `major in` 으로 새어 들어왔다
 * (`take in` 은 분리 매칭 67/87 이 오탐이었다). 2어 구동사는 뒤 슬롯이 하나뿐이라 스스로를
 * 검증하지 못하므로 여기만은 닫힌 부류로 못박는다. 3슬롯 이상은 뒤 슬롯들이 검증하므로 완화한다.
 */
const GAP_PRONOUNS = new Set([
  "it", "them", "him", "her", "us", "me", "you", "this", "that", "these", "those",
  "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
  "one", "ones", "others", "everything", "something", "anything", "everyone", "someone",
]);
const GAP_ADVERBS = new Set([
  "more", "most", "less", "least", "very", "too", "just", "only", "even", "still",
  "again", "further", "back", "right", "all", "well", "often", "always", "never",
  "rather", "quite", "far", "much", "long", "straight", "firmly", "closely",
  // -ly 로 끝나지 않는 정도부사. 없으면 "of no use" 가 원문 "of almost no use"(2009)를 놓친다.
  "almost", "somewhat", "pretty", "nearly", "half", "least", "best", "better", "worse",
]);
const gapTokenStrict = (t: string) =>
  GAP_PRONOUNS.has(t) || GAP_ADVERBS.has(t) || (t.length >= 5 && t.endsWith("ly"));

/** 분리 구간에 들어오면 그 매칭을 기각하는 토큰 — 절 경계·전치사구 신호. */
const FORBIDDEN_IN_GAP = new Set([
  "and", "or", "but", "if", "because", "while", "when", "where", "who", "which", "whom", "that",
  "than", "as", "of", "to", "in", "on", "at", "for", "with", "from", "by", "into", "about",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "can", "could", "may", "might", "shall", "should", "must", "not", "so",
  "then", "there", "here", "also", "however", "although", "though", "since", "until",
]);

/**
 * 슬롯 종류
 *   lit  literal 집합(굴절형 확장 포함)
 *   poss one's 자리        refl oneself 자리        pron 총칭 one 자리
 *   ger  `doing` 자리표시자(-ing 형만)   pp `done` 자리표시자(과거분사만)
 *   bare `do` 자리표시자(동사 원형만)    np `someone` 자리표시자(1~3토큰 명사구)
 *   wild `~` `...` a/b 변수 자리(1~6토큰)
 * ger/pp/bare 는 **형태 제약**을 걸어 자리표시자를 복원한다. 제약 없이 아무 토큰이나 받으면
 * "come to do" 가 "come to mind/terms/life" 까지 먹어 통계가 무의미해진다.
 */
type Slot =
  | { kind: "lit"; set: Set<string>; freq: number; fn: boolean; art: boolean; artLit: string | null }
  | { kind: "poss" }
  | { kind: "refl" }
  | { kind: "pron" }
  | { kind: "ger" }
  | { kind: "pp" }
  | { kind: "bare" }
  | { kind: "neg" }
  | { kind: "np"; min: number; max: number }
  | { kind: "wild"; min: number; max: number };

/** 슬롯이 닫힌 부류(literal)인가 — 뒤 슬롯이 간극을 검증해 줄 수 있는지 판정한다. */
const isClosed = (s: Slot) => s.kind === "lit" || s.kind === "neg";

type Pattern = {
  id: number;
  surface: string;          // 사전형 구 (행의 `surface`)
  posList: string[];
  slots: Slot[];
  heads: string[];          // 첫 슬롯이 받는 토큰들 = 색인 키
  separable: boolean;       // 머리 동사 뒤 목적어 삽입 허용 여부
  strictGapOnly: boolean;   // 전치사 2어 구 — 엄격 간극만(어휘 명사구 분리 금지)
  /** 하이픈 복합어가 본문에서 붙여쓰기로 실현된 형태("passer-by" → "passersby") */
  soloAlt: Set<string> | null;
  hasWildcard: boolean;
  headInflected: boolean;
  tailPluralized: boolean;
  modifierGap: boolean;
  parenthetical: boolean;   // 쉼표 구획이 있어야만 관용구인 표제어
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. 표제어 → 패턴 컴파일
// ─────────────────────────────────────────────────────────────────────────────
const WILD = "\u0001";
const LEMMA_TOKEN_RE = /[a-z]+(?:'[a-z]+)?|\u0001/g;

/**
 * 상관구문 보정 — 표제어 "not only but also" 는 본문에서 절대 인접해 나오지 않는다
 * (실측: 코퍼스에 "not only ... but also" 가 54회인데 인접형은 0회).
 * 앞짝/뒤짝이 붙어 있으면 그 사이에 와일드카드를 넣는다.
 */
const CORRELATIVE_OPENERS = [["not", "only"], ["not", "just"], ["either"], ["neither"], ["both"]];
const CORRELATIVE_CLOSERS = [["but", "also"], ["but"], ["or"], ["nor"], ["and"]];

function insertCorrelativeGap(toks: string[]): string[] {
  if (toks.includes(WILD)) return toks;
  for (const op of CORRELATIVE_OPENERS) {
    if (toks.length <= op.length) continue;
    if (!op.every((w, i) => toks[i] === w)) continue;
    const rest = toks.slice(op.length);
    for (const cl of CORRELATIVE_CLOSERS) {
      if (cl.every((w, i) => rest[i] === w)) return [...op, WILD, ...rest];
    }
  }
  return toks;
}

/**
 * 표제어 문자열을 슬롯 토큰 열로 만든다.
 *  - `~` `...` `…` → 와일드카드
 *  - 쉼표 → 와일드카드 ("the more, the more")
 *  - 표제어가 변수 표기 `b` 를 쓰면(예: "not only a but also b") 그 안의 a/b 는 와일드카드
 *  - 상관구문 앞짝/뒤짝 사이에 와일드카드 삽입
 */
function lemmaTokens(lemma: string): string[] {
  const pre = lemma
    .toLowerCase()
    // `~ing` `...ing` 는 와일드카드가 아니라 **동명사 자리**를 뜻하는 사전 표기다
    // ("cannot ~ without ~ing" → 원문 "cannot live without knowing"). 그냥 와일드카드로
    // 풀면 뒤에 literal "ing" 슬롯이 남아 그 토큰을 영원히 못 찾는다 = 거짓 0회.
    .replace(/(?:\.\.\.|…|~)\s*ing\b/g, " doing ")
    .replace(/\.\.\.|…|~/g, ` ${WILD} `)
    .replace(/,/g, ` ${WILD} `);
  LEMMA_TOKEN_RE.lastIndex = 0;
  let toks: string[] = [...(pre.match(LEMMA_TOKEN_RE) ?? [])];
  if (toks.includes("b")) toks = toks.map((t) => (t === "a" || t === "b" ? WILD : t));
  toks = insertCorrelativeGap(toks);
  // 인접 와일드카드 병합 + 양끝 와일드카드 제거(앵커가 없어지면 색인이 불가능하다)
  const merged: string[] = [];
  for (const t of toks) {
    if (t === WILD && merged[merged.length - 1] === WILD) continue;
    merged.push(t);
  }
  while (merged[0] === WILD) merged.shift();
  while (merged[merged.length - 1] === WILD) merged.pop();
  return merged;
}

type LemmaRec = { lemma: string; pos: string; quant: unknown };

const litSlot = (forms: string[], artLit: string | null = null): Slot => ({
  kind: "lit",
  set: new Set(forms),
  freq: forms.reduce((n, f) => n + (tokenFreq.get(f) ?? 0), 0),
  fn: forms.length === 1 && FUNCTION_SLOT.has(forms[0]),
  /** 한정사(관사) 슬롯인가 — 수식어 간극이 **넘어가면 안 되는** 경계다(§4-d). */
  art: forms.length > 0 && forms.every((f) => ARTICLES.has(f)),
  /** 표제어가 적어 둔 관사(교체 여부 판정용) */
  artLit,
});

/**
 * 관사 **교체**가 일어났는가. a↔an 은 같은 관사의 음운 변이형이라 교체로 치지 않는다.
 * a/an ↔ the 는 다르다 — 부정관사와 정관사는 이 코퍼스에서 최소대립쌍을 이룬다
 * (원문: "a number of" 74회 vs "the number of" 88회는 서로 다른 표현이고,
 *  "at a time"/"at the time", "a moment"/"the moment" 도 각각 별개 표제어로 등재돼 있다).
 * 그래서 정관사 실현은 **약한 증거**로만 쌓고, 그 행에 강한 증거가 하나도 없을 때만 편입한다
 * (그래야 "save for a rainy day" 의 유일한 실현형 "Save for the rainy days"(2009)가 거짓 0회가 되지 않는다).
 */
const artSubstituted = (s: Slot, tok: string): boolean =>
  s.kind === "lit" && s.art && s.artLit !== null && s.artLit !== tok &&
  !((s.artLit === "a" || s.artLit === "an") && (tok === "a" || tok === "an"));

function compile(surface: string, posList: string[], verbLex: Set<string>, allowSeparable: boolean, id: number): Pattern | null {
  const toks = lemmaTokens(surface);
  const n = toks.length;
  if (toks.filter((t) => t !== WILD).length < 2) return null;

  /** 하이픈 복합어(공백 없음) — 굴절이 **뒤쪽** 요소에 붙는다("fine-tune" → "fine-tuned"). */
  const hyphenCompound = !surface.includes(" ") && surface.includes("-");
  const verbPos = posList.includes("verb") || posList.includes("phrasal_verb");

  /**
   * [V][one's|oneself][N] 프레임은 구성상 동사구다("bare one's soul", "hold one's nose").
   * pos 가 idiom 이라 verbPos 가 서지 않고 머리가 동사 어휘집에도 없으면 굴절이 죽어
   * 표제어가 통째로 0회가 된다(원문 "such baring of your soul" 미집계).
   */
  const possFrame = n >= 3 && (toks[1] === "one's" || toks[1] === "oneself");
  /**
   * 등위 동사쌍 "give and take" / "toss and turn" — 굴절은 **양쪽**에 붙는다
   * (원문 "with giving and taking", "spend the night tossing and turning").
   * 등위는 범주 보존이므로 **한쪽만** 동사로 알려져 있어도 둘 다 동사로 본다
   * (verbLex 는 추출물에서 유도한 부분 어휘집이라 한쪽이 비는 일이 흔하다).
   */
  const coordVerbPair = n === 3 && (toks[1] === "and" || toks[1] === "or") &&
    toks[0] !== WILD && toks[2] !== WILD &&
    (verbPos || verbLex.has(toks[0]) || verbLex.has(toks[2]));

  const isVerbHead =
    toks[0] !== WILD && !(hyphenCompound && verbPos) &&
    (verbPos || verbLex.has(toks[0]) || possFrame || coordVerbPair);

  const nounish = posList.includes("noun") || posList.includes("collocation");
  const last = toks[n - 1];
  /**
   * 말미 명사의 복수 실현형.
   * nounish(noun/collocation)로만 제한했더니 3슬롯 이상 관용구의 복수형이 전멸했다
   * (원문: "hold one's nose"→"holding their noses", "have one's picture taken"→"have their
   *  pictures taken", "save for a rainy day"→"save for the rainy days" — 전부 미집계).
   * 2슬롯은 최소대립쌍 위험이 있어 nounish 로 계속 묶고, 3슬롯 이상은 앞 슬롯들이 검증하므로 연다.
   */
  /**
   * 공백과 하이픈이 섞인 표제어("car break-in")는 hyphenCompound 분기에 걸리지 않는다.
   * 이때 마지막 토큰은 전치사가 아니라 **복합명사의 뒷요소**이므로 기능어 배제를 적용하면 안 된다
   * — 적용했더니 "car break-in" 이 원문 "car break-ins"(2009)를 놓쳐 거짓 0회가 됐다.
   */
  const hyphenTail = /-[a-z]+$/.test(surface.toLowerCase());
  const tailPlural = (nounish || n >= 3) && last !== WILD &&
    (!FUNCTION_SLOT.has(last) || hyphenTail) &&
    !POSS_PRONOUNS.has(last) && !REFLEXIVES.has(last) && n >= 2;

  /** i번째 슬롯 **앞**에 변수 자리(주어가 될 수 있는 열린 슬롯)가 있는가. */
  const OPEN_TOKENS = new Set(["one's", "oneself", "someone", "somebody", "sb", "one", WILD]);
  const openSlotBefore = (i: number) => toks.slice(0, i).some((t) => OPEN_TOKENS.has(t));

  const slots: Slot[] = toks.map((t, i) => {
    if (t === WILD) return { kind: "wild", min: 1, max: 6 } as Slot;
    if (t === "one's") return { kind: "poss" } as Slot;
    if (t === "oneself") return { kind: "refl" } as Slot;
    // 메타언어 자리표시자 — 사전 표기일 뿐 본문에 그 글자가 나오지 않는다.
    if (t === "someone" || t === "somebody" || t === "sb") return { kind: "np", min: 1, max: 3 } as Slot;
    if (i === n - 1 && n >= 3 && t === "doing") return { kind: "ger" } as Slot;
    if (i === n - 1 && n >= 3 && t === "done" && /^(have|has|had)$/.test(toks[i - 1])) return { kind: "pp" } as Slot;
    if (i === n - 1 && n >= 3 && t === "do") return { kind: "bare" } as Slot;
    // 총칭 one — 뒤에 정형동사 표지가 오면 대명사 자리다("for what one is"). "one of the" 는 literal.
    if (i > 0 && t === "one" && i + 1 < n && FINITE_MARKERS.has(toks[i + 1])) return { kind: "pron" } as Slot;
    // 부정 슬롯 — 축약형(don't / 곡선쪼개짐 "don"+"t")을 받는다. §NEG_STEMS 주석 참조.
    if (t === "not") return { kind: "neg" } as Slot;
    if (t === "cannot") return litSlot(["cannot", "can't"]);
    if (i === 0 && isVerbHead) return litSlot(verbForms(t));
    if (coordVerbPair && i === 2) return litSlot(verbForms(t));
    // be 슬롯의 형태 확장 — BE_FORMS 주석 참조.
    //  · 사전형 `be` 는 인용형이므로 항상 확장한다("what ... be like" → "what it is like").
    //  · 굴절형(is/are/was…)은 **앞에 열린 슬롯이 있을 때만** 확장한다. 열린 슬롯은 주어 자리이고,
    //    주어가 변수면 그 서술어의 시제·수도 변수다("for what one is" → "for what they were").
    //    앞이 전부 고정 어휘면 그건 굴절 슬롯이 아니라 통째로 굳은 연결어다("that is"=즉, "that is why").
    if (t === "be" || (BE_FORMS.has(t) && openSlotBefore(i))) return litSlot(verbForms("be"));
    if (hyphenCompound && verbPos && i === n - 1) return litSlot(verbForms(t));
    // 하이픈 명사 복합어는 앞 요소가 복수가 되기도 한다("passer-by" → "passers-by")
    if (hyphenCompound && nounish && i === 0) return litSlot([t, ...sForm(t)]);
    if (i === n - 1 && tailPlural) return litSlot([t, ...sForm(t)]);
    // 관사 슬롯은 표제어 표기에 매이지 않는다. a↔an 은 무료, a/an↔the 는 약한 증거로 계수한다
    // (artSubstituted 주석 참조).
    if (ARTICLES.has(t)) return litSlot([...ARTICLES], t);
    // 한정사(관사·소유격) 바로 뒤 명사는 복수로 실현된다("their pictures", "the rainy days")
    if (i > 0 && !FUNCTION_SLOT.has(t) &&
        (ARTICLES.has(toks[i - 1]) || toks[i - 1] === "one's" || POSS_PRONOUNS.has(toks[i - 1]))) {
      return litSlot([t, ...sForm(t)]);
    }
    return litSlot([t]);
  });

  // 색인 키(첫 슬롯이 받는 토큰). 슬롯 클래스가 열거 가능해야 앵커를 걸 수 있다.
  const head = slots[0];
  const headTokens =
    head.kind === "lit" ? [...head.set]
      : head.kind === "poss" ? [...POSS_PRONOUNS]
        : head.kind === "refl" ? [...REFLEXIVES]
          : head.kind === "pron" ? [...GENERIC_PRONOUNS]
            : head.kind === "neg" ? NEG_HEAD_TOKENS
              : null;
  if (!headTokens) return null;

  /**
   * 색인 키에 축약 실현형을 더한다. [that][is] 는 본문에서 "that's" **1토큰**으로 실현되는데
   * (원문 "That's why" 24건), 색인이 "that" 만 걸려 있으면 매칭 시도조차 못 한다.
   */
  const headKeys = headTokens.slice();   // NEG_HEAD_TOKENS 를 공유 참조로 변형하지 않기 위해 복사
  const s1raw = slots[1];
  if (head.kind === "lit" && s1raw && s1raw.kind === "lit" && (s1raw.set.has("is") || s1raw.set.has("has"))) {
    for (const h of head.set) headKeys.push(`${h}'s`);
  }

  /**
   * 머리 동사 뒤 삽입 허용 조건.
   *  - 2슬롯: 진짜 분리 가능 불변화사일 때만("give it up" ○ / "come a long way from" ×)
   *  - 3슬롯 이상: 뒤 슬롯들이 스스로 검증 역할을 하므로 오탐이 급감한다("take these into account")
   *  - 단, 머리 뒤가 `to` 면 금지한다. 부정사 `to` 앞에 목적어가 끼면 그건 다른 구문이다
   *    ("come together to create" 는 "come to do" 의 실현형이 아니다).
   * 와일드카드 패턴은 이미 느슨하므로 간극을 겹쳐 주지 않는다.
   */
  const s1 = slots[1];
  const hasWild = slots.some((s) => s.kind === "wild");
  const s1Lit = s1.kind === "lit" && s1.set.size === 1 ? [...s1.set][0] : null;
  const twoSlotParticle = slots.length === 2 && s1Lit !== null && SEPARABLE_PARTICLES.has(s1Lit);
  const twoSlotPrep = slots.length === 2 && s1Lit !== null && PREP_GAP_PARTICLES.has(s1Lit);
  // 등위 동사쌍은 분리할 불변화사가 없다 — 간극을 열면 "and" 앞으로 아무 명사구나 들어온다.
  const separable =
    allowSeparable && isVerbHead && !hasWild && !coordVerbPair && toks[1] !== "to" &&
    (slots.length >= 3 || twoSlotParticle || twoSlotPrep);
  /** 전치사 2어 구는 **엄격 간극만** 연다(어휘 명사구 분리는 "look at"류 오탐과 구별 불가). */
  const strictGapOnly = twoSlotPrep && !twoSlotParticle;

  // 하이픈 복합어의 붙여쓰기 실현형. 토크나이저가 하이픈을 자르므로 "passersby" 는 1토큰이 된다.
  let soloAlt: Set<string> | null = null;
  if (hyphenCompound) {
    const joined = toks.join("");
    soloAlt = new Set([joined]);
    if (nounish) {
      for (const f of sForm(joined)) soloAlt.add(f);
      // 복수가 앞 요소에 붙는 유형(passer-by → passersby)
      for (const f of sForm(toks[0])) soloAlt.add(f + toks.slice(1).join(""));
    }
    if (verbPos) for (const f of verbForms(joined)) soloAlt.add(f);
  }

  return {
    id, surface, posList, slots,
    heads: [...headKeys, ...(soloAlt ?? [])],
    separable, strictGapOnly, soloAlt,
    hasWildcard: hasWild,
    headInflected: isVerbHead,
    tailPluralized: tailPlural,
    /** 수식어 간극(§4-d) — 와일드카드가 없는 3슬롯 이상에서만. 토큰 제약은 매처가 건다. */
    modifierGap: !hasWild && slots.length >= 3,
    parenthetical: PARENTHETICAL_IDIOMS.has(surface),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 매처
// ─────────────────────────────────────────────────────────────────────────────
type MatchFlags = {
  article: boolean; gap: boolean; wild: boolean; loose: boolean;
  mod: boolean; possThe: boolean; contract: boolean; artSub: boolean;
};

/** 슬롯이 토큰을 성공적으로 소비했을 때 남길 증거 등급 표시. */
function noteSlot(s: Slot, tok: string, flags: MatchFlags): void {
  if (s.kind === "poss" && tok === "the") flags.possThe = true;
  if (s.kind === "neg" && tok !== "not") flags.contract = true;
  if (artSubstituted(s, tok)) flags.artSub = true;
}

function slotAccepts(s: Slot, tok: string): boolean {
  if (s.kind === "lit") return s.set.has(tok);
  if (s.kind === "poss") return POSS_PRONOUNS.has(tok) || tok.endsWith("'s");
  if (s.kind === "refl") return REFLEXIVES.has(tok);
  if (s.kind === "pron") return GENERIC_PRONOUNS.has(tok);
  if (s.kind === "ger") return tok.length >= 5 && tok.endsWith("ing");
  if (s.kind === "pp") return (tok.length >= 4 && tok.endsWith("ed")) || IRREGULAR_PP.has(tok);
  if (s.kind === "bare") return VERB_LEX.has(tok) && !NOUN_LEX.has(tok);
  if (s.kind === "neg") return tok === "not" || tok === "cannot" || NEG_CONTRACTED.has(tok);
  return false; // wild / np 는 go() 가 직접 처리한다
}

/**
 * 슬롯이 pos 에서 소비할 수 있는 **토큰 수 후보**(짧은 것부터). 0개 반환이면 불일치.
 * 대부분 [1] 이지만 두 경우가 길이 변이를 만든다.
 *  · 부정 슬롯의 곡선 아포스트로피 분리형: "don’t" → 토큰 "don"+"t" 2개
 *  · 소유격/재귀 슬롯의 등위: "himself or herself", "his or her" → 3개
 *    (원문 "show himself or herself as", "do him or her a favor" 가 이것 때문에 0회였다)
 */
function consumeLens(s: Slot, toks: string[], pos: number): number[] {
  if (s.kind === "neg") {
    const out: number[] = [];
    if (slotAccepts(s, toks[pos])) out.push(1);
    if (NEG_SPLIT_STEMS.has(toks[pos]) && toks[pos + 1] === "t") out.push(2);
    return out;
  }
  if (!slotAccepts(s, toks[pos])) return [];
  if ((s.kind === "poss" || s.kind === "refl") &&
      (toks[pos + 1] === "or" || toks[pos + 1] === "and") &&
      pos + 2 < toks.length && slotAccepts(s, toks[pos + 2])) {
    return [1, 3];
  }
  return [1];
}

const MAX_ARTICLE_INSERT = 2;
const MAX_GAP = 3;
/** 수식어 간극 최대 길이. "played an important social role in" 까지 담는다. */
const MAX_MOD_GAP = 2;

/**
 * start 위치에서 패턴 전체를 맞춰 본다. 성공하면 매칭 끝 위치를 돌려준다.
 * 시도 순서는 **엄격 → 느슨**: 인접 일치 → 관사 삽입 → 분리 구동사 간극.
 * 가장 짧은(=가장 보수적인) 매칭을 먼저 채택한다.
 */
function matchAt(doc: Doc, start: number, pat: Pattern, flags: MatchFlags): number {
  const { toks, hardBefore, commaBefore } = doc;
  const n = toks.length;
  const slots = pat.slots;

  // 붙여쓰기 실현형은 1토큰으로 끝난다
  if (pat.soloAlt && pat.soloAlt.has(toks[start])) return start + 1;

  function go(si: number, pos: number, articleBudget: number): number {
    if (si === slots.length) return pos;
    if (pos >= n) return -1;
    // 문장부호를 넘는 순간 같은 구가 아니다
    if (si > 0 && hardBefore[pos]) return -1;

    const s = slots[si];

    if (s.kind === "wild") {
      const max = Math.min(s.max, n - pos - (slots.length - si - 1));
      for (let len = s.min; len <= max; len++) {
        let broken = false;
        for (let k = 0; k < len; k++) if (hardBefore[pos + k]) { broken = true; break; }
        if (broken) break;
        if (hardBefore[pos + len]) continue;
        const r = go(si + 1, pos + len, articleBudget);
        if (r >= 0) { flags.wild = true; return r; }
      }
      return -1;
    }

    // someone/sb 자리 — 명사구 1~3토큰. 절 경계 신호가 끼면 기각한다.
    if (s.kind === "np") {
      for (let len = s.min; len <= Math.min(s.max, n - pos); len++) {
        const t = toks[pos + len - 1];
        if (hardBefore[pos + len - 1] || commaBefore[pos + len - 1]) break;
        // 등위 접속사는 명사구 **내부**에는 올 수 있다("him or her"). 다만 거기서 끝날 수는 없다.
        if (t === "and" || t === "or") { if (len >= s.max) break; continue; }
        if (FORBIDDEN_IN_GAP.has(t)) break;
        const r = go(si + 1, pos + len, articleBudget);
        if (r >= 0) return r;
      }
      return -1;
    }

    // (a) 인접 일치
    for (const len of consumeLens(s, toks, pos)) {
      const r = go(si + 1, pos + len, articleBudget);
      if (r >= 0) { noteSlot(s, toks[pos], flags); return r; }
    }

    /**
     * (a-2) 대명사+be 축약 — 토크나이저가 "that's" 를 1토큰으로 유지하므로 [that][is] 두 슬롯을
     * 한 토큰이 채운다. 이게 없으면 "that is why"(17회)가 원문 "That's why"(24회)를 통째로 놓친다.
     */
    if (si + 1 < slots.length && s.kind === "lit" && !s.set.has(toks[pos])) {
      const nx = slots[si + 1];
      const cut = toks[pos].endsWith("'s") ? toks[pos].slice(0, -2) : null;
      if (cut && s.set.has(cut) && nx.kind === "lit" && (nx.set.has("is") || nx.set.has("has"))) {
        const r = go(si + 2, pos + 1, articleBudget);
        if (r >= 0) { flags.contract = true; return r; }
      }
    }

    /**
     * (a-3) 동명사 명사화의 `of` — "bare one's soul" 의 실현형 "baring of your soul".
     * 머리가 -ing 로 실현됐을 때만 소유격 슬롯 앞 `of` 를 건너뛴다.
     */
    if (s.kind === "poss" && si > 0 && toks[pos] === "of" &&
        pos > 0 && toks[pos - 1].endsWith("ing") && pos + 1 < n && !hardBefore[pos + 1]) {
      for (const len of consumeLens(s, toks, pos + 1)) {
        const r = go(si + 1, pos + 1 + len, articleBudget);
        if (r >= 0) { flags.article = true; noteSlot(s, toks[pos + 1], flags); return r; }
      }
    }

    /**
     * (b) 관사 삽입 — 표제어에서 벗겨진 a/an/the 복원. **강하게 제한한다.**
     *  - 자리표시자 슬롯(ger/pp/bare/pron/np) 앞: 금지(원형 동사 앞에 관사는 없다).
     *  - 2슬롯 패턴, 그리고 마지막 슬롯 앞: 금지.
     * 무제한으로 허용했을 때를 실측하니 126회 중 90%가 오탐이었다 —
     * "in case"→"in the case", "not only"→"not the only", "in particular"→"in a particular",
     * "take place"→"takes the place". 무관사 관용구는 관사형과 **최소대립쌍**이라서
     * 관사 하나 차이로 전혀 다른 구문이 된다. 3슬롯 이상의 중간 슬롯은 앞뒤 슬롯이
     * 검증해 주므로 그때만 복원한다("at end of day" → "at the end of the day").
     */
    if (si > 0 && si < slots.length - 1 && slots.length >= 3 &&
        articleBudget > 0 && s.kind === "lit" && !s.fn && ARTICLES.has(toks[pos]) &&
        !slotAccepts(s, toks[pos]) && pos + 1 < n && !hardBefore[pos + 1] && slotAccepts(s, toks[pos + 1])) {
      const r = go(si + 1, pos + 2, articleBudget - 1);
      if (r >= 0) { flags.article = true; return r; }
    }

    // (c) 분리 구동사 간극 — 머리 동사 바로 뒤에서만
    if (si === 1 && pat.separable) {
      const twoSlot = slots.length === 2;
      /** 1차: 확실한 분리(대명사 목적어·부사). 2어는 닫힌 부류, 3슬롯 이상은 명사구까지. */
      const pass = (ok: (t: string) => boolean, loose: boolean): number => {
        for (let g = 1; g <= MAX_GAP; g++) {
          const at = pos + g;
          if (at >= n) break;
          const t = toks[pos + g - 1];
          if (hardBefore[pos + g - 1] || commaBefore[pos + g - 1] || !ok(t)) break;
          if (hardBefore[at] || commaBefore[at]) break;
          for (const len of consumeLens(s, toks, at)) {
            const r = go(si + 1, at + len, articleBudget);
            if (r >= 0) {
              flags.gap = true;
              if (loose) flags.loose = true;
              noteSlot(s, toks[at], flags);
              return r;
            }
          }
        }
        return -1;
      };
      /**
       * 3슬롯 이상의 간극 완화(어휘 명사구까지 허용)는 "뒤 슬롯들이 검증해 준다"는 전제 위에 있다.
       * 그 전제가 서려면 두 조건이 **모두** 필요하다.
       *  ① 남은 슬롯이 전부 닫힌 부류일 것. poss/np/wild 가 남아 있으면 아무것도 검증되지 않는다
       *     — "make one's way" 가 "make some mistakes along the way"(2012)
       *     "makes people behave the way they do"(2018) 를 먹은 것이 그 결과다(7건 중 3건 오탐).
       *  ② 간극 **뒤**에 오는 슬롯이 기능어(전치사·불변화사)일 것. 그래야 그 어휘 명사구가
       *     구의 목적어 자리라는 게 확인된다("take these needs into account" ○).
       *     뒤가 관사·명사면 그 자리가 이미 목적어이므로, 앞에 낀 명사구는 이 구의 일부가 아니다
       *     — "make a living" 이 "have made my life a living hell"(2009) 을 먹은 것이 그 결과다.
       * 두 조건 중 하나라도 어긋나면 엄격 간극(대명사·부사 닫힌 부류)으로 되돌린다.
       * 수식어 삽입은 이 규칙이 막아도 (d)가 별도 조건으로 처리한다.
       */
      const restClosed = slots.slice(si).every(isClosed);
      const relaxed = !twoSlot && restClosed && s.kind === "lit" && s.fn;
      const r1 = pass(relaxed ? (t) => !FORBIDDEN_IN_GAP.has(t) : gapTokenStrict, false);
      if (r1 >= 0) return r1;
      /**
       * 2차(2어 구동사 한정): 어휘 명사구 분리("kick teenagers out", "scare men away").
       * 진짜 분리형이지만 "take part in"→take in 같은 오탐도 같은 모양이라 구별이 불가능하다.
       * 그래서 **총계·추세에는 넣지 않고** looseSeparableHits 로만 남긴다(감사·복원 가능).
       * strictGapOnly(전치사 2어 구)는 이 단계를 아예 열지 않는다.
       */
      if (twoSlot && !pat.strictGapOnly) {
        const r2 = pass((t) => !FORBIDDEN_IN_GAP.has(t), true);
        if (r2 >= 0) return r2;
      }
    }

    /**
     * (d) 명사구 내부 수식어 삽입 — [V][a][N][P] 형 표제어의 최대 누락원이었다.
     * (c)의 간극은 **머리 바로 뒤(si===1)** 에서만 열리므로 한정사와 명사 사이가 비어 있었다:
     * "play a role in" 은 총 5회로 집계됐지만 원문 실측 모수는 38회다(수식어형 34건 = 87% 누락).
     * "play a part in" 은 1 vs 8. 반면 수식어가 머리 직후에 오는 "take advantage of"는
     * (c)가 이미 잡아 26 vs 26 으로 전량 포착돼 있었다 — 누락은 위치 문제였다.
     *
     * 토큰 제약은 (c)와 같은 원리로 건다.
     *  · 남은 슬롯이 전부 닫힌 부류이고, 마지막 슬롯이 아니고, 기능어 슬롯이 아닐 때만 완화
     *  · **한정사 슬롯 앞에서는 완화하지 않는다.** 관사 앞은 수식어 자리가 아니라 목적어 자리다
     *    — 여기를 열면 "make a living" 이 "made my life a living hell" 을 먹는다.
     *  · 그 밖에는 부사·대명사 닫힌 부류만("think one's way through" → "think your way logically through")
     *  · 관사 하나만으로 이루어진 간극은 금지 — (b)가 의도적으로 막아 둔 관사 삽입과 같아진다.
     *    두 토큰 이상일 때만 허용한다("to be a bit more specific").
     */
    if (pat.modifierGap && si > 0 && s.kind === "lit") {
      /**
       * 지연시키는 슬롯이 **순수 동사**(동사이면서 명사가 아닌 것)면 완화하지 않는다.
       * 동사 앞 간극은 수식어 자리가 아니라 절 경계이고, 거기를 열면 구가 자기 것이 아닌 절을
       * 삼킨다 — "not have to" 가 "doesn't mean you have to" 를 먹은 것이 그 예다
       * (부정의 작용역은 mean 이지 have to 가 아니다). 부사 삽입은 엄격 간극이 그대로 처리한다.
       * 동사·명사 겸용(use, place, need…)은 여기서 명사로 쓰인 것이므로 막지 않는다
       * — 막았더니 "make good/better/efficient use of" 7건이 전멸했다(원문 전수 확인, 전부 진짜).
       */
      const verbOnly = [...s.set].some((f) => VERB_LEX.has(f) && !NOUN_LEX.has(f));
      const relaxed = si < slots.length - 1 && !s.fn && !s.art && !verbOnly;
      const ok = relaxed ? (t: string) => !FORBIDDEN_IN_GAP.has(t) : gapTokenStrict;
      for (let g = 1; g <= MAX_MOD_GAP; g++) {
        const at = pos + g;
        if (at >= n) break;
        const t = toks[pos + g - 1];
        if (hardBefore[pos + g - 1] || commaBefore[pos + g - 1] || !ok(t)) break;
        if (hardBefore[at] || commaBefore[at]) break;
        if (g === 1 && ARTICLES.has(t)) continue;   // 관사 단독 간극 = (b) 우회. 금지.
        if (slotAccepts(s, toks[at])) {
          const r = go(si + 1, at + 1, articleBudget);
          if (r >= 0) { flags.mod = true; noteSlot(s, toks[at], flags); return r; }
        }
      }
    }

    return -1;
  }

  const end = go(0, start, MAX_ARTICLE_INSERT);
  /**
   * 쉼표 구획 요구 — PARENTHETICAL_IDIOMS 주석 참조.
   * "that is"(=즉)는 삽입절이라 뒤에 쉼표가 온다. 이 검사가 없으면 관계절·지시대명사 주어
   * 287건이 관용구로 집계된다.
   */
  if (end >= 0 && pat.parenthetical && end < doc.toks.length && !doc.commaBefore[end]) return -1;
  return end;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 집계 (stats.ts 와 동일 수식)
// ─────────────────────────────────────────────────────────────────────────────
type Agg = {
  total: number;
  strict: number;
  separableHits: number;
  modifierHits: number;
  articleHits: number;
  contractHits: number;
  docs: Set<string>;
  byYear: Map<number, number>;
  byGrade: Map<string, number>;
  byType: Map<string, number>;
  byBoard: Map<string, number>;
  variants: Map<string, number>;
};
const mkAgg = (): Agg => ({
  total: 0, strict: 0, separableHits: 0, modifierHits: 0, articleHits: 0, contractHits: 0, docs: new Set(),
  byYear: new Map(), byGrade: new Map(), byType: new Map(), byBoard: new Map(), variants: new Map(),
});

const bumpMap = <K>(dst: Map<K, number>, src: Map<K, number>) => {
  for (const [k, v] of src) dst.set(k, (dst.get(k) ?? 0) + v);
};
/** 약한 증거 묶음(loose / possThe)을 본 집계에 편입한다. */
function mergeAgg(dst: Agg, src: Agg): void {
  dst.total += src.total; dst.strict += src.strict;
  dst.separableHits += src.separableHits; dst.modifierHits += src.modifierHits;
  dst.articleHits += src.articleHits; dst.contractHits += src.contractHits;
  for (const d of src.docs) dst.docs.add(d);
  bumpMap(dst.byYear, src.byYear); bumpMap(dst.byGrade, src.byGrade);
  bumpMap(dst.byType, src.byType); bumpMap(dst.byBoard, src.byBoard);
  bumpMap(dst.variants, src.variants);
}

/** 만 단어당 출현. 연도별 코퍼스 크기 차이를 제거한다. */
const per10k = (count: number, denom: number) => (denom > 0 ? (count / denom) * 10_000 : 0);

/** 최소제곱 기울기 — per10k 시계열의 연간 변화율. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

/** 최대 연속 미등장 구간(공백기). */
function longestGap(years: number[], present: Set<number>): { gap: number; from: number | null; to: number | null } {
  let best = 0, bf: number | null = null, bt: number | null = null;
  let cur = 0, start: number | null = null;
  for (const y of years) {
    if (present.has(y)) {
      if (cur > best) { best = cur; bf = start; bt = y; }
      cur = 0; start = null;
    } else {
      if (start === null) start = y;
      cur++;
    }
  }
  if (cur > best) { best = cur; bf = start; bt = null; }
  return { gap: best, from: bf, to: bt };
}

/** 분포 편중도 — 0(고름) ~ 1(한 축에 완전 집중). 정규화 엔트로피의 여집합. */
function skew(counts: number[], denoms: number[]): number {
  const rates = counts.map((c, i) => per10k(c, denoms[i]));
  const sum = rates.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const ps = rates.map((r) => r / sum).filter((p) => p > 0);
  if (ps.length <= 1) return 1;
  const H = -ps.reduce((a, p) => a + p * Math.log(p), 0);
  return 1 - H / Math.log(rates.length);
}

type Row = {
  surface: string;
  total: number; docs: number;
  per10kAll: number;
  byYear: Record<number, number>;
  per10kByYear: Record<number, number>;
  byGrade: Record<string, number>;
  per10kByGrade: Record<string, number>;
  gradeSkew: number;
  byType: Record<string, number>;
  typeSkew: number;
  topTypes: { typeGroup: string; per10k: number }[];
  byBoard: Record<string, number>;
  trendSlope: number;
  earlyPer10k: number;
  latePer10k: number;
  trendRatio: number | null;
  trendLabel: string;
  yearsPresent: number;
  longestGap: number;
  gapFrom: number | null;
  gapTo: number | null;
  // ── 구 전용 부가 필드 (단일 토큰 행에는 없다) ──
  isPhrase: true;
  pos: string[];
  slotCount: number;
  strictTotal: number;
  separableHits: number;
  modifierGapHits: number;
  contractionHits: number;
  looseSeparableHits: number;
  looseVariants: { form: string; n: number }[];
  /** 어휘 명사구 분리를 total 에 편입했는가(엄격 증거가 0일 때만 — §7b) */
  looseFolded: boolean;
  /** one's 슬롯이 정관사로 실현된 횟수 */
  possTheHits: number;
  /** 그 정관사 실현을 total 에서 **뺐는가**(지배적일 때만 — §8) */
  possTheDropped: boolean;
  /** 관사 교체(a/an↔the)로만 잡힌 횟수 */
  articleSubHits: number;
  /** 그 교체형을 total 에 편입했는가(강한 증거가 0일 때만) */
  articleSubFolded: boolean;
  articleFlexHits: number;
  strictPer10kAll: number;
  hasWildcard: boolean;
  headInflected: boolean;
  /** total===0 일 때 그 0 이 무엇인지: 진짜 부재 / 약한 증거만 존재 */
  zeroKind: "none" | "absent" | "weak-evidence-only";
  variants: { form: string; n: number }[];
};

const EARLY = YEARS.filter((y) => y <= 2012);
const LATE = YEARS.filter((y) => y >= 2020);

/**
 * 약한 증거 편입 규칙 — 두 계수 모두 "진짜지만 오탐과 형태가 같은" 매칭이다.
 * 무조건 넣으면 오탐이 들어오고, 무조건 빼면 **거짓 0회**가 생긴다. 그래서 행별로 판단한다.
 *
 *  (7b) 어휘 명사구 분리(looseHits): 엄격 증거가 하나도 없을 때만 편입한다.
 *       "take in"(엄격 22회)처럼 깨끗한 증거가 이미 있는 행은 분리형이 오탐일 가능성이 높으므로
 *       계속 제외한다(실측: take in 의 분리 매칭 67/87 이 오탐이었다). 반대로 "kick out"
 *       "scare away" "start off" 은 코퍼스 내 실현형이 분리형뿐이라 제외하면 곧 거짓 0회다
 *       (원문 확인: "malls kick teenagers out"(2026), "scare potential partners away"(2018),
 *        "fail to start the day off right"(2019) — 전부 진짜다).
 *
 *  (8) one's 슬롯의 정관사 실현(possTheHits): POSS_PRONOUNS 에 `the` 를 넣은 규칙은 양날이다.
 *      "through the eyes of an artist"(→through one's eyes) 는 이 규칙 덕에 잡히지만,
 *      "on one's side" 는 17회 중 15회가 "on the side of the stem/head/road" 같은 장소 표현으로
 *      원문 콘코던스 전수 확인 결과 관용구(~의 편) 실사용이 **0건**이었다.
 *      행별 안전장치: 정관사 실현이 지배적이면서(≥80%) 표본이 충분할 때(≥10회)만 뺀다.
 *      표본이 작으면 그 행의 유일한 증거일 수 있으므로 남긴다 — 거짓 0회를 만들지 않기 위해서다.
 */
const POSS_THE_DOMINANCE = 0.8;
const POSS_THE_MIN_SAMPLE = 10;

type Fold = { looseFolded: boolean; possTheDropped: boolean; artSubFolded: boolean };

function foldWeakEvidence(main: Agg, loose: Agg, possThe: Agg, artSub: Agg): Fold {
  const withThe = main.total + possThe.total;
  const possTheDropped =
    possThe.total > 0 && withThe >= POSS_THE_MIN_SAMPLE &&
    possThe.total / withThe >= POSS_THE_DOMINANCE;
  if (!possTheDropped) mergeAgg(main, possThe);
  // 관사 교체(a/an↔the)와 어휘 명사구 분리는 강한 증거가 0일 때만 편입한다.
  const artSubFolded = main.total === 0 && artSub.total > 0;
  if (artSubFolded) mergeAgg(main, artSub);
  const looseFolded = main.total === 0 && loose.total > 0;
  if (looseFolded) mergeAgg(main, loose);
  return { looseFolded, possTheDropped, artSubFolded };
}

function buildRow(pat: Pattern, a: Agg, loose: Agg, possThe: Agg, artSub: Agg, folded: Fold): Row {
  const byYear: Record<number, number> = {};
  const p10Year: Record<number, number> = {};
  for (const y of YEARS) {
    const c = a.byYear.get(y) ?? 0;
    byYear[y] = c;
    p10Year[y] = +per10k(c, totalWordsByYear.get(y) ?? 0).toFixed(4);
  }
  const xs = YEARS.slice();
  const ys = YEARS.map((y) => p10Year[y]);

  const earlyC = EARLY.reduce((n, y) => n + (a.byYear.get(y) ?? 0), 0);
  const earlyD = EARLY.reduce((n, y) => n + (totalWordsByYear.get(y) ?? 0), 0);
  const lateC = LATE.reduce((n, y) => n + (a.byYear.get(y) ?? 0), 0);
  const lateD = LATE.reduce((n, y) => n + (totalWordsByYear.get(y) ?? 0), 0);
  const e = per10k(earlyC, earlyD), l = per10k(lateC, lateD);
  const ratio = e > 0 ? l / e : null;

  let label = "안정";
  // ratio 는 EARLY(≤2012) 창이 비면 null 이다. 이때 LATE(≥2020) 창까지 비어 있어도
  // **총계가 0이 아니면 부재가 아니다** — 두 창 사이(2013~2019)에서만 나온 구다.
  // 그걸 "미등장" 으로 찍으면 실재하는 구가 산출물에서 없는 것으로 둔갑한다.
  if (ratio === null) label = l > 0 ? "신규 등장" : (a.total > 0 ? "중간기만 등장" : "미등장");
  else if (ratio >= 2) label = "급증";
  else if (ratio >= 1.3) label = "증가";
  else if (ratio <= 0.5) label = "급감";
  else if (ratio <= 0.77) label = "감소";
  // "미등장" 은 **진짜 부재**에만 쓴다. 약한 증거만 남은 행은 부재가 아니라 판정 보류다 —
  // 그 구별이 없으면 매칭 실패가 "이 표현은 안 쓰인다"는 결론으로 둔갑한다.
  if (a.total === 0 && (loose.total > 0 || possThe.total > 0 || artSub.total > 0)) label = "판정보류(약한 증거만)";

  const present = new Set([...a.byYear.entries()].filter(([, c]) => c > 0).map(([y]) => y));
  const gap = longestGap(YEARS, present);

  const byGrade: Record<string, number> = {};
  const p10Grade: Record<string, number> = {};
  for (const g of GRADES) {
    byGrade[g] = a.byGrade.get(g) ?? 0;
    p10Grade[g] = +per10k(byGrade[g], totalWordsByGrade.get(g) ?? 0).toFixed(4);
  }

  const types = [...totalWordsByType.keys()];
  const byType: Record<string, number> = {};
  for (const t of types) byType[t] = a.byType.get(t) ?? 0;
  const topTypes = types
    .map((t) => ({ typeGroup: t, per10k: +per10k(byType[t], totalWordsByType.get(t) ?? 0).toFixed(3) }))
    .sort((x, y) => y.per10k - x.per10k)
    .slice(0, 3);

  const byBoard: Record<string, number> = {};
  for (const [b, c] of a.byBoard) byBoard[b] = c;

  return {
    surface: pat.surface, total: a.total, docs: a.docs.size,
    per10kAll: +per10k(a.total, corpusWords).toFixed(4),
    byYear, per10kByYear: p10Year,
    byGrade, per10kByGrade: p10Grade,
    gradeSkew: +skew(GRADES.map((g) => byGrade[g]), GRADES.map((g) => totalWordsByGrade.get(g) ?? 0)).toFixed(4),
    byType, typeSkew: +skew(types.map((t) => byType[t]), types.map((t) => totalWordsByType.get(t) ?? 0)).toFixed(4),
    topTypes, byBoard,
    trendSlope: +slope(xs, ys).toFixed(5),
    earlyPer10k: +e.toFixed(4), latePer10k: +l.toFixed(4),
    trendRatio: ratio === null ? null : +ratio.toFixed(3),
    trendLabel: label,
    yearsPresent: present.size,
    longestGap: gap.gap, gapFrom: gap.from, gapTo: gap.to,
    isPhrase: true,
    pos: pat.posList,
    slotCount: pat.slots.length,
    strictTotal: a.strict,
    separableHits: a.separableHits,
    modifierGapHits: a.modifierHits,
    contractionHits: a.contractHits,
    looseSeparableHits: loose.total,
    looseVariants: [...loose.variants.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([form, n]) => ({ form, n })),
    looseFolded: folded.looseFolded,
    possTheHits: possThe.total,
    possTheDropped: folded.possTheDropped,
    articleSubHits: artSub.total,
    articleSubFolded: folded.artSubFolded,
    zeroKind: a.total > 0 ? "none"
      : (loose.total > 0 || possThe.total > 0 || artSub.total > 0 ? "weak-evidence-only" : "absent"),
    articleFlexHits: a.articleHits,
    strictPer10kAll: +per10k(a.strict, corpusWords).toFixed(4),
    hasWildcard: pat.hasWildcard,
    headInflected: pat.headInflected,
    variants: [...a.variants.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([form, n]) => ({ form, n })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. 실행
// ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const has = (n: string) => args.includes(`--${n}`);

const lemmasPath = flag("lemmas") ?? "experiments/vocab-corpus-20260728/build/lemmas.json";
const allowSeparable = !has("no-separable");

if (!fs.existsSync(lemmasPath)) {
  console.error(`표제어 파일 없음: ${lemmasPath}`);
  process.exit(2);
}
const lemmaFile = JSON.parse(fs.readFileSync(lemmasPath, "utf8")) as { lemmas: LemmaRec[] };

// 동사 어휘집 — 데이터에서 유도(외부 사전 없음)
const verbLex = VERB_LEX;
for (const l of lemmaFile.lemmas) {
  const t = lemmaTokens(l.lemma);
  if (l.pos === "verb" && t.length === 1) verbLex.add(t[0]);
  if (l.pos === "phrasal_verb" && t.length >= 2 && t[0] !== WILD) verbLex.add(t[0]);
  if (l.pos === "noun" && t.length === 1) NOUN_LEX.add(t[0]);
}
for (const v of Object.keys(IRREGULAR)) verbLex.add(v);
for (const v of ["let", "keep", "help", "try", "start", "stop", "turn", "look", "point", "work", "play", "move", "step", "hold", "open", "live", "stand", "fall", "set", "bring", "carry", "pick", "check", "figure", "hand", "hang", "pass", "pull", "push", "reach", "settle", "show", "sort", "sum", "take", "talk", "think", "throw", "wear", "wipe", "wrap", "write"]) verbLex.add(v);

// 다어절 표제어 수집(공백 + 하이픈 복합어 모두 — 둘 다 토크나이저에서 2토큰 이상이 된다)
const byPhrase = new Map<string, Set<string>>();
for (const l of lemmaFile.lemmas) {
  const key = l.lemma.trim().toLowerCase();
  if (lemmaTokens(key).filter((t) => t !== WILD).length < 2) continue;
  if (!byPhrase.has(key)) byPhrase.set(key, new Set());
  (byPhrase.get(key) as Set<string>).add(l.pos);
}

const patterns: Pattern[] = [];
const uncompilable: string[] = [];
let id = 0;
for (const [surface, posSet] of byPhrase) {
  const p = compile(surface, [...posSet], verbLex, allowSeparable, id);
  if (!p) { uncompilable.push(surface); continue; }
  patterns.push(p); id++;
}

// 머리 토큰 색인 — 코퍼스 위치당 후보 패턴만 검사한다
const headIndex = new Map<string, Pattern[]>();
for (const p of patterns) {
  for (const h of p.heads) {
    if (!headIndex.has(h)) headIndex.set(h, []);
    (headIndex.get(h) as Pattern[]).push(p);
  }
}

/** 본 집계 / 어휘 명사구 분리 / one's→정관사 실현 — 세 묶음을 따로 쌓고 행 단위로 편입 판정한다. */
const aggs: Agg[] = patterns.map(() => mkAgg());
const aggsLoose: Agg[] = patterns.map(() => mkAgg());
const aggsThe: Agg[] = patterns.map(() => mkAgg());
const aggsArt: Agg[] = patterns.map(() => mkAgg());
const lastEnd = new Int32Array(patterns.length);
const lastEndLoose = new Int32Array(patterns.length);

const t0 = Date.now();
for (const d of DOCS) {
  lastEnd.fill(-1);
  lastEndLoose.fill(-1);
  const grade = d.meta.grade ?? "(미상)";
  const { toks } = d;
  for (let i = 0; i < toks.length; i++) {
    const cands = headIndex.get(toks[i]);
    if (!cands) continue;
    for (const pat of cands) {
      if (i < lastEnd[pat.id]) continue;      // 같은 패턴의 중복(겹침) 계수 방지
      const flags: MatchFlags = {
        article: false, gap: false, wild: false, loose: false,
        mod: false, possThe: false, contract: false, artSub: false,
      };
      const end = matchAt(d, i, pat, flags);
      if (end < 0) continue;
      // 어휘 명사구 분리는 별도 묶음으로 — 오탐과 형태가 같아 무조건 편입할 수 없다
      if (flags.loose) {
        if (i < lastEndLoose[pat.id]) continue;
        lastEndLoose[pat.id] = end;
      } else {
        lastEnd[pat.id] = end;
        lastEndLoose[pat.id] = end;
      }
      const a = flags.loose ? aggsLoose[pat.id]
        : flags.possThe ? aggsThe[pat.id]
          : flags.artSub ? aggsArt[pat.id]
            : aggs[pat.id];
      a.total++;
      if (flags.gap) a.separableHits++; else a.strict++;
      if (flags.mod) a.modifierHits++;
      if (flags.article) a.articleHits++;
      if (flags.contract) a.contractHits++;
      a.docs.add(d.meta.id);
      bump(a.byYear, d.meta.year);
      bump(a.byGrade, grade);
      bump(a.byType, d.meta.typeGroup);
      bump(a.byBoard, d.meta.board);
      bump(a.variants, toks.slice(i, end).join(" "));
    }
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const folds = patterns.map((_, i) => foldWeakEvidence(aggs[i], aggsLoose[i], aggsThe[i], aggsArt[i]));
const rows = patterns
  .map((p, i) => buildRow(p, aggs[i], aggsLoose[i], aggsThe[i], aggsArt[i], folds[i]))
  .sort((a, b) => b.total - a.total);
const zeroRows = rows.filter((r) => r.total === 0);
const sepTotal = rows.reduce((n, r) => n + r.separableHits, 0);
const modTotal = rows.reduce((n, r) => n + r.modifierGapHits, 0);
const contrTotal = rows.reduce((n, r) => n + r.contractionHits, 0);
const looseTotal = rows.reduce((n, r) => n + r.looseSeparableHits, 0);
const looseFolded = rows.filter((r) => r.looseFolded).length;
const artSubTotal = rows.reduce((n, r) => n + r.articleSubHits, 0);
const artSubFolded = rows.filter((r) => r.articleSubFolded).length;
const theTotal = rows.reduce((n, r) => n + r.possTheHits, 0);
const theDropped = rows.filter((r) => r.possTheDropped);
const artTotal = rows.reduce((n, r) => n + r.articleFlexHits, 0);
const hitTotal = rows.reduce((n, r) => n + r.total, 0);
const zeroWeak = zeroRows.filter((r) => r.zeroKind === "weak-evidence-only").length;

console.error(
  `코퍼스 지문 ${DOCS.length} · ${corpusWords.toLocaleString()}단어 | 구 ${patterns.length}개 컴파일` +
  (uncompilable.length ? ` (컴파일 불가 ${uncompilable.length})` : "") +
  ` | 매칭 ${hitTotal.toLocaleString()}회 · 0회 ${zeroRows.length}개 · ${elapsed}s`,
);
console.error(
  `  느슨한 매칭 비중: 분리 구동사 ${sepTotal.toLocaleString()}회(${(sepTotal / Math.max(hitTotal, 1) * 100).toFixed(1)}%)` +
  ` · 수식어 간극 ${modTotal.toLocaleString()}회(${(modTotal / Math.max(hitTotal, 1) * 100).toFixed(1)}%)` +
  ` · 관사 복원 ${artTotal.toLocaleString()}회 · 축약형 ${contrTotal.toLocaleString()}회` +
  ` · separable=${allowSeparable ? "ON" : "OFF"}`,
);
console.error(
  `  약한 증거 판정: 어휘 명사구 분리 ${looseTotal.toLocaleString()}회 중 ${looseFolded}개 행만 편입` +
  ` · 관사 교체 ${artSubTotal.toLocaleString()}회 중 ${artSubFolded}개 행만 편입 (둘 다 강한 증거 0인 행 한정)` +
  ` · one's→정관사 ${theTotal.toLocaleString()}회 중 ${theDropped.length}개 행 제외` +
  (theDropped.length ? ` [${theDropped.map((r) => r.surface).join(", ")}]` : ""),
);
console.error(
  `  0회 ${zeroRows.length}개 = 진짜 부재 ${zeroRows.length - zeroWeak}개 + 약한 증거만 ${zeroWeak}개(라벨 "판정보류")`,
);

// ── 조회 모드 ────────────────────────────────────────────────────────────
const one = flag("phrase");
if (one) {
  const key = one.trim().toLowerCase();
  const r = rows.find((x) => x.surface === key);
  if (!r) { console.error(`표제어 목록에 없음: ${one}`); process.exit(1); }
  console.log(`\n=== ${r.surface}  [${r.pos.join(",")}]`);
  console.log(`  총 ${r.total}회 (엄격 ${r.strictTotal} / 분리 ${r.separableHits} / 관사복원 ${r.articleFlexHits}) · ${r.docs}개 지문 · 만단어당 ${r.per10kAll}`);
  console.log(`  추세: ${r.trendLabel} (초기 ${r.earlyPer10k} → 최근 ${r.latePer10k}, 배율 ${r.trendRatio ?? "N/A"}, 기울기 ${r.trendSlope})`);
  console.log(`  등장 연도 ${r.yearsPresent}/${YEARS.length} · 최장 공백 ${r.longestGap}년`);
  console.log(`  학년 편중 ${r.gradeSkew} — ` + GRADES.map((g) => `${g} ${r.per10kByGrade[g]}`).join(" / "));
  console.log(`  유형 편중 ${r.typeSkew} — 상위 ` + r.topTypes.map((t) => `${t.typeGroup}(${t.per10k})`).join(" "));
  console.log(`  실현형: ` + (r.variants.map((v) => `${v.form}(${v.n})`).join(" · ") || "(없음)"));
  console.log(`  연도별(만단어당):`);
  console.log("   " + YEARS.map((y) => `${y}:${r.per10kByYear[y] || "·"}`).join(" "));
  process.exit(0);
}

const zero = flag("zero");
if (zero) {
  const n = Number(zero);
  console.log(`\n=== 0회 구 ${zeroRows.length}개 중 ${Math.min(n, zeroRows.length)}개 ===`);
  for (const r of zeroRows.slice(0, n)) {
    console.log(
      `  ${r.surface.padEnd(26)} [${r.pos.join(",")}]${r.hasWildcard ? " (와일드카드)" : ""}` +
      (r.looseSeparableHits ? `  ← 명사구 분리형으로만 ${r.looseSeparableHits}회: ${r.looseVariants.map((v) => v.form).join(", ")}` : ""),
    );
  }
  process.exit(0);
}

const top = flag("top");
if (top) {
  const n = Number(top);
  const sig = rows.filter((r) => r.total >= 12);
  const show = (title: string, list: Row[]) => {
    console.log(`\n=== ${title} ===`);
    for (const r of list) {
      console.log(
        `  ${r.surface.padEnd(26)} 총${String(r.total).padStart(5)} ` +
        `초기 ${String(r.earlyPer10k).padStart(7)} → 최근 ${String(r.latePer10k).padStart(7)} ` +
        `(×${r.trendRatio ?? "N/A"}) ${r.trendLabel}`,
      );
    }
  };
  show(`최근 급증 상위 ${n}`, sig.filter((r) => r.trendRatio !== null).sort((a, b) => (b.trendRatio ?? 0) - (a.trendRatio ?? 0)).slice(0, n));
  show(`최근 급감 상위 ${n}`, sig.filter((r) => r.trendRatio !== null && r.earlyPer10k > 0).sort((a, b) => (a.trendRatio ?? 9e9) - (b.trendRatio ?? 9e9)).slice(0, n));
  show(`학년 편중 상위 ${n}`, sig.slice().sort((a, b) => b.gradeSkew - a.gradeSkew).slice(0, n));
  show(`유형 편중 상위 ${n}`, sig.slice().sort((a, b) => b.typeSkew - a.typeSkew).slice(0, n));
  process.exit(0);
}

const out = flag("out");
if (!out) { console.error("usage: --out=<파일> | --phrase=<구> | --top=<N> | --zero=<N> [--no-separable] [--lemmas=<path>]"); process.exit(2); }

/**
 * 실현형 → 사전형 역색인. build 의 quantFor 는 추출물의 `surface`(굴절형: "led to")로
 * 조회하는데 이 파일의 행 키는 사전형("lead to")이다. 이 색인이 그 간극을 메운다.
 */
const aliasIndex: Record<string, string> = {};
for (const r of rows) {
  for (const v of r.variants) if (!(v.form in aliasIndex)) aliasIndex[v.form] = r.surface;
  aliasIndex[r.surface] = r.surface;
}

fs.writeFileSync(out, JSON.stringify({
  meta: {
    generatedFrom: "src/data/exam-passages/passages.json",
    lemmasFrom: lemmasPath,
    passages: DOCS.length, corpusWords,
    phrases: patterns.length,
    matched: patterns.length - zeroRows.length,
    zeroMatch: zeroRows.length,
    uncompilable,
    years: YEARS, earlyWindow: EARLY, lateWindow: LATE,
    wordsByYear: Object.fromEntries(totalWordsByYear),
    wordsByGrade: Object.fromEntries(totalWordsByGrade),
    passagesByYear: Object.fromEntries(passagesByYear),
    separableEnabled: allowSeparable,
    separableHits: sepTotal,
    looseSeparableHits: looseTotal,
    articleFlexHits: artTotal,
    totalHits: hitTotal,
    // ── 약한 증거 계수(행별 편입 판정 결과) ──
    modifierGapHits: modTotal,
    contractionHits: contrTotal,
    articleSubHits: artSubTotal,
    possTheHits: theTotal,
    looseFoldedRows: looseFolded,
    articleSubFoldedRows: artSubFolded,
    possTheDroppedRows: theDropped.map((r) => r.surface),
    /** 0회의 내역 — 진짜 부재와 매칭 실패를 구별해서 싣는다. */
    zeroAbsent: zeroRows.length - zeroWeak,
    zeroWeakEvidenceOnly: zeroWeak,
    note:
      "행 형상은 stats.json 과 동일(surface 자리에 구). 모든 per10k 는 해당 축의 코퍼스 크기로 " +
      "정규화된 값이며 분모는 stats.json 과 바이트 단위로 같다. 원시 빈도로 추세를 논하지 말 것. " +
      "매칭 규범(동사 굴절·one's/oneself 슬롯·관사 복원·분리 구동사·와일드카드)은 스크립트 상단 주석 참조. " +
      "느슨한 매칭은 separableHits/modifierGapHits/articleFlexHits/contractionHits 로 분리 계수했고, " +
      "strictTotal/strictPer10kAll 로 느슨한 매칭을 뺀 값도 함께 제공한다. " +
      "'진짜지만 오탐과 형태가 같은' 세 계수(looseSeparableHits: 'kick teenagers out' / " +
      "articleSubHits: a·an↔the 교체 / possTheHits: one's→정관사)는 **행별로** 편입을 판정한다 — " +
      "앞의 둘은 그 행에 강한 증거가 0일 때만 total 에 넣고(거짓 0회 방지), possTheHits 는 " +
      "지배적일 때만(≥80%·표본≥10) 뺀다. 판정 결과는 행의 looseFolded/articleSubFolded/possTheDropped 로 노출된다. " +
      "trendLabel 의 '미등장' 은 총계 0에만 붙는다. 약한 증거만 있으면 '판정보류(약한 증거만)', " +
      "EARLY/LATE 두 창 사이에서만 나오면 '중간기만 등장' 이다 — 라벨이 부재를 단언하면 " +
      "매칭 실패가 곧 '이 표현은 안 쓰인다'는 연구 결론으로 둔갑한다. zeroKind 로도 같은 구별을 싣는다.",
  },
  aliasIndex,
  rows,
}, null, 1));
console.error(`→ ${out} (${rows.length.toLocaleString()}행, ${(fs.statSync(out).size / 1e6).toFixed(1)}MB)`);
