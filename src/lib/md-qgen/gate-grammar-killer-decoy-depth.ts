// ============================================================================
// 어법 KILLER 「미끼 판단 깊이」 양성 조건 게이트 — LLM 콜 0건(정규식·집합·거리만).
//
// 배경(26-08-21 실측): 최신 산출물의 미끼 4개가 **전부 공식 자리**였다.
//   ② let + 원형(get) / ③ become + 형용사(clear) / ④ what is left / ⑤ when + p.p.
// 네 자리 모두 밑줄 직전 1~2토큰이 형태를 확정한다 — 거리는 있는데 **분기가 없다**.
// 행동 측정에서 「살아있는 선택지」가 1.00/5 로 떨어져 실기출 최저 구간(47건 중
// 5건이 1.00)까지 붕괴했다. 기존 gate-grammar-killer-decoys.ts 는 죽은 자리를
// **빼는** 음성 조건뿐이라, 공식 자리로만 네 칸을 채우면 그대로 통과한다.
// 우회를 막으려면 "적어도 하나는 이래야 한다"는 **양성 조건**이 필요하다.
//
// 계약(두 조건의 논리곱 — 아래 실측이 강제한 형태):
//   반려 = 미끼 4개가 **전부 판단 깊이 0** AND **전부 공식 자리 사전에 히트**.
//   즉 "적어도 하나는 판단 깊이를 갖거나, 최소한 공식 자리가 아니어야 한다".
//
// 판단 깊이의 결정론 신호(프록시 명세 P4 BRANCH · P5 ATTRACTOR):
//   IV       개입요소 >= 1 — 밑줄과 그 지배 명사핵 사이에 관계절 / 콤마쌍·대시
//            삽입구 / of·in·with 류 전치사구 / 분사구가 끼어 있다.
//   MISMATCH 밑줄 직전 최근접 명사의 수 != 주어핵의 수. 기출 판단형 d코드 21/21
//            전수가 이 부등호를 갖고, 인지형 d 2/2 는 전부 수가 같다("같으면
//            자동으로 인지형이 된다").
//   BRANCH   후보가 실제로 둘 이상 — b는 관계사절 결손 슬롯 0(완전한 절),
//            i는 등위 좌측 12토큰의 병렬 짝 후보 '유형'이 2종 이상,
//            g는 지배 술어가 준동사이거나 같은 수의 경쟁 선행사가 2개 이상.
//   그 외 APPOS(콤마쌍 삽입구 직후) · 문두 동명사 주어 · 문두 분사구문.
//
// 임계·형태 근거(실기출 실측 — 아래 하네스로 직접 측정, 26-08-21):
//   기출 156문항(reconstructed.json ①~⑤ 마커 복원본 + corpus.json 밑줄 span)에서
//   문항별 「깊은 미끼 개수」 분포 = {0개: 5, 1개: 38, 2개: 60, 3개: 41, 4개: 12}.
//   → 「깊이 0」 단독 임계로는 실기출 5건(3.2%)이 오반려된다. 실기출이라고 미끼를
//     늘 깊게 만들지는 않는다는 뜻이다(2016 이전 EBS 문항에 몰려 있다).
//   그 5건은 **예외 없이** 미끼 중 하나가 공식 자리 사전 밖이었다(부사 자리·
//   명사 뒤 분사 등). 그래서 두 번째 조건(넷 다 사전 히트)을 논리곱으로 붙였고,
//   그 형태에서 **오반려 0/156 = 0.00%** 다. 불량 실물(공식 자리 4칸)은 그대로
//   반려되고, 사전의 다른 족으로 채운 우회 형상(전치사+동명사 / to+원형 /
//   관사+명사 / 조동사+원형)도 반려된다(하네스 §4).
//
// 판정은 **표면 자체 게이팅**이다 — 각 신호가 밑줄 표면(정동사/관계사/등위/대명사
// 여부)으로 스스로 발화 조건을 건다. 그래서 code 가 없는 기출 복원본과 code 가
// 있는 프로덕션이 같은 판정을 낸다. code 는 표면이 애매할 때 해당 신호를 **추가로
// 열어주는 용도로만** 쓴다(절대 좁히지 않는다) → 프로덕션은 캘리브레이션보다 항상
// 같거나 더 관대하다 = 오반려 방향으로 안전하다.
//
// ⚠ 이 게이트의 메시지는 그대로 [반려 재생성] 프롬프트 피드백이 된다(route.ts
//   gateIssues 경로). "어느 라벨의 무엇이 왜 얕은지"를 반드시 적는다.
//
// 킬스위치: env QGEN_GRAMMAR_KILLER_DECOY_DEPTH_GATE=off (재빌드 불필요).
// 발화 범위: requestedDifficulty === "KILLER" 전용. 그 외 난이도는 전량 미발화.
//
// 검증 하네스(재현): C:/Users/jooye/AppData/Local/Temp/claude/
//   d--Desktop-2026project-nara/e67aa00d-9e05-4e1c-bcc4-9d256070c95c/scratchpad/
//   verify-decoy-depth.ts → 리포 scripts/_tmp-decoy-depth.ts 로 복사 후
//   `npx tsx scripts/_tmp-decoy-depth.ts`.
// ============================================================================

import { normalizeWs, type MdGrammarQuestion } from "./parser";

/** 게이트 활성 여부 — off 면 빈 배열(전면 무력화). */
export function isGrammarKillerDecoyDepthGateEnabled(): boolean {
  return (
    process.env.QGEN_GRAMMAR_KILLER_DECOY_DEPTH_GATE?.trim().toLowerCase() !==
    "off"
  );
}

/** 미끼 4개 중 판단 깊이를 가져야 하는 최소 개수(양성 조건의 임계). */
const MIN_DEEP_DECOYS = 1;
/** 주어핵 좌측 스캔 상한(토큰) — 문장 시작을 넘지 않고 이 안에서만 훑는다. */
const SUBJECT_SCAN_LIMIT = 25;
/** 병렬 짝 후보를 세는 등위접속사 좌측 창(P4-i 명세 12토큰). */
const PARALLEL_LOOKBACK = 12;
/** 대명사 경쟁 선행사 탐색 창(P4-g 명세 5~10토큰 → 여유 12). */
const PRONOUN_ANTECEDENT_WINDOW = 12;
/** 관계사 선행사가 '붙어 있다'고 보는 거리 — 이 이상 떨어지면 수식어가 개입한 것. */
const REL_ANTECEDENT_GAP = 3;

// ── 사전 ────────────────────────────────────────────────────────────────────
const lex = (s: string): Set<string> => new Set(s.trim().split(/\s+/));

const BE_FORMS = lex("is are was were am be been being");
const AUX_FIN = lex("is are was were am has have had do does did");
const MODALS = lex("will would can could may might shall should must");
/** 한정사 — 수를 직접 확정한다(P4-d 명세). */
const DET_SG = lex("a an each every one this another either neither");
const DET_PL = lex(`these those many several both few two three four five six
  seven eight nine ten multiple numerous various`);
/** 수 중립 한정사 — 만나면 한정사 스캔을 멈춘다. */
const DET_NEUTRAL = lex("the its his her their our my your some any all most such no that");
/** -s 로 끝나지만 단수인 표면(P4-d 명세 SING_S_LEX + 기능어 오탐 방어). */
const SING_S_LEX = lex(`analysis process business species series means news physics
  economics crisis basis thesis focus status campus bias census virus apparatus
  consensus lens this is was has does its us his yes less always perhaps unless
  across thus plus`);
/** 불규칙 복수(P4-d 명세 IRREG_PL). */
const IRREG_PL = lex("people children men women data criteria media phenomena mice geese feet teeth");
const PRON_NUMBER = new Map<string, "SG" | "PL">([
  ["it", "SG"], ["he", "SG"], ["she", "SG"], ["this", "SG"], ["one", "SG"],
  ["they", "PL"], ["we", "PL"], ["these", "PL"], ["those", "PL"], ["both", "PL"],
]);
/** 개입 전치사구를 만드는 전치사(P5 IV 명세 of/in/on/with/between/among + 확장). */
const PREPS = lex(`of in on with between among for from through by at within across
  about against into over under during upon toward towards beyond without around
  along behind beside besides despite throughout onto`);
const RELATIVIZERS = lex("who whom whose which that");
const REL_HEADS = lex("who whom whose which that what where when");
const SUBORDINATORS = lex(`when while if unless although though once because as since
  after before whether until whenever wherever so whereas lest`);
const COORDINATORS = lex("and or but nor");
/**
 * 연결동사·사역동사 — 좌측 스캔의 **술어 경계**다. 이 정지 조건이 'become +
 * 형용사' 류 공식 자리를 얕음으로 남긴다(shared.ts LINKING_VERB_BEFORE_TARGET 계열).
 */
const LINKING_VERBS = lex(`become becomes became becoming seem seems seemed remain
  remains remained appear appears appeared stay stays stayed prove proves proved
  grow grows grew turn turns turned get gets got feel feels felt look looks looked
  sound sounds sounded let lets make makes made help helps helped`);
/** 좌측 스캔에서 그냥 건너뛰는 부사·부정어(shared.ts INTERVENING_SKIP_TOKENS 규약). */
const ADV_SKIP = lex(`really also often still now just even never always sometimes
  usually actually certainly probably truly indeed not only already yet then thus
  however therefore perhaps rather quite very too more less much well far again`);
/** 인칭·재귀·소유 대명사 — g코드(대명사) 표면 게이트. */
const PERSONAL_PRONOUNS = lex(`it its itself they them their theirs themselves he him
  his himself she her hers herself one ones oneself`);
/** `수량사 + of` 로 NP 를 이끄는 표면 — 그 자체가 주어핵이다(P2 'one of + 복수' 계열). */
const QUANT_HEADS = lex(`much many most some all none one each either neither both few
  several half majority number rest part plenty any two three percent`);
/** 형용사로 흔한 접미 — 명사 앞 수식어를 건너뛸 때 쓴다. */
const ADJ_SUFFIX =
  /(?:er|est|ive|al|ous|ful|able|ible|ic|ary|ant|ent|ish|ial|ical|less)$/;

const clean = (w: string): string =>
  w.replace(/[^A-Za-z'’-]/g, "").toLowerCase();
const SENT_END_RE = /[.!?]["'”’)\]]*$/;
const DASH_RE = /^[—–―-]+$/;
const hasComma = (raw: string): boolean => raw.includes(",");

// ── 토큰·마킹 읽기 ──────────────────────────────────────────────────────────
interface DepthSite {
  label: string;
  /** 밑줄 첫 단어(정제형). */
  head: string;
  /** 지문 토큰열에서의 밑줄 시작 인덱스. */
  index: number;
  /** 밑줄 앞부분 토큰(정제형, 최대 3개) — "in which" 처럼 핵이 2번째인 자리를 잡는다. */
  span: string[];
  /** 모델이 출력한 포인트 코드(a~m). 기출 복원본에는 없다. */
  code: string;
}

/**
 * markedPassage(`[[A:표현]]`)에서 마커를 제거한 토큰열과 각 라벨의 위치를 얻는다.
 * markedPassage 가 없거나 마킹이 2개 미만이면 null(게이트 미발화).
 */
function readSites(
  q: MdGrammarQuestion,
): { tokens: string[]; sites: DepthSite[] } | null {
  const marked = normalizeWs(q.markedPassage);
  if (!marked) return null;
  const codeByLabel = new Map(
    (q.marks ?? []).map((m) => [m.label, (m.code ?? "").trim().toLowerCase()]),
  );
  const re = /\[\[([A-J])\s*:\s*([^\]]*)\]\]/g;
  let plain = "";
  let last = 0;
  const raw: { label: string; charOffset: number; expr: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(marked))) {
    plain += marked.slice(last, m.index);
    raw.push({ label: `(${m[1]})`, charOffset: plain.length, expr: m[2].trim() });
    plain += m[2].trim();
    last = m.index + m[0].length;
  }
  plain += marked.slice(last);
  if (raw.length < 2) return null;
  const tokens = plain.split(/\s+/).filter(Boolean);
  const sites = raw.map((r) => {
    const words = r.expr.split(/\s+/).filter(Boolean).slice(0, 3).map(clean);
    return {
      label: r.label,
      head: words[0] ?? "",
      index: plain.slice(0, r.charOffset).split(/\s+/).filter(Boolean).length,
      span: words,
      code: codeByLabel.get(r.label) ?? "",
    };
  });
  return { tokens, sites };
}

// ── 원자 판정기 ─────────────────────────────────────────────────────────────
function sentenceStart(tokens: string[], i: number): number {
  for (let j = i - 1; j >= 0; j -= 1) if (SENT_END_RE.test(tokens[j] ?? "")) return j + 1;
  return 0;
}
function sentenceEnd(tokens: string[], i: number): number {
  for (let j = i; j < tokens.length; j += 1) if (SENT_END_RE.test(tokens[j] ?? "")) return j;
  return tokens.length - 1;
}

/** 정형(정동사) 표면인가 — be·have·do·조동사, 또는 -s/-ed 형. */
function isFiniteForm(w: string): boolean {
  if (!w) return false;
  if (AUX_FIN.has(w) || MODALS.has(w)) return true;
  if (/[^s]s$/.test(w) && !SING_S_LEX.has(w) && !IRREG_PL.has(w) && w.length >= 4) {
    return true;
  }
  if (/ed$/.test(w) && w.length >= 4) return true;
  return false;
}

/** 명사 후보인가 — 기능어·분사·부사를 뺀 잔여(shared.ts 크루드 규약과 동형). */
function isNounish(tokens: string[], j: number): boolean {
  const w = clean(tokens[j] ?? "");
  if (!w || w.length < 2) return false;
  // 수량사 + of 는 그 자체가 주어핵이다("Much of learning occurs" · "One of them is").
  if (QUANT_HEADS.has(w) && clean(tokens[j + 1] ?? "") === "of") return true;
  if (PRON_NUMBER.has(w) || PERSONAL_PRONOUNS.has(w)) return true;
  if (
    BE_FORMS.has(w) || AUX_FIN.has(w) || MODALS.has(w) || PREPS.has(w) ||
    REL_HEADS.has(w) || SUBORDINATORS.has(w) || COORDINATORS.has(w) ||
    DET_SG.has(w) || DET_PL.has(w) || DET_NEUTRAL.has(w) || ADV_SKIP.has(w)
  ) {
    return false;
  }
  if (/ly$/.test(w)) return false;
  if (/(?:ing|ed)$/.test(w)) return false; // 분사는 명사핵으로 세지 않는다
  return true;
}

/** 명사 앞 수식어(한정사·형용사·부사)인가 — 좌측 수식어 건너뛰기용. */
function isPreNounModifier(raw: string): boolean {
  if (hasComma(raw) || DASH_RE.test(raw)) return false;
  const w = clean(raw);
  if (!w) return false;
  if (DET_SG.has(w) || DET_PL.has(w) || DET_NEUTRAL.has(w)) return true;
  if (ADV_SKIP.has(w)) return true;
  if (/ly$/.test(w)) return true;
  return ADJ_SUFFIX.test(w) && !AUX_FIN.has(w) && !MODALS.has(w);
}

/** 명사(또는 대명사)의 수 — P4-d 명세(한정사 우선 → -s → 불규칙). */
function numberOf(tokens: string[], j: number): "SG" | "PL" | null {
  const w = clean(tokens[j] ?? "");
  if (!w) return null;
  const pron = PRON_NUMBER.get(w);
  if (pron) return pron;
  for (let k = j - 1; k >= 0 && k >= j - 3; k -= 1) {
    const raw = tokens[k] ?? "";
    if (hasComma(raw) || DASH_RE.test(raw)) break;
    const d = clean(raw);
    if (DET_SG.has(d) || /^1\b/.test(raw)) return "SG";
    if (DET_PL.has(d) || /^[2-9]\d*\b/.test(raw)) return "PL";
    if (DET_NEUTRAL.has(d)) break;
    if (!isPreNounModifier(raw)) break;
  }
  if (IRREG_PL.has(w)) return "PL";
  if (/[^s]s$/.test(w) && !SING_S_LEX.has(w)) return "PL";
  return "SG";
}

/**
 * 명사 j 를 지배하는 전치사의 인덱스 — 없으면 null(= 맨 명사).
 * NP 내부 수식어를 최대 4토큰 건너뛰되, 콤마·대시·등위·종속·관계사·술어표지를
 * 만나면 즉시 중단한다. 접미 규칙(-ive/-al …)에 안 걸리는 흔한 형용사(new·long)
 * 때문에 전치사구를 통째로 놓치던 구멍을 막는다.
 */
function governingPrep(tokens: string[], j: number, start: number): number | null {
  let k = j - 1;
  let steps = 0;
  while (k >= start && steps < 4) {
    const raw = tokens[k] ?? "";
    const w = clean(raw);
    if (PREPS.has(w)) return k;
    if (hasComma(raw) || DASH_RE.test(raw)) return null;
    if (
      BE_FORMS.has(w) || AUX_FIN.has(w) || MODALS.has(w) ||
      LINKING_VERBS.has(w) || w === "to" ||
      COORDINATORS.has(w) || SUBORDINATORS.has(w) || RELATIVIZERS.has(w)
    ) {
      return null;
    }
    k -= 1;
    steps += 1;
  }
  return null;
}

/** 밑줄 직전 최근접 명사(부사·한정사·분사만 건너뛴다 — 전치사구는 건너뛰지 않는다). */
function nearestLeftNoun(tokens: string[], i: number): number | null {
  const start = sentenceStart(tokens, i);
  for (let j = i - 1; j >= start && j >= i - 8; j -= 1) {
    if (isNounish(tokens, j)) return j;
  }
  return null;
}

/**
 * 밑줄의 **지배 명사핵**을 왼쪽으로 찾으면서 그 사이에 낀 **개입요소**를 모은다(P5 IV).
 *
 * 규약(불량 실물 네 자리를 정확히 얕음으로 남기려고 이렇게 좁혔다):
 *  - 전치사구는 '건너뛰며' 개입요소로 센다(of/in/with … 구가 낀 장거리 자리).
 *  - 관계사는 선행사가 있을 때만 절 경계로 보고 건너뛰며 개입요소로 센다
 *    ("changes that cause serious damage lead" → 주어핵 changes, IV=관계절).
 *  - 종속접속사·등위접속사·be/조동사/to/연결동사를 만나면 **거기서 끝**이다
 *    (지배 명사핵이 이 창에 없다는 뜻 → index=null → 신호 미발화).
 *    이 정지 조건이 'become + 형용사' · 'when + p.p.' · 'what + 완전절' 을
 *    얕음으로 남긴다.
 *  - 콤마 단독은 개입요소가 아니다(도입 부사구 콤마 오탐 — X1 'For the same
 *    reasons, taller people have …' 가 여기에 걸렸다). 명세대로 **쌍**만 센다.
 */
function scanSubjectHead(
  tokens: string[],
  i: number,
): { index: number | null; iv: string[] } {
  const start = Math.max(sentenceStart(tokens, i), i - SUBJECT_SCAN_LIMIT);
  const iv: string[] = [];
  let committed: number | null = null;
  let commas = 0;
  let j = i - 1;
  while (j >= start) {
    const rawTok = tokens[j] ?? "";
    const w = clean(rawTok);
    if (hasComma(rawTok) && j < i - 1) commas += 1;
    // 관계사 + 선행사 → 관계절 경계. 이미 잡아둔 명사핵은 그 절 안이므로 강등한다.
    if (RELATIVIZERS.has(w) && j - 1 >= start && isNounish(tokens, j - 1)) {
      iv.push(`관계사 '${w}' 절`);
      committed = null;
      j -= 1;
      continue;
    }
    if (committed !== null) {
      // 명사핵 확정 뒤에는 '관계절 강등'만 살핀다 — 관계절 자신의 조동사(that have
      // come into common usage are …)를 넘어가야 진짜 선행사에 닿는다.
      if (SUBORDINATORS.has(w) || COORDINATORS.has(w) || w === "to") break;
      j -= 1;
      continue;
    }
    if (DASH_RE.test(rawTok)) {
      iv.push("대시 삽입구");
      j -= 1;
      continue;
    }
    if (SUBORDINATORS.has(w) || COORDINATORS.has(w)) return { index: null, iv };
    // 연결·사역동사는 **밑줄에 붙어 있을 때만** 술어 경계다 — 멀리 있는 동형 명사
    // (human remains · summer looks)를 경계로 오인하면 수일치 자리를 통째로 놓친다.
    if (LINKING_VERBS.has(w) && j >= i - 2) return { index: null, iv };
    if (BE_FORMS.has(w) || AUX_FIN.has(w) || MODALS.has(w) || w === "to") {
      return { index: null, iv }; // 술어 경계 — 지배 명사핵이 이 창에 없다
    }
    if (PREPS.has(w)) {
      iv.push(`전치사 '${w}'구`);
      j -= 1;
      continue;
    }
    if (isNounish(tokens, j)) {
      // 이 명사가 전치사의 목적어면 지배핵이 아니다 → 전치사 왼쪽으로 계속 간다.
      const gp = governingPrep(tokens, j, start);
      if (gp !== null) {
        iv.push(`전치사 '${clean(tokens[gp] ?? "")}'구`);
        j = gp - 1;
        continue;
      }
      committed = j;
      j -= 1;
      continue;
    }
    if (/(?:ing|ed|en)$/.test(w) && !BE_FORMS.has(w) && j < i - 1) iv.push("분사구");
    j -= 1;
  }
  if (commas >= 2) iv.push("콤마쌍 삽입구");
  return { index: committed, iv };
}

/** 관계사절 안에 결손 슬롯(주어/전치사 목적어)이 있는가 — P4-b. */
function relClauseHasGap(tokens: string[], i: number): boolean {
  const end = sentenceEnd(tokens, i);
  let j = i + 1;
  while (
    j <= end &&
    (ADV_SKIP.has(clean(tokens[j] ?? "")) || /ly$/.test(clean(tokens[j] ?? "")))
  ) {
    j += 1;
  }
  if (j > end) return true;
  const nextw = clean(tokens[j] ?? "");
  // 관계사 직후가 곧바로 동사면 주어 결손.
  if (isFiniteForm(nextw) || BE_FORMS.has(nextw) || MODALS.has(nextw)) return true;
  // 절 끝(콤마 또는 문장끝) 직전이 전치사면 전치사 목적어 결손(전치사 좌초).
  let k = j;
  while (k < end && !hasComma(tokens[k] ?? "")) k += 1;
  if (PREPS.has(clean(tokens[k] ?? ""))) return true;
  return false;
}

/** 등위접속사 좌측 창에서 병렬 짝 후보 '유형'을 센다 — P4-i. */
function parallelPartnerTypes(tokens: string[], coordIdx: number): Set<string> {
  const start = Math.max(
    sentenceStart(tokens, coordIdx),
    coordIdx - PARALLEL_LOOKBACK,
  );
  const types = new Set<string>();
  for (let j = start; j < coordIdx; j += 1) {
    const w = clean(tokens[j] ?? "");
    const prev = clean(tokens[j - 1] ?? "");
    if (!w) continue;
    if (w === "to" && j + 1 < coordIdx) {
      types.add("to부정사");
      continue;
    }
    if (MODALS.has(prev) || AUX_FIN.has(prev)) {
      types.add("조동사+원형");
      continue;
    }
    if (/ing$/.test(w)) {
      types.add(PREPS.has(prev) ? "전치사+V-ing" : "V-ing");
      continue;
    }
    if (isFiniteForm(w)) {
      types.add("정동사");
      continue;
    }
    if (isNounish(tokens, j)) types.add("명사구");
  }
  return types;
}

// ── 판단 깊이 술어 ──────────────────────────────────────────────────────────
export interface DecoyDepthVerdict {
  label: string;
  head: string;
  code: string;
  /** 판단 깊이가 있는가. */
  deep: boolean;
  /** 발화한 깊이 신호(빈 배열이면 얕음). */
  signals: string[];
  /** 공식 자리 사전에 걸린 이름(null 이면 사전 밖 자리). */
  formula: string | null;
}

/**
 * 한 밑줄 자리가 '판단 깊이'를 갖는지 판정한다. 신호는 전부 표면 자체 게이팅이라
 * code 가 없어도(기출 복원본) 동일하게 작동하고, code 는 표면이 애매할 때 해당
 * 신호를 추가로 여는 데만 쓴다.
 */
function judgeDepth(tokens: string[], site: DepthSite): DecoyDepthVerdict {
  const { head, index: i, code, span } = site;
  const signals: string[] = [];
  // 밑줄 핵이 2번째 토큰인 자리("in which" · "greatly exceed")를 놓치지 않도록
  // 앞 3토큰에서 정동사/관계사를 찾아 그 지점을 신호 앵커로 쓴다.
  const verbAt = span.findIndex(
    (w) => AUX_FIN.has(w) || MODALS.has(w) || BE_FORMS.has(w) || isFiniteForm(w),
  );
  const relAt = span.slice(0, 2).findIndex((w) => REL_HEADS.has(w));
  const verbalish = verbAt >= 0 || code === "d" || code === "e";
  const relish = relAt >= 0 || code === "b";
  const pronish = PERSONAL_PRONOUNS.has(head) || code === "g";

  // ① 지배 명사핵까지의 개입요소 — 모든 자리에 공통(P5 IV).
  //    let+원형 · become+형용사 · when+p.p. · what+완전절 은 술어 경계에서 스캔이
  //    끊겨 index=null 이 되므로 여기서 발화하지 않는다.
  const subj = scanSubjectHead(tokens, i);
  if (subj.index !== null && subj.iv.length > 0) {
    signals.push(
      `지배 명사핵 '${clean(tokens[subj.index] ?? "")}' 와 밑줄 사이 개입요소 ${subj.iv.length}개(${subj.iv.slice(0, 3).join("·")})`,
    );
  }

  // ② 수일치·태 자리(d/e) — 밑줄 직전 명사의 수가 주어핵과 어긋난다(MISMATCH).
  if (verbalish && subj.index !== null) {
    const anchor = i + Math.max(verbAt, 0);
    const near = nearestLeftNoun(tokens, anchor);
    if (near !== null && near !== subj.index) {
      const a = numberOf(tokens, near);
      const b = numberOf(tokens, subj.index);
      if (a && b && a !== b) {
        signals.push(
          `인접명사 '${clean(tokens[near] ?? "")}'(${a}) 와 주어핵 '${clean(tokens[subj.index] ?? "")}'(${b}) 의 수 불일치`,
        );
      }
    }
  }

  // ③ 관계사·접속사 자리(b) — 선행사가 떨어져 있거나 뒤 절에 결손이 없다(분기 2).
  //    code==="b" 면 표면이 관계사로 안 보여도 이 검사를 연다(프로덕션 전용 완화).
  if (relish) {
    const anchor = i + Math.max(relAt, 0);
    const ante = nearestLeftNoun(tokens, anchor);
    if (ante !== null && anchor - ante >= REL_ANTECEDENT_GAP) {
      signals.push(
        `선행사 '${clean(tokens[ante] ?? "")}' 가 ${anchor - ante}토큰 떨어져 수식어가 개입`,
      );
    } else if (ante !== null && !relClauseHasGap(tokens, anchor)) {
      signals.push("뒤 절에 결손 슬롯이 없어 관계대명사/관계부사 분기가 발생");
    }
  }

  // ③ 병렬 자리(i) — 밑줄이 등위접속사의 뒤 항이고 짝 후보 유형이 2종 이상.
  let coordIdx = -1;
  if (COORDINATORS.has(clean(tokens[i - 1] ?? ""))) coordIdx = i - 1;
  else if (
    COORDINATORS.has(clean(tokens[i - 2] ?? "")) &&
    (ADV_SKIP.has(clean(tokens[i - 1] ?? "")) || /ly$/.test(clean(tokens[i - 1] ?? "")))
  ) {
    coordIdx = i - 2;
  }
  if (coordIdx >= 0) {
    const types = parallelPartnerTypes(tokens, coordIdx);
    if (types.size >= 2) {
      signals.push(
        `등위 '${clean(tokens[coordIdx] ?? "")}' 의 병렬 짝 후보가 ${types.size}유형(${[...types].slice(0, 3).join("·")})`,
      );
    }
  }

  // ④ 대명사 자리(g) — 지배 술어가 준동사이거나 같은 수의 경쟁 선행사가 2개 이상.
  if (pronish) {
    const start = Math.max(sentenceStart(tokens, i), i - PRONOUN_ANTECEDENT_WINDOW);
    const mine: "SG" | "PL" =
      PRON_NUMBER.get(head) ??
      (head === "themselves" || head === "their" || head === "them" || head === "theirs"
        ? "PL"
        : "SG");
    let rivals = 0;
    for (let j = start; j < i - 1; j += 1) {
      if (!isNounish(tokens, j)) continue;
      if (numberOf(tokens, j) === mine) rivals += 1;
    }
    if (rivals >= 2) {
      signals.push(
        `같은 수(${mine})의 경쟁 선행사 ${rivals}개가 좌측 ${PRONOUN_ANTECEDENT_WINDOW}토큰 안에 존재`,
      );
    }
    for (let j = i - 1; j >= start; j -= 1) {
      const w = clean(tokens[j] ?? "");
      if (isFiniteForm(w) || BE_FORMS.has(w) || MODALS.has(w)) break;
      if (/ing$/.test(w)) {
        signals.push(`지배 술어가 준동사 '${w}' 라 지시·수 판정이 분기`);
        break;
      }
    }
  }

  // ⑤ 콤마쌍 삽입구 직후 자리(P5 APPOS) — `명사 , …삽입… , 밑줄` 형상.
  //    지배어가 삽입구 너머에 있어 학생이 삽입구를 걷어내야 판정이 선다.
  //    ("factories of energy, called mitochondria, ①that burn …" ·
  //     "what we really want, it seems, ①is to stop wanting")
  //    ※ 도입 부사구 콤마 하나(‘For example, …’)로는 발화하지 않도록 **쌍**을 요구하고,
  //      삽입 길이를 6토큰으로 제한한다(불량 실물 ④what 은 12토큰이라 미발화).
  if (hasComma(tokens[i - 1] ?? "")) {
    const floor = Math.max(sentenceStart(tokens, i), i - 8);
    for (let j = i - 2; j >= floor && j >= i - 7; j -= 1) {
      if (!hasComma(tokens[j] ?? "")) continue;
      if (j >= floor && isNounish(tokens, j)) {
        signals.push(
          `콤마쌍 삽입구(${i - 1 - j}토큰)가 지배어 '${clean(tokens[j] ?? "")}' 와 밑줄 사이에 끼어 있음`,
        );
      }
      break;
    }
  }

  // ⑥ 동명사·부정사 주어 뒤 자리 — 문두 -ing/to 주어는 수·태 판정이 분기한다.
  //    ("Adapting novels ①is one of …" · "Filming plays ④did not encourage")
  if (verbalish) {
    const st = sentenceStart(tokens, i);
    if (st < i && /ing$/.test(clean(tokens[st] ?? "")) && i - st <= 4) {
      signals.push(
        `문두 동명사구 주어 '${clean(tokens[st] ?? "")}' — 단수 취급 여부가 분기`,
      );
    }
  }

  // ⑦ 분사구문 선행 배치 — 밑줄이 문두 분사이고 통제 주어가 콤마 뒤 오른쪽에 있다.
  if (/(?:ing|ed|en)$/.test(head) && i === sentenceStart(tokens, i)) {
    const end = sentenceEnd(tokens, i);
    for (let j = i + 1; j <= Math.min(end, i + 10); j += 1) {
      if (!hasComma(tokens[j] ?? "")) continue;
      if (j + 1 <= end && isNounish(tokens, j + 1) && j - i >= 2) {
        signals.push(
          `문두 분사구문 — 통제 주어가 ${j + 1 - i}토큰 뒤(콤마 뒤)라 태·주어 판정이 역방향`,
        );
      }
      break;
    }
  }

  return {
    label: site.label,
    head,
    code,
    deep: signals.length > 0,
    signals,
    formula: formulaSlot(tokens, site),
  };
}

/** 사역·지각동사 — 목적격보어 원형 자리를 만든다(F1). */
const CAUSATIVE_PERCEPTION = lex(`let lets make makes made have has had help helps
  helped see sees saw watch watches watched hear hears heard feel feels felt
  notice notices noticed observe observes observed`);

/** NP 내부 재료인가 — 사역동사와 원형 사이의 목적어를 훑을 때 쓴다. */
function isNpMaterial(tokens: string[], j: number): boolean {
  const w = clean(tokens[j] ?? "");
  if (!w) return false;
  if (COORDINATORS.has(w)) return true;
  if (DET_SG.has(w) || DET_PL.has(w) || DET_NEUTRAL.has(w)) return true;
  if (PERSONAL_PRONOUNS.has(w) || PRON_NUMBER.has(w)) return true;
  if (isPreNounModifier(tokens[j] ?? "")) return true;
  return isNounish(tokens, j);
}

/**
 * 이 자리가 **공식 자리**(한국 커리큘럼이 형태를 한 방에 확정해 주는 슬롯)인가.
 * 불량 실물 네 자리가 정확히 F1·F2·F3·F4 다. 반환값은 그대로 재생성 피드백이 된다.
 */
function formulaSlot(tokens: string[], site: DepthSite): string | null {
  const { head, index: i } = site;
  if (!head) return null;
  const prev = clean(tokens[i - 1] ?? "");
  const prev2 = clean(tokens[i - 2] ?? "");
  const bare =
    /^[a-z][a-z'’-]*$/.test(head) && !/(?:ing|ed|s)$/.test(head) &&
    !AUX_FIN.has(head) && !BE_FORMS.has(head) && !MODALS.has(head);

  // F1 사역·지각동사 + 목적어 + 원형 (실물 ② let the poetic form or archaic word usage get
  //    — 목적어 NP 가 6토큰이라 창을 10 으로 둔다. NP 재료가 끊기면 즉시 중단하므로
  //    창을 넓혀도 다른 자리로 새지 않는다).
  if (bare) {
    const floor = Math.max(sentenceStart(tokens, i), i - 10);
    for (let j = i - 1; j >= floor; j -= 1) {
      if (CAUSATIVE_PERCEPTION.has(clean(tokens[j] ?? ""))) {
        return `사역·지각동사 '${clean(tokens[j] ?? "")}' + 원형`;
      }
      if (!isNpMaterial(tokens, j)) break;
    }
  }
  // F2 연결동사·be + 보어 (실물 ③ become clear)
  if ((LINKING_VERBS.has(prev) || BE_FORMS.has(prev)) && !isFiniteForm(head)) {
    return `연결동사 '${prev}' + 보어`;
  }
  // F3 선행사 없는 what (실물 ④ what is left)
  if (head === "what") return "선행사 없는 what 절";
  // F4 종속접속사 + 분사 (실물 ⑤ when performed)
  if (
    (SUBORDINATORS.has(prev) ||
      (SUBORDINATORS.has(prev2) && (ADV_SKIP.has(prev) || /ly$/.test(prev)))) &&
    /(?:ing|ed|en)$/.test(head)
  ) {
    return `종속접속사 '${SUBORDINATORS.has(prev) ? prev : prev2}' + 분사`;
  }
  // F5 전치사 + 동명사
  if (PREPS.has(prev) && /ing$/.test(head)) return `전치사 '${prev}' + 동명사`;
  // F6 조동사·be·have + 원형/분사
  if (MODALS.has(prev) || AUX_FIN.has(prev) || BE_FORMS.has(prev)) {
    return `조동사 '${prev}' 직후`;
  }
  // F7 to 부정사
  if (head === "to" || prev === "to") return "to 직후 원형";
  // F8 관사 + 명사
  if (prev === "a" || prev === "an" || prev === "the") return `관사 '${prev}' 직후`;
  return null;
}

/**
 * 진단용 순수 함수 — 밑줄별 판단 깊이 판정을 그대로 돌려준다(하네스·검수용).
 * markedPassage 가 없으면 null.
 */
export function inspectDecoyDepth(
  q: MdGrammarQuestion,
): { verdicts: DecoyDepthVerdict[]; answerLabels: string[] } | null {
  const read = readSites(q);
  if (!read) return null;
  const answerLabels = (q.answers?.length ? q.answers : [q.answer]).filter(Boolean);
  return {
    verdicts: read.sites.map((s) => judgeDepth(read.tokens, s)),
    answerLabels,
  };
}

/**
 * 미끼 양성 조건 집행 — 정답을 제외한 미끼 4개 중 **최소 1개**가 판단 깊이를
 * 가져야 한다. 전부 얕으면(= 공식 자리로만 채우면) 재생성 피드백 1건을 낸다.
 *
 * @param q 파싱된 어법 문항(markedPassage 필수 — v2 레인 전용)
 * @param requestedDifficulty 요청 난이도. "KILLER" 가 아니면 항상 빈 배열.
 */
export function gateGrammarKillerDecoyDepth(
  q: MdGrammarQuestion,
  requestedDifficulty: string | undefined,
): string[] {
  if (String(requestedDifficulty ?? "").trim().toUpperCase() !== "KILLER") return [];
  if (!isGrammarKillerDecoyDepthGateEnabled()) return [];
  const read = readSites(q);
  if (!read) return [];
  const answerLabels = new Set(
    (q.answers?.length ? q.answers : [q.answer]).filter(Boolean),
  );
  const decoys = read.sites.filter((s) => !answerLabels.has(s.label));
  if (decoys.length < 2) return [];

  const verdicts = decoys.map((s) => judgeDepth(read.tokens, s));
  if (verdicts.filter((v) => v.deep).length >= MIN_DEEP_DECOYS) return [];
  // 좁힘 조건 — 「깊이 0」만으로는 실기출 4건(2.6%)이 걸린다(20160602·2013_06·
  // 20111115·20090714). 그 4건은 전부 미끼 중 하나가 공식 자리 사전 **밖**이었다.
  // 그래서 "깊이 0 && 넷 다 공식 자리 사전 히트" 를 요구해 오반려 0.0% 를 만든다.
  if (verdicts.some((v) => v.formula === null)) return [];

  const detail = verdicts
    .map((v) => `${v.label} '${v.head}'(${v.formula})`)
    .join(" · ");
  return [
    `미끼 ${verdicts.length}개가 전부 '공식 자리'라 판단이 분기하지 않는다 — ${detail}. 밑줄 직전 1~2토큰이 형태를 확정해 버려서 상위권은 넷 다 즉시 넘긴다(실질 선택지 1개). 최소 한 개는 판단 깊이를 갖는 자리로 옮겨라 — (a) 주어핵과 밑줄 사이에 관계절·콤마쌍 삽입구·of/in/with 전치사구를 끼우고 밑줄 직전 명사의 수를 주어핵과 반대로 두거나, (b) 등위접속사 바로 뒤 항으로 두되 좌측 12단어 안에 병렬 짝 후보가 2유형 이상이게 하거나, (c) 관계사 뒤를 결손 없는 완전한 절로 만들어 관계대명사/관계부사가 갈리게 하라.`,
  ];
}
