/**
 * The commit payload's `examType` uses a broad enum for flexibility; Exam.examType
 * historically accepted only MIDTERM | FINAL | QUIZ | MOCK. Map any new values
 * conservatively so the column stays semantically clean.
 */
export function mapExamType(input?: string): string | undefined {
  if (!input) return undefined;
  switch (input) {
    case "MIDTERM":
    case "FINAL":
    case "MOCK":
      return input;
    case "SUNEUNG":
    case "DIAGNOSTIC":
    case "EBS":
      return "MOCK";
    case "PRIVATE":
      return "QUIZ";
    default:
      return undefined;
  }
}
