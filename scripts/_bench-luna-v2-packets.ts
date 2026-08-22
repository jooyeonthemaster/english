// 확증런 v2 블라인드 평가 패킷 빌더 (26-08-14).
// gen-v2.json 의 게이트 통과 문항을 모델 은닉·고정시드 셔플로 패킷화한다.
// - solve-*.md: 솔버용(정답·해설 은닉) — 정답 재현 + 복수정답 시비 탐지(v2 축)
// - audit-*.md: 감수용(전체 공개) — v2/v4/craft 적대 감수
// - key.json: itemId → arm·passageId·정답 (평가자 미공개, 집계 전용)
// §5-2(장비 검증): 렌더 산출물을 본체가 표본 정독 후 패널 발사할 것.
import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync } from "fs";

const DIR = "experiments/question-quality-20260715/luna-bench-20260814";
const OUT = resolve(DIR, "eval-v2");

// 고정시드 LCG 셔플 — 재현 가능 블라인드.
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
  // markedPassage 의 [[X:expr]] → (X)[expr] — 시험지 등가 표면.
  return String(q.markedPassage ?? "").replace(
    /\[\[([A-E]):((?:(?!\]\]).)+)\]\]/g,
    (_m, l, e) => `(${l})[${e}]`,
  );
}

function renderBlankSurface(q: any, passage: string): string {
  const norm = (s: string) =>
    s
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/\s+/g, " ")
      .trim();
  const oe = String(q.originalExpression ?? "");
  if (oe && passage.includes(oe)) return passage.replace(oe, "____________");
  // 정규화 매칭 폴백 — 공백 차이 등.
  const pn = norm(passage);
  const on = norm(oe);
  const idx = pn.indexOf(on);
  if (idx >= 0) return pn.slice(0, idx) + "____________" + pn.slice(idx + on.length);
  return `[렌더 실패 — 빈칸원문 미발견]\n${passage}`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { prisma } = await import("../src/lib/prisma");
  const gen = JSON.parse(readFileSync(resolve(DIR, "gen-v2.json"), "utf8"));
  const passageContent = new Map<string, string>();
  for (const meta of gen.passages) {
    const p = await prisma.passage.findUnique({
      where: { id: meta.id },
      select: { id: true, content: true },
    });
    if (p) passageContent.set(p.id, p.content);
  }
  await prisma.$disconnect();

  const pass = gen.rows.filter((r: any) => !r.error && (r.gateIssues ?? []).length === 0 && r.parsed);
  const grammar = shuffled(pass.filter((r: any) => r.kind === "grammar"), 20260814);
  const blank = shuffled(pass.filter((r: any) => r.kind === "blank"), 41802602);

  const key: Record<string, any> = {};
  const solveG: string[] = ["# 어법 문항 세트 — 블라인드 풀이 패킷\n"];
  const auditG: string[] = ["# 어법 문항 세트 — 적대 감수 패킷\n"];
  grammar.forEach((r: any, i: number) => {
    const id = `G${String(i + 1).padStart(2, "0")}`;
    key[id] = {
      arm: r.arm,
      model: r.model,
      passageId: r.passageId,
      passageTitle: r.passageTitle,
      answer: r.parsed.answer,
      attempts: r.attempts,
    };
    const surface = renderGrammarSurface(r.parsed);
    solveG.push(
      `\n---\n\n## ${id}\n\n다음 글의 밑줄 친 (A)~(E) 중, 어법상 틀린 것은?\n\n${surface}\n\n선지: (A) (B) (C) (D) (E)\n`,
    );
    const wrongLines = (r.parsed.wrong ?? [])
      .map((w: any) => `- ${w.label}: ${w.text}`)
      .join("\n");
    auditG.push(
      `\n---\n\n## ${id}\n\n### 문항 표면\n다음 글의 밑줄 친 (A)~(E) 중, 어법상 틀린 것은?\n\n${surface}\n\n### 출제 정보\n- 정답: ${r.parsed.answer}\n- 고침: ${r.parsed.fix}\n- 해설: ${r.parsed.explanation}\n\n### 오답(옳은 밑줄) 해설\n${wrongLines}\n\n### 소스 지문 원문\n${passageContent.get(r.passageId) ?? "[미회수]"}\n`,
    );
  });

  const solveB: string[] = ["# 빈칸 문항 세트 — 블라인드 풀이 패킷\n"];
  const auditB: string[] = ["# 빈칸 문항 세트 — 적대 감수 패킷\n"];
  blank.forEach((r: any, i: number) => {
    const id = `B${String(i + 1).padStart(2, "0")}`;
    key[id] = {
      arm: r.arm,
      model: r.model,
      passageId: r.passageId,
      passageTitle: r.passageTitle,
      answer: r.parsed.answer,
      attempts: r.attempts,
    };
    const passage = passageContent.get(r.passageId) ?? "";
    const surface = renderBlankSurface(r.parsed, passage);
    const optLines = (r.parsed.options ?? [])
      .map((o: any) => `${o.label} ${o.text}`)
      .join("\n");
    solveB.push(
      `\n---\n\n## ${id}\n\n다음 빈칸에 들어갈 말로 가장 적절한 것은?\n\n${surface}\n\n${optLines}\n`,
    );
    const wrongLines = (r.parsed.wrong ?? [])
      .map((w: any) => `- ${w.label}: ${w.text}`)
      .join("\n");
    auditB.push(
      `\n---\n\n## ${id}\n\n### 문항 표면\n다음 빈칸에 들어갈 말로 가장 적절한 것은?\n\n${surface}\n\n${optLines}\n\n### 출제 정보\n- 정답: ${r.parsed.answer}\n- 빈칸원문(정답 근거 원문): ${r.parsed.originalExpression}\n- 해설: ${r.parsed.explanation}\n\n### 오답 해설\n${wrongLines}\n\n### 소스 지문 원문\n${passage}\n`,
    );
  });

  writeFileSync(resolve(OUT, "key.json"), JSON.stringify(key, null, 2));
  writeFileSync(resolve(OUT, "solve-g.md"), solveG.join(""));
  writeFileSync(resolve(OUT, "audit-g.md"), auditG.join(""));
  writeFileSync(resolve(OUT, "solve-b.md"), solveB.join(""));
  writeFileSync(resolve(OUT, "audit-b.md"), auditB.join(""));
  console.log(
    `어법 ${grammar.length}문항 · 빈칸 ${blank.length}문항 → ${OUT} (key/solve-g/audit-g/solve-b/audit-b)`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
