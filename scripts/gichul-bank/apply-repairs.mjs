// 함대 복원 결과(repair-results.json: [{id,status,reason,item}]) → 게이트 재검증 → bank-draft.json 병합
// 사용: node scripts/gichul-bank/apply-repairs.mjs .tmp-gichul-bank/repair-results.json
import { readFileSync, writeFileSync } from "node:fs";
import { hasHangul, tidy, wordCount } from "./lib/text.mjs";

const REPO = process.cwd();
const draftPath = `${REPO}/.tmp-gichul-bank/bank-draft.json`;
const draft = JSON.parse(readFileSync(draftPath, "utf8"));
const results = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byId = new Map(draft.map((x) => [x.id, x]));

function gates(subType, item) {
  const g = [];
  const opt = item.options || [];
  const sd = item.structuredData || {};
  const qt = String(item.questionText || "");
  if (!item.direction || !hasHangul(item.direction)) g.push("G7:direction");
  if (!(opt.length === 5 || (subType === "SENTENCE_INSERT" && opt.length >= 5 && opt.length <= 8))) g.push("G1:options");
  if (opt.some((o) => !tidy(o.text))) g.push("G1:empty-option");
  if (!item.correctAnswer) g.push("G1:no-answer");
  if (/⟦|⟧|⟨|⟩/.test(qt)) g.push("G4:token");
  if (/\[(?:빈칸 정답|정답|모범 답안|해설)\]/.test(qt)) g.push("G4:answer-leak");
  const body = (sd.passageWithBlank || sd.passageWithMarkers || sd.passageWithUnderline || sd.passageWithNumbers || (sd.paragraphs ? sd.paragraphs.map((p) => p.text).join(" ") : "") || "").split("\n\n")[0];
  const src = ["TOPIC", "MAIN_IDEA", "TITLE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC"].includes(subType);
  if (!src) {
    if (hasHangul(body.replace(/\*[^*\n]*:[^\n]*/g, ""))) g.push("G4:hangul");
    const wc = wordCount(body.replace(/__|_{3,}|\([a-eA-E]\)|[①-⑧]/g, " "));
    if (wc < 60 || wc > 450) g.push(`G6:wc=${wc}`);
  } else {
    for (const k of ["passageWithBlank", "passageWithMarkers", "passageWithUnderline", "passageWithNumbers", "paragraphs"]) if (k in sd) g.push(`G4:source-has-${k}`);
    if (subType !== "SUMMARY_COMPLETE_MC" && qt.trim() !== item.direction.trim()) g.push("G4:source-questionText");
  }
  if (!qt.startsWith(item.direction)) g.push("G4:questionText-direction");
  switch (subType) {
    case "BLANK_INFERENCE": if ((String(sd.passageWithBlank || "").match(/_{3,}/g) || []).length !== 1) g.push("G3:blank"); if (!/^[1-5]$/.test(item.correctAnswer)) g.push("G3:ans"); break;
    case "SENTENCE_INSERT": if ((String(sd.passageWithMarkers || "").match(/[①-⑧]/g) || []).length !== opt.length) g.push("G3:markers"); if (!/^[①-⑧]$/.test(item.correctAnswer)) g.push("G3:ans"); if (!sd.givenSentence || !/\[주어진 문장\]/.test(qt)) g.push("G3:given"); break;
    case "IRRELEVANT": if ((String(sd.passageWithNumbers || "").match(/[①-⑤] __/g) || []).length !== 5) g.push("G3:markers"); if (!/^[①-⑤]$/.test(item.correctAnswer)) g.push("G3:ans"); break;
    case "GRAMMAR_ERROR": if ((String(sd.passageWithMarkers || "").match(/__\([A-E]\) [^_]+__/g) || []).length !== 5) g.push("G3:markers"); if (!/^\([A-E]\)$/.test(item.correctAnswer)) g.push("G3:ans"); if (!opt.every((o) => /^\([A-E]\)$/.test(o.label))) g.push("G3:labels"); break;
    case "VOCAB_CHOICE": if ((String(sd.passageWithMarkers || "").match(/__\([a-e]\) [^_]+__/g) || []).length !== 5) g.push("G3:markers"); if (!/^[1-5]$/.test(item.correctAnswer)) g.push("G3:ans"); break;
    case "SENTENCE_ORDER": if (!(Array.isArray(sd.paragraphs) && sd.paragraphs.length === 3 && sd.givenSentence)) g.push("G3:parts"); if (!/^[1-5]$/.test(item.correctAnswer)) g.push("G3:ans"); if (!/\[주어진 문장\]/.test(qt) || !/\n\(A\) /.test(qt)) g.push("G3:text"); break;
    case "SUMMARY_COMPLETE_MC": if (!(/\(A\)/.test(String(sd.summaryWithBlanks || "")) && /\(B\)/.test(String(sd.summaryWithBlanks || "")))) g.push("G3:labels"); if (!/↓\n/.test(qt)) g.push("G3:arrow"); if (!opt.every((o) => / …… /.test(o.text))) g.push("G3:pairs"); if (!/^[1-5]$/.test(item.correctAnswer)) g.push("G3:ans"); break;
    case "IMPLIED_MEANING": if ((String(sd.passageWithUnderline || "").match(/__[^_]+__/g) || []).length !== 1) g.push("G3:underline"); if (!/^[1-5]$/.test(item.correctAnswer)) g.push("G3:ans"); break;
    default: if (!/^[1-5]$/.test(item.correctAnswer)) g.push("G3:ans");
  }
  return g;
}

const num = (s) => { const str = String(s ?? "").trim(); if (!str) return NaN; const m = str.match(/[1-5]/); if (m) return Number(m[0]); const i = "①②③④⑤".indexOf(str); if (i >= 0) return i + 1; const j = "ABCDE".indexOf(str.replace(/[()]/g, "")); return j >= 0 ? j + 1 : NaN; };
const KEYS = JSON.parse(readFileSync(`${REPO}/.tmp-gichul-bank/answer-keys.json`, "utf8"));
/** 공식 정답표(형은 초안 provenance.answerSource "official-<form>" 를 따른다; 없으면 single→odd 순) */
function officialFor(id, prov) {
  const m = String(id).match(/^(.*)-q(\d+)$/); if (!m) return NaN;
  const forms = KEYS[m[1]]; if (!forms) return NaN;
  const src = String(prov?.answerSource || "");
  const want = src.startsWith("official-") ? [src.slice(9)] : ["single", "odd"];
  for (const f of want) { const a = forms[f]?.answers?.[m[2]]; if (Number.isInteger(a)) return a; }
  return NaN;
}
/** 에이전트 복원본의 정답을 정본 번호로 강제 — 유형별 정답 표기 + 파생 필드(요약문 blanks) 재계산. 불가하면 null */
function forceAnswer(subType, it, n) {
  const opts = it.options || [];
  const sd = it.structuredData || {};
  const label = subType === "GRAMMAR_ERROR" ? `(${"ABCDE"[n - 1]})` : ["SENTENCE_INSERT", "IRRELEVANT"].includes(subType) ? "①②③④⑤⑥⑦⑧"[n - 1] : String(n);
  if (subType === "SENTENCE_INSERT" && !(sd.passageWithMarkers || "").includes(label)) return null;
  const out = { ...it, correctAnswer: label, structuredData: { ...sd, correctAnswer: label } };
  if (subType === "SUMMARY_COMPLETE_MC") {
    const o = (sd.options || opts)[n - 1]; if (!o) return null;
    const bv = o.blankValues || [{ label: "(A)", value: o.blankA }, { label: "(B)", value: o.blankB }];
    if (!bv.every((b) => b && b.value)) return null;
    out.structuredData.blanks = bv.map((b) => ({ label: b.label, answer: b.value }));
  }
  Object.assign(it, out); it.structuredData = out.structuredData;
  return out;
}

const stat = { fixed: 0, rejected: 0, unsupported: 0, cannot: 0, missing: 0 };
const rejected = [];
for (const r of results) {
  const x = byId.get(r.id);
  if (!x) { stat.missing++; continue; }
  if (r.status === "unsupported") { x.status = "unsupported"; x.unsupportedReason = `agent:${r.reason}`; stat.unsupported++; continue; }
  if (r.status !== "fixed" || !r.item) { stat.cannot++; x.issues = [...(x.issues || []), `agent-cannot:${r.reason}`]; continue; }
  const it = r.item;
  const g = gates(x.subType, it);
  if (g.length) { stat.rejected++; rejected.push({ id: r.id, g }); x.issues = [...(x.issues || []), `agent-rejected:${g.join(",")}`]; continue; }
  // 정답 정본 보호: 드라이버가 확정한 정답 번호와 다르면 거부(에이전트는 정답을 바꿀 권한이 없다)
  // 정답 기대값: 초안 정답(있으면) → 없으면 공식 정답표(answer-keys.json, 초안 provenance 의 형). 둘 다 없으면 에이전트 정답 수용.
  // 함정: "①②③④⑤".indexOf("") 는 0 이라 빈 정답이 ① 로 둔갑한다 → 빈 문자열은 NaN 으로 먼저 걸러야 한다(1차 적용에서 25건 오거부).
  const expected = Number.isInteger(num(x.correctAnswer)) ? num(x.correctAnswer) : officialFor(r.id, x.provenance);
  const agentAns = num(it.correctAnswer);
  if (Number.isInteger(expected) && agentAns !== expected) {
    // 구조는 에이전트 복원본을 쓰되 정답은 정본(초안/공식)으로 되돌린다 — 요약문은 blanks[] 가 정답 선지에서 파생되므로 함께 재계산
    const forced = forceAnswer(x.subType, it, expected);
    if (!forced) { stat.rejected++; rejected.push({ id: r.id, g: [`answer-changed(${agentAns}→${expected})`] }); x.issues = [...(x.issues || []), `agent-rejected:answer-changed(${agentAns}→${expected})`]; continue; }
    stat.answerForced = (stat.answerForced || 0) + 1;
    console.log("  answer forced", r.id, x.subType, `agent ${it.correctAnswer} → ${forced.correctAnswer}`);
  }
  x.direction = it.direction; x.questionText = it.questionText; x.options = it.options; x.correctAnswer = it.correctAnswer;
  x.structuredData = { ...it.structuredData, _typeId: x.subType };
  if (Number.isInteger(it.points)) x.points = it.points;
  x.status = "ok"; x.issues = []; x.gates = []; x.provenance = { ...(x.provenance || {}), form: "agent", repairedBy: "fleet-v1" };
  stat.fixed++;
}
writeFileSync(draftPath, JSON.stringify(draft));
console.log("applied:", JSON.stringify(stat));
for (const r of rejected.slice(0, 20)) console.log("  rejected", r.id, r.g.join(","));
