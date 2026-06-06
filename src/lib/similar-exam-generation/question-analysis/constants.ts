export const DOCAI_OCR_TIMEOUT_MS = 60_000;

export const ANALYSIS_TIMEOUT_MS = 180_000;
export const ANALYSIS_MAX_RETRIES = 2;

export const DOCAI_HYBRID_OCR_HEADER = [
  "## Document AI OCR reference",
  "The text below was extracted from the same exam image.",
  "Use it as a reading aid for printed passages and options.",
  "Prefer the attached image when deciding layout, handwriting, circled answers, X marks, underlines, answer boxes, question grouping, and option grouping.",
  "If the OCR text and image disagree, trust the image and record uncertainty in extractionNotes.",
].join("\n");
