// ============================================================================
// 학생 시험 리포트 — 결정론 리포트 조립 (순수 로직)
//
// 원칙(설계 계약): 모든 수치·집계 data 는 여기서 서버 결정론으로 조립한다.
// AI(S4)는 narrative·정성 필드만 채운다(수치 환각·스키마 비대 원천 차단).
// 이 파일의 함수는 순수해야 한다(I/O·시간·AI 의존 금지).
// ============================================================================

import { normalizeResponses, round2 } from "./grading";
import { normalizeChoiceToken } from "./schemas";
import type {
  ExamAnalysisResult,
  ExamMap,
  QuestionAnalysis,
  ResponseDataLevel,
  ResponseStatus,
  ScoreSummary,
  StudentResponse,
} from "./types";
import type {
  ReportNarrativePayload,
  ReportSection,
  StudentReportDoc,
  TrapSusceptibility,
} from "./report-schema";

const UNANALYZED_TYPE_LABEL = "미분석";
/** FAILED·미분석 문항의 난이도 대체값 */
const FALLBACK_DIFFICULTY = 3 as const;

const SECTION_HEADINGS: Record<ReportSection["type"], string> = {
  scoreOverview: "성적 개요",
  typePerformance: "유형별 성취도",
  difficultyMatrix: "난이도별 결과",
  trapAnalysis: "함정 분석",
  wrongDeepDive: "오답 심층 분석",
  conceptMap: "개념 지도",
  strengthWeakness: "강점과 보완점",
  studyPlan: "학습 계획",
  teacherComment: "선생님 총평",
};

interface AssembleOptions {
  structure: ExamMap;
  analysis: ExamAnalysisResult;
  responses: StudentResponse[];
  scoreSummary: ScoreSummary;
  dataLevel: ResponseDataLevel;
  studentName: string;
  examLabel: string;
  academyName: string;
  dateLabel: string;
}

interface QuestionContext {
  number: string;
  order: number;
  kind: ExamMap["questions"][number]["kind"];
  points: number | null;
  status: ResponseStatus;
  response: StudentResponse;
  analysis: QuestionAnalysis | null;
  /** analysisStatus OK 인 유효 분석의 typeLabel, 아니면 '미분석' */
  typeLabel: string;
  /** 유효 분석 난이도, 아니면 3 */
  difficulty: 1 | 2 | 3 | 4 | 5;
  keyConcepts: string[];
}

function sectionId(type: ReportSection["type"]): string {
  return `sec-${type}`;
}

/** 구조·분석·응답을 문항 단위 컨텍스트로 정렬 병합(order 순). */
function buildContexts(opts: AssembleOptions): QuestionContext[] {
  const responses = normalizeResponses(opts.structure, opts.responses);
  const responseByNumber = new Map(responses.map((r) => [r.number, r]));
  const analysisByNumber = new Map(
    opts.analysis.perQuestion.map((a) => [a.number, a]),
  );

  return [...opts.structure.questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      const response =
        responseByNumber.get(q.number) ??
        ({
          number: q.number,
          status: "UNKNOWN" as const,
          source: "MANUAL" as const,
          reviewed: true,
        } satisfies StudentResponse);
      const rawAnalysis = analysisByNumber.get(q.number) ?? null;
      const validAnalysis =
        rawAnalysis && rawAnalysis.analysisStatus === "OK" ? rawAnalysis : null;
      return {
        number: q.number,
        order: q.order,
        kind: q.kind,
        points: q.points,
        status: response.status,
        response,
        analysis: rawAnalysis,
        typeLabel: validAnalysis?.typeLabel ?? UNANALYZED_TYPE_LABEL,
        difficulty: validAnalysis?.difficulty ?? FALLBACK_DIFFICULTY,
        keyConcepts: validAnalysis?.keyConcepts ?? [],
      };
    });
}

// ── 섹션 조립기 ─────────────────────────────────────────────────────────────

function buildScoreOverview(s: ScoreSummary): ReportSection {
  const graded = s.correctCount + s.wrongCount + s.partialCount;
  const correctRate = graded > 0 ? Math.round((s.correctCount / graded) * 100) : null;
  return {
    id: sectionId("scoreOverview"),
    type: "scoreOverview",
    heading: SECTION_HEADINGS.scoreOverview,
    narrative: "",
    data: {
      score: s.totalScore,
      maxScore: s.maxScore,
      correctRate,
      classAverage: s.classAverage ?? null,
      unknownCount: s.unknownCount,
      // v2 — 정오 분해 카운트(결정론 집계 통과값). 구 문서에는 없어 optional.
      correctCount: s.correctCount,
      wrongCount: s.wrongCount,
      partialCount: s.partialCount,
    },
  };
}

function buildTypePerformance(contexts: QuestionContext[]): ReportSection {
  const groups = new Map<string, QuestionContext[]>();
  for (const ctx of contexts) {
    const bucket = groups.get(ctx.typeLabel);
    if (bucket) bucket.push(ctx);
    else groups.set(ctx.typeLabel, [ctx]);
  }

  const rows = [...groups.entries()].map(([typeLabel, items]) => {
    let correct = 0;
    let wrong = 0;
    let unknown = 0;
    let points = 0;
    let earned = 0;
    let anyGraded = false;
    let measurable = true;
    for (const ctx of items) {
      points += ctx.points ?? 0;
      switch (ctx.status) {
        case "CORRECT":
          correct += 1;
          anyGraded = true;
          if (ctx.points == null) measurable = false;
          else earned += ctx.points;
          break;
        case "WRONG":
          wrong += 1;
          anyGraded = true;
          break;
        case "PARTIAL":
          anyGraded = true;
          earned += ctx.response.earnedPoints ?? 0;
          break;
        default:
          unknown += 1;
      }
    }
    return {
      typeLabel,
      total: items.length,
      correct,
      wrong,
      unknown,
      // 소수 배점 합산 float 잔여(6.300000000000001) 방지 — 저장 시점에 round2 확정.
      points: round2(points),
      earnedPoints: anyGraded && measurable ? round2(earned) : null,
    };
  });

  return {
    id: sectionId("typePerformance"),
    type: "typePerformance",
    heading: SECTION_HEADINGS.typePerformance,
    narrative: "",
    data: { rows },
  };
}

function buildDifficultyMatrix(contexts: QuestionContext[]): ReportSection {
  const cells = contexts.map((ctx) => ({
    number: ctx.number,
    difficulty: ctx.difficulty,
    status: ctx.status,
    points: ctx.points,
  }));
  const easyMistakes = contexts
    .filter((ctx) => ctx.difficulty <= 2 && ctx.status === "WRONG")
    .map((ctx) => ctx.number);
  const hardWins = contexts
    .filter((ctx) => ctx.difficulty >= 4 && ctx.status === "CORRECT")
    .map((ctx) => ctx.number);

  return {
    id: sectionId("difficultyMatrix"),
    type: "difficultyMatrix",
    heading: SECTION_HEADINGS.difficultyMatrix,
    narrative: "",
    data: { cells, easyMistakes, hardWins },
  };
}

function buildTrapAnalysis(contexts: QuestionContext[]): ReportSection {
  const targets = contexts.filter(
    (ctx) =>
      ctx.kind === "MC" &&
      ctx.status === "WRONG" &&
      ctx.response.chosenChoice != null &&
      ctx.response.chosenChoice !== "",
  );

  const items = targets.map((ctx) => {
    const chosen = normalizeChoiceToken(ctx.response.chosenChoice);
    const trapDesign = ctx.analysis?.trapDesign ?? [];
    const wasDesignedTrap = trapDesign.some(
      (t) => chosen != null && normalizeChoiceToken(t.choice) === chosen,
    );
    return {
      number: ctx.number,
      chosenChoice: ctx.response.chosenChoice,
      trapWhy: "",
      wasDesignedTrap,
    };
  });

  let trapSusceptibility: TrapSusceptibility;
  if (items.length < 3) {
    trapSusceptibility = "UNKNOWN";
  } else {
    const hitRate = items.filter((it) => it.wasDesignedTrap).length / items.length;
    trapSusceptibility = hitRate >= 0.6 ? "HIGH" : hitRate >= 0.3 ? "MID" : "LOW";
  }

  return {
    id: sectionId("trapAnalysis"),
    type: "trapAnalysis",
    heading: SECTION_HEADINGS.trapAnalysis,
    narrative: "",
    data: { items, trapSusceptibility },
  };
}

function buildWrongDeepDive(contexts: QuestionContext[]): ReportSection {
  const items = contexts
    .filter((ctx) => ctx.status === "WRONG" || ctx.status === "PARTIAL")
    .map((ctx) => ({
      number: ctx.number,
      typeLabel: ctx.typeLabel,
      whatHappened: "",
      fixPoint: "",
      conceptTags: ctx.keyConcepts,
    }));

  return {
    id: sectionId("wrongDeepDive"),
    type: "wrongDeepDive",
    heading: SECTION_HEADINGS.wrongDeepDive,
    narrative: "",
    data: { items },
  };
}

/** keyConcepts 빈도(문항 단위) → weight(1회 w1/2회 w2/3회+ w3) + relatedNumbers. */
function conceptFrequency(
  entries: { number: string; concepts: string[] }[],
): { concept: string; weight: 1 | 2 | 3; relatedNumbers: string[] }[] {
  const byConcept = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const concept of entry.concepts) {
      const trimmed = concept.trim();
      if (trimmed.length === 0) continue;
      const set = byConcept.get(trimmed) ?? new Set<string>();
      set.add(entry.number);
      byConcept.set(trimmed, set);
    }
  }
  return [...byConcept.entries()].map(([concept, numbers]) => {
    const relatedNumbers = [...numbers];
    const count = relatedNumbers.length;
    const weight: 1 | 2 | 3 = count >= 3 ? 3 : count === 2 ? 2 : 1;
    return { concept, weight, relatedNumbers };
  });
}

function buildConceptMap(contexts: QuestionContext[]): ReportSection {
  const weak = conceptFrequency(
    contexts
      .filter((ctx) => ctx.status === "WRONG")
      .map((ctx) => ({ number: ctx.number, concepts: ctx.keyConcepts })),
  );
  // 같은 개념이 오답·정답 문항 양쪽에 걸치면 '보완 필요'와 '탄탄함'에 동시 등장해
  // 상담 문서가 자기모순이 된다(시각감사 실증) — 오답 신호를 우선해 강점에서 제외.
  const weakConcepts = new Set(weak.map((w) => w.concept));
  const strong = conceptFrequency(
    contexts
      .filter((ctx) => ctx.status === "CORRECT" && ctx.difficulty >= 3)
      .map((ctx) => ({ number: ctx.number, concepts: ctx.keyConcepts })),
  ).filter((s) => !weakConcepts.has(s.concept));

  return {
    id: sectionId("conceptMap"),
    type: "conceptMap",
    heading: SECTION_HEADINGS.conceptMap,
    narrative: "",
    data: { weak, strong },
  };
}

function buildStrengthWeakness(): ReportSection {
  return {
    id: sectionId("strengthWeakness"),
    type: "strengthWeakness",
    heading: SECTION_HEADINGS.strengthWeakness,
    narrative: "",
    data: { strengths: [], weaknesses: [] },
  };
}

function buildStudyPlan(): ReportSection {
  return {
    id: sectionId("studyPlan"),
    type: "studyPlan",
    heading: SECTION_HEADINGS.studyPlan,
    narrative: "",
    data: { weeks: [] },
  };
}

function buildTeacherComment(): ReportSection {
  return {
    id: sectionId("teacherComment"),
    type: "teacherComment",
    heading: SECTION_HEADINGS.teacherComment,
    narrative: "",
    data: { comment: "" },
  };
}

/** 결정론 리포트 골격을 조립한다(9섹션·수치 확정, narrative/정성 필드는 빈 값). */
export function assembleReportSkeleton(opts: AssembleOptions): StudentReportDoc {
  const contexts = buildContexts(opts);
  return {
    version: 1,
    themeId: "indigo-consult",
    cover: {
      templateId: "gradient-band",
      title: "시험 분석 리포트",
      subtitle: opts.examLabel,
      studentName: opts.studentName,
      examLabel: opts.examLabel,
      academyName: opts.academyName,
      dateLabel: opts.dateLabel,
    },
    sections: [
      buildScoreOverview(opts.scoreSummary),
      buildTypePerformance(contexts),
      buildDifficultyMatrix(contexts),
      buildTrapAnalysis(contexts),
      buildWrongDeepDive(contexts),
      buildConceptMap(contexts),
      buildStrengthWeakness(),
      buildStudyPlan(),
      buildTeacherComment(),
    ],
  };
}

/** AI 내러티브 페이로드(S4)를 골격에 머지한다(불변 업데이트).
 *  - narratives → 각 섹션 narrative
 *  - verdictLine → scoreOverview narrative 맨 앞줄로 결합
 *  - trapWhyByNumber / wrongItems → number 매칭 머지(골격에 없는 number 무시) */
export function mergeNarrativeIntoDoc(
  doc: StudentReportDoc,
  payload: ReportNarrativePayload,
): StudentReportDoc {
  const wrongByNumber = new Map(payload.wrongItems.map((w) => [w.number, w]));

  const sections = doc.sections.map((section): ReportSection => {
    switch (section.type) {
      case "scoreOverview": {
        const narrative = [payload.verdictLine, payload.narratives.scoreOverview]
          .filter((line) => line && line.length > 0)
          .join("\n\n");
        return { ...section, narrative };
      }
      case "typePerformance":
        return { ...section, narrative: payload.narratives.typePerformance };
      case "difficultyMatrix":
        return { ...section, narrative: payload.narratives.difficultyMatrix };
      case "trapAnalysis": {
        const items = section.data.items.map((it) => {
          const why = payload.trapWhyByNumber[it.number];
          return why != null ? { ...it, trapWhy: why } : it;
        });
        return {
          ...section,
          narrative: payload.narratives.trapAnalysis,
          data: { ...section.data, items },
        };
      }
      case "wrongDeepDive": {
        const items = section.data.items.map((it) => {
          const w = wrongByNumber.get(it.number);
          return w
            ? { ...it, whatHappened: w.whatHappened, fixPoint: w.fixPoint }
            : it;
        });
        return {
          ...section,
          narrative: payload.narratives.wrongDeepDive,
          data: { ...section.data, items },
        };
      }
      case "conceptMap":
        return { ...section, narrative: payload.narratives.conceptMap };
      case "strengthWeakness":
        return {
          ...section,
          narrative: payload.narratives.strengthWeakness,
          data: { strengths: payload.strengths, weaknesses: payload.weaknesses },
        };
      case "studyPlan":
        return {
          ...section,
          narrative: payload.narratives.studyPlan,
          data: { weeks: payload.studyPlanWeeks },
        };
      case "teacherComment":
        return { ...section, data: { comment: payload.teacherCommentDraft } };
      default:
        return section;
    }
  });

  return { ...doc, sections };
}

/** 재생성 시 강사가 손댄 값을 보존 머지한다.
 *  - themeId·cover·typography 는 prior 것 유지
 *  - 섹션별 hidden 은 prior 것 유지
 *  - teacherComment.comment 는 prior 가 비어있지 않으면 prior 것 유지 */
export function mergePreservedFields(
  newDoc: StudentReportDoc,
  prior: StudentReportDoc,
): StudentReportDoc {
  const priorById = new Map(prior.sections.map((s) => [s.id, s]));

  const sections = newDoc.sections.map((section): ReportSection => {
    const priorSection = priorById.get(section.id);
    const hidden = priorSection ? priorSection.hidden : section.hidden;

    if (section.type === "teacherComment") {
      const priorComment =
        priorSection?.type === "teacherComment" ? priorSection.data.comment : "";
      const comment =
        priorComment && priorComment.trim().length > 0
          ? priorComment
          : section.data.comment;
      return { ...section, hidden, data: { comment } };
    }

    return { ...section, hidden };
  });

  return {
    ...newDoc,
    themeId: prior.themeId,
    cover: prior.cover,
    typography: prior.typography,
    sections,
  };
}
