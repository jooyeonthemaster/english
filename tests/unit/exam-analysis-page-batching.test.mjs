// 시험 직접분석 v4 페이지 청크·국소 배치 계획(src/lib/exam-report/exam-page-batching.ts)
// + 장당 이미지 예산(llm-images.computePerPageBudgetBytes) 계약 단위 테스트
// (docs/exam-analysis-v4-spec.md §3 U1-4·U1-5). tsx 하네스 관용구(exam-next-step 테스트와
// 동일): TS 모듈을 임시 하네스에서 import 해 JSON 으로 찍고 여기서 단정한다.
//
// 검증 축:
//  1. E1b 배치 — 문항 ≤6·페이지 폭 ≤3 에서 끊기고, 첨부 창 = 범위 ±1(클램프·연속·≤6장).
//  2. page 없는 문항(구 지도)은 pages:null(전 페이지 폴백)로 뒤에 6개씩 — 무회귀.
//  3. E1a 청크 병합 — page = offset+상대, 중복 번호는 첫 청크 우선, order 재부여,
//     상대 순번이 청크 밖이면 page 없음, totalPoints 는 첫 non-null.
//  4. 장당 예산 분모 = min(페이지 수, pagesPerCall) — 20장도 1.5MB 상한 유지.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as b from "@/lib/exam-report/exam-page-batching";
import * as li from "@/lib/exam-report/llm-images";
const bm: any = (b as any).default ?? b;
const lm: any = (li as any).default ?? li;
const { planPageLocalBatches, selectImageWindow, mergeExamMapChunks, PAGE_BATCH_MAX_ENTRIES,
  PAGE_BATCH_MAX_PAGE_SPAN, PAGE_BATCH_MAX_IMAGES, EXAM_MAP_CHUNK_PAGES } = bm;
const { computePerPageBudgetBytes, DEFAULT_PAGES_PER_CALL } = lm;

function e(number: string, page?: number) {
  return { number, order: 0, kind: "MC", points: 3, typeLabel: "", brief: "", page };
}
const out: Record<string, any> = {};
out.consts = { PAGE_BATCH_MAX_ENTRIES, PAGE_BATCH_MAX_PAGE_SPAN, PAGE_BATCH_MAX_IMAGES, EXAM_MAP_CHUNK_PAGES, DEFAULT_PAGES_PER_CALL };

// 20장 시험지: 1p 3문항 · 2p 2 · 3p 2 · 4p 1 · 5p 1 · 6p 1 · 7p 1 · 8p 1 · 20p 1 (+입력 순서 뒤섞임)
const paged = [e("3",1), e("1",1), e("2",1), e("5",2), e("4",2), e("6",3), e("7",3), e("8",4), e("9",5), e("10",6), e("11",7), e("12",8), e("30",20)];
out.paged = planPageLocalBatches(paged, 20).map((x: any) => ({ numbers: x.entries.map((q: any) => q.number), pages: x.pages }));

// 구 지도(page 없음) 8문항 → 6 + 2, pages null, 입력 순 유지
const legacy = ["1","2","3","4","5","6","7","8"].map((n) => e(n));
out.legacy = planPageLocalBatches(legacy, 12).map((x: any) => ({ numbers: x.entries.map((q: any) => q.number), pages: x.pages }));

// 혼합: page 있는 2문항 + 없는 1문항 + pageCount 밖(99) 1문항
out.mixed = planPageLocalBatches([e("a"), e("b", 2), e("c", 99), e("d", 1)], 3).map((x: any) => ({ numbers: x.entries.map((q: any) => q.number), pages: x.pages }));

// 한 장에 8문항 → 6 + 2, 둘 다 같은 창
out.dense = planPageLocalBatches(["1","2","3","4","5","6","7","8"].map((n) => e(n, 4)), 10).map((x: any) => ({ numbers: x.entries.map((q: any) => q.number), pages: x.pages }));

// page 없는 문항 1건만 — pages:null 배치가 반드시 존재해야 한다(전 페이지 폴백 세트 경로 보장)
out.pageless = planPageLocalBatches([e("x")], 12).map((x: any) => ({ numbers: x.entries.map((q: any) => q.number), pages: x.pages }));

// forceUnpaged: page 유효 문항이라도 재시도 키면 pages:null 그룹으로(복구 사다리)
const retry = new Set(["5"]);
out.forced = planPageLocalBatches([e("4", 2), e("5", 2), e("6", 3)], 12, (q: any) => retry.has(q.number)).map((x: any) => ({ numbers: x.entries.map((q: any) => q.number), pages: x.pages }));
// forceUnpaged 전부 true → 국소 배치 0, 전 페이지 6개씩(같은 실행 내 치유 그룹 형태)
out.forcedAll = planPageLocalBatches(["1","2","3","4","5","6","7"].map((n, i) => e(n, i + 1)), 12, () => true).map((x: any) => ({ numbers: x.entries.map((q: any) => q.number), pages: x.pages }));

out.window = {
  first: selectImageWindow(1, 1, 20),
  last: selectImageWindow(20, 20, 20),
  mid: selectImageWindow(5, 7, 20),
  tiny: selectImageWindow(1, 1, 1),
  zero: selectImageWindow(1, 1, 0),
  wide: selectImageWindow(3, 12, 20),
};

// E1a 청크 병합: 청크1(offset 0, 6장) · 청크2(offset 6, 4장). "7" 은 양쪽에 등장(첫 청크 우선).
out.merge = mergeExamMapChunks([
  { offset: 0, pageCount: 6, totalPoints: null, questions: [
    { number: "2", order: 2, page: 1 }, { number: "1", order: 1, page: 1 }, { number: "7", order: 3, page: 6 }, { number: "8", order: 4, page: 9 } ] },
  { offset: 6, pageCount: 4, totalPoints: 100, questions: [
    { number: "7", order: 1, page: 1 }, { number: "9", order: 2, page: 2 }, { number: " 10 ", order: 3 } ] },
]);
out.mergeSingle = mergeExamMapChunks([
  { offset: 0, pageCount: 3, totalPoints: 50, questions: [ { number: "2", order: 2, page: 3 }, { number: "1", order: 1, page: 1 } ] },
]);

const MB = 1024 * 1024;
out.budget = {
  p20c6: computePerPageBudgetBytes(20, 6),
  p4c6: computePerPageBudgetBytes(4, 6),
  p12c12: computePerPageBudgetBytes(12, 12),
  p20c20: computePerPageBudgetBytes(20, 20),
  p1c6: computePerPageBudgetBytes(1, 6),
  cap: Math.floor(1.5 * MB),
  total: 12 * MB,
};
console.log(JSON.stringify(out));
`;

function runHarness() {
  const dir = path.join(repoRoot, ".tmp-unit-exam-page-batching");
  mkdirSync(dir, { recursive: true });
  const harnessPath = path.join(dir, "harness.ts");
  writeFileSync(harnessPath, harnessSource);
  try {
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const line = raw.trim().split("\n").pop();
    return JSON.parse(line);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const R = runHarness();

function isContiguous(pages) {
  return pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
}

test("상수 — 스펙 §1-5 숫자(6문항·폭 3·이미지 6·청크 6)와 llm-images 기본 분모가 같다", () => {
  assert.equal(R.consts.PAGE_BATCH_MAX_ENTRIES, 6);
  assert.equal(R.consts.PAGE_BATCH_MAX_PAGE_SPAN, 3);
  assert.equal(R.consts.PAGE_BATCH_MAX_IMAGES, 6);
  assert.equal(R.consts.EXAM_MAP_CHUNK_PAGES, 6);
  assert.equal(R.consts.DEFAULT_PAGES_PER_CALL, R.consts.EXAM_MAP_CHUNK_PAGES);
});

test("E1b 배치 — page 오름차순, ≤6문항, 페이지 폭 ≤3, 창 = 범위 ±1 연속 ≤6장", () => {
  const batches = R.paged;
  assert.ok(batches.length >= 3);
  const all = batches.flatMap((b) => b.numbers);
  assert.equal(all.length, 13);
  // 첫 배치: 1p 3문항(입력 순 3,1,2 유지) + 2p 2문항(5,4) + 3p 1문항 → 6문항에서 끊김
  assert.deepEqual(batches[0].numbers, ["3", "1", "2", "5", "4", "6"]);
  assert.deepEqual(batches[0].pages, [1, 2, 3, 4]); // 1~3 ±1 → 1..4(1 아래 클램프)
  // 둘째 배치: 3p 잔여 7 + 4p 8 + 5p 9 → 폭 3(3~5)에서 6p 는 새 배치
  assert.deepEqual(batches[1].numbers, ["7", "8", "9"]);
  assert.deepEqual(batches[1].pages, [2, 3, 4, 5, 6]);
  assert.deepEqual(batches[2].numbers, ["10", "11", "12"]);
  assert.deepEqual(batches[2].pages, [5, 6, 7, 8, 9]);
  assert.deepEqual(batches[3].numbers, ["30"]);
  assert.deepEqual(batches[3].pages, [19, 20]);
  for (const b of batches) {
    assert.ok(b.numbers.length <= 6);
    assert.ok(b.pages.length <= 6);
    assert.ok(isContiguous(b.pages));
  }
});

test("구 지도(page 없음) — pages:null 전 페이지 폴백, 입력 순 6개씩(무회귀)", () => {
  assert.deepEqual(R.legacy, [
    { numbers: ["1", "2", "3", "4", "5", "6"], pages: null },
    { numbers: ["7", "8"], pages: null },
  ]);
});

test("혼합 — page 유효 문항이 먼저(오름차순), 무효(없음·범위 밖)는 뒤에 폴백", () => {
  assert.deepEqual(R.mixed, [
    { numbers: ["d", "b"], pages: [1, 2, 3] },
    { numbers: ["a", "c"], pages: null },
  ]);
});

test("한 장 8문항 — 6+2 로 갈리고 두 배치 모두 같은 창(3..5)", () => {
  assert.equal(R.dense.length, 2);
  assert.deepEqual(R.dense[0].pages, [3, 4, 5]);
  assert.deepEqual(R.dense[1].pages, [3, 4, 5]);
  assert.deepEqual(R.dense[1].numbers, ["7", "8"]);
});

test("page 없는 문항 단독 — pages:null 배치가 존재한다(전 페이지 폴백 세트 경로가 실제로 밟힌다)", () => {
  assert.deepEqual(R.pageless, [{ numbers: ["x"], pages: null }]);
  assert.ok(R.pageless.some((b) => b.pages === null));
});

test("forceUnpaged — page 유효 문항도 재시도 키면 pages:null 로 보낸다(국소 미스 → 전 페이지 사다리)", () => {
  assert.deepEqual(R.forced, [
    { numbers: ["4", "6"], pages: [1, 2, 3, 4] },
    { numbers: ["5"], pages: null },
  ]);
  // 전부 강제 → 국소 배치 0, 입력 순 6개씩 전 페이지 그룹
  assert.deepEqual(R.forcedAll, [
    { numbers: ["1", "2", "3", "4", "5", "6"], pages: null },
    { numbers: ["7"], pages: null },
  ]);
  assert.ok(R.forcedAll.every((b) => b.pages === null));
});

test("selectImageWindow — 양끝 클램프·연속·상한 6·대상 범위 보존", () => {
  assert.deepEqual(R.window.first, [1, 2]);
  assert.deepEqual(R.window.last, [19, 20]);
  assert.deepEqual(R.window.mid, [4, 5, 6, 7, 8]);
  assert.deepEqual(R.window.tiny, [1]);
  assert.deepEqual(R.window.zero, []);
  // 폭 10(3..12)은 상한 6 을 넘어 대상 시작 장부터 6장(3..8) — 상수 변경 대비 일반형
  assert.deepEqual(R.window.wide, [3, 4, 5, 6, 7, 8]);
});

test("E1a 청크 병합 — page=offset+상대, 첫 청크 우선 dedupe, order 재부여, 청크 밖 page 는 없음", () => {
  const qs = R.merge.questions;
  assert.deepEqual(qs.map((q) => q.number), ["1", "2", "7", "8", "9", " 10 "]);
  assert.deepEqual(qs.map((q) => q.order), [1, 2, 3, 4, 5, 6]);
  assert.equal(qs[0].page, 1);
  assert.equal(qs[1].page, 1);
  assert.equal(qs[2].page, 6); // 청크1(offset 0) 의 상대 6 — 청크2 의 "7"(page 7) 은 버려짐
  assert.equal(qs[3].page, undefined); // 상대 9 > 청크 장수 6 → 무효
  assert.equal(qs[4].page, 8); // offset 6 + 2
  assert.equal(qs[5].page, undefined); // page 미출력
  assert.equal(R.merge.totalPoints, 100); // 첫 non-null
  // 단일 청크: 청크 내 order(인쇄 순서) 를 믿는다 — page 로 재정렬하지 않는다
  assert.deepEqual(R.mergeSingle.questions.map((q) => q.number), ["1", "2"]);
  assert.deepEqual(R.mergeSingle.questions.map((q) => q.page), [1, 3]);
  assert.equal(R.mergeSingle.totalPoints, 50);
});

test("장당 예산 — 분모 min(페이지 수, pagesPerCall): 20장도 1.5MB 상한, 전 페이지 1콜은 종전 값", () => {
  const { cap, total } = R.budget;
  assert.equal(R.budget.p20c6, cap); // 12MB/6 = 2MB → 캡 1.5MB
  assert.equal(R.budget.p4c6, cap); // 12MB/4 = 3MB → 캡
  assert.equal(R.budget.p1c6, cap);
  assert.equal(R.budget.p12c12, Math.floor(total / 12)); // 종전(전 페이지 1콜) 1MB
  assert.equal(R.budget.p20c20, Math.floor(total / 20)); // 종전이라면 ~600KB 로 압착됐을 값
  assert.ok(R.budget.p20c6 > R.budget.p20c20);
  // 전 페이지 폴백 세트(분모=전체 장수)는 콜당 총량 12MB 이내 — pagesPerCall 6 세트를
  // 전 페이지 한 콜에 실으면 12장 18MB·20장 30MB 로 넘기므로 폴백은 이 세트여야 한다.
  assert.ok(R.budget.p12c12 * 12 <= total);
  assert.ok(R.budget.p20c20 * 20 <= total);
  assert.ok(R.budget.p20c6 * 20 > total); // 국소 세트를 전 페이지에 실으면 예산 초과(폴백 세트 필요 근거)
  assert.ok(R.budget.p12c12 * 12 > total * 0.9); // 폴백이 필요 이상으로 압착하지 않는다
});
