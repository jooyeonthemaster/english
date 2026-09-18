"use client";

// 「좁은 판」 판정 — 페이지 리포트의 표가 열 수·경로 표시를 줄일지 정하는 단일 기준.
//
// 뷰포트가 아니라 본문 컨테이너 폭으로 재는 이유: 같은 390px 문제가 768px 에서도 난다.
// 실측(수정 전) — 인기 페이지 경로 열 폭: 뷰포트 390 = 71px, 640 = 292px, 768 = 94px(관리자 사이드바가 붙어
// 본문이 458px 로 줄기 때문), 1440 = 766px. 즉 화면 폭과 표가 쓰는 폭이 단조롭게 움직이지 않는다.
//
// CSS 만으로 못 하는 이유: BreakdownTable 은 열 className 을 td 에만 붙여 th 를 같이 접을 수 없고,
// 라벨 셀의 말줄임/줄바꿈은 부모의 truncate(white-space:nowrap)와 같은 명시도라 클래스 순서로 이기지 못한다.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** 인기 페이지의 숫자 열 6개가 약 363px 를 쓰므로, 본문이 이보다 좁으면 경로 열이 200px 아래로 짓눌린다. */
export const NARROW_CONTENT_PX = 560;

const NarrowContext = createContext(false);

/** 본문 폭을 재서 좁은 판인지 알려준다. ref 는 항상 그려지는 바깥 div 에 건다. */
export function useContainerNarrow(threshold = NARROW_CONTENT_PX): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth > 0 && el.clientWidth < threshold);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [threshold]);

  return [ref, narrow];
}

export function NarrowProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <NarrowContext.Provider value={value}>{children}</NarrowContext.Provider>;
}

/** 공급자가 없으면 false(=넓은 판) — 기존 표시를 그대로 쓴다. */
export function useNarrow(): boolean {
  return useContext(NarrowContext);
}
