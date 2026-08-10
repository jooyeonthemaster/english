import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "next-env.d.ts",
    ".vercel/**",

    // Vendored/generated artifacts. They are consumed by the app but should
    // not determine source lint health.
    "public/**/*.min.*",
    "public/pdf*.mjs",
    "scripts/_gen_audit_out/**",

    // Remotion scenes are maintained as a separate rendering surface and need
    // their own lint pass before they can share the stricter app rules.
    "remotion/**",
  ]),
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Baseline legacy debt as warnings so `npm run lint` can be used as a
      // merge gate again. Tighten these back to errors path-by-path as files
      // are migrated off @ts-nocheck/any.
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-explicit-any": "warn",

      // React Compiler rules expose useful modernization work, but this app
      // already has a backlog of older patterns. Keep visibility without
      // blocking unrelated merges.
      "react-hooks/error-boundaries": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // ── 조판대(Composing Desk) 전용 규칙 — 워크벤치 "AI로 지문 만들기" ──
    // Sparkles(별 반짝이) 아이콘 금지는 오너의 명시 지시이며, 이 디렉터리에는
    // 이미 세 파일이 주석으로만 그 금지를 적어 두고 있었다(주석은 강제가 아니다).
    // 이 기능의 대표 아이콘은 PenLine 이다.
    // 나머지 4종(원시 px 리터럴 · .5 간격 · 알파 배경 · amber/orange/violet ·
    // JSX 한글 리터럴)은 정규식 게이트가 더 정확해서 eslint 가 아니라
    // scripts/check-authoring-tokens.mjs 가 맡는다.
    // ※ 경로에 괄호가 들어간 라우트 그룹 '(director)' 는 글로브에서 확장 패턴으로
    //   오해될 수 있어 '**' 로 우회한다.
    files: ["src/app/**/director/workbench/generate/intake/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              importNames: ["Sparkle", "SparkleIcon", "Sparkles", "SparklesIcon"],
              message:
                "Sparkles(별 반짝이) 아이콘은 이 기능에서 금지입니다(오너 지시). 대표 아이콘은 PenLine 을 쓰세요.",
            },
          ],
          patterns: [
            {
              group: ["lucide-react/**sparkle**", "lucide-react/**Sparkle**"],
              message:
                "Sparkles(별 반짝이) 아이콘은 이 기능에서 금지입니다(오너 지시). 대표 아이콘은 PenLine 을 쓰세요.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
