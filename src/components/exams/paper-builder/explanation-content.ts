import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import type { PaperItem } from "./types";

// ---------------------------------------------------------------------------
// 인라인 정답·해설(해설 포함 PDF) 콘텐츠.
// DOCX 해설(build-builder-document/answer.ts)과 동일한 구성: 정답 배지 → 해설 →
// 핵심 포인트 → 오답 분석. 페이지네이션 높이 추정과 실제 렌더가 같은 행 목록을
// 공유하도록 한곳에서 만든다.
// ---------------------------------------------------------------------------

export type ExplanationRow =
  | { type: "answer"; text: string; hasOptions: boolean }
  | { type: "label"; text: string }
  | { type: "text"; text: string }
  | { type: "bullet"; text: string }
  | { type: "wrong"; label: string; text: string };

// DOCX helpers.ts 의 safeParseJSON 과 동일 동작(문자열 JSON / 이미 파싱된 값 모두 허용).
function safeParseJSON<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (Array.isArray(value)) return value as T;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function explanationCorrectAnswer(item: PaperItem): string {
  const source = item.sourceQuestion;
  return formatStoredQuestionCorrectAnswer({
    subType: source.subType,
    typeId: source.type,
    // 빌더에서 편집한 정답을 우선, 없으면 원본 값(export-docx 와 동일 우선순위).
    correctAnswer: item.correctAnswer || source.correctAnswer,
    structuredData: source.structuredData,
  });
}

export function buildExplanationRows(item: PaperItem): ExplanationRow[] {
  const rows: ExplanationRow[] = [];
  const hasOptions = item.options.length > 0;
  rows.push({ type: "answer", text: explanationCorrectAnswer(item), hasOptions });

  const explanation = item.sourceQuestion.explanation;
  if (!explanation) return rows;

  const content = (explanation.content || "").trim();
  if (content) {
    rows.push({ type: "label", text: "해설" });
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) rows.push({ type: "text", text: trimmed });
    }
  }

  const keyPoints = safeParseJSON<string[]>(explanation.keyPoints, []).filter(
    (kp) => typeof kp === "string" && kp.trim().length > 0,
  );
  if (keyPoints.length > 0) {
    rows.push({ type: "label", text: "핵심 포인트" });
    for (const kp of keyPoints) rows.push({ type: "bullet", text: kp.trim() });
  }

  // KO 봉투는 배열형([{label, explanation}]) 계약 — Record 로 정규화해야 소실되지 않는다.
  // 영어 Record 형은 기존 경로 그대로 (DOCX/HWPX answer 렌더와 동일 규약).
  const wrongRaw = safeParseJSON<unknown>(explanation.wrongOptionExplanations, {});
  const wrong: Record<string, string> = Array.isArray(wrongRaw)
    ? Object.fromEntries(
        wrongRaw
          .filter(
            (e): e is { label: string; explanation: string } =>
              !!e &&
              typeof e === "object" &&
              typeof (e as { label?: unknown }).label === "string" &&
              typeof (e as { explanation?: unknown }).explanation === "string",
          )
          .map((e) => [e.label, e.explanation]),
      )
    : ((wrongRaw ?? {}) as Record<string, string>);
  const wrongEntries = Object.entries(wrong).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );
  // 오답 분석은 선택지가 있는 문항에서만(DOCX 와 동일).
  if (wrongEntries.length > 0 && hasOptions) {
    rows.push({ type: "label", text: "오답 분석" });
    for (const [label, v] of wrongEntries) {
      rows.push({ type: "wrong", label, text: v.trim() });
    }
  }

  return rows;
}
