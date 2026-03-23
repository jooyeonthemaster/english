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
  NumberFormat,
  SectionType,
  HeadingLevel,
  TabStopPosition,
  TabStopType,
  UnderlineType,
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

// ---------------------------------------------------------------------------
// Text parsing helpers
// ---------------------------------------------------------------------------

/** Parse __word__ markers and _____ blanks into TextRun arrays */
function parseFormattedText(
  text: string,
  baseStyle: Partial<{ bold: boolean; size: number; font: string }> = {}
): TextRun[] {
  const regex = /__([^_]+)__|_{3,}/g;
  const runs: TextRun[] = [];
  let lastIndex = 0;
  let match;

  const font = baseStyle.font || "Times New Roman";
  const size = baseStyle.size || 20; // half-points (20 = 10pt)

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: text.slice(lastIndex, match.index),
          font,
          size,
          bold: baseStyle.bold,
        })
      );
    }

    if (match[1]) {
      // __word__ → underlined bold
      runs.push(
        new TextRun({
          text: match[1],
          font,
          size,
          bold: true,
          underline: { type: UnderlineType.SINGLE },
        })
      );
    } else {
      // _____ → blank line
      runs.push(
        new TextRun({
          text: "                    ",
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
      })
    );
  }

  return runs;
}

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

// ---------------------------------------------------------------------------
// Build question paragraphs
// ---------------------------------------------------------------------------

function buildQuestionParagraphs(
  eq: ExamQuestionData,
  includeAnswer: boolean
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const q = eq.question;
  const options = safeParseJSON<ParsedOption[]>(q.options, []);
  const FONT = "Times New Roman";
  const KR_FONT = "맑은 고딕";
  const TEXT_SIZE = 20; // 10pt
  const SMALL_SIZE = 18; // 9pt

  // --- Question number + direction ---
  const questionLines = q.questionText.split("\n").filter((l) => l.trim());

  // First line: "1. 다음 글의 밑줄 친..."
  if (questionLines.length > 0) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        children: [
          new TextRun({
            text: `${eq.orderNum}. `,
            font: FONT,
            size: TEXT_SIZE,
            bold: true,
          }),
          ...parseFormattedText(questionLines[0], {
            font: KR_FONT,
            size: TEXT_SIZE,
            bold: true,
          }),
          // Points indicator
          ...(eq.points > 1
            ? [
                new TextRun({
                  text: ` [${eq.points}점]`,
                  font: KR_FONT,
                  size: SMALL_SIZE,
                  bold: false,
                  color: "666666",
                }),
              ]
            : []),
        ],
      })
    );
  }

  // Remaining lines of question text (e.g., passage embedded in question)
  for (let i = 1; i < questionLines.length; i++) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: 280 },
        children: parseFormattedText(questionLines[i], {
          font: FONT,
          size: SMALL_SIZE,
        }),
      })
    );
  }

  // --- Passage (if exists and different from question text) ---
  if (q.passage) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 80, after: 40 },
        indent: { left: 280, right: 280 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        },
        children: parseFormattedText(q.passage.content, {
          font: FONT,
          size: SMALL_SIZE,
        }),
      })
    );
  }

  // --- Options (MC) ---
  if (options.length > 0) {
    // Determine layout: if options are short, use 2-column; otherwise 1 per line
    const maxLen = Math.max(...options.map((o) => o.text.length));
    const useColumns = maxLen < 30 && options.length === 5;

    if (useColumns) {
      // Two per line (like real exam papers)
      for (let i = 0; i < options.length; i += 2) {
        const children: TextRun[] = [];
        // First option
        children.push(
          new TextRun({
            text: `${options[i].label} `,
            font: FONT,
            size: TEXT_SIZE,
          })
        );
        children.push(
          ...parseFormattedText(options[i].text, { font: FONT, size: TEXT_SIZE })
        );

        // Second option (if exists)
        if (i + 1 < options.length) {
          children.push(
            new TextRun({
              text: "\t",
              font: FONT,
              size: TEXT_SIZE,
            })
          );
          children.push(
            new TextRun({
              text: `${options[i + 1].label} `,
              font: FONT,
              size: TEXT_SIZE,
            })
          );
          children.push(
            ...parseFormattedText(options[i + 1].text, {
              font: FONT,
              size: TEXT_SIZE,
            })
          );
        }

        paragraphs.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 280 },
            tabStops: [
              {
                type: TabStopType.LEFT,
                position: TabStopPosition.MAX / 2,
              },
            ],
            children,
          })
        );
      }
    } else {
      // One per line (long options)
      for (const opt of options) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 280 },
            children: [
              new TextRun({
                text: `${opt.label} `,
                font: FONT,
                size: TEXT_SIZE,
              }),
              ...parseFormattedText(opt.text, { font: FONT, size: TEXT_SIZE }),
            ],
          })
        );
      }
    }
  }

  // --- Answer + Explanation (for answer key version) ---
  if (includeAnswer) {
    // Correct answer box
    paragraphs.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        indent: { left: 280 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "2563EB" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "2563EB" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "2563EB" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "2563EB" },
        },
        shading: { fill: "EFF6FF" },
        children: [
          new TextRun({
            text: "  정답  ",
            font: KR_FONT,
            size: SMALL_SIZE,
            bold: true,
            color: "1D4ED8",
          }),
          new TextRun({
            text: q.correctAnswer,
            font: FONT,
            size: TEXT_SIZE,
            bold: true,
            color: "1D4ED8",
          }),
        ],
      })
    );

    // Explanation content
    if (q.explanation) {
      // Main explanation
      if (q.explanation.content) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 80, after: 20 },
            indent: { left: 280 },
            children: [
              new TextRun({
                text: "▶ 해설",
                font: KR_FONT,
                size: SMALL_SIZE,
                bold: true,
                color: "92400E",
              }),
            ],
          })
        );

        // Split explanation into paragraphs
        const explanationLines = q.explanation.content
          .split("\n")
          .filter((l) => l.trim());
        for (const line of explanationLines) {
          paragraphs.push(
            new Paragraph({
              spacing: { after: 30 },
              indent: { left: 420 },
              children: [
                new TextRun({
                  text: line,
                  font: KR_FONT,
                  size: SMALL_SIZE,
                  color: "44403C",
                }),
              ],
            })
          );
        }
      }

      // Key points
      const keyPoints = safeParseJSON<string[]>(
        q.explanation.keyPoints,
        []
      );
      if (keyPoints.length > 0) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 80, after: 20 },
            indent: { left: 280 },
            children: [
              new TextRun({
                text: "▶ 핵심 포인트",
                font: KR_FONT,
                size: SMALL_SIZE,
                bold: true,
                color: "1E40AF",
              }),
            ],
          })
        );

        for (const kp of keyPoints) {
          paragraphs.push(
            new Paragraph({
              spacing: { after: 20 },
              indent: { left: 420 },
              children: [
                new TextRun({
                  text: "• ",
                  font: KR_FONT,
                  size: SMALL_SIZE,
                  color: "3B82F6",
                }),
                new TextRun({
                  text: kp,
                  font: KR_FONT,
                  size: SMALL_SIZE,
                  color: "1E3A5F",
                }),
              ],
            })
          );
        }
      }

      // Wrong option explanations (MC only)
      const wrongExplanations = safeParseJSON<Record<string, string>>(
        q.explanation.wrongOptionExplanations,
        {}
      );
      if (
        Object.keys(wrongExplanations).length > 0 &&
        options.length > 0
      ) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 80, after: 20 },
            indent: { left: 280 },
            children: [
              new TextRun({
                text: "▶ 오답 분석",
                font: KR_FONT,
                size: SMALL_SIZE,
                bold: true,
                color: "9A3412",
              }),
            ],
          })
        );

        for (const [label, explanation] of Object.entries(
          wrongExplanations
        )) {
          paragraphs.push(
            new Paragraph({
              spacing: { after: 20 },
              indent: { left: 420 },
              children: [
                new TextRun({
                  text: `${label}  `,
                  font: FONT,
                  size: SMALL_SIZE,
                  bold: true,
                  color: "DC2626",
                }),
                new TextRun({
                  text: explanation,
                  font: KR_FONT,
                  size: SMALL_SIZE,
                  color: "57534E",
                }),
              ],
            })
          );
        }
      }
    }

    // Separator between questions
    paragraphs.push(
      new Paragraph({
        spacing: { before: 80, after: 40 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "D6D3D1" },
        },
        children: [],
      })
    );
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Main document builder
// ---------------------------------------------------------------------------

function buildExamDocument(
  title: string,
  questions: ExamQuestionData[],
  includeAnswers: boolean
): Document {
  const KR_FONT = "맑은 고딕";

  // Split questions into left/right columns for 2-column layout
  const allParagraphs: Paragraph[] = [];

  // Title
  allParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: title,
          font: KR_FONT,
          size: 32, // 16pt
          bold: true,
        }),
      ],
    })
  );

  // Subtitle line
  allParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `총 ${questions.length}문항`,
          font: KR_FONT,
          size: 20,
          color: "666666",
        }),
        ...(includeAnswers
          ? [
              new TextRun({
                text: "  |  정답 및 해설 포함",
                font: KR_FONT,
                size: 20,
                color: "2563EB",
                bold: true,
              }),
            ]
          : []),
      ],
    })
  );

  // Separator line
  allParagraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "333333" },
      },
      children: [],
    })
  );

  // Questions
  for (const eq of questions) {
    allParagraphs.push(...buildQuestionParagraphs(eq, includeAnswers));
  }

  // Answer key table at the end (if not inline)
  if (!includeAnswers) {
    allParagraphs.push(
      new Paragraph({
        spacing: { before: 400 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 2, color: "333333" },
        },
        children: [],
      })
    );

    allParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
        children: [
          new TextRun({
            text: "정답표",
            font: KR_FONT,
            size: 24,
            bold: true,
          }),
        ],
      })
    );

    // Build answer key table
    const rows: TableRow[] = [];
    const COLS = 5;

    // Header row
    rows.push(
      new TableRow({
        children: Array.from({ length: COLS * 2 }, (_, i) =>
          new TableCell({
            width: { size: i % 2 === 0 ? 800 : 1200, type: WidthType.DXA },
            shading: { fill: "F0F0F0" },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: i % 2 === 0 ? "번호" : "정답",
                    font: KR_FONT,
                    size: 16,
                    bold: true,
                  }),
                ],
              }),
            ],
          })
        ),
      })
    );

    // Data rows
    const totalRows = Math.ceil(questions.length / COLS);
    for (let row = 0; row < totalRows; row++) {
      const cells: TableCell[] = [];
      for (let col = 0; col < COLS; col++) {
        const qIdx = row + col * totalRows;
        const eq = questions[qIdx];
        // Number cell
        cells.push(
          new TableCell({
            width: { size: 800, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: eq ? String(eq.orderNum) : "",
                    font: "Times New Roman",
                    size: 18,
                    bold: true,
                  }),
                ],
              }),
            ],
          })
        );
        // Answer cell
        cells.push(
          new TableCell({
            width: { size: 1200, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: eq ? eq.question.correctAnswer : "",
                    font: "Times New Roman",
                    size: 18,
                  }),
                ],
              }),
            ],
          })
        );
      }
      rows.push(new TableRow({ children: cells }));
    }

    allParagraphs.push(
      new Paragraph({
        children: [],
      })
    );

    allParagraphs.push(
      new Paragraph({ children: [] }) // spacer before table
    );

    // We'll add the table as a separate element — docx lib supports tables in sections
    // For simplicity, embed answer info as paragraphs instead
    // Actually let's build a proper grid
    const answerLines: Paragraph[] = [];
    for (let i = 0; i < questions.length; i++) {
      const eq = questions[i];
      answerLines.push(
        new Paragraph({
          spacing: { after: 20 },
          tabStops: [
            { type: TabStopType.LEFT, position: 1200 },
          ],
          children: [
            new TextRun({
              text: `${eq.orderNum}.`,
              font: "Times New Roman",
              size: 18,
              bold: true,
            }),
            new TextRun({
              text: `\t${eq.question.correctAnswer}`,
              font: "Times New Roman",
              size: 18,
            }),
          ],
        })
      );
    }

    // Replace the table approach with a clean 5-column layout using tabs
    allParagraphs.length = allParagraphs.length - 1; // remove spacer

    for (let row = 0; row < totalRows; row++) {
      const children: TextRun[] = [];
      for (let col = 0; col < COLS; col++) {
        const qIdx = row + col * totalRows;
        const eq = questions[qIdx];
        if (!eq) continue;
        if (col > 0) {
          children.push(new TextRun({ text: "\t", font: "Times New Roman", size: 18 }));
        }
        children.push(
          new TextRun({
            text: `${eq.orderNum}. `,
            font: "Times New Roman",
            size: 18,
            bold: true,
          })
        );
        children.push(
          new TextRun({
            text: eq.question.correctAnswer,
            font: "Times New Roman",
            size: 18,
          })
        );
      }
      allParagraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          tabStops: [
            { type: TabStopType.LEFT, position: 2000 },
            { type: TabStopType.LEFT, position: 4000 },
            { type: TabStopType.LEFT, position: 6000 },
            { type: TabStopType.LEFT, position: 8000 },
          ],
          children,
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: {
              top: 1000,
              bottom: 1000,
              left: 1200,
              right: 1200,
            },
          },
          column: {
            space: 400,
            count: 2,
          },
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
                    size: 14,
                    color: "999999",
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
                    children: [PageNumber.CURRENT],
                    font: "Times New Roman",
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        children: allParagraphs,
      },
    ],
  });

  return doc;
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
