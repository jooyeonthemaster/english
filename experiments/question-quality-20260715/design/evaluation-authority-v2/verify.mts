import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifestText,
  buildProtocol,
  buildProtocolMarkdown,
  buildPublicManifest,
  MANIFEST_FILES,
  PACKAGE_FILES,
  repoRootFromPackage,
  sha256File,
  stableJson,
  UPSTREAMS,
  validateProtocol,
} from "./authority-core.mts";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = repoRootFromPackage(packageDir);

const protocolText = await readFile(path.join(packageDir, "protocol.json"), "utf8");
const protocol = JSON.parse(protocolText);
validateProtocol(protocol);
assert.equal(protocolText, stableJson(buildProtocol()), "protocol canonical bytes");
assert.equal(await readFile(path.join(packageDir, "PROTOCOL.md"), "utf8"), buildProtocolMarkdown(), "protocol markdown bytes");

for (const upstream of UPSTREAMS) {
  assert(!upstream.path.split(/[\\/]/).some((part) => part.toLowerCase() === "private"), `private upstream: ${upstream.path}`);
  assert.equal(await sha256File(path.join(repoRoot, upstream.path)), upstream.sha256, `upstream drift: ${upstream.path}`);
}

const publicManifest = JSON.parse(await readFile(path.join(packageDir, "public-manifest.json"), "utf8"));
assert.equal(stableJson(publicManifest), stableJson(await buildPublicManifest(repoRoot, packageDir)), "public manifest mismatch");
assert.equal(publicManifest.status, "DESIGN_ONLY_EXECUTION_BLOCKED");
assert.equal(publicManifest.authority.evaluatorAuthorityGranted, false);
assert.equal(publicManifest.authority.scoringAuthorityGranted, false);
assert.equal(publicManifest.authority.authorizedReviewers, 0);

const expectedManifest = await buildManifestText(packageDir);
assert.equal(await readFile(path.join(packageDir, "MANIFEST.sha256"), "utf8"), expectedManifest, "MANIFEST mismatch");
const manifestNames = expectedManifest.trimEnd().split("\n").map((line) => line.slice(66));
assert.deepEqual(manifestNames, [...MANIFEST_FILES], "manifest membership/order");

const allowedFiles = new Set([...PACKAGE_FILES, "public-manifest.json", "MANIFEST.sha256"]);
const observedFiles = (await readdir(packageDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(observedFiles, [...allowedFiles].sort(), "unexpected or missing package file");

const tsconfig = JSON.parse(await readFile(path.join(packageDir, "tsconfig.json"), "utf8"));
assert.deepEqual(tsconfig.exclude, [], "tsconfig exclude must be []");
assert.deepEqual(tsconfig.files, ["authority-core.mts", "build.mts", "verify.mts", "hostile-tests.mts"], "tsconfig exact inputs");
assert.equal(Object.hasOwn(tsconfig, "extends"), false, "tsconfig must not inherit ambient root config");

const packageSha = await sha256File(path.join(packageDir, "public-manifest.json"));
console.log(JSON.stringify({
  artifactId: "evaluation-authority-v2",
  verdict: "PASS_DESIGN_ONLY_EXECUTION_BLOCKED",
  evaluatorAuthorityGranted: false,
  authorizedReviewers: 0,
  publicManifestSha256: packageSha,
  manifestFileSha256: await sha256File(path.join(packageDir, "MANIFEST.sha256")),
}, null, 2));
