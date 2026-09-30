// ============================================================================
// export-parity / report — 불일치 행 집계·출력, 계기 음성테스트용 입력 비틀기(내보내기 쪽 입력만, 메모리 안).
// ============================================================================
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import type { InvariantKind, MismatchKind, PassageFacet } from "./compare";

export type AuditRow = {
  examId: string;
  academyId: string;
  settingsKind: string;
  format: "hwpx" | "docx";
  questionId: string;
  orderNum: number | null;
  subType: string | null;
  facet: string;
  kind: MismatchKind;
  web: unknown;
  export: unknown;
};

export type ExamError = { examId: string; format: string; message: string };

/** 웹 정본의 절대 불변 조건 위반(형식 무관 — 내보내기는 compareFacets 로 웹과 같음이 보장된다). */
export type InvariantRow = {
  examId: string;
  academyId: string;
  settingsKind: string;
  questionId: string;
  orderNum: number | null;
  subType: string | null;
  kind: InvariantKind;
  passage: PassageFacet;
};

/**
 * 게이트 판정(순수). 불일치·오류·불변 조건 위반이 없어도, 아무것도 재지 않았으면(시험지 0 · 형식 0 · 탐침 유실)
 * PASS 가 아니다 — 빈 감사의 초록불 금지(AB-R3).
 */
export function gateOf(input: {
  mismatchRows: number;
  errors: number;
  invariants: number;
  exams: number;
  formats: number;
  probeLost: number;
}): { gate: "PASS" | "FAIL"; reasons: string[] } {
  const reasons: string[] = [];
  if (input.exams === 0) reasons.push("감사한 시험지 0개");
  if (input.formats === 0) reasons.push("대조한 형식 0개");
  if (input.mismatchRows > 0) reasons.push(`웹↔내보내기 불일치 ${input.mismatchRows}행`);
  if (input.errors > 0) reasons.push(`오류 ${input.errors}건`);
  if (input.invariants > 0) reasons.push(`웹 정본 불변 조건 위반 ${input.invariants}건`);
  if (input.probeLost > 0) reasons.push(`탐침 유실(계측 사각지대) ${input.probeLost}문항`);
  return { gate: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

/** 계측이 실제로 본 것(형식별 합계) — 0 불일치가 「아무것도 못 봤다」가 아님을 보이는 증거. */
export type CoverageCounts = {
  heads: number;
  passagePre: number;
  passageInline: number;
  answerLines: number;
  meta: number;
  answerKey: number;
};
export type Coverage = Record<string, CoverageCounts>;

export function addCoverage(coverage: Coverage, key: string, add: CoverageCounts) {
  const c = (coverage[key] ??= { heads: 0, passagePre: 0, passageInline: 0, answerLines: 0, meta: 0, answerKey: 0 });
  for (const k of Object.keys(add) as Array<keyof CoverageCounts>) c[k] += add[k];
}

const CUSTOMER_EXAMS = ["cmumhqslf0001jo04kmhm3wk5", "cmucvrufq0003lf0464ppgkcl"];

type Loose = Record<string, unknown>;

/** 계기 음성테스트: 내보내기 입력만 비튼다(웹 입력·DB 불변). 알 수 없는 kind 는 예외. */
export function applyInjection(
  inject: string | undefined,
  settingsRaw: string | null,
  examQuestions: ExamQuestionData[],
): { settingsRaw: string | null; examQuestions: ExamQuestionData[] } {
  if (!inject) return { settingsRaw, examQuestions };
  const parse = (): Loose | null => {
    try {
      const v = settingsRaw ? JSON.parse(settingsRaw) : null;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : null;
    } catch {
      return null;
    }
  };
  const s = parse();
  const mapSaved = (fn: (entry: Loose) => Loose) => {
    if (!s) return;
    for (const key of ["items", "blocks"]) {
      const list = s[key];
      if (Array.isArray(list)) s[key] = list.map((e) => (e && typeof e === "object" ? fn(e as Loose) : e));
    }
  };
  const layout = () => {
    if (!s) return null;
    const l = (s.layout && typeof s.layout === "object" ? s.layout : {}) as Loose;
    s.layout = l;
    return l;
  };
  let eqs = examQuestions;
  switch (inject) {
    case "export-include-all":
      mapSaved((e) => (typeof e.questionId === "string" ? { ...e, includePassage: true } : e));
      break;
    case "export-meta-on": {
      const l = layout();
      if (l) l.showQuestionMeta = true;
      break;
    }
    case "export-answer-off": {
      const l = layout();
      if (l) l.showAnswerSpace = false;
      break;
    }
    case "export-answer-key": {
      const target = examQuestions[0]?.question.id;
      if (target) {
        eqs = examQuestions.map((eq) =>
          eq.question.id === target ? { ...eq, question: { ...eq.question, correctAnswer: "INJECTED" } } : eq,
        );
        mapSaved((e) => (e.questionId === target ? { ...e, correctAnswer: "INJECTED" } : e));
      }
      break;
    }
    default:
      throw new Error(`unknown --inject kind: ${inject}`);
  }
  return { settingsRaw: s ? JSON.stringify(s) : settingsRaw, examQuestions: eqs };
}

function inc(m: Record<string, number>, k: string, n = 1) {
  m[k] = (m[k] ?? 0) + n;
}

export function summarize(input: {
  rows: AuditRow[];
  errors: ExamError[];
  invariants: InvariantRow[];
  perExam: Array<{ examId: string; kind: string; questions: number; printCount: number; probeLost: number; missingPassage: number }>;
  exportCounts: Map<string, Record<string, number>>;
  formats: string[];
  inject: string | undefined;
  coverage: Coverage;
  pipeline: string;
  elapsedMs: number;
}) {
  const { rows, errors, perExam, exportCounts } = input;
  const kindOfExam = new Map(perExam.map((e) => [e.examId, e.kind]));
  const totals = {
    exams: perExam.length,
    questions: perExam.reduce((a, e) => a + e.questions, 0),
    probeLostQuestions: perExam.reduce((a, e) => a + e.probeLost, 0),
    missingSourcePassageQuestions: perExam.reduce((a, e) => a + e.missingPassage, 0),
    missingSourcePassageExams: perExam.filter((e) => e.missingPassage > 0).length,
    missingSourcePassageCustomerExams: perExam
      .filter((e) => e.missingPassage > 0 && CUSTOMER_EXAMS.includes(e.examId))
      .map((e) => `${e.examId}:${e.missingPassage}`),
    examsBySettingsKind: {} as Record<string, number>,
  };
  perExam.forEach((e) => inc(totals.examsBySettingsKind, e.kind));

  const byFormat: Record<string, unknown> = {};
  for (const format of input.formats) {
    const fr = rows.filter((r) => r.format === format);
    const qKey = (r: AuditRow) => `${r.examId}:${r.questionId}`;
    const byKind: Record<string, number> = {};
    const byFacetQuestions: Record<string, Set<string>> = {};
    const bySettings: Record<string, { rows: number; questions: Set<string>; exams: Set<string> }> = {};
    const bySubType: Record<string, Record<string, number>> = {};
    for (const r of fr) {
      inc(byKind, r.kind);
      (byFacetQuestions[r.facet] ??= new Set()).add(qKey(r));
      const s = (bySettings[r.settingsKind] ??= { rows: 0, questions: new Set(), exams: new Set() });
      s.rows += 1;
      s.questions.add(qKey(r));
      s.exams.add(r.examId);
      inc((bySubType[r.kind] ??= {}), r.subType ?? "null");
    }
    const exams = new Set(fr.map((r) => r.examId));
    const exported = [...exams].filter((id) => (exportCounts.get(id)?.[format] ?? 0) > 0);
    byFormat[format] = {
      mismatchRows: fr.length,
      questionsAffected: new Set(fr.map(qKey)).size,
      examsAffected: exams.size,
      examsAffectedAlreadyExported: exported.length,
      exportsOfAffectedExams: exported.reduce((a, id) => a + (exportCounts.get(id)?.[format] ?? 0), 0),
      byKind,
      questionsByFacet: Object.fromEntries(Object.entries(byFacetQuestions).map(([k, v]) => [k, v.size])),
      bySettingsKind: Object.fromEntries(
        Object.entries(bySettings).map(([k, v]) => [k, { rows: v.rows, questions: v.questions.size, exams: v.exams.size }]),
      ),
      bySubTypeTop: Object.fromEntries(
        Object.entries(bySubType).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 12))]),
      ),
      customerExams: Object.fromEntries(
        CUSTOMER_EXAMS.map((id) => {
          const cr = fr.filter((r) => r.examId === id);
          const k: Record<string, number> = {};
          cr.forEach((r) => inc(k, r.kind));
          return [id, { settingsKind: kindOfExam.get(id) ?? "(not audited)", rows: cr.length, byKind: k }];
        }),
      ),
      errors: errors.filter((e) => e.format === format).length,
    };
  }
  const inv = input.invariants;
  const invByKind: Record<string, number> = {};
  const invBySubType: Record<string, number> = {};
  inv.forEach((r) => {
    inc(invByKind, r.kind);
    inc(invBySubType, r.subType ?? "null");
  });
  const gate = gateOf({
    mismatchRows: rows.length,
    errors: errors.length,
    invariants: inv.length,
    exams: perExam.length,
    formats: input.formats.length,
    probeLost: totals.probeLostQuestions,
  });
  return {
    generatedAt: new Date().toISOString(),
    inject: input.inject ?? null,
    pipeline: input.pipeline,
    elapsedMs: input.elapsedMs,
    gate: gate.gate,
    gateReasons: gate.reasons,
    totals,
    invariants: {
      total: inv.length,
      questions: new Set(inv.map((r) => `${r.examId}:${r.questionId}`)).size,
      exams: new Set(inv.map((r) => r.examId)).size,
      byKind: invByKind,
      bySubType: invBySubType,
      rows: inv.slice(0, 50),
    },
    coverage: input.coverage,
    errorsTotal: errors.length,
    webErrors: errors.filter((e) => e.format === "web").length,
    byFormat,
  };
}

export function printSummary(summary: ReturnType<typeof summarize>, rows: AuditRow[], samples: number) {
  const injectNote = summary.inject ? `(inject=${summary.inject}) ` : "";
  console.log(`\n=== export-parity-audit [${summary.pipeline}] ${injectNote}— gate ${summary.gate}`);
  if (summary.gateReasons.length) console.log(`gate reasons: ${summary.gateReasons.join(" · ")}`);
  console.log(`exams ${summary.totals.exams} · questions ${summary.totals.questions} · kinds ${JSON.stringify(summary.totals.examsBySettingsKind)}`);
  console.log(`probe-lost(web passage box without sentinel) ${summary.totals.probeLostQuestions} · errors ${summary.errorsTotal}`);
  const t = summary.totals;
  console.log(
    `missing source passage(web 「원문 지문 없음」) ${t.missingSourcePassageQuestions} questions · ${t.missingSourcePassageExams} exams · customer ${JSON.stringify(t.missingSourcePassageCustomerExams)}`,
  );
  for (const [k, c] of Object.entries(summary.coverage)) console.log(`  seen[${k}] ${JSON.stringify(c)}`);
  const inv = summary.invariants;
  console.log(`\n[web invariants] ${inv.total} (questions ${inv.questions} · exams ${inv.exams}) byKind ${JSON.stringify(inv.byKind)} bySubType ${JSON.stringify(inv.bySubType)}`);
  for (const r of inv.rows.slice(0, Math.max(0, samples))) {
    console.log(`  ${r.kind} exam=${r.examId} (${r.settingsKind}) q#${r.orderNum} ${r.subType} ${r.questionId} passage=${JSON.stringify(r.passage)}`);
  }
  for (const [format, f] of Object.entries(summary.byFormat)) {
    const s = f as Record<string, unknown>;
    console.log(`\n[${format}] rows ${s.mismatchRows} · questions ${s.questionsAffected} · exams ${s.examsAffected} (already exported ${s.examsAffectedAlreadyExported}, ${s.exportsOfAffectedExams} exports) · errors ${s.errors}`);
    console.log(`  byKind ${JSON.stringify(s.byKind)}`);
    console.log(`  questionsByFacet ${JSON.stringify(s.questionsByFacet)}`);
    console.log(`  bySettingsKind ${JSON.stringify(s.bySettingsKind)}`);
    console.log(`  customer ${JSON.stringify(s.customerExams)}`);
  }
  const shown = new Set<string>();
  const sample = rows.filter((r) => {
    const k = `${r.format}:${r.kind}`;
    if (shown.has(k)) return false;
    shown.add(k);
    return true;
  });
  if (samples > 0 && sample.length) {
    console.log(`\nsamples (first per format×kind):`);
    for (const r of sample.slice(0, samples)) {
      console.log(`  ${r.format} ${r.kind} exam=${r.examId} q#${r.orderNum} ${r.subType} web=${JSON.stringify(r.web)} export=${JSON.stringify(r.export)}`);
    }
  }
}
