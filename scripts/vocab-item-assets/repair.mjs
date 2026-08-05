// ============================================================================
// 문항 자산 캠페인 — 결정론 교정기 (재호출 0원)
//
// 배경: 규범 3-1을 넣고도 luna 재롤이 비수렴(사이클 168→180 불합격 팩).
// "그럴듯한 오답 = 비슷한 뜻"이라는 모델 prior는 프롬프트로 안 죽는다.
// 캠페인 교훈 "결과 컨테이너 오류는 판정 오류가 아니다 — 결정론 교정"의 확장:
// 게이트와 동일한 판정으로 위반 요소만 도려내고, 도시에의 안전 풀에서 백필한다.
//
//   node scripts/vocab-item-assets/repair.mjs [--dir experiments/vocab-item-assets/packs]
//
// 게이트 critical과 1:1 대응(판정 로직 사본 금지 — dossier.mjs 공유 헬퍼 사용):
//   WC_EQUALS/STEM_SHARE/DB_SYNONYM/POS_MISMATCH → 드롭 + wordChoiceCandidates 백필
//   MC_EQUALS/ALT(n≥2)/CAND_COLLISION(n≥2)/DUP/COUNT/FORM_* → 드롭 + distractorCandidates 백필·스왑
//   HINT_LEAK_LEMMA → 표제어 마스킹, HINT_LEAK_KO·HINT_BANNED → 드롭 + 연어 백필
//   STEM_* → 예문 surface로 스템 재조립(원문 마스킹), 불가 시 드롭
//   TRAP_* → 드롭, SPELL_PHRASE → false 강제, SENSE_MISSING → sense 제거
// ============================================================================
import fs from "fs";
import path from "path";
import {
  prisma, buildDossier, normKo, fuzzyKo, stemShare, formSig,
} from "./dossier.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DIR = opt("dir", "experiments/vocab-item-assets/packs");

const fixes = {};
const FIX = (code) => { fixes[code] = (fixes[code] ?? 0) + 1; };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (s, flags = "i") => new RegExp(`(?<![A-Za-z])${esc(String(s).trim())}(?![A-Za-z])`, flags);

/** 팩에 실존하는 WC 오답 영단어들의 전 뜻 역조회 — 게이트 WC_DB_SYNONYM과 동일 원천. */
async function glossLookup(ens) {
  const rows = ens.length ? await prisma.vocabDrillSense.findMany({
    where: { lemma: { in: ens }, retiredAt: null },
    select: { lemma: true, pos: true, senseKo: true, senseKoCandidates: true },
  }) : [];
  const glossByEn = new Map(), posByEn = new Map();
  for (const r of rows) {
    const key = r.lemma.toLowerCase();
    if (!glossByEn.has(key)) { glossByEn.set(key, new Set()); posByEn.set(key, new Set()); }
    posByEn.get(key).add(r.pos);
    for (const c of [r.senseKo, ...(Array.isArray(r.senseKoCandidates) ? r.senseKoCandidates : [])]) {
      const ko = typeof c === "string" ? c : c?.ko;
      if (ko) glossByEn.get(key).add(normKo(ko));
    }
  }
  return { glossByEn, posByEn };
}

function repairSense(pack, variant, s, ds, lookups) {
  const spelling = pack.spelling;
  const { glossByEn, posByEn } = lookups;
  const answerKey = normKo(ds.senseKo);
  // 대안 표기 n값(게이트와 동일 임계: n≥2만 확정 정답 표기)
  const altN = new Map();
  for (const c of Array.isArray(ds.senseKoCandidates) ? ds.senseKoCandidates : []) {
    const ko = typeof c === "string" ? c : c?.ko;
    const n = typeof c === "object" && c?.n ? Number(c.n) : 1;
    if (!ko) continue;
    const k = normKo(ko);
    altN.set(k, Math.max(altN.get(k) ?? 0, n));
  }
  const bannedAll = new Set([answerKey, ...altN.keys()]);
  const fuzzyBanned = new Map([[fuzzyKo(ds.senseKo), 99]]);
  for (const [k, n] of altN) {
    const fk = fuzzyKo(k);
    if (fk.length >= 2) fuzzyBanned.set(fk, Math.max(fuzzyBanned.get(fk) ?? 0, n));
  }

  // whyWrong 자인 스캔 — luna가 "오답으로 못 쓴다"고 자백한 슬롯을 그대로 출하한 실측
  // (develop turn/evolve). 수동검토 82건 중 77건이 진짜 복수정답이라 n=1 표기도 전부 드롭.
  const confession = /(오답으로 (사용할 수 없|쓸 수 없)|정답으로 성립|정답 표기와 겹|정답 표현|배제되어야|bannedKo|사실상 (같|동일)|정답과 (같|동일|겹))/;

  // ── WC: 드롭 + 닫힌 풀 백필 ──
  const usedEn = new Set();
  const keptWc = [];
  for (const d of s.wordChoiceDistractors ?? []) {
    const en = String(d.en ?? "").trim().toLowerCase();
    let drop = null;
    if (!en || usedEn.has(en)) drop = "WC_DUP";
    else if (en === spelling.toLowerCase()) drop = "WC_EQUALS_ANSWER";
    else if (stemShare(en, spelling)) drop = "WC_STEM_SHARE";
    else if (confession.test(String(d.whyWrong ?? ""))) drop = "WC_CONFESSION";
    else {
      const glosses = glossByEn.get(en);
      if (glosses && [...glosses].some((g) => bannedAll.has(g))) drop = "WC_DB_SYNONYM";
      else {
        const poses = posByEn.get(en);
        if (poses && !poses.has(variant.pos)) drop = "WC_POS_MISMATCH";
      }
    }
    if (drop) { FIX(drop); continue; }
    usedEn.add(en);
    keptWc.push(d);
  }
  for (const c of ds.wordChoiceCandidates ?? []) {
    if (keptWc.length >= 3) break;
    const en = c.en.toLowerCase();
    if (usedEn.has(en)) continue;
    usedEn.add(en);
    keptWc.push({
      en: c.en,
      whyWrong: `'${c.en}'은(는) '${c.ko}'라는 뜻으로, 이 문항의 뜻('${ds.senseKo}')과는 다른 단어입니다.`,
    });
    FIX("WC_BACKFILL");
  }
  s.wordChoiceDistractors = keptWc;

  // ── MC: 드롭 + 후보 백필 + 형태 스왑 ──
  const aSig = formSig(ds.senseKo);
  const candQueue = (ds.distractorCandidates ?? []).filter((c) => {
    const k = normKo(c.senseKo);
    if (bannedAll.has(k)) return false;
    const fk = fuzzyKo(c.senseKo);
    if (fk.length >= 2 && (fuzzyBanned.get(fk) ?? 0) >= 1) return false;
    return true;
  }).sort((a, b) =>
    Math.abs(a.senseKo.length - ds.senseKo.length) - Math.abs(b.senseKo.length - ds.senseKo.length));
  let qi = 0;
  const nextCand = (usedKeys, pred = () => true) => {
    for (; qi < candQueue.length; qi++) {
      const c = candQueue[qi];
      const k = normKo(c.senseKo);
      if (usedKeys.has(k) || !pred(c)) continue;
      qi++;
      return c;
    }
    return null;
  };
  const mkDistractor = (c) => ({
    ko: c.senseKo,
    whyPlausible: "같은 품사·같은 형태 급의 실제 어휘 뜻이라 형태 단서로 소거되지 않는다.",
    whyWrong: `'${c.senseKo}'는 다른 단어(${c.lemma})의 뜻입니다. '${spelling}'의 이 뜻은 '${ds.senseKo}'입니다.`,
  });
  s.meaningChoiceSets = s.meaningChoiceSets ?? [];
  for (const set of s.meaningChoiceSets) {
    const seen = new Set();
    const kept = [];
    for (const d of set.distractors ?? []) {
      const k = normKo(d.ko);
      let drop = null;
      if (!k || seen.has(k)) drop = "MC_DUP";
      else if (k === answerKey) drop = "MC_EQUALS_ANSWER";
      else if ((altN.get(k) ?? 0) >= 1) drop = "MC_ALT_ANSWER";
      else if (confession.test(String(d.whyWrong ?? "") + String(d.whyPlausible ?? ""))) drop = "MC_CONFESSION";
      else {
        const fk = fuzzyKo(d.ko);
        if (fk.length >= 2 && (fuzzyBanned.get(fk) ?? 0) >= 1) drop = "MC_CAND_COLLISION";
      }
      if (drop) { FIX(drop); continue; }
      seen.add(k);
      kept.push(d);
    }
    while (kept.length < 3) {
      const c = nextCand(seen);
      if (!c) break;
      seen.add(normKo(c.senseKo));
      kept.push(mkDistractor(c));
      FIX("MC_BACKFILL");
    }
    // 형태 유일 정답 스왑 — 후보는 컴파일 시점에 형태 정합이 보장돼 있다
    if (kept.length === 3) {
      const dSigs = () => kept.map((d) => formSig(d.ko));
      if ((aSig.da && dSigs().every((x) => !x.da)) || (!aSig.da && dSigs().every((x) => x.da))) {
        const c = nextCand(seen);
        if (c) { seen.add(normKo(c.senseKo)); kept[kept.length - 1] = mkDistractor(c); FIX("FORM_DA_SWAP"); }
      }
      if (aSig.words >= 3 && dSigs().every((x) => x.words <= 1)) {
        const c = nextCand(seen, (x) => formSig(x.senseKo).words >= 2);
        if (c) { seen.add(normKo(c.senseKo)); kept[kept.length - 1] = mkDistractor(c); FIX("FORM_CLAUSE_SWAP"); }
      }
    }
    set.distractors = kept;
  }
  s.meaningChoiceSets = s.meaningChoiceSets.filter((set) => set.distractors.length === 3);
  while (s.meaningChoiceSets.length < 2) {
    const seen = new Set(s.meaningChoiceSets.flatMap((set) => set.distractors.map((d) => normKo(d.ko))));
    const picks = [];
    for (let i = 0; i < 3; i++) {
      const c = nextCand(seen);
      if (!c) break;
      seen.add(normKo(c.senseKo));
      picks.push(mkDistractor(c));
    }
    if (picks.length < 3) break;
    s.meaningChoiceSets.push({ distractors: picks });
    FIX("MC_SET_BACKFILL");
  }

  // ── 힌트: 표제어 마스킹 → 정답 뜻·금지어 드롭 → 연어 백필 ──
  const lemmaLeak = (h) => spelling.length >= 4 && h.toLowerCase().includes(spelling.toLowerCase());
  const koLeak = (h) => answerKey.length >= 2 && normKo(h).includes(answerKey);
  const maskLemma = (h) => h.replace(new RegExp(esc(spelling), "gi"), "____");
  const hintOk = (h) => h && !lemmaLeak(h) && !koLeak(h) && !/글자|티어|[0-9１-９]\s*단계|난이도/.test(h);
  s.hints = (s.hints ?? []).map((h) => {
    if (!lemmaLeak(h)) return h;
    FIX("HINT_MASK_LEMMA");
    return maskLemma(h);
  }).filter((h) => {
    if (hintOk(h)) return true;
    FIX("HINT_DROP");
    return false;
  });
  for (const colloc of variant.collocations ?? []) {
    if (s.hints.length >= 2) break;
    const masked = maskLemma(colloc);
    const hint = `자주 쓰는 연어: "${masked}"`;
    if (!hintOk(hint) || s.hints.includes(hint)) continue;
    s.hints.push(hint);
    FIX("HINT_BACKFILL");
  }
  s.hints = s.hints.slice(0, 2);

  // ── 스템: 자기 예문·실존 surface로 재조립, 불가 시 드롭 ──
  const exById = new Map((ds.examples ?? []).map((e) => [e.exampleId, e]));
  const rebuild = (ex) => {
    const surf = String(ex.surface ?? "").trim();
    if (!surf || !wordRe(surf).test(ex.en)) return null;
    return {
      exampleId: ex.exampleId,
      text: ex.en.replace(wordRe(surf, "gi"), "____"),
      answerSurface: surf,
    };
  };
  const seenEx = new Set();
  const keptStems = [];
  for (const st of s.stems ?? []) {
    const ex = exById.get(st.exampleId);
    if (!ex || seenEx.has(st.exampleId)) {
      const alt = [...exById.values()].find((e) => !seenEx.has(e.exampleId) && rebuild(e));
      if (alt) { keptStems.push(rebuild(alt)); seenEx.add(alt.exampleId); FIX("STEM_REBUILD"); }
      else FIX("STEM_DROP");
      continue;
    }
    const surf = String(st.answerSurface ?? "").trim();
    const surfaceOk = surf && wordRe(surf).test(ex.en);
    if (!surfaceOk) {
      const rb = rebuild(ex);
      if (rb) { keptStems.push(rb); seenEx.add(ex.exampleId); FIX("STEM_REBUILD"); }
      else FIX("STEM_DROP");
      continue;
    }
    let text = String(st.text ?? "");
    if (!text.includes("____")) {
      const rb = rebuild(ex) ?? { exampleId: ex.exampleId, text: ex.en.replace(wordRe(surf, "gi"), "____"), answerSurface: surf };
      keptStems.push(rb); seenEx.add(ex.exampleId); FIX("STEM_REBUILD");
      continue;
    }
    if (wordRe(surf).test(text)) {
      text = text.replace(wordRe(surf, "gi"), "____");
      FIX("STEM_MASK_ANSWER");
    }
    keptStems.push({ ...st, text, answerSurface: surf });
    seenEx.add(ex.exampleId);
  }
  if (s.contextRequired && keptStems.length === 0) {
    for (const ex of exById.values()) {
      const rb = rebuild(ex);
      if (rb) { keptStems.push(rb); FIX("STEM_BACKFILL"); break; }
    }
  }
  s.stems = keptStems;

  // ── 함정 판정: 자기 예문·근거 필수·거짓 주장≠정답 ──
  s.trapClaims = (s.trapClaims ?? []).filter((t) => {
    const ok = exById.has(t.exampleId) && t.basis?.trim() &&
      !(t.isTrue === false && normKo(t.claimKo) === answerKey);
    if (!ok) FIX("TRAP_DROP");
    return ok;
  });

  // ── 철자 적격성 ──
  if (s.spellEligible && (variant.isPhrase || /[^a-zA-Z]/.test(spelling))) {
    s.spellEligible = false;
    s.spellIneligibleReason = "구/비단일 낱말 — 철자 문항 부적격(결정론 교정)";
    FIX("SPELL_FORCE_FALSE");
  }
}

async function repairPackFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  let pack;
  try { pack = JSON.parse(raw); } catch { return { skipped: "parse" }; }
  if (pack.serve === false) return { skipped: "no-serve" };
  const dossier = await buildDossier(pack.spelling);
  if (!dossier) return { skipped: "no-dossier" };
  const dsById = new Map();
  const variantBySense = new Map();
  for (const v of dossier.variants) {
    for (const s of v.senses) { dsById.set(s.senseId, s); variantBySense.set(s.senseId, v); }
  }
  const ens = [...new Set((pack.variants ?? []).flatMap((v) => (v.senses ?? []).flatMap((s) =>
    (s.wordChoiceDistractors ?? []).map((d) => String(d.en ?? "").trim().toLowerCase()))))].filter(Boolean);
  const lookups = await glossLookup(ens);

  for (const v of pack.variants ?? []) {
    const before = (v.senses ?? []).length;
    v.senses = (v.senses ?? []).filter((s) => dsById.has(s.senseId));
    if (v.senses.length < before) FIX("SENSE_DROP");
    for (const s of v.senses) {
      const ds = dsById.get(s.senseId);
      repairSense(pack, variantBySense.get(s.senseId), s, ds, lookups);
    }
  }
  pack.variants = (pack.variants ?? []).filter((v) => (v.senses ?? []).length > 0);

  const out = JSON.stringify(pack, null, 1);
  if (out === raw) return { changed: false };
  fs.writeFileSync(file, out);
  return { changed: true };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".pack.json"));
  console.log(`교정 대상 ${files.length}팩`);
  let changed = 0, done = 0;
  for (const f of files) {
    const r = await repairPackFile(path.join(DIR, f));
    if (r.changed) changed++;
    if (++done % 25 === 0) console.log(`  … ${done}/${files.length} (수정 ${changed})`);
  }
  console.log(`\n교정 완료: ${changed}/${files.length}팩 수정`);
  console.log("항목별:", Object.entries(fixes).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`).join(" · ") || "수정 없음");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
