// ============================================================================
// AI 문제 수정 — 베이스라인 직렬화 (서버 전용, 정답 포함 가능)
// ============================================================================
// 모델이 "현재 문제"를 정확히 보고 지시한 부분만 고쳐야 하므로, 구조화 필드를
// 한국어 라벨로 빠짐없이 펼쳐 보여 준다. 이 블록은 프롬프트(서버→모델)로만 가며
// 학생에게 직렬화되지 않는다 → 정답/모범답안 포함 OK. (학생 노출 직렬화는
// buildGeneratedQuestionText 의 SW-LEAK-1 가 별도로 가린다.)
// ============================================================================

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fmtScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/** 알려진 필드 → 한국어 라벨 + 표시 순서(앞일수록 먼저). */
const FIELD_LABELS: Array<{ key: string; label: string }> = [
  { key: "direction", label: "발문" },
  { key: "givenSentence", label: "주어진 문장" },
  { key: "referenceSentence", label: "영작할 우리말" },
  { key: "originalSentence", label: "원문 문장" },
  { key: "passageWithBlank", label: "빈칸 지문" },
  { key: "passageWithMarkers", label: "표시 지문" },
  { key: "passageWithUnderline", label: "밑줄 지문" },
  { key: "passageWithNumbers", label: "번호 지문" },
  { key: "summaryWithBlanks", label: "요약문(빈칸)" },
  { key: "sentenceWithBlank", label: "빈칸 문장" },
  { key: "koreanGloss", label: "요약 우리말 해석" },
  { key: "contextSentence", label: "문맥 문장" },
  { key: "underlinedWord", label: "밑줄 단어" },
  { key: "underlinedPronoun", label: "밑줄 대명사" },
  { key: "underlinedExpression", label: "밑줄 표현" },
  { key: "targetWord", label: "대상 단어" },
  { key: "originalExpression", label: "원문 표현(빈칸 정답 근거)" },
  { key: "surfaceMeaning", label: "표면 의미" },
  { key: "impliedMeaning", label: "함축 의미" },
];

function fmtParagraphs(arr: unknown[]): string {
  return arr
    .map((p) => {
      if (!isRec(p)) return fmtScalar(p);
      return `${fmtScalar(p.label)} ${fmtScalar(p.text)}`.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function fmtConditions(arr: unknown[]): string {
  return arr.map((c, i) => `${i + 1}. ${fmtScalar(c)}`).join("\n");
}

function fmtOptions(arr: unknown[]): string {
  return arr
    .map((o, i) => {
      if (!isRec(o)) return `(${i + 1}) ${fmtScalar(o)}`;
      const label = fmtScalar(o.label) || String(i + 1);
      // 요약형 객관식 등 멀티-블랭크 보기: blankA/blankB...
      const blankParts = ["blankA", "blankB", "blankC", "blankD"]
        .map((k) => o[k])
        .filter((v) => typeof v === "string" && v) as string[];
      if (blankParts.length) return `(${label}) ${blankParts.join(" / ")}`;
      const text = fmtScalar(o.text);
      return `(${label}) ${text}`.trim();
    })
    .join("\n");
}

function fmtMarkedExpressions(arr: unknown[]): string {
  return arr
    .map((m) => {
      if (!isRec(m)) return fmtScalar(m);
      const label = fmtScalar(m.label);
      const expr = fmtScalar(m.expression ?? m.word ?? m.errorExpression);
      const point = fmtScalar(m.pointCode);
      const isError = m.isError === true ? " [오류]" : m.isError === false ? " [정상]" : "";
      const correction = m.correction ? ` → ${fmtScalar(m.correction)}` : "";
      const point2 = point ? ` (pointCode ${point})` : "";
      // 어휘/반의어 마커의 정답 신호 필드(어떤 단어가 부적절/오답쌍인지)도 함께 노출 —
      // 그래야 모델이 "쌍은 유지하고 한 쌍만 틀리게" 같은 표적 수정을 할 수 있다.
      const extras: string[] = [];
      if (typeof m.antonym === "string" && m.antonym) extras.push(`반의어 ${m.antonym}`);
      if (m.isIncorrectPair === true) extras.push("[오답쌍]");
      if (typeof m.correctAntonym === "string" && m.correctAntonym) extras.push(`올바른반의어 ${m.correctAntonym}`);
      if (typeof m.originalWord === "string" && m.originalWord) extras.push(`원문단어 ${m.originalWord}`);
      if (typeof m.substituteWord === "string" && m.substituteWord) extras.push(`치환 ${m.substituteWord}`);
      if (m.isInappropriate === true) extras.push("[부적절]");
      if (typeof m.betterWord === "string" && m.betterWord) extras.push(`적절단어 ${m.betterWord}`);
      const extra = extras.length ? ` {${extras.join(", ")}}` : "";
      return `${label} ${expr}${isError}${correction}${point2}${extra}`.trim();
    })
    .join("\n");
}

/** GRAMMAR_CHOICE_COMBO 슬롯 — (A) [정답표현 / 오답표현] (pointCode). */
function fmtSlots(arr: unknown[]): string {
  return arr
    .map((s) => {
      if (!isRec(s)) return fmtScalar(s);
      const label = fmtScalar(s.label);
      const correct = fmtScalar(s.correctExpression);
      const wrong = fmtScalar(s.wrongExpression);
      const point = s.pointCode ? ` (pointCode ${fmtScalar(s.pointCode)})` : "";
      return `${label} [정답: ${correct} / 오답: ${wrong}]${point}`.trim();
    })
    .join("\n");
}

/** GRAMMAR_CORRECTION 밑줄 구간 — 원문/표시문/오류·정정 내용을 모두 노출. */
function fmtSegments(arr: unknown[]): string {
  return arr
    .map((s) => {
      if (!isRec(s)) return fmtScalar(s);
      const label = s.label ? `${fmtScalar(s.label)} ` : "";
      const source = fmtScalar(s.sourceText);
      const displayed = fmtScalar(s.displayedText);
      const isError = s.isError === true ? "[오류]" : s.isError === false ? "[정상]" : "";
      const err = fmtScalar(s.errorPart);
      const corrected = fmtScalar(s.correctedPart);
      const parts: string[] = [];
      if (source) parts.push(`원문 "${source}"`);
      if (displayed && displayed !== source) parts.push(`표시 "${displayed}"`);
      if (err || corrected) parts.push(`정정 ${err} → ${corrected}`);
      return `${label}${isError} ${parts.join(" | ")}`.trim();
    })
    .join("\n");
}

function fmtBlanks(arr: unknown[]): string {
  return arr
    .map((b) => {
      if (!isRec(b)) return fmtScalar(b);
      const label = fmtScalar(b.label);
      const answer = fmtScalar(b.answer);
      const variants = Array.isArray(b.acceptableVariants) && b.acceptableVariants.length
        ? ` (허용변형: ${b.acceptableVariants.map(fmtScalar).join(", ")})`
        : "";
      return `${label}: ${answer}${variants}`.trim();
    })
    .join("\n");
}

function fmtWrongOptionExplanations(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((it) => {
        if (!isRec(it)) return fmtScalar(it);
        return `${fmtScalar(it.label)}: ${fmtScalar(it.explanation)}`.trim();
      })
      .join("\n");
  }
  if (isRec(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${fmtScalar(v)}`)
      .join("\n");
  }
  return "";
}

/** 위에서 개별 처리하지 않는, 직렬화 시 무시할 내부/제어 필드. */
const SKIP_KEYS = new Set([
  "_typeId",
  "_typeLabel",
  "_generationPlan",
  "_qualityMode",
  "_qualityWarnings",
  "_sourcePassageContent",
  "questionText",
  "tags",
]);

/**
 * 구조화 문제 객체 → 모델용 "현재 문제" 텍스트 블록.
 */
export function serializeBaselineForEdit(baseline: Rec): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string) => {
    if (value && value.trim()) lines.push(`- ${label}: ${value.trim()}`);
  };
  const pushBlock = (label: string, value: string) => {
    if (value && value.trim()) lines.push(`- ${label}:\n${value.trim()}`);
  };

  for (const { key, label } of FIELD_LABELS) {
    if (key in baseline) {
      seen.add(key);
      const v = baseline[key];
      if (typeof v === "string" && v.trim()) {
        if (v.includes("\n") || v.length > 60) pushBlock(label, v);
        else push(label, v);
      }
    }
  }

  // 배열/구조 필드 — 전용 포맷터.
  if (Array.isArray(baseline.paragraphs)) {
    seen.add("paragraphs");
    pushBlock("단락", fmtParagraphs(baseline.paragraphs));
  }
  if (Array.isArray(baseline.conditions)) {
    seen.add("conditions");
    pushBlock("조건", fmtConditions(baseline.conditions));
  }
  if (Array.isArray(baseline.scrambledWords)) {
    seen.add("scrambledWords");
    push("배열 단어", baseline.scrambledWords.map(fmtScalar).join(" / "));
  }
  if (Array.isArray(baseline.markedExpressions)) {
    seen.add("markedExpressions");
    pushBlock("표시 표현", fmtMarkedExpressions(baseline.markedExpressions));
  }
  if (Array.isArray(baseline.markedWords)) {
    seen.add("markedWords");
    pushBlock("표시 단어", fmtMarkedExpressions(baseline.markedWords));
  }
  if (Array.isArray(baseline.slots)) {
    seen.add("slots");
    pushBlock("선택 슬롯", fmtSlots(baseline.slots));
  }
  if (Array.isArray(baseline.underlinedSegments)) {
    seen.add("underlinedSegments");
    pushBlock("밑줄 구간", fmtSegments(baseline.underlinedSegments));
  }
  if (Array.isArray(baseline.blanks)) {
    seen.add("blanks");
    pushBlock("빈칸 정답", fmtBlanks(baseline.blanks));
  }
  if (Array.isArray(baseline.options)) {
    seen.add("options");
    pushBlock("선택지", fmtOptions(baseline.options));
  }

  // 정답 — 가장 중요. correctAnswer / correctAnswers / modelAnswer.
  seen.add("correctAnswer");
  seen.add("correctAnswers");
  seen.add("modelAnswer");
  if (Array.isArray(baseline.correctAnswers) && baseline.correctAnswers.length) {
    push("정답", baseline.correctAnswers.map(fmtScalar).join(", "));
  } else if (typeof baseline.correctAnswer === "string" && baseline.correctAnswer.trim()) {
    push("정답", baseline.correctAnswer);
  }
  if (typeof baseline.modelAnswer === "string" && baseline.modelAnswer.trim()) {
    pushBlock("모범답안", baseline.modelAnswer);
  }

  // 해설 계열.
  seen.add("explanation");
  seen.add("keyPoints");
  seen.add("wrongOptionExplanations");
  if (typeof baseline.explanation === "string") pushBlock("해설", baseline.explanation);
  if (Array.isArray(baseline.keyPoints) && baseline.keyPoints.length) {
    pushBlock("핵심 포인트", baseline.keyPoints.map((k, i) => `${i + 1}. ${fmtScalar(k)}`).join("\n"));
  }
  const woe = fmtWrongOptionExplanations(baseline.wrongOptionExplanations);
  if (woe) pushBlock("오답 해설", woe);

  // 나머지 스칼라 필드(미처리) — 누락 방지용 안전망.
  for (const [key, value] of Object.entries(baseline)) {
    if (seen.has(key) || SKIP_KEYS.has(key)) continue;
    if (typeof value === "string" && value.trim()) {
      push(key, value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      push(key, fmtScalar(value));
    }
  }

  return lines.join("\n");
}
