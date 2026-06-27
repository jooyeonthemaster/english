import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // IR 덱(정적, public/ir/) — /ir 로 접근 가능하게만 하고 메인 어디에도 링크하지 않음.
  // public 파일은 정확한 경로만 매칭되므로 /ir → /ir/index.html 리라이트가 필요.
  // 원본은 ir-deck/, 수정 후 `node scripts/sync-ir-deck.mjs` 로 동기화.
  async rewrites() {
    return [{ source: "/ir", destination: "/ir/index.html" }];
  },

  // 서버 액션(회원 CSV 내보내기)에서 CP949 인코딩에 쓰는 iconv-lite는
  // 동적 require가 있어 번들 대신 node_modules에서 직접 로드한다.
  serverExternalPackages: ["iconv-lite"],

  experimental: {
    // 시험지 빌더 저장은 문항·지문 본문을 통째로 서버 액션 본문에 실어 보낸다.
    // 문항이 많은 시험지는 기본 1MB 한도를 넘겨 HTTP 413("Body exceeded 1 MB
    // limit", digest …@E394)로 저장/다운로드가 통째로 실패한다 → 한도 상향.
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
