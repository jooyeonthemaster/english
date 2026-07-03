// @ts-nocheck
import type { ParsedSection } from "./types";

// ---------------------------------------------------------------------------
// Parse questionText into structured sections
// ---------------------------------------------------------------------------

export function parseQuestionSections(
  questionText: string,
  subType: string | null,
): ParsedSection[] {
  if (!questionText) return [];

  const sections: ParsedSection[] = [];
  // KO(국어) 게이트: serializeKoQuestion 은 블록을 "\n" 으로 잇고 【보기】/【조건】
  // 마커 행으로 구분한다 → 마커 행 앞에서도 분할(영어 경로는 기존 \n\n 분할 무변경).
  const isKo = typeof subType === "string" && subType.startsWith("KO_");
  // Split by double newline (how buildQuestionText joins parts)
  const blocks = (
    isKo ? questionText.split(/\n(?=【)|\n\n/) : questionText.split(/\n\n/)
  ).filter(Boolean);

  // Known section markers that buildQuestionText() prefixes
  const MARKER_MAP: Record<string, { type: ParsedSection["type"]; label: string }> = {
    "[주어진 문장]": { type: "marker", label: "주어진 문장" },
    "[given]": { type: "marker", label: "주어진 문장" },
    "[영작할 우리말]": { type: "marker", label: "영작할 우리말" },
    "[reference]": { type: "marker", label: "영작할 우리말" },
    "[원문]": { type: "marker", label: "원래 문장" },
    "[original]": { type: "marker", label: "원래 문장" },
    "[조건]": { type: "conditions", label: "조건" },
    "[condition]": { type: "conditions", label: "조건" },
    "[conditions]": { type: "conditions", label: "조건" },
    "[요약문]": { type: "summary", label: "요약문" },
    "[summary]": { type: "summary", label: "요약문" },
    // 주제문 영작(TOPIC_SENTENCE_WRITING) 학생 안전 블록.
    "[주제문]": { type: "summary", label: "주제문" },
    "[주제 힌트]": { type: "context", label: "주제 힌트" },
    "[보기]": { type: "scrambled", label: "보기" },
    "[빈칸 정답]": { type: "blanks", label: "빈칸 정답" },
    "[blank answers]": { type: "blanks", label: "빈칸 정답" },
    "[배열 단어]": { type: "scrambled", label: "배열 단어" },
    "[word order]": { type: "scrambled", label: "배열 단어" },
    "[힌트]": { type: "hint", label: "힌트" },
    "[hint]": { type: "hint", label: "힌트" },
    "[오류 문장]": { type: "error", label: "오류 문장" },
    "[대상 단어]": { type: "target", label: "대상 단어" },
    "[문맥]": { type: "context", label: "문맥" },
    "[유형:": { type: "matchType", label: "유형" },
    // KO(국어) — serializeKoQuestion 이 만드는 【보기】/【조건】 블록 마커
    // (라벨 변형은 koBogiSchema 의 enum 전수: 보기/보기 1/보기 2/자료/학습 활동)
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

    // Check for known markers
    let matched = false;
    for (const [marker, config] of Object.entries(MARKER_MAP)) {
      if (trimmed.startsWith(marker)) {
        const content = trimmed.slice(marker.length).replace(/^\s*/, "").replace(/\]$/, "");

        if (config.type === "target" || config.type === "context") {
          matched = true;
          break;
        }

        if (config.type === "conditions") {
          // Parse numbered conditions: "1. xxx\n2. yyy"
          const lines = content.split("\n").filter(Boolean);
          let items = lines.map((l) => l.replace(/^\d+\.\s*/, "").trim());
          // KO(국어) 【조건】 은 "• " 불릿 행 — KO 마커 블록에서만 제거(영어 무변경)
          if (marker.startsWith("【")) {
            items = items.map((l) => l.replace(/^•\s*/, ""));
          }
          sections.push({ type: "conditions", label: config.label, content, items });
        } else if (config.type === "scrambled") {
          const words = content.split(/\s*\/\s*/);
          sections.push({ type: "scrambled", label: config.label, content, items: words });
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

    // First block without a marker = direction (if not yet found)
    if (!directionFound) {
      directionFound = true;
      sections.push({ type: "direction", content: trimmed });
      continue;
    }

    // Detect paragraph blocks like "(A) text\n(B) text\n(C) text"
    if (/^\([A-C]\)\s/.test(trimmed)) {
      const lines = trimmed.split("\n").filter(Boolean);
      sections.push({ type: "paragraphs", label: "단락", content: trimmed, items: lines });
      continue;
    }

    // Otherwise it's passage content (the main body text)
    sections.push({ type: "passage", content: trimmed });
  }

  return sections;
}
