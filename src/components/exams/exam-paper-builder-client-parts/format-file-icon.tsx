// 다운로드 메뉴용 파일 포맷 아이콘 — 파일 모양 안에 포맷 텍스트(PDF/DOCX/HWPX)를 키컬러
// 밴드로 박는다. 해설 포함 버전은 파일 두 개가 겹친 모양(stacked).
// (26-09-30 preview-toolbar.tsx 에서 떼어 냄 — 500줄 규칙, 본문 글자 그대로 · 동작 무변)
export function FormatFileIcon({
  label,
  color,
  stacked = false,
}: {
  label: string;
  color: string;
  stacked?: boolean;
}) {
  const Page = ({
    dx = 0,
    dy = 0,
    faded = false,
    withLabel = true,
  }: {
    dx?: number;
    dy?: number;
    faded?: boolean;
    withLabel?: boolean;
  }) => (
    <g transform={`translate(${dx} ${dy})`} opacity={faded ? 0.5 : 1}>
      {/* 페이지(흰 바탕 + 키컬러 외곽선), 우상단 접힘 */}
      <path
        d="M6 2.5 H13.5 L18 7 V19.5 A2 2 0 0 1 16 21.5 H6 A2 2 0 0 1 4 19.5 V4.5 A2 2 0 0 1 6 2.5 Z"
        fill="white"
        stroke={color}
        strokeWidth={1.4}
      />
      <path
        d="M13.5 2.5 V7 H18"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {withLabel && (
        <>
          <rect x={4} y={12.6} width={14} height={6.6} rx={1.2} fill={color} />
          <text
            x={11}
            y={17.4}
            textAnchor="middle"
            fontSize={4.5}
            fontWeight={800}
            fill="white"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            letterSpacing={0.2}
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* 해설 포함: 뒤에 옅은 페이지 한 장 더(두 장 겹침) */}
      {stacked && <Page dx={3.5} dy={-2.2} faded withLabel={false} />}
      <Page dx={stacked ? -1.5 : 0} dy={stacked ? 1.6 : 0} />
    </svg>
  );
}

export const FORMAT_COLORS = {
  pdf: "#DC2626", // red-600
  docx: "#2563EB", // blue-600
  hwpx: "#0EA5E9", // sky-500 (하늘)
} as const;
