import type { NextConfig } from "next";

// 서비스 사용자는 전원 한국에 있으므로 모든 타임스탬프 기준을 한국시간(KST)으로 고정한다.
// 배포 서버(Vercel/Node)는 기본 UTC라 SSR·서버액션에서 toLocale*()·new Date() 표시가
// 9시간 어긋난다. 핵심 포매터(src/lib/utils.ts)는 Intl로 Asia/Seoul을 명시해 TZ에
// 무관하게 동작하지만, 직접 toLocale*()를 쓰는 곳까지 일괄로 맞추려고 런타임 TZ 자체를
// Asia/Seoul로 고정한다. (호스팅 대시보드에도 환경변수 TZ=Asia/Seoul 설정 권장.)
process.env.TZ = process.env.TZ ?? "Asia/Seoul";

const nextConfig: NextConfig = {
  // IR 덱(정적, public/ir/) — /ir 로 접근 가능하게만 하고 메인 어디에도 링크하지 않음.
  // public 파일은 정확한 경로만 매칭되므로 /ir → /ir/index.html 리라이트가 필요.
  // 원본은 ir-deck/, 수정 후 `node scripts/sync-ir-deck.mjs` 로 동기화.
  async rewrites() {
    return [{ source: "/ir", destination: "/ir/index.html" }];
  },

  // 원장 홈(/director)은 사실상의 메인 = "문제 생성" 페이지로 보낸다. 예전에는
  // src/app/(director)/director/page.tsx 에서 서버 컴포넌트 redirect()로 흘려보냈지만,
  // Next 16의 클라이언트 Router 가 "페이지 레벨 redirect()"를 초기 하이드레이션할 때
  // useMemo 훅 개수 불일치(React #310: "Rendered more hooks than during the previous
  // render")로 크래시한다 — /director 를 브라우저 주소창 직접입력·새로고침·북마크로
  // '풀 로드' 하면 HTTP 200 을 받은 뒤 클라이언트에서 "Application error: a client-side
  // exception" 로 죽었다(클라이언트 <Link> 이동은 RSC redirect 라 살아남아 증상이
  // 산발적으로 보였다). 라우팅 레이어에서 진짜 HTTP 307 로 처리하면 /director 의 React
  // 트리 자체가 렌더되지 않아 버그를 원천 차단한다. source 는 정확히 "/director" 만
  // 매칭(자식 경로 /director/... 는 영향 없음), destination 은 자기 자신이 아니므로 루프 없음.
  async redirects() {
    return [
      {
        source: "/director",
        destination: "/director/workbench/questions/generate",
        permanent: false,
      },
      // /director/korean 도 페이지 컴포넌트 redirect()를 거치면 같은 React #310이
      // 발생한다. exact redirect로 자식 국어 라우트에는 영향을 주지 않고 우회한다.
      {
        source: "/director/korean",
        destination: "/director/korean/generate",
        permanent: false,
      },
    ];
  },

  // 서버 액션(회원 CSV 내보내기)에서 CP949 인코딩에 쓰는 iconv-lite는
  // 동적 require가 있어 번들 대신 node_modules에서 직접 로드한다.
  serverExternalPackages: ["iconv-lite"],

  // release-notes/*.md 는 런타임에 fs 로 읽어(배포 시 자동 공지 발행, src/instrumentation.ts)
  // 파일 추적으로는 안 잡히므로 서버 번들에 강제 포함한다. 광범위 키로 모든 진입점에 포함.
  outputFileTracingIncludes: {
    "/**": ["./release-notes/**/*.md"],
  },

  experimental: {
    // 시험지 생성 저장은 문항·지문 본문 + 학원 로고(최대 1.5MB)·삽입 이미지(base64,
    // ~33% 팽창)를 통째로 서버 액션 본문에 실어 보낸다. 기본 1MB 한도를 넘기면 HTTP 413
    // ("Body exceeded 1 MB limit", digest …@E394) 또는 "server-side exception"으로
    // 저장/다운로드가 통째로 실패한다 → 한도 상향. 근본 해결은 이미지를 스토리지에 올리고
    // URL만 저장하는 것.
    serverActions: {
      bodySizeLimit: "10mb",
    },
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "@radix-ui/react-icons",
      "framer-motion",
    ],
  },

  // Build-time quality gates, by layer:
  //
  //  - TypeScript: enforced. `typescript.ignoreBuildErrors` defaults to
  //    `false` so `next build` fails on any TS error. New code in the
  //    extraction pipeline (src/lib/extraction/**, src/trigger/**,
  //    src/app/api/extraction/**,
  //    src/app/(director)/director/workbench/passages/import/**,
  //    src/hooks/use-extraction-*.ts) is kept TS-clean. The legacy parts
  //    of this codebase use targeted `@ts-nocheck` escape hatches tracked
  //    by their respective owners — we do not touch those here.
  //
  //  - ESLint: **not** a build gate. Next 16 removed the `eslint` field
  //    from NextConfig entirely — `next build` no longer runs ESLint,
  //    regardless of what we set. We run lint separately via
  //    `npm run lint` in CI / pre-commit hooks, and any lint failure in
  //    the extraction-pipeline scope above is treated as a blocker there.
  //    (See also: README / BULK-PASSAGE-EXTRACTION.md.)

  // `pdfjs-dist` (used by the bulk passage extractor on the client) optionally
  // references the `canvas` native module, which we never use in the browser.
  // We stub it out so neither bundler tries to resolve the native dep — keep
  // dev (Turbopack) and build (webpack) in parity:
  //   - dev runs `next dev --turbopack` → turbopack.resolveAlias below
  //   - `next build --webpack`          → the webpack alias below
  // Turbopack can't alias to `false`, so it points at an empty stub (empty.ts).
  turbopack: {
    resolveAlias: {
      canvas: { browser: "./empty.ts" },
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
