import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import {
  InsufficientCreditsError,
  refundCredits,
} from "@/lib/credits";
import { hashContent } from "@/lib/passage-utils";
import {
  providerFromModel,
  readAiUsageCost,
  readAiUsageTokens,
  recordPlatformApiUsageCost,
} from "@/lib/platform-api-costs";
import {
  DEFAULT_ANALYSIS_TONE,
  isPartialAnalysisData,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import {
  getPassageAnalysisCreditCost,
  getPassageAnalysisWorksheetCreditCost,
} from "@/lib/passage-analysis-credit-costs";
import { prisma } from "@/lib/prisma";
// [E30 §1-1] 실전 학습지 마커 정본. 이 파일이 "PRIME"·"PRIME_FINAL" 을 리터럴로
// 쓰는 것과 달리 새 마커만 상수 모듈에서 가져오는 이유: 마커 문자열이 두 벌이 되면
// 오타가 tsc 0 을 통과한 채 조판 목록·읽기 합집합에서만 조용히 사라진다.
import {
  PRACTICE_REPORT_MARKER,
  READING_REPORT_MARKER,
} from "@/actions/workbench/passage-constants";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import {
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { preflightCreditGate } from "@/lib/credit-preflight";
import { loadPersistedAnnotations } from "@/app/api/ai/passage-analysis/[passageId]/_lib/annotations";
import { classifyAnalysisError } from "@/app/api/ai/passage-analysis/[passageId]/_lib/error-classification";
import {
  generateLearningWorksheetResilient,
  type AnalysisReportUsage,
} from "@/lib/passage-report/analysis-report/generate";
// [E30 §2-3] 실전(worksheet-grade) 판정 정본 — 코어 lw(logicRows 전용)와 유료 실전
// 콘텐츠를 가르는 술어는 리포 전체에서 이 함수 하나뿐이다(worksheet-core-gate.ts).
// 여기서 술어를 복제하면 「보유 판정」과 「저장 판정」이 조용히 갈린다.
import { hasWorksheetContentFields } from "@/lib/passage-report/analysis-report/worksheet-core-gate";
import {
  defaultLlmText,
  generateAnalysisReportResilient,
  worksheetCoreEngine,
  type ResilientCheckpoint,
} from "@/lib/passage-report/analysis-report/resilient-generate";
import { analysisPhaseLabel, createStreamingLlmText } from "@/lib/passage-report/analysis-report/stream-llm";
import {
  loadPriorCheckpoint,
  persistCheckpoint,
} from "@/lib/passage-report/analysis-report/resilient-checkpoint";
import {
  analysisReportSchema,
  isReadingAnalysisReportShape,
  readingAnalysisSectionSchema,
  type AnalysisReport,
  type GrammarSection,
  type LearningWorksheetSection,
  type ReadingAnalysisSection,
  type VocabularySection,
} from "@/lib/passage-report/analysis-report/schema";
import type { SectionKind } from "@/lib/passage-report/analysis-report/section-prompts";
import {
  buildSeedCheckpoint,
  computePartialAnalysisPlan,
  mergeReportPreservingExtras,
  type PartialAnalysisPlan,
} from "@/lib/passage-report/analysis-report/partial-analysis";
import {
  FULL_ANALYSIS_SECTIONS,
  isSectionKind,
} from "@/lib/studio/module-sections";
import { derivePassageAnalysisFromReport } from "@/lib/passage-report/analysis-report/derive-legacy";
import {
  buildKoPromptInputFromPassage,
  isKoreanPassage,
  saveKoPrimeReport,
} from "@/lib/passage-report/analysis-report/ko-entry";
import {
  generateKoAnalysisReportResilient,
  koDefaultLlmText,
} from "@/lib/passage-report/analysis-report/ko-resilient-generate";
import { generateFinalOnepageReport } from "@/lib/passage-report/analysis-report/final-onepage";
// [reading] 직독직해 분석본 생성기(유닛 U1) — 심볼명 2개가 팬아웃 계약의 고정점이다
// (docs/reading-analysis-worksheet-spec.md §5.2-11 · §7). 결과 형상은 아래
// 「U1 계약 어댑터」가 방어적으로 소화한다.
import {
  generateReadingAnalysisResilient,
  validateReadingDoc,
} from "@/lib/passage-report/analysis-report/reading-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 실전 학습지 포함(includeWorksheet) 시 LLM 3회 호출(기본 1 + 워크북/추론 2)이라
// 기본 분석(180s)보다 여유가 필요하다 — 옵트인 워크시트 라우트와 동일하게 300s.
export const maxDuration = 300;

const requestSchema = z.object({
  passageId: z.string().min(1),
  customPrompt: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  targetLevel: z.string().optional(),
  generationPlan: z.unknown().optional(),
  analysisTone: z.unknown().optional(),
  /** true 면 기본 분석에 이어 실전 학습지(06)까지 한 번에 생성·병합한다 (+5크레딧). */
  includeWorksheet: z.boolean().optional(),
  /**
   * true 면 기본 분석 대신 파이널 원페이지(A4 딱 1장 족집게 시트)만 생성한다 (◈5).
   * 스펙 정본 .tmp-final-qa/final-onepage-spec.md §2 — includeWorksheet·targetSections·
   * 국어 지문과 조합 불가(400). PassageAnalysis 파생은 기록하지 않는다(스펙 F2).
   */
  finalOnepage: z.boolean().optional(),
  /**
   * true 면 기본 분석 대신 직독직해 분석본(전 문장 슬래시 끊어읽기 · 1:1 직독직해 ·
   * 완전해석 · 색상 문법 판서)만 생성한다 (◈5). 스펙 정본
   * docs/reading-analysis-worksheet-spec.md §2 · §5.2-8 — includeWorksheet ·
   * finalOnepage · targetSections · 국어(PRIME_KO) 지문과 조합 불가(400).
   * 파이널과 동형의 자기완결 블록(PRIME_READING upsert)으로 처리되고
   * PassageAnalysis 파생은 기록하지 않는다(기본 분석 캐시 보존).
   */
  readingAnalysis: z.boolean().optional(),
  /**
   * 섹션 종량제(스펙 §3.4.1) — 지정 시 그 섹션만 부분 분석하고 부족분만 과금한다
   * (min(부족 수, 5)크레딧). enum 정본은 FULL_ANALYSIS_SECTIONS(module-sections.ts) —
   * 목록을 여기 재정의하지 않는다. includeWorksheet 와 동시 지정 불가(400).
   * 부재 시 기존 전체 분석과 동일 동작(무회귀).
   */
  targetSections: z
    .array(z.enum(FULL_ANALYSIS_SECTIONS as unknown as [SectionKind, ...SectionKind[]]))
    .min(1)
    .optional(),
  /**
   * 부분 분석을 발사한 스튜디오 모듈 카드(§3.4.1-11) — 잡 config 에만 기록되고
   * 스튜디오 카드 "분석 중" 표시가 이 카드 하나로 좁혀진다. 생성·과금 로직 무관여.
   */
  sourceModule: z.string().max(32).optional(),
  /**
   * true 면 응답을 SSE 로 바꿔 생성 중 사고/본문 델타를 흘린다(문제 생성 md-stream
   * 과 동일한 로딩 카드 미리보기). 생성·과금·저장 로직은 완전히 동일하고, 마지막에
   * 같은 JSON 페이로드를 {t:"done"} 프레임으로 싣는다. 미지정이면 기존 JSON 응답.
   */
  stream: z.boolean().optional(),
});

function getAnalysisGenerationPlan(value: unknown): QuestionGenerationPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._generationPlan;
  return raw === "PREMIUM" || raw === "STANDARD" ? raw : null;
}

function getAnalysisTone(value: unknown): AnalysisTone | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._analysisTone;
  return typeof raw === "string" ? normalizeAnalysisTone(raw) : null;
}

function shouldUseCachedAnalysis(
  cached: unknown,
  requestedPlan: QuestionGenerationPlan,
  requestedTone: AnalysisTone,
): boolean {
  // 부분 분석 마커(§3.4.1-7): 분석 섹션 6종 미만인 파생 캐시는 "완료"가 아니다 —
  // 부분 분석 뒤 전액 전체 분석 요청이 캐시 완료로 오탐되는 구멍 봉쇄. 판정은 공용 헬퍼
  // (3벌 복제본 전부 동일 적용 — 검수 M2). 마커 없는 기존 데이터는 기존 판정 그대로.
  if (isPartialAnalysisData(cached)) return false;
  const cachedPlan = getAnalysisGenerationPlan(cached);
  const cachedTone = getAnalysisTone(cached);
  if (cachedTone && cachedTone !== requestedTone) return false;
  if (!cachedTone && requestedTone !== DEFAULT_ANALYSIS_TONE) return false;
  if (requestedPlan === "PREMIUM") return cachedPlan === "PREMIUM";
  return true;
}

async function recordCostSafely(input: {
  sourceKey: string;
  sourceId: string;
  sourceDetail: string;
  academyId: string;
  provider: ReturnType<typeof providerFromModel>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** OpenRouter 실측 청구액 합(USD) — 있으면 RECORDED 단가로 기록. */
  recordedCostUsd?: number | null;
  usageAt: Date;
  metadata: Record<string, unknown>;
}) {
  try {
    await recordPlatformApiUsageCost({
      sourceKey: input.sourceKey,
      sourceType: "WORKBENCH_AI_JOB",
      sourceId: input.sourceId,
      sourceDetail: input.sourceDetail,
      academyId: input.academyId,
      provider: input.provider,
      model: input.model,
      operationType: "PASSAGE_ANALYSIS",
      unitType: "TOKENS",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      recordedCostUsd: input.recordedCostUsd,
      usageAt: input.usageAt,
      metadata: input.metadata as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("[workbench-fast-analysis] Failed to record API cost", error);
  }
}

/** 스트리밍 미리보기 프레임 싱크 — 비스트리밍 모드에서는 no-op 이 들어온다. */
type StreamEmit = (event: Record<string, unknown>) => void;
const NOOP_EMIT: StreamEmit = () => {};

// ── [E30/RCA #16] 잡 생성 이전 조기 종료의 거절 계기 ────────────────────────
//
// 이 라우트는 workbenchAiJob.create 에 닿기 **전에** 10곳에서 되돌아가는데, 그
// 전부가 DB 에 한 줄도 남기지 않았다. 과금도 없으니 회계 흔적조차 없다. 그래서
// 「파이널이 실패한다」와 「파이널을 아무도 안 쓴다」를 가를 데이터가 리포 어디에도
// 존재하지 않았다 — 1618학원 RCA(§RC-3)의 결론이 정확히 이것이고, "잡 6건 전부
// 성공"이라는 1차 증거는 성공률이 아니라 **생존자 표본**이었다.
//
// 구조화 1줄이면 다음 신고는 추측이 아니라 조회가 된다(Vercel 로그 grep).
// ⚠ 계기는 반드시 **덧붙이기**여야 한다 — 게이트의 조건식·상태코드·응답 자구는
//   한 글자도 바꾸지 않는다(E30 §2-3 「조합 400 게이트 3종 무개변」). 계기가 제품
//   동작을 바꾸는 순간 그것은 계기가 아니라 새 결함이다.
// ⚠ 로깅 자체가 본 경로를 죽이면 안 되므로 통째로 try 로 감싼다(직렬화 불가 값이
//   섞여도 요청은 계속돼야 한다).
function logAnalysisRejection(input: {
  /** grep 키 — 값은 안정적이어야 한다(집계 축). */
  reasonCode: string;
  status: number;
  academyId?: string | null;
  passageId?: string | null;
  /** 사용자가 **무엇을 만들려 했는가**. 이것이 없으면 상품별 실패율을 못 센다. */
  requestedProduct?: SheetProductKey | null;
  detail?: Record<string, unknown>;
}) {
  try {
    console.warn(
      `[workbench-fast-analysis][reject] ${JSON.stringify({
        reasonCode: input.reasonCode,
        status: input.status,
        academyId: input.academyId ?? null,
        passageId: input.passageId ?? null,
        requestedProduct: input.requestedProduct ?? null,
        ...(input.detail ?? {}),
      })}`,
    );
  } catch {
    /* 계기 실패는 삼킨다 — 요청 처리보다 우선할 수 없다. */
  }
}

// ── [E30/RCA #18] 파이널 생성기 진단을 잡 result 로 끌어올린다 ──────────────
//
// RCA §0-E 는 「수리(repair) 루프가 프로덕션에서 실제로 발화했다」를
// `generationMs = 215,568ms > 콜 1회 상한 200,000ms` 라는 **간접 추론**으로만
// 알아냈다. 그건 계기가 아니라 운이다. 시도 횟수와 앵커 드롭 수가 잡 result 에
// 있었으면 한 줄 질의로 끝났다.
//
// ⚠ 지금 generateFinalOnepageReport 는 attempts·앵커 드롭 수를 **반환하지 않는다**
//   (GenerateFinalOnepageResult = { ok, report, raw, usage } — final-onepage.ts).
//   그 파일은 이 유닛의 소유가 아니라 시그니처를 넓힐 수 없으므로, 여기서는
//   **있으면 싣고 없으면 키를 빼는** 방어적 독자로 둔다. 생성기가 아래 키를 노출하는
//   순간 이 라우트는 **코드 변경 0으로** 기록을 시작한다.
//   기대 키: attempts:number · anchorDropped:number · droppedAnchors:string[]
function finalGenerationDiagnostics(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof r.attempts === "number") out.attempts = r.attempts;
  if (typeof r.anchorDropped === "number") out.anchorDropped = r.anchorDropped;
  if (Array.isArray(r.droppedAnchors)) {
    // 앵커 문자열이 길 수 있어 상한을 둔다 — result 는 잡 행에 통째로 저장된다.
    out.droppedAnchors = r.droppedAnchors.slice(0, 20);
  }
  return out;
}

// ── [reading] U1 계약 어댑터 ────────────────────────────────────────────────
//
// 직독직해 분석본 생성기(reading-analysis.ts)는 이 라우트와 **병렬 유닛(U1)** 으로
// 작성됐다(스펙 §7 팬아웃 — 파일 소유가 다르다). 팬아웃 계약이 고정한 것은
// 심볼명 2개(generateReadingAnalysisResilient · validateReadingDoc)와 「final-onepage
// 패턴 + 검증 게이트 + 수리 1회」라는 구조뿐, 결과 타입의 정확한 형상은 아니다.
// 그래서 결과는 파이널의 ok 판별 유니언({ok,report,usage})을 1순위로 기대하되,
// 회복형 선례({usages:[…]}·bare doc 반환)까지 **구조 독자**로 소화한다 —
// finalGenerationDiagnostics 와 같은 원칙: U1 이 키를 노출하면 코드 변경 0으로 합류.
// ⚠ U1 시그니처 확정 후 이 어댑터를 직접 타입 의존으로 조여도 동작은 동일하다.

/** ok:false 만 명시 실패로 읽는다 — ok 미노출 형상은 report/doc 실존 여부로 판정. */
function readingResultFailed(result: unknown): boolean {
  return (
    !!result && typeof result === "object" && (result as Record<string, unknown>).ok === false
  );
}

function readingResultError(result: unknown): string {
  if (result && typeof result === "object") {
    const e = (result as Record<string, unknown>).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return "unknown reading generation failure";
}

/** LLM 호출 usage 이벤트 추출 — usages(복수·회복형) 우선, usage(단수·파이널형) 폴백. */
function readingUsageEvents(result: unknown): AnalysisReportUsage[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  const rawList = Array.isArray(r.usages) ? r.usages : r.usage ? [r.usage] : [];
  return rawList.filter(
    (u): u is AnalysisReportUsage =>
      !!u && typeof u === "object" && "usage" in (u as Record<string, unknown>),
  );
}

/**
 * 생성 결과 → AnalysisReport(전면 문서 껍데기) 복원.
 * ① report(AnalysisReport 전체, 파이널형)를 1순위로 파스한다.
 * ② bare 문서(doc/section 키 또는 결과 자체가 §3 ReadingAnalysisDoc)면 문서 껍데기로
 *    래핑한다 — meta 는 doc.header 에서만 파생(창작 금지 C5: header 밖 사실을 만들지
 *    않는다. difficulty 등 meta 표는 reading 전면 문서에서 렌더되지 않는 chrome 이다).
 * [F1-M8] titleKo 는 **한국어 축**이다 — doc.header.title(영어 원제일 수 있음)을 그대로
 * 넣으면 행 title(:1569 저장, 지문 관리 목록의 비교 대상)이 영어로 갈린다. 그래서
 * fallbackTitle(지문 관리 목록 제목) 우선 → parts[0].titleKo(한국어 소제목) → header.title
 * 순으로 낙하한다. titleEn 은 doc.header.title 유지.
 * 복원 실패는 null — 호출부가 환불+FAILED 로 크게 실패시킨다(무음 출하 금지).
 */
function extractReadingReport(
  result: unknown,
  fallbackBrand?: string,
  fallbackTitle?: string,
): AnalysisReport | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (r.report) {
    const parsedReport = analysisReportSchema.safeParse(r.report);
    if (parsedReport.success && isReadingAnalysisReportShape(parsedReport.data)) {
      return parsedReport.data;
    }
  }
  const bareRaw =
    r.doc ??
    r.section ??
    (r.kind === "reading-analysis" || (r.header && r.sentences) ? r : null);
  // §3 인터페이스 원문에는 kind 가 없다(U0 이 섹션 타입으로 통합하며 부여) —
  // kindless bare doc 도 주입해 살린다.
  const bare =
    bareRaw && typeof bareRaw === "object" && !("kind" in (bareRaw as Record<string, unknown>))
      ? { ...(bareRaw as Record<string, unknown>), kind: "reading-analysis" }
      : bareRaw;
  const parsedDoc = readingAnalysisSectionSchema.safeParse(bare);
  if (!parsedDoc.success) return null;
  const doc = parsedDoc.data;
  const wrapped = analysisReportSchema.safeParse({
    ...(fallbackBrand ? { brand: fallbackBrand } : {}),
    meta: {
      eyebrow: "READING ANALYSIS · 직독직해 분석본",
      // [F1-M8] 한국어 축 우선순위 — 위 doc 주석 참조. `||` 사용: 빈 문자열도 낙하시킨다.
      titleKo: fallbackTitle?.trim() || doc.parts[0]?.titleKo || doc.header.title,
      titleEn: doc.header.title,
      category: "직독직해 분석본",
      theme: doc.header.curriculumBadge,
      difficulty: 3,
      solveTime: "—",
      examTypes: "직독직해·구문",
    },
    sections: [doc],
  });
  return wrapped.success ? wrapped.data : null;
}

// ── [F1-M1] PRIME 보고서 → primeContext(string) 증류 ────────────────────────
//
// U1 입력 계약(reading-analysis.ts ReadingAnalysisPromptInput:268)은
// `primeContext?: string` 이다. 구판은 primeReport(AnalysisReport 객체) 키로 넘겨
// U1 이 한 글자도 읽지 못했다 — 프롬프트의 primeBlock 이 항상 빈 채 나가 「기존
// 심층 분석 컨텍스트」 기능이 무음 무효였다. 여기서 vocabulary(표제어·뜻)와
// grammar(어법 코드·포인트·해설 요약)만 간결한 문자열로 증류해 넘긴다.
// 총 2000자 내 절단 — 주석·하이라이트 품질 컨텍스트일 뿐 축자 계약(C1)과 무관하므로
// 손실 절단이 안전하다(U1 프롬프트도 「참고」로만 쓴다고 명시).
const PRIME_CONTEXT_MAX_CHARS = 2000;

function distillPrimeContext(report: AnalysisReport): string | null {
  const blocks: string[] = [];
  const vocab = report.sections.find(
    (s): s is VocabularySection => s.kind === "vocabulary",
  );
  if (vocab && vocab.rows.length > 0) {
    const entries = vocab.rows
      .map((r) => `${r.headword.trim()}: ${r.meaning.trim()}`)
      .filter((e) => e !== ": ");
    if (entries.length > 0) blocks.push(`[핵심 어휘] ${entries.join(" · ")}`);
  }
  const grammar = report.sections.find(
    (s): s is GrammarSection => s.kind === "grammar",
  );
  if (grammar && grammar.rows.length > 0) {
    const entries = grammar.rows.map((r) => {
      const no = typeof r.sentenceNo === "number" ? `#${r.sentenceNo} ` : "";
      const code = r.pointCode ? `(${r.pointCode}) ` : "";
      // 해설은 앞머리 80자만 — 4단계 풀 해설은 컨텍스트 예산 낭비다(요약 취지).
      const expl = r.explanation.replace(/\s+/g, " ").trim().slice(0, 80);
      return `${no}${code}${r.point.trim()}${expl ? ` — ${expl}` : ""}`;
    });
    blocks.push(`[어법 포인트]\n${entries.join("\n")}`);
  }
  if (blocks.length === 0) return null;
  const joined = blocks.join("\n");
  return joined.length > PRIME_CONTEXT_MAX_CHARS
    ? joined.slice(0, PRIME_CONTEXT_MAX_CHARS)
    : joined;
}

/** validateReadingDoc 판정 독자 — boolean / {ok|valid,issues} / 이슈 배열 전부 소화. */
function readingGateVerdict(verdict: unknown): { pass: boolean; detail: string } {
  if (typeof verdict === "boolean") {
    return { pass: verdict, detail: verdict ? "" : "validateReadingDoc → false" };
  }
  if (Array.isArray(verdict)) {
    // 이슈 배열 형상 — gate-schema.mjs 기준 critical/major 만 차단(minor 는 통과).
    // severity 미표기 항목은 차단으로 센다(관대 판정이 더 위험).
    const blocking = verdict.filter((i) => {
      const s = (i as { severity?: unknown } | null)?.severity;
      return s !== "minor";
    });
    return {
      pass: blocking.length === 0,
      detail: blocking.length > 0 ? JSON.stringify(blocking.slice(0, 5)).slice(0, 800) : "",
    };
  }
  if (verdict && typeof verdict === "object") {
    const o = verdict as Record<string, unknown>;
    const flag =
      typeof o.ok === "boolean" ? o.ok : typeof o.valid === "boolean" ? o.valid : null;
    if (flag !== null) {
      const issues = Array.isArray(o.issues) ? o.issues.slice(0, 5) : o;
      return { pass: flag, detail: flag ? "" : JSON.stringify(issues).slice(0, 800) };
    }
  }
  // 미상 형상 — 생성기 내부 게이트(검증 + 수리 1회, 스펙 §5.2-11)가 이미 돌았으므로
  // fail-open 하되 크게 남긴다. 여기서 fail-closed 하면 형상 불일치 하나로 reading
  // 전 요청이 502 가 된다(게이트 오탐은 게이트를 고친다 — seo-core-axis 검수 원칙).
  console.warn(
    "[workbench-fast-analysis] validateReadingDoc verdict shape unrecognized:",
    typeof verdict,
  );
  return { pass: true, detail: "unrecognized-verdict-shape" };
}

/** [reading] 잡 result 진단 — finalGenerationDiagnostics 동형의 「있으면 싣는」 독자.
 *  [F1-5] 구판은 U1 이 노출하지 않는 키(attempts/rounds/repaired)만 읽어 실패 시 {} 였다
 *  — U1 실제 노출 키(GenerateReadingAnalysisResult: issues·usages·parsed)로 교체.
 *  실패 경로(section=null)는 parsed(게이트 직전 문서)에서 문장/파트 수를 폴백 추출한다. */
function readingGenerationDiagnostics(
  result: unknown,
  section: ReadingAnalysisSection | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    // ok:true 의 잔여 minor 이슈 수 — 밀도 초과 등 계측용(reading-analysis.ts issues).
    if (Array.isArray(r.issues)) out.issuesCount = r.issues.length;
    // LLM 콜 수(세그먼트 + 수리 포함) — usages 는 실패 결과에도 실린다.
    if (Array.isArray(r.usages)) out.calls = r.usages.length;
  }
  if (section) {
    out.sentenceCount = section.sentences.length;
    out.partCount = section.parts.length;
  } else if (result && typeof result === "object") {
    // 실패 경로 폴백 — ok:false 의 parsed(스키마/게이트 직전 산출물)에서 규모만 추출.
    const parsed = (result as Record<string, unknown>).parsed;
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      if (Array.isArray(p.sentences)) out.sentenceCount = p.sentences.length;
      if (Array.isArray(p.parts)) out.partCount = p.parts.length;
    }
  }
  return out;
}

// ── [E29-2] 잡 config → 학습지 상품 ─────────────────────────────────────────
// 활성 잡이 **무엇을 만드는 중인지**를 되찾는 유일한 수단이다(잡 테이블에 상품
// 컬럼이 없다 — 표식은 전부 config 안에 산다). 판정 순서는 fast 라우트의 게이트
// 순서와 같아야 한다: finalOnepage → readingAnalysis → targetSections →
// includeWorksheet → 기본.
// worksheetOnly 라우트가 만든 잡은 `{includeWorksheet:true, worksheetOnly:true}`
// 라 practice 로 떨어진다 — 그 잡이 도는 동안 실전 재요청을 붙이는 것은 옳다.
type SheetProductKey = "basic" | "practice" | "final" | "reading" | "partial";

const PRODUCT_LABEL: Record<SheetProductKey, string> = {
  basic: "기본 학습지",
  practice: "실전 학습지",
  final: "파이널 원페이지",
  reading: "직독직해 분석본",
  partial: "부분 분석",
};

/** 라벨 + 목적격 조사(을/를) — 「분석본를」 같은 비문 방지. 받침 유무로 판정하고
 *  한글이 아니면 기존 자구(를) 유지. 클라이언트는 code 로만 분기한다(자구 계약 아님). */
function withObjectJosa(label: string): string {
  const last = label.charCodeAt(label.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  const hasJongseong = isHangul && (last - 0xac00) % 28 !== 0;
  return `${label}${hasJongseong ? "을" : "를"}`;
}

function productOfJobConfig(config: unknown): SheetProductKey {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return "basic";
  }
  const c = config as Record<string, unknown>;
  if (c.finalOnepage === true) return "final";
  // [reading] finalOnepage 검사와 대칭 위치(요청측 requestedProduct 역산과 같은 순서).
  // 기존 3상품(+partial) 역산 결과는 **1비트도 안 바뀐다** — 증명:
  // ① 이 커밋 이전의 어떤 잡 config 에도 readingAnalysis 키가 실린 적이 없다(키는
  //    이 라우트의 잡 create 만 쓰고, true 일 때만 싣는다). 키 부재 → 이 줄은 항상
  //    거짓 → 아래 기존 판정으로 그대로 낙하한다.
  // ② 새 잡에서도 readingAnalysis 는 finalOnepage·targetSections·includeWorksheet
  //    와 조합 400(아래 게이트 3종 + sheetPromptFlags 1키 보장)이라, 이 줄이 참인
  //    config 에서는 기존 세 판정이 어차피 전부 거짓이다 — 순서를 어디 두든 결과가
  //    같지만, 게이트 순서와의 일치 규약을 지켜 final 바로 뒤에 둔다.
  if (c.readingAnalysis === true) return "reading";
  if (Array.isArray(c.targetSections) && c.targetSections.length > 0) {
    return "partial";
  }
  if (c.includeWorksheet === true) return "practice";
  return "basic";
}

/**
 * SSE 래퍼 — 본체(runAnalysis)는 기존 그대로 NextResponse 를 반환하고, 여기서
 * 그 최종 JSON 을 {t:"done"|"error"} 프레임으로 옮긴다. 본체의 12개 return 지점을
 * 하나도 건드리지 않아 비스트리밍 경로는 바이트 동일하게 유지된다.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.json().catch(() => ({}));
  const wantStream = (rawBody as { stream?: unknown })?.stream === true;
  if (!wantStream) return runAnalysis(req, rawBody, NOOP_EMIT);

  const encoder = new TextEncoder();
  // ⚠ closed·heartbeat 는 **start 밖**에 산다 — cancel(클라이언트 이탈)에서
  //   타이머를 즉시 접어야 하는데 start 스코프 지역변수는 cancel 이 못 본다.
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: StreamEmit = (payload) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // 클라이언트 이탈 — 이후 프레임은 버리되 생성·과금·저장은 계속한다.
          closed = true;
        }
      };
      // 개통 즉시 주석 프레임 — 프록시/런타임 초기 버퍼링을 뚫는다.
      try {
        controller.enqueue(encoder.encode(": open\n\n"));
      } catch {
        closed = true;
      }

      // ── [E29-1] 하트비트 — 「무음 스트림」이 실패로 오판되는 것을 막는다 ─────
      //
      // 파이널 원페이지 경로는 phase 프레임을 **정확히 2개**만 쓴다(생성 직전·저장
      // 직전). 그 사이의 단일 LLM 콜은 스트리밍 주입 구멍 자체가 없어
      // (generateFinalOnepageReport 의 옵션은 { deadlineAt } 뿐) **실측 47~216초
      // 동안 바이트를 0개** 쓴다. 기본/실전 경로도 parallel 엔진이라 웨이브 라벨을
      // 쏟은 뒤 무음이고, 실측 209~285초로 더 길다.
      //
      // 그 무음 구간에 연결이 끊기면(프록시·모바일 전환·절전) 클라이언트는
      // done 프레임을 못 받고 「분석 스트림이 중간에 끊겼습니다」를 **종결 실패**로
      // 못박는다(use-passage-queue.ts consumeAnalysisStream). 서버는 그동안
      // 정상적으로 저장을 끝내므로 결과는 「돈은 나갔고 DB엔 있는데 화면은 실패」다.
      // 1618학원 신고의 유력 원인 중 하나이며, 스트림이 살아 있기만 하면 사라진다.
      //
      // SSE 주석(`: hb`)은 EventSource·수동 파서 양쪽에서 **데이터가 아니다**
      // (클라이언트 파서도 `data:` 로 시작하지 않는 줄을 건너뛴다) — 그래서
      // 프레임 계약을 바꾸지 않고 연결만 살린다. 15초는 일반적인 프록시 유휴
      // 임계(60~120초)보다 충분히 짧다.
      const HEARTBEAT_MS = 15_000;
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": hb\n\n"));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);
      // Node 런타임에서 타이머가 프로세스를 붙잡지 않게 한다(있으면 unref).
      (heartbeat as unknown as { unref?: () => void }).unref?.();

      void (async () => {
        try {
          const res = await runAnalysis(req, rawBody, emit);
          const payload = await res.json().catch(() => ({}));
          emit(
            res.ok
              ? { t: "done", ...payload }
              : { t: "error", status: res.status, ...payload },
          );
        } catch (error) {
          emit({
            t: "error",
            error: "Passage analysis failed",
            details: error instanceof Error ? error.message : String(error),
          });
        }
        // ⚠ 해제는 **모든 종료 경로**에서 한 번씩 — 여기 하나뿐이지만 위 catch 가
        //   throw 하지 않는 구조여야 도달이 보장된다(현재 구조가 그렇다).
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          closed = true;
        }
      })();
    },
    cancel() {
      // 클라이언트 이탈 — 생성·과금·저장은 **계속된다**(잡·리포트는 서버가 마친다).
      // 접는 것은 타이머와 프레임 방출뿐이다.
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runAnalysis(
  req: NextRequest,
  rawBody: unknown,
  emit: StreamEmit,
): Promise<NextResponse> {
  const requestStartedAt = Date.now();
  const staff = await getStaffSession();
  if (!staff) {
    // [E30/RCA #16] 세션 만료로 발사가 통째로 사라지는 경로 — 화면에는 토스트 하나뿐이라
    // 사용자는 "눌렀는데 안 만들어졌다"로 기억한다. academyId 는 아직 없다.
    logAnalysisRejection({ reasonCode: "UNAUTHENTICATED", status: 401 });
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    // [E30/RCA #16] 요청 스키마 위반. issues 를 통째로 싣지 않고 경로만 남긴다
    // (본문·커스텀 프롬프트가 로그로 새는 것을 막는다).
    logAnalysisRejection({
      reasonCode: "INVALID_PAYLOAD",
      status: 400,
      academyId: staff.academyId,
      detail: { issuePaths: parsed.error.issues.slice(0, 8).map((i) => i.path.join(".")) },
    });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const generationPlan = normalizeQuestionGenerationPlan(
    parsed.data.generationPlan,
  );
  const analysisTone = normalizeAnalysisTone(parsed.data.analysisTone);
  const includeWorksheet = parsed.data.includeWorksheet === true;
  // 섹션 종량제 부분 분석 대상(§3.4.1). null 이면 기존 전체 분석 경로 그대로.
  const targetSections = parsed.data.targetSections ?? null;
  // 실전 학습지는 분석 섹션이 아니라 옵트인 생성물(스펙 §3.4 특례) — 종량제와 조합 불가.
  if (targetSections && includeWorksheet) {
    // [E30/RCA #16] 계기만 덧붙인다 — 조건식·상태·자구 무개변(E30 §2-3).
    logAnalysisRejection({
      reasonCode: "COMBO_TARGETSECTIONS_WITH_WORKSHEET",
      status: 400,
      academyId: staff.academyId,
      passageId: parsed.data.passageId,
      detail: { targetSectionCount: targetSections.length },
    });
    return NextResponse.json(
      { error: "targetSections 와 includeWorksheet 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }
  // 파이널 원페이지(final-onepage-spec §2) — 별도 상품이라 실전 학습지·종량제와 조합 불가.
  const finalOnepage = parsed.data.finalOnepage === true;
  if (finalOnepage && includeWorksheet) {
    // [E30/RCA #16] 계기만 덧붙인다 — 조건식·상태·자구 무개변(E30 §2-3).
    logAnalysisRejection({
      reasonCode: "COMBO_FINAL_WITH_WORKSHEET",
      status: 400,
      academyId: staff.academyId,
      passageId: parsed.data.passageId,
    });
    return NextResponse.json(
      { error: "finalOnepage 와 includeWorksheet 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }
  if (finalOnepage && targetSections) {
    // [E30/RCA #16] 계기만 덧붙인다 — 조건식·상태·자구 무개변(E30 §2-3).
    logAnalysisRejection({
      reasonCode: "COMBO_FINAL_WITH_TARGETSECTIONS",
      status: 400,
      academyId: staff.academyId,
      passageId: parsed.data.passageId,
      detail: { targetSectionCount: targetSections.length },
    });
    return NextResponse.json(
      { error: "finalOnepage 와 targetSections 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }
  // 직독직해 분석본(reading-analysis-worksheet-spec §5.2-8) — 별도 상품이라 실전
  // 학습지·파이널·종량제 어느 축과도 조합 불가. 정상 클라(sheetPromptFlags)는 variant
  // 당 1키만 싣지만, 서버가 직접 막아야 수제 요청·구버전 클라에서도 불변식이 선다.
  const readingAnalysis = parsed.data.readingAnalysis === true;
  if (readingAnalysis && includeWorksheet) {
    logAnalysisRejection({
      reasonCode: "COMBO_READING_WITH_WORKSHEET",
      status: 400,
      academyId: staff.academyId,
      passageId: parsed.data.passageId,
    });
    return NextResponse.json(
      { error: "readingAnalysis 와 includeWorksheet 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }
  if (readingAnalysis && finalOnepage) {
    logAnalysisRejection({
      reasonCode: "COMBO_READING_WITH_FINAL",
      status: 400,
      academyId: staff.academyId,
      passageId: parsed.data.passageId,
    });
    return NextResponse.json(
      { error: "readingAnalysis 와 finalOnepage 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }
  if (readingAnalysis && targetSections) {
    logAnalysisRejection({
      reasonCode: "COMBO_READING_WITH_TARGETSECTIONS",
      status: 400,
      academyId: staff.academyId,
      passageId: parsed.data.passageId,
      detail: { targetSectionCount: targetSections.length },
    });
    return NextResponse.json(
      { error: "readingAnalysis 와 targetSections 는 함께 쓸 수 없습니다" },
      { status: 400 },
    );
  }

  const passage = await prisma.passage.findFirst({
    where: { id: parsed.data.passageId, academyId: staff.academyId },
    include: {
      analysis: true,
      school: { select: { type: true } },
    },
  });
  if (!passage) {
    // [E30/RCA #16] 지문이 다른 학원 소유이거나 삭제된 뒤에 발사된 경우. 목록 스냅샷이
    // 낡았다는 신호이기도 하다(모달은 마운트 1회만 읽는다 — RCA RC-1 층①).
    logAnalysisRejection({
      reasonCode: "PASSAGE_NOT_FOUND",
      status: 404,
      academyId: staff.academyId,
      passageId: parsed.data.passageId,
      detail: { includeWorksheet, finalOnepage, hasTargetSections: targetSections !== null },
    });
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }
  // 국어 지문은 부분 분석 미지원(§3.4.1-8) — 섹션 종량제는 영어 PRIME 리포트 전용이라
  // PRIME_KO 블록에 진입하기 전에 차단한다(잡 생성 전이라 뒷정리도 필요 없다).
  if (targetSections && isKoreanPassage(passage)) {
    logAnalysisRejection({
      reasonCode: "KOREAN_PARTIAL_UNSUPPORTED",
      status: 400,
      academyId: staff.academyId,
      passageId: passage.id,
      detail: { targetSectionCount: targetSections.length },
    });
    return NextResponse.json(
      { error: "국어 지문은 부분 분석을 지원하지 않습니다" },
      { status: 400 },
    );
  }
  // 파이널 원페이지는 국어(PRIME_KO) v1 미지원(스펙 F7) — 같은 이유로 잡 생성 전 차단.
  if (finalOnepage && isKoreanPassage(passage)) {
    // [E30/RCA #16] RCA RC-6 이 지목한 국어 등록 페이지의 「사전 선택된 파이널 100% 400」이
    // 여기로 떨어진다. 계기가 없으면 그 결함은 관측 자체가 불가능하다.
    logAnalysisRejection({
      reasonCode: "KOREAN_FINAL_UNSUPPORTED",
      status: 400,
      academyId: staff.academyId,
      passageId: passage.id,
    });
    return NextResponse.json(
      { error: "국어 지문은 파이널 원페이지를 지원하지 않습니다" },
      { status: 400 },
    );
  }
  // 직독직해 분석본은 국어(PRIME_KO) 미지원 — EN→KO 직독직해가 상품의 본질이라
  // 국어 지문엔 의미 자체가 성립하지 않는다(reading-spec §2 koreanSupported:false).
  // 파이널 국어 게이트와 동형으로 잡 생성 전 차단(뒷정리 불요).
  if (readingAnalysis && isKoreanPassage(passage)) {
    logAnalysisRejection({
      reasonCode: "KOREAN_READING_UNSUPPORTED",
      status: 400,
      academyId: staff.academyId,
      passageId: passage.id,
    });
    return NextResponse.json(
      { error: "국어 지문은 직독직해 분석본을 지원하지 않습니다" },
      { status: 400 },
    );
  }

  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "PASSAGE_ANALYSIS",
    passageId: passage.id,
  });

  const active = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: staff.academyId,
      domain: "PASSAGE_ANALYSIS",
      passageId: passage.id,
      status: { in: ["PENDING", "PROCESSING"] },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    // config 는 붙이기 판정에 필요하다(아래 [E29-2]) — 잡 config 는 작은 스칼라
    // 뭉치라 목록 슬림 규약(§12)의 pages/theme 금지와 무관하다.
    select: { id: true, status: true, createdAt: true, config: true },
  });
  // ── [E29-2] 「이미 진행 중인 잡에 붙이기」는 **같은 상품일 때만** ────────────
  //
  // 구판은 요청이 무엇이든 활성 잡이 있으면 200 + attachedToExisting 으로 돌려줬다.
  // 그러면 기본 분석이 도는 지문에 파이널을 누른 요청은 **완전히 삼켜진다**:
  // 잡이 안 만들어지고(그래서 DB 에 시도 흔적조차 없다), 과금도 없고, 파이널도
  // 안 생기는데, 클라이언트는 done 프레임을 정상 완료로 읽어 큐 카드가 조용히
  // 사라진다. 사용자에겐 「눌렀는데 안 만들어졌다」이고, 운영에겐 **계기에 안
  // 잡히는 실패**다(실측: 파이널 잡 전 기간 6건 = 생존자 표본).
  //
  // 상품이 같으면 붙이기가 옳다(연타·새로고침 중복 발사 흡수). 상품이 다르면
  // 붙이기는 요청을 버리는 것과 같으므로 **409 로 거절**해 사용자가 원인을 알게 한다.
  // 지문당 활성 잡 1개라는 서버 불변식은 그대로다.
  // 판정 순서는 productOfJobConfig 와 동일해야 한다(위 [E29-2] 주석의 순서 규약).
  const requestedProduct = finalOnepage
    ? "final"
    : readingAnalysis
      ? "reading"
      : targetSections
        ? "partial"
        : includeWorksheet
          ? "practice"
          : "basic";
  const activeProduct = productOfJobConfig(active?.config);
  if (active && activeProduct !== requestedProduct) {
    // [E30/RCA #16] 상품 불일치 거절 — 구판이 **200 으로 삼키던** 바로 그 요청이다.
    // 이 계기가 곧 「파이널을 눌렀는데 실전 잡에 먹혔다」의 첫 관측 수단이다.
    logAnalysisRejection({
      reasonCode: "ANOTHER_PRODUCT_IN_PROGRESS",
      status: 409,
      academyId: staff.academyId,
      passageId: passage.id,
      requestedProduct,
      detail: { activeProduct, activeJobId: active.id },
    });
    if (emit !== NOOP_EMIT) {
      emit({ t: "phase", label: "다른 생성이 진행 중" });
    }
    return NextResponse.json(
      {
        error: `이 지문은 지금 ${withObjectJosa(PRODUCT_LABEL[activeProduct])} 만드는 중이에요. 끝난 뒤에 ${withObjectJosa(PRODUCT_LABEL[requestedProduct])} 다시 눌러 주세요.`,
        code: "ANOTHER_PRODUCT_IN_PROGRESS",
        activeJobId: active.id,
        activeProduct,
        requestedProduct,
      },
      { status: 409 },
    );
  }
  if (active) {
    // 이 경로는 LLM 을 한 번도 부르지 않으므로 델타가 0프레임이다. 스트림 요청이면
    // 사유를 담은 phase 프레임을 1회 흘려 패널이 마운트되게 한다 — 그러지 않으면
    // 사용자에겐 "스트리밍이 고장난 것"으로 보인다(26-07-25 실사고).
    if (emit !== NOOP_EMIT) {
      emit({ t: "phase", label: "이미 진행 중인 분석에 연결됨" });
    }
    // [E30/RCA #16] 거절은 아니지만 **잡을 만들지 않고 끝나는** 경로라 계기 축은 같다
    // (RCA 가 센 조기 return 7곳에 이 200 attach 가 포함된다). 연타 흡수가 정상 동작이므로
    // 사유 코드로 구분해 남긴다 — 이게 없으면 "발사 수 ≠ 잡 수"의 차액을 설명할 수 없다.
    logAnalysisRejection({
      reasonCode: "ATTACHED_TO_EXISTING",
      status: 200,
      academyId: staff.academyId,
      passageId: passage.id,
      requestedProduct,
      detail: { activeJobId: active.id, activeStatus: active.status },
    });
    return NextResponse.json({
      jobId: active.id,
      status: active.status,
      createdAt: active.createdAt.toISOString(),
      fastPath: false,
      attachedToExisting: true,
    });
  }

  // ── 사전 잔액 게이트(잡 행 생성 **전**) ──────────────────────────────────
  // 문제생성 fast/md-stream 라우트에는 있던 게이트가 이 라우트엔 없어, 잔액 0 학원의
  // 학습지 13지문 일괄 발사가 FAILED 잡 13행으로 착지했다(26-09-08 전수조사).
  // 필요액은 아래 상품별 청구액과 같은 함수·같은 분기에서 나온다:
  //   국어·파이널·직독직해 = 기본(◈5) · 실전 포함 = 기본+실전 · 부분(종량제)은
  //   plan 산출이 잡 생성 뒤라 여기서 못 정하므로 게이트를 걸지 않는다(0 = 통과).
  // 최종 권위는 여전히 ensureWorkbenchAiJobCharged 의 원자적 차감이다.
  const preflightRequired =
    requestedProduct === "partial"
      ? 0
      : requestedProduct === "practice" && !isKoreanPassage(passage)
        ? getPassageAnalysisCreditCost({ includeWorksheet: true })
        : getPassageAnalysisCreditCost({ includeWorksheet: false });
  const preflight = await preflightCreditGate({
    academyId: staff.academyId,
    requiredCredits: preflightRequired,
  });
  if (!preflight.ok) {
    logAnalysisRejection({
      reasonCode: "INSUFFICIENT_CREDITS_PREFLIGHT",
      status: 402,
      academyId: staff.academyId,
      passageId: passage.id,
      requestedProduct,
      detail: { balance: preflight.balance, required: preflight.required },
    });
    if (emit !== NOOP_EMIT) {
      emit({ t: "phase", label: "크레딧 부족" });
    }
    return preflight.response;
  }

  const now = new Date();
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "PASSAGE_ANALYSIS",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: "FULL",
      generationPlan,
      requestedCount: 1,
      startedAt: now,
      config: {
        customPrompt: parsed.data.customPrompt ?? "",
        focusAreas: parsed.data.focusAreas ?? [],
        targetLevel: parsed.data.targetLevel ?? "",
        generationPlan,
        analysisTone,
        includeWorksheet,
        fastPath: true,
        // 파이널 원페이지 잡 표식(스펙 §2) — 재시도·워커 승격 시 parse 복원용.
        // 부재 시 키 자체가 실리지 않는다(기존 잡 config 무회귀).
        ...(finalOnepage ? { finalOnepage: true } : {}),
        // 직독직해 분석본 잡 표식(reading-spec §5.2-8) — 파이널과 동형:
        // productOfJobConfig 역산·재시도 복원용. 부재 시 키 자체가 실리지 않는다
        // (기존 잡 config 무회귀 — 위 productOfJobConfig 증명 ①의 전제).
        ...(readingAnalysis ? { readingAnalysis: true } : {}),
        // §3.4.1-9·11: 스튜디오(getStudioPassageDetail)가 진행 중 잡의 대상 섹션·발사
        // 카드를 읽어 그 카드만 "생성 중"으로 표시한다. 전체 분석은 필드 자체가 없다(무회귀).
        ...(targetSections ? { targetSections } : {}),
        ...(targetSections && parsed.data.sourceModule
          ? { sourceModule: parsed.data.sourceModule }
          : {}),
      },
    },
  });

  const currentHash = hashContent(passage.content);
  // 청구액 스레딩(§3.4.1-3): 부분 요청은 종량제 금액으로 아래에서 덮어쓴다. 환불 3경로
  // (품질 게이트·최외곽 catch)가 전부 이 변수를 써야 부분 요청 오환불이 없다 —
  // catch 에서 정액을 재계산하면 1크레딧 청구에 5크레딧 환불이 난다.
  let chargedCost = getPassageAnalysisCreditCost({ includeWorksheet });
  let creditTxId: string | null = null;
  let creditMs = 0;
  let generationMs = 0;
  let generationStartedAt: number | null = null;
  let persistenceMs = 0;
  let resilientCheckpoint: ResilientCheckpoint | null = null;

  // ── PRIME_KO 게이트: 국어 지문은 KO 회복형 생성기·PRIME_KO 마커로만 처리 ──────
  // 영어 분석기·derive-legacy(PassageAnalysis 파생)·실전 학습지로 절대 흐르지 않는다.
  // 자기완결 블록(자체 과금/환불/잡 상태) — 아래 영어 경로는 무변경.
  if (isKoreanPassage(passage)) {
    const koCreditCost = getPassageAnalysisCreditCost({ includeWorksheet: false });
    let koCreditTxId: string | null = null;
    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId: job.id,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType: "PASSAGE_ANALYSIS",
        metadata: { passageId: passage.id, generationPlan, koPrime: true, creditCost: koCreditCost, fastPath: true },
        creditCost: koCreditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      koCreditTxId = credit.transactionId;

      generationStartedAt = Date.now();
      const koResilient = await generateKoAnalysisReportResilient(
        buildKoPromptInputFromPassage({
          content: passage.content,
          tags: passage.tags,
          grade: passage.grade,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          customPrompt: parsed.data.customPrompt,
        }),
        {
          contentHash: currentHash,
          deadlineAt: requestStartedAt + 255_000,
          // 영어 경로와 동형 — 폴백은 반드시 KO 기본 구현이어야 한다
          // (영어 defaultLlmText 를 넣으면 logPrefix·재시도 정책이 KO 계약과 어긋남).
          llmText:
            emit === NOOP_EMIT
              ? undefined
              : createStreamingLlmText({ emit, fallback: koDefaultLlmText }),
        },
      );
      generationMs = Date.now() - generationStartedAt;

      // KO LLM 호출 토큰·실측 원가 합산 기록(플랫폼 원가 추적 — 영어 경로와 parity).
      const koTokens = koResilient.usages.reduce(
        (acc, u) => {
          const t = readAiUsageTokens(u.usage);
          const c = readAiUsageCost(u.usage);
          acc.input += t.inputTokens;
          acc.output += t.outputTokens;
          if (c.costUsd) acc.costUsd += c.costUsd;
          return acc;
        },
        { input: 0, output: 0, costUsd: 0 },
      );
      if (koTokens.input > 0 || koTokens.output > 0) {
        const koModelId = koResilient.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.7-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:analysis`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS",
          academyId: job.academyId,
          provider: providerFromModel(koModelId),
          model: koModelId,
          inputTokens: koTokens.input,
          outputTokens: koTokens.output,
          recordedCostUsd: koTokens.costUsd > 0 ? koTokens.costUsd : null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, koPrime: true, fastPath: true, calls: koResilient.usages.length },
        });
      }

      // 품질 게이트 — 개관 폴백이거나 목표 섹션 절반 미만이면 환불 + FAILED.
      const targetsCount = koResilient.completeness.present.length + koResilient.completeness.missing.length;
      const koDegraded =
        koResilient.completeness.fallback.includes("ko-overview") ||
        koResilient.completeness.present.length < Math.ceil(targetsCount / 2);
      if (koDegraded) {
        if (koCreditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            koCreditTxId,
            "PRIME_KO analysis incomplete — refunded",
            koCreditCost,
          ).catch((refundErr) => console.error("PRIME_KO incomplete refund failed", refundErr));
        }
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: "일시적인 AI 문제로 국어 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도해주세요.",
            result: JSON.parse(JSON.stringify({
              koPrime: true,
              resilient: {
                complete: koResilient.completeness.complete,
                present: koResilient.completeness.present,
                missing: koResilient.completeness.missing,
                fallback: koResilient.completeness.fallback,
                rounds: koResilient.rounds,
              },
            })),
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          {
            error: "Passage analysis incomplete",
            code: "PASSAGE_ANALYSIS_INCOMPLETE",
            details: "일시적인 AI 문제로 국어 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
            completeness: koResilient.completeness,
          },
          { status: 502 },
        );
      }

      await saveKoPrimeReport(prisma, {
        academyId: passage.academyId,
        passageId: passage.id,
        staffId: staff.id,
        report: koResilient.report,
      });

      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: 0,
        creditMs,
        generationMs,
        persistenceMs: 0,
        totalRunMs: Date.now() - requestStartedAt,
        cached: false,
        fastPath: true,
      };
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          successCount: 1,
          failedCount: 0,
          resultCount: 1,
          result: JSON.parse(JSON.stringify({
            cached: false,
            passageId: passage.id,
            generationPlan,
            koPrime: true,
            debugTiming,
            fastPath: true,
            resilient: {
              complete: koResilient.completeness.complete,
              present: koResilient.completeness.present,
              missing: koResilient.completeness.missing,
              fallback: koResilient.completeness.fallback,
              rounds: koResilient.rounds,
              draftUsed: koResilient.draftUsed,
            },
          })),
          completedAt,
        },
      });
      return NextResponse.json({
        jobId: job.id,
        status: "COMPLETED",
        data: null,
        koPrime: true,
        cached: false,
        generationPlan,
        creditsRemaining: credit.balanceAfter,
        createdAt: job.createdAt.toISOString(),
        completedAt: completedAt.toISOString(),
        debugTiming,
        fastPath: true,
      });
    } catch (koErr) {
      if (koErr instanceof InsufficientCreditsError) {
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: `Insufficient credits: have ${koErr.currentBalance}, need ${koErr.requiredCredits}`,
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { error: "Insufficient credits", balance: koErr.currentBalance, required: koErr.requiredCredits },
          { status: 402 },
        );
      }
      if (koCreditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          koCreditTxId,
          "PRIME_KO fast passage analysis failed",
          koCreditCost,
        ).catch((refundErr) => console.error("PRIME_KO fast refund failed", refundErr));
      }
      const classified = classifyAnalysisError(koErr);
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: classified.message,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "Passage analysis failed", details: classified.message, code: classified.code },
        { status: classified.status },
      );
    }
  }

  // ── 파이널 원페이지 게이트: final 요청은 전용 생성기·PRIME_FINAL 마커로만 처리 ──
  // 기본 분석·실전 학습지·캐시 단락으로 절대 흐르지 않는다(항상 신선 생성). PassageAnalysis
  // 파생도 기록하지 않는다(스펙 F2 — 기본 분석 캐시 보존). PRIME_KO 게이트와 동형의
  // 자기완결 블록(자체 과금/환불/잡 상태) — 아래 영어 경로는 무변경.
  if (finalOnepage) {
    const finalCreditCost = getPassageAnalysisCreditCost({ includeWorksheet: false });
    let finalCreditTxId: string | null = null;
    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId: job.id,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType: "PASSAGE_ANALYSIS",
        metadata: { passageId: passage.id, generationPlan, finalOnepage: true, creditCost: finalCreditCost, fastPath: true },
        creditCost: finalCreditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      finalCreditTxId = credit.transactionId;

      // 비스트리밍 생성(단일 LLM 콜) — 델타 배선 없이 phase 라벨만 흘려 미리보기 패널
      // 마운트를 보장한다(0프레임이면 스트리밍 고장으로 보인다 — 26-07-25 실사고 참고).
      if (emit !== NOOP_EMIT) {
        emit({ t: "phase", label: "파이널 원페이지 생성 중" });
      }

      // 필기 주석·강사 지시 병합 — 기존 영어 경로와 동일 규칙.
      const persistedAnns = await loadPersistedAnnotations(passage.id);
      const annotationPrompt =
        persistedAnns.length > 0 ? buildAnalysisPrompt("", persistedAnns) : "";
      const mergedPrompt = [annotationPrompt, parsed.data.customPrompt]
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .join("\n\n");
      // brand = 학원명 — 구식 생성 라우트(prime/[passageId] POST)와 동일 규약. 없으면 생성기 기본값.
      const academy = await prisma.academy.findUnique({
        where: { id: staff.academyId },
        select: { name: true },
      });

      generationStartedAt = Date.now();
      const finalResult = await generateFinalOnepageReport(
        {
          passageContent: passage.content,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          grade: passage.grade,
          customPrompt: mergedPrompt || undefined,
          ...(academy?.name ? { brand: academy.name } : {}),
        },
        // luna(102~130s/시도) 전환으로 예산 최대화 — maxDuration 300s 벽에서 30s만
        // 남긴다(질문생성 fast 의 270s 선례). 파이널 후처리는 upsert 1건이라 충분.
        { deadlineAt: requestStartedAt + 270_000 },
      );
      generationMs = Date.now() - generationStartedAt;

      // 품질 게이트 실패(F5·F6·수리 2회 소진) — 전액 환불 + FAILED(502).
      if (!finalResult.ok) {
        if (finalCreditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            finalCreditTxId,
            "PRIME_FINAL onepage incomplete — refunded",
            finalCreditCost,
          ).catch((refundErr) => console.error("PRIME_FINAL incomplete refund failed", refundErr));
        }
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage:
              "일시적인 AI 문제로 파이널 원페이지를 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도해주세요.",
            result: JSON.parse(JSON.stringify({
              finalOnepage: true,
              error: finalResult.error,
              debugTiming: { queueWaitMs: 0, creditMs, generationMs, persistenceMs: 0, totalRunMs: Date.now() - requestStartedAt, fastPath: true },
              // [E30/RCA #18] 수리 시도 횟수·앵커 드롭 진단(생성기가 노출하면 자동으로 실린다).
              // 실패 쪽이 오히려 더 중요하다 — 2시도를 다 쓰고 죽었는지, 예산 가드에 걸려
              // 1시도로 끝났는지가 result.error 자구만으로는 갈리지 않는다.
              finalDiagnostics: finalGenerationDiagnostics(finalResult),
            })),
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          {
            error: "Final onepage incomplete",
            code: "PASSAGE_ANALYSIS_INCOMPLETE",
            details: "일시적인 AI 문제로 파이널 원페이지를 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
          },
          { status: 502 },
        );
      }

      // LLM 토큰·실측 원가 기록(플랫폼 원가 추적 — 기존 경로와 parity).
      const finalTokens = readAiUsageTokens(finalResult.usage.usage);
      const finalCost = readAiUsageCost(finalResult.usage.usage);
      if (finalTokens.inputTokens > 0 || finalTokens.outputTokens > 0) {
        const finalModelId = finalResult.usage.modelId || "gemini-3.7-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:final-onepage`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS_FINAL",
          academyId: job.academyId,
          provider: providerFromModel(finalModelId),
          model: finalModelId,
          inputTokens: finalTokens.inputTokens,
          outputTokens: finalTokens.outputTokens,
          recordedCostUsd: finalCost.costUsd ?? null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, finalOnepage: true, fastPath: true, durationMs: finalResult.usage.durationMs },
        });
      }

      if (emit !== NOOP_EMIT) {
        emit({ t: "phase", label: "파이널 원페이지 저장 중" });
      }

      // PRIME_FINAL 행 upsert(스펙 F3) — 기본 학습지의 PRIME 행과 별도로 지문당 1행,
      // 재생성 = 갱신. 기존 PRIME upsert 패턴(findFirst→update/create) 복제.
      const finalReport = finalResult.report;
      const persistenceStartedAt = Date.now();
      const existingFinal = await prisma.passageReport.findFirst({
        where: { passageId: passage.id, academyId: passage.academyId, generationPlan: "PRIME_FINAL", deletedAt: null },
        select: { id: true },
      });
      const finalRowData = {
        title: finalReport.meta.titleKo,
        status: "PUBLISHED",
        pages: finalReport as never,
        theme: { themeId: finalReport.themeId } as never,
        templateId: "prime-final",
        generationPlan: "PRIME_FINAL",
        lastEditedById: staff.id,
        lastEditedAt: new Date(),
      };
      if (existingFinal) {
        await prisma.passageReport.update({ where: { id: existingFinal.id }, data: { ...finalRowData, version: { increment: 1 } } });
      } else {
        await prisma.passageReport.create({ data: { academyId: passage.academyId, passageId: passage.id, createdById: staff.id, ...finalRowData } });
      }
      persistenceMs = Date.now() - persistenceStartedAt;

      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: 0,
        creditMs,
        generationMs,
        persistenceMs,
        totalRunMs: Date.now() - requestStartedAt,
        cached: false,
        fastPath: true,
      };
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          successCount: 1,
          failedCount: 0,
          resultCount: 1,
          result: JSON.parse(JSON.stringify({
            cached: false,
            passageId: passage.id,
            generationPlan,
            finalOnepage: true,
            debugTiming,
            fastPath: true,
            // ── [E30/RCA #18] 파이널 생성 진단 ────────────────────────────────
            // lastCallMs 는 **마지막 모델 콜 1회**의 실측 소요다. generationMs(전체)와
            // 나란히 두면 「콜이 한 번이었는가」가 산술로 갈린다 — RCA §0-E 는
            // generationMs=215,568ms 가 콜 1회 상한(200,000ms)을 넘는다는 **간접 추론**
            // 하나로 수리 발화를 알아냈다. 그건 계기가 아니라 운이었다.
            // attempts·anchorDropped 는 생성기가 노출하는 즉시 코드 변경 0으로 합류한다.
            finalDiagnostics: {
              ...finalGenerationDiagnostics(finalResult),
              lastCallMs: finalResult.usage.durationMs,
              modelId: finalResult.usage.modelId || null,
            },
          })),
          completedAt,
        },
      });
      return NextResponse.json({
        jobId: job.id,
        status: "COMPLETED",
        data: null,
        finalOnepage: true,
        cached: false,
        generationPlan,
        creditsRemaining: credit.balanceAfter,
        createdAt: job.createdAt.toISOString(),
        completedAt: completedAt.toISOString(),
        debugTiming,
        fastPath: true,
      });
    } catch (finalErr) {
      if (finalErr instanceof InsufficientCreditsError) {
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: `Insufficient credits: have ${finalErr.currentBalance}, need ${finalErr.requiredCredits}`,
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { error: "Insufficient credits", balance: finalErr.currentBalance, required: finalErr.requiredCredits },
          { status: 402 },
        );
      }
      if (finalCreditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          finalCreditTxId,
          "PRIME_FINAL fast passage analysis failed",
          finalCreditCost,
        ).catch((refundErr) => console.error("PRIME_FINAL fast refund failed", refundErr));
      }
      const classified = classifyAnalysisError(finalErr);
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: classified.message,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "Passage analysis failed", details: classified.message, code: classified.code },
        { status: classified.status },
      );
    }
  }

  // ── 직독직해 분석본 게이트: reading 요청은 전용 생성기·PRIME_READING 마커로만 처리 ──
  // 파이널 게이트와 동형의 자기완결 블록(자체 과금/환불/잡 상태) — 캐시 단락 없음(항상
  // 신선 생성·재생성 = 덮어쓰기), PassageAnalysis 파생 미기록(기본 분석 캐시 보존 —
  // 파이널 F2 와 같은 이유). 아래 영어 경로는 무변경. 스펙 정본
  // docs/reading-analysis-worksheet-spec.md §5.2-8 · §5.1(파이널 패턴 복제 결정).
  if (readingAnalysis) {
    // 과금 ◈5 — 파이널과 같은 단가 조합. ⚠ 리터럴 5 금지: 청구·표기(sheet-products)가
    // 같은 상수를 읽어야 갈리지 않는다(E19-2).
    const readingCreditCost = getPassageAnalysisCreditCost({ includeWorksheet: false });
    let readingCreditTxId: string | null = null;
    try {
      const creditStartedAt = Date.now();
      const credit = await ensureWorkbenchAiJobCharged({
        jobId: job.id,
        academyId: job.academyId,
        staffId: job.createdById,
        operationType: "PASSAGE_ANALYSIS",
        metadata: { passageId: passage.id, generationPlan, readingAnalysis: true, creditCost: readingCreditCost, fastPath: true },
        creditCost: readingCreditCost,
      });
      creditMs = Date.now() - creditStartedAt;
      readingCreditTxId = credit.transactionId;

      // 비스트리밍 생성 — 델타 배선 없이 phase 라벨만 흘려 미리보기 패널 마운트를
      // 보장한다(0프레임이면 스트리밍 고장으로 보인다 — 26-07-25 실사고, 파이널 동형).
      if (emit !== NOOP_EMIT) {
        emit({ t: "phase", label: "직독직해 분석본 생성 중" });
      }

      // 필기 주석·강사 지시 병합 — 파이널과 동일 규칙.
      const persistedAnns = await loadPersistedAnnotations(passage.id);
      const annotationPrompt =
        persistedAnns.length > 0 ? buildAnalysisPrompt("", persistedAnns) : "";
      const mergedPrompt = [annotationPrompt, parsed.data.customPrompt]
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .join("\n\n");
      // brand = 학원명 — 파이널과 동일 규약. 없으면 생성기 기본값.
      const academy = await prisma.academy.findUnique({
        where: { id: staff.academyId },
        select: { name: true },
      });
      // [F1-M1] (있으면) 기존 PRIME 리포트를 컨텍스트로. U1 입력 계약은
      // primeContext(**string**) 하나뿐이다(reading-analysis.ts:268) — 구판이
      // primeReport(객체) 키로 넘겨 U1 이 한 글자도 못 읽던 무음 무효를, 여기서
      // vocabulary·grammar 를 증류한 문자열로 고친다. PRIME 행 부재·파스 실패·증류
      // 공집합이면 키 자체를 뺀다(U1 프롬프트의 primeBlock 이 생략된다 — 무해).
      const primeContextRow = await prisma.passageReport.findFirst({
        where: { passageId: passage.id, academyId: passage.academyId, generationPlan: "PRIME", deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { pages: true },
      });
      const primeContext = primeContextRow
        ? analysisReportSchema.safeParse(primeContextRow.pages)
        : null;
      const distilledPrimeContext = primeContext?.success
        ? distillPrimeContext(primeContext.data)
        : null;

      generationStartedAt = Date.now();
      // ⚠ 입력·옵션은 **변수 경유**로 넘긴다 — 병렬 유닛 U1 의 입력 타입이 이 키들의
      //   부분집합이어도 fresh-literal 초과 속성 검사에 걸리지 않는다(구조 폭 대입).
      //   contentHash 도 실어 둔다(회복형 선례 opts 계약까지 커버 — 안 읽으면 무해).
      // deadline +270s: 파이널의 270s 선례 그대로 — maxDuration 300s 벽에서 30s
      // (업서트·원가 기록·환불 몫)만 남긴다.
      const readingGenInput = {
        passageContent: passage.content,
        schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        grade: passage.grade,
        customPrompt: mergedPrompt || undefined,
        // [F1-2] 지문 제목 — U1 이 header.title 고정에 쓴다(reading-analysis.ts:264-266
        // passageTitle 계약 · 있으면 그대로, 없으면 내용 기반 제목). 빈 문자열이면 키 생략.
        ...(passage.title?.trim() ? { passageTitle: passage.title } : {}),
        ...(academy?.name ? { brand: academy.name } : {}),
        // [F1-M1] 객체(primeReport)가 아니라 증류 문자열(primeContext) — 위 증류 주석 참조.
        ...(distilledPrimeContext ? { primeContext: distilledPrimeContext } : {}),
      };
      const readingGenOpts = {
        deadlineAt: requestStartedAt + 270_000,
        contentHash: currentHash,
      };
      const readingRaw: unknown = await generateReadingAnalysisResilient(
        readingGenInput,
        readingGenOpts,
      );
      generationMs = Date.now() - generationStartedAt;

      // [F1-7] LLM 토큰·실측 원가 기록 — **게이트 판정 이전**(생성 직후). 실패해도
      // 플랫폼 원가는 이미 발생했다 — KO 블록의 「기록 후 게이트」 순서와 동형.
      // U1 은 실패 결과(ok:false)에도 usages 를 반환하므로 재료가 항상 있다.
      // 성공 경로의 기존 호출은 여기로 단일화했다(이중 기록 금지).
      const readingUsages = readingUsageEvents(readingRaw);
      const readingTokens = readingUsages.reduce(
        (acc, u) => {
          const t = readAiUsageTokens(u.usage);
          const c = readAiUsageCost(u.usage);
          acc.input += t.inputTokens;
          acc.output += t.outputTokens;
          if (c.costUsd) acc.costUsd += c.costUsd;
          return acc;
        },
        { input: 0, output: 0, costUsd: 0 },
      );
      if (readingTokens.input > 0 || readingTokens.output > 0) {
        const readingModelId = readingUsages.find((u) => u.modelId)?.modelId ?? "gemini-3.7-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:reading-analysis`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS_READING",
          academyId: job.academyId,
          provider: providerFromModel(readingModelId),
          model: readingModelId,
          inputTokens: readingTokens.input,
          outputTokens: readingTokens.output,
          recordedCostUsd: readingTokens.costUsd > 0 ? readingTokens.costUsd : null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, readingAnalysis: true, fastPath: true, calls: readingUsages.length },
        });
      }

      // U1 계약 어댑터로 결과 소화 — 명시 실패(ok:false) / 문서 복원 실패 / 게이트
      // 위반을 전부 같은 환불+FAILED 경로로 수렴시킨다(무음 출하 금지).
      const failedExplicitly = readingResultFailed(readingRaw);
      // [F1-M8] fallbackTitle = 지문 관리 목록 제목 — 행 title 한국어 축 유지(어댑터 주석).
      const readingReport = failedExplicitly
        ? null
        : extractReadingReport(readingRaw, academy?.name, passage.title);
      const readingSection =
        readingReport?.sections.find(
          (s): s is ReadingAnalysisSection => s.kind === "reading-analysis",
        ) ?? null;
      // 서버측 품질 게이트(§3.1 C1~C7 — 생성기 내부 게이트의 이중화). C1 원문 축자
      // 대조용으로 지문 원문을 2번째 인자로 넘긴다.
      // ⚠ U1 병렬 작성이라 validateReadingDoc 의 2번째 인자 형상이 미확정 — unknown
      //   경유 어댑터로 호출하고 판정은 형상 방어 독자(readingGateVerdict)로 읽는다.
      //   throw 형 게이트도 실패로 수렴시킨다(catch — 무음 통과 금지).
      const runReadingGate = validateReadingDoc as unknown as (
        doc: unknown,
        original?: unknown,
      ) => unknown;
      let gate: { pass: boolean; detail: string } = {
        pass: false,
        detail: "reading-analysis 섹션 부재",
      };
      if (readingSection) {
        try {
          gate = readingGateVerdict(runReadingGate(readingSection, passage.content));
        } catch (gateErr) {
          gate = { pass: false, detail: String(gateErr).slice(0, 500) };
        }
      }
      if (failedExplicitly || !readingReport || !readingSection || !gate.pass) {
        // 품질 게이트 실패(수리 소진 포함) — 전액 환불 + FAILED(502). 파이널 :941-978 동형.
        if (readingCreditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            readingCreditTxId,
            "PRIME_READING analysis incomplete — refunded",
            readingCreditCost,
          ).catch((refundErr) => console.error("PRIME_READING incomplete refund failed", refundErr));
        }
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage:
              "일시적인 AI 문제로 직독직해 분석본을 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도해주세요.",
            result: JSON.parse(JSON.stringify({
              readingAnalysis: true,
              error: failedExplicitly
                ? readingResultError(readingRaw)
                : !readingReport
                  ? "생성 결과에서 ReadingAnalysisDoc 를 복원하지 못함"
                  : `품질 게이트 위반: ${gate.detail}`,
              debugTiming: { queueWaitMs: 0, creditMs, generationMs, persistenceMs: 0, totalRunMs: Date.now() - requestStartedAt, fastPath: true },
              // [E30/RCA #18 동형] 실패 쪽 진단이 더 중요하다 — 시도 횟수·문장/파트
              // 수가 result 에 있어야 다음 신고가 조회로 끝난다.
              readingDiagnostics: readingGenerationDiagnostics(readingRaw, readingSection),
            })),
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          {
            error: "Reading analysis incomplete",
            code: "PASSAGE_ANALYSIS_INCOMPLETE",
            details: "일시적인 AI 문제로 직독직해 분석본을 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
          },
          { status: 502 },
        );
      }

      // [F1-7] 원가 기록은 위(생성 직후·게이트 이전)로 단일화 — readingUsages 도
      // 거기서 계산돼 아래 진단(lastCallMs·calls·modelId)이 그대로 재사용한다.

      if (emit !== NOOP_EMIT) {
        emit({ t: "phase", label: "직독직해 분석본 저장 중" });
      }

      // 스펙 §5.3 F-1: 저장 문서의 sections 는 정확히 [reading-analysis 1개] — 생성기가
      // 여분 섹션을 실어 보내도 여기서 전면 문서 형상으로 고정한다(조기반환 슬롯 계약).
      const readingDocReport = { ...readingReport, sections: [readingSection] } as AnalysisReport;

      // PRIME_READING 행 upsert — 파이널 upsert 패턴(findFirst→update/create) 글자
      // 그대로: 지문당 1행, 재생성 = 갱신(version 증가). (passageId, generationPlan)
      // 유니크 인덱스는 없으므로 중복 방어는 위 「지문당 활성 잡 1개」 배타가 담당한다.
      // result(pages) 직렬화도 파이널 방식 그대로 — AnalysisReport 껍데기 통째 저장.
      const persistenceStartedAt = Date.now();
      const existingReading = await prisma.passageReport.findFirst({
        where: { passageId: passage.id, academyId: passage.academyId, generationPlan: READING_REPORT_MARKER, deletedAt: null },
        select: { id: true },
      });
      const readingRowData = {
        title: readingDocReport.meta.titleKo,
        status: "PUBLISHED",
        pages: readingDocReport as never,
        theme: { themeId: readingDocReport.themeId } as never,
        templateId: "prime-reading",
        generationPlan: READING_REPORT_MARKER,
        lastEditedById: staff.id,
        lastEditedAt: new Date(),
      };
      if (existingReading) {
        await prisma.passageReport.update({ where: { id: existingReading.id }, data: { ...readingRowData, version: { increment: 1 } } });
      } else {
        await prisma.passageReport.create({ data: { academyId: passage.academyId, passageId: passage.id, createdById: staff.id, ...readingRowData } });
      }
      persistenceMs = Date.now() - persistenceStartedAt;

      const completedAt = new Date();
      const debugTiming = {
        queueWaitMs: 0,
        creditMs,
        generationMs,
        persistenceMs,
        totalRunMs: Date.now() - requestStartedAt,
        cached: false,
        fastPath: true,
      };
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          successCount: 1,
          failedCount: 0,
          resultCount: 1,
          result: JSON.parse(JSON.stringify({
            cached: false,
            passageId: passage.id,
            generationPlan,
            readingAnalysis: true,
            debugTiming,
            fastPath: true,
            // [E30/RCA #18 동형] 생성 진단 — 문장/파트 수·콜 수·모델이 result 에 있으면
            // 「몇 문장짜리가 몇 콜에 나왔나」가 잡 행 하나로 조회된다.
            readingDiagnostics: {
              ...readingGenerationDiagnostics(readingRaw, readingSection),
              modelId: readingUsages.find((u) => u.modelId)?.modelId ?? null,
              // [F1-6] U1 usage 에 durationMs 가 아직 없을 수 있다(F2 가 싣는다) —
              // undefined 는 JSON.stringify 에서 키째 증발하므로 null 명시로 방어한다
              // (AnalysisReportUsage 타입은 durationMs 필수지만 여긴 구조 캐스트 경유라
              // 런타임 부재가 실재한다 — readingUsageEvents 필터는 usage 키만 본다).
              lastCallMs:
                readingUsages.length > 0 &&
                typeof readingUsages[readingUsages.length - 1].durationMs === "number"
                  ? readingUsages[readingUsages.length - 1].durationMs
                  : null,
              calls: readingUsages.length,
            },
          })),
          completedAt,
        },
      });
      return NextResponse.json({
        jobId: job.id,
        status: "COMPLETED",
        data: null,
        readingAnalysis: true,
        cached: false,
        generationPlan,
        creditsRemaining: credit.balanceAfter,
        createdAt: job.createdAt.toISOString(),
        completedAt: completedAt.toISOString(),
        debugTiming,
        fastPath: true,
      });
    } catch (readingErr) {
      if (readingErr instanceof InsufficientCreditsError) {
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            failedCount: 1,
            errorMessage: `Insufficient credits: have ${readingErr.currentBalance}, need ${readingErr.requiredCredits}`,
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { error: "Insufficient credits", balance: readingErr.currentBalance, required: readingErr.requiredCredits },
          { status: 402 },
        );
      }
      if (readingCreditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          readingCreditTxId,
          "PRIME_READING fast passage analysis failed",
          readingCreditCost,
        ).catch((refundErr) => console.error("PRIME_READING fast refund failed", refundErr));
      }
      const classified = classifyAnalysisError(readingErr);
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: classified.message,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "Passage analysis failed", details: classified.message, code: classified.code },
        { status: classified.status },
      );
    }
  }

  try {
    // ── 부분 분석 플랜(§3.4.1-1·2) ─────────────────────────────────────────
    // 부분 요청은 아래 전체-분석 캐시 단락을 타지 않는다 — 대신 여기서 보유 섹션을
    // 산출해 "missing=∅ → 이미 준비됨"을 자체 단락으로 처리한다.
    // 신선도(스펙 스테일 규칙·검수 M5): PassageAnalysis 행이 없거나 contentHash ≠ 현재
    // 본문 해시면 스테일 — 행 부재 = 검증 불가 = 스테일(getStudioPassageDetail 과 동일
    // 술어). 행 부재를 신선 취급하면 카드는 "needs·N크레딧"인데 라우트는 0크레딧 즉시
    // 완료로 갈려 카드가 영구 교착한다.
    let plan: PartialAnalysisPlan | null = null;
    let freshReport: AnalysisReport | null = null;
    if (targetSections) {
      const primeRow = await prisma.passageReport.findFirst({
        where: {
          passageId: passage.id,
          academyId: passage.academyId,
          generationPlan: "PRIME",
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { pages: true },
      });
      if (primeRow && passage.analysis?.contentHash === currentHash) {
        const parsedPrime = analysisReportSchema.safeParse(primeRow.pages);
        if (parsedPrime.success) freshReport = parsedPrime.data;
      }
      plan = computePartialAnalysisPlan({ targetSections, freshReport });
      chargedCost = plan.creditCost;

      if (plan.missing.length === 0) {
        // 요청 섹션을 이미 전부 보유 — 과금·LLM 없이 즉시 완료(§3.4.1-2).
        // LLM 0프레임 경로라 스트림 요청이면 phase 1회로 패널 마운트를 보장한다
        // (기존 캐시 단락과 동형 — 26-07-25 실사고 참고).
        if (emit !== NOOP_EMIT) {
          emit({ t: "phase", label: "이미 준비된 분석 불러오는 중" });
        }
        const completedAt = new Date();
        const debugTiming = {
          queueWaitMs: 0,
          creditMs: 0,
          generationMs: 0,
          persistenceMs: 0,
          totalRunMs: Date.now() - requestStartedAt,
          cached: true,
          fastPath: true,
        };
        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            successCount: 1,
            failedCount: 0,
            resultCount: 1,
            result: JSON.parse(JSON.stringify({
              alreadyPrepared: true,
              partial: true,
              cached: true,
              passageId: passage.id,
              generationPlan,
              analysisTone,
              targetSections: plan.targets,
              sectionsGenerated: [],
              creditCost: 0,
              debugTiming,
              fastPath: true,
            })),
            completedAt,
          },
        });
        return NextResponse.json({
          jobId: job.id,
          status: "COMPLETED",
          data: null,
          alreadyPrepared: true,
          partial: true,
          targetSections: plan.targets,
          sectionsGenerated: [],
          creditCost: 0,
          cached: true,
          generationPlan,
          analysisTone,
          createdAt: job.createdAt.toISOString(),
          completedAt: completedAt.toISOString(),
          debugTiming,
          fastPath: true,
          skippedGeneration: true,
        });
      }
    }

    // 실전 학습지 포함 요청은 캐시 단락을 타지 않는다 — 사용자가 명시적으로
    // "기본 + 실전" 풀 생성을 선택한 것이므로 항상 신선하게 생성한다.
    // 부분 요청(targetSections)도 타지 않는다 — 위 자체 단락이 대체한다(§3.4.1-2).
    //
    // ⚠ PRIME 리포트 존재가 캐시 단락의 **필수 조건**이다(26-08-15 실측 확정,
    //    docs/class-studio-spec.md §3.10.19 E19-11).
    //    이 단락은 PassageAnalysis(파생 캐시)만 보고 응답하면서 PassageReport(PRIME,
    //    = 사용자가 말하는 "학습지")는 **만들지 않는다**. 그래서 "분석 캐시는 신선한데
    //    PRIME 행이 없는" 지문은 몇 번을 요청해도 COMPLETED·cached=true·차감 0 으로
    //    끝나고 학습지가 영원히 생기지 않았다 — 실DB 표본 400개 중 **208개(52%)** 가
    //    이 상태였고, 실제 POST 로 재현 확인했다(리포트 0개, 잔액 불변).
    //    캐시 단락은 "산출물이 이미 있을 때 재생성을 아끼는 것"이 목적이므로,
    //    산출물이 없으면 단락해서는 안 된다.
    const primeRow = await prisma.passageReport.findFirst({
      where: {
        passageId: passage.id,
        academyId: passage.academyId,
        generationPlan: "PRIME",
        deletedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      select: { pages: true },
    });
    const primeReportExists = !!primeRow;
    // [26-08-26 전수조사 GEN-2] 캐시 단락은 「행 존재」만 보고 pages 품질을 안 봐서, grammar
    // 섹션이 통째로 없는 구판 결손 학습지(실DB 17건)가 재생성 버튼을 눌러도 cached=true 로
    // 영구 동결됐다. 최소 무결성(어법 필기의 유일 공급원 grammar 실존 — RC-3 게이트와 대칭)을
    // 통과한 산출물만 캐시로 재서빙한다. 실패 시 단락하지 않고 정상 재생성(정상 과금)으로 흘린다.
    const primeHasGrammar = (() => {
      try {
        const secs = (primeRow?.pages as { sections?: Array<{ kind?: string }> } | null)?.sections;
        return Array.isArray(secs) && secs.some((s) => s?.kind === "grammar");
      } catch {
        return false;
      }
    })();
    if (
      !includeWorksheet &&
      !targetSections &&
      primeReportExists &&
      primeHasGrammar &&
      passage.analysis &&
      passage.analysis.contentHash === currentHash
    ) {
      const cachedAnalysis = JSON.parse(passage.analysis.analysisData);
      if (shouldUseCachedAnalysis(cachedAnalysis, generationPlan, analysisTone)) {
        // LLM 을 부르지 않는 경로다. 가짜 사고 프레임은 만들지 않는다(허위 표시) —
        // 대신 "캐시를 썼다"는 사실만 1회 알린다. tail 은 비어 있다.
        if (emit !== NOOP_EMIT) {
          emit({ t: "phase", label: "저장된 분석 불러오는 중" });
        }
        const completedAt = new Date();
        const debugTiming = {
          queueWaitMs: 0,
          creditMs: 0,
          generationMs: 0,
          persistenceMs: 0,
          totalRunMs: Date.now() - requestStartedAt,
          cached: true,
          fastPath: true,
        };

        await prisma.workbenchAiJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            successCount: 1,
            failedCount: 0,
            resultCount: 1,
            result: JSON.parse(JSON.stringify({
              cached: true,
              passageId: passage.id,
              generationPlan,
              analysisTone,
              debugTiming,
              fastPath: true,
            })),
            completedAt,
          },
        });

        return NextResponse.json({
          jobId: job.id,
          status: "COMPLETED",
          data: cachedAnalysis,
          cached: true,
          generationPlan,
          analysisTone: getAnalysisTone(cachedAnalysis) || analysisTone,
          createdAt: job.createdAt.toISOString(),
          completedAt: completedAt.toISOString(),
          debugTiming,
          fastPath: true,
          skippedGeneration: true,
        });
      }
    }

    // 실전 학습지는 옵트인 라우트(prime/[passageId]/worksheet)와 동일 단가.
    // 부분 요청은 종량제 금액(chargedCost=plan.creditCost)이 위에서 스레딩돼 온다.
    const worksheetCost = getPassageAnalysisWorksheetCreditCost(includeWorksheet);
    const creditStartedAt = Date.now();
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: job.academyId,
      staffId: job.createdById,
      operationType: "PASSAGE_ANALYSIS",
      metadata: {
        passageId: passage.id,
        generationPlan,
        analysisTone,
        creditCost: chargedCost,
        includeWorksheet,
        fastPath: true,
        ...(plan ? { partial: true, targetSections: plan.targets } : {}),
      },
      creditCost: chargedCost,
    });
    creditMs = Date.now() - creditStartedAt;
    creditTxId = credit.transactionId;

    const persistedAnns = await loadPersistedAnnotations(passage.id);
    const annotationPrompt =
      persistedAnns.length > 0 ? buildAnalysisPrompt("", persistedAnns) : "";
    const mergedPrompt = [annotationPrompt, parsed.data.customPrompt]
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join("\n\n");

    generationStartedAt = Date.now();
    // 회복형 생성: 전체 초안으로 통과 섹션을 부분 구제 → 실패/누락 섹션만 정확히 골라
    // 섹션 단위로 다시 생성(직전 실패를 교정 지시로 주입) → 완성된 섹션은 건너뛰고
    // 진전마다 체크포인트를 남겨 다음 시도가 이어받게 하며, 필수(passage)는 무조건 채워
    // 항상 렌더 가능한 보고서를 완성한다. (기존 all-or-nothing generateAnalysisReportCore 대체)
    const priorCheckpoint = await loadPriorCheckpoint(prisma, {
      academyId: staff.academyId,
      passageId: passage.id,
      contentHash: currentHash,
      excludeJobId: job.id,
    });
    // 부분 요청(§3.4.1-4): 보유 섹션을 체크포인트로 시드(리포트가 선행 잡 체크포인트에
    // 우선)해 생성기가 스킵하게 하고, targetKinds = 보유 ∪ 요청 — 시드 섹션이 재검증·
    // 완성도 집계에 포함되고 부족분만 섹션 단위로 생성된다. 문장 번호 정합은 시드된
    // passage 기준 reconcileSentenceRefs 가 보장한다. 전체 요청은 기존 값 그대로.
    const seedCheckpoint = plan
      ? buildSeedCheckpoint({ freshReport, prior: priorCheckpoint, contentHash: currentHash })
      : priorCheckpoint;
    let partialTargetKinds: SectionKind[] | null = null;
    if (plan) {
      const wanted = new Set<SectionKind>([...plan.targets, ...plan.present]);
      partialTargetKinds = FULL_ANALYSIS_SECTIONS.filter((k) => wanted.has(k));
    }
    // 26-08-12 luna 전환: 코어 엔진이 parallel(기본)이면 섹션들이 동시 생성되므로
    // 델타 스트리밍(단일 텍스트 줄기)을 걸 수 없다 — 대신 onPhase 로 섹션 시작 이벤트를
    // 흘려 로딩 카드가 진행 단계를 표시한다. draft 롤백(env=draft) 시 기존 델타
    // 스트리밍 그대로 복원.
    const coreEngine = worksheetCoreEngine();
    const resilient = await generateAnalysisReportResilient(
      {
        passageContent: passage.content,
        schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        grade: passage.grade,
        customPrompt: mergedPrompt || undefined,
      },
      {
        contentHash: currentHash,
        // Vercel maxDuration(300s) 벽 안에서 마치고 부분 결과를 남기도록 데드라인을 둔다.
        // 실전 학습지(includeWorksheet)까지 한 요청에서 생성하면 코어 뒤로 워크북+추론
        // 호출이 더 붙으므로, 코어 데드라인을 낮춰 학습지 몫(≈135s)을 벽 안에 남겨 둔다.
        deadlineAt: requestStartedAt + (includeWorksheet ? 150_000 : 255_000),
        checkpoint: seedCheckpoint,
        ...(partialTargetKinds ? { targetKinds: partialTargetKinds } : {}),
        engine: coreEngine,
        // 스트리밍 요청 + draft 엔진일 때만 게이트웨이 SSE 를 직접 읽는 구현으로 갈아끼운다.
        // 실패 시 defaultLlmText 로 폴백하므로 생성 성공률은 무회귀(stream-llm.ts).
        llmText:
          emit === NOOP_EMIT || coreEngine === "parallel"
            ? undefined
            : createStreamingLlmText({ emit, fallback: defaultLlmText }),
        // draft 롤백 시엔 createStreamingLlmText 가 자체 phase 를 이미 흘리므로 중복 방지.
        ...(emit === NOOP_EMIT || coreEngine === "draft"
          ? {}
          : { onPhase: (label: string) => emit({ t: "phase", label: analysisPhaseLabel(label) }) }),
        // promise 를 반환해 resilient 가 await — fire-and-forget 시 지연 쓰기가 최종
        // COMPLETED 결과를 덮어쓰는 레이스를 차단(쓰기 직렬화).
        onCheckpoint: (cp) => {
          resilientCheckpoint = cp;
          return persistCheckpoint(prisma, job.id, cp);
        },
      },
    );
    generationMs = Date.now() - generationStartedAt;
    // 부분 요청(§3.4.1-6): 신선본 기준 3중 보존 병합 — 비분석 섹션(self-check)·기보유
    // 분석 섹션 되살림·실전 학습지 필드 오버레이(strip 소거 복원, 검수 M1). 스테일 본은
    // 어떤 섹션도 얹지 않는다(구본문 문항의 학생 서빙 금지 — 스펙 스테일 규칙, 검수 M6).
    // [E30 §2-3] 실전 섹션을 얹지 않게 되면서 이 값은 재대입되지 않는다(let → const).
    // 부분 요청(plan)의 3중 보존 병합은 무개변 — 부분 분석과 실전 학습지는 조합 400 이라
    // 애초에 같은 요청에 함께 오지 않는다.
    const primeReport = plan
      ? mergeReportPreservingExtras(resilient.report, freshReport)
      : resilient.report;

    // 회복형 분석의 모든 LLM 호출(초안+섹션) 토큰을 합산해 비용 회계에 기록 — 기존
    // 단일 호출 회계와 parity. (사용자 과금이 아니라 플랫폼 원가 추적용.)
    const analysisTokens = resilient.usages.reduce(
      (acc, u) => {
        const t = readAiUsageTokens(u.usage);
        const c = readAiUsageCost(u.usage);
        acc.input += t.inputTokens;
        acc.output += t.outputTokens;
        if (c.costUsd) acc.costUsd += c.costUsd;
        return acc;
      },
      { input: 0, output: 0, costUsd: 0 },
    );
    if (analysisTokens.input > 0 || analysisTokens.output > 0) {
      const usageModelId = resilient.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.7-flash";
      await recordCostSafely({
        sourceKey: `workbench_ai_job:${job.id}:analysis`,
        sourceId: job.id,
        sourceDetail: "PASSAGE_ANALYSIS",
        academyId: job.academyId,
        provider: providerFromModel(usageModelId),
        model: usageModelId,
        inputTokens: analysisTokens.input,
        outputTokens: analysisTokens.output,
        recordedCostUsd: analysisTokens.costUsd > 0 ? analysisTokens.costUsd : null,
        usageAt: new Date(),
        metadata: { passageId: passage.id, generationPlan, fastPath: true, calls: resilient.usages.length },
      });
    }

    // 품질 게이트: 본문(passage)이 결정론 폴백이거나 확보 섹션이 너무 적으면(=AI 사실상 실패)
    // COMPLETED·과금하지 않고 환불 + FAILED 로 흘린다. 체크포인트는 보존돼 재시도가 완성분을 이어받는다.
    // 부분 요청은 대체 게이트(§3.4.1-5): 돈 받은 missing 중 하나라도 미완성이면 부분 성공
    // 어중간 과금 금지 — 전액 환불. (present<4 기준은 전체 분석 전용이라 쓰지 않는다.)
    const degraded = plan
      ? resilient.completeness.fallback.includes("passage") ||
        plan.missing.some((k) => !resilient.completeness.present.includes(k))
      : resilient.completeness.fallback.includes("passage") ||
        resilient.completeness.present.length < 4 ||
        // grammar 는 「03 필기 분석」의 척추(어법 필기 유일 공급원) — 빠지면 필기 없는
        // 맹탕 학습지가 정상 출하된다(26-08-25 실사고: grammar 만 missing 인 채 COMPLETED·
        // 과금, .tmp-par-rca RCA). 전체 분석에서 grammar 미확보는 환불+FAILED 로 크게
        // 실패시킨다 — 체크포인트에 나머지 5섹션이 보존되므로 재시도는 grammar 만 이어 만든다.
        resilient.completeness.missing.includes("grammar");
    if (degraded) {
      if (creditTxId) {
        await refundCredits(
          job.academyId,
          "PASSAGE_ANALYSIS",
          creditTxId,
          "Resilient passage analysis incomplete — refunded",
          chargedCost,
        ).catch((refundErr) => console.error("Fast analysis incomplete refund failed", refundErr));
      }
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage:
            "일시적인 AI 문제로 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도하면 만들어 둔 부분을 이어서 완성합니다.",
          result: JSON.parse(JSON.stringify({
            debugTiming: { queueWaitMs: 0, creditMs, generationMs, persistenceMs: 0, totalRunMs: Date.now() - requestStartedAt, fastPath: true },
            checkpoint: resilientCheckpoint,
            partial: true,
            resilient: {
              complete: resilient.completeness.complete,
              present: resilient.completeness.present,
              missing: resilient.completeness.missing,
              fallback: resilient.completeness.fallback,
              rounds: resilient.rounds,
            },
          })),
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "Passage analysis incomplete",
          code: "PASSAGE_ANALYSIS_INCOMPLETE",
          details: "일시적인 AI 문제로 분석을 완성하지 못했어요. 크레딧은 환불됐어요. 다시 시도해주세요.",
          completeness: resilient.completeness,
        },
        { status: 502 },
      );
    }

    // ── 실전 학습지 한 번에 생성 (옵트인) ──────────────────────────────
    // 기본 분석 성공 후 워크북(어법 선택·어휘 빈칸·배열) + 수능추론을 생성해
    // learning-worksheet 섹션을 풀 콘텐츠로 교체한다. 워크시트만 실패하면
    // 기본 학습지는 그대로 저장하고 워크시트 몫만 환불한다.
    let worksheetFailed = false;
    // [E30 §2-3] 실전 학습지 섹션은 부모 문서에 얹지 않고 **자식 문서(PRIME_PRACTICE)**
    // 로 나간다. 아래 $transaction 까지 지역 변수로만 들고 간다.
    let practiceSection: LearningWorksheetSection | null = null;
    // 잡 result 에 실을 자식 행 id — 「◈10 을 받고 실제로 행을 남겼는가」를 사후에
    // 잡 하나만 보고 판정할 수 있게 한다(RCA §RC-3 계기 원칙).
    let practiceReportId: string | null = null;
    if (includeWorksheet) {
      // 학습지도 코어와 동일한 회복형 — 워크북·수능추론 유닛을 다중 라운드로 끝까지 완성한다.
      // 같은 300s 벽을 공유하므로 데드라인(285s)을 두고 내부 호출이 self-abort 하게 한다.
      const worksheet = await generateLearningWorksheetResilient(
        {
          passageContent: passage.content,
          schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
          grade: passage.grade,
        },
        primeReport,
        {
          deadlineAt: requestStartedAt + 285_000,
          // 코어와 동일하게 스트리밍 요청일 때만 델타를 흘린다 — 학습지 단계에서
          // 미리보기 패널이 멈춘 것처럼 보이지 않게 한다(워크북·추론 2콜).
          stream: emit === NOOP_EMIT ? undefined : { emit },
        },
      );
      // ── [E30 §2-3] 실전 섹션을 **부모에 얹지 않는다** ────────────────────────
      //
      // 구판은 여기서 primeReport 의 learning-worksheet 를 실전 콘텐츠로 교체해
      // PRIME 행 한 장에 기본+실전을 병합 저장했다. 그러면 조판실에서 두 상품을 분리해
      // 담을 수 없고(요구 0-1), 기본 학습지를 이미 산 사용자에게 실전만 ◈5 로 얹어
      // 팔 수도 없다. 대신 섹션을 지역 변수로 들고 가 아래 $transaction 에서
      // PRIME_PRACTICE 행으로 쓴다.
      //
      // 부모에 손을 대지 않으므로 부모에는 코어 lw(logicRows 전용)만 남는다
      // (resilient-generate.ts:445 가 코어 섹션을 이미 strip 한다). 그 결과
      // section-slots.ts 의 lwHasWorkbook 이 false 로 떨어져 **부모 문서에 실전 슬롯이
      // 생기지 않는다** = 같은 지문에서 실전이 두 번 인쇄되는 일이 구조적으로 불가능하고,
      // D3-b 부모 강등이 (b) 경로에서는 무동작으로 자연 성립한다(E30 §1-4 D3-b).
      //
      // ⚠ 조건이 `worksheet.section` **존재**가 아니라 worksheet-grade **판정**인 이유:
      //   워크북·추론 두 유닛이 모두 실패해도 generateLearningWorksheetResilient 는
      //   null 이 아니라 **코어 lw 폴백 섹션**을 돌려준다(generate.ts 의 combined 는
      //   baseSection 스프레드라 스키마를 통과한다). 존재만 보고 행을 쓰면 바로 아래
      //   `present.length === 0` 환불과 겹쳐 「환불은 했는데 **빈 실전 학습지 행**이
      //   남는」 상태가 된다 — 그 유령 행은 조판 목록에 뜨고 hasPractice 를 참으로 만들어
      //   재구매까지 막는다(E30 §1-4 의 「빈 껍데기 215건」과 같은 계통).
      //   판정 술어는 리포에 하나뿐이다(worksheet-core-gate.ts) — 복제 금지.
      if (hasWorksheetContentFields(worksheet.section)) {
        practiceSection = worksheet.section;
      }
      // 학습지 LLM 호출(워크북+추론, 라운드별) 토큰 합산 기록.
      const wsTokens = worksheet.usages.reduce(
        (acc, u) => {
          const t = readAiUsageTokens(u.usage);
          const c = readAiUsageCost(u.usage);
          acc.input += t.inputTokens;
          acc.output += t.outputTokens;
          if (c.costUsd) acc.costUsd += c.costUsd;
          return acc;
        },
        { input: 0, output: 0, costUsd: 0 },
      );
      if (wsTokens.input > 0 || wsTokens.output > 0) {
        const wsModelId = worksheet.usages.find((u) => u.modelId)?.modelId ?? "gemini-3.7-flash";
        await recordCostSafely({
          sourceKey: `workbench_ai_job:${job.id}:worksheet`,
          sourceId: job.id,
          sourceDetail: "PASSAGE_ANALYSIS_WORKSHEET",
          academyId: job.academyId,
          provider: providerFromModel(wsModelId),
          model: wsModelId,
          inputTokens: wsTokens.input,
          outputTokens: wsTokens.output,
          recordedCostUsd: wsTokens.costUsd > 0 ? wsTokens.costUsd : null,
          usageAt: new Date(),
          metadata: { passageId: passage.id, generationPlan, fastPath: true, calls: worksheet.usages.length },
        });
      }
      // 두 유닛 모두 못 만든 경우(=실전 학습지 가치 전무)에만 워크시트 몫 환불. 부분(워크북/추론
      // 하나라도 확보)은 제공된 것으로 본다. 기본 분석은 항상 그대로 저장된다.
      if (worksheet.present.length === 0) {
        worksheetFailed = true;
        if (creditTxId) {
          await refundCredits(
            job.academyId,
            "PASSAGE_ANALYSIS",
            creditTxId,
            "실전 학습지 생성 실패 — 기본 학습지는 저장, 워크시트 몫 환불",
            worksheetCost,
          ).catch((refundErr) => console.error("Fast analysis worksheet refund failed", refundErr));
        }
      }
    }

    // 카드/문제생성 호환용 파생 데이터 (별도 LLM 호출 없음)
    const analysisData = derivePassageAnalysisFromReport(primeReport);
    // 부분 분석 마커(§3.4.1-7): 병합 리포트의 분석 섹션이 7종 미만이면 보유 kind 를 기록 —
    // shouldUseCachedAnalysis 가 이걸 보고 "캐시 완료" 오탐을 막는다. 전체 분석 경로는
    // 마커를 쓰지 않는다(기존 데이터·동작 불변).
    if (plan) {
      const held = new Set(primeReport.sections.map((s) => s.kind).filter(isSectionKind));
      if (held.size < FULL_ANALYSIS_SECTIONS.length) {
        (analysisData as unknown as Record<string, unknown>)._partialSections =
          FULL_ANALYSIS_SECTIONS.filter((k) => held.has(k));
      }
    }

    const persistenceStartedAt = Date.now();
    await prisma.$transaction(async (tx) => {
      // 1) PRIME 보고서 저장/갱신 (모달이 읽어 A4 렌더)
      const existingPrime = await tx.passageReport.findFirst({
        where: { passageId: passage.id, academyId: passage.academyId, generationPlan: "PRIME", deletedAt: null },
        select: { id: true },
      });
      const primeData = {
        title: primeReport.meta.titleKo,
        status: "PUBLISHED",
        pages: primeReport as never,
        theme: { themeId: primeReport.themeId } as never,
        templateId: "prime",
        generationPlan: "PRIME",
        lastEditedById: staff.id,
        lastEditedAt: new Date(),
      };
      if (existingPrime) {
        await tx.passageReport.update({ where: { id: existingPrime.id }, data: { ...primeData, version: { increment: 1 } } });
      } else {
        await tx.passageReport.create({ data: { academyId: passage.academyId, passageId: passage.id, createdById: staff.id, ...primeData } });
      }
      // 2) 파생 PassageAnalysis (지문 카드 칩·문제생성 컨텍스트 호환)
      await tx.passageAnalysis.upsert({
        where: { passageId: passage.id },
        update: { analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
        create: { passageId: passage.id, analysisData: JSON.stringify(analysisData), contentHash: currentHash, version: 1 },
      });
      // 3) [E30 §2-3] 실전 학습지(PRIME_PRACTICE) 자식 행 — **반드시 같은 트랜잭션**
      //
      // 나누면 「◈10 을 냈는데 기본만 있는」 상태가 남는다(자식 쓰기 실패 시 부모만 커밋).
      // 반대로 한 트랜잭션이면 **부모 없는 자식이 물리적으로 불가능**해져 요구
      // 「실전만 먼저 생성은 안 되는 구조」가 서버 구조로 강제된다 —
      // E30 §2-4 강제 3층 중 「서버(구조)」 층이 바로 이 줄이다.
      //
      // 지문당 1행. (passageId, generationPlan) 유니크 인덱스는 **없으므로**
      // (E30 §1-2 D1 — 컬럼·인덱스 신설은 기각됐다) 파이널의 findFirst→update/create
      // 관용구를 글자 그대로 복제하고, 중복 방어는 위쪽 「지문당 활성 잡 1개」 배타가
      // 담당한다. 배타를 우회하는 경로를 새로 만들면 이 행이 갈라진다.
      if (practiceSection) {
        // E30 §1-3 확정 형태: 부모의 문서 껍데기(brand/docNo/theme/meta)만 상속하고
        // 섹션은 실전 1개뿐이다.
        // ⚠ layout·blockMeta·blockOrder·sectionHeadings·hiddenSections·customBlocks·cover
        //   등 **편집 자산은 절대 상속하지 않는다**. 특히 부모의 hiddenSections 에
        //   "learning-worksheet" 슬롯키가 켜져 있으면(DB 실측 부모 2행이 그 상태다)
        //   자식은 **유일한 섹션이 통째로 사라져** 빈 문서가 된다 — 스키마도 통과하고
        //   에러도 0인데 인쇄만 백지인 유형이다.
        // docNo 는 optional 이라 조건부로만 싣는다(undefined 키를 JSON 컬럼에 넣지 않는다).
        const practiceReport = {
          schemaVersion: primeReport.schemaVersion,
          brand: primeReport.brand,
          ...(primeReport.docNo ? { docNo: primeReport.docNo } : {}),
          themeId: primeReport.themeId,
          meta: primeReport.meta,
          sections: [practiceSection],
        } as AnalysisReport;
        const existingPractice = await tx.passageReport.findFirst({
          where: {
            passageId: passage.id,
            academyId: passage.academyId,
            generationPlan: PRACTICE_REPORT_MARKER,
            deletedAt: null,
          },
          select: { id: true },
        });
        const practiceData = {
          title: practiceReport.meta.titleKo,
          status: "PUBLISHED",
          pages: practiceReport as never,
          theme: { themeId: practiceReport.themeId } as never,
          // 파이널의 "prime-final" 과 동형(E30 §1-1) — 조판·편집기가 문서 종류를
          // 되찾는 보조 축이라 마커와 짝을 맞춘다.
          templateId: "prime-practice",
          generationPlan: PRACTICE_REPORT_MARKER,
          lastEditedById: staff.id,
          lastEditedAt: new Date(),
        };
        if (existingPractice) {
          await tx.passageReport.update({
            where: { id: existingPractice.id },
            data: { ...practiceData, version: { increment: 1 } },
          });
          practiceReportId = existingPractice.id;
        } else {
          const createdPractice = await tx.passageReport.create({
            data: {
              academyId: passage.academyId,
              passageId: passage.id,
              createdById: staff.id,
              ...practiceData,
            },
            select: { id: true },
          });
          practiceReportId = createdPractice.id;
        }
      }
    });
    persistenceMs = Date.now() - persistenceStartedAt;

    const completedAt = new Date();
    const debugTiming = {
      queueWaitMs: 0,
      creditMs,
      generationMs,
      persistenceMs,
      totalRunMs: Date.now() - requestStartedAt,
      cached: false,
      fastPath: true,
    };

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successCount: 1,
        failedCount: 0,
        resultCount: 1,
        result: JSON.parse(JSON.stringify({
          cached: false,
          passageId: passage.id,
          generationPlan,
          analysisTone,
          includeWorksheet,
          worksheetFailed,
          debugTiming,
          fastPath: true,
          // [E30 §2-3] 실전 분리 문서 식별자. null 이면 「실전 몫을 받았는데 자식 행이
          // 없다」는 뜻이라 worksheetFailed(=환불)와 교차 검증이 된다. 잡 행 하나만 보고
          // 판정할 수 있어야 다음 신고가 조회로 끝난다(RCA §RC-3).
          ...(includeWorksheet ? { practiceReportId } : {}),
          // 부분 분석 기록(§3.4.1-9) — 실제 새로 생성한 섹션(=missing)과 청구액.
          ...(plan
            ? {
                partial: true,
                targetSections: plan.targets,
                sectionsGenerated: plan.missing,
                creditCost: plan.creditCost,
              }
            : {}),
          // 회복형 생성 진단 — 어느 섹션을 부분구제/재생성/폴백했는지, 완성 여부.
          resilient: {
            complete: resilient.completeness.complete,
            present: resilient.completeness.present,
            missing: resilient.completeness.missing,
            fallback: resilient.completeness.fallback,
            rounds: resilient.rounds,
            draftUsed: resilient.draftUsed,
          },
        })),
        completedAt,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      status: "COMPLETED",
      data: analysisData,
      cached: false,
      generationPlan,
      analysisTone,
      includeWorksheet,
      worksheetFailed,
      creditsRemaining: credit.balanceAfter,
      createdAt: job.createdAt.toISOString(),
      completedAt: completedAt.toISOString(),
      debugTiming,
      fastPath: true,
      ...(plan
        ? {
            partial: true,
            targetSections: plan.targets,
            sectionsGenerated: plan.missing,
            creditCost: plan.creditCost,
          }
        : {}),
    });
  } catch (err) {
    if (generationStartedAt !== null && generationMs === 0) {
      generationMs = Date.now() - generationStartedAt;
    }

    if (err instanceof InsufficientCreditsError) {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "Insufficient credits",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }

    // 청구 총액(분석 + 옵트인 워크시트 몫) 그대로 환불 — 부분 환불은 위의
    // worksheetFailed 경로에서만 발생하고, 여기는 기본 분석 자체가 실패한 경우다.
    // 금액은 스레딩된 chargedCost(§3.4.1-3) — 부분 요청에서 정액 재계산은 오환불이다.
    if (creditTxId) {
      await refundCredits(
        job.academyId,
        "PASSAGE_ANALYSIS",
        creditTxId,
        "Fast workbench passage analysis failed",
        chargedCost,
      ).catch((refundErr) => {
        console.error("Fast passage analysis refund failed", refundErr);
      });
    }

    const classified = classifyAnalysisError(err);
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: classified.message,
        result: JSON.parse(JSON.stringify({
          debugTiming: {
            queueWaitMs: 0,
            creditMs,
            generationMs,
            persistenceMs,
            totalRunMs: Date.now() - requestStartedAt,
            fastPath: true,
          },
          // 부분 진행분 보존 — 다음 시도가 완성된 섹션을 건너뛰고 이어받게.
          ...(resilientCheckpoint ? { checkpoint: resilientCheckpoint, partial: true } : {}),
        })),
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Passage analysis failed", details: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}
