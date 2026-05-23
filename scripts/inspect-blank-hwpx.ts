import { readFileSync } from "node:fs";
import JSZip from "jszip";

async function main() {
  const buf = readFileSync("c:/tmp/hwpxlib-check/testFile/tool/blank.hwpx");
  const zip = await JSZip.loadAsync(buf);
  console.log(`SIZE: ${buf.length} bytes\n`);
  console.log(`ENTRIES:`);
  for (const name of Object.keys(zip.files).sort()) {
    const f = zip.files[name];
    if (f.dir) {
      console.log(`  [DIR] ${name}`);
    } else {
      console.log(`  [FILE] ${name}`);
    }
  }
  for (const name of Object.keys(zip.files).sort()) {
    const f = zip.files[name];
    if (f.dir) continue;
    if (name === "mimetype") {
      const c = await f.async("string");
      console.log(`\n=== ${name} (${c.length} chars) ===\n[${c}]`);
      continue;
    }
    if (name.endsWith(".xml") || name.endsWith(".hpf") || name.endsWith(".rdf")) {
      const c = await f.async("string");
      console.log(`\n=== ${name} (${c.length} chars) ===\n${c}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
