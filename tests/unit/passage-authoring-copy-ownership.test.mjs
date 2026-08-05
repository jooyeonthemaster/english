// ============================================================================
// 조판대(AI로 지문 만들기) — 문구 소유권 계약.
//
// 왜 이 테스트가 있나:
//   scripts/check-authoring-tokens.mjs 게이트 ⑤ 는 **.tsx 의 JSX 텍스트 노드**만
//   본다. 그런데 이 기능의 화면 문구 중 상당수는 .ts 에서 태어난다 —
//   토스트(use-authoring-store · use-material-drafts), 실패 사유
//   (authoring-store-io), 자료 초안의 진행 라벨·이름(material-intake).
//   그 사각지대에서 같은 사고가 두 번 났다.
//     1차: TOAST.completed/completedPartial/failed 가 사용처 0건 사문이 되고,
//          화면에는 갈라진 사본이 떴다("다시 시도해 주세요"↔"다시 시도해주세요").
//     2차: 1차를 수리한 뒤에도 materialTooLong·materialLimitFull·
//          materialLimitPartial·materialReadFailed·materialNoText·pastedRetry
//          여섯 개가 같은 방식으로 사문이었고, 실제 화면에는 "…넣었습니다"
//          (합쇼체 — 이 사전이 NOTICE 하나에만 허용한 말투)가 떠 있었다.
//   게이트 4종(tsc·토큰·eslint·단위테스트)은 두 번 다 전부 초록이었다.
//   그래서 소스 문자열을 직접 잠근다(passage-authoring-reasoning.test.mjs 가
//   스트림 레인 exclude 를 잠그는 것과 같은 리포 관례).
//
// 잠그는 것 두 가지
//   §A 사전의 AUTHORING_COPY.TOAST.* 는 **키마다 소비처가 최소 1곳** 있어야 한다.
//      (사문 키 = 화면 어딘가에 그 문구의 손코딩 사본이 산다는 신호다.)
//   §B 조판대 소스의 toast.success/warning/error/info 첫 인자에 **한글 리터럴이
//      없어야** 한다. 문구는 반드시 식별자(AUTHORING_COPY.… 또는 변수)로 온다.
//
// ⚠️ 서버가 준 사유를 그대로 띄우는 것은 위반이 아니다 — 그건 리터럴이 아니라
//    변수이므로 §B 에 애초에 걸리지 않는다.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const GLOSSARY = path.join(
  repoRoot,
  "src",
  "lib",
  "wording",
  "passage-authoring-glossary.ts",
);
const AUTHORING_DIR = path.join(
  repoRoot,
  "src",
  "app",
  "(director)",
  "director",
  "workbench",
  "generate",
  "intake",
  "authoring",
);
/** 조판대 문구를 소비하는 intake/ 직속 파일(게이트 스크립트의 ENROLLED_FILES 와 같은 취지). */
const EXTRA_FILES = [
  path.join(AUTHORING_DIR, "..", "paste-output-mode-toggle.tsx"),
  path.join(AUTHORING_DIR, "..", "intake-surface.tsx"),
];

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSources(full));
      continue;
    }
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = [
  ...collectSources(AUTHORING_DIR),
  ...EXTRA_FILES.filter((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  }),
];

// 검사 대상이 통째로 사라지면(디렉터리 이동·이름 변경) 이 테스트가 조용히
// "위반 0건"으로 통과한다 — 그 실패 모드를 하한으로 막는다.
const MIN_SOURCE_FILES = 15;

test("조판대 사전의 TOAST 키는 전부 소비처가 있다 (사문 키 = 손코딩 사본의 신호)", () => {
  assert.ok(
    sourceFiles.length >= MIN_SOURCE_FILES,
    `조판대 소스를 ${sourceFiles.length}개밖에 찾지 못했다 — 경로 계약이 깨졌다`,
  );

  const glossary = read(GLOSSARY);
  const toastBlock = glossary.slice(glossary.indexOf("\n  TOAST: {"));
  const end = toastBlock.indexOf("\n  },");
  assert.ok(end > 0, "사전에서 TOAST 묶음을 찾지 못했다");
  const body = toastBlock.slice(0, end);

  // 최상위 키만 — 중첩 없이 `    key:` 한 층으로 적혀 있다.
  const keys = [...body.matchAll(/^ {4}([a-zA-Z][a-zA-Z0-9]*):/gm)].map(
    (m) => m[1],
  );
  assert.ok(keys.length >= 20, `TOAST 키를 ${keys.length}개만 읽었다`);

  const consumers = sourceFiles
    .filter((p) => p !== GLOSSARY)
    .map((p) => read(p))
    .join("\n");

  const dead = keys.filter((key) => !consumers.includes(`TOAST.${key}`));
  assert.deepEqual(
    dead,
    [],
    `사용처 0건인 TOAST 키: ${dead.join(", ")} — 화면에는 손코딩 사본이 살아 있을 가능성이 높다`,
  );
});

test("조판대 소스의 toast() 첫 인자에 한글 리터럴이 없다 (문구는 사전 경유)", () => {
  // toast.<level>( 바로 뒤가 따옴표/백틱으로 시작하고 그 안에 한글이 있으면 위반.
  const RE_TOAST_LITERAL =
    /toast\.(?:success|warning|error|info|message)\(\s*(["'`])((?:\\.|(?!\1)[\s\S]){0,400}?)\1/g;
  const RE_HANGUL = /[가-힣]/;
  const violations = [];

  for (const file of sourceFiles) {
    const source = read(file);
    for (const m of source.matchAll(RE_TOAST_LITERAL)) {
      if (!RE_HANGUL.test(m[2])) continue;
      const line = source.slice(0, m.index).split("\n").length;
      const rel = path.relative(repoRoot, file).split(path.sep).join("/");
      violations.push(`${rel}:${line}  ${m[2].slice(0, 40)}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `toast 에 한글 리터럴이 직접 들어갔다 — passage-authoring-glossary.ts 경유로 바꿀 것:\n${violations.join("\n")}`,
  );
});
