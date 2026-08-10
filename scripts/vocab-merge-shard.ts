/**
 * 4단계 sense 병합 — 샤딩 + 기계 게이트 (SPEC §10)
 *
 * 왜 샤딩인가: merge-worklist.json 은 표제어 1,611개짜리 단일 파일이다. 에이전트가 통째로
 * 읽으면 컨텍스트가 터지고, 인덱스 범위만 주면 매 에이전트가 대용량 파일을 파싱해야 한다.
 * 배정분만 담은 작은 파일을 미리 떨어뜨려 준다(추출 단계의 vocab-passage.ts 와 같은 설계).
 *
 * 난이도 인지 배칭: 후보가 2~3개인 표제어는 판정이 쉬워 여러 개를 한 에이전트가 처리하고,
 * 후보가 많은 표제어(find 28개, make 25개)는 **한 표제어에 한 에이전트**를 준다.
 * 균등 분할하면 어려운 건이 쉬운 건에 묻혀 대충 판정된다(추출 단계에서 실측된 현상).
 *
 * 사용법:
 *   npx tsx scripts/vocab-merge-shard.ts --split                 # 샤드 생성
 *   npx tsx scripts/vocab-merge-shard.ts --split --limit=40      # 파일럿용 표본
 *   npx tsx scripts/vocab-merge-shard.ts --verify                # 산출 기계 게이트
 *   npx tsx scripts/vocab-merge-shard.ts --verify --base=<dir>   # 게이트 음성테스트(픽스처)
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

/**
 * `--base=` 는 **게이트 자체를 시험하기 위한 것**이다(기본값은 실제 실험 디렉터리).
 *
 * 계기는 "울리지 않았다"가 아니라 "울려야 할 때 울린다"를 보인 뒤에만 신뢰할 수 있다.
 * 그 음성테스트를 실제 산출물 위에서 하면 안 된다 — 실제로 한 번 그렇게 했다가
 * `merge/out/s0000.json` 의 예문이 `PROBE example 1` 로 덮인 채 남았다(원복 누락).
 * 그러니 픽스처 디렉터리를 따로 만들어 거기서 시험한다.
 */
const BASE = flag("base") ?? "experiments/vocab-corpus-20260728";
const WORKLIST = `${BASE}/build/merge-worklist.json`;
const SHARD_DIR = `${BASE}/merge/shards`;
const OUT_DIR = `${BASE}/merge/out`;

type WlExample = { passageId: string; sentenceIndex: number; en: string; ko: string };
type Cand = {
  senseKey: string; senseEn: string; senseKo: string; occurrences: number;
  senseEnVariants?: string[]; senseKoCandidates?: { ko: string; n: number }[];
  examples?: WlExample[];
};
type Item = { lemma: string; pos: string; senseCount: number; occurrences: number; candidates: Cand[] };

/** §10.5 산출 스키마. `examples`·`reviewed` 는 파일럿 개정으로 필수가 됐다. */
type OutCluster = {
  senseKo: string; senseEn: string; memberKeys: string[]; occurrences?: number;
  examples?: (string | { en?: string })[]; why: string;
  reviewed?: "upheld" | "split-back" | null;
};
type OutResult = { lemma: string; pos: string; clusters: OutCluster[] };
type OutDoc = { results?: OutResult[]; observations?: { kind: string; senseKeys: string[]; what: string }[] };

/** §10.6.3 — 되돌리지 않은 관찰의 종류. */
const OBS_KINDS = new Set(["candidate-suspect", "under-merge", "sub-sense"]);
/** §10.5 + §10.6.1 — 적대검수 전은 null, 검수 후는 둘 중 하나. */
const REVIEWED_VALUES = new Set(["upheld", "split-back"]);

/** 후보 수에 따른 한 샤드당 표제어 수 — 어려울수록 적게 묶는다. */
function batchSize(candCount: number): number {
  if (candCount >= 9) return 1;   // find(28) make(25) 급 — 전담
  if (candCount >= 6) return 3;
  if (candCount >= 4) return 6;
  return 12;                       // 2~3개짜리
}

function split() {
  const limit = Number(flag("limit") ?? "0");
  const wl = JSON.parse(fs.readFileSync(WORKLIST, "utf8")) as { worklist: Item[] };
  let items = wl.worklist;

  if (limit > 0) {
    // 파일럿 표본은 난이도 전 구간을 훑어야 한다. 후보 수로 층화해 라운드로빈으로 뽑는다.
    const bucket = (n: number) => (n >= 9 ? "9+" : n >= 6 ? "6-8" : n >= 4 ? "4-5" : "2-3");
    const by = new Map<string, Item[]>();
    for (const it of items) {
      const k = bucket(it.candidates.length);
      if (!by.has(k)) by.set(k, []);
      (by.get(k) as Item[]).push(it);
    }
    const keys = ["9+", "6-8", "4-5", "2-3"];
    const out: Item[] = [];
    for (let r = 0; out.length < limit; r++) {
      let added = 0;
      for (const k of keys) {
        const b = by.get(k) ?? [];
        if (r < b.length && out.length < limit) { out.push(b[r]); added++; }
      }
      if (added === 0) break;
    }
    items = out;
  }

  // 같은 난이도끼리 묶어야 batchSize 가 의미를 갖는다.
  items = items.slice().sort((a, b) => b.candidates.length - a.candidates.length);

  /**
   * 재분할은 샤드를 통째로 갈아엎지만 `out/` 은 그대로 둔다. 샤드 id 는 `s0000` 부터 다시
   * 매겨지므로, 옛 산출이 남아 있으면 **완전히 다른 표제어 배정**을 담은 동명 파일과
   * 짝지어져 게이트를 통과하거나 엉뚱한 누락을 보고한다 — 조용한 오염이다.
   * 그러니 막고, 무엇을 하라는지 알려 준다.
   */
  const stale = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")) : [];
  if (stale.length && !args.includes("--force")) {
    console.error(`거부: ${OUT_DIR} 에 이전 산출 ${stale.length}개가 남아 있다.`);
    console.error(`  재분할하면 샤드 id 는 재사용되는데 산출은 옛 배정 그대로라 짝이 어긋난다.`);
    console.error(`  → 보관(_parked 로 이동)하거나 지운 뒤 다시 실행. 알고도 강행하려면 --force`);
    process.exit(2);
  }

  fs.rmSync(SHARD_DIR, { recursive: true, force: true });
  fs.mkdirSync(SHARD_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const shards: { id: string; lemmas: number; candidates: number }[] = [];
  let i = 0;
  while (i < items.length) {
    const size = batchSize(items[i].candidates.length);
    const chunk = items.slice(i, i + size);
    const id = `s${String(shards.length).padStart(4, "0")}`;
    fs.writeFileSync(path.join(SHARD_DIR, `${id}.json`), JSON.stringify({ shardId: id, items: chunk }, null, 1));
    shards.push({ id, lemmas: chunk.length, candidates: chunk.reduce((n, x) => n + x.candidates.length, 0) });
    i += size;
  }

  fs.writeFileSync(`${BASE}/merge/shards.json`, JSON.stringify(shards.map((s) => s.id)));
  console.log(`표제어 ${items.length}개 → 샤드 ${shards.length}개`);
  console.log(`  샤드당 표제어 중앙값 ${shards.map((s) => s.lemmas).sort((a, b) => a - b)[Math.floor(shards.length / 2)]}`);
  console.log(`  총 후보 ${shards.reduce((n, s) => n + s.candidates, 0)}개`);
  console.log(`  → ${SHARD_DIR}/  ·  목록 ${BASE}/merge/shards.json`);
}

/**
 * 기계 게이트 — SPEC §10.3-4 전단사(bijection).
 *
 * 병합에서 가장 위험한 실패는 **조용한 누락**이다. 후보를 빠뜨려도 산출은 그럴듯해 보이고,
 * 그 sense 는 DB 에서 영원히 사라진다. 그러니 "입력 senseKey 집합 == 클러스터 멤버 합집합"을
 * 기계가 강제한다. 창작(입력에 없는 키)도 같은 검사에서 잡힌다.
 */
function verify() {
  const shardIds: string[] = JSON.parse(fs.readFileSync(`${BASE}/merge/shards.json`, "utf8"));
  let ok = 0, missing = 0, issues = 0, totalIn = 0, totalOut = 0, merged = 0;
  let exMissing = 0, exThin = 0;
  const report: string[] = [];

  for (const sid of shardIds) {
    const outPath = path.join(OUT_DIR, `${sid}.json`);
    if (!fs.existsSync(outPath)) { missing++; continue; }
    const shard = JSON.parse(fs.readFileSync(path.join(SHARD_DIR, `${sid}.json`), "utf8")) as { items: Item[] };
    let doc: OutDoc;
    try { doc = JSON.parse(fs.readFileSync(outPath, "utf8")); }
    catch (e) { report.push(`[CRITICAL] ${sid} PARSE_FAIL ${String(e)}`); issues++; continue; }

    const byLemma = new Map(shard.items.map((it) => [`${it.lemma}|${it.pos}`, it]));
    const seen = new Set<string>();

    // §10.5 스키마 · §10.6.3 — observations 배열. 없으면 검수자가 "되돌릴 수는 없지만
    // 문제인 것"(과소병합·후보 오분류·하위뜻)을 보고할 통로가 없다. 관찰이 없으면 `[]` 를 적는다 —
    // **필드를 생략하는 것과 "관찰 없음"은 다르다.** examples 가 통째로 증발한 것과 같은
    // 실패 방식(규범은 필수라는데 게이트가 안 봄)을 여기서 되풀이하지 않는다.
    if (doc.observations === undefined) {
      report.push(`[MAJOR] ${sid} observations 필드 없음 — §10.5 스키마 필수(관찰이 없으면 [])`); issues++;
    } else {
      if (!Array.isArray(doc.observations)) {
        report.push(`[MAJOR] ${sid} observations 가 배열이 아니다`); issues++;
      } else {
        for (const o of doc.observations) {
          if (!OBS_KINDS.has(o?.kind)) { report.push(`[MAJOR] ${sid} observations.kind "${o?.kind}" 는 §10.6.3 목록 밖`); issues++; }
          if (!Array.isArray(o?.senseKeys) || !(o?.what ?? "").trim()) { report.push(`[MAJOR] ${sid} observations 항목에 senseKeys/what 이 없다`); issues++; }
        }
      }
    }

    for (const r of doc.results ?? []) {
      const key = `${r.lemma}|${r.pos}`;
      const src = byLemma.get(key);
      if (!src) { report.push(`[CRITICAL] ${sid} 배정에 없는 표제어 "${key}"`); issues++; continue; }
      seen.add(key);

      const inKeys = new Set(src.candidates.map((c) => c.senseKey));
      const outKeys: string[] = [];
      for (const c of r.clusters ?? []) {
        if (!Array.isArray(c.memberKeys) || c.memberKeys.length === 0) {
          report.push(`[CRITICAL] ${sid} ${key} memberKeys 비어 있음`); issues++;
        }
        outKeys.push(...(c.memberKeys ?? []));
        // §5 senseKo 길이 규범은 병합 대표값에도 그대로 적용된다.
        const koLen = (c.senseKo ?? "").replace(/[~\s]/g, "").length;
        if (koLen === 0 || koLen > 12) { report.push(`[MAJOR] ${sid} ${key} senseKo "${c.senseKo}" 길이 ${koLen}`); issues++; }
        if ((c.senseEn ?? "").trim().split(/\s+/).length < 3) { report.push(`[MAJOR] ${sid} ${key} senseEn 이 너무 짧다`); issues++; }
        if (!(c.why ?? "").trim()) { report.push(`[MAJOR] ${sid} ${key} why 없음 — 적대검수 입력이 사라진다`); issues++; }

        /**
         * §10.4 · §10.5 — `examples` 필수. **이 검사가 없어서 파일럿 산출 17개 중 16개가
         * 예문을 통째로 버렸다.** 예문은 §10.6 적대검수의 유일한 근거이자 학생 카드의
         * 본문이다. 없으면 병합이 옳았는지 사후에 판정할 방법 자체가 사라진다.
         */
        const ex = c.examples;
        if (!Array.isArray(ex) || ex.length === 0) {
          report.push(`[CRITICAL] ${sid} ${key} examples 없음 — §10.5 필수 필드 (멤버 ${(c.memberKeys ?? []).length}개의 근거가 사라진다)`);
          issues++; exMissing++;
        } else {
          const bad = ex.filter((e) => typeof e === "string" ? !e.trim() : !(e?.en ?? "").trim());
          if (bad.length) { report.push(`[CRITICAL] ${sid} ${key} examples 에 빈 항목 ${bad.length}개`); issues++; exMissing++; }
          // §10.4 "클러스터에 속한 후보들의 예문을 전부 보존한다" — 멤버 수보다 적으면
          // 어느 멤버의 예문이 버려진 것이다. **이건 MAJOR 가 아니라 CRITICAL 이다.**
          // 흡수된 소수파 멤버의 예문이야말로 §10.6 검수자가 병합을 반증할 유일한 근거이고,
          // 한 번 버려지면 산출만 봐서는 무엇이 사라졌는지 알 방법이 없다(= 조용한 누락).
          // MAJOR 로 두면 exit 0 이라 "✅ 전단사 유지"와 함께 통과해 버린다.
          else if (ex.length < (c.memberKeys ?? []).length) {
            report.push(`[CRITICAL] ${sid} ${key} examples ${ex.length}개 < 멤버 ${(c.memberKeys ?? []).length}개 — 흡수된 멤버의 예문이 누락됐다`);
            issues++; exThin++;
          }
        }

        // §10.5 · §10.6.1 — reviewed 가 있어야 "반증 실패로 유지된 병합"과 "미검수"가 구분된다.
        if (!("reviewed" in c)) {
          report.push(`[MAJOR] ${sid} ${key} reviewed 필드 없음 — 미검수와 검수완료가 구분되지 않는다`); issues++;
        } else if (c.reviewed !== null && !REVIEWED_VALUES.has(c.reviewed as string)) {
          report.push(`[MAJOR] ${sid} ${key} reviewed "${c.reviewed}" 는 §10.5 허용값(null·upheld·split-back) 밖`); issues++;
        }
      }

      // §10.4.2 — 같은 lemma|pos 안에서 클러스터 senseKo 가 겹치면 DB 에서 두 sense 를
      // 구분할 방법이 없다(실측: `spend` 의 시간 클러스터와 돈 클러스터가 둘 다 「쓰다」).
      const kos = (r.clusters ?? []).map((c) => (c.senseKo ?? "").replace(/[~\s·]/g, ""));
      const koDup = [...new Set(kos.filter((x, i) => x && kos.indexOf(x) !== i))];
      if (koDup.length) {
        report.push(`[MAJOR] ${sid} ${key} senseKo 중복 ${koDup.map((x) => `"${x}"`).join(" ")} — §10.4.2(같은 표제어 안에서 구분 불가)`);
        issues++;
      }

      const dup = outKeys.length !== new Set(outKeys).size;
      if (dup) { report.push(`[CRITICAL] ${sid} ${key} 같은 senseKey 가 두 클러스터에 있다`); issues++; }
      for (const k of outKeys) if (!inKeys.has(k)) { report.push(`[CRITICAL] ${sid} ${key} 창작된 senseKey "${k.slice(0, 40)}"`); issues++; }
      for (const k of inKeys) if (!outKeys.includes(k)) { report.push(`[CRITICAL] ${sid} ${key} 누락된 senseKey "${k.slice(0, 40)}"`); issues++; }

      totalIn += inKeys.size;
      totalOut += (r.clusters ?? []).length;
      if ((r.clusters ?? []).length < inKeys.size) merged++;
      ok++;
    }
    for (const k of byLemma.keys()) if (!seen.has(k)) { report.push(`[CRITICAL] ${sid} 표제어 "${k}" 가 산출에 없다`); issues++; }
  }

  for (const line of report.slice(0, 60)) console.log("  " + line);
  if (report.length > 60) console.log(`  … 외 ${report.length - 60}건`);
  console.log("\n=== 4단계 병합 게이트 ===");
  console.log(`  샤드 ${shardIds.length}개 중 산출 ${shardIds.length - missing}개 (미산출 ${missing})`);
  console.log(`  표제어 ${ok}개 · 후보 ${totalIn}개 → 클러스터 ${totalOut}개 (압축 ${totalIn ? (100 * (1 - totalOut / totalIn)).toFixed(1) : 0}%)`);
  console.log(`  실제 병합이 일어난 표제어 ${merged}개 — 적대검수 대상`);
  console.log(`  예문 결손 클러스터 ${exMissing}개 · 멤버보다 예문이 적은 클러스터 ${exThin}개`);
  console.log(`  이슈 ${issues}건`);
  const crit = report.filter((l) => l.startsWith("[CRITICAL]")).length;
  console.log(crit === 0 ? "  ✅ 전단사 유지 — 누락·창작 없음" : `  ❌ critical ${crit}건`);
  process.exit(crit === 0 ? 0 : 1);
}

if (args.includes("--split")) split();
else if (args.includes("--verify")) verify();
else { console.error("usage: --split [--limit=N] | --verify   [--base=DIR]"); process.exit(2); }
