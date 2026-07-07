/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { readFileSync } from "fs";

async function main() {
  const { structureExamFromText } = await import("../src/lib/exam-report/structure");
  const text = readFileSync(
    "C:/Users/jooye/AppData/Local/Temp/claude/c--Users-jooye-Desktop-2026project-nara/044aea34-e6a0-4bff-a367-2074437fe8ac/scratchpad/exam-report/fixtures/exam-text.txt",
    "utf8",
  );
  const usage = { promptTokens: 0, completionTokens: 0, calls: 0 };
  await structureExamFromText({
    text,
    examMeta: { title: "진단", examType: "FINAL" },
    usage,
    onEscalation: (info: { range: string; reason: string }) =>
      console.log("[ESCALATION]", info.range, "→", info.reason),
  } as never);
  console.log("calls:", usage.calls);
}
main().catch((e) => { console.error(e); process.exit(1); });
