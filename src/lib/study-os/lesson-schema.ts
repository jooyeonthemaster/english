// ============================================================================
// 인터랙티브 레슨 — zod 저작 게이트
//
// src/data/grammar-drill/lessons/{conceptId}.json 은 이 스키마를 통과해야만
// 번들에 실린다. scripts/verify-lessons.ts 가 소비한다.
// 규범: docs/study-os-spec.md §3, §7
// ============================================================================

import { z } from "zod";
import { violatesHamnida } from "@/lib/grammar-drill/schema";
import {
  GAME_BLOCK_TYPES,
  MAX_RULE_CHARS,
  MIN_BLOCKS_PER_LESSON,
  MIN_BLOCK_COUNT,
  MIN_GAME_BLOCKS,
  MIN_GAME_TYPES,
  RECAP_ITEM_COUNT,
  REQUIRED_BLOCK_TYPES,
} from "./lesson-types";

const HANGUL_RE = /[가-힣]/;

/** 한국어 산문 — 합니다체 강제 */
const ko = z
  .string()
  .min(2)
  .refine((s) => !violatesHamnida(s), { message: "합니다체 위반(해요체 어미)" });

/** 영어 문장 — 한글 혼입 금지 */
const en = z
  .string()
  .min(2)
  .refine((s) => !HANGUL_RE.test(s), { message: "영어 필드에 한글이 혼입되었습니다" });

const tier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

const example = z.object({
  en,
  ko,
  note: ko.optional(),
  wrong: z.boolean().optional(),
});

const syntaxRole = z.enum(["S", "V", "O", "C", "M", "CONJ", "REL", "VERBAL", "X"]);

const base = { id: z.string().min(1), tier, title: ko.optional() };

// ── 레슨 내 문항 ────────────────────────────────────────────────────────────

const BLANK_RE = /\{\{blank\}\}/g;
const SINGLE_U_RE = /\[\[u:((?:(?!\]\]).)+)\]\]/g;
const NUM_U_RE = /\[\[([1-9]):((?:(?!\]\]).)+)\]\]/g;

const lessonChoiceItem = z
  .object({
    id: z.string().regex(/^[ub](0[1-9]|1[0-2])-c[1-5]-ls-\d{3}$/),
    type: z.literal("CHOICE"),
    difficulty,
    stem: en,
    options: z.array(en).min(2).max(3),
    answer: z.number().int().min(0),
    translation: ko,
    explanation: ko,
    trapTags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(6).optional(),
  })
  .refine((v) => (v.stem.match(BLANK_RE) ?? []).length === 1, {
    message: "stem에 {{blank}}가 정확히 1개 있어야 합니다",
  })
  .refine((v) => v.answer < v.options.length, { message: "answer 범위 초과" })
  .refine(
    (v) => new Set(v.options.map((o) => o.trim().toLowerCase())).size === v.options.length,
    { message: "options에 중복이 있습니다(정답 유일성 위반)" },
  );

const lessonOxItem = z
  .object({
    id: z.string().regex(/^[ub](0[1-9]|1[0-2])-c[1-5]-ls-\d{3}$/),
    type: z.literal("OX"),
    difficulty,
    sentence: en,
    isCorrect: z.boolean(),
    correction: en.optional(),
    translation: ko,
    explanation: ko,
    trapTags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(6).optional(),
  })
  .refine((v) => [...v.sentence.matchAll(SINGLE_U_RE)].length === 1, {
    message: "sentence에 [[u:...]] 밑줄이 정확히 1개 있어야 합니다",
  })
  .refine((v) => v.isCorrect || Boolean(v.correction), {
    message: "isCorrect=false면 correction이 필요합니다",
  });

// refine 이 걸린 스키마는 discriminatedUnion 에 넣을 수 없으므로 union 으로 간다.
const itemSchema = z.union([lessonChoiceItem, lessonOxItem]);

// ── 블록 19종 ───────────────────────────────────────────────────────────────

const hook = z
  .object({
    ...base,
    type: z.literal("HOOK"),
    prompt: ko,
    options: z.array(en).length(2),
    answer: z.number().int().min(0).max(1),
    afterText: ko,
  })
  .strict();

const misconception = z
  .object({
    ...base,
    type: z.literal("MISCONCEPTION"),
    myth: ko,
    truth: ko,
    counterExample: example,
  })
  .strict();

const rule = z
  .object({
    ...base,
    type: z.literal("RULE"),
    rule: ko.refine((s) => s.length <= MAX_RULE_CHARS, {
      message: `RULE 벽글 금지 — ${MAX_RULE_CHARS}자 이하로 쓰고, 초과분은 NOTEBOOK/TABLE 로 구조화하십시오(§11.3)`,
    }),
    examples: z.array(example).min(1).max(3),
  })
  .strict();

const diagram = z
  .object({
    ...base,
    type: z.literal("DIAGRAM"),
    tokens: z.array(z.object({ t: en, role: syntaxRole }).strict()).min(3).max(30),
    ko,
    layers: z
      .array(
        z
          .object({ label: ko, roles: z.array(syntaxRole).min(1), note: ko })
          .strict(),
      )
      .min(2)
      .max(4),
    conclusion: ko,
  })
  .strict();

const algorithm = z
  .object({
    ...base,
    type: z.literal("ALGORITHM"),
    steps: z.array(z.object({ text: ko, applyNote: ko }).strict()).min(3).max(5),
    example,
  })
  .strict();

const worked = z
  .object({
    ...base,
    type: z.literal("WORKED"),
    question: ko,
    stem: en,
    steps: z.array(z.object({ title: ko, body: ko }).strict()).min(3).max(5),
    answer: z.string().min(1),
    ko,
  })
  .strict();

const completion = z
  .object({
    ...base,
    type: z.literal("COMPLETION"),
    stem: en,
    givenSteps: z.array(ko).min(1).max(4),
    prompt: ko,
    options: z.array(z.string().min(1)).min(2).max(4),
    answer: z.number().int().min(0),
    explain: ko,
  })
  .strict()
  .refine((v) => v.answer < v.options.length, { message: "answer 범위 초과" });

const check = z
  .object({
    ...base,
    type: z.literal("CHECK"),
    items: z.array(itemSchema).min(1).max(3),
  })
  .strict();

const contrast = z
  .object({
    ...base,
    type: z.literal("CONTRAST"),
    columns: z.tuple([z.string().min(1), z.string().min(1)]),
    rows: z.array(z.object({ criterion: ko, a: z.string().min(1), b: z.string().min(1) }).strict()).min(2).max(5),
    examples: z.array(example).min(1).max(4),
  })
  .strict();

const sort = z
  .object({
    ...base,
    type: z.literal("SORT"),
    instruction: ko,
    buckets: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) }).strict()).min(2).max(3),
    chips: z.array(z.object({ text: z.string().min(1), bucketId: z.string().min(1), why: ko }).strict()).min(4).max(8),
  })
  .strict()
  .refine((v) => v.chips.every((c) => v.buckets.some((b) => b.id === c.bucketId)), {
    message: "chip.bucketId 가 buckets 에 없습니다",
  });

const trap = z
  .object({
    ...base,
    type: z.literal("TRAP"),
    trapTitle: ko,
    body: ko,
    example,
  })
  .strict();

const exam = z
  .object({
    ...base,
    type: z.literal("EXAM"),
    scenes: z
      .array(
        z
          .object({
            scope: z.enum(["SCHOOL", "CSAT"]),
            how: ko,
            sample: z.object({ en, ask: ko, answer: z.string().min(1) }).strict(),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();

const selfExplain = z
  .object({
    ...base,
    type: z.literal("SELF_EXPLAIN"),
    question: ko,
    options: z.array(z.object({ text: ko, correct: z.boolean(), feedback: ko }).strict()).min(3).max(3),
  })
  .strict()
  .refine((v) => v.options.filter((o) => o.correct).length === 1, {
    message: "정답 근거는 정확히 1개여야 합니다",
  });

const note = z
  .object({ ...base, type: z.literal("NOTE"), prompt: ko, scaffold: ko.optional() })
  .strict();

const summary = z
  .object({
    ...base,
    type: z.literal("SUMMARY"),
    bullets: z.array(ko).min(2).max(5),
    keySentence: example,
  })
  .strict();

const recap = z
  .object({
    ...base,
    type: z.literal("RECAP"),
    items: z.array(itemSchema).length(RECAP_ITEM_COUNT),
  })
  .strict();

const generate = z
  .object({
    ...base,
    type: z.literal("GENERATE"),
    instruction: ko,
    ko,
    answer: z.array(en).min(3).max(12),
    tiles: z.array(en).min(4).max(14),
    explanation: ko,
  })
  .strict()
  .refine((v) => v.answer.every((a) => v.tiles.includes(a)), {
    message: "answer 어절이 tiles 에 전부 있어야 합니다",
  });

const errorHunt = z
  .object({
    ...base,
    type: z.literal("ERROR_HUNT"),
    instruction: ko,
    text: en,
    answer: z.number().int().min(1).max(5),
    correction: en,
    rationales: z.array(ko).min(3).max(5),
    ko,
  })
  .strict()
  .refine(
    (v) => {
      const ns = [...v.text.matchAll(NUM_U_RE)].map((m) => Number(m[1]));
      return (
        ns.length === v.rationales.length &&
        ns.every((n, i) => n === i + 1) &&
        v.answer <= ns.length
      );
    },
    { message: "밑줄 번호가 ①부터 연속이어야 하고 rationales 수·answer 범위와 맞아야 합니다" },
  );

const transfer = z
  .object({
    ...base,
    type: z.literal("TRANSFER"),
    passage: en,
    instruction: ko,
    found: ko,
    gist: ko,
  })
  .strict()
  .refine((v) => [...v.passage.matchAll(SINGLE_U_RE)].length >= 1, {
    message: "지문에 목표 구조를 표시한 [[u:...]] 밑줄이 최소 1개 필요합니다",
  });

// ── v2 필기노트 패밀리 (§11.1) ──────────────────────────────────────────────

/** 이름·용어류 — 산문 규칙(합니다체) 비적용, 한 줄 문자열 */
const label = z.string().min(1).max(80);

const conceptIntro = z
  .object({
    ...base,
    type: z.literal("CONCEPT_INTRO"),
    term: label,
    question: ko,
    plain: ko.refine((s) => s.length <= 160, {
      message: "plain 은 전제 0 정의 — 160자 이내로 답부터 말하십시오",
    }),
    analogy: ko,
    whyItMatters: ko,
  })
  .strict();

const notebookEntry = z
  .object({
    head: label,
    body: ko.refine((s) => s.length <= 170, {
      message: "NOTEBOOK 항목 body 는 2문장·170자 이내 — 길면 항목을 쪼개십시오",
    }),
    example: example.optional(),
    pin: z.enum(["암기", "주의", "팁"]).optional(),
  })
  .strict();

const notebook = z
  .object({
    ...base,
    type: z.literal("NOTEBOOK"),
    intro: ko.optional(),
    entries: z.array(notebookEntry).min(3).max(8),
  })
  .strict();

const table = z
  .object({
    ...base,
    type: z.literal("TABLE"),
    columns: z.array(label).min(2).max(4),
    rows: z
      .array(
        z
          .object({
            cells: z.array(z.string().min(1).max(120)),
            example: example.optional(),
          })
          .strict(),
      )
      .min(2)
      .max(9),
    takeaway: ko.optional(),
  })
  .strict()
  .refine((v) => v.rows.every((r) => r.cells.length === v.columns.length), {
    message: "TABLE: 모든 행의 cells 수가 columns 수와 같아야 합니다",
  });

const mnemonic = z
  .object({
    ...base,
    type: z.literal("MNEMONIC"),
    target: label,
    why: ko,
    device: z.string().min(4).max(200),
    items: z
      .array(z.object({ cue: z.string().min(1).max(60), answer: z.string().min(1).max(120) }).strict())
      .min(2)
      .max(10),
  })
  .strict();

// ── v2 게임 패밀리 (§11.2) ──────────────────────────────────────────────────

const memoryGate = z
  .object({
    ...base,
    type: z.literal("MEMORY_GATE"),
    mission: ko,
    mode: z.enum(["SET", "ORDER"]),
    pool: z.array(z.string().min(1).max(40)).min(3).max(14),
    answers: z.array(z.string().min(1).max(40)).min(2).max(10),
    passText: ko,
    retryText: ko,
  })
  .strict()
  .refine((v) => v.answers.every((a) => v.pool.includes(a)), {
    message: "MEMORY_GATE: answers 가 전부 pool 에 있어야 합니다",
  })
  .refine((v) => new Set(v.pool).size === v.pool.length, {
    message: "MEMORY_GATE: pool 에 중복이 있습니다",
  })
  .refine((v) => v.mode === "ORDER" || v.pool.length > v.answers.length, {
    message: "MEMORY_GATE(SET): 미끼가 최소 1개 필요합니다(pool > answers)",
  });

const speedOx = z
  .object({
    ...base,
    type: z.literal("SPEED_OX"),
    instruction: ko,
    timeLimitSec: z.number().int().min(5).max(15),
    rounds: z
      .array(
        z
          .object({ statement: z.string().min(2).max(140), isTrue: z.boolean(), why: ko })
          .strict(),
      )
      .min(4)
      .max(8),
  })
  .strict()
  .refine((v) => v.rounds.some((r) => r.isTrue) && v.rounds.some((r) => !r.isTrue), {
    message: "SPEED_OX: ○와 × 라운드가 최소 1개씩 섞여야 합니다(전부 한쪽 금지)",
  });

const wordHunt = z
  .object({
    ...base,
    type: z.literal("WORD_HUNT"),
    instruction: ko,
    hitLabel: label,
    tokens: z
      .array(z.object({ t: z.string().min(1).max(30), hit: z.boolean() }).strict())
      .min(4)
      .max(25),
    ko,
    explain: ko,
  })
  .strict()
  .refine(
    (v) => {
      const hits = v.tokens.filter((t) => t.hit).length;
      return hits >= 1 && hits < v.tokens.length;
    },
    { message: "WORD_HUNT: hit 토큰이 1개 이상, 전체 미만이어야 합니다" },
  );

const pairMatch = z
  .object({
    ...base,
    type: z.literal("PAIR_MATCH"),
    instruction: ko,
    pairs: z
      .array(
        z
          .object({
            a: z.string().min(1).max(60),
            b: z.string().min(1).max(90),
            why: ko.optional(),
          })
          .strict(),
      )
      .min(3)
      .max(6),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.pairs.map((p) => p.a)).size === v.pairs.length &&
      new Set(v.pairs.map((p) => p.b)).size === v.pairs.length,
    { message: "PAIR_MATCH: a·b 항목은 각각 서로 달라야 합니다(중복 매칭 모호성)" },
  );

const oddOneOut = z
  .object({
    ...base,
    type: z.literal("ODD_ONE_OUT"),
    instruction: ko,
    rounds: z
      .array(
        z
          .object({
            words: z.array(z.string().min(1).max(40)).min(3).max(5),
            odd: z.number().int().min(0),
            why: ko,
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict()
  .refine(
    (v) =>
      v.rounds.every(
        (r) => r.odd < r.words.length && new Set(r.words).size === r.words.length,
      ),
    { message: "ODD_ONE_OUT: odd 범위 초과 또는 words 중복" },
  );

const boss = z
  .object({
    ...base,
    type: z.literal("BOSS"),
    bossName: z.string().min(2).max(40),
    intro: ko,
    questions: z
      .array(
        z
          .object({
            prompt: z.string().min(2).max(200),
            options: z.array(z.string().min(1).max(80)).min(2).max(4),
            answer: z.number().int().min(0),
            why: ko,
          })
          .strict(),
      )
      .min(3)
      .max(5),
    winText: ko,
    loseText: ko,
  })
  .strict()
  .refine(
    (v) =>
      v.questions.every(
        (q) =>
          q.answer < q.options.length &&
          new Set(q.options.map((o) => o.trim().toLowerCase())).size === q.options.length,
      ),
    { message: "BOSS: answer 범위 초과 또는 options 중복(정답 유일성 위반)" },
  );

export const blockSchema = z.union([
  hook,
  misconception,
  rule,
  diagram,
  algorithm,
  worked,
  completion,
  check,
  contrast,
  sort,
  trap,
  exam,
  selfExplain,
  note,
  summary,
  recap,
  generate,
  errorHunt,
  transfer,
  conceptIntro,
  notebook,
  table,
  mnemonic,
  memoryGate,
  speedOx,
  wordHunt,
  pairMatch,
  oddOneOut,
  boss,
]);

// ── 레슨 ────────────────────────────────────────────────────────────────────

const gradeSchema = z.enum([
  "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3",
]);

export const lessonSchema = z
  .object({
    id: z.string().regex(/^[ub](0[1-9]|1[0-2])-c[1-5]$/),
    unitId: z.string().regex(/^[ub](0[1-9]|1[0-2])$/),
    order: z.number().int().min(1).max(5),
    title: ko,
    oneLiner: ko,
    gradeStamp: z
      .object({
        introduced: gradeSchema,
        judged: gradeSchema.nullable(),
        csatPoints: z.array(z.string().regex(/^TP\d{2}$/)),
        sourceRefs: z.array(z.string().min(2)).min(1),
      })
      .strict(),
    lenses: z.array(z.enum(["L1", "L2", "L3", "L4", "L5"])),
    confusableWith: z.array(z.string()),
    estimatedMinutes: z.number().int().min(5).max(40),
    blocks: z.array(blockSchema).min(MIN_BLOCKS_PER_LESSON),
  })
  .strict()
  .superRefine((lesson, ctx) => {
    const types = lesson.blocks.map((b) => b.type);
    for (const req of REQUIRED_BLOCK_TYPES) {
      if (!types.includes(req)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `필수 블록 누락: ${req}`,
        });
      }
    }
    for (const [type, min] of Object.entries(MIN_BLOCK_COUNT)) {
      const got = types.filter((t) => t === type).length;
      if (got < (min as number)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${type} 블록이 ${got}개입니다(최소 ${min}개)`,
        });
      }
    }
    // 블록 id 유일성
    const ids = lesson.blocks.map((b) => b.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "블록 id 중복" });
    }
    // RECAP 은 마지막 블록이어야 한다(레슨 종결)
    if (types[types.length - 1] !== "RECAP") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RECAP 블록이 레슨의 마지막이어야 합니다",
      });
    }
    // HOOK 은 첫 블록
    if (types[0] !== "HOOK") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "HOOK 블록이 레슨의 첫 블록이어야 합니다",
      });
    }
    // 문항 id 는 conceptId 프리픽스를 따른다 + 레슨 내 유일
    const itemIds: string[] = [];
    for (const b of lesson.blocks) {
      if (b.type === "CHECK" || b.type === "RECAP") {
        for (const it of b.items as { id: string }[]) {
          itemIds.push(it.id);
          if (!it.id.startsWith(`${lesson.id}-ls-`)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `문항 id 규약 위반: ${it.id} (${lesson.id}-ls-NNN 이어야 합니다)`,
            });
          }
        }
      }
    }
    if (new Set(itemIds).size !== itemIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "레슨 내 문항 id 중복" });
    }
    // tier 1 에서 MISCONCEPTION 금지(문헌: 중등 이상 적합)
    for (const b of lesson.blocks) {
      if (b.tier === 1 && b.type === "MISCONCEPTION") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tier 1(기초)에는 MISCONCEPTION 블록을 두지 않습니다",
        });
      }
    }
    // ── v2 게임 규범 (§11.3) ──
    const gameTypes = types.filter((t) =>
      (GAME_BLOCK_TYPES as string[]).includes(t),
    );
    if (gameTypes.length < MIN_GAME_BLOCKS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `게임 블록 ${gameTypes.length}개 (최소 ${MIN_GAME_BLOCKS}개 — §11.3)`,
      });
    }
    if (new Set(gameTypes).size < MIN_GAME_TYPES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `게임 블록 타입이 ${new Set(gameTypes).size}종 (최소 ${MIN_GAME_TYPES}종 — 같은 게임 반복 금지)`,
      });
    }
    if (types.filter((t) => t === "BOSS").length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BOSS 블록은 레슨당 정확히 1개입니다",
      });
    }
    // PART 0(b유닛)는 암기 관문 필수 — 기초는 외워야 도구가 된다
    if (lesson.unitId.startsWith("b") && !types.includes("MEMORY_GATE")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PART 0(b유닛) 레슨에는 MEMORY_GATE 블록이 최소 1개 필요합니다(§11.3)",
      });
    }
  });

export type LessonFile = z.infer<typeof lessonSchema>;
