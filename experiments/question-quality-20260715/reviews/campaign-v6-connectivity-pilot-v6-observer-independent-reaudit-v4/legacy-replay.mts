import { createHash } from "node:crypto";
import Module from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V3 = path.resolve(HERE, "../campaign-v6-connectivity-pilot-v6-observer-independent-reaudit-v3");
const CURRENT_SUBJECT = "8df2072304c3bc48873dac05889c6d22ddf313f25fa321f9e6baac69fcc1fd3a";
const CURRENT_OFFLINE = "212dadaad0f3812c2f4c2836bf4048694f237f8aeb618937bf09cd44149f5172";
const PRIOR_SUBJECT = "736911a9f5763c17ec839ed30c04e960503ab803fdd4c1b8af220a49106bb2bb";
const PRIOR_OFFLINE = "30a04ca8e82fabca47f2a432a6c1182b17053f6e195ba5c9c40abb075606a4b3";

const entries = {
  "917": {
    name: "predecessor-replay.ts",
    sha256: "d11331a55ecb9380cfb567de4f47b404eddb5bcb6fc01f91732a27ec184bd47a",
  },
  "986": {
    name: "audit.ts",
    sha256: "98457fdb533bf3a88b54f59351cccad6a62cc3121cfb77e042382a93ea0cb847",
  },
} as const;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const requested = process.argv[2] as keyof typeof entries | undefined;
assert(requested === "917" || requested === "986", "usage: legacy-replay.mts <917|986>");
const entry = entries[requested];
const sourcePath = path.join(V3, entry.name);
const sealedBytes = readFileSync(sourcePath);
assert(sha256(sealedBytes) === entry.sha256, `sealed v3 source drift: ${entry.name}`);
const sealed = sealedBytes.toString("utf8");
assert((sealed.match(new RegExp(PRIOR_SUBJECT, "gu")) ?? []).length === 1,
  `prior subject binding occurrence drift: ${entry.name}`);
const offlineBindings = (sealed.match(new RegExp(PRIOR_OFFLINE, "gu")) ?? []).length;
assert(offlineBindings === (requested === "986" ? 1 : 0),
  `prior offline binding occurrence drift: ${entry.name}`);
const rebound = sealed.replace(PRIOR_SUBJECT, CURRENT_SUBJECT).replace(PRIOR_OFFLINE, CURRENT_OFFLINE);
const compiled = transformSync(rebound, {
  loader: "ts",
  format: "cjs",
  platform: "node",
  target: "node24",
  sourcefile: sourcePath,
  sourcemap: false,
}).code;

const replayModule = new Module(sourcePath);
replayModule.filename = sourcePath;
replayModule.paths = (Module as unknown as { _nodeModulePaths(value: string): string[] })
  ._nodeModulePaths(path.dirname(sourcePath));
(replayModule as unknown as { _compile(value: string, filename: string): void })._compile(compiled, sourcePath);
