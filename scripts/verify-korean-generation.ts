/**
 * 국어(KO_*) 유형 실LLM 생성 E2E 검증 하니스.
 *   npx tsx scripts/verify-korean-generation.ts [TYPE_CODE ...] [--plan PREMIUM|STANDARD] [--diff BASIC|INTERMEDIATE|KILLER] [--retry]
 *   (인자 없으면 전 유형을 갈래 호환 샘플 지문으로 1건씩 생성)
 *   --retry: 검증 실패 시 실패 이슈 요약을 프롬프트에 주입해 1회 교정 재시도
 *
 * 각 케이스: 자작 샘플 지문 → buildKoGenerationPrompt(유형 프롬프트+품질계약) →
 * 실모델 생성(generateQuestionObject, 유형 zod 스키마) → validateKoQuestion(공통+유형
 * 게이트) → KoRenderModel 스냅샷. blocking 누수 0, 유형당 통과율을 리포트한다.
 * 통과분은 c:\tmp\ko-samples\<TYPE>.json 저장.
 *
 * 지문은 전부 자체 창작(저작권 청정, KO-DESIGN-SPEC §0-7).
 */
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { generateQuestionObject } from "../src/lib/question-generation-llm";
import { KO_TYPE_REGISTRY, KO_TYPE_IDS } from "../src/lib/korean/registry";
import { validateKoQuestion } from "../src/lib/korean/quality/dispatch";
import { readKoResolvedSettings } from "../src/lib/korean/settings";
import { buildKoGenerationPrompt } from "../src/lib/korean/prompts/generation";
import { KO_PASSAGE_KIND_LABELS, type KoPassageKind } from "../src/lib/korean/core/passage-meta";
import { KO_SAMPLE_PASSAGES, type KoSamplePassage } from "../src/lib/korean/fixtures/sample-passages";
import type { KoDifficulty, KoExamMode } from "../src/lib/korean/registry/type-module";
import { z } from "zod";

const OUT_DIR = "c:\\tmp\\ko-samples";

interface Args {
  types: string[];
  plan: "PREMIUM" | "STANDARD";
  diff: KoDifficulty;
  retry: boolean;
}
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const types: string[] = [];
  let plan: "PREMIUM" | "STANDARD" = "PREMIUM";
  let diff: KoDifficulty = "INTERMEDIATE";
  let retry = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plan") plan = argv[++i] === "STANDARD" ? "STANDARD" : "PREMIUM";
    else if (argv[i] === "--diff") {
      const d = argv[++i];
      diff = d === "BASIC" || d === "KILLER" ? d : "INTERMEDIATE";
    } else if (argv[i] === "--retry") retry = true;
    else types.push(argv[i]);
  }
  return { types: types.length ? types : [...KO_TYPE_IDS], plan, diff, retry };
}

/**
 * 유형의 passageKinds 와 호환되는 샘플 지문을 고른다.
 * 호환 픽스처가 없으면 폴백 없이 명시 에러 — 갈래 불일치 지문으로 생성한 문항은
 * 검증 결과 자체가 무의미하기 때문(예: 운문 유형을 독서 지문으로 검증).
 */
function pickPassage(typeId: string, passageKinds: KoPassageKind[]): KoSamplePassage {
  const compatible = KO_SAMPLE_PASSAGES.filter((p) => passageKinds.includes(p.kind));
  if (compatible.length === 0) {
    throw new Error(
      `${typeId}: passageKinds(${passageKinds.join(", ")})와 호환되는 샘플 지문이 없습니다 — ` +
        `src/lib/korean/fixtures/sample-passages.ts 에 해당 갈래 픽스처를 추가하세요`,
    );
  }
  return compatible[0];
}

async function runType(
  typeId: string,
  plan: "PREMIUM" | "STANDARD",
  diff: KoDifficulty,
  retry: boolean,
) {
  const mod = KO_TYPE_REGISTRY[typeId];
  if (!mod) {
    console.log(`  [SKIP] ${typeId} — 레지스트리에 없음`);
    return { typeId, ok: false, blocking: -1 };
  }
  let passage: KoSamplePassage;
  try {
    passage = pickPassage(typeId, mod.meta.passageKinds);
  } catch (err) {
    console.log(`  [NO-FIXTURE] ${err instanceof Error ? err.message : String(err)}`);
    return { typeId, ok: false, blocking: -1 };
  }
  const settings = readKoResolvedSettings(typeId, {});
  const examMode: KoExamMode = settings.examMode;
  const passageKind = passage.kind;
  const baseTypePrompt = `${mod.prompt}\n\n${mod.settings.buildPrompt(settings, diff)}\n\n${mod.difficultyGuide[diff]}`;

  const maxAttempts = retry ? 2 : 1;
  let correctionNote = "";
  let q: Record<string, unknown> = {};
  let errors: { severity: string; code: string; message: string }[] = [];
  let warnings: { severity: string; code: string; message: string }[] = [];
  let ok = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { system, prompt } = buildKoGenerationPrompt({
      passageContent: passage.content,
      typePrompt: `${baseTypePrompt}${correctionNote}`,
      typeCount: 1,
      diffLabel: diff,
      generationPlan: plan,
      examMode,
      passageKindLabel: KO_PASSAGE_KIND_LABELS[passageKind],
    });

    const responseSchema = z.object({ questions: z.array(mod.schema) });
    let raw: { questions: unknown[] };
    try {
      const result = await generateQuestionObject({
        schema: responseSchema,
        prompt,
        system,
        generationPlan: plan,
        logPrefix: `KO-VERIFY ${typeId}${attempt > 1 ? ` (재시도 ${attempt - 1})` : ""}`,
        // PREMIUM(sonnet-5)은 flash 보다 장문 — 12000 에서 KO 봉투 JSON 이 잘려
        // AI_TypeValidationError 전멸(26-07-03 실측). 프로덕션 게이트(16_384)와 정합.
        maxTokens: plan === "PREMIUM" ? 16384 : 12000,
      });
      raw = result.object as { questions: unknown[] };
    } catch (err) {
      console.log(`  [GEN-FAIL] ${typeId}: ${err instanceof Error ? err.message : String(err)}`);
      return { typeId, ok: false, blocking: -1 };
    }

    q = (raw.questions?.[0] ?? {}) as Record<string, unknown>;
    // 서버가 주입하는 koContext (생성 파이프라인 미러)
    q.koContext = { examMode, passageKind };

    const issues = validateKoQuestion({
      typeId,
      question: q,
      passage: passage.content,
      requestedDifficulty: diff,
    });
    errors = issues.filter((i) => i.severity === "error");
    warnings = issues.filter((i) => i.severity === "warning");
    ok = errors.length === 0;
    if (ok) break;
    if (attempt < maxAttempts) {
      console.log(`  [RETRY] ${typeId} — blocking ${errors.length}건, 교정 재시도`);
      for (const e of errors) console.log(`      ↻ ${e.code}: ${e.message}`);
      correctionNote =
        `\n\n### 직전 시도 반려 사유 — 아래 결함을 전부 교정해 새로 출제하라\n` +
        errors.map((e) => `- [${e.code}] ${e.message}`).join("\n");
    }
  }

  const status = ok ? "PASS" : "FAIL";
  console.log(
    `  [${status}] ${typeId} (${passage.id}/${diff}) — errors:${errors.length} warnings:${warnings.length}`,
  );
  for (const e of errors) console.log(`      ✗ ${e.code}: ${e.message}`);

  let renderModelOk = false;
  try {
    mod.toRenderModel(q, { passage: passage.content });
    renderModelOk = true;
  } catch (err) {
    console.log(`      ✗ toRenderModel 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (ok && renderModelOk) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      resolve(OUT_DIR, `${typeId}.json`),
      JSON.stringify({ typeId, passage: passage.id, diff, examMode, question: q, warnings }, null, 2),
      "utf-8",
    );
  }

  return { typeId, ok: ok && renderModelOk, blocking: errors.length };
}

async function main() {
  const { types, plan, diff, retry } = parseArgs();
  console.log(
    `\n=== KO 실LLM 생성 검증 — plan=${plan} diff=${diff}${retry ? " retry=1" : ""} — ${types.length}개 유형 ===\n`,
  );
  const results: { typeId: string; ok: boolean; blocking: number }[] = [];
  for (const typeId of types) {
    results.push(await runType(typeId, plan, diff, retry));
  }
  const passed = results.filter((r) => r.ok).length;
  const genFail = results.filter((r) => r.blocking === -1).length;
  console.log(`\n=== 결과: ${passed}/${results.length} PASS (생성실패 ${genFail}) ===`);
  const failed = results.filter((r) => !r.ok && r.blocking >= 0);
  if (failed.length) console.log(`검증 실패: ${failed.map((r) => r.typeId).join(", ")}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
