// ============================================================================
// export-parity-audit — 웹 정본 vs HWPX·DOCX 내보내기 「무엇을 찍는지」 문항별 전수 대조 (읽기 전용)
//
// 저장소 루트에서:
//   npx tsx --env-file-if-exists=.env scripts/exam-pagination/export-parity-audit.ts [옵션]
//     --academy <id>        한 학원만
//     --exam <id,id>        지정 시험지만
//     --limit <n>           앞에서 n개(생성순)
//     --formats hwpx,docx   대조할 형식(기본 둘 다). 모르는 이름·빈 목록은 종료코드 2(빈 감사 금지)
//     --out <path>          결과 JSON(기본 tmp/export-parity-audit.json)
//     --samples <n>         콘솔에 찍을 불일치 표본 수(기본 12)
//     --inject <kind>       계기 음성테스트 — 내보내기 쪽 입력만 비틀어 빨간불을 확인한다(DB 무관, 메모리 안):
//                           export-include-all | export-meta-on | export-answer-off | export-answer-key
//     --pipeline <module>   다른 내보내기 구현(예: 수정 전 사본)을 같은 계기로 잰다. 모듈은 label·buildHwpx·buildDocx 를
//                           export 한다(export-parity/pipeline.ts 의 ExportPipeline). 이때 현행 라우트 앵커 검사는 건너뛴다.
//     --simulate-plan <json> 고아 지문 백필 계획을 메모리에서만 입힌 상태로 잰다(0·1단계 자동 재연결 + 승인된 검토 항목).
//                           --simulate-stage2(= --simulate-review)를 더하면 검토 대상 전부(재연결 검토 대기 + 2단계 후보).
//                           「원문 지문 없음」 문항 수(missing)도 함께 찍는다.
//
// 게이트(report.gateOf): 웹↔내보내기 불일치 0 · 오류 0 · 웹 정본 절대 불변 조건 위반 0(지문 두 번 · 실어야 할 지문 없음
// — 세 출력이 같이 틀리는 공용 판정 오류) · 시험지 ≥ 1 · 탐침 유실 0 이면 종료코드 0, 아니면 1.
// 라우트 접착부가 사본과 달라졌거나 --formats 가 잘못됐으면 2.
// 대조 면: 지문 방출(그룹 지문 pre / 문항 안 inline — 탐침 토큰으로 계측) · 답란 · [n점·유형] 배지 · 정답표 표기.
// 운영 DB 는 SELECT 만(load.ts 의 읽기 전용 가드). 파일(.hwpx/.docx)은 만들지 않는다 — IR·문서 객체만 계측한다.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import { compareFacets, facetsFromStream, answerKeyByQuestion, withAnswerKeys, FACET_OF_KIND, type Mismatch } from "./export-parity/compare";
import { injectPassageSentinels } from "./export-parity/probe";
import { buildWebModel, type WebModel } from "./export-parity/web-facets";
import { checkHwpxGlue, hwpxProbe } from "./export-parity/hwpx-adapter";
import { checkDocxGlue, docxProbe } from "./export-parity/docx-adapter";
import { CURRENT_PIPELINE, loadPipeline, type ExportPipeline } from "./export-parity/pipeline";
import { makeHeadMatcher, makeOrderConsumer, type ExportProbe } from "./export-parity/export-common";
import { createReadOnlyPrisma, listExamIds, loadExams, loadExportCounts, settingsKind, type LoadedExam } from "./export-parity/load";
import {
  applyInjection,
  summarize,
  printSummary,
  addCoverage,
  type AuditRow,
  type Coverage,
  type ExamError,
  type InvariantRow,
} from "./export-parity/report";
import { applyPlanSimulation, loadPlanSimulation, type PlanSimulation } from "./export-parity/simulate-plan";

type Format = "hwpx" | "docx";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function toRouteShape(eqs: LoadedExam["questions"]): ExamQuestionData[] {
  return eqs.map((eq) => ({
    orderNum: eq.orderNum,
    points: eq.points,
    question: {
      ...eq.question,
      passage: eq.question.passage ? { title: eq.question.passage.title, content: eq.question.passage.content } : null,
    },
  })) as unknown as ExamQuestionData[];
}

async function probeFormat(
  pipeline: ExportPipeline,
  format: Format,
  exam: LoadedExam,
  settingsRaw: string | null,
  eqs: ExamQuestionData[],
  ownerByToken: ReadonlyMap<string, string>,
): Promise<{ probe: ExportProbe; answerItems: Array<{ orderNum: number; questionId: string }> }> {
  if (format === "hwpx") {
    const built = await pipeline.buildHwpx(exam.title, settingsRaw, eqs);
    const heads = makeHeadMatcher(built.items);
    return { probe: hwpxProbe(built.doc, (n) => heads.take(n), ownerByToken), answerItems: built.answerItems ?? built.items };
  }
  const built = await pipeline.buildDocx(exam.title, settingsRaw, eqs);
  const heads = makeHeadMatcher(built.items);
  return {
    probe: docxProbe(built.doc, built.path, (n) => heads.take(n), ownerByToken),
    answerItems: built.answerItems ?? built.items,
  };
}

async function auditExam(
  pipeline: ExportPipeline,
  exam: LoadedExam,
  formats: Format[],
  inject: string | undefined,
  coverage: Coverage,
) {
  const rows: AuditRow[] = [];
  const errors: ExamError[] = [];
  const probe = injectPassageSentinels(exam.questions, exam.settings);
  let web: WebModel;
  try {
    web = buildWebModel(probe.examQuestions as never, probe.settingsRaw, probe.ownerByToken);
  } catch (e) {
    errors.push({ examId: exam.id, format: "web", message: (e as Error).message });
    return { rows, errors, invariants: [] as InvariantRow[], web: null };
  }
  const kind = settingsKind(exam.settings);
  const invariants: InvariantRow[] = web.invariants.map((v) => ({
    examId: exam.id,
    academyId: exam.academyId,
    settingsKind: kind,
    questionId: v.questionId,
    orderNum: web.facets.get(v.questionId)?.orderNum ?? null,
    subType: web.subTypeOf.get(v.questionId) ?? null,
    kind: v.kind,
    passage: v.passage,
  }));
  for (const f of web.facets.values()) {
    addCoverage(coverage, "web", {
      heads: 1,
      passagePre: f.passage.pre,
      passageInline: f.passage.inline,
      answerLines: f.answerSpace.lines ?? 0,
      meta: f.metaBadge ? 1 : 0,
      answerKey: f.answerKey !== null ? 1 : 0,
    });
  }
  for (const format of formats) {
    const injected = applyInjection(inject, probe.settingsRaw, toRouteShape(probe.examQuestions));
    try {
      const { probe: ep, answerItems } = await probeFormat(
        pipeline,
        format,
        exam,
        injected.settingsRaw,
        injected.examQuestions,
        probe.ownerByToken,
      );
      const stream = facetsFromStream(ep.events, {
        webGroupOf: (q) => web.groupOf.get(q),
        webExpect: (q) => web.facets.get(q)?.passage,
      });
      const answers = answerKeyByQuestion(ep.answerEntries, makeOrderConsumer(answerItems).byNum);
      const exp = withAnswerKeys(stream, answers);
      const mismatches: Mismatch[] = compareFacets(web.facets, exp, stream.strays);
      for (const f of exp.values()) {
        addCoverage(coverage, format, {
          heads: 1,
          passagePre: f.passage.pre,
          passageInline: f.passage.inline,
          answerLines: f.answerSpace.lines ?? (f.answerSpace.present ? 1 : 0),
          meta: f.metaBadge ? 1 : 0,
          answerKey: f.answerKey !== null ? 1 : 0,
        });
      }
      for (const m of mismatches) {
        rows.push({
          examId: exam.id,
          academyId: exam.academyId,
          settingsKind: kind,
          format,
          questionId: m.questionId,
          orderNum: web.facets.get(m.questionId)?.orderNum ?? null,
          subType: web.subTypeOf.get(m.questionId) ?? null,
          facet: FACET_OF_KIND[m.kind],
          kind: m.kind,
          web: m.web,
          export: m.export,
        });
      }
      if (stream.unmappedHeads.length) {
        errors.push({ examId: exam.id, format, message: `unmapped heads: ${stream.unmappedHeads.slice(0, 5).join(",")}` });
      }
      if (!ep.answerKeyFound && web.facets.size > 0) {
        errors.push({ examId: exam.id, format, message: "answer key section not found" });
      }
    } catch (e) {
      errors.push({ examId: exam.id, format, message: (e as Error).stack?.split("\n").slice(0, 3).join(" | ") ?? String(e) });
    }
  }
  return { rows, errors, invariants, web };
}

async function main() {
  const repoRoot = process.cwd();
  const formatTokens = (arg("formats") ?? "hwpx,docx").split(",").map((f) => f.trim()).filter(Boolean);
  const unknownFormats = formatTokens.filter((f) => f !== "hwpx" && f !== "docx");
  const formats = [...new Set(formatTokens)].filter((f): f is Format => f === "hwpx" || f === "docx");
  if (unknownFormats.length > 0 || formats.length === 0) {
    console.error(`[audit] --formats 가 잘못됐다(${unknownFormats.join(",") || "빈 목록"}) — hwpx,docx 중에서 고를 것.`);
    process.exitCode = 2;
    return;
  }
  const inject = arg("inject");
  const out = arg("out") ?? path.join(repoRoot, "tmp", "export-parity-audit.json");
  const samples = Number(arg("samples") ?? 12);

  const pipelineArg = arg("pipeline");
  const pipeline = pipelineArg ? await loadPipeline(path.resolve(repoRoot, pipelineArg)) : CURRENT_PIPELINE;
  const glue = pipelineArg ? [] : [checkHwpxGlue(repoRoot), checkDocxGlue(repoRoot)];
  if (pipelineArg) console.log(`[audit] pipeline = ${pipeline.label} (${pipelineArg}) — 현행 라우트 앵커 검사 생략`);
  for (const g of glue) {
    if (!g.ok) {
      console.error(`[glue] ${g.route}: 라우트가 ${g.entry} 를 감사와 같은 인자로 부르지 않는다 — 어댑터를 갱신할 것.`);
      g.missing.forEach((m) => console.error(`  missing: ${m.slice(0, 120)}`));
      process.exitCode = 2;
      return;
    }
  }

  const { client: db, disconnect } = createReadOnlyPrisma();
  try {
    const ids = await listExamIds(db, {
      academyId: arg("academy"),
      examIds: arg("exam")?.split(",").filter(Boolean),
      limit: arg("limit") ? Number(arg("limit")) : undefined,
    });
    const exportCounts = await loadExportCounts(db);
    const rows: AuditRow[] = [];
    const errors: ExamError[] = [];
    const invariants: InvariantRow[] = [];
    const perExam: Array<{ examId: string; kind: string; questions: number; printCount: number; probeLost: number; missingPassage: number }> = [];
    const planArg = arg("simulate-plan");
    let sim: PlanSimulation | null = null;
    if (planArg) {
      const all = process.argv.includes("--simulate-stage2") || process.argv.includes("--simulate-review");
      sim = await loadPlanSimulation(db, path.resolve(repoRoot, planArg), { includeUnapproved: all });
      console.log(
        `[audit] simulate-plan ${planArg}${all ? " (검토 대상 전부 승인 가정)" : ""}: 재연결 ${sim.counts.relinks}문항(그중 검토 항목 ${sim.counts.reviewedRelinks}) · 원문 보관 ${sim.counts.sourcePassages}문항(메모리 안, DB 무변경)`,
      );
    }
    const coverage: Coverage = {};
    const started = Date.now();
    for (let i = 0; i < ids.length; i += 20) {
      const exams = await loadExams(db, ids.slice(i, i + 20));
      for (const loaded of exams) {
        const exam = sim ? applyPlanSimulation(loaded, sim) : loaded;
        const r = await auditExam(pipeline, exam, formats, inject, coverage);
        rows.push(...r.rows);
        errors.push(...r.errors);
        invariants.push(...r.invariants);
        perExam.push({
          examId: exam.id,
          kind: settingsKind(exam.settings),
          questions: r.web?.facets.size ?? exam.questions.length,
          printCount: exam.printCount,
          probeLost: r.web?.probeLost.length ?? 0,
          missingPassage: r.web?.missingPassage.length ?? 0,
        });
      }
      process.stderr.write(`\r[audit] ${Math.min(i + 20, ids.length)}/${ids.length} exams`);
    }
    process.stderr.write("\n");
    const summary = summarize({
      rows,
      errors,
      invariants,
      perExam,
      exportCounts,
      formats,
      inject,
      coverage,
      pipeline: pipeline.label,
      elapsedMs: Date.now() - started,
    });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ summary, errors, rows }, null, 1));
    printSummary(summary, rows, samples);
    console.log(`\n[audit] JSON → ${out}`);
    process.exitCode = summary.gate === "PASS" ? 0 : 1;
  } finally {
    await disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
