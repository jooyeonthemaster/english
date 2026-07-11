/**
 * 어법 드릴 콘텐츠 번들 — 결정론 검증 게이트.
 *   npx tsx scripts/verify-grammar-drill-bundle.ts            # 전체
 *   npx tsx scripts/verify-grammar-drill-bundle.ts u03        # 특정 유닛만
 *
 * 검사 축:
 *  1. zod 스키마(구조·마크업·합니다체) — src/lib/grammar-drill/schema.ts
 *  2. ID 전역 유일성 + 파일↔ID 정합(unitId·bank·conceptId 소속)
 *  3. 개념 파일 ↔ 커리큘럼 백본 스켈레톤 정합(ID·순서)
 *  4. 유닛별 수량 계약: 개념당 CHOICE 12 / OX 8 / WRITE_FORM 6 / WRITE_CORRECT 4,
 *     유닛당 MULTI_UNDERLINE 12 / PASSAGE 8 (mixed: set1·set2 각 10, final 12)
 *  5. 영어 필드에 한글 혼입 금지
 *  6. 정답 분포 편향(경고): CHOICE 정답 인덱스 쏠림, PASSAGE 정답 번호 쏠림
 *
 * 정답의 '어법적 옳음' 자체는 블라인드 풀이 게이트(에이전트)가 별도 담당한다.
 */
import fs from "fs";
import path from "path";
import {
  conceptsFileSchema,
  itemsFileSchema,
  mixedSetFileSchema,
} from "@/lib/grammar-drill/schema";
import {
  GRAMMAR_CONCEPT_SKELETONS,
  GRAMMAR_UNITS,
} from "@/lib/grammar-drill/curriculum";

const DATA_DIR = path.join(process.cwd(), "src", "data", "grammar-drill");
const onlyUnit = process.argv[2] || null;

const errors: string[] = [];
const warnings: string[] = [];
let filesSeen = 0;
let itemCount = 0;
let conceptCount = 0;

function err(msg: string) {
  errors.push(msg);
}
function warn(msg: string) {
  warnings.push(msg);
}

function readJson(rel: string): unknown | null {
  const full = path.join(DATA_DIR, rel);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf-8"));
  } catch (e) {
    err(`${rel}: JSON 파싱 실패 — ${(e as Error).message}`);
    return null;
  }
}

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

function checkEnglishField(id: string, field: string, value: string) {
  if (HANGUL_RE.test(value)) {
    err(`${id}: 영어 필드 ${field}에 한글이 혼입되었습니다`);
  }
}

const globalIds = new Set<string>();

function registerId(rel: string, id: string) {
  if (globalIds.has(id)) err(`${rel}: 문항 ID 전역 중복 — ${id}`);
  globalIds.add(id);
}

const skeletonByUnit = new Map<string, typeof GRAMMAR_CONCEPT_SKELETONS>();
for (const s of GRAMMAR_CONCEPT_SKELETONS) {
  const arr = skeletonByUnit.get(s.unitId) ?? [];
  arr.push(s);
  skeletonByUnit.set(s.unitId, arr);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function englishFieldsOf(item: any): [string, string][] {
  const fields: [string, string][] = [];
  if (typeof item.stem === "string") fields.push(["stem", item.stem]);
  if (typeof item.sentence === "string") fields.push(["sentence", item.sentence]);
  if (typeof item.text === "string") fields.push(["text", item.text]);
  if (Array.isArray(item.options))
    item.options.forEach((o: string, i: number) => fields.push([`options[${i}]`, o]));
  if (Array.isArray(item.acceptedAnswers))
    item.acceptedAnswers.forEach((a: string, i: number) =>
      fields.push([`acceptedAnswers[${i}]`, a]),
    );
  if (typeof item.given === "string") fields.push(["given", item.given]);
  if (typeof item.wrong === "string") fields.push(["wrong", item.wrong]);
  if (typeof item.correction === "string") fields.push(["correction", item.correction]);
  return fields;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatZodError(rel: string, result: any) {
  for (const issue of result.error.issues.slice(0, 20)) {
    err(`${rel}: [${issue.path.join(".")}] ${issue.message}`);
  }
  if (result.error.issues.length > 20) {
    err(`${rel}: …외 ${result.error.issues.length - 20}건`);
  }
}

const units = GRAMMAR_UNITS.filter((u) => !onlyUnit || u.id === onlyUnit);

for (const unit of units) {
  // ── 개념 파일 ──
  const conceptsRaw = readJson(`concepts/${unit.id}.json`);
  if (conceptsRaw === null) {
    warn(`concepts/${unit.id}.json 없음(저작 미완)`);
  } else {
    filesSeen++;
    const parsed = conceptsFileSchema.safeParse(conceptsRaw);
    if (!parsed.success) {
      formatZodError(`concepts/${unit.id}.json`, parsed);
    } else {
      const skeletons = skeletonByUnit.get(unit.id) ?? [];
      const gotIds = parsed.data.concepts.map((c) => c.id).join(",");
      const wantIds = skeletons.map((s) => s.id).join(",");
      if (gotIds !== wantIds) {
        err(
          `concepts/${unit.id}.json: 개념 ID·순서가 백본과 다릅니다 (got ${gotIds} want ${wantIds})`,
        );
      }
      for (const c of parsed.data.concepts) {
        conceptCount++;
        if (c.unitId !== unit.id) err(`${c.id}: unitId 불일치(${c.unitId})`);
        for (const rule of c.rules)
          for (const ex of rule.examples) checkEnglishField(c.id, "rules.example.en", ex.en);
      }
    }
  }

  // ── 문항 뱅크 3종 ──
  const conceptIds = unit.conceptIds;
  const typeCountByConcept = new Map<string, Record<string, number>>();
  const unitTypeCount: Record<string, number> = {};
  const choiceAnswersByConcept = new Map<string, number[]>();
  const passageAnswers: number[] = [];

  for (const bank of ["choice", "support", "reading"] as const) {
    const rel = `items/${unit.id}-${bank}.json`;
    const raw = readJson(rel);
    if (raw === null) {
      warn(`${rel} 없음(저작 미완)`);
      continue;
    }
    filesSeen++;
    const parsed = itemsFileSchema.safeParse(raw);
    if (!parsed.success) {
      formatZodError(rel, parsed);
      continue;
    }
    if (parsed.data.unitId !== unit.id) err(`${rel}: unitId 필드 불일치`);
    if (parsed.data.bank !== bank) err(`${rel}: bank 필드 불일치`);

    const allowedTypes: Record<string, string[]> = {
      choice: ["CHOICE"],
      support: ["OX", "WRITE_FORM", "WRITE_CORRECT"],
      reading: ["MULTI_UNDERLINE", "PASSAGE"],
    };

    for (const item of parsed.data.items) {
      itemCount++;
      registerId(rel, item.id);
      if (item.unitId !== unit.id) err(`${item.id}: unitId 불일치`);
      if (!conceptIds.includes(item.conceptId))
        err(`${item.id}: conceptId(${item.conceptId})가 유닛 소속이 아닙니다`);
      if (!item.id.startsWith(`${unit.id}-`)) err(`${item.id}: ID가 unitId로 시작해야 합니다`);
      if (!allowedTypes[bank].includes(item.type))
        err(`${item.id}: ${bank} 뱅크에 ${item.type} 문항이 들어 있습니다`);
      for (const [f, v] of englishFieldsOf(item)) checkEnglishField(item.id, f, v);

      unitTypeCount[item.type] = (unitTypeCount[item.type] ?? 0) + 1;
      const tc = typeCountByConcept.get(item.conceptId) ?? {};
      tc[item.type] = (tc[item.type] ?? 0) + 1;
      typeCountByConcept.set(item.conceptId, tc);

      if (item.type === "CHOICE") {
        const arr = choiceAnswersByConcept.get(item.conceptId) ?? [];
        arr.push(item.answer);
        choiceAnswersByConcept.set(item.conceptId, arr);
      }
      if (item.type === "PASSAGE") passageAnswers.push(item.answer);
    }
  }

  // ── 수량 계약 ──
  const CONTRACT: Record<string, number> = {
    CHOICE: 12,
    OX: 8,
    WRITE_FORM: 6,
    WRITE_CORRECT: 4,
  };
  const hasAnyItems = Object.keys(unitTypeCount).length > 0;
  if (hasAnyItems) {
    for (const cid of conceptIds) {
      const tc = typeCountByConcept.get(cid) ?? {};
      for (const [type, want] of Object.entries(CONTRACT)) {
        const got = tc[type] ?? 0;
        if (got !== want && got !== 0)
          err(`${unit.id}/${cid}: ${type} ${got}개 (계약 ${want}개)`);
        if (got === 0) warn(`${unit.id}/${cid}: ${type} 미저작`);
      }
    }
    const mu = unitTypeCount["MULTI_UNDERLINE"] ?? 0;
    const ps = unitTypeCount["PASSAGE"] ?? 0;
    if (mu !== 12 && mu !== 0) err(`${unit.id}: MULTI_UNDERLINE ${mu}개 (계약 12개)`);
    if (ps !== 8 && ps !== 0) err(`${unit.id}: PASSAGE ${ps}개 (계약 8개)`);

    // 정답 분포 편향 — 경고
    for (const [cid, answers] of choiceAnswersByConcept) {
      const zero = answers.filter((a) => a === 0).length;
      if (answers.length >= 8 && (zero <= 2 || zero >= answers.length - 2))
        warn(`${unit.id}/${cid}: CHOICE 정답 인덱스 쏠림 (0번 정답 ${zero}/${answers.length})`);
    }
    if (passageAnswers.length >= 6) {
      const distinct = new Set(passageAnswers).size;
      if (distinct < 4)
        warn(`${unit.id}: PASSAGE 정답 번호 다양성 부족 (${distinct}종/${passageAnswers.length}문항)`);
    }
  }
}

// ── mixed 세트 ──
if (!onlyUnit) {
  const MIX_CONTRACT: Record<string, { count: number; scope: string[] }> = {
    set1: { count: 10, scope: ["u01", "u02", "u03", "u04", "u05"] },
    set2: {
      count: 10,
      scope: ["u01", "u02", "u03", "u04", "u05", "u06", "u07", "u08", "u09"],
    },
    final: { count: 12, scope: GRAMMAR_UNITS.map((u) => u.id) },
  };
  for (const setId of ["set1", "set2", "final"] as const) {
    const rel = `mixed/${setId}.json`;
    const raw = readJson(rel);
    if (raw === null) {
      warn(`${rel} 없음(저작 미완)`);
      continue;
    }
    filesSeen++;
    const parsed = mixedSetFileSchema.safeParse(raw);
    if (!parsed.success) {
      formatZodError(rel, parsed);
      continue;
    }
    const contract = MIX_CONTRACT[setId];
    if (parsed.data.items.length !== contract.count)
      err(`${rel}: 문항 ${parsed.data.items.length}개 (계약 ${contract.count}개)`);
    const answers: number[] = [];
    for (const item of parsed.data.items) {
      itemCount++;
      registerId(rel, item.id);
      if (!item.id.startsWith(`mx${setId === "set1" ? 1 : setId === "set2" ? 2 : 3}-`))
        err(`${item.id}: mixed ID 프리픽스가 세트와 다릅니다 (${setId})`);
      if (!contract.scope.includes(item.unitId))
        err(`${item.id}: 정답 유닛(${item.unitId})이 세트 범위를 벗어났습니다`);
      for (const u of item.underlineUnits)
        if (!contract.scope.includes(u))
          err(`${item.id}: 밑줄 유닛(${u})이 세트 범위를 벗어났습니다`);
      for (const [f, v] of englishFieldsOf(item)) checkEnglishField(item.id, f, v);
      answers.push(item.answer);
    }
    const distinct = new Set(answers).size;
    if (answers.length >= 8 && distinct < 4)
      warn(`${rel}: 정답 번호 다양성 부족 (${distinct}종)`);
  }
}

// ── 리포트 ──
console.log("── 어법 드릴 번들 검증 ──");
console.log(`파일 ${filesSeen}개 · 개념 ${conceptCount}개 · 문항 ${itemCount}개`);
if (warnings.length) {
  console.log(`\n⚠ 경고 ${warnings.length}건`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.log(`\n✗ 오류 ${errors.length}건`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("\n✓ 오류 0건 — 게이트 통과");
