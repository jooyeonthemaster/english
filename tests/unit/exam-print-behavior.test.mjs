// 시험지 인쇄 파이프라인 — 동작 게이트를 `npm run test:unit` 안으로 들인다(26-09-30, docs/EXAM-PRINT-PIPELINE.md §5).
//
// 왜 이 파일이 존재하는가: 계약 테스트(exam-print-pipeline-contract.test.mjs)는 소스 모양만 본다. 인쇄 잡 상태기계 ·
// 준비 판정 · 원격 측정 메타 검증 · 미리보기 데이터 캐시의 **동작**(가드 수렴 전 인쇄 금지, 안 그려진 쪽 차단, 글꼴은
// 시험지 면만 기다림, 고칠 수 없는 넘침 보고, 썸네일 · 인쇄 우선순위)은 이 게이트가 가짜 DOM · 가짜 시계로 실제로 돌려 본다.
// 26-09-30 Wave 2: 훅(usePrintPortal · useExamPrintController)도 **진짜 React**(react-dom/client, 가짜 문서/창 —
// exam-print/react-hook-env.mjs)로 돌린다 — 인쇄 중 언마운트 원복 · 남은 호스트 자가 치유 · 두 인스턴스 규칙(R7), 준비 중
// 네이티브 인쇄 넘겨받기(R5), 비차단 print 정리 시점 · needs-gesture · StrictMode autoStart 1회, 잡 시작 치우기 · 라벨(R7 · R8).
// 26-09-30 Wave 4(PRINT-RESPONSE): 진입점 누름 무장(click 전 「준비 중」 · 호스트 재렌더 0 · 버튼 비차단 · 타이머 없는 해제 ·
// autoStart 무장 프레임) — print-arming.gate.mjs.
// 모듈이 TS 라 tsx 로 띄운다(tests/unit/analytics-classify.test.mjs 와 같은 리포 관례, tsx 는 devDependencies).
//
// 음성테스트: EXAM_PRINT_SRC_ROOT 로 결함을 심은 저장소 사본을 가리키면 해당 케이스가 RED 가 된다(저장소는 무수정).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const GATES = [
  "tests/unit/exam-print/exam-print-job.gate.mjs",
  "tests/unit/exam-print/exam-preview-cache.gate.mjs",
  "tests/unit/exam-print/print-job-hardening.gate.mjs",
  "tests/unit/exam-print/print-portal.gate.mjs",
  "tests/unit/exam-print/print-controller.gate.mjs",
  "tests/unit/exam-print/print-arming.gate.mjs",
];
/** 케이스 수 하한 — 케이스를 지워 게이트를 공허하게 만드는 것을 막는다(26-09-30 실측 20 + 5 + 5 + 10 + 7 + 누름 무장 10). */
const MIN_CASES = 59;

test("시험지 인쇄 동작 게이트(잡 · 준비 판정 · 메타 · 미리보기 캐시 · 포털 훅 · 컨트롤러 훅)가 전건 통과한다", () => {
  for (const gate of GATES) assert.ok(existsSync(path.join(process.cwd(), gate)), `게이트가 없다: ${gate}`);
  // 바깥 test runner 가 심는 NODE_TEST_CONTEXT 를 지운다 — 남기면 자식이 TAP 대신 내부 직렬화 형식으로 보고한다.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  let out = "";
  try {
    out = execFileSync(process.execPath, ["--import=tsx", "--test", "--test-reporter=tap", ...GATES], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120_000,
      env,
    });
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const failed = text.split("\n").filter((line) => /^\s*not ok /.test(line));
    assert.fail(`인쇄 동작 게이트 실패(exit ${err.status ?? "spawn"}):\n${failed.join("\n")}\n${text.slice(-4000)}`);
  }
  const pass = Number(out.match(/^# pass (\d+)/m)?.[1] ?? NaN);
  const fail = Number(out.match(/^# fail (\d+)/m)?.[1] ?? NaN);
  assert.ok(Number.isFinite(pass) && Number.isFinite(fail), `TAP 요약을 찾지 못했다:\n${out.slice(-2000)}`);
  assert.equal(fail, 0, out);
  assert.ok(pass >= MIN_CASES, `케이스 ${pass}건(하한 ${MIN_CASES}) — 게이트 공허화`);
});
