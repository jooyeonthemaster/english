import { NextResponse } from "next/server";
import { generateAnalysisReportCore } from "@/lib/passage-report/analysis-report/generate";

/**
 * Dev-only: 실제 Gemini 로 메인 분석 보고서(워크북 제외)를 생성해 품질을 검증한다.
 * 404 in production. GET /api/dev/gen-analysis?n=0|1|2
 */
export const maxDuration = 120;

const SAMPLES: { title: string; passage: string }[] = [
  {
    title: "science-creative",
    passage:
      "It is important to recognize that although science is a rule-based procedure, it is very much a creative process. A conjecture is a philosophical invention, cooked up rather mystically by the mind through the mental computation we call careful contemplation. Once a scientist has formed such an idea, the harder work begins: the conjecture must be tested against reality, and any prediction that fails forces the scientist to abandon or revise it. In this sense, creativity and discipline are not opposites but partners, each correcting the excesses of the other.",
  },
  {
    title: "success-being-watched",
    passage:
      "Winning often brings with it the awareness that other people are now watching you. Before you succeed, when no one is paying attention, it is much easier to act without being noticed. Because there is no audience, you can make mistakes and take risks without much worry. As you begin to succeed, however, you become sharply conscious that you are being observed. Feeling judged, you grow anxious that your flaws and weaknesses might be exposed. To cope, you hide your true self and try to show only the polished image that others would admire. Trying to present a good face to others is not, in itself, wrong. But if you make only the decisions that please others while sacrificing your real self, you will not hold on to that position for long.",
  },
  {
    title: "sleep-health",
    passage:
      "Sleep is one of the most important activities for human health, yet it is often the first thing people sacrifice. During sleep, the brain processes the memories formed during the day and clears away waste products that have built up. Scientists have discovered that people who consistently get less than seven hours of sleep are far more likely to develop serious health problems than those who sleep enough. The stages of sleep, including REM and deep sleep, each serve different functions: REM sleep is essential for regulating emotion, while deep sleep helps repair muscles and strengthen the immune system. Despite knowing all this, many people continue to trade sleep for work or entertainment, a choice whose long-term costs are easy to ignore but hard to escape.",
  },
];

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const n = Math.max(0, Math.min(SAMPLES.length - 1, Number(url.searchParams.get("n") ?? "0")));
  const sample = SAMPLES[n];
  const started = Date.now();
  try {
    const result = await generateAnalysisReportCore({
      passageContent: sample.passage,
      schoolType: "HIGH",
      grade: 2,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, sample: sample.title, error: result.error, raw: result.raw }, { status: 200 });
    }
    return NextResponse.json({ ok: true, sample: sample.title, ms: Date.now() - started, report: result.report }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, sample: sample.title, error: String(e) }, { status: 200 });
  }
}
