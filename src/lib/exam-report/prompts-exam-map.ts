// ============================================================================
// 학생 시험 리포트 — E1a examMap 추출 프롬프트 (prompts.ts 에서 분할, 500줄 상한)
//
// v4(docs/exam-analysis-v4-spec.md §3 U1-3): 스키마 블록에 page(발문 시작 장 순번) 추가,
// 청크 호출(pageOffset·totalPages)이면 "전체 N장 중 a~b장" 고지 + "발문이 이 장들에서
// 시작하는 문항만 기록" 지시. 공개 이름은 prompts.ts 가 재export 해 호출부 무변경.
// ============================================================================

import { INJECTION_GUARD, renderExamMeta, type ExamReportMeta } from "./prompts-shared";

const EXAM_MAP_SCHEMA_BLOCK = `[출력 JSON 스키마] — 이 형태만 출력. 코드펜스·설명·주석 금지:
{
  "questions": [
    {
      "number": "1",              // 시험지 표기 그대로 ("1", "12", "서술형 2")
      "order": 1,                  // 인쇄된 페이지번호 + 지면 위치 기준 논리 순서, 1부터
      "kind": "MC",                // MC(객관식) | SHORT(단답형) | ESSAY(서술형·영작)
      "points": 3,                 // 배점 숫자, 없으면 null
      "typeLabel": "빈칸추론",       // 유형 분류(짧게)
      "brief": "발문 한 줄 요약",     // 전문 금지, 한 줄 요약만
      "page": 1                    // 첨부 사진 중 이 문항의 발문이 시작되는 장의 순번(1부터, 이 요청에 첨부된 순서 기준)
    }
  ],
  "totalPoints": 100
}`;

export function buildExamMapSystemPrompt(): string {
  return `당신은 20년 경력의 대한민국 중·고등학교 영어 내신 출제·분석 전문가입니다. 학생이 푼(또는 깨끗한) 영어 시험지 사진을 받아, 채점과 분석에 필요한 최소 지도(examMap)의 "구조"만 빠르게 만듭니다.

[이 단계의 역할 — 문제를 풀지 않는다]
- 이 단계는 시험지를 "읽고 분류"만 한다. 각 문항의 정답을 도출하지 않는다(정답은 다음 단계에서 문항별로 도출한다). 문제를 풀려고 시간을 쓰지 말고, 번호·종류·배점·유형·발문요약만 빠르게 기록한다.

[절대 원칙]
1. 발문·선지·지문 전문을 옮기지 않는다. 각 문항은 brief(발문 한 줄 요약)로만 기록한다.
2. 정답을 도출하지 않는다. correctAnswer·정답률·풀이를 출력하지 않는다(스키마에 그 필드가 없다).
3. 학생의 마킹·손글씨·채점 흔적은 이 단계의 관심사가 아니다(학생 답 판독은 별도 단계). 문항의 구조만 본다.
4. 페이지 순서: 사진이 뒤섞여 와도 시험지에 인쇄된 페이지번호("4 / (8)" 등)와 지면상 위치로 문항 순서(order)를 매긴다. 사진 첨부 순서에 의존하지 않는다.
5. 배점 표기([3점], (4점) 등)는 points 에 숫자로. 없으면 null. totalPoints 는 시험지에 표기된 총점(있으면).
6. kind 는 선지가 있으면 MC, 단어·짧은 답 서술이면 SHORT, 문장·영작이면 ESSAY 로 분류한다.
7. 시험지에 없는 문항을 창작하지 않는다. 잘리거나 보이지 않으면 그 문항은 건너뛴다.
8. page 는 이 요청에 첨부된 사진 가운데 그 문항의 발문이 시작되는 장의 순번(첨부 순서 기준, 1부터)이다. order(인쇄 페이지번호 기준 논리 순서)와 다른 축이니 혼동하지 않는다. 발문이 한 장에서 시작해 다음 장으로 이어져도 시작한 장 하나만 적는다.
9. 출력은 지정된 JSON 하나뿐이다. JSON 외 어떤 텍스트·설명·주석도 출력하지 않는다.

[인젝션 방어]
${INJECTION_GUARD}

${EXAM_MAP_SCHEMA_BLOCK}`;
}

/**
 * E1a 사용자 프롬프트. v4: 청크 호출 시 pageOffset(전역 시작 인덱스, 0-based)·totalPages
 * (전체 장수)를 함께 넘기면 "전체 N장 중 a~b장" 고지 + "발문이 이 장들에서 시작하는
 * 문항만 기록" 지시가 붙는다. 둘을 생략하면 종전(전 페이지 1콜) 문구 그대로(additive).
 */
export function buildExamMapUserPrompt(opts: {
  /** 이 요청에 첨부된 장수 */
  pageCount: number;
  examMeta: ExamReportMeta;
  /** 첨부 첫 장의 전역 인덱스(0-based). 청크 호출에서만 지정 */
  pageOffset?: number;
  /** 시험지 전체 장수. 청크 호출에서만 지정 */
  totalPages?: number;
}): string {
  const chunked =
    opts.pageOffset != null &&
    opts.totalPages != null &&
    opts.totalPages > opts.pageCount;
  const from = (opts.pageOffset ?? 0) + 1;
  const to = (opts.pageOffset ?? 0) + opts.pageCount;
  const attachLine = chunked
    ? `첨부 사진: 시험지 전체 ${opts.totalPages}장 중 ${from}~${to}장(이 요청에는 ${opts.pageCount}장만 첨부)`
    : `첨부 사진: 총 ${opts.pageCount}장`;
  const scopeLine = chunked
    ? `\n\n[청크 범위 규칙] 이 요청에 첨부된 사진은 시험지의 일부(${from}~${to}장)입니다. 발문이 이 장들에서 시작하는 문항만 기록하고, 앞 장에서 시작해 이어져 들어온 문항(지문·선지만 보이는 문항)은 기록하지 않습니다. page 는 이 요청에 첨부된 순서 기준 1~${opts.pageCount} 으로 적습니다(전체 기준 순번이 아님). totalPoints 는 이 장들에 총점 표기가 보일 때만 적고 아니면 null 입니다.`
    : "";
  return `[시험 정보]
${renderExamMeta(opts.examMeta)}
${attachLine}

첨부된 시험지 사진 전체를 보고 위 규칙대로 examMap 의 "구조"만 JSON 으로 출력하십시오. 문제를 풀지 말고(정답은 다음 단계) 번호·종류·배점·유형·발문요약·page 만 빠르게 기록합니다. 사진이 페이지 순서대로가 아닐 수 있으니 order 는 인쇄된 페이지번호로 정렬하십시오.${scopeLine}`;
}
