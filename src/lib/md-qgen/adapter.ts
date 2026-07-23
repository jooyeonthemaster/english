// ============================================================================
// md-qgen 어댑터 — 마크다운 파싱 결과를 프로덕션 AI 문항 형상으로 변환한다.
// (26-07-21 심플 스택 1단계 · 26-07-23 다중 빈칸/어법 N마커·K정답 확장) 이 모듈은
// 순수 매핑만 담당한다 — 후처리·검증·셔플은 앱 레이어(md-stream 라우트)가
// postProcessQuestion 계열로 수행한다(레이어 규칙: lib 은 app/_lib 을 import
// 하지 않는다).
//
// 형상 근거(정찰 실측): AI 스키마의 wrongOptionExplanations 는 "배열"이며 저장
// 시 후처리가 Record 로 정규화한다. GRAMMAR 는 correctAnswer 가 폴백일 뿐
// markedExpressions[].isError 가 정답의 진실원이고, 라벨은 후처리가 지문 등장
// 순으로 재부여한다. surroundingText 는 마커 위치탐색 정확도에 직결된다.
// 다중 빈칸은 blanks[]{label "(A)"~"(C)"}+options[]{label "1"~"5", blankValues}
// 가 계약이며 passageWithBlank·option text 재조립·라벨 재정렬은 후처리
// (processMultiBlankInference) 소관이다 — 어댑터가 직접 만들지 않는다.
// ============================================================================

import {
  INLINE_MARK_RE,
  circledForMarkIndex,
  normalizeWs,
  type MdBlankQuestion,
  type MdGrammarQuestion,
  type MdMultiBlankQuestion,
} from "./parser";

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

/** md 라벨 표기 정규화 — 파서가 "A"/"(A)" 어느 쪽을 주든 AI 스키마 "(A)" 형으로. */
function parenLabel(label: string): string {
  return label.startsWith("(") ? label : `(${label})`;
}

// md 선지 라벨(①~⑤) → 다중 빈칸 AI 스키마 라벨("1"~"5").
// 스키마·후처리·DB 실물(options 컬럼) 전부 숫자 문자열 축이다 — 어법의 (A) 축과
// 다르므로 여기서만 변환한다. 이미 숫자형이면 그대로 통과.
const BLANK_OPTION_CIRCLED = "①②③④⑤";
function digitOptionLabel(label: string): string {
  const i = BLANK_OPTION_CIRCLED.indexOf(label);
  return i >= 0 ? String(i + 1) : label;
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
  // "빈칸 변형(정답 패러프레이즈)"·"부정-부정" 설정의 집행 지점(26-07-23):
  // PARAPHRASE=공예 재진술 정답, SOURCE_EXACT=후처리가 정답 선지를 빈칸원문
  // 축자로 강제(설정 계약의 결정론 보장), DOUBLE_NEGATIVE=부정 패러프레이즈
  // (후처리는 PARAPHRASE 와 같은 transformed 모드로 취급 — 정답 보존).
  answerMode: "PARAPHRASE" | "SOURCE_EXACT" | "DOUBLE_NEGATIVE" = "PARAPHRASE",
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
  // keyPoints 합성 금지(26-07-21 실사용 평가 반영): 합성문은 문항 고유 정보가
  // 없는 "출제자 노트" 템플릿이라 학생 학습 정보가 아니다. 빈 배열이면 검증기·
  // 렌더 모두 안전하게 생략된다.
  const keyPoints: string[] = [];
  return {
    ok: true,
    aiQuestion: {
      direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
      blankDesign: "md 원큐 경량 경로 — 설계 메모는 해설로 갈음합니다.",
      originalExpression: oe,
      // ⚠ PARAPHRASE 모드 미설정 시 후처리 SOURCE_EXACT 기본이 정답 선지를 원문
      // 축자로 덮어써 공예 정답이 파괴된다(적대 검수 실증 — 26-07-21). 반대로
      // 설정이 OFF 면 그 덮어쓰기가 곧 계약 집행이다 — answerMode 로 갈린다.
      blankAnswerMode: answerMode,
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

/**
 * 다중 빈칸(blankCount 2~3): md 파싱 결과 → buildAiMultiBlankInferenceSchema 형상.
 * 계약(정찰 실측 — multiBlank §0·§1): blanks[] 는 {label "(A)"~"(C)",
 * originalExpression(지문 축자), surroundingText(위치 식별용, 실패 시 "")},
 * options 는 {label "1"~"5", text(" …… " join), blankValues[count]} 정확히 5개,
 * correctAnswer 는 "1"~"5". passageWithBlank·option text 재조립·지문 등장순
 * 재라벨은 전부 후처리 소관이라 여기서 만들지 않는다.
 */
export function adaptMdMultiBlankToAiQuestion(
  q: MdMultiBlankQuestion,
  passage: string,
  difficulty: string,
  // 다중 빈칸은 DOUBLE_NEGATIVE 비적용(설정 리졸버가 단일 전용으로 강제) —
  // 두 모드만 받는다. PARAPHRASE 가 아니면 후처리가 정답 blankValues 를 원문
  // 축자로 자동 교정하므로 모드 전달이 곧 공예 정답 보존 계약이다.
  answerMode: "PARAPHRASE" | "SOURCE_EXACT",
): MdBlankAdaptResult {
  if (q.blanks.length < 2 || q.blanks.length > 3) {
    return { ok: false, error: `빈칸 ${q.blanks.length}개 (2~3개 필요)` };
  }
  const pn = normalizeWs(passage);
  const blanks: {
    label: string;
    originalExpression: string;
    surroundingText: string;
  }[] = [];
  for (const b of q.blanks) {
    const expr = b.expression?.trim();
    const label = parenLabel(b.label);
    if (!expr) return { ok: false, error: `빈칸원문${label} 누락` };
    const idx = passage.indexOf(expr);
    if (idx < 0 && !pn.includes(normalizeWs(expr))) {
      return { ok: false, error: `빈칸원문${label}이 지문에 축자로 없음` };
    }
    blanks.push({
      label,
      originalExpression: expr,
      // idx<0(정규화로만 존재)면 빈 문자열 — 후처리 퍼지 탐색에 맡긴다(단일
      // 빈칸 경로와 동일한 오배치 방지 결정).
      surroundingText: idx >= 0 ? contextAround(passage, idx, expr.length) : "",
    });
  }
  if (q.options.length !== 5) return { ok: false, error: `선지 ${q.options.length}개` };
  for (const o of q.options) {
    if (
      o.blankValues.length !== q.blanks.length ||
      o.blankValues.some((v) => !v.trim())
    ) {
      return {
        ok: false,
        error: `선지 ${o.label} 조합값 ${o.blankValues.length}개 (빈칸 ${q.blanks.length}개와 불일치 또는 공백)`,
      };
    }
  }
  if (!q.answer) return { ok: false, error: "정답 누락" };
  const wrong = q.wrong.filter((w) => w.label !== q.answer);
  return {
    ok: true,
    aiQuestion: {
      // 발문 계약(DB 실물 3건 동일 문자열): 라벨 나열은 blanks 순서 그대로.
      direction: `다음 글의 빈칸 ${blanks.map((b) => b.label).join(", ")}에 들어갈 말로 가장 적절한 것은?`,
      blankDesign: "md 원큐 경량 경로 — 설계 메모는 해설로 갈음합니다.",
      blanks,
      blankAnswerMode: answerMode,
      options: q.options.map((o) => ({
        label: digitOptionLabel(o.label),
        // 표시 text 는 후처리가 blankValues 로 재조립하지만, 스키마 계약
        // (" …… " join 리터럴)대로 결정론 생성해 보낸다 — md 원문 text 의
        // 구분자 드리프트를 여기서 흡수한다.
        text: o.blankValues.join(" …… "),
        blankValues: o.blankValues,
      })),
      correctAnswer: digitOptionLabel(q.answer),
      wrongOptionExplanations: wrong.map((w) => ({
        label: digitOptionLabel(w.label),
        explanation: w.text,
      })),
      explanation: q.explanation,
      // keyPoints 합성 금지 — 단일 빈칸 경로와 동일 근거(26-07-21 실사용 평가).
      keyPoints: [],
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
 * 어법(v2 지문복사, N마커 5~10·K정답 1~N): md 파싱 결과 → GRAMMAR_ERROR AI 형상
 * (markedExpressions). 위치는 밑줄지문의 인라인 마커에서 정확히 도출해
 * surroundingText 를 만든다. isError 가 정답의 진실원이므로(후처리가 이것으로
 * correctAnswer·correctAnswers·발문을 재생성) 정답 라벨 "집합"과 오형 위치를
 * 일치시켜 산출한다 — 여기가 틀리면 다운스트림 전부가 틀린다.
 */
export function adaptMdGrammarToAiQuestion(
  q: MdGrammarQuestion,
  passage: string,
  difficulty: string,
): MdGrammarAdaptResult {
  if (q.marks.length < 5 || q.marks.length > 10) {
    return { ok: false, error: `밑줄 ${q.marks.length}개 (5~10개 필요)` };
  }
  // 정답 집합(26-07-23 K정답 확장): 파서가 answers[] 를 채운다(구형 단일 표기는
  // 첫 항목=answer 로 하위호환). 빈 배열이면 구형 필드로 폴백.
  const answers =
    q.answers && q.answers.length > 0 ? q.answers : q.answer ? [q.answer] : [];
  if (answers.length === 0) return { ok: false, error: "정답 누락" };
  const answerSet = new Set(answers);
  for (const label of answerSet) {
    if (!q.marks.some((m) => m.label === label)) {
      return { ok: false, error: `정답 라벨(${label})이 밑줄에 없음` };
    }
  }

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
    const isError = answerSet.has(m.label);
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
      // 고침은 라벨별 맵(fixes) 우선, 구형 단일 fix 폴백(파서가 구형 `고침:` 을
      // 첫 정답에 귀속시키므로 5·1 경로 산출은 종전과 동일).
      ...(isError ? { correction: q.fixes?.[m.label] || q.fix || m.original } : {}),
      surroundingText,
      pointCode: POINT_NAME[m.code] ? m.code : "a",
    };
  });

  // 비정답 라벨 전부가 오답해설 대상 — K=N(전부 정답)이면 0개 허용.
  const wrong = q.wrong.filter((w) => !answerSet.has(w.label));
  const wrongOptionExplanations = wrong.map((w) => {
    const mark = q.marks.find((m) => m.label === w.label);
    return {
      label: w.label,
      expression: mark?.original ?? "",
      pointCode: mark && POINT_NAME[mark.code] ? mark.code : "a",
      explanation: w.text,
    };
  });

  // keyPoints 합성 금지(26-07-21 실사용 평가 반영): 모델의 포인트코드 오태깅
  // (예: 전치사 Despite 에 f 형부)이 합성문을 타고 학생 표면에 "형용사·부사
  // 자리"로 노출되는 사고가 실증됐다. 오답해설(모델이 직접 서술)은 정확했으므로
  // 신뢰 가능한 텍스트만 남기고 keyPoints 는 생략한다(빈 배열 = 검증기 스킵).
  const keyPoints: string[] = [];

  return {
    ok: true,
    aiQuestion: {
      // K≥2 발문은 후처리 normalizeGrammarDirection 강제 문구와 동일하게 —
      // 개수 미노출 "모두" 표기(정찰 보고 grammarMulti §3-6 계약).
      direction:
        answerSet.size >= 2
          ? "다음 글의 밑줄 친 부분 중, 어법상 틀린 것을 모두 고르시오."
          : "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
      errorDesign: "md 원큐 경량 경로 — 설계 메모는 해설로 갈음합니다.",
      markedExpressions,
      correctAnswers: answers,
      correctAnswer: answers.join(", "),
      options: q.marks.map((m, i) => ({
        // 표시 라벨은 parser 의 circledForMarkIndex(①~⑩)와 단일화 — 저장 축은
        // 어디까지나 markedExpressions 의 (A)~(J)이고 options 는 파생 뷰다.
        label: circledForMarkIndex(i),
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
