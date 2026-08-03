/**
 * 기출 지문 **대량** 조회 — 린 브리프에 인라인할 지문 데이터를 한 프로세스에서 뽑는다.
 *
 * 왜: 린 브리프는 지문 원문·확정 문장분리·meta 를 프롬프트에 박아 에이전트의 도구 호출을
 *     3.9회로 줄인다(원본 9.9회). 그런데 지문마다 `npx tsx scripts/vocab-passage.ts` 를
 *     부르면 프로세스 기동만으로 1,900건에 1시간이 넘는다. 이 스크립트는 tsx 한 번에 전부 뽑는다.
 *
 * ⚠️ **문장 분리는 `vocab-passage.ts` 와 반드시 같은 경로여야 한다.**
 *    다른 분리기를 쓰면 에이전트가 받은 sentences 와 게이트가 재계산하는 값이 어긋나
 *    불변식 1(문장 재결합 = 원문)이 전량 깨진다. 그래서 둘 다 `splitPassageIntoSentences` 를 쓴다.
 *
 *   npx tsx scripts/vocab-pdata.ts ids.json > pdata.json
 *   npx tsx scripts/vocab-pdata.ts --pending --limit=400 > pdata.json
 */
import fs from "node:fs";
import { splitPassageIntoSentences } from "@/lib/vocab-corpus/sentences";
import PASSAGES from "@/data/exam-passages/passages.json";

type Rec = {
  id: string; year: number; exam: string; board: string; grade?: string;
  typeGroup: string; type: string; qNumbers: number[]; wordCount: number;
  text: string; reconstructionKind: string;
};
const ALL = PASSAGES as unknown as Rec[];
const byId = new Map(ALL.map((p) => [p.id, p]));

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

let ids: string[];
if (args.includes("--pending")) {
  const dir = flag("out") ?? "experiments/vocab-corpus-20260728/raw";
  const done = new Set(
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [],
  );
  const pending = ALL.filter((p) => !done.has(p.id));
  // 학년 비례 배분 — 어느 시점에도 세 학년의 완료율이 같게 유지된다(중간 산출물이 학년별로 쓸 만해진다).
  const limit = Number(flag("limit") ?? String(pending.length));
  const byGrade = new Map<string, string[]>();
  for (const p of pending) {
    const g = p.grade ?? "?";
    if (!byGrade.has(g)) byGrade.set(g, []);
    (byGrade.get(g) as string[]).push(p.id);
  }
  // 학년별 배정량을 먼저 정하고,
  const quota = new Map<string, string[]>();
  for (const g of [...byGrade.keys()].sort()) {
    const bucket = byGrade.get(g) as string[];
    quota.set(g, bucket.slice(0, Math.round((bucket.length / pending.length) * limit)));
  }
  // **학년을 교대로 섞는다.**
  //
  // 【실측 사고 2026-07-30】 처음엔 학년 블록을 그냥 이어붙였다(고1 전부 → 고2 전부 → 고3 전부).
  //   워크플로는 IDS 순서대로 처리하므로, 320건 트랜치의 첫 완료 20건이 **전부 고1** 이었다.
  //   주간 쿼터로 트랜치가 중간에 죽는 게 이제 상시 상황인데, 그러면 그 트랜치는 고1 만 남는다.
  //   → `vocab-passage.ts --stratify` 에서 이미 같은 결함을 겪었다(사전순 정렬로 고1 24건 편중).
  //   비례 배분은 **끝까지 돌았을 때만** 비례다. 중간에 죽어도 비례이려면 순서를 교대시켜야 한다.
  ids = [];
  const grades = [...quota.keys()];
  for (let i = 0; ids.length < limit; i++) {
    let added = false;
    for (const g of grades) {
      const b = quota.get(g) as string[];
      if (b[i] !== undefined) { ids.push(b[i]); added = true; }
    }
    if (!added) break;
  }
} else {
  const listPath = args.find((a) => !a.startsWith("--"));
  if (!listPath) { console.error("usage: vocab-pdata.ts <ids.json> | --pending [--limit=N]"); process.exit(2); }
  ids = JSON.parse(fs.readFileSync(listPath, "utf8"));
}

const out: Record<string, unknown> = {};
const missing: string[] = [];
for (const id of ids) {
  const p = byId.get(id);
  if (!p) { missing.push(id); continue; }
  // ⚠️ `text` 는 **일부러 넣지 않는다.** `sentences[].en` 을 순서대로 이어붙인 것과 같아서
  //    중복이고, 이 데이터는 워크플로 스크립트에 인라인되므로 512KB 파일 한도를 그대로 먹는다.
  //    (실측: text 포함 399건 = 985KB → 한도 초과로 발사 거부. 제외하면 절반이 된다.)
  out[id] = {
    meta: {
      grade: p.grade, year: p.year, exam: p.exam,
      typeGroup: p.typeGroup, wordCount: p.wordCount,
    },
    // vocab-passage.ts 와 **같은** 분리기. 여기서 갈리면 불변식 1 이 전량 깨진다.
    sentences: splitPassageIntoSentences(p.text).map((en, i) => ({ i, en })),
  };
}

if (missing.length) { console.error(`⚠️ 코퍼스에 없는 ID ${missing.length}건: ${missing.slice(0, 5).join(", ")}`); process.exit(1); }
process.stderr.write(`${Object.keys(out).length}건 · ${(JSON.stringify(out).length / 1024).toFixed(0)}KB\n`);
process.stdout.write(JSON.stringify(out));
