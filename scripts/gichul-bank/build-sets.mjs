// 기출 문제 은행 3차 — **장문 세트 전수 추출기**(§12.3 단계 A).
//   origin 211 → 현대형(41-42 · 43-45) + 구형(2005~2013 46-48/49-50 …) 세트 → .tmp-gichul-bank/sets/sets-draft.json
//   통계 → .tmp-gichul-bank/sets/sets-stats.json
// 사용: node scripts/gichul-bank/build-sets.mjs [--only <examId>] [--limit N]
//
// 정본: docs/gichul-question-bank-spec.md §12. 기존 단일 문항 파이프라인 파일은 건드리지 않는다(import 재사용만).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadOrigin } from "./lib/origin.mjs";
import { hasHangul, similarity, tidy, wordCount } from "./lib/text.mjs";
import { SUBTYPE_OF } from "./lib/serialize.mjs";
import {
  blankAnchorsFromCorpus, buildDisplayed, canonicalFromBlocks, classifyMemberDirection, extractSetPassage, findSetCandidates,
  formatSetTitle, insertBlank, insertBlankAtAnchor, letterOptions, letterSpans, locateWordStrict, parseMemberSlice,
  parseSetOrderPerms, resolveSetDirection, scrubOptionText, setKeyOf, sha256, splitBlocks, stripLabels,
} from "./lib/sets.mjs";

const REPO = process.cwd();
const ORIGIN_DIR = `${REPO}/.tmp-gichul-bank/origin`;
const OUT_DIR = `${REPO}/.tmp-gichul-bank/sets`;
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const readJson = (p, fb = null) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb);

const passages = readJson(`${REPO}/src/data/exam-passages/passages.json`, []);
const problems = readJson(`${REPO}/src/data/exam-passages/problems.json`, {});
const ANSWER_KEYS = readJson(`${REPO}/.tmp-gichul-bank/answer-keys.json`, {});
// 함대 산출(§12.3 B·C). 정본 파일이 아직 없으면 샤드(`answers-extra-*.json` · `vocab-corrections-*.json`)를 합쳐 쓴다.
function readMerged(name) {
  const one = readJson(`${OUT_DIR}/${name}.json`, null);
  if (one) return { data: one, src: `${name}.json` };
  const shards = readdirSync(OUT_DIR).filter((f) => new RegExp(`^${name}-[0-9]+\.json$`).test(f)).sort();
  if (shards.length === 0) return { data: {}, src: "none" };
  const out = {};
  for (const f of shards) Object.assign(out, readJson(`${OUT_DIR}/${f}`, {}));
  return { data: out, src: `${shards.length} shards` };
}
const _ans = readMerged("answers-extra");
const _voc = readMerged("vocab-corrections");
// 빈칸 앵커(§12.3 B 후속) — extract-forms 가 빈칸 벡터선을 놓친 회차만. 자연어 의미: before=빈칸 앞 / after=빈칸 뒤.
const BLANK_ANCHORS = readJson(`${OUT_DIR}/blank-anchors.json`, {}) || {};
const ANSWERS_EXTRA = _ans.data;
const VOCAB_CORRECTIONS = _voc.data;
const TREND_2027_09 = readJson(`${REPO}/.tmp-trend-v2/srcpdf/2027_09.answers.json`, null);
const EXISTING_BANK = readJson(`${REPO}/src/data/exam-passages/questions.json`, []);
// S8 충돌 대상 = **단일 문항 id 만**. 세트 멤버(setKey 보유 · id 에 "#")는 assemble-sets 가 매번
// 걷어내고 다시 넣는 멱등 대상이라 여기 포함하면 **조립 후 재빌드가 자기 자신과 충돌**한다
// (26-09-08 실측: origin 수리분 반영하려 재실행했더니 S8 이 434세트 전량을 pending 으로 강등).
const EXISTING_IDS = new Set(
  (Array.isArray(EXISTING_BANK) ? EXISTING_BANK : [])
    .filter((x) => x?.id && !x.setKey && !String(x.id).includes("#"))
    .map((x) => x.id),
);

// 회차 메타 — 코퍼스(passages.json)가 정본. 코퍼스 미적재 회차(2027_09)만 examId 로 파생한다(§12.5).
const META = new Map();
for (const p of passages) {
  if (!META.has(p.examId)) {
    META.set(p.examId, { year: p.year, exam: p.exam, board: p.board, grade: p.grade || "고3", era: p.era, form: p.form || "" });
  }
}
function metaOf(examId) {
  const m = META.get(examId);
  if (m) return m;
  const kice = examId.match(/^(\d{4})_(SN|06|09|EX)_/);
  if (kice) {
    const [, y, e] = kice;
    return { year: Number(y), exam: e === "SN" ? "수능" : e === "EX" ? "예비" : `${Number(e)}월`, board: e === "SN" ? "대학수학능력시험" : "수능모의평가", grade: "고3", era: "modern", form: "" };
  }
  // 학평 examId → 메타. 코퍼스 실측 규약: year = **달력 연도**(학년도 보정 없음) · 형은 _A/_B 접미.
  const ebsi = examId.match(/^ebsi_go(\d)_(\d{4})(\d{2})(\d{2})(?:_([AB]))?$/);
  if (ebsi) {
    const [, g, y, mm, , ab] = ebsi;
    return { year: Number(y), exam: `${Number(mm)}월`, board: "학력평가", grade: `고${g}`, era: "modern", form: ab || "" };
  }
  return null;
}

// 세트 지문 코퍼스(id === setKey)
const CORPUS_SET = new Map();
for (const p of passages) if (Array.isArray(p.qNumbers) && p.qNumbers.length > 1) CORPUS_SET.set(p.id, p);

/** build-bank.mjs officialAnswer 동형(형 일치 공식 정답표) */
function officialAnswer(examId, form, qNum) {
  const k = ANSWER_KEYS[examId];
  if (!k) return null;
  const ab = /_([AB])$/.exec(examId)?.[1];
  const col = ab ? (k[ab] || null) : form === "even" ? k.even : (k.odd || k.single || k.even);
  if (!col) return null;
  const a = col.answers?.[String(qNum)];
  const pts = col.points?.[String(qNum)];
  return Number.isInteger(a) ? { answer: a, points: pts ?? null, form: form === "even" ? "even" : "odd" } : null;
}

/** 정답 정본 우선순위(§12.1-7) */
function resolveAnswer(examId, originForm, setKey, qNum) {
  const off = officialAnswer(examId, originForm, qNum);
  if (off) return { answer: off.answer, points: off.points, source: `official-${off.form}` };
  const ex = ANSWERS_EXTRA[examId]?.answers?.[String(qNum)];
  if (Number.isInteger(ex)) return { answer: ex, points: null, source: "answers-extra" };
  const cp = CORPUS_SET.get(setKey);
  const ca = cp?.answer && typeof cp.answer === "object" ? cp.answer[String(qNum)] : null;
  if (Number.isInteger(ca)) return { answer: ca, points: null, source: "corpus" };
  const ak = problems[setKey]?.answerKey?.[String(qNum)];
  if (Number.isInteger(ak)) return { answer: ak, points: null, source: "problems" };
  if (examId === "2027_09_20270901" && TREND_2027_09 && Number.isInteger(TREND_2027_09[String(qNum)])) {
    return { answer: TREND_2027_09[String(qNum)], points: null, source: "trend-2027_09" };
  }
  return null;
}

// ── 세트 1개 빌드 ─────────────────────────────────────────────────────────────

function buildSet(origin, cand, meta) {
  const examId = origin.examId;
  const key = setKeyOf(examId, cand.qNums);
  const issues = [], notes = [], gates = {};
  const label = `${cand.from}~${cand.to}`;
  const base = {
    key, passageId: key, examId, year: meta.year, exam: meta.exam, board: meta.board, grade: meta.grade, era: meta.era,
    form: meta.form, qNums: cand.qNums, label,
    passageTitle: formatSetTitle(meta, cand.qNums),
  };

  const ex = extractSetPassage(origin, cand);
  if (!ex || ex.lines.length === 0) return { ...base, status: "unsupported", unsupportedReason: "no-passage", issues, notes, gates };
  if (ex.source === "fallback") notes.push("NOTE:trailing-fallback(cleanSlice 헤더 미검출)");

  const { blocks, pre } = splitBlocks(ex.lines);
  const hasBlocks = blocks.length >= 2;
  if (hasBlocks && pre.length && tidy(pre.join(" "))) notes.push(`NOTE:pre-block-text(${wordCount(pre.join(" "))}w)`);
  let displayed = buildDisplayed(hasBlocks ? blocks : null, hasBlocks ? [] : ex.lines);
  const footnotes = ex.footnotes || [];

  // 멤버 슬라이스 파싱 + 분류
  const parsed = [];
  const unsupportedQNums = [];
  const unsupportedWhy = {};
  for (const qNum of cand.qNums) {
    const ms = parseMemberSlice(origin, qNum);
    if (!ms) { unsupportedQNums.push(qNum); unsupportedWhy[qNum] = "no-slice"; continue; }
    const tg = classifyMemberDirection(ms.printedDirection);
    if (!tg) { unsupportedQNums.push(qNum); unsupportedWhy[qNum] = `unclassified:${tidy(ms.printedDirection).slice(0, 28)}`; continue; }
    parsed.push({ qNum, tg, ...ms });
  }
  if (parsed.length === 0) return { ...base, status: "unsupported", unsupportedReason: "no-supported-member", unsupportedQNums, unsupportedWhy, issues, notes, gates };

  // 정답
  const answers = {};
  const answerSources = new Set();
  for (const m of parsed) {
    const a = resolveAnswer(examId, origin.form, key, m.qNum);
    if (a && Number.isInteger(a.answer) && a.answer >= 1 && a.answer <= 5) { answers[m.qNum] = a; answerSources.add(a.source); }
  }
  if (Object.keys(answers).length === 0) {
    return { ...base, status: "unsupported", unsupportedReason: "no-answer", unsupportedQNums, unsupportedWhy, issues, notes, gates };
  }

  const orderM = parsed.find((m) => m.tg === "글의순서");
  const blankM = parsed.find((m) => m.tg === "빈칸추론");
  const vocabM = parsed.find((m) => m.tg === "어휘");
  const refM = parsed.find((m) => m.tg === "지칭");
  const needLetters = Boolean(vocabM || refM);

  if (orderM && !answers[orderM.qNum]) {
    return { ...base, status: "unsupported", unsupportedReason: "no-answer(order)", unsupportedQNums, unsupportedWhy, issues, notes, gates };
  }

  // 빈칸형: 표시 베이스에 _____ 심기(원형 blanks → 밑줄문자열)
  let blankInfo = null;
  if (blankM) {
    blankInfo = insertBlank(displayed, ex.prevSlice?.blanks || []);
    if (!blankInfo) {
      // 폴백: 추출기가 빈칸 사각형을 못 잡은 회차 — 코퍼스 정본 + 정답 선지로 이웃을 역산
      const cp = CORPUS_SET.get(key);
      const ai = answers[blankM.qNum]?.answer;
      const ch = blankM.choices || (problems[key]?.rawProblems || []).find((r) => r.qNum === blankM.qNum)?.choices;
      const fill = ch && ai ? tidy(String(ch[ai - 1] || "")) : null;
      if (cp?.text && fill) {
        const anchor = blankAnchorsFromCorpus(cp.text, fill);
        if (anchor) blankInfo = insertBlank(displayed, [anchor]);
        if (blankInfo) blankInfo.source = "corpus-derived";
      }
      // 3순위 — 감독 확정 앵커 파일(PDF 벡터 빈칸선 실측 + PNG 육안 확인). 위 두 경로가 실패한 세트에서만 닿는다(additive).
      if (!blankInfo) {
        const fa = BLANK_ANCHORS[key];
        if (fa && (!fa.qNum || fa.qNum === blankM.qNum)) blankInfo = insertBlankAtAnchor(displayed, fa);
      }
    }
    if (blankInfo) displayed = blankInfo.text;
    else issues.push("blank-slot-not-found");
  }

  // (a)~(e) 스팬
  let spans = [], spanStarts = [];
  if (needLetters) {
    const r = letterSpans(displayed, ex.prevSlice);
    spans = r.spans; spanStarts = r.starts;
    for (const i of r.issues) issues.push(`span:${i}`);
  }

  // 43 순열(인쇄) — 블록 라벨에서 첫 글자(A)를 뺀 나머지가 순열 원소.
  // **구형 전순열 예외**: 2005~2007 학평 46-48 은 단락이 (A)(B)(C) 3개뿐이고 (A) 도 고정이 아니다
  //   (발문 「위 글의 순서로 가장 적절한 것은?」 · 선지 「① (A)-(B)-(C) …」 — ebsi_go3_20070418 실측, origin 316 중 유일).
  //   현대형(4단락·(A) 고정)은 blocks.length===4 라 이 가지에 닿지 않는다.
  let perms = null, permLetters = null, fullPerm = false;
  if (orderM) {
    const permText = [orderM.slice?.wtext, orderM.slice?.text,
      (problems[key]?.rawProblems || []).find((r) => r.qNum === orderM.qNum)?.choices?.join(" ")];
    const tryLetters = (letters) => { for (const t of permText) { const r = parseSetOrderPerms(t, letters); if (r) return r; } return null; };
    permLetters = blocks.slice(1).map((b) => b.label.replace(/[()]/g, ""));
    if (permLetters.length < 3) permLetters = ["B", "C", "D"];
    perms = tryLetters(permLetters);
    if (!perms && hasBlocks && blocks.length === 3) {
      const all = blocks.map((b) => b.label.replace(/[()]/g, ""));
      const r = tryLetters(all);
      if (r) { perms = r; permLetters = all; fullPerm = true; notes.push("NOTE:legacy-full-permutation(A 미고정 3단락)"); }
    }
    if (!perms) issues.push("order-perms-not-parsed");
  }

  // ── 멤버 직렬화 ─────────────────────────────────────────────────────────────
  const members = [];
  for (const m of parsed) {
    const a = answers[m.qNum];
    if (!a) { unsupportedQNums.push(m.qNum); unsupportedWhy[m.qNum] = "no-answer"; continue; }
    const { direction, note } = resolveSetDirection(m.printedDirection, m.tg);
    if (note) notes.push(`q${m.qNum} ${note}`);
    const subType = SUBTYPE_OF[m.tg];
    let options = null, sdExtra = {}, memberSpans = [], isStructural = false, optionList = null;

    if (m.tg === "어휘" || m.tg === "지칭") {
      options = letterOptions();
      optionList = "letters";
      memberSpans = spans.filter(Boolean);
      if (memberSpans.length !== 5) { unsupportedQNums.push(m.qNum); unsupportedWhy[m.qNum] = "spans<5"; continue; }
    } else if (m.tg === "글의순서") {
      if (!perms) { unsupportedQNums.push(m.qNum); unsupportedWhy[m.qNum] = "no-perms"; continue; }
      options = perms.map((pm, i) => ({ label: String(i + 1), text: pm.split("").map((k) => `(${k})`).join("-") }));
      isStructural = true;
    } else {
      const ch = m.choices ? m.choices.map(scrubOptionText) : null;
      if (!ch || ch.length !== 5 || ch.some((c) => !tidy(c))) {
        const fb = (problems[key]?.rawProblems || []).find((r) => r.qNum === m.qNum)?.choices;
        if (Array.isArray(fb) && fb.length === 5 && fb.every((c) => tidy(String(c)))) {
          options = fb.map((t, i) => ({ label: String(i + 1), text: scrubOptionText(t) }));
          notes.push(`q${m.qNum} NOTE:choices-from-problems.json`);
        } else { unsupportedQNums.push(m.qNum); unsupportedWhy[m.qNum] = `choices=${ch ? ch.length : 0}`; continue; }
      } else {
        options = ch.map((t, i) => ({ label: String(i + 1), text: t }));
      }
      if (m.tg === "내용일치") sdExtra.matchType = /않는|않은|일치하지/.test(direction) ? "불일치" : "일치";
      if (m.tg === "빈칸추론") sdExtra.blankAnswerMode = "SOURCE_EXACT";
    }

    const correctAnswer = String(a.answer);
    const structuredData = {
      _typeId: subType,
      direction,
      options,
      correctAnswer,
      ...sdExtra,
      _setMember: true,
      _isStructural: isStructural,
      _spans: memberSpans,
      _gichul: { set: { key, label, qNums: cand.qNums }, ...(optionList ? { optionList } : {}) },
    };
    const pt = a.points ?? m.point ?? null;
    members.push({
      id: `${key}#${m.qNum}`,
      passageId: key,
      examId, year: meta.year, exam: meta.exam, board: meta.board, grade: meta.grade, era: meta.era, form: meta.form,
      qNum: m.qNum,
      typeGroup: m.tg,
      subType,
      points: pt === 3 ? 3 : pt === 1 ? 1 : 2,
      direction,
      questionText: direction,
      options,
      correctAnswer,
      structuredData,
      passageTitle: base.passageTitle,
      footnotes: [],
      preview: "",
      verified: [`answer:${a.source}`],
      setKey: key,
      setLabel: label,
      setQNums: cand.qNums,
    });
  }
  members.sort((x, y) => x.qNum - y.qNum);
  if (members.length === 0) {
    return { ...base, status: "unsupported", unsupportedReason: "no-serializable-member", unsupportedQNums, unsupportedWhy, issues, notes, gates };
  }

  // ── canonical ───────────────────────────────────────────────────────────────
  const corpus = CORPUS_SET.get(key);
  let canonicalPassage = null, textSource = "origin", vocabCorrection = null;
  // 원형에서 재구성한 정본 후보
  let rebuilt = null;
  if (orderM && perms && answers[orderM.qNum]) {
    const perm = perms[answers[orderM.qNum].answer - 1];
    rebuilt = perm ? canonicalFromBlocks(blocks, perm, { fullPerm }) : null;
    if (!rebuilt) issues.push("canonical-rebuild-failed(order)");
  } else {
    rebuilt = stripLabels(displayed);
  }
  if (rebuilt && orderM) rebuilt = stripLabels(rebuilt);
  // 빈칸 채우기
  if (rebuilt && blankM && answers[blankM.qNum]) {
    const fill = members.find((x) => x.qNum === blankM.qNum)?.options?.[answers[blankM.qNum].answer - 1]?.text;
    if (fill && /_{3,}/.test(rebuilt)) rebuilt = tidy(rebuilt.replace(/_{3,}/, fill));
    else if (/_{3,}/.test(rebuilt)) issues.push("canonical-blank-fill-failed");
  }
  // 어휘 교정
  if (rebuilt && vocabM) {
    // 함대 산출에는 original 이 null 인 항목이 있다(해설지에 한국어 뜻만 있고 영어 교정어가 없는 경우) — 채택 금지.
    const raw = VOCAB_CORRECTIONS[key];
    const usable = raw && typeof raw.planted === "string" && raw.planted.trim() && typeof raw.original === "string" && raw.original.trim() ? raw : null;
    if (raw && !usable) notes.push("NOTE:vocab-correction-incomplete(original 없음)");
    const vc = usable || (corpus?.plantedError?.planted && corpus?.plantedError?.original
      ? { planted: corpus.plantedError.planted, original: corpus.plantedError.original, evidence: "corpus.plantedError" }
      : null);
    if (vc) {
      vocabCorrection = vc;
      if (rebuilt.includes(vc.planted)) rebuilt = rebuilt.replace(vc.planted, vc.original);
      else notes.push("NOTE:vocab-planted-not-in-rebuilt");
    } else if (!corpus) {
      issues.push("vocab-correction-missing");
    }
  }

  if (corpus?.text) {
    canonicalPassage = tidy(corpus.text);
    textSource = "corpus+origin";
    if (rebuilt) {
      const sim = similarity(rebuilt, canonicalPassage);
      if (sim < 0.9) notes.push(`NOTE:canonical-oracle sim=${sim.toFixed(3)}`);
      gates.oracleSim = Number(sim.toFixed(3));
    }
  } else {
    canonicalPassage = rebuilt;
  }
  if (!canonicalPassage) {
    return { ...base, status: "unsupported", unsupportedReason: "no-canonical", unsupportedQNums, unsupportedWhy, issues, notes, gates };
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  let layout;
  if (orderM && perms && hasBlocks && answers[orderM.qNum]) {
    const perm = perms[answers[orderM.qNum].answer - 1] || "";
    const canonOrder = fullPerm ? perm.split("") : ["A", ...perm.split("")];
    const layoutNoHash = {
      type: "SENTENCE_ORDER",
      blocks: blocks.map((b, i) => {
        const L = b.label.replace(/[()]/g, "");
        return { label: b.label, text: b.text, canonicalIndex: canonOrder.indexOf(L), displayOrder: i };
      }),
      fullPassage: displayed,
    };
    layout = { ...layoutNoHash, fingerprintHash: sha256(layoutNoHash) };
  } else {
    const layoutNoHash = { type: "NONE", fullPassage: displayed };
    layout = { ...layoutNoHash, fingerprintHash: sha256(layoutNoHash) };
    if (hasBlocks && !orderM) notes.push("NOTE:blocks-without-order-member → layout NONE");
  }

  // preview(멤버 목록 행용) — 표시 베이스 머리 140자
  const previewBase = tidy(stripLabels(displayed));
  const preview = previewBase.length > 140 ? previewBase.slice(0, 140) + "…" : previewBase;
  for (const mem of members) mem.preview = preview;

  const set = {
    ...base,
    memberIds: members.map((m) => m.id),
    unsupportedQNums: [...new Set(unsupportedQNums)].sort((a, b) => a - b),
    displayedPassage: displayed,
    canonicalPassage,
    layout,
    footnotes,
    provenance: {
      textSource,
      answerSource: [...answerSources].join("+") || "none",
      vocabCorrection: vocabCorrection || null,
      ...(blankInfo ? { blankSource: blankInfo.source } : {}),
      passageSource: ex.source,
    },
    members,
    unsupportedWhy,
    issues,
    notes,
    gates,
  };
  runGates(set, { hasBlocks, blocks, orderM, perms, answers, needLetters, spans, spanStarts, fullPerm });
  set.status = set.issues.length ? "pending" : "ok";
  return set;
}

// ── 게이트 S1~S8(§12.3) ───────────────────────────────────────────────────────

function runGates(set, ctx) {
  const g = set.gates;
  const fail = (s) => set.issues.push(s);

  // S1 — 멤버 수 = qNums 수(부분 세트는 unsupportedQNums 로 계상)
  const covered = new Set([...set.members.map((m) => m.qNum), ...set.unsupportedQNums]);
  g.S1 = covered.size === set.qNums.length && set.qNums.every((q) => covered.has(q));
  if (!g.S1) fail(`S1:member-coverage(${set.members.length}+${set.unsupportedQNums.length}/${set.qNums.length})`);
  if (set.unsupportedQNums.length) set.notes.push(`NOTE:partial-set(missing ${set.unsupportedQNums.join(",")})`);

  // S2 — 블록 세트는 (A)(B)(C)(D) 4개가 순서대로
  if (ctx.orderM) {
    const labels = ctx.blocks.map((b) => b.label).join("");
    // 구형 전순열 세트는 (A)(B)(C) 3단락이 정본이다(위 fullPerm 주석 참조).
    g.S2 = ctx.hasBlocks && (ctx.fullPerm
      ? ctx.blocks.length === 3 && labels === "(A)(B)(C)"
      : ctx.blocks.length === 4 && labels === "(A)(B)(C)(D)");
    if (!g.S2) fail(`S2:blocks=${labels || "none"}`);
  } else g.S2 = null;

  // S3 — (a)~(e) 5개 스팬이 표시 베이스에서 wordStrict+surrounding 으로 유일 위치 확정
  if (ctx.needLetters) {
    const base = set.displayedPassage;
    const bad = [];
    const list = [];
    for (let i = 0; i < (ctx.spans || []).length; i++) if (ctx.spans[i]) list.push({ sp: ctx.spans[i], at0: ctx.spanStarts[i] });
    for (const { sp, at0 } of list) {
      const uniqueCtx = base.split(sp.surroundingText).length - 1;
      const at = locateWordStrict(base, sp.spanText, sp.surroundingText);
      if (at === null) bad.push(`${sp.spanText}:unresolved`);
      else if (uniqueCtx !== 1) bad.push(`${sp.spanText}:ctx×${uniqueCtx}`);
      else if (at !== at0) bad.push(`${sp.spanText}:pos${at}≠${at0}`);
    }
    g.S3 = list.length === 5 && bad.length === 0;
    if (!g.S3) fail(`S3:spans(${list.length}/5)${bad.length ? " " + bad.join(",") : ""}`);
  } else g.S3 = null;

  // S4 — 선지 5 · 정답 1..5 · 한국어 발문 · 물음표
  const s4 = [];
  for (const m of set.members) {
    if (!Array.isArray(m.options) || m.options.length !== 5 || m.options.some((o) => !tidy(o.text))) s4.push(`q${m.qNum}:options`);
    const a = Number(m.correctAnswer);
    if (!Number.isInteger(a) || a < 1 || a > 5) s4.push(`q${m.qNum}:answer`);
    if (!hasHangul(m.direction)) s4.push(`q${m.qNum}:direction-ko`);
    else if (!/[?？]\s*$/.test(m.direction)) s4.push(`q${m.qNum}:direction-?`);
  }
  g.S4 = s4.length === 0;
  if (!g.S4) fail(`S4:${s4.join(",")}`);

  // S5 — canonical 어수 150~600 · 한글 0 · 라벨 0 · 사설영역 0
  const c = set.canonicalPassage;
  const wc = wordCount(c);
  const s5 = [];
  // 어수 하한은 **세트 모양별**이다. 150 은 (A)~(D) 4단락 서사(43-45·46-48)를 기준으로 잡은 값인데,
  // 구형 2문항 세트(41-42 · 46-47 · 49-50)의 실제 인쇄 지문은 그보다 짧다 — 실측 최저 139w
  // (ebsi_go1_20110901 46-47 · ebsi_go1_20130313 41-42, PNG 로 박스 전체가 그 길이임을 확인).
  // 하한을 통째로 낮추면 절단 탐지력이 죽으므로 순서 멤버가 있는 세트만 150 을 유지한다(실측 최저 211).
  const wcFloor = ctx.orderM ? 150 : 130;
  if (wc < wcFloor || wc > 600) s5.push(`wc=${wc}`);
  if (hasHangul(c)) s5.push("hangul");
  if (/[\p{Co}]/u.test(c)) s5.push("pua");
  if (/\((?:[A-D]|[a-e])\)\s/.test(c)) s5.push("label");
  if (/_{3,}/.test(c)) s5.push("blank");
  g.S5 = s5.length === 0;
  if (!g.S5) fail(`S5:${s5.join(",")}`);
  g.canonicalWords = wc;

  // S6 — 43 정답 순열이 인쇄 순열표 안에 있음
  if (ctx.orderM) {
    const a = ctx.answers[ctx.orderM.qNum]?.answer;
    g.S6 = Boolean(ctx.perms && a && ctx.perms[a - 1] && ctx.perms[a - 1].length === 3);
    if (!g.S6) fail(`S6:order-answer(${a ?? "none"})`);
  } else g.S6 = null;

  // S7 — 내용일치(45) 선지 한국어
  const cm = set.members.filter((m) => m.subType === "CONTENT_MATCH");
  if (cm.length) {
    const bad = cm.filter((m) => !m.options.every((o) => hasHangul(o.text)));
    g.S7 = bad.length === 0;
    if (!g.S7) fail(`S7:content-match-ko(${bad.map((m) => "q" + m.qNum).join(",")})`);
  } else g.S7 = null;

  // S8 — 세트 키·멤버 id 유일, 기존 questions.json id 충돌 0
  const dup = set.memberIds.filter((id, i) => set.memberIds.indexOf(id) !== i);
  const clash = set.memberIds.filter((id) => EXISTING_IDS.has(id));
  g.S8 = dup.length === 0 && clash.length === 0 && !EXISTING_IDS.has(set.key);
  if (!g.S8) fail(`S8:id(dup=${dup.length},clash=${clash.length})`);

  // S9 — **고아 마커 금지**(부분 세트의 함정, 26-09-08 감독 육안이 잡음).
  //   멤버가 빠지면 그 멤버가 쓰던 마커가 지문에 그대로 남는다: 42(어휘)가 빠졌는데 (a)~(e) 밑줄이
  //   남거나, 2빈칸형 42 가 빠졌는데 (A)(B) 빈칸 라벨만 남거나, 43(순서)이 빠졌는데 **뒤섞인 순서의**
  //   (A)~(D) 단락이 남는다. 실물 확인: 2017 수능 41-42 는 41(제목)만 남았는데 지문 한가운데
  //   「usually (A) psychological clock」·「is (B) for batter number one」 이 정체불명으로 찍혔다.
  //   학생이 읽을 수 없는 지문이므로 출하 금지(pending) — 「보이는데 못 푸는」 상태 금지(§2-9).
  const liveMembers = set.members.filter((m) => !(set.unsupportedQNums ?? []).includes(m.qNum));
  const dp = set.displayedPassage || "";
  const lowerLabels = [...new Set(dp.match(/\([a-e]\)/g) || [])];
  const blockLabels = (set.layout?.blocks ?? []).map((b) => b.label);
  const upperLabels = [...new Set((dp.match(/\([A-E]\)(?=\s)/g) || []))].filter((u) => !blockLabels.includes(u));
  const needsLower = liveMembers.some((m) => m.typeGroup === "어휘" || m.typeGroup === "지칭");
  const orphans = [];
  if (lowerLabels.length > 0 && !needsLower) orphans.push(`lower:${lowerLabels.join("")}`);
  if (upperLabels.length > 0) orphans.push(`upper:${upperLabels.join("")}`);
  g.S9 = orphans.length === 0;
  if (!g.S9) fail(`S9:orphan-marker(${orphans.join(" ")})`);
}

// ── 드라이버 ──────────────────────────────────────────────────────────────────

const files = readdirSync(ORIGIN_DIR).filter((f) => f.endsWith(".json")).sort();
const sets = [];
const skipped = [];
let n = 0;
for (const f of files) {
  const examId = f.replace(/\.json$/, "");
  if (only && examId !== only) continue;
  if (n++ >= limit) break;
  const origin = loadOrigin(ORIGIN_DIR, examId);
  if (!origin) { skipped.push({ examId, why: "no-origin" }); continue; }
  const meta = metaOf(examId);
  if (!meta) { skipped.push({ examId, why: "no-meta" }); continue; }
  for (const cand of findSetCandidates(origin)) {
    try {
      sets.push(buildSet(origin, cand, meta));
    } catch (e) {
      sets.push({
        key: setKeyOf(examId, cand.qNums), examId, qNums: cand.qNums, label: `${cand.from}~${cand.to}`,
        status: "unsupported", unsupportedReason: `EXC:${e.message}`, issues: [`EXC:${e.message}`], notes: [], gates: {},
      });
    }
  }
}

// 전역 id 유일성(세트 간) 재검사 — S8 보강
{
  const seen = new Map();
  for (const s of sets) for (const id of s.memberIds || []) {
    if (seen.has(id)) { s.issues.push(`S8:global-dup:${id}`); s.status = "pending"; s.gates.S8 = false; }
    seen.set(id, s.key);
  }
  const keys = new Map();
  for (const s of sets) {
    if (keys.has(s.key)) { s.issues.push(`S8:dup-set-key`); s.status = "pending"; }
    keys.set(s.key, true);
  }
}

// ── 통계 ──────────────────────────────────────────────────────────────────────

const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
const stats = {
  totalSets: sets.length, ok: 0, pending: 0, unsupported: 0,
  members: { total: 0, byType: {} },
  shape: { "43-45": { total: 0, ok: 0, pending: 0, unsupported: 0 }, "41-42": { total: 0, ok: 0, pending: 0, unsupported: 0 }, other: { total: 0, ok: 0, pending: 0, unsupported: 0 } },
  // family: 현대형(41-42·43-45) vs 구형(2005~2013 46-48/49-50 …) — ExamPassage.era 와는 다른 축
  family: { modern: { total: 0, ok: 0, pending: 0, unsupported: 0 }, legacy: { total: 0, ok: 0, pending: 0, unsupported: 0 } },
  byYear: {}, byGrade: {}, byBoard: {}, reasons: {}, issues: {}, notes: {}, answerSources: {}, gatesFailed: {},
  skipped,
  inputs: { answersExtra: _ans.src, vocabCorrections: _voc.src, origins: files.length },
};
for (const s of sets) {
  stats[s.status] = (stats[s.status] || 0) + 1;
  const shape = s.label === "43~45" ? "43-45" : s.label === "41~42" ? "41-42" : "other";
  const modern = s.label === "43~45" || s.label === "41~42";
  stats.shape[shape].total++; stats.shape[shape][s.status]++;
  const fam = modern ? "modern" : "legacy";
  stats.family[fam].total++; stats.family[fam][s.status]++;
  const cell = (m, k) => { const c = (m[k] ||= { total: 0, ok: 0, pending: 0, unsupported: 0 }); c.total++; c[s.status]++; };
  cell(stats.byYear, String(s.year ?? "?"));
  cell(stats.byGrade, String(s.grade ?? "?"));
  cell(stats.byBoard, String(s.board ?? "?"));
  if (s.status === "unsupported") bump(stats.reasons, s.unsupportedReason || "?");
  for (const i of s.issues || []) bump(stats.issues, String(i).replace(/[:(].*$/, "").slice(0, 40));
  for (const i of s.notes || []) bump(stats.notes, String(i).replace(/^q\d+\s*/, "").replace(/^NOTE:/, "").replace(/[:(].*$/, "").slice(0, 44));
  if (s.provenance?.answerSource) bump(stats.answerSources, s.provenance.answerSource);
  for (const [k, v] of Object.entries(s.gates || {})) if (v === false) bump(stats.gatesFailed, k);
  for (const m of s.members || []) { stats.members.total++; bump(stats.members.byType, m.typeGroup); }
}
stats.issuesTop = Object.entries(stats.issues).sort((a, b) => b[1] - a[1]).slice(0, 10);
stats.reasonsTop = Object.entries(stats.reasons).sort((a, b) => b[1] - a[1]).slice(0, 10);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/sets-draft.json`, JSON.stringify(sets));
writeFileSync(`${OUT_DIR}/sets-stats.json`, JSON.stringify(stats, null, 1));

console.log(`inputs: answers-extra=${_ans.src} · vocab-corrections=${_voc.src} · origins=${files.length}`);
console.log(`sets ${stats.totalSets} · ok ${stats.ok} · pending ${stats.pending} · unsupported ${stats.unsupported} · members ${stats.members.total}`);
for (const [k, v] of Object.entries(stats.shape)) console.log(`  ${k.padEnd(6)} total ${String(v.total).padStart(4)} ok ${String(v.ok).padStart(4)} pending ${String(v.pending).padStart(4)} unsup ${v.unsupported}`);
console.log("reasons:", stats.reasonsTop.map(([k, v]) => `${k}=${v}`).join(" | "));
console.log("issues :", stats.issuesTop.map(([k, v]) => `${k}=${v}`).join(" | "));
console.log("members:", Object.entries(stats.members.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" | "));
