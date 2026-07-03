import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 국어 지문 세트 — export(DOCX/HWPX) 공유지문 배선 결정론 스위트 (B1b, 실LLM 0):
//   (1) resolveKoSetSharedPassageContent: KO 세트 그룹에만 "지시문\n병합마커지문"
//       — set: 프리픽스가 아니거나 멤버에 비-KO 유형이 섞이면 null(영어 무회귀 게이트)
//   (2) HWPX resolveGroupPassage: KO 세트 그룹 → 공유지문 1박스 강제(includePassage),
//       영어 그룹은 기존 로직 그대로
//   (3) HWPX break-plan(computePaginatedLayout): KO 세트 그룹 선두 fragment 가
//       지시문을 포함한 공유지문을 미리보기와 동일하게 싣는다
// TS + "@/..." 앨리어스 → tsx 하니스(ko-question-set 미러).
const harnessSource = `
import koSetPassage from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/ko-set-passage";
import builderTables from "@/app/api/exams/[examId]/export-hwpx/_lib/builder-tables";
import breakPlan from "@/app/api/exams/[examId]/export-hwpx/_lib/break-plan";

const { resolveKoSetSharedPassageContent, suppressKoSetMemberInlinePassages } = koSetPassage;
const { resolveGroupPassage } = builderTables;
const { computePaginatedLayout } = breakPlan;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

const passage =
  "인간의 존엄성은 근대 헌법의 토대가 되는 개념이다. " +
  "그러나 계약 자유의 원칙은 시장의 힘 앞에서 개인을 보호하지 못했다. " +
  "이에 국가는 노동법을 통해 계약 내용에 직접 개입하기 시작했다. " +
  "결국 사회적 기본권은 자유권과 상호 보완적인 관계를 형성하게 되었다.";

const memberA = {
  orderNum: 3,
  passageContent: passage,
  sourceQuestion: {
    subType: "KO_RD_FACT",
    structuredData: {
      markers: [
        { family: "KOR_CIRCLED", label: "㉠", spanText: "계약 자유의 원칙" },
      ],
    },
    passage: { content: passage },
  },
};
const memberB = {
  orderNum: 4,
  passageContent: passage,
  sourceQuestion: {
    subType: "KO_RD_INFER",
    structuredData: {
      markers: [
        { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "노동법" },
      ],
    },
    passage: { content: passage },
  },
};

// ── (1) resolveKoSetSharedPassageContent ────────────────────────────────────
{
  const shared = resolveKoSetSharedPassageContent("set:s1", [memberA, memberB]);
  check("KO set group resolves", shared !== null);
  if (shared) {
    check(
      "directive [3~4] leads the box",
      shared.startsWith("[3~4] 다음 글을 읽고 물음에 답하시오."),
      shared.slice(0, 40),
    );
    check("member A marker merged (㉠+밑줄)", shared.includes("㉠__계약 자유의 원칙__"));
    check("member B marker merged (ⓐ+밑줄)", shared.includes("ⓐ__노동법__"));
  }

  const single = resolveKoSetSharedPassageContent("set:s1", [memberA]);
  check("single member directive [3]", single !== null && single.startsWith("[3] "));

  check(
    "non-set groupId → null (영어 솔로 무회귀)",
    resolveKoSetSharedPassageContent("single:abc", [memberA, memberB]) === null,
  );
  check(
    "passage: group → null",
    resolveKoSetSharedPassageContent("passage:p1", [memberA, memberB]) === null,
  );
  const enMember = {
    orderNum: 5,
    passageContent: passage,
    sourceQuestion: { subType: "BLANK_INFERENCE", structuredData: {}, passage: { content: passage } },
  };
  check(
    "set: group with non-KO member → null (혼합 게이트)",
    resolveKoSetSharedPassageContent("set:s1", [memberA, enMember]) === null,
  );
  check(
    "empty passage → null",
    resolveKoSetSharedPassageContent("set:s1", [
      { ...memberA, passageContent: "", sourceQuestion: { ...memberA.sourceQuestion, passage: null } },
    ]) === null,
  );
  check("empty items → null", resolveKoSetSharedPassageContent("set:s1", []) === null);
}

// ── (1b) suppressKoSetMemberInlinePassages — 라우트 force 되살림 상쇄 ────────
{
  const koSetMember = {
    groupId: "set:s1",
    includePassage: true, // 라우트가 force 로 되살린 상태
    sourceQuestion: { subType: "KO_RD_FACT" },
  };
  const koSolo = {
    groupId: "single:q9",
    includePassage: true,
    sourceQuestion: { subType: "KO_RD_FACT" },
  };
  const enItem = {
    groupId: "single:q8",
    includePassage: true,
    sourceQuestion: { subType: "BLANK_INFERENCE" },
  };
  const out = suppressKoSetMemberInlinePassages([koSetMember, koSolo, enItem]);
  check("KO set member inline passage suppressed", out[0].includePassage === false);
  check("KO solo keeps inline passage", out[1].includePassage === true);
  check("EN item untouched (same reference)", out[2] === enItem);

  const enOnly = [enItem, koSolo];
  check(
    "no KO set member → identity (배열 참조 그대로)",
    suppressKoSetMemberInlinePassages(enOnly) === enOnly,
  );
}

// ── (2) HWPX resolveGroupPassage ────────────────────────────────────────────
{
  const koItems = [
    { ...memberA, questionId: "q1", groupId: "set:s1", includePassage: false, questionText: "윗글의 내용과 일치하는 것은?" },
    { ...memberB, questionId: "q2", groupId: "set:s1", includePassage: false, questionText: "㉠에 대한 설명으로 적절한 것은?" },
  ] as any[];
  const r = resolveGroupPassage(koItems[0], koItems);
  check("HWPX KO set group forces includePassage", r.includePassage === true);
  check(
    "HWPX KO set passage = directive + merged markers",
    r.passageContent.startsWith("[3~4] ") && r.passageContent.includes("㉠__계약 자유의 원칙__"),
    r.passageContent.slice(0, 60),
  );

  // 영어 그룹 무회귀 — set: 이 아닌 그룹은 기존 로직(지시문 미부착) 그대로.
  const enItem = {
    questionId: "q3",
    groupId: "single:q3",
    includePassage: true,
    orderNum: 1,
    passageContent: "The quick brown fox jumps over the lazy dog.",
    questionText: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    sourceQuestion: {
      // 인라인 지문 유형(CONTENT_MATCH 등)이 아닌, 별도 지문 박스 유형으로 검증.
      subType: "BLANK_INFERENCE",
      structuredData: {},
      passage: { content: "The quick brown fox jumps over the lazy dog." },
      questionText: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    },
  } as any;
  const en = resolveGroupPassage(enItem, [enItem]);
  check("EN group keeps legacy include", en.includePassage === true);
  check(
    "EN group content has no KO set directive",
    !en.passageContent.includes("다음 글을 읽고 물음에 답하시오"),
    en.passageContent.slice(0, 60),
  );
}

// ── (3) break-plan: KO 세트 fragment 가 공유지문(지시문 포함)을 싣는다 ──────
{
  const resolvedItems = [
    {
      localId: "L1",
      questionId: "q1",
      orderNum: 1,
      groupId: "set:s1",
      includePassage: false,
      passageTitle: "",
      passageContent: passage,
      questionText: "윗글의 내용과 일치하는 것은?",
      options: [
        { label: "①", text: "가" },
        { label: "②", text: "나" },
        { label: "③", text: "다" },
        { label: "④", text: "라" },
        { label: "⑤", text: "마" },
      ],
      sourceQuestion: memberA.sourceQuestion,
    },
    {
      localId: "L2",
      questionId: "q2",
      orderNum: 2,
      groupId: "set:s1",
      includePassage: false,
      passageTitle: "",
      passageContent: passage,
      questionText: "㉠에 대한 설명으로 적절한 것은?",
      options: [
        { label: "①", text: "가" },
        { label: "②", text: "나" },
        { label: "③", text: "다" },
        { label: "④", text: "라" },
        { label: "⑤", text: "마" },
      ],
      sourceQuestion: memberB.sourceQuestion,
    },
  ] as any[];

  const layout = computePaginatedLayout({
    blocks: undefined,
    resolvedItems,
    layout: { paperSize: "A4", columns: 2, density: "comfortable" },
    template: "clean",
  });
  check("paginated layout computed", !!layout && layout.pages.length > 0);
  if (layout) {
    const firstCol = layout.pages[0][0] ?? [];
    const f0 = firstCol[0];
    check("first fragment renders shared passage box", !!f0 && f0.includePassage === true);
    const passageText = (f0?.passageRenderedLines ?? [])
      .join("")
      .replace(/\\s+/g, "");
    check(
      "fragment passage carries [1~2] directive",
      passageText.includes("[1~2]다음글을읽고물음에답하시오."),
      passageText.slice(0, 60),
    );
    check(
      "fragment passage carries merged marker",
      passageText.includes("㉠__계약자유의원칙__"),
    );
  }
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-set-export-wiring-harness.mts");
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

test("ko set export wiring: shared passage box (DOCX/HWPX) + EN no-regression", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-set-export-wiring failures: ${JSON.stringify(summary.failures, null, 2)}`,
  );
  assert.ok(summary.passed >= 18, `expected ≥18 checks, got ${summary.passed}`);
});
