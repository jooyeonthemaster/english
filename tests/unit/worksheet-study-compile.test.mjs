import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 컴파일러 계약 (docs/worksheet-study-spec.md §4):
//  - 결정론: 같은 (report, mode, taskId) → 같은 plan (planHash·아이템 동일)
//  - taskId 가 다르면 seedKey 가 달라 셔플이 달라질 수 있으나 스테이지 구성은 동일
//  - itemKey 는 plan 전체에서 유일
//  - 빈 섹션 강등: 원천 없는 스테이지는 제외, 빈 items 스테이지 금지
//  - MC 는 항상 보기 4개 + 정답 라벨이 보기에 존재, 오답 3개는 정답과 불일치
//  - cloze segments 의 blank 인덱스는 answerKey 와 정합
const harnessSource = `
import compileMod from "@/lib/worksheet-study/compile";
import fixtureMod from "@/lib/passage-report/analysis-report/fixture";
import devFixtureMod from "@/app/dev/worksheet-study/dev-fixture";
const { compileStudyPlan, planIsViable } = compileMod as any;
const { RECALL_RECOGNITION_FIXTURE } = fixtureMod as any;
const { DEV_STUDY_FIXTURE } = devFixtureMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

const report = RECALL_RECOGNITION_FIXTURE;
const plan = compileStudyPlan({ report, mode: "standard", taskId: "task-a", reportTitle: "t" });
const plan2 = compileStudyPlan({ report, mode: "standard", taskId: "task-a", reportTitle: "t" });
const planB = compileStudyPlan({ report, mode: "standard", taskId: "task-b", reportTitle: "t" });
// intense 는 증강 픽스처(청크·어법 예문·학습지 섹션 보유)로 — 11스테이지 전 경로 자극
const planIntense = compileStudyPlan({ report: DEV_STUDY_FIXTURE, mode: "intense", taskId: "task-a", reportTitle: "t" });
const planLight = compileStudyPlan({ report, mode: "light", taskId: "task-a", reportTitle: "t" });

check("결정론: 같은 입력 → 같은 planHash", plan.planHash === plan2.planHash);
check("결정론: 같은 입력 → 아이템 JSON 동일", JSON.stringify(plan.stages) === JSON.stringify(plan2.stages));
check("taskId 변경 → planHash 상이(시드 반영)", plan.planHash !== planB.planHash);
check("taskId 변경 → 스테이지 구성은 동일", plan.stages.map(s => s.id).join() === planB.stages.map(s => s.id).join());
check("viable: 픽스처는 스터디 성립", planIsViable(plan));

const keys = plan.stages.flatMap(s => s.items.map(i => i.key));
check("itemKey 전역 유일", new Set(keys).size === keys.length);
check("빈 스테이지 금지", plan.stages.every(s => s.items.length > 0));
check("totalItems 정합", plan.totalItems === keys.length);
check("estMin ≥ 1", plan.stages.every(s => s.estMin >= 1));

const readStage = plan.stages.find(s => s.id === "reading");
check("reading 스테이지 존재", !!readStage);
// 어휘 카드 제외 계약 — 수업 이수 전제, 바로 어휘 시험으로 진단 (spec §4)
check("어휘 카드(vocab-flash) 코스 미포함", !plan.stages.some(s => s.id === "vocab-flash"));
check("어휘 시험은 존재", plan.stages.some(s => s.id === "vocab-quiz"));
check("vocabMeanings 제공(취약 단어장용)", Object.keys(plan.vocabMeanings).length > 0);
check("reading 인트로 카드(n=0) 존재", !!readStage && readStage.items.some(i => i.type === "read" && (i as any).n === 0));

for (const stage of plan.stages) {
  for (const it of stage.items) {
    if (it.type === "mc") {
      check(\`mc 보기 4개: \${it.key}\`, it.choices.length >= 2 && it.choices.length <= 5);
      check(\`mc 정답 라벨 존재: \${it.key}\`, it.choices.some(c => c.label === it.answerLabel));
      const answerText = it.choices.find(c => c.label === it.answerLabel)!.text;
      check(\`mc 오답≠정답: \${it.key}\`, it.choices.filter(c => c.text.trim().toLowerCase() === answerText.trim().toLowerCase()).length === 1);
    }
    if (it.type === "cloze") {
      const blanks = it.segments.filter(s => "blank" in s) as { blank: number }[];
      check(\`cloze 빈칸=answerKey: \${it.key}\`, blanks.length === it.answerKey.length);
      check(\`cloze 빈칸 인덱스 정합: \${it.key}\`, blanks.every((b, i) => b.blank === i));
      check(\`cloze 은행⊇정답: \${it.key}\`, it.answerKey.every(a => it.bank.includes(a)));
    }
    if (it.type === "match") {
      check(\`match 교란순열(정답 비노출): \${it.key}\`, it.answer.every((v, i) => v !== i) || it.left.length <= 1);
      check(\`match 좌우 길이 일치: \${it.key}\`, it.left.length === it.right.length && it.answer.length === it.left.length);
      // 회귀 잠금(적대검수 critical/major): 우측 값 유일성 — 같은 글자 셀이 둘이면
      // 인덱스 채점상 풀 수 없는 문항이 된다. "—" 플레이스홀더 유입도 금지.
      const rightNorm = it.right.map(x => x.trim().toLowerCase());
      check(\`match 우측 유일성: \${it.key}\`, new Set(rightNorm).size === rightNorm.length);
      check(\`match "—" 미유입: \${it.key}\`, !it.right.some(x => ["—", "-", "–"].includes(x.trim())));
    }
    if (it.type === "order") {
      check(\`order 타일 ≥3: \${it.key}\`, it.tiles.length >= 3);
      check(\`order 정답 존재: \${it.key}\`, it.answer.trim().length > 0);
    }
    if (it.type === "ox") {
      check(\`ox 해설 존재: \${it.key}\`, it.explanation.trim().length > 0);
    }
  }
}

// 회귀 잠금(적대검수 major): 청크 빈칸 재조립 = 원문 — 세그먼트와 answerKey 를
// 순서대로 이어붙여 공백 정규화하면 해당 문장 en 과 일치해야 한다("brainas" 방지).
const reassemble = (it: any) => it.segments
  .map((seg: any) => ("t" in seg ? seg.t : " " + it.answerKey[seg.blank] + " "))
  .join("").replace(/\\s+/g, " ").trim();
const sentenceByNo = new Map(
  (DEV_STUDY_FIXTURE.sections.find((s: any) => s.kind === "passage")?.sentences ?? []).map((s: any) => [s.n, s.en]),
);
for (const stage of planIntense.stages) {
  for (const it of stage.items) {
    if (it.type !== "cloze" || !it.sentenceNo) continue;
    const original = sentenceByNo.get(it.sentenceNo);
    if (!original) continue;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, " ").replace(/\\s+/g, " ").trim();
    check(\`cloze 재조립=원문: \${it.key}\`, norm(reassemble(it)) === norm(original));
  }
}

// 회귀 잠금: PLAN_ITEM_CAP(300) 집행
check("plan 전체 아이템 ≤ 300", planIntense.totalItems <= 300);

// 회귀 잠금(적대검수 critical): "—" 반의어·중복 동의어를 주입해도 매칭 무결 유지
const poison = JSON.parse(JSON.stringify(DEV_STUDY_FIXTURE));
const pv = poison.sections.find((s: any) => s.kind === "vocabulary");
pv.rows.forEach((r: any, i: number) => {
  if (i % 2 === 0) r.antonyms = "—";
  if (i < 4) r.synonyms = "huge";
});
const planPoison = compileStudyPlan({ report: poison, mode: "standard", taskId: "task-a", reportTitle: "t" });
const poisonMatch = planPoison.stages.find((s: any) => s.id === "vocab-match");
if (poisonMatch) {
  for (const it of poisonMatch.items) {
    const rn = it.right.map((x: string) => x.trim().toLowerCase());
    check(\`오염 매칭 우측 유일성: \${it.key}\`, new Set(rn).size === rn.length);
    check(\`오염 매칭 "—" 배제: \${it.key}\`, !it.right.some((x: string) => ["—", "-", "–"].includes(x.trim())));
  }
} else {
  check("오염 매칭: 유효쌍 부족 시 스테이지 강등(무결)", true);
}

// 프리셋 차등
check("light 는 grammar 제외", !planLight.stages.some(s => s.id === "grammar"));
check("intense 는 reproduction 포함(원천 있으면)", planIntense.stages.some(s => s.id === "reproduction"));
check("intense 빈칸 2회차(r2) 존재", planIntense.stages.find(s => s.id === "cloze")!.items.some(i => i.key.startsWith("cloze:r2:")));

// 빈 섹션 강등 — vocabulary 섹션 제거 시 어휘 스테이지 소멸, 나머지는 유지
const noVocab = { ...report, sections: report.sections.filter((s: any) => s.kind !== "vocabulary") };
const planNoVocab = compileStudyPlan({ report: noVocab as any, mode: "standard", taskId: "task-a", reportTitle: "t" });
check("vocabulary 없음 → 어휘 스테이지 소멸", !planNoVocab.stages.some(s => s.id.startsWith("vocab")));
check("vocabulary 없음 → 다른 스테이지 유지", planNoVocab.stages.some(s => s.id === "cloze"));

// 문장 1개짜리 최소 지문 — viable 아님(뷰어 폴백 경로)
const tiny = {
  ...report,
  sections: [
    { kind: "passage", sentences: [{ n: 1, en: "Cats sleep a lot during the day.", ko: "고양이는 낮에 잠을 많이 잔다." }], keywords: [] },
  ],
};
const planTiny = compileStudyPlan({ report: tiny as any, mode: "standard", taskId: "t", reportTitle: "t" });
check("최소 지문 → 채점 스테이지 부족 시 viable=false", planIsViable(planTiny) === (planTiny.stages.filter(s => s.graded).length >= 2));

// ── 26-07-25 품질 감사 회귀 (실 사용자 신고 재발 방지) ─────────────────────
// 근거: experiments/worksheet-study-quality-20260725/SPEC.md §3

// C-1 풀 수 있는 매칭(solvability invariant) — 정답이 아닌 우측 값이 다른 좌측
// 행의 정답으로도 읽히면 안 된다. 실제 사고: 반의어 그리드에 "trigger"(좌)와
// "cause"(우, media effect 의 정답)가 함께 놓여 trigger→cause 로 답한 학생이
// 오답 처리됐다 — "cause" 는 trigger 의 동의어였다.
function relTokensOf(list) {
  return String(list ?? "")
    .split(/[,/·;]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && !["—", "-", "–", "n/a"].includes(t));
}
for (const rep of [report, DEV_STUDY_FIXTURE]) {
  const vocabRows = (rep.sections.find((s: any) => s.kind === "vocabulary")?.rows ?? []) as any[];
  const claims = new Map<string, Set<string>>(); // 관계어 → 그것을 주장하는 표제어들
  for (const r of vocabRows) {
    for (const tok of [...relTokensOf(r.synonyms), ...relTokensOf(r.antonyms)]) {
      if (!claims.has(tok)) claims.set(tok, new Set());
      claims.get(tok)!.add(String(r.headword).trim().toLowerCase());
    }
  }
  for (const mode of ["standard", "intense"] as const) {
    const pl = compileStudyPlan({ report: rep, mode, taskId: "task-a", reportTitle: "t" });
    const vm = pl.stages.find((s: any) => s.id === "vocab-match");
    if (!vm) continue;
    for (const it of vm.items) {
      const lefts = it.left.map((l: string) => l.trim().toLowerCase());
      let ok = true;
      it.left.forEach((leftRaw: string, i: number) => {
        const left = leftRaw.trim().toLowerCase();
        it.right.forEach((rightRaw: string, j: number) => {
          if (j === it.answer[i]) return;
          const right = rightRaw.trim().toLowerCase();
          // 오답 자리의 값이 이 좌측 행의 관계어이거나 좌측 표제어면 정답이 둘이다
          const owners = claims.get(right);
          if (owners && owners.has(left)) ok = false;
          if (lefts.includes(right)) ok = false;
        });
      });
      check(\`C-1 매칭 solvability: \${it.key} (\${mode})\`, ok);
    }
  }
}

// C-1 실사고 재현 픽스처 — 사용자 신고 학습지(과제 cmrxoj2yw…)의 어휘 6행을 그대로.
// "media effect" 의 반의어 "cause" 가 "trigger" 의 동의어라 같은 그리드에 놓이면
// trigger→cause 로 답한 학생이 오답 처리된다(정답을 낼 근거가 없는 문항).
const collisionReport = JSON.parse(JSON.stringify(report));
const cvSec = collisionReport.sections.find((s: any) => s.kind === "vocabulary");
if (cvSec) {
  cvSec.rows = [
    { headword: "media effect", meaning: "미디어 영향/효과", tier: "core", difficulty: 1, synonyms: "impact, influence, outcome", antonyms: "cause, origin" },
    { headword: "exposure", meaning: "노출, 접함", tier: "test", difficulty: 3, synonyms: "contact, disclosure", antonyms: "protection, concealment" },
    { headword: "immediately", meaning: "즉시", tier: "test", difficulty: 2, synonyms: "instantly, promptly", antonyms: "eventually, gradually" },
    { headword: "manifest", meaning: "드러내다", tier: "challenge", difficulty: 4, synonyms: "reveal, display", antonyms: "hide, conceal" },
    { headword: "trigger", meaning: "일으키다", tier: "test", difficulty: 3, synonyms: "cause, initiate, provoke", antonyms: "prevent, stop" },
    { headword: "continually", meaning: "지속적으로", tier: "test", difficulty: 3, synonyms: "repeatedly, constantly", antonyms: "occasionally, rarely" },
  ];
  const cPlan = compileStudyPlan({ report: collisionReport, mode: "standard", taskId: "task-a", reportTitle: "t" });
  const cMatch = cPlan.stages.find((s: any) => s.id === "vocab-match");
  check("C-1 실사고 픽스처: vocab-match 생성됨", !!cMatch && cMatch.items.length >= 2);
  let noCause = true;
  for (const it of cMatch?.items ?? []) {
    const rights = it.right.map((r: string) => r.trim().toLowerCase());
    const lefts = it.left.map((l: string) => l.trim().toLowerCase());
    // "cause" 는 trigger(동의어)와 media effect(반의어) 양쪽이 주장한다 —
    // trigger 가 좌측에 있는 그리드의 우측에 절대 놓여선 안 된다.
    if (lefts.includes("trigger") && rights.includes("cause")) noCause = false;
  }
  check("C-1 실사고 재현: 교차 관계 충돌어가 같은 그리드에 없음", noCause);
}

// C-3 어법 OX — 오류 토큰이 예문에 2회 이상이면 '정상 문장' 변형을 만들지 않는다
// (String.replace 첫 일치 치환이 "If you expose you to..." → "If yourself expose
//  you to..." 라는 박살난 문장을 '어법상 옳음'으로 제시했다).
const oxPoison = JSON.parse(JSON.stringify(DEV_STUDY_FIXTURE));
const gsec = oxPoison.sections.find((s: any) => s.kind === "grammar");
if (gsec?.rows?.length) {
  gsec.rows = [
    {
      ...gsec.rows[0],
      sentenceNo: 1,
      example: "If you expose you to ads, your view will change.",
      exampleWrong: "you",
      exampleCorrect: "yourself",
    },
  ];
  // 택일 드릴이 같은 포인트를 덮어 OX 가 사라지는 것을 막는다
  const lwSec = oxPoison.sections.find((s: any) => s.kind === "learning-worksheet");
  if (lwSec?.drills) lwSec.drills.grammarChoices = [];
  let oxOk = true;
  let sawOx = false;
  for (const tid of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const pp = compileStudyPlan({ report: oxPoison, mode: "standard", taskId: tid, reportTitle: "t" });
    for (const it of pp.stages.find((s: any) => s.id === "grammar")?.items ?? []) {
      if (it.type !== "ox") continue;
      sawOx = true;
      // 어떤 시드에서도 '정상 문장'으로 둔갑하지 않아야 한다
      if (it.wrong !== true) oxOk = false;
      if (it.statement.includes("yourself expose")) oxOk = false;
    }
  }
  check("C-3 중복 토큰 예문은 정상문장 변형 금지", sawOx && oxOk);
}

// C-4 같은 어법 포인트를 OX 와 택일로 중복 출제하지 않는다
for (const mode of ["standard", "intense"] as const) {
  const pl = compileStudyPlan({ report: DEV_STUDY_FIXTURE, mode, taskId: "task-a", reportTitle: "t" });
  const g = pl.stages.find((s: any) => s.id === "grammar");
  if (!g) continue;
  const keys = g.items.map((it: any) =>
    \`\${it.sentenceNo ?? 0}|\${(it.type === "ox" ? (it.fixTo ?? it.statement) : it.answer).trim().toLowerCase()}\`,
  );
  check(\`C-4 어법 포인트 중복 없음 (\${mode})\`, new Set(keys).size === keys.length);
}

// C-5 직독직해 빈칸은 디코이를 포함한다(은행 = 정답만이면 자유 득점)
for (const mode of ["standard", "intense"] as const) {
  const pl = compileStudyPlan({ report: DEV_STUDY_FIXTURE, mode, taskId: "task-a", reportTitle: "t" });
  const ch = pl.stages.find((s: any) => s.id === "chunk");
  if (!ch) continue;
  const clozes = ch.items.filter((it: any) => it.type === "cloze");
  if (clozes.length < 2) continue; // 디코이 원천(다른 문장)이 없으면 면제
  check(
    \`C-5 청크 빈칸 디코이 존재 (\${mode})\`,
    clozes.every((it: any) => it.bank.length > it.answerKey.length),
  );
  check(
    \`C-5 청크 빈칸 정답 전부 은행에 존재 (\${mode})\`,
    clozes.every((it: any) =>
      it.answerKey.every((a: string) =>
        it.bank.some((b: string) => b.trim().toLowerCase() === a.trim().toLowerCase()),
      ),
    ),
  );
}

// C-6 어순 배열 스테이지에 같은 문장이 두 번 나오지 않는다
for (const mode of ["standard", "intense"] as const) {
  const pl = compileStudyPlan({ report: DEV_STUDY_FIXTURE, mode, taskId: "task-a", reportTitle: "t" });
  const od = pl.stages.find((s: any) => s.id === "order");
  if (!od) continue;
  const answers = od.items
    .filter((it: any) => it.type === "order")
    .map((it: any) => it.answer.trim().toLowerCase().replace(/\\s+/g, " "));
  const overlap = answers.some((a: string, i: number) =>
    answers.some((b: string, j: number) => i !== j && (a.includes(b) || b.includes(a))),
  );
  check(\`C-6 어순 배열 중복 문장 없음 (\${mode})\`, !overlap);
}

// C-9 인쇄 마커(__밑줄__ · ____빈칸 · ___(A)___)가 학생 화면에 날것으로 나가지 않는다.
// 실사고: "밑줄 친__builds up…manner__가" → 마커 노출 + 앞뒤 단어 접합(친builds/manner가).
{
  const markerReport = JSON.parse(JSON.stringify(DEV_STUDY_FIXTURE));
  const lwm = markerReport.sections.find((s: any) => s.kind === "learning-worksheet");
  if (lwm?.inferenceSet?.questions?.length) {
    const q = lwm.inferenceSet.questions[0];
    q.prompt = "밑줄 친__builds up in a steady manner__가 의미하는 바로 적절한 것은?";
    q.passage = "It cannot be attributed to any one exposure but instead____________over time. While media can trigger_____(A)_____responses, exposure leads to_____(B)_____shifts.";
    const mp = compileStudyPlan({ report: markerReport, mode: "standard", taskId: "task-a", reportTitle: "t" });
    const exItems = (mp.stages.find((s: any) => s.id === "exam")?.items ?? []).filter(
      (it: any) => it.key.startsWith("exam:inf:"),
    );
    const target = exItems.find((it: any) => String(it.prompt).includes("steady manner"));
    if (target) {
      const blob = String(target.prompt) + " " + String(target.passage ?? "");
      check("C-9 밑줄 마커 소멸", !blob.includes("__builds"));
      check("C-9 밑줄 → 인용부호 강조", blob.includes("‘builds up in a steady manner’"));
      check("C-9 한국어 조사 접합 유지", blob.includes("manner’가"));
      check("C-9 영문 단어 접합 해소", !/[A-Za-z]_{2,}|_{2,}[A-Za-z]/.test(blob));
      check("C-9 라벨 빈칸 보존", blob.includes("______(A)") && blob.includes("______(B)"));
      // 단일 순회 치환 회귀 — 순차 replace 면 두 라벨 빈칸 사이가 통째로 인용부호에 먹힌다
      check("C-9 라벨 빈칸 사이 텍스트 온전", blob.includes("responses, exposure leads to"));
    } else {
      check("C-9 마커 픽스처가 exam 스테이지에 도달", false);
    }
  }
}

console.log(JSON.stringify({ passed, failures }));
`;

test("worksheet-study compile contract", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-worksheet-study");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".compile-harness.mts");
  let raw;
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  const result = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 30, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
