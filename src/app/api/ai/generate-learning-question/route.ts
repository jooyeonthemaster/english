import { generateText } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { buildCategoryPrompt } from "@/lib/learning-question-prompts";
import { getStaffSession } from "@/lib/auth";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";

// ---------------------------------------------------------------------------
// 후처리 — AI 출력 필드명 정규화 + 셔플
// ---------------------------------------------------------------------------

const REMOVE_FIELDS = ["id", "type", "question", "instruction", "displaySentence"];
const LABELS = ["A", "B", "C", "D", "E", "F"];

/** 배열을 랜덤 셔플 (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 선택지 셔플 + correctAnswer 라벨 업데이트 */
function shuffleOptions(item: Record<string, unknown>): void {
  const options = item.options as { label: string; text: string }[] | undefined;
  const correctAnswer = item.correctAnswer as string | undefined;
  if (!options || !correctAnswer || options.length <= 1) return;

  // 정답 텍스트 찾기
  const correctOption = options.find((o) => o.label === correctAnswer);
  if (!correctOption) return;
  const correctText = correctOption.text;

  // 셔플
  const shuffled = shuffle(options);

  // 라벨 재할당 + 정답 위치 업데이트
  shuffled.forEach((o, i) => { o.label = LABELS[i]; });
  const newCorrect = shuffled.find((o) => o.text === correctText);
  item.options = shuffled;
  item.correctAnswer = newCorrect?.label || correctAnswer;
}

function normalizeItem(subType: string, item: Record<string, unknown>): Record<string, unknown> {
  const result = { ...item };

  // 불필요 필드 제거
  for (const f of REMOVE_FIELDS) delete result[f];

  switch (subType) {
    case "WORD_FILL":
      if (!result.blankWord) {
        result.blankWord = result.word || result.targetWord || "";
      }
      delete result.word;
      delete result.targetWord;
      break;

    case "KEY_EXPRESSION":
      // answer/targetExpression → blankExpression
      if (!result.blankExpression) {
        result.blankExpression = result.answer || result.targetExpression || "";
      }
      delete result.answer;
      delete result.targetExpression;
      break;

    case "WORD_MATCH":
      if (Array.isArray(result.pairs)) {
        // english/korean → en/ko + 셔플
        result.pairs = shuffle((result.pairs as Record<string, unknown>[]).map((p) => ({
          en: p.en || p.english || p.word || "",
          ko: p.ko || p.korean || p.meaning || "",
        })));
      }
      break;

    case "SENT_CHUNK_ORDER": {
      // chunks 객체 → 문자열 변환
      if (Array.isArray(result.chunks) && result.chunks.length > 0 && typeof result.chunks[0] === "object") {
        const chunkObjs = result.chunks as Record<string, unknown>[];
        result.chunks = chunkObjs.map((c) => c.text || c.chunk || "");
        if (Array.isArray(result.correctOrder) && typeof result.correctOrder[0] === "string") {
          const idToIdx: Record<string, number> = {};
          chunkObjs.forEach((c, i) => { if (c.id) idToIdx[String(c.id)] = i; });
          result.correctOrder = (result.correctOrder as string[]).map((id) => idToIdx[id] ?? 0);
        }
      }
      // chunks 셔플 + correctOrder 업데이트
      if (Array.isArray(result.chunks) && Array.isArray(result.correctOrder)) {
        const chunks = result.chunks as string[];
        const correctOrder = result.correctOrder as number[];
        // 원래 순서 저장
        const originalChunks = [...chunks];
        // 인덱스 배열 셔플
        const indices = chunks.map((_, i) => i);
        const shuffledIndices = shuffle(indices);
        // 셔플된 chunks
        result.chunks = shuffledIndices.map((i) => originalChunks[i]);
        // correctOrder 업데이트: 원래 정답 순서의 각 인덱스가 셔플 후 어디에 있는지
        const newPosOf: Record<number, number> = {};
        shuffledIndices.forEach((origIdx, newIdx) => { newPosOf[origIdx] = newIdx; });
        result.correctOrder = correctOrder.map((origIdx) => newPosOf[origIdx]);
      }
      break;
    }

    case "VOCAB_COLLOCATION":
      if (result.blankPart) delete result.word;
      break;

    case "VOCAB_CONFUSABLE":
      delete result.word;
      break;
  }

  // 선택지 셔플 (options 있는 모든 유형)
  if (Array.isArray(result.options) && result.correctAnswer) {
    shuffleOptions(result);
  }

  return result;
}

function normalizeResults(parsed: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [subType, items] of Object.entries(parsed)) {
    if (!Array.isArray(items)) continue;
    result[subType] = items.map((item: Record<string, unknown>) => normalizeItem(subType, item));
  }
  return result;
}

// ---------------------------------------------------------------------------
// POST — 카테고리 단위 학습 문제 생성
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { passageId, category, counts } = body as {
      passageId: string;
      category: string;
      counts: Record<string, number>;
    };

    if (!passageId || !category || !counts) {
      return NextResponse.json(
        { error: "passageId, category, counts 필수" },
        { status: 400 },
      );
    }

    let creditResult: { balanceAfter: number; transactionId: string };
    try {
      creditResult = await deductCredits(staff.academyId, "LEARNING_QUESTION_GEN", staff.id, {
        passageId,
        category,
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
          { status: 402 },
        );
      }
      throw err;
    }

    // 1. 지문 + 분석 데이터 로드
    const passage = await prisma.passage.findUnique({
      where: { id: passageId },
      include: { analysis: { select: { analysisData: true } } },
    });

    if (!passage) {
      await refundCredits(staff.academyId, "LEARNING_QUESTION_GEN", creditResult.transactionId, "Passage not found");
      return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!passage.analysis?.analysisData) {
      await refundCredits(staff.academyId, "LEARNING_QUESTION_GEN", creditResult.transactionId, "Analysis data missing");
      return NextResponse.json(
        { error: "지문 분석을 먼저 완료해주세요." },
        { status: 400 },
      );
    }

    // 2. 분석 데이터 파싱
    let analysis: PassageAnalysisData;
    try {
      analysis = JSON.parse(passage.analysis.analysisData);
    } catch {
      return NextResponse.json(
        { error: "분석 데이터 파싱 실패" },
        { status: 500 },
      );
    }

    // 3. 카테고리별 generateText 호출
    const prompt = buildCategoryPrompt(category, analysis, passage.content, counts)
      + "\n\n## 출력 형식\n반드시 유효한 JSON 객체로만 응답하세요. 다른 텍스트나 설명 없이 JSON만 출력하세요.";

    let text: string;
    try {
      const result = await generateText({ model, prompt, maxOutputTokens: 128000 });
      text = result.text;
    } catch (aiError) {
      await refundCredits(staff.academyId, "LEARNING_QUESTION_GEN", creditResult.transactionId, "Learning question generation failed");
      throw aiError;
    }

    // JSON 파싱 (코드블록 감싸져 있을 수 있음)
    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try {
      const parsed = JSON.parse(jsonStr);
      const normalized = normalizeResults(parsed);
      return NextResponse.json({ category, results: normalized, creditsRemaining: creditResult.balanceAfter });
    } catch (parseErr) {
      console.error(`JSON parse failed for ${category}:`, parseErr, "\nRaw text:", text.slice(0, 1000));
      await refundCredits(staff.academyId, "LEARNING_QUESTION_GEN", creditResult.transactionId, "JSON parse failed");
      return NextResponse.json(
        { error: `${category} JSON 파싱 실패` },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Learning question generation error:", error);
    return NextResponse.json(
      { error: "학습 문제 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
