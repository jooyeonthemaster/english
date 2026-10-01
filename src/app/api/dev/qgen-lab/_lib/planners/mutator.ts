// qgen-lab 오형 제안기(코드 규칙, LLM 0콜) — 후보 자리마다 틀린 형태 ≤3개.
// 원천: calib/d5d6-distance-temptation/mutate.mjs(MAP·활용 규칙) + calib/d7-validity/strained.mjs 의 pos-mutator 기제
// (-ing 복합어→원형 "eat patterns", be p.p.→be V-ing "were telling", be p.p.→be 원형 "were offer",
//  begin V-ing→begin 원형, 정동사 과거→V-ing "conditions improving") — build-fixtures.mjs 가 pos-mutator 층으로 묶은 것.
// PLANNER-SPEC §1 범주: 정동사↔준동사, 수일치, 관계사·접속사, 대명사, 태, 형용사↔부사, 병렬(to V↔V-ing), 비교.
// 정렬: 단어 수 보존형 먼저. 결손형(in which→which, to V→V)은 deletion 플래그. 유효성 판정은 jev D7(validityClsEx)이 한다.
import { BE, CONJ, DO, HAVE, MODAL, PREP, REL, type SiteCandidate } from "./candidates";
import {
  adjOf, advOf, baseOfEd, baseOfIng, baseOfS, ingOf, isVerbBase, matchCase, ppOf, s3Of,
} from "./mutator-utils";

export interface WrongFormProposal {
  /** 자리 span(c.word) 을 대체할 오형 표면. */
  wrong: string;
  rule: string;
  /** 추정 포인트 코드(a~m) — 확정은 D4 categoryPair. */
  code: string;
  /** 오형 단어 수 − 원형 단어 수. */
  wordDelta: number;
  /** 결손형: 원형 단어열에서 단어만 지운 형태(in which→which, to perceive→perceive). */
  deletion: boolean;
}

// mutate.mjs MAP 중 관계사·대명사·비교·접속사(동사류는 아래 규칙이 맡는다). 값 = 우선순위순 후보.
const REL_MAP: Record<string, string[]> = {
  that: ["what", "which"], what: ["that", "which"], which: ["what", "where", "whose"], where: ["which", "what"],
  who: ["which", "whose"], whom: ["who", "which"], whose: ["which", "who"], when: ["which"], how: ["what"],
  why: ["which"], whether: ["what", "which"], if: ["what"], whoever: ["whomever"], whatever: ["whichever"],
  wherever: ["whatever"], whenever: ["whatever"], whichever: ["whatever"],
};
const PRON_MAP: Record<string, string[]> = {
  its: ["their"], itself: ["it", "themselves"], they: ["it"], them: ["it", "themselves"], their: ["its"],
  theirs: ["its"], themselves: ["them", "itself"], those: ["that"], these: ["this"], this: ["these"],
  one: ["ones"], ones: ["one"], he: ["him"], him: ["himself"], himself: ["him"], she: ["her"], her: ["herself"],
  herself: ["her"], we: ["us"], us: ["ourselves"], ourselves: ["us"], you: ["yourself"], yourself: ["you"],
  yourselves: ["you"], me: ["myself"], myself: ["me"],
};
const CMP_MAP: Record<string, string[]> = {
  much: ["very"], very: ["much"], many: ["much"], few: ["little"], little: ["few"], less: ["fewer"], fewer: ["less"],
  far: ["very"], even: ["very"],
};
const CONJ_MAP: Record<string, string[]> = {
  because: ["because of"], despite: ["although"], although: ["despite"], though: ["despite"], while: ["during"],
  during: ["while"], as: ["like"], like: ["alike"], unless: ["without"],
};
// 수일치(d)·정동사→준동사(a)·대용(g). 생략 자리(뒤가 구두점·전치사·끝)면 do/be 대용 교체를 더한다.
const AUX_MAP: Record<string, { d?: string; a?: string[]; sub?: string[] }> = {
  is: { d: "are", a: ["being"], sub: ["does"] }, are: { d: "is", a: ["being"], sub: ["do"] },
  was: { d: "were", a: ["being"], sub: ["did"] }, were: { d: "was", a: ["being"], sub: ["did"] },
  am: { d: "is" }, be: { a: ["being", "been"] }, been: { a: ["being", "be"] }, being: { a: ["been", "is", "are"] },
  has: { d: "have", a: ["having"], sub: ["did", "does"] }, have: { d: "has", a: ["having"], sub: ["do", "did"] },
  had: { a: ["having"], sub: ["did"] }, having: { a: ["have"] },
  does: { d: "do", sub: ["is"] }, do: { d: "does", sub: ["are"] }, did: { sub: ["was", "does"] },
};
const AUX_DEL = new Set(["and", "or", "but", "than", "as", "so", "too", "in", "on", "at", "for", "with", "to", "by", "from", "of"]);
// 목적격보어(h) 창: 사역·지각·allow 류 동사가 3단어 안에 있으면 원형↔to V↔V-ing 는 h.
const OC_H = new Set("make makes made making let lets letting have has had having help helps helped helping see sees saw seeing hear hears heard watch watches watched feel feels felt notice noticed allow allows allowed enable enables enabled cause causes caused keep keeps kept get gets got".split(" "));

export interface CandidateContext {
  left: string[]; // 같은 문장, 소문자 단어(가까운 것이 끝)
  next: string | null;
  /** 대상 바로 뒤가 구두점·문장 끝인가. */
  punctAfter: boolean;
  sentenceInitial: boolean;
}

export function candidateContext(c: Pick<SiteCandidate, "marked_sentence">): CandidateContext {
  const m = c.marked_sentence;
  const i = m.indexOf("⟦");
  const j = m.indexOf("⟧", i);
  const before = i >= 0 ? m.slice(0, i) : "";
  const after = j >= 0 ? m.slice(j + 1) : "";
  const left = (before.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []) as string[];
  const nextM = /^\s*([A-Za-z]+)/.exec(after);
  return {
    left,
    next: nextM ? nextM[1].toLowerCase() : null,
    punctAfter: /^\s*([,.;:!?)"”’—–-]|$)/.test(after),
    sentenceInitial: !/[A-Za-z]/.test(before),
  };
}

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

function isSubsequence(small: string[], big: string[]): boolean {
  let k = 0;
  for (const w of big) if (k < small.length && w === small[k]) k++;
  return k === small.length;
}

/**
 * 후보 자리의 오형 제안(≤max, 기본 3). 단어 수 보존형 우선, 같은 급 안에서는 규칙 우선순위.
 * 원형과 같은 형태·비단어(어휘집으로 확인 안 되는 활용)는 내지 않는다.
 */
export function proposeWrongForms(c: SiteCandidate, opts: { max?: number } = {}): WrongFormProposal[] {
  const max = opts.max ?? 3;
  const words = c.word.split(/\s+/).filter(Boolean);
  const head = words[words.length - 1] ?? "";
  const lw = head.toLowerCase();
  const x = candidateContext(c);
  const prev = x.left[x.left.length - 1] ?? null;
  const ocNear = x.left.slice(-4).some((w) => OC_H.has(w));
  const raw: { wrong: string; rule: string; code: string }[] = [];
  const push = (wrong: string | null | undefined, rule: string, code: string) => {
    if (wrong) raw.push({ wrong, rule, code });
  };
  const one = (w: string) => matchCase(c.word, w); // 단어 1개 자리: 대소문자 보존

  if (words.length === 2 && words[0].toLowerCase() === "to") {
    // to V: 병렬·to/-ing(k, 목적격보어 창이면 h) — 둘 다 단어 수 −1, 원형만 결손형
    const code = ocNear ? "h" : "k";
    if (isVerbBase(lw) && lw !== "be") push(ingOf(lw), "to-V→V-ing", code);
    push(head, "to-V→V", code);
  } else if (words.length === 2 && PREP.has(words[0].toLowerCase()) && (lw === "which" || lw === "whom")) {
    push(matchCase(c.word, lw), "prep+rel→rel", "b"); // in which → which (결손형)
  } else if (words.length === 1) {
    const aux = AUX_MAP[lw];
    if (aux) {
      if (aux.d) push(one(aux.d), "agreement", "d");
      for (const a of aux.a ?? []) push(one(a), "finite↔nonfinite", "a");
      const elliptical = x.punctAfter || (x.next !== null && AUX_DEL.has(x.next));
      if (elliptical) for (const s of aux.sub ?? []) push(one(s), "substitute-verb", "g");
    } else if (!MODAL.has(lw)) {
      if (REL.has(lw)) {
        if (lw === "that" && x.next === "of") push(one("those"), "pronoun", "g");
        // 콤마·전치사 뒤 관계사 → that 은 비문(계속적 용법·전치사+that)
        const afterCommaOrPrep = /,\s*$/.test(c.marked_sentence.slice(0, c.marked_sentence.indexOf("⟦"))) || (!!prev && PREP.has(prev));
        if (afterCommaOrPrep && (lw === "which" || lw === "whom" || lw === "who")) push(one("that"), "relative", "b");
        for (const r of REL_MAP[lw] ?? []) push(one(r), "relative", "b");
      }
      if (lw === "it") {
        // 목적어 자리(앞이 동사·전치사)면 them/itself, 아니면 they/that(가주어·대명사 대조)
        const objectPos = !!prev && (PREP.has(prev) || isVerbBase(prev) || !!baseOfEd(prev) || !!baseOfS(prev));
        for (const r of objectPos ? ["them", "itself"] : ["they", "that"]) push(one(r), "pronoun", "g");
      }
      for (const r of PRON_MAP[lw] ?? []) push(one(r), "pronoun", "g");
      for (const r of CONJ_MAP[lw] ?? []) push(one(r), "prep↔conj", "l");
      for (const r of CMP_MAP[lw] ?? []) push(one(r), "comparison", "m");
      if (!BE.has(lw) && !HAVE.has(lw) && !DO.has(lw) && !CONJ.has(lw)) verbRules(c, lw, x, prev, ocNear, push, one);
      if (c.tags.includes("adj")) push(advOf(lw) && one(advOf(lw)!), "adj→adv", "f");
      if (c.tags.includes("adv-ly")) push(adjOf(lw) && one(adjOf(lw)!), "adv→adj", "f");
    }
  }

  const origWords = words.map((w) => w.toLowerCase());
  const seen = new Set<string>([c.word.toLowerCase()]);
  const out: (WrongFormProposal & { order: number })[] = [];
  raw.forEach((r, order) => {
    const key = r.wrong.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const wrongWords = r.wrong.toLowerCase().split(/\s+/);
    const wordDelta = wc(r.wrong) - words.length;
    out.push({
      wrong: r.wrong,
      rule: r.rule,
      code: r.code,
      wordDelta,
      deletion: wordDelta < 0 && isSubsequence(wrongWords, origWords),
      order,
    });
  });
  out.sort((a, b) => Number(a.wordDelta !== 0) - Number(b.wordDelta !== 0) || a.order - b.order);
  return out.slice(0, max).map((p) => ({ wrong: p.wrong, rule: p.rule, code: p.code, wordDelta: p.wordDelta, deletion: p.deletion }));
}

type Push = (wrong: string | null | undefined, rule: string, code: string) => void;

/** -ing 어간 → 과거분사(원형 미상일 때): agree-ing→agreed, worry-ing→worried, frustrat-ing→frustrated. */
function ppFromIngStem(s: string): string {
  if (s.endsWith("ee")) return s + "d";
  if (/[^aeiou]y$/.test(s)) return s.slice(0, -1) + "ied";
  return s + "ed";
}

/** 동사류(-ing·-ed/불규칙·-s·원형) 규칙. */
function verbRules(
  c: SiteCandidate, lw: string, x: CandidateContext, prev: string | null, ocNear: boolean, push: Push, one: (w: string) => string,
): void {
  const t = c.tags;
  const prevBe = !!prev && BE.has(prev);
  const prevHave = !!prev && HAVE.has(prev);
  if (t.includes("ing")) {
    const r = baseOfIng(lw);
    // 어휘집에 원형이 없으면(frustrating 등 — 원형이 코퍼스에 안 나옴) 분사 맞교환만 형태론으로
    if (!r && lw.length > 5) push(one(ppFromIngStem(lw.slice(0, -3))), "V-ing→p.p.(형태론)", "c");
    if (r) {
      const { base: b, doubled } = r;
      const s = one(s3Of(b));
      const p = one(ppOf(b, doubled));
      const bare = one(b);
      if (prev === "to") push(bare, "to V-ing→to V", "k");
      else if (prevBe) {
        push(p, "be V-ing→be p.p.", "e");
        push(bare, "be V-ing→be V", "a");
      } else if (ocNear) {
        push(bare, "OC V-ing→V", "h");
        push(p, "V-ing→p.p.", "c");
      } else if (x.sentenceInitial) {
        push(bare, "V-ing→V", "a");
        push(s, "V-ing→V-s", "a");
        push(p, "V-ing→p.p.", "c");
      } else {
        push(s, "V-ing→V-s", "a");
        push(p, "V-ing→p.p.", "c");
        push(bare, "V-ing→V", "a");
      }
    }
  }
  if (t.includes("ed/pp")) {
    const r = baseOfEd(lw);
    if (!r && /ed$/.test(lw) && lw.length > 5) push(one(ingOf(lw.slice(0, -1))), "p.p.→V-ing(형태론)", "c");
    if (r) {
      const { base: b, doubled } = r;
      const g = one(ingOf(b, doubled));
      if (prevBe) {
        push(g, "be p.p.→be V-ing", "e");
        push(one(b), "be p.p.→be V", "e");
      } else if (prevHave) {
        push(g, "have p.p.→have V-ing", "a");
      } else {
        push(g, ocNear ? "OC p.p.→V-ing" : "V-ed→V-ing", ocNear ? "h" : "c");
      }
    }
  }
  if (t.includes("verb-s")) {
    const b = baseOfS(lw);
    if (b) {
      push(one(b), "V-s→V", "d");
      push(one(ingOf(b)), "V-s→V-ing", "a");
    }
  }
  // 어휘집 밖 원형 자리(빈도부사·-ly 부사·주어 대명사 뒤 — extract.mjs bareByContext): 형태론만으로 활용
  const bare = t.includes("verb-base") && !t.includes("verb-s") && !isVerbBase(lw);
  if (bare && /[^s]s$/.test(lw) && lw.length > 3) {
    const b = lw.endsWith("ies") ? lw.slice(0, -3) + "y" : /(ss|sh|ch|x|zz|o)es$/.test(lw) ? lw.slice(0, -2) : lw.slice(0, -1);
    push(one(b), "V-s→V", "d");
    push(one(ingOf(b)), "V-s→V-ing", "a");
  } else if (bare && lw.length > 3 && !/(ly|ing|ed)$/.test(lw)) {
    push(one(s3Of(lw)), "V→V-s", "d");
    push(one(ingOf(lw)), "V→V-ing", "a");
  }
  if (t.includes("verb-base") && isVerbBase(lw)) {
    if (ocNear) {
      push(one(ingOf(lw)), "OC V→V-ing", "h");
      push(matchCase(c.word, "to " + lw), "OC V→to V", "h");
    } else {
      push(one(s3Of(lw)), "V→V-s", "d");
      push(one(ingOf(lw)), "V→V-ing", "a");
      push(matchCase(c.word, "to " + lw), "V→to V", "k");
    }
  }
}

/** 원문 문장·지문에 오형을 끼운 결과(D7 state 용). 문장은 d7 build-fixtures 와 같게 따옴표·공백 정규화. */
export function applyWrongForm(
  passage: string,
  c: Pick<SiteCandidate, "start" | "end">,
  wrong: string,
  sentence: { start: number; end: number },
): { originalSentence: string; modifiedSentence: string; modifiedPassage: string } {
  const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  const sent = passage.slice(sentence.start, sentence.end);
  const a = c.start - sentence.start;
  const b = c.end - sentence.start;
  return {
    originalSentence: norm(sent),
    modifiedSentence: norm(sent.slice(0, a) + wrong + sent.slice(b)),
    modifiedPassage: passage.slice(0, c.start) + wrong + passage.slice(c.end),
  };
}
