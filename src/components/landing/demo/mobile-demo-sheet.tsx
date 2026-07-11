"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { DemoSheetContext } from "./demo-sheet-context";

/**
 * 모바일(<lg) 전용 풀스크린 라이브 데모 시트.
 *
 * PC 에는 절대 렌더되지 않는다(호출부에서 <lg 게이트 + lg:hidden). 앱형 셸로
 * 화면을 가득 채우고, 내부의 DemoShell 이 자체 헤더(닫기 X·처음부터)와 CTA 를
 * 그대로 그린다. 시트는 위치(fixed inset-0)·바디 스크롤 락·뒤로가기 닫힘·
 * --demo-h(본문 높이) 만 책임진다.
 *
 * --demo-h: 시트 안 스크롤 영역이 읽는 CSS 변수. DemoShell 헤더(~44)+CTA(~46)를
 * 뺀 값. 개별 데모의 스크롤 컨테이너가 이 변수를 height 로 사용한다(flex-1 금지
 * 규칙과 호환 — 명시 높이).
 */
export function MobileDemoSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 바디 스크롤 락 + 뒤로가기(popstate)로 닫힘. 버튼 닫기 시 pushState 한 항목을
  // 되감아(history.back) 히스토리에 찌꺼기를 남기지 않는다.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let poppedByBack = false;
    window.history.pushState({ smoatDemoSheet: true }, "");
    const onPop = () => {
      poppedByBack = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("popstate", onPop);
      // 뒤로가기가 아니라 버튼/언마운트로 닫혔으면 우리가 넣은 항목을 되감는다.
      if (!poppedByBack) window.history.back();
    };
  }, [open]);

  if (!open) return null;

  return (
    <DemoSheetContext.Provider value={{ onClose }}>
      <div
        className="fixed inset-0 z-[80] flex flex-col bg-slate-100 lg:hidden"
        style={
          {
            "--demo-h": "calc(100svh - 92px)",
          } as CSSProperties
        }
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </DemoSheetContext.Provider>
  );
}
