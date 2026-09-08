// 함대 텍스트 수리 결과(한글 띄어쓰기·선지 오염) → 게이트 재검증 → scripts/gichul-bank/data/text-fixes.json 에 착지
// 사용: node scripts/gichul-bank/apply-text-fixes.mjs .tmp-gichul-bank/text-fix-results.json
// 게이트(항목별):
//   - 띄어쓰기 수정: 공백을 전부 지운 문자열이 원본과 같아야 한다(내용 불변).
//   - 내용 수정(선지 오염 교체·각주 잡음 제거): 공백을 지운 새 문자열이 원형 슬라이스(originSliceText/Wtext) 또는
//     problems.json 선지 안에 존재해야 한다(인쇄된 자구만 허용, 창작 금지).
//   - 선지는 정확히 5개, 빈 문자열 금지, 중복 금지.
// 결과 파일은 assemble-bank.mjs 가 읽어 direction/options/footnotes/questionText 에 반영한다(결정론 재생 가능).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const REPO = process.cwd();
const results = JSON.parse(readFileSync(process.argv[2], "utf8"));
const outPath = `${REPO}/scripts/gichul-bank/data/text-fixes.json`;
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
const squash = (s) => String(s ?? "").replace(/\s+/g, "");
const stat = { items: 0, accepted: 0, rejected: 0, fields: 0 };
const rejected = [];

for (const r of results) {
  stat.items++;
  const pk = JSON.parse(readFileSync(`${REPO}/.tmp-gichul-bank/text-fix-packets/${r.id}.json`, "utf8"));
  const printed = squash(pk.originSliceText) + "" + squash(pk.originWtext) + "" + (pk.problemsChoices || []).map(squash).join("");
  const fix = {};
  const why = [];
  const check = (label, oldText, newText) => {
    const o = squash(oldText), n = squash(newText);
    if (!n) return `${label}: empty`;
    if (o === n) return null; // 띄어쓰기만 바뀜
    if (printed.includes(n)) return null; // 인쇄된 자구로 교체
    return `${label}: content-changed-not-printed`;
  };
  if (typeof r.direction === "string" && r.direction.trim() && r.direction !== pk.current.direction) {
    const e = check("direction", pk.current.direction, r.direction);
    if (e) why.push(e); else fix.direction = r.direction.trim();
  }
  if (Array.isArray(r.options)) {
    if (r.options.length !== 5) why.push("options: not 5");
    else {
      const errs = r.options.map((t, i) => check(`option${i + 1}`, pk.current.options[i], t)).filter(Boolean);
      if (new Set(r.options.map(squash)).size !== 5) errs.push("options: duplicate");
      if (errs.length) why.push(...errs);
      else if (r.options.some((t, i) => t !== pk.current.options[i])) fix.options = r.options.map((t) => t.trim());
    }
  }
  if (Array.isArray(r.footnotes)) {
    const errs = r.footnotes.map((t, i) => (i < pk.current.footnotes.length ? check(`footnote${i + 1}`, pk.current.footnotes[i], t) : `footnote${i + 1}: extra`)).filter(Boolean);
    if (errs.length) why.push(...errs);
    else if (r.footnotes.length && r.footnotes.some((t, i) => t !== pk.current.footnotes[i])) fix.footnotes = r.footnotes.map((t) => t.trim());
  }
  if (why.length) { stat.rejected++; rejected.push({ id: r.id, why }); }
  if (Object.keys(fix).length) { prev[r.id] = { ...(prev[r.id] || {}), ...fix, _src: "fleet-text-v1" }; stat.accepted++; stat.fields += Object.keys(fix).length; }
}
writeFileSync(outPath, JSON.stringify(prev, null, 1));
console.log("text-fixes:", JSON.stringify(stat), "→", outPath, "total entries", Object.keys(prev).length);
for (const r of rejected.slice(0, 30)) console.log("  rejected", r.id, r.why.join(" | "));
