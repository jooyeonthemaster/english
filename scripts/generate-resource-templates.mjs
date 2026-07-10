/**
 * 무료자료실(/resources) 배포용 Word 템플릿 생성 스크립트.
 *
 * 리서치 실측 공백 3종을 실제 .docx 로 생성해 public/resources/ 에 떨어뜨린다:
 *  1) 영어 시험지 양식(2단 조판)      → smoat-english-exam-template.docx
 *  2) 영어 서술형 채점기준표          → smoat-grading-rubric-template.docx
 *  3) 영어 단어시험지 양식            → smoat-vocab-test-template.docx
 *
 * 실행: node scripts/generate-resource-templates.mjs
 * 폰트는 시험지 관례(맑은 고딕)를 따른다.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

const OUT_DIR = path.resolve("public/resources");
fs.mkdirSync(OUT_DIR, { recursive: true });

const FONT = "맑은 고딕";
const BASE_RUN = { font: FONT, size: 20 }; // 10pt

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 120, line: opts.line },
    children: [
      new TextRun({
        ...BASE_RUN,
        text,
        bold: opts.bold,
        size: opts.size ?? BASE_RUN.size,
        color: opts.color,
      }),
    ],
  });
}

function emptyLines(n) {
  return Array.from({ length: n }, () => p("", { after: 60 }));
}

function cell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shade ? { fill: "F1F5F9" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.CENTER,
        children: [
          new TextRun({ ...BASE_RUN, text, bold: opts.bold, size: opts.size ?? 18 }),
        ],
      }),
    ],
  });
}

const A4 = { width: 11906, height: 16838 };
const MARGIN = { top: 1000, bottom: 1000, left: 1000, right: 1000 };

// ─────────────────────────────────────────────────────────────
// 1) 영어 시험지 양식 (2단)
// ─────────────────────────────────────────────────────────────
function examTemplate() {
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell("2026학년도 ○학기 ○○고사 대비", { width: 60, bold: true, align: AlignmentType.LEFT, size: 20 }),
          cell("학년/반", { width: 12, shade: true, bold: true }),
          cell("", { width: 28 }),
        ],
      }),
      new TableRow({
        children: [
          cell("영어 실전 모의 시험지", { width: 60, bold: true, align: AlignmentType.LEFT, size: 28 }),
          cell("이름", { width: 12, shade: true, bold: true }),
          cell("", { width: 28 }),
        ],
      }),
      new TableRow({
        children: [
          cell("출제 범위:                              문항 수:      개 / 시간:      분", {
            width: 60, align: AlignmentType.LEFT,
          }),
          cell("점수", { width: 12, shade: true, bold: true }),
          cell("", { width: 28 }),
        ],
      }),
    ],
  });

  const question = (no) => [
    p(`${no}. 다음 글을 읽고, 물음에 답하시오.`, { bold: true, after: 80 }),
    p("〔지문을 여기에 붙여넣으세요. 지문은 명조/바탕 계열로 바꾸면 실전 시험지 질감에 더 가깝습니다.〕", { after: 80 }),
    p("① ________________________", { after: 40 }),
    p("② ________________________", { after: 40 }),
    p("③ ________________________", { after: 40 }),
    p("④ ________________________", { after: 40 }),
    p("⑤ ________________________", { after: 240 }),
  ];

  return new Document({
    styles: { default: { document: { run: BASE_RUN } } },
    sections: [
      {
        properties: { page: { size: A4, margin: MARGIN } },
        children: [
          headerTable,
          p("", { after: 160 }),
          p("※ 문항을 붙여넣은 뒤 이 안내 문단은 지우고 사용하세요. 스모트(SMOAT)를 쓰면 이 양식 없이도 문항 선택만으로 같은 규격의 Word 시험지가 자동 조판됩니다. — www.smoat.co.kr", {
            after: 240, color: "64748B", size: 16,
          }),
        ],
      },
      {
        properties: {
          page: { size: A4, margin: MARGIN },
          column: { count: 2, space: 500, separate: true },
          type: "continuous",
        },
        children: [1, 2, 3, 4, 5, 6].flatMap((no) => question(no)),
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// 2) 영어 서술형 채점기준표
// ─────────────────────────────────────────────────────────────
function rubricTemplate() {
  const header = new TableRow({
    children: [
      cell("문항", { width: 8, shade: true, bold: true }),
      cell("평가 요소", { width: 26, shade: true, bold: true }),
      cell("배점", { width: 8, shade: true, bold: true }),
      cell("부분점수 기준", { width: 34, shade: true, bold: true }),
      cell("감점 기준", { width: 24, shade: true, bold: true }),
    ],
  });

  const example = new TableRow({
    children: [
      cell("예시", { bold: true }),
      cell("조건 충족(단어 수·필수 어휘) / 내용 일치 / 어법 정확성", { align: AlignmentType.LEFT }),
      cell("6"),
      cell("내용 3점: 핵심 의미 전달 시 / 조건 2점: 조건별 1점 / 어법 1점: 치명 오류 없을 때", { align: AlignmentType.LEFT }),
      cell("철자 오류 1개당 -0.5 (최대 -1) / 시제 불일치 -1", { align: AlignmentType.LEFT }),
    ],
  });

  const blank = () =>
    new TableRow({
      children: [cell(""), cell(""), cell(""), cell(""), cell("")],
    });

  return new Document({
    styles: { default: { document: { run: BASE_RUN } } },
    sections: [
      {
        properties: { page: { size: A4, margin: MARGIN } },
        children: [
          p("영어 서술형 채점기준표", { bold: true, size: 32, after: 80 }),
          p("시험명:                     학년/반:              출제자:              채점일:", { after: 200 }),
          p("작성 원칙: ① 평가 요소는 내용·조건·어법 3축으로 나눕니다 ② 부분점수는 요소별로 독립 부여합니다 ③ 동치 답안(같은 의미의 다른 표현) 인정 범위를 채점 전에 합의합니다.", { after: 200, size: 18, color: "334155" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [header, example, ...Array.from({ length: 8 }, blank)],
          }),
          p("", { after: 160 }),
          p("※ 스모트(SMOAT)는 서술형 문항 생성 시 모범답안·동치답·채점 포인트를 함께 만들어 이 표를 채우는 시간을 줄여 줍니다. — www.smoat.co.kr", { size: 16, color: "64748B" }),
        ],
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// 3) 영어 단어시험지 양식
// ─────────────────────────────────────────────────────────────
function vocabTemplate() {
  const head = new TableRow({
    children: [
      cell("No.", { width: 8, shade: true, bold: true }),
      cell("영어", { width: 32, shade: true, bold: true }),
      cell("뜻", { width: 26, shade: true, bold: true }),
      cell("No.", { width: 8, shade: true, bold: true }),
      cell("영어", { width: 26, shade: true, bold: true }),
    ],
  });

  // 20행 × (좌 1~20 / 우 21~40)
  const rows = Array.from({ length: 20 }, (_, i) => {
    return new TableRow({
      children: [
        cell(String(i + 1)),
        cell(""),
        cell(""),
        cell(String(i + 21)),
        cell(""),
      ],
    });
  });

  return new Document({
    styles: { default: { document: { run: BASE_RUN } } },
    sections: [
      {
        properties: { page: { size: A4, margin: MARGIN } },
        children: [
          p("영어 단어 시험", { bold: true, size: 32, after: 80 }),
          p("범위:                          이름:                 점수:        / 40", { after: 200 }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...rows] }),
          p("", { after: 160 }),
          p("※ 좌측 20문항은 영어→뜻, 우측 20문항은 뜻→영어(또는 철자 시험)로 활용하세요. 지문 연동 단어장·시험지가 필요하면 스모트(SMOAT)의 지문 분석을 활용해 보세요. — www.smoat.co.kr", { size: 16, color: "64748B" }),
        ],
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────
const targets = [
  ["smoat-english-exam-template.docx", examTemplate()],
  ["smoat-grading-rubric-template.docx", rubricTemplate()],
  ["smoat-vocab-test-template.docx", vocabTemplate()],
];

for (const [name, doc] of targets) {
  const buf = await Packer.toBuffer(doc);
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, buf);
  console.log(`✓ ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
}
console.log("done");
