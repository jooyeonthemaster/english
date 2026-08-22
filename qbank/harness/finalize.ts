// ============================================================================
// 확정 단계 — 검수를 통과한 유닛을 최종 문항(.final.jsonl)으로 굳힌다.
// 결정론(LLM 미사용, 0원). 여기서 전 메타데이터가 문항에 박힌다.
//
// 실행:
//   tsx qbank/harness/finalize.ts --passage <id> --type <SUBTYPE>
//   tsx qbank/harness/finalize.ts --passage <id>          (전 유형 + 충돌 분석)
//   tsx qbank/harness/finalize.ts --all
//   ... --force   (검수 미완이어도 확정 — 파일럿 전용, 기본은 거부)
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { gateUnit, splitItems, type UnitGateResult } from "./qgen-core";
import { analyzePassage, TYPE_SURFACE, type QuestionRef } from "./collision";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "qbank", "out");
const CORPUS = path.join(ROOT, "src", "data", "exam-passages", "passages.json");
const PLAN = path.join(ROOT, "qbank", "spec", "unit-plan.json");
const HARNESS_VERSION = "qbank-harness/1.0";

const argv = process.argv.slice(2);
const arg = (n: string) => {
  const i = argv.indexOf("--" + n);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (n: string) => argv.includes("--" + n);

type Passage = {
  id: string;
  examId: string;
  year: number;
  exam: string;
  board: string;
  grade: string;
  type: string;
  typeGroup: string;
  answer: number;
  wordCount: number;
  reconstructionKind: string;
  confidence: string;
  text: string;
};

const passages: Passage[] = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const byId = new Map(passages.map((p) => [p.id, p]));
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")) as {
  units: { passageId: string; subType: string; variants: number; tier: string; category: string }[];
};
const planByKey = new Map(plan.units.map((u) => [u.passageId + " " + u.subType, u]));

const readJson = <T,>(p: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
};

// ── 감춰진 자산 추출 — 충돌 판정의 입력 ────────────────────────────────────
/**
 * 각 유형이 "학생에게 감춘 것"의 축자 문자열을 structuredData 에서 뽑는다.
 * 키 이름이 유형마다 달라 방어적으로 여러 후보를 훑는다 — 못 찾으면 빈 배열이 아니라
 * `unresolved` 로 표시해 조용한 실패를 막는다(가짜 safe 판정 방지).
 */
function extractHiddenSpans(
  subType: string,
  sd: Record<string, unknown>,
): { spans: string[]; resolved: boolean } {
  const surface = TYPE_SURFACE[subType];
  if (!surface || surface.hides === "NOTHING") return { spans: [], resolved: true };

  const pick = (...keys: string[]): string[] => {
    const out: string[] = [];
    for (const k of keys) {
      const v = sd[k];
      if (typeof v === "string" && v.trim()) out.push(v.trim());
      else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x.trim()) out.push(x.trim());
    }
    return out;
  };

  switch (surface.hides) {
    case "ORIGINAL_EXPRESSION": {
      const direct = pick("originalExpression", "blankExpression", "answerExpression");
      if (direct.length) return { spans: direct, resolved: true };
      // 다중 빈칸
      const blanks = sd.blanks;
      if (Array.isArray(blanks)) {
        const s = (blanks as Record<string, unknown>[])
          .map((b) => String(b.expression ?? b.original ?? ""))
          .filter(Boolean);
        if (s.length) return { spans: s, resolved: true };
      }
      return { spans: [], resolved: false };
    }
    case "CORRECT_FORM": {
      const fixes = sd.fixes;
      if (fixes && typeof fixes === "object" && Object.keys(fixes).length) {
        return { spans: Object.values(fixes as Record<string, string>).map(String), resolved: true };
      }
      const marks = sd.grammarMarks ?? sd.marks;
      if (Array.isArray(marks)) {
        const s = (marks as Record<string, unknown>[])
          .map((m) => String(m.original ?? ""))
          .filter(Boolean);
        if (s.length) return { spans: s, resolved: true };
      }
      const d = pick("correctFix", "fix");
      return { spans: d, resolved: d.length > 0 };
    }
    case "ORIGINAL_WORD": {
      const marks = sd.vocabMarks ?? sd.marks;
      if (Array.isArray(marks)) {
        const s = (marks as Record<string, unknown>[])
          .map((m) => String(m.original ?? m.shown ?? ""))
          .filter(Boolean);
        if (s.length) return { spans: s, resolved: true };
      }
      const d = pick("originalWord", "replacedWord", "originalExpression");
      return { spans: d, resolved: d.length > 0 };
    }
    case "ORIGINAL_ORDER": {
      const d = pick("correctOrder", "originalOrder", "correctAnswer");
      return { spans: d, resolved: d.length > 0 };
    }
    case "ORIGINAL_POSITION": {
      const d = pick("givenSentence", "insertSentence", "correctAnswer");
      return { spans: d, resolved: d.length > 0 };
    }
    case "ADDED_SENTENCE": {
      const d = pick("irrelevantSentence", "addedSentence", "correctAnswer");
      return { spans: d, resolved: d.length > 0 };
    }
    default:
      return { spans: [], resolved: true };
  }
}

/** 해설이 인용한 영어 문장 — 따옴표 안의 라틴 문자열만 */
function extractQuotes(text: string): string[] {
  const out: string[] = [];
  const re = /["“]([^"”]{12,300})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[1].trim();
    if (/[a-zA-Z]/.test(s) && !/[가-힣]/.test(s)) out.push(s);
  }
  return out;
}

// ── 유닛 확정 ─────────────────────────────────────────────────────────────
export interface FinalQuestion {
  qid: string;
  passage: Record<string, unknown>;
  type: Record<string, unknown>;
  difficulty: string;
  tier: string;
  point: string;
  craft: string;
  settings: Record<string, unknown>;
  markdown: string;
  structuredData: Record<string, unknown>;
  hidden: { asset: string; surface: string; spans: string[]; resolved: boolean };
  quotes: string[];
  gate: { warnings: number; corrections: number };
  review: Record<string, unknown> | null;
  provenance: Record<string, unknown>;
}

function finalizeUnit(passageId: string, subType: string): { ok: boolean; reason?: string; questions: FinalQuestion[] } {
  const p = byId.get(passageId);
  if (!p) return { ok: false, reason: `지문 없음: ${passageId}`, questions: [] };
  const dir = path.join(OUT, String(p.year), passageId);
  const mdPath = path.join(dir, subType + ".md");
  if (!fs.existsSync(mdPath)) return { ok: false, reason: ".md 없음", questions: [] };

  const source = fs.readFileSync(mdPath, "utf8");
  const planned = planByKey.get(passageId + " " + subType);

  // 게이트를 **다시 돌린다** — .gate.json 이 스테일일 수 있다(수리 후 미갱신).
  const gate: UnitGateResult = gateUnit({
    subType,
    passageId,
    passage: p.text,
    source,
    minItems: planned?.variants ?? 5,
  });
  if (!gate.ok) {
    return {
      ok: false,
      reason: `게이트 미통과 — 형식 ${gate.blocking.length} / 품질 ${gate.qualityBlocking.length}`,
      questions: [],
    };
  }
  fs.writeFileSync(path.join(dir, subType + ".gate.json"), JSON.stringify(gate, null, 1), "utf8");

  const review = readJson<Record<string, unknown>>(path.join(dir, subType + ".review.json"));
  if (!review && !has("force")) {
    return { ok: false, reason: "검수 미완(.review.json 없음). --force 로 강제 가능(파일럿 전용)", questions: [] };
  }
  const findings = ((review?.findings as Record<string, unknown>[]) || []).filter(
    (f) => (f.severity === "critical" || f.severity === "major") && f.outcome !== "fixed" && f.outcome !== "no_change_needed",
  );
  if (findings.length && !has("force")) {
    return { ok: false, reason: `미해결 critical/major ${findings.length}건`, questions: [] };
  }

  const { items } = splitItems(source);
  const blindByItem = new Map(
    ((review?.blindSolve as Record<string, unknown>[]) || []).map((b) => [Number(b.item), b]),
  );
  const decoyByItem = new Map(
    ((review?.decoyScores as Record<string, unknown>[]) || []).map((d) => [Number(d.item), d]),
  );
  const findingsByItem = new Map<number, Record<string, unknown>[]>();
  for (const f of ((review?.findings as Record<string, unknown>[]) || [])) {
    const i = Number(f.item ?? 0);
    if (!findingsByItem.has(i)) findingsByItem.set(i, []);
    findingsByItem.get(i)!.push(f);
  }

  const stat = fs.statSync(mdPath);
  const questions: FinalQuestion[] = [];

  for (const g of gate.items) {
    const item = items.find((it) => it.meta.index === g.index);
    const sd = (g.structuredData || {}) as Record<string, unknown>;
    const hidden = extractHiddenSpans(subType, sd);
    const surface = TYPE_SURFACE[subType];
    const explanationText = [sd.explanation, sd.explanationKo, ...(Array.isArray(sd.wrongOptionExplanations) ? sd.wrongOptionExplanations.map((w: Record<string, unknown>) => w.text) : Object.values((sd.wrongOptionExplanations as Record<string, string>) || {}))]
      .filter((x) => typeof x === "string")
      .join("\n");

    questions.push({
      qid: `${passageId}:${subType}:${g.index}`,
      passage: {
        id: p.id,
        examId: p.examId,
        year: p.year,
        exam: p.exam,
        board: p.board,
        grade: p.grade,
        typeGroup: p.typeGroup,
        originalType: p.type,
        originalAnswer: p.answer,
        wordCount: p.wordCount,
        reconstructionKind: p.reconstructionKind,
        corpusConfidence: p.confidence,
      },
      type: {
        subType,
        category: planned?.category ?? null,
        passageMutating: surface ? !surface.revealsOriginalText : null,
        passageSurface: surface?.surface ?? null,
      },
      difficulty: g.meta.difficulty,
      tier: planned?.tier ?? "?",
      point: g.meta.point,
      craft: g.meta.craft,
      settings: g.meta.settings,
      markdown: item?.markdown ?? "",
      structuredData: sd,
      hidden: {
        asset: surface?.hides ?? "NOTHING",
        surface: surface?.surface ?? "UNKNOWN",
        spans: hidden.spans,
        resolved: hidden.resolved,
      },
      quotes: extractQuotes(explanationText),
      gate: {
        warnings: gate.warnings.filter((w) => w.item === g.index).length,
        corrections: g.corrections.length,
      },
      review: review
        ? {
            grade: review.grade ?? null,
            blindSolve: blindByItem.get(g.index) ?? null,
            decoy: decoyByItem.get(g.index) ?? null,
            findings: findingsByItem.get(g.index) ?? [],
          }
        : null,
      provenance: {
        authoredAt: stat.mtime.toISOString(),
        gatedAt: gate.gatedAt,
        finalizedAt: new Date().toISOString(),
        harnessVersion: HARNESS_VERSION,
        reviewed: Boolean(review),
        forced: has("force"),
      },
    });
  }

  fs.writeFileSync(
    path.join(dir, subType + ".final.jsonl"),
    questions.map((q) => JSON.stringify(q)).join("\n") + "\n",
    "utf8",
  );
  return { ok: true, questions };
}

// ── 지문 단위 충돌 분석 ───────────────────────────────────────────────────
function analyzeCollisionsFor(passageId: string) {
  const p = byId.get(passageId);
  if (!p) return null;
  const dir = path.join(OUT, String(p.year), passageId);
  if (!fs.existsSync(dir)) return null;

  const refs: QuestionRef[] = [];
  const meta: Record<string, { subType: string; item: number; point: string }> = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".final.jsonl")) continue;
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const q = JSON.parse(line) as FinalQuestion;
      const sd = q.structuredData;
      const opts = Array.isArray(sd.options) ? (sd.options as Record<string, unknown>[]) : [];
      const ansLabel = String(sd.correctAnswer ?? "");
      const answerText =
        opts.find((o) => String(o.label) === ansLabel)?.text ??
        sd.modelAnswer ??
        ansLabel;
      refs.push({
        qid: q.qid,
        subType: String((q.type as Record<string, unknown>).subType),
        itemIndex: Number(q.qid.split(":").pop()),
        hiddenSpans: q.hidden.spans,
        answerText: String(answerText ?? ""),
        // 학생에게 실제로 인쇄되는 선지 전체 — 정답↔상대선지 누출 판정의 입력
        optionTexts: opts.map((o) => String(o.text ?? "")).filter(Boolean),
        quotedSentences: q.quotes,
      });
      meta[q.qid] = { subType: String((q.type as Record<string, unknown>).subType), item: refs[refs.length - 1].itemIndex, point: q.point };
    }
  }
  if (!refs.length) return null;

  const analysis = analyzePassage(refs);
  const out = {
    passageId,
    year: p.year,
    analyzedAt: new Date().toISOString(),
    questionCount: refs.length,
    unresolvedHidden: refs.filter((r) => {
      const surface = TYPE_SURFACE[r.subType];
      return surface && surface.hides !== "NOTHING" && r.hiddenSpans.length === 0;
    }).map((r) => r.qid),
    stats: analysis.stats,
    /** 같은 시험지에 함께 낼 수 있는 묶음 — 시험지 회차 배분에 그대로 쓴다 */
    safeGroups: analysis.safeGroups,
    groupCount: analysis.safeGroups.length,
    pairs: analysis.pairs,
    meta,
  };
  fs.writeFileSync(path.join(dir, "_collisions.json"), JSON.stringify(out, null, 1), "utf8");
  return out;
}

// ── 실행 ──────────────────────────────────────────────────────────────────
const targets: { passageId: string; subType: string }[] = [];
const pid = arg("passage");
const st = arg("type");

if (has("all")) {
  for (const year of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) {
    const yd = path.join(OUT, year);
    if (!fs.statSync(yd).isDirectory()) continue;
    for (const id of fs.readdirSync(yd)) {
      const pd = path.join(yd, id);
      if (!fs.statSync(pd).isDirectory()) continue;
      for (const f of fs.readdirSync(pd)) {
        if (f.endsWith(".md") && !f.startsWith("_")) targets.push({ passageId: id, subType: f.slice(0, -3) });
      }
    }
  }
} else if (pid && st) {
  targets.push({ passageId: pid, subType: st });
} else if (pid) {
  const p = byId.get(pid);
  const dir = p ? path.join(OUT, String(p.year), pid) : null;
  if (dir && fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".md") && !f.startsWith("_")) targets.push({ passageId: pid, subType: f.slice(0, -3) });
    }
  }
} else {
  console.error("사용법: finalize.ts --passage <id> [--type <SUBTYPE>] | --all  [--force]");
  process.exit(2);
}

let okCount = 0;
let qCount = 0;
const failures: string[] = [];
for (const t of targets) {
  const r = finalizeUnit(t.passageId, t.subType);
  if (r.ok) {
    okCount += 1;
    qCount += r.questions.length;
    console.log(`OK    ${t.passageId} ${t.subType.padEnd(24)} 문항 ${r.questions.length}`);
  } else {
    failures.push(`${t.passageId} ${t.subType}: ${r.reason}`);
    console.log(`SKIP  ${t.passageId} ${t.subType.padEnd(24)} ${r.reason}`);
  }
}

const touchedPassages = [...new Set(targets.map((t) => t.passageId))];
for (const id of touchedPassages) {
  const c = analyzeCollisionsFor(id);
  if (!c) continue;
  console.log(
    `\n[충돌] ${id} · 문항 ${c.questionCount} · critical ${c.stats.critical} major ${c.stats.major} minor ${c.stats.minor} safe ${c.stats.safe}`,
  );
  console.log(`[충돌] 동시 출제 가능 그룹 ${c.groupCount}개:`);
  for (const g of c.safeGroups) {
    console.log("        " + g.map((q) => c.meta[q].subType + "#" + c.meta[q].item).join(" + "));
  }
  if (c.unresolvedHidden.length) {
    console.log(`[충돌] ⚠ 감춘 자산을 못 뽑은 문항 ${c.unresolvedHidden.length}건 — 충돌 판정이 불완전하다:`);
    for (const q of c.unresolvedHidden.slice(0, 10)) console.log("        " + q);
  }
}

console.log(`\n확정 ${okCount}/${targets.length} 유닛 · 문항 ${qCount}`);
if (failures.length) {
  console.log(`미확정 ${failures.length}:`);
  for (const f of failures.slice(0, 20)) console.log("  " + f);
}
