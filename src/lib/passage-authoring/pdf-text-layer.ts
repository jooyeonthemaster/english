"use client";

// ============================================================================
// PDF 텍스트 레이어 직독 — 래스터화·OCR 없이 원문 글자를 그대로 꺼낸다.
//
// 왜 이게 필요한가 (이전 설계의 실패):
//   자료 판독의 PDF 경로는 원래 자료추출 파이프라인(splitPdfToImages)을 그대로
//   재사용했다. 그 파이프라인은 "시험지에서 지문 영역을 눈으로 보고 잘라내는"
//   기능용이라 이미지가 **필요한** 물건이다. 그런데 참고자료를 텍스트로 읽어들이는
//   데에는 이미지가 전혀 필요 없다. 그 결과:
//     · 어법 교재·단어장 PDF 는 대부분 텍스트 레이어가 살아 있는 디지털 PDF인데,
//       그걸 JPEG 로 구워 비전 모델에 OCR 시켰다 — **정확한 글자를 추측으로 바꿨다.**
//       철자와 어법 표시가 생명인 자료에서 정확도를 스스로 떨어뜨린 셈이다.
//     · 20쪽이면 비전 호출 5회. 돈을 내고 품질을 깎았다.
//   → 텍스트 레이어가 있으면 **API 호출 0회, 원문 그대로**.
//
// ── 판정을 문서 단위에서 **쪽 단위**로 내린다 (이번 변경) ────────────────────
// 예전에는 "글자가 잡힌 쪽 비율 ≥ 60%" 면 문서 전체를 텍스트로, 아니면 문서 전체를
// OCR 로 보냈다(TEXT_LAYER_PAGE_RATIO — 삭제됨). 전부-아니면-전무라 실제 교재에서
// 두 방향으로 동시에 틀렸다:
//   · 텍스트 5쪽 + 스캔 5쪽(비율 50%) → 멀쩡한 5쪽까지 통째로 OCR. 원문을 버리고
//     추측을 샀다.
//   · 텍스트 7쪽 + 스캔 3쪽(비율 70%) → 스캔 3쪽이 **조용히 사라졌다**. 화면에는
//     성공으로 보였고 뒷장 내용만 없었다.
// 이제 이 모듈은 판정하지 않는다. 쪽마다 {index, text, dense, tableLike} 를 그대로
// 돌려주고, 어느 쪽을 OCR 로 보낼지는 호출부(material-readers.readPdf)가 정한다.
//
// tableLike 가 왜 여기 실리나: 전 쪽이 dense 면 호출부는 네트워크 0회로 조기 반환하고
// 판독 라우트의 `[[LAYOUT=…]]` 꼬리줄을 **아예 못 받는다**. 그러면 표가 가득한 디지털
// 교재가 하이브리드 기본 OFF 가 된다(원본 페이지가 가장 필요한 자료인데도). 그래서
// 같은 조각 배열로 detectTableLayout(순수 함수, 호출 0회)을 한 번 더 돌려 그 신호를
// 쪽 단위 사실로 함께 싣는다.
//
// 줄 복원 로직 자체는 pdf-line-reconstruct.ts(순수 함수)로 뺐다 — 실제 교재 PDF 로
// Node 에서 그대로 검증할 수 있어야 하기 때문이다. 이 파일은 브라우저 배관만 맡는다.
// ============================================================================

import { loadPdfjs } from "@/lib/extraction/pdf-splitter";
import {
  denseLength,
  detectTableLayout,
  reconstructPdfLines,
} from "./pdf-line-reconstruct";

/** 한 페이지가 "글자가 있는 페이지"로 인정받는 최소 글자 수(공백 제외). */
const MIN_CHARS_PER_TEXT_PAGE = 30;

/**
 * 텍스트 레이어는 공짜라 페이지 수를 조일 이유가 없다. 다만 병리적으로 큰 문서가
 * 탭을 얼리는 것만 막는다(비전 경로의 20쪽 상한과는 성격이 다르다).
 */
const MAX_TEXT_LAYER_PAGES = 120;

export interface PdfTextLayerPage {
  /** 0-based 페이지 인덱스. splitPdfToImages 의 pageIndex 와 같은 좌표계다. */
  index: number;
  /** 줄 구조를 복원한 이 쪽의 본문. dense=false 면 거의 비어 있다. */
  text: string;
  /** 글자가 충분히 잡혔는가 — false 면 호출부가 이 쪽만 OCR 로 보낸다. */
  dense: boolean;
  /**
   * 이 쪽이 **표 지면**인가(detectTableLayout, 모델 호출 0회).
   *
   * 텍스트 직독 경로는 판독 라우트를 타지 않아 `[[LAYOUT=…]]` 꼬리줄이 없다.
   * 그 자리를 메우는 값이며, 호출부가 하이브리드(원본 페이지 함께 보내기) 기본값을
   * 정하는 근거로 쓴다. 글자가 안 잡힌 쪽은 판정 근거 자체가 없으므로 언제나 false
   * 다 — 그 쪽의 지면 형태는 OCR 라우트의 꼬리줄이 답한다.
   */
  tableLike: boolean;
}

export interface PdfTextLayerResult {
  /** 훑은 쪽 전부(0-based 오름차순). 텍스트가 없는 쪽도 dense=false 로 들어온다. */
  pages: PdfTextLayerPage[];
  totalPages: number;
  /** 실제로 훑은 쪽 수(= pages.length). totalPages 보다 작을 수 있다. */
  readPages: number;
  /** 글자가 충분히 잡힌 쪽 수. */
  textPages: number;
  /** 사용자에게 알릴 주의(뒷부분을 못 읽었다 등). */
  warning?: string;
}

/**
 * PDF 의 텍스트 레이어를 읽는다. 네트워크 호출 없음 — 전부 브라우저 안에서 끝난다.
 * 실패하면 던지지 않고 **빈 pages** 로 돌려준다(호출부가 OCR 로 폴백하면 되고,
 * 여기서 던지면 멀쩡히 스캔 PDF 를 처리할 수 있는 경로까지 죽는다).
 */
export async function extractPdfTextLayer(
  file: File,
  opts: {
    onProgress?: (label: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<PdfTextLayerResult> {
  const empty: PdfTextLayerResult = {
    pages: [],
    totalPages: 0,
    readPages: 0,
    textPages: 0,
  };

  let pdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]>["promise"]>;
  try {
    const pdfjs = await loadPdfjs();
    const buffer = await file.arrayBuffer();
    pdf = await pdfjs.getDocument({ data: buffer }).promise;
  } catch {
    return empty;
  }

  try {
    const totalPages = pdf.numPages;
    const readPages = Math.min(totalPages, MAX_TEXT_LAYER_PAGES);
    const pages: PdfTextLayerPage[] = [];
    let textPages = 0;

    for (let pageNum = 1; pageNum <= readPages; pageNum += 1) {
      if (opts.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      opts.onProgress?.(`PDF ${pageNum}/${readPages}쪽 읽는 중…`);
      let pageText = "";
      let tableLike = false;
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        // 같은 조각 배열을 둘 다에 넘긴다 — 두 함수 모두 입력을 변형하지 않는다.
        const spans = withFontNames(page, content);
        pageText = reconstructPdfLines(spans);
        tableLike = detectTableLayout(spans);
      } catch {
        // 한 쪽이 깨져도 문서 전체를 버리지 않는다 — 그 쪽만 비운다.
        pageText = "";
        tableLike = false;
      }
      const dense = denseLength(pageText) >= MIN_CHARS_PER_TEXT_PAGE;
      if (dense) textPages += 1;
      // 글자가 안 잡힌 쪽의 표 판정은 근거가 없다(조각이 거의 없으니 어차피 false 가
      // 나오지만, 계약을 코드로 못 박아 둔다).
      pages.push({ index: pageNum - 1, text: pageText, dense, tableLike: dense && tableLike });
    }

    const warning =
      totalPages > readPages
        ? `${totalPages}쪽 중 앞 ${readPages}쪽만 읽었어요. 뒷부분이 필요하면 파일을 나눠 올려 주세요.`
        : undefined;

    return { pages, totalPages, readPages, textPages, warning };
  } finally {
    // pdfjs 문서 핸들은 워커 쪽 메모리를 잡고 있다. 안 놓으면 PDF 를 몇 개
    // 붙이는 것만으로 탭 메모리가 계단식으로 는다.
    void pdf.destroy?.();
  }
}

// ── 폰트 이름 해석 ──────────────────────────────────────────────────────────

/** getTextContent() 응답 중 여기서 실제로 쓰는 부분만 구조적으로 좁힌다. */
interface TextContentLike {
  items: readonly unknown[];
  styles?: Record<string, { fontFamily?: string } | undefined>;
}

/** commonObjs 는 pdfjs 타입에 노출되지 않는 내부 저장소라 구조로만 좁혀 쓴다. */
interface PageLike {
  commonObjs?: {
    has?: (id: string) => boolean;
    get?: (id: string) => unknown;
  };
}

/**
 * pdfjs 의 `TextItem.fontName` 은 "g_d0_f1" 같은 **내부 id** 다. 그대로 두면
 * 굵게 판정이 항상 false 가 되므로 여기서 실제 폰트 이름으로 바꿔 넘긴다.
 *   1순위: commonObjs 에 적재된 폰트 객체의 name("ABCDEE+Arial-BoldMT")
 *   2순위: textContent.styles[id].fontFamily
 * 둘 다 없으면 필드를 붙이지 않는다 — 강조 표시가 빠질 뿐 본문은 그대로다.
 *
 * ※ 원본 item 을 변형하지 않고 얕은 복사본을 만든다(pdfjs 내부 캐시를 건드리면
 *   같은 페이지를 다시 읽을 때 값이 오염된다).
 */
function withFontNames(page: unknown, content: unknown): unknown[] {
  const typed = content as TextContentLike;
  const commonObjs = (page as PageLike).commonObjs;
  const styles = typed.styles ?? {};
  const resolved = new Map<string, string | undefined>();

  const resolve = (id: string): string | undefined => {
    if (resolved.has(id)) return resolved.get(id);
    let name: string | undefined;
    try {
      if (commonObjs?.has?.(id)) {
        const font = commonObjs.get?.(id) as { name?: unknown } | undefined;
        if (typeof font?.name === "string" && font.name) name = font.name;
      }
    } catch {
      // 폰트 객체가 아직 안 올라왔거나 워커가 회수한 경우 — 조용히 2순위로.
    }
    if (!name) {
      const family = styles[id]?.fontFamily;
      if (typeof family === "string" && family) name = family;
    }
    resolved.set(id, name);
    return name;
  };

  return (typed.items ?? []).map((item) => {
    const span = item as { fontName?: unknown } | null;
    if (!span || typeof span.fontName !== "string" || !span.fontName) return item;
    return { ...span, fontName: resolve(span.fontName) };
  });
}
