// 문학 출제 트렌드 대시보드 — 정적 데이터셋(src/data/exam-passages-korean/lit-trends.json) 타입.
// 데이터는 기출 문학 546지문(수능·평가원 164 + 교육청 학평 382)과 경향 분석 보고서에서
// 사전 집계했고, 모든 데이터 포인트는 클릭 시 열람할 실지문 id 목록을 갖는다.

export interface LitTrendExample {
  id: string;
  label: string;
}

export interface LitTrends {
  meta: { source: string; note: string };
  hero: {
    passages: number;
    kice: number;
    ebsi: number;
    works: number;
    yearMin: number;
    yearMax: number;
  };
  regimeYears: {
    year: number;
    counts: Record<string, number>;
    ids: Record<string, string[]>;
  }[];
  eras: { from: number; to: number; label: string; desc: string }[];
  matrix: {
    slot: string;
    name: string;
    questions: string;
    length: string;
    rule: string;
    examples: LitTrendExample[];
  }[];
  authors: {
    author: string;
    kice: number;
    ebsi: number;
    works: { work: string; ids: string[] }[];
  }[];
  anonCount: number;
  decades: {
    decade: string;
    count: number;
    works: { title: string; ids: string[] }[];
  }[];
  devices: {
    genre: string;
    n: number;
    front: number;
    frontIds: string[];
    midBox: number;
    midBoxIds: string[];
    plainCut: number;
    plainCutIds: string[];
    footnote: number;
    footnoteIds: string[];
    twoBlock: number;
    twoBlockIds: string[];
  }[];
  lengths: {
    genre: string;
    kice: { n: number; min: number; med: number; max: number } | null;
    ebsi: { n: number; min: number; med: number; max: number } | null;
  }[];
  combos: { label: string; count: number; ids: string[] }[];
  themes: {
    code: string;
    label: string;
    desc: string;
    examples: LitTrendExample[];
  }[];
  reappear: {
    work: string;
    author: string;
    first: { year: number; siheng: string; id: string };
    second: { year: number; siheng: string; id: string };
    gap: number;
    note: string;
  }[];
  bogi: {
    total: number;
    specific: number;
    types: {
      label: string;
      desc: string;
      example: { id: string | null; work: string; quote: string } | null;
    }[];
  };
  notation: {
    before: { id: string; year: number; siheng: string; snippet: string };
    after: { id: string; year: number; siheng: string; snippet: string };
  } | null;
}

/** 갈래 그룹 고정 색(엔티티 고정 — 필터·차트 간 불변). 검증 완료 팔레트. */
export const GENRE_COLORS: Record<string, string> = {
  고전소설: "#2563eb",
  현대소설: "#059669",
  고전시가: "#7c3aed",
  현대시: "#e11d48",
  갈래복합: "#0891b2",
  기타: "#94a3b8",
};

export const GENRE_ORDER = [
  "고전소설",
  "현대소설",
  "고전시가",
  "현대시",
  "갈래복합",
  "기타",
] as const;
