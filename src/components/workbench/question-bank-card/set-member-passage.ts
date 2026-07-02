// 장문 세트 멤버를 "자기완결 일반 카드"로 보여주기 위한 지문 복원 헬퍼.
//
// 일반 문항은 지문·밑줄이 questionText 에 baked 되지만, 장문 세트 멤버는
// 지문을 공유(passage)로 두고 밑줄/마커를 anchor(structuredData._spans)로만
// 저장한다. 따라서 세트 멤버를 일반 카드/상세로 렌더할 때는, 그 멤버의 spans 를
// 공유 지문에 적용해 `__단어__` 마크업이 있는 텍스트로 복원해야 밑줄이 보인다.
//
// 반환값:
//  · 세트 멤버가 아니면 null  → 호출부는 기존 동작(raw passage)을 그대로 유지
//  · 세트 멤버면 spans 적용된 지문 텍스트(spans 없거나 실패 시 원본 지문)
import { reconstructPassageView } from "@/lib/question-sets/reconstruct";

interface MaybeSetMember {
  inSet?: boolean;
  setId?: string | null;
  structuredData?: unknown;
  passage?: { content?: string | null } | null;
}

export function setMemberDisplayPassage(q: MaybeSetMember): string | null {
  if (!q?.inSet && !q?.setId) return null;
  const base = q.passage?.content;
  if (!base) return null;

  const sd = q.structuredData;
  const spans =
    sd && typeof sd === "object" && Array.isArray((sd as { _spans?: unknown })._spans)
      ? ((sd as { _spans: unknown[] })._spans as Parameters<
          typeof reconstructPassageView
        >[1])
      : null;
  if (!spans || spans.length === 0) return base;

  try {
    const primary = reconstructPassageView(base, spans);
    if (primary.missing.length === 0) return primary.text || base;
    // 못 찾은 anchor: surroundingText 가 세트 병합 레이아웃(삽입마커 ①②③④⑤·문장 제거) 기준이라
    // 단독 멤버의 clean 지문과 어긋날 수 있다. surroundingText 를 버리고 spanText 단독·완화
    // 전략으로 재시도해(예: 지칭의 'This' 가 지문에 1회뿐이면 정확히 찾힘) 밑줄/빈칸을 살린다.
    const relaxed = primary.missing
      .filter((a) => a.kind === "UNDERLINE" || a.kind === "MARKER" || a.kind === "BLANK")
      .map((a) => ({
        ...a,
        surroundingText: undefined,
        occurrenceIndex: undefined,
        findStrategy: (a.kind === "BLANK" ? "expression" : "word") as "expression" | "word",
      }));
    if (relaxed.length === 0) return primary.text || base;
    return reconstructPassageView(primary.text, relaxed).text || primary.text || base;
  } catch {
    return base;
  }
}

// 구조형 렌더러(StructuredQuestionRenderer)가 본문에 "지문+밑줄/마커"를 그리려면
// 유형별로 정해진 passageWith* 필드가 structuredData 에 있어야 한다(hasStructuredFields).
// 일반(standalone) 문항은 생성 시 이 필드가 baked 되지만, 장문 세트 멤버는 지문이
// 공유 + anchor(spans)로만 저장돼 이 필드가 없다 → 본문에 지문이 안 나온다.
// 그래서 세트 멤버일 때 복원 지문을 해당 필드로 주입해 어법 문항과 동일하게 렌더한다.
const PASSAGE_FIELD_BY_TYPE: Record<string, string> = {
  CONTEXT_MEANING: "passageWithUnderline",
  IMPLIED_MEANING: "passageWithUnderline",
  REFERENCE: "passageWithUnderline",
  // 문법 오류 수정(서술형): 지문에 (A)(B)(C) 마커가 찍힌 passageWithUnderline 이
  // 있어야 구조형 렌더가 켜지고(grammarCorrectionErrorSentenceForQuestionText 가
  // 이 필드로 전체 지문을 라벨링), 없으면 지문 없이 폴백된다.
  GRAMMAR_CORRECTION: "passageWithUnderline",
  GRAMMAR_ERROR: "passageWithMarkers",
  GRAMMAR_CHOICE_COMBO: "passageWithMarkers",
  VOCAB_CHOICE: "passageWithMarkers",
  ANTONYM: "passageWithMarkers",
  SENTENCE_INSERT: "passageWithMarkers",
  BLANK_INFERENCE: "passageWithBlank",
};

/**
 * 카드의 structuredQuestion 으로 쓸 structuredData 를 돌려준다.
 *  · _typeId 가 없으면 null(구조형 렌더 불가)
 *  · 비-세트 문항이면 원본 그대로(기존 동작)
 *  · 세트 멤버면 복원 지문을 유형별 passageWith* 필드로 주입(없을 때만)해,
 *    본문(발문 아래)에 지문+밑줄/마커가 그려지게 한다.
 */
export function enrichSetMemberStructured(
  q: MaybeSetMember,
): Record<string, unknown> | null {
  const sd = q?.structuredData;
  if (!sd || typeof sd !== "object" || !("_typeId" in sd)) return null;
  const base = sd as Record<string, unknown>;
  if (!q.inSet && !q.setId) return base;

  const field = PASSAGE_FIELD_BY_TYPE[String(base._typeId)];
  if (!field || base[field]) return base; // 매핑 없음 또는 이미 baked → 그대로

  const reconstructed = setMemberDisplayPassage(q);
  if (!reconstructed) return base;
  return { ...base, [field]: reconstructed };
}
