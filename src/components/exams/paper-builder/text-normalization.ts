const HARD_BREAK_MARKER_RE =
  /^(\[[^\]]+\]|\(?[A-Ea-e]\)|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\d+\.|[-*]\s+)/;
const ANSWER_METADATA_BLOCK_RE =
  /^\s*\[(?:blank answers|\uBE48\uCE78\s*\uC815\uB2F5)\]\s*/i;
const INTERNAL_METADATA_BLOCK_RE =
  /^\s*\[(?:target|context|\uB300\uC0C1\s*\uB2E8\uC5B4|\uBB38\uB9E5)\]\s*/i;
const MATCH_TYPE_METADATA_SPAN_RE =
  /\s*\[(?:type|match\s*type|\uC720\uD615)\s*:\s*[^\]]+\]\s*/gi;

const LEGACY_QUESTION_SECTION_LABELS: Record<string, string> = {
  reference: "영작할 우리말",
  original: "원문",
  condition: "조건",
  conditions: "조건",
  "word order": "배열 단어",
  hint: "힌트",
};

export function normalizeQuestionSectionMarkers(text: string): string {
  return text.replace(
    /(^|\n)[ \t]*\[(reference|original|conditions?|word order|hint)\][ \t]*(\n?)/gi,
    (_match, lineStart: string, rawMarker: string, trailingNewline: string) => {
      const label = LEGACY_QUESTION_SECTION_LABELS[rawMarker.toLowerCase()];
      const separator = label === "조건" || trailingNewline ? "\n" : " ";
      return `${lineStart}[${label}]${separator}`;
    },
  );
}

function normalizeBaseText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function collapseProseLineBreaks(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function shouldKeepLineBreaks(block: string): boolean {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return false;
  if (lines[0]?.startsWith("[\uC870\uAC74]")) return true;
  if (lines[0]?.startsWith("[conditions]")) return true;

  const markerLines = lines.filter((line) => HARD_BREAK_MARKER_RE.test(line));
  return markerLines.length >= Math.min(2, lines.length);
}

function stripInternalMetadataBlocks(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(
      (block) =>
        block &&
        !INTERNAL_METADATA_BLOCK_RE.test(block) &&
        !ANSWER_METADATA_BLOCK_RE.test(block),
    )
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .map((line) => line.replace(MATCH_TYPE_METADATA_SPAN_RE, " ").trim())
        .filter(Boolean)
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function normalizePassageText(text: string): string {
  const normalized = normalizeBaseText(text);
  if (!normalized) return "";

  // 전부 통짜: 지문 단락을 빈 줄이 아닌 공백으로 이어 단일 흐름으로(임베드형과 통일).
  // 예외 — 각주 블록("* word: 뜻 ** word: 뜻")은 인쇄 관행대로 본문 아래 별도 줄에 둔다(whitespace-pre-line 이 \n 을 줄바꿈으로
  // 그린다). 공급원은 기출 문항 은행 지문뿐이라(AI 생성 지문엔 각주 블록이 없다) 기존 조판엔 영향이 없다.
  // **멱등성**: 이 함수는 한 번 접은 결과에 다시 걸린다(세트 그룹 지문은 makePaperItem →
  // buildGroups → mergedSetPassageForItems 로 3회 통과). 그때 (A) 단락 경계는 이미 개행 1개라
  // `\n{2,}` 분할에 안 걸려 통짜로 다시 붙었다(픽스처 실측 전: 43-45 newlines=0). 단락 라벨 줄
  // 머리 앞의 개행 1개를 블록 경계로 승격한다 — 승격해도 아래 keepSetBlocks 가 거짓이면 어차피
  // 공백으로 다시 이어지므로(같은 블록을 두 조각으로 접는 것과 결과 동일) 기존 지문엔 무영향.
  // 각주도 같은 이유로 승격한다 — 세트 지문은 각주 꼬리가 붙은 뒤 한 번 더 정규화되므로
  // 승격이 없으면 각주가 본문 마지막 문장 뒤에 통짜로 흡수된다(픽스처 실측 전:
  // "…original makers and owners. * garment: 의복").
  const withBlockBreaks = normalized.replace(/\n(?=\([A-D]\)\s|[*＊]\s*[A-Za-z])/g, "\n\n");
  const blocks = withBlockBreaks.split(/\n{2,}/).map(collapseProseLineBreaks).filter(Boolean);
  // 43-45 세트의 셔플 단락 유지 조건: **전 블록이 단락 라벨((A)~(D)) 또는 각주**이고 라벨 블록이
  // 2개 이상 — 즉 「텍스트 전체가 라벨 단락의 나열」일 때만. 이 좁은 조건이 없으면 은행 순서
  // 문항(36·37)의 발문+[주어진 문장]+(A)(B)(C) 직렬 본문까지 줄이 갈라진다(실측 301건 회귀).
  const labeledBlocks = blocks.filter((block) => PASSAGE_SET_BLOCK_LABEL_RE.test(block)).length;
  const keepSetBlocks =
    labeledBlocks >= 2 &&
    blocks.every(
      (block) =>
        PASSAGE_SET_BLOCK_LABEL_RE.test(block) || PASSAGE_FOOTNOTE_BLOCK_RE.test(block),
    );
  let out = "";
  for (const block of blocks) {
    if (!out) { out = block; continue; }
    const keepBreak =
      PASSAGE_FOOTNOTE_BLOCK_RE.test(block) ||
      (keepSetBlocks && PASSAGE_SET_BLOCK_LABEL_RE.test(block));
    out += (keepBreak ? "\n" : " ") + block;
  }
  return out;
}

/** 지문 각주 블록 머리 — "* consensus: 합의", "＊ aesthetic: 미학의" */
const PASSAGE_FOOTNOTE_BLOCK_RE = /^[*＊]\s*[A-Za-z]/;
/**
 * 장문 세트 43-45 의 셔플 단락 머리 — "(A) When Sam …" (§12.1-2 · §12.5).
 * 각주와 같은 이유로 줄바꿈을 유지한다: 통짜로 이으면 인쇄본의 4단락이 한 문단으로 붙어
 * (A)~(D) 라벨이 문장 한가운데 박힌다(픽스처 실측 전: newlines=0 · paraLabels=["(A)"]).
 * 공급원은 은행 세트 표시 베이스뿐이라(AI 생성 지문·KO 지문엔 단독 (A) 단락 라벨이 없다)
 * 기존 조판엔 영향이 없다 — 무회귀 게이트(questions.json 표본 30건 세그먼트 스냅숏)로 확인.
 */
const PASSAGE_SET_BLOCK_LABEL_RE = /^\([A-D]\)\s/;

export function normalizeQuestionText(text: string): string {
  const normalized = stripInternalMetadataBlocks(
    normalizeQuestionSectionMarkers(normalizeBaseText(text)),
  );
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (!shouldKeepLineBreaks(trimmed)) return collapseProseLineBreaks(trimmed);
      return trimmed
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeInlineText(text: string): string {
  return normalizeBaseText(text).replace(/[ \t]{2,}/g, " ");
}
