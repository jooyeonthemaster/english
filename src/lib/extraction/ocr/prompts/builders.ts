import { getModeConfig, type ExtractionMode } from "../../modes";
import { OCR_SYSTEM_PROMPT } from "./m1";
import { STRUCTURED_OCR_SYSTEM_PROMPT } from "./structured-base";
import { PASSAGE_ONLY_STRUCTURED_ADDON } from "./structured-passage-addon";
import { TEXT_INPUT_DISCLAIMER } from "./text-input-disclaimer";

/**
 * Build a system prompt for the given mode. Appends the mode's `promptAddon`
 * to the common verbatim/privacy rules.
 */
export function buildOcrSystemPrompt(mode: ExtractionMode): string {
  const cfg = getModeConfig(mode);
  return `${OCR_SYSTEM_PROMPT}\n\n[모드 지시]\n${cfg.promptAddon}`;
}

/**
 * Build the per-page user prompt. Includes page position so the model knows
 * which page is the cover / header page (relevant for FULL_EXAM).
 */
export function buildOcrUserPrompt(
  mode: ExtractionMode,
  pageIndex: number,
  totalPages: number,
): string {
  const cfg = getModeConfig(mode);
  const positionHint =
    pageIndex === 0
      ? "이 페이지는 업로드 묶음의 첫 장입니다. 시험지 헤더(시행년도·회차·과목·학년)가 있다면 반드시 포함해 주세요."
      : pageIndex === totalPages - 1
        ? "이 페이지는 업로드 묶음의 마지막 장입니다. 저작권 고지·쪽수 표기 같은 머리말·꼬리말은 본문과 분리해서 다뤄 주세요."
        : "";
  // 업로드 묶음 인덱스는 시험지 자체의 쪽수와 다를 수 있다 (사용자가 여러 시험지를 한 번에 올림 / 순서가 뒤섞임).
  // 그래서 더 이상 "N장 중 M번째" 라고 알려주지 않는다 — 페이지 쪽수는 페이지에 실제로 표기된 표시에서만 추출.
  return [
    `모드: ${cfg.shortLabel} — ${cfg.label}.`,
    positionHint,
    "위 규칙을 지켜 인쇄된 모든 텍스트를 원문 그대로 추출해 주세요.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStructuredOcrSystemPrompt(mode: ExtractionMode): string {
  if (mode !== "PASSAGE_ONLY") return STRUCTURED_OCR_SYSTEM_PROMPT;
  return `${STRUCTURED_OCR_SYSTEM_PROMPT}\n\n${PASSAGE_ONLY_STRUCTURED_ADDON}`;
}

export function buildStructuredOcrSystemPromptForText(
  mode: ExtractionMode,
): string {
  const base =
    mode === "PASSAGE_ONLY"
      ? `${STRUCTURED_OCR_SYSTEM_PROMPT}\n\n${PASSAGE_ONLY_STRUCTURED_ADDON}`
      : STRUCTURED_OCR_SYSTEM_PROMPT;
  return `${base}\n\n${TEXT_INPUT_DISCLAIMER}`;
}

export function buildStructuredOcrUserPromptForText(
  mode: ExtractionMode,
  pageIndex: number,
  totalPages: number,
  extractedText: string,
): string {
  const cfg = getModeConfig(mode);
  const positionHint =
    pageIndex === 0
      ? "이 페이지는 업로드 묶음의 첫 장입니다. 시험지 헤더(시행년도·회차·과목·학년)가 있다면 EXAM_META로 분리해 주세요."
      : pageIndex === totalPages - 1
        ? "이 페이지는 업로드 묶음의 마지막 장입니다. 저작권 고지·쪽수 표기 같은 머리말·꼬리말은 본문과 분리해 주세요."
        : "";
  // CRITICAL: upload-bundle index is NOT the booklet's own page number.
  // We deliberately do NOT tell the model "this is page N of M" because it
  // confuses the booklet's footer pageTotal (e.g. "3 / 8") with the upload
  // batch size, leading to inconsistent pageMeta.pageTotal across pages of
  // the same booklet. The model should extract booklet page number / total
  // ONLY from text it actually sees on the page (footer / header markup).
  return [
    `모드: ${cfg.shortLabel} — ${cfg.label}.`,
    positionHint,
    "pageMeta.pageNumber / pageMeta.pageTotal 는 페이지에 실제로 표기된 쪽수 표시(\"N / M\", \"(N)\", \"- N -\", \"N쪽\" 등)에서만 추출하세요. 업로드 묶음 인덱스(전체 묶음에서 몇 번째 페이지인지)를 그대로 옮기지 마세요.",
    "",
    "[Document AI가 추출한 페이지 텍스트] (= 본문 텍스트의 source of truth)",
    "```",
    extractedText,
    "```",
    "",
    "[참고용 페이지 이미지 사용 규칙 — CRITICAL]",
    "이 요청에는 페이지 이미지가 함께 첨부됩니다. 이미지는 오직 다음 두 가지 용도로만 사용하세요:",
    "  1) 위 텍스트에서 누락된 본문 안 마커(①②③④⑤, (a)~(f), (A)~(C), [A]~[C], ( ① )~( ⑤ ) 등)의 위치 확인",
    "  2) 시각 신호로만 식별 가능한 layout 단서(박스로 둘러친 sentence, 본문 내 강조선 위치 등) 보강",
    "이미지에서 본문 영어 문장을 새로 OCR하거나 다시 생성/재현하지 마세요.",
    "이미지에서 본 글자를 길게 받아쓰는 행동은 RECITATION 위험을 유발하므로 **절대 금지**.",
    "본문 텍스트는 위의 Document AI 결과를 그대로 옮기고, 누락된 마커만 본문 안의 정확한 단어 앞에 삽입하세요.",
    "  - 예: Document AI text 가 \"...random variation is combined with nonrandom selection...\" 이고",
    "    이미지 본문에 \"①combined\" 가 보이면 → blockType=PASSAGE_BODY 의 content 를",
    "    \"...random variation is ①combined with nonrandom selection...\" 로 (Document AI text 그대로 + 마커만 부착).",
    "  - 단어 자체 / 어순 / 띄어쓰기 / 마침표는 Document AI text 가 우선. 마커만 추가 보강.",
    "",
    "위 텍스트를 분류 규칙대로 블록으로 분해하고 (이미지에서 본 마커는 본문 안에 부착하여) JSON 1개로 반환해 주세요.",
  ]
    .filter((s) => s !== "")
    .join("\n");
}
