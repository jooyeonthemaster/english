// 프로덕션 프롬프트 덤프 — md-stream 이 모델에게 실제로 주는 유형 프롬프트 전문을 출력한다.
// A/B 실측의 A안(프로덕션 공예 지침) 입력으로 쓴다.
//
// 실행:
//   node_modules/.bin/tsx qbank/harness/prod-prompt.ts --type TITLE --passage <id> [--difficulty KILLER] [--settings '{"optionCount":6}']
//   ... --no-passage   (지문 블록을 잘라내고 공예 지침만 — A/B 에서 지문은 별도 주입하므로)

import fs from "node:fs";
import path from "node:path";
import { buildProductionPrompt } from "./qgen-core";
import type { MdDifficulty } from "../../src/lib/md-qgen/prompts";

const argv = process.argv.slice(2);
const arg = (n: string) => {
  const i = argv.indexOf("--" + n);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (n: string) => argv.includes("--" + n);

const subType = arg("type");
const passageId = arg("passage");
if (!subType || !passageId) {
  console.error("사용법: prod-prompt.ts --type <SUBTYPE> --passage <passageId> [--difficulty BASIC|INTERMEDIATE|KILLER] [--settings <json>] [--no-passage]");
  process.exit(2);
}

const rows = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src/data/exam-passages/passages.json"), "utf8"),
) as { id: string; text: string }[];
const p = rows.find((r) => r.id === passageId);
if (!p) {
  console.error(`지문 없음: ${passageId}`);
  process.exit(2);
}

let rawTypeSettings: unknown = null;
const s = arg("settings");
if (s) {
  try {
    rawTypeSettings = { [subType]: JSON.parse(s) };
  } catch (e) {
    console.error("settings JSON 파싱 실패:", (e as Error).message);
    process.exit(2);
  }
}

const built = buildProductionPrompt({
  subType,
  passage: p.text,
  difficulty: (arg("difficulty") || "KILLER") as MdDifficulty,
  rawTypeSettings,
});

if (!built.ok) {
  console.error(built.error);
  process.exit(1);
}

let out = built.prompt;
if (built.extras.length) out += "\n\n" + built.extras.join("\n\n");

if (has("no-passage")) {
  // base 의 맨 끝이 `## 지문\n{passage}` 이다(정찰 확정, recon/00-contract.md §9).
  // A/B 에서는 지문을 별도 주입하므로 그 블록만 잘라낸다.
  const i = out.lastIndexOf("## 지문");
  if (i > 0) out = out.slice(0, i).trimEnd();
}

console.log(out);
