/**
 * 기출 1000제 최소대립쌍 라이브러리 → 엔진용 정제 카탈로그 빌드.
 *
 * minimal-pair-library.json(byFinePoint, 4003쌍)을 읽어 pointCode(a~m)별
 * "검증된 오류 변형 방향(correct→wrong)"으로 정제한다. OCR 노이즈·시비성
 * 변형(시제 단독)을 걸러 GRAMMAR_ERROR/네모 어법 생성의 기출 근거로 쓴다.
 *
 * 출력: src/lib/grammar-minimal-pairs.ts (타입드 const)
 * Run: npx tsx scripts/build-grammar-minimal-pairs.ts
 */
import * as fs from "fs";
import * as path from "path";

type PairRow = {
  finePoint: string;
  correct: string;
  wrong: string;
  surfaceMutation: string;
  count: number;
};

const SRC = path.join(
  process.cwd(),
  "scripts",
  "_gen_audit_out",
  "grammar-1000",
  "minimal-pair-library.json",
);
const OUT = path.join(process.cwd(), "src", "lib", "grammar-minimal-pairs.ts");

// surfaceMutation → 우리 pointCode(a~m). surfaceMutation 은 실제 변형 종류라
// 교차오염된 finePoint 라벨보다 신뢰도가 높다(핸드오프 경고). 시제 단독
// (tense_aspect_swap)·대동사·어순·복합수식어 수·기타는 매핑에서 제외 = 시비성/etc 차단.
const SURFACE_TO_CODE: Record<string, string> = {
  finite_nonfinite_swap: "a",
  relative_that_what_swap: "b",
  relative_form_swap: "b",
  participle_active_passive_swap: "c",
  subject_verb_agreement_swap: "d",
  active_passive_voice_swap: "e",
  adjective_adverb_swap: "f",
  pronoun_agreement_swap: "g",
  object_complement_form_swap: "h",
  parallel_form_swap: "i",
  subjunctive_or_mandative_swap: "j",
  infinitive_gerund_or_to_swap: "k",
  preposition_conjunction_swap: "l",
  comparison_form_swap: "m",
  quantifier_count_mass_or_degree_swap: "m",
  // 제외(etc/시비성): tense_aspect_swap, dummy_do_substitution,
  // word_order_enough_swap, compound_modifier_number_swap, other_surface_swap
};

const MIN_COUNT = 3;
const MAX_PAIRS_PER_CODE = 8;

// 의미만 다른 토글·규범논쟁쌍은 정답으로 쓰면 복수정답 시비(둘 다 정문) → 모델에
// '오류 변형 방향'으로 제시하면 안 되므로 최소대립쌍에서 제외한다. 정렬키(unordered)로
// 양방향 차단. (question-quality.ts 수량 게이트 QUANTITY_*_PAIRS 와 동일 목록 유지.)
const MEANING_TOGGLE_PAIR_KEYS = new Set<string>([
  "a little|little", // 거의 없음 vs 조금 있음 (극성) — 라이브 리스크였던 little→a little
  "a few|few",
  "few|many",
  "little|much",
  "few|much",
  "little|many",
  "any|some",
  "fewer|less", // 규범 vs 실사용 논쟁
  "amount|number",
  // 한정사 동의어/극성 토글(필살기 검증 2026-06-23 보강) — question-quality.ts QUANTITY_MEANING_TOGGLE_PAIRS 와 동기화
  "all|some", "all|both", "each|every", "few|several", "less|little",
  "many|numerous", "a few|some", "much|plenty of", "a lot of|lots of",
  "a lot of|plenty of", "almost all of the|most of the", "either|neither",
  "no|not any", "hardly any|very few",
]);
function meaningTogglePairKey(a: string, b: string): string {
  return [a.trim().toLowerCase(), b.trim().toLowerCase()].sort().join("|");
}

// 깨끗한 영어 토큰/짧은 구만 채택 — OCR 노이즈(숫자·단일문자·기호) 배제.
function isCleanSurface(value: string): boolean {
  const v = value.trim();
  if (!v || v.length < 2) return false;
  if (v.length > 22) return false;
  if (!/^[A-Za-z][A-Za-z'\- ]*[A-Za-z]$/.test(v)) return false;
  const tokens = v.split(/\s+/);
  if (tokens.length > 2) return false; // 최소대립쌍은 1~2어
  return true;
}

function main() {
  const lib = JSON.parse(fs.readFileSync(SRC, "utf8")) as {
    byFinePoint: Record<string, PairRow[]>;
  };

  // surfaceMutation → pointCode 로 재그룹. 같은 (correct→wrong)이 여러 finePoint에
  // 교차태깅돼 중복 등장하므로 MAX count 로 dedupe(합산 시 인플레이션).
  const byCode = new Map<string, Map<string, { correct: string; wrong: string; count: number }>>();
  for (const rows of Object.values(lib.byFinePoint)) {
    for (const row of rows) {
      const code = SURFACE_TO_CODE[row.surfaceMutation];
      if (!code) continue;
      if (row.count < MIN_COUNT) continue;
      if (!isCleanSurface(row.correct) || !isCleanSurface(row.wrong)) continue;
      if (row.correct.toLowerCase() === row.wrong.toLowerCase()) continue;
      // 의미토글·규범논쟁쌍 제외 — 정답으로 쓰면 복수정답 시비.
      if (MEANING_TOGGLE_PAIR_KEYS.has(meaningTogglePairKey(row.correct, row.wrong))) continue;
      const bucket = byCode.get(code) ?? new Map();
      const key = `${row.correct.toLowerCase()}→${row.wrong.toLowerCase()}`;
      const prev = bucket.get(key);
      if (prev) prev.count = Math.max(prev.count, row.count);
      else bucket.set(key, { correct: row.correct, wrong: row.wrong, count: row.count });
      byCode.set(code, bucket);
    }
  }

  const result: Record<string, Array<{ correct: string; wrong: string; count: number }>> = {};
  for (const [code, bucket] of byCode) {
    result[code] = Array.from(bucket.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_PAIRS_PER_CODE);
  }

  const codes = Object.keys(result).sort();
  const lines: string[] = [
    "// ============================================================================",
    "// 기출 1000제 최소대립쌍 — pointCode(a~m)별 검증된 오류 변형 방향.",
    "// 자동 생성: scripts/build-grammar-minimal-pairs.ts (수기 편집 금지).",
    "// 출처: minimal-pair-library.json(byFinePoint). count>=" + MIN_COUNT + ", 깨끗한 1~2어만.",
    "// GRAMMAR_ERROR/네모 어법 오류 생성의 기출 근거 + 시비성(비검증) 변형 차단용.",
    "// ============================================================================",
    "",
    "export interface GrammarMinimalPair {",
    "  /** 원문의 올바른 표면형 */",
    "  correct: string;",
    "  /** 기출에서 이 자리를 오류로 만들 때 쓰는 틀린 표면형 */",
    "  wrong: string;",
    "  /** 기출 1000제 내 출현 횟수 */",
    "  count: number;",
    "}",
    "",
    "/** pointCode(a~m) → 기출 검증 변형쌍(빈도순 상위). 시제 단독 등 etc는 미수록. */",
    "export const GRAMMAR_MINIMAL_PAIRS: Record<string, GrammarMinimalPair[]> = {",
  ];
  for (const code of codes) {
    const pairs = result[code]
      .map((p) => `{ correct: ${JSON.stringify(p.correct)}, wrong: ${JSON.stringify(p.wrong)}, count: ${p.count} }`)
      .join(", ");
    lines.push(`  ${code}: [${pairs}],`);
  }
  lines.push("};");
  lines.push("");
  lines.push("/** 해당 pointCode 의 기출 변형 방향을 \"a→b, c→d\" 한 줄로 (프롬프트 주입용). */");
  lines.push("export function describeGrammarMinimalPairs(pointCode: string, max = 5): string {");
  lines.push("  const pairs = GRAMMAR_MINIMAL_PAIRS[pointCode];");
  lines.push("  if (!pairs || pairs.length === 0) return \"\";");
  lines.push("  return pairs.slice(0, max).map((p) => `${p.correct}→${p.wrong}`).join(\", \");");
  lines.push("}");
  lines.push("");

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");

  // 요약 로그
  console.log(`[minimal-pairs] wrote ${OUT}`);
  for (const code of codes) {
    console.log(`  ${code}: ${result[code].length} pairs — ${result[code].slice(0, 4).map((p) => `${p.correct}→${p.wrong}(${p.count})`).join(", ")}`);
  }
}

main();
