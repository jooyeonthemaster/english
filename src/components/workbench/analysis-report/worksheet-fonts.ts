// ============================================================================
// 학습지 조판 — 문서 글꼴 카탈로그 + 로더
//
// 웹툰 텍스트 편집기의 폰트 인프라(@/lib/webtoon-text/fonts)를 **그대로 재사용**한다.
// 같은 선례가 이미 하나 더 있다(학생 시험 리포트 — components/exam-report/report/
// report-fonts.ts). 재사용 규약 2가지:
//   1) family 문자열이 웹툰 카탈로그와 **바이트 동일**해야 `injectFontCss` 가 실제로
//      로드한다(로컬 @font-face 3종 포함). 라벨만 한글로 덧입힌다.
//   2) 웹툰 카탈로그에 **없는** 서체(문서 톤 세리프·고정폭)는 이 파일이 자기 몫의
//      Google Fonts CSS2 링크를 직접 주입한다 — 웹툰 카탈로그를 학습지 사정으로
//      부풀리면 말풍선 피커가 같이 오염된다.
//
// 로딩 정책(유령 폰트 방지):
//  · 문서 렌더 경로(ReportPages)는 **실제로 쓰인 패밀리만** ensureWorksheetFonts.
//    `injectAllFontCss`(60패밀리 일괄)는 학습지 경로에서 금지 — 인쇄 스풀이 부푼다.
//    (report-styles.ts 머리말이 기록한 대로, 이 문서는 인쇄 스풀 폰트 임베드 용량을
//     줄이려고 일부러 CDN Pretendard 를 버리고 로컬 맑은 고딕으로 내려온 이력이 있다.)
//  · 피커가 열리는 순간에만 injectWorksheetFontPreviewCss() 로 목록 서브셋을 주입해
//    in-face 미리보기를 성립시킨다.
//
// ⚠ 폰트는 **글자 폭을 바꾼다** = 페이지 분할이 바뀐다. 그래서 로드 완료 시점에
//   재측정이 반드시 돌아야 한다(report-pages/pages.tsx 의 fontEpoch). 이 파일은
//   "언제 로드가 끝났는지"를 알려주는 ensure* 를 Promise 로 노출하는 것까지가 책임이다.
// ============================================================================

import {
  WEBTOON_FONT_LIST,
  ensureWebtoonFont,
  injectFontCss,
} from "@/lib/webtoon-text/fonts";
import { REPORT_LAYOUT } from "@/lib/passage-report/analysis-report/design-tokens";

export type WorksheetFontLang = "ko" | "latin";
export type WorksheetFontGroup = "sans" | "serif" | "hand" | "display" | "mono";

export interface WorksheetFont {
  /** 웹툰 카탈로그와 동일한 정확한 family 명(카탈로그 밖 서체는 Google Fonts 정식명). */
  family: string;
  lang: WorksheetFontLang;
  group: WorksheetFontGroup;
  /** 피커 표시 라벨(한글) */
  label: string;
  /** 한 줄 성격 설명 */
  vibe: string;
  /** 웹툰 카탈로그에 없어 이 파일이 직접 주입해야 하는 서체의 굵기(GF CSS2 용). */
  weights?: number[];
  /** 사용자가 올린 자체 호스팅 서체(목록 최상단 「내 폰트」로 고정). */
  local?: boolean;
}

const WEBTOON_BY_FAMILY = new Map(WEBTOON_FONT_LIST.map((f) => [f.family, f]));

/** 웹툰 카탈로그가 이미 아는 서체인가 — 주입 경로가 갈린다. */
function inWebtoonCatalog(family: string): boolean {
  return WEBTOON_BY_FAMILY.has(family);
}

// ─────────────────────────────────────────────────────────────────────────────
// 카탈로그
// ─────────────────────────────────────────────────────────────────────────────
export const WORKSHEET_FONTS: WorksheetFont[] = [
  // ── 한글 · 내 폰트(자체 호스팅 — 웹툰 카탈로그의 local 3종과 동일 파일) ──
  { family: "그리운 체리 한스푼", lang: "ko", group: "hand", label: "그리운 체리 한스푼", vibe: "또박또박 손글씨", local: true },
  { family: "그리운 규원체", lang: "ko", group: "hand", label: "그리운 규원체", vibe: "정갈한 펜 손글씨 · 파이널 학습지 기본", local: true },
  { family: "Ok단단체", lang: "ko", group: "display", label: "Ok단단체", vibe: "단단한 굵은 제목체", local: true },

  // ── 한글 · 고딕 ──
  { family: "Pretendard", lang: "ko", group: "sans", label: "프리텐다드", vibe: "중립적인 현대 고딕" },
  { family: "Noto Sans KR", lang: "ko", group: "sans", label: "노토 산스", vibe: "표준 본문 고딕" },
  { family: "Nanum Gothic", lang: "ko", group: "sans", label: "나눔고딕", vibe: "친근한 중립 고딕" },
  { family: "Gothic A1", lang: "ko", group: "sans", label: "고딕 A1", vibe: "다재다능한 밀도 고딕" },
  { family: "IBM Plex Sans KR", lang: "ko", group: "sans", label: "IBM 플렉스 산스", vibe: "테크니컬 고딕" },
  { family: "Gowun Dodum", lang: "ko", group: "sans", label: "고운돋움", vibe: "부드러운 휴머니스트" },
  { family: "Sunflower", lang: "ko", group: "sans", label: "선플라워", vibe: "가볍고 산뜻" },
  { family: "Stylish", lang: "ko", group: "sans", label: "스타일리시", vibe: "얇고 미니멀" },

  // ── 한글 · 명조 ──
  { family: "Noto Serif KR", lang: "ko", group: "serif", label: "노토 세리프", vibe: "단정한 표준 명조" },
  { family: "Nanum Myeongjo", lang: "ko", group: "serif", label: "나눔명조", vibe: "클래식 문서 명조" },
  { family: "Gowun Batang", lang: "ko", group: "serif", label: "고운바탕", vibe: "따뜻한 바탕체" },
  { family: "Song Myung", lang: "ko", group: "serif", label: "송명", vibe: "가늘고 품격 있는 명조" },
  { family: "Hahmlet", lang: "ko", group: "serif", label: "함렛", vibe: "묵직한 현대 세리프" },
  { family: "Diphylleia", lang: "ko", group: "serif", label: "디필리아", vibe: "섬세한 붓 세리프" },

  // ── 한글 · 손글씨 ──
  { family: "Nanum Pen Script", lang: "ko", group: "hand", label: "나눔 펜", vibe: "볼펜 손글씨" },
  { family: "Nanum Brush Script", lang: "ko", group: "hand", label: "나눔 붓", vibe: "붓 손글씨" },
  { family: "Gaegu", lang: "ko", group: "hand", label: "개구", vibe: "또박또박 연필" },
  { family: "Hi Melody", lang: "ko", group: "hand", label: "하이멜로디", vibe: "귀여운 마커" },
  { family: "Gamja Flower", lang: "ko", group: "hand", label: "감자꽃", vibe: "통통 낙서체" },
  { family: "Single Day", lang: "ko", group: "hand", label: "싱글데이", vibe: "다이어리 손글씨" },

  // ── 한글 · 디스플레이 ──
  { family: "Black Han Sans", lang: "ko", group: "display", label: "검은고딕", vibe: "초굵은 포스터 임팩트" },
  { family: "Jua", lang: "ko", group: "display", label: "주아", vibe: "둥글둥글 말풍선" },
  { family: "Do Hyeon", lang: "ko", group: "display", label: "도현", vibe: "굵은 간판체" },
  { family: "Dongle", lang: "ko", group: "display", label: "동글", vibe: "포근한 버블" },
  { family: "Yeon Sung", lang: "ko", group: "display", label: "연성", vibe: "레트로 마커" },
  { family: "Kirang Haerang", lang: "ko", group: "display", label: "기랑해랑", vibe: "옛날 간판 붓" },
  { family: "Poor Story", lang: "ko", group: "display", label: "푸어스토리", vibe: "엉뚱한 동화체" },
  { family: "Cute Font", lang: "ko", group: "display", label: "큐트폰트", vibe: "얇고 깜찍" },

  // ── 한글 · 고정폭 ──
  { family: "Nanum Gothic Coding", lang: "ko", group: "mono", label: "나눔고딕코딩", vibe: "고정폭 코딩체" },

  // ── 영문 · 세리프 (카탈로그 밖 — 이 파일이 직접 주입) ──
  { family: "Noto Serif", lang: "latin", group: "serif", label: "Noto Serif", vibe: "기본값과 같은 계열 · 표준 세리프", weights: [400, 700] },
  { family: "Merriweather", lang: "latin", group: "serif", label: "Merriweather", vibe: "읽기 편한 본문 세리프", weights: [400, 700] },
  { family: "Lora", lang: "latin", group: "serif", label: "Lora", vibe: "부드러운 붓 세리프", weights: [400, 700] },
  { family: "EB Garamond", lang: "latin", group: "serif", label: "EB Garamond", vibe: "고전 개러몬드", weights: [400, 700] },
  { family: "Libre Baskerville", lang: "latin", group: "serif", label: "Libre Baskerville", vibe: "교과서 세리프", weights: [400, 700] },
  { family: "Source Serif 4", lang: "latin", group: "serif", label: "Source Serif", vibe: "현대 학술 세리프", weights: [400, 700] },
  { family: "Crimson Pro", lang: "latin", group: "serif", label: "Crimson Pro", vibe: "밀도 높은 인문 세리프", weights: [400, 700] },
  { family: "Playfair Display", lang: "latin", group: "serif", label: "Playfair Display", vibe: "대비 강한 표제 세리프", weights: [400, 700] },

  // ── 영문 · 산세리프 ──
  { family: "Inter", lang: "latin", group: "sans", label: "Inter", vibe: "중립적인 현대 산세리프" },
  { family: "Roboto", lang: "latin", group: "sans", label: "Roboto", vibe: "표준 중립" },
  { family: "Open Sans", lang: "latin", group: "sans", label: "Open Sans", vibe: "가독 중심" },
  { family: "Lato", lang: "latin", group: "sans", label: "Lato", vibe: "따뜻한 휴머니스트" },
  { family: "Montserrat", lang: "latin", group: "sans", label: "Montserrat", vibe: "도시적 기하학" },
  { family: "Poppins", lang: "latin", group: "sans", label: "Poppins", vibe: "기하학 · 둥근" },
  { family: "Nunito", lang: "latin", group: "sans", label: "Nunito", vibe: "부드러운 라운드" },
  { family: "Work Sans", lang: "latin", group: "sans", label: "Work Sans", vibe: "깔끔한 그로테스크" },
  { family: "Source Sans 3", lang: "latin", group: "sans", label: "Source Sans", vibe: "휴머니스트 본문" },

  // ── 영문 · 손글씨 ──
  { family: "Caveat", lang: "latin", group: "hand", label: "Caveat", vibe: "생동감 있는 펜" },
  { family: "Patrick Hand", lang: "latin", group: "hand", label: "Patrick Hand", vibe: "단정한 손글씨" },
  { family: "Indie Flower", lang: "latin", group: "hand", label: "Indie Flower", vibe: "동글동글 손글씨" },
  { family: "Shadows Into Light", lang: "latin", group: "hand", label: "Shadows Into Light", vibe: "산뜻한 필기" },
  { family: "Architects Daughter", lang: "latin", group: "hand", label: "Architects Daughter", vibe: "도면 손글씨" },
  { family: "Coming Soon", lang: "latin", group: "hand", label: "Coming Soon", vibe: "둥근 마커 필기" },
  { family: "Schoolbell", lang: "latin", group: "hand", label: "Schoolbell", vibe: "교실 필기체" },
  { family: "Gloria Hallelujah", lang: "latin", group: "hand", label: "Gloria Hallelujah", vibe: "공책 낙서체" },

  // ── 영문 · 디스플레이 ──
  { family: "Bangers", lang: "latin", group: "display", label: "Bangers", vibe: "코믹북 외침" },
  { family: "Luckiest Guy", lang: "latin", group: "display", label: "Luckiest Guy", vibe: "두툼한 카툰 대문자" },
  { family: "Comic Neue", lang: "latin", group: "display", label: "Comic Neue", vibe: "정돈된 코믹 본문" },
  { family: "Lilita One", lang: "latin", group: "display", label: "Lilita One", vibe: "굵은 라운드 포스터" },
  { family: "Fredoka", lang: "latin", group: "display", label: "Fredoka", vibe: "친근한 라운드" },
  { family: "Baloo 2", lang: "latin", group: "display", label: "Baloo 2", vibe: "통통한 라운드" },

  // ── 영문 · 고정폭 (카탈로그 밖) ──
  { family: "JetBrains Mono", lang: "latin", group: "mono", label: "JetBrains Mono", vibe: "코드용 고정폭", weights: [400, 700] },
  { family: "IBM Plex Mono", lang: "latin", group: "mono", label: "IBM Plex Mono", vibe: "테크니컬 고정폭", weights: [400, 700] },
];

const BY_FAMILY = new Map(WORKSHEET_FONTS.map((f) => [f.family, f]));

export const WORKSHEET_GROUP_LABELS: Record<WorksheetFontGroup, string> = {
  sans: "고딕 / Sans",
  serif: "명조 / Serif",
  hand: "손글씨",
  display: "디스플레이",
  mono: "고정폭",
};

export function worksheetFontOf(family?: string): WorksheetFont | undefined {
  return family ? BY_FAMILY.get(family) : undefined;
}

/** 카탈로그에 있으면 한글 라벨, 없으면(수기 입력·구버전 데이터) family 원문. */
export function worksheetFontLabel(family?: string): string {
  if (!family) return "기본";
  return BY_FAMILY.get(family)?.label ?? family;
}

// ─────────────────────────────────────────────────────────────────────────────
// 스택
// ─────────────────────────────────────────────────────────────────────────────

/** 한글 기본 스택(= report-styles 의 --font-ko 기본값). 폴백 꼬리로 항상 붙인다. */
export const WORKSHEET_KO_FALLBACK = REPORT_LAYOUT.fontKo;
/** 영문 기본 스택(= buildReportRootStyle 의 --font-en 기본값). */
export const WORKSHEET_EN_FALLBACK = REPORT_LAYOUT.fontEnSerif;

/**
 * 선택 서체 → CSS font-family 스택. lang 은 **폴백 꼬리**만 고른다(글리프가 없는
 * 문자를 어떤 서체로 떨어뜨릴지). 영문 서체를 한글 축에 지정해도 한글은 꼬리로
 * 떨어져 그려지므로 조판이 깨지지 않는다.
 */
export function worksheetFontStack(family: string | undefined, lang: WorksheetFontLang): string {
  const f = (family ?? "").trim();
  if (!f) return lang === "latin" ? WORKSHEET_EN_FALLBACK : WORKSHEET_KO_FALLBACK;
  // 영문 축이어도 한글 폴백을 항상 뒤에 남긴다 — 그래야 혼용 문단이 살아난다.
  const tail =
    lang === "latin"
      ? `${WORKSHEET_EN_FALLBACK}, ${WORKSHEET_KO_FALLBACK}`
      : WORKSHEET_KO_FALLBACK;
  return `"${f.replace(/"/g, "")}", ${tail}`;
}

/**
 * 선택 구간(FontRun) 전용 스택 — 축(한글/영문)이 **없는** 자리다. 사용자가 글자를
 * 직접 집어 고른 것이므로 카탈로그의 lang 으로 폴백 꼬리만 정하고, 한글 꼬리는
 * 어느 쪽이든 항상 남긴다(영문 서체를 고른 한영 혼용 구간이 두부가 되지 않게).
 */
export function worksheetRunFontStack(family: string): string {
  return worksheetFontStack(family, BY_FAMILY.get(family)?.lang ?? "ko");
}

// ─────────────────────────────────────────────────────────────────────────────
// 로더
// ─────────────────────────────────────────────────────────────────────────────

const extraInjected = new Set<string>();

/** 웹툰 카탈로그 밖 서체의 Google Fonts CSS2 링크 주입(멱등). */
function injectExtraFontCss(f: WorksheetFont): void {
  if (typeof document === "undefined") return;
  if (extraInjected.has(f.family)) return;
  extraInjected.add(f.family);
  const fam = f.family.replace(/ /g, "+");
  const weights = f.weights?.length ? f.weights : [400, 700];
  const w = `:wght@${[...weights].sort((a, b) => a - b).join(";")}`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${fam}${w}&display=swap`;
  link.setAttribute("data-worksheet-font", f.family);
  document.head.appendChild(link);
}

/** 한 패밀리의 @font-face CSS 를 주입(멱등). 서버에서는 no-op. */
export function injectWorksheetFontCss(family?: string): void {
  if (typeof document === "undefined" || !family) return;
  if (inWebtoonCatalog(family)) {
    injectFontCss(family);
    return;
  }
  const f = BY_FAMILY.get(family);
  if (f) injectExtraFontCss(f);
}

let previewInjected = false;
/** 피커 전용 — 목록 전체 CSS 일괄 주입(열리는 순간에만 호출할 것). */
export function injectWorksheetFontPreviewCss(): void {
  if (typeof document === "undefined" || previewInjected) return;
  previewInjected = true;
  for (const f of WORKSHEET_FONTS) injectWorksheetFontCss(f.family);
}

/**
 * 실제로 쓰인 패밀리만 **로드 완료까지** 보장. 반환 Promise 가 resolve 된 뒤에야
 * 글자 폭이 확정되므로, 호출부는 여기서 재측정을 트리거해야 한다.
 */
export async function ensureWorksheetFonts(families: Array<string | undefined>): Promise<void> {
  if (typeof document === "undefined") return;
  const unique = [...new Set(families.map((f) => (f ?? "").trim()).filter(Boolean))];
  if (unique.length === 0) return;
  await Promise.all(
    unique.map(async (family) => {
      if (inWebtoonCatalog(family)) {
        await ensureWebtoonFont(family);
        return;
      }
      injectWorksheetFontCss(family);
      if (!("fonts" in document)) return;
      const f = BY_FAMILY.get(family);
      const weights = f?.weights?.length ? f.weights : [400, 700];
      await Promise.all(
        weights.map((w) => document.fonts.load(`${w} 16px "${family}"`).catch(() => {})),
      );
    }),
  );
}
