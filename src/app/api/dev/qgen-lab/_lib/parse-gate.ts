// 복제 원본: src/app/api/workbench/ai-jobs/question-generation/md-stream/route.ts
//   :474-577  parseAndGate — 어법 분기(:520-577)만. 이슈 순서 = gateMdQuestion → v2(인용+킬러 게이트 4종) → 교사 준수.
//   :1297-1325, :1357-1366  lunaParseAndGate — 어법 표준형(5·1) 분기 + JSON 파싱 실패 이슈 변환.
//   :421-472  teacherPointComplianceIssues — 어법 분기(:452-469)만(랩은 어법 전용이라 빈칸 분기 불요).
//   :1409-1422  withTruncationHint.
// 파서·게이트는 전부 원본 import — 게이트 메시지가 곧 재생성 피드백 문구라 바이트 동일해야 한다.

import {
  autoSnapGrammarMarks,
  gateMdQuestion,
  normalizeWs,
  parseMdGrammar,
  type MdGrammarQuestion,
} from "@/lib/md-qgen/parser";
import {
  processGrammarKillerV2Quotes,
  stripGrammarKillerV2Plan,
} from "@/lib/md-qgen/grammar-killer-v2";
import {
  adaptLunaGrammarJson,
  renumberGrammarByAppearance,
} from "@/lib/md-qgen/luna-lane";
import { gateGrammarKillerDeadDecoys } from "@/lib/md-qgen/gate-grammar-killer-decoys";
import { gateGrammarKillerOverdrilledAnswer } from "@/lib/md-qgen/gate-grammar-killer-overdrilled";
import { gateGrammarKillerDecoyDepth } from "@/lib/md-qgen/gate-grammar-killer-decoy-depth";
import { gateGrammarKillerAnswerSite } from "@/lib/md-qgen/gate-grammar-killer-answer-site";
import type { GenFormat, LabDifficulty } from "@/lib/qgen-lab/types";

// 어법 표준형 고정(랩 범위) — route.ts:1426 formatCounts 의 5·1.
const COUNTS = { markerCount: 5, answerCount: 1 } as const;

export interface LabParseArgs {
  text: string;
  passage: string;
  format: GenFormat;
  /** buildLabGrammarPrompt 가 돌려준 값을 그대로 넘긴다(프롬프트·게이트 짝 보장). */
  grammarKillerV2: boolean;
  difficulty: LabDifficulty;
  teacherPoints?: { text: string }[];
}

export interface LabParsed {
  question: MdGrammarQuestion | null;
  gateIssues: string[];
  corrections: string[];
  parseError: string | null;
}

/**
 * 교사 지정 준수 게이트(어법) — route.ts:421-472 의 어법 분기(:452-469) 사본.
 * 지정 표현마다 어떤 밑줄의 원형·표시형과 정규화 양방향 포함이어야 한다.
 */
export function teacherPointComplianceIssues(
  q: MdGrammarQuestion,
  points: { text: string }[],
): string[] {
  if (points.length === 0) return [];
  const issues: string[] = [];
  for (const p of points) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    const hit = q.marks.some((m) => {
      const orig = normalizeWs(m.original);
      const shown = normalizeWs(m.shown);
      return (
        orig.includes(pt) ||
        pt.includes(orig) ||
        shown.includes(pt) ||
        pt.includes(shown)
      );
    });
    if (!hit) {
      issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

/** md 계약 — route.ts:520-577 순서 그대로. */
function parseAndGateMd(
  text: string,
  passage: string,
  teacherPoints: { text: string }[],
  opts: { grammarKillerV2: boolean; requestedDifficulty: string },
): LabParsed {
  // 설계메모 절단 — 「밑줄지문:」 이전만 자르므로 설계메모 없는 출력에는 무해.
  let q = parseMdGrammar(stripGrammarKillerV2Plan(text));
  // 라벨 등장순 재번호(marks·answer·fixes·wrong 동기 치환).
  q = renumberGrammarByAppearance(q).question;
  const snapped = autoSnapGrammarMarks(q, passage);
  q = snapped.question;
  // v2 인용 앵커 + 킬러 게이트 4종(v2 전용).
  const quoteIssues: string[] = [];
  if (opts.grammarKillerV2) {
    const processed = processGrammarKillerV2Quotes(q, passage);
    q = processed.question;
    quoteIssues.push(...processed.issues);
    quoteIssues.push(...gateGrammarKillerDeadDecoys(q));
    quoteIssues.push(
      ...gateGrammarKillerOverdrilledAnswer(q, {
        requestedDifficulty: opts.requestedDifficulty,
      }),
    );
    quoteIssues.push(...gateGrammarKillerDecoyDepth(q, opts.requestedDifficulty));
    quoteIssues.push(...gateGrammarKillerAnswerSite(q));
  }
  return {
    question: q,
    gateIssues: [
      // gateMdQuestion 은 인용 처리 **후** q 로 돈다(절단 검사 대상이 분석부).
      ...gateMdQuestion(q, passage, {
        markerCount: COUNTS.markerCount,
        answerCount: COUNTS.answerCount,
      }),
      ...quoteIssues,
      ...teacherPointComplianceIssues(q, teacherPoints),
    ],
    corrections: snapped.corrections,
    parseError: null,
  };
}

/** luna-json 계약 — route.ts:1302-1325 + 파싱 실패 변환 :1357-1366(메시지 바이트 동일). */
function parseAndGateLunaJson(
  text: string,
  passage: string,
  teacherPoints: { text: string }[],
): LabParsed {
  try {
    const adapted = adaptLunaGrammarJson(text);
    const snapped = autoSnapGrammarMarks(adapted.question, passage);
    return {
      question: snapped.question,
      gateIssues: [
        ...adapted.issues,
        ...gateMdQuestion(snapped.question, passage, {
          markerCount: COUNTS.markerCount,
          answerCount: COUNTS.answerCount,
        }),
        ...teacherPointComplianceIssues(snapped.question, teacherPoints),
      ],
      corrections: [
        ...snapped.corrections,
        ...(adapted.renumbered ? ["luna: 라벨 등장순 재번호"] : []),
        ...adapted.markerInserted.map((l) => `luna: ${l} 마커 자동삽입`),
      ],
      parseError: null,
    };
  } catch (parseErr) {
    const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
    return {
      question: null,
      gateIssues: [`luna JSON 파싱 실패: ${message}`],
      corrections: [],
      parseError: message,
    };
  }
}

/**
 * 생성 원문 → 파싱·게이트. md 경로는 프로덕션에 try 가 없다(예외 = 잡 실패) — 랩은 예외를
 * parseError 로 받아 기록하고 이슈 `md 파싱 예외: …` 로 돌려준다(오케스트레이터가 error 로 처리 가능).
 */
export function labParseAndGate(a: LabParseArgs): LabParsed {
  const teacherPoints = a.teacherPoints ?? [];
  if (a.format === "luna-json") {
    return parseAndGateLunaJson(a.text, a.passage, teacherPoints);
  }
  try {
    return parseAndGateMd(a.text, a.passage, teacherPoints, {
      grammarKillerV2: a.grammarKillerV2,
      requestedDifficulty: a.difficulty,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      question: null,
      gateIssues: [`md 파싱 예외: ${message}`],
      corrections: [],
      parseError: message,
    };
  }
}

/** finish=length 절단 표식 — route.ts:1409-1422 사본("파싱 실패" 이슈에만 부착, md 경로는 사실상 no-op). */
export function withTruncationHint(
  p: LabParsed,
  finishReason: string | null,
): LabParsed {
  return finishReason === "length" && p.gateIssues.length > 0
    ? {
        ...p,
        gateIssues: p.gateIssues.map((i) =>
          i.includes("파싱 실패")
            ? `${i} [finish=length: 출력 예산 절단]`
            : i,
        ),
      }
    : p;
}
