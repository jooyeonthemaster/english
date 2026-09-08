// 은행 조립 — bank-draft.json(ok 항목) → src/data/exam-passages/questions.json(압축 1줄) + questions-facets.json
// 사용: node scripts/gichul-bank/assemble-bank.mjs [--include-pending]
import { readFileSync, writeFileSync } from "node:fs";
import { tidy } from "./lib/text.mjs";

const REPO = process.cwd();
const draft = JSON.parse(readFileSync(`${REPO}/.tmp-gichul-bank/bank-draft.json`, "utf8"));
const includePending = process.argv.includes("--include-pending");
const EXAM_ORDER = ["수능", "9월", "6월", "예비", "3월", "4월", "5월", "7월", "10월", "11월", "12월", "8월"];
const TYPE_ORDER = ["주장", "함축의미", "요지", "주제", "제목", "내용일치", "어법", "어휘", "빈칸추론", "무관한문장", "글의순서", "문장삽입", "요약문"];

function previewOf(item) {
  // 문두 미리보기: 발문 뒤 본문(빈칸/마커 유형) 또는 코퍼스 본문 앞 140자
  const sd = item.structuredData || {};
  const body = sd.passageWithBlank || sd.passageWithMarkers || sd.passageWithUnderline || sd.passageWithNumbers || sd.givenSentence || item.passageContent || "";
  const one = tidy(String(body).split("\n\n")[0]).replace(/__\(([A-Ea-e])\) ([^_]+)__/g, "$2").replace(/__([^_]+)__/g, "$1").replace(/\s{2,}/g, " ");
  return one.length > 140 ? one.slice(0, 140) + "…" : one;
}

// 함대 텍스트 수리(한글 띄어쓰기·선지 오염·각주 잡음) — apply-text-fixes.mjs 가 게이트를 통과시킨 것만 여기 있다.
// direction/options/footnotes 를 바꾸면 questionText·structuredData 의 같은 자구도 함께 바꿔 렌더 계약을 지킨다.
import { existsSync } from "node:fs";
const fixesPath = `${REPO}/scripts/gichul-bank/data/text-fixes.json`;
const TEXT_FIXES = existsSync(fixesPath) ? JSON.parse(readFileSync(fixesPath, "utf8")) : {};
const PASSAGE_KEYS = ["passageWithBlank", "passageWithMarkers", "passageWithUnderline", "passageWithNumbers", "summaryWithBlanks", "givenSentence"];
/** 각주 마커 앞뒤 공백 정규화 — PDF 가 「위계의** chromatic: 색채의*** lexicon」 처럼 붙여 내보낸다(전수 렌더 검수 실측 144건) */
function spaceFootnoteMarkers(s) {
  return String(s).replace(/(\S)(\*{2,3})\s*(?=[A-Za-z])/g, "$1 $2 ").replace(/(\*{1,3})\s{2,}(?=[A-Za-z])/g, "$1 ");
}
/** 영문·숫자·닫는 괄호 뒤 조사 앞 잉여 공백("Post 의", "kurinji 에") — PDF 서체 런 경계 잔재(검수 실측 11건) */
const PARTICLE_RE = /([A-Za-z\d)])\s+(은|는|이|가|을|를|의|에|와|과|로|도|에서|으로|에게|부터|까지)(?=[\s,.?!)]|$)/g;
const glueParticles = (s) => String(s).replace(PARTICLE_RE, "$1$2");
const EXCLUDED_PATH = `${REPO}/scripts/gichul-bank/data/excluded-ids.json`;
/** 은행에서 뺄 항목(그림 문항처럼 텍스트만으로 성립하지 않는 것) — 결정론 재생 입력 */
const EXCLUDED_IDS = new Set(existsSync(EXCLUDED_PATH) ? JSON.parse(readFileSync(EXCLUDED_PATH, "utf8")) : []);
function applyTextFixes(x0) {
  // 0) 전 항목 공통 정규화: 각주 마커 공백(각주 배열 + 본문 꼬리) · 조사 앞 공백(발문·선지)
  const x = { ...x0, structuredData: { ...(x0.structuredData || {}) } };
  {
    const d2 = glueParticles(x.direction || "");
    if (d2 !== x.direction) {
      const qt = String(x.questionText || "");
      x.questionText = qt.startsWith(x.direction) ? d2 + qt.slice(x.direction.length) : qt;
      x.direction = d2;
      if (typeof x.structuredData.direction === "string") x.structuredData.direction = d2;
    }
    if (Array.isArray(x.options)) x.options = x.options.map((o) => (o && typeof o.text === "string" ? { ...o, text: glueParticles(o.text) } : o));
    if (Array.isArray(x.structuredData.options)) x.structuredData.options = x.structuredData.options.map((o) => (o && typeof o === "object" && typeof o.text === "string" ? { ...o, text: glueParticles(o.text) } : o));
  }
  if (Array.isArray(x.footnotes) && x.footnotes.length) {
    const fixedFn = x.footnotes.map(spaceFootnoteMarkers);
    let qt0 = String(x.questionText || "");
    x.footnotes.forEach((before, i) => {
      const after = fixedFn[i];
      if (before === after) return;
      qt0 = qt0.split(before).join(after);
      for (const k of PASSAGE_KEYS) if (typeof x.structuredData[k] === "string") x.structuredData[k] = x.structuredData[k].split(before).join(after);
    });
    x.footnotes = fixedFn; x.questionText = qt0;
  }
  const f = TEXT_FIXES[x.id];
  if (!f) return x;
  const y = { ...x, structuredData: { ...(x.structuredData || {}) } };
  let qt = String(y.questionText || "");
  // 본문 자구 치환(하이픈 소실·대시 공백 등) — [from, to] 쌍, 본문·구조화 필드·단락 모두에 적용
  if (Array.isArray(f.bodyReplacements)) {
    for (const [from, to] of f.bodyReplacements) {
      qt = qt.split(from).join(to);
      for (const k of PASSAGE_KEYS) if (typeof y.structuredData[k] === "string") y.structuredData[k] = y.structuredData[k].split(from).join(to);
      if (Array.isArray(y.structuredData.paragraphs)) y.structuredData.paragraphs = y.structuredData.paragraphs.map((p) => (p && typeof p.text === "string" ? { ...p, text: p.text.split(from).join(to) } : p));
      if (y.passageContentOverride) y.passageContentOverride = y.passageContentOverride.split(from).join(to);
    }
  }
  if (f.direction && f.direction !== y.direction) {
    if (qt.startsWith(y.direction)) qt = f.direction + qt.slice(y.direction.length);
    y.direction = f.direction;
    if (typeof y.structuredData.direction === "string") y.structuredData.direction = f.direction;
    // 내용일치의 일치/불일치는 발문에서 파생 — 발문이 바뀌면 다시 계산(2005 수능 q32 극성 오류 실측)
    if (y.subType === "CONTENT_MATCH") y.structuredData.matchType = /않는|않은|일치하지/.test(f.direction) ? "불일치" : "일치";
  }
  // 요약문 문장 교정(라벨 자리·이웃 문장 혼입) — structuredData.summaryWithBlanks 와 questionText 의 「↓」 뒤 문장을 함께 바꾼다
  if (typeof f.summaryWithBlanks === "string" && f.summaryWithBlanks.trim() && typeof y.structuredData.summaryWithBlanks === "string") {
    const before = y.structuredData.summaryWithBlanks;
    if (before !== f.summaryWithBlanks) {
      qt = qt.split(before).join(f.summaryWithBlanks);
      y.structuredData.summaryWithBlanks = f.summaryWithBlanks;
    }
  }
  if (Array.isArray(f.options) && f.options.length === (y.options || []).length) {
    y.options = y.options.map((o, i) => ({ ...o, text: f.options[i] }));
    if (Array.isArray(y.structuredData.options)) y.structuredData.options = y.structuredData.options.map((o, i) => (o && typeof o === "object" ? { ...o, text: f.options[i] ?? o.text } : o));
  }
  if (Array.isArray(f.footnotes) && f.footnotes.length === (y.footnotes || []).length) {
    for (let i = 0; i < f.footnotes.length; i++) {
      const before = y.footnotes[i], after = f.footnotes[i];
      if (before === after) continue;
      qt = qt.split(before).join(after);
      for (const k of ["passageWithBlank", "passageWithMarkers", "passageWithUnderline", "passageWithNumbers"]) {
        if (typeof y.structuredData[k] === "string") y.structuredData[k] = y.structuredData[k].split(before).join(after);
      }
    }
    y.footnotes = [...f.footnotes];
  }
  y.questionText = qt;
  return y;
}

const items = draft
  .filter((x) => x.status === "ok" || (includePending && x.status === "pending"))
  .filter((x) => !EXCLUDED_IDS.has(x.id))
  .map(applyTextFixes)
  .map((x) => ({
    id: x.id, passageId: x.passageId, examId: x.examId, year: x.year, exam: x.exam, board: x.board, grade: x.grade, era: x.era, form: x.form,
    qNum: x.qNum, typeGroup: x.typeGroup, subType: x.subType, points: x.points, direction: x.direction, questionText: x.questionText,
    options: x.options, correctAnswer: x.correctAnswer, structuredData: x.structuredData, passageTitle: x.passageTitle,
    // passageContent 는 싣지 않는다 — 코퍼스(passages.json)와 중복(4MB). 반입 액션이 importExamPassages 로 코퍼스에서 해석한다.
    footnotes: x.footnotes || [], preview: previewOf(x),
    // 코퍼스 꼬리 절단 감지 항목만 원형(PDF) 본문을 실어 Passage.content 로 쓰게 한다(나머지는 코퍼스 정본)
    ...(x.passageContentOverride ? { passageContentOverride: x.passageContentOverride } : {}),
    verified: [...(x.provenance?.answerSource ? [`answer:${x.provenance.answerSource}`] : []), ...(x.status === "ok" ? ["gates:G1-G9"] : ["pending"]), ...(x.verified || [])],
  }))
  .sort((a, b) => b.year - a.year || EXAM_ORDER.indexOf(a.exam) - EXAM_ORDER.indexOf(b.exam) || a.grade.localeCompare(b.grade) || a.examId.localeCompare(b.examId) || a.qNum - b.qNum);

const tally = (key) => items.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});
const facets = {
  total: items.length,
  years: [...new Set(items.map((x) => x.year))].sort((a, b) => b - a),
  exams: EXAM_ORDER.filter((e) => items.some((x) => x.exam === e)),
  grades: ["고3", "고2", "고1"].filter((g) => items.some((x) => x.grade === g)),
  boards: ["대학수학능력시험", "수능모의평가", "학력평가"].filter((b) => items.some((x) => x.board === b)),
  typeGroups: TYPE_ORDER.filter((t) => items.some((x) => x.typeGroup === t)),
  counts: { year: tally("year"), exam: tally("exam"), grade: tally("grade"), board: tally("board"), typeGroup: tally("typeGroup") },
};
writeFileSync(`${REPO}/src/data/exam-passages/questions.json`, JSON.stringify(items));
writeFileSync(`${REPO}/src/data/exam-passages/questions-facets.json`, JSON.stringify(facets, null, 1));
console.log(`questions.json ${items.length} items (${(Buffer.byteLength(JSON.stringify(items)) / 1048576).toFixed(2)} MB) · facets`, JSON.stringify(facets.counts.typeGroup));
