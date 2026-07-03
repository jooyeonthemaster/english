import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// korean/text 코어는 TS + `@/...` 앨리어스 → tsx 하니스로 실행해 JSON 요약을 뽑는다
// (question-set-leakage.test.mjs 하니스 패턴 미러).
const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import koText from "@/lib/korean/text";
const {
  normalizeKoText, containsHangul, countKoEojeol, countKoChars, koEojeols,
  koStemCandidates, koContentTokens, koTokenSetOverlap, koLongestSharedRun,
  koCharBigramSimilarity, findKoExpressionInPassage, splitKoSentences,
  KO_CIRCLED_JAMO, getCircledJamo, CIRCLED_DIGITS, getCircledDigit,
  CIRCLED_LATIN_LOWER, getCircledLatin, KO_MARKER_REGEX_SOURCE,
  stripKoMarkers, isKoMarkerChar,
} = koText;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
function spansExact(source, result) {
  return result.sentences.every(function (s) {
    return source.slice(s.start, s.end) === s.text;
  });
}

// ── normalizeKoText / containsHangul / 계수 ──
check("containsHangul true", containsHangul("한글 텍스트") === true);
check("containsHangul false", containsHangul("abc 123!") === false);
check(
  "normalize collapses spaces + strips control chars",
  normalizeKoText("안녕\\u0000하세요   세계") === "안녕하세요 세계",
);
check("normalize applies NFC", normalizeKoText("\\u1112\\u1161\\u11AB") === "한");
check(
  "normalize preserves line breaks on option",
  normalizeKoText("첫 줄  \\n둘째  줄", { preserveLineBreaks: true }) === "첫 줄\\n둘째 줄",
);
check("countKoEojeol excludes marker-only tokens", countKoEojeol("㉠ 사과는 ① 달다") === 2);
check("countKoEojeol basic", countKoEojeol("나는 밥을 먹었다.") === 3);
check(
  "koEojeols strips markers/quotes/punctuation",
  JSON.stringify(koEojeols("㉠그는 '학교'에 갔다!")) === JSON.stringify(["그는", "학교에", "갔다"]),
);
check("countKoChars hangul only", countKoChars("사과, 배!") === 3);
check(
  "countKoChars latin/digit option",
  countKoChars("사과 A1", { includeLatinAndDigits: true }) === 4,
);

// ── 스템 후보 ──
check("josa strip", koStemCandidates("존엄성은").includes("존엄성"));
check("복합조사 반복 스트립 (에서는)", koStemCandidates("학교에서는").includes("학교"));
const nun = koStemCandidates("눈이");
check("1음절 과절단 방어: 원형 유지", nun.includes("눈이") && nun.includes("눈") && nun[0] === "눈이");
check("1음절 스템의 대표는 원형", koContentTokens("눈이 온다")[0] === "눈이");
const ate = koStemCandidates("먹었다");
const eats = koStemCandidates("먹는다");
check("용언 어미: 공통 접두 후보 존재", ate.some(function (c) { return eats.includes(c); }));

// ── 내용어 토큰 ──
const contentA = koContentTokens("그리고 인간의 존엄성은 소중하다");
check("접속부사 제외", !contentA.includes("그리고"));
check("조사 스트립된 대표 스템", contentA.includes("인간"));
check("형식명사 단독(수) 제외", koContentTokens("침해될 수 없다").length === 2);
check("숫자·단위 단독 제외", koContentTokens("사과 3개 그리고 배").length === 2);

// ── 겹침 신호 ──
check(
  "overlap: 조사 변형 허용 (은/이, 다/다는)",
  koTokenSetOverlap("존엄성은 소중하다", "존엄성이 소중하다는") >= 0.99,
);
check("overlap: 무관 쌍은 0", koTokenSetOverlap("인간의 존엄성", "고래가 헤엄친다") === 0);
check(
  "LEAK: 조사만 바꾼 정답이 지문에 존재 → run 高",
  koLongestSharedRun(
    "인간의 존엄성은 침해될 수 없다",
    "우리 헌법은 인간의 존엄성이 침해될 수 없다는 원칙을 천명하고 있다.",
  ) >= 4,
);
check(
  "비누수 대조군: 주제만 같고 표현 다름 → run 낮음",
  koLongestSharedRun(
    "인간의 존엄성은 침해될 수 없다",
    "생태계 보전은 미래 세대를 위한 우리 모두의 책임이다.",
  ) <= 1,
);
check("bigram 자기유사 1.0", koCharBigramSimilarity("존엄성과 인권", "존엄성과 인권") === 1);
check(
  "bigram 대칭성",
  Math.abs(
    koCharBigramSimilarity("인간의 존엄성", "존엄성의 침해") -
    koCharBigramSimilarity("존엄성의 침해", "인간의 존엄성"),
  ) < 1e-12,
);
check("bigram 무관 쌍 0", koCharBigramSimilarity("사과나무", "컴퓨터공학") === 0);

// ── 지문 내 표현 탐색 ──
const found1 = findKoExpressionInPassage("학교에", "그는 학교에 갔다");
check(
  "find: 원문 오프셋 정확",
  found1 !== null && found1.start === 3 && found1.end === 6 &&
    "그는 학교에 갔다".slice(found1.start, found1.end) === "학교에",
);
const wsPassage = "인간의  존엄성이 크다";
const found2 = findKoExpressionInPassage("인간의 존엄성이", wsPassage);
check(
  "find: 공백 정규화 허용 매칭 + 원문 좌표 역매핑",
  found2 !== null && found2.start === 0 &&
    wsPassage.slice(found2.start, found2.end) === "인간의  존엄성이",
);
const found3 = findKoExpressionInPassage("사과", "사과 배 사과", 1);
check("find: occurrenceIndex 로 n번째 출현", found3 !== null && found3.start === 5 && found3.end === 7);
check("find: 부재 시 null", findKoExpressionInPassage("포도", "사과와 배") === null);

// ── 문장 분리 (prose) ──
const proseSrc1 = "봄이 왔다. 꽃이 핀다.";
const prose1 = splitKoSentences(proseSrc1);
check(
  "prose: 기본 2문장 + 오프셋 보존",
  prose1.sentences.length === 2 && prose1.sentences[0].text === "봄이 왔다." &&
    spansExact(proseSrc1, prose1),
);
check(
  "prose: 인용 연결 라고 병합",
  splitKoSentences('그는 "밥 먹었니?"라고 물었다.').sentences.length === 1,
);
const quoteBoundary = splitKoSentences('"끝났다." 그는 떠났다.');
check(
  "prose: 닫는 따옴표는 앞 문장에 + 뒤는 새 문장",
  quoteBoundary.sentences.length === 2 && quoteBoundary.sentences[0].text === '"끝났다."',
);
check(
  "prose: 인용 연결 고 병합",
  splitKoSentences('그는 "끝났다."고 말했다.').sentences.length === 1,
);
const decimal = splitKoSentences("원주율은 3.14이다. 이것은 상수다.");
check(
  "prose: 소수점 비분리",
  decimal.sentences.length === 2 && decimal.sentences[0].text.includes("3.14"),
);
check("prose: 항목 번호 비분리", splitKoSentences("1. 서론 2. 본론").sentences.length === 1);
check("prose: 영문 약어 비분리", splitKoSentences("Dr. Kim은 의사다.").sentences.length === 1);
check("prose: 말줄임표 휴지 비분리", splitKoSentences("그건... 아마 아닐 거야.").sentences.length === 1);
check(
  "prose: 종결어미+말줄임표는 경계",
  splitKoSentences("모두 끝났다… 새벽이 밝아 왔다.").sentences.length === 2,
);
check("prose: 물음/느낌 분리", splitKoSentences("정말인가? 그렇다!").sentences.length === 2);
const noPunct = splitKoSentences("마지막 문장에는 마침표가 없다");
check(
  "prose: 부호 없는 마지막 조각 수용",
  noPunct.sentences.length === 1 && noPunct.sentences[0].text === "마지막 문장에는 마침표가 없다",
);
const hintSrc = "아이들이 밥을 먹는다\\n학교 종이 울린다";
const hintSplit = splitKoSentences(hintSrc);
check(
  "prose: 종결어미 힌트+줄바꿈 경계",
  hintSplit.sentences.length === 2 && spansExact(hintSrc, hintSplit),
);
const wrapSrc = "그는 어제 서울에서\\n친구를 만났다.";
const wrapSplit = splitKoSentences(wrapSrc);
check(
  "prose: 단순 개행(wrap)은 비분리",
  wrapSplit.sentences.length === 1 && spansExact(wrapSrc, wrapSplit),
);

// ── 문장 분리 (verse) ──
const verseSrc = "산에는 꽃 피네\\n꽃이 피네\\n갈 봄 여름 없이";
const verse = splitKoSentences(verseSrc, { mode: "verse" });
check(
  "verse: 3행 → 3단위 + 오프셋 재추출 일치",
  verse.sentences.length === 3 && verse.sentences[1].text === "꽃이 피네" &&
    spansExact(verseSrc, verse),
);
check(
  "verse: 빈 행 스킵",
  splitKoSentences("첫 행\\n\\n둘째 행", { mode: "verse" }).sentences.length === 2,
);

// ── 마커 ──
check("㉠ 코드포인트 U+3260", KO_CIRCLED_JAMO.codePointAt(0) === 0x3260);
check(
  "원문자 자모 14자 · 끝 ㉭ U+326D",
  KO_CIRCLED_JAMO.length === 14 && KO_CIRCLED_JAMO.codePointAt(13) === 0x326d,
);
check(
  "getCircled* 인덱스 접근",
  getCircledJamo(1) === "㉡" && getCircledDigit(0) === "①" && getCircledLatin(0) === "ⓐ",
);
check(
  "① U+2460 · ⓐ~ⓩ 26자",
  CIRCLED_DIGITS.codePointAt(0) === 0x2460 &&
    CIRCLED_LATIN_LOWER.length === 26 && CIRCLED_LATIN_LOWER.codePointAt(25) === 0x24e9,
);
check("stripKoMarkers", stripKoMarkers("㉠사과①배ⓐ감㈀끝") === "사과배감끝");
check(
  "isKoMarkerChar",
  isKoMarkerChar("㉠") && isKoMarkerChar("①") && isKoMarkerChar("ⓐ") && !isKoMarkerChar("가"),
);
const markerRegex = new RegExp(KO_MARKER_REGEX_SOURCE);
check("KO_MARKER_REGEX_SOURCE 는 ㉮류까지 커버", markerRegex.test("㉮") && !markerRegex.test("한"));

// ── 작은따옴표 인용 추출 (순차 짝짓기) ──
// 1자 인용('이', 'ㅣ' 등 문법·국어사 관행)이 짝으로 소비되지 않으면 닫는따옴표가
// 다음 여는따옴표와 오짝지어져 사이 평문이 인용으로 오검출된다(KO_GR_HIST 실측).
import koCore from "@/lib/korean/core/ko-text";
const { extractQuotedSpansKo } = koCore;
check(
  "인용 추출: 기본 2건",
  JSON.stringify(extractQuotedSpansKo("'서리다'와 '어리다'를 비교한다")) ===
    JSON.stringify(["서리다", "어리다"]),
);
const singleCharPairs = extractQuotedSpansKo("'ㅣ'에 주격 조사, '를'에 목적격 조사가 온다");
check(
  "인용 추출: 1자 인용이 짝으로 소비되어 사이 평문 오검출 없음",
  !singleCharPairs.some(function (q) { return q.includes("주격 조사"); }) &&
    !singleCharPairs.some(function (q) { return q.includes("목적격") }),
);
check(
  "인용 추출: 1자+다자 혼재 시 다자 인용은 정상 추출",
  JSON.stringify(extractQuotedSpansKo("'이' 뒤의 '중세 국어' 표기")) ===
    JSON.stringify(["중세 국어"]),
);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-text-core-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Run through a shell so Windows resolves `npx` (only exists as npx.cmd);
    // execSync takes a single quoted command string (no DEP0190 args warning).
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

test("korean text core: all cases pass", () => {
  assert.equal(
    summary.failed,
    0,
    `korean-text-core failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 30, `expected ≥30 checks, got ${summary.passed}`);
});
