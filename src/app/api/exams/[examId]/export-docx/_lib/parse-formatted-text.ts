import { TextRun, UnderlineType } from "docx";
import { FONT, PASSAGE_SIZE } from "./styles";

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
  }> = {}
): TextRun[] {
  const regex = /<u>(.*?)<\/u>|<b>(.*?)<\/b>|__([^_]+)__|_([^_]+)_|_{3,}|([①②③④⑤])|\(([a-eA-E])\)/g;
  const runs: TextRun[] = [];
  let lastIndex = 0;
  let match;

  const font = baseStyle.font || FONT;
  const size = baseStyle.size || PASSAGE_SIZE;
  const baseColor = baseStyle.color;

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
      runs.push(new TextRun({ text: match[1], font, size, underline: { type: UnderlineType.SINGLE }, bold: baseStyle.bold, italics: baseStyle.italics, ...(baseColor ? { color: baseColor } : {}) }));
    } else if (match[2]) {
      // <b>word</b>
      runs.push(new TextRun({ text: match[2], font, size, bold: true, italics: baseStyle.italics, ...(baseColor ? { color: baseColor } : {}) }));
    } else if (match[3] || match[4]) {
      // __word__ or _word_ -> underlined bold
      const word = match[3] || match[4];
      const choicePrefixMatch = word.match(/^\(([a-eA-E])\)\s(.+)$/);
      if (choicePrefixMatch) {
        runs.push(
          new TextRun({
            text: `(${choicePrefixMatch[1]})`,
            font,
            size,
            bold: true,
          })
        );
        runs.push(
          new TextRun({
            text: ` ${choicePrefixMatch[2]}`,
            font,
            size,
            bold: true,
            underline: { type: UnderlineType.SINGLE },
          })
        );
      } else {
        runs.push(
          new TextRun({
            text: word,
            font,
            size,
            bold: true,
            underline: { type: UnderlineType.SINGLE },
          })
        );
      }
    } else if (match[5]) {
      // Circled numbers ①②③④⑤
      runs.push(
        new TextRun({
          text: match[5],
          font,
          size,
          bold: true,
          ...(baseColor ? { color: baseColor } : {}),
        })
      );
    } else if (match[6]) {
      // (A)-(E)
      runs.push(
        new TextRun({
          text: `(${match[6]})`,
          font,
          size,
          bold: true,
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
