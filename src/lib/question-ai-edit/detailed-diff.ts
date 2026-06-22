// ============================================================================
// AI 문제 수정 — 상세 변경 내역 (필드/항목별 before→after)
// ============================================================================
// 결정론적으로 "AI가 무엇을 어떻게 바꿨는지"를 자료추출 복원 검수처럼 카드로 보여 줄 수
// 있게, 구조화 필드를 필드/항목 단위로 비교해 DiffEntry[] 를 만든다. 정답 마스킹은
// 무관(여기 텍스트는 교사 검토용 패널에만 쓰임, 학생 직렬화 아님).
// ============================================================================

import { getCircledNumber } from "@/lib/question-postprocess/types";

export type DiffKind = "added" | "removed" | "changed" | "reordered";

export interface DiffEntry {
  /** 안정 키(렌더 key). */
  id: string;
  /** 그룹명: 발문/선택지/정답/해설/밑줄 표현/빈칸 … */
  category: string;
  /** 항목 식별자: ① / (A) / 1번 … (스칼라 필드는 생략). */
  ref?: string;
  kind: DiffKind;
  before?: string;
  after?: string;
  /** 부가 설명(예: "정답 표시 변경", "pointCode a→d"). */
  note?: string;
  /** 렌더러 SelectableBlock 의 blockId 와 일치 — 수정본 미리보기에 변경 마크를 입힌다.
   *  미리보기에서 마크되지 않는 항목(분석 테이블 등)은 생략. */
  blockId?: string;
}

// ── 필드/항목 → 렌더러 blockId 매핑(프리미티브 SelectableBlock 의 blockId 와 일치) ──
function scalarBlockId(field: string, subType: string): string | undefined {
  switch (field) {
    case "direction":
      return "direction";
    case "summaryWithBlanks":
      return "passage:요약문";
    case "koreanGloss":
      return "passage:해석";
    case "sentenceWithBlank":
    case "passageWithBlank":
    case "passageWithMarkers":
    case "passageWithUnderline":
    case "passageWithNumbers":
    case "contextSentence":
    case "targetWord":
      return "passage";
    case "underlinedWord":
      return "underlinedWord";
    case "underlinedPronoun":
      return "underlinedPronoun";
    case "givenSentence":
      return subType === "SENTENCE_INSERT" ? "given:삽입할 문장" : "givenSentence";
    case "referenceSentence":
      return "given:영작할 우리말";
    case "originalSentence":
      return "given:원래 문장";
    case "modelAnswer":
    case "answer":
      // FILL_BLANK_KEY 의 정답 표현(answer)은 ModelAnswer("정답") 블럭으로 렌더된다.
      return "modelAnswer";
    case "explanation":
      return "explanation";
    default:
      // underlinedExpression(IMPLIED_MEANING 의 함축 근거)·impliedMeaning·surfaceMeaning·
      // difficulty 등은 별도 블럭으로 렌더되지 않으므로 미마크.
      return undefined;
  }
}

// 배열 전체가 한 블럭으로 렌더되는 필드(개별 항목 마크 아님).
const WHOLE_BLOCK_ARRAY: Record<string, string> = {
  conditions: "conditions",
  keyPoints: "keyPoints",
  scrambledWords: "scrambled",
};

function arrayItemBlockId(field: string, itemKey: string): string | undefined {
  if (WHOLE_BLOCK_ARRAY[field]) return WHOLE_BLOCK_ARRAY[field];
  if (field === "options") return `option:${itemKey}`;
  if (field === "paragraphs") return `paragraph:${itemKey}`;
  // markedExpressions/markedWords/slots/underlinedSegments/blanks 는 미리보기 마크 대상 아님.
  return undefined;
}

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function s(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v).trim();
}

/** 옵션 라벨("1"~"10")은 동그라미 숫자로, 영문 라벨은 (A) 형태로.
 *  getCircledNumber 는 0-인덱스(getCircledNumber(0)="①")이므로 1-기반 라벨에서 1을 뺀다. */
function refOf(label: unknown): string {
  const t = s(label);
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return (n >= 1 ? getCircledNumber(n - 1) : "") || `${t}번`;
  }
  if (t) return /^[A-Za-z]$/.test(t) ? `(${t})` : t;
  return "";
}

// ── 항목(배열 원소) → 사람이 읽는 텍스트 ───────────────────────────────────
function optionText(item: unknown): string {
  if (!isRec(item)) return s(item);
  const blankParts = ["blankA", "blankB", "blankC", "blankD"]
    .map((k) => item[k])
    .filter((v) => typeof v === "string" && v) as string[];
  if (blankParts.length) return blankParts.join(" / ");
  return s(item.text);
}

function markedText(item: unknown): string {
  if (!isRec(item)) return s(item);
  const word = s(item.expression ?? item.word ?? item.errorExpression);
  const bits: string[] = [word];
  if (item.isError === true) bits.push("[오류]");
  if (item.correction) bits.push(`→ ${s(item.correction)}`);
  if (item.pointCode) bits.push(`(${s(item.pointCode)})`);
  if (typeof item.antonym === "string" && item.antonym) bits.push(`↔ ${s(item.antonym)}`);
  if (item.isIncorrectPair === true) bits.push("[오답쌍]");
  if (item.isInappropriate === true) bits.push("[부적절]");
  if (typeof item.substituteWord === "string" && item.substituteWord) bits.push(`치환 ${s(item.substituteWord)}`);
  return bits.filter(Boolean).join(" ");
}

function slotText(item: unknown): string {
  if (!isRec(item)) return s(item);
  const point = item.pointCode ? ` (${s(item.pointCode)})` : "";
  return `정답 ${s(item.correctExpression)} / 오답 ${s(item.wrongExpression)}${point}`;
}

function segmentText(item: unknown): string {
  if (!isRec(item)) return s(item);
  const src = s(item.sourceText);
  const err = s(item.errorPart);
  const cor = s(item.correctedPart);
  const flag = item.isError === true ? "[오류] " : "";
  return `${flag}${src ? `"${src}" ` : ""}${err || cor ? `(${err} → ${cor})` : ""}`.trim();
}

function blankText(item: unknown): string {
  if (!isRec(item)) return s(item);
  return s(item.answer);
}

// 배열 필드 → (라벨/인덱스 → 텍스트) 맵.
function indexArray(
  field: string,
  arr: unknown[],
): Array<{ key: string; ref: string; text: string }> {
  return arr.map((item, i) => {
    const label = isRec(item) ? item.label : undefined;
    const hasLabel = label !== undefined && label !== null && s(label) !== "";
    const key = hasLabel ? s(label) : `#${i + 1}`;
    const ref = hasLabel ? refOf(label) : `${i + 1}`;
    let text: string;
    switch (field) {
      case "options": text = optionText(item); break;
      case "markedExpressions":
      case "markedWords": text = markedText(item); break;
      case "slots": text = slotText(item); break;
      case "underlinedSegments": text = segmentText(item); break;
      case "blanks": text = blankText(item); break;
      case "paragraphs": text = isRec(item) ? s(item.text) : s(item); break;
      default: text = isRec(item) ? s(item.text ?? item) : s(item); break;
    }
    return { key, ref, text };
  });
}

// ── 필드 정의 ──────────────────────────────────────────────────────────────
const SCALAR_FIELDS: Array<{ key: string; category: string }> = [
  { key: "direction", category: "발문" },
  { key: "summaryWithBlanks", category: "요약문" },
  { key: "koreanGloss", category: "요약 해석" },
  { key: "sentenceWithBlank", category: "빈칸 문장" },
  { key: "givenSentence", category: "주어진 문장" },
  { key: "referenceSentence", category: "영작 우리말" },
  { key: "originalSentence", category: "원문 문장" },
  { key: "passageWithBlank", category: "지문(빈칸)" },
  { key: "passageWithMarkers", category: "지문(표시)" },
  { key: "passageWithUnderline", category: "지문(밑줄)" },
  { key: "passageWithNumbers", category: "지문(번호)" },
  { key: "targetWord", category: "대상 단어" },
  { key: "underlinedWord", category: "밑줄 단어" },
  { key: "underlinedPronoun", category: "밑줄 대명사" },
  { key: "underlinedExpression", category: "밑줄 표현" },
  { key: "contextSentence", category: "문맥 문장" },
  { key: "originalExpression", category: "빈칸 정답 근거" },
  { key: "impliedMeaning", category: "함축 의미" },
  { key: "surfaceMeaning", category: "표면 의미" },
  { key: "modelAnswer", category: "모범답안" },
  { key: "answer", category: "정답" },
  { key: "explanation", category: "해설" },
  { key: "difficulty", category: "난이도" },
  // 모드/극성 신호 — 다른 필드 변화 없이 이것만 바뀌는 NOOP-유사 변경도 diff 에 잡아
  // editSummary "변경 없음" 오기재(M4)를 막는다. 전용 렌더 블럭은 없어 수정내역 패널에만 표시.
  { key: "blankAnswerMode", category: "정답 모드" },
  { key: "vocabDisplayMode", category: "어휘 표시 모드" },
  { key: "clueMode", category: "단서 모드" },
  { key: "matchType", category: "일치 유형" },
  { key: "answerPolarity", category: "정답 극성" },
];

const ARRAY_FIELDS: Array<{ key: string; category: string }> = [
  { key: "options", category: "선택지" },
  { key: "markedExpressions", category: "밑줄 표현" },
  { key: "markedWords", category: "표시 단어" },
  { key: "slots", category: "선택 슬롯" },
  { key: "underlinedSegments", category: "밑줄 구간" },
  { key: "blanks", category: "빈칸 정답" },
  { key: "paragraphs", category: "단락" },
  { key: "conditions", category: "조건" },
  { key: "keyPoints", category: "핵심 포인트" },
  { key: "scrambledWords", category: "배열 단어" },
];

function answerText(q: Rec): string {
  if (Array.isArray(q.correctAnswers) && q.correctAnswers.length) {
    return q.correctAnswers.map((v) => s(refOf(v))).join(", ");
  }
  if (typeof q.correctAnswer === "string" && q.correctAnswer.trim()) {
    // 라벨 하나면 동그라미로, 아니면 텍스트 그대로.
    return /^\d+$/.test(q.correctAnswer.trim()) ? refOf(q.correctAnswer) : q.correctAnswer.trim();
  }
  return "";
}

function wrongExpl(q: Rec): Record<string, string> {
  const v = q.wrongOptionExplanations;
  const out: Record<string, string> = {};
  if (Array.isArray(v)) {
    for (const it of v) if (isRec(it)) out[s(it.label)] = s(it.explanation);
  } else if (isRec(v)) {
    for (const [k, val] of Object.entries(v)) out[k] = s(val);
  }
  return out;
}

/** 핵심: before/after 구조화 문제를 필드/항목 단위로 비교한다. */
export function computeDetailedDiff(before: Rec, after: Rec): DiffEntry[] {
  const out: DiffEntry[] = [];
  let n = 0;
  const id = () => `d${n++}`;
  const subType = s(after._typeId) || s(before._typeId);

  // 1) 스칼라 텍스트 필드.
  for (const { key, category } of SCALAR_FIELDS) {
    const b = s(before[key]);
    const a = s(after[key]);
    if (b === a) continue;
    out.push({
      id: id(),
      category,
      kind: !b ? "added" : !a ? "removed" : "changed",
      before: b || undefined,
      after: a || undefined,
      blockId: scalarBlockId(key, subType),
    });
  }

  // 2) 정답.
  {
    const b = answerText(before);
    const a = answerText(after);
    if (b !== a) {
      out.push({
        id: id(),
        category: "정답",
        kind: !b ? "added" : !a ? "removed" : "changed",
        before: b || undefined,
        after: a || undefined,
        blockId: "correctAnswer",
      });
    }
  }

  // 3) 배열 필드(라벨/인덱스 정렬 후 항목별).
  for (const { key, category } of ARRAY_FIELDS) {
    const bArr = Array.isArray(before[key]) ? (before[key] as unknown[]) : null;
    const aArr = Array.isArray(after[key]) ? (after[key] as unknown[]) : null;
    if (!bArr && !aArr) continue;
    if (bArr && !aArr) {
      out.push({ id: id(), category, kind: "removed", before: `${bArr.length}개 항목`, blockId: WHOLE_BLOCK_ARRAY[key] });
      continue;
    }
    if (!bArr && aArr) {
      out.push({ id: id(), category, kind: "added", after: `${aArr.length}개 항목`, blockId: WHOLE_BLOCK_ARRAY[key] });
      continue;
    }
    const b = indexArray(key, bArr!);
    const a = indexArray(key, aArr!);

    // 순서만 바뀐 경우(내용 멀티셋 동일) → 한 줄로 요약.
    const bSig = b.map((x) => x.text).slice().sort().join("∥");
    const aSig = a.map((x) => x.text).slice().sort().join("∥");
    const sameContent = bSig === aSig;
    const sameOrder = b.map((x) => x.text).join("∥") === a.map((x) => x.text).join("∥");
    if (sameOrder) continue; // 변화 없음.
    if (sameContent && b.length === a.length) {
      out.push({
        id: id(),
        category,
        kind: "reordered",
        before: b.map((x) => x.ref).join(" → "),
        after: a.map((x) => x.ref).join(" → "),
        note: "순서만 변경",
        blockId: WHOLE_BLOCK_ARRAY[key],
      });
      continue;
    }

    // 항목별 비교(키 = 라벨/인덱스).
    const aMap = new Map(a.map((x) => [x.key, x]));
    const bMap = new Map(b.map((x) => [x.key, x]));
    const keys = [...new Set([...b.map((x) => x.key), ...a.map((x) => x.key)])];
    for (const k of keys) {
      const bi = bMap.get(k);
      const ai = aMap.get(k);
      if (bi && ai) {
        if (bi.text !== ai.text) {
          out.push({ id: id(), category, ref: ai.ref || bi.ref, kind: "changed", before: bi.text, after: ai.text, blockId: arrayItemBlockId(key, k) });
        }
      } else if (bi && !ai) {
        out.push({ id: id(), category, ref: bi.ref, kind: "removed", before: bi.text, blockId: arrayItemBlockId(key, k) });
      } else if (!bi && ai) {
        out.push({ id: id(), category, ref: ai.ref, kind: "added", after: ai.text, blockId: arrayItemBlockId(key, k) });
      }
    }
  }

  // 4) 오답 해설(라벨 키).
  {
    const b = wrongExpl(before);
    const a = wrongExpl(after);
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    for (const k of keys) {
      if (b[k] === a[k]) continue;
      out.push({
        id: id(),
        category: "오답 해설",
        ref: refOf(k),
        kind: !b[k] ? "added" : !a[k] ? "removed" : "changed",
        before: b[k] || undefined,
        after: a[k] || undefined,
        blockId: "wrongOptionExplanations",
      });
    }
  }

  return out;
}
