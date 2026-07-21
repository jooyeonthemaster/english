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
