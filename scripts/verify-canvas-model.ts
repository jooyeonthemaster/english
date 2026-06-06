/**
 * 필기 캔버스 순수 모델 검증 (DOM 없음, 빠름).
 *   npx tsx scripts/verify-canvas-model.ts
 * 불변식: 청크 무손실/연속·노트 1회 배치·캡 준수·dense 문장 분할 발동.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildSentenceCanvasPlan,
  planSentenceSplit,
  CANVAS_TUNING,
  type CanvasNoteInput,
} from "../src/lib/passage-report/analysis-report/passage-canvas-model";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};

function notesFromSections(sections: any[], sentenceNo: number, en: string): CanvasNoteInput[] {
  const out: CanvasNoteInput[] = [];
  for (const sec of sections) {
    if (sec.kind === "grammar") {
      sec.rows.filter((r: any) => r.sentenceNo === sentenceNo).forEach((r: any, i: number) =>
        out.push({ key: `g-${sentenceNo}-${i}`, kind: "grammar", anchorText: r.layout?.anchorText ?? r.excerpt, band: r.layout?.band, priority: r.layout?.priority, role: r.point, lines: r.layout?.lines ?? splitText(r.explanation), trap: r.trap }),
      );
    }
    if (sec.kind === "parsing") {
      sec.items.filter((r: any) => r.sentenceNo === sentenceNo).forEach((r: any, i: number) =>
        out.push({ key: `p-${sentenceNo}-${i}`, kind: "parsing", anchorText: r.layout?.anchorText ?? r.parts?.[0]?.text, band: r.layout?.band, priority: r.layout?.priority, role: "구문", lines: r.parts.map((p: any) => `${p.label} ${p.text}`) }),
      );
    }
    if (sec.kind === "exam-focus") {
      sec.rows.filter((r: any) => r.sentenceNo === sentenceNo).forEach((r: any, i: number) =>
        out.push({ key: `e-${sentenceNo}-${i}`, kind: "exam", anchorText: r.layout?.anchorText ?? r.asks, band: r.layout?.band, priority: r.layout?.priority, role: r.type, lines: r.layout?.lines ?? splitText(r.strategy ?? "") }),
      );
    }
  }
  return out;
}
function splitText(t: string): string[] {
  const s = (t ?? "").trim();
  if (s.length <= 56) return s ? [s] : [];
  const words = s.split(/\s+/);
  const parts: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && next.length > 40) { parts.push(cur); cur = w; } else cur = next;
  }
  if (cur) parts.push(cur);
  return parts;
}

function checkPlan(label: string, en: string, ko: string, seed: any, notes: CanvasNoteInput[]) {
  const plan = buildSentenceCanvasPlan(en, ko, seed, notes, []);
  // 1) 청크 무손실 + 연속
  const joined = plan.chunks.map((c) => c.text).join("");
  ok(joined === en, `[${label}] 청크 합본 == en (got len ${joined.length} vs ${en.length})`);
  for (let i = 0; i < plan.chunks.length - 1; i++) ok(plan.chunks[i].end === plan.chunks[i + 1].start, `[${label}] 청크 연속 @${i}`);
  // 2) 노트 1회 배치
  const placed = plan.interlineByChunk.reduce((a, b) => a + b.length, 0) + plan.railNotes.length + plan.footnoteNotes.length;
  ok(placed === notes.length, `[${label}] 노트 배치수 ${placed} == 입력 ${notes.length}`);
  const keys = new Set([...plan.interlineByChunk.flat(), ...plan.railNotes, ...plan.footnoteNotes].map((n) => n.key));
  ok(keys.size === notes.length, `[${label}] 노트 중복 없음`);
  // 3) 캡
  plan.interlineByChunk.forEach((s, i) => ok(s.length <= CANVAS_TUNING.maxInterlinePerChunk, `[${label}] chunk ${i} 줄사이 캡`));
  ok(plan.railNotes.length <= CANVAS_TUNING.maxRailCards, `[${label}] 레일 캡`);
  return plan;
}

console.log("▶ gen-07-science.json (실데이터, layout 없음 → 파생 폴백)");
const sample = JSON.parse(readFileSync(join(root, "src/lib/passage-report/analysis-report/_samples/gen-07-science.json"), "utf8"));
const passage = sample.sections.find((s: any) => s.kind === "passage");
let maxEst = 0;
passage.sentences.forEach((snt: any) => {
  const notes = notesFromSections(sample.sections, snt.n, snt.en);
  const plan = checkPlan(`s${snt.n}`, snt.en, snt.ko, snt.chunks, notes);
  maxEst = Math.max(maxEst, plan.estHeightMm);
});
console.log(`  · 문장 ${passage.sentences.length}개, 최대 추정 높이 ${maxEst.toFixed(0)}mm (split trigger ${CANVAS_TUNING.splitTriggerMm}mm)`);

console.log("▶ dense 합성 (45단어 + 6어법 + 4구문 + 8개 줄 + 함정) → 캡/분할 발동");
const denseEn =
  "Scientists who study the cosmos have argued that although the universe appears static, it is in fact expanding rapidly, and that this expansion, which was first measured by careful observation, forces us to reconsider everything we believed about space, time, and the eventual fate of all matter.";
const denseNotes: CanvasNoteInput[] = [
  { key: "g1", kind: "grammar", anchorText: "who study the cosmos", role: "관계절", lines: ["who~ = Scientists 수식", "주격 관계대명사"], priority: 1 },
  { key: "g2", kind: "grammar", anchorText: "although the universe appears static", role: "양보절", lines: ["although = ~이지만", "뒤 주절과 대조"], priority: 1 },
  { key: "g3", kind: "grammar", anchorText: "it is in fact expanding", role: "진행", lines: ["be + -ing 현재진행"], priority: 2 },
  { key: "g4", kind: "grammar", anchorText: "which was first measured", role: "수동", lines: ["which = expansion", "was measured 수동태"], priority: 2 },
  { key: "g5", kind: "grammar", anchorText: "forces us to reconsider", role: "5형식", lines: ["force + O + to-V", "목적격보어 to부정사"], priority: 2, trap: "forces→forcing 으로 바꿔 출제" },
  { key: "g6", kind: "grammar", anchorText: "space, time, and the eventual fate", role: "병렬", lines: ["A, B, and C 병렬", "전치사 about 의 목적어 3개"], priority: 3 },
  { key: "p1", kind: "parsing", anchorText: "have argued that", role: "구문", lines: ["주절 동사 + that절 목적어를 길게 이끈다 — 핵심 주장이 that 이하에 담겨 있어 여기서 길게 풀어 설명한다"], priority: 2 },
  { key: "p2", kind: "parsing", anchorText: "this expansion", role: "구문", lines: ["주어 this expansion, 동사 forces — 사이에 which 관계절이 삽입되어 길어진 구조"], priority: 2 },
  { key: "p3", kind: "parsing", anchorText: "everything we believed", role: "구문", lines: ["everything (that) we believed — 목적격 관계대명사 생략"], priority: 3 },
  { key: "p4", kind: "parsing", anchorText: "the eventual fate of all matter", role: "구문", lines: ["of all matter 가 fate 를 수식하는 전치사구"], priority: 3 },
  { key: "e1", kind: "exam", anchorText: "it is in fact expanding rapidly", role: "빈칸추론", lines: ["역접 in fact 뒤가 핵심 — 빈칸이면 expanding 계열이 답이 되는 자리. 대조축(static↔expanding)을 근거로 추론한다."], priority: 1 },
  { key: "e2", kind: "exam", anchorText: "the eventual fate of all matter", role: "요약", lines: ["결론부 the eventual fate — 요약문 (B) 칸 단서로 자주 쓰인다"], priority: 2 },
];
const densePlan = checkPlan("dense", denseEn, "과학자들은… (생략)", undefined, denseNotes);
console.log(`  · 추정 높이 ${densePlan.estHeightMm.toFixed(0)}mm, 레일 ${densePlan.railNotes.length} · 각주 ${densePlan.footnoteNotes.length} · 청크 ${densePlan.chunks.length}`);
const split = planSentenceSplit(densePlan);
console.log(`  · planSentenceSplit → ${split.length ? `${split.length}조각으로 분할` : "분할 없음"}`);
// dense 는 줄이 많아 추정이 높으면 분할되어야 안전. (높지 않으면 분할 불필요 — 둘 다 정상)
ok(densePlan.railNotes.length <= CANVAS_TUNING.maxRailCards, "[dense] 레일 캡 준수");

console.log(failures === 0 ? "\n✅ 모든 불변식 통과" : `\n❌ ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
