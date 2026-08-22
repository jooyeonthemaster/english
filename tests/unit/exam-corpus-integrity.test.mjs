/**
 * 기출 코퍼스 본문 무결성 회귀 게이트 (렌즈 H4).
 *
 * 왜 이 파일이 존재하는가
 * ----------------------
 * 2026-06-20~22 `C:/tmp/haengpyeong/` 파이프라인이 본문을 소리 없이 잘라냈고
 * (RC-1 각주컷 순서오류 / RC-2 문항번호 단조성 부재 / RC-3 is_clean 면제 /
 * RC-4 요약·행두숫자·하이픈결합), 아무 테스트도 울리지 않았다.
 * 사고 당시 리포에 있던 유일한 코퍼스 assert 는
 * `tests/unit/codex-native-webtoon-harness.test.ts:133` 의
 * `assert.equal(corpus.length, 4_537)` 하나였다. 개수 동결은 무결성을 전혀
 * 보증하지 못하면서 수리(레코드 추가/복원)만 방해한다.
 *
 * ⚠ 확장자 규칙 — 반드시 .mjs
 * CI(.github/workflows/ci.yml)는 node 20 에서 `npm run test:unit` 을 돌린다.
 * node 20 에는 타입 스트리핑이 없어 `tests/unit/*.test.ts` 17개는 실행될 수
 * 없다. 이 게이트를 .ts 로 쓰면 만들어지고도 CI 에서 안 돈다.
 *
 * ⚠ 실행기 — `scripts/run-unit-tests.mjs`
 * node 20 과 24 는 `--test` 인자를 정반대로 해석한다(20=디렉토리 순회, 24=글롭).
 * 어느 한쪽 형태를 package.json 에 박으면 반대쪽에서 이 게이트가 **0건 실행**된다.
 * 그래서 실행기가 파일 목록을 직접 열거해 명시 인자로 넘긴다. 실측 근거는
 * scripts/run-unit-tests.mjs 상단 주석에 있다.
 *
 * 기준선(baseline) 방식
 * --------------------
 * 지금 코퍼스에는 결함이 실재하므로 I1~I5 는 "위반 0" 이 될 수 없다.
 * 그래서 알려진 결함을 `fixtures/exam-corpus-known-issues.json` 에 동결하고
 *   · 기준선에 없는 위반이 생기면 RED (회귀)
 *   · 기준선에 있던 위반이 사라져도 RED (수리 성공 → 기준선 갱신 요구)
 *   · 기준선이 코퍼스에 없는 id 를 가리켜도 RED (stale)
 * 로 만든다. 세 방향 모두 막아야 기준선이 "썩은 관용"이 되지 않는다.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  answerValues,
  checkCountLock,
  checkWordCountAnchor,
  checkFacetConsistency,
  checkLengthFloor,
  checkOrderBlockCompleteness,
  checkSentenceCompleteness,
  checkSilentCorruption,
  countPassagesWithoutProblemEntry,
  lockedWordCount,
  lockToWordCount,
  measureAnswerKeyLengthUniformity,
  RC4B_DAMAGE_SIGNATURES,
  stripWordCountLock,
} from "./exam-corpus-invariants.mjs";

// ---------------------------------------------------------------------------
// 로드
// ---------------------------------------------------------------------------

const readRaw = (rel) => readFileSync(resolve(process.cwd(), rel));
const read = (rel) => JSON.parse(readRaw(rel).toString("utf8"));

const passages = read("src/data/exam-passages/passages.json");
const problems = read("src/data/exam-passages/problems.json");
const facets = read("src/data/exam-passages/facets.json");
const koPassages = read("src/data/exam-passages-korean/passages.json");
const koFacets = read("src/data/exam-passages-korean/facets.json");
const baseline = read("tests/unit/fixtures/exam-corpus-known-issues.json");

const byId = new Map(passages.map((p) => [p.id, p]));

/**
 * 위반 문자열 -> id.
 * ⚠ 반드시 (id, wordCount) 각인을 먼저 떼야 한다. I3 처럼 `::reason` 이 없는
 * 검사에서는 `split("::")[0]` 만으로는 `id@wc=76` 이 통째로 남아 stale 검사가
 * 전건 오탐한다.
 */
const idOf = (violation) => stripWordCountLock(violation).split("::")[0];

/** 기준선 항목 목록에서 id 집합만 뽑는다(주입 대상 선정용). */
const baselineIds = (entries) => new Set(entries.map(idOf));

/** 실측 위반에 현재 단어수를 각인해 기준선과 같은 형식으로 만든다. */
const locked = (violations) => lockToWordCount(violations, passages);

/** 원본을 건드리지 않고 특정 레코드만 바꾼 새 배열을 만든다. */
function withMutation(rows, id, mutate) {
  return rows.map((p) => (p.id === id ? mutate({ ...p }) : p));
}

/**
 * 기준선 3방향 대조.
 * 반드시 이 헬퍼만 쓸 것 — "새 위반만 보고 사라진 위반은 안 보는" 실수를
 * 검사마다 반복하지 않기 위해서다.
 */
function assertAgainstBaseline(name, actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const regressions = actual.filter((v) => !expectedSet.has(v));
  const repaired = expected.filter((v) => !actualSet.has(v));

  assert.deepEqual(
    regressions,
    [],
    `[${name}] 기준선에 없는 새 위반 ${regressions.length}건 — 코퍼스가 나빠졌다.\n` +
      regressions.slice(0, 20).join("\n"),
  );
  assert.deepEqual(
    repaired,
    [],
    `[${name}] 기준선의 위반 ${repaired.length}건이 사라졌다(수리 성공으로 보인다).\n` +
      `tests/unit/fixtures/exam-corpus-known-issues.json 을 갱신해 기준선을 조여라 — ` +
      `갱신하지 않으면 다음 회귀를 이 자리에서 놓친다.\n` +
      repaired.slice(0, 20).join("\n"),
  );
}

/** 기준선이 이미 사라진 id 를 가리키고 있지 않은지(stale) 확인. */
function assertBaselineIdsExist(name, entries) {
  const missing = entries.map(idOf).filter((id) => !byId.has(id));
    assert.deepEqual(
      missing,
      [],
      `[${name}] 기준선이 코퍼스에 없는 id 를 가리킨다(stale baseline): ${missing.join(", ")}`,
    );
}

// ---------------------------------------------------------------------------
// I7 — 개수 잠금 교체 (자기기술 불변식)
// ---------------------------------------------------------------------------

test("I7 · 코퍼스 개수는 facets 가 자기기술하고, 사고 이전 규모 아래로 내려가지 않는다", () => {
  // 왜 assert 를 남기는가: 로드 실패(빈 배열/파싱 실패)를 통과시키면
  // 아래 모든 불변식이 "위반 0" 으로 조용히 통과해 버린다.
  assert.deepEqual(checkCountLock(passages, facets, baseline.corpus.en.minPassages, "en"), []);
  assert.deepEqual(checkCountLock(koPassages, koFacets, baseline.corpus.ko.minPassages, "ko"), []);

  // 하한은 **래칫**이다: 수리로 레코드가 늘면 minPassages 를 올려 다시 조일 수 있지만,
  // 사고 이전 규모(preIncidentFloor) 아래로는 절대 못 내린다.
  //
  // ⚠ PB-3(가짜 RED) 제거: 예전에는 여기가 `assert.equal(minPassages, 4_537)` 였다.
  //   2단계 수리가 레코드를 4,541 로 늘리고 기준선을 정직하게 갱신하는 순간
  //   이 상수 동결이 RED 를 내서, "수리했더니 게이트가 깨졌다" 는 가짜 신호를 만든다.
  //   역사적 사실(사고 이전 4,537)은 preIncidentFloor 에 두고, 운용값은 래칫으로 잠근다.
  for (const lang of ["en", "ko"]) {
    const c = baseline.corpus[lang];
    assert.ok(
      c.minPassages >= c.preIncidentFloor,
      `[${lang}] 하한이 사고 이전 규모 아래로 내려갔다 (minPassages=${c.minPassages} < preIncidentFloor=${c.preIncidentFloor})`,
    );
    assert.ok(c.minPassages <= c.passages, `[${lang}] 하한이 실측 개수보다 크다 — 기준선이 스스로 RED 를 만든다`);
  }
  assert.equal(baseline.corpus.en.preIncidentFloor, 4_537, "영어 사고 이전 규모는 역사적 사실이라 바뀔 수 없다");
  assert.equal(baseline.corpus.ko.preIncidentFloor, 1_402, "국어 사고 이전 규모는 역사적 사실이라 바뀔 수 없다");
});

test("음성테스트 I7 · 로드실패 / 자기기술 붕괴 / 축소 / id중복이 각각 RED", () => {
  const FLOOR = baseline.corpus.en.minPassages;
  assert.deepEqual(checkCountLock([], facets, FLOOR, "en"), ["en::corpus-load-failed"]);

  const shrunk = passages.slice(0, -1);
  const v = checkCountLock(shrunk, facets, FLOOR, "en");
  assert.ok(v.some((x) => x.includes("self-description-broken")), "계기 무력: facets.total 불일치가 안 울렸다");
  assert.ok(v.some((x) => x.includes("corpus-shrank")), "계기 무력: 축소가 안 울렸다");

  const duped = [...passages.slice(0, -1), passages[0]];
  assert.ok(
    checkCountLock(duped, facets, FLOOR, "en").some((x) => x.includes("duplicate-ids")),
    "계기 무력: id 중복이 안 울렸다",
  );

  // 상수 동결(=== 4_537)이었다면 통과했을 상태가 여기서는 잡혀야 한다:
  // 개수는 그대로인데 본문이 통째로 비어버린 코퍼스.
  const gutted = passages.map((p) => ({ ...p, text: "" }));
  assert.deepEqual(checkCountLock(gutted, facets, FLOOR, "en"), [], "개수 잠금만으로는 본문 소실을 못 잡는다(설계상 사실)");
  assert.ok(
    checkSentenceCompleteness(gutted).violations.length > 4_000,
    "계기 무력: 본문을 전부 비웠는데 I4 가 울리지 않았다 — 개수 잠금을 대체할 자격이 없다",
  );
});

// ---------------------------------------------------------------------------
// I1 — 글의순서 블록 완전성
// ---------------------------------------------------------------------------

test("I1 · 글의순서 블록 완전성 (스킵 건수까지 잠근다)", () => {
  const result = checkOrderBlockCompleteness(passages, problems);
  const b = baseline.I1_orderBlockCompleteness;

  // 조용한 축소 방지: 검사 대상이 줄어드는 방식으로 GREEN 을 사는 것을 막는다.
  assert.deepEqual(result.meta, b.meta, "I1 검사/스킵 모수가 변했다 — 축소로 GREEN 을 사지 마라");
  assert.equal(
    countPassagesWithoutProblemEntry(passages, problems),
    b.passagesWithoutProblemEntry,
    "problems.json 대응 없는 레코드 수가 변했다",
  );

  assertBaselineIdsExist("I1", b.violations);
  assertAgainstBaseline("I1", locked(result.violations), b.violations);
});

test("음성테스트 I1 · lead 블록 훼손 / 순열 파괴 / 정답 범위 이탈이 실제로 RED 를 만든다", () => {
  const target = passages.find(
    (p) => p.reconstructionKind === "order" && problems[p.id] && !baseline.I1_orderBlockCompleteness.violations.some((v) => idOf(v) === p.id),
  );
  assert.ok(target, "주입 대상 확보 실패");

  // (a) lead 블록 머리를 갈아엎는다.
  const leadBroken = checkOrderBlockCompleteness(
    withMutation(passages, target.id, (p) => ({ ...p, text: `Totally unrelated opening sentence. ${p.text}` })),
    problems,
  );
  assert.ok(
    leadBroken.violations.includes(`${target.id}::lead-block-prefix-lost`),
    "계기 무력: lead 블록을 훼손했는데 I1 이 울리지 않았다",
  );

  // (b) 순열 선지를 중복시킨다.
  const permTarget = passages.find(
    (p) =>
      p.reconstructionKind === "order" &&
      p.typeGroup === "글의순서" &&
      (problems[p.id]?.rawProblems?.[0]?.choices ?? []).length === 5 &&
      !baseline.I1_orderBlockCompleteness.violations.some((v) => idOf(v) === p.id),
  );
  assert.ok(permTarget, "순열 주입 대상 확보 실패");
  const entry = problems[permTarget.id];
  const poisoned = {
    ...problems,
    [permTarget.id]: {
      ...entry,
      rawProblems: [{ ...entry.rawProblems[0], choices: entry.rawProblems[0].choices.map(() => "(A) - (B) - (C)") }],
    },
  };
  const permBroken = checkOrderBlockCompleteness(passages, poisoned);
  assert.ok(
    permBroken.violations.includes(`${permTarget.id}::permutation-set-broken`),
    "계기 무력: 순열 집합을 파괴했는데 I1 이 울리지 않았다",
  );

  // (c) 정답 인덱스 이탈 (단일 정수 · 장문 맵 두 형태 모두)
  const scalar = checkOrderBlockCompleteness(withMutation(passages, target.id, (p) => ({ ...p, answer: 9 })), problems);
  assert.ok(
    scalar.violations.some((v) => v.startsWith(`${target.id}::answer-out-of-range`)),
    "계기 무력: answer=9 인데 I1 이 울리지 않았다",
  );
  const setTarget = passages.find((p) => p.reconstructionKind === "order" && p.answer && typeof p.answer === "object");
  if (setTarget) {
    const mapped = checkOrderBlockCompleteness(
      withMutation(passages, setTarget.id, (p) => ({ ...p, answer: { ...p.answer, [Object.keys(p.answer)[0]]: 0 } })),
      problems,
    );
    assert.ok(
      mapped.violations.some((v) => v.startsWith(`${setTarget.id}::answer-out-of-range`)),
      "계기 무력: 장문 정답맵에 0 을 넣었는데 I1 이 울리지 않았다",
    );
  }

  // (d) 스킵 축소 감지 — problems 를 통째로 비우면 모수 assert 가 깨져야 한다.
  const emptied = checkOrderBlockCompleteness(passages, {});
  assert.notDeepEqual(emptied.meta, baseline.I1_orderBlockCompleteness.meta, "계기 무력: 검사 모수가 0 이 됐는데 meta 가 동일하다");
  assert.equal(emptied.violations.length, 0, "모수가 0 이면 위반도 0 — 이 상태를 meta assert 로 잡아야 한다");
});

// ---------------------------------------------------------------------------
// I2 — 정답키별 길이 분포 균일성
// ---------------------------------------------------------------------------

test("I2 · 글의순서 정답키별 median 단어수 비 (RC-1 직결 지표)", () => {
  const measured = measureAnswerKeyLengthUniformity(passages);
  const b = baseline.I2_answerKeyLengthUniformity;

  assert.deepEqual(
    Object.keys(measured).sort(),
    Object.keys(b.deviations).sort(),
    "I2 코호트 구성이 변했다 — 기준선을 갱신하라",
  );

  const worse = [];
  const better = [];
  for (const [key, cell] of Object.entries(measured)) {
    const limit = b.deviations[key];
    if (cell.deviation > limit + b.tolerance) worse.push(`${key}: ${cell.deviation} > 기준선 ${limit} (ratio=${cell.ratio}, n=${cell.n})`);
    if (cell.deviation < limit - b.staleWhenBetterBy) better.push(`${key}: ${cell.deviation} << 기준선 ${limit} (ratio=${cell.ratio})`);
  }
  assert.deepEqual(worse, [], `[I2] 정답키 길이 편향이 악화됐다:\n${worse.join("\n")}`);
  assert.deepEqual(
    better,
    [],
    `[I2] 편향이 크게 개선됐다 — 기준선을 조여라(갱신하지 않으면 다음 회귀를 놓친다):\n${better.join("\n")}`,
  );

  // 이 지표가 "지금 RED 여야 정상" 임을 문서화한다.
  assert.ok(
    b.deviations["학력평가|answer4"] > 0.1,
    "EBSi(학력평가) 글의순서 정답④ 코호트 편향이 기준선에서 사라졌다 — 기준선이 무의미해졌다",
  );
});

test("음성테스트 I2 · 한 정답 코호트만 절반으로 자르면 편차가 기준선을 넘는다", () => {
  const cohort = passages.filter((p) => p.typeGroup === "글의순서" && p.board === "수능모의평가" && p.answer === 2);
  assert.ok(cohort.length >= 15, "코호트 확보 실패");
  const ids = new Set(cohort.map((p) => p.id));
  const mutated = passages.map((p) =>
    ids.has(p.id) ? { ...p, text: p.text.split(/\s+/).slice(0, Math.ceil(p.text.split(/\s+/).length / 2)).join(" ") } : p,
  );
  const after = measureAnswerKeyLengthUniformity(mutated);
  const key = "수능모의평가|answer2";
  const limit = baseline.I2_answerKeyLengthUniformity.deviations[key];
  assert.ok(
    after[key].deviation > limit + baseline.I2_answerKeyLengthUniformity.tolerance,
    `계기 무력: 코호트를 절반으로 잘랐는데 편차가 ${after[key].deviation} (기준선 ${limit})`,
  );
});

// ---------------------------------------------------------------------------
// I3 — 유형×보드 정규화 길이 하한
// ---------------------------------------------------------------------------

test("I3 · (board, era, typeGroup) 중앙값 60% 미만 레코드", () => {
  const result = checkLengthFloor(passages);
  const b = baseline.I3_lengthFloor;
  assert.deepEqual(result.meta, b.meta, "I3 그룹 모수가 변했다");
  assertBaselineIdsExist("I3", b.violations);
  assertAgainstBaseline("I3", locked(result.violations), b.violations);
});

test("음성테스트 I3 · 정상 레코드를 10단어로 자르면 RED", () => {
  const target = passages.find(
    (p) => p.typeGroup === "빈칸추론" && !baselineIds(baseline.I3_lengthFloor.violations).has(p.id),
  );
  assert.ok(target, "주입 대상 확보 실패");
  const result = checkLengthFloor(withMutation(passages, target.id, (p) => ({ ...p, text: p.text.split(/\s+/).slice(0, 10).join(" ") })));
  assert.ok(result.violations.includes(target.id), "계기 무력: 10단어로 잘랐는데 I3 이 울리지 않았다");
});

// ---------------------------------------------------------------------------
// I4 — 문장 미완결
// ---------------------------------------------------------------------------

test("I4 · 종결부호 없이 끝나거나 기능어에 매달려 끝나는 레코드", () => {
  const result = checkSentenceCompleteness(passages);
  const b = baseline.I4_sentenceCompleteness;
  assert.deepEqual(result.meta, b.meta, "I4 세부 카운트가 변했다");
  assertBaselineIdsExist("I4", b.violations);
  assertAgainstBaseline("I4", locked(result.violations), b.violations);
});

test("음성테스트 I4 · 종결부호 제거 / 기능어 말미 / 쉼표 말미가 각각 RED", () => {
  const clean = passages.find((p) => /\.$/.test(p.text.trim()) && !baseline.I4_sentenceCompleteness.violations.some((v) => idOf(v) === p.id));
  assert.ok(clean, "주입 대상 확보 실패");

  const dropped = checkSentenceCompleteness(withMutation(passages, clean.id, (p) => ({ ...p, text: p.text.trim().replace(/\.$/, "") })));
  assert.ok(
    dropped.violations.some((v) => v === `${clean.id}::no-terminal-punctuation`),
    "계기 무력: 종결부호를 지웠는데 I4 가 울리지 않았다",
  );

  const fnTail = checkSentenceCompleteness(withMutation(passages, clean.id, (p) => ({ ...p, text: `${p.text.trim()} which was carried out by the` })));
  assert.ok(
    fnTail.violations.includes(`${clean.id}::no-terminal-punctuation+trailing-function-word`),
    "계기 무력: 기능어로 끝냈는데 trailing-function-word 가 울리지 않았다",
  );

  const comma = checkSentenceCompleteness(withMutation(passages, clean.id, (p) => ({ ...p, text: `${p.text.trim().replace(/\.$/, "")},` })));
  assert.ok(
    comma.violations.includes(`${clean.id}::no-terminal-punctuation+dangling-punctuation`),
    "계기 무력: 쉼표로 끝냈는데 dangling-punctuation 이 울리지 않았다",
  );
});

// ---------------------------------------------------------------------------
// I5 — 무성 훼손 패턴
// ---------------------------------------------------------------------------

test("I5 · 무성 훼손 패턴 배터리", () => {
  const result = checkSilentCorruption(passages);
  const b = baseline.I5_silentCorruption;
  assert.deepEqual(Object.keys(result).sort(), Object.keys(b).sort(), "I5 검출기 구성이 변했다");
  for (const key of Object.keys(b)) {
    assertBaselineIdsExist(`I5.${key}`, b[key]);
    assertAgainstBaseline(`I5.${key}`, locked(result[key]), b[key]);
  }

  // RC-4b 확정 훼손 7건은 2단계 수리의 직접 목표다. 지금은 전부 살아있어야 한다.
  assert.equal(
    b.rc4bDamagedNumeric.length,
    RC4B_DAMAGE_SIGNATURES.length,
    "RC-4b 시그니처 수와 기준선 hit 수가 다르다 — 일부가 이미 수리됐다면 기준선을 갱신하라",
  );
});

test("음성테스트 I5 · 8개 검출기에 각각 결함을 주입하면 모두 RED", () => {
  const host = passages.find((p) => !/[\uAC00-\uD7A3]/.test(p.text) && p.text.length > 400);
  assert.ok(host, "주입 대상 확보 실패");

  const inject = (suffix) => checkSilentCorruption(withMutation(passages, host.id, (p) => ({ ...p, text: `${p.text} ${suffix}` })));

  const cases = [
    ["hangulInEnglishCorpus", "다음 글의 요지로 가장 적절한 것은?", host.id],
    ["circledChoiceMarker", "① first ② second", host.id],
    ["pointsMarker", "[3점]", host.id],
    ["blockMarkerResidue", "(B) Meanwhile the team returned.", host.id],
    ["referenceMarkResidue", "※ footnote marker", host.id],
    ["duplicatedFunctionWord", "It depends on on the outcome.", `${host.id}::on on`],
  ];
  for (const [detector, payload, expected] of cases) {
    const hit = inject(payload)[detector];
    assert.ok(hit.includes(expected), `계기 무력: ${detector} 에 "${payload}" 를 주입했는데 울리지 않았다`);
  }

  // 붙은 복합어(RC-4c 형): 코퍼스 어디에도 없던 결합형을 1회 주입.
  // ⚠ 12자 미만은 탐지 하한(minLen=12) 밖이다 — 실제로 이 음성테스트가
  //   11자 페이로드로 한 번 통과에 실패해서 하한의 실재를 증명했다.
  const glued = inject("The peoplenumber gathered quietly.").gluedCompound;
  assert.ok(
    glued.some((v) => v.startsWith(`${host.id}::peoplenumber`)),
    `계기 무력: 붙은 복합어를 주입했는데 gluedCompound 가 울리지 않았다 (관측=${glued.filter((v) => v.startsWith(host.id)).join(",")})`,
  );

  // RC-4b 시그니처는 id 고정 검출기다. 정반대 방향(수리)으로 음성테스트한다:
  // 훼손 문자열을 원본으로 되돌리면 그 id 의 hit 이 사라져야 한다.
  const [rcId, damaged, original] = RC4B_DAMAGE_SIGNATURES[0];
  const repaired = checkSilentCorruption(
    withMutation(passages, rcId, (p) => ({ ...p, text: p.text.replace(damaged, original) })),
  ).rc4bDamagedNumeric;
  assert.ok(
    !repaired.some((v) => idOf(v) === rcId),
    "계기 무력: RC-4b 훼손을 원본으로 되돌렸는데 여전히 hit 이 남아있다(상수를 읽고 있다)",
  );
  assert.equal(repaired.length, RC4B_DAMAGE_SIGNATURES.length - 1, "RC-4b 검출기가 나머지 6건을 놓쳤다");
});

// ---------------------------------------------------------------------------
// I6 — facets ↔ passages 정합
// ---------------------------------------------------------------------------

test("I6 · facets ↔ passages 정합 (영어·국어)", () => {
  const en = checkFacetConsistency(passages, facets, "en");
  const ko = checkFacetConsistency(koPassages, koFacets, "ko");
  assertAgainstBaseline("I6.en", en.violations, baseline.I6_facetConsistency.en);
  assertAgainstBaseline("I6.ko", ko.violations, baseline.I6_facetConsistency.ko);

  // D3(원자성 없는 패치)이 만드는 total 불일치는 기준선과 무관하게 언제나 금지.
  assert.ok(
    !en.violations.some((v) => v.includes("total-mismatch")),
    "영어 passages/facets total 불일치 — 부분 실패한 패치가 남긴 상태일 수 있다",
  );
  assert.ok(!ko.violations.some((v) => v.includes("total-mismatch")), "국어 passages/facets total 불일치");
});

test("음성테스트 I6 · 레코드 1건 삭제 / 차원값 변조가 각각 RED", () => {
  const dropped = checkFacetConsistency(passages.slice(0, -1), facets, "en");
  assert.ok(
    dropped.violations.some((v) => v.includes("total-mismatch")),
    "계기 무력: 레코드를 1건 지웠는데 total-mismatch 가 울리지 않았다",
  );

  const target = passages[0];
  const retyped = checkFacetConsistency(
    withMutation(passages, target.id, (p) => ({ ...p, typeGroup: "존재하지않는유형" })),
    facets,
    "en",
  );
  assert.ok(
    retyped.violations.some((v) => v.includes("counts.typeGroup[존재하지않는유형]")),
    "계기 무력: typeGroup 을 변조했는데 counts 불일치가 울리지 않았다",
  );
  assert.ok(
    retyped.violations.some((v) => v.includes('typeGroups missing "존재하지않는유형"')),
    "계기 무력: 열거 목록 커버리지가 울리지 않았다",
  );
});

// ---------------------------------------------------------------------------
// 게이트 자체의 건전성
// ---------------------------------------------------------------------------

test("게이트 건전성 · 기준선 파일이 실제 코퍼스를 가리키고 있다", () => {
  assert.equal(baseline.corpus.en.facetTotal, facets.total, "기준선의 facets.total 이 낡았다");
  assert.equal(baseline.corpus.ko.facetTotal, koFacets.total, "기준선의 국어 facets.total 이 낡았다");

  const known = [
    ...baseline.I1_orderBlockCompleteness.violations,
    ...baseline.I3_lengthFloor.violations,
    ...baseline.I4_sentenceCompleteness.violations,
    ...Object.values(baseline.I5_silentCorruption).flat(),
  ];
  assert.ok(known.length > 0, "기준선이 비어있다 — 결함이 실재하는데 0 이면 검출기가 죽은 것이다");
  assertBaselineIdsExist("baseline", known);
});

test("게이트 건전성 · answerValues 가 3형태(정수·맵·null)를 모두 다룬다", () => {
  assert.deepEqual(answerValues(3), [3]);
  assert.deepEqual(answerValues({ 41: 1, 42: 5 }), [1, 5]);
  assert.equal(answerValues(null), null);
  assert.equal(answerValues(undefined), null);
});

// ---------------------------------------------------------------------------
// I0 — wordCount 절대 앵커 (렌즈 R3 신설)
// ---------------------------------------------------------------------------

test("I0 · 저장된 wordCount 와 본문 실측이 어긋나지 않는다 (독립 계기 대조)", () => {
  const result = checkWordCountAnchor(passages, { maxDrift: baseline.I0_wordCountAnchor.maxDrift });
  const b = baseline.I0_wordCountAnchor;

  // 분포 자체를 잠근다: exact 가 줄고 offByOne 이 느는 것도 훼손의 신호다.
  assert.deepEqual(result.meta, b.meta, "I0 분포가 변했다 — 본문이나 wordCount 중 하나가 다시 쓰였다");
  assertBaselineIdsExist("I0", b.violations);
  assertAgainstBaseline("I0", locked(result.violations), b.violations);

  // 이 불변식이 왜 강한가를 수치로 못 박는다.
  assert.equal(b.meta.missingField, 0, "wordCount 없는 레코드가 생겼다 — 앵커가 무력해진다");
  assert.equal(b.violations.length, 0, "|Δ|≥2 는 사고 이전에도 0건이었다 — 0 이 아니면 새 훼손이다");
});

test("음성테스트 I0 · 꼬리 절단 / 꼬리 복원 / wordCount 필드 소실이 각각 RED", () => {
  const host = passages.find((p) => p.wordCount > 120);
  assert.ok(host, "주입 대상 확보 실패");

  // (a) 본문만 자른다 (= 2026-06 사고가 실제로 한 일). wordCount 는 그대로다.
  const cut = checkWordCountAnchor(
    withMutation(passages, host.id, (p) => ({ ...p, text: p.text.split(/\s+/).slice(0, 40).join(" ") })),
  );
  assert.ok(
    cut.violations.some((v) => v.startsWith(host.id + "::wordcount-drift")),
    "계기 무력: 본문을 40단어로 잘랐는데 앵커가 울리지 않았다",
  );

  // (b) 본문만 늘린다 (= 2단계 수리가 할 일). 이것도 RED 여야 한다 —
  //     패처가 wordCount 를 같이 갱신하도록 강제하는 것이 이 불변식의 계약이다.
  const restoredTail = Array.from({ length: 30 }, () => "restored").join(" ");
  const grown = checkWordCountAnchor(
    withMutation(passages, host.id, (p) => ({ ...p, text: p.text + " " + restoredTail })),
  );
  assert.ok(
    grown.violations.some((v) => v.startsWith(host.id + "::wordcount-drift")),
    "계기 무력: 본문에 30단어를 붙였는데 앵커가 울리지 않았다 — 수리가 조용히 지나간다",
  );

  // (c) 필드 자체가 사라지면 "검사 대상 아님"이 아니라 위반이다.
  const stripped = checkWordCountAnchor(
    withMutation(passages, host.id, (p) => {
      const q = { ...p };
      delete q.wordCount;
      return q;
    }),
  );
  assert.ok(
    stripped.violations.includes(host.id + "::wordcount-field-missing"),
    "계기 무력: wordCount 를 지웠는데 조용히 통과했다 — 앵커를 지우는 것이 가장 싼 우회로가 된다",
  );

  // (d) ±1 은 통과해야 한다(토큰화 규칙 차이 37건이 실재한다).
  const offByOne = checkWordCountAnchor(withMutation(passages, host.id, (p) => ({ ...p, wordCount: p.wordCount + 1 })));
  assert.ok(
    !offByOne.violations.some((v) => idOf(v) === host.id),
    "±1 까지는 통과해야 한다 — 그렇지 않으면 기존 37건이 전부 오탐이 된다",
  );
});

// ---------------------------------------------------------------------------
// (id, wordCount) 튜플 잠금 — "영구 면제" 구멍이 실제로 막혔는지
// ---------------------------------------------------------------------------

test("음성테스트 · 기준선에 이미 있는 레코드를 더 잘라내도 GREEN 이 유지되지 않는다", () => {
  // 이것이 id 잠금의 치명적 구멍이었다. I3 기준선 71건 중 하나를 골라 더 짧게
  // 자른다. id 잠금이었다면 "이미 알려진 위반"이라 통과했을 상황이다.
  const victimId = idOf(baseline.I3_lengthFloor.violations[0]);
  const victim = byId.get(victimId);
  assert.ok(victim, "기준선 첫 항목이 코퍼스에 없다");

  const mutated = withMutation(passages, victimId, (p) => ({
    ...p,
    text: p.text.split(/\s+/).slice(0, 8).join(" "),
  }));
  const rawAfter = checkLengthFloor(mutated).violations;

  // (a) 전제: 이 id 는 기준선에 있다 → id 잠금이었다면 무슨 짓을 해도 면제였다.
  const idOnlyBaseline = new Set(baseline.I3_lengthFloor.violations.map(idOf));
  assert.ok(idOnlyBaseline.has(victimId), "전제 확인 실패");
  assert.ok(
    rawAfter.filter((v) => !idOnlyBaseline.has(idOf(v))).length === 0,
    "id 잠금 흉내: 8단어로 잘라도 '새 위반'이 0 이다 — 이것이 영구 면제 구멍의 실증이다",
  );

  // (b) 튜플 잠금 — 같은 상황이 regression 으로 잡혀야 한다.
  const lockedAfter = lockToWordCount(rawAfter, mutated);
  const expected = new Set(baseline.I3_lengthFloor.violations);
  const regressions = lockedAfter.filter((v) => !expected.has(v));
  assert.ok(
    regressions.some((v) => idOf(v) === victimId),
    "계기 무력: 기준선 항목 " + victimId + " 를 8단어로 잘랐는데 튜플 잠금이 울리지 않았다",
  );

  // (c) 각인은 실제 단어수를 담고 있어야 한다(형식만 흉내낸 것이 아님).
  const hit = regressions.find((v) => idOf(v) === victimId);
  assert.equal(lockedWordCount(hit), 8, "각인된 단어수가 실측과 다르다: " + hit);

  // (d) 코퍼스에서 사라진 id 는 MISSING 으로 드러난다(stale 은닉 방지).
  assert.equal(lockToWordCount([victimId + "::x"], [])[0], victimId + "::x@wc=MISSING");
});

// ---------------------------------------------------------------------------
// 기준선 파일 자체의 건전성 (렌즈 R3 신설)
// ---------------------------------------------------------------------------

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const toLf = (buf) => Buffer.from(buf.toString("binary").split("\r\n").join("\n"), "binary");

/**
 * ★ CI-EOL — 왜 raw 바이트 핀이 아니라 EOL 정규화 핀인가 (2026-08-20, 렌즈 M4) ★
 *
 * 이 리포는 `core.autocrlf=true` 다. 즉 **같은 커밋이라도** 워크트리 바이트가
 * 플랫폼마다 다르다. 실측:
 *   src/data/exam-passages-korean/facets.json
 *     로컬 워크트리(Windows/CRLF)              61,559B  sha256 9029c719…
 *     `git cat-file blob HEAD:<path>` (=LF)    59,228B  sha256 c3f45c64…
 * `.github/workflows/ci.yml:16` 은 `runs-on: ubuntu-latest` 라 **항상 LF 를 본다**.
 * 그래서 CRLF 워크트리 바이트를 raw 로 핀하면 이 게이트는 CI 에서 **영구 RED** 다.
 * 그러면서 로컬에서는 24/24 GREEN 이라 아무도 눈치채지 못한다 — 코퍼스 훼손이라는
 * 진짜 신호가 상시 RED 에 묻힌다(= 게이트를 만들어 놓고 끄는 것과 같다).
 *
 * 따라서 **핀은 EOL 정규화 후 바이트에만 건다.** `.gitattributes` 가 코퍼스 JSON 을
 * `text eol=lf` 로 고정하지만, 속성은 사람이 지울 수 있고 과거 체크아웃에는 소급되지
 * 않으므로 게이트 자체가 EOL 에 불변이어야 한다(방어 2중화).
 *
 * 잃는 것: CR 바이트만 바꾸는 변조는 이 핀에 안 잡힌다. 그것은 본문 훼손이 아니므로
 * 이 게이트의 관심사가 아니다(본문 검사 I0~I7 이 별도로 돈다).
 */
function checkSourcePins(sources, readFn) {
  const drift = [];
  for (const rel of Object.keys(sources)) {
    const pin = sources[rel];

    // (1) 핀 자체의 형식 검사 — 필드가 없으면 **통과가 아니라 RED**.
    //     이걸 빼면 핀을 지우는 것만으로 게이트를 끌 수 있다(fail-open).
    if (typeof pin.sha256EolNormalized !== "string" || pin.sha256EolNormalized.length !== 64) {
      drift.push(rel + ": 기준선에 sha256EolNormalized 핀이 없거나 형식이 틀렸다 — 핀 없는 항목은 통과시키지 않는다.");
      continue;
    }
    if (!Number.isInteger(pin.bytesEolNormalized) || pin.bytesEolNormalized <= 0) {
      drift.push(rel + ": 기준선에 bytesEolNormalized 핀이 없거나 형식이 틀렸다.");
      continue;
    }
    // (2) raw 바이트 핀 재유입 금지. 이 두 필드가 다시 생기면 CI-EOL 이 재발한다.
    if ("sha256" in pin || "bytes" in pin) {
      drift.push(
        rel + ": 기준선에 raw 바이트 핀(sha256/bytes)이 다시 들어왔다 — CRLF 로컬에서만 GREEN 인 핀이다. " +
          "sourcesPinPolicy 를 읽어라.",
      );
      continue;
    }

    // (3) 본문 대조는 정규화 바이트로만.
    const lf = toLf(readFn(rel));
    const actual = sha256(lf);
    if (actual === pin.sha256EolNormalized && lf.length === pin.bytesEolNormalized) continue;

    drift.push(
      rel + ": 내용이 바뀌었다 (핀 " + pin.sha256EolNormalized.slice(0, 16) + "/" + pin.bytesEolNormalized +
        "B, 실측 " + actual.slice(0, 16) + "/" + lf.length + "B — 둘 다 CRLF→LF 정규화 후). " +
        "코퍼스를 고쳤다면 기준선을 재생성하라. 줄바꿈만 다른 경우라면 이 검사는 울리지 않는다.",
    );
  }
  return drift;
}

/**
 * 핀 대상 파일 목록은 **코드에 박는다** (KEYSET-1 교훈).
 * `Object.keys(baseline.sources)` 만 순회하면 기준선 JSON 에서 한 줄 지우는 것만으로
 * 그 파일이 검사 대상에서 조용히 빠진다 — 검사 건수는 줄지만 GREEN 은 유지된다.
 */
const PINNED_SOURCES = [
  "src/data/exam-passages/passages.json",
  "src/data/exam-passages/problems.json",
  "src/data/exam-passages/facets.json",
  "src/data/exam-passages-korean/passages.json",
  "src/data/exam-passages-korean/facets.json",
];

test("기준선 건전성 · 코퍼스 5파일 sha256 핀 (EOL 정규화 — CRLF 로컬과 LF 체크아웃에서 동일 판정)", () => {
  // (1) 대상 집합 자체를 먼저 고정한다. 초과도 누락도 RED.
  assert.deepEqual(
    Object.keys(baseline.sources).sort(),
    [...PINNED_SOURCES].sort(),
    "기준선 sources 의 키 집합이 코드에 박힌 목록과 다르다 — 핀 대상이 조용히 빠졌거나 늘었다",
  );
  // (2) 순회는 **코드 목록**으로 한다(기준선 키를 신뢰하지 않는다).
  const sources = Object.fromEntries(PINNED_SOURCES.map((rel) => [rel, baseline.sources[rel] ?? {}]));
  assert.deepEqual(checkSourcePins(sources, readRaw), [], "코퍼스 파일이 기준선 핀과 다르다");
});

test("음성테스트 · 기준선에서 핀 한 줄을 지우면 조용히 통과하지 않는다 (KEYSET-1)", () => {
  const trimmed = { ...baseline.sources };
  delete trimmed[PINNED_SOURCES[4]];
  assert.notDeepEqual(
    Object.keys(trimmed).sort(),
    [...PINNED_SOURCES].sort(),
    "계기 무력: 키를 지웠는데 집합 비교가 같다고 한다",
  );
  // 코드 목록으로 순회하면 지워진 항목은 "핀 없음" 으로 RED 가 된다.
  const sources = Object.fromEntries(PINNED_SOURCES.map((rel) => [rel, trimmed[rel] ?? {}]));
  assert.equal(checkSourcePins(sources, readRaw).length, 1, "지워진 핀이 통과했다(fail-open)");
});

test("음성테스트 · 정규화 핀은 1바이트 내용 변경을 잡고, CRLF↔LF 변환에는 침묵한다", () => {
  // 계기 시험은 **합성 입력**으로 한다. 실제 코퍼스 파일을 base 로 쓰면 코퍼스가
  // 드리프트한 순간 이 음성테스트까지 덩달아 RED 가 되어(중복 신호) "계기가 고장난 것"인지
  // "데이터가 바뀐 것"인지 로그에서 분간할 수 없다.
  const rel = "synthetic/facets.json";
  const LF = String.fromCharCode(10);
  const CRLF = String.fromCharCode(13, 10);
  const base = Buffer.from(["{", '  "a": 1,', '  "b": 2', "}", ""].join(LF), "utf8");
  const pinOf = (buf) => ({ bytesEolNormalized: toLf(buf).length, sha256EolNormalized: sha256(toLf(buf)) });
  const sources = { [rel]: pinOf(base) };

  // (a) 계기 확인 — 손대지 않으면 조용하다.
  assert.deepEqual(checkSourcePins(sources, () => base), [], "계기 무력: 원본인데 드리프트가 났다");

  // (b) 1바이트 추가 → RED.
  assert.equal(
    checkSourcePins(sources, () => Buffer.concat([base, Buffer.from(" ")])).length,
    1,
    "계기 무력: 1바이트를 붙였는데 핀이 안 울린다",
  );

  // (c) 길이를 유지한 1바이트 치환 → RED (길이 비교에 기대지 않는다).
  const swapped = Buffer.from(base);
  swapped[swapped.indexOf(0x31)] = 0x39; // "1" → "9"
  assert.equal(checkSourcePins(sources, () => swapped).length, 1, "계기 무력: 동일 길이 치환을 놓쳤다");

  // (d) ★핵심★ LF → CRLF 변환은 **드리프트가 아니다**. 이것이 CI-EOL 의 수정 지점이다.
  const crlf = Buffer.from(base.toString("binary").split(LF).join(CRLF), "binary");
  assert.notEqual(sha256(crlf), sha256(base), "계기 무력: 합성 입력에 개행이 없어 CRLF 사본이 원본과 같다");
  assert.notEqual(crlf.length, base.length, "계기 무력: CRLF 사본의 길이가 원본과 같다");
  assert.deepEqual(
    checkSourcePins(sources, () => crlf),
    [],
    "CI-EOL 회귀: 줄바꿈만 다른 사본에 게이트가 RED 를 냈다 — ubuntu 체크아웃에서 영구 RED 가 된다",
  );

  // (e) fail-open 금지 — 핀이 없거나 형식이 틀리면 통과가 아니라 RED.
  assert.equal(checkSourcePins({ [rel]: {} }, () => base).length, 1, "핀이 없는 항목이 통과했다(fail-open)");
  assert.equal(
    checkSourcePins({ [rel]: { sha256EolNormalized: sources[rel].sha256EolNormalized } }, () => base).length,
    1,
    "bytes 핀이 없는 항목이 통과했다(fail-open)",
  );

  // (f) raw 바이트 핀 재유입 금지 — 값이 맞더라도 필드가 있으면 RED.
  assert.equal(
    checkSourcePins({ [rel]: { ...sources[rel], sha256: sha256(base) } }, () => base).length,
    1,
    "raw sha256 핀 재유입을 막지 못했다",
  );
  assert.equal(
    checkSourcePins({ [rel]: { ...sources[rel], bytes: base.length } }, () => base).length,
    1,
    "raw bytes 핀 재유입을 막지 못했다",
  );
});

test("기준선 건전성 · 코퍼스 핀은 git blob(LF) 바이트와 일치한다 (ubuntu 체크아웃 예측)", () => {
  // 워크트리가 CRLF 든 LF 든, 정규화 핀은 **인덱스에 저장된 LF 바이트**와 같아야 한다.
  // 이 테스트가 GREEN 이면 `runs-on: ubuntu-latest` 체크아웃에서도 위 핀 검사가 GREEN 이다
  // (로컬 CRLF 에서만 GREEN 인 핀을 커밋하는 사고 = CI-EOL 의 재발을 여기서 잡는다).
  //
  // 건너뛰는 경우 두 가지 — 둘 다 조용히가 아니라 stdout 에 이유를 찍는다:
  //   · git 이 없는 환경(배포 tarball 등)
  //   · 해당 파일이 **아직 커밋되지 않은 편집 상태**(수리 작업 중) — 이때 blob 은 옛 내용이므로
  //     대조하면 거짓 RED 가 난다. 커밋되는 순간 다시 대조 대상이 된다.
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.log("[gate] git 없음 — HEAD blob 대조 생략");
    return;
  }
  const mismatches = [];
  let compared = 0;
  for (const rel of PINNED_SOURCES) {
    const st = spawnSync("git", ["status", "--porcelain", "--", rel], { encoding: "utf8" });
    if (st.status !== 0 || st.stdout.trim() !== "") {
      console.log("[gate] " + rel + ": 워크트리 편집 중 — HEAD blob 대조 생략");
      continue;
    }
    const blob = spawnSync("git", ["show", "HEAD:" + rel], { maxBuffer: 256 * 1024 * 1024 });
    if (blob.status !== 0) {
      console.log("[gate] " + rel + ": HEAD 에 없음 — 대조 생략");
      continue;
    }
    compared += 1;
    const actual = sha256(toLf(blob.stdout));
    if (actual !== baseline.sources[rel].sha256EolNormalized) {
      mismatches.push(
        rel + ": HEAD blob(LF) " + actual.slice(0, 16) +
          " ≠ 핀 " + baseline.sources[rel].sha256EolNormalized.slice(0, 16),
      );
    }
  }
  console.log("[gate] HEAD blob 대조 " + compared + "/" + PINNED_SOURCES.length + "건");
  assert.deepEqual(mismatches, [], "핀이 워크트리에만 맞고 커밋 바이트에는 안 맞는다 — CI 에서 RED 가 된다");
});

test("기준선 건전성 · 항목 수 래칫 (늘어나는 방향으로는 열리지 않는다)", () => {
  // 116 은 1단계 증거사슬이 확정한 총량이다. 이 숫자는 **수리로 줄어들 때만**
  // 낮춰 다시 조인다. 올리는 편집은 곧 "새 결함을 기준선에 눌러 담아 RED 를 끄는 짓"이다.
  const CEILING = 116;

  const counted = {
    I0_wordCountAnchor: baseline.I0_wordCountAnchor.violations.length,
    I1_orderBlockCompleteness: baseline.I1_orderBlockCompleteness.violations.length,
    I3_lengthFloor: baseline.I3_lengthFloor.violations.length,
    I4_sentenceCompleteness: baseline.I4_sentenceCompleteness.violations.length,
    ...Object.fromEntries(Object.entries(baseline.I5_silentCorruption).map(([k, v]) => ["I5." + k, v.length])),
  };
  assert.deepEqual(counted, baseline.limits.perCheck, "기준선이 스스로 신고한 검사별 건수가 실제와 다르다");

  const total = Object.values(counted).reduce((a, b) => a + b, 0);
  assert.equal(total, baseline.limits.maxBaselineEntries, "기준선 총량 신고가 실제와 다르다");
  assert.ok(
    baseline.limits.maxBaselineEntries <= CEILING,
    "기준선 항목이 래칫 상한을 넘었다 (" + baseline.limits.maxBaselineEntries + " > " + CEILING + "). " +
      "새 결함은 기준선에 추가하는 것이 아니라 고치는 것이다.",
  );
});

test("기준선 건전성 · 모든 항목이 근거를 가진다 (근거 없는 면제 금지)", () => {
  const r = baseline.rationale;
  const groups = new Set(Object.keys(r.groups));
  const ids = new Set(Object.keys(r.ids));

  const buckets = {
    I0_wordCountAnchor: baseline.I0_wordCountAnchor.violations,
    I1_orderBlockCompleteness: baseline.I1_orderBlockCompleteness.violations,
    I3_lengthFloor: baseline.I3_lengthFloor.violations,
    I4_sentenceCompleteness: baseline.I4_sentenceCompleteness.violations,
    ...Object.fromEntries(Object.entries(baseline.I5_silentCorruption).map(([k, v]) => ["I5." + k, v])),
  };

  const uncoveredGroups = Object.keys(buckets).filter((k) => !groups.has(k));
  assert.deepEqual(
    uncoveredGroups,
    [],
    "검사 그룹에 근거가 없다: " + uncoveredGroups.join(", ") + " — 새 검출기를 붙이면 근거도 함께 써라",
  );

  // perIdRequired 로 지정된 검사는 항목마다 개별 근거가 있어야 한다.
  const missing = [];
  for (const check of r.perIdRequired) {
    assert.ok(buckets[check], "perIdRequired 가 존재하지 않는 검사를 가리킨다: " + check);
    for (const entry of buckets[check]) {
      if (!ids.has(idOf(entry))) missing.push(check + " :: " + entry);
    }
  }
  assert.deepEqual(missing, [], "개별 근거가 없는 기준선 항목:\n" + missing.join("\n"));

  // 반대 방향: 코퍼스에 없는 id 에 근거만 남아 썩는 것도 막는다.
  const staleRationale = [...ids].filter((id) => !byId.has(id));
  assert.deepEqual(staleRationale, [], "근거만 남고 대상이 사라진 id: " + staleRationale.join(", "));
});

test("음성테스트 · 근거 없는 항목을 기준선에 몰래 끼워 넣으면 커버리지 검사가 RED", () => {
  const ids = new Set(Object.keys(baseline.rationale.ids));
  const smuggled = [
    ...baseline.I4_sentenceCompleteness.violations,
    "ebsi_go1_20090917-q99::no-terminal-punctuation@wc=12",
  ];
  const missing = smuggled.filter((e) => !ids.has(idOf(e)));
  assert.deepEqual(
    missing,
    ["ebsi_go1_20090917-q99::no-terminal-punctuation@wc=12"],
    "계기 무력: 근거 없는 항목을 넣었는데 커버리지 검사가 못 잡는다",
  );

  // 총량 래칫도 독립적으로 울려야 한다(두 계기가 서로를 대체하지 않는지 확인).
  assert.ok(
    baseline.limits.maxBaselineEntries + 1 > 116,
    "계기 무력: 항목을 1개 늘려도 래칫 상한 안이라면 래칫이 느슨한 것이다",
  );
});
