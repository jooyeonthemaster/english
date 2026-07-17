import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifestText,
  buildProtocol,
  buildProtocolMarkdown,
  buildPublicManifest,
  repoRootFromPackage,
  stableJson,
  validateProtocol,
} from "./authority-core.mts";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = repoRootFromPackage(packageDir);
const write = process.argv.includes("--write");

async function expectOrWrite(name: string, expected: string): Promise<void> {
  const target = path.join(packageDir, name);
  if (write) {
    await writeFile(target, expected, "utf8");
    return;
  }
  const observed = await readFile(target, "utf8");
  if (observed !== expected) throw new Error(`${name} differs; run build.mts --write inside this package`);
}

const protocol = buildProtocol();
validateProtocol(protocol);
await expectOrWrite("protocol.json", stableJson(protocol));
await expectOrWrite("PROTOCOL.md", buildProtocolMarkdown());

const publicManifest = await buildPublicManifest(repoRoot, packageDir);
for (const upstream of publicManifest.upstreams) {
  if (upstream.observedSha256 !== upstream.sha256) throw new Error(`upstream drift: ${upstream.path}`);
}
await expectOrWrite("public-manifest.json", stableJson(publicManifest));
await expectOrWrite("MANIFEST.sha256", await buildManifestText(packageDir));

console.log(`evaluation-authority-v2 build ${write ? "WRITE" : "CHECK"}: PASS`);
