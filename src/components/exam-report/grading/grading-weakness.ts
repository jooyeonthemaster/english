// ============================================================================
// 학생 시험 리포트 — 취약점 집계(순수·AI 0콜)
//
// 응답(CORRECT/WRONG/PARTIAL/UNKNOWN) × 문항 메타(examMap.typeLabel/points ·
// perQuestion.difficulty/keyConcepts · reviewItems.difficulty/passage/tags)를
// 결정론으로 groupBy 해 유형별·난이도별·지문별·개념별 정답률/실점을 낸다.
// LLM 호출 없음 — 전부 이미 저장/재조회된 데이터의 순수 변환이다.
//
// number(=String(orderNum))가 examMap·responses·perQuestion·reviewItems 공통 축.
// 지문·개념 차원은 원본 재조회(reviewItems) 또는 perQuestion 에 의존하므로,
// 미제공(사진 업로드 리포트 등)이면 해당 차원은 빈 배열로 강등된다.
// ============================================================================

import type {
  ExamMap,
  QuestionAnalysis,
  ResponseStatus,
  StudentResponse,
} from "@/lib/exam-report/types";
import type { ExamReviewQuestion } from "@/components/exam-report/ui-contracts";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import { getDisplayQuestionTags } from "@/lib/question-generation-plans";
import { numberKey } from "./grading-shared";

// ── 타입 ─────────────────────────────────────────────────────────────────────

export type WeaknessDimension = "type" | "difficulty" | "passage" | "concept";

export interface WeaknessBucket {
  /** 그룹 식별 키(중복 방지·React key) */
  key: string;
  /** 표시 라벨(유형명·난이도명·지문 제목·개념명) */
  label: string;
  /** 보조 라벨(지문 출처/단원 등) — 선택 */
  sublabel?: string;
  /** 이 버킷의 전체 문항 수(미채점 포함) */
  total: number;
  /** 채점된 문항 수(CORRECT+WRONG+PARTIAL) */
  graded: number;
  correct: number;
  wrong: number;
  partial: number;
  unknown: number;
  earnedPoints: number;
  maxPoints: number;
  /** 이 버킷의 전 문항 번호(등장 순) — 정오색 칩 렌더·상세 점프용 */
  numbers: string[];
  /** 오답(WRONG) 문항 번호 — 취약 근거 점프용 */
  wrongNumbers: string[];
  /** 정답률 correct/graded (0~1). graded=0 이면 null(집계 제외). */
  accuracy: number | null;
}

export interface WeaknessOverall {
  total: number;
  graded: number;
  correct: number;
  wrong: number;
  partial: number;
  unknown: number;
  earnedPoints: number;
  maxPoints: number;
  accuracy: number | null;
}

export interface WeaknessBreakdown {
  overall: WeaknessOverall;
  byType: WeaknessBucket[];
  byDifficulty: WeaknessBucket[];
  byPassage: WeaknessBucket[];
  byConcept: WeaknessBucket[];
  /** 지문/개념 차원 산출에 필요한 원본(reviewItems)이 있었는지. */
  hasDetail: boolean;
}

// ── 내부 누적기 ──────────────────────────────────────────────────────────────

interface Mutable {
  key: string;
  label: string;
  sublabel?: string;
  total: number;
  graded: number;
  correct: number;
  wrong: number;
  partial: number;
  unknown: number;
  earnedPoints: number;
  maxPoints: number;
  numbers: string[];
  wrongNumbers: string[];
  /** 정렬 안정성용 — 최초 등장 순서 */
  order: number;
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

/** 난이도 표시 순서(기본→중급→킬러→기타). */
export const DIFFICULTY_RANK: Record<string, number> = {
  BASIC: 0,
  INTERMEDIATE: 1,
  KILLER: 2,
};

/** JSON 문자열 배열/배열 → 트림된 string[]. (해설 keyPoints 등도 같은 형태라 공용) */
export function parseTags(value: unknown): string[] {
  let arr: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return [trimmed];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
}

/**
 * 개념 축에 올리면 안 되는 라벨 — 유형 라벨(「어법 판단」)·난이도 라벨(「킬러」).
 *
 * 개념 축은 `perQuestion.keyConcepts` 가 정본이고, 없을 때만 문항 태그로 폴백한다.
 * 그런데 문항 태그에는 생성 플랜(「일반 생성」)·모델 고지·유형·난이도가 섞여 있어
 * 폴백을 그대로 쓰면 리포트가 「보강할 개념: 일반 생성」이라고 말한다 — 학습 개념이
 * 아닌 내부 운영 값이 학습 진단으로 둔갑하는 경로라 축 자체에서 막는다.
 */
const NON_CONCEPT_TAGS = new Set<string>([
  ...Object.values(QUESTION_TYPE_UI).map((meta) => meta.label),
  ...Object.values(DIFFICULTY_LABEL),
]);

/**
 * 문항 태그 → 학습 개념 후보.
 * 생성 플랜·AI 모델 고지·기계 식별 키는 `getDisplayQuestionTags` 가 걷어내고,
 * 유형·난이도 라벨은 위 집합으로 추가로 제외한다. 남는 게 없으면 빈 배열 —
 * 그러면 「보강할 개념」 카드와 개념 탭이 아예 렌더되지 않는다(거짓 개념 금지).
 */
function conceptTagsOf(tags: unknown): string[] {
  return getDisplayQuestionTags(parseTags(tags)).filter(
    (tag) => !NON_CONCEPT_TAGS.has(tag),
  );
}

/**
 * 개념 축 정화 — **perQuestion.keyConcepts 에도 반드시 적용한다.**
 *
 * 실측(2026-07-25, analysis cmrxokvfp…): 저장된 keyConcepts 가
 * `["일반 생성"]` 이었다. 분석 시점에 문항 태그를 그대로 복사해 넣는 바람에
 * 생성 플랜 라벨이 학습 개념으로 굳은 것이라, 폴백(태그) 경로만 막아서는
 * 「보강할 개념: 일반 생성」이 그대로 화면에 남는다. 1차 경로도 같은 체로 거른다.
 */
function sanitizeConcepts(values: readonly string[]): string[] {
  return getDisplayQuestionTags(values).filter((tag) => !NON_CONCEPT_TAGS.has(tag));
}

/**
 * 표시용 유형 라벨 — 카탈로그(QUESTION_TYPE_UI) 정본이 우선.
 *
 * examMap 의 `typeLabel` 은 분석이 뽑아낸 자유 문자열이라 「어법판단」처럼 카탈로그
 * (「어법 판단」)와 표기가 갈린다. 같은 화면 위아래에서 두 표기가 동시에 보이므로
 * 원본 재조회(subType)가 있으면 카탈로그 라벨로 정규화한다.
 */
export function resolveTypeLabel(
  subType: string | null | undefined,
  storedLabel?: string | null,
  analysisLabel?: string | null,
): string {
  const catalog = subType ? QUESTION_TYPE_UI[subType]?.label : null;
  return catalog || storedLabel || analysisLabel || "기타";
}

/**
 * 지문 라벨 — 제목이 정본. 제목이 없을 때 쓰는 세트 라벨(「[43~45]」)은 지문 제목이
 * 아니라 인쇄 묶음 머리표라, 접두 없이 내보내면 같은 자리의 다른 타일과 축이 섞인다.
 */
function passageLabelOf(review: ExamReviewQuestion | null | undefined): string | null {
  const title = review?.passage?.title?.trim();
  if (title) return title;
  const setLabel = review?.setLabel?.trim();
  return setLabel ? `세트 ${setLabel}` : null;
}

/** perQuestion.difficulty(1..5) → 난이도 키(기본/중급/킬러). */
export function scaleToDifficultyKey(scale: number | undefined): string | null {
  if (scale == null) return null;
  if (scale <= 2) return "BASIC";
  if (scale === 3) return "INTERMEDIATE";
  return "KILLER";
}

// ── 행 메타(필터·그리드 공용 축) ─────────────────────────────────────────────

/** 문항 1행의 필터/표시 축 — 채점 필터바·분석 문항 그리드가 같은 빌더를 쓴다. */
export interface AnalysisRowMeta {
  number: string;
  /** 빈 라벨은 "기타"로 폴백(대시보드 byType 와 동일 규약 — 패널 간 목록 정합). */
  typeLabel: string;
  /**
   * 카탈로그(QUESTION_TYPE_UI) 키 — 원본 재조회가 있을 때만 채워진다.
   * 변형 생성 자격 판정(filterVariantQuestions)의 정본 축이라 행 메타에 싣는다.
   */
  subType: string | null;
  status: ResponseStatus;
  kind: "MC" | "SHORT" | "ESSAY";
  points: number | null;
  difficultyKey: string | null;
  passageId: string | null;
  passageLabel: string | null;
}

/** examMap×responses×perQuestion×reviewItems → 행 메타 목록(order 정렬 전제). */
export function buildAnalysisRowMetas(input: {
  orderedEntries: { number: string; typeLabel: string; kind: "MC" | "SHORT" | "ESSAY"; points: number | null }[];
  responses: StudentResponse[];
  perQuestion?: QuestionAnalysis[] | null;
  reviewItems?: Record<string, ExamReviewQuestion> | null;
}): AnalysisRowMeta[] {
  const responseByKey = new Map(
    input.responses.map((r) => [numberKey(r.number), r]),
  );
  const analysisByKey = new Map(
    (input.perQuestion ?? []).map((p) => [numberKey(p.number), p]),
  );
  return input.orderedEntries.map((entry) => {
    const r = responseByKey.get(numberKey(entry.number));
    const review = input.reviewItems?.[entry.number] ?? null;
    const pq = analysisByKey.get(numberKey(entry.number));
    const difficultyKey =
      (review?.difficulty && review.difficulty.toUpperCase()) ||
      scaleToDifficultyKey(pq?.difficulty) ||
      null;
    return {
      number: entry.number,
      // 카탈로그 라벨 우선 — examMap 저장 문자열(「어법판단」)과 카탈로그(「어법 판단」)가
      // 갈려 한 화면에 두 표기가 동시에 보이던 문제를 표시 직전 정규화로 없앤다.
      typeLabel: resolveTypeLabel(review?.subType, entry.typeLabel, pq?.typeLabel),
      subType: review?.subType ?? null,
      status: r?.status ?? "UNKNOWN",
      kind: entry.kind,
      points: entry.points,
      difficultyKey,
      passageId: review?.passageId ?? review?.passage?.id ?? null,
      passageLabel: passageLabelOf(review),
    };
  });
}

function finalize(m: Mutable): WeaknessBucket {
  return {
    key: m.key,
    label: m.label,
    sublabel: m.sublabel,
    total: m.total,
    graded: m.graded,
    correct: m.correct,
    wrong: m.wrong,
    partial: m.partial,
    unknown: m.unknown,
    earnedPoints: round1(m.earnedPoints),
    maxPoints: round1(m.maxPoints),
    numbers: m.numbers,
    wrongNumbers: m.wrongNumbers,
    accuracy: m.graded > 0 ? m.correct / m.graded : null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 취약 정렬: 채점분 우선 → 정답률 낮은 순 → 오답 많은 순 → 등장 순서. */
function byWeakness(a: WeaknessBucket, b: WeaknessBucket): number {
  const ag = a.graded > 0 ? 0 : 1;
  const bg = b.graded > 0 ? 0 : 1;
  if (ag !== bg) return ag - bg;
  const aa = a.accuracy ?? 1;
  const ba = b.accuracy ?? 1;
  if (aa !== ba) return aa - ba;
  return b.wrong - a.wrong;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export function computeWeaknessBreakdown(input: {
  examMap: ExamMap;
  responses: StudentResponse[];
  perQuestion?: QuestionAnalysis[] | null;
  reviewItems?: Record<string, ExamReviewQuestion> | null;
}): WeaknessBreakdown {
  const { examMap, responses } = input;
  const perQuestion = input.perQuestion ?? [];
  const reviewItems = input.reviewItems ?? null;
  const hasDetail = reviewItems != null && Object.keys(reviewItems).length > 0;

  const responseByKey = new Map(responses.map((r) => [numberKey(r.number), r]));
  const analysisByKey = new Map(perQuestion.map((p) => [numberKey(p.number), p]));

  const overall: WeaknessOverall = {
    total: 0,
    graded: 0,
    correct: 0,
    wrong: 0,
    partial: 0,
    unknown: 0,
    earnedPoints: 0,
    maxPoints: 0,
    accuracy: null,
  };

  const typeMap = new Map<string, Mutable>();
  const diffMap = new Map<string, Mutable>();
  const passageMap = new Map<string, Mutable>();
  const conceptMap = new Map<string, Mutable>();
  let orderSeq = 0;

  const bump = (
    map: Map<string, Mutable>,
    key: string,
    label: string,
    status: ResponseStatus,
    points: number,
    earned: number,
    number: string,
    sublabel?: string,
  ) => {
    let m = map.get(key);
    if (!m) {
      m = {
        key,
        label,
        sublabel,
        total: 0,
        graded: 0,
        correct: 0,
        wrong: 0,
        partial: 0,
        unknown: 0,
        earnedPoints: 0,
        maxPoints: 0,
        numbers: [],
        wrongNumbers: [],
        order: orderSeq++,
      };
      map.set(key, m);
    }
    m.total += 1;
    m.maxPoints += points;
    m.earnedPoints += earned;
    m.numbers.push(number);
    if (status === "CORRECT") {
      m.graded += 1;
      m.correct += 1;
    } else if (status === "WRONG") {
      m.graded += 1;
      m.wrong += 1;
      m.wrongNumbers.push(number);
    } else if (status === "PARTIAL") {
      m.graded += 1;
      m.partial += 1;
    } else {
      m.unknown += 1;
    }
  };

  for (const entry of examMap.questions) {
    const key = numberKey(entry.number);
    const resp = responseByKey.get(key);
    const analysis = analysisByKey.get(key);
    const review = reviewItems?.[entry.number] ?? null;
    const status: ResponseStatus = resp?.status ?? "UNKNOWN";
    const points = entry.points ?? 0;
    const earned =
      status === "CORRECT"
        ? points
        : status === "PARTIAL"
          ? resp?.earnedPoints ?? 0
          : 0;

    // ── overall
    overall.total += 1;
    overall.maxPoints += points;
    overall.earnedPoints += earned;
    if (status === "CORRECT") {
      overall.graded += 1;
      overall.correct += 1;
    } else if (status === "WRONG") {
      overall.graded += 1;
      overall.wrong += 1;
    } else if (status === "PARTIAL") {
      overall.graded += 1;
      overall.partial += 1;
    } else {
      overall.unknown += 1;
    }

    // ── 유형별(카탈로그 라벨 우선 → examMap → perQuestion)
    // 행 메타(buildAnalysisRowMetas)와 같은 규칙을 써야 그리드·필터·분해가 같은
    // 이름으로 같은 버킷을 가리킨다.
    const typeLabel = resolveTypeLabel(
      review?.subType,
      entry.typeLabel,
      analysis?.typeLabel,
    );
    bump(typeMap, typeLabel, typeLabel, status, points, earned, entry.number);

    // ── 난이도별(reviewItems.difficulty 우선, 없으면 perQuestion.difficulty)
    const diffKey =
      (review?.difficulty && review.difficulty.toUpperCase()) ||
      scaleToDifficultyKey(analysis?.difficulty) ||
      null;
    if (diffKey) {
      bump(
        diffMap,
        diffKey,
        DIFFICULTY_LABEL[diffKey] ?? diffKey,
        status,
        points,
        earned,
        entry.number,
      );
    }

    // ── 지문별(원본 재조회 필요)
    if (review?.passage) {
      bump(
        passageMap,
        review.passage.id,
        passageLabelOf(review) ?? "지문",
        status,
        points,
        earned,
        entry.number,
        review.setLabel ?? undefined,
      );
    }

    // ── 개념별(perQuestion.keyConcepts 우선, 없으면 reviewItems.tags)
    // 한 문항의 중복 태그(["시제","시제"])는 Set 으로 문항당 1회만 집계한다 —
    // 분모(total/graded) 왜곡과 오답칩 중복 key 를 동시에 방지.
    // 폴백(문항 태그)은 운영 태그를 걷어낸 뒤에만 개념으로 승격한다 — 걸러낸 결과가
    // 비면 이 문항은 개념 축에 기여하지 않는다(「보강할 개념: 일반 생성」 방지).
    const analysisConcepts = sanitizeConcepts(analysis?.keyConcepts ?? []);
    const rawConcepts =
      analysisConcepts.length > 0 ? analysisConcepts : conceptTagsOf(review?.tags);
    const concepts = new Set(
      rawConcepts.map((c) => c.trim()).filter((c) => c.length > 0),
    );
    for (const concept of concepts) {
      bump(conceptMap, concept, concept, status, points, earned, entry.number);
    }
  }

  overall.accuracy = overall.graded > 0 ? overall.correct / overall.graded : null;
  overall.earnedPoints = round1(overall.earnedPoints);
  overall.maxPoints = round1(overall.maxPoints);

  const byType = [...typeMap.values()].map(finalize).sort(byWeakness);
  const byDifficulty = [...diffMap.values()]
    .map(finalize)
    .sort(
      (a, b) =>
        (DIFFICULTY_RANK[a.key] ?? 99) - (DIFFICULTY_RANK[b.key] ?? 99),
    );
  const byPassage = [...passageMap.values()].map(finalize).sort(byWeakness);
  const byConcept = [...conceptMap.values()].map(finalize).sort(byWeakness);

  return { overall, byType, byDifficulty, byPassage, byConcept, hasDetail };
}
