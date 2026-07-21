import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { buildMdBlankPrompt, buildMdGrammarPrompt } from "@/lib/md-lab/prompts";

// md-lab 실험 전용 스트리밍 생성 라우트 — 원큐·마크다운 출력.
// 모델·사고 강도를 요청 단위로 조절하고, reasoning 델타까지 SSE 로 그대로
// 통과시켜 클라이언트가 "사고 구간 vs 출력 구간"을 실시간 분리 표시한다.
// 크레딧 과금이 있는 내부 실험 도구라 스태프 세션 필수.

export const maxDuration = 300;

const ALLOWED_MODELS = new Set([
  "x-ai/grok-4.5",
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.5-flash",
]);
const ALLOWED_EFFORTS = new Set(["off", "low", "medium", "high"]);

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const passage = typeof body?.passage === "string" ? body.passage.trim() : "";
  const qtype = body?.qtype === "grammar" ? "grammar" : body?.qtype === "blank" ? "blank" : null;
  const modelId = typeof body?.modelId === "string" ? body.modelId : "";
  const effort = typeof body?.effort === "string" ? body.effort : "high";
  const explanationMode =
    body?.explanationMode === "answer-only" ? "answer-only" : "full";
  if (!passage || passage.length < 200 || !qtype) {
    return NextResponse.json(
      { error: "passage(200자 이상)와 qtype(blank|grammar)이 필요합니다." },
      { status: 400 },
    );
  }
  if (!ALLOWED_MODELS.has(modelId)) {
    return NextResponse.json({ error: `허용되지 않은 모델: ${modelId}` }, { status: 400 });
  }
  if (!ALLOWED_EFFORTS.has(effort)) {
    return NextResponse.json({ error: `허용되지 않은 사고 강도: ${effort}` }, { status: 400 });
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY missing" }, { status: 500 });
  }

  const prompt =
    qtype === "blank"
      ? buildMdBlankPrompt(passage, explanationMode)
      : buildMdGrammarPrompt(passage, explanationMode);

  // 사고 끄기는 provider 가 거부할 수 있다(gemini 400 "Reasoning is mandatory" —
  // O147/O192 실측). 실험실이므로 그대로 전송해 실제 provider 동작을 노출한다.
  const reasoning =
    effort === "off"
      ? { enabled: false }
      : { enabled: true, effort, exclude: false };

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      // v2(지문 복사)는 지문 재출력 + 사고가 상한을 공유한다 — pro31@high 가
      // 사고 5.7k 를 쓰고 6k 상한에 걸려 지문이 중간 절단된 실측(26-07-21) 후 상향.
      max_tokens: 14_000,
      stream: true,
      usage: { include: true },
      reasoning,
    }),
    signal: AbortSignal.timeout(290_000),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `upstream ${upstream.status}`, detail: detail.slice(0, 400) },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
