import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

async function main() {
  const buf = readFileSync("c:/tmp/hwpxlib-check/testFile/reader_writer/MultiColumn.hwpx");
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.files["Contents/section0.xml"].async("string");
  writeFileSync("c:/tmp/multicolumn-section.xml", xml);
  console.log(`Wrote ${xml.length} chars to c:/tmp/multicolumn-section.xml`);

  // Find colPr blocks
  const colPrMatches = xml.match(/<hp:colPr[^>]*>/g);
  console.log(`\ncolPr occurrences:`);
  colPrMatches?.forEach((m) => console.log(`  ${m}`));

  // Find ctrl wrappers around colPr
  const ctrlBlocks = [...xml.matchAll(/<hp:ctrl>[\s\S]*?<\/hp:ctrl>/g)];
  console.log(`\n<hp:ctrl> blocks: ${ctrlBlocks.length}`);
  ctrlBlocks.slice(0, 5).forEach((m, i) => {
    console.log(`\n--- ctrl[${i}] ---`);
    console.log(m[0].slice(0, 500));
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
