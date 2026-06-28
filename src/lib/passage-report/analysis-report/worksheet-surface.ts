import type { LearningWorksheetSection } from "./schema";

type WorkbookSet = NonNullable<LearningWorksheetSection["workbookSet"]>;
type VocabularyBlank = WorkbookSet["vocabularyCloze"]["blanks"][number];
export type WorksheetWordOrder = WorkbookSet["wordOrders"][number];
type DrillWordOrder = NonNullable<NonNullable<LearningWorksheetSection["drills"]>["wordOrders"]>[number];
type WorksheetWordBankItem = { answers: readonly string[] };

const LETTER_RE = /[A-Za-z]/;

export function worksheetAnswersAreHidden(section: LearningWorksheetSection): boolean {
  return section.hiddenAnswers === true;
}

export function worksheetClozeTranslationsAreHidden(section: LearningWorksheetSection): boolean {
  return section.hiddenClozeTranslations === true;
}

export function vocabularyBlankToken(no: number): string {
  return `(${no}) __________`;
}

export function normalizeStudentFacingMarkup(value: string): string {
  return decodeBasicHtmlEntities(
    value
      .replace(/<span\b(?=[^>]*text-decoration\s*:\s*underline)[^>]*>([\s\S]*?)<\/span>/gi, (_match, inner: string) => `__${stripInlineHtml(inner).trim()}__`)
      .replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, (_match, inner: string) => `__${stripInlineHtml(inner).trim()}__`)
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/__\s+/g, "__")
      .replace(/\s+__/g, "__"),
  );
}

/**
 * 요약문 완성(객관식) 유형인지 판별한다.
 * 추론 세트는 type="summary"(typeLabel="요약문 완성"), 워크북 본 문제는 type="요약" 등으로 들어온다.
 */
export function isSummaryPairWorksheetType(type?: string, typeLabel?: string): boolean {
  return /요약|summary/i.test(`${type ?? ""} ${typeLabel ?? ""}`);
}

/**
 * 요약문 완성 선택지/정답 텍스트를 항상 "(A) … — (B) …" 형태로 정규화한다.
 *
 * AI가 "(A) detrimental — rest"처럼 (A)만 라벨링하고 (B)를 빠뜨리는 경우가 있어
 * 학생용 시험지에서 두 번째 칸 라벨이 사라지던 버그를 렌더 직전에 바로잡는다.
 * - 이미 (A)/(B) 라벨이 모두 있으면 그대로 둔다.
 * - 두 칸으로 나눌 수 없으면(구분자 없음 등) 원문을 유지한다(오작동 방지).
 *
 * 단어 하이픈(self-reflection)을 깨지 않도록 단일 하이픈(-)으로는 절대 나누지 않고,
 * em/en 대시·말줄임표·슬래시·명시적 (B) 라벨만 칸 구분자로 본다.
 */
export function formatSummaryPairText(text: string): string {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return text;
  // (A)·(B) 라벨이 모두 있으면 손대지 않는다.
  if (/\(\s*A\s*\)/i.test(raw) && /\(\s*B\s*\)/i.test(raw)) return raw;

  const stripped = raw.replace(/^\(\s*A\s*\)\s*/i, "");
  const parts = stripped
    .split(/\s*(?:…+|\.{2,}|\(\s*B\s*\)|[—–]|\/)\s*/)
    .map((part) => part.replace(/^\(\s*[AB]\s*\)\s*/i, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return raw;

  const blankA = parts[0];
  const blankB = parts.slice(1).join(" ");
  return `(A) ${blankA} — (B) ${blankB}`;
}

export function studentFacingMarkupIssues(value: string, label: string): string[] {
  const issues: string[] = [];
  if (/<\/?[a-z][^>]*>/i.test(value)) {
    issues.push(`${label}: HTML tag leaked into student-facing text`);
  }
  if (/\bstyle\s*=/i.test(value)) {
    issues.push(`${label}: inline HTML style leaked into student-facing text`);
  }
  return issues;
}

export function toStudentVocabularyClozePassage(passage: string, blanks: VocabularyBlank[]): string {
  let output = passage;
  const ordered = [...blanks].sort((a, b) => b.answer.length - a.answer.length);

  for (const blank of ordered) {
    const answer = blank.answer.trim();
    if (!answer) continue;

    const marker = markerPattern(blank.no);
    const answerRe = answerPattern(answer);
    const token = vocabularyBlankToken(blank.no);
    let touched = false;

    ({ text: output, touched } = replaceTracked(
      output,
      new RegExp(`\\[\\s*${answerRe}\\s*\\]\\s*${marker}`, "giu"),
      token,
      touched,
    ));
    ({ text: output, touched } = replaceTracked(
      output,
      new RegExp(`${marker}\\s*\\[\\s*${answerRe}\\s*\\]`, "giu"),
      token,
      touched,
    ));
    ({ text: output, touched } = replaceTracked(
      output,
      new RegExp(`(^|[^A-Za-z])${answerRe}\\s*${marker}`, "giu"),
      (...args) => `${String(args[1] ?? "")}${token}`,
      touched,
    ));
    ({ text: output, touched } = replaceTracked(
      output,
      new RegExp(`${marker}\\s*${answerRe}($|[^A-Za-z])`, "giu"),
      (...args) => `${token}${String(args[1] ?? "")}`,
      touched,
    ));
    ({ text: output, touched } = replaceTracked(
      output,
      new RegExp(`\\[\\s*${answerRe}\\s*\\]`, "giu"),
      token,
      touched,
    ));

    if (!touched && !hasVocabularyBlankForNo(output, blank.no)) {
      output = output.replace(
        new RegExp(`(^|[^A-Za-z])${answerRe}($|[^A-Za-z])`, "iu"),
        (...args) => `${String(args[1] ?? "")}${token}${String(args[2] ?? "")}`,
      );
    }
  }

  return output;
}

export function vocabularyClozeSurfaceIssues(passage: string, blanks: VocabularyBlank[]): string[] {
  const studentPassage = toStudentVocabularyClozePassage(passage, blanks);
  const issues: string[] = [];

  for (const blank of blanks) {
    if (!hasVocabularyBlankForNo(studentPassage, blank.no)) {
      issues.push(`vocabulary cloze ${blank.no}: missing visible blank marker`);
    }
    if (answerIsAdjacentToMarker(studentPassage, blank)) {
      issues.push(`vocabulary cloze ${blank.no}: answer is still printed next to the marker`);
    }
  }

  return issues;
}

export function toStudentWorksheetWordBank(
  words: readonly string[] | undefined,
  items: readonly WorksheetWordBankItem[] | undefined,
): string[] | undefined {
  const cleaned = cleanWordBankWords(words);
  if (cleaned.length === 0) return undefined;

  const answerOrder = wordBankAnswerOrder(items);
  if (!wordBankFollowsAnswerOrder(cleaned, answerOrder)) return cleaned;

  return stableScrambleWordBank(cleaned, answerOrder);
}

export function worksheetWordBankSurfaceIssues(
  label: string,
  words: readonly string[] | undefined,
  items: readonly WorksheetWordBankItem[] | undefined,
): string[] {
  const studentWords = toStudentWorksheetWordBank(words, items) ?? [];
  const answerOrder = wordBankAnswerOrder(items);
  if (!wordBankFollowsAnswerOrder(studentWords, answerOrder)) return [];
  return [`${label}: word bank still follows answer order`];
}

export function wordBankFollowsAnswerOrder(words: readonly string[], answerOrder: readonly string[]): boolean {
  const answers = answerOrder.map(normalizeWordBankEntry).filter(Boolean);
  const bankEntries = words.map(normalizeWordBankEntry).filter(Boolean);
  if (answers.length < 2 || bankEntries.length < 2) return false;

  const usedAnswerIndexes = new Set<number>();
  const matchedPositions: number[] = [];

  for (const entry of bankEntries) {
    const position = answers.findIndex((answer, index) => !usedAnswerIndexes.has(index) && answer === entry);
    if (position < 0) continue;
    usedAnswerIndexes.add(position);
    matchedPositions.push(position);
  }

  if (matchedPositions.length < 2) return false;
  return matchedPositions.every((position, index) => index === 0 || position > matchedPositions[index - 1]);
}

export function getConsolidatedWordOrders(section: LearningWorksheetSection): WorksheetWordOrder[] {
  return consolidateWordOrders(section.workbookSet?.wordOrders ?? [], section.drills?.wordOrders ?? []);
}

export function consolidateWordOrders(
  primary: readonly WorksheetWordOrder[],
  secondary: readonly DrillWordOrder[],
): WorksheetWordOrder[] {
  const seen = new Set<string>();
  const out: WorksheetWordOrder[] = [];

  for (const item of [...primary, ...secondary]) {
    const key = normalizeSentence(item.answer) || normalizeSentence(`${item.korean} ${item.answer}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      no: out.length + 1,
      korean: item.korean,
      chunks: scrambleWordOrderChunks(item.chunks, item.answer),
      answer: item.answer,
    });
  }

  return out;
}

export function scrambleWordOrderChunks(chunks: readonly string[], answer: string): string[] {
  if (chunks.length <= 1) return [...chunks];
  const odd = chunks.filter((_, index) => index % 2 === 1);
  const even = chunks.filter((_, index) => index % 2 === 0);
  let scrambled = [...odd, ...even];

  if (normalizeSentence(scrambled.join(" ")) === normalizeSentence(answer)) {
    scrambled = [...chunks].reverse();
  }
  if (normalizeSentence(scrambled.join(" ")) === normalizeSentence(answer) && chunks.length >= 3) {
    scrambled = [chunks[1], ...chunks.slice(2), chunks[0]];
  }

  return scrambled.map((chunk) => chunk.trim()).filter(Boolean);
}

export function wordOrderItemIssues(item: Pick<WorksheetWordOrder, "no" | "chunks" | "answer">): string[] {
  const issues: string[] = [];
  if (item.chunks.length < 4) issues.push(`word order ${item.no}: too few chunks`);
  if (item.answer.trim().split(/\s+/).length < 6) issues.push(`word order ${item.no}: answer sentence is too short`);
  if (normalizeSentence(item.chunks.join(" ")) === normalizeSentence(item.answer)) {
    issues.push(`word order ${item.no}: chunks are still in answer order`);
  }
  if (item.chunks.some((chunk) => !LETTER_RE.test(chunk))) {
    issues.push(`word order ${item.no}: punctuation-only chunk exists`);
  }
  if (!sameTokenBag(item.chunks.join(" "), item.answer)) {
    issues.push(`word order ${item.no}: chunks do not reconstruct the answer`);
  }
  return issues;
}

function replaceTracked(
  input: string,
  pattern: RegExp,
  replacement: string | ((...args: unknown[]) => string),
  alreadyTouched: boolean,
): { text: string; touched: boolean } {
  let touched = alreadyTouched;
  const text = input.replace(pattern, (...args) => {
    touched = true;
    return typeof replacement === "string" ? replacement : replacement(...args);
  });
  return { text, touched };
}

function markerPattern(no: number): string {
  const circled = no >= 1 && no <= 20 ? escapeRegExp(String.fromCodePoint(0x2460 + no - 1)) : "";
  const plain = String(no);
  return `(?:${circled ? `${circled}|` : ""}\\(\\s*${plain}\\s*\\)|\\[\\s*${plain}\\s*\\]|${plain})`;
}

function hasVocabularyBlankForNo(passage: string, no: number): boolean {
  const marker = markerPattern(no);
  return new RegExp(`${marker}\\s*[_＿]{3,}|[_＿]{3,}\\s*${marker}`, "u").test(passage);
}

function answerIsAdjacentToMarker(passage: string, blank: VocabularyBlank): boolean {
  const answer = blank.answer.trim();
  if (!answer) return false;
  const marker = markerPattern(blank.no);
  const answerRe = answerPattern(answer);
  return (
    new RegExp(`\\[?\\s*${answerRe}\\s*\\]?\\s*${marker}`, "iu").test(passage) ||
    new RegExp(`${marker}\\s*\\[?\\s*${answerRe}\\s*\\]?`, "iu").test(passage)
  );
}

function answerPattern(answer: string): string {
  return answer.split(/\s+/).map(escapeRegExp).join("\\s+");
}

function normalizeSentence(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/["'`.,!?;:()[\]{}<>]/g, "")
    .replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function sameTokenBag(a: string, b: string): boolean {
  const ax = tokenCounts(tokenize(a));
  const bx = tokenCounts(tokenize(b));
  if (ax.size !== bx.size) return false;
  for (const [token, count] of ax) {
    if (bx.get(token) !== count) return false;
  }
  return true;
}

function tokenCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function cleanWordBankWords(words: readonly string[] | undefined): string[] {
  return (words ?? []).map((word) => word.trim()).filter(Boolean);
}

function wordBankAnswerOrder(items: readonly WorksheetWordBankItem[] | undefined): string[] {
  return (items ?? []).flatMap((item) => item.answers).map((answer) => answer.trim()).filter(Boolean);
}

function stableScrambleWordBank(words: readonly string[], answerOrder: readonly string[]): string[] {
  if (words.length <= 1) return [...words];
  const seedText = answerOrder.map(normalizeWordBankEntry).filter(Boolean).join("|") || words.join("|");
  const seed = stableHash(seedText);
  let output = [...words].sort((a, b) => {
    const aNorm = normalizeWordBankEntry(a);
    const bNorm = normalizeWordBankEntry(b);
    const aHash = stableHash(`${seed}|${aNorm}|${a}`);
    const bHash = stableHash(`${seed}|${bNorm}|${b}`);
    return aHash - bHash || aNorm.localeCompare(bNorm) || a.localeCompare(b);
  });

  if (wordBankFollowsAnswerOrder(output, answerOrder)) {
    const offset = (seed % (output.length - 1)) + 1;
    output = [...output.slice(offset), ...output.slice(0, offset)];
  }
  if (wordBankFollowsAnswerOrder(output, answerOrder)) {
    output = [...output].reverse();
  }
  if (wordBankFollowsAnswerOrder(output, answerOrder)) {
    output = [output[output.length - 1], ...output.slice(1, -1), output[0]];
  }

  return output;
}

function normalizeWordBankEntry(value: string): string {
  return normalizeSentence(value);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stripInlineHtml(value: string): string {
  return decodeBasicHtmlEntities(value.replace(/<\/?[a-z][^>]*>/gi, ""));
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
