/**
 * 기출 단어 코퍼스 — 기계 검증 게이트
 *
 * docs/vocab-corpus-spec.md §9 의 기계 게이트를 집행한다. 에이전트 검수를 태우기
 * 전에 이걸로 먼저 거른다(기계가 후보를 좁히고, 에이전트는 판단만 한다).
 *
 * 사용법:
 *   npx tsx scripts/verify-vocab-corpus.ts --dir=experiments/vocab-corpus-20260728/exemplar
 *   npx tsx scripts/verify-vocab-corpus.ts --dir=… --json=report.json   # 기계 리포트 산출
 *   npx tsx scripts/verify-vocab-corpus.ts --dir=… --selftest           # 계기 음성테스트
 *
 * 종료코드: critical 이슈가 하나라도 있으면 1.
 */
import fs from "node:fs";
import path from "node:path";
import { splitPassageIntoSentences } from "@/lib/vocab-corpus/sentences";
import PASSAGES from "@/data/exam-passages/passages.json";

// ── 스펙 고정 목록 (docs/vocab-corpus-spec.md §3 §4 §7) ────────────────
const POS = new Set(["noun", "verb", "adjective", "adverb", "preposition", "conjunction", "phrasal_verb", "idiom", "collocation"]);
const TIER = new Set(["basic", "core", "advanced", "academic"]);
const TRAP = new Set(["polysemy", "form-confusion", "false-friend", "collocation", "register", "negation", "syntax"]);
const INFLECTION = new Set(["base", "plural", "possessive", "comparative", "superlative", "past", "past_participle", "present_participle", "gerund", "third_person_singular"]);
const ENTRY_KEYS = ["surface", "lemma", "pos", "senseKo", "senseEn", "sentenceIndex", "example", "exampleKo", "inflection", "tier", "difficulty", "trap", "collocation", "confusable"];

/**
 * 밀도 기준 (SPEC §4.2).
 *
 * `DENSITY_FLOOR` 는 스펙에 박힌 절대 하한이고, `DENSITY_REFERENCE` 는 **실측 레퍼런스**다.
 * 2026-07-28 기준 정상 추출 334건(고1 261 / 고2 72)의 항목/단어 밀도 분포:
 *   min 0.180 · p05 0.201 · p25 0.222 · median 0.243 · p75 0.269 · p95 0.312 · max 0.429
 * 즉 **334건 중 단 한 건도 0.18 아래로 내려가지 않았다.** 하한 0.15 는 그보다 20% 낮아
 * 과소추출을 잡지 못한다(실측: 0.178 이 통과). 0.18 을 참조선으로 둔다.
 *
 * ⚠️ 레퍼런스에 고3·220단어 이상 표본이 아직 없다. 그 구간이 채워지면 재산출할 것.
 *    재산출 방법: raw/*.json 의 entries.length / passages.json 의 wordCount 분위수.
 */
const DENSITY_FLOOR = 0.15;
const DENSITY_REFERENCE = 0.18;
const DENSITY_REF_N = 334;
const DENSITY_REF_MEDIAN = 0.243;

/**
 * trap 비율 상한 (SPEC §7.1).
 *
 * 0.50 → 0.25 로 내린다. 근거는 실측이다.
 * 2026-07-29 raw 744파일의 trap 비율 분포:
 *   min 0.125 · p25 0.333 · median 0.375 · p75 0.414 · p95 0.457 · **max 0.500**
 *
 * ⚠️ 최댓값이 하필 상한과 **소수점까지 정확히 일치한다.** 이건 지문이 건전해서 0건이
 *    걸린 게 아니라 산출이 상한을 **지킨 게 아니라 겨냥했다**는 증거다. 즉 구 상한 0.50 은
 *    게이트가 아니라 목표선으로 작동했다(744파일 중 초과 0건 — 게이트가 침묵한 이유).
 * 전 코퍼스 실측 trap 비율은 37.0%(8,676/23,495)다. 0.25 로 내리면 707/744(95.0%)가 걸린다.
 * 그 707건은 "전부 불량"이 아니라 **가짜 함정 41.4%(감사 표본 70건 중 29건)를 덜어내면
 * 도달하는 선**이다. 37.0% × (1 − 0.414) ≈ 21.7% — 25% 는 그 위에 여유를 둔 값이다.
 */
const TRAP_RATIO_MAX = 0.25;

/**
 * TRAP_TEMPLATE_REPEAT 임계값 — 같은 lemma 의 trap.note 가 같은 오독어를 재탕하는가.
 *
 * 근거(실측): lemma `even` 의 trap 22건 중 오독어가 '평평/짝수' 계열인 것이 **10건(45.5%)**.
 * `even` 은 코퍼스 전 용례가 부사 자리라 형용사 '평평한' 독해가 통사적으로 불가능한데도
 * 같은 오독어를 10번 복사했다 — 감사가 재현 확인한 템플릿 복사의 물증이다.
 * 따라서 이 증거를 잡으려면 ratio ≤ 0.455 이고 hits ≤ 10 이어야 한다.
 * 그 조건 아래에서 가장 타이트한(=오탐이 적은) 조합이 hits≥5 & ratio≥0.4 다.
 *
 * 산출량: 217 lemma / 2,164 note = 전체 trap 의 24.9%.
 * 감사가 손으로 센 가짜 비율은 41.4% 였다 → 이 검사는 **하한(보수적 과소검출)** 이다.
 *   · 반복이 없는 1회성 가짜는 원리상 못 잡는다. 감사가 지목한 pioneer·filter·nearly·
 *     former·office 는 코퍼스 전역 trap 이 3건 미만이라 여기서 걸리지 않는다.
 *   · 반대로 걸린 것이 전부 가짜라는 뜻도 아니다. severity=major(경고) 인 이유다.
 * MIN_TRAPS 는 "3건 중 2건 일치" 같은 통계적 무의미를 걸러내는 최소 표본이다.
 */
const TRAP_TEMPLATE_MIN_TRAPS = 5;
const TRAP_TEMPLATE_MIN_HITS = 5;
const TRAP_TEMPLATE_MIN_RATIO = 0.4;

/**
 * SENSE_EN_CONTEXT_LEAK 임계값 — 정의문이 예문의 내용어를 몇 개나 베꼈는가.
 *
 * ⚠️ severity=minor 다. 올리지 마라. 실측 오탐률이 ~80% 다(아래 근거).
 * DEFINITIONAL_VOCAB 필터를 적용한 뒤 겹침 2개 이상 = 54항목/23,495(0.23%)이 걸리는데,
 * 그중 손으로 확인한 29건의 내역은 다음과 같다:
 *   · 진짜 누출 4~6건 — self-regulate "control one's own **attention** and impulsive behavior",
 *     carbon "…taken in or **stored by natural systems**", fold "to bend the **arms** … across the body"
 *   · 정당한 사전 정의 23건 — market "a system in which goods are bought and sold",
 *     microwave "an electromagnetic wave…", prism, treadmill, juggling, adult, decline …
 *     정의문이 예문의 단어를 쓰는 게 **정상인** 경우다(스펙이 경고한 quantify/quantity 유형).
 *
 * ⚠️ 더 중요한 한계 — 이 검사는 **감사가 지목한 3건을 하나도 못 잡는다.**
 *     member  "a person who belongs to a legislative body" ↔ 예문 "…work for members of Congress."
 *     get     "to obtain thoughts or suggestions from something" ↔ 예문 "…you get ideas."
 *     housing "the cost of having a place in which to live" ↔ 예문 "…taken away for taxes, housing, and food."
 *   셋 다 예문과 겹치는 내용어가 **0개**다. 누출이 축자 복사가 아니라 **의역**이기 때문이다
 *   (ideas→thoughts or suggestions, Congress→legislative body, 30% of salaries→cost).
 *   즉 어휘 겹침 방식은 원리상 이 결함군을 못 본다. 이 검사는 대체재가 아니라 **보조 신호**다.
 */
const SENSE_EN_LEAK_MIN_SHARED = 2;

/** SPEC §7.4 금칙 — trap.note 에 들어가면 안 되는 것. */
const NOTE_BANNED: { re: RegExp; why: string }[] = [
  { re: /\d+\s*번\s*(문항|문제)|정답\s*근거|보기\s*[①-⑤]/, why: "시험지 참조" },
  { re: /\/[a-zɑɔəɛɪʊʌθðʃʒŋˈˌ:ː\s]+\//, why: "발음기호" },
  { re: /수미상관|미끄러짐/, why: "문학·번역투 용어" },
  { re: /\d형식\s*동사|목적격\s*보어|분사구문/, why: "어법 구조 강의" },
];

/** 한국어 어간 근사 — 활용어미를 떼어 trap.note 자기부정 검사에 쓴다. */
function koStem(s: string): string {
  const t = s.replace(/~/g, "").trim();
  return t.replace(/(하다|되다|시키다|스럽다|롭다|답다|한|한\s|하게|히|이|의|을|를|은|는)$/u, "").trim();
}

/**
 * senseKo 가 문장 해석과 같은 뜻을 가리키는지 **아주 느슨하게** 확인한다.
 *
 * ⚠️ 이 검사는 severity=minor 다. 절대 major 로 올리지 마라.
 * v3 파일럿에서 7기 중 6기가 이 검사를 "가장 어려운 조항"으로 지목했고, 실제로
 * **검사를 통과시키려고 뜻을 비트는 왜곡**이 실측됐다:
 *   lose  잃다 → 잃어버리다   (스펙 §3.5.2 가 '잃다'를 정답으로 명시한 것인데도)
 *   reduce 줄이다 → 감소시키다  build 쌓다 → 구축하다  touch 닿다 → 스치다
 *   feel  '느끼다'가 어떤 자연스러운 해석과도 안 겹쳐 **항목 자체가 삭제됨**
 * 한국어 용언은 활용이 어간 말음절을 삼킨다(줄이+었 → 줄였). 문자열 대조로는 원리상 불가능하다.
 * 목적은 `고려하다` vs 해석 `생각해 보라` 처럼 **아예 딴 말**인 경우만 참고 신호를 주는 것이다.
 *
 * 매칭: 어미(-다)를 떼고 **말음절까지 떨어낸 접두부**로 대조해 활용을 흡수한다.
 */
function koOverlaps(senseKo: string, ko: string): boolean {
  const t = senseKo.replace(/[~\s]/g, "");
  if (t.length === 0) return true;
  const stem = t.replace(/다$/u, "");
  const probes = new Set<string>([t, stem]);
  if (stem.length >= 2) probes.add(stem.slice(0, -1)); // 활용으로 바뀌는 말음절을 떨어낸다
  if (stem.length >= 3) probes.add(stem.slice(0, -2));
  for (const p of probes) if (p.length >= 1 && ko.includes(p)) return true;
  return false;
}

/** 문장의 단어 수 — §6.1 의 40단어 기준. */
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// ── ADJ_NOUN_PAIR_MISSING 보조 ─────────────────────────────────────────
/** 영어 단복수 정규화(근사). collocation 의 명사와 항목 표제어를 맞대볼 때만 쓴다. */
function singularEn(w: string): string {
  const s = w.toLowerCase();
  if (/(ss|us|is|ics)$/.test(s)) return s;                              // business, focus, analysis, physics
  if (/ies$/.test(s) && s.length > 4) return `${s.slice(0, -3)}y`;      // cities → city
  if (/(ches|shes|xes|zes|sses)$/.test(s)) return s.slice(0, -2);       // boxes → box
  if (/ves$/.test(s) && s.length > 4) return `${s.slice(0, -3)}f`;      // leaves → leaf
  if (/s$/.test(s) && s.length > 3) return s.slice(0, -1);              // gems → gem
  return s;
}

/**
 * **짝 명사 자리에 올 수 없는 말** — 형용사+전치사를 형용사+명사로 오판하는 것을 막는다.
 *
 * 【실측 오탐 2026-07-30】 이 검사가 major 21건을 보고했는데 **11건이 오탐**이었다:
 *   `different from`→"from" · `natural to`→"to" · `packed with`→"with" · `clothed in`→"in"
 *   `full of`→"of" · `enough to` · `characteristic of` · `inherent in` · `suitable to`
 *   `subject to` · `crucial for`
 * 전부 형용사+전치사인데 두 번째 토큰이 `/^[A-Za-z][A-Za-z-]*$/` 를 통과해 "짝 명사"로 잡혔다.
 * 이 상태로 수리를 지시하면 에이전트가 **`from`·`to`·`with` 를 표제어 항목으로 만들어** 코퍼스를
 * 오염시킨다 — 게이트를 맞추려고 데이터를 비트는 그 실패 유형이다(§7.1 과 같은 계열).
 * 남은 10건(health·writer·science·job·skill·change·history·service·thing·name)만 진짜 짝 의무다.
 */
const ADJ_PAIR_NON_NOUN = new Set(
  `about above across after against along among around at before behind below beneath beside besides between
   beyond but by despite down during except for from in inside into like near of off on onto out outside over
   past per since than that through throughout till to toward towards under underneath until unto up upon via
   with within without and or nor if as so too very not no enough`
    .split(/\s+/),
);

// ── SENSE_EN_CONTEXT_LEAK 보조 ─────────────────────────────────────────
/** 기능어 — 겹쳐도 아무 정보가 없다. */
const EN_STOP = new Set(
  `a an the of to in on at by for with from into onto over under about as is are was were be been being am
   do does did done have has had having will would can could shall should may might must not no nor and or but
   if then than that this these those it its they them their there here what which who whom whose when where why how
   all any both each few more most other some such only own same so too very now i you your he she his her we us our me my`
    .split(/\s+/),
);

/** 어미 절단(근사) — quantify/quantified 처럼 활용만 다른 것을 같은 것으로 본다. */
function stemEn(w: string): string {
  for (const suf of ["ations", "ation", "ings", "ing", "ies", "ied", "ers", "er", "est", "ed", "es", "ly", "s"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
  }
  return w;
}
const contentStems = (s: string): string[] =>
  (s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []).filter((w) => w.length > 2 && !EN_STOP.has(w)).map(stemEn);

/**
 * **정의문 상용어** — 사전 정의가 정당하게 쓰는 어휘. 겹쳐도 누출이 아니다.
 *
 * 손으로 고른 목록이 아니라 **코퍼스 자신에게서 측정한 것**이다: raw 744파일 23,495개
 * senseEn 중 **0.4% 이상(≥94개 정의문)에 등장하는 어간 272개**. 즉 "이 코퍼스의 정의문들이
 * 공통으로 쓰는 말"이고, 그런 말이 예문에도 있는 건 우연이지 지문 누출이 아니다.
 * (상위: someth 25.0% · particular 9.6% · someone 8.4% · used 7.9% · person 7.4% · thing 6.4% …)
 * 재산출: senseEn 을 contentStems 로 쪼개 문서빈도 ≥0.004 인 것만 남긴다.
 */
const DEFINITIONAL_VOCAB = new Set(
  `ability able accept achiev achieve act action activity add affect after air already amount animal anoth area
   attention available aware away back because becom become before begin belief belong bett between body bring build
   careful carr carry case caus cause certain change clear close come complete condition connect consid consider
   contain continu continue contrast control course deal degree develop different difficult difficulty direct discov
   doing during easi effect effort else end energy enough especial event every exact exist expect experience extreme
   fact feel find first follow food force form gain general give given good gradual great group grow happen hard harm
   help high hold idea important inform intend introduce involv job just keep kind know knowledge known larg large
   later learn less level life like limit little live living long look made main make making mann many material matt
   mean memb mental mention method mind money move moving much name natural necessary need new noth notice numb object
   obtain occasion often one one' opinion order organiz other out part particular pass past people perform period
   person person' physical piece place plan plann plant point position possible power practice present problem proces
   produc produce public purpose put qualit quality rath reach real reason regard regular relat remain requir result
   role rule said say see separate set several shar short show single situ size skill small someone someth sound space
   standard start stat state statement stay stop strong study subject substance successful support surface system take
   task thing think thought through time togeth toward true two understand use used useful using usual value want water
   way well whole within without word work writ written`
    .split(/\s+/),
);

// ── TRAP_TEMPLATE_REPEAT 보조 ──────────────────────────────────────────
/**
 * trap.note 에서 **오독어(X)** 를 뽑는다 — "학생이 X 로 읽어 Y 를 놓친다"의 X.
 *
 * 실측 8,676건 중 **7,711건(88.9%)** 에서 추출된다. 못 뽑은 11%는 검사 대상에서 빠질 뿐
 * 오검출을 만들지 않는다(분모에서도 제외된다).
 * 우선순위: ① "…로 읽어" 앞 구간에 인용부호가 있으면 그 안이 오독어
 *          ② 없으면 앞머리의 '학생이'·영어 표제어(예: "even을")를 떼어낸 나머지
 */
function extractMisreading(note: string): string | null {
  const m = note.match(/^(.*?)(?:으로|로)\s*(?:읽|이해|해석|받아들|착각|보아|봐)/u);
  if (!m) return null;
  const seg = m[1];
  const quoted = [...seg.matchAll(/['‘"“]([^'’"”]{1,20})['’"”]/gu)];
  if (quoted.length) return quoted[quoted.length - 1][1];
  return (
    seg
      .replace(/^학생이\s*/u, "")
      .replace(/^[A-Za-z][A-Za-z\s'-]*[을를은는이가]\s*/u, "") // "even을", "make를"
      .replace(/\s*(뜻|의미|것)$/u, "")
      .trim() || null
  );
}

/** 오독어 정규화 — 조사·어미를 떼어 '평평한'/'평평하게'/'평평'을 한 덩어리로 본다. */
function normalizeMisreading(x: string): string {
  return x
    .replace(/[\s'’‘"“”~·、,./()]/gu, "")
    .replace(/^(단순|그냥|단지|흔한|보통|일반적인|그저)/u, "")
    .replace(/(으로|로|라는|이라는|에|의|은|는|이|가|을|를|도|만|와|과|나|이나)$/u, "")
    .replace(/(하다|되다|이다|한다|하는|되는|인|한|의)$/u, "");
}

/** 조사 잔재라 어떤 오독어에나 붙는 2음절 — 군집 키로 쓰면 전부 한 덩어리가 된다. */
const GRAM_NOISE = new Set(["에해", "해서", "하여", "여기", "이것", "그것", "무엇", "하고", "이고"]);

/** 정규화된 오독어들에서 가장 큰 공통 2음절 군집을 찾는다. */
function largestMisreadingCluster(xs: string[]): { gram: string; members: number[] } {
  const index = new Map<string, Set<number>>();
  xs.forEach((x, i) => {
    const n = normalizeMisreading(x);
    const grams = new Set<string>();
    for (let k = 0; k + 2 <= n.length; k++) {
      const g = n.slice(k, k + 2);
      if (/^[가-힣]{2}$/.test(g) && !GRAM_NOISE.has(g)) grams.add(g);
    }
    if (grams.size === 0 && /^[가-힣]+$/.test(n) && n.length > 0) grams.add(n); // '길'·'일' 같은 1음절 오독어
    for (const g of grams) {
      if (!index.has(g)) index.set(g, new Set());
      index.get(g)!.add(i);
    }
  });
  let gram = "";
  let members = new Set<number>();
  for (const [g, s] of index) if (s.size > members.size) { members = s; gram = g; }
  return { gram, members: [...members] };
}

type Severity = "critical" | "major" | "minor";
type Issue = { severity: Severity; code: string; detail: string };

const norm = (s: string) => s.replace(/\s+/g, "");
const passageById = new Map<string, { id: string; text: string }>(
  (PASSAGES as unknown as { id: string; text: string }[]).map((p) => [p.id, p]),
);

export function verifyDoc(doc: unknown, sourceLabel: string): Issue[] {
  const out: Issue[] = [];
  const crit = (code: string, detail: string) => out.push({ severity: "critical", code, detail });
  const major = (code: string, detail: string) => out.push({ severity: "major", code, detail });

  if (typeof doc !== "object" || doc === null) { crit("NOT_OBJECT", sourceLabel); return out; }
  const d = doc as Record<string, unknown>;

  const passageId = d.passageId;
  if (typeof passageId !== "string") { crit("NO_PASSAGE_ID", sourceLabel); return out; }
  const passage = passageById.get(passageId);
  if (!passage) { crit("UNKNOWN_PASSAGE", `${passageId} 는 코퍼스에 없다`); return out; }

  // ── 문장 배열 ──────────────────────────────────────────────────────
  const sentences = d.sentences;
  if (!Array.isArray(sentences) || sentences.length === 0) { crit("NO_SENTENCES", passageId); return out; }
  const sents: { en: string; ko: string }[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i] as Record<string, unknown>;
    if (typeof s?.en !== "string" || typeof s?.ko !== "string") { crit("SENTENCE_SHAPE", `${passageId} sentences[${i}] en/ko 문자열 아님`); return out; }
    if (s.i !== i) major("SENTENCE_INDEX", `${passageId} sentences[${i}].i=${String(s.i)} (인덱스 불일치)`);
    if (norm(s.ko).length === 0) crit("EMPTY_KO", `${passageId} sentences[${i}].ko 비어 있음`);
    if (!/[가-힣]/.test(s.ko)) crit("KO_NOT_KOREAN", `${passageId} sentences[${i}].ko 에 한글이 없다`);
    sents.push({ en: s.en, ko: s.ko });
  }

  // 불변식 1: 문장 재결합 = 원문 (비공백 비교)
  const rejoined = norm(sents.map((s) => s.en).join(""));
  if (rejoined !== norm(passage.text)) {
    crit("TEXT_MISMATCH", `${passageId} 문장 재결합이 원문과 다르다 (len ${rejoined.length} vs ${norm(passage.text).length})`);
  }
  // 참고: 표준 분리기 결과와 문장 수가 크게 다르면 경고(경계 판단이 크게 어긋난 신호)
  const expected = splitPassageIntoSentences(passage.text).length;
  if (Math.abs(expected - sents.length) > Math.max(2, expected * 0.4)) {
    major("SENTENCE_COUNT", `${passageId} 문장 ${sents.length}개 (표준 분리기 ${expected}개)`);
  }

  // ── 항목 배열 ──────────────────────────────────────────────────────
  const entries = d.entries;
  if (!Array.isArray(entries) || entries.length === 0) { crit("NO_ENTRIES", passageId); return out; }

  // SPEC §4.2 밀도 하한 — "대충 뽑고 끝내기" 방지. 상한은 없다.
  const words = passage.text.trim().split(/\s+/).length;
  const floor = Math.max(12, Math.round(words * DENSITY_FLOOR));
  if (entries.length < floor) {
    crit("DENSITY_FLOOR", `${passageId} 항목 ${entries.length}개 < 하한 ${floor}개 (${words}단어 × ${DENSITY_FLOOR})`);
  }

  // 참조 밀도 — 하한만으로는 **과소추출이 초록으로 통과한다.**
  // 실측 사고: 다른 추출기가 90단어 지문에서 16항목(0.178)을 냈는데 하한 14를 넘겨 통과했다.
  // 같은 지문의 정상 추출은 28항목(0.311)이었다 — 43% 를 놓치고도 게이트가 침묵한 것이다.
  // 그래서 "하한"이 아니라 "레퍼런스 코퍼스 대비"로 본다.
  const refFloor = Math.max(12, Math.round(words * DENSITY_REFERENCE));
  if (entries.length >= floor && entries.length < refFloor) {
    major(
      "DENSITY_BELOW_REFERENCE",
      `${passageId} 항목 ${entries.length}개 (밀도 ${(entries.length / words).toFixed(3)}) — ` +
        `레퍼런스 ${DENSITY_REF_N}건의 최저치 ${DENSITY_REFERENCE} 미만. 중앙값은 ${DENSITY_REF_MEDIAN} 다. ` +
        `놓친 범주(다의 기능어·구동사·쉬운데 다의인 내용어·파생어)가 없는지 문장별로 재점검하라`,
    );
  }

  // ADJ_NOUN_PAIR_MISSING 용 — 이 파일이 **독립 항목으로 뽑은** 표제어 집합.
  // ⚠️ lemma/surface 를 통째로 넣는다. 공백·하이픈으로 쪼개 넣으면 "department store" 가
  //    'store' 를 만들어내 짝이 있는 것처럼 보인다(실측: 검출률 38.2% → 32.2% 로 붕괴).
  const declaredForms = new Set<string>();
  for (const raw of entries) {
    const e = raw as Record<string, unknown>;
    for (const src of [e.lemma, e.surface]) {
      if (typeof src !== "string") continue;
      const clean = src.toLowerCase().replace(/[^a-z\s'-]/g, "").trim();
      if (clean) declaredForms.add(singularEn(clean));
    }
  }

  entries.forEach((raw, idx) => {
    const e = raw as Record<string, unknown>;
    const at = `${passageId}#${idx}`;

    // 불변식 4: 키 자유작명 금지
    for (const k of ENTRY_KEYS) if (!(k in e)) crit("MISSING_KEY", `${at} '${k}' 없음`);
    for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) crit("UNKNOWN_KEY", `${at} 스펙에 없는 키 '${k}'`);

    const si = e.sentenceIndex;
    if (typeof si !== "number" || si < 0 || si >= sents.length) { crit("BAD_SENTENCE_INDEX", `${at} sentenceIndex=${String(si)}`); return; }
    const host = sents[si].en;

    // 불변식 2: example ⊂ 해당 문장
    if (typeof e.example !== "string" || e.example.length === 0) crit("NO_EXAMPLE", at);
    else if (!norm(host).includes(norm(e.example))) crit("EXAMPLE_NOT_SUBSTRING", `${at} example 이 sentences[${si}] 의 부분문자열이 아니다 — "${e.example.slice(0, 60)}"`);

    // 불변식 3: surface 가 해당 문장에 실재
    if (typeof e.surface !== "string" || e.surface.length === 0) crit("NO_SURFACE", at);
    else if (!norm(host).toLowerCase().includes(norm(e.surface).toLowerCase())) crit("SURFACE_NOT_FOUND", `${at} surface "${e.surface}" 가 sentences[${si}] 에 없다`);

    if (typeof e.pos !== "string" || !POS.has(e.pos)) crit("BAD_POS", `${at} pos="${String(e.pos)}"`);
    if (typeof e.tier !== "string" || !TIER.has(e.tier)) crit("BAD_TIER", `${at} tier="${String(e.tier)}"`);

    const dfc = e.difficulty;
    if (typeof dfc !== "number" || !Number.isInteger(dfc) || dfc < 1 || dfc > 5) crit("BAD_DIFFICULTY", `${at} difficulty=${String(dfc)}`);

    // senseEn: 병합 판정의 1차 근거 — 단어 하나로 때우면 병합이 무너진다
    const se = e.senseEn;
    if (typeof se !== "string" || se.trim().split(/\s+/).length < 3) crit("SENSE_EN_TOO_SHORT", `${at} senseEn="${String(se)}"`);

    const sk = e.senseKo;
    if (typeof sk !== "string") crit("NO_SENSE_KO", at);
    else {
      if (!/[가-힣]/.test(sk)) crit("SENSE_KO_NOT_KOREAN", `${at} senseKo="${sk}"`);
      // 길이는 물결표를 뺀 실질 글자 수로 센다. 하한 1자 — '길'·'층'·'쪽' 같은 1음절 정답어를
      // 막으면 '경로'·'층위' 로 우회하는 왜곡이 생긴다(파일럿 실측, SPEC §5).
      const koCore = sk.replace(/~/g, "").trim();
      if (koCore.length < 1 || koCore.length > 12) crit("SENSE_KO_LENGTH", `${at} senseKo="${sk}" (실질 ${koCore.length}자, 1~12자여야 함)`);
      if (sk.includes("/")) crit("SENSE_KO_MULTI", `${at} senseKo 에 '/' 로 동의어 나열 — 하나만 골라야 병합이 된다`);
    }

    if (typeof e.lemma !== "string" || e.lemma.length === 0) crit("NO_LEMMA", at);
    // SPEC §3.5.2 — 표제어는 항상 능동 사전형. be ~ 형태로 시작하면 병합이 갈린다.
    else if (/^be\s+/i.test(e.lemma)) crit("LEMMA_PASSIVE", `${at} lemma="${e.lemma}" — 능동 사전형으로 (수동 함의는 collocation 에)`);
    if (typeof e.inflection !== "string" || !INFLECTION.has(e.inflection)) crit("BAD_INFLECTION", `${at} inflection="${String(e.inflection)}" (고정 목록 밖)`);

    const trap = e.trap;
    if (trap !== null) {
      const t = trap as Record<string, unknown>;
      if (typeof t?.kind !== "string" || !TRAP.has(t.kind)) crit("BAD_TRAP_KIND", `${at} trap.kind="${String(t?.kind)}"`);
      const note = t?.note;
      if (typeof note !== "string" || note.length < 10) crit("TRAP_NOTE_THIN", `${at} trap.note 가 너무 짧다`);
      else {
        // ⑤ SPEC §7.4 — 2문장 이내, 100자 이내
        if (note.length > 100) crit("TRAP_NOTE_LONG", `${at} trap.note ${note.length}자 (100자 이내, §7.4)`);
        const sentCount = (note.match(/[.!?。]\s|[.!?。]$|다\.\s|다\.$/g) ?? []).length;
        if (sentCount >= 3) crit("TRAP_NOTE_SENTENCES", `${at} trap.note 가 ${sentCount}문장 (2문장 이내, §7.4)`);
        // ⑥ 금칙어
        for (const b of NOTE_BANNED) if (b.re.test(note)) crit("TRAP_NOTE_BANNED", `${at} trap.note 에 ${b.why} 포함 (§7.4)`);
        // ② SPEC §5.1-a — note 가 senseKo 를 부정하면 자기모순
        if (typeof e.senseKo === "string") {
          const stem = koStem(e.senseKo);
          if (stem.length >= 2) {
            const neg = new RegExp(`${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.!?]{0,14}(가 아니라|이 아니라|아니다|아님)`);
            if (neg.test(note)) crit("SENSE_KO_SELF_NEGATED", `${at} trap.note 가 senseKo "${e.senseKo}" 를 부정한다 — 부정하려면 senseKo 를 바꿔라 (§5.1-a)`);
          }
        }
      }
    }

    // ① SPEC §9 — confusable 에 자기 자신
    if (!Array.isArray(e.confusable)) crit("BAD_CONFUSABLE", `${at} confusable 이 배열이 아니다`);
    else {
      const self = new Set([String(e.lemma ?? "").toLowerCase(), String(e.surface ?? "").toLowerCase()]);
      for (const c of e.confusable) if (typeof c === "string" && self.has(c.toLowerCase())) crit("CONFUSABLE_SELF", `${at} confusable 에 자기 자신 "${c}"`);
    }

    // ⑦ SPEC §5.2-c,d — senseEn 이 두 sense 를 담거나 순환 정의
    if (typeof se === "string") {
      if (/;|\s\/\s/.test(se)) crit("SENSE_EN_MULTI", `${at} senseEn 에 세미콜론·슬래시 나열 — 한 정의문에 두 sense 금지 (§5.2-c)`);
      const lem = String(e.lemma ?? "").toLowerCase();
      if (lem.length >= 4 && new RegExp(`\\b${lem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(se)) {
        crit("SENSE_EN_CIRCULAR", `${at} senseEn 안에 표제어 "${e.lemma}" 자신이 등장 — 순환 정의 (§5.2-d)`);
      }
    }

    // ⑧ SPEC §6.1 — 40단어 이하 문장은 통째로 예문이어야 한다
    if (typeof e.example === "string") {
      const hostWords = wordCount(host);
      const isWhole = norm(e.example) === norm(host);
      if (hostWords <= 40 && !isWhole) {
        crit("EXAMPLE_NOT_WHOLE", `${at} 문장이 ${hostWords}단어(≤40)인데 example 이 일부만 — 문장 전체를 써라 (§6.1)`);
      }
      if (hostWords > 40 && !isWhole) {
        if (wordCount(e.example) < 5) crit("EXAMPLE_TOO_SHORT", `${at} 잘린 example 이 ${wordCount(e.example)}단어 (최소 5단어, §6.1)`);
        if (typeof e.exampleKo !== "string" || e.exampleKo.trim().length === 0) {
          crit("EXAMPLE_KO_MISSING", `${at} 40단어 초과 문장을 잘랐으면 exampleKo 를 채워야 한다 (§6.1)`);
        }
      }
      if (hostWords <= 40 && e.exampleKo != null) major("EXAMPLE_KO_UNNEEDED", `${at} 자르지 않았는데 exampleKo 가 있다 (§6.1)`);
    }

    // ⑨ ADJ_NOUN_PAIR_MISSING — 형용사에 "<lemma> <noun>" 짝을 적어놓고 명사를 안 뽑았다.
    // SPEC §3 은 형용사·명사를 **각각** 항목으로 뽑으라고 요구한다. 그런데 그 의무가
    // 금지문("독립 항목 금지") 셀 안에 묻혀 있어 모델이 금지만 읽고 의무를 흘렸다.
    // 실측 616/1,614(38.2%) 위반 · 356/741 파일(48.0%) — 파이프라인 기본값이다.
    if (e.pos === "adjective" && typeof e.collocation === "string" && typeof e.lemma === "string") {
      const toks = e.collocation.trim().split(/\s+/);
      const lemmaLc = e.lemma.toLowerCase();
      // "<lemma> <noun>" 형태만 본다. "an essential part of"·"be present"·"worth -ing" 처럼
      // 관사·전치사가 붙거나 lemma 로 시작하지 않는 것은 짝 의무의 대상이 아니다.
      if (
        toks.length === 2 &&
        toks[0].toLowerCase() === lemmaLc &&
        /^[A-Za-z][A-Za-z-]*$/.test(toks[1]) &&
        !ADJ_PAIR_NON_NOUN.has(toks[1].toLowerCase())
      ) {
        const noun = singularEn(toks[1]);
        if (!declaredForms.has(noun)) {
          major(
            "ADJ_NOUN_PAIR_MISSING",
            `${at} collocation "${e.collocation}" 의 짝 명사 "${toks[1]}"(정규화 "${noun}") 가 항목에 없다 — ` +
              `형용사·명사는 **각각** 항목으로 뽑아야 한다 (§3)`,
          );
        }
      }
    }

    // ⑩ SENSE_EN_CONTEXT_LEAK — 정의문에 예문의 문맥어가 박혔다 (minor, 보조 신호).
    // 이 레코드는 4단계 병합에서 일반 클러스터와 만나지 못한다.
    // ⚠️ 오탐률 ~80%. 상수 주석의 한계 설명을 반드시 읽고 판단하라.
    if (typeof se === "string" && typeof e.example === "string") {
      const own = new Set(
        [String(e.lemma ?? ""), String(e.surface ?? "")]
          .flatMap((s) => s.toLowerCase().split(/[\s-]+/))
          .map(stemEn),
      );
      const exWords = new Set(contentStems(e.example));
      const shared = [...new Set(contentStems(se))].filter(
        (w) => exWords.has(w) && !own.has(w) && !DEFINITIONAL_VOCAB.has(w),
      );
      if (shared.length >= SENSE_EN_LEAK_MIN_SHARED) {
        out.push({
          severity: "minor",
          code: "SENSE_EN_CONTEXT_LEAK",
          detail:
            `${at} senseEn 이 example 의 문맥어 ${shared.length}개를 공유한다 [${shared.join(", ")}] — ` +
            `"${se}". 지문 목적어·한정어가 정의문에 박히면 병합에서 고립된다. ` +
            `단, 정의문이 예문 단어를 정당하게 쓰는 경우도 많다(오탐 ~80%) — 판단은 사람이 하라`,
        });
      }
    }

    // ③ SPEC §5.1-c — 참고 신호일 뿐이다(minor). 이걸 맞추려고 뜻을 비틀지 말 것.
    if (typeof e.senseKo === "string" && !koOverlaps(e.senseKo, sents[si].ko)) {
      out.push({
        severity: "minor",
        code: "SENSE_KO_ABSENT_IN_KO",
        detail: `${at} senseKo "${e.senseKo}" 가 sentences[${si}].ko 와 겹치지 않는다 — 참고용 신호 (§5.1-c). 뜻이 맞다면 무시하라`,
      });
    }
  });

  /**
   * ④ SPEC §7.1 — trap 비율 상한.
   *
   * ⚠️ **severity=major 다. critical 로 올리지 마라.** 실측 사고로 강등한 것이다.
   *
   * 2026-07-29, 이 검사를 critical 로 켠 직후 실지문 추출을 해 보니 게이트는 초록인데
   * (trap 11.5%, critical 0) **정본이 진짜라고 못박은 함정들이 통째로 사라져 있었다**:
   *   `just`(단지/막/정확히)   — §4.1 이 "반드시 수록"이라 명시한 다의 기능어
   *   `make A adjective`      — §7.3.1 이 syntax 함정의 ✅ 모범 예시로 든 바로 그 자리
   *   `present`(현재/선물)     — 대표 다의어
   * 원인은 명확하다. 추출 에이전트가 자가검증 루프("critical 0 이 될 때까지 고쳐라")에서
   * 이 검사를 맞고 **함정을 지워서 통과**한 것이다. 초록불이 품질이 아니라 삭제의 흔적이었다.
   *
   * **비율 상한은 원리상 삭제로 언제나 만족시킬 수 있다.** 그래서 차단성 검사로 두면
   * "형식을 검사하면 형식만 채워진다"가 반대 방향으로 재현된다 — 이 프로젝트에서 세 번째다:
   *   §5.1-c  검사를 맞추려고 뜻을 비틀었다(lose 잃다→잃어버리다, feel 은 항목째 삭제) → minor 강등
   *   §7.2    "문장을 써라"만 요구하니 문형만 채웠다(가짜 함정 41.4%)          → 3단 시험으로 교체
   *   §7.1    비율을 차단성으로 두니 진짜 함정을 지웠다                        → 여기, major 강등
   *
   * 진짜 통제 수단은 §7.2.1 3단 반증 시험이다. 비율은 **그 결과로 따라오는 증상 지표**이지
   * 겨냥할 과녁이 아니다(25% 도출 근거부터가 37.0% × (1−0.414) ≈ 21.7% 라는 사후 추정이다).
   * 코퍼스 단위로 보고 판단하라 — 파일 하나를 반려하는 데 쓰지 마라.
   */
  const trapped = entries.filter((x) => (x as Record<string, unknown>).trap != null).length;
  const ratio = trapped / entries.length;
  if (ratio > TRAP_RATIO_MAX) {
    major(
      "TRAP_RATIO",
      `${passageId} trap 비율 ${(ratio * 100).toFixed(1)}% (${trapped}/${entries.length}) — ` +
        `${(TRAP_RATIO_MAX * 100).toFixed(0)}% 상한 초과 (§7.1). ` +
        `⚠️ **이 수치를 맞추려고 함정을 지우지 마라** — 3단 시험(§7.2.1)을 통과한 것은 남긴다`,
    );
  }

  // 지문 내 동일 (lemma, senseKo) 중복 — 스펙 §5 "같은 뜻 여러 번이면 1회만"
  const seen = new Map<string, number>();
  entries.forEach((raw) => {
    const e = raw as Record<string, unknown>;
    if (typeof e.lemma !== "string" || typeof e.senseKo !== "string") return;
    const k = `${e.lemma} ${e.pos} ${e.senseKo}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  });
  for (const [k, n] of seen) if (n > 1) major("DUP_SENSE", `${passageId} 같은 (lemma,pos,senseKo) 가 ${n}회 — "${k.split(" ").join(" / ")}"`);

  return out;
}

/**
 * TRAP_TEMPLATE_REPEAT — **코퍼스 단위** 검사. 파일 하나만 봐서는 원리상 보이지 않는다.
 *
 * 같은 lemma 의 trap.note 들이 **같은 오독어를 재탕**하면 그건 판단이 아니라 템플릿 복사다.
 * §7.2 최종 관문이 "학생이 X 로 읽어 Y 를 놓친다"는 **문장을 쓸 것**만 요구해서, 문형만
 * 채우면 자동 통과한다 — 형식 검사가 진위 검증을 대체한 자리다.
 *
 * 반환: 파일명 → 그 파일에서 걸린 항목들의 이슈. --dir 리포트에 그대로 합류시킨다.
 */
export function verifyCorpus(docs: { file: string; doc: unknown }[]): {
  byFile: Map<string, Issue[]>;
  clusters: { lemma: string; gram: string; hits: number; total: number; ratio: number }[];
} {
  type Slot = { file: string; idx: number; passageId: string; x: string };
  const byLemma = new Map<string, Slot[]>();

  for (const { file, doc } of docs) {
    const d = doc as Record<string, unknown>;
    const entries = d?.entries;
    if (!Array.isArray(entries)) continue;
    const passageId = typeof d.passageId === "string" ? d.passageId : file;
    entries.forEach((raw, idx) => {
      const e = raw as Record<string, unknown>;
      const t = e?.trap as Record<string, unknown> | null | undefined;
      if (!t || typeof t.note !== "string" || typeof e.lemma !== "string") return;
      const x = extractMisreading(t.note);
      if (!x) return; // 오독어를 못 뽑으면 분모에서도 빠진다 — 오검출을 만들지 않는다
      const key = e.lemma.toLowerCase();
      if (!byLemma.has(key)) byLemma.set(key, []);
      byLemma.get(key)!.push({ file, idx, passageId, x });
    });
  }

  const byFile = new Map<string, Issue[]>();
  const clusters: { lemma: string; gram: string; hits: number; total: number; ratio: number }[] = [];

  for (const [lemma, slots] of byLemma) {
    if (slots.length < TRAP_TEMPLATE_MIN_TRAPS) continue;
    const { gram, members } = largestMisreadingCluster(slots.map((s) => s.x));
    const ratio = members.length / slots.length;
    if (members.length < TRAP_TEMPLATE_MIN_HITS || ratio < TRAP_TEMPLATE_MIN_RATIO) continue;
    clusters.push({ lemma, gram, hits: members.length, total: slots.length, ratio });

    for (const i of members) {
      const s = slots[i];
      if (!byFile.has(s.file)) byFile.set(s.file, []);
      /**
       * ⚠️ **severity=minor 다. major 로 올리지 마라.** 2026-07-29 실측으로 강등했다.
       *
       * 이 검사는 제 몫을 했다 — 만든 근거였던 `even` 은 22건 중 10건이 "평평한"이라는
       * **통사적으로 불가능한** 오독을 복사하고 있었고, 수리 후 5건(서로 다른 senseKo 4종)만
       * 남아 그 결함은 실제로 소멸했다.
       *
       * 그런데 그 뒤로 남은 것은 대부분 **정당한 반복**이다. 실측:
       *   `as`   217건 · 서로 다른 senseKo **31종** (로서 55 · 함에 따라 32 · 하면서 22 …)
       *   `just`  91건 · **19종**
       *   `make` 210건 · 23종 — 157건이 사역구문인데 §7.3.1 이 syntax 함정의 모범 예시로
       *          든 바로 그 자리다. 코퍼스에 반복해서 나오니 함정도 반복되는 게 정상이다.
       * 진짜 다의어는 **오독이 원래 하나뿐이라 반복된다**(`suggest` 제안하다→시사하다).
       * 변주를 요구하면 그건 판단이 아니라 창작이 된다.
       *
       * **이 검사는 "오독어 반복"이라는 대리 지표를 잰다.** 차단성으로 두면 지표를 겨냥한
       * 산출이 나온다 — 이 프로젝트에서 **네 번째**로 확인된 실패 유형이다:
       *   §5.1-c 검사 맞추려 뜻을 비틀었다        → minor 강등
       *   §7.2   문형만 요구하니 문형만 채웠다     → 3단 시험으로 교체
       *   §7.1   비율을 차단성으로 두니 진짜를 지웠다 → major 강등
       *   §7.2-b 반복을 차단성으로 두니 수리가 헛돌았다 → 여기, minor 강등
       *
       * 운영상 실해도 있었다: 이 검사만 남은 파일이 **1,124개**였는데, 코퍼스 단위 검사라
       * 파일 하나를 고쳐도 안 꺼진다. 수리 대상 선정이 매 라운드 같은 파일을 다시 잡아
       * **246배치 중 실질 작업이 16파일치**였다.
       *
       * 쓰임새는 남긴다 — 아래 클러스터 요약(`clusters`)이 lemma 단위 검토 후보를 준다.
       * 파일을 반려하는 데 쓰지 말고, **lemma 단위로 사람이 훑는 입력**으로 써라.
       */
      byFile.get(s.file)!.push({
        severity: "minor",
        code: "TRAP_TEMPLATE_REPEAT",
        detail:
          `${s.passageId}#${s.idx} lemma "${lemma}" 의 오독어 "${s.x}" — 코퍼스 전역 ` +
          `${slots.length}건 중 ${members.length}건(${(ratio * 100).toFixed(0)}%)이 같은 오독어("${gram}" 계열). ` +
          `⚠️ 참고 신호다 — 진짜 다의어는 오독이 하나뿐이라 반복되는 게 정상이다(§7.2). ` +
          `**변주를 만들려고 함정을 고치지 마라.** lemma 단위 검토가 필요할 때만 쓴다`,
      });
    }
  }

  clusters.sort((a, b) => b.hits - a.hits);
  return { byFile, clusters };
}

// ── CLI ────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const get = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const selftest = args.includes("--selftest");
  const dir = get("dir");
  const jsonOut = get("json");

  if (selftest) return runSelfTest();

  // 단건 모드 — 병렬 에이전트가 자기 산출물만 검증할 때 쓴다(서로의 파일을 읽지 않는다).
  const single = get("file");
  if (single) {
    let doc: unknown;
    try { doc = JSON.parse(fs.readFileSync(single, "utf8")); }
    catch (err) { console.log(`[CRITICAL] PARSE_FAIL  ${String(err)}`); process.exit(1); }
    const issues = verifyDoc(doc, path.basename(single));
    for (const i of issues) console.log(`  [${i.severity.toUpperCase()}] ${i.code}  ${i.detail}`);
    const c = issues.filter((i) => i.severity === "critical").length;
    // 【라벨 결함 2026-07-30】 원래 `issues.length - c` 를 major 로 찍어 **minor 를 major 에 합산**했다.
    //   major 0 인데 "major 5" 로 보이면, 일부러 참고신호로 강등해 둔 minor(§5.1-c·§7.1·§7.2-b)를
    //   없애려고 에이전트가 뜻을 비튼다 — 대리지표 실패를 라벨로 재생산하는 것이다.
    //   등급을 나눠 찍고, minor 는 "참고" 라고 못박는다.
    const m = issues.filter((i) => i.severity === "major").length;
    const n = issues.length - c - m;
    console.log(
      c === 0
        ? `✅ ${path.basename(single)} 통과 — major ${m} · minor ${n}(참고 신호, 맞추려고 고치지 마라)`
        : `❌ ${path.basename(single)} critical ${c} · major ${m} · minor ${n}`,
    );
    process.exit(c === 0 ? 0 : 1);
  }

  if (!dir) { console.error("usage: --dir=<디렉토리> | --file=<파일> [--json=report.json] [--selftest]"); process.exit(2); }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) { console.error(`${dir} 에 .json 이 없다`); process.exit(2); }

  // ① 파일 단위 검사
  const perFile = new Map<string, Issue[]>();
  const loaded: { file: string; doc: unknown }[] = [];
  let entryTotal = 0;
  for (const f of files) {
    let doc: unknown;
    try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
    catch (err) {
      perFile.set(f, [{ severity: "critical", code: "PARSE_FAIL", detail: String(err) }]);
      continue;
    }
    loaded.push({ file: f, doc });
    entryTotal += (doc as { entries?: unknown[] })?.entries?.length ?? 0;
    const issues = verifyDoc(doc, f);
    if (issues.length) perFile.set(f, issues);
  }

  // ② 코퍼스 단위 검사 — 파일 하나만 봐서는 원리상 안 보이는 것
  const { byFile: corpusIssues, clusters } = verifyCorpus(loaded);
  for (const [f, issues] of corpusIssues) perFile.set(f, [...(perFile.get(f) ?? []), ...issues]);

  const report: { file: string; issues: Issue[] }[] = files
    .filter((f) => perFile.has(f))
    .map((f) => ({ file: f, issues: perFile.get(f)! }));

  for (const r of report) {
    console.log(`\n${r.file}`);
    for (const i of r.issues) console.log(`  [${i.severity.toUpperCase()}] ${i.code}  ${i.detail}`);
  }

  const all = report.flatMap((r) => r.issues);
  const critical = all.filter((i) => i.severity === "critical").length;
  const major = all.filter((i) => i.severity === "major").length;
  const minor = all.filter((i) => i.severity === "minor").length;

  // 검사별 적발 건수 — 이미 뽑힌 산출물의 **수리 범위**를 정하는 근거다
  const byCode = new Map<string, { sev: Severity; n: number; files: Set<string> }>();
  for (const r of report) {
    for (const i of r.issues) {
      if (!byCode.has(i.code)) byCode.set(i.code, { sev: i.severity, n: 0, files: new Set() });
      const c = byCode.get(i.code)!;
      c.n++; c.files.add(r.file);
    }
  }
  console.log(`\n=== 검사별 적발 건수 ===`);
  for (const sev of ["critical", "major", "minor"] as Severity[]) {
    for (const [code, c] of [...byCode.entries()].filter(([, x]) => x.sev === sev).sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  [${sev.toUpperCase().padEnd(8)}] ${code.padEnd(26)} ${String(c.n).padStart(5)}건 · ${String(c.files.size).padStart(4)}파일`);
    }
  }

  if (clusters.length) {
    console.log(`\n=== TRAP_TEMPLATE_REPEAT 상위 군집 (총 ${clusters.length} lemma) ===`);
    for (const c of clusters.slice(0, 20)) {
      console.log(`  ${c.lemma.padEnd(16)} ${String(c.hits).padStart(3)}/${String(c.total).padStart(3)} (${(c.ratio * 100).toFixed(0)}%) 오독어 "${c.gram}" 계열`);
    }
  }

  console.log(`\n=== 검증 결과 ===`);
  console.log(`  파일 ${files.length}개 / 항목 ${entryTotal}개`);
  console.log(`  critical ${critical} · major ${major} · minor ${minor}`);
  console.log(critical === 0 ? "  ✅ 기계 게이트 통과" : "  ❌ critical 존재 — 통과 불가");

  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2)); console.log(`  리포트: ${jsonOut}`); }
  process.exit(critical === 0 ? 0 : 1);
}

/**
 * 계기 음성테스트 — 결함을 일부러 주입해 게이트가 울리는지 확인한다.
 * "0건 보고"를 신뢰하려면 "0건이 아닐 때 울린다"를 먼저 보여야 한다.
 */
function runSelfTest() {
  const EXEMPLAR = "experiments/vocab-corpus-20260728/exemplar/ebsi_go3_20260324-q31.json";
  const raw = JSON.parse(fs.readFileSync(EXEMPLAR, "utf8"));

  // ⚠️ 프로브는 **메모리 사본에서만** 돈다. 이 함수는 파일을 단 한 줄도 쓰지 않는다.
  //    (과거 사고: merge/out/s0000.json 이 "PROBE example 1" 로 오염된 채 남았다.)

  /**
   * 기준 견본을 **개정 스펙(25% 상한)에 맞춰 메모리에서** 만든다.
   *
   * 원본 견본은 trap 20/52 = 38.5% 라 새 상한을 그대로 위반한다. 이건 계기 결함이 아니라
   * **진짜 적발**이다 — 견본이 구 상한 50% 시절에 만들어졌기 때문이다.
   * 그렇다고 "무결 견본은 조용한가" 판정을 느슨하게 풀면 계기가 무뎌진다. 그래서 원본을
   * 고치는 대신(=산출물을 건드리는 대신) **상한을 지키는 사본**을 만들어 그걸로 판정한다.
   * 앞쪽 trap 부터 상한만큼만 남긴다 — 기존 프로브가 쓰는 entries[1].trap 은 보존된다.
   */
  const specConformantBase = () => {
    const d = JSON.parse(JSON.stringify(raw));
    const budget = Math.floor(d.entries.length * TRAP_RATIO_MAX);
    let kept = 0;
    for (const e of d.entries) {
      if (e.trap == null) continue;
      if (kept < budget) kept++;
      else e.trap = null;
    }
    return d;
  };
  const base = specConformantBase();
  const clone = () => JSON.parse(JSON.stringify(base));

  /** example 에서 '정의문 상용어'가 아닌 희귀 내용어를 골라온다 — 누출 프로브용. */
  const leakWords = (e: any, n: number): string[] => {
    const own = new Set([String(e.lemma ?? ""), String(e.surface ?? "")].flatMap((s) => s.toLowerCase().split(/[\s-]+/)).map(stemEn));
    const seen = new Set<string>();
    const picked: string[] = [];
    for (const w of String(e.example).toLowerCase().match(/[a-z]+/g) ?? []) {
      const st = stemEn(w);
      if (w.length <= 3 || EN_STOP.has(w) || DEFINITIONAL_VOCAB.has(st) || own.has(st) || seen.has(st)) continue;
      seen.add(st);
      picked.push(w);
      if (picked.length === n) break;
    }
    return picked;
  };
  const firstAdj = () => base.entries.findIndex((e: any) => e.pos === "adjective");

  const probes: { name: string; expect: string; mutate: (d: any) => void }[] = [
    { name: "원문 훼손(문장 단어 삭제)", expect: "TEXT_MISMATCH", mutate: (d) => { d.sentences[2].en = d.sentences[2].en.replace("worry", ""); } },
    { name: "예문 창작(지문에 없는 문장)", expect: "EXAMPLE_NOT_SUBSTRING", mutate: (d) => { d.entries[0].example = "This sentence was invented by the model."; } },
    { name: "surface 가 문장에 없음", expect: "SURFACE_NOT_FOUND", mutate: (d) => { d.entries[0].surface = "zebra"; } },
    { name: "키 자유작명(senseKo→koreanMeaning)", expect: "UNKNOWN_KEY", mutate: (d) => { d.entries[1].koreanMeaning = d.entries[1].senseKo; delete d.entries[1].senseKo; } },
    { name: "senseEn 을 단어 하나로 때움", expect: "SENSE_EN_TOO_SHORT", mutate: (d) => { d.entries[2].senseEn = "power"; } },
    { name: "senseKo 에 동의어 나열", expect: "SENSE_KO_MULTI", mutate: (d) => { d.entries[3].senseKo = "전공자/전공"; } },
    { name: "senseKo 가 설명문(12자 초과)", expect: "SENSE_KO_LENGTH", mutate: (d) => { d.entries[4].senseKo = "무언가를 할 능력이 없는 상태를 가리키는 말"; } },
    { name: "pos 자유값", expect: "BAD_POS", mutate: (d) => { d.entries[5].pos = "동사"; } },
    { name: "trap.kind 자유값", expect: "BAD_TRAP_KIND", mutate: (d) => { d.entries[1].trap.kind = "confusing"; } },
    { name: "한글 해석 누락", expect: "KO_NOT_KOREAN", mutate: (d) => { d.sentences[0].ko = "Art without commerce is a hobby."; } },
    { name: "항목 전무", expect: "NO_ENTRIES", mutate: (d) => { d.entries = []; } },
    // 과소추출 2종 — 이 둘이 없어서 다른 추출기의 0.178 이 초록으로 통과했다.
    // 견본은 193단어/33항목(0.171)… 이 아니라 실제로는 아래 계산대로다. 잘라서 확인한다.
    { name: "과소추출(레퍼런스 미만)", expect: "DENSITY_BELOW_REFERENCE", mutate: (d) => { d.entries = d.entries.slice(0, 32); } },
    { name: "과소추출(스펙 하한 미만)", expect: "DENSITY_FLOOR", mutate: (d) => { d.entries = d.entries.slice(0, 20); } },

    // ── 신설 검사 프로브 ────────────────────────────────────────────────
    // (D) trap 상한 25% — 구 상한 50% 로는 744파일 중 0건이 걸렸다.
    {
      name: "trap 남발(25% 상한 초과)",
      expect: "TRAP_RATIO",
      mutate: (d) => {
        const donor = d.entries.find((e: any) => e.trap != null)?.trap;
        for (const e of d.entries) if (e.trap == null) e.trap = JSON.parse(JSON.stringify(donor));
      },
    },
    // (B) 형용사+명사 짝 누락 — collocation 에만 적고 명사 항목을 안 만든다.
    {
      name: "형용사 짝 명사 누락",
      expect: "ADJ_NOUN_PAIR_MISSING",
      mutate: (d) => {
        const i = firstAdj();
        d.entries[i].collocation = `${String(d.entries[i].lemma).toLowerCase()} gems`; // 'gem' 항목은 없다
      },
    },
    // (C) senseEn 문맥 누출 — 예문의 희귀 내용어를 정의문에 박는다.
    {
      name: "senseEn 문맥 누출",
      expect: "SENSE_EN_CONTEXT_LEAK",
      mutate: (d) => {
        const e = d.entries.find((x: any) => leakWords(x, 2).length === 2);
        const [a, b] = leakWords(e, 2);
        e.senseEn = `a kind of ${a} that involves ${b}`;
      },
    },
  ];

  /**
   * 음성 프로브만으로는 부족하다 — **결함이 없을 때 조용한지**도 봐야 한다.
   * 신설 검사 3종은 오탐이 나기 쉬운 자리(특히 SENSE_EN_CONTEXT_LEAK)라 대조군을 둔다.
   */
  // ⚠️ 대조군은 **건드린 항목 하나**만 본다. 견본에는 이미 진짜 위반이 있어서
  //    (#10 "visual arts", #34 "fine arts" — 짝 명사 art 를 안 뽑았다) 파일 전체로 보면
  //    무엇을 고쳐도 코드가 울린다. 그건 대조군 실패가 아니라 견본의 실제 결함이다.
  const controls: { name: string; forbid: string; mutate: (d: any) => number }[] = [
    {
      name: "짝 명사가 실재하면 조용한가",
      forbid: "ADJ_NOUN_PAIR_MISSING",
      mutate: (d) => {
        const i = firstAdj();
        const noun = d.entries.find((e: any) => e.pos === "noun");
        d.entries[i].collocation = `${String(d.entries[i].lemma).toLowerCase()} ${String(noun.lemma).toLowerCase()}`;
        return i;
      },
    },
    {
      name: "관사·전치사 붙은 collocation 은 면제인가",
      forbid: "ADJ_NOUN_PAIR_MISSING",
      mutate: (d) => {
        const i = firstAdj();
        d.entries[i].collocation = `an ${String(d.entries[i].lemma).toLowerCase()} part of`;
        return i;
      },
    },
    {
      // 【오탐 11건 2026-07-30】 `different from`·`natural to`·`packed with` 처럼 두 토큰짜리
      //   형용사+전치사가 "짝 명사 누락"으로 잡혔다. 이 대조군이 없으면 가드가 조용히 풀린다.
      name: "형용사+전치사(2토큰)는 면제인가",
      forbid: "ADJ_NOUN_PAIR_MISSING",
      mutate: (d) => {
        const i = firstAdj();
        d.entries[i].collocation = `${String(d.entries[i].lemma).toLowerCase()} from`; // 'from' 은 명사가 아니다
        return i;
      },
    },
    {
      name: "정의문 상용어만 겹치면 조용한가",
      forbid: "SENSE_EN_CONTEXT_LEAK",
      // 'something'·'people'·'make' 는 코퍼스 정의문 25.0%·4.9%·4.3% 에 쓰이는 상용어다.
      mutate: (d) => { d.entries[0].senseEn = "something that people make for other people"; return 0; },
    },
  ];

  console.log("=== 계기 음성테스트 (결함 주입 → 검출되는가) ===\n");
  let pass = 0;
  for (const p of probes) {
    const d = clone();
    p.mutate(d);
    const codes = verifyDoc(d, "selftest").map((i) => i.code);
    const ok = codes.includes(p.expect);
    if (ok) pass++;
    console.log(`  ${ok ? "✅" : "❌"} ${p.name.padEnd(28)} → 기대 ${p.expect.padEnd(24)} ${ok ? "검출" : `미검출 (실제: ${codes.join(",") || "없음"})`}`);
  }

  // ── (A) TRAP_TEMPLATE_REPEAT — 코퍼스 단위라 합성 코퍼스로 검증한다 ────
  // 실측 재현: lemma `even` 22건 중 10건이 '평평한' 이라는 **동일 오독어**를 쓴다.
  // even 은 전 용례가 부사 자리라 형용사 독해가 통사적으로 불가능한데도 그렇다.
  const synth = (notes: string[]) =>
    notes.map((note, k) => {
      const d = clone();
      d.passageId = `${d.passageId}`;
      const e = d.entries.find((x: any) => x.trap != null);
      e.lemma = "even";
      e.trap = { kind: "polysemy", note };
      return { file: `synth-${k}.json`, doc: d };
    });

  const TEMPLATE = Array.from({ length: 8 }, (_, k) =>
    `학생이 '평평한'으로 읽어 강조${k}를 놓친다. 여기서는 '심지어'다.`,
  );
  const VARIED = [
    "학생이 '심지어'로 읽어 비교의 강조를 놓친다. 비교급 앞에서는 '훨씬'이다.",
    "학생이 '훨씬'으로 읽어 뜻밖의 사례라는 점을 놓친다. 여기서는 덧붙임이다.",
    "학생이 '~조차'로 읽어 정도가 커진다는 뜻을 놓친다. 여기서는 '한층 더'이다.",
    "학생이 '고른'으로 읽어 의외성을 놓친다. 여기서는 예상 밖을 가리킨다.",
    "학생이 '과연'으로 읽어 표면이 매끄럽다는 뜻을 놓친다. smooth 와 나란히 쓰였다.",
    "학생이 '짝수의'로 읽어 대등함을 놓친다. 여기서는 양쪽이 같다는 말이다.",
    "학생이 '심지어'로 읽어 방해를 뛰어넘었다는 뜻을 놓친다. 양보의 뜻이다.",
    "학생이 '훨씬'으로 읽어 덧붙임을 놓친다. 여기서는 '~까지도'에 가깝다.",
  ];

  const repeatHit = verifyCorpus(synth(TEMPLATE)).clusters.some((c) => c.lemma === "even");
  const variedHit = verifyCorpus(synth(VARIED)).clusters.some((c) => c.lemma === "even");

  console.log(`\n  ${repeatHit ? "✅" : "❌"} ${"템플릿 복사(동일 오독어 8회)".padEnd(26)} → 기대 TRAP_TEMPLATE_REPEAT   ${repeatHit ? "검출" : "미검출"}`);
  console.log(`  ${!variedHit ? "✅" : "❌"} ${"오독어가 매번 다르면 조용한가".padEnd(26)} → TRAP_TEMPLATE_REPEAT ${!variedHit ? "침묵" : "**오탐**"}`);
  if (repeatHit) pass++;
  if (!variedHit) pass++;
  const total = probes.length + 2 + controls.length;

  // ── 대조군 — 결함이 없을 때 조용한가 ──────────────────────────────────
  for (const c of controls) {
    const d = clone();
    const idx = c.mutate(d);
    const fired = verifyDoc(d, "control").some((i) => i.code === c.forbid && i.detail.startsWith(`${d.passageId}#${idx} `));
    if (!fired) pass++;
    console.log(`  ${!fired ? "✅" : "❌"} ${c.name.padEnd(26)} → ${c.forbid} ${!fired ? "침묵" : "**오탐**"}`);
  }

  const cleanIssues = verifyDoc(base, "clean");
  const cleanCrit = cleanIssues.filter((i) => i.severity === "critical");
  console.log(`\n  ${cleanCrit.length === 0 ? "✅" : "❌"} 무결 견본은 조용한가 → critical ${cleanCrit.length}건`);
  if (cleanCrit.length) for (const i of cleanCrit) console.log(`      ${i.code} ${i.detail}`);

  // 원본 견본의 실제 상태 — 개정 상한에서 견본 자신이 적발 대상이라는 사실을 숨기지 않는다.
  const rawCrit = verifyDoc(raw, "exemplar-raw").filter((i) => i.severity === "critical");
  console.log(
    `  ℹ️  원본 견본(수리 전)은 critical ${rawCrit.length}건 — ${rawCrit.map((i) => i.code).join(",") || "없음"}` +
      `${rawCrit.length ? " (구 상한 50% 시절 산출물. 계기 결함이 아니라 진짜 적발이다)" : ""}`,
  );

  console.log(`\n=== ${pass}/${total} 검출 ===`);
  console.log(
    pass === total && cleanCrit.length === 0
      ? "✅ 계기 신뢰 가능 — 결함이 있을 때 울리고 없을 때 조용하다"
      : "❌ 계기 불신 — 이 상태의 '0건'은 탐지 실패와 구분되지 않는다",
  );
  process.exit(pass === total && cleanCrit.length === 0 ? 0 : 1);
}

main();
