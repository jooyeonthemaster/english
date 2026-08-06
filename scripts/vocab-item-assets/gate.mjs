// ============================================================================
// 문항 자산 캠페인 — 기계 게이트
//
// 품질 전수조사(2026-08-05)에서 확정된 병리를 그대로 검사 항목으로 뒤집은 것.
// critical = 학생에게 나가면 안 되는 결함(반려 → quarantine → Claude 레인),
// major = 수리 대상, minor = 기록만.
//
//   node scripts/vocab-item-assets/gate.mjs --dir experiments/vocab-item-assets/packs
//   node scripts/vocab-item-assets/gate.mjs --dir ... --quarantine   # critical 팩 격리
// ============================================================================
import fs from "fs";
import path from "path";
// 정규화·형태 판정은 dossier.mjs가 단일 정본 — 사본이 어긋나면 유령 결함(파일럿 실측)
import { prisma, normKo, fuzzyKo, stemShare, formSig as sig, DA_MATTERS, buildSynonymGraph, enOverlapSynonym } from "./dossier.mjs";

/** 코퍼스 동의어 그래프 + 표기별 영어 정의 토큰 — main()에서 1회 로드(질의 1번). */
let SYN = { graph: new Map(), glossEn: new Map() };

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DIR = opt("dir", "experiments/vocab-item-assets/packs");
const QUARANTINE = args.includes("--quarantine");
// luna가 "이건 오답으로 못 쓴다"고 자백하며 출하한 슬롯(재파일럿 실측: develop turn/evolve)
const CONFESSION = /(오답으로 (사용할 수 없|쓸 수 없)|정답으로 성립|정답 표기와 겹|정답 표현|배제되어야|bannedKo|사실상 (같|동일)|정답과 (같|동일|겹))/;

const findings = []; // {pack, senseId, level, code, msg}
const F = (pack, senseId, level, code, msg) => findings.push({ pack, senseId, level, code, msg });

async function checkPack(file) {
  const packName = path.basename(file);
  let pack;
  try { pack = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { F(packName, null, "critical", "PARSE", "JSON 파싱 실패"); return; }

  if (pack.serve === false) {
    if (!pack.serveReason) F(packName, null, "major", "SERVE_REASON", "serve=false인데 사유 없음");
    return; // 서빙 제외 팩은 내용 검사 불필요
  }

  const senseIds = pack.variants.flatMap((v) => v.senses.map((s) => s.senseId));
  const dbSenses = await prisma.vocabDrillSense.findMany({
    where: { id: { in: senseIds } },
    select: { id: true, lemma: true, pos: true, senseKo: true, senseKoCandidates: true, senseEn: true, isPhrase: true },
  });
  const senseById = new Map(dbSenses.map((s) => [s.id, s]));

  // 오답 영단어의 실제 뜻을 DB에서 역조회 — 동의어 오답(undergo=겪다) 차단의 정본.
  // "철자가 다르다"는 오답 근거가 아니다(정성 패널: 이중정답 38.2%의 원인).
  const allEns = [...new Set(pack.variants.flatMap((v) => v.senses.flatMap((s) =>
    s.wordChoiceDistractors.map((d) => d.en.trim().toLowerCase()))))].filter(Boolean);
  const enRows = allEns.length ? await prisma.vocabDrillSense.findMany({
    where: { lemma: { in: allEns }, retiredAt: null },
    select: { lemma: true, pos: true, senseKo: true, senseKoCandidates: true },
  }) : [];
  const glossByEn = new Map(); // en → Set(normKo gloss 전부)
  const posByEn = new Map();   // en → Set(pos)
  for (const r of enRows) {
    const key = r.lemma.toLowerCase();
    if (!glossByEn.has(key)) { glossByEn.set(key, new Set()); posByEn.set(key, new Set()); }
    glossByEn.get(key).add(normKo(r.senseKo));
    posByEn.get(key).add(r.pos);
    for (const c of Array.isArray(r.senseKoCandidates) ? r.senseKoCandidates : []) {
      const ko = typeof c === "string" ? c : c?.ko;
      if (ko) glossByEn.get(key).add(normKo(ko));
    }
  }
  const exampleIds = pack.variants.flatMap((v) => v.senses.flatMap((s) => [
    ...s.stems.map((st) => st.exampleId),
    ...s.trapClaims.map((t) => t.exampleId),
  ]));
  const dbExamples = await prisma.vocabDrillExample.findMany({
    where: { id: { in: [...new Set(exampleIds)] } },
    select: { id: true, senseId: true, en: true },
  });
  const exById = new Map(dbExamples.map((e) => [e.id, e]));

  for (const v of pack.variants) {
    for (const s of v.senses) {
      const db = senseById.get(s.senseId);
      const tag = s.senseId;
      if (!db) { F(packName, tag, "critical", "SENSE_MISSING", "DB에 없는 senseId"); continue; }
      if (db.lemma.toLowerCase() !== pack.spelling.toLowerCase())
        F(packName, tag, "critical", "SENSE_WRONG_LEMMA", `senseId가 다른 표제어(${db.lemma}) 소속`);

      const answerKey = normKo(db.senseKo);
      // 대안 표기 → 코퍼스 통용 횟수 n. n≥2는 확정 정답 표기(충돌=critical),
      // n=1은 오검출 가능성이 있어 수동 검토 큐(minor) — 정성 패널 확정 수리안.
      const altN = new Map();
      for (const c of Array.isArray(db.senseKoCandidates) ? db.senseKoCandidates : []) {
        const ko = typeof c === "string" ? c : c?.ko;
        const n = typeof c === "object" && c?.n ? Number(c.n) : 1;
        if (!ko) continue;
        const k = normKo(ko);
        altN.set(k, Math.max(altN.get(k) ?? 0, n));
      }
      const altKeys = new Set(altN.keys());
      const bannedAll = new Set([answerKey, ...altKeys]);
      const fuzzyBanned = new Map(); // fuzzyKey → n(최대)
      fuzzyBanned.set(fuzzyKo(db.senseKo), 99);
      for (const [k, n] of altN) {
        const fk = fuzzyKo(k);
        if (fk.length >= 2) fuzzyBanned.set(fk, Math.max(fuzzyBanned.get(fk) ?? 0, n));
      }

      // ── 뜻 고르기 오답 세트 ──
      if (s.meaningChoiceSets.length < 1) F(packName, tag, "critical", "MC_EMPTY", "오답 세트 0개");
      if (s.meaningChoiceSets.length < 2) F(packName, tag, "major", "MC_ONE_SET", "오답 세트 1개(스펙 2개)");
      for (const [si, set] of s.meaningChoiceSets.entries()) {
        if (set.distractors.length !== 3) {
          F(packName, tag, "critical", "MC_COUNT", `세트${si} 오답 ${set.distractors.length}개(3개 필요)`);
          continue;
        }
        const seen = new Set();
        for (const d of set.distractors) {
          const key = normKo(d.ko);
          if (!key) F(packName, tag, "critical", "MC_EMPTY_KO", `세트${si} 빈 오답`);
          if (key === answerKey) F(packName, tag, "critical", "MC_EQUALS_ANSWER", `오답 "${d.ko}" = 정답`);
          else if (altKeys.has(key)) {
            // n=1도 critical — 수동검토 실측(82건 중 77건이 진짜 복수정답)으로 임계 폐지
            F(packName, tag, "critical", "MC_ALT_ANSWER", `오답 "${d.ko}"는 같은 뜻의 통용 표기(n=${altN.get(key) ?? 1}, 복수 정답)`);
          } else if (SYN.graph.get(answerKey)?.has(key)) {
            // 코퍼스 동의어 — 다른 sense에서 정답 표기와 같은 뜻으로 병기된 적 있는 표기
            F(packName, tag, "critical", "MC_CORPUS_SYNONYM", `오답 "${d.ko}"는 코퍼스에서 정답 표기와 동의어로 병기된 표기(복수 정답 시비)`);
          } else if (enOverlapSynonym(db.senseEn, key, SYN.glossEn)) {
            // 영어 정의 토큰 겹침 — 단계적인↔점진적인(graduated 실서비스 시비)처럼
            // 한국어 표기는 달라도 정의가 같은 유사어
            F(packName, tag, "critical", "MC_EN_SYNONYM", `오답 "${d.ko}"의 영어 정의가 정답 뜻과 겹침(유사어 시비)`);
          } else {
            // 퍼지 충돌: '정확히'≈'정확하게' — 어미만 다른 대안 표기(패널 실측 7.32%)
            const fk = fuzzyKo(d.ko);
            const fn = fk.length >= 2 ? fuzzyBanned.get(fk) : undefined;
            if (fn >= 1) F(packName, tag, "critical", "MC_CAND_COLLISION", `오답 "${d.ko}"가 정답 표기의 어미 변형(복수 정답)`);
          }
          if (seen.has(key)) F(packName, tag, "major", "MC_DUP", `세트${si} 오답 중복 "${d.ko}"`);
          seen.add(key);
          if (!d.whyWrong?.trim()) F(packName, tag, "major", "MC_NO_EXPLAIN", `오답 "${d.ko}" 해설 없음`);
          if (CONFESSION.test(String(d.whyWrong ?? "") + String(d.whyPlausible ?? "")))
            F(packName, tag, "critical", "MC_CONFESSION", `해설이 오답 불성립을 자인: "${d.ko}"`);
        }
        // 형태 유일 정답(블라인드 풀이) 검사 — 감사 1순위 병리.
        // '~다' 종결 비교는 술어성 품사에서만 — 명사의 다-종결(바다·베란다)은 우연이다.
        const a = sig(db.senseKo);
        const ds = set.distractors.map((d) => sig(d.ko));
        if (DA_MATTERS.has(db.pos)) {
          if (a.da && ds.every((x) => !x.da)) F(packName, tag, "critical", "FORM_DA_OUTLIER", `세트${si}: 정답만 '~다' 종결`);
          if (!a.da && ds.every((x) => x.da)) F(packName, tag, "critical", "FORM_DA_OUTLIER", `세트${si}: 정답만 비'~다'`);
        }
        if (a.words >= 3 && ds.every((x) => x.words <= 1)) F(packName, tag, "critical", "FORM_CLAUSE_OUTLIER", `세트${si}: 정답만 절 형태`);
        const maxD = Math.max(...ds.map((x) => x.len));
        if (a.len > maxD * 2.5 + 2) F(packName, tag, "major", "FORM_LEN_OUTLIER", `세트${si}: 정답이 오답 최장의 2.5배+`);
      }

      // ── 단어 고르기 오답 — 정성 패널이 뚫은 지점(블라인드 60%·이중정답 38.2%) ──
      if (s.wordChoiceDistractors.length !== 3)
        F(packName, tag, "major", "WC_COUNT", `영단어 오답 ${s.wordChoiceDistractors.length}개(3개 필요)`);
      for (const d of s.wordChoiceDistractors) {
        const en = d.en.trim().toLowerCase();
        if (en === pack.spelling.toLowerCase())
          F(packName, tag, "critical", "WC_EQUALS_ANSWER", `영단어 오답 "${d.en}" = 정답`);
        if (CONFESSION.test(String(d.whyWrong ?? "")))
          F(packName, tag, "critical", "WC_CONFESSION", `해설이 오답 불성립을 자인: "${d.en}"`);
        // 어간 공유 파생형 — child→childhood/childlike (형태 단서로 즉답)
        if (stemShare(en, pack.spelling))
          F(packName, tag, "critical", "WC_STEM_SHARE", `영단어 오답 "${d.en}"가 정답과 어간 공유`);
        // DB 역조회 동의어 — 오답의 실제 뜻이 정답 뜻과 겹치면 이중 정답
        const glosses = glossByEn.get(en);
        if (glosses) {
          const hit = [...glosses].find((g) => bannedAll.has(g));
          if (hit) F(packName, tag, "critical", "WC_DB_SYNONYM", `영단어 오답 "${d.en}"의 실제 뜻이 정답과 동일("${hit.slice(0, 20)}")`);
          const poses = posByEn.get(en);
          if (poses && !poses.has(db.pos))
            F(packName, tag, "major", "WC_POS_MISMATCH", `영단어 오답 "${d.en}"에 ${db.pos} 뜻 없음(품사 소거)`);
        }
      }

      // ── 힌트 ──
      if (s.hints.length !== 2) F(packName, tag, "major", "HINT_COUNT", `힌트 ${s.hints.length}개(2개 필요)`);
      for (const h of s.hints) {
        if (/글자|티어|[0-9１-９]\s*단계|난이도/.test(h))
          F(packName, tag, "critical", "HINT_BANNED", `금지어 힌트: "${h.slice(0, 40)}"`);
        const hNorm = h.toLowerCase();
        if (pack.spelling.length >= 4 && hNorm.includes(pack.spelling.toLowerCase()))
          F(packName, tag, "critical", "HINT_LEAK_LEMMA", `힌트에 표제어 노출: "${h.slice(0, 40)}"`);
        if (answerKey.length >= 2 && normKo(h).includes(answerKey))
          F(packName, tag, "critical", "HINT_LEAK_KO", `힌트에 정답 뜻 노출: "${h.slice(0, 40)}"`);
      }

      // ── 문맥 스템 ──
      if (s.contextRequired && s.stems.length === 0)
        F(packName, tag, "critical", "STEM_REQUIRED", "contextRequired인데 스템 0개");
      for (const st of s.stems) {
        const ex = exById.get(st.exampleId);
        if (!ex) { F(packName, tag, "critical", "STEM_EX_MISSING", `없는 exampleId ${st.exampleId}`); continue; }
        if (ex.senseId !== s.senseId) F(packName, tag, "critical", "STEM_EX_FOREIGN", "다른 sense의 예문 사용");
        if (!st.text.includes("____")) F(packName, tag, "critical", "STEM_NO_BLANK", "빈칸(____) 없음");
        if (!st.answerSurface?.trim()) F(packName, tag, "critical", "STEM_NO_SURFACE", "answerSurface 없음");
        else {
          // 단어 경계 검사 — "as"를 "based" 안에서 찾는 부분문자열 오탐 방지(파일럿 실측)
          const esc = st.answerSurface.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const wordRe = new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, "i");
          if (!wordRe.test(ex.en))
            F(packName, tag, "critical", "STEM_SURFACE_FABRICATED", `answerSurface "${st.answerSurface}"가 원문에 없음`);
          if (wordRe.test(st.text))
            F(packName, tag, "critical", "STEM_ANSWER_VISIBLE", "스템 본문에 정답 표기 잔존");
        }
        // 축약 다듬기 허용 — 대신 스템 어휘의 대부분이 원문에 있어야 창작이 아니다
        const stemWords = st.text.replace(/____/g, " ").toLowerCase().match(/[a-z']+/g) ?? [];
        const exLower = ex.en.toLowerCase();
        const hit = stemWords.filter((w) => exLower.includes(w)).length;
        if (stemWords.length >= 5 && hit / stemWords.length < 0.7)
          F(packName, tag, "major", "STEM_DRIFT", `스템 어휘의 ${Math.round((hit / stemWords.length) * 100)}%만 원문과 일치(창작 의심)`);
      }

      // ── 함정 판정 ──
      for (const t of s.trapClaims) {
        const ex = exById.get(t.exampleId);
        if (!ex) F(packName, tag, "critical", "TRAP_EX_MISSING", `없는 exampleId`);
        else if (ex.senseId !== s.senseId) F(packName, tag, "major", "TRAP_EX_FOREIGN", "다른 sense 예문의 주장");
        if (!t.basis?.trim()) F(packName, tag, "critical", "TRAP_NO_BASIS", "판정 근거 없음");
        if (t.isTrue === false && normKo(t.claimKo) === answerKey)
          F(packName, tag, "critical", "TRAP_FALSE_IS_TRUE", `거짓 주장 "${t.claimKo}"이 정답과 동일`);
      }

      // ── 철자 적격성 ──
      if (s.spellEligible && (db.isPhrase || /[^a-zA-Z]/.test(db.lemma)))
        F(packName, tag, "critical", "SPELL_PHRASE", "구·비단일 낱말에 spellEligible=true");
    }
  }
}

async function main() {
  SYN = await buildSynonymGraph();
  console.log(`동의어 그래프: 표기 ${SYN.size}개`);
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".pack.json")).map((f) => path.join(DIR, f));
  console.log(`게이트 대상 ${files.length}팩`);
  // 8-way 병렬 + 진행 로그 — 25k 규모 순차 실행이 원격 DB 왕복에 매몰돼
  // 수 시간 무소식으로 행처럼 보였던 실측의 교정. 검사 자체는 팩 단위 독립이다.
  const queue = [...files];
  let done = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const f = queue.shift();
      if (!f) break;
      await checkPack(f);
      if (++done % 500 === 0) console.log(`  … ${done}/${files.length}`);
    }
  }));

  const byLevel = { critical: 0, major: 0, minor: 0 };
  const byCode = {};
  for (const f of findings) { byLevel[f.level]++; byCode[f.code] = (byCode[f.code] ?? 0) + 1; }
  const badPacks = new Set(findings.filter((f) => f.level === "critical").map((f) => f.pack));

  fs.writeFileSync(path.join(DIR, "gate-report.json"), JSON.stringify({ summary: byLevel, byCode, findings }, null, 1));
  console.log(`\ncritical ${byLevel.critical} · major ${byLevel.major} · minor ${byLevel.minor}`);
  console.log("코드별:", Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(" · ") || "결함 없음");
  console.log(`critical 보유 팩: ${badPacks.size}/${files.length} (통과율 ${(100 * (1 - badPacks.size / Math.max(1, files.length))).toFixed(1)}%)`);

  if (QUARANTINE && badPacks.size) {
    const qf = path.join(DIR, "quarantine.jsonl");
    for (const p of badPacks) {
      const src = path.join(DIR, p);
      fs.renameSync(src, src.replace(/\.pack\.json$/, ".rejected.json"));
      fs.appendFileSync(qf, JSON.stringify({ sp: p.replace(/\.pack\.json$/, ""), err: "gate-critical" }) + "\n");
    }
    console.log(`격리 ${badPacks.size}팩 → .rejected.json (재생성 대상)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
