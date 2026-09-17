// 범용 luna-ext 블라인드 평가 패킷 빌더 (캠페인 공용 장비).
// 사용: node_modules/.bin/tsx scripts/_bench-luna-ext-packets.ts --type SUBTYPE [--label r1]
// bench/<SUBTYPE>.json 의 통과 문항을 모델 은닉·고정시드 셔플로 패킷화:
//   eval/<SUBTYPE>/key.json · solve.md(솔버용, 정답 은닉) · audit.md(감수용, 전체 공개)
// 표면 렌더는 ext.renderEvalSurface — §5-2(계기 검증)에 따라 빌더가 첫 문항 표면을
// stdout 에 출력하니 발사 전 사람이 훑어라.
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-migration-20260814";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

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

async function main() {
  const subType = arg("type");
  const label = arg("label", "");
  if (!subType) throw new Error("--type SUBTYPE 필수");
  const { prisma } = await import("../src/lib/prisma");
  const kebab = subType.toLowerCase().replace(/_/g, "-");
  const mod = await import(`../src/lib/md-qgen/luna-ext/${kebab}.ts`);
  const ext = Object.values(mod).find(
    (v: any) => v && typeof v === "object" && "renderEvalSurface" in v,
  ) as any;
  if (!ext) throw new Error(`luna-ext 미발견: ${kebab}.ts`);

  const bench = JSON.parse(
    readFileSync(resolve(DIR, "bench", `${subType}${label ? `-${label}` : ""}.json`), "utf8"),
  );
  const passageContent = new Map<string, string>();
  for (const r of bench.rows) {
    if (passageContent.has(r.passageId)) continue;
    const p = await prisma.passage.findUnique({
      where: { id: r.passageId },
      select: { content: true },
    });
    if (p) passageContent.set(r.passageId, p.content);
  }
  await prisma.$disconnect();

  const pass = bench.rows.filter(
    (r: any) => !r.error && (r.gateIssues ?? []).length === 0 && !r.adaptError && r.aiQuestion,
  );
  // 시드는 유형명 해시 — 유형마다 다른 셔플, 재현 가능.
  let seed = 0;
  for (const ch of subType) seed = (seed * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  const items = shuffled(pass, seed || 1);

  const key: Record<string, any> = {};
  const solve: string[] = [`# ${subType} 문항 세트 — 블라인드 풀이 패킷\n`];
  const audit: string[] = [`# ${subType} 문항 세트 — 적대 감수 패킷\n`];
  items.forEach((r: any, i: number) => {
    const id = `Q${String(i + 1).padStart(2, "0")}`;
    const passage = passageContent.get(r.passageId) ?? "";
    const q = r.aiQuestion as Record<string, unknown>;
    const answer =
      (Array.isArray(q.correctAnswers) && q.correctAnswers.join(", ")) ||
      String(q.correctAnswer ?? q.answer ?? "");
    key[id] = {
      arm: r.arm,
      passageId: r.passageId,
      passageTitle: r.passageTitle,
      answer,
      attempts: r.attempts,
    };
    const surface = ext.renderEvalSurface(q, passage);
    solve.push(`\n---\n\n## ${id}\n\n${surface}\n`);
    const explanation = String(q.explanation ?? "");
    const wrongs = q.wrongOptionExplanations;
    const wrongText = Array.isArray(wrongs)
      ? (wrongs as Array<Record<string, unknown>>)
          .map((w) => `- ${String(w.label ?? "")}: ${String(w.text ?? w.explanation ?? "")}`)
          .join("\n")
      : typeof wrongs === "object" && wrongs
        ? Object.entries(wrongs as Record<string, unknown>)
            .map(([k, v]) => `- ${k}: ${String(v)}`)
            .join("\n")
        : "(없음)";
    audit.push(
      `\n---\n\n## ${id}\n\n### 문항 표면\n${surface}\n\n### 출제 정보\n- 정답: ${answer}\n- 해설: ${explanation}\n\n### 오답 해설\n${wrongText}\n\n### 소스 지문 원문\n${passage}\n`,
    );
  });

  const outDir = resolve(DIR, "eval", subType);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "key.json"), JSON.stringify(key, null, 2));
  writeFileSync(resolve(outDir, "solve.md"), solve.join(""));
  writeFileSync(resolve(outDir, "audit.md"), audit.join(""));
  console.log(`${subType}: ${items.length}문항 → ${outDir}`);
  console.log("── 표면 표본(Q01) ──");
  console.log(solve.join("").split("## Q01")[1]?.slice(0, 400) ?? "(없음)");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
