/**
 * 어법 드릴 — 블라인드 풀이 게이트 도구.
 *
 *   npx tsx scripts/grammar-drill-blind.ts gen [outDir]
 *     → 정답·해설·힌트를 제거한 "학생 시점" 블라인드 뷰를 유닛·뱅크별 JSON으로 출력.
 *       (기본 outDir: C:/tmp/gd-blind)
 *
 *   npx tsx scripts/grammar-drill-blind.ts compare <solutionsDir> [reportPath]
 *     → 풀이 에이전트 산출(JSON: {answers:[{id,answer,flag?}]})을 실제 정답과
 *       대조해 불일치·플래그 리포트를 출력. (기본 report: <solutionsDir>/mismatches.json)
 *
 * 답 표기 규약(SubmitBody.answer 와 동일):
 *   CHOICE=옵션 인덱스("0"/"1"/"2") · OX="O"|"X" · MULTI_UNDERLINE/PASSAGE=밑줄 번호("1"~"5")
 *   WRITE_FORM/WRITE_CORRECT=서술 텍스트
 */
import fs from "fs";
import path from "path";
import type { GrammarItem } from "@/lib/grammar-drill/types";
import { isWrittenAnswerAccepted } from "@/lib/grammar-drill/markup";
import { GRAMMAR_UNITS } from "@/lib/grammar-drill/curriculum";

const DATA_DIR = path.join(process.cwd(), "src", "data", "grammar-drill");

function readItems(rel: string): GrammarItem[] {
  const full = path.join(DATA_DIR, rel);
  if (!fs.existsSync(full)) return [];
  const parsed = JSON.parse(fs.readFileSync(full, "utf-8"));
  return (parsed.items ?? []) as GrammarItem[];
}

function blindView(item: GrammarItem): Record<string, unknown> {
  const base = { id: item.id, type: item.type };
  switch (item.type) {
    case "CHOICE":
      return { ...base, stem: item.stem, options: item.options };
    case "OX":
      return { ...base, sentence: item.sentence };
    case "MULTI_UNDERLINE":
      return { ...base, text: item.text, underlineCount: item.underlineCount };
    case "PASSAGE":
      return { ...base, directive: item.directive, text: item.text };
    case "WRITE_FORM":
      return { ...base, stem: item.stem, given: item.given };
    case "WRITE_CORRECT":
      return { ...base, sentence: item.sentence, wrong: item.wrong };
  }
}

function keyOf(item: GrammarItem): string {
  switch (item.type) {
    case "CHOICE":
      return String(item.answer);
    case "OX":
      return item.isCorrect ? "O" : "X";
    case "MULTI_UNDERLINE":
    case "PASSAGE":
      return String(item.answer);
    case "WRITE_FORM":
    case "WRITE_CORRECT":
      return item.acceptedAnswers[0];
  }
}

function allBankFiles(): { rel: string; name: string }[] {
  const files: { rel: string; name: string }[] = [];
  for (const u of GRAMMAR_UNITS) {
    for (const bank of ["choice", "support", "reading"] as const) {
      files.push({ rel: `items/${u.id}-${bank}.json`, name: `${u.id}-${bank}` });
    }
  }
  for (const setId of ["set1", "set2", "final"] as const) {
    files.push({ rel: `mixed/${setId}.json`, name: `mixed-${setId}` });
  }
  return files;
}

const mode = process.argv[2];

if (mode === "gen") {
  const outDir = process.argv[3] ?? "C:/tmp/gd-blind";
  fs.mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const f of allBankFiles()) {
    const items = readItems(f.rel);
    if (items.length === 0) continue;
    fs.writeFileSync(
      path.join(outDir, `${f.name}.json`),
      JSON.stringify({ bank: f.name, items: items.map(blindView) }, null, 1),
      "utf-8",
    );
    total += items.length;
  }
  console.log(`블라인드 뷰 생성 완료 → ${outDir} (${total}문항)`);
} else if (mode === "compare") {
  const solDir = process.argv[3];
  if (!solDir || !fs.existsSync(solDir)) {
    console.error("solutionsDir 이 필요합니다.");
    process.exit(1);
  }
  const reportPath = process.argv[4] ?? path.join(solDir, "mismatches.json");

  // 실제 정답 인덱스
  const itemById = new Map<string, GrammarItem>();
  for (const f of allBankFiles()) {
    for (const item of readItems(f.rel)) itemById.set(item.id, item);
  }

  interface SolvedAnswer {
    id: string;
    answer: string;
    flag?: string;
  }
  const solved: SolvedAnswer[] = [];
  for (const file of fs.readdirSync(solDir)) {
    if (!file.endsWith(".json") || file === "mismatches.json") continue;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(solDir, file), "utf-8"),
      );
      for (const a of parsed.answers ?? []) {
        if (a && typeof a.id === "string") solved.push(a);
      }
    } catch (e) {
      console.error(`풀이 파일 파싱 실패: ${file} — ${(e as Error).message}`);
    }
  }

  const mismatches: {
    id: string;
    type: string;
    solverAnswer: string;
    actualKey: string;
    flag?: string;
  }[] = [];
  const flags: { id: string; flag: string }[] = [];
  let matched = 0;
  let missing = 0;

  const seen = new Set<string>();
  for (const s of solved) {
    const item = itemById.get(s.id);
    if (!item) continue;
    seen.add(s.id);
    let ok: boolean;
    if (item.type === "WRITE_FORM" || item.type === "WRITE_CORRECT") {
      ok = isWrittenAnswerAccepted(String(s.answer), item.acceptedAnswers);
    } else {
      ok = String(s.answer).trim() === keyOf(item);
    }
    if (ok) matched++;
    else {
      mismatches.push({
        id: s.id,
        type: item.type,
        solverAnswer: String(s.answer),
        actualKey: keyOf(item),
        flag: s.flag,
      });
    }
    if (s.flag) flags.push({ id: s.id, flag: s.flag });
  }
  for (const id of itemById.keys()) {
    if (!seen.has(id)) missing++;
  }

  fs.writeFileSync(
    reportPath,
    JSON.stringify({ matched, mismatchCount: mismatches.length, missing, mismatches, flags }, null, 1),
    "utf-8",
  );
  console.log(
    `대조 완료 — 일치 ${matched} · 불일치 ${mismatches.length} · 미풀이 ${missing} · 플래그 ${flags.length}`,
  );
  console.log(`리포트: ${reportPath}`);
  if (mismatches.length > 0) process.exitCode = 2;
} else {
  console.error("사용법: gen [outDir] | compare <solutionsDir> [reportPath]");
  process.exit(1);
}
