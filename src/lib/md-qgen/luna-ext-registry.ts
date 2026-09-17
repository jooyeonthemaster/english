// ============================================================================
// luna 레인 확장 레지스트리 — subType → LunaLaneExt (26-08-14 전 유형 이식 캠페인).
//
// md 레인 디스크립터(lane-registry)가 "그 유형을 md-stream 이 처리할 수 있는가"를
// 답한다면, 이 레지스트리는 "그 유형을 **luna JSON 경로**로 생성할 수 있는가"를
// 답한다. 등록된 유형은 라우트가 luna(json_schema strict + 검산 + OpenAI 고정)로
// 생성하고, 파싱 이후(스냅·게이트·어댑터·후처리·과금·저장)는 기존 레인 경로를
// 그대로 탄다.
//
// 26-08-19 전 라인업 3.7 통일(O226): 기본 = 전 유형 gemini(3.7). 스위치(재빌드 불필요):
//   QGEN_LUNA_LANE=on                      → luna 경로 재활성(비상 복귀)
//   QGEN_LUNA_LANE_EXCLUDE=A,B             → (on 일 때) 지정 subType 만 gemini 잔류
// ============================================================================

import type { LunaLaneExt } from "./luna-ext-types";

// 선택형 (지문 무변형)
import { TITLE_LUNA_EXT } from "./luna-ext/title";
import { TOPIC_LUNA_EXT } from "./luna-ext/topic";
import { MAIN_IDEA_LUNA_EXT } from "./luna-ext/main-idea";
import { TOPIC_MAIN_IDEA_LUNA_EXT } from "./luna-ext/topic-main-idea";
import { IMPLIED_MEANING_LUNA_EXT } from "./luna-ext/implied-meaning";
import { REFERENCE_LUNA_EXT } from "./luna-ext/reference";
import { CONTENT_MATCH_LUNA_EXT } from "./luna-ext/content-match";

// 구조형 (지문 변형 — 재구성·보존 게이트)
import { SENTENCE_ORDER_LUNA_EXT } from "./luna-ext/sentence-order";
import { SENTENCE_INSERT_LUNA_EXT } from "./luna-ext/sentence-insert";
import { IRRELEVANT_LUNA_EXT } from "./luna-ext/irrelevant";
import { SUMMARY_COMPLETE_MC_LUNA_EXT } from "./luna-ext/summary-complete-mc";

// 어휘·치환 계열
import { ANTONYM_LUNA_EXT } from "./luna-ext/antonym";
import { SYNONYM_LUNA_EXT } from "./luna-ext/synonym";
import { VOCAB_CHOICE_LUNA_EXT } from "./luna-ext/vocab-choice";
import { CONTEXT_MEANING_LUNA_EXT } from "./luna-ext/context-meaning";
import { GRAMMAR_CHOICE_COMBO_LUNA_EXT } from "./luna-ext/grammar-choice-combo";
import { GRAMMAR_CORRECTION_LUNA_EXT } from "./luna-ext/grammar-correction";

// 서술형
import { CONDITIONAL_WRITING_LUNA_EXT } from "./luna-ext/conditional-writing";
import { SENTENCE_TRANSFORM_LUNA_EXT } from "./luna-ext/sentence-transform";
import { FILL_BLANK_KEY_LUNA_EXT } from "./luna-ext/fill-blank-key";
import { SUMMARY_COMPLETE_LUNA_EXT } from "./luna-ext/summary-complete";
import { SUMMARY_WRITING_LUNA_EXT } from "./luna-ext/summary-writing";
import { WORD_ORDER_LUNA_EXT } from "./luna-ext/word-order";
import { TOPIC_SENTENCE_WRITING_LUNA_EXT } from "./luna-ext/topic-sentence-writing";

const EXTS: LunaLaneExt[] = [
  TITLE_LUNA_EXT,
  TOPIC_LUNA_EXT,
  MAIN_IDEA_LUNA_EXT,
  TOPIC_MAIN_IDEA_LUNA_EXT,
  IMPLIED_MEANING_LUNA_EXT,
  REFERENCE_LUNA_EXT,
  CONTENT_MATCH_LUNA_EXT,
  SENTENCE_ORDER_LUNA_EXT,
  SENTENCE_INSERT_LUNA_EXT,
  IRRELEVANT_LUNA_EXT,
  SUMMARY_COMPLETE_MC_LUNA_EXT,
  ANTONYM_LUNA_EXT,
  SYNONYM_LUNA_EXT,
  VOCAB_CHOICE_LUNA_EXT,
  CONTEXT_MEANING_LUNA_EXT,
  GRAMMAR_CHOICE_COMBO_LUNA_EXT,
  GRAMMAR_CORRECTION_LUNA_EXT,
  CONDITIONAL_WRITING_LUNA_EXT,
  SENTENCE_TRANSFORM_LUNA_EXT,
  FILL_BLANK_KEY_LUNA_EXT,
  SUMMARY_COMPLETE_LUNA_EXT,
  SUMMARY_WRITING_LUNA_EXT,
  WORD_ORDER_LUNA_EXT,
  TOPIC_SENTENCE_WRITING_LUNA_EXT,
];

const BY_TYPE = new Map<string, LunaLaneExt>(EXTS.map((e) => [e.subType, e]));

// 등록 무결성 — subType 중복은 한 유형이 조용히 사라지는 사고다(lane-registry 동형).
if (BY_TYPE.size !== EXTS.length) {
  const seen = new Set<string>();
  const dup = EXTS.map((e) => e.subType).filter((t) =>
    seen.has(t) ? true : (seen.add(t), false),
  );
  throw new Error(`luna-ext subType 중복 등록: ${[...new Set(dup)].join(", ")}`);
}

/**
 * 판정에서 luna 우위가 확인되지 않아 gemini 를 잔류시키는 유형(코드 기본값).
 *
 * SENTENCE_INSERT(문장 삽입): **3라운드 연속 gemini 우세**로 보류.
 *   r3(대조 3.6-flash)  수율 6/8=6/8 · 내용 craft 5.17 vs 7.17 · 맞대결 0승 3패
 *   g37(대조 3.7-flash) 수율 7/8>6/8 · 내용 craft 5.57 vs 7.33 · 맞대결 1승 5패
 *   g37b(오답해설 밀도 규칙 투입) 수율 8/8>6/8 · 합산 craft 6.44 vs 6.83 · 맞대결 1승 5패
 * 2라운드 판정관이 "luna 가 1문장 계약을 지켜 감점됐다"는 교락 가설을 냈고, 밀도
 * 규칙(1문장 유지·지문 인용 필수)을 넣어 3라운드를 돌린 결과 **인용은 100% 달성
 * (오답 32줄 전수)했는데 맞대결 전적은 그대로 재현** — 가설이 실측으로 기각됐다.
 * 잔여 격차의 실체는 표적 문장 선정(지문 이해 없이 풀리는 문항 luna 2 vs g 0)과
 * 근거 사실성이다.
 * ⚠ 다만 이 유형 ext 만 해설에 글자수 하드캡(100자/문장·오답 120자)을 걸어 두었고
 *   공유 프롬프트(대조군 경로)에는 그 캡이 없다 — 남은 교락이며, 재도전 시 캡 해제
 *   + 표적 선정 규칙(후보 비교 허용) 수정 후 **지문 비중복 n≥28** 로 재측정하라.
 *   (다른 ext 의 글자 캡은 400자 이상이거나 해설이 아닌 선지·조건 길이라 무관 — 전수 확인함.)
 */
const DEFAULT_EXCLUDED_SUBTYPES = ["SENTENCE_INSERT"] as const;

/** 유형별 gemini 잔류 목록. env 로 덮어쓸 수 있다(빈 문자열이면 전 유형 luna). */
function excludedSubTypes(): Set<string> {
  const raw = process.env.QGEN_LUNA_LANE_EXCLUDE;
  if (raw === undefined) return new Set<string>(DEFAULT_EXCLUDED_SUBTYPES);
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

/** 레인 유형의 luna 확장. 옵트인 스위치·제외 목록이면 null(= gemini 경로 유지).
 * 26-08-19 전 라인업 3.7 통일(O226): QGEN_LUNA_LANE=on 일 때만 luna — 기본은
 * 전 유형 gemini(3.7). ext 의 검산 블록은 getLunaExtForSelfcheck 로 계속 쓴다. */
export function getLunaExt(subType: string): LunaLaneExt | null {
  if (process.env.QGEN_LUNA_LANE?.trim().toLowerCase() !== "on") return null;
  if (excludedSubTypes().has(subType)) return null;
  return BY_TYPE.get(subType) ?? null;
}

/** 검산 블록 전용 조회 — 킬스위치·제외 목록과 무관하게 등록 ext 를 준다.
 * (26-08-18 난이도 기반 티어) 레인 유형 KILLER 가 gemini md 로 갈 때 luna-ext 의
 * 모델 무관 검산(0원 게이트 반려 조건·기출 형식·사다리)을 그대로 붙이기 위함. */
export function getLunaExtForSelfcheck(subType: string): LunaLaneExt | null {
  return BY_TYPE.get(subType) ?? null;
}

/** 등록된 luna 확장 유형 목록(진단·테스트용). */
export const LUNA_EXT_SUBTYPES: readonly string[] = EXTS.map((e) => e.subType);
