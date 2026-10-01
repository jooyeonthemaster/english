// qgen-lab jev 질문 빌더 — 보정에서 이긴 설계를 **축자** 이식(문구 수정 금지: 보정 수치가 무효가 된다).
// 각 빌더는 {state?, questions} 조각을 돌려준다. 같은 state 조각은 jev-questions-utils.ts combineFragments 로 합쳐
// 한 요청에 팬아웃하고(jev 는 질문을 서로 독립 채점 — jevdocs cookbooks_parallel_questions), askJevPacked 로 한도 안에서 나눠 보낸다.
// 판독기(read*)는 보정 스크립트가 쓴 값 변환과 같다. 텍스트 도우미(plain·sentencesByMarker 등)는 utils 쪽.
import type { JevAnswer, JevQuestion } from "../jev-client";
import { hashBit, markedSentence, plain, sentencesByMarker } from "./jev-questions-utils";

export type JevState = string | Record<string, unknown>;
export interface JevFragment {
  state?: JevState;
  questions: Record<string, JevQuestion>;
}
/** site-planner target(c) = { word: c.surface, marked_sentence: c.marked }. */
export interface SiteTarget {
  word: string;
  marked_sentence: string;
}

// ── site-planner A2 · D (자리 순위: 정답 점수 = A2 × (0.25 + D/4), 미끼 점수 = A2) ─────────────

const EX_TRUE = [
  "The results of the long survey that the two teams conducted last year ⟦are⟧ surprising.",
  "Knowing when to stop and how to ask for help ⟦makes⟧ a leader effective.",
  "the chance ⟦to rest⟧ and ⟦recover⟧ after training",
  "a town ⟦where⟧ most people still walk to work",
];
const EX_FALSE = ["She can ⟦go⟧ home now.", "the ⟦important⟧ thing is", "He is interested in ⟦learning⟧ Spanish.", "a ⟦large⟧ number of ⟦people⟧"];
const SITE_Q =
  "Is `target.word` (marked ⟦ ⟧ in `target.marked_sentence`) a good site for a Korean CSAT English grammar question: a word that could be changed into a competing grammatical form, where deciding the correct form requires analyzing the structure of the sentence rather than only the word right next to it?";

/** 원본: calib/site-planner/jevq.mjs DESIGNS.A2_site_noul_struct (noul, 구조화 criteria). state = {passage: 원문}. */
export function siteA2(target: SiteTarget): JevFragment {
  return {
    questions: {
      A2: {
        type: "noul",
        instructions: { target: { word: target.word, marked_sentence: target.marked_sentence }, question: SITE_Q },
        criteria: {
          true: { what: "A structure-dependent grammar test site with a competing form", examples: EX_TRUE },
          false: {
            what: "No competing form, or a formula decided by the neighboring word",
            not_for: "verbs, relative words, participles and pronouns whose form depends on a distant subject, antecedent or clause",
            examples: EX_FALSE,
          },
        },
      },
    },
  };
}

/** 원본: calib/site-planner/jevq.mjs DESIGNS.D_cue_score (score 5레벨, 0 = 경쟁형 없음). state = {passage: 원문}. */
export function cueD(target: SiteTarget): JevFragment {
  return {
    questions: {
      D: {
        type: "score",
        instructions: {
          target: { word: target.word, marked_sentence: target.marked_sentence },
          question: "Where is the word or phrase that decides the correct grammatical form of `target.word`?",
        },
        criteria: [
          { what: "Nothing decides it: the word has no competing grammatical form here (a noun, a name, or a fixed expression)" },
          { what: "Directly next to the target", examples: ["can ⟦go⟧", "the ⟦large⟧ box", "interested in ⟦learning⟧"] },
          { what: "In the same clause, with only ordinary words between", examples: ["The dogs in the yard ⟦bark⟧ loudly"] },
          {
            what: "In the same sentence but across a relative clause, participial phrase, long prepositional phrase, or insertion",
            examples: ["The results of the survey that the two teams conducted ⟦are⟧ surprising"],
          },
          { what: "In a different sentence", examples: ["a pronoun or substitute verb 'do' whose referent is in the previous sentence"] },
        ],
      },
    },
  };
}

/** 원본: calib/site-planner/planner.mjs 1라운드(A2 + D, 지문 1요청 팬아웃). 키 = `${id}:A2` · `${id}:D`. */
export function siteRound(passage: string, cands: (SiteTarget & { id: string })[]): JevFragment {
  const questions: Record<string, JevQuestion> = {};
  for (const c of cands) {
    questions[`${c.id}:A2`] = siteA2(c).questions.A2;
    questions[`${c.id}:D`] = cueD(c).questions.D;
  }
  return { state: { passage }, questions };
}

/** 정답 점수(planner.mjs buildPlan answerScore = A2 × (0.25 + D/4)). */
export const siteAnswerScore = (a2: number, d: number) => a2 * (0.25 + d / 4);

// ── D7 오형 유효성 C_cls_ex ────────────────────────────────────────────────────────────────

const STRAIN_EX = [
  "The money she was lending never came back. (active verb whose object comes earlier)",
  "They bought a race car. (noun used as a modifier of another noun)",
  "Imagine the crowd cheering. (object followed by an -ing form)",
];

/** 원본: calib/d7-validity/designs.mjs reqC2 의 C_cls_ex (2옵션 choice, 최소쌍 state — 문장만, 지문·⟦⟧ 없음).
 *  p = probabilities.broke_grammar. 임계: soft ≥0.5 · hard ≥0.6 · <0.4 정답 탈락(미끼로는 유지) · |p−t|<0.1 재질의 2회 평균. */
export function validityClsEx(originalSentence: string, modifiedSentence: string): JevFragment {
  return {
    state: { original_sentence: originalSentence, modified_sentence: modifiedSentence },
    questions: {
      C_cls_ex: {
        type: "choice",
        instructions: "`modified_sentence` is `original_sentence` with one expression changed. What did the change do?",
        criteria: {
          broke_grammar: {
            what: "`modified_sentence` is now ungrammatical under every reading; no parse makes it acceptable standard English.",
            examples: ["The results of the study was surprising.", "Many people who lives nearby complained."],
          },
          grammatical_alternative: {
            what: "`modified_sentence` is still grammatical under some reading, even if that reading is strained or changes the meaning.",
            examples: STRAIN_EX,
          },
        },
      },
    },
  };
}
export const readValidity = (a: JevAnswer | undefined): number =>
  a?.type === "choice" ? (a.probabilities.broke_grammar ?? 0) : 0;

// ── D4 범주(pair 모드, 분류 체계 state 1회) ──────────────────────────────────────────────

/** 원본: calib/d4-category/criteria.mjs FINE_CONTRAST(축자). */
export const FINE_CONTRAST = {
  finite_vs_nonfinite_verb: {
    what: "Whether this slot needs a tensed main verb of a clause or a non-finite form (-ing, to-V, past participle). Decided by whether the clause already has its main verb and how many conjunctions/relative words join the clauses.",
    not_for: "Choosing -ing vs past participle for a word that is clearly a modifier (participle_active_vs_passive); singular vs plural of a verb that is clearly the main verb (subject_verb_agreement).",
    examples: ["People in today's busy cities ⟦spend⟧ less time outdoors.", "The plan agreed upon last night ⟦was⟧ rejected.", "Most of the guests left early, some of them ⟦taking⟧ the last train."],
  },
  relative_or_noun_clause_word: {
    what: "Choice among which / that / what / who / whose / where / when / whether / how or preposition + which. Decided by whether there is an antecedent and whether the clause after the word is complete.",
    not_for: "because / despite / during / while type words (preposition_vs_conjunction); that / those used as a pronoun (pronoun_reference).",
    examples: ["a method ⟦that⟧ has been used for years", "It is clear ⟦that⟧ the plan failed.", "the village ⟦where⟧ she grew up", "⟦What⟧ matters most is practice."],
  },
  participle_active_vs_passive: {
    what: "-ing vs past participle for a participle that modifies a noun or starts a participial phrase. Decided by whether its understood subject does the action or receives it (also emotion participles: exciting vs excited).",
    not_for: "A finite verb in active or passive voice (verb_voice); whether the slot needs a main verb at all (finite_vs_nonfinite_verb).",
    examples: ["skills that remained ⟦hidden⟧", "the children ⟦sitting⟧ near the door", "⟦Compared⟧ with last year, sales rose.", "a ⟦confusing⟧ rule"],
  },
  subject_verb_agreement: {
    what: "Singular vs plural form of a finite verb (is/are, was/were, has/have, -s). Decided by the true head of the subject, which may be separated from the verb or come after it.",
    not_for: "Whether a finite verb is needed at all (finite_vs_nonfinite_verb); pronoun number (pronoun_reference).",
    examples: ["The results of the long study ⟦are⟧ surprising.", "One of the old bridges ⟦has⟧ collapsed.", "Among the guests ⟦were⟧ two doctors."],
  },
  verb_voice: {
    what: "Active vs passive form of a verb phrase (find vs be found, has used vs has been used). Decided by whether the subject performs or receives the action and whether an object follows.",
    not_for: "A participle modifying a noun (participle_active_vs_passive).",
    examples: ["Food could ⟦be found⟧ almost anywhere.", "The law ⟦was passed⟧ in 1990.", "Problems ⟦occur⟧ when people rush."],
  },
  adjective_vs_adverb: {
    what: "Adjective vs adverb form (quick vs quickly). Decided by whether the word is a complement of be / seem / remain / find it / make it, or modifies a verb, adjective, or clause.",
    not_for: "much / even / very before comparatives (comparison_or_quantifier).",
    examples: ["They found the task ⟦useful⟧.", "The machine works ⟦efficiently⟧.", "She remained ⟦calm⟧."],
  },
  pronoun_reference: {
    what: "Form or number of a pronoun or possessive (it / they / them / its / their / that / those / one / themselves / itself), decided by what it refers back to; also pro-forms like do / does standing for an earlier verb.",
    not_for: "that / which / what introducing a clause (relative_or_noun_clause_word).",
    examples: ["The price of gold is higher than ⟦that⟧ of silver.", "The children taught ⟦themselves⟧ to swim.", "A tree loses ⟦its⟧ leaves."],
  },
  object_complement_form: {
    what: "Form of the complement after make / let / have / see / hear / help / get / allow / enable / cause / keep + object: bare verb, to-V, -ing, or past participle.",
    not_for: "An adjective complement (adjective_vs_adverb); to-V vs -ing after a verb with no object (to_infinitive_vs_gerund).",
    examples: ["made the audience ⟦laugh⟧", "allowed the workers ⟦to rest⟧", "had the roof ⟦repaired⟧", "saw the ball ⟦rolling⟧"],
  },
  parallel_structure: {
    what: "Matching form between items joined by and / or / but, both...and, not only...but also, or compared by than / as...as. Decided by the form of the earlier item.",
    not_for: "Forms decided by the verb or clause itself rather than by a joined partner.",
    examples: ["She enjoys reading, writing, and ⟦painting⟧.", "to plan the trip and ⟦book⟧ a hotel", "It either grows or ⟦dies⟧."],
  },
  subjunctive_tense: {
    what: "Verb forms of conditional or hypothetical clauses (if I were, had they known, as if, I wish, would have + p.p.).",
    not_for: "Ordinary tense or agreement.",
    examples: ["If I ⟦were⟧ you, I would wait.", "Had we left earlier, we ⟦would have caught⟧ the bus."],
  },
  to_infinitive_vs_gerund: {
    what: "to-V vs -ing (or bare verb) required by a verb, adjective, or noun (decide to, avoid -ing, stop / remember / try, too...to), by a preposition (look forward to -ing, from A to -ing), or for purpose / subject use.",
    not_for: "Complement after make / let / allow + object (object_complement_form).",
    examples: ["They avoided ⟦making⟧ noise.", "Laws were passed ⟦to protect⟧ forests.", "I look forward to ⟦seeing⟧ you.", "She knows how ⟦to cook⟧."],
  },
  preposition_vs_conjunction: {
    what: "because / because of, although / despite, while / during, whenever, unless, whether — decided by whether a clause or a noun phrase follows.",
    not_for: "Relative words or noun-clause that / what (relative_or_noun_clause_word).",
    examples: ["⟦Despite⟧ the rain, we played.", "⟦Because⟧ it rained, we stayed in.", "⟦During⟧ the meeting, he slept."],
  },
  comparison_or_quantifier: {
    what: "Comparative / superlative forms, much / even / far vs very before a comparative, as...as, than, and many / much / few / little matched to countable or uncountable nouns.",
    not_for: "Ordinary adjective vs adverb choice (adjective_vs_adverb).",
    examples: ["a ⟦much⟧ faster rate", "⟦fewer⟧ mistakes", "as ⟦quickly⟧ as possible", "the ⟦largest⟧ city"],
  },
  none_of_these: {
    what: "The form is not decided by any rule above (an article, a noun choice, a fixed idiom, spelling).",
  },
};
/** 원본: criteria.mjs FINE_KEY — 옵션 키 → 포인트 코드. */
export const FINE_KEY: Record<string, string> = {
  finite_vs_nonfinite_verb: "a", relative_or_noun_clause_word: "b", participle_active_vs_passive: "c",
  subject_verb_agreement: "d", verb_voice: "e", adjective_vs_adverb: "f", pronoun_reference: "g",
  object_complement_form: "h", parallel_structure: "i", subjunctive_tense: "j", to_infinitive_vs_gerund: "k",
  preposition_vs_conjunction: "l", comparison_or_quantifier: "m", none_of_these: "none",
};

export interface CategoryPairItem {
  /** 올바른 문장, 자리만 ⟦ ⟧(핵 1단어 — to/전치사·be+분사는 2단어). */
  markedSentence: string;
  surface: string;
  wrong: string;
}

/** 원본: calib/d4-category/run.mjs DESIGNS.fine_pair_stateTax_W2 (+criteria.mjs FINE_CONTRAST, chunk10 묶음).
 *  state = {taxonomy, s1..sN}, 질문 q0..q(N-1). 보정: top-1 89.6%, p_max ≥0.8 이면 96.9%(커버 78%). */
export function categoryPair(items: CategoryPairItem[]): JevFragment {
  const state: Record<string, unknown> = { taxonomy: FINE_CONTRAST };
  const questions: Record<string, JevQuestion> = {};
  const crit = Object.fromEntries(Object.keys(FINE_CONTRAST).map((k) => [k, `Defined in \`taxonomy.${k}\`.`]));
  items.forEach((s, i) => {
    const ref = `s${i + 1}`;
    state[ref] = s.markedSentence;
    questions[`q${i}`] = {
      type: "choice",
      instructions: {
        context: `A grammar test will change the expression marked with ⟦ ⟧ in \`${ref}\` from "${s.surface}" to the wrong form "${s.wrong}". Students must decide whether the printed form is correct.`,
        question: "Which grammar point does this change test — which rule would a student apply to see that the changed form is wrong?",
        options: "Each option is defined (what / not_for / examples) in `taxonomy`.",
      },
      criteria: crit,
    };
  });
  return { state, questions };
}

/** D4 답 → 코드 확률(키→코드 합산)·top-1/2·p_max. p_max ≥0.8 확정, 아니면 top-2 로 쓴다(SUMMARY d4 RECS). */
export function readCategoryPair(a: JevAnswer | undefined): { code: string; pmax: number; top2: string[]; probs: Record<string, number> } | null {
  if (!a || a.type !== "choice") return null;
  const probs: Record<string, number> = {};
  for (const [k, p] of Object.entries(a.probabilities)) probs[FINE_KEY[k] ?? k] = (probs[FINE_KEY[k] ?? k] || 0) + p;
  const order = Object.entries(probs).sort((x, y) => y[1] - x[1]);
  return { code: FINE_KEY[a.choice] ?? a.choice, pmax: order[0]?.[1] ?? 0, top2: order.slice(0, 2).map((x) => x[0]), probs };
}

// ── D6 미끼 유혹도 tempt2 ─────────────────────────────────────────────────────────────────

const TEMPT2_LEVELS = [
  { what: "Low: students would almost never choose it as the error; the form is plainly right at a glance", examples: ["'is able ⟦to go⟧'", "'could ⟦be⟧ found'"] },
  { what: "Medium: some students might pause on it because it tests a familiar rule, but it is confirmed quickly", examples: ["'found the task ⟦difficult⟧'", "'the city ⟦where⟧ she was born'"] },
  { what: "High: many students would choose it as the error because it looks wrong on first reading, and only careful analysis of the whole sentence shows it is correct", examples: ["'The number of visitors to the old castles ⟦is⟧ rising' (a plural noun right before a singular verb)", "'Most of the tools found in the cave ⟦were⟧ stone' (the participle looks like the main verb)"] },
];

export interface Tempt2Target {
  /** 원문자 라벨(①~⑤). */
  label: string;
  word: string;
  /** 표시 문장(오형 심긴 채, 마커 제거), 대상만 ⟦ ⟧. */
  marked_sentence: string;
}

/** 원본: calib/d5d6-distance-temptation/questions.mjs buildR4 의 T{i}_tempt2 (score 3레벨, 0..2).
 *  state = {passage: 번호 지문(【① x】…)}. 약한 순위 신호 — 게이트 금지, 코드 사전과 블렌드. f(형/부) 미끼는 무시. */
export function tempt2(numberedPassage: string, d: Tempt2Target): JevFragment {
  return {
    state: { passage: numberedPassage },
    questions: {
      tempt2: {
        type: "score",
        instructions: {
          context: `Exactly one of the five marked expressions in \`passage\` is a grammatical error. The expression marked ${d.label} is actually grammatically correct.`,
          target: { label: d.label, word: d.word, marked_sentence: d.marked_sentence },
          question: "How strongly would a strong high-school student, looking for the error, be tempted to choose `target` as the error?",
        },
        criteria: TEMPT2_LEVELS,
      },
    },
  };
}

// ── D10 사후 검증 MP + PM ─────────────────────────────────────────────────────────────────

export interface MpChoiceArgs {
  /** 번호 지문(【① x】 … 【⑤ x】). */
  numbered: string;
  /** 정답 번호 1..5. */
  key: number;
  /** 표시형(오형)·고친 형. */
  shown: string;
  fix: string;
  /** 순서 해시 키(문항 id — 보정은 claim id). */
  id: string;
}

/** 원본: calib/d10-verify/designs.mjs designMP 의 mp_choice (보조 noul 2개는 규칙에 안 써서 제외).
 *  state = {version_1, version_2} — 표시 문장·고친 문장, 순서는 id 해시. pFixed = probabilities[meta.fixedKey]. */
export function mpChoice(a: MpChoiceArgs): JevFragment & { meta: { fixedKey: string; shownKey: string } } {
  const sent = sentencesByMarker(a.numbered)[a.key - 1];
  const shown = markedSentence(sent, a.key).replace(/[⟦⟧]/g, "");
  const fixed = markedSentence(sent, a.key, a.fix).replace(/[⟦⟧]/g, "");
  const fixedIs1 = hashBit(a.id) === 0;
  return {
    state: { version_1: fixedIs1 ? fixed : shown, version_2: fixedIs1 ? shown : fixed },
    questions: {
      mp_choice: {
        type: "choice",
        instructions: {
          differs_at: { version_1: fixedIs1 ? a.fix : a.shown, version_2: fixedIs1 ? a.shown : a.fix },
          question: "`version_1` and `version_2` are the same sentence except for the expression shown in `differs_at`. Which version is grammatically correct standard written English?",
        },
        criteria: {
          version_1: "Only version_1 is grammatically correct; version_2 contains a grammatical error.",
          version_2: "Only version_2 is grammatically correct; version_1 contains a grammatical error.",
          both: "Both versions are grammatically correct standard English (the difference is not a grammar error).",
          neither: "Neither version is grammatically correct.",
        },
      },
    },
    meta: { fixedKey: fixedIs1 ? "version_1" : "version_2", shownKey: fixedIs1 ? "version_2" : "version_1" },
  };
}
export const readMpFixed = (a: JevAnswer | undefined, fixedKey: string): number =>
  a?.type === "choice" ? (a.probabilities[fixedKey] ?? 0) : 0;

const ERR_TRUE =
  "It is a grammatical error: standard written English requires a different form here (for example wrong verb form, subject-verb agreement, relative word, pronoun, voice, parallel form, or adjective vs adverb).";
const ERR_FALSE = "It is acceptable standard written English exactly as written in this sentence.";

/** 원본: calib/d10-verify/designs.mjs designPM 의 terr{i} (Bad=TRUE noul). state = {passage: 마커 제거 평문}.
 *  no = 1..5(번호 지문 속 미끼 번호), expr = 그 밑줄 표현. 값 = P(error). 키 = `terr${no-1}`. */
export function pmDecoy(numbered: string, no: number, expr: string): JevFragment {
  const ts = markedSentence(sentencesByMarker(numbered)[no - 1], no);
  return {
    state: { passage: plain(numbered) },
    questions: {
      [`terr${no - 1}`]: {
        type: "noul",
        instructions: {
          target_sentence: ts,
          target_expression: expr,
          question: "`target_sentence` is a sentence from `passage`. Is the expression inside ⟦ ⟧ a grammatical error as written?",
        },
        criteria: { true: ERR_TRUE, false: ERR_FALSE },
      },
    },
  };
}

// ── 공용 판독기 ───────────────────────────────────────────────────────────────────────────
export const readNoul = (a: JevAnswer | undefined): number => (a?.type === "noul" ? a.noul : 0);
export const readScore = (a: JevAnswer | undefined): number => (a?.type === "score" ? a.score : 0);
