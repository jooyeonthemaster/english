// ============================================================================
// AI 문제 수정 — 결정론 변경 요약 (before vs after 필드 diff)
// ============================================================================
// 모델에 별도 비용을 들이지 않고, 구조화 필드를 비교해 "무엇이 바뀌었나"를 칩으로
// 보여 준다. before/after 패널의 시각 비교를 보조한다.
// ============================================================================

import type { EditFieldChange, StructuredQuestionLike } from "./types";

const FIELD_LABELS: Record<string, string> = {
  direction: "발문",
  options: "선택지",
  correctAnswer: "정답",
  correctAnswers: "정답",
  modelAnswer: "모범답안",
  explanation: "해설",
  keyPoints: "핵심 포인트",
  wrongOptionExplanations: "오답 해설",
  difficulty: "난이도",
  passageWithBlank: "빈칸 지문",
  passageWithMarkers: "표시 지문",
  passageWithUnderline: "밑줄 지문",
  passageWithNumbers: "번호 지문",
  markedExpressions: "표시 표현",
  markedWords: "표시 단어",
  slots: "선택 슬롯",
  underlinedSegments: "밑줄 구간",
  blanks: "빈칸",
  paragraphs: "단락",
  conditions: "조건",
  scrambledWords: "배열 단어",
  givenSentence: "주어진 문장",
  summaryWithBlanks: "요약문",
  sentenceWithBlank: "빈칸 문장",
  tags: "태그",
};

/** 비교 대상 필드(나머지 내부 제어 필드는 제외). */
const COMPARE_KEYS = Object.keys(FIELD_LABELS);

function canon(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 위치 메타(label)를 제외한 내용 서명 — "내용 동일·순서만 다름"(reordered) 판정용.
 *  선택지/빈칸은 label 이 위치 식별자라 텍스트가 자리만 바뀐 것을 reorder 로 잡아야 한다. */
function contentKey(item: unknown): string {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (k === "label") continue;
      rest[k] = v;
    }
    return canon(rest);
  }
  return canon(item);
}

function arrayItemsKey(arr: unknown[]): string {
  return arr.map((it) => contentKey(it)).sort().join(" | ");
}

export function computeEditChanges(
  before: StructuredQuestionLike,
  after: StructuredQuestionLike,
): EditFieldChange[] {
  const changes: EditFieldChange[] = [];

  for (const key of COMPARE_KEYS) {
    const b = before[key];
    const a = after[key];
    const bHas = b !== undefined && b !== null && canon(b) !== "" && canon(b) !== "[]";
    const aHas = a !== undefined && a !== null && canon(a) !== "" && canon(a) !== "[]";
    if (!bHas && !aHas) continue;

    const label = FIELD_LABELS[key] ?? key;

    if (bHas && !aHas) {
      changes.push({ field: key, label, kind: "removed" });
      continue;
    }
    if (!bHas && aHas) {
      changes.push({ field: key, label, kind: "added" });
      continue;
    }

    // 둘 다 존재 — 동일 여부.
    if (canon(b) === canon(a)) continue;

    // 배열은 "내용 동일·순서만 다름"=reordered 로 구분(위치 메타 label 무시).
    if (Array.isArray(b) && Array.isArray(a) && b.length === a.length) {
      if (arrayItemsKey(b) === arrayItemsKey(a)) {
        changes.push({ field: key, label, kind: "reordered" });
        continue;
      }
    }
    changes.push({ field: key, label, kind: "changed" });
  }

  // 같은 라벨(correctAnswer/correctAnswers)이 둘 다 잡히면 중복 제거.
  const seen = new Set<string>();
  return changes.filter((c) => {
    const k = `${c.label}:${c.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
