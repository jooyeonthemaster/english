/**
 * senseId 안정성 실측 — 재빌드가 학생 숙달도를 얼마나 살려 내는가.
 * DB 접속 없음 · 외부 API 없음 · 어떤 파일도 쓰지 않는다(임시파일은 지운다).
 *
 *   npx tsx scripts/verify-vocab-registry-stability.ts [lemmas.json 경로]
 *
 * 1세대 발급 → 저장 → 2세대를 4가지 시나리오로 돌려 senseId 유지율을 잰다:
 *   same          동일 코퍼스 재빌드
 *   reword        정의문만 전건 재작성(출처 그대로) — 옛 내용주소 방식이 무너지는 지점
 *   merge         다의어를 1뜻으로 접되 정의문은 유지
 *   merge-reword  4단계 LLM 병합의 실제 모습(뜻도 접히고 정의문도 새로 쓰임)
 *
 * ⚠️ scripts/vocab-db-load.ts 의 shape() 가 하는 senseId 계산을 **복제**한다.
 *    해시 규칙(normSense·senseIdOf·memberKey)이 바뀌면 여기도 같이 고쳐야 한다.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { SenseRegistry, loadRegistry, saveRegistry, memberKey, type NewSense } from "./vocab-sense-registry";

const sha1 = (s: string) => crypto.createHash("sha1").update(s, "utf8").digest("hex");
const US = "\x1f";
const normSense = (s: string) => s.toLowerCase().replace(/^(to|a|an|the)\s+/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const lemmaIdOf = (l: string, p: string) => sha1(`${l.trim().toLowerCase()}${US}${p}`).slice(0, 16);
const senseIdOf = (lid: string, key: string, attempt = 1) =>
  `${lid}:${sha1(attempt === 1 ? normSense(key) : `${normSense(key)}${US}${attempt}`).slice(0, 8)}`;

type Ex = { passageId: string; sentenceIndex: number; surface: string };
type S = { senseKey: string; examples?: Ex[] };
type L = { lemma: string; pos: string; senses: S[] };

const file = process.argv[2] ?? "experiments/vocab-corpus-20260728/build/lemmas.json";
const lemmas = (JSON.parse(fs.readFileSync(file, "utf8")) as { lemmas: L[] }).lemmas;

type Mode = "same" | "reword" | "merge" | "merge-reword";
function pass(reg: SenseRegistry, version: string, mode: Mode) {
  const idsOf = new Map<string, string[]>();
  for (const L of lemmas) {
    const lemmaId = lemmaIdOf(L.lemma, L.pos);
    const seen = new Set<string>();
    let list = L.senses;
    // 4단계 병합 시늉 — sense 가 2개 이상인 표제어를 하나로 접는다.
    if (mode.startsWith("merge") && L.senses.length > 1) {
      list = [{ senseKey: L.senses[0].senseKey, examples: L.senses.flatMap((s) => s.examples ?? []) }];
    }
    const pending: { key: string; members: string[] }[] = [];
    for (const S of list) {
      const kn = normSense(S.senseKey);
      if (!kn || seen.has(kn)) continue;
      seen.add(kn);
      // reword — 정의문만 바꾼다(출처는 그대로). 옛 방식이라면 여기서 전건 id 가 바뀐다.
      const key = mode.includes("reword") ? `in other words, ${S.senseKey} (rev)` : S.senseKey;
      pending.push({ key, members: (S.examples ?? []).map((e) => memberKey(e.passageId, e.sentenceIndex, e.surface)) });
    }
    if (!pending.length) continue;
    const payload: NewSense[] = pending.map((p) => ({ contentId: senseIdOf(lemmaId, p.key), senseKey: p.key, members: p.members }));
    const a = reg.resolveLemma(lemmaId, L.lemma, L.pos, payload, (i, att) => senseIdOf(lemmaId, pending[i].key, att));
    idsOf.set(lemmaId, a.map((x) => x.senseId));
  }
  const fin = reg.finalize(version);
  return { idsOf, fin };
}

const tmp = `${process.env.TEMP}/vocab-sense-registry-sim.json`;
const g1 = new SenseRegistry(null);
const r1 = pass(g1, "v1", "same");
saveRegistry(tmp, g1.reg);
console.log(`1세대  신규 ${g1.stats.new} · 재해시 ${g1.stats.collision} · 항목 ${g1.size} · 파일 ${(fs.statSync(tmp).size / 1048576).toFixed(1)}MB`);

const show = (tag: string, g: SenseRegistry, kept: number, total: number) =>
  console.log(`${tag}  content ${g.stats.content} · source ${g.stats.source} · 신규 ${g.stats.new} · 재해시 ${g.stats.collision}` +
    ` · 병합의심 ${g.stats.ambiguousMerge} · 분할의심 ${g.stats.ambiguousSplit}  → id 유지 ${kept}/${total} (${((kept / total) * 100).toFixed(2)}%)`);

for (const mode of ["same", "reword", "merge", "merge-reword"] as Mode[]) {
  const g = new SenseRegistry(loadRegistry(tmp));
  const r = pass(g, "v2", mode);
  let kept = 0, total = 0;
  for (const [lid, ids] of r.idsOf) {
    const before = r1.idsOf.get(lid) ?? [];
    for (const id of ids) { total++; if (before.includes(id)) kept++; }
  }
  show(`2세대(${mode})`.padEnd(14), g, kept, total);
  console.log(`               레지스트리 ${g.size}건 · 새로 은퇴 ${g.stats ? r.fin.newlyRetired : 0}`);
}
fs.rmSync(tmp, { force: true });
