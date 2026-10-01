// 「출제자 해부 파일」 디자인 토큰 — 시험지 종이색 바탕·먹색 글자·채점 빨간펜 하나만 강조색.
// 차트도 이 토큰만 쓴다(먹·빨강·회색 단계). 보라·그라데이션 금지.

export const FC = {
  paper: "#f6f2e9",
  card: "#fffdf8",
  ink: "#1c1a17",
  sub: "#6b645a",
  faint: "#9a9284",
  rule: "#d8d1c2",
  red: "#b3261e",
  redSoft: "#f5dcd8",
  marker: "#f6e27a",
  ok: "#2f6b3a",
  okSoft: "#dcebd9",
  blue: "#1f4e79",
  blueSoft: "#dbe6f1",
} as const;

/** 유형 계열별 색 — 먹 농도 + 빨강 1계열 */
export const FAMILY_COLOR: Record<string, string> = {
  대의: "#1c1a17",
  세부: "#4a4540",
  연결어: "#7d766b",
  어법: "#b3261e",
  어휘: "#d0675e",
  추론: "#1f4e79",
  간접쓰기: "#5f87ad",
  논술형: "#2f6b3a",
};

export const SOURCE_COLOR: Record<string, string> = {
  학평: "#1f4e79",
  올림포스: "#b3261e",
  교과서: "#7d766b",
  기출: "#1c1a17",
};

export const serif = "font-['Nanum_Myeongjo',serif]";

export function pct(n: number | undefined | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "–";
  return `${(n * 100).toFixed(digits)}%`;
}
