import { generateObject } from "ai";
import { model } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { hashContent } from "@/lib/passage-utils";
import { passageAnalysisSchema } from "@/lib/passage-analysis-schema";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ passageId: string }> }
) {
  try {
    const { passageId } = await params;

    // 1. Fetch passage with cached analysis
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
        { status: 404 }
      );
    }

    // 2. Check cache
    const currentHash = hashContent(passage.content);
    if (passage.analysis && passage.analysis.contentHash === currentHash) {
      return NextResponse.json({
        data: JSON.parse(passage.analysis.analysisData),
        cached: true,
      });
    }

    // 3. Generate analysis with Gemini
    const schoolType = passage.school.type === "MIDDLE" ? "중학교" : "고등학교";

    const { object: analysisData } = await generateObject({
      model,
      schema: passageAnalysisSchema,
      prompt: `당신은 한국 중고등학교 영어 내신 시험 대비 전문 분석가입니다.
아래 영어 지문을 분석하여 학생들의 심층 학습을 위한 구조화된 데이터를 생성하세요.

## 지문 정보
- 학년: ${passage.grade}학년
- 학교 유형: ${schoolType}

## 지문 내용
${passage.content}

## 분석 지침

### sentences (문장별 분석)
- 지문을 문장 단위로 정확히 분리하세요
- english 필드에는 원문의 문장을 그대로 복사하세요 (한 글자도 변경하지 마세요)
- korean 필드에는 자연스러운 한국어 번역을 제공하세요
- 문장 순서대로 index를 0부터 부여하세요

### vocabulary (핵심 어휘)
- 시험 출제 가능성이 높은 핵심 어휘 10-20개를 선별하세요
- 너무 쉬운 단어(a, the, is, have 등)는 제외하세요
- partOfSpeech는 한국어로: 명사, 동사, 형용사, 부사, 전치사, 접속사, 대명사
- pronunciation은 한국어 발음 표기 (예: environment → "인바이런먼트")
- sentenceIndex는 해당 단어가 처음 등장하는 문장의 index
- difficulty는 학년 수준 기준: basic(교과서 필수), intermediate(심화), advanced(고난도)

### grammarPoints (문법 포인트)
- 내신 시험 빈출 문법 패턴 3-8개를 식별하세요
- textFragment는 지문에서 해당 문법이 사용된 정확한 부분 문자열이어야 합니다 (대소문자 포함 정확히 일치)
- pattern은 한국어 문법 용어 (예: "현재완료 have+p.p.", "관계대명사 which", "가정법 과거")
- explanation은 학생이 이해할 수 있는 쉬운 한국어 설명
- examples는 같은 문법 패턴의 추가 예문 2-3개
- level은 학년 태그 (중1, 중2, 중3, 고1, 고2, 고3)
- id는 "gp-1", "gp-2" 형식으로 부여

### structure (글 구조 분석)
- 모든 내용은 한국어로 작성
- mainIdea: 글의 핵심 주제를 한 문장으로
- purpose: 글의 목적 (정보 전달, 설득, 묘사, 이야기 등)
- textType: 글의 유형 (설명문, 논설문, 서사문, 수필, 대화문, 편지 등)
- paragraphSummaries: 각 단락의 요약과 역할 (role은 서론, 본론, 결론, 전환 등)
- keyPoints: 시험에 나올 수 있는 핵심 포인트 3-5개`,
    });

    // 4. Cache the result
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

    return NextResponse.json({ data: analysisData, cached: false });
  } catch (error) {
    console.error("Passage analysis error:", error);
    return NextResponse.json(
      { error: "지문 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
