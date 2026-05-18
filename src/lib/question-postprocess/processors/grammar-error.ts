import {
  applyReplacementsRTL,
  findExpressionInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import type { PostProcessResult, Replacement } from "../types";

export function processGrammarError(
  passage: string,
  ai: Record<string, any>,
): PostProcessResult {
  const warnings: string[] = [];

  const markedExpressions = ai.markedExpressions as Array<{
    label: string;
    expression: string;
    isError: boolean;
    correction?: string;
    errorExpression?: string;
    surroundingText?: string;
  }>;

  if (!markedExpressions || !Array.isArray(markedExpressions)) {
    return { success: false, data: ai, warnings, error: "Missing markedExpressions field" };
  }

  const replacements: Replacement[] = [];

  for (const me of markedExpressions) {
    const found = findExpressionInPassage(passage, me.expression, me.surroundingText);
    if (!found) {
      warnings.push(`Expression not found for label ${me.label}: "${me.expression}"`);
      continue;
    }

    let newText: string;
    if (me.isError && me.errorExpression) {
      // Replace with error expression wrapped in marker
      const sanitized = sanitizeExpressionForMarker(me.errorExpression);
      newText = `__${me.label} ${sanitized}__`;
    } else if (me.isError) {
      // isError but no separate errorExpression — use the expression itself
      const sanitized = sanitizeExpressionForMarker(me.expression);
      newText = `__${me.label} ${sanitized}__`;
    } else {
      // Correct expression — just wrap
      const sanitized = sanitizeExpressionForMarker(me.expression);
      newText = `__${me.label} ${sanitized}__`;
    }

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });
  }

  if (replacements.length === 0 && markedExpressions.length > 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Could not locate any marked expressions in the passage",
    };
  }

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);

  return {
    success: true,
    data: {
      ...ai,
      passageWithMarkers,
    },
    warnings,
  };
}
