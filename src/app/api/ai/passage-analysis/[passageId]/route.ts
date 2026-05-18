import { NextRequest, NextResponse } from "next/server";
import { generateObject, generateText } from "ai";

import { model } from "@/lib/ai";
import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import { getStaffSession } from "@/lib/auth";
import {
  InsufficientCreditsError,
  deductCredits,
  refundCredits,
} from "@/lib/credits";
import { passageAnalysisSchema } from "@/lib/passage-analysis-schema";
import { hashContent } from "@/lib/passage-utils";
import { prisma } from "@/lib/prisma";

import { loadPersistedAnnotations } from "./_lib/annotations";
import { classifyAnalysisError } from "./_lib/error-classification";
import { runFullAnalysis } from "./_lib/run-full-analysis";

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// GET — analysis with cache
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { passageId } = await params;

    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: {
        analysis: true,
        school: { select: { type: true } },
      },
    });

    if (!passage) {
      return NextResponse.json(
        { error: "지문을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const currentHash = hashContent(passage.content);
    if (passage.analysis && passage.analysis.contentHash === currentHash) {
      return NextResponse.json({
        data: JSON.parse(passage.analysis.analysisData),
        cached: true,
      });
    }

    // Cache miss — deduct credits before running analysis
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(
        staff.academyId,
        "PASSAGE_ANALYSIS",
        staff.id,
        { passageId },
      );
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: "크레딧이 부족합니다",
            balance: err.currentBalance,
            required: err.requiredCredits,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    let analysisData: unknown;
    try {
      // Auto-inject persisted teacher annotations so cache-miss re-analyses
      // always reflect the latest marking intent (no caller wiring needed).
      const persistedAnns = await loadPersistedAnnotations(passageId);
      const autoPrompt =
        persistedAnns.length > 0
          ? buildAnalysisPrompt("", persistedAnns)
          : undefined;
      analysisData = await runFullAnalysis(passage, autoPrompt);
    } catch (aiError) {
      await refundCredits(
        staff.academyId,
        "PASSAGE_ANALYSIS",
        creditResult.transactionId,
        "Analysis failed",
      );
      throw aiError;
    }

    await prisma.passageAnalysis.upsert({
      where: { passageId },
      update: {
        analysisData: JSON.stringify(analysisData),
        contentHash: currentHash,
        version: 1,
      },
      create: {
        passageId,
        analysisData: JSON.stringify(analysisData),
        contentHash: currentHash,
        version: 1,
      },
    });

    return NextResponse.json({
      data: analysisData,
      cached: false,
      creditsRemaining: creditResult.balanceAfter,
    });
  } catch (error) {
    const classified = classifyAnalysisError(error);
    console.error("Passage analysis error:", classified.log, error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — custom analysis, retranslate, enhance grammar
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { passageId } = await params;
    const body = await request.json();

    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: { analysis: true, school: { select: { type: true } } },
    });

    if (!passage) {
      return NextResponse.json(
        { error: "지문을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // --- Action: retranslate a single sentence ---
    if (body.action === "retranslate") {
      let creditResult: { balanceAfter: number; transactionId: string };
      try {
        creditResult = await deductCredits(
          staff.academyId,
          "SENTENCE_RETRANSLATION",
          staff.id,
          { passageId },
        );
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          return NextResponse.json(
            {
              error: "크레딧이 부족합니다",
              balance: err.currentBalance,
              required: err.requiredCredits,
            },
            { status: 402 },
          );
        }
        throw err;
      }

      try {
        const { english } = body;
        const { text } = await generateText({
          model,
          prompt: `다음 영어 문장을 자연스러운 한국어로 번역하세요. 번역만 출력하세요.\n\n영어: ${english}\n\n한국어 번역:`,
        });
        return NextResponse.json({
          korean: text.trim(),
          creditsRemaining: creditResult.balanceAfter,
        });
      } catch (aiError) {
        await refundCredits(
          staff.academyId,
          "SENTENCE_RETRANSLATION",
          creditResult.transactionId,
          "Retranslation failed",
        );
        throw aiError;
      }
    }

    // --- Action: enhance a grammar point ---
    if (body.action === "enhanceGrammar") {
      let creditResult: { balanceAfter: number; transactionId: string };
      try {
        creditResult = await deductCredits(
          staff.academyId,
          "GRAMMAR_ENHANCEMENT",
          staff.id,
          { passageId },
        );
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          return NextResponse.json(
            {
              error: "크레딧이 부족합니다",
              balance: err.currentBalance,
              required: err.requiredCredits,
            },
            { status: 402 },
          );
        }
        throw err;
      }

      try {
        const { grammarPoint } = body;
        const { object: enhanced } = await generateObject({
          model,
          schema: passageAnalysisSchema.shape.grammarPoints.element,
          prompt: `다음 영어 문법 포인트를 더 자세하고 정확하게 보완해주세요.
학생이 이해하기 쉽도록 설명을 개선하고, 예문을 더 적절한 것으로 교체하세요.

현재 문법 포인트:
- 패턴: ${grammarPoint.pattern}
- 설명: ${grammarPoint.explanation}
- 지문 발췌: ${grammarPoint.textFragment}
- 수준: ${grammarPoint.level}
- 예문: ${grammarPoint.examples.join(", ")}

보완된 문법 포인트를 생성하세요.
sentenceIndex는 ${grammarPoint.sentenceIndex}로 유지하세요.
id는 "${grammarPoint.id}"로 유지하세요.`,
        });
        return NextResponse.json({
          grammarPoint: enhanced,
          creditsRemaining: creditResult.balanceAfter,
        });
      } catch (aiError) {
        await refundCredits(
          staff.academyId,
          "GRAMMAR_ENHANCEMENT",
          creditResult.transactionId,
          "Grammar enhancement failed",
        );
        throw aiError;
      }
    }

    // --- Action: full analysis with custom prompt ---
    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(
        staff.academyId,
        "PASSAGE_ANALYSIS",
        staff.id,
        { passageId },
      );
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: "크레딧이 부족합니다",
            balance: err.currentBalance,
            required: err.requiredCredits,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    const { customPrompt } = body;
    // Always merge persisted annotations, then layer the caller's custom prompt
    // on top so explicit instructions still win precedence.
    const persistedAnns = await loadPersistedAnnotations(passageId);
    const annotationBlock =
      persistedAnns.length > 0
        ? buildAnalysisPrompt("", persistedAnns)
        : "";
    const mergedPrompt = [annotationBlock, customPrompt]
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .join("\n\n");
    console.log(
      "[ANALYSIS] Custom prompt received:",
      customPrompt ? `${customPrompt.slice(0, 200)}...` : "NONE",
    );
    console.log("[ANALYSIS] Persisted annotations:", persistedAnns.length);

    let analysisData: unknown;
    try {
      analysisData = await runFullAnalysis(passage, mergedPrompt || undefined);
    } catch (aiError) {
      await refundCredits(
        staff.academyId,
        "PASSAGE_ANALYSIS",
        creditResult.transactionId,
        "Custom analysis failed",
      );
      throw aiError;
    }

    const currentHash = hashContent(passage.content);
    await prisma.passageAnalysis.upsert({
      where: { passageId },
      update: {
        analysisData: JSON.stringify(analysisData),
        contentHash: currentHash,
        version: 1,
      },
      create: {
        passageId,
        analysisData: JSON.stringify(analysisData),
        contentHash: currentHash,
        version: 1,
      },
    });

    return NextResponse.json({
      data: analysisData,
      cached: false,
      creditsRemaining: creditResult.balanceAfter,
    });
  } catch (error) {
    const classified = classifyAnalysisError(error);
    console.error("Passage analysis POST error:", classified.log, error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}
