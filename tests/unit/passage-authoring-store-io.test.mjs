import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// AI 지문 생성 — 스토어 I/O 계약 (CONTRACTS §1 "단위 테스트를 먼저 추가한 뒤 UI를
// 손댄다" 의 이행분).
//
// 왜 이 세 가지인가 — 셋 다 깨졌을 때 사용자가 크레딧을 잃는 경로다.
//  ① normalizeJobRow 가 잡 응답 **두 모양**을 모두 읽는가.
//     · GET /passage-authoring/[jobId] : items 를 최상위 평면, 사유를 `error` 로
//     · ai-jobs 요약/구형 래핑        : 결과가 `result.items`, 사유가 `errorMessage`
//     한쪽만 읽으면 run.items 가 영원히 [] 로 고정된다 → 크레딧은 나가고 산출물 0편.
//  ② readRequestSnapshot 이 spec 없는 반쪽 스냅샷을 **null 로 버리는가**.
//     기본값(DEFAULT_AUTHORING_SPEC)으로 채우면 "고2·165단어"라는 가짜 헤더 밑에서
//     목표 대비 %·offTarget 경고·재실행 금액이 전부 거짓으로 계산된다.
//  ③ creditNoticeFor 가 한 밴드에 과금 문장을 **하나만** 내는가.
//     환불 확인 표식이 붙은 실행에서 "돌려드려요"와 "확인이 필요해요"가 동시에 뜬
//     실사고가 있었다.
//
// 러너: 대상이 TS + "@/" 별칭이라 tsx 하위 프로세스로 돌린다(worksheet-study-
// compile.test.mjs 와 같은 방식). 이 저장소의 .ts 는 CJS 로 트랜스파일되므로
// 네임드 import 가 아니라 default import + 구조분해를 쓴다.
// ============================================================================

const harnessSource = `
import ioMod from "@/app/(director)/director/workbench/generate/intake/authoring/authoring-store-io";
import schemaMod from "@/lib/passage-authoring/schema";
import glossaryMod from "@/lib/wording/passage-authoring-glossary";

const {
  normalizeJobRow,
  readRequestSnapshot,
  creditNoticeFor,
  mapJobStatus,
  isTerminalRunStatus,
  AUTHORING_DELIVERY_UNKNOWN_MESSAGE,
} = ioMod as any;
const { REFUND_CHECK_MARK } = schemaMod as any;
const { AUTHORING_COPY } = glossaryMod as any;
const CREDIT = AUTHORING_COPY.CREDIT;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

// ── 픽스처 ────────────────────────────────────────────────────────────────
const ITEMS = [
  { index: 0, status: "OK", title: "t1", text: "body one" },
  { index: 1, status: "FAILED", error: "모델이 응답하지 않았어요." },
];
const PREV = {
  items: [{ index: 0, status: "OK", title: "t1", text: "body one" }],
  successCount: 1,
  failedCount: 0,
  requestedCount: 6,
  title: "AI 지문 생성",
};
const FULL_SPEC = {
  gradeBand: "HIGH_2",
  lexical: "STANDARD",
  syntax: "STANDARD",
  targetWords: 165,
  genre: "AUTO",
  skeleton: "AUTO",
  examTrack: "CSAT_STYLE",
  targetQuestionTypes: [],
  topicField: "AUTO",
};

// ── ① 잡 응답 두 모양 ─────────────────────────────────────────────────────
// 평면형(GET [jobId] 슬림 투영): items 최상위 + error
const flat = normalizeJobRow(
  {
    status: "PARTIAL",
    items: ITEMS,
    error: "일부 편을 만들지 못했어요.",
    title: "AI 지문 생성",
    requestedCount: 6,
    successCount: 1,
    failedCount: 1,
  },
  PREV,
);
// 중첩형(요약·구형 래핑): result.items + errorMessage
const nested = normalizeJobRow(
  {
    status: "PARTIAL",
    result: { items: ITEMS },
    errorMessage: "일부 편을 만들지 못했어요.",
    title: "AI 지문 생성",
    requestedCount: 6,
    successCount: 1,
    failedCount: 1,
  },
  PREV,
);

check("평면형: items 를 최상위에서 읽는다", flat.patch.items.length === 2);
check("중첩형: result.items 를 읽는다", nested.patch.items.length === 2);
check("평면형: error 키를 실패 사유로 읽는다", flat.patch.error === "일부 편을 만들지 못했어요.");
check("중첩형: errorMessage 키를 실패 사유로 읽는다", nested.patch.error === "일부 편을 만들지 못했어요.");
// 두 모양이 **같은 패치**를 만들어야 한다 — 이게 계약의 본체다.
check(
  "두 응답 모양이 동일한 패치를 만든다",
  JSON.stringify(flat.patch) === JSON.stringify(nested.patch),
);
check("본문이 실제로 도달한다(빈 배열 고정 회귀)", flat.patch.items[0].text === "body one");

// 한쪽 키만 읽는 회귀를 개별로도 잠근다(둘 중 하나를 지워도 각각 실패한다)
const onlyNestedItems = normalizeJobRow({ status: "COMPLETED", result: { items: ITEMS } }, PREV);
check("items 없이 result.items 만 있어도 읽힌다", onlyNestedItems.patch.items.length === 2);
const onlyFlatError = normalizeJobRow({ status: "FAILED", error: "터졌어요" }, PREV);
check("errorMessage 없이 error 만 있어도 읽힌다", onlyFlatError.patch.error === "터졌어요");
const onlyNestedError = normalizeJobRow({ status: "FAILED", errorMessage: "터졌어요" }, PREV);
check("error 없이 errorMessage 만 있어도 읽힌다", onlyNestedError.patch.error === "터졌어요");

// 빠진 필드는 prev 로 메운다 — 폴 한 번이 진행 카드를 비우면 안 된다.
const partialPoll = normalizeJobRow({ status: "PROCESSING" }, PREV);
check("items 키가 없으면 직전 값 유지", partialPoll.patch.items.length === 1);
check("requestedCount 0 이면 직전 값 유지", partialPoll.patch.requestedCount === 6);
check("미지의 status 는 RUNNING", partialPoll.status === "RUNNING");
check("PENDING 도 RUNNING", mapJobStatus("PENDING") === "RUNNING");
check("CANCELLED 는 FAILED 로 접는다", mapJobStatus("CANCELLED") === "FAILED");
check("터미널 판정: COMPLETED/PARTIAL/FAILED", isTerminalRunStatus("COMPLETED") && isTerminalRunStatus("PARTIAL") && isTerminalRunStatus("FAILED"));
check("터미널 판정: RUNNING 은 아니다", !isTerminalRunStatus("RUNNING"));

// 서버 카운터가 뒤처져도 진행률이 후퇴하지 않는다(실제 결과 배열과 max).
const laggingCounter = normalizeJobRow(
  { status: "PROCESSING", items: ITEMS, successCount: 0, failedCount: 0 },
  PREV,
);
check("successCount = max(서버 카운터, 실제 OK 수)", laggingCounter.patch.successCount === 1);
check("failedCount = max(서버 카운터, 실제 실패 수)", laggingCounter.patch.failedCount === 1);

// 빈 문자열 사유는 키 자체를 넣지 않는다(직전 사유를 빈 값으로 덮지 않는다).
const noError = normalizeJobRow({ status: "PROCESSING", items: ITEMS, error: "" }, PREV);
check("빈 error 는 패치에 넣지 않는다", !("error" in noError.patch));
check("빈 title 은 패치에 넣지 않는다", !("title" in noError.patch));

// ── ② 반쪽 스냅샷은 null 로 버린다 ────────────────────────────────────────
check("스냅샷 자체가 없으면 null", readRequestSnapshot({ status: "COMPLETED" }) === null);
check(
  "spec 없는 반쪽 스냅샷은 null (기본값으로 채우지 않는다)",
  readRequestSnapshot({ request: { instruction: "쉽게 써주세요", count: 6 } }) === null,
);
check(
  "빈 객체 spec 은 spec 이 아니다(zod 기본값 유입 차단)",
  readRequestSnapshot({ request: { spec: {} } }) === null,
);
check(
  "gradeBand 만 있는 spec 은 null (targetWords 도 있어야 한다)",
  readRequestSnapshot({ request: { spec: { gradeBand: "HIGH_2" } } }) === null,
);
check(
  "targetWords 만 있는 spec 은 null",
  readRequestSnapshot({ request: { spec: { targetWords: 165 } } }) === null,
);
check(
  "targetWords 가 문자열이면 null (형 위조 차단)",
  readRequestSnapshot({ request: { spec: { gradeBand: "HIGH_2", targetWords: "165" } } }) === null,
);

const goodSnapshot = readRequestSnapshot({
  request: {
    spec: FULL_SPEC,
    instruction: "쉽게 써주세요",
    count: 6,
    skeletons: ["S1", "S10", 7],
    materials: [{ id: "m1", name: "a.pdf" }, { name: "이름만" }],
  },
});
check("정상 스냅샷은 읽힌다", !!goodSnapshot && goodSnapshot.spec.targetWords === 165);
check("instruction 복원", goodSnapshot.instruction === "쉽게 써주세요");
check("count 복원", goodSnapshot.count === 6);
check("skeletons 는 문자열만 남긴다", JSON.stringify(goodSnapshot.skeletons) === JSON.stringify(["S1", "S10"]));
check("materials 는 id 있는 것만 남긴다", goodSnapshot.materials.length === 1);

const nestedSnapshot = readRequestSnapshot({ result: { request: { spec: FULL_SPEC, count: 3 } } });
check("중첩(result.request) 스냅샷도 읽는다", !!nestedSnapshot && nestedSnapshot.count === 3);
check("빈 skeletons 배열은 null(=모름)", nestedSnapshot.skeletons === null);

// normalizeJobRow 경유 — 반쪽 스냅샷은 spec 키 자체를 패치에 넣지 않아야 한다.
const halfRow = normalizeJobRow(
  { status: "COMPLETED", items: ITEMS, request: { instruction: "덮어쓰기 시도" } },
  PREV,
);
check("반쪽 스냅샷은 spec 키를 패치에 넣지 않는다", !("spec" in halfRow.patch));
check("반쪽 스냅샷은 instruction 도 덮지 않는다", !("instruction" in halfRow.patch));

const fullRow = normalizeJobRow(
  {
    status: "COMPLETED",
    items: ITEMS,
    result: { request: { spec: FULL_SPEC, instruction: "쉽게", count: 4, skeletons: ["S1"] } },
  },
  PREV,
);
check("정상 스냅샷은 spec 을 덮는다", fullRow.patch.spec.gradeBand === "HIGH_2");
check("스냅샷 count 가 requestedCount 의 정본", fullRow.patch.requestedCount === 4);
check("스냅샷 skeletons 복원", JSON.stringify(fullRow.patch.skeletons) === JSON.stringify(["S1"]));

// ── ③ 과금 문구는 한 밴드에 하나 ──────────────────────────────────────────
function noticeOf(run: Record<string, unknown>) {
  return creditNoticeFor({
    jobId: null,
    localId: "l1",
    status: "FAILED",
    requestedCount: 6,
    successCount: 0,
    failedCount: 0,
    startedAt: 0,
    title: "AI 지문 생성",
    items: [],
    spec: null,
    instruction: "",
    materials: null,
    ...run,
  } as any);
}

// 환불 확인 표식 = 크레딧이 실제로 안 돌아갔을 수 있는 상태. 이때 "돌려드려요"가
// 함께 뜨면 사용자는 정산이 끝난 줄 안다(실사고).
const markNotice = noticeOf({
  status: "PARTIAL",
  jobId: "job-1",
  failedCount: 2,
  error: "일부 편 실패 " + REFUND_CHECK_MARK,
});
check("표식 있으면 refundCheck 한 문장", markNotice === CREDIT.refundCheck);
const phrasesInMark = ["돌려드려요", "확인이 필요해요"].filter((p) => String(markNotice).includes(p));
check("표식 밴드에 과금 문장은 정확히 1개", phrasesInMark.length === 1 && phrasesInMark[0] === "확인이 필요해요");
check("표식 밴드에 refundAuto 문면 미포함", !String(markNotice).includes(CREDIT.refundAuto));
check("표식 밴드에 notCharged 문면 미포함", !String(markNotice).includes(CREDIT.notCharged));
// jobId 가 없어도(=전송 확인 실패 경로) 표식이 우선이어야 한다.
const markNoJob = noticeOf({ status: "FAILED", jobId: null, failedCount: 6, error: REFUND_CHECK_MARK });
check("표식은 jobId 유무보다 우선", markNoJob === CREDIT.refundCheck);

check("정상 완료(실패 0편)는 아무 말도 하지 않는다", noticeOf({ status: "COMPLETED", jobId: "job-1", successCount: 6 }) === null);
check("진행 중에도 아무 말도 하지 않는다", noticeOf({ status: "RUNNING", jobId: "job-1" }) === null);
check(
  "jobId 있는 실패 = 자동 환불",
  noticeOf({ status: "FAILED", jobId: "job-1", failedCount: 6, error: "모델 오류" }) === CREDIT.refundAuto,
);
check(
  "부분 실패도 자동 환불",
  noticeOf({ status: "PARTIAL", jobId: "job-1", successCount: 4, failedCount: 2 }) === CREDIT.refundAuto,
);
check(
  "완료지만 실패 편이 섞이면 자동 환불",
  noticeOf({ status: "COMPLETED", jobId: "job-1", successCount: 5, failedCount: 1 }) === CREDIT.refundAuto,
);
check(
  "전송 확인 실패는 아무 주장도 하지 않는다(이중 과금 방지)",
  noticeOf({ status: "FAILED", jobId: null, failedCount: 6, error: AUTHORING_DELIVERY_UNKNOWN_MESSAGE }) === null,
);
check(
  "jobId 없는 그 외 실패(402·400) = 차감 없음",
  noticeOf({ status: "FAILED", jobId: null, failedCount: 6, error: "크레딧이 부족합니다. (보유 0 · 필요 12)" }) === CREDIT.notCharged,
);

// 세 문장은 서로 겹치지 않아야 한다 — 겹치면 "한 문장만" 판정이 무의미해진다.
check(
  "refundAuto·notCharged·refundCheck 문면이 서로 포함관계가 아니다",
  !CREDIT.refundAuto.includes(CREDIT.refundCheck) &&
    !CREDIT.refundCheck.includes(CREDIT.refundAuto) &&
    !CREDIT.notCharged.includes(CREDIT.refundCheck),
);

console.log(JSON.stringify({ passed, failures }));
`;

test("passage-authoring store I/O contract", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-passage-authoring");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".store-io-harness.mts");
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
  assert.ok(result.passed > 40, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
