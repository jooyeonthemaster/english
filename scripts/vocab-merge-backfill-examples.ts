/**
 * 4단계 병합 산출 — `examples` 기계 백필 (SPEC §10.4 · §10.5)
 *
 * 왜 필요한가: `examples` 가 필수 필드가 되기 **전에** 만들어진 산출물은 예문이 비어 있다.
 * 그런데 예문은 **판정 결과가 아니라 입력의 재배치**다 — 클러스터의 `memberKeys` 가 정해져
 * 있으면 각 멤버의 예문은 샤드 입력에 이미 있다. LLM 을 다시 태울 이유가 없다.
 *
 * 실측: 파킹된 16샤드 = 표제어 39 · 클러스터 98 · 멤버키 297. 에이전트 34기를 재실행하는 대신
 * 코드로 복원한다(재실행하면 판정이 달라져 이미 통과한 적대검수 결과까지 버려진다).
 *
 * ⚠️ 문장을 **생성하지 않는다.** 샤드 입력에 실재하는 문자열만 옮긴다.
 *    입력에 예문이 없는 멤버는 비워 두고 보고한다 — 채워 넣는 순간 그건 창작이다.
 *
 * 사용법:
 *   npx tsx scripts/vocab-merge-backfill-examples.ts --from=<dir> [--apply]
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "experiments/vocab-corpus-20260728/merge";
const SHARD_DIR = `${BASE}/shards`;
const OUT_DIR = `${BASE}/out`;

type WlExample = { en?: string; ko?: string } | string;
type Cand = { senseKey: string; example?: string; examples?: WlExample[] };
type Item = { lemma: string; pos: string; candidates: Cand[] };
type Cluster = { senseKo: string; memberKeys?: string[]; examples?: unknown[] };
type Doc = { results?: { lemma: string; pos: string; clusters?: Cluster[] }[] };

const args = process.argv.slice(2);
const from = args.find((a) => a.startsWith("--from="))?.split("=")[1] ?? `${BASE}/_parked`;
const apply = args.includes("--apply");

/** 후보에서 꺼낼 수 있는 예문을 전부 모은다. 형상이 두 가지라 둘 다 받는다. */
function examplesOf(c: Cand): string[] {
  const out: string[] = [];
  for (const e of c.examples ?? []) {
    const s = typeof e === "string" ? e : e?.en;
    if (s && s.trim()) out.push(s.trim());
  }
  if (out.length === 0 && c.example?.trim()) out.push(c.example.trim());
  return [...new Set(out)];
}

const files = fs.readdirSync(from).filter((f) => f.endsWith(".json")).sort();
let clusters = 0, filled = 0, stillEmpty = 0, added = 0;
const gaps: string[] = [];

for (const f of files) {
  const shardPath = path.join(SHARD_DIR, f);
  if (!fs.existsSync(shardPath)) { gaps.push(`${f}: 대응 샤드 없음 — 건너뜀`); continue; }
  const shard = JSON.parse(fs.readFileSync(shardPath, "utf8")) as { items: Item[] };
  const doc = JSON.parse(fs.readFileSync(path.join(from, f), "utf8")) as Doc;

  const byLemma = new Map(shard.items.map((it) => [`${it.lemma}|${it.pos}`, it]));

  for (const r of doc.results ?? []) {
    const src = byLemma.get(`${r.lemma}|${r.pos}`);
    if (!src) { gaps.push(`${f}: ${r.lemma}|${r.pos} 가 샤드에 없다`); continue; }
    const byKey = new Map(src.candidates.map((c) => [c.senseKey, c]));

    for (const c of r.clusters ?? []) {
      clusters++;
      if (Array.isArray(c.examples) && c.examples.length > 0) continue;
      const ex: string[] = [];
      for (const k of c.memberKeys ?? []) {
        const cand = byKey.get(k);
        if (!cand) { gaps.push(`${f}: ${r.lemma} 멤버키 미매칭 "${k.slice(0, 40)}"`); continue; }
        ex.push(...examplesOf(cand));
      }
      const uniq = [...new Set(ex)];
      if (uniq.length === 0) {
        stillEmpty++;
        gaps.push(`${f}: ${r.lemma}|${r.pos} "${c.senseKo}" — 입력에 예문이 없다(비워 둔다)`);
        continue;
      }
      c.examples = uniq;
      filled++; added += uniq.length;
    }
  }

  if (apply) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, f), JSON.stringify(doc, null, 1));
  }
}

console.log(`=== examples 백필 ${apply ? "(적용)" : "(DRY-RUN)"} ===`);
console.log(`  파일 ${files.length}개 · 클러스터 ${clusters}개`);
console.log(`  채움 ${filled}개 (예문 ${added}개) · 입력에 예문이 없어 비워 둔 것 ${stillEmpty}개`);
if (gaps.length) {
  console.log(`  결손 ${gaps.length}건:`);
  for (const g of gaps.slice(0, 20)) console.log(`    ${g}`);
  if (gaps.length > 20) console.log(`    … 외 ${gaps.length - 20}건`);
}
if (!apply) console.log(`\n  → 적용하려면 --apply`);
