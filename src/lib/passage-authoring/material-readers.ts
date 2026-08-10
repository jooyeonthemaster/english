"use client";

// ============================================================================
// 자료 판독기(material readers) — 브라우저 전용
//
// AI 지문 생성의 입력은 전부 "텍스트"다(schema.ts §1). 선생님은 어법 교재 PDF,
// 단어장 엑셀, 워드로 받은 외부 지문, 폰으로 찍은 교재 사진을 가리지 않고 던진다.
// 이 모듈은 그 아무거나를 **한 함수**로 텍스트로 만든다.
//
// 왜 텍스트로 정규화하나:
//   1) 선생님이 "AI 가 무엇을 읽었는지"를 눈으로 보고 고칠 수 있다(신뢰).
//   2) 생성 호출이 싸고 안정적이다(이미지 토큰·판독 실패 리스크 제거).
// ①은 지금도 유효하다. 텍스트는 **여전히 판독의 정본**이고, 원본 페이지 이미지는
// 사용자가 켠 자료에 한해 생성 호출에 **함께** 실릴 뿐이다(uploadMaterialPageImages).
// 대체가 아니라 보강이다 — 밑줄·굵게·네모 박스·표 병합은 텍스트만으로 소멸한다.
//
// 왜 브라우저에서 푸나: docx/xlsx/hwpx 는 전부 zip+xml 이라 서버 왕복이 필요 없다.
// 서버로 가는 건 시각 판독이 꼭 필요한 PDF 페이지·사진뿐이다(무료 판독 라우트).
//
// ── PDF 는 쪽 단위 하이브리드다 ─────────────────────────────────────────────
// 텍스트 레이어가 살아 있는 쪽은 **원문 그대로**(네트워크 0회), 글자가 안 잡히는
// 쪽만 이미지로 구워 판독 라우트로 보낸 뒤 **페이지 순서대로 병합**한다. 예전의
// 문서 단위 전부-아니면-전무 판정(TEXT_LAYER_PAGE_RATIO)은 텍스트5·스캔5 문서에서
// 멀쩡한 5쪽을 버렸고, 텍스트7·스캔3 문서에서는 스캔 3쪽을 조용히 잃었다.
//
// 그 조기 반환 경로에는 판독 라우트의 `[[LAYOUT=…]]` 꼬리줄이 없다 — 그래서 한동안
// **표가 가득한 디지털 교재가 하이브리드 기본 OFF** 였다(표·밑줄·박스가 텍스트에서
// 소멸하는, 원본 페이지가 가장 필요한 자료인데도). 지금은 같은 조각 좌표로
// detectTableLayout(순수 함수, 호출 0회)이 그 자리를 메운다.
//
// docx/xlsx/hwpx(zip+xml, 네트워크 0회)는 material-office-readers.ts 로 갈라 뒀다 —
// 이 파일은 형식 라우팅 + PDF·사진(서버 판독을 타는 유일한 경로)만 본다.
//
// 회귀 방지 계약:
//   - 던지는 Error 의 message 는 **그대로 사용자에게 보여줄 수 있는 한국어 해요체**
//     여야 한다. "왜 안 되는지 + 무엇을 하면 되는지"까지 담는다.
//   - 결과 문자열은 항상 정규화(CRLF→LF, 3줄 이상 공백 축약, 60,000자 상한)를 거친다.
//     상한은 authoringMaterialSchema.content 의 max(60_000)와 같은 값이다 —
//     여기서 자르지 않으면 서버 zod 가 통째로 400 을 낸다.
//   - 의존성 추가 금지. pdfjs(splitPdfToImages)와 브라우저 내장 API 만 쓴다
//     (jszip 은 갈라져 나간 material-office-readers.ts 쪽에 남아 있다).
// ============================================================================

import {
  ACCEPTED_IMAGE_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import { readDocx, readHwpx, readXlsx } from "./material-office-readers";
import { revokeSlotUrls, splitPdfToImages } from "@/lib/extraction/pdf-splitter";
import { extractPdfTextLayer } from "./pdf-text-layer";
import { isTableHeavyFront } from "./pdf-line-reconstruct";
import { MATERIAL_ROLES } from "@/lib/passage-authoring/schema";
import type {
  MaterialRole,
  MaterialSourceKind,
} from "@/lib/passage-authoring/schema";

// ── 상수 ────────────────────────────────────────────────────────────────────

/** 첨부 1건 원본 크기 상한. */
export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;

/** <input type="file" accept="…"> 값. 확장자와 mime 을 함께 적어야 OS 별 편차가 없다. */
export const MATERIAL_ACCEPT_ATTR = [
  ".txt,.md,.markdown,.csv,.tsv,.json",
  ".docx,.xlsx,.hwpx,.pdf",
  ".jpg,.jpeg,.png,.webp",
  "text/plain,text/csv,application/json,application/pdf",
  "image/jpeg,image/png,image/webp",
].join(",");

/** 판독 결과 상한 — schema.ts 의 content max 와 동일해야 한다. */
const MAX_MATERIAL_CHARS = 60_000;

/** PDF 는 앞쪽 이만큼만 읽는다. 자료는 보통 앞부분에 핵심이 있고, 뒤는 원가만 든다. */
const MAX_PDF_PAGES = 20;

/**
 * 한 번의 판독 콜에 싣는 페이지 수. 4 → 2 로 줄였다.
 * 밀도 높은 교재 4쪽은 출력 예산을 넘겨 **뒷쪽이 조용히 사라졌다**(라우트가 이제
 * finishReason 으로 잡아 주지만, 애초에 넘기지 않는 편이 낫다). 해상도를 2.2 로
 * 올려 쪽당 바이트도 커졌으므로 배치를 줄이는 쪽이 양쪽으로 맞다.
 * ※ 라우트의 방어 상한은 여전히 4장이다(사진 여러 장 경로가 그 값을 쓴다).
 */
const MAX_PAGES_PER_BATCH = 2;

/**
 * 한 배치의 base64 총량 상한. 서버리스 요청 본문 예산(≈4.5MB)을 넘기면 판독 이전에
 * 요청 자체가 거절되므로, 페이지 수가 아니라 **바이트**로도 배치를 끊는다.
 */
const MAX_BATCH_BASE64_CHARS = 3.2 * 1024 * 1024;

/**
 * 자료 판독용 PDF 렌더 설정.
 * 1.75(=126 DPI)는 작은 글씨·위첨자·밑줄이 뭉개지는 구간이었다. 2.2 = **158 DPI**
 * 로 올린다(PDF 기준 해상도 72 × 2.2). 늘어난 바이트는 배치 2쪽화가 흡수하고,
 * 그래도 넘치면 MAX_BATCH_BASE64_CHARS 가 알아서 끊는다.
 */
const PDF_MATERIAL_RENDER_SCALE = 2.2;
const PDF_MATERIAL_JPEG_QUALITY = 0.85;

/**
 * 사진을 원본 그대로 보낼 수 있는 긴 변 한계(px).
 * 예전 조건은 "파일 크기 ≤ 5MB" 였는데, 4032×3024 폰 사진은 3MB 대라 그 게이트를
 * 그대로 통과했다. Gemini 는 768×768 타일당 258토큰이라 그 한 장이 6,192토큰이다
 * (1800px 로 줄이면 약 1,500토큰). 활자 판독에는 1800px 이면 충분하다.
 */
const MAX_IMAGE_LONG_EDGE = 1800;

const READ_MATERIAL_ENDPOINT = "/api/workbench/passage-authoring/read-material";

/**
 * 하이브리드(원본 페이지 함께 보내기) 서명 업로드 발급 라우트.
 * 요청  { materialId, pages: [{ index, contentType }] }
 * 응답  { prefix, targets: [{ index, uploadUrl, path }] }
 *
 * 경로는 **서버가 정한다** — 클라이언트가 준 materialId 는 경로에 들어가지 않는다
 * (사용자 입력이라 다른 학원 프리픽스를 심을 수 있다). 실제 규약은
 * `${prefix}/${index 4자리 0채움}.${확장자}` 이고, prefix 는
 * `{academyId}/passage-authoring/{서버 UUID}` 다.
 *
 * ⚠️ 서버(run-job)는 pageCount 로 경로를 **조립하지 않는다.** 프리픽스를
 * listPageObjects 로 훑어 이름 오름차순으로 정렬해 실제로 실린 것만 쓴다 —
 * 티켓을 끊은 것과 업로드가 끝난 것은 다른 사실이기 때문이다. 4자리 0채움이
 * 필요한 이유가 바로 그 정렬이다(`10.jpg` 는 `2.jpg` 앞에 온다).
 */
const PAGE_UPLOAD_ENDPOINT = "/api/workbench/passage-authoring/page-uploads";

/**
 * 스토리지에 **올려 두는** 페이지 수의 상한.
 *
 * ⚠️ 26-08-04 에 의미가 갈렸다. 이 값은 더 이상 "모델이 보는 쪽 수"가 아니다.
 *   · 여기(업로드) — 모델 원가 **0**. 드는 것은 브라우저 렌더 시간과 스토리지뿐이다.
 *   · 실제 전송   — page-images.maxPageImagesFor(count) 가 정한다. 1편이면 20쪽,
 *                   2편 이상이면 4쪽이다(같은 이미지가 편수만큼 재전송되므로).
 * 둘을 다시 한 값으로 합치지 말 것. 합치면 둘 중 하나가 반드시 틀린 이유로 묶인다 —
 * 업로드를 4로 조이면 1편 발주가 20쪽을 볼 방법이 사라지고, 전송을 20으로 열면
 * 6편 배치의 입력 토큰이 5배가 된다.
 *
 * 20 인 이유: 판독 상한(MAX_PDF_PAGES)과 같은 값이다. "판독이 읽는 범위"와 "원본을
 * 올려 두는 범위"가 어긋나면, 어느 쪽으로 보내느냐에 따라 자료의 끝이 달라진다.
 */
export const MAX_SEND_PAGES = 20;

const TEXT_EXTS = new Set(["txt", "md", "markdown", "csv", "tsv", "json"]);
const DOC_EXTS = new Set(["docx"]);
const SHEET_EXTS = new Set(["xlsx"]);
const HWPX_EXTS = new Set(["hwpx"]);
const PDF_EXTS = new Set(["pdf"]);
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

/** 못 읽는 형식별 "그럼 어떻게 하면 되는지". 안내가 없으면 선생님은 그냥 포기한다. */
const UNSUPPORTED_GUIDE: Record<string, string> = {
  hwp: "한글 .hwp 는 바로 읽을 수 없어요. 한글에서 [파일 → 다른 이름으로 저장] 으로 PDF 또는 .hwpx 로 저장해 올려 주세요.",
  doc: "구형 .doc 은 읽을 수 없어요. Word 에서 .docx 로 저장하거나 PDF 로 내보내 주세요.",
  xls: "구형 .xls 는 읽을 수 없어요. Excel 에서 .xlsx 로 저장해 올려 주세요.",
  ppt: "슬라이드(.ppt)는 읽을 수 없어요. PDF 로 내보내 올려 주세요.",
  pptx: "슬라이드(.pptx)는 읽을 수 없어요. PDF 로 내보내 올려 주세요.",
  zip: "압축 파일은 읽을 수 없어요. 압축을 풀어 파일을 하나씩 올려 주세요.",
  heic: "아이폰 사진(.heic)은 읽을 수 없어요. 사진 앱에서 JPG 로 저장하거나 화면을 캡처해 올려 주세요.",
  heif: "아이폰 사진(.heif)은 읽을 수 없어요. 사진 앱에서 JPG 로 저장하거나 화면을 캡처해 올려 주세요.",
  gif: "GIF 는 읽을 수 없어요. JPG·PNG 로 저장해 올려 주세요.",
  bmp: "BMP 는 읽을 수 없어요. JPG·PNG 로 저장해 올려 주세요.",
  hwt: "한글 서식 파일(.hwt)은 읽을 수 없어요. PDF 로 저장해 올려 주세요.",
};

// ── 공개 타입 ───────────────────────────────────────────────────────────────

/**
 * 지면 형태. TABLE_HEAVY·DIAGRAM 이면 텍스트만으로 뜻이 통하지 않으므로 sendPages
 * 기본값을 켜는 근거가 된다(최종 결정은 언제나 사용자 — 숨은 자동 결정 금지).
 *
 * 출처가 **둘**이다(둘 다 추가 과금 0):
 *   · 판독 라우트의 같은 콜 꼬리줄 `[[LAYOUT=…]]` — 스캔 쪽·사진에만 있다.
 *   · pdf-line-reconstruct.detectTableLayout — 텍스트 레이어가 살아 있는 쪽.
 *     이 경로는 애초에 라우트를 타지 않으므로(네트워크 0회) 꼬리줄이 없다.
 * DIAGRAM 은 좌표만으로 판정할 방법이 없어 라우트만 말할 수 있다.
 */
export const MATERIAL_LAYOUTS = ["TABLE_HEAVY", "DIAGRAM", "PLAIN"] as const;
export type MaterialLayout = (typeof MATERIAL_LAYOUTS)[number];

export interface MaterialReadResult {
  content: string;
  sourceKind: MaterialSourceKind;
  /** 사용자에게 알릴 주의(예: "30쪽 중 앞 20쪽만 읽었어요"). */
  warning?: string;
  /**
   * 판독 라우트가 **지면을 실제로 보고** 판정한 역할. 파일명·본문 키워드 휴리스틱
   * (material-intake.guessMaterialRole)보다 우선한다 — 그 휴리스틱은 경계 없는
   * includes 라 기출 시험지를 단어장으로 잡아 커버리지가 "200개 중 3개"라는 거짓
   * 신호를 냈다. roleLocked(선생님이 직접 고름)면 여전히 사용자 값이 우선이다.
   */
  role?: MaterialRole;
  /** 지면 형태(하이브리드 기본값 판단용). */
  layout?: MaterialLayout;
  /** 원본 페이지 수(PDF=문서 쪽수, 사진=1). sendPages 표시·상한 계산에 쓴다. */
  pageCount?: number;
}

export interface ReadMaterialOptions {
  onProgress?: (label: string) => void;
  signal?: AbortSignal;
}

// ── 공개 API ────────────────────────────────────────────────────────────────

export function isSupportedMaterialFile(file: File): boolean {
  const ext = extensionOf(file);
  if (
    TEXT_EXTS.has(ext) ||
    DOC_EXTS.has(ext) ||
    SHEET_EXTS.has(ext) ||
    HWPX_EXTS.has(ext) ||
    PDF_EXTS.has(ext) ||
    IMAGE_EXTS.has(ext)
  ) {
    return true;
  }
  // 확장자가 없는 파일도 있다(드래그·클립보드). mime 으로 한 번 더 본다.
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  if (mime === "application/pdf" || mime === "application/json") return true;
  return (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(mime);
}

/** 왜 못 읽는지 + 무엇을 하면 되는지. 토스트에 그대로 띄울 수 있는 한 문장. */
export function describeUnsupportedFile(file: File): string {
  const ext = extensionOf(file);
  const guide = UNSUPPORTED_GUIDE[ext];
  if (guide) return `${file.name}: ${guide}`;
  return `${file.name}: 지원하지 않는 형식이에요. 텍스트(.txt·.md·.csv)·워드(.docx)·엑셀(.xlsx)·한글(.hwpx)·PDF·사진(JPG·PNG)으로 올려 주세요.`;
}

/**
 * 파일 1건을 텍스트로 판독한다. 형식별 경로는 아래 §판독기들.
 * PDF·사진만 서버(무료 판독 라우트)를 거치고 나머지는 전부 브라우저에서 끝난다.
 */
export async function readMaterialFile(
  file: File,
  opts: ReadMaterialOptions = {},
): Promise<MaterialReadResult> {
  if (file.size > MAX_MATERIAL_BYTES) {
    throw new Error(
      `${file.name} 은(는) ${formatMb(file.size)}MB 로 너무 커요. ${formatMb(MAX_MATERIAL_BYTES)}MB 이하로 올려 주세요.`,
    );
  }
  if (!isSupportedMaterialFile(file)) {
    throw new Error(describeUnsupportedFile(file));
  }

  const ext = extensionOf(file);
  const mime = (file.type || "").toLowerCase();
  const warnings: string[] = [];
  let sourceKind: MaterialSourceKind = "FILE_TEXT";
  let raw = "";
  let role: MaterialRole | undefined;
  let layout: MaterialLayout | undefined;
  let pageCount: number | undefined;

  if (PDF_EXTS.has(ext) || mime === "application/pdf") {
    sourceKind = "FILE_PDF";
    const result = await readPdf(file, opts);
    raw = result.text;
    role = result.role;
    layout = result.layout;
    pageCount = result.pageCount;
    if (result.warning) warnings.push(result.warning);
  } else if (
    IMAGE_EXTS.has(ext) ||
    (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(mime)
  ) {
    sourceKind = "FILE_IMAGE";
    opts.onProgress?.("사진에서 글자를 읽는 중…");
    const result = await readImage(file, opts);
    raw = result.text;
    role = result.role;
    layout = result.layout;
    pageCount = 1;
    if (result.warning) warnings.push(result.warning);
  } else if (DOC_EXTS.has(ext)) {
    sourceKind = "FILE_DOC";
    opts.onProgress?.("워드 문서를 읽는 중…");
    raw = await readDocx(file);
  } else if (SHEET_EXTS.has(ext)) {
    sourceKind = "FILE_SHEET";
    opts.onProgress?.("엑셀 시트를 읽는 중…");
    raw = await readXlsx(file);
  } else if (HWPX_EXTS.has(ext)) {
    sourceKind = "FILE_DOC";
    opts.onProgress?.("한글 문서를 읽는 중…");
    raw = await readHwpx(file);
  } else {
    sourceKind = "FILE_TEXT";
    opts.onProgress?.("파일을 읽는 중…");
    raw = await file.text();
    if (countReplacementChars(raw) > 8) {
      warnings.push(
        "글자가 깨져 보이면 파일을 UTF-8 로 저장해 다시 올려 주세요.",
      );
    }
  }

  const { content, truncated } = normalizeMaterialText(raw);
  if (!content) throw new Error(emptyMessageFor(sourceKind, file.name));
  if (truncated) {
    warnings.push(
      `자료가 길어 앞 ${MAX_MATERIAL_CHARS.toLocaleString("ko-KR")}자만 담았어요.`,
    );
  }

  return {
    content,
    sourceKind,
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
    role,
    layout,
    pageCount,
  };
}

/** 원본 페이지를 함께 보낼 수 있는 형식인가 — PDF·사진만 페이지 이미지가 있다. */
export function canSendPages(sourceKind: MaterialSourceKind): boolean {
  return sourceKind === "FILE_PDF" || sourceKind === "FILE_IMAGE";
}

// ── 정규화 ──────────────────────────────────────────────────────────────────

function normalizeMaterialText(raw: string): {
  content: string;
  truncated: boolean;
} {
  // NBSP(U+00A0)를 일반 공백으로 눕히는 이유: 워드·엑셀이 이걸 뿌리는데 그대로 두면
  // 단어 대조(coverage)·프롬프트에서 같은 토큰으로 취급되지 않는다.
  const normalized = raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= MAX_MATERIAL_CHARS) {
    return { content: normalized, truncated: false };
  }
  return {
    content: normalized.slice(0, MAX_MATERIAL_CHARS).trim(),
    truncated: true,
  };
}

function emptyMessageFor(kind: MaterialSourceKind, name: string): string {
  if (kind === "FILE_PDF") {
    return `${name}: PDF 에서 글자를 찾지 못했어요. 스캔 품질이 낮거나 빈 페이지일 수 있어요.`;
  }
  if (kind === "FILE_IMAGE") {
    return `${name}: 사진에서 글자를 찾지 못했어요. 더 밝고 선명하게 찍어 다시 올려 주세요.`;
  }
  if (kind === "FILE_SHEET") {
    return `${name}: 시트에서 내용을 찾지 못했어요. 첫 시트에 값이 있는지 확인해 주세요.`;
  }
  return `${name}: 파일에서 읽을 내용을 찾지 못했어요.`;
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/** 페이지 경로를 거친 판독 1건의 산출. */
interface PageReadOutcome {
  text: string;
  warning?: string;
  role?: MaterialRole;
  layout?: MaterialLayout;
  pageCount?: number;
}

async function readPdf(
  file: File,
  opts: ReadMaterialOptions,
): Promise<PageReadOutcome> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(
      `${file.name} 은(는) ${formatMb(file.size)}MB 로 너무 커요. 필요한 부분만 잘라 올려 주세요.`,
    );
  }
  const startedAt = Date.now();

  // ── 1단계: 텍스트 레이어 직독(쪽 단위) ───────────────────────────────────
  // 어법 교재·단어장 PDF 는 대부분 디지털 PDF 라 글자가 이미 파일 안에 들어 있다.
  // 그 쪽을 이미지로 굽고 OCR 하면 정확한 글자를 추측으로 바꾸는 짓이다(철자·어법
  // 표시가 생명인 자료에서 특히 나쁘다) — 게다가 쪽당 비전 호출까지 든다.
  opts.onProgress?.("PDF 에서 글자를 찾는 중…");
  const layer = await extractPdfTextLayer(file, {
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  const warnings: string[] = [];
  const scoped = layer.pages.slice(0, MAX_PDF_PAGES);
  if (layer.totalPages > scoped.length && scoped.length > 0) {
    warnings.push(
      `${layer.totalPages}쪽 중 앞 ${scoped.length}쪽만 읽었어요. 뒷부분이 필요하면 파일을 나눠 올려 주세요.`,
    );
  }

  // 텍스트 레이어를 아예 못 연 경우(pdfjs 실패)만 전면 OCR 로 내려간다.
  const scanIndices =
    scoped.length === 0
      ? null
      : scoped.filter((page) => !page.dense).map((page) => page.index);

  // 지면 형태를 **실제로 보낼 쪽**으로만 판정한다(모델 호출 0회).
  // uploadMaterialPageImages 는 언제나 앞에서부터 MAX_SEND_PAGES 쪽만 굽기 때문에,
  // 12쪽의 표를 근거로 켜 봐야 모델은 그 표를 못 본다 — 원가만 는다.
  const textLayerTableHeavy = isTableHeavyFront(
    scoped.slice(0, MAX_SEND_PAGES).map((page) => page.tableLike),
  );

  // 전부 글자가 잡혔다면 여기서 끝 — **네트워크 호출 0회, 원문 그대로**.
  if (scanIndices !== null && scanIndices.length === 0) {
    logRead("FILE_PDF", {
      totalPages: layer.totalPages,
      scopedPages: scoped.length,
      densePages: scoped.length,
      scannedPages: 0,
      ocrCalls: 0,
      ocrFailed: 0,
      elapsedMs: Date.now() - startedAt,
    });
    return {
      text: mergePageTexts(scoped.map((page) => ({ index: page.index, text: page.text }))),
      warning: joinWarnings(warnings),
      // 이 경로는 판독 라우트를 타지 않아 꼬리줄이 없다. 그래도 layout 을 비워 두면
      // 안 된다 — 그 자리가 비면 defaultSendPages 가 표 교재까지 전부 OFF 로 만든다.
      // PLAIN 은 "판정을 안 했다"가 아니라 "보고 나서 표가 아니라고 했다"는 사실이다.
      layout: textLayerTableHeavy ? "TABLE_HEAVY" : "PLAIN",
      pageCount: layer.totalPages,
    };
  }

  // ── 2단계: 글자가 안 잡힌 쪽만 이미지로 굽는다 ───────────────────────────
  opts.onProgress?.(
    scanIndices === null
      ? "스캔한 PDF 라 사진에서 글자를 읽어요…"
      : "그림으로 된 쪽만 사진에서 글자를 읽어요…",
  );
  let slots: Awaited<ReturnType<typeof splitPdfToImages>>;
  try {
    slots = await splitPdfToImages(file, {
      scale: PDF_MATERIAL_RENDER_SCALE,
      jpegQuality: PDF_MATERIAL_JPEG_QUALITY,
      // maxPages 를 주는 순간 splitPdfToImages 의 30쪽 전면 거절이 꺼진다.
      // 35쪽 스캔 교재가 "앞 20쪽만" 규칙에 닿기도 전에 거절되던 사고를 막는다.
      maxPages: MAX_PDF_PAGES,
      pageIndices: scanIndices ?? undefined,
      signal: opts.signal,
      onProgress: (p) => {
        if (p.phase === "rendering" && p.totalPages) {
          opts.onProgress?.(
            `PDF ${(p.pageIndex ?? 0) + 1}쪽 준비 중… (${p.totalPages}쪽 중)`,
          );
        }
      },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    // splitPdfToImages 는 이미 사용자용 한국어 메시지를 던진다.
    throw new Error(
      error instanceof Error && error.message
        ? error.message
        : "PDF 를 읽지 못했어요. 다른 PDF 로 다시 시도해 주세요.",
    );
  }

  try {
    const pages: PageImage[] = [];
    for (const slot of slots) {
      throwIfAborted(opts.signal);
      pages.push({
        index: slot.pageIndex,
        mimeType: "image/jpeg",
        base64: await blobToBase64(slot.blob),
      });
    }

    // 글자가 잡힌 쪽은 원문 그대로, 나머지는 판독 결과 — 둘을 **페이지 순서대로**
    // 병합한다. 배치는 연속한 쪽끼리만 묶이므로(buildBatches) 배치 결과를 그
    // 배치의 첫 쪽 자리에 놓으면 순서가 어긋나지 않는다.
    const parts: Array<{ index: number; text: string }> = scoped
      .filter((page) => page.dense && page.text)
      .map((page) => ({ index: page.index, text: page.text }));

    // 텍스트 레이어를 못 연 문서는 쪽수를 알 방법이 없다. 상한까지 꽉 찼다면
    // 뒤가 더 있을 수 있으므로 그렇게만 알린다(있지도 않은 숫자를 지어내지 않는다).
    if (scanIndices === null && slots.length >= MAX_PDF_PAGES) {
      warnings.push(
        `앞 ${MAX_PDF_PAGES}쪽만 읽었어요. 뒷부분이 필요하면 파일을 나눠 올려 주세요.`,
      );
    }

    const batches = buildBatches(pages);
    let done = 0;
    let ocrFailed = 0;
    let firstError: unknown = null;
    const tail: { role?: MaterialRole; layout?: MaterialLayout } = {};

    for (const batch of batches) {
      throwIfAborted(opts.signal);
      done += batch.length;
      opts.onProgress?.(`PDF ${done}/${pages.length}쪽 읽는 중…`);
      try {
        const read = await requestMaterialText(
          { images: batch, kind: "PDF_PAGES", name: file.name },
          opts.signal,
        );
        if (read.text) parts.push({ index: batch[0].index, text: read.text });
        if (read.truncated) {
          warnings.push(
            "이 배치가 길어 일부가 잘렸어요 — 페이지를 나눠 올려 주세요.",
          );
        }
        mergeTailHints(tail, read);
      } catch (error) {
        if (isAbortError(error)) throw error;
        // 한 배치가 실패해도 나머지(특히 원문 그대로인 쪽)는 살린다.
        ocrFailed += batch.length;
        if (!firstError) firstError = error;
      }
    }

    // 건질 게 하나도 없으면 그때는 실패로 알린다(빈 자료를 성공처럼 보이면 안 된다).
    if (parts.length === 0 && firstError) {
      throw firstError instanceof Error
        ? firstError
        : new Error("자료 판독에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
    if (ocrFailed > 0) {
      warnings.push(`${ocrFailed}쪽은 읽지 못해 빼고 담았어요.`);
    }

    logRead("FILE_PDF", {
      totalPages: layer.totalPages,
      scopedPages: scoped.length,
      densePages: scoped.filter((page) => page.dense).length,
      scannedPages: pages.length,
      ocrCalls: batches.length,
      ocrFailed,
      elapsedMs: Date.now() - startedAt,
    });

    return {
      text: mergePageTexts(parts),
      warning: joinWarnings(warnings),
      role: tail.role,
      layout: resolveLayout(tail.layout, textLayerTableHeavy),
      pageCount: layer.totalPages || slots.length,
    };
  } finally {
    // 미리보기 URL 은 쓰지 않는다 — 즉시 회수하지 않으면 탭 메모리가 샌다.
    revokeSlotUrls(slots);
  }
}

interface PageImage {
  /** 0-based 페이지 인덱스. 병합 순서와 배치 연속성 판정에 쓴다. */
  index: number;
  mimeType: string;
  base64: string;
}

/**
 * 같은 주의가 배치마다 반복되지 않게 접어서 한 문장으로 만든다(잘림 경고는 배치
 * 수만큼 쌓인다). 없으면 undefined — 빈 문자열을 돌려주면 UI 가 빈 배지를 그린다.
 */
function joinWarnings(warnings: string[]): string | undefined {
  const unique = Array.from(new Set(warnings));
  return unique.length > 0 ? unique.join(" ") : undefined;
}

/** 페이지 순서대로 이어 붙인다(쪽 사이는 빈 줄 하나). */
function mergePageTexts(parts: Array<{ index: number; text: string }>): string {
  return [...parts]
    .sort((a, b) => a.index - b.index)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 배치를 끊는 기준 세 가지.
 *   ① 페이지 수(MAX_PAGES_PER_BATCH=2)
 *   ② base64 총량(≈3.2MB — 서버리스 요청 본문 예산)
 *   ③ **쪽 번호의 연속성**. 3쪽과 9쪽을 한 콜에 묶으면 모델이 돌려준 한 덩어리
 *      텍스트를 두 자리에 나눠 놓을 방법이 없어, 그 사이에 있던 원문 그대로인
 *      쪽들의 순서가 뒤집힌다. 연속한 쪽끼리만 묶으면 "배치 = 첫 쪽 자리" 규칙이
 *      항상 성립한다.
 */
function buildBatches(pages: PageImage[]): PageImage[][] {
  const batches: PageImage[][] = [];
  let current: PageImage[] = [];
  let chars = 0;
  for (const page of pages) {
    const previous = current[current.length - 1];
    const tooMany = current.length >= MAX_PAGES_PER_BATCH;
    const tooBig =
      current.length > 0 && chars + page.base64.length > MAX_BATCH_BASE64_CHARS;
    const gap = previous !== undefined && page.index !== previous.index + 1;
    if (tooMany || tooBig || gap) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(page);
    chars += page.base64.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * 배치가 여럿이면 꼬리줄도 여럿이다. 역할은 **처음 판정**을 쓰고(앞쪽이 자료의
 * 성격을 가장 잘 드러낸다), 지면 형태는 한 배치라도 표·도식이면 그걸 채택한다
 * (하이브리드는 "필요한 쪽이 하나라도 있으면 켜는" 쪽이 안전하다).
 */
function mergeTailHints(
  into: { role?: MaterialRole; layout?: MaterialLayout },
  read: { role?: MaterialRole; layout?: MaterialLayout },
): void {
  if (!into.role && read.role) into.role = read.role;
  if (read.layout && read.layout !== "PLAIN") into.layout = read.layout;
  else if (!into.layout && read.layout) into.layout = read.layout;
}

/**
 * 텍스트·스캔이 섞인 문서의 지면 형태.
 *
 * 라우트 꼬리줄은 **스캔된 쪽만** 보고 나온 값이고, 좌표 판정은 **글자가 잡힌 쪽만**
 * 본다 — 서로 다른 쪽을 본 두 증언이라 어느 쪽도 상대를 부정하지 못한다. 그래서
 * "표·도식이라고 말한 쪽이 하나라도 있으면 채택"으로 합친다(mergeTailHints 가 배치
 * 여럿을 합칠 때 쓰는 규칙과 같다). DIAGRAM 은 좌표로 판정할 방법이 없어 라우트만이
 * 말할 수 있으므로 그 값을 먼저 존중한다.
 */
function resolveLayout(
  tailLayout: MaterialLayout | undefined,
  tableHeavy: boolean,
): MaterialLayout | undefined {
  if (tailLayout && tailLayout !== "PLAIN") return tailLayout;
  if (tableHeavy) return "TABLE_HEAVY";
  return tailLayout;
}

// ── 사진 ────────────────────────────────────────────────────────────────────

async function readImage(
  file: File,
  opts: ReadMaterialOptions,
): Promise<PageReadOutcome> {
  const startedAt = Date.now();
  const prepared = await preparePhotoBlob(file);
  const read = await requestMaterialText(
    {
      images: [
        {
          index: 0,
          mimeType: prepared.mimeType,
          base64: await blobToBase64(prepared.blob),
        },
      ],
      kind: "IMAGE",
      name: file.name,
    },
    opts.signal,
  );
  logRead("FILE_IMAGE", {
    totalPages: 1,
    scopedPages: 1,
    densePages: 0,
    scannedPages: 1,
    ocrCalls: 1,
    ocrFailed: 0,
    elapsedMs: Date.now() - startedAt,
  });
  return {
    text: read.text,
    role: read.role,
    layout: read.layout,
    warning: read.truncated
      ? "사진이 길어 일부가 잘렸어요 — 나눠서 올려 주세요."
      : undefined,
  };
}

/**
 * 사진을 전송 가능한 크기로 만든다.
 *
 * 축소 판단은 **파일 크기가 아니라 긴 변 픽셀**로 한다. 예전 조건(≤5MB 면 원본
 * 통과)은 4032×3024 폰 사진(3MB 대)을 그대로 통과시켰고, 그 한 장이 이미지 토큰
 * 6,192개를 먹었다(768×768 타일당 258토큰). 긴 변 1800px 이면 활자 판독에 충분하고
 * 토큰은 약 1/4 이다. 크기 상한은 2차 안전핀으로 남긴다(1800px PNG 도 클 수 있다).
 */
async function preparePhotoBlob(
  file: File,
): Promise<{ blob: Blob; mimeType: string }> {
  const mime = normalizeImageMime(file);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // 치수를 못 재는 사진도 있다(브라우저 디코더 편차). 그때만 예전 기준으로 판단.
    if (mime && file.size <= MAX_PAGE_IMAGE_BYTES) {
      return { blob: file, mimeType: mime };
    }
    throw new Error(
      `${file.name}: 사진을 열지 못했어요. JPG·PNG 로 저장해 다시 올려 주세요.`,
    );
  }

  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (mime && longEdge <= MAX_IMAGE_LONG_EDGE && file.size <= MAX_PAGE_IMAGE_BYTES) {
    bitmap.close();
    return { blob: file, mimeType: mime };
  }

  const ratio = Math.min(1, MAX_IMAGE_LONG_EDGE / longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("사진을 변환하지 못했어요. 다시 시도해 주세요.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("사진을 변환하지 못했어요. 다시 시도해 주세요.");
  return { blob, mimeType: "image/jpeg" };
}

/** 서버는 JPG·PNG·WEBP 만 받는다. file.type 이 비었거나 비표준이면 확장자로 정한다. */
function normalizeImageMime(file: File): string | null {
  const mime = (file.type || "").toLowerCase();
  if ((ACCEPTED_IMAGE_MIMES as readonly string[]).includes(mime)) return mime;
  const ext = extensionOf(file);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

// ── 서버 판독 호출 ──────────────────────────────────────────────────────────

/** 판독 라우트의 응답 — 텍스트 + 같은 콜의 꼬리줄(추가 과금 0) + 잘림 신호. */
interface MaterialTextResponse {
  text: string;
  role?: MaterialRole;
  layout?: MaterialLayout;
  truncated: boolean;
}

async function requestMaterialText(
  payload: { images: PageImage[]; kind: "PDF_PAGES" | "IMAGE"; name: string },
  signal?: AbortSignal,
): Promise<MaterialTextResponse> {
  const response = await fetch(READ_MATERIAL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // index 는 클라이언트 내부 좌표라 서버 계약(mimeType·base64)에 싣지 않는다.
    body: JSON.stringify({
      images: payload.images.map((image) => ({
        mimeType: image.mimeType,
        base64: image.base64,
      })),
      kind: payload.kind,
      name: payload.name,
    }),
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
    role?: string;
    layout?: string;
    truncated?: boolean;
  };
  if (!response.ok) {
    throw new Error(
      data.error || "자료 판독에 실패했어요. 잠시 후 다시 시도해 주세요.",
    );
  }
  // 축은 schema.ts 가 정본이다 — 여기서 목록을 복제하면 역할이 늘 때 조용히 갈린다.
  return {
    text: typeof data.text === "string" ? data.text : "",
    role: (MATERIAL_ROLES as readonly string[]).includes(data.role ?? "")
      ? (data.role as MaterialRole)
      : undefined,
    layout: (MATERIAL_LAYOUTS as readonly string[]).includes(data.layout ?? "")
      ? (data.layout as MaterialLayout)
      : undefined,
    truncated: data.truncated === true,
  };
}

// ── 하이브리드: 원본 페이지 업로드 ──────────────────────────────────────────

export interface MaterialPageUpload {
  /** 업로드된 페이지 이미지 묶음의 **경로 접두사**(schema.storagePath 에 그대로 넣는다). */
  storagePath: string;
  /**
   * 실제로 올린 페이지 수. **서버가 이 값을 믿고 경로를 조립하지는 않는다** —
   * run-job.listPageObjects 가 프리픽스를 list 해서 실린 것만 센다(티켓을 끊었다고
   * 업로드가 됐다는 뜻이 아니기 때문이다). 이 값은 화면 표시용 사실이다.
   */
  pageCount: number;
}

/**
 * 서명 업로드가 받는 MIME. **page-uploads 라우트의 zod enum·확장자 매핑과 같은
 * 목록**이며, 그 확장자는 run-job.PAGE_IMAGE_EXT 가 인식하는 것만 나온다.
 */
type PageUploadContentType = "image/jpeg" | "image/png" | "image/webp";

/**
 * 블롭의 **실제** MIME 을 업로드 계약 값으로 좁힌다.
 *
 * 왜 "image/jpeg" 로 못 박으면 안 되나: preparePhotoBlob 은 긴 변 1800px 이하이고
 * 5MB 이하인 사진을 **원본 그대로** 돌려준다 — PNG·WebP 원본이 그대로 나온다.
 * 그걸 image/jpeg 라고 신고하면 서버가 `0000.jpg` 경로를 끊고, run-job.pageMediaType
 * 이 확장자만 보고 image/jpeg 라고 모델에 신고한다(바이트는 PNG인데 라벨은 JPEG).
 * 지금은 ai-sdk 가 매직바이트를 다시 스니핑해 라벨을 고쳐 주는 덕에 증상이 없지만,
 * 그건 우리 계약이 아니라 남의 구현에 기댄 것이다 — 여기서 사실대로 신고한다.
 */
function toPageUploadContentType(mime: string): PageUploadContentType {
  const value = mime.toLowerCase();
  if (value === "image/png") return "image/png";
  if (value === "image/webp") return "image/webp";
  return "image/jpeg";
}

/**
 * 사용자가 '원본 페이지도 함께 보냄'을 켰을 때, 보낼 페이지 JPEG 를 서명 URL 로
 * 직접 업로드하고 경로를 돌려준다.
 *
 * 왜 스토리지를 거치나: 이미지 바이트를 생성 요청 본문에 실으면 Vercel 4.5MB 벽에
 * 그대로 부딪힌다(next.config 의 bodySizeLimit 10mb 는 Server Actions 전용이라 API
 * Route 에는 적용되지 않는다). 요청에는 **경로 문자열만** 싣고, 실제 바이트는 서버가
 * after() 안에서 downloadAsBuffer 로 읽는다.
 *
 * 왜 판독 때 만든 JPEG 를 재활용하지 않나: 판독은 "글자가 없는 쪽"만 굽는데, 함께
 * 보내야 할 쪽은 보통 그 반대(표·도식이 있는 앞쪽)다. 원본 File 을 그대로 다시 굽는
 * 편이 상태를 들고 다니지 않아 단순하고, 켜는 순간에만 비용이 든다.
 */
export async function uploadMaterialPageImages(args: {
  /** 자료 id — 서버가 경로를 만들 때 쓴다. */
  materialId: string;
  file: File;
  sourceKind: MaterialSourceKind;
  /** 올릴 페이지 수 상한(기본 MAX_SEND_PAGES). */
  maxPages?: number;
  onProgress?: (label: string) => void;
  signal?: AbortSignal;
}): Promise<MaterialPageUpload> {
  const cap = Math.max(1, Math.min(args.maxPages ?? MAX_SEND_PAGES, MAX_SEND_PAGES));
  if (!canSendPages(args.sourceKind)) {
    throw new Error("이 자료는 원본 페이지를 함께 보낼 수 없어요.");
  }

  args.onProgress?.("원본 페이지를 준비하는 중…");
  /** 올릴 페이지 — 바이트와 **실제** MIME 을 한 쌍으로 들고 다닌다(위 함수 주석). */
  const pages: Array<{ blob: Blob; contentType: PageUploadContentType }> = [];
  let slots: Awaited<ReturnType<typeof splitPdfToImages>> | null = null;
  try {
    if (args.sourceKind === "FILE_PDF") {
      slots = await splitPdfToImages(args.file, {
        scale: PDF_MATERIAL_RENDER_SCALE,
        jpegQuality: PDF_MATERIAL_JPEG_QUALITY,
        maxPages: cap,
        signal: args.signal,
      });
      // splitPdfToImages 는 언제나 canvas.toBlob("image/jpeg") 로 굽는다.
      // 배열 순서 = 쪽 순서이며(resolveTargetPages 가 오름차순 정렬), 그 순서가
      // 그대로 파일명 0000·0001… 이 되어 서버의 이름 오름차순 정렬과 맞물린다.
      for (const slot of slots) {
        pages.push({ blob: slot.blob, contentType: "image/jpeg" });
      }
    } else {
      const prepared = await preparePhotoBlob(args.file);
      pages.push({
        blob: prepared.blob,
        contentType: toPageUploadContentType(prepared.mimeType),
      });
    }

    throwIfAborted(args.signal);
    const response = await fetch(PAGE_UPLOAD_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        materialId: args.materialId,
        pages: pages.map((page, index) => ({
          index,
          contentType: page.contentType,
        })),
      }),
      signal: args.signal,
    });
    const data = (await response.json().catch(() => ({}))) as {
      prefix?: string;
      targets?: Array<{ index: number; uploadUrl: string; path: string }>;
      error?: string;
    };
    if (!response.ok || !data.prefix || !data.targets) {
      throw new Error(
        data.error || "원본 페이지를 올리지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }

    const byIndex = new Map(data.targets.map((t) => [t.index, t] as const));
    for (let index = 0; index < pages.length; index += 1) {
      throwIfAborted(args.signal);
      const target = byIndex.get(index);
      if (!target) throw new Error("원본 페이지 업로드 대상이 없어요.");
      const page = pages[index];
      args.onProgress?.(`원본 ${index + 1}/${pages.length}쪽 올리는 중…`);
      const put = await fetch(target.uploadUrl, {
        method: "PUT",
        body: page.blob,
        // 티켓을 끊을 때 신고한 값과 **같은 값**이어야 한다 — 서버가 그 값으로
        // 확장자를 정했고, 서버는 그 확장자로 다시 mediaType 을 복원한다.
        headers: { "content-type": page.contentType, "x-upsert": "true" },
        signal: args.signal,
      });
      if (!put.ok) {
        throw new Error(`원본 ${index + 1}쪽을 올리지 못했어요 (${put.status}).`);
      }
    }

    return { storagePath: data.prefix, pageCount: pages.length };
  } finally {
    if (slots) revokeSlotUrls(slots);
  }
}

// ── 판독 성공률 로그 ────────────────────────────────────────────────────────

/**
 * sourceKind 별·쪽 dense 별 결과를 콘솔에 남긴다. 하이브리드에 얼마나 더 투자할지
 * (텍스트 레이어 직독 성공률이 90%대면 우선순위가 내려가고, 50%대면 즉시 착수다)를
 * 정할 **유일한 데이터**다. 개인정보가 없는 숫자만 남긴다 — 본문·파일명은 넣지 않는다.
 */
function logRead(
  sourceKind: MaterialSourceKind,
  stats: {
    totalPages: number;
    scopedPages: number;
    densePages: number;
    scannedPages: number;
    ocrCalls: number;
    ocrFailed: number;
    elapsedMs: number;
  },
): void {
  const denseRatio =
    stats.scopedPages > 0
      ? Math.round((stats.densePages / stats.scopedPages) * 100)
      : 0;
  console.info("[passage-authoring:read]", {
    sourceKind,
    ...stats,
    denseRatioPercent: denseRatio,
  });
}

// ── 잡동사니 ────────────────────────────────────────────────────────────────

function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf(".");
  return dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "");
}

function countReplacementChars(text: string): number {
  return (text.match(/�/g) ?? []).length;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("이미지를 읽지 못했어요. 다시 시도해 주세요."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : "");
    };
    reader.readAsDataURL(blob);
  });
}
