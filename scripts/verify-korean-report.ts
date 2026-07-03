/**
 * DETERMINISTIC VERIFICATION — PRIME_KO 국어 지문분석 학습지 (CI-safe, no network).
 *
 * 실제 파이프라인(진짜 zod 스키마·coercion·회복형 오케스트레이터·렌더 flow)을 그대로 돌리되
 * 모델 호출(llmText)만 주입해 결정론적으로 증명한다:
 *   A) 독서 픽스처: 홀리스틱 초안 1콜로 6섹션 완성 → koAnalysisReportSchema 통과,
 *      ko-passage(결정론 원문) 가 맨 앞 + 원문 보존.
 *   B) 문학 픽스처: 문학 전용 2섹션 포함 8섹션 목표. 원문에 없는 허위 인용(evidence)은
 *      coercion 이 행 단위로 버리고 나머지로 통과(근거앵커 게이트).
 *   C) 초안 실패 → 섹션 단위 생성으로 완주(회복형 구조).
 *   D) 체크포인트 재개: 이미 확보된 섹션은 재생성하지 않는다(정확 픽업).
 *   E) 모델 전면 장애 → generateKoAnalysisReportCore ok:false (조용한 강등 없음).
 *   F) 렌더 flow: 전체 보고서를 FlowItem 으로 산출 — 확인 문제 정답이 학생 표면에 없음.
 *   G) 유니온 격리: 영어 파서는 KO 보고서를 거부하고, KO 파서는 영어 보고서를 거부한다.
 *
 * Run: npx tsx scripts/verify-korean-report.ts   (exits non-zero if any proof fails)
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { KO_SAMPLE_PASSAGES } from "../src/lib/korean/fixtures/sample-passages";
import {
  generateKoAnalysisReportCore,
  generateKoAnalysisReportResilient,
  type KoLlmTextFn,
  type KoResilientCheckpoint,
} from "../src/lib/passage-report/analysis-report/ko-resilient-generate";
import {
  koAnalysisReportSchema,
  type KoAnalysisReport,
  type KoAnalysisSection,
} from "../src/lib/passage-report/analysis-report/ko-schema";
import { analysisReportSchema } from "../src/lib/passage-report/analysis-report/schema";
import { koReportTargetKinds, type KoGenSectionKind } from "../src/lib/passage-report/analysis-report/ko-section-prompts";
import { sectionFlowItems } from "../src/components/workbench/analysis-report/report-sections/section-flow";

const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}${detail ? ` :: ${detail}` : ""}`);
    failures.push(name);
  }
}

const reading = KO_SAMPLE_PASSAGES.find((p) => p.id === "reading-soc-credit")!;
const poem = KO_SAMPLE_PASSAGES.find((p) => p.id === "lit-modern-poem-well")!;

// ─── 섹션 mock 빌더 (스키마 강제 형태 — 원문 verbatim 근거 포함) ────────────────
function mockMeta(titleKo: string) {
  return { titleKo, titleEn: "", category: "독서 · 사회", theme: "경제", difficulty: 3, solveTime: "15분", examTypes: "내용 일치 · 추론" };
}
function mockSections(kinds: KoGenSectionKind[], opts: { badEvidence?: boolean } = {}): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const kind of kinds) {
    switch (kind) {
      case "ko-overview":
        out.push({ kind, genre: "독서 — 사회(경제)", genreDetail: "설명문", subjectMatter: "신용 창조", theme: "은행의 신용 창조 원리와 그 위험·조절 장치", commentary: "이 지문은 신용 창조의 원리를 단계적으로 설명해요." });
        break;
      case "ko-paragraph":
        out.push({ kind, unitLabel: "문단", rows: [1, 2, 3, 4, 5].map((n) => ({ no: n, gist: `${n}문단의 핵심 내용 요지예요.` })) });
        break;
      case "ko-concept-vocab":
        out.push({
          kind,
          rows: ["신용 창조", "지급 준비 제도", "뱅크 런", "구성의 오류", "최종 대부자", "도덕적 해이"].map((term) => ({ term, hanja: term === "신용 창조" ? "信用創造" : undefined, meaning: `${term}의 문맥 뜻풀이`, note: "시험 포인트" })),
        });
        break;
      case "ko-structure":
        out.push({ kind, note: "정의 → 원리 → 위험 → 대응 → 조절", rows: [1, 2, 3, 4, 5].map((n) => ({ no: n, functionLabel: `기능${n}`, keyPoint: `${n}문단의 전개상 역할이에요.` })) });
        break;
      case "ko-literary-device":
        out.push({
          kind,
          rows: [
            { device: "은유", evidence: "잠든 별 하나", effect: "우물 물에 비친 별을 통해 순수한 희망을 드러내요." },
            { device: "상징", evidence: "바닥보다 깊은 기다림", effect: "우물이 마르지 않은 이유를 어머니의 헌신으로 상징해요." },
            { device: "시각적 심상", evidence: "언 손으로 줄을 감으며", effect: "어머니의 고단한 새벽 노동을 감각적으로 보여줘요." },
            ...(opts.badEvidence ? [{ device: "설의", evidence: "원문에 존재하지 않는 허위 인용 구절", effect: "이 행은 반려돼야 해요." }] : []),
          ],
        });
        break;
      case "ko-speaker":
        out.push({ kind, rows: [{ target: "화자('나')", role: "회상하는 자식", emotion: "그리움", attitude: "성찰적", evidence: "나는 이제야 안다" }] });
        break;
      case "ko-exam-points":
        out.push({
          kind,
          rows: [
            { slot: "내용 일치", typeId: "KO_RD_FACT", asks: "정보 재진술의 참/거짓", basis: "2문단 지급 준비율 예시", bogiIdea: "" },
            { slot: "<보기> 사례 적용", typeId: "KO_RD_APPLY", asks: "원리의 신규 사례 적용", basis: "3문단 뱅크 런", bogiIdea: "가상 은행 위기 시나리오" },
            { slot: "추론", typeId: "KO_RD_INFER", asks: "미명시 함의 도출", basis: "4문단 최종 대부자 원칙", bogiIdea: "" },
            { slot: "어휘 문맥 의미", typeId: "ko_rd_vocab", asks: "한자어 치환", basis: "1문단 예금 통화", bogiIdea: "" },
          ],
        });
        break;
      case "ko-check-quiz":
        out.push({
          kind,
          questions: [
            { no: 1, format: "OX", prompt: "은행은 예금 전액을 금고에 보관한다.", answer: "X", explanation: "일부만 지급 준비금으로 남겨요." },
            { no: 2, format: "OX", prompt: "신용 창조의 이론적 상한은 무조건 달성된다.", answer: "X" },
            { no: 3, format: "단답", prompt: "다수 예금자가 한꺼번에 인출을 요구해 지급 불능에 빠지는 현상은?", answer: "뱅크 런" },
            { no: 4, format: "단답", prompt: "부실 은행 구제가 유발할 수 있는 문제는?", answer: "도덕적 해이" },
            { no: 5, format: "단답", prompt: "중앙은행이 일시적 유동성 위기 은행에 긴급 자금을 공급하는 기능은?", answer: "최종 대부자 기능" },
          ],
          hiddenAnswers: true,
        });
        break;
    }
  }
  return out;
}

function draftJson(kinds: KoGenSectionKind[], titleKo: string, opts: { badEvidence?: boolean } = {}): string {
  return JSON.stringify({ meta: mockMeta(titleKo), sections: mockSections(kinds, opts) });
}
function sectionJson(kind: KoGenSectionKind, opts: { badEvidence?: boolean } = {}): string {
  return JSON.stringify(mockSections([kind], opts)[0]);
}

async function main() {
  // ── A) 독서: 초안 1콜 완성 ──────────────────────────────────────────────────
  console.log("A) 독서 픽스처 — 홀리스틱 초안 완성");
  {
    const targets = koReportTargetKinds({ koKind: reading.kind });
    check("독서 목표는 문학 전용 섹션 제외 6종", targets.length === 6 && !targets.includes("ko-literary-device"));
    const calls: string[] = [];
    const llm: KoLlmTextFn = async ({ label }) => {
      calls.push(label);
      if (label === "draft") return { text: draftJson(targets, "신용 창조의 원리") };
      return { text: sectionJson(label as KoGenSectionKind) };
    };
    const r = await generateKoAnalysisReportResilient(
      { passageContent: reading.content, koKind: reading.kind },
      { contentHash: "h-a", llmText: llm },
    );
    check("완성(complete)", r.completeness.complete, JSON.stringify(r.completeness));
    check("초안 1콜만 사용", calls.length === 1 && calls[0] === "draft", calls.join(","));
    const parsed = koAnalysisReportSchema.safeParse(r.report);
    check("koAnalysisReportSchema 통과", parsed.success);
    check("subject=KOREAN 판별자", r.report.subject === "KOREAN");
    const first = r.report.sections[0];
    check("ko-passage 가 맨 앞 + 원문 보존", first.kind === "ko-passage" && first.kind === "ko-passage" && (first as { text: string }).text.includes("신용 창조의 출발점은 지급 준비 제도이다"));
  }

  // ── B) 문학: 허위 인용 근거앵커 게이트 ──────────────────────────────────────
  console.log("B) 문학 픽스처 — 문학 전용 섹션 + 허위 인용 반려");
  let literaryReport: KoAnalysisReport | null = null;
  {
    const targets = koReportTargetKinds({ koKind: poem.kind });
    check("문학 목표는 8종", targets.length === 8 && targets.includes("ko-literary-device") && targets.includes("ko-speaker"));
    const llm: KoLlmTextFn = async ({ label }) => {
      if (label === "draft") return { text: draftJson(targets, "겨울 우물", { badEvidence: true }) };
      return { text: sectionJson(label as KoGenSectionKind, { badEvidence: true }) };
    };
    const r = await generateKoAnalysisReportResilient(
      { passageContent: poem.content, koKind: poem.kind },
      { contentHash: "h-b", llmText: llm },
    );
    check("완성(complete)", r.completeness.complete, JSON.stringify(r.completeness));
    const dev = r.report.sections.find((s) => s.kind === "ko-literary-device");
    check("허위 인용 행은 coercion 이 제거 (4→3행)", dev?.kind === "ko-literary-device" && dev.rows.length === 3, JSON.stringify(dev));
    check(
      "남은 근거는 전부 원문 verbatim",
      dev?.kind === "ko-literary-device" && dev.rows.every((row) => poem.content.replace(/\s+/g, " ").includes(row.evidence.replace(/\s+/g, " "))),
    );
    const exam = r.report.sections.find((s) => s.kind === "ko-exam-points");
    check("typeId 는 KO_ 접두 정규화(소문자 입력 → 대문자)", exam?.kind === "ko-exam-points" && exam.rows.some((row) => row.typeId === "KO_RD_VOCAB"));
    literaryReport = r.report;
  }

  // ── C) 초안 실패 → 섹션 단위 완주 ──────────────────────────────────────────
  console.log("C) 초안 실패 — 섹션 단위 생성으로 완주");
  {
    const llm: KoLlmTextFn = async ({ label }) => {
      if (label === "draft") throw new Error("draft down");
      return { text: sectionJson(label as KoGenSectionKind) };
    };
    const r = await generateKoAnalysisReportResilient(
      { passageContent: reading.content, koKind: reading.kind },
      { contentHash: "h-c", llmText: llm },
    );
    check("완성(complete)", r.completeness.complete, JSON.stringify(r.completeness));
    check("섹션 단위 생성 사용", Object.values(r.perSection).some((p) => p?.source === "section-gen"));
  }

  // ── D) 체크포인트 재개 — 확보 섹션은 재생성하지 않음 ─────────────────────────
  console.log("D) 체크포인트 재개 — 정확 픽업");
  {
    const targets = koReportTargetKinds({ koKind: reading.kind });
    const seededKinds: KoGenSectionKind[] = ["ko-overview", "ko-paragraph", "ko-concept-vocab", "ko-structure"];
    const seedSections: Partial<Record<KoGenSectionKind, KoAnalysisSection>> = {};
    for (const k of seededKinds) {
      seedSections[k] = mockSections([k])[0] as unknown as KoAnalysisSection;
    }
    const checkpoint: KoResilientCheckpoint = {
      contentHash: "h-d",
      meta: null,
      sections: seedSections,
      errors: {},
      updatedAt: Date.now(),
    };
    const calls: string[] = [];
    const llm: KoLlmTextFn = async ({ label }) => {
      calls.push(label);
      if (label === "draft") throw new Error("no draft on resume");
      return { text: sectionJson(label as KoGenSectionKind) };
    };
    const r = await generateKoAnalysisReportResilient(
      { passageContent: reading.content, koKind: reading.kind },
      { contentHash: "h-d", checkpoint, llmText: llm },
    );
    check("완성(complete)", r.completeness.complete, JSON.stringify(r.completeness));
    check("초안 생략(절반 이상 확보)", !calls.includes("draft"), calls.join(","));
    check(
      "확보 섹션 재생성 없음 — 누락 2종만 호출",
      calls.every((c) => c === "ko-exam-points" || c === "ko-check-quiz") && calls.length >= 2,
      calls.join(","),
    );
    check("재개 섹션 source=resumed", seededKinds.every((k) => r.perSection[k]?.source === "resumed"));
    const missingTargets = targets.filter((k) => !seededKinds.includes(k));
    check("목표-시드 차집합이 정확히 2종", missingTargets.length === 2);
  }

  // ── E) 모델 전면 장애 — core 는 ok:false (조용한 강등 금지) ──────────────────
  console.log("E) 모델 전면 장애 — core 실패 판정");
  {
    const llm: KoLlmTextFn = async () => {
      throw new Error("model down");
    };
    const r = await generateKoAnalysisReportCore(
      { passageContent: reading.content, koKind: reading.kind },
      { llmText: llm, deadlineAt: Date.now() + 3_000, maxRounds: 1 },
    );
    check("ok:false 강등", !r.ok);
  }

  // ── F) 렌더 flow — 학생 표면에 확인 문제 정답 미노출 ─────────────────────────
  console.log("F) 렌더 flow — 정답 미노출 게이트");
  {
    const report = literaryReport!;
    let html = "";
    report.sections.forEach((section, si) => {
      const items = sectionFlowItems(section as never, si, si + 1);
      html += renderToStaticMarkup(React.createElement(React.Fragment, null, items.map((it, i) => React.createElement("div", { key: `${it.id}-${i}` }, it.node))));
    });
    check("flow 산출 비어있지 않음", html.length > 500);
    check("확인 문제 발문 렌더됨", html.includes("예금 전액을 금고에 보관"));
    check("정답 '최종 대부자 기능'(퀴즈 전용 문자열) 전체 문서 미노출", !html.includes("최종 대부자 기능"));
    const quiz = report.sections.find((s) => s.kind === "ko-check-quiz");
    // 퀴즈 섹션만 단독 렌더 — 학생 표면(hiddenAnswers=true)에 어떤 정답도 없음.
    if (quiz?.kind === "ko-check-quiz") {
      const studentItems = sectionFlowItems(quiz as never, 98, 8);
      const studentHtml = renderToStaticMarkup(React.createElement(React.Fragment, null, studentItems.map((it, i) => React.createElement("div", { key: i }, it.node))));
      check(
        "학생 표면 퀴즈에 정답 문자열 전무",
        quiz.questions.filter((q) => q.format === "단답").every((q) => !studentHtml.includes(q.answer)),
      );
    }
    // 교사 표면(hiddenAnswers=false)에서는 정답이 보인다.
    if (quiz?.kind === "ko-check-quiz") {
      const teacherItems = sectionFlowItems({ ...quiz, hiddenAnswers: false } as never, 99, 9);
      const teacherHtml = renderToStaticMarkup(React.createElement(React.Fragment, null, teacherItems.map((it, i) => React.createElement("div", { key: i }, it.node))));
      check("교사 표면에는 정답 렌더", teacherHtml.includes("뱅크 런") && teacherHtml.includes("교사용"));
    } else {
      check("확인 문제 섹션 존재", false);
    }
  }

  // ── G) 유니온 격리 — 영어↔KO 파서 상호 거부 ────────────────────────────────
  console.log("G) 유니온 격리");
  {
    const koReport = literaryReport!;
    check("영어 파서는 KO 보고서 거부", !analysisReportSchema.safeParse(koReport).success);
    const englishLike = {
      schemaVersion: 1,
      brand: "ENGLISH READING LAB",
      themeId: "black-white",
      meta: { titleKo: "t", titleEn: "t", category: "c", theme: "t", difficulty: 3, solveTime: "3분", examTypes: "주제" },
      sections: [{ kind: "passage", sentences: [{ n: 1, en: "Hello world.", ko: "안녕" }], keywords: [] }],
    };
    check("영어 파서는 영어 보고서 통과(무회귀)", analysisReportSchema.safeParse(englishLike).success);
    check("KO 파서는 영어 보고서 거부", !koAnalysisReportSchema.safeParse(englishLike).success);
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} proof(s) — ${failures.join(" / ")}`);
    process.exit(1);
  }
  console.log("ALL PASS — PRIME_KO 결정론 검증 완료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
