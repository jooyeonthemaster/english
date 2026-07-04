import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// F4-isolation 수정 검증 (EN-REG-4/ISO-3 · ISO-4 · ISO-5 · ISO-6 · ISO-7 +
// minor EN-REG-5 · KO-EXPORT-1 · ISO-9).
//
// 1) 행동 검증(tsx 하니스): 순수 모듈은 실제로 임포트해 실행한다 —
//    - extractionJobsListUrl: 워크스페이스 경로 기준 과목 스코프 URL.
//    - takeKoSetSharedPassageOnce: DOCX KO 세트 공유지문 dedup(첫 그룹만 1박스).
//    - renderFormattedInline: ㉠-㉭ 마커 KO 게이트(영어 유형 평문 환원, KO/무
//      subType 경로는 마커 유지).
// 2) 배선 검증(소스 계약): 라우트/클라이언트 배선처럼 prisma·auth 를 끌고 와
//    임포트가 불가능한 지점은 소스 텍스트 계약으로 고정한다(회귀 시 즉시 실패).
const harnessSource = `
import extractionAdapterMod from "@/components/workbench/task-queue/adapters/extraction-adapter";
const { extractionJobsListUrl } = extractionAdapterMod;
import assembleMod from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";
const { takeKoSetSharedPassageOnce } = assembleMod;
import paperItemUtilsMod from "@/components/exams/paper-builder/paper-item-utils";
const { renderFormattedInline } = paperItemUtilsMod;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

// ── (1) 작업 드로어 추출 잡 목록 URL — 경로 기준 과목 스코프 ──
check(
  "extraction url: 영어 workbench → 기본(subject 파라미터 없음)",
  extractionJobsListUrl("/director/workbench/passages") ===
    "/api/extraction/jobs?limit=50",
);
check(
  "extraction url: 국어 라우트 → subject=KOREAN",
  extractionJobsListUrl("/director/korean/generate") ===
    "/api/extraction/jobs?limit=50&subject=KOREAN",
);
check(
  "extraction url: SSR(빈 경로)도 기본 스코프",
  extractionJobsListUrl("") === "/api/extraction/jobs?limit=50",
);

// ── (2) DOCX KO 세트 공유지문 dedup — takeKoSetSharedPassageOnce ──
const passage =
  "인간의 존엄성은 근대 헌법의 토대가 되는 개념이다. " +
  "그러나 계약 자유의 원칙은 시장의 힘 앞에서 개인을 보호하지 못했다.";
const koMember = (subType: string, label: string, spanText: string, orderNum: number) => ({
  orderNum,
  passageContent: passage,
  sourceQuestion: {
    subType,
    structuredData: {
      markers: [{ family: "KOR_CIRCLED", label, spanText }],
    },
    passage: { content: passage },
  },
});
const memberA = koMember("KO_RD_FACT", "㉠", "계약 자유의 원칙", 3);
const memberB = koMember("KO_RD_INFER", "㉡", "인간의 존엄성", 4);

{
  const rendered = new Set<string>();
  const first = takeKoSetSharedPassageOnce(rendered, "set:s1", [memberA, memberB]);
  check("dedup: 첫 그룹은 공유지문 반환", first.content !== null && !first.duplicate);
  check(
    "dedup: 지시문 [3~4] 선두",
    typeof first.content === "string" && first.content.startsWith("[3~4]"),
    String(first.content).slice(0, 20),
  );
  // 같은 setId 그룹이 (사이 블록으로) 쪼개져 다시 오면 — 지문 억제.
  const second = takeKoSetSharedPassageOnce(rendered, "set:s1", [memberB]);
  check("dedup: 둘째 그룹은 content null + duplicate", second.content === null && second.duplicate === true);
  // 다른 세트는 독립적으로 1회 렌더.
  const other = takeKoSetSharedPassageOnce(rendered, "set:s2", [memberA]);
  check("dedup: 다른 setId 는 독립 1회", other.content !== null && !other.duplicate);
}
{
  // 영어/일반 그룹(무회귀): content null·duplicate false·셋 오염 없음.
  const rendered = new Set<string>();
  const en = {
    orderNum: 1,
    passageContent: "An English passage.",
    sourceQuestion: { subType: "BLANK_INFERENCE", structuredData: null, passage: { content: "An English passage." } },
  };
  const r1 = takeKoSetSharedPassageOnce(rendered, "passage:p1", [en]);
  const r2 = takeKoSetSharedPassageOnce(rendered, "passage:p1", [en]);
  check(
    "dedup: 영어 그룹은 항상 {null,false} + 셋 무오염",
    r1.content === null && !r1.duplicate && r2.content === null && !r2.duplicate && rendered.size === 0,
  );
}

// ── (3) renderFormattedInline ㉠-㉭ KO 게이트 (EN-REG-5) ──
function collectClassNames(node: unknown, out: string[]) {
  if (Array.isArray(node)) {
    for (const child of node) collectClassNames(child, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return;
  if (typeof props.className === "string") out.push(props.className);
  if (props.children !== undefined) collectClassNames(props.children, out);
}
function hasBlueMarker(nodes: unknown): boolean {
  const classes: string[] = [];
  collectClassNames(nodes, classes);
  return classes.some((c) => c.includes("text-blue-700"));
}
const koEnumText = "㉠ 관계대명사를 사용할 것";
check(
  "EN-REG-5: 영어 유형(subType 명시) 텍스트의 ㉠ 은 평문(파란 마커 아님)",
  hasBlueMarker(renderFormattedInline(koEnumText, "CONDITIONAL_WRITING")) === false,
);
check(
  "EN-REG-5: KO 유형은 ㉠ 마커 강조 유지",
  hasBlueMarker(renderFormattedInline(koEnumText, "KO_RD_FACT")) === true,
);
check(
  "EN-REG-5: subType 미전달(KO 세트 공유지문 박스 경로)은 마커 유지",
  hasBlueMarker(renderFormattedInline(koEnumText)) === true,
);
check(
  "EN-REG-5: 영어 원형숫자 ①(기존 마커)은 영어 유형에서도 그대로 강조 — 무회귀",
  hasBlueMarker(renderFormattedInline("① first option", "IRRELEVANT")) === true,
);
check(
  "EN-REG-5: KO 밑줄 마커(__㉠ …__)도 KO/무 subType 경로에서 병합 렌더 유지",
  hasBlueMarker(renderFormattedInline("그는 __㉠ 계약 자유__ 를 말했다.")) === true,
);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-isolation-scope-harness.mts");
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

test("F4-isolation 행동 검증: 추출 URL 스코프·DOCX KO 세트 dedup·㉠ KO 게이트", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-isolation-scope failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 13, `expected ≥13 checks, got ${summary.passed}`);
});

// ── 배선(소스 계약) 검증 — prisma/auth 의존으로 임포트 불가한 지점 고정 ──
const src = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

test("EN-REG-4/ISO-3: /api/passages/list 폴더 목록에 과목 스코프 + P2022 강등", () => {
  const route = src("src/app/api/passages/list/route.ts");
  assert.match(route, /buildCollectionSubjectScopeWhere\(subjectScope\)/);
  assert.match(route, /isMissingColumnError/);
  // 폴백 경로는 스코프 없이 레거시(academyId만) 재조회여야 한다.
  assert.match(
    route,
    /if \(!isMissingColumnError\(error\)\) throw error;[\s\S]*?where: \{ academyId: staff\.academyId \}/,
  );
});

test("ISO-4: 국어 generate 폴더 생성이 subject=KOREAN 을 전달", () => {
  const client = src(
    "src/app/(director)/director/workbench/generate/generate-page-client.tsx",
  );
  assert.match(
    client,
    /createPassageCollection\(\{[\s\S]*?\.\.\.\(subjectScope === "KOREAN" \? \{ subject: "KOREAN" as const \} : \{\}\)/,
  );
});

test("ISO-5: 국어 시험지 생성/편집이 국어 전용 라우트로 착륙한다(경로 완전 분리)", () => {
  // 판별자 일급화(P0) 후 설계 변경(유저 확정): ?scope=KOREAN 쿼리로 공유 영어 경로에
  // 착륙하던 방식 → /director/korean/exams/* 전용 라우트로 완전 분리.
  const list = src("src/components/exams/exam-list-client.tsx");
  // 국어 목록 편집 링크는 국어 전용 경로로(공유 /workbench/exams 착륙 금지).
  assert.match(list, /`\/director\/korean\/exams\/\$\{id\}\/edit`/);
  assert.match(list, /router\.push\(examEditHref\(id\)\)/);

  const koPage = src("src/app/(director)/director/korean/exams/page.tsx");
  assert.match(koPage, /subjectScope="KOREAN"/);
  // 국어 목록은 subject 컬럼 기반(getExams subject 스코프)으로 조회 — KO_ 파생 폐기.
  assert.match(koPage, /getExams\(staff\.academyId, \{ subject: "KOREAN" \}\)/);

  // 국어 전용 편집 라우트 신설 — subjectScope="KOREAN" 로 빌더 진입 + 영어 시험지
  // 진입 시 영어 라우트로 방어 리다이렉트.
  const koEdit = src(
    "src/app/(director)/director/korean/exams/[examId]/edit/page.tsx",
  );
  assert.match(koEdit, /subjectScope="KOREAN"/);
  assert.match(koEdit, /getExamPaperBuilderData\(staff\.academyId, \{\s*subject: "KOREAN",?\s*\}\)/);
  assert.match(koEdit, /exam\.subject !== "KOREAN"/);

  // 국어 전용 생성 라우트도 신설(공유 /workbench/exams/create 착륙 금지).
  const koCreate = src(
    "src/app/(director)/director/korean/exams/create/page.tsx",
  );
  assert.match(koCreate, /subjectScope="KOREAN"/);

  // 공유 영어 편집 라우트는 국어 시험지(subject==='KOREAN')를 국어 라우트로 대칭 리다이렉트.
  const enEdit = src(
    "src/app/(director)/director/workbench/exams/[examId]/edit/page.tsx",
  );
  assert.match(enEdit, /exam\.subject === "KOREAN"/);
  assert.match(enEdit, /`\/director\/korean\/exams\/\$\{examId\}\/edit`/);

  // 빌더 저장은 신규 국어 시험지에 subject 스탬프 + 국어 편집 경로로 착륙(examEditBase).
  const builder = src("src/components/exams/exam-paper-builder-client.tsx");
  assert.match(builder, /subject: subjectScope/);
  assert.match(builder, /"\/director\/korean\/exams"/);

  const action = src("src/actions/exam-paper-builder.ts");
  assert.match(action, /buildCollectionSubjectScopeWhere\(opts\?\.subject\)/);
  assert.match(action, /subject: opts\?\.subject/);
});

test("ISO-6: extraction jobs 목록 서버 과목 필터(IS DISTINCT FROM) + subject 파생 노출", () => {
  const listJobs = src("src/app/api/extraction/jobs/_lib/list-jobs.ts");
  // NULL metadata / subject 키 부재 영어 잡이 절대 빠지지 않는 술어.
  assert.match(listJobs, /IS DISTINCT FROM 'KOREAN'/);
  assert.match(listJobs, /searchParams\.get\("subject"\) === "KOREAN"/);
  assert.match(listJobs, /metadata->>'subject' = 'KOREAN'/);
  // metadata 는 계속 제거하되 파생 subject 필드는 노출.
  assert.match(listJobs, /metadata: undefined/);
  assert.match(listJobs, /subject:\s*\n?\s*jsonRecord\(job\.metadata\)\?\.subject === "KOREAN"/);
});

test("ISO-7: webtoons/list 과목 스코프(기본=국어 제외·NULL 보존, scope=KOREAN=국어만)", () => {
  const route = src("src/app/api/webtoons/list/route.ts");
  assert.match(route, /searchParams\.get\("scope"\) === "KOREAN"/);
  assert.match(route, /where\.passage = \{ is: \{ subject: "KOREAN" \} \}/);
  // 기존 영어 지문(subject null)이 탈락하지 않도록 null OR 필수.
  assert.match(
    route,
    /is: \{ OR: \[\{ subject: null \}, \{ subject: \{ not: "KOREAN" \} \}\] \}/,
  );
  // passageId 명시 스코프 호출은 과목 필터를 겹치지 않는다(국어 지문 상세 무회귀).
  assert.match(route, /else if \(!passageId\)/);

  const picker = src(
    "src/components/workbench/analysis-report/webtoon-picker-modal.tsx",
  );
  assert.match(picker, /subject === "KOREAN" \? "&scope=KOREAN" : ""/);
  const fetchCount = (picker.match(/\/api\/webtoons\/list\?status=COMPLETED&limit=100\$\{scopeParam\}/g) || []).length;
  assert.equal(fetchCount, 2, "픽커의 두 페치 모두 scopeParam 을 실어야 한다");
});

test("ISO-9: 영어 시험지 목록 폴더 배지가 영어 시험지 id 로 교집합", () => {
  const page = src("src/app/(director)/director/exams/page.tsx");
  assert.match(page, /new Set\(exams\.map\(\(exam\) => exam\.id\)\)/);
  assert.match(page, /examIds\.filter\(\(id\) => enExamIds\.has\(id\)\)/);
});
