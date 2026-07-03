// ============================================================================
// KO 품질코드 정의 + 3집합 분류 명세 (KO-DESIGN-SPEC §7)
// ============================================================================
// 3집합 불변식 (영어 파이프라인과 공유):
//   - SHIP_FIRST_WARNING_CODES(core.ts): KO 코드 등록 금지 (전부 실결함 게이트)
//   - RELAXED_BLOCKING_QUALITY_CODES(run-question-generation-constants.ts):
//     KO_BLOCKING_CODES 전부 등록 — relaxed 폴백에서도 차단 유지
//     (미등록 error 는 relaxed 에서 warning 강등 출하됨 — 판정단 실측)
//   - BLOCKING_EDIT_CODES(edit-guards.ts): KO_EDIT_BLOCKING_CODES 만 등록
//     (SHIP_FIRST ∩ BLOCKING_EDIT = ∅ 불변식 자동 충족 — KO 는 SHIP_FIRST 에 없음)
// ============================================================================

/** relaxed 폴백에서도 차단되어야 하는 구조·정답 무결성 결함. */
export const KO_BLOCKING_CODES = [
  "ko-option-count",
  "ko-evidence-missing",
  "ko-evidence-not-in-passage",
  "ko-quote-not-verbatim",
  "ko-marker-unresolved",
  "ko-marker-overlap",
  "ko-marker-option-mismatch",
  "ko-answer-leak",
  "ko-bogi-missing",
  "ko-direction-grammar",
  "ko-condition-rubric-mismatch",
  "ko-extract-not-unique",
  "ko-solver-mismatch",
  "ko-correct-answer-invalid",
  // 자체자료(koStimulus) 필수 유형(화법·작문·매체·국어사)의 자료 결손 —
  // 공통 게이트(quality/common.ts validateKoStimulusCommon)가 error 로 발화.
  // 자료가 곧 문항 몸통이라 미생성이 잘못 생성보다 낫다(relaxed 에서도 차단).
  "ko-stimulus-missing",
  // 렌더 불가 글리프(옛한글 첫가끝 조합 자모·아래아) — 공통 게이트는 warning
  // (비차단, RELAXED_BLOCKING 은 error 만 필터), KO_GR_HIST(국어사)는 전 표면
  // error 로 승격해 출하 차단(v1 렌더 폰트 미보장 — 깨진 글리프 출력 방지).
  "ko-render-fallback",
  // [KO-W1-2] 원문(자료)에 마커 글리프(㉠~㉭·ⓐ~ⓙ)가 리터럴로 박힌 채 markers
  // 가 같은 표면을 다시 마킹 → 렌더 이중 마커 확정(KO_WR_REVISE 판정단 critical).
  // 혼합 등급 코드: 이중 마커 확정만 error(차단), baked-in 단독·지문 표면은
  // warning(비차단 — RELAXED_BLOCKING 은 error 만 필터하므로 안전).
  "ko-marker-glyph-in-source",
] as const;

/** AI 편집 경로에서도 차단할 코드 (BLOCKING_EDIT_CODES 등록 대상). */
export const KO_EDIT_BLOCKING_CODES = [
  "ko-evidence-not-in-passage",
  "ko-quote-not-verbatim",
  "ko-marker-unresolved",
] as const;

/** warning 전용 (차단 아님 — 검수 UI 가시성). */
export const KO_WARNING_CODES = [
  "ko-option-ending",
  "ko-negative-stem-mismatch",
  "ko-marker-hierarchy",
  "ko-marker-order",
  "ko-points-unusual",
  // 자체자료 kind 가 유형 선언(stimulusKinds) 밖 — 공통 게이트(warning 전용).
  "ko-stimulus-kind",
  // KO_GR_PHONO: 골드맵(음운 변동 판정표)이 사례를 전부 커버하지 못함.
  "ko-phono-goldmap-uncovered",
  // KO_LIT_FACT: 정서 극성 반전 함정의 문항당 1회 한정 위반.
  "ko-distortion-overuse",
  // [KO-W1-3] 마커가 선언됐는데 발문·선지·<보기> 어디서도 지칭되지 않음
  // (설명 없는 마킹이 학생에게 노출 — KO_LIT_FACT 판정단 실증).
  "ko-marker-orphan",
  // [KO-W1-4] 선지·해설의 이질 표기 — 그리스·수학 기호(Δ 등)·고립 라틴 용어
  // (KO_GR_PHONO 'Δ=-1' 실증). 정당한 병기·지문 인용은 면제(과탐 보수 설계).
  "ko-foreign-lexeme",
  // [KO-W1-5] MC5 정답 선지가 유일 최장 + 나머지 평균 1.35배 초과 — 길이
  // 휴리스틱 정답 노출(KO_RD_STRUCT 실증).
  "ko-answer-length-bias",
] as const;

export type KoBlockingCode = (typeof KO_BLOCKING_CODES)[number];
export type KoWarningCode = (typeof KO_WARNING_CODES)[number];

export const KO_BLOCKING_CODE_SET: ReadonlySet<string> = new Set(KO_BLOCKING_CODES);
