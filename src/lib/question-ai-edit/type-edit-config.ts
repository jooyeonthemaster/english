// ============================================================================
// AI 문제 수정 — 유형별 편집 설정 레지스트리
// ============================================================================
// 23(25)개 유형 각각의 "개별 특성"을 수정 모달에서 노출하기 위한 데이터 레지스트리.
//   - tagline : 패널 상단 한 줄 유형 특성 요약
//   - controls: 유형 전용 구조화 컨트롤(세그먼트/토글) — 선택 시 자연어 directive 조각
//   - quickActions: 빠른 지시 칩(focus-presets 재사용)
//   - blocks  : 데이터에서 동적 파생(deriveBlocksForQuestion) — 칩 레일/클릭 첨부용
//
// ⭐ 제약 (run-edit.ts 수정 계약과 정합 — directive 작성 시 반드시 준수):
//   1) 유형 고정 — 다른 유형으로 바꾸는 directive 금지.
//   2) 구조 카운트 고정 — 밑줄/선지/빈칸/표시 "개수"를 바꾸는 directive 금지
//      (run-edit 의 structuralCount 게이트가 거부 → 재시도 소모). 내용·모드만 바꾼다.
//   3) baseline 설계신호 정합 — matchType(일치/불일치)·answerPolarity·stemLanguage·
//      optionLanguage 를 바꾸는 directive 는 품질 게이트가 baseline 기준으로 검증하므로
//      위험 → 컨트롤로 노출하지 않는다(blankAnswerMode·vocabDisplayMode 는 run-edit 가
//      명시적으로 재주입을 허용하므로 안전).
//   4) 정답 누설 금지 — 정답계열을 학생면에 노출시키는 directive 금지.
// ============================================================================

import { getEditFocusPresets } from "./focus-presets";

export interface EditControlOption {
  value: string;
  label: string;
  /** 이 옵션 선택 시 합성되는 자연어 지시 조각. null = 기본/무지시. */
  directive: string | null;
}

export interface EditControl {
  /** 안정 키(예: "synonymVariant"). */
  id: string;
  kind: "segmented" | "toggle";
  /** 컨트롤 제목(예: "동의어 변형"). */
  label: string;
  /** 짧은 설명(선택). */
  hint?: string;
  /** 태그 뱃지(선택) — 예: ["난이도 ↑", "암기 방지"]. */
  badges?: string[];
  /** segmented: 2~7개 / toggle: [off, on] 2개. */
  options: EditControlOption[];
  /** 기본값(보통 options[0].value). */
  defaultValue: string;
}

export interface EditBlockDef {
  id: string;
  label: string;
  field?: string;
  group: "문항" | "정답·해설";
  /** 현재 값 짧은 발췌(선택). */
  excerpt?: string;
}

export interface TypeEditConfig {
  subType: string;
  tagline: string;
  controls: EditControl[];
  quickActions: { label: string; instruction: string }[];
}

// ---------------------------------------------------------------------------
// 유형별 한 줄 특성 요약
// ---------------------------------------------------------------------------
export const TYPE_TAGLINES: Record<string, string> = {
  BLANK_INFERENCE: "지문 핵심 표현을 빈칸으로 — 정답은 원문 그대로(SOURCE) 또는 패러프레이즈, 오답은 매력적 함정.",
  GRAMMAR_ERROR: "밑줄 표현 중 어법상 틀린 것 찾기 — 밑줄은 최소 단위, 정답 포인트가 핵심.",
  GRAMMAR_CHOICE_COMBO: "(A)(B)(C) 네모에서 어법에 맞는 표현 조합 고르기 — 슬롯별 포인트가 서로 달라야.",
  VOCAB_CHOICE: "밑줄 어휘 중 문맥상 부적절한 것 — 동의어 변형으로 지문 암기를 무력화할 수 있음.",
  SENTENCE_ORDER: "주어진 글 다음 (A)(B)(C) 순서 — 연결 단서가 순서를 유일하게 결정해야.",
  SENTENCE_INSERT: "주어진 문장이 들어갈 위치(①~⑤) — 앞뒤 연결 단서로 정답 위치가 유일해야.",
  TOPIC: "글 전체 주제 추론 — 오답은 부분 정보, 정답은 전체를 포괄.",
  MAIN_IDEA: "글의 요지·주장 추론(한국어 선지) — 오답은 지엽적 진술.",
  TOPIC_MAIN_IDEA: "주제 또는 요지 추론(레거시 통합형).",
  TITLE: "글의 제목 추론 — 정답은 함축적, 오답은 지엽/과포괄.",
  IMPLIED_MEANING: "밑줄 구절의 함축 의미 — 정답은 함축, 오답은 표면 의미 함정.",
  REFERENCE: "밑줄 대명사가 가리키는 대상 — 문맥상 하나로 결정되어야.",
  CONTENT_MATCH: "글 내용과 일치/불일치 판단 — 함정은 숫자·인과·범위를 살짝 비틂.",
  SUMMARY_COMPLETE_MC: "요약문 (A)(B) 빈칸 조합 고르기 — 오답은 한쪽만 맞는 함정.",
  IRRELEVANT: "글 흐름과 무관한 문장 찾기 — 정답은 중간, 주제는 비슷하나 논리 이탈.",
  CONDITIONAL_WRITING: "조건에 맞게 영작 — 조건은 구체·검증가능, 모범답안은 조건 충족.",
  SENTENCE_TRANSFORM: "문장을 조건에 맞게 전환(능동↔수동·가정법 등) — 전환 포인트가 핵심.",
  FILL_BLANK_KEY: "본문 핵심 표현 빈칸 채우기(서술형) — 단서로 합리적 유추 가능해야.",
  SUMMARY_COMPLETE: "요약문 빈칸 완성(짧은 답) — 빈칸은 요지 직결 어휘.",
  SUMMARY_WRITING: "요약문 빈칸을 보기·해석·단서로 영작 — 정답계열은 절대 학생면에 노출 금지.",
  WORD_ORDER: "주어진 단어를 올바른 순서로 배열 — 힌트는 명확히.",
  GRAMMAR_CORRECTION: "문법 오류를 찾아 바르게 고치기 — 밑줄 구간별 오류·정정안 정합.",
  CONTEXT_MEANING: "밑줄 단어의 문맥상 의미 — 오답은 사전적·유사 의미 함정.",
  SYNONYM: "핵심 어휘의 동의어 — 오답은 비슷해 보이나 다른 단어.",
  ANTONYM: "단어-반의어 쌍 중 잘못 짝지어진 하나 — 나머지는 올바른 반의 관계.",
};

// ---------------------------------------------------------------------------
// 유형 전용 구조화 컨트롤
//   ※ 견본(SENTENCE_INSERT 등 일부)만 직접 작성. 나머지는 팬아웃으로 채운다.
//      비어 있는 유형은 quickActions(focus-presets)만으로 동작(폴백).
// ---------------------------------------------------------------------------
const off = (value = "off"): EditControlOption => ({ value, label: "끄기", directive: null });

export const TYPE_CONTROLS: Record<string, EditControl[]> = {
  // ── 견본: 문장 삽입 ──────────────────────────────────────────────────────
  SENTENCE_INSERT: [
    {
      id: "answerUniqueness",
      kind: "toggle",
      label: "정답 위치 유일화",
      hint: "앞뒤 연결 단서를 강화해 정답이 한 곳으로만 결정되게",
      badges: ["변별력 ↑"],
      options: [
        off(),
        {
          value: "on",
          label: "적용",
          directive:
            "주어진 문장이 들어갈 자리가 단 한 곳으로만 결정되도록 앞뒤 문장의 연결 단서(지시어·대명사·연결어·시간 순서)를 강화해 줘. 정답 위치 번호는 유지하고 나머지 위치가 오답임이 분명해지도록.",
        },
      ],
      defaultValue: "off",
    },
    {
      id: "paraphrasePrefix",
      kind: "toggle",
      label: "앞부분 변형(암기 무력화)",
      hint: "주어진 문장 앞부분을 같은 의미로 바꿔 지문 암기 방지",
      badges: ["암기 방지", "난이도 ↑"],
      options: [
        off(),
        {
          value: "on",
          label: "적용",
          directive:
            "주어진 문장(givenSentence)의 도입 어구·주어구를 의미는 그대로 유지한 채 다른 표현으로 패러프레이즈해서, 원문을 외운 학생도 표면 매칭으로 풀 수 없게 해 줘. 정답 위치는 바꾸지 마.",
        },
      ],
      defaultValue: "off",
    },
    {
      id: "decoyStrength",
      kind: "toggle",
      label: "오답 위치 강화",
      hint: "정답이 아닌 위치도 한 번씩 끌리게",
      options: [
        off(),
        {
          value: "on",
          label: "적용",
          directive:
            "정답이 아닌 위치(①~⑤ 중 오답)들도 얼핏 그럴듯하게 끌릴 만한 흐름으로 다듬어 변별력을 높이되, 논리적으로는 정답 위치만 옳도록 유지해 줘.",
        },
      ],
      defaultValue: "off",
    },
    {
      id: "cohesionFocus",
      kind: "segmented",
      label: "정답 단서 유형",
      hint: "정답 위치를 결정하는 응집 장치를 지정",
      options: [
        { value: "keep", label: "유지", directive: null },
        {
          value: "reference",
          label: "지시어·대명사",
          directive:
            "정답 위치의 핵심 단서를 지시어·대명사 참조 해소(this/these/such 등이 주어진 문장의 내용을 받음) 중심으로 다시 구성해 줘.",
        },
        {
          value: "connector",
          label: "연결어",
          directive:
            "정답 위치의 핵심 단서를 연결어(However·For example·As a result 등)의 논리 전환 중심으로 다시 구성해 줘.",
        },
        {
          value: "contrast",
          label: "대조 전환",
          directive:
            "정답 위치의 핵심 단서를 앞뒤 문장의 대조/전환 관계 중심으로 다시 구성해 줘.",
        },
      ],
      defaultValue: "keep",
    },
  ],
};

// ---------------------------------------------------------------------------
// 데이터 기반 블럭 파생 — 칩 레일/클릭 첨부용. 존재하는 필드만 노출.
//   (수정 모달은 교사 전용 표면이므로 정답·해설 라벨 노출은 누설 아님.)
// ---------------------------------------------------------------------------
type Rec = Record<string, unknown>;

function clip(value: unknown, max = 70): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

const GIVEN_SENTENCE_LABELS: Record<string, string> = {
  SENTENCE_INSERT: "삽입할 문장",
  SENTENCE_ORDER: "주어진 문장",
  CONDITIONAL_WRITING: "영작할 우리말",
  SENTENCE_TRANSFORM: "원래 문장",
};

const PASSAGE_BEARING = new Set([
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "VOCAB_CHOICE",
  "SENTENCE_ORDER", "SENTENCE_INSERT", "IMPLIED_MEANING", "REFERENCE",
  "IRRELEVANT", "CONTEXT_MEANING", "ANTONYM", "SYNONYM", "FILL_BLANK_KEY",
  "TOPIC", "MAIN_IDEA", "TOPIC_MAIN_IDEA", "TITLE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC",
]);

/** 현재 문제(before) 데이터에서 클릭 첨부 가능한 블럭 목록을 만든다. */
export function deriveBlocksForQuestion(subType: string, before: Rec | null | undefined): EditBlockDef[] {
  const q = (before ?? {}) as Rec;
  const blocks: EditBlockDef[] = [];

  // 발문
  const direction = q.direction ?? q.questionText;
  blocks.push({ id: "direction", label: "발문", field: "direction", group: "문항", excerpt: clip(direction) });

  // 주어진/원본 문장
  if (typeof q.givenSentence === "string" && q.givenSentence.trim()) {
    const label = GIVEN_SENTENCE_LABELS[subType] || "주어진 문장";
    blocks.push({ id: `given:${label}`, label, field: "givenSentence", group: "문항", excerpt: clip(q.givenSentence) });
  }
  if (typeof q.referenceSentence === "string" && q.referenceSentence.trim()) {
    blocks.push({ id: "given:영작할 우리말", label: "영작할 우리말", field: "referenceSentence", group: "문항", excerpt: clip(q.referenceSentence) });
  }
  if (typeof q.originalSentence === "string" && q.originalSentence.trim()) {
    blocks.push({ id: "given:원래 문장", label: "원래 문장", field: "originalSentence", group: "문항", excerpt: clip(q.originalSentence) });
  }

  // 지문 / 요약문
  if (PASSAGE_BEARING.has(subType)) {
    blocks.push({ id: "passage", label: "지문", field: "passage", group: "문항" });
  }
  if (typeof q.summaryWithBlanks === "string" && q.summaryWithBlanks.trim()) {
    blocks.push({ id: "passage:요약문", label: "요약문", field: "summaryWithBlanks", group: "문항" });
  }
  if (typeof q.koreanGloss === "string" && q.koreanGloss.trim()) {
    blocks.push({ id: "passage:해석", label: "해석", field: "koreanGloss", group: "문항", excerpt: clip(q.koreanGloss) });
  }

  // 조건(서술형)
  if (Array.isArray(q.conditions) && q.conditions.length > 0) {
    blocks.push({ id: "conditions", label: "조건", field: "conditions", group: "문항", excerpt: clip(q.conditions.join(" · ")) });
  }

  // 선지(개별)
  if (Array.isArray(q.options)) {
    for (const opt of q.options as Rec[]) {
      const label = typeof opt?.label === "string" ? opt.label : "";
      if (!label) continue;
      blocks.push({
        id: `option:${label}`,
        label: `선지 ${label}`,
        field: "options",
        group: "문항",
        excerpt: clip(typeof opt?.text === "string" ? opt.text : undefined),
      });
    }
  }

  // 정답·해설 그룹
  blocks.push({ id: "correctAnswer", label: "정답", field: "correctAnswer", group: "정답·해설", excerpt: clip(q.correctAnswer) });
  if (typeof q.modelAnswer === "string" && q.modelAnswer.trim()) {
    blocks.push({ id: "modelAnswer", label: "모범 답안", field: "modelAnswer", group: "정답·해설", excerpt: clip(q.modelAnswer) });
  }
  if (typeof q.explanation === "string" && q.explanation.trim()) {
    blocks.push({ id: "explanation", label: "해설", field: "explanation", group: "정답·해설", excerpt: clip(q.explanation) });
  }
  if (Array.isArray(q.keyPoints) && q.keyPoints.length > 0) {
    blocks.push({ id: "keyPoints", label: "핵심 포인트", field: "keyPoints", group: "정답·해설", excerpt: clip(q.keyPoints.join(" · ")) });
  }
  if (q.wrongOptionExplanations && typeof q.wrongOptionExplanations === "object" && !Array.isArray(q.wrongOptionExplanations) && Object.keys(q.wrongOptionExplanations).length > 0) {
    blocks.push({ id: "wrongOptionExplanations", label: "오답 해설", field: "wrongOptionExplanations", group: "정답·해설" });
  }

  return blocks;
}

/** 유형별 편집 설정을 반환(없는 유형은 quickActions 만으로 동작). */
export function getTypeEditConfig(subType: string): TypeEditConfig {
  return {
    subType,
    tagline: TYPE_TAGLINES[subType] || "",
    controls: TYPE_CONTROLS[subType] ?? [],
    quickActions: getEditFocusPresets(subType),
  };
}
