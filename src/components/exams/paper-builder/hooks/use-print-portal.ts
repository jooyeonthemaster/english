import { useEffect } from "react";
import { PAPER_SIZE_SPECS } from "../constants";
import type { PaperSize } from "../types";

/**
 * Hooks into the browser's beforeprint/afterprint events to move the exam
 * preview root into a body-level portal so nested overflow/positioning
 * containers don't clip the printed pages. Restores the DOM after print.
 */
/**
 * 화면에 살아 있는 **다른 인쇄 주체**(학습지/지문 분석 리포트의 인쇄 루트) 선택자.
 * `report-styles.ts:1855,1862,1874` 가 인쇄 화이트리스트를 세울 때 쓰는 것과 **같은 조건**을
 * 그대로 쓴다 — 미리보기 전용(`par-cover-preview`)·인쇄 제외(`par-print-exclude`) 루트는
 * 그쪽 CSS 도 인쇄에서 빼므로 경합 상대가 아니다.
 */
const FOREIGN_PRINT_ROOT_SELECTOR =
  ".par-root:not(.par-cover-preview):not(.par-print-exclude)";

/**
 * 【시험지 축 명시 인쇄 제외】 호스트가 「이 시험지 루트는 **지금 내 인쇄 대상이 아니다**」를
 * 스스로 선언하는 표식. 학습지 축의 `.par-print-exclude`(report-styles.ts:1855 ·
 * sheet-compose-surface.tsx:691 `printExclude: !active`)와 **동형**이고, 이 파일이 그것을
 * 보는 자리가 아래 beforePrint 의 첫 조기 반환이다.
 *
 * **왜 클래스가 아니라 data 속성인가**: 이 표식은 CSS 가 한 줄도 소비하지 않는다(가시성은
 * 호스트의 `hidden` 래퍼가 이미 담당). 클래스로 만들면 언젠가 누가 스타일을 걸어 「인쇄
 * 계약」과 「표시 계약」이 한 이름에 얽히고, 그때 한쪽을 고치면 다른 쪽이 조용히 깨진다.
 *
 * **왜 루트 자신이 아니라 조상에 붙는가**: `#exam-paper-print-root` 는 빌더 깊숙한 곳
 * (`exam-paper-builder-client.tsx:2896`)에서 렌더된다 — 임베드 호스트는 그 노드에 접근할
 * 수 없다. 그래서 호스트가 자기 표면 루트에 붙이고 여기서 `closest()` 로 거슬러 찾는다.
 */
const HOST_PRINT_OPT_OUT_SELECTOR = "[data-exam-print-exclude='true']";

export function usePrintPortal(paperSize: PaperSize = "A4") {
  useEffect(() => {
    const paperSpec = PAPER_SIZE_SPECS[paperSize];
    const paperWidth = `${paperSpec.widthMm}mm`;
    const PRINT_BODY_CLASS = "exam-print-active";
    let originalParent: HTMLElement | null = null;
    let originalNextSibling: Node | null = null;
    let originalRootInlineStyle = "";
    let printHost: HTMLDivElement | null = null;

    function beforePrint() {
      const root = document.getElementById("exam-paper-print-root");
      if (!root || !root.parentElement) return;

      // ── 【필수】 남의 인쇄를 가로채지 않는다(적대 검수 확정 결함) ──────────────
      // 이 리스너는 **window 전역 `beforeprint`** 라, 시험지 빌더가 화면에서 숨어 있어도
      // (클래스 스튜디오는 `examStudioOpen` 동안 `hidden` 으로 숨김 마운트를 유지한다 —
      // `studio-home-client.tsx:1969-1980`) 누가 인쇄하든 무조건 발화한다. 그대로 두면
      // `document.body.classList.add("exam-print-active")` → `print-styles.tsx:36-38`
      // `body.exam-print-active > *:not(#exam-print-host){display:none!important}` 가
      // **앱 루트 전체**를 죽여, 그 안에서 인쇄되던 학습지 조판(`.par-root`)이 사라진다.
      // 실측(Playwright, print 미디어 계산값): beforeprint 발화 전 `.par-root` 794x1123 →
      // 발화 후 0x0, `#exam-print-host` 자신도 report-styles 의 형제 제거 규칙
      // (`report-styles.ts:1862-1865`, 특이도 0,9,0)에 걸려 display:none → **완전 백지**.
      // 재현 경로: 문제관리 [시험지 조판] → 학습지 관리 뷰 전환 → [학습지 조판] → [인쇄].
      //
      // 비켜서는 근거는 **두 갈래**다(OR — 하나라도 참이면 포털을 태우지 않는다).
      //  (1) 호스트가 `data-exam-print-exclude="true"` 로 **명시 선언**했다.
      //  (2) 종전 휴리스틱: `!root.offsetParent`(시험지 루트가 display:none 서브트리
      //      = 내 인쇄가 아님. 이 루트는 어디서도 position:fixed 가 아니라 오탐이 없다 —
      //      `exam-paper-builder-client.tsx:2896-2911`·`exam-detail-paper-preview.tsx:634-637`)
      //      **그리고** 화면에 다른 인쇄 루트가 있다.
      //      (2) 의 뒷조건이 왜 붙어 있는가 — 이것이 없으면 랜딩 모바일 데모가 회귀한다.
      //      거기서는 인쇄 루트가 숨은 채(`step4-paper-mobile.tsx:151-158` compose 스텝이
      //      아닐 때 `hidden`) download 스텝의 [PDF로 인쇄] 버튼(:242-252)이 **의도적으로**
      //      이 포털에 기대어 인쇄한다. 경합 상대가 없으면 현행대로 포털을 태운다.
      //
      // ── (1) 호스트의 **명시 선언**이 있으면 무조건 비켜선다 ────────────────────
      // 【E24 F3-1 · 왜 이 조건이 (2) 와 별개로 필요한가】
      // (2) 는 「경합 상대가 화면에 **살아 있을 때만**」 발화하는 논리곱이다. E24 가
      // 자산 헤더를 3필 `[지문관리 | 학습지 조판 | 시험지 조판]` 로 해체하면서
      // 「조판을 열어 둔 채 다른 탭으로 나가기」가 **기본 동선**이 됐는데(E24-SPEC §1⑨),
      // 그중 [지문관리] 탭에는 `.par-root` 가 **아예 없다**. 그러면 (2) 는 거짓이고,
      // 보이지도 않는 시험지 빌더가 포털을 태워
      // `print-styles.tsx:36-38` `body.exam-print-active > *:not(#exam-print-host)
      // {display:none!important}` 가 **앱 루트를 통째로 지운다** — 사용자는 지문 목록을
      // 인쇄하려고 Ctrl+P 를 눌렀는데 숨어 있던 시험지가 인쇄된다(화면 이상 0 · 콘솔 0 ·
      // **종이/PDF 로만** 드러난다).
      //
      // 그래서 판정 재료를 「남이 있느냐」가 아니라 **「호스트가 뭐라고 선언했느냐」**로
      // 승격한다. 이것이 학습지 축이 이미 쓰는 계약(`printExclude: !active`)과 같은 모양이고,
      // 표식을 안 붙이는 호스트(랜딩 데모 · **독립 시험지 빌더 라우트**)는 한 글자도
      // 영향받지 않는 **순수 additive** 라 무회귀가 구조적으로 보장된다.
      //
      // ⚠ 이것을 「(2) 를 `!root.offsetParent` 단독으로 좁히면 (1) 이 필요 없다」로
      //   간소화하지 마라 — 아래 (2) 주석의 랜딩 모바일 데모가 **숨은 채 인쇄하는 것을
      //   의도**한다. 단독 판정으로 바꾸는 순간 그 [PDF로 인쇄] 버튼이 에러 0 · 콘솔 0 인
      //   채 죽는다(눌러도 빈 종이가 나온다).
      if (root.closest(HOST_PRINT_OPT_OUT_SELECTOR)) return;
      //
      // ── (2) 명시 선언이 없는 호스트를 위한 종전 휴리스틱(무회귀 보존) ──────────
      if (!root.offsetParent && document.querySelector(FOREIGN_PRINT_ROOT_SELECTOR)) {
        return;
      }

      originalParent = root.parentElement;
      originalNextSibling = root.nextSibling;
      originalRootInlineStyle = root.getAttribute("style") || "";

      printHost = document.createElement("div");
      printHost.id = "exam-print-host";
      printHost.style.cssText =
        `position:fixed;left:0;top:0;width:${paperWidth};height:auto;z-index:2147483647;background:white;margin:0;padding:0;`;

      document.body.appendChild(printHost);
      printHost.appendChild(root);

      root.setAttribute(
        "style",
        `width:${paperWidth};max-width:${paperWidth};height:auto;padding:0;margin:0;overflow:visible;background:white;display:block;`,
      );

      document.body.classList.add(PRINT_BODY_CLASS);
    }

    function afterPrint() {
      const root = document.getElementById("exam-paper-print-root");
      if (root && originalParent) {
        if (originalRootInlineStyle) root.setAttribute("style", originalRootInlineStyle);
        else root.removeAttribute("style");

        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
          originalParent.insertBefore(root, originalNextSibling);
        } else {
          originalParent.appendChild(root);
        }
      }
      if (printHost && printHost.parentElement) {
        printHost.parentElement.removeChild(printHost);
      }
      document.body.classList.remove(PRINT_BODY_CLASS);
      originalParent = null;
      originalNextSibling = null;
      originalRootInlineStyle = "";
      printHost = null;
    }

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [paperSize]);
}
