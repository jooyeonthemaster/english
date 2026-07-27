// ============================================================================
// md 레인 디스크립터 계약 (26-07-26 — 전 유형 md 승차)
//
// 신형 유형은 이 인터페이스 하나만 구현하면 md-stream 라우트에 승차한다.
// 라우트는 유형이 늘어도 if-else 사슬이 늘지 않고, 정본(빈칸·어법) 분기는
// 바이트 무회귀로 남는다 — getMdLane(subType) === null 이면 기존 코드가 그대로
// 실행되기 때문이다.
//
// 레이어 규칙: lib 은 app/_lib 을 import 하지 않는다(디스크립터도 순수 lib).
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// ⚠ MdAnyQuestion 유니언은 확장하지 않는다 — parser.ts:57-63 이 기록한 실측
// (md-lab exam-sheet.tsx·question-editor.tsx 내로우잉 컴파일 실패)이 근거다.
// 레인 고유 파싱 결과는 MdLaneParsed.question 에 unknown 으로 실어 라우트를
// 불투명하게 통과시키고, 각 레인이 자기 타입으로 캐스팅해 소비한다.
// ============================================================================

import type { OperationType } from "@/lib/credit-costs";
import type { TeacherPointPayload } from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";
import type { MdDifficulty } from "./prompts";

export interface MdLaneContext {
  /** 원문 지문(passage.content) */
  passage: string;
  /** md 3분기 난이도 — BASIC | INTERMEDIATE | KILLER */
  difficulty: MdDifficulty;
  /** 원본 난이도 문자열(어댑터·품질 검증 전달용) */
  rawDifficulty: string;
  /** resolveQuestionTypeGenerationSettings 결과 */
  resolved: Record<string, unknown>;
  /** 원본 questionTypeSettings — 언어 블록 등 raw 를 요구하는 빌더용 */
  rawTypeSettings: unknown;
  /** 클램프 + 지문 축자 필터를 통과한 교사 지정 포인트 */
  teacherPoints: TeacherPointPayload[];
  variantIndex: number;
  variantCount: number;
}

export interface MdLaneParsed {
  /** 레인 고유 파싱 결과 — 라우트는 불투명하게 통과시킨다 */
  question: unknown;
  /** 비면 통과. 있으면 재생성(적격 시) 또는 실패·환불 */
  gateIssues: string[];
  /** 0원 자동 보정 기록 → 잡 result.mdCorrections */
  corrections: string[];
}

export interface MdLaneAdaptResult {
  ok: boolean;
  error?: string;
  aiQuestion?: Record<string, unknown>;
}

export interface MdLane {
  readonly subType: string;
  /**
   * 과금 유형. fast 레인의 getOperationType 과 반드시 일치해야 한다 —
   * md-stream 이 QUESTION_GEN_SINGLE 을 하드코딩하고 있어, 어휘 계열
   * (CONTEXT_MEANING·SYNONYM·ANTONYM = QUESTION_GEN_VOCAB)을 그대로 태우면
   * 크레딧이 이중 청구된다(정찰 확정 R1).
   */
  readonly operationType: OperationType;
  /** 게이트 반려 시 1회 재생성 허용 여부 */
  readonly retryEligible: boolean;
  /** 설정 범위 적격성 — 크레딧 차감 전 호출. false 면 fast 폴백 */
  isEligible(resolved: Record<string, unknown>): boolean;
  /** 유형 본체 프롬프트(난이도 3분기 필수) */
  buildBasePrompt(ctx: MdLaneContext): string;
  /** 설정 모드 블록들. 교사포인트·다양성·커스텀·반려피드백은 라우트가 뒤에 붙인다 */
  buildExtras(ctx: MdLaneContext): string[];
  /** 파싱 → 오토스냅 → 게이트 → 교사포인트 준수검사까지 레인이 전담 */
  parseAndGate(text: string, ctx: MdLaneContext): MdLaneParsed;
  adapt(parsed: MdLaneParsed, ctx: MdLaneContext): MdLaneAdaptResult;
  /** validateQuestionQuality 에 추가로 넘길 형식 실값 */
  qualityArgs(ctx: MdLaneContext): Record<string, unknown>;
  /** 잡 result.mdFormat 포렌식 메타 */
  mdFormat(ctx: MdLaneContext): Record<string, unknown>;
  /** 같은 지문 기존 문항의 structuredData 에서 회피 표적을 뽑는다 */
  diversityTargets(structuredData: Record<string, unknown>): string[];
  /**
   * 잡 result 에 기록할 품질 이슈 코드를 레인이 걸러낸다(선택).
   *
   * md 레인은 validateQuestionQuality 결과를 차단하지 않고 기록만 하는데, 그
   * 검증기는 fast 레인 계약을 전제로 만들어져 있다. md 가 의도적으로 다른 계약을
   * 쓰는 유형(예: 순서의 단락 변형 — 학생 표면은 재진술본이고 축자 대조는 md
   * 게이트가 이미 수행)에서는 검증기가 "설계상 예상된" 코드를 error 로 발행한다.
   * 그걸 그대로 기록하면 정상 문항이 결함으로 보여 포렌식이 오염된다.
   * 미구현이면 전량 기록(기본 동작 무변경).
   */
  filterQualityIssues?(codes: string[], ctx: MdLaneContext): string[];
}
