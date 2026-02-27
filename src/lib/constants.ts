export type SchoolType = "MIDDLE" | "HIGH";

export interface SchoolData {
  name: string;
  slug: string;
  type: SchoolType;
  grades: number[];
}

export const SCHOOLS: SchoolData[] = [
  // 중학교 (19개)
  { name: "강동중", slug: "gangdong-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "강명중", slug: "gangmyeong-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "강빛중", slug: "gangbit-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "강일중", slug: "gangil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "고덕중", slug: "godeok-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "동북중", slug: "dongbuk-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "동신중", slug: "dongsin-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "둔촌중", slug: "dunchon-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "명일중", slug: "myeongil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "배재중", slug: "baejae-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "상일중", slug: "sangil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "성내중", slug: "seongnae-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "성덕여중", slug: "seongdeok-gms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "신명중", slug: "sinmyeong-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "신암중", slug: "sinam-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "천일중", slug: "cheonil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "천호중", slug: "cheonho-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "한산중", slug: "hansan-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "한영중", slug: "hanyeong-ms", type: "MIDDLE", grades: [1, 2, 3] },

  // 고등학교 (14개)
  { name: "강동고", slug: "gangdong-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "강일고", slug: "gangil-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "광문고", slug: "gwangmun-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "동북고", slug: "dongbuk-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "둔촌고", slug: "dunchon-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "명일여고", slug: "myeongil-ghs", type: "HIGH", grades: [1, 2, 3] },
  { name: "선사고", slug: "seonsa-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "성덕고", slug: "seongdeok-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "상일여고", slug: "sangil-ghs", type: "HIGH", grades: [1, 2, 3] },
  { name: "한영고", slug: "hanyeong-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "한영외고", slug: "hanyeong-flhs", type: "HIGH", grades: [1, 2, 3] },
  { name: "배재고", slug: "baejae-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "서울컨벤션고", slug: "convention-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "상일미디어고", slug: "sangil-media-hs", type: "HIGH", grades: [1, 2, 3] },
];

export const MIDDLE_SCHOOLS = SCHOOLS.filter((s) => s.type === "MIDDLE");
export const HIGH_SCHOOLS = SCHOOLS.filter((s) => s.type === "HIGH");

export const SEMESTERS = [
  { value: "FIRST", label: "1학기" },
  { value: "SECOND", label: "2학기" },
] as const;

export const EXAM_TYPES = [
  { value: "MIDTERM", label: "중간고사" },
  { value: "FINAL", label: "기말고사" },
  { value: "MOCK", label: "모의고사" },
] as const;

export const GRADES = [
  { value: 1, label: "1학년" },
  { value: 2, label: "2학년" },
  { value: 3, label: "3학년" },
] as const;

export const VOCAB_TEST_TYPES = [
  { value: "EN_TO_KR", label: "영→한" },
  { value: "KR_TO_EN", label: "한→영" },
  { value: "SPELLING", label: "스펠링" },
] as const;
