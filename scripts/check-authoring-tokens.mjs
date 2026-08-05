#!/usr/bin/env node
// ============================================================================
// 조판대(Composing Desk) 토큰 게이트 — 워크벤치 "AI로 지문 만들기" 전용 CI 검사
//
// 왜 필요한가:
//   "5종 타이포 / 6단 간격 / 3종 버튼 높이(h-9 md · h-7 sm · min-h-12 hero) /
//   불투명 색만" 은 강제 수단이 없으면 규칙이 아니라 권고다. 이 기능은 한 번
//   정리됐다가 폰트 10종 118회·간격 48% 오프그리드로 되돌아온 전력이 있고,
//   globals.css 의 SMOAT/yshin 토큰은 이 디렉터리에서 사용 0건이다. 게이트가
//   없으면 6개월 뒤 같은 자리로 온다.
//   ⚠️ 이 중 **버튼 높이는 아래 게이트 5종이 프로그램적으로 강제하지 않는다**
//   (게이트 1은 text-[Npx] 만 본다). 높이의 정본은 authoring-tokens.ts 의
//   BTN_MD/BTN_SM/BTN_HERO 와 그 회귀 방지 계약이고, 여기 산문은 그 요약일 뿐이다
//   — 값이 바뀌면 이 줄도 같이 고친다.
//
// 검사 대상 (⚠️ 최초 계획의 intake/**/*.tsx 에서 좁혔다 — 근거는 아래):
//   ① src/app/(director)/director/workbench/generate/intake/authoring/**/*.tsx
//   ② ENROLLED_FILES 에 이름으로 등록된 intake/ 직속 파일
//   (스타일 진실원인 authoring-tokens.ts 는 .ts 라 애초에 대상이 아니지만,
//    게이트 1은 파일명 기준 예외도 명시적으로 둔다 — 글로브가 넓어져도 안전하게.)
//
// 왜 intake/** 전체가 아닌가:
//   intake/ 디렉터리에는 성격이 다른 **두 기능**이 산다.
//     · "AI로 지문 만들기"(조판대)  → authoring/** + 진입 스위치. 설계 바이블이
//       레이아웃·토큰·문구를 전부 규정한다.
//     · "이미지·PDF에서 지문 추출"(크롭·AI 원문 복원) → generate-upload-panel.tsx,
//       extraction-*.tsx, restore-intro-dialog.tsx, intake-surface.tsx 의 탭·
//       플레이스홀더, multi-passage-paste.tsx 의 국어 고정 컨트롤. 이번 개편이
//       손대지 않았고, 설계 바이블이 규정하지 않으며, 문구도 조판대 사전
//       (passage-authoring-glossary.ts)의 소유가 아니다.
//   글로브를 intake/** 로 두면 후자에서 141건이 잡혀 게이트가 **영구 적색**이 된다.
//   항상 실패하는 게이트는 게이트가 아니라 소음이고, 곧 CI 에서 빠진다 — 이
//   파일이 막으려던 바로 그 결말이다. 추출 기능을 조판대 토큰으로 옮기는 것은
//   그 기능의 리디자인이 결정된 뒤에 할 일이고, 그때 이 목록에 등록하면 된다.
//   ※ 새로 만드는 파일은 authoring/ 안에 두면 자동으로 게이트 대상이 된다.
//
// 게이트 5종 (위반 1건이라도 있으면 exit 1)
//   1) text-[Npx] 원시 리터럴  → authoring-tokens.ts 안에서만 허용
//   2) className 안 .5 스텝 간격 유틸리티(px-2.5 / gap-1.5 / mt-0.5 / py-0.5 …)
//      ※ size-3.5(아이콘 14px), w-0.5 / h-0.5(2px 액센트 바)는 설계 바이블이
//        명시적으로 요구하는 값이라 예외다. 금지 대상은 '간격'이지 '선·아이콘'이
//        아니다 — 선은 간격 그리드의 대상이 아니라는 §1 명시 예외와 같은 취지.
//   3) 배경 알파 표기(bg-blue-50/40 류) — 흰 배경 합성 시 채움 기여가 0이다
//   4) amber / orange / violet — page-frame.tsx:9, v3 §D1 R5 금지색
//   5) JSX 텍스트 노드의 한글 리터럴 — 문구는 passage-authoring-glossary.ts 경유
//
// 사용법:
//   node scripts/check-authoring-tokens.mjs           # 위반 시 exit 1
//   node scripts/check-authoring-tokens.mjs --warn    # 보고만 하고 exit 0
//   node scripts/check-authoring-tokens.mjs --dir=<경로>
//
//   개편(STEP 11~19)이 착지해 위반 0건이 됐으므로 `npm run lint:authoring-tokens`
//   로 노출하고 .github/workflows/ci.yml 에 **차단 스텝**으로 물렸다.
//   ⚠️ `npm run lint`(eslint) 에 체이닝하지 않는다 — 그 스텝은 리포 관례상
//   continue-on-error 라, 거기 얹으면 이 게이트까지 비차단이 되어 게이트가
//   아니게 된다. --warn 은 국소 실험용 escape hatch 일 뿐 CI 경로에서 쓰지 않는다.
//
// 구현 메모:
//   주석은 검사 전에 공백으로 지운다(줄 수·인덱스는 보존). 다만 "줄 첫머리에서
//   시작하는" // 주석과 /* */ 블록만 지운다 — 문자열 안의 URL(//)이나 정규식
//   리터럴(/.../)을 주석으로 오인해 게이트를 조용히 무력화하는 쪽이, 뒤따르는
//   주석을 못 지워 오탐이 한 건 나는 쪽보다 훨씬 나쁘기 때문이다.
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const INTAKE_DIR = join(
  REPO_ROOT,
  "src",
  "app",
  "(director)",
  "director",
  "workbench",
  "generate",
  "intake",
);
/** 조판대 표면 본체 — 이 아래 .tsx 는 전부 무조건 검사한다. */
const DEFAULT_TARGET_DIR = join(INTAKE_DIR, "authoring");

/**
 * intake/ 직속인데도 조판대 표면인 파일 — 이름으로 하나씩 등록한다.
 * 목록을 늘릴 때는 "설계 바이블이 이 파일의 크기·색·문구를 규정하는가"가 기준이다.
 */
const ENROLLED_FILES = ["paste-output-mode-toggle.tsx"];

/** 게이트 1 예외 — 이 디렉터리의 단일 스타일 진실원. */
const TOKEN_SOURCE_FILE = "authoring-tokens.ts";

/**
 * 게이트 2 예외 — 설계 바이블이 수치로 요구하는 .5 값.
 *  size-3.5 : 아이콘 14px (§2-6 아이콘 2단)
 *  w-0.5 / h-0.5 : 2px 액센트 바 · 포커스 바 (§1 "선은 간격이 아니다")
 */
const HALF_STEP_ALLOWED_PREFIXES = new Set(["size", "w", "h"]);

const args = process.argv.slice(2);
const WARN_ONLY = args.includes("--warn");
const dirArg = args.find((a) => a.startsWith("--dir="));
const TARGET_DIR = dirArg ? join(REPO_ROOT, dirArg.slice("--dir=".length)) : DEFAULT_TARGET_DIR;

// ── 파일 수집 ───────────────────────────────────────────────────────────────

function collectTsxFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      out.push(...collectTsxFiles(full));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// ── 주석 제거(길이·줄 보존) ─────────────────────────────────────────────────

function blankComments(source) {
  // split("") 은 UTF-16 코드 유닛 단위다. [...source] 는 코드 포인트 단위라
  // 이모지(📎 같은 astral 문자)가 하나라도 있으면 인덱스가 어긋나 주석이
  // 엉뚱한 자리에서 지워진다 — 게이트가 조용히 무력화되는 종류의 버그다.
  const chars = source.split("");
  const lines = source.split("\n");
  let offset = 0;
  let inBlock = false;

  for (const line of lines) {
    const trimmedStart = line.length - line.trimStart().length;
    let i = 0;

    while (i < line.length) {
      const abs = offset + i;
      if (inBlock) {
        if (line[i] === "*" && line[i + 1] === "/") {
          chars[abs] = " ";
          chars[abs + 1] = " ";
          inBlock = false;
          i += 2;
          continue;
        }
        chars[abs] = " ";
        i += 1;
        continue;
      }
      // 줄 첫머리에서 시작하는 주석만 지운다.
      if (i === trimmedStart && line[i] === "/" && line[i + 1] === "/") {
        for (let k = i; k < line.length; k += 1) chars[offset + k] = " ";
        break;
      }
      if (i === trimmedStart && line[i] === "/" && line[i + 1] === "*") {
        chars[abs] = " ";
        chars[abs + 1] = " ";
        inBlock = true;
        i += 2;
        continue;
      }
      break; // 코드가 시작되면 이 줄은 더 볼 것이 없다.
    }
    offset += line.length + 1;
  }

  return chars.join("");
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

// ── className 구간 추출 ─────────────────────────────────────────────────────
// className="…" / className={…} 의 값 구간만 잘라 낸다. 값 밖(주석·문서 문자열·
// 다른 prop)의 .5 표기까지 잡으면 오탐으로 게이트가 무시당한다.

function extractClassNameRegions(source) {
  const regions = [];
  const re = /class[Nn]ame\s*=\s*/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    let i = m.index + m[0].length;
    const opener = source[i];
    if (opener === '"' || opener === "'" || opener === "`") {
      const start = i;
      i += 1;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === opener) break;
        i += 1;
      }
      regions.push({ start, text: source.slice(start, i + 1) });
      re.lastIndex = i + 1;
      continue;
    }
    if (opener === "{") {
      const start = i;
      let depth = 0;
      while (i < source.length) {
        const c = source[i];
        if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        i += 1;
      }
      regions.push({ start, text: source.slice(start, i + 1) });
      re.lastIndex = i + 1;
    }
  }
  return regions;
}

// ── 게이트 ──────────────────────────────────────────────────────────────────

const RE_PX_LITERAL = /text-\[[0-9.]+px\]/g;
const RE_HALF_STEP = /(^|[\s"'`{(,:[])(-?[a-z][a-z-]*(?::[a-z][a-z-]*)*)-(0|1|2|3)\.5\b/g;
const RE_BG_ALPHA = /bg-[a-z]+-[0-9]{2,3}\/[0-9]{2}/g;
const RE_BANNED_HUE = /\b(amber|orange|violet)-/g;
// JSX 텍스트 노드 = 여는 태그의 '>' 와 다음 '<' 사이. 속성 문자열은 '<' 와 '>'
// *사이*에 있으므로 이 패턴에 걸리지 않는다(의도한 범위 — 게이트 5는 화면에
// 그려지는 텍스트 노드만 본다).
// (?<![=\-!<>]) : 화살표 함수 '=>' 나 비교 연산자를 태그 닫힘으로 오인하지 않는다.
const RE_JSX_TEXT_NODE = /(?<![=\-!<>])>([^<>{}]*)</g;
// 코드 조각이 딸려 들어온 오탐 배제 — JSX 텍스트 노드에는 없는 문자들.
const RE_CODE_ARTIFACT = /[;"'`=]|\/\/|\/\*/;
const RE_HANGUL = /[가-힣]/;

/**
 * 비교 연산자 ' > ' 를 태그 닫힘으로 오인하지 않는다.
 * 태그를 닫는 '>' 는 (a) 속성 바로 뒤에 붙거나 (b) 여러 줄 태그에서 줄바꿈 뒤
 * 들여쓰기 자리에 온다. 반면 비교 연산자는 **같은 줄에서 공백 하나 뒤**에 온다.
 */
function looksLikeTagClose(source, gtIndex) {
  let j = gtIndex - 1;
  let sawWhitespace = false;
  while (j >= 0 && /\s/.test(source[j])) {
    if (source[j] === "\n") return true;
    sawWhitespace = true;
    j -= 1;
  }
  return !sawWhitespace;
}

function baseUtilityName(raw) {
  const withoutVariants = raw.split(":").pop() ?? raw;
  return withoutVariants.replace(/^-/, "");
}

function checkFile(absPath) {
  const rel = relative(REPO_ROOT, absPath).split(sep).join("/");
  const raw = readFileSync(absPath, "utf8");
  const source = blankComments(raw);
  const fileName = rel.split("/").pop() ?? rel;
  const violations = [];

  const push = (index, gate, message) => {
    violations.push({ file: rel, line: lineOf(raw, index), gate, message });
  };

  // 1) text-[Npx] 원시 리터럴
  if (fileName !== TOKEN_SOURCE_FILE) {
    for (const m of source.matchAll(RE_PX_LITERAL)) {
      push(
        m.index,
        1,
        `원시 글자 크기 '${m[0]}' — DESK.{read,title,body,meta,kicker,num} 를 쓰세요 (authoring-tokens.ts).`,
      );
    }
  }

  // 2) className 안 .5 스텝 간격 유틸리티
  for (const region of extractClassNameRegions(source)) {
    for (const m of region.text.matchAll(RE_HALF_STEP)) {
      const base = baseUtilityName(m[2]);
      if (HALF_STEP_ALLOWED_PREFIXES.has(base)) continue;
      const utility = `${m[2]}-${m[3]}.5`;
      push(
        region.start + m.index,
        2,
        `.5 스텝 간격 '${utility}' — 간격은 4/8/12/16/24/32 6단만 씁니다.`,
      );
    }
  }

  // 3) 배경 알파 표기
  for (const m of source.matchAll(RE_BG_ALPHA)) {
    push(
      m.index,
      3,
      `알파 배경 '${m[0]}' — 흰 배경 합성 시 채움 기여가 0입니다. 불투명 토큰(SEG_ON/SURFACE)을 쓰세요.`,
    );
  }

  // 4) 금지색
  for (const m of source.matchAll(RE_BANNED_HUE)) {
    push(
      m.index,
      4,
      `금지색 '${m[1]}' — 안내는 slate-600 + Info, 조치 필요는 rose-600 + AlertTriangle 입니다.`,
    );
  }

  // 5) JSX 텍스트 노드의 한글 리터럴
  for (const m of source.matchAll(RE_JSX_TEXT_NODE)) {
    const inner = m[1];
    if (!RE_HANGUL.test(inner) || RE_CODE_ARTIFACT.test(inner)) continue;
    if (!looksLikeTagClose(source, m.index)) continue;
    const text = inner.trim().replace(/\s+/g, " ");
    push(
      m.index,
      5,
      `JSX 안 한글 리터럴 '${text.length > 24 ? `${text.slice(0, 24)}…` : text}' — 문구는 passage-authoring-glossary.ts 경유입니다.`,
    );
  }

  return violations;
}

// ── 실행 ────────────────────────────────────────────────────────────────────

// --dir= 로 대상을 직접 준 실행에서는 등록 목록을 얹지 않는다(그 디렉터리만 본다).
const enrolled = dirArg
  ? []
  : ENROLLED_FILES.map((name) => join(INTAKE_DIR, name)).filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        // 등록된 파일이 사라졌다면 목록이 낡은 것이다 — 게이트를 죽이지는 않되
        // 조용히 넘기지도 않는다.
        console.warn(
          `[check-authoring-tokens] 등록 파일을 찾지 못했습니다: ${relative(REPO_ROOT, p).split(sep).join("/")}`,
        );
        return false;
      }
    });

const files = [...collectTsxFiles(TARGET_DIR), ...enrolled];
const all = files.flatMap(checkFile);

const GATE_NAMES = {
  1: "타이포 토큰(원시 px 금지)",
  2: "간격 6단(.5 스텝 금지)",
  3: "불투명 색(알파 배경 금지)",
  4: "금지색(amber/orange/violet)",
  5: "문구 사전 경유(JSX 한글 금지)",
};

if (all.length === 0) {
  console.log(
    `[check-authoring-tokens] 통과 — ${files.length}개 파일, 게이트 5종 위반 0건.`,
  );
  process.exit(0);
}

all.sort((a, b) => a.gate - b.gate || a.file.localeCompare(b.file) || a.line - b.line);

const byGate = new Map();
for (const v of all) byGate.set(v.gate, (byGate.get(v.gate) ?? 0) + 1);

for (const v of all) {
  console.log(`${v.file}:${v.line}  [게이트 ${v.gate}] ${v.message}`);
}
console.log("");
console.log(`[check-authoring-tokens] 위반 ${all.length}건 / 검사 ${files.length}개 파일`);
for (const [gate, count] of [...byGate.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  · 게이트 ${gate} ${GATE_NAMES[gate]}: ${count}건`);
}

process.exit(WARN_ONLY ? 0 : 1);
