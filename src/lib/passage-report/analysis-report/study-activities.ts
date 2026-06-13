import { scrambleWordOrderChunks, vocabularyBlankToken } from "./worksheet-surface";
import type {
  ActivityBlock,
  ActivityItem,
  ActivityKind,
  ActivityParams,
  ActivityPayload,
  AnalysisReport,
} from "./schema";

/**
 * 결정론(No-AI) 지문 학습활동 생성 엔진.
 *
 * 모든 generator 는 순수함수다 — Math.random·Date.now·async·API 호출 금지.
 * 같은 (blockId, seed, params, sentenceNos) → 항상 같은 payload (인쇄·재로드 동일).
 * seed 를 1 올리면(re-roll) 새 배열/새 빈칸이 결정론적으로 나온다.
 */

// ─── Seeded PRNG (재현성의 핵심) ──────────────────────────────────────────────
/** mulberry32 — 고정 알고리즘(런타임 무관). seed 정수 → 0..1 generator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 블록 id 를 seed 에 섞어 같은 seed라도 블록마다 다른 결과 (djb2). */
function seedFrom(blockId: string, seed: number): number {
  let h = 5381;
  for (let i = 0; i < blockId.length; i++) h = ((h << 5) + h + blockId.charCodeAt(i)) | 0;
  return (h ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
}

/** Fisher–Yates with seeded rng. */
function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 커스텀 블록 id (항상 "c-" 접두 → deleteItem 이 custom 으로 처리). */
function localActivityBlockId(): string {
  const c = globalThis.crypto;
  const rnd = c && "randomUUID" in c ? c.randomUUID() : Math.random().toString(36).slice(2, 12);
  return `c-act-${rnd}`;
}

function normSentence(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/["'`.,!?;:()[\]{}<>]/g, "")
    .replace(/\s+/g, " ");
}

/** chunks 를 정답과 다르게 seeded 셔플. 8회 내 못 깨면 결정론 폴백. */
function seededScramble(chunks: readonly string[], answer: string, seed: number): string[] {
  const clean = chunks.map((c) => c.trim()).filter(Boolean);
  if (clean.length <= 1) return clean;
  const rng = mulberry32(seed >>> 0);
  let out = seededShuffle(clean, rng);
  let guard = 0;
  while (normSentence(out.join(" ")) === normSentence(answer) && guard++ < 8) {
    out = seededShuffle(clean, rng);
  }
  if (normSentence(out.join(" ")) === normSentence(answer)) {
    out = scrambleWordOrderChunks(clean, answer);
  }
  return out;
}

// ─── 추출 데이터 컨텍스트 ─────────────────────────────────────────────────────
// 분석 리포트의 모든 섹션(어휘·어법·요약·키워드·청크 gloss/role)을 결정론 생성기가 쓸 수 있게 평탄화한다.
// 전부 optional 슬라이스 — 섹션이 없으면 빈 배열/undefined 로 두고, 각 생성기가 알아서 degrade/skip.
export type GenChunk = { text: string; gloss?: string; role?: string };
export type GenSentence = { n: number; en: string; ko: string; chunks?: string[]; chunksFull?: GenChunk[] };
export type GenVocab = {
  headword: string;
  pronunciation?: string;
  meaning: string;
  tier?: "core" | "test" | "challenge";
  difficulty?: number;
  synonyms?: string;
  antonyms?: string;
};
export type GenGrammar = {
  sentenceNo: number;
  excerpt?: string;
  pointCode?: string;
  point: string;
  explanation: string;
  trap?: string;
  example?: string;
  exampleWrong?: string;
  exampleCorrect?: string;
};
export type GenSummary = { sentences: string[]; thesisEn: string };
export type GenStructure = {
  variant: "compare" | "sequence";
  introLabel?: string;
  columns?: { titleEn: string; titleKo: string; bullets: string[]; footer?: string }[];
  steps?: { titleKo: string; titleEn?: string; detail?: string }[];
  coreLabel?: string;
  coreDetail?: string;
  conclusion?: string;
  logicFlow?: string;
};
export type GenContext = {
  sentences: GenSentence[];
  vocab: GenVocab[];
  grammar: GenGrammar[];
  keywords: string[];
  summary?: GenSummary;
  structure?: GenStructure;
};

export function extractGenContext(report: AnalysisReport): GenContext {
  const passage = report.sections.find((s) => s.kind === "passage");
  const sentences: GenSentence[] =
    passage?.kind === "passage"
      ? passage.sentences.map((s) => ({
          n: s.n,
          en: s.en,
          ko: s.ko,
          chunks: s.chunks?.map((c) => c.text).filter((t) => t.trim().length > 0),
          chunksFull: s.chunks
            ?.map((c) => ({ text: c.text, gloss: c.gloss, role: c.role }))
            .filter((c) => c.text.trim().length > 0),
        }))
      : [];
  const keywords = passage?.kind === "passage" ? passage.keywords ?? [] : [];

  const vocabSec = report.sections.find((s) => s.kind === "vocabulary");
  const vocab: GenVocab[] =
    vocabSec?.kind === "vocabulary"
      ? vocabSec.rows.map((r) => ({
          headword: r.headword,
          pronunciation: r.pronunciation,
          meaning: r.meaning,
          tier: r.tier,
          difficulty: r.difficulty,
          synonyms: r.synonyms,
          antonyms: r.antonyms,
        }))
      : [];

  const grammarSec = report.sections.find((s) => s.kind === "grammar");
  const grammar: GenGrammar[] =
    grammarSec?.kind === "grammar"
      ? grammarSec.rows.map((r) => ({
          sentenceNo: r.sentenceNo,
          excerpt: r.excerpt,
          pointCode: r.pointCode,
          point: r.point,
          explanation: r.explanation,
          trap: r.trap,
          example: r.example,
          exampleWrong: r.exampleWrong,
          exampleCorrect: r.exampleCorrect,
        }))
      : [];

  const summarySec = report.sections.find((s) => s.kind === "summary");
  const summary: GenSummary | undefined =
    summarySec?.kind === "summary" ? { sentences: summarySec.sentences, thesisEn: summarySec.thesisEn } : undefined;

  const structSec = report.sections.find((s) => s.kind === "structure-map");
  const structure: GenStructure | undefined =
    structSec?.kind === "structure-map"
      ? {
          variant: structSec.variant ?? "compare",
          introLabel: structSec.intro?.label,
          columns: structSec.columns?.map((c) => ({
            titleEn: c.titleEn,
            titleKo: c.titleKo,
            bullets: c.bullets,
            footer: c.footer,
          })),
          steps: structSec.steps?.map((s) => ({ titleKo: s.titleKo, titleEn: s.titleEn, detail: s.detail })),
          coreLabel: structSec.coreDistinction?.label,
          coreDetail: structSec.coreDistinction?.detail,
          conclusion: structSec.conclusion?.text,
          logicFlow: structSec.logicFlow,
        }
      : undefined;

  return { sentences, vocab, grammar, keywords, summary, structure };
}

function selectSentences(sentences: GenSentence[], nos?: number[]): GenSentence[] {
  const pool = sentences.filter((s) => s.en.trim().length > 0);
  if (!nos || nos.length === 0) return pool;
  const set = new Set(nos);
  return pool.filter((s) => set.has(s.n));
}

const WORD_RE = /^[A-Za-z][A-Za-z'’-]{2,}$/;
const splitWords = (en: string): string[] => en.trim().split(/\s+/).filter(Boolean);

// 품사 타깃 빈칸용 닫힌 목록 (AI 없이 안전하게 분류 가능한 기능어만). verb 는 조동사·be동사로 한정.
const PREP_SET = new Set([
  "in", "on", "at", "to", "for", "with", "by", "from", "of", "about", "into", "onto", "over", "under",
  "between", "among", "through", "during", "before", "after", "against", "without", "within", "upon",
  "toward", "towards", "across", "behind", "beyond", "beside", "above", "below", "around", "near", "off",
]);
const CONJ_SET = new Set([
  "and", "but", "or", "so", "yet", "nor", "because", "although", "though", "while", "whereas", "if",
  "unless", "since", "as", "when", "whenever", "where", "wherever", "whether", "than", "once", "until",
  "however", "therefore", "thus", "moreover", "furthermore", "nevertheless", "meanwhile", "instead",
]);
const AUX_SET = new Set([
  "is", "are", "was", "were", "be", "been", "being", "am", "has", "have", "had", "do", "does", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
]);

/** 빈칸 후보 인덱스 — target 에 따라 내용어 / 전치사 / 접속사 / (조)동사로 필터. tokens 는 공백 보존 분할. */
function clozeCandidateIdx(tokens: string[], target: ActivityParams["target"]): number[] {
  return tokens
    .map((_, i) => i)
    .filter((i) => {
      const tok = tokens[i];
      const bare = tok.replace(/[^A-Za-z'’-]/g, "").toLowerCase();
      if (!bare) return false;
      if (target === "prep") return PREP_SET.has(bare);
      if (target === "conj") return CONJ_SET.has(bare);
      if (target === "verb") return AUX_SET.has(bare);
      return WORD_RE.test(tok); // content / all — 기존 내용어 기준 유지
    });
}

/** 첫글자 + 길이만큼 밑줄 (백지복원 scaffold·첫글자 힌트). "Verbatim" → "V_______". */
function scaffoldFirstLetters(en: string): string {
  return splitWords(en)
    .map((w) => {
      if (!/^[A-Za-z]/.test(w)) return w;
      const letters = w.replace(/[^A-Za-z'’-]/g, "");
      return w[0] + "_".repeat(Math.max(1, letters.length - 1));
    })
    .join(" ");
}

// ─── 공유 스캐폴드 사다리 (영작/복원류 — 정답 평문은 절대 노출하지 않는다) ──────
type ScaffoldLevel = "none" | "wordSlots" | "firstLetter" | "wordBank";
/** 구 boolean scaffold 호환: scaffold:true → 'firstLetter'. */
function resolveScaffold(params: ActivityParams): ScaffoldLevel {
  return params.scaffoldLevel ?? (params.scaffold ? "firstLetter" : "none");
}
/** 단어 수 슬롯 — 각 단어를 글자 수만큼 ▁ 로(철자 숨김, 길이/단어수만 힌트). */
function wordCountSlots(en: string): string {
  return splitWords(en)
    .map((w) => "▁".repeat(Math.max(1, w.replace(/[^A-Za-z'’-]/g, "").length)))
    .join("  ");
}
/** 영어 산출 스캐폴드 한 줄. none/wordBank 는 빈 문자열(wordBank 는 payload 레벨에서 단어은행으로 처리). */
function enScaffoldLine(en: string, level: ScaffoldLevel): string {
  if (level === "wordSlots") return wordCountSlots(en);
  if (level === "firstLetter") return scaffoldFirstLetters(en);
  return "";
}

/** seededShuffle 결과가 항등(원래 순서)이면 한 번 더 섞어 비항등 보장 (순서/삽입용). */
function nonIdentityShuffle<T>(arr: readonly T[], seed: number): number[] {
  const idx = arr.map((_, i) => i);
  if (idx.length <= 1) return idx;
  const rng = mulberry32(seed >>> 0);
  let out = seededShuffle(idx, rng);
  let guard = 0;
  while (out.every((v, i) => v === i) && guard++ < 8) out = seededShuffle(idx, rng);
  return out;
}

/** 교란순열(derangement) — 고정점이 하나도 없는 순열. 매칭에서 같은 행에 정답쌍이 오는 것을 방지. */
function derangement(n: number, seed: number): number[] {
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);
  const rng = mulberry32(seed >>> 0);
  for (let attempt = 0; attempt < 24; attempt++) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.every((v, i) => v !== i)) return a;
  }
  // 폴백: 순환 이동(항상 교란순열)
  return Array.from({ length: n }, (_, i) => (i + 1) % n);
}

/** 내용어 후보 인덱스 중 density 비율만큼 seeded 선택 (정렬 반환). */
function seededPickBlankIdx(words: string[], candIdx: number[], density: number, seed: number): number[] {
  if (candIdx.length === 0) return [];
  const rng = mulberry32(seed >>> 0);
  const k = Math.max(1, Math.round(candIdx.length * (density / 100)));
  return seededShuffle(candIdx, rng)
    .slice(0, k)
    .sort((a, b) => a - b);
}

// ─── P0 빌더 ─────────────────────────────────────────────────────────────────
function scrambleSplitMode(params: ActivityParams): "chunk" | "word" | "ngram" {
  return params.splitMode ?? (params.unit === "word" ? "word" : "chunk");
}

/** 문장을 분할 방식에 따라 단위 배열로 쪼갠다. */
function splitForScramble(s: GenSentence, params: ActivityParams): string[] {
  const mode = scrambleSplitMode(params);
  if (mode === "word") return splitWords(s.en);
  if (mode === "ngram") {
    const words = splitWords(s.en);
    // 항상 ≥3 덩어리가 나오도록 묶음 크기 제한 (안 그러면 base<3 으로 문장이 조용히 누락됨).
    const size = Math.min(Math.max(2, params.ngramSize ?? 2), Math.max(2, Math.floor(words.length / 3)));
    const groups: string[] = [];
    for (let i = 0; i < words.length; i += size) groups.push(words.slice(i, i + size).join(" "));
    return groups.length >= 3 ? groups : words; // 그래도 부족하면 단어 분할로 폴백
  }
  // 의미 단위(청크) — 없으면 단어로 폴백
  return s.chunks && s.chunks.length >= 2 ? s.chunks : splitWords(s.en);
}

function buildScramble(ctx: GenContext, nos: number[] | undefined, params: ActivityParams, seedKey: number): ActivityPayload {
  const picked = selectSentences(ctx.sentences, nos);
  const mode = scrambleSplitMode(params);
  const sep = params.separator === "pipe" ? " | " : params.separator === "chip" ? "   " : " / ";
  const writeLines = params.writeLines ?? 1;
  const items: ActivityItem[] = [];
  picked.forEach((s, i) => {
    const base = splitForScramble(s, params);
    if (base.length < 3) return; // 너무 짧으면 스크램블 의미 없음 → skip
    let chips: string[];
    if (params.firstChunkHint && base.length >= 3) {
      // 첫 단위를 제자리에 고정(힌트), 나머지만 섞는다.
      const tail = base.slice(1);
      chips = [base[0], ...seededScramble(tail, tail.join(" "), seedKey + i * 101)];
    } else {
      chips = seededScramble(base, s.en, seedKey + i * 101);
    }
    items.push({
      no: items.length + 1,
      sentenceNo: s.n,
      prompt: `[ ${chips.join(sep)} ]`,
      chips,
      ko: s.ko,
      answer: s.en.trim(),
      writeLines,
    });
  });
  return {
    items,
    instructions:
      mode === "word"
        ? "흩어진 단어를 바른 순서로 배열해 문장을 완성하시오."
        : mode === "ngram"
          ? "묶음을 바른 순서로 배열해 문장을 완성하시오."
          : "끊어 읽은 의미 단위를 바른 순서로 배열해 문장을 완성하시오.",
  };
}

function buildKeywordCloze(ctx: GenContext, nos: number[] | undefined, params: ActivityParams, seedKey: number): ActivityPayload {
  const density = params.density ?? 30;
  const picked = selectSentences(ctx.sentences, nos);
  const items: ActivityItem[] = [];
  const bank: string[] = [];
  let no = 0;

  picked.forEach((s, si) => {
    const tokens = s.en.split(/(\s+)/); // 공백 보존
    const candIdx = clozeCandidateIdx(tokens, params.target ?? "content");
    if (candIdx.length === 0) {
      items.push({ no: items.length + 1, sentenceNo: s.n, prompt: s.en.trim(), answer: "" });
      return;
    }
    const blanks = new Set(seededPickBlankIdx(tokens, candIdx, density, seedKey + si * 101));
    const removed: string[] = [];
    const out = tokens.map((tok, i) => {
      if (!blanks.has(i)) return tok;
      no += 1;
      const word = tok;
      removed.push(word);
      bank.push(word);
      if (params.firstLetterHint) {
        const rest = vocabularyBlankToken(no).replace(/^\(\d+\)\s*/, "");
        return `(${no}) ${word[0]}${rest}`;
      }
      return vocabularyBlankToken(no);
    });
    items.push({
      no: items.length + 1,
      sentenceNo: s.n,
      prompt: out.join("").replace(/\s+/g, " ").trim(),
      answer: "",
      answerKey: removed,
    });
  });

  return {
    items,
    wordBank: params.wordBank ? seededShuffle(bank, mulberry32(seedKey >>> 0)) : undefined,
    instructions: "문맥에 맞는 단어를 빈칸에 채워 지문을 복원하시오.",
  };
}

/** 전지문 빈칸 — 선택 문장을 한 흐름으로 이어 통째로 마스킹, 단어은행 하나. 본문 통암기 확인지. */
function buildFullCloze(ctx: GenContext, nos: number[] | undefined, params: ActivityParams, seedKey: number): ActivityPayload {
  const density = params.density ?? 55;
  const target = params.target ?? "content";
  const picked = selectSentences(ctx.sentences, nos);
  const bank: string[] = [];
  const answers: string[] = [];
  const parts: string[] = [];
  let no = 0;
  picked.forEach((s, si) => {
    const tokens = s.en.split(/(\s+)/);
    const cand = clozeCandidateIdx(tokens, target);
    const blanks = new Set(seededPickBlankIdx(tokens, cand, density, seedKey + si * 101));
    const out = tokens.map((tok, i) => {
      if (!blanks.has(i)) return tok;
      no += 1;
      bank.push(tok);
      answers.push(tok);
      if (params.firstLetterHint) {
        const rest = vocabularyBlankToken(no).replace(/^\(\d+\)\s*/, "");
        return `(${no}) ${tok[0]}${rest}`;
      }
      return vocabularyBlankToken(no);
    });
    parts.push(out.join("").replace(/\s+/g, " ").trim());
  });
  if (answers.length === 0) return { items: [], instructions: "" };
  return {
    items: [{ no: 1, prompt: parts.join(" "), answer: "", answerKey: answers }],
    wordBank: params.wordBank !== false ? seededShuffle(bank, mulberry32(seedKey >>> 0)) : undefined,
    instructions: "지문 전체의 빈칸을 채워 본문을 복원하시오.",
  };
}

/** 중첩 라운드 빈칸 — 회차가 오를수록 빈칸이 늘어나는 점증 복원(상위 회차 빈칸 ⊇ 하위 회차). */
/** 중첩 빈칸 기본 회차별 밀도 — 최종 밀도까지 균등 램프. (회차가 오를수록 누적되는 단조 증가) */
export function defaultNestedDensities(rounds: number, finalDensity: number): number[] {
  const n = Math.min(4, Math.max(2, rounds));
  const fin = Math.min(100, Math.max(10, finalDensity));
  return Array.from({ length: n }, (_, i) => Math.max(10, Math.round((fin * (i + 1)) / n)));
}

/** 회차별 밀도 정규화 — [10,100] 클램프 + 누적 max(단조 증가). 회차 superset 불변식을 강제한다. */
export function normalizeNestedDensities(densities: number[]): number[] {
  let prev = 0;
  return densities.map((d) => {
    prev = Math.max(prev, Math.min(100, Math.max(10, Math.round(d))));
    return prev;
  });
}

function buildNestedCloze(ctx: GenContext, nos: number[] | undefined, params: ActivityParams, seedKey: number): ActivityPayload {
  const rounds = Math.min(4, Math.max(2, params.rounds ?? 3));
  const target = params.target ?? "content";
  // 회차별 밀도: 사용자 지정(roundDensities)이 회차 수와 맞으면 사용, 아니면 최종 밀도 기준 기본 램프.
  // normalize 로 항상 단조 증가 → round r 빈칸 ⊇ round r-1 (superset) 보장.
  const densities = normalizeNestedDensities(
    params.roundDensities && params.roundDensities.length === rounds
      ? params.roundDensities
      : defaultNestedDensities(rounds, params.density ?? 80),
  );
  const picked = selectSentences(ctx.sentences, nos);
  const items: ActivityItem[] = [];
  for (let r = 1; r <= rounds; r++) {
    const densityR = densities[r - 1];
    const parts: string[] = [];
    const answers: string[] = [];
    let no = 0;
    picked.forEach((s, si) => {
      const tokens = s.en.split(/(\s+)/);
      const cand = clozeCandidateIdx(tokens, target);
      // 같은 seed 로 매 회차 동일한 후보 순서를 만들고, 앞에서부터 densityR 만큼 마스킹 → 회차 간 superset.
      const ordered = seededShuffle(cand, mulberry32((seedKey + si * 101) >>> 0));
      const kThis = Math.min(cand.length, Math.max(1, Math.round((cand.length * densityR) / 100)));
      const blanks = new Set(ordered.slice(0, kThis));
      const out = tokens.map((tok, i) => {
        if (!blanks.has(i)) return tok;
        no += 1;
        answers.push(tok);
        return vocabularyBlankToken(no);
      });
      parts.push(out.join("").replace(/\s+/g, " ").trim());
    });
    if (answers.length > 0) {
      items.push({ no: r, prompt: `[${r}회 · 빈칸 ${densityR}%] ${parts.join(" ")}`, answer: "", answerKey: answers });
    }
  }
  return { items, instructions: "회차가 올라갈수록 빈칸이 늘어납니다. 매 회차 빈칸을 채워 점점 더 외워 보시오." };
}

/** KO→EN 백지 영작 복원 — 한국어 해석만 보고 영어 문장을 처음부터 써낸다. 스캐폴드 사다리(없음/단어슬롯/첫글자/단어보기). */
function buildReproduction(ctx: GenContext, nos: number[] | undefined, params: ActivityParams): ActivityPayload {
  const picked = selectSentences(ctx.sentences, nos);
  const lines = Math.min(4, Math.max(1, params.linesPerSentence ?? params.writeLines ?? 2));
  const level = resolveScaffold(params);
  // 단어 보기 = 정답 단어들을 한 은행으로 셔플(여러 문장이면 섞여 난이도↑). 정답 문장 평문은 노출 안 함.
  const bankWords: string[] = [];
  const wantBank = level === "wordBank";
  if (params.wholePassage) {
    const ko = picked.map((s) => s.ko).filter(Boolean).join(" ");
    const en = picked.map((s) => s.en.trim()).join(" ");
    if (!en) return { items: [], instructions: "" };
    if (wantBank) bankWords.push(...picked.flatMap((s) => splitWords(s.en)));
    const skel = wantBank ? "" : enScaffoldLine(en, level);
    return {
      items: [{ no: 1, prompt: skel ? `${ko}\n   ${skel}` : ko, answer: en, writeLines: Math.min(6, Math.max(3, Math.ceil(splitWords(en).length / 8))) }],
      wordBank: wantBank ? seededShuffle(bankWords, mulberry32((picked.length * 7 + 11) >>> 0)) : undefined,
      instructions: "한국어 해석을 보고 지문 전체를 영어로 복원하시오. (백지 복원)",
    };
  }
  const items = picked.map((s, i) => {
    if (wantBank) bankWords.push(...splitWords(s.en));
    const skel = wantBank ? "" : enScaffoldLine(s.en, level);
    return {
      no: i + 1,
      sentenceNo: s.n,
      prompt: skel ? `${s.ko}\n   ${skel}` : s.ko,
      answer: s.en.trim(),
      writeLines: lines,
    };
  });
  return {
    items,
    wordBank: wantBank ? seededShuffle(bankWords, mulberry32((picked.length * 7 + 11) >>> 0)) : undefined,
    instructions: "한국어 해석을 보고 영어 문장을 복원하시오.",
  };
}

/** EN→KO 해석 쓰기 — 영어 문장을 보고 우리말 해석을 직접 적어 이해를 점검(직독직해의 진단 반쪽). */
function buildSentenceTranslation(ctx: GenContext, nos: number[] | undefined, params: ActivityParams): ActivityPayload {
  const picked = selectSentences(ctx.sentences, nos);
  const lines = Math.min(4, Math.max(1, params.linesPerSentence ?? params.writeLines ?? 1));
  const items = picked.map((s, i) => ({
    no: i + 1,
    sentenceNo: s.n,
    prompt: s.en.trim(),
    answer: s.ko,
    writeLines: lines,
  }));
  return { items, instructions: "영어 문장을 읽고 우리말 해석을 쓰시오." };
}

/** 끊어읽기 영작 — 청크별 한국어 의미(직독직해 단서)를 끊어 보여주고 영어를 복원. ★영어 원문은 숨긴다(영작이므로). */
function buildSlashCompose(ctx: GenContext, nos: number[] | undefined, params: ActivityParams): ActivityPayload {
  const picked = selectSentences(ctx.sentences, nos);
  const lines = Math.min(4, Math.max(1, params.writeLines ?? 1));
  const anyGloss = picked.some((s) => s.chunksFull?.some((c) => c.gloss?.trim()));
  const items: ActivityItem[] = [];
  picked.forEach((s) => {
    const cf = s.chunksFull?.filter((c) => c.text.trim());
    const hasGloss = cf && cf.length >= 2 && cf.some((c) => c.gloss?.trim());
    // 직독직해 단서 = 청크별 한국어 뜻을 / 로 이어 끊어읽기 구조만 보여준다(영어 없음). gloss 없으면 문장 한글.
    const cue = hasGloss ? cf!.map((c) => c.gloss?.trim() || "…").join("  /  ") : s.ko;
    const level = params.scaffoldLevel ?? (params.firstLetterHint ? "firstLetter" : "none");
    const skel = level === "wordSlots" ? wordCountSlots(s.en) : level === "firstLetter" ? scaffoldFirstLetters(s.en) : "";
    const hint = skel ? `\n   ${skel}` : "";
    items.push({
      no: items.length + 1,
      sentenceNo: s.n,
      prompt: `${cue}${hint}`,
      answer: s.en.trim(),
      writeLines: lines,
    });
  });
  return {
    items,
    instructions: anyGloss
      ? "끊어 읽은 우리말 의미 단위(/)를 단서로, 영어 문장을 다시 써 보시오."
      : "우리말 해석을 단서로, 영어 문장을 다시 써 보시오.",
  };
}

const ALPHA = (i: number) => String.fromCharCode(65 + i); // A,B,C…
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
const circledNo = (i: number) => CIRCLED[i] ?? `(${i + 1})`;

/**
 * 문장 순서 배열 — 수능 표준형. 기본은 첫 문장을 [주어진 글] 앵커로 고정하고 나머지를 (A)(B)(C)…로
 * 섞어 제시(유일해 강제). anchor='none' 이면 전부 섞는다. 구조화 order payload 로 카드 렌더.
 */
function buildSentenceOrder(ctx: GenContext, nos: number[] | undefined, params: ActivityParams, seedKey: number): ActivityPayload {
  const picked = selectSentences(ctx.sentences, nos);
  if (picked.length < 3) {
    return { items: [{ no: 1, prompt: "※ 문장 순서 배열은 3개 이상의 문장이 필요합니다. ‘포함 문장’을 늘려 주세요.", answer: "" }], instructions: "" };
  }
  const circled = params.labelStyle === "circled";
  const labelOf = (k: number) => (circled ? circledNo(k) : ALPHA(k));
  const useAnchor = params.anchor !== "none";
  const given = useAnchor ? picked[0] : undefined;
  const rest = useAnchor ? picked.slice(1) : picked; // 배열 대상 문장들 (문서 순서)
  const showKo = !!params.showKo;
  // display[k] = rest 인덱스 (k 번째 카드로 보일 문장). 비항등 보장.
  const display = nonIdentityShuffle(rest, seedKey);
  const cards = display.map((rj, k) => ({
    label: labelOf(k),
    en: rest[rj].en.trim(),
    ko: showKo ? rest[rj].ko : undefined,
  }));
  // 정답 = rest 문서 순서대로 카드 라벨을 나열. (앵커가 있으면 그 다음부터)
  const answerSeq = rest.map((_, j) => labelOf(display.indexOf(j))).join(" - ");
  const answer = useAnchor ? `주어진 글 → ${answerSeq}` : answerSeq;
  return {
    items: [{ no: 1, prompt: "", answer: `정답 순서: ${answer}` }],
    order: {
      given: given ? { en: given.en.trim(), ko: showKo ? given.ko : undefined } : undefined,
      cards,
      answer,
    },
    instructions: useAnchor
      ? "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 배열하시오."
      : "다음 문장을 글의 흐름에 맞게 바르게 배열하시오.",
  };
}

const CIRCLED_LETTER = "㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷";
const circledLetter = (i: number) => CIRCLED_LETTER[i] ?? `(${i + 1})`;

/**
 * 수동 빈칸 — 학생용 prompt 의 [start,end) 영어 구간을 새 빈칸으로 만들고, 기존 빈칸과 함께
 * 위치순으로 번호·answerKey 를 재정렬해 돌려준다. (빈칸 유형에서 단어/구를 드래그→빈칸)
 * 반환 null = 빈칸으로 만들 수 없음(영어 아님 / 기존 빈칸과 겹침 / 빈 선택).
 */
export function applyManualBlankToItem(
  item: { prompt: string; answerKey?: string[] },
  start: number,
  end: number,
): { prompt: string; answerKey: string[]; added: string } | null {
  const prompt = item.prompt;
  const keys = item.answerKey ?? [];
  let s = Math.max(0, Math.min(start, prompt.length));
  let e = Math.max(0, Math.min(end, prompt.length));
  if (e < s) [s, e] = [e, s];
  while (s < e && /\s/.test(prompt[s])) s++;
  while (e > s && /\s/.test(prompt[e - 1])) e--;
  const selected = prompt.slice(s, e);
  if (!selected.trim() || !/[A-Za-z]/.test(selected)) return null; // 영어 구간만 빈칸 가능(한글 단서 보호)
  // 기존 빈칸 위치 수집: "(N) ____" / "(N) f____". 정답은 *표시 번호*가 아니라 아이템 내 등장 순서로 매핑
  // (표시 번호는 블록 연속이라 아이템 answerKey 인덱스와 다름). 스켈레톤(밑줄/첫글자)은 보존.
  const blankRe = /\((\d+)\)\s*([A-Za-z]?_{3,})/g;
  type Region = { start: number; end: number; answer: string; skel: string };
  const regions: Region[] = [];
  let m: RegExpExecArray | null;
  let blankIdx = 0;
  while ((m = blankRe.exec(prompt))) {
    regions.push({ start: m.index, end: m.index + m[0].length, answer: keys[blankIdx] ?? "", skel: m[2] });
    blankIdx += 1;
  }
  if (regions.some((r) => s < r.end && e > r.start)) return null; // 기존 빈칸과 겹침
  regions.push({ start: s, end: e, answer: selected.trim(), skel: "__________" });
  regions.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  const newKeys: string[] = [];
  regions.forEach((r, i) => {
    out += prompt.slice(cursor, r.start) + `(${i + 1}) ${r.skel}`;
    cursor = r.end;
    newKeys.push(r.answer);
  });
  out += prompt.slice(cursor);
  return { prompt: out, answerKey: newKeys, added: selected.trim() };
}

/**
 * 수동 빈칸을 블록 전체에 적용 — 대상 아이템에 빈칸을 넣은 뒤, 블록의 모든 빈칸 번호를
 * buildAnswerStrings 와 동일 규칙(연속, nested 는 회차별 리셋)으로 재번호해 인라인=정답지 번호를 일치시킨다.
 * (blankable 유형은 같은 번호 반복이 없으므로 단순 카운터로 정확. 반환 null = 빈칸 불가.)
 */
export function applyManualBlankToBlock(
  items: { prompt: string; answerKey?: string[] }[],
  itemIndex: number,
  start: number,
  end: number,
  resetPerItem: boolean,
): { items: { prompt: string; answerKey: string[] }[]; added: string } | null {
  const target = items[itemIndex];
  if (!target) return null;
  const res = applyManualBlankToItem(target, start, end);
  if (!res) return null;
  const withNew = items.map((it, i) => (i === itemIndex ? { ...it, prompt: res.prompt, answerKey: res.answerKey } : { ...it }));
  let n = 0;
  const renumbered = withNew.map((it) => {
    if (resetPerItem) n = 0;
    if (!it.answerKey || it.answerKey.length === 0) return it as { prompt: string; answerKey: string[] };
    const prompt = it.prompt.replace(/\((\d+)\)(\s*[A-Za-z]?_{3,})/g, (_m, _old, skel) => `(${(n += 1)})${skel}`);
    return { ...it, prompt } as { prompt: string; answerKey: string[] };
  });
  return { items: renumbered, added: res.added };
}

/** 단어 은행에 새 단어를 끝이 아니라 흩어진 위치로 삽입(정답이 항상 마지막에 오는 누출 방지). 결정론적. */
export function insertIntoWordBank(bank: string[], word: string): string[] {
  const w = word.trim();
  if (!w) return bank;
  const sum = w.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const at = (sum + bank.length * 7) % (bank.length + 1);
  return [...bank.slice(0, at), w, ...bank.slice(at)];
}

/** 길이만큼 밑줄(첫글자 힌트). */
function blankSkeleton(word: string, withFirst: boolean): string {
  const letters = word.replace(/[^A-Za-z'’-]/g, "");
  if (!letters) return "________";
  return withFirst ? word[0] + "_".repeat(Math.max(1, letters.length - 1)) : "_".repeat(Math.max(4, letters.length));
}

// ─── 어휘 (분석 vocabulary 섹션 — headword/meaning/synonyms/antonyms/tier) ──────
/** 단어시험 — 표제어↔뜻 (hide-meaning/hide-headword), tier 필터, 첫글자 힌트. */
function buildVocabQuiz(ctx: GenContext, params: ActivityParams, seedKey: number): ActivityPayload {
  const mode = params.vocabMode === "hide-headword" ? "hide-headword" : "hide-meaning";
  const tier = params.tier ?? "all";
  let pool = ctx.vocab.filter((v) => v.headword.trim() && v.meaning.trim());
  if (tier !== "all") {
    const filtered = pool.filter((v) => (v.tier ?? "test") === tier);
    if (filtered.length >= 2) pool = filtered;
  }
  if (pool.length === 0) return { items: [], instructions: "" };
  const count = Math.min(params.count ?? 20, pool.length);
  const picked = seededShuffle(pool, mulberry32(seedKey >>> 0)).slice(0, count);
  const items: ActivityItem[] = picked.map((v, i) => {
    if (mode === "hide-headword") {
      const hint = params.firstLetterHint ? `   (${blankSkeleton(v.headword, true)})` : "";
      return { no: i + 1, prompt: `${v.meaning}${hint}   →  ____________________`, answer: v.headword };
    }
    const pron = v.pronunciation ? ` (${v.pronunciation})` : "";
    return { no: i + 1, prompt: `${v.headword}${pron}   뜻: ____________________`, answer: v.meaning };
  });
  return {
    items,
    instructions: mode === "hide-headword" ? "뜻에 해당하는 영어 표현을 쓰시오." : "단어의 뜻을 쓰시오.",
  };
}

/** 동의어·반의어 매칭 — 좌측 표제어 ↔ 우측(셔플) 동의어/반의어/뜻/발음 매칭. 디코이(정답 없는 보기)로 난이도↑. */
function buildVocabMatch(ctx: GenContext, params: ActivityParams, seedKey: number): ActivityPayload {
  const rel = params.relation ?? "synonym";
  const matchBy = params.matchBy ?? "synonym";
  // 우측 후보 토큰 목록 — synonym/antonym 은 쉼표 분리, meaning/pronunciation 은 통째.
  const rightTokens = (v: GenVocab): string[] => {
    if (matchBy === "meaning") return v.meaning?.trim() ? [v.meaning.trim()] : [];
    if (matchBy === "pronunciation") return v.pronunciation?.trim() ? [v.pronunciation.trim()] : [];
    const raw = ((rel === "antonym" ? v.antonyms : v.synonyms) ?? "").trim();
    if (!raw || raw === "—") return [];
    return raw.split(/[,/·;]/).map((t) => t.trim()).filter(Boolean);
  };
  const pool = ctx.vocab.filter((v) => v.headword.trim() && rightTokens(v).length > 0);
  if (pool.length < 2) return { items: [], instructions: "" };
  const want = Math.min(params.count ?? 6, 8);
  const decoyCount = Math.min(params.decoyCount ?? 0, 3);
  // 우측 값 중복 제거(유일해): 같은 보기면 다음 토큰/제외.
  const chosen: { hw: string; ans: string }[] = [];
  const seen = new Set<string>();
  const shuffled = seededShuffle(pool, mulberry32(seedKey >>> 0));
  for (const v of shuffled) {
    if (chosen.length >= want) break;
    const hw = v.headword.trim();
    const ans = rightTokens(v).find((t) => !seen.has(t.toLowerCase()) && t.toLowerCase() !== hw.toLowerCase());
    if (!ans) continue;
    seen.add(ans.toLowerCase());
    chosen.push({ hw, ans });
  }
  if (chosen.length < 2) return { items: [], instructions: "" };
  const left = chosen.map((c) => c.hw);
  const rightAnswers = chosen.map((c) => c.ans);
  // 교란순열 — 고정점 없음(같은 행에 정답쌍이 오지 않음). 우측 모든 값이 distinct → 유일해 보장.
  const perm = derangement(chosen.length, seedKey + 7); // perm[k]=우측 위치 k 에 보일 정답 인덱스
  const right = perm.map((ai) => rightAnswers[ai]);
  const answer = left.map((_, i) => perm.indexOf(i)); // 좌측 i 의 정답 우측 위치
  // 디코이 — 정답에 없는 보기를 우측 뒤에 추가(소거 풀이 방지). 정답 인덱스는 그대로(앞쪽).
  if (decoyCount > 0) {
    const decoys: string[] = [];
    for (const v of shuffled) {
      if (decoys.length >= decoyCount) break;
      const t = rightTokens(v).find((x) => !seen.has(x.toLowerCase()));
      if (!t) continue;
      seen.add(t.toLowerCase());
      decoys.push(t);
    }
    right.push(...seededShuffle(decoys, mulberry32((seedKey + 19) >>> 0)));
  }
  const answerStr = left.map((_, i) => `${circledNo(i)}-${circledLetter(answer[i])}`).join("   ");
  const rightHead = matchBy === "meaning" ? "뜻" : matchBy === "pronunciation" ? "발음" : rel === "antonym" ? "반의어" : "동의어";
  return {
    items: [{ no: 1, prompt: "", answer: answerStr }],
    match: {
      left,
      right,
      answer,
      leftHead: "표제어",
      rightHead,
    },
    instructions: `왼쪽 단어의 ${rightHead}을(를) 오른쪽에서 찾아 기호를 쓰시오.`,
  };
}

// ─── 직독직해 (chunksFull.gloss 재료) ─────────────────────────────────────────
/** 직독직해 빈칸 — 문장을 청크로 끊어 일부 청크를 빈칸 처리, 우리말 gloss 를 단서로 영어 복원. */
function buildChunkGlossCloze(ctx: GenContext, nos: number[] | undefined, params: ActivityParams, seedKey: number): ActivityPayload {
  const picked = selectSentences(ctx.sentences, nos).filter(
    (s) => (s.chunksFull?.length ?? 0) >= 2 && (s.chunksFull?.some((c) => c.gloss?.trim()) ?? false),
  );
  if (picked.length === 0) return { items: [], instructions: "" };
  const density = params.density ?? 40;
  const items: ActivityItem[] = [];
  let no = 0; // 블록 전체 연속 빈칸 번호 (정답지와 일치)
  picked.forEach((s, si) => {
    const chunks = (s.chunksFull ?? []).filter((c) => c.text.trim());
    const cand = chunks.map((_, i) => i).filter((i) => chunks[i].gloss?.trim());
    if (cand.length === 0) return;
    const k = Math.max(1, Math.round(cand.length * (density / 100)));
    const blanks = new Set(seededShuffle(cand, mulberry32((seedKey + si * 101) >>> 0)).slice(0, k));
    const answerKey: string[] = [];
    const cueParts: string[] = [];
    const rendered = chunks.map((c, i) => {
      if (blanks.has(i)) {
        no += 1;
        answerKey.push(c.text.trim());
        // 단서(gloss)는 무번호 — 수동 빈칸 추가로 인라인 번호가 바뀌어도 단서가 어긋나지 않게(읽기 순서로 대응).
        cueParts.push(c.gloss!.trim());
        return `(${no}) __________`;
      }
      return c.text.trim();
    });
    items.push({
      no: items.length + 1,
      sentenceNo: s.n,
      prompt: `${rendered.join(" / ")}\n   단서: ${cueParts.join(" / ")}`,
      answer: "",
      answerKey,
    });
  });
  if (items.length === 0) return { items: [], instructions: "" };
  return { items, instructions: "우리말 단서를 보고, 빈칸 [ ] 에 들어갈 영어 의미 단위를 쓰시오." };
}


// ─── 디스패치 ────────────────────────────────────────────────────────────────
export function generateActivityPayload(
  activityKind: ActivityKind,
  ctx: GenContext,
  nos: number[] | undefined,
  params: ActivityParams,
  seedKey: number,
): ActivityPayload {
  switch (activityKind) {
    case "chunk-scramble":
      return buildScramble(ctx, nos, { ...params, unit: "chunk" }, seedKey);
    case "word-scramble":
      return buildScramble(ctx, nos, { ...params, unit: "word" }, seedKey);
    case "keyword-cloze":
      return buildKeywordCloze(ctx, nos, params, seedKey);
    case "full-cloze":
      return buildFullCloze(ctx, nos, params, seedKey);
    case "nested-cloze":
      return buildNestedCloze(ctx, nos, params, seedKey);
    case "chunk-gloss-cloze":
      return buildChunkGlossCloze(ctx, nos, params, seedKey);
    case "slash-compose":
      return buildSlashCompose(ctx, nos, params);
    case "sentence-order":
      return buildSentenceOrder(ctx, nos, params, seedKey);
    case "sentence-translation":
      return buildSentenceTranslation(ctx, nos, params);
    case "reproduction":
      return buildReproduction(ctx, nos, params);
    case "vocab-quiz":
      return buildVocabQuiz(ctx, params, seedKey);
    case "vocab-match":
      return buildVocabMatch(ctx, params, seedKey);
    default:
      return { items: [], instructions: "" };
  }
}

// ─── 블록 빌드 / re-roll / 파라미터 적용 ─────────────────────────────────────
export function makeActivityBlock(
  report: AnalysisReport,
  input: { activityKind: ActivityKind; sentenceNos?: number[]; params?: ActivityParams; seed?: number; id?: string; title?: string },
): ActivityBlock {
  const ctx = extractGenContext(report);
  const id = input.id ?? localActivityBlockId();
  const seed = input.seed ?? 1;
  const params = { ...defaultActivityParams(input.activityKind), ...(input.params ?? {}) };
  const payload = generateActivityPayload(input.activityKind, ctx, input.sentenceNos, params, seedFrom(id, seed));
  return {
    kind: "activity",
    id,
    activityKind: input.activityKind,
    title: input.title ?? "",
    sentenceNos: input.sentenceNos,
    params,
    seed,
    payload,
    answersHidden: true,
  };
}

export function rerolledActivityBlock(report: AnalysisReport, block: ActivityBlock): ActivityBlock {
  const ctx = extractGenContext(report);
  const seed = (block.seed ?? 1) + 1;
  const payload = generateActivityPayload(block.activityKind, ctx, block.sentenceNos, block.params, seedFrom(block.id, seed));
  return { ...block, seed, payload };
}

export function appliedActivityParams(report: AnalysisReport, block: ActivityBlock, patch: Partial<ActivityParams>): ActivityBlock {
  const ctx = extractGenContext(report);
  const params = { ...block.params, ...patch };
  const payload = generateActivityPayload(block.activityKind, ctx, block.sentenceNos, params, seedFrom(block.id, block.seed ?? 1));
  return { ...block, params, payload };
}

export function appliedActivitySentences(report: AnalysisReport, block: ActivityBlock, sentenceNos?: number[]): ActivityBlock {
  const ctx = extractGenContext(report);
  const payload = generateActivityPayload(block.activityKind, ctx, sentenceNos, block.params, seedFrom(block.id, block.seed ?? 1));
  return { ...block, sentenceNos, payload };
}

// ─── 카탈로그 메타 (팔레트용) ────────────────────────────────────────────────
export type ActivityCatalogEntry = {
  kind: ActivityKind;
  labelKo: string;
  labelEn: string;
  category: "빈칸/복원" | "직독직해" | "어순/배열" | "어휘";
  description: string;
  enabled: boolean; // false = 곧 추가 예정 (팔레트에 비활성 표시)
};

export function defaultActivityParams(kind: ActivityKind): ActivityParams {
  switch (kind) {
    case "chunk-scramble":
      return { splitMode: "chunk", separator: "chip", koPosition: "above", writeLines: 1, firstChunkHint: false };
    case "word-scramble":
      return { splitMode: "word", separator: "chip", koPosition: "above", writeLines: 1, firstChunkHint: false };
    case "keyword-cloze":
      return { density: 30, wordBank: true, target: "content" };
    case "full-cloze":
      return { density: 55, target: "content", wordBank: true, firstLetterHint: false };
    case "nested-cloze":
      return { rounds: 3, density: 80, target: "content" };
    case "reproduction":
      return { linesPerSentence: 2, scaffold: false, wholePassage: false };
    case "sentence-translation":
      return { linesPerSentence: 1 };
    case "slash-compose":
      return { writeLines: 1, koPosition: "below" };
    case "sentence-order":
      return { labelStyle: "alpha", showKo: false, anchor: "first" };
    case "vocab-quiz":
      return { vocabMode: "hide-meaning", tier: "all", count: 20, firstLetterHint: false };
    case "vocab-match":
      return { relation: "synonym", count: 6 };
    case "chunk-gloss-cloze":
      return { density: 40 };
    default:
      return {};
  }
}

export const ACTIVITY_CATALOG: ActivityCatalogEntry[] = [
  // ── 빈칸/복원 (맨 앞) ──
  { kind: "keyword-cloze", labelKo: "키워드 빈칸", labelEn: "Keyword Cloze", category: "빈칸/복원", description: "밀도를 정해 핵심 단어를 빈칸으로 — 품사 타깃·첫글자 힌트·단어은행", enabled: true },
  { kind: "full-cloze", labelKo: "전지문 빈칸", labelEn: "Full Cloze", category: "빈칸/복원", description: "지문 전체를 통째로 빈칸 처리 + 단어은행 1개 — 본문 통암기 확인지", enabled: true },
  { kind: "nested-cloze", labelKo: "중첩 라운드 빈칸", labelEn: "Nested Cloze", category: "빈칸/복원", description: "회차가 오를수록 빈칸이 늘어나는 점증 복원 — 한 블록에 통암기 계단", enabled: true },
  { kind: "chunk-gloss-cloze", labelKo: "직독직해 빈칸", labelEn: "Chunk Gloss Cloze", category: "빈칸/복원", description: "문장을 끊어 일부 청크를 빈칸으로, 우리말 뜻을 단서로 영어 복원", enabled: true },
  // ── 직독직해 ──
  { kind: "slash-compose", labelKo: "끊어읽기 + 영작", labelEn: "Slash & Compose", category: "직독직해", description: "의미 단위(/)로 끊은 본문을 단서로 영어 문장을 다시 영작", enabled: true },
  { kind: "sentence-translation", labelKo: "해석 쓰기 (영→한)", labelEn: "Translate EN→KO", category: "직독직해", description: "영어 문장을 보고 우리말 해석을 직접 적어 이해를 점검", enabled: true },
  { kind: "reproduction", labelKo: "백지 영작 (한→영)", labelEn: "Reproduction KO→EN", category: "직독직해", description: "한국어 해석만 보고 영어 문장을 백지에서 복원 — 1등급 핵심 드릴 (전지문 모드)", enabled: true },
  // ── 어순/배열 ──
  // 어순 배열은 단일 카드. 의미 단위/단어/N단어 분할은 추가 후 편집기의 '덩어리 분할 방식'에서 전환한다.
  { kind: "chunk-scramble", labelKo: "어순 배열", labelEn: "Word Order", category: "어순/배열", description: "문장을 의미 단위·단어·N단어로 섞어 바른 순서로 배열·영작 — 분할 방식은 추가 후 편집기에서 전환", enabled: true },
  { kind: "sentence-order", labelKo: "문장 순서 배열", labelEn: "Sentence Order", category: "어순/배열", description: "선택한 문장들을 섞어 글의 흐름대로 순서를 재배열 (3문장 이상)", enabled: true },
  // 어휘는 카드형 대신 팔레트 하단의 '단어 시험지' 컨트롤로 대체(vocab-quiz/vocab-match 카드 제거).
];

const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  "chunk-scramble": "어순 배열 (의미 단위)",
  "word-scramble": "어순 배열 (단어)",
  "keyword-cloze": "키워드 빈칸",
  "full-cloze": "전지문 빈칸",
  "nested-cloze": "중첩 라운드 빈칸",
  "chunk-gloss-cloze": "직독직해 빈칸",
  "slash-compose": "끊어읽기 + 영작",
  "sentence-order": "문장 순서 배열",
  "sentence-translation": "해석 쓰기 (영→한)",
  "reproduction": "백지 영작 (한→영)",
  "vocab-quiz": "단어 시험",
  "vocab-match": "동의어·반의어 매칭",
};

export function activityLabel(kind: ActivityKind): string {
  return ACTIVITY_LABELS[kind] ?? "학습 활동";
}

/**
 * 블록 단위 라벨 — 어순 배열은 고정된 activityKind 대신 현재 splitMode(의미 단위/단어/N단어)를 반영한다.
 * 단일 '어순 배열' 카드로 삽입한 뒤 편집기에서 분할 방식을 바꿔도 헤더 라벨이 어긋나지 않게 한다.
 * (구 chunk-scramble/word-scramble 저장본도 splitMode 기준으로 올바르게 표시됨.)
 */
export function activityBlockLabel(block: ActivityBlock): string {
  if (block.activityKind === "chunk-scramble" || block.activityKind === "word-scramble") {
    const mode = block.params.splitMode ?? (block.params.unit === "word" ? "word" : "chunk");
    const suffix = mode === "word" ? "단어" : mode === "ngram" ? "N단어" : "의미 단위";
    return `어순 배열 (${suffix})`;
  }
  return activityLabel(block.activityKind);
}

/** 빈칸형 활동인지 (빈칸 밀도·'새 빈칸' re-roll 노출 여부 판단용). */
export function isClozeActivity(kind: ActivityKind): boolean {
  return /cloze/.test(kind);
}

/** 팔레트 미니 프리뷰 — 현재 지문 첫 적격 문장 1개를 해당 활동으로 변환한 학생용 한 줄. */
export function activityPreviewLine(report: AnalysisReport, kind: ActivityKind): string {
  const ctx = extractGenContext(report);
  if (ctx.sentences.length === 0) return "지문 문장이 없습니다.";
  const payload = generateActivityPayload(kind, ctx, undefined, defaultActivityParams(kind), seedFrom(`preview-${kind}`, 1));
  const first = payload.items[0];
  if (!first) return "이 지문에서 만들 수 있는 항목이 없습니다.";
  return first.prompt.length > 90 ? first.prompt.slice(0, 90) + "…" : first.prompt;
}
