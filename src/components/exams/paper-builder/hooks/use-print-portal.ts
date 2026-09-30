import { useEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { PAPER_SIZE_SPECS } from "../constants";
import {
  EXAM_PRINT_BODY_CLASS,
  EXAM_PRINT_HOST_ID,
  claimPrintPortal,
  currentPrintPortalClaim,
  dropPrintPortalClaim,
  isPrintLayoutActive,
  settleStalePrintPortal,
} from "../print/print-portal-registry";
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

/**
 * 【개발 전용 단언】 포털을 태운 직후(= 전 쪽 마운트 flushSync 직후) 루트 안에 아직
 * `.exam-a4-page` 가 없는 본문 프레임이 남았으면 그 쪽이 **백지로 인쇄된다**. 운영에서는
 * print-styles 의 경고 문구가 종이에 찍히고, 개발에서는 여기서 쪽 인덱스를 콘솔에 찍는다.
 */
function reportUnmountedPrintFrames(root: HTMLElement) {
  const missing: number[] = [];
  root.querySelectorAll<HTMLElement>("[data-exam-page-index]").forEach((frame) => {
    if (!frame.querySelector(".exam-a4-page")) missing.push(Number(frame.dataset.examPageIndex));
  });
  if (missing.length === 0) return;
  console.error(
    `[usePrintPortal] 인쇄 포털을 태웠는데 ${missing.length}쪽이 마운트되지 않았습니다(쪽 인덱스 ${missing.join(", ")}) — ` +
      "그 쪽은 백지로 인쇄됩니다. 호스트가 usePrintPortal 의 반환값을 PreviewPages forceMountAll 에 OR 했는지 확인하세요.",
  );
}

/**
 * 【전 쪽 마운트 소유권 계약 — 26-09-29】
 * 반환값 `printMountAll` 은 **이 훅이 포털을 실제로 태웠을 때만**(아래 beforePrint 가 판정을
 * 모두 통과해 루트를 `#exam-print-host` 로 옮긴 직후) `flushSync` 로 true 가 되고, afterprint 에서
 * false 로 돌아간다. 호스트는 이것을 `PreviewPages forceMountAll` 에 OR 한다.
 *  - 비켜선 인쇄(숨은 스튜디오 빌더 · 남의 학습지 인쇄 · 다른 인스턴스의 루트)에서는 false 그대로다
 *    → 헛마운트 0. (종전 `usePrintMountAll` 은 판정 없이 모든 beforeprint 에서 전 쪽을 그렸다.)
 *  - 같은 동기 커밋 안에서 LazyPaperPage(렌더에서 `mounted || forceMount`) → 넘침 가드 layout
 *    effect 가 돈다 — Ctrl+P · 브라우저 메뉴 · printToPDF 처럼 **기다릴 수 없는 경로**의 동기 안전망.
 *  - 버튼 인쇄는 print/use-exam-print-controller 가 print() 전에 이미 전 쪽을 그려 둔다(이중 안전).
 * 랜딩 데모 2곳은 반환값을 무시한다(픽스처 2쪽 eager) — 반환 추가는 순수 additive.
 *
 * `options.rootRef`(선택): 호스트가 자기 `#exam-paper-print-root` 요소를 넘기면, 첫 매칭 루트가
 * **내 것이 아닐 때** 이 인스턴스는 비켜선다(아래 (3)). 두 인스턴스가 동시에 마운트된 경우(빠른보기
 * 닫힘 애니메이션 중 카드 인쇄 대화상자 등) 남의 루트를 옮기거나 두 번 옮겨 afterprint 복원이 루트를
 * 떼어 낸 호스트 안에 묻는 일을 막고, 전 쪽 마운트가 **실제로 인쇄되는 인스턴스**에 걸리게 한다.
 * 넘기지 않으면 종전과 한 글자도 다르지 않다.
 */
export function usePrintPortal(
  paperSize: PaperSize = "A4",
  options: { rootRef?: RefObject<HTMLElement | null> } = {},
): boolean {
  const { rootRef } = options;
  const [printMountAll, setPrintMountAll] = useState(false);

  useEffect(() => {
    const paperSpec = PAPER_SIZE_SPECS[paperSize];
    const paperWidth = `${paperSpec.widthMm}mm`;
    const PRINT_BODY_CLASS = EXAM_PRINT_BODY_CLASS;
    let originalParent: HTMLElement | null = null;
    let originalNextSibling: Node | null = null;
    let originalRootInlineStyle = "";
    let printHost: HTMLDivElement | null = null;
    // 이 인스턴스가 이번 인쇄에서 전 쪽 마운트를 켰는가 — afterprint 에서 자기 것만 끈다.
    let mountedAllForPrint = false;
    // 이 인스턴스가 옮긴 루트 그 자체. afterprint 에서 getElementById 로 다시 찾으면, 루트가 body 끝
    // 호스트로 가 있는 동안 **다른 인스턴스의 루트**가 첫 매칭이 되어 엉뚱한 요소를 되돌린다.
    let portaledRoot: HTMLElement | null = null;

    function beforePrint(event: Event) {
      // ── (0) 남은 포털 자가 치유 + 판정 (3) 앞 절반 ─────────────────────────────────────────
      // 이번 인쇄 사건에 이미 선 포털이 있으면 비켜서고(아래 (3) 주석), 지난 인쇄의 잔재(afterprint 누락 ·
      // 주인 없는 호스트)는 여기서 치운 뒤 판정을 이어 간다 — 남은 호스트 하나가 이후 모든 포털을 영구히
      // 막지 않게(26-09-30 PRINT-R7). 치우기가 루트를 제자리로 돌리므로 아래 첫 매칭 조회보다 먼저 한다.
      if (settleStalePrintPortal(document, event) === "same-print") return;
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
      //
      // ── (3) 인스턴스가 둘 이상일 때 — 이번 인쇄의 포털은 **한 번만, 주인만** 태운다 ──────
      // 앞선 인스턴스가 루트를 body 끝 호스트로 옮기면 getElementById 첫 매칭이 **다음 인스턴스의
      // 루트**로 바뀐다. 그대로 두면 다음 리스너가 그 루트까지 두 번째 호스트로 옮겨 두 시험지가 한
      // 인쇄에 같이 찍힌다(26-09-29 하네스 실측). 그래서 **이번 사건에** 선 호스트가 있으면 비켜서고(위 (0) 의
      // "same-print" — 같은 beforeprint Event 객체로 가른다), rootRef 를 넘긴 호스트는 첫 매칭이 내 루트일 때만
      // 태운다(주인 인스턴스의 리스너가 따로 돈다). 지난 인쇄의 호스트는 (0) 이 이미 치웠다.
      if (rootRef && rootRef.current !== root) return;

      portaledRoot = root;
      originalParent = root.parentElement;
      originalNextSibling = root.nextSibling;
      originalRootInlineStyle = root.getAttribute("style") || "";

      printHost = document.createElement("div");
      printHost.id = EXAM_PRINT_HOST_ID;
      printHost.style.cssText =
        `position:fixed;left:0;top:0;width:${paperWidth};height:auto;z-index:2147483647;background:white;margin:0;padding:0;`;

      document.body.appendChild(printHost);
      printHost.appendChild(root);
      // 이번 사건의 포털로 기록 — 같은 사건의 다른 인스턴스는 비켜서고, 다음 인쇄까지 afterprint 가 안 오면
      // 다음 사건(또는 새 인쇄 요청)이 이 기록의 원복(afterPrint)을 불러 치운다.
      claimPrintPortal({ host: printHost, event, release: afterPrint });

      root.setAttribute(
        "style",
        `width:${paperWidth};max-width:${paperWidth};height:auto;padding:0;margin:0;overflow:visible;background:white;display:block;`,
      );

      document.body.classList.add(PRINT_BODY_CLASS);

      // ── 전 쪽 마운트 — 포털을 **실제로 태운 지금만** ─────────────────────────────
      // 브라우저는 이 핸들러가 끝나자마자 인쇄 레이아웃을 뜬다 → useEffect 로 미룬 마운트는
      // 인쇄에 못 들어간다(26-09-29 실측 printToPDF 3/29쪽). 그래서 flushSync 로 동기 커밋한다
      // (이벤트 핸들러 안이라 렌더 중 호출이 아니다). 같은 커밋 안에서 넘침 가드도 수렴한다.
      mountedAllForPrint = true;
      flushSync(() => setPrintMountAll(true));
      if (process.env.NODE_ENV !== "production") reportUnmountedPrintFrames(root);
    }

    function afterPrint() {
      if (mountedAllForPrint) {
        mountedAllForPrint = false;
        setPrintMountAll(false);
      }
      const root = portaledRoot ?? document.getElementById("exam-paper-print-root");
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
      dropPrintPortalClaim(printHost);
      document.body.classList.remove(PRINT_BODY_CLASS);
      originalParent = null;
      originalNextSibling = null;
      originalRootInlineStyle = "";
      printHost = null;
      portaledRoot = null;
    }

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      // 【PRINT-R7】 인쇄 도중(beforeprint 뒤 · afterprint 전) 언마운트 · 의존성 변경 — 모바일 비차단 인쇄 뒤
      // 화면 이동, 인쇄 대화상자 닫힘 등. 리스너를 뗐으니 afterprint 는 더 오지 않는다 → 원복을 여기서 책임진다. 안 하면
      // 루트가 body 끝 고정 호스트(z-index 최상위)에 남아 화면을 덮고 body.exam-print-active 가 다음 인쇄를 망친다.
      // 내 포털이 서 있을 때만 — 남의 인쇄 중인 body 클래스는 건드리지 않는다.
      if (!portaledRoot && !printHost) return;
      // 【PH-R1 · 26-09-30】 단, 문서가 **지금 인쇄 레이아웃으로 그려지는 중**이면 걷지 않는다. 네이티브 인쇄(Ctrl+P ·
      // 브라우저 메뉴 · printToPDF)는 인쇄 폭(A4 794px)으로 매체 질의를 다시 평가하고, 랜딩 PC 데모의 DemoGate
      // (`(min-width: 1024px)`)가 그 사이에 데모를 언마운트한다 — 여기서 즉시 원복하면 캡처 전에 포털이 사라져 PDF 에
      // 데모 시험지 대신 랜딩 히어로가 찍혔다(리뷰 A/B 실측). 그래서 원복을 **그 인쇄의 afterprint** 로 미룬다(한 번).
      // 기록(claim)의 원복도 같은 함수로 바꿔 둔다 — afterprint 가 끝내 안 오면 다음 beforeprint · 새 인쇄 잡의
      // settleStalePrintPortal 이 이것을 불러 치우고, 그때 미룬 리스너도 함께 뗀다. 화면이 다시 상호작용 중이면
      // (모바일 비차단 print() 가 돌아온 뒤 대화상자 닫힘 · 화면 이동 = R7) 인쇄 레이아웃이 아니므로 종전대로 즉시 원복한다.
      if (isPrintLayoutActive(window)) {
        const deferredHost = printHost;
        const finishDeferred = () => {
          window.removeEventListener("afterprint", finishDeferred);
          afterPrint();
        };
        window.addEventListener("afterprint", finishDeferred);
        const mine = currentPrintPortalClaim();
        if (deferredHost && mine && mine.host === deferredHost) {
          claimPrintPortal({ host: deferredHost, event: mine.event, release: finishDeferred });
        }
        return;
      }
      afterPrint();
    };
  }, [paperSize, rootRef]);

  return printMountAll;
}
