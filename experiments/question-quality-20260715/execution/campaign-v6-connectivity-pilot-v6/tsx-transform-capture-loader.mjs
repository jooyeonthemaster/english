import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initialize as initializeTsx,
  load as loadTsx,
  resolve as resolveTsx,
} from "tsx/esm";

const capturePath = process.env.QGEN_V6_TRANSFORM_CAPTURE_PATH;
const role = process.env.QGEN_V6_TRANSFORM_ROLE;
if (!capturePath || !role)
  throw new Error("sealed transform capture control is absent");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export const initialize = initializeTsx;

export async function resolve(specifier, context, nextResolve) {
  const result = await resolveTsx(specifier, context, nextResolve);
  // The v6 authority sources are ESM.  Forcing .ts/.tsx to module here keeps
  // Node from diverting their execution through an unobservable CJS hook.
  if (
    result.url.startsWith("file:") &&
    /\.(?:ts|tsx)(?:\?|$)/u.test(result.url)
  ) {
    return { ...result, format: "module" };
  }
  return result;
}

export async function load(url, context, nextLoad) {
  // This wrapper is the only registered TypeScript loader. It records the
  // exact bytes returned by tsx to Node, not the source seen by an outer hook.
  const result = await loadTsx(url, context, nextLoad);
  if (url.startsWith("file:") && /\.(?:[cm]?ts|tsx)(?:\?|$)/u.test(url)) {
    const sourcePath = fileURLToPath(new URL(url));
    const sourceBytes = readFileSync(sourcePath);
    const emittedBytes =
      typeof result.source === "string"
        ? Buffer.from(result.source, "utf8")
        : Buffer.from(result.source ?? []);
    if (emittedBytes.byteLength < 1)
      throw new Error("tsx loader returned no executed JavaScript bytes");
    const row = {
      role,
      sourcePath,
      sourceBytes: sourceBytes.byteLength,
      sourceSha256: sha256(sourceBytes),
      emittedFormat: result.format,
      emittedJsBytes: emittedBytes.byteLength,
      emittedJsSha256: sha256(emittedBytes),
    };
    appendFileSync(capturePath, JSON.stringify(row) + "\n", {
      encoding: "utf8",
      flag: "a",
    });
  }
  return result;
}
