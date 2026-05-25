/**
 * DOCX 의 parseFormattedText 를 HWPX RunNode[] 로 포팅한 버전.
 *  - <u>...</u>     밑줄
 *  - <b>...</b>     굵게
 *  - __word__       굵게+밑줄
 *  - _word_         굵게+밑줄
 *  - ___+           빈 밑줄 (긴 공백 + 밑줄)
 *  - 원 숫자         굵게
 *  - (A)~(E)        굵게
 */

import type { RunNode, RunStyle } from "./types";

const PATTERN =
  /<u>(.*?)<\/u>|<b>(.*?)<\/b>|__([^_]+)__|_([^_]+)_|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])|\(([a-jA-J])\)/g;

const koreanRe = /[\uac00-\ud7a3]/;

export function pickFont(text: string, base: RunStyle | undefined): RunStyle {
  // 한글 포함 → 한글 폰트 우선. 영문만 → Latin 폰트.
  // (charShape 가 lang 별 폰트를 둘 다 갖고 있어 한컴이 자동 선택하지만,
  //  size 등 일관성을 위해 명시.)
  return base ?? {};
}

export function parseFormattedToRuns(
  text: string,
  base: RunStyle = {},
): RunNode[] {
  const result: RunNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  const push = (slice: string, override?: Partial<RunStyle>) => {
    if (!slice) return;
    const style: RunStyle = { ...base, ...(override ?? {}) };
    result.push({ kind: "text", text: slice, style });
  };

  PATTERN.lastIndex = 0;
  while ((m = PATTERN.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index));

    if (m[1] !== undefined) {
      push(m[1], { underline: "SOLID" });
    } else if (m[2] !== undefined) {
      push(m[2], { bold: true });
    } else if (m[3] !== undefined || m[4] !== undefined) {
      const word = (m[3] ?? m[4])!;
      const choice = word.match(/^\(([a-jA-J])\)\s(.+)$/);
      if (choice) {
        push(`(${choice[1]})`, { bold: true });
        push(` ${choice[2]}`, { bold: true, underline: "SOLID" });
      } else {
        push(word, { bold: true, underline: "SOLID" });
      }
    } else if (m[5] !== undefined) {
      push(m[5], { bold: true });
    } else if (m[6] !== undefined) {
      push(`(${m[6]})`, { bold: true });
    } else {
      // _____ 다수
      push("               ", { underline: "SOLID" });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last));

  if (result.length === 0) {
    result.push({ kind: "text", text, style: base });
  }
  return result;
}

/** 텍스트에 한글이 있으면 한글 폰트, 영문만이면 Latin 폰트를 default 로 잡아주는 RunStyle. */
export function styleForMixedText(
  text: string,
  base: RunStyle = {},
): RunStyle {
  // hp:fontRef 가 hangul/latin 을 둘 다 갖고있어 자동 분리되므로 사실상
  // 한 charShape 에 두 폰트가 다 들어가있다. fontKr/fontLatin 모두 default
  // 일 때는 한컴이 자동으로 글자별 적용. 사용자 명시 시에만 override.
  return base;
}

void koreanRe; // 미사용이지만 추후 확장 대비 보존
