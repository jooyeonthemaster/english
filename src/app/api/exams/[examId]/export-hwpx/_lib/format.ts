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
import { COLORS } from "./tokens";

const PATTERN =
  /<u>(.*?)<\/u>|<b>(.*?)<\/b>|__([^_]+)__|_([^_]+)_|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])|\(([a-jA-J])\)/g;

const koreanRe = /[\uac00-\ud7a3]/;

export function pickFont(text: string, base: RunStyle | undefined): RunStyle {
  // 한글 포함 → 한글 폰트 우선. 영문만 → Latin 폰트.
  // (charShape 가 lang 별 폰트를 둘 다 갖고 있어 한컴이 자동 선택하지만,
  //  size 등 일관성을 위해 명시.)
  return base ?? {};
}

export interface FormatOptions {
  // (A)~(E) 알파벳 마커 색. 기본 파랑(markerBlue). 선지/SENTENCE_ORDER 본문은 검정.
  // (동그라미 마커 ①·ⓐ 는 DOCX 와 동일하게 항상 파랑이라 이 값을 무시한다.)
  markerColor?: string;
}

export function parseFormattedToRuns(
  text: string,
  base: RunStyle = {},
  opts: FormatOptions = {},
): RunNode[] {
  const result: RunNode[] = [];
  const markerColor = opts.markerColor ?? COLORS.markerBlue;
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
      // <u>…</u> : 파랑 밑줄 (DOCX underlineBlue)
      push(m[1], { underline: "SOLID", underlineColor: COLORS.underlineBlue });
    } else if (m[2] !== undefined) {
      // <b>…</b> : 굵게(색 없음)
      push(m[2], { bold: true });
    } else if (m[3] !== undefined || m[4] !== undefined) {
      // __word__ / _word_ : 굵게 + 파랑 밑줄
      const word = (m[3] ?? m[4])!;
      const circledChoice = word.match(/^([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s(.+)$/);
      if (circledChoice) {
        push(circledChoice[1], { bold: true, color: markerColor });
        push(` ${circledChoice[2]}`, {
          bold: true,
          underline: "SOLID",
          underlineColor: COLORS.underlineBlue,
        });
        last = m.index + m[0].length;
        continue;
      }
      const choice = word.match(/^\(([a-jA-J])\)\s(.+)$/);
      if (choice) {
        // "(a) text" 형태: (a) 마커는 markerColor, 나머지는 굵게+파랑밑줄
        push(`(${choice[1]})`, { bold: true, color: markerColor });
        push(` ${choice[2]}`, {
          bold: true,
          underline: "SOLID",
          underlineColor: COLORS.underlineBlue,
        });
      } else {
        push(word, {
          bold: true,
          underline: "SOLID",
          underlineColor: COLORS.underlineBlue,
        });
      }
    } else if (m[5] !== undefined) {
      // 동그라미 숫자/문자 ①·ⓐ : DOCX 와 동일하게 항상 파랑(markerBlue)
      push(m[5], { bold: true, color: COLORS.markerBlue });
    } else if (m[6] !== undefined) {
      // (A)~(J) 알파벳 마커 : markerColor (기본 파랑, 선지/SENTENCE_ORDER 는 검정)
      push(`(${m[6]})`, { bold: true, color: markerColor });
    } else {
      // _____ (긴 빈칸) : 검정 밑줄(색 없음)
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
