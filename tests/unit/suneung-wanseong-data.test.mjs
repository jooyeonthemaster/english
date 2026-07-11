import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

const passages = readJson("src/data/suneung-wanseong/passages.json");
const problems = readJson("src/data/suneung-wanseong/problems.json");
const links = readJson("src/data/suneung-wanseong/links.json");
const facets = readJson("src/data/suneung-wanseong/facets.json");
const provenance = readJson("src/data/suneung-wanseong/provenance.json");
const linkAudit = readJson("src/data/suneung-wanseong/link-audit.json");
const exams = readJson("src/data/exam-passages-korean/passages.json");

const examIds = new Set(exams.map((passage) => passage.id));
const examById = new Map(exams.map((passage) => [passage.id, passage]));
const requiredAnalysisKeys = [
  "갈래",
  "세부영역",
  "제재",
  "핵심주제",
  "요약",
  "핵심개념",
  "핵심키워드",
  "고유명사_인물_이론",
  "논지전개구조",
  "서술방식",
  "정보구조유형",
  "배경지식영역",
  "난이도",
  "난이도근거",
  "딸린문항유형",
  "출제의도",
  "오답함정유형",
  "연계배경지식",
  "상호텍스트",
  "핵심문장",
  "추출품질",
];
const relationTypes = new Set([
  "주제",
  "제재",
  "핵심개념",
  "논지구조",
  "배경지식",
  "출제유형",
  "관점대립",
]);

function validateAnalysis(analysis, source, allowedQuestions, requireAllQuestions, label) {
  assert.ok(analysis && typeof analysis === "object", `${label}: 분석 없음`);
  assert.deepEqual(
    requiredAnalysisKeys.filter((key) => !(key in analysis)),
    [],
    `${label}: 21필드 누락`,
  );
  assert.ok(["상", "중", "하"].includes(analysis.난이도), `${label}: 난이도 오류`);
  assert.ok(analysis.핵심개념.length > 0, `${label}: 핵심개념 없음`);
  assert.ok(analysis.핵심키워드.length >= 5, `${label}: 핵심키워드 부족`);
  assert.ok(analysis.핵심문장.length >= 2, `${label}: 핵심문장 부족`);
  for (const sentence of analysis.핵심문장) {
    assert.ok(source.includes(sentence), `${label}: 핵심문장이 원문 축자 문자열이 아님`);
  }

  const numbers = analysis.딸린문항유형.map((item) => item.번호);
  assert.equal(new Set(numbers).size, numbers.length, `${label}: 문항번호 중복`);
  for (const number of numbers) {
    assert.ok(allowedQuestions.has(number), `${label}: 범위 밖 문항번호 ${number}`);
  }
  if (requireAllQuestions) {
    assert.deepEqual(
      [...numbers].sort((a, b) => a - b),
      [...allowedQuestions].sort((a, b) => a - b),
      `${label}: 통합 분석 문항번호 누락/추가`,
    );
  }
}

test("2027 수능완성 독서 데이터는 41쪽 전체의 18세트·23본문·85문항을 덮는다", () => {
  assert.equal(passages.length, 18);
  assert.equal(Object.values(problems).flat().length, 85);
  const problemCodes = Object.values(problems).flat().map((problem) => problem.code);
  assert.equal(problemCodes.filter(Boolean).length, 85, "문제 코드 누락");
  assert.equal(new Set(problemCodes).size, 85, "문제 코드 중복");
  assert.equal(
    passages.reduce((sum, passage) => sum + Math.max(1, passage.parts.length), 0),
    23,
  );
  assert.equal(facets.total, 18);
  assert.equal(facets.totalTexts, 23);
  assert.equal(provenance.sourcePageCount, 41);
  assert.equal(provenance.sourcePagesNonEmpty, 41);
  assert.equal(provenance.sourcePagesUnique, 41);
  assert.equal(provenance.passageSetCount, 18);
  assert.equal(provenance.individualTextCount, 23);
  assert.equal(provenance.problemCount, 85);
  assert.equal(provenance.analysisModel, "anthropic/claude-sonnet-5");
  assert.equal(provenance.analysisGenerationModel, "anthropic/claude-sonnet-5");
  assert.equal(provenance.analysisAuditModel, "anthropic/claude-sonnet-5");
  assert.equal(provenance.partAnalysisModel, "anthropic/claude-sonnet-5");
  assert.equal(provenance.linkAuditModel, "anthropic/claude-sonnet-5");
  assert.equal(provenance.analysisPromptVersion, "analysis-v4-split-reviewed");
  assert.equal(provenance.linkPromptVersion, "links-v7");
  assert.equal(
    provenance.sourceSha256,
    "3e955d5613835752f86044ce10343396107b14d5b9158b36460ae81da6532af9",
  );
  const sourcePath = path.join(ROOT, provenance.sourceFile);
  assert.ok(fs.existsSync(sourcePath), "원본 PDF 없음");
  assert.equal(
    createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),
    provenance.sourceSha256,
    "실제 PDF 해시와 provenance 불일치",
  );
  const pageUnion = new Set();
  for (const passage of passages) {
    for (let page = passage.pdfPageFrom; page <= passage.pdfPageTo; page += 1) {
      pageUnion.add(page);
    }
  }
  assert.deepEqual([...pageUnion].sort((a, b) => a - b), Array.from({ length: 41 }, (_, i) => i + 1));

  const textHashes = passages.flatMap((passage) =>
    passage.parts.length
      ? passage.parts.map((part) => createHash("sha256").update(part.text).digest("hex"))
      : [createHash("sha256").update(passage.passageText).digest("hex")],
  );
  assert.equal(textHashes.length, 23);
  assert.equal(new Set(textHashes).size, 23, "23개 본문 중 중복 텍스트가 있음");
});

test("실제 원본 PDF는 41쪽이다", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = new Uint8Array(
    fs.readFileSync(path.join(ROOT, provenance.sourceFile)),
  );
  const document = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
  try {
    assert.equal(document.numPages, 41);
    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
      page.cleanup();
    }
    assert.equal(pageTexts.filter(Boolean).length, 41, "빈 PDF 페이지가 있음");
    assert.equal(new Set(pageTexts).size, 41, "중복 PDF 페이지 텍스트가 있음");
  } finally {
    await document.destroy();
  }
});

test("모든 세트와 (가)/(나) 부분 분석은 21필드·원문·문항 불변식을 만족한다", () => {
  for (const passage of passages) {
    const expectedNumbers = Array.from(
      { length: passage.qTo - passage.qFrom + 1 },
      (_, index) => passage.qFrom + index,
    );
    assert.deepEqual(passage.qNumbers, expectedNumbers, `${passage.id}: qNumbers 불연속`);
    assert.equal(problems[passage.id].length, passage.nProblems, `${passage.id}: 문항 수 불일치`);
    assert.deepEqual(
      problems[passage.id].map((problem) => problem.qNum),
      expectedNumbers,
      `${passage.id}: 원문 문항번호 불일치`,
    );
    for (const problem of problems[passage.id]) {
      assert.equal(problem.choices.length, 5, `${passage.id}/${problem.qNum}: 선지가 5개가 아님`);
      assert.ok(problem.code, `${passage.id}/${problem.qNum}: 문제 코드 없음`);
    }
    assert.ok(passage.pdfPageFrom >= 1 && passage.pdfPageTo <= 41, `${passage.id}: PDF 페이지 오류`);
    assert.ok(passage.pdfPageFrom <= passage.pdfPageTo, `${passage.id}: PDF 페이지 역전`);
    assert.ok(
      passage.printPageFrom <= passage.printPageTo,
      `${passage.id}: 교재 인쇄면 페이지 역전`,
    );

    const allowed = new Set(expectedNumbers);
    validateAnalysis(passage.analysis, passage.passageText, allowed, true, passage.id);

    if (passage.isPaired) {
      assert.equal(passage.parts.length, 2, `${passage.id}: 복합 지문은 두 부분이어야 함`);
      assert.deepEqual(
        passage.parts.map((part) => part.label),
        ["(가)", "(나)"],
        `${passage.id}: 부분 label 오류`,
      );
      for (const part of passage.parts) {
        assert.ok(passage.passageText.includes(part.text), `${passage.id}/${part.label}: 부분 원문 누락`);
        validateAnalysis(part.analysis, part.text, allowed, false, `${passage.id}/${part.label}`);
      }
    } else {
      assert.equal(passage.parts.length, 0, `${passage.id}: 단일 지문에 parts가 있음`);
    }
  }
});

test("모든 연계는 실존 기출·명시 근거·부분 귀속을 가지며 합계가 일치한다", () => {
  let total = 0;
  for (const passage of passages) {
    const items = links[passage.id];
    assert.ok(Array.isArray(items), `${passage.id}: links 배열 없음`);
    assert.equal(passage.linkCount, items.length, `${passage.id}: linkCount 불일치`);
    assert.equal(
      new Set(items.map((link) => link.examPassageId)).size,
      items.length,
      `${passage.id}: 기출 연계 중복`,
    );
    const allowedParts = new Set(passage.isPaired ? ["(가)", "(나)"] : ["전체"]);
    for (const link of items) {
      assert.ok(examIds.has(link.examPassageId), `${passage.id}: 없는 기출 ${link.examPassageId}`);
      assert.ok(["강", "중", "약"].includes(link.strength), `${passage.id}: 강도 오류`);
      assert.ok(Number.isFinite(link.retrievalScore), `${passage.id}: 검색 점수 오류`);
      assert.ok(link.relationTypes.length > 0, `${passage.id}: 연계 축 없음`);
      for (const relation of link.relationTypes) {
        assert.ok(relationTypes.has(relation), `${passage.id}: 알 수 없는 연계 축 ${relation}`);
      }
      assert.ok(link.sourceParts.length > 0, `${passage.id}: sourceParts 없음`);
      for (const part of link.sourceParts) {
        assert.ok(allowedParts.has(part), `${passage.id}: 잘못된 sourceParts ${part}`);
      }
      assert.ok(link.sharedConcepts.length > 0, `${passage.id}: 공통 개념 없음`);
      assert.ok(link.swEvidence.length > 0, `${passage.id}: 수완 축자 근거 없음`);
      assert.ok(link.examEvidence.length > 0, `${passage.id}: 기출 축자 근거 없음`);
      const exam = examById.get(link.examPassageId);
      assert.ok(exam, `${passage.id}: 기출 원문 조인 실패`);
      const sourceParts = passage.parts.length
        ? passage.parts.filter((part) => link.sourceParts.includes(part.label))
        : [{ label: "전체", text: passage.passageText }];
      for (const evidence of link.swEvidence) {
        assert.ok(
          sourceParts.some((part) => part.text.includes(evidence)),
          `${passage.id}/${link.examPassageId}: 수완 evidence가 지정 부분의 축자 문자열이 아님`,
        );
      }
      for (const part of sourceParts) {
        assert.ok(
          link.swEvidence.some((evidence) => part.text.includes(evidence)),
          `${passage.id}/${link.examPassageId}: ${part.label}별 evidence 누락`,
        );
      }
      for (const evidence of link.examEvidence) {
        assert.ok(
          exam.passageText.includes(evidence),
          `${passage.id}/${link.examPassageId}: 기출 evidence가 축자 문자열이 아님`,
        );
      }
      for (const mapping of link.conceptMappings) {
        assert.ok(
          link.swEvidence.some((evidence) => evidence.includes(mapping.swTerm)),
          `${passage.id}/${link.examPassageId}: swTerm이 evidence 안에 없음`,
        );
        assert.ok(
          link.examEvidence.some((evidence) => evidence.includes(mapping.examTerm)),
          `${passage.id}/${link.examPassageId}: examTerm이 evidence 안에 없음`,
        );
      }
      for (const keyword of link.sharedKeywords) {
        assert.ok(
          sourceParts.some((part) => part.text.includes(keyword)) && exam.passageText.includes(keyword),
          `${passage.id}/${link.examPassageId}: 공통 키워드가 양쪽 축자 문자열이 아님`,
        );
      }
      assert.ok(link.rationale.length >= 30, `${passage.id}: 연결 근거가 너무 짧음`);
      assert.ok(link.difference.length >= 20, `${passage.id}: 차이 설명이 너무 짧음`);
      assert.ok(link.studyPoint.length >= 20, `${passage.id}: 학습 포인트가 너무 짧음`);
    }
    total += items.length;
  }
  assert.equal(total, facets.totalLinks);
  assert.equal(total, provenance.linkedExamCount);
  assert.equal(Object.keys(links).length, passages.length);
});

test("연계 감사 아티팩트는 후보 전체와 keep/drop 결정을 보존한다", () => {
  assert.equal(linkAudit.model, provenance.linkAuditModel);
  assert.equal(linkAudit.auditVersion, provenance.auditVersion);
  assert.equal(linkAudit.analysisPromptVersion, provenance.analysisPromptVersion);
  assert.equal(linkAudit.linkPromptVersion, provenance.linkPromptVersion);
  assert.equal(linkAudit.sourceSha256, provenance.sourceSha256);
  const artifactPath = path.join(ROOT, "src/data/suneung-wanseong/link-audit.json");
  assert.equal(
    createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex"),
    provenance.linkAuditSha256,
  );
  const candidateCount = Object.values(linkAudit.candidateUniverse).flat().length;
  assert.equal(candidateCount, provenance.linkCandidateCount);
  for (const passage of passages) {
    const candidateIds = linkAudit.candidateUniverse[passage.id].map(
      (candidate) => candidate.examPassageId,
    );
    const decisions = linkAudit.passages[passage.id].candidates;
    assert.deepEqual(
      [...decisions.map((decision) => decision.examPassageId)].sort(),
      [...candidateIds].sort(),
      `${passage.id}: 후보 keep/drop 우주 불일치`,
    );
    assert.deepEqual(
      decisions.filter((decision) => decision.keep).map((decision) => decision.examPassageId).sort(),
      links[passage.id].map((link) => link.examPassageId).sort(),
      `${passage.id}: keep 결정과 최종 links 불일치`,
    );

    const analysisHash = createHash("sha256")
      .update(
        JSON.stringify({
          id: passage.id,
          qFrom: passage.qFrom,
          qTo: passage.qTo,
          passageText: passage.passageText,
          parts: passage.parts.map((part) => ({ label: part.label, text: part.text })),
          problems: problems[passage.id],
        }),
      )
      .digest("hex");
    const linkHash = createHash("sha256")
      .update(
        JSON.stringify({
          passage: {
            id: passage.id,
            passageText: passage.passageText,
            parts: passage.parts.map((part) => ({ label: part.label, text: part.text })),
          },
          candidates: linkAudit.candidateUniverse[passage.id].map((candidate) => ({
            examPassageId: candidate.examPassageId,
            retrievalScore: candidate.retrievalScore,
            exam: examById.get(candidate.examPassageId)?.passageText ?? null,
          })),
        }),
      )
      .digest("hex");
    const completeHash = createHash("sha256")
      .update(JSON.stringify({ analysis: analysisHash, links: linkHash }))
      .digest("hex");
    assert.equal(provenance.inputHashes[passage.id], completeHash);
  }
});

test("facet 카운트와 키워드는 최종 Sonnet 분석·연계 데이터에서 다시 계산됐다", () => {
  const round = {};
  const subGenre = {};
  const difficulty = {};
  const relationType = {};
  const keywords = {};
  for (const passage of passages) {
    round[String(passage.roundNo)] = (round[String(passage.roundNo)] ?? 0) + 1;
    subGenre[passage.subGenre] = (subGenre[passage.subGenre] ?? 0) + 1;
    difficulty[passage.difficulty] = (difficulty[passage.difficulty] ?? 0) + 1;
    for (const relation of new Set(links[passage.id].flatMap((link) => link.relationTypes))) {
      relationType[relation] = (relationType[relation] ?? 0) + 1;
    }
    for (const keyword of new Set(passage.analysis.핵심키워드)) {
      keywords[keyword] = (keywords[keyword] ?? 0) + 1;
    }
  }
  assert.deepEqual(facets.counts.round, round);
  assert.deepEqual(facets.counts.subGenre, subGenre);
  assert.deepEqual(facets.counts.difficulty, difficulty);
  assert.deepEqual(facets.counts.relationType, relationType);
  assert.deepEqual(
    facets.rounds,
    Object.keys(round).map(Number).sort((a, b) => a - b),
  );
  assert.deepEqual(
    facets.subGenres,
    Object.keys(subGenre).sort((a, b) => a.localeCompare(b, "ko")),
  );
  assert.deepEqual(
    facets.difficulties,
    ["상", "중", "하"].filter((value) => difficulty[value]),
  );
  assert.deepEqual(
    facets.relationTypes,
    [...relationTypes].filter((value) => relationType[value]),
  );
  const expectedTopKeywords = Object.entries(keywords)
    .map(([kw, count]) => ({ kw, count }))
    .sort((a, b) => b.count - a.count || a.kw.localeCompare(b.kw, "ko"))
    .slice(0, 200);
  assert.deepEqual(facets.topKeywords, expectedTopKeywords);
});
