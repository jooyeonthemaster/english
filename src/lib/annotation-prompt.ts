import type { PassageAnnotationInput, PassageAnnotationType } from "@/actions/workbench";

interface AnnotationGroup {
  header: string;
  anns: PassageAnnotationInput[];
}

/**
 * Combine a free-text teacher prompt with structured 5-layer annotations
 * (vocab / grammar / syntax / sentence / examPoint) into a single string
 * that the passage-analysis API merges in as "선생님 지시사항 (최우선 반영)".
 *
 * Keep this in sync with PassageAnnotationEditor's annotation types —
 * changes here directly affect AI analysis quality.
 */
export function buildAnalysisPrompt(
  textPrompt: string,
  anns: PassageAnnotationInput[],
): string {
  const parts: string[] = [];
  const trimmed = textPrompt?.trim() ?? "";
  if (trimmed) {
    parts.push(`[선생님 지시사항]\n${trimmed}`);
  }

  const groups: Record<PassageAnnotationType, AnnotationGroup> = {
    vocab: {
      header:
        "[선생님이 표시한 핵심 어휘 — 이 단어들을 vocabulary에 각각 1번씩만 포함하고 상세히 분석하세요. 절대 같은 단어를 중복 생성하지 마세요]",
      anns: anns.filter((a) => a.type === "vocab"),
    },
    grammar: {
      header:
        "[선생님이 표시한 문법/어법 포인트 — 이 부분의 문법을 grammarPoints에서 반드시 집중 분석하고, 출제 유형/오답 함정/변형 방향을 상세히 다루세요]",
      anns: anns.filter((a) => a.type === "grammar"),
    },
    syntax: {
      header:
        "[선생님이 표시한 구문 분석 대상 — syntaxAnalysis에서 이 문장들의 S/V/O/C 구조, 끊어읽기, 핵심 구문 패턴을 반드시 다루세요]",
      anns: anns.filter((a) => a.type === "syntax"),
    },
    sentence: {
      header:
        "[선생님이 표시한 핵심 문장 — structure 분석에서 이 문장들의 논리적 역할, 빈칸/순서 출제 적합성을 반드시 다루세요]",
      anns: anns.filter((a) => a.type === "sentence"),
    },
    examPoint: {
      header:
        "[선생님이 표시한 출제 포인트 — examDesign에서 이 부분의 패러프레이징, 구조 변형, 서술형 조건 설정을 반드시 다루세요]",
      anns: anns.filter((a) => a.type === "examPoint"),
    },
  };

  for (const group of Object.values(groups)) {
    if (group.anns.length > 0) {
      const lines = group.anns.map(
        (a) => `- "${a.text}"${a.memo ? ` → ${a.memo}` : ""}`,
      );
      parts.push(`${group.header}\n${lines.join("\n")}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * For question generation prompts — a terser block that cues the LLM to
 * respect teacher intent when producing questions (not analysis).
 */
export function buildQuestionAnnotationBlock(
  anns: PassageAnnotationInput[],
): string {
  if (!anns?.length) return "";
  const lines = anns.map(
    (a) => `- [${a.type}] "${a.text}"${a.memo ? ` → ${a.memo}` : ""}`,
  );
  return [
    "## 선생님이 표시한 출제 의도 (반드시 반영)",
    "아래 구간·단어는 선생님이 직접 마킹한 것입니다. 해당 유형/영역의 문제를 만들 때 이 지점을 우선적으로 출제에 활용하세요.",
    lines.join("\n"),
  ].join("\n");
}
