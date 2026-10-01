/**
 * exam-forecast 번들(JSON) → DB 멱등 적재.
 *
 *   npx tsx scripts/exam-forecast/seed-pack.ts <bundle.json> [--dry] [--prune]
 *
 * bundle = {
 *   pack: { slug, schoolName, title, subtitle?, examMeta, analysis, rangeInfo, status },
 *   passages: [{ code, sourceGroup, sourceLabel, sortOrder, titleKo, titleEn?, text, sentences, footnotes, analysis, prediction }],
 *   questions: [{ code, passageCode, role, qtype, kind, difficulty, points, body, answer, explanation, rationale, transform, tags, sortOrder }],
 *   sets: [{ no, title, tier, description, items: [{ number, questionCode, points }], pdfPaths }]
 * }
 * 키: pack.slug · (packId, passage.code) · (packId, question.code) · (packId, set.no). --prune 은 번들에 없는 문항·세트를 지운다.
 * 테이블: prisma/migrations-manual/20261001_exam_forecast.sql
 */
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";

interface Bundle {
  pack: {
    slug: string;
    schoolName: string;
    title: string;
    subtitle?: string | null;
    examMeta?: unknown;
    analysis?: unknown;
    rangeInfo?: unknown;
    status?: string;
  };
  passages: Array<{
    code: string;
    sourceGroup: string;
    sourceLabel: string;
    sortOrder: number;
    titleKo: string;
    titleEn?: string | null;
    text: string;
    sentences?: unknown;
    footnotes?: unknown;
    analysis?: unknown;
    prediction?: unknown;
  }>;
  questions: Array<{
    code: string;
    passageCode: string;
    role: "reference" | "forecast";
    qtype: string;
    kind: "MC" | "ESSAY";
    difficulty: number;
    points: number | null;
    body: unknown;
    answer: string;
    explanation?: string;
    rationale?: string;
    transform?: unknown;
    tags?: unknown;
    sortOrder: number;
  }>;
  sets?: Array<{
    no: number;
    title: string;
    tier: string;
    description?: string;
    items: Array<{ number: number; questionCode: string; points: number }>;
    pdfPaths?: unknown;
  }>;
}

const j = (v: unknown, fallback: unknown) => (v === undefined ? fallback : v) as Prisma.InputJsonValue;

async function main() {
  const [, , path, ...flags] = process.argv;
  if (!path) throw new Error("usage: seed-pack.ts <bundle.json> [--dry] [--prune]");
  const dry = flags.includes("--dry");
  const prune = flags.includes("--prune");
  const b = JSON.parse(readFileSync(path, "utf8")) as Bundle;

  // 정합 검사 — 적재 전에 끊는다
  const pcodes = new Set(b.passages.map((p) => p.code));
  const qcodes = new Set<string>();
  const errors: string[] = [];
  for (const q of b.questions) {
    if (!pcodes.has(q.passageCode)) errors.push(`question ${q.code}: unknown passage ${q.passageCode}`);
    if (qcodes.has(q.code)) errors.push(`duplicate question code ${q.code}`);
    qcodes.add(q.code);
  }
  for (const s of b.sets ?? []) for (const it of s.items) if (!qcodes.has(it.questionCode)) errors.push(`set ${s.no} #${it.number}: unknown question ${it.questionCode}`);
  if (errors.length) {
    console.error(errors.slice(0, 40).join("\n"));
    throw new Error(`bundle invalid: ${errors.length} errors`);
  }
  console.log(`bundle ok — passages ${b.passages.length} · questions ${b.questions.length} · sets ${(b.sets ?? []).length}`);
  if (dry) return;

  const prisma = new PrismaClient();
  try {
    const pack = await prisma.examForecastPack.upsert({
      where: { slug: b.pack.slug },
      create: {
        slug: b.pack.slug,
        schoolName: b.pack.schoolName,
        title: b.pack.title,
        subtitle: b.pack.subtitle ?? null,
        examMeta: j(b.pack.examMeta, {}),
        analysis: j(b.pack.analysis, {}),
        rangeInfo: j(b.pack.rangeInfo, {}),
        status: b.pack.status ?? "draft",
      },
      update: {
        schoolName: b.pack.schoolName,
        title: b.pack.title,
        subtitle: b.pack.subtitle ?? null,
        examMeta: j(b.pack.examMeta, {}),
        analysis: j(b.pack.analysis, {}),
        rangeInfo: j(b.pack.rangeInfo, {}),
        status: b.pack.status ?? "draft",
      },
    });
    const pid = new Map<string, string>();
    for (const p of b.passages) {
      const data = {
        sourceGroup: p.sourceGroup,
        sourceLabel: p.sourceLabel,
        sortOrder: p.sortOrder,
        titleKo: p.titleKo,
        titleEn: p.titleEn ?? null,
        text: p.text,
        sentences: j(p.sentences, []),
        footnotes: j(p.footnotes, []),
        analysis: j(p.analysis, {}),
        prediction: j(p.prediction, {}),
      };
      const row = await prisma.examForecastPassage.upsert({
        where: { packId_code: { packId: pack.id, code: p.code } },
        create: { packId: pack.id, code: p.code, ...data },
        update: data,
      });
      pid.set(p.code, row.id);
    }
    const qid = new Map<string, string>();
    let n = 0;
    for (const q of b.questions) {
      const data = {
        passageId: pid.get(q.passageCode)!,
        role: q.role,
        qtype: q.qtype,
        kind: q.kind,
        difficulty: q.difficulty,
        points: q.points,
        body: j(q.body, {}),
        answer: q.answer,
        explanation: q.explanation ?? "",
        rationale: q.rationale ?? "",
        transform: j(q.transform, {}),
        tags: j(q.tags, []),
        sortOrder: q.sortOrder,
      };
      const row = await prisma.examForecastQuestion.upsert({
        where: { packId_code: { packId: pack.id, code: q.code } },
        create: { packId: pack.id, code: q.code, ...data },
        update: data,
      });
      qid.set(q.code, row.id);
      n += 1;
      if (n % 100 === 0) console.log(`  questions ${n}/${b.questions.length}`);
    }
    for (const s of b.sets ?? []) {
      const items = s.items.map((it) => ({ number: it.number, questionId: qid.get(it.questionCode)!, points: it.points }));
      const data = { title: s.title, tier: s.tier, description: s.description ?? "", items: j(items, []), pdfPaths: j(s.pdfPaths, {}) };
      await prisma.examForecastSet.upsert({
        where: { packId_no: { packId: pack.id, no: s.no } },
        create: { packId: pack.id, no: s.no, ...data },
        update: data,
      });
    }
    if (prune) {
      const dq = await prisma.examForecastQuestion.deleteMany({ where: { packId: pack.id, code: { notIn: Array.from(qcodes) } } });
      const ds = await prisma.examForecastSet.deleteMany({ where: { packId: pack.id, no: { notIn: (b.sets ?? []).map((s) => s.no) } } });
      const dp = await prisma.examForecastPassage.deleteMany({ where: { packId: pack.id, code: { notIn: Array.from(pcodes) } } });
      console.log(`pruned questions ${dq.count} · sets ${ds.count} · passages ${dp.count}`);
    }
    console.log(`seeded pack ${pack.slug} (${pack.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
