// 기출 문제 은행 결정론 빌더 — passages.json + problems.json + passages.jsonl(recon) + origin/<exam>.json
//   → .tmp-gichul-bank/bank-draft.json (전 항목: ok | pending | unsupported) + 통계
// 사용: node scripts/gichul-bank/build-bank.mjs [--only <examId>] [--limit N]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { HANDLERS } from "./lib/handlers.mjs";
import { loadOrigin, originSlice } from "./lib/origin.mjs";
import { hasHangul, tidy, wordCount } from "./lib/text.mjs";
import { SUBTYPE_OF } from "./lib/serialize.mjs";

const REPO = process.cwd();
const ORIGIN_DIR = `${REPO}/.tmp-gichul-bank/origin`;
const OUT_DIR = `${REPO}/.tmp-gichul-bank`;
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const passages = JSON.parse(readFileSync(`${REPO}/src/data/exam-passages/passages.json`, "utf8"));
const problems = JSON.parse(readFileSync(`${REPO}/src/data/exam-passages/problems.json`, "utf8"));
// 형(型) 일치 공식 정답표(answer-keys.py) — 코퍼스 answer 는 홀수형 기준인데 2016~2021 수능 PDF 는 짝수형뿐이다(선지 순서 상이).
const ANSWER_KEYS = existsSync(`${OUT_DIR}/answer-keys.json`) ? JSON.parse(readFileSync(`${OUT_DIR}/answer-keys.json`, "utf8")) : {};
function officialAnswer(examId, form, qNum) {
  const k = ANSWER_KEYS[examId];
  if (!k) return null;
  // 2014 A/B 수준별 형은 examId 접미(_A/_B)가 형이다 — 정답표 페이지 라벨 "( A형 )"/"( B형 )" 로 갈라 둔 열을 쓴다
  const ab = /_([AB])$/.exec(examId)?.[1];
  const col = ab ? (k[ab] || null) : form === "even" ? k.even : (k.odd || k.single || k.even);
  if (!col) return null;
  const a = col.answers?.[String(qNum)];
  const pts = col.points?.[String(qNum)];
  return Number.isInteger(a) ? { answer: a, points: pts ?? null, form: form === "even" ? "even" : "odd" } : null;
}
const reconById = new Map();
for (const line of readFileSync(`${REPO}/english-exam-passages/passages.jsonl`, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  reconById.set(r.passageId, r.reconstruction);
}

function examTitle(p) {
  // src/lib/exam-passages/format.ts formatExamTitle 미러(제목 정본 — 앱에서 다시 계산하므로 여기선 참고용)
  const q = p.qNumbers.length === 1 ? String(p.qNumbers[0]) : `${Math.min(...p.qNumbers)}-${Math.max(...p.qNumbers)}`;
  const examLabel = { "수능": "수능", "6월": "6월 모평", "9월": "9월 모평", "예비": "예비시행" }[p.exam] || p.exam;
  const typeText = p.type.replace(/\s*\([^)]*\)\s*$/, "");
  const gradeTag = p.board === "학력평가" && p.grade ? `${p.grade} ` : "";
  return `${p.year}학년도 ${gradeTag}${examLabel}${p.form ? ` ${p.form}형` : ""} 영어 ${q}번 · ${typeText}`;
}

/** 결정론 게이트(G1~G7, G9) — 하나라도 실패하면 pending */
function gates(item, res) {
  const g = [];
  const opt = res.options || [];
  if (opt.length !== 5 && !(res.subType === "SENTENCE_INSERT" && opt.length >= 5 && opt.length <= 8)) g.push("G1:options!=5");
  if (opt.some((o) => !o || typeof o.text !== "string" || !tidy(o.text))) g.push("G1:empty-option");
  if (!res.correctAnswer) g.push("G1:no-answer");
  const qt = res.questionText || "";
  const passagePart = (() => {
    const sd = res.structuredData || {};
    return sd.passageWithBlank || sd.passageWithMarkers || sd.passageWithUnderline || sd.passageWithNumbers || (sd.paragraphs ? sd.paragraphs.map((x) => x.text).join(" ") : "") || res.passageContent || "";
  })();
  const passageBody = passagePart.split("\n\n")[0];
  if (hasHangul(passageBody.replace(/\*[^*\n]*:[^\n]*/g, ""))) g.push("G4:hangul-in-passage");
  if (/⟦|⟧|⟨|⟩/.test(qt)) g.push("G4:token-residue");
  const wc = wordCount(passageBody.replace(/__|_{3,}|\([a-eA-E]\)|[①-⑧]/g, " "));
  if (wc < 60 || wc > 450) g.push(`G6:wordcount=${wc}`);
  if (!res.direction || !hasHangul(res.direction)) g.push("G7:direction");
  const sd = res.structuredData || {};
  if (res.subType === "BLANK_INFERENCE" && (sd.passageWithBlank.match(/_{3,}/g) || []).length !== 1) g.push("G3:blank-count");
  if (res.subType === "SENTENCE_INSERT" && (sd.passageWithMarkers.match(/[①-⑧]/g) || []).length !== opt.length) g.push("G3:insert-markers");
  if (res.subType === "IRRELEVANT" && (sd.passageWithNumbers.match(/[①-⑤] __/g) || []).length !== 5) g.push("G3:irrelevant-markers");
  if (res.subType === "GRAMMAR_ERROR" && (sd.passageWithMarkers.match(/__\([A-E]\) [^_]+__/g) || []).length !== 5) g.push("G3:grammar-markers");
  if (res.subType === "VOCAB_CHOICE" && (sd.passageWithMarkers.match(/__\([a-e]\) [^_]+__/g) || []).length !== 5) g.push("G3:vocab-markers");
  if (res.subType === "SENTENCE_ORDER" && !(sd.paragraphs && sd.paragraphs.length === 3 && sd.givenSentence)) g.push("G3:order-parts");
  if (res.subType === "SUMMARY_COMPLETE_MC" && !(/\(A\)/.test(sd.summaryWithBlanks) && /\(B\)/.test(sd.summaryWithBlanks))) g.push("G3:summary-labels");
  if (res.subType === "IMPLIED_MEANING" && (sd.passageWithUnderline.match(/__[^_]+__/g) || []).length !== 1) g.push("G3:underline-count");
  if (opt.some((o) => /홀수형|짝수형|영어\s*영역|확인 사항|답안지|고[123]$/.test(o.text))) g.push("G1:furniture-in-option");
  return g;
}

const items = [];
const stats = { total: 0, ok: 0, pending: 0, unsupported: 0, byType: {}, issues: {} };
const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
let n = 0;
for (const p of passages) {
  const q = problems[p.id];
  if (!q) continue;
  if (only && p.examId !== only) continue;
  if (n++ >= limit) break;
  const typeGroup = p.typeGroup;
  const base = {
    id: p.id, passageId: p.id, examId: p.examId, year: p.year, exam: p.exam, board: p.board, grade: p.grade || "고3", era: p.era, form: p.form || "",
    qNum: p.qNumbers[0], qNumbers: p.qNumbers, typeGroup, type: p.type, passageTitle: examTitle(p), corpusAnswer: p.answer,
  };
  stats.total++;
  const st = (stats.byType[typeGroup] ||= { total: 0, ok: 0, pending: 0, unsupported: 0 });
  st.total++;
  if (typeGroup === "장문" || typeGroup === "지칭") {
    items.push({ ...base, status: "unsupported", unsupportedReason: typeGroup === "장문" ? "set" : "reference-odd-one-out" });
    stats.unsupported++; st.unsupported++; continue;
  }
  const handler = HANDLERS[typeGroup];
  if (!handler) { items.push({ ...base, status: "unsupported", unsupportedReason: `no-handler:${typeGroup}` }); stats.unsupported++; st.unsupported++; continue; }
  const origin = loadOrigin(ORIGIN_DIR, p.examId);
  const slice = origin ? originSlice(origin, p.qNumbers[0]) : null;
  const rawQ = q.rawProblems?.[0] || null;
  // 정답 확정: 공식 정답표(형 일치) > 코퍼스. 코퍼스와 다르면 복원 본문이 오염됐을 수 있으므로 오라클을 소프트로 강등한다.
  // 코퍼스 answer 가 비면 problems.json answerKey(같은 파이프라인의 정답표 파싱본)로 보충한다
  const akRaw = q.answerKey?.[String(p.qNumbers[0])];
  const ak = typeof akRaw === "number" ? akRaw : (akRaw && typeof akRaw === "object" ? Number(akRaw[String(p.qNumbers[0])]) : NaN);
  const corpusAns = typeof p.answer === "number" ? p.answer : Number.isInteger(ak) ? ak : null;
  const off = officialAnswer(p.examId, origin?.form, p.qNumbers[0]);
  const answer = off?.answer ?? corpusAns;
  const answerSource = off ? `official-${off.form}` : "corpus";
  const corpusConsistent = corpusAns === null || answer === corpusAns;
  if (!Number.isInteger(answer) || answer < 1 || answer > 5) {
    items.push({ ...base, status: "unsupported", unsupportedReason: "no-answer" }); stats.unsupported++; st.unsupported++; continue;
  }
  let res;
  try {
    res = handler({ p, q: rawQ, recon: reconById.get(p.id) || null, origin, slice, typeGroup, qNum: p.qNumbers[0], answer });
    if (!corpusConsistent) {
      // 코퍼스 오라클 불일치는 예상된 결과 — pending 사유에서 제외하고 NOTE 로 남긴다
      res.issues = res.issues.map((x) => (/오라클 불일치|recon\.removedSentence/.test(x) ? `NOTE:${x}` : x));
    }
  } catch (e) {
    res = { subType: SUBTYPE_OF[typeGroup], direction: "", questionText: "", options: [], correctAnswer: "", structuredData: {}, passageContent: "", issues: [`EXC:${e.message}`] };
  }
  const unsup = res.issues.find((x) => x.startsWith("UNSUPPORTED:"));
  if (unsup) { items.push({ ...base, status: "unsupported", unsupportedReason: unsup.slice(12) }); stats.unsupported++; st.unsupported++; continue; }
  const point = off?.points ?? slice?.cleaned.point ?? rawQ?.point ?? null;
  const points = point === 3 ? 3 : point === 1 ? 1 : 2;
  const notes = res.issues.filter((x) => x.startsWith("NOTE:"));
  const hard = res.issues.filter((x) => !x.startsWith("NOTE:"));
  const item = {
    ...base, subType: res.subType, points, direction: res.direction, questionText: res.questionText, options: res.options,
    correctAnswer: res.correctAnswer, structuredData: res.structuredData, passageContent: res.passageContent,
    passageContentOverride: res.passageContentOverride ?? null,
    footnotes: slice?.cleaned.footnotes || [], status: "ok", issues: hard, notes, gates: [],
    provenance: { form: origin?.form || null, answerSource, corpusConsistent, corrected: res.meta?.corrected ?? null },
  };
  if (hard.length === 0) item.gates = gates(item, res);
  if (item.issues.length || item.gates.length) { item.status = "pending"; stats.pending++; st.pending++; }
  else { stats.ok++; st.ok++; }
  for (const is of [...item.issues, ...item.gates]) bump(stats.issues, is.replace(/[:=].*$/, "").replace(/\d+회/, "N회").slice(0, 40));
  items.push(item);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/bank-draft.json`, JSON.stringify(items));
writeFileSync(`${OUT_DIR}/bank-stats.json`, JSON.stringify(stats, null, 1));
console.log(`total ${stats.total} · ok ${stats.ok} · pending ${stats.pending} · unsupported ${stats.unsupported}`);
for (const [k, v] of Object.entries(stats.byType).sort((a, b) => b[1].total - a[1].total)) console.log(`  ${k.padEnd(8)} total ${String(v.total).padStart(4)}  ok ${String(v.ok).padStart(4)}  pending ${String(v.pending).padStart(4)}  unsup ${v.unsupported}`);
console.log("issues:", Object.entries(stats.issues).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}=${v}`).join(" | "));
