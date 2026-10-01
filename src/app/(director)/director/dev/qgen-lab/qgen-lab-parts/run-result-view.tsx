"use client";

// 실행 결과 상세 — 반려 사유·게이트 이슈 → 최종 문항 → 계획 → 검증 → 시도별 원문·랩 지표.

import type { PlannerPlan, RunResult, VerifyResult } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { fmtChars, fmtMs, fmtTokens, fmtUsd, shortModel } from "./format-utils";
import { PlanView, VerifyStrip } from "./plan-view";
import { QuestionView } from "./question-view";
import { IssueList, Mono } from "./ui-bits";

function adoptedAttempt(r: RunResult) {
  return r.attempts.find((a) => a.adopted) ?? r.attempts[r.attempts.length - 1] ?? null;
}

function LabChecks({ r }: { r: RunResult }) {
  const c = r.labChecks ?? {};
  const cells: [string, string][] = [
    ["계획 1순위 채택", c.planAnswerAdopted == null ? "—" : c.planAnswerAdopted ? "예" : "아니오"],
    ["계획 자리 사용", c.planSitesUsed == null ? "—" : String(c.planSitesUsed)],
    ["오형−원형 단어", c.answerWordDelta == null ? "—" : String(c.answerWordDelta)],
    ["정답 문장", c.answerSentenceIdx == null ? "—" : String(c.answerSentenceIdx)],
  ];
  return (
    <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 text-[0.6875rem]">
      {cells.map(([k, v]) => (
        <div key={k} className="bg-white px-2 py-1">
          <dt className="text-stone-500">{k}</dt>
          <dd className="font-mono text-[0.75rem] font-semibold text-stone-900 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RunResultView({
  result,
  passage,
  livePlan,
  liveVerifies,
}: {
  result: RunResult | null;
  passage: string;
  livePlan?: PlannerPlan | null;
  liveVerifies?: VerifyResult[];
}) {
  const plan = result?.plan ?? livePlan ?? null;
  const verifies = liveVerifies?.length ? liveVerifies : result?.verify ? [result.verify] : [];
  const finalVerify = result?.verify ?? verifies[verifies.length - 1] ?? null;
  const adopted = result ? adoptedAttempt(result) : null;

  return (
    <div className="space-y-3">
      {result && result.status !== "ok" && (
        <IssueList
          tone={result.status === "error" ? "error" : "warn"}
          issues={[
            ...(result.failReason ? [`반려 사유: ${result.failReason}`] : []),
            ...(adopted?.gateIssues ?? []).filter((g) => g !== result.failReason),
          ]}
        />
      )}

      {result?.question && passage ? (
        <QuestionView question={result.question} passage={passage} verify={finalVerify} />
      ) : result && !result.question ? (
        <p className="text-[0.75rem] text-stone-500">파싱된 문항 없음</p>
      ) : null}

      {plan && passage && <PlanView plan={plan} passage={passage} />}

      {verifies.length > 0 && (
        <div className="space-y-1">
          {verifies.map((v, i) => (
            <VerifyStrip key={i} verify={v} index={i} />
          ))}
        </div>
      )}

      {result && (
        <>
          <LabChecks r={result} />
          {(result.qualityIssues ?? []).length > 0 && (
            <IssueList tone="muted" issues={(result.qualityIssues ?? []).map((q) => `품질(비차단): ${q}`)} />
          )}
          <details className="rounded-md border border-stone-200 bg-white">
            <summary className="cursor-pointer px-2.5 py-1.5 text-[0.6875rem] font-semibold text-stone-500 hover:text-stone-800">
              시도 {result.attempts.length}건 원문 · 게이트 · 토큰
            </summary>
            <div className="space-y-2 border-t border-stone-200 p-2.5">
              {result.attempts.map((a) => (
                <div key={a.n} className={cn("space-y-1 rounded-md border p-2", a.adopted ? "border-emerald-300" : "border-stone-200")}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.6875rem] text-stone-600">
                    <span className="font-bold text-stone-900">
                      #{a.n} {a.kind}
                      {a.adopted && <span className="ml-1 text-emerald-700">채택</span>}
                    </span>
                    <Mono>{shortModel(a.model)}</Mono>
                    {a.provider && <Mono>@{a.provider}</Mono>}
                    <Mono>{fmtMs(a.durationMs)}</Mono>
                    <Mono>finish={a.finishReason ?? "—"}</Mono>
                    <Mono>
                      in {fmtTokens(a.inputTokens)} / out {fmtTokens(a.outputTokens)} / rsn {fmtTokens(a.reasoningTokens)}
                    </Mono>
                    <Mono>{fmtUsd(a.costUsd)}</Mono>
                    <Mono className="text-stone-400">
                      prompt {fmtChars(a.promptChars)} · {(a.promptSha1 ?? "").slice(0, 8)}
                    </Mono>
                  </div>
                  {a.transportError && <IssueList tone="error" issues={[`전송 오류: ${a.transportError}`]} />}
                  {a.errorChunk && <IssueList tone="error" issues={[`upstream: ${a.errorChunk}`]} />}
                  {(a.gateIssues ?? []).length > 0 && <IssueList issues={a.gateIssues} />}
                  <details>
                    <summary className="cursor-pointer text-[0.6875rem] text-stone-500">모델 원문 {fmtChars(a.text.length)}</summary>
                    <pre className="mt-1 max-h-72 overflow-auto rounded bg-stone-900 p-2 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-stone-100">
                      {a.text || "(빈 응답)"}
                    </pre>
                  </details>
                </div>
              ))}
              {result.display && (
                <details>
                  <summary className="cursor-pointer text-[0.6875rem] text-stone-500">후처리 산출(display) JSON</summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-stone-100 p-2 font-mono text-[0.6875rem] whitespace-pre-wrap text-stone-700">
                    {JSON.stringify(result.display, null, 2)}
                  </pre>
                </details>
              )}
              <p className="font-mono text-[0.6875rem] text-stone-400">
                {result.runId} · seed {result.seed} · {result.startedAt}
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
