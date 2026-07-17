import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const names = [
  "README.md",
  "protocol.json",
  "verify.mts",
  "finalize-manifest.mjs",
  "tsconfig.json",
];
const lines = names.map((name) => {
  const digest = createHash("sha256")
    .update(readFileSync(path.join(here, name)))
    .digest("hex");
  return `${digest}  ${name}`;
});
writeFileSync(path.join(here, "MANIFEST.sha256"), `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ verdict: "WROTE", files: names.length }, null, 2));
