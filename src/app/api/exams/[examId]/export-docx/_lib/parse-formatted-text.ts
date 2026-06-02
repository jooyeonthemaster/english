import { TextRun, UnderlineType } from "docx";
import { COLOR, FONT, PASSAGE_SIZE } from "./styles";

// ---------------------------------------------------------------------------
// parseFormattedText
// ---------------------------------------------------------------------------

export function parseFormattedText(
  text: string,
  baseStyle: Partial<{
    bold: boolean;
    size: number;
    font: string;
    color: string;
    italics: boolean;
    // (A)-style alphabet markers 색. 미리보기 기본은 파랑(text-blue-700)이나
    // 선지/순서(SENTENCE_ORDER·INSERT) 컨텍스트는 검정으로 넘긴다. 동그라미 마커는
    // 미리보기에서 항상 파랑이므로 이 값과 무관하게 파랑으로 고정한다.
    markerColor: string;
  }> = {}
): TextRun[] {
  const regex = /<u>(.*?)<\/u>|<b>(.*?)<\/b>|__([^_]+)__|_([^_]+)_|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])|\(([a-jA-J])\)/g;
  const runs: TextRun[] = [];
  let lastIndex = 0;
  let match;

  const font = baseStyle.font || FONT;
  const size = baseStyle.size || PASSAGE_SIZE;
  const baseColor = baseStyle.color;
  const alphaMarkerColor = baseStyle.markerColor || COLOR.markerBlue;
  const ul = { type: UnderlineType.SINGLE, color: COLOR.underlineBlue }; // __밑줄__ = 파랑

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: text.slice(lastIndex, match.index),
          font,
          size,
          bold: baseStyle.bold,
          italics: baseStyle.italics,
          ...(baseColor ? { color: baseColor } : {}),
        })
      );
    }

    if (match[1]) {
      // <u>word</u>
      runs.push(new TextRun({ text: match[1], font, size, underline: ul, bold: baseStyle.bold, italics: baseStyle.italics, ...(baseColor ? { color: baseColor } : {}) }));
    } else if (match[2]) {
      // <b>word</b>
      runs.push(new TextRun({ text: match[2], font, size, bold: true, italics: baseStyle.italics, ...(baseColor ? { color: baseColor } : {}) }));
    } else if (match[3] || match[4]) {
      // __word__ or _word_ -> underlined bold
      const word = match[3] || match[4];
      const circledPrefixMatch = word.match(/^([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s(.+)$/);
      if (circledPrefixMatch) {
        runs.push(
          new TextRun({
            text: circledPrefixMatch[1],
            font,
            size,
            bold: true,
            color: alphaMarkerColor,
          })
        );
        runs.push(
          new TextRun({
            text: ` ${circledPrefixMatch[2]}`,
            font,
            size,
            bold: true,
            underline: ul,
          })
        );
        lastIndex = match.index + match[0].length;
        continue;
      }
      const choicePrefixMatch = word.match(/^\(([a-jA-J])\)\s(.+)$/);
      if (choicePrefixMatch) {
        runs.push(
          new TextRun({
            text: `(${choicePrefixMatch[1]})`,
            font,
            size,
            bold: true,
            color: alphaMarkerColor,
          })
        );
        runs.push(
          new TextRun({
            text: ` ${choicePrefixMatch[2]}`,
            font,
            size,
            bold: true,
            underline: ul,
          })
        );
      } else {
        runs.push(
          new TextRun({
            text: word,
            font,
            size,
            bold: true,
            underline: ul,
          })
        );
      }
    } else if (match[5]) {
      // Circled numbers/letters — 미리보기는 항상 파랑(text-blue-700)
      runs.push(
        new TextRun({
          text: match[5],
          font,
          size,
          bold: true,
          color: COLOR.markerBlue,
        })
      );
    } else if (match[6]) {
      // (A)-(E) alphabet markers
      runs.push(
        new TextRun({
          text: `(${match[6]})`,
          font,
          size,
          bold: true,
          color: alphaMarkerColor,
        })
      );
    } else {
      // _____
      runs.push(
        new TextRun({
          text: "               ",
          font,
          size,
          underline: { type: UnderlineType.SINGLE },
        })
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(
      new TextRun({
        text: text.slice(lastIndex),
        font,
        size,
        bold: baseStyle.bold,
        italics: baseStyle.italics,
        ...(baseColor ? { color: baseColor } : {}),
      })
    );
  }

  if (runs.length === 0) {
    runs.push(
      new TextRun({
        text,
        font,
        size,
        bold: baseStyle.bold,
        italics: baseStyle.italics,
        ...(baseColor ? { color: baseColor } : {}),
      })
    );
  }

  return runs;
}
