/**
 * sense 레지스트리 회귀 하네스 — docs/vocab-corpus-spec.md §11 규범이 코드에서
 * 실제로 지켜지는지 16개 명제로 확인한다. DB 접속 없음 · 외부 API 없음.
 *
 *   npx tsx scripts/verify-vocab-sense-registry.ts     (실패 시 exit 1)
 *
 * 여기서 지키는 것:
 *   · 정의문이 그대로면 같은 senseId
 *   · 정의문이 바뀌어도 **출처가 1:1 이면** 승계 (숙달도가 살아남는 지점)
 *   · 병합·분할 의심이면 **잇지 않는다** — 새 id 를 발급하고 매핑은 만들지 않는다
 *   · 사라진 sense 는 지우지 않고 retiredIn 만 찍으며, 돌아오면 같은 id 로 복귀
 *   · 내용주소가 충돌하면 결정적으로 재해시해 유일성을 보장
 * 이 중 하나라도 깨지면 학생 숙달도가 엉뚱한 뜻에 붙는다. 고치기 전에 이걸 먼저 돌려라.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { SenseRegistry, loadRegistry, saveRegistry, memberKey } from "./vocab-sense-registry";

const sha1 = (s: string) => crypto.createHash("sha1").update(s, "utf8").digest("hex");
const US = "\x1f";
const normSense = (s: string) => s.toLowerCase().replace(/^(to|a|an|the)\s+/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const senseIdOf = (lid: string, key: string, attempt = 1) =>
  `${lid}:${sha1(attempt === 1 ? normSense(key) : `${normSense(key)}${US}${attempt}`).slice(0, 8)}`;

const LID = "aaaabbbbccccdddd";
const mk = (key: string, members: string[]) => ({ contentId: senseIdOf(LID, key), senseKey: key, members });

function run(reg: SenseRegistry, senses: { contentId: string; senseKey: string; members: string[] }[]) {
  return reg.resolveLemma(LID, "run", "verb", senses, (i, a) => senseIdOf(LID, senses[i].senseKey, a));
}

const P = (n: number) => memberKey(`p${n}`, 0, "run");
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}  ${extra}`); } };

// ── 1세대 ────────────────────────────────────────────────────────────────────
const g1 = new SenseRegistry(null);
const s1 = [mk("move fast on foot", [P(1), P(2)]), mk("operate a machine", [P(3), P(4)])];
const a1 = run(g1, s1);
g1.finalize("v1");
t("1세대는 전건 신규", a1.every((a) => a.how === "new"), JSON.stringify(a1));
const idMove = a1[0].senseId, idOperate = a1[1].senseId;

const tmp = `${process.env.TEMP}/reg-test.json`;
saveRegistry(tmp, g1.reg);

// ── 2세대 A: 정의문 그대로 + 예문 추가 → content 승계 ────────────────────────
{
  const g = new SenseRegistry(loadRegistry(tmp));
  const a = run(g, [mk("move fast on foot", [P(1), P(2), P(9)]), mk("operate a machine", [P(3), P(4)])]);
  t("정의문 동일 → 같은 senseId", a[0].senseId === idMove && a[1].senseId === idOperate);
  t("how=content", a.every((x) => x.how === "content"));
}

// ── 2세대 B: 정의문이 바뀌었지만 출처 1:1 → source 승계 ──────────────────────
{
  const g = new SenseRegistry(loadRegistry(tmp));
  const a = run(g, [mk("travel rapidly by foot, at speed", [P(1), P(2)]), mk("cause a device to function", [P(3), P(4)])]);
  t("정의문이 바뀌어도 출처 1:1 이면 승계", a[0].senseId === idMove && a[1].senseId === idOperate, JSON.stringify(a));
  t("how=source", a.every((x) => x.how === "source"), JSON.stringify(a));
}

// ── 2세대 C: 병합(옛 2개 → 새 1개) → 잇지 않는다 ─────────────────────────────
{
  const g = new SenseRegistry(loadRegistry(tmp));
  const a = run(g, [mk("move or operate", [P(1), P(2), P(3), P(4)])]);
  t("병합 의심 → 승계 안 함(새 id)", a[0].senseId !== idMove && a[0].senseId !== idOperate, JSON.stringify(a));
  t("ambiguousMerge 계수", g.stats.ambiguousMerge === 1, String(g.stats.ambiguousMerge));
  const fin = g.finalize("v2");
  t("옛 sense 2건은 은퇴(행 유지)", fin.newlyRetired === 2 && g.reg.senses.length === 3, `retired=${fin.newlyRetired} rows=${g.reg.senses.length}`);
}

// ── 2세대 D: 분할(옛 1개 → 새 2개) → 둘 다 잇지 않는다 ───────────────────────
{
  const g = new SenseRegistry(loadRegistry(tmp));
  const a = run(g, [mk("move fast, sprint", [P(1)]), mk("move fast, jog", [P(2)]), mk("operate a machine", [P(3), P(4)])]);
  t("분할 의심 → 둘 다 새 id", a[0].senseId !== idMove && a[1].senseId !== idMove, JSON.stringify(a.map((x) => x.how)));
  t("ambiguousSplit 계수 2", g.stats.ambiguousSplit === 2, String(g.stats.ambiguousSplit));
  t("겹치지 않는 sense 는 정상 승계", a[2].senseId === idOperate && a[2].how === "content");
}

// ── 2세대 E: 완전 신규(겹침 0) → 새 id ───────────────────────────────────────
{
  const g = new SenseRegistry(loadRegistry(tmp));
  const a = run(g, [mk("move fast on foot", [P(1), P(2)]), mk("operate a machine", [P(3), P(4)]), mk("a sequence of scores", [P(7)])]);
  t("신규 sense 는 새 id", a[2].how === "new" && ![idMove, idOperate].includes(a[2].senseId));
}

// ── 2세대 F: 내용주소 충돌 → 결정적 재해시, 절대 겹치지 않음 ─────────────────
{
  const g = new SenseRegistry(loadRegistry(tmp));
  // 새 sense 두 개가 같은 정의문(정규화 후 동일)을 갖는 극단 케이스는 적재기가 앞단에서
  // 걸러내지만, 레지스트리 자체도 충돌을 견뎌야 한다.
  const dup = mk("move fast on foot", [P(50)]);
  const a = run(g, [mk("move fast on foot", [P(1)]), { ...dup }]);
  t("충돌 시 재해시로 유일성 확보", a[0].senseId !== a[1].senseId, JSON.stringify(a));
  t("how=collision", a[1].how === "collision", a[1].how);
}

// ── 은퇴 후 부활 ─────────────────────────────────────────────────────────────
{
  const g = new SenseRegistry(loadRegistry(tmp));
  run(g, [mk("move fast on foot", [P(1), P(2)])]);
  g.finalize("v2");
  const p2 = `${tmp}.2`;
  saveRegistry(p2, g.reg);
  const back = loadRegistry(p2)!;
  t("사라진 sense 는 삭제되지 않고 retiredIn 만", back.senses.length === 2 && back.senses.find((e) => e.senseId === idOperate)?.retiredIn === "v2");
  const g3 = new SenseRegistry(back);
  const a3 = run(g3, [mk("move fast on foot", [P(1)]), mk("operate a machine", [P(3)])]);
  g3.finalize("v3");
  t("부활하면 같은 id 로 돌아오고 retiredIn 해제", a3[1].senseId === idOperate && g3.reg.senses.find((e) => e.senseId === idOperate)?.retiredIn === null);
  fs.rmSync(p2, { force: true });
}
fs.rmSync(tmp, { force: true });

console.log(`\n통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
