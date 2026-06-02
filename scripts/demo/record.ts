/**
 * CLI: record one (or all) guide flow(s) against the deployed site, then
 * regenerate the Remotion manifest.
 *
 *   npm run demo:record -- director-tour      # one flow
 *   npm run demo:record -- --all              # every flow in FLOWS
 *
 * Env:
 *   DEMO_BASE_URL   site to record (default: process.env.PLAYWRIGHT_BASE_URL or prod)
 *   DEMO_EMAIL      login id    (default: jooyeon)
 *   DEMO_PASSWORD   login pw    (default: jooyeon)
 */
import { record } from "./recorder";
import { FLOWS, findFlow } from "./flows";
import { regenerateManifest } from "./manifest";

async function main() {
  const arg = process.argv[2];
  const baseURL =
    process.env.DEMO_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "https://smoat.kr";

  if (!arg) {
    console.error("Usage: npm run demo:record -- <flow-name | --all>");
    console.error("Flows:", FLOWS.map((f) => f.name).join(", "));
    process.exit(1);
  }

  const toRun = arg === "--all" ? FLOWS : [findFlow(arg)].filter(Boolean);
  if (!toRun.length) {
    console.error(`Unknown flow: ${arg}. Available:`, FLOWS.map((f) => f.name).join(", "));
    process.exit(1);
  }

  console.log(`Recording against ${baseURL}`);
  for (const flow of toRun) {
    console.log(`▶ ${flow!.name} …`);
    await record(flow!, baseURL);
  }
  await regenerateManifest();
  console.log("Done. Preview:  npm run remotion:preview");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
