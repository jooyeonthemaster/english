"use client";

// generation-config-panel.tsx 에서 분리한 leaf 컴포넌트 (verbatim 이동).
import type React from "react";

// 부드럽게 펼쳐지는 컨테이너 — 순수 CSS grid-rows 0fr↔1fr 트릭(높이 측정·프레이머
// 불필요, 임의 내용 높이 애니메이션). 유형 세부옵션·카테고리 그룹 양쪽에 쓴다.
// 내용은 항상 마운트해 펼침/접힘이 모두 애니메이션되게 한다(접힘 시 inert 로 비활성).
export function Collapsible({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        <div
          className={`transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
            open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
