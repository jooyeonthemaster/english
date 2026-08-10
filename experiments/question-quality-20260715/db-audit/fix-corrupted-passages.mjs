// §5-5 확정 수정 2건 — 공식 기출 원문 대조 완료(6모평 42번 정답 ⑤=(e) distinguishable→indistinguishable,
// 3월 29번 정답 ④ which→in which). cmrs0c5z9 는 오염 아님(공식 원문 축자 일치)이라 제외.
// 실행 전 원문 전체를 백업 파일로 저장하고, 치환은 발생 횟수 1회를 강제 확인한다.
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import(
  "file:///" + root + "/node_modules/@prisma/client/default.js"
);
const prisma = new PrismaClient();

const HERE = "C:/Users/jooye/AppData/Local/Temp/claude/d--Desktop-2026project-nara/81d49447-f31d-47df-9490-6666fe3f6f9c/scratchpad/";
const FIXES = [
  {
    id: "cmrs251gp000dja0apyfs37lt",
    from: "seamlessness in humanoid robotic design aims to make humanoids distinguishable from a human body",
    to: "seamlessness in humanoid robotic design aims to make humanoids indistinguishable from a human body",
    why: "2026학년도 6월 모평 42번(어휘) 정답 ⑤=(e) distinguishable — 인쇄본의 심긴 오답어. 원문 복원.",
  },
  {
    id: "cmrs0c609000pks0al5760lii",
    from: "the nature of the conditions which they find themselves",
    to: "the nature of the conditions in which they find themselves",
    why: "2026년 3월 고3 학평 29번(어법) 정답 ④ which→in which — 인쇄본의 심긴 오류. 원문 복원.",
  },
];

const backup = [];
for (const fix of FIXES) {
  const p = await prisma.passage.findUnique({
    where: { id: fix.id },
    select: { id: true, title: true, content: true },
  });
  if (!p) { console.log(`SKIP ${fix.id}: not found`); continue; }
  const count = p.content.split(fix.from).length - 1;
  if (count !== 1) {
    console.log(`ABORT ${fix.id}: expected exactly 1 occurrence, found ${count}`);
    continue;
  }
  backup.push({ id: p.id, title: p.title, contentBefore: p.content, fix });
  const updated = p.content.replace(fix.from, fix.to);
  await prisma.passage.update({
    where: { id: p.id },
    data: { content: updated },
  });
  console.log(`FIXED ${p.id} (${p.title}): "${fix.from.slice(-40)}" -> "${fix.to.slice(-43)}"`);
}
fs.writeFileSync(
  HERE + "passage-fix-backup-20260720.json",
  JSON.stringify(backup, null, 2),
);
console.log(`backup written: ${backup.length} rows -> passage-fix-backup-20260720.json`);

// 검증 재조회
for (const fix of FIXES) {
  const p = await prisma.passage.findUnique({ where: { id: fix.id }, select: { content: true } });
  if (!p) continue;
  console.log(`VERIFY ${fix.id}: from-absent=${!p.content.includes(fix.from)} to-present=${p.content.includes(fix.to)}`);
}
await prisma.$disconnect();
