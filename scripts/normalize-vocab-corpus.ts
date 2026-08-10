/**
 * 기출 단어 코퍼스 — 기계 정규화
 *
 * 에이전트가 자유문자열로 쓴 표기 흔들림을 SPEC 고정 목록으로 수렴시킨다.
 * 의미 판단이 필요 없는 **순수 표기 문제만** 다룬다 — 뜻·예문·함정은 절대 건드리지 않는다.
 *
 * 안전설계(scripts/_backfill-report-chosen-choice.ts 관례):
 *   1. dry-run 이 기본. --apply 를 줘야 실제로 쓴다.
 *   2. 쓰기 전 원본을 <파일>.bak 로 백업한다(--no-backup 으로 끌 수 있다).
 *   3. 무엇을 바꿨는지 전부 출력한다.
 *   4. 매핑에 없는 값은 **고치지 않고 보고만** 한다(임의 추측 금지).
 *   5. 멱등 — 두 번 돌려도 결과가 같다.
 *
 * 사용법:
 *   npx tsx scripts/normalize-vocab-corpus.ts --dir=experiments/vocab-corpus-20260728/pilot/arm-a
 *   npx tsx scripts/normalize-vocab-corpus.ts --dir=… --apply
 */
import fs from "node:fs";
import path from "node:path";

/** SPEC §3.5.6 고정 목록으로의 수렴 매핑. 소문자·공백정규화 후 조회한다. */
const INFLECTION_MAP: Record<string, string> = {
  "base": "base",
  "plural": "plural",
  "possessive": "possessive",
  "comparative": "comparative",
  "superlative": "superlative",
  "past": "past",
  "past tense": "past",
  "past participle": "past_participle",
  "past_participle": "past_participle",
  "pastparticiple": "past_participle",
  "present participle": "present_participle",
  "present_participle": "present_participle",
  "gerund": "gerund",
  "third person singular": "third_person_singular",
  "third_person_singular": "third_person_singular",
  "3rd person singular": "third_person_singular",
  "3rd person sing": "third_person_singular",
  "singular": "base",
  "infinitive": "base",
};

const canon = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  return INFLECTION_MAP[v.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
};

function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => a.startsWith("--dir="))?.slice(6);
  const apply = args.includes("--apply");
  const noBackup = args.includes("--no-backup");
  if (!dir) { console.error("usage: --dir=<디렉토리> [--apply] [--no-backup]"); process.exit(2); }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let changed = 0, touchedFiles = 0;
  const unknown = new Map<string, number>();

  for (const f of files) {
    const p = path.join(dir, f);
    const raw = fs.readFileSync(p, "utf8");
    const doc = JSON.parse(raw);
    let fileChanged = 0;

    for (const e of doc.entries ?? []) {
      const to = canon(e.inflection);
      if (to === null) { unknown.set(String(e.inflection), (unknown.get(String(e.inflection)) ?? 0) + 1); continue; }
      if (to !== e.inflection) {
        console.log(`  ${f} :: ${e.surface} — inflection "${e.inflection}" → "${to}"`);
        e.inflection = to;
        fileChanged++;
      }
      // SPEC §3.5.2 — **수동태 동사에 한해** 표제어를 능동 사전형으로 되돌린다.
      //
      // ⚠️ pos 조건이 없으면 형용사·명사 보어 구문(be sure of / be responsible for /
      //    be well known)까지 벗겨 사전에 없는 표제어를 만든다. 2026-07-28 적대검수에서
      //    실제로 7건 오염 / 정당 1건으로 적발됐다 — 소수 케이스를 다수에 적용한 버그였다.
      //    §3.5.2 의 "수동태 표층형"은 be + 과거분사(동사)만을 가리킨다.
      const stripEligible = e.pos === "verb" || e.pos === "phrasal_verb";
      if (typeof e.lemma === "string" && /^be\s+/i.test(e.lemma) && stripEligible) {
        const active = e.lemma.replace(/^be\s+/i, "");
        console.log(`  ${f} :: ${e.surface} — lemma "${e.lemma}" → "${active}" (수동형은 collocation 으로)`);
        if (!e.collocation) e.collocation = e.lemma;
        e.lemma = active;
        fileChanged++;
      } else if (typeof e.lemma === "string" && /^be\s+/i.test(e.lemma)) {
        console.log(`  ${f} :: ${e.surface} — lemma "${e.lemma}" 는 pos=${e.pos} 라 벗기지 않는다(보어 구문)`);
      }

      // SPEC — confusable 은 "헷갈릴 만한 **다른** 단어"다. 자기 자신이 들어가면
      // 후속 병합에서 자기 자신과의 혼동 관계가 생겨 그래프가 망가진다.
      // 게이트가 critical 로 잡지만, 4,537건 규모에서 매번 에이전트에게 되돌려 고치게 하는 것보다
      // 기계가 떼는 편이 싸고 확실하다(판단이 개입할 여지가 없는 순수 기계 규칙이다).
      if (Array.isArray(e.confusable)) {
        const self = new Set(
          [e.lemma, e.surface].filter((s) => typeof s === "string").map((s: string) => s.toLowerCase().trim()),
        );
        const kept = e.confusable.filter(
          (c: unknown) => !(typeof c === "string" && self.has(c.toLowerCase().trim())),
        );
        if (kept.length !== e.confusable.length) {
          const dropped = e.confusable.filter((c: unknown) => !kept.includes(c));
          console.log(`  ${f} :: ${e.surface} — confusable 자기참조 제거 ${JSON.stringify(dropped)}`);
          e.confusable = kept;
          fileChanged++;
        }
      }

      // ── 제거된 규칙: "be- 벗기기 버그 피해 복구" ──────────────────────────
      // 2026-07-28 폐기. 이 규칙은 `collocation` 이 `be X` 이고 `lemma === X` 이며
      // pos 가 verb/phrasal_verb 가 아니면 "내 옛 버그가 벗겨낸 것"으로 보고 `lemma` 를
      // `be X` 로 되돌렸다. 옛 피해 7건 복구라는 **1회성 목적**은 이미 달성됐다.
      //
      // 그런데 그 조건은 **스펙대로 옳게 쓴 데이터와 구분되지 않는다.** §3.5 는 형용사·명사
      // 보어 구문을 `lemma`=형용사 + `collocation`="be 형용사" 로 쓰라고 규정한다 —
      // 즉 `lemma:"available" / collocation:"be available"` 은 정답이다. 실측에서 이 규칙이
      // available·doomed·well off·pressed for time 4건을 되돌리려 했고, 되돌렸다면
      // 게이트의 "lemma 가 `be `로 시작 금지" 검사에 정면으로 걸렸을 것이다.
      // 판별 불가능한 복구 규칙은 남겨두면 오염원이다. 지운다.
      void stripEligible;
    }

    if (fileChanged > 0) {
      touchedFiles++; changed += fileChanged;
      if (apply) {
        if (!noBackup) fs.writeFileSync(`${p}.bak`, raw);
        fs.writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
      }
    }
  }

  console.log(`\n=== ${apply ? "적용 완료" : "DRY-RUN (실제로 쓰지 않음)"} ===`);
  console.log(`  파일 ${files.length}개 중 ${touchedFiles}개 / 수정 ${changed}건`);
  if (unknown.size) {
    console.log(`\n  ⚠️ 매핑에 없어 손대지 않은 값 (사람이 판단해야 한다):`);
    for (const [k, n] of [...unknown.entries()].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  "${k}"`);
  }
  if (!apply && changed > 0) console.log(`\n  → 적용하려면 --apply 를 붙여라.`);
}

main();
