#!/usr/bin/env node
/**
 * `npm run test:unit` 의 실행기.
 *
 * 왜 이 파일이 존재하는가 — node 20/24 가 `--test` 인자를 정반대로 해석한다
 * ---------------------------------------------------------------------------
 * 실측(2026-08-20, 이 리포):
 *   node 24.7.0  `node --test tests/unit`                → 인자를 글롭으로 보고 디렉토리
 *                                                           자체를 엔트리 모듈로 실행하려다
 *                                                           실패, **0건 실행**
 *   node 24.7.0  `node --test "tests/unit/**|/*.test.mjs"` → tests 665 (정상)
 *   node 20.19.5 `node --test tests/unit`                → 디렉토리 순회, tests 665 (정상)
 *   node 20.19.5 `node --test "tests/unit/**|/*.test.mjs"` → `Could not find '...'`
 *                                                           → **0건 실행 + exit 1**
 *   (위 표기의 `|` 는 블록주석 종료를 피하기 위한 것이다 — 실제 인자에는 없다.)
 *
 * 즉 어느 한쪽 형태를 package.json 에 박으면 반드시 다른 한쪽(로컬 또는 CI)에서
 * 게이트가 침묵한다. `engines.node` 는 24.x 인데 `.github/workflows/ci.yml` 은
 * node 20 을 쓰므로 두 런타임이 동시에 실재한다.
 *
 * 해법: 파일 목록을 **우리가 직접 열거해** 명시적 인자로 넘긴다. 명시적 파일
 * 인자는 node 20/24 양쪽에서 동일하게 동작하고, 셸(bash/cmd.exe) 글롭 확장에도
 * 의존하지 않는다.
 *
 * ★ 감독 승인 조건 3가지 (2026-08-20) — 아래 A/B/C 로 구현돼 있다 ★
 *   (A) node 20·24 **양쪽에서 실행 건수를 출력**한다.
 *   (B) 실행 대상이 0건이면 **비영 exit**. "테스트가 없어서 GREEN" 은 금지다.
 *   (C) 실행할 수 없는 테스트 파일을 발견하면 **경고가 아니라 실패**로 보고한다.
 *
 * (C) 의 근거 — `.test.ts` 는 어느 런타임에서도 돌지 않는다
 * ---------------------------------------------------------------------------
 * node 20 에는 타입 스트리핑이 아예 없다. node 24 는 스트리핑은 하지만
 * 확장자 없는 상대 임포트를 `.ts` 로 해석하지 못해 즉시 죽는다(실측):
 *   $ node --test tests/unit/atlas-production-assignment-fetch-boundary.test.ts
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\lib\atlas-...-boundary'
 * 즉 `tests/unit/*.test.ts` 17개는 **한 번도 실행된 적이 없다.** 이전 판은 이것을
 * 경고 한 줄로 흘려보냈다 — 그 결과 "테스트가 있다"는 착시만 남고 검증은 0이었다.
 * 이제는 실패로 보고한다. 끄는 방법은 두 가지뿐이다: (1) 돌아가게 고치거나,
 * (2) 지우거나. 둘 다 하지 않는 상태를 GREEN 으로 만들 수단은 없다.
 *
 * 종료 코드
 *   0  전건 실행 + 전건 통과
 *   1  테스트 실패(테스트 러너 자체의 상태)
 *   2  실행기 고장(대상 0건 / spawn 실패)
 *   3  실행 불가 테스트 파일 발견 (테스트 자체는 통과)
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "tests", "unit");

/** 실행 가능한 테스트 확장자. 여기에 없는 `*.test.*` 는 전부 "실행 불가"로 계상한다. */
const RUNNABLE = [".test.mjs", ".test.cjs", ".test.js"];

/** tests/unit 아래를 재귀 순회해 실행 가능/불가로 분류한다. */
function collect(dir) {
  const runnable = [];
  const unrunnable = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    // parentPath 는 node 20.12+/21.4+, 그 이전은 path. 둘 다 받는다.
    const full = path.join(entry.parentPath ?? entry.path, entry.name);
    if (RUNNABLE.some((ext) => entry.name.endsWith(ext))) runnable.push(full);
    else if (/\.test\.[a-z]+$/i.test(entry.name)) unrunnable.push(full);
  }
  return { runnable: runnable.sort(), unrunnable: unrunnable.sort() };
}

const { runnable, unrunnable } = collect(DIR);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

// (A) 어느 런타임에서 몇 건을 돌리는지 **항상** 찍는다. 두 런타임의 숫자가 갈리면
//     그 자체가 이 실행기가 존재하는 이유인 함정이 재발했다는 뜻이다.
console.log(
  `[test:unit] node ${process.versions.node} (${process.platform}) · 실행 대상 ${runnable.length}건 · ` +
    `실행 불가 ${unrunnable.length}건`,
);

// (B) 0건이면 비영 exit. 침묵 스킵 금지.
if (runnable.length === 0) {
  console.error(
    `[test:unit] FAIL(2): ${rel(DIR)} 아래에서 실행 가능한 테스트를 하나도 찾지 못했다 ` +
      `(찾는 확장자: ${RUNNABLE.join(", ")}). 실행기가 고장났거나 디렉토리가 비었다.`,
  );
  process.exit(2);
}

const res = spawnSync(process.execPath, ["--test", ...runnable], { stdio: "inherit", cwd: ROOT });
if (res.error) {
  console.error("[test:unit] FAIL(2): 실행기 자체가 실패했다:", res.error);
  process.exit(2);
}
const testStatus = res.status ?? 1;

// (C) 실행 불가 파일은 실패다. 테스트 실패와 **구분 가능한** 형태로 보고한다.
if (unrunnable.length > 0) {
  console.error("");
  console.error(
    `[test:unit] FAIL(3): 실행할 수 없는 테스트 파일 ${unrunnable.length}건 — 이 파일들은 검증에 기여하지 않는다.`,
  );
  for (const f of unrunnable) console.error(`  · ${rel(f)}`);
  console.error(
    "  node 20 에는 타입 스트리핑이 없고, node 24 는 확장자 없는 상대 임포트를 .ts 로 해석하지 못한다.",
  );
  console.error("  해소 방법은 둘뿐이다: (1) .mjs 로 이식해 실제로 돌게 하거나, (2) 삭제하거나.");
}

if (testStatus !== 0) {
  console.error(`[test:unit] 요약: 테스트 실패(exit ${testStatus})` + (unrunnable.length ? ` + 실행 불가 ${unrunnable.length}건` : ""));
  process.exit(testStatus);
}
if (unrunnable.length > 0) {
  console.error("[test:unit] 요약: 테스트는 전건 통과했으나 실행 불가 파일이 남아 있다 → exit 3");
  process.exit(3);
}
console.log("[test:unit] 요약: 전건 실행 · 전건 통과");
