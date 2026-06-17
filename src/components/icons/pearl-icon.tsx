// 생성 모델 '일반' 아이콘 — 다이아몬드(프리미엄)보다 한 급 낮은 '진주' 느낌.
// lucide 스타일의 선(stroke) 전용: 원 + 좌상단 광택 호. currentColor 를 따른다.
export function PearlIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 8.5A5 5 0 0 1 11.5 5.7" />
    </svg>
  );
}
