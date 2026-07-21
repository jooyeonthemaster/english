// ============================================================================
// md-qgen 어댑터 — 마크다운 파싱 결과를 프로덕션 AI 문항 형상으로 변환한다.
// (26-07-21 심플 스택 1단계) 이 모듈은 순수 매핑만 담당한다 — 후처리·검증·셔플은
// 앱 레이어(md-stream 라우트)가 postProcessQuestion 계열로 수행한다(레이어 규칙:
// lib 은 app/_lib 을 import 하지 않는다).
//
// 형상 근거(정찰 실측): AI 스키마의 wrongOptionExplanations 는 "배열"이며 저장
// 시 후처리가 Record 로 정규화한다. GRAMMAR 는 correctAnswer 가 폴백일 뿐
// markedExpressions[].isError 가 정답의 진실원이고, 라벨은 후처리가 지문 등장
// 순으로 재부여한다. surroundingText 는 마커 위치탐색 정확도에 직결된다.
// ============================================================================

import {
  normalizeWs,
  type MdBlankQuestion,
  type MdGrammarQuestion,
} from "./parser";

const INLINE_MARK_RE = /\[\[([A-E]):((?:(?!\]\]).)+)\]\]/g;

// 표기 주의: 린트(findKoreanEnglishGlue)가 한글-영문 붙임을 잡으므로 "vs"·"to"
// 같은 영문 조각을 쓰지 않는다(주제어 패턴 KEYPOINT_TOPIC_KEYWORDS 는 유지 매칭).
const POINT_NAME: Record<string, string> = {
  a: "정동사·준동사",
  b: "관계사",
  c: "분사",
  d: "수일치",
  e: "능·수동태",
  f: "형용사·부사",
  g: "대명사",
  h: "목적격보어",
  i: "병렬",
  j: "가정법",
  k: "부정사·동명사",
  l: "전치사·접속사",
  m: "비교구문",
};

/** 원문에서 표현 주변 문맥을 잘라 surroundingText 를 만든다(40~120자 지향). */
function contextAround(
  passage: string,
  index: number,
  length: number,
  pad = 45,
): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(passage.length, index + length + pad);
  let text = passage.slice(start, end);
  // 단어 중간 절단 방지 — 앞뒤로 공백 경계까지 다듬는다.
  if (start > 0) {
    const firstSpace = text.indexOf(" ");
    if (firstSpace > 0 && firstSpace < 20) text = text.slice(firstSpace + 1);
  }
  if (end < passage.length) {
    const lastSpace = text.lastIndexOf(" ");
    if (lastSpace > text.length - 20 && lastSpace > 0) text = text.slice(0, lastSpace);
  }
  return text.trim();
}

/** 오답해설 문장에서 기제 라벨("방향반대 — …")을 추출한다(없으면 null). */
function mechanismOf(text: string): string | null {
  const m = text.match(/^\s*([가-힣A-Za-z/·]+)\s*[—:-]/);
  return m ? m[1].trim() : null;
}

export interface MdBlankAdaptResult {
  ok: boolean;
  error?: string;
  aiQuestion?: Record<string, unknown>;
}

/**
 * 빈칸: md 파싱 결과 → aiBlankInferenceSchema 형상.
 * direction·blankDesign·keyPoints·tags 는 md 에 없어 결정론 합성한다
 * (blankDesign 은 후처리가 제거하는 내부 메모라 플레이스홀더로 충분).
 */
export function adaptMdBlankToAiQuestion(
  q: MdBlankQuestion,
  passage: string,
  difficulty: string,
): MdBlankAdaptResult {
  const oe = q.originalExpression?.trim();
  if (!oe) return { ok: false, error: "빈칸원문 누락" };
  const idx = passage.indexOf(oe);
  if (idx < 0) {
    // 공백 차이 허용 탐색(정규화 비교) — 그래도 없으면 실패.
    const pn = normalizeWs(passage);
    if (!pn.includes(normalizeWs(oe))) {
      return { ok: false, error: "빈칸원문이 지문에 축자로 없음" };
    }
  }
  if (q.options.length !== 5) return { ok: false, error: `선지 ${q.options.length}개` };
  if (!q.answer) return { ok: false, error: "정답 누락" };
  const wrong = q.wrong.filter((w) => w.label !== q.answer).slice(0, 4);
  const mechanisms = wrong
    .map((w) => mechanismOf(w.text))
    .filter((v): v is string => !!v);
  const keyPoints = [
    "빈칸은 글의 논지가 수렴하는 자리에 배치했습니다.",
    "정답은 원문 표현을 재사용하지 않는 추상적 재진술입니다.",
    mechanisms.length > 0
      ? `오답은 ${mechanisms.join("·")} 기제로 설계했습니다.`
      : "오답 네 개는 서로 다른 함정 기제로 설계했습니다.",
  ];
  return {
    ok: true,
    aiQuestion: {
      direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
      blankDesign: "md 원큐 경량 경로 — 설계 메모는 해설로 갈음합니다.",
      originalExpression: oe,
      // ⚠ 필수: 미설정 시 후처리 SOURCE_EXACT 기본이 정답 선지를 원문 축자로
      // 덮어써 추상 패러프레이즈 정답이 파괴된다(적대 검수 실증 — 26-07-21).
      blankAnswerMode: "PARAPHRASE",
      // idx<0(정규화로만 존재)면 빈 문자열로 두어 후처리 전역 매칭에 맡긴다 —
      // Math.max(0,-1)=0 으로 지문 맨앞을 오려 보내던 오배치 방지.
      surroundingText: idx >= 0 ? contextAround(passage, idx, oe.length) : "",
      options: q.options.map((o) => ({ label: o.label, text: o.text })),
      correctAnswer: q.answer,
      wrongOptionExplanations: wrong.map((w) => ({
        label: w.label,
        explanation: w.text,
      })),
      explanation: q.explanation,
      keyPoints,
      tags: [],
      difficulty,
    },
  };
}

export interface MdGrammarAdaptResult {
  ok: boolean;
  error?: string;
  aiQuestion?: Record<string, unknown>;
}

/**
 * 어법(v2 지문복사): md 파싱 결과 → GRAMMAR_ERROR AI 형상(markedExpressions).
 * 위치는 밑줄지문의 인라인 마커에서 정확히 도출해 surroundingText 를 만든다.
 * isError 가 정답의 진실원이므로 answer 라벨과 오형 위치를 일치시켜 산출한다.
 */
export function adaptMdGrammarToAiQuestion(
  q: MdGrammarQuestion,
  passage: string,
  difficulty: string,
): MdGrammarAdaptResult {
  if (q.marks.length !== 5) return { ok: false, error: `밑줄 ${q.marks.length}개` };
  if (!q.answer) return { ok: false, error: "정답 누락" };
  const answerMark = q.marks.find((m) => m.label === q.answer);
  if (!answerMark) return { ok: false, error: "정답 라벨이 밑줄에 없음" };

  // 밑줄지문 → 깨끗한 지문으로 재구성하며 각 마커의 원문 내 위치를 계산한다.
  const positions = new Map<string, number>();
  let clean = "";
  if (q.markedPassage) {
    let cursor = 0;
    for (const m of [...q.markedPassage.matchAll(INLINE_MARK_RE)]) {
      const label = `(${m[1]})`;
      const mark = q.marks.find((x) => x.label === label);
      clean += q.markedPassage.slice(cursor, m.index);
      positions.set(label, clean.length);
      clean += mark?.original ?? m[2];
      cursor = (m.index ?? 0) + m[0].length;
    }
    clean += q.markedPassage.slice(cursor);
  }
  // 재구성본이 원문과 정합하지 않으면 원문 기준 탐색으로 폴백한다.
  const useClean = clean && normalizeWs(clean) === normalizeWs(passage);
  const contextSource = useClean ? clean : passage;

  const markedExpressions = q.marks.map((m) => {
    const isError = m.label === q.answer;
    let index = positions.get(m.label) ?? -1;
    if (!useClean || index < 0) {
      index = passage.indexOf(m.original);
    }
    const surroundingText =
      index >= 0
        ? contextAround(contextSource, index, m.original.length)
        : m.original;
    return {
      label: m.label,
      expression: m.original,
      isError,
      // 스키마 계약: errorExpression 은 전 마커 필수 — 미끼는 원문과 동일.
      errorExpression: isError ? m.shown : m.original,
      ...(isError ? { correction: q.fix || m.original } : {}),
      surroundingText,
      pointCode: POINT_NAME[m.code] ? m.code : "a",
    };
  });

  const wrong = q.wrong.filter((w) => w.label !== q.answer).slice(0, 4);
  const wrongOptionExplanations = wrong.map((w) => {
    const mark = q.marks.find((m) => m.label === w.label);
    return {
      label: w.label,
      expression: mark?.original ?? "",
      pointCode: mark && POINT_NAME[mark.code] ? mark.code : "a",
      explanation: w.text,
    };
  });

  // keyPoints 검증기 계약(shared.ts findGrammarKeypointChoiceMismatch): 각 항목은
  // 실제 밑줄 라벨로 시작, 1번은 정답 라벨, 본문에 해당 포인트 주제어 포함.
  // 라벨은 후처리가 지문 등장 순으로 재매핑해 주므로 여기선 원 라벨을 쓴다.
  const decoys = q.marks.filter((m) => m.label !== q.answer);
  const keyPoints = [
    `${q.answer} ${answerMark.shown} → ${q.fix || answerMark.original}: ${POINT_NAME[answerMark.code] ?? "정동사·준동사"} 판단이 정답의 핵심입니다.`,
    decoys[0]
      ? `${decoys[0].label} ${decoys[0].original}: ${POINT_NAME[decoys[0].code] ?? "어법"} 자리로 원문 그대로가 옳습니다.`
      : `${q.answer} 나머지 밑줄은 원문 그대로의 어법 자리입니다.`,
    decoys[1]
      ? `${decoys[1].label} ${decoys[1].original}: ${POINT_NAME[decoys[1].code] ?? "어법"} 자리로 원문 그대로가 옳습니다.`
      : `${q.answer} 각 밑줄은 서로 다른 어법 포인트로 분산했습니다.`,
  ];

  return {
    ok: true,
    aiQuestion: {
      direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
      errorDesign: "md 원큐 경량 경로 — 설계 메모는 해설로 갈음합니다.",
      markedExpressions,
      correctAnswers: [q.answer],
      correctAnswer: q.answer,
      options: q.marks.map((m, i) => ({
        label: ["①", "②", "③", "④", "⑤"][i] ?? String(i + 1),
        text: m.shown,
      })),
      wrongOptionExplanations,
      explanation: q.explanation,
      keyPoints,
      tags: [],
      difficulty,
    },
  };
}
