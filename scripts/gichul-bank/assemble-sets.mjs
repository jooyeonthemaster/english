// 장문 세트 조립(§12.3 단계 D) — sets-draft.json(ok) →
//   1) src/data/exam-passages/question-sets.json      (ExamBankSet[] · 은행 정준 정렬)
//   2) src/data/exam-passages/questions.json          (세트 멤버 병합 — 멱등: id 에 '#' 있는 기존 항목 전량 교체)
//   3) src/data/exam-passages/questions-facets.json    (재계산 · typeGroup 에 지칭/장문 축)
//   4) 코퍼스 append(코퍼스에 없는 세트 지문만): passages.json / facets.json / problems.json
//   5) 되돌림 원장: .tmp-gichul-bank/sets/corpus-append-reversal.json
//
// 사용: node scripts/gichul-bank/assemble-sets.mjs [--dry]
// 불변식: **기존 행은 절대 수정하지 않는다**(추가만). 재실행해도 같은 결과(멱등·결정론).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tidy, wordCount } from "./lib/text.mjs";
import { stripLabels } from "./lib/sets.mjs";

const REPO = process.cwd();
const DATA = `${REPO}/src/data/exam-passages`;
const OUT = `${REPO}/.tmp-gichul-bank/sets`;
const DRY = process.argv.includes("--dry");
const RESTORED_AT = "2026-09-08";

// 정준 정렬 축 — assemble-bank.mjs 와 **같은 규칙**(회차 순서 배열까지 동일해야 두 파일이 한 순서로 읽힌다).
const EXAM_ORDER = ["수능", "9월", "6월", "예비", "3월", "4월", "5월", "7월", "10월", "11월", "12월", "8월"];
// 유형 축 — 기존 13 + 장문 세트 2(§12.2 EXAM_BANK_TYPE_GROUPS 와 같은 순서)
const TYPE_ORDER = ["주장", "함축의미", "요지", "주제", "제목", "내용일치", "어법", "어휘", "빈칸추론", "무관한문장", "글의순서", "문장삽입", "요약문", "지칭", "장문"];

const rj = (p, fb = null) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb);
/** origin 의 sourcePdf(problems.json 계약 필드) — examId 당 1회만 읽는다 */
const SOURCE_PDF = new Map();
const sourcePdfOf = (examId) => {
  if (!SOURCE_PDF.has(examId)) {
    const o = rj(`${REPO}/.tmp-gichul-bank/origin/${examId}.json`, null);
    SOURCE_PDF.set(examId, o?.sourcePdf ?? null);
  }
  return SOURCE_PDF.get(examId);
};
const draft = rj(`${OUT}/sets-draft.json`, []);
const okSets = draft.filter((s) => s.status === "ok");
if (okSets.length === 0) throw new Error("sets-draft.json 에 ok 세트가 없다 — build-sets.mjs 를 먼저 돌려라");

/**
 * 세트 각주 정규화(조립 단계) — 렌더 계약 방어. 실측 근거(A6 게이트 S-R4/S-R7):
 *  ① 표제어 없는 마커 조각("*")은 각주가 아니다 — 추출기 tail 분할 잔재(scripts/gichul-bank/lib/sets.mjs:159
 *     TAIL_FOOT_RE 의 split 잔여). 남겨 두면 각주 블록 머리가 "*  * regiment…" 가 되어
 *     paper-builder/text-normalization.ts 의 PASSAGE_FOOTNOTE_BLOCK_RE(`^[*＊]\s*[A-Za-z]`)가
 *     각주로 인식하지 못하고 **43-45 4단락이 통짜로 붙는다**(ebsi_go3_20140710).
 *  ② 마커 수 오름차순(인쇄 관행 `* …` → `** …`). 추출기는 q42 슬라이스 각주를 먼저 담아
 *     "** amputate…"가 머리에 오는 회차가 있다(ebsi_go3_20150709 — PDF 원문은 `* kerosene` 이 먼저).
 * 본문 자구는 건드리지 않는다(정렬·제거만).
 */
const MARKER_ONLY_RE = /^[*＊]{1,3}\s*$/;
function normalizeFootnotes(list) {
  const kept = (list || []).map((f) => tidy(f)).filter((f) => f && !MARKER_ONLY_RE.test(f));
  const stars = (f) => (f.match(/^[*＊]{1,3}/) || [""])[0].length;
  return kept.map((f, i) => [f, i]).sort((a, b) => stars(a[0]) - stars(b[0]) || a[1] - b[1]).map(([f]) => f);
}

/**
 * provenance.vocabCorrection 은 §12.2 계약상 `{planted, original, evidence}` **3필드**다.
 * build-sets 는 함대 산출 레코드를 통째로 실어 보낸다(originCrossCheck·koreanGloss·note·solPage …) —
 * question-sets.json 은 API 응답 `sets` 로 브라우저까지 나가므로 계약 밖 필드는 여기서 잘라낸다.
 */
function trimProvenance(p) {
  const vc = p?.vocabCorrection;
  return {
    ...p,
    vocabCorrection: vc && vc.planted && vc.original ? { planted: vc.planted, original: vc.original, evidence: String(vc.evidence ?? "") } : null,
  };
}

// ── 1) question-sets.json ────────────────────────────────────────────────────
const setSort = (a, b) =>
  b.year - a.year ||
  EXAM_ORDER.indexOf(a.exam) - EXAM_ORDER.indexOf(b.exam) ||
  String(a.grade).localeCompare(String(b.grade)) ||
  String(a.examId).localeCompare(String(b.examId)) ||
  (a.qNums[0] ?? 0) - (b.qNums[0] ?? 0);

const setsOut = okSets
  .map((s) => ({
    key: s.key,
    passageId: s.passageId,
    examId: s.examId,
    year: s.year,
    exam: s.exam,
    board: s.board,
    grade: s.grade,
    era: s.era,
    form: s.form || "",
    qNums: s.qNums,
    label: s.label,
    memberIds: s.memberIds,
    unsupportedQNums: s.unsupportedQNums || [],
    displayedPassage: s.displayedPassage,
    canonicalPassage: s.canonicalPassage,
    layout: s.layout,
    footnotes: normalizeFootnotes(s.footnotes),
    passageTitle: s.passageTitle,
    provenance: trimProvenance(s.provenance),
  }))
  .sort(setSort);

// ── 2) questions.json 병합(멱등) ─────────────────────────────────────────────
const questionsPath = `${DATA}/questions.json`;
const existingAll = rj(questionsPath, []);
const beforeTotal = existingAll.length;
// 멱등 — 세트 멤버(id 에 '#')는 전량 걷어내고 다시 넣는다. 단일 문항 행은 손대지 않는다.
const singles = existingAll.filter((x) => !String(x.id).includes("#"));
const removedMembers = beforeTotal - singles.length;

const memberOut = okSets.flatMap((s) =>
  s.members.map((m) => ({
    id: m.id,
    passageId: m.passageId,
    examId: m.examId,
    year: m.year,
    exam: m.exam,
    board: m.board,
    grade: m.grade,
    era: m.era,
    form: m.form || "",
    qNum: m.qNum,
    typeGroup: m.typeGroup,
    subType: m.subType,
    points: m.points,
    direction: m.direction,
    questionText: m.questionText,
    options: m.options,
    correctAnswer: m.correctAnswer,
    structuredData: m.structuredData,
    passageTitle: m.passageTitle,
    footnotes: m.footnotes || [],
    preview: m.preview,
    verified: [...new Set([...(m.verified || []), "gates:S1-S8"])],
    setKey: m.setKey,
    setLabel: m.setLabel,
    setQNums: m.setQNums,
  })),
);

const itemSort = (a, b) =>
  b.year - a.year ||
  EXAM_ORDER.indexOf(a.exam) - EXAM_ORDER.indexOf(b.exam) ||
  String(a.grade).localeCompare(String(b.grade)) ||
  String(a.examId).localeCompare(String(b.examId)) ||
  a.qNum - b.qNum;
const items = [...singles, ...memberOut].sort(itemSort);

// 불변식 — 세트 멤버는 인접(정준 정렬만으로 성립해야 한다: 같은 examId·연속 qNum·같은 번호의 단일 항목 없음)
const adjacency = [];
{
  const seen = new Map();
  for (let i = 0; i < items.length; i++) {
    const k = items[i].setKey;
    if (!k) continue;
    const prev = seen.get(k);
    if (prev !== undefined && prev !== i - 1) adjacency.push(`${k}: ${prev} → ${i}`);
    seen.set(k, i);
  }
}
if (adjacency.length) throw new Error(`세트 멤버 비인접 ${adjacency.length}건: ${adjacency.slice(0, 5).join(" | ")}`);
// id 유일성
{
  const ids = new Set();
  for (const x of items) {
    if (ids.has(x.id)) throw new Error(`id 중복: ${x.id}`);
    ids.add(x.id);
  }
}

// ── 3) questions-facets.json ────────────────────────────────────────────────
const tally = (list, key) => list.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});
const typeCounts = tally(items, "typeGroup");
// §12.2 — 「장문」 축은 세트 멤버 전부(가상 축: 멤버 개별 typeGroup 과 겹친다). 「지칭」은 44 멤버(실축).
typeCounts["장문"] = memberOut.length;
const facetsQ = {
  total: items.length,
  years: [...new Set(items.map((x) => x.year))].sort((a, b) => b - a),
  exams: EXAM_ORDER.filter((e) => items.some((x) => x.exam === e)),
  grades: ["고3", "고2", "고1"].filter((g) => items.some((x) => x.grade === g)),
  boards: ["대학수학능력시험", "수능모의평가", "학력평가"].filter((b) => items.some((x) => x.board === b)),
  typeGroups: TYPE_ORDER.filter((t) => (typeCounts[t] || 0) > 0),
  counts: {
    year: tally(items, "year"),
    exam: tally(items, "exam"),
    grade: tally(items, "grade"),
    board: tally(items, "board"),
    typeGroup: typeCounts,
  },
};

// ── 4) 코퍼스 append ────────────────────────────────────────────────────────
const passagesPath = `${DATA}/passages.json`;
const facetsPath = `${DATA}/facets.json`;
const problemsPath = `${DATA}/problems.json`;
const passages = rj(passagesPath, []);
const facetsC = rj(facetsPath, null);
const problems = rj(problemsPath, {});
const passageIds = new Set(passages.map((p) => p.id));

/** 심긴 어휘 오류의 원문 인용(인쇄본 = 오답 단어) — plantedError.excerpt */
function plantedExcerpt(displayed, planted) {
  const base = tidy(stripLabels(displayed));
  const i = base.indexOf(planted);
  if (i < 0) return "";
  return base.slice(Math.max(0, i - 30), Math.min(base.length, i + planted.length + 34)).trim();
}

function reconKindOf(set) {
  if (set.layout?.type === "SENTENCE_ORDER") return "order";
  if (set.provenance?.vocabCorrection) return "vocab_error";
  if (set.members.some((m) => m.subType === "BLANK_INFERENCE")) return "blank";
  return "none";
}

const appendRows = [];
const appendProblems = [];
const skippedProblems = [];
for (const s of okSets.slice().sort(setSort)) {
  if (passageIds.has(s.key)) continue; // 코퍼스에 이미 있는 세트(평가원 대부분) — 기존 행 불변
  const kind = reconKindOf(s);
  const vc = s.provenance?.vocabCorrection || null;
  const answer = {};
  for (const m of s.members) answer[String(m.qNum)] = Number(m.correctAnswer);
  const row = {
    id: s.key,
    examId: s.examId,
    year: s.year,
    exam: s.exam,
    form: s.form || "",
    board: s.board,
    era: s.era,
    qNumbers: s.qNums,
    type: `장문(${s.qNums[0]}-${s.qNums[s.qNums.length - 1]})`,
    typeGroup: "장문",
    answer,
    reconstructionKind: kind,
    confidence: String(s.provenance?.answerSource || "").startsWith("official") ? "high" : "medium",
    // §12.1-6(감독 지시): 41-42 어휘형만 true. 본문(text)은 **교정 원문**이다(인쇄본의 오답 단어는 plantedError 에 기록).
    hasDeliberateError: kind === "vocab_error",
    wordCount: wordCount(s.canonicalPassage),
    text: s.canonicalPassage,
    grade: s.grade,
    ...(kind === "vocab_error" && vc
      ? {
          plantedError: {
            planted: vc.planted,
            original: vc.original,
            excerpt: plantedExcerpt(s.displayedPassage, vc.planted),
            verifiedBy: "sol-pdf",
            restoredAt: RESTORED_AT,
          },
        }
      : {}),
  };
  appendRows.push(row);

  if (problems[s.key]) { skippedProblems.push(s.key); continue; } // 이미 있는 회차(2027_09) — 덮어쓰지 않는다
  // rawProblems / answerKey — 기존 세트 항목과 같은 모양(answerKey 는 qNum → 세트 전체 정답 맵)
  const rawProblems = s.members.map((m) => ({
    qNum: m.qNum,
    kind: m.subType === "REFERENCE" || m.subType === "VOCAB_CHOICE" ? "vocab_letter" : "mc",
    stem: `${m.qNum}. ${m.direction}`,
    choices: m.options.map((o) => o.text),
    point: m.points === 2 ? null : m.points,
  }));
  appendProblems.push([s.key, { examId: s.examId, rawProblems, answerKey: Object.fromEntries(s.members.map((m) => [String(m.qNum), answer])), sourcePdf: sourcePdfOf(s.examId) }]);
}

// facets.json 재계산 — **모양 유지**: 기존 배열 순서를 보존하고 새로 등장한 값만 정준 순서로 덧붙인다
// (기존 facets.exams 에는 12월·8월이 빠져 있다 — 선재 결손이라 여기서 손대지 않는다).
// 지난 실행이 넣었지만 **이번엔 ok 가 아닌** 세트 지문은 걷어낸다(멱등). 안 걷어내면 pending 으로
// 강등된 세트의 지문이 코퍼스에 남아 「기출 지문」 탭에 노출된다 — 그 지문들은 하필 고아 마커(빠진
// 멤버의 (a)~(e)·뒤섞인 (A)~(D))를 안고 있어 학생이 읽을 수 없다(26-09-08 실측 8건).
// 기준선(baseline)에 있던 지문은 우리가 넣은 것이 아니므로 절대 건드리지 않는다.
const _baseIds = new Set((rj(`${OUT}/corpus-baseline.json`, { passageIds: [] }).passageIds) || []);
const _okKeys = new Set(setsOut.map((s) => s.key));
const prunedPassages = passages.filter(
  (p) => _baseIds.has(p.id) || !(Array.isArray(p.qNumbers) && p.qNumbers.length > 1) || _okKeys.has(p.id),
);
const prunedCount = passages.length - prunedPassages.length;
const passagesAfter = [...prunedPassages, ...appendRows];
const tallyP = (key) => passagesAfter.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});
const extend = (prev, appearing, order) => {
  const have = new Set(prev);
  const extra = appearing.filter((v) => !have.has(v));
  extra.sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : String(a).localeCompare(String(b))));
  return [...prev, ...extra];
};
const newVals = (key) => [...new Set(appendRows.map((r) => r[key]).filter((v) => v !== undefined && v !== null))];
const facetsCOut = facetsC && {
  total: passagesAfter.length,
  years: [...new Set(passagesAfter.map((p) => p.year))].sort((a, b) => b - a),
  exams: extend(facetsC.exams, newVals("exam"), EXAM_ORDER),
  grades: extend(facetsC.grades, newVals("grade")),
  boards: extend(facetsC.boards, newVals("board")),
  eras: extend(facetsC.eras, newVals("era")),
  typeGroups: extend(facetsC.typeGroups, newVals("typeGroup")),
  reconKinds: extend(facetsC.reconKinds, newVals("reconstructionKind")),
  counts: {
    typeGroup: tallyP("typeGroup"),
    reconstructionKind: tallyP("reconstructionKind"),
    era: tallyP("era"),
    exam: tallyP("exam"),
    board: tallyP("board"),
    grade: tallyP("grade"),
  },
};

// ── 쓰기 ────────────────────────────────────────────────────────────────────
const stats = {
  sets: setsOut.length,
  members: memberOut.length,
  questions: { before: beforeTotal, removedMembers, singles: singles.length, after: items.length },
  corpusAppend: {
    passages: appendRows.length,
    passagesBefore: passages.length,
    passagesAfter: passagesAfter.length,
    problems: appendProblems.length,
    problemsSkippedExisting: skippedProblems,
    byReconKind: appendRows.reduce((m, r) => ((m[r.reconstructionKind] = (m[r.reconstructionKind] || 0) + 1), m), {}),
    plantedErrors: appendRows.filter((r) => r.plantedError).length,
    plantedExcerptMissing: appendRows.filter((r) => r.plantedError && !r.plantedError.excerpt).map((r) => r.id),
  },
  facets: {
    questionsTypeGroups: facetsQ.typeGroups,
    corpusTypeGroupDelta: facetsCOut
      ? Object.fromEntries(Object.entries(facetsCOut.counts.typeGroup).map(([k, v]) => [k, v - (facetsC.counts.typeGroup[k] || 0)]).filter(([, v]) => v))
      : {},
  },
};

if (DRY) {
  console.log(JSON.stringify(stats, null, 1));
  process.exit(0);
}

// 되돌림 기준선 — **최초 1회만** 남긴다(재실행이 append 0 이라 사후 계산으로는 원장을 못 만든다).
// 이미 있으면 절대 덮어쓰지 않는다: 두 번째 실행이 「추가분 0」 원장으로 되돌림을 무력화하던 결함(A6 실측).
const baselinePath = `${OUT}/corpus-baseline.json`;
const facetsBackup = `${OUT}/facets.before-sets.json`;
const qFacetsBackup = `${OUT}/questions-facets.before-sets.json`;
if (!existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify({ writtenAt: new Date().toISOString(), passageIds: passages.map((p) => p.id), problemKeys: Object.keys(problems) }));
  if (facetsC) copyFileSync(facetsPath, facetsBackup);
  if (existsSync(`${DATA}/questions-facets.json`)) copyFileSync(`${DATA}/questions-facets.json`, qFacetsBackup);
}
const baseline = rj(baselinePath, { passageIds: [], problemKeys: [] });
const basePassageIds = new Set(baseline.passageIds);
const baseProblemKeys = new Set(baseline.problemKeys);
const setKeySet = new Set(setsOut.map((s) => s.key));
// 원장은 기준선 대비 차분(재실행해도 같은 목록)
const reversalPassageIds = passagesAfter.filter((p) => setKeySet.has(p.id) && !basePassageIds.has(p.id)).map((p) => p.id);
const reversalProblemKeys = [...setKeySet].filter((k) => !baseProblemKeys.has(k) && (problems[k] || appendProblems.some(([kk]) => kk === k))).sort();

writeFileSync(`${DATA}/question-sets.json`, JSON.stringify(setsOut));
writeFileSync(questionsPath, JSON.stringify(items));
writeFileSync(`${DATA}/questions-facets.json`, JSON.stringify(facetsQ, null, 1));
writeFileSync(passagesPath, JSON.stringify(passagesAfter));
if (facetsCOut) writeFileSync(facetsPath, JSON.stringify(facetsCOut, null, 1));
if (appendProblems.length) {
  for (const [k, v] of appendProblems) problems[k] = v;
  writeFileSync(problemsPath, JSON.stringify(problems));
}

writeFileSync(
  `${OUT}/corpus-append-reversal.json`,
  JSON.stringify(
    {
      note: "되돌리려면: passages.json 에서 passageIds 를, problems.json 에서 problemKeys 를 지우고, facets.json 을 facetsBackup 으로 되돌린다. questions.json 은 id 에 '#' 있는 항목을 지우면 원상.",
      generatedAt: new Date().toISOString().slice(0, 10),
      baseline: `.tmp-gichul-bank/sets/corpus-baseline.json`,
      passageIds: reversalPassageIds,
      problemKeys: reversalProblemKeys,
      problemKeysSkippedExisting: skippedProblems,
      appendedThisRun: { passages: appendRows.map((r) => r.id), problems: appendProblems.map(([k]) => k) },
      questionSetKeys: setsOut.map((s) => s.key),
      questionMemberIds: memberOut.map((m) => m.id),
      facetsBackup: `.tmp-gichul-bank/sets/facets.before-sets.json`,
      questionsFacetsBackup: `.tmp-gichul-bank/sets/questions-facets.before-sets.json`,
      questionsFacetsBackupNote:
        "questions.json·questions-facets.json 은 git 미추적 산출물이다 — 세트를 통째로 되돌리려면 `node scripts/gichul-bank/assemble-bank.mjs`(1차 조립기)를 다시 돌리는 것이 정본 경로다. 이 백업은 그 결과와 같은 3,076건 facets 사본(A6 에서 재구성).",
      stats,
    },
    null,
    1,
  ),
);
writeFileSync(`${OUT}/assemble-sets-stats.json`, JSON.stringify(stats, null, 1));

console.log(`question-sets.json ${setsOut.length} sets · questions.json ${beforeTotal} → ${items.length} (멤버 ${memberOut.length}, 걷어낸 기존 멤버 ${removedMembers})`);
console.log(`corpus append: passages ${passages.length} → ${passagesAfter.length} (+${appendRows.length}, 걷어냄 ${prunedCount}) · problems +${appendProblems.length}${skippedProblems.length ? ` (기존 유지 ${skippedProblems.join(",")})` : ""}`);
console.log(`reconKind ${JSON.stringify(stats.corpusAppend.byReconKind)} · plantedError ${stats.corpusAppend.plantedErrors}`);
