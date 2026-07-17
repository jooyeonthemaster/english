import { splitPassageSentences } from "@/lib/passage-sentence-utils";

export interface PassageIntegrityFinding {
  code:
    | "passage-boundary-spacing-corruption"
    | "passage-duplicate-sentence"
    | "passage-joined-sentence-token";
  message: string;
}

function compactEvidence(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

function normalizeSentenceForDuplicateCheck(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”‘’"'()[\]{}]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenAround(text: string, index: number): string {
  const leftSpace = text.lastIndexOf(" ", index);
  const rightSpace = text.indexOf(" ", index);
  return text.slice(leftSpace + 1, rightSpace < 0 ? text.length : rightSpace);
}

/**
 * Source-passage preflight for corruption that no question-generation retry can
 * repair. Keep the detector deliberately narrow: missing whitespace at a
 * sentence boundary, an exact repeated non-trivial sentence, or a common
 * sentence-start token glued to the previous word.
 */
export function analyzeEnglishPassageIntegrity(
  passage: string,
): PassageIntegrityFinding[] {
  const text = passage.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const findings: PassageIntegrityFinding[] = [];

  const boundaryEvidence: string[] = [];
  for (const match of text.matchAll(/([A-Za-z]{2,})([.!?])(?=[A-Za-z])/g)) {
    const index = match.index ?? 0;
    const token = tokenAround(text, index);
    if (/^(?:https?:\/\/|www\.)/i.test(token) || token.includes("@")) continue;
    // Preserve conventional degree abbreviations such as Ph.D.; other
    // no-space letter-to-letter boundaries are malformed in prose.
    if (match[1].toLowerCase() === "ph" && match[2] === ".") continue;
    boundaryEvidence.push(
      compactEvidence(text.slice(Math.max(0, index - 28), index + match[0].length + 32)),
    );
    if (boundaryEvidence.length >= 3) break;
  }
  if (boundaryEvidence.length > 0) {
    findings.push({
      code: "passage-boundary-spacing-corruption",
      message:
        `Source passage has a punctuation boundary with no following space, which can merge or truncate sentences: ${boundaryEvidence.join(" | ")}.`,
    });
  }

  const seenSentences = new Map<string, string>();
  let duplicateSentence = "";
  for (const sentence of splitPassageSentences(text)) {
    const comparable = normalizeSentenceForDuplicateCheck(sentence);
    if (comparable.length < 40 || comparable.split(" ").length < 7) continue;
    const first = seenSentences.get(comparable);
    if (first) {
      duplicateSentence = first;
      break;
    }
    seenSentences.set(comparable, compactEvidence(sentence));
  }
  if (duplicateSentence) {
    findings.push({
      code: "passage-duplicate-sentence",
      message: `Source passage repeats the same non-trivial sentence: ${duplicateSentence}.`,
    });
  }

  // 접합된 문장 시작어("...final beatThe pattern...")는 대문자 토큰이 "단어로 끝나야"
  // 한다 — 뒤가 또 문자면(BeatTheDrum 류 고유명 camelCase) 오히려 제외한다.
  // (26-07-17 수정: 기존 (?=[A-Za-z]) 는 조건이 반대로 걸려 실제 접합 손상을 전부
  // 놓쳤다 — jul16 회귀 테스트가 실행 불가 상태로 잠들어 있어 발견이 늦었다.)
  const joinedStart = /\b([a-z]{3,})(However|Therefore|Moreover|Furthermore|Meanwhile|People|These|Those|This|The|They|He|She|It|We|An|A)(?![A-Za-z])/g;
  const joinedEvidence: string[] = [];
  for (const match of text.matchAll(joinedStart)) {
    const index = match.index ?? 0;
    joinedEvidence.push(
      compactEvidence(text.slice(Math.max(0, index - 24), index + match[0].length + 28)),
    );
    if (joinedEvidence.length >= 3) break;
  }
  if (joinedEvidence.length > 0) {
    findings.push({
      code: "passage-joined-sentence-token",
      message:
        `Source passage appears to glue a sentence-start word to the preceding token: ${joinedEvidence.join(" | ")}.`,
    });
  }

  return findings;
}
