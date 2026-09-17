// ============================================================================
// 시험 종합(E1c) 공용 모듈 — vision 경로(exam-analyze-direct)와 자체 시험지 심층
// 보강(analysis-boost)이 **같은 함수**로 examLevel 을 만든다 (v4, 26-09-02).
// 정본: docs/exam-analysis-v4-spec.md §2.3
//
// 설계 원칙: 레일 [총평] 탭의 난이도 프로필·유형 분포 차트는 문항별 분석
// (perQuestion)과 **반드시 일치**해야 한다. 종전 E1c 는 이 두 필드까지 LLM 이
// 썼는데, 그러면 문항은 난이도 5 인데 킬러 버킷엔 빠져 있는 식의 불일치가 생긴다.
// 그래서 difficultyProfile·typeDistribution 은 **코드가 결정론 계산**하고, LLM 은
// prose 3필드(overview·trapOverview·scopeInference)만 쓴다.
//
// 순수 계산(computeDeterministicExamLevel)은 DB·네트워크 무의존 — 단위 테스트
// 대상. LLM 호출(synthesizeExamLevel)은 stage "examAnalysis" 텍스트 콜 1회.
// ============================================================================

import { z } from "zod";
import type {
  ExamLevelAnalysis,
  ExamMap,
  QuestionAnalysis,
} from "./types";
import {
  buildExamMapDigest,
  type ExamReportMeta,
} from "./prompts";
import {
  callExamReportJson,
  createExamReportUsage,
  type ExamReportLlmUsage,
} from "./llm";

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/** 유형 라벨 정규화 — exam-report normalizeTypeLabel 관례(내부 공백 제거). */
function typeKey(label: string): string {
  return label.replace(/\s+/g, "").trim();
}

/**
 * perQuestion + examMap → difficultyProfile / typeDistribution (결정론).
 * - 버킷: difficulty 1~2 easy · 3 medium · 4 hard · 5 killer. FAILED 문항은 제외.
 * - 번호 순서는 examMap.order(인쇄 순서) 기준 — 지도에 없는 번호는 뒤에 붙인다.
 * - typeDistribution 은 문항수 내림차순(동률이면 첫 등장 순). points 는 examMap
 *   배점 합(null 은 0). typeLabel 이 비면 "유형미상".
 */
export function computeDeterministicExamLevel(
  examMap: ExamMap,
  perQuestion: QuestionAnalysis[],
): Pick<ExamLevelAnalysis, "difficultyProfile" | "typeDistribution"> {
  const orderByKey = new Map<string, number>();
  const pointsByKey = new Map<string, number>();
  examMap.questions.forEach((q, index) => {
    const key = numberKey(q.number);
    orderByKey.set(key, Number.isFinite(q.order) ? q.order : index + 1);
    pointsByKey.set(key, q.points ?? 0);
  });
  const ok = perQuestion.filter((q) => q.analysisStatus === "OK");
  const sorted = [...ok].sort((a, b) => {
    const oa = orderByKey.get(numberKey(a.number));
    const ob = orderByKey.get(numberKey(b.number));
    if (oa != null && ob != null) return oa - ob;
    if (oa != null) return -1;
    if (ob != null) return 1;
    return 0;
  });

  const difficultyProfile: ExamLevelAnalysis["difficultyProfile"] = {
    easy: [],
    medium: [],
    hard: [],
    killer: [],
  };
  for (const q of sorted) {
    const d = q.difficulty;
    if (d <= 2) difficultyProfile.easy.push(q.number);
    else if (d === 3) difficultyProfile.medium.push(q.number);
    else if (d === 4) difficultyProfile.hard.push(q.number);
    else difficultyProfile.killer.push(q.number);
  }

  const groups = new Map<string, { typeLabel: string; numbers: string[]; points: number }>();
  for (const q of sorted) {
    const label = typeKey(q.typeLabel) || "유형미상";
    const g = groups.get(label) ?? { typeLabel: label, numbers: [], points: 0 };
    g.numbers.push(q.number);
    g.points += pointsByKey.get(numberKey(q.number)) ?? 0;
    groups.set(label, g);
  }
  const typeDistribution = [...groups.values()].sort(
    (a, b) => b.numbers.length - a.numbers.length,
  );
  return { difficultyProfile, typeDistribution };
}

// ── LLM prose 3필드 ──────────────────────────────────────────────────────────

const proseSchema = z.object({
  overview: z.string().min(1),
  trapOverview: z.string().catch(""),
  scopeInference: z.string().catch(""),
});

const PROSE_SCHEMA_BLOCK = `[출력 JSON] — 이 형태만 출력. 코드펜스·설명 금지:
{
  "overview": "시험지 전체 총평",
  "trapOverview": "오답 설계 총평",
  "scopeInference": "출제 범위·교재 추정"
}`;

function buildProseSystemPrompt(): string {
  return `당신은 20년 경력의 대한민국 중·고등학교 영어 내신 출제·분석 전문가입니다. 문항별 분석과 결정론으로 집계된 난이도·유형 분포를 종합해 시험지 전체 수준을 진단하는 총평을 씁니다. 학원 원장·강사가 학부모 상담과 수업 설계에 바로 쓰는 글입니다.

[작성 규칙]
- overview: 3~5문장. ① 체감 난이도 판정(쉬움/보통/어려움/매우 어려움 중 하나를 명시하고 근거 — 킬러·어려움 문항 수와 배점 비중을 숫자로) ② 구성 특징(유형 분포에서 비중이 큰 유형 2~3개와 그 의미) ③ 출제 경향·학생에게 요구되는 역량 1문장.
- trapOverview: 2~4문장. 문항별 함정(trapDesign)에서 반복되는 오답 설계 패턴을 **2개 이상** 짚고, 각 패턴이 드러난 문항 번호를 괄호로 병기한다. 패턴이 안 보이면 "뚜렷한 반복 패턴은 없습니다"라고 정직하게 쓴다.
- scopeInference: 1~3문장. 핵심 개념·지문 성격에서 출제 범위(교과서 단원·부교재·모의고사 변형 등)를 추정하되, 근거가 된 문항 번호를 병기하고 확신이 낮으면 "추정"이라고 명시한다.
- 제시된 데이터에 근거해서만 쓴다. 없는 사실·없는 문항을 지어내지 않는다. 숫자는 제공된 집계와 일치해야 한다.
- 격식 있는 합니다체("-습니다/-입니다"). 해요체·반말 종결어미 금지. 마크다운 서식 금지(평문).

${PROSE_SCHEMA_BLOCK}`;
}

function buildProseUserPrompt(
  digest: string,
  perQuestion: QuestionAnalysis[],
  deterministic: Pick<ExamLevelAnalysis, "difficultyProfile" | "typeDistribution">,
): string {
  const rows = perQuestion
    .filter((a) => a.analysisStatus === "OK")
    .map((a) => {
      const traps =
        a.trapDesign && a.trapDesign.length > 0
          ? ` / 함정: ${a.trapDesign
              .map((t) => `${t.choice}(${t.attractiveness})${t.why ? " " + t.why.slice(0, 60) : ""}`)
              .join("; ")}`
          : "";
      return `- ${a.number}: ${a.typeLabel} / 난이도 ${a.difficulty} / 개념 ${a.keyConcepts.join(", ")} / 출제의도 ${a.intent.slice(0, 80)}${traps}`;
    });
  const dp = deterministic.difficultyProfile;
  const profileLine = `쉬움 ${dp.easy.length}문항 [${dp.easy.join(",")}] · 보통 ${dp.medium.length}문항 [${dp.medium.join(",")}] · 어려움 ${dp.hard.length}문항 [${dp.hard.join(",")}] · 킬러 ${dp.killer.length}문항 [${dp.killer.join(",")}]`;
  const typeLines = deterministic.typeDistribution.map(
    (t) => `- ${t.typeLabel}: ${t.numbers.length}문항 [${t.numbers.join(",")}] · ${t.points}점`,
  );
  return `아래 [시험 컨텍스트]·[난이도 집계]·[유형 분포]·[문항별 분석 요약]을 종합해 총평 3필드를 JSON 으로 출력하십시오. 난이도·유형 집계 숫자는 그대로 인용합니다.

[시험 컨텍스트]
${digest}

[난이도 집계]
${profileLine}

[유형 분포]
${typeLines.join("\n")}

[문항별 분석 요약]
${rows.join("\n")}`;
}

export interface SynthesizeExamLevelOptions {
  examMap: ExamMap;
  perQuestion: QuestionAnalysis[];
  examMeta: ExamReportMeta;
  deadlineAt?: number;
  usage?: ExamReportLlmUsage;
}

/**
 * examLevel 생성 = 결정론 2필드 + LLM prose 3필드. OK 문항이 0 이면 throw
 * (호출부가 "종합 불능"으로 처리 — 종전 E1c 계약과 동일).
 */
export async function synthesizeExamLevel(
  opts: SynthesizeExamLevelOptions,
): Promise<ExamLevelAnalysis> {
  const okCount = opts.perQuestion.filter((q) => q.analysisStatus === "OK").length;
  if (okCount === 0) {
    throw new Error("종합할 문항 분석이 없습니다(OK 0건)");
  }
  const deterministic = computeDeterministicExamLevel(opts.examMap, opts.perQuestion);
  const digest = buildExamMapDigest(opts.examMap, opts.examMeta);
  const prose = await callExamReportJson({
    stage: "examAnalysis",
    systemPrompt: buildProseSystemPrompt(),
    userPrompt: buildProseUserPrompt(digest, opts.perQuestion, deterministic),
    schema: proseSchema,
    deadlineAt: opts.deadlineAt,
    usage: opts.usage ?? createExamReportUsage(),
  });
  return {
    overview: prose.overview,
    trapOverview: prose.trapOverview,
    scopeInference: prose.scopeInference,
    difficultyProfile: deterministic.difficultyProfile,
    typeDistribution: deterministic.typeDistribution,
  };
}
