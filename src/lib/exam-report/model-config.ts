// ============================================================================
// 학생 시험 리포트 v3 — LLM 스테이지별 모델·파라미터 설정
//
// 기본: examAnalysis(E1)=프리미엄(sonnet — 함정 why·정답키가 하류 전체의 원천),
// report(S4)=스탠다드(flash) — 26-07-08 프롬프트 3회 강화 루프 후 결정론 6지표
// 6/6 3연속(RICH 김지석: 인용 하한·선지 정합 9/9·구조통찰 30점 정확·합니다체) +
// 희박 데이터(STATUS_ONLY 김주연) 재검에서 선지 단정 날조 0건·trapWhy 구조 가드
// 작동 확인 후 유저 결정으로 전환(콜당 ≈$0.30→$0.016). sonnet 폴백은
// EXAM_REPORT_REPORT_MODEL env 한 줄.
// ⚠️ E2(studentRead)는 flash 인하 금지 — 실사진 판독 A/B: flash 22/28(78.6%)
// vs sonnet 26/28(92.9%), 실존 마킹 3건 누락+오독 2건 HIGH 확신(소거 X표+동그라미
// 혼용 필기 취약). 단 26-07-08 플로우 개편으로 E2 UI 는 폐기(라우트 은퇴 주석) —
// 이 스테이지는 휴면. 실측 근거: 스크래치패드 s4-ab/(loop-*·sparse-flash-v2)·
// measure-v3-result.
// 스테이지는 examAnalysis(E1a/E1b/E1c) · studentRead(E2) · report(S4) 3개.
// 모델은 env 오버라이드 우선(빈 문자열도 폴백해야 하므로 trim 후 truthy 검사).
// ============================================================================

import { ATLAS_PREMIUM_MODEL_ID, ATLAS_STANDARD_MODEL_ID } from "@/lib/atlas-ai";

export type ExamReportAiStage = "examAnalysis" | "studentRead" | "report";

export interface ExamReportAiConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutInMs: number;
  /** OpenRouter reasoning 오버라이드 — 미지정 시 모델 기본(사고 켜질 수 있음) */
  reasoning?: Record<string, unknown>;
}

function readEnvModel(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const ANALYSIS_MODEL =
  readEnvModel("EXAM_REPORT_ANALYSIS_MODEL") ?? ATLAS_PREMIUM_MODEL_ID;
const READ_MODEL =
  readEnvModel("EXAM_REPORT_READ_MODEL") ?? ATLAS_PREMIUM_MODEL_ID;
const REPORT_MODEL =
  readEnvModel("EXAM_REPORT_REPORT_MODEL") ?? ATLAS_STANDARD_MODEL_ID;

const CONFIG_BY_STAGE: Record<ExamReportAiStage, ExamReportAiConfig> = {
  // E1a(examMap 추출)·E1b(문항 배치 분석, vision)·E1c(종합)를 공유. vision + 큰 출력 대비.
  examAnalysis: { model: ANALYSIS_MODEL, temperature: 0.3, maxOutputTokens: 12000, timeoutInMs: 180_000 },
  // E2 답안 판독(vision) — 지각 과제라 사고 불필요. 사고를 끄지 않으면 OpenRouter 기본
  // 사고가 출력 예산·시간을 잠식해 캡잘림/타임아웃(26-07-06 실측: 4k 출력 전량이 사고 토큰).
  studentRead: {
    model: READ_MODEL,
    temperature: 0.1,
    maxOutputTokens: 16000,
    timeoutInMs: 240_000,
    reasoning: { enabled: false },
  },
  // S4 학생 리포트 — 8 narratives + wrongItems 전수 + trapWhy 전수 + 주차계획을
  // 1콜에 담는 구조라 8192 로는 문항 많은 시험에서 서술이 압축·잘린다 → 12288.
  // reasoning 미지정 시 모델 기본 사고가 출력 예산을 잠식하는 함정(studentRead
  // 26-07-06 실측 선례)을 막기 위해 명시적으로 끈다. 출력이 커진 만큼 240s.
  report: {
    model: REPORT_MODEL,
    temperature: 0.4,
    maxOutputTokens: 12288,
    timeoutInMs: 240_000,
    reasoning: { enabled: false },
  },
};

export function getExamReportAiConfig(stage: ExamReportAiStage): ExamReportAiConfig {
  return CONFIG_BY_STAGE[stage];
}
