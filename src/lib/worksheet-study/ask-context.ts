// ============================================================================
// 학습지 스터디 모드 — AI 질문 컨텍스트 조립 (플레인 모듈, 순수)
//
// 학생이 "질문" 시트에서 물어볼 때 AI 에게 넘길 문항 설명문을 만든다.
// 클라이언트는 (stageId, itemKey) 만 보내고 본문은 서버가 plan 에서 재조립한다 —
// 학생이 문항 내용·정답을 위조해 AI 를 속이는 경로를 원천 차단한다
// (어법 드릴 챗 route 의 "컨텍스트는 서버 번들에서 조립" 원칙과 동일).
//
// plan 하나가 필요한 모든 것을 담고 있다(문항 + reading 스테이지의 문장 원문 +
// vocabMeanings) — 리포트 재조회 없이 여기서 끝낸다.
// ============================================================================

import type { StudyItem, StudyPlan, StudyStage, StudyStageId } from "./types";

export interface StudyAskTarget {
  stage: StudyStage;
  item: StudyItem;
}

/** plan 에서 (stageId, itemKey) 로 문항을 찾는다 — 없으면 null(위조·드리프트). */
export function findStudyItem(
  plan: StudyPlan,
  stageId: string,
  itemKey: string,
): StudyAskTarget | null {
  const stage = plan.stages.find((s) => s.id === (stageId as StudyStageId));
  if (!stage) return null;
  const item = stage.items.find((i) => i.key === itemKey);
  if (!item) return null;
  return { stage, item };
}

/** 지문 문장 원문 — reading 스테이지가 문장별 en/ko 를 이미 싣고 있다. */
function sentenceOf(plan: StudyPlan, n: number): { en: string; ko: string } | null {
  const reading = plan.stages.find((s) => s.id === "reading");
  if (!reading) return null;
  for (const it of reading.items) {
    if (it.type === "read" && it.n === n) return { en: it.en, ko: it.ko };
  }
  return null;
}

/** cloze 세그먼트를 사람이 읽는 문장으로 복원 — 빈칸은 (1)___ 로 번호를 붙인다. */
function renderClozeSentence(
  segments: ({ t: string } | { blank: number })[],
): string {
  return segments
    .map((s) => ("t" in s ? s.t : `(${s.blank + 1})___`))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 문항 1개를 AI 가 읽을 평문으로 렌더. 정답·해설을 포함한다 —
 * 미풀이 상태의 정답 은닉은 프롬프트(system)에서 지시로 처리한다
 * (어법 드릴 챗과 동일 계약: 컨텍스트는 완전하게, 노출은 지시로 통제).
 */
export function renderItemForAi(item: StudyItem): string {
  switch (item.type) {
    case "read":
      return [
        "유형: 지문 통독(문장 읽기 — 채점 없음)",
        `영어: ${item.en}`,
        `해석: ${item.ko}`,
        item.chunks?.length
          ? `끊어읽기: ${item.chunks.map((c) => `${c.text.trim()}(${c.gloss ?? ""})`).join(" / ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "flash":
      return [
        "유형: 어휘 카드(암기 — 채점 없음)",
        `표제어: ${item.front}`,
        `뜻: ${item.back}`,
        item.extra?.synonyms ? `동의어: ${item.extra.synonyms}` : "",
        item.extra?.antonyms ? `반의어: ${item.extra.antonyms}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "mc": {
      const answer = item.choices.find((c) => c.label === item.answerLabel);
      return [
        "유형: 객관식",
        item.passage ? `지문: ${item.passage}` : "",
        `발문: ${item.prompt}`,
        `선택지: ${item.choices.map((c) => `${c.label} ${c.text}`).join(" / ")}`,
        `정답: ${item.answerLabel}${answer ? ` (${answer.text})` : ""}`,
        item.explanation ? `해설: ${item.explanation}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "match":
      return [
        `유형: 짝 연결(${item.leftHead} ↔ ${item.rightHead})`,
        `왼쪽: ${item.left.join(" / ")}`,
        `오른쪽: ${item.right.join(" / ")}`,
        `정답 짝: ${item.left
          .map((l, i) => `${l} → ${item.right[item.answer[i]] ?? "?"}`)
          .join(" , ")}`,
      ].join("\n");

    case "order":
      return [
        "유형: 어순 배열(조각을 바른 순서로)",
        item.ko ? `우리말: ${item.ko}` : "",
        `제시 조각: ${item.tiles.join(" | ")}`,
        `정답 문장: ${item.answer}`,
      ]
        .filter(Boolean)
        .join("\n");

    case "sentence-order":
      return [
        "유형: 문장 순서 배열",
        item.given ? `주어진 글: ${item.given.en}` : "",
        `카드: ${item.cards.map((c) => `(${c.label}) ${c.en}`).join(" / ")}`,
        `정답 순서: ${item.answer}`,
      ]
        .filter(Boolean)
        .join("\n");

    case "cloze":
      return [
        "유형: 빈칸 채우기(단어은행에서 골라 넣기)",
        `문장: ${renderClozeSentence(item.segments)}`,
        `단어은행: ${item.bank.join(" / ")}`,
        `정답: ${item.answerKey.map((a, i) => `(${i + 1}) ${a}`).join(" , ")}`,
        item.cue ? `단서: ${item.cue}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "ox":
      return [
        "유형: O/X (문장이 어법상 옳은지 판단)",
        `제시 문장: ${item.statement}`,
        `정답: ${item.wrong ? "X (어법상 틀림)" : "O (어법상 옳음)"}`,
        item.wrong && item.fixFrom
          ? `틀린 부분: '${item.fixFrom}' → '${item.fixTo ?? ""}' 로 고쳐야 함`
          : "",
        `해설: ${item.explanation}`,
      ]
        .filter(Boolean)
        .join("\n");

    case "inline-choice":
      return [
        "유형: 어법 택일(괄호 안에서 옳은 것 고르기)",
        `문장: ${item.before}${item.after}`,
        `선택지: ${item.options.join(" / ")}`,
        `정답: ${item.answer}`,
        item.explanation ? `해설: ${item.explanation}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "self-grade":
      return [
        "유형: 해석 쓰기(학생이 우리말로 해석한 뒤 스스로 채점)",
        `영어 문장: ${item.en}`,
        `모범 해석: ${item.modelKo}`,
      ].join("\n");

    case "typing":
      return [
        "유형: 직접 입력(영작·철자)",
        `제시(우리말): ${item.promptKo}`,
        `정답: ${item.answer}`,
      ].join("\n");
  }
}

/** 문항 컨텍스트 전문 — 학습지 제목 + 스테이지 + 문항 + 관련 지문 문장 + 어휘 뜻. */
export function buildStudyAskContext(plan: StudyPlan, target: StudyAskTarget): string {
  const { stage, item } = target;
  const lines: string[] = [
    `학습지: ${plan.reportTitle}`,
    `현재 단계: ${stage.title} — ${stage.subtitle}`,
    "",
    "── 학생이 보고 있는 문항 ──",
    renderItemForAi(item),
  ];

  // 지문 근거 — 이 문항이 어느 문장에서 나왔는지(맥락 없는 답변 방지)
  if (item.sentenceNo) {
    const s = sentenceOf(plan, item.sentenceNo);
    if (s && item.type !== "read") {
      lines.push(
        "",
        "── 이 문항이 나온 지문 문장 ──",
        `(${item.sentenceNo}) ${s.en}`,
        `해석: ${s.ko}`,
      );
    }
  }

  // 어휘 문항이면 본문에서의 뜻을 못 박는다 — 다의어 오답변 방지
  if (item.wordKey) {
    const meaning = plan.vocabMeanings[item.wordKey];
    if (meaning) {
      lines.push(
        "",
        "── 이 어휘의 본문 의미 ──",
        `${item.wordKey}: ${meaning}`,
        "이 지문에서 쓰인 의미는 위와 같습니다. 다른 뜻으로 설명하지 마십시오.",
      );
    }
  }

  return lines.join("\n");
}

/** 컨텍스트 키 — 대화 이력 조인용. GrammarDrillChatMessage.contextItemId 에 저장. */
export function studyAskContextKey(taskId: string, itemKey: string): string {
  return `ws:${taskId}:${itemKey}`.slice(0, 190);
}
