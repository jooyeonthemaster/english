// ============================================================================
// AI 추세변화 분석 — 응시 이력 집계(결정론) + 프롬프트/스키마 (26-07-09 대개편 W7)
//
// 두 소스를 하나의 시계열로 통합한다:
//  (a) INTERNAL — ExamSubmission(GRADED) : 자체 생성 시험지 결정론 채점 결과.
//      byType 은 orderSnapshot × LIVE Question.subType 조인으로 산출.
//  (b) EXTERNAL — ExamReportStudent(studentId 귀속) : 외부 시험지 분석(리포트)
//      채점 결과. byType 은 responses × ExamAnalysis.structure(ExamMap) 조인.
//
// 계약:
//  - 집계는 AI 0콜 결정론. 미입력/NEEDS_REVIEW 미확정 = UNKNOWN(정답 승격 금지).
//  - 이중 계산 차단: syncSubmissionToReport 가 만든 브리지 행(ExamReportStudent.
//    examSubmissionId ≠ null)은 EXTERNAL 에서 제외 — 같은 응시가 (a)와 (b)에
//    동시에 잡히는 것을 원천 차단한다.
//  - 행 단위 격리: scoreSummary/structure 해석 실패 행은 조용히 건너뛴다
//    (한 행의 오염이 학생 전체 추세 분석을 죽이지 않는다).
//  - LLM 내러티브는 합니다체 + 제공 수치만 인용(환각 금지). 응시 2회 미만이면
//    "추세 판단에는 응시 데이터가 더 필요합니다" 명시를 프롬프트로 강제한다.
// ============================================================================

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { QUESTION_SUBTYPES, QUESTION_TYPES } from "@/lib/constants";
import {
  parseExamMap,
  parseScoreSummary,
  parseStudentResponses,
} from "@/lib/exam-report/schemas";
import type { ScoreSummary } from "@/lib/exam-report/types";

// ── 계약 타입 ────────────────────────────────────────────────────────────────

/** WorkbenchAiJob.domain 값 — 추세분석 과금 잡 식별자 */
export const EXAM_TREND_JOB_DOMAIN = "EXAM_TREND";

/** 회차 1개 안에서 유형 1개의 정오 집계 */
export interface TrendTypeStat {
  typeLabel: string;
  correct: number;
  total: number;
}

/** 응시(회차) 1건의 결정론 집계 — 시계열 원소이자 examTrendReport.history 저장 계약 */
export interface TrendSitting {
  source: "INTERNAL" | "EXTERNAL";
  /** INTERNAL=ExamSubmission.id / EXTERNAL=ExamReportStudent.id — UI 딥링크용 */
  refId: string;
  /** EXTERNAL 전용 — 부모 ExamAnalysis.id (리포트 워크스페이스 딥링크용). INTERNAL 은 미기록 */
  examAnalysisId?: string;
  title: string;
  /** EXTERNAL 전용 — 시험 종별 라벨(중간고사 등). INTERNAL 은 미기록 */
  examTypeLabel?: string;
  /** ISO 8601 — 정렬 축(오름차순) */
  date: string;
  /** totalScore/maxScore × 100 (소수 1자리) — 만점 미확정이면 null */
  scorePct: number | null;
  correct: number;
  wrong: number;
  partial: number;
  unknown: number;
  byType: TrendTypeStat[];
}

/** LLM 산출 추세 문서 — 라우트가 zod 검증 후 examTrendReport.doc 에 저장 */
export const examTrendDocSchema = z.object({
  /** 종합 추세(상승/하락/정체 — 수치 인용, 합니다체) */
  overall: z.string().min(1),
  /** 약점→강점 전환 추적 — 근거 수치 없는 전환 금지, 없으면 빈 배열 */
  transitions: z
    .array(
      z.object({
        typeLabel: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        evidence: z.string().min(1),
      }),
    )
    .max(12)
    .default([]),
  /** 현재 약점 Top3(최근 회차 기준) — 프롬프트가 최대 3개를 강제 */
  weaknesses: z
    .array(z.object({ typeLabel: z.string().min(1), evidence: z.string().min(1) }))
    .max(8)
    .default([]),
  strengths: z
    .array(z.object({ typeLabel: z.string().min(1), evidence: z.string().min(1) }))
    .max(8)
    .default([]),
  /** 학습 처방 — 유형·수치 근거 포함 문장 배열 */
  prescription: z.array(z.string().min(1)).min(1).max(10),
});

export type ExamTrendDoc = z.infer<typeof examTrendDocSchema>;

/** student_analytics.examTrendReport 저장 계약 */
export interface ExamTrendReportEnvelope {
  doc: ExamTrendDoc;
  /** 생성 시점의 집계 스냅샷 — UI 가 차트/전환 하이라이트를 재계산 없이 그린다 */
  history: TrendSitting[];
  /** 서버 시각(ISO) — 클라이언트 시각 불신 */
  generatedAt: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; calls: number };
}

// ── 유형 라벨 (subType → 한글) ───────────────────────────────────────────────

/** QUESTION_SUBTYPES 평탄화 — 전 26 영어 유형의 subType→한글 라벨 정본 */
const SUBTYPE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of Object.values(QUESTION_SUBTYPES)) {
    for (const item of group) map[item.value] = item.label;
  }
  return map;
})();

const TYPE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of QUESTION_TYPES) map[item.value] = item.label;
  return map;
})();

/** subType 우선 → type 폴백 → "기타" (커스텀/KO 유형은 원문 코드 대신 뭉뚱그림) */
function questionTypeLabel(q: { type: string; subType: string | null } | undefined): string {
  if (!q) return "기타";
  if (q.subType && SUBTYPE_LABELS[q.subType]) return SUBTYPE_LABELS[q.subType];
  return TYPE_LABELS[q.type] ?? "기타";
}

// ── 방어적 파서(문항/행 단위 격리 — 절대 throw 금지) ─────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface OrderSnapshotEntry {
  questionId: string;
  orderNum: number;
}

/** exam_submissions.orderSnapshot([{questionId,orderNum,points}]) 관용 파싱 */
function parseOrderSnapshot(value: unknown): OrderSnapshotEntry[] {
  return asArray(value)
    .map((raw) => {
      const rec = asRecord(raw);
      if (!rec) return null;
      const questionId = asString(rec.questionId).trim();
      if (!questionId) return null;
      const orderNum = typeof rec.orderNum === "number" ? rec.orderNum : 0;
      return { questionId, orderNum };
    })
    .filter((e): e is OrderSnapshotEntry => e != null);
}

interface InternalResponseLite {
  questionId: string;
  autoStatus?: string;
  manualStatus?: string;
}

/** exam_submissions.responses(SubmissionResponse[]) 중 정오 판정에 필요한 최소 투영 */
function parseInternalResponses(value: unknown): InternalResponseLite[] {
  return asArray(value)
    .map((raw): InternalResponseLite | null => {
      const rec = asRecord(raw);
      if (!rec) return null;
      const questionId = asString(rec.questionId).trim();
      if (!questionId) return null;
      const result = asRecord(rec.result);
      return {
        questionId,
        autoStatus: asString(result?.status) || undefined,
        manualStatus: asString(rec.manualStatus) || undefined,
      };
    })
    .filter((r): r is InternalResponseLite => r != null);
}

/**
 * INTERNAL 문항 1개의 확정 정오 — 강사 수동확정(manualStatus) 우선, 다음 자동채점.
 * NEEDS_REVIEW 미확정·미입력·응답 부재는 전부 UNKNOWN(정답 승격 금지 불변식).
 */
function internalStatusOf(
  resp: InternalResponseLite | undefined,
): "CORRECT" | "WRONG" | "PARTIAL" | "UNKNOWN" {
  if (!resp) return "UNKNOWN";
  const manual = resp.manualStatus;
  if (manual === "CORRECT" || manual === "WRONG" || manual === "PARTIAL") return manual;
  const auto = resp.autoStatus;
  if (auto === "CORRECT" || auto === "WRONG" || auto === "PARTIAL") return auto;
  return "UNKNOWN";
}

function toScorePct(summary: ScoreSummary): number | null {
  if (
    summary.totalScore == null ||
    summary.maxScore == null ||
    !(summary.maxScore > 0)
  ) {
    return null;
  }
  return Math.round((summary.totalScore / summary.maxScore) * 1000) / 10;
}

/** 유형별 집계 누산 — 첫 등장 순서 보존(시험지 순서 ≈ 유형 순서) */
function pushTypeStat(map: Map<string, TrendTypeStat>, label: string, isCorrect: boolean): void {
  const stat = map.get(label) ?? { typeLabel: label, correct: 0, total: 0 };
  stat.total += 1;
  if (isCorrect) stat.correct += 1;
  map.set(label, stat);
}

// ── (a) INTERNAL — 자체 시험지 응시(ExamSubmission GRADED) ────────────────────

async function collectInternalSittings(
  studentId: string,
  academyId: string,
): Promise<TrendSitting[]> {
  const submissions = await prisma.examSubmission.findMany({
    where: {
      studentId,
      status: "GRADED",
      exam: { academyId }, // 테넌트 가드 — 학생 soft-link 만 믿지 않는다
    },
    select: {
      id: true,
      gradedAt: true,
      submittedAt: true,
      responses: true,
      scoreSummary: true,
      orderSnapshot: true,
      exam: { select: { title: true, examDate: true, createdAt: true } },
    },
  });
  if (submissions.length === 0) return [];

  // orderSnapshot 전체의 questionId 를 모아 subType 을 1쿼리로 조인(라벨 산출용).
  const questionIds = new Set<string>();
  const parsed = submissions.map((sub) => {
    const snapshot = parseOrderSnapshot(sub.orderSnapshot);
    const responses = parseInternalResponses(sub.responses);
    for (const entry of snapshot) questionIds.add(entry.questionId);
    for (const resp of responses) questionIds.add(resp.questionId);
    return { sub, snapshot, responses };
  });

  const questions =
    questionIds.size > 0
      ? await prisma.question.findMany({
          where: { id: { in: [...questionIds] } },
          select: { id: true, type: true, subType: true },
        })
      : [];
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const sittings: TrendSitting[] = [];
  for (const { sub, snapshot, responses } of parsed) {
    // scoreSummary 는 채점 완료의 증거 — 해석 불가 행은 건너뛴다(행 단위 격리).
    const summary = parseScoreSummary(sub.scoreSummary);
    if (!summary) continue;

    // byType: orderSnapshot(할당 시점 고정)이 전 문항 목록의 정본. 스냅샷이 비면
    // responses 만으로 폴백(구버전 데이터 방어) — total 이 응답 문항 수로 줄어든다.
    const respByQid = new Map(responses.map((r) => [r.questionId, r]));
    const universe: { questionId: string }[] =
      snapshot.length > 0 ? snapshot : responses;
    const typeMap = new Map<string, TrendTypeStat>();
    for (const entry of universe) {
      const label = questionTypeLabel(questionById.get(entry.questionId));
      pushTypeStat(typeMap, label, internalStatusOf(respByQid.get(entry.questionId)) === "CORRECT");
    }

    // 날짜 축: 시험 지정일 → 채점/제출 시각 → 시험 생성일 순 폴백.
    const date =
      sub.exam.examDate ?? sub.gradedAt ?? sub.submittedAt ?? sub.exam.createdAt;

    sittings.push({
      source: "INTERNAL",
      refId: sub.id,
      title: sub.exam.title,
      date: date.toISOString(),
      scorePct: toScorePct(summary),
      correct: summary.correctCount,
      wrong: summary.wrongCount,
      partial: summary.partialCount,
      unknown: summary.unknownCount,
      byType: [...typeMap.values()],
    });
  }
  return sittings;
}

// ── (b) EXTERNAL — 외부 시험지 분석 채점(ExamReportStudent) ───────────────────

const EXAM_TYPE_LABELS: Record<string, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "시험",
};

async function collectExternalSittings(
  studentId: string,
  academyId: string,
): Promise<TrendSitting[]> {
  const rows = await prisma.examReportStudent.findMany({
    where: {
      studentId,
      academyId,
      deletedAt: null,
      // 자체 시험지 채점 브리지 행 제외 — 같은 응시가 INTERNAL 과 이중 계산되는 것 차단.
      examSubmissionId: null,
    },
    select: {
      id: true,
      examAnalysisId: true,
      responses: true,
      scoreSummary: true,
      examAnalysis: {
        select: {
          title: true,
          examType: true,
          createdAt: true,
          deletedAt: true,
          structure: true,
        },
      },
    },
  });

  const sittings: TrendSitting[] = [];
  for (const row of rows) {
    if (row.examAnalysis.deletedAt) continue; // 부모 분석 soft-delete 반영
    const summary = parseScoreSummary(row.scoreSummary);
    if (!summary) continue; // scoreSummary 有 조건 — 채점 전 행 제외

    // byType: structure(ExamMap).questions × responses 를 number 로 조인.
    // structure 부재/해석 실패면 byType 없이 점수만 싣는다(회차 자체는 유효).
    const structure = parseExamMap(row.examAnalysis.structure);
    const responses = parseStudentResponses(row.responses);
    const respByNumber = new Map(responses.map((r) => [r.number, r]));
    const typeMap = new Map<string, TrendTypeStat>();
    if (structure) {
      for (const q of structure.questions) {
        const label = q.typeLabel.trim() || "기타";
        pushTypeStat(typeMap, label, respByNumber.get(q.number)?.status === "CORRECT");
      }
    }

    sittings.push({
      source: "EXTERNAL",
      refId: row.id,
      examAnalysisId: row.examAnalysisId,
      title: row.examAnalysis.title,
      examTypeLabel: EXAM_TYPE_LABELS[row.examAnalysis.examType] ?? "시험",
      date: row.examAnalysis.createdAt.toISOString(),
      scorePct: toScorePct(summary),
      correct: summary.correctCount,
      wrong: summary.wrongCount,
      partial: summary.partialCount,
      unknown: summary.unknownCount,
      byType: [...typeMap.values()],
    });
  }
  return sittings;
}

// ── 공개 API: 통합 시계열 ─────────────────────────────────────────────────────

/**
 * 학생 1명의 채점 완료 응시 이력을 두 소스에서 모아 날짜 오름차순 시계열로 반환한다.
 * academyId 는 호출자(라우트)가 이미 검증한 테넌트 — 여기서도 양쪽 쿼리에 재적용
 * (심층 방어). 이력 0건 판정(400)은 호출자 몫.
 */
export async function aggregateStudentExamHistory(
  studentId: string,
  academyId: string,
): Promise<TrendSitting[]> {
  const [internal, external] = await Promise.all([
    collectInternalSittings(studentId, academyId),
    collectExternalSittings(studentId, academyId),
  ]);
  return [...internal, ...external].sort((a, b) => a.date.localeCompare(b.date));
}

// ── 프롬프트 ─────────────────────────────────────────────────────────────────

/** 프롬프트에 싣는 최대 회차 수 — 초과분은 오래된 회차부터 생략(최근이 판단 축) */
const PROMPT_MAX_SITTINGS = 20;

const TREND_OUTPUT_SPEC = `{
  "overall": "종합 추세 서술 — 상승/하락/정체 판정 + 첫 회차·최근 회차 수치 직접 인용, 3~6문장, 합니다체",
  "transitions": [{ "typeLabel": "어법 판단", "from": "1회차 1/4 정답", "to": "3회차 4/4 정답", "evidence": "전환 판단 근거 서술(회차·수치 실명 인용)" }],
  "weaknesses": [{ "typeLabel": "빈칸 추론", "evidence": "최근 회차 기준 약점 근거(수치 인용)" }],
  "strengths": [{ "typeLabel": "제목 추론", "evidence": "강점 근거(수치 인용)" }],
  "prescription": ["학습 처방 문장(유형 이름·수치 근거 포함)", "…"]
}`;

function formatSitting(sitting: TrendSitting, index: number): string {
  const sourceLabel =
    sitting.source === "INTERNAL"
      ? "자체 시험지"
      : `외부 시험 분석${sitting.examTypeLabel ? ` · ${sitting.examTypeLabel}` : ""}`;
  const pct = sitting.scorePct == null ? "점수율 미확정" : `점수율 ${sitting.scorePct}%`;
  const lines = [
    `[${index + 1}회차] ${sitting.date.slice(0, 10)} · ${sourceLabel} · ${sitting.title}`,
    `  ${pct} (정답 ${sitting.correct} · 오답 ${sitting.wrong} · 부분 ${sitting.partial} · 미확인 ${sitting.unknown})`,
  ];
  if (sitting.byType.length > 0) {
    lines.push(
      `  유형별 정오: ${sitting.byType
        .map((t) => `${t.typeLabel} ${t.correct}/${t.total}`)
        .join(" · ")}`,
    );
  }
  return lines.join("\n");
}

/**
 * S4(report) 계열 1콜용 프롬프트. system 은 정적(캐시 친화), 이력·학생명은 user 에.
 * 환각 금지·합니다체·2회 미만 추세 단정 금지를 시스템 계약으로 강제한다.
 */
export function buildTrendPrompt(
  history: TrendSitting[],
  studentName?: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `당신은 학원에서 학생·학부모 상담에 쓰는 "AI 추세변화 분석"을 작성하는 베테랑 영어 강사입니다. 학생 한 명의 시험 응시 이력(회차별 점수율·유형별 정오 집계)을 근거로 성적 변화의 흐름을 해석합니다.

[톤 계약]
- 독자는 학부모와 학생입니다. 존중하고 성장 지향적인 태도로 씁니다. 학생을 비난하거나 깎아내리는 표현("게으르다", "실력이 없다" 등)은 절대 쓰지 않습니다.
- 모든 출력 필드(overall·transitions·weaknesses·strengths·prescription 전부)는 격식 있는 합니다체("-습니다/-입니다")로 작성합니다. 해요체("-어요/-예요/-죠")와 반말 종결어미는 어느 필드에서도 절대 쓰지 않습니다.
- 하락·약점도 다음 단계로 가는 단서로 해석합니다.

[환각 금지 — 최우선 규칙]
- 아래 [응시 이력]에 제공된 수치만 인용합니다. 제공되지 않은 시험·유형·점수·등수·평균을 지어내는 것은 데이터 위조이므로 절대 금지합니다.
- 모든 판단에는 근거 수치를 붙입니다: 회차(예: 1회차)·시험명·점수율·유형별 정오(예: 어법 판단 1/4 → 4/4)를 실명으로 인용합니다.
- 응시 이력이 2회 미만이면 추세를 단정할 수 없습니다. 이 경우 overall 에 "추세 판단에는 응시 데이터가 더 필요합니다"라는 문장을 반드시 포함하고, transitions 는 빈 배열([])로 둡니다. 1회 데이터만으로 상승/하락을 서술하지 않습니다.
- "미확인" 문항은 채점되지 않은 것입니다. 정답으로도 오답으로도 해석하지 않으며, 미확인이 많은 회차는 그 사실을 명시하고 보수적으로 서술합니다.

[작성 지침]
① overall — 종합 추세: 점수율 시계열을 근거로 상승/하락/정체를 판정하고, 첫 회차와 최근 회차의 수치를 직접 인용해 서술합니다.
② transitions — 약점→강점 전환 추적: 초기 회차에서 정답률이 낮았던 유형이 이후 회차에서 뚜렷이 개선된 경우만 담습니다(예: "1회차에서 오답률이 높았던 어법이 3회차에는 강점으로 전환되었습니다"). from/to 에는 회차와 정오 수치를 그대로 적습니다. 근거 수치가 없는 전환은 담지 않으며, 해당 사례가 없으면 빈 배열로 둡니다.
③ weaknesses — 현재 약점 Top3: 최근 회차를 기준으로 정답률이 낮은 유형을 최대 3개까지, 근거 수치와 함께 담습니다(정답률이 비슷하면 문항 수가 많은 유형을 우선).
④ strengths — 현재 강점: 최근 회차 기준으로 정답률이 안정적으로 높은 유형을 근거 수치와 함께 담습니다.
⑤ prescription — 학습 처방: 위 약점·전환 분석과 직결된 구체 처방을 3~6개 문장으로 담습니다. 각 처방은 유형 이름과 수치 근거를 포함합니다. "꾸준히 노력하면", "기본기를 다지면", "차근차근" 같은 근거 없는 공허한 격려는 금지합니다.

[출력 규격 — 다른 설명 없이 이 JSON 객체 하나만 출력]
${TREND_OUTPUT_SPEC}`;

  const shown = history.slice(-PROMPT_MAX_SITTINGS);
  const omitted = history.length - shown.length;
  const serialized = shown
    .map((sitting, i) => formatSitting(sitting, omitted + i))
    .join("\n");

  const userPrompt = `[학생]
이름: ${studentName?.trim() || "학생"}

[응시 이력 — 날짜 오름차순, 총 ${history.length}회${omitted > 0 ? ` 중 최근 ${shown.length}회만 표시(이전 ${omitted}회 생략)` : ""}]
${serialized || "(없음)"}

응시 이력이 총 ${history.length}회입니다.${history.length < 2 ? " 2회 미만이므로 [환각 금지]의 추세 단정 금지 규칙을 반드시 적용합니다." : ""}
위 데이터만 근거로 [출력 규격] JSON 을 출력하십시오.`;

  return { systemPrompt, userPrompt };
}
