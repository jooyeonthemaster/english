// ============================================================================
// KoTypeModule — 국어 문제유형 모듈 계약 (KO-DESIGN-SPEC §2)
// ============================================================================
// 국어 유형 1개 = 이 인터페이스를 구현하는 자기완결 모듈 1파일
// (src/lib/korean/types/<TYPE_CODE>.ts). 공유 파일 수정 없이 레지스트리
// (registry/index.ts)에 등록되는 것만으로 생성·검증·렌더 전 계층이 동작한다.
// 모듈은 korean/core/*, zod 외의 영어 파이프라인 모듈을 import 하지 않는다.
// ============================================================================

import type { z } from "zod";
import type { KoMarkerFamily } from "../core/markers";
import type { KoPassageKind } from "../core/passage-meta";
import type { KoRenderModel, KoStimulusKind } from "../core/render-model";
import type { KoOptionEnding } from "../core/ko-text";
import type * as koText from "../core/ko-text";

export type KoArea =
  | "READING"
  | "LITERATURE"
  | "GRAMMAR"
  | "SPEECH"
  | "WRITING"
  | "MEDIA"
  | "NAESIN";
export type KoExamMode = "SUNEUNG" | "NAESIN";
export type KoDifficulty = "BASIC" | "INTERMEDIATE" | "KILLER";
export type KoAnswerFormat = "MC5" | "SHORT" | "ESSAY";

/** 영어 파이프라인의 QuestionQualityIssue 와 동일 형태 (dispatch 가 그대로 전달). */
export interface KoQualityIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface KoValidationContext {
  passage: string;
  passageKind: KoPassageKind | null;
  examMode: KoExamMode;
  difficulty: KoDifficulty;
  /** korean/core/ko-text 유틸 번들 — 영어 토크나이저 사용 금지 대원칙의 강제 장치. */
  koText: typeof koText;
}

export interface KoRenderContext {
  passage?: string;
  /** 세트 멤버 렌더 시 지문 동봉을 억제(공유지문 1박스 경로). */
  suppressPassage?: boolean;
}

/** 유형 세부옵션 knob (v1: 생성 모달 노출용 선언 + 프롬프트 반영). */
export interface KoSettingKnob {
  key: string;
  label: string;
  kind: "toggle" | "select";
  options?: { value: string; label: string }[];
  defaultValue: string | boolean;
  description?: string;
}

export interface KoResolvedTypeSettings {
  examMode: KoExamMode;
  [key: string]: unknown;
}

export interface KoTypeSettingsSpec {
  knobs?: KoSettingKnob[];
  /** 설정+난이도 → 생성 프롬프트에 붙는 지시 블록 (한국어). */
  buildPrompt(settings: KoResolvedTypeSettings, difficulty: KoDifficulty): string;
}

export interface KoTypeMeta {
  typeId: string; // "KO_RD_FACT" — 반드시 KO_ 접두
  area: KoArea;
  label: string;
  /**
   * 답형식 축 — QUESTION_TYPE_META.category 로 병합된다. 카드/렌더러가
   * "서술형" 정답 배지 분기에 소비하므로 answerFormat 과 정합해야 한다
   * (MC5→"객관식", SHORT/ESSAY→"서술형"). 영역 축과 혼동 금지.
   */
  formatCategory: "객관식" | "서술형" | "어휘";
  /** 영역 축 — 생성 UI 그룹(QuestionTypeCategory/QUESTION_TYPE_GROUPS)으로 병합. */
  uiGroup: "국어 독서" | "국어 문학" | "국어 문법" | "국어 화법·작문·매체" | "국어 서답형";
  answerFormat: KoAnswerFormat;
  /** 문항 단독 출력 시 지문 동봉 여부 (세트 멤버는 공유지문 1박스로 별도 처리). */
  includesPassage: boolean;
  passageKinds: KoPassageKind[];
  defaultPoints: number; // 수능 2|3, 내신 서답형 4~10 허용
  usesBogi: "required" | "optional" | "none";
  /**
   * 자체자료(koStimulus) 사용 축 — 화법(발표·대화·토론)·작문(초고·계획)·매체(화면)·
   * 국어사(중세 자료) 유형용. 생략 = "none"(기존 26유형 전부 — optional 확장 무회귀).
   * "required": 봉투에 koStimulus ≥1 필수(공통 게이트 ko-stimulus-missing 이 차단).
   * stimulus 유형은 마커를 markers[].targetSurface="stimulus" 로 자료 행에 걸 수 있다.
   */
  usesStimulus?: "required" | "optional" | "none";
  /** usesStimulus 유형이 허용하는 자료 kind — 선언 시 공통 게이트가 kind 일탈을 경고. */
  stimulusKinds?: KoStimulusKind[];
  markerFamilies: KoMarkerFamily[];
  /** 선지 어미 규칙 — 공통 게이트(KOQ_OPTION_ENDING)가 소비. */
  optionEnding: KoOptionEnding;
  /** 난도5 유형(KO_RD_APPLY·KO_LIT_BOGI): 독립 솔버 게이트 + 검수 권장 배지. */
  needsSolverGate: boolean;
  /**
   * true 면 정답 위치 결정론 셔플에서 제외 — 선지가 마커/항목과 1:1 순서
   * 대응하는 유형(KO_LIT_PHRASE·KO_RD_VOCAB 등). 생략 = false(셔플 대상).
   */
  lockedOptionOrder?: boolean;
  description: string;
  /** 카탈로그의 세트 슬롯 역할 (프리셋·플래닝 프롬프트가 참조). */
  setSlot: string;
  /** UI 상세 (question-type-ui 병합용). */
  studentTask: string;
  bestFor: string[];
  outputUi: string[];
}

export interface KoTypeModule {
  meta: KoTypeMeta;
  /** AI 응답 스키마 — 공통 봉투(koQuestionEnvelope) 확장. */
  schema: z.ZodType;
  /**
   * 유형 생성 지시문 (한국어). 카탈로그의 발문 템플릿·메커니즘·오답 설계
   * 원리를 실제 출제 매뉴얼 수준으로 담는다. 공통 품질 계약(contract.ts)과
   * 중복되는 일반 지시는 넣지 않는다.
   */
  prompt: string;
  settings: KoTypeSettingsSpec;
  /** 유형 특화 검증 — 공통 게이트(quality/common.ts)는 dispatch 가 선실행. */
  validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[];
  toRenderModel(question: Record<string, unknown>, ctx: KoRenderContext): KoRenderModel;
  difficultyGuide: Record<KoDifficulty, string>;
}

/** meta 자기모순(형식축·답형식 불일치 등)을 등록 시점에 걸러내는 헬퍼. */
export function assertKoTypeModuleInvariants(mod: KoTypeModule): void {
  const { meta } = mod;
  if (!meta.typeId.startsWith("KO_")) {
    throw new Error(`KO 유형 typeId 는 KO_ 접두가 필요합니다: ${meta.typeId}`);
  }
  const expectFormat = meta.answerFormat === "MC5" ? "객관식" : "서술형";
  if (meta.formatCategory !== expectFormat && meta.formatCategory !== "어휘") {
    throw new Error(
      `${meta.typeId}: formatCategory(${meta.formatCategory})와 answerFormat(${meta.answerFormat}) 불일치`,
    );
  }
  if (meta.stimulusKinds?.length && (meta.usesStimulus ?? "none") === "none") {
    throw new Error(
      `${meta.typeId}: stimulusKinds 가 선언됐는데 usesStimulus 가 "none"(생략) 입니다`,
    );
  }
}
