// 워크플로 출력에서 채점 JSON 추출 → grades.json
import fs from "node:fs";
const raw = fs.readFileSync(
  "C:/Users/jooye/AppData/Local/Temp/claude/d--Desktop-2026project-nara/81d49447-f31d-47df-9490-6666fe3f6f9c/tasks/wc5jted5t.output",
  "utf8",
);
const obj = JSON.parse(raw).result;
if (!obj?.graded) { console.log("no result.graded"); process.exit(1); }
fs.writeFileSync(new URL("./grades.json", import.meta.url), JSON.stringify(obj, null, 1));
console.log("graded:", obj.graded.length, "| verify:", (obj.verifyDetail ?? []).length);
console.log("verdicts:", JSON.stringify(obj.graded.reduce((a, g) => { a[g.finalVerdict] = (a[g.finalVerdict] || 0) + 1; return a; }, {})));
console.log("flipped:", obj.graded.filter((g) => g.flipped).length);
console.log("answerMismatch:", obj.graded.filter((g) => !g.answerMatches).map((g) => g.bid + ":" + g.finalVerdict).join(",") || "none");
