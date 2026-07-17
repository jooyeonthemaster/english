// ============================================================================
// 학생 시험 리포트 v3 — 정답-해설 정합 게이트 (E1b 배치 후처리)
//
// 왜: E1b 는 해설(explanation)에서 정답을 옳게 도출해 놓고 correctAnswer 필드에
// 다른 번호를 적는 "전사 결함"을 낸다 — 26-07-17 MP 실사진 심판단 실측에서 두 모델
// 공통으로 확인(3p: gemini 5·10번 / 7p: sonnet 1·3번 등). 특히 gemini 오답의
// 전부가 이 유형이었고(정답 키 정확도 83%의 잔여 결함), 정규식이 잡아낸 해설-필드
// 불일치는 예외 없이 해설 쪽이 블라인드 풀이 합의와 일치했다 → "해설 결론 우선".
//
// 구조(문제생성 solver-gate 이식): 결정론 정규식 선별(무비용, 실측 적중률 6~33%)
// → 잔여 MC 만 텍스트 전용 LLM 정합 콜 1회/배치(이미지 불요, ~$0.006) → 불일치 시
// 해설 결론으로 교체 + answerConfidence LOW 강등(강사 "확인 필요" 뱃지 발화).
// 게이트 자체의 실패(타임아웃·파싱)는 무판정 통과 — 게이트 장애가 분석을 죽이지
// 않는다(grammar-solver-gate:125-133 과 동일 계약).
// ============================================================================

import { z } from "zod";
import type { ExamMapAnswer, ExamMapEntry } from "./types";
import { callExamReportJson, type ExamReportLlmUsage } from "./llm";

/** 마감까지 이 예산 미만이면 게이트를 건너뛴다(어법 사다리 LADDER_MIN_CALL_BUDGET_MS 관례). */
const MIN_GATE_BUDGET_MS = 20_000;

const CIRCLED: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };

/**
 * 결정론: 해설 본문에서 "정답은 X(번|이다|입니다…)" 류 최종 결론을 추출한다.
 * 결론이 여러 번 나오면 마지막 것(자기교정 서술의 최종 판단)을 채택. 실패 시 null.
 * ⚠️ 부정 서술 오탐 방어(적대 리뷰 HIGH): "정답은 ②가 아니라 ③이다" 류에서 ②를
 * 결론으로 오추출하면 옳은 필드를 오염시킨다 — suffix 에서 조사(이/가)를 빼고
 * (해당 문형은 LLM 게이트로 폴백), suffix 뒤 "아니-" 연결은 lookahead 로 배제한다.
 */
export function extractConcludedAnswer(explanation: string | undefined): string | null {
  if (!explanation) return null;
  const re =
    /정답[은는이]?\s*(?:선지)?\s*([①②③④⑤]|[1-5])\s*(?:번|이다|입니다|\.|,|$)(?!\s*[이가는은]?\s*아니)/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = re.exec(explanation)) !== null) last = match[1];
  return last ? (CIRCLED[last] ?? last) : null;
}

const gateItemSchema = z.object({
  number: z.string(),
  /** 해설이 결론짓는 정답 선지 번호("1"~"5"). 복수면 콤마 병기. 불명확하면 "UNCLEAR". */
  explanationAnswer: z.string(),
});
const gateSchema = z.object({ items: z.array(gateItemSchema) });

const GATE_SYSTEM_PROMPT = `너는 시험 문항 분석 데이터의 정합성 검증기다. 각 문항의 한국어 해설(explanation)을 읽고, 그 해설이 최종적으로 결론짓는 정답 선지 번호를 판독한다.

규칙:
- 해설 자체의 옳고 그름은 판단하지 않는다. 오직 "해설이 어느 선지를 정답이라고 결론짓는가"만 읽는다.
- 해설이 특정 단어/문장을 정답으로 지목하면 선지 목록 정보 없이도 해설 안의 대응(예: "⑤ confused", "4번 문장")을 근거로 번호를 판독한다.
- 자기교정 서술("재검토 결과 …")이 있으면 마지막 결론을 채택한다.
- 복수 정답을 결론지으면 콤마로 병기한다(예: "1,2").
- 해설이 결론을 내리지 않거나 번호를 특정할 수 없으면 "UNCLEAR".
- 다른 설명 없이 JSON 만 출력한다.`;

function buildGateUserPrompt(
  items: { number: string; field: string; explanation: string }[],
): string {
  const blocks = items
    .map(
      (item) =>
        `[문항 ${item.number}] (현재 correctAnswer 필드: ${item.field})\n해설: ${item.explanation}`,
    )
    .join("\n\n");
  return `다음 각 문항에 대해 explanationAnswer 를 판독하라.\n\n${blocks}\n\n{"items":[{"number":"...","explanationAnswer":"..."}]} 형식으로 출력하라.`;
}

function firstChoiceDigit(value: string | undefined): string | null {
  const m = String(value ?? "").match(/[1-5]/);
  return m ? m[0] : null;
}

/** "1,2" 병기 응답 → 유효 숫자 목록. UNCLEAR/무효는 빈 배열. */
function parseGateAnswer(raw: string): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => firstChoiceDigit(s))
    .filter((s): s is string => s != null);
}

export interface ReconcileResult {
  answers: ExamMapAnswer[];
  /** 교정된 문항 번호(관측용 로그 재료) */
  corrected: string[];
}

/**
 * E1b 한 배치의 정답 패치(answers)를 해설 결론과 대조해 전사 결함을 교정한다.
 * - MC + 정답 도출 완료 문항만 대상(서답형·미도출은 통과).
 * - 결정론 추출 성공: 일치→통과 / 불일치→해설 결론으로 즉시 교체(무비용).
 * - 결정론 실패분: 배치당 1회 텍스트 LLM 콜로 판독. UNCLEAR·복수정답 포함(필드가
 *   결론 집합에 들면 일치)·게이트 콜 실패는 전부 원본 유지(무판정 통과).
 * - 교체 시 answerConfidence 는 LOW 로 강등 — exam-map-table 의 "확인 필요" 뱃지 발화.
 */
export async function reconcileBatchAnswers(opts: {
  batchEntries: ExamMapEntry[];
  answers: ExamMapAnswer[];
  explanationByKey: Map<string, string>;
  deadlineAt: number;
  usage: ExamReportLlmUsage;
}): Promise<ReconcileResult> {
  const kindByKey = new Map(
    opts.batchEntries.map((entry) => [entry.number.replace(/\s+/g, ""), entry.kind]),
  );
  const corrected: string[] = [];
  const answers = opts.answers.map((answer) => ({ ...answer }));

  // ── 1단계: 결정론 정규식 선별 ─────────────────────────────────────────────
  const needsLlm: { number: string; field: string; explanation: string }[] = [];
  for (const answer of answers) {
    const key = answer.number.replace(/\s+/g, "");
    if (kindByKey.get(key) !== "MC") continue;
    const field = firstChoiceDigit(answer.correctAnswer ?? undefined);
    const explanation = opts.explanationByKey.get(key);
    if (!field || !explanation) continue;
    const concluded = extractConcludedAnswer(explanation);
    if (concluded) {
      if (concluded !== field) {
        answer.correctAnswer = concluded;
        // LOW = 강사 "확인 필요" 뱃지 발화 조건(exam-map-table 은 LOW 만 강조) —
        // 게이트가 교정한 행은 반드시 사람 검토 대상으로 노출한다(적대 리뷰 j).
        answer.answerConfidence = "LOW";
        corrected.push(answer.number);
      }
      continue; // 결정론 판독 완료 — LLM 불요
    }
    needsLlm.push({ number: answer.number, field, explanation });
  }

  // ── 2단계: 잔여분 LLM 판독(배치당 1콜, 텍스트 전용) ──────────────────────
  if (needsLlm.length > 0 && opts.deadlineAt - Date.now() >= MIN_GATE_BUDGET_MS) {
    try {
      const gate = await callExamReportJson({
        stage: "examAnalysis",
        systemPrompt: GATE_SYSTEM_PROMPT,
        userPrompt: buildGateUserPrompt(needsLlm),
        schema: gateSchema,
        deadlineAt: opts.deadlineAt,
        usage: opts.usage,
      });
      const byKey = new Map(
        gate.items.map((item) => [item.number.replace(/\s+/g, ""), item.explanationAnswer]),
      );
      for (const answer of answers) {
        const key = answer.number.replace(/\s+/g, "");
        const requested = needsLlm.find(
          (item) => item.number.replace(/\s+/g, "") === key,
        );
        if (!requested) continue;
        const verdict = parseGateAnswer(byKey.get(key) ?? "");
        // UNCLEAR(빈 배열)·필드가 결론 집합에 포함(복수정답 포함)이면 원본 유지.
        if (verdict.length === 0 || verdict.includes(requested.field)) continue;
        answer.correctAnswer = verdict[0];
        answer.answerConfidence = "LOW"; // 교정 행은 "확인 필요" 뱃지로 노출(위와 동일)
        corrected.push(answer.number);
      }
    } catch {
      // 게이트 실패 = 무판정 통과 — 분석 본체를 죽이지 않는다(solver-gate 계약).
    }
  }

  return { answers, corrected };
}
