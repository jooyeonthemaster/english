// qgen-lab 1회 실행 전체 흐름(LAB-SPEC §3) — 계획 → 1차 생성 → (jev 검증) → 재생성 1회 → 후처리 → 기록.
// 프로덕션 md-stream 어법 경로(route.ts:1214-1215 예산, :1423-1495 재생성 정책, :1571-1649 산출)를
// 모델·계획·검증만 바꿔 재현한다. DB 0 — 결과는 runs/<batch>.jsonl, 원가는 ledger.jsonl.
// 예외는 밖으로 던지지 않는다: 어떤 실패든 RunResult(status "error")로 기록하고 error 이벤트로 알린다.
// best-of-N(arm.sampling, PLANNER-SPEC §4): orchestrate-parts/sampling.ts + selector.ts. 채택본이 없으면
// 첫 파싱 후보의 이슈로 프로덕션 재생성 1회(채택 규칙도 프로덕션: 재생성 이슈 수 ≤ 그 후보의 이슈 수).
// 재생성 넛지 시드 = labRegenSeed — 프로덕션은 재생성 때 Math.random 을 다시 뽑는다(route.ts:1094, grammar-prompt.ts ③).
// 구제 전략(arm.strategy, RESCUE-SPEC §3.3): 1~3단계를 건너뛰고 strategies/index.ts(동적 import)의 채택본으로 4~5단계를 돈다.
// 전략 팔이 아니면 전략 모듈은 로드조차 되지 않는다 — 기존 팔의 요청·이벤트·결과는 바이트 동일(_tmp-qgenlab-rescue-parity.ts A).
import type {
  ArmConfig,
  AttemptRecord,
  GenModelConfig,
  LabEvent,
  LabPassage,
  PlannerPlan,
  RunResult,
  RunStatus,
  VerifyResult,
} from "@/lib/qgen-lab/types";
import { assertLabBudget } from "./ledger";
import { findUniqueSpan, getPlanner } from "./planners/index";
import { appendRunResult, batchKey, isSafeBatchId } from "./results";
import { fnv1a32 } from "./seeded-random";
import { DEFAULT_SELECTOR_DEPS, type SelectorAskFn, type SelectorVerifyFn } from "./selector";
import { jevVerify } from "./verify";
import type { LabParsed } from "./parse-gate";
import type { StrategyContext } from "./strategies/index";
import { runAttempt, type AttemptContext, type AttemptOutcome, type TeacherPointWire } from "./orchestrate-parts/attempt";
import { finalizeGrammarQuestion } from "./orchestrate-parts/finalize";
import { computeLabChecks } from "./orchestrate-parts/lab-checks";
import { jevVerifyIssue, runSampledFirstAttempts } from "./orchestrate-parts/sampling";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
/** 플래너 시도당 상한(재시도 1회 포함 최악 ~50s — 270s 생성 예산 보호). */
const PLAN_TIMEOUT_MS = 25_000;

/** 짧은 타임스탬프(로컬 시각) YYMMDD-HHmmss-SSS. */
function shortStamp(d: Date): string {
  return `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

export function labSeed(passageId: string, rep: number): number {
  return fnv1a32(`${passageId}#${rep}`);
}

/** 재생성 넛지 시드 — 1차와 다른 추첨(프로덕션 재추첨 재현), 같은 (지문, rep) 은 팔이 달라도 같다. */
export function labRegenSeed(passageId: string, rep: number): number {
  return fnv1a32(`${passageId}#${rep}#regen`);
}

/** 외부 호출 주입(오프라인 테스트용 — 라우트는 넘기지 않는다). */
export interface LabRunHooks {
  /** 검증기(기본 verify.ts jevVerify) — 단일 경로 검증과 선별기가 함께 쓴다. */
  verify?: SelectorVerifyFn;
  /** 선별기 jev 요청(기본 askJevPacked). */
  ask?: SelectorAskFn;
}

/** hard 계획의 교사 포인트를 지문 축자·유일 검증 — 실패 항목은 plan.debug 에 남기고 제외. */
function vetTeacherPoints(plan: PlannerPlan, passageText: string): { plan: PlannerPlan; kept: TeacherPointWire[] } {
  const kept: TeacherPointWire[] = [];
  const rejected: { text: string; reason: string }[] = [];
  for (const tp of plan.teacherPoints ?? []) {
    if (!tp?.text) {
      rejected.push({ text: String(tp?.text ?? ""), reason: "빈 텍스트" });
      continue;
    }
    if (findUniqueSpan(passageText, tp.text)) kept.push(tp);
    else
      rejected.push({
        text: tp.text,
        reason: passageText.includes(tp.text) ? "지문에 2회 이상(비유일)" : "지문 축자 아님",
      });
  }
  if (rejected.length === 0) return { plan, kept };
  const prev = plan.debug;
  const debug =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>), labRejectedTeacherPoints: rejected }
      : { plannerDebug: prev ?? null, labRejectedTeacherPoints: rejected };
  return { plan: { ...plan, teacherPoints: kept, debug }, kept };
}

export async function runLabGeneration(a: {
  arm: ArmConfig;
  passage: LabPassage;
  rep: number;
  batchId: string | null;
  emit: (e: LabEvent) => void;
}, hooks: LabRunHooks = {}): Promise<RunResult> {
  const { arm, passage, rep, emit } = a;
  const verifyFn: SelectorVerifyFn = hooks.verify ?? jevVerify;
  const selectorDeps = { verify: verifyFn, ask: hooks.ask ?? DEFAULT_SELECTOR_DEPS.ask };
  // 라우트가 먼저 400 으로 거르지만, 파일명으로 쓰이므로 여기서도 안전하지 않으면 adhoc 로 내린다.
  let batchId = a.batchId || null;
  if (batchId && !isSafeBatchId(batchId)) {
    console.warn(`[qgen-lab] 안전하지 않은 batchId 무시: ${batchId}`);
    batchId = null;
  }
  const t0 = Date.now();
  const started = new Date(t0);
  const seed = labSeed(passage.id, rep);
  const runId = `${arm.id}__${passage.id}__r${rep}__${shortStamp(started)}`;
  const phaseBase = `qgen-lab:${batchKey(batchId)}:${arm.id}`;
  // route.ts:1214-1215 — 270s 벽까지 남은 시간(플래너 시간 포함).
  const budgetMs = () => 270_000 - (Date.now() - t0);

  let plan: PlannerPlan | null = null;
  let planMs = 0;
  let verifyMs = 0;
  let verifyJevUsd = 0;
  let finalVerify: VerifyResult | null = null;
  let selection: RunResult["selection"] = null;
  let adopted: { record: AttemptRecord; parsed: LabParsed } | null = null;
  let lastQuestion: RunResult["question"] = null;
  let strategyCtx: StrategyContext | null = null;
  let strategyLabChecks: Partial<RunResult["labChecks"]> | null = null;
  let status: RunStatus = "error";
  let failReason: string | null = null;
  let display: Record<string, unknown> | null = null;
  let qualityIssues: string[] = [];
  const attempts: AttemptRecord[] = [];

  emit({ t: "meta", runId, armId: arm.id, passageId: passage.id, rep, seed, startedAt: started.toISOString() });

  try {
    assertLabBudget(phaseBase);

    if (arm.strategy) {
      // ── 1~3'. 구제 전략(RESCUE-SPEC §3.3) — 플래너·1차·재생성·검증기 대신 전략이 채택본을 낸다 ──────
      const strategies = await import("./strategies/index");
      strategyCtx = strategies.createStrategyContext({
        arm,
        passage,
        rep,
        seed,
        regenSeed: labRegenSeed(passage.id, rep),
        runId,
        batchId,
        t0,
        budgetMs,
        emit,
        phaseBase,
        attempts,
      });
      const s = await strategies.runStrategy(strategyCtx);
      strategyLabChecks = s.labChecks ?? null;
      lastQuestion = s.lastQuestion ?? s.adopted.parsed.question;
      adopted = s.adopted;
      adopted.record.adopted = true;
    } else {
      // ── 1. 계획(플래너) ────────────────────────────────────────────────────
      let planBlock: string | null = null;
      let teacherPoints: TeacherPointWire[] = [];
      if (arm.planner.id !== "none") {
        const planner = getPlanner(arm.planner.id);
        if (!planner) throw new Error(`플래너 미등록: ${arm.planner.id}`);
        const tp0 = Date.now();
        // 플래너 1회 재시도 + 시도당 25s 상한(감독 수리 26-09-25: A2+D 한 요청 응답 누락·jev 지연이
        // 270s 예산을 잡아먹지 않도록). 재시도 후에도 실패하면 계획 없이 진행하지 않고 run error.
        const planOnce = () =>
          Promise.race([
            planner({
              passage,
              difficulty: arm.difficulty,
              seed,
              params: arm.planner.params ?? {},
              mode: arm.planner.mode,
              phase: `${phaseBase}:plan`,
            }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("jev 플래너 시간 초과(25s)")), PLAN_TIMEOUT_MS)),
          ]);
        let p: PlannerPlan;
        try {
          p = await planOnce();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // 후보 0개처럼 결정론적으로 재현되는 실패는 재시도하지 않는다
          if (/후보 자리 0개/.test(msg)) throw e;
          emit({ t: "retry", reason: `jev 플래너 재시도: ${msg.slice(0, 120)}` });
          p = await planOnce();
        }
        planMs = Date.now() - tp0;
        if (arm.planner.mode === "hard") {
          const vetted = vetTeacherPoints(p, passage.text);
          p = vetted.plan;
          if (vetted.kept.length === 0) {
            plan = p;
            emit({ t: "plan", plan: p });
            throw new Error("hard 계획의 교사 포인트가 전부 지문 축자·유일 검증에 실패(계획 없이 진행 금지)");
          }
          teacherPoints = vetted.kept;
        } else if (arm.planner.mode === "soft") {
          if (!p.promptBlock?.trim()) {
            plan = p;
            emit({ t: "plan", plan: p });
            throw new Error("soft 계획 블록이 비었다(계획 없이 진행 금지)");
          }
          planBlock = p.promptBlock;
        }
        plan = p;
        emit({ t: "plan", plan: p });
      }

      let seq = 0;
      const ctx: AttemptContext = {
        passageText: passage.text,
        difficulty: arm.difficulty,
        seed,
        teacherPoints,
        planBlock,
        budgetMs,
        emit,
        phase: `${phaseBase}:gen`,
        attempts,
        nextN: () => ++seq,
      };

      // 검증기(jev-d10) — 게이트 이슈 0 일 때만. regenerate/escalate 실패는 게이트 이슈로 올려 재생성에 태운다.
      const verifyOutcome = async (o: AttemptOutcome): Promise<VerifyResult | null> => {
        if (arm.verifier.id !== "jev-d10" || o.parsed.gateIssues.length > 0 || !o.parsed.question) return null;
        let v: VerifyResult;
        try {
          v = await verifyFn(o.parsed.question, passage.text, arm.verifier.params, `${phaseBase}:verify`);
        } catch (e) {
          // 검증 인프라 실패(jev 재시도 소진·형식 변환 예외)는 생성물을 죽이지 않는다 — 통과 취급 + 사유 기록
          // (감독 수리 26-09-25: 선별 경로 evaluateCandidate 와 동작 통일).
          const msg = e instanceof Error ? e.message : String(e);
          v = {
            verifierId: "jev-d10",
            pass: true,
            perMark: [],
            answerLabel: o.parsed.question.answer,
            reason: `jev 검증 불가(통과 취급): ${msg.slice(0, 160)}`,
            ms: 0,
            jevCostUsd: 0,
          };
        }
        verifyMs += v.ms;
        verifyJevUsd += v.jevCostUsd;
        o.record.verify = v;
        emit({ t: "verify", verify: v });
        if (!v.pass && arm.verifier.onFail !== "flag") {
          const issue = jevVerifyIssue(v.reason);
          o.parsed.gateIssues = [...o.parsed.gateIssues, issue];
          o.record.gateIssues = [...o.record.gateIssues, issue];
        }
        return v;
      };

      // ── 2. 1차 생성(단일 | best-of-N 병렬 + jev 선별) ─────────────────────
      let current: AttemptOutcome;
      let currentVerify: VerifyResult | null;
      if (arm.sampling) {
        const s = await runSampledFirstAttempts(ctx, {
          n: arm.sampling.n,
          gen: arm.gen,
          phase: `${phaseBase}:select`,
          verifyParams: arm.verifier.id === "jev-d10" ? arm.verifier.params : undefined,
          verifyGates: arm.verifier.id === "jev-d10" && arm.verifier.onFail !== "flag",
          deps: selectorDeps,
          selector: arm.sampling.selector,
        });
        selection = s.selection;
        const pick = s.chosen ?? s.baseline;
        if (!pick?.outcome) {
          // 전원 전송 실패 — 프로덕션 단일 경로와 같이 실행 오류(재생성 없음).
          const first = s.candidates.find((c) => c.error)?.error;
          throw first instanceof Error ? first : new Error(first ? String(first) : "best-of-N: 후보 전원 실패");
        }
        current = pick.outcome;
        currentVerify = pick.eval?.verify ?? null;
        if (currentVerify) emit({ t: "verify", verify: currentVerify });
      } else {
        current = await runAttempt(ctx, { kind: "gen", gen: arm.gen, feedback: null });
        currentVerify = await verifyOutcome(current);
      }
      lastQuestion = current.parsed.question;

      // ── 3. 재생성 1회(프로덕션 규칙: 이슈>0 && 예산>30s, 이슈 수 ≤ 1차일 때만 채택) ──
      if (current.parsed.gateIssues.length > 0 && budgetMs() > 30_000) {
        // 캐스케이드(jx): 1차가 게이트 반려든 jev 검증 실패든 재생성은 승급 모델로(감독 수리 26-09-25 — 스모크에서
        // 게이트 반려 시 같은 luna 로 재생성해 캐스케이드 취지가 무너진 것을 확인).
        const escalate = arm.verifier.onFail === "escalate";
        let regenGen: GenModelConfig = arm.gen;
        if (escalate && arm.escalateTo) regenGen = arm.escalateTo;
        else if (escalate) console.warn(`[qgen-lab] ${arm.id}: onFail=escalate 인데 escalateTo 없음 — 같은 모델로 재생성`);
        const feedback = current.parsed.gateIssues.join(", ");
        emit({ t: "retry", reason: feedback.slice(0, 200) });
        const regen = await runAttempt(ctx, {
          kind: escalate && arm.escalateTo ? "escalate" : "regen",
          gen: regenGen,
          feedback,
          seed: labRegenSeed(passage.id, rep),
        });
        if (regen.parsed.question) lastQuestion = regen.parsed.question;
        const regenVerify = await verifyOutcome(regen);
        if (regen.parsed.gateIssues.length <= current.parsed.gateIssues.length) {
          current = regen;
          currentVerify = regenVerify;
        }
      }
      adopted = current;
      adopted.record.adopted = true;
      finalVerify = currentVerify;
    }

    // ── 4. 판정 → 후처리 ───────────────────────────────────────────────────
    if (adopted.parsed.gateIssues.length > 0) {
      status = "gate_fail";
      failReason = adopted.parsed.gateIssues.join(", ");
    } else if (!adopted.parsed.question) {
      status = "error";
      failReason = adopted.parsed.parseError ?? "파싱 결과 없음";
    } else {
      const fin = finalizeGrammarQuestion(adopted.parsed.question, passage.text, arm.difficulty);
      display = fin.display;
      qualityIssues = fin.qualityIssues;
      status = "ok";
    }
  } catch (err) {
    status = "error";
    failReason = err instanceof Error ? err.message : String(err);
    console.error(`[qgen-lab] run ${runId} 실패`, err);
  }

  // ── 5. 결과 조립·기록 ────────────────────────────────────────────────────
  const question = adopted?.parsed.question ?? lastQuestion ?? null;
  // 병렬 후보 기록은 완료순으로 쌓인다 — n 순으로 정렬(n 은 콜 직전 발급이라 유일).
  attempts.sort((x, y) => x.n - y.n);
  const genUsd = attempts.reduce((s, x) => s + (x.costUsd ?? 0), 0);
  // 선별기 jev(검증 포함)는 selection.jevCostUsd 로 따로 잡히고 여기 합산된다. verifyMs 는 팔 검증기 몫만.
  // 구제 전략은 전략 내부 jev(StrategyRecord.jevUsd)를 더한다 — LLM 소형 콜은 attempts 로 genUsd 에 이미 들어 있다.
  const strategy = strategyCtx ? strategyCtx.rec.snapshot() : null;
  const jevUsd = (plan?.jevCostUsd ?? 0) + verifyJevUsd + (selection?.jevCostUsd ?? 0) + (strategy?.jevUsd ?? 0);
  const llmPlanUsd = plan?.llmCostUsd ?? 0;
  const finished = new Date();
  const result: RunResult = {
    runId,
    batchId,
    armId: arm.id,
    passageId: passage.id,
    rep,
    seed,
    status,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    totalMs: finished.getTime() - t0,
    planMs,
    verifyMs,
    attempts,
    cost: { genUsd, jevUsd, llmPlanUsd, totalUsd: genUsd + jevUsd + llmPlanUsd },
    plan,
    verify: finalVerify,
    selection,
    ...(strategy ? { strategy } : {}),
    question,
    display,
    qualityIssues,
    failReason,
    labChecks: (() => {
      try {
        const base = computeLabChecks(question, plan);
        return strategyLabChecks ? { ...base, ...strategyLabChecks } : base;
      } catch (err) {
        console.error("[qgen-lab] labChecks 계산 실패", err);
        return {};
      }
    })(),
  };

  try {
    appendRunResult(result);
  } catch (err) {
    console.error(`[qgen-lab] run ${runId} 결과 기록 실패`, err);
  }
  if (status === "error") emit({ t: "error", message: failReason ?? "unknown error", result });
  else emit({ t: "done", result });
  return result;
}
