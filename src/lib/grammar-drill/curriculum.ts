// ============================================================================
// 어법 드릴 — 커리큘럼 백본 (12유닛 × 47 미세개념)
//
// 출처: 어법편_12유닛.pdf(강사 제공, 2026-07-10) + grammar-point-catalog.ts
// (어법끝 28년 빈도 데이터) + grammar-frames.ts(9프레임). 유닛 구획과 출제율은
// 어법편 문서의 1~3부 체제를 그대로 따르고, 미세개념 분해는 드릴 서빙 단위
// (취약점 추적의 최소 축)에 맞춰 유닛당 3~4개로 설계했다.
//
// 개념 카드 본문(알고리즘·규칙·함정)은 src/data/grammar-drill/concepts/*.json,
// 문항 뱅크는 src/data/grammar-drill/items/*.json — 이 파일은 ID·구조의 정본이며
// scripts/verify-grammar-drill-bundle.ts 가 데이터 파일과의 정합을 검증한다.
// ============================================================================

import type { GrammarPart, GrammarUnit } from "./types";

export interface ConceptSkeleton {
  id: string;
  unitId: string;
  order: number;
  title: string;
  oneLiner: string;
}

export const GRAMMAR_PARTS: GrammarPart[] = [
  {
    part: 1,
    name: "골격기",
    tagline: "문장의 뼈대 판별 — 이 5개로 선지의 60%가 커버됩니다",
    unitIds: ["u01", "u02", "u03", "u04", "u05"],
  },
  {
    part: 2,
    name: "연결기",
    tagline: "절과 절의 관계 — 여기까지 오면 85%에 도달합니다",
    unitIds: ["u06", "u07", "u08", "u09"],
  },
  {
    part: 3,
    name: "정밀기",
    tagline: "형태·호응의 미세 판단 — 실전 방어선을 완성합니다",
    unitIds: ["u10", "u11", "u12"],
  },
];

export const GRAMMAR_UNITS: GrammarUnit[] = [
  {
    id: "u01",
    order: 1,
    part: 1,
    title: "동사 vs 준동사",
    subtitle: "이 절에 본동사가 있는가",
    frequency: 5,
    frequencyNote: "30회분 선지 약 28~30회 — 사실상 매회 출제",
    conceptIds: ["u01-c1", "u01-c2", "u01-c3", "u01-c4"],
  },
  {
    id: "u02",
    order: 2,
    part: 1,
    title: "주어-동사 수일치",
    subtitle: "동사의 수는 진짜 주어가 결정한다",
    frequency: 5,
    frequencyNote: "30회분 선지 약 22~25회 — 수식어 삽입 패턴과 결합 출제",
    conceptIds: ["u02-c1", "u02-c2", "u02-c3", "u02-c4"],
  },
  {
    id: "u03",
    order: 3,
    part: 1,
    title: "능동 vs 수동 (태)",
    subtitle: "주어가 하는가, 당하는가",
    frequency: 4,
    frequencyNote: "30회분 선지 약 18~20회",
    conceptIds: ["u03-c1", "u03-c2", "u03-c3", "u03-c4"],
  },
  {
    id: "u04",
    order: 4,
    part: 1,
    title: "현재분사 vs 과거분사",
    subtitle: "꾸며지는 명사와의 능·수동 관계",
    frequency: 4,
    frequencyNote: "30회분 선지 약 16~18회",
    conceptIds: ["u04-c1", "u04-c2", "u04-c3", "u04-c4"],
  },
  {
    id: "u05",
    order: 5,
    part: 1,
    title: "병렬구조",
    subtitle: "and/or/but 앞뒤의 형태 일치",
    frequency: 4,
    frequencyNote: "30회분 선지 약 14~16회",
    conceptIds: ["u05-c1", "u05-c2", "u05-c3", "u05-c4"],
  },
  {
    id: "u06",
    order: 6,
    part: 2,
    title: "관계사 ① — what vs that/which",
    subtitle: "선행사가 있는가 없는가",
    frequency: 4,
    frequencyNote: "30회분 선지 약 15~17회 — 최근 6년 오답 선택 1위 함정",
    conceptIds: ["u06-c1", "u06-c2", "u06-c3", "u06-c4"],
  },
  {
    id: "u07",
    order: 7,
    part: 2,
    title: "관계사 ② — 관계대명사 vs 관계부사",
    subtitle: "뒤 절이 완전한가 불완전한가",
    frequency: 3,
    frequencyNote: "30회분 선지 약 10~12회 — in which류 포함",
    conceptIds: ["u07-c1", "u07-c2", "u07-c3", "u07-c4"],
  },
  {
    id: "u08",
    order: 8,
    part: 2,
    title: "접속사 vs 전치사",
    subtitle: "뒤에 절이 오는가, 명사가 오는가",
    frequency: 3,
    frequencyNote: "30회분 선지 약 8~10회",
    conceptIds: ["u08-c1", "u08-c2", "u08-c3"],
  },
  {
    id: "u09",
    order: 9,
    part: 2,
    title: "분사구문",
    subtitle: "생략된 주어를 복원해 능·수동 판단",
    frequency: 3,
    frequencyNote: "30회분 선지 약 8~9회 — U4+U8 개념의 결합 지점",
    conceptIds: ["u09-c1", "u09-c2", "u09-c3", "u09-c4"],
  },
  {
    id: "u10",
    order: 10,
    part: 3,
    title: "형용사 vs 부사 · 대명사",
    subtitle: "무엇을 꾸미고, 무엇을 가리키는가",
    frequency: 4,
    frequencyNote: "형·부 약 12~14회 / 대명사 약 10~12회",
    conceptIds: ["u10-c1", "u10-c2", "u10-c3", "u10-c4"],
  },
  {
    id: "u11",
    order: 11,
    part: 3,
    title: "to부정사 vs 동명사 · 대동사 · 시제",
    subtitle: "동사와 목적어·시간의 호응",
    frequency: 3,
    frequencyNote: "합산 약 10~12회 — 개별 빈도는 낮으나 합산 시 무시 불가",
    conceptIds: ["u11-c1", "u11-c2", "u11-c3", "u11-c4"],
  },
  {
    id: "u12",
    order: 12,
    part: 3,
    title: "도치 · 가정법 · 비교 · 어순",
    subtitle: "저빈도 포인트 통합 방어선",
    frequency: 2,
    frequencyNote: "합산 약 8~10회",
    conceptIds: ["u12-c1", "u12-c2", "u12-c3", "u12-c4"],
  },
];

export const GRAMMAR_CONCEPT_SKELETONS: ConceptSkeleton[] = [
  // ── U1 동사 vs 준동사 ──
  {
    id: "u01-c1",
    unitId: "u01",
    order: 1,
    title: "본동사 하나 원칙",
    oneLiner: "한 문장(절)에는 본동사가 반드시 하나 있어야 합니다.",
  },
  {
    id: "u01-c2",
    unitId: "u01",
    order: 2,
    title: "준동사는 본동사가 될 수 없다",
    oneLiner: "-ing·to부정사·p.p.는 혼자서 문장의 동사 노릇을 못 합니다.",
  },
  {
    id: "u01-c3",
    unitId: "u01",
    order: 3,
    title: "동사 개수 = 접속사·관계사 개수 + 1",
    oneLiner: "접속사·관계사 없이 한 절에 동사가 두 개일 수 없습니다.",
  },
  {
    id: "u01-c4",
    unitId: "u01",
    order: 4,
    title: "동형 함정 — 과거형인가 과거분사인가",
    oneLiner:
      "과거형과 p.p.가 같은 동사의 후치 수식을 본동사로 착각하게 만드는 함정입니다.",
  },
  // ── U2 수일치 ──
  {
    id: "u02-c1",
    unitId: "u02",
    order: 1,
    title: "진짜 주어 찾기 — 수식어 괄호치기",
    oneLiner: "주어와 동사 사이의 전치사구·관계사절·분사구는 괄호로 묶고 무시합니다.",
  },
  {
    id: "u02-c2",
    unitId: "u02",
    order: 2,
    title: "단수 취급어",
    oneLiner: "each·every·-thing/-one/-body, 동명사구·명사절 주어는 단수입니다.",
  },
  {
    id: "u02-c3",
    unitId: "u02",
    order: 3,
    title: "수량 표현의 수",
    oneLiner:
      "the number of는 단수, a number of는 복수, 부분 표현은 of 뒤 명사를 봅니다.",
  },
  {
    id: "u02-c4",
    unitId: "u02",
    order: 4,
    title: "도치문의 수일치",
    oneLiner: "There·장소구·부정어 도치에서는 동사 뒤 진짜 주어와 일치시킵니다.",
  },
  // ── U3 태 ──
  {
    id: "u03-c1",
    unitId: "u03",
    order: 1,
    title: "능·수동 기본 판단",
    oneLiner: "주어가 동작을 하면 능동, 받으면 수동(be+p.p.)입니다.",
  },
  {
    id: "u03-c2",
    unitId: "u03",
    order: 2,
    title: "목적어 유무 판단법과 관계절 함정",
    oneLiner:
      "뒤에 목적어가 있으면 능동 — 단, 관계절에서 목적어가 앞으로 빠진 자리는 능동 유지입니다.",
  },
  {
    id: "u03-c3",
    unitId: "u03",
    order: 3,
    title: "자동사는 수동 불가",
    oneLiner: "occur·happen·appear·arise·remain은 수동태로 쓸 수 없습니다.",
  },
  {
    id: "u03-c4",
    unitId: "u03",
    order: 4,
    title: "복합 시제의 수동",
    oneLiner: "완료 수동은 have been p.p., 진행 수동은 be being p.p.입니다.",
  },
  // ── U4 분사 ──
  {
    id: "u04-c1",
    unitId: "u04",
    order: 1,
    title: "명사 수식 분사의 능·수동",
    oneLiner: "꾸며지는 명사가 '하는' 쪽이면 -ing, '되는' 쪽이면 p.p.입니다.",
  },
  {
    id: "u04-c2",
    unitId: "u04",
    order: 2,
    title: "감정동사 분사",
    oneLiner: "감정을 일으키면 -ing, 감정을 느끼면 p.p.입니다.",
  },
  {
    id: "u04-c3",
    unitId: "u04",
    order: 3,
    title: "보어 자리의 분사",
    oneLiner: "be·find·keep 뒤 보어 자리에서도 능·수동 원리는 동일합니다.",
  },
  {
    id: "u04-c4",
    unitId: "u04",
    order: 4,
    title: "자동사 분사 예외",
    oneLiner:
      "진행·미완이면 목적어 없이도 -ing(a sleeping baby), 완료면 p.p.(fallen leaves) — '목적어 없으면 p.p.' 암기의 반례입니다.",
  },
  // ── U5 병렬 ──
  {
    id: "u05-c1",
    unitId: "u05",
    order: 1,
    title: "등위접속사 병렬 — 짝 찾기",
    oneLiner: "and/or/but을 보면 무엇과 무엇이 연결되는지 짝부터 찾습니다.",
  },
  {
    id: "u05-c2",
    unitId: "u05",
    order: 2,
    title: "상관접속사 병렬",
    oneLiner: "both A and B, not only A but also B — A와 B의 형태를 일치시킵니다.",
  },
  {
    id: "u05-c3",
    unitId: "u05",
    order: 3,
    title: "조동사·to의 공유 병렬",
    oneLiner: "can pay or visit처럼 조동사·to가 뒤 항에 공유되는 병렬입니다.",
  },
  {
    id: "u05-c4",
    unitId: "u05",
    order: 4,
    title: "전치사+동명사 병렬",
    oneLiner: "less about recording and more about thinking형 병렬입니다.",
  },
  // ── U6 관계사① ──
  {
    id: "u06-c1",
    unitId: "u06",
    order: 1,
    title: "선행사 유무 판단",
    oneLiner: "앞에 선행사(명사)가 있으면 that/which, 없으면 what입니다.",
  },
  {
    id: "u06-c2",
    unitId: "u06",
    order: 2,
    title: "명사절 that vs what — 절의 완전성",
    oneLiner: "that은 완전한 절, what은 불완전한 절(성분 결손)을 이끕니다.",
  },
  {
    id: "u06-c3",
    unitId: "u06",
    order: 3,
    title: "콤마+which 계속적 용법",
    oneLiner: "콤마+which는 앞 절 전체를 받을 수 있고, that·what은 불가합니다.",
  },
  {
    id: "u06-c4",
    unitId: "u06",
    order: 4,
    title: "관계대명사 that vs 접속사 that",
    oneLiner: "뒤 절이 불완전하면 관계대명사, 완전하면 접속사 that입니다.",
  },
  // ── U7 관계사② ──
  {
    id: "u07-c1",
    unitId: "u07",
    order: 1,
    title: "절의 완전성 판단법",
    oneLiner: "주어·목적어가 빠졌으면 불완전 → 관계대명사, 다 있으면 완전 → 관계부사입니다.",
  },
  {
    id: "u07-c2",
    unitId: "u07",
    order: 2,
    title: "관계부사 4종과 선행사",
    oneLiner: "where/when/why/how — 선행사가 아니라 뒤 절의 완전성이 기준입니다.",
  },
  {
    id: "u07-c3",
    unitId: "u07",
    order: 3,
    title: "전치사 + 관계대명사",
    oneLiner: "in which·for which는 관계부사와 같은 자리(완전한 절 앞)에 섭니다.",
  },
  {
    id: "u07-c4",
    unitId: "u07",
    order: 4,
    title: "함정 — 장소 선행사에 낚이지 않기",
    oneLiner:
      "선행사가 장소여도 뒤 절이 불완전하면 which — 추상 선행사+where 함정을 경계합니다.",
  },
  // ── U8 접속사 vs 전치사 ──
  {
    id: "u08-c1",
    unitId: "u08",
    order: 1,
    title: "절 vs 명사구 판별",
    oneLiner: "밑줄 바로 뒤에 '주어+동사'가 있으면 접속사, 명사(구)뿐이면 전치사입니다.",
  },
  {
    id: "u08-c2",
    unitId: "u08",
    order: 2,
    title: "대표 짝 암기",
    oneLiner: "while/during, although/despite, because/because of — 짝으로 판단합니다.",
  },
  {
    id: "u08-c3",
    unitId: "u08",
    order: 3,
    title: "확장 짝과 구접속사",
    oneLiner: "unless·once·now that 등 절을 이끄는 표현과 전치사구를 구분합니다.",
  },
  // ── U9 분사구문 ──
  {
    id: "u09-c1",
    unitId: "u09",
    order: 1,
    title: "분사구문의 원리",
    oneLiner: "'접속사+주어+동사'를 분사로 압축한 구문 — 주절 주어 기준으로 읽습니다.",
  },
  {
    id: "u09-c2",
    unitId: "u09",
    order: 2,
    title: "분사구문의 능·수동",
    oneLiner: "주절 주어와 능동 관계면 -ing, 수동 관계면 p.p.(Being 생략)입니다.",
  },
  {
    id: "u09-c3",
    unitId: "u09",
    order: 3,
    title: "완료·부정·접속사 잔류",
    oneLiner: "Having p.p.(앞선 시간), Not+분사(부정), if eaten형(접속사 잔류)입니다.",
  },
  {
    id: "u09-c4",
    unitId: "u09",
    order: 4,
    title: "독립분사구문과 with 부대상황",
    oneLiner: "주어가 다르면 분사 앞에 주어를 남기고, with+O+분사는 O가 의미상 주어입니다.",
  },
  // ── U10 형·부·대명사 ──
  {
    id: "u10-c1",
    unitId: "u10",
    order: 1,
    title: "형용사 자리 vs 부사 자리",
    oneLiner: "명사 수식·보어 자리는 형용사, 동사·형용사·문장 수식은 부사입니다.",
  },
  {
    id: "u10-c2",
    unitId: "u10",
    order: 2,
    title: "혼동 부사",
    oneLiner: "hard/hardly, late/lately, high/highly — 형태가 다르면 뜻도 다릅니다.",
  },
  {
    id: "u10-c3",
    unitId: "u10",
    order: 3,
    title: "대명사 수일치",
    oneLiner: "it/they, that/those — 가리키는 명사의 수와 일치시킵니다.",
  },
  {
    id: "u10-c4",
    unitId: "u10",
    order: 4,
    title: "재귀대명사",
    oneLiner: "주어와 목적어가 같은 대상이면 -self/-selves를 씁니다.",
  },
  // ── U11 준동사 목적어·대동사·시제 ──
  {
    id: "u11-c1",
    unitId: "u11",
    order: 1,
    title: "동명사 목적어 vs to부정사 목적어",
    oneLiner: "enjoy·finish·avoid는 동명사만, want·decide·hope는 to부정사만 취합니다.",
  },
  {
    id: "u11-c2",
    unitId: "u11",
    order: 2,
    title: "의미가 갈리는 동사",
    oneLiner: "remember/forget/try + -ing(과거의 일) vs to-V(앞으로의 일)입니다.",
  },
  {
    id: "u11-c3",
    unitId: "u11",
    order: 3,
    title: "대동사 do vs be",
    oneLiner: "일반동사를 대신하면 do/does/did, be동사를 대신하면 be입니다.",
  },
  {
    id: "u11-c4",
    unitId: "u11",
    order: 4,
    title: "시제 호응",
    oneLiner: "since+과거 시점 → 현재완료, ago·last year 등 명백한 과거 부사 → 과거시제입니다.",
  },
  // ── U12 도치·가정법·비교·어순 ──
  {
    id: "u12-c1",
    unitId: "u12",
    order: 1,
    title: "부정어 도치 · so/neither",
    oneLiner: "부정어(never·rarely·not until·only+부사구)가 문두에 오면 조동사+주어 도치입니다.",
  },
  {
    id: "u12-c2",
    unitId: "u12",
    order: 2,
    title: "가정법",
    oneLiner: "If+과거형 → would+원형, without/but for = if it were not for입니다.",
  },
  {
    id: "u12-c3",
    unitId: "u12",
    order: 3,
    title: "비교구문",
    oneLiner: "as+원급+as, the 비교급 ~ the 비교급, 배수 표현의 형태를 지킵니다.",
  },
  {
    id: "u12-c4",
    unitId: "u12",
    order: 4,
    title: "간접의문문 · enough 어순",
    oneLiner: "의문사+주어+동사 어순(도치 금지), 형용사+enough 어순입니다.",
  },
];

// ── 조회 헬퍼 ────────────────────────────────────────────────────────────────

export const UNIT_BY_ID = new Map(GRAMMAR_UNITS.map((u) => [u.id, u]));
export const CONCEPT_SKELETON_BY_ID = new Map(
  GRAMMAR_CONCEPT_SKELETONS.map((c) => [c.id, c]),
);
export const PART_BY_UNIT_ID = new Map(
  GRAMMAR_PARTS.flatMap((p) => p.unitIds.map((u) => [u, p] as const)),
);

export function unitNumber(unitId: string): number {
  return Number(unitId.replace("u", ""));
}
