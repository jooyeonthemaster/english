// 마크다운 문항 파서 (md-lab 실험 — 26-07-21 O208 계열)
// JSON 스키마 강제 없이 고정 마크다운 형식을 결정형 정규식으로 파싱한다.
// 서버·클라이언트 공용(순수 모듈, 의존성 없음).

export interface MdOption {
  label: string;
  text: string;
}

export interface MdBlankQuestion {
  kind: "blank";
  originalExpression: string;
  options: MdOption[];
  answer: string;
  explanation: string;
  wrong: MdOption[];
}

export interface MdGrammarMark {
  label: string; // "(A)"~"(J)"
  original: string;
  shown: string;
  code: string; // a~m
  /** 위치앵커 — 이 표현 '직전'의 원문 조각. 짧은 단어(is 등)의 자리를 유일 확정한다. */
  anchor?: string;
}

export interface MdGrammarQuestion {
  kind: "grammar";
  marks: MdGrammarMark[];
  /** 지문 복사 방식(v2): 밑줄이 [[A:표현]] 로 인라인 마킹된 지문 전체. */
  markedPassage?: string;
  answer: string; // 첫 정답 "(A)"~"(J)" — 단일 정답 하위호환 축
  /** 정답 라벨 전체(정규화 "(X)" 형식, 26-07-23 스펙 v1). 단일 정답이면 [answer]. */
  answers: string[];
  fix: string; // 첫 정답의 고침 — 단일 정답 하위호환 축
  /** 라벨별 고침(신형식 `고침(X):`). 구형 단일 `고침:` 라인은 첫 정답에 귀속. */
  fixes: Record<string, string>;
  explanation: string;
  wrong: MdOption[];
}

/** 다중 빈칸(blankCount 2~3) 조합 문항 — 26-07-23 스펙 v1 신설. */
export interface MdMultiBlankQuestion {
  kind: "multiBlank";
  /** 지문 등장순 (A)(B)[(C)] — expression 은 지문 축자 원문 구. */
  blanks: { label: string; expression: string }[];
  /** ①~⑤ 조합 선지 — text 는 " …… " join 원문, blankValues 는 빈칸별 값. */
  options: { label: string; text: string; blankValues: string[] }[];
  answer: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

export type MdQuestion = MdBlankQuestion | MdGrammarQuestion;

/** 전체 유니언(다중 빈칸 포함) — 다중 빈칸을 받는 신설 소비처(md-stream 라우트·어댑터)용.
 * 스펙 v1 이탈 기록(26-07-23): 스펙은 MdQuestion 유니언에 multiBlank 추가를 지시했으나,
 * 그 경우 기존 md-lab 이분 내로우잉(exam-sheet.tsx `question.marks`, question-editor.tsx
 * GrammarEditor 전달)이 tsc 실측으로 컴파일 실패한다 — 절대 규칙(기존 경로 무회귀·md-lab
 * 무변경 컴파일)이 우선하므로 전체 유니언은 별도 타입으로 둔다. gateMdQuestion·
 * segmentPassage 는 이 타입을 받아 세 형식 모두 처리한다(파라미터 확장은 하위호환). */
export type MdAnyQuestion = MdQuestion | MdMultiBlankQuestion;

// 공백 + 유니코드 구두점 정규화 — 모델이 지문을 재출력할 때 곱슬따옴표('' "")를
// 곧은따옴표로 바꾸는 일이 흔해(재구성 대조 오탐 실측 #10), 비교 전용으로 통일한다.
export const normalizeWs = (s: unknown): string =>
  String(s ?? "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();

export function parseMdBlank(text: string): MdBlankQuestion {
  const before = text.split(/^오답:/m)[0] ?? text;
  const options = [...before.matchAll(/^([①②③④⑤])\s*(.+)$/gm)].map((m) => ({
    label: m[1],
    text: m[2].trim(),
  }));
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
  const answer = text.match(/^정답:\s*([①②③④⑤])/m)?.[1] ?? "";
  // 드리프트 관용: 모델이 오답 목록에 정답 줄("① (정답)")을 끼워 넣는 실측 —
  // 지시로 안 막혀서 파서가 걸러낸다.
  const wrong = [...wrongSection.matchAll(/^([①②③④⑤])\s*(.+)$/gm)]
    .map((m) => ({ label: m[1], text: m[2].trim() }))
    .filter((w) => w.label !== answer);
  return {
    kind: "blank",
    originalExpression: text.match(/^빈칸원문:\s*(.+)$/m)?.[1]?.trim() ?? "",
    options,
    answer,
    explanation:
      text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
      text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

/** 다중 빈칸(2~3) 파싱 — "빈칸원문(A):" 라벨식 신형 섹션(26-07-23 스펙 v1).
 * 신형/단일 판별(빈칸원문(A): 존재)은 호출자 몫 — 라우트가 blankCount 설정으로 분기. */
export function parseMdMultiBlank(text: string): MdMultiBlankQuestion {
  const before = text.split(/^오답:/m)[0] ?? text;
  const blanks = [...before.matchAll(/^빈칸원문\(([A-C])\):\s*(.+)$/gm)].map((m) => ({
    label: `(${m[1]})`,
    expression: m[2].trim(),
  }));
  const options = [...before.matchAll(/^([①②③④⑤])\s*(.+)$/gm)].map((m) => {
    const optionText = m[2].trim();
    return {
      label: m[1],
      text: optionText,
      // 값 구분자 계약 리터럴은 " …… "(공백+…+…+공백) — split 은 공백 드리프트 관용.
      blankValues: optionText
        .split(/\s*……\s*/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  });
  const answer = text.match(/^정답:\s*([①②③④⑤])/m)?.[1] ?? "";
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄이 끼는 실측 — 단일 빈칸과 동일하게 파서가 걸러낸다.
  const wrong = [...wrongSection.matchAll(/^([①②③④⑤])\s*(.+)$/gm)]
    .map((m) => ({ label: m[1], text: m[2].trim() }))
    .filter((w) => w.label !== answer);
  return {
    kind: "multiBlank",
    blanks,
    options,
    answer,
    explanation:
      text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
      text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

// 어법 인라인 마커 — adapter 와 공유(중복 정의 제거용 export, 26-07-23 스펙 v1).
// 전역 플래그이므로 matchAll 전용으로 쓸 것 — exec/test 는 lastIndex 상태를 남긴다.
export const INLINE_MARK_RE = /\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g;

// 정답·고침 라인 파싱 — 복수 정답("정답: (B), (D)")과 라벨별 고침("고침(B): ...")을
// 수용하고, 구형 단일 형식("정답: (B)" + "고침: ...")은 첫 정답 귀속으로 하위호환.
function parseGrammarAnswerFix(text: string): {
  answers: string[];
  answer: string;
  fixes: Record<string, string>;
  fix: string;
} {
  const answerLine = text.match(/^정답:\s*(.+)$/m)?.[1] ?? "";
  // 선행 라벨 런만 수집(리뷰 봉합 26-07-23): "정답: (C), (D)" 는 둘 다,
  // "정답: (C) — (D)는 옳음" 류 부가 설명 속 라벨은 무시 — 구형 앵커드 단일
  // 캡처의 보수성을 복수 정답으로 일반화한 것.
  const leadingRun =
    answerLine.match(/^\s*(\(([A-J])\)(?:\s*,\s*\([A-J]\))*)/)?.[1] ?? "";
  const answers = [
    ...new Set([...leadingRun.matchAll(/\(([A-J])\)/g)].map((m) => `(${m[1]})`)),
  ];
  const answer = answers[0] ?? "";
  const fixes: Record<string, string> = {};
  for (const m of text.matchAll(/^고침\(([A-J])\):\s*(.+)$/gm)) {
    fixes[`(${m[1]})`] = m[2].trim();
  }
  const legacyFix = text.match(/^고침:\s*(.+)$/m)?.[1]?.trim() ?? "";
  if (Object.keys(fixes).length === 0 && legacyFix && answer) {
    fixes[answer] = legacyFix;
  }
  const fix =
    (answer ? fixes[answer] : undefined) ?? Object.values(fixes)[0] ?? legacyFix;
  return { answers, answer, fixes, fix };
}

export function parseMdGrammar(text: string): MdGrammarQuestion {
  const { answers, answer, fixes, fix } = parseGrammarAnswerFix(text);
  const answerSet = new Set(answers);
  // v2(지문 복사 방식): "밑줄지문:" 섹션이 있으면 인라인 마커에서 마크를 얻는다.
  const markedSection = text.match(/^밑줄지문:\s*\n([\s\S]*?)(?=^원형·포인트:|^원형:)/m)?.[1];
  if (markedSection) {
    const markedPassage = markedSection.trim();
    const metaSection = text.match(/^원형·포인트:\s*\n([\s\S]*?)(?=^정답:)/m)?.[1] ?? "";
    // 관용 파싱: 코드에 괄호·한글 설명이 붙는 드리프트 실측("(c) 분사") 수용.
    const meta = new Map(
      [...metaSection.matchAll(
        /^\(([A-J])\)\s*(.+?)\s*\|\s*\(?\s*([a-m])\s*\)?(?:\s+[^|]*)?$/gm,
      )].map((m) => [`(${m[1]})`, { original: m[2].trim(), code: m[3] }]),
    );
    const marks = [...markedPassage.matchAll(INLINE_MARK_RE)].map((m) => {
      const label = `(${m[1]})`;
      const info = meta.get(label);
      return {
        label,
        original: info?.original ?? "",
        shown: m[2].trim(),
        code: info?.code ?? "",
      };
    });
    const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
    return {
      kind: "grammar",
      marks,
      markedPassage,
      answer,
      answers,
      fix,
      fixes,
      explanation:
        text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
        text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ??
        "",
      wrong: [...wrongSection.matchAll(/^\(([A-J])\)\s*(.+)$/gm)]
        .map((m) => ({ label: `(${m[1]})`, text: m[2].trim() }))
        // 실재 마크 라벨만 — 마커에 없는 잉여 라벨 줄은 무시(구형 [A-E] 시절의
        // 수용 동작 보존, 리뷰 회귀 봉합 26-07-23).
        .filter(
          (w) =>
            !answerSet.has(w.label) &&
            marks.some((mk) => mk.label === w.label),
        ),
    };
  }
  const before = text.split(/^오답:/m)[0] ?? text;
  const marks = [...before.matchAll(
    /^\(([A-J])\)\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([a-m])\s*(?:\|\s*(.+?)\s*)?$/gm,
  )].map((m) => ({
    label: `(${m[1]})`,
    original: m[2].trim(),
    shown: m[3].trim(),
    code: m[4],
    ...(m[5] ? { anchor: m[5].trim() } : {}),
  }));
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
  const wrong = [...wrongSection.matchAll(/^\(([A-J])\)\s*(.+)$/gm)].map((m) => ({
    label: `(${m[1]})`,
    text: m[2].trim(),
  }));
  return {
    kind: "grammar",
    marks,
    answer,
    answers,
    fix,
    fixes,
    explanation:
      text.match(/^해설:\s*([\s\S]*?)(?=^오답:)/m)?.[1]?.trim() ??
      text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

/** 0원 결정형 게이트 — 축자·형상 검사. 빈 배열이면 클린.
 * requireWrong=false 는 "정답 해설만" 모드(오답해설 요구 없음).
 * markerCount/answerCount(26-07-23 스펙 v1): 어법 비표준(밑줄 5~10·정답 1~N) 검사
 * 파라미터 — 기본값 5·1이면 기존 동작과 완전 동일(하위호환). */
export function gateMdQuestion(
  q: MdAnyQuestion,
  passage: string,
  options?: { requireWrong?: boolean; markerCount?: number; answerCount?: number },
): string[] {
  const requireWrong = options?.requireWrong !== false;
  if (q.kind === "multiBlank") {
    // 다중 빈칸은 전용 게이트로 위임 — blankCount 는 파싱된 blanks 수 기준.
    return gateMdMultiBlank(q, passage, { requireWrong });
  }
  const v: string[] = [];
  const pn = normalizeWs(passage);
  if (q.kind === "blank") {
    if (!q.originalExpression) v.push("빈칸원문 누락");
    else if (!pn.includes(normalizeWs(q.originalExpression)))
      v.push("빈칸원문이 지문에 축자로 없음");
    if (q.options.length !== 5) v.push(`선지 ${q.options.length}개 (5개 필요)`);
    if (!q.answer) v.push("정답 누락");
    if (!q.explanation) v.push("해설 누락");
    if (requireWrong && q.wrong.length !== 4)
      v.push(`오답해설 ${q.wrong.length}개 (4개 필요)`);
    if (q.answer && q.wrong.some((w) => w.label === q.answer))
      v.push("오답해설에 정답 라벨 포함");
  } else {
    const markerCount = options?.markerCount ?? 5;
    const answerCount = options?.answerCount ?? 1;
    if (q.marks.length !== markerCount)
      return [`밑줄 ${q.marks.length}개 (${markerCount}개 필요)`];
    if (q.markedPassage) {
      // v2(지문 복사 방식): 마커를 원형으로 되돌린 재구성본이 소스 지문과
      // 일치해야 한다 — 위치·축자·무단편집을 한 번에 검사(PASSAGE_TAMPERED 등가).
      for (const m of q.marks) {
        if (!m.original) v.push(`${m.label} 원형 누락(원형·포인트 섹션 불일치)`);
        if (!m.code) v.push(`${m.label} 포인트코드 누락`);
      }
      let reconstructed = q.markedPassage;
      for (const m of q.marks) {
        reconstructed = reconstructed.replace(
          new RegExp(`\\[\\[${m.label[1]}:(?:(?!\\]\\]).)+\\]\\]`),
          () => m.original,
        );
      }
      if (normalizeWs(reconstructed) !== pn) {
        v.push("지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 원형이 틀림");
      }
    } else {
      for (const m of q.marks) {
        const matches = countWordBoundaryMatches(passage, m.original);
        if (matches === 0) {
          v.push(`${m.label} 원문표현이 지문에 축자로 없음(단어 경계 기준)`);
        } else if (matches > 1) {
          if (!m.anchor?.trim())
            v.push(`${m.label} '${m.original}' 위치 모호(${matches}회 등장) — 위치앵커 필요`);
          else if (!locateMark(passage, m.original, m.anchor, 0))
            v.push(`${m.label} 위치앵커로 자리를 확정하지 못함`);
        }
      }
    }
    const changed = q.marks.filter(
      (m) => normalizeWs(m.shown) !== normalizeWs(m.original),
    );
    // 정답 집합: 기본(정답 1)은 기존 단일 answer 축 그대로 — 드리프트 시 기존 동작 보존.
    const expectedAnswers =
      answerCount === 1 ? (q.answer ? [q.answer] : []) : q.answers;
    // 정답 축 동기 게이트(리뷰 major 봉합 26-07-23): 어댑터는 q.answers 전체를
    // isError 진실원으로 소비하므로, 파싱된 정답 라벨 수가 설정과 다르면 여기서
    // 반려한다 — 게이트(단일 축)와 어댑터(집합 축)의 불일치로 오염 복수정답이
    // 저장되는 경로를 차단(어법은 1회 재생성 피드백으로 전달됨).
    if (q.answers.length !== answerCount)
      v.push(`정답 라벨 ${q.answers.length}개 (설정 ${answerCount}개)`);
    if (changed.length !== answerCount)
      v.push(`변형 밑줄 ${changed.length}개 (정답 ${answerCount}개만 변형)`);
    else {
      const changedKey = changed.map((c) => c.label).sort().join(", ");
      const answerKey = [...expectedAnswers].sort().join(", ");
      if (changedKey !== answerKey)
        v.push(`정답 라벨(${answerKey})과 변형 밑줄(${changedKey}) 불일치`);
    }
    if (answerCount === 1) {
      if (!q.fix) v.push("고침 누락");
    } else {
      for (const label of expectedAnswers)
        if (!q.fixes[label]) v.push(`고침(${label}) 누락`);
    }
    if (!q.explanation) v.push("해설 누락");
    // 오답해설 = 비정답 라벨 수(markerCount−answerCount). K=N 이면 0개(섹션 생략 허용).
    const wrongNeeded = markerCount - answerCount;
    if (requireWrong && q.wrong.length !== wrongNeeded)
      v.push(`오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요)`);
  }
  return v;
}

// 다중 빈칸 라벨 정본 — 프로덕션 MULTI_BLANK_LABELS(shared.ts)와 동일 문자열.
// (본 모듈은 의존성 없는 공용 모듈이라 상수를 로컬로 둔다.)
const MD_MULTI_BLANK_LABELS = ["(A)", "(B)", "(C)"] as const;

/** 다중 빈칸 0원 결정형 게이트(26-07-23 스펙 v1) — 축자·형상 검사. 빈 배열이면 클린.
 * SOURCE_EXACT/PARAPHRASE 의미 검증은 후처리 소관 — 여기서는 형상만 본다.
 * "서로 다른 문장" 요건은 근사 검사(위치 상이 + 구간 비중첩)로 본다. */
export function gateMdMultiBlank(
  q: MdMultiBlankQuestion,
  passage: string,
  options?: { blankCount?: number; requireWrong?: boolean },
): string[] {
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];
  const pn = normalizeWs(passage);
  const count = options?.blankCount ?? q.blanks.length;
  if (count < 2 || count > 3) v.push(`빈칸 수 ${count} (2~3만 지원)`);
  if (q.blanks.length !== count)
    v.push(`빈칸 ${q.blanks.length}개 (${count}개 필요)`);
  const expectedLabels = MD_MULTI_BLANK_LABELS.slice(0, q.blanks.length);
  const labels = q.blanks.map((b) => b.label);
  if (labels.join("") !== expectedLabels.join(""))
    v.push(
      `빈칸 라벨 순서 오류 — ${expectedLabels.join("")} 필요, 실제 ${labels.join("") || "없음"}`,
    );
  const spans: { label: string; start: number; end: number }[] = [];
  for (const b of q.blanks) {
    if (!b.expression?.trim()) {
      v.push(`${b.label} 빈칸원문 누락`);
      continue;
    }
    const en = normalizeWs(b.expression);
    const idx = pn.indexOf(en);
    if (idx < 0) {
      v.push(`${b.label} 빈칸원문이 지문에 축자로 없음`);
      continue;
    }
    spans.push({ label: b.label, start: idx, end: idx + en.length });
  }
  let overlapReported = false;
  for (let i = 0; i < spans.length && !overlapReported; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spans[i].start < spans[j].end && spans[j].start < spans[i].end) {
        v.push(
          `${spans[i].label}·${spans[j].label} 빈칸 구간이 겹침 — 서로 다른 문장에서 선택 필요`,
        );
        overlapReported = true;
        break;
      }
    }
  }
  if (q.options.length !== 5) v.push(`선지 ${q.options.length}개 (5개 필요)`);
  for (const o of q.options) {
    if (o.blankValues.length !== count || o.blankValues.some((bv) => !bv.trim()))
      v.push(
        `선지 ${o.label} 값 ${o.blankValues.length}개 — 빈칸 ${count}개와 불일치하거나 빈 값 포함`,
      );
  }
  if (!q.answer) v.push("정답 누락");
  else if (!q.options.some((o) => o.label === q.answer))
    v.push("정답 라벨이 선지에 없음");
  if (!q.explanation) v.push("해설 누락");
  if (requireWrong && q.wrong.length !== 4)
    v.push(`오답해설 ${q.wrong.length}개 (4개 필요)`);
  if (q.answer && q.wrong.some((w) => w.label === q.answer))
    v.push("오답해설에 정답 라벨 포함");
  return v;
}

// ── 마커 위치 확정 (단어 경계 + 위치앵커) ────────────────────────────────────
// 교훈(26-07-21 실사용): "is" 를 순차 indexOf 로 찾으면 art"is"ts 단어 내부에
// 마커가 박힌다. 표현 탐색은 반드시 단어 경계를 지키고, 다중 등장 표현은
// 앵커(직전 문맥)로 자리를 유일 확정해야 한다 — 프로덕션 surroundingText 등가.
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wordBoundaryRegex(expr: string): RegExp {
  const body = escapeRegExp(expr.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "g");
}

export function countWordBoundaryMatches(passage: string, expr: string): number {
  if (!expr.trim()) return 0;
  return [...passage.matchAll(wordBoundaryRegex(expr))].length;
}

/** 앵커(있으면 그 직후에서) + 단어 경계로 표현 위치를 찾는다. 실패 시 null. */
export function locateMark(
  passage: string,
  original: string,
  anchor: string | undefined,
  fromIndex: number,
): { index: number; length: number } | null {
  if (!original.trim()) return null;
  if (anchor?.trim()) {
    const anchorRe = new RegExp(
      escapeRegExp(anchor.trim()).replace(/\s+/g, "\\s+"),
      "g",
    );
    const am = anchorRe.exec(passage);
    if (am) {
      const re = wordBoundaryRegex(original);
      re.lastIndex = am.index + am[0].length;
      const m = re.exec(passage);
      // 앵커 직후 80자 안에서만 인정 — 엉뚱한 원거리 매칭 방지.
      if (m && m.index - (am.index + am[0].length) <= 80) {
        return { index: m.index, length: m[0].length };
      }
    }
  }
  const re = wordBoundaryRegex(original);
  re.lastIndex = Math.max(0, fromIndex);
  let m = re.exec(passage);
  if (!m && fromIndex > 0) {
    re.lastIndex = 0;
    m = re.exec(passage);
  }
  return m ? { index: m.index, length: m[0].length } : null;
}

// ── 0원 자동 보정 (LLM 콜 없음) ──────────────────────────────────────────────
// 모델이 밑줄 표현을 지문과 미세하게 다르게 적는 최다 사례: 사이 단어 누락
// ("to justify" vs 원문 "to perhaps justify"). 앵커로 자리를 아는 상태에서, 그
// 근처의 실제 원문 구간으로 표현을 스냅한다. 재생성 콜 없이 코드로 복구.
export function snapSpanNearAnchor(
  passage: string,
  m: MdGrammarMark,
): { original: string; shown: string } | null {
  if (!m.anchor?.trim()) return null;
  const anchorRe = new RegExp(
    escapeRegExp(m.anchor.trim()).replace(/\s+/g, "\\s+"),
  );
  const am = anchorRe.exec(passage);
  if (!am) return null;
  const winStart = am.index + am[0].length;
  const window = passage.slice(winStart, winStart + 140);
  const words = m.original.trim().split(/\s+/);
  if (words.length < 2) return null; // 단일 단어 실패는 형태 문제 — 보정 불가
  const firstRe = new RegExp(
    `(?<![A-Za-z])${escapeRegExp(words[0])}(?![A-Za-z])`,
  );
  const fm = firstRe.exec(window);
  if (!fm) return null;
  const rest = window.slice(fm.index);
  const lastRe = new RegExp(
    `(?<![A-Za-z])${escapeRegExp(words[words.length - 1])}(?![A-Za-z])`,
  );
  const lm = lastRe.exec(rest);
  if (!lm) return null;
  const span = rest.slice(0, lm.index + lm[0].length);
  // 폭주 방지: 스냅 구간이 원래 표현보다 3단어 이상 길면 포기.
  if (span.trim().split(/\s+/).length > words.length + 3) return null;
  // 원래 단어들이 스냅 구간에 순서대로 전부 있어야 한다.
  let cursor = 0;
  for (const w of words) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(w)}(?![A-Za-z])`, "g");
    re.lastIndex = cursor;
    const mm = re.exec(span);
    if (!mm) return null;
    cursor = mm.index + mm[0].length;
  }
  // 미끼(표시형=원문)면 그대로 스냅. 정답이면 오형 단어만 치환해 재구성.
  if (normalizeWs(m.shown) === normalizeWs(m.original)) {
    return { original: span, shown: span };
  }
  const shownWords = m.shown.trim().split(/\s+/);
  if (shownWords.length !== words.length) return null;
  let newShown = span;
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== shownWords[i]) {
      const re = new RegExp(
        `(?<![A-Za-z])${escapeRegExp(words[i])}(?![A-Za-z])`,
      );
      if (!re.test(newShown)) return null;
      newShown = newShown.replace(re, shownWords[i]);
    }
  }
  return { original: span, shown: newShown };
}

/** 어법 마커 자동 보정 — 축자 실패 마커를 앵커 근처 실제 원문 구간으로 스냅. */
export function autoSnapGrammarMarks(
  q: MdGrammarQuestion,
  passage: string,
): { question: MdGrammarQuestion; corrections: string[] } {
  // v2(지문 복사 방식): 위치 스냅은 불필요. 대신 결정형 교정 하나 —
  // 미끼(정답 집합에 없는 밑줄)는 정의상 표시형=원형이므로, 모델이 원형을 다르게
  // 적었으면(실측: 마커 "had" 에 원형 "had labeled") 표시형으로 맞춘다.
  // 미끼 판정은 정답 "집합" 기준(26-07-23 스펙 v1 — 복수 정답 대응).
  if (q.markedPassage) {
    const answerSet = new Set(
      q.answers.length > 0 ? q.answers : q.answer ? [q.answer] : [],
    );
    const corrections: string[] = [];
    const marks = q.marks.map((m) => {
      if (!answerSet.has(m.label) && m.original && normalizeWs(m.original) !== normalizeWs(m.shown)) {
        corrections.push(`${m.label} 미끼 원형 교정: '${m.original}' → '${m.shown}'`);
        return { ...m, original: m.shown };
      }
      return m;
    });
    return {
      question: corrections.length > 0 ? { ...q, marks } : q,
      corrections,
    };
  }
  const corrections: string[] = [];
  const marks = q.marks.map((m) => {
    if (!m.original.trim()) return m;
    if (locateMark(passage, m.original, m.anchor, 0)) return m;
    const snapped = snapSpanNearAnchor(passage, m);
    if (!snapped) return m;
    corrections.push(
      `${m.label} 자동 보정: '${m.original}' → '${snapped.original}'`,
    );
    return { ...m, original: snapped.original, shown: snapped.shown };
  });
  return {
    question: corrections.length > 0 ? { ...q, marks } : q,
    corrections,
  };
}

/**
 * 빈칸원문 자동 보정 — 어법 autoSnapGrammarMarks 의 빈칸 대칭(26-07-22 신설).
 * 실사용 반려 주계통이 "빈칸원문이 지문에 축자로 없음"(모델이 표적 구간을
 * 한두 단어 어긋나게 인용)인데 빈칸에는 스냅이 없어 그대로 실패하던 비대칭을
 * 메운다. 오스냅이 정답 자리를 옮기면 반려보다 나쁘므로 보수 가드 3중:
 * 머리·꼬리 2단어 축자 일치 + 후보 구간 유일 + 토큰 자카드 ≥ 0.66.
 */
export function autoSnapBlankExpression(
  q: MdBlankQuestion,
  passage: string,
): { question: MdBlankQuestion; corrections: string[] } {
  const none = { question: q, corrections: [] as string[] };
  const oe = q.originalExpression?.trim();
  if (!oe) return none;
  const snapped = snapExpressionSpan(passage, oe);
  if (!snapped) return none;
  return {
    question: { ...q, originalExpression: snapped },
    corrections: [
      `빈칸원문 자동 스냅: '${oe.slice(0, 80)}' → 지문 축자 '${snapped.slice(0, 80)}'`,
    ],
  };
}

// 빈칸 스냅 코어 — autoSnapBlankExpression 의 가드 로직 원본을 함수로 추출(동작 동일).
// 반환 null = 스냅 불가(축자 성립·짧은 구·비유일·자카드 미달) — 반려에 맡긴다.
export function snapExpressionSpan(passage: string, oe: string): string | null {
  if (passage.includes(oe)) return null;
  // 정규화 일치는 게이트·어댑터가 이미 수용하므로 스냅 불요.
  if (normalizeWs(passage).includes(normalizeWs(oe))) return null;
  const words = oe.split(/\s+/).filter(Boolean);
  if (words.length < 4) return null; // 짧은 구는 오스냅 위험 — 반려에 맡긴다.
  const head = words.slice(0, 2).join(" ");
  const tail = words.slice(-2).join(" ");
  const maxSpanWords = Math.ceil(words.length * 1.25) + 2;
  const minSpanWords = Math.max(4, Math.floor(words.length * 0.75));
  const candidates: string[] = [];
  let from = passage.indexOf(head);
  while (from !== -1) {
    let tIdx = passage.indexOf(tail, from + head.length);
    while (tIdx !== -1) {
      const span = passage.slice(from, tIdx + tail.length);
      const spanWords = span.split(/\s+/).filter(Boolean).length;
      if (spanWords > maxSpanWords) break; // 창 초과 — 더 먼 꼬리는 무의미.
      if (spanWords >= minSpanWords) candidates.push(span);
      tIdx = passage.indexOf(tail, tIdx + 1);
    }
    from = passage.indexOf(head, from + 1);
  }
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) return null; // 유일 구간이 아니면 스냅하지 않는다.
  const snapped = unique[0];
  const a = new Set(words.map((w) => w.toLowerCase()));
  const spanTokens = snapped.split(/\s+/).filter(Boolean);
  const b = new Set(spanTokens.map((w) => w.toLowerCase()));
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  const jaccard = inter / (a.size + b.size - inter);
  if (jaccard < 0.66) return null;
  return snapped;
}

/** 다중 빈칸원문 자동 보정(26-07-23 스펙 v1) — autoSnapBlankExpression 의 가드
 * (머리·꼬리 축자 + 유일 구간 + 자카드 ≥ 0.66)를 빈칸별로 독립 반복 적용한다. */
export function autoSnapMultiBlankExpressions(
  q: MdMultiBlankQuestion,
  passage: string,
): { question: MdMultiBlankQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const blanks = q.blanks.map((b) => {
    const oe = b.expression?.trim();
    if (!oe) return b;
    const snapped = snapExpressionSpan(passage, oe);
    if (!snapped) return b;
    corrections.push(
      `빈칸원문${b.label} 자동 스냅: '${oe.slice(0, 80)}' → 지문 축자 '${snapped.slice(0, 80)}'`,
    );
    return { ...b, expression: snapped };
  });
  return {
    question: corrections.length > 0 ? { ...q, blanks } : q,
    corrections,
  };
}

// ①~⑩ — 어법 마커 최대 10개 확장(26-07-23 스펙 v1, 후처리 GRAMMAR_CIRCLED_NUMBERS 정합).
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const;

/** 어법 라벨 (A)~(J) → 시험지 표기 ①~⑩ */
export function circledForMarkIndex(index: number): string {
  return CIRCLED[index] ?? `(${index + 1})`;
}

export interface PassageSegment {
  type: "text" | "blank" | "mark";
  text: string;
  label?: string; // mark 일 때 ①~⑩ · 다중 빈칸 blank 일 때 (A)~(C)
}

/**
 * 시험지 렌더용 지문 분해 — 빈칸: originalExpression 첫 등장을 빈칸으로.
 * 다중 빈칸: blanks 를 지문 등장순으로 찾아 라벨 (A)~(C) 붙인 빈칸으로.
 * 어법: 각 밑줄의 원문표현을 등장 순서대로 찾아 표시형(shown)으로 치환 + 라벨.
 * 축자 매칭 실패 시 found=false 로 알린다(게이트가 이미 잡는 케이스).
 */
export function segmentPassage(
  passage: string,
  q: MdAnyQuestion,
): { segments: PassageSegment[]; unmatched: string[] } {
  const unmatched: string[] = [];
  if (q.kind === "multiBlank") {
    // blanks 는 (A)(B)(C) 지문 등장순 계약 — 커서 전진 탐색으로 순서를 보장한다.
    const segments: PassageSegment[] = [];
    let cursor = 0;
    for (const b of q.blanks) {
      const idx = b.expression ? passage.indexOf(b.expression, cursor) : -1;
      if (idx < 0) {
        unmatched.push(`${b.label} ${b.expression}`);
        continue;
      }
      segments.push({ type: "text", text: passage.slice(cursor, idx) });
      segments.push({ type: "blank", text: b.expression, label: b.label });
      cursor = idx + b.expression.length;
    }
    segments.push({ type: "text", text: passage.slice(cursor) });
    return { segments, unmatched };
  }
  if (q.kind === "blank") {
    const idx = q.originalExpression ? passage.indexOf(q.originalExpression) : -1;
    if (idx < 0) {
      if (q.originalExpression) unmatched.push(q.originalExpression);
      return { segments: [{ type: "text", text: passage }], unmatched };
    }
    return {
      segments: [
        { type: "text", text: passage.slice(0, idx) },
        { type: "blank", text: q.originalExpression },
        { type: "text", text: passage.slice(idx + q.originalExpression.length) },
      ],
      unmatched,
    };
  }
  const segments: PassageSegment[] = [];
  // v2(지문 복사 방식): 마커 위치가 밑줄지문 안에 이미 확정돼 있다 — 그대로 분해.
  // 표시형은 편집 반영을 위해 현재 marks 값에서 라벨로 읽는다.
  if (q.markedPassage) {
    const markByLabel = new Map(q.marks.map((m) => [m.label, m]));
    let cursor = 0;
    for (const m of [...q.markedPassage.matchAll(INLINE_MARK_RE)]) {
      const label = `(${m[1]})`;
      const idx = q.marks.findIndex((x) => x.label === label);
      segments.push({ type: "text", text: q.markedPassage.slice(cursor, m.index) });
      segments.push({
        type: "mark",
        text: markByLabel.get(label)?.shown ?? m[2],
        label: circledForMarkIndex(idx >= 0 ? idx : 0),
      });
      cursor = (m.index ?? 0) + m[0].length;
    }
    segments.push({ type: "text", text: q.markedPassage.slice(cursor) });
    return { segments, unmatched };
  }
  let cursor = 0;
  q.marks.forEach((m, i) => {
    const found = locateMark(passage, m.original, m.anchor, cursor);
    if (!found) {
      unmatched.push(`${m.label} ${m.original}`);
      return;
    }
    if (found.index >= cursor) {
      segments.push({ type: "text", text: passage.slice(cursor, found.index) });
      segments.push({ type: "mark", text: m.shown, label: circledForMarkIndex(i) });
      cursor = found.index + found.length;
    } else {
      // 앵커가 앞쪽 위치를 가리키는 역순 케이스 — 렌더 순서가 깨지므로 미배치로 보고.
      unmatched.push(`${m.label} ${m.original} (순서 역행)`);
    }
  });
  segments.push({ type: "text", text: passage.slice(cursor) });
  return { segments, unmatched };
}
