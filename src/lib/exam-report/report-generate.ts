// ============================================================================
// 학생 시험 리포트 — S4 학생 리포트 내러티브 생성 (1콜)
//
// system=buildReportSystemPrompt(analysisDigest) 로 학생 N명 재사용 캐시,
// user=buildReportUserPrompt(확정 수치+결정론 집계+응답+골격+전수 강제 목록).
// 출력은 내러티브 전용(ReportNarrativePayload) — 수치는 서버 결정론 조립
// (report-assemble.ts)이 채운다. 문서 조립·머지는 이 모듈의 책임이 아니므로
// report-assemble 을 import 하지 않는다 — route 가 조립한 skeletonDoc 을
// "데이터"로 받아 발췌·직렬화만 한다(집계·내러티브 단일 소스 정합).
// ============================================================================

import {
  reportNarrativePayloadSchema,
  type ReportNarrativePayload,
  type ReportSection,
  type StudentReportDoc,
} from "./report-schema";
import { normalizeChoiceToken } from "./schemas";
import type {
  ExamAnalysisResult,
  ExamMap,
  ResponseDataLevel,
  ScoreSummary,
  StudentResponse,
} from "./types";
import {
  buildReportAnalysisDigest,
  buildReportSystemPrompt,
  buildReportUserPrompt,
  type ExamReportMeta,
} from "./prompts";
import { callExamReportJson, type ExamReportLlmUsage } from "./llm";

type SectionOf<T extends ReportSection["type"]> = Extract<ReportSection, { type: T }>;

/** skeletonDoc 에서 타입별 섹션을 찾는다(순서 계약 무관하게 type 으로). */
function sectionOf<T extends ReportSection["type"]>(
  doc: StudentReportDoc,
  type: T,
): SectionOf<T> | null {
  const found = doc.sections.find((section) => section.type === type);
  return (found as SectionOf<T> | undefined) ?? null;
}

/** 프롬프트 표기용 수치 — round2 + 후행 0 제거(6.300000000000001 방어). */
function formatNum(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/**
 * 결정론 집계 블록 — route 가 조립한 skeletonDoc 의 수치를 그대로 직렬화한다.
 * 내러티브가 옆에 렌더될 수치와 모순되지 않게, "모델이 본 적 없는 데이터를
 * 해석하는 글"이 되는 구조적 결함을 여기서 끊는다.
 */
function buildAggregatesBlock(doc: StudentReportDoc): string {
  const lines: string[] = [];

  const typePerf = sectionOf(doc, "typePerformance");
  if (typePerf && typePerf.data.rows.length > 0) {
    lines.push("유형별 성취(배점 손실 포함):");
    for (const row of typePerf.data.rows) {
      const loss =
        row.earnedPoints != null
          ? Math.max(0, Math.round((row.points - row.earnedPoints) * 100) / 100)
          : null;
      const earnedNote =
        row.earnedPoints != null
          ? `획득 ${formatNum(row.earnedPoints)}점(손실 ${formatNum(loss ?? 0)}점)`
          : "획득 점수 미확정";
      lines.push(
        `- ${row.typeLabel}: ${row.total}문항(정답 ${row.correct} · 오답 ${row.wrong} · 미확인 ${row.unknown}) / 배점 ${formatNum(row.points)}점 / ${earnedNote}`,
      );
    }
  }

  const matrix = sectionOf(doc, "difficultyMatrix");
  if (matrix) {
    lines.push(
      `아까운 실점(쉬운 문항 오답): ${matrix.data.easyMistakes.join(", ") || "없음"}`,
    );
    lines.push(
      `상위권 시그널(어려운 문항 정답): ${matrix.data.hardWins.join(", ") || "없음"}`,
    );
  }

  const trap = sectionOf(doc, "trapAnalysis");
  if (trap) {
    const total = trap.data.items.length;
    const hits = trap.data.items.filter((item) => item.wasDesignedTrap).length;
    const sample = total < 3 ? " — 표본 부족(단정 금지)" : "";
    lines.push(
      `함정 취약도: ${trap.data.trapSusceptibility}(선지 확인 오답 ${total}건 중 설계 함정 적중 ${hits}건${sample})`,
    );
  }

  const concept = sectionOf(doc, "conceptMap");
  if (concept) {
    const renderRows = (
      rows: { concept: string; relatedNumbers: string[] }[],
    ): string =>
      rows
        .map((row) => `${row.concept}(${row.relatedNumbers.join(",")})`)
        .join(" · ") || "없음";
    lines.push(`약점 개념(오답 기반): ${renderRows(concept.data.weak)}`);
    lines.push(`강점 개념(고난도 정답 기반): ${renderRows(concept.data.strong)}`);
  }

  return lines.length > 0 ? lines.join("\n") : "(집계 없음)";
}

/**
 * 오답/부분점수 문항 골격 — skeletonDoc.wrongDeepDive items 를 단일 소스로 삼아
 * (wrongItems 전수 강제 대상과 1:1), 분석·응답에서 선택 선지·함정 why·서답 원문·
 * 강사 메모를 붙인다. 함정 매칭은 조립과 동일한 normalizeChoiceToken 잣대
 * (원문 등가 비교 이중 잣대 폐기), number 매칭은 조립과 동일한 원문 그대로.
 */
function buildWrongItemSkeleton(opts: {
  analysis: ExamAnalysisResult;
  responses: StudentResponse[];
  skeletonDoc: StudentReportDoc;
}): { skeleton: string; wrongNumbers: string[] } {
  const wrongSection = sectionOf(opts.skeletonDoc, "wrongDeepDive");
  const items = wrongSection?.data.items ?? [];
  if (items.length === 0) {
    return {
      skeleton: "오답/부분점수 문항이 없습니다(전 문항 정답 또는 미채점).",
      wrongNumbers: [],
    };
  }

  const analysisByNumber = new Map(
    opts.analysis.perQuestion.map((item) => [item.number, item]),
  );
  const responseByNumber = new Map(opts.responses.map((r) => [r.number, r]));

  const lines = items.map((item) => {
    const analysisItem = analysisByNumber.get(item.number);
    const response = responseByNumber.get(item.number);
    const chosen = normalizeChoiceToken(response?.chosenChoice);
    const trap =
      chosen != null
        ? analysisItem?.trapDesign?.find(
            (design) => normalizeChoiceToken(design.choice) === chosen,
          )
        : undefined;
    const parts = [
      item.conceptTags.length > 0 ? `개념:${item.conceptTags.join(", ")}` : null,
      response?.chosenChoice ? `선택:${response.chosenChoice}` : null,
      trap ? `설계 함정 적중(${trap.choice}: ${clip(trap.why, 60)})` : null,
      response?.studentAnswer ? `서답:"${clip(response.studentAnswer, 60)}"` : null,
      response?.note ? `강사메모:"${clip(response.note, 40)}"` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" / ");
    const status = response?.status ?? "WRONG";
    return `- ${item.number} [${status}] 유형:${item.typeLabel}${parts ? ` / ${parts}` : ""}`;
  });

  return {
    skeleton: lines.join("\n"),
    wrongNumbers: items.map((item) => item.number),
  };
}

export async function generateStudentReportNarrative(opts: {
  structure: ExamMap;
  analysis: ExamAnalysisResult;
  responses: StudentResponse[];
  scoreSummary: ScoreSummary;
  dataLevel: ResponseDataLevel;
  studentName: string;
  examMeta: ExamReportMeta;
  /** route 가 assembleReportSkeleton 으로 조립한 결정론 골격(집계 직렬화 소스). */
  skeletonDoc: StudentReportDoc;
  deadlineAt: number;
  usage?: ExamReportLlmUsage;
}): Promise<ReportNarrativePayload> {
  const analysisDigest = buildReportAnalysisDigest(opts.structure, opts.analysis, opts.examMeta);
  const aggregates = buildAggregatesBlock(opts.skeletonDoc);
  const { skeleton, wrongNumbers } = buildWrongItemSkeleton({
    analysis: opts.analysis,
    responses: opts.responses,
    skeletonDoc: opts.skeletonDoc,
  });
  // trapWhy 전수 강제 대상 = 조립 trapAnalysis items 그대로. STATUS_ONLY 는
  // 데이터 등급 지침("특정 선지 서술 금지 · 빈 객체")과의 모순을 막기 위해 비운다.
  const trapSection = sectionOf(opts.skeletonDoc, "trapAnalysis");
  const trapNumbers =
    opts.dataLevel === "STATUS_ONLY" || !trapSection
      ? []
      : trapSection.data.items.map((item) => item.number);

  return callExamReportJson({
    stage: "report",
    systemPrompt: buildReportSystemPrompt(analysisDigest),
    userPrompt: buildReportUserPrompt({
      studentName: opts.studentName,
      responses: opts.responses,
      scoreSummary: opts.scoreSummary,
      dataLevel: opts.dataLevel,
      aggregates,
      skeleton,
      wrongNumbers,
      trapNumbers,
    }),
    schema: reportNarrativePayloadSchema,
    deadlineAt: opts.deadlineAt,
    cacheSystem: true,
    usage: opts.usage,
  });
}
