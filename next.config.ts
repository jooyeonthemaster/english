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
    // 시험지 빌더 저장 페이로드에는 학원 로고(최대 1.5MB)와 삽입 이미지가
    // base64 data URL로 통째로 실린다. base64는 ~33% 커지므로 기본 1MB 한도를
    // 쉽게 넘겨 "server-side exception"으로 저장이 깨졌다(로고 쓰는 학원만 발생).
    // 한도를 올려 핫픽스. 근본 해결은 이미지를 스토리지에 올리고 URL만 저장하는 것.
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

  // `pdfjs-dist` (used by the bulk passage extractor on the client) has an
  // optional `canvas` node dependency that we never use in the browser.
  // Tell webpack to treat it as unresolved so the build doesn't look for
  // the native module. `dev --webpack` is set in package.json so we stay
  // on the webpack path.
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
