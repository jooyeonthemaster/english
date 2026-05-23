import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import JSZip from "jszip";
import path from "node:path";
import { packageHwpx } from "../src/app/api/exams/[examId]/export-hwpx/_lib/package";

async function main() {
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
        columns: 1 as const,
        columnGapHpu: 2268,
        blocks: [
          {
            kind: "p" as const,
            style: { align: "CENTER" as const },
            runs: [
              {
                kind: "text" as const,
                text: "안녕하세요 Hello 123",
                style: { size: 14, bold: true },
              },
            ],
          },
        ],
      },
    ],
  };

  const buf = await packageHwpx(doc);
  const outDir = "c:/tmp/hwpx-test";
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "test.hwpx"), buf);
  console.log(`Wrote ${buf.length} bytes to ${outDir}/test.hwpx`);

  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files).sort()) {
    const file = zip.files[name];
    if (file.dir) continue;
    const content = await file.async("string");
    console.log(`\n=== ${name} (${content.length} chars) ===`);
    console.log(content);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
