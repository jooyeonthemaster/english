// ============================================================================
// 학생 시험 리포트 v3 — E2 답안 판독 (vision, 학생 마킹 사진 → StudentResponse 프리필)
//
// examMap 을 컨텍스트로, 학생 시험지 사진(≤12장) 전체를 1콜에 넘겨 판독한다.
// 판독 규칙(취소선 무시·네모 최종·모호하면 UNKNOWN+질문)은 prompts.ts E2 프롬프트에.
// 전 응답 source:"AUTO", reviewed:false, aiRead 채움 — 강사가 정오표에서 확정.
// 병합(강사 확정분 보존)은 grading.ts mergeReadIntoResponses 순수함수가 담당한다.
// ============================================================================

import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";
import { normalizeChoiceToken, studentReadLlmSchema } from "./schemas";
import type {
  AiReadCell,
  ExamMap,
  ReadAiMeta,
  ReadUncertainty,
  ResponseStatus,
  StudentResponse,
} from "./types";
import { buildStudentReadSystemPrompt, buildStudentReadUserPrompt } from "./prompts";
import { callExamReportJson, createExamReportUsage } from "./llm";

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * 값이 "정확히 하나의 선지 토큰"으로 정규화될 때만 그 토큰을 돌려준다(아니면 undefined).
 * normalizeChoiceToken 은 '1, 3'(복수정답)에서 첫 숫자만 집어 raw-trim 폴백과 함께
 * 정답을 WRONG 으로 오판할 수 있으므로, 선지 토큰(1~5·①~⑤) 출현 횟수가 정확히 1일
 * 때만 단일 토큰으로 인정해 결정론 대조가 복수정답/복수 마킹을 오판하지 않게 한다.
 */
function singleChoiceToken(value: unknown): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (raw.length === 0) return undefined;
  const tokens = raw.match(/[1-5①-⑤]/g);
  if (!tokens || tokens.length !== 1) return undefined;
  return normalizeChoiceToken(raw);
}

interface ReadCell {
  status: ResponseStatus;
  chosenChoice?: string;
  writtenAnswer?: string;
  gradedMark?: string;
  earnedPoints?: number;
  confidence: AiReadCell["confidence"];
  evidence?: string;
}

export interface ReadStudentPaperResult {
  /** examMap 전 문항 프리필(source:AUTO, reviewed:false, aiRead 채움). */
  responses: StudentResponse[];
  uncertainties: ReadUncertainty[];
  aiMeta: ReadAiMeta;
  /** LLM 콜 자체가 실패(타임아웃/HTTP/파싱)했는지 — true 면 responses 는 무의미한
   *  전량 UNKNOWN 폴백이므로 라우트가 FAILED 로 처리해 저장/프리필을 덮지 않아야 한다. */
  failed: boolean;
}

/**
 * E2: 학생 마킹 사진을 examMap 기준으로 판독한다(학생당 1콜).
 * LLM 이 언급하지 않은 문항은 status UNKNOWN(무응답 추정 금지).
 * LLM 콜 자체가 실패하면 failed:true 로 표시해 라우트가 성공(READ)으로 오인해
 * 기존 프리필을 파괴하거나 재시도 캡을 소진하지 않게 한다.
 */
export async function readStudentPaper(
  images: AtlasChatImageInput[],
  examMap: ExamMap,
  opts: { deadlineAt?: number } = {},
): Promise<ReadStudentPaperResult> {
  const usage = createExamReportUsage();
  const startedAt = Date.now();
  const byKey = new Map<string, ReadCell>();
  let uncertainties: ReadUncertainty[] = [];
  let failed = false;

  try {
    const parsed = await callExamReportJson({
      stage: "studentRead",
      systemPrompt: buildStudentReadSystemPrompt(),
      userPrompt: buildStudentReadUserPrompt(examMap),
      images,
      schema: studentReadLlmSchema,
      deadlineAt: opts.deadlineAt,
      cacheImages: true,
      usage,
    });

    for (const response of parsed.responses) {
      const key = numberKey(response.number);
      if (!key) continue;
      byKey.set(key, {
        status: response.status,
        chosenChoice: response.chosenChoice,
        writtenAnswer: response.writtenAnswer,
        gradedMark: response.gradedMark,
        earnedPoints: response.earnedPoints ?? undefined,
        confidence: response.confidence,
        evidence: response.evidence,
      });
    }

    // examMap 에 존재하는 번호의 uncertainty 만 채택(창작 번호 차단).
    const validNumbers = new Set(examMap.questions.map((q) => numberKey(q.number)));
    uncertainties = parsed.uncertainties.filter((u) => validNumbers.has(numberKey(u.number)));
  } catch {
    // LLM 콜 실패 → failed 플래그로 라우트에 전달(FAILED 처리·프리필 보존).
    failed = true;
  }

  // 결정론 대조로 status 를 재도출한 문항의 강사 확인 요청(uncertainties 에 합류).
  const crossUncertainties: ReadUncertainty[] = [];
  // 같은 번호 중복 방지 후 강사 확인 요청 합류(결정론 대조 불일치·대조 불가 공통).
  const pushCross = (number: string, question: string) => {
    if (!crossUncertainties.some((u) => numberKey(u.number) === numberKey(number))) {
      crossUncertainties.push({ number, question, kind: "MC" });
    }
  };
  const responses = examMap.questions.map((q): StudentResponse => {
    const cell = byKey.get(numberKey(q.number));
    if (!cell) {
      return { number: q.number, status: "UNKNOWN", source: "AUTO", reviewed: false };
    }
    const chosenChoice = cell.chosenChoice ? normalizeChoiceToken(cell.chosenChoice) : undefined;
    let status = cell.status;
    let confidence = cell.confidence;

    // 결정론 대조(오독 방어선): MC 문항이고 학생 선택·정답이 모두 있으면 선지 대조로
    // 정오를 재도출한다. 단, 학생 선택·정답이 "둘 다 단일 선지 토큰"으로 정규화될
    // 때만 결정론이 LLM 판정을 덮어쓴다 — 복수정답('1, 3')·복수 마킹은
    // normalizeChoiceToken 의 첫숫자/raw-trim 폴백이 정답을 WRONG 으로 오판할 수 있어,
    // 이 경우엔 LLM status 를 유지하고 강사 확인 요청만 남긴다.
    if (q.kind === "MC" && chosenChoice && q.correctAnswer) {
      const chosenSingle = singleChoiceToken(cell.chosenChoice);
      const answerSingle = singleChoiceToken(q.correctAnswer);
      if (chosenSingle && answerSingle) {
        const derived: ResponseStatus = chosenSingle === answerSingle ? "CORRECT" : "WRONG";
        if (derived !== status) {
          status = derived;
          confidence = "LOW";
          pushCross(q.number, "AI 정오 판정과 선지 대조 불일치 — 확인 필요");
        }
      } else {
        // 복수정답·복수 마킹 등 단일 토큰이 아니면 자동 대조 불가 → LLM 유지 + 확인 요청.
        pushCross(q.number, "복수정답 등으로 자동 대조 불가 — 확인 필요");
      }
    }

    const aiRead: AiReadCell = {
      chosenChoice,
      writtenAnswer: cell.writtenAnswer,
      gradedMark: cell.gradedMark,
      confidence,
      evidence: cell.evidence,
    };
    return {
      number: q.number,
      status,
      chosenChoice,
      earnedPoints: cell.earnedPoints,
      source: "AUTO",
      reviewed: false,
      aiRead,
    };
  });

  // 결정론 대조 불일치를 uncertainties 에 합류(LLM 이 이미 같은 번호를 물었으면 생략).
  for (const cu of crossUncertainties) {
    if (!uncertainties.some((u) => numberKey(u.number) === numberKey(cu.number))) {
      uncertainties.push(cu);
    }
  }

  const aiMeta: ReadAiMeta = {
    calls: usage.calls,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    durationMs: Date.now() - startedAt,
  };

  return { responses, uncertainties, aiMeta, failed };
}
