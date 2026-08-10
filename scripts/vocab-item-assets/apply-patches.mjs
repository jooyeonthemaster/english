// ============================================================================
// 문항 자산 캠페인 — Claude 레인 패치 적용기
//
// 의미 스윕 레인(에이전트 판정)이 산출한 패치를 결정론 적용한다.
// 기계 게이트가 못 보는 지대(DB 뜻 커버리지 밖 동의어: mark=적다, aged=오래된)와
// 스템 자기완결성(잘린 지시어)은 판정만 에이전트가 하고, 변경은 이 스크립트가 한다.
//
//   node scripts/vocab-item-assets/apply-patches.mjs --patches <patches.json> [--dir packs]
//
// 패치 형식: [{pack, senseId, wcDrop:[en], wcAdd:[{en,ko}], stemDropExampleIds:[id],
//             stemUseExampleIds:[id], note}]
// 적용 후 반드시 gate.mjs 재검 — 패치가 규칙을 어기면 게이트가 잡는다.
// ============================================================================
import fs from "fs";
import path from "path";
import { prisma, buildDossier } from "./dossier.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DIR = opt("dir", "experiments/vocab-item-assets/packs");
const PATCHES = opt("patches");
if (!PATCHES) { console.error("--patches <file> 필수"); process.exit(1); }

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (s, flags = "i") => new RegExp(`(?<![A-Za-z])${esc(String(s).trim())}(?![A-Za-z])`, flags);

const patches = JSON.parse(fs.readFileSync(PATCHES, "utf8"));
const byPack = new Map();
for (const p of patches) {
  if (!byPack.has(p.pack)) byPack.set(p.pack, []);
  byPack.get(p.pack).push(p);
}

const stats = { wcDrop: 0, wcAdd: 0, mcDrop: 0, stemDrop: 0, stemAdd: 0, packs: 0, miss: 0 };

for (const [packName, plist] of byPack) {
  const file = path.join(DIR, packName);
  if (!fs.existsSync(file)) { stats.miss++; continue; }
  const pack = JSON.parse(fs.readFileSync(file, "utf8"));
  const dossier = await buildDossier(pack.spelling);
  const dsById = new Map((dossier?.variants ?? []).flatMap((v) => v.senses.map((s) => [s.senseId, s])));
  let changed = false;

  for (const patch of plist) {
    for (const v of pack.variants ?? []) for (const s of v.senses ?? []) {
      if (s.senseId !== patch.senseId) continue;
      const ds = dsById.get(s.senseId);

      // MC 드롭(한국어 동의 오답 — '~에 대해'↔'~와 관련해' 류) — 백필은 repair.mjs 몫
      const mcDrop = new Set((patch.mcDrop ?? []).map((k) => String(k).trim()));
      if (mcDrop.size) {
        for (const set of s.meaningChoiceSets ?? []) {
          const before = set.distractors.length;
          set.distractors = set.distractors.filter((d) => !mcDrop.has(String(d.ko).trim()));
          stats.mcDrop += before - set.distractors.length;
          changed ||= before !== set.distractors.length;
        }
      }

      // WC 교체
      const dropSet = new Set((patch.wcDrop ?? []).map((e) => e.toLowerCase()));
      if (dropSet.size) {
        const before = s.wordChoiceDistractors.length;
        s.wordChoiceDistractors = s.wordChoiceDistractors.filter((d) => !dropSet.has(d.en.trim().toLowerCase()));
        stats.wcDrop += before - s.wordChoiceDistractors.length;
        changed ||= before !== s.wordChoiceDistractors.length;
      }
      const usedEn = new Set(s.wordChoiceDistractors.map((d) => d.en.toLowerCase()));
      for (const add of patch.wcAdd ?? []) {
        if (s.wordChoiceDistractors.length >= 3) break;
        const en = String(add.en ?? "").trim();
        if (!en || usedEn.has(en.toLowerCase()) || en.toLowerCase() === pack.spelling.toLowerCase()) continue;
        // 안전: 교체 후보는 그 sense의 닫힌 풀에 있어야 한다(에이전트 창작 차단)
        const inPool = (ds?.wordChoiceCandidates ?? []).some((c) => c.en.toLowerCase() === en.toLowerCase());
        if (!inPool) continue;
        usedEn.add(en.toLowerCase());
        s.wordChoiceDistractors.push({
          en,
          whyWrong: `'${en}'은(는) '${add.ko}'라는 뜻으로, 이 문항의 뜻('${ds?.senseKo ?? ""}')과는 다른 단어입니다.`,
        });
        stats.wcAdd++; changed = true;
      }

      // 스템 교체
      const sDrop = new Set(patch.stemDropExampleIds ?? []);
      if (sDrop.size) {
        const keep = s.stems.filter((st) => !sDrop.has(st.exampleId));
        // contextRequired면 최소 1개 유지 — 대체 없이 0이 되면 드롭 취소
        const willAdd = (patch.stemUseExampleIds ?? []).length;
        if (!(s.contextRequired && keep.length + willAdd === 0)) {
          stats.stemDrop += s.stems.length - keep.length;
          changed ||= keep.length !== s.stems.length;
          s.stems = keep;
        }
      }
      const haveEx = new Set(s.stems.map((st) => st.exampleId));
      for (const exId of patch.stemUseExampleIds ?? []) {
        if (s.stems.length >= 2 || haveEx.has(exId)) continue;
        const ex = (ds?.examples ?? []).find((e) => e.exampleId === exId);
        const surf = String(ex?.surface ?? "").trim();
        if (!ex || !surf || !wordRe(surf).test(ex.en)) continue;
        s.stems.push({ exampleId: exId, text: ex.en.replace(wordRe(surf, "gi"), "____"), answerSurface: surf });
        haveEx.add(exId);
        stats.stemAdd++; changed = true;
      }
    }
  }
  if (changed) { fs.writeFileSync(file, JSON.stringify(pack, null, 1)); stats.packs++; }
}

console.log(`패치 적용: ${stats.packs}팩 수정 · WC 드롭 ${stats.wcDrop}/추가 ${stats.wcAdd} · 스템 드롭 ${stats.stemDrop}/추가 ${stats.stemAdd} · 대상 누락 ${stats.miss}`);
await prisma.$disconnect();
