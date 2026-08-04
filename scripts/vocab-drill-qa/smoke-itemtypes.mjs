// 단어 훈련 QA — 과제 출제 유형(itemTypes) 관통 스모크.
//
// 선생님이 고른 유형이 학생 큐까지 실제로 반영되는지 실서버로 확인한다.
// ① SPELL·WORD_CHOICE 만 허용한 브리지 과제를 심고(비구 단어 — 두 유형 모두
//    조립 가능하므로 **엄격 부분집합**을 단언할 수 있다)
// ② 큐를 받아 전 문항 유형이 허용 집합 안인지 검사
// ③ 유형 미지정 과제는 기존 box 창 동작(자유 믹스)인지 대조
// 끝에서 QA 학생의 브리지·시도 흔적을 지운다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const requireRepo = createRequire(
  new URL("../../package.json", import.meta.url),
);
const { PrismaClient } = requireRepo("@prisma/client");
const prisma = new PrismaClient();

const BASE = "http://localhost:3000";
const STUDENT_ID = "cms35q8dg00019q37g2nvlj4l";
const ACADEMY_ID = "cmr4lx5690000l504n0uyck1g";
const token = fs.readFileSync(path.join(HERE, ".cookie"), "utf8").trim();
const H = { Cookie: `grammar-drill-session=${token}` };

const fail = (m) => {
  console.error("✗ " + m);
  process.exitCode = 1;
};
const ok = (m) => console.log("✓ " + m);

// 비구(單語) sense 10개 — SPELL 이 항상 조립되는 재료.
const senses = await prisma.vocabDrillSense.findMany({
  where: {
    retiredAt: null,
    isPhrase: false,
    senseOrder: 0,
    tier: { in: ["core", "academic"] },
    difficulty: { gte: 2 },
  },
  orderBy: [{ per10k: { sort: "desc", nulls: "last" } }, { id: "asc" }],
  take: 10,
  select: { id: true, lemma: true },
});
if (senses.length < 10) fail("재료 sense 부족");

const ALLOWED = ["SPELL", "WORD_CHOICE"];
const mk = (spec, title) =>
  prisma.vocabDrillAssignment.create({
    data: {
      academyId: ACADEMY_ID,
      studentId: STUDENT_ID,
      title,
      spec,
      status: "ASSIGNED",
    },
    select: { id: true },
  });

const typed = await mk(
  { senseIds: senses.map((s) => s.id), count: 10, itemTypes: ALLOWED },
  "QA 유형 지정",
);
const free = await mk(
  { senseIds: senses.map((s) => s.id), count: 10 },
  "QA 자동 믹스",
);

try {
  const q1 = await (
    await fetch(
      `${BASE}/api/vocab-drill/queue?mode=assignment&assignmentId=${typed.id}`,
      { headers: H },
    )
  ).json();
  if (!q1.ok || !q1.queue?.items?.length) {
    fail("유형 지정 큐 실패: " + JSON.stringify(q1).slice(0, 150));
  } else {
    const types = q1.queue.items.map((i) => i.type);
    const outside = types.filter((t) => !ALLOWED.includes(t));
    if (outside.length) fail(`허용 밖 유형 서빙: ${outside.join(",")}`);
    else ok(`유형 지정 큐 ${types.length}문항 전부 허용 집합 안: ${[...new Set(types)].join("·")}`);
    // 순환 배정 — 두 유형이 실제로 섞였는지(단일 유형 고착 방지)
    if (new Set(types).size < 2) fail("유형 순환 실패 — 한 유형만 나옴");
    else ok("유형 순환 확인(2종 모두 출제)");
  }

  const q2 = await (
    await fetch(
      `${BASE}/api/vocab-drill/queue?mode=assignment&assignmentId=${free.id}`,
      { headers: H },
    )
  ).json();
  if (!q2.ok || !q2.queue?.items?.length) {
    fail("자동 믹스 큐 실패: " + JSON.stringify(q2).slice(0, 150));
  } else {
    ok(`자동 믹스 큐 ${q2.queue.items.length}문항 (유형: ${[...new Set(q2.queue.items.map((i) => i.type))].join("·")})`);
  }
} finally {
  await prisma.vocabDrillAttempt.deleteMany({
    where: { studentId: STUDENT_ID, assignmentId: { in: [typed.id, free.id] } },
  });
  await prisma.vocabDrillAssignment.deleteMany({
    where: { id: { in: [typed.id, free.id] } },
  });
  ok("QA 흔적 정리 완료");
  await prisma.$disconnect();
}
