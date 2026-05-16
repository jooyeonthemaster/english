import { useEffect } from "react";

/**
 * Hooks into the browser's beforeprint/afterprint events to move the exam
 * preview root into a body-level portal so nested overflow/positioning
 * containers don't clip the printed pages. Restores the DOM after print.
 */
export function usePrintPortal() {
  useEffect(() => {
    const PRINT_BODY_CLASS = "exam-print-active";
    let originalParent: HTMLElement | null = null;
    let originalNextSibling: Node | null = null;
    let originalRootInlineStyle = "";
    let printHost: HTMLDivElement | null = null;

    function beforePrint() {
      const root = document.getElementById("exam-paper-print-root");
      if (!root || !root.parentElement) return;

      originalParent = root.parentElement;
      originalNextSibling = root.nextSibling;
      originalRootInlineStyle = root.getAttribute("style") || "";

      printHost = document.createElement("div");
      printHost.id = "exam-print-host";
      printHost.style.cssText =
        "position:fixed;left:0;top:0;width:210mm;height:auto;z-index:2147483647;background:white;margin:0;padding:0;";

      document.body.appendChild(printHost);
      printHost.appendChild(root);

      root.setAttribute(
        "style",
        "width:210mm;max-width:210mm;height:auto;padding:0;margin:0;overflow:visible;background:white;display:block;",
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
  }, []);
}
