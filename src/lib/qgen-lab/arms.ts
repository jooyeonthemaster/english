// qgen-lab 실험 팔(arm) 레지스트리 — 클라·서버 공용 순수 데이터.
// 기준선: 프로덕션 md-stream 어법 경로를 모델만 바꿔 재현한다(route.ts:242-264 요청 파라미터).
//   KILLER       = buildGrammarKillerV2Prompt + v2 인용·킬러 게이트 4종 (프리미엄 레인, 프로덕션 모델 gemini-3.7)
//   INTERMEDIATE = buildMdGrammarPrompt(INT) + 공용 검산 + 정답 위치 넛지 (스탠더드 레인)
// luna 는 프로덕션에서 KILLER 를 돈 적이 없다(KILLER→PREMIUM→luna 제외, route.ts:786-797) —
// K-L6-* 팔은 "같은 v2 경로에 모델만 교체"한 신규 조합이다.
// jev 팔은 JEV_ARMS 에 둔다(플래너 id 는 src/app/api/dev/qgen-lab/_lib/planners/index.ts 레지스트리 키).

import type { ArmConfig, GenModelConfig } from "./types";

export const GEMINI_37 = "google/gemini-3.7-flash";
export const LUNA_6 = "openai/gpt-6-luna";
export const LUNA_6_PRO = "openai/gpt-6-luna-pro";

const PROD_MAX_TOKENS = 14_000;

const g37 = (over: Partial<GenModelConfig> = {}): GenModelConfig => ({
  model: GEMINI_37,
  effort: "high",
  maxTokens: PROD_MAX_TOKENS,
  providerPin: null,
  format: "md",
  ...over,
});

const l6 = (over: Partial<GenModelConfig> = {}): GenModelConfig => ({
  model: LUNA_6,
  effort: "high",
  maxTokens: PROD_MAX_TOKENS,
  providerPin: ["openai"],
  format: "md",
  ...over,
});

const NO_PLAN = { id: "none", mode: "none" as const };
const NO_VERIFY = { id: "none" as const, onFail: "flag" as const };

// ── 기준선 + luna 변형 ─────────────────────────────────────────────────────

export const BASE_ARMS: ArmConfig[] = [
  {
    id: "K-G37",
    label: "킬러 · 제미나이 3.7 (프로덕션 그대로)",
    family: "gemini",
    difficulty: "KILLER",
    gen: g37(),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis: "프로덕션 기준선 — v2 프롬프트·게이트·재생성 1회, effort high, 14k",
    group: "baseline",
  },
  {
    id: "K-L6-low",
    label: "킬러 · luna 6 (effort low, 모델만 교체)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis:
      "luna 주력 — 같은 v2 md 경로에 모델만 gpt-6-luna/low. 탐침: 첫 시도 통과 12/18·$0.0009·27s(제미나이 $0.030·48s)",
    group: "baseline",
  },
  {
    id: "K-L6-medium",
    label: "킬러 · luna 6 (effort medium)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "medium" }),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis: "사고량 4배(탐침 92s·$0.004) — low 대비 품질 이득이 속도 손실을 정당화하는가",
    group: "luna-variant",
  },
  {
    id: "K-L6-high",
    label: "킬러 · luna 6 (effort high)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6(),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis: "탐침에선 비실용(14k 절단 5/9·180~234s) — 실제 UI 경로에서 재확인(선별 단계 전용)",
    group: "luna-variant",
  },
  {
    id: "K-L6pro-high",
    label: "킬러 · luna 6 Pro (reasoning pro 모드)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ model: LUNA_6_PRO }),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis: "탐침에선 빈 본문 2/3·과금 토큰 2배 — 실제 UI 경로에서 재확인(선별 단계 전용)",
    group: "luna-variant",
  },
  {
    id: "I-G37",
    label: "중급 · 제미나이 3.7 (프로덕션 그대로)",
    family: "gemini",
    difficulty: "INTERMEDIATE",
    gen: g37(),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis: "스탠더드 레인 기준선 — 공용 검산 + 정답 위치 넛지(시드 고정)",
    group: "baseline",
  },
  {
    id: "I-L6json-low",
    label: "중급 · luna 6 low (프로덕션 luna 레인 JSON)",
    family: "luna",
    difficulty: "INTERMEDIATE",
    gen: l6({ format: "luna-json", effort: "low" }),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis: "보존된 luna 레인(json_schema strict + 자가검산 + openai 핀)에 gpt-6-luna/low — 탐침 12/12·15s·$0.0006",
    group: "baseline",
  },
  {
    id: "I-L6md-low",
    label: "중급 · luna 6 low (제미나이와 같은 md 프롬프트)",
    family: "luna",
    difficulty: "INTERMEDIATE",
    gen: l6({ effort: "low" }),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    hypothesis: "조립 교란 제거 — 제미나이와 바이트 동일 프롬프트(공용 검산·넛지 포함)에서 모델 차이만",
    group: "luna-variant",
  },
];

// ── jev 팔(보정 결과 반영 후 확정 — 플래너 구현과 짝) ─────────────────────────
// 명명: <난이도>-<생성기>+J<설계>. 설계 코드:
//   jv = 생성 후 검증(D10) → 실패 시 재생성    jx = 검증 실패 시 다른 모델로 승급
//   ja = 정답 자리 1개 soft 제안(D7+D8)         jf = 정답+미끼 순위 목록 soft(D2/D6)
//   jh = 5자리 hard 지정(교사 포인트 채널, D9)   jc = LLM 후보 제안 → jev 선별(D13)
//   jl = hard 계획 + 생성기 effort low(속도 가설)
// 검증 규칙 파라미터(PLN-VERIFY 실측, 평가원 실물 37·실제 무효 4): 기본 τ=0.12 는 실물 통과 92% 지만 "다른 해석으로 문법적인"
// 무효를 0/4 만 잡는다 → τ=0.3 + 대명사·대용형 면제: 실물 통과 92%·실제 무효 3/4·오류없음/키오지정 100%(생성 유효본 통과 18/22).
const D10_PARAMS = { tau: 0.3, d7ExemptProForm: true };
const VERIFY_REGEN = { id: "jev-d10" as const, onFail: "regenerate" as const, params: D10_PARAMS };
const VERIFY_ESCALATE = { id: "jev-d10" as const, onFail: "escalate" as const, params: D10_PARAMS };
const ANSWER_SOFT = { id: "jev-answer-soft", mode: "soft" as const };
const FULL_SOFT = { id: "jev-full-soft", mode: "soft" as const };
const HARD = { id: "jev-hard", mode: "hard" as const };

type JevArmInput = Omit<ArmConfig, "group" | "planner" | "verifier"> & {
  planner?: ArmConfig["planner"];
  verifier?: ArmConfig["verifier"];
};
const jevArm = (a: JevArmInput): ArmConfig => ({ planner: NO_PLAN, verifier: NO_VERIFY, ...a, group: "jev" });

export const JEV_ARMS: ArmConfig[] = [
  // ── 사후 검증(D10+D7): jev 가 가장 강한 역할(평가원 실물 오류 88% 적중) ──
  jevArm({
    id: "K-G37+jv",
    label: "킬러 · 제미나이 3.7 + jev 사후검증→재생성",
    family: "gemini",
    difficulty: "KILLER",
    gen: g37(),
    verifier: VERIFY_REGEN,
    hypothesis: "기계적 실패(오류 없음·키 오지정·이중 오류)를 jev 가 걸러 재생성시키면 유효율이 오르는가(비용 +$0.0002)",
  }),
  jevArm({
    id: "K-L6low+jv",
    label: "킬러 · luna low + jev 사후검증→재생성",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    verifier: VERIFY_REGEN,
    hypothesis: "사고가 얕은 luna-low 의 결함을 jev 가 잡아 재생성 — 싼 값에 유효율 보강",
  }),
  jevArm({
    id: "K-L6low+jx",
    label: "킬러 · luna low → jev 검증 실패 시 제미나이 승급",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    verifier: VERIFY_ESCALATE,
    escalateTo: g37(),
    hypothesis: "OpenRouter 검증 캐스케이드 — 대부분 luna 값에 끝내고 실패분만 제미나이 요금",
  }),
  // ── 사전 출제 포인트(soft 추천 — 보정: top-1 약함, 목록은 유의) ──
  jevArm({
    id: "K-G37+ja",
    label: "킬러 · 제미나이 3.7 + jev 정답후보 추천(soft)",
    family: "gemini",
    difficulty: "KILLER",
    gen: g37(),
    planner: ANSWER_SOFT,
    hypothesis: "코드 후보→jev 순위→오형 유효성(D7) 통과 정답 후보 3개를 참고로 주면 정답 설계가 깊어지는가",
  }),
  jevArm({
    id: "K-L6low+ja",
    label: "킬러 · luna low + jev 정답후보 추천(soft)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    planner: ANSWER_SOFT,
    hypothesis: "사고 ~950토큰뿐인 luna-low 에 자리 조사를 jev 가 대신해 주면 킬러 깊이가 회복되는가",
  }),
  jevArm({
    id: "K-G37+jf",
    label: "킬러 · 제미나이 3.7 + jev 정답·미끼 목록(soft)",
    family: "gemini",
    difficulty: "KILLER",
    gen: g37(),
    planner: FULL_SOFT,
    hypothesis: "미끼 인벤토리(유혹도·코드 다양성)까지 주면 죽은 미끼가 줄어드는가",
  }),
  jevArm({
    id: "K-L6low+jf",
    label: "킬러 · luna low + jev 정답·미끼 목록(soft)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    planner: FULL_SOFT,
    hypothesis: "luna-low 의 설계 부담 전체를 jev 인벤토리로 덜어 주면",
  }),
  // ── hard 지정(대조군 — 과거 강제 자리 실패 83% 의 재현/반증) ──
  jevArm({
    id: "K-G37+jh",
    label: "킬러 · 제미나이 3.7 + jev 5자리 강제(교사 포인트)",
    family: "gemini",
    difficulty: "KILLER",
    gen: g37(),
    planner: HARD,
    hypothesis: "대조군 — jev 가 오형 유효성을 검증한 자리를 강제하면 과거 강제 실패(유효 83%)가 해소되는가",
  }),
  jevArm({
    id: "K-L6low+jh",
    label: "킬러 · luna low + jev 5자리 강제(교사 포인트)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    planner: HARD,
    hypothesis: "설계를 전부 jev 가 정하고 luna-low 는 쓰기만 — 속도·비용 최저선에서 품질이 버티는가",
  }),
  // ── best-of-N + jev 선별(보정: jev 는 고르기·검증에 강함) ──
  jevArm({
    id: "K-L6low+jb3",
    label: "킬러 · luna low ×3 병렬 → jev 선별",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    sampling: { n: 3, selector: "jev-select" },
    hypothesis: "luna 3개 값(≈$0.003)으로 병렬 생성하고 jev 가 검증·유효도·단서거리·미끼 유혹도로 1개 선별",
  }),
  {
    id: "K-L6low+b3",
    label: "킬러 · luna low ×3 병렬 → 첫 통과본(jev 없음, 대조군)",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    planner: NO_PLAN,
    verifier: NO_VERIFY,
    sampling: { n: 3, selector: "first-clean" },
    hypothesis: "대조군 — jb3 의 이득이 jev 선별 덕인지, 단지 3번 시도해 게이트 통과본을 얻은 덕인지 가른다",
    group: "luna-variant",
  },
  jevArm({
    id: "K-L6low+jb3+ja",
    label: "킬러 · luna low ×3 + jev 추천 → jev 선별",
    family: "luna",
    difficulty: "KILLER",
    gen: l6({ effort: "low" }),
    planner: ANSWER_SOFT,
    sampling: { n: 3, selector: "jev-select" },
    hypothesis: "사전 추천(다양성 원천) + 사후 선별 결합",
  }),
  // ── 중급 ──
  jevArm({
    id: "I-G37+ja",
    label: "중급 · 제미나이 3.7 + jev 정답후보 추천(soft)",
    family: "gemini",
    difficulty: "INTERMEDIATE",
    gen: g37(),
    planner: ANSWER_SOFT,
    hypothesis: "스탠더드 레인에서도 jev 추천이 도움이 되는가",
  }),
  jevArm({
    id: "I-L6json-low+ja",
    label: "중급 · luna low JSON + jev 정답후보 추천(soft)",
    family: "luna",
    difficulty: "INTERMEDIATE",
    gen: l6({ format: "luna-json", effort: "low" }),
    planner: ANSWER_SOFT,
    hypothesis: "luna 레인 + jev 추천",
  }),
];

// ── 구제 팔(RESCUE-SPEC §2 — 감독 축소판 26-09-25) ─────────────────────────────
// 0원 재생(replay)에서 사후 수리·교차·코드 조립이 격차를 못 닫는다는 결론 → 생성 시점 기전만 남긴다.
// 공통: planner NO_PLAN · verifier NO_VERIFY · sampling 없음 · strategy {id, params}(ENG/strategies/index.ts 레지스트리).
// 가드(§6): maxUsd 0.012 · softDeadlineMs 45s — 선택 단계(재생성·수정 콜) 직전 추정치로 건너뛸지 판단한다.
// 대조군은 기존 팔(K-G37 · K-L6-low · K-L6-medium)을 같은 배치에 섞는다.
const RESCUE_GUARD = { maxUsd: 0.012, softDeadlineMs: 45_000 };

type RescueArmInput = Pick<ArmConfig, "id" | "label" | "hypothesis"> & {
  strategy: { id: string; params?: Record<string, unknown> };
  gen?: GenModelConfig;
};
const rescueArm = (a: RescueArmInput): ArmConfig => ({
  id: a.id,
  label: a.label,
  family: "luna",
  difficulty: "KILLER",
  gen: a.gen ?? l6({ effort: "low" }),
  planner: NO_PLAN,
  verifier: NO_VERIFY,
  strategy: { id: a.strategy.id, params: { ...RESCUE_GUARD, ...(a.strategy.params ?? {}) } },
  hypothesis: a.hypothesis,
  group: "rescue",
});

export const RESCUE_ARMS: ArmConfig[] = [
  rescueArm({
    id: "K-L6low+icl",
    label: "킬러 · luna low + 검색형 다중 시연(ICL)",
    strategy: { id: "icl", params: { bank: "teacher" } },
    hypothesis: "검색형 다중 시연을 앞선 assistant 턴으로(SFT) — 평가원·제미나이 합격작의 자리 고르는 원리를 1콜에 싣는다",
  }),
  rescueArm({
    id: "K-L6low+cx",
    label: "킬러 · luna low + 대조 선호 카드·거울 점검줄",
    strategy: { id: "cx" },
    hypothesis: "죽은/산 미끼·R/J 정답 대조 카드 + 거울 점검줄(DPO) — 죽은 미끼·인지형 정답을 생성 시점에 피한다",
  }),
  rescueArm({
    id: "K-L6low+icl+cx",
    label: "킬러 · luna low + 시연 + 대조 카드(1콜, 수술 없음)",
    strategy: { id: "icl+cx", params: { bank: "teacher" } },
    hypothesis: "시연(SFT) + 대조 카드(DPO)를 한 콜에 — 사후 미끼 수술 없이 생성 시점 기전만의 결합 효과",
  }),
  rescueArm({
    id: "K-L6low+crit",
    label: "킬러 · luna low → 비평(코드·jev) → luna 수정",
    // 감독 결정(26-09-25): 45s 소프트 마감이면 수정 콜이 ~42% 건너뛰어 기전을 못 잰다 → 270s 벽·비용 가드 안에서 항상 수정.
    strategy: { id: "crit", params: { softDeadlineMs: 200_000 } },
    hypothesis: "초안 → 린트·jev 비평 + 검증 메뉴 → luna 수정 콜(RLAIF) — 수정본이 게이트에 지면 프로덕션 규칙으로 나은 쪽",
  }),
  rescueArm({
    id: "K-L6med+icl",
    label: "킬러 · luna medium + 검색형 다중 시연(ICL)",
    gen: l6({ effort: "medium" }),
    // medium 초안 1콜이 ~90s(K-L6-medium 탐침) — 45s 소프트 마감이면 재생성이 항상 막혀 대조군(K-L6-medium, 재생성 있음)과
    // 조건이 어긋난다. 소프트 마감만 120s 로 푼다(비용 가드 0.012 는 그대로).
    strategy: { id: "icl", params: { bank: "teacher", effort: "medium", softDeadlineMs: 120_000 } },
    hypothesis: "icl 과 같은 시연 1콜을 effort medium 으로 — 사고량이 시연 흡수를 돕는가(대조: K-L6-medium)",
  }),
];

export const ALL_ARMS: ArmConfig[] = [...BASE_ARMS, ...JEV_ARMS, ...RESCUE_ARMS];

export function getArm(id: string): ArmConfig | undefined {
  return ALL_ARMS.find((a) => a.id === id);
}
