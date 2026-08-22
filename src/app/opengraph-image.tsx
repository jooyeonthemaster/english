import { ImageResponse } from "next/og";

/**
 * 전역 Open Graph 이미지(1200x630). Next 파일 컨벤션으로 모든 라우트의
 * og:image / twitter:image 기본값이 된다(개별 라우트가 opengraph-image 를
 * 따로 두면 그쪽이 우선).
 *
 * 한글 렌더를 위해 폰트를 fetch 하되, 실패해도 빌드/렌더가 깨지지 않도록
 * try/catch 폴백한다(폴백 시 라틴 기본 폰트로 브랜드/도메인은 정상 표시).
 */

export const alt = "SMOAT — 영어학원 AI 올인원";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_SOURCES = [
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/public/static/Pretendard-Bold.otf",
  "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf",
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-700-normal.woff",
];

async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  for (const url of FONT_SOURCES) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.arrayBuffer();
    } catch {
      // 다음 후보로
    }
  }
  return null;
}

export default async function OpengraphImage() {
  const font = await loadKoreanFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background:
            "linear-gradient(135deg, #0B1B3F 0%, #11296B 55%, #1D4ED8 100%)",
          color: "#FFFFFF",
          fontFamily: font ? "Pretendard" : "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 30,
            letterSpacing: 6,
            color: "#93C5FD",
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#3B82F6",
            }}
          />
          ENGLISH AI WORKBENCH
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 120,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          SMOAT
        </div>

        <div
          style={{
            marginTop: 24,
            fontSize: 50,
            fontWeight: 700,
            lineHeight: 1.25,
            color: "#F8FAFC",
          }}
        >
          영어학원 AI 올인원
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 30,
            fontWeight: 500,
            color: "#CBD5F5",
          }}
        >
          지문 분석 · 24유형 문제 생성 · Word·한글 시험지 · 시험 리포트
        </div>

        <div
          style={{
            marginTop: 44,
            fontSize: 26,
            fontWeight: 600,
            color: "#60A5FA",
          }}
        >
          www.smoat.co.kr
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Pretendard", data: font, weight: 700, style: "normal" }]
        : [],
    },
  );
}
