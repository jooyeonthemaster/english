import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const files = walk(here)
  .filter((path) => relative(here, path).replaceAll("\\", "/") !== "MANIFEST.sha256")
  .sort((a, b) => relative(here, a).localeCompare(relative(here, b)));
const rows = files.map((path) => {
  if (!statSync(path).isFile()) throw new Error(`NOT_FILE:${path}`);
  return `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${relative(here, path).replaceAll("\\", "/")}`;
});
writeFileSync(join(here, "MANIFEST.sha256"), `${rows.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ manifestEntries: rows.length }, null, 2)}\n`);
