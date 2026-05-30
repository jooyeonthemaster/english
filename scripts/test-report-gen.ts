import { writeFileSync } from "node:fs";

import { generateAnalysisReport } from "../src/lib/passage-report/analysis-report/generate";
import { TEST_PASSAGES } from "./report-test-passages";

const CONCURRENCY = 4;
const OUT_DIR = "c:/tmp";

interface Row {
  id: string; type: string; ok: boolean; ms: number; error?: string;
  sections?: string; sm?: string; vocab?: number; grammar?: number; quiz?: number; answers?: number; sentences?: number;
}

async function runOne(p: (typeof TEST_PASSAGES)[number]): Promise<Row> {
  const t = Date.now();
  try {
    const r = await generateAnalysisReport({ passageContent: p.content, schoolType: p.schoolType, grade: p.grade, docNo: p.id });
    const ms = Date.now() - t;
    if (!r.ok) return { id: p.id, type: p.type, ok: false, ms, error: r.error.slice(0, 200) };
    writeFileSync(`${OUT_DIR}/gen-${p.id}.json`, JSON.stringify(r.report));
    const secs = r.report.sections;
    const sm = secs.find((s) => s.kind === "structure-map") as any;
    const vocab = secs.find((s) => s.kind === "vocabulary") as any;
    const grammar = secs.find((s) => s.kind === "grammar") as any;
    const quiz = secs.find((s) => s.kind === "self-check") as any;
    const passage = secs.find((s) => s.kind === "passage") as any;
    return {
      id: p.id, type: p.type, ok: true, ms,
      sections: secs.map((s) => s.kind).join(","),
      sm: sm ? `${sm.columns?.map((c: any) => `${c.titleEn}(${c.bullets?.length})`).join(" vs ")}` : "NONE",
      vocab: vocab?.rows?.length, grammar: grammar?.rows?.length,
      quiz: quiz?.questions?.length, answers: quiz?.answers?.length, sentences: passage?.sentences?.length,
    };
  } catch (e) {
    return { id: p.id, type: p.type, ok: false, ms: Date.now() - t, error: String(e).slice(0, 200) };
  }
}

async function pool() {
  const rows: Row[] = [];
  const queue = [...TEST_PASSAGES];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const p = queue.shift();
      if (!p) break;
      const row = await runOne(p);
      rows.push(row);
      console.log(`[${row.ok ? "OK" : "FAIL"}] ${row.id} ${row.ms}ms ${row.ok ? `sec=${row.sections?.split(",").length} sm=${row.sm} voc=${row.vocab} gr=${row.grammar} quiz=${row.quiz}/${row.answers} sent=${row.sentences}` : row.error}`);
    }
  });
  await Promise.all(workers);
  rows.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(`${OUT_DIR}/gen-summary.json`, JSON.stringify(rows, null, 2));
  const okCount = rows.filter((r) => r.ok).length;
  console.log(`\n=== ${okCount}/${rows.length} 성공 ===`);
}

pool();
