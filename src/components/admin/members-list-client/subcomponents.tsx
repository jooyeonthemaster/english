"use client";

// 회원 목록 전용 소품. 필터 칩·정렬 헤더·빈 상태는 공용 kit 로 옮겼다.

/** 헤더 셀 우측의 열 너비 조절 핸들(드래그). 회원별·학원별 표 공용. */
export function ColumnResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="열 너비 조절"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className="group/resize absolute right-0 top-0 z-10 flex h-full w-2 translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
    >
      <span className="h-4 w-px bg-gray-200 transition-colors group-hover/resize:bg-blue-400" />
    </span>
  );
}
