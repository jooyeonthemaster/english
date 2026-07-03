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

// ─── 원문 생략 방지 (실전 학습지 어휘빈칸·어법선택 본문) ──────────────────────
// 문제: workbookSet.vocabularyCloze.passage / grammarSelection.passage 는 AI 자유생성(z.string)
// 본문이라, 모델이 원문 문장을 통째로 빠뜨리거나(원문 생략) 바꿔 쓰는 일이 있다. 권위 있는 원문
// 문장 배열과 대조해 빠진 원문 문장만 제자리에 '원문 그대로' 복원한다.
//  - 누락이 0이면 입력 문자열을 그대로 반환(무회귀 — 정상 본문은 절대 건드리지 않는다).
//  - AI 문장은 절대 버리거나 재배열하지 않는다(빈칸/선택지 보존). 빠진 원문만 '추가'한다.

// 원문 문장이 '존재'로 인정되려면 내용 토큰의 절반 이상이 본문에 있어야 한다(빈칸/선택지로 빠진 단어 감안).
const CLOZE_COVERAGE_THRESHOLD = 0.5;

/** 문장 경계로 분할(위치 추정 전용 — 누락 검출은 전역 토큰으로 한다).
 *  종결부호(.!?) 뒤 공백에서 끊는다. 다음 글자 종류를 제한하지 않아 숫자/소문자로 시작하는 문장도 안전하게 끊긴다.
 *  (약어로 과분할돼도 AI 문장은 절대 버리지 않으므로 무해) */
function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 매칭용 내용 토큰 — 빈칸 (N)____ 는 제거, 선택지 [A / B] 는 '옵션 단어를 살려' 추출하고 남은 밑줄 제거,
 *  소문자 단어(3+글자)만. 선택형 본문의 [A / B] 는 '원문 단어가 선택지 형태로 남아 있는 것'이므로 통째로
 *  버리면(과거 동작) 원문 대부분이 브래킷에 든 축약 문장을 '누락'으로 오판해, 정답이 평문으로 든 원문 문장을
 *  재주입(정답 누출)하게 된다. 옵션 단어를 present 토큰으로 살려 이 오탐을 없앤다. (빈칸형 커버리지는 브래킷이
 *  없어 영향 없음. 실제 누락 문장은 옵션에도 없으므로 검출은 그대로 유지 = 무회귀.) */
function clozeContentTokens(text: string): string[] {
  const stripped = text
    .replace(/\(\s*\d+\s*\)\s*[_＿]+/g, " ")
    .replace(/\[([^\][]*)\]/g, (_m, inner: string) => ` ${inner.replace(/\//g, " ")} `)
    .replace(/[_＿]{2,}/g, " ");
  return tokenize(stripped).filter((w) => w.length >= 3);
}

/** 토큰 다중집합(토큰→개수). */
function toBag(tokens: readonly string[]): Map<string, number> {
  const bag = new Map<string, number>();
  for (const t of tokens) bag.set(t, (bag.get(t) ?? 0) + 1);
  return bag;
}

/**
 * AI 본문 '전체' 토큰 집합(비소비)에서 각 원문 문장의 토큰이 충분히 존재하는지로 누락을 판정한다.
 * 문장 분할/1:1 매칭에 의존하지 않으므로 (1) AI가 두 원문을 한 문장으로 합치거나 (2) 문장이 숫자/소문자로
 * 시작하거나 (3) 근접 중복/보일러플레이트 문장이 있어도, '본문에 실제로 존재하는 문장을 누락으로 오판하지
 * 않는다'. → 복원은 항상 가산만(present 문장을 절대 중복 복제하지 않음 = AI 출력보다 나빠질 수 없음).
 * 대가: 다른 문장과 핵심어를 대부분 공유하는 '근접 중복' 문장이 진짜 빠진 경우는 놓칠 수 있다(부패 없음, AI
 * 출력 그대로 = 무회귀). 실제 지문(서로 다른 내용어)은 모두 정확히 검출된다. 반환: 누락된 원문 인덱스 Set.
 */
function uncoveredOriginalSet(clozePassage: string, origs: readonly string[]): Set<number> {
  const present = new Set(clozeContentTokens(clozePassage)); // 비소비: 본문에 존재하는 토큰 집합
  const missing = new Set<number>();
  origs.forEach((orig, i) => {
    const ot = clozeContentTokens(orig);
    if (ot.length === 0) return; // 토큰 없는 초단문은 커버로 간주
    let hit = 0;
    for (const t of ot) if (present.has(t)) hit += 1;
    if (hit / ot.length < CLOZE_COVERAGE_THRESHOLD) missing.add(i);
  });
  return missing;
}

/** 원문 문장이 가장 잘 들어있는 AI 문장 인덱스(복원 위치 추정용, many-to-one 허용 — used set 없음). 없으면 -1. */
function bestAiSentence(ot: readonly string[], aiTokens: readonly string[][]): number {
  if (ot.length === 0) return -1;
  let best = -1;
  let bestScore = 0.3; // 위치 추정이므로 느슨하게
  aiTokens.forEach((at, i) => {
    const bag = toBag(at);
    let hit = 0;
    for (const t of ot) {
      const c = bag.get(t) ?? 0;
      if (c > 0) {
        hit += 1;
        bag.set(t, c - 1);
      }
    }
    const score = hit / ot.length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/**
 * AI cloze 본문에서 '실제로 누락된' 원문 문장만 제자리에 복원한다(원문 생략 방지).
 * - 누락이 없으면 입력을 그대로 반환(무회귀).
 * - 검출은 전역 토큰 소비라 merge/숫자시작/근접중복에 강건 → 거짓양성으로 인한 중복 주입이 없다.
 * - 위치는 '직전에 커버된 원문이 들어있는 AI 문장' 뒤(시작부 누락은 맨 앞). AI 문장은 절대 버리지 않는다.
 */
export function restoreClozePassageOriginal(clozePassage: string, originalSentences: readonly string[]): string {
  const origs = originalSentences.map((s) => s.trim()).filter(Boolean);
  if (origs.length === 0 || !clozePassage.trim()) return clozePassage;
  const missing = uncoveredOriginalSet(clozePassage, origs);
  if (missing.size === 0) return clozePassage; // 누락 0 → 무회귀

  const aiSents = splitIntoSentences(clozePassage);
  const aiTokens = aiSents.map(clozeContentTokens);
  const insertAfter = new Map<number, string[]>();
  const beforeFirst: string[] = [];
  let lastAi = -1;
  origs.forEach((orig, i) => {
    if (!missing.has(i)) {
      const ai = bestAiSentence(clozeContentTokens(orig), aiTokens);
      if (ai > lastAi) lastAi = ai;
      return;
    }
    if (lastAi < 0) beforeFirst.push(orig);
    else {
      const arr = insertAfter.get(lastAi) ?? [];
      arr.push(orig);
      insertAfter.set(lastAi, arr);
    }
  });

  const parts: string[] = [...beforeFirst];
  aiSents.forEach((sentence, ai) => {
    parts.push(sentence);
    const extra = insertAfter.get(ai);
    if (extra) parts.push(...extra);
  });
  return parts.join(" ");
}

/** 원문 문장 중 cloze 본문에서 누락된 것(1-based 번호) 목록. 없으면 빈 배열. */
export function clozePassageCoverageIssues(label: string, clozePassage: string, originalSentences: readonly string[]): string[] {
  const origs = originalSentences.map((s) => s.trim()).filter(Boolean);
  if (origs.length === 0) return [];
  const missing = uncoveredOriginalSet(clozePassage, origs);
  if (missing.size === 0) return [];
  const nos = [...missing].map((i) => i + 1).sort((a, b) => a - b);
  return [`${label}: 원문 문장 ${nos.join(", ")}번이 누락되었습니다(원문 생략).`];
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
