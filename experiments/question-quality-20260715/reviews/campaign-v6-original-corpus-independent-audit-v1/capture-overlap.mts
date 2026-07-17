import { writeFileSync } from "node:fs";

import { paths, scanRepositoryForOverlap, sha256 } from "./core.mts";

const capturedAtKst = "2026-07-15T16:31:00+09:00";
const capture = scanRepositoryForOverlap(capturedAtKst);
const bytes = `${JSON.stringify(capture, null, 2)}\n`;
writeFileSync(paths.overlapCapture, bytes, "utf8");

console.log(
  JSON.stringify(
    {
      status: "CAPTURED",
      scannedFileCount: capture.scannedFileCount,
      scannedUtf8ByteCount: capture.scannedUtf8ByteCount,
      hitFileRowPairCount: capture.hitFileRowPairCount,
      captureSha256: sha256(bytes),
      apiCalls: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
    },
    null,
    2,
  ),
);
