"use server";

// ============================================================================
// 단어장 생성 스튜디오 — 서버 액션 (인증 + 입력 새니타이즈 래퍼)
//
// 질의 정본은 lib/vocab-drill/wordbook-explore.ts · wordbook-dossier.ts.
// 여기는 requireStaffAuth 게이트 + **클라이언트 filter 화이트리스트**를 얹는다
// (적대검수 2026-08-04: 배열 무상한 filter 가 6만 파라미터 IN 질의로 공용 DB 를
// 타격 가능했다 — decks.ts sanitizeDeckSpec 과 같은 규율로 캡한다).
// 콘텐츠 테이블은 전 학원 공용 읽기 전용이라 academyId 스코프는 없다.
// 덱 저장·학생 전송은 기존 액션(createVocabDeck·createStudyAssignment) 소관.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import {
  getWordbookOverviewData,
  listWordbookSensesData,
  type WordbookBoard,
  type WordbookFilter,
  type WordbookOverview,
  type WordbookPage,
  type WordbookSort,
} from "@/lib/vocab-drill/wordbook-explore";
import {
  getWordbookLemmaDossierData,
  listWordbookShiftData,
  type ShiftAxis,
  type WordbookLemmaDossier,
  type WordbookShiftRow,
} from "@/lib/vocab-drill/wordbook-dossier";

// ── filter 화이트리스트 ──────────────────────────────────────────────────────

const POS = [
  "noun", "verb", "adjective", "adverb", "preposition", "conjunction",
  "idiom", "phrasal_verb", "collocation",
];
const TIERS = ["basic", "core", "academic", "advanced"];
const GRADES = ["고1", "고2", "고3"];
const TRENDS = [
  "급증", "증가", "안정", "감소", "급감", "신규 등장", "중간기만 등장", "미등장",
];
const BOARDS: WordbookBoard[] = ["수능", "모평", "학평"];
const SORTS: WordbookSort[] = [
  "per10k", "occurrences", "trapRate", "difficulty", "lemma", "sn", "mp", "hp",
];

function pick(v: unknown, allow: string[]): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [
    ...new Set(
      v.filter((x): x is string => typeof x === "string" && allow.includes(x)),
    ),
  ];
  return out.length ? out : undefined;
}

function sanitizeFilter(raw: unknown): WordbookFilter {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;
  const f: WordbookFilter = {};
  if (typeof r.q === "string" && r.q.trim()) f.q = r.q.slice(0, 40);
  f.posList = pick(r.posList, POS);
  f.tiers = pick(r.tiers, TIERS);
  f.grades = pick(r.grades, GRADES);
  f.trendLabels = pick(r.trendLabels, TRENDS);
  if (Array.isArray(r.difficulties)) {
    const d = [
      ...new Set(
        r.difficulties.filter(
          (x): x is number =>
            typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 5,
        ),
      ),
    ];
    if (d.length) f.difficulties = d;
  }
  if (r.excludePhrase === true) f.excludePhrase = true;
  if (r.allSenses === true) f.allSenses = true;
  if (r.excludeStopwords === true) f.excludeStopwords = true;
  if (
    typeof r.minTrapRate === "number" &&
    Number.isFinite(r.minTrapRate) &&
    r.minTrapRate > 0
  ) {
    f.minTrapRate = Math.min(1, r.minTrapRate);
  }
  if (typeof r.board === "string" && (BOARDS as string[]).includes(r.board)) {
    f.board = r.board as WordbookBoard;
  }
  return f;
}

// ── 액션 ─────────────────────────────────────────────────────────────────────

export async function getWordbookOverview(): Promise<WordbookOverview> {
  await requireStaffAuth();
  return getWordbookOverviewData();
}

export async function listWordbookSenses(input: {
  filter: WordbookFilter;
  sort: WordbookSort;
  offset: number;
  limit?: number;
}): Promise<WordbookPage> {
  await requireStaffAuth();
  return listWordbookSensesData({
    filter: sanitizeFilter(input.filter),
    sort: SORTS.includes(input.sort) ? input.sort : "per10k",
    offset: input.offset,
    limit: input.limit,
  });
}

export async function getWordbookLemmaDossier(
  lemmaId: string,
): Promise<WordbookLemmaDossier | null> {
  await requireStaffAuth();
  if (typeof lemmaId !== "string") return null;
  return getWordbookLemmaDossierData(lemmaId);
}

export async function listWordbookShift(
  axis: ShiftAxis,
): Promise<WordbookShiftRow[]> {
  await requireStaffAuth();
  return listWordbookShiftData(axis === "grade" ? "grade" : "era");
}
