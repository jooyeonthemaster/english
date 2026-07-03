import type { ParsedSection } from "./types";
import { sentenceOrderSegmentsFromQuestionText } from "@/components/exams/paper-builder/question-body-layout";

// ---------------------------------------------------------------------------
// Parse questionText
// ---------------------------------------------------------------------------

export function parseQuestionSections(
  questionText: string,
  subType: string | null
): ParsedSection[] {
  if (!questionText) return [];

  if (subType === "SENTENCE_ORDER") {
    const stem = questionText.split(/\n{2,}/)[0]?.trim();
    const sections: ParsedSection[] = [];
    if (stem) sections.push({ type: "direction", content: stem });

    const paragraphItems: string[] = [];
    for (const segment of sentenceOrderSegmentsFromQuestionText(questionText)) {
      if (segment.kind === "box" && segment.boxStyle === "given") {
        sections.push({
          type: "marker",
          label: "주어진 문장",
          content: segment.text,
        });
      } else if (segment.kind === "para") {
        paragraphItems.push(`${segment.label} ${segment.text}`);
      } else if (segment.kind === "text") {
        sections.push({ type: "passage", content: segment.text });
      }
    }

    if (paragraphItems.length > 0) {
      sections.push({
        type: "paragraphs",
        label: "문단",
        content: paragraphItems.join("\n"),
        items: paragraphItems,
      });
    }

    return sections;
  }

  const sections: ParsedSection[] = [];
  // KO(국어) 게이트: serializeKoQuestion 은 블록을 "\n" 으로 잇고 【보기】/【조건】
  // 마커 행으로 구분한다 → 마커 행 앞에서도 분할(영어 경로는 기존 \n\n 분할 무변경).
  const isKo = typeof subType === "string" && subType.startsWith("KO_");
  const blocks = (
    isKo ? questionText.split(/\n(?=【)|\n\n/) : questionText.split(/\n\n/)
  ).filter(Boolean);

  const MARKER_MAP: Record<
    string,
    { type: ParsedSection["type"]; label: string }
  > = {
    "[주어진 문장]": { type: "marker", label: "주어진 문장" },
    "[given]": { type: "marker", label: "주어진 문장" },
    "[영작할 우리말]": { type: "marker", label: "영작할 우리말" },
    "[reference]": { type: "marker", label: "영작할 우리말" },
    "[원문]": { type: "marker", label: "원문" },
    "[original]": { type: "marker", label: "원문" },
    "[조건]": { type: "conditions", label: "조건" },
    "[condition]": { type: "conditions", label: "조건" },
    "[conditions]": { type: "conditions", label: "조건" },
    "[요약문]": { type: "summary", label: "요약문" },
    "[summary]": { type: "summary", label: "요약문" },
    // 주제문 영작(TOPIC_SENTENCE_WRITING) 학생 안전 블록 — 정답계열 미포함.
    //   [주제문] → summary(요약문 박스 재사용, 라벨만 주제문), [주제 힌트] → context(회색 해석),
    //   [보기]/[배열 단어] 는 위 scrambled 매핑 재사용.
    "[주제문]": { type: "summary", label: "주제문" },
    "[주제 힌트]": { type: "context", label: "주제 힌트" },
    "[빈칸 정답]": { type: "blanks", label: "빈칸 정답" },
    "[blank answers]": { type: "blanks", label: "빈칸 정답" },
    // 요약문 영작(SUMMARY_WRITING) 학생 안전 블록 — 정답계열은 직렬화에 미포함.
    //   [해석]/[빈칸 해석] → 회색 해석(context), [보기] → 단어 보기(scrambled 재사용), [앞글자] → 힌트(hint).
    //   [요약문] 은 위 "[요약문]" 매핑(summary)을 그대로 재사용한다.
    "[해석]": { type: "context", label: "해석" },
    "[빈칸 해석]": { type: "context", label: "빈칸 해석" },
    "[보기]": { type: "scrambled", label: "보기" },
    "[앞글자]": { type: "hint", label: "앞글자" },
    "[배열 단어]": { type: "scrambled", label: "배열 단어" },
    "[word order]": { type: "scrambled", label: "배열 단어" },
    "[힌트]": { type: "hint", label: "힌트" },
    "[hint]": { type: "hint", label: "힌트" },
    "[오류 문장]": { type: "error", label: "오류 문장" },
    "[대상 단어]": { type: "target", label: "대상 단어" },
    "[문맥]": { type: "context", label: "문맥" },
    "[유형:": { type: "matchType", label: "유형" },
    // KO(국어) — serializeKoQuestion 이 만드는 【보기】/【조건】 블록 마커
    // (라벨 변형은 koBogiSchema 의 enum 전수: 보기/보기 1/보기 2/자료/학습 활동.
    //  "보기 1/2" 를 "보기" 보다 먼저 두어 접두 매칭 오인을 막는다.)
    "【보기 1】": { type: "marker", label: "보기 1" },
    "【보기 2】": { type: "marker", label: "보기 2" },
    "【보기】": { type: "marker", label: "보기" },
    "【자료】": { type: "marker", label: "자료" },
    "【학습 활동】": { type: "marker", label: "학습 활동" },
    "【조건】": { type: "conditions", label: "조건" },
  };

  let directionFound = false;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let matched = false;
    for (const [marker, config] of Object.entries(MARKER_MAP)) {
      if (trimmed.startsWith(marker)) {
        let content = trimmed.slice(marker.length).replace(/^\s*/, "");
        if (marker === "[유형:") {
          content = content.replace(/\]$/, "");
        }

        // 레거시 내부 메타([대상 단어]=target, [문맥]=context)는 학생지에서 드롭한다.
        // 단, 요약문 영작의 [해석]/[빈칸 해석](context 재사용)은 렌더해야 하므로 보존한다.
        if (config.type === "target" || (config.type === "context" && config.label === "문맥")) {
          matched = true;
          break;
        }

        if (config.type === "conditions") {
          const lines = content.split("\n").filter(Boolean);
          let items = lines.map((l) => l.replace(/^\d+\.\s*/, "").trim());
          // KO(국어) 【조건】 은 "• " 불릿 행 — KO 마커 블록에서만 제거(영어 무변경)
          if (marker.startsWith("【")) {
            items = items.map((l) => l.replace(/^•\s*/, ""));
          }
          sections.push({
            type: "conditions",
            label: config.label,
            content,
            items,
          });
        } else if (config.type === "scrambled") {
          const words = content.split(/\s*\/\s*/);
          sections.push({
            type: "scrambled",
            label: config.label,
            content,
            items: words,
          });
        } else if (config.type === "blanks") {
          sections.push({ type: "blanks", label: config.label, content });
        } else {
          sections.push({ type: config.type, label: config.label, content });
        }
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (!directionFound) {
      directionFound = true;
      sections.push({ type: "direction", content: trimmed });
      continue;
    }

    if (/^\([A-C]\)\s/.test(trimmed) || /^\([a-c]\)\s/.test(trimmed)) {
      const lines = trimmed.split("\n").filter(Boolean);
      sections.push({
        type: "paragraphs",
        label: "단락",
        content: trimmed,
        items: lines,
      });
      continue;
    }

    if (sections.length > 0 && sections[sections.length - 1].type === "passage") {
      sections[sections.length - 1].content += "\n\n" + trimmed;
    } else {
      sections.push({ type: "passage", content: trimmed });
    }
  }

  return sections;
}

export function questionTextContainsPassage(sections: ParsedSection[]): boolean {
  return sections.some(
    (s) =>
      s.type === "passage" ||
      s.type === "paragraphs" ||
      s.type === "summary" ||
      s.type === "error"
  );
}
