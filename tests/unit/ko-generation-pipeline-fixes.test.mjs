import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// KO 생성 파이프라인 확정결함 수정 회귀 가드 (ko-audit F1-pipeline):
//   KO-1/KO-GEN-1  shuffleKoMc5Options 가 유형 확장 라벨 키 필드(trapDesign·
//                  distortions·wrongOptionDesigns·wrongOptionTraps·
//                  distractorPrinciples·optionAnalyses·trapPrinciples)를
//                  재귀 재매핑하는지 + 셔플 전후 validate 결과 코드 불변.
//   KO-GEN-2       KO 봉투는 wrongOptionExplanations 배열형 보존(후처리 게이트),
//                  영어는 기존 Record 정규화 유지. + 셔플의 Record 방어 분기.
//   KO-RC-3        resolveGeneratedQuestionPoints — KO 는 points ?? defaultPoints,
//                  영어는 1 고정.
// tsx 하니스(JSON 요약) 패턴은 ko-text-core.test.mjs / question-set-persistence
// .test.mjs 미러.
const harnessSource = `
// tsx 는 이 .ts 모듈들을 CJS 로 돌리므로 default 인터롭으로 named export 를 꺼낸다.
import shuffleMod from "@/lib/korean/core/shuffle";
import dispatchMod from "@/lib/korean/quality/dispatch";
import registryMod from "@/lib/korean/registry";
import ppMod from "@/lib/question-postprocess";
const { shuffleKoMc5Options } = shuffleMod;
const { validateKoQuestion } = dispatchMod;
const { getKoTypeModule } = registryMod;
const { postProcessQuestion } = ppMod;

// question-generation-persistence 는 @/lib/prisma 를 끌어와 PrismaClient 를
// 모듈 로드 시점에 생성한다 — 하니스 환경에 DATABASE_URL 이 없을 수 있어
// 더미를 먼저 심고 동적 import 한다(쿼리는 안 하므로 연결 없음).
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://t:t@localhost:5432/t";
const persistenceMod: any = await import("@/lib/question-generation-persistence");
const { resolveGeneratedQuestionPoints } = persistenceMod.default ?? persistenceMod;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

const LABELS = ["①", "②", "③", "④", "⑤"];

function baseQuestion(correct: string, saltIndex: number, extra: Record<string, unknown>) {
  const salt = "변형" + saltIndex + "차";
  return {
    direction: "윗글을 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은?",
    options: LABELS.map((label, i) => ({
      label,
      text: "선지 " + (i + 1) + " 의 " + salt + " 내용 서술이다",
    })),
    correctAnswer: correct,
    // 주의: 본문 첫머리에 원문자를 두지 않는다 — 셔플이 본문 안의 ①~⑤ 지칭도
    // 치환하므로, 셔플 전후 짝맞춤은 원문자 아닌 안정 토큰("오답사유N")으로 한다.
    wrongOptionExplanations: LABELS.filter((l) => l !== correct).map((l, i) => ({
      label: l,
      explanation: "오답사유" + i + " — " + l + " 선지가 어긋나는 이유(" + salt + ")",
    })),
    evidence: LABELS.map((l) => ({
      optionLabel: l,
      spanText: "근거 문장 " + l + " (" + salt + ")",
      relation: l === correct ? "DISTORTS" : "SUPPORTS",
    })),
    explanation: "정답은 " + correct + " 이다 — 나머지는 지문과 정합한다.",
    keyPoints: ["포인트 하나", "포인트 " + correct + " 지칭", "포인트 셋"],
    ...extra,
  } as Record<string, unknown>;
}

/** 셔플 전/후 옵션 "텍스트" 대응으로 old→new 라벨 맵을 실측 복원한다. */
function measureLabelMap(pre: any, post: any): Map<string, string> {
  const map = new Map<string, string>();
  for (const oldOpt of pre.options) {
    const found = post.options.find((o: any) => o.text === oldOpt.text);
    map.set(oldOpt.label, found ? found.label : "?");
  }
  return map;
}

/**
 * 정답 라벨이 셔플로 실제 이동하는 픽스처를 찾는다(셔플은 결정론 시드라 salt 로
 * 순열을 바꾼다) — desync 대조군 테스트의 공허함(고정점) 방지.
 */
function buildMovedFixture(correct: string, extra: Record<string, unknown>) {
  for (let i = 0; i < 8; i++) {
    const pre = baseQuestion(correct, i, extra);
    const q = structuredClone(pre);
    shuffleKoMc5Options(q);
    const map = measureLabelMap(pre, q);
    if (map.get(correct) !== correct) return { pre, q, map };
  }
  throw new Error("no non-fixed-point fixture found for " + correct);
}

// ── A. 유형 확장 라벨 키 필드 재매핑 (KO-1/KO-GEN-1) ─────────────────────────
// 비-locked 8유형의 확장 필드 전수: 원소 identity(원리·기법명)로 짝을 맞춰
// 셔플 후 라벨이 실측 labelMap 을 정확히 따르는지 검사한다.
const EXT_CASES: { typeId: string; field: string; build: (correct: string) => unknown[]; idKey: string }[] = [
  {
    typeId: "KO_RD_APPLY", field: "trapDesign", idKey: "principle",
    build: (c) => [{ label: c, principle: "CONDITION_DROP_MISJUDGE", note: "왜곡 " + c + " 지칭" }],
  },
  {
    typeId: "KO_LIT_FACT", field: "distortions", idKey: "principle",
    build: (c) => [{ label: c, principle: "EMOTION_POLARITY_FLIP" }],
  },
  {
    typeId: "KO_RD_CRIT", field: "wrongOptionDesigns", idKey: "principle",
    build: (c) => LABELS.filter((l) => l !== c).map((l, i) => ({ label: l, principle: "P" + i })),
  },
  {
    typeId: "KO_LIT_NARR", field: "wrongOptionTraps", idKey: "device",
    build: (c) => LABELS.filter((l) => l !== c).map((l, i) => ({ label: l, device: "D" + i })),
  },
  {
    typeId: "KO_RD_STRUCT", field: "distractorPrinciples", idKey: "principle",
    build: (c) => LABELS.filter((l) => l !== c).map((l, i) => ({ label: l, principle: "S" + i })),
  },
  {
    typeId: "KO_RD_INFER", field: "trapPrinciples", idKey: "principle",
    build: (c) => [{ label: c, principle: "REVERSE_INFERENCE" }],
  },
  {
    typeId: "KO_LIT_EXPR", field: "optionAnalyses", idKey: "technique",
    build: (c) => LABELS.map((l, i) => ({ label: l, technique: "T" + i, flawPrinciple: l === c ? undefined : "F" + i })),
  },
  {
    typeId: "KO_LIT_COMPARE", field: "optionAnalyses", idKey: "marker",
    build: (c) => LABELS.map((l, i) => ({
      label: l, marker: "M" + i,
      partVerdicts: [{ part: "(가)", verdict: l === c ? "X" : "O" }],
    })),
  },
];

for (const { typeId, field, build, idKey } of EXT_CASES) {
  const correct = "③";
  const { pre, q, map } = buildMovedFixture(correct, { [field]: build(correct) });

  check(typeId + ": 셔플이 비-identity", [...map.entries()].some(([o, n]) => o !== n));
  check(typeId + ": correctAnswer 가 정답 텍스트를 따라감", q.correctAnswer === map.get(correct));
  check(
    typeId + ": options 라벨 자리는 ①~⑤ 고정",
    (q.options as any[]).map((o) => o.label).join("") === LABELS.join(""),
  );

  const preExt = (pre as any)[field] as any[];
  const postExt = (q as any)[field] as any[];
  check(typeId + ": 확장 필드 길이 보존", Array.isArray(postExt) && postExt.length === preExt.length);
  const allRemapped = preExt.every((preEl) => {
    const postEl = postExt.find((el) => el[idKey] === preEl[idKey]);
    return !!postEl && postEl.label === map.get(preEl.label);
  });
  check(typeId + ": " + field + " 라벨이 labelMap 대로 재매핑", allRemapped);

  // wrongOptionExplanations(배열형)도 동기 재매핑 (선존 동작 보존): 안정 토큰
  // "오답사유N" 으로 짝을 맞추고, 라벨과 본문 안의 원문자 지칭이 함께 이동했는지 확인.
  const postWoe = (q as any).wrongOptionExplanations as any[];
  const woeOk = ((pre as any).wrongOptionExplanations as any[]).every((preEl: any) => {
    const token = preEl.explanation.split(" — ")[0];
    const postEl = postWoe.find((el) => typeof el.explanation === "string" && el.explanation.startsWith(token + " — "));
    return (
      !!postEl &&
      postEl.label === map.get(preEl.label) &&
      postEl.explanation.includes(map.get(preEl.label) + " 선지가")
    );
  });
  check(typeId + ": wrongOptionExplanations 라벨+본문 지칭 재매핑", woeOk);
}

// ── A-2. 비원문자 라벨(㉠ 등)·partVerdicts.part 는 무접촉 ───────────────────
{
  const correct = "②";
  const { pre, q, map } = buildMovedFixture(correct, {
    trapDesign: [{ label: correct, principle: "X" }],
    conditions: [{ label: "㉠", text: "조건 하나" }],
    markers: [{ label: "㉠", family: "KOR_CIRCLED", spanText: "구절" }],
  });
  check("비원문자 조건 라벨 ㉠ 무접촉", (q as any).conditions[0].label === "㉠");
  check("마커 라벨 ㉠ 무접촉", (q as any).markers[0].label === "㉠");
  check("trapDesign 은 재매핑", (q as any).trapDesign[0].label === map.get(correct));
  check("pre 원본 참조 미변이 대비", (pre as any).trapDesign[0].label === correct);
}
{
  const correct = "④";
  const { q } = buildMovedFixture(correct, {
    optionAnalyses: LABELS.map((l, i) => ({ label: l, marker: "M" + i, partVerdicts: [{ part: "(가)", verdict: "O" }] })),
  });
  const parts = (q as any).optionAnalyses.map((a: any) => a.partVerdicts[0].part);
  check("KO_LIT_COMPARE partVerdicts.part (가) 무접촉", parts.every((p: string) => p === "(가)"));
}

// ── A-3. 비파괴성: 셔플 전 초안(중첩 참조 공유)의 좌표 보존 (KO-GEN-3 지원) ──
{
  const correct = "③";
  const original = baseQuestion(correct, 0, { trapDesign: [{ label: correct, principle: "X" }] });
  const mapped = { ...original }; // finalizeCandidate 의 얕은 스프레드 미러
  shuffleKoMc5Options(mapped as Record<string, unknown>);
  check("셔플 전 초안 trapDesign 라벨 불변(비파괴 재구축)", (original as any).trapDesign[0].label === correct);
  check("셔플 전 초안 correctAnswer 불변", (original as any).correctAnswer === correct);
  check("셔플 전 초안 options 불변", (original as any).options[2].text.includes("선지 3"));
}

// ── B. 셔플 전/후 validate 라운드트립 — 결함 코드 다중집합 불변 ─────────────
// 셔플이 정합 후보에 "새" 결함(라벨 desync)을 만들지 않는지: 픽스처가 원래
// 갖고 있던 결함 코드(빈 지문·근거 등)는 양쪽에 동일하게 떠야 한다.
function codeMultiset(issues: { code: string }[]): string {
  return issues.map((i) => i.code).sort().join(",");
}
for (const { typeId, field, build } of EXT_CASES) {
  const correct = "③";
  const { pre, q } = buildMovedFixture(correct, { [field]: build(correct) });
  const preIssues = validateKoQuestion({ typeId, question: structuredClone(pre), passage: "" });
  const postIssues = validateKoQuestion({ typeId, question: q, passage: "" });
  check(
    typeId + ": 셔플 전후 validate 코드 다중집합 동일",
    codeMultiset(preIssues) === codeMultiset(postIssues),
  );
}

// ── B-2. 비공허성 대조군: 확장 필드를 셔플 전 좌표로 되돌리면(=버그 재현)
// ko-correct-answer-invalid 가 실제로 발화해야 한다(검사 도달성 증명). ────────
{
  const correct = "③";
  const { pre, q } = buildMovedFixture(correct, {
    trapDesign: [{ label: correct, principle: "X" }],
  });
  const desynced = structuredClone(q);
  (desynced as any).trapDesign = structuredClone((pre as any).trapDesign); // 구 좌표 주입
  const issues = validateKoQuestion({ typeId: "KO_RD_APPLY", question: desynced, passage: "" });
  check(
    "desync 대조군: trapDesign 구좌표 → ko-correct-answer-invalid 발화",
    issues.some((i) => i.code === "ko-correct-answer-invalid" && i.message.includes("trapDesign")),
  );
}

// ── C. KO-GEN-2: 후처리 wrongOptionExplanations 형태 게이트 ─────────────────
{
  const aiOutput = {
    direction: "윗글의 내용과 일치하지 않는 것은?",
    options: LABELS.map((l, i) => ({ label: l, text: "선지 " + i })),
    correctAnswer: "①",
    wrongOptionExplanations: [
      { label: "②", explanation: "이 선지가 매력적이지만 틀린 이유 서술" },
      { label: "③", explanation: "이 선지가 매력적이지만 틀린 이유 서술" },
    ],
  };
  const ko = postProcessQuestion("KO_RD_FACT", "", structuredClone(aiOutput));
  check("KO 후처리: success", ko.success === true);
  check(
    "KO 후처리: wrongOptionExplanations 배열형 보존(봉투 계약)",
    Array.isArray(ko.data?.wrongOptionExplanations) &&
      (ko.data.wrongOptionExplanations as any[])[0].label === "②",
  );

  // TOPIC 은 align 단계가 설명 앞에 "'선지…' 선택지는" 을 붙일 수 있어 포함 검사.
  const en = postProcessQuestion("TOPIC", "", structuredClone(aiOutput));
  const enWoe = en.data?.wrongOptionExplanations as Record<string, string>;
  check("영어 후처리: 기존 Record 정규화 유지(무회귀)", en.success === true &&
    !Array.isArray(enWoe) && typeof enWoe === "object" &&
    typeof enWoe["②"] === "string" && enWoe["②"].includes("틀린 이유 서술"));

  // align 미적용 영어 PASSTHROUGH 유형에서는 Record 값이 원문 그대로여야 한다.
  const en2 = postProcessQuestion("SENTENCE_ORDER", "", structuredClone(aiOutput));
  const en2Woe = en2.data?.wrongOptionExplanations as Record<string, string>;
  check("영어 후처리(SENTENCE_ORDER): Record 값 원문 보존", en2.success === true &&
    !Array.isArray(en2Woe) && en2Woe["②"] === "이 선지가 매력적이지만 틀린 이유 서술");
}

// ── C-2. 셔플의 Record 방어 분기(과거 데이터/단독 사용 대비) ────────────────
{
  const correct = "③";
  const rec: Record<string, string> = {};
  const tokenOf = new Map<string, string>();
  LABELS.filter((l) => l !== correct).forEach((l, i) => {
    tokenOf.set(l, "레코드사유" + i);
    rec[l] = "레코드사유" + i + " — 정답 " + correct + " 과 달리 틀렸다";
  });
  const { pre, q, map } = buildMovedFixture(correct, {});
  void q; // buildMovedFixture 의 q 는 배열형 케이스 — Record 케이스는 새로 실행
  const q2 = structuredClone(pre);
  (q2 as any).wrongOptionExplanations = { ...rec };
  shuffleKoMc5Options(q2 as Record<string, unknown>);
  const map2 = measureLabelMap(pre, q2);
  const woe2 = (q2 as any).wrongOptionExplanations as Record<string, string>;
  const keysOk = Object.keys(rec).every((oldLabel) => {
    const v = woe2[map2.get(oldLabel) as string];
    return typeof v === "string" && v.startsWith(tokenOf.get(oldLabel) + " — ");
  });
  check("Record 방어 분기: 키가 labelMap 대로 이동", keysOk);
  const inlineOk = Object.keys(rec).every((oldLabel) => {
    const v = woe2[map2.get(oldLabel) as string];
    return typeof v === "string" && v.includes("정답 " + map2.get(correct) + " 과 달리");
  });
  check("Record 방어 분기: 본문 원문자 지칭도 치환", inlineOk);
  check("labelMap 실측 재사용 검증(배열 케이스와 동일 순열)",
    [...map.entries()].every(([o, n]) => map2.get(o) === n));
}

// ── D. KO-RC-3: resolveGeneratedQuestionPoints ─────────────────────────────
{
  const rdApply = getKoTypeModule("KO_RD_APPLY");
  const nsCond = getKoTypeModule("KO_NS_COND");
  check("영어: points 무시하고 1 고정(무회귀)", resolveGeneratedQuestionPoints({ points: 5 }, "BLANK_INFERENCE") === 1);
  check("영어: subType null → 1", resolveGeneratedQuestionPoints({}, null) === 1);
  check(
    "KO: structuredData.points 우선",
    resolveGeneratedQuestionPoints({ points: 4 }, "KO_RD_APPLY") === 4,
  );
  check(
    "KO: points 부재 → 모듈 defaultPoints (렌더모델과 동일 규칙)",
    !!rdApply && resolveGeneratedQuestionPoints({}, "KO_RD_APPLY") === rdApply.meta.defaultPoints,
  );
  check(
    "KO 서답형: KO_NS_COND defaultPoints 반영",
    !!nsCond && resolveGeneratedQuestionPoints({}, "KO_NS_COND") === nsCond.meta.defaultPoints,
  );
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-generation-pipeline-fixes-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const summary = runHarness();

test("ko generation pipeline fixes: all cases pass", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-generation-pipeline-fixes failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 40, `expected ≥40 checks, got ${summary.passed}`);
});
