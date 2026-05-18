// @ts-nocheck
import type { ParsedSection } from "./types";

// ---------------------------------------------------------------------------
// Parse questionText into structured sections
// ---------------------------------------------------------------------------

export function parseQuestionSections(
  questionText: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _subType: string | null,
): ParsedSection[] {
  if (!questionText) return [];

  const sections: ParsedSection[] = [];
  // Split by double newline (how buildQuestionText joins parts)
  const blocks = questionText.split(/\n\n/).filter(Boolean);

  // Known section markers that buildQuestionText() prefixes
  const MARKER_MAP: Record<string, { type: ParsedSection["type"]; label: string }> = {
    "[주어진 문장]": { type: "marker", label: "주어진 문장" },
    "[영작할 우리말]": { type: "marker", label: "영작할 우리말" },
    "[원문]": { type: "marker", label: "원래 문장" },
    "[조건]": { type: "conditions", label: "조건" },
    "[요약문]": { type: "summary", label: "요약문" },
    "[빈칸 정답]": { type: "blanks", label: "빈칸 정답" },
    "[배열 단어]": { type: "scrambled", label: "배열 단어" },
    "[힌트]": { type: "hint", label: "힌트" },
    "[오류 문장]": { type: "error", label: "오류 문장" },
    "[대상 단어]": { type: "target", label: "대상 단어" },
    "[문맥]": { type: "context", label: "문맥" },
    "[유형:": { type: "matchType", label: "유형" },
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

        if (config.type === "conditions") {
          // Parse numbered conditions: "1. xxx\n2. yyy"
          const lines = content.split("\n").filter(Boolean);
          const items = lines.map((l) => l.replace(/^\d+\.\s*/, "").trim());
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
