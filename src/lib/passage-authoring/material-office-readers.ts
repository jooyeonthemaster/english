"use client";

// ============================================================================
// 오피스 자료 판독기 — docx / xlsx / hwpx (zip + xml), 브라우저 전용
//
// material-readers.ts 에서 갈라져 나왔다. 그 파일은 "무슨 형식이든 텍스트로"를
// 책임지는 라우터 + PDF·사진(서버 판독을 타는 유일한 경로)에 집중하고, 여기서는
// **네트워크를 전혀 타지 않는** zip+xml 계열만 다룬다. 두 관심사가 한 파일에 있을
// 때 1,100줄이 넘어 읽는 것 자체가 어려웠다.
//
// 세 형식이 한 파일에 있는 이유: 전부 zip 안의 XML 이고 loadZip/parseXml/
// localNameOf 같은 배관을 그대로 공유한다. 나누면 그 배관이 복제된다.
//
// 회귀 방지 계약(material-readers.ts 와 동일):
//   - 던지는 Error 의 message 는 **그대로 사용자에게 보여줄 수 있는 한국어**여야
//     한다. "왜 안 되는지 + 무엇을 하면 되는지"까지 담는다.
//   - 의존성 추가 금지. jszip·DOMParser 만 쓴다.
//   - 결과 문자열의 정규화(CRLF→LF·60,000자 상한)는 호출부(readMaterialFile)가
//     한 곳에서 한다 — 여기서 또 자르면 상한이 두 벌이 된다.
// ============================================================================

import JSZip from "jszip";

// ── docx (zip + xml) ────────────────────────────────────────────────────────

export async function readDocx(file: File): Promise<string> {
  const zip = await loadZip(file, "워드");
  const entry = zip.file("word/document.xml");
  if (!entry) {
    throw new Error(
      "워드 문서에서 본문을 찾지 못했어요. Word 에서 .docx 로 다시 저장해 올려 주세요.",
    );
  }
  const doc = parseXml(await entry.async("string"), "워드");
  const body = doc.getElementsByTagNameNS("*", "body")[0] ?? doc.documentElement;
  const blocks: string[] = [];
  collectDocxBlocks(body, blocks);
  return blocks.join("\n");
}

/**
 * 문단(w:p)은 한 줄, 표(w:tbl)는 행마다 한 줄·셀은 탭. 표를 살리는 이유는 어법
 * 교재·단어 목록이 표로 오는 경우가 많아서다(탭이 남아야 열 구조가 보인다).
 * 셀 안의 중첩 표까지는 따라가지 않는다 — 실사용 빈도 대비 복잡도가 크다.
 */
function collectDocxBlocks(root: Element, out: string[]): void {
  for (const child of Array.from(root.children)) {
    const tag = localNameOf(child);
    if (tag === "p") {
      out.push(docxParagraphText(child));
    } else if (tag === "tbl") {
      for (const row of Array.from(child.children)) {
        if (localNameOf(row) !== "tr") continue;
        const cells = Array.from(row.children)
          .filter((cell) => localNameOf(cell) === "tc")
          .map((cell) =>
            Array.from(cell.children)
              .filter((node) => localNameOf(node) === "p")
              .map(docxParagraphText)
              .join(" ")
              .trim(),
          );
        out.push(cells.join("\t"));
      }
      out.push("");
    } else {
      // w:sdt(콘텐츠 컨트롤) 등 래퍼는 그냥 통과해 내려간다.
      collectDocxBlocks(child, out);
    }
  }
}

function docxParagraphText(paragraph: Element): string {
  let text = "";
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = localNameOf(child);
      if (tag === "t") text += child.textContent ?? "";
      else if (tag === "tab") text += "\t";
      else if (tag === "br" || tag === "cr") text += "\n";
      else walk(child);
    }
  };
  walk(paragraph);
  return text.trim();
}

// ── xlsx (zip + xml) ────────────────────────────────────────────────────────

/**
 * 단어장이 이 경로로 들어온다. **열 순서 보존이 생명**이라 빈 셀도 자리를 채운다
 * (셀 r="C3" 의 열 인덱스를 읽어 앞을 빈 문자열로 메운다). 그래야 "표제어 - 뜻"
 * 구조가 탭 구분으로 살아남아 역할 추정·프롬프트가 목록임을 알아본다.
 */
export async function readXlsx(file: File): Promise<string> {
  const zip = await loadZip(file, "엑셀");
  const sheets = zip
    .file(/^xl\/worksheets\/sheet\d+\.xml$/i)
    .sort((a, b) => naturalCompare(a.name, b.name));
  if (sheets.length === 0) {
    throw new Error(
      "엑셀에서 시트를 찾지 못했어요. Excel 에서 .xlsx 로 다시 저장해 올려 주세요.",
    );
  }

  const shared = await readSharedStrings(zip);
  const names = await readSheetNames(zip);
  const blocks: string[] = [];

  for (const sheet of sheets) {
    const doc = parseXml(await sheet.async("string"), "엑셀");
    const rows: string[] = [];
    for (const row of Array.from(doc.getElementsByTagNameNS("*", "row"))) {
      const cells: string[] = [];
      for (const cell of Array.from(row.getElementsByTagNameNS("*", "c"))) {
        const index = columnIndexOf(cell.getAttribute("r")) ?? cells.length;
        while (cells.length < index) cells.push("");
        cells.push(cellText(cell, shared));
      }
      while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
      if (cells.length > 0) rows.push(cells.join("\t"));
    }
    if (rows.length === 0) continue;
    const title = names.get(sheet.name);
    // 시트가 여럿이면 어느 시트에서 온 줄인지 보여야 선생님이 판단할 수 있다.
    if (sheets.length > 1 || title) blocks.push(`# ${title ?? sheet.name}`);
    blocks.push(rows.join("\n"));
    blocks.push("");
  }
  return blocks.join("\n");
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const entry = zip.file("xl/sharedStrings.xml");
  if (!entry) return [];
  const doc = parseXml(await entry.async("string"), "엑셀");
  return Array.from(doc.getElementsByTagNameNS("*", "si")).map((si) =>
    Array.from(si.getElementsByTagNameNS("*", "t"))
      .map((t) => t.textContent ?? "")
      .join(""),
  );
}

/** 시트 파일 경로 → 사람이 붙인 시트 이름. 부가정보라 실패해도 판독은 계속한다. */
async function readSheetNames(zip: JSZip): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const rels = zip.file("xl/_rels/workbook.xml.rels");
  const book = zip.file("xl/workbook.xml");
  if (!rels || !book) return out;
  try {
    const relsDoc = parseXml(await rels.async("string"), "엑셀");
    const targets = new Map<string, string>();
    for (const rel of Array.from(
      relsDoc.getElementsByTagNameNS("*", "Relationship"),
    )) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) {
        targets.set(id, `xl/${target.replace(/^\/+/, "").replace(/^xl\//, "")}`);
      }
    }
    const bookDoc = parseXml(await book.async("string"), "엑셀");
    for (const sheet of Array.from(
      bookDoc.getElementsByTagNameNS("*", "sheet"),
    )) {
      const rid =
        sheet.getAttribute("r:id") ??
        sheet.getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "id",
        );
      const name = sheet.getAttribute("name");
      const path = rid ? targets.get(rid) : undefined;
      if (name && path) out.set(path, name);
    }
  } catch {
    // 이름을 못 읽어도 본문은 나온다 — 조용히 넘어간다.
  }
  return out;
}

function cellText(cell: Element, shared: string[]): string {
  const type = cell.getAttribute("t") ?? "";
  if (type === "s") {
    const index = Number(firstByLocalName(cell, "v")?.textContent ?? "");
    return Number.isInteger(index) && index >= 0 && index < shared.length
      ? collapseSpaces(shared[index])
      : "";
  }
  if (type === "inlineStr") {
    const inline = firstByLocalName(cell, "is");
    if (!inline) return "";
    return collapseSpaces(
      Array.from(inline.getElementsByTagNameNS("*", "t"))
        .map((t) => t.textContent ?? "")
        .join(""),
    );
  }
  return collapseSpaces(firstByLocalName(cell, "v")?.textContent ?? "");
}

/** "C12" → 2 (0-based). 열 알파벳이 없으면 null(호출자가 순서로 대체). */
function columnIndexOf(ref: string | null): number | null {
  const letters = ref?.match(/^[A-Za-z]+/)?.[0];
  if (!letters) return null;
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

// ── hwpx (zip + xml) ────────────────────────────────────────────────────────

export async function readHwpx(file: File): Promise<string> {
  const zip = await loadZip(file, "한글(hwpx)");
  const sections = zip
    .file(/^Contents\/section\d+\.xml$/i)
    .sort((a, b) => naturalCompare(a.name, b.name));
  if (sections.length === 0) {
    throw new Error(
      "hwpx 안에서 본문을 찾지 못했어요. 한글에서 .hwpx 또는 PDF 로 다시 저장해 올려 주세요.",
    );
  }

  const blocks: string[] = [];
  for (const section of sections) {
    const doc = parseXml(await section.async("string"), "한글(hwpx)");
    // 표 안의 문단은 바깥 문단에 이미 포함돼 나오므로 최상위 문단만 센다(중복 방지).
    const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p")).filter(
      (p) => !hasAncestorLocalName(p, "p"),
    );
    if (paragraphs.length > 0) {
      for (const paragraph of paragraphs) {
        blocks.push(textOfLocalName(paragraph, "t"));
      }
    } else {
      blocks.push(textOfLocalName(doc.documentElement, "t"));
    }
  }
  return blocks.join("\n");
}

// ── zip·xml 공용 ────────────────────────────────────────────────────────────

async function loadZip(file: File, label: string): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(
      `${label} 파일을 열지 못했어요. 파일이 손상되었거나 형식이 다를 수 있어요.`,
    );
  }
}

function parseXml(xml: string, label: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(
      `${label} 파일의 내부 구조를 해석하지 못했어요. 다른 형식(PDF 등)으로 저장해 올려 주세요.`,
    );
  }
  return doc;
}

function localNameOf(element: Element): string {
  return (element.localName || element.tagName || "").split(":").pop() ?? "";
}

function firstByLocalName(parent: Element, name: string): Element | null {
  return parent.getElementsByTagNameNS("*", name)[0] ?? null;
}

function textOfLocalName(root: Element, name: string): string {
  return Array.from(root.getElementsByTagNameNS("*", name))
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
}

function hasAncestorLocalName(element: Element, name: string): boolean {
  let cursor = element.parentElement;
  while (cursor) {
    if (localNameOf(cursor) === name) return true;
    cursor = cursor.parentElement;
  }
  return false;
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
