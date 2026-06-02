"use client";

import { ReportPages } from "@/components/workbench/analysis-report/report-pages";
import { RECALL_RECOGNITION_FIXTURE } from "@/lib/passage-report/analysis-report/fixture";
import { safeParseAnalysisReport, type AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import gen07 from "@/lib/passage-report/analysis-report/_samples/gen-07-science.json";
import freshSample from "./_fresh.json";

// 신규 필기 캔버스를 직접 행사하는 rich 샘플 (chunks + layout 의도 포함).
const RICH: AnalysisReport = {
  schemaVersion: 1,
  brand: "ENGLISH READING LAB",
  docNo: "DEV",
  themeId: "veritas-navy",
  passageLayout: "hlc",
  meta: {
    eyebrow: "PRIME PASSAGE ANALYSIS · 심층 지문 분석",
    titleKo: "과학의 두 얼굴: 규칙과 창의",
    titleEn: "Science as a Creative Process",
    category: "비문학 · 설명문",
    theme: "과학철학",
    difficulty: 4,
    solveTime: "3분",
    examTypes: "빈칸·어법·요약",
  },
  sections: [
    {
      kind: "passage",
      sentences: [
        {
          n: 1,
          en: "It is important to recognize that although science is a rule-based procedure, it is very much a creative process.",
          ko: "과학이 규칙에 기반한 절차일 뿐 아니라 매우 창의적인 과정임을 인식하는 것이 중요하다.",
          chunks: [
            { text: "It is important to recognize ", role: "가주어 It", emphasis: "core" },
            { text: "that although science is a rule-based procedure, ", role: "양보절 (although)" },
            { text: "it is very much a creative process.", role: "주절", emphasis: "core" },
          ],
        },
        {
          n: 2,
          en: "A conjecture is a philosophical invention, cooked up rather mystically by the mind through the mental computation we call careful contemplation.",
          ko: "추측은 우리가 신중한 숙고라 부르는 정신적 계산을 통해 마음속에서 다소 신비롭게 만들어진 철학적 발명품이다.",
          chunks: [
            { text: "A conjecture is a philosophical invention, ", role: "주절", emphasis: "core" },
            { text: "cooked up rather mystically by the mind ", role: "과거분사구 (수식)" },
            { text: "through the mental computation ", role: "전치사구" },
            { text: "we call careful contemplation.", role: "관계절" },
          ],
        },
      ],
      keywords: ["recognize", "creative", "conjecture", "computation"],
    },
    {
      kind: "vocabulary",
      rows: [
        { headword: "recognize", pronunciation: "레코그나이즈", meaning: "인식하다, 인정하다" },
        { headword: "procedure", pronunciation: "프로시저", meaning: "절차, 순서" },
        { headword: "creative", pronunciation: "크리에이티브", meaning: "창의적인" },
        { headword: "conjecture", pronunciation: "컨젝처", meaning: "추측, 짐작" },
        { headword: "invention", pronunciation: "인벤션", meaning: "발명, 발명품" },
        { headword: "computation", pronunciation: "컴퓨테이션", meaning: "계산, 연산" },
        { headword: "contemplation", pronunciation: "콘템플레이션", meaning: "사색, 숙고" },
        { headword: "mystically", pronunciation: "미스티컬리", meaning: "신비롭게" },
      ],
    },
    {
      kind: "grammar",
      rows: [
        {
          sentenceNo: 1,
          excerpt: "to recognize",
          point: "가주어-진주어",
          explanation: "맨 앞 It은 뜻이 없는 가주어이고 진짜 주어는 to recognize 이하예요.",
          trap: "It 자리에 That을 넣어 맞는지 묻는 함정 출제 가능",
          layout: { anchorText: "to recognize", band: "interline", priority: 1, lines: ["It = 뜻 없는 가주어", "진주어 = to recognize 이하"] },
        },
        {
          sentenceNo: 1,
          excerpt: "although",
          point: "양보 접속사",
          explanation: "although는 ~이지만의 뜻으로 뒤 주절과 대조를 이뤄요.",
          layout: { anchorText: "although", band: "interline", priority: 2, lines: ["although = ~이지만", "규칙 vs 창의 대조"] },
        },
        {
          sentenceNo: 2,
          excerpt: "cooked up",
          point: "과거분사 (수동)",
          explanation: "발명품은 스스로 요리하는 게 아니라 만들어진 대상이라 수동의 과거분사 cooked를 써요.",
          trap: "cooking up(능동)으로 바꿔 출제하기 쉬움",
          layout: { anchorText: "cooked up", band: "interline", priority: 1, lines: ["invention 을 수식하는 분사", "수동 → cooked (과거분사)"] },
        },
      ],
    },
    {
      kind: "exam-focus",
      rows: [
        {
          sentenceNo: 1,
          type: "빈칸추론",
          asks: "역접 뒤 핵심어",
          strategy: "규칙 절차와 대조되는 빈칸이면 creative 계열이 답. rule-based ↔ creative 대조축을 근거로.",
          layout: { anchorText: "a creative process", band: "rail", priority: 1, lines: ["역접 뒤 핵심: creative", "규칙↔창의 대조축이 근거"] },
        },
        {
          sentenceNo: 2,
          type: "요약",
          asks: "무엇을 통한 발명인가",
          strategy: "추측은 careful contemplation(신중한 숙고)을 통해 만들어진다는 인과를 요약 (A)/(B)에 반영.",
          layout: { anchorText: "careful contemplation", band: "rail", priority: 2, lines: ["숙고 → 추측 생성 인과", "요약문 핵심 연결어"] },
        },
      ],
    },
    {
      kind: "parsing",
      items: [
        {
          sentenceNo: 2,
          en: "A conjecture is a philosophical invention, cooked up rather mystically by the mind through the mental computation we call careful contemplation.",
          parts: [
            { label: "[주절]", text: "A conjecture is a philosophical invention" },
            { label: "[분사구]", text: "cooked up rather mystically by the mind" },
            { label: "[전치사구]", text: "through the mental computation" },
            { label: "[관계절]", text: "(which) we call careful contemplation" },
          ],
          translation: "추측은 … 신중한 숙고라 부르는 정신적 계산을 통해 신비롭게 만들어진 철학적 발명품이다.",
          layout: { anchorText: "through the mental computation", band: "rail", priority: 2 },
        },
      ],
    },
    {
      kind: "structure-map",
      variant: "compare",
      intro: { eyebrow: "INTRO", label: "과학 = 규칙적 절차이자 창의적 과정" },
      branchLabel: "과학의 두 얼굴",
      columns: [
        { titleEn: "RULE-BASED", titleKo: "규칙 기반 (rule-based procedure)", bullets: ["정해진 절차를 따름 (follow procedure)", "검증 가능 (verifiable)"], footer: "객관적 측면" },
        { titleEn: "CREATIVE", titleKo: "창의적 (creative process)", bullets: ["새 추측을 만듦 (cook up conjectures)", "상상력이 필요 (imagination)"], footer: "주관적 측면" },
      ],
      coreDistinction: { eyebrow: "CORE", label: "규칙 vs 창의", detail: "과학은 둘 다 필요해요" },
      conclusion: { eyebrow: "CONCLUSION", text: "★ 과학은 규칙적이면서도 창의적인 과정이다" },
      logicFlow: "규칙 절차 ▶ 창의적 추측 ▶ 검증",
    },
    {
      kind: "summary",
      sentences: ["과학은 규칙에 기반한 절차이지만, 동시에 매우 창의적인 과정이에요.", "추측은 신중한 숙고를 통해 마음속에서 만들어진 철학적 발명품이에요."],
      thesisEn: "Science is both a rule-based procedure and a deeply creative process.",
    },
    {
      kind: "learning-worksheet",
      title: "실전 학습지",
      logicRows: [
        { sentenceNo: 1, functionLabel: "도입 (주제 제시)", keyPoint: "과학은 규칙 기반 절차이자 창의적 과정임을 인식하라" },
        { sentenceNo: 2, functionLabel: "개념 정의", keyPoint: "추측 = 신중한 숙고로 만들어진 철학적 발명품" },
        { sentenceNo: 2, functionLabel: "부연 (비유)", keyPoint: "정신적 계산을 통해 신비롭게 만들어짐" },
      ],
      questions: [],
      hiddenAnswers: true,
    },
  ],
};

// 병적 dense 케이스 — 한 문장에 어법 6 + 구문 4 + 출제 2. 분할 경로를 DOM 에서 검증.
const DENSE_EN =
  "Scientists who study the cosmos have argued that although the universe appears static, it is in fact expanding rapidly, and that this expansion, which was first measured by careful observation, forces us to reconsider everything we believed about space, time, and the eventual fate of all matter.";
const DENSE: AnalysisReport = {
  schemaVersion: 1,
  brand: "ENGLISH READING LAB",
  docNo: "DEV-DENSE",
  themeId: "veritas-navy",
  passageLayout: "hlc",
  meta: { eyebrow: "DENSE STRESS", titleKo: "초고밀도 스트레스 문장", titleEn: "Dense Stress", category: "테스트", theme: "테스트", difficulty: 5, solveTime: "—", examTypes: "—" },
  sections: [
    { kind: "passage", sentences: [{ n: 1, en: DENSE_EN, ko: "우주를 연구하는 과학자들은 우주가 정적으로 보이지만 사실은 빠르게 팽창하고 있으며, 처음 관측으로 측정된 이 팽창이 공간·시간·모든 물질의 궁극적 운명에 대해 우리가 믿어온 모든 것을 다시 생각하게 만든다고 주장해 왔다." }], keywords: ["expanding", "fate"] },
    { kind: "grammar", rows: [
      { sentenceNo: 1, excerpt: "who study the cosmos", point: "관계절", explanation: "who~ 가 Scientists 를 수식해요.", layout: { anchorText: "who study the cosmos", band: "interline", priority: 1, lines: ["who~ = Scientists 수식", "주격 관계대명사"] } },
      { sentenceNo: 1, excerpt: "although the universe appears static", point: "양보절", explanation: "although 는 ~이지만.", layout: { anchorText: "although the universe appears static", band: "interline", priority: 1, lines: ["although = ~이지만", "뒤 주절과 대조"] } },
      { sentenceNo: 1, excerpt: "it is in fact expanding", point: "현재진행", explanation: "be + -ing 현재진행.", layout: { anchorText: "it is in fact expanding", band: "interline", priority: 2, lines: ["be + -ing 현재진행"] } },
      { sentenceNo: 1, excerpt: "which was first measured", point: "수동", explanation: "which = expansion.", layout: { anchorText: "which was first measured", band: "interline", priority: 2, lines: ["which = expansion", "was measured 수동"] } },
      { sentenceNo: 1, excerpt: "forces us to reconsider", point: "5형식", explanation: "force + O + to-V.", trap: "forces→forcing 으로 출제", layout: { anchorText: "forces us to reconsider", band: "interline", priority: 2, lines: ["force + O + to-V", "목적격보어 to부정사"] } },
      { sentenceNo: 1, excerpt: "space, time, and the eventual fate", point: "병렬", explanation: "A, B, and C 병렬.", layout: { anchorText: "space, time, and the eventual fate", band: "interline", priority: 3, lines: ["A, B, and C 병렬"] } },
    ] },
    { kind: "exam-focus", rows: [
      { sentenceNo: 1, type: "빈칸추론", asks: "역접 뒤 핵심", strategy: "역접 in fact 뒤가 핵심. static↔expanding 대조축을 근거로.", layout: { anchorText: "it is in fact expanding rapidly", band: "rail", priority: 1, lines: ["역접 in fact 뒤가 핵심", "static↔expanding 대조"] } },
      { sentenceNo: 1, type: "요약", asks: "결론", strategy: "결론부 the eventual fate 가 요약문 단서.", layout: { anchorText: "the eventual fate of all matter", band: "rail", priority: 2, lines: ["결론부 the eventual fate", "요약문 단서"] } },
    ] },
    { kind: "parsing", items: [
      { sentenceNo: 1, en: DENSE_EN, parts: [{ label: "[주절]", text: "Scientists ... have argued" }, { label: "[that절1]", text: "that although ..., it is expanding" }, { label: "[that절2]", text: "and that this expansion ... forces us to reconsider" }, { label: "[관계절]", text: "which was first measured by careful observation" }], translation: "→ 과학자들은 … 주장해 왔다.", layout: { anchorText: "have argued that", band: "rail", priority: 2 } },
    ] },
  ],
};

export function PassageReportHarness({ sample, layout }: { sample?: string; layout?: string }) {
  const layoutOverride = layout === "legacy" ? "legacy" : null;

  let report: AnalysisReport;
  if (sample === "fresh") {
    const parsed = safeParseAnalysisReport(freshSample);
    report = parsed.ok ? parsed.report : RICH;
  } else if (sample === "fixture") {
    report = { ...RECALL_RECOGNITION_FIXTURE };
  } else if (sample === "dense") {
    report = DENSE;
  } else if (sample === "gen07") {
    const parsed = safeParseAnalysisReport({ schemaVersion: 1, brand: "ENGLISH READING LAB", themeId: "veritas-navy", passageLayout: "hlc", meta: (gen07 as { meta: unknown }).meta, sections: (gen07 as { sections: unknown }).sections });
    report = parsed.ok ? parsed.report : RICH;
  } else {
    report = RICH;
  }
  if (layoutOverride === "legacy") report = { ...report, passageLayout: "legacy" };

  return (
    <div data-testid="report-root" style={{ background: "#e9edf3", padding: "20px", minHeight: "100vh" }}>
      <ReportPages report={report} />
    </div>
  );
}
