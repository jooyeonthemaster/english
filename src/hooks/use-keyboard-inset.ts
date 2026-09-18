"use client";

// ============================================================================
// useKeyboardInset — 모바일 가상 키보드가 차지한 하단 픽셀 수를 돌려준다.
//
// h-dvh 레이아웃은 키보드가 열려도 줄어들지 않아(iOS Safari) 하단 고정
// 푸터(제출 바·전송 버튼)가 키보드에 가려진다. visualViewport 로 실제 가시
// 영역을 재서 가려진 만큼을 paddingBottom 등으로 밀어 올리는 용도.
//
// - threshold: URL 바 축소 등 크롬 변화(수십 px)를 키보드로 오인하지 않는
//   최소 픽셀. 기본 80px.
// - Android Chrome 은 /g layout 의 viewport interactiveWidget:
//   "resizes-content" 가 레이아웃 뷰포트 자체를 줄이므로 이 훅은 ~0 을
//   돌려준다(이중 보정 없음). iOS 는 이 훅이 실측을 담당한다.
// - SSR 안전: 서버에서는 0, visualViewport 미지원 브라우저도 0.
// ============================================================================

import { useEffect, useState } from "react";

export function useKeyboardInset(threshold = 80): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const measure = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered >= threshold ? Math.round(covered) : 0);
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, [threshold]);

  return inset;
}
