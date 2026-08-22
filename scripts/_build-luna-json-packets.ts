// luna JSON팔 평가 패킷 빌더 (26-08-08) — json-arm.json 게이트 통과분(J-med·J-high).
// 산출: eval-json/{solve-j.md,audit-j.md,key-j.json}
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const DIR = "experiments/question-quality-20260715/luna-bench-20260808";
const CIRCLED = ["①", "②", "③", "④", "⑤"];

function lcgShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const renderMarked = (mp: string) =>
  mp.replace(/\[\[([A-J]):([\s\S]*?)\]\]/g, (_m, l: string, c: string) => `${CIRCLED[l.charCodeAt(0) - 65]}«${c}»`);

const v = JSON.parse(readFileSync(resolve(DIR, "json-arm.json"), "utf8")) as { rows: any[] };
const usable = v.rows.filter((r) => !r.error && r.parsed?.markedPassage && r.gateIssues.length === 0);
const shuffled = lcgShuffle(usable, 215);

const key: Record<string, any> = {};
let solveMd = `# 어법 문항 블라인드 풀이 패킷 J (${shuffled.length}문항)\n\n각 문항: 다음 글의 밑줄 친 부분(①~⑤, «» 구간) 중, 어법상 **틀린** 것을 고르시오.\n`;
let auditMd = `# 어법 문항 품질 감수 패킷 J (${shuffled.length}문항)\n`;

shuffled.forEach((r, i) => {
  const id = `J${String(i + 1).padStart(2, "0")}`;
  const p = r.parsed;
  key[id] = { arm: r.arm, passageId: r.passageId, passageTitle: r.passageTitle, answers: p.answers };
  const rendered = renderMarked(p.markedPassage);
  const answerNums = p.answers.map((a: string) => CIRCLED[a.charCodeAt(1) - 65] ?? a);

  solveMd += `\n---\n\n## ${id}\n\n${rendered}\n`;
  auditMd += `\n---\n\n## ${id}\n\n${rendered}\n\n**정답**: ${answerNums.join(", ")}\n`;
  for (const a of p.answers) {
    const m = p.marks.find((x: any) => x.label === a);
    auditMd += `**고침**: ${m?.shown ?? "?"} → ${p.fixes[a] ?? p.fix}\n`;
  }
  auditMd += `\n**해설**:\n${p.explanation}\n`;
  if (p.wrong?.length) {
    auditMd += `\n**오답(정상 밑줄) 해설**:\n`;
    for (const w of p.wrong) auditMd += `- ${CIRCLED[w.label.charCodeAt(1) - 65] ?? w.label} ${w.text}\n`;
  }
  auditMd += `\n**밑줄 상세**:\n`;
  for (const m of p.marks) {
    auditMd += `- ${CIRCLED[m.label.charCodeAt(1) - 65]} shown=「${m.shown}」 original=「${m.original}」 code=${m.code}\n`;
  }
});

mkdirSync(resolve(DIR, "eval-json"), { recursive: true });
writeFileSync(resolve(DIR, "eval-json", "solve-j.md"), solveMd);
writeFileSync(resolve(DIR, "eval-json", "audit-j.md"), auditMd);
writeFileSync(resolve(DIR, "eval-json", "key-j.json"), JSON.stringify(key, null, 2));
console.log(`패킷 ${shuffled.length}문항`);
for (const [id, k] of Object.entries(key)) console.log(`${id} ${k.arm} ${k.passageTitle.slice(0, 24)} ans=${k.answers.join(",")}`);
