// ============================================================================
// 학생용 payload 변환 — 정답키 제거 + MATCH/SPAN 누출 방지 (스펙 §3.5 toStudentPayload)
// 서버(page.tsx)에서 호출해 정답이 클라이언트로 새지 않게 한다.
// ============================================================================

import type {
  PassagePolicy,
  TutorActivityPayload,
} from "@/lib/tutor/activity-payload-schema";

interface StudentBase {
  prompt: string;
  instruction?: string;
  hint?: string;
  passagePolicy: PassagePolicy;
  refKey?: string;
  recallStage?: number;
  source?: { sentenceIndex?: number; sentenceIndices?: number[] };
}

type Option = string | { label: string; before?: string; after?: string };

export interface StudentChoice extends StudentBase {
  form: "CHOICE";
  variant: "plain" | "stem" | "insertion" | "marked_passage" | "order_paragraphs";
  stem?: string;
  targetSentence?: string;
  markedPassage?: string;
  markers?: { no: number; text: string }[];
  paragraphs?: { label: string; text: string }[];
  options: Option[];
}

export interface StudentChip extends StudentBase {
  form: "CHIP";
  variant: "rebuild" | "order" | "chunk_reading";
  chips: { id: number; text: string }[];
}

export interface StudentMatch extends StudentBase {
  form: "MATCH";
  leftItems: string[];
  rightItems: string[];
}

export interface StudentSpan extends StudentBase {
  form: "SPAN";
  variant: "grammar_error";
  spanTokens: string[];
}

export interface StudentText extends StudentBase {
  form: "TEXT";
  variant: "translate" | "cloze" | "first_letter" | "spell" | "derive" | "correct" | "transform" | "conditional";
  inputMode: "short" | "long";
  firstLetter?: string;
  length?: number;
  firstLetterChips?: string[];
  transformType?: string;
  conditions?: string[];
  scaffold?: string;
}

export type StudentPayload = StudentChoice | StudentChip | StudentMatch | StudentSpan | StudentText;

// 안정적 시드 셔플(서버/클라 동일 결과 → 하이드레이션 안전).
function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function base(payload: TutorActivityPayload): StudentBase {
  return {
    prompt: payload.prompt,
    instruction: payload.instruction,
    hint: payload.hint,
    passagePolicy: payload.passagePolicy,
    refKey: payload.refKey,
    recallStage: payload.recallStage,
    source: payload.source,
  };
}

export function toStudentPayload(payload: TutorActivityPayload): StudentPayload {
  switch (payload.form) {
    case "CHOICE":
      return {
        ...base(payload),
        form: "CHOICE",
        variant: payload.variant,
        stem: payload.stem,
        targetSentence: payload.targetSentence,
        markedPassage: payload.markedPassage,
        markers: payload.markers,
        paragraphs: payload.paragraphs,
        options: payload.options,
      };
    case "CHIP":
      return {
        ...base(payload),
        form: "CHIP",
        variant: payload.variant,
        // 생성기가 이미 셔플된 표시순서로 저장하므로 correctOrder만 제거하고 그대로 전달.
        chips: payload.chips,
      };
    case "MATCH":
      return {
        ...base(payload),
        form: "MATCH",
        leftItems: payload.pairs.map((pair) => pair.left),
        // 오른쪽 보기는 매핑이 드러나지 않도록 셔플.
        rightItems: seededShuffle(payload.pairs.map((pair) => pair.right), payload.pairs.map((p) => p.left).join("|")),
      };
    case "SPAN":
      return {
        ...base(payload),
        form: "SPAN",
        variant: payload.variant,
        spanTokens: payload.spanTokens, // textFragment/correctSpan 제거
      };
    case "TEXT":
      return {
        ...base(payload),
        form: "TEXT",
        variant: payload.variant,
        inputMode: payload.inputMode,
        firstLetter: payload.firstLetter,
        length: payload.length,
        firstLetterChips: payload.firstLetterChips,
        transformType: payload.transformType,
        conditions: payload.conditions,
        scaffold: payload.scaffold,
      };
    default:
      return payload;
  }
}
