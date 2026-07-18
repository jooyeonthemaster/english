"use client";

// ============================================================================
// 워크스페이스 팝업 셸 — 화면을 거의 꽉 채우는 오버레이.
//
// 별도 페이지일 때는 좌우 거터가 32px(xl:px-8) 고정이라 넓은 모니터에서 콘텐츠가
// 화면 끝까지 붙어 답답했다. 팝업은 뷰포트에서 일정 비율 물러난 카드 안에 내용을
// 담아 사방 여백을 구조적으로 확보한다.
//
// 닫기 = router.back() — 인터셉팅 라우트라 뒤로가기 한 번이 곧 "팝업 닫기"이고,
// 허브가 그대로 뒤에 남는다(목록 맥락 유지). Esc·배경 클릭도 같은 경로를 탄다.
// ============================================================================

import { createContext, useCallback, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 팝업 닫기 핸들 — 워크스페이스 헤더가 X 버튼을 자기 안에 그리기 위해 쓴다.
 * 모달 라우트가 서버 컴포넌트라 props 로 콜백을 내려보낼 수 없어 컨텍스트로 전달한다.
 * 팝업 밖(전체 페이지 폴백)에서는 null → 헤더가 X 를 그리지 않는다.
 */
const WorkspaceModalContext = createContext<(() => void) | null>(null);

export function useWorkspaceModalClose(): (() => void) | null {
  return useContext(WorkspaceModalContext);
}

export function WorkspaceModal({
  children,
  closeHref,
}: {
  children: React.ReactNode;
  /**
   * 닫기 동작을 경로에 맞게 나눈다.
   *  - 미지정(인터셉트 경로 = 허브에서 카드 클릭): `router.back()` — 팝업만 닫히고
   *    뒤에 남아 있던 허브가 그대로 드러난다.
   *  - 지정(주소 직접 진입·새로고침): 뒤로 갈 앱 히스토리가 없어 back() 하면 앱
   *    밖(직전 사이트)으로 나가버린다. 그래서 이 경로로 replace 한다.
   */
  closeHref?: string;
}) {
  const router = useRouter();

  const close = useCallback(() => {
    if (closeHref) router.replace(closeHref);
    else router.back();
  }, [router, closeHref]);

  // Esc 로 닫기 + 배경 스크롤 잠금(팝업 내부만 스크롤 — 스크롤 축 1개 유지).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [close]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="시험 분석 워크스페이스"
      className="fixed inset-0 z-50 flex flex-col"
    >
      {/* 배경 — 클릭하면 닫힌다(허브가 비쳐 보여 맥락이 유지된다) */}
      <button
        type="button"
        aria-label="닫기"
        onClick={close}
        className="absolute inset-0 cursor-default bg-slate-900/45 backdrop-blur-[2px]"
      />

      {/* 팝업 카드 — 화면에 거의 가득 차게, 배경이 살짝 비치는 최소 인셋만 남긴다. */}
      <div className="relative m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-[#F4F6F9] shadow-2xl sm:m-3 lg:m-4">
        {/* 본문 — 이 영역만 스크롤한다. 닫기(X)는 떠 있는 버튼이 아니라 워크스페이스
            헤더 안에 들어간다(헤더가 팝업 상단에 고정되므로 항상 닿는다). */}
        <WorkspaceModalContext.Provider value={close}>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </WorkspaceModalContext.Provider>
      </div>
    </div>
  );
}
