import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  UnderlineType,
  IBorderOptions,
  ITableCellBorders,
  TableLayoutType,
} from "docx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExamQuestionData {
  orderNum: number;
  points: number;
  question: {
    type: string;
    subType: string | null;
    questionText: string;
    options: string | null;
    correctAnswer: string;
    difficulty: string;
    passage: { title: string; content: string } | null;
    explanation: {
      content: string;
      keyPoints: string | null;
      wrongOptionExplanations: string | null;
    } | null;
  };
}

interface ParsedOption {
  label: string;
  text: string;
}

interface ParsedSection {
  type:
    | "direction"
    | "passage"
    | "marker"
    | "conditions"
    | "paragraphs"
    | "scrambled"
    | "hint"
    | "error"
    | "blanks"
    | "summary"
    | "target"
    | "context"
    | "matchType"
    | "fallback";
  label?: string;
  content: string;
  items?: string[];
}

// ---------------------------------------------------------------------------
// Constants — Real Korean Exam Grade Styles (수능 / 내신 표준)
// ---------------------------------------------------------------------------

const FONT = "Times New Roman";
const KR_FONT = "바탕"; // The absolute standard for Korean printed exam papers

// Half-point sizes: multiply pt by 2
const TITLE_SIZE = 36; // 18pt
const QUESTION_SIZE = 22; // 11pt (Direction text)
const QUESTION_NUM_SIZE = 24; // 12pt (Question number is slightly larger)
const PASSAGE_SIZE = 22; // 11pt (Passage and options)
const SMALL_SIZE = 18; // 9pt (Points, hints)
const LABEL_SIZE = 20; // 10pt (Subtitles, labels)
const SUBTITLE_SIZE = 22; // 11pt

const COLOR = {
  black: "000000",
  darkGray: "333333",
  gray: "666666",
  lightGray: "999999",
  separator: "CCCCCC",
  errorLeft: "FF0000",
  answerBg: "F9F9F9",
} as const;

// ---------------------------------------------------------------------------
// Border helpers
// ---------------------------------------------------------------------------

function bdr(
  style: (typeof BorderStyle)[keyof typeof BorderStyle],
  size: number,
  color: string
): IBorderOptions {
  return { style, size, color };
}

const NONE: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF",
};

function noBorders(): ITableCellBorders {
  return { top: NONE, bottom: NONE, left: NONE, right: NONE };
}

/** Thin box border (0.5pt = size 4) */
function thinBox(color: string, size = 4): ITableCellBorders {
  const b = bdr(BorderStyle.SINGLE, size, color);
  return { top: b, bottom: b, left: b, right: b };
}

/** Horizontal rule paragraph */
function hrule(
  color: string = COLOR.separator,
  size = 4,
  spaceBefore = 80,
  spaceAfter = 80
): Paragraph {
  return new Paragraph({
    spacing: { before: spaceBefore, after: spaceAfter },
    border: {
      bottom: bdr(BorderStyle.SINGLE, size, color),
      top: NONE,
      left: NONE,
      right: NONE,
    },
    children: [new TextRun({ text: " " })],
  });
}

// ---------------------------------------------------------------------------
// parseFormattedText
// ---------------------------------------------------------------------------

function parseFormattedText(
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

// ---------------------------------------------------------------------------
// Parse questionText
// ---------------------------------------------------------------------------

function parseQuestionSections(
  questionText: string,
  subType: string | null
): ParsedSection[] {
  if (!questionText) return [];

  const sections: ParsedSection[] = [];
  const blocks = questionText.split(/\n\n/).filter(Boolean);

  const MARKER_MAP: Record<
    string,
    { type: ParsedSection["type"]; label: string }
  > = {
    "[주어진 문장]": { type: "marker", label: "주어진 문장" },
    "[영작할 우리말]": { type: "marker", label: "영작할 우리말" },
    "[원문]": { type: "marker", label: "원문" },
    "[조건]": { type: "conditions", label: "조건" },
    "[요약문]": { type: "summary", label: "요약문" },
    "[빈칸 정답]": { type: "blanks", label: "빈칸 정답" },
    "[배열 단어]": { type: "scrambled", label: "배열 단어" },
    "[힌트]": { type: "hint", label: "힌트" },
    "[오류 문장]": { type: "error", label: "오류 문장" },
    "[대상 단어]": { type: "target", label: "대상 단어" },
    "[문맥]": { type: "context", label: "문맥" },
    "[유형:": { type: "matchType", label: "유형" },
  };

  let directionFound = false;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let matched = false;
    for (const [marker, config] of Object.entries(MARKER_MAP)) {
      if (trimmed.startsWith(marker)) {
        let content = trimmed.slice(marker.length).replace(/^\s*/, "");
        if (marker === "[유형:") {
          content = content.replace(/\]$/, "");
        }

        if (config.type === "conditions") {
          const lines = content.split("\n").filter(Boolean);
          const items = lines.map((l) => l.replace(/^\d+\.\s*/, "").trim());
          sections.push({
            type: "conditions",
            label: config.label,
            content,
            items,
          });
        } else if (config.type === "scrambled") {
          const words = content.split(/\s*\/\s*/);
          sections.push({
            type: "scrambled",
            label: config.label,
            content,
            items: words,
          });
        } else if (config.type === "blanks") {
          sections.push({ type: "blanks", label: config.label, content });
        } else {
          sections.push({ type: config.type, label: config.label, content });
        }
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (!directionFound) {
      directionFound = true;
      sections.push({ type: "direction", content: trimmed });
      continue;
    }

    if (/^\([A-C]\)\s/.test(trimmed) || /^\([a-c]\)\s/.test(trimmed)) {
      const lines = trimmed.split("\n").filter(Boolean);
      sections.push({
        type: "paragraphs",
        label: "단락",
        content: trimmed,
        items: lines,
      });
      continue;
    }

    if (sections.length > 0 && sections[sections.length - 1].type === "passage") {
      sections[sections.length - 1].content += "\n\n" + trimmed;
    } else {
      sections.push({ type: "passage", content: trimmed });
    }
  }

  return sections;
}

function questionTextContainsPassage(sections: ParsedSection[]): boolean {
  return sections.some(
    (s) =>
      s.type === "passage" ||
      s.type === "paragraphs" ||
      s.type === "summary" ||
      s.type === "error"
  );
}

// ---------------------------------------------------------------------------
// Base Components
// ---------------------------------------------------------------------------

function passageTable(contentParagraphs: Paragraph[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: thinBox(COLOR.black, 4), // 0.5pt thick border
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 160, bottom: 160, left: 240, right: 240 },
            children: contentParagraphs,
          }),
        ],
      }),
    ],
  });
}

function makePassageParagraphs(content: string, overrideFont?: string): Paragraph[] {
  if (!content) content = " ";
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: " ", size: PASSAGE_SIZE })] })];
  }
  return lines.map(
    (line, i) =>
      new Paragraph({
        alignment: overrideFont === KR_FONT ? AlignmentType.LEFT : AlignmentType.JUSTIFIED, 
        spacing: {
          after: i < lines.length - 1 ? 40 : 0,
          line: 312, // ~1.3x line height (very generous reading spacing like real exams)
        },
        children: parseFormattedText(line, {
          font: overrideFont || FONT,
          size: PASSAGE_SIZE,
        }),
      })
  );
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

type DocChild = Paragraph | Table;

function renderPassage(content: string): DocChild[] {
  return [
    passageTable(makePassageParagraphs(content)),
    new Paragraph({ spacing: { after: 120 } }) // space after passage box
  ];
}

function renderDirection(
  section: ParsedSection,
  orderNum: number,
  points: number
): DocChild[] {
  const children: TextRun[] = [
    new TextRun({
      text: `${orderNum}. `,
      font: KR_FONT,
      size: QUESTION_NUM_SIZE,
      bold: true,
    }),
    ...parseFormattedText(section.content, {
      font: KR_FONT,
      size: QUESTION_SIZE,
      bold: false,
    }),
  ];

  if (points > 0) {
    children.push(
      new TextRun({
        text: ` [${points}점]`,
        font: KR_FONT,
        size: SMALL_SIZE,
        bold: false,
      })
    );
  }

  return [
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children,
    }),
  ];
}

function renderMarkerSection(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];

  if (section.label) {
    result.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({
            text: `<${section.label}>`,
            font: KR_FONT,
            size: PASSAGE_SIZE,
            bold: true,
          }),
        ],
      })
    );
  }

  const isKorean = section.label === "영작할 우리말";
  
  result.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: thinBox(COLOR.black, 4),
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              width: { size: 100, type: WidthType.PERCENTAGE },
              children: makePassageParagraphs(section.content, isKorean ? KR_FONT : FONT),
            }),
          ],
        }),
      ],
    })
  );

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

function renderConditions(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];
  const items = section.items || [];

  result.push(
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: `<${section.label}>`,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
      ],
    })
  );

  for (let i = 0; i < items.length; i++) {
    result.push(
      new Paragraph({
        spacing: { after: 40, line: 312 },
        indent: { left: 400, hanging: 200 }, // lines up text neatly after number
        children: [
          new TextRun({
            text: `${i + 1}. `,
            font: KR_FONT,
            size: PASSAGE_SIZE,
          }),
          ...parseFormattedText(items[i], {
            font: KR_FONT,
            size: PASSAGE_SIZE,
          }),
        ],
      })
    );
  }

  result.push(new Paragraph({ spacing: { after: 80 } }));
  return result;
}

function renderError(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];

  result.push(
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: `<${section.label}>`,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
      ],
    })
  );

  result.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { 
        left: bdr(BorderStyle.SINGLE, 12, COLOR.black), 
        top: NONE, right: NONE, bottom: NONE, insideHorizontal: NONE, insideVertical: NONE 
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: noBorders(),
              margins: { left: 160 },
              width: { size: 100, type: WidthType.PERCENTAGE },
              children: makePassageParagraphs(section.content),
            }),
          ],
        }),
      ],
    })
  );
  
  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

function renderSummary(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];

  result.push(
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: `<${section.label}>`,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
      ],
    })
  );

  result.push(passageTable(makePassageParagraphs(section.content)));
  result.push(new Paragraph({ spacing: { after: 120 } }));

  return result;
}

function renderScrambled(section: ParsedSection): DocChild[] {
  const words = section.items || [];
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 300, hanging: 300 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(words.join(" / "), { font: FONT, size: PASSAGE_SIZE }),
      ],
    }),
  ];
}

function renderTarget(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 300, hanging: 300 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(section.content, { font: FONT, size: PASSAGE_SIZE, bold: true }),
      ],
    }),
  ];
}

function renderContext(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 300, hanging: 300 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(section.content, {
          font: FONT,
          size: PASSAGE_SIZE,
          italics: true,
        }),
      ],
    }),
  ];
}

function renderParagraphs(section: ParsedSection): DocChild[] {
  const lines = section.items || [];
  const result: DocChild[] = [];

  for (const line of lines) {
    const labelMatch = line.match(/^\(([A-e])\)\s*(.+)$/i);
    if (labelMatch) {
      result.push(
        new Paragraph({
          spacing: { before: 80, after: 0, line: 312 },
          indent: { left: 400, hanging: 400 }, // deep indent wrapper
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({
              text: `(${labelMatch[1]}) `,
              font: FONT,
              size: PASSAGE_SIZE,
              bold: true,
            }),
            ...parseFormattedText(labelMatch[2], {
              font: FONT,
              size: PASSAGE_SIZE,
            }),
          ],
        })
      );
    } else {
      result.push(
        new Paragraph({
          spacing: { before: 40, after: 0, line: 312 },
          indent: { left: 400 },
          alignment: AlignmentType.JUSTIFIED,
          children: parseFormattedText(line, {
            font: FONT,
            size: PASSAGE_SIZE,
          }),
        })
      );
    }
  }

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

function renderBlanks(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 200, hanging: 200 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(section.content, {
          font: FONT,
          size: PASSAGE_SIZE,
        }),
      ],
    }),
  ];
}

function renderHint(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: `※ 힌트: `,
          font: KR_FONT,
          size: SMALL_SIZE,
          color: COLOR.gray,
          bold: true,
        }),
        ...parseFormattedText(section.content, {
          font: KR_FONT,
          size: SMALL_SIZE,
          color: COLOR.gray,
        }),
      ],
    }),
  ];
}

function renderMatchType(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 20 },
      children: [
        new TextRun({
          text: `[유형: ${section.content}]`,
          font: KR_FONT,
          size: 16,
          color: COLOR.lightGray,
        }),
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function renderOptions(options: ParsedOption[]): DocChild[] {
  if (options.length === 0) return [];

  const result: DocChild[] = [];
  const maxLen = Math.max(...options.map((o) => o.text.length));
  
  const toCircle = (lb: string) => {
    const m: Record<string, string> = { "1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤" };
    return m[lb] || lb;
  };

  if (maxLen < 25 && options.length === 5) {
    // Elegant 2-column layout for short/medium options
    const rows: TableRow[] = [];
    for (let i = 0; i < options.length; i += 2) {
      const rowCells: TableCell[] = [];
      for (let j = 0; j < 2; j++) {
        const opt = options[i + j];
        if (opt) {
          const f = /[가-힣]/.test(opt.text) ? KR_FONT : FONT;
          const circleLabel = toCircle(opt.label);
          rowCells.push(
            new TableCell({
              borders: noBorders(),
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  spacing: { line: 276 },
                  indent: { left: 400, hanging: 400 },
                  children: [
                    new TextRun({ text: `${circleLabel}   `, font: KR_FONT, size: PASSAGE_SIZE }),
                    ...parseFormattedText(opt.text, { font: f, size: PASSAGE_SIZE }),
                  ]
                })
              ]
            })
          );
        } else {
           rowCells.push(new TableCell({ borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: " " })] })] }));
        }
      }
      rows.push(new TableRow({ children: rowCells }));
    }
    result.push(new Table({ 
      width: { size: 100, type: WidthType.PERCENTAGE }, 
      borders: noBorders(), 
      rows, 
      layout: TableLayoutType.FIXED 
    }));
  } else {
    // 1 Column for long options
    for (const opt of options) {
      const f = /[가-힣]/.test(opt.text) ? KR_FONT : FONT;
      const circleLabel = toCircle(opt.label);
      result.push(
        new Paragraph({
          spacing: { line: 276, after: 40 },
          indent: { left: 400, hanging: 400 },
          children: [
            new TextRun({
              text: `${circleLabel}   `,
              font: KR_FONT,
              size: PASSAGE_SIZE,
            }),
            ...parseFormattedText(opt.text, { font: f, size: PASSAGE_SIZE }),
          ],
        })
      );
    }
  }

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

// ---------------------------------------------------------------------------
// Answer & Explanation
// ---------------------------------------------------------------------------

function renderAnswer(
  q: ExamQuestionData["question"],
  options: ParsedOption[]
): DocChild[] {
  const result: DocChild[] = [];

  const answerLabel = options.length > 0 ? "정답" : "정답:";
  const answerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: thinBox(COLOR.black, 4),
            shading: { fill: COLOR.answerBg },
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${answerLabel}  `,
                    font: KR_FONT,
                    size: PASSAGE_SIZE,
                    bold: true,
                    color: COLOR.darkGray,
                  }),
                  new TextRun({
                    text: q.correctAnswer,
                    font: FONT,
                    size: QUESTION_SIZE,
                    bold: true,
                    color: COLOR.black,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  result.push(answerTable);
  result.push(new Paragraph({ spacing: { after: 80 } }));

  if (q.explanation) {
    if (q.explanation.content) {
      result.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          indent: { left: 100 },
          children: [
            new TextRun({
              text: "해설",
              font: KR_FONT,
              size: LABEL_SIZE,
              bold: true,
              color: COLOR.darkGray,
            }),
          ],
        })
      );

      const explanationLines = q.explanation.content
        .split("\n")
        .filter((l) => l.trim());
      for (const line of explanationLines) {
        result.push(
          new Paragraph({
            spacing: { after: 40, line: 312 },
            indent: { left: 200 },
            children: [
              new TextRun({
                text: line,
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.gray,
              }),
            ],
          })
        );
      }
    }

    const keyPoints = safeParseJSON<string[]>(q.explanation.keyPoints, []);
    if (keyPoints.length > 0) {
      result.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          indent: { left: 100 },
          children: [
            new TextRun({
              text: "핵심 포인트",
              font: KR_FONT,
              size: LABEL_SIZE,
              bold: true,
              color: COLOR.darkGray,
            }),
          ],
        })
      );

      for (const kp of keyPoints) {
        result.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 200, hanging: 100 },
            children: [
              new TextRun({
                text: "• ",
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.gray,
              }),
              new TextRun({
                text: kp,
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.gray,
              }),
            ],
          })
        );
      }
    }

    const wrongExplanations = safeParseJSON<Record<string, string>>(
      q.explanation.wrongOptionExplanations,
      {}
    );
    if (Object.keys(wrongExplanations).length > 0 && options.length > 0) {
      result.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          indent: { left: 100 },
          children: [
            new TextRun({
              text: "오답 분석",
              font: KR_FONT,
              size: LABEL_SIZE,
              bold: true,
              color: COLOR.darkGray,
            }),
          ],
        })
      );

      for (const [label, explanation] of Object.entries(wrongExplanations)) {
        result.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 200, hanging: 200 },
            children: [
              new TextRun({
                text: `${label} `,
                font: FONT,
                size: SMALL_SIZE,
                bold: true,
                color: COLOR.gray,
              }),
              new TextRun({
                text: explanation,
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.lightGray,
              }),
            ],
          })
        );
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object" && str !== null) return str as T;
  if (typeof str !== "string") return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

function renderWritingSpace(isLong: boolean): DocChild[] {
  const result: DocChild[] = [];
  if (isLong) {
    result.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: thinBox(COLOR.separator, 8), // slightly thicker soft border for writing
                margins: { top: 800, bottom: 800, left: 160, right: 160 }, // Huge padding for writing
                width: { size: 100, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    result.push(
      new Paragraph({
        spacing: { before: 80, after: 120 },
        children: [
          new TextRun({
            text: "정답: ____________________________________________________________________________",
            font: KR_FONT,
            size: PASSAGE_SIZE,
            color: COLOR.gray,
          }),
        ],
      })
    );
  }
  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

// ---------------------------------------------------------------------------
// Element Builder
// ---------------------------------------------------------------------------

function buildQuestionElements(
  eq: ExamQuestionData,
  includeAnswer: boolean
): DocChild[] {
  const elements: DocChild[] = [];
  const q = eq.question;
  const options = safeParseJSON<ParsedOption[]>(q.options, []);

  const sections = parseQuestionSections(q.questionText, q.subType);
  const hasEmbeddedPassage = questionTextContainsPassage(sections);

  // 1. Render Direction FIRST
  const directionSection = sections.find(s => s.type === "direction");
  if (directionSection) {
    elements.push(...renderDirection(directionSection, eq.orderNum, eq.points));
  } else {
    const numChildren: TextRun[] = [
      new TextRun({
        text: `${eq.orderNum}. `,
        font: KR_FONT,
        size: QUESTION_NUM_SIZE,
        bold: true,
      }),
    ];
    if (eq.points > 0) {
      numChildren.push(
        new TextRun({
          text: `[${eq.points}점]`,
          font: KR_FONT,
          size: SMALL_SIZE,
          color: COLOR.gray,
        })
      );
    }
    elements.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: numChildren,
      })
    );
  }

  // 2. Render Passage SECOND (if it is globally attached and not embedded)
  // This explicitly prevents the passage from dropping below the conditions
  if (q.passage && !hasEmbeddedPassage) {
    elements.push(...renderPassage(q.passage.content));
  }

  // 3. Render all other blocks (Conditions, Source Text, Target Words, etc.)
  for (const section of sections) {
    if (section.type === "direction") continue;

    switch (section.type) {
      case "passage":
        elements.push(...renderPassage(section.content));
        break;
      case "marker":
        elements.push(...renderMarkerSection(section));
        break;
      case "conditions":
        elements.push(...renderConditions(section));
        break;
      case "error":
        elements.push(...renderError(section));
        break;
      case "summary":
        elements.push(...renderSummary(section));
        break;
      case "scrambled":
        elements.push(...renderScrambled(section));
        break;
      case "target":
        elements.push(...renderTarget(section));
        break;
      case "context":
        elements.push(...renderContext(section));
        break;
      case "paragraphs":
        elements.push(...renderParagraphs(section));
        break;
      case "blanks":
        elements.push(...renderBlanks(section));
        break;
      case "hint":
        elements.push(...renderHint(section));
        break;
      case "matchType":
        elements.push(...renderMatchType(section));
        break;
      case "fallback":
      default:
        elements.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 200 },
            children: parseFormattedText(section.content, {
              font: FONT,
              size: PASSAGE_SIZE,
            }),
          })
        );
        break;
    }
  }

  // 4. Render Options
  elements.push(...renderOptions(options));

  // 5. Render Subjective Writing Area (if no options and no included answer, perfect for printed tests)
  if (options.length === 0 && !includeAnswer) {
    const isWriting = Boolean(sections.some(
      s => s.type === "conditions" || s.type === "scrambled" || s.type === "blanks" || s.label === "영작할 우리말"
    ) || (q.subType && q.subType.includes("영작")));
    
    // Always provide a writing space for subjective questions
    elements.push(...renderWritingSpace(isWriting));
  }

  // 6. Answer Key / Explanation
  if (includeAnswer) {
    elements.push(...renderAnswer(q, options));
  }

  // Divider
  elements.push(hrule(COLOR.separator, 4, 160, 160));

  return elements;
}

// ---------------------------------------------------------------------------
// Answer Key Table (for student prints)
// ---------------------------------------------------------------------------

function buildAnswerKeyTable(questions: ExamQuestionData[]): DocChild[] {
  const result: DocChild[] = [];

  result.push(hrule(COLOR.darkGray, 12, 300, 200));

  result.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "정 답 표",
          font: KR_FONT,
          size: 28, // 14pt
          bold: true,
        }),
      ],
    })
  );

  const COLS = 5;
  const totalRows = Math.ceil(questions.length / COLS);
  const headerBorder = bdr(BorderStyle.SINGLE, 8, COLOR.darkGray);
  const thinBorder = bdr(BorderStyle.SINGLE, 4, COLOR.separator);

  const headerCells: TableCell[] = [];
  for (let col = 0; col < COLS; col++) {
    headerCells.push(
      new TableCell({
        borders: {
          top: headerBorder, bottom: headerBorder,
          left: col === 0 ? headerBorder : thinBorder,
          right: col === COLS - 1 ? headerBorder : thinBorder,
        },
        shading: { fill: "F5F5F5" },
        width: { size: 20, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({ text: "문항", font: KR_FONT, size: LABEL_SIZE, bold: true }),
              new TextRun({ text: " / ", font: KR_FONT, size: LABEL_SIZE }),
              new TextRun({ text: "정답", font: KR_FONT, size: LABEL_SIZE, bold: true }),
            ],
          }),
        ],
      })
    );
  }

  const dataRows: TableRow[] = [];
  for (let row = 0; row < totalRows; row++) {
    const cells: TableCell[] = [];
    for (let col = 0; col < COLS; col++) {
      const qIdx = row + col * totalRows;
      const eq = questions[qIdx];

      const cellChildren: Paragraph[] = [];
      if (eq) {
        cellChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({ text: `${eq.orderNum}. `, font: KR_FONT, size: PASSAGE_SIZE, bold: true }),
              new TextRun({ text: eq.question.correctAnswer, font: FONT, size: PASSAGE_SIZE, bold: true, color: COLOR.black }),
            ],
          })
        );
      } else {
        cellChildren.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
      }

      cells.push(
        new TableCell({
          borders: {
            top: NONE,
            bottom: row === totalRows - 1 ? bdr(BorderStyle.SINGLE, 8, COLOR.darkGray) : thinBorder,
            left: col === 0 ? headerBorder : thinBorder,
            right: col === COLS - 1 ? headerBorder : thinBorder,
          },
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: cellChildren,
        })
      );
    }
    dataRows.push(new TableRow({ children: cells }));
  }

  result.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: headerCells }), ...dataRows],
    })
  );

  return result;
}

// ---------------------------------------------------------------------------
// Document Builder
// ---------------------------------------------------------------------------

function buildExamDocument(
  title: string,
  questions: ExamQuestionData[],
  includeAnswers: boolean
): Document {
  const allChildren: DocChild[] = [];

  allChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: title,
          font: KR_FONT,
          size: TITLE_SIZE,
          bold: true,
        }),
      ],
    })
  );

  const subtitleRuns: TextRun[] = [
    new TextRun({
      text: `총 ${questions.length}문항`,
      font: KR_FONT,
      size: SUBTITLE_SIZE,
      color: COLOR.gray,
    }),
  ];
  if (includeAnswers) {
    subtitleRuns.push(
      new TextRun({
        text: "  |  정답 및 해설",
        font: KR_FONT,
        size: SUBTITLE_SIZE,
        color: COLOR.darkGray,
        bold: true,
      })
    );
  }
  allChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: subtitleRuns,
    })
  );

  allChildren.push(hrule(COLOR.black, 12, 80, 200));

  for (const eq of questions) {
    allChildren.push(...buildQuestionElements(eq, includeAnswers));
  }

  if (!includeAnswers) {
    allChildren.push(...buildAnswerKeyTable(questions));
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5in clean margins
          },
          column: { space: 480, count: 2 }, // 2 columns, slightly wider gap
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: title,
                    font: KR_FONT,
                    size: 16,
                    color: COLOR.lightGray,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "- ",
                    font: KR_FONT,
                    size: LABEL_SIZE,
                    color: COLOR.lightGray,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: LABEL_SIZE,
                    color: COLOR.lightGray,
                  }),
                  new TextRun({
                    text: " -",
                    font: KR_FONT,
                    size: LABEL_SIZE,
                    color: COLOR.lightGray,
                  }),
                ],
              }),
            ],
          }),
        },
        children: allChildren,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// API Route
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const url = new URL(request.url);
    const includeAnswers = url.searchParams.get("answers") === "true";

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          include: {
            question: {
              include: {
                passage: { select: { title: true, content: true } },
                explanation: {
                  select: {
                    content: true,
                    keyPoints: true,
                    wrongOptionExplanations: true,
                  },
                },
              },
            },
          },
          orderBy: { orderNum: "asc" },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }

    const doc = buildExamDocument(
      exam.title,
      exam.questions as unknown as ExamQuestionData[],
      includeAnswers
    );

    const buffer = await Packer.toBuffer(doc);

    const filename = encodeURIComponent(
      `${exam.title}${includeAnswers ? "_정답포함" : ""}.docx`
    );

    return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    console.error("DOCX export error:", error);
    return NextResponse.json(
      { error: "DOCX 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
