// ============================================================================
// luna 레인 확장(LunaLaneExt) 계약 (26-08-14, O217 전 유형 이식 캠페인)
//
// md 레인 디스크립터(lane-types.ts MdLane)가 gemini md 경로의 계약이라면, 이
// 인터페이스는 같은 유형의 **luna JSON 경로** 계약이다. 레인당 파일 하나
// (`./luna-ext/<type>.ts`)로 구현하고 luna-ext-registry 에 등록하면 md-stream
// 라우트가 luna 로 승차시킨다 — 게이트·어댑터·과금·저장은 기존 레인 것을
// 그대로 재사용한다(luna 는 "출력 형식과 검산"만 바꾼다).
//
// 검증된 레시피·금지사항 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "./lane-types";
import type { LunaBridgeFieldSpec } from "./luna-stream-bridge";

export interface LunaJsonSchemaSpec {
  name: string;
  strict: true;
  schema: unknown;
}

export interface LunaLaneExt {
  readonly subType: string;
  /**
   * 이 유형 전용 출력 예산(미지정이면 LUNA_QGEN_MAX_TOKENS = 14k).
   *
   * 26-08-14 실측(판정 라운드): 지문을 통째로 재작성하는 유형(네모 어법·글의
   * 순서·문장 삽입)은 사고가 13.5~14.0k 를 전량 소진해 markedPassage 도중에
   * JSON 이 절단됐다(finish_reason=length). 품질 결함이 아니라 예산 결함이라
   * 재생성도 같은 사유로 죽는다 — 그 유형만 상한을 올린다. 짧은 출력 유형까지
   * 올리면 사고가 팽창해 시간이 2배가 된다(O217 프로브)므로 전역 상향은 금지.
   */
  readonly maxTokens?: number;
  /**
   * json_schema strict — 파서 산출물(레인 parseAndGate 의 question)과 동형으로
   * 설계한다. 설정(선지 수·정답 수·언어)이 형식을 바꾸는 유형은 ctx 에서 enum·
   * minItems 를 계산하는 **동적 스키마**여야 한다. 필드 순서 = 스트리밍 도착
   * 순서이므로 본문성 큰 필드를 앞에 둔다.
   */
  buildJsonSchema(ctx: MdLaneContext): LunaJsonSchemaSpec;
  /**
   * 출력 전 자가 검산 블록 — 그 유형 0원 게이트의 반려 조건 전부 + 기출 형식
   * 관행 + 우선순위 사다리(충돌 시 양보 순서). 라우트가 프롬프트 말미(반려
   * 피드백 직전)에 붙인다.
   */
  buildSelfcheck(ctx: MdLaneContext): string;
  /**
   * JSON 텍스트 → (코어스) → 레인 스냅·게이트 재사용 → MdLaneParsed.
   * question 은 레인 parseAndGate 산출물과 동형이어야 한다(레인 adapt 가 그대로
   * 소비). JSON 파싱 예외는 throw 하지 말고 gateIssues 로 반환한다(재생성 유도).
   */
  parseAndGate(text: string, ctx: MdLaneContext): MdLaneParsed;
  /** JSON→md 점진 렌더 스펙 — 사용자 SSE `t:"c"` 표면. 메타 배열은 침묵. */
  readonly bridgeSpecs: LunaBridgeFieldSpec[];
  /**
   * 평가 전용(프로덕션 미사용) — 블라인드 패널이 보는 학생 시험 표면(발문+지문
   * 표면+선지) 렌더. 벤치·패킷 빌더가 소비한다.
   */
  renderEvalSurface(
    aiQuestion: Record<string, unknown>,
    passage: string,
  ): string;
}
