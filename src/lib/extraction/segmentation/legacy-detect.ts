// ============================================================================
// LEGACY segmentation — line splitting, marker detection, header extraction,
// passage content validation. Extracted verbatim from segmentation.ts.
// ============================================================================

import { MIN_COMMIT_PASSAGE_LENGTH } from "../constants";
import {
  RANGE_MARKER,
  KR_INSTRUCTION,
  EN_INSTRUCTION,
  QUESTION_NUMBER_RE,
  CHOICE_LINE_RE,
  HEADER_PATTERNS,
  BULLET_NOTICE_RE,
  PROSE_SENTENCE_END_RE,
} from "./legacy-patterns";

/** Split a page's OCR into logical lines, stripping obvious noise. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, ""))
    .filter((l) => l.length > 0);
}

export interface DetectedMarker {
  /** "2~4" when a [N~M] bracket is present, else null. */
  range: string | null;
  /** When a range marker exists: true if its trailing text is an explicit
   *  "read the passage" instruction (shared-passage style). */
  sharedPassage: boolean;
  /** True when the line is a recognised Korean/English instruction (with or
   *  without a range marker). Triggers a bucket flush. */
  isInstruction: boolean;
  /** Whether to keep this line as part of the new bucket. Always true when
   *  it carries instruction text; false when it's only a range label that
   *  should be absorbed into the title. */
  keepLine: boolean;
}

/** Detect marker on a line. */
export function detectMarker(line: string): DetectedMarker {
  const rm = line.match(RANGE_MARKER);
  if (rm) {
    const range = `${rm[1]}~${rm[2]}`;
    const afterMarker = line.slice((rm.index ?? 0) + rm[0].length).trim();
    const sharedPassage =
      /다음\s*(?:글|문장|문단|지문|대화)(?:을|의)?\s*읽고/.test(afterMarker) ||
      /Read\s+the\s+(?:following\s+)?(?:passage|text|paragraph|article|dialogue)/i.test(
        afterMarker,
      );
    const instructionRight =
      sharedPassage ||
      KR_INSTRUCTION.test(afterMarker) ||
      EN_INSTRUCTION.test(afterMarker);
    return {
      range,
      sharedPassage,
      isInstruction: true,
      keepLine: instructionRight,
    };
  }
  if (KR_INSTRUCTION.test(line) || EN_INSTRUCTION.test(line)) {
    return {
      range: null,
      sharedPassage: false,
      isInstruction: true,
      keepLine: true,
    };
  }
  return {
    range: null,
    sharedPassage: false,
    isInstruction: false,
    keepLine: true,
  };
}

/**
 * Strip leading exam-paper header lines (교재명, 학교명, 학년, 교시, 과목코드, ...).
 *
 * Looks at up to the first 25 lines of the first page and returns a split
 * between `header` (stripped) and `body` (fed into segmentation). Stops as
 * soon as a real content signal appears (instruction, question number,
 * choice glyph, or a long prose line).
 */
export function extractHeader(lines: string[]): {
  header: string[];
  body: string[];
} {
  const header: string[] = [];
  const maxScan = Math.min(lines.length, 40);
  let splitAt = 0;

  for (let i = 0; i < maxScan; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (header.length > 0) {
        header.push(line);
        splitAt = i + 1;
      }
      continue;
    }

    // Hard stop: first real content line (지시문 / 문제번호 / 선지 글리프)
    if (
      detectMarker(line).isInstruction ||
      QUESTION_NUMBER_RE.test(line) ||
      CHOICE_LINE_RE.test(line)
    ) {
      splitAt = i;
      break;
    }

    // Header signal match → absorb REGARDLESS of line length. 길이 무시가 핵심:
    // "ㅇ 문항에 따라 배점이 다르므로 각 물음의 끝에 표시된 배점을 참고하시오."
    // 같은 긴 안내문도 헤더 불릿 패턴에 걸리면 헤더로 흡수해야 한다.
    if (HEADER_PATTERNS.some((p) => p.test(line))) {
      header.push(line);
      splitAt = i + 1;
      continue;
    }

    // Already accumulating header and this is a short neutral line
    // (제목·부제 느낌) → absorb.
    if (header.length > 0 && trimmed.length <= 40) {
      header.push(line);
      splitAt = i + 1;
      continue;
    }

    // 긴 prose 라인 + 헤더 모드 아님 → 지문 시작.
    if (trimmed.length > 40) {
      splitAt = i;
      break;
    }

    // 애매한 짧은 줄 — 지문 시작으로 간주.
    splitAt = i;
    break;
  }

  return {
    header,
    body: lines.slice(splitAt),
  };
}

/**
 * Heuristic content validator — answers "is this bucket actually a passage?".
 *
 * Filters out buckets that survived segmentation but are clearly
 * header/notice leftovers (e.g. a handful of bullet-prefixed notice lines +
 * a section title + a textbook marker with no real prose).
 *
 * Rules:
 *   1. 40자 미만이면 drop (constants.ts MIN_COMMIT_PASSAGE_LENGTH와 동등).
 *   2. 라인의 40% 이상이 불릿(◦/ㅇ/○/•) 접두면 notice → drop.
 *   3. 라인의 50% 이상이 HEADER_PATTERNS 매치면 헤더 유출 → drop.
 *   4. 종결부호(. ! ?)로 끝나는 prose 문장이 0개 + 문장 수 ≤ 4면 지문 아님 → drop.
 *   5. 통과하면 ok=true.
 */
export function looksLikePassage(content: string): { ok: boolean; reason?: string } {
  const trimmed = content.trim();
  if (trimmed.length < MIN_COMMIT_PASSAGE_LENGTH) {
    return { ok: false, reason: "too_short" };
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false, reason: "empty_after_split" };

  const bulletNoticeCount = lines.filter((l) => BULLET_NOTICE_RE.test(l)).length;
  if (bulletNoticeCount / lines.length > 0.4) {
    return { ok: false, reason: "mostly_bullet_notices" };
  }

  const headerSignalCount = lines.filter((l) =>
    HEADER_PATTERNS.some((p) => p.test(l)),
  ).length;
  if (headerSignalCount / lines.length > 0.5) {
    return { ok: false, reason: "mostly_header_signals" };
  }

  const proseSentenceCount = lines.filter((l) => PROSE_SENTENCE_END_RE.test(l)).length;
  if (proseSentenceCount === 0 && lines.length <= 4) {
    return { ok: false, reason: "no_prose_sentences" };
  }

  return { ok: true };
}
