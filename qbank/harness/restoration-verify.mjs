// ★ 복원 결정론 검증 — 코퍼스가 남긴 감사 추적으로 "복원이 성공했는가"를 0원으로 판정한다.
//
// 발견 경위(일지 Q041): P0 감사 배치2의 제2 감사관이 오탐을 반증하면서
// `restoration-results.json` 과 **passages.json 안의 `plantedError` 메타**를 근거로 삼았다.
// 확인해 보니 코퍼스 빌더가 완전한 감사 추적을 남겨 두었다:
//   - `plantedError: {planted, original, excerpt, verifiedBy, restoredAt}`  330건
//   - `errorAudit: "clean-verified-3way-20260721"`                          234건
//   - `note: "...절단됨. 원문 없이는 복구 불가..."`                          23건
//
// 즉 어법·어휘 재구성본의 상당수는 **무엇을 심었고 무엇으로 되돌렸는지**가 기록돼 있다.
// 그러면 "복원이 성공했는가"는 LLM 판단이 아니라 **문자열 검사**다:
//   original 이 본문에 있고 planted 는 없으면 성공.
//
// 실행: node qbank/harness/restoration-verify.mjs [--write] [--verbose]

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src/data/exam-passages/passages.json");
const OUT = path.join(ROOT, "qbank/spec/restoration-verify.json");

const rows = JSON.parse(fs.readFileSync(SRC, "utf8"));

const norm = (s) =>
  String(s ?? "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 단어 경계 포함 검사 — 부분 일치(thin ⊂ thinking)를 막는다 */
function hasWord(haystack, needle) {
  if (!needle) return false;
  const n = norm(needle);
  if (!n) return false;
  // 다어절이면 그대로 부분 문자열 검사(경계는 앞뒤만)
  const re = new RegExp("(^|[^A-Za-z])" + escapeRe(n) + "([^A-Za-z]|$)", "i");
  return re.test(haystack);
}

const result = {
  generatedAt: new Date().toISOString(),
  totals: {},
  errorAuditValues: {},
  verifiedByValues: {},
  restored: [],
  failed: [],
  ambiguous: [],
  notes: [],
  cleanVerified: [],
};

for (const r of rows) {
  if (r.errorAudit) result.errorAuditValues[r.errorAudit] = (result.errorAuditValues[r.errorAudit] || 0) + 1;
  if (r.plantedError?.verifiedBy)
    result.verifiedByValues[r.plantedError.verifiedBy] = (result.verifiedByValues[r.plantedError.verifiedBy] || 0) + 1;
  if (r.note) result.notes.push({ id: r.id, kind: r.reconstructionKind, note: String(r.note) });
  if (r.errorAudit && /clean-verified/.test(r.errorAudit)) result.cleanVerified.push(r.id);

  const pe = r.plantedError;
  if (!pe || !pe.original || !pe.planted) continue;

  const t = norm(r.text);
  const hasOrig = hasWord(t, pe.original);
  const hasPlant = hasWord(t, pe.planted);

  const rec = {
    id: r.id,
    year: r.year,
    kind: r.reconstructionKind,
    planted: pe.planted,
    original: pe.original,
    verifiedBy: pe.verifiedBy,
    excerpt: pe.excerpt,
  };

  if (hasOrig && !hasPlant) result.restored.push(rec);
  else if (!hasOrig && hasPlant) result.failed.push({ ...rec, why: "복원 실패 — planted 가 남아 있고 original 이 없다" });
  else if (!hasOrig && !hasPlant) result.failed.push({ ...rec, why: "둘 다 없다 — 해당 구절이 통째로 사라졌을 가능성(절단)" });
  else result.ambiguous.push({ ...rec, why: "original·planted 가 모두 존재 — 다른 자리의 동형어일 수 있다" });
}

result.totals = {
  passages: rows.length,
  withPlantedError: result.restored.length + result.failed.length + result.ambiguous.length,
  restoredOk: result.restored.length,
  restorationFailed: result.failed.length,
  ambiguous: result.ambiguous.length,
  cleanVerified3way: result.cleanVerified.length,
  withNote: result.notes.length,
};

console.log("═══ 복원 결정론 검증 (LLM 미사용, 0원) ═══");
console.log(`전체 지문 ${result.totals.passages.toLocaleString()}`);
console.log(`  plantedError 보유          ${result.totals.withPlantedError}`);
console.log(`    ├ 복원 성공              ${result.totals.restoredOk}`);
console.log(`    ├ ★ 복원 실패            ${result.totals.restorationFailed}`);
console.log(`    └ 모호(동형어 가능)      ${result.totals.ambiguous}`);
console.log(`  clean-verified-3way 태그   ${result.totals.cleanVerified3way}`);
console.log(`  복구 불가 노트             ${result.totals.withNote}`);
console.log("\nerrorAudit 값:", JSON.stringify(result.errorAuditValues));
console.log("verifiedBy 값:", JSON.stringify(result.verifiedByValues));

if (result.failed.length) {
  console.log(`\n=== 복원 실패 ${result.failed.length}건 ===`);
  for (const f of result.failed.slice(0, 20))
    console.log(`  ${f.id.padEnd(26)} ${String(f.planted).padEnd(18)} → ${String(f.original).padEnd(18)} | ${f.why}`);
}
if (process.argv.includes("--verbose") && result.ambiguous.length) {
  console.log(`\n=== 모호 ${result.ambiguous.length}건 (동형어 검증 필요) ===`);
  for (const f of result.ambiguous.slice(0, 20)) console.log(`  ${f.id.padEnd(26)} ${f.planted} / ${f.original}`);
}

if (process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1), "utf8");
  console.log(`\n→ ${OUT}`);
}
