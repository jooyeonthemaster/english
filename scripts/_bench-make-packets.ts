// 채점 패킷 생성 — 지문×유형별 3모델 생성물을 블라인드(라벨 셔플)로 묶는다.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";

const DIR = "experiments/question-quality-20260715/newmodel-bench-20260722";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const gen = JSON.parse(readFileSync(`${DIR}/gen.json`, "utf-8"));
  mkdirSync(`${DIR}/packets`, { recursive: true });
  const byKey: Record<string, any[]> = {};
  for (const r of gen.rows) {
    const k = `${r.passageId}|${r.type}`;
    (byKey[k] = byKey[k] ?? []).push(r);
  }
  const key: Record<string, Record<string, string>> = {};
  let idx = 0;
  for (const [k, rows] of Object.entries(byKey)) {
    idx += 1;
    const [passageId, type] = k.split("|");
    const passage = await prisma.passage.findUnique({ where: { id: passageId }, select: { title: true, content: true } });
    const order = [...rows].sort((a, b) =>
      createHash("md5").update(k + a.model).digest("hex").localeCompare(
        createHash("md5").update(k + b.model).digest("hex")));
    const labels = ["A", "B", "C"];
    const map: Record<string, string> = {};
    const parts: string[] = [];
    order.forEach((r, i) => {
      map[labels[i]] = r.model;
      const status = r.error ? `콜 실패: ${r.error}` : r.gateIssues.length ? `기계 게이트 반려됨(참고): ${r.gateIssues.join("; ")}` : "기계 게이트 통과";
      parts.push(`\n\n═══════════ 후보 ${labels[i]} — ${status} ═══════════\n\n${r.text || "(출력 없음)"}`);
    });
    const typeLabel = type === "BLANK_INFERENCE" ? "빈칸 추론" : "어법(밑줄 5개 중 틀린 것)";
    const packet = `# 채점 패킷 ${idx} — ${typeLabel}\n\n## 지문 원문\n\n(${passage?.title ?? ""})\n\n${passage?.content ?? ""}\n${parts.join("")}\n`;
    const name = `packet-${String(idx).padStart(2, "0")}`;
    writeFileSync(`${DIR}/packets/${name}.md`, packet);
    key[name] = { ...map, type };
  }
  writeFileSync(`${DIR}/packets/KEY.json`, JSON.stringify(key, null, 2));
  console.log(`패킷 ${idx}개 + KEY.json 생성 완료`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
