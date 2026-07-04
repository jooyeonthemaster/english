// generation-config-panel.tsx 에서 분리한 모듈 레벨 상수 (verbatim 이동).

export const VOCAB_GENERATION_TYPE_IDS = new Set([
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);
export const TYPE_ORDER_STORAGE_KEY =
  "smoat.workbench.questions.generate.typeOrder.v1";
// 카테고리 그룹 접힘 상태(UI 취향) — 유형 목록을 3개 카테고리 카드로 묶고
// 각 카드를 접을 수 있게 한다. 투어 중에는 강제로 모두 펼친다.
export const GROUP_COLLAPSE_STORAGE_KEY =
  "smoat.workbench.questions.generate.groupCollapsed.v1";
// 렌더 순서(고정): 수능 → 내신 → 어휘 → (국어 4그룹). 정렬(typeOrder)은 그룹
// 내부에만 적용된다. 국어 prefix 는 패널의 subject 게이트(passageSubject) 하에서만
// 유형이 채워진다 — 영어 지문 패널에서는 빈 그룹으로 걸러져 렌더되지 않는다.
// (prefix 미등록 시 KO 유형이 UI 에서 조용히 소실 — KO-DESIGN-SPEC §1 최우선 지점)
export const GROUP_ORDER = [
  "수능",
  "내신",
  "어휘",
  "국어 독서",
  "국어 문학",
  "국어 문법",
  "국어 화법·작문·매체",
  "국어 서답형",
] as const;
export const GROUP_LABELS: Record<string, string> = {
  수능: "수능·모의고사 객관식",
  내신: "내신 서술형",
  어휘: "어휘",
  "국어 독서": "국어 독서",
  "국어 문학": "국어 문학",
  "국어 문법": "국어 문법",
  "국어 화법·작문·매체": "국어 화법·작문·매체",
  "국어 서답형": "국어 내신 서답형",
};

// Difficulty — 세그먼트 컨트롤. 단계 식별은 컬러 닷 + 난이도별 면색(SOT).
// 색은 src/lib/difficulty.ts 와 동일(기본=파랑·중급=노랑·킬러=빨강) — 전 화면 일관.
export const DIFFICULTY_TONES = [
  { value: "BASIC", label: "기본", on: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  { value: "INTERMEDIATE", label: "중급", on: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  { value: "KILLER", label: "킬러", on: "bg-red-50 text-red-700", dot: "bg-red-500" },
] as const;
