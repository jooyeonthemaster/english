// ============================================================================
// orphan-passage-backfill — 지문 삭제로 고아가 된 문항 복구 계획(기본 DRY-RUN, 운영 DB SELECT 만)
//
// 저장소 루트에서:
//   npx tsx --env-file-if-exists=.env scripts/backfill/orphan-passage-backfill.ts [--academy <id>] [--stages 0|1|2|0,1|all] [--out <dir>]
//     → <out>/orphan-passage-plan[.<academy>][.stages-<s>].json   계획(단계별 항목·검토 목록·복구 불가·planHash·applyScope)
//       <out>/orphan-passage-undo[…].json          되돌리기(항목별 before/after + 가드 SQL) — 고른 단계만
//       <out>/orphan-passage-preview[…].sql        실행될 SQL 미리보기(매개변수 주석 — 검토 대기 · 2단계는 「승인 시」 가정)
//       <out>/orphan-passage-apply[…].literal.sql  같은 문을 값까지 넣은 DO 블록(한 트랜잭션 · 문마다 행 수 확인) — 승인 문서용
//       <out>/orphan-passage-undo[…].literal.sql   그 되돌리기
//     --stages 기본 all. 0단계만 승인받을 때는 --stages 0 으로 만든 계획 파일이 곧 승인 단위다.
//
// 적용(이 세션에서는 실행하지 않는다 — 건별 승인 대상):
//   ... --apply --academy <id> --stages <검토본과 같은 값> --plan <검토한 계획 JSON> [--include-jobs]
//   · 조건: --apply · --academy · --stages 가 함께, 검토본 범위 = 그 학원, 검토본 applyScope.stages = --stages,
//     지금 DB 로 다시 만든 계획의 **적용 범위 해시** = 검토본 applyScope.hash(그 단계 데이터가 바뀌면 거부).
//   · 재연결 검토 대기(relinkReview — 문항별 근거 없는 0·1단계 재연결)와 2단계는 검토본에서 approved:true 로 바꾼
//     항목만. 쓰기 내용은 재계산본에서 가져온다(파일 내용 신뢰 안 함).
//   · 실행 전에 SQL 을 찍고 되돌리기 파일을 먼저 쓴다. 한 트랜잭션 — 영향 행 수가 하나라도 다르면 전부 롤백.
//
// 단계: 0 고객(이스팀) 14문항 → day 6(전문 일치 증명 후) · 1 동일 전문 재연결(전역) · 2 원문 보관(_sourcePassage, 전부 검토).
// 0·1단계 자동 적용은 문항별 근거(exact·consistent·1:1 잡 증명)가 있는 문항만 — 나머지는 relinkReview(검토 필요).
// 승인 단위(26-09-30 GA-1 · COH-17): 고객 승인 = 0단계(14문항)만. 1단계(같은 학원 day 2 재연결 8문항 등)는 별도 승인.
//   planHash 가 모든 단계를 한 해시로 묶던 종전 판은 0단계만 적용할 수 없었다(22 UPDATE 가 한 묶음).
// 잡 재연결(26-09-30 GA-2): 0단계는 잡을 잇지 않는다 — --include-jobs 를 줘도 0단계 잡 연산은 없다. 1단계 --include-jobs 는
//   QUESTION_GENERATION 잡만 잇는다. PASSAGE_ANALYSIS 잡(예: cmuey64k… 09-24)을 day 6 에 붙이면 day 6 자신의 분석 잡보다
//   최신이 되어 스튜디오 지문 화면(최근 종결 분석 잡 1건으로 상태 파생)이 바뀐다. 인쇄 · HWPX · DOCX 복구에는 문항만 잇으면 된다.
// docs/EXAM-PAPER-MODEL.md §5 · §13: 운영 DB 백필 실행은 범위 밖(스크립트 · dry-run 까지만 — 적용은 건별 승인).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createReadOnlyPrisma } from "../exam-pagination/export-parity/load";
import { loadBackfillData } from "./orphan-passage/load";
import { ALL_STAGES, buildPlan, parseStages, planHash, stagesLabel, withApplyScope, type Plan, type Stage } from "./orphan-passage/plan";
import { buildOps, buildUndo, renderLiteralSql, renderSql } from "./orphan-passage/sql";
import { executeOps, mergeApprovals, validateApplyRequest } from "./orphan-passage/apply";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function printPlan(plan: Plan) {
  const c = plan.counts;
  console.log(`\n=== orphan-passage-backfill — ${plan.scope.academyId ?? "전 학원"} · planHash(전 단계) ${plan.planHash}`);
  console.log(`단계별 해시: 0단계 ${planHash(plan, [0])} · 1단계 ${planHash(plan, [1])} · 2단계 ${planHash(plan, [2])}`);
  if (plan.applyScope) console.log(`적용 범위(applyScope): 단계 ${stagesLabel(plan.applyScope.stages)} · 해시 ${plan.applyScope.hash}`);
  console.log(`고아(살아 있는·지문 NULL) ${c.orphansLive}문항 · ${c.orphanAcademies}개 학원`);
  const s0 = plan.stage0;
  console.log(`\n[0단계 고객] ${s0.status} · 문항 ${c.stage0Questions}(1:1 잡 증명 ${c.stage0ByJobProof}) · 검토 대기 ${c.stage0PendingReview} · 잡 재연결 0(GA-2 — 잇지 않고 남긴 잡 ${c.stage0JobsLeftUnlinked})`);
  if (s0.jobsLeftUnlinked.length) console.log(`  남긴 잡: ${s0.jobsLeftUnlinked.map((j) => `${j.jobId}(${j.domain})`).join(", ")}`);
  if (s0.verifiedBy.length) console.log(`  전문 일치 증명: ${s0.verifiedBy.join(", ")}`);
  s0.reasons.forEach((r) => console.log(`  사유: ${r}`));
  if (s0.expectedMissing.length || s0.unexpected.length) {
    console.log(`  RCA 14문항 대조: 빠짐 ${s0.expectedMissing.length} · 추가 ${s0.unexpected.length}`);
  }
  console.log(
    `\n[1단계 동일 전문 재연결 — 자동] 지워진 지문 ${c.stage1DeletedPassages}개 → 문항 ${c.stage1Questions}(시험지 사용 ${c.stage1QuestionsInExams}) · 근거 exact ${c.stage1ByExact} · consistent ${c.stage1ByConsistent} · 1:1 잡 ${c.stage1ByJobProof} · 생성 잡 ${c.stage1Jobs}(선택 --include-jobs · 생성 잡 아님 ${c.stage1JobsSkipped}은 잇지 않음)`,
  );
  for (const g of plan.stage1.groups.slice(0, 12)) {
    const pend = g.pendingQuestionIds.length ? ` + 검토 대기 ${g.pendingQuestionIds.length}` : "";
    console.log(`  ${g.academyId.slice(0, 10)}… ${g.deletedPassageId} → ${g.toPassageId} 「${g.toTitle.slice(0, 30)}」 ${g.questionIds.length}문항${pend} via ${g.via.slice(0, 2).join(",")}`);
  }
  console.log(
    `\n[재연결 검토 대기 — 문항별 근거 없음, approved:true 로 바꿔야 적용] 0단계 ${c.stage0PendingReview} · 1단계 ${c.stage1PendingReview}문항(시험지 사용 ${c.relinkReviewInExams} · 1:1 잡이 문항은 증명 ${c.relinkReviewJobProvesQuestion})`,
  );
  console.log(
    `\n[2단계 원문 보관 — 전부 검토] ${c.stage2Questions}문항(시험지 사용 ${c.stage2QuestionsInExams}) · 저장본 ${c.stage2FromSnapshot} · 재조립 ${c.stage2FromReassembly} · 재구성 ${c.stage2FromReconstruction} · 근사 ${c.stage2FromApproximate} · 원천 충돌 ${c.stage2Conflicting}`,
  );
  console.log(
    `\n[검토 목록] 전문 일치·증거 1건 ${c.reviewSingleSourceExact} · 충돌 ${c.reviewConflict} · 근접 ${c.reviewNearMatch} · 잡 지문이 살아 있음 ${c.reviewRpStillExists}`,
  );
  console.log(`[복구 불가] ${c.unrecoverable}문항(시험지 사용 ${c.unrecoverableInExams}) — 「원문 지문 없음」 경고 UI 에 맡긴다`);
  console.log(`[손대지 않음] 지문 내장·지문 불필요 ${c.untouchedEmbedded} · 이미 원문 보관 ${c.untouchedAlreadyDetached}`);
}

function stagesArg(fallback: readonly Stage[] | null): Stage[] | null {
  const raw = arg("stages");
  if (raw === undefined) return fallback ? [...fallback] : null;
  const stages = parseStages(raw);
  if (!stages) throw new Error(`--stages 값이 잘못됐다: ${raw}(0 · 1 · 2 · 0,1 · all)`);
  return stages;
}

async function dryRun(academyId: string | null, outDir: string, stages: Stage[]) {
  const { client, disconnect } = createReadOnlyPrisma();
  try {
    const data = await loadBackfillData(client, academyId);
    const plan = withApplyScope(buildPlan(data, { academyId, generatedAt: new Date().toISOString() }), stages);
    const label = stagesLabel(stages);
    const suffix = `${academyId ? `.${academyId}` : ""}${label === "all" ? "" : `.stages-${label.replace(/,/g, "")}`}`;
    fs.mkdirSync(outDir, { recursive: true });
    const planPath = path.join(outDir, `orphan-passage-plan${suffix}.json`);
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 1));
    // 되돌리기·SQL 미리보기는 학원별로 만든다(적용이 학원 단위다). 검토 대상(재연결 검토 대기·2단계)은 「전부 승인됐다면」 가정.
    const allApproved: Plan = {
      ...plan,
      relinkReview: { items: plan.relinkReview.items.map((i) => ({ ...i, approved: true })) },
      stage2: { items: plan.stage2.items.map((i) => ({ ...i, approved: true })) },
    };
    const academies = [
      ...new Set([...plan.stage0.items, ...plan.stage1.items, ...plan.relinkReview.items, ...plan.stage2.items].map((i) => i.academyId)),
    ];
    const opts = (a: string) => ({ academyId: a, includeJobs: true, stages });
    const undo = academies.flatMap((a) => buildUndo(allApproved, opts(a)));
    const ops = academies.flatMap((a) => buildOps(allApproved, opts(a)));
    const head = `planHash ${plan.planHash} · applyScope stages ${label} hash ${plan.applyScope?.hash} · relink-review & stage2 assume approval`;
    fs.writeFileSync(path.join(outDir, `orphan-passage-undo${suffix}.json`), JSON.stringify({ planHash: plan.planHash, applyScope: plan.applyScope, entries: undo }, null, 1));
    fs.writeFileSync(path.join(outDir, `orphan-passage-preview${suffix}.sql`), `-- DRY-RUN preview · ${head} · ${ops.length} statements\n${renderSql(ops)}\n`);
    fs.writeFileSync(path.join(outDir, `orphan-passage-apply${suffix}.literal.sql`), renderLiteralSql(ops, `APPLY (literal) · ${head}`));
    fs.writeFileSync(path.join(outDir, `orphan-passage-undo${suffix}.literal.sql`), renderLiteralSql(undo.map((u) => u.undo), `UNDO (literal) · ${head}`));
    printPlan(plan);
    console.log(`\n[dry-run] 쓰기 0건. 계획 → ${planPath}`);
    console.log(`          적용 범위 단계 ${label} · 되돌리기 ${undo.length}건 · SQL ${ops.length}문 → ${outDir}`);
  } finally {
    await disconnect();
  }
}

async function apply(academyId: string | null, outDir: string, stages: Stage[] | null) {
  const planPath = arg("plan");
  const reviewed = planPath ? (JSON.parse(fs.readFileSync(planPath, "utf8")) as Plan) : null;
  let recomputed: Plan | null = null;
  if (academyId && reviewed && stages) {
    const { client, disconnect } = createReadOnlyPrisma();
    try {
      recomputed = buildPlan(await loadBackfillData(client, academyId), { academyId, generatedAt: new Date().toISOString() });
    } finally {
      await disconnect();
    }
  }
  const check = validateApplyRequest({ apply: true, academyId, stages, reviewedPlan: reviewed, recomputed });
  if (!check.ok) {
    console.error(`[apply] 거부: ${check.reason}`);
    process.exitCode = 3;
    return;
  }
  const scopeStages = stages as Stage[];
  const includeJobs = flag("include-jobs");
  if (includeJobs && !scopeStages.includes(1)) console.log("[apply] --include-jobs: 0단계는 잡을 잇지 않는다(GA-2) — 잡 연산 없음");
  const plan = mergeApprovals(recomputed as Plan, reviewed as Plan);
  const ops = buildOps(plan, { academyId: academyId as string, includeJobs, stages: scopeStages });
  const undo = buildUndo(plan, { academyId: academyId as string, includeJobs, stages: scopeStages });
  if (ops.length === 0) {
    console.error(`[apply] 거부: 적용 범위(단계 ${stagesLabel(scopeStages)})에 쓸 연산이 없다`);
    process.exitCode = 3;
    return;
  }
  console.log(renderSql(ops));
  const undoPath = path.join(outDir, `orphan-passage-undo-applied.${academyId}.stages-${stagesLabel(scopeStages).replace(/,/g, "")}.${Date.now()}.json`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(undoPath, JSON.stringify({ planHash: plan.planHash, applyScope: (reviewed as Plan).applyScope, entries: undo }, null, 1));
  console.log(`[apply] 되돌리기 파일 먼저 기록 → ${undoPath}`);
  const writer = new PrismaClient();
  try {
    const result = await writer.$transaction(
      (tx) => executeOps((sql, params) => tx.$executeRawUnsafe(sql, ...params), ops),
      { timeout: 120_000, maxWait: 10_000 },
    );
    console.log(`[apply] 완료 — ${result.applied}/${ops.length}문 (학원 ${academyId} · 단계 ${stagesLabel(scopeStages)})`);
  } finally {
    await writer.$disconnect();
  }
}

async function main() {
  const academyId = arg("academy") ?? null;
  const outDir = path.resolve(arg("out") ?? path.join("tmp", "orphan-passage-backfill"));
  if (flag("apply")) await apply(academyId, outDir, stagesArg(null)); // 적용은 --stages 를 명시해야 한다(기본값 없음)
  else await dryRun(academyId, outDir, stagesArg(ALL_STAGES) as Stage[]);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
