// luna 어법 벤치 평가 패킷 빌더 (26-08-08) — gen.json → 블라인드 패킷 2종.
// solve.md: 문항만(정답·해설 은닉) — 블라인드 솔버용
// audit.md: 전체(정답·고침·해설·오답해설) — 품질 감수용
// key.json: itemId → 모델·지문 매핑(평가자에게 비공개)
// 셔플은 고정시드 LCG — 재현 가능.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const DIR = "experiments/question-quality-20260715/luna-bench-20260808";
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

interface Mark { label: string; original: string; shown: string; code: string }
interface Parsed {
  marks: Mark[];
  markedPassage?: string;
  answer: string;
  answers: string[];
  fix: string;
  fixes: Record<string, string>;
  explanation: string;
  wrong: { label: string; text: string }[];
}
interface Row {
  model: string; passageId: string; passageTitle: string;
  gateIssues: string[]; parsed: Parsed | null; error?: string;
}

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

// [[A:content]] → ①content (밑줄은 «» 로 표기)
function renderMarked(markedPassage: string, marks: Mark[]): string {
  return markedPassage.replace(/\[\[([A-J]):([\s\S]*?)\]\]/g, (_m, letter: string, content: string) => {
    const idx = letter.charCodeAt(0) - 65;
    return `${CIRCLED[idx] ?? `(${letter})`}«${content}»`;
  });
}

const gen = JSON.parse(readFileSync(resolve(DIR, "gen.json"), "utf8")) as { rows: Row[] };
let retryRows: Row[] = [];
try {
  retryRows = (JSON.parse(readFileSync(resolve(DIR, "retry.json"), "utf8")) as { rows: Row[] }).rows;
} catch {
  // retry.json 없으면 1차 생성분만
}
// 게이트 통과분만 평가 — 프로덕션이 출하하는 모집단. 재시도 통과분 포함(md 레인 재생성 정책 반영).
const usable = [...gen.rows, ...retryRows].filter(
  (r) => !r.error && r.parsed?.markedPassage && r.gateIssues.length === 0,
);
const shuffled = lcgShuffle(usable, 20260808);

const key: Record<string, { model: string; passageId: string; passageTitle: string; gateIssues: string[]; answers: string[] }> = {};
let solveMd = `# 어법 문항 블라인드 풀이 패킷 (${shuffled.length}문항)\n\n각 문항: 다음 글의 밑줄 친 부분(①~⑤, «» 구간) 중, 어법상 **틀린** 것을 고르시오.\n`;
let auditMd = `# 어법 문항 품질 감수 패킷 (${shuffled.length}문항)\n`;

shuffled.forEach((r, i) => {
  const id = `Q${String(i + 1).padStart(2, "0")}`;
  const p = r.parsed!;
  key[id] = { model: r.model, passageId: r.passageId, passageTitle: r.passageTitle, gateIssues: r.gateIssues, answers: p.answers };
  const rendered = renderMarked(p.markedPassage!, p.marks);
  const answerNums = p.answers.map((a) => {
    const idx = a.charCodeAt(1) - 65;
    return CIRCLED[idx] ?? a;
  });

  solveMd += `\n---\n\n## ${id}\n\n${rendered}\n`;

  auditMd += `\n---\n\n## ${id}\n\n${rendered}\n\n**정답**: ${answerNums.join(", ")}\n`;
  for (const a of p.answers) {
    const m = p.marks.find((x) => x.label === a);
    auditMd += `**고침${p.answers.length > 1 ? a : ""}**: ${m?.shown ?? "?"} → ${p.fixes[a] ?? p.fix}\n`;
  }
  auditMd += `\n**해설**:\n${p.explanation}\n`;
  if (p.wrong?.length) {
    auditMd += `\n**오답(정상 밑줄) 해설**:\n`;
    for (const w of p.wrong) {
      const idx = w.label.charCodeAt(1) - 65;
      auditMd += `- ${CIRCLED[idx] ?? w.label} ${w.text}\n`;
    }
  }
  auditMd += `\n**밑줄 상세** (label/표시형/원형/포인트코드):\n`;
  for (const m of p.marks) {
    const idx = m.label.charCodeAt(1) - 65;
    auditMd += `- ${CIRCLED[idx]} shown=「${m.shown}」 original=「${m.original}」 code=${m.code}\n`;
  }
});

mkdirSync(resolve(DIR, "eval"), { recursive: true });
writeFileSync(resolve(DIR, "eval", "solve.md"), solveMd);
writeFileSync(resolve(DIR, "eval", "audit.md"), auditMd);
writeFileSync(resolve(DIR, "eval", "key.json"), JSON.stringify(key, null, 2));
console.log(`패킷 생성: ${shuffled.length}문항 (제외 ${gen.rows.length - usable.length})`);
for (const [id, k] of Object.entries(key)) {
  console.log(`${id} ${k.model.split("/")[1]} gate=${k.gateIssues.length} ans=${k.answers.join(",")}`);
}
