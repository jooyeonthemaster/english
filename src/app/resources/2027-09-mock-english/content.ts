/**
 * 2027학년도 9월 모의평가 영어 무료 자료 — 페이지 데이터(서버·클라이언트 공용, React 없음).
 *
 * 파일 실체는 Supabase 공개 버킷 `free-resources/2027-09-mock-english/` 에 있다
 * (26-09-02 업로드, 워터마크 SMOAT 적용본만 배포). 원본·생성 하네스는
 * `.tmp-mock-v4`(학습지) / `.tmp-trend-v2`(예측 리포트), 배포 원장은
 * docs/sept-mock-v4-upgrade.md §11.
 */

const SUPABASE_PUBLIC_HOST = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eavjwivvqxnsunbcvkce.supabase.co"
).replace(/\/$/, "");

export const ASSET_BASE = `${SUPABASE_PUBLIC_HOST}/storage/v1/object/public/free-resources/2027-09-mock-english`;

export const PAGE_PATH = "/resources/2027-09-mock-english";
export const PUBLISHED_ON = "2026-09-02";

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
    key: "teacher",
    badge: "교사판",
    title: "9월 모평 영어 20지문 분석 학습지 — 교사판",
    pages: 140,
    size: "16.3MB",
    description:
      "독해 20~45번의 20지문을 지문당 6쪽 안팎으로 풀어낸 학습지입니다. 실전 5문항으로 시작해 4컷 웹툰, 논증 도식, 핵심 요약, 필기 분석(직독직해·어법 판서), 출제 포인트(근거와 함정), 핵심 어휘로 이어지고 권말에 정답 일람표와 해설이 붙습니다.",
    bullets: [
      "20지문 전수 · 지문마다 수능추론 5문항 실전 세트",
      "4컷 웹툰 + 논증 도식으로 지문 흐름을 그림으로 복습",
      "정답 일람표 · 근거와 함정 해설 수록(교사 전용)",
    ],
    object: "smoat-2027-09-mock-english-worksheet-teacher.pdf",
    saveAs: "스모트_2027학년도_9월모평_영어_20지문_학습지_교사판.pdf",
  },
  {
    key: "student",
    badge: "학생판",
    title: "9월 모평 영어 20지문 분석 학습지 — 학생판",
    pages: 134,
    size: "15.6MB",
    description:
      "교사판과 같은 20지문 구성에서 정답 일람표·해설 부록만 뺀 수업·과제 배부용입니다. 학생이 먼저 실전 5문항을 풀고, 웹툰과 도식으로 흐름을 잡은 뒤 필기 분석으로 복습하도록 순서를 잡았습니다.",
    bullets: [
      "교사판과 동일한 20지문 · 6단계 구성",
      "정답 일람표 · 해설 없음(교사판으로 확인)",
      "내 노트 칸 포함 · 그대로 인쇄해 배부",
    ],
    object: "smoat-2027-09-mock-english-worksheet-student.pdf",
    saveAs: "스모트_2027학년도_9월모평_영어_20지문_학습지_학생판.pdf",
  },
  {
    key: "report",
    badge: "예측 리포트",
    title: "2027 수능 영어 문제 해부·예측 리포트 — 9월 모평 실전판",
    pages: 82,
    size: "8.9MB",
    description:
      "9월 모평 당일 시점 정보만으로 쓴 2027학년도 수능(2026년 11월 19일) 영어 예측 리포트입니다. 2015학년도 이후 수능·모평 기출 통계 위에 이번 9월 모평 독해 유형 15종을 문항 단위로 해부하고, 유형마다 예측 박스와 대비 전략을 붙였습니다.",
    bullets: [
      "총론 + 유형별 15개 챕터(주장·함축·요지·주제·제목·내용 일치·어법·어휘·빈칸·무관한 문장·글의 순서·문장 삽입·요약문·장문 I·II)",
      "3점 배점 지도 · 정답 번호 분포 · 선지 길이 등 통계 카드(수치는 전부 기출 원문 DB에서 계산)",
      "예측 박스마다 확신도와 근거 통계 표시 — 9월 채점 결과·수능 정보는 쓰지 않음",
    ],
    object: "smoat-2027-suneung-forecast-report.pdf",
    saveAs: "스모트_2027수능_영어_문제해부_예측리포트_9월모평실전판.pdf",
  },
];

export interface PreviewItem {
  object: string;
  caption: string;
  source: "학습지" | "리포트";
}

export const PREVIEWS: PreviewItem[] = [
  { object: "preview-worksheet-cover.jpg", caption: "학습지 표지", source: "학습지" },
  { object: "preview-worksheet-webtoon.jpg", caption: "02 스토리로 다시 읽기 — 지문을 4컷 웹툰으로", source: "학습지" },
  { object: "preview-worksheet-p5.jpg", caption: "논증 도식 + 03 핵심 요약", source: "학습지" },
  { object: "preview-worksheet-annotation.jpg", caption: "04 필기 분석 — 직독직해 · 어법 판서", source: "학습지" },
  { object: "preview-worksheet-p8.jpg", caption: "05 출제 포인트(근거·함정) + 06 핵심 어휘", source: "학습지" },
  { object: "preview-report-cover.jpg", caption: "예측 리포트 표지", source: "리포트" },
  { object: "preview-report-3point-map.jpg", caption: "총론 — 3점 배점 지도(2015~2027학년도)", source: "리포트" },
  { object: "preview-report-chapter.jpg", caption: "챕터 01 주장(20번) — 선지 DNA · 통계 카드", source: "리포트" },
];

export const READING_STEPS: Array<{ no: string; title: string; body: string }> = [
  { no: "01", title: "실전 · 수능추론 5문항", body: "지문 하나로 주제·제목·함축 의미·빈칸·요약문 등 다섯 유형을 먼저 풉니다. 정답은 권말(교사판)에만 있습니다." },
  { no: "02", title: "스토리로 다시 읽기", body: "지문의 논증을 통념 → 반전 → 근거 → 결론 4컷 웹툰으로 다시 읽고, 컷마다 영어 핵심 구를 짚습니다." },
  { no: "—", title: "논증 도식", body: "변화 → 요구 → 효과 → 결론처럼 지문의 뼈대를 한 장의 도식으로 정리합니다." },
  { no: "03", title: "핵심 요약", body: "한 줄 명제(한국어·영어)와 두 줄 근거로 지문 전체를 압축합니다." },
  { no: "04", title: "필기 분석 · 원문과 어법", body: "전 문장을 슬래시로 끊어 직독직해하고, 구문 성분과 어법 자리를 판서로 표시합니다. 어법 블록은 왜 틀리게 만드는지까지 설명합니다." },
  { no: "05", title: "출제 포인트", body: "실전 5문항 각각의 정답 근거와 오답 함정을 지문의 문장 번호로 되짚습니다." },
  { no: "06", title: "핵심 어휘", body: "지문에서 고른 어휘 16개를 한국어 풀이·유의어·반의어와 함께 정리합니다." },
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
  "온라인에 공유할 때는 이 페이지 주소(smoat.co.kr/resources/2027-09-mock-english)로 안내해 주세요.",
  "지문 원문의 저작권은 한국교육과정평가원에 있으며, 이 자료는 해당 시험 문항에 대한 분석·해설 자료입니다.",
  "AI가 분석하고 사람이 검수했지만 오류가 있을 수 있습니다. 발견하신 오류는 문의 채널로 알려 주시면 다음 판에 반영합니다.",
];
