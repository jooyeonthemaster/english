// 2라운드(luna-g2) 평가 패킷 빌더 — 1라운드 패킷과 동일 규격(솔버/감수 프롬프트 재사용 가능).
import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync } from "fs";

const DIR = "experiments/question-quality-20260715/luna-bench-20260814";
const OUT = resolve(DIR, "eval-v2");

function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderGrammarSurface(q: any): string {
  return String(q.markedPassage ?? "").replace(
    /\[\[([A-E]):((?:(?!\]\]).)+)\]\]/g,
    (_m, l, e) => `(${l})[${e}]`,
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { prisma } = await import("../src/lib/prisma");
  const gen = JSON.parse(readFileSync(resolve(DIR, "gen-r2.json"), "utf8"));
  const passageContent = new Map<string, string>();
  for (const r of gen.rows) {
    const p = await prisma.passage.findUnique({
      where: { id: r.passageId },
      select: { id: true, content: true },
    });
    if (p) passageContent.set(p.id, p.content);
  }
  await prisma.$disconnect();

  const pass = gen.rows.filter(
    (r: any) => !r.error && (r.gateIssues ?? []).length === 0 && r.parsed,
  );
  const items = shuffled(pass, 26081402);
  const key: Record<string, any> = {};
  const solve: string[] = ["# 어법 문항 세트 R2 — 블라인드 풀이 패킷\n"];
  const audit: string[] = ["# 어법 문항 세트 R2 — 적대 감수 패킷\n"];
  items.forEach((r: any, i: number) => {
    const id = `H${String(i + 1).padStart(2, "0")}`;
    key[id] = {
      arm: r.arm,
      model: r.model,
      passageId: r.passageId,
      passageTitle: r.passageTitle,
      answer: r.parsed.answer,
      attempts: r.attempts,
    };
    const surface = renderGrammarSurface(r.parsed);
    solve.push(
      `\n---\n\n## ${id}\n\n다음 글의 밑줄 친 (A)~(E) 중, 어법상 틀린 것은?\n\n${surface}\n\n선지: (A) (B) (C) (D) (E)\n`,
    );
    const wrongLines = (r.parsed.wrong ?? [])
      .map((w: any) => `- ${w.label}: ${w.text}`)
      .join("\n");
    audit.push(
      `\n---\n\n## ${id}\n\n### 문항 표면\n다음 글의 밑줄 친 (A)~(E) 중, 어법상 틀린 것은?\n\n${surface}\n\n### 출제 정보\n- 정답: ${r.parsed.answer}\n- 고침: ${r.parsed.fix}\n- 해설: ${r.parsed.explanation}\n\n### 오답(옳은 밑줄) 해설\n${wrongLines}\n\n### 소스 지문 원문\n${passageContent.get(r.passageId) ?? "[미회수]"}\n`,
    );
  });
  writeFileSync(resolve(OUT, "key-r2.json"), JSON.stringify(key, null, 2));
  writeFileSync(resolve(OUT, "solve-g2.md"), solve.join(""));
  writeFileSync(resolve(OUT, "audit-g2.md"), audit.join(""));
  console.log(`R2 어법 ${items.length}문항 → eval-v2/(key-r2/solve-g2/audit-g2)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
