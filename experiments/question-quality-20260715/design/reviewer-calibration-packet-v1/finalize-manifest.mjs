import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

const excluded = new Set(["MANIFEST.sha256"]);
const files = walk(here)
  .filter((path) => !excluded.has(relative(here, path).replaceAll("\\", "/")))
  .sort((a, b) => relative(here, a).localeCompare(relative(here, b)));
const rows = files.map((path) => {
  if (!statSync(path).isFile()) throw new Error(`NOT_FILE:${path}`);
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  return `${hash}  ${relative(here, path).replaceAll("\\", "/")}`;
});
writeFileSync(join(here, "MANIFEST.sha256"), `${rows.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ manifestEntries: rows.length }, null, 2)}\n`);
