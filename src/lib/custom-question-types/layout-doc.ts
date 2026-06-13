import { z } from "zod";

import {
  type BlankRenderStyle,
  type ChoiceItemPattern,
  type ChoiceLayout,
  type FormatSpec,
  type MarkerStyle,
  markerLabel,
  MARKER_STYLES,
  CHOICE_LAYOUTS,
  CHOICE_ITEM_PATTERNS,
  BOX_KINDS,
} from "./format-spec";

// ============================================================================
// LayoutDoc — 생성된 커스텀 문항의 "구조화 문서" 모델
// ============================================================================
// 생성기가 LayoutDoc 을 emit 하면:
//  1) structuredData.layout 으로 저장 → 웹 QuestionCard 가 CustomLayoutRenderer 로 고충실도 렌더
//  2) composeQuestionTextFromLayoutDoc() 으로 questionText(마커 미니 DSL)를 결정적으로 조립
//     → 시험지 미리보기·DOCX·HWPX 파이프라인(전부 questionText 파서)에 무수정으로 흐른다.
// 스튜디오 라이브 미리보기는 sourceLayoutDoc(원본 예시)을 FormatSpec 으로 투영해 그린다.

export const LAYOUT_DOC_VERSION = 1;

export const LAYOUT_BLOCK_KINDS = [
  "TEXT", // 일반 본문(지문/문장). 인라인 DSL(__밑줄__, _____, ①) 허용.
  "BOX", // 일반 박스(지문 박스/안내문 박스)
  "GIVEN", // 주어진 문장 박스
  "CONDITIONS", // 조건 박스(번호 목록)
  "EXAMPLE", // <보기> 박스
  "WORD_BANK", // 어휘 상자
  "SUMMARY", // 요약문
  "LABELED_PARAS", // (A)(B)(C) 분할 단락
  "TABLE", // 표 (headers + rows)
  "ANSWER_FORM", // 서술형 답 작성란(라벨 + 빈칸 슬롯)
  "NOTE", // 참고/안내 텍스트
] as const;
export type LayoutBlockKind = (typeof LAYOUT_BLOCK_KINDS)[number];

const clipText = (max: number) => z.string().max(max).catch("").default("");

export const layoutBlockSchema = z.object({
  kind: z.enum(LAYOUT_BLOCK_KINDS).catch("TEXT").default("TEXT"),
  // 박스 라벨/표 제목(예: "조건", "보기", "Food Truck Festival")
  label: clipText(120),
  text: clipText(12000),
  // 목록형 블록(CONDITIONS/EXAMPLE/WORD_BANK/LABELED_PARAS/ANSWER_FORM)의 항목
  items: z
    .array(z.object({ label: clipText(40), text: clipText(2000) }))
    .max(30)
    .catch([])
    .default([]),
  tableHeaders: z.array(clipText(120)).max(8).catch([]).default([]),
  tableRows: z
    .array(z.array(clipText(800)).max(8).catch([]))
    .max(30)
    .catch([])
    .default([]),
});
export type LayoutBlock = z.infer<typeof layoutBlockSchema>;

export const layoutChoiceItemSchema = z.object({
  label: clipText(40),
  text: clipText(2000),
  // PAIR/TRIPLE/TABLE_ROW 일 때 칸별 셀(있으면 text 보다 우선)
  cells: z.array(clipText(800)).max(8).catch([]).default([]),
});
export type LayoutChoiceItem = z.infer<typeof layoutChoiceItemSchema>;

export const layoutChoicesSchema = z
  .object({
    markerStyle: z.enum(MARKER_STYLES).catch("CIRCLED_NUM").default("CIRCLED_NUM"),
    layout: z.enum(CHOICE_LAYOUTS).catch("VERTICAL").default("VERTICAL"),
    itemPattern: z.enum(CHOICE_ITEM_PATTERNS).catch("TEXT").default("TEXT"),
    pairSeparator: clipText(8),
    columnHeaders: z.array(clipText(120)).max(8).catch([]).default([]),
    items: z.array(layoutChoiceItemSchema).max(20).catch([]).default([]),
  })
  .nullable()
  .catch(null);
export type LayoutChoices = NonNullable<z.infer<typeof layoutChoicesSchema>>;

export const layoutDocSchema = z.object({
  version: z.number().int().catch(LAYOUT_DOC_VERSION).default(LAYOUT_DOC_VERSION),
  direction: clipText(2000),
  blocks: z.array(layoutBlockSchema).max(16).catch([]).default([]),
  choices: layoutChoicesSchema.default(null),
  // 서술형 답 작성 괘선 줄 수(시험지 answerSpaceLines 로 전달). 0 = 없음.
  answerLineCount: z.number().int().min(0).max(12).catch(0).default(0),
});
export type LayoutDoc = z.infer<typeof layoutDocSchema>;

export function parseLayoutDoc(value: unknown): LayoutDoc {
  return layoutDocSchema.parse(value ?? {});
}

/** structuredData 에서 LayoutDoc 을 안전 추출(없으면 null). */
export function readLayoutDocFromStructuredData(structuredData: unknown): LayoutDoc | null {
  if (!structuredData || typeof structuredData !== "object") return null;
  const layout = (structuredData as Record<string, unknown>).layout;
  if (!layout || typeof layout !== "object") return null;
  try {
    return parseLayoutDoc(layout);
  } catch {
    return null;
  }
}

// ───────────────────────── 마커 라벨 정규화(클라이언트 공용) ─────────────────────────
// ①↔1, ⓐ↔a, "(C)." 등 장식/구두점 드리프트를 흡수해 정답-선지 라벨 비교 오탐을 막는다.
const CIRCLED_NUM_CHARS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

export function normalizeMarkerToken(value: string): string {
  const t = (value ?? "").trim();
  const ci = CIRCLED_NUM_CHARS.indexOf(t);
  if (ci >= 0) return String(ci + 1);
  return t
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[^a-z0-9가-힣ㄱ-ㆎ]+/, "")
    .replace(/[^a-z0-9가-힣ㄱ-ㆎ]+$/, "");
}

/** correctAnswer/correctAnswers 류 문자열에서 정답 라벨 집합을 정규화 수집. */
export function collectAnswerMarkerTokens(values: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  const addToken = (raw: string) => {
    const circled = [...raw].filter((ch) => CIRCLED_NUM_CHARS.includes(ch));
    if (circled.length > 1) {
      for (const ch of circled) {
        const n = normalizeMarkerToken(ch);
        if (n) set.add(n);
      }
      return;
    }
    const n = normalizeMarkerToken(raw);
    if (n) set.add(n);
  };
  for (const value of values) {
    if (!value || !value.trim()) continue;
    for (const part of value.split(/[,、]+/)) {
      if (part.trim()) addToken(part);
    }
  }
  return set;
}

// ───────────────────────── 선지 셀 → 표시 텍스트 ─────────────────────────

const DEFAULT_PAIR_SEPARATOR = " — ";

/** PAIR/TRIPLE/TABLE_ROW 셀을 한 줄 텍스트로 합친다(평탄화 옵션/DSL 용). */
export function choiceItemDisplayText(
  item: LayoutChoiceItem,
  pattern: ChoiceItemPattern,
  pairSeparator: string,
): string {
  const cells = item.cells.map((c) => c.trim()).filter(Boolean);
  if (cells.length >= 2 && (pattern === "PAIR" || pattern === "TRIPLE" || pattern === "TABLE_ROW")) {
    const sep = pairSeparator.trim() ? ` ${pairSeparator.trim()} ` : DEFAULT_PAIR_SEPARATOR;
    return cells.join(sep);
  }
  return item.text.trim() || cells.join(DEFAULT_PAIR_SEPARATOR);
}

/** LayoutChoices → 저장용 평탄 옵션 [{label,text}] (DB options 컬럼·폴백 렌더·시험지 옵션 리스트용). */
export function flattenLayoutChoices(choices: LayoutChoices): Array<{ label: string; text: string }> {
  return choices.items.map((item, i) => ({
    label: item.label.trim() || markerLabel(choices.markerStyle, i),
    text: choiceItemDisplayText(item, choices.itemPattern, choices.pairSeparator),
  }));
}

// ───────────────────────── questionText DSL 조립 ─────────────────────────
// 시험지/DOCX/HWPX 파서가 아는 문법만 사용한다:
//  - 첫 문단 = 발문(stem) / 문단 구분 = 빈 줄
//  - [주어진 문장] / [조건] / [요약문] 브래킷 라벨 (parseQuestionSections MARKER_MAP)
//  - __밑줄__, _____(빈칸), ①~㊿ 마커, (A)(B)(C) 단락 라벨
//  - 마커로 시작하는 줄은 normalizeQuestionText 의 hard-break 보존 대상

function composeBlockText(block: LayoutBlock): string {
  const lines: string[] = [];
  switch (block.kind) {
    case "GIVEN": {
      const body = block.text.trim() || block.items.map((i) => i.text).join(" ");
      return body ? `[주어진 문장] ${body}` : "";
    }
    case "CONDITIONS": {
      const items = block.items.length
        ? block.items
        : block.text
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((text) => ({ label: "", text }));
      if (items.length === 0) return "";
      lines.push("[조건]");
      items.forEach((item, i) => {
        lines.push(`${item.label.trim() || `${i + 1}.`} ${item.text.trim()}`.trim());
      });
      return lines.join("\n");
    }
    case "SUMMARY": {
      const body = block.text.trim();
      return body ? `[요약문] ${body}` : "";
    }
    case "LABELED_PARAS": {
      const paras = block.items
        .map((item, i) => {
          const label = item.label.trim() || markerLabel("PAREN_ALPHA_UPPER", i);
          return `${label} ${item.text.trim()}`.trim();
        })
        .filter(Boolean);
      return paras.join("\n\n");
    }
    case "TABLE": {
      if (block.label.trim()) lines.push(`〈${block.label.trim()}〉`);
      if (block.tableHeaders.length > 0) {
        lines.push(block.tableHeaders.map((h) => h.trim()).filter(Boolean).join("  |  "));
      }
      for (const row of block.tableRows) {
        const cells = row.map((c) => c.trim()).filter(Boolean);
        if (cells.length) lines.push(cells.join("  |  "));
      }
      return lines.join("\n");
    }
    case "EXAMPLE":
    case "WORD_BANK": {
      const label = block.label.trim() || (block.kind === "EXAMPLE" ? "보기" : "어휘");
      lines.push(`〈${label}〉`);
      if (block.text.trim()) lines.push(block.text.trim());
      if (block.items.length > 0) {
        // 단어 은행류는 한 줄 나열, 항목 라벨이 있으면 라벨 포함 줄바꿈 나열.
        const hasLabels = block.items.some((i) => i.label.trim());
        if (hasLabels) {
          block.items.forEach((item, i) => {
            lines.push(`${item.label.trim() || `${i + 1}.`} ${item.text.trim()}`.trim());
          });
        } else {
          lines.push(block.items.map((i) => i.text.trim()).filter(Boolean).join(" / "));
        }
      }
      return lines.join("\n");
    }
    case "ANSWER_FORM": {
      const items = block.items.length ? block.items : [{ label: "", text: "" }];
      items.forEach((item, i) => {
        const label = item.label.trim() || (items.length > 1 ? markerLabel("PAREN_ALPHA_UPPER", i) : "답:");
        lines.push(`${label} ____________________`.trim());
      });
      return lines.join("\n");
    }
    case "BOX":
    case "NOTE":
    case "TEXT":
    default: {
      const parts: string[] = [];
      if (block.label.trim() && block.kind !== "TEXT") parts.push(`〈${block.label.trim()}〉`);
      if (block.text.trim()) parts.push(block.text.trim());
      if (block.items.length > 0) {
        parts.push(
          block.items
            .map((item, i) => `${item.label.trim() || markerLabel("CIRCLED_NUM", i)} ${item.text.trim()}`.trim())
            .join("\n"),
        );
      }
      return parts.join("\n");
    }
  }
}

/**
 * LayoutDoc → questionText (마커 미니 DSL 평문).
 * 시험지·DOCX·HWPX 는 이 문자열을 파싱해 렌더하므로, 결정적·보수적으로 조립한다.
 * 선지는 포함하지 않는다(options 컬럼이 별도 담당).
 */
export function composeQuestionTextFromLayoutDoc(doc: LayoutDoc): string {
  const parts: string[] = [];
  if (doc.direction.trim()) parts.push(doc.direction.trim());
  for (const block of doc.blocks) {
    const text = composeBlockText(block);
    if (text.trim()) parts.push(text);
  }
  return parts.join("\n\n");
}

// ───────────────────────── 스튜디오 라이브 투영 ─────────────────────────
// FormatSpec 의 **모든** 컨트롤을 결정적으로 미리보기 LayoutDoc 에 반영한다(LLM 없음).
// 원칙: 구조는 항상 스펙과 1:1 일치(선지 수/마커/배치/빈칸/밑줄/단락/박스/답란/박스테두리/발문…),
// 텍스트는 원본 sourceLayout 에서 끌어오되 없으면 자리표시. → 컨트롤을 만지면 무조건 화면이 바뀐다.

const PLACEHOLDER_CHOICE_TEXT = "(새 선지 — 생성 시 AI가 채움)";
const PLACEHOLDER_PASSAGE =
  "이곳에 자료(지문)가 들어갑니다. 컨트롤을 조절하면 빈칸·밑줄·번호 등 형식이 이 미리보기에 즉시 반영됩니다. 실제 내용은 생성 시 AI가 채웁니다.";
const PLACEHOLDER_DIRECTION = "(발문 — 생성 시 AI가 작성)";
const CIRCLED_MARKER_RANGE = "\\u2460-\\u2473\\u24D0-\\u24E9\\u3251-\\u325F\\u32B1-\\u32BF\\u3220-\\u3229\\u326E-\\u327B";
// 본문 앞에 붙는 마커 라벨 1개: ⓐ / (a) / 1. / 가. 등.
const LEADING_MARKER = `(?:[${CIRCLED_MARKER_RANGE}]|\\([A-Za-z0-9]\\)|[A-Za-z0-9]\\.|[가-힣]\\.)`;

/** 본문에서 밑줄 마커(라벨 포함)를 벗겨 단어만 남긴다. */
function stripUnderlines(text: string): string {
  return text.replace(new RegExp(`(?:${LEADING_MARKER}\\s)?__([^_]+)__`, "g"), "$1");
}

/** 본문에서 빈칸 토큰(라벨 포함)을 벗겨 공백으로. */
function stripBlanks(text: string): string {
  return text
    .replace(new RegExp(`(?:${LEADING_MARKER}\\s)?(?:_{3,}|□{2,}|\\(\\s{4,}\\))`, "g"), " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** 본문을 단어 단위로 — N개 지점에 균등하게 변형을 적용하기 위함. */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/); // 공백도 보존(홀수 인덱스=공백)
}

/** word 인덱스(공백 제외) 기준으로 균등한 N개 위치를 고른다. */
function evenWordPositions(parts: string[], count: number): number[] {
  const wordIdx: number[] = [];
  parts.forEach((p, i) => {
    if (p.trim() && /[A-Za-z가-힣]/.test(p)) wordIdx.push(i);
  });
  if (wordIdx.length === 0 || count <= 0) return [];
  const picks: number[] = [];
  const step = wordIdx.length / (count + 1);
  for (let n = 1; n <= count; n += 1) {
    const idx = wordIdx[Math.min(wordIdx.length - 1, Math.floor(step * n))];
    if (idx != null && !picks.includes(idx)) picks.push(idx);
  }
  // 중복으로 부족하면 앞에서 채움.
  for (const idx of wordIdx) {
    if (picks.length >= count) break;
    if (!picks.includes(idx)) picks.push(idx);
  }
  return picks.sort((a, b) => a - b);
}

function blankRenderToken(style: BlankRenderStyle): string {
  switch (style) {
    case "PAREN":
      return "(            )";
    case "BOX":
      return "□□□□";
    case "UNDERSCORES":
    case "LABELED_UNDERSCORES":
    default:
      return "_____";
  }
}

/**
 * 라벨 밑줄 N개를 본문에 반영(스펙: underlineMarks).
 * 원본에 이미 N개 밑줄이 있으면 **그 단어를 보존**하고 라벨만 다시 매긴다(원본 충실).
 * 개수가 다르면 단어를 벗겨 N개 위치에 새로 주입한다.
 */
function applyUnderlineMarks(text: string, count: number, labelStyle: MarkerStyle): string {
  const existing = text.match(/__[^_]+__/g)?.length ?? 0;
  const labelOf = (n: number) => (labelStyle !== "NONE" ? `${markerLabel(labelStyle, n)} ` : "");

  if (count > 0 && existing === count) {
    let n = 0;
    return text.replace(new RegExp(`(?:${LEADING_MARKER}\\s)?__([^_]+)__`, "g"), (_m, word) => {
      const out = `${labelOf(n)}__${word}__`;
      n += 1;
      return out;
    });
  }

  const clean = stripUnderlines(text);
  if (count <= 0) return clean;
  const parts = splitWords(clean);
  const positions = evenWordPositions(parts, count);
  positions.forEach((pos, n) => {
    const word = parts[pos].replace(/[.,!?;:]+$/, "");
    const trailing = parts[pos].slice(word.length);
    parts[pos] = `${labelOf(n)}__${word}__${trailing}`;
  });
  return parts.join("");
}

/**
 * 빈칸 N개를 본문에 반영(스펙: blanks).
 * 원본 빈칸 수가 같으면 라벨/표기만 갱신, 다르면 N개 위치에 새로 주입.
 */
function applyBlanks(
  text: string,
  count: number,
  renderStyle: BlankRenderStyle,
  labelStyle: MarkerStyle,
): string {
  const token = blankRenderToken(renderStyle);
  const labeled = renderStyle === "LABELED_UNDERSCORES" || labelStyle !== "NONE";
  const labelOf = (n: number) =>
    labeled ? `${markerLabel(labelStyle !== "NONE" ? labelStyle : "PAREN_ALPHA_UPPER", n)} ` : "";

  const clean = stripBlanks(text);
  if (count <= 0) return clean;
  const parts = splitWords(clean);
  const positions = evenWordPositions(parts, count);
  positions.forEach((pos, n) => {
    const trailing = parts[pos].match(/[.,!?;:]+$/)?.[0] ?? "";
    parts[pos] = `${labelOf(n)}${token}${trailing}`;
  });
  return parts.join("");
}

/** 본문 문장 앞에 번호 마커 주입(스펙: numberedSentences). */
function injectSentenceNumbers(text: string, style: MarkerStyle): string {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g);
  if (!sentences || sentences.length === 0) return text;
  return sentences
    .map((sent, i) => `${markerLabel(style, i)} ${sent.trim()}`.trim())
    .join(" ");
}

function projectChoices(source: LayoutChoices | null, format: FormatSpec): LayoutChoices | null {
  // 생성기(generator-structured)와 동일 게이트: 서술형이면 선지 없음(choices.present 와 무관).
  if (format.answer.shape === "SHORT_ANSWER") return null;
  if (!format.choices.present || format.choices.count <= 0) return null;
  const markerStyle = format.choices.markerStyle as MarkerStyle;
  const layout = format.choices.layout as ChoiceLayout;
  const itemPattern = format.choices.itemPattern as ChoiceItemPattern;
  const cellCount =
    itemPattern === "PAIR" ? 2 : itemPattern === "TRIPLE" ? 3 : itemPattern === "TABLE_ROW" ? Math.max(format.choices.columnHeaders.length, 2) : 0;
  const baseItems = source?.items ?? [];
  const items: LayoutChoiceItem[] = Array.from({ length: format.choices.count }, (_, i) => {
    const base = baseItems[i];
    if (cellCount > 0) {
      const baseCells = base?.cells?.length
        ? base.cells
        : base?.text
          ? [base.text]
          : [];
      const cells = Array.from({ length: cellCount }, (_, ci) => baseCells[ci] ?? "(생성 시 채움)");
      return { label: markerLabel(markerStyle, i), text: "", cells };
    }
    return {
      label: markerLabel(markerStyle, i),
      text: base ? choiceItemDisplayText(base, itemPattern, format.choices.pairSeparator) : PLACEHOLDER_CHOICE_TEXT,
      cells: [],
    };
  });
  return {
    markerStyle,
    layout,
    itemPattern,
    pairSeparator: format.choices.pairSeparator,
    columnHeaders: format.choices.columnHeaders,
    items,
  };
}

function firstSourcePassage(source: LayoutDoc | null): string {
  const block = source?.blocks.find((b) => b.kind === "TEXT" || b.kind === "BOX" || b.kind === "NOTE");
  return block?.text?.trim() ?? "";
}

function sourceBlockByKind(source: LayoutDoc | null, kind: LayoutBlock["kind"]): LayoutBlock | undefined {
  return source?.blocks.find((b) => b.kind === kind);
}

/**
 * FormatSpec 의 모든 컨트롤을 미리보기 LayoutDoc 으로 결정 투영한다.
 * 어떤 컨트롤을 바꾸든 화면이 즉시 달라지도록 구조를 매번 스펙에서 재합성한다.
 */
export function projectLayoutDocWithSpec(source: LayoutDoc | null, format: FormatSpec): LayoutDoc {
  const s = format.stimulus;
  const a = format.answer;
  const blocks: LayoutBlock[] = [];

  const emptyBlock = (over: Partial<LayoutBlock>): LayoutBlock => ({
    kind: "TEXT",
    label: "",
    text: "",
    items: [],
    tableHeaders: [],
    tableRows: [],
    ...over,
  });

  // ── 발문 ── (패턴 우선 → 편집 즉시 반영, 배점 표시 옵션 반영)
  let direction = format.stem.pattern.trim() || source?.direction.trim() || PLACEHOLDER_DIRECTION;
  if (format.stem.negativeForm && !/않|틀린|아닌|없는/.test(direction)) {
    direction = `${direction}  (부정형)`;
  }
  if (format.stem.pointsVisible && format.stem.points != null) {
    direction = `${direction} [${format.stem.points}점]`;
  }

  // ── 자료(지문) ── 원본 마커/빈칸은 보존하고, 스펙과 개수가 다를 때만 재합성.
  if (s.present && s.form !== "NONE") {
    let body = firstSourcePassage(source) || PLACEHOLDER_PASSAGE;
    // 밑줄·빈칸 개수가 0인데 원본에 있으면 제거(스펙을 0으로 내린 것을 반영).
    body = applyUnderlineMarks(body, s.underlineMarks.count, s.underlineMarks.labelStyle as MarkerStyle);
    body = applyBlanks(
      body,
      s.blanks.count,
      s.blanks.renderStyle as BlankRenderStyle,
      s.blanks.labelStyle as MarkerStyle,
    );
    if (s.numberedSentences.present) {
      body = injectSentenceNumbers(body, s.numberedSentences.style as MarkerStyle);
    }
    if (s.bulletSections.present) {
      const headers = Math.max(1, s.bulletSections.headerCount);
      const marker = s.bulletSections.bulletMarker.trim() || "•";
      const bulletLines = Array.from({ length: headers }, (_, i) => `${marker} 항목 ${i + 1}`).join("\n");
      body = `${body}\n${bulletLines}`;
    }
    blocks.push(
      emptyBlock({
        kind: s.boxed ? "BOX" : "TEXT",
        label: s.titleLine ? "자료 제목" : "",
        text: body,
      }),
    );
  }

  // ── (A)(B)(C) 분할 단락 ──
  if (s.paragraphLabels.count > 0) {
    const sourceParas = sourceBlockByKind(source, "LABELED_PARAS")?.items ?? [];
    blocks.push(
      emptyBlock({
        kind: "LABELED_PARAS",
        items: Array.from({ length: s.paragraphLabels.count }, (_, i) => ({
          label: markerLabel(s.paragraphLabels.style as MarkerStyle, i),
          text: sourceParas[i]?.text?.trim() || "(분할 단락 — 생성 시 AI가 채움)",
        })),
      }),
    );
  }

  // ── 보조 박스(format.boxes) ── ANSWER_FORM 은 답란 쪽에서 별도 처리.
  for (const box of format.boxes) {
    if (box.kind === "ANSWER_FORM") continue;
    const src = box.label.trim()
      ? source?.blocks.find((b) => b.label.trim() === box.label.trim())
      : sourceBlockByKind(source, box.kind as LayoutBlock["kind"]);
    const itemCount = Math.min(box.itemCount || 0, 12);
    blocks.push(
      emptyBlock({
        kind: (BOX_KINDS.includes(box.kind) ? box.kind : "NOTE") as LayoutBlock["kind"],
        label: box.label,
        text: src?.text ?? "",
        items:
          itemCount > 0
            ? Array.from({ length: itemCount }, (_, i) => ({
                label: box.ordered ? `${i + 1}.` : src?.items[i]?.label?.trim() || "",
                text: src?.items[i]?.text?.trim() || "(생성 시 AI가 채움)",
              }))
            : [],
        tableHeaders: box.columnHeaders,
      }),
    );
  }

  const subjective = a.shape !== "MULTIPLE_CHOICE";

  // ── 조건 박스(서술형 conditionsCount) — boxes 에 CONDITIONS 가 없을 때만 ──
  const hasConditionsBox = format.boxes.some((b) => b.kind === "CONDITIONS");
  if (subjective && a.subjective.conditionsCount > 0 && !hasConditionsBox) {
    blocks.push(
      emptyBlock({
        kind: "CONDITIONS",
        label: "조건",
        items: Array.from({ length: a.subjective.conditionsCount }, (_, i) => ({
          label: `${i + 1}.`,
          text: "(조건 — 생성 시 AI가 채움)",
        })),
      }),
    );
  }

  // ── 답 슬롯(서술형 answerBlankCount) ──
  if (subjective && a.subjective.answerBlankCount > 0) {
    const labelStyle = a.subjective.blankLabelStyle as MarkerStyle;
    blocks.push(
      emptyBlock({
        kind: "ANSWER_FORM",
        items: Array.from({ length: a.subjective.answerBlankCount }, (_, i) => ({
          label: markerLabel(labelStyle !== "NONE" ? labelStyle : "PAREN_ALPHA_UPPER", i),
          text: "",
        })),
      }),
    );
  }

  const answerLineCount = subjective ? a.subjective.answerLineCount : 0;

  return {
    version: LAYOUT_DOC_VERSION,
    direction,
    blocks,
    choices: projectChoices(source?.choices ?? null, format),
    answerLineCount,
  };
}
