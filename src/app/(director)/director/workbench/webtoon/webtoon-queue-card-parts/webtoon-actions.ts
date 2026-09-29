import { toast } from "sonner";
import type { WebtoonRow } from "../webtoon-page-types";

// ============================================================================
// 웹툰 카드·상세 미리보기가 공유하는 동작 — 표시 URL · 다운로드 · 인쇄.
// ============================================================================

/** 자막 편집본(export)이 있으면 그것을, 없으면 원본 이미지를 보여준다. */
export function displayUrl(item: WebtoonRow): string | null {
  return item.editedImageUrl || item.imageUrl;
}

export function downloadHref(item: WebtoonRow): string {
  return `/api/webtoons/${item.id}/download`;
}

export function downloadImage(item: WebtoonRow): void {
  window.location.href = downloadHref(item);
}

// A4 세로 인쇄 가능 영역 = 210×297mm − 여백 10mm×2 = 190×277mm.
// 높이는 2mm 여유를 둬(275mm) 반올림 오차로 빈 2쪽이 붙는 것을 막는다.
const PRINT_STYLE =
  "@page{size:A4 portrait;margin:10mm}" +
  "html,body{margin:0;padding:0;background:#fff}" +
  "img{display:block;margin:0 auto;width:auto;height:auto;" +
  "max-width:190mm;max-height:275mm;break-inside:avoid;page-break-inside:avoid}";

/**
 * 웹툰 한 장(세로 9:16 스트립)을 A4 한 쪽에 맞춰 인쇄한다.
 *
 * 예전 구현은 `window.open("", "_blank", "noopener,noreferrer")` 였는데, noopener 를
 * 주면 스펙상 반환값이 항상 null 이라 인쇄가 한 번도 실행되지 않았다. 자막 편집기의
 * 인쇄와 같이 화면 밖 숨김 iframe 에 이미지를 싣고 로드가 끝나면 print() 한다 —
 * 팝업 차단에도 걸리지 않고 현재 탭에서 바로 인쇄 대화상자가 뜬다.
 */
export function printImage(item: WebtoonRow): void {
  const url = displayUrl(item);
  if (!url) return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => {
    // 여러 번 호출돼도 안전.
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const win = iframe.contentWindow;
  const idoc = win?.document;
  if (!win || !idoc) {
    cleanup();
    toast.error("인쇄를 준비하지 못했어요. 다시 시도해 주세요.");
    return;
  }

  const title = item.passage.title.replace(/[<>&"]/g, "");
  idoc.open();
  idoc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>${PRINT_STYLE}</style></head><body></body></html>`,
  );
  idoc.close();

  // 이미지는 문자열 삽입 대신 DOM 으로 만든다(URL 속 따옴표·& 이스케이프 불필요).
  // 리스너를 src 지정 전에 달아야 캐시 히트여도 load 를 놓치지 않는다.
  const img = idoc.createElement("img");
  img.alt = title;
  img.addEventListener(
    "load",
    () => {
      // 인쇄 대화상자가 닫힌 뒤 정리. afterprint 는 print() 전에 달아야 동기
      // 대화상자(크롬)에서도 놓치지 않는다. afterprint 가 안 와도 타임아웃으로 정리.
      win.addEventListener("afterprint", () => window.setTimeout(cleanup, 500), {
        once: true,
      });
      window.setTimeout(cleanup, 60_000);
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
        toast.error("인쇄 대화상자를 열지 못했어요.");
      }
    },
    { once: true },
  );
  img.addEventListener(
    "error",
    () => {
      cleanup();
      toast.error("인쇄할 이미지를 불러오지 못했어요.");
    },
    { once: true },
  );
  img.src = url;
  idoc.body.appendChild(img);
}
