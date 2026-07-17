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
    part: 0,
    name: "기초 골격",
    tagline: "문장이 어떻게 생겼는가 — 초·중등 도입 문법의 전 과정입니다",
    unitIds: ["b01", "b02", "b03", "b04", "b05", "b06", "b07"],
  },
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

/**
 * PART 0 — 기초 골격 (신설, 2026-07-15).
 * 근거: 2015 개정 교육과정 [별책14] [별표4] '의사소통에 필요한 언어 형식'의 학교급 ● 표기
 * (예문 350개 = 초 75 / 중 192 / 고 83) + 천일문 중등 GRAMMAR Level 1~3 목차.
 * frequency 는 null — 수능 어법 판별 대상이 아니며, 출처 없는 빈도 숫자를 지어내지 않는다.
 * 해금은 JUDGE(u01~u12) 트랙과 완전히 독립이다(무회귀).
 */
const BASIC_UNITS: Omit<GrammarUnit, "unlockGroup" | "stageSet">[] = [
  {
    id: "b01",
    order: 1,
    part: 0,
    title: "품사와 문장성분",
    subtitle: "단어의 신분증과 문장 속 배역",
    frequency: null,
    frequencyNote: "도입 초4~중1 — 모든 어법 판별의 전제입니다",
    conceptIds: ["b01-c1", "b01-c2", "b01-c3", "b01-c4"],
  },
  {
    id: "b02",
    order: 2,
    part: 0,
    title: "문장의 다섯 형식",
    subtitle: "동사가 문장의 모양을 결정한다",
    frequency: null,
    frequencyNote: "도입 초6~중2 — 목적격보어 형태는 수능 판별로 이어집니다",
    conceptIds: ["b02-c1", "b02-c2", "b02-c3", "b02-c4"],
  },
  {
    id: "b03",
    order: 3,
    part: 0,
    title: "동사와 시제의 기본",
    subtitle: "언제 일어난 일인가",
    frequency: null,
    frequencyNote: "도입 초3~중3 — 현재완료·시간조건절은 중2~고1",
    conceptIds: ["b03-c1", "b03-c2", "b03-c3", "b03-c4", "b03-c5"],
  },
  {
    id: "b04",
    order: 4,
    part: 0,
    title: "조동사",
    subtitle: "동사에 태도를 얹는다",
    frequency: null,
    frequencyNote: "도입 초4~고1 — 조동사+have p.p.와 제안·요구 that절은 고1",
    conceptIds: ["b04-c1", "b04-c2", "b04-c3"],
  },
  {
    id: "b05",
    order: 5,
    part: 0,
    title: "명사·관사·대명사",
    subtitle: "무엇을 가리키는가",
    frequency: null,
    frequencyNote: "도입 초5~고1 — 대명사 수일치는 수능 판별 대상입니다",
    conceptIds: ["b05-c1", "b05-c2", "b05-c3", "b05-c4"],
  },
  {
    id: "b06",
    order: 6,
    part: 0,
    title: "형용사·부사·비교",
    subtitle: "무엇을 꾸미고, 무엇과 견주는가",
    frequency: null,
    frequencyNote: "도입 초6~고1 — 비교급은 초등에서 이미 시작됩니다(별표4 초 ●)",
    conceptIds: ["b06-c1", "b06-c2", "b06-c3", "b06-c4"],
  },
  {
    id: "b07",
    order: 7,
    part: 0,
    title: "전치사·접속사·절",
    subtitle: "문장을 잇는 부품",
    frequency: null,
    frequencyNote: "도입 중1~중3 — 접속사 vs 전치사 판별(U8)의 전제입니다",
    conceptIds: ["b07-c1", "b07-c2", "b07-c3", "b07-c4"],
  },
];

const JUDGE_UNITS: Omit<GrammarUnit, "unlockGroup" | "stageSet">[] = [
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

/**
 * 전체 유닛 = 기초(BASIC) 7 + 판별(JUDGE) 12 = 19유닛.
 * 두 그룹은 해금이 독립이다 — computeUnlockedUnits(engine.ts)가 그룹별로 순차 계산한다.
 */
export const GRAMMAR_UNITS: GrammarUnit[] = [
  ...BASIC_UNITS.map((u) => ({
    ...u,
    unlockGroup: "BASIC" as const,
    stageSet: "BASIC" as const,
  })),
  ...JUDGE_UNITS.map((u) => ({
    ...u,
    unlockGroup: "JUDGE" as const,
    stageSet: "FULL" as const,
  })),
];

export const GRAMMAR_CONCEPT_SKELETONS: ConceptSkeleton[] = [
  // ══ PART 0 · 기초 골격 ══════════════════════════════════════════════════
  // ── B1 품사와 문장성분 ──
  {
    id: "b01-c1",
    unitId: "b01",
    order: 1,
    title: "8품사 — 단어의 신분증",
    oneLiner: "단어는 형태가 아니라 문장에서 맡는 일로 품사가 정해집니다.",
  },
  {
    id: "b01-c2",
    unitId: "b01",
    order: 2,
    title: "문장성분 — 주어·동사·목적어·보어",
    oneLiner: "문장의 뼈대는 주어와 동사이고, 나머지는 동사가 부릅니다.",
  },
  {
    id: "b01-c3",
    unitId: "b01",
    order: 3,
    title: "구와 절 — 동사가 있으면 절",
    oneLiner: "주어와 동사를 갖춘 덩어리가 절, 그렇지 않은 덩어리가 구입니다.",
  },
  {
    id: "b01-c4",
    unitId: "b01",
    order: 4,
    title: "수식어 걷어내기",
    oneLiner: "전치사구·관계절·분사구를 괄호로 묶으면 문장의 뼈대만 남습니다.",
  },
  // ── B2 문장의 다섯 형식 ──
  {
    id: "b02-c1",
    unitId: "b02",
    order: 1,
    title: "1형식 SV · 2형식 SVC",
    oneLiner: "보어가 필요한 동사(be·become·look)와 필요 없는 동사를 가릅니다.",
  },
  {
    id: "b02-c2",
    unitId: "b02",
    order: 2,
    title: "3형식 SVO — 목적어를 받는 동사",
    oneLiner: "목적어를 바로 받는 타동사와 전치사가 필요한 자동사를 구별합니다.",
  },
  {
    id: "b02-c3",
    unitId: "b02",
    order: 3,
    title: "4형식 SVOO — 목적어가 둘",
    oneLiner: "간접목적어와 직접목적어의 순서, 3형식 전환 시 전치사를 익힙니다.",
  },
  {
    id: "b02-c4",
    unitId: "b02",
    order: 4,
    title: "5형식 SVOC — 목적격보어의 형태",
    oneLiner: "동사가 목적격보어의 형태(원형·to부정사·-ing·p.p.)를 결정합니다.",
  },
  // ── B3 동사와 시제의 기본 ──
  {
    id: "b03-c1",
    unitId: "b03",
    order: 1,
    title: "be동사와 일반동사",
    oneLiner: "한 문장에 be동사와 일반동사를 함께 세울 수 없습니다.",
  },
  {
    id: "b03-c2",
    unitId: "b03",
    order: 2,
    title: "현재·과거·미래",
    oneLiner: "시제는 동사의 형태로 드러나며, 시간 부사와 호응해야 합니다.",
  },
  {
    id: "b03-c3",
    unitId: "b03",
    order: 3,
    title: "진행형 — be + -ing",
    oneLiner: "진행형은 be동사 없이 -ing 혼자 설 수 없습니다.",
  },
  {
    id: "b03-c4",
    unitId: "b03",
    order: 4,
    title: "현재완료 — have + p.p.",
    oneLiner: "과거의 일이 지금과 이어져 있으면 현재완료입니다.",
  },
  {
    id: "b03-c5",
    unitId: "b03",
    order: 5,
    title: "시간·조건 부사절의 현재시제",
    oneLiner: "when·if 절에서는 미래의 일도 현재시제로 씁니다.",
  },
  // ── B4 조동사 ──
  {
    id: "b04-c1",
    unitId: "b04",
    order: 1,
    title: "조동사 + 동사원형",
    oneLiner: "can·will·must·should 뒤에는 반드시 동사원형이 옵니다.",
  },
  {
    id: "b04-c2",
    unitId: "b04",
    order: 2,
    title: "조동사 + have p.p. — 과거에 대한 추측·후회",
    oneLiner: "must have p.p.(했음이 틀림없다), should have p.p.(했어야 했다)입니다.",
  },
  {
    id: "b04-c3",
    unitId: "b04",
    order: 3,
    title: "제안·요구·주장 that절의 동사원형",
    oneLiner: "suggest·insist·demand 뒤 that절은 (should) + 동사원형입니다.",
  },
  // ── B5 명사·관사·대명사 ──
  {
    id: "b05-c1",
    unitId: "b05",
    order: 1,
    title: "가산명사·불가산명사와 관사",
    oneLiner: "셀 수 있는지가 관사(a/an)와 복수형의 가능 여부를 결정합니다.",
  },
  {
    id: "b05-c2",
    unitId: "b05",
    order: 2,
    title: "인칭대명사와 지시대명사",
    oneLiner: "격(주격·목적격·소유격)과 가리키는 명사의 수를 맞춥니다.",
  },
  {
    id: "b05-c3",
    unitId: "b05",
    order: 3,
    title: "재귀대명사",
    oneLiner: "주어와 목적어가 같은 대상이면 목적격이 아니라 -self를 씁니다.",
  },
  {
    id: "b05-c4",
    unitId: "b05",
    order: 4,
    title: "부정대명사 — one·another·the other",
    oneLiner: "남은 것이 정해져 있으면 the other, 그렇지 않으면 another입니다.",
  },
  // ── B6 형용사·부사·비교 ──
  {
    id: "b06-c1",
    unitId: "b06",
    order: 1,
    title: "형용사의 자리와 부사의 자리",
    oneLiner: "명사를 꾸미거나 보어가 되면 형용사, 그 밖은 부사입니다.",
  },
  {
    id: "b06-c2",
    unitId: "b06",
    order: 2,
    title: "원급·비교급·최상급",
    oneLiner: "as ~ as, -er than, the -est의 형태와 비교 대상을 맞춥니다.",
  },
  {
    id: "b06-c3",
    unitId: "b06",
    order: 3,
    title: "비교 관용표현",
    oneLiner: "the 비교급 ~ the 비교급, 배수 표현, one of the 최상급 + 복수명사입니다.",
  },
  {
    id: "b06-c4",
    unitId: "b06",
    order: 4,
    title: "수량형용사 — many·much·few·little",
    oneLiner: "셀 수 있는 명사와 셀 수 없는 명사에 붙는 수량 표현이 다릅니다.",
  },
  // ── B7 전치사·접속사·절 ──
  {
    id: "b07-c1",
    unitId: "b07",
    order: 1,
    title: "전치사의 목적어는 명사(구)",
    oneLiner: "전치사 뒤에는 명사·대명사·동명사가 오고, 절은 올 수 없습니다.",
  },
  {
    id: "b07-c2",
    unitId: "b07",
    order: 2,
    title: "등위접속사와 상관접속사",
    oneLiner: "and·but·or는 같은 형태끼리, both A and B는 A와 B의 형태를 맞춥니다.",
  },
  {
    id: "b07-c3",
    unitId: "b07",
    order: 3,
    title: "명사절 — that·whether·의문사",
    oneLiner: "명사절은 주어·목적어·보어 자리를 통째로 채웁니다.",
  },
  {
    id: "b07-c4",
    unitId: "b07",
    order: 4,
    title: "부사절 — 시간·이유·양보·조건",
    oneLiner: "부사절은 주절에 얹혀 언제·왜·그럼에도를 덧붙입니다.",
  },

  // ══ PART 1~3 · 판별 (기존 — ID·순서 불변) ═══════════════════════════════
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

/** "u03" → 3, "b02" → 2 (그룹 내 번호) */
export function unitNumber(unitId: string): number {
  return Number(unitId.slice(1)) || 0;
}

/** 화면 표기용 짧은 라벨 — "U3"(판별) / "B2"(기초) */
export function unitLabel(unitId: string): string {
  const prefix = unitId.startsWith("b") ? "B" : "U";
  return `${prefix}${unitNumber(unitId)}`;
}

export const BASIC_UNIT_IDS = GRAMMAR_UNITS.filter(
  (u) => u.unlockGroup === "BASIC",
).map((u) => u.id);
export const JUDGE_UNIT_IDS = GRAMMAR_UNITS.filter(
  (u) => u.unlockGroup === "JUDGE",
).map((u) => u.id);
