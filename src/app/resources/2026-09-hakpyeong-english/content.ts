/**
 * 2026학년도 9월 고1·고2 전국연합학력평가 영어 무료 자료 — 페이지 데이터(서버·클라이언트 공용, React 없음).
 *
 * 파일 실체는 Supabase 공개 버킷 `free-resources/2026-09-hakpyeong-english/` 에 있다
 * (26-09-09 업로드, 워터마크 SMOAT 적용본만 배포). 생성 하네스는
 * `.tmp-mock-g1/`·`.tmp-mock-g2/`(고3 `.tmp-mock-v4` 복제본), 주행·배포 원장은
 * docs/sept-mock-g12-2609.md.
 */

const SUPABASE_PUBLIC_HOST = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eavjwivvqxnsunbcvkce.supabase.co"
).replace(/\/$/, "");

export const ASSET_BASE = `${SUPABASE_PUBLIC_HOST}/storage/v1/object/public/free-resources/2026-09-hakpyeong-english`;

export const PAGE_PATH = "/resources/2026-09-hakpyeong-english";
export const PUBLISHED_ON = "2026-09-09";

/**
 * Supabase 공개 객체는 `?download=<파일명>` 을 붙이면 Content-Disposition: attachment 로
 * 내려간다. 교차 출처라 `<a download>` 속성은 브라우저가 무시하므로 반드시 이 쿼리를 쓴다.
 */
export function downloadUrl(object: string, saveAs: string): string {
  return `${ASSET_BASE}/${object}?download=${encodeURIComponent(saveAs)}`;
}

export function assetUrl(object: string): string {
  return `${ASSET_BASE}/${object}`;
}

export interface DownloadItem {
  key: string;
  badge: string;
  title: string;
  pages: number;
  size: string;
  description: string;
  bullets: string[];
  object: string;
  saveAs: string;
}

export const DOWNLOADS: DownloadItem[] = [
  {
    key: "g1-teacher",
    badge: "고1 교사판",
    title: "9월 학평 고1 영어 20지문 분석 학습지 — 교사판",
    pages: 132,
    size: "15.8MB",
    description:
      "고1 독해 20~45번의 20지문을 지문당 6쪽 안팎으로 풀어낸 학습지입니다. 실전 5문항으로 시작해 4컷 웹툰, 개념 도식, 핵심 요약, 필기 분석(직독직해·어법 판서), 출제 포인트(근거와 함정), 핵심 어휘로 이어지고 권말에 정답 일람표와 해설이 붙습니다.",
    bullets: [
      "고1 20지문 전수 · 지문마다 새로 출제한 실전 5문항(총 100제)",
      "4컷 웹툰 20편 + 개념 도식 20장으로 지문 흐름을 그림으로 복습",
      "정답 일람표 · 근거와 함정 해설 수록(교사 전용)",
    ],
    object: "smoat-2026-09-hakpyeong-english-g1-worksheet-teacher.pdf",
    saveAs: "스모트_2026년_9월_고1_학력평가_영어_20지문_학습지_교사판.pdf",
  },
  {
    key: "g1-student",
    badge: "고1 학생판",
    title: "9월 학평 고1 영어 20지문 분석 학습지 — 학생판",
    pages: 127,
    size: "15.1MB",
    description:
      "고1 교사판과 같은 20지문 구성에서 정답 일람표·해설 부록만 뺀 수업·과제 배부용입니다. 학생이 먼저 실전 5문항을 풀고, 웹툰과 개념 도식으로 흐름을 잡은 뒤 필기 분석으로 복습하도록 순서를 잡았습니다.",
    bullets: [
      "고1 교사판과 동일한 20지문 · 6단계 구성",
      "정답 일람표 · 해설 없음(교사판으로 확인)",
      "내 노트 칸 포함 · 그대로 인쇄해 배부",
    ],
    object: "smoat-2026-09-hakpyeong-english-g1-worksheet-student.pdf",
    saveAs: "스모트_2026년_9월_고1_학력평가_영어_20지문_학습지_학생판.pdf",
  },
  {
    key: "g2-teacher",
    badge: "고2 교사판",
    title: "9월 학평 고2 영어 20지문 분석 학습지 — 교사판",
    pages: 135,
    size: "15.7MB",
    description:
      "고2 독해 20~45번의 20지문을 지문당 6쪽 안팎으로 풀어낸 학습지입니다. 고1판과 같은 6단계 구성을 쓰되 어휘·구문 수준과 선지 난도를 고2 학평에 맞췄고, 권말에 정답 일람표와 해설이 붙습니다.",
    bullets: [
      "고2 20지문 전수 · 지문마다 새로 출제한 실전 5문항(총 100제)",
      "4컷 웹툰 20편 + 개념 도식 20장 · 어법 포인트 100개",
      "정답 일람표 · 근거와 함정 해설 수록(교사 전용)",
    ],
    object: "smoat-2026-09-hakpyeong-english-g2-worksheet-teacher.pdf",
    saveAs: "스모트_2026년_9월_고2_학력평가_영어_20지문_학습지_교사판.pdf",
  },
  {
    key: "g2-student",
    badge: "고2 학생판",
    title: "9월 학평 고2 영어 20지문 분석 학습지 — 학생판",
    pages: 130,
    size: "15.0MB",
    description:
      "고2 교사판과 같은 20지문 구성에서 정답 일람표·해설 부록만 뺀 수업·과제 배부용입니다. 실전 5문항 → 웹툰·개념 도식 → 요약 → 필기 분석 순서를 그대로 따라가면 한 지문이 한 차시로 끝납니다.",
    bullets: [
      "고2 교사판과 동일한 20지문 · 6단계 구성",
      "정답 일람표 · 해설 없음(교사판으로 확인)",
      "내 노트 칸 포함 · 그대로 인쇄해 배부",
    ],
    object: "smoat-2026-09-hakpyeong-english-g2-worksheet-student.pdf",
    saveAs: "스모트_2026년_9월_고2_학력평가_영어_20지문_학습지_학생판.pdf",
  },
];

export interface PreviewItem {
  object: string;
  caption: string;
  source: "고1" | "고2";
}

export const PREVIEWS: PreviewItem[] = [
  { object: "preview-g1-cover.jpg", caption: "고1 학습지 표지", source: "고1" },
  { object: "preview-g1-set.jpg", caption: "01 실전 · 수능추론 5문항", source: "고1" },
  { object: "preview-g1-webtoon.jpg", caption: "02 스토리로 다시 읽기 — 지문을 4컷 웹툰으로", source: "고1" },
  { object: "preview-g1-structure.jpg", caption: "개념 도식 + 03 핵심 요약", source: "고1" },
  { object: "preview-g1-annotation.jpg", caption: "04 필기 분석 — 직독직해 · 어법 판서", source: "고1" },
  { object: "preview-g2-set.jpg", caption: "고2 01 실전 · 수능추론 5문항", source: "고2" },
  { object: "preview-g2-webtoon.jpg", caption: "고2 02 스토리 — 4컷 웹툰", source: "고2" },
  { object: "preview-g2-annotation.jpg", caption: "고2 04 필기 분석 — 직독직해 · 어법 판서", source: "고2" },
];

export const READING_STEPS: Array<{ no: string; title: string; body: string }> = [
  { no: "01", title: "실전 · 수능추론 5문항", body: "학평 지문 하나로 주제·제목·함축 의미·빈칸·요약문 등 다섯 유형을 먼저 풉니다. 학년마다 100제, 두 학년 합쳐 200제를 새로 출제했습니다. 정답은 권말(교사판)에만 있습니다." },
  { no: "02", title: "스토리로 다시 읽기", body: "지문의 흐름을 통념 → 반전 → 근거 → 결론 4컷 웹툰으로 다시 읽고, 컷마다 영어 핵심 구를 짚습니다. 학년별 20편." },
  { no: "—", title: "개념 도식", body: "변화 → 요구 → 효과 → 결론처럼 지문의 뼈대를 한 장의 도식으로 정리합니다. 학년별 20장." },
  { no: "03", title: "핵심 요약", body: "한 줄 명제(한국어·영어)와 두 줄 근거로 지문 전체를 압축합니다." },
  { no: "04", title: "필기 분석 · 원문과 어법", body: "전 문장을 슬래시로 끊어 직독직해하고, 구문 성분과 어법 자리를 판서로 표시합니다. 지문마다 어법 포인트 5개씩, 학년별 100개가 왜 틀리게 만드는지까지 설명합니다." },
  { no: "05", title: "출제 포인트", body: "실전 5문항 각각의 정답 근거와 오답 함정을 지문의 문장 번호로 되짚습니다." },
  { no: "06", title: "핵심 어휘", body: "지문에서 고른 어휘를 한국어 풀이·유의어·반의어와 함께 정리합니다. 지문마다 16개씩, 학년별 320개." },
];

export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "회원가입이나 결제가 필요한가요?",
    a: "아니요. 다운로드 버튼을 누르면 PDF가 바로 저장됩니다. 이메일 입력도 없습니다.",
  },
  {
    q: "교사판과 학생판은 무엇이 다른가요?",
    a: "본문 20지문 구성은 같고, 학생판에는 권말 정답 일람표·해설 부록이 없습니다. 수업 전 학생판을 배부하고 교사판으로 정답을 확인하는 흐름을 권합니다.",
  },
  {
    q: "고1과 고2 중 어느 것을 받아야 하나요?",
    a: "학생이 실제로 치른 학년의 파일을 받으시면 됩니다. 2026년 9월 2일 시행된 「2026학년도 9월 전국연합학력평가」(인천광역시교육청 주관, 16개 시·도교육청 공동)는 고1·고2가 서로 다른 문제지로 치렀고, 학습지도 학년별로 따로 만들었습니다. 참고로 학력평가의 「2026학년도」는 학교 학년도(2026년 3월~2027년 2월) 기준이라, 고3 수능·모의평가에서 쓰는 대입 기준 「2027학년도」와는 세는 방식이 다릅니다.",
  },
  {
    q: "인쇄는 어떻게 하는 게 좋나요?",
    a: "A4 세로 규격입니다. 웹툰·도식·어법 판서가 색으로 구분돼 있어 컬러 인쇄를 권하지만, 흑백으로도 밑줄·형광 표시가 구분되도록 조판했습니다.",
  },
  {
    q: "워터마크는 왜 있나요? 수업에 써도 되나요?",
    a: "무료 배포본 식별용으로 모든 쪽에 SMOAT 워터마크를 옅게 넣었습니다. 학원·학교 수업과 개인 학습에는 자유롭게 쓰셔도 됩니다. 워터마크를 지우거나 유료로 재배포하는 것만 삼가 주세요.",
  },
  {
    q: "우리 학원 교재·지문으로도 같은 학습지를 만들 수 있나요?",
    a: "네. 스모트 클래스 스튜디오에 지문을 넣으면 같은 구성의 분석 학습지(직독직해·어법 판서·실전 문항·어휘)와 지문 웹툰을 만들 수 있습니다.",
  },
];

export const USAGE_TERMS: string[] = [
  "학원·학교 수업 자료와 개인 학습에 무료로 사용할 수 있습니다.",
  "파일의 SMOAT 워터마크를 제거하거나, 유료로 판매·재배포하는 것은 금지합니다.",
  "온라인에 공유할 때는 이 페이지 주소(smoat.co.kr/resources/2026-09-hakpyeong-english)로 안내해 주세요.",
  "지문 원문의 저작권은 전국연합학력평가를 주관한 시·도교육청에 있으며, 이 자료는 해당 시험 문항에 대한 분석·해설 자료입니다.",
  "AI가 분석하고 사람이 검수했지만 오류가 있을 수 있습니다. 발견하신 오류는 문의 채널로 알려 주시면 다음 판에 반영합니다.",
];
