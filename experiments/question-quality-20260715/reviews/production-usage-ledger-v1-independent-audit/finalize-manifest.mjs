import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((name) => name !== "manifest.json").sort();
const hashes = Object.fromEntries(
  files.map((name) => [
    name,
    createHash("sha256").update(readFileSync(join(here, name))).digest("hex"),
  ]),
);
writeFileSync(join(here, "manifest.json"), `${JSON.stringify({ algorithm: "sha256", files: hashes }, null, 2)}\n`);
console.log(JSON.stringify({ files: files.length }, null, 2));
