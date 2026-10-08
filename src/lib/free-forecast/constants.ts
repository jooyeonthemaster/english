// 무료 적중 예측 팩 신청(/free-forecast) — 클라이언트·서버 공용 상수·타입(순수 값만).
//
// 신청자는 자료 3칸을 채운다: ① 지난 기출 시험지 ② 그 시험의 범위 지문 ③ 이번 시험 범위 지문.
// ②·③ 은 학평·모평·수능 지문이면 파일 대신 기출 DB 에서 고를 수 있다.
// 실시간 생성이 아니다 — 접수만 받고, 운영자가 24시간 안에 이메일로 보낸다.

export const FF_SLOT_KEYS = ["pastExam", "pastRange", "nowRange"] as const;
export type FfSlotKey = (typeof FF_SLOT_KEYS)[number];

export interface FfSlotDef {
  key: FfSlotKey;
  no: number;
  title: string;
  /** 좁은 칸(모바일 타일·하단 막대)에서 두 줄로 */
  lines: [string, string];
  hint: string;
  /** 기출 DB 에서 고르기 허용(학평·모평·수능 지문) */
  gichul: boolean;
}

export const FF_SLOTS: FfSlotDef[] = [
  {
    key: "pastExam",
    no: 1,
    title: "지난 기출 시험지",
    lines: ["지난 기출", "시험지"],
    hint: "지난 시험(1학기 중간·기말 등)의 실제\u00a0시험지 그대로.",
    gichul: false,
  },
  {
    key: "pastRange",
    no: 2,
    title: "그 시험의 범위 지문",
    lines: ["그 시험", "범위 지문"],
    hint: "그 시험 범위였던 교과서·부교재·모의고사 지문.",
    gichul: true,
  },
  {
    key: "nowRange",
    no: 3,
    title: "이번 시험 범위 지문",
    lines: ["이번 시험", "범위 지문"],
    hint: "이번 시험 범위인 교과서·부교재·모의고사 지문.",
    gichul: true,
  },
];

/** 파일 하나 상한 — 버킷 fileSizeLimit 과 같게 둔다. */
export const FF_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const FF_MAX_FILES_PER_SLOT = 30;
/** 기출 DB 에서 한 칸에 고를 수 있는 시험지 수 */
export const FF_MAX_PAPERS_PER_SLOT = 12;

/** 확장자 → 저장 content-type. 목록에 없는 확장자는 받지 않는다(실행 파일 등 차단). */
export const FF_EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  // 윈도 크롬·카카오톡 PC 가 사진을 .jfif 로 저장한다(내용은 JPEG)
  jfif: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
  // 한컴 오피스의 다른 형식 — 한글 XML·서식, 한쇼(발표), 한셀(표). 전용 MIME 이 없어 일반 바이너리로 둔다(버킷은 크기만 제한)
  hml: "application/octet-stream",
  hwt: "application/octet-stream",
  show: "application/octet-stream",
  cell: "application/octet-stream",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pps: "application/vnd.ms-powerpoint",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  // 리브레오피스 발표·표(3차 R3-24: 「형식 안 따집니다」인데 거부했다)
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  rtf: "application/rtf",
  txt: "text/plain",
  // 맥 문서(Pages·Keynote)
  pages: "application/octet-stream",
  key: "application/octet-stream",
  // 압축 — 국내에서 흔한 알집(.alz)·반디집(.egg)까지(2차 검수: 「형식 안 따집니다」인데 거부했다)
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  egg: "application/octet-stream",
  alz: "application/octet-stream",
  rar: "application/vnd.rar",
};

export const FF_ACCEPT = Object.keys(FF_EXT_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export function ffExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : "";
}

/** 기출 DB 시험지 목록(공개 API) — 지문 본문은 싣지 않는다. */
export interface FfCatalogPaper {
  /** examId */
  e: string;
  /** 시험지 제목(예: 2025학년도 고2 9월 학력평가 영어) */
  t: string;
  y: number;
  /** 회차(수능·6월·9월·3월 …) */
  x: string;
  /** 학년(고1·고2·고3) */
  g: string;
  /** 지문 목록 — [문항번호들, 유형 묶음] */
  p: [number[], string][];
}

export interface FfGichulPick {
  examId: string;
  title: string;
  /** 고른 지문의 문항번호들(지문 하나 = 배열 하나, 장문은 [41,42]) */
  q: number[][];
}

export interface FfUploadedFile {
  path: string;
  name: string;
  size: number;
}

export interface FfSubmitBody {
  requestId: string;
  /** 자료를 받을 이메일 — 신청서에서 받는 유일한 개인정보 */
  email: string;
  agree: boolean;
  files: Record<FfSlotKey, FfUploadedFile[]>;
  gichul: Partial<Record<FfSlotKey, FfGichulPick[]>>;
  /** 봇 덫(사람 눈에 안 보이는 칸) — 값이 있으면 조용히 버린다 */
  website?: string;
}

export const FF_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const FF_REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 올린 파일 한 개 경로 — storage.createFfUploadTarget 이 만드는 모양 그대로(<신청>/<칸>/<시각>-<난수>.<확장자>).
 *  「..」·빈 마디·다른 신청 폴더·칸 밖 경로는 모양에서 걸러진다. */
const FF_FILE_PATH_RE = new RegExp(`^([0-9a-f-]{36})/(${FF_SLOT_KEYS.join("|")})/\\d{10,16}-[0-9a-z]{0,16}\\.[a-z0-9]{1,5}$`);

/** 이 신청 폴더의 칸 아래 파일 한 개인가 — 맞으면 그 칸, 아니면 null */
export function ffSlotOfPath(requestId: string, path: string): FfSlotKey | null {
  if (!FF_REQUEST_ID_RE.test(requestId)) return null;
  const m = FF_FILE_PATH_RE.exec(path);
  return m && m[1] === requestId ? (m[2] as FfSlotKey) : null;
}

/** 번호 묶기 — [29,30,…,40,44] → "29~40, 44" (기출 DB 창의 「없는 번호」 안내 · 「내 자료」 DB 줄이 같이 쓴다) */
export function ffFoldNums(nums: number[]): string {
  const a = [...new Set(nums)].sort((x, y) => x - y);
  const out: string[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(j > i ? `${a[i]}~${a[j]}` : `${a[i]}`);
    i = j + 1;
  }
  return out.join(", ");
}

/** 문항번호 배열 → "20" / "41-42" */
export function ffQLabel(q: number[]): string {
  if (q.length === 0) return "";
  if (q.length === 1) return String(q[0]);
  return `${q[0]}-${q[q.length - 1]}`;
}

export function ffBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
