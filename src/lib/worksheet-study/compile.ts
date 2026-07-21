// ============================================================================
// 학습지 스터디 모드 — 컴파일러 정본 (플레인 모듈, 순수·결정론)
//
// AnalysisReport(학습지 JSON) → StudyPlan(모바일 단계별 학습 코스).
// 모든 셔플·선택은 seedKey 기반 mulberry32 — 같은 (report, mode, taskId) 는
// 항상 같은 plan 을 낸다. Math.random·Date.now·API 호출 금지.
// 규범: docs/worksheet-study-spec.md §4. 원천 데이터가 빈 스테이지는 조용히 제외.
//
// 인쇄 활동 엔진(study-activities.ts)은 읽기 전용 재사용 — 수정 금지.
// ============================================================================

import type {
  AnalysisReport,
  LearningWorksheetSection,
  SelfCheckSection,
} from "@/lib/passage-report/analysis-report/schema";
import {
  extractGenContext,
  generateActivityPayload,
  isFunctionWord,
  type GenContext,
  type GenSentence,
  type GenVocab,
} from "@/lib/passage-report/analysis-report/study-activities";
import {
  ITEM_EST_SEC,
  PLAN_ITEM_CAP,
  STAGE_ITEM_CAP,
  STUDY_PRESETS,
  type StudyPresetCaps,
} from "./presets";
import {
  STUDY_STAGE_META,
  type StudyItem,
  type StudyMode,
  type StudyPlan,
  type StudyStage,
  type StudyStageId,
} from "./types";

// ── 결정론 인프라 (study-activities.ts 와 동일 알고리즘 — 미수출이라 지역 복제) ──

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

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** fnv1a 32bit — planHash 용 콘텐츠 지문. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 고정점 없는 순열 — 매칭 우측 셔플(정답 누출 방지). */
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
  return Array.from({ length: n }, (_, i) => (i + 1) % n);
}

const WORD_RE = /^[A-Za-z][A-Za-z'’-]{2,}$/;
const splitWords = (en: string): string[] => en.trim().split(/\s+/).filter(Boolean);
const normLite = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/** 첫글자 + 길이만큼 밑줄 — "Verbatim" → "V_______". */
function scaffoldFirstLetters(en: string): string {
  return splitWords(en)
    .map((w) => {
      if (!/^[A-Za-z]/.test(w)) return w;
      const letters = w.replace(/[^A-Za-z'’-]/g, "");
      return w[0] + "_".repeat(Math.max(1, letters.length - 1));
    })
    .join(" ");
}

/** 단어 수 슬롯 — 각 단어를 글자 수만큼 ▁ 로. */
function wordCountSlots(en: string): string {
  return splitWords(en)
    .map((w) => "▁".repeat(Math.max(1, w.replace(/[^A-Za-z'’-]/g, "").length)))
    .join("  ");
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

// ── 우선순위 문장 선택 (spec §4.1) ───────────────────────────────────────────

function prioritySentences(
  ctx: GenContext,
  report: AnalysisReport,
  cap: number,
  seed: number,
  filter?: (s: GenSentence) => boolean,
): GenSentence[] {
  const pool = ctx.sentences.filter((s) => s.en.trim().length > 0 && (!filter || filter(s)));
  if (pool.length <= cap) return pool;

  const referenced = new Set<number>();
  for (const g of ctx.grammar) referenced.add(g.sentenceNo);
  const lw = report.sections.find((s) => s.kind === "learning-worksheet") as
    | LearningWorksheetSection
    | undefined;
  if (lw) for (const r of lw.logicRows) if (r.sentenceNo) referenced.add(r.sentenceNo);
  const parsing = report.sections.find((s) => s.kind === "parsing");
  if (parsing?.kind === "parsing") for (const it of parsing.items) referenced.add(it.sentenceNo);

  // emphasis:"core" 청크는 GenContext 에서 탈락하므로 원본 passage 섹션에서 직접 읽는다.
  const coreEmphasis = new Set<number>();
  const passage = report.sections.find((s) => s.kind === "passage");
  if (passage?.kind === "passage") {
    for (const s of passage.sentences) {
      if (s.chunks?.some((c) => c.emphasis === "core")) coreEmphasis.add(s.n);
    }
  }

  const tierOf = (s: GenSentence): number => {
    if (referenced.has(s.n)) return 0;
    if (coreEmphasis.has(s.n)) return 1;
    return 2;
  };
  // 동률은 seeded 셔플, 계층 내에서는 단어 수 내림차순.
  const rng = mulberry32(seed >>> 0);
  const shuffled = seededShuffle(pool, rng);
  const ranked = shuffled
    .map((s, i) => ({ s, tier: tierOf(s), words: splitWords(s.en).length, i }))
    .sort((a, b) => a.tier - b.tier || b.words - a.words || a.i - b.i)
    .slice(0, cap)
    .map((x) => x.s);
  // 출제는 지문 흐름 순서.
  return ranked.sort((a, b) => a.n - b.n);
}

// ── 스테이지 빌더 ────────────────────────────────────────────────────────────

type BuildCtx = {
  report: AnalysisReport;
  ctx: GenContext;
  caps: StudyPresetCaps;
  seedKey: number;
};

function stageSeed(seedKey: number, stageId: string): number {
  return (seedKey ^ hashString(stageId)) >>> 0;
}

function buildReading(b: BuildCtx): StudyItem[] {
  const items: StudyItem[] = [];
  const { summary, structure } = b.ctx;
  if (summary?.thesisEn?.trim()) {
    items.push({
      key: "reading:intro:0",
      type: "read",
      skill: "comprehension",
      n: 0,
      en: summary.thesisEn.trim(),
      ko: [structure?.logicFlow, ...(summary.sentences ?? [])].filter(Boolean).join(" "),
    });
  }
  for (const s of b.ctx.sentences) {
    if (!s.en.trim()) continue;
    items.push({
      key: `reading:read:${s.n}`,
      type: "read",
      skill: "comprehension",
      sentenceNo: s.n,
      n: s.n,
      en: s.en.trim(),
      ko: s.ko,
      chunks: s.chunksFull?.length ? s.chunksFull : undefined,
    });
  }
  return items;
}

const TIER_ORDER: Record<string, number> = { core: 0, test: 1, challenge: 2 };
const TIER_LABEL: Record<string, string> = { core: "핵심", test: "시험", challenge: "도전" };

function buildVocabFlash(b: BuildCtx): StudyItem[] {
  const rows = [...b.ctx.vocab].sort(
    (x, y) => (TIER_ORDER[x.tier ?? "test"] ?? 1) - (TIER_ORDER[y.tier ?? "test"] ?? 1),
  );
  return rows.map((v, i) => ({
    key: `vocab-flash:flash:${i + 1}`,
    type: "flash" as const,
    skill: "vocab" as const,
    wordKey: v.headword,
    front: v.headword,
    back: v.meaning,
    sub: [v.pronunciation, v.tier ? TIER_LABEL[v.tier] : undefined].filter(Boolean).join(" · ") || undefined,
    extra:
      v.synonyms || v.antonyms
        ? { synonyms: v.synonyms || undefined, antonyms: v.antonyms || undefined }
        : undefined,
  }));
}

/** MC 오답 후보 3개 — 같은 학습지의 다른 rows 에서 seeded 선택(중복·정답 동치 제거). */
function pickDistractors(
  pool: string[],
  answer: string,
  rng: () => number,
): string[] | null {
  const seen = new Set<string>([normLite(answer)]);
  const cand: string[] = [];
  for (const p of seededShuffle(pool, rng)) {
    const key = normLite(p);
    if (!p.trim() || seen.has(key)) continue;
    seen.add(key);
    cand.push(p.trim());
    if (cand.length === 3) break;
  }
  return cand.length === 3 ? cand : null;
}

function mcFromParts(
  key: string,
  skill: StudyItem["skill"],
  prompt: string,
  promptEn: boolean,
  answer: string,
  distractors: string[],
  rng: () => number,
  extra?: Partial<Extract<StudyItem, { type: "mc" }>>,
): StudyItem {
  const texts = seededShuffle([answer, ...distractors], rng);
  const choices = texts.map((text, i) => ({ label: CIRCLED[i], text }));
  const answerLabel = choices.find((c) => c.text === answer)!.label;
  return {
    key,
    type: "mc",
    skill,
    prompt,
    promptEn: promptEn || undefined,
    choices,
    answerLabel,
    ...extra,
  } as StudyItem;
}

function buildVocabQuiz(b: BuildCtx): StudyItem[] {
  const seed = stageSeed(b.seedKey, "vocab-quiz");
  const rng = mulberry32(seed);
  const rows = seededShuffle(
    b.ctx.vocab.filter((v) => v.headword.trim() && v.meaning.trim()),
    rng,
  ).slice(0, b.caps.vocabQuiz);
  const meanings = b.ctx.vocab.map((v) => v.meaning);
  const headwords = b.ctx.vocab.map((v) => v.headword);
  const items: StudyItem[] = [];
  rows.forEach((v, i) => {
    if (b.caps.vocabTypingChallenge && v.tier === "challenge") {
      items.push({
        key: `vocab-quiz:type:${i + 1}`,
        type: "typing",
        skill: "vocab",
        wordKey: v.headword,
        promptKo: `뜻: ${v.meaning}`,
        answer: v.headword,
        scaffold: "firstLetter",
        hint: scaffoldFirstLetters(v.headword),
      });
      return;
    }
    if (i % 2 === 0) {
      // 단어 → 뜻
      const d = pickDistractors(meanings, v.meaning, rng);
      if (!d) return;
      items.push({
        ...mcFromParts(`vocab-quiz:mc:${i + 1}`, "vocab", v.headword, true, v.meaning, d, rng),
        wordKey: v.headword,
      });
    } else {
      // 뜻 → 단어
      const d = pickDistractors(headwords, v.headword, rng);
      if (!d) return;
      items.push({
        ...mcFromParts(`vocab-quiz:mc:${i + 1}`, "vocab", v.meaning, false, v.headword, d, rng),
        wordKey: v.headword,
      });
    }
  });
  return items;
}

/**
 * synonyms/antonyms 문자열에서 첫 유효 항목 추출 — "search, retrieve" → "search".
 * AI 생성 계약(prompt.ts)상 "해당 없음"은 "—"(em dash)로 오므로 반드시 배제한다.
 * 배제하지 않으면 같은 "—" 셀이 여러 개인 풀 수 없는 매칭이 만들어진다
 * (인쇄 엔진 study-activities.ts 의 동일 가드와 정합).
 */
function firstToken(list: string | undefined): string | null {
  if (!list) return null;
  for (const raw of list.split(/[,/·;]/)) {
    const t = raw.trim();
    if (!t || t === "—" || t === "-" || t === "–" || t === "N/A") continue;
    return t;
  }
  return null;
}

/**
 * 매칭 그리드 조립 — 우측 값 유일성을 강제한다(인덱스 채점이라 같은 글자 셀이
 * 둘이면 학생이 정답을 맞힐 방법이 없다). 중복 우측 값을 가진 행은 제외.
 */
function buildMatchItem(
  key: string,
  skill: StudyItem["skill"],
  leftHead: string,
  rightHead: string,
  pairs: { left: string; right: string }[],
  seed: number,
  sentenceNo?: number,
): StudyItem | null {
  const seen = new Set<string>();
  const uniq: { left: string; right: string }[] = [];
  for (const p of pairs) {
    const k = normLite(p.right);
    if (!p.left.trim() || !p.right.trim() || seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }
  if (uniq.length < 3) return null;
  const per = derangement(uniq.length, seed);
  // right[per[i]] = uniq[i].right — answer[i] = per[i]
  const right: string[] = new Array(uniq.length);
  uniq.forEach((p, i) => {
    right[per[i]] = p.right;
  });
  return {
    key,
    type: "match",
    skill,
    ...(sentenceNo ? { sentenceNo } : {}),
    leftHead,
    rightHead,
    left: uniq.map((p) => p.left),
    right,
    answer: per,
  } as StudyItem;
}

function buildVocabMatch(b: BuildCtx): StudyItem[] {
  const seed = stageSeed(b.seedKey, "vocab-match");
  const syn = b.ctx.vocab
    .map((v) => ({ v, pair: firstToken(v.synonyms) }))
    .filter((x): x is { v: GenVocab; pair: string } => !!x.pair);
  const ant = b.ctx.vocab
    .map((v) => ({ v, pair: firstToken(v.antonyms) }))
    .filter((x): x is { v: GenVocab; pair: string } => !!x.pair);
  const groups: { rel: "동의어" | "반의어"; pairs: { v: GenVocab; pair: string }[] }[] = [];
  for (let i = 0; i < syn.length; i += 6) groups.push({ rel: "동의어", pairs: syn.slice(i, i + 6) });
  for (let i = 0; i < ant.length; i += 6) groups.push({ rel: "반의어", pairs: ant.slice(i, i + 6) });
  const items: StudyItem[] = [];
  groups.forEach((g, gi) => {
    const item = buildMatchItem(
      `vocab-match:match:${gi + 1}`,
      "vocab",
      "표제어",
      g.rel,
      g.pairs.map((p) => ({ left: p.v.headword, right: p.pair })),
      seed + gi * 101,
    );
    if (item) items.push(item);
  });
  return items;
}

function buildChunk(b: BuildCtx): StudyItem[] {
  const seed = stageSeed(b.seedKey, "chunk");
  const picked = prioritySentences(
    b.ctx,
    b.report,
    b.caps.chunkSentences,
    seed,
    (s) => (s.chunksFull?.filter((c) => c.text.trim()).length ?? 0) >= 3,
  );
  const items: StudyItem[] = [];
  picked.forEach((s, si) => {
    const chunks = s.chunksFull!.filter((c) => c.text.trim());
    const glossed = chunks.filter((c) => c.gloss?.trim());
    // (a) 청크 ↔ 뜻 매칭 — 우측(우리말 뜻) 유일성 강제, 3쌍 이상일 때만
    const matchItem = buildMatchItem(
      `chunk:match:${s.n}`,
      "chunk",
      "영어 의미 단위",
      "우리말 뜻",
      glossed.map((c) => ({ left: c.text.trim(), right: c.gloss!.trim() })),
      seed + si * 101,
      s.n,
    );
    if (matchItem) items.push(matchItem);
    // (b) 청크 빈칸 — 40% 마스킹, 뜻 단서.
    // 청크 text 는 원문 공백을 구분자로 보유한다(이어붙이면 en 과 글자 그대로
    // 일치). 따라서 trim 하지 않고 그대로 세그먼트에 실어 "brainas" 같은
    // 단어 붙음을 막는다. answerKey 는 trim(채점은 normalizeEn 이 흡수).
    const rng = mulberry32((seed + si * 211) >>> 0);
    const k = Math.max(1, Math.round(chunks.length * 0.4));
    const blankIdx = new Set(
      seededShuffle(
        chunks.map((_, i) => i),
        rng,
      ).slice(0, k),
    );
    const segments: ({ t: string } | { blank: number })[] = [];
    const answerKey: string[] = [];
    const cues: string[] = [];
    chunks.forEach((c, i) => {
      if (blankIdx.has(i)) {
        // 청크 앞뒤 공백은 빈칸 밖 텍스트로 보존 — 인접 청크가 붙지 않게
        const lead = c.text.slice(0, c.text.length - c.text.trimStart().length);
        const trail = c.text.slice(c.text.trimEnd().length);
        if (lead) segments.push({ t: lead });
        segments.push({ blank: answerKey.length });
        if (trail) segments.push({ t: trail });
        answerKey.push(c.text.trim());
        cues.push(c.gloss?.trim() || "…");
      } else {
        segments.push({ t: c.text });
      }
    });
    items.push({
      key: `chunk:cloze:${s.n}`,
      type: "cloze",
      skill: "chunk",
      sentenceNo: s.n,
      segments,
      bank: seededShuffle(answerKey, rng),
      answerKey,
      cue: `단서: ${cues.join(" / ")}`,
    });
  });
  return items;
}

function buildGrammar(b: BuildCtx): StudyItem[] {
  if (b.caps.grammarItems === 0) return [];
  const seed = stageSeed(b.seedKey, "grammar");
  const rng = mulberry32(seed);
  const items: StudyItem[] = [];
  // (a) 어법 포인트 → OX (60% 오류 문장 / 40% 정상 문장)
  b.ctx.grammar.forEach((g, gi) => {
    if (!g.example?.trim() || !g.exampleWrong?.trim() || !g.exampleCorrect?.trim()) return;
    const useWrong = rng() < 0.6;
    const statement = useWrong
      ? g.example.trim()
      : g.example.trim().replace(g.exampleWrong.trim(), g.exampleCorrect.trim());
    // 치환 실패(원문에 exampleWrong 부재) 시 오류 문장으로 폴백
    const wrong = useWrong || statement === g.example.trim();
    items.push({
      key: `grammar:ox:${gi + 1}`,
      type: "ox",
      skill: "grammar",
      sentenceNo: g.sentenceNo,
      grammarCode: g.pointCode,
      statement,
      wrong,
      fixFrom: wrong ? g.exampleWrong.trim() : undefined,
      fixTo: wrong ? g.exampleCorrect.trim() : undefined,
      explanation: [g.point, g.explanation].filter(Boolean).join(" — "),
    });
  });
  // (b) 실전 학습지 어법 택일 드릴
  const lw = b.report.sections.find((s) => s.kind === "learning-worksheet") as
    | LearningWorksheetSection
    | undefined;
  const drills = lw?.drills?.grammarChoices ?? [];
  drills.forEach((d, di) => {
    if (!d.text?.trim() || d.choices.length < 2 || !d.answer?.trim()) return;
    items.push({
      key: `grammar:ic:${di + 1}`,
      type: "inline-choice",
      skill: "grammar",
      sentenceNo: d.sentenceNo,
      before: d.text.trim(),
      after: "",
      options: d.choices.map((c) => c.trim()),
      answer: d.answer.trim(),
      explanation: d.explanation?.trim() || undefined,
    });
  });
  return items.slice(0, b.caps.grammarItems);
}

/** 토큰 빈칸 세그먼트 빌더 — buildKeywordCloze 의 선정 규칙을 구조화 출력으로 미러. */
function sentenceClozeItem(
  key: string,
  s: GenSentence,
  density: number,
  seed: number,
  decoyPool: string[],
): StudyItem | null {
  const tokens = s.en.trim().split(/(\s+)/);
  const candIdx = tokens
    .map((_, i) => i)
    .filter((i) => WORD_RE.test(tokens[i]) && !isFunctionWord(tokens[i]));
  if (candIdx.length === 0) return null;
  const rng = mulberry32(seed >>> 0);
  const k = Math.max(1, Math.round(candIdx.length * (density / 100)));
  const blanks = new Set(seededShuffle(candIdx, rng).slice(0, k).sort((a, b) => a - b));
  const segments: ({ t: string } | { blank: number })[] = [];
  const answerKey: string[] = [];
  let buf = "";
  tokens.forEach((tok, i) => {
    if (blanks.has(i)) {
      // 공백만 남은 buf 도 세그먼트로 보존 — 인접한 두 빈칸 사이의 띄어쓰기가
      // 사라져 재조립 문장이 "feellike" 처럼 붙는 것을 막는다.
      if (buf) segments.push({ t: buf.replace(/\s+/g, " ") });
      buf = "";
      segments.push({ blank: answerKey.length });
      answerKey.push(tok.replace(/[^A-Za-z'’-]/g, "") || tok);
    } else {
      buf += tok;
    }
  });
  if (buf) segments.push({ t: buf.replace(/\s+/g, " ") });
  if (answerKey.length === 0) return null;
  // 은행 = 정답 + 디코이 ≤2 (다른 문장의 정답에서), 총 ≤12
  const seen = new Set(answerKey.map(normLite));
  const decoys: string[] = [];
  for (const d of seededShuffle(decoyPool, rng)) {
    if (decoys.length >= 2 || answerKey.length + decoys.length >= 12) break;
    if (seen.has(normLite(d))) continue;
    seen.add(normLite(d));
    decoys.push(d);
  }
  return {
    key,
    type: "cloze",
    skill: "cloze",
    sentenceNo: s.n,
    segments,
    bank: seededShuffle([...answerKey, ...decoys], rng),
    answerKey,
    cue: s.ko || undefined,
  };
}

function buildCloze(b: BuildCtx): StudyItem[] {
  const seed = stageSeed(b.seedKey, "cloze");
  const picked = prioritySentences(b.ctx, b.report, b.caps.clozeSentences, seed);
  // 디코이 풀 — 전체 문장의 내용어
  const decoyPool = b.ctx.sentences.flatMap((s) =>
    splitWords(s.en)
      .filter((w) => WORD_RE.test(w) && !isFunctionWord(w))
      .map((w) => w.replace(/[^A-Za-z'’-]/g, "")),
  );
  const items: StudyItem[] = [];
  picked.forEach((s, si) => {
    const item = sentenceClozeItem(`cloze:kw:${s.n}`, s, 30, seed + si * 101, decoyPool);
    if (item) items.push(item);
  });
  // intense: 고밀도 2회차 (우선순위 상위 8문장, 55%)
  if (b.caps.clozeNestedRound) {
    picked.slice(0, 8).forEach((s, si) => {
      const item = sentenceClozeItem(`cloze:r2:${s.n}`, s, 55, seed + 7000 + si * 101, decoyPool);
      if (item) items.push(item);
    });
  }
  // 어휘 빈칸 (workbookSet.vocabularyCloze) — 인쇄 지문의 "(n) ____" 마커를 구조화
  const lw = b.report.sections.find((s) => s.kind === "learning-worksheet") as
    | LearningWorksheetSection
    | undefined;
  const vc = lw?.workbookSet?.vocabularyCloze;
  if (vc?.passage && vc.blanks.length >= 2) {
    const answerByNo = new Map(vc.blanks.map((bl) => [bl.no, bl]));
    const parts = vc.passage.split(/\((\d+)\)\s*_{3,}/g);
    // split 결과: [text, no, text, no, ...] — 홀수 인덱스가 번호
    const segments: ({ t: string } | { blank: number })[] = [];
    const answerKey: string[] = [];
    const cues: string[] = [];
    let okParse = true;
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        const t = parts[i].replace(/\s+/g, " ");
        if (t.trim()) segments.push({ t });
      } else {
        const bl = answerByNo.get(Number(parts[i]));
        if (!bl?.answer) {
          okParse = false;
          break;
        }
        segments.push({ blank: answerKey.length });
        answerKey.push(bl.answer.trim());
        cues.push(bl.meaning?.trim() || bl.clue?.trim() || "");
      }
    }
    if (okParse && answerKey.length >= 2) {
      const rng = mulberry32((seed + 9999) >>> 0);
      const capped = answerKey.length <= b.caps.vocabClozeItems * 2; // 과대 지문 가드
      if (capped) {
        items.push({
          key: "cloze:vc:1",
          type: "cloze",
          skill: "cloze",
          segments,
          bank: seededShuffle(answerKey, rng),
          answerKey,
          cue: cues.some(Boolean) ? `단서: ${cues.map((c) => c || "…").join(" / ")}` : undefined,
        });
      }
    }
  }
  return items;
}

function buildOrder(b: BuildCtx): StudyItem[] {
  if (b.caps.orderSentences === 0) return [];
  const seed = stageSeed(b.seedKey, "order");
  const items: StudyItem[] = [];
  // (a) 청크 어순 배열 — 인쇄 엔진 재사용 (chips 동일 로직)
  const picked = prioritySentences(
    b.ctx,
    b.report,
    b.caps.orderSentences,
    seed,
    (s) => (s.chunks?.length ?? 0) >= 3 || splitWords(s.en).length >= 5,
  );
  const nos = picked.map((s) => s.n);
  if (nos.length > 0) {
    const payload = generateActivityPayload(
      "chunk-scramble",
      b.ctx,
      nos,
      { splitMode: "chunk", separator: "chip", koPosition: "above" },
      seed,
    );
    payload.items.forEach((it) => {
      if (!it.chips || it.chips.length < 3 || !it.answer) return;
      items.push({
        key: `order:cs:${it.sentenceNo ?? it.no}`,
        type: "order",
        skill: "order",
        sentenceNo: it.sentenceNo,
        ko: it.ko || undefined,
        tiles: it.chips,
        answer: it.answer,
      });
    });
  }
  // (b) 실전 학습지 어순 배열 (drills + workbookSet — 이미 스크램블된 chunks)
  const lw = b.report.sections.find((s) => s.kind === "learning-worksheet") as
    | LearningWorksheetSection
    | undefined;
  const woSources = [...(lw?.drills?.wordOrders ?? []), ...(lw?.workbookSet?.wordOrders ?? [])];
  woSources.forEach((w, wi) => {
    if (!w.korean?.trim() || !w.answer?.trim() || w.chunks.length < 3) return;
    items.push({
      key: `order:wo:${wi + 1}`,
      type: "order",
      skill: "order",
      sentenceNo: "sentenceNo" in w ? (w as { sentenceNo?: number }).sentenceNo : undefined,
      ko: w.korean.trim(),
      tiles: w.chunks.map((c) => c.trim()).filter(Boolean),
      answer: w.answer.trim(),
    });
  });
  // (c) 문장 순서 배열 — 문장 4개 이상일 때 1문항
  if (b.ctx.sentences.length >= 4) {
    const payload = generateActivityPayload(
      "sentence-order",
      b.ctx,
      undefined,
      { labelStyle: "alpha", anchor: "first", showKo: false },
      seed,
    );
    if (payload.order && payload.order.cards.length >= 2) {
      const seq = payload.order.answer.includes("→")
        ? payload.order.answer.split("→").pop()!.trim()
        : payload.order.answer.trim();
      items.push({
        key: "order:so:1",
        type: "sentence-order",
        skill: "order",
        given: payload.order.given,
        cards: payload.order.cards,
        answer: seq,
      });
    }
  }
  return items;
}

function buildTranslation(b: BuildCtx): StudyItem[] {
  if (b.caps.translationSentences === 0) return [];
  const seed = stageSeed(b.seedKey, "translation");
  const picked = prioritySentences(b.ctx, b.report, b.caps.translationSentences, seed, (s) =>
    Boolean(s.ko?.trim()),
  );
  return picked.map((s) => ({
    key: `translation:sg:${s.n}`,
    type: "self-grade" as const,
    skill: "production" as const,
    sentenceNo: s.n,
    en: s.en.trim(),
    modelKo: s.ko,
  }));
}

function buildReproduction(b: BuildCtx): StudyItem[] {
  if (b.caps.reproductionSentences === 0) return [];
  const seed = stageSeed(b.seedKey, "reproduction");
  const picked = prioritySentences(b.ctx, b.report, b.caps.reproductionSentences, seed, (s) =>
    Boolean(s.ko?.trim()),
  );
  // 스캐폴드 사다리 — 앞 2문항 wordSlots, 다음 2문항 firstLetter, 이후 none.
  return picked.map((s, i) => {
    const scaffold = i < 2 ? ("wordSlots" as const) : i < 4 ? ("firstLetter" as const) : ("none" as const);
    return {
      key: `reproduction:type:${s.n}`,
      type: "typing" as const,
      skill: "production" as const,
      sentenceNo: s.n,
      promptKo: s.ko,
      answer: s.en.trim(),
      scaffold,
      hint:
        scaffold === "wordSlots"
          ? wordCountSlots(s.en)
          : scaffold === "firstLetter"
            ? scaffoldFirstLetters(s.en)
            : undefined,
    };
  });
}

/** self-check answers 의 answer 문자열을 choices 라벨로 해석 — "③"/"3"/보기 본문 전부 수용. */
function resolveAnswerLabel(
  answer: string,
  choices: { label: string; text: string }[],
): string | null {
  const a = answer.trim();
  if (!a) return null;
  for (const c of choices) {
    if (a === c.label || a.startsWith(c.label)) return c.label;
    if (normLite(c.text) === normLite(a)) return c.label;
  }
  const circledIdx = CIRCLED.indexOf(a[0]);
  if (circledIdx >= 0 && circledIdx < choices.length) return choices[circledIdx].label;
  const digit = a.match(/^\(?(\d)\)?/);
  if (digit) {
    const idx = Number(digit[1]) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx].label;
  }
  return null;
}

function buildExam(b: BuildCtx): StudyItem[] {
  const items: StudyItem[] = [];
  // (a) 학습 점검 (self-check)
  const sc = b.report.sections.find((s) => s.kind === "self-check") as SelfCheckSection | undefined;
  if (sc) {
    const answerByNo = new Map(sc.answers.map((a) => [a.no, a]));
    sc.questions.forEach((q) => {
      if (!q.choices || q.choices.length < 2) return;
      const ans = answerByNo.get(q.no);
      if (!ans?.answer) return;
      const choices = q.choices.map((text, i) => ({ label: CIRCLED[i] ?? `(${i + 1})`, text }));
      const answerLabel = resolveAnswerLabel(ans.answer, choices);
      if (!answerLabel) return;
      items.push({
        key: `exam:sc:${q.no}`,
        type: "mc",
        skill: "comprehension",
        prompt: `[${q.type}] ${q.prompt}`,
        choices,
        answerLabel,
        explanation: ans.explanation || undefined,
      });
    });
  }
  // (b) 수능추론 5문항 (inferenceSet)
  if (b.caps.examInference) {
    const lw = b.report.sections.find((s) => s.kind === "learning-worksheet") as
      | LearningWorksheetSection
      | undefined;
    const inf = lw?.inferenceSet;
    inf?.questions.forEach((q) => {
      if (q.choices.length < 2 || !q.answerLabel) return;
      const answerLabel = resolveAnswerLabel(q.answerLabel, q.choices) ?? q.answerLabel.trim();
      if (!q.choices.some((c) => c.label === answerLabel)) return;
      items.push({
        key: `exam:inf:${q.no}`,
        type: "mc",
        skill: "comprehension",
        prompt: q.prompt,
        passage: q.passage || undefined,
        choices: q.choices,
        answerLabel,
        explanation: q.explanation || undefined,
      });
    });
  }
  return items;
}

// ── 플랜 조립 ────────────────────────────────────────────────────────────────

const STAGE_BUILDERS: Record<StudyStageId, (b: BuildCtx) => StudyItem[]> = {
  reading: buildReading,
  "vocab-flash": buildVocabFlash,
  "vocab-quiz": buildVocabQuiz,
  "vocab-match": buildVocabMatch,
  chunk: buildChunk,
  grammar: buildGrammar,
  cloze: buildCloze,
  order: buildOrder,
  translation: buildTranslation,
  reproduction: buildReproduction,
  exam: buildExam,
};

function estMinutes(items: StudyItem[]): number {
  const sec = items.reduce((acc, it) => acc + (ITEM_EST_SEC[it.type] ?? 20), 0);
  return Math.max(1, Math.ceil(sec / 60));
}

export interface CompileInput {
  report: AnalysisReport;
  mode: Exclude<StudyMode, "off">;
  taskId: string;
  reportTitle: string;
}

export function compileStudyPlan(input: CompileInput): StudyPlan {
  const { report, mode, taskId, reportTitle } = input;
  const preset = STUDY_PRESETS[mode];
  const seedKey = hashString(taskId);
  const ctx = extractGenContext(report);
  const b: BuildCtx = { report, ctx, caps: preset.caps, seedKey };

  const stages: StudyStage[] = [];
  // 누적 상한(PLAN_ITEM_CAP) 집행 — 프리셋 순서가 학습 순서이므로 남는 예산만큼만
  // 후순위 스테이지를 싣고, 예산이 0이면 더 싣지 않는다(spec §4.2).
  let budget = PLAN_ITEM_CAP;
  for (const id of preset.stages) {
    if (budget <= 0) break;
    const items = STAGE_BUILDERS[id](b).slice(0, Math.min(STAGE_ITEM_CAP, budget));
    if (items.length === 0) continue;
    budget -= items.length;
    const meta = STUDY_STAGE_META[id];
    stages.push({
      id,
      title: meta.title,
      subtitle: meta.subtitle,
      skill: meta.skill,
      items,
      estMin: estMinutes(items),
      graded: meta.graded,
    });
  }

  const totalItems = stages.reduce((acc, s) => acc + s.items.length, 0);
  const contentSig = fnv1a(
    JSON.stringify(report.sections) + "|" + mode + "|" + String(seedKey),
  );

  // 취약 단어장(리포트)용 표제어 → 뜻 맵 — 스테이지 구성과 무관하게 항상 제공
  const vocabMeanings: Record<string, string> = {};
  for (const v of ctx.vocab) {
    if (v.headword.trim() && v.meaning.trim()) vocabMeanings[v.headword] = v.meaning;
  }

  return {
    planVersion: 1,
    taskId,
    reportTitle,
    planHash: contentSig,
    seedKey,
    mode,
    stages,
    totalItems,
    vocabMeanings,
  };
}

/** 스터디 모드 성립 여부 — 채점 스테이지 2개 이상 (spec §8.1 분기 3). */
export function planIsViable(plan: StudyPlan): boolean {
  return plan.stages.filter((s) => s.graded).length >= 2;
}
