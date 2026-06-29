/**
 * 학습 활동 결정론 생성기 — 정답 누출 / 모순 / 퇴화 회귀 가드.
 *   npx tsx scripts/verify-study-activities.ts
 *
 * 핵심 불변식(READ-vs-WRITE): 학생이 *생성*해야 하는 언어는 학생 면(prompt/ko)에 절대 노출 금지.
 *  - produce-EN (백지영작·끊어읽기영작·어순배열): 영어 정답 문장이 prompt 안에 통째로 보이면 실패.
 *  - produce-KO (해석 쓰기): 한글 정답이 prompt 안에 보이면 실패.
 * 그 외: 매칭 유일해(우측 distinct·교란순열), 빈칸 전(全)등장 처리, 비어있지 않음 등.
 */
import { makeActivityBlock, applyManualBlankToItem, applyManualBlankToBlock, insertIntoWordBank, isFunctionWord } from "@/lib/passage-report/analysis-report/study-activities";
import type { AnalysisReport, ActivityKind } from "@/lib/passage-report/analysis-report/schema";

const report = {
  schemaVersion: 1, brand: "X", themeId: "black-white",
  meta: { titleKo: "t", titleEn: "t", category: "c", theme: "th", difficulty: 3, solveTime: "3", examTypes: "x" },
  sections: [
    {
      kind: "passage",
      sentences: [
        { n: 1, en: "Memory is not a perfect recording but a reconstruction.", ko: "기억은 완벽한 기록이 아니라 재구성이다.",
          chunks: [{ text: "Memory is", gloss: "기억은 ~이다", role: "주어+동사" }, { text: "not a perfect recording", gloss: "완벽한 기록이 아니라" }, { text: "but a reconstruction.", gloss: "재구성이다" }] },
        { n: 2, en: "The more we recall, the more we may distort the memory.", ko: "우리가 더 회상할수록 그 기억을 더 왜곡할 수 있다." },
        { n: 3, en: "Both recall and recognition strengthen memory in different ways.", ko: "회상과 재인은 서로 다른 방식으로 기억을 강화한다." },
        { n: 4, en: "Recognition is like scrolling through a gallery to find an image.", ko: "재인은 이미지를 찾으려 갤러리를 스크롤하는 것과 같다." },
        { n: 5, en: "This is why multiple-choice questions feel easier than essays.", ko: "이것이 객관식 문제가 서술형보다 쉽게 느껴지는 이유다." },
      ],
      keywords: ["memory", "recall", "recognition", "reconstruction"],
    },
    {
      kind: "grammar",
      rows: [
        { sentenceNo: 3, excerpt: "Both recall and recognition strengthen", pointCode: "d", point: "(d) 수일치 — strengthen", explanation: "복수 주어라 동사 원형.", trap: "단수형 함정", example: "Both recall and recognition strengthens memory.", exampleWrong: "strengthens", exampleCorrect: "strengthen" },
        { sentenceNo: 4, excerpt: "scrolling through a gallery", pointCode: "c", point: "(c) 분사 — scrolling", explanation: "능동 의미라 현재분사.", trap: "p.p. 함정", example: "Recognition is like scrolled through a gallery.", exampleWrong: "scrolled", exampleCorrect: "scrolling" },
        { sentenceNo: 5, excerpt: "easier than essays", pointCode: "m", point: "(m) 비교 — than", explanation: "비교급 뒤 than.", trap: "as 함정", example: "MCQ feels easier as essays.", exampleWrong: "as", exampleCorrect: "than" },
      ],
    },
    {
      kind: "vocabulary",
      rows: [
        { headword: "recall", pronunciation: "리콜", meaning: "회상하다", tier: "test", difficulty: 3, synonyms: "remember, retrieve", antonyms: "forget" },
        { headword: "distort", pronunciation: "디스토트", meaning: "왜곡하다", tier: "challenge", difficulty: 4, synonyms: "twist, warp", antonyms: "straighten" },
        { headword: "strengthen", pronunciation: "스트렝큰", meaning: "강화하다 (strengthen)", tier: "test", difficulty: 3, synonyms: "reinforce, bolster", antonyms: "weaken" },
        { headword: "recognition", pronunciation: "레커그니션", meaning: "재인, 인식", tier: "challenge", difficulty: 4, synonyms: "identification", antonyms: "—" },
        { headword: "memory", pronunciation: "메모리", meaning: "기억", tier: "core", difficulty: 2, synonyms: "recollection", antonyms: "—" },
      ],
    },
    { kind: "summary", sentences: ["기억은 재구성이다.", "인출에는 회상과 재인이 있다.", "회상이 더 어렵지만 기억을 강화한다."], thesisEn: "Retrieving memory in two modes strengthens long-term learning." },
    {
      kind: "structure-map", variant: "compare",
      intro: { label: "기억 인출의 두 갈래" },
      branchLabel: "인출",
      columns: [
        { titleEn: "RECALL", titleKo: "회상", bullets: ["단서 없음", "주관식"], footer: "" },
        { titleEn: "RECOGNITION", titleKo: "재인", bullets: ["선택지 제공", "객관식"], footer: "" },
      ],
      coreDistinction: { label: "단서(cue)의 유무", detail: "단서 없음 ◀ 회상 ┃ 재인 ▶ 단서 풍부" },
      conclusion: { text: "인출 연습이 기억을 강화한다." },
      logicFlow: "도입 → 대조 → 결론",
    },
  ],
} as unknown as AnalysisReport;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

// 생성될 모든 카탈로그 kind (+ 변주 파라미터)
// PRODUCE_EN = 학생이 영어를 *써야* 하는 활동 → 영어 정답이 prompt 에 보이면 실패.
const PRODUCE_EN: ActivityKind[] = ["reproduction", "slash-compose", "word-scramble", "chunk-scramble"];
// CLOZE_EN_KEY = answerKey 가 영어이고 단일 문장 내 가림 → answerKey 가 prompt 에 평문으로 남으면 실패.
const CLOZE_EN_KEY: ActivityKind[] = ["chunk-gloss-cloze"];
const cases: { kind: ActivityKind; params?: Record<string, unknown>; label: string }[] = [
  { kind: "chunk-scramble", label: "어순(청크)" },
  { kind: "word-scramble", label: "어순(단어)" },
  { kind: "word-scramble", params: { splitMode: "ngram", ngramSize: 4 }, label: "어순(N단어)" },
  { kind: "keyword-cloze", label: "키워드빈칸" },
  { kind: "full-cloze", label: "전지문빈칸" },
  { kind: "nested-cloze", label: "중첩빈칸" },
  { kind: "nested-cloze", params: { rounds: 3, roundDensities: [30, 60, 100] }, label: "중첩빈칸(회차별밀도)" },
  { kind: "nested-cloze", params: { rounds: 3, roundDensities: [80, 20, 50] }, label: "중첩빈칸(비단조→정규화)" },
  { kind: "reproduction", label: "백지영작" },
  { kind: "reproduction", params: { scaffoldLevel: "wordSlots" }, label: "백지영작(단어슬롯)" },
  { kind: "reproduction", params: { scaffoldLevel: "firstLetter" }, label: "백지영작(첫글자)" },
  { kind: "reproduction", params: { scaffoldLevel: "wordBank" }, label: "백지영작(단어보기)" },
  { kind: "reproduction", params: { wholePassage: true, scaffoldLevel: "firstLetter" }, label: "백지영작(전지문)" },
  { kind: "sentence-translation", label: "해석쓰기" },
  { kind: "slash-compose", label: "끊어읽기영작" },
  { kind: "slash-compose", params: { scaffoldLevel: "wordSlots" }, label: "끊어읽기영작(슬롯)" },
  { kind: "sentence-order", label: "문장순서" },
  { kind: "sentence-order", params: { anchor: "none" }, label: "문장순서(앵커없음)" },
  { kind: "vocab-quiz", label: "단어시험(영→한)" },
  { kind: "vocab-quiz", params: { vocabMode: "hide-headword", firstLetterHint: true }, label: "단어시험(한→영)" },
  { kind: "vocab-match", label: "동의어매칭" },
  { kind: "vocab-match", params: { relation: "antonym" }, label: "반의어매칭" },
  { kind: "vocab-match", params: { decoyCount: 2 }, label: "매칭(디코이2)" },
  { kind: "vocab-match", params: { matchBy: "meaning" }, label: "매칭(뜻기준)" },
  { kind: "chunk-gloss-cloze", label: "직독직해빈칸" },
];

let fail = 0;
const log = (ok: boolean, msg: string) => { if (!ok) { fail++; console.log("  ✗ " + msg); } };

for (const c of cases) {
  for (let seed = 1; seed <= 5; seed++) {
    const block = makeActivityBlock(report, { activityKind: c.kind, params: c.params as never, seed });
    const p = block.payload;
    const tag = `[${c.label} seed${seed}]`;

    // 1) 정답 누출 검사
    if (PRODUCE_EN.includes(c.kind)) {
      for (const it of p.items) {
        const hay = norm(it.prompt + " " + (it.ko ?? ""));
        const ans = norm(it.answer);
        if (ans.length >= 8) log(!hay.includes(ans), `${tag} 영어 정답이 prompt 에 노출됨: "${it.answer}"`);
      }
    }
    if (c.kind === "sentence-translation") {
      for (const it of p.items) {
        const hay = norm(it.prompt + " " + (it.ko ?? ""));
        const ans = norm(it.answer);
        if (ans.length >= 6) log(!hay.includes(ans), `${tag} 한글 정답이 prompt 에 노출됨: "${it.answer}"`);
      }
    }

    // 2) 매칭 유일해: 우측 distinct + 교란순열(고정점 0) + answer 인덱스 유효
    if (p.match) {
      const m = p.match;
      log(new Set(m.right.map(norm)).size === m.right.length, `${tag} 매칭 우측 중복(유일해 깨짐): ${JSON.stringify(m.right)}`);
      log(m.answer.every((a, i) => a !== i), `${tag} 매칭 고정점 존재(같은 행 정답): ${JSON.stringify(m.answer)}`);
      log(m.answer.every((a) => a >= 0 && a < m.right.length), `${tag} 매칭 answer 인덱스 범위 밖`);
    }

    // 3) 빈칸형(영어 정답키): 정답 영어가 prompt 에 평문으로 남으면 안 됨(전 등장 가림)
    if (CLOZE_EN_KEY.includes(c.kind)) {
      for (const it of p.items) {
        for (const key of it.answerKey ?? []) {
          if (/[A-Za-z]/.test(key) && key.length >= 3) {
            const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            log(!re.test(it.prompt), `${tag} 빈칸 정답 "${key}" 가 prompt 에 평문 노출됨`);
          }
        }
      }
    }

    // 4) 중첩빈칸 superset (회차 k+1 의 빈칸 수 ≥ 회차 k)
    if (c.kind === "nested-cloze" && p.items.length >= 2) {
      for (let r = 1; r < p.items.length; r++) {
        const a = p.items[r - 1].answerKey?.length ?? 0;
        const b = p.items[r].answerKey?.length ?? 0;
        log(b >= a, `${tag} 중첩 회차 ${r + 1} 빈칸수(${b}) < 회차 ${r}(${a}) — superset 위반`);
      }
    }
  }
}

// ─── 빈칸 번호 일치(인라인 ↔ 정답지) — 모든 cloze 유형 강박 검증 ───
type ItemLite = { prompt: string; answerKey?: string[] };
function answerNumsPerItem(items: ItemLite[], resetPerItem: boolean): number[][] {
  let bn = 0;
  return items.map((it) => {
    if (!it.answerKey?.length) return [];
    if (resetPerItem) bn = 0;
    return it.answerKey.map(() => (bn += 1));
  });
}
function inlineNumsPerItem(items: ItemLite[]): number[][] {
  return items.map((it) => {
    const re = /\((\d+)\)\s*[A-Za-z]?_{3,}/g;
    const set = new Set<number>();
    const out: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(it.prompt))) {
      const n = Number(m[1]);
      if (!set.has(n)) { set.add(n); out.push(n); } // 같은 번호 반복(어휘/어법 전역치환)은 1회로
    }
    return out;
  });
}
const CLOZE_KINDS: ActivityKind[] = ["keyword-cloze", "full-cloze", "nested-cloze", "chunk-gloss-cloze"];
for (const kind of CLOZE_KINDS) {
  for (let seed = 1; seed <= 4; seed++) {
    const block = makeActivityBlock(report, { activityKind: kind, seed });
    if (block.payload.items.length === 0) continue;
    const reset = kind === "nested-cloze";
    const ans = answerNumsPerItem(block.payload.items, reset);
    const inl = inlineNumsPerItem(block.payload.items);
    block.payload.items.forEach((_, i) => {
      log(JSON.stringify(ans[i]) === JSON.stringify(inl[i]), `[번호일치 ${kind} s${seed} item${i}] 인라인 ${JSON.stringify(inl[i])} ≠ 정답지 ${JSON.stringify(ans[i])}`);
    });
  }
}

// ─── 내용어(content) 빈칸 필터 — 전치사·접속사·관사·대명사·조동사 누출 0 (사용자 요구) ───
// keyword/full/nested cloze 는 모두 clozeCandidateIdx 를 통해 빈칸을 고른다. 기본 target="content"
// 에서 answerKey(빈칸 정답)에 기능어가 단 하나라도 끼면 실패. (빈칸 개수보다 필터 우선)
{
  // 기능어가 잔뜩 섞인 합성 지문 — 필터가 없으면 the/for/with/and/but/that/which/their… 가 빈칸이 된다.
  const fnReport = {
    schemaVersion: 1, brand: "X", themeId: "black-white",
    meta: { titleKo: "t", titleEn: "t", category: "c", theme: "th", difficulty: 3, solveTime: "3", examTypes: "x" },
    sections: [
      {
        kind: "passage",
        sentences: [
          { n: 1, en: "Within liberal culture, the value of fairness for individuals outweighs the preservation of family integrity.", ko: "자유주의 문화 안에서는 개인의 공정성 가치가 가족 통합의 보존보다 중요하다." },
          { n: 2, en: "In contrast, Confucian cultures believe that the family assumes a fundamental role and that living within a family institution is essential.", ko: "대조적으로, 유교 문화는 가족이 근본적 역할을 맡으며 가족 제도 안에서 사는 것이 필수적이라고 믿는다." },
          { n: 3, en: "Therefore, some societies may choose to impose restrictions because they prefer collective welfare over individual rights.", ko: "따라서 어떤 사회는 집단 복지를 개인의 권리보다 선호하기 때문에 제약을 부과하기로 선택할 수 있다." },
        ],
        keywords: ["culture", "family", "rights"],
      },
    ],
  } as unknown as AnalysisReport;
  const CONTENT_CLOZE: ActivityKind[] = ["keyword-cloze", "full-cloze", "nested-cloze"];
  for (const kind of CONTENT_CLOZE) {
    for (let seed = 1; seed <= 6; seed++) {
      // 높은 밀도로 강제 — 후보가 넓어도 기능어가 새지 않아야 한다.
      const block = makeActivityBlock(fnReport, { activityKind: kind, params: { density: 90 } as never, seed });
      for (const it of block.payload.items) {
        for (const key of it.answerKey ?? []) {
          log(!isFunctionWord(key), `[내용어필터 ${kind} s${seed}] 기능어가 빈칸으로 누출됨: "${key}"`);
        }
      }
    }
  }
  // 명시적 기능어 표본 — 사용자가 지목한 전치사/접속사 + 관사/대명사/조동사 + 저빈도 전치사/접속사(despite/throughout/via/lest/albeit)
  for (const w of [
    "for", "with", "from", "into", "and", "but", "because", "although", "while", "the", "their", "which",
    "that", "are", "have", "this", "these", "your", "they", "not", "very", "more",
    "despite", "throughout", "via", "per", "amid", "alongside", "underneath", "regarding", "concerning",
    "lest", "albeit", "whereby", "wherein",
  ]) {
    log(isFunctionWord(w), `[내용어필터] 기능어로 분류돼야 하는데 누락됨: "${w}"`);
  }
  // 내용어 표본 — 절대 기능어로 오분류되면 안 됨(빈칸 후보가 사라지는 회귀 방지). need/dare/done 등 동음어 포함.
  for (const w of [
    "value", "culture", "family", "fairness", "integrity", "fundamental", "restrictions", "welfare",
    "individuals", "preservation", "institution", "collective", "need", "dare", "done", "doing", "having",
  ]) {
    log(!isFunctionWord(w), `[내용어필터] 내용어가 기능어로 오분류됨(빈칸 후보 손실): "${w}"`);
  }
}

// ─── 수동 빈칸 블록 재번호 — 인라인=정답지 일치 유지(여러 문장 연속 번호) ───
{
  const items: ItemLite[] = [
    { prompt: "The (1) __________ is a (2) __________ today.", answerKey: ["cat", "pet"] },
    { prompt: "A (3) __________ runs fast.", answerKey: ["fox"] },
  ];
  const idx = items[1].prompt.indexOf("runs");
  const renum = applyManualBlankToBlock(items, 1, idx, idx + 4, false);
  log(!!renum, "[수동빈칸 블록] 변환 실패");
  if (renum) {
    const ans = answerNumsPerItem(renum.items, false);
    const inl = inlineNumsPerItem(renum.items);
    renum.items.forEach((_, i) => log(JSON.stringify(ans[i]) === JSON.stringify(inl[i]), `[수동빈칸 번호 item${i}] 인라인 ${JSON.stringify(inl[i])} ≠ 정답지 ${JSON.stringify(ans[i])}`));
    log(JSON.stringify(renum.items[1].answerKey) === JSON.stringify(["fox", "runs"]), `[수동빈칸] item1 answerKey 틀림: ${JSON.stringify(renum.items[1].answerKey)}`);
    log(/\(4\)/.test(renum.items[1].prompt), `[수동빈칸] 새 빈칸 (4) 없음: ${renum.items[1].prompt}`);
    log(renum.added === "runs", `[수동빈칸] added 단어 틀림: ${renum.added}`);
  }
  // 드래그로 만든 단어를 단어 은행에 넣음 — 끝이 아니라 흩어 넣고, 반드시 포함.
  const bank = ["the", "cat", "pet", "fox"];
  const after = insertIntoWordBank(bank, "runs");
  log(after.includes("runs"), "[단어은행] 새 단어 미포함");
  log(after.length === bank.length + 1, "[단어은행] 길이 증가 실패");
}

// ─── 수동 빈칸(드래그→빈칸) 변환 검증 ───
{
  const base = "You must search (1) __________ and reconstruct information without hints.";
  const a = "You must search (1) __________ and ".length;
  const probe = applyManualBlankToItem({ prompt: base, answerKey: ["your"] }, a, a + "reconstruct".length);
  log(!!probe, "[manual-blank] reconstruct 빈칸 생성 실패");
  if (probe) {
    log(JSON.stringify(probe.answerKey) === JSON.stringify(["your", "reconstruct"]), `[manual-blank] 위치순 answerKey 틀림: ${JSON.stringify(probe.answerKey)}`);
    log(/\(1\)/.test(probe.prompt) && /\(2\)/.test(probe.prompt), "[manual-blank] 번호 재정렬 안됨");
    log(!/\breconstruct\b/.test(probe.prompt), "[manual-blank] 정답이 prompt 에 남아 누출");
  }
  const koPrompt = "(1) __________ memory.\n   (뜻: 기억)";
  const ks = koPrompt.indexOf("기억");
  log(applyManualBlankToItem({ prompt: koPrompt, answerKey: ["recall"] }, ks, ks + 2) === null, "[manual-blank] 한글 단서 빈칸 거부 실패");
  log(applyManualBlankToItem({ prompt: "a (1) __________ b", answerKey: ["x"] }, 2, 9) === null, "[manual-blank] 기존 빈칸 겹침 거부 실패");
}

if (fail === 0) console.log(`\n✅ ALL PASS — 정답 누출 0 · 매칭 유일해 · 빈칸 전등장 가림 · 중첩 superset + 수동빈칸 변환 (${cases.length} cases × 5 seeds)`);
else { console.log(`\n❌ ${fail} 건 실패`); process.exit(1); }
