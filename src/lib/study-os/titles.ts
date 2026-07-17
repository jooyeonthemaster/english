// ============================================================================
// 칭호 엔진 — 상태의 순수 함수 (docs/study-os-spec.md §13)
//
// 칭호는 저장하지 않는다. 스냅샷이 같으면 칭호도 같다(결정론).
// stats 테이블의 titles JSONB 는 "언제 얻었는가"의 이력일 뿐, 정본은 이 함수다.
//
// 문법: [접두(행동 패턴)] × [코어(최강 축)] × [등급(레벨)] = 7,000+ 조합
//       + 특별 칭호(조건 충족 시 조합 칭호를 덮는다) + 저레벨 하찮음 특례.
// 톤: 명사형·위트 허용(§11.4). 반말 없음·이모지 없음·학생 비하 없음 —
//     하찮음의 대상은 언제나 "여정의 초반부"이지 학생 본인이 아니다.
// ============================================================================

import type { JudgeLens } from "./lesson-types";
import type { PartKey, StatSnapshot, StatusTitleView } from "./stats";

export interface Title {
  key: string;
  name: string;
  kind: "COMBO" | "SPECIAL";
  hint?: string;
}

// ── 등급 (레벨 구간 8단) ────────────────────────────────────────────────────

const RANKS: { min: number; name: string; key: string }[] = [
  { min: 35, name: "종결자", key: "r8" },
  { min: 27, name: "고수", key: "r7" },
  { min: 20, name: "달인", key: "r6" },
  { min: 15, name: "숙련자", key: "r5" },
  { min: 10, name: "유단자", key: "r4" },
  { min: 6, name: "수련생", key: "r3" },
  { min: 3, name: "초심자", key: "r2" },
  { min: 1, name: "견습", key: "r1" },
];

function rankFor(level: number) {
  return RANKS.find((r) => level >= r.min) ?? RANKS[RANKS.length - 1];
}

// ── 코어 (최강 렌즈·파트 — "무엇으로 알려진 자인가") ────────────────────────

const LENS_CORES: Record<JudgeLens, { key: string; name: string }[]> = {
  L1: [
    { key: "c-l1a", name: "빈자리 감별사" },
    { key: "c-l1b", name: "완전성 심문관" },
    { key: "c-l1c", name: "결핍 탐지기" },
  ],
  L2: [
    { key: "c-l2a", name: "동사 카운터" },
    { key: "c-l2b", name: "본동사 수문장" },
    { key: "c-l2c", name: "동사 자리 회계사" },
  ],
  L3: [
    { key: "c-l3a", name: "의미상 주어 추적자" },
    { key: "c-l3b", name: "능동·수동 판관" },
    { key: "c-l3c", name: "준동사 조련사" },
  ],
  L4: [
    { key: "c-l4a", name: "병렬 축 사냥꾼" },
    { key: "c-l4b", name: "and 뒤를 캐는 자" },
    { key: "c-l4c", name: "대칭 수호자" },
  ],
  L5: [
    { key: "c-l5a", name: "핵 주어 채굴꾼" },
    { key: "c-l5b", name: "수식어 제거반장" },
    { key: "c-l5c", name: "괄호 밖의 진실을 보는 자" },
  ],
};

const PART_CORES: Record<PartKey, { key: string; name: string }[]> = {
  p0: [
    { key: "c-p0a", name: "품사 분류학자" },
    { key: "c-p0b", name: "골격 세공사" },
  ],
  p1: [
    { key: "c-p1a", name: "문장 뼈대 감식가" },
    { key: "c-p1b", name: "골격기의 장인" },
  ],
  p2: [
    { key: "c-p2a", name: "절과 절의 중재자" },
    { key: "c-p2b", name: "연결기의 가교지기" },
  ],
  p3: [
    { key: "c-p3a", name: "미세 호응의 조율사" },
    { key: "c-p3b", name: "정밀기의 시계공" },
  ],
};

const NEUTRAL_CORES: { key: string; name: string }[] = [
  { key: "c-n1", name: "어법 순례자" },
  { key: "c-n2", name: "문장 방랑자" },
  { key: "c-n3", name: "밑줄 위의 여행자" },
];

// ── 접두 (행동 패턴 — 스냅샷이 말해주는 "어떻게 싸워왔는가") ────────────────
// cond 가 참인 것 중 weight 가 가장 큰 것을 쓴다. 동률이면 배열 앞이 이긴다.

interface Prefix {
  key: string;
  name: string;
  weight: (s: StatSnapshot) => number;
}

const PREFIXES: Prefix[] = [
  // 반복·꾸준함
  { key: "p-re3", name: "같은 산을 세 번 오른", weight: (s) => (s.replays >= 15 ? 90 : 0) },
  { key: "p-re2", name: "복습으로 벼려진", weight: (s) => (s.replays >= 7 ? 70 : 0) },
  { key: "p-re1", name: "두 번 읽는", weight: (s) => (s.replays >= 3 ? 40 : 0) },
  { key: "p-st3", name: "매일 칼을 가는", weight: (s) => (s.streakDays >= 14 ? 95 : 0) },
  { key: "p-st2", name: "일주일을 버틴", weight: (s) => (s.streakDays >= 7 ? 72 : 0) },
  { key: "p-st1", name: "사흘을 넘긴", weight: (s) => (s.streakDays >= 3 ? 35 : 0) },
  // 완벽주의·정밀
  { key: "p-pf3", name: "무결점 연타의", weight: (s) => (s.gamePerfects >= 30 ? 92 : 0) },
  { key: "p-pf2", name: "실수를 용납하지 않는", weight: (s) => (s.gamePerfects >= 12 ? 68 : 0) },
  { key: "p-pf1", name: "한 번에 끝내려는", weight: (s) => (s.gamePerfects >= 4 ? 34 : 0) },
  { key: "p-cb3", name: "콤보가 끊기지 않는", weight: (s) => (s.bestCombo >= 16 ? 88 : 0) },
  { key: "p-cb2", name: "손이 먼저 아는", weight: (s) => (s.bestCombo >= 10 ? 60 : 0) },
  { key: "p-cb1", name: "리듬을 타기 시작한", weight: (s) => (s.bestCombo >= 6 ? 30 : 0) },
  // 보스전 서사
  { key: "p-bw3", name: "보스들이 이름을 아는", weight: (s) => (s.bossWins >= 30 ? 94 : 0) },
  { key: "p-bw2", name: "관문을 부수며 걷는", weight: (s) => (s.bossWins >= 12 ? 66 : 0) },
  { key: "p-bw1", name: "첫 보스를 꺾은", weight: (s) => (s.bossWins >= 1 ? 25 : 0) },
  {
    key: "p-bl2",
    name: "지고도 다시 도전한",
    weight: (s) => (s.bossLosses >= 8 && s.bossWins >= 4 ? 64 : 0),
  },
  {
    key: "p-bl1",
    name: "넘어진 자리에서 일어난",
    weight: (s) => (s.bossLosses >= 3 && s.bossWins >= 1 ? 33 : 0),
  },
  // 암기·수집
  { key: "p-mg3", name: "관문지기와 낯을 튼", weight: (s) => (s.memoryGatePasses >= 25 ? 86 : 0) },
  { key: "p-mg2", name: "외운 것은 잊지 않는", weight: (s) => (s.memoryGatePasses >= 10 ? 58 : 0) },
  { key: "p-mg1", name: "주문을 외기 시작한", weight: (s) => (s.memoryGatePasses >= 3 ? 28 : 0) },
  // 물량·근성
  { key: "p-gm3", name: "천 번을 두드린", weight: (s) => (s.gamesPlayed >= 300 ? 84 : 0) },
  { key: "p-gm2", name: "판을 벌이면 끝을 보는", weight: (s) => (s.gamesPlayed >= 100 ? 55 : 0) },
  { key: "p-gm1", name: "놀이로 배우는", weight: (s) => (s.gamesPlayed >= 20 ? 26 : 0) },
  { key: "p-ls3", name: "쉰 개의 문을 연", weight: (s) => (s.lessonsCompleted >= 50 ? 89 : 0) },
  { key: "p-ls2", name: "스무 고개를 넘은", weight: (s) => (s.lessonsCompleted >= 20 ? 62 : 0) },
  { key: "p-ls1", name: "열 걸음을 걸은", weight: (s) => (s.lessonsCompleted >= 10 ? 32 : 0) },
  // 숙달도
  { key: "p-ms3", name: "틀리는 법을 잊어가는", weight: (s) => (s.avgMastery >= 85 ? 91 : 0) },
  { key: "p-ms2", name: "정답이 손에 익은", weight: (s) => (s.avgMastery >= 70 ? 63 : 0) },
  { key: "p-ms1", name: "감이 오기 시작한", weight: (s) => (s.avgMastery >= 50 ? 29 : 0) },
  // 균형·특성
  {
    key: "p-bal",
    name: "오각형을 그리는",
    weight: (s) => {
      const v = Object.values(s.lensXp);
      const max = Math.max(...v);
      const min = Math.min(...v);
      return max >= 200 && min / max >= 0.6 ? 87 : 0;
    },
  },
  {
    key: "p-one",
    name: "한 우물만 파는",
    weight: (s) => {
      const v = Object.values(s.lensXp).sort((a, b) => b - a);
      return v[0] >= 300 && v[0] >= (v[1] || 1) * 3 ? 61 : 0;
    },
  },
  {
    key: "p-b0",
    name: "기초부터 다시 쌓는",
    weight: (s) => (s.basicConceptsDone >= 8 && s.judgeConceptsDone >= 4 ? 44 : 0),
  },
  // 낮은 단계의 기본값 후보(하찮음 — 여정 초반의 정직한 묘사)
  { key: "p-z5", name: "밑줄 앞에서 3초 망설이는", weight: (s) => (s.lessonsCompleted >= 5 ? 8 : 0) },
  { key: "p-z4", name: "아직 지도를 뒤집어 든", weight: (s) => (s.lessonsCompleted >= 3 ? 6 : 0) },
  { key: "p-z3", name: "필기구부터 산", weight: (s) => (s.lessonsCompleted >= 1 ? 5 : 0) },
  { key: "p-z2", name: "이제 막 문을 두드린", weight: () => 2 },
  { key: "p-z1", name: "출석부에 이름만 올린", weight: () => 1 },
];

// ── 특별 칭호 (조건 충족 시 조합 칭호를 덮는다) ─────────────────────────────

interface Special {
  key: string;
  name: string;
  /** 우선순위 — 클수록 강함 */
  rank: number;
  cond: (s: StatSnapshot) => boolean;
  hint: string;
}

const SPECIALS: Special[] = [
  // 종반 서사
  {
    key: "sp-all75",
    name: "일흔다섯 문의 주인",
    rank: 100,
    cond: (s) => s.basicConceptsDone + s.judgeConceptsDone >= 75,
    hint: "75개 개념 레슨을 전부 완주",
  },
  {
    key: "sp-judge47",
    name: "판별기 정복자",
    rank: 96,
    cond: (s) => s.judgeConceptsDone >= 47,
    hint: "판별 유닛(u01~u12)의 47개 레슨 완주",
  },
  {
    key: "sp-pentagon",
    name: "오각형 인간",
    rank: 93,
    cond: (s) => {
      const v = Object.values(s.lensXp);
      return Math.min(...v) >= 400;
    },
    hint: "판별 5렌즈 전부 400 XP 이상",
  },
  {
    key: "sp-basic28",
    name: "기초 완전체",
    rank: 90,
    cond: (s) => s.basicConceptsDone >= 28,
    hint: "기초 골격(b01~b07) 28개 레슨 전부 완주",
  },
  {
    key: "sp-boss50",
    name: "보스들의 악몽",
    rank: 88,
    cond: (s) => s.bossWins >= 50,
    hint: "보스전 통산 50승",
  },
  {
    key: "sp-mastery90",
    name: "출제자의 경계 대상",
    rank: 86,
    cond: (s) => s.avgMastery >= 90 && s.lessonsCompleted >= 20,
    hint: "평균 숙달도 90 이상(레슨 20개 이상)",
  },
  {
    key: "sp-combo25",
    name: "25연격의 증명",
    rank: 82,
    cond: (s) => s.bestCombo >= 25,
    hint: "스피드 판정 25콤보",
  },
  {
    key: "sp-perfect50",
    name: "무결점 수집가",
    rank: 80,
    cond: (s) => s.gamePerfects >= 50,
    hint: "게임 퍼펙트 50회",
  },
  {
    key: "sp-replay20",
    name: "반복의 화신",
    rank: 76,
    cond: (s) => s.replays >= 20,
    hint: "레슨 재수련 20회",
  },
  {
    key: "sp-streak30",
    name: "한 달을 이긴 사람",
    rank: 74,
    cond: (s) => s.streakDays >= 30,
    hint: "30일 연속 학습",
  },
  {
    key: "sp-gate50",
    name: "관문이 먼저 인사하는 자",
    rank: 70,
    cond: (s) => s.memoryGatePasses >= 50,
    hint: "암기 관문 50회 통과",
  },
  {
    key: "sp-part1",
    name: "골격기 졸업생",
    rank: 66,
    cond: (s) => s.partXp.p1 >= 1600,
    hint: "골격기(u01~u05) XP 1,600",
  },
  {
    key: "sp-part2",
    name: "연결기 졸업생",
    rank: 65,
    cond: (s) => s.partXp.p2 >= 1200,
    hint: "연결기(u06~u09) XP 1,200",
  },
  {
    key: "sp-part3",
    name: "정밀기 졸업생",
    rank: 64,
    cond: (s) => s.partXp.p3 >= 960,
    hint: "정밀기(u10~u12) XP 960",
  },
  {
    key: "sp-boss10",
    name: "열 번 부딪힌 망치",
    rank: 58,
    cond: (s) => s.bossWins >= 10,
    hint: "보스전 통산 10승",
  },
  {
    key: "sp-phoenix",
    name: "여덟 번 쓰러진 오뚝이",
    rank: 54,
    cond: (s) => s.bossLosses >= 8,
    hint: "보스전 8패 — 패배 수집도 기록이 됩니다",
  },
  {
    key: "sp-first-perfect",
    name: "첫 퍼펙트의 짜릿함을 아는 자",
    rank: 40,
    cond: (s) => s.gamePerfects >= 1,
    hint: "아무 게임이나 퍼펙트 1회",
  },
  {
    key: "sp-first-boss",
    name: "첫 관문의 생존자",
    rank: 36,
    cond: (s) => s.bossWins >= 1,
    hint: "보스전 첫 승리",
  },
  {
    key: "sp-first-lesson",
    name: "첫 발을 뗀 자",
    rank: 20,
    cond: (s) => s.lessonsCompleted >= 1,
    hint: "레슨 1개 완주",
  },
];

// ── 저레벨 하찮음 특례 (Lv1~2 · 완주 2개 이하 — 조합 문법보다 우선) ─────────

const HUMBLE: { key: string; name: string; cond: (s: StatSnapshot) => boolean }[] = [
  {
    key: "h-0",
    name: "아직 8품사를 손가락으로 세는 여행자",
    cond: (s) => s.lessonsCompleted === 0,
  },
  {
    key: "h-1",
    name: "레슨 하나로 어깨가 올라간 견습",
    cond: (s) => s.lessonsCompleted === 1,
  },
  {
    key: "h-2",
    name: "두 번째 문 앞에서 심호흡 중인 견습",
    cond: (s) => s.lessonsCompleted === 2,
  },
];

// ── 엔진 ────────────────────────────────────────────────────────────────────

function dominantCore(s: StatSnapshot): { key: string; name: string } {
  // 렌즈 우선 — 최강 렌즈가 유의미(≥60 XP)하면 렌즈 코어, 아니면 파트 코어, 다 없으면 중립
  const lensEntries = Object.entries(s.lensXp) as [JudgeLens, number][];
  lensEntries.sort((a, b) => b[1] - a[1]);
  const [topLens, topLensXp] = lensEntries[0];
  if (topLensXp >= 60) {
    const pool = LENS_CORES[topLens];
    return pool[topLensXp % pool.length]; // XP 로 결정론 로테이션 — 같은 축이라도 표정이 바뀐다
  }
  const partEntries = Object.entries(s.partXp) as [PartKey, number][];
  partEntries.sort((a, b) => b[1] - a[1]);
  const [topPart, topPartXp] = partEntries[0];
  if (topPartXp >= 60) {
    const pool = PART_CORES[topPart];
    return pool[topPartXp % pool.length];
  }
  return NEUTRAL_CORES[s.lessonsCompleted % NEUTRAL_CORES.length];
}

function comboTitle(s: StatSnapshot): Title {
  const rank = rankFor(s.level);
  const core = dominantCore(s);
  let best: Prefix | null = null;
  let bestW = 0;
  for (const p of PREFIXES) {
    const w = p.weight(s);
    if (w > bestW) {
      best = p;
      bestW = w;
    }
  }
  const prefix = best ?? PREFIXES[PREFIXES.length - 1];
  return {
    key: `combo:${prefix.key}.${core.key}.${rank.key}`,
    name: `${prefix.name} ${core.name} · ${rank.name}`,
    kind: "COMBO",
  };
}

export interface TitleComputation {
  active: Title;
  /** 달성한 특별 칭호 전부(rank 내림차순) */
  unlockedSpecials: Title[];
  /** 아직 못 얻은 특별 칭호 중 다음 목표 3개 */
  nextHints: Title[];
}

export function computeTitles(s: StatSnapshot): TitleComputation {
  const unlocked = SPECIALS.filter((t) => t.cond(s)).sort((a, b) => b.rank - a.rank);
  const locked = SPECIALS.filter((t) => !t.cond(s)).sort((a, b) => a.rank - b.rank);

  // active: 저레벨 하찮음 특례 → 최고 특별 → 조합
  let active: Title;
  const humble = s.level <= 2 ? HUMBLE.find((h) => h.cond(s)) : undefined;
  if (humble) {
    active = { key: humble.key, name: humble.name, kind: "SPECIAL" };
  } else if (unlocked.length > 0 && unlocked[0].rank >= 54) {
    // 강한 특별 칭호만 조합을 덮는다 — 약한 기념 칭호가 평생 붙어 다니지 않게
    active = { key: unlocked[0].key, name: unlocked[0].name, kind: "SPECIAL" };
  } else {
    active = comboTitle(s);
  }

  return {
    active,
    unlockedSpecials: unlocked.map((t) => ({
      key: t.key,
      name: t.name,
      kind: "SPECIAL" as const,
      hint: t.hint,
    })),
    nextHints: locked.slice(0, 3).map((t) => ({
      key: t.key,
      name: t.name,
      kind: "SPECIAL" as const,
      hint: t.hint,
    })),
  };
}

export function toTitleView(t: Title, earnedAt?: string): StatusTitleView {
  return { key: t.key, name: t.name, kind: t.kind, hint: t.hint, earnedAt };
}
