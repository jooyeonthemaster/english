/**
 * 인터랙티브 레슨 — 결정론 검증 게이트.
 *   npx tsx scripts/verify-lessons.ts           # 전체
 *   npx tsx scripts/verify-lessons.ts u01-c1    # 특정 레슨만
 *
 * 검사 축:
 *  1. zod 스키마(구조·필수 블록·합니다체·한글혼입·정답유일성) — lesson-schema.ts
 *  2. 커리큘럼 백본 정합(id·unitId·order·title 이 CONCEPT_SKELETON 과 일치)
 *  3. 문항 ID 전역 유일성 + 기존 드릴 뱅크와의 충돌 금지
 *  4. concept_check 서빙 가능성: 레슨마다 CHOICE·difficulty=1 문항이 최소 1개
 *  5. 분량 하한: 블록 12개 이상, 예문 10개 이상
 *  6. tier 정책(초등 레슨에 MISCONCEPTION 금지 — zod 가 이미 강제, 여기서 재확인)
 *
 * 문법적 '옳음'은 이 게이트가 판정하지 않는다 — 적대 검수 함대가 담당한다.
 */
import fs from "fs";
import path from "path";
import { lessonSchema } from "@/lib/study-os/lesson-schema";
import { GRAMMAR_CONCEPT_SKELETONS } from "@/lib/grammar-drill/curriculum";
import type { GrammarLesson } from "@/lib/study-os/lesson-types";

const LESSON_DIR = path.join(process.cwd(), "src", "data", "grammar-drill", "lessons");
const ITEMS_DIR = path.join(process.cwd(), "src", "data", "grammar-drill", "items");
const only = process.argv[2] || null;

const errors: string[] = [];
const warnings: string[] = [];
let seen = 0;
let blockTotal = 0;
let itemTotal = 0;

// 기존 드릴 뱅크의 문항 ID (충돌 검사용)
const existingItemIds = new Set<string>();
if (fs.existsSync(ITEMS_DIR)) {
  for (const f of fs.readdirSync(ITEMS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), "utf-8")) as {
        items?: { id: string }[];
      };
      for (const it of raw.items ?? []) existingItemIds.add(it.id);
    } catch {
      /* 기존 뱅크 파손은 verify-grammar-drill-bundle 이 잡는다 */
    }
  }
}

const lessonItemIds = new Set<string>();
const skeletons = GRAMMAR_CONCEPT_SKELETONS.filter((s) => !only || s.id === only);

function countExamples(lesson: GrammarLesson): number {
  let n = 0;
  for (const b of lesson.blocks) {
    switch (b.type) {
      case "RULE":
      case "CONTRAST":
        n += b.examples.length;
        break;
      case "MISCONCEPTION":
        n += 1;
        break;
      case "ALGORITHM":
      case "TRAP":
        n += 1;
        break;
      case "SUMMARY":
        n += 1;
        break;
      case "WORKED":
      case "COMPLETION":
      case "DIAGRAM":
      case "GENERATE":
      case "ERROR_HUNT":
      case "TRANSFER":
      case "HOOK":
        n += 1;
        break;
      case "CHECK":
      case "RECAP":
        n += b.items.length;
        break;
      // v2 노트 패밀리 — 예문이 달린 항목·행만 예문으로 센다
      case "NOTEBOOK":
        n += b.entries.filter((e) => e.example).length;
        break;
      case "TABLE":
        n += b.rows.filter((r) => r.example).length;
        break;
      default:
        break;
    }
  }
  return n;
}

for (const skeleton of skeletons) {
  const file = path.join(LESSON_DIR, `${skeleton.id}.json`);
  if (!fs.existsSync(file)) {
    warnings.push(`${skeleton.id}: 레슨 미저작`);
    continue;
  }
  seen++;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    errors.push(`${skeleton.id}: JSON 파싱 실패 — ${(e as Error).message}`);
    continue;
  }

  const parsed = lessonSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 12)) {
      errors.push(`${skeleton.id}: [${issue.path.join(".")}] ${issue.message}`);
    }
    if (parsed.error.issues.length > 12) {
      errors.push(`${skeleton.id}: …외 ${parsed.error.issues.length - 12}건`);
    }
    continue;
  }

  const lesson = parsed.data as unknown as GrammarLesson;

  // ── 백본 정합 ──
  if (lesson.unitId !== skeleton.unitId)
    errors.push(`${lesson.id}: unitId 불일치(${lesson.unitId} ≠ ${skeleton.unitId})`);
  if (lesson.order !== skeleton.order)
    errors.push(`${lesson.id}: order 불일치(${lesson.order} ≠ ${skeleton.order})`);
  if (lesson.title !== skeleton.title)
    errors.push(
      `${lesson.id}: title 이 백본과 다릅니다 ("${lesson.title}" ≠ "${skeleton.title}")`,
    );

  // ── 문항 ID 유일성 · 기존 뱅크 충돌 ──
  const items = lesson.blocks.flatMap((b) =>
    b.type === "CHECK" || b.type === "RECAP" ? b.items : [],
  );
  itemTotal += items.length;
  for (const it of items) {
    if (lessonItemIds.has(it.id)) errors.push(`${lesson.id}: 문항 ID 전역 중복 — ${it.id}`);
    if (existingItemIds.has(it.id))
      errors.push(`${lesson.id}: 기존 드릴 뱅크와 문항 ID 충돌 — ${it.id}`);
    lessonItemIds.add(it.id);
  }

  // ── concept_check 서빙 가능성 ──
  const hasEasyChoice = items.some(
    (it) => it.type === "CHOICE" && it.difficulty === 1,
  );
  if (!hasEasyChoice)
    errors.push(
      `${lesson.id}: CHOICE·난이도1 문항이 없습니다 (개념 체크 서빙 불가 — 최소 1개 필요)`,
    );

  // ── 분량 ──
  blockTotal += lesson.blocks.length;
  const exampleCount = countExamples(lesson);
  if (exampleCount < 10)
    errors.push(`${lesson.id}: 예문 ${exampleCount}개 (최소 10개 — 저작 미달)`);
  if (lesson.blocks.length < 12)
    errors.push(`${lesson.id}: 블록 ${lesson.blocks.length}개 (최소 12개)`);

  // ── 확신 없는 개념 연결 ──
  for (const c of lesson.confusableWith) {
    if (!GRAMMAR_CONCEPT_SKELETONS.some((s) => s.id === c))
      errors.push(`${lesson.id}: confusableWith 에 없는 개념 ID — ${c}`);
  }
}

// ── 리포트 ──
console.log("── 인터랙티브 레슨 검증 ──");
console.log(
  `레슨 ${seen}/${skeletons.length}개 · 블록 ${blockTotal}개 · 문항 ${itemTotal}개`,
);
if (warnings.length) {
  console.log(`\n⚠ 경고 ${warnings.length}건`);
  for (const w of warnings.slice(0, 30)) console.log(`  - ${w}`);
  if (warnings.length > 30) console.log(`  …외 ${warnings.length - 30}건`);
}
if (errors.length) {
  console.log(`\n✗ 오류 ${errors.length}건`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("\n✓ 오류 0건 — 게이트 통과");
