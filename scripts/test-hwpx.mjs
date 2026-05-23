/**
 * 최소 HWPX 생성 테스트 — Hancom 호환성 진단용.
 * 우리 패키저로 빈 문서를 만들고 ZIP 내용물을 검사.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import JSZip from "jszip";
import path from "node:path";

// Inline simulating our pipeline (so we don't depend on tsc-compiled output).
import { packageHwpx } from "../src/app/api/exams/[examId]/export-hwpx/_lib/package.ts";

const doc = {
  title: "테스트 시험지",
  sections: [
    {
      pageWidthHpu: 59528,
      pageHeightHpu: 84188,
      marginLeft: 5102,
      marginRight: 5102,
      marginTop: 5102,
      marginBottom: 5102,
      marginHeader: 2834,
      marginFooter: 2834,
      columns: 1,
      columnGapHpu: 2268,
      blocks: [
        {
          kind: "p",
          style: { align: "CENTER" },
          runs: [{ kind: "text", text: "안녕하세요 Hello 123", style: { size: 14, bold: true } }],
        },
      ],
    },
  ],
};

const buf = await packageHwpx(doc);
const outDir = "c:/tmp/hwpx-test";
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "test.hwpx"), buf);
console.log(`Wrote ${buf.length} bytes`);

// Re-open and dump contents
const zip = await JSZip.loadAsync(buf);
for (const [name, file] of Object.entries(zip.files)) {
  if (file.dir) continue;
  const content = await file.async("string");
  console.log(`\n=== ${name} (${content.length} bytes) ===`);
  console.log(content.slice(0, 2000));
}
